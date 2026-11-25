/**
 * Ticket numbers shared between a merge/pull request and a tab from another
 * tracker (a helpdesk ticket, a Jira issue, …). Trackers mark them differently —
 * `[123456]`, `#123456`, `@123456`, `PROJ-1234` — so this only looks for a
 * standalone run of digits and lets two titles match on the same number.
 */

/**
 * Four or more digits that are not part of a word, a decimal, a percentage or a
 * `!12` merge request reference.
 */
const TICKET_NUMBER = /(?<![\w!.,/])(\d{4,})(?![\w%]|[.,]\d)/g;

function looksLikeYear(value: string): boolean {
  return value.length === 4 && /^(?:19|20)\d\d$/.test(value);
}

/** Ticket-like numbers in `text`, first occurrence first, without `exclude`. */
export function ticketNumbersIn(
  text: string | undefined,
  exclude: readonly (string | undefined)[] = [],
): string[] {
  if (!text) {
    return [];
  }
  const found: string[] = [];
  for (const match of text.matchAll(TICKET_NUMBER)) {
    const value = match[1];
    if (!value || looksLikeYear(value) || exclude.includes(value) || found.includes(value)) {
      continue;
    }
    found.push(value);
  }
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `#123456 Title`, with the number's own marker (`[#123456]:`, `@123456`) taken out of the title. */
export function ticketFolderName(ticket: string, title: string | undefined): string {
  const marker = new RegExp(`[[(]?[#@]?${escapeRegExp(ticket)}[\\])]?:?\\s*`);
  const rest = (title ?? "").replace(marker, "").trim();
  return rest ? `#${ticket} ${rest}` : `#${ticket}`;
}
