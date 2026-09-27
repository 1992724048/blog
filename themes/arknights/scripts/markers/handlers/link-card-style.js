'use strict'

const { failure } = require('./shared/result')
const { readRootUrl } = require('./link-card-style-root-url')

const STYLE_MAX_LENGTH = 1024
const STYLE_MAX_DECLARATIONS = 12
const STYLE_MAX_PROPERTY_LENGTH = 32
const STYLE_MAX_VALUE_LENGTH = 256
const PROPERTY_PATTERN = /^[A-Za-z0-9-]+$/
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})/
const NUMBER_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/
const LENGTH_PATTERN = /^(?:0|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:px|rem|em|%))/
const PERCENTAGE_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?%/
const ANGLE_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:deg|rad|grad|turn)/
const COLOR_FUNCTION_PATTERN = /^(?:rgba?|hsla?)\(/i
const MAX_LENGTH_LIST = 4
const MIN_SHADOW_LENGTHS = 2
const MAX_CHANNEL = 255
const MAX_PERCENTAGE = 100
const MAX_ALPHA = 1
const MAX_HUE = 100000
const MAX_PADDING = 256
const MAX_MARGIN = 256
const MAX_OUTLINE_OFFSET = 64

function createScanner(text) {
  let index = 0
  return {
    get index() {
      return index
    },
    set index(value) {
      index = value
    },
    get done() {
      return index >= text.length
    },
    hasWsp() {
      return text[index] === ' ' || text[index] === '\t'
    },
    skipWsp() {
      const start = index
      while (text[index] === ' ' || text[index] === '\t') {
        index += 1
      }
      return index > start
    },
    take(pattern) {
      const match = pattern.exec(text.slice(index))
      if (match === null) {
        return null
      }
      index += match[0].length
      return match[0]
    },
    takeLiteral(literal) {
      if (!text.startsWith(literal, index)) {
        return false
      }
      index += literal.length
      return true
    }
  }
}

function value(text, numbers = []) {
  return Object.freeze({ text, numbers })
}

function toValue(part) {
  return value(part.text, [part.value])
}

function readNumber(scanner, signed) {
  const sign = signed && scanner.takeLiteral('-') ? '-' : ''
  const text = scanner.take(NUMBER_PATTERN)
  return text === null ? null : { text: sign + text, value: Number(text) }
}

function readPercentage(scanner) {
  if (scanner.takeLiteral('-')) {
    const positive = scanner.take(PERCENTAGE_PATTERN)
    return positive === null ? null : { text: `-${positive}`, value: Number(positive.slice(0, -1)) }
  }
  const text = scanner.take(PERCENTAGE_PATTERN)
  return text === null ? null : { text, value: Number(text.slice(0, -1)) }
}

function readAngle(scanner) {
  if (scanner.takeLiteral('-')) {
    const positive = scanner.take(ANGLE_PATTERN)
    return positive === null ? null : { text: `-${positive}`, value: Number(positive.replace(/[a-z]+$/, '')) }
  }
  const text = scanner.take(ANGLE_PATTERN)
  return text === null ? null : { text, value: Number(text.replace(/[a-z]+$/, '')) }
}

function readLength(scanner, signed) {
  const sign = signed && scanner.takeLiteral('-') ? '-' : ''
  const text = scanner.take(LENGTH_PATTERN)
  return text === null ? null : { text: sign + text, value: Number(text.replace(/[a-z%]+$/, '')) }
}

function readColorChannel(scanner) {
  const percentage = readPercentage(scanner)
  if (percentage !== null) {
    return Math.abs(percentage.value) <= MAX_PERCENTAGE ? percentage : null
  }
  const number = readNumber(scanner, true)
  return number !== null && Math.abs(number.value) <= MAX_CHANNEL ? number : null
}

function readAlphaChannel(scanner) {
  const percentage = readPercentage(scanner)
  if (percentage !== null) {
    return Math.abs(percentage.value) <= MAX_PERCENTAGE ? percentage : null
  }
  const number = readNumber(scanner, false)
  return number !== null && Math.abs(number.value) <= MAX_ALPHA ? number : null
}

function readChannelList(scanner, count) {
  const channels = []
  for (let position = 0; position < count; position += 1) {
    if (position > 0 && !scanner.takeLiteral(',')) {
      return null
    }
    const isAlpha = count === 4 && position === 3
    const channel = isAlpha ? readAlphaChannel(scanner) : readColorChannel(scanner)
    if (channel === null) {
      return null
    }
    channels.push(channel)
  }
  const core = channels.slice(0, 3)
  const uniform = core.every(channel => channel.text.endsWith('%')) ||
    core.every(channel => !channel.text.endsWith('%'))
  return uniform ? channels : null
}

function readHslChannels(scanner, withAlpha) {
  const hue = readAngle(scanner)
  if (hue === null || Math.abs(hue.value) > MAX_HUE) {
    return null
  }
  const channels = [hue]
  for (let position = 0; position < 2; position += 1) {
    if (!scanner.takeLiteral(',')) {
      return null
    }
    const channel = readPercentage(scanner)
    if (channel === null || Math.abs(channel.value) > MAX_PERCENTAGE) {
      return null
    }
    channels.push(channel)
  }
  if (!withAlpha) {
    return channels
  }
  if (!scanner.takeLiteral(',')) {
    return null
  }
  const alpha = readAlphaChannel(scanner)
  if (alpha === null) {
    return null
  }
  channels.push(alpha)
  return channels
}

function readColorFunction(scanner) {
  const head = scanner.take(COLOR_FUNCTION_PATTERN)
  if (head === null) {
    return null
  }
  const name = head.slice(0, -1).toLowerCase()
  const withAlpha = name.length === 4
  const channels = name.startsWith('hsl')
    ? readHslChannels(scanner, withAlpha)
    : readChannelList(scanner, withAlpha ? 4 : 3)
  if (channels === null) {
    return null
  }
  if (!scanner.takeLiteral(')')) {
    return null
  }
  const text = channels.map(channel => channel.text).join(',')
  return { text: `${name}(${text})`, values: channels.map(channel => channel.value) }
}

function readColor(scanner) {
  const named = scanner.take(/^(?:transparent|currentcolor)/i)
  if (named !== null) {
    return value(named.toLowerCase())
  }
  const hex = scanner.take(HEX_COLOR_PATTERN)
  if (hex !== null) {
    return value(hex.toLowerCase())
  }
  const parsed = readColorFunction(scanner)
  return parsed === null ? null : value(parsed.text, parsed.values)
}

function readBackgroundImage(scanner) {
  if (scanner.take(/^none/i) !== null) {
    return value('none')
  }
  const path = readRootUrl(scanner)
  return path === null ? null : value(`url("${path}")`)
}

function readLengthList(scanner, signed) {
  const first = readLength(scanner, signed)
  if (first === null) {
    return null
  }
  const lengths = [toValue(first)]
  while (scanner.hasWsp()) {
    const mark = scanner.index
    scanner.skipWsp()
    const next = readLength(scanner, signed)
    if (next === null) {
      scanner.index = mark
      break
    }
    lengths.push(toValue(next))
    if (lengths.length > MAX_LENGTH_LIST) {
      return null
    }
  }
  return lengths
}

function joinParts(parts) {
  return value(
    parts.map(part => part.text).join(' '),
    parts.flatMap(part => part.numbers)
  )
}

function readShadowLengths(scanner) {
  const lengths = readLengthList(scanner, false)
  if (lengths === null || lengths.length < MIN_SHADOW_LENGTHS) {
    return null
  }
  return joinParts(lengths)
}

function readShadow(scanner) {
  if (scanner.take(/^none/i) !== null) {
    return value('none')
  }
  const mark = scanner.index
  const leadingColor = readColor(scanner)
  if (leadingColor !== null && scanner.hasWsp()) {
    scanner.skipWsp()
    const lengths = readShadowLengths(scanner)
    if (lengths !== null) {
      return joinParts([leadingColor, lengths])
    }
  }
  scanner.index = mark
  const lengths = readShadowLengths(scanner)
  if (lengths === null) {
    return null
  }
  if (!scanner.hasWsp()) {
    return lengths
  }
  scanner.skipWsp()
  const trailingColor = readColor(scanner)
  return trailingColor === null ? null : joinParts([lengths, trailingColor])
}

function readOutline(scanner) {
  if (scanner.take(/^none/i) !== null) {
    return value('none')
  }
  const parts = []
  const color = readColor(scanner)
  if (color === null || !scanner.skipWsp() || !scanner.take(/^solid/i) || !scanner.skipWsp()) {
    return null
  }
  parts.push(value(color.text, color.numbers))
  const length = readLength(scanner, false)
  if (length === null) {
    return null
  }
  parts.push(toValue(length))
  return joinParts(parts)
}

const COLOR_PROPERTIES = Object.freeze([
  '--card-title', '--card-text', '--card-bg', '--card-bg-hover', '--card-out', '--card-out-hover',
  '--card-border', '--card-border-hover', '--card-line', 'color', 'border-color',
  'border-left-color', 'outline-color'
])
const STYLE_PROPERTY_READERS = new Map([
  ['background-image', readBackgroundImage],
  ['opacity', scanner => {
    const number = readNumber(scanner, false)
    return number === null ? null : toValue(number)
  }],
  ['padding', scanner => {
    const lengths = readLengthList(scanner, false)
    return lengths === null ? null : joinParts(lengths)
  }],
  ['margin', scanner => {
    const lengths = readLengthList(scanner, true)
    return lengths === null ? null : joinParts(lengths)
  }],
  ['outline-offset', scanner => {
    const length = readLength(scanner, false)
    return length === null ? null : toValue(length)
  }],
  ['box-shadow', readShadow],
  ['outline', readOutline]
])
for (const property of COLOR_PROPERTIES) {
  STYLE_PROPERTY_READERS.set(property, readColor)
}
const STYLE_RANGES = new Map([
  ['opacity', (numbers) => numbers.every(item => item >= 0 && item <= MAX_ALPHA)],
  ['padding', (numbers) => numbers.every(item => item >= 0 && item <= MAX_PADDING)],
  ['margin', (numbers) => numbers.every(item => Math.abs(item) <= MAX_MARGIN)],
  ['outline-offset', (numbers) => numbers.every(item => item >= 0 && item <= MAX_OUTLINE_OFFSET)]
])

function splitDeclarations(text) {
  const parts = []
  let current = ''
  let quote = null
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quote !== null) {
      current += character
      if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
      if (depth < 0) {
        return null
      }
    } else if (character === ';' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (quote !== null || depth !== 0) {
    return null
  }
  if (current.trim() === '' && parts.length > 0) {
    return parts
  }
  parts.push(current)
  return parts
}

function parseDeclarationText(declaration) {
  const colon = declaration.indexOf(':')
  if (colon === -1) {
    return null
  }
  const property = declaration.slice(0, colon).trim()
  if (property === '' || property.length > STYLE_MAX_PROPERTY_LENGTH ||
      !PROPERTY_PATTERN.test(property)) {
    return null
  }
  return { property, rawValue: declaration.slice(colon + 1).trim() }
}

function parseStyleValue(property, rawValue) {
  const reader = STYLE_PROPERTY_READERS.get(property)
  if (reader === undefined || rawValue === '' || rawValue.length > STYLE_MAX_VALUE_LENGTH) {
    return null
  }
  const scanner = createScanner(rawValue)
  const parsed = reader(scanner)
  if (parsed === null || !scanner.done) {
    return null
  }
  const rangeCheck = STYLE_RANGES.get(property)
  if (rangeCheck !== undefined && !rangeCheck(parsed.numbers)) {
    return null
  }
  return parsed.text
}

function parseStyleDeclarations(source) {
  if (typeof source !== 'string' || source === '' || source.length > STYLE_MAX_LENGTH) {
    return failure('LINK_CARD_INVALID_STYLE', 'style must be a short declaration list')
  }
  const parts = splitDeclarations(source)
  if (parts === null || parts.length > STYLE_MAX_DECLARATIONS) {
    return failure('LINK_CARD_INVALID_STYLE', 'style declaration list is malformed')
  }

  const seen = new Set()
  const serialized = []
  for (const part of parts) {
    const declaration = parseDeclarationText(part)
    if (declaration === null || seen.has(declaration.property)) {
      return failure('LINK_CARD_INVALID_STYLE', 'style declaration is malformed or duplicated')
    }
    seen.add(declaration.property)
    let canonical
    try {
      canonical = parseStyleValue(declaration.property, declaration.rawValue)
    } catch (error) {
      if (error instanceof Error && error.message === 'LINK_CARD_STYLE_RESOURCE') {
        return failure('LINK_CARD_STYLE_RESOURCE', 'style resource policy rejected the declaration')
      }
      return failure('LINK_CARD_INVALID_STYLE', 'style value is not allowed')
    }
    if (canonical === null) {
      return failure('LINK_CARD_INVALID_STYLE', 'style value is not allowed')
    }
    serialized.push(`${declaration.property}:${canonical}`)
  }
  return { ok: true, declarations: serialized.join(';') }
}

module.exports = { parseStyleDeclarations }
