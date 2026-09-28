# 链接卡片设计：`<URL>` → GitHub / Bilibili 信息区块

日期：2026-09-28
状态：待评审
关联：`docs/2026-09-24-marker-interpreter-design.md`（marker 协议）、`AGENTS.md`（活文档）

## 1. 目标与非目标

### 目标

作者在文章里写一行 `<https://github.com/owner/repo>` 或 `<https://www.bilibili.com/video/BVxxxxxxxxxx>`，构建期自动抓取该链接的公开元数据，渲染成一个带平台图标的区块卡片。

### 非目标

- 不做浏览器端抓取（Bilibili 对带 `Origin` 的请求直接返回 403，浏览器跨域 100% 失败）。
- 不做运行时刷新。数据是构建期快照。
- 不改动现有 marker 协议的 lexer / occurrence 状态机。
- 不做「普通 Markdown 链接独占一行就升级」的隐式行为。

## 2. 语法

### 2.1 触发条件

`<URL>` **独占一个物理行**（行内可有前后空白，行内不得有其它内容）。作者主动使用尖括号即为 opt-in 信号；想写普通链接就用 `[文字](url)`，永远不会意外升级。

### 2.2 平台识别

| 平台 | 匹配的 URL 形态 | 规范化 ID |
| --- | --- | --- |
| GitHub | `github.com/{owner}/{repo}`，容忍 `.git` 后缀、`/tree/...`、`/blob/...`、`/releases/...` 等深层路径（取前两段）；`www.github.com` 等价 | `owner/repo` |
| Bilibili | `bilibili.com/video/BVxxxxxxxxxx`、`bilibili.com/video/av{aid}`、`b23.tv/{code}` 短链 | `BVxxxxxxxxxx` |
| 其它 | — | 不识别，零改动 |

大小写不敏感；URL 允许带 query / fragment（识别时剥离）。

### 2.3 降级语义

| 情形 | 结果 |
| --- | --- |
| URL 独占一行且平台已识别、抓取成功 | 完整卡片 |
| URL 独占一行且平台已识别、抓取失败 | 纯链接卡片（平台图标 + 标题 + 地址）+ 构建期 WARN |
| URL 独占一行但域名未识别 | 原样 autolink |
| URL 未独占一行 | 原样 autolink |
| URL 语法非法（如 `<>`、`<not a url>`） | 原样 autolink（交给 marked） |

**任何情形都不得中断 `hexo generate --bail`。**

## 3. 架构

### 3.1 阶段划分

```
hexo generate
└─ execFilter('before_generate')
   ├─ 5   embed/fetch.js        ← 异步抓取（本设计新增）
   ├─ 10  core render_post      → post.render() 触发下面整条 after_post_render 链
   │      ├─ 4   markers before
   │      ├─ marked 渲染（<URL> → <p><a href="X">X</a></p>）
   │      ├─ 5   alerts / spoiler
   │      ├─ 9   markers after
   │      ├─ 10  core excerpt + external_link / terms / checkbox / lightgallery / pandoc
   │      ├─ 11  embed/render.js ← 卡片渲染（本设计新增）
   │      ├─ 20  meta-description
   │      ├─ 1000 encrypt
   │      └─ 1100 search sidecar 捕获
   ├─ 20  search sidecar 自愈
   └─ _runGenerators()
```

### 3.2 为什么抓取必须挂 `before_generate` 5

Hexo 核心 `render_post` 注册在 `before_generate` **priority 10**（`node_modules/hexo/dist/plugins/filter/before_generate/render_post.js:6-18`），它执行 `post.content = post._content; post.render(...)`，**整条 `after_post_render` 链由它触发**。因此：

