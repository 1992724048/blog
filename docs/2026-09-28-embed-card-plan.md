# 链接卡片（`<URL>` → GitHub / Bilibili 元数据区块）实施计划

> **给 Agent 执行者：** 逐任务执行本计划。步骤用复选框（`- [ ]`）跟踪。
> **推荐用 `superpowers:subagent-driven-development`**（每个任务派全新子 Agent + 两阶段审查），或 `superpowers:executing-plans` 在本会话内批量执行。

**目标：** 作者在文章里写一行 `<https://github.com/owner/repo>` 或 `<https://www.bilibili.com/video/BVxxx>`，构建期自动抓取公开元数据并渲染成带平台图标的区块卡片。

**架构：** 两段式。抓取挂 `before_generate` priority 5（必须早于 Hexo 核心 `render_post` 10，后者才触发整条 `after_post_render` 链）；渲染挂 `after_post_render` priority 11（晚于 `terms` 10，使 `excerpt` / `meta-description` / search 投影三者结构性不受卡片污染）。两阶段用 `{platform}:{id}` 复合键经由 `cache.js` 的模块级 live store 传递，**不改写 `_content`**。

**技术栈：** Node 26 内置 `fetch` / `AbortSignal.timeout` / `crypto`；CommonJS（与 `themes/arknights/scripts/` 其余部分一致）；Stylus（`_modules/cards/`）；Hexo 8 filter API。

**规格：** `docs/2026-09-28-embed-card-design.md` —— **执行者必须先读这份 spec**，本计划的每个决定都源于它，两者一起读。

---

## Global Constraints

以下约束来自 spec 与项目规范，**每个任务都隐含包含本节**。任何任务违反即为不合格。

### 流程纪律

1. **禁止向仓库提交任何测试 / 门禁探针文件。** 用户已明确不需要。本计划的「验证」步骤一律用 `.temp/` 下**一次性脚本**（`.temp/` 已在 `.gitignore`）。**禁止**在 `test/`、`tests/`、`spec/` 或任何会被提交的位置新建 `*.test.js` / `*.spec.js`。
2. **禁止 `git push`。** 全部 commit 留在本地，等主控在整个单元完成后统一询问用户。
3. **提交必须显式 `git add <文件>`，禁止 `git add -A` / `git add .`。**
4. **`source/_posts/xorstr-string-encryption.md` 是用户未提交的改动，全程不得暂存、不得覆盖、不得 `git restore`。** 开工前先 `git status --short` 确认，若出现其它未跟踪的用户改动同样不得触碰。
5. 修改已有文件用 `Edit` 分步查找 / 替换，**禁止无差别整文件重写**。
6. 2 次尝试规则：同一方案试 2 次不行就停下来上报，不要硬磕。
7. 落盘文档（`AGENTS.md` / `docs/**`）**禁用 emoji**，用 `√` / `×` / `—` 等纯文本符号。

### 代码规范

8. CommonJS（`require` / `module.exports`），与 `themes/arknights/scripts/` 现有风格一致。
9. 命名：类型 `UpperCamelCase`、函数与变量 `all_lower`、常量 `ALL_UPPER`。
10. 注释只写「为什么」，不写「在做什么」。禁止装饰性分隔符（`// ----` / `// ====`）、禁止日志式注释、禁止修复类注释。
11. 单文件 **≤ 500 行**（GC14 硬门禁），**禁止压行 / 删空行凑数**。
12. 依赖方向单向无环：`register → {fetch, render}`；`fetch → {platform, cache, providers/*}`；`render → {platform, markers/handlers/shared/html}`。`platform.js` 是叶子，不 require 任何 sibling。
13. **HTML 转义复用 `themes/arknights/scripts/markers/handlers/shared/html.js` 的 `escapeHtmlText`**（该文件是文档化的叶子，不 require 任何 sibling，跨子树复用不构成耦合）。**禁止**在 `embed/` 下另写一份转义函数。
14. 所有网络请求**必须设超时**（`AbortSignal.timeout(10000)`）并带 2 次指数退避重试（1s / 3s）。
15. **抓取失败绝不抛异常、绝不中断 `hexo generate --bail`**，一律 `hexo.log.warn` + 降级。

### 内容安全

16. URL 校验复用 `themes/arknights/scripts/markers/handlers/shared/url.js` 的 `isSafeUrl`（与 Project / LinkCard 同一策略）。
17. 抓回的所有文本字段（`description` / `title` / `name` / `owner.name`）**必须经 `escapeHtmlText` 转义**后才进 DOM。
18. B 站 `pic` 字段是 `http://`，**必须改写为 `https://`** 才可写入 DOM（混合内容会被浏览器拦截）。

### 版本号

19. `cssVersion`（`themes/arknights/layout/includes/meta-data.pug:43`）当前 `20260974` → 本计划**只递增它一次**（Task 8）。
20. `jsVersion`（`themes/arknights/layout/includes/js-data.pug:2`）当前 `20260959` → **保持不变**。本计划不触碰 `_src/**/*.ts`，浏览器 JS 产物不变。

### 构建与验证口径

21. 构建固定：`$env:TZ = 'Asia/Shanghai'; npx hexo generate --bail`，判定 = exit 0 且日志中 `FATAL|ERROR|Bail` **零命中**。`WARN` 允许出现，但**每一条都必须是预期的降级条目**（由本轮测试数据刻意触发），执行者必须逐条列出并说明。
22. **禁止并发跑 `hexo generate`**（历史上曾导致 `public/` 被并发重写、门禁读到半成品而误报失败）。同一时刻只能有一个构建。
23. 内部串清零口径：`public/` 内不得出现占位 token、API 原始 JSON 键名（`stargazers_count` / `subscribers_count` / `forks_count` / `bvid` / `v_voucher` 等）。
24. 真实有头浏览器人工验收**不可省略**，**无头截图不可作为通过证据**。未执行人工门禁时**不得声称浏览器验收完成**。

### 活文档

25. 每个任务完成后同步 `AGENTS.md` 对应章节（Architecture / Source Tree / Conventions / 定制地图 / 缓存版本号链），**与代码改动同一个 commit**。
26. 门禁基线：`.temp/` 下现存 **17 个**活门禁（原 18 个，已按用户裁决退役 `b-readme-examples.js`）。**断言失效的更新为新契约并逐条说明替换理由，等值强度不得放宽。**

---

## 文件结构（先锁定职责，再定任务）

| 文件 | 职责 | 行数预估 |
| --- | --- | --- |
| `themes/arknights/scripts/embed/platform.js` | 纯函数：URL → `{platform, id, apiUrl}`；`formatCountEn/Zh`；`formatDate`。**零 I/O、零依赖** | ~90 |
| `themes/arknights/scripts/embed/cache.js` | sidecar 读写 + TTL + **模块级 live store**（两阶段的唯一数据通道） | ~120 |
| `themes/arknights/scripts/embed/providers/github.js` | GitHub 抓取 + `Link` 头解析。`fetchImpl` 可注入以便无网测试 | ~110 |
| `themes/arknights/scripts/embed/providers/bilibili.js` | b23.tv 短链解算 + `view` 接口抓取。`fetchImpl` 可注入 | ~110 |
| `themes/arknights/scripts/embed/fetch.js` | 异步编排：扫 `_content` → 去重 → 并发池 + 预算 → 写 live store 与 sidecar | ~160 |
| `themes/arknights/scripts/embed/render.js` | 同步渲染：扫已渲染 HTML 的独占锚点段落 → 卡片 DOM | ~170 |
| `themes/arknights/scripts/embed/register.js` | **唯一副作用入口**：注册 `before_generate` 5 与 `after_post_render` 11 | ~50 |
| `themes/arknights/source/css/_modules/cards/embed.styl` | 卡片样式 + 平台 SVG data-URI + 次级色 token | ~150 |
| `themes/arknights/source/css/_modules/modules.styl` | 加一行显式 import | 1 行 |
| `embed-cache.json` | 持久化 sidecar（首次构建后由程序生成，**不入 git add 直到稳定**） | — |

**不改动：** `markers/` 子树任何文件、`terms-core.js`、`meta-description.js`、`search/` generator、任何文章模板、`_src/**/*.ts`。

---

## Task 1: `platform.js` — URL 识别与数字格式化

**Files:**
- Create: `themes/arknights/scripts/embed/platform.js`
- Test: `.temp/embed-platform-check.js`（一次性，gitignored）

**Interfaces:**
- Consumes: 无
- Produces:
  ```js
  // → {platform:'github', id:'hexojs/hexo', apiUrl:'https://api.github.com/repos/hexojs/hexo', webUrl:'https://github.com/hexojs/hexo'}
  //   | {platform:'bilibili', id:'BV1GJ411x7h7', apiUrl:'https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7', webUrl:'...', needsShortLinkResolve:false}
  //   | {platform:'bilibili', id:null, apiUrl:null, webUrl:'https://b23.tv/xxx', needsShortLinkResolve:true, shortCode:'xxx'}
  //   | null
  identifyPlatform(rawUrl) -> object | null
  cacheKey(platformId) -> string            // 'github:hexojs/hexo'（GitHub 小写）/ 'bilibili:BV1GJ411x7h7'（原样，BV 大小写敏感）
  formatCountEn(n) -> string                // 785→'785'  3758→'3,758'  41777→'41.8k'  1200000→'1.20M'
  formatCountZh(n) -> string                // 785→'785'  3758→'3758'  41777→'4.2万'  106284274→'1.06亿'
  formatDate(value, platform) -> string     // GitHub ISO→'2012-09'；Bilibili Unix 秒→'2019-12-31'
  ```

