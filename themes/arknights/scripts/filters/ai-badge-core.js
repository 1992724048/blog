'use strict'

// 保护段：pre/code/a 整元素与任意 HTML 标签（属性区），避免把标记塞进标签或代码
const PROTECTED_SEGMENT = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<[^>]*>)/g

// [&]AI|PASS 或 [&]AI|PASS|自定义文本|；兼容 markdown 渲染后 & 变为 &amp; 的形态；
// 自定义文本限 1–40 字符、不含 | ] < >（标签注入防护）；缺省时不渲染文本段
const AI_BADGE_PATTERN = /\[(?:&|&amp;)\]AI\|(PASS|IGNORE|NOTREVIEW)(?:\|([^|\]<>]{1,40})\|)?/g

const BADGES = {
  PASS: { key: 'pass', label: 'PASS', title: 'AI 生成内容 · 已人工审核通过' },
  IGNORE: { key: 'ignore', label: 'IGNORE', title: 'AI 生成内容 · 可忽略此标记' },
  NOTREVIEW: { key: 'notreview', label: 'NOTREVIEW', title: 'AI 生成内容 · 尚未经人工审核' }
}

// 机器人图标（lucide bot 风格，stroke currentColor，置于左蓝段内显白）
const ROBOT_ICON =
  '<svg class="ai-badge__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
  '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>'

const renderBadge = (badge, text) =>
  `<span class="ai-badge ai-badge--${badge.key}" title="${badge.title}">` +
  `<span class="ai-badge__icon">${ROBOT_ICON}</span>` +
  `<span class="ai-badge__status">${badge.label}</span>` +
  (text ? `<span class="ai-badge__text">${text}</span>` : '') +
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

module.exports = { replaceAiBadges }
