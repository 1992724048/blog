'use strict'

const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i
const UNSAFE_URL_CHARACTER_PATTERN = /[\u0000-\u0020\u007f-\u009f\s\\"'`{};]/u

function isSafeUrl(value) {
  if (typeof value !== 'string' || value === '' || UNSAFE_URL_CHARACTER_PATTERN.test(value)) {
    return false
  }
  if (value.startsWith('/')) {
    return !value.startsWith('//')
  }
  if (!ABSOLUTE_HTTP_URL_PATTERN.test(value)) {
    return false
  }
  try {
    return new URL(value).hostname !== ''
  } catch {
    return false
  }
}

module.exports = { isSafeUrl }
