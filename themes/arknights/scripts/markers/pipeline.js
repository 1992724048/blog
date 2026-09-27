'use strict'

const { Marked } = require('marked')
const { scanMarkers } = require('./lexer')
const { createTokenStore } = require('./token')
const { createRegistry } = require('./registry')
const { aiHandler } = require('./handlers/ai')
const { projectHandler } = require('./handlers/project')
const { alertsHandler } = require('./handlers/alerts')
const { editorHandler } = require('./handlers/editor')
const { linkCardHandler } = require('./handlers/link-card')
const {
  createRenderCarrier,
  attachCarrierBridge,
  restoreCarrierBridge,
  restoreCarrierBridgeFromData
} = require('./carrier')
const { installMarkedExtension } = require('./marked-extension')
const { inspectSearchEncryption } = require('../filters/encryption-policy')
const { materializeField } = require('./pipeline/materialize')
const {
  normalizeLineEndings, createSharedFailureHelpers
} = require('./pipeline/failure')
const { buildProjectGroups, applyProjectGroups } = require('./pipeline/project-grid')
const { deriveExcerptProjection, readProjectedText } = require('./pipeline/projection')

const SOURCE_FIELDS = Object.freeze(['content', 'excerpt'])
const PRODUCTION_HANDLERS = Object.freeze([
  aiHandler, projectHandler, alertsHandler, editorHandler, linkCardHandler
])
const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:'])
const ALLOWED_IMAGE_SCHEMES = new Set(['http:', 'https:'])
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/
const URL_NOISE_PATTERN = /[\u0000-\u0020]/g
const HTML_TEXT_ENTITIES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })
const PENDING_STATES = new Set(['pending-render', 'excerpt-pending'])
const environmentSlots = new WeakMap()
const contextRegistrations = new WeakMap()

function escapeHtmlText(value) {
  return value.replace(/[&<>]/g, character => HTML_TEXT_ENTITIES[character])
}

function isAdjacent(source, leftEnd, rightStart) {
  const gap = source.slice(leftEnd, rightStart)
  return gap === '\n' || gap === '\r\n' || gap === '\r'
}

function createPipelineError(code, reason) {
  return Object.assign(new Error(code), { code, reason })
}

function createMarkdownServices() {
  const instance = new Marked({ sanitizeUrl: true, async: false })

  function auditArgument(source, auditContext) {
    if (typeof source !== 'string' || auditContext === null || typeof auditContext !== 'object' ||
        typeof auditContext.sourceField !== 'string' ||
        typeof auditContext.occurrenceId !== 'string') {
      throw createPipelineError('HANDLER_SERVICE_ERROR', 'markdown service argument is invalid')
    }
  }

  function isAllowedUrl(value, schemes) {
    if (typeof value !== 'string') {
      return false
    }
    const normalized = value.replace(URL_NOISE_PATTERN, '')
    if (normalized === '' || normalized.startsWith('//') || normalized.startsWith('/')) {
      return true
    }
    const match = SCHEME_PATTERN.exec(normalized)
    return match === null || schemes.has(`${match[1].toLowerCase()}:`)
  }

  function walkTokens(tokens, visit) {
    for (const token of tokens ?? []) {
      visit(token)
      walkTokens(token.tokens, visit)
      for (const item of token.items ?? []) {
        walkTokens(item.tokens, visit)
      }
      for (const cell of token.header ?? []) {
        walkTokens(cell.tokens, visit)
      }
      for (const row of token.rows ?? []) {
        for (const cell of row) {
          walkTokens(cell.tokens, visit)
        }
      }
    }
  }

  function assertAllowedUrls(tokens) {
    walkTokens(tokens, token => {
      if (token.type === 'link' && !isAllowedUrl(token.href, ALLOWED_LINK_SCHEMES)) {
        throw createPipelineError('HANDLER_SERVICE_ERROR', 'link scheme is not allowed')
      }
      if (token.type === 'image' && !isAllowedUrl(token.href, ALLOWED_IMAGE_SCHEMES)) {
        throw createPipelineError('HANDLER_SERVICE_ERROR', 'image scheme is not allowed')
      }
    })
  }

  function inlineText(tokens) {
    return (tokens ?? []).map(token => (
      token.tokens === undefined
        ? (typeof token.text === 'string' ? token.text : '')
        : inlineText(token.tokens)
    )).join('')
  }

  function blockTextOfToken(token) {
    switch (token.type) {
      case 'space':
      case 'hr':
      case 'html':
        return ''
      case 'code':
        return token.text
      case 'paragraph':
      case 'heading':
        return inlineText(token.tokens)
      case 'list':
        return (token.items ?? []).map(item => blockText(item.tokens)).join('\n')
      case 'table':
        return [...(token.header ?? []), ...(token.rows ?? []).flat()]
          .map(cell => inlineText(cell.tokens))
          .join('\n')
      default:
        return token.tokens === undefined
          ? (typeof token.text === 'string' ? token.text : '')
          : blockText(token.tokens)
    }
  }

  function blockText(tokens) {
    return (tokens ?? []).map(blockTextOfToken).join('\n')
  }

  return Object.freeze({
    renderMarkdown(source, auditContext) {
      auditArgument(source, auditContext)
      const tokens = instance.lexer(source)
      assertAllowedUrls(tokens)
      return instance.parser(tokens).replaceAll('\u0000', '')
    },
    markdownToPlainText(source, auditContext) {
      auditArgument(source, auditContext)
      return blockText(instance.lexer(source))
    }
  })
}

