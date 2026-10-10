'use strict';
/**
 * record-clear.js — PURE (imports nothing; CJS so the server, the client bundle
 * and the suites share ONE definition) — "CLEAR THIS RECORD" (2026-09-28, the
 * owner's ask: a peer agent wrote content from an unrelated mailbox into a Task
 * Group's records; the product had no way to scrub it, and a hand edit of
 * data/ is forbidden — the running server owns the stores).
 *
 * A CLEAR IS NOT A DELETE. The record keeps its identity, its time, its author
 * and its place; only its TEXT fields change:
 *   - a text field that carries words (`text`) becomes the ONE sentence
 *     CLEARED_TEXT — the English KEY (a store never holds a translated string;
 *     every client words it with its own t(), §16);
 *   - an optional field whose presence has meaning (`drop` — a detail, the
 *     structured i18n words, option chips, a reply) becomes null (`empty`: a
 *     list whose type is a list — a job's panel answers — becomes []; an empty
 *     value stays as it is), so no renderer prints a "† has detail" dagger or a
 *     chip for words that are gone;
 *   - `clearedAt` (ms) + `clearedBy` ('owner' | the session key of the agent
 *     that cleared its own entry) are stamped — only when a field WAS replaced
 *     (a record with no words is left as it is). `clearedAt` IS the flag — there
 *     is no `cleared: true`: session-status history already uses `cleared` for
 *     "the status was cleared" (session-props draws it as a state).
 * Everything else is byte-identical (scripts/test-record-clear.mjs proves it
 * per kind with a patched-copy control that drops a field).
 *
 * THE FIVE KINDS and where each lives (the stores' ONE `clear…` door each):
 *   activity       a Task Group Activity-log entry  src/task-groups.js clearProgress
 *   todo           a For-you item (open or resolved) src/user-todos.js clearItems
 *   status         a session-status HISTORY entry   src/session-status.js clearHistory
 *   job            a Background Work record (registry AND archive) src/jobs.js clearJobs
 *   group-message  an agent-group log record        src/server/groups-engine.js clearMessages
 *
 * WHO (clearVerdict): the OWNER (cookie) may clear any record; an AGENT (vsst_)
 * only what ITS OWN SESSION wrote — an Activity entry whose `session` is one of
 * its keys, a For-you item it filed itself (origin `agent`, no producer
 * `action`/`i18n` — a helper's permission ask is filed under the session's key
 * by the SERVER), a status entry it set, a job its conversation owns, a group
 * message it posted; a session that is a FORK still waiting for its own
 * conversation id is refused by name (its key is still its parent's); a job
 * token (jbt_) never. Every refusal is a CODE with its sentence (REFUSALS).
 */

const RECORD_KINDS = Object.freeze(['activity', 'todo', 'status', 'job', 'group-message']);

/** THE sentence — the English key every store writes and every client words. */
const CLEARED_TEXT = "[cleared at the user's request]";
/** …and its words, the owner's own (2026-09-28). The client dictionaries carry
 *  exactly these (test-record-clear pins i18n-zh.js / i18n-ja.js to them). */
const CLEARED_WORDS = Object.freeze({ en: CLEARED_TEXT, zh: '已按用户要求清除', ja: 'ユーザーの要請により消去済み' });
const clearedWords = (lang) => CLEARED_WORDS[lang] || CLEARED_WORDS.en;

// The TEXT FIELDS of each kind. `text` = a non-empty string becomes CLEARED_TEXT;
// `drop` = a present non-empty value becomes null (the stores' own "none");
// `empty` = a present non-empty array becomes [] (a list whose type is a list).
// A path is `a`, `a.b` (a nested object) or `a[].b` (every element of an array).
const SHAPES = Object.freeze({
  activity: Object.freeze([['note', 'text'], ['detail', 'drop']]),
  todo: Object.freeze([['text', 'text'], ['detail', 'drop'], ['i18n', 'drop'], ['options', 'drop'], ['reply', 'drop'], ['card', 'drop'], ['artifacts', 'drop']]), // card: design 009's install card (an app's name, the agent's why); artifacts: an ask's --artifact rows (names + paths — lane foryou-attachments)
  // a history entry: the reason (the one-liner) + its detail; a `vcs` event row's branch name
  status: Object.freeze([['reason', 'text'], ['detail', 'drop'], ['branch', 'drop']]),
  // a job: its name + note + context brief + progress line + the notify action's text, and what its
  // runs and deliveries said (the last log line of each run, the reason of each delivery attempt,
  // the user's answers to its panels). The COMMAND is the program, not a record's words — kept (rm removes it).
  // …and the ASK it is waiting on (verify r3): `interaction.pending` is the job's own question — a panel of
  // markdown + labels the owner answers from the For-you item / the panel dialog (GET /api/jobs/:id serves
  // it whole) — so it goes with the words; the engine then flips `awaiting-user` back to `up` and resolves
  // the ask's For-you item (the question was withdrawn; the job may ask again).
  job: Object.freeze([['name', 'text'], ['note', 'drop'], ['context', 'drop'], ['progress', 'drop'], ['action.text', 'text'],
    ['lastNotify.reason', 'drop'], ['notifyLog[].reason', 'drop'], ['runs[].lastLine', 'drop'], ['interaction.answers', 'empty'], ['interaction.pending', 'drop']]),
  // a group log record: its text, an invite's context line, a rename's previous name
  'group-message': Object.freeze([['text', 'text'], ['raw.context', 'drop'], ['raw.from', 'drop']]),
});

