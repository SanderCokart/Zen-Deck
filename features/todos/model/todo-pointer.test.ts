import { describe, expect, it } from "vitest";
import {
  nearestTodoFolder,
  pointerMovedPastDragThreshold,
  TODO_DRAG_THRESHOLD_PX,
  TODO_FOLDER_DROP_SLACK_PX,
  todoDropTargetAt,
  todoFolderWells,
} from "@/features/todos/model/todo-pointer";

describe("todo pointer", () => {
  it("treats a still pointer as a click", () => {
    expect(pointerMovedPastDragThreshold({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
    expect(
      pointerMovedPastDragThreshold(
        { x: 10, y: 10 },
        { x: 10 + TODO_DRAG_THRESHOLD_PX - 1, y: 10 },
      ),
    ).toBe(false);
  });

  it("treats movement past the threshold as a drag", () => {
    expect(
      pointerMovedPastDragThreshold({ x: 10, y: 10 }, { x: 10, y: 10 + TODO_DRAG_THRESHOLD_PX }),
    ).toBe(true);
  });

  it("reads a folder or ungrouped drop from the element under the pointer", () => {
    const folder = document.createElement("div");
    folder.setAttribute("data-todo-drop-folder", "inbox");
    const row = document.createElement("div");
    folder.append(row);
    const loose = document.createElement("div");
    loose.setAttribute("data-todo-ungrouped", "");
    expect(todoDropTargetAt(0, 0, () => row)).toEqual({ folderId: "inbox" });
    expect(todoDropTargetAt(0, 0, () => loose)).toEqual({ ungrouped: true });
    expect(todoDropTargetAt(0, 0, () => document.createElement("div"))).toBeUndefined();
    expect(todoDropTargetAt(0, 0, () => null)).toBeUndefined();
  });

  it("ignores a hit that sits on the dragged row", () => {
    const dragging = document.createElement("div");
    dragging.setAttribute("data-todo-dragging", "true");
    expect(todoDropTargetAt(0, 0, () => dragging)).toBeUndefined();
  });

  it("picks the nearest folder well when the pointer is just outside it", () => {
    const inbox = { id: "inbox", top: 0, bottom: 40, left: 0, right: 100 };
    expect(nearestTodoFolder(50, 40 + TODO_FOLDER_DROP_SLACK_PX, [inbox])).toBe("inbox");
    expect(nearestTodoFolder(50, 40 + TODO_FOLDER_DROP_SLACK_PX + 1, [inbox])).toBeUndefined();
    expect(todoDropTargetAt(50, 20, () => document.createElement("div"), [inbox])).toEqual({
      folderId: "inbox",
    });
  });

  it("reads folder wells from the document", () => {
    const root = document.createElement("div");
    const well = document.createElement("div");
    well.setAttribute("data-todo-folder-well", "inbox");
    root.append(well);
    document.body.append(root);
    expect(todoFolderWells(root)).toEqual([expect.objectContaining({ id: "inbox" })]);
    root.remove();
  });
});