function isDataObject(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
}

function assertSupportedSanitizer(data) {
  const marked = data.marked
  if (marked === null || typeof marked !== 'object') {
    return
  }
  const sanitizer = marked.dompurify
  if (sanitizer === undefined || sanitizer === false) {
    return
  }
  throw createPipelineError(
    'MARKDOWN_SANITIZER_UNSUPPORTED',
    'only an absent or literal false dompurify option is supported'
  )
}

function collectSourceFields(data) {
  if (Object.hasOwn(data, 'excerpt') && typeof data.excerpt !== 'string') {
    throw createPipelineError('INVALID_EXCERPT_FIELD', 'explicit excerpt must be a string')
  }
  const fields = []
  if (typeof data.content === 'string') {
    fields.push({ field: 'content', source: data.content, explicit: false })
  }
  if (Object.hasOwn(data, 'excerpt')) {
    fields.push({ field: 'excerpt', source: data.excerpt, explicit: true })
  }
  for (const field of fields) {
    if (field.source.includes('\u0000')) {
      throw createPipelineError('UNEXPECTED_NUL', `${field.field} source contains U+0000`)
    }
  }
  return fields
}

function tokenizeField(source, store, field, captures) {
  const scan = scanMarkers(source)
  const tokens = scan.markers.map(marker => {
    const token = store.issue({ raw: marker.raw, field, sourceRange: marker.sourceRange })
    captures.set(token, Object.freeze({
      sourceRange: Object.freeze({ start: marker.sourceRange.start, end: marker.sourceRange.end }),
      raw: marker.raw,
      name: marker.name,
      physicalLines: Object.freeze(marker.physicalLines.map(line => Object.freeze({ ...line })))
    }))
    return token
  })

  let transformed = source
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const { sourceRange } = scan.markers[index]
    transformed = transformed.slice(0, sourceRange.start) + tokens[index] + transformed.slice(sourceRange.end)
  }
  return { value: transformed, tokens }
}

function tokenizeFields(fields, tokenStoreFactory) {
  const store = tokenStoreFactory({ occupiedText: fields.map(field => field.source).join('\u0000') })
  const captures = new Map()
  const transformed = fields.map(field => ({
    ...tokenizeField(field.source, store, field.field, captures),
    field: field.field,
    explicit: field.explicit
  }))
  for (const field of transformed) {
    store.findOccurrences(field.value, field.field)
  }
  return { store, captures, transformed }
}

function validatePipelineOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline options must be an object')
  }
  const allowedKeys = new Set(['handlers', 'tokenStoreFactory'])
  if (Object.keys(options).some(key => !allowedKeys.has(key))) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline option is unsupported')
  }
  if (!Object.hasOwn(options, 'handlers') || !Object.hasOwn(options, 'tokenStoreFactory')) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'handlers and tokenStoreFactory are required')
  }
  if (!Array.isArray(options.handlers) || options.handlers.length === 0) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline handlers must be a non-empty array')
  }
  const names = options.handlers.map(handler => (
    handler === null || typeof handler !== 'object' ? null : handler.name
  ))
  if (names.some(name => typeof name !== 'string') || new Set(names).size !== names.length) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline handler names must be unique')
  }
  if (typeof options.tokenStoreFactory !== 'function') {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline token store factory must be a function')
  }
}

