// services/auth.ts
/// <reference types="chrome" />
import { AuthData, User, ApiResponse } from "../types";
import { config, storageKeys } from "../config";
import { apiRequest } from "./api";   

class AuthService {
  private authData: AuthData | null = null;
  private refreshTimer: number | null = null;

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      // Try to load from chrome storage first
      const result = await chrome.storage.local.get([storageKeys.AUTH_DATA]);
      if (result[storageKeys.AUTH_DATA]) {
        this.authData = result[storageKeys.AUTH_DATA];
        this.scheduleTokenRefresh();
      } else {
        // Check if running in web context with localStorage
        await this.syncFromWebsite();
      }
    } catch (error) {
      console.error("Failed to initialize auth:", error);
    }
  }

  async syncFromWebsite(): Promise<boolean> {
    try {
      // This method checks website cookies/localStorage for auth data
      // Implementation depends on your website auth setup

      // Check for Supabase session or custom auth token
      const cookies = await this.getCookies();
      const authToken = cookies.find(
        (c) => c.name === "authToken" || c.name === "sb-auth-token"
      );

      if (authToken) {
        // Validate token with your API
        const response = await apiRequest<User>(
          "/auth/me",
          "GET",
          null,
          authToken.value
        );

        if (response.success && response.data) {
          const authData: AuthData = {
            token: authToken.value,
            user: response.data,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
            loginTime: new Date().toISOString(),
          };

          await this.setAuthData(authData);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Failed to sync from website:", error);
      return false;
    }
  }

  private async getCookies(): Promise<chrome.cookies.Cookie[]> {
    try {
      const cookies = await chrome.cookies.getAll({ url: config.websiteUrl });
      return cookies;
    } catch (error) {
      console.error("Failed to get cookies:", error);
      return [];
    }
  }

  async login(email: string, password: string): Promise<ApiResponse<AuthData>> {
    try {
      const response = await apiRequest<AuthData>(
        "/auth/signin",
        "POST",
        {
          email,
          password,
        },
        null,
        false
      );

      if (response.success && response.data) {
        await this.setAuthData(response.data);
        this.notifyAuthChange(true);
      }

      return response;
    } catch (error) {
      console.error("Login failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed",
      };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.authData) {
        // Call logout API
        await apiRequest("/auth/logout", "POST", null, this.authData.token);
      }
    } catch (error) {
      console.error("Logout API call failed:", error);
    } finally {
      // Always clear local auth data
      await this.clearAuthData();
      this.notifyAuthChange(false);
    }
  }

  async refreshToken(): Promise<boolean> {
    if (!this.authData?.refreshToken) {
      return false;
    }

    try {
      const response = await apiRequest<AuthData>("/auth/refresh", "POST", {
        refreshToken: this.authData.refreshToken,
      });

      if (response.success && response.data) {
        await this.setAuthData(response.data);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Token refresh failed:", error);
      // If refresh fails, logout user
      await this.logout();
      return false;
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.authData) return;

    const timeUntilExpiry = this.authData.expiresAt - Date.now();
    const refreshTime =
      timeUntilExpiry - config.refreshTokenThreshold * 60 * 1000;

    if (refreshTime > 0) {
      this.refreshTimer = window.setTimeout(() => {
        this.refreshToken();
      }, refreshTime);
    } else {
      // Token is already expired or about to expire
      this.refreshToken();
    }
  }

  private async setAuthData(authData: AuthData): Promise<void> {
    this.authData = authData;
    await chrome.storage.local.set({ [storageKeys.AUTH_DATA]: authData });
    this.scheduleTokenRefresh();
  }

  private async clearAuthData(): Promise<void> {
    this.authData = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    await chrome.storage.local.remove([storageKeys.AUTH_DATA]);
  }

  private notifyAuthChange(isAuthenticated: boolean): void {
    // Notify all tabs about auth state change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id && tab.url?.includes("youtube.com")) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "AUTH_STATUS_CHANGED",
              data: { isAuthenticated, user: this.authData?.user },
            })
            .catch(() => {
              // Ignore errors for tabs that aren't ready
            });
        }
      });
    });
  }

  // Public getters
  get isAuthenticated(): boolean {
    return !!this.authData && this.authData.expiresAt > Date.now();
  }

  get user(): User | null {
    return this.isAuthenticated ? this.authData!.user : null;
  }

  get token(): string | null {
    return this.isAuthenticated ? this.authData!.token : null;
  }

  // Listen for auth changes from website
  async handleExternalAuthChange(authData: AuthData): Promise<void> {
    await this.setAuthData(authData);
    this.notifyAuthChange(true);
  }
}

export const authService = new AuthService();
