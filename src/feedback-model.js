'use strict';
// AGENT FEEDBACK — THE MODEL (lane agent-feedback, the owner 2026-10-18: "能不能让他们通过某个指令直接给你 feedback，然后你定期
// 去检查那个 feedback 来改进我们整个系统？…比如它可以叫 report 或者叫 feedback 的一个 CLI 指令…当然也要在界面里有一个地方能让我
// 看到这些被 report 的结果"). An agent runs `vibespace-feedback "what felt wrong, and where" [--about <tool>] [--kind …]`; the
// report lands in data/feedback.json (src/server/feedback-store.js) and on the owner's ⚙ System ▸ Agent feedback… sheet.
//   · validate(input)        → { ok, value: {text, about, kind} } | { ok: false, code, error } — the BODY's three fields only;
//                              the caller's facts (session, group, harness, instance) are the ROUTE's, never the body's
//   · makeRecord(value, facts, {id, now}) → the stored record
//   · fold(list, record, now) → the ring: a duplicate (same normalized text + about, last seen within 24 h, any session)
//                              bumps `count` on the existing record; past LIMITS.ring the least recently reported record
//                              (open or handled) is dropped and counted
//   · setStatus(record, status, {by, now, version, note}) → the owner's open / handled — lane feedback-handled-verb: a
//                              handled record may name the release that shipped the fix (`handledVersion`) and a note
//                              (`handledNote`); the maintainer conversation's vibespace-api feedback.handled stamps both
//                              through the SAME store call as the owner's PATCH (`handledBy` = its name); a reopen clears them
//   · publicRow(record)      → what the UI and the agent's `list` get (the harness by name only, no reporter list; a
//                              forwarded report's `origin` — its instance + version, never the origin key's hash — lane
//                              feedback-forward); isMine never counts a forwarded report (another instance's conversation)
//   · handledNotice(record) / handledSentence(notice) / filerKey(record, liveKeyOf) — lane fleet-feedback-marks: a mark that
//                              NAMES A RELEASE is told to the conversation that filed the report, at its next turn (a free
//                              session-status notice, kind `feedback-handled`) in ONE sentence for every road — the hub's
//                              feedback.handled, an instance's maintainer key (`handledBy` = MAINTAINER_BY: the sheet says
//                              «the maintainers»), the forward's mark-back; the owner's own click names no release, tells nothing
// Every string is TEXT for its readers: the owner's sheet draws it with textContent only (the XSS law), the agent's CLI
// prints its own words back. PURE: imports nothing.

const KINDS = Object.freeze(['cli', 'flow', 'ui', 'docs', 'other']);
const STATUSES = Object.freeze(['open', 'handled']);
const LIMITS = Object.freeze({ textMax: 2000, aboutMax: 60, name: 120, ring: 500, reporters: 50, dedupMs: 24 * 3600e3, paceMs: 10e3, noteMax: 200 });
/** a release number (2.369.330) — the one that shipped a fix (lane feedback-handled-verb) */
const RELEASE_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;

