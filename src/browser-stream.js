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
const VIEWER_CONTROL_TYPES = Object.freeze(['takeover', 'handback', 'confirm']);
/** CDP's modifier bitmask, the one the stream server expects (measured off
 *  the dashboard's own bundle: alt 1, ctrl 2, meta 4, shift 8). */
const KEY_MODIFIERS = Object.freeze({ alt: 1, ctrl: 2, meta: 4, shift: 8 });

const sessionNameFor = (key) => 'vs-' + String(key || '');
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
 * (browser-profiles.attachmentsFor), `profileRef` a handle / profile id / '' .
 * Answers a typed target or a typed refusal — never throws.
 *   { ok:true, kind:'attachment', profileId, alias, label, isDefault, chosen:'named'|'default'|'only'|'first', ns, sessionName, dir }
 *   { ok:true, kind:'ephemeral', ns, sessionName, envPairs }
 *   { ok:false, code:'not_attached'|'no-browser'|'no-key', error, handles }
 */
function streamTargetFor({ browserKey, set = null, profileRef = '', envPairs = null, profiles = [] } = {}) {
  const bk = String(browserKey || '');
  if (!bk) return { ok: false, code: 'no-key', error: 'this session has no browser key (browser isolation is off, or it predates the feature) — nothing to view', handles: [] };
  const atts = (set && Array.isArray(set.attachments)) ? set.attachments : [];
  const handles = atts.map((a) => a.alias + (a.isDefault ? ' [default]' : ''));
  const byId = (id) => (profiles || []).find((p) => p && p.id === id) || null;
  const mk = (a, chosen) => {
    const p = byId(a.profileId);
    return { ok: true, kind: 'attachment', profileId: a.profileId, alias: a.alias, label: a.label || (p ? p.label : a.profileId), isDefault: !!a.isDefault, chosen, ns: sessionNameFor(a.profileId), sessionName: sessionNameFor(bk), dir: p ? p.dir : (a.dir || null) };
  };
  const ref = String(profileRef || '').trim();
  if (ref) {
    const a = atts.find((x) => x.alias === ref) || atts.find((x) => x.profileId === ref);
    if (!a) return { ok: false, code: 'not_attached', error: `this session is not attached to ${JSON.stringify(ref)}${handles.length ? ' — its attachments: ' + handles.join(', ') : ''}`, handles };
    return mk(a, 'named');
  }
  const def = atts.find((x) => x.isDefault);
  if (def) return mk(def, 'default');
  if (atts.length === 1) return mk(atts[0], 'only');
  if (atts.length > 1) return mk(atts[0], 'first');
  const pairs = Array.isArray(envPairs) ? envPairs.filter((s) => typeof s === 'string' && /^AGENT_BROWSER_[A-Z_]+=/.test(s)) : [];
  if (!pairs.length) return { ok: false, code: 'no-browser', error: 'this session has no browser of its own (browser isolation is off for it, or it runs on another machine) — nothing to view', handles };
  return { ok: true, kind: 'ephemeral', profileId: null, alias: null, label: null, isDefault: false, chosen: 'ephemeral', ns: sessionNameFor(bk), sessionName: sessionNameFor(bk), envPairs: pairs };
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
function keyRecord({ kind = 'down', key = '', code = '', modifiers = 0 } = {}) {
  const k = String(key || '');
  if (!k) return null;
  const eventType = kind === 'up' ? 'keyUp' : 'keyDown';
  const printable = k.length === 1;
  const text = eventType === 'keyDown' ? (KEY_TEXT[k] !== undefined ? KEY_TEXT[k] : (printable ? k : undefined)) : undefined;
  const vk = printable ? k.toUpperCase().charCodeAt(0) : (k === 'Enter' ? 13 : k === 'Tab' ? 9 : k === 'Backspace' ? 8 : k === 'Escape' ? 27 : k === 'ArrowLeft' ? 37 : k === 'ArrowUp' ? 38 : k === 'ArrowRight' ? 39 : k === 'ArrowDown' ? 40 : k === 'Delete' ? 46 : 0);
  const r = { type: 'input_keyboard', eventType, key: k, code: String(code || ''), windowsVirtualKeyCode: vk, modifiers: Number(modifiers) || 0 };
  if (text !== undefined) r.text = text;
  return r;
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
    target: target && target.ok ? { kind: target.kind, profileId: target.profileId || null, alias: target.alias || null, label: target.label || null, isDefault: !!target.isDefault, chosen: target.chosen } : null,
    protocol: { frames: 'latest-wins', ordered: UPSTREAM_TYPES.filter((t) => t !== 'frame'), input: 'holder-only', control: VIEWER_CONTROL_TYPES.slice(), upstreamVersion: upstreamVersion || null },
  };
}

