// src/content.ts - FIXED: Complete error handling and user notifications
import "./styles.css";
import { transcriptService } from "./services/transcript";
import { apiService } from "./services/api";
import { User, Summary } from "./types";
import { getVideoId, debounce, getVideoMetadata } from "./utils/dom";

let currentVideoId: string | null = null;
let knuggetPanel: HTMLElement | null = null;
let isInitialized = false;
let authState = {
  isAuthenticated: false,
  user: null as User | null,
};

// FIXED: Error state management
let errorState = {
  lastError: null as string | null,
  retryCount: 0,
  maxRetries: 3,
};

// FIXED: UI notification system
interface NotificationOptions {
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  showRetry?: boolean;
  retryCallback?: () => void;
}

function isYouTubeWatchPage(): boolean {
  const pathname = window.location.pathname;
  const search = window.location.search;
  return pathname === "/watch" && search.includes("v=");
}

function initializeKnuggetExtension(): void {
  console.log("🎯 Knugget Extension initializing...");

  if (!isYouTubeWatchPage()) {
    console.log("Not on YouTube watch page, current URL:", window.location.href);
    return;
  }

  const videoId = getVideoId();
  console.log(`Initializing Knugget AI for video ID: ${videoId}`);

  setupURLChangeDetection();
  setupAuthRefreshListener();
  setupErrorHandling();

  if (videoId) {
    processCurrentPage(videoId);
  }
}

function processCurrentPage(videoId: string | null): void {
  console.log(`Knugget AI: Processing page for video ID ${videoId}`);

  if (currentVideoId !== videoId) {
    currentVideoId = videoId;
    resetContentData();
    errorState = { lastError: null, retryCount: 0, maxRetries: 3 }; // Reset error state
  }

  chrome.runtime
    .sendMessage({
      type: "PAGE_LOADED",
      payload: { url: window.location.href, videoId },
    })
    .catch(() => {
      // Ignore errors if background script is not ready
    });

  removeExistingPanel();

  setTimeout(() => {
    observeForSecondaryColumn();
  }, 100);

  initializeAuthState();
}

function observeForSecondaryColumn(): void {
  const secondaryColumn = document.getElementById("secondary");
  if (secondaryColumn) {
    console.log("✅ YouTube secondary column found immediately!");
    injectKnuggetPanel(secondaryColumn);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    const secondaryColumn = document.getElementById("secondary");
    if (secondaryColumn && !knuggetPanel) {
      console.log("✅ YouTube secondary column found via observer!");
      injectKnuggetPanel(secondaryColumn);
      observer.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["id", "class"],
  });

  let attempts = 0;
  const maxAttempts = 60;

  const periodicCheck = setInterval(() => {
    attempts++;
    const secondaryColumn = document.getElementById("secondary");

    if (secondaryColumn && !knuggetPanel) {
      console.log("✅ YouTube secondary column found via periodic check!");
      injectKnuggetPanel(secondaryColumn);
      clearInterval(periodicCheck);
      observer.disconnect();
      return;
    }

    if (attempts >= maxAttempts) {
      console.log("⏱️ Max attempts reached, stopping observation");
      clearInterval(periodicCheck);
      observer.disconnect();

      // FIXED: Show error if panel injection fails
      showGlobalNotification({
        type: 'error',
        message: 'Failed to load Knugget panel. Please refresh the page.',
        showRetry: true,
        retryCallback: () => {
          location.reload();
        }
      });
    }
  }, 500);
}