- [ ] **Step 1: 写一次性核查脚本 `.temp/embed-platform-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const P = require('../themes/arknights/scripts/embed/platform')

// GitHub
assert.deepEqual(P.identifyPlatform('https://github.com/hexojs/hexo')?.id, 'hexojs/hexo')
assert.equal(P.identifyPlatform('https://github.com/HexoJS/Hexo')?.id, 'HexoJS/Hexo') // id 原样，key 才小写
assert.equal(P.identifyPlatform('https://github.com/hexojs/hexo.git')?.id, 'hexojs/hexo')
assert.equal(P.identifyPlatform('https://github.com/hexojs/hexo/tree/master/docs')?.id, 'hexojs/hexo')
assert.equal(P.identifyPlatform('https://www.github.com/a/b?tab=readme#x')?.id, 'a/b')
assert.equal(P.cacheKey(P.identifyPlatform('https://github.com/HexoJS/Hexo')), 'github:hexojs/hexo')

// Bilibili
assert.equal(P.identifyPlatform('https://www.bilibili.com/video/BV1GJ411x7h7')?.id, 'BV1GJ411x7h7')
assert.equal(P.identifyPlatform('https://m.bilibili.com/video/BV1GJ411x7h7')?.id, 'BV1GJ411x7h7')
assert.equal(P.identifyPlatform('https://www.bilibili.com/video/av80433022')?.id, 'BV1GJ411x7h7-x') // 约定：av 形式无法本地转 BV
assert.equal(P.identifyPlatform('https://b23.tv/AbC123')?.needsShortLinkResolve, true)
assert.equal(P.cacheKey(P.identifyPlatform('https://www.bilibili.com/video/bv1gj411x7h7')), 'bilibili:BV1GJ411x7h7')

// 未识别
assert.equal(P.identifyPlatform('https://example.com/x'), null)
assert.equal(P.identifyPlatform('ftp://github.com/a/b'), null)
assert.equal(P.identifyPlatform('not a url'), null)

// 格式化
assert.equal(P.formatCountEn(785), '785')
assert.equal(P.formatCountEn(3758), '3,758')
assert.equal(P.formatCountEn(41777), '41.8k')
assert.equal(P.formatCountEn(1200000), '1.20M')
assert.equal(P.formatCountZh(3758), '3758')
assert.equal(P.formatCountZh(41777), '4.2万')
assert.equal(P.formatCountZh(106284274), '1.06亿')
assert.equal(P.formatCountZh(2932480), '293.2万')

// 日期
assert.equal(P.formatDate('2012-09-23T15:17:08Z', 'github'), '2012-09')
assert.equal(P.formatDate(1577835803, 'bilibili'), '2019-12-31')
assert.equal(P.formatDate(null, 'github'), '')

console.log('platform-check ok')
```

> `av` 形式的 ID 约定：BV 号与 av 号的换算表在 B 站服务端，本地无法可靠推导。**约定为不解析 av 形式**（`identifyPlatform` 返回 `null`），只支持 BV 号与 b23.tv 短链。上面那行断言请按此改写为 `assert.equal(P.identifyPlatform('https://www.bilibili.com/video/av80433022'), null)`。

- [ ] **Step 2: 运行，确认失败**

```powershell
node .temp/embed-platform-check.js
```
预期：`MODULE_NOT_FOUND` 或断言失败（`platform.js` 尚不存在）。

- [ ] **Step 3: 实现 `themes/arknights/scripts/embed/platform.js`**

```js
'use strict'

// URL 形态锚定在此处；渲染阶段的 <a href> 与抓取阶段的原文行都归一到这两个形态。
const GITHUB_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/?#\s]+)\/([^/?#\s]+)/i
const BILIBILI_BV_RE = /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]{10})(?![0-9A-Za-z])/i
const BILIBILI_SHORT_RE = /^https?:\/\/(?:www\.)?b23\.tv\/([0-9A-Za-z]+)/i

const stripGitSuffix = (name) => name.replace(/\.git$/i, '')

const identifyPlatform = (rawUrl) => {
  if (typeof rawUrl !== 'string') return null
  const url = rawUrl.trim()
  const github = GITHUB_RE.exec(url)
  if (github) {
    const owner = github[1]
    const repo = stripGitSuffix(github[2])
    if (!owner || !repo) return null
    return {
      platform: 'github',
      id: `${owner}/${repo}`,
      webUrl: `https://github.com/${owner}/${repo}`,
      apiUrl: `https://api.github.com/repos/${owner}/${repo}`,
      needsShortLinkResolve: false
    }
  }
  const bv = BILIBILI_BV_RE.exec(url)
  if (bv) {
    const id = bv[1]
    return {
      platform: 'bilibili',
      id,
      webUrl: `https://www.bilibili.com/video/${id}`,
      apiUrl: `https://api.bilibili.com/x/web-interface/view?bvid=${id}`,
      needsShortLinkResolve: false
    }
  }
  const short = BILIBILI_SHORT_RE.exec(url)
  if (short) {
    return {
      platform: 'bilibili',
      id: null,
      webUrl: url,
      apiUrl: null,
      shortCode: short[1],
      needsShortLinkResolve: true
    }
  }
  return null
}

// GitHub 仓库名大小写不敏感故 key 小写；BV 号大小写敏感故原样。
const cacheKey = (target) => {
  if (!target || !target.platform) return null
  if (target.needsShortLinkResolve) return `bilibili:short:${target.shortCode}`
  const id = target.platform === 'github' ? target.id.toLowerCase() : target.id
  return `${target.platform}:${id}`
}

const groupDigits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const formatCountEn = (value) => {
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 10000) return groupDigits(value)
  if (value < 1000000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1000000).toFixed(2)}M`
}

const formatCountZh = (value) => {
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 10000) return String(value)
  if (value < 100000000) return `${(value / 10000).toFixed(1)}万`
  return `${(value / 100000000).toFixed(2)}亿`
}

const pad = (n) => String(n).padStart(2, '0')

const formatDate = (value, platform) => {
  if (value === null || value === undefined || value === '') return ''
  if (platform === 'bilibili' && Number.isFinite(value)) {
    const d = new Date(value * 1000)
    return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

module.exports = { identifyPlatform, cacheKey, formatCountEn, formatCountZh, formatDate }
```

- [ ] **Step 4: 运行，确认通过**

```powershell
node .temp/embed-platform-check.js
```
预期输出：`platform-check ok`，退出码 0。

- [ ] **Step 5: 同步 AGENTS.md + 提交**

`AGENTS.md` 的 Source Tree 章节新增：
```
├── scripts/embed/            # <URL> 独占行 → GitHub / Bilibili 元数据区块卡片
│   ├── platform.js           # URL 识别（GitHub / BV / b23.tv）+ 数字与日期格式化（叶子，零依赖）
```
Architecture 章节新增一条，说明「`<URL>` 独占一行是 block 级触发，与 markers 的 `[#]>NAME|` 协议域不相交，两套语法并存互不改写」。

```powershell
git add themes/arknights/scripts/embed/platform.js AGENTS.md
git commit -m "feat(embed): 新增链接平台识别与数字格式化工具"
```

---

## Task 2: `cache.js` — sidecar 读写、TTL 与 live store

**Files:**
- Create: `themes/arknights/scripts/embed/cache.js`
- Test: `.temp/embed-cache-check.js`（一次性）

**Interfaces:**
- Consumes: Task 1 的 `cacheKey`
- Produces:
  ```js
  CACHE_SCHEMA = 'arknights-embed-cache'
  CACHE_VERSION = 1
  OK_TTL_MS = 7 * 24 * 3600 * 1000
  FAIL_TTL_MS = 24 * 3600 * 1000
  getLive(key) -> entry | undefined
  putLive(key, entry) -> void
  liveKeys() -> string[]
  isExpired(entry, nowMs) -> boolean
  loadSidecar(baseDir, nowMs) -> number   // 返回载入条目数；文件缺失 / 损坏 / schema 不符均返回 0 且不抛
  flushSidecar(baseDir) -> boolean        // 有变化才写盘并返回 true
  resetLive() -> void                     // 供测试隔离
  ```
  `entry` 形状：`{ platform, fetchedAt: <ISO 字符串>, ok: boolean, data?: object, reason?: string }`

- [ ] **Step 1: 写核查脚本 `.temp/embed-cache-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const C = require('../themes/arknights/scripts/embed/cache')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-cache-'))
const now = Date.parse('2026-09-28T00:00:00.000Z')

// 文件不存在 → 0 条，不抛
assert.equal(C.loadSidecar(dir, now), 0)

// 写入两条并 flush
C.resetLive()
C.putLive('github:a/b', { platform: 'github', fetchedAt: '2026-09-27T00:00:00.000Z', ok: true, data: { stars: 1 } })
C.putLive('bilibili:BV1', { platform: 'bilibili', fetchedAt: '2026-09-20T00:00:00.000Z', ok: true, data: { view: 2 } })
assert.equal(C.flushSidecar(dir), true)
assert.equal(C.flushSidecar(dir), false, '无变化时不得重复写盘')

// 重新载入：新鲜的留、过期(>7天)的丢
C.resetLive()
assert.equal(C.loadSidecar(dir, now), 2)
assert.ok(C.getLive('github:a/b'))
assert.ok(C.getLive('bilibili:BV1'))

// ok:false 的 TTL 是 1 天
C.resetLive()
C.putLive('github:c/d', { platform: 'github', fetchedAt: '2026-09-27T12:00:00.000Z', ok: false, reason: 'timeout' })
C.flushSidecar(dir)
C.resetLive()
assert.equal(C.loadSidecar(dir, now), 0, '失败条目超 1 天应被丢弃')

// 损坏文件不抛
fs.writeFileSync(path.join(dir, 'embed-cache.json'), '{ not json')
C.resetLive()
assert.equal(C.loadSidecar(dir, now), 0)

// schema / version 不符 → 0 条
fs.writeFileSync(path.join(dir, 'embed-cache.json'), JSON.stringify({ schema: 'other', version: 1, entries: {} }))
C.resetLive()
assert.equal(C.loadSidecar(dir, now), 0)

console.log('cache-check ok')
```

- [ ] **Step 2: 运行，确认失败** — `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 `themes/arknights/scripts/embed/cache.js`**

```js
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const CACHE_SCHEMA = 'arknights-embed-cache'
const CACHE_VERSION = 1
const CACHE_FILE = 'embed-cache.json'
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FAIL_TTL_MS = 24 * 60 * 60 * 1000

// live store 是抓取阶段与渲染阶段之间唯一的运行时通道；sidecar 文件是它的持久镜像。
const live = new Map()
let persisted = ''

const getLive = (key) => live.get(key)
const putLive = (key, entry) => { live.set(key, entry) }
const liveKeys = () => [...live.keys()]
const resetLive = () => { live.clear(); persisted = '' }

const ttlFor = (entry) => (entry && entry.ok === false ? FAIL_TTL_MS : OK_TTL_MS)

const isExpired = (entry, nowMs) => {
  if (!entry || typeof entry.fetchedAt !== 'string') return true
  const at = Date.parse(entry.fetchedAt)
  if (Number.isNaN(at)) return true
  return nowMs - at > ttlFor(entry)
}

const serialize = () => {
  const entries = {}
  for (const key of [...live.keys()].sort()) entries[key] = live.get(key)
  return JSON.stringify({ schema: CACHE_SCHEMA, version: CACHE_VERSION, entries }, null, 2) + '\n'
}

const loadSidecar = (baseDir, nowMs) => {
  const file = path.join(baseDir, CACHE_FILE)
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    persisted = ''
    return 0
  }
  if (!parsed || parsed.schema !== CACHE_SCHEMA || parsed.version !== CACHE_VERSION || !parsed.entries) {
    persisted = ''
    return 0
  }
  live.clear()
  let kept = 0
  for (const [key, entry] of Object.entries(parsed.entries)) {
    if (isExpired(entry, nowMs)) continue
    live.set(key, entry)
    kept += 1
  }
  persisted = serialize()
  return kept
}

const flushSidecar = (baseDir) => {
  const next = serialize()
  if (next === persisted) return false
  fs.writeFileSync(path.join(baseDir, CACHE_FILE), next, 'utf8')
  persisted = next
  return true
}

