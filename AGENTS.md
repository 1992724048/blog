# 遂沫'Blog（Hexo 静态博客）

## Overview

- 个人技术博客：https://issuimo.com（GitHub Pages 托管）
- 技术栈：Hexo 8.1.2 + 主题 `themes/arknights`（Pug 模板 + Stylus + marked），npm 管理
- 内容方向：嵌入式（ESP32 / IDF）、C++ / 安全 / 逆向、技术随笔

## Architecture

- **主题配置分层（关键）**：Hexo 8 自动加载根级 `_config.arknights.yml`，与 `themes/arknights/_config.yml` 深合并且前者覆盖后者——修改主题配置项一律改**根级**文件（不改主题内默认值）；主题脚本读取合并后的 `hexo.theme.config`（根级值已覆盖主题默认），个别脚本直读根级 `hexo.config.theme_config`
- **主题为 vendored 普通文件**（非 git submodule），含大量本地定制；同步上游主题时注意冲突，勿整体替换
- 主题功能脚本在 `themes/arknights/scripts/`（filters / tags / generator）：术语自动链接（`filters/terms.js`，词表在根级配置 `terms.list`；每篇文章按正文首次出现编号，重复术语复用同号，全局索引仅作稳定锚点）、文章加密、搜索、build_time 等
- 主题 JS 源码为 TypeScript：`themes/arknights/source/js/_src/**/*.ts` → 产物 `themes/arknights/source/js/arknights.js`；`_src/search/search.ts`（独立 tsconfig）→ 产物 `source/js/search.js`；tsc 已装入主题 devDependencies（`typescript@^5`——TS 7 已移除 `outFile`，不兼容本 tsconfig），编译：主题目录 `npm install` 后 `npm run build`（= `tsc -p source/js/_src/tsconfig.json && tsc -p source/js/_src/search/tsconfig.json`）
- **本地自定义样式**：站点级样式集中在主题 `themes/arknights/source/css/_custom/custom.styl`（`arknights.styl` 末尾以 `@import '_custom/*'` 通配导入；原根级自定义样式已迁入并删除旧文件）
- **顶栏导航**：`header.topbar`（sticky，全断点高 36px，毛玻璃底 blur(8px)）；≥1024px 菜单平铺（菜单项图标来自根级 `menu_icons` 映射：键 = 菜单文字、值 = FontAwesome 类名；图标渲染在 `.navItemTitle` 内、悬停 title 提示，未映射回退文字；当前页 active 项全断点隐藏图标、平滑展开名称 `.navItemLabel`（左缘 5px 主题蓝条 + 中度对比底色，与归档 / 分类列表项选中态同语言））+ 右侧簇（社交图标 `.topbar-social` + 常驻搜索框，框内含放大镜图标；搜索框按压顶栏内容区 35px 满高（上缘贴顶、下缘接底线），无任何边框 / 轮廓（含焦点态），底线不被覆盖；右簇紧贴视口右缘），≤1023px 折叠为 ☰ / 搜索图标按钮 + 栏下全宽下拉（菜单与搜索行互斥，锚在同一位置）；社交图标（源 `theme.social`，样式在 `_modules/social.styl`）全断点显示于搜索入口左侧。header 级状态类：`nav-open`（菜单展开）、`search-open`（搜索行展开），开合节流由 JS `readyRev` 控制；二级菜单展开态为 `.navBlock` / `.navSecond` 的 `.expanded`（由 `Header.ts` 切换）。交互在 `Header.ts`（菜单开合 / aria-expanded / 外点 / Escape）与 `search.js`（检索、弹层、移动端展开后聚焦）
- **底部按钮组**：`bottom-btn.pug` + `source/css/_page/post/bottom_btn.styl`（随 article 交换、各页面显示）；右列 `.bottom-btn-stack` 单列 flex 栈（DOM 顺序即视觉顺序，列内 gap 6px）——依次为回到顶部 `#to-top` / 返回上一页 `#to-back`（`history.back()`）/ 目录 `#to-index`（≥769px 隐藏）/ 切换主题 `#color-mode`（另有 BGM 按钮，`bgm` 配置关闭时不渲染）；工具箱 `.toolbox` 独立锚定左下角（左距经 `--toolbox-shift` 补偿 article 偏移，视觉左间距 = 底缘 8px；与右列共用 `--btn-inset: 8px` 底部基线，toggle 底缘与 `#color-mode` 严格同行；桌面 sticky / ≤768 fixed 同锚）；工具箱展开态类 **`.toolbox-open`**（挂载 `.toolbox` 根）——点击扇形展开（半径 66px、角度 0°/22.5°/45° 向右上；扇形容量 5，五项按固定角度展开，无层叠），展开项（含层叠）带轻度投影（rest 0 2px 8px / 悬停 0 4px 10px，rgba(0,0,0,.25/.35)），≥769px 悬停沿径向外抽（位移 + 放大 + 投影加强）；工具为标注 / 分享 / 收藏 / 截图 / 音乐（视觉态 `.toolbox-share.copied`、`.toolbox-favorite.saved`、`.toolbox-bgm[aria-pressed="true"]`；收藏标题经 `data-label-default` / `data-label-saved` 切换；截图使用本地 SnapDOM 3.1.1 按 generation 取消并写入共享 `role=status`，音乐复用 Pjax 区外唯一 `audio#bgm`；正文高亮元素类 `.hl-mark`——默认主题黄，另有 `data-color` 五色变体、`data-text` 存标注原文摘要）；标注为**常驻模式开关**（模式开启：`body.annotating` + `.toolbox-annotate.active`，选中文字由 `#annotate-toolbar` 浮动工具栏承载【标注 / 清除 / 复制 / 搜索 / 颜色】——fixed 视口坐标由 JS 定位、颜色面板 `.at-colors` 五色、复制反馈 `.copied`、z-index 65536 低于 lightgallery / 光标；DOM 与样式契约在 `bottom-btn.pug` / `bottom_btn.styl`）；接线契约 `toolbox.toggle()/annotate()/share()/favorite()` 实现于 `Toolbox.ts`：展开态外点 / Escape 收起、`pjax:success` 重置；标注按 `arknights:highlights:<pathname>` 以文本偏移持久化（`.hl-mark`，含 `data-text` 原文摘要）、收藏按 `arknights:favorites` 存 `{url,title,time}`（`.saved` / `aria-pressed` / data-label 同步），均在载入 + `pjax:success` 恢复
- **工具箱交互与控制器**：`Toolbox.ts` 仅负责开合与 `data-action` 文档委托；`ScreenshotControl.ts` 负责本地 SnapDOM 懒加载、字体/图片等待、`#post-content` 去除分页器、长图整体缩放、PNG 下载与 Pjax generation 取消；`BgmControl.ts` 负责唯一 `audio#bgm` 的播放/暂停、媒体错误重试与 Pjax 后 UI 同步；`ProjectTooltip.ts` 仅负责项目卡 `mousemove -> --mx/--my` 与 Pjax 重绑；结果均写入共享 `role=status`。默认根级 BGM 为 `enable=true`、`autoplay=false`、`loop=true`、`src=/audio/bgm.mp3`，audio 位于 Pjax 替换区外。截图与 BGM 仍须真实有头浏览器验收。
- **数据页面**：`source/data/index.md` + `DataPage.ts`（`_src/include/DataPage.ts`）；读取 localStorage 中 `arknights:favorites` 和 `arknights:highlights:*` 渲染收藏列表和标注数据，支持单条/批量删除、按文章清除标注、导出 JSON；页面容器 `#data-page`，容器存在时首屏渲染并绑事件；**无论首屏是否有容器都挂 `pjax:success` 监听**（非数据页首屏时容器为空若提前 return 会导致导航切入后不渲染），切入后再查询容器、渲染并绑事件
- **标记解释器协议与模块**：AI/PJ 统一使用严格 `[#]<NAME>{...}`；只有 registry 注册的枚举值与 `null` 可裸写，名称、URL、路径、提示等字符串一律双引号。AI 支持 block/inline，输出四态 `.ai-badge`；PJ 仅支持 block 且仅在 `type: projects` 页面接受，连续合法标记编排为 `.projects-grid > .project-card`。旧 `[&]` AI/PJ 语法与旧 filters 已一次性硬切换删除，不保留双读兼容。最终模块树与职责见 Source Tree；`pipeline.js` 本身无 Hexo 注册副作用，`register.js` 是 markers 子树唯一自动注册入口，`meta-description.js` 与它通过 CommonJS 缓存共享同一个 `defaultPipeline.projectText`
- **项目列表页面**：`source/projects/index.md` 使用严格 `[#]<PJ>{"名称", "链接", "图片路径"}`；`handlers/projects.js` 分别按 URL、HTML 文本/属性和 CSS URL 上下文安全序列化，保留 `--card-img`、懒加载图片、`.project-name`、`target="_blank"`、`rel="noopener"` 及 `ProjectTooltip.ts` 所需的卡片结构与 Pjax 重绑契约
- **独立语法**：Alert、Spoiler、Terms 不并入 markers，继续由各自 filter 实现；最终 DOM、遮盖悬停、术语编号/锚点与 Pjax 行为不得因 AI/PJ 迁移改变
- **AI/PJ carrier/Marked 数据流（最终实现）**：store 公开拥有 `findOccurrences(value, field)` / `bindContext(id, context)` 与 occurrence 状态迁移，扩展不得拆 token。before 4 为每次 `post.render` 创建私有 carrier，并通过非枚举 `data.markdown` options 与可枚举模块私有 `CARRIER_SYMBOL` bridge 传递；`marked:use` priority 0 的 start/tokenizer 读取 `this.lexer.options`（Marked 15 实际传 `src.slice(1)`，start 返回值不得再加一），`processAllTokens` 读取 `this.options` 且只审计 `field==='content'`。ownership 固定为：synthetic URL link 先由 `link.href → link-url` 独占 owner（`text===href` 且唯一 text child 为同一 snapshot，text/child 不重复 find/bind、不附 metadata）；普通 image/link 在进入 children 前按 `image.text → image-alt`、普通 `link.text → link-label`（`link.tokens` 只是同一 label 投影）、`link.href → link-url`、字符串 `link.title → link-title` 认领直接字段，再递归 nested children 处理未认领 occurrence。祖先已认领的 child 只复制 frozen snapshot 恢复字段，不重复 `bindContext`、不附独立 metadata；普通 text/html child 不得抢走 image-alt/link-label；真正非祖先 sibling direct fields 重复认领同一 id 才抛 `CARRIER_BINDING_ERROR`。owner metadata descriptor 固定为不可枚举/不可写/不可配置，数组/元素/嵌套 parent 深度冻结；不扫描 `link.raw`。renderer 只消费 metadata 并通过 `this.parser` 委托，`walkTokens` 只做 token-local 检查。lexer 固定先收集原始 marker candidate/range，再将范围内每个 UTF-16 code unit 替换为 `x` 构造等长 masked projection，只在 projection 上运行 Marked 15.0.12 完整 angle autolink/GFM URL 与 `_backpedal` 边界；最终仍从原始 source 输出 `text + marker + text`，projection 不进入 data/token/extension。angle/GFM 的唯一 marker 必须 mode=inline、content occurrence=1、protected=0，最终由真实 Marked `link.href` provenance 绑定 `link-url`；HTML 标签及属性仍为 protected 原文，属性 marker 不签发 occurrence/metadata。lexer 完整保护 `pre`/`textarea`/`script`/`style` raw-text；已签发 raw occurrence 只由 `token.type==='html' && token.block===true` 恢复，普通 inline HTML 间文本仍可物化。link label 是 text-carrier；image alt 唯一采用当前 Hexo `image.text`，link href 与字符串 title raw-preserve，均不调用 handler；DOM 断言不能替代 occurrence/context/state/metadata。heading-only 把原 `token.tokens` 同一引用传给 `parseInline`，最终无 `id`/`.headerlink` 且内部串清零；连续 heading-only、失败/PJ、`headerIds:false` 与每个 `_headingId` snapshot 的 `''`/`'-1'` 双排除只能在真实 Hexo 验收。纯 `new Marked()` 只覆盖扩展基本行为、field-aware ownership 与实际 sibling duplicate fixture

