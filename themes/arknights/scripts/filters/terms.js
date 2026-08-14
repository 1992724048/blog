'use strict'

const { replaceTerms, buildTermsList } = require('./terms-core')

hexo.extend.filter.register('after_post_render', function (data) {
  const termList = hexo.config.theme_config.terms && hexo.config.theme_config.terms.list
  if (!Array.isArray(termList) || termList.length === 0) return data
  if (data.encrypt || data.password) return data
  data.content = replaceTerms(data.content, termList)
  data.excerpt = replaceTerms(data.excerpt, termList)
  if (data.more) data.more = replaceTerms(data.more, termList)
  const termsSection = buildTermsList(termList)
  if (termsSection) {
    // core after_post_render/excerpt 过滤器先运行，more 为独立子串；excerpt 开/关两条渲染路径都需列表
    data.content += termsSection
    if (data.more) data.more += termsSection
  }
  return data
})