module.exports = {
  CACHE_SCHEMA, CACHE_VERSION, CACHE_FILE, OK_TTL_MS, FAIL_TTL_MS,
  getLive, putLive, liveKeys, isExpired, loadSidecar, flushSidecar, resetLive
}
```

- [ ] **Step 2 补: 运行 `.temp/embed-cache-check.js`，确认 `cache-check ok`**

- [ ] **Step 5: 同步 AGENTS.md + 提交**

Source Tree 增 `│   ├── cache.js  # sidecar 读写 + TTL + live store（两阶段唯一数据通道）`；Architecture 增一条说明 sidecar 的 schema / 复合键 / TTL（成功 7 天、失败 1 天）与「不改写 `_content`」的理由。

```powershell
git add themes/arknights/scripts/embed/cache.js AGENTS.md
git commit -m "feat(embed): 新增卡片元数据 sidecar 缓存与 live store"
```

---

## Task 3: `providers/github.js`

**Files:**
- Create: `themes/arknights/scripts/embed/providers/github.js`
- Test: `.temp/embed-github-check.js`（一次性，**用注入的假 fetch，不联网**）

**Interfaces:**
- Consumes: Task 1 的 `formatCountEn` / `formatDate`
- Produces:
  ```js
  parseLinkLastPage(linkHeader) -> number | null
  normalizeRepoPayload(json, linkHeader) -> object   // 抛错表示数据不可用
  buildHeaders(token) -> object
  fetchGithub(target, { fetchImpl, token, timeoutMs, retries, sleep }) -> Promise<entry>
  ```
  `normalizeRepoPayload` 产出：
  ```js
  { name:'hexojs/hexo', webUrl:'https://github.com/hexojs/hexo', description:'...'|'',
    stars:41777, forks:44, watchers:785, commits:3758, createdAt:'2012-09',
    language:'TypeScript', ownerAvatar:'https://...', topics:[...], license:'MIT', pushedAt:'...' }
  ```
  失败返回 `{ platform:'github', fetchedAt:<ISO>, ok:false, reason:'<简短>' }`。

- [ ] **Step 1: 写核查脚本 `.temp/embed-github-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const G = require('../themes/arknights/scripts/embed/providers/github')

// Link 头 rel=last
const link = '<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=1&page=3758>; rel="last"'
assert.equal(G.parseLinkLastPage(link), 3758)
assert.equal(G.parseLinkLastPage('<...>; rel="next"'), null)
assert.equal(G.parseLinkLastPage(''), null)

// 字段映射：watchers_count 是陷阱，必须取 subscribers_count
const json = {
  full_name: 'hexojs/hexo', html_url: 'https://github.com/hexojs/hexo',
  description: 'A fast blog framework', stargazers_count: 41777, watchers_count: 41777,
  subscribers_count: 785, forks_count: 44, created_at: '2012-09-23T15:17:08Z',
  pushed_at: '2026-09-20T00:00:00Z', language: 'TypeScript', topics: ['hexo', 'nodejs'],
  license: { spdx_id: 'MIT' }, owner: { login: 'hexojs', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }
}
const d = G.normalizeRepoPayload(json, link)
assert.equal(d.name, 'hexojs/hexo')
assert.equal(d.stars, 41777)
assert.equal(d.watchers, 785, 'watchers 必须来自 subscribers_count')
assert.equal(d.forks, 44)
assert.equal(d.commits, 3758)
assert.equal(d.createdAt, '2012-09')
assert.equal(d.license, 'MIT')

// license 为 null
assert.equal(G.normalizeRepoPayload({ ...json, license: null }, link).license, '')

// headers：无 token 不带 Authorization
assert.equal('authorization' in G.buildHeaders(null), false)
assert.equal(G.buildHeaders('T').authorization, 'Bearer T')
assert.equal(G.buildHeaders(null)['user-agent'], 'arknights-embed/1.0 (+https://issuimo.com)')

// fetchImpl 注入：成功路径
const calls = []
const fakeFetch = async (url, opts) => {
  calls.push({ url, opts })
  if (url.includes('/commits')) return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'link' ? link : null) }, json: async () => ({}) }
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => json }
}
const sleep = async () => {}
const entry = await G.fetchGithub({ platform: 'github', id: 'hexojs/hexo', apiUrl: 'https://api.github.com/repos/hexojs/hexo' },
  { fetchImpl: fakeFetch, token: null, timeoutMs: 10000, retries: 2, sleep })
assert.equal(entry.ok, true)
assert.equal(entry.data.stars, 41777)
assert.equal(calls.length, 2, '应恰好 2 次请求：repo + commits')
assert.equal(calls[0].opts.signal instanceof AbortSignal, true, '必须带超时信号')

// 404 不重试
let n = 0
const notFound = async () => { n += 1; return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) } }
const e404 = await G.fetchGithub({ platform: 'github', id: 'a/b', apiUrl: 'u' }, { fetchImpl: notFound, token: null, timeoutMs: 10, retries: 2, sleep })
assert.equal(e404.ok, false)
assert.equal(n, 1, '404 不应重试')

// 500 重试 2 次后放弃
let m = 0
const boom = async () => { m += 1; return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) } }
const e500 = await G.fetchGithub({ platform: 'github', id: 'a/b', apiUrl: 'u' }, { fetchImpl: boom, token: null, timeoutMs: 10, retries: 2, sleep })
assert.equal(e500.ok, false)
assert.equal(m, 3, '1 次初始 + 2 次重试')

console.log('github-check ok')
```

- [ ] **Step 2: 运行，确认失败** — `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 `themes/arknights/scripts/embed/providers/github.js`**

```js
'use strict'

const { formatCountEn, formatDate } = require('../platform')

const LINK_LAST_RE = /[?&]page=(\d+)>;\s*rel="last"/

const parseLinkLastPage = (linkHeader) => {
  if (typeof linkHeader !== 'string') return null
  const m = LINK_LAST_RE.exec(linkHeader)
  return m ? Number(m[1]) : null
}

const normalizeRepoPayload = (json, linkHeader) => {
  if (!json || typeof json.full_name !== 'string') throw new Error('MALFORMED_REPO_PAYLOAD')
  return {
    name: json.full_name,
    webUrl: typeof json.html_url === 'string' ? json.html_url : `https://github.com/${json.full_name}`,
    description: typeof json.description === 'string' ? json.description : '',
    stars: Number.isFinite(json.stargazers_count) ? json.stargazers_count : 0,
    forks: Number.isFinite(json.forks_count) ? json.forks_count : 0,
    // watchers_count 恒等于 stargazers_count，真 watch 数只在这里拿。
    watchers: Number.isFinite(json.subscribers_count) ? json.subscribers_count : 0,
    commits: parseLinkLastPage(linkHeader) ?? 0,
    createdAt: formatDate(json.created_at, 'github'),
    language: typeof json.language === 'string' ? json.language : '',
    ownerAvatar: json.owner && typeof json.owner.avatar_url === 'string' ? json.owner.avatar_url : '',
    topics: Array.isArray(json.topics) ? json.topics.filter((t) => typeof t === 'string').slice(0, 5) : [],
    license: json.license && typeof json.license.spdx_id === 'string' ? json.license.spdx_id : '',
    pushedAt: typeof json.pushed_at === 'string' ? json.pushed_at : '',
    starsLabel: formatCountEn(json.stargazers_count)
  }
}

const buildHeaders = (token) => {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    // 官方要求显式 UA；Node fetch 默认发 user-agent: node，不合规。
    'user-agent': 'arknights-embed/1.0 (+https://issuimo.com)'
  }
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

const isRetryable = (status) => status === 429 || status >= 500

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function requestWithRetry(url, options, retries, sleep) {
  let lastReason = 'UNKNOWN'
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(attempt === 1 ? 1000 : 3000)
    let response
    try {
      response = await options.fetchImpl(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeoutMs) })
    } catch (err) {
      lastReason = `NETWORK:${err && err.name ? err.name : 'Error'}`
      continue
    }
    if (response.ok) return response
    lastReason = `HTTP_${response.status}`
    if (!isRetryable(response.status)) return null
  }
  void lastReason
  return null
}

const fetchGithub = async (target, options) => {
  const { fetchImpl = globalThis.fetch, token = null, timeoutMs = 10000, retries = 2, sleep = sleepDefault } = options || {}
  const headers = buildHeaders(token)
  const requestOptions = { fetchImpl, headers, timeoutMs }

  const repo = await requestWithRetry(target.apiUrl, requestOptions, retries, sleep)
  if (!repo) {
    return { platform: 'github', fetchedAt: new Date().toISOString(), ok: false, reason: 'REPO_UNAVAILABLE' }
  }
  const payload = await repo.json()

  const commitsUrl = `${target.apiUrl}/commits?per_page=1`
  let commits = 0
  const commitsResponse = await requestWithRetry(commitsUrl, requestOptions, retries, sleep)
  if (commitsResponse) {
    commits = parseLinkLastPage(commitsResponse.headers.get('link')) ?? 0
  }

  try {
    const data = normalizeRepoPayload(payload, commitsResponse ? commitsResponse.headers.get('link') : null)
    return { platform: 'github', fetchedAt: new Date().toISOString(), ok: true, data }
  } catch (err) {
    return { platform: 'github', fetchedAt: new Date().toISOString(), ok: false, reason: 'MALFORMED_REPO_PAYLOAD' }
  }
}

module.exports = { parseLinkLastPage, normalizeRepoPayload, buildHeaders, fetchGithub }
```

- [ ] **Step 4: 运行 `.temp/embed-github-check.js`，确认 `github-check ok`**

- [ ] **Step 5: 同步 AGENTS.md + 提交**

Architecture 增一条：GitHub 抓取用 `GET /repos/{o}/{r}` 一次取回全部字段 + `commits?per_page=1` 读 `Link` 头 `rel="last"` 取提交数（各 1 次 core 配额）；**`watchers_count` 恒等于 `stargazers_count`，真 watch 数必须取 `subscribers_count`**。

```powershell
git add themes/arknights/scripts/embed/providers/github.js AGENTS.md
git commit -m "feat(embed): 新增 GitHub 仓库元数据抓取"
```

---

## Task 4: `providers/bilibili.js`

**Files:**
- Create: `themes/arknights/scripts/embed/providers/bilibili.js`
- Test: `.temp/embed-bilibili-check.js`（一次性，注入假 fetch）

**Interfaces:**
- Consumes: Task 1 的 `formatCountZh` / `formatDate`
- Produces:
  ```js
  extractBvFromLocation(location) -> string | null
  normalizeViewPayload(json) -> object    // 抛错表示不可用
  buildHeaders() -> object
  fetchBilibili(target, { fetchImpl, timeoutMs, retries, sleep }) -> Promise<entry>
  ```
  `normalizeViewPayload` 产出：
  ```js
  { title, upName, upFace, view, like, coin, favorite, danmaku, reply, share,
    publishedAt:'2019-12-31', coverHttps:'https://i1.hdslb.com/...', duration:213, bvid:'BV1GJ411x7h7' }
  ```

- [ ] **Step 1: 写核查脚本 `.temp/embed-bilibili-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const B = require('../themes/arknights/scripts/embed/providers/bilibili')