- **carrier 生命周期、投影与 fail-closed 边界**：应用不建立 global current carrier，但 Marked 15 singleton 可能在当前/下一次 parse 前短暂强引用 parse options；`processAllTokens` 在 finally 从当前 parse options 副本删除 `CARRIER_SYMBOL`，只把深度冻结审计快照附到 token，原始 `data.markdown` bridge 仍由 after/同 data before 恢复。bridge 安装先反射捕获原 descriptor/不存在状态：只有无 own property 才允许以 `{}` 开始；own accessor 或 own data value 非受支持 options object（包括 `value: undefined`、`null`、primitive、array 等）必须在调用 getter/改写前以 `CARRIER_BRIDGE_DESCRIPTOR` 拒绝。descriptor/spread/define Proxy 分别映射 READ/READ/DEFINE，data define 部分写入后抛错也必须原子回滚：无 own property 时断言临时属性删除且 descriptor 为 `undefined`；已有 descriptor 时至少覆盖 `writable:false`、`enumerable:false`、`configurable:true`，逐次深比较原 value 引用与 `writable/configurable/enumerable`，并断言 `data.markdown` 访问读/写计数不变；accessor getter/setter 计数均为 0。Hexo 顺序为 renderer → `onRenderEnd` → `after_render:html` → after 9；任一前序阶段拒绝时 Hexo 不执行 after filter，下一次同 data before 必须修复字段和 descriptor。`getCarrierFromOptions(options, expectedCarrier)` 必须做 expected carrier 同一引用校验；字段无法证明 token 位置或审计失败时，以入口原值安全恢复并禁止输出半成品。显式 excerpt 不经过 Marked，before→after 9 之间只保留完整 token、不生成 carrier wrapper，由 after 9 审计 `excerpt-pending`；合法/非法字段必须直接断言具体 DOM/恢复文本与 occurrence=`consumed`/`failed`，并复用同一内部串断言覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 wrapper。`data.more` 永不作为 marker 输入或由 pipeline 读写，并用抛异常 getter/setter 及独立读/写计数证明，Hexo excerpt priority 10 从已物化 content 派生。无显式 excerpt 时 `projectText(data,'excerpt')` 从已保存 content projection 按 `<!-- more -->` 派生，无分隔符回退时必须与已保存的完整 content projection 逐字相等，不得断言为 `null`。字段级 fallback 以 `carrier.originalField(field)` 为权威，`store.restore` 仅局部 best effort。显式 excerpt 的字段终态与 projection 由 after 9 审计；`data.description` 由 `meta-description.js` 使用同一默认 pipeline 投影。`dompurify: false` 或未配置时的 identity sanitizer 是 bridge 支持边界，其他配置必须由真实探针证明不会改写 wrapper。
- **缓存版本号**：修改主题 CSS 产物（`arknights.css`，即主题 Stylus 源）后递增 `themes/arknights/layout/includes/meta-data.pug` 中的 `cssVersion`；修改主题 JS 产物（`arknights.js` / `search.js`）后递增 `themes/arknights/layout/includes/js-data.pug` 中的 `jsVersion`——均用于避免 Cloudflare / 浏览器缓存旧版
- **构建时区**：CI 使用 `TZ=Asia/Shanghai`（否则文章 URL 日期差一天），本地构建同样注意
- **正文字体加载**：HarmonyOS Sans SC 经 jsDelivr 分包 CDN 按需加载（`harmonyos-sans-sc-webfont-splitted@1.1.0`，unicode-range 分包、版本锁死），`Regular.css` / `Bold.css` 链接在 `themes/arknights/layout/includes/meta-data.pug`；本地不再自托管全量字体（`source/fonts/` 已移除）

