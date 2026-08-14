'use strict'

const { replaceTerms } = require('./terms-core')

hexo.extend.filter.register('after_post_render', function (data) {
  const termList = hexo.config.theme_config.terms && hexo.config.theme_config.terms.list
  if (!Array.isArray(termList) || termList.length === 0) return data
  if (data.encrypt || data.password) return data
  data.content = replaceTerms(data.content, termList)
  data.excerpt = replaceTerms(data.excerpt, termList)
  // data.more 由 Hexo 核心 after_post_render/excerpt 过滤器先填充（同优先级按注册序，核心先注册）；主题关闭 post.excerpt 时文章页渲染 page.more，需一并替换
  if (data.more) data.more = replaceTerms(data.more, termList)
  return data
})
