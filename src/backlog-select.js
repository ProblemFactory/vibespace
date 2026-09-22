/**
 * backlog-select.js — PURE (imports nothing; CJS so the bundle can share it)
 * THE BACKLOG'S PRIORITY + OWNERSHIP SELECTION (2026-09-22, owner: "没必要设
 * 上限，只要有合适的 priority 分级和 ownership，每次 push 能选择正确的条目就行").
 *
 * The store keeps EVERY item (no cap — src/task-groups.js). What a READ shows
 * is decided here, once, for every reader (the per-turn injection, TASK.md,
 * the `show` / `backlog` listing and the route's 1-based numbering):
 *
 *   - `sortBacklog(items)` — open items first, by priority (high → normal →
 *     low), NEWEST `addedAt` first within a priority (ties by id); then the
 *     resolved items (done / dropped), most recently resolved first.
 *   - `selectReminders(open, sessionKey, {limit})` — what one session is
 *     reminded of: what it OWNS first (≤ limit, in sortBacklog order); an open
 *     HIGH item that NOBODY owns is surfaced to everybody (ids + text) so it
 *     cannot rot — "nobody" includes a claimant that is no longer running
 *     when the caller passes `isLive` (a dead owner is not an owner);
 *     everything else is a count.
 *   - `escapeItemText` / `unescapeItemText` / `markedText` — the text
 *     renderings put the priority marker AFTER the id (`[B-xxxx] ! text`), so
 *     an item whose own text begins "! " or "↓ " would read back as a marker:
 *     such a text is written with ONE leading backslash (`\! text`, also the
 *     markdown escape) and the parser strips exactly one.
 *
 *   - `ownedOpen` / `backlogNudge` / `nudgeText` — THE CLEANUP NUDGE: a
 *     session holding ≥ `tasks.backlogNudgeAt` open items (claimed or parked
 *     by it) is asked, in ONE paragraph, to resolve / drop / merge before
 *     parking more — the route's mutating verbs, the injected backlog note
 *     and every turn's reminder carry the same words (`nudgeTextAll` = the
 *     several-groups form under the same one budget).
 *
 * A missing or unknown priority reads as 'normal' (every item stored before
 * the field existed). Nothing here mutates its input.
 */

const PRIORITIES = ['high', 'normal', 'low'];

function normalizePriority(p) { return PRIORITIES.includes(p) ? p : 'normal'; }

// 0 = high, 1 = normal, 2 = low (unknown ⇒ normal)
function priorityRank(p) { return PRIORITIES.indexOf(normalizePriority(p)); }

// The one-character marker every text rendering prints after an item's id
// ('' for normal): `!` high, `↓` low.
function priorityMarker(p) { const n = normalizePriority(p); return n === 'high' ? '!' : n === 'low' ? '↓' : ''; }

// A text that itself starts like a marker ("! …" / "↓ …", optionally already
// backslash-escaped) gains ONE backslash when written; the reader strips one.
const MARKER_LIKE = /^\\*[!↓]\s/;
function escapeItemText(text) { const s = String(text == null ? '' : text); return MARKER_LIKE.test(s) ? '\\' + s : s; }
function unescapeItemText(text) { const s = String(text == null ? '' : text); return /^\\+[!↓]\s/.test(s) ? s.slice(1) : s; }
// `! text` / `↓ text` / `text` (escaped) — what follows the `[B-xxxx] ` of a line
function markedText(b) { const mk = priorityMarker(b && b.priority); return (mk ? mk + ' ' : '') + escapeItemText(b && b.text); }

const isOpen = (b) => ((b && b.status) || 'open') === 'open';
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const byId = (a, b) => String(a.id || '').localeCompare(String(b.id || ''));

function sortBacklog(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const open = list.filter(isOpen).sort((a, b) =>
    (priorityRank(a.priority) - priorityRank(b.priority))
    || (num(b.addedAt) - num(a.addedAt))
    || byId(a, b));
  const resolved = list.filter((b) => !isOpen(b)).sort((a, b) =>
    (num(b.resolvedAt) - num(a.resolvedAt)) || byId(a, b));
  return [...open, ...resolved];
}

