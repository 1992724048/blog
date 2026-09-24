'use strict'

const { randomBytes } = require('node:crypto')

const SENTINEL_NONCE_BYTES = 24
const MAX_SENTINEL_GENERATION_ATTEMPTS = 32

function createSentinelError() {
  const error = new Error('SENTINEL_GENERATION_EXHAUSTED')
  error.code = 'SENTINEL_GENERATION_EXHAUSTED'
  return error
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createSentinelContext(occupiedText) {
  let namespace = null
  let nextCardId = 0
  let occupied = typeof occupiedText === 'string' ? occupiedText : ''
  const issued = new Set()

  function createNamespace(extraText) {
    for (let attempt = 0; attempt < MAX_SENTINEL_GENERATION_ATTEMPTS; attempt += 1) {
      const bytes = randomBytes(SENTINEL_NONCE_BYTES)
      if (!Buffer.isBuffer(bytes) || bytes.length !== SENTINEL_NONCE_BYTES) {
        throw new TypeError('sentinel randomBytes must return 24 bytes')
      }
      const candidate = bytes.toString('base64url')
      if (!occupied.includes(candidate) && !extraText.includes(candidate)) {
        namespace = candidate
        return
      }
    }
    throw createSentinelError()
  }

  function ensureNamespace(extraText) {
    if (namespace === null) {
      createNamespace(extraText)
    }
  }

  function createCardSentinel(extraText) {
    const additionalText = typeof extraText === 'string' ? extraText : ''
    for (let attempt = 0; attempt < MAX_SENTINEL_GENERATION_ATTEMPTS; attempt += 1) {
      ensureNamespace(additionalText)
      const id = String(nextCardId)
      const sentinel = `\u0000arknights-pj-card-${namespace}-${id}\u0000`
      if (!occupied.includes(sentinel) && !additionalText.includes(sentinel) && !issued.has(sentinel)) {
        issued.add(sentinel)
        occupied += additionalText
        nextCardId += 1
        return { id, sentinel }
      }
      namespace = null
    }
    throw createSentinelError()
  }

  function createGridSentinels(id, additionalText) {
    const text = typeof additionalText === 'string' ? additionalText : ''
    ensureNamespace(text)
    const open = `\u0000arknights-grid-open-${namespace}-${id}\u0000`
    const close = `\u0000arknights-grid-close-${namespace}-${id}\u0000`
    if (occupied.includes(open) || occupied.includes(close) ||
      text.includes(open) || text.includes(close) || issued.has(open) || issued.has(close)) {
      throw createSentinelError()
    }
    issued.add(open)
    issued.add(close)
    occupied += text
    return { open, close }
  }

  function findCardSentinels(value) {
    if (namespace === null) {
      return []
    }
    const pattern = new RegExp(
      `\\u0000arknights-pj-card-${escapeRegExp(namespace)}-(\\d+)\\u0000`,
      'g'
    )
    return [...value.matchAll(pattern)].map(match => ({
      id: match[1],
      sentinel: match[0],
      start: match.index,
      end: match.index + match[0].length
    }))
  }

  function findGridSentinels(value) {
    if (namespace === null) {
      return []
    }
    const escapedNamespace = escapeRegExp(namespace)
    const pattern = new RegExp(
      `\\u0000arknights-grid-open-${escapedNamespace}-(\\d+)\\u0000([\\s\\S]*?)\\u0000arknights-grid-close-${escapedNamespace}-\\1\\u0000`,
      'g'
    )
    return [...value.matchAll(pattern)].map(match => {
      const contentStart = match[0].indexOf(match[2])
      return {
        id: match[1],
        open: match[0].slice(0, contentStart),
        close: match[0].slice(contentStart + match[2].length),
        start: match.index,
        end: match.index + match[0].length,
        content: match[2]
      }
    })
  }

  function hasUnconsumed(value) {
    for (const sentinel of issued) {
      if (value.includes(sentinel)) {
        return true
      }
    }
    return false
  }

  return {
    createCardSentinel,
    createGridSentinels,
    findCardSentinels,
    findGridSentinels,
    hasUnconsumed,
    assertFullyConsumed(value = '') {
      if (value.includes('\u0000')) {
        const error = new Error('UNEXPECTED_NUL')
        error.code = 'UNEXPECTED_NUL'
        throw error
      }
      if (hasUnconsumed(value)) {
        const error = new Error('UNCONSUMED_SENTINEL')
        error.code = 'UNCONSUMED_SENTINEL'
        throw error
      }
    }
  }
}

module.exports = { createSentinelContext }
