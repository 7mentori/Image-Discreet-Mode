(() => {
  'use strict';

  const STYLE_ID = '__idm_image_effect_styles__';
  const IMAGE_MARKER = 'data-idm-image-target';
  const BG_MARKER = 'data-idm-bg-source';
  const BG_OVERLAY_MARKER = 'data-idm-bg-overlay';
  const INTERNAL_MARKER = 'data-idm-internal';
  const CUSTOM_PROPERTIES = [
    '--idm-base-opacity',
    '--idm-base-filter',
    '--idm-base-transform',
    '--idm-base-transform-origin',
    '--idm-effective-filter',
    '--idm-effective-transform',
    '--idm-opacity',
    '--idm-blur',
    '--idm-scale',
    '--idm-visibility'
  ];
  const BACKGROUND_PROPERTIES = [
    'backgroundImage',
    'backgroundSize',
    'backgroundPosition',
    'backgroundRepeat',
    'backgroundOrigin',
    'backgroundClip',
    'backgroundAttachment',
    'backgroundBlendMode'
  ];

  const EFFECT_STYLE_TEXT = `
    [${IMAGE_MARKER}="1"] {
      opacity: calc(var(--idm-base-opacity, 1) * var(--idm-opacity, 1)) !important;
      filter: var(--idm-effective-filter, none) !important;
      visibility: var(--idm-visibility, visible) !important;
      transform: var(--idm-effective-transform, none) !important;
      transform-origin: var(--idm-base-transform-origin, 50% 50%) !important;
    }
    [${BG_MARKER}="1"] {
      background-image: none !important;
      isolation: isolate !important;
    }
    [data-idm-bg-needs-position="1"] {
      position: relative !important;
    }
    [${BG_OVERLAY_MARKER}="1"] {
      position: absolute !important;
      inset: 0 !important;
      z-index: -1 !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      pointer-events: none !important;
      background-color: transparent !important;
      opacity: var(--idm-opacity, 1) !important;
      filter: var(--idm-effective-filter, none) !important;
      visibility: var(--idm-visibility, visible) !important;
      transform: var(--idm-effective-transform, none) !important;
      transform-origin: 50% 50% !important;
    }
  `;

  function isElement(value) {
    return value && value.nodeType === Node.ELEMENT_NODE;
  }

  function isInternal(element) {
    return !isElement(element) || element.hasAttribute(INTERNAL_MARKER) ||
      element.hasAttribute(BG_OVERLAY_MARKER);
  }

  function isImageElement(element) {
    if (!isElement(element)) return false;
    if (element.tagName === 'IMG') return true;
    return element.tagName === 'INPUT' && String(element.getAttribute('type') || '').toLowerCase() === 'image';
  }

  function isDefaultEffects(settings) {
    return !settings.hidden && settings.opacity === 100 && settings.blur === 0 && settings.scale === 100;
  }

  function saveInlineCustomProperties(element) {
    const saved = new Map();
    for (const property of CUSTOM_PROPERTIES) {
      saved.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      });
    }
    return saved;
  }

  function restoreInlineCustomProperties(element, saved) {
    if (!saved) return;
    for (const [property, original] of saved.entries()) {
      if (original.value) {
        element.style.setProperty(property, original.value, original.priority);
      } else {
        element.style.removeProperty(property);
      }
    }
  }

  class ImageEngine {
    constructor(settings) {
      this.settings = { ...settings };
      this.destroyed = false;
      this.imageStates = new WeakMap();
      this.bgStates = new WeakMap();
      this.managedImageNodes = new Set();
      this.managedBackgroundNodes = new Set();
      this.observer = null;
      this.refreshQueued = false;
      this.styleElement = null;
      this._onResize = this.queueRefresh.bind(this);
      this._onLoad = this.onResourceLoad.bind(this);
      this._onVisibilityChange = this.queueRefresh.bind(this);

      this.installStyle();
      this.observeDocument();
      this.bindGlobalEvents();
      if (!isDefaultEffects(this.settings)) this.refreshAll();
    }

    installStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = EFFECT_STYLE_TEXT;
      (document.head || document.documentElement).appendChild(style);
      this.styleElement = style;
    }

    observeDocument() {
      this.observer = new MutationObserver((records) => {
        if (this.destroyed || isDefaultEffects(this.settings)) return;
        for (const record of records) {
          if (record.type === 'attributes') {
            const target = record.target;
            if (!isElement(target) || isInternal(target)) continue;
            if (record.attributeName === 'style') {
              const imageState = this.imageStates.get(target);
              if (imageState && imageState.lastStyleText === target.getAttribute('style')) continue;
            }
            if (record.attributeName === 'class' || record.attributeName === 'style') {
              this.processTree(target);
            } else {
              this.processElement(target, true, record.attributeName);
            }
          } else if (record.type === 'childList') {
            for (const node of record.removedNodes) {
              if (isElement(node) && !isInternal(node)) this.cleanupTree(node);
            }
            for (const node of record.addedNodes) {
              if (isElement(node) && !isInternal(node)) this.processTree(node);
            }
          }
        }
      });

      this.observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          'src', 'srcset', 'type', 'style', 'class', 'hidden',
          'data-src', 'data-original', 'data-background', 'poster'
        ]
      });
    }

    bindGlobalEvents() {
      window.addEventListener('resize', this._onResize, { passive: true });
      window.addEventListener('orientationchange', this._onResize, { passive: true });
      document.addEventListener('load', this._onLoad, true);
      document.addEventListener('visibilitychange', this._onVisibilityChange, { passive: true });
    }

    onResourceLoad(event) {
      if (this.destroyed || isDefaultEffects(this.settings)) return;
      const target = event.target;
      if (isImageElement(target) || isElement(target)) this.processElement(target, true);
      if (target && target.tagName === 'LINK') this.queueRefresh();
    }

    setSettings(settings) {
      this.settings = { ...settings };
      if (isDefaultEffects(this.settings)) {
        this.restoreAll();
      } else {
        this.refreshAll();
      }
    }

    queueRefresh() {
      if (this.destroyed || this.refreshQueued || isDefaultEffects(this.settings)) return;
      this.refreshQueued = true;
      requestAnimationFrame(() => {
        this.refreshQueued = false;
        if (!this.destroyed) this.refreshAll();
      });
    }

    refreshAll() {
      if (this.destroyed || isDefaultEffects(this.settings)) return;
      this.processTree(document.documentElement);
    }

    processTree(root) {
      if (!isElement(root) || isInternal(root)) return;
      this.processElement(root, false);
      const descendants = root.querySelectorAll('*');
      for (const element of descendants) {
        if (!isInternal(element)) this.processElement(element, false);
      }
    }

    getBaseComputedStyle(element, marker) {
      const hadMarker = element.getAttribute(marker);
      if (hadMarker !== null) element.removeAttribute(marker);
      const computed = getComputedStyle(element);
      const values = {
        opacity: computed.opacity,
        filter: computed.filter,
        transform: computed.transform,
        transformOrigin: computed.transformOrigin,
        visibility: computed.visibility
      };
      if (hadMarker !== null) element.setAttribute(marker, hadMarker);
      return values;
    }

    setImageVariables(element, state, base) {
      const style = element.style;
      style.setProperty('--idm-base-opacity', base.opacity || '1');
      const baseFilter = base.filter && base.filter !== 'none' ? `${base.filter} ` : '';
      const baseTransform = base.transform && base.transform !== 'none' ? `${base.transform} ` : '';
      style.setProperty('--idm-effective-filter', `${baseFilter}blur(${this.settings.blur}px)`);
      style.setProperty('--idm-effective-transform', `${baseTransform}scale(${this.settings.scale / 100})`);
      style.setProperty('--idm-base-transform-origin', base.transformOrigin || '50% 50%');
      style.setProperty('--idm-opacity', String(this.settings.opacity / 100));
      style.setProperty('--idm-visibility', this.settings.hidden ? 'hidden' : (base.visibility || 'visible'));
      state.lastStyleText = element.getAttribute('style');
    }

    processImageElement(element, forceRefresh, attributeName) {
      let state = this.imageStates.get(element);
      const currentStyleText = element.getAttribute('style');
      if (state && attributeName === 'style' && state.lastStyleText === currentStyleText) return;
      if (!state) {
        state = {
          savedProperties: saveInlineCustomProperties(element),
          hadMarker: element.hasAttribute(IMAGE_MARKER),
          originalMarker: element.getAttribute(IMAGE_MARKER),
          lastStyleText: null
        };
        this.imageStates.set(element, state);
        this.managedImageNodes.add(element);
      }
      const base = this.getBaseComputedStyle(element, IMAGE_MARKER);
      if (!element.hasAttribute(IMAGE_MARKER)) element.setAttribute(IMAGE_MARKER, '1');
      this.setImageVariables(element, state, base);
    }

    copyBackgroundProperties(source, overlay) {
      const hadMarker = source.getAttribute(BG_MARKER);
      if (hadMarker !== null) source.removeAttribute(BG_MARKER);
      const computed = getComputedStyle(source);
      for (const property of BACKGROUND_PROPERTIES) {
        overlay.style[property] = computed[property];
      }
      overlay.style.borderRadius = computed.borderRadius;
      overlay.style.opacity = String(this.settings.opacity / 100);
      // Existing filter/opacity on the source already affects its full rendered subtree.
      overlay.style.filter = `blur(${this.settings.blur}px)`;
      overlay.style.transform = `scale(${this.settings.scale / 100})`;
      overlay.style.visibility = this.settings.hidden ? 'hidden' : 'visible';
      overlay.style.setProperty('--idm-opacity', String(this.settings.opacity / 100));
      overlay.style.setProperty('--idm-effective-filter', `blur(${this.settings.blur}px)`);
      overlay.style.setProperty('--idm-effective-transform', `scale(${this.settings.scale / 100})`);
      overlay.style.setProperty('--idm-visibility', this.settings.hidden ? 'hidden' : 'visible');
      if (hadMarker !== null) source.setAttribute(BG_MARKER, hadMarker);
    }

    processBackgroundElement(element) {
      if (element === document.documentElement || element === document.body) return;
      let state = this.bgStates.get(element);
      const hadMarker = element.getAttribute(BG_MARKER);
      if (hadMarker !== null) element.removeAttribute(BG_MARKER);
      const computed = getComputedStyle(element);
      const imageValue = computed.backgroundImage;
      if (hadMarker !== null) element.setAttribute(BG_MARKER, hadMarker);

      const hasBackgroundImage = imageValue && imageValue !== 'none';
      if (!hasBackgroundImage) {
        if (state) this.removeBackgroundState(element, state);
        return;
      }

      if (!state) {
        const overlay = document.createElement('div');
        overlay.setAttribute(BG_OVERLAY_MARKER, '1');
        overlay.setAttribute(INTERNAL_MARKER, '1');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('role', 'presentation');
        element.appendChild(overlay);
        const computedPosition = getComputedStyle(element).position;
        state = {
          overlay,
          hadMarker: element.hasAttribute(BG_MARKER),
          originalMarker: element.getAttribute(BG_MARKER),
          hadPositionMarker: element.hasAttribute('data-idm-bg-needs-position'),
          originalPositionMarker: element.getAttribute('data-idm-bg-needs-position'),
          needsPosition: computedPosition === 'static'
        };
        this.bgStates.set(element, state);
        this.managedBackgroundNodes.add(element);
      }

      if (!element.hasAttribute(BG_MARKER)) element.setAttribute(BG_MARKER, '1');
      if (state.needsPosition) element.setAttribute('data-idm-bg-needs-position', '1');
      // The marker hides only the element's background-image; the absolute child paints it separately.
      this.copyBackgroundProperties(element, state.overlay);
    }

    cleanupTree(root) {
      if (!isElement(root)) return;
      const candidates = [root, ...root.querySelectorAll('*')];
      for (const element of candidates) {
        const imageState = this.imageStates.get(element);
        if (imageState) this.removeImageState(element, imageState);
        const bgState = this.bgStates.get(element);
        if (bgState) this.removeBackgroundState(element, bgState);
      }
    }

    processElement(element, forceRefresh = false, attributeName = null) {
      if (this.destroyed || !isElement(element) || isInternal(element)) return;

      if (isImageElement(element)) {
        this.processImageElement(element, forceRefresh, attributeName);
      }

      this.processBackgroundElement(element);
    }

    removeImageState(element, state) {
      if (!state) return;
      if (state.hadMarker) {
        element.setAttribute(IMAGE_MARKER, state.originalMarker || '');
      } else {
        element.removeAttribute(IMAGE_MARKER);
      }
      restoreInlineCustomProperties(element, state.savedProperties);
      this.imageStates.delete(element);
      this.managedImageNodes.delete(element);
    }

    removeBackgroundState(element, state) {
      if (!state) return;
      if (state.overlay && state.overlay.parentNode === element) state.overlay.remove();
      if (state.hadMarker) {
        element.setAttribute(BG_MARKER, state.originalMarker || '');
      } else {
        element.removeAttribute(BG_MARKER);
      }
      if (state.hadPositionMarker) {
        element.setAttribute('data-idm-bg-needs-position', state.originalPositionMarker || '');
      } else {
        element.removeAttribute('data-idm-bg-needs-position');
      }
      this.bgStates.delete(element);
      this.managedBackgroundNodes.delete(element);
    }

    restoreAll() {
      if (this.destroyed) return;
      for (const element of Array.from(this.managedImageNodes)) {
        const state = this.imageStates.get(element);
        this.removeImageState(element, state);
      }
      for (const element of Array.from(this.managedBackgroundNodes)) {
        const state = this.bgStates.get(element);
        this.removeBackgroundState(element, state);
      }
      // Clean up any stale overlay left after a page-side DOM replacement.
      document.querySelectorAll(`[${BG_OVERLAY_MARKER}]`).forEach((node) => node.remove());
    }

    destroy() {
      if (this.destroyed) return;
      this.restoreAll();
      this.destroyed = true;
      if (this.observer) this.observer.disconnect();
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
      document.removeEventListener('load', this._onLoad, true);
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
    }
  }

  window.IDMImageEngine = ImageEngine;
})();
