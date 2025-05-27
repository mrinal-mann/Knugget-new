// services/api.ts
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
          error:
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const responseData = await response.json();
      return {
        success: true,
        data: responseData,
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
    transcript: string,
    videoMetadata: VideoMetadata,
    token: string
  ): Promise<ApiResponse<Summary>> {
    return this.makeRequest<Summary>(
      "/summary/generate",
      "POST",
      {
        content: transcript,
        metadata: {
          ...videoMetadata,
          source: "youtube",
        },
      },
      token
    );
  }

  async saveSummary(
    summary: Summary,
    token: string
  ): Promise<ApiResponse<{ id: string }>> {
    return this.makeRequest<{ id: string }>(
      "/summary/save",
      "POST",
      summary,
      token
    );
  }

  async getSummaries(
    page: number = 1,
    limit: number = 10,
    token: string
  ): Promise<ApiResponse<{ summaries: Summary[]; total: number }>> {
    return this.makeRequest<{ summaries: Summary[]; total: number }>(
      `/summary?page=${page}&limit=${limit}`,
      "GET",
      null,
      token
    );
  }

  async deleteSummary(id: string, token: string): Promise<ApiResponse<void>> {
    return this.makeRequest<void>(`/summary/${id}`, "DELETE", null, token);
  }

  async getUserProfile(token: string): Promise<ApiResponse<any>> {
    return this.makeRequest<any>("/auth/me", "GET", null, token);
  }

  // Health check endpoint
  async checkHealth(): Promise<ApiResponse<{ status: string }>> {
    return this.makeRequest<{ status: string }>(
      "/health",
      "GET",
      null,
      null,
      false
    );
  }
}

// Convenience function for making API requests with automatic token handling
export async function apiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: any,
  token?: string | null,
  requiresAuth: boolean = true
): Promise<ApiResponse<T>> {
  const apiService = new ApiService();
  return apiService["makeRequest"](endpoint, method, data, token, requiresAuth);
}

export const apiService = new ApiService();
