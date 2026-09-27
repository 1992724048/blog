'use strict'

const HEADER_PATTERN = /^\[#\]>([A-Z][A-Za-z0-9_-]*)\|$/
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/
const FIELD_SEPARATOR_PATTERN = /^[ \t]*\|[ \t]*/
const MULTILINE_TRIGGER_PATTERN = /^[ \t]*\$/
const MULTILINE_OPEN_PATTERN = /^[ \t]*\$\[$/
const BLANK_LINE_PATTERN = /^[ \t]*$/
const LEADING_HORIZONTAL_PATTERN = /^[ \t]*/
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/
const HEX_PATTERN = /^0x[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/
const LINE_BREAK_PATTERN = /[\r\n]/
const VALID_TERMINATORS = new Set(['', '\n', '\r', '\r\n'])

const REASONS = Object.freeze({
  INVALID_MARKER_SOURCE: 'marker capture shape or range is invalid',
  INVALID_HEADER: 'header does not match the required form',
  INVALID_FIELD_LINE: 'field line lacks a bracketed label or the pipe separator',
  INVALID_FIELD_NAME: 'field label is not a valid lowercase field name',
  UNKNOWN_FIELD: 'field name is not defined by the schema',
  UNEXPECTED_POSITIONAL_FIELD: 'no positional field slot remains',
  DUPLICATE_FIELD: 'field is already bound',
  MISSING_REQUIRED_FIELD: 'no required schema field is bound',
  MULTILINE_INVALID_OPEN: 'multiline opener is not exactly $[',
  MULTILINE_NOT_ALLOWED: 'schema does not allow multiline values for this field',
  MULTILINE_UNEXPECTED_END: 'multiline body contains a malformed closing line',
  MULTILINE_UNCLOSED: 'multiline body has no closing line',
  INVALID_VALUE: 'value does not satisfy the schema'
})

function failure(code) {
  return Object.freeze({ ok: false, code, reason: REASONS[code] })
}

function trimHorizontal(text) {
  return text.replace(/^[ \t]+|[ \t]+$/g, '')
}

function lineContent(line) {
  return line.raw.slice(0, line.contentEnd - line.start)
}

function isBlankContent(text) {
  return BLANK_LINE_PATTERN.test(text)
}

function commonPrefix(left, right) {
  const limit = Math.min(left.length, right.length)
  let length = 0
  while (length < limit && left[length] === right[length]) {
    length += 1
  }
  return left.slice(0, length)
}

function dedentBodyLines(contents) {
  let prefix = null
  for (const content of contents) {
    if (isBlankContent(content)) {
      continue
    }
    const run = LEADING_HORIZONTAL_PATTERN.exec(content)[0]
    prefix = prefix === null ? run : commonPrefix(prefix, run)
    if (prefix === '') {
      break
    }
  }
  if (prefix === null || prefix.length === 0) {
    return contents.join('\n')
  }
  return contents
    .map((content) => (isBlankContent(content) ? content : content.slice(prefix.length)))
    .join('\n')
}

function stripLineComment(text) {
  let search = 0
  while (search < text.length) {
    const index = text.indexOf('//', search)
    if (index === -1) {
      return text
    }
    if (index > 0 && (text[index - 1] === ' ' || text[index - 1] === '\t')) {
      return trimHorizontal(text.slice(0, index))
    }
    search = index + 1
  }
  return text
}

function classifyValue(text) {
  if (text === 'null') {
    return { kind: 'null', value: null }
  }
  if (text === 'true') {
    return { kind: 'boolean', value: true }
  }
  if (text === 'false') {
    return { kind: 'boolean', value: false }
  }
  if (HEX_PATTERN.test(text)) {
    return { kind: 'hex', value: text.slice(2).toUpperCase() }
  }
  if (INTEGER_PATTERN.test(text)) {
    const numeric = Number(text)
    if (Number.isSafeInteger(numeric)) {
      return { kind: 'integer', value: numeric }
    }
  }
  return { kind: 'string', value: text }
}

function tokenizeOrdinaryValue(input) {
  if (typeof input !== 'string') {
    throw new TypeError('marker value must be a string')
  }
  const trimmed = trimHorizontal(input)
  const commented = stripLineComment(trimmed)
  const decoded = commented.replace(/\\\|/g, '|')
  const classified = classifyValue(decoded)
  return Object.freeze({ kind: classified.kind, value: classified.value, raw: input })
}

function invalidValue(reason) {
  return Object.freeze({ ok: false, code: 'INVALID_VALUE', reason })
}

function coerce(token, schema) {
  if (token === null || typeof token !== 'object') {
    return invalidValue(REASONS.INVALID_VALUE)
  }
  if (token.kind === 'null') {
    if (schema === null || typeof schema !== 'object' || schema.nullable !== true) {
      return invalidValue(REASONS.INVALID_VALUE)
    }
    const fallback = schema.defaultValue === undefined ? null : schema.defaultValue
    return Object.freeze({ ok: true, value: fallback })
  }
  if (token.kind === 'multiline-string') {
    if (schema && schema.kind === 'string' && schema.allowMultiline === true && typeof token.value === 'string') {
      return Object.freeze({ ok: true, value: token.value })
    }
    return invalidValue(REASONS.INVALID_VALUE)
  }
  if (token.kind === 'string') {
    if (schema && schema.kind === 'string' && typeof token.value === 'string') {
      return Object.freeze({ ok: true, value: token.value })
    }
    return invalidValue(REASONS.INVALID_VALUE)
  }
  if (token.kind === 'boolean') {
    if (schema && schema.kind === 'boolean' && typeof token.value === 'boolean') {
      return Object.freeze({ ok: true, value: token.value })
    }
    return invalidValue(REASONS.INVALID_VALUE)
  }
  if (token.kind === 'integer') {
    if (schema && schema.kind === 'integer' && Number.isSafeInteger(token.value)) {
      return Object.freeze({ ok: true, value: token.value })
    }
    return invalidValue(REASONS.INVALID_VALUE)
  }
  return invalidValue(REASONS.INVALID_VALUE)
}

function isPhysicalLineShapeValid(line) {
  if (line === null || typeof line !== 'object') {
    return false
  }
  if (typeof line.raw !== 'string') {
    return false
  }
  if (!Number.isInteger(line.start) || !Number.isInteger(line.end) || !Number.isInteger(line.contentEnd)) {
    return false
  }
  if (line.start < 0 || line.contentEnd < line.start || line.end < line.contentEnd) {
    return false
  }
  if (!VALID_TERMINATORS.has(line.terminator)) {
    return false
  }
  if (line.end !== line.contentEnd + line.terminator.length) {
    return false
  }
  if (line.raw.length !== line.end - line.start) {
    return false
  }
  const content = line.raw.slice(0, line.contentEnd - line.start)
  if (LINE_BREAK_PATTERN.test(content)) {
    return false
  }
  return line.raw === content + line.terminator
}

function isPhysicalLinesCaptureValid(raw, sourceRange, lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!isPhysicalLineShapeValid(line)) {
      return false
    }
    if (index === 0 && line.start !== sourceRange.start) {
      return false
    }
    if (index > 0 && line.start !== lines[index - 1].end) {
      return false
    }
    if (index < lines.length - 1 && line.terminator === '') {
      return false
    }
  }
  const last = lines[lines.length - 1]
  if (last.contentEnd !== sourceRange.end) {
    return false
  }
  return lines.map((line) => line.raw).join('') === raw + last.terminator
}

function isHeaderValid(lines, name) {
  const match = HEADER_PATTERN.exec(lineContent(lines[0]))
  return match !== null && match[1] === name
}

function validateCapture(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return failure('INVALID_MARKER_SOURCE')
  }
  const sourceRange = input.sourceRange
  if (sourceRange === null || typeof sourceRange !== 'object') {
    return failure('INVALID_MARKER_SOURCE')
  }
  const start = sourceRange.start
  const end = sourceRange.end
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    return failure('INVALID_MARKER_SOURCE')
  }
  if (typeof input.raw !== 'string' || input.raw.length !== end - start) {
    return failure('INVALID_MARKER_SOURCE')
  }
  if (!Array.isArray(input.physicalLines) || input.physicalLines.length === 0) {
    return failure('INVALID_MARKER_SOURCE')
  }
  if (!isPhysicalLinesCaptureValid(input.raw, sourceRange, input.physicalLines)) {
    return failure('INVALID_MARKER_SOURCE')
  }
  if (!isHeaderValid(input.physicalLines, input.name)) {
    return failure('INVALID_HEADER')
  }
  return { ok: true, name: input.name, sourceRange: Object.freeze({ start, end }), lines: input.physicalLines }
}

