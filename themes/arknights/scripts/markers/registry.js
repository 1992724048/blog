'use strict'

const SUPPORTED_MODES = new Set(['block', 'inline'])
const HANDLER_METHODS = ['parse', 'render', 'toPlainText']

function registrationError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function failure(code, reason) {
  return {
    ok: false,
    error: Object.freeze({ code, reason })
  }
}

function validateHandler(handler) {
  if (typeof handler !== 'object' || handler === null || Array.isArray(handler)) {
    throw registrationError('INVALID_HANDLER', 'handler must be an object')
  }
  if (typeof handler.name !== 'string' || handler.name.trim() === '') {
    throw registrationError('INVALID_HANDLER', 'handler name must be a non-empty string')
  }
  if (!Array.isArray(handler.modes) || handler.modes.length === 0) {
    throw registrationError('INVALID_HANDLER', 'handler modes must be a non-empty array')
  }

  const seenModes = new Set()
  for (const mode of handler.modes) {
    if (!SUPPORTED_MODES.has(mode)) {
      throw registrationError('INVALID_HANDLER', `unsupported handler mode: ${String(mode)}`)
    }
    if (seenModes.has(mode)) {
      throw registrationError('INVALID_HANDLER', `duplicate handler mode: ${mode}`)
    }
    seenModes.add(mode)
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

    dispatch(name, args, context) {
      const handler = handlers.get(name)
      if (handler === undefined) {
        return failure('UNKNOWN_MARKER', `marker handler is not registered: ${String(name)}`)
      }

      const mode = context === null || typeof context !== 'object' ? null : context.mode
      if (!handler.modes.includes(mode)) {
        return failure('UNSUPPORTED_MODE', `handler ${name} does not support mode: ${String(mode)}`)
      }

      try {
        const result = handler.parse(args, context)
        if (result.ok === true) {
          return { ok: true, handler, node: result.node }
        }
        return result
      } catch {
        return failure('HANDLER_ERROR', `handler ${name} failed during parse`)
      }
    }
  }
}

module.exports = { createRegistry }