## 本地定制地图

主题为 vendored 上游代码 + 本地定制，改动优先下列位置（同步上游时注意冲突）：

| 定制点 | 位置 | 说明 |
| --- | --- | --- |
| 站点自定义样式 | `themes/arknights/source/css/_custom/custom.styl` | 字体栈 / 头像留白 / logo 悬停角标（图片外左下 / 右上） / 文本选中色 / `??内容??` 遮盖等站点级样式；`arknights.styl` 以 `@import '_custom/*'` 通配导入 |
| 底部按钮组 | `themes/arknights/layout/includes/bottom-btn.pug` + `source/css/_page/post/bottom_btn.styl` | 右列单列 flex 栈（列内 6px 间隙）；返回上一页 / 工具箱（与右列共用 --btn-inset 底部基线、与切换主题底缘齐平；扇形展开 `.toolbox-open`、层叠容量 3、悬停抽出、展开项轻度投影）；标注模式（`body.annotating` + `.toolbox-annotate.active`）与选中文字工具栏 `#annotate-toolbar`（at-* 按钮 / `.at-colors` 五色板 / `.copied` 反馈）；`hl-mark` 五色（`data-color`）/ 分享 `.copied` / 收藏 `.saved` 视觉态；JS 契约 `toolbox.*` 实现于 `Toolbox.ts`（标注 / 收藏持久化 `arknights:*`，载入 + pjax 恢复） |
| 定制脚本 | `themes/arknights/scripts/`（filters / tags / generator） | 术语自动链接、文章加密、搜索数据、build_time、minify、Alert、`??内容??` 遮盖（`filters/spoiler.js`，悬停显示）及 `meta-description.js`；Alert/Spoiler/Terms 保持独立实现，旧 `filters/ai-badge*.js` / `filters/projects*.js` 已删除 |
| 标记解释器 | `themes/arknights/scripts/markers/` | `lexer.js` / `parser.js` / `token.js` 提供严格语法、保护区与 store-owned occurrence；`carrier.js` 持有单次 render 生命周期及安全 bridge；`marked-extension.js` 只安装无全局副作用的本地 Marked provenance 扩展；`sentinel.js` 负责连续 PJ 临时哨兵；`pipeline.js` 负责 before 4 / after 9、审计、恢复、投影与 fail-closed；`register.js` 是唯一自动注册入口；`handlers/ai.js` / `handlers/projects.js` 负责业务校验、DOM 与纯文本投影 |
| 项目卡片交互 | `source/projects/index.md` + `markers/handlers/projects.js` + `_src/include/ProjectTooltip.ts` | `handlers/projects.js` 保留 `.projects-grid > .project-card`、`--card-img`、懒加载图片、`.project-name` 与安全 URL/CSS；`ProjectTooltip.ts` 仅用模块私有 `WeakSet` 绑定卡片 `mousemove -> --mx/--my` 并在 Pjax 后重绑，不改变卡片 DOM 或 CSS |
| JS 源码（TS） | `themes/arknights/source/js/_src/` | 主入口 `tsconfig.json` → `arknights.js`；`search/search.ts`（独立 tsconfig）→ `search.js` |
| 中文字体 | `themes/arknights/layout/includes/meta-data.pug` | HarmonyOS Sans SC，jsDelivr 分包 CDN（`@1.1.0` 版本锁死） |
| 缓存版本号 | 生效机制：`meta-data.pug` `cssVersion` / `js-data.pug` `jsVersion`；备用机制：`_config.arknights.yml` `stylesheets` 版本参数（当前未使用） | 对应产物变更后同步递增，避免 Cloudflare / 浏览器缓存旧版 |