- `before_generate` **< 10** 是唯一能保证「先联网填数据、再让渲染读到」的窗口。
- 本仓已有的 search sidecar 自愈挂在 20（`generator/search/generator.js:13`），只能做事后修补，已为此写了 200+ 行 `snapshot.js` 自愈逻辑。本设计**不复制这个代价**。
- 挂 generator（`hexo.extend.generator.register`）不可行：其产物是路由文件 `{path, data}`，在 `index.js:373-386` 运行时正文已定稿。
- markers 的 `before 4` / `after 9` 是纯同步 filter，无 await 点，不能承载网络 I/O。

### 3.3 为什么渲染必须挂 `after_post_render` 11

**`11` 而非 `5`，是为了让下游三个消费者天然不受污染：**

| 消费者 | priority | 与 11 的关系 | 结果 |
| --- | --- | --- | --- |
| core `excerpt` | 10 | 在卡片渲染**之前**定稿 | 摘要**不含**卡片文本 |
| core `external_link` | 10 | 同上 | 卡片内部的 `<a>` 不会被它加工 |
| `terms` | 10 | 同上 | 卡片里的仓库名 / 描述**不会被加术语链接** |
| `meta-description` | 20 | 在其后，但读 marker 投影而非 `content` | SEO 描述**不含**卡片文本 |
| `search` sidecar | 1100 | 在其后，但读 marker 投影 | 搜索索引**不含**卡片文本 |
| `encrypt` | 1000 | 在其后 | 加密文章的卡片随正文一起被加密替换 |

若挂在 5，`terms`（10）会对整篇 `data.content` 跑一遍，把卡片里的中文描述、仓库名按 `terms.list` 加链接——卡片是元数据不是正文，不该被加术语链接。挂 11 让这个属性**结构性成立**，无需改 `terms-core.js` 的保护段。

同 priority 的 `alerts` / `spoiler`（均为 5）与本 filter 域不相交，加载顺序（`scripts/` 字典序：`alerts.js` → `embed.js` → `spoiler.js`）不影响正确性。

### 3.4 数据传递：URL 做 key，不插占位符

**决策：用 `{platform}:{规范化ID}` 复合键（`github:owner/repo`、`bilibili:BVxxx`）做 key，渲染阶段按 key 查表。** 带 `platform` 前缀是为了让 sidecar 里两类平台的条目不会因 ID 字面撞车而互相覆盖。

不使用「在 `_content` 里插入占位 token」的方案，理由：改写 `_content` 会改变 search sidecar 的 `source` SHA-256，导致每次构建都判定缓存过期并重渲染全文（`generator/search/snapshot.js` 已为缓存自愈付出 200+ 行）。

**「独占一行」规则只在抓取阶段实现一次**，渲染阶段不重新实现该规则：

- 抓取阶段（原始 markdown）：逐行 trim 后整行匹配 `^<(https?://[^>\s]+)>$` → 识别平台 → 得到 ID 集合 → 抓取 → 写入 `Map<id, data>`
- 渲染阶段（已渲染 HTML）：对每个 `<p>`，若其**唯一子元素**是一个 `<a>` 且其 `href` 规范化后命中 `Map` → 整段替换为卡片；否则不动

这样两个阶段**不可能判定漂移**：没进 `Map` 的 URL 天然不会被升级。渲染阶段的匹配器无需理解「独占一行」，只需「段落里只有一个链接且该链接被抓过」。

### 3.5 模块树

```
themes/arknights/scripts/embed/
├── register.js        # 唯一注册入口：before_generate 5 + after_post_render 11
├── platform.js        # 叶子：URL → {platform, id, apiUrl} | null；数字格式化
├── cache.js           # sidecar 读写、TTL、schema/version、内容寻址 key
├── providers/
│   ├── github.js      # GET /repos/{o}/{r} + commits?per_page=1（Link rel=last）
│   └── bilibili.js    # b23.tv 短链解算 + GET /x/web-interface/view
├── fetch.js           # 异步编排：扫 _content → 去重 → 并发抓取 → 写 sidecar + Map
└── render.js          # 同步渲染：扫描已渲染 HTML 的独占锚点段落 → 卡片 DOM
```

