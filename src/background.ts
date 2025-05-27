// background.ts - Service Worker
import { authService } from "./services/auth";
import { MessageType, AuthData } from "./types";
import { config } from "./config";

class BackgroundService {
  constructor() {
    this.initialize();
  }

  private initialize(): void {
    console.log("🎯 Knugget Background Service starting...");

    this.setupEventListeners();
    this.setupExternalMessageListener();

    console.log("✅ Background service initialized");
  }

  private setupEventListeners(): void {
    // Extension installation/update
    chrome.runtime.onInstalled.addListener((details) => {
      console.log("Extension installed/updated:", details.reason);

      if (details.reason === "install") {
        // Open welcome page
        chrome.tabs.create({
          url: `${config.websiteUrl}/welcome?source=extension`,
        });

        // Set default settings
        chrome.storage.local.set({
          knuggetSettings: {
            autoLoadTranscript: true,
            showNotifications: true,
            version: chrome.runtime.getManifest().version,
          },
        });
      }

      if (details.reason === "update") {
        // Handle extension updates
        this.handleExtensionUpdate(details.previousVersion || "");
      }
    });

    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle browser startup
    chrome.runtime.onStartup.addListener(() => {
      console.log("Browser started, checking auth status");
      this.checkAuthStatus();
    });
  }

  private setupExternalMessageListener(): void {
    // Listen for messages from the website
    chrome.runtime.onMessageExternal.addListener(
      (message, sender, sendResponse) => {
        console.log(
          "📨 External message received:",
          message,
          "from:",
          sender.url
        );

        if (!sender.url || !this.isAllowedOrigin(sender.url)) {
          console.warn("Message from unauthorized origin:", sender.url);
          sendResponse({ success: false, error: "Unauthorized origin" });
          return;
        }

        switch (message.type) {
          case "KNUGGET_AUTH_SUCCESS":
            this.handleExternalAuthSuccess(message.payload, sendResponse);
            break;

          case "KNUGGET_CHECK_AUTH":
            this.handleExternalAuthCheck(sendResponse);
            break;

          case "KNUGGET_LOGOUT":
            this.handleExternalLogout(sendResponse);
            break;

          default:
            console.log("Unknown external message type:", message.type);
            sendResponse({ success: false, error: "Unknown message type" });
        }

        return true; // Keep message channel open
      }
    );
  }

