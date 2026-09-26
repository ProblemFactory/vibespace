'use strict';
/**
 * THE LIVE VIEW'S DECISIONS — PURE (imports nothing; CJS so the server bridge
 * AND the browser bundle carry the same rules, like task-color-seq.js).
 * docs/design-agent-browser-v2.md §4.2 (transport), §4.4 (the window), §3.7
 * (one bound pane + a switcher strip), phase P2.
 *
 * WHAT IS DECIDED HERE, and why it is not in the bridge:
 *   · WHICH browser a live view of a session shows (`streamTargetFor`): the
 *     attachment a handle names, else the set's default, else its only member,
 *     else the FIRST one (a view is not a command — §3.7's `profile_required`
 *     refusal is for commands, a window that refused to open would be a
 *     silent failure of a user act), else the session's own ephemeral browser
 *     (P0's four variables), else a typed `no-browser`.
 *   · The upstream message CLASS: `frame` is LATEST-WINS, everything else is
 *     ORDERED (measured shapes: scripts/fixtures/browser-stream/session-0.32.0.json
 *     — status / tabs / frame / command / result; no `seq` on 0.32.0).
 *   · What a VIEWER may send upstream (`viewerMessageVerdict`): `config` is
 *     per-viewer and AGGREGATED (the max across viewers goes upstream, §4.2),
 *     `ack` is consumed by the bridge's own pacing, `input_*` is forwarded ONLY
 *     from the viewer holding the user side of the lease — in P2 nobody does
 *     (Watch mode), so every input is refused with the typed `watch-mode` code
 *     an agent or a UI can read without guessing (the `tab_gone` rule).
 *   · Backpressure (`backpressureVerdict`): the VNC bridge's numbers verbatim —
 *     pause the upstream side above 8 MiB buffered on ANY viewer, resume once
 *     EVERY viewer is under 1 MiB (a fast framebuffer and a slow client is a
 *     memory bomb, learned the hard way on /api/vnc). Per viewer, a frame is
 *     also DROPPED while that viewer is over the high-water mark (`frameGate`),
 *     so one slow tab never stalls the picture for the others.
 *   · DPI (`drawnRect` + `pointerToDevice`): the desktop window's lesson
 *     (inc-mtdrm922) — never mix viewport px with layout px. Both inputs here
 *     are VIEWPORT px (clientX/Y and getBoundingClientRect), so the mapping
 *     holds at every body zoom; the container still counter-zooms the picture
 *     to NET zoom 1 (vnc-view rule) so the JPEG maps ~1:1 to device pixels.
 *   · GEOMETRY (`frameGeometry`, lane J — inc-muhgv0fb-9i4u "接管浏览器的时候
 *     鼠标操作位置不对"): TWO sizes, never one. The PICTURE is the JPEG as
 *     decoded (its natural size — what object-fit: contain letterboxes); the
 *     PAGE is the CSS viewport every input record is in (CDP Input.* x/y).
 *     Measured on 0.32.0: a frame's `metadata.deviceWidth/Height` and the
 *     status' `viewportWidth/Height` are the stream server's CONFIGURED
 *     1280×720 (timestamp 0 — synthesized), never the page: headless shows a
 *     1280×577 page in a 1280×577 JPEG, a headed window a 1265×1277 page
 *     DOWNSCALED into a 713×720 JPEG (Chrome's own screencast metadata said
 *     1265×1277 — the upstream overwrote it). So the page size is the page's
 *     own reading (the bridge's `viewport` record — CDP layout metrics) when
 *     it fits the picture, else the metadata when IT fits, else the picture
 *     1:1; the letterbox is always the picture's.
 *   · ALIGNMENT (lane J r2 — the study's "dark bands above and below, a third
 *     of the pane"): the live view draws the picture TOP-aligned (object-fit:
 *     contain; object-position: 50% 0 — `LIVE_ALIGN`), so a picture narrower in
 *     aspect than its pane fills the width and every spare pixel sits BELOW it.
 *     `drawnRect`/`pointerToDevice`/`deviceToViewport` take `align` so the
 *     pointer, the agent cursor, the user's cursor and the click ripple share
 *     the one placement the CSS renders (a centred-maths reader over a
 *     top-aligned picture would be the lane J bug again, vertically).
 *   · TEXT (lane J r2): `textRecords` turns pasted / IME-composed text into
 *     the stream server's `input_keyboard` `char` records (measured on 0.38.1:
 *     the eventType is handed to CDP Input.dispatchKeyEvent verbatim, and a
 *     `char` with a multi-character text inserts all of it — keypress +
 *     beforeinput + input, no keydown), chunked and bounded.
 * Gate: scripts/test-browser-live.mjs (heavy — the bridge over a fake upstream
 * speaking the fixture's shapes, then headless chrome).
 */

const STREAM_PATH = '/api/browser/stream';
/** The VNC bridge's discipline, verbatim (server.js bridgeVncSocket). */
const BACKPRESSURE = Object.freeze({ pauseAbove: 8 * 1024 * 1024, resumeBelow: 1024 * 1024 });
const MAX_FPS_DEFAULT = 15;
const MAX_FPS_CAP = 60;
/** Upstream record types the bridge understands (fixture-measured + the
 *  documented `url` / `console`). Anything else is relayed as ORDERED —
 *  a newer upstream must not be silenced by an old bridge. */
const UPSTREAM_TYPES = Object.freeze(['status', 'tabs', 'url', 'console', 'frame', 'command', 'result']);
/** Ordered records whose LAST value a late-joining viewer needs at once. */
const REPLAYED_TYPES = Object.freeze(['status', 'tabs', 'url']);
/** The three modes of §4.3 — Watch (nobody holds the input side), Take over
 *  (a viewer holds it), Hand back (a transition, never a resting state). */
const MODES = Object.freeze(['watch', 'takeover', 'handback']);
const VIEWER_INPUT_TYPES = Object.freeze(['input_mouse', 'input_keyboard', 'input_touch']);
/** P3 (§4.3): the viewer verbs that change WHO drives, and the answer to a
 *  pending `--confirm-actions` card. None is forwarded upstream as-is. */
const VIEWER_CONTROL_TYPES = Object.freeze(['takeover', 'handback', 'confirm', 'pass']); // + lane P verify: `pass` {to} = the holder hands its controls to another view of the same browser (a fold-back)
/** CDP's modifier bitmask, the one the stream server expects (measured off
 *  the dashboard's own bundle: alt 1, ctrl 2, meta 4, shift 8). */
const KEY_MODIFIERS = Object.freeze({ alt: 1, ctrl: 2, meta: 4, shift: 8 });
/** Where the live view draws its picture inside the pane (lane J r2): the CSS
 *  says `object-position: 50% 0` and every conversion reads THIS word. */
const LIVE_ALIGN = 'top';
const ALIGNS = Object.freeze(['center', 'top']);
/** Text a viewer may hand the page in one act (a paste, a composition): one
 *  record per `TEXT_CHUNK` chars, refused as a whole past `TEXT_MAX` (a paste
 *  of a whole document into a page is not a keystroke — say so, never trim). */
const TEXT_CHUNK = 200;
const TEXT_MAX = 20000;