## Source Tree

```
_config.yml                   # Hexo 主配置（permalink、theme；deploy 为空）
_config.arknights.yml         # 主题配置（实际生效）
scaffolds/                    # hexo new 模板（post / page / draft）
source/_posts/                # 文章
source/projects/index.md      # 项目列表（严格 [#]<PJ> 标记）
source/images/<文章名>/        # 文章配图
themes/arknights/             # 主题（含本地定制：_custom 样式 / scripts / _src TS）
├── source/js/_src/include/environment.d.ts # SnapDOM 与工具控制器全局类型
├── source/js/_src/include/ScreenshotControl.ts # 正文截图、资源等待与 generation 取消
├── source/js/_src/include/BgmControl.ts       # 唯一 audio 的媒体状态机
├── source/js/_src/include/Toolbox.ts          # 工具箱开合与 data-action 委托
├── source/js/_src/include/ProjectTooltip.ts   # 项目卡悬停 CSS 变量绑定
└── source/lib/snapdom/3.1.1/                  # SnapDOM classic vendor 与 MIT LICENSE
themes/arknights/scripts/markers/
├── lexer.js                  # 原始 Markdown candidate、保护区、等长 masked projection
├── parser.js                 # 严格 [#]<NAME>{...} 参数语法
├── token.js                  # opaque token、store-owned occurrence/context/state
├── carrier.js                # 单次 render carrier 与 data.markdown descriptor bridge
├── marked-extension.js       # 本地 Marked token provenance、ownership 与 renderer 委托
├── registry.js               # AI/PJ handler 注册与分发
├── sentinel.js               # 连续 PJ 的 collision-safe 临时哨兵
├── pipeline.js               # before 4 / after 9、审计、恢复、投影、fail-closed
├── register.js               # markers 子树唯一 Hexo 自动注册入口
└── handlers/
    ├── ai.js                 # AI 四态 DOM、校验与纯文本投影
    └── projects.js           # PJ 字段/URL/CSS/DOM 校验与投影
.github/workflows/deploy.yml  # CI：构建并部署 GitHub Pages
.temp/                        # 本地探针（gitignore，不提交）
├── marker-core.test.js
├── marker-registry-ai.test.js
├── marker-projects.test.js
├── marker-carrier.test.js
├── marked-extension.test.js
├── marker-pipeline.test.js
├── marker-hexo-integration.test.js
├── marker-migration.test.js
├── marker-e2e.test.js
└── marker-artifacts.js
.superpowers/                 # 本地任务 brief/report（不提交）
```