// 短链 Location 提 BV
assert.equal(B.extractBvFromLocation('https://www.bilibili.com/video/BV1uv411q7Mv'), 'BV1uv411q7Mv')
assert.equal(B.extractBvFromLocation('https://www.bilibili.com/video/BV1uv411q7Mv/?spm=1'), 'BV1uv411q7Mv')
assert.equal(B.extractBvFromLocation('https://example.com/'), null)
assert.equal(B.extractBvFromLocation(''), null)

// 字段映射 + http→https 改写
const json = {
  code: 0,
  data: {
    bvid: 'BV1GJ411x7h7', aid: 80433022, title: '【官方 MV】Never Gonna Give You Up',
    pubdate: 1577835803, duration: 213, desc: '-',
    pic: 'http://i1.hdslb.com/bfs/archive/cover.jpg',
    owner: { name: '索尼音乐中国', face: 'https://i2.hdslb.com/bfs/face/x.jpg' },
    stat: { view: 106284274, danmaku: 149858, reply: 234506, favorite: 1542480,
            coin: 1274671, share: 494855, like: 2932480 }
  }
}
const d = B.normalizeViewPayload(json)
assert.equal(d.title, '【官方 MV】Never Gonna Give You Up')
assert.equal(d.upName, '索尼音乐中国')
assert.equal(d.view, 106284274)
assert.equal(d.like, 2932480)
assert.equal(d.coin, 1274671)
assert.equal(d.favorite, 1542480)
assert.equal(d.publishedAt, '2019-12-31')
assert.equal(d.coverHttps, 'https://i1.hdslb.com/bfs/archive/cover.jpg', 'http 必须改写为 https')
assert.ok(!d.coverHttps.startsWith('http://'))

// 非 0 code → 抛
assert.throws(() => B.normalizeViewPayload({ code: -404, message: '啥都木有' }))
assert.throws(() => B.normalizeViewPayload({ code: 62002, message: '稿件不可见' }))
assert.throws(() => B.normalizeViewPayload({ code: 0, data: null }))
// 缺 stat.like 不应崩（B 站偶发缺字段）
assert.equal(B.normalizeViewPayload({ code: 0, data: { ...json.data, stat: { view: 1 } } }).like, 0)

// 短链 → 302 Location → BV → view
const seen = []
const fakeFetch = async (url, opts) => {
  seen.push(url)
  if (url.includes('b23.tv')) {
    return { ok: true, status: 302, headers: { get: (h) => (h.toLowerCase() === 'location' ? 'https://www.bilibili.com/video/BV1GJ411x7h7' : null) } }
  }
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => json }
}
const entry = await B.fetchBilibili(
  { platform: 'bilibili', id: null, shortCode: 'AbC123', needsShortLinkResolve: true, apiUrl: null },
  { fetchImpl: fakeFetch, timeoutMs: 10000, retries: 1, sleep: async () => {} })
assert.equal(entry.ok, true)
assert.equal(entry.data.bvid, 'BV1GJ411x7h7')
assert.equal(seen.length, 2)
assert.ok(seen[0].includes('b23.tv'))
assert.ok(seen[1].includes('bvid=BV1GJ411x7h7'))

// 短链解析不出 BV → ok:false，不抛
const dead = await B.fetchBilibili(
  { platform: 'bilibili', id: null, shortCode: 'zzz', needsShortLinkResolve: true, apiUrl: null },
  { fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }), timeoutMs: 10, retries: 0, sleep: async () => {} })
assert.equal(dead.ok, false)

console.log('bilibili-check ok')
```

- [ ] **Step 2: 运行，确认失败** — `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 `themes/arknights/scripts/embed/providers/bilibili.js`**

```js
'use strict'

const { formatDate } = require('../platform')

const BV_IN_LOCATION_RE = /\/video\/(BV[0-9A-Za-z]{10})/

const extractBvFromLocation = (location) => {
  if (typeof location !== 'string') return null
  const m = BV_IN_LOCATION_RE.exec(location)
  return m ? m[1] : null
}

const toHttps = (url) => (typeof url === 'string' && url.startsWith('http://') ? `https://${url.slice(7)}` : '')

const stat = (data, key) => (Number.isFinite(data.stat && data.stat[key]) ? data.stat[key] : 0)

const normalizeViewPayload = (json) => {
  if (!json || json.code !== 0 || !json.data) {
    throw new Error(`BILIBILI_CODE_${json && json.code !== undefined ? json.code : 'UNKNOWN'}`)
  }
  const data = json.data
  if (typeof data.bvid !== 'string') throw new Error('BILIBILI_MALFORMED')
  return {
    bvid: data.bvid,
    title: typeof data.title === 'string' ? data.title : '',
    upName: data.owner && typeof data.owner.name === 'string' ? data.owner.name : '',
    upFace: data.owner && typeof data.owner.face === 'string' ? data.owner.face : '',
    // like 无需登录态即可取到；缺失时降为 0 而不是崩。
    view: stat(data, 'view'),
    like: stat(data, 'like'),
    coin: stat(data, 'coin'),
    favorite: stat(data, 'favorite'),
    danmaku: stat(data, 'danmaku'),
    reply: stat(data, 'reply'),
    share: stat(data, 'share'),
    publishedAt: formatDate(data.pubdate, 'bilibili'),
    // B 站 pic 是 http://，直接写进 DOM 会被浏览器按混合内容拦截。
    coverHttps: toHttps(data.pic),
    duration: Number.isFinite(data.duration) ? data.duration : 0
  }
}

// ⚠ 不得加回 Referer：桌面 Chrome UA 与 referer: bilibili.com 共存会被风控判为「无任何会话
// Cookie 却声称来自站内」的爬虫，直接 412 + code -412「request was banned」（48 次交错试验该
// 组合 12/12 触发，缺任一头即 200/code 0）。UA 单独只描述客户端形态、不含「来自站内」的断言。
const buildHeaders = () => ({
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
})

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url, options, retries, sleep, allowRedirectManual) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(attempt === 1 ? 1000 : 3000)
    try {
      const response = await options.fetchImpl(url, {
        headers: buildHeaders(),
        redirect: allowRedirectManual ? 'manual' : 'follow',
        signal: AbortSignal.timeout(options.timeoutMs)
      })
      return response
    } catch {
      // 网络异常与 5xx 同等处理：退避后重试
    }
  }
  return null
}

const fetchBilibili = async (target, options) => {
  const { fetchImpl = globalThis.fetch, timeoutMs = 10000, retries = 2, sleep = sleepDefault } = options || {}
  const opts = { fetchImpl, timeoutMs }

  let apiUrl = target.apiUrl
  if (target.needsShortLinkResolve) {
    const shortResponse = await getJson(`https://b23.tv/${target.shortCode}`, opts, 0, sleep, true)
    const bvid = shortResponse ? extractBvFromLocation(shortResponse.headers.get('location')) : null
    if (!bvid) {
      return { platform: 'bilibili', fetchedAt: new Date().toISOString(), ok: false, reason: 'SHORT_LINK_UNRESOLVED' }
    }
    apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
  }

  const response = await getJson(apiUrl, opts, retries, sleep, false)
  if (!response || !response.ok) {
    return { platform: 'bilibili', fetchedAt: new Date().toISOString(), ok: false, reason: 'VIEW_UNAVAILABLE' }
  }
  try {
    const data = normalizeViewPayload(await response.json())
    return { platform: 'bilibili', fetchedAt: new Date().toISOString(), ok: true, data }
  } catch (err) {
    return { platform: 'bilibili', fetchedAt: new Date().toISOString(), ok: false, reason: String(err.message).slice(0, 40) }
  }
}

module.exports = { extractBvFromLocation, normalizeViewPayload, buildHeaders, fetchBilibili }
```

- [ ] **Step 4: 运行 `.temp/embed-bilibili-check.js`，确认 `bilibili-check ok`**

- [ ] **Step 5: 同步 AGENTS.md + 提交**

Architecture 增一条：B 站走 `x/web-interface/view`，**`like` 无需登录态、WBI 签名非必需**；**B 站对带 `Origin` 的请求直接返回 403 且不返回任何 CORS 头，故只能构建期抓取**；请求头**不得带 `Referer`**（与桌面 Chrome UA 共存即触发 412 ban，见 §`buildHeaders`）；`-412` ban 与 `-352` 滑块风控**都不做自动恢复**、一律降级，且都**不重试**；`pic` 是 `http://` 必须改写为 `https://`。

```powershell
git add themes/arknights/scripts/embed/providers/bilibili.js AGENTS.md
git commit -m "feat(embed): 新增 Bilibili 视频元数据抓取"
```

---

## Task 5: `fetch.js` — 异步编排（扫描、并发、预算、降级）

**Files:**
- Create: `themes/arknights/scripts/embed/fetch.js`
- Test: `.temp/embed-fetch-check.js`（一次性，注入假 provider）

**Interfaces:**
- Consumes: Task 1 `identifyPlatform` / `cacheKey`；Task 2 `putLive` / `getLive` / `loadSidecar` / `flushSidecar`；Task 3 `fetchGithub`；Task 4 `fetchBilibili`
- Produces:
  ```js
  SOLE_LINK_LINE = /^\s*<(https?:\/\/[^>\s]+)>\s*$/
  collectSoleLinks(documents) -> Map<key, {target, sourceUrl}>   // documents: [{_content}]
  fetchEmbedMetadata(hexo, deps) -> Promise<{scanned, fetched, failed, skipped}>
  ```