// ── DPI (§4.4) ──────────────────────────────────────────────────────────────
/** Where the JPEG is actually DRAWN inside an element sized with
 *  object-fit: contain — the letterboxed rect, in the SAME px space as the
 *  element rect handed in (viewport px from getBoundingClientRect). */
function drawnRect(elRect, frameW, frameH) {
  const W = Number(elRect && elRect.width) || 0, H = Number(elRect && elRect.height) || 0;
  const fw = Number(frameW) || 0, fh = Number(frameH) || 0;
  const left = Number(elRect && elRect.left) || 0, top = Number(elRect && elRect.top) || 0;
  if (!W || !H || !fw || !fh) return { left, top, width: W, height: H, scale: 0 };
  const scale = Math.min(W / fw, H / fh);
  const width = fw * scale, height = fh * scale;
  return { left: left + (W - width) / 2, top: top + (H - height) / 2, width, height, scale };
}
/** A pointer event's viewport coordinates → the frame's DEVICE pixels, or
 *  null when the point is outside the drawn picture. ONE helper, used for
 *  every pointer → browser conversion (the desktop window's lesson). */
function pointerToDevice({ clientX, clientY, elRect, frameW, frameH }) {
  const r = drawnRect(elRect, frameW, frameH);
  if (!r.scale) return null;
  const x = (Number(clientX) - r.left) / r.width;
  const y = (Number(clientY) - r.top) / r.height;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x: Math.round(x * Number(frameW)), y: Math.round(y * Number(frameH)) };
}
/** The inverse (P3's agent cursor): the frame's DEVICE px → a point in the
 *  SAME px space as `elRect` (viewport px), or null when the frame has no
 *  size yet. Same helper family as `pointerToDevice`, so the two never drift. */
function deviceToViewport({ x, y, elRect, frameW, frameH }) {
  const r = drawnRect(elRect, frameW, frameH);
  if (!r.scale || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  return { left: r.left + (Number(x) / Number(frameW)) * r.width, top: r.top + (Number(y) / Number(frameH)) * r.height };
}

/** The window's title: "<profile or ephemeral> · <session name>" — the
 *  profile of the pane you are looking at (§3.7). */
function liveTitle({ label = null, alias = null, sessionName = '', ephemeralWord = 'ephemeral' } = {}) {
  const who = label || alias || ephemeralWord;
  return sessionName ? `${who} · ${sessionName}` : String(who);
}

module.exports = {
  STREAM_PATH, BACKPRESSURE, MAX_FPS_DEFAULT, MAX_FPS_CAP, UPSTREAM_TYPES, REPLAYED_TYPES, MODES, VIEWER_INPUT_TYPES, VIEWER_CONTROL_TYPES, KEY_MODIFIERS,
  sessionNameFor, classifyUpstream, parseStreamStatus, streamPlan, originHeaderFor, streamTargetFor, pairsToEnv,
  clampFps, maxFpsAcross, viewerMessageVerdict, frameGate, backpressureVerdict, hello, drawnRect, pointerToDevice, deviceToViewport, liveTitle,
  // P3 (§4.3): the viewer's input as the stream server's CDP-shaped records
  modifiersOf, mouseRecord, wheelRecord, keyRecord, touchRecord,
};