function injectKnuggetPanel(secondaryColumn: HTMLElement): void {
  console.log("Knugget AI: Injecting panel with professional styling");

  const panelContainer = document.createElement("div");
  panelContainer.id = "knugget-container";
  panelContainer.className = "knugget-extension";

  panelContainer.innerHTML = `
    <div class="knugget-box">
      <div class="knugget-header">
        <div style="display: flex; align-items: center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
            <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="#00a8ff"/>
          </svg>
          <span class="knugget-logo">Knugget</span>
        </div>
        
        <div class="knugget-credits">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 6px;">
            <path d="M20 6H4V18H20V6Z" fill="#00a8ff"/>
          </svg>
          <span id="credits-display">3 Free Credits Left</span>
        </div>
      </div>
      
      <div class="knugget-tabs">
        <button id="transcript-tab" class="knugget-tab knugget-tab-active">
          View Transcript
        </button>
        <button id="summary-tab" class="knugget-tab knugget-tab-inactive">
          View Key Takeaways
        </button>
      </div>
      
      <div class="knugget-content">
        <div id="transcript-content" class="knugget-content-inner">
          <!-- Transcript will be loaded here -->
        </div>
        
        <div id="summary-content" class="knugget-content-inner" style="display: none;">
          <!-- Summary will be loaded here -->
        </div>
      </div>
      
      <div class="knugget-actions">
        <button id="save-btn" class="knugget-save-btn" style="display: none;">Save</button>
        <button id="dashboard-btn" class="knugget-dashboard-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          Dashboard
        </button>
      </div>
      
      <!-- FIXED: Notification container -->
      <div id="knugget-notifications" class="knugget-notifications"></div>
    </div>
  `;

  secondaryColumn.insertBefore(panelContainer, secondaryColumn.firstChild);
  knuggetPanel = panelContainer;
  setupPanelEventListeners();
  loadAndDisplayTranscript();
}

function setupPanelEventListeners(): void {
  if (!knuggetPanel) return;

  const transcriptTab = knuggetPanel.querySelector("#transcript-tab");
  const summaryTab = knuggetPanel.querySelector("#summary-tab");
  const transcriptContent = knuggetPanel.querySelector("#transcript-content");
  const summaryContent = knuggetPanel.querySelector("#summary-content");
  const saveButton = knuggetPanel.querySelector("#save-btn");

  transcriptTab?.addEventListener("click", () => {
    switchToTranscriptTab(transcriptTab, summaryTab, transcriptContent, summaryContent, saveButton);
  });

  summaryTab?.addEventListener("click", () => {
    switchToSummaryTab(transcriptTab, summaryTab, transcriptContent, summaryContent, saveButton);
  });

  const dashboardBtn = knuggetPanel.querySelector("#dashboard-btn");
  dashboardBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  });
}

// FIXED: Enhanced tab switching with error handling
function switchToTranscriptTab(transcriptTab: Element, summaryTab: Element | null, transcriptContent: Element | null, summaryContent: Element | null, saveButton: Element | null): void {
  try {
    transcriptTab.classList.remove("knugget-tab-inactive");
    transcriptTab.classList.add("knugget-tab-active");
    summaryTab?.classList.remove("knugget-tab-active");
    summaryTab?.classList.add("knugget-tab-inactive");

    if (transcriptContent) (transcriptContent as HTMLElement).style.display = "block";
    if (summaryContent) (summaryContent as HTMLElement).style.display = "none";
    if (saveButton) (saveButton as HTMLElement).style.display = "none";

    loadAndDisplayTranscript();
  } catch (error) {
    console.error("❌ Error switching to transcript tab:", error);
    showNotification("Failed to switch to transcript tab", { type: 'error' });
  }
}

function switchToSummaryTab(transcriptTab: Element | null, summaryTab: Element, transcriptContent: Element | null, summaryContent: Element | null, saveButton: Element | null): void {
  try {
    summaryTab.classList.remove("knugget-tab-inactive");
    summaryTab.classList.add("knugget-tab-active");
    transcriptTab?.classList.remove("knugget-tab-active");
    transcriptTab?.classList.add("knugget-tab-inactive");

    if (summaryContent) (summaryContent as HTMLElement).style.display = "block";
    if (transcriptContent) (transcriptContent as HTMLElement).style.display = "none";
    if (saveButton) (saveButton as HTMLElement).style.display = "block";

    loadAndDisplaySummary();
  } catch (error) {
    console.error("❌ Error switching to summary tab:", error);
    showNotification("Failed to switch to summary tab", { type: 'error' });
  }
}

