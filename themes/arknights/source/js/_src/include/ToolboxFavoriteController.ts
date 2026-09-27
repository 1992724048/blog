/// <reference path="ToolboxPersistence.ts" />
/// <reference path="ToolboxStatusLease.ts" />

'use strict'

// 收藏与 .saved 反馈：不创建任何 UI timer，status 写入经共享 lease
namespace ToolboxModules {
  export interface FavoriteController { favorite(): void; restore(): void }

  export function createFavoriteController(): FavoriteController {
    const getFavoriteButton = (): HTMLElement | null => document.querySelector('.toolbox-favorite')

    const readFavorites = (): Record<string, ToolboxModules.FavoriteItem> =>
      ToolboxModules.parseFavorites(ToolboxModules.readRaw(ToolboxModules.FAVORITES_KEY))

    const applyFavoriteState = (): void => {
      const button = getFavoriteButton()
      if (button === null) {
        return
      }
      const saved = readFavorites()[window.location.pathname] !== undefined
      button.classList.toggle('saved', saved)
      button.setAttribute('aria-pressed', String(saved))
      const label = button.getAttribute(saved ? 'data-label-saved' : 'data-label-default')
      if (label !== null) {
        button.setAttribute('title', label)
        button.setAttribute('aria-label', label)
      }
    }

    return {
      favorite: (): void => {
        const favorites = readFavorites()
        const path = window.location.pathname
        const wasSaved = favorites[path] !== undefined
        if (wasSaved) {
          delete favorites[path]
        } else {
          favorites[path] = { url: window.location.href, title: document.title, time: Date.now() }
        }
        ToolboxModules.writeRaw(ToolboxModules.FAVORITES_KEY,
          Object.keys(favorites).length === 0 ? null : ToolboxModules.serializeFavorites(favorites))
        applyFavoriteState()
        const button = getFavoriteButton()
        if (button !== null) {
          claimStatus(wasSaved
            ? button.dataset.labelRemovedStatus || ''
            : button.dataset.labelSavedStatus || '', { owner: 'favorite' })
        }
      },
      restore: applyFavoriteState
    }
  }
}