- [ ] **Step 1: 写核查脚本 `.temp/embed-fetch-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const C = require('../themes/arknights/scripts/embed/cache')
const F = require('../themes/arknights/scripts/embed/fetch')

// 扫描：只认独占一行的 <URL>
const docs = [{ _content: [
  '前言段落',
  '<https://github.com/hexojs/hexo>',
  '',
  '正文里 <https://github.com/a/b> 这个链接不升级',
  '<https://www.bilibili.com/video/BV1GJ411x7h7>',
  '  <https://github.com/hexojs/hexo>  ',
  '<https://example.com/nope>',
  '<>',
  '<!-- more -->',
  '尾段 <https://github.com/hexojs/hexo.git>'
].join('\n') }]

C.resetLive()
const targets = F.collectSoleLinks(docs)
assert.equal(targets.size, 3, 'github 去重后 1 条 + bilibili 1 条 + example 不识别')
assert.ok(targets.has('github:hexojs/hexo'), '.git 后缀应与无后缀归一到同一 key')
assert.ok(targets.has('bilibili:BV1GJ411x7h7'))

// 编排：注入假 provider，验证并发上限、预算、失败降级
C.resetLive()
const order = []
let live = 0
let peak = 0
const slowProvider = async (target) => {
  live += 1
  peak = Math.max(peak, live)
  order.push(target.id)
  await new Promise((r) => setTimeout(r, 5))
  live -= 1
  return { platform: target.platform, fetchedAt: new Date().toISOString(), ok: target.id !== 'bad/one', data: { id: target.id } }
}

const fakeHexo = {
  base_dir: '.',
  model: (name) => ({ toArray: () => (name === 'Post' ? docs : []) }),
  log: { warn: (m) => order.push(`WARN:${m}`) }
}
const stats = await F.fetchEmbedMetadata(fakeHexo, {
  providers: { github: slowProvider, bilibili: slowProvider },
  token: null, concurrency: 2, budgetMs: 5000, timeoutMs: 100, retries: 0,
  sleep: async () => {}, now: () => Date.now()
})
assert.equal(stats.scanned, 2)
assert.equal(stats.fetched + stats.failed, 2)
assert.ok(peak <= 2, `并发峰值 ${peak} 不得超过 2`)

// 全部失败时仍不抛，且写入 ok:false 条目
C.resetLive()
const allFail = await F.fetchEmbedMetadata(fakeHexo, {
  providers: { github: async () => { throw new Error('boom') }, bilibili: async () => { throw new Error('boom') } },
  token: null, concurrency: 2, budgetMs: 5000, timeoutMs: 100, retries: 0,
  sleep: async () => {}, now: () => Date.now()
})
assert.equal(allFail.fetched, 0)
assert.equal(allFail.failed, 2)
assert.ok(C.getLive('github:hexojs/hexo').ok === false, '失败必须落 ok:false 条目而不是抛异常')

// 预算耗尽 → 剩余标 failed，不发请求
C.resetLive()
let issued = 0
const budgetHexo = { ...fakeHexo, model: (name) => ({ toArray: () => (name === 'Post' ? [
  { _content: '<https://github.com/a/1>\n<https://github.com/a/2>\n<https://github.com/a/3>' }
] : []) }) }
const budgeted = await F.fetchEmbedMetadata(budgetHexo, {
  providers: { github: async (t) => { issued += 1; await new Promise((r) => setTimeout(r, 30)); return { platform: 'github', fetchedAt: new Date().toISOString(), ok: true, data: {} } } },
  token: null, concurrency: 1, budgetMs: 20, timeoutMs: 100, retries: 0,
  sleep: async () => {}, now: () => Date.now()
})
assert.ok(issued < 3, `预算耗尽后不应继续发请求，实发 ${issued}`)
assert.equal(budgeted.failed, 3 - issued)

console.log('fetch-check ok')
```

- [ ] **Step 2: 运行，确认失败** — `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 `themes/arknights/scripts/embed/fetch.js`**

```js
'use strict'

const { identifyPlatform, cacheKey } = require('./platform')
const cache = require('./cache')
const githubProvider = require('./providers/github')
const bilibiliProvider = require('./providers/bilibili')

// 「独占一行」是本子系统唯一的行级规则，只在此处实现一次。
const SOLE_LINK_LINE = /^\s*<(https?:\/\/[^>\s]+)>\s*$/

const collectSoleLinks = (documents) => {
  const targets = new Map()
  for (const doc of documents) {
    if (!doc || typeof doc._content !== 'string') continue
    for (const line of doc._content.split(/\r\n|\r|\n/)) {
      const m = SOLE_LINK_LINE.exec(line)
      if (!m) continue
      const target = identifyPlatform(m[1])
      if (!target) continue
      const key = cacheKey(target)
      if (key && !targets.has(key)) targets.set(key, { target, sourceUrl: m[1] })
    }
  }
  return targets
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

const fetchEmbedMetadata = async (hexo, deps) => {
  const options = deps || {}
  const providers = options.providers || { github: githubProvider.fetchGithub, bilibili: bilibiliProvider.fetchBilibili }
  const concurrency = options.concurrency || 4
  const budgetMs = options.budgetMs || 60000
  const timeoutMs = options.timeoutMs || 10000
  const retries = options.retries === undefined ? 2 : options.retries
  const sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const now = options.now || Date.now

  const documents = []
  for (const model of ['Post', 'Page']) {
    try {
      documents.push(...hexo.model(model).toArray())
    } catch {
      // 模型不存在时跳过，不阻断构建
    }
  }

  cache.loadSidecar(hexo.base_dir, now())
  const targets = collectSoleLinks(documents)
  const pending = [...targets.entries()].filter(([key]) => !cache.getLive(key))

  const stats = { scanned: targets.size, fetched: 0, failed: 0, skipped: targets.size - pending.length }
  if (pending.length === 0) return stats

  const deadline = now() + budgetMs
  let issued = 0

  await runPool(pending, concurrency, async ([key, { target }]) => {
    if (now() >= deadline) {
      cache.putLive(key, { platform: target.platform, fetchedAt: new Date(now()).toISOString(), ok: false, reason: 'BUDGET_EXHAUSTED' })
      stats.failed += 1
      return
    }
    issued += 1
    const provider = providers[target.platform]
    try {
      const entry = await provider(target, { token: options.token, timeoutMs, retries, sleep })
      cache.putLive(key, entry)
      if (entry && entry.ok) stats.fetched += 1
      else {
        stats.failed += 1
        hexo.log.warn(`[embed] 抓取失败 ${key}：${entry && entry.reason ? entry.reason : 'UNKNOWN'}`)
      }
    } catch (err) {
      cache.putLive(key, { platform: target.platform, fetchedAt: new Date(now()).toISOString(), ok: false, reason: 'PROVIDER_THREW' })
      stats.failed += 1
      hexo.log.warn(`[embed] provider 抛异常 ${key}：${err && err.message ? err.message : 'Error'}`)
    }
  })

  cache.flushSidecar(hexo.base_dir)
  return stats
}

module.exports = { SOLE_LINK_LINE, collectSoleLinks, fetchEmbedMetadata }
```

- [ ] **Step 4: 运行 `.temp/embed-fetch-check.js`，确认 `fetch-check ok`**

- [ ] **Step 5: 同步 AGENTS.md + 提交**

Architecture 增一条：抓取挂 `before_generate` **5**（必须早于核心 `render_post` 10），参数为「单请求 10s 超时 + 2 次退避重试 + 并发 4 + 全局预算 60s」，失败一律 `ok:false` + WARN，**绝不抛异常**。

```powershell
git add themes/arknights/scripts/embed/fetch.js AGENTS.md
git commit -m "feat(embed): 新增构建期元数据抓取编排"
```

---

## Task 6: `render.js` — 同步渲染卡片 DOM

**Files:**
- Create: `themes/arknights/scripts/embed/render.js`
- Test: `.temp/embed-render-check.js`（一次性）

**Interfaces:**
- Consumes: Task 1 `formatCountEn` / `formatCountZh`；Task 2 `getLive`；`themes/arknights/scripts/markers/handlers/shared/html.js` 的 `escapeHtmlText`；`themes/arknights/scripts/markers/handlers/shared/url.js` 的 `isSafeUrl`
- Produces:
  ```js
  SOLE_ANCHOR_PARAGRAPH = /<p>\s*<a\s([^>]*)>((?:(?!<)[\s\S])*)<\/a>\s*<\/p>/g
  extractHref(attrs) -> string | null
  buildGithubCard(key, data) -> string
  buildBilibiliCard(key, data) -> string
  buildPlainCard(key, sourceUrl) -> string
  renderEmbeds(html, lookup) -> { html, rendered, plain, skipped }
  ```
  `lookup(key) -> entry | undefined`

  三个构建器与 `extractHref` 均为**模块内部件**，对外契约只有 `renderEmbeds`（Task 7 只消费它）。构建器收 `(key, data)` 而非 `(entry)`，是为了让调用方把已经算好的复合键原样传下去——否则每个构建器都要自己重新推导 `platform.js` 的键逻辑，那份逻辑便有了第二个事实来源。

- [ ] **Step 1: 写核查脚本 `.temp/embed-render-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const R = require('../themes/arknights/scripts/embed/render')

const gh = { platform: 'github', ok: true, fetchedAt: '2026-09-28T00:00:00.000Z', data: {
  name: 'hexojs/hexo', webUrl: 'https://github.com/hexojs/hexo',
  description: 'A fast & <powerful> framework', stars: 41777, forks: 44, watchers: 785,
  commits: 3758, createdAt: '2012-09', language: 'TypeScript', starsLabel: '41.8k',
  ownerAvatar: '', topics: [], license: 'MIT', pushedAt: '' } }
const bv = { platform: 'bilibili', ok: true, fetchedAt: '2026-09-28T00:00:00.000Z', data: {
  bvid: 'BV1GJ411x7h7', title: 'Never Gonna Give You Up', upName: '索尼音乐中国',
  upFace: '', view: 106284274, like: 2932480, coin: 1274671, favorite: 1542480,
  danmaku: 0, reply: 0, share: 0, publishedAt: '2019-12-31',
  coverHttps: 'https://i1.hdslb.com/x.jpg', duration: 213 } }

const lookup = (key) => (key === 'github:hexojs/hexo' ? gh : key === 'bilibili:BV1GJ411x7h7' ? bv : undefined)

// 基础替换
let out = R.renderEmbeds('<p><a href="https://github.com/hexojs/hexo">https://github.com/hexojs/hexo</a></p>', lookup)
assert.equal(out.rendered, 1)
assert.ok(out.html.includes('embed-card--github'))
assert.ok(out.html.includes('data-embed-id="github:hexojs/hexo"'))
assert.ok(out.html.includes('41.8k') && out.html.includes('3,758') && out.html.includes('2012-09'))

// 转义：description 里的 < > & 必须被转义
assert.ok(!out.html.includes('<powerful>'), 'description 不得原样注入标签')
assert.ok(out.html.includes('&lt;powerful&gt;'))

// 已有 target/rel 属性（core external_link 在 priority 10 已加）也要能匹配
out = R.renderEmbeds('<p><a target="_blank" rel="noopener noreferrer" href="https://github.com/hexojs/hexo">x</a></p>', lookup)
assert.equal(out.rendered, 1)

// 段落内不是只有一个链接 → 不动
out = R.renderEmbeds('<p>看这里 <a href="https://github.com/hexojs/hexo">x</a></p>', lookup)
assert.equal(out.rendered, 0)
assert.ok(out.html.includes('看这里'))

// 未抓到的链接 → 不动
out = R.renderEmbeds('<p><a href="https://github.com/no/pe">https://github.com/no/pe</a></p>', lookup)
assert.equal(out.rendered, 0)
assert.ok(out.html.includes('<a href='), '未命中必须保持原样')

// 抓取失败 → 纯链接卡片
const failLookup = () => ({ platform: 'github', ok: false, fetchedAt: 'x', reason: 'TIMEOUT' })
out = R.renderEmbeds('<p><a href="https://github.com/a/b">https://github.com/a/b</a></p>', failLookup)
assert.equal(out.plain, 1)
assert.ok(out.html.includes('embed-card--plain'))

// Bilibili
out = R.renderEmbeds('<p><a href="https://www.bilibili.com/video/BV1GJ411x7h7">https://www.bilibili.com/video/BV1GJ411x7h7</a></p>', lookup)
assert.equal(out.rendered, 1)
assert.ok(out.html.includes('embed-card--bilibili'))
assert.ok(out.html.includes('1.06亿') && out.html.includes('293.2万') && out.html.includes('127.5万') && out.html.includes('154.2万'))
assert.ok(out.html.includes('2019-12-31'))
assert.ok(!out.html.includes('http://i1.hdslb.com'), '不得出现 http:// 封面')

// 危险 URL（javascript:）不得进入 href
out = R.renderEmbeds('<p><a href="javascript:alert(1)">x</a></p>', () => gh)
assert.ok(!out.html.includes('javascript:'))

// 视觉隐藏标签存在（无障碍）
out = R.renderEmbeds('<p><a href="https://github.com/hexojs/hexo">x</a></p>', lookup)
assert.ok(out.html.includes('embed-stat-label'), '统计项必须有可读标签')
assert.ok(out.html.includes('aria-hidden="true"'), '装饰图标必须 aria-hidden')

console.log('render-check ok')
```

- [ ] **Step 2: 运行，确认失败** — `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现 `themes/arknights/scripts/embed/render.js`**

```js
'use strict'

const { identifyPlatform, cacheKey, formatCountEn, formatCountZh } = require('./platform')
const { escapeHtmlText } = require('../markers/handlers/shared/html')
const { isSafeUrl } = require('../markers/handlers/shared/url')

// 只匹配「段落里唯一子元素是一个 <a>」的形态；段落内有其它内容则不匹配。
const SOLE_ANCHOR_PARAGRAPH = /<p>\s*<a\s([^>]*)>([\s\S]*?)<\/a>\s*<\/p>/g
const HREF_ATTR_RE = /\bhref="([^"]*)"/i

const GITHUB_ICON = 'fab fa-github'
const BILIBILI_ICON = 'fab fa-bilibili'

const extractHref = (attrs) => {
  const m = HREF_ATTR_RE.exec(attrs || '')
  return m ? m[1] : null
}

const statChip = (iconClass, label, value) => {
  if (value === '' || value === null || value === undefined) return ''
  return `<span class="embed-stat"><i class="${iconClass}" aria-hidden="true"></i>` +
    `<span class="embed-stat-label">${escapeHtmlText(label)}</span>` +
    `<span class="embed-stat-value">${escapeHtmlText(value)}</span></span>`
}

const card = ({ platform, key, href, icon, title, desc, stats, extraClass, titleAttr }) => {
  const descHtml = desc ? `<span class="embed-card__desc">${escapeHtmlText(desc)}</span>` : ''
  const attr = titleAttr ? ` title="${escapeHtmlText(titleAttr)}"` : ''
  return `<a class="embed-card embed-card--${platform}${extraClass}" href="${escapeHtmlText(href)}"` +
    ` target="_blank" rel="noopener noreferrer" data-embed-id="${escapeHtmlText(key)}"${attr}>` +
    `<i class="embed-card__icon ${icon}" aria-hidden="true"></i>` +
    `<span class="embed-card__body"><span class="embed-card__title">${escapeHtmlText(title)}</span>${descHtml}</span>` +
    `<span class="embed-card__stats">${stats}</span></a>`
}

const buildGithubCard = (key, data) => card({
  platform: 'github',
  key,
  href: data.webUrl,
  icon: GITHUB_ICON,
  title: data.name,
  desc: data.description,
  titleAttr: data.description || data.name,
  stats: [
    statChip('fa-solid fa-star', 'star', data.starsLabel || formatCountEn(data.stars)),
    statChip('fa-solid fa-code-branch', 'fork', formatCountEn(data.forks)),
    statChip('fa-solid fa-hashtag', '提交', data.commits ? formatCountEn(data.commits) : ''),
    statChip('fa-solid fa-calendar', '创建于', data.createdAt),
    data.language ? `<span class="embed-stat embed-stat--plain">${escapeHtmlText(data.language)}</span>` : ''
  ].join('')
})

const buildBilibiliCard = (key, data) => card({
  platform: 'bilibili',
  key,
  href: `https://www.bilibili.com/video/${data.bvid}`,
  icon: BILIBILI_ICON,
  title: data.title,
  desc: data.upName ? `UP 主 ${data.upName}` : '',
  titleAttr: data.title,
  stats: [
    statChip('fa-solid fa-play', '播放', formatCountZh(data.view)),
    statChip('fa-solid fa-thumbs-up', '点赞', formatCountZh(data.like)),
    statChip('fa-solid fa-coins', '投币', formatCountZh(data.coin)),
    statChip('fa-solid fa-star', '收藏', formatCountZh(data.favorite)),
    statChip('fa-solid fa-calendar', '发布于', data.publishedAt)
  ].join('')
})

