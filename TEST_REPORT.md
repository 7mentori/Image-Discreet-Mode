# Image Discreet Mode v1.2.0 — 測試報告

## 測試結論

**靜態檢查通過**

**目前不能標示 ALL PASS。** 專案已完成程式與封裝的靜態檢查，以及設定模組測試；但目前可用的 Chromium 環境受到管理政策限制，無法在一般網頁載入擴充功能，因此尚未完成真實 Chrome 的互動驗收。

這個 Chromium 環境的管理政策包含：

- `URLBlocklist: ["*"]`
- `ExtensionInstallBlocklist: ["*"]`

測試時瀏覽器導覽回傳 `ERR_BLOCKED_BY_ADMINISTRATOR`，擴充功能也無法安裝至測試 Profile。因此沒有把需要真實渲染或滑鼠事件的項目誤標為通過。

## 已完成檢查

| 檢查項目 | 結果 | 說明 |
|---|---|---|
| Manifest JSON | PASS | `manifest.json` 可正常解析 |
| Manifest 版本 | PASS | Manifest V3，擴充功能版本 `1.2.0` |
| Chrome Action | PASS | 沒有設定 `default_popup`，由 `chrome.action.onClicked` 接收工具列點擊 |
| JavaScript 語法 | PASS | `background.js` 及 8 個 Content Script 均通過 `node --check` |
| Manifest 檔案參照 | PASS | Content Script、CSS、Service Worker、icons 等資源皆存在 |
| Icon 檔案 | PASS | 16、32、48、128 px PNG 圖示尺寸正確 |
| 設定模組測試 | PASS | 使用模擬 Chrome Storage API 測試預設值、hostname 隔離、數值驗證、全域設定及 Reset 範圍 |
| ZIP 完整性 | PASS | 最終 ZIP 通過 `unzip -t`，無壓縮資料錯誤 |

## 尚未完成的 Chrome 互動驗收

以下項目需要正常運作的 Chrome Extension Runtime 及一般網頁。本次環境政策阻止擴充功能載入，因此均標記為**未驗證**，不是 PASS：

- Panel 首次載入、Hover 展開、離開 300ms 自動收合及滑鼠停留狀態。
- Panel 拖曳、Pointer Capture，以及收合後回到最右側。
- Panel 主題及整體透明度的實際視覺效果。
- 此網站禁用、重新整理後持續禁用，以及工具列圖示重新啟用。
- HTML `img`、`input[type=image]` 的實際顯示、原始樣式還原、動態來源變更及 Layout Box 尺寸。
- CSS 背景 pseudo-element 圖層、文字保留、多背景圖層及不支援情境的跳過行為。
- 單張圖片左鍵按住／放開、右鍵固定／取消、pointer cancel、lost pointer capture 及視窗失焦。
- 灰階實際渲染，以及排除 Panel 和單張圖片操作 UI。
- Reset Default 的實際網頁還原效果。
- Chrome 中不同網站設定隔離及瀏覽器語系切換。

## 已知限制

完整說明請參考 `README.md`。重要限制如下：

- `html`、`body` 畫布背景會跳過 CSS 背景處理。
- CSS 背景若已使用 `::before`、display 類型不適合、使用 fixed/local attachment、`background-clip:text`，或 static 元素包含可能受 containing block 影響的絕對定位子元素，會跳過。
- 同一元素中的多個 CSS 背景圖層會視為一組控制。
- 部分只透過 CSSOM 操作或動畫產生的背景圖片變化可能不會立即被偵測。
- 不處理跨來源 iframe 及 Closed Shadow DOM 內部。
- Canvas、WebGL、WebGPU、瀏覽器 Top Layer 及部分 GPU/compositor surface 不保證能完整套用所有效果。
- 單張圖片暫時顯示與固定顯示狀態只在目前頁面工作階段有效。

## 驗收聲明

此交付物包含完整的 Image Discreet Mode v1.2.0 專案原始碼、Manifest V3 設定、README、測試報告、圖示及設定模組測試。已完成的靜態檢查及設定模組測試均通過，但**尚未取得本次需求 A～J 項目的真實 Chrome 互動驗收結果**。請在未受企業政策限制的 Chrome Profile 載入後，依需求清單執行實機驗收，再將其視為正式通過版本。


## 本次互動修訂檢查

- Panel CSS 載入前 Host 設為 `visibility:hidden`，並在 stylesheet `load` / `error` 後解除，避免無樣式首繪造成展開面板閃現。
- 新頁面初始化流程仍以 `collapsed=true` 並移除 `expanded` 屬性開始。
- 收合把手文字改為空字串。
- 自動收合延遲由 1000ms 改為 300ms。
- 四個 Slider 共用滑鼠滾輪處理，並透過原生 `input` 事件觸發既有即時更新邏輯。
- 本次仍需使用者在一般 Chrome Profile 進行視覺及實際滾輪操作驗收；靜態檢查不等於實機驗收。


## Slider 刻度與滾輪效能修正檢查

- 圖片透明度：0–100%，step 10，共 11 個位置。
- 圖片模糊：Slider 顯示 0–100%，step 10；轉換為 0–20px 儲存，每格 2px。
- 圖片縮放：10–200%，step 19，共 11 個等距位置。
- Panel 透明度：20–100%，step 8，共 11 個等距位置。
- 四個 Slider 的滑鼠滾輪採 50ms debounce：滾動期間更新 Slider 數值與顯示文字，停止滾動 50ms 後才派發一次 `input` 事件，沿用原本設定儲存及效果套用流程。
- 本次 JavaScript 語法與既有設定模組測試需重新執行；Chrome 真實滾輪連續操作仍待一般 Chrome Profile 驗收，未標示為 ALL PASS。
