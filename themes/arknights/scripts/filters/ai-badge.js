'use strict'

const { replaceAiBadges } = require('./ai-badge-core')

// 优先级 5：先于 terms（10）与 core excerpt（10），标记先转徽标、excerpt/more 同步派生
hexo.extend.filter.register('after_post_render', function (data) {
  if (data.encrypt || data.password) return data
  data.content = replaceAiBadges(data.content)
  data.excerpt = replaceAiBadges(data.excerpt)
  if (data.more) data.more = replaceAiBadges(data.more)
  return data
}, 5)
