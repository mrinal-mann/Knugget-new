// services/transcript.ts
import { TranscriptSegment, ApiResponse } from '../types';
import { selectors } from '../config';
import { wait, waitForElement, clickElement } from '../utils/dom';

class TranscriptService {
  
  async extractTranscript(): Promise<ApiResponse<TranscriptSegment[]>> {
    try {
      console.log('🎯 Starting transcript extraction...');
      
      // Check if transcript is already visible
      const existingSegments = this.getExistingTranscriptSegments();
      if (existingSegments.length > 0) {
        console.log('✅ Found existing transcript segments:', existingSegments.length);
        return { success: true, data: existingSegments };
      }

      // Try to open transcript panel
      const opened = await this.openTranscriptPanel();
      if (!opened) {
        return {
          success: false,
          error: 'Unable to open transcript panel. This video may not have a transcript available.'
        };
      }

      // Wait for transcript segments to load
      await wait(2000);
      
      const segments = this.getExistingTranscriptSegments();
      if (segments.length === 0) {
        return {
          success: false,
          error: 'No transcript segments found. This video may not have captions available.'
        };
      }

      console.log('✅ Successfully extracted transcript segments:', segments.length);
      return { success: true, data: segments };

    } catch (error) {
      console.error('❌ Transcript extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during transcript extraction'
      };
    }
  }

  private async openTranscriptPanel(): Promise<boolean> {
    try {
      // Step 1: Try to find and click the expand/more button
      const expandButton = document.querySelector(selectors.youtube.expandButton) as HTMLElement;
      if (expandButton) {
        console.log('🔍 Clicking expand button...');
        await clickElement(expandButton);
        await wait(500);
      }

      // Step 2: Look for transcript button
      const transcriptButton = await waitForElement(selectors.youtube.transcriptButton, 5000);
      if (!transcriptButton) {
        console.log('❌ Transcript button not found');
        return false;
      }

      console.log('🔍 Found transcript button, clicking...');
      await clickElement(transcriptButton);
      
      // Wait for transcript panel to open
      await wait(1500);
      
      // Check if transcript segments are now visible
      const segments = document.querySelectorAll(selectors.youtube.transcriptSegments);
      return segments.length > 0;

    } catch (error) {
      console.error('Error opening transcript panel:', error);
      return false;
    }
  }

  private getExistingTranscriptSegments(): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    
    try {
      const segmentElements = document.querySelectorAll(selectors.youtube.transcriptSegments);
      
      segmentElements.forEach((element) => {
        const timestampElement = element.querySelector('.segment-timestamp');
        const textElement = element.querySelector('.segment-text');
        
        if (timestampElement && textElement) {
          const timestamp = timestampElement.textContent?.trim() || '';
          const text = textElement.textContent?.trim() || '';
          
          if (timestamp && text) {
            segments.push({
              timestamp,
              text,
              startSeconds: this.parseTimestamp(timestamp)
            });
          }
        }
      });
    } catch (error) {
      console.error('Error parsing transcript segments:', error);
    }

    return segments;
  }

  private parseTimestamp(timestamp: string): number {
    try {
      const parts = timestamp.split(':');
      if (parts.length === 2) {
        // MM:SS format
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else if (parts.length === 3) {
        // HH:MM:SS format
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
    } catch (error) {
      console.error('Error parsing timestamp:', timestamp, error);
    }
    return 0;
  }

  // Convert transcript segments to plain text
  getTranscriptText(segments: TranscriptSegment[]): string {
    return segments.map(segment => segment.text).join(' ');
  }

  // Format transcript for display
  formatTranscriptForDisplay(segments: TranscriptSegment[]): string {
    return segments
      .map(segment => `[${segment.timestamp}] ${segment.text}`)
      .join('\n');
  }

  // Search transcript for keywords
  searchTranscript(segments: TranscriptSegment[], query: string): TranscriptSegment[] {
    const lowercaseQuery = query.toLowerCase();
    return segments.filter(segment => 
      segment.text.toLowerCase().includes(lowercaseQuery)
    );
  }
}

export const transcriptService = new TranscriptService();