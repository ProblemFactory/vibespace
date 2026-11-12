'use strict';
/**
 * PURE (imports nothing; CJS so the route — src/routes/persistence.js — and the page — src/lib/sidebar-state.js, through the
 * browser bundle — share ONE spelling) — USER STATE BY ITEM, IN THE SERVER'S ORDER (lane sidebar-echo-order, the owner's
 * incident inc-mwbn2xp8-ks0b, 2026-11-11: «我的批量操作一直在回滚» — 122 Archive clicks in 55 s on a hub whose loop lagged
 * ~1.9 s; the first echo came 44 s after the first click, and every echo REPLACED the page's whole archived list with what
 * the server held when that echo was made, and the next click pushed the rolled-back list WHOLE: archived conversations came
 * back on the screen and were then erased on the server too).
 *
 * THE LAW. (1) An echo never undoes what the person did after it was asked: the page shows the server's newest state (by
 * `stateRev`, a write counter the SERVER gives — never data — WITHIN one life of the server, `stateEpoch`) PLUS its own acts the
 * server has not yet confirmed; an act leaves that overlay only once a server state of the same life at or past the write
 * that took it has been applied. (2) A push carries what the person changed — per ITEM, and inside an item per member / per
 * field — never the page's copy of a whole key, so a stale (or rolled-back) page cannot erase what it never touched.
 * (3) Nothing is lost and nothing is said done that is not: an act has ONE batch identity, given when the person makes it
 * (round 2, law 1); the server applies a batch once; a send that does not answer within SEND_TIMEOUT_MS is a failed send
 * (round 2, law 2), sent again under the same id — nothing said about it (round 9). (4) Every page converges on the newest server state once its own
 * acts are confirmed; a counter that goes back is a NEW LIFE, not an old echo (round 2, law 3).
 * A PAGE'S UNCONFIRMED ACTS LIVE AND DIE WITH THE PAGE — nothing about an act in flight is stored or shared between pages
 * (the page id is made per page LOAD, in memory). EVERY ACT IS ON THE WIRE AT THE ACT (round 4), and EVERY REQUEST CARRIES
 * EVERYTHING THE PAGE HAS NOT SEEN CONFIRMED, oldest first, under its own ids (round 5 — master's redundancy, in ops: a later
 * act carries an earlier one whose request failed or is late). ROUND 7 — THE LATER ACT WINS, AS ON MASTER; AN ACT IS DROPPED
 * ONLY IF SOMEONE ELSE CHANGED THE ITEM AFTER THE ACT WAS MADE: each batch carries its AGE (the device's wall clock between the
 * act and the send), and the route keeps a FACT PER SLOT (when it last changed it, by which page and act) — never a memory per
 * page, so there is no page to forget.
 *
 * THE OPS (PATCH /api/user-state/batches {batches: [{batch: '<page>:<seq>', age, ops}, …]}):
 *   set keys     {key, item, value: true | false}            — the item is a member or not
 *   value keys   {key, item, value: <value> | null}          — the item's value; null deletes it
 *   member keys  {key, item, member, value: true | false}    — one member of the item's list in / out
 *                {key, item, value: true | false}            — the item (a group) exists / is deleted (never its members)
 *   field keys   {key, item, field, value: <value> | null}   — one field of the item's object; an emptied item is removed
 */
const SET_KEYS = Object.freeze(['starredSessions', 'archivedSessions', 'archivedFolders']);
const VALUE_KEYS = Object.freeze(['customNames', 'sessionModes']);
const MEMBER_KEYS = Object.freeze(['sessionGroups', 'groupFolders']);   // a group → its conversations / its folders
const FIELD_KEYS = Object.freeze(['sessionConfigs']);                    // a conversation → {model, effort, permission, …}
const KEYS = Object.freeze([...SET_KEYS, ...VALUE_KEYS, ...MEMBER_KEYS, ...FIELD_KEYS]);
/** the SERVER's write counter: +1 on every write, in the GET body, every broadcast and every write's answer; never exported,
 *  never accepted from a client */
const REV_KEY = 'stateRev';
/** the server's LIFE (round 2, law 3): one id per process start — the counter orders states within one life only; a restore
 *  (an older user-state.json, a LOWER counter) always restarts the hub, so a page that meets another life takes its state */
const EPOCH_KEY = 'stateEpoch';
/** the server's FACT PER SLOT (round 7): when it last changed the slot, by which page and act — written with stateRev and the
 *  state in ONE atomic write; never in a GET, a broadcast or an export */
const FACTS_KEY = 'stateFacts';
/** the hub's own clock, high-water (round 8): the facts are never stamped or judged behind it — a server clock stepped back
 *  reads as the mark until it catches up; persisted with the facts; a life starts at or after it */
const CLOCK_KEY = 'stateClock';
const SERVER_KEYS = Object.freeze([REV_KEY, EPOCH_KEY, FACTS_KEY, CLOCK_KEY]);
/** a value nested deeper than this is refused by name (round 8: a 100 000-deep array overflowed the write's stack — a 503) */
const MAX_VALUE_DEPTH = 4;   // round 12: the product's deepest value is 2 (a config's tools: {allow: […], deny: […]} — round 13, corrected from 1); poolPin is 1; round 11's 32 let a value hold the file 1.8 s (indented)
/** never a top-level key of the store: a request's own keys (a .392 hub stored a {batches} body as one) and the per-page memory of
 *  rounds 5–6 — the load drops them */
const WIRE_KEYS = Object.freeze(['batches', 'born', 'seq', 'stateBatches']);
/** THE BOUNDS (round 2, smaller 4; rounds 5–6): the largest real act is a select-all over every conversation — about 5 000 on
 *  the largest hub measured (the sidebar's «~5k sessions» render) — so a BATCH holds up to 20 000 ops and 1 MiB (an act past
 *  either is its parts), and a REQUEST up to 12 MiB (round 11, 主开发's ruling B: 48 MiB of object values held the hub 2.4 s;
 *  the owner's whole store is 0.4 MB, a select-all of 20 000 archives 2.6 MiB) — the user-state routes' own bound, under the 50 MiB
 *  every JSON route of this server parses (express.json '50mb', server.js). Past them the route refuses by name (a batch on its
 *  own; a body past the bound whole, 413); the page's splitter reads the SAME constant, so a page builds none it refuses. */
const MAX_OPS_PER_BATCH = 5000;   // round 12 (主开发's ruling): a select-all goes in four requests of ~40 ms — the loop held a quarter as long at a time
/** a REQUEST holds at most this many ops in all (round 10: one full select-all batch) — no legal request holds the hub's loop longer
 *  than its worst (≈ 150 ms measured; master's worst legal request, a 1 M-id whole key, 816 ms); a page sends the rest at the
 *  answer, the road the byte bound already takes */
const MAX_OPS_PER_REQUEST = 5000;   // round 12: as MAX_OPS_PER_BATCH (round 10: 20 000 — 174 ms against master's whole key ~10 ms)
const MAX_REQUEST_VALUE_CHARS = 512 * 1024;   // round 12, law A at the ops door: the VALUES one request carries, as the file holds them (2 MiB of values at their bound was 120 ms against master's 58 — the 100 ms floor); a select-all carries booleans, a config edit ~140 characters
const MAX_WHOLE_MOVES = 20000;   // round 13: past this many changed items, a write through master's roads (an older page's whole key) is recorded as ONE RECORD for each key it changed — never a refusal (master takes it); round 14: the record keeps the DIGESTS of the slots it changed, so it takes back only an earlier act on one of THOSE (keySetSlotOf, factAt)
const MAX_BODY_BYTES = 2 * 1024 * 1024;   // the OPS door's body, read at its parser (round 12, law C) — ONE number with the page's splitter (createSync's maxRequestBytes)
/** an act past 1 MiB of ops is split too (round 3, smaller 4) — a batch the page builds always fits a request */
const MAX_BATCH_BYTES = 1024 * 1024;
/** a send that has not answered in 15 s is a FAILED send (round 2, law 2): this hub holds its loop for up to ~10 s several
 *  times a day (the journal's «the main loop was held» lines), so a bound under that would cry «not saved» at a write that is
 *  about to land; past it the person is told, and the batch goes again under its own id (the server applies it once) */
const SEND_TIMEOUT_MS = 15000;
const RETRY_MS = Object.freeze([2000, 5000, 15000]);
/** an act older than this is NOT applied (round 7): its page says so once, undoes it and shows the state — and so a fact older
 *  than this is dropped at a write: no op old enough to need it is applied */
const MAX_ACT_AGE_MS = 7 * 24 * 3600 * 1000;
/** smaller 2 (round 6): the paced re-send stops after 40 probes in a row with no answer (≈ 10 min at its 15 s cadence) — the
 *  next act, a reconnect or a state starts it again; the requests listened to at once are bounded too */
const PROBES_MAX = 40;
/** round 14 follow-up (主开发): a 404 from the ops door is NOT a verdict for this long — the minute of an update (a reloaded tab on the old
 *  server until the restart) answers 404 and then takes every act; only a 404 streak past it is said, and in words that never ask for a
 *  reload (acts live in this page's memory: a reload would lose them) */
const NOT_TAKEN_WAIT_MS = 3 * 60 * 1000;
const ASK_GIVE_UP_MS = 15000, ASK_GIVE_UP_MAX_MS = 120000, ASK_SLOW_MS = 300000;   // (round 12: the paced ask's give-up, doubling with the pace; past PROBES_MAX, one ask every 5 minutes)
const IN_FLIGHT_MAX = 32;
const BATCH_RE = /^([A-Za-z0-9_-]{6,64}):([1-9][0-9]{0,14})$/;   // (round 10: a counter of at most 15 digits — always a safe integer, so every fact the route writes it reads back)
const ITEM_MAX = 4096;
const MAX_GROUP_MEMBERS = 20000;   // round 12: a group's size is a dimension — the owner's largest group is 3, the product builds one of a select-all at most; at every door
const MAX_VALUE_CHARS = 16384;   // round 11, MUST 2: ONE value's bound — the owner's largest real value is 139 characters (a group's members), a config field 79 (poolPin), a name 42
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);   // never an item, a member or a field (refused by name)
const kindOf = (key) => (SET_KEYS.includes(key) ? 'set' : VALUE_KEYS.includes(key) ? 'value' : MEMBER_KEYS.includes(key) ? 'member' : FIELD_KEYS.includes(key) ? 'field' : null);
const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? a === b : JSON.stringify(a) === JSON.stringify(b));   // values are JSON (the store is a JSON file); two strings compared as themselves — the same verdict (round 10: 20 000 names of 2.4 KB were 78 ms of stringify)
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const revOf = (state) => { const n = Number(state && state[REV_KEY]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const epochOf = (state) => { const e = state && state[EPOCH_KEY]; return typeof e === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(e) ? e : null; };
/** a life's START (round 6): the route's stateEpoch is 'ep<start, base 36>-<random>' — so a page can tell a late answer from a life
 *  the hub has already left (its GET answered after the restart's) from a new life; null for an epoch without one */
const lifeStart = (ep) => { const m = typeof ep === 'string' ? /^ep([0-9a-z]{6,12})-/.exec(ep) : null; return m ? parseInt(m[1], 36) : null; };
/** a state of ANOTHER life is the past when it is lower in the counter AND its life started earlier (a restore — a lower counter
 *  — always starts a later life, so it is taken; a GET answered by the life before a restart, arriving after it, is not) */
const pastLife = (ep, rev, baseEp, baseRev) => { const a = lifeStart(ep), b = lifeStart(baseEp); return a !== null && b !== null && a < b && rev < baseRev; };
/** the UTF-8 byte length of a string (no TextEncoder needed) */
const utf8Length = (str) => { let n = 0; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; } else n += 3; } return n; };

/** the eight keys of a state, each in its shape (a missing key = empty) — a copy, never the state's own objects */
function viewOf(state, keys = KEYS, copy = true) {
  const s = isObj(state) ? state : {};
  const out = {};
  for (const k of keys) {
    if (kindOf(k) === 'set') out[k] = Array.isArray(s[k]) ? s[k].filter((x) => typeof x === 'string' && x) : [];
    else out[k] = isObj(s[k]) ? (copy ? JSON.parse(JSON.stringify(s[k])) : s[k]) : {};   // (copy = false: a reader that never keeps what it read)
  }
  return out;
}
/** the person's keys of a state — the server's own (stateRev, stateEpoch, stateFacts) taken out (the export, a restore's input) */
function personKeys(state) {
  if (!isObj(state)) return state;
  const out = {};
  for (const [k, v] of Object.entries(state)) if (!SERVER_KEYS.includes(k)) out[k] = v;
  return out;
}

