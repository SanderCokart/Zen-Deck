import type { SpaceInfo, TabInfo, TabStatus, TabTags, TabTimer } from "@/shared/types";
import { tabBrowserIds } from "@/shared/types";
import { debugLog } from "@/shared/debug";
import { LOG_PREFIX } from "@/shared/log";
import { SNAPSHOT_CHANGED_TYPE } from "@/shared/messaging/protocol";
import { mergeTabLastOpened, TAB_LAST_OPENED_STORAGE_KEY } from "@/features/zen/tab-last-opened";
import {
  FORGE_TARGET_BRANCHES_STORAGE_KEY,
  mergeTabTargetBranches,
  type StoredTargetBranches,
} from "@/features/forge/model/target-branch";

export interface SearchSnapshotPayload {
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  timers: TabTimer[];
  statuses: TabStatus[];
  tags: TabTags[];
}

export function createSnapshotReader(deps: {
  queryTabs(anchorTabId?: number): Promise<TabInfo[]>;
  getSpaces(anchorTabId?: number): Promise<SpaceInfo[]>;
  getTimers(tabIds?: number[]): Promise<TabTimer[]>;
  getStatuses?(tabIds: number[]): Promise<TabStatus[]>;
  getTags?(tabIds: number[]): Promise<TabTags[]>;
  readLastOpened?(): Promise<Record<string, number>>;
  readTargetBranches?(): Promise<StoredTargetBranches>;
}): (anchorTabId?: number) => Promise<SearchSnapshotPayload> {
  return async (anchorTabId?: number): Promise<SearchSnapshotPayload> => {
    const started = performance.now();
    const [tabs, spaces, lastOpened, targetBranches] = await Promise.all([
      deps.queryTabs(anchorTabId),
      deps.getSpaces(anchorTabId),
      deps.readLastOpened?.() ?? Promise.resolve({}),
      deps.readTargetBranches?.() ?? Promise.resolve({}),
    ]);
    const tabsReady = performance.now();
    const tabIds = tabBrowserIds(tabs);
    const timed = <T>(label: string, read: Promise<T>): Promise<T> => {
      const begun = performance.now();
      return read.finally(() => {
        debugLog(`${LOG_PREFIX} snapshot ${label}: ${(performance.now() - begun).toFixed(1)} ms`);
      });
    };
    const [timers, statuses, tags] = await Promise.all([
      timed("timers", deps.getTimers(tabIds)),
      timed("statuses", deps.getStatuses ? deps.getStatuses(tabIds) : Promise.resolve([])),
      timed("tags", deps.getTags ? deps.getTags(tabIds) : Promise.resolve([])),
    ]);
    debugLog(
      `${LOG_PREFIX} snapshot tabs+spaces: ${(tabsReady - started).toFixed(1)} ms, ` +
        `total: ${(performance.now() - started).toFixed(1)} ms, tabs: ${tabs.length}`,
    );
    return {
      tabs: mergeTabTargetBranches(mergeTabLastOpened(tabs, lastOpened), targetBranches),
      spaces,
      timers,
      statuses,
      tags,
    };
  };
}

export function createCachedSnapshotReader(
  read: (anchorTabId?: number) => Promise<SearchSnapshotPayload>,
): {
  getSnapshot(anchorTabId?: number): Promise<SearchSnapshotPayload>;
  invalidate(): void;
} {
  const UNSET = Symbol("unset");
  let epoch = 0;
  let payload: SearchSnapshotPayload | undefined;
  let payloadAnchor: number | undefined | typeof UNSET = UNSET;
  let inflight: Promise<SearchSnapshotPayload> | undefined;
  let inflightAnchor: number | undefined | typeof UNSET = UNSET;
  let inflightEpoch = -1;

  return {
    invalidate() {
      epoch += 1;
      payload = undefined;
      payloadAnchor = UNSET;
    },
    async getSnapshot(anchorTabId?: number): Promise<SearchSnapshotPayload> {
      if (payload && payloadAnchor === anchorTabId) {
        return payload;
      }
      // A read begun before the last invalidation may hold the old active tab.
      if (inflight && inflightAnchor === anchorTabId && inflightEpoch === epoch) {
        return inflight;
      }

      const started = epoch;
      const request = read(anchorTabId)
        .then((next) => {
          if (started === epoch) {
            payload = next;
            payloadAnchor = anchorTabId;
          }
          return next;
        })
        .finally(() => {
          if (inflight === request) {
            inflight = undefined;
            inflightAnchor = UNSET;
            inflightEpoch = -1;
          }
        });
      inflight = request;
      inflightAnchor = anchorTabId;
      inflightEpoch = started;
      return request;
    },
  };
}

export function notifySnapshotChanged(): void {
  void browser.runtime.sendMessage({ type: SNAPSHOT_CHANGED_TYPE }).catch(() => {
    // Popup and omnibar listeners are optional.
  });
}

/**
 * Broadcasts `snapshotChanged` once a burst of tab and storage events settles.
 * `onInvalidate` runs on every event, not after the debounce, so a snapshot
 * read in the meantime (Alt+F right after a tab switch) is not the cached one.
 */
export function registerSnapshotChangeNotifications(
  debounceMs = 150,
  onInvalidate?: () => void,
): () => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    onInvalidate?.();
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = undefined;
      notifySnapshotChanged();
    }, debounceMs);
  };

  const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
    if (
      area === "local" &&
      ("tabTimers" in changes ||
        TAB_LAST_OPENED_STORAGE_KEY in changes ||
        FORGE_TARGET_BRANCHES_STORAGE_KEY in changes)
    ) {
      notify();
    }
  };
  const onTabUpdated = (
    _tabId: number,
    changeInfo: {
      url?: string;
      title?: string;
      pinned?: boolean;
      favIconUrl?: string;
      status?: string;
    },
  ) => {
    if (changeInfo.url || changeInfo.title !== undefined || changeInfo.pinned !== undefined) {
      notify();
    }
  };

  browser.storage.onChanged.addListener(onStorageChanged);
  browser.tabs.onCreated.addListener(notify);
  browser.tabs.onRemoved.addListener(notify);
  browser.tabs.onUpdated.addListener(onTabUpdated);
  browser.tabs.onActivated.addListener(notify);
  browser.tabs.onMoved.addListener(notify);

  return () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    browser.storage.onChanged.removeListener(onStorageChanged);
    browser.tabs.onCreated.removeListener(notify);
    browser.tabs.onRemoved.removeListener(notify);
    browser.tabs.onUpdated.removeListener(onTabUpdated);
    browser.tabs.onActivated.removeListener(notify);
    browser.tabs.onMoved.removeListener(notify);
  };
}
