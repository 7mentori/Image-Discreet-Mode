(() => {
  if (window.__IMAGE_DISCREET_MODE__) return;

  const listeners = new Map();
  const api = {
    version: '1.2.0',
    events: {
      on(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
        return () => listeners.get(name)?.delete(callback);
      },
      emit(name, payload) {
        for (const callback of listeners.get(name) || []) {
          try { callback(payload); } catch (error) { console.error('[IDM] Event callback failed:', error); }
        }
      }
    },
    clamp(value, min, max, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    },
    isSupportedPage() {
      return location.protocol === 'http:' || location.protocol === 'https:';
    }
  };

  Object.defineProperty(window, '__IMAGE_DISCREET_MODE__', {
    value: api,
    configurable: false,
    writable: false
  });
})();
