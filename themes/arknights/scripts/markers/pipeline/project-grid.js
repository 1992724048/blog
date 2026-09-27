'use strict'

const GRID_WRAPPER_OPEN = '<div class="projects-grid">'
const GRID_WRAPPER_CLOSE = '</div>'

// The shared adjacency predicate is the fourth argument because the frozen export signature has
// no injection slot on this function; pipeline.js is the only source of isAdjacent.
function buildProjectGroups(source, field, projectOccurrences, injected) {
  if (typeof source !== 'string' || projectOccurrences.length === 0 || injected === undefined) {
    return Object.freeze([])
  }
  const ordered = [...projectOccurrences].sort(
    (left, right) => left.sourceRange.start - right.sourceRange.start
  )
  const groups = []
  let current = null

  const flush = () => {
    if (current !== null) {
      groups.push(Object.freeze({
        occurrenceIds: Object.freeze(current.occurrenceIds),
        field: current.field,
        start: current.start,
        end: current.end
      }))
      current = null
    }
  }

  for (const occurrence of ordered) {
    const adjacent = current !== null &&
      current.field === occurrence.field &&
      current.field === field &&
      injected.isAdjacent(source, current.end, occurrence.sourceRange.start)
    if (adjacent) {
      current.occurrenceIds.push(occurrence.occurrenceId)
      current.end = occurrence.sourceRange.end
      continue
    }
    flush()
    current = {
      occurrenceIds: [occurrence.occurrenceId],
      field: occurrence.field,
      start: occurrence.sourceRange.start,
      end: occurrence.sourceRange.end
    }
  }
  flush()
  return Object.freeze(groups)
}

// The fifth parameter carries the shared values pipeline.js injects; grid wrapping emits no new
// user text, so only isAdjacent is read from it here.
function applyProjectGroups(value, groups, contents, rangeOf, injected) {
  if (groups.length === 0) {
    return value
  }
  void injected
  let result = ''
  let cursor = 0
  for (const group of groups) {
    const first = rangeOf(group.occurrenceIds[0])
    const last = rangeOf(group.occurrenceIds[group.occurrenceIds.length - 1])
    if (first === null || last === null || last.end <= first.start) {
      return null
    }
    const inner = value.slice(first.start, last.end)
    for (const occurrenceId of group.occurrenceIds) {
      if (typeof contents.get(occurrenceId) !== 'string' || !inner.includes(contents.get(occurrenceId))) {
        return null
      }
    }
    result += value.slice(cursor, first.start)
    result += `${GRID_WRAPPER_OPEN}\n${inner}\n${GRID_WRAPPER_CLOSE}`
    cursor = last.end
  }
  return result + value.slice(cursor)
}

module.exports = { buildProjectGroups, applyProjectGroups }
