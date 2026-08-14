'use strict'

const { replaceTerms } = require('./terms-core')

hexo.extend.filter.register('after_post_render', function (data) {
  const termList = hexo.theme.config.terms && hexo.theme.config.terms.list
  if (!Array.isArray(termList) || termList.length === 0) return data
  if (data.encrypt || data.password) return data
  data.content = replaceTerms(data.content, termList)
  data.excerpt = replaceTerms(data.excerpt, termList)
  return data
})