  private async handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: Function
  ): Promise<void> {
    console.log("📨 Message received:", message.type);

    try {
      switch (message.type) {
        case MessageType.SYNC_AUTH:
          await this.syncAuthFromWebsite();
          sendResponse({ success: true });
          break;

        case MessageType.REFRESH_TOKEN:
          const refreshed = await authService.refreshToken();
          sendResponse({ success: refreshed });
          break;

        case "CHECK_AUTH_STATUS":
          sendResponse({
            isAuthenticated: authService.isAuthenticated,
            user: authService.user,
          });
          break;

        case "OPEN_LOGIN_PAGE":
          this.openLoginPage(message.payload);
          sendResponse({ success: true });
          break;

        case "OPEN_DASHBOARD":
          chrome.tabs.create({ url: `${config.websiteUrl}/dashboard` });
          sendResponse({ success: true });
          break;

        default:
          console.log("Unhandled message type:", message.type);
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("Error handling message:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleExternalAuthSuccess(
    payload: any,
    sendResponse: Function
  ): Promise<void> {
    try {
      if (!payload || !payload.token) {
        throw new Error("Invalid auth payload");
      }

      const authData: AuthData = {
        token: payload.token,
        refreshToken: payload.refreshToken,
        user: payload.user || {
          id: payload.id,
          name: payload.name,
          email: payload.email,
          credits: payload.credits || 0,
          plan: payload.plan || "free",
        },
        expiresAt: payload.expiresAt || Date.now() + 24 * 60 * 60 * 1000,
        loginTime: new Date().toISOString(),
      };

      await authService.handleExternalAuthChange(authData);

      // Notify all YouTube tabs
      this.notifyAllTabs(MessageType.AUTH_STATUS_CHANGED, {
        isAuthenticated: true,
        user: authData.user,
      });

      sendResponse({ success: true });
      console.log("✅ External auth success handled");
    } catch (error) {
      console.error("❌ Failed to handle external auth success:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Auth handling failed",
      });
    }
  }

  private handleExternalAuthCheck(sendResponse: Function): void {
    sendResponse({
      isAuthenticated: authService.isAuthenticated,
      user: authService.user,
    });
  }

  private async handleExternalLogout(sendResponse: Function): Promise<void> {
    try {
      await authService.logout();

      // Notify all tabs
      this.notifyAllTabs(MessageType.LOGOUT);

      sendResponse({ success: true });
      console.log("✅ External logout handled");
    } catch (error) {
      console.error("❌ Failed to handle external logout:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Logout failed",
      });
    }
  }

  private async syncAuthFromWebsite(): Promise<void> {
    try {
      console.log("🔄 Syncing auth from website...");
      const synced = await authService.syncFromWebsite();

      if (synced) {
        console.log("✅ Auth synced successfully");
        this.notifyAllTabs(MessageType.AUTH_STATUS_CHANGED, {
          isAuthenticated: true,
          user: authService.user,
        });
      } else {
        console.log("ℹ️ No auth found on website");
      }
    } catch (error) {
      console.error("❌ Failed to sync auth from website:", error);
    }
  }

  private async checkAuthStatus(): Promise<void> {
    // Check if token needs refresh
    if (authService.isAuthenticated) {
      const refreshed = await authService.refreshToken();
      if (refreshed) {
        console.log("✅ Token refreshed on startup");
      }
    } else {
      // Try to sync from website
      await this.syncAuthFromWebsite();
    }
  }

  private openLoginPage(payload?: { url?: string }): void {
    const extensionId = chrome.runtime.id;
    const referrer = payload?.url
      ? `&referrer=${encodeURIComponent(payload.url)}`
      : "";
    const loginUrl = `${config.websiteUrl}/auth/login?source=extension&extensionId=${extensionId}${referrer}`;

    chrome.tabs.create({ url: loginUrl });
  }

  private notifyAllTabs(type: MessageType, data?: any): void {
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type, data }).catch(() => {
            // Ignore errors for tabs that aren't ready
          });
        }
      });
    });
  }

  private isAllowedOrigin(url: string): boolean {
    try {
      const origin = new URL(url).origin;
      const allowedOrigins = [
        config.websiteUrl,
        "http://localhost:8000",
        "http://localhost:3000",
        "https://knugget.com",
      ];

      return allowedOrigins.includes(origin);
    } catch {
      return false;
    }
  }

  private handleExtensionUpdate(previousVersion: string): void {
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(
      `Extension updated from ${previousVersion} to ${currentVersion}`
    );

    // Show update notification if it's a major update
    if (this.isMajorUpdate(previousVersion, currentVersion)) {
      chrome.notifications.create("knugget-update", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Knugget Updated",
        message: `Updated to version ${currentVersion} with new features!`,
        buttons: [{ title: "See What's New" }],
      });
    }

    // Update settings with new version
    chrome.storage.local.get(["knuggetSettings"], (result) => {
      const settings = result.knuggetSettings || {};
      settings.version = currentVersion;
      chrome.storage.local.set({ knuggetSettings: settings });
    });
  }

  private isMajorUpdate(oldVersion: string, newVersion: string): boolean {
    try {
      const oldParts = oldVersion.split(".").map(Number);
      const newParts = newVersion.split(".").map(Number);

      // Major update if major or minor version increased
      return (
        newParts[0] > oldParts[0] ||
        (newParts[0] === oldParts[0] && newParts[1] > oldParts[1])
      );
    } catch {
      return false;
    }
  }
}

// Handle notification clicks
chrome.notifications?.onButtonClicked.addListener(
  (notificationId, buttonIndex) => {
    if (notificationId === "knugget-update" && buttonIndex === 0) {
      chrome.tabs.create({
        url: `${config.websiteUrl}/changelog?version=${
          chrome.runtime.getManifest().version
        }`,
      });
    }
  }
);

// Initialize background service
new BackgroundService();