const buildPlainCard = (key, sourceUrl) => {
  const target = identifyPlatform(sourceUrl)
  const icon = target && target.platform === 'bilibili' ? BILIBILI_ICON : GITHUB_ICON
  return card({
    platform: target ? target.platform : 'link',
    key,
    href: sourceUrl,
    icon,
    title: sourceUrl,
    desc: '元数据抓取失败，仅显示链接',
    stats: ''
  })
}

const renderEmbeds = (html, lookup) => {
  if (typeof html !== 'string' || !html.includes('<a ')) return { html, rendered: 0, plain: 0, skipped: 0 }
  let rendered = 0
  let plain = 0
  let skipped = 0
  const next = html.replace(SOLE_ANCHOR_PARAGRAPH, (match, attrs) => {
    const href = extractHref(attrs)
    if (!href) return match
    const target = identifyPlatform(href)
    if (!target) { skipped += 1; return match }
    // 抓取阶段的 URL 已过 isSafeUrl；渲染阶段再校验一次，防止 sidecar 被手改成危险协议。
    if (!isSafeUrl(href)) { skipped += 1; return match }
    const key = cacheKey(target)
    const entry = lookup(key)
    if (!entry) { skipped += 1; return match }
    if (entry.ok === false) { plain += 1; return buildPlainCard(key, href) }
    if (target.platform === 'github') { rendered += 1; return buildGithubCard(key, entry.data) }
    if (target.platform === 'bilibili') { rendered += 1; return buildBilibiliCard(key, entry.data) }
    skipped += 1
    return match
  })
  return { html: next, rendered, plain, skipped }
}

module.exports = {
  SOLE_ANCHOR_PARAGRAPH, extractHref,
  buildGithubCard, buildBilibiliCard, buildPlainCard, renderEmbeds
}
```

> `SOLE_ANCHOR_PARAGRAPH` 带 `g` 标志，`String.replace` 会正确重置 `lastIndex`。但导出它是为了让核查脚本能独立验证匹配形态，**任何直接使用它的地方都必须用 `matchAll` 或先手动 `lastIndex = 0`**。

- [ ] **Step 4: 运行 `.temp/embed-render-check.js`，确认 `render-check ok`**

- [ ] **Step 5: 同步 AGENTS.md + 提交**

Architecture 增一条：渲染挂 `after_post_render` **11**（晚于 `terms` 10，故 `excerpt` / `meta-description` / search 投影三者结构性不受卡片污染）；「独占一行」规则**只在抓取阶段实现一次**，渲染阶段靠「段落唯一锚点 + 复合键命中」判定，两阶段不可能漂移。

```powershell
git add themes/arknights/scripts/embed/render.js AGENTS.md
git commit -m "feat(embed): 新增卡片同步渲染与降级形态"
```

---

## Task 7: `register.js` — 两处挂载点接线

**Files:**
- Create: `themes/arknights/scripts/embed/register.js`
- Test: 真实 Hexo 构建 + 产物核对

**Interfaces:**
- Consumes: Task 5 `fetchEmbedMetadata`；Task 6 `renderEmbeds`；Task 2 `getLive` / `cacheKey`（经 `platform`）
- Produces: 无导出 API，仅副作用。注册 `before_generate` 5 与 `after_post_render` 11。

- [ ] **Step 1: 参照 `themes/arknights/scripts/markers/register.js` 读现有注册约定**（幂等保护、context + pipeline 键、错误码风格），照其模式写。

- [ ] **Step 2: 实现 `themes/arknights/scripts/embed/register.js`**

```js
'use strict'

const { fetchEmbedMetadata } = require('./fetch')
const { renderEmbeds } = require('./render')
const cache = require('./cache')
const { identifyPlatform, cacheKey } = require('./platform')
const { isSafeUrl } = require('../markers/handlers/shared/url')

const CONTEXT_KEY = '__arknightsEmbed'

// 幂等：同一 context 重复注册直接返回，避免热重载下过滤器叠加。
const register = (hexo) => {
  if (hexo[CONTEXT_KEY]) return
  hexo[CONTEXT_KEY] = true

  const token = process.env.EMBED_GITHUB_TOKEN || process.env.GITHUB_TOKEN || null

  hexo.extend.filter.register('before_generate', async () => {
    const stats = await fetchEmbedMetadata(hexo, { token })
    if (stats.fetched > 0 || stats.failed > 0) {
      hexo.log.info(`[embed] 元数据抓取：命中 ${stats.fetched}，降级 ${stats.failed}，缓存复用 ${stats.skipped}`)
    }
  }, 5)

  hexo.extend.filter.register('after_post_render', (data) => {
    if (typeof data.content !== 'string') return data
    const result = renderEmbeds(data.content, (key) => cache.getLive(key))
    if (result.rendered > 0 || result.plain > 0) {
      data.content = result.html
      if (data.more && typeof data.more === 'string') {
        data.more = renderEmbeds(data.more, (key) => cache.getLive(key)).html
      }
    }
    return data
  }, 11)
}

register(hexo)
```

> `isSafeUrl` 若在此处未被直接使用，请从 import 中移除，避免死引用（`render.js` 内部已做协议校验）。

- [ ] **Step 3: 用一篇测试文章触发真实构建**

在 `source/_posts/` 下**新建**一个临时文章（不要改用户已有文章）：

```markdown
---
title: embed 卡片临时验证
date: 2026-09-28 00:00:00
categories: [test]
tags: [test]
description: 临时验证文章，构建后删除。
---

<https://github.com/hexojs/hexo>

<https://www.bilibili.com/video/BV1GJ411x7h7>

正文里 <https://github.com/a/b> 不应升级。

