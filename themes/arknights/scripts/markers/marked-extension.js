'use strict'

const { CARRIER_SYMBOL } = require('./carrier')

function createMarkedError(code, reason) {
  const error = new Error(code)
  error.code = code
  error.reason = reason
  return error
}

const CARRIER_EXTENSION_NAME = 'arknights-marker-carrier'
const METADATA_CONTEXT_STATES = Object.freeze({
  text: 'pending-markdown',
  'image-alt': 'raw-preserved',
  'link-label': 'text-preserved',
  'link-url': 'raw-preserved',
  'link-title': 'raw-preserved',
  'raw-html': 'raw-restored'
})
const METADATA_ENTRY_KEYS = Object.freeze([
  'context', 'field', 'headingOnly', 'id', 'mode', 'parent', 'raw', 'state', 'token'
])
const METADATA_PARENT_KEYS = Object.freeze(['field', 'type'])
const CARRIER_TOKEN_PATTERN = /arknights-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}/g
const CARRIER_TOKEN_EXACT_PATTERN = /^arknights-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}$/
const CARRIER_ID_PATTERN = /^o[0-9]+$/

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function isCarrier(value) {
  return isObject(value) &&
    typeof value.findOccurrences === 'function' &&
    typeof value.bindContext === 'function' &&
    typeof value.issuedTokens === 'function' &&
    typeof value.getOccurrenceByToken === 'function' &&
    typeof value.getOccurrences === 'function'
}

function readCarrierFromOptions(options) {
  if (!isObject(options)) {
    return null
  }
  let hasCarrier
  let carrier
  try {
    hasCarrier = Object.hasOwn(options, CARRIER_SYMBOL)
    carrier = hasCarrier ? options[CARRIER_SYMBOL] : null
  } catch {
    throw createMarkedError('CARRIER_BINDING_ERROR', 'carrier options could not be read')
  }
  if (!hasCarrier) {
    return null
  }
  if (!isCarrier(carrier)) {
    throw createMarkedError('CARRIER_BINDING_ERROR', 'carrier options are invalid')
  }
  return carrier
}

function isPlainData(value) {
  if (!isObject(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function freezeMetadataEntry(occurrence, parent, headingOnly) {
  if (headingOnly !== null && typeof headingOnly !== 'boolean') {
    throw createMarkedError('CARRIER_STATE_INVALID', 'heading metadata state is invalid')
  }
  return Object.freeze({
    id: occurrence.id,
    token: occurrence.token,
    field: occurrence.field,
    mode: occurrence.mode,
    raw: occurrence.raw,
    context: occurrence.context,
    state: occurrence.state,
    parent: Object.freeze({ type: parent.type, field: parent.field }),
    headingOnly
  })
}

function isSyntheticLink(token) {
  if (token.type !== 'link' || Object.hasOwn(token, 'title') || token.text !== token.href) {
    return false
  }
  if (!Array.isArray(token.tokens) || token.tokens.length !== 1) {
    return false
  }
  const child = token.tokens[0]
  return child?.type === 'text' && child.raw === child.text && child.text === token.text
}

function restoreField(value, occurrences) {
  if (typeof value !== 'string' || occurrences.length === 0) {
    return value
  }
  let restored = value
  for (const occurrence of [...occurrences].sort((left, right) => right.start - left.start)) {
    if (restored.slice(occurrence.start, occurrence.end) !== occurrence.token) {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'token field could not be restored')
    }
    restored = restored.slice(0, occurrence.start) + occurrence.raw + restored.slice(occurrence.end)
  }
  return restored
}

function appendMetadata(token, entries) {
  const hasMetadata = Object.hasOwn(token, 'arknights')
  if (entries.length === 0) {
    if (hasMetadata) {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'projection token has owner metadata')
    }
    return
  }
  if (hasMetadata) {
    throw createMarkedError('CARRIER_AUDIT_FAILED', 'owner token already has metadata')
  }
  const metadata = Object.freeze(entries)
  Object.defineProperty(token, 'arknights', {
    value: metadata,
    enumerable: false,
    configurable: false,
    writable: false
  })
}

function validateMetadataDescriptor(token) {
  if (!Object.hasOwn(token, 'arknights')) {
    return
  }
  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(token, 'arknights')
  } catch {
    throw createMarkedError('CARRIER_AUDIT_FAILED', 'token metadata descriptor is invalid')
  }
  if (
    descriptor === undefined ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== false ||
    descriptor.writable !== false ||
    !Array.isArray(descriptor.value) ||
    !Object.isFrozen(descriptor.value)
  ) {
    throw createMarkedError('CARRIER_AUDIT_FAILED', 'token metadata descriptor is invalid')
  }
  for (const entry of descriptor.value) {
    let parentType = null
    let parentField = null
    try {
      if (!isPlainData(entry) || !Object.isFrozen(entry) || !isObject(entry.parent) ||
          !Object.isFrozen(entry.parent) ||
          Object.keys(entry).sort().join('|') !== METADATA_ENTRY_KEYS.join('|') ||
          Object.keys(entry.parent).sort().join('|') !== METADATA_PARENT_KEYS.join('|')) {
        throw new Error('invalid metadata entry')
      }
      parentType = entry.parent.type
      parentField = entry.parent.field
    } catch {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'token metadata entry is invalid')
    }
    const validLinkField = parentType !== 'link' || ['text', 'href', 'title'].includes(parentField)
    const validParentField = parentType === CARRIER_EXTENSION_NAME
      ? parentField === 'text'
      : parentType === 'image'
        ? parentField === 'alt'
        : parentType === 'html'
          ? parentField === 'text'
          : parentType === 'link' && validLinkField
    if (
      typeof parentType !== 'string' || parentType.length === 0 || !validParentField ||
      (entry.headingOnly !== null && typeof entry.headingOnly !== 'boolean') ||
      typeof entry.context !== 'string' ||
      METADATA_CONTEXT_STATES[entry.context] !== entry.state ||
      entry.field !== 'content' || typeof entry.id !== 'string' ||
      !CARRIER_ID_PATTERN.test(entry.id) || typeof entry.token !== 'string' ||
      !CARRIER_TOKEN_EXACT_PATTERN.test(entry.token) ||
      !['block', 'inline'].includes(entry.mode) || typeof entry.raw !== 'string'
    ) {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'token metadata entry is invalid')
    }
  }
}