/** The text fields a clear of `kind` replaces, as `[{path, op}]` — record-aware
 *  for ONE case: a For-you item filed by Background Work carries the JOB'S NAME
 *  in its `sessionName` label (src/server/jobs-wiring.js), a label derived from
 *  the record's content, so it goes too. Unknown kind ⇒ []. */
function clearedFields(kind, record = null) {
  const s = SHAPES[kind];
  if (!s) return [];
  const out = s.map(([p, op]) => ({ path: p, op }));
  if (kind === 'todo' && record && record.origin === 'jobs') out.push({ path: 'sessionName', op: 'drop' });
  return out;
}

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
/** Apply ONE op to `obj[key]`; true when it changed something. */
function applyOp(obj, key, op) {
  if (!obj || typeof obj !== 'object' || !Object.prototype.hasOwnProperty.call(obj, key)) return false;
  const v = obj[key];
  if (op === 'text') {
    if (typeof v !== 'string' || !v || v === CLEARED_TEXT) return false;
    obj[key] = CLEARED_TEXT;
    return true;
  }
  if (isEmpty(v)) return false;
  obj[key] = op === 'empty' && Array.isArray(v) ? [] : null;
  return true;
}
/** Walk `path` inside `rec`; returns how many values the op changed. */
function applyPath(rec, path, op) {
  const segs = path.split('.');
  let targets = [rec];
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const arr = seg.endsWith('[]');
    const key = arr ? seg.slice(0, -2) : seg;
    const next = [];
    for (const t of targets) {
      const v = t && typeof t === 'object' ? t[key] : undefined;
      if (arr) { if (Array.isArray(v)) for (const el of v) if (el && typeof el === 'object') next.push(el); }
      else if (v && typeof v === 'object') next.push(v);
    }
    targets = next;
  }
  const last = segs[segs.length - 1];
  let n = 0;
  for (const t of targets) if (applyOp(t, last, op)) n++;
  return n;
}

/** CLEAR `record` IN PLACE (the stores' door — a live job object keeps its
 *  runtime-only fields, which a copy would lose). Returns `{changed, paths}`:
 *  `changed` false = nothing held words any more (an already-cleared record
 *  keeps its FIRST stamp); true = the fields listed in `paths` were replaced
 *  and `clearedAt`/`clearedBy` (re)stamped — a job that ran again after a
 *  clear has new words, and a second clear takes them. */
function applyClear(record, { kind, by, at } = {}) {
  if (!record || typeof record !== 'object' || !SHAPES[kind]) return { changed: false, paths: [] };
  const paths = [];
  for (const { path, op } of clearedFields(kind, record)) if (applyPath(record, path, op)) paths.push(path);
  // nothing held words: an already-cleared record keeps its FIRST stamp, and a record that never
  // had any (a state-only status entry) is not marked cleared — it would read the sentence for nothing
  if (!paths.length) return { changed: false, paths };
  record.clearedAt = Number.isFinite(at) ? at : Date.now();
  record.clearedBy = String(by || 'owner');
  return { changed: true, paths };
}

/** The same record, cleared — a COPY (the original is untouched). */
function clearedRecord(record, { kind, by, at } = {}) {
  if (!record || typeof record !== 'object') return record;
  const copy = JSON.parse(JSON.stringify(record));
  applyClear(copy, { kind, by, at });
  return copy;
}

// ── WHO MAY CLEAR (the verdict) ─────────────────────────────────────────────
/** The most records ONE request may name (the owner's clear-many route refuses more
 *  `too_many`); a client with a bigger batch — "Select all shown" over a 500-entry
 *  Activity log — sends it in `chunked()` parts, never one refused request. */
