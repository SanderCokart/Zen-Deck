import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { useClampedPosition } from "@/features/search/ui/hooks/useClampedPosition";
import {
  cleanTagName,
  filterTags,
  findTagByName,
  TAG_COLOR_LABEL,
  TAG_COLOR_SWATCH,
  TAG_COLORS,
  TAG_NAME_MAX_LENGTH,
  type TagColor,
  type TagDefinition,
} from "@/features/tags/model/tags";
import { cn } from "@/shared/ui/cn";
import "@/shared/ui/hardware/menu.css";

export const TAG_MENU_SELECTOR = "[data-testid='zen-tag-menu']";

export interface TagMenuProps {
  x: number;
  y: number;
  tags: readonly TagDefinition[];
  /** The tab's current tag IDs. */
  assignedIds: readonly string[];
  onToggle: (tagId: string) => void;
  /** Creates a tag named `name` and puts it on the tab. */
  onCreate: (name: string) => void;
  onSetColor: (tagId: string, color: TagColor) => void;
  /** Deletes the tag everywhere. */
  onDelete: (tagId: string) => void;
}

type Option = { kind: "tag"; tag: TagDefinition } | { kind: "create"; name: string };

/** Mouse presses on menu controls keep focus in the input, so typing carries on. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

function Swatch({ color, class: className }: { color: TagColor; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={cn("zs-tag-swatch", className)}
      style={{ "--zs-tag-color": TAG_COLOR_SWATCH[color] }}
    />
  );
}

/**
 * A tab's tag editor: a combobox input over the list of existing tags. Typing
 * filters the list; Enter (or a click) toggles the highlighted tag on the tab,
 * or creates a new tag from the typed name. Each tag's swatch opens a colour
 * row, and its delete key asks once more, then removes the tag from every tab.
 * Backspace in an empty input takes the last tag off the tab.
 */
export function TagMenu({
  x,
  y,
  tags,
  assignedIds,
  onToggle,
  onCreate,
  onSetColor,
  onDelete,
}: TagMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const position = useClampedPosition(menuRef, x, y);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const assigned = useMemo(() => new Set(assignedIds), [assignedIds]);
  const assignedTags = tags.filter((tag) => assigned.has(tag.id));
  const options = useMemo<Option[]>(() => {
    const list: Option[] = filterTags(tags, query).map((tag) => ({ kind: "tag", tag }));
    const name = cleanTagName(query);
    if (name.length > 0 && findTagByName(tags, name) === undefined) {
      list.push({ kind: "create", name });
    }
    return list;
  }, [tags, query]);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const choose = (option: Option | undefined) => {
    if (option === undefined) return;
    setConfirmDelete(null);
    if (option.kind === "create") {
      onCreate(option.name);
      setQuery("");
      setActive(0);
      return;
    }
    onToggle(option.tag.id);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(options[activeIndex]);
      return;
    }
    if (event.key === "Backspace" && query.length === 0) {
      const last = assignedTags.at(-1);
      if (last) {
        event.preventDefault();
        onToggle(last.id);
      }
    }
  };

  return (
    <div
      ref={menuRef}
      class="zs-menu zs-hardware-menu zs-tag-menu fixed z-50"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-testid="zen-tag-menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        class="zs-tag-field"
        onMouseDown={(event) => {
          if (event.target !== inputRef.current) keepFocus(event);
          inputRef.current?.focus();
        }}
      >
        {assignedTags.map((tag) => (
          <span
            key={tag.id}
            class="zs-tag-chip"
            style={{ "--zs-tag-color": TAG_COLOR_SWATCH[tag.color] }}
            data-testid="zen-tag-menu-chip"
          >
            {tag.name}
            <button
              type="button"
              class="zs-tag-chip-remove"
              aria-label={`Remove ${tag.name}`}
              onMouseDown={keepFocus}
              onClick={() => onToggle(tag.id)}
            >
              <svg class="zen-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          class="zs-tag-input"
          role="combobox"
          aria-label="Tags"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length > 0 ? optionId(activeIndex) : undefined}
          placeholder={tags.length === 0 ? "Name a new tag…" : "Find or create a tag…"}
          maxLength={TAG_NAME_MAX_LENGTH}
          value={query}
          data-testid="zen-tag-input"
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
            setConfirmDelete(null);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div class="zs-hardware-menu-separator" role="separator" />
      <ul
        id={listId}
        role="listbox"
        aria-label="Tags"
        aria-multiselectable="true"
        class="zs-tag-list"
      >
        {options.length === 0 && (
          <li class="zs-tag-empty" role="presentation">
            No tags yet. Type a name and press Enter.
          </li>
        )}
        {options.map((option, index) => {
          if (option.kind === "create") {
            return (
              <li
                key="create"
                id={optionId(index)}
                role="option"
                aria-selected="false"
                class="zs-hardware-menu-item zs-tag-option"
                data-active={index === activeIndex || undefined}
                data-testid="zen-tag-create"
                onMouseDown={keepFocus}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span class="zs-tag-check" aria-hidden="true">
                  +
                </span>
                <span class="min-w-0 truncate normal-case">Create “{option.name}”</span>
              </li>
            );
          }
          const { tag } = option;
          const on = assigned.has(tag.id);
          const confirming = confirmDelete === tag.id;
          return (
            <li key={tag.id} role="presentation" class="zs-tag-row">
              <div
                id={optionId(index)}
                role="option"
                aria-selected={on}
                class="zs-hardware-menu-item zs-tag-option"
                data-active={index === activeIndex || undefined}
                data-testid="zen-tag-option"
                data-tag-id={tag.id}
                onMouseDown={keepFocus}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span class="zs-tag-check" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <button
                  type="button"
                  class="zs-tag-swatch-button"
                  aria-label={`Colour of ${tag.name}: ${TAG_COLOR_LABEL[tag.color]}`}
                  aria-expanded={colorFor === tag.id}
                  data-testid="zen-tag-color-button"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmDelete(null);
                    setColorFor(colorFor === tag.id ? null : tag.id);
                  }}
                >
                  <Swatch color={tag.color} />
                </button>
                <span class="min-w-0 flex-1 truncate normal-case">{tag.name}</span>
                <button
                  type="button"
                  class={cn("zs-tag-delete", confirming && "zs-tag-delete-confirm")}
                  aria-label={confirming ? `Confirm deleting ${tag.name}` : `Delete ${tag.name}`}
                  data-testid="zen-tag-delete"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!confirming) {
                      setConfirmDelete(tag.id);
                      return;
                    }
                    setConfirmDelete(null);
                    if (colorFor === tag.id) setColorFor(null);
                    onDelete(tag.id);
                  }}
                >
                  {confirming ? "Delete?" : "×"}
                </button>
              </div>
              {colorFor === tag.id && (
                <div
                  class="zs-tag-palette"
                  role="radiogroup"
                  aria-label={`Colour of ${tag.name}`}
                  data-testid="zen-tag-palette"
                >
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={tag.color === color}
                      aria-label={TAG_COLOR_LABEL[color]}
                      class="zs-tag-swatch-button"
                      data-tag-color={color}
                      onMouseDown={keepFocus}
                      onClick={() => {
                        onSetColor(tag.id, color);
                        setColorFor(null);
                      }}
                    >
                      <Swatch color={color} />
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
