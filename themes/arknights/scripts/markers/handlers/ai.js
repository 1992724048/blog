'use strict'

const { createHash } = require('node:crypto')

const AI_STATES = Object.freeze({
  PASS: Object.freeze({ key: 'pass', label: 'PASS', description: '已人工审核通过' }),
  EDIT: Object.freeze({ key: 'edit', label: 'EDIT', description: '经人工审核并被人工修改' }),
  UNKN: Object.freeze({ key: 'unkn', label: 'UNKN', description: '未知，无法判断' }),
  NONE: Object.freeze({ key: 'none', label: 'NONE', description: '未经人工审核' })
})
const HTML_TEXT_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})
const SOURCE_FIELDS = new Set(['content', 'excerpt'])
const TEXT_MAX_LENGTH = 40
const ANONYMOUS_NAMESPACE = 'anonymous'
const ROBOT_ICON =
  '<svg class="ai-badge__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
  '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

function failure(code, reason) {
  return Object.freeze({ ok: false, code, reason })
}

function escapeHtmlText(value) {
  return value.replace(/[&<>"']/g, character => HTML_TEXT_ENTITIES[character])
}

function pathNamespace(sourcePath) {
  if (sourcePath === null || sourcePath === undefined) {
    return ANONYMOUS_NAMESPACE
  }
  if (typeof sourcePath !== 'string') {
    throw new TypeError('AI source path must be a string or null')
  }
  return createHash('sha256').update(sourcePath, 'utf8').digest('hex').slice(0, 16)
}

function tooltipId(context) {
  if (context === null || typeof context !== 'object' ||
      !SOURCE_FIELDS.has(context.sourceField) ||
      typeof context.occurrenceId !== 'string' ||
      context.occurrenceId === '') {
    throw new TypeError('AI tooltip identity is invalid')
  }
  return `arknights-ai-tip-${context.sourceField}-${pathNamespace(context.sourcePath)}-${context.occurrenceId}`
}

const TIP_ROWS = Object.values(AI_STATES)
  .map(
    badge =>
      `<span class="ai-badge__tip-row" role="row">` +
      `<span class="ai-badge__tip-cell ai-badge__tip-tag ai-badge--${badge.key}" role="cell">${escapeHtmlText(badge.label)}</span>` +
      `<span class="ai-badge__tip-cell ai-badge__tip-desc" role="cell">${escapeHtmlText(badge.description)}</span>` +
      `</span>`
  )
  .join('')

function readFields(input) {
  if (input === null || typeof input !== 'object' || input.fields === null ||
      typeof input.fields !== 'object') {
    throw new TypeError('AI input fields must be an object')
  }
  return input.fields
}

function parse(input, _context) {
  const fields = readFields(input)
  const state = fields.state
  if (typeof state !== 'string' || !Object.hasOwn(AI_STATES, state)) {
    return failure('AI_INVALID_STATE', 'AI state must be PASS, EDIT, UNKN, or NONE')
  }

  let text = null
  if (Object.hasOwn(fields, 'text')) {
    const candidate = fields.text
    if (typeof candidate !== 'string' || candidate.length < 1 || candidate.length > TEXT_MAX_LENGTH) {
      return failure('AI_INVALID_TEXT', 'AI text must be 1 to 40 UTF-16 code units')
    }
    text = candidate
  }

  return { ok: true, node: Object.freeze({ state, text }) }
}

function render(node, context) {
  const badge = AI_STATES[node.state]
  const text = node.text === null
    ? ''
    : `<span class="ai-badge__text">${escapeHtmlText(node.text)}</span>`
  const id = tooltipId(context)

  return {
    html: `<span class="ai-badge ai-badge--${badge.key}" tabindex="0" aria-describedby="${id}">` +
      `<span class="ai-badge__icon">${ROBOT_ICON}</span>` +
      `<span class="ai-badge__status">${escapeHtmlText(badge.label)}</span>` +
      text +
      `<span class="ai-badge__tip" id="${id}" role="tooltip">` +
      `<span class="ai-badge__tip-title">AI 生成内容标记</span>` +
      `<span class="ai-badge__tip-table" role="table">` +
      TIP_ROWS +
      `</span>` +
      `</span>` +
      `</span>`
  }
}

function toPlainText(node) {
  return node.text === null ? node.state : `${node.state} ${node.text}`
}

const aiHandler = {
  name: 'AI',
  mode: 'block',
  positions: Object.freeze(['state', 'text']),
  fields: Object.freeze({
    state: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    }),
    text: Object.freeze({
      kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
    })
  }),
  parse,
  render,
  toPlainText
}

module.exports = { aiHandler }