const MAX_ITEMS = 200;
/** `list` cut into consecutive parts of at most `n` (order kept, nothing dropped). */
function chunked(list, n = MAX_ITEMS) {
  const a = Array.isArray(list) ? list : [];
  const size = Math.max(1, Math.floor(Number(n)) || MAX_ITEMS);
  const out = [];
  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));
  return out;
}
const REFUSALS = Object.freeze({
  bad_kind: { status: 400, why: `not a record that can be cleared — one of ${RECORD_KINDS.join(', ')}` },
  no_caller: { status: 401, why: 'no caller — a clear is the user\'s act (their cookie) or an agent\'s own session token' },
  job_token: { status: 403, why: 'a job token cannot clear records — ask the user to clear it, or clear it from the session that wrote it' },
  not_found: { status: 404, why: 'no such record' },
  pending_fork: { status: 409, why: 'this session is a fork that has no conversation of its own yet — send it one message first, then clear what it wrote' },
  not_yours: { status: 403, why: 'an agent may clear only what its own session wrote — ask the user to clear this one (right-click it → Clear content…)' },
  ambiguous: { status: 409, why: 'several entries share that time — pass the entry\'s id (vibespace-task show prints it)' },
  agent_forbidden: { status: 403, why: 'clearing a record is the user\'s act — an agent token cannot use this route (an agent clears its own entries with vibespace-task progress-redact / vibespace-ask clear)' },
  bad_items: { status: 400, why: 'items must be a non-empty array of {kind, id} records' },
  too_many: { status: 400, why: `at most ${MAX_ITEMS} records per request` },
  unavailable: { status: 503, why: 'that store is not available on this instance right now — retry shortly' },
  failed: { status: 500, why: 'the clear could not be written — nothing was changed' },
});
const refuse = (code) => ({ ok: false, code, why: (REFUSALS[code] || REFUSALS.failed).why, status: (REFUSALS[code] || REFUSALS.failed).status });

/** Did the agent `caller` write this record? One rule per kind (see the header). */
const OWNERSHIP = Object.freeze({
  activity: (rec, c) => typeof rec.session === 'string' && c.keys.has(rec.session),
  todo: (rec, c) => c.keys.has(rec.sessionKey) && rec.origin === 'agent' && rec.by === 'agent' && !rec.action && !rec.i18n,
  status: (rec, c, key) => !!key && c.keys.has(key) && rec.setBy === 'agent',
  job: (rec, c) => !!c.cid && !!(rec.owner && rec.owner.conversation && rec.owner.conversation.id === c.cid) && (rec.owner.createdBy || '') !== 'user',
  'group-message': (rec, c) => !!c.cid && !!(rec.author && rec.author.id === c.cid) && ((rec.raw && rec.raw.kind) || 'message') === 'message',
});

/**
 * clearVerdict({kind, caller, record, key?}) → {ok:true} | {ok:false, code, why, status}
 * caller = {role:'owner'} | {role:'agent', keys:[…], conversationId?, pendingFork?} | {role:'job'}
 * key    = the session-status key a `status` entry sits under
 */
function clearVerdict({ kind, caller, record, key = null } = {}) {
  if (!RECORD_KINDS.includes(kind)) return refuse('bad_kind');
  if (!caller || typeof caller !== 'object' || !caller.role) return refuse('no_caller');
  if (caller.role === 'job') return refuse('job_token');
  if (caller.role !== 'owner' && caller.role !== 'agent') return refuse('no_caller');
  if (!record || typeof record !== 'object') return refuse('not_found');
  if (caller.role === 'owner') return { ok: true };
  if (caller.pendingFork) return refuse('pending_fork');
  const c = { keys: new Set((caller.keys || []).filter((k) => typeof k === 'string' && k)), cid: caller.conversationId || null };
  return OWNERSHIP[kind](record, c, key) ? { ok: true } : refuse('not_yours');
}

// ── what a confirm dialog names (the record's time + its first words) ──────
/** The record's own instant, per kind. */
function recordAt(kind, rec) {
  if (!rec) return null;
  const n = kind === 'todo' ? rec.createdAt : kind === 'job' ? rec.createdAt : rec.at;
  return Number.isFinite(Number(n)) && n !== null ? Number(n) : null;
}
/** The record's words as it reads NOW (the dialog names what is about to go). */
function recordWords(kind, rec) {
  if (!rec) return '';
  if (kind === 'activity') return rec.note || '';
  if (kind === 'todo') return rec.text || '';
  if (kind === 'status') return rec.reason || rec.branch || rec.state || '';
  if (kind === 'job') return rec.name || '';
  if (kind === 'group-message') return rec.text || (rec.raw && rec.raw.context) || '';
  return '';
}
/** The first `max` characters of `s` on one line (whitespace collapsed), `…` when cut. */
function previewWords(s, max = 80) {
  const v = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cps = Array.from(v);
  return cps.length > max ? cps.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…' : v;
}

