'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contentPath = path.join(__dirname, '..', 'content');
const data = new Map();
const changeListeners = [];
const chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: data.get(key) };
      },
      async set(object) {
        const changes = {};
        for (const [key, value] of Object.entries(object)) {
          const oldValue = data.get(key);
          data.set(key, structuredClone(value));
          changes[key] = {
            oldValue: structuredClone(oldValue),
            newValue: structuredClone(value)
          };
        }
        for (const listener of changeListeners) listener(changes, 'local');
      }
    },
    onChanged: {
      addListener(listener) {
        changeListeners.push(listener);
      }
    }
  }
};

const window = {};
const context = vm.createContext({
  window,
  chrome,
  location: { hostname: 'alpha.example' },
  console,
  Map,
  Set,
  Object,
  Number,
  Boolean,
  Promise,
  structuredClone
});

vm.runInContext(fs.readFileSync(path.join(contentPath, 'namespace.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(contentPath, 'settings.js'), 'utf8'), context);

async function main() {
  const settings = window.__IMAGE_DISCREET_MODE__.Settings;
  const alphaDefaults = await settings.loadSite('alpha.example');
  const betaDefaults = await settings.loadSite('beta.example');
  assert(alphaDefaults.imageOpacity === 100, 'default opacity');
  assert(betaDefaults.grayscale === false && betaDefaults.disabled === false, 'default flags');

  await settings.updateSite('alpha.example', {
    imageOpacity: 33,
    imageBlur: 8,
    grayscale: true
  });
  await settings.updateSite('beta.example', {
    imageOpacity: 71,
    disabled: true
  });

  const alpha = await settings.loadSite('alpha.example');
  const beta = await settings.loadSite('beta.example');
  assert(alpha.imageOpacity === 33 && alpha.grayscale && !alpha.disabled, 'alpha host isolation');
  assert(beta.imageOpacity === 71 && beta.disabled && !beta.grayscale, 'beta host isolation');

  await settings.updateSite('alpha.example', {
    imageOpacity: 500,
    imageBlur: -2,
    imageScale: 300
  });
  const clamped = await settings.loadSite('alpha.example');
  assert(clamped.imageOpacity === 100, 'opacity clamp');
  assert(clamped.imageBlur === 0, 'blur clamp');
  assert(clamped.imageScale === 200, 'scale clamp');

  await settings.updateGlobal({ theme: 'dark', panelOpacity: 12 });
  const global = await settings.loadGlobal();
  assert(global.theme === 'dark' && global.panelOpacity === 20, 'global validation');

  await settings.resetImageSettings('alpha.example');
  const reset = await settings.loadSite('alpha.example');
  assert(
    !reset.hideImages && reset.imageOpacity === 100 && reset.imageBlur === 0 &&
    reset.imageScale === 100 && reset.grayscale,
    'Reset must preserve grayscale and unrelated state'
  );

  console.log('Settings module tests: PASS');
  console.log('Hostname isolation: PASS');
  console.log('Range validation: PASS');
  console.log('Reset scope (keeps grayscale): PASS');
  console.log('Global settings validation: PASS');
}

function assert(condition, label) {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
