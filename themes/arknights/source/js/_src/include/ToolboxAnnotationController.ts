/// <reference path="common/base.ts" />
/// <reference path="ToolboxPersistence.ts" />

'use strict'

interface TextLayout {
  nodes: Text[]
  starts: number[]
  total: number
}

namespace ToolboxModules {
  export const EXCLUDED_SELECTOR = '.bottom-btn, #annotate-toolbar, #post-footer, #post-info, #reward, #comments, #paginator, script, style'

  export interface AnnotationController {
    annotate(): void
    isAnnotating(): boolean
    restore(): void
    closeColors(): void
    hideToolbar(): void
    dismissPendingSelection(): void
    refreshToolbarButtons(): void
  }

  // 标注序列化：以正文文本节点的累计字符偏移（start + length）记录——<mark> 包裹不改变文本总量，
  // 增删标注后同一偏移仍指向同一段文字；文章文本变化导致偏移漂移时按边界校验静默丢弃
  export function createAnnotationController(): AnnotationController {
    let pendingRange: Range | null = null

    const getArticle = (): HTMLElement | null => document.querySelector('article')
    const getToolbar = (): HTMLElement | null => document.querySelector('#annotate-toolbar')
    const getAnnotateButton = (): HTMLElement | null => document.querySelector('.toolbox-annotate')
    const toolbarNode = (selector: string): HTMLElement | null => document.querySelector('#annotate-toolbar ' + selector)

    const isAnnotating = (): boolean => document.body.classList.contains('annotating')

    const syncAnnotateButton = (): void => {
      const button = getAnnotateButton()
      if (button === null) return
      const on = isAnnotating()
      button.classList.toggle('active', on)
      button.setAttribute('aria-pressed', String(on))
    }

    const setAnnotating = (on: boolean): void => {
      document.body.classList.toggle('annotating', on)
      syncAnnotateButton()
      if (on) return
      hideToolbar()
      pendingRange = null
    }

    const showToolbar = (range: Range): void => {
      const toolbar = getToolbar()
      if (toolbar === null) return
      placeToolbar(range)
      toolbar.classList.add('open')
      toolbar.setAttribute('aria-hidden', 'false')
      updateToolbarButtons(range)
    }

    const hideToolbar = (): void => {
      const toolbar = getToolbar()
      if (toolbar === null) return
      toolbar.classList.remove('open')
      toolbar.setAttribute('aria-hidden', 'true')
      closeColors()
    }

    const placeToolbar = (range: Range): void => {
      const toolbar = getToolbar()
      if (toolbar === null || typeof range.getBoundingClientRect !== 'function') return
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const margin = 8
      const gap = 6
      const width = toolbar.offsetWidth
      const height = toolbar.offsetHeight
      let left = rect.left + rect.width / 2 - width / 2
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
      let top = rect.top - height - gap
      if (top < margin) top = Math.min(rect.bottom + gap, window.innerHeight - height - margin)
      toolbar.style.left = left + 'px'
      toolbar.style.top = top + 'px'
    }

    const onSelectionChange = (): void => {
      if (!isAnnotating()) return
      const range = selectionRange()
      if (range === null) return hideToolbar()
      showToolbar(range)
    }

    const closeColors = (): void => {
      const panel = toolbarNode('.at-colors')
      if (panel !== null) panel.classList.remove('open')
    }

    const toolbarActions: { [name: string]: () => void } = {
      'at-annotate': () => annotateSelection(),
      'at-clear': () => clearSelectionHighlights(),
      'at-copy': () => copySelection(),
      'at-search': () => searchSelection(),
      'at-color': () => toggleColors()
    }

    const onToolbarClick = (event: MouseEvent): void => {
      const target = event.target as Element | null
      if (target === null || typeof target.closest !== 'function' || target.closest('#annotate-toolbar') === null) return
      const colorOption = target.closest('.at-color-opt')
      if (colorOption !== null) return setAnnotateColor(colorOption.getAttribute('data-color'))
      const button = target.closest('.at-btn')
      if (button === null) return
      for (const name of Array.from(button.classList)) {
        const action = toolbarActions[name]
        if (action !== undefined) return action()
      }
    }

    // 选区覆盖判定：选区被高亮全覆盖 → 无从新增（annotate 禁用）；不含高亮 → 无从清除（clear 禁用）
    const updateToolbarButtons = (range: Range): void => {
      const article = getArticle()
      const annotate = toolbarNode('.at-annotate') as HTMLButtonElement | null
      const clear = toolbarNode('.at-clear') as HTMLButtonElement | null
      if (article === null || annotate === null || clear === null) return
      const layout = textLayout(article)
      const start = boundaryOffset(range.startContainer, range.startOffset, layout)
      const end = boundaryOffset(range.endContainer, range.endOffset, layout)
      const state = start === null || end === null || start >= end ? null : selectionGaps(article, layout, start, end)
      annotate.disabled = state === null || state.gaps.length === 0
      clear.disabled = state === null || !state.hasHighlight
    }

    const refreshToolbarButtons = (): void => {
      const toolbar = getToolbar()
      if (toolbar === null || !toolbar.classList.contains('open') || !isAnnotating()) return
      const range = selectionRange()
      if (range === null) hideToolbar()
      else updateToolbarButtons(range)
    }

    // 选区 [start,end) 内「未被既有高亮覆盖」的补齐段落；hasHighlight = 选区含既有高亮
    const selectionGaps = (article: HTMLElement, layout: TextLayout, start: number, end: number): { gaps: { start: number; end: number }[]; hasHighlight: boolean } => {
      const covered = Array.from(article.querySelectorAll('.hl-mark'))
        .map((mark) => markOffsets(mark, layout))
        .filter((offsets): offsets is { start: number; end: number } =>
          offsets !== null && offsets.start < end && start < offsets.end)
        .map((offsets) => ({ start: Math.max(offsets.start, start), end: Math.min(offsets.end, end) }))
        .sort((left, right) => left.start - right.start)
      const gaps: { start: number; end: number }[] = []
      let cursor = start
      covered.forEach((item) => {
        if (item.start > cursor) gaps.push({ start: cursor, end: item.start })
        cursor = Math.max(cursor, item.end)
      })
      if (cursor < end) gaps.push({ start: cursor, end: end })
      return { gaps: gaps, hasHighlight: covered.length !== 0 }
    }

    const isAnnotatable = (node: Node): boolean => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
      const article = getArticle()
      if (element === null || article === null || !article.contains(element)) return false
      return element.closest(EXCLUDED_SELECTOR) === null
    }

