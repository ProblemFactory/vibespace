'use strict';
/**
 * THE MACHINE-DESKTOP HAND-OVER — PURE (lane desktop-handover; the owner 2026-10-19 「把远程桌面的控制权交给 agent」). The
 * owner HANDS a paired machine's desktop — the live stream of its machine-desktop window (src/lib/machine-desktop.js) — to
 * ONE agent conversation; that conversation drives it with `vibespace-window` verbs on the handle `md-<hostId>` (pixels
 * only: no tree), through the SAME records the owner's own keyboard and mouse send down the stream's data channel
 * (src/lib/stream-input.js → src/stream-model.js inputEventOf), delivered by the `desktop-input` device op into THAT stream
 * session's own sink (src/agentd/stream-host.js — one implementation), and reads it with `desktop-grab` (ONE still of the
 * display the window shows, in the picture's pixels). The owner watches; their own key / pointer / wheel PAUSES the agent;
 * one press takes it back. The decisions are here; the ORCH half is src/server/desktop-handover-engine.js.
 *
 *   handleOf(hostId) / hostOfHandle(handle)   `md-<hostId>` (isMachineHandle)
 *   leaseStep(lease, ev, now)   THE STATE TABLE → { lease (null = no lease), end (the cause, when it ended), changed }:
 *       give            (none | another holder's) → input 'agent' — only the owner's route sends it
 *       owner-input     agent → user (`window_paused` for every verb) — the owner's key / pointer / wheel in the window;
 *                       while rebinding, the next stream comes back PAUSED (fix r2: a key pressed mid-switch is the owner's)
 *       resume          user → agent — the owner's 「继续交给它」
 *       revoke          → gone `revoked` — the owner's 「收回」
 *       stream-ended    why 'switched' (the strip's display switch) → `rebinding` (the window's next stream of the same
 *                       machine binds it, within REBIND_MS); why 'closed' → gone `window_closed` (no window, no lease: the
 *                       owner must be able to watch); any other end → gone `stream_ended`
 *       rebind          rebinding → the input it had (the new stream's key / sid / display; the last still forgotten)
 *       rebind-timeout  rebinding → gone `stream_ended`
 *       daemon-gone     → gone `daemon_gone` (the machine's agent answered not_found for the stream session — it restarted)
 *       holder-gone     → gone `conversation_ended`
 *       agent-done      → gone `agent_done` (the holder's own `detach` — handing it BACK, never on to anyone)
 *   agentVerdict(lease, callerKeys)   null = may act now | { code, error }: desktop_not_handed (no lease of THIS
 *       conversation — no verb can ask for one; the door is the owner's), window_paused (the owner is driving),
 *       desktop_switching (the window is changing displays — again in a moment)
 *   pointVerdict(at, size)      a point of the last still, else outside_display (or screenshot_first: no size known yet)
 *   clickRecords / scrollRecords / chordRecords / typeRecords   the agent's verbs → the data channel's records (picture
 *       pixels + the source's origin — what pointerMessage / wheelMessage / keyMessage send for the same act)
 *   chordVerdict — CHORD_REFUSED: the chords that lock, log off or power the machine are refused BY NAME
 *   chunkRecords(records, max)  one device op's worth at a time, cut only where nothing is held down (fix r2: the lease is
 *       re-asked between chunks — a chunk never sent strands no key); charsTyped(records, sent) — a `--keys` type's characters
 *       in the first `sent` records
 */

const MM = require('./lib/modifier-map.js'); // THE primary-modifier table (the .287 rule) — the paste's modifier is the machine's primary

const HANDLE_PREFIX = 'md-';
const HOST_RE = /^[A-Za-z0-9._-]{1,64}$/;
const LIMITS = Object.freeze({
  typeMaxChars: 1500,     // a `type` call's text (the window verbs' cap)
  scrollMaxNotches: 20,   // a `scroll --by` (the window verbs' 1..20)
  scrollDefault: 3,
  rebindMs: 20000,        // a display switch: the window's next stream must come within this
  holderGraceMs: 60000,   // a holder conversation not live this long ⇒ conversation_ended (a respawn blink keeps it)
  dotMs: 4000,            // the agent's pointer dot stays this long after its last act
});
const BUTTONS = Object.freeze({ 1: 0, 2: 1, 3: 2 }); // the CLI's --button (X11: 1 left, 2 middle, 3 right) → the record's b (DOM)

