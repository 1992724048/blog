'use strict'

const { randomBytes } = require('node:crypto')

const CARRIER_SYMBOL = Symbol('arknights.markerCarrier')
const BRIDGE_KEY = 'markdown'
const ALLOWED_FIELDS = new Set(['content', 'excerpt'])
const CONTENT_AUDIT_STATES = new Set([
  'raw-restored',
  'text-preserved',
  'raw-preserved',
  'consumed',
  'failed'
])

function createCarrierError(code, reason) {
  const error = new Error(code)
  error.code = code
  error.reason = reason
  return error
}

function isSupportedMarkdownOptions(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function captureMarkdownDescriptor(data) {
  let originalDescriptor
  try {
    originalDescriptor = Object.getOwnPropertyDescriptor(data, BRIDGE_KEY)
  } catch {
    throw createCarrierError('CARRIER_BRIDGE_READ', 'markdown descriptor could not be read')
  }

  if (originalDescriptor === undefined) {
    return { originalDescriptor, hadOwnProperty: false, originalOptions: null }
  }
  let hasValue
  let configurable
  let originalOptions
  try {
    hasValue = Object.hasOwn(originalDescriptor, 'value')
    configurable = originalDescriptor.configurable
    originalOptions = originalDescriptor.value
  } catch {
    throw createCarrierError('CARRIER_BRIDGE_READ', 'markdown descriptor could not be inspected')
  }
  if (!hasValue || configurable !== true) {
    throw createCarrierError('CARRIER_BRIDGE_DESCRIPTOR', 'markdown descriptor is not bridgeable')
  }
  if (!isSupportedMarkdownOptions(originalOptions)) {
    throw createCarrierError('CARRIER_BRIDGE_DESCRIPTOR', 'markdown options are not supported')
  }
  return { originalDescriptor, hadOwnProperty: true, originalOptions }
}

function rollbackMarkdownBridge(data, captured) {
  try {
    if (!captured.hadOwnProperty) {
      const deleted = Reflect.deleteProperty(data, BRIDGE_KEY)
      if (!deleted) {
        let currentDescriptor
        try {
          currentDescriptor = Object.getOwnPropertyDescriptor(data, BRIDGE_KEY)
        } catch {
          throw new Error('rollback read failed')
        }
        if (currentDescriptor !== undefined) {
          throw new Error('rollback delete failed')
        }
      }
      return
    }
    Object.defineProperty(data, BRIDGE_KEY, captured.originalDescriptor)
  } catch {
    throw createCarrierError('CARRIER_BRIDGE_DESCRIPTOR', 'markdown descriptor could not be restored')
  }
}

function createRenderCarrier(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('carrier options must be an object')
  }
  const { data, store, fields } = options
  if (data === null || typeof data !== 'object' || store === null || typeof store !== 'object') {
    throw new TypeError('carrier data and store must be objects')
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TypeError('carrier fields must be a non-empty array')
  }
  if (Object.hasOwn(options, 'id') || Object.hasOwn(options, 'occurrences')) {
    throw new TypeError('carrier identity is store-owned')
  }

  const originalFields = new Map()
  const explicitFields = new Set()
  for (const entry of fields) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      !ALLOWED_FIELDS.has(entry.field) ||
      typeof entry.originalValue !== 'string' ||
      typeof entry.explicit !== 'boolean'
    ) {
      throw new TypeError('carrier field entry is invalid')
    }
    if (originalFields.has(entry.field)) {
      throw new TypeError('carrier field entries must be unique')
    }
    originalFields.set(entry.field, entry.originalValue)
    if (entry.explicit) {
      explicitFields.add(entry.field)
    }
  }

  const carrierId = randomBytes(16).toString('base64url')
  const originalSnapshot = new Map(originalFields)
  const snapshot = Object.freeze({
    get(field) {
      if (!ALLOWED_FIELDS.has(field)) {
        return undefined
      }
      return originalSnapshot.get(field)
    },
    has(field) {
      return originalSnapshot.has(field)
    },
    entries() {
      return originalSnapshot.entries()
    },
    keys() {
      return originalSnapshot.keys()
    },
    values() {
      return originalSnapshot.values()
    },
    [Symbol.iterator]() {
      return originalSnapshot[Symbol.iterator]()
    }
  })

  const carrier = {
    carrierId,
    findOccurrences(value, field) {
      return store.findOccurrences(value, field)
    },
    bindContext(id, context) {
      return store.bindContext(id, context)
    },
    issuedTokens() {
      return store.issuedTokens()
    },
    getOccurrence(id) {
      return store.getOccurrence(id)
    },
    getOccurrenceByToken(token) {
      return store.getOccurrenceByToken(token)
    },
    getOccurrences() {
      return store.getOccurrences()
    },
    markConsumed(id) {
      return store.markConsumed(id)
    },
    markFailed(id) {
      return store.markFailed(id)
    },
    originalField(field) {
      if (!ALLOWED_FIELDS.has(field)) {
        return undefined
      }
      return originalSnapshot.get(field)
    },
    snapshot() {
      return snapshot
    },
    audit() {
      for (const occurrence of store.getOccurrences()) {
        if (occurrence.field === 'excerpt') {
          if (explicitFields.has('excerpt') && !['consumed', 'failed'].includes(occurrence.state)) {
            return Object.freeze({
              ok: false,
              error: Object.freeze({
                code: 'CARRIER_AUDIT_FAILED',
                reason: 'explicit excerpt occurrence is not terminal'
              })
            })
          }
          continue
        }
        if (!CONTENT_AUDIT_STATES.has(occurrence.state)) {
          return Object.freeze({
            ok: false,
            error: Object.freeze({
              code: 'CARRIER_AUDIT_FAILED',
              reason: 'content occurrence is not terminal'
            })
          })
        }
      }
      return Object.freeze({ ok: true })
    }
  }
  return Object.freeze(carrier)
}

