'use strict'

// RootUrl 单次 percent-decode 与路径授权策略：§13.2 LINK_CARD_STYLE_RESOURCE 的唯一实现。
// 游标契约与 link-card-style.js 的 createScanner 同形（take/takeLiteral），本模块不依赖它，
// 依赖方向只有 link-card-style.js -> link-card-style-root-url.js 单向一条。
const ROOT_URL_PATTERN = /^url\(/i
const ROOT_SEGMENT_RUN_PATTERN = /^[A-Za-z0-9._~!$&()*+,=:@%-]+/
const ROOT_SEGMENT_ALLOWED_PATTERN = /^[A-Za-z0-9._~!$&()*+,=:@%-]+$/
const ROOT_SEGMENT_DENIED = new Set(['.', '..'])
const HEX_DIGITS = '0123456789abcdefABCDEF'

function decodeRootPathOnce(path) {
  let decoded = ''
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] !== '%') {
      decoded += path[index]
      continue
    }
    const triplet = path.slice(index + 1, index + 3)
    if (triplet.length !== 2 || !HEX_DIGITS.includes(triplet[0]) || !HEX_DIGITS.includes(triplet[1])) {
      return null
    }
    decoded += String.fromCharCode(parseInt(triplet, 16))
    index += 2
  }
  return decoded
}

function auditRootPath(path) {
  const decoded = decodeRootPathOnce(path)
  if (decoded === null || decoded.includes('%') || decoded.includes('\\')) {
    return false
  }
  if (decoded.split('/').length !== path.split('/').length) {
    return false
  }
  if (!ROOT_SEGMENT_ALLOWED_PATTERN.test(decoded.replaceAll('/', ''))) {
    return false
  }
  return [path.split('/'), decoded.split('/')].every(
    segments => segments.every(segment => !ROOT_SEGMENT_DENIED.has(segment))
  )
}

function readRootPath(scanner) {
  if (!scanner.takeLiteral('/')) {
    return null
  }
  const segments = []
  for (;;) {
    const segment = scanner.take(ROOT_SEGMENT_RUN_PATTERN)
    if (segment === null) {
      return null
    }
    segments.push(segment)
    if (!scanner.takeLiteral('/')) {
      break
    }
  }
  return `/${segments.join('/')}`
}

function readRootUrl(scanner) {
  if (scanner.take(ROOT_URL_PATTERN) === null) {
    return null
  }
  const delimiter = scanner.take(/^["']/)
  if (delimiter === null) {
    throw new Error('LINK_CARD_STYLE_RESOURCE')
  }
  const path = readRootPath(scanner)
  if (path === null || !scanner.takeLiteral(delimiter) || !scanner.takeLiteral(')')) {
    throw new Error('LINK_CARD_STYLE_RESOURCE')
  }
  if (!auditRootPath(path.slice(1))) {
    throw new Error('LINK_CARD_STYLE_RESOURCE')
  }
  return path
}

module.exports = { readRootUrl }