依赖方向单向无环：`register → {fetch, render}`；`fetch → {platform, cache, providers/*}`；`render → {platform}`。`platform.js` 是叶子，不 require 任何 sibling。

与既有 markers 子树**零耦合**：`markers/` 只认 `[#]>NAME|` 协议，本子系统只认 `<URL>` 独占行，两者 token 域不相交。`scripts/markers/register.js` 与 `scripts/embed/register.js` 各自独立注册。

## 4. 抓取层

### 4.1 扫描

遍历 `hexo.model('Post').toArray()` 与 `hexo.model('Page').toArray()`，读 `document._content`（渲染前原文）。逐行：

```
const SOLE_LINK_LINE = /^\s*<(https?:\/\/[^>\s]+)>\s*$/
```

`sourceRange` 不需要（无邻接分组语义）。

### 4.2 并发与预算

| 参数 | 值 | 理由 |
| --- | --- | --- |
| 单请求超时 | 10 s | 本机实测 32–740 ms；CI 冷启动 DNS + Actions 出站更慢 |
| 重试 | 2 次，指数退避 1 s / 3 s | — |
| 并发上限 | 4 | 避免触发二级限额（次级限额带 `Retry-After`） |
| **全局预算** | **60 s** | 10 个坏链接最坏 300 s 会拖垮 CI；超预算则剩余全部降级并 WARN |

### 4.3 GitHub provider

一次 `GET /repos/{owner}/{repo}` 取回全部所需字段；`GET /repos/{owner}/{repo}/commits?per_page=1` 读 `Link` 头的 `rel="last"` 页码取 commit 数（**只花 1 次 core 配额**，优于 `/stats/contributors`——后者返回贡献者数且对大仓库 202 异步）。

请求头：

```
Accept: application/vnd.github+json
User-Agent: <显式设置>            // 官方要求；Node fetch 默认发 user-agent: node，能过但不规范
Authorization: Bearer <token>    // 仅当环境变量存在时附加
```

| 卡片字段 | API 来源 | 备注 |
| --- | --- | --- |
| 名称 | `full_name` | 行 1 主标题 |
| 描述 | `description` | 行 1 末尾；`null` / `""` 时隐藏 |
| 地址 | `html_url` | 整卡外层 `<a href>` |
| star | `stargazers_count` | — |
| fork | `forks_count` | — |
| 创建时间 | `created_at` | 格式化为 `YYYY-MM` |
| 提交数 | `Link` 头 `rel="last"` 页码 | — |
| 语言 | `language` | 行 2 末尾 |
| 作者头像 | `owner.avatar_url` | 备用；卡片主视觉用平台图标而非头像 |
| **真 watch 数** | `subscribers_count` | **仅入 sidecar，本版不上卡片**。`watchers_count` 恒等于 `stargazers_count`，是 API 陷阱字段，**禁止使用** |

b23.tv 之外不处理短链（GitHub 无需）。

### 4.4 Bilibili provider

1. 若为 `b23.tv/{code}`：`GET` + `redirect: "manual"`，从 `Location` 取 `BV[0-9A-Za-z]{10}`。**不跟随重定向**。
2. `GET https://api.bilibili.com/x/web-interface/view?bvid={BV}`，请求头带浏览器 `User-Agent`，**不得带 `Referer`**：桌面 Chrome UA 与 `Referer: https://www.bilibili.com/` 共存会被风控判为「无任何会话 Cookie 却声称来自站内」的爬虫，返回 HTTP 412 + `code: -412`（`request was banned`）。实测 48 次交错试验中该组合 12/12 触发 412，**缺任一头即 200 / `code: 0`**。UA 单独只描述客户端形态、不含「来自站内」的断言，故保留。

