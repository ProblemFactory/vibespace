'use strict';
/**
 * THE ACTION TRACE, THE RECORDING GATE AND THE HOUSEKEEPING DECISIONS — PURE
 * (imports only the sibling PURE registry model for the provider rows; CJS so
 * the server recorder, the routes, the CLI AND the bundle share ONE spelling
 * of every rule). Agent browser P5 — docs/design-agent-browser-v2.md §4.5,
 * §6.4, §7.1's capability cells, §8 step 3, D7 / D8 / D35.
 *
 * WHAT A TRACE ENTRY IS (D35, owner 2026-09-13): for every action the agent
 * SENDS, a before-JPEG and an after-JPEG, the action's POSITION (a click point
 * / the target element's box / the typed-into landing) and the COMMAND itself.
 * The recorder (src/server/browser-trace.js) listens to the stream server's
 * own `command` / `result` / `frame` records through the bridge — measured on
 * the installed 0.32.0 (2026-09-18, a real headless chromium through a real
 * stream socket):
 *   · `command`  = {type, id, action, params:{action, id, selector?, value?,
 *                   text?, key?, x?, y?, direction?, amount?, values?}, timestamp}
 *   · `result`   = {type, id, action, success, data, duration_ms, timestamp};
 *                   **`success` is `false` on EVERY result on 0.32.0, clicked
 *                   or not** — a result is judged by `error`, never by that flag
 *   · every CLI invocation is PRECEDED by a `launch` command/result pair
 *                   (`reused:true`) — not an action, filtered by the table
 *   · `get box <sel>` is the daemon's `boundingbox` action answering
 *                   `{x, y, width, height}` in CSS px — the ONE way the target
 *                   element's box is resolved, and an OBSERVATION never traced
 *   · frames carry `metadata.{deviceWidth, deviceHeight, pageScaleFactor,
 *                   scrollOffsetX/Y}` and a base64 JPEG in `data` — the metadata's
 *                   size is the stream server's CONFIGURED 1280×720, not the page
 *                   (lane J): an entry's frame size comes from `frameGeometry`
 *
 * WHAT IS NEVER STORED: a `fill`'s value and a `type`'s text — the §3.7 audit
 * rule ("the verb only, never a fill's content") applies to the trace too; the
 * entry keeps «N chars». There is NO redaction of the frames (design §12.9 says
 * so in as many words: "there is no redaction hook here" — a screenshot of a
 * logged-in page is a secret, which is why the trace has a RETENTION and the UI
 * says so, §6.4).
 *
 * RETENTION BY SIZE ONLY (the owner, 2026-09-27: "记录不要按照 7 天上限，而是按照容量，
 * 每个浏览器 profile 最多保留 1GB 记录"): per trace scope (a named profile; the
 * ephemeral scope counts as one) the records may take `TRACE_BYTES_PER_PROFILE`
 * = 1 GiB (the setting `browser.traceBytesPerProfile`, MB, floor 64); over it,
 * `traceSizePlan` removes the OLDEST SESSIONS' FRAMES first and keeps EVERY
 * action list (the replay can still say what happened). There is no age rule
 * here — a record is never removed for being old. The plan names, for every
 * frame it removes, the rule, and for every scope, what it holds. (The video
 * recordings keep their own bound: src/browser-recording-retention.js.)
 *
 * HOUSEKEEPING (§6.4 / §7.1 / §8 step 3 / D8): the sweep's scope is EXACTLY the
 * provider rows with `ownsDir: true` on this machine — `queueVerdict` refuses a
 * `cloud:*` / `local-window` / `cdp` / remote record by name (`not_ours`: that
 * directory is not ours to touch). Nothing is ever PROPOSED FOR DELETION
 * without an explicit human act: `housekeepingVerdict` lists (in-use / live /
 * recent / stale, each with its age) and never answers 'delete'; `forget`
 * ARCHIVES BEFORE IT REMOVES (the directory is RENAMED beside itself, the
 * record goes to a ledger); permanent deletion is its own route the user
 * clicks. A cookie jar is somebody's login.
 */
const B = require('./browser-profiles.js');

// ── constants ──────────────────────────────────────────────────────────────
/** 1 GiB of records per trace scope (the setting `browser.traceBytesPerProfile` in MB; `TRACE_BYTES_FLOOR` the least). */
const TRACE_BYTES_PER_PROFILE = 1024 * 1024 * 1024;
const TRACE_BYTES_FLOOR = 64 * 1024 * 1024;
const TRACE_BYTES_SETTING = 'browser.traceBytesPerProfile';
/** Frames per second the recorder asks the stream for when NO viewer watches
 *  (a "before" frame is then at most 250 ms stale). */
const TRACE_TAP_FPS = 4;
/** The after-frame is the first frame at least this long after the result … */
const AFTER_SETTLE_MS = 400;
/** lane trace-fits (2026-10-01, the owner: every resize / move of the live view was counted as an action and the Actions
 *  list was all "view fit" rows): a `viewer-fit` landing within this long of the previous fit of the SAME browser +
 *  scope, with no other traced action between, REPLACES it in the index (`fitCoalesceVerdict` / `coalesceFits`) — one
 *  row per run of re-fits (a drag, a snap, a desktop switch), the reflow between two agent actions still its own row. */
const FIT_COALESCE_MS = 10 * 1000;
/** The live view's own re-fit as the bridge taps it (src/server/browser-stream.js tapOwnSet) — the ONE action name the
 *  fold reads; the agent's own `viewport` verb is an untraced observation and never one of these. */
const FIT_ACTION = 'viewer-fit';
/** … or, failing one by then, the latest frame seen (marked `afterSame` when
 *  it is the before-frame itself — a page that did not repaint). */
const AFTER_MAX_MS = 1500;
const BOX_PROBE_TIMEOUT_MS = 1500;
const PENDING_CAP = 20;
const FRAME_RING = 8;
/** §1.3: recording (`record start`, 30 fps via Page.startScreencast) needs ≥ 0.37.0. */
const RECORDING_FLOOR = require('./browser-verbs.js').AGENT_BROWSER_CLI.recordingFloor; // the one version row
const RECORDING_DIR = 'browser-recordings';
const TRACE_DIR = 'browser-trace';
const FORGOTTEN_FILE = 'browser-forgotten.json';
const STALE_PROFILE_DAYS = 30;
/** A directory written within this window may be in flight — spared, with its age. */
const INFLIGHT_GRACE_MS = 10 * 60 * 1000;
/** A Chromium user-data-dir carries one of these at its top level. */
const PROFILE_MARKERS = Object.freeze(['Default', 'Local State']);
const FORGOTTEN_SUFFIX = '.forgotten-';
const ENTRY_ID_RE = /^tr-[0-9a-f]{12}$/;
const EPHEMERAL_SCOPE = 'ephemeral';

// ── the action table ───────────────────────────────────────────────────────
/** action name → the KIND of position an entry records. Anything not here is
 *  an OBSERVATION (snapshot / get / is / screenshot / wait / launch / stream /
 *  session / boundingbox …) and is never traced — a trace of every `get text`
 *  would be a trace of nothing. */
