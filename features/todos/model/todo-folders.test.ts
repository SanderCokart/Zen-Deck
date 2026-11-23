import { describe, expect, it } from "vitest";
import type { TabInfo } from "@/shared/types";
import {
  addTodoFolder,
  EMPTY_TODO_FOLDER_STATE,
  folderIdForTab,
  folderTodoTabs,
  moveTodoToFolder,
  nextFolderName,
  parseTodoFolderState,
  removeTodoFolder,
  renameTodoFolder,
  reorderTodoFolders,
  sameTodoFolderState,
  setFolderMembers,
  todoColumnSections,
  toggleTodoFolder,
  ungroupedTodoTabs,
  visibleTodoTabs,
  type TodoFolderState,
} from "@/features/todos/model/todo-folders";

function tab(id: number, title = `Tab ${id}`, active = false): TabInfo {
  return { id, title, url: "https://example.com", favIconUrl: "", windowId: 1, active };
}

function state(partial: Partial<TodoFolderState> = {}): TodoFolderState {
  return {
    folders: partial.folders ?? [],
    members: partial.members ?? {},
  };
}

describe("todo folders", () => {
  it("reads a saved folder state, and treats junk as none", () => {
    expect(parseTodoFolderState(undefined)).toEqual(EMPTY_TODO_FOLDER_STATE);
    expect(parseTodoFolderState({ folders: "nope" })).toEqual(EMPTY_TODO_FOLDER_STATE);
    expect(
      parseTodoFolderState({
        folders: [
          { id: "a", name: "Inbox", collapsed: true },
          { id: "a", name: "Dup" },
          { id: "b", name: "Later" },
        ],
        members: { a: [2, 2, 1], b: [3], ghost: [9] },
      }),
    ).toEqual({
      folders: [
        { id: "a", name: "Inbox", collapsed: true },
        { id: "b", name: "Later", collapsed: false },
      ],
      members: { a: [2, 1], b: [3] },
    });
  });

  it("names new folders Folder, then Folder 2", () => {
    expect(nextFolderName([])).toBe("Folder");
    expect(nextFolderName([{ id: "a", name: "Folder", collapsed: false }])).toBe("Folder 2");
    expect(
      nextFolderName([
        { id: "a", name: "Folder", collapsed: false },
        { id: "b", name: "Folder 2", collapsed: false },
      ]),
    ).toBe("Folder 3");
  });

  it("adds, renames, toggles and removes folders", () => {
    const added = addTodoFolder(EMPTY_TODO_FOLDER_STATE, "Inbox", () => "f1");
    expect(added).toEqual({
      folders: [{ id: "f1", name: "Inbox", collapsed: false }],
      members: { f1: [] },
    });
    expect(renameTodoFolder(added, "f1", "  Later  ").folders[0]?.name).toBe("Later");
    expect(renameTodoFolder(added, "f1", "   ")).toEqual(added);
    expect(toggleTodoFolder(added, "f1").folders[0]?.collapsed).toBe(true);
    expect(removeTodoFolder({ ...added, members: { f1: [1] } }, "f1")).toEqual(
      EMPTY_TODO_FOLDER_STATE,
    );
  });

  it("reorders folders and keeps ones the new order omitted", () => {
    const start = state({
      folders: [
        { id: "a", name: "A", collapsed: false },
        { id: "b", name: "B", collapsed: false },
        { id: "c", name: "C", collapsed: false },
      ],
    });
    expect(reorderTodoFolders(start, ["c", "a"]).folders.map((folder) => folder.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("moves a todo into a folder, between folders, and back out", () => {
    const start = addTodoFolder(
      addTodoFolder(EMPTY_TODO_FOLDER_STATE, "A", () => "a"),
      "B",
      () => "b",
    );
    const inA = moveTodoToFolder(start, 1, "a");
    expect(inA.members).toEqual({ a: [1], b: [] });
    expect(folderIdForTab(inA, 1)).toBe("a");
    const inB = moveTodoToFolder(inA, 1, "b");
    expect(inB.members).toEqual({ a: [], b: [1] });
    expect(moveTodoToFolder(inB, 1, null).members).toEqual({ a: [], b: [] });
    expect(moveTodoToFolder(inA, 1, "missing").members).toEqual({ a: [], b: [] });
  });

  it("sets a folder's member order and pulls those tabs out of other folders", () => {
    const start = {
      folders: [
        { id: "a", name: "A", collapsed: false },
        { id: "b", name: "B", collapsed: false },
      ],
      members: { a: [1], b: [2] },
    };
    expect(setFolderMembers(start, "a", [2, 1, 2]).members).toEqual({ a: [2, 1], b: [] });
    expect(setFolderMembers(start, "missing", [1])).toEqual(start);
  });

  it("lays out folders then leftover todos, skipping closed member ids", () => {
    const folders = state({
      folders: [
        { id: "a", name: "A", collapsed: true },
        { id: "b", name: "B", collapsed: false },
      ],
      members: { a: [2, 9], b: [3] },
    });
    const tabs = [tab(1), tab(2), tab(3), tab(4)];
    expect(folderTodoTabs(tabs, folders, "a").map((entry) => entry.id)).toEqual([2]);
    expect(ungroupedTodoTabs(tabs, folders).map((entry) => entry.id)).toEqual([1, 4]);
    const sections = todoColumnSections(tabs, folders);
    expect(sections.map((section) => section.kind)).toEqual(["folder", "folder", "loose"]);
    expect(sections[0] && sections[0].kind === "folder" && sections[0].folder.id).toBe("a");
    expect(visibleTodoTabs(tabs, folders).map((entry) => entry.id)).toEqual([3, 1, 4]);
    expect(
      visibleTodoTabs([tab(1), tab(2, "Tab 2", true), tab(3), tab(4)], folders).map(
        (entry) => entry.id,
      ),
    ).toEqual([2, 3, 1, 4]);
    expect(visibleTodoTabs(tabs, folders, true).map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
  });

  it("compares folder state by folders and member order", () => {
    const a = state({
      folders: [{ id: "a", name: "A", collapsed: false }],
      members: { a: [1, 2] },
    });
    expect(sameTodoFolderState(a, { ...a, members: { a: [1, 2] } })).toBe(true);
    expect(sameTodoFolderState(a, { ...a, members: { a: [2, 1] } })).toBe(false);
  });
});
