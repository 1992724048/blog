/// <reference path="ToolboxAnnotationController.ts" />
/// <reference path="ToolboxShareController.ts" />
/// <reference path="ToolboxFavoriteController.ts" />

'use strict'

// 工具箱 facade：只拥有自身 DOM 状态、data-action 委托、外点/Escape 与既有 pjax 重置，
// 标注 / 分享 / 收藏分别下沉到同层 controller
class Toolbox {
  private annotation: ToolboxModules.AnnotationController
  private shareController: ToolboxModules.ShareController
  private favoriteController: ToolboxModules.FavoriteController

  private get toolbox(): HTMLElement | null {
    return document.querySelector('.toolbox')
  }

  private get toggleButton(): HTMLElement | null {
    return document.querySelector('#to-toolbox')
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
      window.bgmControl?.clearStatus()
    } else {
      document.removeEventListener('click', this.onOutsideClick)
      this.annotation.dismissPendingSelection()
    }
  }

  public toggle = (): void => {
    const toolbox = this.toolbox
    this.applyState(toolbox === null || !toolbox.classList.contains('toolbox-open'))
  }

  private dispatchAction = (action: string): void => {
    switch (action) {
      case 'toolbox':
        this.toggle()
        break
      case 'annotate':
        this.annotate()
        break
      case 'share':
        this.share()
        break
      case 'favorite':
        this.favorite()
        break
      case 'screenshot': {
        const capture = window.screenshotControl?.capture()
        if (capture !== undefined) {
          void Promise.resolve(capture).catch(() => undefined)
        }
        this.applyState(false)
        break
      }
      case 'bgm': {
        const toggle = window.bgmControl?.toggle()
        if (toggle !== undefined) {
          void Promise.resolve(toggle).catch(() => undefined)
        }
        this.applyState(false)
        break
      }
    }
  }

  private onToolboxClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    const button = target.closest<HTMLElement>('#to-toolbox, .toolbox-item')
    if (button === null) {
      return
    }
    const action = button.getAttribute('data-action')
    if (action !== null) {
      this.dispatchAction(action)
    }
  }

  private onOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target !== null && typeof target.closest === 'function' && target.closest('.toolbox') !== null) {
      return
    }
    this.applyState(false)
  }

  // 色板自动关闭的唯一 owner：命中色板本体或选项时放行，其余目标下沉到标注 controller
  private onDocumentClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    if (target.closest('.at-color') !== null || target.closest('.at-colors') !== null) {
      return
    }
    this.annotation.closeColors()
  }

  private onKeyup = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.applyState(false)
      this.annotation.hideToolbar()
    }
  }

  private onPjaxSuccess = (): void => {
    this.applyState(false)
    this.annotation.restore()
    this.favoriteController.restore()
  }

  private onPjaxSend = (): void => {
    this.applyState(false)
    this.annotation.hideToolbar()
  }

  public annotate = (): void => {
    this.annotation.annotate()
    this.applyState(false)
  }

  public share = (): void => {
    this.shareController.share()
  }

  public favorite = (): void => {
    this.favoriteController.favorite()
  }

  constructor() {
    this.annotation = ToolboxModules.createAnnotationController()
    this.shareController = ToolboxModules.createShareController(() => this.applyState(false))
    this.favoriteController = ToolboxModules.createFavoriteController()
    document.addEventListener('keyup', this.onKeyup)
    document.addEventListener('click', this.onToolboxClick)
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('pjax:success', this.onPjaxSuccess)
    document.addEventListener('pjax:send', this.onPjaxSend)
    this.annotation.restore()
    this.favoriteController.restore()
  }
}

var toolbox = new Toolbox()
Object.assign(window, { toolbox: toolbox })