const TRACED_ACTIONS = Object.freeze({
  click: 'target', dblclick: 'target', focus: 'target', fill: 'target', type: 'target', hover: 'target', check: 'target', uncheck: 'target',
  select: 'target', scrollintoview: 'target', upload: 'target', drag: 'target',
  press: 'keys', keydown: 'keys', keyup: 'keys',
  mousemove: 'point', mousedown: 'point', mouseup: 'point', mousewheel: 'point', mouseclick: 'point',
  scroll: 'scroll',
  navigate: 'navigation', open: 'navigation', goto: 'navigation', back: 'navigation', forward: 'navigation', reload: 'navigation', pushstate: 'navigation',
  // lane S4 verify r1 F6: the LIVE VIEW's own resize of the page (the bridge's `set viewport` for a pane, the restore, the
  // agent's own size put back) — a name the daemon never mirrors (its verb is `viewport`); only the bridge taps it, so
  // an agent's clicks before and after a reflow are told apart in the trace
  'viewer-fit': 'viewport',
});
/** The kind for an action name, or null for an observation / unknown. */
function classifyAction(action) {
  const a = String(action || '').toLowerCase();
  if (TRACED_ACTIONS[a]) return TRACED_ACTIONS[a];
  // the daemon spells mouse verbs `mouse<kind>` (measured: `mousemove`) — a
  // point action when it carries coordinates, else an input we still record
  if (/^mouse[a-z]+$/.test(a)) return 'point';
  return null;
}
/** Is this `command` record one the trace records? (a `launch` pair precedes every CLI call — never). */
function isTracedCommand(msg) {
  return !!(msg && msg.type === 'command' && typeof msg.id === 'string' && classifyAction(msg.action));
}
/** The selector / ref a target action names (`@e1`, `#b`, or the drag's source). */
function selectorOf(params) {
  const p = params && typeof params === 'object' ? params : {};
  for (const k of ['selector', 'ref', 'target', 'source', 'from']) if (typeof p[k] === 'string' && p[k]) return p[k];
  return null;
}
/** The params an entry KEEPS — the secret-bearing ones replaced by their length. */
/** BROWSE YOURSELF verify r1 (H2): a URL's credentials (`scheme://user:pass@host`) never reach the trace — the user's
 *  address row and an agent's `open` both carry what was typed; the host, path and query stay (what the page WAS). */
function withoutUserinfo(v) { return typeof v === 'string' ? v.replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/?#@\s]*@/g, '$1') : v; }
/** BROWSE YOURSELF verify r2 (#7, r1's HELD query secrets re-judged: cut): a URL whose query (or fragment) NAMES a
 *  credential-shaped key — `code` / `state`-bearing OAuth redirects (`?code=`), a magic link's `?token=`, the implicit
 *  flow's `#access_token=`, a presigned `X-Amz-Signature` / `X-Amz-Credential`, `?session=` / `?sid=`, an `apiKey` — keeps
 *  its scheme, host and path (what the page WAS) and loses the whole query (fragment) as `?«cut»` (`#«cut»`), for EVERY
 *  navigation (an agent's too): an allowlist-free rule by the key's WORDS (split at _ - . and camelCase), so `postcode`,
 *  `keyword` or `passthrough` are not keys of that shape; a query without one stays whole. Then the userinfo cut. */
const CREDENTIAL_WORDS = new Set(['token', 'code', 'secret', 'password', 'passwd', 'pwd', 'pass', 'passcode', 'apikey', 'key', 'auth', 'authorization', 'session', 'sessionid', 'sid', 'sig', 'signature', 'credential', 'credentials', 'otp', 'ticket', 'jwt', 'assertion', 'samlresponse', 'samlrequest']);
function credentialKey(k) {
  let key = String(k || '');
  try { key = decodeURIComponent(key.replace(/\+/g, ' ')); } catch { /* keep the raw name */ }
  return key.split(/[_\-.\s]+|(?<=[a-z0-9])(?=[A-Z])/).some((w) => CREDENTIAL_WORDS.has(w.toLowerCase()));
}
/** verify r3 (#6): a VALUE that is itself an address naming a credential-shaped key — a redirector's `?url=` / `?continue=` /
 *  `?next=` carrying a magic link or an OAuth callback percent-encoded (an email click-tracker, an SSO hop) — names one too:
 *  decoded once per level, two levels deep, 4 KiB of value at most (bounded before any parse); a value that is no address
 *  (`?next=%2Fhome`) or one that names none stays. */
const namesCredential = (q, depth = 0) => String(q || '').split(/[&;]/).some((part) => {
  if (!part) return false;
  const eq = part.indexOf('=');
  if (credentialKey(eq >= 0 ? part.slice(0, eq) : part)) return true;
  if (eq < 0 || depth >= 2) return false;
  let v = part.slice(eq + 1, eq + 1 + 4096);
  try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { return false; }
  const qi = v.indexOf('?'), hi = v.indexOf('#');
  if (qi < 0 && hi < 0) return false;
  const inQ = qi >= 0 ? v.slice(qi + 1, hi > qi ? hi : v.length) : '', inF = hi >= 0 ? v.slice(hi + 1) : '';
  return (!!inQ && namesCredential(inQ, depth + 1)) || (!!inF && namesCredential(inF, depth + 1));
});
function cutSecretQuery(u) {
  const hi = u.indexOf('#'), qi = u.indexOf('?');
  const hasQ = qi >= 0 && (hi < 0 || qi < hi);
  const query = hasQ ? u.slice(qi + 1, hi >= 0 ? hi : u.length) : '';
  const frag = hi >= 0 ? u.slice(hi + 1) : '';
  const cq = !!query && namesCredential(query), cf = !!frag && namesCredential(frag);
  if (!cq && !cf) return u;
  const base = u.slice(0, hasQ ? qi : (hi >= 0 ? hi : u.length));
  return base + (hasQ ? (cq ? '?«cut»' : '?' + query) : '') + (hi >= 0 ? (cf ? '#«cut»' : '#' + frag) : '');
}
function withoutUrlSecrets(v) { return typeof v === 'string' ? withoutUserinfo(v.replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, (m) => cutSecretQuery(m))) : v; }
function redactParams(action, params) {
  const p = params && typeof params === 'object' ? params : {};
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'id' || k === 'action') continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') { out[k] = Array.isArray(v) ? v.map((x) => withoutUrlSecrets(String(x)).slice(0, 200)) : '{…}'; continue; }
    out[k] = typeof v === 'string' ? withoutUrlSecrets(v).slice(0, 500) : v;
  }
  const a = String(action || '').toLowerCase();
  if (a === 'fill' && typeof p.value === 'string') out.value = `«${[...p.value].length} chars»`;
  if (a === 'type' && typeof p.text === 'string') out.text = `«${[...p.text].length} chars»`;
  if (a === 'upload' && Array.isArray(p.files)) out.files = p.files.map((f) => String(f).split('/').pop());
  // D35 CLOSES THE SIDE DOORS (2026-09-21): a secret typed key-by-key (`press h`, `press u`, …)
  // or chosen from a list is content too — a single-character key becomes «1 key» (a named
  // key such as Enter or Tab stays: it is a gesture, not content), a select's value/label its length
  if (classifyAction(a) === 'keys') for (const k of Object.keys(out)) if (typeof p[k] === 'string' && [...p[k]].length === 1) out[k] = '«1 key»';
  if (a === 'select') for (const k of ['value', 'values', 'label', 'option']) { if (typeof p[k] === 'string') out[k] = `«${[...p[k]].length} chars»`; else if (Array.isArray(p[k])) out[k] = `«${p[k].length} values»`; }
  return out;
}
/** The command as a human reads it — rebuilt from the REDACTED params. */
function commandText(action, redacted) {
  const a = String(action || '');
  const r = redacted && typeof redacted === 'object' ? redacted : {};
  // verify r1 F6: the live view's own resize is never spelled as an agent command
  if (a === 'viewer-fit') return `live view: set ${r.device ? `device ${r.device}` : `viewport ${r.width} ${r.height}`}${r.why ? ` (${r.why})` : ''}`;
  const parts = ['agent-browser', a];
  const sel = selectorOf(r);
  if (sel) parts.push(sel);
  if (r.target && r.target !== sel) parts.push(String(r.target));
  if (r.url) parts.push(String(r.url));
  if (r.value !== undefined) parts.push(String(r.value));
  if (r.text !== undefined) parts.push(String(r.text));
  if (r.key !== undefined) parts.push(String(r.key));
  if (r.values !== undefined) parts.push(Array.isArray(r.values) ? r.values.join(' ') : String(r.values));
  if (r.direction !== undefined) parts.push(String(r.direction));
  if (r.amount !== undefined) parts.push(String(r.amount));
  if (Number.isFinite(r.x) && Number.isFinite(r.y)) parts.push(String(r.x), String(r.y));
  if (Array.isArray(r.files)) parts.push(...r.files);
  return parts.join(' ');
}
/** The POSITION an entry records: a point (CSS px), a target with its box (or
 *  without one, saying why), the keys, a scroll, a navigation. */
