# 遂沫'Blog（Hexo 静态博客）

## Overview

- 个人技术博客：https://issuimo.com（GitHub Pages 托管）
- 技术栈：Hexo 8.1.2 + 主题 `themes/arknights`（Pug 模板 + Stylus + marked），npm 管理
- 内容方向：嵌入式（ESP32 / IDF）、C++ / 安全 / 逆向、技术随笔

## Architecture

- **主题配置分层（关键）**：Hexo 8 自动加载根级 `_config.arknights.yml`，与 `themes/arknights/_config.yml` 深合并且前者覆盖后者——修改主题配置项一律改**根级**文件（不改主题内默认值）；主题脚本读取合并后的 `hexo.theme.config`（根级值已覆盖主题默认），个别脚本直读根级 `hexo.config.theme_config`
- **主题为 vendored 普通文件**（非 git submodule），含大量本地定制；同步上游主题时注意冲突，勿整体替换
- 主题功能脚本在 `themes/arknights/scripts/`（filters / tags / generator）：术语自动链接（`filters/terms.js`，词表在根级配置 `terms.list`）、文章加密、搜索、build_time 等
- 主题 JS 源码为 TypeScript：`themes/arknights/source/js/_src/**/*.ts` → 产物 `themes/arknights/source/js/arknights.js`；tsc 已装入主题 devDependencies（`typescript@^5`——TS 7 已移除 `outFile`，不兼容本 tsconfig），编译：主题目录 `npm install` 后 `npm run build`（= `tsc -p source/js/_src/tsconfig.json`）
- **本地自定义样式**：站点级样式集中在主题 `themes/arknights/source/css/_custom/custom.styl`（`arknights.styl` 末尾以 `@import '_custom/*'` 通配导入；原根级自定义样式已迁入并删除旧文件）
- **顶栏导航**：`header.topbar`（sticky，全断点高 46px）；≥1024px 菜单平铺 + 右侧常驻搜索框（框内含放大镜图标），≤1023px 折叠为 ☰ / 搜索图标按钮 + 栏下全宽下拉（菜单与搜索行互斥，锚在同一位置）。header 级状态类：`nav-open`（菜单展开）、`search-open`（搜索行展开），开合节流由 JS `readyRev` 控制；二级菜单展开态为 `.navBlock` / `.navSecond` 的 `.expanded`（由 `Header.ts` 切换）。交互在 `Header.ts`（菜单开合 / aria-expanded / 外点 / Escape）与 `search.js`（检索、弹层、移动端展开后聚焦）
- **缓存版本号**：修改主题 CSS 产物（`arknights.css`，即主题 Stylus 源）后递增 `themes/arknights/layout/includes/meta-data.pug` 中的 `cssVersion`；修改主题 JS 产物（`arknights.js` / `search.js`）后递增 `themes/arknights/layout/includes/js-data.pug` 中的 `jsVersion`——均用于避免 Cloudflare / 浏览器缓存旧版
- **构建时区**：CI 使用 `TZ=Asia/Shanghai`（否则文章 URL 日期差一天），本地构建同样注意
- **正文字体加载**：HarmonyOS Sans SC 经 jsDelivr 分包 CDN 按需加载（`harmonyos-sans-sc-webfont-splitted@1.1.0`，unicode-range 分包、版本锁死），`Regular.css` / `Bold.css` 链接在 `themes/arknights/layout/includes/meta-data.pug`；本地不再自托管全量字体（`source/fonts/` 已移除）

## Source Tree

```
_config.yml                   # Hexo 主配置（permalink、theme；deploy 为空）
_config.arknights.yml         # 主题配置（实际生效）
scaffolds/                    # hexo new 模板（post / page / draft）
source/_posts/                # 文章
source/images/<文章名>/        # 文章配图
themes/arknights/             # 主题（含本地定制：_custom 样式 / scripts / _src TS）
.github/workflows/deploy.yml  # CI：构建并部署 GitHub Pages
docs/superpowers/             # 设计与计划文档
```

## Build & Deploy

- 安装依赖：`npm install`
- 本地预览：`npm run server`（= `hexo server`）
- 生成静态文件：`npm run build`（= `hexo generate`，输出 `public/`）
- 清理：`npm run clean`（= `hexo clean`）
- **不要用 `npm run deploy`**（`deploy.type` 未配置）：实际部署 = push `main` → GitHub Actions 构建 → `public/` 推送至 `pages` 分支 → GitHub Pages

## Content Authoring

- 新建文章：`npx hexo new post "<标题>"`（模板见 `scaffolds/post.md`）
- frontmatter：`title / date / tags / categories`（参照现有文章）
- 图片：`post_asset_folder` 为 false，配图放 `source/images/<文章名>/`，引用语法示例：`![2026-03-04_01-09-33.bmp](/images/esp32-idf-clion/2026-03-04_01-09-33.jpg)`

## Verification

- 无自动化测试；改动后自测 = `npm run server` 本地预览相关页面
- 临时脚本 / 产物放 `.temp/`（已 gitignore），用完清理

## Conventions & Gotchas

- 提交信息：Conventional Commits + 中文描述（仓库历史惯例）
- 无 .editorconfig / prettier / eslint：跟随既有文件风格
- 主题功能开发有以「设计文档 → 计划 → 实施」流程的先例（见 `docs/superpowers/`）
- 涉及结构 / 命令 / 约定变更时，同步更新本文件
