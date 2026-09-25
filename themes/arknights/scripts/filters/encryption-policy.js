'use strict'

function readTagName(tag) {
  if (tag === null || typeof tag !== 'object') return undefined
  return tag.name
}

function buildTagPasswords(encryptConfig) {
  if (encryptConfig === undefined || encryptConfig === null) return new Map()
  if (typeof encryptConfig !== 'object') {
    throw new TypeError('encrypt config must be an object')
  }
  if (!Object.prototype.hasOwnProperty.call(encryptConfig, 'tags')) return new Map()
  const tagConfigs = encryptConfig.tags
  if (!Array.isArray(tagConfigs)) {
    throw new TypeError('encrypt tags must be an array')
  }

  const tagPasswords = new Map()
  for (const tagConfig of tagConfigs) {
    if (tagConfig === null || typeof tagConfig !== 'object') {
      throw new TypeError('encrypt tag config must be an object')
    }
    tagPasswords.set(String(tagConfig.name), tagConfig.password)
  }
  return tagPasswords
}

function resolveConfiguredEncryption(data, encryptConfig) {
  let password = data.password
  if (password === '') {
    return Object.freeze({
      shouldEncrypt: false,
      password: undefined,
      tagUsed: false,
      disabledByEmptyPassword: true
    })
  }

  const tagPasswords = buildTagPasswords(encryptConfig)
  const postTags = data.tags
  let tagUsed = false
  if (postTags !== undefined && postTags !== null) {
    if (typeof postTags.forEach !== 'function') {
      throw new TypeError('post tags must be iterable')
    }
    postTags.forEach(tag => {
      const tagName = readTagName(tag)
      const tagKey = String(tagName)
      if (!tagPasswords.has(tagKey)) return
      tagUsed = password ? tagUsed : tagName
      password = password || tagPasswords.get(tagKey)
    })
  }

  const shouldEncrypt = password !== undefined && password !== null
  return Object.freeze({ shouldEncrypt, password, tagUsed, disabledByEmptyPassword: false })
}

function inspectSearchEncryption(data, encryptConfig) {
  if (data === null || typeof data !== 'object') {
    return Object.freeze({ state: 'ambiguous' })
  }

  try {
    const configured = resolveConfiguredEncryption(data, encryptConfig)
    const encrypt = data.encrypt
    if (encrypt !== undefined && typeof encrypt !== 'boolean') {
      return Object.freeze({ state: 'ambiguous' })
    }
    const hasOrigin = 'origin' in data
    if (configured.shouldEncrypt || encrypt === true || hasOrigin) {
      return Object.freeze({ state: 'encrypted' })
    }
    return Object.freeze({ state: 'public' })
  } catch {
    return Object.freeze({ state: 'ambiguous' })
  }
}

module.exports = { resolveConfiguredEncryption, inspectSearchEncryption }