function positionOf({ kind, params, box = null, boxWhy = null } = {}) {
  const p = params && typeof params === 'object' ? params : {};
  if (kind === 'point') return Number.isFinite(p.x) && Number.isFinite(p.y) ? { kind: 'point', x: Number(p.x), y: Number(p.y) } : { kind: 'input', why: 'no coordinates in the command' };
  if (kind === 'target') {
    const selector = selectorOf(p);
    if (box && Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height)) return { kind: 'box', selector, box: { x: Number(box.x), y: Number(box.y), width: Number(box.width), height: Number(box.height) } };
    return { kind: 'target', selector, box: null, why: boxWhy || 'the element box was not resolved' };
  }
  if (kind === 'keys') return { kind: 'keys', keys: String(p.key || p.keys || '') };
  if (kind === 'scroll') return { kind: 'scroll', direction: String(p.direction || 'down'), amount: Number(p.amount) || 0 };
  if (kind === 'navigation') return { kind: 'navigation', url: typeof p.url === 'string' ? p.url.slice(0, 2000) : null };
  if (kind === 'viewport') return p.device ? { kind: 'viewport', device: String(p.device).slice(0, 80), why: String(p.why || '') } : { kind: 'viewport', width: Math.round(Number(p.width) || 0), height: Math.round(Number(p.height) || 0), why: String(p.why || '') };
  return { kind: 'input', why: 'unknown action kind' };
}
/** A result is judged by its ERROR, never by `success` (measured: false on every 0.32.0 result). */
function resultOk(result) {
  if (!result) return null;
  if (result.error) return false;
  if (result.data && typeof result.data === 'object' && result.data.error) return false;
  return true;
}
function resultError(result) {
  if (!result) return null;
  if (typeof result.error === 'string') return result.error.slice(0, 500);
  if (result.error && typeof result.error === 'object' && result.error.message) return String(result.error.message).slice(0, 500);
  if (result.data && typeof result.data === 'object' && result.data.error) return String(result.data.error).slice(0, 500);
  return null;
}
/** What an entry keeps of a frame record (never the bytes — those are a file).
 *  `w/h` = the PAGE's CSS size the frame shows — the space every position is in
 *  (`overlayGeometry` scales by it). `page` = the recorder's `{cssW, cssH}` from
 *  src/browser-stream.js frameGeometry (lane J: the stream's metadata claims the
 *  configured 1280×720 whatever the page is — 1280×577 headless — so a dot drawn
 *  by the claim sat 720/577 too high); absent, the metadata stands. */
function frameMeta(frameMsg, page = null) {
  const md = (frameMsg && frameMsg.metadata) || {};
  const pw = page && Number(page.cssW) > 0 && Number(page.cssH) > 0 ? page : null;
  return { w: pw ? Number(pw.cssW) : Number(md.deviceWidth) || 0, h: pw ? Number(pw.cssH) : Number(md.deviceHeight) || 0, scale: Number(md.pageScaleFactor) || 1, scrollX: Number(md.scrollOffsetX) || 0, scrollY: Number(md.scrollOffsetY) || 0, seq: Number.isFinite(frameMsg && frameMsg.seq) ? frameMsg.seq : null };
}
/** The box a probe answered (`boundingbox` data), or null. */
function boxFromProbe(json) {
  const d = json && json.data && typeof json.data === 'object' ? json.data : null;
  if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.width) || !Number.isFinite(d.height)) return null;
  return { x: d.x, y: d.y, width: d.width, height: d.height };
}
/**
 * WHICH frame is the after-frame. `frames` = the frames seen since the result
 * (each `{at, seq}`), `beforeSeq` the before-frame's seq. Answers
 *   {pick:'frame', index}        the first frame ≥ AFTER_SETTLE_MS after the result
 *   {pick:'latest', index, same} past AFTER_MAX_MS with no settled frame — the latest one (same = it IS the before-frame, nothing repainted)
 *   {pick:'wait'}                keep listening
 */
function afterFramePick({ resultAt, frames = [], beforeSeq = null, now, settleMs = AFTER_SETTLE_MS, maxMs = AFTER_MAX_MS } = {}) {
  const t0 = Number(resultAt) || 0;
  for (let i = 0; i < frames.length; i++) if ((Number(frames[i].at) || 0) >= t0 + settleMs) return { pick: 'frame', index: i };
  if ((Number(now) || 0) >= t0 + maxMs) {
    if (!frames.length) return { pick: 'latest', index: -1, same: true };
    const i = frames.length - 1;
    return { pick: 'latest', index: i, same: beforeSeq !== null && frames[i].seq === beforeSeq };
  }
  return { pick: 'wait' };
}
/** The record. `before` / `after` are `{file, bytes, ...frameMeta, at}` or null. */
function entryFor({ id, at, sessionId = null, browserKey = null, profileId = null, browserSession = null, command, result = null, position, before = null, after = null, afterSame = false, url = null, holder = null, job = null } = {}) {
  const action = String(command && command.action || '');
  const params = redactParams(action, command && command.params);
  // BROWSE YOURSELF (B-6ae8, the owner 3): the USER's own act (his browsing window's input, or a command of his address row)
  // — recorded like an agent's, said as his (`you: click 120 340`), never a conversation's (no webui session id)
  const human = holder === 'user';
  return {
    ...(human ? { holder: 'user' } : {}),
    // lane trace-fits: a fit carries its run's count and last instant (1 and its own `at` until a later fit is folded in)
    ...(action === FIT_ACTION ? { n: 1, lastAt: Number(at) || 0 } : {}),
    // lane jobs-browser: an action a Background Work job took as its conversation names the JOB BY ID (its name is read live)
    ...(!human && typeof job === 'string' && /^jb-[0-9a-f]{4,16}$/.test(job) ? { job } : {}),
    id: String(id), at: Number(at) || 0, sessionId: human ? null : (sessionId || null), browserKey: browserKey || null, profileId: profileId || null,
    // the browser SESSION this action belongs to (`bs-…`, src/browser-sessions.js) — null only for a pre-session record
    browserSession: /^bs-[0-9a-f]{8}$/.test(String(browserSession || '')) ? browserSession : null,
    scope: profileId || EPHEMERAL_SCOPE,
    action, kind: classifyAction(action) || 'input', text: human ? commandText(action, params).replace(/^agent-browser /, 'you: ') : commandText(action, params), params,
    ok: resultOk(result), error: withoutUrlSecrets(resultError(result)), durationMs: result && Number.isFinite(result.duration_ms) ? result.duration_ms : null,
    // (a navigation's position names its URL — cut like the params': verify r1 H2, the byte census found it)
    position: position ? (typeof position.url === 'string' ? { ...position, url: withoutUrlSecrets(position.url) } : position) : { kind: 'input', why: 'no position' },
    before: before ? { ...before } : null, after: after ? { ...after } : null, afterSame: !!afterSame,
    // (the page URL the entry names — its credentials cut like the params': verify r1 H2)
    url: typeof url === 'string' ? withoutUrlSecrets(url).slice(0, 2000) : null,
  };
}
function isEntryId(v) { return ENTRY_ID_RE.test(String(v || '')); }
function mintEntryId(hex12) { return 'tr-' + String(hex12 || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 12).padEnd(12, '0'); }

