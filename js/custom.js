// 首次加载遮罩：等待鸿蒙字体加载完成后再显示页面
(function () {
  // 创建遮罩（用系统字体渲染，避免自等）
  const splash = document.createElement('div');
  splash.id = 'font-splash';
  const spinner = document.createElement('div');
  spinner.className = 'splash-spinner';
  splash.appendChild(spinner);
  document.documentElement.appendChild(splash);

  const hide = () => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  };

  // 等待字体加载完成（含宽字体下载）
  Promise.all([
    document.fonts.load('400 16px "HarmonyOS Sans SC"'),
    document.fonts.load('700 16px "HarmonyOS Sans SC"'),
    document.fonts.load('400 16px "JetBrains Mono"'),
  ]).then(hide).catch(hide);

  // 兜底：8 秒强制移除，防止字体加载失败卡死
  setTimeout(hide, 8000);
})();