| 卡片字段 | API 来源 | 备注 |
| --- | --- | --- |
| 标题 | `data.title` | 行 1 主标题 |
| UP 主 | `data.owner.name` | 行 2 首项 |
| 播放数 | `data.stat.view` | — |
| 点赞 | `data.stat.like` | **无需登录态**（实测裸 fetch 可得）；三连之一 |
| 投币 | `data.stat.coin` | 三连之二 |
| 收藏 | `data.stat.favorite` | 三连之三 |
| 弹幕 / 评论 / 分享 | `data.stat.danmaku` / `reply` / `share` | 仅入 sidecar，本版不上卡片 |
| 发布时间 | `data.pubdate`（Unix 秒） | 格式化为 `YYYY-MM-DD` |
| 封面 | `data.pic` | **`http://` 改写为 `https://`**；作为卡片右侧缩略图 |

错误码处理：`-400` / `-404` / `62002` / `62004` / `-403` 一律降级为纯链接卡片 + WARN。`-352`（滑块风控）同样降级，**不做自动恢复**。实测从未观测到 `-352`；实际观测到的 ban 是 HTTP 412 + `code: -412`，它在 **HTTP 状态层**即被短路（`ok: false` → `VIEW_UNAVAILABLE`），**到不了本表**，同样不重试。

### 4.5 数字格式化

| 原值 | 显示 |
| --- | --- |
| `41777` | `41.8k` |
| `3758` | `3,758` |
| `106284274` | `1.06亿` |
| `2932480` | `293.2万` |

GitHub 用 K 惯例（英文语境），Bilibili 用万 / 亿（中文语境）。

## 5. 缓存

### 5.1 sidecar

仓库根 `embed-cache.json`，进版本库。

```jsonc
{
  "schema": "arknights-embed-cache",
  "version": 1,
  "entries": {
    "github:hexojs/hexo": {
      "platform": "github",
      "fetchedAt": "2026-09-28T08:00:00.000Z",   // ISO 8601 UTC
      "ok": true,
      "data": { "full_name": "...", "stars": 41777, "commits": 3758 }
    },
    "bilibili:BV1GJ411x7h7": {
      "platform": "bilibili",
      "fetchedAt": "2026-09-28T08:00:00.000Z",
      "ok": true,
      "data": { "title": "...", "view": 106284274, "like": 2932480 }
    }
  }
}
```

- **key** = `{platform}:{id}`，跨文章跨构建全局去重
- **TTL** = 7 天。`ok: false` 的失败条目 TTL 缩短为 1 天，避免一次网络抖动把卡片锁死一周
- 抓取成功且数据有变化时才写文件；无变化则**不产生 diff**

### 5.2 CI 回写

`deploy.yml` 增一个构建后步骤：若 `embed-cache.json` 有 diff 且提交 SHA ≠ `github.sha`，用 `git commit` + `git push` 回写 `main`。需要 `permissions: contents: write`。

**这是显式的自动化写回**，用户可通过不授予该权限来关闭（关闭后 sidecar 只在本地更新，CI 每次仍会抓取过期项）。

### 5.3 凭据

| 环境 | 凭据 | 限额 |
| --- | --- | --- |
| GitHub Actions | 自动注入的 `GITHUB_TOKEN` | 1000 次/小时/仓库 |
| 本地开发 | 无（匿名） | 60 次/小时，**按来源 IP** |

**零配置**：不需要用户新建任何 secret。`GITHUB_TOKEN` 1000/hr 对个人博客的链接数量绰绰有余；真超限时抓取降级为纯链接卡片并 WARN，不红构建。

可选增强：若用户日后想用更高限额，支持 `EMBED_GITHUB_TOKEN` 环境变量覆盖（fine-grained PAT，`Metadata: read` 即可，5000 次/小时）。**本版不要求配置。**

## 6. 渲染层

### 6.1 DOM 契约

