# 专业术语链接功能设计

日期：2026-08-14
状态：已确认
范围：hexo-theme-arknights 主题（blog 仓库内）

## 目标

文章正文中的专业术语自动替换为蓝色链接，点击跳转到外部权威来源（维基百科、官方文档等）。术语表在主题配置中维护。

## 需求

- 术语 → 链接映射在配置中定义（`_config.arknights.yml` 的 `terms.list`）
- 正文中所有出现的术语都替换为链接
- 跳过代码块、行内代码、已有链接内的文本
- 链接蓝色（主题高亮色）+ 下划线，hover 变浅
- 外部链接 `target="_blank"` 新标签打开
- 加密文章（`password`/`encrypt`）不处理
- 词表为空时不生效，无需额外开关

## 实现方案：构建时替换（Hexo 过滤器）

### 1. 配置（站点 `_config.arknights.yml`）

```yaml
terms:
  list:
    - term: "ESP32"
      url: "https://docs.espressif.com/projects/esp-idf/zh_CN/latest/"
    - term: "XOR"
      url: "https://en.wikipedia.org/wiki/XOR_gate"
```

主题 `_config.yml` 中预置空 `terms: { list: [] }`。

### 2. 过滤器 `scripts/filters/terms.js`

注册 `hexo.extend.filter.register('after_post_render', ...)`：

1. 加密文章跳过：`data.encrypt || data.password` 存在时不处理
2. 对 `data.content` 与 `data.excerpt` 分别处理
3. 切分保护：按 `<pre>`、`</pre>`、`<code>`、`</code>`、`<a`、`</a>` 拆分为片段，仅处理非代码、非链接片段内的文本
4. 替换：词表按 term 长度降序，转义正则后以 alternation 合成单一正则；每个词带字母数字边界 `(?<![A-Za-z0-9_-])` / `(?![A-Za-z0-9_-])`（不使用 lookbehind 时改为捕获组写法，兼容 Node 18）；`String.replace` 回调直接生成 `<a class="term-link" href="{url}" target="_blank" rel="noopener noreferrer">{term}</a>`
5. 一次扫描完成，替换产物不再被后续匹配（天然防嵌套）

### 3. 样式 `css/_page/post/post.styl`（或 base.styl）

```styl
.term-link
  color var(--theme-highlight)
  text-decoration underline
  &:hover
    color var(--theme-text-hover)
```

### 4. 验证

- 构建后检查文章页 HTML：术语已变为链接、代码块与行内代码内无链接、已有链接内无嵌套链接
- 首页摘要同样生效（`after_post_render` 作用于 excerpt）
- 边界用例：`ESP32` 不命中 `ESP32-S3`；中文术语正常替换；术语在已有链接文字中不替换

## 风险与边界

- `after_post_render` 与主题其它过滤器（footnotes/pandoc/lightgallery）的处理顺序：terms 只替换纯文本片段，顺序影响可忽略
- 加密文章 content 在 post render 阶段的形态需实测确认；实现时以 `encrypt/password` 字段直接跳过，规避风险
- 英文术语大小写敏感，按词表原文精确匹配（如 `ESP32` 不匹配 `esp32`），如需要可后续加大小写不敏感选项
- hover 色实际为 `var(--theme-text-hover)`（主题全局惯例 #000），与「hover 变浅」措辞有偏差，保持主题一致为有意取舍