const badName = (x) => typeof x !== 'string' || !x || x.length > ITEM_MAX || (x.length <= 11 && FORBIDDEN.has(x));   // (round 11: a 4 KB name is never hashed against the three forbidden ones)
/** why an op is refused, or null */
/** what is wrong with one op → {code, error} | null — the CODE is what a page words in the person's language (round 9); the
 *  error is the route's own English, for logs */
function opRefusal(op, pre) {
  const no = (code, error) => ({ code, error });
  if (!isObj(op)) return no('not-an-op', 'not an object');
  const kind = kindOf(op.key);
  if (!kind) return no('unknown-key', `unknown key ${JSON.stringify(op.key)} (one of ${KEYS.join(', ')})`);
  const vb = pre === undefined ? valueBound(op.value) : pre;   // (round 11: ONE walk of the value — the route hands in its own)
  if (vb === 'too-deep') return no('too-deep', `a value nested deeper than ${MAX_VALUE_DEPTH} levels`);
  if (vb === 'too-large-value') return no('too-large-value', `a value larger than ${MAX_VALUE_CHARS} characters (the product's largest setting is a few hundred)`);
  if (badName(op.item)) return no('not-a-name', FORBIDDEN.has(op.item) ? `the item ${JSON.stringify(op.item)} is not a name this store keeps` : 'item must be a non-empty string');
  if (kind === 'set') return typeof op.value === 'boolean' && op.member === undefined && op.field === undefined ? null : no('bad-value', 'a set key takes value true / false');
  if (kind === 'value') return op.value !== undefined && op.member === undefined && op.field === undefined ? null : no('bad-value', 'a value key takes value (null deletes)');
  if (kind === 'member') {
    if (typeof op.value !== 'boolean') return no('bad-value', 'a member key takes value true / false');
    if (op.member !== undefined && badName(op.member)) return no('not-a-name', FORBIDDEN.has(op.member) ? `the member ${JSON.stringify(op.member)} is not a name this store keeps` : 'member must be a non-empty string');
    return op.field === undefined ? null : no('bad-value', 'a member key takes no field');
  }
  if (typeof op.field !== 'string' || !op.field || op.field.length > 200 || FORBIDDEN.has(op.field)) return no('not-a-name', FORBIDDEN.has(op.field) ? `the field ${JSON.stringify(op.field)} is not a name this store keeps` : 'a field key names its field: a non-empty string');
  return op.value !== undefined && op.member === undefined ? null : no('bad-value', 'a field key takes value (null deletes the field)');
}
const opProblem = (op) => { const r = opRefusal(op); return r ? r.error : null; };
/** a batch's ops → a short digest (FNV-1a 32 over their JSON): a batch id names ONE act — the same id with other ops is refused */
function digestOf(ops) {
  // FNV-1a over the ops' JSON, fed AS JSON.stringify WOULD WRITE IT, without building it (round 11, MUST 2's cheap cut: the route
  // stringified a request's ops a second time just to hash them) — the same digest, byte for byte: a string with nothing to escape
  // is fed as itself between quotes, anything else through JSON.stringify (a value is at most MAX_VALUE_CHARS). No closure over
  // the hash: a captured variable in this loop ran it 4× slower
  if (!Array.isArray(ops)) return fnvFeed(0x811c9dc5, String(JSON.stringify(ops))).toString(36);
  let h = fnvFeed(0x811c9dc5, '[');
  for (let k = 0; k < ops.length; k++) {
    if (k) h = fnvFeed(h, ',');
    const op = ops[k];
    if (!isObj(op)) { const t = JSON.stringify(op); h = fnvFeed(h, t === undefined ? 'null' : t); continue; }
    h = fnvFeed(h, '{');
    let first = true;
    for (const name of Object.keys(op)) {
      const v = op[name];
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;   // (JSON.stringify leaves them out)
      if (!first) h = fnvFeed(h, ',');
      first = false;
      h = fnvString(h, name);
      h = fnvFeed(h, ':');
      h = typeof v === 'string' ? fnvString(h, v) : fnvFeed(h, JSON.stringify(v));
    }
    h = fnvFeed(h, '}');
  }
  return fnvFeed(h, ']').toString(36);
}
/** a string as JSON.stringify writes it, fed to FNV in ONE pass — itself between quotes; a character JSON.stringify would escape (a
 *  quote, a backslash, a control character, any surrogate) sends the whole string through JSON.stringify instead */
function fnvString(h, v) {
  let x = Math.imul(h ^ 34, 0x01000193) >>> 0;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 32 || c === 34 || c === 92 || (c >= 0xd800 && c < 0xe000)) return fnvFeed(h, JSON.stringify(v));
    x ^= c; x = Math.imul(x, 0x01000193) >>> 0;
  }
  return Math.imul(x ^ 34, 0x01000193) >>> 0;
}
/** FNV-1a 32 over a string's UTF-16 units, from h (a plain function: a hot loop over a captured variable ran 3× slower) */
function fnvFeed(h, t) { h |= 0; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193); return h >>> 0; }   // (int32 inside the loop — the same bits as uint32 FNV-1a; round 12: a uint32 per character boxed every step)
const VALUE_BASE = 8;   // (a value sits at most 4 levels into the state — key, item, field — so each line of it is indented 8 more in the file)
/** a string's length as JSON.stringify writes it (quotes, its escapes: \" \\ \n …, \u00XX, a lone surrogate's \uDXXX) */
const NEEDS_ESCAPE = /["\\\u0000-\u001f\ud800-\udfff]/;   // (round 12: one native scan — the loop below only for a string that has one: half the time)
function jsonStringLen(t) {
  if (t.length > 24 && !NEEDS_ESCAPE.test(t)) return t.length + 2;   // (a short string — an object's key — is quicker read than asked)
  let n = t.length + 2;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) n += 1;
    else if (c < 32) n += 5;
    else if (c >= 0xd800 && c < 0xdc00) { const d = t.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) i++; else n += 5; }
    else if (c >= 0xdc00 && c < 0xe000) n += 5;
  }
  return n;
}
const intLen = (a) => (a < 10 ? 1 : a < 100 ? 2 : a < 1e3 ? 3 : a < 1e4 ? 4 : a < 1e5 ? 5 : a < 1e6 ? 6 : a < 1e7 ? 7 : a < 1e8 ? 8 : a < 1e9 ? 9 : String(a).length);
const numLen = (c) => (!Number.isFinite(c) ? 4 : Number.isInteger(c) && c > -1e9 && c < 1e9 ? intLen(Math.abs(c)) + (c < 0 ? 1 : 0) : String(c).length);   // (round 12: a conversion per number was most of the walk)
const leafLen = (c) => (typeof c === 'string' ? jsonStringLen(c) : typeof c === 'number' ? numLen(c) : typeof c === 'boolean' ? (c ? 4 : 5) : 4);
/** ONE walk of a value, without recursion (round 11, MUST 2): 'too-deep' past MAX_VALUE_DEPTH levels, 'too-large-value' past
 *  MAX_VALUE_CHARS of what the FILE holds (round 12, exactly: JSON.stringify(value, null, 2) plus VALUE_BASE spaces a line — round 11
 *  counted a leaf as 7, and a depth-32 value written indented held the hub 1.8 s), else null — it stops at the first bound it passes,
 *  so it costs at most the bound (round 10 walked a 24 M-element array whole, twice: 16 s on the hub's thread) */
function valueBound(v) { const r = valueSize(v); return typeof r === 'string' ? r : null; }
/** valueBound's walk, returning what the file will hold (a number) or the bound it passed (a code) — one walk serves both */
let lastFlat = 0;   // (the compact JSON length of the value valueSize last measured — an import's section is held to bytes as read)
function valueSize(v) {
  lastFlat = 0;
  if (v === null || typeof v !== 'object') { if (typeof v === 'string' && v.length + 2 > MAX_VALUE_CHARS) return 'too-large-value'; const n0 = leafLen(v); lastFlat = n0; return n0 > MAX_VALUE_CHARS ? 'too-large-value' : n0; }
  const st = { size: 0, flat: 0 };
  const code = sizeOf(v, 1, st);
  lastFlat = st.flat;
  return code || st.size;
}
/** one container at level d (the value itself d = 1), RECURSIVE — the depth bound keeps it shallow (round 12: explicit stacks allocated
 *  per container): its brackets; with n children, n + 1 line breaks (each a newline and VALUE_BASE spaces), each child line indented
 *  2·d, n − 1 commas, its closing bracket indented 2·(d − 1); `flat` the same without the whitespace */
function sizeOf(x, d, st) {
  if (d > MAX_VALUE_DEPTH) return 'too-deep';
  let size = st.size + 2, flat = st.flat + 2, n = 0;   // (round 12: the counts kept in locals, handed down and back only around a child container)
  const indent = 2 * d;
  if (Array.isArray(x)) {
    for (let i = 0; i < x.length; i++) {
      const c = x[i];
      if (n++) { size++; flat++; }
      size += indent;
      if (c !== null && typeof c === 'object') { st.size = size; st.flat = flat; const e = sizeOf(c, d + 1, st); if (e) return e; size = st.size; flat = st.flat; } else { const L = leafLen(c); size += L; flat += L; }
      if (size > MAX_VALUE_CHARS) { st.size = size; return 'too-large-value'; }
    }
  } else {
    const ks = Object.keys(x);   // (own enumerable names, in JSON.stringify's order — an indexed loop: round 12, for…in was half the walk)
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], c = x[k];
      const K = jsonStringLen(k) + (n++ ? 1 : 0);
      size += indent + K + 2; flat += K + 1;
      if (c !== null && typeof c === 'object') { st.size = size; st.flat = flat; const e = sizeOf(c, d + 1, st); if (e) return e; size = st.size; flat = st.flat; } else { const L = leafLen(c); size += L; flat += L; }
      if (size > MAX_VALUE_CHARS) { st.size = size; return 'too-large-value'; }
    }
  }
  if (n) size += (n + 1) * (1 + VALUE_BASE) + 2 * (d - 1);
  st.size = size; st.flat = flat;
  return size > MAX_VALUE_CHARS ? 'too-large-value' : null;
}
/** a batch id '<page>:<seq>' → {page, seq} | null */
function parseBatch(id) {
  const m = typeof id === 'string' ? BATCH_RE.exec(id) : null;
  return m ? { page: m[1], seq: Number(m[2]) } : null;
}

/** the ops that turn view `before` into view `after` — per item, per member, per field (only what changed); `copy` = false for a
 *  reader that only reads the ops (the route's moveFacts — round 10: a 48 MiB write copied both keys whole); a page's ops are copies */
/** what left a list and what came into it (a set key, a group's members), each in its list's order — round 13: the common head and tail
 *  are skipped position by position, and a few changed items are looked up in the other list (an old page's whole key of 270 000
 *  archived ids with one more cost two Sets of the whole key — ×2 master's write); round 14: a wide change builds Sets of the changed
 *  middles only (an old tab's 20 000 new ids on a 12 MiB key: ×2.2 master's write) */