function handleOf(hostId) { const h = String(hostId || ''); return h !== 'local' && HOST_RE.test(h) ? HANDLE_PREFIX + h : null; }
function hostOfHandle(handle) { const s = String(handle || ''); if (!s.startsWith(HANDLE_PREFIX)) return null; const h = s.slice(HANDLE_PREFIX.length); return h !== 'local' && HOST_RE.test(h) ? h : null; }
const isMachineHandle = (handle) => hostOfHandle(handle) != null;

/** How a lease ended, in words (the audit line, the CLI's refusal, the strip's toast keys off the cause). */
const END_WHY = Object.freeze({
  revoked: 'the owner took the desktop back',
  window_closed: 'the owner closed the machine\'s desktop window (no window, no hand-over: the owner must be able to watch)',
  stream_ended: 'the machine\'s stream ended',
  conversation_ended: 'the conversation it was handed to ended',
  agent_done: 'the agent handed it back',
  replaced: 'the owner handed it to another conversation',
  daemon_gone: 'the machine\'s agent lost the stream (it restarted)',
});

/** THE STATE TABLE (the module's header). `lease` = null | { handle, hostId, holder: {key, webuiId, name}, input: 'agent' |
 *  'user' | 'rebinding', streamKey, sid, display, since, pausedAt, resumeTo, rebindSince, shot }. */
function leaseStep(lease, ev, now = 0) {
  const e = ev || {};
  const gone = (cause) => ({ lease: null, end: cause, changed: true });
  const same = { lease: lease || null, end: null, changed: false };
  if (e.type === 'give') {
    const h = e.holder || {};
    if (!handleOf(e.hostId) || !h.key || !e.streamKey) return same;
    return { lease: { handle: handleOf(e.hostId), hostId: String(e.hostId), holder: { key: String(h.key), webuiId: h.webuiId != null ? String(h.webuiId) : null, name: h.name != null ? String(h.name) : null }, input: 'agent',
      streamKey: String(e.streamKey), sid: e.sid != null ? String(e.sid) : null, display: e.display != null ? String(e.display) : null, platform: e.platform || null, since: now, pausedAt: null, resumeTo: null, rebindSince: null, shot: null },
    end: lease ? 'replaced' : null, changed: true };
  }
  if (!lease) return same;
  switch (e.type) {
    case 'owner-input':
      if (lease.input === 'agent') return { lease: { ...lease, input: 'user', pausedAt: now }, end: null, changed: true };
      return lease.input === 'rebinding' && lease.resumeTo !== 'user' ? { lease: { ...lease, resumeTo: 'user', pausedAt: now }, end: null, changed: true } : same;
    case 'resume': return lease.input === 'user' ? { lease: { ...lease, input: 'agent', pausedAt: null }, end: null, changed: true } : same;
    case 'revoke': return gone('revoked');
    case 'holder-gone': return gone('conversation_ended');
    case 'agent-done': return gone('agent_done');
    case 'stream-ended':
      if (String(e.streamKey || '') !== lease.streamKey) return same; // another window's stream of the same machine
      if (e.why === 'switched') return { lease: { ...lease, input: 'rebinding', resumeTo: lease.input === 'rebinding' ? lease.resumeTo : lease.input, rebindSince: now, shot: null }, end: null, changed: true };
      return gone(e.why === 'closed' ? 'window_closed' : 'stream_ended');
    case 'rebind':
      if (lease.input !== 'rebinding' || !e.streamKey) return same;
      return { lease: { ...lease, input: lease.resumeTo || 'agent', resumeTo: null, rebindSince: null, streamKey: String(e.streamKey), sid: e.sid != null ? String(e.sid) : null, display: e.display != null ? String(e.display) : lease.display, shot: null }, end: null, changed: true };
    case 'rebind-timeout': return lease.input === 'rebinding' && now - (lease.rebindSince || 0) >= LIMITS.rebindMs ? gone('stream_ended') : same;
    case 'daemon-gone': return String(e.streamKey || '') === lease.streamKey ? gone('daemon_gone') : same;
    default: return same;
  }
}

