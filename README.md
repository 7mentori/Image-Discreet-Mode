# Image Discreet Mode v1.2.0

Image Discreet Mode 是一套使用 Chrome Extension Manifest V3 開發的網頁視覺管理工具。可針對支援的圖片進行隱藏、透明度調整、模糊及視覺縮放，也能將網頁內容轉為灰階，並提供單張圖片暫時顯示與固定顯示功能。

## 功能總覽

- 隱藏 HTML 圖片時保留原本版面空間，不使用 `display: none`。
- 調整 HTML 圖片透明度（0～100%）、模糊（0～20px）及視覺縮放（10～200%）。
- 對符合條件的 CSS `background-image` 使用獨立背景 pseudo-element 圖層，避免把同一元素上的文字及按鈕一起淡化或模糊。
- 監測一般 DOM 動態更新、AJAX 新增內容及無限捲動新增的圖片。
- 將滑鼠移到受圖片效果影響的目標上，可顯示單張圖片操作按鈕：
  - 按住滑鼠左鍵：暫時顯示該張圖片，放開後恢復全站效果。
  - 在操作按鈕上按滑鼠右鍵：固定顯示或取消固定顯示該張圖片。
- 對網頁視覺內容套用灰階效果。
- 浮動式 Panel，支援滑鼠移入自動展開、離開 300ms 後自動收合及拖曳。
- 支援淺色／深色主題及 Panel 整體透明度。
- Reset Default 只重設目前網站的圖片設定，不影響灰階及 Panel 外觀設定。
- 可單獨禁用目前網站，並透過 Chrome 工具列圖示重新啟用。
- 圖片及灰階設定以 hostname 分開保存；Panel 主題及透明度為全域設定。
- 依瀏覽器語言自動使用繁體中文或英文介面。

## 安裝方式

1. 下載並解壓縮專案 ZIP。
2. 在 Chrome 網址列開啟 `chrome://extensions`。
3. 開啟右上角的「開發人員模式」。
4. 點選「載入未封裝項目」。
5. 選擇解壓縮後的 `Image-Discreet-Mode-v1.2.0` 資料夾，也就是包含 `manifest.json` 的那一層。
6. 開啟或重新整理一般 `http://` 或 `https://` 網頁。

本擴充功能沒有設定 popup。點擊工具列圖示會由 Manifest V3 Service Worker 接收並處理。

## 基本操作

### Panel

第一次造訪且未禁用的網站，Panel 會以收合狀態顯示在畫面右上方。滑鼠移入右側窄把手即可展開；滑鼠離開 Panel 互動區域 300ms 後會自動收合。展開狀態可以拖曳。收合時 Panel 會回到畫面最右側，並保留目前高度。

點擊 Chrome 工具列上的擴充功能圖示，可以切換 Panel 顯示／隱藏。隱藏 Panel 不會停止網頁圖片或灰階效果。

### 圖片設定

- **隱藏圖片**：讓支援的圖片視覺透明，但保留原始 Layout Box 及一般滑鼠命中能力。
- **圖片透明度**：依設定比例調整圖片原本的透明度。
- **圖片模糊**：在圖片原本的 CSS filter 後加入 blur。
- **圖片縮放**：透過 transform 調整視覺大小，不改變原本 Layout Box。
- **Reset Default**：只重設目前網站的隱藏圖片、圖片透明度、圖片模糊、圖片縮放及目前頁面的單張圖片例外狀態。此操作不會重設網頁灰階、Panel 主題、Panel 透明度或網站禁用狀態。

### 單張圖片操作

當「隱藏圖片」開啟，或圖片透明度低於 100%，或圖片模糊大於 0px 時，將滑鼠移到受影響的圖片上，附近會出現圓形操作按鈕。

