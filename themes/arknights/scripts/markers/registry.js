'use strict'

const SUPPORTED_MODES = new Set(['block'])
const HANDLER_METHODS = Object.freeze(['parse', 'render', 'toPlainText'])
const HANDLER_NAME_PATTERN = /^[A-Z][A-Za-z0-9_-]*$/

function registrationError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function failure(code, reason) {
  return Object.freeze({ ok: false, code, reason })
}

function validatePositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw registrationError('INVALID_HANDLER', 'handler positions must be a non-empty array')
  }
  for (const position of positions) {
    if (typeof position !== 'string' || position === '') {
      throw registrationError('INVALID_HANDLER', 'handler position must be a non-empty string')
    }
  }
}

function validateHandler(handler) {
  if (typeof handler !== 'object' || handler === null || Array.isArray(handler)) {
    throw registrationError('INVALID_HANDLER', 'handler must be an object')
  }
  if (typeof handler.name !== 'string' || !HANDLER_NAME_PATTERN.test(handler.name)) {
    throw registrationError('INVALID_HANDLER', 'handler name must start with an uppercase letter')
  }
  if (!SUPPORTED_MODES.has(handler.mode)) {
    throw registrationError('INVALID_HANDLER', `unsupported handler mode: ${String(handler.mode)}`)
  }
  validatePositions(handler.positions)
  if (typeof handler.fields !== 'object' || handler.fields === null || Array.isArray(handler.fields)) {
    throw registrationError('INVALID_HANDLER', 'handler fields must be an object')
  }
  for (const method of HANDLER_METHODS) {
    if (typeof handler[method] !== 'function') {
      throw registrationError('INVALID_HANDLER', `handler ${method} must be a function`)
    }
  }
}

function createRegistry() {
  const handlers = new Map()

  return {
    get(name) {
      return handlers.get(name) ?? null
    },

    register(handler) {
      validateHandler(handler)
      if (handlers.has(handler.name)) {
        throw registrationError('DUPLICATE_HANDLER', `handler already registered: ${handler.name}`)
      }
      handlers.set(handler.name, handler)
    },

    dispatch(name, input, context) {
      const handler = handlers.get(name)
      if (handler === undefined) {
        return failure('UNKNOWN_MARKER', `marker handler is not registered: ${String(name)}`)
      }
      try {
        const result = handler.parse(input, context)
        if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean') {
          return failure('HANDLER_ERROR', `handler ${name} returned an invalid parse result`)
        }
        if (result.ok) {
          return { ok: true, handler, node: result.node }
        }
        return failure(
          typeof result.code === 'string' ? result.code : 'HANDLER_ERROR',
          typeof result.reason === 'string' ? result.reason : `handler ${name} rejected its input`
        )
      } catch {
        return failure('HANDLER_ERROR', `handler ${name} failed during parse`)
      }
    }
  }
}

module.exports = { createRegistry }