const DOOR = 'its owner hands a machine\'s desktop to one conversation from that machine\'s desktop window (the strip\'s "Hand to an agent" / 交给 agent) — no verb of yours can ask for it or take it; say in your reply what you need it for';
/** May the caller (every key it answers to) act on this lease now? → null | { code, error } */
function agentVerdict(lease, callerKeys = []) {
  const keys = Array.isArray(callerKeys) ? callerKeys.map(String) : [];
  if (!lease || !lease.holder || !keys.includes(lease.holder.key)) return { code: 'desktop_not_handed', error: `this machine's desktop is not handed to you — ${DOOR}` };
  if (lease.input === 'user') return { code: 'window_paused', error: 'the owner is using this desktop right now (their own key, pointer or wheel paused you) — wait until they press 「继续交给它」 / "Hand back to the agent"; do not retry in a loop' };
  if (lease.input === 'rebinding') return { code: 'desktop_switching', error: 'the owner is switching the window to another display — take a new screenshot in a moment (its pixels change)' };
  return null;
}

const int = (v) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^-?\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : null);
/** `at` = "x,y" | {x, y} → { x, y } | null */
function parseAt(at) {
  if (at && typeof at === 'object') { const x = int(at.x), y = int(at.y); return x == null || y == null ? null : { x, y }; }
  const m = /^\s*(-?\d{1,6})\s*,\s*(-?\d{1,6})\s*$/.exec(String(at == null ? '' : at));
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}
/** A point of the last still (`size` = {w, h}) → null (inside) | { code, error } */
function pointVerdict(at, size) {
  const p = parseAt(at);
  if (!p) return { code: 'bad-request', error: '--at is x,y — two whole numbers, a pixel of `vibespace-window screenshot <handle>`' };
  if (!size || !(size.w > 0) || !(size.h > 0)) return { code: 'screenshot_first', error: 'take a screenshot first — --at is a pixel of THAT image (its size says where the display ends)' };
  if (p.x < 0 || p.y < 0 || p.x >= size.w || p.y >= size.h) return { code: 'outside_display', error: `${p.x},${p.y} is outside the display — the screenshot is ${size.w}×${size.h} (x 0–${size.w - 1}, y 0–${size.h - 1})` };
  return null;
}
const plus = (p, origin) => ({ x: p.x + ((origin && origin.x) || 0), y: p.y + ((origin && origin.y) || 0) });
/** A click at a still's pixel → the pointer records the owner's click sends (a move there, the press, the release). */
function clickRecords(at, button = 1, origin = null) {
  const p = parseAt(at);
  const b = BUTTONS[Number(button) || 1];
  if (!p || b == null) return null;
  const q = plus(p, origin);
  return [{ t: 'mv', x: q.x, y: q.y }, { t: 'md', x: q.x, y: q.y, b }, { t: 'mu', x: q.x, y: q.y, b }];
}
/** The wheel: `by` notches (120 each) toward `direction` at a still's pixel (default: its centre). dy > 0 = up (away). */
function scrollRecords(direction, by, at, size, origin = null) {
  const d = String(direction || '').toLowerCase();
  const n = by == null ? LIMITS.scrollDefault : int(by);
  if (!['up', 'down', 'left', 'right'].includes(d) || n == null || n < 1 || n > LIMITS.scrollMaxNotches) return null;
  const p = at != null ? parseAt(at) : size && size.w > 0 ? { x: Math.floor(size.w / 2), y: Math.floor(size.h / 2) } : null;
  if (!p) return null;
  const q = plus(p, origin), u = 120 * n;
  return [{ t: 'mv', x: q.x, y: q.y }, { t: 'wh', x: q.x, y: q.y, dx: d === 'right' ? u : d === 'left' ? -u : 0, dy: d === 'up' ? u : d === 'down' ? -u : 0 }];
}

