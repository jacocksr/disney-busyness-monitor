
  (() => {
    let saved = null;
    try { saved = localStorage.getItem('wdw_theme'); } catch (e) { /* storage unavailable */ }
    const theme = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  })();
