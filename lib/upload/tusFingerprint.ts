/**
 * tusFingerprint.ts
 *
 * tus-js-client stores upload state in localStorage under keys matching:
 *   tus::<fingerprint>
 *
 * When an upload fails and is retried, these stale keys point to expired
 * Supabase upload URLs. Attempting to resume from them causes the TUS client
 * to receive a 4xx from Supabase and immediately fire onError → stuck at 0%.
 *
 * This utility clears those keys so each retry starts with a clean slate.
 */

const TUS_KEY_PREFIX = "tus::";

/**
 * Remove all tus-js-client fingerprint keys from localStorage that contain
 * the given fileId. Called before each upload retry and on rehydration.
 */
export function clearStaleTusFingerprints(fileId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(TUS_KEY_PREFIX) && key.includes(fileId)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });

    if (keysToRemove.length > 0) {
      console.log(
        `[TUS Fingerprint] Cleared ${keysToRemove.length} stale fingerprint(s) for fileId=${fileId}`
      );
    }
  } catch (err) {
    // localStorage may be unavailable in private mode — swallow silently
    console.warn("[TUS Fingerprint] Failed to clear stale fingerprints:", err);
  }
}

/**
 * Clear ALL tus fingerprint keys from localStorage (called on session clear).
 */
export function clearAllTusFingerprints(): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(TUS_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    if (keysToRemove.length > 0) {
      console.log(`[TUS Fingerprint] Cleared all ${keysToRemove.length} TUS fingerprint(s)`);
    }
  } catch (err) {
    console.warn("[TUS Fingerprint] Failed to clear all fingerprints:", err);
  }
}
