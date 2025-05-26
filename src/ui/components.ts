// ui/components.ts - Fixed panel implementation matching working version
import { createElement } from "../utils/dom";
import { Summary, TranscriptSegment, User } from "../types";
import { selectors, config } from "../config";

export class KnuggetPanel {
  private container: HTMLElement;
  private currentTab: "transcript" | "summary" = "transcript";
  private onLoginClick?: () => void;
  private onGenerateClick?: () => void;
  private onSaveClick?: () => void;

  constructor() {
    this.container = this.createPanelStructure();
    this.attachEventListeners();
  }

  // Create the main panel structure with proper YouTube integration styling
  private createPanelStructure(): HTMLElement {
    return createElement("div", {
      id: "knugget-panel",
      className: "knugget-panel",
      innerHTML: `
        <div class="knugget-header">
          <div class="knugget-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="currentColor"/>
            </svg>
            <span>Knugget</span>
          </div>
          <div class="knugget-credits">
            <span id="knugget-credits">3 credits left</span>
          </div>
        </div>
        
        <div class="knugget-tabs">
          <button id="knugget-tab-transcript" class="knugget-tab active" data-tab="transcript">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Transcript
          </button>
          <button id="knugget-tab-summary" class="knugget-tab" data-tab="summary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9,5V9H21V5M9,19H21V15H9M9,14H21V10H9M4,9H8L6,7M4,19H8L6,17M4,14H8L6,12"/>
            </svg>
            Summary
          </button>
        </div>
        
        <div class="knugget-content">
          <div id="knugget-content-transcript" class="knugget-tab-content active">
            <div class="knugget-loading">
              <div class="spinner"></div>
              <p>Loading transcript...</p>
            </div>
          </div>
          
          <div id="knugget-content-summary" class="knugget-tab-content">
            <div class="knugget-auth-prompt">
              <div class="auth-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35">
                  <path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/>
                </svg>
              </div>
              <h3>Sign in to generate summaries</h3>
              <p>Get AI-powered insights and key takeaways from any YouTube video</p>
              <div class="auth-buttons">
                <button id="knugget-login-btn" class="btn btn-primary">Sign In</button>
                <button id="knugget-signup-btn" class="btn btn-secondary">Sign Up</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="knugget-footer">
          <button id="knugget-settings-btn" class="btn-icon" title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
            </svg>
          </button>
          <span class="knugget-version">v1.0.0</span>
        </div>
      `,
    });
  }

