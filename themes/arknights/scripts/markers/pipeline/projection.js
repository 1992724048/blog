'use strict'

const MORE_PATTERN = /<!--\s*more\s*-->|<span\b[^>]*\bid=["']more["'][^>]*>\s*<\/span>/i

function deriveExcerptProjection(contentProjection) {
  const match = MORE_PATTERN.exec(contentProjection)
  return match === null ? contentProjection : contentProjection.slice(0, match.index).trim()
}

function readProjectedText(projection, sourceField) {
  if (projection === undefined) {
    return null
  }
  if (sourceField === 'content') {
    return typeof projection.content === 'string' ? projection.content : null
  }
  if (projection.explicitExcerpt) {
    return typeof projection.excerpt === 'string' ? projection.excerpt : null
  }
  return typeof projection.content === 'string'
    ? deriveExcerptProjection(projection.content)
    : null
}

module.exports = { deriveExcerptProjection, readProjectedText }
