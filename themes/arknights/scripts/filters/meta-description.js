'use strict'

const { projectText } = require('../markers/pipeline')

const MAX_DESCRIPTION_LENGTH = 160

// 优先级 20：在 marker 消费（9）与 excerpt 派生（10）之后生成纯文本描述
hexo.extend.filter.register('after_post_render', function (data) {
  if (data.encrypt || data.password) return data

  if (data.description && typeof data.description === 'string') {
    const cleaned = data.description.replace(/\s+/g, ' ').trim()
    if (cleaned) data.description = cleaned
    return data
  }

  const sourceField = data.excerpt ? 'excerpt' : 'content'
  const source = data[sourceField] || ''
  if (!source) return data

  const stripHtml = hexo.extend.helper.get('strip_html')
  let description = projectText(data, sourceField) ?? String(source)
  description = stripHtml(description)
  description = description.replace(/\s+/g, ' ').trim()
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    description = description.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd() + '…'
  }
  if (description) data.description = description
  return data
}, 20)