function listDiff(bl, al, gone, came) {
  const nb = bl.length, na = al.length;
  let i = 0;
  while (i < nb && i < na && bl[i] === al[i]) i++;
  let jb = nb, ja = na;
  while (jb > i && ja > i && bl[jb - 1] === al[ja - 1]) { jb--; ja--; }
  if (jb - i + ja - i <= 8) {
    for (let k = i; k < jb; k++) if (!al.includes(bl[k])) gone(bl[k]);
    for (let k = i; k < ja; k++) if (!bl.includes(al[k])) came(al[k]);
    return;
  }
  // a wide change (round 14): Sets of the two MIDDLES only — the head and the tail are the same in both lists (two Sets of the whole key
  // were most of an old tab's 20 000-item write on a 12 MiB key: diffOps 200 ms, the write ×2.2 master's); an item one middle lacks is
  // looked for ONCE in the head and tail (a list may hold an item twice — archivedFolders, a group's members — and then it is not gone)
  // (a middle that is empty needs no Set: a select-all onto an empty key, 840 000 new ids, built two for nothing)
  const bm = bl.slice(i, jb), am = al.slice(i, ja);
  const as = bm.length && am.length ? new Set(am) : null, bs = bm.length && am.length ? new Set(bm) : null;
  const g = as ? bm.filter((x) => !as.has(x)) : bm, c = bs ? am.filter((x) => !bs.has(x)) : am;
  if (!g.length && !c.length) return;
  let kept = null;
  if (i > 0 || jb < nb) {
    const gc = new Set(g);
    for (const x of c) gc.add(x);
    kept = new Set();
    for (let k = 0; k < i; k++) if (gc.has(bl[k])) kept.add(bl[k]);
    for (let k = jb; k < nb; k++) if (gc.has(bl[k])) kept.add(bl[k]);
  }
  for (const x of g) if (!kept || !kept.has(x)) gone(x);
  for (const x of c) if (!kept || !kept.has(x)) came(x);
}
function diffOps(before, after, keys = KEYS, copy = true) {
  const b = viewOf(before, keys, copy), a = viewOf(after, keys, copy), ops = [];
  for (const key of keys) {
    const kind = kindOf(key);
    if (!kind) continue;
    if (kind === 'set') {
      listDiff(b[key], a[key], (x) => ops.push({ key, item: x, value: false }), (x) => ops.push({ key, item: x, value: true }));
      continue;
    }
    const bm = b[key], am = a[key];
    for (const item of Object.keys(bm)) {
      if (own(am, item)) continue;
      if (kind === 'value') ops.push({ key, item, value: null });
      else if (kind === 'member') ops.push({ key, item, value: false });
      else for (const fname of Object.keys(isObj(bm[item]) ? bm[item] : {})) ops.push({ key, item, field: fname, value: null });
    }
    for (const item of Object.keys(am)) {
      const was = own(bm, item) ? bm[item] : undefined;
      if (kind === 'value') { if (was === undefined || !same(was, am[item])) ops.push({ key, item, value: am[item] }); continue; }
      if (kind === 'member') {
        const bl = Array.isArray(was) ? was : [], al = Array.isArray(am[item]) ? am[item] : [];
        if (was === undefined) ops.push({ key, item, value: true });
        listDiff(bl, al, (m) => ops.push({ key, item, member: m, value: false }), (m) => ops.push({ key, item, member: m, value: true }));
        continue;
      }
      const bf = isObj(was) ? was : {}, af = isObj(am[item]) ? am[item] : {};
      for (const fname of Object.keys(bf)) if (!own(af, fname)) ops.push({ key, item, field: fname, value: null });
      for (const fname of Object.keys(af)) if (!own(bf, fname) || !same(bf[fname], af[fname])) ops.push({ key, item, field: fname, value: af[fname] });
    }
  }
  return ops;
}

/** an ordered list with O(1) membership: in / out keep the first position, a re-add after an out goes to the end */
function ordered(list) {
  const at = new Map();
  const order = [];
  for (const x of Array.isArray(list) ? list : []) if (!at.has(x)) { at.set(x, order.length); order.push(x); }
  return {
    add(x) { if (at.has(x)) return; at.set(x, order.length); order.push(x); },
    del(x) { const i = at.get(x); if (i === undefined) return; at.delete(x); order[i] = undefined; },
    has: (x) => at.has(x),
    get size() { return at.size; },
    list: () => order.filter((x) => x !== undefined && at.has(x)),
  };
}
/** `state` with the ops applied in order — a new object (only the touched keys are copied); `state` is never changed.
 *  LINEAR in the ops and the lists (round 2, smaller 4: the first build re-scanned a list per op — 100 000 ops held a loop 11 s) */
function applyOps(state, ops) {
  const out = isObj(state) ? { ...state } : {};
  const sets = new Map(), maps = new Map(), lists = new Map();
  const setOf = (key) => { if (!sets.has(key)) sets.set(key, ordered(out[key])); return sets.get(key); };
  const mapOf = (key) => { if (!maps.has(key)) maps.set(key, isObj(out[key]) ? { ...out[key] } : {}); return maps.get(key); };
  const cfgs = new Map();   // (round 10: a config copied once per item per call — 20 000 fields on one conversation were 20 000 copies)
  const cfgOf = (key, item, cur) => { const k = key + '\u0000' + item; let c = cfgs.get(k); if (!c) { const obj = isObj(cur[item]) ? { ...cur[item] } : {}; c = { obj, n: Object.keys(obj).length }; cfgs.set(k, c); } return c; };
  const listOf = (key, item, cur) => { const k = key + '\u0000' + item; if (!lists.has(k)) lists.set(k, { key, item, o: ordered(Array.isArray(cur[item]) ? cur[item] : []) }); return lists.get(k).o; };
  for (const op of Array.isArray(ops) ? ops : []) {
    if (opProblem(op)) continue;
    const kind = kindOf(op.key);
    if (kind === 'set') { const s = setOf(op.key); if (op.value) s.add(op.item); else s.del(op.item); continue; }
    const cur = mapOf(op.key);
    if (kind === 'value') { if (op.value === null) delete cur[op.item]; else cur[op.item] = op.value; continue; }
    if (kind === 'member') {
      const lk = op.key + '\u0000' + op.item;
      if (op.member === undefined) {
        if (!op.value) { delete cur[op.item]; lists.delete(lk); } else if (!Array.isArray(cur[op.item])) { cur[op.item] = []; lists.delete(lk); }
        continue;
      }
      if (!op.value && !own(cur, op.item) && !lists.has(lk)) continue;   // a member out of a group that does not exist: nothing
      const l = listOf(op.key, op.item, cur);
      if (op.value) l.add(op.member); else l.del(op.member);
      if (!own(cur, op.item)) cur[op.item] = [];   // a member added makes its group exist (filled from the list below)
      continue;
    }
    const c = cfgOf(op.key, op.item, cur), obj = c.obj;
    if (op.value === null) { if (own(obj, op.field)) { delete obj[op.field]; c.n--; } } else { if (!own(obj, op.field)) c.n++; obj[op.field] = op.value; }
    if (c.n) cur[op.item] = obj; else delete cur[op.item];   // (an emptied config goes; a field set again makes it anew, at the end — as before)
  }
  for (const [key, s] of sets) out[key] = s.list();
  for (const { key, item, o } of lists.values()) { const cur = mapOf(key); if (own(cur, item)) cur[item] = o.list(); }
  for (const [key, m] of maps) out[key] = m;
  return out;
}

/**
 * THE FACTS (round 7, 主开发: «an act is dropped only if someone else changed the item after the act was made; the later act
 * wins, as on master») — one per SLOT (an item; a member of a group; a field of a config; a group itself) that a write changed
 * in the last MAX_ACT_AGE_MS: {t: the ACT's time — the server's estimate, now − age, never ahead of now (round 8: «the first to
 * land stands» after an outage was the stamp at apply); now for a whole-key writer —, page + counter: the act that did (null
 * for a whole-key writer — an old page, desktop-app-prefs, the server's own archive / rename), prev: other pages' acts on it}.
 * An op of page P, act counter c, made `age` ms before its send (the device's wall clock; the monotonic one where the wall
 * clock was set back) is judged at the server's `now` (the hub's clock, high-water — never behind a stamp it gave):
 *   no fact                                  ⇒ applied
 *   the slot last changed by P                ⇒ applied when c is above that act's counter (P's own next act), else held
 *   P is in the fact's prev (an act of P it   ⇒ superseded when c is not above it (a copy of P's act, long in transit — its
 *   overrode, or one that lost to it)            age, short by that time, must not make it look later; ≤ PREV_MAX pages)
 *   another writer's fact                     ⇒ applied when the act was made at or after that act (now − age ≥ t), else
 *                                                dropped (superseded by a later act — the page shows the server's value)
 * An act older than MAX_ACT_AGE_MS is not applied at all — unless the server holds it already (held). A fact whose time is
 * ahead of `now` is read as now — never a lock-out. A late group delete removes only the members no later act decided. A
 * batch id names one act: an id some slot was decided by, arriving with an op no slot of it saw, is refused by name.
 */
const SEP = '\t';
const KEY_TAG = { starredSessions: 's', archivedSessions: 'a', archivedFolders: 'f', customNames: 'n', sessionModes: 'm', sessionConfigs: 'c', sessionGroups: 'g', groupFolders: 'd' };
const TAG_KEY = Object.fromEntries(Object.entries(KEY_TAG).map(([k, v]) => [v, k]));
/** a WHOLE KEY decided at once by a person's import (round 10, MUST 3): '<tag>\t*' — an op on any item of that key made before it is
 *  superseded (the import replaced the key whole: what it did not hold, it decided too) */
/** a name inside a slot: its LENGTH, then itself (round 12) — no name spells another slot, and no name is scanned (round 11 escaped '\\'
 *  and the tab with two regex replaces at every slotOf: 4 096-tab names cost 17× master) */
const SLOT_NAME_INLINE = 128;
/** a long name's 64-bit digest, ONE pass, two FNV-1a lanes (two offset bases — one prime, so their low bits are coupled: about 57
 *  effective bits, the panel's measure; a false positive per act at 100 000 digests ~7e-13) — `lanes` leaves them in LA / LB (no string made: a
 *  whole-key record digests every slot it changed — round 14) */
let LA = 0, LB = 0;
function lanes(v) { let a = 0x811c9dc5 | 0, b = 0x84222325 | 0; for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x01000193); } LA = a >>> 0; LB = b >>> 0; }
const laneOf = () => [LA, LB];   // (the last digest's lanes — the suites' pin of slotLanes)
function nameDigest(v) { lanes(v); return LA.toString(16).padStart(8, '0') + LB.toString(16).padStart(8, '0'); }
/** lanes(slotOf(op)) / lanes(tombSlotOf(key, item)) — the slot's characters fed in order, no slot string built (round 14: a whole-key
 *  record digests every slot it changed — 840 000 slot strings were most of its cost); pinned equal over random ops */
let FA = 0, FB = 0;
const feed = (v) => { let a = FA, b = FB; for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x01000193); } FA = a; FB = b; };
const feedNm = (x) => { const v = typeof x === 'string' ? x : String(x); feed(String(v.length)); if (v.length <= SLOT_NAME_INLINE) { feed(':'); feed(v); } else { feed('#'); feed(nameDigest(v)); feed(':'); } };
function slotLanes(op, tomb = false) {
  FA = 0x811c9dc5 | 0; FB = 0x84222325 | 0;
  feed(KEY_TAG[op.key]); feed(SEP); feedNm(op.item);
  const kind = kindOf(op.key);
  if (tomb) { feed(SEP); feed('-'); } else if (kind === 'member') { feed(SEP); if (op.member !== undefined) feedNm(op.member); } else if (kind === 'field') { feed(SEP); feed('.'); feedNm(op.field); }
  LA = FA >>> 0; LB = FB >>> 0;
}
const nm = (x) => { const v = typeof x === 'string' ? x : String(x); return v.length <= SLOT_NAME_INLINE ? v.length + ':' + v : v.length + '#' + nameDigest(v) + ':'; };
// (round 12: a name past SLOT_NAME_INLINE characters is spelled by its LENGTH and a 64-bit digest — '#' where an inline name has ':'
// — so the facts never write a long name twice (12 MiB of 4 096-tab names through an old tab's whole key: 152 ms against master's 62);
// two different names that long sharing a length and a digest would share a fact — no product writer makes a name that long)
const keySlotOf = (key) => KEY_TAG[key] + SEP;   // the key itself: no name follows (every name slot has its length after the separator)
/** round 14 (主开发: «an act is taken back only for a reason about ITS OWN item»): a whole-key write past MAX_WHOLE_MOVES changed items
 *  is ONE record a key — '<tag>\t*' (no name slot starts with '*': each starts with its length) — holding the 64-bit digest of every
 *  slot it changed, in RUNS, one a write ({t: its time, set: the digests}, newest first; a digest lives in its newest run only). It
 *  reads as the fact moveFacts would have written for each of those slots ({t, page: null, prev: the slot's older fact's}) and for no
 *  other: an act on an item the write never touched applies (round 13 wrote ONE key-wide fact, which took back every earlier act on
 *  the key, silently). On disk: '<t base 36>=<16 hex a slot>…[;<t>=…]' */
const keySetSlotOf = (key) => KEY_TAG[key] + SEP + '*';
/** a set of 64-bit digests (two 32-bit lanes) in ONE typed open-addressing table, sized for `most` (never more is put) — a run of
 *  840 000 digests as a Set of strings cost ~1 s and its garbage */
