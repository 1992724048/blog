'use strict'

// GitHub 风格 Alert 解析：> [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
// markdown 渲染后结构：<blockquote>\n<p>[!NOTE]<br>content</p>\n</blockquote>
// 或 <blockquote>\n<p>[!NOTE]</p>\n<p>content</p>\n</blockquote>

const ALERT_PATTERN = /<blockquote>\s*\n?\s*<p>\[!((?:NOTE|TIP|IMPORTANT|WARNING|CAUTION))\](?:<\/p>|<br\s*\/?>)([\s\S]*?)<\/blockquote>/gi

const replaceAlerts = (html) => {
  if (typeof html !== 'string' || !html.includes('[!')) return html
  return html.replace(ALERT_PATTERN, (match, type, content) => {
    const cls = type.toLowerCase()
    // 清理内容前的 <p> 标签（如果有的话）
    const cleanContent = content.replace(/^\s*<p>/, '').replace(/<\/p>\s*$/, '')
    return `<blockquote class="alert alert-${cls}"><p><strong>${type}</strong></p><p>${cleanContent}</p></blockquote>`
  })
}

module.exports = { replaceAlerts }
