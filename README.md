# Contra — Contract Intelligence for Chrome

**Understand the fine print. Protect your rights.**

Contra is a Manifest V3 Chrome extension that extracts, analyzes, and explains Terms of Service (ToS), Privacy Policies, and End User License Agreements (EULAs) in real time.

Powered by the Groq API and Google Gemini Flash, Contra identifies potentially predatory contractual provisions and translates complex legal language into clear, actionable insights. Its hybrid extraction pipeline combines DOM-based text extraction with vision-powered OCR to analyze even difficult-to-access legal documents.

> **The fine print shouldn't be a trap.**

---

## ✦ Features at a Glance

| Feature | Description |
|---|---|
| Hybrid Extraction | Combines intelligent DOM scraping with screenshot-based vision analysis |
| AI-Powered Analysis | Uses Groq and Gemini models to identify potentially unfair contractual terms |
| Seven Risk Categories | Detects problematic clauses involving billing, refunds, liability, arbitration, and more |
| Risk Classification | Categorizes flagged provisions as High, Medium, or Low risk |
| Plain-English Explanations | Explains what each clause means and why it matters |
| Verbatim Evidence | Displays the original contractual language alongside each finding |
| Local Caching | Stores analyses locally to reduce redundant API requests |
| Markdown Export | Copies the complete analysis report in a clean, portable format |
| Privacy-Conscious Design | Stores API credentials and cached reports in browser-managed storage |

---

## 01 Intelligent Document Extraction

Contra uses a two-tier extraction pipeline designed to handle real-world legal pages.

### Tier 1 · DOM Text Extraction

Contra intelligently identifies relevant document content using semantic HTML elements and common legal-document selectors, including:

- `<main>` and `<article>`
- `.terms` and `.legal`
- `#tos` and related content containers

The extraction process deep-clones the DOM, removes irrelevant interface elements, and preserves meaningful document structure.

**Noise filtering includes:**
- Navigation bars, headers, and footers
- Cookie consent banners and overlays
- OneTrust and CookieNotice elements
- Modals, scripts, and unrelated interface content

### Tier 2 · Vision-Powered Fallback

When clean text extraction produces fewer than **200 words by default**, Contra can capture the visible browser viewport and submit the screenshot to a compatible multimodal model.

This fallback is designed for pages containing:

- Embedded documents and PDFs
- iFrames and Shadow DOM content
- Scrollable legal-document overlays
- Canvas-rendered text
- Other visually accessible but difficult-to-extract content

Supported vision providers include Groq-hosted multimodal models and Google Gemini Flash.

### Self-Healing Fallback

If vision analysis fails or is unsupported by the selected model, Contra falls back to available DOM text extraction instead of abandoning the analysis entirely.

### Manual Vision Mode

Users can explicitly select **👁️ Vision** to trigger screenshot-based analysis whenever visual extraction is preferable.

---

## 02 Deep Contractual Risk Analysis

Contra examines contractual language across seven consumer-protection categories.

### 1. Automatic Renewal

Identifies potentially problematic renewal and billing mechanisms.

- Hidden evergreen renewal provisions
- Aggressive renewal terms
- Unreasonably restrictive cancellation windows
- Advance-notice requirements, including certified-mail clauses

### 2. Additional Charges

Surfaces unexpected or potentially excessive financial obligations.

- Hidden surcharges
- Chargeback penalties
- Cancellation fees
- Additional contractual charges

### 3. Refund Restrictions

Highlights provisions that may limit a consumer's ability to recover payments.

- Strict no-refund policies
- Forfeiture of unused balances
- Restrictive refund eligibility conditions

### 4. Unilateral Changes

Examines whether a company reserves broad powers to change contractual terms.

- Pricing changes without direct notice
- Unilateral amendments to the agreement
- Changes to service conditions with limited safeguards

### 5. Disputes & Arbitration

Identifies provisions that may restrict how consumers resolve disputes.

- Mandatory binding arbitration
- Class-action waivers
- Restrictions on court proceedings
- Contractual dispute-resolution requirements

### 6. Liability Limitations

Flags provisions that may significantly limit a company's responsibility.

- Broad disclaimers of liability
- Extremely low liability caps, such as $10
- Caps tied to short periods of subscription fees
- Restrictions on available remedies

### 7. Unfair Terms

Detects other provisions that may create a significant imbalance between the company and the consumer.

