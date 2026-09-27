'use strict'

// 标注/收藏/标注色的纯数据层：零 DOM 查询、零事件、零 timer
namespace ToolboxModules {
  export const HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:'
  export const FAVORITES_KEY = 'arknights:favorites'
  export const ANNOTATE_COLOR_KEY = 'arknights:annotate-color'
  export const ANNOTATE_COLORS: readonly string[] = ['yellow', 'green', 'blue', 'pink', 'orange']

  export interface HighlightRecord { start: number; length: number; color?: string; text?: string }
  export interface FavoriteItem { url: string; title: string; time: number }

  export function readRaw(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch (e) {
      return null
    }
  }

  export function writeRaw(key: string, value: string | null): void {
    try {
      if (value === null) {
        window.localStorage.removeItem(key)
      } else {
        window.localStorage.setItem(key, value)
      }
    } catch (e) {}
  }

  export function highlightKey(): string {
    return HIGHLIGHT_KEY_PREFIX + window.location.pathname
  }

  export function parseHighlights(stored: string | null): HighlightRecord[] {
    if (stored === null) {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(stored)
      const container = parsed as { ranges?: unknown }
      if (parsed === null || typeof parsed !== 'object' || !Array.isArray(container.ranges)) {
        return []
      }
      const ranges: HighlightRecord[] = []
      container.ranges.forEach((item) => {
        const range = item as Partial<HighlightRecord>
        if (typeof range.start === 'number' && typeof range.length === 'number' && range.start >= 0 && range.length > 0) {
          const color = typeof range.color === 'string' && ANNOTATE_COLORS.includes(range.color) ? range.color : 'yellow'
          const text = typeof range.text === 'string' ? range.text : undefined
          ranges.push({ start: range.start, length: range.length, color: color, text: text })
        }
      })
      return ranges
    } catch (e) {
      return []
    }
  }

  export function serializeHighlights(records: HighlightRecord[]): string {
    return JSON.stringify({ version: 1, ranges: records })
  }

  export function parseFavorites(stored: string | null): Record<string, FavoriteItem> {
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

  export function serializeFavorites(records: Record<string, FavoriteItem>): string {
    return JSON.stringify(records)
  }

  export function readAnnotateColor(): string {
    const stored = readRaw(ANNOTATE_COLOR_KEY)
    return stored !== null && ANNOTATE_COLORS.includes(stored) ? stored : 'yellow'
  }

  export function writeAnnotateColor(color: string | null): void {
    writeRaw(ANNOTATE_COLOR_KEY, color)
  }
}
