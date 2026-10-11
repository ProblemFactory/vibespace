'use strict';
/**
 * ONE APP OF A PAIRED WINDOWS / macOS MACHINE AS ITS OWN WINDOW — the hub's half (lane machine-app-crop, route ② of
 * B-bb0b). The page's `machine-app` window (src/lib/machine-app.js) shows the machine's whole VNC picture CROPPED to one
 * app's window; this module keeps, per such window, the device's watch of that app window (the `window-track` device op
 * through the agent client, src/agentd/client.js windowTrack) and hands each change to the page by a long poll.
 *   • people only (the routes refuse an agent token, like the whole desktop)
 *   • one pinned window per machine: they share ONE screen, so pinning one unpins the one pinned before; every watch of
 *     that machine hears which window is on top
 *   • a watch nobody polls for IDLE_MS (the page closed without a word) is ended — the device then undoes its pin
 *   • the keepers' law: a pin the hub could not undo (the machine went away mid-close) is REPORTED (`pinsLeft`, a journal
 *     line) — never forced, never retried behind the owner's back
 */
const MW = require('../machine-window.js');
const M = require('../machine-desktop-model.js');

const IDLE_MS = 30000;
const POLL_MAX_MS = 25000;
const PINS_LEFT_MAX = 8;
const named = (code, message) => Object.assign(new Error(message), { code });

function create({ access, log = console, now = Date.now, idleMs = IDLE_MS, sweepMs = 5000 } = {}) {
  const watches = new Map(); // key → { key, hostId, dm, wid, answer, seq, waiters, lastPoll, pinned }
  const pinsLeft = new Map(); // hostId → [{ title, since }]
  const keyOf = () => 'ma' + now().toString(36) + Math.random().toString(36).slice(2, 10);
  const titleOf = (w) => (w.answer && w.answer.title) || '';
  const pinOf = (hostId) => { for (const w of watches.values()) if (w.hostId === hostId && w.pinned) return { key: w.key, title: titleOf(w) }; return null; };
  const view = (w) => ({ key: w.key, seq: w.seq, answer: w.answer, pin: pinOf(w.hostId) });
  const wake = (w) => { w.seq++; const ws = w.waiters.splice(0); for (const f of ws) { try { f(); } catch { /* gone */ } } };
  const wakeHost = (hostId) => { for (const w of watches.values()) if (w.hostId === hostId) wake(w); };
  const platformOf = (dm) => { try { const st = dm && dm.status ? dm.status() : null; return st && st.info ? st.info.platform || null : null; } catch { return null; } };

  function drop(w, why) {
    if (watches.get(w.key) !== w) return;
    watches.delete(w.key);
    const wasPinned = w.pinned; w.pinned = false;
    if (w.answer && w.answer.state === 'found') w.answer = { ...w.answer, state: 'gone', ended: why };
    wake(w);
    if (wasPinned) wakeHost(w.hostId);
    if (why === 'gone') return; // the window closed on the machine: nothing to undo there
    Promise.resolve().then(() => w.dm.windowUntrack(w.wid)).catch((e) => {
      if (!wasPinned) return;
      const list = (pinsLeft.get(w.hostId) || []).concat([{ title: titleOf(w), since: now() }]).slice(-PINS_LEFT_MAX);
      pinsLeft.set(w.hostId, list);
      log.warn?.(`[machine-app] a window on ${w.hostId} may still be kept on top ("${titleOf(w).slice(0, 80)}"): its watch could not be ended (${e && e.message})`);
    });
  }

  /** FOLLOW the launched app's window (`pid` / `since` from the run's launch report) or a known window (`target`).
   *  → { key, answer } — `key` null when no window was found (the answer says none / error). */
  async function track(hostId, { pid = null, since = null, target = null } = {}) {
    const dm = await access.deviceOf(hostId);
    const platform = platformOf(dm);
    if (!M.DESKTOP_PLATFORMS.includes(platform)) throw named('not_desktop_machine', `${hostId} runs ${platform || 'an unknown system'} — one app's own window is for Windows and macOS machines`);
    const req = MW.trackRequest({ pid, since, target });
    if (!req.ok) throw named(req.code, req.error);
    const key = keyOf();
    const w = { key, hostId, dm, wid: null, answer: null, seq: 0, waiters: [], lastPoll: now(), pinned: false };
    const { wid, result } = await dm.windowTrack({ pid: req.pid, since: req.since, target: req.target }, {
      onPush: (a) => { if (watches.get(key) !== w) return; w.answer = a; wake(w); if (a && a.state !== 'found') drop(w, a.state === 'gone' ? 'gone' : 'ended'); },
    });
    if (!result || result.state !== 'found') return { key: null, answer: result || { state: 'none' } };
    w.wid = wid; w.answer = result;
    watches.set(key, w);
    log.log?.(`[machine-app] following a window on ${hostId} (${platform})`);
    return { key, answer: result, pin: pinOf(hostId) };
  }
  const watchOf = (key) => { const w = watches.get(String(key || '')); if (!w) throw named('not_tracked', 'that app window is not followed any more — run it again'); return w; };
  /** THE LONG POLL: answers at once when the watch moved past `seq`, else at its next change or after POLL_MAX_MS. */
  function poll(key, seq = -1, waitMs = POLL_MAX_MS) {
    const w = watches.get(String(key || ''));
    if (!w) return Promise.resolve({ key, seq: -1, answer: { state: 'gone' }, pin: null, ended: true });
    w.lastPoll = now();
    if (w.seq > Number(seq)) return Promise.resolve(view(w));
    return new Promise((resolve) => {
      let t = null;
      const done = () => { clearTimeout(t); w.lastPoll = now(); resolve(watches.get(w.key) === w ? view(w) : { key: w.key, seq: w.seq, answer: w.answer || { state: 'gone' }, pin: null, ended: true }); };
      w.waiters.push(done);
      t = setTimeout(() => { const i = w.waiters.indexOf(done); if (i >= 0) w.waiters.splice(i, 1); done(); }, Math.max(0, Math.min(POLL_MAX_MS, Number(waitMs) || POLL_MAX_MS)));
      t.unref?.();
    });
  }
  /** KEEP IT ON TOP (or not). One per machine: the window pinned before is unpinned first. → the device's answer */
  async function pin(key, on) {
    const w = watchOf(key);
    if (on) for (const o of watches.values()) if (o !== w && o.hostId === w.hostId && o.pinned) { try { await o.dm.windowPin(o.wid, false); } catch { /* its watch ends on its own */ } o.pinned = false; }
    const r = await w.dm.windowPin(w.wid, !!on);
    if (r && r.ok) w.pinned = !!r.pinned;
    wakeHost(w.hostId);
    return { ...r, pin: pinOf(w.hostId) };
  }
  /** The page closed the window: the watch ends (the device undoes its pin). */
  function untrack(key) { const w = watches.get(String(key || '')); if (w) drop(w, 'closed'); return { ok: true, ended: !!w }; }
  const sweep = setInterval(() => { const t = now(); for (const w of [...watches.values()]) if (t - w.lastPoll > idleMs && !w.waiters.length) drop(w, 'idle'); }, sweepMs);
  sweep.unref?.();
  function shutdown() { clearInterval(sweep); for (const w of [...watches.values()]) drop(w, 'shutdown'); }
  return { track, poll, pin, untrack, shutdown, pinsLeft: (hostId) => (pinsLeft.get(hostId) || []).slice(), list: () => [...watches.values()].map((w) => ({ key: w.key, hostId: w.hostId, state: w.answer && w.answer.state, pinned: w.pinned })) };
}

module.exports = { create, IDLE_MS, POLL_MAX_MS };
