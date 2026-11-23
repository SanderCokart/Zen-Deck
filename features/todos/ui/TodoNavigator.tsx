import { useMemo, useRef, useState } from "preact/hooks";
import { Reorder, useDragControls } from "motion/react";
import { entryTextClass } from "@/features/search/ui/lib/styles";
import { hostname } from "@/features/search/ui/lib/format";
import { NowTag } from "@/features/search/ui/components/NowTag";
import { PrefixHint } from "@/features/search/ui/components/PrefixHint";
import { TODO_NAVIGATOR_PREFIXES } from "@/features/search/model/ranking";
import { StatusButton } from "@/features/status/ui/StatusButton";
import { TRAFFIC_LIGHT_OPTIONS } from "@/features/status/model/status";
import {
  pointerMovedPastDragThreshold,
  todoDropTargetAt,
  todoFolderWells,
} from "@/features/todos/model/todo-pointer";
import { todoTabIdsToClear, type TodoClearFilter } from "@/features/todos/model/todo";
import {
  addTodoFolder,
  folderIdForTab,
  moveTodoToFolder,
  removeTodoFolder,
  renameTodoFolder,
  setFolderMembers,
  todoColumnSections,
  toggleTodoFolder,
  ungroupedTodoTabs,
  visibleTodoTabs,
  EMPTY_TODO_FOLDER_STATE,
  type TodoFolderState,
} from "@/features/todos/model/todo-folders";
import { TodoFolderHeader } from "@/features/todos/ui/TodoFolderHeader";
import { statusRowClass } from "@/features/status/ui/traffic-light";
import {
  formatTabDisplayTitle,
  tabBrowserId,
  tabBrowserIds,
  type TabInfo,
  type TrafficLight,
} from "@/shared/types";
import { cn } from "@/shared/ui/cn";
import { ChevronDownIcon } from "@/shared/ui/primitives/ChevronDownIcon";
import { ConfirmWell } from "@/shared/ui/primitives/ConfirmWell";
import { MenuPanel, useDropdown } from "@/shared/ui/primitives/Menu";
import { TooltipFor, tooltipTriggerProps, useTooltip } from "@/shared/ui/primitives/Tooltip";
import { scrollIntoViewWhen } from "@/shared/ui/lib/scroll-into-view";

/**
 * The third overlay column: tabs marked as todo. Clicking a row switches to its
 * tab, its "Mark as done" link removes the todo, the status button beside it
 * sets the tab's status color, and right-clicking opens the tab context menu.
 * The header's "Clear" menu marks every todo, or every todo of one status
 * color, done after a confirmation, and can close those tabs as well. Only
 * rendered while there is at least one todo or folder.
 */
type PendingClear = { filter: TodoClearFilter; close: boolean };

/** The confirmation the "Clear" menu shows before marking `count` todos done. */
function clearMessage(filter: TodoClearFilter, count: number, close: boolean): string {
  const which = filter === "all" ? "" : ` with status ${filter}`;
  const todos = count === 1 ? "1 todo" : `${count} todos`;
  if (close) {
    return `Mark ${todos}${which} as done and close their tabs?`;
  }
  return `Mark ${todos}${which} as done?`;
}

/** "All" plus one entry per status color, with how many todos each would clear. */
function clearOptions(
  tabs: TabInfo[],
  statuses: Map<number, TrafficLight>,
): { filter: TodoClearFilter; label: string; count: number }[] {
  return [{ light: "all" as const, label: "All" }, ...TRAFFIC_LIGHT_OPTIONS].map(
    ({ light, label }) => ({
      filter: light,
      label,
      count: todoTabIdsToClear(tabs, statuses, light).length,
    }),
  );
}

function todoRowClass(light: TrafficLight | undefined, selected: boolean, grab = false): string {
  return cn(
    "zs-row relative flex w-full max-w-full min-w-0 shrink-0 flex-col gap-[calc(var(--zen-font-size)*0.43)] rounded-[var(--zen-radius-lg)]",
    "px-[var(--zen-space-3)] py-[calc(var(--zen-space-3)+var(--zen-todo-pad))]",
    statusRowClass(light, selected),
    grab && "cursor-grab",
  );
}

