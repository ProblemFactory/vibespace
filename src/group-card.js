'use strict';
/**
 * A GROUP MESSAGE IS SEEN WHERE IT WAS HANDED OVER (lane group-report-card; the owner, 2026-09-28 22:45 PDT:
 * "怎么在那个对话里看不到你发了消息？"). PURE (imports nothing; CJS so the server's card door, the three normalizers
 * and the bundle's renderer share ONE spelling of every rule).
 *
 * A `vibespace-msg send <group>` without --wake rides the receiving member's next USER turn as a report inside the
 * hook injection (src/server/groups-engine.js `reportsForTurn` / `commitReports`). The agent read it; the human
 * looking at that conversation saw nothing. Now every group MESSAGE a report carries is a CARD in the chat, emitted
 * at the injection through the delivery ladder's card door (`deliver.emitPeerCard`), and a wake's card (the ladder's
 * own, after a successful post) says the same thing the same way:
 *
 *   THE CARD   `{fromName, text, kind: 'group', group: {id, name, at, from, self, via, more, cut}}` — `group.at` is
 *              the group RECORD's own instant (with `id` it is the card's key), `via` = 'report' (it rode a turn
 *              somebody typed) | 'wake' (it started a turn), `more` = the older messages of that group the report
 *              did not show (counted on its oldest card: "… and N more (vibespace-msg read <group>)"), `cut` = the
 *              agent saw this one cut short (the text IS what it saw).
 *              A wake that carried SEVERAL messages (lane peer-card-sender, B-9fd6) adds `authors` ([{name, self}], ≤
 *              AUTHORS_SHOWN, report order) + `authorsMore` (the further senders, counted): the head says "A, B, C and
 *              N more → <group>" and the text holds each message as "<sender>: <words>" (`reportCardOf`).
 *   THE KEY    `<group id>:<record instant>` — a message carded once is never carded again in that conversation (a
 *              re-report after a restart whose marker write was lost, a wake over the same log range).
 *   THE RING   `session._groupCards` = `[{k, at, card}]`, oldest first, bounded (RING_MAX), persisted in the
 *              session meta (`groupCards`): a report card is PLACED by the rebuild after a restart (BY TIME —
 *              `placeAt`); a wake's card carries `recordedHead` (the start of the text the ladder posted): the CLI
 *              RECORDED that post, so the rebuild draws the transcript's own record AS the group card (upgraded in
 *              place — its id, its position), never a second card beside it.
 *
 * The renderer draws `peerGroup` (the sanitized `group`) as "<sender> → <group>" — a PEER's words, never a VibeSpace
 * notice (`peerVia` stays 'peer'). Gate: scripts/test-channel-groups.mjs §7.
 */

const GROUP_ID_RE = /^g-[0-9a-f]{8}$/;
const NAME_MAX = 120;
const TEXT_MAX = 4 * 1024;        // a report line is ≤ 2000 characters (channel-groups LINE_MAX) — the card never grows the meta
const RECORDED_HEAD_MAX = 400;    // what a wake's ring entry keeps of the posted text: enough to find the transcript's record
const RING_MAX = 120;             // the newest keys + cards a conversation keeps (a meta record, not a log)
/** A rebuild places a group card this long AFTER the injection instant: the turn's own user record and the hook's
 *  attachment records are stamped around the hook call (either side of it), the reply's first record later — live
 *  the card sits under the user's message, and the rebuild must say the same. */
const PLACE_SLACK_MS = 2000;
const VIAS = Object.freeze(['report', 'wake']);
/** A card head names at most this many senders of one delivered report; the rest are counted ("and N more"). */
const AUTHORS_SHOWN = 3;