// `isLive(key)` (optional): is that claimant still running? Absent ⇒ every
// claim counts. A high item whose claimants are ALL not running is surfaced
// with `stale: true` (its owner is gone — somebody has to carry it).
function selectReminders(open, sessionKey, { limit = 5, isLive = null } = {}) {
  const lim = Math.max(0, Number.isInteger(limit) ? limit : 5);
  const sorted = sortBacklog((Array.isArray(open) ? open : []).filter(isOpen));
  const claims = (b) => (Array.isArray(b.claimedBy) ? b.claimedBy : []);
  const live = typeof isLive === 'function' ? isLive : () => true;
  const mineAll = sessionKey ? sorted.filter((b) => claims(b).includes(sessionKey)) : [];
  const highFree = sorted.filter((b) => normalizePriority(b.priority) === 'high'
    && !(sessionKey && claims(b).includes(sessionKey))
    && !claims(b).some((k) => live(k)));
  return {
    mine: mineAll.slice(0, lim),
    mineTotal: mineAll.length,
    unclaimedHigh: highFree.slice(0, lim).map((b) => ({ id: b.id, text: b.text, ...(claims(b).length ? { stale: true } : {}) })),
    unclaimedHighTotal: highFree.length,
    othersCount: sorted.length - mineAll.length,
  };
}

// ── THE CLEANUP NUDGE (2026-09-22) ──────────────────────────────────────
// With no store cap, a session can hoard parked items. When the items a
// session HOLDS reach the owner's threshold (setting `tasks.backlogNudgeAt`,
// default 20, 0 = off), every mutating backlog verb it runs, its injected
// backlog note AND every turn's reminder carry ONE paragraph asking it to
// clean up — the same words on every carrier (nudgeText / nudgeTextAll are
// the only wording).
//
// "Holds" = an OPEN item it claimed OR parked (`addedBy`) — handing an item
// back with unclaim does not make the parker's clutter somebody else's.
const NUDGE_DEFAULT = 20;
const NUDGE_STALE_DAYS = 14;
const NUDGE_MAX_BYTES = 500;
const DAY_MS = 86400000;

// a stored setting value → the threshold: a finite number or a numeric
// string counts (negative ⇒ 0 = off; fractions floor); ANYTHING else — absent,
// blank, a boolean, an object, a non-numeric string — is the default (a stored
// `true` must not read as Number(true) = 1 and nudge every session)
function nudgeThreshold(v) {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim() !== '') n = Number(v);
  else return NUDGE_DEFAULT;
  if (!Number.isFinite(n)) return NUDGE_DEFAULT;
  return Math.max(0, Math.floor(n));
}

