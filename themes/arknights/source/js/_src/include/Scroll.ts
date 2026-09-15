/// <reference path="common/base.ts" />

'use strict'

class Scroll {
  private scrolling: number = 0
  private getingtop: boolean = false
  private visible: boolean = false
  private totop: HTMLElement

  public scrolltop = () => {
    getElement('main').scroll({ top: 0, left: 0, behavior: 'smooth' })
    this.totop.style.opacity = '0'
    this.getingtop = true
    setTimeout(() => this.totop.style.display = 'none', 300)
  }

  private totopChange = (top: number) => {
    if (top < -200) {
      this.totop.style.display = ''
      this.visible = true
      setTimeout(() => {
        if (this.visible) {
          this.totop.style.opacity = '1'
        }
      }, 300)
    } else {
      this.totop.style.opacity = '0'
      this.visible = false
      setTimeout(() => {
        if (!this.visible) {
          this.totop.style.display = 'none'
        }
      }, 300)
    }
  }

  private onScroll = () => {
    try {
      const nowheight: number = getElement('article').getBoundingClientRect().top
      if (nowheight > 0) {
        return
      }
      ++this.scrolling
      setTimeout(() => {
        if (!--this.scrolling) {
          this.getingtop = false
        }
      }, 100)
      if (!this.getingtop) {
        this.totopChange(nowheight)
      }
    } catch (e) {}
  }

  private setHTML = () => {
    try {
      this.visible = false
      this.totop = getElement('#to-top')
      this.setListener()
    } catch (e) {}
  }

  /**
   * used for `supScroll` and `footNoteScroll` functions
   */
  private setListener = () => {
    getElement('#post-content').addEventListener('click', this.supScroll)
    getElement('#post-content').addEventListener('click', this.termLinkScroll)
    getElement('#footnotes').addEventListener('click', this.footNoteScroll)
  }

  private supScroll = (event: Event) => {
    const target = event.target as HTMLAnchorElement
    const targetParent = getParent(target)

    if (targetParent?.tagName === 'SUP') {
      event.preventDefault()
      const hash = target.href.split('/').pop()?.slice(1) || ''
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
  }

  private footNoteScroll = (event: Event) => {
    const target = event.target as HTMLAnchorElement
    if (target.tagName === 'A') {
      event.preventDefault()
      const hash = target.href.split('/').pop()?.slice(1) || ''
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  /**
   * term-link 锚点（#term-*）平滑滚动到底部术语列表
   */
  private termLinkScroll = (event: Event) => {
    const target = event.target as HTMLAnchorElement
    if (target.tagName === 'A' && target.classList.contains('term-link')) {
      event.preventDefault()
      const hash = target.hash.slice(1)
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  constructor() {
    document.addEventListener('pjax:success', this.setHTML)
    getElement('main').addEventListener('scroll', this.onScroll)
    this.setHTML()
    this.totop = document.querySelector('#to-top') as HTMLElement
  }
}

var scrolls = new Scroll()
