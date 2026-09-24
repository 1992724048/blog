'use strict'

const { Lexer } = require('marked')

const MARKER_PREFIX = '[#]<'
const MARKER_NAME_PATTERN = /[A-Za-z][A-Za-z0-9_-]*/y
const RAW_TEXT_HTML_TAGS = new Set(['pre', 'textarea', 'script', 'style'])

function isLineStart(source, index) {
  return index === 0 || source[index - 1] === '\n' || source[index - 1] === '\r'
}

function findLineEnd(source, index) {
  const newlineIndex = source.indexOf('\n', index)
  const carriageReturnIndex = source.indexOf('\r', index)
  const candidates = [newlineIndex, carriageReturnIndex].filter((candidate) => candidate !== -1)
  return candidates.length === 0 ? source.length : Math.min(...candidates)
}

function skipLineBreak(source, index) {
  if (source[index] === '\r' && source[index + 1] === '\n') {
    return index + 2
  }
  if (source[index] === '\r' || source[index] === '\n') {
    return index + 1
  }
  return index
}

function readFenceLine(source, lineStart) {
  const lineEnd = findLineEnd(source, lineStart)
  let cursor = lineStart
  let indentation = 0

  while (source[cursor] === ' ' && indentation < 4) {
    cursor += 1
    indentation += 1
  }
  if (indentation === 4) {
    return null
  }

  const character = source[cursor]
  if (character !== '`' && character !== '~') {
    return null
  }

  let delimiterEnd = cursor
  while (source[delimiterEnd] === character) {
    delimiterEnd += 1
  }

  const length = delimiterEnd - cursor
  if (length < 3) {
    return null
  }

  return {
    character,
    length,
    info: source.slice(delimiterEnd, lineEnd),
    end: lineEnd
  }
}

function scanFencedCode(source, start) {
  const opening = readFenceLine(source, start)
  if (opening === null || (opening.character === '`' && opening.info.includes('`'))) {
    return null
  }

  let lineStart = skipLineBreak(source, opening.end)
  while (lineStart <= source.length) {
    const closing = readFenceLine(source, lineStart)
    if (
      closing !== null &&
      closing.character === opening.character &&
      closing.length >= opening.length &&
      closing.info.trim() === ''
    ) {
      return closing.end
    }
    if (lineStart === source.length) {
      break
    }
    lineStart = skipLineBreak(source, findLineEnd(source, lineStart))
  }

  return source.length
}

function hasIndentedCodePrefix(source, lineStart, lineEnd) {
  let cursor = lineStart
  let spaces = 0
  while (cursor < lineEnd && source[cursor] === ' ' && spaces < 4) {
    cursor += 1
    spaces += 1
  }
  return spaces === 4 || (spaces <= 3 && cursor < lineEnd && source[cursor] === '\t')
}

function isBlankLine(source, start, end) {
  for (let index = start; index < end; index += 1) {
    if (source[index] !== ' ' && source[index] !== '\t') {
      return false
    }
  }
  return true
}

function isIndentedCodeLine(source, start) {
  const lineEnd = findLineEnd(source, start)
  return !isBlankLine(source, start, lineEnd) && hasIndentedCodePrefix(source, start, lineEnd)
}

function scanIndentedCode(source, start) {
  if (!isIndentedCodeLine(source, start)) {
    return null
  }

  let lineStart = start
  let end = findLineEnd(source, start)
  while (lineStart < source.length) {
    const currentEnd = findLineEnd(source, lineStart)
    if (!isBlankLine(source, lineStart, currentEnd) && !isIndentedCodeLine(source, lineStart)) {
      break
    }
    end = currentEnd
    if (currentEnd === source.length) {
      return source.length
    }
    lineStart = skipLineBreak(source, currentEnd)
  }

  return end
}

function scanMarkerShell(source, start) {
  MARKER_NAME_PATTERN.lastIndex = start + MARKER_PREFIX.length
  const nameMatch = MARKER_NAME_PATTERN.exec(source)
  const nameEnd = nameMatch === null ? -1 : nameMatch.index + nameMatch[0].length
  if (nameMatch === null || source[nameEnd] !== '>' || source[nameEnd + 1] !== '{') {
    return null
  }

  const lineEnd = findLineEnd(source, start)
  let quote = null
  let escaped = false
  for (let index = nameEnd + 2; index < lineEnd; index += 1) {
    const character = source[index]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (quote !== null) {
      if (character === quote) {
        quote = null
      }
    } else if (character === '"') {
      quote = character
    } else if (character === '}') {
      return { end: index + 1 }
    }
  }

  return { end: null }
}

function findMarkerMode(source, start, end) {
  const lineStart = Math.max(
    source.lastIndexOf('\n', start - 1),
    source.lastIndexOf('\r', start - 1)
  ) + 1
  const lineEnd = findLineEnd(source, end)
  return source.slice(lineStart, start).trim() === '' && source.slice(end, lineEnd).trim() === ''
    ? 'block'
    : 'inline'
}

function countBacktickRun(source, start) {
  let end = start
  while (source[end] === '`') {
    end += 1
  }
  return end - start
}

