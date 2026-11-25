import { reuseTabForUrl, type TabReuseDeps } from "@/features/intercept/background/external-tab";
import { LinkOpenPairer, type LinkOpen } from "@/features/intercept/model/link-claims";
import { readDisplaySettings } from "@/features/settings/model/display-settings";
import { isUsableTabId } from "@/shared/types";

interface CreatedTabEvent {
  id?: number;
  openerTabId?: number;
  url?: string;
}

export interface PageLinkReuse {
  /** A content script reported a click on a link that opens a new tab. */
  claim(sourceTabId: number, url: string): void;
  stop(): void;
}

/**
 * Reuse an open tab for links clicked inside web pages. The content script
 * reports the click (`linkOpensNewTab`); the tab it opens is paired with that
 * report and, when the address is already open, closed in favour of that tab.
 */
export function registerPageLinkReuse(
  deps: TabReuseDeps & {
    onCreated: {
      addListener(listener: (tab: CreatedTabEvent) => void): void;
      removeListener(listener: (tab: CreatedTabEvent) => void): void;
    };
    now?: () => number;
  },
): PageLinkReuse {
  const now = deps.now ?? Date.now;
  const pairer = new LinkOpenPairer();

  const reuse = (open: LinkOpen | undefined) => {
    if (open) {
      void reuseTabForUrl(open.tabId, open.url, deps);
    }
  };

  const onCreated = (tab: CreatedTabEvent) => {
    if (!isUsableTabId(tab.id)) {
      return;
    }
    reuse(
      pairer.addCreatedTab({
        tabId: tab.id,
        openerTabId: isUsableTabId(tab.openerTabId) ? tab.openerTabId : undefined,
        url: tab.url,
        at: now(),
      }),
    );
  };

  deps.onCreated.addListener(onCreated);
  return {
    claim(sourceTabId, url) {
      if (!isUsableTabId(sourceTabId)) {
        return;
      }
      reuse(pairer.addClaim({ sourceTabId, url, at: now() }));
    },
    stop() {
      deps.onCreated.removeListener(onCreated);
    },
  };
}

export function registerBrowserPageLinkReuse(
  deps: Omit<TabReuseDeps, "isEnabled">,
): PageLinkReuse {
  return registerPageLinkReuse({
    ...deps,
    onCreated: browser.tabs.onCreated,
    isEnabled: async () => (await readDisplaySettings()).reuseExternalTabs,
  });
}