    const textLayout = (root: HTMLElement): TextLayout => {
      const nodes: Text[] = []
      const starts: number[] = []
      let total = 0
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!isAnnotatable(node)) continue
        nodes.push(node as Text)
        starts.push(total)
        total += (node as Text).data.length
      }
      return { nodes: nodes, starts: starts, total: total }
    }

    // 'from' 取 pivot 自身、被包含或其后的首个文本；'after' 取 pivot 之后且不含于 pivot 的首个文本
    const adjacentText = (pivot: Node, layout: TextLayout, mode: 'from' | 'after'): Text | null => {
      for (const text of layout.nodes) {
        if (mode === 'from' && text === pivot) return text
        const relation = pivot.compareDocumentPosition(text)
        const following = (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        const inside = (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0
        if (mode === 'from' ? following || inside : following && !inside) return text
      }
      return null
    }

    const boundaryOffset = (node: Node, offset: number, layout: TextLayout): number | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        const index = layout.nodes.indexOf(node as Text)
        if (index < 0) return null
        return layout.starts[index] + Math.min(offset, (node as Text).data.length)
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null
      const element = node as Element
      const found = offset < element.childNodes.length
        ? adjacentText(element.childNodes[offset], layout, 'from')
        : adjacentText(element, layout, 'after')
      return found === null ? layout.total : layout.starts[layout.nodes.indexOf(found)]
    }

    // 起边界取 position 之后的首个文本（避免范围横跨其间元素，如被排除的 #post-info）；
    // 止边界取 position 之前的末个文本（避免吞入其后元素的标签结构，产生嵌套 mark）
    const pointAt = (layout: TextLayout, position: number, forward: boolean): { node: Text; offset: number } | null => {
      if (layout.nodes.length === 0) return null
      const step = forward ? 1 : -1
      const limit = forward ? layout.nodes.length : -1
      for (let index = forward ? 0 : layout.nodes.length - 1; index !== limit; index += step) {
        const node = layout.nodes[index]
        const start = layout.starts[index]
        const end = start + node.data.length
        if (forward ? position < end : position > start) return { node, offset: Math.min(Math.max(position - start, 0), node.data.length) }
      }
      const edge = forward ? layout.nodes.length - 1 : 0
      return { node: layout.nodes[edge], offset: forward ? layout.nodes[edge].data.length : 0 }
    }

    const rangeFromOffsets = (layout: TextLayout, start: number, end: number): Range | null => {
      if (start < 0 || end > layout.total || start >= end) return null
      const startPoint = pointAt(layout, start, true)
      const endPoint = pointAt(layout, end, false)
      if (startPoint === null || endPoint === null) return null
      const range = document.createRange()
      range.setStart(startPoint.node, startPoint.offset)
      range.setEnd(endPoint.node, endPoint.offset)
      return range
    }

    const wrapRange = (range: Range, color: string, text?: string): boolean => {
      const mark = document.createElement('mark')
      mark.className = 'hl-mark'
      mark.setAttribute('data-color', color)
      if (text !== undefined) mark.setAttribute('data-text', text)
      try {
        range.surroundContents(mark)
        return true
      } catch (e) {}
      try {
        mark.appendChild(range.extractContents())
        range.insertNode(mark)
        return true
      } catch (error) {
        return false
      }
    }

    const unwrapMark = (mark: Element): void => {
      const parent = mark.parentNode
      if (parent === null) return
      while (mark.firstChild !== null) {
        parent.insertBefore(mark.firstChild, mark)
      }
      parent.removeChild(mark)
      parent.normalize()
    }

    const removeAllMarks = (article: HTMLElement): void => {
      article.querySelectorAll('.hl-mark').forEach((mark) => unwrapMark(mark))
    }

    const markOffsets = (mark: Element, layout: TextLayout): { start: number; end: number } | null => {
      const range = document.createRange()
      range.selectNodeContents(mark)
      const start = boundaryOffset(range.startContainer, range.startOffset, layout)
      const end = boundaryOffset(range.endContainer, range.endOffset, layout)
      if (start === null || end === null || start >= end) return null
      return { start: start, end: end }
    }

    const isRangeAnnotatable = (range: Range): boolean => !range.collapsed && isAnnotatable(range.startContainer) && isAnnotatable(range.endContainer)

    const selectionRange = (): Range | null => {
      const selection = window.getSelection()
      if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null
      const range = selection.getRangeAt(0)
      return isRangeAnnotatable(range) ? range : null
    }

    const onMouseDown = (event: MouseEvent): void => {
      pendingRange = null
      const target = event.target as Element | null
      if (target === null || typeof target.closest !== 'function') return
      const inToolbar = target.closest('#annotate-toolbar') !== null
      if (!inToolbar && target.closest('.toolbox-annotate') === null) return
      // 阻止默认（选区折叠 / 焦点转移）：否则 selectionchange 会在 click 之前隐藏工具条、丢失目标选区
      if (inToolbar) event.preventDefault()
      const selection = window.getSelection()
      if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return
      pendingRange = selection.getRangeAt(0).cloneRange()
    }

    const annotate = (): void => {
      const on = !isAnnotating()
      setAnnotating(on)
      if (on) {
        const range = resolveRange()
        if (range !== null) highlightRange(range)
      }
    }

    // 只补选区中未标注的部分（按当前色新增）；既有高亮保持原样（不重着色、不删除、不合并）
    const highlightRange = (range: Range): void => {
      const article = getArticle()
      if (article === null) return
      const layout = textLayout(article)
      const start = boundaryOffset(range.startContainer, range.startOffset, layout)
      const end = boundaryOffset(range.endContainer, range.endOffset, layout)
      const gaps = start === null || end === null || start >= end ? [] : selectionGaps(article, layout, start, end).gaps
      let wrapped = false
      gaps.forEach((gap) => {
        const gapRange = rangeFromOffsets(textLayout(article), gap.start, gap.end)
        if (gapRange !== null) {
          const text = gapRange.toString()
          if (wrapRange(gapRange, ToolboxModules.readAnnotateColor(), text)) wrapped = true
        }
      })
      if (wrapped) persistHighlights()
    }

    const onMarkClick = (event: MouseEvent): void => {
      // 标注模式下点击标注文字不移除——由工具栏「清除」按钮操作
      if (isAnnotating()) return
      const target = event.target as Element | null
      if (target === null || typeof target.closest !== 'function') return
      const mark = target.closest('.hl-mark')
      if (mark === null || !isAnnotatable(mark)) return
      unwrapMark(mark)
      persistHighlights()
    }

    const resolveRange = (): Range | null => {
      const current = selectionRange()
      if (current !== null) return current
      if (pendingRange !== null && isRangeAnnotatable(pendingRange)) return pendingRange
      return null
    }

    const annotateSelection = (): void => {
      const range = resolveRange()
      if (range !== null) highlightRange(range)
      refreshToolbarButtons()
    }

    const clearSelectionHighlights = (): void => {
      const range = resolveRange()
      const article = getArticle()
      if (range === null || article === null) return refreshToolbarButtons()
      const layout = textLayout(article)
      const start = boundaryOffset(range.startContainer, range.startOffset, layout)
      const end = boundaryOffset(range.endContainer, range.endOffset, layout)
      if (start === null || end === null || start >= end) return refreshToolbarButtons()
      const affected: { start: number; end: number; color: string }[] = []
      article.querySelectorAll('.hl-mark').forEach((mark) => {
        const offsets = markOffsets(mark, layout)
        if (offsets !== null && offsets.start < end && start < offsets.end) {
          affected.push({ start: offsets.start, end: offsets.end, color: markColor(mark) })
          unwrapMark(mark)
        }
      })
      affected.forEach((item) => {
        const beforeEnd = Math.min(item.end, start)
        const afterStart = Math.max(item.start, end)
        if (beforeEnd > item.start) {
          const before = rangeFromOffsets(textLayout(article), item.start, beforeEnd)
          if (before !== null) wrapRange(before, item.color)
        }
        if (item.end > afterStart) {
          const after = rangeFromOffsets(textLayout(article), afterStart, item.end)
          if (after !== null) wrapRange(after, item.color)
        }
      })
      if (affected.length !== 0) persistHighlights()
      refreshToolbarButtons()
    }

    const copySelection = (): void => {
      const range = resolveRange()
      if (range === null) return
      const text = range.toString()
      if (text.length === 0) return
      const complete = (): void => {
        const button = toolbarNode('.at-copy')
        if (button === null) return
        button.classList.add('copied')
        setTimeout(() => button.classList.remove('copied'), ToolboxModules.COPIED_DELAY)
      }
      const fallback = (): void => {
        if (typeof document.execCommand === 'function' && document.execCommand('copy')) complete()
      }
      try {
        navigator.clipboard.writeText(text).then(complete).catch(fallback)
      } catch (e) { fallback() }
    }

    const searchSelection = (): void => {
      const range = resolveRange()
      if (range === null) return
      const keyword = range.toString().trim()
      if (keyword.length === 0) return
      const search = (window as any).searchWithKeyword
      if (typeof search === 'function') search(keyword)
      hideToolbar()
    }

    const toggleColors = (): void => {
      const panel = toolbarNode('.at-colors')
      if (panel !== null) panel.classList.toggle('open')
    }

    const setAnnotateColor = (color: string | null): void => {
      if (color === null || !ToolboxModules.ANNOTATE_COLORS.includes(color)) return
      ToolboxModules.writeAnnotateColor(color)
      applyAnnotateColor()
    }

    const applyAnnotateColor = (): void => {
      const color = ToolboxModules.readAnnotateColor()
      const button = toolbarNode('.at-color')
      if (button !== null) button.setAttribute('data-color', color)
      document.querySelectorAll('#annotate-toolbar .at-color-opt').forEach((option) => {
        option.classList.toggle('active', option.getAttribute('data-color') === color)
      })
    }

    const markColor = (mark: Element): string => {
      const color = mark.getAttribute('data-color')
      return color !== null && ToolboxModules.ANNOTATE_COLORS.includes(color) ? color : 'yellow'
    }

    const persistHighlights = (): void => {
      const article = getArticle()
      if (article === null) return
      const layout = textLayout(article)
      const ranges: ToolboxModules.HighlightRecord[] = []
      article.querySelectorAll('.hl-mark').forEach((mark) => {
        const offsets = markOffsets(mark, layout)
        if (offsets !== null) {
          const item: ToolboxModules.HighlightRecord = { start: offsets.start, length: offsets.end - offsets.start }
          const color = markColor(mark)
          if (color !== 'yellow') item.color = color
          const text = mark.getAttribute('data-text') || undefined
          if (text !== undefined) item.text = text
          ranges.push(item)
        }
      })
      ranges.sort((left, right) => left.start - right.start)
      ToolboxModules.writeRaw(ToolboxModules.highlightKey(), ranges.length === 0 ? null : ToolboxModules.serializeHighlights(ranges))
    }

    const restoreHighlights = (): void => {
      const article = getArticle()
      const ranges = ToolboxModules.parseHighlights(ToolboxModules.readRaw(ToolboxModules.highlightKey()))
      if (article === null || ranges.length === 0) return
      removeAllMarks(article)
      ranges.sort((left, right) => left.start - right.start)
      ranges.forEach((item) => {
        const range = rangeFromOffsets(textLayout(article), item.start, item.start + item.length)
        if (range !== null) wrapRange(range, item.color ?? 'yellow', item.text)
      })
    }

    const restore = (): void => {
      hideToolbar()
      restoreHighlights()
      syncAnnotateButton()
      applyAnnotateColor()
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('click', onMarkClick)
    document.addEventListener('click', onToolbarClick)
    const main = document.querySelector('main')
    if (main !== null) main.addEventListener('scroll', hideToolbar, { passive: true })

    return {
      annotate,
      isAnnotating,
      restore,
      closeColors,
      hideToolbar,
      dismissPendingSelection: (): void => { pendingRange = null },
      refreshToolbarButtons
    }
  }
}
