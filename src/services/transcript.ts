// services/transcript.ts - Enhanced transcript extraction with better YouTube compatibility
import { TranscriptSegment, ApiResponse } from "../types";
import { selectors } from "../config";
import { wait, waitForElement, clickElement } from "../utils/dom";

class TranscriptService {
  // Main method to extract transcript from YouTube video
  async extractTranscript(): Promise<ApiResponse<TranscriptSegment[]>> {
    try {
      console.log("🎯 Starting transcript extraction...");

      // First check if transcript segments are already visible
      const existingSegments = this.getExistingTranscriptSegments();
      if (existingSegments.length > 0) {
        console.log(
          "✅ Found existing transcript segments:",
          existingSegments.length
        );
        return { success: true, data: existingSegments };
      }

      // Check for "No transcript available" message
      if (this.hasNoTranscriptMessage()) {
        return {
          success: false,
          error: "No transcript available for this video",
        };
      }

      // Try to open transcript panel
      const opened = await this.openTranscriptPanel();
      if (!opened) {
        return {
          success: false,
          error:
            "Unable to open transcript panel. This video may not have a transcript available.",
        };
      }

      // Wait for transcript segments to load after opening panel
      await wait(2000);

      // Check again for "No transcript" message after opening
      if (this.hasNoTranscriptMessage()) {
        return {
          success: false,
          error: "No transcript available for this video",
        };
      }

      // Extract transcript segments
      const segments = this.getExistingTranscriptSegments();
      if (segments.length === 0) {
        return {
          success: false,
          error:
            "No transcript segments found. This video may not have captions available.",
        };
      }

      console.log(
        "✅ Successfully extracted transcript segments:",
        segments.length
      );
      return { success: true, data: segments };
    } catch (error) {
      console.error("❌ Transcript extraction failed:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during transcript extraction",
      };
    }
  }

