'use strict'

const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:'])
const UNSAFE_URL_CHARACTER_PATTERN = /[\u0000-\u0020\u007f-\u009f\s\\"'`{};]/u
const UNSAFE_CSS_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const HTML_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})
const CSS_STRING_ESCAPES = Object.freeze({
  '"': '\\"',
  '\\': '\\\\'
})

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

function isNonEmptyText(argument) {
  return argument !== null &&
    argument.type === 'text' &&
    typeof argument.value === 'string' &&
    argument.value.trim() !== ''
}

function isSafeUrl(value) {
  if (typeof value !== 'string' || UNSAFE_URL_CHARACTER_PATTERN.test(value)) {
    return false
  }
  if (value.startsWith('/')) {
    return !value.startsWith('//')
  }
  if (!ABSOLUTE_HTTP_URL_PATTERN.test(value)) {
    return false
  }

  try {
    const parsedUrl = new URL(value)
    return SAFE_URL_PROTOCOLS.has(parsedUrl.protocol) && parsedUrl.hostname !== ''
  } catch {
    return false
  }
}

function serializeHtmlText(value) {
  return value.replace(/[&<>"']/g, character => HTML_ENTITIES[character])
}

function serializeHtmlAttribute(value) {
  return value.replace(/[&<>"']/g, character => HTML_ENTITIES[character])
}

function serializeCssUrl(value) {
  if (UNSAFE_CSS_CHARACTER_PATTERN.test(value)) {
    throw new TypeError('CSS URL contains a control character')
  }
  const escapedValue = value.replace(/["\\]/g, character => CSS_STRING_ESCAPES[character])
  return `url("${escapedValue}")`
}

function readProjectNode(node) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new TypeError('PJ node must be an object')
  }
  const { projectName, link, image } = node
  if (
    node.markerName !== 'PJ' ||
    node.mode !== 'block' ||
    typeof projectName !== 'string' ||
    projectName.trim() === '' ||
    !isSafeUrl(link) ||
    !isSafeUrl(image)
  ) {
    throw new TypeError('PJ node is invalid')
  }
  return { projectName, link, image }
}

function parseProjects(args, context) {
  const argumentCount = readArgumentCount(args)
  if (argumentCount === null || argumentCount !== 3) {
    return failure('PJ_ARGUMENT_COUNT', 'PJ marker requires exactly three arguments')
  }

  const fields = [
    readArgumentFields(args, 0),
    readArgumentFields(args, 1),
    readArgumentFields(args, 2)
  ]
  if (!fields.every(isNonEmptyText)) {
    return failure('PJ_INVALID_FIELD', 'PJ fields must be non-empty text arguments')
  }
  if (context === null || typeof context !== 'object' || context.type !== 'projects') {
    return failure('PJ_INVALID_PAGE', 'PJ markers require a projects page')
  }
  if (context.mode !== 'block') {
    return failure('PJ_UNSUPPORTED_MODE', 'PJ markers require block mode')
  }

  const [projectName, link, image] = fields.map(field => field.value)
  if (!isSafeUrl(link) || !isSafeUrl(image)) {
    return failure('PJ_INVALID_URL', 'PJ link and image must use safe HTTP or root-relative URLs')
  }

  return {
    ok: true,
    node: Object.freeze({ markerName: 'PJ', mode: 'block', projectName, link, image })
  }
}

function renderProjectCard(node, _context) {
  const { projectName, link, image } = readProjectNode(node)
  const attributes = [
    `href="${serializeHtmlAttribute(link)}"`,
    'target="_blank"',
    'rel="noopener"',
    `style="${serializeHtmlAttribute(`--card-img: ${serializeCssUrl(image)}`)}"`
  ].join(' ')
  const safeName = serializeHtmlText(projectName)
  const safeAlt = serializeHtmlAttribute(projectName)
  const safeImage = serializeHtmlAttribute(image)

  return `<a class="project-card" ${attributes}>\n` +
    `  <img src="${safeImage}" alt="${safeAlt}" loading="lazy">\n` +
    `  <div class="project-name">${safeName}</div>\n` +
    '</a>'
}

function projectProjectsText(node) {
  return readProjectNode(node).projectName
}

const projectsHandler = Object.freeze({
  name: 'PJ',
  modes: Object.freeze(['block']),
  parse: parseProjects,
  render: renderProjectCard,
  toPlainText: projectProjectsText
})

module.exports = { projectsHandler }
