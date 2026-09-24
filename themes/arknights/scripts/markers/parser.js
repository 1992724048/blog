'use strict'

const MARKER_SHELL_PATTERN = /^\[#]<([A-Za-z][A-Za-z0-9_-]*)>\{(.*)\}$/
const ENUM_PATTERN = /^[A-Z][A-Z0-9_-]*$/

function failure(raw, mode, code, reason) {
  return {
    ok: false,
    raw,
    mode,
    error: Object.freeze({ code, reason })
  }
}

function isWhitespace(character) {
  return character === ' ' || character === '\t' || character === '\f' || character === '\v'
}

function skipWhitespace(input, start) {
  let cursor = start
  while (cursor < input.length && isWhitespace(input[cursor])) {
    cursor += 1
  }
  return cursor
}

function parseQuotedArgument(input, start) {
  let cursor = start + 1
  let value = ''

  while (cursor < input.length) {
    const character = input[cursor]
    if (character === '"') {
      return { ok: true, end: cursor + 1, value: value.trim() }
    }
    if (character === '\\') {
      const escaped = input[cursor + 1]
      if (escaped !== '"' && escaped !== '\\') {
        return {
          ok: false,
          code: 'INVALID_ESCAPE',
          reason: 'only \\" and \\\\ escapes are allowed'
        }
      }
      value += escaped
      cursor += 2
      continue
    }
    value += character
    cursor += 1
  }

  return {
    ok: false,
    code: 'UNCLOSED_QUOTE',
    reason: 'quoted argument is not closed'
  }
}

function parseArgument(input, start) {
  if (input[start] === '"') {
    return parseQuotedArgument(input, start)
  }

  let cursor = start
  let value = ''
  while (cursor < input.length && input[cursor] !== ',' && !isWhitespace(input[cursor])) {
    const character = input[cursor]
    if (character === '{' || character === '}') {
      return {
        ok: false,
        code: 'INVALID_SHELL',
        reason: 'unexpected brace outside quoted text'
      }
    }
    value += character
    cursor += 1
  }

  if (value === 'null') {
    return { ok: true, end: cursor, value: Object.freeze({ type: 'null', value: null }) }
  }
  if (ENUM_PATTERN.test(value)) {
    return { ok: true, end: cursor, value: Object.freeze({ type: 'enum', value }) }
  }
  return {
    ok: false,
    code: 'INVALID_TOKEN',
    reason: 'argument must be an enum, null, or quoted text'
  }
}

function parseArguments(input) {
  if (input.trim() === '') {
    return {
      ok: false,
      code: 'EMPTY_ARGUMENT',
      reason: 'argument list must not be empty'
    }
  }

  const values = []
  let cursor = 0
  while (cursor < input.length) {
    cursor = skipWhitespace(input, cursor)
    if (cursor >= input.length) {
      return {
        ok: false,
        code: 'EMPTY_ARGUMENT',
        reason: 'argument is empty'
      }
    }
    if (input[cursor] === ',') {
      return {
        ok: false,
        code: 'EMPTY_ARGUMENT',
        reason: 'argument is empty'
      }
    }

    const argument = parseArgument(input, cursor)
    if (!argument.ok) {
      return argument
    }
    if (typeof argument.value === 'string') {
      values.push(Object.freeze({ type: 'text', value: argument.value }))
    } else {
      values.push(argument.value)
    }
    cursor = skipWhitespace(input, argument.end)

    if (cursor === input.length) {
      return { ok: true, args: Object.freeze(values) }
    }
    if (input[cursor] === '{' || input[cursor] === '}') {
      return {
        ok: false,
        code: 'INVALID_SHELL',
        reason: 'unexpected brace outside quoted text'
      }
    }
    if (input[cursor] !== ',') {
      return {
        ok: false,
        code: 'INVALID_TOKEN',
        reason: 'unexpected content after argument'
      }
    }

    cursor = skipWhitespace(input, cursor + 1)
    if (cursor === input.length) {
      return {
        ok: false,
        code: 'TRAILING_COMMA',
        reason: 'trailing comma is not allowed'
      }
    }
  }

  return { ok: true, args: Object.freeze(values) }
}

function parseMarker(raw, mode) {
  if (typeof raw !== 'string') {
    return failure(raw, mode, 'INVALID_INPUT', 'raw must be a string')
  }
  if (mode !== 'block' && mode !== 'inline') {
    return failure(raw, mode, 'INVALID_MODE', 'mode must be block or inline')
  }
  if (raw.includes('\r') || raw.includes('\n')) {
    return failure(raw, mode, 'PHYSICAL_NEWLINE', 'raw marker must not contain a physical newline')
  }

  const shell = MARKER_SHELL_PATTERN.exec(raw)
  if (shell === null) {
    return failure(raw, mode, 'INVALID_SHELL', 'marker shell is invalid')
  }

  const parsedArguments = parseArguments(shell[2])
  if (!parsedArguments.ok) {
    return failure(raw, mode, parsedArguments.code, parsedArguments.reason)
  }

  return {
    ok: true,
    marker: Object.freeze({
      version: 1,
      raw,
      mode,
      name: shell[1],
      args: parsedArguments.args
    })
  }
}

module.exports = { parseMarker }
