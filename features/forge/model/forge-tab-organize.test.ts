import { describe, expect, it, vi } from "vitest";
import { buildForgeIssueEntries } from "@/features/search/model/ranking";
import type { TabInfo } from "@/shared/types";
import {
  applyForgeFolderPlan,
  forgeProjectFolderName,
  issueGroupFolderName,
  matchExistingFolder,
  organizeForgeConfirmMessage,
  organizeForgePreviewTree,
  planForgeTabFolders,
} from "@/features/forge/model/forge-tab-organize";

function tab(partial: Partial<TabInfo> & Pick<TabInfo, "id" | "url">): TabInfo {
  return {
    title: "Untitled",
    favIconUrl: "",
    windowId: 1,
    workspaceId: "work",
    ...partial,
  };
}

function entries(tabs: TabInfo[]) {
  return buildForgeIssueEntries(tabs);
}

describe("planForgeTabFolders tree", () => {
  it("nests Issues and MRs under the project, then the target branch", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          title: "ISSUE: #4 - Login",
          customLabel: "ISSUE: #4 - Login",
        }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          title: "MR: !8 - Login",
          customLabel: "MR: !8 - Login",
          forgeTargetBranch: "main",
        }),
        tab({
          id: 3,
          url: "https://gitlab.com/acme/app/-/merge_requests/9",
          title: "MR: !9 - Other",
          customLabel: "MR: !9 - Other",
        }),
      ]),
      "tree",
    );

    expect(plan).toEqual([
      {
        name: "app",
        spaceId: "work",
        tabIds: [],
        children: [
          { name: "Issues", tabIds: [1], children: [] },
          {
            name: "MRs",
            tabIds: [],
            children: [
              { name: "main", tabIds: [2], children: [] },
              { name: "target unknown", tabIds: [3], children: [] },
            ],
          },
        ],
      },
    ]);
  });

  it("uses PRs on GitHub and keeps projects in separate spaces apart", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://github.com/acme/app/pull/2",
          forgeTargetBranch: "develop",
          workspaceId: "a",
        }),
        tab({
          id: 2,
          url: "https://github.com/acme/app/issues/1",
          workspaceId: "b",
        }),
      ]),
      "tree",
    );

    expect(plan).toEqual([
      {
        name: "app",
        spaceId: "a",
        tabIds: [],
        children: [
          {
            name: "PRs",
            tabIds: [],
            children: [{ name: "develop", tabIds: [1], children: [] }],
          },
        ],
      },
      {
        name: "app",
        spaceId: "b",
        tabIds: [],
        children: [{ name: "Issues", tabIds: [2], children: [] }],
      },
    ]);
  });

  it("skips essential tabs and uses the full project path when short names clash", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/1",
          essential: true,
        }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/issues/2",
        }),
        tab({
          id: 3,
          url: "https://gitlab.com/other/app/-/issues/3",
        }),
      ]),
      "tree",
    );

    expect(plan.map((folder) => folder.name).sort()).toEqual([
      "gitlab.com/acme/app",
      "gitlab.com/other/app",
    ]);
    expect(plan.flatMap((folder) => folder.children.flatMap((child) => child.tabIds))).toEqual([
      2, 3,
    ]);
  });
});

