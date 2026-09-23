'use strict'

// 保护段：pre/code/a 整元素与任意 HTML 标签（属性区），避免把标记塞进标签或代码
const PROTECTED_SEGMENT = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<[^>]*>)/g

// [&]AI|PASS 或 [&]AI|PASS|自定义文本|（状态亦可为 IGNORE / NOTREVIEW / EDIT）；兼容 markdown 渲染后 & 变为 &amp; 的形态；
// 自定义文本限 1–40 字符、不含 | ] < >（标签注入防护）；缺省时不渲染文本段
const AI_BADGE_PATTERN = /\[(?:&|&amp;)\]AI\|(PASS|EDIT|IGNORE|NOTREVIEW)(?:\|([^|\]<>]{1,40})\|)?/g

const BADGES = {
  PASS: { key: 'pass', label: 'PASS', desc: '已人工审核通过' },
  EDIT: { key: 'edit', label: 'EDIT', desc: '经人工审核并被人工修改' },
  IGNORE: { key: 'ignore', label: 'IGNORE', desc: '可忽略此标记' },
  NOTREVIEW: { key: 'notreview', label: 'NOTREVIEW', desc: '尚未经人工审核' }
}

// 悬停图例：列出全部四态（标签用对应底色）+ 介绍；每徽标内嵌一份，纯 CSS 展示、无 JS
const TIP_ROWS = Object.values(BADGES)
  .map(
    (b) =>
      `<span class="ai-badge__tip-row" role="row">` +
      `<span class="ai-badge__tip-cell ai-badge__tip-tag ai-badge--${b.key}" role="cell">${b.label}</span>` +
      `<span class="ai-badge__tip-cell ai-badge__tip-desc" role="cell">${b.desc}</span>` +
      `</span>`
  )
  .join('')

// 机器人图标（lucide bot 风格，stroke currentColor，置于左蓝段内显白）
const ROBOT_ICON =
  '<svg class="ai-badge__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
  '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

const renderBadge = (badge, text) =>
  `<span class="ai-badge ai-badge--${badge.key}">` +
  `<span class="ai-badge__icon">${ROBOT_ICON}</span>` +
  `<span class="ai-badge__status">${badge.label}</span>` +
  (text ? `<span class="ai-badge__text">${text}</span>` : '') +
  `<span class="ai-badge__tip" role="tooltip">` +
  `<span class="ai-badge__tip-title">AI 生成内容标记</span>` +
  `<span class="ai-badge__tip-table" role="table">` +
  TIP_ROWS +
  `</span>` +
  `</span>` +
  '</span>'

const replaceAiBadges = (html) => {
  if (typeof html !== 'string' || (!html.includes('[&]') && !html.includes('[&amp;]'))) return html
  return html
    .split(PROTECTED_SEGMENT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment
      return segment.replace(AI_BADGE_PATTERN, (match, state, customText) => {
        const badge = BADGES[state]
        if (!badge) return match
        const text = (customText || '').trim()
        return renderBadge(badge, text)
      })
    })
    .join('')
}

// 剥离已渲染的徽标 HTML（含内嵌 tip 深层嵌套 span，用深度计数找外层闭合）与未渲染原始标记，供 meta description 等纯文本场景使用
const stripRenderedBadges = (html) => {
  const START = '<span class="ai-badge'
  let out = html
  let idx = out.indexOf(START)
  while (idx !== -1) {
    let depth = 0
    let i = idx
    let end = -1
    while (i < out.length) {
      if (out.startsWith('<span', i)) {
        depth += 1
        i += 5
      } else if (out.startsWith('</span>', i)) {
        depth -= 1
        i += 7
        if (depth === 0) {
          end = i
          break
        }
      } else {
        i += 1
      }
    }
    if (end === -1) break
    out = out.slice(0, idx) + out.slice(end)
    idx = out.indexOf(START, idx)
  }
  return out
}

const stripAiBadgeMarkup = (text) => {
  if (typeof text !== 'string' || (!text.includes('ai-badge') && !text.includes('[&]') && !text.includes('[&amp;]'))) {
    return text
  }
  return stripRenderedBadges(text).replace(AI_BADGE_PATTERN, '').trim()
}

module.exports = { replaceAiBadges, stripAiBadgeMarkup }
