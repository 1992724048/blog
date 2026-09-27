'use strict'

const { parseMarker, coerce } = require('../parser')

const PLACEHOLDER_ATTRIBUTE = 'data-arknights-line-marker'
const TOKEN_PREFIX = 'arknights-line-marker-v1:'
const INTERNAL_STRING_PATTERN = new RegExp(`${PLACEHOLDER_ATTRIBUTE}|${TOKEN_PREFIX}|\\u0000`, 'u')
const PENDING_STATES = new Set(['pending-render', 'excerpt-pending'])

function placeholderHtml(token) {
  return `<div ${PLACEHOLDER_ATTRIBUTE}="${token}"></div>`
}

function countExact(value, expected) {
  return value.split(expected).length - 1
}

function hasInternalString(value) {
  return typeof value === 'string' && INTERNAL_STRING_PATTERN.test(value)
}

function collectPendingOccurrences(store, field) {
  return store.getOccurrences().filter(
    occurrence => occurrence.field === field && PENDING_STATES.has(occurrence.state)
  )
}

function locatePlaceholderRanges(source, occurrences) {
  const ranges = []
  let searchFrom = 0
  for (const occurrence of occurrences) {
    const placeholder = placeholderHtml(occurrence.token)
    if (countExact(source, placeholder) !== 1) {
      return null
    }
    const start = source.indexOf(placeholder, searchFrom)
    if (start === -1) {
      return null
    }
    ranges.push({ start, end: start + placeholder.length })
    searchFrom = start + placeholder.length
  }
  return ranges
}

function locateTokenRanges(source, field, occurrences, store) {
  let located
  try {
    located = store.findOccurrences(source, field)
  } catch {
    return null
  }
  if (located.length !== occurrences.length) {
    return null
  }
  const ranges = []
  for (let index = 0; index < occurrences.length; index += 1) {
    const { id, tokenRange } = located[index]
    if (id !== occurrences[index].id ||
        source.slice(tokenRange.start, tokenRange.end) !== occurrences[index].token) {
      return null
    }
    ranges.push({ start: tokenRange.start, end: tokenRange.end })
  }
  return ranges
}

function locateRanges(source, field, occurrences, store) {
  const expectedNamespaces = field === 'content' ? occurrences.length : 0
  if (countExact(source, PLACEHOLDER_ATTRIBUTE) !== expectedNamespaces) {
    return null
  }
  return field === 'content'
    ? locatePlaceholderRanges(source, occurrences)
    : locateTokenRanges(source, field, occurrences, store)
}

function consumeFields(parsed, handler) {
  const fields = {}
  for (const [name, entry] of Object.entries(parsed.marker.fields)) {
    const schema = handler.fields[name]
    const coerced = schema === undefined ? null : coerce(entry.token, schema)
    if (coerced === null || !coerced.ok) {
      return null
    }
    fields[name] = coerced.value
  }
  return fields
}

function buildOutcome(occurrence, state, field, registry, injected) {
  const capture = state.captures.get(occurrence.token)
  const failed = () => ({
    name: capture === undefined ? null : capture.name,
    html: injected.failureHelpers.markerFailureHtml(occurrence.raw),
    projection: injected.failureHelpers.markerFailureProjection(occurrence.raw),
    failed: true
  })

  if (capture === undefined || registry.get(capture.name) === null) {
    return failed()
  }
  const handler = registry.get(capture.name)
  const parsed = parseMarker(capture, { positions: handler.positions, fields: handler.fields })
  if (!parsed.ok) {
    return failed()
  }
  const fields = consumeFields(parsed, handler)
  if (fields === null) {
    return failed()
  }

  const context = Object.freeze({
    sourceField: field,
    sourcePath: state.sourcePath,
    type: state.type,
    occurrenceId: occurrence.id
  })
  const dispatched = registry.dispatch(
    capture.name,
    Object.freeze({
      name: capture.name,
      sourceRange: parsed.marker.sourceRange,
      fields: Object.freeze(fields)
    }),
    context
  )
  if (!dispatched.ok) {
    return failed()
  }

  let rendered
  try {
    rendered = dispatched.handler.render(dispatched.node, context, injected.services)
  } catch {
    return failed()
  }
  if (rendered === null || typeof rendered !== 'object' || typeof rendered.html !== 'string' ||
      hasInternalString(rendered.html)) {
    return failed()
  }

  let projection
  try {
    projection = dispatched.handler.toPlainText(dispatched.node, context, injected.services)
  } catch {
    return failed()
  }
  if (typeof projection !== 'string' || hasInternalString(projection)) {
    return failed()
  }
  return { name: capture.name, html: rendered.html, projection, failed: false }
}

