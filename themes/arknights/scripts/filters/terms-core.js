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

// 将 HTML 中的术语替换为站内锚点链接（href=#term-{index}）；<pre>/<code>/<a> 包裹内容原样保留；
// 传入 matched（Set）时收集实际命中的词条（小写），供底部列表过滤
const replaceTerms = (html, termList, matched = null) => {
  if (!Array.isArray(termList) || termList.length === 0) return html
  const terms = dedupeTerms(termList)
  const pattern = buildPattern(terms)
  if (!pattern) return html
  const indexMap = new Map(terms.map(({ term }, index) => [term.toLowerCase(), index]))
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>)/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment
      return segment.replace(pattern, (match) => {
        if (matched) matched.add(match.toLowerCase())
        return `<a class="term-link" href="#term-${indexMap.get(match.toLowerCase())}">${match}</a>`
      })
    })
    .join('')
}

// 生成底部引用式术语列表（分隔线 + 非 h 标题 + 编号列表）；matched 为实际命中词条（小写 Set）：
// 仅输出命中词条且 id 保持全词条去重序的原始 index（正文锚点与之对应）；编号 [n] 由 CSS counter 呈现
const buildTermsList = (termList, matched = null) => {
  const terms = dedupeTerms(termList)
  if (terms.length === 0) return ''
  const items = []
  terms.forEach(({ term, url }, index) => {
    if (matched && !matched.has(term.toLowerCase())) return
    const safeUrl = url.replace(/"/g, '&quot;')
    items.push(`    <li id="term-${index}"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${term}</a></li>`)
  })
  if (items.length === 0) return ''
  return `<hr class="terms-sep">\n<div class="terms-title">术语表</div>\n<ol class="terms-ref">\n${items.join('\n')}\n</ol>`
}

module.exports = { replaceTerms, buildTermsList }
