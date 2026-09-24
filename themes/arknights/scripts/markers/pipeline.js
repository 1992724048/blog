'use strict'

const { scanMarkers } = require('./lexer')
const { parseMarker } = require('./parser')
const { createTokenStore } = require('./token')
const { createRegistry } = require('./registry')
const { aiHandler } = require('./handlers/ai')
const { projectsHandler } = require('./handlers/projects')
const { restoreRawHtmlTokens } = require('./raw-html')
const { createSentinelContext, stripInternalSentinels } = require('./sentinel')

const SOURCE_FIELDS = Object.freeze(['content', 'excerpt', 'more'])
const HTML_TEXT_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
})
const MORE_PATTERN = /<!--\s*more\s*-->|<span\b[^>]*\bid=["']more["'][^>]*>\s*<\/span>/i

function escapeHtmlText(value) {
  return value.replace(/[&<>]/g, character => HTML_TEXT_ENTITIES[character])
}

function isDataObject(data) {
  return data !== null && typeof data === 'object'
}

function isEncrypted(data) {
  try {
    const encrypt = data.encrypt
    const password = data.password
    return Boolean(encrypt) ||
      (password !== undefined && password !== null && password !== '')
  } catch {
    return true
  }
}

function collectSourceFields(data) {
  const fields = []
  for (const field of SOURCE_FIELDS) {
    let value
    try {
      value = data[field]
    } catch {
      continue
    }
    if (typeof value === 'string') {
      fields.push({ field, source: value, explicit: field !== 'content' })
    }
  }
  return fields
}

function createContext(data, sourceField, mode) {
  try {
    return Object.freeze({
      mode,
      type: data.type ?? null,
      encrypt: Boolean(data.encrypt),
      password: data.password ?? null,
      sourceField,
      sourcePath: data.path ?? data.source ?? null
    })
  } catch {
    return null
  }
}

function tokenizeField(source, store) {
  const scan = scanMarkers(source)
  const tokens = []
  for (const marker of scan.markers) {
    const token = store.issue({ raw: marker.raw, mode: marker.mode })
    tokens.push({ token, raw: marker.raw, mode: marker.mode })
  }

  let transformed = source
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const marker = scan.markers[index]
    transformed = transformed.slice(0, marker.start) + tokens[index].token + transformed.slice(marker.end)
  }
  return { transformed, tokens }
}

function createTokenizedFields(fields, tokenStoreFactory) {
  const occupiedText = fields.map(field => field.source).join('\u0000')
  const store = tokenStoreFactory({ occupiedText })
  const transformedFields = []
  const tokenInfo = new Map()

  for (const field of fields) {
    const result = tokenizeField(field.source, store)
    transformedFields.push({
      field: field.field,
      value: result.transformed,
      explicit: field.explicit
    })
    for (const token of result.tokens) {
      tokenInfo.set(token.token, {
        field: field.field,
        raw: token.raw,
        mode: token.mode
      })
    }
  }

  return { store, transformedFields, tokenInfo }
}

function makeFailure(raw) {
  const safeRaw = typeof raw === 'string' ? raw : ''
  const escaped = escapeHtmlText(safeRaw)
  return {
    html: escaped,
    projection: escaped,
    blockProject: false
  }
}

