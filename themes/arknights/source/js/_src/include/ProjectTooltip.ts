'use strict'

class ProjectTooltip {
  private boundCards: WeakSet<HTMLElement> = new WeakSet()

  private bindCards = (): void => {
    document.querySelectorAll<HTMLElement>('.project-card').forEach(card => {
      if (this.boundCards.has(card)) {
        return
      }
      this.boundCards.add(card)
      card.addEventListener('mousemove', (event) => this.onMousemove(event, card))
    })
  }

  private onMousemove = (event: MouseEvent, card: HTMLElement): void => {
    card.style.setProperty('--mx', String(event.clientX))
    card.style.setProperty('--my', String(event.clientY))
  }

  constructor() {
    this.bindCards()
    document.addEventListener('pjax:success', this.bindCards)
  }
}

var projectTooltip = new ProjectTooltip()
