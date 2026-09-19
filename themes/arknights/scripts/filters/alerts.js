'use strict'

const { replaceAlerts } = require('./alerts-core')

// 优先级 5：与 spoiler 同级，确保在 terms（10）之前处理
hexo.extend.filter.register('after_post_render', function (data) {
  if (data.encrypt || data.password) return data
  data.content = replaceAlerts(data.content)
  data.excerpt = replaceAlerts(data.excerpt)
  if (data.more) data.more = replaceAlerts(data.more)
  return data
}, 5)