function prepareOccurrence(occurrence, state, data, field, registry) {
  const record = occurrence.record
  const tokenInfo = state.tokenInfo.get(occurrence.token)
  if (tokenInfo !== undefined && tokenInfo.field !== field) {
    return makeFailure(record.raw)
  }
  const expectedMode = tokenInfo === undefined ? record.mode : tokenInfo.mode
  let decoded = null
  try {
    decoded = state.store.decode(occurrence.token, expectedMode)
  } catch {
    return makeFailure(record.raw)
  }
  if (decoded === null) {
    return makeFailure(record.raw)
  }

  let parsed = null
  try {
    parsed = parseMarker(decoded.raw, decoded.mode)
  } catch {
    return makeFailure(decoded.raw)
  }
  if (parsed === null || parsed.ok !== true) {
    return makeFailure(decoded.raw)
  }

  try {
    state.store.attachParsed(occurrence.token, {
      name: parsed.marker.name,
      args: parsed.marker.args
    })
  } catch {
    return makeFailure(decoded.raw)
  }

  const context = createContext(data, field, decoded.mode)
  if (context === null) {
    return makeFailure(decoded.raw)
  }

  let dispatched = null
  try {
    dispatched = registry.dispatch(parsed.marker.name, parsed.marker.args, context)
  } catch {
    return makeFailure(decoded.raw)
  }
  if (
    dispatched === null ||
    dispatched.ok !== true ||
    dispatched.handler === null ||
    dispatched.handler === undefined
  ) {
    return makeFailure(decoded.raw)
  }

  let rendered = null
  let plainText = null
  try {
    rendered = dispatched.handler.render(dispatched.node, context)
    plainText = dispatched.handler.toPlainText(dispatched.node)
  } catch {
    return makeFailure(decoded.raw)
  }
  if (typeof rendered !== 'string' || typeof plainText !== 'string') {
    return makeFailure(decoded.raw)
  }

  return {
    html: rendered,
    projection: escapeHtmlText(plainText),
    blockProject: parsed.marker.name === 'PJ' &&
      parsed.marker.mode === 'block' &&
      dispatched.node !== null &&
      typeof dispatched.node === 'object' &&
      dispatched.node.markerName === 'PJ'
  }
}

function applyOccurrences(value, occurrences, replacements) {
  let result = value
  for (let index = occurrences.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrences[index]
    const replacement = replacements[index]
    result = result.slice(0, occurrence.start) + replacement + result.slice(occurrence.end)
  }
  return result
}

function isGridSeparator(value) {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/\n[ \t]*\n/.test(normalized) || /<br\b[^>]*>[ \t\r\n]*<br\b[^>]*>/i.test(value)) {
    return false
  }
  return /^(?:[ \t\n]|<br\b[^>]*>)*$/i.test(normalized)
}

function renderCardGroup(ids, cardContents, projectionOnly, sentinelContext) {
  const contents = ids.map(id => cardContents.get(id))
  if (contents.some(content => typeof content !== 'string' || content === '')) {
    return null
  }
  const inner = contents.join('\n')
  if (projectionOnly) {
    return inner
  }
  const sentinels = sentinelContext.createGridSentinels(ids[0], inner)
  return `${sentinels.open}${inner}${sentinels.close}`
}

function composeCardGroups(value, cardContents, projectionOnly, sentinelContext) {
  const matches = sentinelContext.findCardSentinels(value)
  if (matches.length === 0) {
    return value
  }

  let output = ''
  let cursor = 0
  let groupStart = -1
  let groupEnd = -1
  let groupIds = []
  let failed = false

  const flushGroup = () => {
    if (groupStart < 0) {
      return
    }
    const rendered = renderCardGroup(groupIds, cardContents, projectionOnly, sentinelContext)
    if (rendered === null) {
      failed = true
      return
    }
    output += value.slice(cursor, groupStart)
    output += rendered
    cursor = groupEnd
    groupStart = -1
    groupEnd = -1
    groupIds = []
  }

  for (const match of matches) {
    const start = match.index
    const end = start + match[0].length
    const id = match[1]
    if (groupStart < 0) {
      groupStart = start
      groupEnd = end
      groupIds = [id]
      continue
    }

    const separator = value.slice(groupEnd, start)
    if (isGridSeparator(separator)) {
      groupIds.push(id)
      groupEnd = end
      continue
    }

    flushGroup()
    groupStart = start
    groupEnd = end
    groupIds = [id]
  }

  flushGroup()
  return failed ? value : output + value.slice(cursor)
}

function removeEdgeBreaks(value) {
  return value
    .replace(/^(?:[ \t\r\n]*<br\b[^>]*>[ \t\r\n]*)+/i, '')
    .replace(/(?:[ \t\r\n]*<br\b[^>]*>[ \t\r\n]*)+$/i, '')
}

function isCommentOnly(value) {
  return /^(?:<!--[\s\S]*?-->[ \t\r\n]*)+$/.test(value.trim())
}

function appendPlainParagraph(output, value) {
  const plainValue = removeEdgeBreaks(value).trim()
  if (plainValue === '') {
    return output
  }
  if (isCommentOnly(plainValue)) {
    return output + plainValue
  }
  return output + `<p>${plainValue}</p>`
}

