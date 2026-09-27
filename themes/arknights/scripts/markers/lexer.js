'use strict'

const { Lexer } = require('marked')

const HEADER_PREFIX = '[#]>'
const NAME_START_PATTERN = /[A-Z]/
const NAME_PART_PATTERN = /[A-Za-z0-9_-]/
const FIELD_SEPARATOR_PATTERN = /^[ \t]*\|[ \t]*/
const MULTILINE_OPENING_PATTERN = /^[ \t]*\$\[$/
const RAW_TEXT_HTML_TAGS = new Set([
  'script',
  'style',
  'pre',
  'textarea',
  'xmp',
  'iframe',
  'noembed',
  'noframes'
])

function createMarkerSourceError(reason) {
  const error = new Error(reason)
  error.code = 'INVALID_MARKER_SOURCE'
  return error
}

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

function readLine(source, start) {
  const contentEnd = findLineEnd(source, start)
  let terminator = ''
  if (source[contentEnd] === '\r' && source[contentEnd + 1] === '\n') {
    terminator = '\r\n'
  } else if (source[contentEnd] === '\n' || source[contentEnd] === '\r') {
    terminator = source[contentEnd]
  }
  return {
    start,
    contentEnd,
    terminator,
    end: contentEnd + terminator.length,
    raw: source.slice(start, contentEnd + terminator.length)
  }
}

function isBlankLine(source, start, end) {
  for (let index = start; index < end; index += 1) {
    if (source[index] !== ' ' && source[index] !== '\t') {
      return false
    }
  }
  return true
}

function trimHorizontal(content) {
  let start = 0
  let end = content.length
  while (start < end && (content[start] === ' ' || content[start] === '\t')) {
    start += 1
  }
  while (end > start && (content[end - 1] === ' ' || content[end - 1] === '\t')) {
    end -= 1
  }
  return content.slice(start, end)
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

function findParagraphEnd(source, start) {
  let lineStart = skipLineBreak(source, findLineEnd(source, start))
  while (lineStart < source.length) {
    const lineEnd = findLineEnd(source, lineStart)
    if (isBlankLine(source, lineStart, lineEnd)) {
      return lineStart
    }
    lineStart = skipLineBreak(source, lineEnd)
  }
  return source.length
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

function readHeader(source, start) {
  if (!source.startsWith(HEADER_PREFIX, start)) {
    return null
  }

  let cursor = start + HEADER_PREFIX.length
  if (!NAME_START_PATTERN.test(source[cursor] ?? '')) {
    return null
  }
  cursor += 1
  while (cursor < source.length && NAME_PART_PATTERN.test(source[cursor])) {
    cursor += 1
  }
  if (source[cursor] !== '|') {
    return null
  }

  const headerLine = readLine(source, start)
  if (headerLine.contentEnd !== cursor + 1) {
    return null
  }

  return {
    name: source.slice(start + HEADER_PREFIX.length, cursor),
    headerLine
  }
}

function isFieldLineShape(content) {
  if (!content.startsWith('[')) {
    return false
  }
  const labelEnd = content.indexOf(']', 1)
  return labelEnd >= 1
}

function classifyBodyLine(content) {
  if (content === ']$') {
    return 'closing'
  }
  if (trimHorizontal(content).startsWith(']$')) {
    return 'unexpected-closing'
  }
  return 'body'
}

// 字段行进入多行状态只看「竖线分隔符之后的值是否精确为 `$[`」；不精确形式由 parser 报 MULTILINE_INVALID_OPEN
function opensMultilineField(content) {
  const labelEnd = content.indexOf(']', 1)
  const tail = content.slice(labelEnd + 1)
  const separator = FIELD_SEPARATOR_PATTERN.exec(tail)
  if (separator === null) {
    return false
  }
  return MULTILINE_OPENING_PATTERN.test(tail.slice(separator[0].length))
}

function readMarker(source, start) {
  const header = readHeader(source, start)
  if (header === null) {
    return null
  }

  const physicalLines = [header.headerLine]
  let finalLine = header.headerLine
  let lineStart = header.headerLine.end
  let multiline = false

  while (lineStart < source.length) {
    const line = readLine(source, lineStart)
    const content = source.slice(line.start, line.contentEnd)

    if (multiline) {
      const classification = classifyBodyLine(content)
      physicalLines.push(line)
      finalLine = line
      lineStart = line.end
      if (classification === 'closing') {
        multiline = false
        continue
      }
      if (classification === 'unexpected-closing') {
        break
      }
      continue
    }

    if (readHeader(source, line.start) !== null || !isFieldLineShape(content)) {
      break
    }

    physicalLines.push(line)
    finalLine = line
    lineStart = line.end
    if (opensMultilineField(content)) {
      multiline = true
    }
  }

  const end = finalLine.terminator === '' ? source.length : finalLine.contentEnd
  return {
    mode: 'block',
    name: header.name,
    raw: source.slice(start, end),
    sourceRange: { start, end },
    physicalLines
  }
}

function createLinkSpanIndex(source) {
  let spans = null

  function ensureSpans() {
    if (spans !== null) {
      return spans
    }
    spans = []
    if (source.includes('](')) {
      let searchStart = 0
      for (const token of Lexer.lexInline(source, { gfm: true })) {
        if (typeof token.raw !== 'string') {
          continue
        }
        const position = source.indexOf(token.raw, searchStart)
        if (position === -1) {
          continue
        }
        searchStart = position + token.raw.length
        if (token.type === 'link' || token.type === 'image') {
          spans.push({ start: position, end: searchStart })
        }
      }
    }
    return spans
  }

  return {
    contains(position) {
      return ensureSpans().some((span) => position >= span.start && position < span.end)
    }
  }
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
    addMarker(marker) {
      const { start, end } = marker.sourceRange
      add('marker', start, end, marker.mode)
      const key = `${start}:${end}`
      if (!markerKeys.has(key)) {
        markerKeys.add(key)
        markers.push(marker)
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
    throw createMarkerSourceError('marker source must be a string')
  }

  const builder = createSegmentBuilder(source)
  const linkSpans = createLinkSpanIndex(source)
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

    if (isLineStart(source, cursor) && source.startsWith(HEADER_PREFIX, cursor)) {
      const marker = linkSpans.contains(cursor) ? null : readMarker(source, cursor)
      if (marker !== null) {
        builder.addMarker(marker)
        cursor = marker.sourceRange.end
        continue
      }
    }

    if (source[cursor] === '`') {
      const inlineEnd = scanInlineCode(source, cursor)
      const protectedEnd = inlineEnd ?? findParagraphEnd(source, cursor)
      builder.addProtected(cursor, Math.max(protectedEnd, cursor + 1), 'inline-code')
      cursor = Math.max(protectedEnd, cursor + 1)
      continue
    }

    if (source[cursor] === '<') {
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
