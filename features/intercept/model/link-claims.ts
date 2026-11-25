import { normalizeComparableUrl } from "@/features/intercept/model/reuse-url";

/** How long a link click and the tab it opens may be apart and still be paired. */
export const LINK_CLAIM_WINDOW_MS = 3_000;

/** A page reported that the user clicked a link that opens in a new tab. */
export interface LinkClaim {
  sourceTabId: number;
  url: string;
  at: number;
}

/** A tab that was just created, as `tabs.onCreated` reports it. */
export interface CreatedTab {
  tabId: number;
  openerTabId?: number;
  url?: string;
  at: number;
}

export interface LinkOpen {
  /** The tab the click opened. */
  tabId: number;
  /** The link's address, from the page rather than the new tab. */
  url: string;
}

/**
 * A new tab from a page link starts on about:blank and gets its address later,
 * so its own URL is not a reliable match. Accept that, or the link's address.
 */
function urlFits(tab: CreatedTab, claim: LinkClaim): boolean {
  if (!tab.url || tab.url === "about:blank") {
    return true;
  }
  const target = normalizeComparableUrl(claim.url);
  return target !== null && normalizeComparableUrl(tab.url) === target;
}

function pairs(tab: CreatedTab, claim: LinkClaim): boolean {
  if (tab.tabId === claim.sourceTabId) {
    return false;
  }
  if (Math.abs(tab.at - claim.at) > LINK_CLAIM_WINDOW_MS) {
    return false;
  }
  // Firefox sets the opener on tabs a page link opens. Without one, only a tab
  // that is still blank or already on the link's address can be the link's.
  if (tab.openerTabId !== undefined && tab.openerTabId !== claim.sourceTabId) {
    return false;
  }
  return urlFits(tab, claim);
}

/**
 * Pairs link clicks reported by content scripts with the tabs they open. The
 * click message and `tabs.onCreated` race each other, so either side may come
 * first; whichever arrives second completes the pair.
 */
export class LinkOpenPairer {
  private claims: LinkClaim[] = [];
  private created: CreatedTab[] = [];

  private prune(now: number): void {
    const cutoff = now - LINK_CLAIM_WINDOW_MS;
    this.claims = this.claims.filter((claim) => claim.at >= cutoff);
    this.created = this.created.filter((tab) => tab.at >= cutoff);
  }

  addClaim(claim: LinkClaim): LinkOpen | undefined {
    this.prune(claim.at);
    const index = this.created.findIndex((tab) => pairs(tab, claim));
    const tab = this.created[index];
    if (tab) {
      this.created.splice(index, 1);
      return { tabId: tab.tabId, url: claim.url };
    }
    this.claims.push(claim);
    return undefined;
  }

  addCreatedTab(tab: CreatedTab): LinkOpen | undefined {
    this.prune(tab.at);
    const index = this.claims.findIndex((claim) => pairs(tab, claim));
    const claim = this.claims[index];
    if (claim) {
      this.claims.splice(index, 1);
      return { tabId: tab.tabId, url: claim.url };
    }
    this.created.push(tab);
    return undefined;
  }
}

export interface LinkClickInfo {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** The link's `target` attribute. */
  target: string;
  /** The link's resolved `href`. */
  href: string;
  /** Whether the link has a `download` attribute. */
  download: boolean;
}

const SAME_WINDOW_TARGETS = new Set(["", "_self", "_parent", "_top"]);

/**
 * The address of a plain left-click on a link that opens a new tab, or
 * undefined. Middle-clicks and modifier clicks are left alone: those are how
 * people ask for a second copy on purpose.
 */
export function newTabLinkUrl(info: LinkClickInfo): string | undefined {
  if (info.button !== 0 || info.ctrlKey || info.metaKey || info.shiftKey || info.altKey) {
    return undefined;
  }
  if (info.download || SAME_WINDOW_TARGETS.has(info.target.trim().toLowerCase())) {
    return undefined;
  }
  try {
    const url = new URL(info.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
