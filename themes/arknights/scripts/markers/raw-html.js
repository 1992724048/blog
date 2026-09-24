'use strict'

const RAW_HTML_BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'header',
  'main',
  'nav',
  'ol',
  'pre',
  'script',
  'section',
  'style',
  'table',
  'textarea',
  'ul'
])
const RAW_TEXT_HTML_TAGS = new Set(['pre', 'script', 'style', 'textarea'])
const HTML_TEXT_ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
})

function escapeHtmlText(value) {
  return value.replace(/[&<>]/g, character => HTML_TEXT_ENTITIES[character])
}

function readHtmlTag(value, start) {
  if (value[start] !== '<' || start + 1 >= value.length) {
    return null
  }

  let cursor = start + 1
  const closing = value[cursor] === '/'
  if (closing) {
    cursor += 1
  }
  const nameStart = cursor
  while (cursor < value.length && /[A-Za-z0-9:_-]/.test(value[cursor])) {
    cursor += 1
  }
  if (cursor === nameStart || !/[A-Za-z]/.test(value[nameStart])) {
    return null
  }

  const name = value.slice(nameStart, cursor).toLowerCase()
  let quote = null
  for (; cursor < value.length; cursor += 1) {
    const character = value[cursor]
    if (quote !== null) {
      if (character === quote) {
        quote = null
      }
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return {
        name,
        closing,
        end: cursor + 1,
        selfClosing: !closing && value.slice(nameStart, cursor).trimEnd().endsWith('/')
      }
    }
  }

  return {
    name,
    closing,
    end: value.length,
    selfClosing: false
  }
}

function skipHtmlDeclaration(value, start) {
  if (value.startsWith('<!--', start)) {
    const end = value.indexOf('-->', start + 4)
    return end === -1 ? value.length : end + 3
  }
  if (value[start + 1] === '?' || value[start + 1] === '!') {
    const end = value.indexOf('>', start + 2)
    return end === -1 ? value.length : end + 1
  }
  return null
}

function findRawTextEnd(value, start, tagName) {
  const closingPattern = new RegExp(`</${tagName}\\s*>`, 'ig')
  closingPattern.lastIndex = start
  const match = closingPattern.exec(value)
  return match === null ? value.length : match.index + match[0].length
}

function findNestedRawBlockEnd(value, start, tagName) {
  let depth = 1
  let cursor = start
  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor)
    if (tagStart === -1) {
      return value.length
    }
    const declarationEnd = skipHtmlDeclaration(value, tagStart)
    if (declarationEnd !== null) {
      cursor = declarationEnd
      continue
    }
    const tag = readHtmlTag(value, tagStart)
    if (tag === null) {
      cursor = tagStart + 1
      continue
    }
    if (tag.name === tagName) {
      if (tag.closing) {
        depth -= 1
        if (depth === 0) {
          return tag.end
        }
      } else if (!tag.selfClosing) {
        depth += 1
      }
    }
    cursor = tag.end
  }
  return value.length
}

function findRawHtmlRanges(value) {
  const ranges = []
  let cursor = 0
  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor)
    if (tagStart === -1) {
      break
    }
    const declarationEnd = skipHtmlDeclaration(value, tagStart)
    if (declarationEnd !== null) {
      cursor = declarationEnd
      continue
    }
    const tag = readHtmlTag(value, tagStart)
    if (tag === null) {
      cursor = tagStart + 1
      continue
    }
    if (!tag.closing && !tag.selfClosing && RAW_HTML_BLOCK_TAGS.has(tag.name)) {
      const end = RAW_TEXT_HTML_TAGS.has(tag.name)
        ? findRawTextEnd(value, tag.end, tag.name)
        : findNestedRawBlockEnd(value, tag.end, tag.name)
      ranges.push({ start: tagStart, end })
      cursor = end
      continue
    }
    cursor = tag.end
  }

  const merged = []
  for (const range of ranges) {
    const previous = merged.at(-1)
    if (previous !== undefined && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function isWithinRanges(start, end, ranges) {
  return ranges.some(range => start >= range.start && end <= range.end)
}

function restoreRawHtmlTokens(value, store) {
  const ranges = findRawHtmlRanges(value)
  if (ranges.length === 0) {
    return value
  }
  const occurrences = store.findTokens(value)
  let result = value
  for (let index = occurrences.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrences[index]
    if (isWithinRanges(occurrence.start, occurrence.end, ranges)) {
      result = result.slice(0, occurrence.start) +
        escapeHtmlText(occurrence.record.raw) +
        result.slice(occurrence.end)
    }
  }
  return result
}

module.exports = { restoreRawHtmlTokens }