// FIXED: Enhanced transcript loading with comprehensive error handling
async function loadAndDisplayTranscript(): Promise<void> {
  const transcriptContent = document.getElementById("transcript-content");
  if (!transcriptContent) return;

  showLoading(transcriptContent, "Loading Transcript");

  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const transcriptResponse = await transcriptService.extractTranscript();

    if (!transcriptResponse.success || !transcriptResponse.data) {
      throw new Error(transcriptResponse.error || "Failed to extract transcript");
    }

    const segments = transcriptResponse.data;

    if (segments.length === 0) {
      showEmptyState(transcriptContent, "No transcript available", "This video doesn't have captions or transcript data.");
      return;
    }

    const segmentsHTML = segments
      .map(
        (segment) => `
      <div class="transcript-segment">
        <span class="knugget-timestamp">${segment.timestamp}</span>
        <span class="knugget-transcript-text">${segment.text}</span>
      </div>
    `
      )
      .join("");

    transcriptContent.innerHTML = `
      <div class="space-y-2 p-2">
        ${segmentsHTML}
      </div>
    `;

    const videoId = getVideoId();
    console.log(`✅ Transcript loaded successfully for video ID: ${videoId}`);

    errorState.retryCount = 0; // Reset retry count on success

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("❌ Transcript extraction error:", errorMessage);

    errorState.lastError = errorMessage;
    errorState.retryCount++;

    showError(transcriptContent, errorMessage, () => {
      if (errorState.retryCount < errorState.maxRetries) {
        loadAndDisplayTranscript();
      } else {
        showNotification("Maximum retry attempts reached. Please refresh the page.", { type: 'error' });
      }
    });
  }
}

// FIXED: Complete summary generation with error handling
async function loadAndDisplaySummary(): Promise<void> {
  const summaryContent = document.getElementById("summary-content");
  if (!summaryContent) return;

  if (!authState.isAuthenticated) {
    showLoginRequired(summaryContent);
    return;
  }

  // Check if user has sufficient credits
  if (authState.user && authState.user.credits <= 0) {
    showInsufficientCredits(summaryContent);
    return;
  }

  showLoading(summaryContent, "Generating AI Summary", "This may take 15-30 seconds...");

  try {
    // Get transcript first
    const transcriptResponse = await transcriptService.extractTranscript();

    if (!transcriptResponse.success || !transcriptResponse.data) {
      throw new Error("Cannot generate summary: No transcript available for this video");
    }

    // Get video metadata
    const videoMetadata = getVideoMetadata();
    if (!videoMetadata) {
      throw new Error("Cannot generate summary: Unable to get video information");
    }

    // Generate summary via API
    const summaryResponse = await apiService.generateSummary(
      transcriptResponse.data,
      videoMetadata,
      authState.user?.id || ''
    );

    if (!summaryResponse.success || !summaryResponse.data) {
      // Handle specific error cases
      if (summaryResponse.error?.includes('Insufficient credits')) {
        showInsufficientCredits(summaryContent);
        return;
      }

      if (summaryResponse.error?.includes('rate limit')) {
        showRateLimited(summaryContent);
        return;
      }

      throw new Error(summaryResponse.error || "Failed to generate summary");
    }

    // Display the generated summary
    displaySummary(summaryContent, summaryResponse.data);

    // Update user credits in UI
    if (authState.user) {
      authState.user.credits = Math.max(0, authState.user.credits - 1);
      updateCreditsDisplay(authState.user.credits);
    }

    console.log("✅ Summary generated successfully");
    showNotification("Summary generated successfully!", { type: 'success' });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("❌ Summary generation error:", errorMessage);

    showError(summaryContent, errorMessage, () => {
      loadAndDisplaySummary();
    });

    showNotification(`Failed to generate summary: ${errorMessage}`, {
      type: 'error',
      showRetry: true,
      retryCallback: () => loadAndDisplaySummary()
    });
  }
}

