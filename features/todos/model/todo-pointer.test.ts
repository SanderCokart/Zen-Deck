import { describe, expect, it } from "vitest";
import {
  pointerMovedPastDragThreshold,
  TODO_DRAG_THRESHOLD_PX,
  todoDropTargetAt,
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
});