// ── lane trace-fits (2026-10-01): the page-size fold ──
/** Is this entry the live view's own re-fit? (only `viewer-fit` — never the agent's `viewport` verb, never a click) */
function isFitEntry(e) { return !!e && String(e.action || '') === FIT_ACTION; }
/** How many re-fits an entry stands for (a coalesced run counts every fit folded into it); 0 for an agent action. */
function fitCount(e) { return isFitEntry(e) ? Math.max(1, Math.round(Number(e.n)) || 1) : 0; }
const scopeOfEntry = (e) => (e && (e.scope || e.profileId)) || EPHEMERAL_SCOPE;
/**
 * F1 — THE COALESCE VERDICT. `prev` = the tap's last written fit (its run), `next` = the fit landing now, `between` =
 * a traced action that landed between them (null = none), `now` = the instant `next` landed (its `at`). Answers
 * {coalesce, why}: the same browser + scope within `coalesceMs` of the run's LAST fit (`lastAt`, so a long drag stays
 * one row) with nothing traced between ⇒ the new fit REPLACES the run; anything else ⇒ a new run. Every refusal is named.
 */
function fitCoalesceVerdict(prev, next, { now = null, between = null, coalesceMs = FIT_COALESCE_MS } = {}) {
  if (!next || !isFitEntry(next)) return { coalesce: false, why: 'not a fit' };
  if (!prev) return { coalesce: false, why: 'no previous fit' };
  if (!isFitEntry(prev)) return { coalesce: false, why: `the previous action is ${prev.action || 'not a fit'}` };
  if (between && between.action !== FIT_ACTION) return { coalesce: false, why: `another action between (${between.action})` };
  if ((prev.browserKey || null) !== (next.browserKey || null)) return { coalesce: false, why: 'another browser' };
  if (scopeOfEntry(prev) !== scopeOfEntry(next)) return { coalesce: false, why: 'another scope' };
  const at = now !== null && now !== undefined && Number.isFinite(Number(now)) ? Number(now) : Number(next.at) || 0;
  const since = at - (Number(prev.lastAt) || Number(prev.at) || 0);
  if (since < 0) return { coalesce: false, why: 'out of order' };
  if (since > coalesceMs) return { coalesce: false, why: `${Math.round(since / 1000)} s since the last fit (> ${Math.round(coalesceMs / 1000)} s)` };
  return { coalesce: true, why: `within ${Math.round(coalesceMs / 1000)} s of the last fit` };
}
/**
 * F1 — THE MERGE: the run keeps its FIRST id / at / before frame / session, takes the LAST fit's geometry, text, result and
 * after frame (the run's own when the new fit brought none), counts every fit (`n`) and stamps `lastAt`. PURE — the
 * recorder owns the files (the superseded after frame is unlinked there, at once).
 */
function coalesceFits(prev, next) {
  const p = prev || {}, q = next || {};
  const after = q.after && q.after.file ? { ...q.after } : (p.after ? { ...p.after } : null);
  return {
    ...q,
    id: p.id, at: Number(p.at) || 0, lastAt: Number(q.lastAt) || Number(q.at) || 0, n: fitCount(p) + fitCount(q),
    before: p.before ? { ...p.before } : null, after,
    afterSame: q.after && q.after.file ? false : !!p.afterSame,
    sessionId: p.sessionId || q.sessionId || null, browserSession: p.browserSession || q.browserSession || null,
  };
}
/**
 * F2 — THE FOLD every list draws: an agent action is its own row `{kind:'entry', id, entry, fit:false}`; CONSECUTIVE
 * fits fold into ONE row `{kind:'fits', id: the first's, entries, n, at, lastAt, last, failed}` (a click between
 * keeps two runs apart). `expand` = the toggle: every fit its own row, marked `fit: true`.
 */
function foldFits(entries, { expand = false } = {}) {
  const rows = [];
  let run = null;
  for (const e of entries || []) {
    if (!e) continue;
    if (!isFitEntry(e) || expand) { run = null; rows.push({ kind: 'entry', id: e.id, entry: e, fit: isFitEntry(e) }); continue; }
    const last = Number(e.lastAt) || Number(e.at) || 0;
    if (run) { run.entries.push(e); run.n += fitCount(e); run.lastAt = Math.max(run.lastAt, last); run.last = e; if (e.ok === false) run.failed++; }
    else { run = { kind: 'fits', id: e.id, entries: [e], n: fitCount(e), at: Number(e.at) || 0, lastAt: last, last: e, failed: e.ok === false ? 1 : 0 }; rows.push(run); }
  }
  return rows;
}
/** The entries a folded list lets a person open: every agent action, and the LAST fit of each run. */
function visibleEntries(rows) { return (rows || []).map((r) => (r && r.kind === 'fits' ? r.last : r && r.entry)).filter(Boolean); }
/** The one-line label the timeline strip and the CLI print. */
function timelineLabel(entry) {
  const e = entry || {};
  const r = e.params || {};
  const sel = selectorOf(r);
  const bits = [e.action || '?'];
  if (sel) bits.push(sel);
  else if (e.position && e.position.kind === 'point') bits.push(`${e.position.x},${e.position.y}`);
  else if (e.position && e.position.kind === 'keys' && e.position.keys) bits.push(e.position.keys);
  else if (e.position && e.position.kind === 'navigation' && e.position.url) bits.push(e.position.url.slice(0, 60));
  else if (e.position && e.position.kind === 'scroll') bits.push(`${e.position.direction} ${e.position.amount}`);
  else if (e.position && e.position.kind === 'viewport') bits.push(e.position.device || `${e.position.width}×${e.position.height}`);
  return bits.join(' ') + (e.ok === false ? ' ✗' : '');
}
/** The tool card's window: the tool call's own ts back 2 s, forward to the next message (+2 s) or now. */
function traceWindowFor({ ts, nextTs = null, now } = {}) {
  const t = Number(ts) || 0;
  const n = Number(nextTs) || 0;
  return { from: Math.max(0, t - 2000), to: n > t ? n + 2000 : Math.max(t + 2000, Number(now) || 0) };
}
/** VERIFY r2 L5: the recorder's `browser-trace-status` arm_failed {at, until, error} covers a card's window when the
 *  window overlaps [at, until] — the card with no entries then says WHY ("not recorded until <t>: <why>"); anything
 *  else (no status, `armed`, a window outside the gap) is null. */