// ── THE CHORDS ────────────────────────────────────────────────────────────────────────────────────────────────────
// Names → the DOM `code` of the physical key (the injector presses its scan code / virtual key). The machine's own keys:
// `ctrl` is Control and `cmd` / `win` / `meta` the Windows key or ⌘ — no viewer table in between (the agent is on no keyboard).
const MODS = Object.freeze({ ctrl: 'ControlLeft', control: 'ControlLeft', shift: 'ShiftLeft', alt: 'AltLeft', option: 'AltLeft', opt: 'AltLeft',
  meta: 'MetaLeft', win: 'MetaLeft', windows: 'MetaLeft', super: 'MetaLeft', cmd: 'MetaLeft', command: 'MetaLeft' });
const NAMED = Object.freeze({ enter: 'Enter', return: 'Enter', tab: 'Tab', esc: 'Escape', escape: 'Escape', space: 'Space', backspace: 'Backspace',
  delete: 'Delete', del: 'Delete', insert: 'Insert', ins: 'Insert', home: 'Home', end: 'End', pageup: 'PageUp', pgup: 'PageUp', pagedown: 'PageDown', pgdn: 'PageDown',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  minus: 'Minus', '-': 'Minus', equal: 'Equal', '=': 'Equal', comma: 'Comma', ',': 'Comma', period: 'Period', '.': 'Period', slash: 'Slash', '/': 'Slash',
  backslash: 'Backslash', '\\': 'Backslash', semicolon: 'Semicolon', ';': 'Semicolon', quote: 'Quote', "'": 'Quote', backquote: 'Backquote', '`': 'Backquote',
  bracketleft: 'BracketLeft', '[': 'BracketLeft', bracketright: 'BracketRight', ']': 'BracketRight', printscreen: 'PrintScreen', menu: 'ContextMenu', contextmenu: 'ContextMenu', capslock: 'CapsLock' });
