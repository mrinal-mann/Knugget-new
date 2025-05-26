// services/transcript.ts - Fixed transcript extraction for YouTube
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
        console.log("✅ Found existing transcript segments:", existingSegments.length);
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
          error: "Unable to open transcript panel. This video may not have a transcript available.",
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
          error: "No transcript segments found. This video may not have captions available.",
        };
      }

      console.log("✅ Successfully extracted transcript segments:", segments.length);
      return { success: true, data: segments };
    } catch (error) {
      console.error("❌ Transcript extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during transcript extraction",
      };
    }
  }

  // Check if "No transcript" message is visible on the page
  private hasNoTranscriptMessage(): boolean {
    const noTranscriptSelectors = [
      "ytd-transcript-renderer yt-formatted-string",
      "ytd-transcript-body-renderer yt-formatted-string", 
      "ytd-transcript-segment-list-renderer yt-formatted-string",
      ".transcript-unavailable-message"
    ];

    for (const selector of noTranscriptSelectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.toLowerCase().includes("no transcript")) {
        return true;
      }
    }
    return false;
  }

  // Attempt to open YouTube's transcript panel by clicking necessary buttons
  private async openTranscriptPanel(): Promise<boolean> {
    try {
      // Step 1: Try to expand description area if needed
      const expandButton = document.querySelector(selectors.youtube.expandButton) as HTMLElement;
      if (expandButton && this.isElementVisible(expandButton)) {
        console.log("🔍 Clicking expand button to reveal transcript option...");
        await clickElement(expandButton);
        await wait(800);
      }

      // Step 2: Look for transcript button with multiple possible selectors  
      const transcriptSelectors = [
        'button[aria-label*="transcript" i]',
        'button[aria-label*="Show transcript" i]', 
        'ytd-button-renderer:has-text("Show transcript") button',
        'ytd-menu-service-item-renderer:has-text("Show transcript")',
        'button.yt-spec-button-shape-next--mono:has-text("Show transcript")',
        '.ytd-transcript-button-renderer button'
      ];

      let transcriptButton = null;
      for (const selector of transcriptSelectors) {
        try {
          transcriptButton = await waitForElement(selector, 2000);
          if (transcriptButton && this.isElementVisible(transcriptButton)) {
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }

      if (!transcriptButton) {
        console.log("❌ Transcript button not found");
        return false;
      }

      console.log("🔍 Found transcript button, clicking...");
      await clickElement(transcriptButton);

      // Wait for transcript panel to open
      await wait(1500);

      // Verify transcript segments are now visible
      const segments = document.querySelectorAll(selectors.youtube.transcriptSegments);
      const success = segments.length > 0;
      
      console.log(success ? "✅ Transcript panel opened successfully" : "❌ Transcript panel failed to open");
      return success;
    } catch (error) {
      console.error("Error opening transcript panel:", error);
      return false;
    }
  }

  // Extract existing transcript segments from the DOM
  private getExistingTranscriptSegments(): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    try {
      const segmentElements = document.querySelectorAll(selectors.youtube.transcriptSegments);

      segmentElements.forEach((element) => {
        const timestampElement = element.querySelector(".segment-timestamp");
        const textElement = element.querySelector(".segment-text");

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
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
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
  searchTranscript(segments: TranscriptSegment[], query: string): TranscriptSegment[] {
    const lowercaseQuery = query.toLowerCase();
    return segments.filter((segment) =>
      segment.text.toLowerCase().includes(lowercaseQuery)
    );
  }

  // Get transcript segment at specific time
  getSegmentAtTime(segments: TranscriptSegment[], seconds: number): TranscriptSegment | null {
    return segments.find((segment) => {
      const start = segment.startSeconds || 0;
      const next = segments[segments.indexOf(segment) + 1];
      const end = next?.startSeconds || Infinity;
      return seconds >= start && seconds < end;
    }) || null;
  }
}

export const transcriptService = new TranscriptService();