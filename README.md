# Contra Chrome Ext

**Contra** is a production-ready **Manifest V3** Chrome Extension that reads, extracts, and analyzes Terms & Conditions (ToC / ToS), Privacy Policies, and End User License Agreements (EULA) in real-time. It leverages the ultra-fast **Groq Platform API** (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`) and the **Google Gemini Flash API** (`gemini-2.5-flash`) with strict JSON schema enforcement to protect consumers from predatory contractual terms.

---

## 🌟 Key Features

### 1. Dual-Mode Hybrid Extraction Pipeline
* **Tier 1 (DOM Text Scraper)**: Automatically targets core text containers (`<main>`, `<article>`, `.terms`, `.legal`, `#tos`), deep-cloning the DOM and stripping out noise such as navigation bars, headers, footers, cookie banners (`OneTrust`, `CookieNotice`, etc.), modals, and scripts.
* **Tier 2 (Vision/Screenshot Fallback)**: If extracted clean DOM text is under the threshold (default: 200 words) — indicating iFrames, Shadow DOM, scrollable modal overlays, embedded PDFs, or Canvas — Contra triggers `chrome.tabs.captureVisibleTab` and passes an optimized viewport screenshot to multimodal models (`qwen/qwen3.8-27b` on Groq or `gemini-2.5-flash` on Google Gemini).
* **Self-Healing Fallback**: If vision OCR is not supported on a specific API tier, Contra automatically falls back to DOM text extraction, guaranteeing an uninterrupted analysis report.
* **Manual Vision Mode**: Users can explicitly click **"👁️ Vision"** to analyze visual layouts on demand.

### 2. Deep Consumer Protection Analysis
Contra flags predatory and one-sided clauses across 7 key legal categories:
1. **Automatic Renewal** (Hidden evergreen renewals, aggressive billing, 90-day certified mail notice clauses)
2. **Additional Charges** (Hidden surcharges, chargeback penalty fees, cancellation surcharges)
3. **Refund Restrictions** (Strict no-refund policies, forfeiture of balances)
4. **Unilateral Changes** (Modifying terms or pricing without direct notice)
5. **Dispute & Arbitration** (Mandatory binding arbitration & class action waivers)
6. **Liability Limitations** (Zero liability disclaimers, micro-caps like $10 or 30-day fees)
7. **Unfair Terms** (Broad data exploitation, perpetual copyright forfeitures, immediate unilateral termination)

### 3. Professional Classical Aesthetic (White & Pastel Green)
* **Classical Editorial Typography**: Styled with Google Fonts **Playfair Display** (graceful curved serif headings, italic brand emblem, and authentic legal parchment quote blocks) paired with clean, ultra-readable **Plus Jakarta Sans** for interface copy.
* **White & Pastel Green Palette**: Clean porcelain white cards with soft pastel sage accents (`#eaf3ec`, `#285439`), subtle elevated drop shadows, and delicate borders.
* **Refined Risk Badges**: Color-coded indicators with distinct styling:
  * 🔴 **High Risk**: Wine crimson (`#991b1b`) on rose blush (`#fef2f2`)
  * 🟡 **Medium Risk**: Antique amber (`#92400e`) on warm cream (`#fffbeb`)
  * 🟢 **Low Risk**: Sage green (`#166534`) on soft mint (`#f0fdf4`)
* **Iconic Retro Logo**: Features the legendary pixel-art Contra emblem across all icon resolutions and UI headers.
* **Flagged Provisions Accordion**: Expandable cards showing plain-English translation, verbatim quote, and legal rationale, with real-time risk filter tabs (*All*, *High*, *Med*, *Low*).
* **Exporting & Caching**: One-click **"Copy Analysis Report"** outputs clean Markdown; analyses are automatically cached in `chrome.storage.local` indexed by URL to prevent redundant API calls.

---

## 📁 Project Architecture

```
Contrat Ext/
├── manifest.json              # Manifest V3 setup (activeTab, scripting, storage, <all_urls>)
├── icons/                     # Multi-resolution pixel-art Contra icons
│   ├── icon-16.png            # 16x16 toolbar icon
│   ├── icon-32.png            # 32x32 retina toolbar icon
│   ├── icon-48.png            # 48x48 extensions management icon
│   ├── icon-128.png           # 128x128 store / high-res icon
│   └── contra-logo.png        # 512x512 original source emblem
├── popup/
│   ├── popup.html             # Classical UI: Crux banner, Risk badges, Takeaways & Accordion
│   ├── popup.css              # White & pastel sage green styling with Playfair Display
│   └── popup.js               # UI controller, hybrid extraction pipeline & local caching
├── scripts/
│   ├── content.js             # DOM Extractor & Cleaner (noise filtering & structure preservation)
│   └── background.js          # Service Worker (screenshot capture, Groq/Gemini API, caching)
├── options/
│   ├── options.html           # Settings dashboard for Groq & Gemini API keys
│   ├── options.css            # Classical white & pastel green settings layout
│   └── options.js             # Direct in-page verification, model discovery & cache manager
└── test/
    └── sample_tos.html        # Comprehensive mock ToS page for immediate offline/local testing
```

---

## 🚀 Installation & Setup

### Step 1: Load Unpacked Extension into Chrome
1. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
2. Toggle on **"Developer mode"** in the top right corner.
3. Click the **"Load unpacked"** button in the top left.
4. Select the project folder:
   ```
   /home/rhythm/Projects/Contrat Ext
   ```
5. Pin **Contra** to your Chrome toolbar for easy access!

---

### Step 2: Configure Your API Key

#### Option A: Groq Platform (Ultra-Fast Inference)
1. Get a free API key from the [GroqCloud Console](https://console.groq.com/keys).
2. Open Contra Settings (click the **⚙️ Settings** icon in the popup, or right-click extension & select **Options**).
3. Select **Groq Platform**, paste your `gsk_...` key, and click **Test Connection**:
   * It will verify your key directly via `GET /openai/v1/models` and discover all accessible models.
   * Default Text Model: `openai/gpt-oss-120b` (Recommended 120B reasoning model at 500 T/s)
   * Ultra-Fast Alternative: `openai/gpt-oss-20b` (1,000 T/s)
   * Active Vision Model: `qwen/qwen3.8-27b`
4. Click **Save Settings**.

#### Option B: Google Gemini Flash (Full Multimodal Support)
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. In Contra Settings, select **Google Gemini**, paste your `AIzaSy...` key, and save.
   * Default Model: `gemini-2.5-flash` (Native multimodal vision OCR and text analysis on all keys)

---

## 🔒 Security & Privacy
* **Client-Side Storage**: All API keys are securely stored in `chrome.storage.sync` and never transmitted to third-party tracking servers.
* **Local Caching**: Contract analyses are indexed strictly within `chrome.storage.local` on your browser.
* **Manifest V3 Compliant**: Uses native fetch, modern service workers, and zero dynamic code evaluation (`eval` is never used).
