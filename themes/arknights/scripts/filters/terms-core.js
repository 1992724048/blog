'use strict'

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 词表过滤空 term、按长度降序（长词优先匹配）、按小写去重（先出现者胜）；避免零宽模式与大小写重复词条
const dedupeTerms = (termList) => {
  const seen = new Set()
  return termList
    .slice()
    .filter(({ term }) => term)
    .sort((a, b) => b.term.length - a.term.length)
    .filter(({ term }) => {
      const key = term.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// 大小写不敏感合成正则；字母数字边界防止部分命中（ESP32 不命中 ESP32-S3）
const buildPattern = (terms) => {
  const parts = terms.map(({ term }) => `(?<![A-Za-z0-9_-])${escapeRegExp(term)}(?![A-Za-z0-9_-])`)
  if (parts.length === 0) return null
  return new RegExp(parts.join('|'), 'gi')
}

// 保护段：<pre>/<code>/<a> 与 span.spoiler 整元素、任意 HTML 标签（属性区）
const PROTECTED_SEGMENT = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<span\b[^>]*class="[^"]*\bspoiler\b[^"]*"[^>]*>[\s\S]*?<\/span>|<[^>]*>)/g

// 将 HTML 中的术语替换为站内锚点链接；matched 以小写词条为键，按首次命中记录全局锚点与文章内编号
const replaceTerms = (html, termList, matched = new Map()) => {
  if (!Array.isArray(termList) || termList.length === 0) return html
  const terms = dedupeTerms(termList)
  const pattern = buildPattern(terms)
  if (!pattern) return html
  const definitions = new Map(
    terms.map(({ term, url }, index) => [term.toLowerCase(), { term, url, anchorIndex: index }])
  )
  return html
    .split(PROTECTED_SEGMENT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment
      return segment.replace(pattern, (match) => {
        const key = match.toLowerCase()
        let entry = matched.get(key)
        if (!entry) {
          entry = {
            ...definitions.get(key),
            termIndex: matched.size + 1
          }
          matched.set(key, entry)
        }
        return `<a class="term-link" href="#term-${entry.anchorIndex}" data-term-index="${entry.termIndex}">${match}</a>`
      })
    })
    .join('')
}

// 生成底部引用式术语列表；条目顺序与文章内首次出现顺序一致，data-term-index 与正文角标共用编号
const buildTermsList = (matched) => {
  if (!(matched instanceof Map) || matched.size === 0) return ''
  const items = []
  for (const { term, url, anchorIndex, termIndex } of matched.values()) {
    const safeUrl = url.replace(/"/g, '&quot;')
    items.push(`    <li id="term-${anchorIndex}" data-term-index="${termIndex}"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${term}</a></li>`)
  }
  return `<hr class="terms-sep">\n<div class="terms-title">术语表</div>\n<ol class="terms-ref">\n${items.join('\n')}\n</ol>`
}

module.exports = { replaceTerms, buildTermsList }
