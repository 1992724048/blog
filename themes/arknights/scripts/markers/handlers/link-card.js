'use strict'

const { failure } = require('./shared/result')
const { escapeHtmlText } = require('./shared/html')
const { readFields } = require('./shared/fields')
const { isSafeUrl } = require('./shared/url')
const { parseStyleDeclarations } = require('./link-card-style')

function parse(input, _context) {
  const fields = readFields(input, 'LinkCard')
  const avatar = fields.avatar
  if (typeof avatar !== 'string' || avatar.trim() === '') {
    return failure('LINK_CARD_INVALID_NAME', 'LinkCard avatar must be a non-empty display name')
  }
  if (!isSafeUrl(fields.link)) {
    return failure('LINK_CARD_INVALID_URL', 'LinkCard link must be a safe HTTP or root relative URL')
  }
  let image = null
  if (Object.hasOwn(fields, 'img')) {
    if (!isSafeUrl(fields.img)) {
      return failure('LINK_CARD_INVALID_URL', 'LinkCard image must be a safe HTTP or root relative URL')
    }
    image = fields.img
  }
  const descr = Object.hasOwn(fields, 'descr') ? fields.descr : null
  if (descr !== null && typeof descr !== 'string') {
    return failure('INVALID_VALUE', 'LinkCard descr must be a string or absent')
  }
  let declarations = null
  if (Object.hasOwn(fields, 'style')) {
    const parsed = parseStyleDeclarations(fields.style)
    if (!parsed.ok) {
      return parsed
    }
    declarations = parsed.declarations
  }

  return {
    ok: true,
    node: Object.freeze({ avatar, link: fields.link, image, descr, declarations })
  }
}

function render(node, context) {
  const scope = node.declarations === null
    ? null
    : `arknights-link-card-${context.sourceField}-${context.occurrenceId}`
  const styleElement = scope === null
    ? ''
    : `<style data-arknights-link-card-style="${scope}">\n` +
      `  .link-card[data-arknights-link-card="${scope}"] {\n` +
      `    ${node.declarations};\n` +
      '  }\n' +
      '</style>\n'
  const scopeAttribute = scope === null ? '' : ` data-arknights-link-card="${scope}"`
  const background = node.image === null
    ? ''
    : `<img class="link-background" src="${escapeHtmlText(node.image)}"` +
      ` alt="${escapeHtmlText(node.avatar)}" loading="lazy">\n  `
  const descrNode = node.descr === null
    ? ''
    : `<div class="link-descr">${escapeHtmlText(node.descr)}</div>\n    `
  const mainClass = node.image === null && node.descr === null ? 'link-main link-simple' : 'link-main'
  const anchor = '<a class="link-card"' +
    `${scopeAttribute} href="${escapeHtmlText(node.link)}"` +
    ' target="_blank" rel="noopener noreferrer">\n  ' +
    background +
    `<div class="${mainClass}">\n` +
    '  <div class="link-data">\n' +
    `    <div class="link-title">${escapeHtmlText(node.avatar)}</div>\n` +
    `    ${descrNode}</div>\n` +
    '  </div>\n' +
    '</a>'
  return { html: styleElement + anchor }
}

function toPlainText(node) {
  if (node.descr === null || node.descr === '') {
    return node.avatar
  }
  return `${node.avatar} ${node.descr}`
}

const linkCardHandler = {
  name: 'LinkCard',
  mode: 'block',
  positions: Object.freeze(['avatar', 'link', 'img', 'descr', 'style']),
  fields: Object.freeze({
    avatar: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    }),
    link: Object.freeze({
      kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
    }),
    img: Object.freeze({
      kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
    }),
    descr: Object.freeze({
      kind: 'string', required: false, nullable: false, defaultValue: null, allowMultiline: false
    }),
    style: Object.freeze({
      kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
    })
  }),
  parse,
  render,
  toPlainText
}

module.exports = { linkCardHandler }