function digestSet(most) {
  let cap = 16;
  while (cap < 2 * most + 2) cap *= 2;
  const hi = new Uint32Array(cap), lo = new Uint32Array(cap), used = new Uint8Array(cap), mask = cap - 1;
  const at = (a, b) => { let i = (Math.imul(a, 0x9e3779b1) ^ b) & mask; while (used[i] && (hi[i] !== a || lo[i] !== b)) i = (i + 1) & mask; return i; };
  const set = {
    n: 0,
    has: (a, b) => used[at(a, b)] === 1,
    put(a, b) { const i = at(a, b); if (!used[i]) { used[i] = 1; hi[i] = a; lo[i] = b; set.n++; } },   // (not «add»: test-user-todos-layout's census reads any two-argument add call as an inbox filing)
    each(fn) { for (let i = 0; i < cap; i++) if (used[i]) fn(hi[i], lo[i]); },
  };
  return set;
}
/** a slot's fact as the judge reads it: its own, or the one a later whole-key record gives it (round 14) */
function factAt(facts, slot) {
  const f = facts.get(slot) || null;
  const r = slot.length > 2 ? facts.get(slot.slice(0, 2) + '*') : null;
  if (!r || !r.runs) return f;
  lanes(slot);
  for (const run of r.runs) if (run.set.has(LA, LB)) return f && f.t >= run.t ? f : { t: run.t, page: null, counter: 0, digest: null, prev: f ? addPrev(f.prev, f.page, f.counter, null, f.digest) : [] };
  return f;
}
/** a key's record with a new run (`ds`: the lanes of the slots this write changed, [a, b, a, b, …], at `now`) — an older run keeps only
 *  the digests the new one does not hold, and goes once it is empty or older than MAX_ACT_AGE_MS (no act that old is applied) */
function withRun(rec, now, ds) {
  const fresh = digestSet(ds.length / 2);
  for (let i = 0; i < ds.length; i += 2) fresh.put(ds[i], ds[i + 1]);
  const runs = [{ t: now, set: fresh }];
  for (const run of (rec && rec.runs) || []) {
    if (now - run.t > MAX_ACT_AGE_MS) continue;
    let left = 0;
    run.set.each((a, b) => { if (!fresh.has(a, b)) left++; });
    if (!left) continue;
    let set = run.set;
    if (left < run.set.n) { set = digestSet(left); run.set.each((a, b) => { if (!fresh.has(a, b)) set.put(a, b); }); }
    runs.push({ t: run.t, set });
  }
  return { t: now, page: null, counter: 0, digest: null, prev: [], runs };
}
const HEX = Uint8Array.from('0123456789abcdef', (c) => c.charCodeAt(0));
/** a run's digests as text — 16 hex a digest, written into one byte buffer (a string a digest cost a third of the write) */
function runText(set) {
  const u = new Uint8Array(set.n * 16);
  let p = 0;
  set.each((a, b) => { for (let s = 28; s >= 0; s -= 4) u[p++] = HEX[(a >>> s) & 15]; for (let s = 28; s >= 0; s -= 4) u[p++] = HEX[(b >>> s) & 15]; });
  return new TextDecoder().decode(u);
}
const runsOut = (f) => f.runs.map((run) => run.t.toString(36) + '=' + runText(run.set)).join(';');
const nib = (c) => (c <= 57 ? c - 48 : c - 87);   // ('0'–'9', 'a'–'f': the reader checked them)
function runsIn(v) {
  if (typeof v !== 'string' || !v) return null;
  const runs = [];
  for (const part of v.split(';')) {
    const i = part.indexOf('='), t36 = i > 0 ? part.slice(0, i) : '', body = part.slice(i + 1);
    if (!/^[0-9a-z]{1,12}$/.test(t36) || body.length % 16 || !/^[0-9a-f]*$/.test(body)) return null;
    const set = digestSet(body.length / 16);
    for (let j = 0; j < body.length; j += 16) {
      let a = 0, b = 0;
      for (let q = 0; q < 8; q++) a = (a << 4) | nib(body.charCodeAt(j + q));
      for (let q = 8; q < 16; q++) b = (b << 4) | nib(body.charCodeAt(j + q));
      set.put(a >>> 0, b >>> 0);
    }
    if (set.n) runs.push({ t: parseInt(t36, 36), set });
  }
  runs.sort((a, b) => b.t - a.t);
  return runs.length ? { t: runs[0].t, page: null, counter: 0, digest: null, prev: [], runs } : null;
}
/** a group's TOMBSTONE (round 12): the group taken whole — deleted — by an act at its time; a member act made before it does not land
 *  (one fact for the group, not one a member: a one-op delete of 400 000 members cost 2.6 s) */
const tombSlotOf = (key, item) => KEY_TAG[key] + SEP + nm(item) + SEP + '-';
/** the slot an op decides: '<tag>\t<item>[\t<member> | \t.<field> | \t]' — each name spelled by nm() (its length, then itself or its
 *  digest); a member slot with no name after its separator is the group itself (round 12) */
const slotCache = new WeakMap();   // (a slot is built ONCE per op object: a long name is concatenated and hashed once, not at every call)
const slotOf = (op, keep = true) => {
  let s = slotCache.get(op);
  if (s !== undefined) return s;
  const base = KEY_TAG[op.key] + SEP + nm(op.item), kind = kindOf(op.key);
  s = kind === 'member' ? (op.member === undefined ? base + SEP : base + SEP + nm(op.member))   // (the group itself: no name after it)
    : kind === 'field' ? base + SEP + '.' + nm(op.field) : base;
  if (keep && op && typeof op === 'object') slotCache.set(op, s);   // (keep = false: an op the write's own diff made, read once — round 12: a WeakMap entry each cost the GC)
  return s;
};
/** a fact remembers up to PREV_MAX other pages' acts on its slot (the acts it overrode, the acts that lost to it): a copy of one,
 *  long in transit, is held */
const PREV_MAX = 4;
const SLOT_MAX = 2 * ITEM_MAX + 32;   // (the reader's bound IS the writer's — an item and a member of ITEM_MAX, each with its length)
/** the longest fact the route writes — '<t36 ≤ 12>:<page ≤ 64>:<counter ≤ 15>!.<digest ≤ 7>' and PREV_MAX × ':<page ≤ 64>:<counter
 *  ≤ 15>.<digest ≤ 7>' is 458 characters; the reader takes up to this ONE bound (round 10: the writer wrote 425 against a reader's 400) */
const FACT_MAX = 480;
/** prev + (page, counter): that page's highest counter first, the owner never in it, at most PREV_MAX */
function addPrev(prev, page, counter, owner, digest = null) {
  // each entry [page, counter, digest]: that page's highest counter with ITS act's digest (round 10: a reused id is caught by it too)
  let top = page ? [page, counter, digest || null] : null;
  for (const e of prev || []) if (top && e[0] === page && e[1] > top[1]) top = e;
  const out = top ? [top] : [];
  for (const e of prev || []) if (e[0] !== page && out.length < PREV_MAX) out.push(e);
  return out.filter((e) => e[0] !== owner);
}
/** a fact on disk: '<t base 36>:<page>:<counter>[!][.<digest>][:<page>:<counter>]…' (the owner — `!` its value omitted since by a
 *  writer that carries no facts, `.digest` its act's ops —, then its prev) */
const factOut = (f) => { if (f.runs) return runsOut(f); let s = f.t.toString(36) + ':' + (f.page || '') + ':' + (f.counter || 0) + (f.omitted ? '!' : '') + (f.digest ? '.' + f.digest : ''); const pv = f.prev; if (pv) for (let i = 0; i < pv.length; i++) { const e = pv[i]; s += ':' + e[0] + ':' + e[1] + (e[2] ? '.' + e[2] : ''); } return s; };   // (round 12: concatenated — the array, spread and join were a fact's cost)
function factIn(v) {
  const parts = typeof v === 'string' && v.length <= FACT_MAX ? v.split(':') : null;
  if (!parts || parts.length < 3 || parts.length % 2 === 0 || !/^[0-9a-z]{1,12}$/.test(parts[0])) return null;
  const id = (x) => /^[A-Za-z0-9_-]{0,64}$/.test(x);
  const own3 = /^([0-9]{1,16})(!)?(?:\.([0-9a-z]{1,8}))?$/.exec(parts[2]);
  const t = parseInt(parts[0], 36), counter = own3 ? Number(own3[1]) : NaN;
  if (!id(parts[1]) || !Number.isSafeInteger(t) || !Number.isSafeInteger(counter)) return null;
  const prev = [];
  for (let k = 3; k < parts.length; k += 2) { const m = /^([0-9]{1,16})(?:\.([0-9a-z]{1,8}))?$/.exec(parts[k + 1]); const c = m ? Number(m[1]) : NaN; if (!id(parts[k]) || !Number.isSafeInteger(c)) return null; if (parts[k] && prev.length < PREV_MAX) prev.push([parts[k], c, m[2] || null]); }
  return { t, page: parts[1] || null, counter, prev, omitted: !!own3[2], digest: own3[3] || null };
}
/** the route's facts (round 8: a write ENCODES only the slots it changed — round 13, corrected: it still JOINS every kept fact's text,
 *  O(facts): a one-op write at 2 541 facts 1.2 ms, at 100 001 31 ms, at 360 001 103 ms with a 30 MiB file; only their 7-day age
 *  bounds them): loaded once from whatever the file holds (a fact it cannot
 *  read is dropped — never a throw); `draft()` = an OVERLAY to judge and move against (reads fall through to the store, nothing
 *  copied); `commit(draft)` once the write is on disk — only the slots it changed; `text()` = the facts' part of the file, each
 *  slot's fragment kept from its last change (the same bytes JSON.stringify(…, null, 2) writes); a fact older than
 *  MAX_ACT_AGE_MS is dropped at a write by `sweep`, at most once an hour (never on the read path); `owns(page, counter)` = an
 *  act some slot was decided by (a batch id taken before) */
function factStore() {
  const m = new Map(), frag = new Map(), owners = new Map();
  let swept = -Infinity, encoded = 0;   // (encoded: facts turned to text — a write's cost, counted for the pin)
  const enc = (k, f) => { encoded++; return JSON.stringify(k) + ':"' + factOut(f) + '"'; };   // (round 12: compact, as user-state.json is now)   // (a fact's text has nothing JSON escapes: base 36, page ids, digits, ':', '!', '.')
  const ownOne = (page, counter, digest, d) => { const k = page + ':' + counter, o = owners.get(k) || { n: 0, digest: '' }; o.n += d; if (d > 0 && digest) o.digest = digest; if (o.n > 0) owners.set(k, o); else owners.delete(k); };
  const owner = (f, d) => { if (!f) return; if (f.page) ownOne(f.page, f.counter, f.digest, d); for (const e of f.prev || []) ownOne(e[0], e[1], e[2], d); };
  const put = (k, f, x) => { owner(m.get(k), -1); if (f) { m.set(k, f); frag.set(k, x || enc(k, f)); owner(f, 1); } else { m.delete(k); frag.delete(k); } };   // (x: its text, made by text(draft) — round 14: every changed fact was encoded twice, a whole-key record of 840 000 digests too)
  return {
    load(obj) { m.clear(); frag.clear(); owners.clear(); if (!isObj(obj)) return; for (const k in obj) { if (!own(obj, k) || typeof k !== 'string' || k.length > SLOT_MAX) continue; const f = k.length === 3 && k[2] === '*' ? runsIn(obj[k]) : factIn(obj[k]); if (f) put(k, f); } },   // (round 14: a key's whole-key record, '<tag>\t*')
    get: (slot) => m.get(slot) || null,
    /** the digest of the act some slot was decided by — '' when its fact predates digests; null: no slot names that act */
    digestOf: (page, counter) => { const o = owners.get(page + ':' + counter); return o ? o.digest : null; },
    draft() {
      const over = new Map(), mine = new Map();   // (mine: the acts this draft's facts name — kept as it goes, never walked)
      return {
        changes: over,
        get: (k) => (over.has(k) ? over.get(k) : m.get(k)),
        set(k, v) { over.set(k, v); if (v && v.page) mine.set(v.page + ':' + v.counter, v.digest || ''); return this; },
        digestOf: (page, counter) => { const k = page + ':' + counter; if (mine.has(k)) return mine.get(k); const o = owners.get(k); return o ? o.digest : null; },
      };
    },
    /** a fact older than the bound marked gone in `draft` — at most once an hour, at a write */
    sweep(draft, now) {
      if (now - swept < 3600000) return;
      swept = now;
      for (const [k, f] of m) {
        if (draft.changes.has(k)) continue;
        if (now - Math.min(f.t, now) > MAX_ACT_AGE_MS) draft.changes.set(k, null);
        else if (f.runs && f.runs.some((run) => now - run.t > MAX_ACT_AGE_MS)) draft.changes.set(k, { ...f, runs: f.runs.filter((run) => now - run.t <= MAX_ACT_AGE_MS) });   // (a record's runs past the bound go too)
      }
    },
    commit(draft) { for (const [k, f] of draft.changes) { const e = draft.texts && draft.texts.get(k); put(k, f, e && e[0] === f ? e[1] : null); } draft.changes.clear(); draft.texts = null; },
    /** the facts' part of the file with `draft`'s changes laid over the store's — '{\n    "slot": "fact",…\n  }' */
    text(draft) {
      const parts = [];
      for (const [k, x] of frag) if (!draft || !draft.changes.has(k)) parts.push(x);
      if (draft) for (const [k, f] of draft.changes) if (f) { const x = enc(k, f); (draft.texts || (draft.texts = new Map())).set(k, [f, x]); parts.push(x); }
      return '{' + parts.join(',') + '}';
    },
    get size() { return m.size; },
    get encoded() { return encoded; },
  };
}
/** the digest of the act some slot's fact was decided by ('' unknown, null none) — the store's own index, or a plain Map's facts
 *  walked (the pure tests) */