function armGapFor(win, status) {
  if (!win || !status || status.code !== 'arm_failed') return null;
  const at = Number(status.at) || 0, until = Number(status.until) || 0;
  if (!(until > at) || !(Number(win.to) >= at) || !(Number(win.from) <= until)) return null;
  return { at, until, error: String(status.error || '') };
}
/** Does a shell tool call's command drive the agent browser? (the tool card gates its entry on this) */
function commandDrivesBrowser(cmd) { return /(^|[\s;&|(`])(agent-browser|vibespace-browser)(\s|$)/.test(String(cmd || '')); }
function entriesInWindow(entries, { sessionId = null, from = 0, to = Infinity, profileId = undefined } = {}) {
  return (entries || []).filter((e) => e && (!sessionId || e.sessionId === sessionId) && e.at >= from && e.at <= to && (profileId === undefined || (e.profileId || null) === (profileId || null)));
}
/** The overlay's geometry in the DRAWN picture's CSS px: a dot or a rect, or null when nothing can be drawn. */
function overlayGeometry({ position, frame, drawn } = {}) {
  const f = frame || {}; const d = drawn || {};
  if (!position || !f.w || !f.h || !d.width || !d.height) return null;
  const sx = d.width / f.w, sy = d.height / f.h;
  const scale = Number(f.scale) || 1;
  if (position.kind === 'point') return { shape: 'dot', left: d.left + (position.x * scale - (f.scrollX || 0)) * sx, top: d.top + (position.y * scale - (f.scrollY || 0)) * sy };
  if (position.kind === 'box' && position.box) { const b = position.box; return { shape: 'rect', left: d.left + (b.x * scale) * sx, top: d.top + (b.y * scale) * sy, width: Math.max(2, b.width * scale * sx), height: Math.max(2, b.height * scale * sy) }; }
  return null;
}

// ── retention: BY SIZE ONLY ──
/** The per-scope limit in bytes from the setting's MB (default 1 GiB, never below the 64 MB floor). */
function traceBytesLimit(settingMb) {
  const n = Number(settingMb);
  if (settingMb === undefined || settingMb === null || settingMb === '' || !Number.isFinite(n) || n <= 0) return TRACE_BYTES_PER_PROFILE;
  return Math.max(TRACE_BYTES_FLOOR, Math.round(n) * 1048576);
}
/** An entry's FRAME bytes — each distinct file once (an `afterSame` after IS the before file). */
function entryFrameBytes(e) {
  if (!e) return 0;
  const seen = new Set(); let n = 0;
  for (const f of [e.before, e.after]) { if (!f || !f.file || seen.has(f.file)) continue; seen.add(f.file); n += Number(f.bytes) || 0; }
  return n;
}
/** An entry's LIST bytes — its index line (what the sweep never removes). */
function entryListBytes(e) { try { return JSON.stringify(e).length + 1; } catch { return 600; } }
/**
 * THE SWEEP'S PLAN (`scopes` = [{key, sessions:[{id, startAt, open, entries:[{id, at, frameBytes, listBytes}]}]}]):
 * a scope over `bytesPerScope` loses the FRAMES of its OLDEST sessions first — every frame of a closed session, oldest
 * session first; only when every closed session is bare, the open sessions' oldest frames one action at a time (the
 * newest stay) — and NEVER an action list. Every removal names its rule; every scope says what it holds and by how
 * much it is still over when its lists alone exceed the limit. No age rule: an old record under the limit stays.
 */
function traceSizePlan({ scopes = [], bytesPerScope = TRACE_BYTES_PER_PROFILE } = {}) {
  const limit = Number(bytesPerScope) > 0 ? Number(bytesPerScope) : TRACE_BYTES_PER_PROFILE;
  const mb = Math.round(limit / 1048576);
  const removeFrames = [], kept = [];
  for (const sc of scopes || []) {
    const key = String(sc.key || '');
    const sessions = [...(sc.sessions || [])].filter(Boolean).map((s) => ({ ...s, entries: [...(s.entries || [])].filter((e) => e && e.id).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0)) }));
    let frames = 0, lists = 0, fitFrames = 0;
    for (const s of sessions) for (const e of s.entries) { frames += Number(e.frameBytes) || 0; lists += Number(e.listBytes) || 0; if (e.fit) fitFrames += Number(e.frameBytes) || 0; }
    const taken = new Set();
    // F3: page-size frames go FIRST (lane trace-fits): over the limit, the frames of the live view's own re-fits — oldest
    // fit first, whatever session holds it — go before any agent action's frame, so a fit storm never crowds the agent's
    // actions out of the limit; their action lists stay like every other
    const fitsFirst = sessions.flatMap((s) => s.entries.filter((e) => e.fit && (Number(e.frameBytes) || 0) > 0).map((e) => ({ s, e }))).sort((a, b) => (Number(a.e.at) || 0) - (Number(b.e.at) || 0));
    for (const { s, e } of fitsFirst) {
      if (frames + lists <= limit) break;
      const b = Number(e.frameBytes) || 0;
      removeFrames.push({ key, id: e.id, session: s.id || null, bytes: b, fit: true, why: `over ${mb} MB for this profile — page-size frames go first; its action list is kept` });
      frames -= b; fitFrames -= b; taken.add(e.id);
    }
    const order = [...sessions.filter((s) => !s.open), ...sessions.filter((s) => s.open)].map((s, i) => ({ s, i }))
      .sort((a, b) => (a.s.open === b.s.open ? 0 : a.s.open ? 1 : -1) || (Number(a.s.startAt) || 0) - (Number(b.s.startAt) || 0) || a.i - b.i).map((x) => x.s);
    for (const s of order) {
      if (frames + lists <= limit) break;
      for (const e of s.entries) {
        const b = Number(e.frameBytes) || 0;
        if (!b || taken.has(e.id)) continue;
        if (s.open && frames + lists <= limit) break;
        removeFrames.push({ key, id: e.id, session: s.id || null, bytes: b, why: `over ${mb} MB for this profile — the oldest session's frames go first; its action list is kept` });
        frames -= b; if (e.fit) fitFrames -= b;
      }
    }
    const used = frames + lists;
    kept.push({ key, used, frameBytes: frames, listBytes: lists, fitFrameBytes: fitFrames, limit, overBy: Math.max(0, used - limit), why: used > limit ? `the action lists alone take ${Math.round(lists / 1048576)} MB of ${mb} MB — every frame is gone, the lists stay` : `${Math.round(used / 1048576)} MB of ${mb} MB` });
  }
  return { removeFrames, kept, bytesRemoved: removeFrames.reduce((n, r) => n + r.bytes, 0) };
}

