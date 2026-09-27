'use strict'

const { tokenizeHtml } = require('./html-segments')

// ??…?? 遮盖：在 after_post_render 优先级 5 作用于「已渲染 HTML」，产物 <span class="spoiler">…</span>
// 契约：
//   1. 配对定界符只从文本节点扫描，标签（含属性区）与 <pre>/<code> 整元素内不参与配对；
//   2. 配对范围可跨越内联标签（??**粗**??、~~??…??~~），因此内容按原样透传、不做转义——
//      转义会直接摧毁「遮盖内可嵌套行内语法」这一契约本身，而本 filter 的输入是站点自身 Markdown
//      管线产出的已渲染 HTML（作者即站点所有者，站点本已允许裸 HTML），不引入新的不可信面；
//   3. 严格单行：开闭定界符之间出现换行即整枚放弃，故孤立 ?? 永远不会静默吃掉下一行的 ??；
//   4. trim 后可见文本 1–120 字符（标签不计入长度），越界整枚放弃并原样保留字面量 ??。
const DELIMITER = '??'
const OPEN_TAG = '<span class="spoiler">'
const CLOSE_TAG = '</span>'
const MAX_SPOILER_LENGTH = 120

// <pre>/<code> 内是代码，?? 只是字面量：既不在其中配对，也不允许遮盖范围跨越它
const isProtectedElement = (name) => name === 'pre' || name === 'code'

const findDelimiter = (text, from) => text.indexOf(DELIMITER, from)

// 自 (startToken, startOffset) 收集到下一个闭定界符为止的 token（不含两个定界符）
// 下一个 ?? 落在更晚的行、或中途出现换行或 <pre>/<code> 整元素时返回 null：
// 调用方只前进一个定界符重新起配，故本行的其余 ?? 仍各自获得配对机会，孤立 ?? 不会跨行
const collectBody = (tokens, startToken, startOffset) => {
  const body = []
  let tokenIndex = startToken
  let offset = startOffset
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex]
    if (token.kind === 'element') return null
    if (token.kind === 'text') {
      const rest = token.text.slice(offset)
      const close = findDelimiter(rest, 0)
      const head = close === -1 ? rest : rest.slice(0, close)
      if (head.includes('\n')) return null
      if (close !== -1) {
        if (head.length > 0) body.push({ kind: 'text', text: head, name: '' })
        return { endToken: tokenIndex, endOffset: offset + close, body }
      }
      if (rest.length > 0) body.push({ kind: 'text', text: rest, name: '' })
    } else {
      body.push(token)
    }
    tokenIndex += 1
    offset = 0
  }
  return null
}

// 去掉首尾的空白文本节点并对首尾文本做 trim，使遮盖块内不残留定界符旁的空格
const trimBody = (body) => {
  const trimmed = body.slice()
  while (trimmed.length > 0 && trimmed[0].kind === 'text' && trimmed[0].text.trim() === '') trimmed.shift()
  while (trimmed.length > 0) {
    const last = trimmed.length - 1
    if (trimmed[last].kind !== 'text' || trimmed[last].text.trim() !== '') break
    trimmed.pop()
  }
  if (trimmed.length > 0 && trimmed[0].kind === 'text') {
    trimmed[0] = { kind: 'text', text: trimmed[0].text.trimStart(), name: '' }
    const last = trimmed.length - 1
    if (trimmed[last].kind === 'text') {
      trimmed[last] = { kind: 'text', text: trimmed[last].text.trimEnd(), name: '' }
    }
  }
  return trimmed
}

const visibleText = (body) => {
  let text = ''
  for (const token of body) {
    if (token.kind === 'text') text += token.text
  }
  return text.trim()
}

const replaceSpoilers = (html) => {
  if (typeof html !== 'string' || !html.includes(DELIMITER)) return html
  const tokens = tokenizeHtml(html, isProtectedElement)
  const output = []
  let tokenIndex = 0
  let offset = 0
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex]
    if (token.kind !== 'text') {
      output.push(token.text)
      tokenIndex += 1
      offset = 0
      continue
    }
    if (offset >= token.text.length) {
      tokenIndex += 1
      offset = 0
      continue
    }
    const open = findDelimiter(token.text, offset)
    if (open === -1) {
      output.push(token.text.slice(offset))
      tokenIndex += 1
      offset = 0
      continue
    }
    const range = collectBody(tokens, tokenIndex, open + DELIMITER.length)
    if (range === null) {
      output.push(token.text.slice(offset, open + DELIMITER.length))
      offset = open + DELIMITER.length
      continue
    }
    const body = trimBody(range.body)
    const visible = visibleText(body)
    if (visible.length === 0 || visible.length > MAX_SPOILER_LENGTH) {
      output.push(token.text.slice(offset, range.endOffset + DELIMITER.length))
      offset = range.endOffset + DELIMITER.length
      continue
    }
    output.push(token.text.slice(offset, open), OPEN_TAG)
    for (const item of body) output.push(item.text)
    output.push(CLOSE_TAG)
    tokenIndex = range.endToken
    offset = range.endOffset + DELIMITER.length
  }
  return output.join('')
}

module.exports = { replaceSpoilers }