const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function oneLine(v, max) {
  const s = String(v == null ? '' : v).replace(CTRL_RE, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** The card's group facts, sanitized — `{id, name, at, from, self, via, more, cut}` or null (never markup: the
 *  renderer escapes every string; this bounds them and drops what is not a fact). */
function groupOf(g) {
  if (!g || typeof g !== 'object') return null;
  const id = String(g.id || '');
  if (!GROUP_ID_RE.test(id)) return null;
  const at = Number(g.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const more = Math.max(0, Math.min(1e6, Math.floor(Number(g.more) || 0)));
  return {
    id, name: oneLine(g.name, NAME_MAX) || id, at,
    from: oneLine(g.from, NAME_MAX) || null,
    self: g.self === true,
    via: VIAS.includes(g.via) ? g.via : 'report',
    more, cut: g.cut === true,
    ...authorsOfGroup(g),
  };
}
/** `authors` + `authorsMore` of a card's group, sanitized — only for a report of two or more senders (a one-sender
 *  card is exactly what it was before lane peer-card-sender). */
function authorsOfGroup(g) {
  const list = (Array.isArray(g.authors) ? g.authors : []).slice(0, AUTHORS_SHOWN)
    .map((a) => (a && typeof a === 'object' ? { name: oneLine(a.name, NAME_MAX) || null, self: a.self === true } : null))
    .filter((a) => a && (a.self || a.name));
  const more = Math.max(0, Math.min(1e6, Math.floor(Number(g.authorsMore) || 0)));
  return list.length + more > 1 ? { authors: list, authorsMore: more } : {};
}
/** THE KEY: one card per (group, record) in a conversation. */
function cardKey(g) { const x = groupOf(g); return x ? `${x.id}:${x.at}` : null; }
/** The card's message id in a normalizer — stable across rebuilds (the live op and the rebuild name the SAME card). */
function cardId(sessionId, g) { const x = groupOf(g); return x ? `${sessionId || 'view'}:gm:${x.id}:${x.at}` : null; }

/** A whole card as the door stores it — `{fromName, text, group, shownAt, recorded?, recordedHead?}` or null.
 *  `shownAt` = the injection instant (the door stamps it); `recorded` = the exact text the ladder posted (a wake: the
 *  CLI's transcript holds that record); `recordedHead` = its start, what the RING keeps of it. */
function normalizeCard(card, { now = 0 } = {}) {
  if (!card || typeof card !== 'object') return null;
  const group = groupOf(card.group);
  if (!group) return null;
  let text = String(card.text == null ? '' : card.text).replace(CTRL_RE, '');
  if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX - 1) + '…';
  if (!text.trim()) return null;
  const shownAt = Number(card.shownAt) > 0 ? Number(card.shownAt) : Number(now) || 0;
  // the SENDER is the group's own `from` (the ladder's card label is "<sender> · <group>" — for an older client)
  const fromName = group.self ? null : (group.from || oneLine(card.fromName, NAME_MAX) || null);
  const head = typeof card.recordedHead === 'string' ? card.recordedHead.trim().slice(0, RECORDED_HEAD_MAX) : '';
  return { fromName, text, group, shownAt, ...(typeof card.recorded === 'string' ? { recorded: card.recorded } : {}), ...(head ? { recordedHead: head } : {}), ...(card.cleared === true ? { cleared: true } : {}) };
}
/** The start of a posted text as the ring keeps it (`recordedHead`) — the rebuild finds the transcript's record by it. */
function recordedHeadOf(text) { return String(text == null ? '' : text).trim().slice(0, RECORDED_HEAD_MAX); }

/** THE RING. */
function ringHas(ring, key) { return !!key && Array.isArray(ring) && ring.some((e) => e && e.k === key); }
function ringAdd(ring, entry, max = RING_MAX) {
  ring.push(entry);
  if (ring.length > max) ring.splice(0, ring.length - max);
  return ring;
}
/** The ring's REPORT cards — the ones a rebuild places by time (a wake's card has its transcript record) —, oldest
 *  injection first. */
function ringCards(ring) {
  const out = [];
  for (const e of Array.isArray(ring) ? ring : []) {
    const c = e && e.card ? normalizeCard(e.card) : null;
    if (c && c.shownAt > 0 && !c.recordedHead) out.push(c);
  }
  return out.sort((a, b) => a.shownAt - b.shownAt);
}
/** The ring's WAKE cards (`recordedHead`): the rebuild upgrades the transcript record that holds each post. */
function ringWakeCards(ring) {
  const out = [];
  for (const e of Array.isArray(ring) ? ring : []) {
    const c = e && e.card ? normalizeCard(e.card) : null;
    if (c && c.recordedHead) out.push(c);
  }
  return out;
}
/**
 * "CLEAR CONTENT…" REACHES THE CARD (the .197 integration, lane-redact × lane group-report-card): a group message the
 * owner cleared loses its words in every ring that carded it — the entry keyed `keys` (THE KEY: `<group>:<record
 * instant>`) keeps its place, its group facts and its instant; its text becomes `text` (the stored sentence) and it is
 * marked `cleared` (the renderer words it in the device's language). A wake's entry keeps `recordedHead` (the CLI
 * recorded that post: the transcript's own record is what a rebuild upgrades — the transcript class). Returns the
 * entries it changed (already-cleared ones are not changed twice).
 */
function redactRing(ring, keys, text) {
  const want = new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean).map(String));
  const out = [];
  for (const e of Array.isArray(ring) ? ring : []) {
    if (!e || !want.has(String(e.k)) || !e.card || e.card.cleared === true) continue;
    e.card = { ...e.card, text: String(text == null ? '' : text), cleared: true };
    out.push(e);
  }
  return out;
}
/** Where a rebuild places a card: its injection instant + the slack (records stamped before it come first). */
function placeAt(card) { return (Number(card && card.shownAt) || 0) + PLACE_SLACK_MS; }
/** Is this a group card (the door's ONE predicate — a ladder card with `group` is one too)? */
function isGroupCard(card) { return !!(card && typeof card === 'object' && card.group && GROUP_ID_RE.test(String(card.group.id || ''))); }