  // Attach event listeners to panel elements
  private attachEventListeners(): void {
    // Handle tab switching between transcript and summary
    const tabButtons = this.container.querySelectorAll(".knugget-tab");
    tabButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabName = target.dataset.tab as "transcript" | "summary";
        this.switchTab(tabName);
      });
    });

    // Handle authentication button clicks
    const loginBtn = this.container.querySelector("#knugget-login-btn");
    const signupBtn = this.container.querySelector("#knugget-signup-btn");

    loginBtn?.addEventListener("click", () => this.onLoginClick?.());
    signupBtn?.addEventListener("click", () => this.onLoginClick?.()); // Both go to login for now

    // Handle settings button click
    const settingsBtn = this.container.querySelector("#knugget-settings-btn");
    settingsBtn?.addEventListener("click", () => {
      window.open(`${config.websiteUrl}/settings`, "_blank");
    });
  }

  // Switch between transcript and summary tabs
  switchTab(tab: "transcript" | "summary"): void {
    this.currentTab = tab;

    // Update active tab styling
    const tabs = this.container.querySelectorAll(".knugget-tab");
    tabs.forEach((t) => t.classList.remove("active"));

    const activeTab = this.container.querySelector(`[data-tab="${tab}"]`);
    activeTab?.classList.add("active");

    // Show corresponding content
    const contents = this.container.querySelectorAll(".knugget-tab-content");
    contents.forEach((c) => c.classList.remove("active"));

    const activeContent = this.container.querySelector(
      `#knugget-content-${tab}`
    );
    activeContent?.classList.add("active");
  }

  // Display transcript segments with timestamp navigation
  showTranscript(segments: TranscriptSegment[]): void {
    const transcriptContent = this.container.querySelector(
      "#knugget-content-transcript"
    );
    if (!transcriptContent) return;

    if (segments.length === 0) {
      transcriptContent.innerHTML = `
        <div class="knugget-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="#ccc">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
          </svg>
          <p>No transcript available for this video</p>
        </div>
      `;
      return;
    }

    // Generate HTML for transcript segments
    const segmentsHtml = segments
      .map(
        (segment) => `
      <div class="transcript-segment" data-start="${segment.startSeconds || 0}">
        <span class="timestamp">${segment.timestamp}</span>
        <span class="text">${segment.text}</span>
      </div>
    `
      )
      .join("");

    transcriptContent.innerHTML = `
      <div class="transcript-container">
        ${segmentsHtml}
      </div>
    `;

    // Add click handlers for video seek functionality
    const timestampElements = transcriptContent.querySelectorAll(
      ".transcript-segment"
    );
    timestampElements.forEach((element) => {
      element.addEventListener("click", () => {
        const startTime = element.getAttribute("data-start");
        if (startTime) {
          this.seekVideo(parseInt(startTime));
        }
      });
    });
  }

  // Show summary interface for authenticated users
  showSummaryForAuthenticated(user: User): void {
    const summaryContent = this.container.querySelector(
      "#knugget-content-summary"
    );
    if (!summaryContent) return;

    // Update credits display in header
    const creditsElement = this.container.querySelector("#knugget-credits");
    if (creditsElement) {
      creditsElement.textContent = `${user.credits} credits left`;
    }

    // Show generate summary prompt
    summaryContent.innerHTML = `
      <div class="knugget-summary-prompt">
        <div class="summary-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35">
            <path d="M9,5V9H21V5M9,19H21V15H9M9,14H21V10H9M4,9H8L6,7M4,19H8L6,17M4,14H8L6,12"/>
          </svg>
        </div>
        <h3>Generate AI Summary</h3>
        <p>Get key insights and takeaways from this video using AI</p>
        <button id="knugget-generate-btn" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
          </svg>
          Generate Summary (1 credit)
        </button>
      </div>
    `;

    // Attach generate button event listener
    const generateBtn = summaryContent.querySelector("#knugget-generate-btn");
    generateBtn?.addEventListener("click", () => this.onGenerateClick?.());
  }

  // Show loading state during summary generation
  showSummaryLoading(): void {
    const summaryContent = this.container.querySelector(
      "#knugget-content-summary"
    );
    if (!summaryContent) return;

    summaryContent.innerHTML = `
      <div class="knugget-loading">
        <div class="spinner"></div>
        <p>Generating AI summary...</p>
        <small>This may take 10-30 seconds</small>
      </div>
    `;
  }

  // Display generated summary with key points and save functionality
  showSummary(summary: Summary): void {
    const summaryContent = this.container.querySelector(
      "#knugget-content-summary"
    );
    if (!summaryContent) return;

    // Generate HTML for key points
    const keyPointsHtml = summary.keyPoints
      .map(
        (point) => `
      <div class="key-point">
        <div class="bullet">•</div>
        <div class="point-text">${point}</div>
      </div>
    `
      )
      .join("");

    summaryContent.innerHTML = `
      <div class="summary-container">
        <div class="summary-section">
          <h4>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9,5V9H21V5M9,19H21V15H9M9,14H21V10H9M4,9H8L6,7M4,19H8L6,17M4,14H8L6,12"/>
            </svg>
            Key Points
          </h4>
          <div class="key-points">
            ${keyPointsHtml}
          </div>
        </div>
        
        <div class="summary-section">
          <h4>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Full Summary
          </h4>
          <div class="full-summary">
            <p>${summary.fullSummary}</p>
          </div>
        </div>
        
        <div class="summary-actions">
          <button id="knugget-save-btn" class="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z"/>
            </svg>
            Save Summary
          </button>
          <button class="btn btn-outline" onclick="window.open('${config.websiteUrl}/dashboard', '_blank')">
            View All Summaries
          </button>
        </div>
      </div>
    `;

    // Attach save button event listener
    const saveBtn = summaryContent.querySelector("#knugget-save-btn");
    saveBtn?.addEventListener("click", () => this.onSaveClick?.());
  }

  // Show error state with optional retry functionality
  showError(message: string, onRetry?: () => void): void {
    const activeContent = this.container.querySelector(
      ".knugget-tab-content.active"
    );
    if (!activeContent) return;

    activeContent.innerHTML = `
      <div class="knugget-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#ff4757">
          <path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
        </svg>
        <p>${message}</p>
        ${
          onRetry
            ? '<button class="btn btn-primary" id="retry-btn">Try Again</button>'
            : ""
        }
      </div>
    `;

    // Attach retry button event listener if provided
    if (onRetry) {
      const retryBtn = activeContent.querySelector("#retry-btn");
      retryBtn?.addEventListener("click", onRetry);
    }
  }

  // Seek YouTube video to specific timestamp
  private seekVideo(seconds: number): void {
    const video = document.querySelector("video") as HTMLVideoElement;
    if (video) {
      video.currentTime = seconds;
    }
  }

  // Set event handler callbacks
  setOnLoginClick(handler: () => void): void {
    this.onLoginClick = handler;
  }

  setOnGenerateClick(handler: () => void): void {
    this.onGenerateClick = handler;
  }

  setOnSaveClick(handler: () => void): void {
    this.onSaveClick = handler;
  }

  // Panel visibility management with animations
  show(): void {
    this.container.style.display = "block";
    // Trigger animation after DOM update
    requestAnimationFrame(() => {
      this.container.classList.add("visible");
    });
  }

  hide(): void {
    this.container.classList.remove("visible");
    // Hide after animation completes
    setTimeout(() => {
      this.container.style.display = "none";
    }, 300);
  }

  toggle(): void {
    if (this.container.classList.contains("visible")) {
      this.hide();
    } else {
      this.show();
    }
  }

  // Get the panel DOM element
  getElement(): HTMLElement {
    return this.container;
  }

  // Clean up and remove panel from DOM
  destroy(): void {
    this.container.remove();
  }
}
