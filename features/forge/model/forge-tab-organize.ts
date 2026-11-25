import {
  groupForgeIssueEntries,
  type ForgeIssueProjectGroup,
} from "@/features/search/model/ranking";
import {
  forgeRowParts,
  relatedIssueIdFromLabel,
  forgeBranchFolderName,
  forgeRequestsFolderName,
  type ForgeIssueEntry,
  type ForgePlatform,
} from "@/features/forge/model/forge-label";
import { ticketFolderName, ticketNumbersIn } from "@/features/forge/model/ticket-number";
import type { ZenFolderInfo } from "@/shared/messaging/bridge-protocol";
import { pluralize } from "@/shared/text";
import {
  isEssentialTab,
  tabBrowserId,
  tabBrowserIds,
  type ForgeOrganizeMode,
  type TabInfo,
} from "@/shared/types";

export const FORGE_ORGANIZE_MODES = [
  "tree",
  "byIssue",
] as const satisfies readonly ForgeOrganizeMode[];
export type { ForgeOrganizeMode };

/** A folder to create (or reuse) and the tabs that belong directly in it. */
export interface ForgeFolderPlan {
  name: string;
  spaceId?: string;
  tabIds: number[];
  children: ForgeFolderPlan[];
}

export function movableForgeTabId(tab: ForgeIssueEntry["tab"]): number | undefined {
  if (isEssentialTab(tab)) {
    return undefined;
  }
  return tabBrowserId(tab);
}

export function countMovableForgeTabs(entries: readonly ForgeIssueEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (movableForgeTabId(entry.tab) !== undefined) {
      count += 1;
    }
  }
  return count;
}

export function organizeForgeConfirmMessage(mode: ForgeOrganizeMode, tabCount: number): string {
  const tabs = pluralize(tabCount, "tab");
  if (mode === "byIssue") {
    return `Group issues with their MRs/PRs and move ${tabs} into folders?`;
  }
  return `Create folders matching this list and move ${tabs} into them?`;
}

/** ASCII sketch of the folders that mode creates, for the organize menu hover card. */
export function organizeForgePreviewTree(mode: ForgeOrganizeMode): string {
  if (mode === "byIssue") {
    return [
      "project",
      "├─ Issues",
      "│  └─ issue",
      "└─ MRs / PRs",
      "   ├─ #12 Title",
      "   │  ├─ issue",
      "   │  └─ MR / PR",
      "   ├─ #345715 Ticket",
      "   │  ├─ ticket tab",
      "   │  └─ MR / PR",
      "   └─ branch",
      "      └─ MR / PR",
    ].join("\n");
  }
  return [
    "project",
    "├─ Issues",
    "│  └─ issue",
    "└─ MRs / PRs",
    "   └─ branch",
    "      └─ MR / PR",
  ].join("\n");
}

function tabIdsOf(entries: readonly ForgeIssueEntry[]): number[] {
  return tabBrowserIds(entries.map((entry) => entry.tab).filter((tab) => !isEssentialTab(tab)));
}

export function forgeProjectFolderName(
  projectLabel: string,
  siblingLabels: readonly string[],
): string {
  const short = projectLabel.split("/").pop() || projectLabel;
  const clash = siblingLabels.some(
    (other) => other !== projectLabel && (other.split("/").pop() || other) === short,
  );
  return clash ? projectLabel : short;
}

export function issueGroupFolderName(id: string, issue: ForgeIssueEntry | undefined): string {
  if (!issue) {
    return `#${id}`;
  }
  const title = forgeRowParts(issue.ref, issue.tab.customLabel?.trim() || issue.title).title;
  return title ? `#${id} ${title}` : `#${id}`;
}

