'use strict'

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 词表按 term 长度降序合成正则，长词优先匹配；字母数字边界防止部分命中（ESP32 不命中 ESP32-S3）
const buildPattern = (termList) => {
  const parts = termList
    .slice()
    .sort((a, b) => b.term.length - a.term.length)
    .map(({ term }) => `(?<![A-Za-z0-9_-])${escapeRegExp(term)}(?![A-Za-z0-9_-])`)
  return new RegExp(parts.join('|'), 'g')
}

// 将 HTML 中的术语替换为外部链接；<pre>/<code>/<a> 包裹内容原样保留
const replaceTerms = (html, termList) => {
  if (!Array.isArray(termList) || termList.length === 0) return html
  const pattern = buildPattern(termList)
  const urlMap = new Map(termList.map(({ term, url }) => [term, url]))
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>)/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment
      return segment.replace(pattern, (match) => {
        const url = urlMap.get(match).replace(/"/g, '&quot;')
        return `<a class="term-link" href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`
      })
    })
    .join('')
}

module.exports = { replaceTerms }