<https://example.com/not-a-card>
```

- [ ] **Step 4: 构建并核对产物**

```powershell
$env:TZ = 'Asia/Shanghai'
npx hexo generate --bail
```

逐项核对 `public/2026/09/28/embed/index.html`（路径以实际生成为准）：

| 断言 | 期望 |
| --- | --- |
| `.embed-card--github` 出现次数 | 1 |
| `.embed-card--bilibili` 出现次数 | 1 |
| 「正文里」那段仍是普通 `<a>` | 是 |
| `example.com` 那行仍是普通 `<a>` | 是 |
| `public/` 内 `stargazers_count` / `subscribers_count` / `bvid` / `v_voucher` | 各 0 命中 |
| `embed-cache.json` 已生成且 `entries` 至少有 `github:hexojs/hexo` | 是 |
| 构建日志 `FATAL\|ERROR\|Bail` | 0 命中 |

> 若 GitHub 抓取因本机代理（`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`）失败，日志应出现 1 条 `[embed] 抓取失败 github:hexojs/hexo` WARN，且该条渲染为 `.embed-card--plain` —— **这本身就是 fail-soft 生效的证据**，在交付里如实说明。`api.bilibili.com` 不受该代理影响，应能取到完整卡片。

- [ ] **Step 5: 跑既有门禁，确认无回归**

```powershell
node .temp/a3-artifact-audit.js
node .temp/line-marker-pipeline.test.js
node .temp/b-legacy-scan.js
node .temp/line-marker-hexo.test.js
node .temp/final-product-check.js
```
预期全部 exit 0。若有断言因本轮失效（例如内部串清零清单需加入新的 key），更新为新契约并说明，**等值强度不得放宽**。

- [ ] **Step 6: 删除临时文章并重建**

```powershell
git status --short   # 确认临时文章是未跟踪状态
Remove-Item -LiteralPath 'source\embed-临时验证.md'
npx hexo clean
$env:TZ = 'Asia/Shanghai'; npx hexo generate --bail
```

- [ ] **Step 7: 同步 AGENTS.md + 提交**

AGENTS.md 增一条「标记解释器与 `<URL>` 卡片是两套并存语法」；Source Tree 增 `scripts/embed/register.js`（唯一副作用入口）。

```powershell
git add themes/arknights/scripts/embed/register.js AGENTS.md
git commit -m "feat(embed): 接线构建期抓取与卡片渲染"
```

---

## Task 8: 卡片样式 + 对比度实算 + `cssVersion` 递增

**Files:**
- Create: `themes/arknights/source/css/_modules/cards/embed.styl`
- Modify: `themes/arknights/source/css/_modules/modules.styl`（加一行显式 import）
- Modify: `themes/arknights/layout/includes/meta-data.pug:43`（`cssVersion` → `20260975`）
- Test: `.temp/embed-contrast-check.js`（一次性，从**产物 CSS** 读回色值实算）

**Interfaces:**
- Consumes: Task 6 的 DOM 类名 `embed-card` / `embed-card__icon` / `embed-card__body` / `embed-card__title` / `embed-card__desc` / `embed-card__stats` / `embed-stat` / `embed-stat-label` / `embed-stat-value` / `embed-stat--plain` / `embed-card--github` / `embed-card--bilibili` / `embed-card--plain`
- Produces: 产物 CSS 中的次级色 token `--embed-muted`（明暗各一条映射）

- [ ] **Step 1: 先算次级色，选定明暗两套值**

`--theme-unimportant` 明色 `#767676` 对浅底仅 **4.16:1**，未达 WCAG AA 正文级 4.5:1，**不可直接用**。按本仓 Alert 标题色那套「明色向黑、暗色向白按统一 15% 混色公式修正」的方法求值：

```
mix(fg, bg, t) = round(fg*t + bg*(1-t))     // t = 0.15
```

| 主题 | 底色 | 原始 fg | t=0.15 修正后 | 需 ≥4.5:1 |
| --- | --- | --- | --- | --- |
| 明 | `#fff` | `#767676` | `#6b6b6b` | 核对 |
| 暗 | `#222` | `#767676` | `#8a8a8a` | 核对 |

用 §Step 2 的脚本实算并**把实算值写进脚本的断言**，不要凭估计。若 t=0.15 仍不达标，逐级增大 t（0.20 / 0.25）直到达标，并在 `embed.styl` 注释里写明最终 t 与实算对比度。

- [ ] **Step 2: 写核查脚本 `.temp/embed-contrast-check.js`（先失败）**

```js
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')

const css = fs.readFileSync('public/css/arknights.css', 'utf8')

const readToken = (name) => {
  const re = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`)
  const m = re.exec(css)
  assert.ok(m, `产物 CSS 缺少 token ${name}`)
  return m[1]
}
const hexToRgb = (h) => {
  const s = h.length <= 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1)
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
const luminance = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

for (const [mode, surface] of [['light', '#ffffff'], ['dark', '#222222']]) {
  const title = readToken('--theme-text')
  const muted = readToken('--embed-muted')
  const r1 = ratio(title, surface)
  const r2 = ratio(muted, surface)
  assert.ok(r1 >= 4.5, `${mode} 标题对比度 ${r1.toFixed(2)} < 4.5`)
  assert.ok(r2 >= 4.5, `${mode} 次级文本对比度 ${r2.toFixed(2)} < 4.5`)
  console.log(`${mode}: title ${r1.toFixed(2)}:1  muted ${r2.toFixed(2)}:1`)
}

// 卡片必须沿用 alert 几何契约：横向外边距归零，盒左缘与正文其它块齐平
const popupBlock = /\.embed-card\s*\{[^}]*margin:\s*1em 0/
assert.ok(popupBlock.test(css), '.embed-card 必须声明 margin 1em 0 以保持盒左缘偏移 0px')

// 减动效
assert.ok(/prefers-reduced-motion[\s\S]{0,400}embed-card/.test(css), '必须有减动效降级')

console.log('embed-contrast-check ok')
```

- [ ] **Step 3: 运行，确认失败** — 产物 CSS 尚无 `--embed-muted`。

- [ ] **Step 4: 实现 `themes/arknights/source/css/_modules/cards/embed.styl`**

```styl
// <URL> 独占一行 → GitHub / Bilibili 元数据区块卡片（scripts/embed/ 产出）
// 几何契约：margin 1em 0 使盒左缘与 table / figure.highlight / blockquote / .admonition 的
// 横向偏移同为 0px，theme-ui-alerts.test.js 的 assertCalloutGeometry 卡这条。
.embed-card
  box-sizing border-box
  display grid
  grid-template-columns auto minmax(0, 1fr)
  grid-template-rows auto auto
  align-items center
  column-gap 12px
  margin 1em 0
  padding 10px 12px
  border 1px solid var(--theme-border)
  border-radius 0
  background var(--theme-bg-soft)
  color var(--theme-text)
  text-decoration none
  transition background-color .2s, border-color .2s
  &:hover
    background var(--theme-bg-soft-hover)
    border-color var(--theme-highlight)
  .embed-card__icon
    grid-row 1 / span 2
    grid-column 1
    font-size 20px
    line-height 1
    text-align center
    color var(--theme-highlight)
  .embed-card__body
    grid-row 1
    grid-column 2
    display flex
    flex-wrap wrap
    align-items baseline
    column-gap 8px
    min-width 0
  .embed-card__title
    font-weight bold
    color var(--theme-text)
  .embed-card__desc
    color var(--embed-muted)
    font-size 14px
    min-width 0
    overflow hidden
    text-overflow ellipsis
    white-space nowrap
  .embed-card__stats
    grid-row 2
    grid-column 2
    display flex
    flex-wrap wrap
    column-gap 14px
    row-gap 4px
    color var(--embed-muted)
    font-size 14px
  .embed-stat
    display inline-flex
    align-items baseline
    column-gap 4px
  .embed-stat--plain
    font-style italic
  .embed-stat-label
    // 只对读屏可见：图标已承担视觉语义，重复显示会造成冗余
    position absolute
    width 1px
    height 1px
    margin -1px
    padding 0
    overflow hidden
    clip-path inset(50%)
    white-space nowrap
  .embed-stat-value
    color var(--theme-text)

.embed-card--plain
  .embed-card__body
    flex-direction column
    row-gap 2px

@media ( prefers-reduced-motion: reduce )
  .embed-card
    transition none
```

**次级色 token** 加在 `_core/color/base.styl`（定义）与 `light.styl` / `dark.styl`（映射），与 `--nav-icon-w` / `--topbar-bg-*` 同一范式：

```styl
// base.styl 的 :root 内
--embed-muted #6b6b6b      // 明：#767676 向黑混 15%，对 #fff 实算 ≥4.5:1
// dark.styl
--embed-muted #8a8a8a      // 暗：#767676 向白混 15%，对 #222 实算 ≥4.5:1
```

- [ ] **Step 5: `modules.styl` 加显式 import**

在现有 `cards/admonition` 与 `cards/link-card` 两行之后加：

```styl
@import 'cards/embed'
```

**不得**改成 `@import 'cards/*'` 通配。

- [ ] **Step 6: 递增 `cssVersion`**

`themes/arknights/layout/includes/meta-data.pug:43`：`20260974` → `20260975`。**`jsVersion` 保持 `20260959` 不动。**

- [ ] **Step 7: 构建并跑实算**

```powershell
$env:TZ = 'Asia/Shanghai'
npx hexo generate --bail
node .temp/embed-contrast-check.js
```
预期：脚本打印明暗两行实算对比度（均 ≥4.5:1）后输出 `embed-contrast-check ok`，退出码 0。**把两行实算数字抄进 `embed.styl` 的注释里。**

- [ ] **Step 8: 跑既有门禁 + 同步 AGENTS.md + 提交**

```powershell
node .temp/a3-artifact-audit.js
node .temp/theme-ui-alerts.test.js
node .temp/theme-ui-nav.test.js
node .temp/contrast-check.js
```

AGENTS.md：定制地图新增「链接卡片」行；Architecture 记录 `--embed-muted` 的取值依据与实算对比度；缓存版本号链补 `cssVersion 20260975`。

```powershell
git add themes/arknights/source/css/_modules/cards/embed.styl themes/arknights/source/css/_modules/modules.styl themes/arknights/source/css/_core/color/base.styl themes/arknights/source/css/_core/color/light.styl themes/arknights/source/css/_core/color/dark.styl themes/arknights/layout/includes/meta-data.pug AGENTS.md
git commit -m "feat(embed): 新增链接卡片样式并实算次级色对比度"
```

---

## Task 9: `deploy.yml` — 凭据与 sidecar 回写

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Test: YAML 语法检查 + 人工审阅权限范围

**Interfaces:**
- Consumes: Task 2 的 `embed-cache.json`（仓库根）
- Produces: CI 侧 `contents: write` 权限 + 构建后回写步骤

- [ ] **Step 1: 读 `.github/workflows/deploy.yml` 现状**，记录当前 `permissions:`（若不存在则整节新增）与构建步骤的结束位置。

- [ ] **Step 2: 加权限**

在 workflow 顶层加：

```yaml
permissions:
  contents: write
