/// <reference path="common/base.ts" />

'use strict'

interface FavoriteItem {
  url: string
  title: string
  time: number
}

interface HighlightRange {
  start: number
  length: number
  color?: string
  text?: string
}

interface HighlightData {
  version: number
  ranges: HighlightRange[]
}

class DataPage {
  private static readonly FAVORITES_KEY = 'arknights:favorites'
  private static readonly HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:'
  private static readonly ANNOTATE_COLORS: Record<string, string> = {
    yellow: '#fe2',
    green: '#7ee787',
    blue: '#79c0ff',
    pink: '#ffb3d1',
    orange: '#ffb757'
  }

  private container: HTMLElement | null = null

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

  private readFavorites = (): Record<string, FavoriteItem> => {
    const stored = this.read(DataPage.FAVORITES_KEY)
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

  private readAllHighlights = (): Record<string, HighlightData> => {
    const result: Record<string, HighlightData> = {}
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key !== null && key.startsWith(DataPage.HIGHLIGHT_KEY_PREFIX)) {
          const pathname = key.slice(DataPage.HIGHLIGHT_KEY_PREFIX.length)
          const stored = this.read(key)
          if (stored !== null) {
            try {
              const parsed: unknown = JSON.parse(stored)
              if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const data = parsed as HighlightData
                if (Array.isArray(data.ranges) && data.ranges.length > 0) {
                  result[pathname] = data
                }
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
    return result
  }

  private formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  private colorDot = (color: string): string => {
    const bg = DataPage.ANNOTATE_COLORS[color] || DataPage.ANNOTATE_COLORS.yellow
    return `<span class="dp-color-dot" style="background-color:${bg}"></span>`
  }

  private escapeHtml = (text: string): string => {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  private renderEmpty = (): string => {
    return `
      <div class="dp-empty">
        <p>暂无数据</p>
        <p class="dp-empty-hint">在文章页面使用底部工具箱的收藏和标注功能，数据将显示在这里。</p>
      </div>
    `
  }

  private renderFavorites = (favorites: Record<string, FavoriteItem>): string => {
    const entries = Object.entries(favorites)
    if (entries.length === 0) {
      return ''
    }
    entries.sort((a, b) => b[1].time - a[1].time)
    const items = entries.map(([path, item]) => {
      return `
        <div class="dp-item dp-fav-item" data-path="${this.escapeHtml(path)}">
          <label class="dp-check">
            <input type="checkbox" class="dp-select" data-type="fav" data-path="${this.escapeHtml(path)}">
            <span class="dp-checkmark"></span>
          </label>
          <a class="dp-fav-link" href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener">
            <span class="dp-fav-title">${this.escapeHtml(item.title)}</span>
            <span class="dp-fav-path">${this.escapeHtml(path)}</span>
          </a>
          <span class="dp-fav-time">${this.formatDate(item.time)}</span>
          <button class="dp-btn dp-btn-delete" data-type="fav" data-path="${this.escapeHtml(path)}" title="删除">✕</button>
        </div>
      `
    }).join('')
    return `
      <div class="dp-section">
        <div class="dp-section-header">
          <h3>收藏 (${entries.length})</h3>
          <div class="dp-section-actions">
            <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="clear-favs">清除全部</button>
          </div>
        </div>
        <div class="dp-list">${items}</div>
      </div>
    `
  }

  private renderHighlights = (highlights: Record<string, HighlightData>): string => {
    const paths = Object.keys(highlights)
    if (paths.length === 0) {
      return ''
    }
    paths.sort()
    let totalCount = 0
    const sections = paths.map(path => {
      const data = highlights[path]
      totalCount += data.ranges.length
      const items = data.ranges.map((range, index) => {
        const color = range.color || 'yellow'
        const text = range.text ? this.escapeHtml(range.text) : '(无文本)'
        return `
          <div class="dp-item dp-hl-item" data-path="${this.escapeHtml(path)}" data-index="${index}">
            <label class="dp-check">
              <input type="checkbox" class="dp-select" data-type="hl" data-path="${this.escapeHtml(path)}" data-index="${index}">
              <span class="dp-checkmark"></span>
            </label>
            <span class="dp-hl-text">${this.colorDot(color)}<span class="dp-hl-content">${text}</span></span>
            <button class="dp-btn dp-btn-delete" data-type="hl" data-path="${this.escapeHtml(path)}" data-index="${index}" title="删除">✕</button>
          </div>
        `
      }).join('')
      return `
        <div class="dp-hl-group">
          <div class="dp-hl-group-header">
            <label class="dp-check">
              <input type="checkbox" class="dp-select-group" data-path="${this.escapeHtml(path)}">
              <span class="dp-checkmark"></span>
            </label>
            <a class="dp-hl-group-link" href="${this.escapeHtml(path)}" target="_blank" rel="noopener">${this.escapeHtml(path)}</a>
            <span class="dp-hl-group-count">${data.ranges.length} 条标注</span>
            <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="clear-hl-group" data-path="${this.escapeHtml(path)}">清除</button>
          </div>
          <div class="dp-list">${items}</div>
        </div>
      `
    }).join('')
    return `
      <div class="dp-section">
        <div class="dp-section-header">
          <h3>标注 (${totalCount})</h3>
          <div class="dp-section-actions">
            <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="clear-all-hl">清除全部</button>
          </div>
        </div>
        ${sections}
      </div>
    `
  }

  private renderToolbar = (favCount: number, hlCount: number): string => {
    if (favCount === 0 && hlCount === 0) {
      return ''
    }
    return `
      <div class="dp-toolbar">
        <label class="dp-check dp-check-all">
          <input type="checkbox" class="dp-select-all">
          <span class="dp-checkmark"></span>
          全选
        </label>
        <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="delete-selected" disabled>删除选中</button>
        <button class="dp-btn dp-btn-sm" data-action="export">导出数据</button>
      </div>
    `
  }

  private render = (): void => {
    if (this.container === null) {
      return
    }
    const favorites = this.readFavorites()
    const highlights = this.readAllHighlights()
    const favCount = Object.keys(favorites).length
    const hlCount = Object.values(highlights).reduce((sum, d) => sum + d.ranges.length, 0)

    if (favCount === 0 && hlCount === 0) {
      this.container.innerHTML = this.renderEmpty()
      return
    }

    this.container.innerHTML =
      this.renderToolbar(favCount, hlCount) +
      this.renderFavorites(favorites) +
      this.renderHighlights(highlights)
  }

  private deleteFavorite = (path: string): void => {
    const favorites = this.readFavorites()
    delete favorites[path]
    this.write(DataPage.FAVORITES_KEY, Object.keys(favorites).length === 0 ? null : JSON.stringify(favorites))
  }

  private deleteHighlight = (path: string, index: number): void => {
    const key = DataPage.HIGHLIGHT_KEY_PREFIX + path
    const stored = this.read(key)
    if (stored === null) {
      return
    }
    try {
      const data = JSON.parse(stored) as HighlightData
      if (Array.isArray(data.ranges)) {
        data.ranges.splice(index, 1)
        if (data.ranges.length === 0) {
          this.write(key, null)
        } else {
          this.write(key, JSON.stringify(data))
        }
      }
    } catch (e) {}
  }

  private clearHighlightsGroup = (path: string): void => {
    this.write(DataPage.HIGHLIGHT_KEY_PREFIX + path, null)
  }

  private clearAllHighlights = (): void => {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key !== null && key.startsWith(DataPage.HIGHLIGHT_KEY_PREFIX)) {
        keys.push(key)
      }
    }
    keys.forEach(key => this.write(key, null))
  }

  private clearAllFavorites = (): void => {
    this.write(DataPage.FAVORITES_KEY, null)
  }

  private exportData = (): void => {
    const data = {
      favorites: this.readFavorites(),
      highlights: this.readAllHighlights(),
      exportTime: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arknights-data-${this.formatDate(Date.now())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  private getSelectedItems = (): { favs: string[]; hls: { path: string; index: number }[] } => {
    const favs: string[] = []
    const hls: { path: string; index: number }[] = []
    if (this.container === null) {
      return { favs, hls }
    }
    this.container.querySelectorAll('.dp-select:checked').forEach((cb) => {
      const el = cb as HTMLInputElement
      const type = el.getAttribute('data-type')
      const path = el.getAttribute('data-path')
      if (path === null) {
        return
      }
      if (type === 'fav') {
        favs.push(path)
      } else if (type === 'hl') {
        const index = parseInt(el.getAttribute('data-index') || '0', 10)
        hls.push({ path, index })
      }
    })
    return { favs, hls }
  }

  private updateDeleteButton = (): void => {
    if (this.container === null) {
      return
    }
    const btn = this.container.querySelector('[data-action="delete-selected"]') as HTMLButtonElement | null
    if (btn !== null) {
      const selected = this.container.querySelectorAll('.dp-select:checked').length
      btn.disabled = selected === 0
    }
  }

  private updateGroupCheckboxes = (): void => {
    if (this.container === null) {
      return
    }
    this.container.querySelectorAll('.dp-hl-group').forEach((group) => {
      const path = group.getAttribute('data-path')
      if (path === null) {
        return
      }
      const groupCb = group.querySelector('.dp-select-group') as HTMLInputElement | null
      const items = group.querySelectorAll('.dp-select[data-type="hl"]')
      const allChecked = items.length > 0 && Array.from(items).every(cb => (cb as HTMLInputElement).checked)
      if (groupCb !== null) {
        groupCb.checked = allChecked
      }
    })
  }

  private updateSelectAll = (): void => {
    if (this.container === null) {
      return
    }
    const selectAll = this.container.querySelector('.dp-select-all') as HTMLInputElement | null
    if (selectAll === null) {
      return
    }
    const all = this.container.querySelectorAll('.dp-select')
    const checked = this.container.querySelectorAll('.dp-select:checked')
    selectAll.checked = all.length > 0 && all.length === checked.length
  }

  private onContainerClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || this.container === null) {
      return
    }

    const deleteBtn = target.closest('.dp-btn-delete') as HTMLElement | null
    if (deleteBtn !== null) {
      const type = deleteBtn.getAttribute('data-type')
      const path = deleteBtn.getAttribute('data-path')
      if (path === null) {
        return
      }
      if (type === 'fav') {
        this.deleteFavorite(path)
      } else if (type === 'hl') {
        const index = parseInt(deleteBtn.getAttribute('data-index') || '0', 10)
        this.deleteHighlight(path, index)
      }
      this.render()
      return
    }

    const actionBtn = target.closest('[data-action]') as HTMLElement | null
    if (actionBtn !== null) {
      const action = actionBtn.getAttribute('data-action')
      if (action === 'clear-favs') {
        this.clearAllFavorites()
        this.render()
      } else if (action === 'clear-all-hl') {
        this.clearAllHighlights()
        this.render()
      } else if (action === 'clear-hl-group') {
        const path = actionBtn.getAttribute('data-path')
        if (path !== null) {
          this.clearHighlightsGroup(path)
          this.render()
        }
      } else if (action === 'delete-selected') {
        const { favs, hls } = this.getSelectedItems()
        favs.forEach(p => this.deleteFavorite(p))
        hls.forEach(h => this.deleteHighlight(h.path, h.index))
        this.render()
      } else if (action === 'export') {
        this.exportData()
      }
      return
    }
  }

  private onContainerChange = (event: Event): void => {
    const target = event.target as Element | null
    if (target === null || this.container === null) {
      return
    }

    if (target.classList.contains('dp-select-all')) {
      const checked = (target as HTMLInputElement).checked
      this.container.querySelectorAll('.dp-select').forEach(cb => {
        (cb as HTMLInputElement).checked = checked
      })
      this.updateDeleteButton()
      this.updateGroupCheckboxes()
      return
    }

    if (target.classList.contains('dp-select-group')) {
      const group = target.closest('.dp-hl-group')
      if (group !== null) {
        const checked = (target as HTMLInputElement).checked
        group.querySelectorAll('.dp-select').forEach(cb => {
          (cb as HTMLInputElement).checked = checked
        })
      }
      this.updateDeleteButton()
      this.updateSelectAll()
      return
    }

    if (target.classList.contains('dp-select')) {
      this.updateDeleteButton()
      this.updateGroupCheckboxes()
      this.updateSelectAll()
      return
    }
  }

  constructor() {
    this.container = document.querySelector('#data-page')
    if (this.container === null) {
      return
    }
    this.render()
    this.container.addEventListener('click', this.onContainerClick)
    this.container.addEventListener('change', this.onContainerChange)
    document.addEventListener('pjax:success', () => {
      this.container = document.querySelector('#data-page')
      if (this.container !== null) {
        this.render()
        this.container.addEventListener('click', this.onContainerClick)
        this.container.addEventListener('change', this.onContainerChange)
      }
    })
  }
}

new DataPage()
