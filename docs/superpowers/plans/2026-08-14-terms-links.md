# 专业术语链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文章正文中的专业术语自动替换为蓝色外部链接，术语表在主题配置中维护。

**Architecture:** 构建时替换——`after_post_render` 过滤器对每篇文章的 content/excerpt（HTML）做纯文本片段替换；核心替换逻辑独立成可单测的纯函数；词表配置于 `terms.list`；`.term-link` 样式全局生效（正文 + 首页摘要）。

**Tech Stack:** Node.js（Hexo 8 主题脚本）、CommonJS、正则（ES2018 lookbehind，Node ≥18 可用）。

## Global Constraints

- 不修改 `package.json` 与任何构建配置（tsc 未安装，本功能不涉及 JS 编译）
- 主题脚本遵循既有惯例：CommonJS、使用 `hexo` 全局、`require('./xxx')` 引用同目录模块（参考 `scripts/generator/search/generator.js`）
- 词表为空（`terms.list` 为空数组/未配置）时不产生任何效果
- 加密文章（front-matter 含 `encrypt` 或 `password`）整体跳过
- 替换必须跳过 `<pre>`、`<code>`、已有 `<a>` 包裹的内容
- URL 来自站点配置（可信），仍转义 `"` 为 `&quot;` 防属性注入
- 英文/数字术语带字母数字边界（`(?<![A-Za-z0-9_-])` / `(?![A-Za-z0-9_-])`），`ESP32` 不得命中 `ESP32-S3`
- 词表按 term 长度降序，长词优先匹配（`ESP32-IDF` 先于 `ESP32`）
- 测试脚本放 `.temp/`（已 gitignore），验证后删除

---

### Task 1: 核心替换函数 terms-core.js + 单元测试

**Files:**
- Create: `themes/arknights/scripts/filters/terms-core.js`
- Create: `.temp/test-terms.js`（临时测试脚本）

**Interfaces:**
- Produces: `module.exports = { replaceTerms(html: string, termList: Array<{term: string, url: string}>): string }`

- [ ] **Step 1: 写失败测试** `.temp/test-terms.js`

```js
'use strict'
const assert = require('assert')
const { replaceTerms } = require('../themes/arknights/scripts/filters/terms-core')

const TERMS = [
  { term: 'ESP32', url: 'https://example.com/esp32' },
  { term: 'ESP32-IDF', url: 'https://example.com/idf' },
  { term: 'XOR', url: 'https://example.com/xor' },
]
const LINK = (term, url) =>
  `<a class="term-link" href="${url}" target="_blank" rel="noopener noreferrer">${term}</a>`

// 1. 普通中文语境替换
assert.strictEqual(
  replaceTerms('使用 ESP32 开发，XOR 加密', TERMS),
  `使用 ${LINK('ESP32', 'https://example.com/esp32')} 开发，${LINK('XOR', 'https://example.com/xor')} 加密`)

// 2. 长词优先：ESP32-IDF 整体匹配，不被 ESP32 部分吞掉
assert.strictEqual(
  replaceTerms('搭建 ESP32-IDF 环境', TERMS),
  `搭建 ${LINK('ESP32-IDF', 'https://example.com/idf')} 环境`)

// 3. 边界：ESP32 不命中 ESP32-S3
assert.strictEqual(replaceTerms('ESP32-S3 芯片', TERMS), 'ESP32-S3 芯片')

// 4. 代码块跳过
assert.strictEqual(
  replaceTerms('<pre>int XOR = 1;</pre> 与 XOR 不同', TERMS),
  `<pre>int XOR = 1;</pre> 与 ${LINK('XOR', 'https://example.com/xor')} 不同`)

// 5. 行内代码跳过
assert.strictEqual(
  replaceTerms('与 <code>ESP32</code> 不同', TERMS),
  '与 <code>ESP32</code> 不同')

// 6. 已有链接内不替换
assert.strictEqual(
  replaceTerms('<a href="/a">XOR 文章</a>', TERMS),
  '<a href="/a">XOR 文章</a>')

// 7. 空词表不生效
assert.strictEqual(replaceTerms('XOR 加密', []), 'XOR 加密')

// 8. 多次出现全部替换
assert.strictEqual(
  (replaceTerms('XOR 与 XOR', TERMS).match(/href="https:\/\/example\.com\/xor"/g) || []).length,
  2)

console.log('terms-core: all tests passed')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node .temp/test-terms.js`
Expected: FAIL，`Cannot find module ... terms-core`

