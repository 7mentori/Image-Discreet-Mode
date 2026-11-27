'use strict';

const SITE_PREFIX = 'idm:site:';
const SITE_DEFAULTS = Object.freeze({
  hideImages: false,
  imageOpacity: 100,
  imageBlur: 0,
  imageScale: 100,
  grayscale: false,
  disabled: false
});

function normalizeHostname(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeSite(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    hideImages: Boolean(source.hideImages),
    imageOpacity: Math.round(clamp(source.imageOpacity, 0, 100, 100)),
    imageBlur: Math.round(clamp(source.imageBlur, 0, 20, 0) * 10) / 10,
    imageScale: Math.round(clamp(source.imageScale, 10, 200, 100)),
    grayscale: Boolean(source.grayscale),
    disabled: Boolean(source.disabled)
  };
}

async function getSite(hostname) {
  const key = `${SITE_PREFIX}${hostname}`;
  const stored = await chrome.storage.local.get(key);
  return normalizeSite(stored[key] || SITE_DEFAULTS);
}

async function setSite(hostname, patch) {
  const key = `${SITE_PREFIX}${hostname}`;
  const stored = await chrome.storage.local.get(key);
  const next = normalizeSite({ ...(stored[key] || SITE_DEFAULTS), ...patch });
  await chrome.storage.local.set({ [key]: next });
  return next;
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/page-effects.css'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'content/namespace.js',
        'content/settings.js',
        'content/i18n.js',
        'content/image-engine.js',
        'content/grayscale.js',
        'content/single-image.js',
        'content/panel.js',
        'content/bootstrap.js'
      ]
    });
  } catch (error) {
    console.warn('[Image Discreet Mode] Unable to inject into this page:', error?.message || error);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url) return;
  const hostname = normalizeHostname(tab.url);
  if (!hostname) return;

  try {
    const site = await getSite(hostname);
    if (site.disabled) {
      await setSite(hostname, { disabled: false });
      const delivered = await sendToTab(tab.id, { type: 'IDM_ENABLE_SITE' });
      if (!delivered) {
        await ensureContentScript(tab.id);
        await sendToTab(tab.id, { type: 'IDM_ENABLE_SITE' });
      }
      return;
    }

    const delivered = await sendToTab(tab.id, { type: 'IDM_TOGGLE_PANEL' });
    if (!delivered) {
      await ensureContentScript(tab.id);
      await sendToTab(tab.id, { type: 'IDM_TOGGLE_PANEL' });
    }
  } catch (error) {
    console.error('[Image Discreet Mode] Action failed:', error);
  }
});
