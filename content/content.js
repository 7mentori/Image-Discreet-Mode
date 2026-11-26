(() => {
  'use strict';

  const CONTROLLER_KEY = '__IMAGE_DISCREET_MODE_CONTROLLER__';
  if (window[CONTROLLER_KEY]) return;

  class Controller {
    constructor() {
      this.hostname = IDMSettings.hostname();
      this.siteSettings = { ...IDMSettings.DEFAULT_SITE_SETTINGS };
      this.globalSettings = { ...IDMSettings.DEFAULT_GLOBAL_SETTINGS };
      this.imageEngine = null;
      this.panel = null;
      this.initialized = false;
      this.disabling = false;
      this.monochromeBody = null;
      this.originalBodyFilter = null;
      this.siteWriteQueue = Promise.resolve();
      this._onStorageChanged = this.onStorageChanged.bind(this);
      this._onMessage = (message, sender, sendResponse) => {
        this.onRuntimeMessage(message, sender).then(sendResponse).catch((error) => {
          console.error('[Image Discreet Mode] Message handling failed:', error);
          sendResponse({ ok: false, error: String(error) });
        });
        return true;
      };
      this._onNavigation = this.checkHostname.bind(this);
      this.hostnameCheckTimer = null;

      chrome.runtime.onMessage.addListener(this._onMessage);
      chrome.storage.onChanged.addListener(this._onStorageChanged);
      this.initialize();
    }

    async initialize() {
      try {
        const [siteSettings, globalSettings] = await Promise.all([
          IDMSettings.getSiteSettings(this.hostname),
          IDMSettings.getGlobalSettings()
        ]);
        this.siteSettings = siteSettings;
        this.globalSettings = globalSettings;
        this.initialized = true;
        this.applyMonochrome(this.siteSettings.monochrome);

        if (!this.siteSettings.disabled) this.activate({ showPanel: true });

        window.addEventListener('popstate', this._onNavigation, true);
        window.addEventListener('hashchange', this._onNavigation, true);
        // Hostname changes normally perform a document navigation. This low-frequency guard
        // also covers unusual client-side navigation shells that replace the current URL.
        this.hostnameCheckTimer = setInterval(this._onNavigation, 1200);
      } catch (error) {
        console.error('[Image Discreet Mode] Initialization failed:', error);
      }
    }

    activate({ showPanel = true } = {}) {
      if (!this.initialized || this.siteSettings.disabled) return;

      if (!this.imageEngine) {
        this.imageEngine = new IDMImageEngine(this.siteSettings);
      } else {
        this.imageEngine.setSettings(this.siteSettings);
      }

      if (!this.panel) {
        this.panel = new IDMPanel({
          siteSettings: this.siteSettings,
          globalSettings: this.globalSettings,
          onSiteChange: (patch) => this.updateSiteSettings(patch),
          onSitePreview: (patch) => this.previewSiteSettings(patch),
          onGlobalChange: (patch) => this.updateGlobalSettings(patch),
          onDisable: () => this.disableCurrentSite()
        });
      } else {
        this.panel.updateSiteSettings(this.siteSettings);
        this.panel.updateGlobalSettings(this.globalSettings);
      }

      if (showPanel) this.panel.setVisible(true);
    }

    applyMonochrome(enabled) {
      const body = document.body;
      if (!body) return;

      // The extension host is a direct child of <html>, outside <body>, so it
      // remains in full color while the actual webpage is rendered in grayscale.
      if (this.monochromeBody && this.monochromeBody !== body) {
        this.restoreMonochromeBody();
      }

      if (enabled) {
        if (this.monochromeBody !== body) {
          this.monochromeBody = body;
          this.originalBodyFilter = {
            value: body.style.getPropertyValue('filter'),
            priority: body.style.getPropertyPriority('filter')
          };
        }
        body.style.setProperty('filter', 'grayscale(1)', 'important');
      } else {
        this.restoreMonochromeBody();
      }
    }

    restoreMonochromeBody() {
      if (!this.monochromeBody) return;
      const body = this.monochromeBody;
      const original = this.originalBodyFilter || { value: '', priority: '' };
      if (original.value) body.style.setProperty('filter', original.value, original.priority);
      else body.style.removeProperty('filter');
      this.monochromeBody = null;
      this.originalBodyFilter = null;
    }

    previewSiteSettings(patch) {
      if (this.disabling || this.siteSettings.disabled) return;
      this.siteSettings = IDMSettings.normalizeSiteSettings({ ...this.siteSettings, ...patch });
      if (this.imageEngine) this.imageEngine.setSettings(this.siteSettings);
      this.applyMonochrome(this.siteSettings.monochrome);
    }

    updateSiteSettings(patch) {
      if (this.disabling || this.siteSettings.disabled) return Promise.resolve();
      const hostAtRequest = this.hostname;
      this.siteWriteQueue = this.siteWriteQueue.then(async () => {
        if (this.disabling || this.siteSettings.disabled) return;
        const next = await IDMSettings.patchSiteSettings(patch, hostAtRequest);
        if (this.disabling || this.siteSettings.disabled) return;
        this.siteSettings = next;
        if (this.imageEngine) this.imageEngine.setSettings(next);
        this.applyMonochrome(next.monochrome);
        if (this.panel) this.panel.updateSiteSettings(next);
      });
      return this.siteWriteQueue;
    }

    async updateGlobalSettings(patch) {
      const next = await IDMSettings.patchGlobalSettings(patch);
      this.globalSettings = next;
      if (this.panel) this.panel.updateGlobalSettings(next);
    }

    async disableCurrentSite() {
      if (this.disabling || this.siteSettings.disabled) return;
      this.disabling = true;
      this.siteSettings = { ...this.siteSettings, disabled: true };
      this.applyMonochrome(false);

      // Remove the complete UI synchronously before waiting for storage I/O.
      if (this.panel) {
        this.panel.destroy();
        this.panel = null;
      }
      if (this.imageEngine) {
        this.imageEngine.destroy();
        this.imageEngine = null;
      }

      try {
        await this.siteWriteQueue.catch(() => {});
        await IDMSettings.patchSiteSettings({ ...this.siteSettings, disabled: true }, this.hostname);
      } catch (error) {
        console.error('[Image Discreet Mode] Could not save disabled state:', error);
      } finally {
        this.disabling = false;
      }
    }

    async enableAndShow() {
      const [siteSettings, globalSettings] = await Promise.all([
        IDMSettings.getSiteSettings(this.hostname),
        IDMSettings.getGlobalSettings()
      ]);
      this.siteSettings = { ...siteSettings, disabled: false };
      this.globalSettings = globalSettings;
      this.activate({ showPanel: true });
    }

    async togglePanel() {
      const latest = await IDMSettings.getSiteSettings(this.hostname);
      this.siteSettings = latest;
      if (latest.disabled) return;

      if (!this.panel) {
        const globalSettings = await IDMSettings.getGlobalSettings();
        this.globalSettings = globalSettings;
        this.activate({ showPanel: true });
        return;
      }
      this.panel.setVisible(!this.panel.visible);
    }

    async onRuntimeMessage(message, _sender) {
      if (!this.initialized) {
        await new Promise((resolve) => {
          const poll = () => this.initialized ? resolve() : setTimeout(poll, 25);
          poll();
        });
      }
      if (message && message.type === 'IDM_ENABLE_AND_SHOW') {
        await this.enableAndShow();
        return { ok: true };
      }
      if (message && message.type === 'IDM_TOGGLE_PANEL') {
        await this.togglePanel();
        return { ok: true };
      }
      return { ok: false, ignored: true };
    }

    onStorageChanged(changes, areaName) {
      if (areaName !== 'local') return;

      const siteKey = IDMSettings.siteStorageKey(this.hostname);
      if (changes[siteKey] && changes[siteKey].newValue) {
        if (this.disabling) return;
        const previousDisabled = this.siteSettings.disabled;
        this.siteSettings = IDMSettings.normalizeSiteSettings(changes[siteKey].newValue);

        if (this.siteSettings.disabled) {
          this.applyMonochrome(false);
          if (!this.disabling) {
            if (this.panel) this.panel.destroy();
            this.panel = null;
            if (this.imageEngine) this.imageEngine.destroy();
            this.imageEngine = null;
          }
          return;
        }

        this.applyMonochrome(this.siteSettings.monochrome);
        if (previousDisabled && !this.siteSettings.disabled) {
          this.activate({ showPanel: true });
          return;
        }

        if (this.imageEngine) this.imageEngine.setSettings(this.siteSettings);
        if (this.panel) this.panel.updateSiteSettings(this.siteSettings);
      }

      if (changes[IDMSettings.GLOBAL_KEY] && changes[IDMSettings.GLOBAL_KEY].newValue) {
        this.globalSettings = IDMSettings.normalizeGlobalSettings(changes[IDMSettings.GLOBAL_KEY].newValue);
        if (this.panel) this.panel.updateGlobalSettings(this.globalSettings);
      }
    }

    async checkHostname() {
      const nextHostname = IDMSettings.hostname();
      if (!nextHostname || nextHostname === this.hostname) return;
      if (this.panel) this.panel.destroy();
      this.panel = null;
      if (this.imageEngine) this.imageEngine.destroy();
      this.imageEngine = null;
      this.applyMonochrome(false);

      try {
        await this.siteWriteQueue.catch(() => {});
        this.hostname = nextHostname;
        const [siteSettings, globalSettings] = await Promise.all([
          IDMSettings.getSiteSettings(this.hostname),
          IDMSettings.getGlobalSettings()
        ]);
        this.siteSettings = siteSettings;
        this.globalSettings = globalSettings;
        this.applyMonochrome(this.siteSettings.monochrome);
        if (!this.siteSettings.disabled) this.activate({ showPanel: true });
      } catch (error) {
        console.error('[Image Discreet Mode] Hostname switch failed:', error);
      }
    }
  }

  window[CONTROLLER_KEY] = new Controller();
})();
