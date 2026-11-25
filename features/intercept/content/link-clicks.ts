import { newTabLinkUrl } from "@/features/intercept/model/link-claims";
import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { sendExtensionMessage } from "@/shared/messaging/client";

function findLink(event: MouseEvent): HTMLAnchorElement | HTMLAreaElement | undefined {
  for (const node of event.composedPath()) {
    if (
      (node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement) &&
      node.hasAttribute("href")
    ) {
      return node;
    }
  }
  return undefined;
}

/**
 * Tells the background about plain clicks on links that open a new tab, so it
 * can focus a tab that already has the address instead. Capture phase, so a
 * page that stops the click's propagation is still seen; a click the page
 * handles itself opens no tab, and its report expires unused.
 */
export function watchNewTabLinkClicks(target: Window = window): () => void {
  const onClick = (event: MouseEvent) => {
    const link = findLink(event);
    if (!link) {
      return;
    }
    const url = newTabLinkUrl({
      button: event.button,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      target: link.target,
      href: link.href,
      download: link.hasAttribute("download"),
    });
    if (!url) {
      return;
    }
    void sendExtensionMessage({ type: "linkOpensNewTab", url }).catch((error: unknown) => {
      debugWarn(`${LOG_PREFIX} Could not report a new-tab link:`, formatError(error));
    });
  };

  target.addEventListener("click", onClick, true);
  return () => {
    target.removeEventListener("click", onClick, true);
  };
}
