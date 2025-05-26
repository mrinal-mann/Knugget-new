// content.ts - Fixed main content script matching old version's initialization pattern
import "./styles.css";
import { transcriptService } from "./services/transcript";
import { apiService } from "./services/api";
import { authService } from "./services/auth";
import {
  ExtensionState,
  MessageType,
  VideoMetadata,
  TranscriptSegment,
  Summary,
  User,
} from "./types";
import {
  getVideoId,
  getVideoMetadata,
  waitForElement,
  debounce,
} from "./utils/dom";
import { config } from "./config";

// Global state and tracking variables
let currentVideoId: string | null = null;
let knuggetPanel: HTMLElement | null = null;
let isInitialized = false;
let authState = {
  isAuthenticated: false,
  user: null as User | null,
};

// Main initialization function - matches old version's direct approach
function initializeKnuggetExtension(): void {
  console.log("🎯 Knugget Extension initializing...");
  
  // Check if we're on a YouTube watch page
  if (!isYouTubeWatchPage()) {
    console.log("Not on YouTube watch page, setting up navigation listener...");
    setupNavigationListener();
    return;
  }

  const videoId = getVideoId();
  console.log(`Initializing Knugget AI for video ID: ${videoId}`);

  // Set up URL change detection for YouTube's SPA navigation
  if (!isInitialized) {
    setupURLChangeDetection();
    console.log("Knugget AI: Setting up URL change detection");
    isInitialized = true;
  }

  // Set up auth refresh listener
  setupAuthRefreshListener();
  console.log("Setting up auth refresh listener");

  // Process the current page
  processCurrentPage(videoId);
}

// Check if current page is a YouTube watch page
function isYouTubeWatchPage(): boolean {
  return window.location.pathname === "/watch" && !!getVideoId();
}

// Process current YouTube page and inject panel
function processCurrentPage(videoId: string | null): void {
  console.log(`Knugget AI: Processing page for video ID ${videoId}`);

  // Update current video ID tracking
  if (currentVideoId !== videoId) {
    currentVideoId = videoId;
    resetContentData();
    console.log("Resetting content data for new video");
  }

  // Send page loaded message to background script
  chrome.runtime.sendMessage({
    type: "PAGE_LOADED",
    payload: { url: window.location.href, videoId },
  });

  // Remove existing panel if present
  removeExistingPanel();

  // Start observing DOM for YouTube's secondary column
  observeForSecondaryColumn();
  console.log("Knugget AI: Observing DOM for secondary column");

  // Initialize auth state
  initializeAuthState();
}

// Observe DOM for YouTube's secondary column and inject panel when found
function observeForSecondaryColumn(): void {
  // Check if secondary column already exists
  const secondaryColumn = document.getElementById("secondary");
  if (secondaryColumn) {
    injectKnuggetPanel(secondaryColumn);
    return;
  }

  // Create mutation observer to watch for secondary column
  const observer = new MutationObserver((mutations) => {
    const secondaryColumn = document.getElementById("secondary");
    if (secondaryColumn && !knuggetPanel) {
      console.log("✅ YouTube secondary column found!");
      injectKnuggetPanel(secondaryColumn);
      observer.disconnect();
    }
  });

  // Start observing document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Cleanup observer after 30 seconds to prevent memory leaks
  setTimeout(() => {
    observer.disconnect();
    console.log("⏱️ DOM observer timeout reached");
  }, 30000);
}

// Inject Knugget panel into YouTube's secondary column
function injectKnuggetPanel(secondaryColumn: HTMLElement): void {
  console.log("Knugget AI: Injecting panel with professional styling");

  // Create panel container
  const panelContainer = document.createElement("div");
  panelContainer.id = "knugget-container";
  panelContainer.className = "knugget-extension";

  // Create panel HTML structure matching old version
  panelContainer.innerHTML = `
    <div class="knugget-box">
      <!-- Header with logo and credits -->
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
      
      <!-- Tab Navigation -->
      <div class="knugget-tabs">
        <button id="transcript-tab" class="knugget-tab knugget-tab-active">
          View Transcript
        </button>
        <button id="summary-tab" class="knugget-tab knugget-tab-inactive">
          View Key Takeaways
        </button>
      </div>
      
      <!-- Content Area -->
      <div class="knugget-content">
        <div id="transcript-content" class="knugget-content-inner">
          <!-- Transcript will be loaded here -->
        </div>
        
        <div id="summary-content" class="knugget-content-inner" style="display: none;">
          <!-- Summary will be loaded here -->
        </div>
      </div>
      
      <!-- Action buttons -->
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
    </div>
  `;

  // Insert panel at the beginning of secondary column
  secondaryColumn.insertBefore(panelContainer, secondaryColumn.firstChild);
  knuggetPanel = panelContainer;

  // Set up panel event listeners
  setupPanelEventListeners();

  // Load transcript by default
  loadAndDisplayTranscript();
  console.log("Knugget AI: Loading and displaying transcript");

  // Check for video ID changes
  const videoId = getVideoId();
  if (currentVideoId !== videoId) {
    console.log(`Video ID changed from ${currentVideoId} to ${videoId}`);
    currentVideoId = videoId;
    resetContentData();
  }
}

