// utils/dom.ts - Enhanced YouTube integration with robust selectors

// Wait for specified milliseconds
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fix: More robust element waiting with better error handling
export function waitForElement(
  selector: string,
  timeout: number = 10000
): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check if element already exists
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // Set up mutation observer to watch for element
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    // Set up timeout to prevent infinite waiting
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      console.warn(`Element not found within ${timeout}ms: ${selector}`);
      resolve(null);
    }, timeout);

    // Start observing document changes with more comprehensive config
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id", "style"],
    });
  });
}

// Fix: Enhanced click function with multiple event types
export async function clickElement(element: Element): Promise<void> {
  if (!element) {
    console.warn("Cannot click null element");
    return;
  }

  try {
    // Method 1: Try native click for HTMLElements
    if (element instanceof HTMLElement) {
      element.click();
      return;
    }

    // Method 2: Dispatch comprehensive mouse events
    const events = [
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }),
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }),
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }),
    ];

    for (const event of events) {
      element.dispatchEvent(event);
      await wait(50); // Small delay between events
    }

    // Method 3: Try focus and enter key for accessibility
    if (element instanceof HTMLElement) {
      element.focus();
      await wait(100);
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    }
  } catch (error) {
    console.error("Error clicking element:", error);
  }
}

// Create DOM element with comprehensive options
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    id?: string;
    innerHTML?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    styles?: Partial<CSSStyleDeclaration>;
    children?: (HTMLElement | string)[];
  } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (options.className) element.className = options.className;
  if (options.id) element.id = options.id;
  if (options.innerHTML) element.innerHTML = options.innerHTML;
  if (options.textContent) element.textContent = options.textContent;

  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  if (options.styles) {
    Object.assign(element.style, options.styles);
  }

  if (options.children) {
    options.children.forEach((child) => {
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });
  }

  return element;
}

// Find ancestor element that matches selector
export function findAncestor(
  element: Element,
  selector: string
): Element | null {
  let current = element.parentElement;
  while (current) {
    if (current.matches(selector)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// Insert element after target element
export function insertAfter(newElement: Element, targetElement: Element): void {
  const parent = targetElement.parentNode;
  if (parent) {
    if (targetElement.nextSibling) {
      parent.insertBefore(newElement, targetElement.nextSibling);
    } else {
      parent.appendChild(newElement);
    }
  }
}

// Insert element before target element
export function insertBefore(
  newElement: Element,
  targetElement: Element
): void {
  const parent = targetElement.parentNode;
  if (parent) {
    parent.insertBefore(newElement, targetElement);
  }
}

// Remove element from DOM
export function removeElement(element: Element): void {
  element.parentNode?.removeChild(element);
}

// Check if element is visible in viewport
export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Scroll element into view if not visible
export function scrollIntoViewIfNeeded(element: Element): void {
  if (!isElementVisible(element)) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
}

// Fix: Improved debounce function with proper typing
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function to limit call frequency
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Fix: Enhanced video ID extraction with multiple fallbacks
export function getVideoId(): string | null {
  // Method 1: URL parameter
  const url = new URL(window.location.href);
  let videoId = url.searchParams.get("v");

  if (videoId) {
    return videoId;
  }

  // Method 2: Check for YouTube shorts format
  const shortsMatch = window.location.pathname.match(
    /\/shorts\/([a-zA-Z0-9_-]+)/
  );
  if (shortsMatch) {
    return shortsMatch[1];
  }

  // Method 3: Extract from page data
  try {
    const ytInitialData = (window as any).ytInitialData;
    if (
      ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results
        ?.contents?.[0]?.videoPrimaryInfoRenderer?.videoActions?.menuRenderer
        ?.topLevelButtons
    ) {
      // Complex path to video ID in YouTube's data structure
      const videoId =
        ytInitialData.currentVideoEndpoint?.watchEndpoint?.videoId;
      if (videoId) return videoId;
    }
  } catch (e) {
    // Ignore errors in data extraction
  }

  // Method 4: Look in canonical URL
  const canonicalLink = document.querySelector(
    'link[rel="canonical"]'
  ) as HTMLLinkElement;
  if (canonicalLink) {
    const canonicalUrl = new URL(canonicalLink.href);
    const canonicalVideoId = canonicalUrl.searchParams.get("v");
    if (canonicalVideoId) return canonicalVideoId;
  }

  return null;
}

// Fix: Enhanced video metadata extraction with robust selectors
export function getVideoMetadata() {
  const videoId = getVideoId();
  if (!videoId) return null;

  // Fix: More comprehensive title selectors for different YouTube layouts
  const titleSelectors = [
    "h1.ytd-watch-metadata #title",
    "h1.title",
    "#container h1",
    "ytd-watch-metadata h1",
    ".ytd-video-primary-info-renderer h1",
    'h1[class*="title"]',
    ".ytd-videoPrimaryInfoRenderer h1",
    "ytd-video-primary-info-renderer .title",
  ];

  let titleElement = null;
  let title = "Unknown Title";

  for (const selector of titleSelectors) {
    titleElement = document.querySelector(selector);
    if (titleElement?.textContent?.trim()) {
      title = titleElement.textContent.trim();
      break;
    }
  }

  // Fix: More comprehensive channel selectors
  const channelSelectors = [
    "#top-row .ytd-channel-name a",
    "#channel-name a",
    "#owner-name a",
    "ytd-channel-name a",
    ".ytd-video-owner-renderer a",
    "ytd-video-owner-renderer .ytd-channel-name a",
    "#upload-info ytd-channel-name a",
    ".ytd-c4-tabbed-header-renderer .ytd-channel-name a",
  ];

  let channelElement = null;
  let channelName = "Unknown Channel";

  for (const selector of channelSelectors) {
    channelElement = document.querySelector(selector);
    if (channelElement?.textContent?.trim()) {
      channelName = channelElement.textContent.trim();
      break;
    }
  }

  // Fix: Better duration extraction
  const videoPlayer = document.querySelector("video") as HTMLVideoElement;
  let duration = "";

  if (videoPlayer && videoPlayer.duration) {
    duration = formatDuration(videoPlayer.duration);
  } else {
    // Try to get duration from page metadata
    const durationSelectors = [
      ".ytp-time-duration",
      ".ytd-thumbnail-overlay-time-status-renderer",
      "span.ytd-thumbnail-overlay-time-status-renderer",
      ".video-duration",
    ];

    for (const selector of durationSelectors) {
      const durationElement = document.querySelector(selector);
      if (durationElement?.textContent?.trim()) {
        duration = durationElement.textContent.trim();
        break;
      }
    }
  }

  return {
    videoId,
    title,
    channelName,
    url: window.location.href,
    duration,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}

// Format duration from seconds to readable HH:MM:SS or MM:SS format
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