// ── recording (D7: opt-in per profile) ─────────────────────────────────────
/** May a recording start for this profile on this build? */
function recordingVerdict({ version, profile, rowOf = B.providerRow } = {}) {
  if (!profile) return { ok: false, code: 'not-found', error: 'no profile' };
  if (!profile.record) return { ok: false, code: 'recording_off', error: `recording is off for "${profile.label}" (per-profile opt-in)` };
  const row = rowOf(profile.provider) || {};
  if (!row.starts) return { ok: false, code: 'recording_not_ours', error: `"${profile.label}" is a browser nobody of ours starts (${profile.provider}) — there is no daemon to record with` };
  if (profile.host) return { ok: false, code: 'recording_not_local', error: `"${profile.label}" runs on ${profile.host} — recording is local-only in this release` };
  if (version === undefined || version === null) return { ok: false, code: 'recording_floor', error: `the installed agent-browser version is unknown — recording needs ≥ ${RECORDING_FLOOR}` };
  const v = B.parseVersion(String(version));
  if (!v) return { ok: false, code: 'recording_floor', error: `agent-browser version ${JSON.stringify(String(version))} is unreadable — recording needs ≥ ${RECORDING_FLOOR}` };
  if (B.cmpVersion(String(version), RECORDING_FLOOR) < 0) return { ok: false, code: 'recording_floor', error: `agent-browser ${version} cannot record (record start at 30 fps arrives in ${RECORDING_FLOOR}) — update it, then turn recording on again` };
  return { ok: true, code: null, error: null };
}
/**
 * lane live-input: A FAILED `record start`'s words as the profile row may keep them — the CLI's own stderr minus the
 * command line it echoes ("Command failed: agent-browser record start /abs/…/x.webm") and minus absolute paths (the
 * owner read "recording refused" + a raw command as the whole explanation). Never the user's data: a recording's file
 * name is the conversation id and a clock.
 */
function cleanRecordError(raw) {
  let s = String(raw || '').replace(/\r/g, '');
  s = s.replace(/^Command failed:[^\n]*\n?/i, '');
  s = s.replace(/(?:^|\s)\/[^\s'"]+/g, (m) => (m.startsWith(' ') ? ' ' : '') + '…');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 240);
}
/**
 * lane live-input: THE RECORDING CHIP'S WORDS on the live view's bar — three states a person can act on (the owner had
 * to turn video on by hand and read "recording refused" + a raw error). `recording` / `refused` = the digest's rows for
 * this profile, `hasProfile` = the view shows a named profile (a temporary browser has none to record under), `since` =
 * a time string. `t` = the caller's translator. → {state: 'on'|'off'|'none'|'refused', text, title}.
 */
function recordingChipWords({ recording = null, refused = null, hasProfile = true, since = '' } = {}, { t = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => (p[k] !== undefined ? String(p[k]) : '{' + k + '}')) : s) } = {}) {
  if (!hasProfile) return { state: 'none', text: t('Video off'), title: t('A temporary browser cannot be recorded to video — only a saved browser profile can. Every action the agent takes is still listed under Actions.') };
  if (recording) return { state: 'on', text: t('Recording video'), title: t('A video of this browser is being saved (since {time}). Click to see the videos or turn recording off.', { time: since || '?' }) };
  if (refused) {
    const why = String(refused.code || '');
    const detail = refused.error ? cleanRecordError(refused.error) : '';
    const byCode = {
      recording_floor: t('This version of agent-browser cannot record video. Update it, then turn video on again.'),
      recording_not_ours: t('VibeSpace does not start this browser, so it cannot record it.'),
      recording_not_local: t('This browser runs on another machine — video works only for browsers on this one.'),
      browser_no_cdp: t('VibeSpace could not reach this browser to record it. Turn video off and on again once the browser is running.'),
      dir_unwritable: t('The folder for videos cannot be written.'),
      record_failed: t('The video recorder did not start. Turn video off and on again in Agent browser.'),
    };
    const head = byCode[why] || t('Video could not start.');
    // builder r2: joined by the translated template (zh / ja put no space after 。)
    return { state: 'refused', text: t('Video did not start'), title: detail && (why === 'record_failed' || !byCode[why]) ? t('{first} {then}', { first: head, then: t('Details: {why}', { why: detail }) }) : head };
  }
  return { state: 'off', text: t('Video off'), title: t('This browser is not being recorded to video. Click to open Agent browser, where video can be turned on for this profile — every action the agent takes is listed under Actions either way.') };
}
function recordingFileFor({ profileId, sessionId, at } = {}) {
  const sid = String(sessionId || 'session').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
  return `${String(profileId)}/${sid}-${Number(at) || 0}.webm`;
}
const RECORDING_FILE_RE = /^[A-Za-z0-9_-]{1,40}-\d{1,16}\.(webm|mp4)$/;
function isRecordingFile(name) { return RECORDING_FILE_RE.test(String(name || '')); }

// ── housekeeping: scope, verdicts, forget, orphans ─────────────────────────
/** The rows the sweep may act on: `ownsDir` on THIS machine. */
function sweepScope(profiles, rowOf = B.providerRow) {
  // takeover C3: a managed EPHEMERAL record's directory (rung C's scratch dir) is browser-env's sweep to reclaim, never this one's
  return (profiles || []).filter((p) => p && !p.host && !B.isEphemeralProfile(p) && !!((rowOf(p.provider) || {}).ownsDir));
}
/** May this record be queued for the sweep / forgotten / measured? A typed refusal names why not. */
function queueVerdict(profile, rowOf = B.providerRow) {
  if (!profile) return { ok: false, code: 'not-found', error: 'no profile' };
  if (B.isEphemeralProfile(profile)) return { ok: false, code: 'not_ours', error: `"${profile.label}" is a conversation's managed ephemeral browser — it goes with its conversation (its scratch directory is swept by the per-session browser sweep), never set aside here` };
  const row = rowOf(profile.provider) || null;
  if (!row) return { ok: false, code: 'not_ours', error: `"${profile.label}" names an unknown provider ${JSON.stringify(profile.provider)} — its directory is not ours to touch` };
  if (!row.ownsDir) return { ok: false, code: 'not_ours', error: `"${profile.label}" is a ${profile.provider} profile — that browser's state is not a directory we own (§7.1 ownsDir: no), so nothing here may sweep, forget or delete it` };
  if (profile.host) return { ok: false, code: 'not_ours', error: `"${profile.label}" lives on ${profile.host} — its directory is that machine's, not this one's` };
  if (!profile.dir) return { ok: false, code: 'not_ours', error: `"${profile.label}" has no directory` };
  return { ok: true, code: null, error: null };
}
/**
 * The listing the profiles panel shows — EVERY row says what it is and why,
 * and NONE says 'delete' (D8: deletion is a human act). `dirFacts` =
 * {profileId: {bytes, mtime}}; leases / browsers are the registry's.
 */
