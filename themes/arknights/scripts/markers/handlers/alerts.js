'use strict'

const ALERT_TYPES = Object.freeze({
  NOTE: Object.freeze({ root: 'adm-note', icon: 'i-adm i-note', color: '#22BBFF' }),
  TIP: Object.freeze({ root: 'adm-tip', icon: 'i-adm i-success', color: '#00C853' }),
  IMPORTANT: Object.freeze({ root: 'adm-important', icon: 'i-adm i-important', color: '#8B5CF6' }),
  WARNING: Object.freeze({ root: 'adm-warning', icon: 'i-adm i-warning', color: '#FFEE22' }),
  CAUTION: Object.freeze({ root: 'adm-caution', icon: 'i-adm i-failure', color: '#C0392B' })
})
const HTML_TEXT_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})
const COLOR_PATTERN = /^(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const DANGEROUS_URL_PATTERN = /\b(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data):/i
const INTERNAL_STRING_PATTERN = /arknights-line-marker-v1:|data-arknights-line-marker|\u0000/u

function failure(code, reason) {
  return Object.freeze({ ok: false, code, reason })
}

function escapeHtmlText(value) {
  return value.replace(/[&<>"']/g, character => HTML_TEXT_ENTITIES[character])
}

function readFields(input) {
  if (input === null || typeof input !== 'object' || input.fields === null ||
      typeof input.fields !== 'object') {
    throw new TypeError('Alerts input fields must be an object')
  }
  return input.fields
}

function isNonEmptyText(value) {
  return typeof value === 'string' && /[^ \t\r\n]/.test(value)
}

function parse(input, _context) {
  const fields = readFields(input)
  const type = fields.type
  if (typeof type !== 'string' || !Object.hasOwn(ALERT_TYPES, type)) {
    return failure('ALERTS_INVALID_TYPE', 'Alerts type must be NOTE, TIP, IMPORTANT, WARNING, or CAUTION')
  }

  const open = Object.hasOwn(fields, 'open') ? fields.open : true
  if (typeof open !== 'boolean') {
    return failure('ALERTS_INVALID_OPEN', 'Alerts open must be a boolean')
  }

  let title = type
  if (Object.hasOwn(fields, 'title')) {
    if (!isNonEmptyText(fields.title)) {
      return failure('ALERTS_INVALID_TITLE', 'Alerts title must be non-empty text or null')
    }
    title = fields.title
  }

  let color = ALERT_TYPES[type].color
  if (Object.hasOwn(fields, 'color')) {
    if (typeof fields.color !== 'string' || !COLOR_PATTERN.test(fields.color)) {
      return failure('ALERTS_INVALID_COLOR', 'Alerts color must be a bare 6 or 8 digit hex value')
    }
    color = `#${fields.color}`
  }

  if (!isNonEmptyText(fields.body)) {
    return failure('ALERTS_EMPTY_BODY', 'Alerts body must not be empty')
  }

  return { ok: true, node: Object.freeze({ type, open, title, color, body: fields.body }) }
}

function callMarkdownService(services, method, source, context) {
  if (services === null || typeof services !== 'object' || typeof services[method] !== 'function') {
    throw new Error('Alerts markdown service is unavailable')
  }
  let result
  try {
    result = services[method](source, {
      sourceField: context.sourceField,
      occurrenceId: context.occurrenceId
    })
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'HANDLER_SERVICE_ERROR') {
      throw error
    }
    throw new Error('Alerts markdown service failed')
  }
  if (typeof result !== 'string') {
    throw new Error('Alerts markdown service returned a non-string value')
  }
  return result
}

function render(node, context, services) {
  let bodyHtml
  try {
    bodyHtml = callMarkdownService(services, 'renderMarkdown', node.body, context)
  } catch {
    return failure('HANDLER_SERVICE_ERROR', 'Alerts markdown render is unavailable')
  }
  if (INTERNAL_STRING_PATTERN.test(bodyHtml) || DANGEROUS_URL_PATTERN.test(bodyHtml)) {
    return failure('ALERTS_MARKDOWN_ERROR', 'Alerts markdown output is not safe to inline')
  }

  const type = ALERT_TYPES[node.type]
  const state = node.open ? 'open' : 'fold'
  const expanded = node.open ? 'true' : 'false'
  return {
    html: `<div class="admonition expand-box ${type.root} ${state}"` +
      ` data-alert-type="${node.type}" style="--ex-color:${node.color}">\n` +
      '  <div class="ex-header" role="button" tabindex="0"' +
      ` aria-expanded="${expanded}">\n` +
      '    <i class="i-status" aria-hidden="true"></i>' +
      `    <i class="${type.icon}" aria-hidden="true"></i>\n` +
      `    <span class="ex-title">${escapeHtmlText(node.title)}</span>\n` +
      '  </div>\n' +
      `  <div class="ex-content">${bodyHtml}</div>\n` +
      '</div>'
  }
}

function toPlainText(node, context, services) {
  let body
  try {
    body = callMarkdownService(services, 'markdownToPlainText', node.body, context)
  } catch {
    throw new Error('Alerts markdown projection is unavailable')
  }
  return `${node.type} ${node.title}\n${body}`
}

const alertsHandler = {
  name: 'Alerts',
  mode: 'block',
  positions: Object.freeze(['type', 'open', 'title', 'color', 'body']),
  fields: Object.freeze({
    type: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    }),
    open: Object.freeze({
      kind: 'boolean', required: false, nullable: false, defaultValue: true, allowMultiline: false
    }),
    title: Object.freeze({
      kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
    }),
    color: Object.freeze({
      kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
    }),
    body: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: true
    })
  }),
  parse,
  render,
  toPlainText
}

module.exports = { alertsHandler }
