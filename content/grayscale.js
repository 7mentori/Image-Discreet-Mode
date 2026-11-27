(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.Grayscale) return;

  let overlay = null;
  let enabled = false;

  function enable() {
    if (enabled) return;
    if (!document.documentElement) return;
    overlay = document.createElement('div');
    overlay.setAttribute('data-idm-grayscale-overlay', '1');
    overlay.setAttribute('aria-hidden', 'true');
    for (const [property, value] of Object.entries({
      all: 'initial', position: 'fixed', inset: '0px', width: '100vw', height: '100vh',
      margin: '0px', padding: '0px', border: '0px', 'border-radius': '0px',
      'pointer-events': 'none', 'z-index': '2147483645', background: 'transparent',
      '-webkit-backdrop-filter': 'grayscale(1)', 'backdrop-filter': 'grayscale(1)',
      display: 'block'
    })) overlay.style.setProperty(property, value, 'important');
    document.documentElement.appendChild(overlay);
    enabled = true;
  }

  function disable() {
    if (!enabled && !overlay) return;
    overlay?.remove();
    overlay = null;
    enabled = false;
  }

  function setEnabled(value) {
    if (value) enable();
    else disable();
  }

  function stop() {
    disable();
  }

  IDM.Grayscale = {
    setEnabled,
    stop,
    isEnabled: () => enabled
  };
})();