- Broad data exploitation rights
- Perpetual or extensive copyright licenses
- Immediate unilateral termination rights
- Excessively broad contractual permissions

**Every finding is presented with three essential elements:**

1. **Plain-English explanation** — what the clause means in practice.
2. **Original quotation** — the contractual language supporting the finding.
3. **Legal rationale** — why the provision may be concerning.

*Risk classifications are informational assessments, not definitive judgments of legality or enforceable legal advice.*

---

## 03 A Classical Editorial Interface

Contra pairs the seriousness of legal documents with a refined, minimal interface.

### Visual Identity

**Design direction:** Classical editorial typography meets modern consumer technology.

| Element | Design specification |
|---|---|
| Primary background | Porcelain white |
| Accent background | Pastel sage `#eaf3ec` |
| Primary green | Deep forest `#285439` |
| Heading typography | Playfair Display |
| Interface typography | Plus Jakarta Sans |
| Cards | White surfaces with delicate borders |
| Elevation | Subtle, restrained drop shadows |
| Branding | Retro pixel-art Contra emblem |

### Risk Indicators

Each risk level has a distinct, accessible visual treatment.

| Level | Foreground | Background |
|---|---|---|
| 🔴 High | `#991b1b` | `#fef2f2` |
| 🟡 Medium | `#92400e` | `#fffbeb` |
| 🟢 Low | `#166534` | `#f0fdf4` |

### Interactive Analysis Dashboard

The popup interface includes:

- A branded Contra banner
- A summary of key findings and takeaways
- Expandable cards for flagged contractual provisions
- Risk-filter tabs: **All · High · Med · Low**
- Original quotations and contextual explanations
- A one-click **Copy Analysis Report** action
- Access to provider configuration and extension settings

The result is an interface that feels closer to a carefully typeset legal publication than a conventional browser utility.

---

## 04 AI Providers & Models

Contra supports two configurable AI providers.

### Groq Platform

Designed for fast inference using Groq-hosted language models.

**Configuration**
- API endpoint: `https://api.groq.com/openai/v1`
- Credential format: `gsk_...`
- Model discovery through the provider's models endpoint
- Configurable text-analysis and vision models

| Model | Intended role |
|---|---|
| `openai/gpt-oss-120b` | High-capability contractual analysis |
| `openai/gpt-oss-20b` | Lightweight, fast analysis |
| `qwen/qwen3.8-27b` | Vision-enabled extraction, where supported |

### Google Gemini

Designed for native multimodal processing and document analysis.

**Configuration**
- Provider: Google Gemini API
- Default model: `gemini-2.5-flash`
- Credential format: `AIzaSy...`
- Native image input for vision-based extraction

### Structured AI Responses

Contra uses structured-output constraints and JSON schema validation to keep model responses consistent with the extension's expected analysis format.

This enables predictable rendering of findings, risk levels, original quotations, plain-English explanations, and supporting rationale.

> **Model availability matters.** Provider access, model identifiers, multimodal capabilities, and structured-output support can vary by account and API version. Configure and verify the models actually available to your API key.

---

## 05 Project Architecture