const sessionNameFor = (key) => 'vs-' + String(key || '');
/** Lane H (2026-09-25): the reserved `profileRef` that names the session's OWN
 *  ephemeral browser whatever its attachments are — the auto-opened live view
 *  of an ephemeral that just started and the action-trace recorder's tap on it
 *  ask for THAT browser, never "the default pane" (a conversation that used its
 *  ephemeral and later attached a profile would otherwise be shown — and
 *  traced under the `ephemeral` scope — on the attachment). Not an alias: an
 *  alias starts with [a-z0-9] (browser-profiles ALIAS_RE), so no handle can
 *  ever spell it. */
const EPHEMERAL_REF = '~ephemeral';
/** Naive study 2 (finding 4, 2026-09-25): the reserved TAP ref of a SUB-AGENT's (child) managed ephemeral browser —
 *  `~child:bk-<8 hex>.<n>` (browser-profiles CHILD_KEY_RE; '~' is never an alias). The action-trace recorder taps a
 *  helper's browser with it (the helpers' "Browser actions" rows said "no recorded actions" — nobody was viewing);
 *  no live view is ever bound to it (a viewer's request carries no child pairs and is refused `no-browser`). */
const CHILD_REF_PREFIX = '~child:';
const CHILD_KEY_RE = /^bk-[0-9a-f]{8}\.\d{1,4}$/;
function childRefFor(childKey) { return CHILD_REF_PREFIX + String(childKey || ''); }
/** The child key a `~child:` ref names — only a well-formed child OF `browserKey` (null otherwise). */
function childKeyOfRef(ref, browserKey = null) {
  const r = String(ref || '');
  if (!r.startsWith(CHILD_REF_PREFIX)) return null;
  const k = r.slice(CHILD_REF_PREFIX.length);
  if (!CHILD_KEY_RE.test(k)) return null;
  if (browserKey != null && k.slice(0, k.indexOf('.')) !== String(browserKey)) return null;
  return k;
}
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 'frame' (latest-wins) | 'ordered' | 'invalid' (not an object with a type). */
function classifyUpstream(msg) {
  if (!isObj(msg) || typeof msg.type !== 'string') return 'invalid';
  return msg.type === 'frame' ? 'frame' : 'ordered';
}

/** The CLI's `stream status --json` / `stream enable --json` answer → one
 *  verdict. Measured 0.32.0 shapes: `{success, data:{enabled, connected, port,
 *  screencasting}}`; an `enable` on an enabled session is `{success:false,
 *  error:'Streaming is already enabled…'}` (exit 1) — NOT a failure of the
 *  stream; a launch failure is `{success:false, error:'Chrome exited early…'}`. */
function parseStreamStatus(json) {
  if (!isObj(json)) return { ok: false, enabled: false, port: null, alreadyEnabled: false, error: 'no JSON answer' };
  const d = isObj(json.data) ? json.data : null;
  const err = typeof json.error === 'string' ? json.error : null;
  if (json.success === false || (!d && err)) {
    const already = !!err && /already enabled/i.test(err);
    return { ok: already, enabled: already, port: null, alreadyEnabled: already, error: already ? null : (err || 'stream command failed') };
  }
  const port = d && Number.isInteger(d.port) && d.port > 0 && d.port < 65536 ? d.port : null;
  const enabled = !!(d && d.enabled !== false && port);
  return { ok: !!d, enabled, port, alreadyEnabled: false, connected: !!(d && d.connected), screencasting: !!(d && d.screencasting), error: d ? null : 'no data' };
}

/** After a status: 'ready' (a port to bridge) | 'enable' (the CLI must be
 *  asked to enable it) | 'failed' (with the reason). */
function streamPlan(status) {
  if (!status || !status.ok) return { step: 'failed', why: (status && status.error) || 'no status' };
  if (status.enabled && status.port) return { step: 'ready', port: status.port };
  return { step: 'enable', why: 'streaming is disabled for this session' };
}

/** The Origin the bridge presents upstream: a loopback one (measured accepted;
 *  a foreign one is 403 before the upgrade, an absent one is also accepted —
 *  the documented rule is loopback, so that is what we send). */
function originHeaderFor(port) { return `http://127.0.0.1:${Number(port) || 0}`; }

/**
 * WHICH browser a live view of this session shows (§3.7 "one bound pane plus a
 * switcher strip"). `set` is the keeper's attachment-set view
 * (browser-profiles.attachmentsFor), `profileRef` a handle / profile id / '' /
 * EPHEMERAL_REF (the session's own ephemeral browser, never an attachment).
 * Answers a typed target or a typed refusal — never throws.
 *   { ok:true, kind:'attachment', profileId, alias, label, isDefault, chosen:'named'|'default'|'only'|'first', ns, sessionName, dir }
 *   { ok:true, kind:'ephemeral', ns, sessionName, envPairs }
 *   { ok:true, kind:'child', handle, ns:'vs-<handle>', sessionName }   MULTIVIEW §4: a helper's browser (no pairs — the keeper's record has them)
 *   { ok:false, code:'not_attached'|'no-browser'|'no-key', error, handles }
 * `profileRef` may also be EPHEMERAL_REF (the session's own browser, asked for
 * by name beside its attachments) or a child handle the set lists. Every ok
 * target carries `ref` = what a strip tab names it by.
 */
function streamTargetFor({ browserKey, set = null, profileRef = '', envPairs = null, profiles = [], childPairs = null } = {}) {
  const bk = String(browserKey || '');
  if (!bk) return { ok: false, code: 'no-key', error: 'this session has no browser key (browser isolation is off, or it predates the feature) — nothing to view', handles: [] };
  // naive study 2 (finding 4): a sub-agent's ephemeral browser — only with ITS pairs (the keeper's, handed by the recorder's tap)
  if (String(profileRef || '').startsWith(CHILD_REF_PREFIX)) {
    const ck = childKeyOfRef(profileRef, bk);
    const cp = Array.isArray(childPairs) ? childPairs.filter((x) => typeof x === 'string' && /^AGENT_BROWSER_[A-Z_]+=/.test(x)) : [];
    if (!ck) return { ok: false, code: 'not_attached', error: `${JSON.stringify(String(profileRef))} is not a sub-agent browser of this session`, handles: [] };
    if (!cp.length) return { ok: false, code: 'no-browser', error: `the sub-agent browser ${ck} is not running here — nothing to view`, handles: [] };
    return { ok: true, kind: 'ephemeral', child: true, browserKey: ck, profileId: null, alias: null, label: null, isDefault: false, chosen: 'child', ns: sessionNameFor(ck), sessionName: sessionNameFor(ck), envPairs: cp };
  }
  const atts = (set && Array.isArray(set.attachments)) ? set.attachments : [];
  const handles = atts.map((a) => a.alias + (a.isDefault ? ' [default]' : ''));
  const byId = (id) => (profiles || []).find((p) => p && p.id === id) || null;
  const mk = (a, chosen) => {
    const p = byId(a.profileId);
    return { ok: true, kind: 'attachment', ref: a.profileId, profileId: a.profileId, alias: a.alias, label: a.label || (p ? p.label : a.profileId), isDefault: !!a.isDefault, chosen, ns: sessionNameFor(a.profileId), sessionName: sessionNameFor(bk), dir: p ? p.dir : (a.dir || null) };
  };
  const ref = String(profileRef || '').trim();
  const pairs = Array.isArray(envPairs) ? envPairs.filter((s) => typeof s === 'string' && /^AGENT_BROWSER_[A-Z_]+=/.test(s)) : [];
  const ephemeral = (chosen) => (pairs.length
    ? { ok: true, kind: 'ephemeral', ref: EPHEMERAL_REF, profileId: null, alias: null, label: null, isDefault: false, chosen, ns: sessionNameFor(bk), sessionName: sessionNameFor(bk), envPairs: pairs }
    : { ok: false, code: 'no-browser', error: 'this session has no browser of its own (browser isolation is off for it, or it runs on another machine) — nothing to view', handles });
  // MULTIVIEW (design-browser-multiview §2): the session's OWN browser by name
  // (a strip tab / a pop-out asks for it beside its attachments)
  if (ref === EPHEMERAL_REF) return ephemeral('named');
  // MULTIVIEW §4 (B-89d0): a HELPER's browser — a child handle this set lists.
  // The target carries NO pairs: the bridge asks the keeper for THAT child's
  // own recorded pairs, never the parent's (which name the parent's browser).
  if (ref && CHILD_HANDLE_RE.test(ref)) {
    const kids = (set && Array.isArray(set.children)) ? set.children : [];
    if (kids.some((c) => c && c.handle === ref)) return { ok: true, kind: 'child', ref, handle: ref, profileId: null, alias: null, label: null, isDefault: false, chosen: 'named', ns: sessionNameFor(ref), sessionName: sessionNameFor(ref) };
  }
  if (ref) {
    const a = atts.find((x) => x.alias === ref) || atts.find((x) => x.profileId === ref);
    if (!a) return { ok: false, code: 'not_attached', error: `this session is not attached to ${JSON.stringify(ref)}${handles.length ? ' — its attachments: ' + handles.join(', ') : ''}`, handles };
    return mk(a, 'named');
  }
  const def = atts.find((x) => x.isDefault);
  if (def) return mk(def, 'default');
  if (atts.length === 1) return mk(atts[0], 'only');
  if (atts.length > 1) return mk(atts[0], 'first');
  return ephemeral('ephemeral');
}

