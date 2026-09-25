'use strict'

const { scanMarkers } = require('./lexer')
const { parseMarker } = require('./parser')
const { createTokenStore } = require('./token')
const { createRegistry } = require('./registry')
const { aiHandler } = require('./handlers/ai')
const { projectsHandler } = require('./handlers/projects')
const { createSentinelContext } = require('./sentinel')
const {
  CARRIER_SYMBOL,
  createRenderCarrier,
  attachCarrierBridge,
  restoreCarrierBridge,
  restoreCarrierBridgeFromData
} = require('./carrier')
const { installMarkedExtension } = require('./marked-extension')

const SOURCE_FIELDS = Object.freeze(['content', 'excerpt'])
const HTML_TEXT_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
})
const MORE_PATTERN = /<!--\s*more\s*-->|<span\b[^>]*\bid=["']more["'][^>]*>\s*<\/span>/i
const INTERNAL_HANDLER_PATTERN =
  /data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-(?:open|close))-|\u0000/u
const CARRIER_WRAPPER_NAMESPACE_PATTERN = /data-arknights-carrier\b/giu
const CARRIER_WRAPPER_ATTRIBUTE_PATTERN =
  /data-arknights-carrier\s*=\s*(?:"([^"]*)"|'([^']*)')/giu

function escapeHtmlText(value) {
  return value.replace(/[&<>]/g, character => HTML_TEXT_ENTITIES[character])
}

function createFieldFallback(value) { return escapeHtmlText(value.replaceAll('\u0000', '\uFFFD')) }