const actDigest = (facts, page, counter) => {
  if (facts && typeof facts.digestOf === 'function') return facts.digestOf(page, counter);
  for (const f of facts.values()) { if (f && f.page === page && f.counter === counter) return f.digest || ''; for (const e of (f && f.prev) || []) if (e[0] === page && e[1] === counter) return e[2] || ''; }
  return null;
};
/** a request's batches → {page, list: [{id, seq, age, ops, problem}]} | {error} — ONE page's batches, in ascending order (a page's
 *  request is its unconfirmed batches oldest first); a batch with a bad op, no op, or past its bounds is REFUSED by name on
 *  its own (the request's other batches still apply) */
function parseRequest(batches) {
  const bad = (error, code = 'malformed') => ({ error, code });
  if (!Array.isArray(batches) || !batches.length) return bad('batches must be a non-empty list of {batch, age, ops}');
  let page = null, last = 0, total = 0, values = 0;
  const list = [];
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    if (!isObj(b)) return bad(`batch ${i}: not an object`);
    const id = parseBatch(b.batch);
    if (!id) return bad(`batch ${i}: its id must be '<page>:<seq>'`);
    if (page !== null && id.page !== page) return bad(`batch ${i}: one request carries ONE page's batches (${page}, then ${id.page})`);
    if (id.seq <= last) return bad(`batch ${i}: the batches of a request go oldest first (${last}, then ${id.seq})`);
    if (b.age !== undefined && !(Number.isFinite(b.age))) return bad(`batch ${i}: age is the ms since the act (a number)`);
    const vss = Array.isArray(b.ops) ? b.ops.map((op) => (isObj(op) ? valueSize(op.value) : 0)) : [];   // (ONE walk a value: the depth here, the size below, the request's values)
    const vbs = vss.map((x) => (typeof x === 'string' ? x : null));
    for (let k = 0; k < vbs.length; k++) if (vbs[k] === 'too-deep') return bad(`batch ${i} op ${k}: a value nested deeper than ${MAX_VALUE_DEPTH} levels`, 'too-deep');
    page = id.page; last = id.seq;
    const ops = b.ops;
    let problem = null, code = null;
    if (!Array.isArray(ops) || !ops.length) { problem = 'a batch carries a non-empty list of ops'; code = 'no-ops'; }
    else if (ops.length > MAX_OPS_PER_BATCH) { problem = `${ops.length} ops in one batch — the bound is ${MAX_OPS_PER_BATCH} (a page splits a larger act into parts)`; code = 'too-many-ops'; }
    else for (let k = 0; k < ops.length && !problem; k++) { const why = opRefusal(ops[k], vbs[k]); if (why) { problem = `op ${k}: ${why.error}`; code = why.code; } }
    list.push({ id: b.batch, seq: id.seq, age: Math.max(0, Number(b.age) || 0), ops: problem ? [] : ops, problem, code, digest: problem ? null : digestOf(ops) });
    total += problem ? 0 : ops.length;   // (a batch refused on its own counts nothing: it is refused by name, the others judged)
    if (!problem) for (const x of vss) if (typeof x === 'number') values += x;
    if (values > MAX_REQUEST_VALUE_CHARS) return bad(`the request carries more than ${MAX_REQUEST_VALUE_CHARS} characters of values — a page sends the oldest that fit, the rest at their answer`, 'too-large-values');
    if (total > MAX_OPS_PER_REQUEST) return bad(`the request carries more than ${MAX_OPS_PER_REQUEST} ops in all — a page sends the oldest that fit, the rest at their answer`, 'too-many-ops');
  }
  return { page, list };
}
/** ONE op against the facts (the table above) → 'apply' | 'held' | 'superseded' */
function judgeOp(f, page, counter, madeAt, now) {
  if (!f) return 'apply';
  if (f.page && f.page === page) return counter > f.counter || (f.omitted && counter === f.counter) ? 'apply' : 'held';   // (round 9: its own act, re-sent over a factless writer's OMISSION, applies again)
  if (f.prev && f.prev.some((e) => e[0] === page && counter <= e[1])) return 'superseded';   // a copy of an act another writer's beat (prev): not on disk — never «held»
  return madeAt >= Math.min(f.t, now) ? 'apply' : 'superseded';   // (a tie: the later arrival wins, as on master)
}
/** a request's batches against the facts (a draft), in the body's order → { verdicts: [{id, verdict, problem}], ops: [the ops to
 *  apply], writers: Map(slot → {page, counter}) } — 'applied' (at least one op of it applied), 'held' (its own duplicate),
 *  'superseded' (every op of it overridden by a later act), 'old' (made more than MAX_ACT_AGE_MS ago), 'refused'. A batch's ops
 *  are judged against the facts as they stood BEFORE that batch (two ops of one act on one slot share its counter) */
function judgeRequest(facts, page, list, state, now) {
  const verdicts = [], ops = [], writers = new Map(), decided = new Set();
  // an op that LOST to a fact is remembered by it (prev): a later copy of it — longer in transit, so its age looks younger — is
  // superseded, never applied over the act that beat it
  const lost = (slot, seq, digest) => { const f = factAt(facts, slot); if (!f) return; facts.set(slot, { ...f, prev: addPrev(f.prev, page, seq, f.page, digest) }); decided.add(slot); };
  // ROUND 10, MUST 2(a): an old act the state holds EXACTLY — every slot it writes holds the value it writes — is confirmed, silently;
  // judged by its own slots, a set key's members read once per REQUEST (never per batch)
  const sets = new Map();
  const has = (key, item) => { if (!sets.has(key)) sets.set(key, new Set(state && Array.isArray(state[key]) ? state[key] : [])); return sets.get(key).has(item); };
  const members = new Map();   // (a group's members as a Set, built once per REQUEST — round 10: never a scan per op)
  const membersOf = (key, item, box) => { const k = key + '\t' + item; if (!members.has(k)) members.set(k, Array.isArray(box[item]) ? new Set(box[item]) : null); return members.get(k); };
  const holds = (op) => {
    const kind = kindOf(op.key), v = op.value;
    if (kind === 'set') return has(op.key, op.item) === !!v;
    const box = state && isObj(state[op.key]) ? state[op.key] : {};
    if (kind === 'value') return v === null ? !own(box, op.item) : own(box, op.item) && same(box[op.item], v);
    if (kind === 'member') { const g = membersOf(op.key, op.item, box); return op.member === undefined ? !!g === !!v : !!(g && g.has(op.member)) === !!v; }
    const cfg = isObj(box[op.item]) ? box[op.item] : {};
    return v === null ? !own(cfg, op.field) : own(cfg, op.field) && same(cfg[op.field], v);
  };
  // the groups as this request leaves them, kept as it goes (round 9: JUDGING a request costs its ops — never the ops so far re-applied
  // per group op): the state before it, then every op it took — an ORDERED SET per group, so a member op costs O(1) (round 10: the
  // group re-applied per member op made 20 000 adds to one group 23 s); null = no such group. applyOps' own rules, op by op
  const groups = new Map();
  const groupNow = (op) => {
    const k = op.key + '\t' + op.item;
    if (!groups.has(k)) groups.set(k, state && isObj(state[op.key]) && Array.isArray(state[op.key][op.item]) ? ordered(state[op.key][op.item]) : null);
    return groups.get(k);
  };
  const take = (mine, op) => {
    mine.push(op);
    if (kindOf(op.key) !== 'member') return;
    const k = op.key + '\t' + op.item, g = groupNow(op);
    if (op.member === undefined) { groups.set(k, op.value ? g || ordered([]) : null); return; }   // the group itself: made (kept as it is) / deleted
    if (!op.value) { if (g) g.del(op.member); return; }   // a member out of a group that does not exist: nothing
    if (g) g.add(op.member); else groups.set(k, ordered([op.member]));   // a member added makes its group exist
  };
  for (const b of list) {
    if (b.problem) { verdicts.push({ id: b.id, verdict: 'refused', problem: b.problem, code: b.code || 'bad-value' }); continue; }
    if (b.age > MAX_ACT_AGE_MS) {
      // (round 12: a key an import replaced after the act was made decides it — superseded, never «held» by the act's own older fact)
      if (b.ops.some((op) => { const kf = facts.get(keySlotOf(op.key)); return kf && now - b.age < Math.min(kf.t, now); })) { verdicts.push({ id: b.id, verdict: 'superseded', dropped: [] }); continue; }
      // an old batch is judged by its OWN slots (round 9): held when its fact names it (its answer was lost), superseded when a later
      // act beat it (prev), else not applied — the page takes it back and says so only where what it shows changes
      if (b.ops.some((op) => judgeOp(factAt(facts, slotOf(op)), page, b.seq, 0, now) === 'held') || b.ops.every(holds)) { verdicts.push({ id: b.id, verdict: 'held', dropped: [] }); continue; }
      if (b.ops.some((op) => { const f = factAt(facts, slotOf(op)); return f && (f.prev || []).some((e) => e[0] === page && e[1] >= b.seq); })) { verdicts.push({ id: b.id, verdict: 'superseded', dropped: [] }); continue; }
      verdicts.push({ id: b.id, verdict: 'old', problem: `made ${Math.round(b.age / 86400000)} days ago — an act older than ${MAX_ACT_AGE_MS / 86400000} days is not applied`, code: 'old' });
      continue;
    }
    // a batch id names ONE act (round 9): the same id with OTHER ops (its digest) is refused by name — never a second act under it
    const was = actDigest(facts, page, b.seq);
    if (was && b.digest && was !== b.digest) { verdicts.push({ id: b.id, verdict: 'refused', problem: `batch ${b.id} was taken before with other ops — a batch id names one act`, code: 'reused-id' }); continue; }
    const madeAt = now - b.age, stamp = Math.floor(Math.min(madeAt, now));   // round 8: a fact's time is the ACT's time (the server's estimate of it)
    // round 12: a batch may not grow a group past MAX_GROUP_MEMBERS — refused on its own, by name, before any op of it is taken
    const grow = new Map();
    for (const op of b.ops) if (kindOf(op.key) === 'member' && op.member !== undefined && op.value) { const g = groupNow(op); if (!g || !g.has(op.member)) { const k2 = op.key + '\t' + op.item; grow.set(k2, (grow.get(k2) || (g ? g.size : 0)) + 1); } }
    if ([...grow.values()].some((n) => n > MAX_GROUP_MEMBERS)) { verdicts.push({ id: b.id, verdict: 'refused', problem: `batch ${b.id} grows a group past ${MAX_GROUP_MEMBERS} members`, code: 'too-large-group' }); continue; }
    let applied = 0, held = 0;
    const mine = [], dropped = [], losers = [];   // (a loser is remembered once the batch is judged: its ops share the facts before it)
    for (let k = 0; k < b.ops.length; k++) {
      const op = b.ops[k];
      const kind = kindOf(op.key);
      // a person's IMPORT replaced this key whole after the act was made: the act does not land over it (round 10, MUST 3)
      const kf = facts.get(keySlotOf(op.key));
      if (kf && madeAt < Math.min(kf.t, now)) { dropped.push(k); losers.push(keySlotOf(op.key)); continue; }
      if (kind === 'member' && op.member === undefined && !op.value) {
        // a GROUP DELETED, judged per slot: each member goes unless a later act decided it; the group itself goes unless a later act
        // of another writer changed it (then it stays, with what that act put in it)
        const v = judgeOp(factAt(facts, slotOf(op)), page, b.seq, madeAt, now);
        if (v === 'held') { held++; dropped.push(k); continue; }
        const nowG = groupNow(op);
        const cur = nowG ? nowG.list() : [];
        const keep = cur.filter((mb) => judgeOp(factAt(facts, slotOf({ key: op.key, item: op.item, member: mb, value: false })), page, b.seq, madeAt, now) !== 'apply');   // decided later (by anyone)
        const n0 = mine.length;
        // the group goes WHOLE when no later act kept a member of it and no later act changed the group (round 8: a member add of this
        // act to a group another writer deleted later is dropped already — it cannot leave the group standing, empty)
        if (!keep.length && v === 'apply') take(mine, op);
        else { const kept = new Set(keep); for (const mb of cur) { if (!kept.has(mb)) take(mine, { key: op.key, item: op.item, member: mb, value: false }); } }
        if (v === 'superseded') losers.push(slotOf(op));
        if (mine.length > n0) applied++; else dropped.push(k);
        continue;
      }
      let v = judgeOp(factAt(facts, slotOf(op)), page, b.seq, madeAt, now), judged = slotOf(op);
      // a member act made before its group was taken whole (deleted) by a later act does not land (round 12: the tombstone)
      if (v === 'apply' && kind === 'member' && op.member !== undefined) {
        const ts = tombSlotOf(op.key, op.item), tf = factAt(facts, ts);
        if (tf) { const tv = judgeOp(tf, page, b.seq, madeAt, now); if (tv !== 'apply') { v = tv; judged = ts; } }
      }
      // a member ADDED to a group another writer DELETED after the act was made: the later delete wins (the add would bring it back)
      if (v === 'apply' && kind === 'member' && op.member !== undefined && op.value && !groupNow(op)) {
        const gs = slotOf({ key: op.key, item: op.item, value: false }), gv = judgeOp(factAt(facts, gs), page, b.seq, madeAt, now);
        if (gv !== 'apply') { v = gv; judged = gs; }
      }
      if (v === 'apply') { take(mine, op); applied++; } else { if (v === 'held') held++; dropped.push(k); }
      if (v === 'superseded') losers.push(judged);
    }
    for (const sl of losers) lost(sl, b.seq, b.digest);
    // the batch's applied ops DECIDE their slots — the facts move now (also where the value was already so: the later act decided
    // it), so the request's later batches, and every later request, are judged against them
    for (const op of mine) {
      const slot = slotOf(op), old = factAt(facts, slot) || null;
      ops.push(op); writers.set(slot, { page, counter: b.seq, t: stamp, digest: b.digest }); decided.add(slot);
      facts.set(slot, { t: stamp, page, counter: b.seq, digest: b.digest, prev: old ? addPrev(old.prev, old.page, old.counter, page, old.digest) : [] });
    }
    verdicts.push({ id: b.id, verdict: applied ? 'applied' : held ? 'held' : 'superseded', dropped: applied ? dropped : [] });   // (an applied batch names its ops not applied)
  }
  return { verdicts, ops, writers, decided, facts };
}
/** the facts after a write (the ONE place every writer moves them): every slot whose value changed from `before` to `after` and no
 *  op of this write already decided (`decided`) gets {t: the act's time (`writers` / `fallback` carry it; now for a whole-key
 *  writer), `fallback` (the request's page and last act — a group made by a member added; null for a whole-key writer: an old
 *  page, desktop-app-prefs, a restore, the server's own archive / rename), prev: the act it superseded}. Only the keys the write
 *  replaced are diffed (applyOps and a merge copy only those) — the diff costs the keys a write changed (its facts' TEXT still joins
 *  every kept fact: factStore) */
