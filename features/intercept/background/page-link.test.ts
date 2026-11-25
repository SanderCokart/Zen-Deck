import { describe, expect, it, vi } from "vitest";
import { registerPageLinkReuse } from "@/features/intercept/background/page-link";

const TICKET = "https://support.example.com/a/tickets/346461";

type CreatedListener = (tab: { id?: number; openerTabId?: number; url?: string }) => void;

function setup(enabled = true) {
  const listeners = new Set<CreatedListener>();
  const deps = {
    listTabs: vi.fn(async () => [
      { id: 1, url: "https://gitlab.example.com/group/app/-/issues/42" },
      { id: 4, url: TICKET, lastOpenedAt: 20 },
    ]),
    activateTab: vi.fn(async () => undefined),
    removeTab: vi.fn(async () => undefined),
    recordOpened: vi.fn(async () => undefined),
    isEnabled: vi.fn(async () => enabled),
    onCreated: {
      addListener: (listener: CreatedListener) => listeners.add(listener),
      removeListener: (listener: CreatedListener) => listeners.delete(listener),
    },
    now: () => 1_000,
  };
  const reuse = registerPageLinkReuse(deps);
  const create = (tab: Parameters<CreatedListener>[0]) => {
    for (const listener of listeners) listener(tab);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { deps, reuse, create, settle, listeners };
}

describe("registerPageLinkReuse", () => {
  it("focuses the open tab and closes the one a page link just opened", async () => {
    const { deps, reuse, create, settle } = setup();

    reuse.claim(1, TICKET);
    create({ id: 9, openerTabId: 1, url: "about:blank" });
    await settle();

    expect(deps.activateTab).toHaveBeenCalledWith(4, undefined, 9);
    expect(deps.removeTab).toHaveBeenCalledWith(9);
    expect(deps.recordOpened).toHaveBeenCalledWith(4);
  });

  it("also works when the tab is created before the click report arrives", async () => {
    const { deps, reuse, create, settle } = setup();

    create({ id: 9, openerTabId: 1, url: "about:blank" });
    reuse.claim(1, TICKET);
    await settle();

    expect(deps.removeTab).toHaveBeenCalledWith(9);
  });

  it("leaves new tabs that no link click accounts for", async () => {
    const { deps, create, settle } = setup();

    create({ id: 9, openerTabId: 1, url: "about:blank" });
    await settle();

    expect(deps.listTabs).not.toHaveBeenCalled();
    expect(deps.removeTab).not.toHaveBeenCalled();
  });

  it("leaves the new tab when reuse is turned off", async () => {
    const { deps, reuse, create, settle } = setup(false);

    reuse.claim(1, TICKET);
    create({ id: 9, openerTabId: 1 });
    await settle();

    expect(deps.removeTab).not.toHaveBeenCalled();
  });

  it("stops listening for new tabs", () => {
    const { reuse, listeners } = setup();
    reuse.stop();
    expect(listeners.size).toBe(0);
  });
});