function normalizeContext(schemaContext) {
  const context = schemaContext !== null && typeof schemaContext === 'object' ? schemaContext : {}
  const positions = Array.isArray(context.positions) ? context.positions : []
  const fields = context.fields !== null && typeof context.fields === 'object' ? context.fields : {}
  return { positions, fields }
}

function resolveNamedField(fieldName, context) {
  if (typeof fieldName !== 'string' || !Object.hasOwn(context.fields, fieldName)) {
    return { ok: false, code: 'UNKNOWN_FIELD' }
  }
  return { ok: true, fieldName }
}

function resolveFieldName(label, context, positionalCount) {
  if (label !== '') {
    if (!FIELD_NAME_PATTERN.test(label)) {
      return { ok: false, code: 'INVALID_FIELD_NAME' }
    }
    return resolveNamedField(label, context)
  }
  if (positionalCount >= context.positions.length) {
    return { ok: false, code: 'UNEXPECTED_POSITIONAL_FIELD' }
  }
  const resolved = resolveNamedField(context.positions[positionalCount], context)
  if (!resolved.ok) {
    return resolved
  }
  return { ok: true, fieldName: resolved.fieldName, positional: true }
}

function consumeMultilineBody(lines, openingIndex) {
  const contents = []
  let cursor = openingIndex + 1
  while (cursor < lines.length) {
    const content = lineContent(lines[cursor])
    if (content === ']$') {
      return { ok: true, contents, closingIndex: cursor }
    }
    if (trimHorizontal(content).startsWith(']$')) {
      return failure('MULTILINE_UNEXPECTED_END')
    }
    contents.push(content)
    cursor += 1
  }
  return failure('MULTILINE_UNCLOSED')
}

