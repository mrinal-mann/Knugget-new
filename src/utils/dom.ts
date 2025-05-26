// utils/dom.ts

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForElement(
  selector: string,
  timeout: number = 10000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

export async function clickElement(element: Element): Promise<void> {
  if (element instanceof HTMLElement) {
    element.click();
  } else {
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
  }
}

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

export function insertBefore(
  newElement: Element,
  targetElement: Element
): void {
  const parent = targetElement.parentNode;
  if (parent) {
    parent.insertBefore(newElement, targetElement);
  }
}

export function removeElement(element: Element): void {
  element.parentNode?.removeChild(element);
}

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

export function scrollIntoViewIfNeeded(element: Element): void {
  if (!isElementVisible(element)) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
}

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

export function getVideoId(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("v");
}

export function getVideoMetadata() {
  const videoId = getVideoId();
  if (!videoId) return null;

  const titleElement = document.querySelector("h1.ytd-watch-metadata");
  const channelElement = document.querySelector(
    "#top-row .ytd-channel-name a, #channel-name a"
  );

  return {
    videoId,
    title: titleElement?.textContent?.trim() || "Unknown Title",
    channelName: channelElement?.textContent?.trim() || "Unknown Channel",
    url: window.location.href,
    duration: "", // Could be extracted from video element if needed
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
}
