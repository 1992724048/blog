'use strict'

const { stripAiBadgeMarkup } = require('./ai-badge-core')

const MAX_DESCRIPTION_LENGTH = 160

// 优先级 20：在 ai-badge（5）与 excerpt 派生（10）之后，保证 open_graph 用到的 description 不含 AI 徽标文案
hexo.extend.filter.register('after_post_render', function (data) {
  if (data.encrypt || data.password) return data

  if (data.description && typeof data.description === 'string') {
    const cleaned = stripAiBadgeMarkup(data.description).replace(/\s+/g, ' ').trim()
    if (cleaned) data.description = cleaned
    return data
  }

  const source = data.excerpt || data.content || ''
  if (!source) return data

  const stripHtml = hexo.extend.helper.get('strip_html')
  let description = stripAiBadgeMarkup(String(source))
  description = stripHtml(description)
  description = description.replace(/\s+/g, ' ').trim()
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    description = description.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd() + '…'
  }
  if (description) data.description = description
  return data
}, 20)
