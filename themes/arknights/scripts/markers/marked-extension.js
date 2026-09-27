'use strict'

const { CARRIER_SYMBOL } = require('./carrier')
const { placeholderHtml } = require('./pipeline/materialize')

const EXTENSION_NAME = 'arknights-line-marker'
const PLACEHOLDER_CONTEXT = 'block-placeholder'
const PENDING_RENDER_STATE = 'pending-render'
// The store issues a 24 byte nonce and an HMAC-SHA256 checksum, both base64url encoded; the
// lexer shape must match that exact segment length so a token carrying a prefix or suffix is not
// mistaken for a token.
const TOKEN_PATTERN = /^arknights-line-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}$/
const METADATA_KEYS = Object.freeze([
  'context', 'field', 'id', 'mode', 'parent', 'raw', 'sourceRange', 'state', 'token'
])
const PARENT_KEYS = Object.freeze(['field', 'type'])

function createMarkedError(code, reason) {
  const error = new Error(code)
  error.code = code
  error.reason = reason
  return error
}

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function isCarrier(value) {
  return isObject(value) &&
    typeof value.bindContext === 'function' &&
    typeof value.getOccurrenceByToken === 'function' &&
    typeof value.getOccurrences === 'function' &&
    typeof value.issuedTokens === 'function'
}

function readCarrier(options) {
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

function firstPhysicalLine(src) {
  const lineEnd = src.indexOf('\n')
  return lineEnd === -1 ? src : src.slice(0, lineEnd)
}

// Marked hands `start` the already sliced `src.slice(1)`, so both offset 0 and the code unit
// right after it may sit on a line boundary the lexer has consumed; any later offset is only a
// line start when the preceding code unit is CR or LF.
const LEADING_SLICE_TOLERANCE = 1

function ownsLineStart(src, index) {
  return index <= LEADING_SLICE_TOLERANCE || src[index - 1] === '\n' || src[index - 1] === '\r'
}

function ownsPhysicalLine(src, index, token) {
  if (src.slice(index, index + token.length) !== token) {
    return false
  }
  const after = src.slice(index + token.length)
  return after === '' || after === '\n' || after.startsWith('\n')
}

function readOwnerToken(carrier, line) {
  if (line !== line.trim() || !TOKEN_PATTERN.test(line)) {
    return null
  }
  if (carrier !== null && carrier.getOccurrenceByToken(line) === null) {
    return null
  }
  return line
}

function findOwnerStartIndex(carrier, src) {
  for (const token of carrier === null ? syntacticTokens(src) : carrier.issuedTokens()) {
    let from = 0
    for (;;) {
      const index = src.indexOf(token, from)
      if (index === -1) {
        break
      }
      if (ownsLineStart(src, index) && ownsPhysicalLine(src, index, token)) {
        return index
      }
      from = index + 1
    }
  }
  return -1
}

const TOKEN_CANDIDATE_PATTERN = /arknights-line-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}/g

// Ownership is proven by the store, not by the source text: before 4 refuses any field that
// already contains the token namespace, so every candidate reaching Marked was issued by us.
function syntacticTokens(src) {
  return typeof src === 'string' ? src.match(TOKEN_CANDIDATE_PATTERN) ?? [] : []
}

function attachMetadata(token, entry) {
  if (Object.hasOwn(token, 'arknights')) {
    throw createMarkedError('CARRIER_AUDIT_FAILED', 'owner token already has metadata')
  }
  Object.defineProperty(token, 'arknights', {
    value: Object.freeze([entry]),
    enumerable: false,
    configurable: false,
    writable: false
  })
}

function freezeMetadataEntry(occurrence) {
  return Object.freeze({
    id: occurrence.id,
    token: occurrence.token,
    field: occurrence.field,
    mode: occurrence.mode,
    raw: occurrence.raw,
    sourceRange: Object.freeze({
      start: occurrence.sourceRange.start,
      end: occurrence.sourceRange.end
    }),
    context: PLACEHOLDER_CONTEXT,
    state: PENDING_RENDER_STATE,
    parent: Object.freeze({ type: EXTENSION_NAME, field: 'text' })
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
    let keysOk = false
    let parentKeysOk = false
    try {
      keysOk = Object.keys(entry).sort().join('|') === [...METADATA_KEYS].sort().join('|')
      parentKeysOk = isObject(entry.parent) &&
        Object.keys(entry.parent).sort().join('|') === [...PARENT_KEYS].sort().join('|')
    } catch {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'token metadata entry is invalid')
    }
    if (
      !keysOk ||
      !parentKeysOk ||
      !Object.isFrozen(entry) ||
      !Object.isFrozen(entry.parent) ||
      typeof entry.id !== 'string' ||
      typeof entry.token !== 'string' ||
      !TOKEN_PATTERN.test(entry.token) ||
      typeof entry.raw !== 'string' ||
      entry.field !== 'content' ||
      entry.mode !== 'block' ||
      entry.context !== PLACEHOLDER_CONTEXT ||
      entry.state !== PENDING_RENDER_STATE ||
      entry.parent.type !== EXTENSION_NAME ||
      entry.parent.field !== 'text' ||
      !Number.isInteger(entry.sourceRange?.start) ||
      !Number.isInteger(entry.sourceRange?.end)
    ) {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'token metadata entry is invalid')
    }
  }
}