// FIXED: Display summary with save functionality
function displaySummary(summaryContent: HTMLElement, summary: Summary): void {
  const keyPointsHTML = summary.keyPoints
    .map(point => `<li class="knugget-key-point">• ${point}</li>`)
    .join("");

  const tagsHTML = summary.tags
    ? summary.tags.map(tag => `<span class="knugget-tag">#${tag}</span>`).join("")
    : "";

  summaryContent.innerHTML = `
    <div class="knugget-summary">
      <div class="knugget-summary-section">
        <h4 class="knugget-section-title">🎯 Key Points</h4>
        <ul class="knugget-key-points">
          ${keyPointsHTML}
        </ul>
      </div>
      
      <div class="knugget-summary-section">
        <h4 class="knugget-section-title">📝 Full Summary</h4>
        <div class="knugget-full-summary">
          ${summary.fullSummary}
        </div>
      </div>
      
      ${summary.tags && summary.tags.length > 0 ? `
        <div class="knugget-summary-section">
          <h4 class="knugget-section-title">🏷️ Tags</h4>
          <div class="knugget-tags">
            ${tagsHTML}
          </div>
        </div>
      ` : ''}
      
      <div class="knugget-summary-actions">
        <button id="save-summary-btn" class="knugget-save-btn">
          💾 Save Summary
        </button>
        <button id="copy-summary-btn" class="knugget-secondary-btn">
          📋 Copy
        </button>
      </div>
    </div>
  `;

  // Add event listeners for summary actions
  const saveBtn = summaryContent.querySelector("#save-summary-btn");
  const copyBtn = summaryContent.querySelector("#copy-summary-btn");

  saveBtn?.addEventListener("click", () => saveSummary(summary));
  copyBtn?.addEventListener("click", () => copySummaryToClipboard(summary));
}

// FIXED: Save summary with error handling
async function saveSummary(summary: Summary): Promise<void> {
  try {
    if (!authState.isAuthenticated || !authState.user) {
      showNotification("Please sign in to save summaries", { type: 'error' });
      return;
    }

    showNotification("Saving summary...", { type: 'info' });

    const result = await apiService.saveSummary(summary, authState.user.id);

    if (result.success) {
      showNotification("Summary saved successfully!", { type: 'success' });
    } else {
      throw new Error(result.error || "Failed to save summary");
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Save summary error:", errorMessage);
    showNotification(`Failed to save summary: ${errorMessage}`, {
      type: 'error',
      showRetry: true,
      retryCallback: () => saveSummary(summary)
    });
  }
}

// FIXED: Copy summary to clipboard
async function copySummaryToClipboard(summary: Summary): Promise<void> {
  try {
    const summaryText = `
🎯 Key Points:
${summary.keyPoints.map(point => `• ${point}`).join('\n')}

📝 Full Summary:
${summary.fullSummary}

${summary.tags && summary.tags.length > 0 ? `🏷️ Tags:
${summary.tags.map(tag => `#${tag}`).join(' ')}` : ''}

Generated by Knugget AI
`;

    await navigator.clipboard.writeText(summaryText.trim());
    showNotification("Summary copied to clipboard!", { type: 'success' });

  } catch (error) {
    console.error("❌ Copy to clipboard failed:", error);
    showNotification("Failed to copy summary", { type: 'error' });
  }
}

// FIXED: Enhanced loading state
function showLoading(element: HTMLElement, message: string = "Loading", subMessage?: string): void {
  element.innerHTML = `
    <div class="knugget-loading">
      <div class="knugget-spinner"></div>
      <p class="knugget-loading-message">${message}</p>
      ${subMessage ? `<p class="knugget-loading-submessage">${subMessage}</p>` : ''}
    </div>
  `;
}

// FIXED: Enhanced error display with retry options
function showError(element: HTMLElement, message: string, retryFn?: () => void): void {
  element.innerHTML = `
    <div class="knugget-error">
      <div class="knugget-error-icon">⚠️</div>
      <h4 class="knugget-error-title">Something went wrong</h4>
      <p class="knugget-error-message">${message}</p>
      <div class="knugget-error-actions">
        ${retryFn ? '<button id="retry-btn" class="knugget-retry-btn">🔄 Try Again</button>' : ''}
        <button id="refresh-btn" class="knugget-secondary-btn">🔄 Refresh Page</button>
      </div>
    </div>
  `;

  if (retryFn) {
    const retryBtn = element.querySelector("#retry-btn");
    retryBtn?.addEventListener("click", retryFn);
  }

  const refreshBtn = element.querySelector("#refresh-btn");
  refreshBtn?.addEventListener("click", () => {
    location.reload();
  });
}

// FIXED: Empty state display
function showEmptyState(element: HTMLElement, title: string, message: string): void {
  element.innerHTML = `
    <div class="knugget-empty">
      <div class="knugget-empty-icon">📄</div>
      <h4 class="knugget-empty-title">${title}</h4>
      <p class="knugget-empty-message">${message}</p>
    </div>
  `;
}

// FIXED: Insufficient credits display
function showInsufficientCredits(element: HTMLElement): void {
  element.innerHTML = `
    <div class="knugget-error">
      <div class="knugget-error-icon">💳</div>
      <h4 class="knugget-error-title">Insufficient Credits</h4>
      <p class="knugget-error-message">You don't have enough credits to generate a summary.</p>
      <div class="knugget-error-actions">
        <button id="upgrade-btn" class="knugget-primary-btn">⭐ Upgrade Plan</button>
        <button id="dashboard-credits-btn" class="knugget-secondary-btn">📊 View Dashboard</button>
      </div>
    </div>
  `;

  const upgradeBtn = element.querySelector("#upgrade-btn");
  const dashboardBtn = element.querySelector("#dashboard-credits-btn");

  upgradeBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_UPGRADE_PAGE" });
  });

  dashboardBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  });
}

