import { afterEach, describe, expect, it, vi } from "vitest";
import { createTagService } from "@/features/tags/background/tag-service";

/** A stand-in for `browser.sessions`, holding whatever the service saves per tab. */
function stubSessions(initial: Record<number, unknown> = {}) {
  const values = new Map<number, unknown>(
    Object.entries(initial).map(([id, value]) => [Number(id), value]),
  );
  Object.assign(globalThis, {
    browser: {
      sessions: {
        getTabValue: vi.fn(async (tabId: number) => values.get(tabId)),
        setTabValue: vi.fn(async (tabId: number, _key: string, value: unknown) => {
          values.set(tabId, value);
        }),
        removeTabValue: vi.fn(async (tabId: number) => {
          values.delete(tabId);
        }),
      },
    },
  });
  return values;
}

describe("tag service", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("saves a tab's tags in its session, without repeats, and clears an empty list", async () => {
    const values = stubSessions();
    const service = createTagService();

    await service.setTags(1, ["a", "b", "a"]);
    await expect(service.getTags([1, 2])).resolves.toEqual([{ tabId: 1, tagIds: ["a", "b"] }]);
    expect(values.get(1)).toEqual(["a", "b"]);

    await service.setTags(1, []);
    await expect(service.getTags([1])).resolves.toEqual([]);
    expect(values.has(1)).toBe(false);
  });

  it("reads saved tags and ignores anything else", async () => {
    stubSessions({ 1: ["a"], 2: "a", 3: [1] });
    const service = createTagService();

    await expect(service.getTags([1, 2, 3])).resolves.toEqual([{ tabId: 1, tagIds: ["a"] }]);
  });

  it("takes a deleted tag off every tab read so far", async () => {
    const values = stubSessions({ 1: ["a", "b"], 2: ["a"], 3: ["b"] });
    const service = createTagService();
    await service.hydrate([1, 2, 3]);

    await service.removeTag("a");

    await expect(service.getTags([1, 2, 3])).resolves.toEqual([
      { tabId: 1, tagIds: ["b"] },
      { tabId: 3, tagIds: ["b"] },
    ]);
    expect(values.has(2)).toBe(false);
  });
});
