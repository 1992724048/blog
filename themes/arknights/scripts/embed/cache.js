'use strict'

const fs = require('node:fs')
const path = require('node:path')

const CACHE_SCHEMA = 'arknights-embed-cache'
const CACHE_VERSION = 1
const CACHE_FILE = 'embed-cache.json'
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FAIL_TTL_MS = 24 * 60 * 60 * 1000

// live store 是抓取阶段与渲染阶段之间唯一的运行时通道；sidecar 文件是它的持久镜像。
const live = new Map()
let persisted = ''

const getLive = (key) => live.get(key)
const putLive = (key, entry) => { live.set(key, entry) }
const liveKeys = () => [...live.keys()]
const resetLive = () => { live.clear(); persisted = '' }

const ttlFor = (entry) => (entry && entry.ok === false ? FAIL_TTL_MS : OK_TTL_MS)

const isExpired = (entry, nowMs) => {
  if (!entry || typeof entry.fetchedAt !== 'string') return true
  const at = Date.parse(entry.fetchedAt)
  if (Number.isNaN(at)) return true
  return nowMs - at > ttlFor(entry)
}

const serialize = () => {
  const entries = {}
  for (const key of [...live.keys()].sort()) entries[key] = live.get(key)
  return JSON.stringify({ schema: CACHE_SCHEMA, version: CACHE_VERSION, entries }, null, 2) + '\n'
}

const loadSidecar = (baseDir, nowMs) => {
  const file = path.join(baseDir, CACHE_FILE)
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    persisted = ''
    return 0
  }
  if (!parsed || parsed.schema !== CACHE_SCHEMA || parsed.version !== CACHE_VERSION || !parsed.entries) {
    persisted = ''
    return 0
  }
  live.clear()
  let kept = 0
  for (const [key, entry] of Object.entries(parsed.entries)) {
    if (isExpired(entry, nowMs)) continue
    live.set(key, entry)
    kept += 1
  }
  persisted = serialize()
  return kept
}

const flushSidecar = (baseDir) => {
  const next = serialize()
  if (next === persisted) return false
  fs.writeFileSync(path.join(baseDir, CACHE_FILE), next, 'utf8')
  persisted = next
  return true
}

module.exports = {
  CACHE_SCHEMA, CACHE_VERSION, CACHE_FILE, OK_TTL_MS, FAIL_TTL_MS,
  getLive, putLive, liveKeys, isExpired, loadSidecar, flushSidecar, resetLive
}