function scanInlineCode(source, start) {
  const delimiterLength = countBacktickRun(source, start)
  let cursor = start + delimiterLength

  while (cursor < source.length) {
    if (source[cursor] !== '`') {
      cursor += 1
      continue
    }

    const runLength = countBacktickRun(source, cursor)
    if (runLength === delimiterLength) {
      return cursor + runLength
    }
    cursor += runLength
  }

  return null
}

function readHtmlName(source, index) {
  let end = index
  while (end < source.length && /[A-Za-z0-9:_-]/.test(source[end])) {
    end += 1
  }
  return end
}

function scanHtmlTag(source, start) {
  let cursor = start + 1
  const closing = source[cursor] === '/'
  if (closing) {
    cursor += 1
  }

  const nameStart = cursor
  cursor = readHtmlName(source, cursor)
  if (cursor === nameStart || !/[A-Za-z]/.test(source[nameStart])) {
    return null
  }

  const nameEnd = cursor
  let quote = null
  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor]
    if (quote !== null) {
      if (character === quote) {
        quote = null
      }
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return {
        closing,
        end: cursor + 1,
        name: source.slice(nameStart, nameEnd).toLowerCase(),
        selfClosing: !closing && source.slice(nameEnd, cursor).trimEnd().endsWith('/')
      }
    }
  }

  return {
    closing,
    end: source.length,
    name: source.slice(nameStart, nameEnd).toLowerCase(),
    selfClosing: false
  }
}

function scanMarkupDeclaration(source, start) {
  let quote = null
  for (let index = start + 2; index < source.length; index += 1) {
    const character = source[index]
    if (quote !== null) {
      if (character === quote) {
        quote = null
      }
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index + 1
    }
  }
  return source.length
}

function scanProcessingInstruction(source, start) {
  const instructionEnd = source.indexOf('?>', start + 2)
  return instructionEnd === -1 ? source.length : instructionEnd + 2
}

function scanRawHtml(source, start) {
  if (source.startsWith('<!--', start)) {
    const commentEnd = source.indexOf('-->', start + 4)
    return commentEnd === -1 ? source.length : commentEnd + 3
  }
  if (source[start + 1] === '?') {
    return scanProcessingInstruction(source, start)
  }
  if (source[start + 1] === '!') {
    return scanMarkupDeclaration(source, start)
  }

  const tag = scanHtmlTag(source, start)
  if (tag === null) {
    return null
  }
  if (tag.closing || !RAW_TEXT_HTML_TAGS.has(tag.name)) {
    return tag.end
  }

  let cursor = tag.end
  while (cursor < source.length) {
    const closingStart = source.indexOf('</', cursor)
    if (closingStart === -1) {
      return source.length
    }
    const closingTag = scanHtmlTag(source, closingStart)
    if (closingTag !== null && closingTag.closing && closingTag.name === tag.name) {
      return closingTag.end
    }
    cursor = Math.max(closingStart + 2, closingTag === null ? closingStart + 2 : closingTag.end)
  }
  return source.length
}

function collectMarkerCandidates(source, boundaryProjection = null, collectAllShellCandidates = false) {
  const candidates = []
  let cursor = 0

  while (cursor < source.length) {
    if (isLineStart(source, cursor)) {
      const fencedEnd = scanFencedCode(source, cursor)
      if (fencedEnd !== null) {
        cursor = fencedEnd
        continue
      }
      const indentedEnd = scanIndentedCode(source, cursor)
      if (indentedEnd !== null) {
        cursor = indentedEnd
        continue
      }
    }

    if (source.startsWith(MARKER_PREFIX, cursor)) {
      const shell = scanMarkerShell(source, cursor)
      if (shell !== null && shell.end !== null) {
        candidates.push({ start: cursor, end: shell.end, raw: source.slice(cursor, shell.end) })
        cursor = shell.end
        continue
      }
    }

    if (source[cursor] === '`') {
      const inlineEnd = scanInlineCode(source, cursor)
      if (inlineEnd !== null) {
        cursor = inlineEnd
        continue
      }
      cursor += countBacktickRun(source, cursor)
      continue
    }

    if (source[cursor] === '<' && !collectAllShellCandidates) {
      const boundarySource = boundaryProjection ?? source
      const boundaryToken = Lexer.lexInline(boundarySource.slice(cursor), { gfm: true })[0]
      const isAngleBoundary = boundarySource[cursor] === '<' &&
        boundaryToken?.type === 'link' &&
        boundaryToken.raw.startsWith('<')
      if (!isAngleBoundary) {
        const rawHtmlEnd = scanRawHtml(source, cursor)
        if (rawHtmlEnd !== null) {
          cursor = rawHtmlEnd
          continue
        }
      }
    }

    cursor += 1
  }

  return candidates
}

function createAutolinkBoundaryProjection(source, candidates) {
  if (candidates.length === 0) {
    return source
  }
  const characters = source.split('')
  for (const candidate of candidates) {
    for (let index = candidate.start; index < candidate.end; index += 1) {
      characters[index] = 'x'
    }
  }
  return characters.join('')
}

