// utils/dom.ts - Enhanced YouTube integration

// Wait for specified milliseconds
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait for an element to appear in the DOM with timeout
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
      resolve(null);
    }, timeout);

    // Start observing document changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

// Programmatically click an element with proper event simulation
export async function clickElement(element: Element): Promise<void> {
  if (element instanceof HTMLElement) {
    // Try native click first for HTMLElements
    element.click();
  } else {
    // Dispatch proper mouse events for other elements
    element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    await wait(50);
    element.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
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

// Debounce function to limit rapid calls
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
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

// Extract YouTube video ID from current URL
export function getVideoId(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("v");
}

// Extract comprehensive video metadata from YouTube page
export function getVideoMetadata() {
  const videoId = getVideoId();
  if (!videoId) return null;

  // Try multiple selectors for video title (YouTube changes layout frequently)
  const titleSelectors = [
    'h1.ytd-watch-metadata #title',
    'h1.title',
    '#container h1',
    'ytd-watch-metadata h1',
    '.ytd-video-primary-info-renderer h1'
  ];
  
  let titleElement = null;
  for (const selector of titleSelectors) {
    titleElement = document.querySelector(selector);
    if (titleElement) break;
  }

  // Try multiple selectors for channel name
  const channelSelectors = [
    '#top-row .ytd-channel-name a',
    '#channel-name a',
    '#owner-name a',
    'ytd-channel-name a',
    '.ytd-video-owner-renderer a'
  ];
  
  let channelElement = null;
  for (const selector of channelSelectors) {
    channelElement = document.querySelector(selector);
    if (channelElement) break;
  }

  // Get video duration from player or page metadata
  const videoPlayer = document.querySelector("video");
  let duration = "";
  
  if (videoPlayer && videoPlayer.duration) {
    duration = formatDuration(videoPlayer.duration);
  } else {
    // Try to get duration from page metadata
    const durationElement = document.querySelector('.ytp-time-duration');
    if (durationElement) {
      duration = durationElement.textContent || "";
    }
  }

  return {
    videoId,
    title: titleElement?.textContent?.trim() || "Unknown Title",
    channelName: channelElement?.textContent?.trim() || "Unknown Channel",
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