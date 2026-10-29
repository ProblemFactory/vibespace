/**
 * UserTodoManager — the GLOBAL user-facing TODO list.
 *
 * Items are things an AGENT decided need the USER (a decision, missing input,
 * something to review) — the opposite direction of the agent's own TodoWrite
 * list. Each item belongs to one session (the user's "task"/活儿); the taskbar
 * panel merges every session's open items into one inbox and lets the user
 * jump to the owning session to handle it.
 *
 * Writers:
 * - The AGENT files/(un)resolves items via `vibespace-ask` (per-session vsst_
 *   token → POST /api/agent/user-todo, scoped to its own session).
 * - The USER resolves/dismisses/reopens from the panel (cookie-authed route).
 * - SERVER producers (spend guard, login watch, pool, jobs, channels, browser)
 *   file with their own keys. Every writer NAMES ITSELF: `origin` (B-328d) is a
 *   closed set of producers (src/inbox-origin.js) the Notices area groups by,
 *   declared at the add() call (test-user-todos-layout ⑪ is the census).
 *
 * Follows the SessionStatusManager persistence pattern: memory + broadcast are
 * synchronous, disk (data/user-todos.json) is debounced + content-compared,
 * flushed on exit. Keys are sessionKeys (backend:backendSessionId, or
 * webui:<serverId> before the id exists — re-keyed once known).
 */

const fs = require('fs');
const path = require('path');
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const crypto = require('crypto');
const { normalizeOptions, REPLY_MAX } = require('./inbox-reply.js'); // PURE: the option-chip rule the route, the CLI and the panel share (design-user-inbox-reply D3a)
const { normalizeOrigin, AGENT_WORDS_ORIGINS, AGENT_FIELDS_ORIGINS, FIELDS_FILERS } = require('./inbox-origin.js'); // PURE: the closed set of PRODUCERS an item names (B-328d) — the Notices area groups by it; a filing that names none is REFUSED (r2)
const { legacyCopyFact } = require('./job-model.js'); // PURE: THE ONE LEGACY RUNG reads a ≤ .360 job copy's fact off its own template (lane job-notify-user r4)
const belt = require('./agent-output-belt.js'); // lane agent-output-sinks: the sink belt — a For-you item's text / detail never carries a credential in the clear
const { applyClear } = require('./record-clear.js'); // PURE: "Clear content…" (2026-09-28) — what a clear replaces; this store holds the door (clearItems)

/** lane lark-refresh-stall: the params a WORDS param may carry (each a string or a finite number) — more is refused by name. */
const NESTED_PARAMS_MAX = 8;
/** `{text:{key,params}, detail?:[{key,params}…], source?:{key}}` → the same,
 *  clamped, or null; a shape that is not that throws by name. Params are
 *  strings/numbers only (they are interpolated into a sentence, never HTML) —
 *  or WORDS, `{key}` (lane vault-key-row-compact: an i18n key the client says
 *  in its language before it fills the sentence — a verb's own words) — or an
 *  INSTANT, `{at}` (lane owner-press-attended: an epoch the client says in the
 *  VIEWER's zone; a time string the hub rendered is the hub's zone, unnamed) — or
 *  an INSTANT CLAUSE, `{at, key, gone?}` (r2: `key` filled with that clock while
 *  the instant is ahead, `gone` once it has passed — «the next is free now»). */
function normalizeI18n(x) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('i18n must be an object');
  // lane lark-refresh-stall: a WORDS param (`{key}`) may carry its own scalar params (a dead sign-in's cause names the stall's
  // length) — r2: at most NESTED_PARAMS_MAX, each a string or a finite number; any other shape is REFUSED by name (the
  // producer says it and files its words without them — never a sentence with a «{minutes}» left in it)
  const nestedParams = (p, what) => {
    if (p == null) return {};
    if (typeof p !== 'object' || Array.isArray(p)) throw new Error(`i18n.${what}.params must be an object of strings / numbers`);
    const ents = Object.entries(p);
    if (ents.length > NESTED_PARAMS_MAX) throw new Error(`i18n.${what}.params carries ${ents.length} params — at most ${NESTED_PARAMS_MAX}`);
    const o = {};
    for (const [k, v] of ents) {
      if (typeof v === 'string') o[k] = v.slice(0, 200);
      else if (typeof v === 'number' && Number.isFinite(v)) o[k] = v;
      else throw new Error(`i18n.${what}.params.${k} must be a string or a finite number (${Array.isArray(v) ? 'an array' : v === null ? 'null' : typeof v} refused)`);
    }
    return ents.length ? { params: o } : {};
  };
  const line = (l, what) => {
    if (!l || typeof l !== 'object' || typeof l.key !== 'string' || !l.key.trim()) throw new Error(`i18n.${what} needs a key`);
    const out = { key: l.key.slice(0, 400) };
    if (l.params != null) {
      if (typeof l.params !== 'object' || Array.isArray(l.params)) throw new Error(`i18n.${what}.params must be an object`);
      out.params = {};
      for (const [k, v] of Object.entries(l.params)) { if (typeof v === 'string') out.params[k] = v.slice(0, 600); else if (typeof v === 'number' && Number.isFinite(v)) out.params[k] = v; else if (v && typeof v === 'object' && !Array.isArray(v) && Number.isFinite(v.at) && v.at > 0 && typeof v.key === 'string' && v.key.trim()) out.params[k] = { at: v.at, key: v.key.slice(0, 400), ...(typeof v.gone === 'string' && v.gone.trim() ? { gone: v.gone.slice(0, 400) } : {}) }; else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && v.key.trim() && v.at === undefined) out.params[k] = { key: v.key.slice(0, 400), ...nestedParams(v.params, `${what}.params.${k}`) }; else if (v && typeof v === 'object' && !Array.isArray(v) && Number.isFinite(v.at) && v.at > 0) out.params[k] = { at: v.at, ...(typeof v.gone === 'string' && v.gone.trim() ? { gone: v.gone.slice(0, 400) } : {}) }; }   // r3: a clause missing its key keeps its `gone` (the renderer gives it the default key — never a bare clock that lies)
    }
    return out;
  };
  const out = { text: line(x.text, 'text') };
  if (x.detail != null) {
    if (!Array.isArray(x.detail)) throw new Error('i18n.detail must be an array of lines');
    // lane owner-press-attended r3: a fold's rows (`more` — «And N more producers.» carries the producers it folds) are
    // kept for the RECORD a Copy says whole (the fold is for the eye, never the record); a row carries no fold of its own
    out.detail = x.detail.slice(0, 12).map((l, i) => { const o = line(l, `detail[${i}]`); if (Array.isArray(l.more) && l.more.length) o.more = l.more.slice(0, MORE_LINES_MAX).map((m, j) => line(m, `detail[${i}].more[${j}]`)); return o; });
  }
  if (x.source != null) out.source = { key: line(x.source, 'source').key };
  return out;
}

/** lane owner-press-attended r3: the rows a detail line's fold (`more`) may carry — the record a Copy says whole. */
const MORE_LINES_MAX = 24;

/** lane job-notify-user r2: an agent's item's i18n STRING params through `mask` (the keys are the producer's English) —
 *  r3: each param ON ITS OWN (a field), never the sentence the key is */
function maskI18nParams(x, mask) {
  const line = (l) => (l && l.params ? { ...l, params: Object.fromEntries(Object.entries(l.params).map(([k, v]) => [k, typeof v === 'string' ? mask(v) : v])) } : l);
  return { ...x, text: line(x.text), ...(x.detail ? { detail: x.detail.map(line) } : {}) };
}
/** lane job-notify-user r3: a `{key, params}` line filled the way the client's t() fills it (src/lib/i18n.js — `{name}`
 *  ⇒ the param, an unknown one kept) — the English text of an AGENT_FIELDS item is its template filled with its fields */
function fillWords(l) {
  return String(l.key).replace(/\{(\w+)\}/g, (m, k) => { const v = l.params ? l.params[k] : undefined; return v === undefined ? m : v && typeof v === 'object' ? String(v.key) : String(v); });   // a WORDS param says its English key
}
// A JOB ITEM'S IDENTITY IS A FACT (lane job-notify-user r3), never its words: `jobFact` names WHICH copy of WHICH job
// (jobId) an item is — a short kebab word the producer declares ('ask': the job posted a panel, and resolveByJob closes
// it when the panel is answered, expires or is withdrawn; 'fire': a notify cron's copy; 'missed': an --at time missed
// with catch-up off; 'parked': a service parked after its crash loop; a new copy names its own), or 'end:<state>:<cause>'
// (a task's end — done and failed are two facts, two items). The
// re-file match of an item carrying one is (sessionKey, jobId, jobFact), never the text: the r2 belt masked «Task
// refresh-token: done (ok)» and «…: failed (exit)» to ONE text and the failure merged into the success; and the resolver
// read /needs your input/, which «rotate-db-password «redacted» your input» no longer said.
/** the PRODUCT file that called add() (lane job-notify-user r4): the first V8 call site outside this file, as a repo path
 *  (src/…, server.js) — null for a suite's or a tool's own store (scripts/, tools/), a copy outside the checkout, or a
 *  runtime that keeps no call sites */
function srcCallerOf(fn) {
  const prep = Error.prepareStackTrace, lim = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = 6; Error.prepareStackTrace = (_, cs) => cs;
    const o = {}; Error.captureStackTrace(o, fn);
    for (const c of Array.isArray(o.stack) ? o.stack : []) {
      const f = c && typeof c.getFileName === 'function' ? c.getFileName() : null;
      if (!f || f === __filename) continue;
      const root = path.dirname(__dirname);
      if (!f.startsWith(root + path.sep)) return null;
      const rel = path.relative(root, f).split(path.sep).join('/');
      return /^(scripts|tools|node_modules)\//.test(rel) ? null : rel;
    }
    return null;
  } catch { return null; } finally { Error.prepareStackTrace = prep; Error.stackTraceLimit = lim; }
}
const JOB_FACT_RE = /^(?:[a-z][a-z-]{0,31}|end:[a-z_-]{1,24}:[a-z0-9._()-]{1,48})$/;
function normalizeJobFact(f, jobId, origin) {
  if (f == null) return null;
  if (typeof f !== 'string' || !JOB_FACT_RE.test(f)) throw new Error(`jobFact must be a short kebab word naming the copy (ask, fire, missed, parked, …) or end:<state>:<cause> (got ${String(f).slice(0, 40)})`);
  if (!jobId || origin !== 'jobs') throw new Error("jobFact: only a Background Work item with its jobId names one (origin 'jobs')");
  return f;
}

/** lane decision-inbox-rank (the LLM plugin's INBOX v2): the board's FACTS of an item as the store keeps them —
 *  {state, dated (≤ 40 characters of the item's own words, a date phrase), due, reasks, askedAt} — or null. Counts,
 *  kinds and times only: what the tray orders by without reading the item's text. */
const FACT_STATES = ['blocked', 'continued', 'finished', 'unknown'];
function normalizeFacts(f) {
  if (!f || typeof f !== 'object' || !FACT_STATES.includes(f.state)) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { state: f.state, dated: typeof f.dated === 'string' && f.dated ? f.dated.slice(0, 40) : null, due: num(f.due), reasks: Math.max(0, Math.floor(num(f.reasks) || 0)), askedAt: num(f.askedAt) || 0 };
}