const POWER = Object.freeze(['power', 'sleep', 'wakeup', 'eject', 'logoff', 'lock']);
/** A key token → its DOM code, or null. */
function codeOfKey(tok) {
  const s = String(tok || '');
  const k = s.toLowerCase();
  if (/^[a-z]$/.test(k)) return 'Key' + k.toUpperCase();
  if (/^[0-9]$/.test(k)) return 'Digit' + k;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(k)) return 'F' + k.slice(1);
  if (Object.prototype.hasOwnProperty.call(NAMED, k)) return NAMED[k];
  if (Object.prototype.hasOwnProperty.call(NAMED, s)) return NAMED[s];
  return null;
}
/** The chords that lock, log off or power the machine (the platform's own shapes; both tables when it is not known). */
const CHORD_REFUSED = Object.freeze({
  win32: Object.freeze([
    Object.freeze({ mods: ['MetaLeft'], key: 'KeyL', as: 'lock_screen', says: 'Win+L locks the machine' }),
    Object.freeze({ mods: ['ControlLeft', 'AltLeft'], key: 'Delete', as: 'secure_attention', says: 'Ctrl+Alt+Del opens the lock / sign-out screen' }),
    Object.freeze({ mods: ['ControlLeft', 'AltLeft'], key: 'End', as: 'secure_attention', says: 'Ctrl+Alt+End is Ctrl+Alt+Del over a remote session' }),
  ]),
  darwin: Object.freeze([
    Object.freeze({ mods: ['ControlLeft', 'MetaLeft'], key: 'KeyQ', as: 'lock_screen', says: '⌃⌘Q locks the Mac' }),
    Object.freeze({ mods: ['ShiftLeft', 'MetaLeft'], key: 'KeyQ', as: 'log_off', says: '⇧⌘Q logs the Mac\'s user out' }),
    Object.freeze({ mods: ['AltLeft', 'ShiftLeft', 'MetaLeft'], key: 'KeyQ', as: 'log_off', says: '⌥⇧⌘Q logs the Mac\'s user out at once' }),
  ]),
});
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
/** A chord ("ctrl+s", "alt+F4", "Return", "cmd+shift+4") on a machine of `platform` → { mods, key, records } | { code, error, refusedAs? } */
function chordRecords(chord, platform = null) {
  const raw = String(chord == null ? '' : chord).trim();
  if (!raw || raw.length > 64) return { code: 'bad_chord', error: 'a chord is keys joined by + (ctrl+s, alt+F4, Return, cmd+shift+4)' };
  const toks = raw === '+' ? ['+'] : raw.split('+').map((x) => x.trim());
  if (toks.some((x) => !x)) return { code: 'bad_chord', error: `${JSON.stringify(raw)} has an empty key — keys are joined by + (ctrl+s, shift+equal for +)` };
  const keyTok = toks[toks.length - 1];
  if (toks.some((x) => POWER.includes(x.toLowerCase()))) return { code: 'chord_refused', refusedAs: 'power', error: `${JSON.stringify(raw)} would put the machine to sleep, lock it or end its session — never sent` };
  const mods = [];
  for (const m of toks.slice(0, -1)) {
    const c = MODS[m.toLowerCase()];
    if (!c) return { code: 'bad_chord', error: `${JSON.stringify(m)} is not a modifier (ctrl, shift, alt, win / cmd)` };
    if (!mods.includes(c)) mods.push(c);
  }
  const key = MODS[keyTok.toLowerCase()] || codeOfKey(keyTok);
  if (!key) return { code: 'bad_chord', error: `${JSON.stringify(keyTok)} is not a key this verb knows (letters, digits, F1–F24, Enter, Tab, Escape, Space, Backspace, Delete, Home, End, PageUp, PageDown, arrows, punctuation by name)` };
  const v = chordVerdict(mods.filter((m) => m !== key), key, platform);
  if (v) return v;
  const down = [...mods.filter((m) => m !== key), key];
  return { mods: down.slice(0, -1), key, records: [...down.map((c) => ({ t: 'kd', c })), ...down.slice().reverse().map((c) => ({ t: 'ku', c }))] };
}
function chordVerdict(mods, key, platform = null) {
  const tables = platform === 'win32' || platform === 'darwin' ? [CHORD_REFUSED[platform]] : [CHORD_REFUSED.win32, CHORD_REFUSED.darwin];
  for (const tb of tables) for (const row of tb) if (row.key === key && sameSet(row.mods, mods)) return { code: 'chord_refused', refusedAs: row.as, error: `${row.says} — a chord that locks, logs off or powers the machine is never sent (${row.as})` };
  return null;
}

// ── TYPING ──────────────────────────────────────────────────────────────────────────────────────────────────────
// THE DEFAULT ROAD = the owner's own paste (the data channel's `clip` + the machine's primary modifier + V): any text, any
// keyboard layout, any input method (a Pinyin IME would turn typed letters into a composition). `keys` = physical keys of a
// US layout (printable ASCII, \n = Enter, \t = Tab) for a field that refuses a paste.
const US = (() => {
  const m = new Map();
  const put = (ch, code, shift = false) => m.set(ch, { code, shift });
  for (let i = 0; i < 26; i++) { const c = String.fromCharCode(97 + i); put(c, 'Key' + c.toUpperCase()); put(c.toUpperCase(), 'Key' + c.toUpperCase(), true); }
  '0123456789'.split('').forEach((d) => put(d, 'Digit' + d));
  ')!@#$%^&*('.split('').forEach((c, i) => put(c, 'Digit' + i, true));
  [['-', 'Minus', '_'], ['=', 'Equal', '+'], ['[', 'BracketLeft', '{'], [']', 'BracketRight', '}'], ['\\', 'Backslash', '|'], [';', 'Semicolon', ':'], ["'", 'Quote', '"'], [',', 'Comma', '<'], ['.', 'Period', '>'], ['/', 'Slash', '?'], ['`', 'Backquote', '~']]
    .forEach(([a, code, b]) => { put(a, code); put(b, code, true); });
  put(' ', 'Space'); put('\n', 'Enter'); put('\t', 'Tab');
  return m;
})();
const CODE_OF_MODIFIER = Object.freeze({ shift: 'ShiftLeft', control: 'ControlLeft', alt: 'AltLeft', meta: 'MetaLeft' }); // a modifier's name → its left key (a spelling)
/** The machine's primary modifier key: THE table's move of a Ctrl-family viewer's Control onto this machine (a Mac's ⌘). */
const primaryOf = (platform) => CODE_OF_MODIFIER[MM.primaryModifierMap({ viewer: 'windows', host: MM.platformOf(platform || '') }).control] || 'ControlLeft';
/** `text` → { records, road: 'paste' | 'keys', chars } | { code, error } */
function typeRecords(text, platform = null, { keys = false } = {}) {
  if (typeof text !== 'string' || !text.length) return { code: 'bad-request', error: 'type needs the text (vibespace-window type <handle> "text")' };
  if (text.length > LIMITS.typeMaxChars) return { code: 'type_too_long', error: `at most ${LIMITS.typeMaxChars} characters a call (this one has ${text.length}) — split it` };
  if (!keys) {
    const p = primaryOf(platform);
    return { road: 'paste', chars: text.length, records: [{ t: 'clip', text }, { t: 'kd', c: p }, { t: 'kd', c: 'KeyV' }, { t: 'ku', c: 'KeyV' }, { t: 'ku', c: p }] };
  }
  const recs = [];
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    const k = US.get(ch);
    if (!k) return { code: 'not_ascii', error: `${JSON.stringify(ch)} has no key of its own on a US layout — leave --keys off (the text goes through the machine's clipboard, any language)` };
    if (k.shift) recs.push({ t: 'kd', c: 'ShiftLeft' });
    recs.push({ t: 'kd', c: k.code }, { t: 'ku', c: k.code });
    if (k.shift) recs.push({ t: 'ku', c: 'ShiftLeft' });
  }
  return { road: 'keys', chars: text.length, records: recs };
}