```text
Contrat Ext/
│
├── manifest.json
│   └── Manifest V3 configuration and permissions
│
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── contra-logo.png
│
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
│       └── Popup interface, extraction orchestration,
│           risk filters, and local caching
│
├── scripts/
│   ├── content.js
│   │   └── DOM extraction, noise removal,
│   │       and document-structure preservation
│   │
│   └── background.js
│       └── Service worker, screenshot capture,
│           AI API requests, and caching
│
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
│       └── Provider settings, credential verification,
│           model discovery, and cache management
│
└── test/
    └── sample_tos.html
        └── Sample legal document for local testing
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| `manifest.json` | Declares extension metadata, permissions, and service-worker configuration |
| `popup/` | Displays analysis results and manages user interactions |
| `scripts/content.js` | Extracts relevant legal text from the active page |
| `scripts/background.js` | Coordinates screenshots, AI requests, and background operations |
| `options/` | Manages API credentials, model settings, and cache controls |
| `test/` | Provides a controlled environment for testing extraction and analysis |

---

## 06 Installation & Setup

### Prerequisites

- Google Chrome or a compatible Chromium-based browser
- A local copy of the Contra project
- A Groq API key or Google Gemini API key
- Access to at least one compatible model

### Step 1 · Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the project directory:

   ```text
   /home/rhythm/Projects/Contrat Ext
   ```

5. Pin Contra to the browser toolbar.

### Step 2 · Configure Groq

1. Visit the [Groq Console](https://console.groq.com/keys).
2. Generate an API key.
3. Open Contra's settings.
4. Select **Groq Platform**.
5. Paste the key and select **Test Connection**.
6. Verify the accessible models and configure the text and vision models.
7. Select **Save Settings**.

### Step 3 · Configure Google Gemini

Alternatively:

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Generate a Gemini API key.
3. Open Contra's settings.
4. Select **Google Gemini**.
5. Enter the key and choose the supported model.
6. Save the configuration.

### Step 4 · Test the Extension

1. Open the local test document:

   ```text
   test/sample_tos.html
   ```

2. Open Contra from the Chrome toolbar.
3. Run an analysis.
4. Inspect the extracted content and flagged provisions.
5. Test the risk filters and report-copying functionality.
6. Verify that a repeated analysis can reuse the cached result.

For a meaningful end-to-end test, also evaluate a live legal page containing dynamically rendered content or an embedded document.

---

## 07 Security & Privacy

Contra is designed to minimize unnecessary data handling and third-party dependencies.

### Browser-Managed Storage

- **`chrome.storage.sync`** stores API credentials and user configuration.
- **`chrome.storage.local`** stores cached analysis results indexed by URL.
- Analysis caching is performed locally in the browser.

### Manifest V3

Contra uses a Manifest V3 architecture with a service worker and native `fetch()` requests. It does not rely on `eval()` or dynamically evaluated executable code.

### External API Requests

When an analysis is requested, relevant extracted text or screenshots may be sent to the configured AI provider for processing. These requests are necessary for remote model inference.

### Security Considerations

- API keys are not transmitted to unrelated tracking services by the intended application design.
- Browser storage is not equivalent to encrypted secret storage.
- Website content sent to an AI provider may contain sensitive information.
- URL-indexed caches should be reviewed for sensitive query parameters and personally identifiable information.
- Extension permissions should be limited to those required for the selected extraction and screenshot workflows.

**Privacy principle:** Keep data collection minimal, make external processing explicit, and give users control over credentials and cached reports.

---

## 08 Testing & Reliability

Before considering a release production-ready, validate the following scenarios:

- [ ] Clean extraction from standard HTML legal pages
- [ ] Removal of cookie banners and unrelated interface content
- [ ] Correct handling of pages below the word-count threshold
- [ ] Screenshot capture and multimodal analysis
- [ ] Graceful fallback when a vision model is unavailable
- [ ] JSON schema validation and malformed-response handling
- [ ] API rate limits, network failures, and authentication errors
- [ ] Accurate association of quotations with extracted source text
- [ ] Risk filtering across all severity levels
- [ ] Cache hits, cache invalidation, and URL normalization
- [ ] Credential persistence and provider switching
- [ ] Permission behavior on restricted browser pages
- [ ] Privacy review of cached content and external API payloads

---

## 09 Roadmap

Potential future improvements include:

- **Clause comparison:** Compare two versions of a legal agreement and identify material changes.
- **Policy history:** Track changes in a website's Terms of Service over time.
- **Evidence confidence:** Distinguish directly quoted provisions from model-generated inferences.
- **Jurisdiction-aware analysis:** Provide jurisdiction-specific context with appropriate legal sources.
- **Document coverage indicators:** Show how much of a policy was successfully extracted.
- **PDF support:** Improve extraction from complete documents rather than visible viewport content alone.
- **Local inference:** Explore compatible local models for users who prefer not to transmit documents to remote APIs.
- **Accessibility improvements:** Add keyboard navigation, screen-reader support, and stronger non-color risk indicators.

---

## 10 Important Disclaimer

Contra is a consumer-awareness and contract-analysis tool. Its findings are generated by AI and may contain omissions, inaccuracies, or incorrect interpretations.

A provision flagged as concerning is not necessarily illegal, unenforceable, or unfair under every applicable law. Likewise, the absence of a warning does not guarantee that an agreement is safe.

Users should review the original agreement and consult a qualified legal professional when making consequential legal decisions.

---

## Built to Make the Fine Print Understandable

Contra brings together browser automation, document extraction, multimodal AI, structured analysis, and thoughtful interface design to make complex contractual language easier to understand.

**Read the terms. See the risks. Make informed decisions.**

*Contra — Clarity before consent.*