// FIXED: Rate limited display
function showRateLimited(element: HTMLElement): void {
  element.innerHTML = `
    <div class="knugget-error">
      <div class="knugget-error-icon">⏱️</div>
      <h4 class="knugget-error-title">Rate Limited</h4>
      <p class="knugget-error-message">You've made too many requests. Please wait a moment and try again.</p>
      <div class="knugget-error-actions">
        <button id="wait-retry-btn" class="knugget-secondary-btn">⏳ Try Again in 30s</button>
      </div>
    </div>
  `;

  const retryBtn = element.querySelector("#wait-retry-btn");
  retryBtn?.addEventListener("click", (e) => {
    const button = e.target as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "⏳ Please wait...";

    setTimeout(() => {
      loadAndDisplaySummary();
    }, 30000);
  });
}

function showLoginRequired(element: HTMLElement): void {
  element.innerHTML = `
    <div class="knugget-login-required">
      <div class="knugget-auth-icon">🔐</div>
      <h4 class="knugget-auth-title">Sign in Required</h4>
      <p class="knugget-auth-message">Please sign in to generate AI summaries</p>
      <div class="knugget-auth-actions">
        <button id="login-btn" class="knugget-primary-btn">🚀 Sign In</button>
      </div>
    </div>
  `;

  const loginBtn = element.querySelector("#login-btn");
  loginBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({
      type: "OPEN_LOGIN_PAGE",
      payload: { url: window.location.href }
    });
  });
}