function getUrlTokenEnd(token) {
  if (
    token.type !== 'link' ||
    typeof token.raw !== 'string' ||
    typeof token.href !== 'string' ||
    token.text !== token.href
  ) {
    return -1
  }
  return token.raw.length
}

function collectAutolinkStarts(source, projection, candidates) {
  const starts = new Map()
  if (candidates.length === 0 || projection === source) {
    return starts
  }

  const tokens = Lexer.lexInline(projection, { gfm: true })
  let searchStart = 0
  for (const token of tokens) {
    if (token.type !== 'link' || typeof token.raw !== 'string') {
      continue
    }
    const rawStart = projection.indexOf(token.raw, searchStart)
    if (rawStart === -1) {
      continue
    }
    searchStart = rawStart + token.raw.length
    const urlEnd = getUrlTokenEnd(token)
    const containsCandidate = candidates.some(candidate => (
      candidate.start >= rawStart && candidate.end <= rawStart + urlEnd
    ))
    if (!containsCandidate) {
      continue
    }
    if (token.raw.startsWith('<')) {
      starts.set(rawStart, true)
    } else {
      starts.set(rawStart, false)
    }
  }
  return starts
}

function createSegmentBuilder(source) {
  const segments = []
  const markers = []
  const markerKeys = new Set()
  let cursor = 0

  function add(kind, start, end, mode = null, reason = null) {
    if (start !== cursor || end < start) {
      throw new Error(`invalid segment boundary: ${start}..${end}, cursor ${cursor}`)
    }

    const previous = segments.at(-1)
    if (kind === 'text' && previous !== undefined && previous.kind === 'text') {
      previous.end = end
      previous.raw = source.slice(previous.start, end)
      cursor = end
      return
    }

    segments.push({ kind, start, end, raw: source.slice(start, end), mode, reason })
    cursor = end
  }

  return {
    addMarker(start, end, mode) {
      add('marker', start, end, mode)
      const key = `${start}:${end}`
      if (!markerKeys.has(key)) {
        markerKeys.add(key)
        markers.push({ start, end, raw: source.slice(start, end), mode })
      }
    },
    addProtected(start, end, reason) {
      add('protected', start, end, null, reason)
    },
    addText(start, end) {
      if (end > start) {
        add('text', start, end)
      }
    },
    finish() {
      if (cursor < source.length) {
        add('text', cursor, source.length)
      }
      if (segments.length === 0) {
        add('text', 0, 0)
      }
      return { source, segments, markers }
    }
  }
}

function scanMarkers(source) {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string')
  }

  const initialCandidates = collectMarkerCandidates(source, null, true)
  const projection = createAutolinkBoundaryProjection(source, initialCandidates)
  const candidates = collectMarkerCandidates(source, projection)
  const autolinkStarts = collectAutolinkStarts(source, projection, candidates)
  const candidateByStart = new Map(candidates.map(candidate => [candidate.start, candidate]))
  const builder = createSegmentBuilder(source)
  let cursor = 0

  while (cursor < source.length) {
    if (isLineStart(source, cursor)) {
      const fencedEnd = scanFencedCode(source, cursor)
      if (fencedEnd !== null) {
        builder.addProtected(cursor, fencedEnd, 'fenced-code')
        cursor = fencedEnd
        continue
      }

      const indentedEnd = scanIndentedCode(source, cursor)
      if (indentedEnd !== null) {
        builder.addProtected(cursor, indentedEnd, 'indented-code')
        cursor = indentedEnd
        continue
      }
    }

    const candidate = candidateByStart.get(cursor)
    if (candidate !== undefined) {
      builder.addMarker(cursor, candidate.end, findMarkerMode(source, cursor, candidate.end))
      cursor = candidate.end
      continue
    }

    if (autolinkStarts.get(cursor) === false) {
      const prefix = /(?:ftp|https?):\/\/|www\./i.exec(source.slice(cursor))
      if (prefix !== null && prefix.index === 0) {
        builder.addText(cursor, cursor + 1)
        cursor += 1
        continue
      }
    }

    if (source[cursor] === '`') {
      const inlineEnd = scanInlineCode(source, cursor)
      if (inlineEnd !== null) {
        builder.addProtected(cursor, inlineEnd, 'inline-code')
        cursor = inlineEnd
        continue
      }
      const runEnd = cursor + countBacktickRun(source, cursor)
      builder.addText(cursor, runEnd)
      cursor = runEnd
      continue
    }

    if (source[cursor] === '<') {
      if (autolinkStarts.get(cursor) === true) {
        builder.addText(cursor, cursor + 1)
        cursor += 1
        continue
      }
      const rawHtmlEnd = scanRawHtml(source, cursor)
      if (rawHtmlEnd !== null) {
        builder.addProtected(cursor, rawHtmlEnd, 'raw-html')
        cursor = rawHtmlEnd
        continue
      }
    }

    builder.addText(cursor, cursor + 1)
    cursor += 1
  }

  return builder.finish()
}

module.exports = { scanMarkers }