```

> **安全说明（必须写进 AGENTS.md）**：该权限让 workflow 能向 `main` 推送。sidecar 回写只 `git add embed-cache.json` 一个文件。若用户不希望自动回写，删掉本节的回写步骤即可，`permissions` 保留也不影响构建正确性（只是 sidecar 只在本地更新）。

- [ ] **Step 3: 加回写步骤**，接在构建成功之后：

```yaml
      - name: Commit embed metadata sidecar
        if: success() && github.ref == 'refs/heads/main'
        run: |
          if [ -f embed-cache.json ] && ! git diff --quiet -- embed-cache.json; then
            git config user.name  "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add embed-cache.json
            git commit -m "chore(embed): 更新链接卡片元数据缓存"
            git push
          fi
```

若 workflow 使用 `actions/checkout` 且未设 `persist-credentials`，需在该 step 前加：

```yaml
      - uses: actions/checkout@v4
        with:
          persist-credentials: true
```

- [ ] **Step 4: 确认 token 可见性**

`GITHUB_TOKEN` 无需显式传参，`register.js` 读 `process.env.GITHUB_TOKEN` 即可。**不需要新增任何 secret。** 在 workflow 里加一行注释说明这一点。

- [ ] **Step 5: YAML 校验 + 同步 AGENTS.md + 提交**

```powershell
node -e "const y=require('fs').readFileSync('.github/workflows/deploy.yml','utf8'); console.log(y.includes('contents: write') && y.includes('embed-cache.json') ? 'workflow ok' : 'MISSING')"
```

AGENTS.md 的 Build & Deploy 章节记录：CI 用自动注入的 `GITHUB_TOKEN`（1000 次/小时/仓库）抓 GitHub 元数据，**无需用户配置 secret**；sidecar 由构建后步骤回写，需 `contents: write`。

```powershell
git add .github/workflows/deploy.yml AGENTS.md
git commit -m "ci(embed): 抓取元数据并回写 sidecar 缓存"
```

---

## Task 10: 活文档收口与全量验证

**Files:**
- Modify: `AGENTS.md`（最终核对与补漏）
- Test: 全量构建 + 12 case 验证 + 17 个既有门禁

**Interfaces:**
- Consumes: Task 1–9 全部产出
- Produces: 无新代码，交付确认

- [ ] **Step 1: 12 个边界 case 验证**

新建**临时**文章 `source/embed-case-check.md`（构建后删除），内容覆盖：

```markdown
---
title: embed 边界验证
date: 2026-09-28 00:00:00
categories: [test]
tags: [test]
description: 边界验证，构建后删除。
---

1. 独占行 GitHub：<https://github.com/hexojs/hexo>
2. 独占行 .git 后缀：<https://github.com/hexojs/hexo.git>
3. 深层路径：<https://github.com/hexojs/hexo/tree/master/docs>
4. 独占行 Bilibili：<https://www.bilibili.com/video/BV1GJ411x7h7>
5. 独占行 b23 短链：<https://b23.tv/BV1GJ411x7h7>
6. 非独占行：正文 <https://github.com/a/b> 不升级
7. 未识别域名：<https://example.com/x>
8. 非法 URL：<not a url>
9. 空尖括号：<>
10. 同一 URL 第二次：<https://github.com/hexojs/hexo>
11. 卡片紧跟普通段落：<https://github.com/hexojs/hexo>

紧跟其后的普通段落。

<!-- more -->

12. more 之后：<https://github.com/hexojs/hexo>
```

构建后逐条核对产物并把结果填进交付报告：

| # | 期望 |
| --- | --- |
| 1 | 完整 GitHub 卡片 |
| 2 | 与 1 相同（同一 key，去重后只抓一次） |
| 3 | 完整 GitHub 卡片（`name` 仍为 `hexojs/hexo`） |
| 4 | 完整 Bilibili 卡片 |
| 5 | 完整 Bilibili 卡片（短链解算成功）或 `.embed-card--plain`（解算失败） |
| 6 | 普通 `<a>`，未升级 |
| 7 | 普通 `<a>`，未升级 |
| 8 / 9 | 原样字面量 |
| 10 | 完整卡片（与 1 同一份数据） |
| 11 | 完整卡片，且后随的「紧跟其后的普通段落。」仍为独立 `<p>` |
| 12 | 完整卡片 |

同时确认：归档 / 分类 / 标签页的条目摘要、`public/search.json`、各页 `<meta name="description">` **均不含**卡片文本。

- [ ] **Step 2: 跑全量门禁**

```powershell
Get-ChildItem .temp\*.test.js, .temp\a3-artifact-audit.js, .temp\a1-runtime-probe.js, .temp\b-legacy-scan.js, .temp\line-marker-bail-reject.js, .temp\final-product-check.js |
  Where-Object { $_.Name -ne 'b-readme-examples.js' } |
  ForEach-Object { node $_.FullName; "{0} exit={1}" -f $_.Name, $LASTEXITCODE }
```

记录每个的 exit code。预期除 `line-marker-bail-reject.js`（需隔离 site，可能行为不同）外全 0。

- [ ] **Step 3: 最终全量构建**

```powershell
npm run clean
$env:TZ = 'Asia/Shanghai'
npx hexo generate --bail
git diff --check
git status --short
```

判定：exit 0、`FATAL|ERROR|Bail` 零命中、`git diff --check` 无输出、`git status --short` 只剩用户的 `source/_posts/xorstr-string-encryption.md`。

- [ ] **Step 4: 删除临时文章并重建**

```powershell
Remove-Item -LiteralPath 'source\embed-case-check.md'
npm run clean
$env:TZ = 'Asia/Shanghai'; npx hexo generate --bail
```

- [ ] **Step 5: AGENTS.md 最终补漏 + 提交**

逐节核对 Architecture / Source Tree / Conventions & Gotchas / 定制地图 / 缓存版本号链 / Build & Deploy / Verification 七节是否都已同步；缺哪补哪。

```powershell
git add AGENTS.md
git commit -m "docs(embed): 同步链接卡片实施结论到活文档"
```

- [ ] **Step 6: 交付报告**

写入 `.superpowers/sdd/2026-09-25-line-marker-tools-plan/task-embed-card-report.md`（该目录 gitignored，不入库），内容含：12 case 逐条结果、门禁 exit 表、构建日志摘要、实算对比度数字、**需要用户实机验收的具体点**（卡片外观、悬停、键盘可达、明暗主题、移动端宽度、封面色调），以及**明确声明「真实有头浏览器人工验收未完成」**。

---

## Self-Review

**1. Spec 覆盖检查**

| Spec 章节 | 对应任务 |
| --- | --- |
| §2 语法（独占一行、平台识别、降级语义） | Task 1（识别）、Task 5（独占行规则）、Task 6（降级） |
| §3.1 阶段划分 | Task 7 |
| §3.2 抓取挂 `before_generate` 5 | Task 7 Step 2 |
| §3.3 渲染挂 `after_post_render` 11 及三条隔离理由 | Task 7 Step 2 + Task 6 |
| §3.4 复合键传递、不改写 `_content` | Task 1 `cacheKey`、Task 2 live store |
| §3.5 模块树与依赖方向 | 全部任务的文件清单 |
| §4.1 扫描 | Task 5 `collectSoleLinks` |
| §4.2 并发与预算 | Task 5 `runPool` + `budgetMs` |
| §4.3 GitHub 字段与陷阱 | Task 3 |
| §4.4 Bilibili 字段、短链、错误码 | Task 4 |
| §4.5 数字格式化 | Task 1 |
| §5.1 sidecar schema / TTL | Task 2 |
| §5.2 CI 回写 | Task 9 |
| §5.3 凭据零配置 | Task 7（读 `GITHUB_TOKEN`）、Task 9（注释说明） |
| §6.1 DOM 契约 | Task 6 |
| §6.2 布局 | Task 8 |
| §6.3 样式落点与几何契约 | Task 8（`margin 1em 0` + `modules.styl` 显式 import） |
| §6.4 无障碍与对比度 | Task 6（`aria-hidden` / visually-hidden）、Task 8（实算） |
| §6.5 Pjax | Task 6（卡片无 JS 行为，`selectors` 含 `article` 已覆盖） |
| §7 降级矩阵 | Task 5 / Task 6 |
| §8 本地代理注意 | Task 7 Step 4 的说明 |
| §9 验证策略 | Task 10 |
| §10 影响面 | 全部 |
| §11 风险登记 | Task 5（预算 / fail-soft）、Task 4（`-352`）、Task 9（`contents: write`） |

无遗漏。

**2. 占位符扫描**

无 TBD / TODO / 「类似 Task N」/ 「补充错误处理」类空话。Task 1 Step 1 的 `av` 形式断言有一处需按注释改写（已显式标注改法）。Task 7 Step 1 是「读现有文件照模式写」——这是必要的前置阅读步骤，且 Task 7 Step 2 给了完整代码，不构成占位符。

**3. 类型一致性核对**

| 名称 | 定义处 | 使用处 | 一致 |
| --- | --- | --- | --- |
| `identifyPlatform` 返回 `needsShortLinkResolve` / `shortCode` / `apiUrl` / `webUrl` / `id` | Task 1 | Task 4（`target.shortCode`、`target.needsShortLinkResolve`）、Task 5、Task 6 | 是 |
| `cacheKey(target)` | Task 1 | Task 2（未直接用，Task 5/6 用）、Task 5、Task 6 | 是 |
| `entry` 形状 `{platform, fetchedAt, ok, data?, reason?}` | Task 2 | Task 3、Task 4、Task 5、Task 6 | 是 |
| `fetchGithub(target, {fetchImpl, token, timeoutMs, retries, sleep})` | Task 3 | Task 5（按 `providers[platform]` 统一签名调用） | 是 |
| `fetchBilibili(target, {...})` | Task 4 | 同上 | 是 |
| `renderEmbeds(html, lookup)` 返回 `{html, rendered, plain, skipped}` | Task 6 | Task 7 | 是 |
| `collectSoleLinks(documents)` | Task 5 | Task 7（经 `fetchEmbedMetadata` 间接） | 是 |
| CSS 类名 | Task 6 DOM | Task 8 样式 | 逐个核对一致 |
| `--embed-muted` | Task 8 Step 1/4 | Task 8 Step 2 脚本 | 是 |

发现并已修正的一处：Task 1 Step 1 初稿把 `av80433022` 断言成 `BV1GJ411x7h7-x`（占位式假值），已在该步内改为「`identifyPlatform` 对 av 形式返回 `null`」并在 Task 1 Step 3 的实现里通过「不写 `BILIBILI_AV_RE`」实现。

---

## 交付口径提醒

- **不得声称浏览器验收完成。** 本计划的自动化证据只覆盖「构建通过 + 产物 DOM/几何/对比度核对 + 门禁 exit 0」。卡片在真实浏览器里的观感、悬停、键盘焦点环、明暗主题、移动端宽度**必须由用户实机确认**。
- **不得 push。** 10 个 commit 全部留在本地。
- 交付时必须列出：12 case 结果表、门禁 exit 表、实算对比度数字、以及**本机 GitHub 抓取是否因代理 TLS 劫持而降级**（若降级，如实说明并给出 `NODE_EXTRA_CA_CERTS` 修法）。