// FIXED: Notification system
function showNotification(message: string, options: NotificationOptions): void {
  const notificationContainer = document.getElementById("knugget-notifications");
  if (!notificationContainer) {
    // Create container if it doesn't exist
    createNotificationContainer();
    return showNotification(message, options);
  }

  const notification = document.createElement("div");
  notification.className = `knugget-notification knugget-notification-${options.type}`;

  notification.innerHTML = `
    <div class="knugget-notification-content">
      <span class="knugget-notification-message">${message}</span>
      ${options.showRetry ? '<button class="knugget-notification-retry">Retry</button>' : ''}
      <button class="knugget-notification-close">✕</button>
    </div>
  `;

  // Add event listeners
  const closeBtn = notification.querySelector(".knugget-notification-close");
  closeBtn?.addEventListener("click", () => {
    notification.remove();
  });

  if (options.showRetry && options.retryCallback) {
    const retryBtn = notification.querySelector(".knugget-notification-retry");
    retryBtn?.addEventListener("click", () => {
      notification.remove();
      options.retryCallback?.();
    });
  }

  notificationContainer.appendChild(notification);

  // Auto-remove after duration
  const duration = options.duration || (options.type === 'error' ? 8000 : 4000);
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, duration);
}

// FIXED: Global notification for critical errors
function showGlobalNotification(options: NotificationOptions & { message: string }): void {
  const globalNotification = document.createElement("div");
  globalNotification.className = `knugget-global-notification knugget-global-notification-${options.type}`;
  globalNotification.style.position = "fixed";
  globalNotification.style.top = "20px";
  globalNotification.style.right = "20px";
  globalNotification.style.zIndex = "999999";
  globalNotification.style.maxWidth = "400px";

  globalNotification.innerHTML = `
    <div class="knugget-notification-content">
      <div class="knugget-notification-header">
        <strong>Knugget AI</strong>
        <button class="knugget-notification-close">✕</button>
      </div>
      <div class="knugget-notification-body">
        ${options.message}
        ${options.showRetry ? '<button class="knugget-notification-retry">Retry</button>' : ''}
      </div>
    </div>
  `;

  const closeBtn = globalNotification.querySelector(".knugget-notification-close");
  closeBtn?.addEventListener("click", () => {
    globalNotification.remove();
  });

  if (options.showRetry && options.retryCallback) {
    const retryBtn = globalNotification.querySelector(".knugget-notification-retry");
    retryBtn?.addEventListener("click", () => {
      globalNotification.remove();
      options.retryCallback?.();
    });
  }

  document.body.appendChild(globalNotification);

  setTimeout(() => {
    if (globalNotification.parentNode) {
      globalNotification.remove();
    }
  }, options.duration || 10000);
}

function createNotificationContainer(): void {
  if (knuggetPanel && !document.getElementById("knugget-notifications")) {
    const container = document.createElement("div");
    container.id = "knugget-notifications";
    container.className = "knugget-notifications";
    knuggetPanel.appendChild(container);
  }
}

// FIXED: Enhanced error handling setup
function setupErrorHandling(): void {
  // Global error handler
  window.addEventListener('error', (event) => {
    console.error("❌ Global error:", event.error);
    showNotification("An unexpected error occurred", { type: 'error' });
  });

  // Promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    console.error("❌ Unhandled promise rejection:", event.reason);
    showNotification("An unexpected error occurred", { type: 'error' });
  });

  // Chrome extension error handler
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      handleChromeMessage(message, sender, sendResponse);
    } catch (error) {
      console.error("❌ Error handling Chrome message:", error);
      sendResponse({ success: false, error: "Message handling failed" });
    }
    return true;
  });
}

// FIXED: Enhanced Chrome message handling with error recovery
function handleChromeMessage(message: any, sender: any, sendResponse: Function): void {
  console.log("📨 Content script received message:", message);

  switch (message.type) {
    case "AUTH_STATUS_CHANGED":
      handleAuthStatusChanged(message.data);
      sendResponse({ received: true });
      break;

    case "AUTH_FAILURE":
      handleAuthFailure(message.data);
      sendResponse({ received: true });
      break;

    case "LOGOUT":
      handleLogout();
      sendResponse({ received: true });
      break;

    case "SHOW_NOTIFICATION":
      showNotification(message.data.message, {
        type: message.data.type || 'info',
        duration: message.data.duration
      });
      sendResponse({ received: true });
      break;

    case "RETRY_FAILED_REQUEST":
      handleRetryRequest(message.data);
      sendResponse({ received: true });
      break;

    default:
      console.warn("Unknown message type:", message.type);
      sendResponse({ received: false, error: "Unknown message type" });
  }
}

