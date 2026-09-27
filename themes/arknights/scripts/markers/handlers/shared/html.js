'use strict'

const HTML_TEXT_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})

function escapeHtmlText(value) {
  return value.replace(/[&<>"']/g, character => HTML_TEXT_ENTITIES[character])
}

module.exports = { escapeHtmlText }