/** Mark as done and status keep their own clicks; the title is part of the row. */
function isTodoRowAction(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest("button:not(.zs-row-title), select, a") !== null
  );
}

function TodoRowBody({
  tab,
  truncate,
  onActivate,
  onSelect,
  onDone,
  onOpenStatusMenu,
  statusMenuTabId,
  statuses,
}: {
  tab: TabInfo;
  truncate: boolean;
  onActivate: (tab: TabInfo) => void;
  onSelect: () => void;
  onDone: (tab: TabInfo) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  statusMenuTabId: number | null;
  statuses: Map<number, TrafficLight>;
}) {
  const tabId = tabBrowserId(tab);
  const light = tabId === undefined ? undefined : statuses.get(tabId);
  return (
    <>
      <div class="relative z-10 flex min-w-0 items-center gap-[var(--zen-space-2)]">
        <button
          type="button"
          class="zs-row-title relative z-10 flex min-w-0 flex-1 cursor-pointer items-center gap-[var(--zen-space-2)] border-0 bg-transparent p-0 text-left text-inherit"
          onClick={(event) => {
            event.stopPropagation();
            onActivate(tab);
          }}
          onFocus={onSelect}
        >
          <span class={cn("min-w-0 flex-1", entryTextClass(truncate))}>
            {formatTabDisplayTitle(tab)}
          </span>
          {tab.active === true && <NowTag />}
        </button>
      </div>
      <div class="text-zen-muted relative z-10 flex min-w-0 items-center justify-between gap-[var(--zen-space-2)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.04em]">
        <span class={cn("min-w-0", entryTextClass(truncate))}>
          {tab.workspaceName || hostname(tab.url)}
        </span>
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <button
            type="button"
            aria-label="Mark as done"
            data-testid="zen-todo-done-button"
            class="text-zen-muted hover:text-zen-text shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] whitespace-nowrap uppercase hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onDone(tab);
            }}
          >
            Mark as done
          </button>
          <StatusButton
            tab={tab}
            light={light}
            open={tabId !== undefined && statusMenuTabId === tabId}
            onOpenMenu={onOpenStatusMenu}
            class="text-zen-subtle hover:text-zen-text border-0 bg-transparent p-[calc(var(--zen-space-1)*0.5)]"
            iconClass="size-[var(--zen-icon-sm)]"
          />
        </span>
      </div>
    </>
  );
}

function ReorderTodoRow({
  tab,
  index,
  selected,
  truncate,
  onActivate,
  onSelect,
  onDone,
  onOpenStatusMenu,
  onContextMenu,
  statusMenuTabId,
  statuses,
  onDraggingChange,
  onDropHover,
  onDrop,
}: {
  tab: TabInfo;
  index: number;
  selected: boolean;
  truncate: boolean;
  onActivate: (tab: TabInfo) => void;
  onSelect: (index: number) => void;
  onDone: (tab: TabInfo) => void;
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  statusMenuTabId: number | null;
  statuses: Map<number, TrafficLight>;
  onDraggingChange: (dragging: boolean) => void;
  onDropHover?: (point: { x: number; y: number }) => void;
  onDrop?: (tabId: number, point: { x: number; y: number }) => void;
}) {
  const skipClick = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragControls = useDragControls();
  const [grabbing, setGrabbing] = useState(false);
  const tabId = tabBrowserId(tab);
  const light = tabId === undefined ? undefined : statuses.get(tabId);
  const markDragging = (next: boolean) => {
    setGrabbing(next);
    onDraggingChange(next);
  };
  return (
    <Reorder.Item
      as="div"
      value={tabId}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{
        opacity: 0.7,
        userSelect: "none",
        cursor: "grabbing",
        pointerEvents: "none",
      }}
      onPointerDown={(event: PointerEvent) => {
        if (event.button !== 0 || isTodoRowAction(event.target)) return;
        origin.current = { x: event.clientX, y: event.clientY };
        skipClick.current = false;
        window.getSelection()?.removeAllRanges();
        const row = event.currentTarget;
        if (row instanceof HTMLElement && typeof row.setPointerCapture === "function") {
          row.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event: PointerEvent) => {
        if (skipClick.current) {
          onDropHover?.({ x: event.clientX, y: event.clientY });
        }
        if (origin.current === null || skipClick.current) return;
        if (
          !pointerMovedPastDragThreshold(origin.current, { x: event.clientX, y: event.clientY })
        ) {
          return;
        }
        skipClick.current = true;
        origin.current = null;
        window.getSelection()?.removeAllRanges();
        markDragging(true);
        dragControls.start(event);
      }}
      onPointerUp={(event: PointerEvent) => {
        origin.current = null;
        if (skipClick.current && tabId !== undefined) {
          onDrop?.(tabId, { x: event.clientX, y: event.clientY });
        }
        markDragging(false);
      }}
      onPointerCancel={() => {
        origin.current = null;
        markDragging(false);
      }}
      onDragStart={() => {
        skipClick.current = true;
        window.getSelection()?.removeAllRanges();
        markDragging(true);
      }}
      onDragEnd={() => markDragging(false)}
      onClick={(event: MouseEvent) => {
        if (isTodoRowAction(event.target)) return;
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        onActivate(tab);
      }}
      className={todoRowClass(light, selected, true)}
      data-testid="zen-todo-row"
      data-todo-dragging={grabbing ? "true" : undefined}
      data-status-light={light}
      data-todo-selected={selected ? "true" : undefined}
      data-current={tab.active === true ? "true" : undefined}
      onContextMenu={(event: MouseEvent) => onContextMenu(tab, event)}
      ref={scrollIntoViewWhen(selected)}
    >
      <TodoRowBody
        tab={tab}
        truncate={truncate}
        onActivate={(next) => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          onActivate(next);
        }}
        onSelect={() => onSelect(index)}
        onDone={onDone}
        onOpenStatusMenu={onOpenStatusMenu}
        statusMenuTabId={statusMenuTabId}
        statuses={statuses}
      />
    </Reorder.Item>
  );
}