/** A waiting group message as the stash summary reads an entry (src/stash-summary.js kindOf: source 'group'): the
 *  sender's name as its label, `text` = "<sender> · <the message's first line>" — the Details row a preview draws. */
function pendingEntry(p) {
  if (!p || typeof p !== 'object') return null;
  const at = Number(p.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const first = String(p.text == null ? '' : p.text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const from = p.self ? null : (oneLine(p.from, NAME_MAX) || null);
  return { source: 'group', fromName: from, text: from ? `${from} · ${first}` : first, ts: at, groupId: String(p.groupId || '') };
}

// ── WHO WROTE A DELIVERED REPORT (lane peer-card-sender, B-9fd6; the owner 2026-10-02 20:25 PDT: "可以把你这些助手在
// vibespace里的名字都改一下吗 我看到的全是another啥啥啥"). A wake posts the member's whole pending report into its CLI
// inbox; the CLI records it as a NAME-LESS peer record ({kind:'peer', from:'unknown'} — the server is an unregistered
// poster) wrapped "Another Claude session sent a message: …". Two readers of one shape:
//   · reportCardOf — the card of a report the ENGINE delivered (its shown lines, the facts the ladder carries live)
//   · readReport   — the same facts read back off the record's own text, for a transcript record no ring entry
//                    names (a wake older than the ring's 120 entries, a conversation opened in another window): the
//                    fallback only — the delivery's own facts always win (normalizers upgradeWakeCards)
/** The card of one delivered report from its MESSAGE lines `[{from, self, text}]` (oldest first): `authors` = the
 *  distinct senders in report order (the first AUTHORS_SHOWN; `authorsMore` counts the rest), `text` = the words —
 *  one message ⇒ its words, one sender ⇒ the messages a blank line apart, several ⇒ each as "<sender>: <words>". */
function reportCardOf(lines) {
  const msgs = (Array.isArray(lines) ? lines : []).filter((l) => l && String(l.text == null ? '' : l.text).trim());
  const seen = new Set();
  const all = [];
  for (const l of msgs) {
    const name = l.self === true ? null : (oneLine(l.from, NAME_MAX) || null);
    const k = l.self === true ? '\u0000self' : name || '\u0000unknown';
    if (!seen.has(k)) { seen.add(k); all.push({ name, self: l.self === true }); }
  }
  const several = all.length > 1;
  const text = msgs.map((l) => {
    const words = String(l.text).trim();
    return several ? `${l.self === true ? 'User' : (oneLine(l.from, NAME_MAX) || 'unknown')}: ${words}` : words;
  }).join('\n\n');
  return { authors: all.slice(0, AUTHORS_SHOWN), authorsMore: Math.max(0, all.length - AUTHORS_SHOWN), text };
}
const REPORT_READ_MAX = 64 * 1024;   // a wake's report is ≤ its budget (a few KB) — a longer text is not one
const R_CLI_HEAD = /^\s*Another Claude session sent a message:[ \t]*\n/;
const R_CLI_TAIL = /\n+This came from another Claude session[\s\S]*$/;
const R_ENV_OPEN = /^\s*<cross-session-message\b[^>\n]*>[ \t]*\n?/;
const R_ENV_CLOSE = /\n?[ \t]*<\/cross-session-message>\s*$/;
const R_LEAD = /^[^\n]{1,200}(?: — group messages \(vibespace-msg\):|…)$/;   // the engine's lead (clipped: the tight form)
const R_HEAD = /^#### Group "(.*)" \((g-[0-9a-f]{8})\) — \d+ new\b/;
const R_LINE = /^- \[\d{2}-\d{2}T\d{2}:\d{2}Z\] (.*)$/;
const R_SYS = /^\(([a-z][a-z-]{0,30})\) ?(.*)$/;
const R_EARLIER = /^\((\d+) earlier\b/;
const R_CUT = /^\(\d+ (?:message\(s\) above cut short|cut)\b/;
const R_ADDED = /^You were added by (.+?)(?: — context: (.*)|\.)$/;
const R_FOOT = /^Reply: vibespace-msg send /;
/**
 * A delivered report read back off its record's text → `{id, name, lines:[{kind, from, text}], more, cut, inviter,
 * context, added}` or null. The report must OPEN the delivery (after the CLI's frame and an optional lead line) — anywhere
 * else it is somebody quoting one, which never names a card (`added` = an invite's own line). Tolerant by design (a structured mention, a line the
 * budget cut, the short head of the tight form): an unknown line is skipped, never guessed at.
 */
function readReport(text) {
  let s = String(text == null ? '' : text);
  if (s.length > REPORT_READ_MAX) return null;
  s = s.replace(R_CLI_HEAD, '').replace(R_CLI_TAIL, '').replace(R_ENV_OPEN, '').replace(R_ENV_CLOSE, '');
  const rows = s.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < rows.length && !rows[i].trim()) i++;
  if (i < rows.length && R_LEAD.test(rows[i])) i++;
  const h = R_HEAD.exec(rows[i] || '');
  if (!h || !GROUP_ID_RE.test(h[2])) return null;
  const out = { id: h[2], name: h[1], lines: [], more: 0, cut: false, inviter: null, context: '', added: '' };
  for (i++; i < rows.length; i++) {
    const r = rows[i];
    if (R_FOOT.test(r) || R_HEAD.test(r)) break;
    let m;
    if ((m = R_LINE.exec(r))) {
      const sys = R_SYS.exec(m[1]);
      const c = m[1].indexOf(': ');
      if (sys) out.lines.push({ kind: sys[1], from: null, text: sys[2] });
      else if (c > 0) out.lines.push({ kind: 'message', from: m[1].slice(0, c) === 'unknown' ? null : m[1].slice(0, c), text: m[1].slice(c + 2) });
    } else if ((m = R_EARLIER.exec(r))) out.more = Number(m[1]) || 0;
    else if (R_CUT.test(r)) out.cut = true;
    else if ((m = R_ADDED.exec(r)) && !out.inviter) { out.inviter = m[1]; out.context = m[2] || ''; out.added = r; }
  }
  return out;
}
/** A record's report as THE CARD it would have been live: `{fromName, text, group}` (via 'wake' — a recorded post is
 *  always a wake; `at` = the record's instant) or null. The sender = the newest message's (the one that woke it), an
 *  invite's inviter when no message rode it. */
function cardOfReport(rep, at) {
  if (!rep || !GROUP_ID_RE.test(String(rep.id || ''))) return null;
  const msgs = rep.lines.filter((l) => l.kind === 'message');
  const rc = reportCardOf(msgs);
  const from = msgs.length ? (msgs[msgs.length - 1].from || null) : (rep.inviter || null);
  const text = rc.text || String(rep.added || '').trim() || rep.lines.map((l) => l.text).filter(Boolean).join('\n');   // an invite: its own line (who, the context)
  const group = groupOf({ id: rep.id, name: rep.name, at, from, via: 'wake', more: rep.more, cut: rep.cut, authors: rc.authors, authorsMore: rc.authorsMore });
  return group && text.trim() ? { fromName: group.from, text, group } : null;
}

module.exports = { AUTHORS_SHOWN, reportCardOf, readReport, cardOfReport, GROUP_ID_RE, NAME_MAX, TEXT_MAX, RECORDED_HEAD_MAX, RING_MAX, PLACE_SLACK_MS, VIAS, groupOf, cardKey, cardId, normalizeCard, recordedHeadOf, ringHas, ringAdd, ringCards, ringWakeCards, redactRing, placeAt, isGroupCard, pendingEntry };
