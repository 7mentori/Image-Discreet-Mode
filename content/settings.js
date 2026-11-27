(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.Settings) return;

  const SITE_PREFIX = 'idm:site:';
  const GLOBAL_KEY = 'idm:global';
  const SITE_DEFAULTS = Object.freeze({
    hideImages: false,
    imageOpacity: 100,
    imageBlur: 0,
    imageScale: 100,
    grayscale: false,
    disabled: false
  });
  const GLOBAL_DEFAULTS = Object.freeze({
    theme: 'light',
    panelOpacity: 88
  });

  const siteCache = new Map();
  let globalCache = { ...GLOBAL_DEFAULTS };
  const writeQueues = new Map();
  const pendingLocalChanges = new Map();

  function markLocalChange(key, value) {
    const serialized = JSON.stringify(value);
    if (!pendingLocalChanges.has(key)) pendingLocalChanges.set(key, new Map());
    const values = pendingLocalChanges.get(key);
    values.set(serialized, (values.get(serialized) || 0) + 1);
  }

  function consumeLocalChange(key, value) {
    const values = pendingLocalChanges.get(key);
    if (!values) return false;
    const serialized = JSON.stringify(value);
    const count = values.get(serialized) || 0;
    if (!count) return false;
    if (count === 1) values.delete(serialized);
    else values.set(serialized, count - 1);
    if (values.size === 0) pendingLocalChanges.delete(key);
    return true;
  }

  function validateSite(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      hideImages: Boolean(source.hideImages),
      imageOpacity: Math.round(IDM.clamp(source.imageOpacity, 0, 100, 100)),
      imageBlur: Math.round(IDM.clamp(source.imageBlur, 0, 20, 0) * 10) / 10,
      imageScale: Math.round(IDM.clamp(source.imageScale, 10, 200, 100)),
      grayscale: Boolean(source.grayscale),
      disabled: Boolean(source.disabled)
    };
  }

  function validateGlobal(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      theme: source.theme === 'dark' ? 'dark' : 'light',
      panelOpacity: Math.round(IDM.clamp(source.panelOpacity, 20, 100, 88))
    };
  }

  function siteKey(hostname) {
    return `${SITE_PREFIX}${String(hostname || location.hostname).toLowerCase()}`;
  }

  async function loadSite(hostname = location.hostname) {
    const key = siteKey(hostname);
    const stored = await chrome.storage.local.get(key);
    const result = validateSite(stored[key]);
    siteCache.set(hostname, result);
    return { ...result };
  }

  async function loadGlobal() {
    const stored = await chrome.storage.local.get(GLOBAL_KEY);
    globalCache = validateGlobal(stored[GLOBAL_KEY]);
    return { ...globalCache };
  }

  function getCachedSite(hostname = location.hostname) {
    return { ...(siteCache.get(hostname) || SITE_DEFAULTS) };
  }

  function getCachedGlobal() {
    return { ...globalCache };
  }

  function updateSite(hostname = location.hostname, patch = {}) {
    const current = siteCache.get(hostname) || { ...SITE_DEFAULTS };
    const next = validateSite({ ...current, ...patch });
    siteCache.set(hostname, next);
    IDM.events.emit('settings:site', { hostname, settings: { ...next } });

    const key = siteKey(hostname);
    const patchSnapshot = { ...patch };
    const previous = writeQueues.get(key) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      // Merge only this change into the latest stored record so other tabs' fields are retained.
      const stored = await chrome.storage.local.get(key);
      const latest = validateSite({ ...(stored[key] || SITE_DEFAULTS), ...patchSnapshot });
      if (JSON.stringify(stored[key]) === JSON.stringify(latest)) return;
      markLocalChange(key, latest);
      await chrome.storage.local.set({ [key]: latest });
    });
    writeQueues.set(key, write);
    return write;
  }

  function updateGlobal(patch = {}) {
    globalCache = validateGlobal({ ...globalCache, ...patch });
    IDM.events.emit('settings:global', { settings: { ...globalCache } });
    const patchSnapshot = { ...patch };
    const previous = writeQueues.get(GLOBAL_KEY) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get(GLOBAL_KEY);
      const latest = validateGlobal({ ...(stored[GLOBAL_KEY] || GLOBAL_DEFAULTS), ...patchSnapshot });
      if (JSON.stringify(stored[GLOBAL_KEY]) === JSON.stringify(latest)) return;
      markLocalChange(GLOBAL_KEY, latest);
      await chrome.storage.local.set({ [GLOBAL_KEY]: latest });
    });
    writeQueues.set(GLOBAL_KEY, write);
    return write;
  }

  function resetImageSettings(hostname = location.hostname) {
    return updateSite(hostname, {
      hideImages: false,
      imageOpacity: 100,
      imageBlur: 0,
      imageScale: 100
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[GLOBAL_KEY] && !consumeLocalChange(GLOBAL_KEY, changes[GLOBAL_KEY].newValue)) {
      globalCache = validateGlobal(changes[GLOBAL_KEY].newValue);
      IDM.events.emit('settings:global', { settings: { ...globalCache }, external: true });
    }
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(SITE_PREFIX) || consumeLocalChange(key, change.newValue)) continue;
      const hostname = key.slice(SITE_PREFIX.length);
      const settings = validateSite(change.newValue);
      siteCache.set(hostname, settings);
      IDM.events.emit('settings:site', { hostname, settings: { ...settings }, external: true });
    }
  });

  IDM.Settings = {
    SITE_DEFAULTS,
    GLOBAL_DEFAULTS,
    loadSite,
    loadGlobal,
    getCachedSite,
    getCachedGlobal,
    updateSite,
    updateGlobal,
    resetImageSettings,
    validateSite,
    validateGlobal,
    siteKey
  };
})();
