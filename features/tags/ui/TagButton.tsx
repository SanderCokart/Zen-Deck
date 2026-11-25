import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { resolveTabTags, TAG_COLOR_SWATCH } from "@/features/tags/model/tags";
import { useTagContext } from "@/features/tags/ui/TagContext";
import { tabBrowserId, type TabInfo } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

/** Matches the tag keys, so clicking one again closes the menu instead of reopening it. */
export const TAG_MENU_TRIGGER_SELECTOR = "[data-tag-menu-trigger]";

/** A tag outline; `colors` fill up to three dots along its edge for the tags a tab has. */
export function TagIcon({ colors = [], class: className }: { colors?: string[]; class?: string }) {
  const dots = colors.slice(0, 3);
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-7.7 7.7a1.5 1.5 0 0 1-2.12 0l-7.3-7.3A1.5 1.5 0 0 1 3 12.2Z" />
      {dots.length === 0 ? (
        <circle cx="8" cy="8" r="1.5" />
      ) : (
        dots.map((color, index) => (
          <circle
            key={index}
            cx={8 + index * 3.5}
            cy={8 + index * 3.5}
            r="2"
            stroke="none"
            style={{ fill: color }}
          />
        ))
      )}
    </svg>
  );
}

/**
 * The key beside the status light that opens a tab's tag menu. Renders nothing
 * while the Tags feature is off or the tab has no usable ID.
 */
export function TagButton({
  tab,
  class: className,
  iconClass,
}: {
  tab: TabInfo;
  class?: string;
  iconClass: string;
}) {
  const context = useTagContext();
  const tabId = tabBrowserId(tab);
  if (context === null || tabId === undefined) return null;
  const assigned = resolveTabTags(context.tags, context.tabTags.get(tabId));
  const open = context.menuTabId === tabId;
  const summary =
    assigned.length === 0 ? "Add tags" : `Tags: ${assigned.map((tag) => tag.name).join(", ")}`;
  return (
    <TooltipButton
      label={summary}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-testid="zen-tag-button"
      data-own-sound=""
      data-tag-menu-trigger=""
      data-tag-count={assigned.length}
      class={cn("inline-flex cursor-pointer items-center", className)}
      onClick={(event) => {
        event.stopPropagation();
        context.toggleMenu(tab, event.currentTarget.getBoundingClientRect());
      }}
    >
      <TagIcon colors={assigned.map((tag) => TAG_COLOR_SWATCH[tag.color])} class={iconClass} />
    </TooltipButton>
  );
}

/**
 * Small coloured chips naming a tab's tags, each with a close key that takes
 * that tag off the tab. Nothing when it has none or tags are off.
 */
export function TagChips({
  tab,
  onRemove,
  class: className,
}: {
  tab: TabInfo;
  /** Called after a chip's close key took its tag off, e.g. to play a sound. */
  onRemove?: () => void;
  class?: string;
}) {
  const context = useTagContext();
  const tabId = tabBrowserId(tab);
  if (context === null || tabId === undefined) return null;
  const assigned = resolveTabTags(context.tags, context.tabTags.get(tabId));
  if (assigned.length === 0) return null;
  return (
    <span
      class={cn("flex min-w-0 flex-wrap items-center gap-[var(--zen-space-1)]", className)}
      data-testid="zen-tag-chips"
    >
      {assigned.map((tag) => (
        <span
          key={tag.id}
          class="zs-tag-chip"
          style={{ "--zs-tag-color": TAG_COLOR_SWATCH[tag.color] }}
          data-tag-color={tag.color}
          data-testid="zen-tag-chip"
        >
          <span class="min-w-0 truncate">{tag.name}</span>
          <button
            type="button"
            class="zs-tag-chip-remove"
            aria-label={`Remove tag ${tag.name}`}
            data-testid="zen-tag-chip-remove"
            onClick={(event) => {
              event.stopPropagation();
              context.removeFromTab(tabId, tag.id);
              onRemove?.();
            }}
          >
            <svg class="zen-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7 7 17" />
            </svg>
          </button>
        </span>
      ))}
    </span>
  );
}