function parseMultilineField(lines, openingIndex, value, schema) {
  if (!MULTILINE_OPEN_PATTERN.test(value)) {
    return failure('MULTILINE_INVALID_OPEN')
  }
  if (schema === null || typeof schema !== 'object' || schema.allowMultiline !== true) {
    return failure('MULTILINE_NOT_ALLOWED')
  }
  const consumed = consumeMultilineBody(lines, openingIndex)
  if (!consumed.ok) {
    return consumed
  }
  const closing = lines[consumed.closingIndex]
  const token = Object.freeze({
    kind: 'multiline-string',
    value: dedentBodyLines(consumed.contents),
    raw: consumed.contents.join('\n')
  })
  const entry = Object.freeze({
    token,
    sourceRange: Object.freeze({ start: lines[openingIndex].start, end: closing.contentEnd })
  })
  return { ok: true, entry, nextIndex: consumed.closingIndex + 1 }
}

function parseFieldLine(lines, index, context, fields, positionalCount) {
  const line = lines[index]
  const content = lineContent(line)
  if (!content.startsWith('[') || !content.includes(']')) {
    return failure('INVALID_FIELD_LINE')
  }
  const labelEnd = content.indexOf(']')
  const label = content.slice(1, labelEnd)

  const resolved = resolveFieldName(label, context, positionalCount)
  if (!resolved.ok) {
    return failure(resolved.code)
  }
  if (Object.hasOwn(fields, resolved.fieldName)) {
    return failure('DUPLICATE_FIELD')
  }

  // 分隔符取标签 `]` 之后首个非水平空白处的竖线，其后的竖线一律是值内字面量
  const tail = content.slice(labelEnd + 1)
  const separator = FIELD_SEPARATOR_PATTERN.exec(tail)
  if (separator === null) {
    return failure('INVALID_FIELD_LINE')
  }
  const value = tail.slice(separator[0].length)

  const schema = context.fields[resolved.fieldName]
  if (MULTILINE_TRIGGER_PATTERN.test(value)) {
    const multiline = parseMultilineField(lines, index, value, schema)
    if (!multiline.ok) {
      return multiline
    }
    return {
      ok: true,
      fieldName: resolved.fieldName,
      positional: resolved.positional === true,
      entry: multiline.entry,
      nextIndex: multiline.nextIndex
    }
  }

  const token = tokenizeOrdinaryValue(value)
  const coerced = coerce(token, schema)
  if (!coerced.ok) {
    return failure('INVALID_VALUE')
  }
  const entry = Object.freeze({
    token,
    sourceRange: Object.freeze({ start: line.start, end: line.contentEnd })
  })
  return {
    ok: true,
    fieldName: resolved.fieldName,
    positional: resolved.positional === true,
    entry,
    nextIndex: index + 1
  }
}

function checkRequired(fields, context) {
  const required = Object.keys(context.fields).filter(
    (name) =>
      context.fields[name] !== null &&
      typeof context.fields[name] === 'object' &&
      context.fields[name].required === true
  )
  if (required.some((name) => !Object.hasOwn(fields, name))) {
    return failure('MISSING_REQUIRED_FIELD')
  }
  return null
}

function parseMarker(input, schemaContext) {
  const capture = validateCapture(input)
  if (!capture.ok) {
    return capture
  }

  const context = normalizeContext(schemaContext)
  const fields = {}
  let positionalCount = 0
  let index = 1

  while (index < capture.lines.length) {
    const parsed = parseFieldLine(capture.lines, index, context, fields, positionalCount)
    if (!parsed.ok) {
      return parsed
    }
    if (parsed.positional) {
      positionalCount += 1
    }
    fields[parsed.fieldName] = parsed.entry
    index = parsed.nextIndex
  }

  const requiredFailure = checkRequired(fields, context)
  if (requiredFailure !== null) {
    return requiredFailure
  }

  return Object.freeze({
    ok: true,
    marker: Object.freeze({
      version: 1,
      mode: 'block',
      name: capture.name,
      sourceRange: capture.sourceRange,
      fields: Object.freeze(fields),
      positionalCount
    })
  })
}

module.exports = { parseMarker, tokenizeOrdinaryValue, coerce }