function housekeepingVerdict({ profiles = [], leases = [], browsers = {}, dirFacts = {}, now, staleDays = STALE_PROFILE_DAYS, graceMs = INFLIGHT_GRACE_MS, rowOf = B.providerRow } = {}) {
  const t = Number(now) || 0;
  // takeover C3: the managed ephemeral records have their OWN section (ephemeralRows), never a profile row
  return (profiles || []).filter((p) => !B.isEphemeralProfile(p)).map((p) => {
    const q = queueVerdict(p, rowOf);
    const facts = dirFacts[p.id] || {};
    const held = (leases || []).filter((l) => l.profileId === p.id).length;
    const live = B.isLiveBrowser(browsers[p.id]);
    // lane H verify r5: a live daemon whose browser is CLOSED / keeps closing is said on the row (never "running" alone)
    const br = browsers[p.id];
    const browserClosed = live && br && !br.browser && br.closed && typeof br.closed.code === 'string' ? br.closed.code : null;
    // lane H verify r6 MINOR 1: an unstable record whose relaunch ASKS kept failing (no browser ever started) says so — never "keeps closing"
    const closedWhy = browserClosed === 'browser_unstable' ? (br.closed.unstable === 'failing' ? ' — its browser could not be started: VibeSpace stopped trying (Stop resets it)' : ' — its browser keeps closing: VibeSpace stopped starting it again (Stop resets it)') : browserClosed === 'profile_locked' ? ' — its folder is held by another browser' : browserClosed ? ' — its browser is closed (the next command starts it again)' : '';
    const lastWrite = Math.max(Number(p.lastUsedAt) || 0, Number(facts.mtime) || 0);
    const ageMs = lastWrite ? Math.max(0, t - lastWrite) : null;
    // `closedHow` (2026-09-28): the unstable record's kind as STRUCTURE, so the panel words the row in the device's language
    // (`why` stays the English sentence the agent / the CLI read)
    const closedHow = browserClosed === 'browser_unstable' ? (br.closed.unstable === 'failing' ? 'failing' : 'closing') : null;
    // BROWSE YOURSELF (B-6ae8): may the user browse it himself (a local profile whose provider STARTS a browser — never a
    // paired machine's in v1, never a browser VibeSpace only connects to), and does it record his own actions (the owner's
    // opt-out, absent = on) — structure for the row's button and checkbox
    const row = rowOf(p.provider) || {};
    const canBrowse = row.starts !== false && row.leaseKind !== 'window-target'; // lane remote-profile-start: a paired machine's profile too (started there, seen here)
    const base = { id: p.id, label: p.label, dir: p.dir || null, provider: p.provider, host: p.host || null, legacy: !!p.legacy, record: !!p.record, recordMine: p.recordMine !== false, canBrowse, sharing: p.sharing === 'instance' ? 'instance' : 'owner', mediated: B.isMediatedProfile(p), bytes: Number.isFinite(facts.bytes) ? facts.bytes : null, lastUsedAt: Number(p.lastUsedAt) || 0, ageMs, held, live, browserClosed, closedHow };
    if (!q.ok && !remoteOwned(p, rowOf)) return { ...base, state: 'not-ours', why: q.error, canForget: false }; // lane remote-profile-start: a paired machine's profile is the user's to browse / delete (through its machine)
    if (held) return { ...base, state: 'in-use', why: `attached by ${held} session(s)${closedWhy}`, canForget: false };
    if (live) return { ...base, state: 'live', why: browserClosed ? `its daemon is running${closedWhy}` : 'its browser is running', canForget: false };
    if (ageMs !== null && ageMs < graceMs) return { ...base, state: 'recent', why: `written ${Math.round(ageMs / 60000)} min ago — may be in flight (grace ${Math.round(graceMs / 60000)} min)`, canForget: true };
    if (ageMs !== null && ageMs > staleDays * 86400000) return { ...base, state: 'stale', why: `unused for ${Math.round(ageMs / 86400000)} d (listed, never deleted by itself)`, canForget: true };
    return { ...base, state: 'kept', why: ageMs === null ? 'never used yet' : `last used ${Math.round(ageMs / 3600000)} h ago`, canForget: true };
  });
}
/** May a profile be forgotten now? (archived first, then removed — never while held or live) */
/** LANE REMOTE-PROFILE-START: a PAIRED machine's profile of a provider that owns its directory — never this machine's sweep's
 *  (queueVerdict keeps refusing it: no dir here), but the user's Delete… removes it, its folder THERE by the machine's own op. */
function remoteOwned(profile, rowOf = B.providerRow) { return !!(profile && profile.host && !B.isEphemeralProfile(profile) && (rowOf(profile.provider) || {}).ownsDir); }
function forgetVerdict({ profile, leases = [], browsers = {}, rowOf = B.providerRow } = {}) {
  if (!profile) return { ok: false, code: 'not-found', error: 'no such profile' };
  const q = remoteOwned(profile, rowOf) ? { ok: true } : queueVerdict(profile, rowOf);
  if (!q.ok) return q;
  const held = (leases || []).filter((l) => l.profileId === profile.id);
  if (held.length) return { ok: false, code: 'leased', error: `profile "${profile.label}" is attached by ${held.length} session(s) (${held.map((l) => l.browserKey).join(', ')}) — detach them first` };
  if (B.isLiveBrowser(browsers[profile.id])) return { ok: false, code: 'running', error: `profile "${profile.label}" has a running browser — stop it first` };
  return { ok: true, code: null, error: null };
}
function forgottenDirName(dir, at) { return `${String(dir)}${FORGOTTEN_SUFFIX}${Number(at) || 0}`; }
function isForgottenName(name) { return String(name || '').includes(FORGOTTEN_SUFFIX); }
/**
 * §8 step 3: the ORPHANS — directories under ~/.agent-browser that carry a
 * Chromium profile marker and that no registry record names. `names` =
 * [{name, isDir, markers:[...top-level names], mtime, bytes?}], `registeredDirs`
 * = every dir the registry (and the forgotten ledger) already names.
 */