```html
<a class="embed-card embed-card--github" href="https://github.com/hexojs/hexo"
   target="_blank" rel="noopener noreferrer" data-embed-id="github:hexojs/hexo">
  <i class="embed-card__icon" aria-hidden="true"></i>
  <span class="embed-card__body">
    <span class="embed-card__title">hexojs/hexo</span>
    <span class="embed-card__desc">A fast, simple &amp; powerful blog framework…</span>
  </span>
  <span class="embed-card__stats">
    <span class="embed-stat">
      <i class="fa-solid fa-star" aria-hidden="true"></i>
      <span class="embed-stat-label">star</span><span class="embed-stat-value">41.8k</span>
    </span>
    <span class="embed-stat">
      <i class="fa-solid fa-code-branch" aria-hidden="true"></i>
      <span class="embed-stat-label">fork</span><span class="embed-stat-value">44</span>
    </span>
    <span class="embed-stat">
      <i class="fa-solid fa-hashtag" aria-hidden="true"></i>
      <span class="embed-stat-label">提交</span><span class="embed-stat-value">3,758</span>
    </span>
    <span class="embed-stat embed-stat--plain">TypeScript</span>
  </span>
</a>
```

降级形态（抓取失败）：`.embed-card--plain`，只保留 `__icon` + `__title` + 原始地址文本，无 `__stats`。

### 6.2 布局

```
┌────┬──────────────────────────────────────────────────────┐
│    │ hexojs/hexo                                           │  ← __title
│  ⬢  │ A fast, simple & powerful blog framework, powered…   │  ← __desc（次要色小字）
│    ├──────────────────────────────────────────────────────┤
│    │ ★ 41.8k  ⑂ 44  🕐 2012-09  # 3,758  TypeScript        │  ← __stats（可换行）
└────┴──────────────────────────────────────────────────────┘
```

- 根元素 `display grid`，`grid-template-columns: auto 1fr`，`grid-template-rows: auto auto`
- `__icon` 占满**两行**（即「图标占两行」的要求）
- `__stats` 跨两列（`grid-column: 2`），内部 `flex-wrap: wrap`
- 平台图标走 inline SVG data-URI `@css { :root { --embed-icon-github: url(...) } }`，与 `admonition.styl` 的 `--adm-icon-*` 做法一致

### 6.3 样式落点与几何契约

- 新建 `themes/arknights/source/css/_modules/cards/embed.styl`，在 `modules.styl` 中**显式** import（与 `cards/admonition` / `cards/link-card` 同列，不加通配）
- 落进 `#post-content` 时 `margin 1em 0`，与 `table` / `figure.highlight` / `blockquote` / `.admonition` 的**盒左缘偏移全为 `0px`**（`theme-ui-alerts.test.js` 的 `assertCalloutGeometry` 已卡这条，不得破坏）
- 配色全部走既有 token（`--theme-text` / `--theme-unimportant` / `--theme-bg-soft` / `--theme-highlight` / `--theme-border`），明暗两套自动覆盖，**不引入硬编码色值**
- 悬停：换底色为 `--theme-bg-soft-hover` + `title` 属性显示完整描述
- `prefers-reduced-motion` 下取消过渡
- 暗色主题下 Bilibili 封面加轻微降亮，避免高饱和封面刺眼

### 6.4 无障碍

- 整卡是一个 `<a>`，可 Tab 聚焦、可用 Enter 打开 → WCAG 2.4.7 / 2.1.1 成立
- 命中盒远大于 24×24（WCAG 2.5.8）
- 平台图标 `aria-hidden="true"`（纯装饰）
- 每个统计项由「图标（`aria-hidden`）+ 视觉隐藏的文字标签 + 数值」三部分组成。文字标签用 `.visually-hidden` 模式（`position absolute; width 1px; height 1px; overflow hidden; clip-path inset(50%); white-space nowrap`）**只对读屏可见**，视觉上不重复显示——图标已承担视觉语义。避免读屏只念「41.8k」而不知其含义。
- 状态不仅靠颜色：卡片有边框 + 平台图标 + 文字标题，三重区分线索。
- 对比度分三档实测，**全部必须 ≥4.5:1（WCAG 1.4.3 正文级）**：
  - 标题 `--theme-text`（明 `#222` 14.58:1 / 暗 `#c4c4c4` 10.48:1，已达标）
  - 描述与统计标签需要**次级观感但达标**的颜色。`--theme-unimportant`（明 `#767676` 对浅底仅 **4.16:1**，未达标）**不可直接使用**；须按 GitHub Alert 标题色那套「明色向黑、暗色向白按统一 15% 混色公式修正」的方法**实算出一对新的次级色 token**，并在产物中逐项复算明暗两套的标题 / 描述 / 统计三组对比度。

