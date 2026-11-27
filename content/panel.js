(() => {
  const IDM = window.__IMAGE_DISCREET_MODE__;
  if (!IDM || IDM.Panel) return;

  let host = null;
  let shadow = null;
  let panel = null;
  let handle = null;
  let header = null;
  let collapseButton = null;
  let hideCheckbox = null;
  let opacityRange = null;
  let blurRange = null;
  let scaleRange = null;
  let grayscaleCheckbox = null;
  let themeButton = null;
  let panelOpacityRange = null;
  let disableButton = null;
  let resetButton = null;
  let collapseTimer = null;
  let panelVisible = true;
  let collapsed = true;
  let pointerInside = false;
  let dragging = false;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let topPosition = 90;
  let siteSettings = { ...IDM.Settings.SITE_DEFAULTS };
  let globalSettings = { ...IDM.Settings.GLOBAL_DEFAULTS };
  let callbacks = {};
  let created = false;

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function createSwitch(labelText, id) {
    const row = createElement('div', 'idm-toggle-row');
    const label = createElement('label', 'idm-label', labelText);
    label.htmlFor = id;
    const wrapper = createElement('label', 'idm-switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    const track = createElement('span', 'idm-switch-track');
    wrapper.append(input, track);
    row.append(label, wrapper);
    return { row, input };
  }

  function createRange(labelText, id, min, max, step, value, suffix, options = {}) {
    const block = createElement('div', 'idm-range-block');
    const heading = createElement('div', 'idm-range-heading');
    const label = createElement('label', 'idm-label', labelText);
    label.htmlFor = id;
    const output = createElement('span', 'idm-value', '');
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'idm-range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(options.fromStored ? options.fromStored(value) : value);
    const fromStored = options.fromStored || ((stored) => stored);
    const toStored = options.toStored || ((sliderValue) => sliderValue);
    const format = options.format || ((sliderValue) => `${sliderValue}${suffix}`);
    let wheelTimer = null;
    input.addEventListener('input', updateOutput);

    function updateOutput() {
      output.textContent = format(Number(input.value));
    }
    updateOutput();
    heading.append(label, output);
    block.append(heading, input);

    // Wheel changes are accumulated immediately in the control, but the expensive
    // settings/effect update is committed only after 50 ms without another wheel event.
    block.addEventListener('wheel', (event) => {
      if (input.disabled) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const stepSize = Number(input.step) || 1;
      const minValue = Number(input.min);
      const maxValue = Number(input.max);
      const currentIndex = Math.round((Number(input.value) - minValue) / stepSize);
      const maxIndex = Math.round((maxValue - minValue) / stepSize);
      const nextIndex = Math.max(0, Math.min(maxIndex, currentIndex + direction));
      const next = Math.min(maxValue, minValue + nextIndex * stepSize);
      if (next === Number(input.value)) return;

      input.value = String(next);
      updateOutput();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = null;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, 50);
    }, { passive: false });

    return { block, input, output, suffix, fromStored, toStored, format };
  }

  function setRangeValue(control, storedValue) {
    const sliderValue = control.fromStored(storedValue);
    control.input.value = String(sliderValue);
    control.output.textContent = control.format(Number(control.input.value));
  }

  function applyTheme() {
    if (!panel || !handle) return;
    panel.classList.toggle('light', globalSettings.theme === 'light');
    panel.classList.toggle('dark', globalSettings.theme === 'dark');
    handle.classList.toggle('dark', globalSettings.theme === 'dark');
    themeButton.textContent = globalSettings.theme === 'light'
      ? IDM.I18n.t('darkTheme')
      : IDM.I18n.t('lightTheme');
    themeButton.title = IDM.I18n.t('theme');
    host.style.setProperty('opacity', String(globalSettings.panelOpacity / 100), 'important');
  }

  function updateControls() {
    if (!created) return;
    hideCheckbox.checked = siteSettings.hideImages;
    setRangeValue(opacityRange, siteSettings.imageOpacity);
    setRangeValue(blurRange, siteSettings.imageBlur);
    setRangeValue(scaleRange, siteSettings.imageScale);
    grayscaleCheckbox.checked = siteSettings.grayscale;
    setRangeValue(panelOpacityRange, globalSettings.panelOpacity);
    applyTheme();
  }

  function clearCollapseTimer() {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  function expand() {
    if (!panelVisible || !created) return;
    clearCollapseTimer();
    collapsed = false;
    pointerInside = true;
    host.setAttribute('expanded', '');
  }

  function collapse() {
    if (!panelVisible || !created || dragging) return;
    clearCollapseTimer();
    collapsed = true;
    pointerInside = false;
    host.removeAttribute('expanded');
    // A collapsed panel always returns to the right edge; keep only its vertical coordinate.
    host.style.setProperty('left', 'auto', 'important');
    host.style.setProperty('right', '0px', 'important');
    host.style.setProperty('top', `${Math.max(0, Math.min(window.innerHeight - 74, topPosition))}px`, 'important');
  }

  function scheduleCollapse() {
    clearCollapseTimer();
    if (collapsed || dragging || !panelVisible) return;
    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      const actuallyHovered = Boolean(panel?.matches(':hover') || handle?.matches(':hover'));
      if (!pointerInside && !actuallyHovered && !dragging) collapse();
      else if (actuallyHovered) pointerInside = true;
    }, 300);
  }

  function onPanelEnter() {
    if (!panelVisible || collapsed) return;
    pointerInside = true;
    clearCollapseTimer();
  }

  function onPanelLeave() {
    pointerInside = false;
    scheduleCollapse();
  }

  function onHandleEnter() {
    if (!panelVisible) return;
    if (collapsed) expand();
    else {
      pointerInside = true;
      clearCollapseTimer();
    }
  }

  function onHandleLeave() {
    if (collapsed || !panelVisible) return;
    pointerInside = false;
    scheduleCollapse();
  }

  function onDragStart(event) {
    if (event.button !== 0 || event.target.closest?.('button')) return;
    if (collapsed || !panelVisible) return;
    dragging = true;
    dragPointerId = event.pointerId;
    clearCollapseTimer();
    pointerInside = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    const rect = host.getBoundingClientRect();
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
    try { header.setPointerCapture(event.pointerId); } catch { /* pointer capture may fail during navigation */ }
    event.preventDefault();
  }

  function onDragMove(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    const rect = panel.getBoundingClientRect();
    const width = rect.width || 300;
    const height = rect.height || 420;
    const left = Math.max(0, Math.min(window.innerWidth - width, dragStartLeft + dx));
    const top = Math.max(0, Math.min(window.innerHeight - Math.min(height, window.innerHeight), dragStartTop + dy));
    host.style.setProperty('left', `${left}px`, 'important');
    host.style.setProperty('right', 'auto', 'important');
    host.style.setProperty('top', `${top}px`, 'important');
    topPosition = top;
  }

  function onDragEnd(event) {
    if (!dragging) return;
    if (event?.pointerId != null && dragPointerId != null && event.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = null;
    const rect = panel.getBoundingClientRect();
    const x = event?.clientX ?? -1;
    const y = event?.clientY ?? -1;
    pointerInside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (!pointerInside) scheduleCollapse();
  }

  function show() {
    if (!created) create();
    panelVisible = true;
    host.style.setProperty('display', 'block', 'important');
    collapse();
  }

  function hide() {
    clearCollapseTimer();
    panelVisible = false;
    pointerInside = false;
    host.style.setProperty('display', 'none', 'important');
  }

  function toggleVisibility() {
    if (!panelVisible) show();
    else hide();
  }

  function create() {
    if (created && host?.isConnected) return;
    created = true;
    host = document.createElement('div');
    host.id = 'idm-panel-host';
    for (const [property, value] of Object.entries({
      all: 'initial', position: 'fixed', top: '90px', right: '0px', left: 'auto',
      width: '300px', height: '0px', 'z-index': '2147483647', 'pointer-events': 'none',
      display: 'block', visibility: 'hidden', opacity: String(globalSettings.panelOpacity / 100)
    })) host.style.setProperty(property, value, 'important');
    shadow = host.attachShadow({ mode: 'closed' });

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('content/panel.css');
    const revealHostAfterStylesheet = () => {
      if (host?.isConnected) host.style.setProperty('visibility', 'visible', 'important');
    };
    stylesheet.addEventListener('load', revealHostAfterStylesheet, { once: true });
    stylesheet.addEventListener('error', revealHostAfterStylesheet, { once: true });
    shadow.appendChild(stylesheet);

    panel = createElement('section', 'idm-panel light');
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', IDM.I18n.t('title'));

    header = createElement('div', 'idm-header');
    const title = createElement('h2', 'idm-title', IDM.I18n.t('title'));
    const headerActions = createElement('div', 'idm-header-actions');
    collapseButton = createElement('button', 'idm-icon-button', '›');
    collapseButton.type = 'button';
    collapseButton.title = IDM.I18n.t('collapse');
    collapseButton.setAttribute('aria-label', IDM.I18n.t('collapse'));
    collapseButton.addEventListener('click', collapse);
    headerActions.append(collapseButton);
    header.append(title, headerActions);

    const controls = createElement('div', 'idm-controls');
    const hideControl = createSwitch(IDM.I18n.t('hideImages'), 'idm-hide-images');
    hideCheckbox = hideControl.input;
    const opacityControl = createRange(IDM.I18n.t('imageOpacity'), 'idm-image-opacity', 0, 100, 10, siteSettings.imageOpacity, '%');
    opacityRange = opacityControl;
    const blurControl = createRange(IDM.I18n.t('imageBlur'), 'idm-image-blur', 0, 100, 10, siteSettings.imageBlur, '%', {
      fromStored: (px) => Math.round((px / 20) * 100),
      toStored: (percent) => Math.round((percent / 100) * 20),
      format: (percent) => `${percent}%`
    });
    blurRange = blurControl;
    const scaleControl = createRange(IDM.I18n.t('imageScale'), 'idm-image-scale', 10, 200, 19, siteSettings.imageScale, '%');
    scaleRange = scaleControl;

    resetButton = createElement('button', 'idm-button', IDM.I18n.t('resetDefault'));
    resetButton.type = 'button';
    resetButton.addEventListener('click', () => callbacks.onReset?.());

    const grayscaleControl = createSwitch(IDM.I18n.t('grayscale'), 'idm-grayscale');
    grayscaleCheckbox = grayscaleControl.input;

    themeButton = createElement('button', 'idm-button idm-theme-button');
    themeButton.type = 'button';
    themeButton.addEventListener('click', () => {
      callbacks.onGlobalPatch?.({ theme: globalSettings.theme === 'light' ? 'dark' : 'light' });
    });

    const panelOpacityControl = createRange(IDM.I18n.t('panelOpacity'), 'idm-panel-opacity', 20, 100, 8, globalSettings.panelOpacity, '%');
    panelOpacityRange = panelOpacityControl;

    disableButton = createElement('button', 'idm-button danger', IDM.I18n.t('disableSite'));
    disableButton.type = 'button';
    disableButton.addEventListener('click', () => callbacks.onDisableSite?.());

    controls.append(
      hideControl.row,
      opacityControl.block,
      blurControl.block,
      scaleControl.block,
      resetButton,
      createElement('div', 'idm-separator'),
      grayscaleControl.row,
      themeButton,
      panelOpacityControl.block,
      disableButton
    );

    panel.append(header, controls);
    handle = createElement('button', 'idm-handle', '');
    handle.type = 'button';
    handle.title = IDM.I18n.t('title');
    handle.setAttribute('aria-label', IDM.I18n.t('title'));
    handle.addEventListener('pointerenter', onHandleEnter);
    handle.addEventListener('pointerleave', onHandleLeave);
    handle.addEventListener('focus', onHandleEnter);
    handle.addEventListener('click', expand);

    panel.addEventListener('pointerenter', onPanelEnter);
    panel.addEventListener('pointerleave', onPanelLeave);
    header.addEventListener('pointerdown', onDragStart);
    header.addEventListener('pointermove', onDragMove);
    header.addEventListener('pointerup', onDragEnd);
    header.addEventListener('pointercancel', onDragEnd);
    header.addEventListener('lostpointercapture', onDragEnd);
    window.addEventListener('blur', onDragEnd, true);

    hideCheckbox.addEventListener('change', () => callbacks.onSitePatch?.({ hideImages: hideCheckbox.checked }));
    opacityRange.input.addEventListener('input', () => {
      setRangeValue(opacityRange, Number(opacityRange.input.value));
      callbacks.onSitePatch?.({ imageOpacity: Number(opacityRange.input.value) });
    });
    blurRange.input.addEventListener('input', () => {
      callbacks.onSitePatch?.({ imageBlur: blurRange.toStored(Number(blurRange.input.value)) });
    });
    scaleRange.input.addEventListener('input', () => {
      setRangeValue(scaleRange, Number(scaleRange.input.value));
      callbacks.onSitePatch?.({ imageScale: Number(scaleRange.input.value) });
    });
    grayscaleCheckbox.addEventListener('change', () => callbacks.onSitePatch?.({ grayscale: grayscaleCheckbox.checked }));
    panelOpacityRange.input.addEventListener('input', () => {
      setRangeValue(panelOpacityRange, Number(panelOpacityRange.input.value));
      callbacks.onGlobalPatch?.({ panelOpacity: Number(panelOpacityRange.input.value) });
    });

    shadow.append(panel, handle);
    document.documentElement.appendChild(host);
    updateControls();
    show();
  }

  function initialize(site, global, handlers = {}) {
    siteSettings = IDM.Settings.validateSite(site);
    globalSettings = IDM.Settings.validateGlobal(global);
    callbacks = handlers;
    create();
    updateControls();
    show();
  }

  function updateSettings(site, global) {
    if (site) siteSettings = IDM.Settings.validateSite(site);
    if (global) globalSettings = IDM.Settings.validateGlobal(global);
    updateControls();
  }

  function destroy() {
    clearCollapseTimer();
    window.removeEventListener('blur', onDragEnd, true);
    host?.remove();
    host = null;
    shadow = null;
    panel = null;
    handle = null;
    header = null;
    created = false;
    panelVisible = false;
    collapsed = true;
    pointerInside = false;
    dragging = false;
  }

  IDM.Panel = {
    initialize,
    updateSettings,
    show,
    hide,
    toggleVisibility,
    collapse,
    destroy,
    isVisible: () => panelVisible,
    isCollapsed: () => collapsed
  };
})();
