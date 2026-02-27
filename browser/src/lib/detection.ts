/**
 * Environment detection utilities for transport selection.
 *
 * Priority order for connect-example:
 *   P1 — inside Sphere iframe  → PostMessageTransport to parent window
 *   P2 — extension installed   → ExtensionTransport via chrome extension
 *   P3 — standalone page       → PostMessageTransport to popup window
 */

/** Returns true when the page is running inside an iframe. */
export function isInIframe(): boolean {
  try {
    return window.parent !== window && window.self !== window.top;
  } catch {
    // cross-origin access throws — we're in an iframe
    return true;
  }
}

/** Returns true when the Sphere browser extension is installed and active. */
export function hasExtension(): boolean {
  try {
    const sphere = (window as Record<string, unknown>).sphere;
    if (!sphere || typeof sphere !== 'object') return false;
    const isInstalled = (sphere as Record<string, unknown>).isInstalled;
    if (typeof isInstalled !== 'function') return false;
    return (isInstalled as () => boolean)() === true;
  } catch {
    return false;
  }
}