### 6.5 Pjax

`meta-data.pug` 的 Pjax `selectors` 已含 `article`，换页后卡片随文章一起被替换，无需额外重绑。卡片**无 JS 行为**（无折叠、无 tooltip 依赖），这是刻意的选择——避免为纯展示内容引入运行时状态。

## 7. 错误处理与降级矩阵

| 阶段 | 失败情形 | 行为 |
| --- | --- | --- |
| 扫描 | `_content` 非字符串 | 跳过该文档 |
| 识别 | 域名未识别 | 不进 `Map`，不升级 |
| 抓取 | 超时 / 5xx / 403 限流 | 2 次退避重试 → 仍失败则 `ok: false` 条目 + WARN |
| 抓取 | 404 / 已删除 / 私有 | `ok: false` + WARN，**不重试** |
| 抓取 | Bilibili `-352` 风控 | `ok: false` + WARN，**不自动恢复**（未观测到） |
| 抓取 | Bilibili `412` / `code: -412` ban | `ok: false` + WARN，**不重试**（头形状确定性决定，重发必然再 412） |
| 抓取 | 全局预算耗尽 | 剩余全部 `ok: false` + 单条汇总 WARN |
| 抓取 | `GITHUB_TOKEN` 失效 | 退化为匿名（去 `Authorization` 头重试 1 次）→ 仍失败降级 |
| 渲染 | `Map` 未命中 | 保持原样 autolink |
| 渲染 | 段落内锚点 > 1 | 保持原样 |

**任何失败都不抛异常、不中断 `--bail`。** WARN 走 `hexo.log.warn`，带平台 + URL + 失败原因摘要。

## 8. 本地环境注意

