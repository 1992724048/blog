'use strict'

const { createHmac, randomBytes: createRandomBytes, timingSafeEqual } = require('node:crypto')

const VERSION = 1
const MODE = 'block'
const TOKEN_PREFIX = 'arknights-line-marker-v1:'
const PLACEHOLDER_ATTRIBUTE = 'data-arknights-line-marker'
const PLACEHOLDER_CONTEXT = 'block-placeholder'
const NONCE_BYTES = 24
const NONCE_TEXT_LENGTH = 32
const CHECKSUM_TEXT_LENGTH = 43
const TOKEN_TEXT_LENGTH =
  TOKEN_PREFIX.length + NONCE_TEXT_LENGTH + 1 + CHECKSUM_TEXT_LENGTH
const MAX_GENERATION_ATTEMPTS = 32
const TOKEN_PATTERN =
  /^arknights-line-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}$/
const OCCURRENCE_FIELDS = new Set(['content', 'excerpt'])
const TERMINAL_STATES = new Set(['consumed', 'failed'])
const PENDING_STATES = new Set(['pending-render', 'excerpt-pending'])

function createStoreError(code, reason) {
  const error = new Error(code)
  error.code = code
  error.reason = reason
  return error
}

function copyRandomBytes(value, label) {
  if (!Buffer.isBuffer(value) && !Array.isArray(value)) {
    throw new TypeError(`${label} must return a byte array`)
  }
  const bytes = Buffer.from(value)
  if (bytes.length === 0) {
    throw new TypeError(`${label} must not be empty`)
  }
  return bytes
}

function isSourceRange(value) {
  return value !== null &&
    typeof value === 'object' &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    value.start >= 0 &&
    value.end >= value.start
}

function freezeRange(range) {
  return Object.freeze({ start: range.start, end: range.end })
}