/**
 * WHY A FIND MATCHED a record whose shown words do not carry the query — the text
 * around the first case-insensitive occurrence of `query` in `text` (the Find box's
 * own rule: a plain substring), on one line, at most `max` characters, `…` where it
 * was cut. '' when `query` is empty or absent from `text`. The confirm dialog prints
 * it under a record the Find box matched by its DETAIL (the row shows only the note).
 */
function matchSnippet(text, query, max = 80) {
  const v = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const q = String(query == null ? '' : query).replace(/\s+/g, ' ').trim();
  if (!q) return '';
  const at = v.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return '';
  const cps = Array.from(v);
  // code-point positions: the match's start, then a window of `max` around it (a third before)
  const startCp = Array.from(v.slice(0, at)).length;
  const qLen = Array.from(q).length;
  const room = Math.max(qLen, Math.floor(Number(max)) || 80);
  let from = Math.max(0, startCp - Math.floor((room - qLen) / 3));
  let to = Math.min(cps.length, from + room);
  from = Math.max(0, Math.min(from, to - room));
  const head = from > 0 ? '…' : '', tail = to < cps.length ? '…' : '';
  return head + cps.slice(from, to).join('').trim() + tail;
}

// ── the group log's REPLACEMENT records (append-only) ───────────────────────
/** The raw.kind a group log's replacement record carries — `{kind:'cleared', of:<vendorId>, by}`. */
const REPLACEMENT_KIND = 'cleared';
const isReplacement = (r) => !!(r && r.raw && r.raw.kind === REPLACEMENT_KIND);
/**
 * A group log as every reader must see it: the replacement records DROPPED
 * (they are not messages — never unread, never reported, never drawn) and every
 * record they name — or the index names (`{vendorId: {at, by}}`, the group's
 * `cleared` map, which a page that does not reach the replacement still has) —
 * CLEARED. Order kept; the input is not mutated.
 */
function foldClears(records, index = null) {
  const idx = new Map();
  if (index && typeof index === 'object') for (const [vid, v] of Object.entries(index)) idx.set(vid, v || {});
  const list = Array.isArray(records) ? records : [];
  for (const r of list) if (isReplacement(r) && r.raw.of && !idx.has(r.raw.of)) idx.set(r.raw.of, { at: r.at, by: r.raw.by });
  const out = [];
  for (const r of list) {
    if (!r || isReplacement(r)) continue;
    const c = r.vendorId ? idx.get(r.vendorId) : null;
    out.push(c ? clearedRecord(r, { kind: 'group-message', by: c.by || 'owner', at: Number(c.at) || 0 }) : r);
  }
  return out;
}

// A LAYOUT RECORD KEEPS NO RECORD'S WORDS (verify r5; the table moved here in verify r7 so the client and the server read
// ONE table). A window whose title is drawn from a record's words (the Job input window: `<job name> — needs your input`)
// is kept in every layout RECORD under a generic title — the title is display, rebuilt from the store when the window
// replays from its openSpec. The server applies it at its write choke point (routes/persistence.js wordlessTitles); the
// client applies it at its ONE capture (layout.js captureState), which feeds every copy the page keeps of its own layout —
// the autosave it last sent (_lastSentJson), a named preset (_savedPresets), the record of a desktop it switched away
// from (DesktopManager._savedStates) and the stage's (verify r7: those three kept the job's name in the page after a clear).
// `WORDLESS_TITLES` = openSpec action → the title a record keeps.
const WORDLESS_TITLES = Object.freeze({ openJobInteract: 'Job input' });
/** The title a layout record keeps for a window: the generic one when its openSpec's action draws a record's words. */
function wordlessTitleOf(openSpec, title) {
  const a = openSpec && typeof openSpec === 'object' ? openSpec.action : null;
  return typeof a === 'string' && Object.prototype.hasOwnProperty.call(WORDLESS_TITLES, a) ? WORDLESS_TITLES[a] : title;
}

module.exports = {
  RECORD_KINDS, CLEARED_TEXT, CLEARED_WORDS, clearedWords, SHAPES, clearedFields,
  applyClear, clearedRecord, clearVerdict, REFUSALS, refuse,
  recordAt, recordWords, previewWords, matchSnippet, MAX_ITEMS, chunked,
  REPLACEMENT_KIND, isReplacement, foldClears, WORDLESS_TITLES, wordlessTitleOf,
};