function createMarkerPipeline(options = {}) {
  validatePipelineOptions(options)
  const { handlers, tokenStoreFactory } = options

  const registry = createRegistry()
  for (const handler of handlers) {
    registry.register(handler)
  }

  const renderStates = new WeakMap()
  const projectionStates = new WeakMap()
  const failureHelpers = createSharedFailureHelpers()
  const projectGridHelpers = Object.freeze({ isAdjacent, escapeHtmlText })
  const environment = { encryptConfig: {}, services: createMarkdownServices() }

  const beforePostRender = data => {
    if (!isDataObject(data)) {
      return data
    }
    const previous = renderStates.get(data)
    if (previous !== undefined) {
      restoreCarrierBridge(data, previous.carrier)
      for (const field of previous.fields) {
        data[field] = previous.carrier.originalField(field)
      }
      renderStates.delete(data)
    }
    projectionStates.delete(data)
    restoreCarrierBridgeFromData(data)
    assertSupportedSanitizer(data)

    const encryption = inspectSearchEncryption(data, environment.encryptConfig)
    if (encryption.state === 'encrypted') {
      return data
    }
    if (encryption.state !== 'public') {
      throw createPipelineError('ENCRYPTION_STATE_AMBIGUOUS', 'encryption state cannot be decided')
    }

    const fields = collectSourceFields(data)
    if (fields.length === 0) {
      return data
    }

    const tokenized = tokenizeFields(fields, tokenStoreFactory)
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
      for (const field of tokenized.transformed) {
        data[field.field] = field.value
      }
    } catch (error) {
      restoreCarrierBridge(data, carrier)
      for (const field of fields) {
        data[field.field] = field.source
      }
      throw error
    }

    renderStates.set(data, {
      store: tokenized.store,
      carrier,
      captures: tokenized.captures,
      fields: tokenized.transformed.map(field => field.field),
      sourcePath: typeof data.path === 'string' ? data.path : null,
      type: typeof data.type === 'string' ? data.type : null,
      explicitFields: new Set(
        tokenized.transformed.filter(field => field.explicit).map(field => field.field)
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
    const injected = Object.freeze({
      services: environment.services,
      normalizeLineEndings,
      failureHelpers,
      projectGridHelpers,
      buildProjectGroups,
      applyProjectGroups
    })

    const applyFallback = field => {
      const original = state.carrier.originalField(field)
      data[field] = failureHelpers.fieldFallbackHtml(original)
      projection[field] = failureHelpers.fieldFallbackProjection(original)
    }
    const settleField = (field, failed) => {
      for (const occurrence of state.store.getOccurrences()) {
        if (occurrence.field !== field || !PENDING_STATES.has(occurrence.state)) {
          continue
        }
        const replacement = state.replacements.get(occurrence.id)
        if (failed || replacement === undefined || replacement.failed === true) {
          state.carrier.markFailed(occurrence.id)
        } else {
          state.carrier.markConsumed(occurrence.id)
        }
      }
    }

    try {
      let audited = true
      for (const field of state.fields) {
        const current = typeof data[field] === 'string' ? data[field] : state.carrier.originalField(field)
        data[field] = current
        const materialized = materializeField(current, state, data, field, registry, injected)
        if (materialized === null) {
          audited = false
          applyFallback(field)
          settleField(field, true)
          continue
        }
        data[field] = materialized.html
        projection[field] = materialized.projection
        settleField(field, false)
      }

      if (audited !== true || state.carrier.audit().ok !== true) {
        for (const field of state.fields) {
          settleField(field, true)
          applyFallback(field)
        }
        throw createPipelineError('PIPELINE_AUDIT_FAILED', 'field audit did not reach a terminal state')
      }
      if (typeof projection.content === 'string' && projection.explicitExcerpt === false) {
        projection.excerpt = deriveExcerptProjection(projection.content)
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

  const pipeline = Object.freeze({ beforePostRender, afterPostRender, projectText })
  environmentSlots.set(pipeline, environment)
  return pipeline
}

const defaultPipeline = createMarkerPipeline({
  handlers: PRODUCTION_HANDLERS,
  tokenStoreFactory: createTokenStore
})

function bindEnvironment(pipeline, encryptConfig, services) {
  const environment = environmentSlots.get(pipeline)
  if (environment === undefined) {
    throw createPipelineError('INVALID_PIPELINE_OPTIONS', 'pipeline is not managed by this module')
  }
  environment.encryptConfig = encryptConfig
  environment.services = services
}

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

  const encryptConfig = hexoContext.config === undefined || hexoContext.config === null
    ? {}
    : hexoContext.config.encrypt
  bindEnvironment(pipeline, encryptConfig, createMarkdownServices())

  const registrationContext = { filter: hexoContext.extend.filter }
  const before = pipeline.beforePostRender
  const after = pipeline.afterPostRender
  const markedUse = markedUseArgument => {
    installMarkedExtension(markedUseArgument)
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
        void 0
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

module.exports = {
  createMarkerPipeline,
  defaultPipeline,
  registerMarkerFilters,
  beforePostRender: defaultPipeline.beforePostRender,
  afterPostRender: defaultPipeline.afterPostRender,
  projectText: defaultPipeline.projectText
}
