'use strict'

function normalizeLineEndings(text) {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function escapeMarkerHtml(raw) {
  return raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function markerFailureHtml(raw) {
  return '<pre class="arknights-marker-source">' + escapeMarkerHtml(normalizeLineEndings(raw)) + '</pre>'
}

function markerFailureProjection(raw) {
  return normalizeLineEndings(raw)
}

function fieldFallbackHtml(originalField) {
  return '<pre class="arknights-marker-source">' + escapeMarkerHtml(normalizeLineEndings(originalField)) + '</pre>'
}

function fieldFallbackProjection(originalField) {
  return normalizeLineEndings(originalField)
}

function createSharedFailureHelpers() {
  return Object.freeze({ markerFailureHtml, markerFailureProjection, fieldFallbackHtml, fieldFallbackProjection })
}

module.exports = {
  normalizeLineEndings,
  escapeMarkerHtml,
  markerFailureHtml,
  markerFailureProjection,
  fieldFallbackHtml,
  fieldFallbackProjection,
  createSharedFailureHelpers
}