function treeChildren(platform: ForgePlatform, project: ForgeIssueProjectGroup): ForgeFolderPlan[] {
  const children: ForgeFolderPlan[] = [];
  const issueIds = tabIdsOf(project.issues);
  if (issueIds.length > 0) {
    children.push({ name: "Issues", tabIds: issueIds, children: [] });
  }

  const requestLeaves: ForgeFolderPlan[] = [];
  for (const branch of project.branches) {
    const ids = tabIdsOf(branch.requests);
    if (ids.length === 0) {
      continue;
    }
    requestLeaves.push({
      name: forgeBranchFolderName(branch.targetBranch),
      tabIds: ids,
      children: [],
    });
  }
  if (requestLeaves.length > 0) {
    children.push({
      name: forgeRequestsFolderName(platform),
      tabIds: [],
      children: requestLeaves,
    });
  }
  return children;
}

/**
 * Non-forge tabs in one space, indexed by the ticket numbers in their titles.
 * Each tab joins at most one folder: the first group that claims it.
 */
interface TicketTabs {
  byNumber: ReadonlyMap<string, readonly TabInfo[]>;
  claimed: Set<number>;
}

function tabText(tab: Pick<TabInfo, "customLabel" | "title">): string {
  return [tab.customLabel, tab.title].filter(Boolean).join(" ");
}

function buildTicketTabs(tabs: readonly TabInfo[]): TicketTabs {
  const byNumber = new Map<string, TabInfo[]>();
  for (const tab of tabs) {
    if (isEssentialTab(tab) || tabBrowserId(tab) === undefined) {
      continue;
    }
    for (const ticket of ticketNumbersIn(tabText(tab))) {
      const list = byNumber.get(ticket) ?? [];
      list.push(tab);
      byNumber.set(ticket, list);
    }
  }
  return { byNumber, claimed: new Set() };
}

function entryTicketNumbers(entry: ForgeIssueEntry, related?: string): string[] {
  return ticketNumbersIn(tabText(entry.tab), [entry.ref.id, related]);
}