function ownedOpen(items, sessionKey) {
  if (!sessionKey) return [];
  const seen = new Set();
  const out = [];
  for (const b of (Array.isArray(items) ? items : [])) {
    if (!b || !isOpen(b)) continue;
    const claimed = Array.isArray(b.claimedBy) && b.claimedBy.includes(sessionKey);
    if (!claimed && b.addedBy !== sessionKey) continue;
    const k = b.id || b;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out;
}

// null = no nudge (under the threshold, or the threshold is 0 = off)
function backlogNudge(items, sessionKey, { threshold = NUDGE_DEFAULT, nowMs = Date.now(), staleDays = NUDGE_STALE_DAYS } = {}) {
  const th = nudgeThreshold(threshold);
  if (th <= 0) return null;
  const owned = ownedOpen(items, sessionKey);
  if (owned.length < th) return null;
  const now = num(nowMs);
  const aged = owned.filter((b) => Number.isFinite(Number(b.addedAt)) && Number(b.addedAt) > 0)
    .map((b) => ({ b, ageDays: Math.max(0, Math.floor((now - Number(b.addedAt)) / DAY_MS)) }));
  const stale = aged.filter((x) => now - Number(x.b.addedAt) > staleDays * DAY_MS).length;
  const oldest = aged.sort((x, y) => (Number(x.b.addedAt) - Number(y.b.addedAt)) || byId(x.b, y.b)).slice(0, 3)
    .map(({ b, ageDays }) => {
      const t = String(b.text == null ? '' : b.text).replace(/\s+/g, ' ').trim();
      return { id: b.id || '?', ageDays, text: t.length > 60 ? t.slice(0, 59).trimEnd() + '…' : t };
    });
  return { owned: owned.length, stale, oldest, threshold: th, staleDays };
}

// UTF-8 length without Buffer (the bundle shares this module)
function utf8Bytes(s) { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; }
const clipTo = (t, n) => (t.length > n ? t.slice(0, Math.max(0, n - 1)).trimEnd() + '…' : t);
// the one cleanup sentence both forms end with
const cleanupSentence = (g) => `Clean up before parking more: \`vibespace-task ${g}backlog-done <id>\` for finished ones, \`backlog-drop <id>\` for obsolete ones, `
  + 'or merge same-topic items into one with `backlog-edit <id> --detail` and drop the rest.';
const oldestList = (nudge, textChars) => (nudge.oldest || []).map((o) => `[${o.id}] ${o.ageDays}d${textChars > 0 && o.text ? ` "${clipTo(o.text, textChars)}"` : ''}`).join(', ');
// never pass the budget regardless (unreachable with sane ids)
const hardClip = (s) => { let out = s; while (utf8Bytes(out) > NUDGE_MAX_BYTES) out = out.slice(0, -2) + '…'; return out; };

// ONE agent-facing paragraph (English, never translated), ≤ 500 bytes: the
// oldest items' texts shrink, then go, before the budget is ever passed.
function nudgeText(nudge, gid = '') {
  if (!nudge) return '';
  const g = String(gid || '');
  const days = nudge.staleDays || NUDGE_STALE_DAYS;
  const render = (textChars) => {
    const old = oldestList(nudge, textChars);
    return `You hold ${nudge.owned} open backlog items in this group (${nudge.stale} older than ${days} d${old ? `; oldest: ${old}` : ''}). ${cleanupSentence(g)}`;
  };
  for (const n of [60, 40, 24, 12, 0]) { const s = render(n); if (utf8Bytes(s) <= NUDGE_MAX_BYTES) return s; }
  return hardClip(render(0));
}

// THE SAME NUDGE FOR SEVERAL GROUPS AT ONCE, under ONE 500 B budget (a
// session in N groups over the threshold must not pay N × 500 B — that is
// what pushed a 2-group SessionStart past the 10 KiB persisted-output wrap).
// `entries` = [{ nudge, gid, group }] (group = the Task Group id, gid = its
// `--group <id> ` prefix or ''). One entry ⇒ exactly nudgeText's words; N ⇒
// one paragraph naming every group (oldest ids go first, then groups
// collapse into "+N more" before the budget is ever passed).
function nudgeTextAll(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.nudge);
  if (!list.length) return '';
  if (list.length === 1) return nudgeText(list[0].nudge, list[0].gid);
  const days = list[0].nudge.staleDays || NUDGE_STALE_DAYS;
  const total = list.reduce((a, e) => a + (e.nudge.owned || 0), 0);
  const render = (withOldest, shown) => {
    const parts = list.slice(0, shown).map((e) => {
      const old = withOldest ? oldestList(e.nudge, 0) : '';
      return `${e.group || '?'}: ${e.nudge.owned} (${e.nudge.stale} older than ${days} d${old ? `; oldest: ${old}` : ''})`;
    });
    const more = list.length - shown;
    return `You hold ${total} open backlog items across ${list.length} Task Groups, each past the cleanup threshold: ${parts.join('; ')}${more > 0 ? `; +${more} more group${more > 1 ? 's' : ''}` : ''}. ${cleanupSentence('--group <group> ')}`;
  };
  for (const withOldest of [true, false]) {
    for (let shown = list.length; shown >= 1; shown--) {
      const s = render(withOldest, shown);
      if (utf8Bytes(s) <= NUDGE_MAX_BYTES) return s;
      if (withOldest) break; // drop the oldest ids before dropping any group
    }
  }
  return hardClip(render(false, 1));
}

module.exports = { PRIORITIES, normalizePriority, priorityRank, priorityMarker, escapeItemText, unescapeItemText, markedText, sortBacklog, selectReminders, NUDGE_DEFAULT, NUDGE_STALE_DAYS, NUDGE_MAX_BYTES, nudgeThreshold, ownedOpen, backlogNudge, nudgeText, nudgeTextAll, utf8Bytes };