/** A producer's ACTION PAYLOAD (design-reset-credits §5, 2026-09-22): what the
 *  inbox button does when the user decides — `{type, …flat facts}`. Validated
 *  here like `i18n`: a kebab-case `type`, at most 12 flat fields of
 *  strings (≤ 200 chars) / finite numbers / booleans / null — never HTML,
 *  never a nested object (the CLIENT maps `type` to a verb it already owns;
 *  the payload only names WHICH session/account, never HOW). null = none. */
function normalizeAction(x) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('action must be an object');
  if (typeof x.type !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(x.type)) throw new Error('action.type must be a kebab-case name');
  const out = { type: x.type };
  let n = 0;
  for (const [k, v] of Object.entries(x)) {
    if (k === 'type') continue;
    if (++n > 12) throw new Error('action has too many fields (max 12)');
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw new Error(`action.${k}: not a plain field name`);
    if (v === null || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`action.${k} must be finite`); out[k] = v; }
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else throw new Error(`action.${k} must be a string, number, boolean or null`);
  }
  return out;
}

// verify-r5 X1 (lane-pairing): the field that makes each of a producer's QUESTIONS its own item — a re-file matches an
// item carrying an `action` only when it carries the same action type AND the same identity (an agent's filing, which
// never carries an action, never merges into one). exit-proxy's asks: one item per ask (each is a different command;
// a reopened item answered the NEXT ask under the user's pointer). helper-ask is NOT here on purpose: a helper's
// parallel asks of one text SHARE one item by design (helper-asks.js re-points it — test-helper-ask ⑩)
/** A producer's CARD (design 009 §4, Layer 0 apps: an install proposal's view): the plain DATA a client draws the item
 *  from — structure, never words (the client words it with its own t()) and never markup. Validated like `action`:
 *  plain keys, strings ≤ 2 000 chars, finite numbers, booleans, null, arrays ≤ 64, depth ≤ 4, ≤ 24 KB as JSON; a value
 *  inside those bounds is kept EXACTLY (the card's Install sends a digest of what the client drew — src/app-card.js).
 *  A shape outside them THROWS by name. null = none. */
function normalizeCard(x, name = 'card') {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error(`${name} must be an object`);
  const walk = (v, depth, at) => {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`${at} must be finite`); return v; }
    if (typeof v === 'string') { if (v.length > 2000) throw new Error(`${at} is longer than 2000 characters`); return v; }
    if (depth >= 4) throw new Error(`${at} is nested too deep (max 4)`);
    if (Array.isArray(v)) { if (v.length > 64) throw new Error(`${at} has more than 64 entries`); return v.map((y, k) => walk(y, depth + 1, `${at}[${k}]`)); }
    if (typeof v !== 'object') throw new Error(`${at} must be plain data`);
    const out = {};
    let n = 0;
    for (const [k, y] of Object.entries(v)) {
      if (y === undefined) continue;
      if (++n > 32) throw new Error(`${at} has too many fields (max 32)`);
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw new Error(`${at}.${k}: not a plain field name`);
      out[k] = walk(y, depth + 1, `${at}.${k}`);
    }
    return out;
  };
  const out = walk(x, 0, name);
  if (JSON.stringify(out).length > 24000) throw new Error(`${name} is larger than 24 KB`);
  return out;
}
/** lane wake-approve-card r7 (the owner: «这个卡片的可读性很差» — the vault-run card was an English prose wall): a producer's
 *  FACTS about what it asks (vault-run-door's `cardFactsOf` — {v, who, tool, cmd, folder, secrets, hosts, shape, always,
 *  templates, masking}; every reason a CODE, never a sentence). The client words them with its own t()
 *  (src/foryou-actions.js runCardOf); `detail` stays the old clients' prose.
 *  A STORE CLIPS AND SAYS, NEVER THROWS (r8 — the acceptance: the card walk threw on a string over 2 000 characters, the door
 *  turned the throw into `ask_unfiled`, and a 2 973-character command got NO card and failed). The ONE bound (THE registry's
 *  RUN_CMD_BODY_MAX / RUN_CMD_MAX = vault-agent-own r23's CARD_STRING_MAX; the shared contract): every string ≤ 2 000. The
 *  command keeps the door's shape (r23 `facts` v2): `cmd` = its first 2 000 units, `cmdCut: true`, the WHOLE in `cmdFull` —
 *  chunks of ≤ 2 000 the client reassembles (≤ RUN_CMD_MAX in all); a producer that sent a longer `cmd` (an older door) is
 *  folded the same way here. Any other string past 2 000 keeps its start + «…»; a list past 64, an object past 32 fields, a
 *  part nested past 4 is cut — each cut NAMED in the facts' `cut` (≤ 16 paths, the fold says it) and on the returned record
 *  (`factsCut`). Idempotent: facts inside the bound (the door's own) are kept EXACTLY. A whole past 24 KB, or no object at
 *  all, is dropped (the card draws the prose `detail`, as before r7) — still filed. → {facts | null, cut: [paths]}. */
const clipText = (v, max) => {
  if (v.length <= max) return v;
  let n = max - 1;
  if (/[\ud800-\udbff]/.test(v[n - 1])) n--;   // never half a surrogate pair
  return v.slice(0, n) + '…';
};
/** The first `max` units (no marker — the door's own clip) / the whole in ≤ `max` chunks; both surrogate-safe. */
const headOf = (v, max) => { let n = Math.min(max, v.length); if (n < v.length && /[\ud800-\udbff]/.test(v[n - 1])) n--; return v.slice(0, n); };
const chunksOf = (v, max) => { const out = []; for (let i = 0; i < v.length;) { const c = headOf(v.slice(i), max); out.push(c); i += c.length || max; } return out.length ? out : ['']; };
function normalizeCardFacts(x) {
  if (x == null) return { facts: null, cut: [], fresh: [] };
  // r9 (a store says when it DROPS — the acceptance: a facts object past 24 KB was dropped with `factsCut` on the return only,
  // said nowhere; the card fell back to prose): a dropped whole files a STUB that says why ({dropped, cut: ['facts']} — no
  // `v`, so no client draws it as facts); the card draws «事实太大，未保存 — 只显示文字» (foryou-actions factsDroppedWords)
  if (typeof x !== 'object' || Array.isArray(x)) return { facts: { dropped: 'not-an-object', cut: ['facts'] }, cut: ['facts'], fresh: ['facts'] };
  if (typeof x.dropped === 'string' && FACTS_DROPPED.includes(x.dropped) && x.v === undefined) return { facts: { dropped: x.dropped, cut: ['facts'] }, cut: ['facts'], fresh: [] };   // a re-filed stub: the same stub
  const cut = (Array.isArray(x.cut) ? x.cut : []).filter((p) => typeof p === 'string' && p).map((p) => p.slice(0, 80)).slice(0, 16);   // the door's own cuts stay said
  const fresh = [];
  const said = (at) => { if (cut.length < 16 && !cut.includes(at)) { cut.push(at); fresh.push(at); } };
  const keyPath = (at, k) => { const w = String(k).replace(/[^\w.-]/g, '?').slice(0, 40) || '?'; return at ? `${at}.${w}` : w; };   // r9: a dropped key is NAMED (was the parent's path: «» at the top)
  const walk = (v, depth, at) => {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (Number.isFinite(v)) return v; said(at); return null; }
    if (typeof v === 'string') { if (v.length > RUN_CMD_BODY_MAX) said(at); return clipText(v, RUN_CMD_BODY_MAX); }
    if (depth >= 4 || typeof v !== 'object') { said(at); return null; }
    if (Array.isArray(v)) { if (v.length > 64) said(at); return v.slice(0, 64).map((y, k) => walk(y, depth + 1, `${at}[${k}]`)); }
    const out = {};
    let n = 0;
    for (const [k, y] of Object.entries(v)) {
      if (y === undefined) continue;
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k) || ++n > 32) { said(keyPath(at, k)); continue; }
      out[k] = walk(y, depth + 1, at ? `${at}.${k}` : k);
    }
    return out;
  };
  // THE COMMAND: its whole is the door's fold (`cmdFull` chunks — r23; a string from an older shape), else `cmd` itself
  const { cmd, cmdFull } = x;
  const parts = Array.isArray(cmdFull) ? cmdFull.filter((c) => typeof c === 'string') : typeof cmdFull === 'string' ? [cmdFull] : [];
  const whole = parts.length ? parts.join('') : typeof cmd === 'string' ? cmd : null;
  if (whole == null && cmd != null) said('cmd');   // r9: a command that is no text is dropped AND named (was: silently gone, the card had no command box and still offered 允许一次)
  if (whole != null && whole.length > RUN_CMD_MAX) said('cmdFull');
  const command = whole == null ? {} : whole.length > RUN_CMD_BODY_MAX ? { cmd: headOf(whole, RUN_CMD_BODY_MAX), cmdCut: true, cmdFull: chunksOf(headOf(whole, RUN_CMD_MAX), RUN_CMD_BODY_MAX) } : { cmd: whole };
  const top = { ...x };   // the producer's key order kept (its facts come back byte-identical when inside the bound)
  for (const k of ['cmdCut', 'cmdFull', 'cut']) delete top[k];
  if (!('cmd' in top) && whole != null) top.cmd = '';
  const out = {};
  for (const [k, v] of Object.entries(walk('cmd' in top ? { ...top, cmd: null } : top, 0, ''))) { if (k === 'cmd') Object.assign(out, command); else out[k] = v; }   // r9: no `cmd` placeholder on facts that carry none (it was cut as a 33rd field)
  if (cut.length) out.cut = cut;
  if (JSON.stringify(out).length > 24000) return { facts: { dropped: 'too-large', cut: ['facts'] }, cut: ['facts'], fresh: ['facts'] };
  return { facts: out, cut, fresh };
}
/** Why a facts whole was dropped (the stub's `dropped`): past 24 KB, or not an object. */
const FACTS_DROPPED = ['too-large', 'not-an-object'];
const i18nKey = (s) => s;   // marks an English sentence as a dictionary key (the i18n check reads it)
/** r9: the set-aside notice's group key (a For-you notice of the store itself — one per boot that set a file aside). */
const SET_ASIDE_KEY = 'for-you-store';

// THE DOOR (lane foryou-plugin-notices, owner 2026-10-19 on Dropline's 「建议加入词库」 rows: 「这个部分点击应该要自动跳转」): where a
// click on the item's BODY takes the owner — declared by the producer at filing, validated like `action`:
// `{kind, plugin, panel?, prefill?, done?}`. OPEN_KINDS is the closed set of doors the client owns a verb for
// ('plugin-settings' = the plugin's own sheet, else its settings row — src/lib/plugins-ui.js openPluginDoor); an unknown
// kind THROWS by name. `plugin` = the filing plugin's id (a plugin opens only its own door), `panel` a kebab word naming
// the part of the sheet, `prefill` ≤ 8 flat fields (strings ≤ 200, lists ≤ 32 of strings ≤ 100) the door starts with,
// `done` an English t() key saying what ✓ does (present ⇒ the plugin applies the prefill on the owner's ✓ and the ✓'s
// title says so; absent ⇒ ✓ marks it handled). null = no door (the jump to the item's session, as before).
const OPEN_KINDS = ['plugin-settings'];
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{0,40}$/;
/** lane chat-needs-you-card: the CONVERSATION an item addresses when its producer files it under its own group key (a
 *  channel watch / access request under 'channels' names the asking agent's conversation) — a sessionKey
 *  (`backend:id` / `webui:id`), or null. The chat of that conversation draws the item as a card (src/foryou-actions.js). */
