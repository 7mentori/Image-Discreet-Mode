(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.SingleImage) return;

  let host = null;
  let shadow = null;
  let button = null;
  let activeTarget = null;
  let hideTimer = null;
  let pointerId = null;
  let temporaryActive = false;
  let enabled = false;

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'idm-single-image-host';
    for (const [property, value] of Object.entries({
      all: 'initial', position: 'fixed', inset: '0px', width: '100vw', height: '100vh',
      'z-index': '2147483646', 'pointer-events': 'none', display: 'block'
    })) host.style.setProperty(property, value, 'important');
    shadow = host.attachShadow({ mode: 'closed' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/panel.css');
    shadow.appendChild(link);
    const wrapper = document.createElement('div');
    wrapper.className = 'single-action-layer';
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'single-action-button';
    button.textContent = '◉';
    button.setAttribute('aria-label', IDM.I18n.t('holdPreview'));
    button.title = `${IDM.I18n.t('holdPreview')} · ${IDM.I18n.t('rightClickPin')}`;
    wrapper.appendChild(button);
    shadow.appendChild(wrapper);

    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointerup', (event) => {
      event.stopPropagation();
      endTemporaryReveal(event);
    });
    button.addEventListener('pointercancel', (event) => {
      event.stopPropagation();
      endTemporaryReveal(event);
    });
    button.addEventListener('lostpointercapture', (event) => {
      event.stopPropagation();
      endTemporaryReveal(event);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    button.addEventListener('pointerleave', scheduleHide);

    document.documentElement.appendChild(host);
  }

  function pointIsInsideButton(event) {
    if (!host || !event.relatedTarget) return false;
    return event.relatedTarget === host || host.contains(event.relatedTarget) ||
      event.relatedTarget.getRootNode?.() === shadow;
  }

  function positionButton(target) {
    if (!target?.isConnected || !button) return;
    const rect = target.getBoundingClientRect();
    const width = 30;
    const height = 30;
    let left = rect.right - width - 5;
    let top = rect.top + 5;
    if (left < 4) left = Math.max(4, rect.left + 5);
    if (top < 4) top = Math.min(window.innerHeight - height - 4, rect.bottom - height - 5);
    left = Math.max(4, Math.min(window.innerWidth - width - 4, left));
    top = Math.max(4, Math.min(window.innerHeight - height - 4, top));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  }

  function showFor(target) {
    if (!IDM.ImageEngine.isActionableTarget(target)) return;
    ensureHost();
    clearTimeout(hideTimer);
    activeTarget = target;
    button.classList.toggle('is-pinned', IDM.ImageEngine.isPinned(target));
    button.title = `${IDM.I18n.t('holdPreview')} · ${IDM.I18n.t('rightClickPin')}`;
    button.setAttribute('aria-label', IDM.I18n.t('holdPreview'));
    button.style.display = 'block';
    positionButton(target);
  }

  function hideButton() {
    if (temporaryActive) return;
    if (button) button.style.display = 'none';
    activeTarget = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (temporaryActive) return;
    hideTimer = setTimeout(() => {
      hideButton();
    }, 90);
  }

  function resolveTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (const node of path) {
      if (node instanceof Element) {
        const target = IDM.ImageEngine.findTargetFromNode(node);
        if (target && IDM.ImageEngine.isActionableTarget(target)) return target;
      }
    }
    return IDM.ImageEngine.findTargetFromNode(event.target);
  }

  function onPointerOver(event) {
    if (!enabled || pointIsInsideButton(event)) return;
    const target = resolveTarget(event);
    if (target) showFor(target);
    else if (!temporaryActive) scheduleHide();
  }

  function onPointerOut(event) {
    if (!enabled || pointIsInsideButton(event)) return;
    const next = event.relatedTarget instanceof Element ? IDM.ImageEngine.findTargetFromNode(event.relatedTarget) : null;
    if (next && next === activeTarget) return;
    if (next && IDM.ImageEngine.isActionableTarget(next)) {
      showFor(next);
      return;
    }
    scheduleHide();
  }

  function onPointerDown(event) {
    if (!activeTarget || !IDM.ImageEngine.isActionableTarget(activeTarget)) return;
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      const pinned = IDM.ImageEngine.togglePinned(activeTarget);
      button.classList.toggle('is-pinned', pinned);
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    temporaryActive = true;
    pointerId = event.pointerId;
    try { button.setPointerCapture(event.pointerId); } catch { /* capture can fail during page teardown */ }
    IDM.ImageEngine.setTemporaryReveal(activeTarget, true);
  }

  function endTemporaryReveal(event) {
    if (!temporaryActive) return;
    if (event?.pointerId != null && pointerId != null && event.pointerId !== pointerId) return;
    temporaryActive = false;
    pointerId = null;
    if (activeTarget) IDM.ImageEngine.setTemporaryReveal(activeTarget, false);
    scheduleHide();
  }

  function onWindowBlur() {
    endTemporaryReveal();
  }

  function reposition() {
    if (activeTarget && button?.style.display !== 'none') positionButton(activeTarget);
  }

  function start() {
    if (enabled) return;
    enabled = true;
    ensureHost();
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    window.addEventListener('blur', onWindowBlur, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition, true);
  }

  function refresh() {
    if (!enabled || !activeTarget) return;
    if (!IDM.ImageEngine.isActionableTarget(activeTarget)) hideButton();
    else {
      button.classList.toggle('is-pinned', IDM.ImageEngine.isPinned(activeTarget));
      positionButton(activeTarget);
    }
  }

  function stop() {
    if (!enabled && !host) return;
    enabled = false;
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    window.removeEventListener('blur', onWindowBlur, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition, true);
    clearTimeout(hideTimer);
    endTemporaryReveal();
    host?.remove();
    host = null;
    shadow = null;
    button = null;
    activeTarget = null;
  }

  IDM.SingleImage = { start, stop, refresh };
})();
