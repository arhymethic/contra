/**
 * Contra - Terms & Conditions Content Script
 * DOM Text Extractor & Cleaner
 * 
 * Extracts clean, readable contract text while stripping out noise like
 * navigation, headers, footers, cookie banners, modals, and scripts.
 */

(function () {
  // Prevent duplicate declaration if injected multiple times
  if (window.__CONTRA_CONTENT_SCRIPT_LOADED__) {
    return;
  }
  window.__CONTRA_CONTENT_SCRIPT_LOADED__ = true;

  // Elements and selectors to remove
  const NOISE_SELECTORS = [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'iframe',
    'audio',
    'video',
    'nav',
    'header',
    'footer',
    'aside',
    '[role="banner"]',
    '[role="navigation"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '.header',
    '.site-header',
    '.page-header',
    '.footer',
    '.site-footer',
    '.page-footer',
    '.nav',
    '.navbar',
    '.menu',
    '.sidebar',
    '.cookie-banner',
    '.cookie-notice',
    '.cookie-consent',
    '.cc-window',
    '.qc-cmp2-container',
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#cookie-notice',
    '#cookie-law-info-bar',
    '[id*="cookie" i]',
    '[class*="cookie" i]',
    '[id*="consent" i]',
    '[class*="consent" i]',
    '[id*="banner" i]',
    '.advertisement',
    '.ad-container',
    '.ads',
    '.social-share',
    '.chat-widget',
    '#intercom-container',
    '#hubspot-messages-iframe-container',
    '.toc',
    '.table-of-contents',
    '.theme-doc-toc-mobile',
    '.tocCollapsible_FdGq',
    '.theme-doc-breadcrumbs',
    '.breadcrumbs',
    '.theme-doc-sidebar-container',
    '[aria-label="Breadcrumbs"]',
    '[aria-label="Table of contents"]',
    '[aria-label="On this page"]',
    '.pagination-nav',
    '.theme-edit-this-page',
    '.backToTopButton_zNcT'
  ];

  // Preferred legal container selectors ordered by specificity
  const LEGAL_CONTAINER_SELECTORS = [
    'main article',
    'article',
    'main',
    '[role="main"]',
    '#terms',
    '#privacy',
    '#tos',
    '#legal',
    '#legal-content',
    '#terms-and-conditions',
    '#agreement',
    '.terms-and-conditions',
    '.terms-of-service',
    '.terms-content',
    '.privacy-policy',
    '.privacy-content',
    '.legal-content',
    '.policy-container',
    '.document-content',
    '.entry-content',
    '.article-content',
    '.markdown-body',
    '.content-area'
  ];

  // Keywords used to determine if page is likely a legal document
  const LEGAL_KEYWORDS = [
    'terms of service',
    'terms and conditions',
    'terms of use',
    'privacy policy',
    'end user license agreement',
    'eula',
    'user agreement',
    'cookie policy',
    'legal agreement',
    'acceptable use policy',
    'arbitration agreement',
    'terms & conditions'
  ];

  /**
   * Check if page URL, title, or headings indicate legal document
   */
  function isLikelyLegalPage() {
    const haystack = (
      window.location.href + ' ' +
      document.title + ' ' +
      (document.querySelector('h1')?.innerText || '')
    ).toLowerCase();

    return LEGAL_KEYWORDS.some(kw => haystack.includes(kw));
  }

  /**
   * Find best candidate container holding contract content
   */
  function findBestContentContainer() {
    for (const selector of LEGAL_CONTAINER_SELECTORS) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const textLength = el.innerText ? el.innerText.trim().length : 0;
          if (textLength > 500) {
            return { element: el, selectorUsed: selector };
          }
        }
      } catch (err) {
        // Skip invalid selector if any
      }
    }

    // Fallback to body
    return { element: document.body, selectorUsed: 'body' };
  }

  /**
   * Sanitize and extract clean formatted text from DOM element
   */
  function extractCleanTextFromElement(sourceElement) {
    if (!sourceElement) return '';

    // Create a clone to manipulate without touching the active page
    const clone = sourceElement.cloneNode(true);

    // Remove noise elements
    NOISE_SELECTORS.forEach(selector => {
      try {
        const elements = clone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // Ignore selector errors
      }
    });

    // Remove hidden elements
    const allDescendants = clone.querySelectorAll('*');
    allDescendants.forEach(el => {
      if (el.getAttribute('aria-hidden') === 'true') {
        el.remove();
        return;
      }
      const style = el.getAttribute('style') || '';
      if (style.includes('display: none') || style.includes('visibility: hidden')) {
        el.remove();
      }
    });

    // Traverse and preserve structure (headings, paragraphs, list items)
    const blocks = [];
    
    function traverse(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.replace(/\s+/g, ' ');
        if (text.trim().length > 0) {
          blocks.push(text);
        }
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();

        // Add structural line breaks before major block elements
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          blocks.push('\n\n### ');
        } else if (['p', 'div', 'section', 'article', 'blockquote'].includes(tagName)) {
          blocks.push('\n\n');
        } else if (tagName === 'li') {
          blocks.push('\n• ');
        } else if (tagName === 'br') {
          blocks.push('\n');
        }

        for (let child = node.firstChild; child; child = child.nextSibling) {
          traverse(child);
        }

        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote'].includes(tagName)) {
          blocks.push('\n');
        }
      }
    }

    traverse(clone);

    // Collapse excess newlines and normalize spaces
    const rawText = blocks.join('');
    const cleanText = rawText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return cleanText;
  }

  /**
   * Main extraction runner
   */
  function extractContractData() {
    try {
      const { element, selectorUsed } = findBestContentContainer();
      const extractedText = extractCleanTextFromElement(element);

      // Calculate words
      const words = extractedText
        ? extractedText.split(/\s+/).filter(w => w.length > 0).length
        : 0;

      const legalLikelihood = isLikelyLegalPage();

      return {
        success: true,
        title: document.title || 'Untitled Page',
        url: window.location.href,
        domain: window.location.hostname,
        text: extractedText,
        wordCount: words,
        characterCount: extractedText.length,
        isLikelyLegalPage: legalLikelihood,
        containerUsed: selectorUsed,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[Contra] DOM extraction failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown extraction error',
        title: document.title || '',
        url: window.location.href,
        domain: window.location.hostname,
        wordCount: 0,
        text: ''
      };
    }
  }

  // Expose on window for programmatic injection via chrome.scripting.executeScript
  window.__contraExtractContractText = extractContractData;

  // Listen for messages from popup or background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'EXTRACT_CONTRACT_TEXT') {
      const result = extractContractData();
      sendResponse(result);
    }
    return true; // Keep message channel open for async response
  });
})();