function inspectCarrierVisibility(token) {
  const visibleText = value => (
    typeof value === 'string' ? value.replace(CARRIER_TOKEN_PATTERN, '') : ''
  )
  if (token.type === CARRIER_EXTENSION_NAME) {
    return { hasCarrier: true, visible: '' }
  }
  if (token.type === 'text' || token.type === 'html') {
    const visible = visibleText(token.text)
    return {
      hasCarrier: typeof token.text === 'string' && visible !== token.text,
      visible
    }
  }
  if (token.type === 'link' && typeof token.href === 'string' &&
      visibleText(token.href) !== token.href) {
    return { hasCarrier: true, visible: '' }
  }
  if (Array.isArray(token.tokens)) {
    return token.tokens.reduce((result, child) => {
      const inspected = inspectCarrierVisibility(child)
      result.hasCarrier ||= inspected.hasCarrier
      result.visible += inspected.visible
      return result
    }, { hasCarrier: false, visible: '' })
  }
  const visible = visibleText(token.text)
  return {
    hasCarrier: typeof token.text === 'string' && visible !== token.text,
    visible
  }
}

function collectHeadingOnlyMetadata(token, headingOnlyByToken) {
  if (token.type === 'heading') {
    const inspected = (token.tokens ?? []).reduce((result, child) => {
      const childResult = inspectCarrierVisibility(child)
      result.hasCarrier ||= childResult.hasCarrier
      result.visible += childResult.visible
      return result
    }, { hasCarrier: false, visible: '' })
    headingOnlyByToken.set(token, inspected.hasCarrier && inspected.visible.trim() === '')
    return
  }
  for (const child of token.tokens ?? []) {
    collectHeadingOnlyMetadata(child, headingOnlyByToken)
  }
}

function collectCarrierFieldClaims(carrier, value, context, inheritedById) {
  const claims = []
  for (const occurrence of carrier.findOccurrences(value, 'content')) {
    const inheritedSnapshot = inheritedById.get(occurrence.id)
    if (inheritedSnapshot !== undefined) {
      claims.push({ occurrence, snapshot: inheritedSnapshot, inherited: true })
      continue
    }
    claims.push({
      occurrence,
      snapshot: carrier.bindContext(occurrence.id, context),
      inherited: false
    })
  }
  return claims
}

function claimCarrierField(token, value, context, parentField, carrier, inheritedById, headingOnly) {
  if (typeof value !== 'string') {
    return { claims: [], direct: [] }
  }
  const claims = collectCarrierFieldClaims(carrier, value, context, inheritedById)
  const direct = []
  for (const claim of claims) {
    if (!claim.inherited) {
      direct.push({
        claim,
        metadata: freezeMetadataEntry(
          claim.snapshot,
          { type: token.type, field: parentField },
          headingOnly
        )
      })
    }
  }
  return { claims, direct }
}

function restoreCarrierClaims(value, claims) {
  return restoreField(
    value,
    claims.map(claim => ({
      start: claim.occurrence.start,
      end: claim.occurrence.end,
      token: claim.occurrence.token,
      raw: claim.snapshot.raw
    }))
  )
}