// Set up event listeners for panel interactions
function setupPanelEventListeners(): void {
  if (!knuggetPanel) return;

  // Tab switching
  const transcriptTab = knuggetPanel.querySelector("#transcript-tab");
  const summaryTab = knuggetPanel.querySelector("#summary-tab");
  const transcriptContent = knuggetPanel.querySelector("#transcript-content");
  const summaryContent = knuggetPanel.querySelector("#summary-content");
  const saveButton = knuggetPanel.querySelector("#save-btn");

  transcriptTab?.addEventListener("click", () => {
    // Update tab styling
    transcriptTab.classList.remove("knugget-tab-inactive");
    transcriptTab.classList.add("knugget-tab-active");
    summaryTab?.classList.remove("knugget-tab-active");
    summaryTab?.classList.add("knugget-tab-inactive");

    // Show transcript, hide summary
    if (transcriptContent) (transcriptContent as HTMLElement).style.display = "block";
    if (summaryContent) (summaryContent as HTMLElement).style.display = "none";
    if (saveButton) (saveButton as HTMLElement).style.display = "none";

    loadAndDisplayTranscript();
  });

  summaryTab?.addEventListener("click", () => {
    // Update tab styling
    summaryTab.classList.remove("knugget-tab-inactive");
    summaryTab.classList.add("knugget-tab-active");
    transcriptTab?.classList.remove("knugget-tab-active");
    transcriptTab?.classList.add("knugget-tab-inactive");

    // Show summary, hide transcript
    if (summaryContent) (summaryContent as HTMLElement).style.display = "block";
    if (transcriptContent) (transcriptContent as HTMLElement).style.display = "none";
    if (saveButton) (saveButton as HTMLElement).style.display = "block";

    loadAndDisplaySummary();
  });

  // Dashboard button
  const dashboardBtn = knuggetPanel.querySelector("#dashboard-btn");
  dashboardBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  });
}

// Load and display transcript from YouTube video
async function loadAndDisplayTranscript(): Promise<void> {
  const transcriptContent = document.getElementById("transcript-content");
  if (!transcriptContent) return;

  // Show loading state
  showLoading(transcriptContent, "Loading Transcript");

  try {
    // Add delay to ensure YouTube has fully loaded
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract transcript
    const transcriptResponse = await transcriptService.extractTranscript();

    if (!transcriptResponse.success || !transcriptResponse.data) {
      throw new Error(transcriptResponse.error || "Failed to extract transcript");
    }

    // Display transcript segments
    const segments = transcriptResponse.data;
    const segmentsHTML = segments.map(segment => `
      <div class="transcript-segment">
        <span class="knugget-timestamp">${segment.timestamp}</span>
        <span class="knugget-transcript-text">${segment.text}</span>
      </div>
    `).join('');

    transcriptContent.innerHTML = `
      <div class="space-y-2 p-2">
        ${segmentsHTML}
      </div>
    `;

    const videoId = getVideoId();
    console.log(`Transcript loaded successfully for video ID: ${videoId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Transcript extraction error:", errorMessage);
    showError(transcriptContent, errorMessage, loadAndDisplayTranscript);
  }
}

// Load and display AI-generated summary
async function loadAndDisplaySummary(): Promise<void> {
  const summaryContent = document.getElementById("summary-content");
  if (!summaryContent) return;

  // Check authentication first
  if (!authState.isAuthenticated) {
    showLoginRequired(summaryContent);
    return;
  }

  showLoading(summaryContent, "Generating Summary");

  try {
    // Implementation for summary generation would go here
    // For now, show placeholder
    summaryContent.innerHTML = `
      <div class="summary-placeholder">
        <p>Summary generation will be implemented here</p>
      </div>
    `;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Summary generation error:", errorMessage);
    showError(summaryContent, errorMessage, loadAndDisplaySummary);
  }
}

// Show loading state in content area
function showLoading(element: HTMLElement, message: string = "Loading"): void {
  element.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; padding: 40px;">
      <div class="knugget-spinner" style="margin-bottom: 20px;"></div>
      <p style="color: #ffffff; font-weight: 600;">${message}</p>
      <p style="color: #aaaaaa; font-size: 14px;">Please wait...</p>
    </div>
  `;
}

// Show error state with retry option
function showError(element: HTMLElement, message: string, retryFn?: () => void): void {
  element.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; padding: 40px; text-align: center;">
      <div style="margin-bottom: 20px; color: #ff5757;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p style="color: #ffffff; margin-bottom: 8px;">Error</p>
      <p style="color: #aaaaaa; margin-bottom: 20px;">${message}</p>
      ${retryFn ? '<button id="retry-btn" class="btn btn-primary">Try Again</button>' : ''}
    </div>
  `;

  if (retryFn) {
    const retryBtn = element.querySelector("#retry-btn");
    retryBtn?.addEventListener("click", retryFn);
  }
}

// Show login required state
function showLoginRequired(element: HTMLElement): void {
  element.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; padding: 40px; text-align: center;">
      <div style="margin-bottom: 20px; color: #00a8ff;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <p style="color: #ffffff; margin-bottom: 8px;">Login Required</p>
      <p style="color: #aaaaaa; margin-bottom: 20px;">Please log in to generate summaries</p>
      <button id="login-btn" class="btn btn-primary">Log In</button>
    </div>
  `;

  const loginBtn = element.querySelector("#login-btn");
  loginBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_LOGIN_PAGE" });
  });
}

