'use strict'

const { identifyPlatform, cacheKey } = require('./platform')
const cache = require('./cache')
const githubProvider = require('./providers/github')
const bilibiliProvider = require('./providers/bilibili')

// 「独占一行」是本子系统唯一的行级规则，只在此处实现一次。
const SOLE_LINK_LINE = /^\s*<(https?:\/\/[^>\s]+)>\s*$/

// 一轮 provider 调用里最多发出的 HTTP 请求数：github 是仓库 + 提交数，
// bilibili 短链是跳转 + 详情，其余情形只有一次，故 2 是上界。
const MAX_REQUESTS_PER_CARD = 2

// 一个「时间单元」是一次 HTTP 尝试或一次退避等待，故一轮调用里的最坏情形是
// MAX_REQUESTS_PER_CARD × (retries 次退避 + retries+1 次尝试)。
const timeUnits = (retries) => MAX_REQUESTS_PER_CARD * (2 * retries + 1)

const collectSoleLinks = (documents) => {
  const targets = new Map()
  for (const doc of documents) {
    if (!doc || typeof doc._content !== 'string') continue
    for (const line of doc._content.split(/\r\n|\r|\n/)) {
      const m = SOLE_LINK_LINE.exec(line)
      if (!m) continue
      const target = identifyPlatform(m[1])
      if (!target) continue
      const key = cacheKey(target)
      if (key && !targets.has(key)) targets.set(key, { target, sourceUrl: m[1] })
    }
  }
  return targets
}

const runPool = async (items, limit, worker) => {
  const results = new Array(items.length)
  let cursor = 0
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

const failureEntry = (platform, reason, now) => ({
  platform,
  fetchedAt: new Date(now()).toISOString(),
  ok: false,
  reason
})

// 剩余预算按时间单元均摊：单请求超时与单次退避各取一份，于是这一张卡的最坏总耗时
// 不超过 remaining —— 迟到的请求拿到的超时被压进预算之内，deadline 才是硬边界而不只是
// 下一轮的准入闸门。单元宽不足 1ms 时取 1ms，超出量因此有界（<= timeUnits(retries) ms）。
const budgetSlice = (remainingMs, retries, timeoutMs, sleep) => {
  const perUnit = Math.max(1, Math.floor(remainingMs / timeUnits(retries)))
  return {
    timeoutMs: Math.min(timeoutMs, perUnit),
    sleep: (ms) => sleep(Math.min(ms, perUnit))
  }
}

const fetchEmbedMetadata = async (hexo, deps) => {
  const options = deps || {}
  const providers = options.providers || { github: githubProvider.fetchGithub, bilibili: bilibiliProvider.fetchBilibili }
  const concurrency = options.concurrency || 4
  const budgetMs = options.budgetMs || 60000
  const timeoutMs = options.timeoutMs || 10000
  const retries = options.retries === undefined ? 2 : options.retries
  const sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const now = options.now || Date.now

  // 日志与写盘都不是本阶段失败的判据：一个不完整的卡片远好过一次让整站变红的构建。
  const warn = (message) => {
    if (hexo && hexo.log && typeof hexo.log.warn === 'function') hexo.log.warn(message)
  }

  const documents = []
  for (const model of ['Post', 'Page']) {
    try {
      documents.push(...hexo.model(model).toArray())
    } catch {
      // 模型不存在时跳过，不阻断构建
    }
  }

  cache.loadSidecar(hexo.base_dir, now())
  const targets = collectSoleLinks(documents)
  const pending = [...targets.entries()].filter(([key]) => !cache.getLive(key))

  const stats = { scanned: targets.size, fetched: 0, failed: 0, skipped: targets.size - pending.length }
  if (pending.length === 0) return stats

  const deadline = now() + budgetMs

  await runPool(pending, concurrency, async ([key, { target }]) => {
    const remaining = deadline - now()
    if (remaining <= 0) {
      cache.putLive(key, failureEntry(target.platform, 'BUDGET_EXHAUSTED', now))
      stats.failed += 1
      return
    }
    const slice = budgetSlice(remaining, retries, timeoutMs, sleep)
    const provider = providers[target.platform]
    try {
      const entry = await provider(target, { token: options.token, timeoutMs: slice.timeoutMs, retries, sleep: slice.sleep })
      cache.putLive(key, entry)
      if (entry && entry.ok) stats.fetched += 1
      else {
        stats.failed += 1
        warn(`[embed] 抓取失败 ${key}：${entry && entry.reason ? entry.reason : 'UNKNOWN'}`)
      }
    } catch (err) {
      cache.putLive(key, failureEntry(target.platform, 'PROVIDER_THREW', now))
      stats.failed += 1
      warn(`[embed] provider 抛异常 ${key}：${err && err.message ? err.message : 'Error'}`)
    }
  })

  try {
    cache.flushSidecar(hexo.base_dir)
  } catch (err) {
    warn(`[embed] 缓存写盘失败，本次构建不使用持久缓存：${err && err.message ? err.message : 'Error'}`)
  }
  return stats
}

module.exports = { SOLE_LINK_LINE, collectSoleLinks, fetchEmbedMetadata }