/** `['K=V', …]` → `{K: V}` (the P0 spawn pairs, for one CLI call). */
function pairsToEnv(pairs) {
  const out = {};
  for (const s of pairs || []) { const i = String(s).indexOf('='); if (i > 0) out[s.slice(0, i)] = s.slice(i + 1); }
  return out;
}

/** A viewer's `config` → its clamped per-viewer fps (0 = uncapped ⇒ the cap). */
function clampFps(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return MAX_FPS_DEFAULT;
  if (n === 0) return MAX_FPS_CAP;
  return Math.max(1, Math.min(MAX_FPS_CAP, Math.round(n)));
}
/** The ONE maxFps sent upstream: the MAX across viewers (§4.2) — each viewer
 *  is then served at its own rate by `frameGate`. No viewers ⇒ the default. */
function maxFpsAcross(viewers) {
  let m = 0;
  for (const v of viewers || []) m = Math.max(m, clampFps(v && v.maxFps !== undefined ? v.maxFps : MAX_FPS_DEFAULT));
  return m || MAX_FPS_DEFAULT;
}

/**
 * What a VIEWER's message means to the bridge. Returns
 *   { kind:'config', maxFps }            — per-viewer; forward:false (aggregated)
 *   { kind:'ack', seq }                  — consumed by the bridge's pacing; forward:false
 *   { kind:'input', forward:boolean, refusal? } — forwarded only from the lease's input holder
 *   { kind:'ping' }                      — answered locally
 *   { kind:'unknown', refusal }          — typed, never silently dropped
 */
function viewerMessageVerdict(msg, { holder = null, viewerId = null, mode = 'watch' } = {}) {
  if (!isObj(msg) || typeof msg.type !== 'string') return { kind: 'unknown', forward: false, refusal: { type: 'refused', code: 'bad-message', error: 'a message is a JSON object with a string `type`' } };
  const t = msg.type;
  if (t === 'config') return { kind: 'config', forward: false, maxFps: msg.maxFps === undefined ? undefined : clampFps(msg.maxFps) };
  if (t === 'ack') return { kind: 'ack', forward: false, seq: Number(msg.seq) || 0 };
  if (t === 'ping') return { kind: 'ping', forward: false };
  if (VIEWER_INPUT_TYPES.includes(t)) {
    const may = mode === 'takeover' && holder !== null && holder === viewerId;
    return may ? { kind: 'input', forward: true }
      : { kind: 'input', forward: false, refusal: { type: 'refused', code: 'watch-mode', error: mode === 'takeover' ? 'another viewer holds the controls — the lease\'s input side is theirs' : 'the view is in Watch mode: the agent is driving; take over to send input', holder: holder || null, mode } };
  }
  // P3 (§4.3): the control verbs are decided by the keeper (the bridge asks
  // it), never forwarded; `confirm` carries the id and the decision.
  if (t === 'takeover') return { kind: 'takeover', forward: false };
  if (t === 'handback') return { kind: 'handback', forward: false };
  if (t === 'confirm') return { kind: 'confirm', forward: false, id: typeof msg.id === 'string' ? msg.id.slice(0, 80) : '', decision: msg.decision === 'deny' ? 'deny' : 'confirm' };
  if (t === 'pass') return { kind: 'pass', forward: false, to: Number.isInteger(msg.to) ? msg.to : (typeof msg.to === 'string' && msg.to ? msg.to.slice(0, 40) : null) };
  return { kind: 'unknown', forward: false, refusal: { type: 'refused', code: 'unknown-type', error: `unknown message type ${JSON.stringify(t).slice(0, 40)}` } };
}

// ── P3 (§4.3): the viewer's input → the stream server's CDP-shaped records ──
/** The modifier bitmask off a DOM event's four flags. */
function modifiersOf(ev) {
  let m = 0;
  if (ev && ev.altKey) m |= KEY_MODIFIERS.alt;
  if (ev && ev.ctrlKey) m |= KEY_MODIFIERS.ctrl;
  if (ev && ev.metaKey) m |= KEY_MODIFIERS.meta;
  if (ev && ev.shiftKey) m |= KEY_MODIFIERS.shift;
  return m;
}
const BUTTONS = Object.freeze({ 0: 'left', 1: 'middle', 2: 'right' });
/** `input_mouse` for a pointer event already mapped to device px (`pt`).
 *  `kind` ∈ move|down|up; `clickCount` 1 on a press (CDP's rule). */
function mouseRecord({ kind = 'move', pt = null, button = 0, modifiers = 0, clickCount = null } = {}) {
  if (!pt || !Number.isFinite(Number(pt.x)) || !Number.isFinite(Number(pt.y))) return null;
  const eventType = kind === 'down' ? 'mousePressed' : kind === 'up' ? 'mouseReleased' : 'mouseMoved';
  return { type: 'input_mouse', eventType, x: Math.round(Number(pt.x)), y: Math.round(Number(pt.y)), button: kind === 'move' ? 'none' : (BUTTONS[Number(button)] || 'left'), clickCount: clickCount === null ? (kind === 'down' ? 1 : 0) : Number(clickCount) || 0, modifiers: Number(modifiers) || 0 };
}
/** `input_mouse` mouseWheel: deltas in CSS px (the browser's own units). */
function wheelRecord({ pt = null, deltaX = 0, deltaY = 0, modifiers = 0 } = {}) {
  if (!pt || !Number.isFinite(Number(pt.x)) || !Number.isFinite(Number(pt.y))) return null;
  return { type: 'input_mouse', eventType: 'mouseWheel', x: Math.round(Number(pt.x)), y: Math.round(Number(pt.y)), button: 'none', clickCount: 0, deltaX: Number(deltaX) || 0, deltaY: Number(deltaY) || 0, modifiers: Number(modifiers) || 0 };
}
/** `input_keyboard` for a DOM key event: `text` only on keyDown of a printable
 *  key (the dashboard's rule), `windowsVirtualKeyCode` from the char. */
