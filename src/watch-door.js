'use strict';
/**
 * THE ONE DOOR FOR A FILE WATCH IN THE HUB'S CODE (src/, beside the SHARED modules that use it: src/desktop-serve.js rides the device
 * agent's bundle too, so the door imports nothing of the server; 主开发 2026-11-19 01:17Z — the production hub ended at 01:14Z: the
 * machine's inotify watches (65 536 a user) were used up by other programs, the hub armed one more — a helper conversation's
 * transcript, src/server/stdout/claude-stream-json.js, from a retry TIMER — fs.watch threw ENOSPC, nothing caught it, and
 * the process exited). THE LAW: A WATCH THAT CANNOT BE ARMED NEVER ENDS THE HUB AND NEVER ENDS ITS FEATURE.
 *   · watch(target, options, listener) answers a watcher-shaped object (close / ref / unref / on — an EventEmitter) whatever
 *     happens: a watch the system REFUSES (ENOSPC, EMFILE, ENFILE, ENOENT in a race, EACCES, EPERM — any throw) and a watch
 *     whose own 'error' event fires after it was armed are both replaced, in place, by A BOUNDED POLL: a stat of the target
 *     (a folder: its entries, at most POLL_ENTRIES of them) every ACTIVE_MS while it changes, backing off to QUIET_MS while it
 *     is quiet; unref'd; ended by the same close(). The listener is called as fs.watch calls it ('change', the entry's name),
 *     and a listener that throws is caught and said once — no callback of the door can end the process.
 *   · THE LIMIT IS SAID: the system's limit of watches reached (ENOSPC) is said ONCE in the journal and ONCE to the person —
 *     one For-you notice (en, zh, ja) with the limit's name and the one command that raises it — and LIFTED (the journal
 *     says so, the notice resolves itself) when a watch arms again. The For-you store is handed in by configure() (the
 *     system-resource notices' module does it at boot — server.js gains no line); before that, the notice waits for it.
 *   · scripts/test-watch-door.mjs: the door's own legs, THE CENSUS (no fs.watch of the hub's server code outside this
 *     file), and the REAL parser's road with a stand-in fs.watch that throws ENOSPC.
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const ACTIVE_MS = 250;      // the poll's cadence while the target changes
const QUIET_MS = 2000;      // …backed off to this while it is quiet (doubling from ACTIVE_MS)
const POLL_ENTRIES = 64;    // a folder's poll reads at most this many entries a tick
const NOTICE_KEY = 'watch-limit';
const LIMIT_NAME = 'fs.inotify.max_user_watches';
const RAISE_CMD = `sudo sysctl -w ${LIMIT_NAME}=524288`;
const i18nKey = (s) => s;   // marks a dictionary key (src/lib/i18n-zh.js, i18n-ja.js)

let todosOf = () => null;
let log = (line) => { try { console.warn(line); } catch { } };
const state = { limited: false, code: null, saidAt: 0, itemId: null, pollers: 0, refusals: 0, listenerSaid: false };

/** The words of the one notice (PURE). */
function noticeItem() {
  const rows = [
    { key: i18nKey('Linux gives each user a fixed number of file watches ({limit}); all of them are in use, most by other programs.'), params: { limit: LIMIT_NAME } },
    { key: i18nKey('VibeSpace keeps working: it checks the files it follows a few times a second instead of being told at once.') },
    { key: i18nKey('To raise the limit: {cmd} (to keep it after a restart, put the same setting in /etc/sysctl.d/).'), params: { cmd: RAISE_CMD } },
    { key: i18nKey('This item resolves itself when a watch can be set again.') },
  ];
  const fill = (r) => r.key.replace(/\{(\w+)\}/g, (m, k) => (r.params && r.params[k] != null ? r.params[k] : m));
  const text = 'The system’s limit of file watches is reached — VibeSpace follows files more slowly until it is raised';
  return { text, detail: rows.map(fill).join('\n'), i18n: { text: { key: i18nKey('The system’s limit of file watches is reached — VibeSpace follows files more slowly until it is raised'), params: {} }, detail: rows } };
}

function fileNotice() {
  if (state.itemId) return;
  const todos = todosOf();
  if (!todos || typeof todos.add !== 'function') return;   // configure() files it when the store arrives
  try {
    const it = noticeItem();
    const r = todos.add(NOTICE_KEY, { origin: 'server', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'VibeSpace', text: it.text, detail: it.detail, i18n: it.i18n });
    state.itemId = (r && (r.id || (r.item && r.item.id))) || null;
  } catch (e) { log(`[watch] the For-you notice of the watch limit was not filed — ${e && e.message}`); }
}
function liftNotice() {
  const todos = todosOf();
  if (todos && state.itemId) { try { const it = todos.get && todos.get(state.itemId); if (!it || it.status === 'open') todos.setStatus(state.itemId, 'done', 'agent'); } catch { /* the owner cleared it */ } }
  state.itemId = null;
}
/** A watch the system refused (or whose watcher failed): the limit is said once an episode. */
function noteRefused(e, target) {
  state.refusals++;
  const code = (e && e.code) || 'error';
  if (code !== 'ENOSPC') { if (!state.saidOther) { state.saidOther = true; log(`[watch] a file watch could not be set (${code}) — that file is followed by polling`); } return; }
  if (state.limited) return;
  state.limited = true; state.code = code; state.saidAt = Date.now();
  log(`[watch] the system's limit of file watches is reached (${LIMIT_NAME}, ENOSPC) — files are followed by polling until a watch can be set again; to raise it: ${RAISE_CMD}`);
  fileNotice();
  void target;
}
/** A watch armed: the limit, if it was said, is lifted. */
function noteArmed() {
  if (!state.limited) return;
  state.limited = false; state.code = null;
  log('[watch] a file watch was set again — the limit notice is lifted');
  liftNotice();
}
/** Hand the door the For-you store (the system-resource notices' module, at boot). A limit already met files its notice now. */
function configure({ getUserTodos = null, log: lg = null } = {}) {
  if (typeof getUserTodos === 'function') todosOf = () => { try { return getUserTodos(); } catch { return null; } };
  if (typeof lg === 'function') log = lg;
  if (state.limited) fileNotice();
}

