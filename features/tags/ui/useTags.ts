import { useCallback, useMemo, useState } from "preact/hooks";
import {
  createTag,
  deleteTag,
  parseTagDefinitions,
  sameTagDefinitions,
  setTagColor,
  TAG_DEFINITIONS_STORAGE_KEY,
  toggleTabTag,
  type TagColor,
  type TagDefinition,
} from "@/features/tags/model/tags";
import type { TagContextValue } from "@/features/tags/ui/TagContext";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import { tabBrowserId, type TabInfo } from "@/shared/types";
import { type StoredStateCache, useStoredValue } from "@/shared/ui/hooks/useStoredValue";

type TabTagMap = Map<number, string[]>;

export interface UseTagsOptions {
  cache?: StoredStateCache;
  /** Tag IDs per tab, from the snapshot. */
  tabTags: TabTagMap;
  setTabTags: (update: (current: TabTagMap) => TabTagMap) => void;
  /** Plays the latch sound as the tag key goes down or up. */
  onLatch?: (down: boolean) => void;
  /** Called as a tag menu opens, so other menus can close. */
  onOpen?: () => void;
}

/**
 * Tag state for the search surface: the tag list (names and colours, kept in
 * storage.local), which tab's tag menu is open, and the edits that menu makes.
 * Edits show at once; the background stores the per-tab IDs.
 */
export function useTags({ cache, tabTags, setTabTags, onLatch, onOpen }: UseTagsOptions) {
  const stored = useStoredValue<TagDefinition[]>(
    TAG_DEFINITIONS_STORAGE_KEY,
    parseTagDefinitions,
    cache,
    { label: "tags", isEqual: sameTagDefinitions },
  );
  const [menu, setMenu] = useState<{ tabId: number; x: number; y: number } | null>(null);

  const writeTabTags = useCallback(
    (tabId: number, tagIds: string[]) => {
      setTabTags((current) => {
        const next = new Map(current);
        if (tagIds.length === 0) next.delete(tabId);
        else next.set(tabId, tagIds);
        return next;
      });
      void sendExtensionMessage({ type: "setTabTags", tabId, tagIds }).catch((error) =>
        debugError("Could not update tags:", error),
      );
    },
    [setTabTags],
  );

  const toggleMenu = useCallback(
    (tab: TabInfo, anchor: DOMRect) => {
      const tabId = tabBrowserId(tab);
      if (tabId === undefined) return;
      const closing = menu?.tabId === tabId;
      onLatch?.(!closing);
      if (!closing) onOpen?.();
      setMenu(closing ? null : { tabId, x: anchor.left, y: anchor.bottom + 4 });
    },
    [menu, onLatch, onOpen],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const toggleTag = (tabId: number, tagId: string) => {
    writeTabTags(tabId, toggleTabTag(stored.latest(), tabTags.get(tabId), tagId));
  };

  const removeFromTab = useCallback(
    (tabId: number, tagId: string) => {
      const current = tabTags.get(tabId) ?? [];
      if (!current.includes(tagId)) return;
      writeTabTags(
        tabId,
        current.filter((id) => id !== tagId),
      );
    },
    [tabTags, writeTabTags],
  );

  const createAndAssign = (tabId: number, name: string) => {
    const { tags, tag } = createTag(stored.latest(), name);
    if (tag === undefined) return;
    stored.set(tags);
    const current = tabTags.get(tabId) ?? [];
    if (!current.includes(tag.id)) {
      writeTabTags(tabId, toggleTabTag(tags, current, tag.id));
    }
  };

  const recolor = (tagId: string, color: TagColor) => {
    stored.set(setTagColor(stored.latest(), tagId, color));
  };

  const remove = (tagId: string) => {
    stored.set(deleteTag(stored.latest(), tagId));
    setTabTags((current) => {
      const next = new Map(current);
      for (const [tabId, ids] of current) {
        if (!ids.includes(tagId)) continue;
        const rest = ids.filter((id) => id !== tagId);
        if (rest.length === 0) next.delete(tabId);
        else next.set(tabId, rest);
      }
      return next;
    });
    void sendExtensionMessage({ type: "removeTagFromTabs", tagId }).catch((error) =>
      debugError("Could not remove tag from tabs:", error),
    );
  };

  const context = useMemo<TagContextValue>(
    () => ({
      tags: stored.value,
      tabTags,
      menuTabId: menu?.tabId ?? null,
      toggleMenu,
      removeFromTab,
    }),
    [stored.value, tabTags, menu, toggleMenu, removeFromTab],
  );

  return {
    tags: stored.value,
    loaded: stored.loaded,
    context,
    menu,
    closeMenu,
    toggleTag,
    createAndAssign,
    recolor,
    remove,
  };
}
