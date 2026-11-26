(() => {
  'use strict';

  const SITE_KEY_PREFIX = 'siteSettings:';
  const GLOBAL_KEY = 'globalSettings';

  const DEFAULT_SITE_SETTINGS = Object.freeze({
    hidden: false,
    opacity: 100,
    blur: 0,
    scale: 100,
    monochrome: false,
    disabled: false
  });

  const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
    theme: 'light',
    panelOpacity: 88
  });

  function hostname() {
    return String(location.hostname || '').toLowerCase();
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeSiteSettings(settings = {}) {
    return {
      hidden: Boolean(settings.hidden),
      opacity: clampNumber(settings.opacity, 0, 100, DEFAULT_SITE_SETTINGS.opacity),
      blur: clampNumber(settings.blur, 0, 20, DEFAULT_SITE_SETTINGS.blur),
      scale: clampNumber(settings.scale, 10, 300, DEFAULT_SITE_SETTINGS.scale),
      monochrome: Boolean(settings.monochrome),
      disabled: Boolean(settings.disabled)
    };
  }

  function normalizeGlobalSettings(settings = {}) {
    return {
      theme: settings.theme === 'dark' ? 'dark' : 'light',
      panelOpacity: clampNumber(settings.panelOpacity, 20, 100, DEFAULT_GLOBAL_SETTINGS.panelOpacity)
    };
  }

  async function getSiteSettings(host = hostname()) {
    const key = `${SITE_KEY_PREFIX}${host}`;
    const values = await chrome.storage.local.get(key);
    return normalizeSiteSettings(values[key] || DEFAULT_SITE_SETTINGS);
  }

  async function patchSiteSettings(patch, host = hostname()) {
    const key = `${SITE_KEY_PREFIX}${host}`;
    const values = await chrome.storage.local.get(key);
    const current = normalizeSiteSettings(values[key] || DEFAULT_SITE_SETTINGS);
    const next = normalizeSiteSettings({ ...current, ...patch });
    await chrome.storage.local.set({ [key]: next });
    return next;
  }

  async function getGlobalSettings() {
    const values = await chrome.storage.local.get(GLOBAL_KEY);
    return normalizeGlobalSettings(values[GLOBAL_KEY] || DEFAULT_GLOBAL_SETTINGS);
  }

  async function patchGlobalSettings(patch) {
    const values = await chrome.storage.local.get(GLOBAL_KEY);
    const current = normalizeGlobalSettings(values[GLOBAL_KEY] || DEFAULT_GLOBAL_SETTINGS);
    const next = normalizeGlobalSettings({ ...current, ...patch });
    await chrome.storage.local.set({ [GLOBAL_KEY]: next });
    return next;
  }

  function siteStorageKey(host = hostname()) {
    return `${SITE_KEY_PREFIX}${host}`;
  }

  window.IDMSettings = Object.freeze({
    DEFAULT_SITE_SETTINGS,
    DEFAULT_GLOBAL_SETTINGS,
    hostname,
    normalizeSiteSettings,
    normalizeGlobalSettings,
    getSiteSettings,
    patchSiteSettings,
    getGlobalSettings,
    patchGlobalSettings,
    siteStorageKey,
    GLOBAL_KEY
  });
})();
