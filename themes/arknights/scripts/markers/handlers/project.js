'use strict'

const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i
const UNSAFE_URL_CHARACTER_PATTERN = /[\u0000-\u0020\u007f-\u009f\s\\"'`{};]/u
const HTML_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})
const CSS_STRING_ESCAPES = Object.freeze({ '"': '\\"', '\\': '\\\\' })
const PROJECTS_PAGE_TYPE = 'projects'

function failure(code, reason) {
  return Object.freeze({ ok: false, code, reason })
}

function isSafeUrl(value) {
  if (typeof value !== 'string' || value === '' || UNSAFE_URL_CHARACTER_PATTERN.test(value)) {
    return false
  }
  if (value.startsWith('/')) {
    return !value.startsWith('//')
  }
  if (!ABSOLUTE_HTTP_URL_PATTERN.test(value)) {
    return false
  }
  try {
    return new URL(value).hostname !== ''
  } catch {
    return false
  }
}

function escapeHtmlText(value) {
  return value.replace(/[&<>"']/g, character => HTML_ENTITIES[character])
}

function cssUrl(value) {
  return `url("${value.replace(/["\\]/g, character => CSS_STRING_ESCAPES[character])}")`
}

function readFields(input) {
  if (input === null || typeof input !== 'object' || input.fields === null ||
      typeof input.fields !== 'object') {
    throw new TypeError('Project input fields must be an object')
  }
  return input.fields
}

function parse(input, context) {
  if (context === null || typeof context !== 'object' || context.type !== PROJECTS_PAGE_TYPE) {
    return failure('PROJECT_INVALID_PAGE', 'Project markers require a projects page')
  }

  const fields = readFields(input)
  const name = fields.name
  if (typeof name !== 'string' || name.trim() === '') {
    return failure('PROJECT_INVALID_FIELD', 'Project name must be a non-empty string')
  }
  for (const key of ['link', 'image']) {
    if (typeof fields[key] !== 'string') {
      return failure('PROJECT_INVALID_FIELD', `Project ${key} must be a string`)
    }
  }
  if (!isSafeUrl(fields.link) || !isSafeUrl(fields.image)) {
    return failure('PROJECT_INVALID_URL', 'Project link and image must be safe HTTP or root relative URLs')
  }

  return { ok: true, node: Object.freeze({ name, link: fields.link, image: fields.image }) }
}

function render(node) {
  const name = escapeHtmlText(node.name)
  return {
    html: '<a class="project-card"' +
      ` href="${escapeHtmlText(node.link)}"` +
      ' target="_blank"' +
      ' rel="noopener noreferrer"' +
      ` style="${escapeHtmlText(`--card-img: ${cssUrl(node.image)}`)}">\n` +
      `  <img src="${escapeHtmlText(node.image)}" alt="${name}" loading="lazy">\n` +
      `  <div class="project-name">${name}</div>\n` +
      '</a>'
  }
}

function toPlainText(node) {
  return node.name
}

const projectHandler = {
  name: 'Project',
  mode: 'block',
  positions: Object.freeze(['name', 'link', 'image']),
  fields: Object.freeze({
    name: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    }),
    link: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    }),
    image: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    })
  }),
  parse,
  render,
  toPlainText
}

module.exports = { projectHandler }
