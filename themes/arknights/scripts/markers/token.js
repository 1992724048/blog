'use strict'

const { createHmac, randomBytes: createRandomBytes, timingSafeEqual } = require('node:crypto')

const VERSION = 1
const TOKEN_PREFIX = 'arknights-marker-v1:'
const NONCE_BYTES = 24
const NONCE_TEXT_LENGTH = 32
const CHECKSUM_TEXT_LENGTH = 43
const TOKEN_TEXT_LENGTH = TOKEN_PREFIX.length + NONCE_TEXT_LENGTH + 1 + CHECKSUM_TEXT_LENGTH
const MAX_GENERATION_ATTEMPTS = 32
const TOKEN_PATTERN = /^arknights-marker-v1:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43}$/
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/
const ENUM_PATTERN = /^[A-Z][A-Z0-9_-]*$/
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/

function isValidMode(mode) {
  return mode === 'block' || mode === 'inline'
}

function copyRandomBytes(value, label) {
  if (!Buffer.isBuffer(value) && !ArrayBuffer.isView(value)) {
    throw new TypeError(`${label} must return a byte array`)
  }
  const bytes = Buffer.from(value)
  if (bytes.length === 0) {
    throw new TypeError(`${label} must not be empty`)
  }
  return bytes
}

function copyParsedArgument(argument) {
  if (argument === null || typeof argument !== 'object' || Array.isArray(argument)) {
    throw new TypeError('parsed argument must be an object')
  }
  if (argument.type === 'enum' && typeof argument.value === 'string' && ENUM_PATTERN.test(argument.value)) {
    return Object.freeze({ type: 'enum', value: argument.value })
  }
  if (argument.type === 'text' && typeof argument.value === 'string') {
    return Object.freeze({ type: 'text', value: argument.value })
  }
  if (argument.type === 'null' && argument.value === null) {
    return Object.freeze({ type: 'null', value: null })
  }
  throw new TypeError('parsed argument has an invalid type or value')
}

function createTokenStore(options) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('options must be an object')
  }
  if (typeof options.occupiedText !== 'string') {
    throw new TypeError('occupiedText must be a string')
  }

  const randomBytes = options.randomBytes ?? createRandomBytes
  if (typeof randomBytes !== 'function') {
    throw new TypeError('randomBytes must be a function')
  }

  const storeKey = copyRandomBytes(randomBytes(32), 'store key randomBytes')
  const records = new Map()

  function calculateChecksum(nonce, mode, raw) {
    const payload = JSON.stringify([VERSION, nonce, mode, raw])
    return createHmac('sha256', storeKey).update(payload, 'utf8').digest('base64url')
  }

  function issue(input) {
    if (input === null || typeof input !== 'object') {
      throw new TypeError('token input must be an object')
    }
    if (typeof input.raw !== 'string') {
      throw new TypeError('token raw must be a string')
    }
    if (!isValidMode(input.mode)) {
      throw new TypeError('token mode must be block or inline')
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const nonceBytes = copyRandomBytes(randomBytes(NONCE_BYTES), 'nonce randomBytes')
      if (nonceBytes.length !== NONCE_BYTES) {
        throw new TypeError(`nonce randomBytes must return ${NONCE_BYTES} bytes`)
      }

      const nonce = nonceBytes.toString('base64url')
      const checksum = calculateChecksum(nonce, input.mode, input.raw)
      const token = `${TOKEN_PREFIX}${nonce}:${checksum}`
      const collides = options.occupiedText.includes(token) ||
        input.raw.includes(token) ||
        Array.from(records.keys()).some((issuedToken) => issuedToken.includes(token))

      if (!collides) {
        const record = Object.freeze({
          version: VERSION,
          mode: input.mode,
          raw: input.raw,
          name: null,
          args: null,
          nonce,
          checksum
        })
        records.set(token, record)
        return token
      }
    }

    const error = new Error('TOKEN_GENERATION_EXHAUSTED')
    error.code = 'TOKEN_GENERATION_EXHAUSTED'
    throw error
  }

  function lookup(token) {
    if (typeof token !== 'string') {
      return null
    }
    return records.get(token) ?? null
  }

  function hasValidChecksum(record) {
    const expected = Buffer.from(calculateChecksum(record.nonce, record.mode, record.raw), 'base64url')
    const actual = Buffer.from(record.checksum, 'base64url')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  function decode(token, expectedMode) {
    if (expectedMode !== undefined && !isValidMode(expectedMode)) {
      return null
    }
    const record = lookup(token)
    if (record === null || !TOKEN_PATTERN.test(token) || record.version !== VERSION) {
      return null
    }
    if (!hasValidChecksum(record) || (expectedMode !== undefined && record.mode !== expectedMode)) {
      return null
    }
    return record
  }

  function attachParsed(token, metadata) {
    const record = lookup(token)
    if (record === null || decode(token) === null) {
      throw new Error('UNKNOWN_TOKEN')
    }
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new TypeError('parsed metadata must be an object')
    }
    if (typeof metadata.name !== 'string' || !NAME_PATTERN.test(metadata.name)) {
      throw new TypeError('parsed marker name is invalid')
    }
    if (!Array.isArray(metadata.args) || metadata.args.length === 0) {
      throw new TypeError('parsed marker args must be a non-empty array')
    }

    const args = []
    for (let index = 0; index < metadata.args.length; index += 1) {
      args.push(copyParsedArgument(metadata.args[index]))
    }

    records.set(
      token,
      Object.freeze({
        version: record.version,
        mode: record.mode,
        raw: record.raw,
        name: metadata.name,
        args: Object.freeze(args),
        nonce: record.nonce,
        checksum: record.checksum
      })
    )
  }

  function readTokenAt(content, start) {
    if (!TOKEN_PATTERN.test(content.slice(start, start + TOKEN_TEXT_LENGTH))) {
      return null
    }
    const end = start + TOKEN_TEXT_LENGTH
    if (end > content.length) {
      return null
    }
    if (start > 0 && TOKEN_PART_PATTERN.test(content[start - 1])) {
      return null
    }
    if (end < content.length && TOKEN_PART_PATTERN.test(content[end])) {
      return null
    }

    const token = content.slice(start, end)
    return { token, end }
  }

  function findTokens(content) {
    if (typeof content !== 'string') {
      throw new TypeError('content must be a string')
    }

    const found = []
    let searchStart = 0
    while (searchStart < content.length) {
      const start = content.indexOf(TOKEN_PREFIX, searchStart)
      if (start === -1) {
        break
      }
      const tokenMatch = readTokenAt(content, start)
      if (tokenMatch === null) {
        searchStart = start + TOKEN_PREFIX.length
        continue
      }

      const record = decode(tokenMatch.token)
      if (record !== null) {
        found.push({ token: tokenMatch.token, start, end: tokenMatch.end, record })
      }
      searchStart = tokenMatch.end
    }
    return found
  }

  function restore(content) {
    const found = findTokens(content)
    let restored = content
    for (let index = found.length - 1; index >= 0; index -= 1) {
      const occurrence = found[index]
      restored = restored.slice(0, occurrence.start) + occurrence.record.raw + restored.slice(occurrence.end)
    }
    return restored
  }

  return { issue, attachParsed, lookup, decode, findTokens, restore }
}

module.exports = { createTokenStore }