export function TodoNavigator({
  tabs,
  allTabs = tabs,
  folders = EMPTY_TODO_FOLDER_STATE,
  statuses,
  statusMenuTabId,
  truncate,
  selectedIndex,
  onActivate,
  onSelect,
  onDone,
  onClear,
  onOpenStatusMenu,
  onContextMenu,
  onReorder,
  onFoldersChange,
}: {
  /** The rows to list: every todo, or the ones an "@" query matches. */
  tabs: TabInfo[];
  /** Every todo, whatever the query; the count and the "Clear" menu act on these. */
  allTabs?: TabInfo[];
  folders?: TodoFolderState;
  statuses: Map<number, TrafficLight>;
  /** The tab whose status menu is open, if any. */
  statusMenuTabId: number | null;
  truncate: boolean;
  selectedIndex: number;
  onActivate: (tab: TabInfo) => void;
  onSelect: (index: number) => void;
  onDone: (tab: TabInfo) => void;
  /** Marks these todo tabs done. `close` also closes the tabs. */
  onClear: (tabIds: number[], close: boolean) => void;
  /** Opens the status menu under the button at `anchor`. */
  onOpenStatusMenu: (tab: TabInfo, anchor: DOMRect) => void;
  onContextMenu: (tab: TabInfo, event: MouseEvent) => void;
  /** Motion Reorder callback with the new tab-id order. Left out while filtering. */
  onReorder?: (tabIds: number[]) => void;
  onFoldersChange?: (next: TodoFolderState) => void;
}) {
  // The omnibar is a <browser> in Zen's chrome, not a tab, so `window.confirm`
  // has nowhere to show and returns false: the confirmation lives in the column.
  const [pendingClear, setPendingClear] = useState<PendingClear | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const draggingTabId = useRef<number | null>(null);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const clearTooltip = useTooltip();
  const folderTooltip = useTooltip();
  const clearMenu = useDropdown("[data-testid='zen-todo-clear-wrap']");
  const pendingTabIds =
    pendingClear === null ? [] : todoTabIdsToClear(allTabs, statuses, pendingClear.filter);
  const filtering = onReorder === undefined;
  const visible = useMemo(
    () => visibleTodoTabs(tabs, folders, filtering),
    [filtering, folders, tabs],
  );
  const selectedVisible = visible[selectedIndex];
  const selectedId = selectedVisible === undefined ? undefined : tabBrowserId(selectedVisible);
  const reorderIds = tabBrowserIds(tabs);
  const canReorder = onReorder !== undefined && reorderIds.length === tabs.length;
  const grouped = folders.folders.length > 0;
  const looseTabs = grouped ? ungroupedTodoTabs(tabs, folders) : tabs;
  const looseIds = tabBrowserIds(looseTabs);
  const sections = useMemo(() => {
    const all = todoColumnSections(tabs, folders);
    if (!filtering) return all;
    return all.filter((section) => section.kind === "loose" || section.tabs.length > 0);
  }, [filtering, folders, tabs]);

  const listClass =
    "zen-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--zen-todo-gap)] overflow-x-hidden overflow-y-auto";

  const indexOfTab = (tab: TabInfo) => {
    const tabId = tabBrowserId(tab);
    return visible.findIndex((entry) => tabBrowserId(entry) === tabId);
  };

  const setDraggingState = (next: boolean, tabId?: number) => {
    if (next && tabId !== undefined) draggingTabId.current = tabId;
    if (!next) draggingTabId.current = null;
    setDragging(next);
    if (!next) setDropFolderId(null);
  };

  const hoverDrop = (point: { x: number; y: number }) => {
    const target = todoDropTargetAt(point.x, point.y, undefined, todoFolderWells());
    setDropFolderId(target && "folderId" in target ? target.folderId : null);
  };

  const dropTodo = (tabId: number, point: { x: number; y: number }) => {
    if (onFoldersChange === undefined) return;
    const currentFolders = foldersRef.current;
    const target = todoDropTargetAt(point.x, point.y, undefined, todoFolderWells());
    if (target === undefined) return;
    const current = folderIdForTab(currentFolders, tabId) ?? null;
    const nextId = "ungrouped" in target ? null : target.folderId;
    if (nextId === current) return;
    onFoldersChange(moveTodoToFolder(currentFolders, tabId, nextId));
  };

  const renderRow = (tab: TabInfo, reorder: boolean) => {
    const tabId = tabBrowserId(tab);
    const selected = tabId !== undefined && tabId === selectedId;
    const light = tabId === undefined ? undefined : statuses.get(tabId);
    const index = indexOfTab(tab);
    if (reorder && tabId !== undefined) {
      return (
        <ReorderTodoRow
          key={tabId}
          tab={tab}
          index={index}
          selected={selected}
          truncate={truncate}
          onActivate={onActivate}
          onSelect={onSelect}
          onDone={onDone}
          onOpenStatusMenu={onOpenStatusMenu}
          onContextMenu={onContextMenu}
          statusMenuTabId={statusMenuTabId}
          statuses={statuses}
          onDraggingChange={(next) => setDraggingState(next, tabId)}
          onDropHover={hoverDrop}
          onDrop={dropTodo}
        />
      );
    }
    return (
      <div
        key={tab.id ?? tab.domId ?? tab.url}
        class={todoRowClass(light, selected)}
        data-testid="zen-todo-row"
        data-status-light={light}
        data-todo-selected={selected ? "true" : undefined}
        data-current={tab.active === true ? "true" : undefined}
        ref={scrollIntoViewWhen(selected)}
        onContextMenu={(event) => onContextMenu(tab, event)}
        onClick={(event) => {
          if (isTodoRowAction(event.target)) return;
          onActivate(tab);
        }}
      >
        <TodoRowBody
          tab={tab}
          truncate={truncate}
          onActivate={onActivate}
          onSelect={() => {
            if (index >= 0) onSelect(index);
          }}
          onDone={onDone}
          onOpenStatusMenu={onOpenStatusMenu}
          statusMenuTabId={statusMenuTabId}
          statuses={statuses}
        />
      </div>
    );
  };

  const folderBlocks = sections
    .filter((section) => section.kind === "folder")
    .map((section) => {
      if (section.kind !== "folder") return null;
      const { folder } = section;
      const memberIds = tabBrowserIds(section.tabs);
      const open = !folder.collapsed || filtering;
      const dropActive = dropFolderId === folder.id;
      const body = (
        <>
          {open && memberIds.length > 0 && canReorder ? (
            <Reorder.Group
              as="div"
              axis="y"
              values={memberIds}
              onReorder={(ids: number[]) =>
                onFoldersChange?.(setFolderMembers(folders, folder.id, ids))
              }
              className="flex min-h-[calc(var(--zen-row-height)*1.5)] flex-col gap-[var(--zen-todo-gap)]"
              data-testid={`zen-todo-folder-items-${folder.id}`}
            >
              {section.tabs.map((tab) => renderRow(tab, true))}
            </Reorder.Group>
          ) : (
            open && (
              <div class="flex min-h-[calc(var(--zen-row-height)*1.5)] flex-col gap-[var(--zen-todo-gap)]">
                {section.tabs.map((tab) => renderRow(tab, false))}
                {section.tabs.length === 0 && (
                  <p class="text-zen-muted m-0 flex min-h-[calc(var(--zen-row-height)*2)] items-center justify-center py-[var(--zen-space-4)] text-center text-[length:var(--zen-text-xs)] tracking-[0.08em] uppercase">
                    Drop todos here
                  </p>
                )}
              </div>
            )
          )}
          {!open && dragging && (
            <p class="text-zen-muted m-0 flex min-h-[calc(var(--zen-row-height)*1.5)] items-center justify-center text-center text-[length:var(--zen-text-xs)] tracking-[0.08em] uppercase">
              Drop to add
            </p>
          )}
        </>
      );
      const header = (
        <TodoFolderHeader
          name={folder.name}
          open={open}
          count={section.tabs.length}
          dropActive={dropActive}
          onToggle={() => onFoldersChange?.(toggleTodoFolder(folders, folder.id))}
          onRename={(name) => onFoldersChange?.(renameTodoFolder(folders, folder.id, name))}
          onDelete={() => onFoldersChange?.(removeTodoFolder(folders, folder.id))}
        />
      );
      return (
        <div
          key={folder.id}
          class={cn(
            "border-zen-line-medium flex flex-col gap-[var(--zen-todo-gap)] rounded-[var(--zen-radius-lg)] border p-[var(--zen-space-3)]",
            dragging && "min-h-[calc(var(--zen-row-height)*2.5)] p-[var(--zen-space-4)]",
            dropActive && "border-zen-accent bg-zen-surface",
          )}
          data-todo-drop-folder={folder.id}
          data-todo-folder-well={folder.id}
        >
          {header}
          {body}
        </div>
      );
    });

  const looseRows = (grouped ? looseTabs : tabs).map((tab) => renderRow(tab, canReorder));

  return (
    <aside
      class={cn(
        "zs-card flex min-h-0 min-w-0 flex-1 flex-col p-[var(--zen-space-5)]",
        dragging && "select-none",
      )}
      data-testid="zen-todo-column"
      data-dragging={dragging ? "true" : undefined}
      onPointerUp={(event: PointerEvent) => {
        const tabId = draggingTabId.current;
        if (tabId === null) return;
        dropTodo(tabId, { x: event.clientX, y: event.clientY });
      }}
    >
      <div class="zs-head">
        <PrefixHint prefixes={TODO_NAVIGATOR_PREFIXES} column="todos" />
        <strong class="min-w-0 truncate font-[inherit] font-medium">Todos</strong>
        <span class="zs-head-rule" aria-hidden="true" />
        <span class="flex shrink-0 items-center gap-[var(--zen-space-2)]">
          <span class="text-zen-danger">{allTabs.length} to do</span>
          {onFoldersChange !== undefined && (
            <>
              <button
                type="button"
                class="zs-key text-zen-subtle hover:text-zen-text h-[var(--zen-mini-key)] px-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)] leading-none tracking-[0.04em] normal-case"
                aria-label="New folder"
                data-testid="zen-todo-folder-add"
                {...tooltipTriggerProps(folderTooltip)}
                onClick={() => {
                  folderTooltip.hide();
                  onFoldersChange(addTodoFolder(folders));
                }}
              >
                Folder
              </button>
              <TooltipFor tooltip={folderTooltip} content="Create a folder for todos" />
            </>
          )}
          <>
            <span class="relative inline-flex items-center" data-testid="zen-todo-clear-wrap">
              <button
                type="button"
                class="zs-key text-zen-subtle hover:text-zen-text h-[var(--zen-mini-key)] py-0 pr-[calc(var(--zen-icon-sm)+var(--zen-space-4))] pl-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-sm)] leading-none tracking-[0.04em] normal-case"
                aria-label="Clear todos"
                aria-haspopup="menu"
                aria-expanded={clearMenu.open}
                data-testid="zen-todo-clear"
                {...tooltipTriggerProps(clearTooltip)}
                onClick={() => {
                  clearTooltip.hide();
                  clearMenu.toggle();
                }}
              >
                Clear…
              </button>
              <ChevronDownIcon class="text-zen-subtle pointer-events-none absolute right-[var(--zen-space-2)] h-[var(--zen-icon-sm)] w-[var(--zen-icon-sm)]" />
              {clearMenu.open && (
                <MenuPanel
                  align="right"
                  class="min-w-[calc(var(--zen-font-size)*14)]"
                  data-testid="zen-todo-clear-menu"
                >
                  {(
                    [
                      { close: false, heading: "Mark done" },
                      { close: true, heading: "Mark done and close" },
                    ] as const
                  ).map((group) => (
                    <div key={group.heading}>
                      <p class="text-zen-muted m-0 px-[var(--zen-space-2)] pt-[var(--zen-space-1)] pb-[var(--zen-space-1)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.12em] uppercase">
                        {group.heading}
                      </p>
                      {clearOptions(allTabs, statuses).map(({ filter, label, count }) => (
                        <button
                          key={`${group.close ? "close" : "done"}-${filter}`}
                          type="button"
                          role="menuitem"
                          disabled={count === 0}
                          data-testid={`zen-todo-clear-${group.close ? "close" : "done"}-${filter}`}
                          class="zs-label text-zen-subtle hover:text-zen-text flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-left font-[inherit] disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => {
                            clearMenu.close();
                            if (count > 0) {
                              setPendingClear({ filter, close: group.close });
                            }
                          }}
                        >
                          <span>{label}</span>
                          <span class="text-zen-muted">{count}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </MenuPanel>
              )}
            </span>
            <TooltipFor tooltip={clearTooltip} content="Mark several todos as done" />
          </>
        </span>
      </div>
      {pendingClear !== null && pendingTabIds.length > 0 && (
        <ConfirmWell
          layout="row"
          label="Confirm clearing todos"
          testId="zen-todo-clear-confirm"
          message={clearMessage(pendingClear.filter, pendingTabIds.length, pendingClear.close)}
          confirmLabel={pendingClear.close ? "Done & close" : "Mark done"}
          confirmTestId="zen-todo-clear-confirm-button"
          cancelTestId="zen-todo-clear-cancel-button"
          danger={pendingClear.close}
          onConfirm={() => {
            const close = pendingClear.close;
            setPendingClear(null);
            onClear(pendingTabIds, close);
          }}
          onCancel={() => setPendingClear(null)}
        />
      )}
      {canReorder && !grouped ? (
        <Reorder.Group
          as="div"
          axis="y"
          values={reorderIds}
          onReorder={onReorder}
          className={cn(listClass, dragging && "select-none")}
          data-testid="zen-todo-list"
        >
          {looseRows}
        </Reorder.Group>
      ) : canReorder && grouped ? (
        <div class={cn(listClass, dragging && "select-none")} data-testid="zen-todo-list">
          {folderBlocks}
          <Reorder.Group
            as="div"
            axis="y"
            values={looseIds}
            onReorder={onReorder}
            className="flex flex-col gap-[var(--zen-todo-gap)]"
            data-testid="zen-todo-ungrouped"
            data-todo-ungrouped=""
          >
            {looseTabs.map((tab) => renderRow(tab, true))}
          </Reorder.Group>
        </div>
      ) : (
        <div class={listClass} data-testid="zen-todo-list">
          {tabs.length === 0 && folders.folders.length === 0 && (
            <p class="text-zen-muted m-0 py-[var(--zen-space-3)] text-center text-[length:var(--zen-text-sm)]">
              No matching todos.
            </p>
          )}
          {grouped ? (
            <>
              {folderBlocks}
              <div data-todo-ungrouped="">{looseTabs.map((tab) => renderRow(tab, false))}</div>
            </>
          ) : (
            looseRows
          )}
        </div>
      )}
    </aside>
  );
}
