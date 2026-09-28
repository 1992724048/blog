'use strict'

const { fetchEmbedMetadata } = require('./fetch')
const { renderEmbeds } = require('./render')
const cache = require('./cache')

const CONTEXT_KEY = '__arknightsEmbed'

const lookupEntry = (key) => cache.getLive(key)

const register = (hexoContext) => {
  if (hexoContext[CONTEXT_KEY]) return
  hexoContext[CONTEXT_KEY] = true

  const token = process.env.EMBED_GITHUB_TOKEN || process.env.GITHUB_TOKEN || null
  const log = hexoContext.log

  hexoContext.extend.filter.register('before_generate', async () => {
    const stats = await fetchEmbedMetadata(hexoContext, { token })
    if ((stats.fetched > 0 || stats.failed > 0) && log && typeof log.info === 'function') {
      log.info(`[embed] 元数据抓取：命中 ${stats.fetched}，降级 ${stats.failed}，缓存复用 ${stats.skipped}`)
    }
  }, 5)

  hexoContext.extend.filter.register('after_post_render', (data) => {
    if (typeof data.content !== 'string') return data
    data.content = renderEmbeds(data.content, lookupEntry).html
    if (typeof data.more === 'string') data.more = renderEmbeds(data.more, lookupEntry).html
    return data
  }, 11)
}

register(hexo)
