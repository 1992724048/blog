/// <reference path="common/base.ts" />

class expands {
  private bound = new WeakSet<Element>()

  private reverse = (item: Element, s0: string, s1: string) => {
    const block = getParent(item)
    let expanded = true
    if (block.classList.contains(s0)) {
      block.classList.remove(s0)
      block.classList.add(s1)
      expanded = false
    } else {
      block.classList.remove(s1)
      block.classList.add(s0)
      expanded = true
    }
    item.setAttribute('aria-expanded', String(expanded))
  }

  private addEvent = (header: HTMLElement) => {
    if (this.bound.has(header)) return
    this.bound.add(header)
    header.addEventListener('click', (click) => {
      if ((click.target as HTMLElement).tagName !== 'BUTTON' &&
        (click.target as HTMLElement).tagName !== 'A') {
        this.reverse(header, 'open', 'fold')
      }
    })
    header.addEventListener('keypress', (event) => {
      const isEnter = event.key === 'Enter'
      // 'Spacebar' 是旧浏览器的 key 别名，必须与 ' ' 等价处理
      const isSpace = event.key === ' ' || event.key === 'Spacebar'
      if (isEnter || isSpace) {
        // Space 必须阻止默认页面滚动；Enter 无滚动语义，同路径阻止不改变其行为
        event.preventDefault()
        this.reverse(header, 'open', 'fold')
      }
    })
  }

  public setHTML = () => {
    document.querySelectorAll('.expand-box').forEach((item) => { 
      this.addEvent(item.children[0] as HTMLElement)
    })
  }
  constructor() {}
}

let expand = new expands();