- **按住滑鼠左鍵**：暫時顯示該張圖片；放開後恢復原本全站效果。
- **在操作按鈕上按滑鼠右鍵**：固定顯示該張圖片；再次右鍵可取消固定。
- **在網頁其他位置按滑鼠右鍵**：不會被此功能攔截，仍保留網站原本的右鍵操作。

單張圖片的暫時顯示與固定顯示狀態只保存在目前頁面的記憶體中。重新整理或導覽後不會保留，避免以不穩定的 DOM 識別方式錯誤套用到其他圖片。

### 網頁灰階

開啟「網頁灰階」後，擴充功能會在網頁內容上方建立透明覆蓋層，使用 `backdrop-filter: grayscale(1)` 將其後方的網頁視覺轉為灰階。Panel 與單張圖片操作 UI 位於灰階層上方，不會一起變成灰階。

### 此網站禁用

按下「此網站禁用」後，Panel 及單張圖片操作 UI 會完全移除，並停止該網站的圖片及灰階效果，還原可支援元素的原始樣式。該網站原本保存的設定不會被刪除。

禁用後點擊 Chrome 工具列圖示即可重新啟用。重新啟用時會載入原有設定，Panel 以畫面最右側的收合狀態出現。

## 設定保存方式

設定使用 `chrome.storage.local` 保存：

- `idm:site:<hostname>`：隱藏圖片、圖片透明度、圖片模糊、圖片縮放、網頁灰階及此網站禁用狀態。
- `idm:global`：Panel 淺色／深色主題及 Panel 整體透明度。

Hostname 使用瀏覽器實際 hostname。因此 `www.example.com` 和 `example.com` 會被視為兩個不同網站，各自保存設定。

## 技術實作及支援範圍

### HTML 圖片

圖片效果管理模組會先讀取圖片原本的計算樣式及 inline declaration。套用效果時只暫時管理需要變更的 `opacity`、`filter`、`transform` 屬性，並記錄原本 inline value 及 priority（包含 `!important`）。停用效果或網站禁用時會還原保存的宣告。

隱藏使用透明度，不會將元素從排版中移除。一般情況下，透明圖片仍保留 Layout Box 及滑鼠命中能力，因此能觸發單張圖片 Hover 操作。

### CSS 背景圖片

不會直接對有文字或按鈕的整個元素套用 `opacity` 或 `filter`。符合安全條件的元素會將計算後的背景圖片及相關背景屬性複製到擴充功能建立的 `::before` 圖層。原元素的背景圖片會暫時停止繪製，而隱藏、透明度、模糊及縮放只套用在獨立背景圖層；文字及子控制項不會一起受圖片效果影響。

同一元素的多個 CSS 背景圖層會視為一組處理，不能各自單獨顯示或隱藏。

背景圖片採取保守處理。以下情況會跳過，不強行修改：

- `html`、`body` 的畫布背景，因為瀏覽器可能會把背景繪製到 document canvas。
- 元素原本已使用 `::before`。
- 不適合建立獨立圖層的 display 類型。
- 使用 `background-attachment: fixed/local` 或 `background-clip: text`。
- 元素為 `position: static`，且包含可能受 containing block 變化影響的絕對定位子元素。

對符合條件的 static 元素，會建立相對定位及隔離的 stacking context 以承載背景圖層。這不會改變元素尺寸，但可能影響特殊網頁的堆疊順序，遇到複雜版面時應檢查顯示結果。

一般的 `style`、`class` 屬性變化會被監測；樣式表載入、動態加入 style/link、視窗尺寸變更及常見 DOM 變化也會觸發重新掃描。不會攔截所有 CSSOM `insertRule` 或動畫造成的純樣式變化，因此部分僅透過 CSSOM 或動畫改變的背景圖片可能無法立即更新。

### 灰階

灰階使用透明 `backdrop-filter` 覆蓋層，不會把 filter 寫入網頁所有節點，也不會改變版面尺寸。瀏覽器 Top Layer（例如部分 modal dialog 或 popover）、某些特殊合成層及部分嵌入內容可能位於覆蓋層上方，無法保證全部轉為灰階。

