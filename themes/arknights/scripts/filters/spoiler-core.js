'use strict'

// 保护段：<pre>/<code>/<a> 整元素（含内容）与任意 HTML 标签（属性区）；仅对普通文本做遮盖替换
const PROTECTED_SEGMENT = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<[^>]*>)/g

// ?内容? → <span class="spoiler">内容</span>；内容限单行、不含 ?、<、>，trim 后 1–120 字符
const SPOILER_PATTERN = /\?([^?<>\n]+?)\?/g
const MAX_SPOILER_LENGTH = 120

const replaceSpoilers = (html) => {
  if (typeof html !== 'string' || !html.includes('?')) return html
  return html
    .split(PROTECTED_SEGMENT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment
      return segment.replace(SPOILER_PATTERN, (match, content) => {
        const text = content.trim()
        if (text.length === 0 || text.length > MAX_SPOILER_LENGTH) return match
        return `<span class="spoiler">${text}</span>`
      })
    })
    .join('')
}

module.exports = { replaceSpoilers }
