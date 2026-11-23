import * as v from "valibot";
import { isUsableTabId, type TabInfo } from "@/shared/types";

export const TODO_FOLDERS_STORAGE_KEY = "todoFolders";

export type TodoFolder = {
  id: string;
  name: string;
  collapsed: boolean;
};

export type TodoFolderState = {
  folders: TodoFolder[];
  /** Tab IDs in each folder, in display order. Closed IDs are skipped when applying. */
  members: Record<string, number[]>;
};

export const EMPTY_TODO_FOLDER_STATE: TodoFolderState = { folders: [], members: {} };

const todoFolderSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  collapsed: v.optional(v.boolean()),
});

const todoFolderStateSchema = v.object({
  folders: v.array(todoFolderSchema),
  members: v.record(v.string(), v.array(v.pipe(v.number(), v.integer(), v.minValue(0)))),
});

function normalizeFolder(folder: v.InferOutput<typeof todoFolderSchema>): TodoFolder {
  return { id: folder.id, name: folder.name, collapsed: folder.collapsed === true };
}

/** Whatever storage holds as folders; anything unreadable is none. */
export function parseTodoFolderState(value: unknown): TodoFolderState {
  const parsed = v.safeParse(todoFolderStateSchema, value);
  if (!parsed.success) {
    return EMPTY_TODO_FOLDER_STATE;
  }
  const seen = new Set<string>();
  const folders: TodoFolder[] = [];
  for (const folder of parsed.output.folders) {
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    folders.push(normalizeFolder(folder));
  }
  const members: Record<string, number[]> = {};
  for (const folder of folders) {
    const ids = parsed.output.members[folder.id] ?? [];
    const unique: number[] = [];
    const used = new Set<number>();
    for (const id of ids) {
      if (used.has(id)) continue;
      used.add(id);
      unique.push(id);
    }
    members[folder.id] = unique;
  }
  return { folders, members };
}

export function sameTodoFolderState(a: TodoFolderState, b: TodoFolderState): boolean {
  if (a.folders.length !== b.folders.length) return false;
  for (let index = 0; index < a.folders.length; index += 1) {
    const left = a.folders[index];
    const right = b.folders[index];
    if (
      left === undefined ||
      right === undefined ||
      left.id !== right.id ||
      left.name !== right.name ||
      left.collapsed !== right.collapsed
    ) {
      return false;
    }
  }
  if (Object.keys(a.members).length !== Object.keys(b.members).length) return false;
  for (const [folderId, ids] of Object.entries(a.members)) {
    const other = b.members[folderId];
    if (other === undefined || other.length !== ids.length) return false;
    if (ids.some((id, index) => id !== other[index])) return false;
  }
  return true;
}

/** The next unused "Folder" / "Folder 2" name. */
export function nextFolderName(folders: readonly TodoFolder[]): string {
  const taken = new Set(folders.map((folder) => folder.name));
  if (!taken.has("Folder")) return "Folder";
  let n = 2;
  while (taken.has(`Folder ${n}`)) {
    n += 1;
  }
  return `Folder ${n}`;
}

function withMembers(state: TodoFolderState, members: Record<string, number[]>): TodoFolderState {
  return { folders: state.folders, members };
}

function withoutTab(members: Record<string, number[]>, tabId: number): Record<string, number[]> {
  const next: Record<string, number[]> = {};
  for (const [folderId, ids] of Object.entries(members)) {
    next[folderId] = ids.filter((id) => id !== tabId);
  }
  return next;
}

export function addTodoFolder(
  state: TodoFolderState,
  name = nextFolderName(state.folders),
  makeId: () => string = () => crypto.randomUUID(),
): TodoFolderState {
  const trimmed = name.trim();
  const folder: TodoFolder = {
    id: makeId(),
    name: trimmed.length > 0 ? trimmed : nextFolderName(state.folders),
    collapsed: false,
  };
  return {
    folders: [...state.folders, folder],
    members: { ...state.members, [folder.id]: [] },
  };
}

export function renameTodoFolder(
  state: TodoFolderState,
  folderId: string,
  name: string,
): TodoFolderState {
  const trimmed = name.trim();
  if (trimmed.length === 0) return state;
  return {
    ...state,
    folders: state.folders.map((folder) =>
      folder.id === folderId ? { ...folder, name: trimmed } : folder,
    ),
  };
}

export function removeTodoFolder(state: TodoFolderState, folderId: string): TodoFolderState {
  const { [folderId]: _removed, ...members } = state.members;
  return {
    folders: state.folders.filter((folder) => folder.id !== folderId),
    members,
  };
}

export function toggleTodoFolder(state: TodoFolderState, folderId: string): TodoFolderState {
  return {
    ...state,
    folders: state.folders.map((folder) =>
      folder.id === folderId ? { ...folder, collapsed: !folder.collapsed } : folder,
    ),
  };
}