/** characters as a person counts them (code points — a CJK character is one) */
function chars(s) { let n = 0; for (const _ of String(s ?? '')) n++; return n; } // eslint-disable-line no-unused-vars
// C0 / C1 controls except \n and \t, DEL, and the bidi embeddings / overrides / isolates that re-order what the owner reads
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
/** the text as stored: CRLF → LF, controls stripped, ends trimmed */
function cleanText(s) { return String(s ?? '').replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').trim(); }
/** a one-line field (about, a name): whitespace runs (newlines too) → one space, controls stripped, ends trimmed */
function cleanLine(s) { return String(s ?? '').replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim(); }
/** the first `n` characters (never a cut surrogate pair) */
function headChars(s, n) { const a = Array.from(String(s)); return a.length > n ? a.slice(0, n).join('') : String(s); }
/** the dedup key's halves: case and whitespace runs do not make a report new */
function normalized(s) { return cleanLine(s).toLowerCase(); }

/** the BODY's fields judged — a refusal by name, never a silent cut (the CLI echoes `sent: N characters`) */
function validate(input) {
  const b = input && typeof input === 'object' ? input : {};
  if (b.text != null && typeof b.text !== 'string') return { ok: false, code: 'text_not_text', error: 'the report is text — `vibespace-feedback "what felt wrong, and where"`' };
  const text = cleanText(b.text);
  if (!text) return { ok: false, code: 'text_missing', error: 'say what felt wrong, and where — `vibespace-feedback "what felt wrong, and where" --about <tool>`' };
  const n = chars(text);
  if (n > LIMITS.textMax) return { ok: false, code: 'text_too_long', error: `the report is ${n} characters — ${LIMITS.textMax} at most; say the one thing that felt wrong and where (one report per thing)` };
  if (b.about != null && typeof b.about !== 'string') return { ok: false, code: 'about_not_text', error: '--about is a word: a tool name like vibespace-task, or a flow' };
  const about = cleanLine(b.about);
  if (chars(about) > LIMITS.aboutMax) return { ok: false, code: 'about_too_long', error: `--about is ${chars(about)} characters — ${LIMITS.aboutMax} at most (a tool name like vibespace-task, or a word for the flow)` };
  const kind = b.kind == null || b.kind === '' ? 'other' : String(b.kind).trim().toLowerCase();
  if (!KINDS.includes(kind)) return { ok: false, code: 'kind_unknown', error: `--kind is one of ${KINDS.join(' | ')} (got ${JSON.stringify(headChars(String(b.kind), 20))})` };
  return { ok: true, value: { text, about, kind } };
}

/** a caller fact the route hands in, as stored (a name ≤ LIMITS.name, '' ⇒ null) */
const factName = (s) => { const v = headChars(cleanLine(s), LIMITS.name); return v || null; };
const factId = (s) => { const v = headChars(cleanLine(s), 200); return v || null; };
/** the harness by NAME only (a word the registry knows: claude, codex, opencode, …); anything else is 'other' */
const harnessName = (h) => { const v = String(h ?? '').trim().toLowerCase(); return /^[a-z][a-z0-9-]{0,23}$/.test(v) ? v : (v ? 'other' : null); };

/** the stored record: the validated body + the ROUTE's facts about the caller */
function makeRecord(value, facts = {}, { id, now }) {
  const f = facts || {};
  const sid = factId(f.session && f.session.id);
  return {
    id: String(id), at: now, lastAt: now,
    text: value.text, about: value.about || '', kind: value.kind || 'other',
    session: { id: sid, name: factName(f.session && f.session.name) },
    group: f.group && factId(f.group.id) ? { id: factId(f.group.id), name: factName(f.group.name) } : null,
    harness: harnessName(f.harness),
    instance: { name: factName(f.instance && f.instance.name), version: factName(f.instance && f.instance.version) },
    status: 'open', handledAt: null, handledBy: null, handledVersion: null, handledNote: null,
    count: 1, reporters: sid ? [sid] : [],
  };
}

const dupKey = (r) => normalized(r.text) + '\u0000' + normalized(r.about);

/** THE RING. → { list, record (the stored one: the new record or the bumped duplicate), duplicate, dropped: [ids] } */
function fold(list, record, now) {
  const L = Array.isArray(list) ? list.slice() : [];
  const key = dupKey(record);
  const i = L.findIndex((r) => r && dupKey(r) === key && now - (Number(r.lastAt) || Number(r.at) || 0) < LIMITS.dedupMs);
  if (i >= 0) {
    const had = L[i];
    const reporters = Array.isArray(had.reporters) ? had.reporters.slice() : [];
    const sid = record.session && record.session.id;
    if (sid && !reporters.includes(sid)) { reporters.push(sid); if (reporters.length > LIMITS.reporters) reporters.splice(0, reporters.length - LIMITS.reporters); }
    L[i] = { ...had, count: (Number(had.count) || 1) + 1, lastAt: now, reporters };
    return { list: L, record: L[i], duplicate: true, dropped: [] };
  }
  L.push(record);
  const dropped = [];
  while (L.length > LIMITS.ring) {
    let k = 0;
    for (let j = 1; j < L.length; j++) if ((Number(L[j].lastAt) || 0) < (Number(L[k].lastAt) || 0)) k = j;
    dropped.push(L[k].id);
    L.splice(k, 1);
  }
  return { list: L, record, duplicate: false, dropped };
}

/** the owner's verdict on one record → the new record, or a refusal by name. `version` / `note` (optional, handled only):
 *  the release that shipped the fix and a line about it — a malformed one is refused by name, never dropped */
function setStatus(record, status, { by = 'owner', now, version = null, note = null } = {}) {
  if (!STATUSES.includes(status)) return { ok: false, code: 'status_unknown', error: `status is ${STATUSES.join(' | ')}` };
  if (status === 'handled') {
    const v = version == null || version === '' ? null : String(version).trim();
    if (v != null && !RELEASE_RE.test(v)) return { ok: false, code: 'version_bad', error: `the version is a release number like 2.369.330 (got ${JSON.stringify(headChars(String(version), 20))})` };
    const n = note == null ? '' : cleanLine(note);
    if (chars(n) > LIMITS.noteMax) return { ok: false, code: 'note_too_long', error: `the note is ${chars(n)} characters — ${LIMITS.noteMax} at most` };
    return { ok: true, record: { ...record, status, handledAt: now, handledBy: factName(by) || 'owner', handledVersion: v, handledNote: n || null } };
  }
  return { ok: true, record: { ...record, status, handledAt: null, handledBy: null, handledVersion: null, handledNote: null } };
}

/** what a reader gets: the record without its reporter list */
function publicRow(r) {
  if (!r) return null;
  return {
    id: r.id, at: r.at, lastAt: r.lastAt || r.at, text: r.text, about: r.about || '', kind: r.kind || 'other',
    session: { id: (r.session && r.session.id) || null, name: (r.session && r.session.name) || null },
    group: r.group ? { id: r.group.id, name: r.group.name || null } : null,
    harness: harnessName(r.harness),
    instance: { name: (r.instance && r.instance.name) || null, version: (r.instance && r.instance.version) || null },
    status: r.status === 'handled' ? 'handled' : 'open', handledAt: r.handledAt || null, handledBy: r.handledBy || null,
    handledVersion: r.handledVersion || null, handledNote: r.handledNote || null,
    count: Number(r.count) || 1,
    origin: r.origin ? { instance: r.origin.instance || null, version: r.origin.version || null } : null,   // lane feedback-forward: forwarded from
  };
}

// ── lane fleet-feedback-marks: THE MAINTAINERS' MARK, TOLD TO THE ONE WHO FILED IT ──
/** `handledBy` of a mark the instance's MAINTAINER KEY made (src/automation-keys.js MAINTAINER_NAME — no conversation behind it) */
const MAINTAINER_BY = 'the maintainer key';
/** The notice a status change files → { kind: 'feedback-handled', id, about, version, note } | null: only a HANDLED record
 *  that names the release that shipped its fix (a reopen, the owner's own click, a bare handled tell nothing). */
function handledNotice(r) {
  if (!r || r.status !== 'handled' || !RELEASE_RE.test(String(r.handledVersion || ''))) return null;
  return { kind: 'feedback-handled', id: String(r.id), about: r.about || '', version: r.handledVersion, note: r.handledNote || null };
}
/** THE SENTENCE — one spelling for every road (the notice's renderer reads it; `note` arrives belted: another agent's words). */
function handledSentence(n = {}) {
  const about = cleanLine(n.about), note = cleanLine(n.note);
  return `Your feedback report ${cleanLine(n.id)}${about ? ` (about ${about})` : ''} was handled in ${cleanLine(n.version)}${note ? `: ${note}` : '.'}`;
}
const renderHandledNotice = (n) => '<system-reminder>\n' + handledSentence(n || {}) + '\n</system-reminder>';
/** The session-status key of the conversation that FILED `r` → `<harness>:<conversation id>` | null. `liveKeyOf(id)`
 *  (injected) answers a RUNNING session's own key by its conversation or webui id first; a forwarded report (another
 *  instance's conversation), a job's report and a webui id no session holds any more name nobody here. */
function filerKey(r, liveKeyOf = () => null) {
  if (!r || r.origin) return null;
  const id = r.session && r.session.id;
  if (!id || /^job:/.test(id)) return null;
  let k = null;
  try { k = liveKeyOf(id); } catch { k = null; }
  if (k) return String(k);
  return /^sess-/.test(id) ? null : `${harnessName(r.harness) || 'claude'}:${id}`;
}

/** a session's OWN reports (it filed the record, or repeated it): the agent's `list` */
const isMine = (r, ids) => { const want = (ids || []).filter(Boolean); return !!r && !r.origin && want.some((id) => (r.session && r.session.id === id) || (Array.isArray(r.reporters) && r.reporters.includes(id))); };
/** newest report first (a repeated report counts as new) */
const byNewest = (a, b) => (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0) || (Number(b.at) || 0) - (Number(a.at) || 0);
const openCount = (list) => (list || []).filter((r) => r && r.status !== 'handled').length;

/** the pacing verdict: one report per LIMITS.paceMs per session → null (go) | { code, error, retryAfterS } */
function paceVerdict(lastAt, now) {
  const wait = (Number(lastAt) || 0) + LIMITS.paceMs - now;
  if (!lastAt || wait <= 0) return null;
  const s = Math.ceil(wait / 1000);
  return { code: 'paced', error: `one report per ${LIMITS.paceMs / 1000} s from a session — wait ${s} s and send it again`, retryAfterS: s };
}

module.exports = { KINDS, STATUSES, LIMITS, RELEASE_RE, chars, cleanText, cleanLine, validate, makeRecord, fold, setStatus, publicRow, isMine, byNewest, openCount, paceVerdict,
  MAINTAINER_BY, handledNotice, handledSentence, renderHandledNotice, filerKey };   // lane fleet-feedback-marks
