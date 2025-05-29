// src/services/api.ts - FIXED: Complete error handling with retry logic and user notifications
import { ApiResponse, Summary, VideoMetadata } from "../types";
import { config } from "../config";
import { authService } from "./auth";

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

interface RequestOptions {
  retries?: number;
  timeout?: number;
  requiresAuth?: boolean;
  showUserError?: boolean;
}

class ApiService {
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504]
  };

  // FIXED: Enhanced request method with comprehensive error handling
  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: any,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      retries = this.retryConfig.maxRetries,
      timeout = 30000,
      requiresAuth = true,
      showUserError = true
    } = options;

    const url = `${config.apiBaseUrl}${endpoint}`;
    
    // Check authentication if required
    if (requiresAuth) {
      const authStatus = await authService.getAuthStatus();
      
      if (!authStatus.isAuthenticated) {
        return {
          success: false,
          error: "Authentication required. Please sign in to continue.",
        };
      }

      // Refresh token if needed
      if (authStatus.needsRefresh) {
        console.log("🔄 Token needs refresh before API call");
        const refreshed = await authService.refreshToken();
        if (!refreshed) {
          return {
            success: false,
            error: "Session expired. Please sign in again.",
          };
        }
      }
    }

    // Perform request with retry logic
    return this.makeRequestWithRetry<T>(url, method, data, requiresAuth, retries, timeout, showUserError);
  }

  // FIXED: Request with retry logic and exponential backoff
  private async makeRequestWithRetry<T>(
    url: string,
    method: string,
    data: any,
    requiresAuth: boolean,
    retries: number,
    timeout: number,
    showUserError: boolean,
    attempt = 1
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add auth header if required
      if (requiresAuth) {
        const token = authService.token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      const requestOptions: RequestInit = {
        method,
        headers,
        credentials: "include",
        signal: AbortSignal.timeout(timeout),
      };

      if (data && method !== "GET") {
        requestOptions.body = JSON.stringify(data);
      }

      console.log(`🌐 API Request (attempt ${attempt}): ${method} ${url}`);
      
      const response = await fetch(url, requestOptions);
      
      // Handle different response scenarios
      if (response.ok) {
        const responseData = await response.json();
        console.log(`✅ API Success: ${method} ${url}`);
        
        return {
          success: true,
          data: responseData.data || responseData,
          message: responseData.message,
        };
      }

      // Handle authentication errors
      if (response.status === 401) {
        console.warn("🔐 Authentication error (401)");
        
        // Try to handle 401 error (refresh token)
        await authService.handle401Error();
        
        // If this is the first attempt and we're authenticated now, retry once
        if (attempt === 1 && authService.isAuthenticated) {
          console.log("🔄 Retrying request after auth refresh");
          return this.makeRequestWithRetry<T>(url, method, data, requiresAuth, 1, timeout, showUserError, 2);
        }
        
        return {
          success: false,
          error: "Your session has expired. Please sign in again.",
        };
      }

      // Handle rate limiting
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.calculateDelay(attempt);
        
        if (attempt <= retries) {
          console.warn(`⏳ Rate limited (429), retrying after ${delay}ms`);
          await this.delay(delay);
          return this.makeRequestWithRetry<T>(url, method, data, requiresAuth, retries, timeout, showUserError, attempt + 1);
        }
        
        return {
          success: false,
          error: errorData.error || "Too many requests. Please try again later.",
        };
      }

      // Handle insufficient credits
      if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || "Insufficient credits. Please upgrade your plan or wait for credits to reset.",
        };
      }

      // Handle retryable errors
      if (this.retryConfig.retryableStatusCodes.includes(response.status) && attempt <= retries) {
        const delay = this.calculateDelay(attempt);
        console.warn(`⚠️ Retryable error ${response.status}, retrying after ${delay}ms (attempt ${attempt}/${retries})`);
        
        await this.delay(delay);
        return this.makeRequestWithRetry<T>(url, method, data, requiresAuth, retries, timeout, showUserError, attempt + 1);
      }

      // Handle other HTTP errors
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      
      console.error(`❌ API Error: ${method} ${url} - ${errorMessage}`);
      
      return {
        success: false,
        error: showUserError ? this.getUserFriendlyError(response.status, errorMessage) : errorMessage,
      };

    } catch (error) {
      return this.handleRequestError<T>(error, url, method, data, requiresAuth, retries, timeout, showUserError, attempt);
    }
  }

  // FIXED: Comprehensive error handling for network and other errors
  private async handleRequestError<T>(
    error: any,
    url: string,
    method: string,
    data: any,
    requiresAuth: boolean,
    retries: number,
    timeout: number,
    showUserError: boolean,
    attempt: number
  ): Promise<ApiResponse<T>> {
    console.error(`❌ Request error (attempt ${attempt}):`, error);

    // Handle timeout errors
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      if (attempt <= retries) {
        const delay = this.calculateDelay(attempt);
        console.warn(`⏱️ Request timeout, retrying after ${delay}ms`);
        await this.delay(delay);
        return this.makeRequestWithRetry<T>(url, method, data, requiresAuth, retries, timeout * 1.5, showUserError, attempt + 1);
      }
      
      return {
        success: false,
        error: showUserError ? "Request timed out. Please check your connection and try again." : "Request timeout",
      };
    }

    // Handle network errors
    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
      if (attempt <= retries) {
        const delay = this.calculateDelay(attempt);
        console.warn(`🌐 Network error, retrying after ${delay}ms`);
        await this.delay(delay);
        return this.makeRequestWithRetry<T>(url, method, data, requiresAuth, retries, timeout, showUserError, attempt + 1);
      }
      
      return {
        success: false,
        error: showUserError ? "Network error. Please check your internet connection and try again." : "Network error",
      };
    }

    // Handle abort errors
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: showUserError ? "Request was cancelled." : "Request aborted",
      };
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      error: showUserError ? "An unexpected error occurred. Please try again." : errorMessage,
    };
  }

  // FIXED: Calculate exponential backoff delay
  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
      this.retryConfig.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  // FIXED: Delay utility
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // FIXED: User-friendly error messages
  private getUserFriendlyError(status: number, originalError: string): string {
    switch (status) {
      case 400:
        return "Invalid request. Please check your input and try again.";
      case 401:
        return "Your session has expired. Please sign in again.";
      case 403:
        return "You don't have permission to perform this action.";
      case 404:
        return "The requested resource was not found.";
      case 402:
        return "Insufficient credits. Please upgrade your plan.";
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 500:
        return "Server error. Please try again later.";
      case 502:
      case 503:
      case 504:
        return "Service temporarily unavailable. Please try again later.";
      default:
        return originalError.length < 100 ? originalError : "An error occurred. Please try again.";
    }
  }

  // FIXED: Enhanced summary generation with comprehensive error handling
  async generateSummary(
    transcript: any[],
    videoMetadata: VideoMetadata,
    token: string
  ): Promise<ApiResponse<Summary>> {
    try {
      // Validate input data
      if (!transcript || transcript.length === 0) {
        return {
          success: false,
          error: "No transcript available. This video may not have captions enabled.",
        };
      }

      if (!videoMetadata || !videoMetadata.videoId) {
        return {
          success: false,
          error: "Invalid video information. Please refresh the page and try again.",
        };
      }

      console.log(`🤖 Generating summary for video: ${videoMetadata.videoId}`);
      
      const result = await this.makeRequest<Summary>(
        "/summary/generate",
        "POST",
        { transcript, videoMetadata },
        { 
          timeout: 60000, // 60 seconds for AI processing
          showUserError: true 
        }
      );

      if (result.success) {
        console.log("✅ Summary generated successfully");
        
        // Notify user of success
        this.showNotification("Summary generated successfully!", "success");
      } else {
        console.error("❌ Summary generation failed:", result.error);
        
        // Show specific error to user
        this.showNotification(
          result.error || "Failed to generate summary. Please try again.",
          "error"
        );
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Summary generation error:", errorMessage);
      
      this.showNotification("Failed to generate summary. Please try again.", "error");
      
      return {
        success: false,
        error: "Failed to generate summary due to an unexpected error.",
      };
    }
  }

  // FIXED: Enhanced user profile with error handling
  async getUserProfile(token: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>("/auth/me", "GET", null);
  }

  // FIXED: Health check with timeout and error handling
  async checkHealth(): Promise<ApiResponse<{ status: string }>> {
    return this.makeRequest<{ status: string }>(
      "/health", 
      "GET", 
      null, 
      { 
        requiresAuth: false, 
        timeout: 5000,
        retries: 1,
        showUserError: false 
      }
    );
  }

  // FIXED: Save summary with error handling
  async saveSummary(summaryData: any, token: string): Promise<ApiResponse<Summary>> {
    try {
      console.log("💾 Saving summary...");
      
      const result = await this.makeRequest<Summary>(
        "/summary/save",
        "POST",
        summaryData
      );

      if (result.success) {
        console.log("✅ Summary saved successfully");
        this.showNotification("Summary saved successfully!", "success");
      } else {
        console.error("❌ Failed to save summary:", result.error);
        this.showNotification(result.error || "Failed to save summary.", "error");
      }

      return result;
    } catch (error) {
      console.error("❌ Save summary error:", error);
      this.showNotification("Failed to save summary. Please try again.", "error");
      
      return {
        success: false,
        error: "Failed to save summary due to an unexpected error.",
      };
    }
  }

  // FIXED: Get summaries with error handling
  async getSummaries(params: any = {}): Promise<ApiResponse<any>> {
    const queryString = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryString.append(key, String(value));
      }
    });

    const endpoint = `/summary${queryString.toString() ? '?' + queryString.toString() : ''}`;
    
    return this.makeRequest<any>(endpoint, "GET");
  }

  // FIXED: Update summary with error handling
  async updateSummary(id: string, data: any): Promise<ApiResponse<Summary>> {
    try {
      const result = await this.makeRequest<Summary>(`/summary/${id}`, "PUT", data);
      
      if (result.success) {
        this.showNotification("Summary updated successfully!", "success");
      }
      
      return result;
    } catch (error) {
      console.error("❌ Update summary error:", error);
      return {
        success: false,
        error: "Failed to update summary.",
      };
    }
  }

  // FIXED: Delete summary with error handling
  async deleteSummary(id: string): Promise<ApiResponse<void>> {
    try {
      const result = await this.makeRequest<void>(`/summary/${id}`, "DELETE");
      
      if (result.success) {
        this.showNotification("Summary deleted successfully!", "success");
      }
      
      return result;
    } catch (error) {
      console.error("❌ Delete summary error:", error);
      return {
        success: false,
        error: "Failed to delete summary.",
      };
    }
  }

  // FIXED: User notification system
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    try {
      // Send notification to content script for display
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SHOW_NOTIFICATION',
            data: { message, type, timestamp: Date.now() }
          }).catch(() => {
            // Fallback to console if content script not available
            console.log(`${type.toUpperCase()}: ${message}`);
          });
        }
      });

      // Show browser notification for important messages
      if (type === 'error') {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Knugget AI',
          message: message
        }).catch(() => {
          // Ignore notification permission errors
          console.log(`Notification: ${message}`);
        });
      }
    } catch (error) {
      console.error("❌ Failed to show notification:", error);
    }
  }

  // FIXED: Connection health check
  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.checkHealth();
      return result.success;
    } catch (error) {
      console.error("❌ Connection check failed:", error);
      return false;
    }
  }

  // FIXED: Retry failed request with user confirmation
  async retryRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    data?: any
  ): Promise<ApiResponse<T>> {
    // Check connection first
    const isConnected = await this.checkConnection();
    
    if (!isConnected) {
      return {
        success: false,
        error: "No internet connection. Please check your network and try again.",
      };
    }

    // Retry the original request
    return this.makeRequest<T>(endpoint, method, data);
  }
}

export const apiService = new ApiService();