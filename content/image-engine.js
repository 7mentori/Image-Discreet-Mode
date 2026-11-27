(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.ImageEngine) return;

  const BG_MARKER = 'data-idm-bg';
  const BG_RELATIVE_MARKER = 'data-idm-bg-relative';
  const IMAGE_PROPERTIES = ['opacity', 'filter', 'transform'];
  const BACKGROUND_PROPERTIES = ['background-image', 'position', 'isolation'];
  const BG_VARS = [
    '--idm-bg-image', '--idm-bg-size', '--idm-bg-position', '--idm-bg-repeat',
    '--idm-bg-origin', '--idm-bg-clip', '--idm-bg-attachment', '--idm-bg-blend',
    '--idm-bg-final-opacity', '--idm-bg-final-filter', '--idm-bg-final-transform'
  ];

  const imageMap = new WeakMap();
  const backgroundMap = new WeakMap();
  const imageStates = new Set();
  const backgroundStates = new Set();
  let currentSettings = { ...IDM.Settings.SITE_DEFAULTS };
  let observer = null;
  let scanScheduled = false;
  let running = false;
  const pendingScanRoots = new Set();
  const forcedScanRoots = new Set();
  const observedStylesheetLinks = new WeakSet();

  function isImageElement(element) {
    return element instanceof HTMLImageElement ||
      (element instanceof HTMLInputElement && element.type.toLowerCase() === 'image');
  }

  function isEffectActive() {
    return currentSettings.hideImages || currentSettings.imageOpacity < 100 || currentSettings.imageBlur > 0;
  }

  function isAnyImageEffectActive() {
    return isEffectActive() || currentSettings.imageScale !== 100;
  }

  function readDeclarations(element, properties) {
    const result = new Map();
    for (const property of properties) {
      result.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      });
    }
    return result;
  }

  function writeDeclaration(element, property, declaration) {
    if (declaration?.value) element.style.setProperty(property, declaration.value, declaration.priority);
    else element.style.removeProperty(property);
  }

  function restoreDeclarations(element, saved, properties, state) {
    for (const property of properties) {
      writeDeclaration(element, property, saved.get(property));
      if (state?.appliedProperties) state.appliedProperties[property] = null;
    }
  }

  function capturePageInlineChanges(element, state, properties) {
    for (const property of properties) {
      const current = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      };
      const applied = state.appliedProperties[property];
      if (!applied || current.value !== applied.value || current.priority !== applied.priority) {
        state.savedDeclarations.set(property, current);
      }
    }
  }

  function setManagedProperty(element, state, property, value) {
    if (value == null) {
      writeDeclaration(element, property, state.savedDeclarations.get(property));
      state.appliedProperties[property] = null;
      return;
    }
    const stringValue = String(value);
    element.style.setProperty(property, stringValue, 'important');
    state.appliedProperties[property] = { value: stringValue, priority: 'important' };
  }

  function getStyleSnapshot(element) {
    return element.getAttribute('style') || '';
  }

  function captureImageBase(state) {
    restoreDeclarations(state.element, state.savedDeclarations, IMAGE_PROPERTIES, state);
    const computed = getComputedStyle(state.element);
    state.base = {
      opacity: Number.parseFloat(computed.opacity) || 0,
      filter: computed.filter || 'none',
      transform: computed.transform || 'none'
    };
    state.lastStyleSnapshot = getStyleSnapshot(state.element);
  }

  function imageEffectValues(state) {
    const reveal = state.temporaryReveal || state.pinnedVisible;
    const opacityFactor = reveal ? 1 : (currentSettings.hideImages ? 0 : currentSettings.imageOpacity / 100);
    const blur = reveal ? 0 : currentSettings.imageBlur;
    const scale = currentSettings.imageScale / 100;
    const originalFilter = state.base.filter === 'none' ? '' : state.base.filter;
    const finalFilter = [originalFilter, blur > 0 ? `blur(${blur}px)` : ''].filter(Boolean).join(' ') || null;
    const finalTransform = scale === 1
      ? null
      : (state.base.transform === 'none' ? `scale(${scale})` : `${state.base.transform} scale(${scale})`);
    return {
      opacity: opacityFactor < 1 ? state.base.opacity * opacityFactor : null,
      filter: blur > 0 ? finalFilter : null,
      transform: finalTransform
    };
  }

  function applyImage(state) {
    const element = state.element;
    if (!element.isConnected) return;
    if (state.lastStyleSnapshot !== getStyleSnapshot(element)) {
      capturePageInlineChanges(element, state, IMAGE_PROPERTIES);
      captureImageBase(state);
    }
    if (!isAnyImageEffectActive()) {
      restoreDeclarations(element, state.savedDeclarations, IMAGE_PROPERTIES, state);
      state.lastStyleSnapshot = getStyleSnapshot(element);
      return;
    }
    const values = imageEffectValues(state);
    for (const property of IMAGE_PROPERTIES) setManagedProperty(element, state, property, values[property]);
    state.lastStyleSnapshot = getStyleSnapshot(element);
  }

  function attachImage(element) {
    if (imageMap.has(element) || !isAnyImageEffectActive()) return imageMap.get(element) || null;
    const state = {
      element,
      base: null,
      temporaryReveal: false,
      pinnedVisible: false,
      savedDeclarations: readDeclarations(element, IMAGE_PROPERTIES),
      appliedProperties: { opacity: null, filter: null, transform: null },
      lastStyleSnapshot: getStyleSnapshot(element)
    };
    imageMap.set(element, state);
    imageStates.add(state);
    captureImageBase(state);
    applyImage(state);
    return state;
  }

  function detachImage(state) {
    if (state.lastStyleSnapshot !== getStyleSnapshot(state.element)) {
      capturePageInlineChanges(state.element, state, IMAGE_PROPERTIES);
    }
    restoreDeclarations(state.element, state.savedDeclarations, IMAGE_PROPERTIES, state);
    imageMap.delete(state.element);
    imageStates.delete(state);
  }

  function hasBlockingPositionedDescendant(element) {
    for (const descendant of element.querySelectorAll('*')) {
      if (getComputedStyle(descendant).position === 'absolute') return true;
    }
    return false;
  }

  function readBackgroundBase(state) {
    const element = state.element;
    const hadMarker = element.hasAttribute(BG_MARKER);
    const hadRelative = element.hasAttribute(BG_RELATIVE_MARKER);
    if (hadMarker) element.removeAttribute(BG_MARKER);
    if (hadRelative) element.removeAttribute(BG_RELATIVE_MARKER);
    restoreDeclarations(element, state.savedDeclarations, BACKGROUND_PROPERTIES, state);

    const computed = getComputedStyle(element);
    const before = getComputedStyle(element, '::before');
    const display = computed.display;
    const attachment = computed.backgroundAttachment || 'scroll';
    const clip = computed.backgroundClip || 'border-box';
    const beforeContent = before.content;
    const position = computed.position;
    const unsupportedDisplay = display === 'inline' || display === 'contents' ||
      display === 'table-row' || display === 'table-cell' || display === 'table-column' ||
      display === 'table-column-group' || display === 'table-header-group' ||
      display === 'table-footer-group';
    const beforeAlreadyUsed = beforeContent !== 'none' && beforeContent !== 'normal';
    const unsupportedBackground = attachment.split(',').some((value) => /fixed|local/.test(value.trim())) ||
      clip.split(',').some((value) => value.trim() === 'text');
    const unsafePositioning = position === 'static' && hasBlockingPositionedDescendant(element);

    state.base = {
      image: computed.backgroundImage,
      size: computed.backgroundSize,
      position: computed.backgroundPosition,
      repeat: computed.backgroundRepeat,
      origin: computed.backgroundOrigin,
      clip: computed.backgroundClip,
      attachment,
      blend: computed.backgroundBlendMode,
      positionMode: position,
      eligible: !unsupportedDisplay && !beforeAlreadyUsed && !unsupportedBackground && !unsafePositioning &&
        computed.backgroundImage !== 'none' && computed.backgroundImage !== ''
    };

    if (hadRelative) element.setAttribute(BG_RELATIVE_MARKER, '1');
    if (hadMarker) element.setAttribute(BG_MARKER, '1');
    state.lastStyleSnapshot = getStyleSnapshot(element);
  }

  function backgroundEffectValues(state) {
    const reveal = state.temporaryReveal || state.pinnedVisible;
    const opacity = reveal ? 1 : (currentSettings.hideImages ? 0 : currentSettings.imageOpacity / 100);
    const blur = reveal ? 0 : currentSettings.imageBlur;
    const scale = currentSettings.imageScale / 100;
    return {
      '--idm-bg-image': state.base.image,
      '--idm-bg-size': state.base.size,
      '--idm-bg-position': state.base.position,
      '--idm-bg-repeat': state.base.repeat,
      '--idm-bg-origin': state.base.origin,
      '--idm-bg-clip': state.base.clip,
      '--idm-bg-attachment': state.base.attachment,
      '--idm-bg-blend': state.base.blend,
      '--idm-bg-final-opacity': opacity,
      '--idm-bg-final-filter': blur > 0 ? `blur(${blur}px)` : 'none',
      '--idm-bg-final-transform': scale === 1 ? 'none' : `scale(${scale})`
    };
  }

  function setBackgroundVars(element, values) {
    for (const [property, value] of Object.entries(values)) element.style.setProperty(property, String(value));
  }

  function restoreBackgroundVars(state) {
    for (const [property, original] of state.savedVars) {
      if (original.value) state.element.style.setProperty(property, original.value, original.priority);
      else state.element.style.removeProperty(property);
    }
  }

  function applyBackground(state) {
    const element = state.element;
    if (!element.isConnected) return;
    if (state.lastStyleSnapshot !== getStyleSnapshot(element)) {
      capturePageInlineChanges(element, state, BACKGROUND_PROPERTIES);
      readBackgroundBase(state);
      if (!state.base.eligible) {
        detachBackground(state);
        return;
      }
    }
    if (!isAnyImageEffectActive()) {
      element.removeAttribute(BG_MARKER);
      element.removeAttribute(BG_RELATIVE_MARKER);
      restoreDeclarations(element, state.savedDeclarations, BACKGROUND_PROPERTIES, state);
      restoreBackgroundVars(state);
      state.lastStyleSnapshot = getStyleSnapshot(element);
      return;
    }

    element.setAttribute(BG_MARKER, '1');
    setManagedProperty(element, state, 'background-image', 'none');
    setManagedProperty(element, state, 'isolation', 'isolate');
    if (state.base.positionMode === 'static') {
      element.setAttribute(BG_RELATIVE_MARKER, '1');
      setManagedProperty(element, state, 'position', 'relative');
    } else {
      element.removeAttribute(BG_RELATIVE_MARKER);
      setManagedProperty(element, state, 'position', null);
    }
    setBackgroundVars(element, backgroundEffectValues(state));
    state.lastStyleSnapshot = getStyleSnapshot(element);
  }

  function attachBackground(element) {
    if (backgroundMap.has(element) || element.hasAttribute(BG_MARKER) || !isAnyImageEffectActive()) {
      return backgroundMap.get(element) || null;
    }
    const state = {
      element,
      base: null,
      temporaryReveal: false,
      pinnedVisible: false,
      savedDeclarations: readDeclarations(element, BACKGROUND_PROPERTIES),
      appliedProperties: { 'background-image': null, position: null, isolation: null },
      savedVars: readDeclarations(element, BG_VARS),
      lastStyleSnapshot: getStyleSnapshot(element)
    };
    backgroundMap.set(element, state);
    backgroundStates.add(state);
    readBackgroundBase(state);
    if (!state.base.eligible) {
      detachBackground(state);
      return null;
    }
    applyBackground(state);
    return state;
  }

  function detachBackground(state) {
    const element = state.element;
    if (state.lastStyleSnapshot !== getStyleSnapshot(element)) {
      capturePageInlineChanges(element, state, BACKGROUND_PROPERTIES);
    }
    element.removeAttribute(BG_MARKER);
    element.removeAttribute(BG_RELATIVE_MARKER);
    restoreDeclarations(element, state.savedDeclarations, BACKGROUND_PROPERTIES, state);
    restoreBackgroundVars(state);
    backgroundMap.delete(element);
    backgroundStates.delete(state);
  }

  function processImage(element, forceRefresh = false) {
    if (!isImageElement(element)) return;
    const existing = imageMap.get(element);
    if (existing) {
      if (forceRefresh || existing.lastStyleSnapshot !== getStyleSnapshot(element)) {
        capturePageInlineChanges(element, existing, IMAGE_PROPERTIES);
        captureImageBase(existing);
        applyImage(existing);
      }
      return;
    }
    attachImage(element);
  }

  function processBackground(element, forceRefresh = false) {
    if (!(element instanceof Element) || element === document.documentElement || element === document.body) return;
    const existing = backgroundMap.get(element);
    if (existing && !forceRefresh) {
      if (existing.lastStyleSnapshot !== getStyleSnapshot(element)) {
        capturePageInlineChanges(element, existing, BACKGROUND_PROPERTIES);
        readBackgroundBase(existing);
        if (!existing.base.eligible) detachBackground(existing);
        else applyBackground(existing);
      }
      return;
    }
    if (existing && forceRefresh) {
      capturePageInlineChanges(element, existing, BACKGROUND_PROPERTIES);
      readBackgroundBase(existing);
      if (!existing.base.eligible) {
        detachBackground(existing);
        return;
      }
      applyBackground(existing);
      return;
    }

    if (!isAnyImageEffectActive()) return;
    const computed = getComputedStyle(element);
    if (!computed.backgroundImage || computed.backgroundImage === 'none') return;
    attachBackground(element);
  }

  function processElement(element, forceRefresh = false) {
    if (!(element instanceof Element)) return;
    if (isImageElement(element)) {
      processImage(element, forceRefresh);
      return;
    }
    const staleImage = imageMap.get(element);
    if (staleImage) detachImage(staleImage);
    processBackground(element, forceRefresh);
  }

  function scan(root = document, forceRefresh = false) {
    if (!running || !isAnyImageEffectActive()) return;
    if (root instanceof Element) processElement(root, forceRefresh);
    const nodes = root.querySelectorAll?.('img, input[type="image"], *') || [];
    for (const element of nodes) processElement(element, forceRefresh);
  }

  function scheduleScan(root = document, forceRefresh = false) {
    const normalizedRoot = root instanceof Element ? root : document;
    pendingScanRoots.add(normalizedRoot);
    if (forceRefresh) forcedScanRoots.add(normalizedRoot);
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      const roots = [...pendingScanRoots];
      const forcedRoots = new Set(forcedScanRoots);
      pendingScanRoots.clear();
      forcedScanRoots.clear();
      if (roots.includes(document) || roots.some((item) => !item.isConnected)) {
        scan(document, forcedRoots.has(document));
      } else {
        for (const item of roots) scan(item, forcedRoots.has(item));
      }
    });
  }

  function observeStylesheetLinks(root) {
    if (!(root instanceof Element || root instanceof Document)) return;
    const links = [];
    if (root instanceof HTMLLinkElement && root.relList.contains('stylesheet')) links.push(root);
    for (const link of root.querySelectorAll?.('link[rel~="stylesheet"]') || []) links.push(link);
    for (const link of links) {
      if (observedStylesheetLinks.has(link)) continue;
      observedStylesheetLinks.add(link);
      link.addEventListener('load', () => scheduleScan(document, true), { once: true });
      if (link.sheet) scheduleScan(document, true);
    }
  }

  function handleMutations(records) {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            observeStylesheetLinks(node);
            if (node instanceof HTMLStyleElement) scheduleScan(document, true);
            else scheduleScan(node);
          }
        }
        if (record.target instanceof HTMLStyleElement) scheduleScan(document, true);
        continue;
      }
      if (record.type !== 'attributes') continue;
      const target = record.target;
      if (!(target instanceof Element)) continue;

      if (record.attributeName === 'style') {
        if (target === document.documentElement || target === document.body) scheduleScan(document, true);
        const imageState = imageMap.get(target);
        if (imageState && imageState.lastStyleSnapshot !== getStyleSnapshot(target)) {
          capturePageInlineChanges(target, imageState, IMAGE_PROPERTIES);
          captureImageBase(imageState);
          applyImage(imageState);
        }
        const bgState = backgroundMap.get(target);
        if (bgState && bgState.lastStyleSnapshot !== getStyleSnapshot(target)) {
          capturePageInlineChanges(target, bgState, BACKGROUND_PROPERTIES);
          readBackgroundBase(bgState);
          if (!bgState.base.eligible) detachBackground(bgState);
          else applyBackground(bgState);
        } else if (!bgState) {
          processBackground(target, true);
        }
      } else if (record.attributeName === 'class') {
        if (target === document.documentElement || target === document.body) scheduleScan(document, true);
        const imageState = imageMap.get(target);
        if (imageState) {
          capturePageInlineChanges(target, imageState, IMAGE_PROPERTIES);
          captureImageBase(imageState);
          applyImage(imageState);
        }
        processBackground(target, true);
      } else if (record.attributeName === 'src' || record.attributeName === 'srcset' || record.attributeName === 'type') {
        processElement(target);
      }
    }
    pruneDisconnected();
  }

  function pruneDisconnected() {
    for (const state of [...imageStates]) {
      if (!state.element.isConnected) detachImage(state);
    }
    for (const state of [...backgroundStates]) {
      if (!state.element.isConnected) detachBackground(state);
    }
  }

  function applyAll() {
    for (const state of imageStates) applyImage(state);
    for (const state of backgroundStates) applyBackground(state);
    scheduleScan(document);
  }

  function setSettings(settings) {
    currentSettings = IDM.Settings.validateSite(settings);
    applyAll();
  }

  function findTargetFromNode(node) {
    let element = node instanceof Element ? node : node?.parentElement;
    while (element && element !== document.documentElement) {
      if (isImageElement(element) && imageMap.has(element)) return element;
      if (backgroundMap.has(element) && element.getAttribute(BG_MARKER) === '1') return element;
      element = element.parentElement;
    }
    return null;
  }

  function isActionableTarget(element) {
    return Boolean(element && isEffectActive() && (imageMap.has(element) || backgroundMap.has(element)));
  }

  function setTemporaryReveal(element, value) {
    const state = imageMap.get(element) || backgroundMap.get(element);
    if (!state) return;
    state.temporaryReveal = Boolean(value);
    if (imageMap.has(element)) applyImage(state);
    else applyBackground(state);
  }

  function togglePinned(element) {
    const state = imageMap.get(element) || backgroundMap.get(element);
    if (!state) return false;
    state.pinnedVisible = !state.pinnedVisible;
    if (imageMap.has(element)) applyImage(state);
    else applyBackground(state);
    return state.pinnedVisible;
  }

  function isPinned(element) {
    const state = imageMap.get(element) || backgroundMap.get(element);
    return Boolean(state?.pinnedVisible);
  }

  function clearExceptions() {
    for (const state of imageStates) {
      state.temporaryReveal = false;
      state.pinnedVisible = false;
      applyImage(state);
    }
    for (const state of backgroundStates) {
      state.temporaryReveal = false;
      state.pinnedVisible = false;
      applyBackground(state);
    }
  }

  function onViewportChange() {
    scheduleScan(document, true);
  }

  function start() {
    if (running || !IDM.isSupportedPage()) return;
    running = true;
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'type', 'style', 'class']
    });
    observeStylesheetLinks(document);
    document.addEventListener('DOMContentLoaded', onViewportChange, { once: true });
    window.addEventListener('load', onViewportChange, { once: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('orientationchange', onViewportChange, { passive: true });
    scan(document);
  }

  function stop() {
    running = false;
    observer?.disconnect();
    document.removeEventListener('DOMContentLoaded', onViewportChange);
    window.removeEventListener('load', onViewportChange);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);
    observer = null;
    for (const state of [...imageStates]) detachImage(state);
    for (const state of [...backgroundStates]) detachBackground(state);
    imageStates.clear();
    backgroundStates.clear();
    scanScheduled = false;
    pendingScanRoots.clear();
    forcedScanRoots.clear();
  }

  IDM.ImageEngine = {
    start,
    stop,
    scan,
    setSettings,
    isEffectActive,
    isAnyImageEffectActive,
    findTargetFromNode,
    isActionableTarget,
    setTemporaryReveal,
    togglePinned,
    isPinned,
    clearExceptions,
    getSettings: () => ({ ...currentSettings })
  };
})();
