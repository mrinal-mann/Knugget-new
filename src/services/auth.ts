import { AuthData, User, ApiResponse } from "../types";
import { config, storageKeys } from "../config";

class AuthService {
  private authData: AuthData | null = null;

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([storageKeys.AUTH_DATA]);
      if (result[storageKeys.AUTH_DATA]) {
        this.authData = result[storageKeys.AUTH_DATA];
        console.log("✅ Auth initialized from storage");
      }
    } catch (error) {
      console.error("Failed to initialize auth:", error);
    }
  }

  // 🔴 CRITICAL FIX: Handle auth change from website
  async handleExternalAuthChange(authData: AuthData): Promise<void> {
    this.authData = authData;
    await chrome.storage.local.set({ [storageKeys.AUTH_DATA]: authData });
    console.log("✅ Auth data updated from external source");
  }

  async logout(): Promise<void> {
    this.authData = null;
    await chrome.storage.local.remove([storageKeys.AUTH_DATA]);
    console.log("✅ Auth data cleared");
  }

  async refreshToken(): Promise<boolean> {
    if (!this.authData?.refreshToken) return false;

    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.authData.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          await this.handleExternalAuthChange({
            token: data.data.accessToken,
            refreshToken: data.data.refreshToken,
            user: data.data.user,
            expiresAt: data.data.expiresAt,
            loginTime: new Date().toISOString(),
          });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    }
  }

  get isAuthenticated(): boolean {
    return !!this.authData && this.authData.expiresAt > Date.now();
  }

  get user(): User | null {
    return this.isAuthenticated ? this.authData!.user : null;
  }

  get token(): string | null {
    return this.isAuthenticated ? this.authData!.token : null;
  }
}

export const authService = new AuthService();