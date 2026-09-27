/// <reference path="ToolboxPersistence.ts" />
/// <reference path="ToolboxStatusLease.ts" />

'use strict'

// 分享与 .copied 反馈：唯一 status 写入者为共享 lease，自有唯一一次性 timer
namespace ToolboxModules {
  export interface ShareController { share(): void }

  export function createShareController(closeToolbox: () => void): ShareController {
    const getShareButton = (): HTMLElement | null => document.querySelector('.toolbox-share')

    const copyShareUrl = (url: string): void => {
      const button = getShareButton()
      const complete = (): void => {
        if (button === null) {
          return
        }
        claimStatus(button.dataset.labelCopied || '', { owner: 'share' })
        button.classList.add('copied')
        setTimeout(() => {
          button.classList.remove('copied')
          closeToolbox()
        }, COPIED_DELAY)
      }
      try {
        navigator.clipboard.writeText(url).then(complete).catch(() => {})
      } catch (e) {}
    }

    return {
      share: (): void => {
        const data = { title: document.title, url: window.location.href }
        if (typeof navigator.share === 'function') {
          try {
            navigator.share(data).then(() => closeToolbox()).catch(() => {})
          } catch (e) {}
          return
        }
        copyShareUrl(data.url)
      }
    }
  }
}