const safeCall = (listener, ev, name) => {
  if (typeof listener !== 'function') return;
  try { listener(ev, name); } catch (e) { if (!state.listenerSaid) { state.listenerSaid = true; log(`[watch] a watch's listener threw (${e && e.message}) — caught; the watch goes on`); } }
};

/** The bounded poll that stands in for a watch: the target's stat (a folder: its entries'), compared tick to tick. */
function startPoll(target, listener, F, onChange) {
  let timer = null, closed = false, waitMs = ACTIVE_MS, last = null, busy = false;
  state.pollers++;
  const sig = async () => {
    const st = await F.promises.stat(target);
    if (!st.isDirectory()) return { [path.basename(String(target))]: `${st.size}:${st.mtimeMs}` };
    const out = {};
    const names = (await F.promises.readdir(target)).slice(0, POLL_ENTRIES);
    for (const n of names) { try { const s = await F.promises.stat(path.join(String(target), n)); out[n] = `${s.size}:${s.mtimeMs}`; } catch { out[n] = 'gone'; } }
    return out;
  };
  const tick = async () => {
    if (closed || busy) return;
    busy = true;
    let now = null;
    try { now = await sig(); } catch { now = {}; }   // a target that is gone (or not yet there) is polled on, quietly
    busy = false;
    if (closed) return;
    const changed = last ? Object.keys({ ...last, ...now }).filter((k) => last[k] !== now[k]) : [];
    last = now;
    if (changed.length) { waitMs = ACTIVE_MS; for (const n of changed) { safeCall(listener, 'change', n); if (onChange) onChange(); } }
    else waitMs = Math.min(QUIET_MS, waitMs * 2);
    schedule();
  };
  const schedule = () => { if (closed) return; timer = setTimeout(() => { tick().catch(() => {}); }, waitMs); if (timer.unref) timer.unref(); };
  tick().catch(() => {});   // the baseline at once
  return { close() { if (closed) return; closed = true; state.pollers--; if (timer) clearTimeout(timer); timer = null; } };
}

/**
 * fs.watch's shape, through the one door: (target[, options][, listener]) → a watcher (EventEmitter: close, ref, unref; its
 * `polled` says whether a poll stands in). Never throws; never emits 'error' — a failure becomes the poll, said.
 * `seam.fs` = the fs module to use (the suite's stand-in); default the real one.
 */
function watch(target, options, listener, seam = {}) {
  if (typeof options === 'function') { seam = listener || {}; listener = options; options = {}; }
  const F = (seam && seam.fs) || fs;
  const w = new EventEmitter();
  let inner = null, poll = null, closed = false;
  const toPoll = (e) => {
    if (closed || poll) return;
    if (inner) { try { inner.removeAllListeners('error'); inner.on('error', () => {}); inner.close(); } catch { } inner = null; }
    noteRefused(e, target);
    poll = startPoll(target, listener, F, null);
  };
  try {
    inner = F.watch(target, options || {}, (ev, name) => safeCall(listener, ev, name));
    inner.on('error', (e) => toPoll(e));   // a watch that fails AFTER it was armed is followed by the poll, never an uncaught 'error'
    noteArmed();
  } catch (e) { inner = null; toPoll(e); }
  Object.defineProperty(w, 'polled', { get: () => !!poll });
  w.close = () => { if (closed) return; closed = true; if (inner) { try { inner.close(); } catch { } inner = null; } if (poll) { poll.close(); poll = null; } };
  w.ref = () => { try { if (inner && inner.ref) inner.ref(); } catch { } return w; };
  w.unref = () => { try { if (inner && inner.unref) inner.unref(); } catch { } return w; };
  return w;
}

/** The suite's view (and the journal's): the door's state, and a reset between legs. */
const status = () => ({ limited: state.limited, code: state.code, itemId: state.itemId, pollers: state.pollers, refusals: state.refusals });
function resetForTest() { Object.assign(state, { limited: false, code: null, saidAt: 0, itemId: null, pollers: 0, refusals: 0, listenerSaid: false, saidOther: false }); todosOf = () => null; log = (line) => { try { console.warn(line); } catch { } }; }

module.exports = { watch, configure, status, noticeItem, resetForTest, ACTIVE_MS, QUIET_MS, POLL_ENTRIES, NOTICE_KEY, LIMIT_NAME, RAISE_CMD };
