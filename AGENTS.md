# 遂沫'Blog（Hexo 静态博客）

## Overview

- 个人技术博客：https://issuimo.com（GitHub Pages 托管）
- 技术栈：Hexo 8.1.2 + 主题 `themes/arknights`（Pug 模板 + Stylus + marked），npm 管理
- 内容方向：嵌入式（ESP32 / IDF）、C++ / 安全 / 逆向、技术随笔

## Architecture

### 主题配置与构建产物

- 主题配置分层：Hexo 8 自动加载根级 `_config.arknights.yml`，与 `themes/arknights/_config.yml` 深合并、前者覆盖后者。**改主题配置项一律改根级文件**，不改主题内默认值。
- 主题脚本读合并后的 `hexo.theme.config`；个别脚本直读根级 `hexo.config.theme_config`。
- 主题为 vendored 普通文件（非 git submodule），含大量本地定制；同步上游时注意冲突，勿整体替换。
- 主题 JS 源码是 TypeScript：`_src/**/*.ts` → 产物 `arknights.js`（`source/js/_src/tsconfig.json`）；`_src/search/search.ts` → 产物 `search.js`（独立 tsconfig）。
- tsc 已入主题 devDependencies（`typescript@^5`；TS 7 已移除 `outFile`，不兼容本 tsconfig）；编译：主题目录 `npm install` 后 `npm run build`。
- 主题功能脚本在 `themes/arknights/scripts/`（filters / generator）：术语自动链接（`filters/terms.js`，词表在根级配置 `terms.list`；每篇文章按正文首次出现编号，重复术语复用同号，全局索引仅作稳定锚点）、文章加密、搜索、`build_time`、`minify`、Alert、遮盖、`meta-description.js`。
- 本地自定义样式集中在 `themes/arknights/source/css/_custom/custom.styl`；`arknights.styl` 末尾以 `@import '_custom/*'` 通配导入。

## Source Tree