const ABOUT_RE = /^[a-z][a-z0-9-]{0,40}:[^\s]{1,200}$/;
const normalizeAbout = (x) => (typeof x === 'string' && ABOUT_RE.test(x) ? x : null);
const OPEN_FIELDS = ['kind', 'plugin', 'panel', 'prefill', 'done'];
function normalizeOpen(x, plugin) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('open must be an object');
  if (!OPEN_KINDS.includes(x.kind)) throw new Error(`open.kind must be one of ${OPEN_KINDS.join('/')}`);
  for (const k of Object.keys(x)) if (!OPEN_FIELDS.includes(k)) throw new Error(`open.${k}: not a field of a door (${OPEN_FIELDS.join('/')})`);
  if (typeof x.plugin !== 'string' || !PLUGIN_ID_RE.test(x.plugin)) throw new Error('open.plugin must be a plugin id');
  if (x.plugin !== plugin) throw new Error(`open.plugin must be the filing plugin (${plugin || 'none — only a plugin\'s item has a door'})`);
  const out = { kind: x.kind, plugin: x.plugin };
  if (x.panel != null) {
    if (typeof x.panel !== 'string' || !PLUGIN_ID_RE.test(x.panel)) throw new Error('open.panel must be a kebab-case word');
    out.panel = x.panel;
  }
  if (x.prefill != null) {
    if (typeof x.prefill !== 'object' || Array.isArray(x.prefill)) throw new Error('open.prefill must be an object');
    const pf = {};
    let n = 0;
    for (const [k, v] of Object.entries(x.prefill)) {
      if (++n > 8) throw new Error('open.prefill has too many fields (max 8)');
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw new Error(`open.prefill.${k}: not a plain field name`);
      if (typeof v === 'string') pf[k] = v.slice(0, 200);
      else if (Array.isArray(v) && v.length <= 32 && v.every((y) => typeof y === 'string')) pf[k] = v.map((y) => y.slice(0, 100));
      else throw new Error(`open.prefill.${k} must be a string or a list of ≤ 32 strings`);
    }
    out.prefill = pf;
  }
  if (x.done != null) {
    if (typeof x.done !== 'string' || !x.done.trim() || x.done.length > 200) throw new Error('open.done must be a sentence key (≤ 200 characters)');
    out.done = x.done;
  }
  return out;
}

// THE MERGE RULE (lane chat-needs-you-card, amendment 1): derived from THE For-you action registry — a row's `identity`
const { ACTION_IDENTITY } = require('./foryou-actions.js');
const { isDecisionRow, endsOf, OUTCOME_ENDS, RUN_CMD_BODY_MAX, RUN_CMD_MAX } = require('./foryou-actions.js');   // lane wake-approve-card r2: THE registry's decision rows (r3: each row's own ends; r8: a producer's outcome-in-the-fact settle, the run card's ONE bound)
const { isPointer, isHidden, HIDDEN_BY } = require('./foryou-actions.js');   // lane wake-approve-card r3: THE registry's pointers
/** A DECISION ROW HAS TWO VERBS (lane wake-approve-card, acceptance round 2 — the registry's DECISION_ROWS: a `decide:
 *  'person'` row that draws its own verbs — the wake request; r3: the vault's run ask and paste request, the hub-act ask). Its item leaves 'open' only by
 *  its decision (`allowed` / `denied` / `always` / `stored`, the person door's engine) or its own end (`expired`, a held ask's
 *  `ask-expired` / `ask-over`… — the row's `ends`); a generic close — the ✓ / ✕ a stale page still draws, a script, «Mark all seen», a reply —
 *  is refused BY NAME (`decision_row`), and a decided one is final (`decision_final`: never reopened, never re-stamped). Was:
 *  ✓ Mark done beside Approve DENIED a wake request silently, its record read «✓ done», and the 6 s Undo reopened a request
 *  that was over. → null (lawful) | {code, error}. */
function decisionRefusal(item, status, by) {
  if (!isDecisionRow(item)) return null;
  if (item.status !== 'open') return status === item.status && by === item.resolvedBy ? null : { code: 'decision_final', error: `${item.id} was decided (${item.resolvedBy || item.status}) — a decision is final; the agent can ask again` };
  if (status !== 'open' && !endsOf(item).includes(by)) return { code: 'decision_row', error: `${item.id} is a decision — only its own verbs end it (nothing else closes it)` };
  return null;
}
const decisionError = (no) => Object.assign(new Error(no.error), { code: no.code });
/** r8 (the acceptance, with vault-agent-own 4ff55fb4's real door): a decision row's producer that settles with the PERSON or
 *  'vault' as `by` and the outcome in `fact.outcome` ('late-allowed' / 'denied' / 'expired' / 'vault_locked') was skipped
 *  here in silence — the late card stayed open with its buttons after the one-run pass was granted. Until it writes the ruled
 *  shape (resolvedBy = the outcome word) its outcome IS the end (THE registry's OUTCOME_ENDS — the client reads such a record
 *  the same way: foryou-actions endOf), `late` kept on the fact. Anything else: `by` as given (the law judges it). */
function outcomeEnd(item, by, fact) {
  if (!isDecisionRow(item) || endsOf(item).includes(by)) return by;
  const o = fact && typeof fact.outcome === 'string' && Object.prototype.hasOwnProperty.call(OUTCOME_ENDS, fact.outcome) ? OUTCOME_ENDS[fact.outcome] : null;
  return o && endsOf(item).includes(o) ? o : by;
}
/** A POINTER HIDES, NEVER DECIDES (lane wake-approve-card, acceptance round 3 — the registry's `closer: 'hide'` rows: an
 *  access request's item, the Outbox's pointer). The PERSON's close of one (`by` 'user': the ✕ Hide, the ✓ a stale page still
 *  draws, «Mark all seen») is written as a HIDE — status 'dismissed', `resolvedBy: 'hidden'` («hidden — nothing was decided»),
 *  never «✓ done»; the question it points at is untouched (still open where it lives). A producer's own close (its
 *  retraction, its answer) is its own. Was: ✓ on an rq- item recorded «✓ done» with the request open. → {status, by}. */
function hideOf(item, status, by) {
  return status !== 'open' && by === 'user' && isPointer(item) ? { status: 'dismissed', by: HIDDEN_BY } : { status, by };
}
const { FOR_YOU_URGENCIES: URGENCIES } = require('./agent-cli-text.js'); // lane job-notify-user r3: THE one set — the agent CLIs read the same constant (it ships beside them)
/** lane ledger-dedup-law r5: an item's resolution is no longer a person's decision once another door re-stamps or reopens it
 *  (its ✓, Mark all seen, a producer's own re-stamp) — the fact stays for its words, the mark goes (add() reopens it again). */
function undecide(item) { if (item.resolvedFact && item.resolvedFact.decidedBy) { const f = { ...item.resolvedFact }; delete f.decidedBy; item.resolvedFact = f; } }
const KINDS = ['action', 'notice']; // 2.369.118: action = needs the user (default); notice = for their information (own section, grey count)
const STATUSES = ['open', 'done', 'dismissed'];
// THE SIZE OF AN ITEM (2026-09-27, the For-you window's verify round — the owner's
// complaint IS long agent messages, and the window reads them whole): a question up
// to TEXT_MAX chars, its detail up to DETAIL_MAX. add() cuts past them and SAYS SO
// on the record it RETURNS (`textCut` / `detailCut` = the cap it hit — never stored)
// so `vibespace-ask` can name the cut instead of dropping 3 000 characters silently
// (measured: a 5 000-char --detail printed "added" and kept 2 000). The snapshot every
// client receives (the broadcast and GET /api/user-todos) carries an OPEN item whole
// and a RESOLVED one as a DETAIL_PREVIEW-char preview + `detailTruncated: true`
// (previewOf), so history never grows the payload (250 resolved × 8 000 would be
// 2 MB per broadcast); GET /api/user-todos/:id serves one record whole.
const TEXT_MAX = 500;
const DETAIL_MAX = 8000;
// ARTIFACTS (lane foryou-attachments, owner 2026-10-09): what the agent asks the owner to LOOK AT. The route's submit judge
// proved each one opens (src/server/artifact-registry.js judgeAsk); the store keeps only the SHAPE — ≤ ARTIFACTS_MAX rows
// of {kind: file|design|page, host, path|page, name, url?}; past the cap the rest is cut and the cut is NAMED on the
// returned record (`artifactsCut`, like the text/detail caps); a malformed row THROWS by name.
const ARTIFACTS_MAX = 8;
const ARTIFACT_KINDS = ['file', 'design', 'page'];
function normalizeArtifacts(list) {
  if (list == null) return { artifacts: null, cut: 0 };
  if (!Array.isArray(list)) throw new Error('artifacts must be a list');
  const out = list.slice(0, ARTIFACTS_MAX).map((a, k) => {
    if (!a || !ARTIFACT_KINDS.includes(a.kind)) throw new Error(`artifacts[${k}].kind must be one of ${ARTIFACT_KINDS.join('/')}`);
    const name = typeof a.name === 'string' ? a.name.slice(0, 200) : '';
    if (a.kind === 'page') {
      const page = String(a.page || '');
      if (!/^[\w-]{1,64}$/.test(page)) throw new Error(`artifacts[${k}].page is not a page id`);
      return { kind: 'page', host: '', page, name: name || page, url: '/p/' + page };
    }
    const p = String(a.path || '');
    if (!p.startsWith('/') || p.length > 4096) throw new Error(`artifacts[${k}].path must be an absolute path`);
    const host = typeof a.host === 'string' && a.host !== 'local' ? a.host.slice(0, 120) : '';
    return { kind: a.kind, host, path: p, name: name || p.replace(/\/+$/, '').split('/').pop() || p };
  });
  return { artifacts: out.length ? out : null, cut: list.length > ARTIFACTS_MAX ? ARTIFACTS_MAX : 0 };
}
const DETAIL_PREVIEW = 300;
/** A RESOLVED item as the snapshot carries it: a detail past DETAIL_PREVIEW becomes its
 *  first DETAIL_PREVIEW chars + `detailTruncated: true`; anything shorter (or no detail)
 *  is the record itself. Never mutates the stored item. */