// FIXED: Handle auth status changes with error recovery
function handleAuthStatusChanged(data: any): void {
  try {
    console.log("🔄 Auth status changed:", data);

    if (data?.isAuthenticated && data?.user) {
      authState.isAuthenticated = true;
      authState.user = data.user;

      updateCreditsDisplay(data.user.credits);

      // Refresh summary content if it's currently displayed
      const summaryContent = document.getElementById("summary-content");
      if (summaryContent && summaryContent.style.display !== "none") {
        // Clear any login required messages
        if (summaryContent.innerHTML.includes("Sign in Required")) {
          loadAndDisplaySummary();
        }
      }

      showNotification("Successfully signed in!", { type: 'success' });

    } else {
      authState.isAuthenticated = false;
      authState.user = null;
      updateCreditsDisplay(0);

      // Show login required if summary tab is active
      const summaryContent = document.getElementById("summary-content");
      if (summaryContent && summaryContent.style.display !== "none") {
        showLoginRequired(summaryContent);
      }
    }
  } catch (error) {
    console.error("❌ Error handling auth status change:", error);
    showNotification("Error updating authentication status", { type: 'error' });
  }
}

// FIXED: Handle authentication failures
function handleAuthFailure(data: any): void {
  try {
    console.log("🚪 Authentication failure:", data);

    authState.isAuthenticated = false;
    authState.user = null;
    updateCreditsDisplay(0);

    const reason = data?.reason || "Authentication failed";
    showNotification(`${reason}. Please sign in again.`, {
      type: 'error',
      duration: 6000,
      showRetry: true,
      retryCallback: () => {
        chrome.runtime.sendMessage({
          type: "OPEN_LOGIN_PAGE",
          payload: { url: window.location.href }
        });
      }
    });

    // Update UI to show login required
    const summaryContent = document.getElementById("summary-content");
    if (summaryContent && summaryContent.style.display !== "none") {
      showLoginRequired(summaryContent);
    }

  } catch (error) {
    console.error("❌ Error handling auth failure:", error);
  }
}

// FIXED: Handle logout with cleanup
function handleLogout(): void {
  try {
    console.log("🚪 User logged out");

    authState.isAuthenticated = false;
    authState.user = null;
    updateCreditsDisplay(0);

    // Clear any cached data
    errorState = { lastError: null, retryCount: 0, maxRetries: 3 };

    // Show login required if summary tab is active
    const summaryContent = document.getElementById("summary-content");
    if (summaryContent && summaryContent.style.display !== "none") {
      showLoginRequired(summaryContent);
    }

    showNotification("Successfully signed out", { type: 'info' });

  } catch (error) {
    console.error("❌ Error handling logout:", error);
  }
}

// FIXED: Handle retry requests
function handleRetryRequest(data: any): void {
  try {
    const { action, params } = data;

    switch (action) {
      case 'transcript':
        loadAndDisplayTranscript();
        break;
      case 'summary':
        loadAndDisplaySummary();
        break;
      case 'auth':
        initializeAuthState();
        break;
      default:
        console.warn("Unknown retry action:", action);
    }
  } catch (error) {
    console.error("❌ Error handling retry request:", error);
    showNotification("Retry failed. Please try again.", { type: 'error' });
  }
}

function setupURLChangeDetection(): void {
  let lastUrl = window.location.href;

  const handleURLChange = debounce(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("🔄 YouTube navigation detected:", currentUrl);

      if (isYouTubeWatchPage()) {
        const videoId = getVideoId();
        if (videoId !== currentVideoId) {
          console.log(`Navigation to new video detected: ${videoId}`);
          processCurrentPage(videoId);
        }
      } else {
        cleanup();
      }
    }
  }, 300);

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(handleURLChange, 100);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleURLChange, 100);
  };

  window.addEventListener("popstate", handleURLChange);

  document.addEventListener("yt-navigate-finish", () => {
    console.log("YouTube navigation detected via yt-navigate-finish event");
    setTimeout(handleURLChange, 200);
  });

  document.addEventListener("yt-navigate-start", () => {
    console.log("YouTube navigation starting via yt-navigate-start event");
  });

  document.addEventListener("yt-page-data-updated", () => {
    console.log("YouTube page data updated");
    setTimeout(handleURLChange, 100);
  });
}

