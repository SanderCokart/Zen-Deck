import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import { useSound } from "@/shared/ui/sound/SoundContext";

const chevronClass = "zen-icon h-[calc(var(--zen-icon-sm)*0.85)] w-[calc(var(--zen-icon-sm)*0.85)]";

/**
 * A named todo-column folder: chevron toggles it, the name renames on click,
 * and the delete key removes it (its todos go back to the ungrouped list).
 */
export function TodoFolderHeader({
  name,
  open,
  count,
  dropActive,
  onToggle,
  onRename,
  onDelete,
}: {
  name: string;
  open: boolean;
  count: number;
  dropActive?: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { play } = useSound();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next.length > 0 && next !== name) onRename(next);
    else setDraft(name);
  };

  return (
    <div
      class={cn(
        "zs-section-label zs-folder-header",
        dropActive && "text-zen-text outline-zen-accent outline outline-[length:var(--zen-line)]",
      )}
      data-sub
      data-testid="zen-todo-folder"
      data-todo-folder-drop={dropActive ? "true" : undefined}
    >
      <button
        type="button"
        class="zs-tree-toggle zs-folder-toggle shrink-0 cursor-pointer border-0 bg-transparent p-0 text-inherit"
        aria-label={open ? "Collapse folder" : "Expand folder"}
        aria-expanded={open}
        data-testid="zen-todo-folder-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          play("tick");
          onToggle();
        }}
      >
        <svg class={chevronClass} viewBox="0 0 24 24">
          <path d={open ? "m7 10 5 5 5-5" : "m10 7 5 5-5 5"} />
        </svg>
      </button>
      {editing ? (
        <input
          ref={inputRef}
          class="text-zen-text min-w-0 flex-1 border-0 bg-transparent p-0 font-[inherit] text-[length:var(--zen-text-xs)] tracking-[0.16em] uppercase outline-none"
          value={draft}
          aria-label="Folder name"
          data-testid="zen-todo-folder-name-input"
          onClick={(event) => event.stopPropagation()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          class="text-zen-subtle hover:text-zen-text min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[inherit] tracking-[inherit] uppercase"
          data-testid="zen-todo-folder-name"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            setDraft(name);
            setEditing(true);
          }}
        >
          {name}
        </button>
      )}
      <span class="zs-section-count zs-digits">{count}</span>
      <button
        type="button"
        class="text-zen-muted hover:text-zen-danger order-3 shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[length:var(--zen-text-xs)] tracking-[0.08em] uppercase"
        aria-label={`Delete ${name}`}
        data-testid="zen-todo-folder-delete"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        Delete
      </button>
    </div>
  );
}