const KEY_TEXT = Object.freeze({ Enter: '\r', Tab: '\t' });
function keyRecord({ kind = 'down', key = '', code = '', modifiers = 0, keyCode = 0 } = {}) {
  const k = String(key || '');
  if (!k) return null;
  const eventType = kind === 'up' ? 'keyUp' : 'keyDown';
  const printable = k.length === 1;
  // the text rides a chord too (measured 0.38.1: Ctrl+A with text still selects all — Chrome drops the char of a Ctrl
  // chord); dropping it would lose AltGr characters, which Windows reports as Ctrl+Alt ("@" on a German layout)
  const text = eventType === 'keyDown' ? (KEY_TEXT[k] !== undefined ? KEY_TEXT[k] : (printable ? k : undefined)) : undefined;
  // lane J r2: the DOM's own keyCode first (F-keys, Home/End, PageUp… carried 0 before — CDP then had no key to press)
  const vk = Number(keyCode) > 0 && Number(keyCode) !== 229 ? Number(keyCode) : printable ? k.toUpperCase().charCodeAt(0) : (k === 'Enter' ? 13 : k === 'Tab' ? 9 : k === 'Backspace' ? 8 : k === 'Escape' ? 27 : k === 'ArrowLeft' ? 37 : k === 'ArrowUp' ? 38 : k === 'ArrowRight' ? 39 : k === 'ArrowDown' ? 40 : k === 'Delete' ? 46 : 0);
  const r = { type: 'input_keyboard', eventType, key: k, code: String(code || ''), windowsVirtualKeyCode: vk, modifiers: Number(modifiers) || 0 };
  if (text !== undefined) r.text = text;
  return r;
}
/** lane J r2: TEXT the user put into the page without keystrokes — a paste,
 *  an IME composition — as the stream server's `char` records (measured on
 *  0.38.1: `eventType` reaches CDP Input.dispatchKeyEvent verbatim and a
 *  multi-character `char` inserts all of it). Split on code points, never
 *  inside a surrogate pair. `{ok:true, records}` | `{ok:false, code:'empty'|'too_long', error}`. */
function textRecords(text, { chunk = TEXT_CHUNK, max = TEXT_MAX } = {}) {
  const t = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
  if (!t) return { ok: false, code: 'empty', error: 'nothing to type' };
  const cps = Array.from(t);
  if (cps.length > max) return { ok: false, code: 'too_long', error: `${cps.length} characters is more than one paste into a page may carry (${max})`, length: cps.length, max };
  const records = [];
  for (let i = 0; i < cps.length; i += Math.max(1, chunk)) records.push({ type: 'input_keyboard', eventType: 'char', text: cps.slice(i, i + Math.max(1, chunk)).join(''), modifiers: 0 });
  return { ok: true, records, length: cps.length };
}
/** `input_touch` for a touch event's first point. */
function touchRecord({ kind = 'start', pt = null } = {}) {
  if (!pt || !Number.isFinite(Number(pt.x)) || !Number.isFinite(Number(pt.y))) return null;
  const eventType = kind === 'end' ? 'touchEnd' : kind === 'move' ? 'touchMove' : 'touchStart';
  return { type: 'input_touch', eventType, touchPoints: eventType === 'touchEnd' ? [] : [{ x: Math.round(Number(pt.x)), y: Math.round(Number(pt.y)) }] };
}

/** May THIS viewer receive THIS frame now? Its own fps cap and its own
 *  DROP mark: a viewer with more than `resumeBelow` (1 MiB) still queued is
 *  already a frame or more behind, so the next frame is DROPPED for it —
 *  latest-wins per viewer, never a queue without bound — while the fast
 *  viewers keep theirs. Only past `pauseAbove` (8 MiB) does the whole
 *  upstream pause (`backpressureVerdict`); with this gate in front, a slow
 *  viewer reaches that only through a single frame larger than the gap, so
 *  one slow tab never stalls the picture for the others.
 *  `viewer` = { maxFps, lastFrameAt, bufferedAmount }. */
function frameGate(viewer, now, limits = BACKPRESSURE) {
  if (!viewer) return false;
  if (Number(viewer.bufferedAmount) > Number(limits.resumeBelow)) return false;
  const fps = clampFps(viewer.maxFps === undefined ? MAX_FPS_DEFAULT : viewer.maxFps);
  const minGap = 1000 / fps;
  const last = Number(viewer.lastFrameAt) || 0;
  return now - last >= minGap - 0.5;
}

/** The upstream pause/resume decision over every viewer's buffered bytes. */
function backpressureVerdict(bufferedAmounts, paused, limits = BACKPRESSURE) {
  const arr = (bufferedAmounts || []).map((n) => Number(n) || 0);
  const worst = arr.length ? Math.max(...arr) : 0;
  if (!paused) return { pause: worst > Number(limits.pauseAbove), resume: false, worst };
  return { pause: false, resume: worst < Number(limits.resumeBelow), worst };
}

/** The first message every viewer receives. */
function hello({ viewers = 1, target = null, mode = 'watch', holder = null, upstreamVersion = null } = {}) {
  return {
    type: 'hello', viewers: Number(viewers) || 1, mode: MODES.includes(mode) ? mode : 'watch', holder: holder || null,
    target: target && target.ok ? { kind: target.kind, ref: target.ref || null, handle: target.handle || null, profileId: target.profileId || null, alias: target.alias || null, label: target.label || null, isDefault: !!target.isDefault, chosen: target.chosen, ns: target.ns || null } : null, // ns: a stopped view knows which ephemeral it waits for (naive study 2)
    protocol: { frames: 'latest-wins', ordered: UPSTREAM_TYPES.filter((t) => t !== 'frame'), input: 'holder-only', control: VIEWER_CONTROL_TYPES.slice(), upstreamVersion: upstreamVersion || null },
  };
}

// ── DPI (§4.4) ──────────────────────────────────────────────────────────────
/** Where the JPEG is actually DRAWN inside an element sized with
 *  object-fit: contain — the letterboxed rect, in the SAME px space as the
 *  element rect handed in (viewport px from getBoundingClientRect). `picW/picH`
 *  are the PICTURE's own size (img.naturalWidth/Height): object-fit letterboxes
 *  by the image's aspect, never by a size a record claims (lane J). */
