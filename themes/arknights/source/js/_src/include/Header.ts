/// <reference path="common/base.ts" />

'use strict'

class Header {
  private readonly header: HTMLElement = getElement('header')
  private readonly button: HTMLElement = getElement('.navBtn')
  private readyRev: boolean = true

  private relabel = () => {
    let navs = this.header.querySelectorAll('.navItem'),
      mayLen = 0, may = navs.item(0)
    navs.forEach(item => {
      try { 
        let now = item as HTMLElement,
          link = getElement('a', now) as HTMLAnchorElement
        if (link !== null) {
          let href = link.href, match = now.getAttribute('matchdata')
          now.classList.remove('active')
          if (getParent(link) != now) {
            return
          }
          if (href.length > mayLen && document.URL.match(href) !== null) {
            mayLen = href.length
            may = now
          }
          if (match) {
            const s = match.split(',')
            s.forEach(item => {
              if (document.URL.match(item) !== null) {
                may = now
                mayLen = Infinity
              }
            })
          }
        }
      } catch (e) {}
    })
    if (may !== null) {
      do {
        if (may.classList.contains('navItem')) {
          may.classList.add('active')
        }
      } while (!(may = getParent(may)).classList.contains('navContent'))
    }
  }

  private closeByEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.close()
    }
  }

  public inHeader = (mouse: MouseEvent) => {
    const target = mouse.target as Element
    const popup = document.querySelector('.search-popup')
    if (!isParent(this.header, target) && !(popup !== null && isParent(popup, target))) {
      this.close()
      return
    }
    if (target.closest && target.closest('a') !== null) {
      this.close()
    }
  }

  public open = (item: Element = this.header) => {
    if (item !== this.header) {
      item.classList.add('expanded')
      return
    }
    this.header.classList.add('nav-open')
    this.button.setAttribute('aria-expanded', 'true')
    document.addEventListener('click', this.inHeader)
  }

  public close = (item: Element = this.header) => {
    if (item !== this.header) {
      item.classList.remove('expanded')
      return
    }
    this.closeAll()
    if (!this.header.classList.contains('nav-open')) {
      return
    }
    document.removeEventListener('click', this.inHeader)
    this.header.classList.remove('nav-open')
    this.button.setAttribute('aria-expanded', 'false')
  }

  public reverse = (item: Element = this.header) => {
    if (!this.readyRev) {
      return
    }
    this.readyRev = false
    const opened = item === this.header
      ? this.header.classList.contains('nav-open')
      : item.classList.contains('expanded')
    if (opened) {
      this.close(item)
    } else {
      this.open(item)
    }
    setTimeout(() => this.readyRev = true, 300)
  }

  public closeAll = () => {
    this.header.querySelectorAll('.expanded').forEach((item) =>
      item.classList.remove('expanded'))
  }

  constructor() {
    this.relabel()
    document.addEventListener('pjax:success', this.relabel)
    document.addEventListener('pjax:send', () => this.close())
    document.addEventListener('keyup', this.closeByEscape)
    this.button.onclick = () => this.reverse(this.header)
    document.querySelectorAll('.navItemList').forEach((item) => {
      item = getParent(item)
      item.addEventListener('click', (event) => {
        if (getParent(event.target as Element) === item) {
          this.reverse(item)
        }
      })
    })
  }
}

var header = new Header()
