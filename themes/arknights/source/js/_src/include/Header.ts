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

  // Pjax 换页抑制「过期悬停」：换页时指针往往仍停在顶栏上，header:hover 依旧成立，
  // 新页面的选中项标签会立刻弹出并压住正文，直到用户移动鼠标。纯 CSS 无法区分「刚导航完」
  // 与「主动悬停」（两者匹配集合完全相同），故须有一个状态位。状态位的生命周期即
  // 「顶栏的悬停态自上次导航以来没有真正结束过」：写入见 afterNavigate，清除见 onPointerLeave。
  private markHoverStale = () => {
    this.header.setAttribute('data-nav-hover-stale', '')
  }

  // 悬停态结束（指针离开顶栏）即清除，此后再次悬停走 header:hover 原路径。
  // 只挂 pointerenter 会让状态位在指针一直停在顶栏时长期挂着，两者对用户不可见地等价，
  // 取 pointerleave 是因为它对应「过期状态真正结束」这一语义本身。
  private onPointerLeave = () => {
    this.header.removeAttribute('data-nav-hover-stale')
  }

  // 先写状态位再重算当前项：relabel 末尾的父级回溯循环在结构异常时会抛出，
  // 状态位必须无条件落下，否则抑制失效（标签又会挡住正文）
  private afterNavigate = () => {
    this.markHoverStale()
    this.relabel()
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
    document.addEventListener('pjax:success', this.afterNavigate)
    document.addEventListener('pjax:send', () => this.close())
    document.addEventListener('keyup', this.closeByEscape)
    // 元素级监听（非 document / window / main，故不进入全站 listener 基线）：
    // 顶栏被 Pjax selectors 排除在替换区外，本元素跨换页存活，无需重绑
    this.header.addEventListener('pointerleave', this.onPointerLeave)
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
