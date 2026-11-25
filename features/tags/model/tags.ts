import * as v from "valibot";

/** storage.local key for the tag list (names and colours). A user setting, so it is backed up. */
export const TAG_DEFINITIONS_STORAGE_KEY = "tagDefinitions";

/** Longest tag name the input accepts. */
export const TAG_NAME_MAX_LENGTH = 40;

/** The colours a tag can have, in the order the picker shows them. */
export const TAG_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "gray",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/** A swatch value per colour; mid-tone so it reads on both themes. */
export const TAG_COLOR_SWATCH: Record<TagColor, string> = {
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#e2a336",
  green: "#30a46c",
  teal: "#12a594",
  blue: "#0090ff",
  purple: "#8e4ec6",
  pink: "#d6409f",
  gray: "#8b8d98",
};

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  gray: "Grey",
};

const tagDefinitionSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(TAG_NAME_MAX_LENGTH)),
  color: v.fallback(v.picklist(TAG_COLORS), "gray"),
});

export type TagDefinition = v.InferOutput<typeof tagDefinitionSchema>;

/** Whatever storage holds as tags. Unreadable entries and repeated IDs or names are dropped. */
export function parseTagDefinitions(value: unknown): TagDefinition[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const tags: TagDefinition[] = [];
  for (const entry of value) {
    const parsed = v.safeParse(tagDefinitionSchema, entry);
    if (!parsed.success) continue;
    const key = nameKey(parsed.output.name);
    if (ids.has(parsed.output.id) || names.has(key)) continue;
    ids.add(parsed.output.id);
    names.add(key);
    tags.push(parsed.output);
  }
  return tags;
}

export function sameTagDefinitions(
  a: readonly TagDefinition[],
  b: readonly TagDefinition[],
): boolean {
  return (
    a.length === b.length &&
    a.every((tag, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        other.id === tag.id &&
        other.name === tag.name &&
        other.color === tag.color
      );
    })
  );
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** A tag name as typed, trimmed and cut to {@link TAG_NAME_MAX_LENGTH}; empty when only spaces. */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, TAG_NAME_MAX_LENGTH).trim();
}

/** The tag whose name equals `name`, ignoring case and surrounding spaces. */
export function findTagByName(
  tags: readonly TagDefinition[],
  name: string,
): TagDefinition | undefined {
  const key = nameKey(name);
  return key.length === 0 ? undefined : tags.find((tag) => nameKey(tag.name) === key);
}

/** The colour fewest tags use, earliest in the palette on a tie, so new tags vary. */
export function nextTagColor(tags: readonly TagDefinition[]): TagColor {
  const counts = new Map<TagColor, number>(TAG_COLORS.map((color) => [color, 0]));
  for (const tag of tags) counts.set(tag.color, (counts.get(tag.color) ?? 0) + 1);
  let best: TagColor = TAG_COLORS[0];
  for (const color of TAG_COLORS) {
    if ((counts.get(color) ?? 0) < (counts.get(best) ?? 0)) best = color;
  }
  return best;
}

/**
 * Adds a tag named `name`, or returns the existing one with that name.
 * `tag` is undefined when the name is empty.
 */
export function createTag(
  tags: readonly TagDefinition[],
  name: string,
  makeId: () => string = () => crypto.randomUUID(),
): { tags: TagDefinition[]; tag: TagDefinition | undefined } {
  const cleaned = cleanTagName(name);
  if (cleaned.length === 0) return { tags: [...tags], tag: undefined };
  const existing = findTagByName(tags, cleaned);
  if (existing) return { tags: [...tags], tag: existing };
  const tag: TagDefinition = { id: makeId(), name: cleaned, color: nextTagColor(tags) };
  return { tags: [...tags, tag], tag };
}

export function setTagColor(
  tags: readonly TagDefinition[],
  tagId: string,
  color: TagColor,
): TagDefinition[] {
  return tags.map((tag) => (tag.id === tagId ? { ...tag, color } : tag));
}

export function deleteTag(tags: readonly TagDefinition[], tagId: string): TagDefinition[] {
  return tags.filter((tag) => tag.id !== tagId);
}

/** The tags a tab has, in list order; IDs of deleted tags are skipped. */
export function resolveTabTags(
  tags: readonly TagDefinition[],
  tagIds: readonly string[] | undefined,
): TagDefinition[] {
  if (tagIds === undefined || tagIds.length === 0) return [];
  const assigned = new Set(tagIds);
  return tags.filter((tag) => assigned.has(tag.id));
}

/**
 * A tab's tag IDs with `tagId` added or removed. IDs no longer in `tags` are
 * dropped on the way, so a deleted tag cannot come back on a tab.
 */
export function toggleTabTag(
  tags: readonly TagDefinition[],
  tagIds: readonly string[] | undefined,
  tagId: string,
): string[] {
  const known = new Set(tags.map((tag) => tag.id));
  const current = (tagIds ?? []).filter((id) => known.has(id));
  if (current.includes(tagId)) return current.filter((id) => id !== tagId);
  return known.has(tagId) ? [...current, tagId] : current;
}

/** Tags whose name contains `query`, those starting with it first; every tag for an empty query. */
export function filterTags(tags: readonly TagDefinition[], query: string): TagDefinition[] {
  const key = nameKey(query);
  if (key.length === 0) return [...tags];
  const starts: TagDefinition[] = [];
  const contains: TagDefinition[] = [];
  for (const tag of tags) {
    const name = nameKey(tag.name);
    if (name.startsWith(key)) starts.push(tag);
    else if (name.includes(key)) contains.push(tag);
  }
  return [...starts, ...contains];
}
