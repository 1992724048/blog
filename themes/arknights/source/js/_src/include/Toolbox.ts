/// <reference path="common/base.ts" />

'use strict'

interface HighlightRange {
  start: number
  length: number
  color?: string
  text?: string
}

interface TextLayout {
  nodes: Text[]
  starts: number[]
  total: number
}

interface FavoriteItem {
  url: string
  title: string
  time: number
}

// 标注序列化：以正文文本节点的累计字符偏移（start + length）记录——<mark> 包裹不改变文本总量，
// 增删标注后同一偏移仍指向同一段文字；文章文本变化导致偏移漂移时按边界校验静默丢弃
class Toolbox {
  private static readonly EXCLUDED_SELECTOR = '.bottom-btn, #annotate-toolbar, #post-footer, #post-info, #reward, #comments, #paginator, script, style'
  private static readonly HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:'
  private static readonly FAVORITES_KEY = 'arknights:favorites'
  private static readonly ANNOTATE_COLOR_KEY = 'arknights:annotate-color'
  private static readonly ANNOTATE_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange']
  private static readonly COPIED_DELAY = 1200

  private pendingRange: Range | null = null

  private get toolbox(): HTMLElement | null {
    return document.querySelector('.toolbox')
  }

  private get toggleButton(): HTMLElement | null {
    return document.querySelector('#to-toolbox')
  }

  private get shareButton(): HTMLElement | null {
    return document.querySelector('.toolbox-share')
  }

  private get favoriteButton(): HTMLElement | null {
    return document.querySelector('.toolbox-favorite')
  }

  private get article(): HTMLElement | null {
    return document.querySelector('article')
  }

  private get annotateToolbar(): HTMLElement | null {
    return document.querySelector('#annotate-toolbar')
  }

  private get annotateButton(): HTMLElement | null {
    return document.querySelector('.toolbox-annotate')
  }

  private get colorButton(): HTMLElement | null {
    return document.querySelector('#annotate-toolbar .at-color')
  }

  private get colorPanel(): HTMLElement | null {
    return document.querySelector('#annotate-toolbar .at-colors')
  }

  private get copyButton(): HTMLElement | null {
    return document.querySelector('#annotate-toolbar .at-copy')
  }

  private get toolbarAnnotateButton(): HTMLButtonElement | null {
    return document.querySelector('#annotate-toolbar .at-annotate') as HTMLButtonElement | null
  }

  private get toolbarClearButton(): HTMLButtonElement | null {
    return document.querySelector('#annotate-toolbar .at-clear') as HTMLButtonElement | null
  }

  private read = (key: string): string | null => {
    try {
      return window.localStorage.getItem(key)
    } catch (e) {
      return null
    }
  }

  private write = (key: string, value: string | null): void => {
    try {
      if (value === null) {
        window.localStorage.removeItem(key)
      } else {
        window.localStorage.setItem(key, value)
      }
    } catch (e) {}
  }

  private highlightKey = (): string => {
    return Toolbox.HIGHLIGHT_KEY_PREFIX + window.location.pathname
  }

  private applyState = (open: boolean): void => {
    const toolbox = this.toolbox
    if (toolbox !== null) {
      toolbox.classList.toggle('toolbox-open', open)
    }
    const toggle = this.toggleButton
    if (toggle !== null) {
      toggle.setAttribute('aria-expanded', String(open))
    }
    if (open) {
      document.addEventListener('click', this.onOutsideClick)
    } else {
      document.removeEventListener('click', this.onOutsideClick)
      this.pendingRange = null
    }
  }

  public toggle = (): void => {
    const toolbox = this.toolbox
    this.applyState(toolbox === null || !toolbox.classList.contains('toolbox-open'))
  }

