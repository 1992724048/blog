# 术语功能迭代 v2：底部引用式术语列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正文术语链接改为站内锚点，点击跳转到文章底部引用式术语列表（编号 + 词条 + 外链），列表用分隔线与正文隔离且不计入目录。

**Architecture:** 复用现有 terms 构建时替换管线（`after_post_render`）：正文替换目标从外部 URL 改为 `#term-{index}` 锚点；新增列表生成函数追加到 `data.content` 与 `data.more` 末尾；列表标题用非 h 元素天然豁免 toc。

**Tech Stack:** Node.js（Hexo 8 主题脚本）、CommonJS、Stylus。

## Global Constraints

- 不修改 package.json 与任何构建配置
- 配置 `terms.list` 结构不变（`{ term, url }`）
- 大小写不敏感匹配、去重（先出现者胜）、空 term 过滤、null-pattern 守卫等既有行为全部保留（terms-core.js 现有逻辑）
- 加密文章（`data.encrypt`/`data.password`）跳过（既有）
- 列表必须追加到 `data.content` 与 `data.more` 两者末尾（core excerpt 过滤器先于 terms 运行，`more` 为独立子串；excerpt 开/关两条渲染路径都显示；同页只渲染其一不重复）
- 列表标题为 `<div class="terms-title">`（非 h 元素），toc 不计入
- 正文链接：`<a class="term-link" href="#term-{index}">词</a>`，index 为去重后词条序号（同词条所有出现指向同一锚点）
- 列表项：`<li id="term-{index}">词条 — <a href="{url}" target="_blank" rel="noopener noreferrer">链接</a></li>`，URL 转义 `"` 为 `&quot;`
- 分隔线 `<hr class="terms-sep">` 复用主题 hr 装饰样式（13% 宽 3px 条）
- 测试脚本放 `.temp/`（gitignore），验证后删除
- Node ≥ 18，lookbehind 可用

---

### Task 1: terms-core.js 锚点链接 + 列表生成 + 单测

**Files:**
- Modify: `themes/arknights/scripts/filters/terms-core.js`
- Create: `.temp/test-terms-v2.js`（临时测试，gitignored）

**Interfaces:**
- Produces: `replaceTerms(html, termList)` 行为变更（链接为锚点）；新增 `buildTermsList(termList): string`（生成分隔线+标题+ol 列表 HTML）；`dedupeTerms(termList)` 仅供模块内部使用（不导出）

- [ ] **Step 1: 写失败测试** `.temp/test-terms-v2.js`

```js
'use strict'
const assert = require('assert')
const { replaceTerms, buildTermsList } = require('../themes/arknights/scripts/filters/terms-core')

const TERMS = [
  { term: 'ESP32', url: 'https://example.com/esp32' },
  { term: 'XOR', url: 'https://example.com/xor' },
]

// 1. 正文链接为站内锚点，保留原文大小写，同词条指向同一锚点
const replaced = replaceTerms('使用 esp32 与 ESP32，XOR 加密', TERMS)
assert.strictEqual(replaced,
  '使用 <a class="term-link" href="#term-0">esp32</a> 与 <a class="term-link" href="#term-0">ESP32</a>，' +
  '<a class="term-link" href="#term-1">XOR</a> 加密')

// 2. 列表：分隔线 + 非 h 标题 + 编号 li（id 与锚点对应），URL 保留
const list = buildTermsList(TERMS)
assert.ok(list.includes('<hr class="terms-sep">'), '分隔线')
assert.ok(list.includes('<div class="terms-title">'), '标题为非 h 元素')
assert.ok(!/<h[1-6]/.test(list), '无 h 标题（toc 豁免）')
assert.ok(list.includes('<ol class="terms-ref">'), '编号列表')
assert.ok(list.includes('<li id="term-0">ESP32 — <a href="https://example.com/esp32" target="_blank" rel="noopener noreferrer">链接</a></li>'), '列表项 0')
assert.ok(list.includes('<li id="term-1">XOR — <a href="https://example.com/xor" target="_blank" rel="noopener noreferrer">链接</a></li>'), '列表项 1')

// 3. 边界：代码块/已有链接仍跳过；空词表原样返回；列表为空串
assert.ok(!replaceTerms('<pre>ESP32</pre>', TERMS).includes('term-link'))
assert.strictEqual(replaceTerms('XOR 加密', []), 'XOR 加密')
assert.strictEqual(buildTermsList([]), '')

// 4. URL 引号转义
const quoted = buildTermsList([{ term: 'A', url: 'https://x/"y"' }])
assert.ok(quoted.includes('https://x/&quot;y&quot;'))

console.log('terms-core v2: all tests passed')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node .temp/test-terms-v2.js`
Expected: FAIL（buildTermsList 不存在 / 链接含外部 URL）

- [ ] **Step 3: 实现 terms-core.js**

