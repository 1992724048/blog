'use strict'

const { failure } = require('./shared/result')
const { escapeHtmlText } = require('./shared/html')
const { readFields } = require('./shared/fields')
const { isSafeUrl } = require('./shared/url')

const CSS_STRING_ESCAPES = Object.freeze({ '"': '\\"', '\\': '\\\\' })
const PROJECTS_PAGE_TYPE = 'projects'

function cssUrl(value) {
  return `url("${value.replace(/["\\]/g, character => CSS_STRING_ESCAPES[character])}")`
}

function parse(input, context) {
  if (context === null || typeof context !== 'object' || context.type !== PROJECTS_PAGE_TYPE) {
    return failure('PROJECT_INVALID_PAGE', 'Project markers require a projects page')
  }

  const fields = readFields(input, 'Project')
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