export function reorderTodoFolders(
  state: TodoFolderState,
  folderIds: readonly string[],
): TodoFolderState {
  const byId = new Map(state.folders.map((folder) => [folder.id, folder]));
  const folders: TodoFolder[] = [];
  const seen = new Set<string>();
  for (const id of folderIds) {
    const folder = byId.get(id);
    if (folder && !seen.has(id)) {
      folders.push(folder);
      seen.add(id);
    }
  }
  for (const folder of state.folders) {
    if (!seen.has(folder.id)) folders.push(folder);
  }
  return { folders, members: state.members };
}

export function setFolderMembers(
  state: TodoFolderState,
  folderId: string,
  tabIds: readonly number[],
): TodoFolderState {
  if (!state.folders.some((folder) => folder.id === folderId)) return state;
  let members = { ...state.members };
  for (const tabId of tabIds) {
    members = withoutTab(members, tabId);
  }
  const unique: number[] = [];
  const used = new Set<number>();
  for (const id of tabIds) {
    if (used.has(id)) continue;
    used.add(id);
    unique.push(id);
  }
  members[folderId] = unique;
  return withMembers(state, members);
}

/** Puts `tabId` in `folderId`, or ungroups it when `folderId` is null. */
export function moveTodoToFolder(
  state: TodoFolderState,
  tabId: number,
  folderId: string | null,
): TodoFolderState {
  const members = withoutTab(state.members, tabId);
  if (folderId !== null && state.folders.some((folder) => folder.id === folderId)) {
    members[folderId] = [...(members[folderId] ?? []), tabId];
  }
  return withMembers(state, members);
}

export function folderIdForTab(state: TodoFolderState, tabId: number): string | undefined {
  for (const folder of state.folders) {
    if ((state.members[folder.id] ?? []).includes(tabId)) return folder.id;
  }
  return undefined;
}

function tabsById(tabs: readonly TabInfo[]): Map<number, TabInfo> {
  const byId = new Map<number, TabInfo>();
  for (const tab of tabs) {
    if (isUsableTabId(tab.id)) byId.set(tab.id, tab);
  }
  return byId;
}

/** The todo tabs in `folderId`, in saved member order, then leftovers. */
export function folderTodoTabs(
  tabs: readonly TabInfo[],
  state: TodoFolderState,
  folderId: string,
): TabInfo[] {
  const byId = tabsById(tabs);
  const seen = new Set<number>();
  const ordered: TabInfo[] = [];
  for (const id of state.members[folderId] ?? []) {
    const tab = byId.get(id);
    if (tab && !seen.has(id)) {
      ordered.push(tab);
      seen.add(id);
    }
  }
  return ordered;
}

function groupedTabIds(state: TodoFolderState): Set<number> {
  const grouped = new Set<number>();
  for (const folder of state.folders) {
    for (const id of state.members[folder.id] ?? []) grouped.add(id);
  }
  return grouped;
}

/** Todo tabs that are not in any folder, keeping `tabs` order. */
export function ungroupedTodoTabs(tabs: readonly TabInfo[], state: TodoFolderState): TabInfo[] {
  const grouped = groupedTabIds(state);
  return tabs.filter((tab) => isUsableTabId(tab.id) && !grouped.has(tab.id));
}

export type TodoColumnSection =
  | { kind: "folder"; folder: TodoFolder; tabs: TabInfo[] }
  | { kind: "loose"; tabs: TabInfo[] };

/** Folders in saved order, then the leftover todos as one loose list. */
export function todoColumnSections(
  tabs: readonly TabInfo[],
  state: TodoFolderState,
): TodoColumnSection[] {
  const sections: TodoColumnSection[] = state.folders.map((folder) => ({
    kind: "folder" as const,
    folder,
    tabs: folderTodoTabs(tabs, state, folder.id),
  }));
  const loose = ungroupedTodoTabs(tabs, state);
  if (loose.length > 0) {
    sections.push({ kind: "loose", tabs: loose });
  }
  return sections;
}

/**
 * Keyboard / count order: every todo while filtering, otherwise skip collapsed
 * folders except the current tab, which stays visible.
 */
export function visibleTodoTabs(
  tabs: readonly TabInfo[],
  state: TodoFolderState,
  filtering = false,
): TabInfo[] {
  if (filtering || state.folders.length === 0) return [...tabs];
  const visible: TabInfo[] = [];
  for (const section of todoColumnSections(tabs, state)) {
    if (section.kind === "loose") {
      visible.push(...section.tabs);
      continue;
    }
    if (!section.folder.collapsed) {
      visible.push(...section.tabs);
      continue;
    }
    for (const tab of section.tabs) {
      if (tab.active === true) visible.push(tab);
    }
  }
  return visible;
}