/** ONE DEVICE OP AT A TIME (fix r2): `records` in chunks of ≤ max, each cut where no key and no button is held down — a run
 *  that never lets go within max (none of the verbs makes one) is cut at max. → [[…], …] */
function chunkRecords(records, max) {
  const list = Array.isArray(records) ? records : [];
  const cap = Math.max(1, Math.floor(Number(max) || 1));
  const out = [];
  for (let start = 0; start < list.length;) {
    if (list.length - start <= cap) { out.push(list.slice(start)); break; }
    const held = new Set();
    let cut = -1;
    for (let i = start; i < start + cap; i++) {
      const x = list[i] || {};
      if (x.t === 'kd') held.add('k' + x.c); else if (x.t === 'ku') held.delete('k' + x.c);
      else if (x.t === 'md') held.add('b' + x.b); else if (x.t === 'mu') held.delete('b' + x.b);
      if (!held.size) cut = i + 1;
    }
    const end = cut > start ? cut : start + cap;
    out.push(list.slice(start, end));
    start = end;
  }
  return out;
}
/** A `--keys` type's characters in its first `sent` records (one key-up of a non-Shift key per character). */
const charsTyped = (records, sent) => (Array.isArray(records) ? records.slice(0, Math.max(0, sent | 0)) : []).filter((x) => x && x.t === 'ku' && x.c !== 'ShiftLeft').length;

/** The strip's / the CLI's facts of a lease (no stream key: it names a session the agent has no route to). */
function leaseView(lease, now = 0) {
  if (!lease) return null;
  const dot = lease.dot && now - lease.dot.at <= LIMITS.dotMs ? { x: lease.dot.x, y: lease.dot.y, verb: lease.dot.verb } : null;
  return { handle: lease.handle, hostId: lease.hostId, holder: { key: lease.holder.key, name: lease.holder.name }, input: lease.input, since: lease.since, pausedAt: lease.pausedAt, display: lease.display, shot: lease.shot ? { w: lease.shot.w, h: lease.shot.h } : null, dot };
}

module.exports = { HANDLE_PREFIX, LIMITS, END_WHY, CHORD_REFUSED, handleOf, hostOfHandle, isMachineHandle, leaseStep, agentVerdict, parseAt, pointVerdict, clickRecords, scrollRecords, chordRecords, chordVerdict, codeOfKey, typeRecords, primaryOf, chunkRecords, charsTyped, leaseView };