// Marked advances the block source by token.raw and then folds a single following LF back into
// raw, so the stored raw is either the bare token or the token plus one LF.
function ownsTokenText(token) {
  return typeof token.text === 'string' &&
    TOKEN_PATTERN.test(token.text) &&
    (token.raw === token.text || token.raw === `${token.text}\n`)
}

function claimOwnerToken(token, carrier) {
  if (token.type !== EXTENSION_NAME) {
    return
  }
  if (!ownsTokenText(token)) {
    throw createMarkedError('CARRIER_BINDING_ERROR', 'owner token provenance is missing')
  }
  if (Object.hasOwn(token, 'arknights')) {
    return
  }
  const occurrence = carrier.getOccurrenceByToken(token.text)
  if (occurrence === null) {
    throw createMarkedError('CARRIER_BINDING_ERROR', 'owner token provenance is missing')
  }
  attachMetadata(token, freezeMetadataEntry(carrier.bindContext(occurrence.id, PLACEHOLDER_CONTEXT)))
}

function walkOwnerTokens(tokens, carrier) {
  for (const token of tokens ?? []) {
    claimOwnerToken(token, carrier)
    if (Array.isArray(token.tokens)) {
      walkOwnerTokens(token.tokens, carrier)
    }
    for (const item of token.items ?? []) {
      walkOwnerTokens(item.tokens, carrier)
    }
    for (const cell of token.header ?? []) {
      walkOwnerTokens(cell.tokens, carrier)
    }
    for (const row of token.rows ?? []) {
      for (const cell of row) {
        walkOwnerTokens(cell.tokens, carrier)
      }
    }
  }
}

function installMarkedExtension(markedUse) {
  if (typeof markedUse !== 'function') {
    throw createMarkedError('INVALID_MARKED_USE', 'marked use must be a function')
  }

  function findOwnerStart(src) {
    return findOwnerStartIndex(readCarrier(this === undefined ? null : this.lexer?.options) ?? null, src)
  }

  function tokenizeOwnerToken(src) {
    const carrier = readCarrier(this === undefined ? null : this.lexer?.options)
    const token = readOwnerToken(carrier, firstPhysicalLine(src))
    if (token === null) {
      return undefined
    }
    return { type: EXTENSION_NAME, raw: token, text: token }
  }

  function recordOwnerProvenance(tokens) {
    const options = this === undefined ? null : this.options
    if (!isObject(options) || !Object.hasOwn(options, CARRIER_SYMBOL)) {
      return tokens
    }
    try {
      const carrier = readCarrier(options)
      if (carrier !== null) {
        walkOwnerTokens(tokens, carrier)
        const unclaimed = carrier.getOccurrences().filter(
          (occurrence) => occurrence.field === 'content' && occurrence.state === 'issued'
        )
        if (unclaimed.length > 0) {
          throw createMarkedError('CARRIER_AUDIT_FAILED', 'content occurrence has no token owner')
        }
      }
      return tokens
    } finally {
      try {
        const deleted = Reflect.deleteProperty(options, CARRIER_SYMBOL)
        if (!deleted && Object.hasOwn(options, CARRIER_SYMBOL)) {
          throw new Error('carrier symbol cleanup failed')
        }
      } catch {
        throw createMarkedError('CARRIER_AUDIT_FAILED', 'carrier symbol cleanup failed')
      }
    }
  }

  function renderOwnerToken(token) {
    validateMetadataDescriptor(token)
    if (token.type !== EXTENSION_NAME) {
      return false
    }
    const metadata = token.arknights
    const owned = Array.isArray(metadata) ? metadata[0] : null
    if (metadata !== undefined && (owned === undefined || owned.token !== token.text)) {
      throw createMarkedError('CARRIER_AUDIT_FAILED', 'owner token metadata is invalid')
    }
    return placeholderHtml(token.text) + '\n'
  }

  function auditOwnerToken(token) {
    validateMetadataDescriptor(token)
  }

  markedUse({
    extensions: [
      {
        name: EXTENSION_NAME,
        level: 'block',
        start: findOwnerStart,
        tokenizer: tokenizeOwnerToken,
        renderer: renderOwnerToken
      }
    ],
    hooks: { processAllTokens: recordOwnerProvenance },
    walkTokens: auditOwnerToken
  })
}

module.exports = { installMarkedExtension }