function attachCarrierBridge(data, carrier) {
  if (data === null || typeof data !== 'object' || carrier === null || typeof carrier !== 'object') {
    throw new TypeError('bridge data and carrier must be objects')
  }
  const captured = captureMarkdownDescriptor(data)
  let temporaryOptions
  try {
    temporaryOptions = captured.hadOwnProperty ? { ...captured.originalOptions } : {}
  } catch {
    throw createCarrierError('CARRIER_BRIDGE_READ', 'markdown options could not be copied')
  }

  try {
    Object.defineProperty(temporaryOptions, CARRIER_SYMBOL, {
      value: carrier,
      enumerable: true,
      configurable: true,
      writable: false
    })
  } catch {
    throw createCarrierError('CARRIER_BRIDGE_DEFINE', 'carrier symbol could not be defined')
  }

  try {
    Object.defineProperty(data, BRIDGE_KEY, {
      value: temporaryOptions,
      enumerable: false,
      configurable: true,
      writable: true
    })
  } catch {
    rollbackMarkdownBridge(data, captured)
    throw createCarrierError('CARRIER_BRIDGE_DEFINE', 'markdown bridge could not be installed')
  }

  bridgeStates.set(data, { carrier, captured })
  return Object.freeze({
    originalDescriptor: captured.originalDescriptor,
    temporaryOptions,
    carrierId: carrier.carrierId
  })
}

const bridgeStates = new WeakMap()

function restoreCarrierBridge(data, carrier) {
  const state = bridgeStates.get(data)
  if (state === undefined) {
    return Object.freeze({ restored: false })
  }
  if (state.carrier !== carrier) {
    return Object.freeze({ restored: false })
  }
  rollbackMarkdownBridge(data, state.captured)
  bridgeStates.delete(data)
  return Object.freeze({ restored: true })
}

function getCarrierFromOptions(options, expectedCarrier) {
  if (options === null || typeof options !== 'object' || expectedCarrier === null ||
      typeof expectedCarrier !== 'object') {
    return null
  }
  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(options, CARRIER_SYMBOL)
  } catch {
    return null
  }
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') ||
      descriptor.value !== expectedCarrier) {
    return null
  }
  return descriptor.value
}

module.exports = {
  CARRIER_SYMBOL,
  createRenderCarrier,
  attachCarrierBridge,
  restoreCarrierBridge,
  getCarrierFromOptions
}
