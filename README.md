# Image Discreet Mode

A Manifest V3 Chrome extension for temporarily hiding, fading, blurring, or visually scaling images on the current website while preserving normal layout dimensions.

## Features

- **New in 1.1.0:** Per-site grayscale mode to desaturate colorful webpage content while keeping the extension panel in color.

- Per-hostname image settings: hide, opacity (0–100%), blur (0–20px), visual scale (10–300%), and webpage grayscale mode.
- Supports HTML `img`, `input[type="image"]`, and many ordinary CSS `background-image` use cases.
- Detects dynamically inserted elements and common `src`, `srcset`, `class`, and inline-style changes.
- Floating Shadow DOM panel with drag support, hover expansion/collapse, light/dark themes, and whole-panel opacity.
- Website-level disable switch. Disabling removes the full panel and restores image appearance while preserving saved settings.
- Clicking the extension action icon on a disabled site re-enables it and shows a collapsed panel at the right edge.
- Chinese browser locales use Traditional Chinese UI; other locales use English UI.
- No backend and no third-party runtime dependencies.

## Installation (load unpacked)

1. Download and extract `Image-Discreet-Mode-1.1.0.zip`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extracted `Image-Discreet-Mode` folder (the folder containing `manifest.json`).
6. Open a normal `http://` or `https://` website. The panel appears as a narrow handle on the right edge.

The extension intentionally does not define `action.default_popup`, so the toolbar icon is handled by the MV3 service worker's `chrome.action.onClicked` listener.

## Usage

- Move the pointer over the 12px handle at the upper-right edge to expand the panel.
- Move the pointer outside the expanded panel to collapse it automatically.
- Drag the panel header to move the expanded panel. Collapsing always returns it to the right edge; the next expansion starts from that edge.
- Use **Hide images**, **Image opacity**, **Blur**, and **Scale** to adjust the current hostname. **Grayscale webpage** converts the page content to monochrome while keeping the extension panel in color.
- Theme and panel opacity are global settings. Panel opacity applies to the host itself, so the background and all child controls become transparent together.
- **Disable on this site** immediately removes the panel and restores image effects. Click the extension toolbar icon to re-enable the current site.
- Clicking the toolbar icon on a normal site toggles panel visibility. Hiding the panel does not disable image processing.

## Storage model

Chrome `storage.local` is used.

| Key | Scope | Stored data |
|---|---|---|
| `siteSettings:<hostname>` | Per hostname | `hidden`, `opacity`, `blur`, `scale`, `monochrome`, `disabled` |
| `globalSettings` | Global | `theme`, `panelOpacity` |

The hostname key deliberately excludes URL paths, query strings, and ports. Different hostnames remain independent. Disabling a site does not delete its image settings.

## Implementation notes

### Panel hover behavior

The collapsed handle and expanded panel belong to one shared pointer interaction region inside Shadow DOM. The region uses native `pointerenter` and `pointerleave` events. When a leave event occurs, the extension briefly defers the decision and checks the pointer against the region's post-transition rectangle. A temporary document-level `pointermove` listener only supplements this transition-boundary check; it is not the primary hover mechanism. The listener is removed after reconciliation. The panel's visibility, collapsed state, drag state, and hover reconciliation are tracked independently.

### Image layout preservation

For `img` and `input[type=image]`, the extension uses CSS `visibility`, `opacity`, `filter`, and `transform`. These are visual effects and do not set the element's width or height to zero. The transform does not change the original layout box.

For many ordinary CSS backgrounds, the extension adds an absolutely positioned child layer, copies the element's computed background image and related background properties, and hides only the element's original `background-image`. The added layer is absolutely positioned and does not participate in normal flow. The source element's normal width and height are not changed.

The implementation uses unique data attributes and reserved `--idm-*` inline custom properties for image nodes. The previous values and priorities of those custom properties are saved and restored when effects are cleared. It does not overwrite the website's original `src`, `srcset`, width, height, or ordinary inline `style` properties.

