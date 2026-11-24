import { describe, expect, it } from "vitest";
import {
  cleanTagName,
  createTag,
  deleteTag,
  filterTags,
  nextTagColor,
  parseTagDefinitions,
  resolveTabTags,
  setTagColor,
  TAG_NAME_MAX_LENGTH,
  toggleTabTag,
  type TagDefinition,
} from "@/features/tags/model/tags";

const work: TagDefinition = { id: "a", name: "Work", color: "blue" };
const urgent: TagDefinition = { id: "b", name: "Urgent", color: "red" };

describe("tags", () => {
  it("parses stored tags, dropping bad entries and duplicate IDs or names", () => {
    expect(
      parseTagDefinitions([
        work,
        { id: "a", name: "Other", color: "red" },
        { id: "c", name: "work", color: "red" },
        { id: "d", name: "  ", color: "red" },
        { id: "e", name: "Odd colour", color: "chartreuse" },
        "junk",
      ]),
    ).toEqual([work, { id: "e", name: "Odd colour", color: "gray" }]);
    expect(parseTagDefinitions(undefined)).toEqual([]);
  });

  it("cleans names", () => {
    expect(cleanTagName("  two   words ")).toBe("two words");
    expect(cleanTagName("x".repeat(TAG_NAME_MAX_LENGTH + 5))).toHaveLength(TAG_NAME_MAX_LENGTH);
  });

  it("creates a tag with the least used colour, or reuses one with the same name", () => {
    const created = createTag([work], "Later", () => "new");
    expect(created.tag).toEqual({ id: "new", name: "Later", color: "red" });
    expect(created.tags).toHaveLength(2);
    expect(createTag([work], " work ").tag).toBe(work);
    expect(createTag([work], "   ").tag).toBeUndefined();
    expect(nextTagColor([])).toBe("red");
  });

  it("recolours and deletes tags", () => {
    expect(setTagColor([work], "a", "green")).toEqual([{ ...work, color: "green" }]);
    expect(deleteTag([work, urgent], "a")).toEqual([urgent]);
  });

  it("resolves a tab's tags in list order, skipping deleted ones", () => {
    expect(resolveTabTags([work, urgent], ["b", "gone", "a"])).toEqual([work, urgent]);
    expect(resolveTabTags([work], undefined)).toEqual([]);
  });

  it("toggles a tag on a tab and drops deleted IDs", () => {
    expect(toggleTabTag([work, urgent], ["gone"], "a")).toEqual(["a"]);
    expect(toggleTabTag([work, urgent], ["a", "b"], "a")).toEqual(["b"]);
    expect(toggleTabTag([work], [], "gone")).toEqual([]);
  });

  it("filters by name, prefix matches first", () => {
    const ops = { id: "c", name: "DevOps", color: "teal" } as const;
    const dev = { id: "d", name: "Dev", color: "teal" } as const;
    expect(filterTags([ops, dev, work], "dev")).toEqual([ops, dev]);
    expect(filterTags([ops, dev, work], "ops")).toEqual([ops]);
    expect(filterTags([work], "")).toEqual([work]);
  });
});