function drawnRect(elRect, picW, picH, align = 'center') {
  const W = Number(elRect && elRect.width) || 0, H = Number(elRect && elRect.height) || 0;
  const fw = Number(picW) || 0, fh = Number(picH) || 0;
  const left = Number(elRect && elRect.left) || 0, top = Number(elRect && elRect.top) || 0;
  if (!W || !H || !fw || !fh) return { left, top, width: W, height: H, scale: 0 };
  const scale = Math.min(W / fw, H / fh);
  const width = fw * scale, height = fh * scale;
  // `align` = the element's object-position: 'center' (50% 50%, the CSS default) or 'top' (50% 0 — the live view, lane J r2)
  return { left: left + (W - width) / 2, top: top + (align === 'top' ? 0 : (H - height) / 2), width, height, scale };
}
/** A pointer event's viewport coordinates → the PAGE's CSS px (the space CDP
 *  Input.* takes), or null when the point is outside the drawn picture. ONE
 *  helper, used for every pointer → browser conversion (the desktop window's
 *  lesson). `frameW/frameH` = the page's CSS viewport (`frameGeometry`'s
 *  cssW/cssH); `picW/picH` = the picture's own size, which decides WHERE it is
 *  drawn (default: the page size — a picture of the page's own aspect). */
function pointerToDevice({ clientX, clientY, elRect, frameW, frameH, picW = frameW, picH = frameH, align = 'center' }) {
  const r = drawnRect(elRect, picW, picH, align);
  if (!r.scale || !(Number(frameW) > 0) || !(Number(frameH) > 0)) return null;
  const x = (Number(clientX) - r.left) / r.width;
  const y = (Number(clientY) - r.top) / r.height;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x: Math.round(x * Number(frameW)), y: Math.round(y * Number(frameH)) };
}
/** The inverse (P3's agent cursor): the page's CSS px → a point in the SAME px
 *  space as `elRect` (viewport px), or null when nothing has a size yet. Same
 *  helper family and arguments as `pointerToDevice`, so the two never drift. */