function previewOf(item) {
  // a resolved CARD rides as its face only (its Details are history — GET /api/user-todos/:id has them whole)
  const card = item && item.card && item.card.details ? { ...item.card, details: null } : null;
  if (!item || typeof item.detail !== 'string' || item.detail.length <= DETAIL_PREVIEW) return card ? { ...item, card } : item;
  return { ...item, detail: item.detail.slice(0, DETAIL_PREVIEW), detailTruncated: true, ...(card ? { card } : {}) };
}
const MAX_OPEN_PER_SESSION = 20; // an agent looping on add must not flood the inbox
const MAX_ITEMS = 1000;          // total ledger cap — oldest RESOLVED pruned first (an EXPIRED one before any other: EXPIRED_BY)
// lane ledger-dedup-law F3 (B-7f9e: 958 expired hub-act cards held 958 of a fleet owner's 1000 slots and evicted the items
// he had answered): at the cap an item that ended UNANSWERED (its producer's end — the expiry sweep, an ask that ran out or
// was over) goes before any item a person resolved, oldest first in each; an OPEN item is never evicted
const EXPIRED_BY = new Set(['expired', 'ask-expired', 'ask-over', 'no-longer-asked']); // r2: a standing item its subject stopped asking ended unanswered too
const RESOLVED_TAIL = 15;                    // the snapshot's resolved tail: always the newest 15…
const RESOLVED_RECENT_MS = 60 * 60 * 1000;   // …plus every item resolved within the last hour (an open popup's in-place rows, chunk 4)…
const RESOLVED_SNAPSHOT_MAX = 250;           // …never more than this (one resolve-many is ≤ 200 ids)
const EXPIRY_SWEEP_MS = 5 * 60 * 1000; // 2.369.152: how often an open item whose `expiresAt` passed is resolved 'expired'

/** An `expiresAt` a producer may stamp: a finite ms epoch in the FUTURE, else
 *  null (ignored — a past or garbage instant must never make an item die on
 *  arrival, nor throw a producer's filing away). */
function validExpiry(x, now = Date.now()) {
  const n = typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) && n > now ? n : null;
}

class UserTodoManager {
  /** @param expirySweepMs how often expireDue() runs (0 = never on a timer —
   *  a migration or a suite that builds a private manager must not leave one)
   *  @param now THE store's clock (lane decision-inbox-clock): every stamp and every
   *  "has it passed" below reads `this._now()` — a suite hands the clock its
   *  engine runs on, so a filing's createdAt and the engine's `now` agree at any
   *  wall-clock time (test-decision-inbox's ONE CLOCK census: no other wall-clock read in the class);
   *  the default reads the global per call, so a suite that swaps it still steers the store */
  constructor({ dataDir, onChange, expirySweepMs = EXPIRY_SWEEP_MS, onWriteError = null, maxItems = MAX_ITEMS, now = () => Date.now() }) {
    this._now = now;
    this._maxItems = Number.isInteger(maxItems) && maxItems > 0 ? maxItems : MAX_ITEMS; // the total cap (a suite's seam)
    this._file = path.join(dataDir, 'user-todos.json');
    this._onChange = onChange || (() => {});
    this._onWriteError = typeof onWriteError === 'function' ? onWriteError : null; // lane-dead-bridge: session-status's twin — a failed background write is named, never a crash
    this._writeFailures = 0;
    this._statusListeners = []; // onStatus(fn): an item LEAVING 'open' by any door (verify-r2 ask-b), and (verify-r6 W2) a reopen
    this._pluginGate = null; // lane foryou-plugin-notices: setPluginGate(fn) — does plugin <id> declare 'reminders'? (the server's; null = shape rules only)
    this._state = { items: [] };
    this._writeTimer = null; this._dirty = false; this._lastWritten = null;
    // r9 (THE ATOMIC-WRITE + NO-SILENT-FAILURE LAWS — the acceptance: a truncated user-todos.json started the store FRESH with
    // nothing said, and a held decision lost its card): a MISSING file is an empty store; one that exists but cannot be read,
    // parsed, or has the wrong shape is SET ASIDE beside itself exactly as the channel store's index.json is
    // (`user-todos.json.corrupt-<ts>`, its bytes kept, never unlinked), with ONE named log line and ONE For-you notice naming
    // where the bytes are (filed below, once the store is up); the channels engine's boot reconcile files a held decision's
    // card again from its request row.
    let setAside = null;
    try {
      const text = timedSync('user-todos.read', () => fs.readFileSync(this._file, 'utf-8'));
      let parsed = null, why = null;
      try { parsed = JSON.parse(text); } catch (e) { why = `corrupt JSON (${String((e && e.message) || e).slice(0, 80)})`; }
      if (!why && !(parsed && Array.isArray(parsed.items))) why = 'not the expected shape';
      if (why) setAside = this._setAside(why);
      else { this._state = parsed; this._lastWritten = JSON.stringify(this._state, null, 2); }
    } catch (e) { if (!(e && e.code === 'ENOENT')) setAside = this._setAside(`unreadable (${(e && e.code) || (e && e.message)})`); }
    // THE ONE LEGACY RUNG (lane job-notify-user r3 → r4: every copy, AFTER the load): a job's copy filed before 2.369.361
    // carries no `jobFact` — the only place the store reads a sentence, once, at load. An engine ≤ .360 filed each of its
    // five copies as the template's sentence whole, so every OPEN one takes the fact its own template implies (job-model
    // legacyCopyFact: end:<state>:<cause> parsed out, parked, missed, ask, else the fire's) — the resolver keys on the fact
    // alone (the panel answered after the upgrade still closes the ask) and the next copy of the same job re-files into it
    // (r3 covered asks only: an open .360 end / park / missed / fire copy sat beside its first fact-keyed twin). An item with
    // no stored origin but a job id is a pre-B-328d job copy (only Background Work files a jobId) — r3 skipped it.
    for (const it of this._state.items) {
      if (it && it.jobId && (it.origin === 'jobs' || it.origin == null) && it.jobFact == null && it.status === 'open' && !it.clearedAt) {
        const f = legacyCopyFact(it.text, it.jobId);
        if (f) it.jobFact = f;
      }
    }
    // EXPIRY (2.369.152, "SPEND NOTICES LIVED FOREVER AS ACTIONS"): a notice
    // about a WINDOW (this hour's / today's unattended-turn budget, a 6 h
    // refusal) carries the window's end as `expiresAt` and dies with it. The
    // store owns the clock: once after load (an item that expired while the
    // server was down goes at boot, not 5 min later) and on an unref'd
    // interval — the store's OWN timer, because server.js has no shared sweep
    // cadence other stores hook into (each keeper runs its own).
    this._expiryTimer = null;
    if (setAside) this._fileSetAside(setAside);
    this.expireDue();
    if (expirySweepMs > 0) {
      this._expiryTimer = setInterval(() => { try { this.expireDue(); } catch { } }, expirySweepMs);
      if (this._expiryTimer.unref) this._expiryTimer.unref();
    }
  }

  /** r9: the unreadable file RENAMED beside itself (a copy when the rename cannot be done) → {why, to | null}. */
  _setAside(why) {
    const dir = path.dirname(this._file);
    const to = `user-todos.json.corrupt-${new Date(this._now()).toISOString().replace(/[:.]/g, '-')}`;
    try { fs.renameSync(this._file, path.join(dir, to)); }
    catch (e) {
      try { fs.copyFileSync(this._file, path.join(dir, to)); }
      catch (e2) { console.warn(`[user-todos] user-todos.json is ${why} and could NOT be set aside (${(e2 && e2.code) || (e2 && e2.message)}) — the next save replaces it`); return { why, to: null }; }
    }
    console.warn(`[user-todos] user-todos.json was ${why} — set aside as ${to} (its bytes kept, never overwritten); For you starts empty`);
    return { why, to };
  }
  /** r9: ONE notice naming where the set-aside bytes are (said where the owner looks — never a log line only). */
  _fileSetAside({ why, to }) {
    try {
      this.add(SET_ASIDE_KEY, {
        origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'For you',
        text: to ? `For you could not read its saved list and set it aside as ${to} — the list started empty` : `For you could not read its saved list and could NOT set it aside — the next save replaces it`,
        detail: `user-todos.json was ${why}.\n${to ? `Its bytes are kept as data/${to} — nothing was deleted. A held channel decision is filed again from its request; other open items are not in the new list.` : 'It could not be renamed or copied.'}`,
        i18n: {
          text: to ? { key: i18nKey('For you could not read its saved list and set it aside as {where} — the list started empty'), params: { where: to } } : { key: i18nKey('For you could not read its saved list and could NOT set it aside — the next save replaces it') },
          detail: [{ key: i18nKey('Nothing was deleted. Fix the JSON and move it back while the server is stopped, or keep the new store and delete the copy once you no longer need it.') }],
          source: { key: i18nKey('For you') },
        },
      });
    } catch (e) { console.warn(`[user-todos] the set-aside notice could not be filed: ${(e && e.message) || e}`); }
  }

  /** The manager's last act (suites, a migration's private manager): the
   *  expiry timer cleared AND a pending debounced write flushed NOW (r2: the
   *  500 ms write timer outlived stop() and fired into a data dir its owner had
   *  already removed — ENOENT from a timer nobody could catch). */
  stop() {
    if (this._expiryTimer) { clearInterval(this._expiryTimer); this._expiryTimer = null; }
    this.flush();
  }

  /** THE ITEM'S END IS ONE EVENT (verify-r2 ask-b, lane-pairing): a producer whose item STANDS FOR a pending
   *  question of its own (the exit's "ask me each time") subscribes here and settles its side the moment the item
   *  leaves 'open' by ANY door — the ✓ on the row, "Mark all seen", a reply, the agent's own `vibespace-ask done`,
   *  the expiry sweep. Before: the item was done while the ask kept waiting its 60 s, and the ask id could still be
   *  ALLOWED afterwards — two states for one question. `fn(item, {status, by})`, called after the save + broadcast;
   *  a throwing listener is contained. Returns an unsubscribe. */
  onStatus(fn) { if (typeof fn === 'function') this._statusListeners.push(fn); return () => { this._statusListeners = this._statusListeners.filter((f) => f !== fn); }; }
  // lane foryou-plugin-notices: `batch: true` = 「全部标为已看」 (setStatusMany) — a plugin whose ✓ APPLIES something (its
  // door's `done`) acts on ONE ✓ by the owner, never on a whole group marked seen
  // lane owner-press-attended r2: `pressed` = the PRESS the For-you ✓'s door minted (write-origin pressOf) — a listener
  // whose act starts a turn (browser-handback's takeover-request item) makes it ATTENDED only with it
  _emitStatus(items, by, batch = false, { pressed = null } = {}) {
    if (!this._statusListeners.length) return;
    for (const it of items) for (const fn of this._statusListeners) { try { fn(it, batch ? { status: it.status, by, batch: true } : { status: it.status, by, ...(pressed ? { pressed } : {}) }); } catch { } }
  }
  /** lane foryou-plugin-notices: THE CAPABILITY GATE of a plugin's reminder — `fn(pluginId)` → true when that plugin declares
   *  'reminders' (src/plugins/<id>.js `provides`; the wiring hands PluginManager's answer in). A filing by a plugin the gate
   *  refuses THROWS by name. */
  setPluginGate(fn) { this._pluginGate = typeof fn === 'function' ? fn : null; }

