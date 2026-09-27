'use strict'

const { failure } = require('./shared/result')
const { escapeHtmlText } = require('./shared/html')
const { readFields } = require('./shared/fields')

const LANGUAGE_PATTERN = /^[\S ]{1,64}$/u
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const THEME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const NUMBER_MIN = 1
const NUMBER_MAX = 2147483647

function parse(input, _context) {
  const fields = readFields(input, 'Editor')

  const language = Object.hasOwn(fields, 'language') ? fields.language : 'plaintext'
  if (typeof language !== 'string' || !LANGUAGE_PATTERN.test(language) ||
      CONTROL_CHARACTER_PATTERN.test(language)) {
    return failure('EDITOR_INVALID_LANGUAGE', 'Editor language must be 1 to 64 printable characters')
  }

  const number = Object.hasOwn(fields, 'number') ? fields.number : 1
  if (!Number.isInteger(number) || number < NUMBER_MIN || number > NUMBER_MAX) {
    return failure('EDITOR_INVALID_NUMBER', `Editor number must be an integer in ${NUMBER_MIN}..${NUMBER_MAX}`)
  }

  const theme = Object.hasOwn(fields, 'theme') ? fields.theme : 'vs-dark'
  if (typeof theme !== 'string' || !THEME_PATTERN.test(theme)) {
    return failure('EDITOR_INVALID_THEME', 'Editor theme must match [A-Za-z0-9_-]{1,64}')
  }

  const body = fields.body
  if (typeof body !== 'string' || !/[^\s]/.test(body)) {
    return failure('EDITOR_EMPTY_BODY', 'Editor body must not be empty')
  }

  return { ok: true, node: Object.freeze({ language, number, theme, body }) }
}

function render(node) {
  return {
    html: '<div class="monaco-editor-code"' +
      ` data-number="${node.number}"` +
      ` data-lang="${escapeHtmlText(node.language)}"` +
      ` data-theme="${escapeHtmlText(node.theme)}">` +
      `<pre class="monaco-editor-source" hidden aria-hidden="true">${escapeHtmlText(node.body)}</pre>` +
      '</div>'
  }
}

function toPlainText(node) {
  return node.body
}

const editorHandler = {
  name: 'Editor',
  mode: 'block',
  positions: Object.freeze(['language', 'number', 'theme', 'body']),
  fields: Object.freeze({
    language: Object.freeze({
      kind: 'string', required: false, nullable: false, defaultValue: 'plaintext', allowMultiline: false
    }),
    number: Object.freeze({
      kind: 'integer', required: false, nullable: false, defaultValue: 1, allowMultiline: false
    }),
    theme: Object.freeze({
      kind: 'string', required: false, nullable: false, defaultValue: 'vs-dark', allowMultiline: false
    }),
    body: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: true
    })
  }),
  parse,
  render,
  toPlainText
}

module.exports = { editorHandler }