function deviceToViewport({ x, y, elRect, frameW, frameH, picW = frameW, picH = frameH, align = 'center' }) {
  const r = drawnRect(elRect, picW, picH, align);
  if (!r.scale || !(Number(frameW) > 0) || !(Number(frameH) > 0) || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  return { left: r.left + (Number(x) / Number(frameW)) * r.width, top: r.top + (Number(y) / Number(frameH)) * r.height };
}
/** A viewport-px point → the LAYOUT px of a positioned host (its padding box),
 *  for an overlay placed with left/top inside it. The host's rect is read in
 *  the same viewport space as the point, so the overlay and the pointer share
 *  ONE basis (getBoundingClientRect) whatever zoom sits between them. */
function toLocal({ left, top }, hostRect, hostW, hostH) {
  const W = Number(hostRect && hostRect.width) || 0, H = Number(hostRect && hostRect.height) || 0;
  if (!W || !H || !Number.isFinite(Number(left)) || !Number.isFinite(Number(top))) return null;
  const kx = (Number(hostW) || W) / W, ky = (Number(hostH) || H) / H;
  return { left: (Number(left) - (Number(hostRect.left) || 0)) * kx, top: (Number(top) - (Number(hostRect.top) || 0)) * ky };
}

// ── GEOMETRY (lane J) ───────────────────────────────────────────────────────
/** A scrollbar is the only thing that makes the page's layout viewport smaller
 *  than the picture shows (CDP layout metrics exclude it; the screencast does
 *  not) — any larger gap means the reading is of another size (stale). */
const SCROLLBAR_MAX_PX = 32;
/** The picture's own rounding: a JPEG side is round(side × scale). */
const ASPECT_SLACK_PX = 1.5;
const posNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
/** Does a W×H size have the picture's aspect, within the JPEG's own rounding? */
function sameAspect(w, h, picW, picH) {
  w = posNum(w); h = posNum(h); picW = posNum(picW); picH = posNum(picH);
  if (!w || !h || !picW || !picH) return false;
  // compare in PICTURE px (the side that was rounded), both ways
  return Math.abs(picH - picW * h / w) <= ASPECT_SLACK_PX || Math.abs(picW - picH * w / h) <= ASPECT_SLACK_PX;
}
/** The page's reading (`{clientWidth, clientHeight}` = CDP layout viewport,
 *  scrollbars excluded) → the full viewport the picture shows, or null when
 *  the reading does not fit the picture. A scrollbar shrinks ONE side: the
 *  side it did not touch, stretched by the picture's aspect, is the truth —
 *  the larger of the two candidates, accepted only within a scrollbar's width. */
function pageViewportFor(reading, picW, picH) {
  const cw = posNum(reading && (reading.clientWidth ?? reading.width)), ch = posNum(reading && (reading.clientHeight ?? reading.height));
  picW = posNum(picW); picH = posNum(picH);
  if (!cw || !ch) return null;
  if (!picW || !picH || sameAspect(cw, ch, picW, picH)) return { width: cw, height: ch }; // no scrollbar: the reading IS the viewport
  const a = { width: cw, height: cw * picH / picW };
  const b = { width: ch * picW / picH, height: ch };
  const v = a.width * a.height >= b.width * b.height ? a : b;
  const gw = v.width - cw, gh = v.height - ch;
  if (gw < -ASPECT_SLACK_PX || gh < -ASPECT_SLACK_PX || gw > SCROLLBAR_MAX_PX || gh > SCROLLBAR_MAX_PX) return null;
  return v;
}
/**
 * THE TWO SIZES a live view maps through: `{picW, picH}` = the picture as
 * drawn, `{cssW, cssH}` = the page's CSS viewport (the input records' space),
 * `source` = which reading gave the page size:
 *   'page'      the page's own layout metrics (the bridge's `viewport` record)
 *   'metadata'  the frame's metadata / the status' viewport — only when its
 *               aspect IS the picture's (a newer upstream passing Chrome's
 *               own metadata; an emulated viewport that really is 1280×720)
 *   'picture'   the picture 1:1 — an undownscaled screencast at DPR 1 (the
 *               headless default, 1280×577); the honest last rung
 * `page` = `{clientWidth, clientHeight}`, `meta` = `{width, height}`; `picW/picH`
 * 0 before the first frame decoded (then the page / metadata size stands in
 * for both, aspect assumed). Null when nothing has a size yet.
 */
function frameGeometry({ picW = 0, picH = 0, page = null, meta = null } = {}) {
  const pw = posNum(picW), ph = posNum(picH);
  const mw = posNum(meta && meta.width), mh = posNum(meta && meta.height);
  const v = page ? pageViewportFor(page, pw, ph) : null;
  if (pw && ph) {
    if (v) return { picW: pw, picH: ph, cssW: v.width, cssH: v.height, source: 'page' };
    if (mw && mh && sameAspect(mw, mh, pw, ph)) return { picW: pw, picH: ph, cssW: mw, cssH: mh, source: 'metadata' };
    return { picW: pw, picH: ph, cssW: pw, cssH: ph, source: 'picture' };
  }
  if (v) return { picW: v.width, picH: v.height, cssW: v.width, cssH: v.height, source: 'page' };
  if (mw && mh) return { picW: mw, picH: mh, cssW: mw, cssH: mh, source: 'metadata' };
  return null;
}
/** A base64 JPEG's pixel size off its SOF marker, decoding only the head (no
 *  Buffer: the bundle carries this module). `{width, height}` or null. The
 *  bridge reads it off every frame to notice a picture that changed size. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function jpegSize(b64, { maxChars = 65536 } = {}) {
  if (typeof b64 !== 'string' || b64.length < 8) return null;
  // the SOF of a browser's JPEG sits in its first ~200 bytes: decode a small head first
  if (maxChars > 2048) { const quick = jpegSize(b64, { maxChars: 2048 }); if (quick) return quick; }
  const n = Math.min(b64.length, maxChars) & ~3;
  const bytes = [];
  for (let i = 0; i < n; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (b64[i + k] === '=' ? -2 : B64.indexOf(b64[i + k])));
    if (c[0] < 0 || c[1] < 0) break;
    bytes.push((c[0] << 2) | (c[1] >> 4));
    if (c[2] < 0) break; bytes.push(((c[1] & 15) << 4) | (c[2] >> 2));
    if (c[3] < 0) break; bytes.push(((c[2] & 3) << 6) | c[3]);
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    if (m === 0xff) { i++; continue; }                                  // fill byte
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // no length
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (i + 8 >= bytes.length) return null;
      const height = (bytes[i + 5] << 8) | bytes[i + 6], width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width && height ? { width, height } : null;
    }
    if (m === 0xda || len < 2) return null;                              // scan data before a SOF: not a baseline/progressive frame we can size
    i += 2 + len;
  }
  return null;
}
/** Which CDP page target's layout metrics describe the picture: the one whose
 *  url is the stream's ACTIVE tab (agent-browser's own `tabs` record), else the
 *  first ordinary page (tabs of one window share its viewport). `targets` =
 *  `/json/list` rows. Null when there is no page at all. */
function pickViewportTarget(targets, { activeUrl = '' } = {}) {
  const pages = (Array.isArray(targets) ? targets : []).filter((t) => t && t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string');
  if (!pages.length) return null;
  const u = String(activeUrl || '');
  return (u && pages.find((t) => t.url === u)) || pages.find((t) => !/^(chrome|devtools|chrome-extension):/.test(String(t.url || ''))) || pages[0];
}
/** The upstream records a viewer is never handed: the daemon's own `cdp_url`
 *  command/result pair (the bridge asks it for the viewport read — the raw
 *  CDP endpoint never leaves the server, the mediator's rule). */
function privateUpstream(msg) {
  return !!(msg && (msg.type === 'command' || msg.type === 'result') && (msg.action === 'cdp_url' || (msg.params && msg.params.action === 'cdp_url')));
}

/**
 * Naive study 2 (finding 2, 2026-09-25): ONE live view per session. "Open live view" (the status-bar chip's menu,
 * the session card, the phone's switcher, Session Properties) opened a NEW window on every click. A MANUAL open
 * (no `syncId` given) FOCUSES the session's existing view — switching its pane when another one is asked for,
 * reconnecting it when it is not connected — and only when there is none creates one under the auto-bind's
 * deterministic id `win-blive-<session>` (so a manual open and the auto-bind converge on ONE window, on every
 * client). A replay / the auto-bind (a `syncId` given) is the layout's own act and is left alone.
 *   views: [{ id, sessionId, profileRef, connected }]
 * → { act: 'focus', id, switchTo: ref|null, reconnect } | { act: 'create', syncId }
 */
function liveViewPlan({ views = [], sessionId = '', profileId = null, syncId = null } = {}) {
  if (syncId) return { act: 'create', syncId };
  const sid = String(sessionId || '');
  const v = (Array.isArray(views) ? views : []).find((w) => w && w.sessionId === sid);
  if (!v) return { act: 'create', syncId: 'win-blive-' + sid };
  const want = profileId ? String(profileId) : null;
  const switchTo = want && want !== String(v.profileRef || '') ? want : null;
  return { act: 'focus', id: v.id, switchTo, reconnect: !switchTo && !v.connected };
}
/**
 * Naive study 2 (finding 3): does the digest (`browser-profiles-updated`: `browsers` + `ephemerals`) say the browser
 * a STOPPED view shows runs again? A view never starts a browser; it resumes when its browser runs.
 * → true | false | null (the target is not one this digest can answer for).
 */
function viewTargetRunning({ target = null, digest = null } = {}) {
  if (!target || !digest) return null;
  // lane H verify r5 (MINOR 2): `ready` alone is the DAEMON — a browser it had that closed (`browserLost`) or a close verdict
  // (`browser_closed` / `browser_unstable` / `profile_locked`) with no browser is not running (a view greyed by it waits)
  if (target.kind === 'attachment' && target.profileId) { const b = digest.browsers ? digest.browsers[target.profileId] : null; return !!(b && b.state === 'ready' && !(!b.browser && (b.closed || b.browserLost))); }
  if (target.kind === 'ephemeral') {
    const bk = String(target.ns || '').replace(/^vs-/, '');
    const e = Array.isArray(digest.ephemerals) ? digest.ephemerals.find((x) => x && x.browserKey === bk) : null;
    return !!(e && e.state === 'ready');
  }
  return null;
}
/** The window's title: "<profile or ephemeral> · <session name>" — the
 *  profile of the pane you are looking at (§3.7). */
function liveTitle({ label = null, alias = null, sessionName = '', ephemeralWord = 'ephemeral' } = {}) {
  const who = label || alias || ephemeralWord;
  return sessionName ? `${who} · ${sessionName}` : String(who);
}

// ── MULTIVIEW (docs/design-browser-multiview.zh.md §2 A1 / §4 B-89d0 / D3 / D4) ──
// ONE session, N browsers, ONE strip. The list below is what the strip shows
// and what the `own/cap` chip counts; it is DERIVED from the keeper's own
// status answer (GET /api/browser/session/:id — `attachments`, `ephemeral`,
// `children`, `inputs`, `leases`), never from a second store. Only these
// three kinds exist in v1 (the fourth, an agent-opened desktop Chrome, waits
// for E2 — §5 item 6); anything else in the answer never becomes a row.
// EPHEMERAL_REF (lane H, above — '~ephemeral') is the ref a strip tab / a pop-out openSpec names the session's
// OWN ephemeral browser by: never a valid alias (aliases start with [a-z0-9]) nor an id. ONE spelling (the
// integration of 2.369.183 — lane P had minted '~ephemeral' beside it; '~ephemeral' is persisted in 2.369.180 layouts).
const LIST_KINDS = Object.freeze(['attachment', 'ephemeral', 'child']);
/** running = a command in flight (only the relay knows — the client passes it
 *  as `activity`); idle = the browser process is live; released = not live
 *  (released after the turn, idled out, stopped by the user, never started —
 *  the NEXT COMMAND starts it again, a view never does); ended = failed. */
const ROW_STATES = Object.freeze(['running', 'idle', 'released', 'ended']);
/** The same spelling as browser-profiles.CHILD_KEY_RE (this module imports
 *  nothing; test-browser-handles pins the two sources equal). */
const CHILD_HANDLE_RE = /^bk-[0-9a-f]{8}\.\d{1,4}$/;
function rowStateOf(b) {
  if (!b || typeof b !== 'object') return 'released';
  const st = String(b.state || '');
  if (st === 'starting' || st === 'ready') return 'idle';
  if (st === 'failed') return 'ended';
  return 'released';
}
/**
 * THE STRIP'S LIST — PURE over the status answer. Every row:
 *   { ref, kind, label, state, driver, isDefault, owners, profileId, helper }
 *   ref     what the view asks the bridge for (`profile=`): a profile id, EPHEMERAL_REF, a child handle
 *   driver  'agent' | 'helper' | 'you' — 'you' while the USER holds the input side (keeper `inputs`)
 *   owners  how many OTHER conversations hold a lease on the same profile (a count, never a name)
 *   helper  { name, n } for a child row — `name` only when a WITNESS paired it (see bindHelpers)
 * `activity` (ref → true) upgrades a live row to 'running'; `helpers` is the
 * session's witness state (bindHelpers) — absent ⇒ every helper is "Helper N".
 * Order: attachments (the keeper's lease order), the ephemeral browser, the
 * children by their number. The client keeps a window's first-seen order on
 * top of this (stripOrder) so a new row lands at the TAIL.
 */
function browserListFor(status, { activity = null, helpers = null } = {}) {
  if (!isObj(status)) return [];
  const bk = String(status.browserKey || '');
  const inputs = Array.isArray(status.inputs) ? status.inputs.filter(isObj) : [];
  const leases = Array.isArray(status.leases) ? status.leases.filter(isObj) : [];
  const busy = (ref) => !!(activity && (activity instanceof Map ? activity.get(ref) : activity[ref]));
  const drivenByUser = (key, profileId) => inputs.some((s) => s.input === 'user' && String(s.browserKey || '') === key && (s.profileId || null) === (profileId || null));
  const stateFor = (ref, b) => { const s = rowStateOf(b); return s === 'idle' && busy(ref) ? 'running' : s; };
  const rows = [];
  const seen = new Set();
  const push = (r) => { if (!r.ref || seen.has(r.ref) || !LIST_KINDS.includes(r.kind)) return; seen.add(r.ref); rows.push(r); };
  for (const a of Array.isArray(status.attachments) ? status.attachments : []) {
    if (!isObj(a) || typeof a.profileId !== 'string' || !a.profileId) continue;
    const l = leases.find((x) => x.profileId === a.profileId && String(x.browserKey || '') === bk) || null;
    push({ ref: a.profileId, kind: 'attachment', profileId: a.profileId, alias: a.alias || null, label: String(a.label || a.alias || a.profileId), state: stateFor(a.profileId, l ? l.browser : null), driver: drivenByUser(bk, a.profileId) ? 'you' : 'agent', isDefault: !!a.isDefault, owners: l ? Math.max(0, Number(l.others) || 0) : 0, helper: null });
  }
  const e = isObj(status.ephemeral) ? status.ephemeral : null;
  if (e && !e.child && String(e.browserKey || '') === bk && typeof e.profileId === 'string') {
    push({ ref: EPHEMERAL_REF, kind: 'ephemeral', profileId: e.profileId, alias: null, label: null, state: stateFor(EPHEMERAL_REF, e), driver: drivenByUser(bk, null) ? 'you' : 'agent', isDefault: !rows.length, owners: 0, helper: null });
  }
  const kids = (Array.isArray(status.children) ? status.children : []).filter((c) => isObj(c) && CHILD_HANDLE_RE.test(String(c.handle || '')) && String(c.handle).slice(0, String(c.handle).indexOf('.')) === bk);
  kids.sort((x, y) => childN(x.handle) - childN(y.handle));
  // the route answers `helperNames` (handle → name) beside the status; a caller holding the raw witness state passes `helpers`
  const names = isObj(status.helperNames) ? status.helperNames : helperNames(helpers);
  for (const c of kids) {
    const h = String(c.handle);
    const b = isObj(c.browser) ? c.browser : null;
    push({ ref: h, kind: 'child', profileId: b && typeof b.profileId === 'string' ? b.profileId : null, alias: null, label: null, state: stateFor(h, b), driver: drivenByUser(h, null) ? 'you' : 'helper', isDefault: false, owners: 0, helper: { name: names[h] || null, n: childN(h) } });
  }
  return rows;
}
function childN(handle) { const s = String(handle || ''); const i = s.indexOf('.'); return i < 0 ? 0 : Number(s.slice(i + 1)) || 0; }
/** How many of a list's rows hold a LIVE browser (the chip's numerator). */
function ownLiveCount(rows) { return (rows || []).filter((r) => r && (r.state === 'running' || r.state === 'idle')).length; }

// ── helper naming by WITNESS, never by time or order (§4 B-89d0) ──
// `new-child` is called by a sub-agent with its parent's token, so the server
// cannot tell WHICH helper asked. What it can see: the claude stdout carries
// the sub-agent's Bash tool_use naming `vibespace-browser new-child` under
// `parent_tool_use_id` = the Task tool_use whose input names the helper
// (`description`), and later that Bash call's tool_result (the CLI's own
// words, which print the handle it minted).
// lane P verify (finding 4, 2026-09-26): the pairing is decided at the
// witness's CLOSE, over its WINDOW (tool_use … tool_result). A child is named
// only when EXACTLY ONE mint arrived inside that window, NO other witness was
// open at any moment of it, and the result's text names that very handle (a
// whole token). A mint that arrives while no witness is open (a helper whose
// `new-child` ran inside a script, a witness the JSONL watcher delivers late,
// a background Bash) is "Helper N" for good — never claimed by a later
// witness. The old rule paired the open halves by ORDER, so a script's mint
// inside another helper's window took that helper's Task description. A codex
// helper (no such signal on its stdout) is never witnessed ⇒ always "Helper N".
const NEW_CHILD_RE = /(^|[\s;&|(`'"])vibespace-browser\s+(?:--\S+\s+)*new-child\b/;
/** The Task tool_uses a parent-line assistant record opens: [{id, description, agentType}]. */
function taskOpeningsOf(msg) {
  if (!isObj(msg) || msg.type !== 'assistant' || msg.parent_tool_use_id || msg.isSidechain) return [];
  const content = isObj(msg.message) && Array.isArray(msg.message.content) ? msg.message.content : [];
  const out = [];
  for (const b of content) {
    if (!isObj(b) || b.type !== 'tool_use' || (b.name !== 'Task' && b.name !== 'Agent') || typeof b.id !== 'string') continue;
    const inp = isObj(b.input) ? b.input : {};
    out.push({ id: b.id, description: typeof inp.description === 'string' ? inp.description.slice(0, 120) : '', agentType: typeof inp.subagent_type === 'string' ? inp.subagent_type.slice(0, 60) : '' });
  }
  return out;
}
/** A sidechain assistant record's `vibespace-browser new-child` witnesses: [{id, parent}]. */
function newChildWitnessesOf(msg, parentToolUseId = null) {
  if (!isObj(msg) || msg.type !== 'assistant') return [];
  const parent = String(parentToolUseId || msg.parent_tool_use_id || '');
  if (!parent) return [];
  const content = isObj(msg.message) && Array.isArray(msg.message.content) ? msg.message.content : [];
  const out = [];
  for (const b of content) {
    if (!isObj(b) || b.type !== 'tool_use' || b.name !== 'Bash' || typeof b.id !== 'string') continue;
    const cmd = isObj(b.input) && typeof b.input.command === 'string' ? b.input.command : '';
    if (NEW_CHILD_RE.test(cmd)) out.push({ id: b.id, parent });
  }
  return out;
}
const RESULT_TEXT_MAX = 4096;
/** A sidechain user record's tool_results: [{id, text}] (the text a string or the text blocks, capped). The caller keeps only ids that are open witnesses. */
function witnessClosesOf(msg, parentToolUseId = null) {
  if (!isObj(msg) || msg.type !== 'user') return [];
  if (!String(parentToolUseId || msg.parent_tool_use_id || '')) return [];
  const content = isObj(msg.message) && Array.isArray(msg.message.content) ? msg.message.content : [];
  const out = [];
  for (const b of content) {
    if (!isObj(b) || b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue;
    const c = b.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (isObj(x) && typeof x.text === 'string' ? x.text : '')).join('\n') : '';
    out.push({ id: b.tool_use_id, text: text.slice(0, RESULT_TEXT_MAX) });
  }
  return out;
}
/** Does `text` name `handle` as a whole token (`bk-….1` is not named by `bk-….10`)? */
function namesHandle(text, handle) {
  const h = String(handle || ''); if (!h) return false;
  const t = String(text || '');
  let i = t.indexOf(h);
  while (i >= 0) {
    const before = i === 0 ? '' : t[i - 1], after = t[i + h.length] || '';
    if (!/[\w.-]/.test(before) && !/[\w.]/.test(after)) return true;
    i = t.indexOf(h, i + 1);
  }
  return false;
}
/** A fresh witness state: tasks (Task id → {description, agentType}), witnesses, children. */
function newHelperState() { return { tasks: {}, witnesses: [], children: [] }; }
/**
 * ONE event into the witness state (PURE — returns a NEW state):
 *   { kind:'task', id, description, agentType }   a Task tool_use opened on the parent line
 *   { kind:'witness', id, parent }                 a sidechain Bash tool_use naming `new-child` — its window OPENS
 *   { kind:'child', handle }                       the keeper minted a child handle for this conversation
 *   { kind:'witness-close', id, text }             that Bash call's tool_result — its window CLOSES and is judged
 * A witness = { id, parent, open, mints (≤ 2 kept: two already means "not one"), overlapped, handle };
 * a child = { handle, witness, orphan } (orphan = minted while no witness was open ⇒ numbered for good).
 */
function bindHelpers(state, ev) {
  const st = isObj(state) ? state : newHelperState();
  const next = {
    tasks: { ...(isObj(st.tasks) ? st.tasks : {}) },
    witnesses: (Array.isArray(st.witnesses) ? st.witnesses : []).filter(isObj).map((w) => ({ ...w, mints: Array.isArray(w.mints) ? w.mints.slice(0, 2) : [] })),
    children: (Array.isArray(st.children) ? st.children : []).filter(isObj).map((c) => ({ ...c })),
  };
  if (!isObj(ev)) return next;
  const open = () => next.witnesses.filter((w) => w.open);
  if (ev.kind === 'task' && typeof ev.id === 'string') next.tasks[ev.id] = { description: String(ev.description || '').slice(0, 120), agentType: String(ev.agentType || '').slice(0, 60) };
  else if (ev.kind === 'witness' && typeof ev.id === 'string' && !next.witnesses.some((w) => w.id === ev.id)) {
    const o = open();
    for (const w of o) w.overlapped = true;           // two windows open at once ⇒ neither can be judged
    next.witnesses.push({ id: ev.id, parent: String(ev.parent || ''), open: true, mints: [], overlapped: o.length > 0, handle: null });
  } else if (ev.kind === 'child' && CHILD_HANDLE_RE.test(String(ev.handle || '')) && !next.children.some((c) => c.handle === ev.handle)) {
    const o = open();
    next.children.push({ handle: String(ev.handle), witness: null, orphan: o.length === 0 });
    for (const w of o) if (w.mints.length < 2) w.mints.push(String(ev.handle));
  } else if (ev.kind === 'witness-close' && typeof ev.id === 'string') {
    const w = next.witnesses.find((x) => x.id === ev.id && x.open);
    if (!w) return next;
    w.open = false;
    if (!w.overlapped && w.mints.length === 1) {
      const c = next.children.find((x) => x.handle === w.mints[0]);
      if (c && !c.witness && !c.orphan && namesHandle(ev.text, c.handle)) { c.witness = w.id; w.handle = c.handle; }
    }
  } else return next;
  // keep the state bounded (a long conversation mints many helpers): the last 64 of each
  if (next.witnesses.length > 64) next.witnesses = next.witnesses.slice(-64);
  if (next.children.length > 64) next.children = next.children.slice(-64);
  const keepTasks = new Set(next.witnesses.map((w) => w.parent));
  const ids = Object.keys(next.tasks);
  if (ids.length > 128) for (const id of ids.slice(0, ids.length - 128)) if (!keepTasks.has(id)) delete next.tasks[id];
  return next;
}
/** handle → the helper's name (its Task description, else its agent type) — only for a WITNESSED child. */
function helperNames(state) {
  const out = {};
  if (!isObj(state)) return out;
  const tasks = isObj(state.tasks) ? state.tasks : {};
  for (const c of Array.isArray(state.children) ? state.children : []) {
    if (!c || !c.witness) continue;
    const w = (state.witnesses || []).find((x) => x && x.id === c.witness);
    const t = w && tasks[w.parent];
    const name = t ? (t.description || t.agentType || '') : '';
    if (name) out[c.handle] = name;
  }
  return out;
}

module.exports = {
  STREAM_PATH, BACKPRESSURE, MAX_FPS_DEFAULT, MAX_FPS_CAP, UPSTREAM_TYPES, REPLAYED_TYPES, MODES, VIEWER_INPUT_TYPES, VIEWER_CONTROL_TYPES, KEY_MODIFIERS,
  EPHEMERAL_REF, sessionNameFor, classifyUpstream, parseStreamStatus, streamPlan, originHeaderFor, streamTargetFor, pairsToEnv,
  // naive study 2: the sub-agent tap ref (finding 4), one view per session (finding 2), a stopped view resumes (finding 3)
  CHILD_REF_PREFIX, childRefFor, childKeyOfRef, liveViewPlan, viewTargetRunning,
  clampFps, maxFpsAcross, viewerMessageVerdict, frameGate, backpressureVerdict, hello, drawnRect, pointerToDevice, deviceToViewport, liveTitle,
  // lane J (inc-muhgv0fb-9i4u): the picture vs the page — two sizes, one basis
  toLocal, frameGeometry, pageViewportFor, sameAspect, jpegSize, pickViewportTarget, privateUpstream, SCROLLBAR_MAX_PX,
  // P3 (§4.3): the viewer's input as the stream server's CDP-shaped records
  modifiersOf, mouseRecord, wheelRecord, keyRecord, touchRecord,
  // lane J r2: the picture's placement (top-aligned) and text a viewer hands the page (a paste, an IME composition)
  LIVE_ALIGN, ALIGNS, textRecords, TEXT_CHUNK, TEXT_MAX,
  // MULTIVIEW (design-browser-multiview §2 / §4 / D3): the strip's list, the helper witness
  LIST_KINDS, ROW_STATES, CHILD_HANDLE_RE, rowStateOf, browserListFor, ownLiveCount, childN,
  NEW_CHILD_RE, taskOpeningsOf, newChildWitnessesOf, witnessClosesOf, namesHandle, newHelperState, bindHelpers, helperNames,
};