## Build & Deploy

- 安装依赖：`npm install`
- 本地预览：`npm run server`（= `hexo server`）
- 生成静态文件：`npm run build`（= `hexo generate`，输出 `public/`）
- 清理：`npm run clean`（= `hexo clean`）
- **不要用 `npm run deploy`**（`deploy.type` 未配置）：实际部署 = push `main` → GitHub Actions 构建 → `public/` 推送至 `pages` 分支 → GitHub Pages

## Content Authoring

- 新建文章：`npx hexo new post "<标题>"`（模板见 `scaffolds/post.md`）
- frontmatter：`title / date / tags / categories / description`（参照现有文章；`description` 为 SEO 摘要，约 80–160 字纯文本，勿含 AI 徽标标记）
- 图片：`post_asset_folder` 为 false，配图放 `source/images/<文章名>/`，引用语法示例：`![2026-03-04_01-09-33.bmp](/images/esp32-idf-clion/2026-03-04_01-09-33.jpg)`

## Verification

- 主题没有可作为门禁的 `npm test`；一般改动后用 `npm run server` 本地预览，marker 最终回归使用 `.temp/` 下的 Node `assert` 探针
- C 批次工具箱专项门禁依次为 `node .temp/snapdom-vendor.test.js`、`node .temp/theme-ui-screenshot.test.js`、`node .temp/theme-ui-bgm.test.js`、`node .temp/theme-ui-toolbox.test.js`；主题 TypeScript 改动后运行 `npm --prefix themes/arknights run build` 与 `node --check themes/arknights/source/js/arknights.js`。截图的字体 / 图片 / canvas 阶段均按 generation 取消，分页器、按钮、懒加载属性与共享 `role=status` 必须在成功、失败和 Pjax 边界恢复；C 不运行完整 Hexo build，真实 PNG、音频与有头浏览器交互留给 D。
- marker 最终门禁依次运行九个探针：`.temp/marker-core.test.js`、`.temp/marker-registry-ai.test.js`、`.temp/marker-projects.test.js`、`.temp/marker-carrier.test.js`、`.temp/marked-extension.test.js`、`.temp/marker-pipeline.test.js`、`.temp/marker-hexo-integration.test.js`、`.temp/marker-migration.test.js`、`.temp/marker-e2e.test.js`；每次须记录 `ok` 输出与退出码 0
- 真实 Hexo 自动加载 `register.js`（init 后不得手动注册或创建第二套 pipeline），before 4 / after 9 / `marked:use` 0 各唯一且默认方法身份一致；覆盖 renderer → `onRenderEnd` → `after_render:html` → after 9 的成功/拒绝边界及同 data 重试
- 深层 token/bridge 门禁覆盖 candidate/range、逐 UTF-16 code unit 的等长 `x` masked projection、原始 `text + marker + text` 分段、synthetic angle/GFM 的唯一 `link-url` owner、冻结 metadata、普通 image/link direct-field-first、实际 Marked 三类 sibling duplicate `CARRIER_BINDING_ERROR`、raw/protected/Markdown 生成块对照、descriptor/Proxy 原子回滚、Marked options symbol 清理、显式 excerpt 的 DOM + `consumed`/`failed`、无分隔符 projection 严格等值、抛异常 `data.more` getter/setter 零计数、真实 heading/PJ 网格及 `dompurify: false`/identity 边界
- 最终状态运行 `node --check .temp/marker-e2e.test.js`、`node --check .temp/marker-artifacts.js`、`git diff --check`、`git diff --stat`、`git status --short`，随后只运行一次 `TZ=Asia/Shanghai npm run build` 并立即运行 `node .temp/marker-artifacts.js`；artifact 探针检查三篇 AI 文章、项目页、`public/search.json` 与 `public/js/arknights.js` 中的 ProjectTooltip 合并契约
- AI tooltip、项目悬停、懒加载、搜索与站内 Pjax 重绑仍须真实有头浏览器人工验收；无头截图不能作为通过证据，未执行人工门禁时不得声称浏览器验收完成
- 临时脚本 / 产物放 `.temp/`（已 gitignore），用完清理；`node .temp/nav-smoke.js` 为顶栏 / 搜索交互的 jsdom 冒烟脚本（读 `public/`），改动导航后可用于回归
- 项目列表解析改动先用 `.temp/` 下的 Node `assert` 探针覆盖合法/连续/非法/转义/页面类型/段落解包，再以 `TZ=Asia/Shanghai npm run build` 验证，并检查 `public/projects/index.html` 中 `.projects-grid`、`.project-card`、`--card-img`、懒加载图片、`.project-name` 及非法标记保留行为
- 标记解释器实施细节还须覆盖真实 Hexo 自动注册与 priority（before 4、after 9、`marked:use` 0）、renderer/`onRenderEnd`/`after_render:html` 边界、bridge own `value: undefined`/其它 unsupported value/configurable accessor/descriptor Proxy/spread Proxy/部分写入 define Proxy 的稳定错误码；无 own property 回滚须断言临时属性删除，已有 descriptor 回滚至少覆盖 `writable:false`/`enumerable:false` 并保持原 value、flags 与访问计数，accessor getter/setter 仍须零计数；`x <pre>/<textarea>/<script>/<style>` 完整保护、block raw/空行 paragraph/Markdown 生成块/inline HTML 对照。lexer 门禁必须先断言 candidate/range 与逐 UTF-16 code unit 的等长 `x` masked projection，再证明 angle autolink/GFM 裸 URL 的最终原始 segments 均为 `text + marker + text`、各恰有 1 枚 mode=inline occurrence、0 protected/raw 误判；实际 Marked 门禁还须断言 contentOccurrences=1、bindings=1、metadata.id=occurrence.id、context=`link-url`、state=`raw-preserved`、parent=`href`、synthetic child 无 metadata，HTML 属性仍无 occurrence/metadata。普通 image/link 使用 direct-field-first；外层 link→image 与 image→link fixture 分别断言外层唯一 owner 的 context/state/parent 和 nested projection child 无 metadata。实际 `new Marked()` 还必须让 angle/GFM 两组非祖先 synthetic link、普通 link href、image alt 分别共享同一 store occurrence id，并断言已安装的 `processAllTokens` 对三类 fixture 均抛 `CARRIER_BINDING_ERROR`，不得绕过 Marked 阶段或只写 checklist。其它门禁覆盖当前 Hexo `image.text` alt、link label/href/字符串 title、`processAllTokens` 只审计 content、显式 excerpt 的具体 DOM/恢复文本及 occurrence=`consumed`/`failed`，两条路径复用同一内部串断言覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 wrapper；无显式 excerpt 且无分隔符时，excerpt projection 必须与已保存 content projection 逐字相等。抛异常 `data.more` getter/setter 须配独立读/写计数，在 before/after/projectText 后均为 0。其余包括 `carrier.originalField(field)` fallback、真实 `Hexo#post.render` 中两个连续 heading-only/失败/PJ/`headerIds:false`/同一 children 引用/最终无 id/headerlink 与内部串审计，并同时断言每个 `_headingId` snapshot 无 `''` 和 `'-1'` key；两个连续 PJ 的单网格/双卡片/无额外 p wrapper及普通文字/空行中断、Marked options symbol 清理、显式/派生/无分隔符 projection、`dompurify: false`/identity 边界。纯 `new Marked()` 只测扩展基本行为/ownership/实际 duplicate fixture；Hexo heading/grid/after 与最终 DOM 契约必须走真实 `Hexo#post.render`。`data.description` 与 meta-description filter 的最终断言纳入完整 E2E；所有门禁均须在最终状态实际执行并记录结果。

