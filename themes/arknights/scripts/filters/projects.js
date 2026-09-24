/* global hexo */

'use strict'

const { prepareProjectsPage, transformProjectsPage } = require('./projects-core')

// before 阶段编码整行标记，避免 GFM 自动把链接与图片路径吞入 <a>；无效字段也保留原文
hexo.extend.filter.register('before_post_render', prepareProjectsPage, 5)

// after 阶段先于核心 excerpt 与 terms（默认 10），在 Markdown 已生成 HTML 后解除标记段落包装
hexo.extend.filter.register('after_post_render', transformProjectsPage, 5)
