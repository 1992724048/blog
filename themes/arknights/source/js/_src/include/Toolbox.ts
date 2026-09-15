/// <reference path="common/base.ts" />

'use strict'

interface HighlightRange {
  start: number
  length: number
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
  private static readonly EXCLUDED_SELECTOR = '.bottom-btn, #post-footer, #post-info, #reward, #comments, #paginator, script, style'
  private static readonly HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:'
  private static readonly FAVORITES_KEY = 'arknights:favorites'
  private static readonly SHARE_COPIED_DELAY = 1200

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
    }
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

  // position 恰在文本节点末尾时归属下一节点（offset 0），避免构造的范围横跨其间元素（如被排除的 #post-info）
  private pointAt = (layout: TextLayout, position: number): { node: Text; offset: number } | null => {
    for (let index = 0; index < layout.nodes.length; index++) {
      const end = layout.starts[index] + layout.nodes[index].data.length
      if (position < end) {
        return { node: layout.nodes[index], offset: position - layout.starts[index] }
      }
    }
    const last = layout.nodes.length - 1
    if (last < 0) {
      return null
    }
    return { node: layout.nodes[last], offset: layout.nodes[last].data.length }
  }

  private rangeFromOffsets = (layout: TextLayout, start: number, end: number): Range | null => {
    if (start < 0 || end > layout.total || start >= end) {
      return null
    }
    const startPoint = this.pointAt(layout, start)
    const endPoint = this.pointAt(layout, end)
    if (startPoint === null || endPoint === null) {
      return null
    }
    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    return range
  }

  private wrapRange = (range: Range): boolean => {
    const mark = document.createElement('mark')
    mark.className = 'hl-mark'
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
    if (target === null || typeof target.closest !== 'function' || target.closest('.toolbox-annotate') === null) {
      return
    }
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }
    this.pendingRange = selection.getRangeAt(0).cloneRange()
  }

  public annotate = (): void => {
    const current = this.selectionRange()
    const pending = this.pendingRange
    this.pendingRange = null
    if (current !== null) {
      this.highlightRange(current)
      return
    }
    if (pending !== null) {
      if (this.isRangeAnnotatable(pending)) {
        this.highlightRange(pending)
      }
      return
    }
    this.clearHighlights()
  }

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
    const intersecting: Element[] = []
    article.querySelectorAll('.hl-mark').forEach((mark) => {
      const offsets = this.markOffsets(mark, layout)
      if (offsets !== null && offsets.start < end && start < offsets.end) {
        intersecting.push(mark)
      }
    })
    intersecting.forEach((mark) => this.unwrapMark(mark))
    const refreshed = this.rangeFromOffsets(this.textLayout(article), start, end)
    if (refreshed !== null && this.wrapRange(refreshed)) {
      this.persistHighlights()
    }
  }

  private onMarkClick = (event: MouseEvent): void => {
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

  private clearHighlights = (): void => {
    const article = this.article
    if (article === null || article.querySelectorAll('.hl-mark').length === 0) {
      return
    }
    this.removeAllMarks(article)
    this.persistHighlights()
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
        ranges.push({ start: offsets.start, length: offsets.end - offsets.start })
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
            ranges.push({ start: range.start, length: range.length })
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
        this.wrapRange(range)
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
      }, Toolbox.SHARE_COPIED_DELAY)
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
    this.restoreHighlights()
    this.applyFavoriteState()
  }

  constructor() {
    document.addEventListener('keyup', this.onKeyup)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('click', this.onMarkClick)
    document.addEventListener('pjax:success', this.onPjaxSuccess)
    this.restoreHighlights()
    this.applyFavoriteState()
  }
}

var toolbox = new Toolbox()