function restoreCarrierTokenFields(token, syntheticLink, fields, carrier) {
  if (token.type === CARRIER_EXTENSION_NAME) {
    if (fields.text.claims.length === 0) {
      if (carrier.getOccurrenceByToken(token.text) === null) {
        throw createMarkedError('CARRIER_BINDING_ERROR', 'carrier token provenance is missing')
      }
    } else if (fields.text.claims.every(claim => claim.inherited)) {
      token.text = fields.text.claims[0].snapshot.raw
    }
    return
  }
  if (token.type === 'image' && typeof token.text === 'string') {
    token.text = restoreCarrierClaims(token.text, fields.text.claims)
    return
  }
  if (syntheticLink) {
    token.href = restoreCarrierClaims(token.href, fields.href.claims)
    token.text = token.href
    const child = token.tokens?.[0]
    if (child?.type === 'text') {
      child.text = token.href
      child.raw = token.href
    }
    return
  }
  if (token.type === 'link') {
    if (typeof token.text === 'string') {
      token.text = restoreCarrierClaims(token.text, fields.text.claims)
    }
    if (typeof token.href === 'string') {
      token.href = restoreCarrierClaims(token.href, fields.href.claims)
    }
    if (typeof token.title === 'string') {
      token.title = restoreCarrierClaims(token.title, fields.title.claims)
    }
    return
  }
  if (token.type === 'html' && token.block === true && typeof token.text === 'string') {
    token.text = restoreCarrierClaims(token.text, fields.text.claims)
  }
}

function walkCarrierChildren(token, inheritedById, headingOnly, walk) {
  if (token.tokens !== undefined) {
    walk(token.tokens, inheritedById, headingOnly)
  }
  if (token.type === 'list') {
    for (const item of token.items ?? []) {
      walk(item.tokens, inheritedById, headingOnly)
    }
  }
  if (token.type === 'table') {
    for (const cell of token.header ?? []) {
      walk(cell.tokens, inheritedById, headingOnly)
    }
    for (const row of token.rows ?? []) {
      for (const cell of row) {
        walk(cell.tokens, inheritedById, headingOnly)
      }
    }
  }
}

function processCarrierToken(token, carrier, headingOnlyByToken, inheritedById, headingOnly) {
  const syntheticLink = token.type === 'link' && isSyntheticLink(token)
  const parentHeadingOnly = token.type === 'heading'
    ? headingOnlyByToken.get(token) === true
    : headingOnly
  const empty = () => ({ claims: [], direct: [] })
  let text = empty()
  let href = empty()
  let title = empty()
  if (token.type === CARRIER_EXTENSION_NAME) {
    text = claimCarrierField(
      token, token.text, 'text', 'text', carrier, inheritedById, parentHeadingOnly
    )
  } else if (token.type === 'html' && token.block === true) {
    text = claimCarrierField(
      token, token.text, 'raw-html', 'text', carrier, inheritedById, parentHeadingOnly
    )
  } else if (token.type === 'image') {
    text = claimCarrierField(
      token, token.text, 'image-alt', 'alt', carrier, inheritedById, parentHeadingOnly
    )
  } else if (syntheticLink) {
    href = claimCarrierField(
      token, token.href, 'link-url', 'href', carrier, inheritedById, parentHeadingOnly
    )
  } else if (token.type === 'link') {
    text = claimCarrierField(
      token, token.text, 'link-label', 'text', carrier, inheritedById, parentHeadingOnly
    )
    href = claimCarrierField(
      token, token.href, 'link-url', 'href', carrier, inheritedById, parentHeadingOnly
    )
    title = claimCarrierField(
      token, token.title, 'link-title', 'title', carrier, inheritedById, parentHeadingOnly
    )
  }

  const direct = [...text.direct, ...href.direct, ...title.direct]
  appendMetadata(token, direct.map(entry => entry.metadata))
  restoreCarrierTokenFields(token, syntheticLink, { text, href, title }, carrier)
  if (syntheticLink) {
    return
  }

  const nextInherited = new Map(inheritedById)
  for (const { claim } of direct) {
    nextInherited.set(claim.occurrence.id, claim.snapshot)
  }
  walkCarrierChildren(token, nextInherited, parentHeadingOnly, (items, inherited, nestedHeadingOnly) => {
    walkCarrierTree(items, carrier, headingOnlyByToken, inherited, nestedHeadingOnly)
  })
}

function walkCarrierTree(tokens, carrier, headingOnlyByToken, inheritedById = new Map(), headingOnly = null) {
  for (const token of tokens ?? []) {
    processCarrierToken(token, carrier, headingOnlyByToken, inheritedById, headingOnly)
  }
}

