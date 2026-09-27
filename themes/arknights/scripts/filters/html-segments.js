'use strict'

// 已渲染 HTML 的分段器：把 HTML 切成 token 流，供遮盖（spoiler-core）与术语链接（terms-core）复用
// token 形态 { kind, text, name }：
//   text    —— 极大连续纯文本节点，替换只发生在这一类上
//   tag     —— 单个标签原文（含尖括号），只承载标记本身，属性区内的 ? 永不参与配对
//   element —— 命中 isProtected 的整元素（含首尾标签与其全部内容），按同名标签配对深度截取
// 改用 token 而非单条正则的原因：遮盖要求 ??…?? 的配对范围可跨越内联标签（??**粗**??），
// 术语要求 span.spoiler 整元素不可被链接化而遮盖内容可能再嵌 <span>；两者都无法用一条正则表达

// 从 start（指向 '<'）扫到标签结束的 '>'（跳过引号内的 '>'），不完整标签返回 -1
const readTagEnd = (html, start) => {
  let quote = ''
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return index
    }
  }
  return -1
}

const readTagName = (tag) => {
  const matched = /^<\/?\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(tag)
  return matched ? matched[1].toLowerCase() : ''
}

const isClosingTag = (tag) => /^<\s*\//.test(tag)

const isSelfClosing = (tag) => /\/>\s*$/.test(tag)

// 命中 isProtected 的整元素：自 openStart 起对同名标签做开闭深度计数，返回结束标签之后的位置；未闭合返回 -1
const readElementEnd = (html, openStart, name) => {
  const scanner = new RegExp(`<(/?)${name}(?=[\\s/>])`, 'gi')
  let depth = 0
  let cursor = openStart
  while (cursor < html.length) {
    scanner.lastIndex = cursor
    const matched = scanner.exec(html)
    if (!matched) return -1
    const tagEnd = readTagEnd(html, matched.index)
    if (tagEnd === -1) return -1
    const tag = html.slice(matched.index, tagEnd + 1)
    if (!isSelfClosing(tag)) depth += matched[1] ? -1 : 1
    if (depth === 0) return tagEnd + 1
    cursor = tagEnd + 1
  }
  return -1
}

const tokenizeHtml = (html, isProtected) => {
  const tokens = []
  let cursor = 0
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor)
    if (open === -1) {
      tokens.push({ kind: 'text', text: html.slice(cursor), name: '' })
      break
    }
    if (open > cursor) tokens.push({ kind: 'text', text: html.slice(cursor, open), name: '' })
    const tagEnd = readTagEnd(html, open)
    if (tagEnd === -1) {
      tokens.push({ kind: 'text', text: html.slice(open), name: '' })
      break
    }
    const tag = html.slice(open, tagEnd + 1)
    const name = readTagName(tag)
    if (name && !isClosingTag(tag) && !isSelfClosing(tag) && isProtected(name, tag)) {
      const elementEnd = readElementEnd(html, open, name)
      if (elementEnd !== -1) {
        tokens.push({ kind: 'element', text: html.slice(open, elementEnd), name })
        cursor = elementEnd
        continue
      }
    }
    tokens.push({ kind: 'tag', text: tag, name })
    cursor = tagEnd + 1
  }
  return tokens
}

module.exports = { tokenizeHtml }
