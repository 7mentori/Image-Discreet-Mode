# Image Discreet Mode — Test Report

**Build:** 1.0.0  
**Test date:** 2026-11-26  
**Browser used for DOM tests:** Chromium 144.0.7559.96 (headless)

## Result summary

| Area | Result | What was verified |
|---|---|---|
| JavaScript syntax | PASS | `node --check` on all five JavaScript files |
| Manifest and package references | PASS | Valid JSON, MV3, service worker, no action popup, required permissions, all referenced scripts/CSS/icons exist |
| Settings module | PASS | Separate hostname keys; global theme and panel opacity persistence using a Chrome Storage mock |
| Service worker routing | PASS (mock) | Normal-site action routes to panel toggle; disabled-site action clears `disabled` and routes to enable/show |
| Panel hover and geometry | PASS (Chromium DOM harness) | Handle enter expands; pointer inside stays open; pointerleave auto-collapses without another mouse movement; expanded interaction region follows panel height |
| Panel drag / right-edge reset | PASS (Chromium DOM harness) | Drag to center, collapse returns to right edge, next hover expansion starts from right edge |
| Theme and panel opacity | PASS (Chromium DOM harness) | Dark theme control contrast and opacity applied to the complete Shadow Host |
| HTML image effects | PASS (Chromium DOM harness) | `img`, `input[type=image]`, dynamic `img`, opacity, blur, scale, hidden state, and unchanged layout dimensions |
| CSS background effects | PASS (Chromium DOM harness) | Overlay rendering, style mutation refresh, opacity/blur/scale, restoration of original inline background and layout dimensions |
| Disable / re-enable flow | PASS (Chromium DOM harness + mocked storage/runtime) | Disable removes the complete host and image engine; pending slider value is saved; enable message restores a visible collapsed right-edge panel and retains the saved site setting |
| Panel action toggle | PASS (Chromium DOM harness) | Toggle message hides and shows the collapsed panel |
| ZIP archive | PASS | `unzip -t` and expected project entries checked after packaging |

## Test method and important boundary

The project JavaScript modules and actual panel stylesheet were exercised in a Chromium 144 DOM harness. Pointer input was dispatched through Chromium's browser automation protocol. The harness supplied mock `chrome.storage` and `chrome.runtime` APIs so the content controller, settings, panel, and image engine could be exercised together.

The Service Worker action-routing code and hostname storage isolation were additionally tested in Node with mocked Chrome APIs. These tests verify the project's routing and state logic, but they do not prove that Chrome's own extension service-worker lifecycle or the real toolbar action behaves identically in a normal installed profile.

**Not verified in this environment:** a complete `chrome://extensions` → **Load unpacked** installation followed by a real click on the browser toolbar icon. The available headless Chrome environment did not expose a usable extension service-worker target for that end-to-end test, and its local test-page navigation was blocked by the environment. Therefore this release is **not labelled ALL PASS** for real Chrome integration.

## Manual acceptance still recommended

1. Load the extracted project folder in a normal Chrome desktop profile.
2. Test toolbar action toggle on an enabled site.
3. Disable the site, reload it, close/reopen its tab, then click the real toolbar icon to re-enable.
4. Repeat on two hostnames and confirm their settings remain independent.
5. Test on target sites with strict Content Security Policy, complex CSS backgrounds, and heavy SPA updates.

## Known functional limits

The extension does not process Canvas, WebGL/WebGPU, video frames, pseudo-element backgrounds, cross-origin iframe DOM, or nodes inside shadow roots. CSS background handling is best-effort and may affect containing blocks or structural selectors as documented in `README.md`.


## Reset Default feature update

- Added a bilingual `Reset Default` button below the image controls.
- Restores current-host image settings to `hidden: false`, `opacity: 100`, `blur: 0`, and `scale: 100`.
- Updates the controls and image preview immediately, then saves the reset values through the existing per-host settings queue.
- Clears any pending debounced slider patch before saving, preventing stale slider values from overwriting the reset.
- Leaves global theme, panel opacity, and the site's disabled flag unchanged.
- JavaScript syntax and packaged file checks are rerun for this update; real Chrome toolbar testing remains a manual verification item.