/** Claims the open ticket tabs for these numbers and returns their ids. */
function claimTicketTabs(tickets: TicketTabs, numbers: readonly string[]): number[] {
  const ids: number[] = [];
  for (const ticket of numbers) {
    for (const tab of tickets.byNumber.get(ticket) ?? []) {
      const id = tabBrowserId(tab);
      if (id === undefined || tickets.claimed.has(id)) {
        continue;
      }
      tickets.claimed.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function byIssueChildren(
  platform: ForgePlatform,
  project: ForgeIssueProjectGroup,
  tickets: TicketTabs,
): ForgeFolderPlan[] {
  const issueById = new Map(project.issues.map((entry) => [entry.ref.id, entry]));
  const grouped = new Map<string, ForgeIssueEntry[]>();
  const placed = new Set<ForgeIssueEntry>();

  for (const branch of project.branches) {
    for (const request of branch.requests) {
      const related = relatedIssueIdFromLabel(request.tab.customLabel, request.ref.id);
      if (related) {
        const list = grouped.get(related) ?? [];
        list.push(request);
        grouped.set(related, list);
        placed.add(request);
      }
    }
  }
  for (const id of grouped.keys()) {
    const issue = issueById.get(id);
    if (issue) {
      placed.add(issue);
    }
  }

  const orderedIssueIds: string[] = [];
  for (const issue of project.issues) {
    if (grouped.has(issue.ref.id)) {
      orderedIssueIds.push(issue.ref.id);
    }
  }
  for (const id of grouped.keys()) {
    if (!orderedIssueIds.includes(id)) {
      orderedIssueIds.push(id);
    }
  }

  const requestChildren: ForgeFolderPlan[] = [];
  for (const id of orderedIssueIds) {
    const requests = grouped.get(id) ?? [];
    const issue = issueById.get(id);
    const members = issue ? [issue, ...requests] : requests;
    const ticketIds = claimTicketTabs(
      tickets,
      members.flatMap((entry) => entryTicketNumbers(entry, id)),
    );
    const tabs = [...tabIdsOf(issue ? [issue] : []), ...ticketIds, ...tabIdsOf(requests)];
    if (tabs.length === 0) {
      continue;
    }
    requestChildren.push({
      name: issueGroupFolderName(id, issue),
      tabIds: tabs,
      children: [],
    });
  }

  // Issues and requests not linked to each other may still share a ticket
  // number with a tab from another tracker. A folder is only made when both a
  // ticket tab and a forge tab end up in it; otherwise everything stays put.
  const byTicket = new Map<string, { issues: ForgeIssueEntry[]; requests: ForgeIssueEntry[] }>();
  const addCandidate = (entry: ForgeIssueEntry, kind: "issues" | "requests"): void => {
    if (placed.has(entry) || movableForgeTabId(entry.tab) === undefined) {
      return;
    }
    const ticket = entryTicketNumbers(entry).find((number) => tickets.byNumber.has(number));
    if (!ticket) {
      return;
    }
    const group = byTicket.get(ticket) ?? { issues: [], requests: [] };
    group[kind].push(entry);
    byTicket.set(ticket, group);
  };
  for (const issue of project.issues) {
    addCandidate(issue, "issues");
  }
  for (const branch of project.branches) {
    for (const request of branch.requests) {
      addCandidate(request, "requests");
    }
  }

  const issueTicketFolders: ForgeFolderPlan[] = [];
  for (const [ticket, group] of byTicket) {
    const ticketIds = claimTicketTabs(tickets, [ticket]);
    if (ticketIds.length === 0) {
      continue;
    }
    for (const entry of [...group.issues, ...group.requests]) {
      placed.add(entry);
    }
    const ticketTab = tickets.byNumber.get(ticket)?.[0];
    const folder: ForgeFolderPlan = {
      name: ticketFolderName(ticket, ticketTab?.customLabel?.trim() || ticketTab?.title),
      tabIds: [...tabIdsOf(group.issues), ...ticketIds, ...tabIdsOf(group.requests)],
      children: [],
    };
    (group.requests.length > 0 ? requestChildren : issueTicketFolders).push(folder);
  }

  const children: ForgeFolderPlan[] = [];
  const unlinkedIds = tabIdsOf(project.issues.filter((issue) => !placed.has(issue)));
  if (unlinkedIds.length > 0 || issueTicketFolders.length > 0) {
    children.push({ name: "Issues", tabIds: unlinkedIds, children: issueTicketFolders });
  }

  for (const branch of project.branches) {
    const ids = tabIdsOf(branch.requests.filter((request) => !placed.has(request)));
    if (ids.length === 0) {
      continue;
    }
    requestChildren.push({
      name: forgeBranchFolderName(branch.targetBranch),
      tabIds: ids,
      children: [],
    });
  }

  if (requestChildren.length > 0) {
    children.push({
      name: forgeRequestsFolderName(platform),
      tabIds: [],
      children: requestChildren,
    });
  }
  return children;
}

function plansForSpace(
  entries: ForgeIssueEntry[],
  mode: ForgeOrganizeMode,
  spaceId: string | undefined,
  ticketTabs: readonly TabInfo[],
): ForgeFolderPlan[] {
  const providers = groupForgeIssueEntries(entries, "recent");
  const tickets = buildTicketTabs(ticketTabs);
  const plans: ForgeFolderPlan[] = [];
  for (const provider of providers) {
    const siblingLabels = provider.projects.map((project) => project.projectLabel);
    for (const project of provider.projects) {
      const children =
        mode === "tree"
          ? treeChildren(provider.platform, project)
          : byIssueChildren(provider.platform, project, tickets);
      if (children.length === 0) {
        continue;
      }
      plans.push({
        name: forgeProjectFolderName(project.projectLabel, siblingLabels),
        spaceId,
        tabIds: [],
        children,
      });
    }
  }
  return plans;
}

/**
 * Folder trees that match the Issues and requests column (`tree`) or group each
 * issue with the MRs/PRs that mention it (`byIssue`). One top-level project
 * folder per space the tabs already live in.
 *
 * In `byIssue` mode, `ticketTabs` (tabs from other trackers) join the folder of
 * an MR/PR in the same space whose title shares a ticket number with theirs.
 */
export function planForgeTabFolders(
  entries: readonly ForgeIssueEntry[],
  mode: ForgeOrganizeMode,
  ticketTabs: readonly TabInfo[] = [],
): ForgeFolderPlan[] {
  const bySpace = new Map<string | undefined, ForgeIssueEntry[]>();
  for (const entry of entries) {
    const spaceId = entry.tab.workspaceId;
    const list = bySpace.get(spaceId) ?? [];
    list.push(entry);
    bySpace.set(spaceId, list);
  }
  return [...bySpace.entries()].flatMap(([spaceId, spaceEntries]) =>
    plansForSpace(
      spaceEntries,
      mode,
      spaceId,
      mode === "byIssue" ? ticketTabs.filter((tab) => tab.workspaceId === spaceId) : [],
    ),
  );
}

export function matchExistingFolder(
  folders: readonly Pick<ZenFolderInfo, "id" | "name" | "parentId" | "spaceId">[],
  name: string,
  parentId: string | undefined,
  spaceId: string | undefined,
): string | undefined {
  return folders.find((folder) => {
    const sameParent = (folder.parentId || undefined) === (parentId || undefined);
    const sameName = folder.name === name;
    const sameSpace = spaceId === undefined || spaceId === "" || folder.spaceId === spaceId;
    return sameParent && sameName && sameSpace;
  })?.id;
}

export async function applyForgeFolderPlan(
  plans: readonly ForgeFolderPlan[],
  folders: ZenFolderInfo[],
  workspace: {
    createFolder(
      name: string,
      spaceId: string | undefined,
      tabIds: number[],
      parentId?: string,
      anchorTabId?: number,
    ): Promise<string>;
    moveTabsToFolder(tabIds: number[], folderId: string): Promise<number>;
    moveTab?(
      tabId: number,
      placement: { beforeTabId: number } | { afterTabId: number },
    ): Promise<void>;
  },
  options: {
    anchorTabId?: number;
    /** Tab id → current folder id; tabs already in the destination are left alone. */
    tabFolders?: ReadonlyMap<number, string | undefined>;
  } = {},
): Promise<{ foldersCreated: number; tabsMoved: number }> {
  const known = [...folders];
  let foldersCreated = 0;
  let tabsMoved = 0;

  const applyNode = async (node: ForgeFolderPlan, parentId: string | undefined): Promise<void> => {
    let folderId = matchExistingFolder(known, node.name, parentId, node.spaceId);
    if (!folderId) {
      folderId = await workspace.createFolder(
        node.name,
        node.spaceId,
        [],
        parentId,
        options.anchorTabId,
      );
      foldersCreated += 1;
      known.push({
        id: folderId,
        name: node.name,
        spaceId: node.spaceId ?? "",
        spaceName: "",
        parentId,
        collapsed: false,
      });
    }

    const toMove = node.tabIds.filter((tabId) => options.tabFolders?.get(tabId) !== folderId);
    const lead = node.tabIds[0];
    const leadMove = lead !== undefined && toMove.includes(lead) ? [lead] : [];
    const restMove = toMove.filter((tabId) => tabId !== lead);
    if (leadMove.length > 0) {
      tabsMoved += await workspace.moveTabsToFolder(leadMove, folderId);
    }
    if (restMove.length > 0) {
      tabsMoved += await workspace.moveTabsToFolder(restMove, folderId);
    }
    if (workspace.moveTab && node.tabIds.length > 1) {
      const head = node.tabIds[0];
      const next = node.tabIds[1];
      if (head !== undefined && next !== undefined) {
        await workspace.moveTab(head, { beforeTabId: next });
      }
      for (let index = 1; index < node.tabIds.length; index += 1) {
        const tabId = node.tabIds[index];
        const previous = node.tabIds[index - 1];
        if (tabId === undefined || previous === undefined) {
          continue;
        }
        await workspace.moveTab(tabId, { afterTabId: previous });
      }
    }

    for (const child of node.children) {
      await applyNode({ ...child, spaceId: child.spaceId ?? node.spaceId }, folderId);
    }
  };

  for (const plan of plans) {
    await applyNode(plan, undefined);
  }

  return { foldersCreated, tabsMoved };
}
