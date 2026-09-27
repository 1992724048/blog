"use strict";
'use strict';
// 全站 .toolbox-status 的唯一写入口：写入、delay 自动清除、进入期同步清空与「其它 owner 接管」失效都收敛在此。
// 任何模块都不得自行写 textContent / hidden（含经 invalidateStatusLease 交还的节点），否则观察者语义与
// 「谁持有文案」的唯一事实来源同时失效。观察者挂在共享节点上，任何其它控制器的写入（哪怕文本逐字相同）
// 都会产生 mutation record 并使本 lease 失效，因此持有者之外的任何人都不可能依赖本模块的 timer 去清空别人的文案。
// 进入动效由 CSS 承担（.toolbox-status:not([hidden]) 上的 @keyframes，由 hidden 的 false 写入天然触发）；
// 退场必须发生在 hidden = true 之前，故本模块用 WAJ + generation 守卫 timer 收尾，退场常量镜像 CSS token。
let statusGeneration = 0;
let statusLease = null;
let exitAnimation = null;
let exitTimer = null;
const STATUS_SLIDE_GAP_PX = 12;
const STATUS_SCALE = 0.96;
const STATUS_EXIT_MS = 180;
const STATUS_EXIT_EASING = 'cubic-bezier(.4, 0, 1, 1)';
const STATUS_EXIT_FADE = 0.6;
const STATUS_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// 节点终结写入的唯一实现：清文本 + 落 hidden。退场（动画）必须先于它，故退场路径在调用它之前完成动画
const clearOwnedNodeNow = (node) => {
    node.textContent = '';
    node.hidden = true;
};
const releaseStatusLease = (lease) => {
    if (lease.timer !== null) {
        window.clearTimeout(lease.timer);
    }
    if (lease.observer !== null) {
        lease.observer.disconnect();
    }
    lease.timer = null;
    lease.observer = null;
};
function currentStatusLease() {
    return statusLease;
}
// 撤销在飞的退场：新文案接管时必须立刻恢复静止态，否则旧退场动画会继续把新文案淡出
function cancelStatusExit() {
    if (exitTimer !== null) {
        window.clearTimeout(exitTimer);
        exitTimer = null;
    }
    if (exitAnimation !== null) {
        exitAnimation.cancel();
        exitAnimation = null;
    }
}
// 返回 false 表示本次不播退场（减动效偏好或环境缺 WAJ），调用方须走同步清空回退路径
function startStatusExit(node) {
    if (typeof node.animate !== 'function' || window.matchMedia(STATUS_REDUCED_MOTION).matches) {
        return false;
    }
    const view = window.getComputedStyle(node);
    const fromTransform = view.transform === '' ? 'none' : view.transform;
    const fromOpacity = view.opacity === '' ? '1' : view.opacity;
    const offset = -1 * (node.getBoundingClientRect().width + STATUS_SLIDE_GAP_PX);
    exitAnimation = node.animate([
        { opacity: fromOpacity, transform: fromTransform, offset: 0 },
        { opacity: '0', offset: STATUS_EXIT_FADE },
        { opacity: '0', transform: `translateX(${offset}px) scale(${STATUS_SCALE})`, offset: 1 }
    ], { duration: STATUS_EXIT_MS, easing: STATUS_EXIT_EASING, fill: 'forwards' });
    return true;
}
// 规格 16.3 的 claimStatus：递增 generation → 撤销在飞的退场 → 释放旧 lease 但不清空旧 node
// → 建 observer 并 observe → 写 node → takeRecords 丢弃本次自有写入 → delay > 0 时为该 lease 建唯一 timer
function claimStatus(message, options) {
    statusGeneration += 1;
    cancelStatusExit();
    if (statusLease !== null) {
        releaseStatusLease(statusLease);
        statusLease = null;
    }
    const node = document.querySelector('.toolbox-status');
    if (node === null) {
        return;
    }
    const observer = new MutationObserver(() => {
        const lease = statusLease;
        if (lease === null || lease.observer !== observer) {
            return;
        }
        statusGeneration += 1;
        releaseStatusLease(lease);
        statusLease = null;
    });
    observer.observe(node, {
        attributes: true,
        attributeFilter: ['hidden'],
        childList: true,
        characterData: true,
        subtree: true
    });
    node.textContent = message;
    node.hidden = false;
    observer.takeRecords();
    const lease = {
        token: statusGeneration,
        node: node,
        message: message,
        owner: options.owner,
        observer: observer,
        timer: null
    };
    statusLease = lease;
    if (options.delay !== undefined && options.delay > 0) {
        lease.timer = window.setTimeout(() => {
            // 身份守卫：陈旧 timer 只清理自己创建时的那个 lease，绝不落到后来者头上
            if (statusLease === lease) {
                clearStatus();
            }
        }, options.delay);
    }
}
// 规格 16.3 的租约交还有效期校验：待处理 mutation 视为其它 owner 已接管；校验 token、node 身份
// 与文本一致才算「本次确实终结的是自有文案」。两种情形都递增 generation、清 timer、disconnect 并丢弃 lease。
// 节点引用只以回调参数的形式在本模块内流动、绝不作为返回值外泄，故全局不存在第二写入点。
const withOwnedNode = (use) => {
    const lease = statusLease;
    if (lease === null) {
        return;
    }
    const pending = lease.observer === null ? [] : lease.observer.takeRecords();
    const owned = pending.length === 0
        && lease.token === statusGeneration
        && document.querySelector('.toolbox-status') === lease.node
        && lease.node.textContent === lease.message;
    statusGeneration += 1;
    releaseStatusLease(lease);
    statusLease = null;
    if (owned) {
        use(lease.node);
    }
};
// 清空（带退场）：持 lease 时先播 180ms 退场再落 hidden（退场必须先于 hidden，否则纯 CSS 无从过渡）；
// 无 lease（他人已接管）时不启动退场、不写节点、不建 timer。
// 退场在飞时被新 claimStatus 接管：generation 已再推进一步，终结写入被守卫作废，退场同时被 cancel。
function clearStatus() {
    withOwnedNode(node => {
        if (startStatusExit(node) === false) {
            clearOwnedNodeNow(node);
            return;
        }
        const generation = statusGeneration;
        exitTimer = window.setTimeout(() => {
            exitTimer = null;
            if (statusGeneration !== generation || node.isConnected === false) {
                return;
            }
            clearOwnedNodeNow(node);
            if (exitAnimation !== null) {
                exitAnimation.cancel();
                exitAnimation = null;
            }
        }, STATUS_EXIT_MS);
    });
}
// 同步清空（无退场、无 timer）：Pjax 换页窗口内节点即将被替换，播退场既无观感也无意义。
// 与 clearStatus 的差别仅在退场面，租约校验与终结写入完全共用。
function clearStatusNow() {
    cancelStatusExit();
    withOwnedNode(clearOwnedNodeNow);
}
// 播放 / 暂停终态的提示停留时长；failed 的提示不自动清除
const BGM_STATUS_DELAY = 2500;
// 单一状态机：用户 toggle、原生 media 事件与 Pjax 生命周期都只经由 reconcile / enterFailed
// 写最终态，不允许各自的 continuation 直接覆盖状态。
// operationGeneration 与 lifecycleGeneration 是两个正交的失效维度：前者作废未完成的播放操作，
// 后者作废跨 Pjax 存活的原生 listener 绑定；两者只能经下面的私有修改函数改变。
class BgmControl {
    audio;
    playbackState = 'paused';
    mediaFailed = false;
    operationGeneration = 0;
    lifecycleGeneration = 0;
    // 绑定 persistent media listener 时捕获的 lifecycle token；解绑时置 null
    persistentToken = null;
    // 规格 16.3 列出的 statusLease 状态由共享 lease 模块持有，此处只做只读映射，
    // 避免同一状态出现第二份副本
    get statusLease() {
        return currentStatusLease();
    }
    get button() {
        return document.querySelector('.toolbox-bgm[data-action="bgm"]');
    }
    // ===== generation 与 token =====
    snapshotLifecycleToken = () => {
        return Object.freeze({ kind: 'lifecycle', lifecycle: this.lifecycleGeneration });
    };
    advanceOperationGeneration = () => {
        this.operationGeneration += 1;
        return this.operationGeneration;
    };
    // 形态校验先行：JS 侧（含门禁探针的非 token 输入）可传入任意值，读字段前必须先确认它带 kind
    acceptsOperation = (token) => {
        return typeof token === 'object' && token !== null && token.kind === 'operation'
            && token.operation === this.operationGeneration
            && token.lifecycle === this.lifecycleGeneration;
    };
    acceptsLifecycle = (token) => {
        return typeof token === 'object' && token !== null
            && token.kind === 'lifecycle' && token.lifecycle === this.lifecycleGeneration;
    };
    beginOperation = () => {
        this.advanceOperationGeneration();
        // 上一 OperationToken 自此失效：它的 Promise continuation 与排队回调在写任何字段前都会被
        // acceptsOperation 拒绝。操作期不新增 media listener（原生事件统一由 persistent listener 承担），
        // 因此这里没有需要解绑的 operation-scoped listener 集合。
        return Object.freeze({
            kind: 'operation',
            operation: this.operationGeneration,
            lifecycle: this.lifecycleGeneration
        });
    };
    retireOperation = (token) => {
        if (!this.acceptsOperation(token)) {
            return false;
        }
        this.advanceOperationGeneration();
        return true;
    };
    invalidateLifecycle = (reason) => {
        this.lifecycleGeneration += 1;
        const token = this.snapshotLifecycleToken();
        this.unbindPersistentListeners();
        // 共享 status 节点的终结写入收敛到 lease 模块：Pjax 换页窗口内节点即将被替换，
        // 故走同步清空（无退场、无 timer），但租约校验与写入点仍只有一处
        clearStatusNow();
        this.bindPersistentListeners(token);
        return token;
    };
    // ===== persistent media listener =====
    bindPersistentListeners = (token) => {
        const audio = this.audio;
        if (audio === null) {
            return;
        }
        this.persistentToken = token;
        audio.addEventListener('play', this.onPlay);
        audio.addEventListener('pause', this.onPause);
        audio.addEventListener('ended', this.onEnded);
        audio.addEventListener('error', this.onError);
    };
    unbindPersistentListeners = () => {
        const audio = this.audio;
        if (audio === null) {
            return;
        }
        audio.removeEventListener('play', this.onPlay);
        audio.removeEventListener('pause', this.onPause);
        audio.removeEventListener('ended', this.onEnded);
        audio.removeEventListener('error', this.onError);
        this.persistentToken = null;
    };
    // ===== 状态渲染与终态 =====
    isHealthy = () => {
        const audio = this.audio;
        return audio !== null && !audio.paused && !this.mediaFailed && audio.error === null;
    };
    enterFailed = (reason, token) => {
        // reason 标识进入路径（media-play / play / load-sync / pjax-error 等），只用于状态机内部诊断
        if (this.acceptsOperation(token)) {
            this.retireOperation(token);
        }
        else if (this.acceptsLifecycle(token)) {
            this.advanceOperationGeneration();
        }
        else {
            return;
        }
        this.mediaFailed = true;
        this.playbackState = 'failed';
        this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: true });
    };
    reconcile = (input) => {
        if (!this.acceptsLifecycle(input.token)) {
            return;
        }
        const button = this.button;
        const state = this.playbackState;
        if (button === null) {
            return;
        }
        const pending = state === 'starting' || state === 'retrying-load' || state === 'retrying-play';
        button.setAttribute('aria-pressed', String(state === 'playing'));
        button.setAttribute('aria-busy', String(pending));
        const label = state === 'failed'
            ? button.dataset.labelError
            : state === 'playing'
                ? button.dataset.labelPause
                : button.dataset.labelPlay;
        if (label !== undefined) {
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
        }
        if (!input.publishStatus) {
            return;
        }
        // 中间态不发布文案：用户只会看到开始与结束之间的稳定反馈
        if (state === 'playing' || state === 'paused') {
            claimStatus(state === 'playing'
                ? button.dataset.labelPlayingStatus || ''
                : button.dataset.labelPausedStatus || '', { owner: 'bgm', delay: BGM_STATUS_DELAY });
        }
        else if (state === 'failed') {
            claimStatus(button.dataset.labelFailedStatus || '', { owner: 'bgm' });
        }
    };
    // ===== 原生 media 事件 =====
    onPlay = () => {
        const token = this.persistentToken;
        if (token === null) {
            return;
        }
        if (!this.isHealthy()) {
            this.enterFailed('media-play', token);
            return;
        }
        this.beginOperation();
        this.playbackState = 'playing';
        this.reconcile({ token: token, publishStatus: true });
    };
    onPause = () => {
        const token = this.persistentToken;
        if (token === null) {
            return;
        }
        if (this.mediaFailed || (this.audio !== null && this.audio.error !== null)) {
            this.enterFailed('media-pause', token);
            return;
        }
        this.beginOperation();
        this.playbackState = 'paused';
        this.reconcile({ token: token, publishStatus: true });
    };
    onEnded = () => {
        this.onPause();
    };
    onError = () => {
        const token = this.persistentToken;
        if (token === null) {
            return;
        }
        this.enterFailed('audio-error', token);
    };
    // ===== Pjax 生命周期：三个事件各一个 listener，pjax:error 的唯一 owner =====
    onPjaxLifecycle = (event) => {
        const token = this.invalidateLifecycle(event.type);
        const audio = this.audio;
        if (this.mediaFailed || (audio !== null && audio.error !== null)) {
            this.enterFailed(`pjax-${event.type}`, token);
            return;
        }
        this.playbackState = audio !== null && !audio.paused ? 'playing' : 'paused';
        this.reconcile({ token: token, publishStatus: true });
    };
    // ===== 惰性音源注入 =====
    // 首屏 HTML 只带 data-bgm-src（惰性属性，浏览器不据此发起任何请求），首次播放前才把 URL
    // 提升为真正的 src 并 load()。这是一次性幂等动作：属性随即被删除，重复调用直接返回，
    // 因此失败重试路径与 Pjax 换页后都不会二次注入，也不会与 toggle 的重试 load() 叠加。
    ensureSource = () => {
        const audio = this.audio;
        if (audio === null) {
            return;
        }
        const lazySource = audio.dataset.bgmSrc;
        if (lazySource === undefined || lazySource === '') {
            return;
        }
        delete audio.dataset.bgmSrc;
        audio.setAttribute('src', lazySource);
        audio.load();
    };
    // ===== 自动播放开关 =====
    // 仅当配置显式开启 data-bgm-autoplay 才在首屏后尝试一次自动播放。浏览器自动播放策略在
    // 无用户手势时通常直接 reject：这既不是媒体加载失败（不得进 failed），也不该发布任何文案，
    // 故只把本次试探性的 starting 收回 paused。成功路径由常驻 media 'play' 事件统一接管，
    // 此处不重复写终态。整个过程不新增任何 document/window 监听。
    attemptAutoplay = () => {
        const audio = this.audio;
        if (audio === null || audio.dataset.bgmAutoplay !== 'true') {
            return;
        }
        this.ensureSource();
        this.playbackState = 'starting';
        this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false });
        const unwind = () => {
            // 只收回自己写下的试探态；若期间已有其它路径接管（playing/failed/starting 之外的状态变化），不越权覆盖
            if (this.playbackState !== 'starting') {
                return;
            }
            this.playbackState = 'paused';
            this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false });
        };
        let started;
        try {
            started = audio.play();
        }
        catch (error) {
            unwind();
            return;
        }
        // 老浏览器 play() 返回 undefined，既不 resolve 也不 reject：保持 starting 交由 media 事件裁决
        if (started !== undefined && typeof started.catch === 'function') {
            started.catch(unwind);
        }
    };
    // ===== 用户操作 =====
    toggle = async () => {
        const audio = this.audio;
        if (audio === null) {
            return;
        }
        const token = this.beginOperation();
        if (!audio.paused) {
            try {
                audio.pause();
            }
            catch (error) {
                this.enterFailed('pause-sync', token);
                return;
            }
            if (this.acceptsOperation(token)) {
                this.retireOperation(token);
            }
            this.playbackState = 'paused';
            this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: true });
            return;
        }
        this.ensureSource();
        if (this.playbackState === 'failed') {
            this.playbackState = 'retrying-load';
            this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false });
            try {
                audio.load();
            }
            catch (error) {
                this.enterFailed('load-sync', token);
                return;
            }
            // mediaFailed 的唯一清除点：重试的 load() 正常返回后先清零，再以同一 token 继续 play()
            this.mediaFailed = false;
            this.playbackState = 'retrying-play';
            this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false });
        }
        else {
            this.playbackState = 'starting';
            this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false });
        }
        let played;
        try {
            played = audio.play();
        }
        catch (error) {
            this.enterFailed('play-sync', token);
            return;
        }
        try {
            await played;
        }
        catch (error) {
            this.enterFailed('play', token);
            return;
        }
        if (!this.acceptsOperation(token)) {
            return;
        }
        if (!this.isHealthy()) {
            this.enterFailed('play', token);
            return;
        }
        this.retireOperation(token);
        this.playbackState = 'playing';
        this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: true });
    };
    clearStatus = () => {
        clearStatus();
    };
    constructor() {
        this.audio = document.getElementById('bgm');
        this.bindPersistentListeners(this.snapshotLifecycleToken());
        document.addEventListener('pjax:send', this.onPjaxLifecycle);
        document.addEventListener('pjax:error', this.onPjaxLifecycle);
        document.addEventListener('pjax:success', this.onPjaxLifecycle);
        this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false });
        this.attemptAutoplay();
    }
}
var bgmControl = new BgmControl();
Object.assign(window, { bgmControl: bgmControl });
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
    bound = new WeakSet();
    reverse = (item, s0, s1) => {
        const block = getParent(item);
        let expanded = true;
        if (block.classList.contains(s0)) {
            block.classList.remove(s0);
            block.classList.add(s1);
            expanded = false;
        }
        else {
            block.classList.remove(s1);
            block.classList.add(s0);
            expanded = true;
        }
        item.setAttribute('aria-expanded', String(expanded));
    };
    addEvent = (header) => {
        if (this.bound.has(header))
            return;
        this.bound.add(header);
        header.addEventListener('click', (click) => {
            if (click.target.tagName !== 'BUTTON' &&
                click.target.tagName !== 'A') {
                this.reverse(header, 'open', 'fold');
            }
        });
        header.addEventListener('keypress', (event) => {
            const isEnter = event.key === 'Enter';
            // 'Spacebar' 是旧浏览器的 key 别名，必须与 ' ' 等价处理
            const isSpace = event.key === ' ' || event.key === 'Spacebar';
            if (isEnter || isSpace) {
                // Space 必须阻止默认页面滚动；Enter 无滚动语义，同路径阻止不改变其行为
                event.preventDefault();
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
class DataPage {
    static FAVORITES_KEY = 'arknights:favorites';
    static HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:';
    static ANNOTATE_COLORS = {
        yellow: '#fe2',
        green: '#7ee787',
        blue: '#79c0ff',
        pink: '#ffb3d1',
        orange: '#ffb757'
    };
    container = null;
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
    readFavorites = () => {
        const stored = this.read(DataPage.FAVORITES_KEY);
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
    readAllHighlights = () => {
        const result = {};
        try {
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (key !== null && key.startsWith(DataPage.HIGHLIGHT_KEY_PREFIX)) {
                    const pathname = key.slice(DataPage.HIGHLIGHT_KEY_PREFIX.length);
                    const stored = this.read(key);
                    if (stored !== null) {
                        try {
                            const parsed = JSON.parse(stored);
                            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                const data = parsed;
                                if (Array.isArray(data.ranges) && data.ranges.length > 0) {
                                    result[pathname] = data;
                                }
                            }
                        }
                        catch (e) { }
                    }
                }
            }
        }
        catch (e) { }
        return result;
    };
    formatDate = (timestamp) => {
        const date = new Date(timestamp);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    colorDot = (color) => {
        const bg = DataPage.ANNOTATE_COLORS[color] || DataPage.ANNOTATE_COLORS.yellow;
        return `<span class="dp-color-dot" style="background-color:${bg}"></span>`;
    };
    escapeHtml = (text) => {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    renderEmpty = () => {
        return `
      <div class="dp-empty">
        <p>暂无数据</p>
        <p class="dp-empty-hint">在文章页面使用底部工具箱的收藏和标注功能，数据将显示在这里。</p>
      </div>
    `;
    };
    renderFavorites = (favorites) => {
        const entries = Object.entries(favorites);
        if (entries.length === 0) {
            return '';
        }
        entries.sort((a, b) => b[1].time - a[1].time);
        const items = entries.map(([path, item]) => {
            return `
        <div class="dp-item dp-fav-item" data-path="${this.escapeHtml(path)}">
          <label class="dp-check">
            <input type="checkbox" class="dp-select" data-type="fav" data-path="${this.escapeHtml(path)}">
            <span class="dp-checkmark"></span>
          </label>
          <a class="dp-fav-link" href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener">
            <span class="dp-fav-title">${this.escapeHtml(item.title)}</span>
            <span class="dp-fav-path">${this.escapeHtml(path)}</span>
          </a>
          <span class="dp-fav-time">${this.formatDate(item.time)}</span>
          <button class="dp-btn dp-btn-delete" data-type="fav" data-path="${this.escapeHtml(path)}" title="删除">✕</button>
        </div>
      `;
        }).join('');
        return `
      <div class="dp-section">
        <div class="dp-section-header">
          <h3>收藏 (${entries.length})</h3>
          <div class="dp-section-actions">
            <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="clear-favs">清除全部</button>
          </div>
        </div>
        <div class="dp-list">${items}</div>
      </div>
    `;
    };
    renderHighlights = (highlights) => {
        const paths = Object.keys(highlights);
        if (paths.length === 0) {
            return '';
        }
        paths.sort();
        let totalCount = 0;
        const sections = paths.map(path => {
            const data = highlights[path];
            totalCount += data.ranges.length;
            const items = data.ranges.map((range, index) => {
                const color = range.color || 'yellow';
                const text = range.text ? this.escapeHtml(range.text) : '(无文本)';
                return `
          <div class="dp-item dp-hl-item" data-path="${this.escapeHtml(path)}" data-index="${index}">
            <label class="dp-check">
              <input type="checkbox" class="dp-select" data-type="hl" data-path="${this.escapeHtml(path)}" data-index="${index}">
              <span class="dp-checkmark"></span>
            </label>
            <span class="dp-hl-text">${this.colorDot(color)}<span class="dp-hl-content">${text}</span></span>
            <button class="dp-btn dp-btn-delete" data-type="hl" data-path="${this.escapeHtml(path)}" data-index="${index}" title="删除">✕</button>
          </div>
        `;
            }).join('');
            return `
        <div class="dp-hl-group">
          <div class="dp-hl-group-header">
            <label class="dp-check">
              <input type="checkbox" class="dp-select-group" data-path="${this.escapeHtml(path)}">
              <span class="dp-checkmark"></span>
            </label>
            <a class="dp-hl-group-link" href="${this.escapeHtml(path)}" target="_blank" rel="noopener">${this.escapeHtml(path)}</a>
            <span class="dp-hl-group-count">${data.ranges.length} 条标注</span>
            <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="clear-hl-group" data-path="${this.escapeHtml(path)}">清除</button>
          </div>
          <div class="dp-list">${items}</div>
        </div>
      `;
        }).join('');
        return `
      <div class="dp-section">
        <div class="dp-section-header">
          <h3>标注 (${totalCount})</h3>
          <div class="dp-section-actions">
            <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="clear-all-hl">清除全部</button>
          </div>
        </div>
        ${sections}
      </div>
    `;
    };
    renderToolbar = (favCount, hlCount) => {
        if (favCount === 0 && hlCount === 0) {
            return '';
        }
        return `
      <div class="dp-toolbar">
        <label class="dp-check dp-check-all">
          <input type="checkbox" class="dp-select-all">
          <span class="dp-checkmark"></span>
          全选
        </label>
        <button class="dp-btn dp-btn-sm dp-btn-danger" data-action="delete-selected" disabled>删除选中</button>
        <button class="dp-btn dp-btn-sm" data-action="export">导出数据</button>
      </div>
    `;
    };
    render = () => {
        if (this.container === null) {
            return;
        }
        const favorites = this.readFavorites();
        const highlights = this.readAllHighlights();
        const favCount = Object.keys(favorites).length;
        const hlCount = Object.values(highlights).reduce((sum, d) => sum + d.ranges.length, 0);
        if (favCount === 0 && hlCount === 0) {
            this.container.innerHTML = this.renderEmpty();
            return;
        }
        this.container.innerHTML =
            this.renderToolbar(favCount, hlCount) +
                this.renderFavorites(favorites) +
                this.renderHighlights(highlights);
    };
    deleteFavorite = (path) => {
        const favorites = this.readFavorites();
        delete favorites[path];
        this.write(DataPage.FAVORITES_KEY, Object.keys(favorites).length === 0 ? null : JSON.stringify(favorites));
    };
    deleteHighlight = (path, index) => {
        const key = DataPage.HIGHLIGHT_KEY_PREFIX + path;
        const stored = this.read(key);
        if (stored === null) {
            return;
        }
        try {
            const data = JSON.parse(stored);
            if (Array.isArray(data.ranges)) {
                data.ranges.splice(index, 1);
                if (data.ranges.length === 0) {
                    this.write(key, null);
                }
                else {
                    this.write(key, JSON.stringify(data));
                }
            }
        }
        catch (e) { }
    };
    clearHighlightsGroup = (path) => {
        this.write(DataPage.HIGHLIGHT_KEY_PREFIX + path, null);
    };
    clearAllHighlights = () => {
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key !== null && key.startsWith(DataPage.HIGHLIGHT_KEY_PREFIX)) {
                keys.push(key);
            }
        }
        keys.forEach(key => this.write(key, null));
    };
    clearAllFavorites = () => {
        this.write(DataPage.FAVORITES_KEY, null);
    };
    exportData = () => {
        const data = {
            favorites: this.readFavorites(),
            highlights: this.readAllHighlights(),
            exportTime: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `arknights-data-${this.formatDate(Date.now())}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    getSelectedItems = () => {
        const favs = [];
        const hls = [];
        if (this.container === null) {
            return { favs, hls };
        }
        this.container.querySelectorAll('.dp-select:checked').forEach((cb) => {
            const el = cb;
            const type = el.getAttribute('data-type');
            const path = el.getAttribute('data-path');
            if (path === null) {
                return;
            }
            if (type === 'fav') {
                favs.push(path);
            }
            else if (type === 'hl') {
                const index = parseInt(el.getAttribute('data-index') || '0', 10);
                hls.push({ path, index });
            }
        });
        return { favs, hls };
    };
    updateDeleteButton = () => {
        if (this.container === null) {
            return;
        }
        const btn = this.container.querySelector('[data-action="delete-selected"]');
        if (btn !== null) {
            const selected = this.container.querySelectorAll('.dp-select:checked').length;
            btn.disabled = selected === 0;
        }
    };
    updateGroupCheckboxes = () => {
        if (this.container === null) {
            return;
        }
        this.container.querySelectorAll('.dp-hl-group').forEach((group) => {
            const path = group.getAttribute('data-path');
            if (path === null) {
                return;
            }
            const groupCb = group.querySelector('.dp-select-group');
            const items = group.querySelectorAll('.dp-select[data-type="hl"]');
            const allChecked = items.length > 0 && Array.from(items).every(cb => cb.checked);
            if (groupCb !== null) {
                groupCb.checked = allChecked;
            }
        });
    };
    updateSelectAll = () => {
        if (this.container === null) {
            return;
        }
        const selectAll = this.container.querySelector('.dp-select-all');
        if (selectAll === null) {
            return;
        }
        const all = this.container.querySelectorAll('.dp-select');
        const checked = this.container.querySelectorAll('.dp-select:checked');
        selectAll.checked = all.length > 0 && all.length === checked.length;
    };
    onContainerClick = (event) => {
        const target = event.target;
        if (target === null || this.container === null) {
            return;
        }
        const deleteBtn = target.closest('.dp-btn-delete');
        if (deleteBtn !== null) {
            const type = deleteBtn.getAttribute('data-type');
            const path = deleteBtn.getAttribute('data-path');
            if (path === null) {
                return;
            }
            if (type === 'fav') {
                this.deleteFavorite(path);
            }
            else if (type === 'hl') {
                const index = parseInt(deleteBtn.getAttribute('data-index') || '0', 10);
                this.deleteHighlight(path, index);
            }
            this.render();
            return;
        }
        const actionBtn = target.closest('[data-action]');
        if (actionBtn !== null) {
            const action = actionBtn.getAttribute('data-action');
            if (action === 'clear-favs') {
                this.clearAllFavorites();
                this.render();
            }
            else if (action === 'clear-all-hl') {
                this.clearAllHighlights();
                this.render();
            }
            else if (action === 'clear-hl-group') {
                const path = actionBtn.getAttribute('data-path');
                if (path !== null) {
                    this.clearHighlightsGroup(path);
                    this.render();
                }
            }
            else if (action === 'delete-selected') {
                const { favs, hls } = this.getSelectedItems();
                favs.forEach(p => this.deleteFavorite(p));
                hls.forEach(h => this.deleteHighlight(h.path, h.index));
                this.render();
            }
            else if (action === 'export') {
                this.exportData();
            }
            return;
        }
    };
    onContainerChange = (event) => {
        const target = event.target;
        if (target === null || this.container === null) {
            return;
        }
        if (target.classList.contains('dp-select-all')) {
            const checked = target.checked;
            this.container.querySelectorAll('.dp-select').forEach(cb => {
                cb.checked = checked;
            });
            this.updateDeleteButton();
            this.updateGroupCheckboxes();
            return;
        }
        if (target.classList.contains('dp-select-group')) {
            const group = target.closest('.dp-hl-group');
            if (group !== null) {
                const checked = target.checked;
                group.querySelectorAll('.dp-select').forEach(cb => {
                    cb.checked = checked;
                });
            }
            this.updateDeleteButton();
            this.updateSelectAll();
            return;
        }
        if (target.classList.contains('dp-select')) {
            this.updateDeleteButton();
            this.updateGroupCheckboxes();
            this.updateSelectAll();
            return;
        }
    };
    constructor() {
        this.container = document.querySelector('#data-page');
        if (this.container !== null) {
            this.render();
            this.container.addEventListener('click', this.onContainerClick);
            this.container.addEventListener('change', this.onContainerChange);
        }
        // 非数据页首屏时 #data-page 不存在，仍须挂 pjax 监听，否则导航切入后不渲染
        document.addEventListener('pjax:success', () => {
            this.container = document.querySelector('#data-page');
            if (this.container !== null) {
                this.render();
                this.container.addEventListener('click', this.onContainerClick);
                this.container.addEventListener('change', this.onContainerChange);
            }
        });
    }
}
new DataPage();
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
    readSource = (container) => {
        const matches = [];
        for (const child of Array.from(container.children)) {
            if (child.matches('pre.monaco-editor-source[hidden][aria-hidden="true"]')) {
                matches.push(child);
            }
        }
        if (matches.length !== 1) {
            console.error(`MonacoEditor: expected exactly one direct child pre.monaco-editor-source[hidden][aria-hidden="true"], found ${matches.length}`);
            return null;
        }
        return matches[0].textContent ?? '';
    };
    createEditor = (container, lang, theme) => {
        if (container.getAttribute('data-initialized') === 'true')
            return;
        const mon = window.monaco || monaco;
        if (!mon || !mon.editor || !mon.editor.create) {
            console.error('MonacoEditor: monaco not available when trying to create editor');
            return;
        }
        // 必须在 monaco.editor.create 之前读取：Monaco 会往容器内追加节点
        const source = this.readSource(container);
        if (source === null)
            return;
        // 命中恰 1 且 monaco 可用之后才写标记：失败时允许后续 Pjax 切入重试
        container.setAttribute('data-initialized', 'true');
        const editor = mon.editor.create(container, {
            value: source,
            language: lang,
            theme: theme,
            readOnly: true,
            automaticLayout: true
        });
        // store editor instance to avoid garbage collection
        this.editors.set(container, editor);
    };
    findEditor = () => {
        const editors = document.querySelectorAll('.monaco-editor-code');
        editors.forEach((editor) => {
            const lang = editor.getAttribute('data-lang') || 'plaintext';
            const theme = editor.getAttribute('data-theme') || 'vs-dark';
            this.createEditor(editor, lang, theme);
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
class ProjectTooltip {
    boundCards = new WeakSet();
    bindCards = () => {
        document.querySelectorAll('.project-card').forEach(card => {
            if (this.boundCards.has(card)) {
                return;
            }
            this.boundCards.add(card);
            card.addEventListener('mousemove', (event) => this.onMousemove(event, card));
        });
    };
    onMousemove = (event, card) => {
        card.style.setProperty('--mx', String(event.clientX));
        card.style.setProperty('--my', String(event.clientY));
    };
    constructor() {
        this.bindCards();
        document.addEventListener('pjax:success', this.bindCards);
    }
}
var projectTooltip = new ProjectTooltip();
const RESOURCE_TIMEOUT_MS = 15_000;
const MAX_CAPTURE_EDGE = 16_384;
const MAX_CAPTURE_PIXELS = 33_554_432;
const MAX_FILENAME_CODE_UNITS = 80;
class ScreenshotControl {
    currentGeneration = 0;
    captureStates = new WeakMap();
    snapDomPromise = null;
    isCurrent = (generation) => {
        return generation === this.currentGeneration;
    };
    withTimeout = (promise) => {
        return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                reject(new Error('Screenshot resource timed out'));
            }, RESOURCE_TIMEOUT_MS);
            promise.then(value => {
                window.clearTimeout(timeoutId);
                resolve(value);
            }, error => {
                window.clearTimeout(timeoutId);
                reject(error);
            });
        });
    };
    loadSnapDom = (source) => {
        if (this.snapDomPromise !== null) {
            return this.snapDomPromise;
        }
        const promise = new Promise((resolve, reject) => {
            if (source.trim() === '') {
                reject(new Error('SnapDOM source is missing'));
                return;
            }
            const script = document.createElement('script');
            let timeoutId = 0;
            const cleanup = () => {
                window.clearTimeout(timeoutId);
                script.removeEventListener('load', onLoad);
                script.removeEventListener('error', onError);
            };
            const onLoad = () => {
                cleanup();
                const candidate = window.snapdom;
                if (typeof candidate === 'function' && typeof Reflect.get(candidate, 'toCanvas') === 'function') {
                    resolve(candidate);
                }
                else {
                    reject(new Error('SnapDOM global is invalid'));
                }
            };
            const onError = () => {
                cleanup();
                reject(new Error('SnapDOM failed to load'));
            };
            script.addEventListener('load', onLoad);
            script.addEventListener('error', onError);
            script.src = source;
            script.async = true;
            timeoutId = window.setTimeout(onError, RESOURCE_TIMEOUT_MS);
            document.head.appendChild(script);
        });
        this.snapDomPromise = promise;
        return promise;
    };
    waitForFonts = () => {
        if (document.fonts === undefined) {
            return Promise.resolve();
        }
        return this.withTimeout(Promise.resolve(document.fonts.ready)).then(() => undefined);
    };
    waitForImage = (image) => {
        if (image.complete) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            image.setAttribute('loading', 'eager');
            if (image.complete) {
                image.setAttribute('loading', 'lazy');
                resolve();
                return;
            }
            const cleanup = () => {
                window.clearTimeout(timeoutId);
                image.removeEventListener('load', settle);
                image.removeEventListener('error', settle);
                image.setAttribute('loading', 'lazy');
            };
            const settle = () => {
                cleanup();
                resolve();
            };
            const timeoutId = window.setTimeout(() => {
                cleanup();
                reject(new Error('Screenshot image timed out'));
            }, RESOURCE_TIMEOUT_MS);
            image.addEventListener('load', settle);
            image.addEventListener('error', settle);
        });
    };
    waitForImages = async (root) => {
        const images = [...root.querySelectorAll('img')];
        const loadingStates = images.map(image => ({
            image: image,
            loading: image.getAttribute('loading')
        }));
        try {
            await Promise.all(images.map(image => this.waitForImage(image)));
        }
        finally {
            loadingStates.forEach(state => {
                if (state.loading === null) {
                    state.image.removeAttribute('loading');
                }
                else {
                    state.image.setAttribute('loading', state.loading);
                }
            });
        }
    };
    computeScale = (width, height, pixelRatio) => {
        return Math.min(1, MAX_CAPTURE_EDGE / (width * pixelRatio), MAX_CAPTURE_EDGE / (height * pixelRatio), Math.sqrt(MAX_CAPTURE_PIXELS / (width * height * pixelRatio * pixelRatio)));
    };
    createFilename = () => {
        const postTitle = document.querySelector('#post-title');
        let title = postTitle === null
            ? document.title.split('|').at(-1)?.trim() || ''
            : postTitle.textContent || '';
        title = title
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
            .replace(/[ .]+$/g, '')
            .slice(0, MAX_FILENAME_CODE_UNITS)
            .trim();
        if (title === '') {
            title = 'post';
        }
        const now = new Date();
        const date = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('');
        const time = [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join('');
        return `${title}-${date}-${time}.png`;
    };
    detachPaginator = (lease) => {
        const paginator = lease.root.querySelector('#paginator');
        if (paginator === null) {
            return null;
        }
        const parent = paginator.parentNode;
        if (parent === null) {
            return null;
        }
        const restore = {
            lease,
            launchGeneration: lease.generation,
            paginator,
            parent,
            nextSibling: paginator.nextSibling
        };
        parent.removeChild(paginator);
        return restore;
    };
    restorePaginator = (restore) => {
        if (restore === null) {
            return;
        }
        const state = this.captureStates.get(restore.lease.root);
        const currentPaginator = restore.lease.root.querySelector('#paginator');
        if (state?.active !== restore.lease ||
            currentPaginator !== null ||
            !restore.lease.root.contains(restore.parent) ||
            (restore.launchGeneration !== this.currentGeneration && !restore.lease.root.isConnected)) {
            return;
        }
        const nextSibling = restore.nextSibling !== null && restore.parent.contains(restore.nextSibling)
            ? restore.nextSibling
            : null;
        restore.parent.insertBefore(restore.paginator, nextSibling);
    };
    createPng = (canvas) => {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob(blob => {
                    if (blob === null) {
                        reject(new Error('Screenshot PNG is empty'));
                    }
                    else {
                        resolve(blob);
                    }
                }, 'image/png');
            }
            catch (error) {
                reject(error);
            }
        });
    };
    download = (blob, filename) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
    };
    // 共享 status 的唯一写入口在 lease：本次写入同时作废其它持有者（如 BGM）的 lease 与 timer
    writeStatus = (message) => {
        claimStatus(message, { owner: 'screenshot' });
    };
    bindCurrentButton = () => {
        const button = document.querySelector('.toolbox-screenshot[data-action="screenshot"]');
        if (button === null) {
            return;
        }
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
    };
    setCaptureButton = (button) => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    };
    getCaptureState = (root) => {
        const existing = this.captureStates.get(root);
        if (existing !== undefined) {
            return existing;
        }
        const state = {
            active: null,
            activePromise: null,
            pending: null,
            pendingPromise: null
        };
        this.captureStates.set(root, state);
        return state;
    };
    isRequestCurrent = (request) => {
        const root = document.querySelector('#post-content');
        const button = document.querySelector('.toolbox-screenshot[data-action="screenshot"]');
        return this.isCurrent(request.generation) && root === request.root && button === request.button;
    };
    pendingOwnsButton = (state, lease) => {
        const pending = state.pending;
        return pending !== null &&
            pending.button === lease.button &&
            this.isRequestCurrent(pending);
    };
    captureCurrent = async (lease) => {
        const { root, button, generation: launchGeneration } = lease;
        let paginatorRestore = null;
        this.setCaptureButton(button);
        this.writeStatus(button.dataset.labelPreparing || '');
        try {
            const imagesReady = this.waitForImages(root);
            void imagesReady.catch(() => undefined);
            const snapdom = await this.loadSnapDom(button.dataset.snapdomSrc || '');
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            await this.waitForFonts();
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            await imagesReady;
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            const bounds = root.getBoundingClientRect();
            if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
                throw new Error('Screenshot target size is invalid');
            }
            const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
            const scale = this.computeScale(bounds.width, bounds.height, pixelRatio);
            if (scale < 1) {
                this.writeStatus(button.dataset.labelScaled || '');
            }
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            paginatorRestore = this.detachPaginator(lease);
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            const canvas = await snapdom.toCanvas(root, { scale: scale, dpr: 1 });
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            const blob = await this.createPng(canvas);
            if (!this.isCurrent(launchGeneration)) {
                return;
            }
            const filename = this.createFilename();
            this.download(blob, filename);
            this.writeStatus(scale < 1
                ? button.dataset.labelScaledSuccess || ''
                : button.dataset.labelSuccess || '');
        }
        catch (error) {
            if (this.isCurrent(launchGeneration)) {
                this.writeStatus(button.dataset.labelFailed || '');
            }
        }
        finally {
            this.restorePaginator(paginatorRestore);
            const state = this.captureStates.get(root);
            if (state?.active === lease && !this.pendingOwnsButton(state, lease)) {
                button.disabled = false;
                button.setAttribute('aria-busy', 'false');
            }
        }
    };
    startCapture = (request) => {
        const state = this.getCaptureState(request.root);
        if (!this.isRequestCurrent(request)) {
            return Promise.resolve();
        }
        if (state.active !== null) {
            return state.activePromise ?? Promise.resolve();
        }
        const lease = {
            root: request.root,
            button: request.button,
            generation: request.generation
        };
        state.active = lease;
        const execution = this.captureCurrent(lease);
        const trackedPromise = execution.finally(() => {
            if (state.active === lease) {
                state.active = null;
                state.activePromise = null;
            }
        });
        state.activePromise = trackedPromise;
        return trackedPromise;
    };
    startPendingCapture = (state, request) => {
        if (state.pending !== request) {
            return Promise.resolve();
        }
        state.pending = null;
        state.pendingPromise = null;
        return this.startCapture(request);
    };
    enqueueCapture = (state, request) => {
        const activePromise = state.activePromise;
        if (activePromise === null) {
            return this.startCapture(request);
        }
        const pendingPromise = activePromise.then(() => this.startPendingCapture(state, request), () => this.startPendingCapture(state, request));
        state.pending = request;
        state.pendingPromise = pendingPromise;
        this.setCaptureButton(request.button);
        this.writeStatus(request.button.dataset.labelPreparing || '');
        return pendingPromise;
    };
    cancelCurrentGeneration = () => {
        this.currentGeneration += 1;
        this.bindCurrentButton();
    };
    capture = () => {
        const root = document.querySelector('#post-content');
        if (root === null) {
            return Promise.resolve();
        }
        const button = document.querySelector('.toolbox-screenshot[data-action="screenshot"]');
        if (button === null) {
            return Promise.resolve();
        }
        const state = this.getCaptureState(root);
        const request = {
            root,
            button,
            generation: this.currentGeneration
        };
        if (state.active?.generation === request.generation &&
            state.active.button === button &&
            state.activePromise !== null) {
            return state.activePromise;
        }
        if (state.pending?.generation === request.generation &&
            state.pending.button === button &&
            state.pendingPromise !== null) {
            return state.pendingPromise;
        }
        if (state.active === null) {
            return this.startCapture(request);
        }
        return this.enqueueCapture(state, request);
    };
    constructor() {
        document.addEventListener('pjax:send', this.cancelCurrentGeneration);
        document.addEventListener('pjax:error', this.cancelCurrentGeneration);
        document.addEventListener('pjax:success', this.cancelCurrentGeneration);
    }
}
var screenshotControl = new ScreenshotControl();
Object.assign(window, { screenshotControl: screenshotControl });
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
// 共享叶子层：存储键、序列化与跨控制器反馈时序常量（零 DOM 查询、零事件、零 timer）
var ToolboxModules;
(function (ToolboxModules) {
    ToolboxModules.HIGHLIGHT_KEY_PREFIX = 'arknights:highlights:';
    ToolboxModules.FAVORITES_KEY = 'arknights:favorites';
    ToolboxModules.ANNOTATE_COLOR_KEY = 'arknights:annotate-color';
    ToolboxModules.ANNOTATE_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
    // 复制成功反馈（分享 URL 与选区复制共用）的 .copied 态停留时长：常量随 owner 下沉到共享叶子，
    // 避免同层控制器之间跨文件裸取对方命名空间成员（namespace 跨文件无编译期防护）
    ToolboxModules.COPIED_DELAY = 1200;
    function readRaw(key) {
        try {
            return window.localStorage.getItem(key);
        }
        catch (e) {
            return null;
        }
    }
    ToolboxModules.readRaw = readRaw;
    function writeRaw(key, value) {
        try {
            if (value === null) {
                window.localStorage.removeItem(key);
            }
            else {
                window.localStorage.setItem(key, value);
            }
        }
        catch (e) { }
    }
    ToolboxModules.writeRaw = writeRaw;
    function highlightKey() {
        return ToolboxModules.HIGHLIGHT_KEY_PREFIX + window.location.pathname;
    }
    ToolboxModules.highlightKey = highlightKey;
    function parseHighlights(stored) {
        if (stored === null) {
            return [];
        }
        try {
            const parsed = JSON.parse(stored);
            const container = parsed;
            if (parsed === null || typeof parsed !== 'object' || !Array.isArray(container.ranges)) {
                return [];
            }
            const ranges = [];
            container.ranges.forEach((item) => {
                const range = item;
                if (typeof range.start === 'number' && typeof range.length === 'number' && range.start >= 0 && range.length > 0) {
                    const color = typeof range.color === 'string' && ToolboxModules.ANNOTATE_COLORS.includes(range.color) ? range.color : 'yellow';
                    const text = typeof range.text === 'string' ? range.text : undefined;
                    ranges.push({ start: range.start, length: range.length, color: color, text: text });
                }
            });
            return ranges;
        }
        catch (e) {
            return [];
        }
    }
    ToolboxModules.parseHighlights = parseHighlights;
    function serializeHighlights(records) {
        return JSON.stringify({ version: 1, ranges: records });
    }
    ToolboxModules.serializeHighlights = serializeHighlights;
    function parseFavorites(stored) {
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
    }
    ToolboxModules.parseFavorites = parseFavorites;
    function serializeFavorites(records) {
        return JSON.stringify(records);
    }
    ToolboxModules.serializeFavorites = serializeFavorites;
    function readAnnotateColor() {
        const stored = readRaw(ToolboxModules.ANNOTATE_COLOR_KEY);
        return stored !== null && ToolboxModules.ANNOTATE_COLORS.includes(stored) ? stored : 'yellow';
    }
    ToolboxModules.readAnnotateColor = readAnnotateColor;
    function writeAnnotateColor(color) {
        writeRaw(ToolboxModules.ANNOTATE_COLOR_KEY, color);
    }
    ToolboxModules.writeAnnotateColor = writeAnnotateColor;
})(ToolboxModules || (ToolboxModules = {}));
var ToolboxModules;
(function (ToolboxModules) {
    ToolboxModules.EXCLUDED_SELECTOR = '.bottom-btn, #annotate-toolbar, #post-footer, #post-info, #reward, #comments, #paginator, script, style';
    // 标注序列化：以正文文本节点的累计字符偏移（start + length）记录——<mark> 包裹不改变文本总量，
    // 增删标注后同一偏移仍指向同一段文字；文章文本变化导致偏移漂移时按边界校验静默丢弃
    function createAnnotationController() {
        let pendingRange = null;
        const getArticle = () => document.querySelector('article');
        const getToolbar = () => document.querySelector('#annotate-toolbar');
        const getAnnotateButton = () => document.querySelector('.toolbox-annotate');
        const toolbarNode = (selector) => document.querySelector('#annotate-toolbar ' + selector);
        const isAnnotating = () => document.body.classList.contains('annotating');
        const syncAnnotateButton = () => {
            const button = getAnnotateButton();
            if (button === null)
                return;
            const on = isAnnotating();
            button.classList.toggle('active', on);
            button.setAttribute('aria-pressed', String(on));
        };
        const setAnnotating = (on) => {
            document.body.classList.toggle('annotating', on);
            syncAnnotateButton();
            if (on)
                return;
            hideToolbar();
            pendingRange = null;
        };
        const showToolbar = (range) => {
            const toolbar = getToolbar();
            if (toolbar === null)
                return;
            placeToolbar(range);
            toolbar.classList.add('open');
            toolbar.setAttribute('aria-hidden', 'false');
            updateToolbarButtons(range);
        };
        const hideToolbar = () => {
            const toolbar = getToolbar();
            if (toolbar === null)
                return;
            toolbar.classList.remove('open');
            toolbar.setAttribute('aria-hidden', 'true');
            closeColors();
        };
        const placeToolbar = (range) => {
            const toolbar = getToolbar();
            if (toolbar === null || typeof range.getBoundingClientRect !== 'function')
                return;
            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0)
                return;
            const margin = 8;
            const gap = 6;
            const width = toolbar.offsetWidth;
            const height = toolbar.offsetHeight;
            let left = rect.left + rect.width / 2 - width / 2;
            left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
            let top = rect.top - height - gap;
            if (top < margin)
                top = Math.min(rect.bottom + gap, window.innerHeight - height - margin);
            toolbar.style.left = left + 'px';
            toolbar.style.top = top + 'px';
        };
        const onSelectionChange = () => {
            if (!isAnnotating())
                return;
            const range = selectionRange();
            if (range === null)
                return hideToolbar();
            showToolbar(range);
        };
        const closeColors = () => {
            const panel = toolbarNode('.at-colors');
            if (panel !== null)
                panel.classList.remove('open');
        };
        const toolbarActions = {
            'at-annotate': () => annotateSelection(),
            'at-clear': () => clearSelectionHighlights(),
            'at-copy': () => copySelection(),
            'at-search': () => searchSelection(),
            'at-color': () => toggleColors()
        };
        const onToolbarClick = (event) => {
            const target = event.target;
            if (target === null || typeof target.closest !== 'function' || target.closest('#annotate-toolbar') === null)
                return;
            const colorOption = target.closest('.at-color-opt');
            if (colorOption !== null)
                return setAnnotateColor(colorOption.getAttribute('data-color'));
            const button = target.closest('.at-btn');
            if (button === null)
                return;
            for (const name of Array.from(button.classList)) {
                const action = toolbarActions[name];
                if (action !== undefined)
                    return action();
            }
        };
        // 选区覆盖判定：选区被高亮全覆盖 → 无从新增（annotate 禁用）；不含高亮 → 无从清除（clear 禁用）
        const updateToolbarButtons = (range) => {
            const article = getArticle();
            const annotate = toolbarNode('.at-annotate');
            const clear = toolbarNode('.at-clear');
            if (article === null || annotate === null || clear === null)
                return;
            const layout = textLayout(article);
            const start = boundaryOffset(range.startContainer, range.startOffset, layout);
            const end = boundaryOffset(range.endContainer, range.endOffset, layout);
            const state = start === null || end === null || start >= end ? null : selectionGaps(article, layout, start, end);
            annotate.disabled = state === null || state.gaps.length === 0;
            clear.disabled = state === null || !state.hasHighlight;
        };
        const refreshToolbarButtons = () => {
            const toolbar = getToolbar();
            if (toolbar === null || !toolbar.classList.contains('open') || !isAnnotating())
                return;
            const range = selectionRange();
            if (range === null)
                hideToolbar();
            else
                updateToolbarButtons(range);
        };
        // 选区 [start,end) 内「未被既有高亮覆盖」的补齐段落；hasHighlight = 选区含既有高亮
        const selectionGaps = (article, layout, start, end) => {
            const covered = Array.from(article.querySelectorAll('.hl-mark'))
                .map((mark) => markOffsets(mark, layout))
                .filter((offsets) => offsets !== null && offsets.start < end && start < offsets.end)
                .map((offsets) => ({ start: Math.max(offsets.start, start), end: Math.min(offsets.end, end) }))
                .sort((left, right) => left.start - right.start);
            const gaps = [];
            let cursor = start;
            covered.forEach((item) => {
                if (item.start > cursor)
                    gaps.push({ start: cursor, end: item.start });
                cursor = Math.max(cursor, item.end);
            });
            if (cursor < end)
                gaps.push({ start: cursor, end: end });
            return { gaps: gaps, hasHighlight: covered.length !== 0 };
        };
        const isAnnotatable = (node) => {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            const article = getArticle();
            if (element === null || article === null || !article.contains(element))
                return false;
            return element.closest(ToolboxModules.EXCLUDED_SELECTOR) === null;
        };
        const textLayout = (root) => {
            const nodes = [];
            const starts = [];
            let total = 0;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
                if (!isAnnotatable(node))
                    continue;
                nodes.push(node);
                starts.push(total);
                total += node.data.length;
            }
            return { nodes: nodes, starts: starts, total: total };
        };
        // 'from' 取 pivot 自身、被包含或其后的首个文本；'after' 取 pivot 之后且不含于 pivot 的首个文本
        const adjacentText = (pivot, layout, mode) => {
            for (const text of layout.nodes) {
                if (mode === 'from' && text === pivot)
                    return text;
                const relation = pivot.compareDocumentPosition(text);
                const following = (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
                const inside = (relation & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0;
                if (mode === 'from' ? following || inside : following && !inside)
                    return text;
            }
            return null;
        };
        const boundaryOffset = (node, offset, layout) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const index = layout.nodes.indexOf(node);
                if (index < 0)
                    return null;
                return layout.starts[index] + Math.min(offset, node.data.length);
            }
            if (node.nodeType !== Node.ELEMENT_NODE)
                return null;
            const element = node;
            const found = offset < element.childNodes.length
                ? adjacentText(element.childNodes[offset], layout, 'from')
                : adjacentText(element, layout, 'after');
            return found === null ? layout.total : layout.starts[layout.nodes.indexOf(found)];
        };
        // 起边界取 position 之后的首个文本（避免范围横跨其间元素，如被排除的 #post-info）；
        // 止边界取 position 之前的末个文本（避免吞入其后元素的标签结构，产生嵌套 mark）
        const pointAt = (layout, position, forward) => {
            if (layout.nodes.length === 0)
                return null;
            const step = forward ? 1 : -1;
            const limit = forward ? layout.nodes.length : -1;
            for (let index = forward ? 0 : layout.nodes.length - 1; index !== limit; index += step) {
                const node = layout.nodes[index];
                const start = layout.starts[index];
                const end = start + node.data.length;
                if (forward ? position < end : position > start)
                    return { node, offset: Math.min(Math.max(position - start, 0), node.data.length) };
            }
            const edge = forward ? layout.nodes.length - 1 : 0;
            return { node: layout.nodes[edge], offset: forward ? layout.nodes[edge].data.length : 0 };
        };
        const rangeFromOffsets = (layout, start, end) => {
            if (start < 0 || end > layout.total || start >= end)
                return null;
            const startPoint = pointAt(layout, start, true);
            const endPoint = pointAt(layout, end, false);
            if (startPoint === null || endPoint === null)
                return null;
            const range = document.createRange();
            range.setStart(startPoint.node, startPoint.offset);
            range.setEnd(endPoint.node, endPoint.offset);
            return range;
        };
        const wrapRange = (range, color, text) => {
            const mark = document.createElement('mark');
            mark.className = 'hl-mark';
            mark.setAttribute('data-color', color);
            if (text !== undefined)
                mark.setAttribute('data-text', text);
            try {
                range.surroundContents(mark);
                return true;
            }
            catch (e) { }
            try {
                mark.appendChild(range.extractContents());
                range.insertNode(mark);
                return true;
            }
            catch (error) {
                return false;
            }
        };
        const unwrapMark = (mark) => {
            const parent = mark.parentNode;
            if (parent === null)
                return;
            while (mark.firstChild !== null) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize();
        };
        const removeAllMarks = (article) => {
            article.querySelectorAll('.hl-mark').forEach((mark) => unwrapMark(mark));
        };
        const markOffsets = (mark, layout) => {
            const range = document.createRange();
            range.selectNodeContents(mark);
            const start = boundaryOffset(range.startContainer, range.startOffset, layout);
            const end = boundaryOffset(range.endContainer, range.endOffset, layout);
            if (start === null || end === null || start >= end)
                return null;
            return { start: start, end: end };
        };
        const isRangeAnnotatable = (range) => !range.collapsed && isAnnotatable(range.startContainer) && isAnnotatable(range.endContainer);
        const selectionRange = () => {
            const selection = window.getSelection();
            if (selection === null || selection.rangeCount === 0 || selection.isCollapsed)
                return null;
            const range = selection.getRangeAt(0);
            return isRangeAnnotatable(range) ? range : null;
        };
        const onMouseDown = (event) => {
            pendingRange = null;
            const target = event.target;
            if (target === null || typeof target.closest !== 'function')
                return;
            const inToolbar = target.closest('#annotate-toolbar') !== null;
            if (!inToolbar && target.closest('.toolbox-annotate') === null)
                return;
            // 阻止默认（选区折叠 / 焦点转移）：否则 selectionchange 会在 click 之前隐藏工具条、丢失目标选区
            if (inToolbar)
                event.preventDefault();
            const selection = window.getSelection();
            if (selection === null || selection.rangeCount === 0 || selection.isCollapsed)
                return;
            pendingRange = selection.getRangeAt(0).cloneRange();
        };
        const annotate = () => {
            const on = !isAnnotating();
            setAnnotating(on);
            if (on) {
                const range = resolveRange();
                if (range !== null)
                    highlightRange(range);
            }
        };
        // 只补选区中未标注的部分（按当前色新增）；既有高亮保持原样（不重着色、不删除、不合并）
        const highlightRange = (range) => {
            const article = getArticle();
            if (article === null)
                return;
            const layout = textLayout(article);
            const start = boundaryOffset(range.startContainer, range.startOffset, layout);
            const end = boundaryOffset(range.endContainer, range.endOffset, layout);
            const gaps = start === null || end === null || start >= end ? [] : selectionGaps(article, layout, start, end).gaps;
            let wrapped = false;
            gaps.forEach((gap) => {
                const gapRange = rangeFromOffsets(textLayout(article), gap.start, gap.end);
                if (gapRange !== null) {
                    const text = gapRange.toString();
                    if (wrapRange(gapRange, ToolboxModules.readAnnotateColor(), text))
                        wrapped = true;
                }
            });
            if (wrapped)
                persistHighlights();
        };
        const onMarkClick = (event) => {
            // 标注模式下点击标注文字不移除——由工具栏「清除」按钮操作
            if (isAnnotating())
                return;
            const target = event.target;
            if (target === null || typeof target.closest !== 'function')
                return;
            const mark = target.closest('.hl-mark');
            if (mark === null || !isAnnotatable(mark))
                return;
            unwrapMark(mark);
            persistHighlights();
        };
        const resolveRange = () => {
            const current = selectionRange();
            if (current !== null)
                return current;
            if (pendingRange !== null && isRangeAnnotatable(pendingRange))
                return pendingRange;
            return null;
        };
        const annotateSelection = () => {
            const range = resolveRange();
            if (range !== null)
                highlightRange(range);
            refreshToolbarButtons();
        };
        const clearSelectionHighlights = () => {
            const range = resolveRange();
            const article = getArticle();
            if (range === null || article === null)
                return refreshToolbarButtons();
            const layout = textLayout(article);
            const start = boundaryOffset(range.startContainer, range.startOffset, layout);
            const end = boundaryOffset(range.endContainer, range.endOffset, layout);
            if (start === null || end === null || start >= end)
                return refreshToolbarButtons();
            const affected = [];
            article.querySelectorAll('.hl-mark').forEach((mark) => {
                const offsets = markOffsets(mark, layout);
                if (offsets !== null && offsets.start < end && start < offsets.end) {
                    affected.push({ start: offsets.start, end: offsets.end, color: markColor(mark) });
                    unwrapMark(mark);
                }
            });
            affected.forEach((item) => {
                const beforeEnd = Math.min(item.end, start);
                const afterStart = Math.max(item.start, end);
                if (beforeEnd > item.start) {
                    const before = rangeFromOffsets(textLayout(article), item.start, beforeEnd);
                    if (before !== null)
                        wrapRange(before, item.color);
                }
                if (item.end > afterStart) {
                    const after = rangeFromOffsets(textLayout(article), afterStart, item.end);
                    if (after !== null)
                        wrapRange(after, item.color);
                }
            });
            if (affected.length !== 0)
                persistHighlights();
            refreshToolbarButtons();
        };
        const copySelection = () => {
            const range = resolveRange();
            if (range === null)
                return;
            const text = range.toString();
            if (text.length === 0)
                return;
            const complete = () => {
                const button = toolbarNode('.at-copy');
                if (button === null)
                    return;
                button.classList.add('copied');
                setTimeout(() => button.classList.remove('copied'), ToolboxModules.COPIED_DELAY);
            };
            const fallback = () => {
                if (typeof document.execCommand === 'function' && document.execCommand('copy'))
                    complete();
            };
            try {
                navigator.clipboard.writeText(text).then(complete).catch(fallback);
            }
            catch (e) {
                fallback();
            }
        };
        const searchSelection = () => {
            const range = resolveRange();
            if (range === null)
                return;
            const keyword = range.toString().trim();
            if (keyword.length === 0)
                return;
            const search = window.searchWithKeyword;
            if (typeof search === 'function')
                search(keyword);
            hideToolbar();
        };
        const toggleColors = () => {
            const panel = toolbarNode('.at-colors');
            if (panel !== null)
                panel.classList.toggle('open');
        };
        const setAnnotateColor = (color) => {
            if (color === null || !ToolboxModules.ANNOTATE_COLORS.includes(color))
                return;
            ToolboxModules.writeAnnotateColor(color);
            applyAnnotateColor();
        };
        const applyAnnotateColor = () => {
            const color = ToolboxModules.readAnnotateColor();
            const button = toolbarNode('.at-color');
            if (button !== null)
                button.setAttribute('data-color', color);
            document.querySelectorAll('#annotate-toolbar .at-color-opt').forEach((option) => {
                option.classList.toggle('active', option.getAttribute('data-color') === color);
            });
        };
        const markColor = (mark) => {
            const color = mark.getAttribute('data-color');
            return color !== null && ToolboxModules.ANNOTATE_COLORS.includes(color) ? color : 'yellow';
        };
        const persistHighlights = () => {
            const article = getArticle();
            if (article === null)
                return;
            const layout = textLayout(article);
            const ranges = [];
            article.querySelectorAll('.hl-mark').forEach((mark) => {
                const offsets = markOffsets(mark, layout);
                if (offsets !== null) {
                    const item = { start: offsets.start, length: offsets.end - offsets.start };
                    const color = markColor(mark);
                    if (color !== 'yellow')
                        item.color = color;
                    const text = mark.getAttribute('data-text') || undefined;
                    if (text !== undefined)
                        item.text = text;
                    ranges.push(item);
                }
            });
            ranges.sort((left, right) => left.start - right.start);
            ToolboxModules.writeRaw(ToolboxModules.highlightKey(), ranges.length === 0 ? null : ToolboxModules.serializeHighlights(ranges));
        };
        const restoreHighlights = () => {
            const article = getArticle();
            const ranges = ToolboxModules.parseHighlights(ToolboxModules.readRaw(ToolboxModules.highlightKey()));
            if (article === null || ranges.length === 0)
                return;
            removeAllMarks(article);
            ranges.sort((left, right) => left.start - right.start);
            ranges.forEach((item) => {
                const range = rangeFromOffsets(textLayout(article), item.start, item.start + item.length);
                if (range !== null)
                    wrapRange(range, item.color ?? 'yellow', item.text);
            });
        };
        const restore = () => {
            hideToolbar();
            restoreHighlights();
            syncAnnotateButton();
            applyAnnotateColor();
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('click', onMarkClick);
        document.addEventListener('click', onToolbarClick);
        const main = document.querySelector('main');
        if (main !== null)
            main.addEventListener('scroll', hideToolbar, { passive: true });
        return {
            annotate,
            isAnnotating,
            restore,
            closeColors,
            hideToolbar,
            dismissPendingSelection: () => { pendingRange = null; },
            refreshToolbarButtons
        };
    }
    ToolboxModules.createAnnotationController = createAnnotationController;
})(ToolboxModules || (ToolboxModules = {}));
// 分享与 .copied 反馈：唯一 status 写入者为共享 lease，自有唯一一次性 timer
var ToolboxModules;
(function (ToolboxModules) {
    function createShareController(closeToolbox) {
        const getShareButton = () => document.querySelector('.toolbox-share');
        const copyShareUrl = (url) => {
            const button = getShareButton();
            const complete = () => {
                if (button === null) {
                    return;
                }
                claimStatus(button.dataset.labelCopied || '', { owner: 'share' });
                button.classList.add('copied');
                setTimeout(() => {
                    button.classList.remove('copied');
                    closeToolbox();
                }, ToolboxModules.COPIED_DELAY);
            };
            try {
                navigator.clipboard.writeText(url).then(complete).catch(() => { });
            }
            catch (e) { }
        };
        return {
            share: () => {
                const data = { title: document.title, url: window.location.href };
                if (typeof navigator.share === 'function') {
                    try {
                        navigator.share(data).then(() => closeToolbox()).catch(() => { });
                    }
                    catch (e) { }
                    return;
                }
                copyShareUrl(data.url);
            }
        };
    }
    ToolboxModules.createShareController = createShareController;
})(ToolboxModules || (ToolboxModules = {}));
// 收藏与 .saved 反馈：不创建任何 UI timer，status 写入经共享 lease
var ToolboxModules;
(function (ToolboxModules) {
    function createFavoriteController() {
        const getFavoriteButton = () => document.querySelector('.toolbox-favorite');
        const readFavorites = () => ToolboxModules.parseFavorites(ToolboxModules.readRaw(ToolboxModules.FAVORITES_KEY));
        const applyFavoriteState = () => {
            const button = getFavoriteButton();
            if (button === null) {
                return;
            }
            const saved = readFavorites()[window.location.pathname] !== undefined;
            button.classList.toggle('saved', saved);
            button.setAttribute('aria-pressed', String(saved));
            const label = button.getAttribute(saved ? 'data-label-saved' : 'data-label-default');
            if (label !== null) {
                button.setAttribute('title', label);
                button.setAttribute('aria-label', label);
            }
        };
        return {
            favorite: () => {
                const favorites = readFavorites();
                const path = window.location.pathname;
                const wasSaved = favorites[path] !== undefined;
                if (wasSaved) {
                    delete favorites[path];
                }
                else {
                    favorites[path] = { url: window.location.href, title: document.title, time: Date.now() };
                }
                ToolboxModules.writeRaw(ToolboxModules.FAVORITES_KEY, Object.keys(favorites).length === 0 ? null : ToolboxModules.serializeFavorites(favorites));
                applyFavoriteState();
                const button = getFavoriteButton();
                if (button !== null) {
                    claimStatus(wasSaved
                        ? button.dataset.labelRemovedStatus || ''
                        : button.dataset.labelSavedStatus || '', { owner: 'favorite' });
                }
            },
            restore: applyFavoriteState
        };
    }
    ToolboxModules.createFavoriteController = createFavoriteController;
})(ToolboxModules || (ToolboxModules = {}));
// 扇形布局：纯计算（layoutFan）与副作用（写入 CSS 自定义属性）分离，取代原「纯 CSS 动态角度」方案。
// 被取代的方案用 `:has()` 四档 + clamp() + cos()/sin() 派生链，只覆盖 ≤5 项，且 4 项时步长被拉大到 30°、
// 相邻圆心距涨到 34.2px（对 40px 目标既稀疏又角部重叠），末项仍顶在象限端点 90°。
// 现算法为「恒定角密度 + 半径随项数自适应」：步长 = 象限张角 / (n − 1)，
// 半径 = max(让位半径, 圆心距 / (2·sin(步长/2)))，相邻圆心距在密度未被让位半径顶高时恒为五项档弦长 FAN_DENSITY_PX。
// 让位半径（不再是一个与项数无关的标量下限）= 工具项命中盒与 toggle 命中盒轴对齐不再重叠所需的半径：
// 命中盒在两轴上的投影为 R·|cosθ| 与 R·|sinθ|，两轴都不重叠要求 R ≥ 边长 / max(|cosθ|, |sinθ|)；
// 半径整簇共用，故取簇内最大需求（在象限平分线处最大，因为该处 max(|cosθ|,|sinθ|) 最小）。
// 注意：40px 命中盒彼此在 n ≥ 3 时必然重叠（密度 25.75px < 40px），这是「密排小图标 + 大命中盒」的
// 既有取舍，不是可由半径消除的量；可由半径消除的是「工具项与 toggle 自身重叠」与「项间图标相压」，
// 前者由让位半径保证，后者因各档半径下相邻两轴偏移至少有一轴 > 图标边长 16px 而恒成立。
// 几何只依赖模块常量与项数，无字体度量参与，故没有 document.fonts.ready 触发点。
const FAN_RADIANS = Math.PI / 180;
const FAN_SPAN_DEG = 90;
// 五项档是密度基准：密度值即该档弦长，故 n=5 与旧硬编码表逐值相同（回归见证）
const FAN_REFERENCE_RADIUS_PX = 66;
const FAN_REFERENCE_STEP_DEG = 22.5;
const FAN_DENSITY_PX = 2 * FAN_REFERENCE_RADIUS_PX * Math.sin(FAN_REFERENCE_STEP_DEG / 2 * FAN_RADIANS);
// 命中盒边长镜像 .bottom-btn 的 `a, button` 声明（width 40px / height 40px），与 toggle 同尺寸
const FAN_HIT_BOX_PX = 40;
const FAN_PULL_PX = 10;
// 悬停放大倍率的唯一消费方是 CSS hover 规则的 scale()；此处镜像常量只为两侧数值同表可审
// （与 .toolbox-status 的 --status-exit-* 镜像 token 同款约定）
const FAN_SCALE = 1.08;
const FAN_PX_PRECISION = 1000;
const FAN_KNOBS = {
    spanDeg: FAN_SPAN_DEG,
    densityPx: FAN_DENSITY_PX,
    hitBoxPx: FAN_HIT_BOX_PX,
    pullPx: FAN_PULL_PX
};
// actions 为 .toolbox-items 内工具项 data-action 的 DOM 顺序序列：顺序即扇形顺序，身份由 action 承载
// （不再有 ordinal 表，也不再由 child index 或 :nth-of-type 决定身份）。
// 零项返回空数组；单项落在象限平分线、半径取让位半径；y 与 pullY 沿用负号约定（向上为负）。
function layoutFan(actions, knobs) {
    const count = actions.length;
    if (count === 0) {
        return [];
    }
    // 单项没有 0° 起点，直接落象限平分线；n ≥ 2 时第 index 项落在 index × 步长
    const stepDeg = count > 1 ? knobs.spanDeg / (count - 1) : knobs.spanDeg / 2;
    const angleDeg = actions.map((_, index) => (count > 1 ? index * stepDeg : stepDeg));
    const radians = angleDeg.map(value => value * FAN_RADIANS);
    let clearancePx = 0;
    for (const radian of radians) {
        const projected = Math.max(Math.abs(Math.cos(radian)), Math.abs(Math.sin(radian)));
        clearancePx = Math.max(clearancePx, knobs.hitBoxPx / projected);
    }
    const densityRadiusPx = count > 1 ? knobs.densityPx / (2 * Math.sin(stepDeg / 2 * FAN_RADIANS)) : 0;
    const radiusPx = Math.max(clearancePx, densityRadiusPx);
    return actions.map((action, index) => {
        return {
            action: action,
            index: index,
            angleDeg: angleDeg[index],
            radiusPx: radiusPx,
            xPx: radiusPx * Math.cos(radians[index]),
            yPx: -radiusPx * Math.sin(radians[index]),
            pullX: knobs.pullPx * Math.cos(radians[index]),
            pullY: -knobs.pullPx * Math.sin(radians[index])
        };
    });
}
const fanPx = (value) => `${Math.round(value * FAN_PX_PRECISION) / FAN_PX_PRECISION}px`;
// 工具箱 facade：只拥有自身 DOM 状态（含扇形布局写入）、data-action 委托、外点/Escape 与既有 pjax 重置，
// 标注 / 分享 / 收藏分别下沉到同层 controller
class Toolbox {
    annotation;
    shareController;
    favoriteController;
    fanSignature = '';
    fanEpochSeq = 0;
    fanEpochs = new WeakMap();
    fanObserver = null;
    fanTarget = null;
    get toolbox() {
        return document.querySelector('.toolbox');
    }
    get toggleButton() {
        return document.querySelector('#to-toolbox');
    }
    // 元素身份：WeakMap 内的单调 epoch。被整体替换的元素必然是全新对象，故必得新 epoch；
    // 同一对象被摘下再插回时身份保持不变（它自带的内联几何也跟着走，无需重写）
    fanEpochOf = (item) => {
        const known = this.fanEpochs.get(item);
        if (known !== undefined) {
            return known;
        }
        this.fanEpochSeq += 1;
        this.fanEpochs.set(item, this.fanEpochSeq);
        return this.fanEpochSeq;
    };
    // 后置条件：该项是否已带着给定槽位的内联几何（脏判定的第二道依据）
    hasInlineFanLayout = (item, slot) => {
        return item.style.getPropertyValue('--fan-x') === fanPx(slot.xPx)
            && item.style.getPropertyValue('--fan-y') === fanPx(slot.yPx)
            && item.style.getPropertyValue('--pull-x') === fanPx(slot.pullX)
            && item.style.getPropertyValue('--pull-y') === fanPx(slot.pullY);
    };
    // 脏判定：项序签名（并入元素身份）未变、且每项确实仍带着该槽位的内联几何时才跳过重写，
    // 避免 ResizeObserver / 重复 pjax:success 引发无谓的样式写入。
    // 签名必须并入元素身份：站内 Pjax 换页会整体替换 .toolbox-items（全新元素、无任何内联 --fan-*），
    // 只比对 data-action 序列会在项集相同时误判为「未变」而早退，五项全部回落 0px 兜底、扇形塌回 toggle。
    syncFanLayout = () => {
        const container = document.querySelector('.toolbox-items');
        if (container === null) {
            return;
        }
        const items = [];
        for (const child of Array.from(container.children)) {
            if (child.classList.contains('toolbox-item')) {
                items.push(child);
            }
        }
        const actions = items.map(item => item.getAttribute('data-action') ?? '');
        const slots = layoutFan(actions, FAN_KNOBS);
        const signature = items.map((item, index) => `${actions[index]}#${this.fanEpochOf(item)}`).join(' ');
        if (signature === this.fanSignature
            && items.every((item, index) => this.hasInlineFanLayout(item, slots[index]))) {
            return;
        }
        this.fanSignature = signature;
        const owners = new Map();
        for (const item of items) {
            owners.set(item.getAttribute('data-action') ?? '', item);
        }
        for (const slot of slots) {
            const owner = owners.get(slot.action);
            if (owner === undefined) {
                continue;
            }
            owner.style.setProperty('--fan-x', fanPx(slot.xPx));
            owner.style.setProperty('--fan-y', fanPx(slot.yPx));
            owner.style.setProperty('--pull-x', fanPx(slot.pullX));
            owner.style.setProperty('--pull-y', fanPx(slot.pullY));
        }
    };
    onFanResize = () => {
        this.syncFanLayout();
    };
    watchFanTarget = () => {
        const toolbox = this.toolbox;
        if (toolbox === null) {
            return;
        }
        if (this.fanObserver === null) {
            if (typeof ResizeObserver === 'undefined') {
                return;
            }
            this.fanObserver = new ResizeObserver(this.onFanResize);
        }
        if (this.fanTarget !== toolbox) {
            this.fanObserver.disconnect();
            this.fanObserver.observe(toolbox);
            this.fanTarget = toolbox;
        }
    };
    releaseFanTarget = () => {
        this.fanObserver?.disconnect();
        this.fanTarget = null;
    };
    applyState = (open) => {
        const toolbox = this.toolbox;
        if (open) {
            // 展开前先落几何：class 翻转与 transform 写入必须同帧，否则首帧会从 toggle 位置散开
            this.watchFanTarget();
            this.syncFanLayout();
        }
        if (toolbox !== null) {
            toolbox.classList.toggle('toolbox-open', open);
        }
        const toggle = this.toggleButton;
        if (toggle !== null) {
            toggle.setAttribute('aria-expanded', String(open));
        }
        if (open) {
            document.addEventListener('click', this.onOutsideClick);
            window.bgmControl?.clearStatus();
        }
        else {
            document.removeEventListener('click', this.onOutsideClick);
            this.annotation.dismissPendingSelection();
        }
    };
    toggle = () => {
        const toolbox = this.toolbox;
        this.applyState(toolbox === null || !toolbox.classList.contains('toolbox-open'));
    };
    dispatchAction = (action) => {
        switch (action) {
            case 'toolbox':
                this.toggle();
                break;
            case 'annotate':
                this.annotate();
                break;
            case 'share':
                this.share();
                break;
            case 'favorite':
                this.favorite();
                break;
            case 'screenshot': {
                const capture = window.screenshotControl?.capture();
                if (capture !== undefined) {
                    void Promise.resolve(capture).catch(() => undefined);
                }
                this.applyState(false);
                break;
            }
            case 'bgm': {
                const toggle = window.bgmControl?.toggle();
                if (toggle !== undefined) {
                    void Promise.resolve(toggle).catch(() => undefined);
                }
                this.applyState(false);
                break;
            }
        }
    };
    onToolboxClick = (event) => {
        const target = event.target;
        if (target === null || typeof target.closest !== 'function') {
            return;
        }
        const button = target.closest('#to-toolbox, .toolbox-item');
        if (button === null) {
            return;
        }
        const action = button.getAttribute('data-action');
        if (action !== null) {
            this.dispatchAction(action);
        }
    };
    onOutsideClick = (event) => {
        const target = event.target;
        if (target !== null && typeof target.closest === 'function' && target.closest('.toolbox') !== null) {
            return;
        }
        this.applyState(false);
    };
    // 色板自动关闭的唯一 owner：命中色板本体或选项时放行，其余目标下沉到标注 controller
    onDocumentClick = (event) => {
        const target = event.target;
        if (target === null || typeof target.closest !== 'function') {
            return;
        }
        if (target.closest('.at-color') !== null || target.closest('.at-colors') !== null) {
            return;
        }
        this.annotation.closeColors();
    };
    onKeyup = (event) => {
        if (event.key === 'Escape') {
            this.applyState(false);
            this.annotation.hideToolbar();
        }
    };
    onPjaxSuccess = () => {
        this.applyState(false);
        this.annotation.restore();
        this.favoriteController.restore();
        // Pjax 换页后工具项集合可能变化（如从文章页切到非文章页），须重算扇形
        this.watchFanTarget();
        this.syncFanLayout();
    };
    onPjaxSend = () => {
        this.applyState(false);
        this.annotation.hideToolbar();
        // 导航期间旧容器即将被替换，停止观察；下一次 pjax:success 或展开时重新挂载
        this.releaseFanTarget();
    };
    annotate = () => {
        this.annotation.annotate();
        this.applyState(false);
    };
    share = () => {
        this.shareController.share();
    };
    favorite = () => {
        this.favoriteController.favorite();
    };
    constructor() {
        this.annotation = ToolboxModules.createAnnotationController();
        this.shareController = ToolboxModules.createShareController(() => this.applyState(false));
        this.favoriteController = ToolboxModules.createFavoriteController();
        document.addEventListener('keyup', this.onKeyup);
        document.addEventListener('click', this.onToolboxClick);
        document.addEventListener('click', this.onDocumentClick);
        document.addEventListener('pjax:success', this.onPjaxSuccess);
        document.addEventListener('pjax:send', this.onPjaxSend);
        this.watchFanTarget();
        this.syncFanLayout();
        this.annotation.restore();
        this.favoriteController.restore();
    }
}
var toolbox = new Toolbox();
Object.assign(window, { toolbox: toolbox });
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
