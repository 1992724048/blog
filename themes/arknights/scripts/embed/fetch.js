'use strict'

const { identifyPlatform, cacheKey } = require('./platform')
const cache = require('./cache')
const githubProvider = require('./providers/github')
const bilibiliProvider = require('./providers/bilibili')

// 「独占一行」是本子系统唯一的行级规则，只在此处实现一次。
const SOLE_LINK_LINE = /^\s*<(https?:\/\/[^>\s]+)>\s*$/

// MAX_TIME_UNITS_PER_CARD 是「时间单元」上界的**倍数**，既不是单卡请求数上界、也不是单卡
// 时间单元总数（后者是本值 × (2·retries+1)，见下方 timeUnits）：bilibili 短链在 retries=2
// 时会发 4 次请求（跳转探测固定 retries:0 只探 1 次，详情接口再走完整的 3 次尝试阶梯），
// 故任何按请求数写的上界都小于它。倍数取 2 的依据是：一轮 provider 调用里「走完整重试
// 阶梯的请求数」上界为 2——github 的 /repos + /commits 恰好取到；bilibili 短链是 1 条完整
// 阶梯加 1 次无退避探测（2·retries+2 ≤ 4·retries+2）；bilibili BV 号只有 1 条（2·retries+1）。
// 故 timeUnits = 2 × (2·retries+1) 是各路径最坏时间单元数的**确切**上界，改动此处的
// 倍数或下方阶梯的构成都会让「取整余量 ≤ timeUnits ms」的有界性证明失效。
const MAX_TIME_UNITS_PER_CARD = 2

// 一个「时间单元」是一次 HTTP 尝试或一次退避等待；一条完整阶梯含 retries 次退避 +
// retries+1 次尝试，即 2·retries+1 个单元。
const timeUnits = (retries) => MAX_TIME_UNITS_PER_CARD * (2 * retries + 1)

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
    } catch (err) {
      // 模型不存在时跳过，不阻断构建
      warn(`[embed] 读取 ${model} 模型失败，本次构建不扫描该模型：${err && err.message ? err.message : 'Error'}`)
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