  // Check if "No transcript" message is visible on the page
  private hasNoTranscriptMessage(): boolean {
    const noTranscriptSelectors = [
      "ytd-transcript-renderer yt-formatted-string",
      "ytd-transcript-body-renderer yt-formatted-string",
      "ytd-transcript-segment-list-renderer yt-formatted-string",
      ".transcript-unavailable-message",
    ];

    for (const selector of noTranscriptSelectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.toLowerCase().includes("no transcript")) {
        return true;
      }
    }
    return false;
  }

  // Fix: Enhanced transcript panel opening with multiple strategies
  private async openTranscriptPanel(): Promise<boolean> {
    try {
      // Strategy 1: Try to expand description area if needed
      await this.tryExpandDescription();

      // Strategy 2: Look for transcript button with multiple possible selectors
      const transcriptSelectors = [
        'button[aria-label*="transcript" i]',
        'button[aria-label*="Show transcript" i]',
        'ytd-button-renderer:has-text("Show transcript") button',
        'ytd-menu-service-item-renderer:has-text("Show transcript")',
        'button.yt-spec-button-shape-next--mono:has-text("Show transcript")',
        ".ytd-transcript-button-renderer button",
        // Fix: Add more YouTube transcript button selectors
        '[aria-label="Show transcript"]',
        'button[title*="transcript" i]',
        'yt-button-shape button[aria-label*="transcript" i]',
      ];

      let transcriptButton = null;
      for (const selector of transcriptSelectors) {
        try {
          transcriptButton = await waitForElement(selector, 2000);
          if (transcriptButton && this.isElementVisible(transcriptButton)) {
            console.log(
              `🔍 Found transcript button with selector: ${selector}`
            );
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }

      // Strategy 3: Try looking in the more actions menu
      if (!transcriptButton) {
        transcriptButton = await this.findTranscriptInMoreMenu();
      }

      // Strategy 4: Try alternative methods for finding transcript
      if (!transcriptButton) {
        transcriptButton = await this.findTranscriptAlternative();
      }

      if (!transcriptButton) {
        console.log("❌ Transcript button not found with any method");
        return false;
      }

      console.log("🔍 Found transcript button, clicking...");
      await clickElement(transcriptButton);

      // Wait for transcript panel to open
      await wait(1500);

      // Verify transcript segments are now visible
      const segments = document.querySelectorAll(
        [
          "ytd-transcript-segment-renderer",
          ".ytd-transcript-segment-renderer",
          '[class*="transcript-segment"]',
        ].join(",")
      );

      const success = segments.length > 0;

      console.log(
        success
          ? "✅ Transcript panel opened successfully"
          : "❌ Transcript panel failed to open"
      );
      return success;
    } catch (error) {
      console.error("Error opening transcript panel:", error);
      return false;
    }
  }

  // Fix: Try to expand description to reveal transcript button
  private async tryExpandDescription(): Promise<void> {
    const expandSelectors = [
      "tp-yt-paper-button#expand",
      ".more-button",
      "#expand",
      'button[aria-label*="more" i]',
      "ytd-text-inline-expander button",
    ];

    for (const selector of expandSelectors) {
      const expandButton = document.querySelector(selector) as HTMLElement;
      if (expandButton && this.isElementVisible(expandButton)) {
        console.log("🔍 Clicking expand button to reveal transcript option...");
        await clickElement(expandButton);
        await wait(800);
        break;
      }
    }
  }

  // Fix: Look for transcript option in more actions menu
  private async findTranscriptInMoreMenu(): Promise<Element | null> {
    try {
      // Try to click more actions button
      const moreButtonSelectors = [
        "#top-level-buttons-computed ytd-menu-renderer button",
        "ytd-menu-renderer button",
        '[aria-label*="More actions" i]',
        'button[aria-label*="more" i]',
      ];

      let moreButton = null;
      for (const selector of moreButtonSelectors) {
        moreButton = document.querySelector(selector) as HTMLElement;
        if (moreButton && this.isElementVisible(moreButton)) {
          break;
        }
      }

      if (moreButton) {
        console.log("🔍 Clicking more actions button...");
        await clickElement(moreButton);
        await wait(1000);

        // Look for transcript option in the dropdown
        const transcriptInMenu = await waitForElement(
          'ytd-menu-service-item-renderer:has-text("transcript"), [role="menuitem"]:has-text("transcript")',
          3000
        );

        if (transcriptInMenu) {
          return transcriptInMenu;
        }
      }
    } catch (error) {
      console.log("Could not find transcript in more menu:", error);
    }

    return null;
  }

  // Fix: Alternative methods to find transcript functionality
  private async findTranscriptAlternative(): Promise<Element | null> {
    // Method 1: Look for any element containing "transcript" text
    const elements = Array.from(document.querySelectorAll("*"));
    for (const element of elements) {
      if (
        element.textContent?.toLowerCase().includes("transcript") &&
        element.tagName === "BUTTON"
      ) {
        if (this.isElementVisible(element)) {
          console.log("🔍 Found transcript button via text search");
          return element;
        }
      }
    }

    // Method 2: Look in engagement panels
    const engagementPanels = Array.from(
      document.querySelectorAll("ytd-engagement-panel-section-list-renderer")
    );
    for (const panel of engagementPanels) {
      const transcriptButton = panel.querySelector(
        'button[aria-label*="transcript" i]'
      );
      if (transcriptButton && this.isElementVisible(transcriptButton)) {
        console.log("🔍 Found transcript button in engagement panel");
        return transcriptButton;
      }
    }

    return null;
  }

  // Fix: Enhanced transcript segment extraction with multiple selectors
  private getExistingTranscriptSegments(): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    try {
      // Try multiple selectors for transcript segments
      const segmentSelectors = [
        "ytd-transcript-segment-renderer",
        ".ytd-transcript-segment-renderer",
        '[class*="transcript-segment"]',
        ".segment",
      ];

      let segmentElements: NodeListOf<Element> | null = null;

      for (const selector of segmentSelectors) {
        segmentElements = document.querySelectorAll(selector);
        if (segmentElements.length > 0) {
          console.log(
            `Found ${segmentElements.length} transcript segments with selector: ${selector}`
          );
          break;
        }
      }

      if (!segmentElements || segmentElements.length === 0) {
        return segments;
      }

      segmentElements.forEach((element) => {
        // Try multiple selectors for timestamp and text within each segment
        const timestampSelectors = [
          ".segment-timestamp",
          ".ytd-transcript-segment-renderer .segment-timestamp",
          '[class*="timestamp"]',
          ".transcript-timestamp",
        ];

        const textSelectors = [
          ".segment-text",
          ".ytd-transcript-segment-renderer .segment-text",
          '[class*="segment-text"]',
          ".transcript-text",
        ];

        let timestampElement = null;
        let textElement = null;

        // Find timestamp element
        for (const selector of timestampSelectors) {
          timestampElement = element.querySelector(selector);
          if (timestampElement) break;
        }

        // Find text element
        for (const selector of textSelectors) {
          textElement = element.querySelector(selector);
          if (textElement) break;
        }

        // Fallback: if no specific selectors work, try to extract from element structure
        if (!timestampElement || !textElement) {
          const allText = element.textContent?.trim() || "";
          // Try to parse format like "0:05 some text here"
          const match = allText.match(/^(\d+:\d+)\s+(.+)$/);
          if (match) {
            segments.push({
              timestamp: match[1],
              text: match[2],
              startSeconds: this.parseTimestamp(match[1]),
            });
            return;
          }
        }

        if (timestampElement && textElement) {
          const timestamp = timestampElement.textContent?.trim() || "";
          const text = textElement.textContent?.trim() || "";

          if (timestamp && text) {
            segments.push({
              timestamp,
              text,
              startSeconds: this.parseTimestamp(timestamp),
            });
          }
        }
      });
    } catch (error) {
      console.error("Error parsing transcript segments:", error);
    }

    return segments;
  }

  // Parse timestamp string (MM:SS or HH:MM:SS) to seconds
  private parseTimestamp(timestamp: string): number {
    try {
      const parts = timestamp.split(":");
      if (parts.length === 2) {
        // MM:SS format
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        // HH:MM:SS format
        return (
          parseInt(parts[0]) * 3600 +
          parseInt(parts[1]) * 60 +
          parseInt(parts[2])
        );
      }
    } catch (error) {
      console.error("Error parsing timestamp:", timestamp, error);
    }
    return 0;
  }

  // Check if element is visible in viewport
  private isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0;
  }

  // Convert transcript segments to plain text for API calls
  getTranscriptText(segments: TranscriptSegment[]): string {
    return segments.map((segment) => segment.text).join(" ");
  }

  // Format transcript for display with timestamps
  formatTranscriptForDisplay(segments: TranscriptSegment[]): string {
    return segments
      .map((segment) => `[${segment.timestamp}] ${segment.text}`)
      .join("\n");
  }

  // Search transcript for specific keywords
  searchTranscript(
    segments: TranscriptSegment[],
    query: string
  ): TranscriptSegment[] {
    const lowercaseQuery = query.toLowerCase();
    return segments.filter((segment) =>
      segment.text.toLowerCase().includes(lowercaseQuery)
    );
  }

  // Get transcript segment at specific time
  getSegmentAtTime(
    segments: TranscriptSegment[],
    seconds: number
  ): TranscriptSegment | null {
    return (
      segments.find((segment) => {
        const start = segment.startSeconds || 0;
        const next = segments[segments.indexOf(segment) + 1];
        const end = next?.startSeconds || Infinity;
        return seconds >= start && seconds < end;
      }) || null
    );
  }
}

export const transcriptService = new TranscriptService();
