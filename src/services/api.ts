import { ApiResponse, Summary, VideoMetadata } from "../types";
import { config } from "../config";

class ApiService {
  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: any,
    token?: string | null,
    requiresAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    // 🔴 CRITICAL FIX: Use backend API URL, not frontend
    const url = `${config.apiBaseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requiresAuth && token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      credentials: "include",
    };

    if (data && method !== "GET") {
      requestOptions.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const responseData = await response.json();
      return {
        success: true,
        data: responseData.data || responseData,
      };
    } catch (error) {
      console.error(`API request failed: ${method} ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  async generateSummary(
    transcript: any[],
    videoMetadata: VideoMetadata,
    token: string
  ): Promise<ApiResponse<Summary>> {
    return this.makeRequest<Summary>(
      "/summary/generate",
      "POST",
      { transcript, videoMetadata },
      token
    );
  }

  async getUserProfile(token: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>("/auth/me", "GET", null, token);
  }

  async checkHealth(): Promise<ApiResponse<{ status: string }>> {
    return this.makeRequest<{ status: string }>("/health", "GET", null, null, false);
  }
}

export const apiService = new ApiService();