"use strict";
function BgmControl() {
    const bgm = document.getElementById('bgm');
    const control = document.getElementById("bgm-control");
    if (bgm.paused) {
        bgm.play();
        control.setAttribute("fill", "#18d1ff");
        control.style.transform = "scaleY(1)";
    }
    else {
        bgm.pause();
        control.setAttribute("fill", "currentColor");
        control.style.transform = "scaleY(.5)";
    }
}
function getElement(string, item = document.documentElement) {
    let tmp = item.querySelector(string);
    if (tmp === null) {
        throw new Error("Unknown HTML");
    }
    return tmp;
}
function isParent(parent, child) {
    for (; child !== null && child !== undefined; child = child.offsetParent) {
        if (child === parent) {
            return true;
        }
    }
    return false;
}
function getParent(item, level = 1) {
    while (level--) {
        let tmp = item.parentElement;
        if (tmp === null) {
            throw new Error("Unknown HTML");
        }
        item = tmp;
    }
    return item;
}
function format(format, ...args) {
    return format.replaceAll(/\$\*?[0-9]*/g, (match) => {
        if (match === '$*') {
            return '';
        }
        let Index = match.slice(1);
        if (Index >= args.length) {
            return '';
        }
        return args[Index];
    });
}
/// <reference path="common/base.ts" />
class expands {
    reverse = (item, s0, s1) => {
        const block = getParent(item);
        if (block.classList.contains(s0)) {
            block.classList.remove(s0);
            block.classList.add(s1);
        }
        else {
            block.classList.remove(s1);
            block.classList.add(s0);
        }
    };
    addEvent = (header) => {
        header.addEventListener('click', (click) => {
            if (click.target.tagName !== 'BUTTON' &&
                click.target.tagName !== 'A') {
                this.reverse(header, 'open', 'fold');
            }
        });
        header.addEventListener('keypress', (key) => {
            if (key.key === 'Enter') {
                this.reverse(header, 'open', 'fold');
            }
        });
    };
    setHTML = () => {
        document.querySelectorAll('.expand-box').forEach((item) => {
            this.addEvent(item.children[0]);
        });
    };
    constructor() { }
}
let expand = new expands();
class Code {
    mermaids = [];
    doAsMermaid = (item) => {
        let Amermaid = item.querySelector('.mermaid');
        item.outerHTML = '<div class="highlight mermaid">' + Amermaid.innerText + '</div>';
    };
    resetName = (str) => {
        if (str == 'plaintext') {
            return 'TEXT';
        }
        if (str == 'cs') {
            return 'C#';
        }
        if (str == 'cpp') {
            return 'C++';
        }
        return str.toUpperCase();
    };
    formatSize = (bytes) => {
        if (bytes >= 1048576) {
            return (bytes / 1048576).toFixed(1) + 'MB';
        }
        if (bytes >= 1024) {
            return (bytes / 1024).toFixed(1) + 'KB';
        }
        return bytes + 'B';
    };
    doAsCode = (item) => {
        const code_fold = page_config.code_fold || config.code_fold || -1;
        const codeType = this.resetName(item.classList[1]), lineCount = getElement('.gutter', item).children[0].childElementCount >> 1;
        const codeElement = getElement('code', item);
        item.classList.add(lineCount <= code_fold || code_fold === -1 ? 'open' : 'fold');
        item.classList.add('expand-box');
        item.innerHTML =
            `<div class="ex-header" tabindex='0'>
        <i class="i-status"></i>
        <span class="ex-title">${codeType}</span>
        <span class="ex-size">${lineCount} Col · ${this.formatSize(new TextEncoder().encode(codeElement.innerText).length)}</span>
      </div>
      <div class="ex-content">${item.innerHTML}
        <button class="code-copy" title="${config.code.copy}"></button>
      </div>`;
        getElement('.code-copy', item).addEventListener('click', (click) => {
            const button = click.target;
            navigator.clipboard.writeText(getElement('code', item).innerText);
            button.classList.add('copied');
            setTimeout(() => {
                button.classList.remove('copied');
            }, 1200);
        });
    };
    paintMermaid = () => {
        if (typeof (mermaid) === 'undefined')
            return;
        mermaid.initialize(document.documentElement.getAttribute('theme-mode') === 'dark' ?
            { theme: 'dark' } : { theme: 'default' });
        if (typeof (mermaid.run) !== 'undefined') {
            mermaid.run({ querySelector: '.mermaid' });
        }
        else {
            mermaid.init();
        }
    };
    findCode = () => {
        let codeBlocks = document.querySelectorAll('.highlight');
        if (codeBlocks !== null) {
            codeBlocks.forEach(item => {
                if (item.getAttribute('code-find') === null) {
                    try {
                        if (!item.classList.contains('mermaid') && item.querySelector('.code-header') === null) {
                            if (item.querySelector('.mermaid') !== null) {
                                this.doAsMermaid(item);
                            }
                            else {
                                this.doAsCode(item);
                            }
                        }
                    }
                    catch (e) {
                        return;
                    }
                    item.setAttribute('code-find', '');
                }
            });
        }
        document.querySelectorAll('.mermaid').forEach((item) => {
            this.mermaids.push(item.outerHTML);
        });
        expand.setHTML();
    };
    resetMermaid = () => {
        if (typeof (mermaid) === 'undefined')
            return;
        let id = 0;
        document.querySelectorAll('.mermaid').forEach((item) => {
            item.outerHTML = this.mermaids[id];
            ++id;
        });
        this.paintMermaid();
    };
    constructor() {
        this.findCode();
        document.addEventListener('pjax:success', this.findCode);
        window.addEventListener('hexo-blog-decrypt', this.findCode);
    }
}
let code = new Code();
class dust {
    x;
    y;
    vx = Math.random() * 1 + 1;
    vy = Math.random() * 1 + 0.01;
    shadowBlur = Math.random() * 3;
    shadowX = (Math.random() * 2) - 1;
    shadowY = (Math.random() * 2) - 1;
    radiusX = Math.random() * 1.5 + 0.5;
    radiusY = this.radiusX * (Math.random() * (1.3 - 0.3) + 0.3);
    rotation = Math.PI * Math.floor(Math.random() * 2);
    constructor(x = 50, y = 50) {
        this.x = x;
        this.y = y;
    }
}
class canvasDust {
    canvas;
    ctx;
    color = '#fff';
    width = 300;
    height = 300;
    dustQuantity = 50;
    dustArr = [];
    inStop = false;
    constructor(canvasID) {
        const canvas = getElement(canvasID);
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.build();
        window.addEventListener('resize', this.resize);
    }
    build = () => {
        this.resize();
        if (this.ctx) {
            const point = canvasDust.getPoint(this.dustQuantity);
            for (let i of point) {
                const dustObj = new dust(i[0], i[1]);
                this.buildDust(dustObj);
                this.dustArr.push(dustObj);
            }
            requestAnimationFrame(this.paint);
        }
    };
    paint = () => {
        if (this.inStop) {
            return;
        }
        const dustArr = this.dustArr;
        for (let i of dustArr) {
            this.ctx.clearRect(i.x - 6, i.y - 6, 12, 12);
            if (i.x < -5 || i.y < -5) {
                const x = this.width;
                const y = Math.floor(Math.random() * window.innerHeight);
                i.x = x;
                i.y = y;
            }
            else {
                i.x -= i.vx;
                i.y -= i.vy;
            }
        }
        for (let i of dustArr) {
            this.buildDust(i);
        }
        requestAnimationFrame(this.paint);
    };
    buildDust = (dust) => {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.shadowBlur = dust.shadowBlur;
        ctx.shadowOffsetX = dust.shadowX;
        ctx.shadowOffsetY = dust.shadowY;
        ctx.ellipse(dust.x, dust.y, dust.radiusX, dust.radiusY, dust.rotation, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    };
    resize = () => {
        const canvas = this.canvas;
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.width = width;
        this.height = height;
        this.dustQuantity = Math.floor((width + height) / 38);
        canvas.width = width;
        canvas.height = height;
        this.ctx.shadowColor =
            this.ctx.fillStyle = this.color;
    };
    static getPoint = (number = 1) => {
        let point = [];
        for (let i = 0; i < number; ++i) {
            const x = Math.floor(Math.random() * window.innerWidth);
            const y = Math.floor(Math.random() * window.innerHeight);
            point.push([x, y]);
        }
        return point;
    };
    stop = () => {
        this.inStop = true;
    };
    play = () => {
        if (this.inStop === true) {
            this.inStop = false;
            requestAnimationFrame(this.paint);
        }
    };
}
try {
    var canvasDusts = new canvasDust('#canvas-dust');
}
catch (e) { }
class GiscusManager {
    giscusSrc = 'https://giscus.app/client.js';
    giscusOrigin = 'https://giscus.app';
    settingsTimeout = 8000;
    scriptTimeout = 15000;
    errorDelay = 5000;
    loadingFallbackTimeout = 12000;
    messageHandlers = [];
    config = null;
    loaded = false;
    isLoading = false;
    loadStartTime = 0;
    showErrorTimeoutId = null;
    loadingFallbackTimeoutId = null;
    async loadConfig() {
        if (this.loaded)
            return this.config;
        try {
            const response = await fetch('/giscus.json');
            if (response.ok) {
                this.config = await response.json();
            }
        }
        catch (e) {
            console.warn('加载Giscus配置文件失败:', e);
        }
        this.loaded = true;
        return this.config;
    }
    async validateOrigin() {
        if (typeof window === 'undefined')
            return true;
        const currentOrigin = window.location.origin;
        const settings = window.giscusSettings;
        if (settings?.origin === currentOrigin)
            return true;
        const config = await this.loadConfig();
        if (!config)
            return true;
        if (config.origins?.includes(currentOrigin))
            return true;
        if (config.originsRegex?.length) {
            for (const pattern of config.originsRegex) {
                try {
                    if (pattern && new RegExp(pattern).test(currentOrigin))
                        return true;
                }
                catch (e) {
                    console.warn('无效的正则表达式模式:', pattern, e);
                }
            }
        }
        return !(config.origins?.length || config.originsRegex?.length);
    }
    getContainer() {
        if (typeof document === 'undefined')
            return null;
        return document.querySelector('#giscus');
    }
    clearErrorTimer() {
        if (!this.showErrorTimeoutId)
            return;
        clearTimeout(this.showErrorTimeoutId);
        this.showErrorTimeoutId = null;
    }
    clearLoadingTimer() {
        if (!this.loadingFallbackTimeoutId)
            return;
        clearTimeout(this.loadingFallbackTimeoutId);
        this.loadingFallbackTimeoutId = null;
    }
    clearLoadingMessage(container) {
        this.clearLoadingTimer();
        const target = container || this.getContainer();
        if (!target)
            return;
        const loadingMessage = target.querySelector('.giscus-loading-message');
        if (loadingMessage)
            loadingMessage.remove();
    }
    clearErrorMessage(container) {
        const target = container || this.getContainer();
        if (!target)
            return;
        const errorMessage = target.querySelector('.giscus-error-message');
        if (errorMessage)
            errorMessage.remove();
    }
    clearAllMessages(container) {
        this.clearErrorTimer();
        this.clearLoadingMessage(container);
        this.clearErrorMessage(container);
    }
    showLoadingMessage(container) {
        this.clearLoadingMessage(container);
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'giscus-loading-message';
        loadingDiv.setAttribute('aria-live', 'polite');
        loadingDiv.innerHTML = '<i class="giscus-loader" aria-hidden="true"></i><p class="giscus-loading-text">与神经网络取得连接 ...</p>';
        container.appendChild(loadingDiv);
    }
    getErrorMessage(error) {
        const loadTime = Math.round((Date.now() - this.loadStartTime) / 1000);
        if (error.message.includes('超时'))
            return `神经网络响应超时 (${loadTime}秒)`;
        if (error.message.includes('失败'))
            return '神经网络链路建立失败';
        return '神经网络链路不稳定';
    }
    showErrorWithDelay(container, error) {
        this.clearErrorTimer();
        this.showErrorTimeoutId = setTimeout(() => {
            this.clearLoadingMessage(container);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'giscus-error-message';
            errorDiv.innerHTML =
                `<div class="giscus-error-content">
           <div class="giscus-error-title">神经网络连接异常</div>
           <div class="giscus-error-message-text">${this.getErrorMessage(error)}</div>
           <button class="giscus-error-retry">重新连接</button>
         </div>`;
            this.clearErrorMessage(container);
            container.appendChild(errorDiv);
            const retryButton = errorDiv.querySelector('.giscus-error-retry');
            if (retryButton) {
                retryButton.addEventListener('click', () => {
                    retryButton.disabled = true;
                    retryButton.textContent = '重新建立连接中...';
                    this.loadGiscusScript().finally(() => {
                        retryButton.disabled = false;
                        retryButton.textContent = '重新连接';
                    });
                });
            }
            this.showErrorTimeoutId = null;
        }, this.errorDelay);
    }
    scheduleLoadingFallbackClear() {
        this.clearLoadingTimer();
        this.loadingFallbackTimeoutId = setTimeout(() => {
            this.clearLoadingMessage();
        }, this.loadingFallbackTimeout);
    }
    waitForGiscusSettings(timeout = this.settingsTimeout) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkSettings = () => {
                const settings = window.giscusSettings;
                if (settings !== undefined) {
                    resolve(settings);
                    return;
                }
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Giscus配置加载超时 (${timeout}ms)`));
                    return;
                }
                setTimeout(checkSettings, 100);
            };
            checkSettings();
        });
    }
    getGiscusTheme(siteTheme) {
        const themeConfig = window.giscusThemeConfig;
        if (themeConfig?.theme)
            return themeConfig.theme;
        if (themeConfig?.light && themeConfig?.dark) {
            return siteTheme === 'dark' ? themeConfig.dark : themeConfig.light;
        }
        return siteTheme === 'auto' || !siteTheme ? 'preferred_color_scheme'
            : siteTheme === 'dark' ? 'dark' : 'light';
    }
    getScriptAttributes(settings) {
        const attributes = {
            'data-repo': String(settings.repo),
            'data-repo-id': String(settings.repoId),
            'data-category': String(settings.category),
            'data-category-id': String(settings.categoryId),
            'data-mapping': settings.mapping || 'pathname',
            'data-strict': String(settings.strict ?? 0),
            'data-reactions-enabled': String(settings.reactionsEnabled ?? 1),
            'data-emit-metadata': String(settings.emitMetadata ?? 0),
            'data-input-position': settings.inputPosition || 'bottom',
            'data-lang': settings.lang || 'zh-CN',
            'data-theme': this.getGiscusTheme(document.documentElement.getAttribute('theme-mode')),
            'crossorigin': settings.crossorigin || 'anonymous'
        };
        if (settings.term)
            attributes['data-term'] = String(settings.term);
        if (settings.discussionNumber !== undefined && settings.discussionNumber !== null) {
            attributes['data-discussion-number'] = String(settings.discussionNumber);
        }
        if (settings.description)
            attributes['data-description'] = String(settings.description);
        if (settings.origin)
            attributes['data-origin'] = String(settings.origin);
        if (settings.loading)
            attributes['data-loading'] = String(settings.loading);
        return attributes;
    }
    appendGiscusScript(container, settings) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = this.giscusSrc;
            script.async = true;
            const attributes = this.getScriptAttributes(settings);
            Object.entries(attributes).forEach(([key, value]) => {
                if (value !== '')
                    script.setAttribute(key, value);
            });
            const timeoutId = setTimeout(() => {
                reject(new Error('Giscus脚本加载超时'));
            }, this.scriptTimeout);
            script.onload = () => {
                clearTimeout(timeoutId);
                resolve();
            };
            script.onerror = () => {
                clearTimeout(timeoutId);
                reject(new Error('Giscus脚本加载失败'));
            };
            container.appendChild(script);
        });
    }
    async loadGiscusScript() {
        if (this.isLoading)
            return;
        const container = this.getContainer();
        if (!container)
            return;
        this.isLoading = true;
        this.loadStartTime = Date.now();
        this.clearAllMessages(container);
        this.showLoadingMessage(container);
        try {
            const settings = await this.waitForGiscusSettings();
            if (!settings.repo || !settings.repoId || !settings.category || !settings.categoryId) {
                throw new Error('Giscus配置不完整');
            }
            const existingScript = container.querySelector(`script[src*="${this.giscusSrc}"]`);
            const existingIframe = container.querySelector('iframe.giscus-frame');
            if (existingScript)
                existingScript.remove();
            if (existingIframe)
                existingIframe.remove();
            await this.appendGiscusScript(container, settings);
            this.scheduleLoadingFallbackClear();
        }
        catch (error) {
            this.showErrorWithDelay(container, error);
            console.warn('Giscus 加载异常:', error);
        }
        finally {
            this.isLoading = false;
        }
    }
    syncTheme(theme) {
        return this.sendMessage({
            setConfig: {
                theme: this.getGiscusTheme(theme || document.documentElement.getAttribute('theme-mode'))
            }
        });
    }
    sendMessage(message) {
        if (!message)
            return false;
        const iframe = document.querySelector('iframe.giscus-frame');
        if (!iframe?.contentWindow)
            return false;
        try {
            iframe.contentWindow.postMessage({ giscus: message }, this.giscusOrigin);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    addMessageHandler(handler) {
        this.messageHandlers.push(handler);
    }
    removeMessageHandler(handler) {
        const index = this.messageHandlers.indexOf(handler);
        if (index > -1)
            this.messageHandlers.splice(index, 1);
    }
    isLoaded() {
        return !!document.querySelector('iframe.giscus-frame');
    }
    destroy() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('message', this.handleMessage);
        }
        this.clearErrorTimer();
        this.clearLoadingTimer();
        this.messageHandlers = [];
        this.isLoading = false;
        this.loadStartTime = 0;
    }
    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleMessage);
        }
    }
    handleMessage = (event) => {
        if (!event || event.origin !== this.giscusOrigin)
            return;
        if (!(typeof event.data === 'object' && event.data?.giscus))
            return;
        this.clearLoadingMessage();
        const giscusData = event.data.giscus;
        try {
            this.messageHandlers.forEach(handler => {
                if (typeof handler === 'function') {
                    handler(giscusData);
                }
            });
        }
        catch (e) {
            console.warn('Giscus 消息处理异常:', e);
        }
    };
}
let giscusManager;
if (typeof window !== 'undefined') {
    giscusManager = new GiscusManager();
    window.giscusManager = giscusManager;
}
class ColorMode {
    html = document.documentElement;
    dark = this.html.getAttribute('theme-mode') === 'dark';
    inChanging = false;
    btn = getElement('#color-mode');
    syncGiscusTheme = () => {
        if (typeof giscusManager !== 'undefined' && giscusManager.isLoaded()) {
            giscusManager.syncTheme();
        }
    };
    change = () => {
        this.inChanging = true;
        let background = document.createElement('div');
        background.style.transition = '1.5s';
        background.innerHTML =
            `<div style='background: var(--${this.dark ? 'dark' : 'light'}-background);
        height: 100vh; width: 100vw;
        position: fixed; left: 0; top: 0; z-index: -99999;
        background-attachment: fixed;
        background-position: 50% 0;
        background-repeat: no-repeat;
        background-size: cover;'></div>`;
        document.body.insertBefore(background, document.body.firstChild);
        this.btn.style.pointerEvents = 'none';
        setTimeout(() => {
            if (canvasDusts)
                canvasDusts.stop();
            if (this.dark) {
                this.html.setAttribute('theme-mode', 'light');
                this.dark = false;
                window.localStorage['theme-mode'] = 'light';
            }
            else {
                this.html.setAttribute('theme-mode', 'dark');
                this.dark = true;
                window.localStorage['theme-mode'] = 'dark';
            }
            background.style.opacity = '0';
            code.resetMermaid();
            this.syncGiscusTheme();
        });
        setTimeout(() => {
            document.body.removeChild(background);
            if (canvasDusts)
                canvasDusts.play();
        }, 1500);
        setTimeout(() => {
            this.btn.style.pointerEvents = '';
            this.inChanging = false;
        }, 1000);
    };
    constructor() {
        document.addEventListener('keypress', (ev) => {
            if (this.inChanging) {
                return;
            }
            if (ev.key === 'c' && ev.target &&
                !['INPUT', 'TEXTAREA'].includes(ev.target.tagName)) {
                this.change();
            }
        });
    }
}
try {
    var colorMode = new ColorMode();
}
catch (e) { }
class Pair {
    comment;
    button;
    constructor(first, second) {
        this.comment = first;
        this.button = second;
    }
}
class Selectors {
    elements = [];
    nowActive;
    changeTo = (item) => {
        if (item === this.nowActive) {
            return;
        }
        this.nowActive.comment.style.display = 'none';
        this.nowActive.button.classList.remove('active');
        item.comment.style.display = '';
        item.button.classList.add('active');
        this.nowActive = item;
    };
    constructor(elements = [], active = 0) {
        this.elements = elements;
        this.nowActive = this.elements[active];
        this.elements.forEach((item) => item.comment.style.display = 'none');
        this.nowActive = this.elements[0];
        for (let i of this.elements) {
            i.button.addEventListener('click', () => this.changeTo(i));
        }
        this.nowActive.comment.style.display = '';
        this.nowActive.button.classList.add('active');
    }
}
class Comments {
    search = ["valine", "gitalk", "waline", "artalk", "utterances", "giscus"];
    elements = [];
    async validateGiscusOrigin() {
        return typeof giscusManager !== 'undefined' ? await giscusManager.validateOrigin() : true;
    }
    async loadGiscus() {
        const container = document.querySelector('#giscus');
        if (!container)
            return;
        const isOriginValid = await this.validateGiscusOrigin();
        if (!isOriginValid)
            return;
        if (typeof giscusManager !== 'undefined') {
            giscusManager.loadGiscusScript();
        }
    }
    setHTML = async () => {
        const commentsContainer = document.querySelector('#comments');
        if (!commentsContainer)
            return;
        const selectorContainer = commentsContainer.querySelector('.selector');
        if (selectorContainer) {
            this.elements = [];
            this.search.forEach((item) => {
                try {
                    this.elements.push(new Pair(getElement(`#${item}`), getElement(`.${item}-sel`)));
                }
                catch (e) { }
            });
            new Selectors(this.elements, 0);
        }
        await this.loadGiscus();
    };
    constructor() {
        this.setHTML();
        document.addEventListener('pjax:complete', this.setHTML);
    }
}
new Comments();
class Cursor {
    now = new MouseEvent('');
    first = true;
    last = 0;
    moveIng = false;
    fadeIng = false;
    nowX = 0;
    nowY = 0;
    outer;
    effecter;
    attention = `a,input,button,textarea,
    .navBtnIcon,
    #post-content img,
    .ex-header,
    .gt-user-inner,
    .wl-sort>li,
    #valine .vicon,#valine .vat,
    .lg-container img,.clickable`;
    set = (X = this.nowX, Y = this.nowY) => {
        this.outer.transform =
            `translate(calc(${X.toFixed(2)}px - 50%),
                  calc(${Y.toFixed(2)}px - 50%))`;
    };
    move = (timestamp) => {
        if (this.now !== undefined) {
            let delX = this.now.x - this.nowX, delY = this.now.y - this.nowY;
            this.nowX += delX * Math.min(0.025 * (timestamp - this.last), 1);
            this.nowY += delY * Math.min(0.025 * (timestamp - this.last), 1);
            this.set();
            this.last = timestamp;
            if (Math.abs(delX) > 0.1 || Math.abs(delY) > 0.1) {
                window.requestAnimationFrame(this.move);
            }
            else {
                this.set(this.now.x, this.now.y);
                this.moveIng = false;
            }
        }
    };
    reset = (mouse) => {
        this.outer.top = '0';
        this.outer.left = '0';
        if (!this.moveIng) {
            this.moveIng = true;
            window.requestAnimationFrame(this.move);
        }
        this.now = mouse;
        if (this.first) {
            this.first = false;
            this.nowX = this.now.x;
            this.nowY = this.now.y;
            this.set();
        }
    };
    Aeffect = (mouse) => {
        if (this.fadeIng == false) {
            this.fadeIng = true;
            this.effecter.left = String(mouse.x) + 'px';
            this.effecter.top = String(mouse.y) + 'px';
            this.effecter.transition =
                'transform .5s cubic-bezier(0.22, 0.61, 0.21, 1)\
        ,opacity .5s cubic-bezier(0.22, 0.61, 0.21, 1)';
            this.effecter.transform = 'translate(-50%, -50%) scale(1)';
            this.effecter.opacity = '0';
            setTimeout(() => {
                this.fadeIng = false;
                this.effecter.transition = '';
                this.effecter.transform = 'translate(-50%, -50%) scale(0)';
                this.effecter.opacity = '1';
            }, 500);
        }
    };
    hold = () => {
        this.outer.height = '24px';
        this.outer.width = '24px';
        this.outer.background = "var(--theme-cursor-bg)";
    };
    relax = () => {
        this.outer.height = '36px';
        this.outer.width = '36px';
        this.outer.background = "unset";
    };
    pushHolder = () => {
        document.querySelectorAll(this.attention).forEach(item => {
            if (!item.classList.contains('is--active')) {
                item.addEventListener('mouseover', this.hold, { passive: true });
                item.addEventListener('mouseout', this.relax, { passive: true });
            }
        });
    };
    constructor() {
        let node = document.createElement('div');
        node.id = 'cursor-container';
        node.innerHTML = `<div id="cursor-outer"></div><div id="cursor-effect"></div>`;
        document.body.appendChild(node);
        this.outer = getElement('#cursor-outer', node).style;
        this.outer.top = '-100%';
        this.effecter = getElement('#cursor-effect', node).style;
        this.effecter.transform = 'translate(-50%, -50%) scale(0)';
        this.effecter.opacity = '1';
        window.addEventListener('mousemove', this.reset, { passive: true });
        window.addEventListener('click', this.Aeffect, { passive: true });
        this.pushHolder();
        const observer = new MutationObserver(this.pushHolder);
        observer.observe(document, { childList: true, subtree: true });
    }
}
new Cursor();
class Header {
    header = getElement('header');
    button = getElement('.navBtn');
    readyRev = true;
    relabel = () => {
        let navs = this.header.querySelectorAll('.navItem'), mayLen = 0, may = navs.item(0);
        navs.forEach(item => {
            try {
                let now = item, link = getElement('a', now);
                if (link !== null) {
                    let href = link.href, match = now.getAttribute('matchdata');
                    now.classList.remove('active');
                    if (getParent(link) != now) {
                        return;
                    }
                    if (href.length > mayLen && document.URL.match(href) !== null) {
                        mayLen = href.length;
                        may = now;
                    }
                    if (match) {
                        const s = match.split(',');
                        s.forEach(item => {
                            if (document.URL.match(item) !== null) {
                                may = now;
                                mayLen = Infinity;
                            }
                        });
                    }
                }
            }
            catch (e) { }
        });
        if (may !== null) {
            do {
                if (may.classList.contains('navItem')) {
                    may.classList.add('active');
                }
            } while (!(may = getParent(may)).classList.contains('navContent'));
        }
    };
    closeByEscape = (event) => {
        if (event.key === 'Escape') {
            this.close();
        }
    };
    inHeader = (mouse) => {
        const target = mouse.target;
        const popup = document.querySelector('.search-popup');
        if (!isParent(this.header, target) && !(popup !== null && isParent(popup, target))) {
            this.close();
            return;
        }
        if (target.closest && target.closest('a') !== null) {
            this.close();
        }
    };
    open = (item = this.header) => {
        if (item !== this.header) {
            item.classList.add('expanded');
            return;
        }
        this.header.classList.add('nav-open');
        this.button.setAttribute('aria-expanded', 'true');
        document.addEventListener('click', this.inHeader);
    };
    close = (item = this.header) => {
        if (item !== this.header) {
            item.classList.remove('expanded');
            return;
        }
        this.closeAll();
        if (!this.header.classList.contains('nav-open')) {
            return;
        }
        document.removeEventListener('click', this.inHeader);
        this.header.classList.remove('nav-open');
        this.button.setAttribute('aria-expanded', 'false');
    };
    reverse = (item = this.header) => {
        if (!this.readyRev) {
            return;
        }
        this.readyRev = false;
        const opened = item === this.header
            ? this.header.classList.contains('nav-open')
            : item.classList.contains('expanded');
        if (opened) {
            this.close(item);
        }
        else {
            this.open(item);
        }
        setTimeout(() => this.readyRev = true, 300);
    };
    closeAll = () => {
        this.header.querySelectorAll('.expanded').forEach((item) => item.classList.remove('expanded'));
    };
    constructor() {
        this.relabel();
        document.addEventListener('pjax:success', this.relabel);
        document.addEventListener('pjax:send', () => this.close());
        document.addEventListener('keyup', this.closeByEscape);
        this.button.onclick = () => this.reverse(this.header);
        document.querySelectorAll('.navItemList').forEach((item) => {
            item = getParent(item);
            item.addEventListener('click', (event) => {
                if (getParent(event.target) === item) {
                    this.reverse(item);
                }
            });
        });
    }
}
var header = new Header();
class Index {
    lastIndex = -1;
    headerLink = document.querySelectorAll('null');
    tocLink = document.querySelectorAll('null');
    setItem = (item) => {
        item.classList.add('active');
        let parent = getParent(item), brother = parent.children;
        for (let i = 0, length = brother.length; i < length; ++i) {
            const item = brother.item(i);
            if (item.classList.contains('toc-child')) {
                item.classList.add('has-active');
                break;
            }
        }
        for (; parent.classList[0] !== 'toc'; parent = getParent(parent)) {
            if (parent.classList[0] === 'toc-child') {
                parent.classList.add('has-active');
            }
        }
    };
    reset = (not) => {
        let tocs = document.querySelectorAll('#toc-div .active');
        let tocTree = document.querySelectorAll('#toc-div .has-active');
        tocs.forEach(item => {
            if (!item.contains(not)) {
                item.classList.remove('active');
            }
        });
        tocTree.forEach(item => {
            if (!item.parentElement.contains(not)) {
                item.classList.remove('has-active');
            }
        });
    };
    check = (index, id) => {
        return index[id + 1] > window.innerHeight / 3 || index[id] > 0;
    };
    modifyIndex = () => {
        let index = [];
        this.headerLink.forEach(item => {
            index.push(item.getBoundingClientRect().top);
        });
        if (this.lastIndex >= 0 &&
            (this.lastIndex < 1 || !this.check(index, this.lastIndex - 1)) &&
            this.check(index, this.lastIndex)) {
            return;
        }
        for (let i = 0; i < this.tocLink.length; ++i) {
            const item = this.tocLink.item(i);
            if (i + 1 === index.length || this.check(index, i)) {
                this.lastIndex = i;
                this.setItem(item);
                this.reset(item);
                return;
            }
        }
        this.lastIndex = 0;
        this.setItem(this.tocLink.item(0));
        this.reset(this.tocLink.item(0));
    };
    setHTML = () => {
        try {
            this.headerLink = getElement('#post-content').querySelectorAll('h1,h2,h3,h4,h5,h6');
            this.tocLink = document.querySelectorAll('.toc-link');
            if (this.tocLink.length) {
                this.setItem(this.tocLink.item(0));
            }
        }
        catch { }
    };
    constructor() {
        this.setHTML();
        document.addEventListener('pjax:success', this.setHTML);
        window.addEventListener('hexo-blog-decrypt', this.setHTML);
        getElement('main').addEventListener('scroll', () => {
            if (this.tocLink.length) {
                this.modifyIndex();
            }
        }, { passive: true });
    }
}
new Index();
class MonacoEditor {
    // keep references to editors to avoid garbage collection
    editors = new Map();
    updateEditorLayout = () => {
        for (const [container, ed] of Array.from(this.editors.entries())) {
            if (!(container instanceof HTMLElement) || !container.isConnected) {
                this.editors.delete(container);
                continue;
            }
            try {
                ed.layout();
            }
            catch (e) { /* ignore */ }
        }
    };
    createEditor = (container, lang, theme, readOnly, height, options) => {
        if (container.getAttribute('data-initialized') === 'true')
            return;
        container.setAttribute('data-initialized', 'true');
        container.style.height = height;
        try {
            const mon = window.monaco || monaco;
            if (!mon || !mon.editor || !mon.editor.create) {
                console.error('MonacoEditor: monaco not available when trying to create editor');
                return;
            }
            // prefer the <pre> source textContent to avoid HTML-escaped entities
            const pre = container.querySelector('pre');
            const source = pre?.textContent || '';
            const editor = mon.editor.create(container, {
                value: source,
                language: lang,
                theme: theme,
                readOnly: readOnly,
                ...options,
            });
            // store editor instance to avoid garbage collection
            this.editors.set(container, editor);
        }
        catch (e) {
            console.error('MonacoEditor: failed to create editor', e);
        }
    };
    findEditor = () => {
        const editors = document.querySelectorAll('.monaco-editor-code');
        editors.forEach((editor) => {
            const lang = editor.getAttribute('data-lang') || 'plaintext';
            const theme = editor.getAttribute('data-theme') || 'vs-dark';
            const readOnly = editor.getAttribute('data-readonly') || 'false';
            const height = editor.getAttribute('data-height') || '300px';
            const rawOptions = editor.getAttribute('data-options') || '{}';
            let options = {};
            try {
                // decode HTML entities (e.g. &quot;) produced by server-side escaping
                const decoded = new DOMParser().parseFromString(rawOptions, 'text/html').documentElement.textContent || rawOptions;
                options = JSON.parse(decoded || '{}');
            }
            catch (e) {
                try {
                    // fallback: maybe server used encodeURIComponent
                    options = JSON.parse(decodeURIComponent(rawOptions));
                }
                catch (e2) {
                    console.warn('MonacoEditor: failed to parse data-options, using empty options', rawOptions, e2);
                    options = {};
                }
            }
            this.createEditor(editor, lang, theme, Boolean(readOnly), height, options);
        });
        this.updateEditorLayout();
    };
    loadMonaco = () => {
        // 惰性加载：仅当页面存在代码编辑器容器时才引入 CDN loader
        if (document.querySelector('.monaco-editor-code') === null) {
            return;
        }
        if (typeof window.hexo_monaco === 'undefined') {
            const loader = document.createElement('script');
            loader.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
            loader.onload = () => {
                window.require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
                window.require(['vs/editor/editor.main'], () => {
                    window.hexo_monaco = true; // prevent loading multiple times
                    this.findEditor();
                });
            };
            loader.onerror = () => {
                console.error('Failed to load Monaco Editor loader script.');
            };
            document.body.appendChild(loader);
        }
        else {
            this.findEditor();
        }
    };
    constructor() {
        this.loadMonaco();
        document.addEventListener('pjax:success', this.loadMonaco);
        window.addEventListener('hexo-blog-decrypt', this.loadMonaco);
        window.addEventListener('resize', this.updateEditorLayout);
    }
}
;
new MonacoEditor();
class Scroll {
    scrolling = 0;
    getingtop = false;
    visible = false;
    totop;
    scrolltop = () => {
        getElement('main').scroll({ top: 0, left: 0, behavior: 'smooth' });
        this.totop.style.opacity = '0';
        this.getingtop = true;
        setTimeout(() => this.totop.style.display = 'none', 300);
    };
    totopChange = (top) => {
        if (top < -200) {
            this.totop.style.display = '';
            this.visible = true;
            setTimeout(() => {
                if (this.visible) {
                    this.totop.style.opacity = '1';
                }
            }, 300);
        }
        else {
            this.totop.style.opacity = '0';
            this.visible = false;
            setTimeout(() => {
                if (!this.visible) {
                    this.totop.style.display = 'none';
                }
            }, 300);
        }
    };
    onScroll = () => {
        try {
            const nowheight = getElement('article').getBoundingClientRect().top;
            if (nowheight > 0) {
                return;
            }
            ++this.scrolling;
            setTimeout(() => {
                if (!--this.scrolling) {
                    this.getingtop = false;
                }
            }, 100);
            if (!this.getingtop) {
                this.totopChange(nowheight);
            }
        }
        catch (e) { }
    };
    setHTML = () => {
        try {
            this.visible = false;
            this.totop = getElement('#to-top');
            this.setListener();
        }
        catch (e) { }
    };
    /**
     * used for `supScroll`, `footNoteScroll` and `termLinkScroll` functions
     */
    setListener = () => {
        getElement('#post-content').addEventListener('click', this.supScroll);
        getElement('#post-content').addEventListener('click', this.termLinkScroll);
        getElement('#footnotes').addEventListener('click', this.footNoteScroll);
    };
    supScroll = (event) => {
        const target = event.target;
        const targetParent = getParent(target);
        if (targetParent?.tagName === 'SUP') {
            event.preventDefault();
            const hash = target.href.split('/').pop()?.slice(1) || '';
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
            return;
        }
    };
    footNoteScroll = (event) => {
        const target = event.target;
        if (target.tagName === 'A') {
            event.preventDefault();
            const hash = target.href.split('/').pop()?.slice(1) || '';
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        }
    };
    /**
     * term-link 锚点（#term-*）平滑滚动到底部术语列表
     */
    termLinkScroll = (event) => {
        const target = event.target;
        if (target.tagName === 'A' && target.classList.contains('term-link')) {
            event.preventDefault();
            const hash = target.hash.slice(1);
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        }
    };
    constructor() {
        document.addEventListener('pjax:success', this.setHTML);
        getElement('main').addEventListener('scroll', this.onScroll);
        this.setHTML();
        this.totop = document.querySelector('#to-top');
    }
}
var scrolls = new Scroll();
class TocControl {
    inToc = (mouse) => {
        const indexBtn = getElement('#to-index');
        const toc = getElement('#toc-div');
        if (!isParent(toc, mouse.target) && !isParent(indexBtn, mouse.target)) {
            this.change();
            document.removeEventListener('mousedown', this.inToc);
        }
    };
    ifClick = () => {
        document.addEventListener('mouseup', this.inToc);
    };
    change = () => {
        const indexBtn = getElement('#to-index');
        const toc = getElement('#toc-div');
        if (toc.className === 'open') {
            toc.className = '';
            indexBtn.classList.remove('open');
            document.removeEventListener('mousedown', this.ifClick);
            document.removeEventListener('mouseup', this.inToc);
        }
        else {
            toc.className = 'open';
            indexBtn.classList.add('open');
            document.addEventListener('mousedown', this.ifClick);
        }
    };
}
var tocControl = new TocControl();
// 标注序列化：以正文文本节点的累计字符偏移（start + length）记录——<mark> 包裹不改变文本总量，
// 增删标注后同一偏移仍指向同一段文字；文章文本变化导致偏移漂移时按边界校验静默丢弃
class Toolbox {
    static EXCLUDED_SELECTOR = '.bottom-btn, #annotate-toolbar, #post-footer, #post-info, #reward, #comments, #paginator, script, style';
    static HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:';
    static FAVORITES_KEY = 'arknights:favorites';
    static ANNOTATE_COLOR_KEY = 'arknights:annotate-color';
    static ANNOTATE_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
    static COPIED_DELAY = 1200;
    pendingRange = null;
    get toolbox() {
        return document.querySelector('.toolbox');
    }
    get toggleButton() {
        return document.querySelector('#to-toolbox');
    }
    get shareButton() {
        return document.querySelector('.toolbox-share');
    }
    get favoriteButton() {
        return document.querySelector('.toolbox-favorite');
    }
    get article() {
        return document.querySelector('article');
    }
    get annotateToolbar() {
        return document.querySelector('#annotate-toolbar');
    }
    get annotateButton() {
        return document.querySelector('.toolbox-annotate');
    }
    get colorButton() {
        return document.querySelector('#annotate-toolbar .at-color');
    }
    get colorPanel() {
        return document.querySelector('#annotate-toolbar .at-colors');
    }
    get copyButton() {
        return document.querySelector('#annotate-toolbar .at-copy');
    }
    get toolbarAnnotateButton() {
        return document.querySelector('#annotate-toolbar .at-annotate');
    }
    get toolbarClearButton() {
        return document.querySelector('#annotate-toolbar .at-clear');
    }
    read = (key) => {
        try {
            return window.localStorage.getItem(key);
        }
        catch (e) {
            return null;
        }
    };
    write = (key, value) => {
        try {
            if (value === null) {
                window.localStorage.removeItem(key);
            }
            else {
                window.localStorage.setItem(key, value);
            }
        }
        catch (e) { }
    };
    highlightKey = () => {
        return Toolbox.HIGHLIGHT_KEY_PREFIX + window.location.pathname;
    };
    applyState = (open) => {
        const toolbox = this.toolbox;
        if (toolbox !== null) {
            toolbox.classList.toggle('toolbox-open', open);
        }
        const toggle = this.toggleButton;
        if (toggle !== null) {
            toggle.setAttribute('aria-expanded', String(open));
        }
        if (open) {
            document.addEventListener('click', this.onOutsideClick);
        }
        else {
            document.removeEventListener('click', this.onOutsideClick);
            this.pendingRange = null;
        }
    };
    toggle = () => {
        const toolbox = this.toolbox;
        this.applyState(toolbox === null || !toolbox.classList.contains('toolbox-open'));
    };
    onOutsideClick = (event) => {
        const target = event.target;
        if (target !== null && typeof target.closest === 'function' && target.closest('.toolbox') !== null) {
            return;
        }
        this.applyState(false);
    };
    onKeyup = (event) => {
        if (event.key === 'Escape') {
            this.applyState(false);
            this.hideToolbar();
        }
    };
    isAnnotating = () => {
        return document.body.classList.contains('annotating');
    };
    setAnnotating = (on) => {
        document.body.classList.toggle('annotating', on);
        this.syncAnnotateButton();
        if (!on) {
            this.hideToolbar();
            this.pendingRange = null;
        }
    };
    syncAnnotateButton = () => {
        const button = this.annotateButton;
        if (button === null) {
            return;
        }
        const on = this.isAnnotating();
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
    };
    showToolbar = (range) => {
        const toolbar = this.annotateToolbar;
        if (toolbar === null) {
            return;
        }
        this.placeToolbar(range);
        toolbar.classList.add('open');
        toolbar.setAttribute('aria-hidden', 'false');
        this.updateToolbarButtons(range);
    };
    hideToolbar = () => {
        const toolbar = this.annotateToolbar;
        if (toolbar === null) {
            return;
        }
        toolbar.classList.remove('open');
        toolbar.setAttribute('aria-hidden', 'true');
        this.closeColors();
    };
    placeToolbar = (range) => {
        const toolbar = this.annotateToolbar;
        if (toolbar === null || typeof range.getBoundingClientRect !== 'function') {
            return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return;
        }
        const margin = 8;
        const gap = 6;
        const width = toolbar.offsetWidth;
        const height = toolbar.offsetHeight;
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
        let top = rect.top - height - gap;
        if (top < margin) {
            top = Math.min(rect.bottom + gap, window.innerHeight - height - margin);
        }
        toolbar.style.left = left + 'px';
        toolbar.style.top = top + 'px';
    };
    onSelectionChange = () => {
        if (!this.isAnnotating()) {
            return;
        }
        const range = this.selectionRange();
        if (range === null) {
            this.hideToolbar();
            return;
        }
        this.showToolbar(range);
    };
    closeColors = () => {
        const panel = this.colorPanel;
        if (panel !== null) {
            panel.classList.remove('open');
        }
    };
    onDocumentClick = (event) => {
        const target = event.target;
        if (target === null || typeof target.closest !== 'function') {
            return;
        }
        if (target.closest('.at-color') !== null || target.closest('.at-colors') !== null) {
            return;
        }
        this.closeColors();
    };
    onToolbarClick = (event) => {
        const target = event.target;
        if (target === null || typeof target.closest !== 'function' || target.closest('#annotate-toolbar') === null) {
            return;
        }
        const colorOption = target.closest('.at-color-opt');
        if (colorOption !== null) {
            this.setAnnotateColor(colorOption.getAttribute('data-color'));
            return;
        }
        const button = target.closest('.at-btn');
        if (button === null) {
            return;
        }
        if (button.classList.contains('at-annotate')) {
            this.annotateSelection();
        }
        else if (button.classList.contains('at-clear')) {
            this.clearSelectionHighlights();
        }
        else if (button.classList.contains('at-copy')) {
            this.copySelection();
        }
        else if (button.classList.contains('at-search')) {
            this.searchSelection();
        }
        else if (button.classList.contains('at-color')) {
            this.toggleColors();
        }
    };
    // 选区覆盖判定：选区被高亮全覆盖 → 无从新增（annotate 禁用）；不含高亮 → 无从清除（clear 禁用）
    updateToolbarButtons = (range) => {
        const article = this.article;
        const annotate = this.toolbarAnnotateButton;
        const clear = this.toolbarClearButton;
        if (article === null || annotate === null || clear === null) {
            return;
        }
        const layout = this.textLayout(article);
        const start = this.boundaryOffset(range.startContainer, range.startOffset, layout);
        const end = this.boundaryOffset(range.endContainer, range.endOffset, layout);
        if (start === null || end === null || start >= end) {
            annotate.disabled = true;
            clear.disabled = true;
            return;
        }
        const state = this.selectionGaps(article, layout, start, end);
        annotate.disabled = state.gaps.length === 0;
        clear.disabled = !state.hasHighlight;
    };
    refreshToolbarButtons = () => {
        const toolbar = this.annotateToolbar;
        if (toolbar === null || !toolbar.classList.contains('open') || !this.isAnnotating()) {
            return;
        }
        const range = this.selectionRange();
        if (range === null) {
            this.hideToolbar();
            return;
        }
        this.updateToolbarButtons(range);
    };
    // 选区 [start,end) 内「未被既有高亮覆盖」的补齐段落；hasHighlight = 选区含既有高亮
    selectionGaps = (article, layout, start, end) => {
        const covered = [];
        article.querySelectorAll('.hl-mark').forEach((mark) => {
            const offsets = this.markOffsets(mark, layout);
            if (offsets !== null && offsets.start < end && start < offsets.end) {
                covered.push({ start: Math.max(offsets.start, start), end: Math.min(offsets.end, end) });
            }
        });
        covered.sort((left, right) => left.start - right.start);
        const gaps = [];
        let cursor = start;
        covered.forEach((item) => {
            if (item.start > cursor) {
                gaps.push({ start: cursor, end: item.start });
            }
            cursor = Math.max(cursor, item.end);
        });
        if (cursor < end) {
            gaps.push({ start: cursor, end: end });
        }
        return { gaps: gaps, hasHighlight: covered.length !== 0 };
    };
    isAnnotatable = (node) => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        const article = this.article;
        if (element === null || article === null || !article.contains(element)) {
            return false;
        }
        return element.closest(Toolbox.EXCLUDED_SELECTOR) === null;
    };
    textLayout = (root) => {
        const nodes = [];
        const starts = [];
        let total = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (!this.isAnnotatable(node)) {
                continue;
            }
            nodes.push(node);
            starts.push(total);
            total += node.data.length;
        }
        return { nodes: nodes, starts: starts, total: total };
    };
    firstTextFrom = (node, layout) => {
        for (const text of layout.nodes) {
            if (text === node) {
                return text;
            }
            const relation = node.compareDocumentPosition(text);
            if ((relation & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) !== 0) {
                return text;
            }
        }
        return null;
    };
    firstTextAfter = (element, layout) => {
        for (const text of layout.nodes) {
            const relation = element.compareDocumentPosition(text);
            if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0) {
                return text;
            }
        }
        return null;
    };
    boundaryOffset = (node, offset, layout) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const index = layout.nodes.indexOf(node);
            if (index < 0) {
                return null;
            }
            return layout.starts[index] + Math.min(offset, node.data.length);
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return null;
        }
        const element = node;
        const found = offset < element.childNodes.length
            ? this.firstTextFrom(element.childNodes[offset], layout)
            : this.firstTextAfter(element, layout);
        return found === null ? layout.total : layout.starts[layout.nodes.indexOf(found)];
    };
    // 起边界取 position 之后的首个文本（避免范围横跨其间元素，如被排除的 #post-info）；
    // 止边界取 position 之前的末个文本（避免吞入其后元素的标签结构，产生嵌套 mark）
    pointAt = (layout, position, forward) => {
        if (layout.nodes.length === 0) {
            return null;
        }
        if (forward) {
            for (let index = 0; index < layout.nodes.length; index++) {
                const end = layout.starts[index] + layout.nodes[index].data.length;
                if (position < end) {
                    return { node: layout.nodes[index], offset: position - layout.starts[index] };
                }
            }
            const last = layout.nodes.length - 1;
            return { node: layout.nodes[last], offset: layout.nodes[last].data.length };
        }
        for (let index = layout.nodes.length - 1; index >= 0; index--) {
            const start = layout.starts[index];
            if (position > start) {
                return { node: layout.nodes[index], offset: Math.min(position - start, layout.nodes[index].data.length) };
            }
        }
        return { node: layout.nodes[0], offset: 0 };
    };
    rangeFromOffsets = (layout, start, end) => {
        if (start < 0 || end > layout.total || start >= end) {
            return null;
        }
        const startPoint = this.pointAt(layout, start, true);
        const endPoint = this.pointAt(layout, end, false);
        if (startPoint === null || endPoint === null) {
            return null;
        }
        const range = document.createRange();
        range.setStart(startPoint.node, startPoint.offset);
        range.setEnd(endPoint.node, endPoint.offset);
        return range;
    };
    wrapRange = (range, color) => {
        const mark = document.createElement('mark');
        mark.className = 'hl-mark';
        mark.setAttribute('data-color', color);
        try {
            range.surroundContents(mark);
            return true;
        }
        catch (e) {
            try {
                mark.appendChild(range.extractContents());
                range.insertNode(mark);
                return true;
            }
            catch (error) {
                return false;
            }
        }
    };
    unwrapMark = (mark) => {
        const parent = mark.parentNode;
        if (parent === null) {
            return;
        }
        while (mark.firstChild !== null) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
    };
    removeAllMarks = (article) => {
        article.querySelectorAll('.hl-mark').forEach((mark) => this.unwrapMark(mark));
    };
    markOffsets = (mark, layout) => {
        const range = document.createRange();
        range.selectNodeContents(mark);
        const start = this.boundaryOffset(range.startContainer, range.startOffset, layout);
        const end = this.boundaryOffset(range.endContainer, range.endOffset, layout);
        if (start === null || end === null || start >= end) {
            return null;
        }
        return { start: start, end: end };
    };
    selectionRange = () => {
        const selection = window.getSelection();
        if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
            return null;
        }
        const range = selection.getRangeAt(0);
        if (!this.isRangeAnnotatable(range)) {
            return null;
        }
        return range;
    };
    isRangeAnnotatable = (range) => {
        return !range.collapsed && this.isAnnotatable(range.startContainer) && this.isAnnotatable(range.endContainer);
    };
    onMouseDown = (event) => {
        this.pendingRange = null;
        const target = event.target;
        if (target === null || typeof target.closest !== 'function') {
            return;
        }
        const inToolbar = target.closest('#annotate-toolbar') !== null;
        if (!inToolbar && target.closest('.toolbox-annotate') === null) {
            return;
        }
        if (inToolbar) {
            // 阻止默认（选区折叠 / 焦点转移）：否则 selectionchange 会在 click 之前隐藏工具条、丢失目标选区
            event.preventDefault();
        }
        const selection = window.getSelection();
        if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
            return;
        }
        this.pendingRange = selection.getRangeAt(0).cloneRange();
    };
    annotate = () => {
        const on = !this.isAnnotating();
        this.setAnnotating(on);
        if (on) {
            const range = this.resolveRange();
            if (range !== null) {
                this.highlightRange(range);
            }
        }
        this.pendingRange = null;
        this.applyState(false);
    };
    // 只补选区中未标注的部分（按当前色新增）；既有高亮保持原样（不重着色、不删除、不合并）
    highlightRange = (range) => {
        const article = this.article;
        if (article === null) {
            return;
        }
        const layout = this.textLayout(article);
        const start = this.boundaryOffset(range.startContainer, range.startOffset, layout);
        const end = this.boundaryOffset(range.endContainer, range.endOffset, layout);
        if (start === null || end === null || start >= end) {
            return;
        }
        const gaps = this.selectionGaps(article, layout, start, end).gaps;
        let wrapped = false;
        gaps.forEach((gap) => {
            const gapRange = this.rangeFromOffsets(this.textLayout(article), gap.start, gap.end);
            if (gapRange !== null && this.wrapRange(gapRange, this.currentAnnotateColor())) {
                wrapped = true;
            }
        });
        if (wrapped) {
            this.persistHighlights();
        }
    };
    onMarkClick = (event) => {
        const target = event.target;
        if (target === null || typeof target.closest !== 'function') {
            return;
        }
        const mark = target.closest('.hl-mark');
        if (mark === null || !this.isAnnotatable(mark)) {
            return;
        }
        this.unwrapMark(mark);
        this.persistHighlights();
    };
    resolveRange = () => {
        const current = this.selectionRange();
        if (current !== null) {
            return current;
        }
        if (this.pendingRange !== null && this.isRangeAnnotatable(this.pendingRange)) {
            return this.pendingRange;
        }
        return null;
    };
    annotateSelection = () => {
        const range = this.resolveRange();
        if (range !== null) {
            this.highlightRange(range);
        }
        this.refreshToolbarButtons();
    };
    clearSelectionHighlights = () => {
        const range = this.resolveRange();
        const article = this.article;
        if (range === null || article === null) {
            this.refreshToolbarButtons();
            return;
        }
        const layout = this.textLayout(article);
        const start = this.boundaryOffset(range.startContainer, range.startOffset, layout);
        const end = this.boundaryOffset(range.endContainer, range.endOffset, layout);
        if (start === null || end === null || start >= end) {
            this.refreshToolbarButtons();
            return;
        }
        const affected = [];
        article.querySelectorAll('.hl-mark').forEach((mark) => {
            const offsets = this.markOffsets(mark, layout);
            if (offsets !== null && offsets.start < end && start < offsets.end) {
                affected.push({ start: offsets.start, end: offsets.end, color: this.markColor(mark) });
                this.unwrapMark(mark);
            }
        });
        affected.forEach((item) => {
            const beforeEnd = Math.min(item.end, start);
            const afterStart = Math.max(item.start, end);
            if (beforeEnd > item.start) {
                const before = this.rangeFromOffsets(this.textLayout(article), item.start, beforeEnd);
                if (before !== null) {
                    this.wrapRange(before, item.color);
                }
            }
            if (item.end > afterStart) {
                const after = this.rangeFromOffsets(this.textLayout(article), afterStart, item.end);
                if (after !== null) {
                    this.wrapRange(after, item.color);
                }
            }
        });
        if (affected.length !== 0) {
            this.persistHighlights();
        }
        this.refreshToolbarButtons();
    };
    copySelection = () => {
        const range = this.resolveRange();
        if (range === null) {
            return;
        }
        const text = range.toString();
        if (text.length === 0) {
            return;
        }
        const complete = () => {
            const button = this.copyButton;
            if (button === null) {
                return;
            }
            button.classList.add('copied');
            setTimeout(() => button.classList.remove('copied'), Toolbox.COPIED_DELAY);
        };
        const fallback = () => {
            if (typeof document.execCommand === 'function' && document.execCommand('copy')) {
                complete();
            }
        };
        try {
            navigator.clipboard.writeText(text).then(complete).catch(fallback);
        }
        catch (e) {
            fallback();
        }
    };
    searchSelection = () => {
        const range = this.resolveRange();
        if (range === null) {
            return;
        }
        const keyword = range.toString().trim();
        if (keyword.length === 0) {
            return;
        }
        const search = window.searchWithKeyword;
        if (typeof search === 'function') {
            search(keyword);
        }
        this.hideToolbar();
    };
    toggleColors = () => {
        const panel = this.colorPanel;
        if (panel !== null) {
            panel.classList.toggle('open');
        }
    };
    setAnnotateColor = (color) => {
        if (color === null || !Toolbox.ANNOTATE_COLORS.includes(color)) {
            return;
        }
        this.write(Toolbox.ANNOTATE_COLOR_KEY, color);
        this.applyAnnotateColor();
    };
    currentAnnotateColor = () => {
        const stored = this.read(Toolbox.ANNOTATE_COLOR_KEY);
        return stored !== null && Toolbox.ANNOTATE_COLORS.includes(stored) ? stored : 'yellow';
    };
    applyAnnotateColor = () => {
        const color = this.currentAnnotateColor();
        const button = this.colorButton;
        if (button !== null) {
            button.setAttribute('data-color', color);
        }
        document.querySelectorAll('#annotate-toolbar .at-color-opt').forEach((option) => {
            option.classList.toggle('active', option.getAttribute('data-color') === color);
        });
    };
    markColor = (mark) => {
        const color = mark.getAttribute('data-color');
        return color !== null && Toolbox.ANNOTATE_COLORS.includes(color) ? color : 'yellow';
    };
    persistHighlights = () => {
        const article = this.article;
        if (article === null) {
            return;
        }
        const layout = this.textLayout(article);
        const ranges = [];
        article.querySelectorAll('.hl-mark').forEach((mark) => {
            const offsets = this.markOffsets(mark, layout);
            if (offsets !== null) {
                const color = this.markColor(mark);
                const item = { start: offsets.start, length: offsets.end - offsets.start };
                if (color !== 'yellow') {
                    item.color = color;
                }
                ranges.push(item);
            }
        });
        ranges.sort((left, right) => left.start - right.start);
        this.write(this.highlightKey(), ranges.length === 0 ? null : JSON.stringify({ version: 1, ranges: ranges }));
    };
    restoreHighlights = () => {
        const article = this.article;
        const stored = this.read(this.highlightKey());
        if (article === null || stored === null) {
            return;
        }
        const ranges = [];
        try {
            const parsed = JSON.parse(stored);
            const container = parsed;
            if (parsed !== null && typeof parsed === 'object' && Array.isArray(container.ranges)) {
                container.ranges.forEach((item) => {
                    const range = item;
                    if (typeof range.start === 'number' && typeof range.length === 'number' && range.start >= 0 && range.length > 0) {
                        const color = typeof range.color === 'string' && Toolbox.ANNOTATE_COLORS.includes(range.color) ? range.color : 'yellow';
                        ranges.push({ start: range.start, length: range.length, color: color });
                    }
                });
            }
        }
        catch (e) {
            return;
        }
        if (ranges.length === 0) {
            return;
        }
        this.removeAllMarks(article);
        ranges.sort((left, right) => left.start - right.start);
        ranges.forEach((item) => {
            const range = this.rangeFromOffsets(this.textLayout(article), item.start, item.start + item.length);
            if (range !== null) {
                this.wrapRange(range, item.color ?? 'yellow');
            }
        });
    };
    share = () => {
        const data = { title: document.title, url: window.location.href };
        if (typeof navigator.share === 'function') {
            try {
                navigator.share(data).then(() => this.applyState(false)).catch(() => { });
            }
            catch (e) { }
            return;
        }
        this.copyShareUrl(data.url);
    };
    copyShareUrl = (url) => {
        const button = this.shareButton;
        const complete = () => {
            if (button === null) {
                return;
            }
            button.classList.add('copied');
            setTimeout(() => {
                button.classList.remove('copied');
                this.applyState(false);
            }, Toolbox.COPIED_DELAY);
        };
        try {
            navigator.clipboard.writeText(url).then(complete).catch(() => { });
        }
        catch (e) { }
    };
    readFavorites = () => {
        const stored = this.read(Toolbox.FAVORITES_KEY);
        if (stored === null) {
            return {};
        }
        try {
            const parsed = JSON.parse(stored);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }
            return parsed;
        }
        catch (e) {
            return {};
        }
    };
    applyFavoriteState = () => {
        const button = this.favoriteButton;
        if (button === null) {
            return;
        }
        const saved = this.readFavorites()[window.location.pathname] !== undefined;
        button.classList.toggle('saved', saved);
        button.setAttribute('aria-pressed', String(saved));
        const label = button.getAttribute(saved ? 'data-label-saved' : 'data-label-default');
        if (label !== null) {
            button.setAttribute('title', label);
            button.setAttribute('aria-label', label);
        }
    };
    favorite = () => {
        const favorites = this.readFavorites();
        const path = window.location.pathname;
        if (favorites[path] !== undefined) {
            delete favorites[path];
        }
        else {
            favorites[path] = { url: window.location.href, title: document.title, time: Date.now() };
        }
        this.write(Toolbox.FAVORITES_KEY, Object.keys(favorites).length === 0 ? null : JSON.stringify(favorites));
        this.applyFavoriteState();
    };
    onPjaxSuccess = () => {
        this.applyState(false);
        this.hideToolbar();
        this.restoreHighlights();
        this.applyFavoriteState();
        this.syncAnnotateButton();
        this.applyAnnotateColor();
    };
    constructor() {
        document.addEventListener('keyup', this.onKeyup);
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('click', this.onMarkClick);
        document.addEventListener('click', this.onToolbarClick);
        document.addEventListener('click', this.onDocumentClick);
        document.addEventListener('selectionchange', this.onSelectionChange);
        document.addEventListener('pjax:success', this.onPjaxSuccess);
        document.addEventListener('pjax:send', this.hideToolbar);
        const main = document.querySelector('main');
        if (main !== null) {
            main.addEventListener('scroll', this.hideToolbar, { passive: true });
        }
        this.restoreHighlights();
        this.applyFavoriteState();
        this.syncAnnotateButton();
        this.applyAnnotateColor();
    }
}
var toolbox = new Toolbox();
class pjaxSupport {
    loading = getElement('.loading');
    left = getElement('.loadingBar.left');
    right = getElement('.loadingBar.right');
    timestamp = 0;
    start = (need) => {
        this.left.style.transform = `scaleX(${need})`;
        this.right.style.transform = `scaleX(${need})`;
        ++this.timestamp;
    };
    loaded = () => {
        getElement('main').scrollTop = 0;
        this.start(1);
        setTimeout((time) => {
            if (this.timestamp === time) {
                this.loading.style.opacity = '0';
            }
        }, 600, this.timestamp);
    };
    fail = () => {
        setTimeout((time) => {
            if (this.timestamp !== time) {
                return;
            }
            this.start(0);
            this.loading.classList.add('fail');
            setTimeout((time) => {
                if (this.timestamp === time) {
                    this.loading.style.opacity = '0';
                    this.loading.classList.remove('fail');
                }
            }, 600, this.timestamp);
        }, 600, this.timestamp);
    };
    constructor() {
        document.addEventListener('pjax:send', () => {
            this.loading.classList.add('reset');
            this.loading.classList.remove('fail');
            this.start(0);
            setTimeout((time) => {
                if (this.timestamp !== time) {
                    return;
                }
                this.loading.classList.remove('reset');
                this.start(0.3);
                this.loading.style.opacity = '1';
                setTimeout((time) => {
                    if (this.timestamp === time) {
                        this.start(0.6);
                    }
                }, 1200, this.timestamp);
            }, 0, this.timestamp);
        });
        document.addEventListener('pjax:start', this.loaded);
        document.addEventListener('pjax:error', this.fail);
    }
}
try {
    new pjaxSupport();
}
catch (e) { }