describe("planForgeTabFolders byIssue", () => {
  it("puts the issue at the top of a folder with its related MRs", () => {
    const issue = tab({
      id: 1,
      url: "https://gitlab.com/acme/app/-/issues/4",
      title: "ISSUE: #4 - Login broken",
      customLabel: "ISSUE: #4 - Login broken",
    });
    const mr = tab({
      id: 2,
      url: "https://gitlab.com/acme/app/-/merge_requests/8",
      title: "MR: #4 - !8 - Login broken",
      customLabel: "MR: #4 - !8 - Login broken",
      forgeTargetBranch: "main",
    });
    const unlinkedIssue = tab({
      id: 3,
      url: "https://gitlab.com/acme/app/-/issues/9",
      title: "ISSUE: #9 - Docs",
      customLabel: "ISSUE: #9 - Docs",
    });
    const unlinkedMr = tab({
      id: 4,
      url: "https://gitlab.com/acme/app/-/merge_requests/11",
      title: "MR: !11 - Chore",
      customLabel: "MR: !11 - Chore",
      forgeTargetBranch: "main",
    });

    expect(planForgeTabFolders(entries([issue, mr, unlinkedIssue, unlinkedMr]), "byIssue")).toEqual(
      [
        {
          name: "app",
          spaceId: "work",
          tabIds: [],
          children: [
            { name: "Issues", tabIds: [3], children: [] },
            {
              name: "MRs",
              tabIds: [],
              children: [
                { name: "#4 Login broken", tabIds: [1, 2], children: [] },
                { name: "main", tabIds: [4], children: [] },
              ],
            },
          ],
        },
      ],
    );
  });

  it("keeps the issue first when the MR was opened more recently", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          customLabel: "MR: #4 - !8 - Login",
          lastOpenedAt: 200,
        }),
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          customLabel: "ISSUE: #4 - Login",
          lastOpenedAt: 50,
        }),
      ]),
      "byIssue",
    );

    expect(plan[0]?.children[0]?.children[0]?.tabIds).toEqual([1, 2]);
  });

  it("still groups MRs whose issue tab is not open", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 2,
          url: "https://github.com/acme/app/pull/8",
          customLabel: "PR: #4 - !8 - Login",
        }),
      ]),
      "byIssue",
    );

    expect(plan[0]?.children).toEqual([
      {
        name: "PRs",
        tabIds: [],
        children: [{ name: "#4", tabIds: [2], children: [] }],
      },
    ]);
  });

  it("groups an MR with a ticket tab from another tracker that shares its number", () => {
    const ticket = tab({
      id: 10,
      url: "https://helpdesk.example/tickets/482913",
      title: "[#482913] Re[2]: Checkout total : Helpdesk",
    });
    const unrelated = tab({
      id: 11,
      url: "https://helpdesk.example/tickets/700001",
      title: "[#700001] Other",
    });
    const mr = tab({
      id: 2,
      url: "https://gitlab.com/acme/app/-/merge_requests/512",
      customLabel: "MR: !512 - Draft: [482913]: fix checkout total",
      forgeTargetBranch: "main",
    });

    const plan = planForgeTabFolders(entries([mr]), "byIssue", [ticket, unrelated]);

    expect(plan[0]?.children).toEqual([
      {
        name: "MRs",
        tabIds: [],
        children: [
          { name: "#482913 Re[2]: Checkout total : Helpdesk", tabIds: [10, 2], children: [] },
        ],
      },
    ]);
  });

  it("adds a ticket tab to the issue folder when the linked MR names the ticket", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          customLabel: "ISSUE: #4 - Login",
        }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          customLabel: "MR: #4 - !8 - [482913] Login",
        }),
      ]),
      "byIssue",
      [tab({ id: 10, url: "https://helpdesk.example/t/1", title: "@482913 Login broken" })],
    );

    expect(plan[0]?.children[0]?.children[0]).toEqual({
      name: "#4 Login",
      tabIds: [1, 10, 2],
      children: [],
    });
  });

  it("groups an unlinked issue with a ticket tab inside the Issues folder", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          customLabel: "ISSUE: #4 - [482913] Login",
        }),
        tab({
          id: 3,
          url: "https://gitlab.com/acme/app/-/issues/5",
          customLabel: "ISSUE: #5 - Other",
        }),
      ]),
      "byIssue",
      [tab({ id: 10, url: "https://helpdesk.example/t/1", title: "[482913] Login broken" })],
    );

    expect(plan[0]?.children).toEqual([
      {
        name: "Issues",
        tabIds: [3],
        children: [{ name: "#482913 Login broken", tabIds: [1, 10], children: [] }],
      },
    ]);
  });

  it("leaves ticket tabs alone when no issue or MR shares their number", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          customLabel: "ISSUE: #4 - Login",
        }),
      ]),
      "byIssue",
      [tab({ id: 10, url: "https://helpdesk.example/t/1", title: "[482913] Login broken" })],
    );

    expect(JSON.stringify(plan)).not.toContain("482913");
    expect(JSON.stringify(plan)).not.toContain("10");
  });

  it("keeps an MR under its branch when its ticket tab already joined another folder", () => {
    const plan = planForgeTabFolders(
      entries([
        tab({
          id: 1,
          url: "https://gitlab.com/acme/app/-/issues/4",
          customLabel: "ISSUE: #4 - Login",
        }),
        tab({
          id: 2,
          url: "https://gitlab.com/acme/app/-/merge_requests/8",
          customLabel: "MR: #4 - !8 - [482913] Login",
          forgeTargetBranch: "main",
        }),
        tab({
          id: 3,
          url: "https://gitlab.com/acme/app/-/merge_requests/9",
          customLabel: "MR: !9 - [482913] Follow-up",
          forgeTargetBranch: "main",
        }),
      ]),
      "byIssue",
      [tab({ id: 10, url: "https://helpdesk.example/t/1", title: "[482913] Login broken" })],
    );

    expect(plan[0]?.children).toEqual([
      {
        name: "MRs",
        tabIds: [],
        children: [
          { name: "#4 Login", tabIds: [1, 10, 2], children: [] },
          { name: "main", tabIds: [3], children: [] },
        ],
      },
    ]);
  });

  it("ignores ticket tabs in other spaces and in tree mode", () => {
    const mr = tab({
      id: 2,
      url: "https://gitlab.com/acme/app/-/merge_requests/512",
      customLabel: "MR: !512 - [482913] fix",
    });
    const elsewhere = tab({
      id: 10,
      url: "https://helpdesk.example/t/1",
      title: "[482913] Ticket",
      workspaceId: "home",
    });
    const here = { ...elsewhere, workspaceId: "work" };

    expect(planForgeTabFolders(entries([mr]), "byIssue", [elsewhere])[0]?.children).toEqual([
      {
        name: "MRs",
        tabIds: [],
        children: [{ name: "target unknown", tabIds: [2], children: [] }],
      },
    ]);
    expect(JSON.stringify(planForgeTabFolders(entries([mr]), "tree", [here]))).not.toContain(
      "482913",
    );
  });
});