function moveFacts(facts, before, after, now, decided = new Set(), fallback = null, writers = new Map(), omits = false, wholeKeys = null, maxMoves = Infinity) {
  const move = (slot, removal) => {
    if (decided.has(slot)) return;
    const w = writers.get(slot) || fallback;
    // round 9: OMISSION BY A WRITER THAT CARRIES NO FACTS IS NOT AN ACT (a stale tab's whole key, a restore): its removal leaves the
    // slot's fact standing, marked — the act it removed, re-sent, applies over it; a writer's SET is a fact like any
    // (round 10, MUST 3: only a writer that OMITS — a page older than the ops door sending its whole key — leaves its removals unmade;
    // a person's import, a restore, the server's own helpers are ACTS at their time: what they remove is decided then)
    // (round 14: the slot's OWN fact — a whole-key record names no page whose act could be re-sent over it: nothing to mark)
    if (!w && removal && omits) { const own = facts.get(slot); if (own && !own.omitted) facts.set(slot, { ...own, omitted: true }); return; }
    const old = factAt(facts, slot) || null;
    facts.set(slot, { t: Math.floor(w && Number.isFinite(w.t) ? Math.min(w.t, now) : now), page: w ? w.page : null, counter: w ? w.counter : 0, digest: w && w.digest ? w.digest : null, prev: old ? addPrev(old.prev, old.page, old.counter, w ? w.page : null, old.digest) : [] });
  };
  // round 11, MUST 2: a key an import decides WHOLE carries ONE fact (the key-wide one) — its slots none (that fact already decides each
  // at its time); round 10 moved a fact per changed slot — a 1 M-id import, or an old page's whole key, wrote a million facts (4.5 s)
  const whole = new Set((wholeKeys || []).filter((k) => KEY_TAG[k]));
  const keys = KEYS.filter((k) => (before || {})[k] !== (after || {})[k] && !whole.has(k));
  const moves = diffOps(before, after, keys, false);
  for (const k of whole) facts.set(keySlotOf(k), { t: now, page: null, counter: 0, digest: null, prev: [] });   // (an import: the key decided whole, now)
  // round 14 (主开发: «an act is taken back only for a reason about ITS OWN item»): THE OMISSION RULE FIRST, AT EVERY SIZE — a stale
  // whole key's removals are no acts (round 13 counted them first: a stale key omitting 20 001 items became a key-wide act)
  let acts = moves;
  if (omits && moves.length > maxMoves) {
    acts = [];
    for (const op of moves) {
      if (op.value === false || op.value === null) { const slot = slotOf(op, false); if (!(writers.get(slot) || fallback)) { move(slot, true); continue; } }
      acts.push(op);
    }
  }
  // round 13: past `maxMoves` changed items (an older page's whole key — master's road: never refused) no fact a slot — ONE RECORD a
  // key, at the write's time, holding the digests of the slots it changed (round 14: it takes back an earlier act on one of THOSE only;
  // round 13's one key-wide fact took back every earlier act on the key). Only the whole-key doors pass maxMoves: no page, no writer
  if (acts.length > maxMoves) {
    const byKey = new Map();
    const push = (key) => { let ds = byKey.get(key); if (!ds) byKey.set(key, (ds = [])); ds.push(LA, LB); };
    for (const op of acts) {
      slotLanes(op); push(op.key);
      if (kindOf(op.key) === 'member' && op.member === undefined && !op.value) { slotLanes(op, true); push(op.key); }   // (a group gone by an act: its tombstone)
    }
    for (const [key, ds] of byKey) facts.set(keySetSlotOf(key), withRun(facts.get(keySetSlotOf(key)), now, ds));
    return facts;
  }
  for (const op of acts) {
    const slot = slotOf(op, false);
    move(slot, op.value === false || op.value === null);
    // a group gone BY AN ACT takes its members with it as ONE fact — its tombstone (round 12: a fact a member cost the group's size, 2.6 s
    // at 400 000): a member act made before it does not land, even in a group made again since; an omission writes none (no act)
    if (kindOf(op.key) === 'member' && op.member === undefined && !op.value) {
      const w = writers.get(slot) || fallback;
      if (w || !omits) facts.set(tombSlotOf(op.key, op.item), { t: Math.floor(w && Number.isFinite(w.t) ? Math.min(w.t, now) : now), page: w ? w.page : null, counter: w ? w.counter : 0, digest: w && w.digest ? w.digest : null, prev: [] });
    }
  }
  return facts;
}
/** whether applyOps changed anything — it copies only the keys it touched, so only those are compared */
function changedKeys(before, after) {
  const out = [];
  for (const k of Object.keys(after || {})) if ((before || {})[k] !== after[k] && !sameKey((before || {})[k], after[k])) out.push(k);
  return out;
}
/** two values of ONE key the same as their JSON would say — compared entry by entry, in order (round 11: a write of 48 MiB of names
 *  stringified both whole keys, 77 ms) */
function sameKey(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
  if (isObj(a) && isObj(b)) { const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i] || !same(a[ka[i]], b[ka[i]])) return false; return true; }
  return same(a, b);
}

/**
 * THE PAGE'S SIDE — base + pending (DOM-free; the page injects its doors).
 *   send(body, {signal}) → Promise<{ok: true, rev, epoch, refused?, old?: [{batch, error}]} | {ok: false, refused?, status?, error?}>
 *                          (a throw = not reached)
 *   setTimer(fn, ms) / clearTimer(t); now() — the device's WALL clock; onView(view) — the shown state changed
 *   say(kind, info) — 'refused' {code} (a refusal: the act is taken back) | 'old' {count} (the 7-day rule took back what the page
 *            showed) | 'not-taken' {} (the ops door has answered 404 for NOT_TAKEN_WAIT_MS — once a streak) | 'taken' {} (its acts
 *            landed since: the words taken back) — the ONLY words (round 9); refetch() —
 *            ask for the server's state
 *   pageId — THIS PAGE's batch prefix, made per page LOAD in memory (a reload, a duplicated tab and a page restored from the
 *            back-forward cache are each simply a page — their ids can never collide)
 *   initial — what the page shows before any server state (its localStorage display copy): NOT a base — the first server
 *             state replaces it whatever its rev, and it never travels (only the person's ops do)
 * Every act is its own batch (an act past MAX_OPS_PER_BATCH / MAX_BATCH_BYTES = its parts) and is handed to the network AT THE
 * ACT — also before the first GET — in a request that carries every batch of this page no answer has confirmed, oldest first, up
 * to MAX_BODY_BYTES (12 MiB; the rest at the next answer), each with its AGE (the wall clock between the act and this send). An
 * answer confirms every batch its request carried — applied, held (its own duplicate) or superseded (a later act decided it:
 * the base shows the server's value, nothing said) — and names a refused one and one too old to apply (undone, said). An act
 * leaves the overlay only in ACT ORDER (the confirmed PREFIX). A request with no answer in SEND_TIMEOUT_MS, or a 5xx, a 404, a
 * network error, is LATE: still listened to, carried by the next act or by ONE paced re-send at a time — and NOTHING is said
 * about it (round 9: the page speaks only when it takes something back — a refusal, the 7-day rule). A reconnect sends one
 * request at once; 401 / 403 waits for the next answered state (signing in is the app's, as on master); a state of
 * ANOTHER life is taken whatever its counter unless it is a late one from a life the hub has left, and every unconfirmed batch
 * goes again; an answer from another life confirms nothing (the page asks for the state, then sends again).
 */
