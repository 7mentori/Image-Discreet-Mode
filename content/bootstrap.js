(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.Bootstrap) return;

  let currentHostname = location.hostname.toLowerCase();
  let active = false;
  let siteSettings = { ...IDM.Settings.SITE_DEFAULTS };
  let globalSettings = { ...IDM.Settings.GLOBAL_DEFAULTS };
  let bootPromise = null;
  let hostnameTimer = null;
  let destroyed = false;

  function isSupported() {
    return IDM.isSupportedPage() && Boolean(location.hostname);
  }

  function applyCurrentSettings() {
    if (!active) return;
    IDM.ImageEngine.setSettings(siteSettings);
    IDM.Grayscale.setEnabled(siteSettings.grayscale);
    IDM.Panel.updateSettings(siteSettings, globalSettings);
    IDM.SingleImage.refresh();
  }

  function createPanel() {
    IDM.Panel.initialize(siteSettings, globalSettings, {
      onSitePatch: async (patch) => {
        siteSettings = IDM.Settings.validateSite({ ...siteSettings, ...patch });
        applyCurrentSettings();
        await IDM.Settings.updateSite(currentHostname, patch);
      },
      onGlobalPatch: async (patch) => {
        globalSettings = IDM.Settings.validateGlobal({ ...globalSettings, ...patch });
        IDM.Panel.updateSettings(siteSettings, globalSettings);
        await IDM.Settings.updateGlobal(patch);
      },
      onReset: async () => {
        IDM.ImageEngine.clearExceptions();
        siteSettings = IDM.Settings.validateSite({
          ...siteSettings,
          hideImages: false,
          imageOpacity: 100,
          imageBlur: 0,
          imageScale: 100
        });
        applyCurrentSettings();
        await IDM.Settings.resetImageSettings(currentHostname);
      },
      onDisableSite: disableCurrentSite
    });
  }

  function activate() {
    if (active || !isSupported()) return;
    if (siteSettings.disabled) return;
    active = true;
    IDM.ImageEngine.setSettings(siteSettings);
    IDM.ImageEngine.start();
    IDM.SingleImage.start();
    IDM.Grayscale.setEnabled(siteSettings.grayscale);
    createPanel();
  }

  function deactivate() {
    if (!active) {
      IDM.Panel.destroy();
      IDM.ImageEngine.stop();
      IDM.SingleImage.stop();
      IDM.Grayscale.stop();
      return;
    }
    active = false;
    IDM.ImageEngine.stop();
    IDM.SingleImage.stop();
    IDM.Grayscale.stop();
    IDM.Panel.destroy();
  }

  async function disableCurrentSite() {
    await IDM.Settings.updateSite(currentHostname, { disabled: true });
    siteSettings = IDM.Settings.validateSite({ ...siteSettings, disabled: true });
    deactivate();
  }

  async function initializeForCurrentHost({ showPanel = true } = {}) {
    if (!isSupported()) return;
    currentHostname = location.hostname.toLowerCase();
    const [site, global] = await Promise.all([
      IDM.Settings.loadSite(currentHostname),
      IDM.Settings.loadGlobal()
    ]);
    siteSettings = site;
    globalSettings = global;
    if (siteSettings.disabled) {
      deactivate();
      return;
    }
    activate();
    if (active && showPanel) IDM.Panel.show();
  }

  async function waitForDocumentRoot() {
    if (document.documentElement) return;
    await new Promise((resolve) => {
      const ready = () => {
        if (document.documentElement) {
          document.removeEventListener('readystatechange', ready);
          resolve();
        }
      };
      document.addEventListener('readystatechange', ready);
      ready();
    });
  }

  async function ensureReady() {
    if (!bootPromise) {
      bootPromise = (async () => {
        await waitForDocumentRoot();
        await initializeForCurrentHost({ showPanel: true });
      })();
    }
    return bootPromise;
  }

  async function enableCurrentSite() {
    await ensureReady();
    const stored = await IDM.Settings.loadSite(location.hostname.toLowerCase());
    if (stored.disabled) {
      siteSettings = { ...stored, disabled: false };
      await IDM.Settings.updateSite(location.hostname.toLowerCase(), { disabled: false });
    } else {
      siteSettings = stored;
    }
    globalSettings = await IDM.Settings.loadGlobal();
    if (!active) activate();
    if (active) IDM.Panel.show();
  }

  async function togglePanel() {
    await ensureReady();
    if (!active || siteSettings.disabled) return;
    IDM.Panel.toggleVisibility();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return false;
    if (message.type === 'IDM_ENABLE_SITE') {
      enableCurrentSite().then(() => sendResponse({ ok: true })).catch((error) => {
        console.error('[IDM] Enable failed:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
      return true;
    }
    if (message.type === 'IDM_TOGGLE_PANEL') {
      togglePanel().then(() => sendResponse({ ok: true })).catch((error) => {
        console.error('[IDM] Panel toggle failed:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
      return true;
    }
    return false;
  });

  IDM.events.on('settings:site', ({ hostname, settings }) => {
    if (hostname !== currentHostname) return;
    siteSettings = IDM.Settings.validateSite(settings);
    if (siteSettings.disabled) {
      deactivate();
      return;
    }
    if (active) {
      applyCurrentSettings();
    } else {
      IDM.Settings.loadGlobal().then((global) => {
        globalSettings = global;
        activate();
        if (active) IDM.Panel.show();
      }).catch((error) => console.error('[IDM] External re-enable failed:', error));
    }
  });

  IDM.events.on('settings:global', ({ settings }) => {
    globalSettings = IDM.Settings.validateGlobal(settings);
    if (active) IDM.Panel.updateSettings(siteSettings, globalSettings);
  });

  function checkHostname() {
    if (destroyed) return;
    const hostname = location.hostname.toLowerCase();
    if (hostname && hostname !== currentHostname) {
      deactivate();
      currentHostname = hostname;
      bootPromise = null;
      ensureReady().catch((error) => console.error('[IDM] Host navigation initialization failed:', error));
    }
  }

  function startHostnameMonitor() {
    if (hostnameTimer) return;
    hostnameTimer = setInterval(checkHostname, 1000);
    window.addEventListener('popstate', checkHostname, true);
    window.addEventListener('hashchange', checkHostname, true);
    window.addEventListener('pageshow', () => {
      if (!active && !siteSettings.disabled) {
        bootPromise = null;
        ensureReady().catch((error) => console.error('[IDM] Pageshow initialization failed:', error));
      }
    }, true);
    window.addEventListener('pagehide', () => {
      // Do not persist transient per-image exceptions across page lifecycle transitions.
      IDM.ImageEngine.clearExceptions();
    }, true);
  }

  IDM.Bootstrap = {
    ensureReady,
    disableCurrentSite,
    enableCurrentSite,
    isActive: () => active
  };

  startHostnameMonitor();
  ensureReady().catch((error) => console.error('[IDM] Initialization failed:', error));
})();