function installMarkedExtension(markedUse) {
  if (typeof markedUse !== 'function') {
    throw createMarkedError('INVALID_MARKED_USE', 'marked use must be a function')
  }

  function findIssuedTokenStart(carrier, src) {
    let matchIndex = -1
    let matchToken = null
    for (const token of carrier.issuedTokens()) {
      const index = src.indexOf(token)
      if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
        matchIndex = index
        matchToken = token
      }
    }
    return { matchIndex, matchToken }
  }

  function findCarrierStart(src) {
    const carrier = readCarrierFromOptions(this.lexer.options)
    if (carrier === null || typeof src !== 'string') {
      return undefined
    }
    const { matchIndex } = findIssuedTokenStart(carrier, src)
    return matchIndex === -1 ? undefined : matchIndex
  }

  function tokenizeCarrier(src) {
    const carrier = readCarrierFromOptions(this.lexer.options)
    if (carrier === null || typeof src !== 'string') {
      return undefined
    }
    const { matchIndex, matchToken } = findIssuedTokenStart(carrier, src)
    if (matchIndex !== 0 || typeof matchToken !== 'string' ||
        carrier.getOccurrenceByToken(matchToken) === null) {
      return undefined
    }
    return { type: CARRIER_EXTENSION_NAME, raw: matchToken, text: matchToken }
  }

  function recordCarrierProvenance(tokens) {
    const shouldCleanup = isObject(this.options)
    try {
      const carrier = readCarrierFromOptions(this.options)
      if (carrier === null) {
        return tokens
      }

      const headingOnlyByToken = new Map()
      for (const token of tokens) {
        collectHeadingOnlyMetadata(token, headingOnlyByToken)
      }

      walkCarrierTree(tokens, carrier, headingOnlyByToken)

      const unclassified = carrier.getOccurrences().filter(occurrence => (
        occurrence.field === 'content' && occurrence.state === 'issued'
      ))
      if (unclassified.length > 0) {
        throw createMarkedError('CARRIER_AUDIT_FAILED', 'content occurrence has no token owner')
      }
      return tokens
    } finally {
      if (shouldCleanup) {
        try {
          const deleted = Reflect.deleteProperty(this.options, CARRIER_SYMBOL)
          if (!deleted && Object.hasOwn(this.options, CARRIER_SYMBOL)) {
            throw new Error('carrier symbol cleanup failed')
          }
        } catch {
          throw createMarkedError('CARRIER_AUDIT_FAILED', 'carrier symbol cleanup failed')
        }
      }
    }
  }

  function renderCarrierWrapper(token) {
    if (token.type !== CARRIER_EXTENSION_NAME) {
      return false
    }
    validateMetadataDescriptor(token)
    const metadata = token.arknights?.[0]
    if (metadata === undefined) {
      if (typeof token.text === 'string' && token.text !== token.raw) {
        return token.text
      }
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'carrier wrapper metadata is missing')
    }
    if (metadata.context !== 'text' || metadata.state !== 'pending-markdown' ||
        metadata.parent.type !== CARRIER_EXTENSION_NAME || metadata.parent.field !== 'text') {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'carrier wrapper metadata is invalid')
    }
    return `<span data-arknights-carrier="${metadata.token}"></span>`
  }

  function renderImageContext(token) {
    validateMetadataDescriptor(token)
    return this.parser.renderer.image(token)
  }

  function renderLinkContext(token) {
    validateMetadataDescriptor(token)
    return this.parser.renderer.link(token)
  }

  function renderHtmlContext(token) {
    validateMetadataDescriptor(token)
    return this.parser.renderer.html(token)
  }

  function renderHeadingWithCarrier(token) {
    const metadata = token.arknights ?? []
    const descendantMetadata = []
    const collectMetadata = items => {
      for (const child of items ?? []) {
        if (Array.isArray(child.arknights)) {
          descendantMetadata.push(...child.arknights)
        }
        collectMetadata(child.tokens)
      }
    }
    collectMetadata(token.tokens)
    const headingOnly = [...metadata, ...descendantMetadata].length > 0 &&
      [...metadata, ...descendantMetadata].every(entry => entry.headingOnly === true)
    if (!headingOnly) {
      return this.parser.renderer.heading(token)
    }
    const originalTokens = token.tokens
    return `<h${token.depth}>${this.parser.parseInline(originalTokens)}</h${token.depth}>\n`
  }

  function auditCarrierToken(token) {
    validateMetadataDescriptor(token)
  }

  markedUse({
    extensions: [
      {
        name: CARRIER_EXTENSION_NAME,
        level: 'inline',
        start: findCarrierStart,
        tokenizer: tokenizeCarrier,
        renderer: renderCarrierWrapper
      },
      { name: 'image', renderer: renderImageContext },
      { name: 'link', renderer: renderLinkContext },
      { name: 'html', renderer: renderHtmlContext },
      { name: 'heading', renderer: renderHeadingWithCarrier }
    ],
    hooks: { processAllTokens: recordCarrierProvenance },
    walkTokens: auditCarrierToken
  })
}

module.exports = { installMarkedExtension }