- [ ] **Step 3: 实现 `themes/arknights/scripts/filters/terms-core.js`**

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node .temp/test-terms.js`
Expected: PASS，输出 `terms-core: all tests passed`

- [ ] **Step 5: 提交**

```bash
git add themes/arknights/scripts/filters/terms-core.js
git commit -m "feat(terms): 术语链接核心替换函数与单元测试"
```

---

### Task 2: 过滤器注册 + 配置项

**Files:**
- Create: `themes/arknights/scripts/filters/terms.js`
- Modify: `themes/arknights/_config.yml`（`terms` 默认空配置）
- Modify: `_config.arknights.yml`（站点侧示例词条）

**Interfaces:**
- Consumes: `replaceTerms(html, termList)`（Task 1）
- Produces: `after_post_render` 过滤器（对 `data.content`/`data.excerpt` 生效）；站点配置 `terms.list` 词条格式 `{ term, url }`

- [ ] **Step 1: 实现过滤器 `themes/arknights/scripts/filters/terms.js`**

```js
'use strict'

const { replaceTerms } = require('./terms-core')

hexo.extend.filter.register('after_post_render', function (data) {
  const termList = hexo.theme.config.terms && hexo.theme.config.terms.list
  if (!Array.isArray(termList) || termList.length === 0) return data
  if (data.encrypt || data.password) return data
  data.content = replaceTerms(data.content, termList)
  data.excerpt = replaceTerms(data.excerpt, termList)
  return data
})
```

- [ ] **Step 2: 主题默认配置 `themes/arknights/_config.yml` 追加**

```yaml
# 专业术语链接：正文中的术语自动替换为外部链接；词条在站点 _config.arknights.yml 的 terms.list 中维护
terms:
  list: []
```

- [ ] **Step 3: 站点配置 `_config.arknights.yml` 追加示例词条**

```yaml
terms:
  list:
    - term: "ESP32"
      url: "https://docs.espressif.com/projects/esp-idf/zh_CN/latest/"
    - term: "XOR"
      url: "https://en.wikipedia.org/wiki/XOR_gate"
```

（追加前先读文件确认结构；示例词条供验证与演示，用户可自行增删。）

- [ ] **Step 4: 构建验证**

Run: `npx hexo generate`
Expected: 成功无报错

- [ ] **Step 5: 提交**

```bash
git add themes/arknights/scripts/filters/terms.js themes/arknights/_config.yml _config.arknights.yml
git commit -m "feat(terms): 注册术语链接渲染过滤器并配置示例词条"
```

---

### Task 3: .term-link 样式

**Files:**
- Modify: `themes/arknights/source/css/_core/base.styl`（全局样式，覆盖正文与首页摘要）

- [ ] **Step 1: base.styl 追加 `.term-link`**

```styl
.term-link
  color var(--theme-highlight)
  text-decoration underline
  &:hover
    color var(--theme-text-hover)
```

（实施时先确认 `--theme-highlight` 为蓝色系；若非蓝色则改用显式蓝色 `#2bf` 并注明。）

- [ ] **Step 2: 构建验证**

Run: `npx hexo clean && npx hexo generate`
Expected: 编译后 CSS 含 `.term-link` 规则

- [ ] **Step 3: 提交**

```bash
git add themes/arknights/source/css/_core/base.styl
git commit -m "style(terms): 术语链接蓝色下划线样式"
```

---

### Task 4: 端到端验证

**Files:**
- 无新增文件（只读验证）

- [ ] **Step 1: 检查文章页正文**

选一篇含 `ESP32`/`XOR` 的文章（如 `2026/03/04/esp32-idf-clion`），读生成 HTML：
- 正文中术语已替换为 `<a class="term-link" href=... target="_blank" rel="noopener noreferrer">`
- 代码块（`<pre>`/`<code>` 内）无 `term-link`
- 已有链接文字内无嵌套 `term-link`

Run:
```powershell
$html = [System.IO.File]::ReadAllText('public/2026/03/04/esp32-idf-clion/index.html', [System.Text.Encoding]::UTF8)
"term-link 数量: " + ([regex]::Matches($html, 'class="term-link"')).Count
# 检查 <pre ...>...</pre> 段内不含 term-link（正则提取后验证）
```

- [ ] **Step 2: 检查首页摘要**

读 `public/index.html`：摘要文本中术语已替换为 `term-link`。

- [ ] **Step 3: 删除临时测试脚本**

Run: `Remove-Item .temp/test-terms.js`

- [ ] **Step 4: 最终提交（如有遗留改动）并推送**

```bash
git status --short   # 确认无未提交改动
git push
```

---

## 自检

- Spec 覆盖：配置 ✓（Task 2）、过滤器与跳过逻辑 ✓（Task 1/2）、样式 ✓（Task 3）、边界用例 ✓（Task 1 测试 2/3/4/5/6）、加密文章跳过 ✓（Task 2 Step 1）、空词表不生效 ✓（测试 7）
- 占位符：无 TBD/TODO，代码完整
- 类型一致：`replaceTerms(html, termList)` 签名在 Task 1 产出、Task 2 消费，一致；`terms.list` 词条结构 `{ term, url }` 全计划一致
