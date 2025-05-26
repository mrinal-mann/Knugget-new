// content.ts - Main Content Script
import "./styles.css";
import { KnuggetPanel } from "./ui/components";
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
import { selectors, config } from "./config";

class KnuggetExtension {
  private panel: KnuggetPanel | null = null;
  private state: ExtensionState = {
    isAuthenticated: false,
    user: null,
    currentVideo: null,
    transcript: null,
    summary: null,
    isLoading: false,
    error: null,
  };
  private currentVideoId: string | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log("🎯 Knugget Extension initializing...");

    try {
      // Wait for YouTube to load
      await waitForElement("ytd-watch-flexy", 10000);

      // Check if we're on a video page
      if (!this.isVideoPage()) {
        console.log("Not on a video page, skipping initialization");
        return;
      }

      // Initialize auth state
      await this.initializeAuth();

      // Setup the panel
      await this.setupPanel();

      // Setup URL change detection for SPA navigation
      this.setupNavigationListener();

      // Setup message listeners
      this.setupMessageListeners();

      // Load initial content
      await this.handleVideoChange();

      console.log("✅ Knugget Extension initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Knugget Extension:", error);
    }
  }

  private isVideoPage(): boolean {
    return window.location.pathname === "/watch" && !!getVideoId();
  }

  private async initializeAuth(): Promise<void> {
    try {
      // Check current auth state
      this.state.isAuthenticated = authService.isAuthenticated;
      this.state.user = authService.user;

      // Try to sync from website if not authenticated
      if (!this.state.isAuthenticated) {
        const synced = await authService.syncFromWebsite();
        if (synced) {
          this.state.isAuthenticated = true;
          this.state.user = authService.user;
        }
      }

      console.log(
        "Auth state:",
        this.state.isAuthenticated ? "Authenticated" : "Not authenticated"
      );
    } catch (error) {
      console.error("Failed to initialize auth:", error);
    }
  }

  private async setupPanel(): Promise<void> {
    // Remove existing panel if present
    if (this.panel) {
      this.panel.destroy();
    }

    // Wait for secondary column to be available
    const secondaryColumn = await waitForElement(
      selectors.youtube.secondaryColumn,
      5000
    );
    if (!secondaryColumn) {
      throw new Error("Could not find YouTube secondary column");
    }

    // Create and inject panel
    this.panel = new KnuggetPanel();
    secondaryColumn.insertBefore(
      this.panel.getElement(),
      secondaryColumn.firstChild
    );

    // Setup event handlers
    this.panel.setOnLoginClick(() => this.handleLogin());
    this.panel.setOnGenerateClick(() => this.handleGenerateSummary());
    this.panel.setOnSaveClick(() => this.handleSaveSummary());

    // Show panel with animation
    setTimeout(() => {
      this.panel?.show();
      this.panel?.getElement().classList.add("animate-in");
    }, 500);
  }

  private setupNavigationListener(): void {
    // Handle YouTube's SPA navigation
    let lastUrl = window.location.href;

    const checkForNavigation = debounce(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log("🔄 Navigation detected:", lastUrl);

        if (this.isVideoPage()) {
          this.handleVideoChange();
        } else {
          this.cleanup();
        }
      }
    }, 500);

    // Listen for various navigation events
    window.addEventListener("popstate", checkForNavigation);

    // Override pushState and replaceState to catch programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      checkForNavigation();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      checkForNavigation();
    };

    // Listen for YouTube's navigation finish event
    document.addEventListener("yt-navigate-finish", checkForNavigation);
  }

  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("📨 Received message:", message);

      switch (message.type) {
        case MessageType.AUTH_STATUS_CHANGED:
          this.handleAuthStatusChanged(message.data);
          break;

        case MessageType.LOGIN_SUCCESS:
          this.handleLoginSuccess(message.data);
          break;

        case MessageType.LOGOUT:
          this.handleLogout();
          break;

        default:
          console.log("Unhandled message type:", message.type);
      }

      sendResponse({ received: true });
    });
  }

  private async handleVideoChange(): Promise<void> {
    const videoId = getVideoId();
    if (!videoId || videoId === this.currentVideoId) {
      return;
    }

    console.log("🎬 Video changed:", videoId);
    this.currentVideoId = videoId;

    // Reset state for new video
    this.state.currentVideo = null;
    this.state.transcript = null;
    this.state.summary = null;
    this.state.error = null;

    // Get video metadata
    const metadata = getVideoMetadata();
    if (metadata) {
      this.state.currentVideo = metadata;
    }

    // Load transcript automatically
    await this.loadTranscript();

    // Update UI based on auth state
    this.updateUI();
  }

  private async loadTranscript(): Promise<void> {
    if (!this.panel) return;

    this.state.isLoading = true;
    this.panel.switchTab("transcript");

    try {
      console.log("📝 Loading transcript...");
      const result = await transcriptService.extractTranscript();

      if (result.success && result.data) {
        this.state.transcript = result.data;
        this.panel.showTranscript(result.data);
        console.log("✅ Transcript loaded successfully");
      } else {
        this.state.error = result.error || "Failed to load transcript";
        this.panel.showError(this.state.error);
        console.error("❌ Failed to load transcript:", result.error);
      }
    } catch (error) {
      this.state.error =
        "An unexpected error occurred while loading transcript";
      this.panel.showError(this.state.error);
      console.error("❌ Transcript loading error:", error);
    } finally {
      this.state.isLoading = false;
    }
  }

  private updateUI(): void {
    if (!this.panel) return;

    if (this.state.isAuthenticated && this.state.user) {
      this.panel.showSummaryForAuthenticated(this.state.user);
    }
  }

  private handleLogin(): void {
    // Open login page in new tab
    const loginUrl = `${config.websiteUrl}/auth/login?source=extension&extensionId=${chrome.runtime.id}`;
    window.open(loginUrl, "_blank");
  }

  private async handleGenerateSummary(): Promise<void> {
    if (!this.panel || !this.state.isAuthenticated || !authService.token) {
      this.handleLogin();
      return;
    }

    if (!this.state.transcript || this.state.transcript.length === 0) {
      this.panel.showError("No transcript available for this video");
      return;
    }

    if (!this.state.currentVideo) {
      this.panel.showError("Video information not available");
      return;
    }

    try {
      this.state.isLoading = true;
      this.panel.switchTab("summary");
      this.panel.showSummaryLoading();

      console.log("🤖 Generating summary...");

      // Convert transcript to text
      const transcriptText = transcriptService.getTranscriptText(
        this.state.transcript
      );

      const result = await apiService.generateSummary(
        transcriptText,
        this.state.currentVideo,
        authService.token
      );

      if (result.success && result.data) {
        this.state.summary = result.data;
        this.panel.showSummary(result.data);

        // Update user credits if provided
        if (result.data && "creditsRemaining" in result.data) {
          if (this.state.user) {
            this.state.user.credits = (result.data as any).creditsRemaining;
          }
        }

        console.log("✅ Summary generated successfully");
      } else {
        throw new Error(result.error || "Failed to generate summary");
      }
    } catch (error) {
      console.error("❌ Summary generation failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate summary";
      this.panel.showError(errorMessage, () => this.handleGenerateSummary());
    } finally {
      this.state.isLoading = false;
    }
  }

  private async handleSaveSummary(): Promise<void> {
    if (!this.panel || !this.state.summary || !authService.token) {
      return;
    }

    try {
      console.log("💾 Saving summary...");

      const summaryToSave = {
        ...this.state.summary,
        transcript: this.state.transcript,
        videoMetadata: this.state.currentVideo,
      };

      const result = await apiService.saveSummary(
        summaryToSave as Summary,
        authService.token
      );

      if (result.success) {
        // Update summary as saved
        this.state.summary.saved = true;

        // Show success feedback
        const saveBtn = this.panel
          .getElement()
          .querySelector("#knugget-save-btn") as HTMLButtonElement;
        if (saveBtn) {
          const originalText = saveBtn.innerHTML;
          saveBtn.innerHTML = "✅ Saved!";
          saveBtn.disabled = true;

          setTimeout(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
          }, 2000);
        }

        console.log("✅ Summary saved successfully");
      } else {
        throw new Error(result.error || "Failed to save summary");
      }
    } catch (error) {
      console.error("❌ Save summary failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save summary";

      // Show error feedback
      const saveBtn = this.panel
        .getElement()
        .querySelector("#knugget-save-btn") as HTMLButtonElement;
      if (saveBtn) {
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = "❌ Failed";
        saveBtn.style.background = "#ef4444";

        setTimeout(() => {
          saveBtn.innerHTML = originalText;
          saveBtn.style.background = "";
        }, 2000);
      }
    }
  }

  private handleAuthStatusChanged(data: {
    isAuthenticated: boolean;
    user?: User;
  }): void {
    console.log("🔐 Auth status changed:", data);

    this.state.isAuthenticated = data.isAuthenticated;
    this.state.user = data.user || null;

    this.updateUI();
  }

  private handleLoginSuccess(data: { user: User }): void {
    console.log("✅ Login successful:", data);

    this.state.isAuthenticated = true;
    this.state.user = data.user;

    this.updateUI();
  }

  private handleLogout(): void {
    console.log("👋 Logout");

    this.state.isAuthenticated = false;
    this.state.user = null;
    this.state.summary = null;

    this.updateUI();
  }

  private cleanup(): void {
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }

    this.currentVideoId = null;
    this.state.currentVideo = null;
    this.state.transcript = null;
    this.state.summary = null;
  }
}

// Initialize extension when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new KnuggetExtension();
  });
} else {
  new KnuggetExtension();
}

// Handle dynamic script loading
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  setTimeout(() => {
    new KnuggetExtension();
  }, 1000);
}
