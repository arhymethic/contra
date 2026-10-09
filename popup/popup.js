/**
 * Contra - Popup UI Controller
 * Dual-Mode Hybrid Extraction Pipeline (Tier 1 DOM Text / Tier 2 Vision Fallback)
 * Accordion View, Risk-Coded Badges, and Local Caching.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const modeBadge = document.getElementById('modeBadge');
  const modeBadgeText = document.getElementById('modeBadgeText');
  const btnOpenSettings = document.getElementById('btnOpenSettings');

  const noApiKeyBanner = document.getElementById('noApiKeyBanner');
  const btnConfigureKey = document.getElementById('btnConfigureKey');

  const currentDomainEl = document.getElementById('currentDomain');
  const legalBadgeEl = document.getElementById('legalBadge');

  const scanActionCard = document.getElementById('scanActionCard');
  const btnScan = document.getElementById('btnScan');
  const btnScanText = document.getElementById('btnScanText');
  const btnForceVision = document.getElementById('btnForceVision');
  const statusLabel = document.getElementById('statusLabel');

  const loadingState = document.getElementById('loadingState');
  const loadingStepTitle = document.getElementById('loadingStepTitle');
  const loadingStepDetail = document.getElementById('loadingStepDetail');
  const progressFill = document.getElementById('progressFill');

  const errorState = document.getElementById('errorState');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const btnRetry = document.getElementById('btnRetry');
  const btnSettingsLink = document.getElementById('btnSettingsLink');

  const resultsContainer = document.getElementById('resultsContainer');
  const cacheIndicator = document.getElementById('cacheIndicator');
  const cacheTimeEl = document.getElementById('cacheTime');
  const btnRefreshScan = document.getElementById('btnRefreshScan');

  const overallRiskPill = document.getElementById('overallRiskPill');
  const overallRiskText = document.getElementById('overallRiskText');
  const cruxSummary = document.getElementById('cruxSummary');
  const statHigh = document.getElementById('statHigh');
  const statMed = document.getElementById('statMed');
  const statLow = document.getElementById('statLow');

  const takeawaysList = document.getElementById('takeawaysList');
  const provisionsCount = document.getElementById('provisionsCount');
  const accordionList = document.getElementById('accordionList');
  const disclaimerText = document.getElementById('disclaimerText');

  const btnCopyReport = document.getElementById('btnCopyReport');
  const btnCopyText = document.getElementById('btnCopyText');
  const btnRescanSubtle = document.getElementById('btnRescanSubtle');

  // State
  let activeTab = null;
  let currentAnalysis = null;
  let currentExtractedData = null;
  let hasValidApiKey = false;
  let activeFilter = 'all';

  // Navigation handlers
  btnOpenSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  btnConfigureKey?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  btnSettingsLink?.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Filter tabs
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyClauseFilter();
    });
  });

  // Check Settings & Active Tab
  await initializePopup();

  async function initializePopup() {
    // Check config
    const config = await getStoredConfig();
    const activeKey = config.provider === 'gemini' ? config.geminiApiKey : config.groqApiKey;
    hasValidApiKey = Boolean(activeKey && activeKey.trim());

    if (!hasValidApiKey) {
      noApiKeyBanner.classList.remove('hidden');
    } else {
      noApiKeyBanner.classList.add('hidden');
    }

    // Get current tab
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        activeTab = tabs[0];
        displayTabInfo(activeTab);
        await checkTabCache(activeTab.url);
      }
    } catch (e) {
      console.warn('Failed to query active tab', e);
      currentDomainEl.textContent = 'Active Page';
    }
  }

  function displayTabInfo(tab) {
    try {
      const url = new URL(tab.url);
      currentDomainEl.textContent = url.hostname || 'Active Webpage';

      // Check if restricted page (chrome:// or file://)
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        legalBadgeEl.textContent = 'Restricted';
        btnScan.disabled = true;
        btnForceVision.disabled = true;
        statusLabel.textContent = 'Extension cannot run on internal Chrome pages.';
        return;
      }

      // Check for legal keywords in URL or title
      const checkString = (tab.url + ' ' + (tab.title || '')).toLowerCase();
      const isLegal = ['terms', 'tos', 'privacy', 'policy', 'condition', 'agreement', 'eula', 'legal'].some(kw => checkString.includes(kw));
      if (isLegal) {
        legalBadgeEl.textContent = 'Legal Doc';
        legalBadgeEl.classList.add('detected');
        statusLabel.textContent = 'Legal page detected. Ready for scan.';
      } else {
        legalBadgeEl.textContent = 'Standard';
        legalBadgeEl.classList.remove('detected');
        statusLabel.textContent = 'Click scan to extract & analyze contract.';
      }
    } catch (e) {
      currentDomainEl.textContent = 'Active Webpage';
    }
  }

  async function checkTabCache(tabUrl) {
    if (!tabUrl) return;
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'GET_CACHED_ANALYSIS',
        url: tabUrl
      });

      if (res && res.cached && res.cached.analysis) {
        const item = res.cached;
        renderAnalysisResults({
          ...item.analysis,
          _cached: true,
          _cachedTimestamp: item.timestamp,
          _provider: item.provider
        });
      }
    } catch (err) {
      console.warn('Cache check error:', err);
    }
  }

  // Scan triggers
  btnScan.addEventListener('click', () => runPipeline({ forceVision: false, forceRefresh: false }));
  btnForceVision.addEventListener('click', () => runPipeline({ forceVision: true, forceRefresh: true }));
  btnRefreshScan?.addEventListener('click', () => runPipeline({ forceVision: false, forceRefresh: true }));
  btnRescanSubtle?.addEventListener('click', () => runPipeline({ forceVision: false, forceRefresh: true }));
  btnRetry?.addEventListener('click', () => runPipeline({ forceVision: false, forceRefresh: true }));

  // Main Pipeline Runner
  async function runPipeline({ forceVision = false, forceRefresh = false }) {
    if (!activeTab || !activeTab.id) {
      showError('No active tab detected', 'Please open a webpage to analyze.');
      return;
    }

    if (!hasValidApiKey) {
      noApiKeyBanner.classList.remove('hidden');
      showError('API Key Missing', 'Please configure your Groq or Gemini API key in settings.');
      return;
    }

    // UI to loading state
    hideAllViews();
    loadingState.classList.remove('hidden');
    progressFill.style.width = '20%';

    try {
      const config = await getStoredConfig();
      const threshold = config.wordThreshold || 200;

      let mode = 'DOM_TEXT';
      let extractedData = null;
      let screenshotUrl = null;

      if (forceVision) {
        // Direct Vision Mode
        mode = 'SCREENSHOT_VISION';
        updateLoadingStep('Capturing Page View...', 'Tier 2 Vision: Capturing viewport screenshot for visual OCR', 45);
        const [shot, domData] = await Promise.all([
          captureScreenshot(),
          extractDomTextFromTab(activeTab.id).catch(() => null)
        ]);
        screenshotUrl = shot;
        extractedData = domData;
      } else {
        // Tier 1: DOM Text Scraper
        updateLoadingStep('Extracting Contract Text...', 'Tier 1: Scanning DOM, cleaning navbars, footers & cookie banners', 35);
        extractedData = await extractDomTextFromTab(activeTab.id);

        const wordCount = extractedData?.wordCount || 0;

        // Check Tier 2 fallback condition
        if (wordCount < threshold) {
          mode = 'SCREENSHOT_VISION';
          updateLoadingStep(
            'Switching to Vision OCR...',
            `Extracted DOM text (${wordCount} words) is below ${threshold} words threshold. Capturing screenshot fallback...`,
            55
          );
          screenshotUrl = await captureScreenshot();
        } else {
          mode = 'DOM_TEXT';
          updateLoadingStep(
            'Analyzing Contract Terms...',
            `Tier 1: ${wordCount.toLocaleString()} words extracted. Performing deep legal analysis with ${config.provider === 'gemini' ? 'Gemini Flash' : 'Groq Platform'}...`,
            70
          );
        }
      }

      // Step 2: Call AI through background worker
      updateLoadingStep(
        'Evaluating Provisions...',
        `Flagging hidden liability, auto-renewals, arbitration waivers & risks...`,
        85
      );

      const aiResponse = await chrome.runtime.sendMessage({
        action: 'ANALYZE_CONTRACT',
        payload: {
          mode,
          text: extractedData?.text || '',
          screenshotUrl,
          url: activeTab.url,
          title: activeTab.title,
          domain: currentDomainEl.textContent,
          forceRefresh
        }
      });

      if (!aiResponse || !aiResponse.success) {
        throw new Error(aiResponse?.error || 'Analysis service returned an error.');
      }

      progressFill.style.width = '100%';
      setTimeout(() => {
        renderAnalysisResults(aiResponse.data);
      }, 300);

    } catch (err) {
      console.error('[Contra] Pipeline error:', err);
      showError('Analysis Failed', err.message || 'An error occurred during contract extraction.');
    }
  }

  /**
   * Safely inject and execute DOM extraction on active tab
   */
  async function extractDomTextFromTab(tabId) {
    try {
      // First attempt direct message in case content script is active
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_CONTRACT_TEXT' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve(null);
          } else {
            resolve(res);
          }
        });
      });

      if (response && response.success) {
        return response;
      }

      // If direct message didn't respond, inject content script programmatically
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['scripts/content.js']
      });

      // Now message again
      const secondTry = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_CONTRACT_TEXT' }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });

      return secondTry;
    } catch (err) {
      console.warn('DOM extraction fell back:', err);
      return { success: false, wordCount: 0, text: '' };
    }
  }

  /**
   * Request screenshot from background service worker
   */
  async function captureScreenshot() {
    const res = await chrome.runtime.sendMessage({ action: 'CAPTURE_SCREENSHOT' });
    if (!res || !res.success || !res.dataUrl) {
      throw new Error(res?.error || 'Failed to capture visible tab screenshot.');
    }
    return res.dataUrl;
  }

  /**
   * Render structured analysis in popup
   */
  function renderAnalysisResults(data) {
    currentAnalysis = data;
    hideAllViews();
    resultsContainer.classList.remove('hidden');

    // Update Mode Badge
    const isVision = data.analysis_mode_used === 'SCREENSHOT_VISION';
    modeBadgeText.textContent = isVision ? 'VISION' : 'TEXT';
    if (isVision) {
      modeBadge.classList.add('vision');
    } else {
      modeBadge.classList.remove('vision');
    }

    // Cache indicator
    if (data._cached) {
      cacheIndicator.classList.remove('hidden');
      const timeAgo = formatTimeAgo(data._cachedTimestamp);
      cacheTimeEl.textContent = timeAgo;
    } else {
      cacheIndicator.classList.add('hidden');
    }

    // Crux & Risk Pill
    cruxSummary.textContent = data.overall_summary || 'Executive summary unavailable.';
    const rating = data.overall_risk_rating || 'Medium';

    overallRiskPill.className = `risk-pill ${rating}`;
    overallRiskText.textContent = `${rating} Risk`;

    // Calculate clause distribution
    const provisions = data.flagged_provisions || [];
    const highCount = provisions.filter(p => p.risk_level === 'High').length;
    const medCount = provisions.filter(p => p.risk_level === 'Medium').length;
    const lowCount = provisions.filter(p => p.risk_level === 'Low').length;

    statHigh.textContent = `${highCount} High`;
    statMed.textContent = `${medCount} Medium`;
    statLow.textContent = `${lowCount} Low`;

    // Key Takeaways
    takeawaysList.innerHTML = '';
    const takeaways = data.key_takeaways || [];
    if (takeaways.length === 0) {
      takeawaysList.innerHTML = '<li class="takeaway-item"><span class="takeaway-bullet">•</span><span>No major consumer takeaways flagged.</span></li>';
    } else {
      takeaways.forEach(item => {
        const li = document.createElement('li');
        li.className = 'takeaway-item';
        li.innerHTML = `<span class="takeaway-bullet">•</span><span>${escapeHtml(item)}</span>`;
        takeawaysList.appendChild(li);
      });
    }

    // Flagged Provisions Accordion
    provisionsCount.textContent = provisions.length;
    renderAccordions(provisions);

    // Disclaimer
    if (data.disclaimer) {
      disclaimerText.textContent = data.disclaimer;
    }

    // Scroll to top of popup
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Render accordion list with current filter
   */
  function renderAccordions(provisions) {
    accordionList.innerHTML = '';

    if (!provisions || provisions.length === 0) {
      accordionList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">No provisions flagged for this document.</div>';
      return;
    }

    provisions.forEach((clause, index) => {
      const item = document.createElement('div');
      item.className = `accordion-item risk-${clause.risk_level || 'Medium'}`;
      item.dataset.risk = clause.risk_level || 'Medium';

      // First High-risk item is expanded by default
      const isDefaultOpen = index === 0;
      if (isDefaultOpen) {
        item.classList.add('open');
      }

      item.innerHTML = `
        <div class="accordion-header">
          <div class="accordion-header-left">
            <div class="accordion-tags">
              <span class="category-tag">${escapeHtml(clause.category || 'Clause')}</span>
              <span class="clause-risk-tag ${clause.risk_level || 'Medium'}">${clause.risk_level || 'Medium'}</span>
            </div>
            <div class="accordion-preview">${escapeHtml(clause.plain_english_translation || clause.verbatim_clause || '')}</div>
          </div>
          <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>

        <div class="accordion-body">
          <div class="clause-block">
            <span class="clause-label">Plain-English Translation</span>
            <div class="plain-english-box">${escapeHtml(clause.plain_english_translation || 'N/A')}</div>
          </div>

          <div class="clause-block">
            <span class="clause-label">Verbatim Contract Clause</span>
            <div class="verbatim-quote-box">
              <div class="verbatim-quote">"${escapeHtml(clause.verbatim_clause || 'Clause text unavailable')}"</div>
            </div>
          </div>

          <div class="clause-block">
            <span class="clause-label">Legal Reasoning & Impact</span>
            <div class="legal-reasoning-box">${escapeHtml(clause.legal_reasoning || 'Standard contractual risk.')}</div>
          </div>
        </div>
      `;

      // Accordion click toggle
      const header = item.querySelector('.accordion-header');
      header.addEventListener('click', () => {
        item.classList.toggle('open');
      });

      accordionList.appendChild(item);
    });

    applyClauseFilter();
  }

  function applyClauseFilter() {
    const items = accordionList.querySelectorAll('.accordion-item');
    items.forEach(el => {
      if (activeFilter === 'all' || el.dataset.risk.toLowerCase() === activeFilter.toLowerCase()) {
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
  }

  // Copy Full Markdown Report
  btnCopyReport.addEventListener('click', async () => {
    if (!currentAnalysis) return;

    const report = generateMarkdownReport(currentAnalysis, currentDomainEl.textContent);
    try {
      await navigator.clipboard.writeText(report);
      btnCopyText.textContent = 'Report Copied! ✓';
      setTimeout(() => {
        btnCopyText.textContent = 'Copy Analysis Report';
      }, 2000);
    } catch (e) {
      console.warn('Clipboard write error', e);
    }
  });

  function generateMarkdownReport(data, domain) {
    const dateStr = new Date().toLocaleString();
    let md = `# Contra Legal Analysis Report: ${domain}\n`;
    md += `*Generated on: ${dateStr} | Mode: ${data.analysis_mode_used} | Risk: ${data.overall_risk_rating}*\n\n`;
    md += `## Executive Summary\n${data.overall_summary}\n\n`;
    md += `## Key Takeaways\n`;
    (data.key_takeaways || []).forEach(t => {
      md += `- ${t}\n`;
    });
    md += `\n## Flagged Provisions\n`;
    (data.flagged_provisions || []).forEach((p, idx) => {
      md += `### ${idx + 1}. [${p.risk_level.toUpperCase()} RISK] ${p.category}\n`;
      md += `**Plain-English**: ${p.plain_english_translation}\n\n`;
      md += `> "${p.verbatim_clause}"\n\n`;
      md += `**Legal Concern**: ${p.legal_reasoning}\n\n`;
    });
    md += `---\n*${data.disclaimer}*\n`;
    return md;
  }

  // Helper View Updaters
  function hideAllViews() {
    scanActionCard.classList.add('hidden');
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    resultsContainer.classList.add('hidden');
  }

  function showError(title, msg) {
    hideAllViews();
    errorTitle.textContent = title;
    errorMessage.textContent = msg;
    errorState.classList.remove('hidden');
  }

  function updateLoadingStep(title, detail, progressPercent) {
    loadingStepTitle.textContent = title;
    loadingStepDetail.textContent = detail;
    if (progressPercent) {
      progressFill.style.width = `${progressPercent}%`;
    }
  }

  async function getStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        provider: 'groq',
        groqApiKey: '',
        geminiApiKey: '',
        wordThreshold: 200
      }, resolve);
    });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