用户机器的系统代理 `127.0.0.1:7890` 对 `api.github.com` 做 TLS 中间人劫持：**`curl` 能通（走 Windows 证书库）但 Node 26 的 `fetch` 报 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`**（Node 用自带 CA 集合，不读系统代理）。`api.bilibili.com` 与普通站点从 Node 均正常，**仅 GitHub 失败**。

- **CI runner 无此问题**，不受影响
- 本地需要抓 GitHub 卡片时：导出代理根证书为 PEM 后设 `NODE_EXTRA_CA_CERTS=<path>`
- **禁止** `NODE_TLS_REJECT_UNAUTHORIZED=0`（全局关闭 TLS 校验，危害远超收益）

本版**不实现**自动读取系统代理（`undici` 的 `EnvHttpProxyAgent`）—— 那是独立决策，不在本次范围。

## 9. 验证策略

用户已明确「不需要新增测试或门禁探针」。本设计的验证以**产物核对 + 纯计算复核**为主：

| 项 | 方法 |
| --- | --- |
| 构建 | `$env:TZ = 'Asia/Shanghai'; npx hexo generate --bail` → exit 0 且 `FATAL\|ERROR\|WARN\|Bail` **零命中**（WARN 计数需人工确认为预期的降级条目） |
| 内部串清零 | `public/` 内 `data-embed-id` 之外的内部串（占位 token、API 原始 JSON 键名如 `stargazers_count` / `bvid`）零命中 |
| 语法边界 | 构造 12 个 case 喂真实构建：独占行 / 非独占行 / 未识别域名 / `b23.tv` 短链 / `.git` 后缀 / 深层路径 / 同一 URL 两次 / 跨文章复用 / `<>` 空 / 非法 URL / 卡片后紧跟普通段落 / 卡片在 `<!-- more -->` 之后 |
| 降级链 | 用 mock provider 强制超时 / 404 / 限流，确认渲染出 `.embed-card--plain` 且构建 exit 0 |
| 对比度 | 从产物 CSS 读回色值，按 alpha 合成后逐项实算明暗两套的标题 / 描述 / 统计对比度 |
| 几何 | 纯计算复核 `__icon` 跨两行、盒左缘偏移 0px、命中盒尺寸 |
| 既有门禁 | 跑现存 17 个（`b-readme-examples.js` 已按裁决退役），断言失效的更新为新契约，**等值强度不得放宽** |
| 实机 | 真实有头浏览器确认卡片外观、悬停、键盘可达、明暗主题、移动端宽度；**无头截图不可作为证据** |

## 10. 影响面

| 文件 | 变更性质 |
| --- | --- |
| `themes/arknights/scripts/embed/**` | 全新子树（6 文件 + 2 provider） |
| `themes/arknights/source/css/_modules/cards/embed.styl` | 全新 |
| `themes/arknights/source/css/_modules/modules.styl` | 加一行显式 import |
| `themes/arknights/scripts/embed/register.js` | 自动加载（与 `markers/register.js` 同机制，`register.js` 是唯一副作用入口） |
| `.github/workflows/deploy.yml` | 加 `permissions: contents: write` + sidecar 回写步骤 |
| `embed-cache.json` | 新增数据文件（首次构建后产生） |
| `AGENTS.md` | Architecture / Source Tree / Conventions / 定制地图同步 |
| `cssVersion` / `jsVersion` | CSS 与「构建期逻辑」变更；`jsVersion` 仅在 `_src/**/*.ts` 变化时递增（本设计不动 TS，故**只递增 `cssVersion`**） |

**不改动**：`markers/` 子树任何文件、`terms-core.js`、`meta-description.js`、`search/` generator、任何 Pug 文章模板。

## 11. 风险登记

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| Bilibili 412 ban（`code: -412`，由 UA + Referer 共存触发） | 中 | **已消除诱因**：删除 `Referer` 请求头，48 次试验中触发率由 12/12 降至 0；412 不重试、fail-soft 降级。`-352` 未被观测到，原「预防性请求头 / 38 次连续请求零触发」的登记结论作废 |
| GitHub 匿名 60/hr 按 IP，Actions 出口为共享网段 | 低 | 自动使用 `GITHUB_TOKEN`（1000/hr）；sidecar 缓存使实际请求数极低 |
| 卡片文案被误当正文（SEO / 搜索索引） | 低 | 挂 11 使 `excerpt` / `meta-description` / search 投影三者结构性隔离 |
| 数字格式化阈值的中文 / 英文观感不一致 | 低 | 已在 §4.5 固定两套规则 |
| `.embed-card` 外层是 `<a>`，内部若将来要放链接会嵌套非法 | 低 | 本版卡片内**禁止**任何交互元素（`__desc` 用 `<span>` 而非 `<a>`），规格中显式约束 |
| sidecar 回写 job 造成仓库写操作 | 低 | 需显式授予 `contents: write`；可用 `paths-ignore` 限制触发；无变化不产生 commit |
| 21 个丢失探针 + `.temp/` 不入库 | 高（既有） | 既有技术债，本设计不解决；新子系统的验证证据落在 `.temp/` 一次性脚本，不入库 |

## 12. 实施顺序（供 writing-plans 参考）

1. `platform.js`（URL 规范化 + 数字格式化）—— 叶子，先做，先被测
2. `cache.js`（sidecar schema / TTL / 读写）
3. `providers/github.js` → `providers/bilibili.js`
4. `fetch.js`（异步编排 + 预算 + 降级）
5. `render.js`（同步渲染 + DOM）
6. `register.js`（注册两处挂载点）
7. `embed.styl` + `modules.styl` import（含对比度实算）
8. `deploy.yml`（凭据 + 回写 job）
9. `AGENTS.md` 同步 + 版本号递增
10. 全量构建 + 产物核对 + 12 case 验证