  /** Resolve every OPEN item whose `expiresAt` has passed — `resolvedBy:
   *  'expired'`, status 'done', the record kept (the ledger is history). An
   *  item WITHOUT `expiresAt` is never touched: expiry is a producer's
   *  declaration, never inferred from age or text. ONE save + ONE broadcast
   *  per sweep however many items went. @returns the count resolved */
  expireDue(now = this._now()) {
    let n = 0;
    const went = [];
    for (const it of this._state.items) {
      if (it.status !== 'open') continue;
      if (!(typeof it.expiresAt === 'number' && Number.isFinite(it.expiresAt)) || it.expiresAt > now) continue;
      it.status = 'done'; it.resolvedAt = now; it.resolvedBy = 'expired';
      n++; went.push(it);
    }
    if (n) { this._save(); this._notify(); this._emitStatus(went, 'expired'); }
    return n;
  }

  /** THE store's door for a one-shot reshaping (src/server/migrations.js):
   *  `fn(item, now)` mutates an item in place and returns true when it did.
   *  The migration goes through the LIVE manager because it runs long after
   *  server.js built it — a second writer on data/user-todos.json would be
   *  overwritten by this manager's next save. ONE save + ONE broadcast.
   *  @returns the number of items `fn` changed */
  reshapeItems(fn, now = this._now()) {
    let n = 0;
    for (const it of this._state.items) { if (fn(it, now)) n++; }
    if (n) { this._save(); this._notify(); }
    return n;
  }

