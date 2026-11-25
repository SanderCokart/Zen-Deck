import { describe, expect, it } from "vitest";
import {
  LINK_CLAIM_WINDOW_MS,
  LinkOpenPairer,
  newTabLinkUrl,
  type LinkClickInfo,
} from "@/features/intercept/model/link-claims";

const TICKET = "https://support.example.com/a/tickets/346461";

describe("LinkOpenPairer", () => {
  it("pairs a click with the blank tab it opened, whichever arrives first", () => {
    const clickFirst = new LinkOpenPairer();
    expect(clickFirst.addClaim({ sourceTabId: 1, url: TICKET, at: 100 })).toBeUndefined();
    expect(
      clickFirst.addCreatedTab({ tabId: 7, openerTabId: 1, url: "about:blank", at: 120 }),
    ).toEqual({ tabId: 7, url: TICKET });

    const tabFirst = new LinkOpenPairer();
    expect(tabFirst.addCreatedTab({ tabId: 7, openerTabId: 1, at: 100 })).toBeUndefined();
    expect(tabFirst.addClaim({ sourceTabId: 1, url: TICKET, at: 110 })).toEqual({
      tabId: 7,
      url: TICKET,
    });
  });

  it("pairs each click and each tab only once", () => {
    const pairer = new LinkOpenPairer();
    pairer.addClaim({ sourceTabId: 1, url: TICKET, at: 100 });
    expect(pairer.addCreatedTab({ tabId: 7, openerTabId: 1, at: 110 })).toBeDefined();
    expect(pairer.addCreatedTab({ tabId: 8, openerTabId: 1, at: 120 })).toBeUndefined();
  });

  it("ignores tabs opened from another tab", () => {
    const pairer = new LinkOpenPairer();
    pairer.addClaim({ sourceTabId: 1, url: TICKET, at: 100 });
    expect(pairer.addCreatedTab({ tabId: 7, openerTabId: 2, at: 110 })).toBeUndefined();
  });

  it("ignores a tab without an opener that is already on another address", () => {
    const pairer = new LinkOpenPairer();
    pairer.addClaim({ sourceTabId: 1, url: TICKET, at: 100 });
    expect(pairer.addCreatedTab({ tabId: 7, url: "about:newtab", at: 110 })).toBeUndefined();
    expect(pairer.addCreatedTab({ tabId: 8, url: `${TICKET}#top`, at: 120 })).toEqual({
      tabId: 8,
      url: TICKET,
    });
  });

  it("lets a click expire when no tab follows in time", () => {
    const pairer = new LinkOpenPairer();
    pairer.addClaim({ sourceTabId: 1, url: TICKET, at: 100 });
    expect(
      pairer.addCreatedTab({ tabId: 7, openerTabId: 1, at: 101 + LINK_CLAIM_WINDOW_MS }),
    ).toBeUndefined();
  });

  it("never pairs the tab the click came from", () => {
    const pairer = new LinkOpenPairer();
    pairer.addClaim({ sourceTabId: 1, url: TICKET, at: 100 });
    expect(pairer.addCreatedTab({ tabId: 1, at: 110 })).toBeUndefined();
  });
});

describe("newTabLinkUrl", () => {
  const click = (partial: Partial<LinkClickInfo> = {}): LinkClickInfo => ({
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: "_blank",
    href: TICKET,
    download: false,
    ...partial,
  });

  it("returns the address of a plain click on a target=_blank link", () => {
    expect(newTabLinkUrl(click())).toBe(TICKET);
    expect(newTabLinkUrl(click({ target: "_BLANK" }))).toBe(TICKET);
    expect(newTabLinkUrl(click({ target: "ticket-window" }))).toBe(TICKET);
  });

  it("leaves middle-clicks and modifier clicks alone", () => {
    expect(newTabLinkUrl(click({ button: 1 }))).toBeUndefined();
    expect(newTabLinkUrl(click({ ctrlKey: true }))).toBeUndefined();
    expect(newTabLinkUrl(click({ metaKey: true }))).toBeUndefined();
    expect(newTabLinkUrl(click({ shiftKey: true }))).toBeUndefined();
    expect(newTabLinkUrl(click({ altKey: true }))).toBeUndefined();
  });

  it("leaves links that stay in the same tab alone", () => {
    for (const target of ["", "_self", "_parent", "_top"]) {
      expect(newTabLinkUrl(click({ target }))).toBeUndefined();
    }
  });

  it("leaves downloads and non-web addresses alone", () => {
    expect(newTabLinkUrl(click({ download: true }))).toBeUndefined();
    expect(newTabLinkUrl(click({ href: "mailto:someone@example.com" }))).toBeUndefined();
    expect(newTabLinkUrl(click({ href: "javascript:void(0)" }))).toBeUndefined();
  });
});
