'use strict'

const { replaceAlerts } = require('./alerts-core')
const { inspectSearchEncryption } = require('./encryption-policy')

// 优先级 5：与 spoiler 同级，确保在 terms（10）之前处理；after 9 之前执行，看到的是未物化 placeholder
hexo.extend.filter.register('after_post_render', function (data) {
  const { state } = inspectSearchEncryption(data, hexo.config.encrypt)
  if (state === 'encrypted') return data
  if (state === 'ambiguous') {
    throw Object.assign(new Error('ENCRYPTION_STATE_AMBIGUOUS'), { code: 'ENCRYPTION_STATE_AMBIGUOUS' })
  }
  data.content = replaceAlerts(data.content)
  data.excerpt = replaceAlerts(data.excerpt)
  if (data.more) data.more = replaceAlerts(data.more)
  return data
}, 5)
