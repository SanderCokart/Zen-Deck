/** Pixels the pointer must travel before a todo row becomes a drag. */
export const TODO_DRAG_THRESHOLD_PX = 8;

/** How far outside a folder well a drop still counts, so the well need not be pixel-perfect. */
export const TODO_FOLDER_DROP_SLACK_PX = 48;

/** A folder the pointer is over, or the ungrouped list. */
export type TodoDropTarget = { folderId: string } | { ungrouped: true };

/** A folder well's box, in viewport pixels. */
export type TodoFolderHit = {
  id: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
};

function distanceToRect(x: number, y: number, rect: TodoFolderHit): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

/** The closest folder well within `slack`, if any. */
export function nearestTodoFolder(
  x: number,
  y: number,
  folders: readonly TodoFolderHit[],
  slack = TODO_FOLDER_DROP_SLACK_PX,
): string | undefined {
  let best: { id: string; dist: number } | undefined;
  for (const folder of folders) {
    const dist = distanceToRect(x, y, folder);
    if (dist > slack) continue;
    if (best === undefined || dist < best.dist) best = { id: folder.id, dist };
  }
  return best?.id;
}

function defaultStack(x: number, y: number): Element[] {
  if (typeof document.elementsFromPoint === "function") {
    return document.elementsFromPoint(x, y);
  }
  const one = document.elementFromPoint(x, y);
  return one instanceof Element ? [one] : [];
}

/**
 * Where a dragged todo would land: a folder well, the ungrouped list, or
 * nowhere special. Folder wells win when the pointer is inside them or within
 * {@link TODO_FOLDER_DROP_SLACK_PX}; the dragged row is skipped so it does not
 * cover the well.
 */
export function todoDropTargetAt(
  x: number,
  y: number,
  hit?: (cx: number, cy: number) => Element | null,
  folders: readonly TodoFolderHit[] = [],
): TodoDropTarget | undefined {
  const nodes = hit === undefined ? defaultStack(x, y) : [hit(x, y)];
  let sawUngrouped = false;
  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    if (node.closest("[data-todo-dragging='true']")) continue;
    const folder = node.closest("[data-todo-drop-folder]");
    if (folder instanceof Element) {
      const folderId = folder.getAttribute("data-todo-drop-folder");
      if (folderId !== null && folderId.length > 0) return { folderId };
    }
    if (node.closest("[data-todo-ungrouped]")) sawUngrouped = true;
  }
  const near = nearestTodoFolder(x, y, folders);
  if (near !== undefined) return { folderId: near };
  if (sawUngrouped) return { ungrouped: true };
  return undefined;
}

/** Every folder well currently in the document, for proximity drops. */
export function todoFolderWells(root: ParentNode = document): TodoFolderHit[] {
  return [...root.querySelectorAll("[data-todo-folder-well]")].flatMap((node) => {
    if (!(node instanceof HTMLElement)) return [];
    const id = node.getAttribute("data-todo-folder-well");
    if (id === null || id.length === 0) return [];
    const box = node.getBoundingClientRect();
    return [{ id, top: box.top, bottom: box.bottom, left: box.left, right: box.right }];
  });
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
