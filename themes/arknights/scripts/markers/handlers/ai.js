'use strict'

const { createHash } = require('node:crypto')

const AI_BADGES = Object.freeze({
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
const OCCURRENCE_ID_PATTERN = /^o[0-9]+$/
const ROBOT_ICON =
  '<svg class="ai-badge__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
  '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

function failure(code, reason) {
  return {
    ok: false,
    error: Object.freeze({ code, reason })
  }
}

function readArgumentCount(args) {
  try {
    return Array.isArray(args) ? args.length : null
  } catch {
    return null
  }
}

function readOwnDataValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined
}

function readArgumentFields(args, index) {
  try {
    const argument = readOwnDataValue(args, index)
    if (argument === null || typeof argument !== 'object' || Array.isArray(argument)) {
      return null
    }
    return {
      type: readOwnDataValue(argument, 'type'),
      value: readOwnDataValue(argument, 'value')
    }
  } catch {
    return null
  }
}

function escapeHtmlText(value) {
  return value.replace(/[&<>"']/g, character => HTML_TEXT_ENTITIES[character])
}

function createTooltipId(context) {
  if (context === null || typeof context !== 'object' ||
      !['content', 'excerpt'].includes(context.sourceField) ||
      typeof context.occurrenceId !== 'string' ||
      !OCCURRENCE_ID_PATTERN.test(context.occurrenceId) ||
      (context.sourcePath !== null && typeof context.sourcePath !== 'string')) {
    throw new Error('AI tooltip identity is invalid')
  }
  const pathNamespace = createHash('sha256')
    .update(context.sourcePath ?? '', 'utf8')
    .digest('hex')
    .slice(0, 16)
  return `arknights-ai-tip-${context.sourceField}-${pathNamespace}-${context.occurrenceId}`
}

const TIP_ROWS = Object.values(AI_BADGES)
  .map(
    badge =>
      `<span class="ai-badge__tip-row" role="row">` +
      `<span class="ai-badge__tip-cell ai-badge__tip-tag ai-badge--${badge.key}" role="cell">${escapeHtmlText(badge.label)}</span>` +
      `<span class="ai-badge__tip-cell ai-badge__tip-desc" role="cell">${escapeHtmlText(badge.description)}</span>` +
      `</span>`
  )
  .join('')

function parseAi(args, context) {
  const argumentCount = readArgumentCount(args)
  if (argumentCount === null || argumentCount < 1 || argumentCount > 2) {
    return failure('AI_ARGUMENT_COUNT', 'AI marker requires one or two arguments')
  }

  const stateArgument = readArgumentFields(args, 0)
  if (
    stateArgument === null ||
    stateArgument.type !== 'enum' ||
    typeof stateArgument.value !== 'string' ||
    !Object.hasOwn(AI_BADGES, stateArgument.value)
  ) {
    return failure('AI_INVALID_STATE', 'AI state must be PASS, EDIT, UNKN, or NONE')
  }

  let text = null
  if (argumentCount === 2) {
    const textArgument = readArgumentFields(args, 1)
    const isNull = textArgument !== null &&
      textArgument.type === 'null' &&
      textArgument.value === null
    const isValidText = textArgument !== null &&
      textArgument.type === 'text' &&
      typeof textArgument.value === 'string' &&
      textArgument.value.length >= 1 &&
      textArgument.value.length <= 40
    if (!isNull && !isValidText) {
      return failure('AI_INVALID_TEXT', 'AI text must be null or 1 to 40 UTF-16 code units')
    }
    text = isNull ? null : textArgument.value
  }

  return {
    ok: true,
    node: Object.freeze({
      markerName: 'AI',
      mode: context.mode,
      state: stateArgument.value,
      text
    })
  }
}

function renderAiBadge(node, context) {
  const badge = AI_BADGES[node.state]
  const text = node.text === null
    ? ''
    : `<span class="ai-badge__text">${escapeHtmlText(node.text)}</span>`
  const tooltipId = createTooltipId(context)

  return `<span class="ai-badge ai-badge--${badge.key}" tabindex="0" aria-describedby="${tooltipId}">` +
    `<span class="ai-badge__icon">${ROBOT_ICON}</span>` +
    `<span class="ai-badge__status">${escapeHtmlText(badge.label)}</span>` +
    text +
    `<span class="ai-badge__tip" id="${tooltipId}" role="tooltip">` +
    `<span class="ai-badge__tip-title">AI 生成内容标记</span>` +
    `<span class="ai-badge__tip-table" role="table">` +
    TIP_ROWS +
    `</span>` +
    `</span>` +
    `</span>`
}

function projectAiText(node) {
  return node.text === null ? node.state : `${node.state} ${node.text}`
}

const aiHandler = Object.freeze({
  name: 'AI',
  modes: Object.freeze(['block', 'inline']),
  parse: parseAi,
  render: renderAiBadge,
  toPlainText: projectAiText
})

module.exports = { aiHandler }
