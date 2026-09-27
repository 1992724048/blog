/// <reference path="common/base.ts" />
/// <reference path="GiscusManager.ts" />

'use strict'

class Comments {
  private async validateGiscusOrigin(): Promise<boolean> {
    return typeof giscusManager !== 'undefined' ? await giscusManager.validateOrigin() : true
  }

  private async loadGiscus(): Promise<void> {
    const container = document.querySelector('#giscus')
    if (!container) return

    const isOriginValid = await this.validateGiscusOrigin()
    if (!isOriginValid) return

    if (typeof giscusManager !== 'undefined') {
      giscusManager.loadGiscusScript()
    }
  }

  private setHTML = async () => {
    if (!document.querySelector('#comments')) return

    await this.loadGiscus()
  }

  constructor() {
    this.setHTML()
    document.addEventListener('pjax:complete', this.setHTML)
  }
}

new Comments()
