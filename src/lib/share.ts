"use client";

export interface ShareParams {
  tab?: "repertoire" | "probeplan" | "kalender" | "historie" | "vorschlaege";
  session?: string | number | null;
  proposal?: string | null;
  view?: "swipe" | "results" | null;
  onboarding?: "1" | null;
  piece?: string | null;
}

/**
 * Builds a complete deep-link URL using the current browser origin and pathname.
 */
export function buildAppShareUrl(params: ShareParams): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:3000";
  const pathname =
    typeof window !== "undefined" && window.location?.pathname
      ? window.location.pathname
      : "/";

  const url = new URL(pathname, origin);

  if (params.tab) {
    url.searchParams.set("tab", params.tab);
  }
  if (params.session !== undefined && params.session !== null && params.session !== "") {
    url.searchParams.set("session", String(params.session));
  }
  if (params.proposal) {
    url.searchParams.set("proposal", params.proposal);
  }
  if (params.view) {
    url.searchParams.set("view", params.view);
  }
  if (params.onboarding) {
    url.searchParams.set("onboarding", params.onboarding);
  }
  if (params.piece) {
    url.searchParams.set("piece", params.piece);
  }

  return url.toString();
}

/**
 * Copies text to clipboard using modern Clipboard API with legacy textarea fallback
 * (so it works reliably on both HTTPS and local LAN HTTP rehearsal network IPs).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to document.execCommand("copy")
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Shares a link via Web Share API (if available on mobile/OS) with automatic
 * clipboard fallback. Also copies the URL to clipboard so the user always has
 * the link ready and receives visual "Link kopiert!" confirmation.
 */
export async function shareOrCopyLink(options: {
  url: string;
  title?: string;
  text?: string;
  useNativeShareIfAvailable?: boolean;
}): Promise<"shared" | "copied" | "failed"> {
  const { url, title, text, useNativeShareIfAvailable = true } = options;

  // Trigger clipboard copy immediately (without awaiting before navigator.share so transient user activation is preserved)
  const copyPromise = copyTextToClipboard(url);

  if (
    useNativeShareIfAvailable &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    const shareData: ShareData = {
      title: title || "Repertoire & Probeplan",
      text: text || undefined,
      url,
    };
    const canShare =
      typeof navigator.canShare !== "function" ||
      (() => {
        try {
          return navigator.canShare(shareData);
        } catch {
          return false;
        }
      })();

    if (canShare) {
      try {
        await navigator.share(shareData);
        await copyPromise;
        return "shared";
      } catch (err) {
        const errorName = err instanceof Error ? err.name : "";
        const copied = await copyPromise;
        if (errorName === "AbortError") {
          return copied ? "copied" : "failed";
        }
        return copied ? "copied" : "failed";
      }
    }
  }

  const copied = await copyPromise;
  return copied ? "copied" : "failed";
}