function transformGridParagraph(inner, sentinelContext) {
  const matches = sentinelContext.findGridSentinels(inner)
  if (matches.length === 0) {
    return null
  }
  if (matches.some(match => match[2].trim() === '')) {
    return null
  }

  let output = ''
  let cursor = 0
  for (const match of matches) {
    output = appendPlainParagraph(output, inner.slice(cursor, match.index))
    output += `<div class="projects-grid">\n${match[2]}\n</div>`
    cursor = match.index + match[0].length
  }
  return appendPlainParagraph(output, inner.slice(cursor))
}

function unwrapGridParagraphs(value, sentinelContext) {
  return value.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (paragraph, inner) => {
    const transformed = transformGridParagraph(inner, sentinelContext)
    return transformed === null ? paragraph : transformed
  })
}

function unwrapStandaloneGridSentinels(value, sentinelContext) {
  const matches = sentinelContext.findGridSentinels(value)
  if (matches.length === 0) {
    return value
  }
  if (matches.some(match => match[2].trim() === '')) {
    return value
  }

  let output = ''
  let cursor = 0
  for (const match of matches) {
    output += value.slice(cursor, match.index)
    output += `<div class="projects-grid">\n${match[2]}\n</div>`
    cursor = match.index + match[0].length
  }
  return output + value.slice(cursor)
}

function restoreMangledTokens(value, tokenInfo) {
  let result = value
  for (const token of tokenInfo.keys()) {
    const mangled = token.replace(/---/g, '\u2014').replace(/--/g, '\u2013')
    if (mangled !== token) {
      result = result.split(mangled).join(token)
    }
  }
  return result
}

function stripOpaqueTokens(value) {
  return value.replace(/arknights-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}/g, '')
}

function restoreRemainingTokens(value, store) {
  let found
  try {
    found = store.findTokens(value)
  } catch {
    return stripOpaqueTokens(stripInternalSentinels(value))
  }
  let result = value
  for (let index = found.length - 1; index >= 0; index -= 1) {
    const occurrence = found[index]
    result = result.slice(0, occurrence.start) +
      escapeHtmlText(occurrence.record.raw) +
      result.slice(occurrence.end)
  }
  return stripInternalSentinels(result)
}

function finalizeMaterializedValue(value, sourceValue, store, sentinelContext) {
  const safeValue = sentinelContext.hasIssuedSentinel(value) ? sourceValue : value
  return restoreRemainingTokens(safeValue, store)
}

function materializeField(value, state, data, field, registry, sentinelContext) {
  let sourceValue
  let occurrences
  try {
    sourceValue = restoreMangledTokens(value, state.tokenInfo)
    sourceValue = restoreRawHtmlTokens(sourceValue, state.store)
    occurrences = state.store.findTokens(sourceValue)
  } catch {
    const fallback = stripOpaqueTokens(stripInternalSentinels(value))
    return { html: fallback, projection: fallback }
  }

  const htmlCards = new Map()
  const projectionCards = new Map()
  const replacements = []
  for (const occurrence of occurrences) {
    const replacement = prepareOccurrence(occurrence, state, data, field, registry)
    if (replacement.blockProject) {
      const card = sentinelContext.createCardSentinel(
        `${replacement.html}\n${replacement.projection}`
      )
      htmlCards.set(card.id, replacement.html)
      projectionCards.set(card.id, replacement.projection)
      replacement.html = card.sentinel
      replacement.projection = card.sentinel
    }
    replacements.push(replacement)
  }

  let html = applyOccurrences(sourceValue, occurrences, replacements.map(replacement => replacement.html))
  let projection = applyOccurrences(sourceValue, occurrences, replacements.map(replacement => replacement.projection))
  html = composeCardGroups(html, htmlCards, false, sentinelContext)
  html = unwrapGridParagraphs(html, sentinelContext)
  html = unwrapStandaloneGridSentinels(html, sentinelContext)
  projection = composeCardGroups(projection, projectionCards, true, sentinelContext)
  return {
    html: finalizeMaterializedValue(html, sourceValue, state.store, sentinelContext),
    projection: finalizeMaterializedValue(projection, sourceValue, state.store, sentinelContext)
  }
}