function createSync({ send, setTimer = setTimeout, clearTimer = clearTimeout, onView = () => {}, say = () => {}, refetch = () => {}, now = () => Date.now(), mono = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance.now() : Date.now()), pageId, retryMs = RETRY_MS, timeoutMs = SEND_TIMEOUT_MS, maxOps = MAX_OPS_PER_BATCH, maxBytes = MAX_BATCH_BYTES, maxRequestBytes = MAX_BODY_BYTES, maxRequestOps = MAX_OPS_PER_REQUEST, maxRequestValueChars = MAX_REQUEST_VALUE_CHARS, probesMax = PROBES_MAX, notTakenMs = NOT_TAKEN_WAIT_MS, inFlightMax = IN_FLIGHT_MAX, initial = null } = {}) {
  if (typeof send !== 'function') throw new Error('createSync: send is required');
  const page = typeof pageId === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(pageId) ? pageId : 'pg' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
  let base = viewOf(initial || {}), baseRev = 0, baseEpoch = null, hasBase = false;
  let seq = 0, acts = 0;   // (acts: each record() is one act — its parts share its number)
  // ROUND 7, C1: this page speaks OPS only — to the ops door, whatever answers; a refused door is a failure like any other («not saved
  // yet», the act kept and retried within the bounds), never a turn to whole keys
  // pending: the acts no applied server state holds yet, IN ACT ORDER — each {op, id (its batch), at (the device's wall clock at
  // the act — the age a send carries is now − at), bytes, rev / epoch (the answer that confirmed it; null = not confirmed)}
  let pending = [];
  // round 13: base + pending applied ONCE until either changes (a page's act asked for it four or five times — 5 000 acts made offline
  // spent half their time copying the whole state); view() is still a COPY (a page that edits its view in place never edits the base),
  // peek() the shared one, read only
  let applied = null;
  const appliedNow = () => { if (!applied || applied.base !== base || applied.pending !== pending || applied.len !== pending.length) applied = { base, pending, len: pending.length, st: applyOps(base, pending.map((p) => p.op)) }; return applied.st; };
  const view = () => viewOf(appliedNow());
  /** what this page will not send (round 13: read BEFORE any road carries an act — the ops door's bounds, and a group grown past
   *  MAX_GROUP_MEMBERS by what the page shows) → {byOp: [code|null], codes: [distinct codes]} | null */
  const refusals = (ops) => {
    const byOp = ops.map((op) => { const r = opRefusal(op); return r ? r.code : null; });
    const adds = new Map();
    ops.forEach((op, k) => { if (!byOp[k] && kindOf(op.key) === 'member' && op.member !== undefined && op.value === true) { const g = op.key + '\t' + op.item; if (!adds.has(g)) adds.set(g, { key: op.key, item: op.item, ks: [], m: new Set() }); adds.get(g).ks.push(k); adds.get(g).m.add(op.member); } });
    if (adds.size) {
      const v = view();
      for (const a of adds.values()) {
        const cur = Array.isArray((v[a.key] || {})[a.item]) ? v[a.key][a.item] : [];
        const have = new Set(cur); let n = cur.length;
        for (const m of a.m) if (!have.has(m)) n++;
        if (n > MAX_GROUP_MEMBERS) for (const k of a.ks) byOp[k] = 'too-large-group';
      }
    }
    const codes = [...new Set(byOp.filter(Boolean))];
    return codes.length ? { byOp, codes } : null;
  };   // a COPY: a page that edits its view in place never edits the base
  // an act leaves the overlay only with every act before it: the longest confirmed PREFIX (in this base's life, at or below it)
  const settle = () => {
    let n = 0;
    while (n < pending.length && pending[n].rev != null && pending[n].epoch === baseEpoch && pending[n].rev <= baseRev) n++;
    if (n) pending = pending.slice(n);
  };
  // the view door is told WHY (round 10, MUST 1): 'answer' — the page repaints its rows in this very task (an answer, a refusal, the
  // 7-day rule, a superseded act, a later state taking an act back); an act and a state are painted by their callers
  const shown = (why) => { try { onView(view(), why || null); } catch { } };
  /** the batches no answer has confirmed, oldest first: [{batch, ops, bytes}] */
  const unconfirmed = () => {
    const out = [], at = new Map();
    for (const p of pending) {
      if (p.rev != null || p.oldAt != null) continue;   // (an act the hub called too old waits for the state that takes it back — never re-sent)
      let b = at.get(p.id);
      if (!b) { b = { batch: p.id, at: p.at, atM: p.atM, act: p.act, ops: [], bytes: 48 + p.id.length, vchars: 0 }; at.set(p.id, b); out.push(b); }   // {"batch":"…","age":…,"ops":[…]},
      b.ops.push(p.op); b.bytes += p.bytes; b.vchars += p.vchars || 0;
    }
    return out;
  };

  // THE REQUESTS IN FLIGHT: token → {ids (the batches it carries), late}
  const reqs = new Map();
  let token = 0, authWait = false, probe = null, probeTimer = null, streak = 0, probesLeft = probesMax, notFoundSince = null, notTakenSaid = false;
  // an answer from ANOTHER server life than the page's base (the hub restarted or was restored while it was on its way, or the page
  // has not heard the new life yet): it confirms nothing — the page asks which life is now (refetch) and, once that state is
  // applied, sends again what is unconfirmed (a duplicate where it landed; applied after a restore). Never a loop: one ask, one send
  let lifeCheck = false, lifeCooling = false;
  // ROUND 11, MUST 1(b): while an act waits for a server state (one the hub called too old for a state this page has not shown yet;
  // one another writer beat, answered for a later state) the page ASKS for it — at once, then paced like the probes, at most
  // probesMax in a row; a state the page takes starts the count again (round 10 asked ONCE: a hung or failed GET left the act shown)
  // round 12: ONE ask in flight (the next waits for it to settle, then its pace); each ask is given up after a time that lengthens
  // with the pace (15 s, 30 s, 1 min, 2 min — a hub slower than 15 s still answers one), by this engine's own timer and an
  // AbortController handed to the page (no AbortSignal.timeout needed); past probesMax in a row it still asks, every 5 minutes, as long
  // as an act waits
  let askTimer = null, askSlow = false, askInFlight = false, asksLeft = probesMax, askStep = 0;
  const waiting = () => pending.some((p) => p.oldAt != null || (p.beatAt != null && !(p.epoch === baseEpoch && p.beatAt <= baseRev)));
  const ask = () => {
    if (askTimer || askInFlight || !waiting()) return;
    const slow = asksLeft <= 0;
    if (!slow) asksLeft--;
    const giveUpMs = Math.min(ASK_GIVE_UP_MAX_MS, ASK_GIVE_UP_MS * 2 ** Math.min(askStep, 3));
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let done = false, giveUp = null;
    const next = () => {
      if (done) return;
      done = true; askInFlight = false;
      try { clearTimer(giveUp); } catch { }
      if (!waiting() || askTimer) return;
      askSlow = slow;
      askTimer = setTimer(() => { askTimer = null; askSlow = false; ask(); }, slow ? ASK_SLOW_MS : retryMs[Math.min(askStep++, retryMs.length - 1)]);
    };
    askInFlight = true;
    giveUp = setTimer(() => { try { if (ctl) ctl.abort(); } catch { } next(); }, giveUpMs);
    let r = null;
    try { r = refetch({ paced: true, signal: ctl ? ctl.signal : undefined }); } catch { r = null; }
    if (r && typeof r.then === 'function') r.then(next, next); else next();
  };
  /** a new deferral: the count starts again, and a slow or paced wait gives way to an ask now (one in flight still) */
  const askAgain = () => { asksLeft = probesMax; askStep = 0; if (askTimer && !askInFlight) { try { clearTimer(askTimer); } catch { } askTimer = null; askSlow = false; } ask(); };
  /** a state taken: the count starts again — a SLOW wait gives way to an ask now; a paced one keeps its time (no burst on broadcasts) */
  const askReset = () => { asksLeft = probesMax; askStep = 0; if (askTimer && askSlow && !askInFlight) { try { clearTimer(askTimer); } catch { } askTimer = null; askSlow = false; } };
  /** the 7-day sentence, said only where what the page shows changed because the acts were taken back (after the rows show it) */
  /** the batches among `gone` whose slots now show something else than `before` showed */
  const shownChanged = (before, gone) => {
    const changed = new Set(diffOps(before, view(), [...new Set(gone.map((p) => p.op.key))]).map(slotOf));
    return new Set(gone.filter((p) => changed.has(slotOf(p.op))).map((p) => p.id));
  };
  const sayOld = (before, gone) => { const n = shownChanged(before, gone).size; if (n) say('old', { count: n }); };
  // ROUND 9 — THE PAGE SPEAKS ONLY WHEN IT TAKES SOMETHING BACK ON THE SCREEN (a refusal, by its code; the 7-day rule): an act is
  // shown at once and re-sent while the page stays open — no word about waiting, none about arriving (every false word of eight
  // rounds came from that pair); a 401 / 403 waits for the next answered state, as master's page does (its app sends a signed-out
  // person to sign in)
  const carried = (id, lateToo) => { for (const q of reqs.values()) if (q.ids.has(id) && (lateToo || !q.late)) return true; return false; };
  /** ONE request: every batch no answer has confirmed, oldest first, up to the request bound (at least one) — or null when
   *  it would carry nothing that a request still in time does not carry already */
  function issue(kind) {
    // (no wait for the first GET: an op needs no base — the base only matters to what the page SHOWS)
    if (authWait) return null;   // a 401 / 403 waits for the next answered GET
    const all = unconfirmed();
    if (!all.length) return null;
    // round 13: a request that is not an act's (an answer's next window, a state's echo, a probe) starts at the oldest batch NO request in
    // time carries — round 12 re-sent the batch in flight at every echo and every answer (a select-all of 20 000: 18 requests, not 4) —
    // and while a request in time carries the OLDEST, an echo sends nothing: that request's answer sends the next window, so a backlog
    // past one request goes one window at a time, in order
    const newest = all[all.length - 1].act;   // (read here, never in a closure: round 12's arrow over `all` kept every request's snapshot of the backlog alive)
    if (kind !== 'act' && kind !== 'reconnect' && kind !== 'probe' && carried(all[0].batch, false)) return null;
    const pool = kind === 'act' || kind === 'reconnect' ? all : all.filter((b) => !carried(b.batch, false));
    if (!pool.length) return null;
    const batches = [];
    let bytes = 1024;   // {"batches":[…]} and room
    const t = now(), tm = mono();
    // the age: the device's WALL clock (a page timer stops while a laptop sleeps — a sleeper's act would look fresh), or the
    // monotonic one where the wall clock was set back between the act and this send (round 8); never negative
    let nOps = 0;
    const wire = (b) => ({ batch: b.batch, age: Math.max(0, Math.floor(Math.max(t - b.at, tm - b.atM))), ops: b.ops, _bytes: b.bytes, _act: b.act });
    let nVals = 0;
    for (const b of pool) { if (batches.length && (bytes + b.bytes > maxRequestBytes || nOps + b.ops.length > maxRequestOps || nVals + b.vchars > maxRequestValueChars)) break; nOps += b.ops.length; bytes += b.bytes; nVals += b.vchars; batches.push(wire(b)); }
    // round 12 (5 000 ops a request): an ACT is on the wire at the act (round 4) even when the backlog before it is past one request —
    // the oldest-first window would leave it out (a select-all of 5 000 in flight, then a star, the tab reloaded: the star lost), so the
    // request is then the NEWEST window that fits, ending at it: the older batches ride their own requests (in time), and a newer act
    // landing first leaves an older copy of the same slot «held» — never applied over it. An act is on the wire when ANY part of it is:
    // one act's own parts go oldest first (a select-all of 20 000: four requests, in order)
    if (kind === 'act' && !batches.some((x) => x._act === newest)) {
      batches.length = 0; bytes = 1024; nOps = 0; nVals = 0;
      for (let k = all.length - 1; k >= 0; k--) { const b = all[k]; if (batches.length && (bytes + b.bytes > maxRequestBytes || nOps + b.ops.length > maxRequestOps || nVals + b.vchars > maxRequestValueChars)) break; nOps += b.ops.length; bytes += b.bytes; nVals += b.vchars; batches.unshift(wire(b)); }
    }
    for (const x of batches) { delete x._bytes; delete x._act; }
    if (kind === 'act' && batches.every((b) => carried(b.batch, false))) return null;   // the oldest part of a backlog past the bound is out and in time
    const tk = ++token, q = { ids: new Set(batches.map((b) => b.batch)), late: false, kind, timer: null };
    reqs.set(tk, q);
    // round 14: a request now out carries the window a paced re-send was armed for (a 503, then an echo re-sent it at once) — the pace
    // goes: else it fired beside this request's NEXT window, two backlog windows in flight. This request's answer sends what is left,
    // its failure arms the pace again
    if (probeTimer) { try { clearTimer(probeTimer); } catch { } probeTimer = null; }
    // smaller 2 (round 6): the requests listened to are bounded by count — the oldest goes first (its batches ride every later
    // request: each carries every batch not yet confirmed)
    while (reqs.size > inFlightMax) { const [t0, q0] = reqs.entries().next().value; try { clearTimer(q0.timer); } catch { } reqs.delete(t0); if (probe === t0) probe = null; }
    q.timer = setTimer(() => { if (reqs.get(tk) === q && !q.late) lateness(tk, { error: `no answer in ${Math.round(timeoutMs / 1000)} s` }, false); }, timeoutMs);
    let answer;
    try { answer = Promise.resolve(send({ batches }, {})); } catch (e) { answer = Promise.reject(e); }
    answer.then((r) => r || { ok: false, error: 'no answer' }, (e) => ({ ok: false, error: (e && e.message) || String(e) })).then((r) => answered(tk, q, r));
    return tk;
  }
  function answered(tk, q, r) {
    if (reqs.get(tk) !== q) return;
    try { clearTimer(q.timer); } catch { }
    if (r.ok && hasBase && typeof r.epoch === 'string' && r.epoch !== baseEpoch) {
      reqs.delete(tk);
      if (probe === tk) probe = null;
      if (!lifeCheck && !lifeCooling) {
        lifeCheck = true; lifeCooling = true;
        setTimer(() => { lifeCooling = false; }, timeoutMs);   // one ask a send bound (a hub whose clock went back cannot make it a loop)
        try { refetch(); } catch { }
      }
      return;
    }
    if (r.ok && Number.isFinite(Number(r.rev))) {
      reqs.delete(tk);
      notFoundSince = null;   // (the ops door took them: a 404 streak is over — its words, if said, are taken back below, after the rows)
      // applied / held (its own duplicate) / superseded (a later act decided it: the page shows the server's value, nothing said)
      // are all CONFIRMED; refused and too old are undone and said
      const named = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => x && q.ids.has(x.batch) && pending.some((p) => p.id === x.batch)).map((x) => [x.batch, x.code || null]));   // (a batch another answer already settled says nothing again)
      const refused = named(r.refused), old = named(r.old);
      // the 7-day rule is SAID only where what this page shows changes because of it (round 9: one neutral sentence, true whether the
      // act was never applied or was applied once and beaten since)
      const shownBefore = old.size || refused.size ? view() : null, oldOps = old.size ? pending.filter((p) => old.has(p.id)) : [];
      const refusedOps = refused.size ? pending.filter((p) => refused.has(p.id)) : [];
      // ROUND 10, MUST 2(b): «this page now shows the server's» must be true — an answer that speaks for a state NEWER than this page's
      // base takes nothing back yet: the page asks for that state, and takes those acts back (saying so where what it shows changes)
      // once it shows it — never its own older base under the server's name
      // (round 11, MUST 1(a): a page that has no state yet has a base older than any answer — it defers too, and takes back at its first)
      const newer = old.size > 0 && (!hasBase || ((typeof r.epoch !== 'string' || r.epoch === baseEpoch) && Number(r.rev) > baseRev));
      if (newer) for (const p of pending) if (old.has(p.id)) p.oldAt = Number(r.rev);
      if (refused.size || (old.size && !newer)) pending = pending.filter((p) => !refused.has(p.id) && (newer || !old.has(p.id)));
      for (const p of pending) if (p.rev == null && q.ids.has(p.id)) { p.rev = Number(r.rev); p.epoch = typeof r.epoch === 'string' ? r.epoch : baseEpoch; }
      // a request still out whose every batch is now confirmed is done with (its answer, should it come, changes nothing)
      const open = new Set(unconfirmed().map((b) => b.batch));
      for (const [t2, q2] of reqs) if ([...q2.ids].every((id) => !open.has(id))) { try { clearTimer(q2.timer); } catch { } reqs.delete(t2); if (probe === t2) probe = null; }
      if (probe === tk) { probe = null; streak = 0; }
      probesLeft = probesMax;
      settle(); shown('answer');   // MUST 1: the rows show what changed in this task — and only then a word
      if (notTakenSaid) { notTakenSaid = false; say('taken', {}); }   // (round 14 follow-up: «not saved yet» taken back — they landed)
      // a refusal is SAID only where what the page shows changed because of it (round 11, small 3 — as the 7-day rule): an act a later
      // act of this page on the same item masks is undone with nothing to see
      if (refused.size) { const ch = shownChanged(shownBefore, refusedOps); const said = new Set(); for (const [batch, code] of refused) if (ch.has(batch) && !said.has(code)) { said.add(code); say('refused', { batch, code }); } }   // (ONE sentence a reason an answer — round 12: two refused acts on one item said it twice; round 13: two reasons are two sentences)
      if (old.size && !newer) sayOld(shownBefore, oldOps);
      // …and an act a later one beat, answered for a state newer than this page's, waits for that state too: the screen follows the
      // server, socket or not (round 10) — and the page ASKS until it comes (round 11)
      const beat = new Set((Array.isArray(r.superseded) ? r.superseded : []).filter((id) => q.ids.has(id)));
      for (const p of pending) if (beat.has(p.id) && (!hasBase || Number(r.rev) > baseRev)) p.beatAt = Number(r.rev);
      if (newer || beat.size) askAgain();
      // the hub answers: a batch no request carries any more (one past the bound; one whose request failed) goes NOW
      if (unconfirmed().some((b) => !carried(b.batch, true))) issue('more');
      return;
    }
    if (r.refused) {   // the whole body refused (400 / 413 / 422): what it carried is undone and said
      reqs.delete(tk);
      if (!pending.some((p) => q.ids.has(p.id))) { if (probe === tk) probe = null; return; }   // (settled already: said once)
      const before = view(), goneOps = pending.filter((p) => q.ids.has(p.id));
      pending = pending.filter((p) => !q.ids.has(p.id));
      if (probe === tk) probe = null;
      shown('answer');   // (the rows first, then the word — round 10)
      if (shownChanged(before, goneOps).size) say('refused', { batch: [...q.ids][0], status: r.status, code: r.code || null });   // (where the screen changed — round 11)
      if (unconfirmed().some((b) => !carried(b.batch, true))) issue('more');   // (round 14: the hub answered — what no request carries goes now, as after any answer; the pace no longer waits beside a request)
      return;
    }
    lateness(tk, r, true);
  }
  /** a request is late (its bound) or failed (5xx / a network error / 401 / 403) */
  function lateness(tk, r, done) {
    const q = reqs.get(tk);
    if (!q) return;
    q.late = true;
    if (done) reqs.delete(tk);
    if (r && (r.status === 401 || r.status === 403)) {   // the page must sign in again: it waits for the next answered state
      authWait = true;
      if (probe === tk) probe = null;
      return;
    }
    if (authWait) { if (probe === tk) probe = null; return; }
    // round 14 follow-up: a 404 from the ops door is not a verdict for NOT_TAKEN_WAIT_MS (the minute of an update: a reloaded tab talks to
    // the old server until the restart, then every act lands) — the acts stay and go again, paced; a streak past it is SAID once, in words
    // that never ask for a reload (it would lose them), and taken back when they land (round 14 said «reload» at the first 404)
    if (r && r.status === 404) {
      if (notFoundSince == null) notFoundSince = mono();
      if (!notTakenSaid && mono() - notFoundSince >= notTakenMs) { notTakenSaid = true; say('not-taken', {}); }
    }
    if (probe === tk) { probe = null; pace(retryMs[Math.min(++streak, retryMs.length - 1)]); } else pace(retryMs[0]);
  }
  /** THE PACED RE-SEND — for the page that makes no later act: ONE probe in flight a page at a time, carrying everything */
  function pace(wait) {
    if (probe || probeTimer || authWait) return;
    if (probesLeft <= 0) return;   // smaller 2: bounded by count — the next act, a reconnect or a state starts them again
    probeTimer = setTimer(() => {
      probeTimer = null;
      if (probe || authWait) return;
      if (!unconfirmed().some((b) => !carried(b.batch, false))) return;   // every batch is in a request still in time
      probesLeft--;
      probe = issue('probe');
    }, wait);
  }
  /** what waited for the server (the first GET, a sign-in, another life): one request at once */
  const sendAll = () => { if (unconfirmed().some((b) => !carried(b.batch, true))) issue('server'); };
  return {
    get pageId() { return page; },
    /** the bounds its splitter keeps (round 11: the route refuses past the same numbers — pinned equal) */
    /** base + pending as they stand, NOT a copy — for a read only (the page's diff of its act) */
    peek() { return appliedNow(); },
    /** round 13: what this page will not send — read by the page BEFORE any other road carries a change (a harness's ws rename) */
    refuses(ops) { const no = refusals(Array.isArray(ops) ? ops : []); return no ? no.codes[0] : null; },
    get bounds() { return { maxRequestBytes, maxRequestOps, maxRequestValueChars, maxBytes, maxOps }; },
    /** a server state (the GET, a broadcast): taken as the base when newer IN ITS LIFE, or of another life, or naming no life (an
     *  older server: no order to keep — the overlay keeps this page's acts) (→ true); else false */
    apply(state) {
      const rev = revOf(state), ep = epochOf(state);
      const signedIn = authWait;   // a state answered: this page is signed in again — what waited for it goes, newer state or not
      if (signedIn) authWait = false;
      const asked = lifeCheck; lifeCheck = false;
      if (hasBase && ep && ep === baseEpoch && rev <= baseRev) { probesLeft = probesMax; if (signedIn || asked) sendAll(); return false; }
      if (hasBase && ep !== baseEpoch && pastLife(ep, rev, baseEpoch, baseRev)) { if (signedIn || asked) sendAll(); return false; }   // a late answer from a life the hub has left
      const newLife = !hasBase || ep !== baseEpoch;
      if (newLife) for (const p of pending) if (p.epoch !== ep) { p.rev = null; p.epoch = null; p.oldAt = null; p.beatAt = null; }   // another life: every unconfirmed act goes again (one called too old is judged again there)
      const shownBefore = view();
      base = viewOf(state); baseRev = rev; baseEpoch = ep; hasBase = true;
      probesLeft = probesMax;
      askReset();   // (a state taken: the ask's count starts again — round 12, pinned)
      // round 10, MUST 2(b): the acts the hub called too old for a state this page now shows are taken back NOW, against that state
      const ripe = pending.filter((p) => p.oldAt != null && p.oldAt <= baseRev);
      if (ripe.length) { pending = pending.filter((p) => !ripe.includes(p)); settle(); shown('answer'); sayOld(shownBefore, ripe); }
      settle(); shown();
      if (!waiting() && askTimer) { try { clearTimer(askTimer); } catch { } askTimer = null; } else ask();
      sendAll();
      return true;
    },
    /** ONE ACT (diffOps of the view before / after) — its own batch (its parts past the bounds), shown at once and HANDED TO
     *  THE NETWORK at once, in a request that carries every batch not yet confirmed */
    record(ops) {
      const all = Array.isArray(ops) ? ops : [];
      // (round 10: what the route would refuse — a value past its bound, nested too deep, a group grown past its bound (round 13) — is
      // refused HERE, alone, before any road carries it: it never rides with other acts; said once a reason, as THIS page's — round 13:
      // it never left, so it is never «the server refused»)
      const no = refusals(all);
      const list = no ? all.filter((op, k) => !no.byOp[k]) : all;
      if (no) { shown('answer'); for (const code of no.codes) say('refused', { code, local: true }); }
      if (!list.length) return;
      let id = null, n = 0, bytes = 0, vals = 0;
      const at = now(), atM = mono(), act = ++acts;   // the act's time on the device's wall clock + its monotonic one, its number (every part of one act shares them)
      for (const op of list) {
        const b = utf8Length(JSON.stringify(op)) + 1;
        const vs = valueSize(op.value), vc = typeof vs === 'number' ? vs : 0;
        // (round 12: a part also holds at most a request's VALUES — every part this page builds fits one request)
        if (!id || n >= maxOps || bytes + b > maxBytes || vals + vc > maxRequestValueChars) { id = `${page}:${++seq}`; n = 0; bytes = 0; vals = 0; }
        n++; bytes += b; vals += vc;
        pending.push({ op, id, at, atM, act, sent: null, bytes: b, vchars: vc, rev: null, epoch: null });
      }
      shown();
      probesLeft = probesMax;
      issue('act');
    },
    /** the connection is back: one request at once, carrying everything not yet confirmed */
    resend() {
      if (probeTimer) { try { clearTimer(probeTimer); } catch { } probeTimer = null; }
      probe = null; streak = 0; probesLeft = probesMax;
      issue('reconnect');
    },
    view,
    baseRev: () => baseRev,
    baseEpoch: () => baseEpoch,
    hasBase: () => hasBase,
    pending: () => pending.length,
    inFlight: () => reqs.size,
    unconfirmed: () => pending.map((p) => ({ ...p.op, batch: p.id })),
  };
}