```
_config.yml                   # Hexo 主配置（permalink、theme；deploy 为空）
_config.arknights.yml         # 主题配置（实际生效）
scaffolds/                    # hexo new 模板（post / page / draft）
source/_posts/                # 文章
source/projects/index.md      # 项目列表（严格 [#]>Project| 标记）
source/images/<文章名>/        # 文章配图
tags/                         # 三处 tag 目录（根 / source / scripts）均已删除：旧 hide / code-editor / link-card / admonition 四个 Hexo tag 无替代语法，内容工具一律走 markers，勿再新增 tag 入口
themes/arknights/             # 主题（含本地定制：_custom 样式 / scripts / _src TS）
├── source/js/_src/include/environment.d.ts # SnapDOM 与工具控制器全局类型
├── source/js/_src/include/ScreenshotControl.ts # 正文截图、资源等待、root/lease 串行与 generation 取消
├── source/js/_src/include/BgmControl.ts       # 唯一 audio 的单一状态机、operation/lifecycle 双 generation
├── source/js/_src/include/ToolboxStatusLease.ts # 全站 .toolbox-status 唯一写入口
├── source/js/_src/include/Toolbox.ts          # 工具箱开合、标注/分享/收藏、扇形布局纯函数 layoutFan()
├── source/js/_src/include/ProjectTooltip.ts   # 项目卡悬停 CSS 变量绑定
├── source/js/_src/include/Comments.ts          # Giscus 加载与 pjax:complete 重载的唯一入口
├── source/js/_src/include/GiscusManager.ts     # giscus client.js 注入、配置读取/主题映射/超时重试
├── source/lib/snapdom/3.1.1/                  # SnapDOM classic vendor 与 MIT LICENSE
themes/arknights/scripts/
├── filters/encryption-policy.js    # 文章加密与搜索共用的无副作用判定策略
├── filters/html-segments.js        # 遮盖与术语共用的 HTML 分段器（text / tag / element）
├── embed/
│   ├── platform.js                # <URL> 独占行 → GitHub / Bilibili 识别与格式化（叶子，零依赖）
│   ├── cache.js                   # sidecar 读写 + TTL + live store（两阶段唯一数据通道）
│   ├── fetch.js                   # before_generate 5 的异步编排：扫描 + 去重 + 缓存跳过 + 并发池 + 硬预算
│   ├── render.js                  # after_post_render 11 的同步渲染：唯一锚点段落 → 卡片 / 纯链接降级卡
│   ├── register.js                # embed 子树唯一副作用入口（无导出 API）
│   └── providers/{github.js, bilibili.js}  # 两平台元数据抓取（失败只 resolve 不抛）
└── generator/search/{snapshot.js, database.js, generator.js}  # sidecar 捕获/校验/自愈、条目组装、接线
themes/arknights/scripts/markers/
├── lexer.js                  # 原始 Markdown candidate、保护区、block-only header 判定与逐字 range
├── parser.js                 # 严格 [#]NAME| header、竖线分隔符字段语法与绑定前校验
├── token.js                  # opaque token、store-owned occurrence/context/state
├── carrier.js                # 单次 render carrier 与 data.markdown descriptor bridge
├── marked-extension.js       # 本地 Marked block 扩展 token provenance、ownership 与 renderer 委托
├── registry.js               # 五类 handler 注册与分发
├── pipeline.js               # before_post_render 4 / after_post_render 9、审计、恢复、投影、fail-closed
├── pipeline/                 # 子模块零互引，共享值由 pipeline.js 显式注入
│   ├── materialize.js        # 字段物化、handler 派发与 Project 网格包裹
│   ├── failure.js            # 恢复层 LF 化与失败序列化的唯一实现
│   ├── project-grid.js       # 连续 Project 的 sourceRange 邻接分组
│   └── projection.js         # 投影合并与 <!-- more --> 派生
├── register.js               # markers 子树唯一 Hexo 自动注册入口
└── handlers/
    ├── ai.js / project.js / alerts.js / editor.js / link-card.js
    ├── link-card-style.js    # LinkCard 受限 CSS declaration/value grammar 与规范序列化
    ├── link-card-style-root-url.js # RootUrl 单次 percent-decode 路径授权策略
    └── shared/               # 五 handler 共用的单一事实来源叶子
        ├── result.js         # failure(code, reason) 冻结失败形状
        ├── html.js           # escapeHtmlText
        ├── fields.js         # readFields(input, handlerName)
        └── url.js            # isSafeUrl（Project 与 LinkCard 同一安全策略）
.github/workflows/deploy.yml  # CI：构建并部署 GitHub Pages
.temp/                        # 本地探针（gitignore，不提交、不随仓库分发）
.superpowers/                 # 本地任务 brief/report（不提交）
```

## Build & Deploy

- 安装依赖：`npm install`
- 本地预览：`npm run server`（= `hexo server`）
- 生成静态文件：`npm run build`（= `hexo generate`，输出 `public/`）
- 清理：`npm run clean`（= `hexo clean`）
- **CI（`.github/workflows/deploy.yml`）**：`setup-node` 启用 `cache: npm`（按 `package-lock.json` 缓存 `~/.npm`，安装仍是 `npm install --no-frozen-lockfile`），构建命令为 `npx hexo generate --bail`（带失败门禁，主题 Stylus 资产渲染失败时不会静默产出 0 字节 CSS），`TZ=Asia/Shanghai` 由 step 级 `env` 提供
- **不要用 `npm run deploy`**（`deploy.type` 未配置）：实际部署 = push `main` → GitHub Actions 构建 → `public/` 推送至 `pages` 分支 → GitHub Pages
- **`hexo generate` 不会因只改了被 `@import` 的 `.styl` 而重渲染主题 CSS**：先 `npm run clean`，再 `npx hexo generate --bail`；构建命令串行执行，不得并发