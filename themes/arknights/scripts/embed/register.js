'use strict'

const { fetchEmbedMetadata } = require('./fetch')
const { renderEmbeds } = require('./render')
const cache = require('./cache')

const CONTEXT_KEY = '__arknightsEmbed'

const lookupEntry = (key) => cache.getLive(key)

// 幂等：同一 context 重复 require 本脚本时直接返回，避免过滤器叠加。
const register = (hexoContext) => {
  if (hexoContext[CONTEXT_KEY]) return
  hexoContext[CONTEXT_KEY] = true

  const token = process.env.EMBED_GITHUB_TOKEN || process.env.GITHUB_TOKEN || null
  const log = hexoContext.log

  // 5 严格早于 Hexo 核心的 render_post（10）：后者才把 post.content 物化并触发整条
  // after_post_render 链，抓取结果必须在那之前就绪。每次构建只注册一次、也只调用一次——
  // loadSidecar 会先清空 live store，第二次调用会把刚抓到的条目连同上一轮结果一起丢掉。
  hexoContext.extend.filter.register('before_generate', async () => {
    const stats = await fetchEmbedMetadata(hexoContext, { token })
    if ((stats.fetched > 0 || stats.failed > 0) && log && typeof log.info === 'function') {
      log.info(`[embed] 元数据抓取：命中 ${stats.fetched}，降级 ${stats.failed}，缓存复用 ${stats.skipped}`)
    }
  }, 5)

  // 11 晚于 terms（10）与核心 excerpt（10）、早于 meta-description（20）与搜索快照
  // （1100）：卡片不参与术语链接化、不改写已定稿的 excerpt，而这两者读的是 marker 投影
  // 而非 content，故都看不见卡片正文。返回值无条件回写：renderEmbeds 除了注入卡片，
  // 还会摘掉过不了 isSafeUrl 的 href，只按 rendered / plain 计数回写会漏掉这一种改写。
  hexoContext.extend.filter.register('after_post_render', (data) => {
    if (typeof data.content !== 'string') return data
    data.content = renderEmbeds(data.content, lookupEntry).html
    if (typeof data.more === 'string') data.more = renderEmbeds(data.more, lookupEntry).html
    return data
  }, 11)
}

register(hexo)