  private onOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target !== null && typeof target.closest === 'function' && target.closest('.toolbox') !== null) {
      return
    }
    this.applyState(false)
  }

  private onKeyup = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.applyState(false)
      this.hideToolbar()
    }
  }

  private isAnnotating = (): boolean => {
    return document.body.classList.contains('annotating')
  }

  private setAnnotating = (on: boolean): void => {
    document.body.classList.toggle('annotating', on)
    this.syncAnnotateButton()
    if (!on) {
      this.hideToolbar()
      this.pendingRange = null
    }
  }

  private syncAnnotateButton = (): void => {
    const button = this.annotateButton
    if (button === null) {
      return
    }
    const on = this.isAnnotating()
    button.classList.toggle('active', on)
    button.setAttribute('aria-pressed', String(on))
  }

  private showToolbar = (range: Range): void => {
    const toolbar = this.annotateToolbar
    if (toolbar === null) {
      return
    }
    this.placeToolbar(range)
    toolbar.classList.add('open')
    toolbar.setAttribute('aria-hidden', 'false')
    this.updateToolbarButtons(range)
  }

  private hideToolbar = (): void => {
    const toolbar = this.annotateToolbar
    if (toolbar === null) {
      return
    }
    toolbar.classList.remove('open')
    toolbar.setAttribute('aria-hidden', 'true')
    this.closeColors()
  }

  private placeToolbar = (range: Range): void => {
    const toolbar = this.annotateToolbar
    if (toolbar === null || typeof range.getBoundingClientRect !== 'function') {
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      return
    }
    const margin = 8
    const gap = 6
    const width = toolbar.offsetWidth
    const height = toolbar.offsetHeight
    let left = rect.left + rect.width / 2 - width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    let top = rect.top - height - gap
    if (top < margin) {
      top = Math.min(rect.bottom + gap, window.innerHeight - height - margin)
    }
    toolbar.style.left = left + 'px'
    toolbar.style.top = top + 'px'
  }

  private onSelectionChange = (): void => {
    if (!this.isAnnotating()) {
      return
    }
    const range = this.selectionRange()
    if (range === null) {
      this.hideToolbar()
      return
    }
    this.showToolbar(range)
  }

  private closeColors = (): void => {
    const panel = this.colorPanel
    if (panel !== null) {
      panel.classList.remove('open')
    }
  }

  private onDocumentClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    if (target.closest('.at-color') !== null || target.closest('.at-colors') !== null) {
      return
    }
    this.closeColors()
  }

  private onToolbarClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function' || target.closest('#annotate-toolbar') === null) {
      return
    }
    const colorOption = target.closest('.at-color-opt')
    if (colorOption !== null) {
      this.setAnnotateColor(colorOption.getAttribute('data-color'))
      return
    }
    const button = target.closest('.at-btn')
    if (button === null) {
      return
    }
    if (button.classList.contains('at-annotate')) {
      this.annotateSelection()
    } else if (button.classList.contains('at-clear')) {
      this.clearSelectionHighlights()
    } else if (button.classList.contains('at-copy')) {
      this.copySelection()
    } else if (button.classList.contains('at-search')) {
      this.searchSelection()
    } else if (button.classList.contains('at-color')) {
      this.toggleColors()
    }
  }

  // 选区覆盖判定：选区被高亮全覆盖 → 无从新增（annotate 禁用）；不含高亮 → 无从清除（clear 禁用）
  private updateToolbarButtons = (range: Range): void => {
    const article = this.article
    const annotate = this.toolbarAnnotateButton
    const clear = this.toolbarClearButton
    if (article === null || annotate === null || clear === null) {
      return
    }
    const layout = this.textLayout(article)
    const start = this.boundaryOffset(range.startContainer, range.startOffset, layout)
    const end = this.boundaryOffset(range.endContainer, range.endOffset, layout)
    if (start === null || end === null || start >= end) {
      annotate.disabled = true
      clear.disabled = true
      return
    }
    const state = this.selectionGaps(article, layout, start, end)
    annotate.disabled = state.gaps.length === 0
    clear.disabled = !state.hasHighlight
  }

  private refreshToolbarButtons = (): void => {
    const toolbar = this.annotateToolbar
    if (toolbar === null || !toolbar.classList.contains('open') || !this.isAnnotating()) {
      return
    }
    const range = this.selectionRange()
    if (range === null) {
      this.hideToolbar()
      return
    }
    this.updateToolbarButtons(range)
  }

  // 选区 [start,end) 内「未被既有高亮覆盖」的补齐段落；hasHighlight = 选区含既有高亮
  private selectionGaps = (article: HTMLElement, layout: TextLayout, start: number, end: number): { gaps: { start: number; end: number }[]; hasHighlight: boolean } => {
    const covered: { start: number; end: number }[] = []
    article.querySelectorAll('.hl-mark').forEach((mark) => {
      const offsets = this.markOffsets(mark, layout)
      if (offsets !== null && offsets.start < end && start < offsets.end) {
        covered.push({ start: Math.max(offsets.start, start), end: Math.min(offsets.end, end) })
      }
    })
    covered.sort((left, right) => left.start - right.start)
    const gaps: { start: number; end: number }[] = []
    let cursor = start
    covered.forEach((item) => {
      if (item.start > cursor) {
        gaps.push({ start: cursor, end: item.start })
      }
      cursor = Math.max(cursor, item.end)
    })
    if (cursor < end) {
      gaps.push({ start: cursor, end: end })
    }
    return { gaps: gaps, hasHighlight: covered.length !== 0 }
  }

  private isAnnotatable = (node: Node): boolean => {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
    const article = this.article
    if (element === null || article === null || !article.contains(element)) {
      return false
    }
    return element.closest(Toolbox.EXCLUDED_SELECTOR) === null
  }

  private textLayout = (root: HTMLElement): TextLayout => {
    const nodes: Text[] = []
    const starts: number[] = []
    let total = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (!this.isAnnotatable(node)) {
        continue
      }
      nodes.push(node as Text)
      starts.push(total)
      total += (node as Text).data.length
    }
    return { nodes: nodes, starts: starts, total: total }
  }

  private firstTextFrom = (node: Node, layout: TextLayout): Text | null => {
    for (const text of layout.nodes) {
      if (text === node) {
        return text
      }
      const relation = node.compareDocumentPosition(text)
      if ((relation & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) !== 0) {
        return text
      }
    }
    return null
  }

  private firstTextAfter = (element: Element, layout: TextLayout): Text | null => {
    for (const text of layout.nodes) {
      const relation = element.compareDocumentPosition(text)
      if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0) {
        return text
      }
    }
    return null
  }

  private boundaryOffset = (node: Node, offset: number, layout: TextLayout): number | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const index = layout.nodes.indexOf(node as Text)
      if (index < 0) {
        return null
      }
      return layout.starts[index] + Math.min(offset, (node as Text).data.length)
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null
    }
    const element = node as Element
    const found = offset < element.childNodes.length
      ? this.firstTextFrom(element.childNodes[offset], layout)
      : this.firstTextAfter(element, layout)
    return found === null ? layout.total : layout.starts[layout.nodes.indexOf(found)]
  }

  // 起边界取 position 之后的首个文本（避免范围横跨其间元素，如被排除的 #post-info）；
  // 止边界取 position 之前的末个文本（避免吞入其后元素的标签结构，产生嵌套 mark）
  private pointAt = (layout: TextLayout, position: number, forward: boolean): { node: Text; offset: number } | null => {
    if (layout.nodes.length === 0) {
      return null
    }
    if (forward) {
      for (let index = 0; index < layout.nodes.length; index++) {
        const end = layout.starts[index] + layout.nodes[index].data.length
        if (position < end) {
          return { node: layout.nodes[index], offset: position - layout.starts[index] }
        }
      }
      const last = layout.nodes.length - 1
      return { node: layout.nodes[last], offset: layout.nodes[last].data.length }
    }
    for (let index = layout.nodes.length - 1; index >= 0; index--) {
      const start = layout.starts[index]
      if (position > start) {
        return { node: layout.nodes[index], offset: Math.min(position - start, layout.nodes[index].data.length) }
      }
    }
    return { node: layout.nodes[0], offset: 0 }
  }

  private rangeFromOffsets = (layout: TextLayout, start: number, end: number): Range | null => {
    if (start < 0 || end > layout.total || start >= end) {
      return null
    }
    const startPoint = this.pointAt(layout, start, true)
    const endPoint = this.pointAt(layout, end, false)
    if (startPoint === null || endPoint === null) {
      return null
    }
    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    return range
  }

  private wrapRange = (range: Range, color: string, text?: string): boolean => {
    const mark = document.createElement('mark')
    mark.className = 'hl-mark'
    mark.setAttribute('data-color', color)
    if (text !== undefined) {
      mark.setAttribute('data-text', text)
    }
    try {
      range.surroundContents(mark)
      return true
    } catch (e) {
      try {
        mark.appendChild(range.extractContents())
        range.insertNode(mark)
        return true
      } catch (error) {
        return false
      }
    }
  }

  private unwrapMark = (mark: Element): void => {
    const parent = mark.parentNode
    if (parent === null) {
      return
    }
    while (mark.firstChild !== null) {
      parent.insertBefore(mark.firstChild, mark)
    }
    parent.removeChild(mark)
    parent.normalize()
  }

  private removeAllMarks = (article: HTMLElement): void => {
    article.querySelectorAll('.hl-mark').forEach((mark) => this.unwrapMark(mark))
  }

  private markOffsets = (mark: Element, layout: TextLayout): { start: number; end: number } | null => {
    const range = document.createRange()
    range.selectNodeContents(mark)
    const start = this.boundaryOffset(range.startContainer, range.startOffset, layout)
    const end = this.boundaryOffset(range.endContainer, range.endOffset, layout)
    if (start === null || end === null || start >= end) {
      return null
    }
    return { start: start, end: end }
  }

  private selectionRange = (): Range | null => {
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }
    const range = selection.getRangeAt(0)
    if (!this.isRangeAnnotatable(range)) {
      return null
    }
    return range
  }

  private isRangeAnnotatable = (range: Range): boolean => {
    return !range.collapsed && this.isAnnotatable(range.startContainer) && this.isAnnotatable(range.endContainer)
  }

  private onMouseDown = (event: MouseEvent): void => {
    this.pendingRange = null
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    const inToolbar = target.closest('#annotate-toolbar') !== null
    if (!inToolbar && target.closest('.toolbox-annotate') === null) {
      return
    }
    if (inToolbar) {
      // 阻止默认（选区折叠 / 焦点转移）：否则 selectionchange 会在 click 之前隐藏工具条、丢失目标选区
      event.preventDefault()
    }
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }
    this.pendingRange = selection.getRangeAt(0).cloneRange()
  }

  public annotate = (): void => {
    const on = !this.isAnnotating()
    this.setAnnotating(on)
    if (on) {
      const range = this.resolveRange()
      if (range !== null) {
        this.highlightRange(range)
      }
    }
    this.pendingRange = null
    this.applyState(false)
  }

  // 只补选区中未标注的部分（按当前色新增）；既有高亮保持原样（不重着色、不删除、不合并）
  private highlightRange = (range: Range): void => {
    const article = this.article
    if (article === null) {
      return
    }
    const layout = this.textLayout(article)
    const start = this.boundaryOffset(range.startContainer, range.startOffset, layout)
    const end = this.boundaryOffset(range.endContainer, range.endOffset, layout)
    if (start === null || end === null || start >= end) {
      return
    }
    const gaps = this.selectionGaps(article, layout, start, end).gaps
    let wrapped = false
    gaps.forEach((gap) => {
      const gapRange = this.rangeFromOffsets(this.textLayout(article), gap.start, gap.end)
      if (gapRange !== null) {
        const text = gapRange.toString()
        if (this.wrapRange(gapRange, this.currentAnnotateColor(), text)) {
          wrapped = true
        }
      }
    })
    if (wrapped) {
      this.persistHighlights()
    }
  }

  private onMarkClick = (event: MouseEvent): void => {
    // 标注模式下点击标注文字不移除——由工具栏「清除」按钮操作
    if (this.isAnnotating()) {
      return
    }
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    const mark = target.closest('.hl-mark')
    if (mark === null || !this.isAnnotatable(mark)) {
      return
    }
    this.unwrapMark(mark)
    this.persistHighlights()
  }

  private resolveRange = (): Range | null => {
    const current = this.selectionRange()
    if (current !== null) {
      return current
    }
    if (this.pendingRange !== null && this.isRangeAnnotatable(this.pendingRange)) {
      return this.pendingRange
    }
    return null
  }

  private annotateSelection = (): void => {
    const range = this.resolveRange()
    if (range !== null) {
      this.highlightRange(range)
    }
    this.refreshToolbarButtons()
  }

  private clearSelectionHighlights = (): void => {
    const range = this.resolveRange()
    const article = this.article
    if (range === null || article === null) {
      this.refreshToolbarButtons()
      return
    }
    const layout = this.textLayout(article)
    const start = this.boundaryOffset(range.startContainer, range.startOffset, layout)
    const end = this.boundaryOffset(range.endContainer, range.endOffset, layout)
    if (start === null || end === null || start >= end) {
      this.refreshToolbarButtons()
      return
    }
    const affected: { start: number; end: number; color: string }[] = []
    article.querySelectorAll('.hl-mark').forEach((mark) => {
      const offsets = this.markOffsets(mark, layout)
      if (offsets !== null && offsets.start < end && start < offsets.end) {
        affected.push({ start: offsets.start, end: offsets.end, color: this.markColor(mark) })
        this.unwrapMark(mark)
      }
    })
    affected.forEach((item) => {
      const beforeEnd = Math.min(item.end, start)
      const afterStart = Math.max(item.start, end)
      if (beforeEnd > item.start) {
        const before = this.rangeFromOffsets(this.textLayout(article), item.start, beforeEnd)
        if (before !== null) {
          this.wrapRange(before, item.color)
        }
      }
      if (item.end > afterStart) {
        const after = this.rangeFromOffsets(this.textLayout(article), afterStart, item.end)
        if (after !== null) {
          this.wrapRange(after, item.color)
        }
      }
    })
    if (affected.length !== 0) {
      this.persistHighlights()
    }
    this.refreshToolbarButtons()
  }

  private copySelection = (): void => {
    const range = this.resolveRange()
    if (range === null) {
      return
    }
    const text = range.toString()
    if (text.length === 0) {
      return
    }
    const complete = (): void => {
      const button = this.copyButton
      if (button === null) {
        return
      }
      button.classList.add('copied')
      setTimeout(() => button.classList.remove('copied'), Toolbox.COPIED_DELAY)
    }
    const fallback = (): void => {
      if (typeof document.execCommand === 'function' && document.execCommand('copy')) {
        complete()
      }
    }
    try {
      navigator.clipboard.writeText(text).then(complete).catch(fallback)
    } catch (e) {
      fallback()
    }
  }

  private searchSelection = (): void => {
    const range = this.resolveRange()
    if (range === null) {
      return
    }
    const keyword = range.toString().trim()
    if (keyword.length === 0) {
      return
    }
    const search = (window as any).searchWithKeyword
    if (typeof search === 'function') {
      search(keyword)
    }
    this.hideToolbar()
  }

  private toggleColors = (): void => {
    const panel = this.colorPanel
    if (panel !== null) {
      panel.classList.toggle('open')
    }
  }

  private setAnnotateColor = (color: string | null): void => {
    if (color === null || !Toolbox.ANNOTATE_COLORS.includes(color)) {
      return
    }
    this.write(Toolbox.ANNOTATE_COLOR_KEY, color)
    this.applyAnnotateColor()
  }

  private currentAnnotateColor = (): string => {
    const stored = this.read(Toolbox.ANNOTATE_COLOR_KEY)
    return stored !== null && Toolbox.ANNOTATE_COLORS.includes(stored) ? stored : 'yellow'
  }

  private applyAnnotateColor = (): void => {
    const color = this.currentAnnotateColor()
    const button = this.colorButton
    if (button !== null) {
      button.setAttribute('data-color', color)
    }
    document.querySelectorAll('#annotate-toolbar .at-color-opt').forEach((option) => {
      option.classList.toggle('active', option.getAttribute('data-color') === color)
    })
  }

  private markColor = (mark: Element): string => {
    const color = mark.getAttribute('data-color')
    return color !== null && Toolbox.ANNOTATE_COLORS.includes(color) ? color : 'yellow'
  }

  private persistHighlights = (): void => {
    const article = this.article
    if (article === null) {
      return
    }
    const layout = this.textLayout(article)
    const ranges: HighlightRange[] = []
    article.querySelectorAll('.hl-mark').forEach((mark) => {
      const offsets = this.markOffsets(mark, layout)
      if (offsets !== null) {
        const color = this.markColor(mark)
        const text = mark.getAttribute('data-text') || undefined
        const item: HighlightRange = { start: offsets.start, length: offsets.end - offsets.start }
        if (color !== 'yellow') {
          item.color = color
        }
        if (text !== undefined) {
          item.text = text
        }
        ranges.push(item)
      }
    })
    ranges.sort((left, right) => left.start - right.start)
    this.write(this.highlightKey(), ranges.length === 0 ? null : JSON.stringify({ version: 1, ranges: ranges }))
  }

  private restoreHighlights = (): void => {
    const article = this.article
    const stored = this.read(this.highlightKey())
    if (article === null || stored === null) {
      return
    }
    const ranges: HighlightRange[] = []
    try {
      const parsed: unknown = JSON.parse(stored)
      const container = parsed as { ranges?: unknown }
      if (parsed !== null && typeof parsed === 'object' && Array.isArray(container.ranges)) {
        container.ranges.forEach((item) => {
          const range = item as Partial<HighlightRange>
          if (typeof range.start === 'number' && typeof range.length === 'number' && range.start >= 0 && range.length > 0) {
            const color = typeof range.color === 'string' && Toolbox.ANNOTATE_COLORS.includes(range.color) ? range.color : 'yellow'
            const text = typeof range.text === 'string' ? range.text : undefined
            ranges.push({ start: range.start, length: range.length, color: color, text: text })
          }
        })
      }
    } catch (e) {
      return
    }
    if (ranges.length === 0) {
      return
    }
    this.removeAllMarks(article)
    ranges.sort((left, right) => left.start - right.start)
    ranges.forEach((item) => {
      const range = this.rangeFromOffsets(this.textLayout(article), item.start, item.start + item.length)
      if (range !== null) {
        this.wrapRange(range, item.color ?? 'yellow', item.text)
      }
    })
  }

  public share = (): void => {
    const data = { title: document.title, url: window.location.href }
    if (typeof navigator.share === 'function') {
      try {
        navigator.share(data).then(() => this.applyState(false)).catch(() => {})
      } catch (e) {}
      return
    }
    this.copyShareUrl(data.url)
  }

  private copyShareUrl = (url: string): void => {
    const button = this.shareButton
    const complete = (): void => {
      if (button === null) {
        return
      }
      button.classList.add('copied')
      setTimeout(() => {
        button.classList.remove('copied')
        this.applyState(false)
      }, Toolbox.COPIED_DELAY)
    }
    try {
      navigator.clipboard.writeText(url).then(complete).catch(() => {})
    } catch (e) {}
  }

  private readFavorites = (): Record<string, FavoriteItem> => {
    const stored = this.read(Toolbox.FAVORITES_KEY)
    if (stored === null) {
      return {}
    }
    try {
      const parsed: unknown = JSON.parse(stored)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {}
      }
      return parsed as Record<string, FavoriteItem>
    } catch (e) {
      return {}
    }
  }

  private applyFavoriteState = (): void => {
    const button = this.favoriteButton
    if (button === null) {
      return
    }
    const saved = this.readFavorites()[window.location.pathname] !== undefined
    button.classList.toggle('saved', saved)
    button.setAttribute('aria-pressed', String(saved))
    const label = button.getAttribute(saved ? 'data-label-saved' : 'data-label-default')
    if (label !== null) {
      button.setAttribute('title', label)
      button.setAttribute('aria-label', label)
    }
  }

  public favorite = (): void => {
    const favorites = this.readFavorites()
    const path = window.location.pathname
    if (favorites[path] !== undefined) {
      delete favorites[path]
    } else {
      favorites[path] = { url: window.location.href, title: document.title, time: Date.now() }
    }
    this.write(Toolbox.FAVORITES_KEY, Object.keys(favorites).length === 0 ? null : JSON.stringify(favorites))
    this.applyFavoriteState()
  }

  private onPjaxSuccess = (): void => {
    this.applyState(false)
    this.hideToolbar()
    this.restoreHighlights()
    this.applyFavoriteState()
    this.syncAnnotateButton()
    this.applyAnnotateColor()
  }

  constructor() {
    document.addEventListener('keyup', this.onKeyup)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('click', this.onMarkClick)
    document.addEventListener('click', this.onToolbarClick)
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('selectionchange', this.onSelectionChange)
    document.addEventListener('pjax:success', this.onPjaxSuccess)
    document.addEventListener('pjax:send', this.hideToolbar)
    const main = document.querySelector('main')
    if (main !== null) {
      main.addEventListener('scroll', this.hideToolbar, { passive: true })
    }
    this.restoreHighlights()
    this.applyFavoriteState()
    this.syncAnnotateButton()
    this.applyAnnotateColor()
  }
}

var toolbox = new Toolbox()
