(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.I18n) return;

  const messages = {
    zh: {
      title: 'Image Discreet Mode',
      hideImages: '隱藏圖片',
      imageOpacity: '圖片透明度',
      imageBlur: '圖片模糊',
      imageScale: '圖片縮放',
      resetDefault: 'Reset Default',
      grayscale: '網頁灰階',
      theme: '切換主題',
      lightTheme: '淺色模式',
      darkTheme: '深色模式',
      panelOpacity: 'Panel 透明度',
      disableSite: '此網站禁用',
      collapse: '收合 Panel',
      close: '隱藏 Panel',
      holdPreview: '按住左鍵預覽',
      rightClickPin: '右鍵固定／取消固定',
      pinned: '已固定顯示',
      unpinned: '已恢復全站效果',
      siteDisabled: '此網站已禁用',
      unavailable: '目前頁面不支援此擴充功能',
      percent: '%',
      pixels: 'px'
    },
    en: {
      title: 'Image Discreet Mode',
      hideImages: 'Hide images',
      imageOpacity: 'Image opacity',
      imageBlur: 'Image blur',
      imageScale: 'Image scale',
      resetDefault: 'Reset Default',
      grayscale: 'Grayscale webpage',
      theme: 'Switch theme',
      lightTheme: 'Light mode',
      darkTheme: 'Dark mode',
      panelOpacity: 'Panel opacity',
      disableSite: 'Disable on this website',
      collapse: 'Collapse panel',
      close: 'Hide panel',
      holdPreview: 'Hold left button to preview',
      rightClickPin: 'Right-click to pin / unpin',
      pinned: 'Image pinned visible',
      unpinned: 'Image restored to site effects',
      siteDisabled: 'This website is disabled',
      unavailable: 'This page is not supported',
      percent: '%',
      pixels: 'px'
    }
  };

  const language = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  const locale = language.startsWith('zh') ? 'zh' : 'en';

  IDM.I18n = {
    locale,
    t(key) {
      return messages[locale][key] || messages.en[key] || key;
    }
  };
})();
