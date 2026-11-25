import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { TagDefinition } from "@/features/tags/model/tags";
import type { TabInfo } from "@/shared/types";

/**
 * What a tag key or chip needs, shared through context so rows do not have to
 * pass it down. Null while the Tags feature is off, which hides every tag UI.
 */
export interface TagContextValue {
  tags: readonly TagDefinition[];
  /** Tag IDs per tab; may hold IDs of deleted tags, which readers skip. */
  tabTags: ReadonlyMap<number, readonly string[]>;
  /** The tab whose tag menu is open, if any. */
  menuTabId: number | null;
  /** Opens (or closes, when already open for `tab`) the tag menu under `anchor`. */
  toggleMenu: (tab: TabInfo, anchor: DOMRect) => void;
  /** Takes one tag off one tab, from the chip's close key. */
  removeFromTab: (tabId: number, tagId: string) => void;
}

export const TagContext = createContext<TagContextValue | null>(null);

export function useTagContext(): TagContextValue | null {
  return useContext(TagContext);
}
