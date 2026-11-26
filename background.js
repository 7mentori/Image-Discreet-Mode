'use strict';

const SITE_KEY_PREFIX = 'siteSettings:';
const CONTENT_FILES = [
  'content/settings.js',
  'content/image-engine.js',
  'content/panel.js',
  'content/content.js'
];

function getHostname(tabUrl) {
  try {
    const parsed = new URL(tabUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase();
  } catch (_error) {
    return null;
  }
}

async function getSiteSettings(hostname) {
  const key = `${SITE_KEY_PREFIX}${hostname}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || {
    hidden: false,
    opacity: 100,
    blur: 0,
    scale: 100,
    disabled: false
  };
}

async function saveSiteSettings(hostname, nextSettings) {
  const key = `${SITE_KEY_PREFIX}${hostname}`;
  await chrome.storage.local.set({ [key]: nextSettings });
}

async function sendAction(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (_firstError) {
    // The content script may not have run yet (for example immediately after navigation).
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: CONTENT_FILES
      });
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch (error) {
      console.warn('[Image Discreet Mode] Unable to reach the active tab:', error);
      return false;
    }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== 'number') return;
  const hostname = getHostname(tab.url || '');
  if (!hostname) return;

  try {
    const settings = await getSiteSettings(hostname);

    if (settings.disabled) {
      const updated = { ...settings, disabled: false };
      await saveSiteSettings(hostname, updated);
      await sendAction(tab.id, { type: 'IDM_ENABLE_AND_SHOW' });
      return;
    }

    await sendAction(tab.id, { type: 'IDM_TOGGLE_PANEL' });
  } catch (error) {
    console.error('[Image Discreet Mode] Action handling failed:', error);
  }
});