  _save() {
    // Prune: drop resolved items past the cap (open items never pruned) — the ones that ended unanswered first (EXPIRED_BY),
    // then the rest, oldest first in each
    if (this._state.items.length > this._maxItems) {
      const age = (i) => i.resolvedAt || i.createdAt || 0, lapsed = (i) => (EXPIRED_BY.has(i.resolvedBy) ? 0 : 1);
      const resolved = this._state.items.filter((i) => i.status !== 'open')
        .sort((a, b) => (lapsed(a) - lapsed(b)) || (age(a) - age(b)));
      const drop = new Set(resolved.slice(0, this._state.items.length - this._maxItems).map((i) => i.id));
      if (drop.size) this._state.items = this._state.items.filter((i) => !drop.has(i.id));
    }
    this._dirty = true;
    if (!this._writeTimer) this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, 500);
  }

  // THE DEBOUNCED WRITE MAY NOT THROW — the twin of session-status.js's
  // (lane-dead-bridge: that one's bare writeFileSync met a relayed EMFILE at
  // 12:03:17 and killed the server). Dirty kept, backoff retry, reported.
  _flushFromTimer() {
    try { this._flush(); this._writeFailures = 0; }
    catch (e) {
      this._writeFailures++;
      this._dirty = true;
      const retryMs = Math.min(60000, 1000 * 2 ** Math.min(6, this._writeFailures - 1));
      if (!this._writeTimer) { this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, retryMs); this._writeTimer.unref?.(); }
      try { this._onWriteError?.(e, this._file + '.tmp', { failures: this._writeFailures, retryMs }); } catch { }
    }
  }

  _flush() {
    if (!this._dirty) return;
    const json = JSON.stringify(this._state, null, 2);
    if (json === this._lastWritten) { this._dirty = false; return; }
    const tmp = this._file + '.tmp';
    timedSync('user-todos.write', () => { fs.writeFileSync(tmp, json); fs.renameSync(tmp, this._file); });
    this._lastWritten = json;
    this._dirty = false;
  }

  flush() { if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; } this._flush(); }

  _notify() { try { this._onChange(this.snapshot()); } catch { } }

  // Everything the UI needs: open items + a short tail of recently-resolved
  // ones (shown dimmed for context). Sorted urgent-first, then DECISIONS
  // first (an item with option chips is answerable in one click — design-user-
  // inbox-reply D3f, every client agrees because the store sorts), then newest.
  snapshot() {
    const rank = (u) => URGENCIES.indexOf(u || 'normal');
    const hasOpts = (i) => (Array.isArray(i.options) && i.options.length ? 1 : 0);
    const open = this._state.items.filter((i) => i.status === 'open')
      .sort((a, b) => (rank(b.urgency) - rank(a.urgency)) || (hasOpts(b) - hasOpts(a)) || (b.createdAt - a.createdAt));
    // The resolved tail: the newest 15 (the popup's "Recently resolved" shows 6)
    // PLUS everything resolved in the last hour, ≤ 250 (chunk 4): an OPEN popup
    // keeps a row resolved while it was open in its slot only while the row is
    // still in the snapshot (nextLayout drops ids the store no longer lists) —
    // with a flat 15, "Mark all seen" on a 30-ask group made 15 struck rows
    // vanish from under the pointer (test-inbox-reply-ui ⑮ caught it).
    const now = this._now();
    const resolved = this._state.items.filter((i) => i.status !== 'open')
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
      .filter((i, k) => k < RESOLVED_TAIL || (now - (i.resolvedAt || 0)) < RESOLVED_RECENT_MS)
      .slice(0, RESOLVED_SNAPSHOT_MAX);
    // a resolved item's detail rides as a PREVIEW (previewOf): the tail is history, and
    // 250 × 8 000 chars per broadcast is not a price every client pays for it
    // lane inbox-decision-group: the LLM plugin's tray sections ride the snapshot ONLY while its switch is on
    // (the engine's `grouping()`), so a switched-off tray receives today's payload byte for byte
    let grouping = null;
    try { grouping = this._grouping ? this._grouping() : null; } catch { grouping = null; }
    if (grouping) return { open, resolved: resolved.map(previewOf), grouping };
    return { open, resolved: resolved.map(previewOf) };
  }

  /** USE ④ (lane inbox-decision-group): the LLM plugin's door. `setGrouping(fn)` — what the snapshot says about the
   *  tray's sections (null = off); `openItems()` — the open items (copies); `setJudged(id, judged)` — writes the judge's
   *  verdict BESIDE an open item (`judged: {group: 'now'|'later'|null, p, at, v}`) and nothing else: the item's
   *  urgency is the agent's declaration and is never written here. → true when it wrote.
   *  lane decision-inbox-rank (INBOX v2): the verdict also keeps `why` (the chosen value), `facts` (normalizeFacts) and
   *  `sig` (what it was made under); `setFacts([[id, facts]…])` — the engine's pass writes each item's current facts
   *  into `judged.facts` (a `{group: null, v: 0}` stand-in before any verdict), only what changed, ONE broadcast. */
  setGrouping(fn) { this._grouping = typeof fn === 'function' ? fn : null; }
  openItems() { return this._state.items.filter((i) => i.status === 'open').map((i) => ({ ...i })); }
  setJudged(id, judged) {
    const it = this.get(id);
    if (!it || it.status !== 'open' || !judged || typeof judged !== 'object') return false;
    const group = judged.group === 'now' || judged.group === 'later' ? judged.group : null;
    const p = typeof judged.p === 'number' && Number.isFinite(judged.p) ? judged.p : null;
    it.judged = { group, p, at: Number(judged.at) || this._now(), v: Number(judged.v) || 1 };
    it.judged.why = typeof judged.why === 'string' && /^[a-z]{1,20}$/.test(judged.why) ? judged.why : null;
    it.judged.facts = normalizeFacts(judged.facts);
    it.judged.sig = typeof judged.sig === 'string' ? judged.sig.slice(0, 200) : null;
    this._save(); this._notify();
    return true;
  }
  setFacts(entries) {
    let changed = false;
    for (const [id, f] of Array.isArray(entries) ? entries : []) {
      const it = this.get(id), facts = normalizeFacts(f);
      if (!it || it.status !== 'open' || !facts) continue;
      const j = it.judged && typeof it.judged === 'object' ? it.judged : null;
      if (j && JSON.stringify(j.facts || null) === JSON.stringify(facts)) continue;
      it.judged = j ? { ...j, facts } : { group: null, p: null, at: 0, v: 0, why: null, facts, sig: null };
      changed = true;
    }
    if (changed) { this._save(); this._notify(); }
    return changed;
  }
  notify() { this._notify(); }

  forSession(keys) {
    const set = new Set(Array.isArray(keys) ? keys : [keys]);
    return this._state.items.filter((i) => set.has(i.sessionKey) && i.status === 'open');
  }

  get(id) { return this._state.items.find((i) => i.id === id) || null; }

  add(sessionKey, { text, detail, urgency, by = 'agent', sessionName = null, jobId = null, kind = null, i18n = null, expiresAt = null, action = null, options = null, origin = null, card = null, facts = null, artifacts = null, cwd = null, hostId = null, openCap = null, plugin = null, open = null, about = null, jobName = null, jobFact = null, itemKey = null } = {}) {
    const _dataDir = path.dirname(this._file);   // agent-output-sinks: the belt finds the vault from here
    // agent-output-sinks: belt an AGENT's own words — never a system producer's notice (vault / spend / channels / machines / …).
    // Two shapes (src/inbox-origin.js): AGENT_WORDS_ORIGINS — the whole text and detail are the agent's (vibespace-ask);
    // AGENT_FIELDS_ORIGINS — the PRODUCT's sentence with the agent's words as FIELDS (lane job-notify-user r3: a job's NAME,
    // a notify cron's --text). A fields item files its words as i18n {key, params}: each string param is belted ON ITS OWN
    // and the text / detail are the template filled with them — the product's words (an outcome, «needs your input») are
    // never belted. Its group label is the person's fact (the conversation's own name, whole) + the job's NAME (`jobName`,
    // a field, belted). A conversation's own name is never belted under either shape (r3: the r2 label belt masked it).
    const agentWords = AGENT_WORDS_ORIGINS.includes(origin);
    const agentFields = AGENT_FIELDS_ORIGINS.includes(origin);
    const beltOf = (s) => belt.maskForSink(s, { dataDir: _dataDir });
    if (agentFields) {
      // THE ONE FILER per fields origin (lane job-notify-user r4): a product file not listed in FIELDS_FILERS is refused by
      // name, whatever spelling of the origin it used — the store judges the WRITER by what it writes
      const filer = srcCallerOf(UserTodoManager.prototype.add);
      if (filer && !(FIELDS_FILERS[origin] || []).includes(filer)) throw new Error(`origin '${origin}' is filed only by ${(FIELDS_FILERS[origin] || []).join(', ') || 'no product file'} — ${filer} is not its filer`);
      if (text != null || detail != null) throw new Error(`origin '${origin}' files its words as i18n {key, params} — the store composes the text and detail (each field belted on its own, never the sentence)`);
      // the shape is refused by name first; each param is belted BEFORE the clamp (a token across the 600-char cut is masked whole)
      i18n = i18n == null ? null : normalizeI18n((normalizeI18n(i18n), maskI18nParams(i18n, beltOf)));
      if (!i18n) throw new Error(`origin '${origin}' files its words as i18n {key, params} — the text's template is required`);
      text = fillWords(i18n.text);
      detail = i18n.detail && i18n.detail.length ? i18n.detail.map(fillWords).join('\n') : null;
      if (typeof jobName === 'string' && jobName.trim()) sessionName = [typeof sessionName === 'string' && sessionName ? sessionName : null, beltOf(jobName.trim().slice(0, 200))].filter(Boolean).join(' · ');
    } else if (jobName != null) throw new Error("jobName: only a Background Work item names one (origin 'jobs')");
    const rawText = typeof text === 'string' ? (agentWords ? beltOf(text.trim()) : text.trim()) : '';
    text = rawText.slice(0, TEXT_MAX);
    const textCut = rawText.length > TEXT_MAX ? TEXT_MAX : 0; // the cap it hit, named on the return
    // EXPIRY (2.369.152): optional; only a future ms epoch counts (validExpiry)
    expiresAt = validExpiry(expiresAt, this._now());
    if (!text) throw new Error('text required');
    // WORDS AS STRUCTURE (a3 i18n, 2026-09-21): a server-side producer may
    // file, beside its English `text`/`detail` (the dedupe key and the agent
    // CLI's contract, unchanged), the same sentences as `{key, params}` the
    // CLIENT words with its own t() — `text`, `detail` LINES and the `source`
    // name — so a zh/ja inbox does not read "Channels: Proposals awaiting
    // approval in …". Validated here; a malformed shape is refused by name.
    // lane job-notify-user r2: an agent's item's params are its words too (a fields item's were belted above, each on its own) —
    // r3: belted BEFORE the clamp, the shape refused by name first
    if (agentWords && i18n != null) { normalizeI18n(i18n); i18n = maskI18nParams(i18n, beltOf); }
    i18n = normalizeI18n(i18n);
    action = normalizeAction(action); // a server producer's decision payload (reset credit, §5), or null
    card = normalizeCard(card); // a server producer's view of the item (design 009: an app install's one card), or null
    const fx = normalizeCardFacts(facts); // r7: a producer's facts the client words (the vault-run card), or null — r8: clipped and named, never a throw
    facts = fx.facts;
    if (fx.fresh.length) console.warn(`[user-todos] ${String(sessionKey).slice(0, 80)}: ${fx.fresh.includes('facts') ? `the card's facts were ${facts && facts.dropped === 'not-an-object' ? 'not an object' : 'larger than 24 KB'} — dropped, the card shows its text only` : `the card's facts were cut — named in its fold: ${fx.fresh.join(', ')}`} (r9: every drop named on the card and here)`);
    options = normalizeOptions(options); // option chips (vibespace-ask --options "A|B|C"): ≤6 distinct labels ≤40 chars, else THROWS by name — or null
    const arts = normalizeArtifacts(artifacts); // lane foryou-attachments: vibespace-ask --artifact — ≤8 rows, the cut named, a bad shape THROWS by name
    artifacts = arts.artifacts;
    // WHERE ITS WORDS LIVE (lane foryou-attachments): the asking conversation's cwd + host — a path in the words opens
    // against them (resolution for OPENING only, never a spawn)
    cwd = typeof cwd === 'string' && cwd.startsWith('/') ? cwd.slice(0, 4096) : null;
    hostId = typeof hostId === 'string' && hostId && hostId !== 'local' ? hostId.slice(0, 120) : null;
    about = normalizeAbout(about); // lane chat-needs-you-card: the conversation it addresses (its chat draws the card), or null
    // ORIGIN (B-328d, 2026-09-24): WHO filed it — a closed set (src/inbox-origin.js).
    // REQUIRED (r2, fail closed): a caller naming none THROWS `origin required
    // (one of …)` and a value outside the set THROWS by name — either files
    // nothing. There is no default: the old `agent` default let a producer the
    // census could not see (an aliased store, `?.add`) file under Agents with
    // nothing red anywhere. Every caller declares at the call — the agent route
    // `agent`, each server producer its own, every fixture explicitly
    // (test-user-todos-layout ⑪ is the census beside this throw).
    origin = normalizeOrigin(origin);
    // A PLUGIN'S REMINDER (lane foryou-plugin-notices): origin 'plugin' names WHICH plugin (`plugin`, its id) and files under
    // that id — one tray section per plugin, pinned under urgent unless filed low (src/lib/user-todos-layout.js trayBand); the plugin must
    // DECLARE 'reminders' (the gate); `plugin` on any other origin is refused, and so is a door on an item that is no plugin's
    if (origin === 'plugin') {
      if (typeof plugin !== 'string' || !PLUGIN_ID_RE.test(plugin)) throw new Error("a plugin's item names its plugin (plugin: <id>)");
      if (sessionKey !== plugin) throw new Error(`a plugin files under its own id (${plugin}), not ${sessionKey}`);
      if (this._pluginGate && !this._pluginGate(plugin)) throw new Error(`plugin ${plugin} does not declare 'reminders' — it cannot file For-you items`);
    } else if (plugin != null) throw new Error("plugin: only a plugin's item names one (origin 'plugin')");
    open = normalizeOpen(open, origin === 'plugin' ? plugin : null);
    jobFact = normalizeJobFact(jobFact, jobId, origin); // lane job-notify-user r3: which copy of which job — the resolver's key and the re-file match
    if (urgency != null && !URGENCIES.includes(urgency)) throw Object.assign(new Error(`urgency must be one of ${URGENCIES.join('/')}`), { code: 'urgency' });   // the code: a producer journals the refusal by name (lane job-notify-user r2)
    // KIND (2.369.118, owner: spend notices are DISTRACTING beside real asks):
    // 'action' = the user must do something (default, every older item);
    // 'notice' = for their information only — its own section in the popup,
    // never in the red badge. A PRODUCER declares it; nothing infers it.
    if (kind != null && !KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join('/')}`);
    const rawDetail = typeof detail === 'string' ? (agentWords ? beltOf(detail.trim()) : detail.trim()) : '';   // agent-output-sinks: an agent's words only (AGENT_WORDS_ORIGINS; a fields item's detail was composed from belted fields)
    detail = rawDetail ? rawDetail.slice(0, DETAIL_MAX) : null;
    const detailCut = rawDetail.length > DETAIL_MAX ? DETAIL_MAX : 0;
    // the cut is named on the RETURNED record only (the ledger never carries it)
    const named = (o) => (arts.cut || fx.cut.length ? { ...o, ...(arts.cut ? { artifactsCut: arts.cut } : {}), ...(fx.cut.length ? { factsCut: fx.cut } : {}) } : o); // lane foryou-attachments: the attachments' cap, named the same way (r8: the facts' cuts too)
    const cut = (o) => (textCut || detailCut ? { ...named(o), ...(textCut ? { textCut } : {}), ...(detailCut ? { detailCut } : {}) } : named(o));
    // Idempotent BY TEXT across ALL statuses: re-filing an open question
    // refreshes it; re-filing a RESOLVED/DISMISSED one REOPENS the same item
    // (same id). Minting a fresh id per re-file would let an add→resolve loop
    // (or re-asserting a text the user dismissed) spam every client with
    // "new item" toasts despite the open cap — a stable id keeps re-assertion
    // possible while making it quiet.
    // (a CLEARED item's text is the one sentence every cleared item shares — never a re-file's match)
    // verify-r5 X1: A PRODUCER'S QUESTION IS NOBODY ELSE'S ITEM. The match was (sessionKey, text) alone, so an agent's
    // `vibespace-ask "<the exit ask's own text>" --detail "echo hello"` MERGED into exit-proxy's "run this command on
    // <machine>?" item and replaced its detail — the command the row and the For-you window show above Allow (r4 F4) —
    // while Allow ran the stored one (reproduced with a real click: the user read `echo hello`, the device ran the
    // payload); and exit-proxy's next ask of the same (conversation, machine) REOPENED the same item with a new askId
    // under the user's pointer (a press aimed at the first command answered the second). An item carrying an `action`
    // is matched only by a re-file of the same action type and the same identity (ACTION_IDENTITY); a filing with no
    // action never merges into one (it is filed beside it, without the producer's buttons)
    const sameFiling = (i) => {
      if (!i.action !== !action) return false;
      if (!action) return true;
      if (i.action.type !== action.type) return false;
      const idKey = ACTION_IDENTITY[action.type];
      return !idKey || i.action[idKey] === action[idKey];
    };
    // lane job-notify-user r3: an item that names its job's fact re-files by the FACT (jobId + jobFact), never by its
    // text; one that names none never merges into one that does (a job's copy is the job's)
    // lane ledger-dedup-law r6: A SERVER PRODUCER'S IDENTITY — an item filed with an `itemKey` (the growth alarm's (host id,
    // file)) is matched by (sessionKey, itemKey) alone, never by its words, and its id is derived from it (`_idOfKey`).
    // int361 (主开发's seam (a)): ONE identity predicate — by itemKey when the filing has one, else by jobId + jobFact when it
    // has a fact, else by text among items with neither key; every branch excludes a cleared item and a DECIDED decision row
    // (lane wake-approve-card r2: a re-file is a new question beside it, never its reopen)
    // text; one that names none never merges into one that does (a job's copy is the job's). r4: ONE identity predicate,
    // one branch per kind of identity — the shape a second identity (a producer's key, a decided row's finality) composes into
    // THE ONE IDENTITY (int361 seam, composed by meaning): by the producer's itemKey when the filing has one, else by (jobId, jobFact) when it names a fact, else by its words among items naming NEITHER — never a cleared item, never a DECIDED decision row (a re-file is a new item beside it)
    itemKey = typeof itemKey === 'string' && itemKey ? itemKey.slice(0, 300) : null;
    const sameCopy = (i) => (itemKey ? i.itemKey === itemKey : jobFact ? i.jobId === jobId && i.jobFact === jobFact && sameFiling(i) : i.text === text && sameFiling(i) && !i.itemKey && !i.jobFact);
    const existing = this._state.items.find((i) => i.sessionKey === sessionKey && sameCopy(i) && !i.clearedAt && !(i.status !== 'open' && isDecisionRow(i)));
    const openCount = this._state.items.filter((i) => i.sessionKey === sessionKey && i.status === 'open').length;
    // a SERVER producer whose open items its own domain bounds (one per account row) may raise the per-key cap; the agent
    // route never passes it (lane oat-identity-fix-r2, L1)
    const maxOpen = Number(openCap) > MAX_OPEN_PER_SESSION ? Math.min(Number(openCap), this._maxItems) : MAX_OPEN_PER_SESSION;
    if (existing) {
      // lane ledger-dedup-law r5: A DECISION IS FINAL — an item a PERSON decided (its producer's answer door wrote
      // `resolvedFact.decidedBy: 'person'` with the resolution, and no door re-stamped or reopened it since) is never
      // reopened by a re-file: a re-ask after a Deny is refused by the Deny, never a new filing (a hub act's re-file
      // reopened its denied item 3 s before the boot read the Deny back). Returned as it is, `decided: true`.
      if (existing.status !== 'open' && existing.resolvedFact && existing.resolvedFact.decidedBy === 'person') return cut({ ...existing, existing: true, decided: true });
      let changed = false;
      // lane decision-inbox-rank: an agent filing the SAME words (text, and the same detail or none) of an item still open
      // is a RE-ASK — counted (the tray's judge reads "re-asked N times"; the 48 h decay restarts at the last one); new
      // words are an edit (F2 below), and a server producer's periodic re-file is not an ask
      const reask = existing.status === 'open' && origin === 'agent' && (!detail || detail === existing.detail);
      if (existing.status !== 'open') {
        if (openCount >= maxOpen) throw Object.assign(new Error(`this session already has ${openCount} open items — resolve some before adding more`), { code: 'full', open: openCount });
        existing.status = 'open'; existing.resolvedAt = null; existing.resolvedBy = null;
        existing.createdAt = this._now();
        // a re-file of a resolved item is a NEW filing: its own expiry or none
        // (the old one is past — kept, it would expire the item on the next sweep)
        existing.expiresAt = expiresAt;
        existing.reply = null; // a re-filed ask is a NEW question: the last reply answered the old filing
        delete existing.judged; // inbox-verify F2: …and the judge's verdict judged the old filing
        delete existing.reasks; delete existing.reaskedAt; // lane decision-inbox-rank: a new filing has no re-asks yet
        changed = true;
      } else if (expiresAt && existing.expiresAt != null && expiresAt > existing.expiresAt) {
        // an OPEN item merges to the LATER end; one with no expiresAt is lasting
        // (it never expires) and a re-file never shortens that
        existing.expiresAt = expiresAt; changed = true;
      }
      if (reask) { existing.reasks = (Number(existing.reasks) || 0) + 1; existing.reaskedAt = this._now(); changed = true; }
      if (detail && detail !== existing.detail) { existing.detail = detail; delete existing.judged; changed = true; } // F2: new words, no old verdict
      if (urgency && urgency !== existing.urgency) { existing.urgency = urgency; changed = true; }
      if (kind && kind !== existing.kind) { existing.kind = kind; changed = true; }
      if (i18n && JSON.stringify(i18n) !== JSON.stringify(existing.i18n || null)) { existing.i18n = i18n; changed = true; }
      if ((itemKey || jobFact) && text !== existing.text) { existing.text = text; delete existing.judged; changed = true; }   // ledger r6 + r4 (composed): a fact item's words are not its identity — they follow its fields (the English text the agent CLI reads)
      if (action && JSON.stringify(action) !== JSON.stringify(existing.action || null)) { existing.action = action; changed = true; }
      if (card && JSON.stringify(card) !== JSON.stringify(existing.card || null)) { existing.card = card; changed = true; }
      if (facts && JSON.stringify(facts) !== JSON.stringify(existing.facts || null)) { existing.facts = facts; changed = true; }
      if (options && JSON.stringify(options) !== JSON.stringify(existing.options || null)) { existing.options = options; changed = true; } // a re-file WITH options replaces them; one without keeps the old set
      if (artifacts && JSON.stringify(artifacts) !== JSON.stringify(existing.artifacts || null)) { existing.artifacts = artifacts; changed = true; } // lane foryou-attachments: the same rule as options
      if (cwd && cwd !== existing.cwd) { existing.cwd = cwd; changed = true; }
      if (hostId && hostId !== existing.hostId) { existing.hostId = hostId; changed = true; }
      if (about && about !== existing.about) { existing.about = about; changed = true; } // lane chat-needs-you-card
      if (open && JSON.stringify(open) !== JSON.stringify(existing.open || null)) { existing.open = open; changed = true; } // lane foryou-plugin-notices: the door follows the latest filing (its prefill)
      // a DECLARED origin is kept (the item's producer does not change on a re-file);
      // an item filed before the field existed takes the re-filer's declaration
      if (!existing.origin) { existing.origin = origin; changed = true; }
      if (changed) { this._save(); this._notify(); }
      return cut({ ...existing, existing: true });
    }
    if (openCount >= maxOpen) throw Object.assign(new Error(`this session already has ${openCount} open items — resolve some before adding more`), { code: 'full', open: openCount });
    const item = {
      id: itemKey ? this._idOfKey(sessionKey, itemKey) : 'ut-' + crypto.randomBytes(5).toString('hex'),
      ...(itemKey ? { itemKey } : {}), // r6: the producer's identity (a re-file of the same key is this item, whatever it says)
      sessionKey, text, detail,
      urgency: urgency || 'normal',
      kind: kind || 'action',
      status: 'open', by,
      sessionName: sessionName || null, // display fallback frozen at file time
      jobId: jobId || null, // Background Work origin (2.348.1): lets the inbox jump STRAIGHT to the job's panel
      ...(jobFact ? { jobFact } : {}), // lane job-notify-user r3: which copy of the job it is (ask / fire / missed / parked / end:<state>:<cause>)
      i18n, // the words as structure, or null (an agent's own item is its own words)
      action, // what the item's button does ({type, …facts}), or null — a server producer's only
      ...(card ? { card } : {}), // design 009: the producer's VIEW the client draws the item from (an app install's one card)
      ...(facts ? { facts } : {}), // r7: the producer's FACTS the client words (the vault-run card) — `detail` stays the old clients' prose
      expiresAt, // ms epoch the item dies at (resolved 'expired' by expireDue), or null = lasting
      options, // the one-click answers (≤6 labels), or null — a chip's reply IS its label (design-user-inbox-reply D3a)
      ...(artifacts ? { artifacts } : {}), // lane foryou-attachments: what the agent asks the owner to open (chips → the one artifact door)
      ...(cwd ? { cwd } : {}), ...(hostId ? { hostId } : {}), // where its words' paths resolve (the asker's cwd on its host)
      ...(about ? { about } : {}), // lane chat-needs-you-card: the conversation it ADDRESSES (filed under a group key) — its chat draws the card
      ...(origin === 'plugin' ? { plugin } : {}), ...(open ? { open } : {}), // lane foryou-plugin-notices: WHICH plugin, and where a click on the item opens
      reply: null, // {text, at} once the user replied from the inbox (resolveByReply)
      origin, // the PRODUCER (B-328d): spend|login|pool|jobs|channels|browser|agent — REQUIRED (r2), the Notices area groups by it
      createdAt: this._now(), resolvedAt: null, resolvedBy: null,
    };
    this._state.items.push(item);
    this._save(); this._notify();
    return cut(item);
  }

  /** auto-resolve a job's open inbox items (2.350.0, owner report: "提交过了
   *  怎么不从inbox里消失" — answering an interaction panel must clear its
   *  needs-your-input entry). onlyAsk keeps completion/failure notices intact
   *  unless the whole job is being removed. */
  resolveByJob(jobId, { onlyAsk = true } = {}) {
    if (!jobId) return 0;
    let n = 0;
    const went = [];
    for (const it of this._state.items) {
      if (it.status !== 'open' || it.jobId !== jobId || decisionRefusal(it, 'done', 'agent')) continue;
      // the ask is told apart by its FACT (lane job-notify-user r3 — never its words: a name like rotate-db-password made
      // the r2 belt eat «needs», and the answered ask stayed open for good) — a CLEARED item keeps none of its words
      // (verify r3: an answered / expired / withdrawn panel must still close the job's cleared ask item)
      if (onlyAsk && !it.clearedAt && it.jobFact !== 'ask') continue;
      it.status = 'done'; it.resolvedAt = this._now(); it.resolvedBy = 'agent';
      n++; went.push(it);
    }
    if (n) { this._save(); this._notify(); this._emitStatus(went, 'agent'); }
    return n;
  }

  // status: 'done' (handled) | 'dismissed' (not going to) | 'open' (reopen)
  /** A producer's card moved (design 009: an install proposal's state — installing, done, failed, a new plan): the
   *  item's `card` replaced, nothing else (its status stays the producer's setStatus). A CLEARED item keeps nothing
   *  (Clear content… dropped its card). → true when it changed. */
  setCard(id, card) {
    const it = this.get(id);
    if (!it || it.clearedAt) return false;
    const c = normalizeCard(card);
    if (JSON.stringify(c) === JSON.stringify(it.card || null)) return false;
    if (c) it.card = c; else delete it.card;
    this._save(); this._notify();
    return true;
  }

  setStatus(id, status, by = 'user', { pressed = null } = {}) {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('/')}`);
    const item = this._state.items.find((i) => i.id === id);
    if (!item) throw new Error('item not found');
    const no = decisionRefusal(item, status, by);   // lane wake-approve-card r2: a decision row's two verbs only, and final
    if (no) throw decisionError(no);
    ({ status, by } = hideOf(item, status, by));   // r3: a pointer's close by the person is a hide
    const wasOpen = item.status === 'open';
    item.status = status;
    undecide(item); // r5: what resolves the item now is this door, not the person's decision
    // a reopen is the user saying it still matters: it no longer expires
    if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; if (!wasOpen) delete item.judged; } // F2: a reopen is judged again
    else { item.resolvedAt = this._now(); item.resolvedBy = by; }
    this._save(); this._notify();
    if (wasOpen && status !== 'open') this._emitStatus([item], by, false, { pressed });
    // verify-r6 W2: a REOPEN is said too — a producer whose question is over (an exit ask answered / expired) closes it
    // again at once instead of leaving dead buttons open until the next boot
    else if (!wasOpen && status === 'open') this._emitStatus([item], by);
    return item;
  }

  /** THE BATCH of setStatus (design-user-inbox-reply §4 d, chunk 4: "Mark all
   *  seen" on a group head — POST /api/user-todos/resolve-many). Every KNOWN id
   *  gets `status` with setStatus's exact semantics (an already-resolved one is
   *  re-stamped: a done item becomes dismissed); an unknown id is reported BY ID,
   *  never a throw — the rest of the batch still applies. ONE save + ONE
   *  broadcast for the whole batch (N setStatus calls would push N snapshots to
   *  every client). An invalid status throws by name before anything changes.
   *  A DECISION ROW is passed by (lane wake-approve-card r2): it stays until decided or expired — its id is listed in
   *  `decisions` (the page says «N decisions left for you»), never closed by a bulk verb.
   *  @returns {{changed: string[], unknown: string[], decisions: string[]}} */
  setStatusMany(ids, status, by = 'user') {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('/')}`);
    const changed = [], unknown = [], went = [], decisions = [];
    const now = this._now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { unknown.push(id); continue; }
      if (decisionRefusal(item, status, by)) { if (item.status === 'open') decisions.push(id); continue; }
      const h = hideOf(item, status, by);   // r3: «Mark all seen» HIDES a pointer (never «done»)
      const wasOpen = item.status === 'open';
      item.status = h.status;
      undecide(item); // lane ledger-dedup-law r5: as setStatus
      if (h.status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; if (!wasOpen) delete item.judged; } // F2: a reopen is judged again
      else { item.resolvedAt = now; item.resolvedBy = h.by; }
      changed.push(id);
      if (wasOpen && status !== 'open') went.push(item);
    }
    if (changed.length) { this._save(); this._notify(); this._emitStatus(went, by, true); }
    return { changed, unknown, decisions };
  }

  /** «Mark all read» on the notices (lane inbox-fyi-mark-all, the owner 2026-10-22: a notice asks nothing, so confirming
   *  them one by one is busywork). `read` true: every OPEN NOTICE among `ids` becomes done (resolvedBy `by`) — an id
   *  already resolved is left exactly as it is (`already`: the act is idempotent), an item that is not a notice is never
   *  touched (`refused`: an ask is answered on its own), an unknown id is reported. `read` false = THE UNDO: a notice
   *  this door resolved (done by `by`) comes back open AS IT WAS — its expiry and judgement kept, unlike a hand reopen;
   *  one another door resolved meanwhile (expired, withdrawn) stays resolved. ONE save + ONE broadcast however many
   *  went; the status listeners hear a batch. @returns {{changed: string[], already: string[], refused: string[], unknown: string[]}} */
  readNotices(ids, read = true, by = 'user') {
    const changed = [], already = [], refused = [], unknown = [], went = [];
    const now = this._now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { unknown.push(id); continue; }
      if (item.kind !== 'notice') { refused.push(id); continue; }
      if (read ? item.status !== 'open' : !(item.status === 'done' && item.resolvedBy === by)) { already.push(id); continue; }
      if (read) { item.status = 'done'; item.resolvedAt = now; item.resolvedBy = by; }
      else { item.status = 'open'; item.resolvedAt = null; item.resolvedBy = null; }
      changed.push(id); went.push(item);
    }
    if (changed.length) { this._save(); this._notify(); this._emitStatus(went, by, true); }
    return { changed, already, refused, unknown };
  }

  /** A PRODUCER'S ANSWER to its own OPEN items (lane exit-item-heal): each id still open becomes done with
   *  `resolvedBy: by` and `resolvedFact` = the fact that answered it, which the client words (an unexpected-exit
   *  item's `{resumedAt}` ⇒ "running again (resumed 16:16)"). An item the user already resolved or dismissed is left
   *  exactly as it is. ONE save + ONE broadcast; the status listeners hear it as they hear setStatus.
   *  @returns the ids resolved */
  resolveAnswered(ids, by, fact = null) {
    const went = [], restamped = [], now = this._now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      // lane wake-approve-card r3: a HIDDEN pointer was never answered — its producer's answer still lands on it (the
      // record then says what was decided, «approved by you · 09:41»), without a second leave-'open' event
      const hidden = !!item && isHidden(item);
      const end = item ? outcomeEnd(item, by, fact) : by;   // r8: a producer's outcome-in-the-fact settle, written as the ruled word
      if (!item || (item.status !== 'open' && !hidden)) continue;
      const no = decisionRefusal(item, 'done', end);
      if (no) { console.warn(`[user-todos] ${id}: a producer's settle (${String(by)}${fact && fact.outcome ? ` / ${String(fact.outcome)}` : ''}) is not one of its row's ends — the item stays open (${no.code})`); continue; }   // r8: said, never silent
      item.status = 'done'; item.resolvedAt = now; item.resolvedBy = end;
      if (fact) item.resolvedFact = end !== by ? { ...fact, ...(fact.outcome === 'late-allowed' ? { late: true } : {}) } : { ...fact };
      (hidden ? restamped : went).push(item);
    }
    if (went.length || restamped.length) { this._save(); this._notify(); if (went.length) this._emitStatus(went, by); }
    return [...went, ...restamped].map((i) => i.id);
  }

  /** lane wake-approve-card r6 (主开发: «a card's state follows the grant's life»): what happened AFTER a decision to what it
   *  GRANTED — its END (`{endedAt, endedBy}`: a lock, a revoke, its one use, its time, a restart) — merged into the record's
   *  `resolvedFact`; the decision itself (status, resolvedBy, decidedBy / decidedAt) is never touched, and the first end
   *  stands. ONE save + ONE broadcast. → whether it was written. */
  noteFact(id, patch) {
    const it = this.get(id);
    const endedAt = Number(patch && patch.endedAt);
    if (!it || it.status === 'open' || !Number.isFinite(endedAt) || endedAt <= 0) return false;
    const f = it.resolvedFact && typeof it.resolvedFact === 'object' ? it.resolvedFact : {};
    if (f.endedAt) return false;
    it.resolvedFact = { ...f, endedAt, endedBy: String((patch && patch.endedBy) || 'ended').slice(0, 20) };
    this._save(); this._notify();
    return true;
  }
  /** r6: the RESOLVED items of one action type (copies) — a producer reconciling the facts of what it decided (the vault's
   *  grants at boot: the grant rows are memory, a restart ended them). */
  resolvedOf(type) { return this._state.items.filter((i) => i.status !== 'open' && i.action && i.action.type === type).map((i) => ({ ...i })); }

  /** The user REPLIED to this item from the inbox and the reply reached the
   *  session (src/routes/user-todos-reply.js calls this only after the send
   *  succeeded). An OPEN item becomes done with `resolvedBy:'reply'`; an item
   *  already resolved or dismissed keeps its status and `resolvedBy` (a reply
   *  is refused for delivery reasons only, never bookkeeping) — either way the
   *  reply is kept on it as `{text ≤4000, at}`. ONE save + ONE broadcast. */
  resolveByReply(id, text, now = this._now()) {
    const item = this._state.items.find((i) => i.id === id);
    if (!item) throw new Error('item not found');
    item.reply = { text: String(text == null ? '' : text).slice(0, REPLY_MAX), at: now };
    const wasOpen = item.status === 'open' && !decisionRefusal(item, 'done', 'reply');   // lane wake-approve-card r2: a typed reply never decides
    if (wasOpen) { item.status = 'done'; item.resolvedAt = now; item.resolvedBy = 'reply'; }
    this._save(); this._notify();
    if (wasOpen) this._emitStatus([item], 'reply');
    return item;
  }

  /** One item of the caller's OWN session, whatever its status (`vibespace-ask
   *  show <id>`: the reply quote cuts a long detail and points here). */
  getForSession(keys, id) {
    const set = new Set(Array.isArray(keys) ? keys : [keys]);
    const it = this._state.items.find((i) => i.id === id);
    return it && set.has(it.sessionKey) ? it : null;
  }

  // Agent-side resolve by id OR unique text substring (its own session only).
  // An id of an item of this session that is ALREADY resolved (the user
  // replied from the inbox, or ticked it) is an idempotent no-op answering
  // the item as it is — the agent was told to resolve on an answer, and the
  // reply WAS the answer.
  resolveByAgent(sessionKey, ref) {
    ref = String(ref || '').trim();
    if (!ref) throw new Error('pass the item id or a unique text fragment');
    const done = this._state.items.find((i) => i.id === ref && i.sessionKey === sessionKey && i.status !== 'open');
    if (done) return done;
    const mine = this._state.items.filter((i) => i.sessionKey === sessionKey && i.status === 'open');
    let hit = mine.find((i) => i.id === ref);
    // verify-r5 X4 (lane-pairing): an item carrying a producer's `action` is a question VibeSpace put to the USER on the
    // agent's behalf (an exit ask's Allow / Deny) — the agent resolving it settled the ask "denied", and the chat card
    // told the user "you denied it" while the CLI told the agent "the user did not allow" (reproduced). Not the agent's
    // to resolve: by id it is refused by name; a text fragment never matches one
    if (hit && hit.action) throw Object.assign(new Error(`${hit.id} is a question VibeSpace asked the user for you — the user answers it with its own buttons; an agent cannot resolve it (to withdraw it, stop the command that is waiting for the answer)`), { code: 'not_agents' });
    if (!hit) {
      const matches = mine.filter((i) => !i.clearedAt && !i.action && i.text.toLowerCase().includes(ref.toLowerCase())); // a cleared item answers to its id only
      if (matches.length > 1) throw new Error(`"${ref}" matches ${matches.length} open items — be more specific or use the id`);
      hit = matches[0];
    }
    if (!hit) throw new Error(`no open item matching "${ref}" in this session`);
    return this.setStatus(hit.id, 'done', 'agent');
  }

  /**
   * "CLEAR CONTENT…" — THE door for For-you items (2026-09-28). Each id is asked
   * `allow(item)` (the caller's PURE clearVerdict) and cleared IN PLACE through
   * src/record-clear.js applyClear: the title becomes the ONE sentence; the
   * detail, the structured words (`i18n` — a client prefers them over `text`, so
   * keeping them would keep the old words on screen), the option chips and the
   * reply go; a Background-Work item's label (the job's name in `sessionName`)
   * goes too. Status, identity, times, session, origin and a producer's action
   * stay. The resolved PREVIEW is derived per snapshot (previewOf), so the ONE
   * save + ONE broadcast rewrites every client's copy — including a whole
   * detail a client kept (restoreDetails restores only into an item still
   * `detailTruncated`, which a cleared item never is). Returns
   * {cleared: [ids], already: [ids], unknown: [ids], refused: [{id, code, why, status}]}.
   */
  clearItems(ids, { by = 'owner', at = this._now(), allow = null } = {}) {
    const out = { cleared: [], already: [], unknown: [], refused: [] };
    for (const id of new Set(Array.isArray(ids) ? ids : [ids])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { out.unknown.push(String(id)); continue; }
      const v = allow ? allow(item) : { ok: true };
      if (!v || !v.ok) { out.refused.push({ id: item.id, code: (v && v.code) || 'not_yours', why: (v && v.why) || '', status: (v && v.status) || 403 }); continue; }
      const r = applyClear(item, { kind: 'todo', by, at });
      (r.changed ? out.cleared : out.already).push(item.id);
    }
    // ON DISK BEFORE THE OWNER IS TOLD (lane-redact verify r4, reproduced): this store's `_save` is a 500 ms debounce
    // and the exit flush runs on SIGTERM only — a SIGKILL / OOM inside that window brought the words back at the next
    // boot after the route had answered "cleared" and the dialog had said "cannot be undone". A clear is one owner
    // decision, rare, and small: ONE synchronous write (the stash's own rule, 2026-09-27 verify r3/r5).
    if (out.cleared.length) { this._save(); this.flush(); this._notify(); }
    return out;
  }

  /** r6: a keyed item's id — derived from (sessionKey, itemKey), the same shape as a minted one; the next derivation when an
   *  item holds it already (a CLEARED item of the same key keeps its id). */
  _idOfKey(sessionKey, itemKey) {
    for (let n = 0; ; n++) {
      const id = 'ut-' + crypto.createHash('sha256').update(`${sessionKey}\n${itemKey}${n ? `\n${n}` : ''}`).digest('hex').slice(0, 10);
      if (!this._state.items.some((i) => i.id === id)) return id;
    }
  }

  /** The ids of every item `pred` selects (a cleared JOB's items: `jobId` in the set). */
  idsWhere(pred) { return this._state.items.filter((i) => { try { return !!pred(i); } catch { return false; } }).map((i) => i.id); }

  // Move webui:<id> placeholder items onto the real sessionKey once known.
  rekey(fromKey, toKey) {
    if (fromKey === toKey) return;
    let changed = false;
    for (const i of this._state.items) {
      if (i.sessionKey === fromKey) { i.sessionKey = toKey; changed = true; }
      if (i.about === fromKey) { i.about = toKey; changed = true; } // lane chat-needs-you-card: the conversation it addresses moves with it
    }
    if (changed) { this._save(); this._notify(); }
  }
}

module.exports = { UserTodoManager, URGENCIES, EXPIRY_SWEEP_MS, RESOLVED_TAIL, RESOLVED_RECENT_MS, RESOLVED_SNAPSHOT_MAX, TEXT_MAX, DETAIL_MAX, DETAIL_PREVIEW, ARTIFACTS_MAX, previewOf, validExpiry, normalizeAction, normalizeArtifacts };
