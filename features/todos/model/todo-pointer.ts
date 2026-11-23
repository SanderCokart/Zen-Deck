/** Pixels the pointer must travel before a todo row becomes a drag. */
export const TODO_DRAG_THRESHOLD_PX = 8;

/** A folder the pointer is over, or the ungrouped list. */
export type TodoDropTarget = { folderId: string } | { ungrouped: true };

/**
 * Where a dragged todo would land: a folder header/body, the ungrouped list,
 * or nowhere special (the current reorder group keeps it).
 */
export function todoDropTargetAt(
  x: number,
  y: number,
  hit: (cx: number, cy: number) => Element | null = (cx, cy) => document.elementFromPoint(cx, cy),
): TodoDropTarget | undefined {
  const node = hit(x, y);
  if (!(node instanceof Element)) return undefined;
  const folder = node.closest("[data-todo-drop-folder]");
  if (folder instanceof Element) {
    const folderId = folder.getAttribute("data-todo-drop-folder");
    if (folderId !== null && folderId.length > 0) return { folderId };
  }
  if (node.closest("[data-todo-ungrouped]")) return { ungrouped: true };
  return undefined;
}

/** True once the pointer has left the still-click zone around `origin`. */
export function pointerMovedPastDragThreshold(
  origin: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return dx * dx + dy * dy >= TODO_DRAG_THRESHOLD_PX * TODO_DRAG_THRESHOLD_PX;
}
