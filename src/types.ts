// types.ts
export interface User {
  id: string;
  name: string;
  email: string;
  credits: number;
  plan: "free" | "premium";
  avatar?: string;
}

export interface AuthData {
  token: string;
  refreshToken?: string;
  user: User;
  expiresAt: number;
  loginTime: string;
}

export interface TranscriptSegment {
  timestamp: string;
  text: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string;
  duration: string;
  url: string;
  thumbnailUrl?: string;
}

export interface Summary {
  id?: string;
  title: string;
  keyPoints: string[];
  fullSummary: string;
  tags?: string[];
  videoMetadata: VideoMetadata;
  transcript?: TranscriptSegment[];
  createdAt?: string;
  saved?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ExtensionState {
  isAuthenticated: boolean;
  user: User | null;
  currentVideo: VideoMetadata | null;
  transcript: TranscriptSegment[] | null;
  summary: Summary | null;
  isLoading: boolean;
  error: string | null;
}

export interface Message {
  type: MessageType;
  data?: any;
  timestamp?: number;
}

export enum MessageType {
  // Auth related
  AUTH_STATUS_CHANGED = "AUTH_STATUS_CHANGED",
  LOGIN_SUCCESS = "LOGIN_SUCCESS",
  LOGOUT = "LOGOUT",

  // Video related
  VIDEO_CHANGED = "VIDEO_CHANGED",
  TRANSCRIPT_LOADED = "TRANSCRIPT_LOADED",
  SUMMARY_GENERATED = "SUMMARY_GENERATED",
  SUMMARY_SAVED = "SUMMARY_SAVED",

  // UI related
  SHOW_PANEL = "SHOW_PANEL",
  HIDE_PANEL = "HIDE_PANEL",
  TOGGLE_PANEL = "TOGGLE_PANEL",

  // Error handling
  ERROR = "ERROR",

  // Background sync
  SYNC_AUTH = "SYNC_AUTH",
  REFRESH_TOKEN = "REFRESH_TOKEN",
}

export interface KnuggetConfig {
  apiBaseUrl: string;
  websiteUrl: string;
  refreshTokenThreshold: number; // minutes before expiry to refresh
  maxRetries: number;
  retryDelay: number;
}

// Chrome extension specific types
declare global {
  interface Window {
    __KNUGGET_STATE__?: ExtensionState;
  }
}