function isDataObject(data) { return data !== null && typeof data === 'object' && !Array.isArray(data) }

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
  const content = data.content
  if (typeof content === 'string') {
    fields.push({ field: 'content', source: content, explicit: false })
  }
  if (Object.hasOwn(data, 'excerpt')) {
    const excerpt = data.excerpt
    if (typeof excerpt === 'string') {
      fields.push({ field: 'excerpt', source: excerpt, explicit: true })
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

  for (const field of fields) {
    const result = tokenizeField(field.source, store)
    transformedFields.push({
      field: field.field,
      value: result.transformed,
      explicit: field.explicit
    })
  }

  return { store, transformedFields }
}

function makeFailure(raw) {
  const safeRaw = typeof raw === 'string' ? raw : ''
  const escaped = escapeHtmlText(safeRaw)
  return {
    html: escaped,
    projection: escaped,
    blockProject: false,
    failed: true
  }
}

function prepareOccurrence(occurrence, state, data, field, registry) {
  const record = state.store.lookup(occurrence.token)
  if (record === null) {
    return makeFailure('')
  }
  let decoded = null
  try {
    decoded = state.store.decode(occurrence.token, occurrence.mode)
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
  if (INTERNAL_HANDLER_PATTERN.test(rendered) || INTERNAL_HANDLER_PATTERN.test(plainText)) {
    return makeFailure(decoded.raw)
  }

  return {
    html: rendered,
    projection: escapeHtmlText(plainText),
    blockProject: parsed.marker.name === 'PJ' &&
      parsed.marker.mode === 'block' &&
      dispatched.node !== null &&
      typeof dispatched.node === 'object' &&
      dispatched.node.markerName === 'PJ',
    failed: false
  }
}

function createCarrierWrapper(token) {
  return `<span data-arknights-carrier="${token}"></span>`
}

function countExactText(value, expected) {
  return value.split(expected).length - 1
}

function applyOccurrences(value, occurrences, replacements, tokenized) {
  if (occurrences.length !== replacements.length) {
    return null
  }
  let result = value
  for (let index = occurrences.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrences[index]
    const replacement = replacements[index]
    if (tokenized) {
      result = result.slice(0, occurrence.start) + replacement + result.slice(occurrence.end)
      continue
    }
    const wrapper = createCarrierWrapper(occurrence.token)
    let replacementCount = 0
    result = result.replace(wrapper, () => {
      replacementCount += 1
      return replacement
    })
    if (replacementCount !== 1) {
      return null
    }
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
    const start = match.start
    const end = match.end
    const id = match.id
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
  return value.replace(/^(?:[ \t\r\n]*<br\b[^>]*>[ \t\r\n]*)+/i, '')
    .replace(/(?:[ \t\r\n]*<br\b[^>]*>[ \t\r\n]*)+$/i, '')
}

function isCommentOnly(value) { return /^(?:<!--[\s\S]*?-->[ \t\r\n]*)+$/.test(value.trim()) }

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
  if (matches.some(match => match.content.trim() === '')) {
    return null
  }

  let output = ''
  let cursor = 0
  for (const match of matches) {
    output = appendPlainParagraph(output, inner.slice(cursor, match.start))
    output += `<div class="projects-grid">\n${match.content}\n</div>`
    cursor = match.end
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
  if (matches.some(match => match.content.trim() === '')) {
    return value
  }

  let output = ''
  let cursor = 0
  for (const match of matches) {
    output += value.slice(cursor, match.start)
    output += `<div class="projects-grid">\n${match.content}\n</div>`
    cursor = match.end
  }
  return output + value.slice(cursor)
}

function auditMaterializationInput(value, state, field, actionableOccurrences) {
  let renderedOccurrences
  try {
    renderedOccurrences = state.store.findOccurrences(value, field)
  } catch {
    return null
  }
  if (
    renderedOccurrences.length !== actionableOccurrences.length ||
    renderedOccurrences.some((occurrence, index) => (
      occurrence.id !== actionableOccurrences[index].id
    ))
  ) {
    return null
  }

  const wrapperNamespaces = value.match(CARRIER_WRAPPER_NAMESPACE_PATTERN) ?? []
  if (field === 'excerpt') {
    return wrapperNamespaces.length === 0 ? renderedOccurrences : null
  }
  if (wrapperNamespaces.length !== actionableOccurrences.length) {
    return null
  }

  const wrapperTokens = [...value.matchAll(CARRIER_WRAPPER_ATTRIBUTE_PATTERN)]
    .map(match => match[1] ?? match[2])
  if (
    wrapperTokens.length !== actionableOccurrences.length ||
    wrapperTokens.some((token, index) => token !== actionableOccurrences[index].token) ||
    actionableOccurrences.some(occurrence => (
      countExactText(value, createCarrierWrapper(occurrence.token)) !== 1
    ))
  ) {
    return null
  }
  return renderedOccurrences
}

function finalizeMaterializedValue(value, store, sentinelContext) {
  try {
    sentinelContext.assertFullyConsumed(value)
    if (/data-arknights-carrier\b/i.test(value)) {
      return null
    }
    for (const token of store.issuedTokens()) {
      if (value.includes(token)) {
        return null
      }
    }
    return value
  } catch {
    return null
  }
}

function materializeField(value, state, data, field, registry, sentinelContext) {
  const actionableOccurrences = state.store.getOccurrences().filter(occurrence => (
    occurrence.field === field &&
    (occurrence.state === 'pending-markdown' || occurrence.state === 'excerpt-pending')
  ))
  const occurrences = auditMaterializationInput(value, state, field, actionableOccurrences)
  if (occurrences === null) {
    return null
  }

  const htmlCards = new Map()
  const projectionCards = new Map()
  const replacements = []
  for (const occurrence of actionableOccurrences) {
    const replacement = prepareOccurrence(occurrence, state, data, field, registry)
    state.replacements.set(occurrence.id, {
      success: !replacement.failed,
      failed: replacement.failed === true
    })
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

  const tokenized = field === 'excerpt'
  let html = applyOccurrences(value, occurrences, replacements.map(replacement => replacement.html), tokenized)
  let projection = applyOccurrences(value, occurrences, replacements.map(replacement => replacement.projection), tokenized)
  if (html === null || projection === null) {
    return null
  }
  html = composeCardGroups(html, htmlCards, false, sentinelContext)
  html = unwrapGridParagraphs(html, sentinelContext)
  html = unwrapStandaloneGridSentinels(html, sentinelContext)
  projection = composeCardGroups(projection, projectionCards, true, sentinelContext)
  const finalizedHtml = finalizeMaterializedValue(html, state.store, sentinelContext)
  const finalizedProjection = finalizeMaterializedValue(projection, state.store, sentinelContext)
  if (finalizedHtml === null || finalizedProjection === null) {
    return null
  }
  return { html: finalizedHtml, projection: finalizedProjection }
}

function deriveExcerptProjection(contentProjection) {
  const match = MORE_PATTERN.exec(contentProjection)
  return match === null ? contentProjection : contentProjection.slice(0, match.index).trim()
}

function readProjectedText(projection, sourceField) {
  if (projection === undefined) {
    return null
  }
  if (sourceField === 'content') {
    return typeof projection.content === 'string' ? projection.content : null
  }
  if (projection.explicitExcerpt) {
    return typeof projection.excerpt === 'string' ? projection.excerpt : null
  }
  return typeof projection.content === 'string' ? deriveExcerptProjection(projection.content) : null
}

function getStablePath(data) {
  try {
    const path = data.path
    return typeof path === 'string' && path.length > 0 ? path : null
  } catch {
    return null
  }
}

function createPipelineError(code, reason) {
  return Object.assign(new Error(code), { code, reason })
}

function createMarkerPipeline(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline options must be an object')
  }

  const allowedOptionKeys = new Set(['handlers', 'tokenStoreFactory'])
  if (Object.keys(options).some(key => !allowedOptionKeys.has(key))) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline option is unsupported')
  }

  const handlers = Object.hasOwn(options, 'handlers')
    ? options.handlers
    : [aiHandler, projectsHandler]
  const tokenStoreFactory = Object.hasOwn(options, 'tokenStoreFactory')
    ? options.tokenStoreFactory
    : createTokenStore
  if (!Array.isArray(handlers) || handlers.length === 0) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline handlers must be a non-empty array')
  }
  if (typeof tokenStoreFactory !== 'function') {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline token store factory must be a function')
  }

  const registry = createRegistry()
  for (const handler of handlers) {
    registry.register(handler)
  }

  const renderStates = new WeakMap()
  const projectionStates = new WeakMap()
  const projectionByPath = new Map()

  const beforePostRender = data => {
    if (!isDataObject(data)) {
      return data
    }

    const previousState = renderStates.get(data)
    const stablePath = previousState?.identity ?? getStablePath(data)
    if (stablePath !== null) {
      projectionByPath.delete(stablePath)
    }
    if (previousState !== undefined) {
      restoreCarrierBridge(data, previousState.carrier)
      for (const field of previousState.fields) {
        const originalValue = previousState.carrier.originalField(field)
        if (typeof originalValue === 'string') {
          data[field] = originalValue
        }
      }
      renderStates.delete(data)
    }
    projectionStates.delete(data)
    restoreCarrierBridgeFromData(data)
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
    } catch (error) {
      if (typeof error?.code === 'string' && error.code !== 'TOKEN_GENERATION_EXHAUSTED') {
        throw error
      }
      return data
    }

    for (const field of tokenized.transformedFields) {
      tokenized.store.findOccurrences(field.value, field.field)
    }
    const carrier = createRenderCarrier({
      data,
      store: tokenized.store,
      fields: fields.map(field => ({
        field: field.field,
        explicit: field.explicit,
        originalValue: field.source
      }))
    })

    try {
      attachCarrierBridge(data, carrier)
      for (const field of tokenized.transformedFields) {
        data[field.field] = field.value
      }
    } catch (error) {
      restoreCarrierBridge(data, carrier)
      for (const field of fields) {
        data[field.field] = field.source
      }
      if (typeof error?.code === 'string' && error.code.startsWith('CARRIER_BRIDGE_')) {
        throw error
      }
      return data
    }

    renderStates.set(data, {
      store: tokenized.store,
      carrier,
      identity: stablePath,
      fields: tokenized.transformedFields.map(field => field.field),
      explicitFields: new Set(
        tokenized.transformedFields.filter(field => field.explicit).map(field => field.field)
      ),
      replacements: new Map()
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
      explicitExcerpt: state.explicitFields.has('excerpt')
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

    try {
      for (const field of state.fields) {
        let value
        try {
          value = data[field]
        } catch {
          value = null
        }
        if (typeof value !== 'string') {
          value = state.carrier.originalField(field)
          data[field] = value
        }

        let materialized
        try {
          materialized = materializeField(value, state, data, field, registry, sentinelContext)
        } catch {
          materialized = null
        }
        if (materialized === null || materialized.html === null || materialized.projection === null) {
          const originalValue = state.carrier.originalField(field)
          const fallback = createFieldFallback(originalValue)
          data[field] = fallback
          projection[field] = fallback
          for (const occurrence of state.store.getOccurrences().filter(item => item.field === field)) {
            if (occurrence.state === 'pending-markdown' || occurrence.state === 'excerpt-pending') {
              try {
                state.carrier.markFailed(occurrence.id)
              } catch {
                return data
              }
            }
          }
          continue
        }

        data[field] = materialized.html
        projection[field] = materialized.projection
        let fieldRequiresFallback = false
        for (const occurrence of state.store.getOccurrences().filter(item => item.field === field)) {
          if (occurrence.state !== 'pending-markdown' && occurrence.state !== 'excerpt-pending') {
            continue
          }
          const replacement = state.replacements.get(occurrence.id)
          if (replacement === undefined) {
            state.carrier.markFailed(occurrence.id)
            fieldRequiresFallback = true
          } else if (replacement.failed !== true) {
            state.carrier.markConsumed(occurrence.id)
          } else {
            state.carrier.markFailed(occurrence.id)
          }
        }
        if (fieldRequiresFallback) {
          const originalValue = state.carrier.originalField(field)
          const fallback = createFieldFallback(originalValue)
          data[field] = fallback
          projection[field] = fallback
        }
      }

      const audit = state.carrier.audit()
      if (audit.ok !== true) {
        for (const field of state.fields) {
          const originalValue = state.carrier.originalField(field)
          const fallback = createFieldFallback(originalValue)
          data[field] = fallback
          projection[field] = fallback
        }
      }
      if (typeof projection.content === 'string' && projection.explicitExcerpt === false) {
        projection.excerpt = deriveExcerptProjection(projection.content)
      }
      if (state.identity !== null) {
        projectionByPath.set(state.identity, projection)
      }
      projectionStates.set(data, projection)
      return data
    } finally {
      restoreCarrierBridge(data, state.carrier)
      renderStates.delete(data)
    }
  }

  const projectText = (data, sourceField) => {
    if (!isDataObject(data) || !SOURCE_FIELDS.includes(sourceField)) {
      return null
    }
    return readProjectedText(projectionStates.get(data), sourceField)
  }

  const projectTextByPath = (path, sourceField) => {
    if (typeof path !== 'string' || path.length === 0 || !SOURCE_FIELDS.includes(sourceField)) {
      return null
    }
    return readProjectedText(projectionByPath.get(path), sourceField)
  }

  return Object.freeze({ beforePostRender, afterPostRender, projectText, projectTextByPath })
}

const defaultPipeline = createMarkerPipeline({
  handlers: [aiHandler, projectsHandler],
  tokenStoreFactory: createTokenStore
})

const contextRegistrations = new WeakMap()

function registerMarkerFilters(hexoContext, pipeline = defaultPipeline) {
  if (hexoContext === null || typeof hexoContext !== 'object' || pipeline === null ||
      typeof pipeline !== 'object') {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'registration context and pipeline are invalid')
  }
  const existing = contextRegistrations.get(hexoContext)
  if (existing !== undefined) {
    if (existing.pipeline !== pipeline) {
      throw createPipelineError('DUPLICATE_MARKER_PIPELINE', 'context is already bound to another pipeline')
    }
    return existing
  }

  const registrationContext = { filter: hexoContext.extend.filter }
  const before = pipeline.beforePostRender
  const after = pipeline.afterPostRender
  const markedUse = function installForRenderer(markedUse) {
    installMarkedExtension(markedUse)
  }
  const registered = []
  try {
    registered.push(['before_post_render', before])
    registrationContext.filter.register('before_post_render', before, 4)
    registered.push(['after_post_render', after])
    registrationContext.filter.register('after_post_render', after, 9)
    registered.push(['marked:use', markedUse])
    registrationContext.filter.register('marked:use', markedUse, 0)
  } catch (error) {
    contextRegistrations.delete(hexoContext)
    for (const [type, handler] of registered.slice().reverse()) {
      try {
        registrationContext.filter.unregister(type, handler)
      } catch {
        // Keep the original registration error.
      }
    }
    throw error
  }

  const registration = Object.freeze({
    pipeline,
    before,
    after,
    markedUse,
    priorities: Object.freeze({ before: 4, after: 9, markedUse: 0 })
  })
  contextRegistrations.set(hexoContext, registration)
  return registration
}

const beforePostRender = defaultPipeline.beforePostRender
const afterPostRender = defaultPipeline.afterPostRender
const projectText = defaultPipeline.projectText
const projectTextByPath = defaultPipeline.projectTextByPath

module.exports = {
  createMarkerPipeline,
  defaultPipeline,
  registerMarkerFilters,
  beforePostRender,
  afterPostRender,
  projectText,
  projectTextByPath
}