module.exports = { lifeStart, pastLife, KEYS, SET_KEYS, VALUE_KEYS, MEMBER_KEYS, FIELD_KEYS, REV_KEY, EPOCH_KEY, FACTS_KEY, CLOCK_KEY, MAX_VALUE_DEPTH, SERVER_KEYS, WIRE_KEYS, MAX_OPS_PER_BATCH, MAX_OPS_PER_REQUEST, FACT_MAX, MAX_VALUE_CHARS, ITEM_MAX, SLOT_MAX, MAX_GROUP_MEMBERS, MAX_WHOLE_MOVES, MAX_REQUEST_VALUE_CHARS, digestOf, tombSlotOf, MAX_BODY_BYTES, MAX_BATCH_BYTES, MAX_ACT_AGE_MS, PREV_MAX, SEND_TIMEOUT_MS, RETRY_MS, PROBES_MAX, NOT_TAKEN_WAIT_MS, IN_FLIGHT_MAX, kindOf, revOf, epochOf, utf8Length, viewOf, personKeys, opProblem, parseBatch, diffOps, applyOps, changedKeys, slotOf, keySlotOf, factOut, factIn, factStore, parseRequest, judgeOp, judgeRequest, moveFacts, keySetSlotOf, factAt, slotLanes, lanes, laneOf, createSync };
