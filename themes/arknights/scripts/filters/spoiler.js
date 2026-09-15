'use strict'

const { replaceSpoilers } = require('./spoiler-core')

// 优先级 5：必须先于 terms（after_post_render 默认 10）——否则 ?…? 内容中的词条会先被包成 <a>，
// 因保护段断裂导致整段遮盖失效；也先于 core excerpt（10），excerpt/more 通常由处理后的 content 派生
hexo.extend.filter.register('after_post_render', function (data) {
  if (data.encrypt || data.password) return data
  data.content = replaceSpoilers(data.content)
  data.excerpt = replaceSpoilers(data.excerpt)
  if (data.more) data.more = replaceSpoilers(data.more)
  return data
}, 5)