// Set up URL change detection for YouTube's SPA navigation
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
  }, 500);

  // Override history methods to catch programmatic navigation
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

  // Listen for back/forward navigation
  window.addEventListener("popstate", handleURLChange);

  // Listen for YouTube's custom navigation event
  document.addEventListener("yt-navigate-finish", () => {
    console.log("YouTube navigation detected via yt-navigate-finish event");
    setTimeout(handleURLChange, 300);
  });
}

// Set up navigation listener for non-watch pages
function setupNavigationListener(): void {
  const checkForWatchPage = debounce(() => {
    if (isYouTubeWatchPage()) {
      initializeKnuggetExtension();
    }
  }, 500);

  // Listen for YouTube navigation events
  document.addEventListener("yt-navigate-finish", checkForWatchPage);
  window.addEventListener("popstate", checkForWatchPage);
}

// Set up auth refresh listener for external login
function setupAuthRefreshListener(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "REFRESH_AUTH_STATE") {
      console.log("Received auth refresh message:", message);

      if (message.payload?.forceCheck) {
        chrome.runtime.sendMessage({ type: "FORCE_CHECK_WEBSITE_LOGIN" }, () => {
          console.log("Forced website login check after external auth refresh");
          
          // Update auth state
          chrome.storage.local.get(["knuggetUserInfo"], (result) => {
            const isLoggedIn = !!(result.knuggetUserInfo && result.knuggetUserInfo.token);
            console.log("Auth state after refresh:", isLoggedIn ? "Logged in" : "Not logged in");
            
            authState.isAuthenticated = isLoggedIn;
            authState.user = result.knuggetUserInfo || null;

            // Refresh UI if logged in
            if (isLoggedIn && knuggetPanel) {
              const summaryContent = document.getElementById("summary-content");
              if (summaryContent && summaryContent.style.display !== "none") {
                loadAndDisplaySummary();
              }
            }
          });
        });
      }

      sendResponse({ received: true });
    }
    return true;
  });
}

// Initialize auth state from storage
function initializeAuthState(): void {
  chrome.storage.local.get(["knuggetUserInfo"], (result) => {
    if (result.knuggetUserInfo && result.knuggetUserInfo.token) {
      authState.isAuthenticated = true;
      authState.user = result.knuggetUserInfo;
      console.log("Auth state initialized: Authenticated");
    } else {
      authState.isAuthenticated = false;
      authState.user = null;
      console.log("Auth state initialized: Not authenticated");
    }
  });
}

// Reset content data when video changes
function resetContentData(): void {
  // Reset any cached transcript or summary data
  console.log("Content data reset for new video");
}

// Remove existing panel from DOM
function removeExistingPanel(): void {
  const existingPanel = document.getElementById("knugget-container");
  if (existingPanel) {
    existingPanel.remove();
    knuggetPanel = null;
  }
}

// Cleanup when navigating away from watch pages
function cleanup(): void {
  removeExistingPanel();
  currentVideoId = null;
  console.log("Cleanup completed - navigated away from watch page");
}

// Initialize extension when DOM is ready or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeKnuggetExtension);
} else {
  initializeKnuggetExtension();
}

// Also initialize on script load regardless of DOM state
setTimeout(() => {
  if (!isInitialized && (document.readyState === "complete" || document.readyState === "interactive")) {
    initializeKnuggetExtension();
  }
}, 100);

console.log("Knugget content script loaded and ready");