describe("folder naming helpers", () => {
  it("keeps the short repo name unless another project would share it", () => {
    expect(forgeProjectFolderName("gitlab.com/acme/app", ["gitlab.com/acme/app"])).toBe("app");
    expect(
      forgeProjectFolderName("gitlab.com/acme/app", [
        "gitlab.com/acme/app",
        "github.com/other/app",
      ]),
    ).toBe("gitlab.com/acme/app");
  });

  it("names an issue group from the open issue title", () => {
    const [issue] = entries([
      tab({
        id: 1,
        url: "https://gitlab.com/acme/app/-/issues/4",
        customLabel: "ISSUE: #4 - Login broken",
      }),
    ]);
    expect(issueGroupFolderName("4", issue)).toBe("#4 Login broken");
    expect(issueGroupFolderName("4", undefined)).toBe("#4");
  });

  it("describes the confirmation", () => {
    expect(organizeForgeConfirmMessage("tree", 1)).toBe(
      "Create folders matching this list and move 1 tab into them?",
    );
    expect(organizeForgeConfirmMessage("byIssue", 3)).toBe(
      "Group issues with their MRs/PRs and move 3 tabs into folders?",
    );
  });

  it("sketches each organize mode as an ASCII tree", () => {
    expect(organizeForgePreviewTree("tree")).toContain("└─ branch");
    expect(organizeForgePreviewTree("tree")).not.toContain("#12");
    expect(organizeForgePreviewTree("byIssue")).toContain("#12 Title");
    expect(organizeForgePreviewTree("byIssue")).toContain("├─ issue");
  });
});

describe("applyForgeFolderPlan", () => {
  it("reuses a matching folder and creates the rest before moving tabs", async () => {
    const createFolder = vi.fn(async (name: string) => `new:${name}`);
    const moveTabsToFolder = vi.fn(async (tabIds: number[]) => tabIds.length);
    const result = await applyForgeFolderPlan(
      [
        {
          name: "app",
          spaceId: "work",
          tabIds: [],
          children: [
            { name: "Issues", tabIds: [1], children: [] },
            {
              name: "MRs",
              tabIds: [],
              children: [{ name: "main", tabIds: [2], children: [] }],
            },
          ],
        },
      ],
      [
        {
          id: "existing-app",
          name: "app",
          spaceId: "work",
          spaceName: "Work",
          collapsed: false,
        },
      ],
      { createFolder, moveTabsToFolder },
      { tabFolders: new Map([[1, "existing-issues"]]) },
    );

    expect(createFolder.mock.calls.map((call) => call.slice(0, 4))).toEqual([
      ["Issues", "work", [], "existing-app"],
      ["MRs", "work", [], "existing-app"],
      ["main", "work", [], "new:MRs"],
    ]);
    expect(moveTabsToFolder).toHaveBeenCalledWith([1], "new:Issues");
    expect(moveTabsToFolder).toHaveBeenCalledWith([2], "new:main");
    expect(result).toEqual({ foldersCreated: 3, tabsMoved: 2 });
  });

  it("moves the issue into the folder first, then the MRs, then lines them up", async () => {
    const createFolder = vi.fn(async () => "group");
    const moveTabsToFolder = vi.fn(async (tabIds: number[]) => tabIds.length);
    const moveTab = vi.fn(async () => undefined);
    await applyForgeFolderPlan(
      [{ name: "#4 Login", spaceId: "work", tabIds: [1, 2, 3], children: [] }],
      [],
      { createFolder, moveTabsToFolder, moveTab },
    );

    expect(moveTabsToFolder.mock.calls.map((call) => call[0])).toEqual([[1], [2, 3]]);
    expect(moveTab.mock.calls).toEqual([
      [1, { beforeTabId: 2 }],
      [2, { afterTabId: 1 }],
      [3, { afterTabId: 2 }],
    ]);
  });

  it("does not move a tab that is already in the destination folder", async () => {
    const createFolder = vi.fn(async () => "should-not-create");
    const moveTabsToFolder = vi.fn(async () => 1);
    const result = await applyForgeFolderPlan(
      [{ name: "Issues", spaceId: "work", tabIds: [1], children: [] }],
      [
        {
          id: "issues",
          name: "Issues",
          spaceId: "work",
          spaceName: "Work",
          collapsed: false,
        },
      ],
      { createFolder, moveTabsToFolder },
      { tabFolders: new Map([[1, "issues"]]) },
    );

    expect(createFolder).not.toHaveBeenCalled();
    expect(moveTabsToFolder).not.toHaveBeenCalled();
    expect(result).toEqual({ foldersCreated: 0, tabsMoved: 0 });
  });

  it("matches folders by name, parent and space", () => {
    expect(
      matchExistingFolder(
        [
          { id: "a", name: "Issues", spaceId: "work" },
          { id: "b", name: "Issues", spaceId: "work", parentId: "app" },
        ],
        "Issues",
        "app",
        "work",
      ),
    ).toBe("b");
  });
});