## 已知限制

- Canvas、WebGL、WebGPU 及其他自行繪製像素的內容不會被當成一般圖片逐張管理；灰階覆蓋層是否能影響這些內容，依瀏覽器合成方式而定。
- 本版本不會注入跨來源 iframe，也不會處理 iframe 內部文件。
- 不會檢查 Closed Shadow DOM 內部；目前也沒有完整遞迴掃描所有 Open Shadow DOM。
- CSS 背景圖片只支援能安全建立獨立 pseudo-element 圖層的元素；不符合條件者會跳過。
- 同一元素中的多個 CSS background layers 會一起控制。
- `backdrop-filter` 灰階不保證涵蓋瀏覽器 Top Layer 或每一種 GPU/compositor surface。
- `chrome://`、Chrome 線上應用程式商店、擴充功能頁面等受限制頁面，不能由一般 Content Script 修改。
- 若網站持續高頻率改寫圖片 inline style、class 或 DOM，重新讀取原始樣式時可能出現短暫視覺變化。
- 單張圖片暫時顯示及固定顯示狀態只維持目前頁面工作階段，不跨重新整理保存。

## 開發檢查

設定模組測試可使用 Node.js 執行，不需要額外第三方套件：

```bash
node tests/settings.test.cjs
```

測試項目包含預設值、hostname 設定隔離、數值範圍驗證、全域設定驗證，以及 Reset Default 不會重設灰階的範圍確認。

此測試不等於完整 Chrome 互動驗收。實際執行結果請參考 `TEST_REPORT.md`。

## 專案結構

```text
Image-Discreet-Mode-v1.2.0/
├── manifest.json
├── background.js
├── README.md
├── TEST_REPORT.md
├── content/
│   ├── namespace.js
│   ├── settings.js
│   ├── i18n.js
│   ├── image-engine.js
│   ├── grayscale.js
│   ├── single-image.js
│   ├── panel.js
│   ├── bootstrap.js
│   ├── page-effects.css
│   └── panel.css
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── tests/
    └── settings.test.cjs
```


## v1.2.0 互動修正（本次修訂）

- 新頁面初始化時，Panel Host 先保持 `visibility: hidden`，等 Shadow DOM 的 Panel CSS 載入完成才顯示，避免樣式尚未載入時展開內容閃現。載入失敗時會解除隱藏，避免整個控制介面永久不可見。
- 新頁面初始化維持收合狀態；收合把手保持空白，不顯示 `IDM` 字樣。
- Panel 離開後自動收合時間調整為 300ms。
- 圖片透明度、圖片模糊、圖片縮放及 Panel 透明度四個 Slider，均可在 Slider 區域使用滑鼠滾輪調整；向上增加、向下減少，並沿用原本 `input` 更新流程，即時更新數值、效果與設定。


## v1.2.0 Slider 刻度與滾輪效能修正

四個 Slider 都調整為 10 個區間、共 11 個可調位置；滑鼠滾輪快速連續操作時，數值會先即時移動，但效果更新會採用 50ms debounce，只在停止滾動 50ms 後套用最後數值，避免每一格都重複觸發圖片效果。

| Slider | 可調範圍 | 11 個位置 |
|---|---:|---|
| 圖片透明度 | 0–100% | 0、10、20 … 100% |
| 圖片模糊 | 0–20px | 以 0–100% 顯示；每 10% 對應 2px，0%=0px、100%=20px |
| 圖片縮放 | 10–200% | 10 個等距區間，共 11 個位置 |
| Panel 透明度 | 20–100% | 10 個等距區間，共 11 個位置 |

圖片模糊的設定仍以 px 儲存，只有 Slider 顯示改為百分比；既有網站設定不需要遷移。Panel 透明度保留原本 20% 下限，避免面板完全透明而難以重新操作。