## Conventions & Gotchas

- 提交信息：Conventional Commits + 中文描述（仓库历史惯例）
- 无 .editorconfig / prettier / eslint：跟随既有文件风格
- 主题功能开发有以「设计文档 → 计划 → 实施」流程的先例（正式文档在 `docs/` 根目录；`.superpowers/` 仅存本地复核报告）
- 标记解释器迁移的搜索按范围分层：运行时代码/内容只检查 `source/` 与 `themes/arknights/scripts/`，文档契约只检查本文件与 `docs/2026-09-24-marker-interpreter-*.md`；不能把迁移表中的历史 `[&]` 示例或旧 `raw-html` 删除目标误报为运行路径。
- 标记解释器协议固定为严格 `[#]<NAME>{...}`：handler 整枚原子失败，完整保护 `pre`/`textarea`/`script`/`style` raw-text；只有实际 block `html` token 是 raw provenance 事实，普通 inline HTML 间文本仍按 Markdown 解释，旧 `[&]` AI/PJ 语法与旧 filters 已硬切换删除
- `pipeline.js` 与 `meta-description.js` 共享普通 CommonJS 缓存中的同一个 `defaultPipeline`；`register.js` 是唯一自动注册副作用入口，同一 context + pipeline 注册幂等，不同 pipeline 必须显式报重复错误
- carrier token、wrapper、NUL 与 PJ sentinel 只能短暂存在于构建期，最终 DOM、投影、搜索与日志必须清零；无法证明位置或审计失败时，以 `carrier.originalField(field)` 为权威做字段级安全回退
- `data.more` 永不作为 marker 输入且 pipeline 不读不写；Hexo excerpt priority 10 从 after 9 已物化 content 派生，Alert/Spoiler/Terms 保持独立语法与过滤器
- 每个任务只提交本任务跟踪文件，使用 Conventional Commits 中文描述；`.temp/`、`public/`、日志和 `.superpowers/` 不入库，不执行 `git push`
- 涉及结构 / 命令 / 约定变更时，同步更新本文件