function completeProjection(projection, state) {
  if (typeof projection.content !== 'string') {
    return
  }

  if (!state.explicitFields.has('excerpt')) {
    const match = MORE_PATTERN.exec(projection.content)
    if (match === null) {
      projection.excerpt = ''
      if (!state.explicitFields.has('more')) {
        projection.more = projection.content
      }
    } else {
      projection.excerpt = projection.content.slice(0, match.index).trim()
      if (!state.explicitFields.has('more')) {
        projection.more = projection.content.slice(match.index + match[0].length).trim()
      }
    }
  } else if (!state.explicitFields.has('more')) {
    projection.more = projection.content
  }
}

function createMarkerPipeline(options = {}) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object')
  }

  const handlers = options.handlers ?? [aiHandler, projectsHandler]
  const tokenStoreFactory = options.tokenStoreFactory ?? createTokenStore
  if (!Array.isArray(handlers)) {
    throw new TypeError('handlers must be an array')
  }
  if (typeof tokenStoreFactory !== 'function') {
    throw new TypeError('tokenStoreFactory must be a function')
  }

  const registry = createRegistry()
  for (const handler of handlers) {
    registry.register(handler)
  }

  const renderStates = new WeakMap()
  const projectionStates = new WeakMap()

  const beforePostRender = data => {
    if (!isDataObject(data)) {
      return data
    }

    renderStates.delete(data)
    projectionStates.delete(data)
    if (isEncrypted(data)) {
      return data
    }

    const fields = collectSourceFields(data)
    if (fields.length === 0) {
      return data
    }

    let tokenized
    try {
      tokenized = createTokenizedFields(fields, tokenStoreFactory)
    } catch {
      return data
    }

    for (const field of tokenized.transformedFields) {
      data[field.field] = field.value
    }
    renderStates.set(data, {
      store: tokenized.store,
      fields: tokenized.transformedFields.map(field => field.field),
      explicitFields: new Set(
        tokenized.transformedFields.filter(field => field.explicit).map(field => field.field)
      ),
      tokenInfo: tokenized.tokenInfo
    })
    return data
  }

  const afterPostRender = data => {
    if (!isDataObject(data)) {
      return data
    }
    const state = renderStates.get(data)
    if (state === undefined) {
      return data
    }

    const projection = {
      content: null,
      excerpt: null,
      more: null
    }
    let occupiedText = ''
    for (const field of state.fields) {
      try {
        const value = data[field]
        if (typeof value === 'string') {
          occupiedText += `\u0000${value}`
        }
      } catch {
        continue
      }
    }
    const sentinelContext = createSentinelContext(occupiedText)

    for (const field of state.fields) {
      let value
      try {
        value = data[field]
      } catch {
        continue
      }
      if (typeof value !== 'string') {
        continue
      }
      try {
        const materialized = materializeField(value, state, data, field, registry, sentinelContext)
        data[field] = materialized.html
        projection[field] = materialized.projection
      } catch {
        const fallbackValue = restoreRemainingTokens(value, state.store)
        data[field] = fallbackValue
        projection[field] = fallbackValue
      }
    }

    renderStates.delete(data)
    completeProjection(projection, state)
    projectionStates.set(data, projection)
    return data
  }

  const projectText = (data, sourceField) => {
    if (!isDataObject(data) || !SOURCE_FIELDS.includes(sourceField)) {
      return null
    }
    const projection = projectionStates.get(data)
    if (projection === undefined || typeof projection[sourceField] !== 'string') {
      return null
    }
    return projection[sourceField]
  }

  return Object.freeze({ beforePostRender, afterPostRender, projectText })
}

const defaultPipeline = createMarkerPipeline({
  handlers: [aiHandler, projectsHandler],
  tokenStoreFactory: createTokenStore
})

function registerMarkerFilters(hexoContext, pipeline = defaultPipeline) {
  hexoContext.extend.filter.register('before_post_render', pipeline.beforePostRender, 4)
  hexoContext.extend.filter.register('after_post_render', pipeline.afterPostRender, 9)
}

const beforePostRender = defaultPipeline.beforePostRender
const afterPostRender = defaultPipeline.afterPostRender
const projectText = defaultPipeline.projectText

module.exports = {
  createMarkerPipeline,
  defaultPipeline,
  registerMarkerFilters,
  beforePostRender,
  afterPostRender,
  projectText
}
