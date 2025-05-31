class KnuggetPopup {
  private elements: { [key: string]: HTMLElement } = {};

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.checkCurrentTab();
    this.checkAuthStatus();
  }

  private initializeElements(): void {
    const elementIds = [
      "status-icon", "status-text", "user-section", "login-section",
      "user-avatar", "user-name", "user-credits-text", "user-plan",
      "login-btn", "signup-btn", "logout-btn", "dashboard-btn",
      "summaries-btn", "settings-btn", "help-link", "feedback-link",
    ];

    elementIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        this.elements[id] = element;
      }
    });
  }

  private setupEventListeners(): void {
    this.elements["login-btn"]?.addEventListener("click", () => this.handleLogin());
    this.elements["signup-btn"]?.addEventListener("click", () => this.handleSignup());
    this.elements["logout-btn"]?.addEventListener("click", () => this.handleLogout());
    this.elements["dashboard-btn"]?.addEventListener("click", () => this.openDashboard());
    this.elements["summaries-btn"]?.addEventListener("click", () => this.openSummaries());
    this.elements["settings-btn"]?.addEventListener("click", () => this.openSettings());

    this.elements["help-link"]?.addEventListener("click", (e) => {
      e.preventDefault();
      this.openHelp();
    });
    this.elements["feedback-link"]?.addEventListener("click", (e) => {
      e.preventDefault();
      this.openFeedback();
    });
  }

  private async checkCurrentTab(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        this.updateStatus("inactive", "Unable to detect current page");
        return;
      }

      const url = new URL(tab.url);

      if (url.hostname.includes("youtube.com")) {
        if (url.pathname === "/watch") {
          this.updateStatus("active", "Active on YouTube video");
        } else {
          this.updateStatus("inactive", "Navigate to a YouTube video");
        }
      } else {
        this.updateStatus("inactive", "Only works on YouTube videos");
      }
    } catch (error) {
      console.error("Error checking current tab:", error);
      this.updateStatus("inactive", "Error detecting page");
    }
  }

  private async checkAuthStatus(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: "CHECK_AUTH_STATUS" });

      if (response.isAuthenticated && response.user) {
        this.showUserSection(response.user);
      } else {
        this.showLoginSection();
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      this.showLoginSection();
    }
  }

  private updateStatus(status: "active" | "inactive", message: string): void {
    const statusIcon = this.elements["status-icon"];
    const statusText = this.elements["status-text"];

    if (statusIcon) {
      statusIcon.className = `status-icon ${status === "inactive" ? "inactive" : ""}`;
    }

    if (statusText) {
      statusText.textContent = message;
    }
  }

  private showUserSection(user: any): void {
    this.elements["login-section"]?.classList.add("hidden");
    this.elements["user-section"]?.classList.remove("hidden");

    if (this.elements["user-avatar"]) {
      this.elements["user-avatar"].textContent = user.name?.charAt(0).toUpperCase() || "U";
    }

    if (this.elements["user-name"]) {
      this.elements["user-name"].textContent = user.name || user.email || "User";
    }

    if (this.elements["user-credits-text"]) {
      const credits = user.credits || 0;
      this.elements["user-credits-text"].textContent = `${credits} credit${credits !== 1 ? "s" : ""}`;
    }

    if (this.elements["user-plan"]) {
      const plan = user.plan || "free";
      this.elements["user-plan"].textContent = plan.charAt(0).toUpperCase() + plan.slice(1);

      const planBadge = this.elements["user-plan"];
      if (plan === "premium") {
        planBadge.style.background = "#8b5cf6";
      } else {
        planBadge.style.background = "#ff6b35";
      }
    }
  }

  private showLoginSection(): void {
    this.elements["user-section"]?.classList.add("hidden");
    this.elements["login-section"]?.classList.remove("hidden");
  }

  private handleLogin(): void {
    chrome.runtime.sendMessage({
      type: "OPEN_LOGIN_PAGE",
      payload: { source: "popup" },
    });
    window.close();
  }

  private handleSignup(): void {
    const websiteUrl = this.getWebsiteUrl();
    chrome.tabs.create({
      url: `${websiteUrl}/auth/signup?source=extension&extensionId=${chrome.runtime.id}`,
    });
    window.close();
  }

  private async handleLogout(): Promise<void> {
    try {
      if (this.elements["logout-btn"]) {
        this.elements["logout-btn"].textContent = "Signing out...";
        (this.elements["logout-btn"] as HTMLButtonElement).disabled = true;
      }

      // Send logout message to background
      await chrome.runtime.sendMessage({ type: "LOGOUT" });

      this.showLoginSection();
    } catch (error) {
      console.error("Logout error:", error);

      if (this.elements["logout-btn"]) {
        this.elements["logout-btn"].textContent = "Sign Out";
        (this.elements["logout-btn"] as HTMLButtonElement).disabled = false;
      }
    }
  }

  private openDashboard(): void {
    const websiteUrl = this.getWebsiteUrl();
    chrome.tabs.create({ url: `${websiteUrl}/dashboard` });
    window.close();
  }

  private openSummaries(): void {
    const websiteUrl = this.getWebsiteUrl();
    chrome.tabs.create({ url: `${websiteUrl}/summaries` });
    window.close();
  }

  private openSettings(): void {
    const websiteUrl = this.getWebsiteUrl();
    chrome.tabs.create({ url: `${websiteUrl}/settings` });
    window.close();
  }

  private openHelp(): void {
    const websiteUrl = this.getWebsiteUrl();
    chrome.tabs.create({ url: `${websiteUrl}/help` });
    window.close();
  }

  private openFeedback(): void {
    const websiteUrl = this.getWebsiteUrl();
    chrome.tabs.create({ url: `${websiteUrl}/feedback?source=extension` });
    window.close();
  }

  private getWebsiteUrl(): string {
    return "https://knugget-client.vercel.app"; // Frontend URL
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new KnuggetPopup();
});