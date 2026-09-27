'use strict'

declare const monaco: any;

class MonacoEditor {
  // keep references to editors to avoid garbage collection
  private editors = new Map<HTMLElement, any>();

  private updateEditorLayout = () => {
    for (const [container, ed] of Array.from(this.editors.entries())) {
      if (!(container instanceof HTMLElement) || !container.isConnected) {
        this.editors.delete(container);
        continue;
      }

      try {
        ed.layout();
      } catch (e) { /* ignore */ }
    }
  }

  private readSource = (container: HTMLElement): string | null => {
    const matches: HTMLPreElement[] = []
    for (const child of Array.from(container.children)) {
      if (child.matches('pre.monaco-editor-source[hidden][aria-hidden="true"]')) {
        matches.push(child as HTMLPreElement)
      }
    }
    if (matches.length !== 1) {
      console.error(`MonacoEditor: expected exactly one direct child pre.monaco-editor-source[hidden][aria-hidden="true"], found ${matches.length}`);
      return null;
    }
    return matches[0].textContent ?? '';
  }

  private createEditor = (container: HTMLElement, lang: string, theme: string) => {
    if (container.getAttribute('data-initialized') === 'true') return;
    const mon = (window as any).monaco || (monaco as any);
    if (!mon || !mon.editor || !mon.editor.create) {
      console.error('MonacoEditor: monaco not available when trying to create editor');
      return;
    }
    // 必须在 monaco.editor.create 之前读取：Monaco 会往容器内追加节点
    const source = this.readSource(container);
    if (source === null) return;
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
  }

  private findEditor = () => {
    const editors = document.querySelectorAll('.monaco-editor-code');
    editors.forEach((editor) => {
      const lang = editor.getAttribute('data-lang') || 'plaintext';
      const theme = editor.getAttribute('data-theme') || 'vs-dark';
      this.createEditor(editor as HTMLElement, lang, theme);
    });
    this.updateEditorLayout();
  }

  private loadMonaco = () => {
    // 惰性加载：仅当页面存在代码编辑器容器时才引入 CDN loader
    if (document.querySelector('.monaco-editor-code') === null) {
      return
    }
    if (typeof (window as any).hexo_monaco === 'undefined') {
      const loader = document.createElement('script');
      loader.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
      loader.onload = () => {
        (window as any).require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
        (window as any).require(['vs/editor/editor.main'], () => {
          (window as any).hexo_monaco = true; // prevent loading multiple times
          this.findEditor();
        });
      }
      loader.onerror = () => {
        console.error('Failed to load Monaco Editor loader script.');
      }
      document.body.appendChild(loader);
    } else {
      this.findEditor();
    }
  }

  constructor() {
    this.loadMonaco()
    document.addEventListener('pjax:success', this.loadMonaco)
    window.addEventListener('hexo-blog-decrypt', this.loadMonaco)
    window.addEventListener('resize', this.updateEditorLayout);
  }
};

new MonacoEditor();
