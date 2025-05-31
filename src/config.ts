// config.ts - Updated with correct YouTube selectors
import { KnuggetConfig } from "./types";

export const config: KnuggetConfig = {
  apiBaseUrl: "https://knugget-backend.onrender.com/api", // FIXED: Points to BACKEND, not frontend
  websiteUrl: "https://knugget-client.vercel.app", // Frontend URL
  refreshTokenThreshold: 5,
  maxRetries: 3,
  retryDelay: 1000,
};

export const selectors = {
  // YouTube DOM selectors - Updated to match actual YouTube structure
  youtube: {
    // YouTube's secondary column where we inject our panel
    secondaryColumn: "#secondary",

    // Video title selectors (multiple fallbacks for different YouTube layouts)
    videoTitle:
      "h1.ytd-watch-metadata #title, h1.title, #container h1, ytd-watch-metadata h1",

    // Channel name selectors
    channelName:
      "#top-row .ytd-channel-name a, #channel-name a, #owner-name a, ytd-channel-name a",

    // Transcript related selectors
    transcriptButton:
      'button[aria-label*="transcript" i], button[aria-label*="Show transcript" i], ytd-button-renderer button:has-text("Show transcript")',
    transcriptSegments:
      "ytd-transcript-segment-renderer, .segment, .ytd-transcript-segment-renderer",

    // Description expand button
    expandButton: "tp-yt-paper-button#expand, .more-button, #expand",

    // More actions menu
    moreButton:
      "#top-level-buttons-computed ytd-menu-renderer, ytd-menu-renderer",
  },

  // Extension UI selectors
  knugget: {
    container: "#knugget-panel",
    tabTranscript: "#knugget-tab-transcript",
    tabSummary: "#knugget-tab-summary",
    contentTranscript: "#knugget-content-transcript",
    contentSummary: "#knugget-content-summary",
    loginButton: "#knugget-login-btn",
    generateButton: "#knugget-generate-btn",
    saveButton: "#knugget-save-btn",
  },
};

export const storageKeys = {
  AUTH_DATA: "knugget_auth",
  USER_PREFERENCES: "knugget_preferences",
  CACHED_SUMMARIES: "knugget_summaries_cache",
  LAST_SYNC: "knugget_last_sync",
};

export const events = {
  AUTH_CHANGED: "knugget:auth:changed",
  VIDEO_CHANGED: "knugget:video:changed",
  TRANSCRIPT_READY: "knugget:transcript:ready",
  SUMMARY_READY: "knugget:summary:ready",
  ERROR: "knugget:error",
} as const;