// FIXED: Enhanced auth refresh listener
function setupAuthRefreshListener(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("📨 Content script received message:", message);

    switch (message.type) {
      case "AUTH_STATUS_CHANGED":
        console.log("🔄 Auth status changed:", message.data);
        if (message.data?.isAuthenticated && message.data?.user) {
          authState.isAuthenticated = true;
          authState.user = message.data.user;

          // Update credits display
          updateCreditsDisplay(message.data.user.credits);

          // Refresh summary content if it's currently displayed
          const summaryContent = document.getElementById("summary-content");
          if (summaryContent && summaryContent.style.display !== "none") {
            loadAndDisplaySummary();
          }
        } else {
          authState.isAuthenticated = false;
          authState.user = null;
          updateCreditsDisplay(0);
        }
        break;

      case "LOGOUT":
        console.log("🚪 User logged out");
        authState.isAuthenticated = false;
        authState.user = null;
        updateCreditsDisplay(0);

        // Show login required if summary tab is active
        const summaryContent = document.getElementById("summary-content");
        if (summaryContent && summaryContent.style.display !== "none") {
          showLoginRequired(summaryContent);
        }
        break;
    }

    sendResponse({ received: true });
    return true;
  });
}

function updateCreditsDisplay(credits: number): void {
  const creditsDisplay = document.getElementById("credits-display");
  if (creditsDisplay) {
    creditsDisplay.textContent = `${credits} Credits Left`;
  }
}

function initializeAuthState(): void {
  // Get initial auth state from background
  chrome.runtime.sendMessage({ type: "CHECK_AUTH_STATUS" })
    .then((response) => {
      if (response?.isAuthenticated && response?.user) {
        authState.isAuthenticated = true;
        authState.user = response.user;
        updateCreditsDisplay(response.user.credits || 0);
        console.log("✅ Auth state initialized: Authenticated");
      } else {
        authState.isAuthenticated = false;
        authState.user = null;
        updateCreditsDisplay(0);
        console.log("ℹ️ Auth state initialized: Not authenticated");
      }
    })
    .catch((error) => {
      console.log("❌ Failed to get auth state:", error);
      authState.isAuthenticated = false;
      authState.user = null;
      updateCreditsDisplay(0);
    });
}

function resetContentData(): void {
  console.log("Content data reset for new video");
}

function removeExistingPanel(): void {
  const existingPanel = document.getElementById("knugget-container");
  if (existingPanel) {
    existingPanel.remove();
    knuggetPanel = null;
  }
}

function cleanup(): void {
  removeExistingPanel();
  currentVideoId = null;
  console.log("Cleanup completed - navigated away from watch page");
}

function initializeWhenReady(): void {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    console.log("DOM ready, initializing immediately");
    initializeKnuggetExtension();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.log("DOMContentLoaded fired, initializing");
      initializeKnuggetExtension();
    });
  }

  setTimeout(() => {
    if (!isInitialized) {
      console.log("Fallback initialization triggered");
      initializeKnuggetExtension();
      isInitialized = true;
    }
  }, 1000);

  if (window.location.hostname.includes("youtube.com")) {
    const checkYouTubeReady = () => {
      if (document.querySelector("#secondary") || document.querySelector("ytd-app")) {
        console.log("YouTube app detected, initializing");
        initializeKnuggetExtension();
      } else {
        setTimeout(checkYouTubeReady, 500);
      }
    };
    setTimeout(checkYouTubeReady, 100);
  }
}

console.log("Knugget content script loaded and ready");
initializeWhenReady();