function orphanCandidates({ names = [], registeredDirs = [], base = '', now = 0 } = {}) {
  const known = new Set((registeredDirs || []).map((d) => String(d || '').replace(/\/+$/, '')));
  const t = Number(now) || 0;
  const out = [];
  for (const n of names || []) {
    if (!n || !n.isDir || !n.name) continue;
    if (isForgottenName(n.name)) continue;
    const dir = base ? `${String(base).replace(/\/+$/, '')}/${n.name}` : n.name;
    if (known.has(dir)) continue;
    const markers = Array.isArray(n.markers) ? n.markers : [];
    if (!PROFILE_MARKERS.some((m) => markers.includes(m))) continue;
    const mtime = Number(n.mtime) || 0;
    out.push({ name: n.name, dir, mtime, bytes: Number.isFinite(n.bytes) ? n.bytes : null, ageMs: mtime && t ? Math.max(0, t - mtime) : null });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
/** A dir under `base` may be adopted / forgotten only when it IS under base (no `..`, no symlink escape decided here — the server realpaths). */
function orphanPathVerdict({ dir, base } = {}) {
  const d = String(dir || ''); const b = String(base || '').replace(/\/+$/, '');
  if (!d || !b) return { ok: false, code: 'bad-request', error: 'a directory and the base are required' };
  if (!d.startsWith(b + '/') || d.slice(b.length + 1).includes('/') || d.includes('/../') || d.endsWith('/..')) return { ok: false, code: 'not_ours', error: `${d} is not a top-level directory under ${b}` };
  if (isForgottenName(d)) return { ok: false, code: 'bad-request', error: `${d} is already a forgotten directory` };
  return { ok: true, code: null, error: null };
}
// ── the client's DOM-free half (bundled: the tool card, the timeline, the panel) ──
/** The closed set of states `housekeepingVerdict` answers — the panel's phrase table must cover every one (pinned by the suite). */
const HOUSEKEEPING_STATES = Object.freeze(['not-ours', 'in-use', 'live', 'recent', 'stale', 'kept']);
/** The URL a frame is drawn from through `.src` (never markup); '' for anything that is not an entry id. */
function frameUrl(id, which) { return isEntryId(id) && (which === 'before' || which === 'after') ? `/api/browser/actions/${id}/frame/${which}` : ''; }
/** Bytes as the panel prints them (units are units, not prose); '—' for an unmeasured size. */
function bytesText(n) {
  if (n === null || n === undefined || n === '') return '—';
  const b = Number(n);
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}
/** The shell command a tool call ran — a string, or codex's argv array (`["bash","-lc","…"]`) joined. */
function toolCommandText(input) {
  const c = input && typeof input === 'object' ? (input.command !== undefined ? input.command : input.cmd) : null;
  if (Array.isArray(c)) return c.map((x) => String(x)).join(' ');
  return typeof c === 'string' ? c : '';
}
/** The tool card's digest of its entries: how many AGENT actions (`n`), how many of them failed, first/last instants —
 *  and the live view's re-fits BESIDE them (`fits`, every coalesced one counted), never in `n` (lane trace-fits). */
function traceSummary(entries) {
  const list = (entries || []).filter(Boolean);
  let n = 0, failed = 0, first = 0, last = 0, fits = 0;
  for (const e of list) {
    if (isFitEntry(e)) fits += fitCount(e); else { n++; if (e.ok === false) failed++; }
    if (!first || e.at < first) first = e.at; if (e.at > last) last = e.at;
  }
  return { n, failed, first, last, fits };
}
/** ONE fetch for many cards: the union of their windows ([{id, from, to}]), or null with none. */
function unionWindow(windows) {
  let from = Infinity, to = -Infinity;
  for (const w of windows || []) { if (!w) continue; if (Number(w.from) < from) from = Number(w.from); if (Number(w.to) > to) to = Number(w.to); }
  return from <= to ? { from, to } : null;
}
/** Distribute fetched entries to the cards whose window holds them. Adjacent
 *  windows overlap by their ±2 s pads, so an entry lands on EXACTLY ONE card:
 *  the one with the LATEST `ts` that is still ≤ the entry's instant (+ clock
 *  skew) — the tool call that was RUNNING when the action happened; an entry
 *  only later cards can hold goes to the earliest of them. Answers
 *  {cardId: entries[]} with every card present (an empty list is an answer). */
function assignEntriesToWindows(windows, entries, { pad = 2000, skew = 500 } = {}) {
  const out = {};
  const ws = (windows || []).filter((w) => w && w.id !== undefined).map((w) => ({ id: String(w.id), from: Number(w.from) || 0, to: Number(w.to) === Infinity ? Infinity : Number(w.to) || 0, ts: Number(w.ts) || (Number(w.from) || 0) + pad }));
  for (const w of ws) out[w.id] = [];
  const sorted = [...(entries || [])].filter((e) => e && e.id).sort((a, b) => a.at - b.at);
  for (const e of sorted) {
    let best = null;
    // a card whose own ts is later than the action (beyond clock skew) was not running yet
    for (const w of ws) { if (e.at < w.from || e.at > w.to) continue; if (w.ts > e.at + skew) continue; if (!best || w.ts > best.ts) best = w; }
    if (!best) for (const w of ws) { if (e.at < w.from || e.at > w.to) continue; if (!best || w.ts < best.ts) best = w; } // only later cards hold it: the earliest of them (skew)
    if (best) out[best.id].push(e);
  }
  return out;
}
/** The position as one short line (the kinds are the wire's words; the client wraps them). */
function positionText(position) {
  const p = position || {};
  if (p.kind === 'point') return `${p.x},${p.y}`;
  if (p.kind === 'box' && p.box) return `${p.selector || ''} ${Math.round(p.box.width)}×${Math.round(p.box.height)} @ ${Math.round(p.box.x)},${Math.round(p.box.y)}`.trim();
  if (p.kind === 'target') return `${p.selector || ''}${p.why ? ` (${p.why})` : ''}`.trim();
  if (p.kind === 'keys') return String(p.keys || '');
  if (p.kind === 'scroll') return `${p.direction || ''} ${p.amount || 0}`.trim();
  if (p.kind === 'navigation') return String(p.url || '');
  if (p.kind === 'viewport') return p.device ? String(p.device) : `${p.width}×${p.height}`;
  return p.why ? String(p.why) : '';
}

/** The byte / count digest the panel prints per scope: `n` = the agent's actions, `fits` + `fitBytes` = the live view's
 *  re-fits beside them (lane trace-fits), `bytes` = every frame. */
function scopeDigest(entries) {
  let bytes = 0, n = 0, last = 0, fits = 0, fitBytes = 0;
  for (const e of entries || []) {
    const b = (e.before ? Number(e.before.bytes) || 0 : 0) + (e.after ? Number(e.after.bytes) || 0 : 0) + (Number(e.bytes) || 0);
    bytes += b;
    if (isFitEntry(e)) { fits += fitCount(e); fitBytes += b; } else n++;
    if (e.at > last) last = e.at;
  }
  return { n, bytes, last, fits, fitBytes };
}

module.exports = {
  TRACE_BYTES_PER_PROFILE, TRACE_BYTES_FLOOR, TRACE_BYTES_SETTING, TRACE_TAP_FPS, AFTER_SETTLE_MS, AFTER_MAX_MS, BOX_PROBE_TIMEOUT_MS, PENDING_CAP, FRAME_RING,
  FIT_COALESCE_MS, FIT_ACTION, isFitEntry, fitCount, fitCoalesceVerdict, coalesceFits, foldFits, visibleEntries, // lane trace-fits: the page-size fold
  RECORDING_FLOOR, RECORDING_DIR, TRACE_DIR, FORGOTTEN_FILE, STALE_PROFILE_DAYS, INFLIGHT_GRACE_MS, PROFILE_MARKERS, FORGOTTEN_SUFFIX, EPHEMERAL_SCOPE,
  TRACED_ACTIONS, classifyAction, isTracedCommand, selectorOf, redactParams, withoutUserinfo, withoutUrlSecrets, credentialKey, CREDENTIAL_WORDS, commandText, positionOf, resultOk, resultError, frameMeta, boxFromProbe, afterFramePick,
  entryFor, isEntryId, mintEntryId, timelineLabel, traceWindowFor, commandDrivesBrowser, entriesInWindow, overlayGeometry,
  traceBytesLimit, entryFrameBytes, entryListBytes, traceSizePlan, recordingVerdict, recordingFileFor, isRecordingFile,
  cleanRecordError, recordingChipWords, // lane live-input: a failed record start's words kept without its command line / paths; the bar's recording chip
  sweepScope, queueVerdict, housekeepingVerdict, forgetVerdict, forgottenDirName, isForgottenName, orphanCandidates, orphanPathVerdict, scopeDigest,
  HOUSEKEEPING_STATES, frameUrl, bytesText, toolCommandText, traceSummary, unionWindow, assignEntriesToWindows, positionText, armGapFor,
};
