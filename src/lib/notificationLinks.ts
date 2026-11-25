/**
 * Notification rows are plain text. Server triggers append an in-app deep link
 * to the end of the message, e.g.
 *   "Bob: hi there /friends?friend=<uuid>&message=<uuid>"
 *   "Bob invited you to party "X". Open: /tavern?invite=<uuid>"
 *   "Bob invited you to a Study Call! Room code: ABC123 /call?room=ABC123&from=<uuid>"
 * These helpers are the single place that parses that convention.
 */

const TRAILING_LINK_RE = /\s*(?:Open:\s*)?(\/[A-Za-z0-9_-]*\?\S+)\s*$/;
const LEGACY_CALL_CODE_RE = /study call!?\s*room code:\s*([A-Z0-9]{4,12})/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotificationLink {
  /** Path part, e.g. "/friends". */
  path: string;
  params: URLSearchParams;
  /** Path + query, e.g. "/friends?friend=…". */
  href: string;
}

export function notificationLink(message: string): NotificationLink | null {
  const match = message.match(TRAILING_LINK_RE);
  if (!match) return null;
  const href = match[1];
  const q = href.indexOf("?");
  return { path: href.slice(0, q) || "/", params: new URLSearchParams(href.slice(q + 1)), href };
}

/** Message text without the trailing deep link. */
export function notificationDisplayText(message: string): string {
  return message.replace(TRAILING_LINK_RE, "").trim();
}

/** Room code when the notification is a study-call invite (new or legacy format). */
export function studyCallCode(message: string): string | null {
  const link = notificationLink(message);
  if (link?.path === "/call") {
    const room = link.params.get("room");
    if (room) return room.toUpperCase();
  }
  return message.match(LEGACY_CALL_CODE_RE)?.[1]?.toUpperCase() ?? null;
}

/** The friend a notification is about: chat sender (`friend=`) or call inviter (`from=`). */
export function notificationFriendId(message: string): string | null {
  const link = notificationLink(message);
  if (!link) return null;
  const id = link.params.get("friend") ?? link.params.get("from");
  return id && UUID_RE.test(id) ? id : null;
}

/** Which nav section a notification belongs to, for the side-nav badges. */
export function notificationSection(message: string): "friends" | "tavern" | null {
  const link = notificationLink(message);
  if (link?.path === "/friends" || link?.path === "/call") return "friends";
  if (link?.path === "/tavern") return "tavern";
  if (link) return null;
  const lower = message.toLowerCase();
  if (lower.includes("friend request")) return "friends";
  if (lower.includes("study call")) return "friends";
  if (lower.includes("party") || lower.includes("tavern")) return "tavern";
  return null;
}

export function isFriendRequestNotification(message: string): boolean {
  const lower = message.toLowerCase();
  return !notificationLink(message) && lower.includes("friend request");
}