function createTokenStore(options) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object')
  }
  if (typeof options.occupiedText !== 'string') {
    throw new TypeError('occupiedText must be a string')
  }
  if (
    options.occupiedText.includes(TOKEN_PREFIX) ||
    options.occupiedText.includes(PLACEHOLDER_ATTRIBUTE)
  ) {
    throw createStoreError('TOKEN_COLLISION', 'source fields already contain the token namespace')
  }

  const randomBytes = options.randomBytes ?? createRandomBytes
  if (typeof randomBytes !== 'function') {
    throw new TypeError('randomBytes must be a function')
  }

  const storeKey = copyRandomBytes(randomBytes(32), 'store key randomBytes')
  const records = new Map()
  const occurrencesByToken = new Map()
  const occurrences = new Map()
  let nextOccurrenceId = 0

  function calculateChecksum(nonce, raw) {
    return createHmac('sha256', storeKey)
      .update(JSON.stringify([VERSION, nonce, MODE, raw]), 'utf8')
      .digest('base64url')
  }

  function issue(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('token input must be an object')
    }
    if (typeof input.raw !== 'string') {
      throw new TypeError('token raw must be a string')
    }
    if (!OCCURRENCE_FIELDS.has(input.field)) {
      throw new TypeError('token field must be content or excerpt')
    }
    if (!isSourceRange(input.sourceRange)) {
      throw new TypeError('token sourceRange must be a valid range')
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const nonceBytes = copyRandomBytes(randomBytes(NONCE_BYTES), 'nonce randomBytes')
      if (nonceBytes.length !== NONCE_BYTES) {
        throw new TypeError(`nonce randomBytes must return ${NONCE_BYTES} bytes`)
      }
      const nonce = nonceBytes.toString('base64url')
      const token = `${TOKEN_PREFIX}${nonce}:${calculateChecksum(nonce, input.raw)}`
      const collides = options.occupiedText.includes(token) ||
        input.raw.includes(token) ||
        [...records.keys()].some((issued) => issued.includes(token))
      if (!collides) {
        records.set(token, Object.freeze({
          version: VERSION,
          mode: MODE,
          raw: input.raw,
          field: input.field,
          sourceRange: freezeRange(input.sourceRange),
          nonce,
          checksum: token.slice(TOKEN_PREFIX.length + NONCE_TEXT_LENGTH + 1)
        }))
        return token
      }
    }

    throw createStoreError('TOKEN_GENERATION_EXHAUSTED', 'no collision free token was generated')
  }

  function lookup(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return null
    }
    const record = records.get(token)
    if (record === null || record === undefined) {
      return null
    }
    const expected = Buffer.from(calculateChecksum(record.nonce, record.raw), 'base64url')
    const actual = Buffer.from(record.checksum, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null
    }
    return record
  }

  function findTokens(value) {
    const found = []
    let searchStart = 0
    while (searchStart < value.length) {
      const start = value.indexOf(TOKEN_PREFIX, searchStart)
      if (start === -1) {
        break
      }
      const end = start + TOKEN_TEXT_LENGTH
      const token = value.slice(start, end)
      if (lookup(token) === null) {
        searchStart = start + TOKEN_PREFIX.length
        continue
      }
      found.push({ token, start, end, record: records.get(token) })
      searchStart = end
    }
    return found
  }

  function freezeOccurrence(occurrence) {
    return Object.freeze({
      id: occurrence.id,
      token: occurrence.token,
      field: occurrence.field,
      mode: occurrence.mode,
      raw: occurrence.raw,
      sourceRange: occurrence.sourceRange,
      tokenRange: occurrence.tokenRange === null ? null : freezeRange(occurrence.tokenRange),
      context: occurrence.context,
      state: occurrence.state
    })
  }

  function findOccurrences(value, field) {
    if (typeof value !== 'string' || !OCCURRENCE_FIELDS.has(field)) {
      throw createStoreError('CARRIER_BINDING_ERROR', 'occurrence value and field must be supported')
    }

    const located = findTokens(value)
    const snapshots = []
    for (const match of located) {
      let occurrence = occurrencesByToken.get(match.token)
      if (occurrence === undefined) {
        if (match.record.field !== field) {
          throw createStoreError('CARRIER_BINDING_ERROR', 'an occurrence cannot cross source fields')
        }
        occurrence = {
          id: `o${nextOccurrenceId}`,
          token: match.token,
          field,
          mode: match.record.mode,
          raw: match.record.raw,
          sourceRange: match.record.sourceRange,
          tokenRange: Object.freeze({ start: match.start, end: match.end }),
          context: null,
          state: field === 'excerpt' ? 'excerpt-pending' : 'issued'
        }
        nextOccurrenceId += 1
        occurrencesByToken.set(match.token, occurrence)
        occurrences.set(occurrence.id, occurrence)
      } else if (occurrence.field !== field) {
        throw createStoreError('CARRIER_BINDING_ERROR', 'an occurrence cannot cross source fields')
      }

      const snapshot = freezeOccurrence(occurrence)
      snapshots.push(Object.freeze({
        id: snapshot.id,
        token: snapshot.token,
        field: snapshot.field,
        mode: snapshot.mode,
        raw: snapshot.raw,
        sourceRange: snapshot.sourceRange,
        tokenRange: Object.freeze({ start: match.start, end: match.end }),
        context: snapshot.context,
        state: snapshot.state
      }))
    }
    return Object.freeze(snapshots)
  }

  function bindContext(id, context) {
    if (typeof id !== 'string' || !occurrences.has(id)) {
      throw createStoreError('CARRIER_BINDING_ERROR', 'occurrence id is unknown')
    }
    if (context !== PLACEHOLDER_CONTEXT) {
      throw createStoreError('CARRIER_STATE_INVALID', 'context transition is not available')
    }
    const occurrence = occurrences.get(id)
    if (occurrence.context !== null) {
      throw createStoreError('CARRIER_BINDING_ERROR', 'an occurrence can only be bound once')
    }
    if (occurrence.field !== 'content' || occurrence.state !== 'issued') {
      throw createStoreError('CARRIER_STATE_INVALID', 'content occurrence is not bindable')
    }
    occurrence.context = context
    occurrence.state = 'pending-render'
    return freezeOccurrence(occurrence)
  }

  function markTerminal(id, state) {
    if (typeof id !== 'string' || !occurrences.has(id) || !TERMINAL_STATES.has(state)) {
      throw createStoreError('CARRIER_STATE_INVALID', 'terminal occurrence state is invalid')
    }
    const occurrence = occurrences.get(id)
    if (!PENDING_STATES.has(occurrence.state)) {
      throw createStoreError('CARRIER_STATE_INVALID', 'occurrence cannot enter the requested terminal state')
    }
    occurrence.state = state
    return freezeOccurrence(occurrence)
  }

  function getOccurrence(id) {
    const occurrence = occurrences.get(id)
    return occurrence === undefined ? null : freezeOccurrence(occurrence)
  }

  function getOccurrenceByToken(token) {
    const occurrence = occurrencesByToken.get(token)
    return occurrence === undefined ? null : freezeOccurrence(occurrence)
  }

  function getOccurrences() {
    return Object.freeze([...occurrences.values()].map(freezeOccurrence))
  }

  function issuedTokens() {
    return Object.freeze([...records.keys()])
  }

  return Object.freeze({
    issue,
    findOccurrences,
    bindContext,
    markConsumed: id => markTerminal(id, 'consumed'),
    markFailed: id => markTerminal(id, 'failed'),
    getOccurrence,
    getOccurrenceByToken,
    getOccurrences,
    issuedTokens
  })
}

module.exports = { createTokenStore }