function replaceRanges(source, ranges, replacements) {
  let result = source
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    result = result.slice(0, ranges[index].start) + replacements[index] + result.slice(ranges[index].end)
  }
  return result
}

function createRangeFinder(value, contents) {
  const cache = new Map()
  let cursor = 0
  return occurrenceId => {
    if (cache.has(occurrenceId)) {
      return cache.get(occurrenceId)
    }
    const content = contents.get(occurrenceId)
    if (typeof content !== 'string' || content === '') {
      return null
    }
    const start = value.indexOf(content, cursor)
    if (start === -1) {
      return null
    }
    const range = Object.freeze({ start, end: start + content.length })
    cache.set(occurrenceId, range)
    cursor = start + 1
    return range
  }
}

function collectProjectGroups(state, field, occurrences, outcomes, injected) {
  const records = []
  for (let index = 0; index < outcomes.length; index += 1) {
    if (!outcomes[index].failed && outcomes[index].name === 'Project') {
      records.push({
        occurrenceId: occurrences[index].id,
        field: occurrences[index].field,
        sourceRange: occurrences[index].sourceRange
      })
    }
  }
  if (records.length === 0) {
    return { groups: [], contents: new Map() }
  }
  const original = state.carrier.originalField(field)
  const groups = injected.buildProjectGroups(
    typeof original === 'string' ? original : '',
    field,
    records,
    injected.projectGridHelpers
  )
  const contents = new Map()
  for (const record of records) {
    const position = occurrences.findIndex(occurrence => occurrence.id === record.occurrenceId)
    contents.set(record.occurrenceId, outcomes[position].html)
  }
  return { groups, contents }
}

function wrapProjectGrids(html, groups, contents, injected) {
  if (groups.length === 0) {
    return html
  }
  const ranged = injected.applyProjectGroups(
    html,
    groups,
    contents,
    createRangeFinder(html, contents),
    injected.projectGridHelpers
  )
  return ranged
}

function materializeField(value, state, data, field, registry, injected) {
  const source = injected.normalizeLineEndings(value)
  const occurrences = collectPendingOccurrences(state.store, field)
  if (occurrences.length === 0) {
    return hasInternalString(source) ? null : { html: source, projection: source }
  }

  const ranges = locateRanges(source, field, occurrences, state.store)
  if (ranges === null) {
    return null
  }

  const outcomes = occurrences.map(occurrence => {
    const outcome = buildOutcome(occurrence, state, field, registry, injected)
    state.replacements.set(occurrence.id, { failed: outcome.failed })
    return outcome
  })

  let html = replaceRanges(source, ranges, outcomes.map(outcome => outcome.html))
  const projection = replaceRanges(source, ranges, outcomes.map(outcome => outcome.projection))

  const { groups, contents } = collectProjectGroups(state, field, occurrences, outcomes, injected)
  const wrapped = wrapProjectGrids(html, groups, contents, injected)
  if (wrapped === null || hasInternalString(wrapped) || hasInternalString(projection)) {
    return null
  }
  return { html: wrapped, projection }
}

module.exports = { placeholderHtml, countExact, materializeField }