## Known limitations

This extension does not claim universal support for every rendering technology. The following cases may not be processed correctly:

- **Canvas, WebGL, WebGPU, SVG filters, and video frames:** these are not ordinary `img` elements or CSS background layers. A canvas may contain both text and images, so modifying the entire canvas would also alter non-image content.
- **Cross-origin iframes:** the content script runs in the top frame only. It cannot inspect or modify the DOM of a cross-origin embedded frame.
- **Closed Shadow DOM:** nodes inside a closed shadow root are not discoverable from the page document. Open shadow roots are not currently traversed by the image scanner.
- **Pseudo-element backgrounds (`::before` / `::after`):** these are not separate DOM elements and are not currently extracted into overlay layers.
- **Complex CSS background composition:** blend modes, fixed attachment, clipping, masks, layered gradients, animated backgrounds, and interactions with existing pseudo-elements or unusual stacking contexts may render differently in the overlay. Background support is best-effort. The overlay adds an absolutely positioned child; selectors such as `:empty`, `:first-child`, and `:last-child` can therefore be affected on the source element. When the source element is statically positioned, the extension temporarily sets `position: relative` to anchor the overlay; this can change the containing block used by absolutely positioned descendants.
- **Backgrounds on `html` and `body`:** these are skipped to avoid changing the document's root painting and viewport behavior.
- **Inline `background-image: ... !important` and unusual author-important rules:** CSS cascade rules may prevent the extension from hiding the original background layer. A restrictive site Content Security Policy may also block the external Shadow DOM stylesheet, leaving the panel unstyled on that site.
- **CSS images shown only by pseudo-class states or stylesheet changes with no observed DOM mutation:** responsive changes are refreshed on resize and load, but every page-specific state transition cannot be detected reliably.
- **Sites that continuously rewrite inline image styles or use conflicting `--idm-*` custom properties:** may compete with the extension's temporary inline custom properties.
- **Images inside browser-internal pages, the Chrome Web Store, and other restricted URLs:** Chrome does not permit normal extensions to inject content scripts into all browser-controlled pages.

For static images, the CSS transform preserves the layout box, but it can visually overlap neighboring content when scaled above 100%. This is intentional and matches the requested visual-only zoom behavior.

## Project structure

```text
Image-Discreet-Mode/
├── manifest.json
├── background.js
├── content/
│   ├── settings.js
│   ├── image-engine.js
│   ├── panel.js
│   └── content.js
├── panel/
│   └── panel.css
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
└── TEST_REPORT.md
```

## Development checks

The release archive is checked for:

- Valid JSON in `manifest.json`.
- JavaScript parse validity for all `.js` files.
- Required MV3 manifest fields and absence of an action popup.
- Presence of all referenced runtime files and icons.
- ZIP archive integrity and expected project structure.

See [`TEST_REPORT.md`](TEST_REPORT.md) for the static checks, Chromium DOM harness results, mocked Chrome API checks, and the remaining real-extension verification gap. The harness exercises the actual project modules in Chromium, but it is not a substitute for installing the unpacked extension in a normal Chrome profile and clicking the real toolbar action.


### Reset Default

The Reset Default button restores only the current website image settings: images visible, opacity 100%, blur 0px, and scale 100%. It does not change grayscale mode, the global panel theme, panel opacity, or the website disabled state.

### Grayscale webpage

The per-site Grayscale webpage switch applies `filter: grayscale(1)` to the document body. This removes color saturation from text, backgrounds, borders, icons, and other rendered page content while preserving luminance differences as shades of gray. The extension panel is mounted as a sibling of `<body>` under `<html>`, so it remains in its normal theme colors. The original inline `body` filter value and priority are saved and restored when the feature is turned off. Because CSS filters create a containing block and stacking context, some websites with fixed-position or sticky UI may display those elements differently while grayscale mode is enabled.
