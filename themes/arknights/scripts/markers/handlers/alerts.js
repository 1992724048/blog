'use strict'

const { failure } = require('./shared/result')
const { escapeHtmlText } = require('./shared/html')
const { readFields } = require('./shared/fields')

const ALERT_TYPES = Object.freeze({
  NOTE: Object.freeze({ root: 'adm-note', icon: 'i-adm i-note', color: '#22BBFF' }),
  TIP: Object.freeze({ root: 'adm-tip', icon: 'i-adm i-success', color: '#00C853' }),
  IMPORTANT: Object.freeze({ root: 'adm-important', icon: 'i-adm i-important', color: '#8B5CF6' }),
  WARNING: Object.freeze({ root: 'adm-warning', icon: 'i-adm i-warning', color: '#FFEE22' }),
  CAUTION: Object.freeze({ root: 'adm-caution', icon: 'i-adm i-failure', color: '#C0392B' })
})
const COLOR_PATTERN = /^(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const DANGEROUS_URL_PATTERN = /\b(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data):/i
const INTERNAL_STRING_PATTERN = /arknights-line-marker-v1:|data-arknights-line-marker|\u0000/u

// render/toPlainText 只抛带 code 的错误，由 materialize.buildOutcome 的既有 catch 统一收敛为
// 整枚 marker 失败；这样 render 保持 §5.2 的 `-> { html: string }` 单一返回形状，且
// §13.2 的 HANDLER_SERVICE_ERROR / ALERTS_MARKDOWN_ERROR 在探针中可断言。
function createAlertsError(code, reason) {
  return Object.assign(new Error(code), { code, reason })
}

function isNonEmptyText(value) {
  return typeof value === 'string' && /[^ \t\r\n]/.test(value)
}

function parse(input, _context) {
  const fields = readFields(input, 'Alerts')
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
  const serviceCode = 'HANDLER_SERVICE_ERROR'
  if (services === null || typeof services !== 'object' || typeof services[method] !== 'function') {
    throw createAlertsError(serviceCode, 'Alerts markdown service is unavailable')
  }
  let result
  try {
    result = services[method](source, {
      sourceField: context.sourceField,
      occurrenceId: context.occurrenceId
    })
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === serviceCode) {
      throw error
    }
    throw createAlertsError(serviceCode, 'Alerts markdown service failed')
  }
  if (typeof result !== 'string') {
    throw createAlertsError(serviceCode, 'Alerts markdown service returned a non-string value')
  }
  return result
}

function render(node, context, services) {
  const bodyHtml = callMarkdownService(services, 'renderMarkdown', node.body, context)
  if (INTERNAL_STRING_PATTERN.test(bodyHtml) || DANGEROUS_URL_PATTERN.test(bodyHtml)) {
    throw createAlertsError('ALERTS_MARKDOWN_ERROR', 'Alerts markdown output is not safe to inline')
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
  const body = callMarkdownService(services, 'markdownToPlainText', node.body, context)
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