```js
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

// 将 HTML 中的术语替换为站内锚点链接（href=#term-{index}）；<pre>/<code>/<a> 包裹内容原样保留
const replaceTerms = (html, termList) => {
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
        return `<a class="term-link" href="#term-${indexMap.get(match.toLowerCase())}">${match}</a>`
      })
    })
    .join('')
}

// 生成底部引用式术语列表（分隔线 + 非 h 标题 + 编号列表）；空词表返回空串
const buildTermsList = (termList) => {
  const terms = dedupeTerms(termList)
  if (terms.length === 0) return ''
  const items = terms
    .map(({ term, url }, index) => {
      const safeUrl = url.replace(/"/g, '&quot;')
      return `    <li id="term-${index}">${term} — <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">链接</a></li>`
    })
    .join('\n')
  return `<hr class="terms-sep">\n<div class="terms-title">术语表</div>\n<ol class="terms-ref">\n${items}\n</ol>`
}

module.exports = { replaceTerms, buildTermsList }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node .temp/test-terms-v2.js`
Expected: PASS，`terms-core v2: all tests passed`

- [ ] **Step 5: 提交**

```bash
git add themes/arknights/scripts/filters/terms-core.js
git commit -m "feat(terms): 正文链接改站内锚点并新增底部引用式术语列表生成"
```

---

### Task 2: terms.js 追加术语列表

**Files:**
- Modify: `themes/arknights/scripts/filters/terms.js`

**Interfaces:**
- Consumes: `replaceTerms(html, termList)`、`buildTermsList(termList)`（Task 1）

- [ ] **Step 1: 实现**

在 `data.content` 与 `data.excerpt` 替换之后、`return data` 之前追加：

```js
  data.content = replaceTerms(data.content, termList)
  data.excerpt = replaceTerms(data.excerpt, termList)
  if (data.more) data.more = replaceTerms(data.more, termList)
  const termsSection = buildTermsList(termList)
  if (termsSection) {
    // core after_post_render/excerpt 过滤器先运行，more 为独立子串；excerpt 开/关两条渲染路径都需列表
    data.content += termsSection
    if (data.more) data.more += termsSection
  }
  return data
```

（顶部 require 增加 `buildTermsList`。）

- [ ] **Step 2: 构建验证**

Run: `npx hexo clean && npx hexo generate`
Expected: 成功；xorstr 页 HTML 末尾含 `terms-sep`/`terms-ref`，正文 term-link href 为 `#term-*`

- [ ] **Step 3: 提交**

```bash
git add themes/arknights/scripts/filters/terms.js
git commit -m "feat(terms): 文章底部追加引用式术语列表（content/more 双路径）"
```

---

### Task 3: 术语列表样式

**Files:**
- Modify: `themes/arknights/source/css/_core/base.styl`

- [ ] **Step 1: 追加样式**（.term-link 之后）

```styl
.terms-sep
  color var(--theme-unimportant-2)
  position relative
  &:before
    content ''
    width 13%
    height 3px
    display block
    position absolute
    background-color var(--theme-text-light)
    top -3px
    left -1px

.terms-title
  color var(--theme-text-light)
  font-weight bold
  margin .5em 0 .3em 0

.terms-ref
  color var(--theme-unimportant)
  margin 0
  padding-left 2em
  li
    margin .2em 0
    scroll-margin-top 60px
    a
      color var(--theme-highlight)
```

- [ ] **Step 2: 构建验证**

Run: `npx hexo clean && npx hexo generate`
Expected: 编译 CSS 含 `.terms-sep`/`.terms-title`/`.terms-ref` 规则

- [ ] **Step 3: 提交**

```bash
git add themes/arknights/source/css/_core/base.styl
git commit -m "style(terms): 底部术语列表样式（分隔线/标题/编号列表/锚点偏移）"
```

---

### Task 4: 端到端验证 + 清理

- [ ] **Step 1: 文章页检查**（xorstr 页）
- 正文 term-link 的 href 全部为 `#term-0`/`#term-1`（无外部 URL）
- 页面末尾含 `<hr class="terms-sep">`、`<div class="terms-title">术语表</div>`、`<ol class="terms-ref">` 与 `<li id="term-*">` 且 id 与正文锚点一一对应
- 列表出现在 #post-content 内、footer 之前；toc（如该页有目录）不含「术语表」
- 代码块内无 term-link、无嵌套（回归）

- [ ] **Step 2: 首页摘要回归**：index.html 不含 terms-sep/terms-ref（列表不进摘要）

- [ ] **Step 3: 删除临时测试**：`Remove-Item .temp/test-terms-v2.js`

- [ ] **Step 4: 最终状态**：`git status --short` 确认无遗留（用户未提交改动除外）；如有遗漏提交补充

---

## 自检

- Spec 覆盖：锚点替换 ✓（T1）、列表生成 ✓（T1）、content/more 双路径 ✓（T2）、toc 豁免 ✓（T1 测试 2 + T4 验证）、分隔线 ✓（T3）、样式 ✓（T3）、边界（代码跳过/空词表/URL 转义）✓（T1 测试 3/4）、首页摘要不含列表 ✓（T4）
- 占位符：无；代码完整
- 类型一致：`buildTermsList(termList): string`、`replaceTerms` 锚点行为，Task 1 产出 Task 2 消费一致
