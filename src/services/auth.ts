// src/services/auth.ts - FIXED: Complete error handling and recovery
import { AuthData, User, ApiResponse } from "../types";
import { config, storageKeys } from "../config";

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

class AuthService {
  private authData: AuthData | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
  };

  constructor() {
    this.initializeAuth();
    this.setupPeriodicCheck();
  }

  private async initializeAuth(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([storageKeys.AUTH_DATA]);
      if (result[storageKeys.AUTH_DATA]) {
        this.authData = result[storageKeys.AUTH_DATA];
        
        // Validate stored auth data
        if (this.isAuthDataValid(this.authData)) {
          console.log("✅ Auth initialized from storage");
          
          // Check if token needs refresh on startup
          if (this.needsRefresh()) {
            this.refreshToken().catch(error => {
              console.error("Failed to refresh token on startup:", error);
              this.handleAuthFailure();
            });
          }
        } else {
          console.warn("⚠️ Invalid auth data found, clearing");
          await this.clearAuthData();
        }
      }
    } catch (error) {
      console.error("❌ Failed to initialize auth:", error);
      await this.clearAuthData();
    }
  }

  // FIXED: Enhanced auth data validation
  private isAuthDataValid(authData: AuthData | null): boolean {
    if (!authData) return false;
    
    return (
      typeof authData.token === 'string' &&
      authData.token.length > 0 &&
      typeof authData.expiresAt === 'number' &&
      authData.expiresAt > Date.now() &&
      authData.user &&
      typeof authData.user.id === 'string'
    );
  }

  // FIXED: Robust external auth change handling with validation and error recovery
  async handleExternalAuthChange(authData: AuthData): Promise<void> {
    try {
      // Validate incoming auth data
      if (!this.isAuthDataValid(authData)) {
        throw new Error("Invalid auth data received from external source");
      }

      // Test token by making a quick API call
      const isValid = await this.validateTokenWithAPI(authData.token);
      if (!isValid) {
        throw new Error("Token validation failed with API");
      }

      this.authData = authData;
      
      // Store with retry logic
      await this.storeAuthDataWithRetry(authData);
      
      console.log("✅ Auth data updated from external source");
      
      // Notify other parts of the extension
      this.notifyAuthStateChanged(true);
      
    } catch (error) {
      console.error("❌ Failed to handle external auth change:", error);
      
      // Clear potentially corrupted data
      await this.clearAuthData();
      
      // Notify of auth failure
      this.notifyAuthStateChanged(false);
      
      throw new Error(`Authentication sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // FIXED: Token validation with API
  private async validateTokenWithAPI(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${config.apiBaseUrl}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      return response.ok;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  }

  // FIXED: Store auth data with retry logic
  private async storeAuthDataWithRetry(authData: AuthData, attempt = 1): Promise<void> {
    try {
      await chrome.storage.local.set({ [storageKeys.AUTH_DATA]: authData });
    } catch (error) {
      if (attempt >= this.retryConfig.maxRetries) {
        throw new Error(`Failed to store auth data after ${this.retryConfig.maxRetries} attempts: ${error}`);
      }
      
      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
        this.retryConfig.maxDelay
      );
      
      console.warn(`⚠️ Failed to store auth data (attempt ${attempt}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.storeAuthDataWithRetry(authData, attempt + 1);
    }
  }

  // FIXED: Enhanced logout with proper cleanup
  async logout(): Promise<void> {
    try {
      // Clear refresh promise to prevent concurrent operations
      this.refreshPromise = null;
      this.isRefreshing = false;
      
      // Clear auth data
      await this.clearAuthData();
      
      // Notify auth state changed
      this.notifyAuthStateChanged(false);
      
      console.log("✅ Auth data cleared");
    } catch (error) {
      console.error("❌ Error during logout:", error);
      // Force clear even if storage operations fail
      this.authData = null;
      this.notifyAuthStateChanged(false);
    }
  }

  // FIXED: Enhanced token refresh with comprehensive error handling
  async refreshToken(): Promise<boolean> {
    // Prevent concurrent refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.authData?.refreshToken) {
      console.error("❌ No refresh token available");
      await this.handleAuthFailure();
      return false;
    }

    this.isRefreshing = true;
    this.refreshPromise = this._performTokenRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async _performTokenRefresh(): Promise<boolean> {
    let lastError: Error | null = null;

    // Retry token refresh with exponential backoff
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempting token refresh (attempt ${attempt}/${this.retryConfig.maxRetries})`);
        
        const response = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.authData!.refreshToken }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.data) {
            const newAuthData: AuthData = {
              token: data.data.accessToken,
              refreshToken: data.data.refreshToken,
              user: data.data.user,
              expiresAt: data.data.expiresAt,
              loginTime: new Date().toISOString(),
            };

            await this.handleExternalAuthChange(newAuthData);
            console.log("✅ Token refresh successful");
            return true;
          }
        }

        // Handle specific HTTP errors
        if (response.status === 401 || response.status === 403) {
          console.error("❌ Refresh token is invalid or expired");
          await this.handleAuthFailure();
          return false;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        console.warn(`⚠️ Token refresh failed (attempt ${attempt}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error("❌ Token refresh failed after all attempts:", lastError);
    await this.handleAuthFailure();
    return false;
  }

  // FIXED: Comprehensive auth failure handling
  private async handleAuthFailure(): Promise<void> {
    try {
      console.log("🔄 Handling authentication failure...");
      
      // Clear all auth data
      await this.clearAuthData();
      
      // Notify all components of auth failure
      this.notifyAuthStateChanged(false);
      
      // Send message to all tabs to update UI
      chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'AUTH_FAILURE',
              data: { reason: 'Token expired or invalid' }
            }).catch(() => {
              // Ignore errors for tabs that aren't ready
            });
          }
        });
      });

      console.log("✅ Auth failure handled");
    } catch (error) {
      console.error("❌ Error handling auth failure:", error);
    }
  }

  // FIXED: Clear auth data with error handling
  private async clearAuthData(): Promise<void> {
    try {
      this.authData = null;
      await chrome.storage.local.remove([storageKeys.AUTH_DATA]);
    } catch (error) {
      console.error("❌ Error clearing auth data:", error);
      // Force clear in memory even if storage fails
      this.authData = null;
    }
  }

  // FIXED: Auth state change notification with error handling
  private notifyAuthStateChanged(isAuthenticated: boolean): void {
    try {
      // Send message to popup and other extension components
      chrome.runtime.sendMessage({
        type: 'AUTH_STATE_CHANGED',
        data: {
          isAuthenticated,
          user: isAuthenticated ? this.user : null,
          timestamp: new Date().toISOString()
        }
      }).catch(() => {
        // Ignore errors if no listeners
      });

      // Store last known auth state for recovery
      chrome.storage.local.set({
        'knugget_last_auth_state': {
          isAuthenticated,
          timestamp: new Date().toISOString()
        }
      }).catch(error => {
        console.warn("Failed to store auth state:", error);
      });

    } catch (error) {
      console.error("❌ Error notifying auth state change:", error);
    }
  }

  // FIXED: Periodic auth check with error handling
  private setupPeriodicCheck(): void {
    // Check auth status every 5 minutes
    setInterval(async () => {
      try {
        if (this.isAuthenticated) {
          // Check if token needs refresh
          if (this.needsRefresh()) {
            console.log("🔄 Periodic token refresh triggered");
            await this.refreshToken();
          }
          
          // Validate token is still working
          const isValid = await this.validateTokenWithAPI(this.authData!.token);
          if (!isValid) {
            console.warn("⚠️ Token validation failed during periodic check");
            await this.handleAuthFailure();
          }
        }
      } catch (error) {
        console.error("❌ Error in periodic auth check:", error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // FIXED: Enhanced token expiry check
  private needsRefresh(): boolean {
    if (!this.authData?.expiresAt) return false;
    
    const now = Date.now();
    const expiresAt = this.authData.expiresAt;
    const refreshThreshold = config.refreshTokenThreshold * 60 * 1000; // Convert minutes to ms
    
    return (expiresAt - now) <= refreshThreshold;
  }

  // Getters with improved error handling
  get isAuthenticated(): boolean {
    try {
      return this.isAuthDataValid(this.authData);
    } catch (error) {
      console.error("Error checking auth status:", error);
      return false;
    }
  }

  get user(): User | null {
    return this.isAuthenticated ? this.authData!.user : null;
  }

  get token(): string | null {
    return this.isAuthenticated ? this.authData!.token : null;
  }

  // FIXED: Public method to handle API 401 errors
  async handle401Error(): Promise<void> {
    console.log("🔄 Handling 401 error from API");
    
    // Try to refresh token first
    const refreshSuccess = await this.refreshToken();
    
    if (!refreshSuccess) {
      // If refresh fails, handle as auth failure
      await this.handleAuthFailure();
    }
  }

  // FIXED: Get auth status with health check
  async getAuthStatus(): Promise<{ isAuthenticated: boolean; user: User | null; needsRefresh: boolean }> {
    try {
      const isAuthenticated = this.isAuthenticated;
      const needsRefresh = this.needsRefresh();
      
      return {
        isAuthenticated,
        user: this.user,
        needsRefresh
      };
    } catch (error) {
      console.error("Error getting auth status:", error);
      return {
        isAuthenticated: false,
        user: null,
        needsRefresh: false
      };
    }
  }
}

export const authService = new AuthService();