import * as v from "valibot";
import type { TabTags } from "@/shared/types";
import { createTabSessionValues } from "@/shared/tab-session-values";

const tagIdsSchema = v.array(v.pipe(v.string(), v.minLength(1)));

/**
 * The tag IDs on each tab, kept in that tab's session data like a status
 * colour. Tag names and colours are not stored here: the UI keeps them in
 * storage.local and ignores IDs it no longer knows.
 */
export function createTagService() {
  const values = createTabSessionValues<string[]>("tabTags", tagIdsSchema);

  const setTags = (tabId: number, tagIds: string[]): Promise<void> => {
    const unique = [...new Set(tagIds)];
    return values.set(tabId, unique.length === 0 ? undefined : unique);
  };

  return {
    setTags,
    /** The tags of each of these tabs that has any. */
    getTags: async (tabIds: number[]): Promise<TabTags[]> =>
      (await values.get(tabIds)).map(({ tabId, value }) => ({ tabId, tagIds: value })),
    /**
     * Takes a deleted tag off every tab read so far. Tabs not read yet keep the
     * ID in their session data, but the UI skips IDs that are not in its list.
     */
    removeTag: async (tagId: string): Promise<void> => {
      await Promise.all(
        values
          .entries()
          .filter(({ value }) => value.includes(tagId))
          .map(({ tabId, value }) =>
            setTags(
              tabId,
              value.filter((id) => id !== tagId),
            ),
          ),
      );
    },
    hydrate: values.hydrate,
    forget: values.forget,
  };
}

export type TagService = ReturnType<typeof createTagService>;
