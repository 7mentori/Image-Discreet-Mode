(() => {
  'use strict';

  const HOST_ID = '__image_discreet_mode_host__';
  const STYLE_PATH = 'panel/panel.css';
  const UI_TEXT = {
    zh: {
      title: 'Image Discreet Mode',
      hideImages: '隱藏圖片',
      imageOpacity: '圖片透明度',
      blur: '圖片模糊',
      scale: '圖片縮放',
      theme: '主題',
      light: '淺色',
      dark: '深色',
      panelOpacity: 'Panel 透明度',
      disableSite: '此網站禁用',
      collapse: '收合 Panel',
      drag: '拖曳移動 Panel',
      percent: '%',
      px: 'px',
      language: 'zh'
    },
    en: {
      title: 'Image Discreet Mode',
      hideImages: 'Hide images',
      imageOpacity: 'Image opacity',
      blur: 'Blur',
      scale: 'Scale',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',
      panelOpacity: 'Panel opacity',
      disableSite: 'Disable on this site',
      collapse: 'Collapse panel',
      drag: 'Drag to move panel',
      percent: '%',
      px: 'px',
      language: 'en'
    }
  };

  function getLanguage() {
    return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  class Panel {
    constructor({ siteSettings, globalSettings, onSiteChange, onSitePreview, onGlobalChange, onDisable }) {
      this.siteSettings = { ...siteSettings };
      this.globalSettings = { ...globalSettings };
      this.onSiteChange = onSiteChange;
      this.onSitePreview = onSitePreview;
      this.onGlobalChange = onGlobalChange;
      this.onDisable = onDisable;
      this.language = getLanguage();
      this.text = UI_TEXT[this.language];
      this.visible = true;
      this.collapsed = true;
      this.destroyed = false;
      this.dragging = false;
      this.suppressHoverUntilOutside = false;
      this.closeTimer = null;
      this.pendingPointer = null;
      this.trackingPointer = false;
      this.host = null;
      this.shadow = null;
      this.region = null;
      this.panel = null;
      this.handle = null;
      this.controls = {};
      this.pendingSiteSave = null;
      this.pendingGlobalSave = null;
      this._onGlobalPointerMove = this.onGlobalPointerMove.bind(this);
      this._onWindowBlur = this.onWindowBlur.bind(this);

      this.build();
    }

    build() {
      const existing = document.getElementById(HOST_ID);
      if (existing) existing.remove();

      this.host = document.createElement('div');
      this.host.id = HOST_ID;
      this.host.setAttribute('aria-label', this.text.title);
      this.host.style.cssText = [
        'all:initial',
        'position:fixed!important',
        'top:16px!important',
        'right:0!important',
        'left:auto!important',
        'width:304px!important',
        'height:1px!important',
        'z-index:2147483647!important',
        'pointer-events:none!important',
        'display:block!important',
        'margin:0!important',
        'padding:0!important',
        'border:0!important',
        'background:transparent!important',
        'overflow:visible!important',
        'font:normal 13px/1.4 Arial,sans-serif!important'
      ].join(';');

      this.shadow = this.host.attachShadow({ mode: 'open' });
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = chrome.runtime.getURL(STYLE_PATH);
      this.shadow.appendChild(stylesheet);

      const root = document.createElement('div');
      root.className = 'idm-root';
      root.dataset.theme = this.globalSettings.theme;
      root.innerHTML = this.getTemplate();
      this.shadow.appendChild(root);

      this.region = root.querySelector('.idm-region');
      this.panel = root.querySelector('.idm-panel');
      this.handle = root.querySelector('.idm-handle');
      this.controls = {
        hideImages: root.querySelector('#idm-hide-images'),
        opacity: root.querySelector('#idm-image-opacity'),
        opacityValue: root.querySelector('#idm-image-opacity-value'),
        blur: root.querySelector('#idm-blur'),
        blurValue: root.querySelector('#idm-blur-value'),
        scale: root.querySelector('#idm-scale'),
        scaleValue: root.querySelector('#idm-scale-value'),
        theme: root.querySelector('#idm-theme-toggle'),
        panelOpacity: root.querySelector('#idm-panel-opacity'),
        panelOpacityValue: root.querySelector('#idm-panel-opacity-value'),
        disable: root.querySelector('#idm-disable-site'),
        collapse: root.querySelector('#idm-collapse')
      };

      (document.documentElement || document.body).appendChild(this.host);
      this.host.style.setProperty('opacity', String(this.globalSettings.panelOpacity / 100), 'important');
      this.applyCollapsedState();
      this.syncControls();
      this.bindEvents();
      if (typeof ResizeObserver === 'function') {
        this.panelResizeObserver = new ResizeObserver(() => {
          if (!this.collapsed && this.region) this.region.style.height = `${this.panel.offsetHeight}px`;
        });
        this.panelResizeObserver.observe(this.panel);
      }
    }

    getTemplate() {
      const t = this.text;
      return `
        <div class="idm-region" data-state="collapsed">
          <button class="idm-handle" type="button" aria-label="${escapeHtml(t.title)}" title="${escapeHtml(t.title)}">
            <span class="idm-handle-mark" aria-hidden="true"></span>
          </button>
          <section class="idm-panel" aria-label="${escapeHtml(t.title)}">
            <header class="idm-header" data-drag-handle="1" title="${escapeHtml(t.drag)}">
              <div class="idm-brand">
                <span class="idm-brand-icon" aria-hidden="true">◉</span>
                <span class="idm-title">${escapeHtml(t.title)}</span>
              </div>
              <button id="idm-collapse" class="idm-icon-button" type="button" aria-label="${escapeHtml(t.collapse)}" title="${escapeHtml(t.collapse)}">−</button>
            </header>

            <div class="idm-controls">
              <div class="idm-switch-row">
                <label for="idm-hide-images">${escapeHtml(t.hideImages)}</label>
                <button id="idm-hide-images" class="idm-switch" type="button" role="switch" aria-checked="false">
                  <span class="idm-switch-knob"></span>
                </button>
              </div>

              <div class="idm-control-row">
                <div class="idm-label-line"><label for="idm-image-opacity">${escapeHtml(t.imageOpacity)}</label><output id="idm-image-opacity-value">100%</output></div>
                <input id="idm-image-opacity" type="range" min="0" max="100" step="1" value="100">
              </div>

              <div class="idm-control-row">
                <div class="idm-label-line"><label for="idm-blur">${escapeHtml(t.blur)}</label><output id="idm-blur-value">0px</output></div>
                <input id="idm-blur" type="range" min="0" max="20" step="1" value="0">
              </div>

              <div class="idm-control-row">
                <div class="idm-label-line"><label for="idm-scale">${escapeHtml(t.scale)}</label><output id="idm-scale-value">100%</output></div>
                <input id="idm-scale" type="range" min="10" max="300" step="1" value="100">
              </div>

              <div class="idm-setting-row">
                <span class="idm-setting-label">${escapeHtml(t.theme)}</span>
                <button id="idm-theme-toggle" class="idm-theme-button" type="button">${escapeHtml(t.light)}</button>
              </div>

              <div class="idm-control-row idm-panel-opacity-row">
                <div class="idm-label-line"><label for="idm-panel-opacity">${escapeHtml(t.panelOpacity)}</label><output id="idm-panel-opacity-value">88%</output></div>
                <input id="idm-panel-opacity" type="range" min="20" max="100" step="1" value="88">
              </div>

              <button id="idm-disable-site" class="idm-disable-button" type="button">${escapeHtml(t.disableSite)}</button>
            </div>
          </section>
        </div>
      `;
    }

    bindEvents() {
      this.region.addEventListener('pointerenter', this.onRegionEnter.bind(this));
      this.region.addEventListener('pointerleave', this.onRegionLeave.bind(this));
      this.handle.addEventListener('click', () => this.expand('handle-click'));
      this.controls.collapse.addEventListener('click', (event) => {
        event.stopPropagation();
        this.collapse('manual');
      });

      this.controls.hideImages.addEventListener('click', () => {
        const next = !this.siteSettings.hidden;
        this.siteSettings.hidden = next;
        this.syncControls();
        if (this.onSitePreview) this.onSitePreview({ hidden: next });
        this.queueSiteSave({ hidden: next });
        this.flushSiteSave();
      });

      this.bindRange(this.controls.opacity, this.controls.opacityValue, 'opacity', '%', false);
      this.bindRange(this.controls.blur, this.controls.blurValue, 'blur', 'px', false);
      this.bindRange(this.controls.scale, this.controls.scaleValue, 'scale', '%', false);
      this.bindRange(this.controls.panelOpacity, this.controls.panelOpacityValue, 'panelOpacity', '%', true);

      this.controls.theme.addEventListener('click', () => {
        const theme = this.globalSettings.theme === 'light' ? 'dark' : 'light';
        this.globalSettings.theme = theme;
        this.applyTheme();
        this.syncControls();
        this.queueGlobalSave({ theme });
        this.flushGlobalSave();
      });

      this.controls.disable.addEventListener('click', () => {
        if (this.onDisable) this.onDisable();
      });

      const dragHandle = this.shadow.querySelector('[data-drag-handle]');
      dragHandle.addEventListener('pointerdown', this.onDragStart.bind(this));
      window.addEventListener('blur', this._onWindowBlur);
    }

    bindRange(input, output, key, suffix, isGlobal) {
      input.addEventListener('input', () => {
        const value = Number(input.value);
        output.value = `${value}${suffix}`;
        output.textContent = `${value}${suffix}`;

        if (isGlobal) {
          this.globalSettings[key] = value;
          this.applyPanelOpacity();
          this.queueGlobalSave({ [key]: value });
        } else {
          this.siteSettings[key] = value;
          if (this.onSitePreview) this.onSitePreview({ [key]: value });
          this.queueSiteSave({ [key]: value });
        }
      });
      input.addEventListener('change', () => {
        if (isGlobal) this.flushGlobalSave();
        else this.flushSiteSave();
      });
    }

    queueSiteSave(patch) {
      this.pendingSiteSave = { ...(this.pendingSiteSave || {}), ...patch };
      if (this.siteSaveTimer) clearTimeout(this.siteSaveTimer);
      this.siteSaveTimer = setTimeout(() => this.flushSiteSave(), 120);
    }

    flushSiteSave() {
      if (this.siteSaveTimer) clearTimeout(this.siteSaveTimer);
      this.siteSaveTimer = null;
      const patch = this.pendingSiteSave;
      this.pendingSiteSave = null;
      if (patch && this.onSiteChange) return this.onSiteChange(patch);
      return Promise.resolve();
    }

    queueGlobalSave(patch) {
      this.pendingGlobalSave = { ...(this.pendingGlobalSave || {}), ...patch };
      if (this.globalSaveTimer) clearTimeout(this.globalSaveTimer);
      this.globalSaveTimer = setTimeout(() => this.flushGlobalSave(), 120);
    }

    flushGlobalSave() {
      if (this.globalSaveTimer) clearTimeout(this.globalSaveTimer);
      this.globalSaveTimer = null;
      const patch = this.pendingGlobalSave;
      this.pendingGlobalSave = null;
      if (patch && this.onGlobalChange) return this.onGlobalChange(patch);
      return Promise.resolve();
    }

    onRegionEnter() {
      this.cancelCloseCheck();
      if (!this.visible || !this.collapsed || this.suppressHoverUntilOutside) return;
      this.expand('hover');
    }

    onRegionLeave(event) {
      if (this.destroyed || !this.visible || this.dragging) return;
      this.pendingPointer = { x: event.clientX, y: event.clientY };
      if (this.collapsed) {
        if (this.suppressHoverUntilOutside) this.suppressHoverUntilOutside = false;
        return;
      }
      this.scheduleCloseCheck();
    }

    scheduleCloseCheck() {
      this.cancelCloseCheck();
      this.startPointerTracking();
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        this.stopPointerTracking();
        if (!this.visible || this.collapsed || this.dragging) return;
        if (this.isPointerInsideRegion()) return;
        this.collapse('auto');
      }, 230);
    }

    cancelCloseCheck() {
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = null;
      this.stopPointerTracking();
    }

    startPointerTracking() {
      if (this.trackingPointer) return;
      this.trackingPointer = true;
      window.addEventListener('pointermove', this._onGlobalPointerMove, true);
    }

    stopPointerTracking() {
      if (!this.trackingPointer) return;
      this.trackingPointer = false;
      window.removeEventListener('pointermove', this._onGlobalPointerMove, true);
    }

    onGlobalPointerMove(event) {
      this.pendingPointer = { x: event.clientX, y: event.clientY };
    }

    isPointerInsideRegion() {
      if (!this.pendingPointer || !this.region) return false;
      const rect = this.region.getBoundingClientRect();
      const { x, y } = this.pendingPointer;
      // One-pixel inset prevents a pointer exactly on the leaving boundary from being treated as inside.
      return x > rect.left + 1 && x < rect.right - 1 && y > rect.top + 1 && y < rect.bottom - 1;
    }

    expand(_reason) {
      if (this.destroyed || !this.visible || !this.collapsed || this.suppressHoverUntilOutside) return;
      this.cancelCloseCheck();
      this.collapsed = false;
      this.region.style.height = `${this.panel.offsetHeight}px`;
      this.region.classList.add('is-expanded');
      this.region.dataset.state = 'expanded';
      this.handle.setAttribute('aria-hidden', 'true');
      this.panel.setAttribute('aria-hidden', 'false');
      this.panel.style.pointerEvents = 'auto';
    }

    collapse(reason = 'auto') {
      if (this.destroyed || this.collapsed) return;
      this.cancelCloseCheck();
      this.collapsed = true;
      this.region.style.height = '74px';
      this.region.classList.remove('is-expanded');
      this.region.dataset.state = 'collapsed';
      this.handle.removeAttribute('aria-hidden');
      this.panel.setAttribute('aria-hidden', 'true');
      this.panel.style.pointerEvents = 'none';

      if (reason === 'manual') {
        this.suppressHoverUntilOutside = true;
      }
      this.resetToRightEdge();
    }

    applyCollapsedState() {
      this.collapsed = true;
      this.region.style.height = '74px';
      this.region.classList.remove('is-expanded');
      this.region.dataset.state = 'collapsed';
      this.panel.style.pointerEvents = 'none';
      this.panel.setAttribute('aria-hidden', 'true');
      this.resetToRightEdge();
    }

    resetToRightEdge() {
      this.host.style.setProperty('left', 'auto', 'important');
      this.host.style.setProperty('right', '0px', 'important');
      this.host.style.setProperty('width', '304px', 'important');
    }

    onDragStart(event) {
      if (event.button !== 0 || this.collapsed || !this.visible) return;
      if (event.composedPath().some((node) => node instanceof Element && node.matches('button,input,output,label'))) return;
      this.dragging = true;
      this.cancelCloseCheck();
      const rect = this.host.getBoundingClientRect();
      this.dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.addEventListener('pointermove', this.onDragMoveBound || (this.onDragMoveBound = this.onDragMove.bind(this)));
      event.currentTarget.addEventListener('pointerup', this.onDragEndBound || (this.onDragEndBound = this.onDragEnd.bind(this)), { once: true });
      event.currentTarget.addEventListener('pointercancel', this.onDragEndBound, { once: true });
      event.preventDefault();
    }

    onDragMove(event) {
      if (!this.dragging || !this.dragState) return;
      const width = this.host.getBoundingClientRect().width;
      const height = this.panel.getBoundingClientRect().height;
      const left = Math.min(Math.max(0, this.dragState.left + event.clientX - this.dragState.startX), Math.max(0, window.innerWidth - width));
      const top = Math.min(Math.max(0, this.dragState.top + event.clientY - this.dragState.startY), Math.max(0, window.innerHeight - height));
      this.host.style.setProperty('right', 'auto', 'important');
      this.host.style.setProperty('left', `${left}px`, 'important');
      this.host.style.setProperty('top', `${top}px`, 'important');
      this.pendingPointer = { x: event.clientX, y: event.clientY };
    }

    onDragEnd(event) {
      if (!this.dragging) return;
      this.dragging = false;
      const header = event.currentTarget;
      if (header && this.onDragMoveBound) header.removeEventListener('pointermove', this.onDragMoveBound);
      if (header && this.onDragEndBound) {
        header.removeEventListener('pointerup', this.onDragEndBound);
        header.removeEventListener('pointercancel', this.onDragEndBound);
      }
      this.pendingPointer = { x: event.clientX, y: event.clientY };
      if (!this.isPointerInsideRegion()) this.scheduleCloseCheck();
    }

    onWindowBlur() {
      if (this.dragging) this.dragging = false;
      if (!this.collapsed) this.collapse('auto');
    }

    applyTheme() {
      const root = this.shadow.querySelector('.idm-root');
      if (root) root.dataset.theme = this.globalSettings.theme;
    }

    applyPanelOpacity() {
      if (this.host) this.host.style.setProperty('opacity', String(this.globalSettings.panelOpacity / 100), 'important');
    }

    syncControls() {
      this.controls.hideImages.setAttribute('aria-checked', String(this.siteSettings.hidden));
      this.controls.hideImages.classList.toggle('is-on', this.siteSettings.hidden);
      this.controls.opacity.value = String(this.siteSettings.opacity);
      this.controls.opacityValue.value = `${this.siteSettings.opacity}%`;
      this.controls.opacityValue.textContent = `${this.siteSettings.opacity}%`;
      this.controls.blur.value = String(this.siteSettings.blur);
      this.controls.blurValue.value = `${this.siteSettings.blur}px`;
      this.controls.blurValue.textContent = `${this.siteSettings.blur}px`;
      this.controls.scale.value = String(this.siteSettings.scale);
      this.controls.scaleValue.value = `${this.siteSettings.scale}%`;
      this.controls.scaleValue.textContent = `${this.siteSettings.scale}%`;
      this.controls.panelOpacity.value = String(this.globalSettings.panelOpacity);
      this.controls.panelOpacityValue.value = `${this.globalSettings.panelOpacity}%`;
      this.controls.panelOpacityValue.textContent = `${this.globalSettings.panelOpacity}%`;
      this.controls.theme.textContent = this.globalSettings.theme === 'light' ? this.text.light : this.text.dark;
      this.controls.theme.setAttribute('aria-pressed', String(this.globalSettings.theme === 'dark'));
      this.applyTheme();
      this.applyPanelOpacity();
    }

    updateSiteSettings(settings) {
      this.siteSettings = { ...settings };
      this.syncControls();
    }

    updateGlobalSettings(settings) {
      this.globalSettings = { ...settings };
      this.syncControls();
    }

    setVisible(visible) {
      if (this.destroyed) return;
      this.visible = Boolean(visible);
      if (!this.visible) {
        this.cancelCloseCheck();
        this.host.style.setProperty('display', 'none', 'important');
        return;
      }
      this.host.style.setProperty('display', 'block', 'important');
      this.collapsed = true;
      this.suppressHoverUntilOutside = false;
      this.applyCollapsedState();
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.cancelCloseCheck();
      if (this.panelResizeObserver) this.panelResizeObserver.disconnect();
      this.flushSiteSave();
      this.flushGlobalSave();
      window.removeEventListener('blur', this._onWindowBlur);
      if (this.host) this.host.remove();
    }
  }

  window.IDMPanel = Panel;
})();
