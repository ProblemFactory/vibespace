'use strict';
/**
 * B-9584 U2c — A PROFILE'S PLACE ON THE STOCK BROWSER, ROAD B, ON TOP OF ITS OWN STORED DENIAL (lane cli-update-needs-nothing; 主开发
 * r938 / r1264, measured on a real Chrome). FAIL CLOSED AT THE BROWSER: before its Chrome starts, the keeper writes the profile's own
 * stored setting — the default geolocation and every stored site row «block» (src/browser-environment.js geoStoredDenial) — so with
 * nothing of VibeSpace attached the browser itself denies the position. This file only ADDS the place on top, while it lives:
 *   · ONE CDP socket of its own per held browser (never the dialog watch's): Target.setAutoAttach { autoAttach, waitForDebuggerOnStart,
 *     flatten } at the browser — every new document target is PAUSED before its first script, its place set on it
 *     (Emulation.setGeolocationOverride, the place with its accuracy), then released.
 *   · B-9584 (B) THE PLACE'S ROAD (the owner's choice; 主开发 r1791 / r1898): the hold is the ONLY giver, on its OWN socket. Once every
 *     open tab of a browser context holds the place (or is closed), that context gets an every-origin «denied» and then a «granted»
 *     for each LISTED site (an exact origin) — nothing written into the profile: the grants die with this socket and every site falls
 *     back to the stored denial. A NEW context's grants come after its first tab's place, before its release. With sites on the
 *     list, a tab the hold could not place is CLOSED (`closed`, its target id, no value) — never released; a tab it could neither
 *     place nor close leaves its context WITHOUT grants. No list: no grant, only the every-origin denial (the stored one under it).
 *   · THE BOUND (BOUND_MS): a paused tab is released inside it on EVERY path — placed, or (the browser refusing or not answering)
 *     UNPLACED: then it runs DENIED the location by the stored setting, never with this machine's, and that is said (`unplaced`).
 *   · ITS SOCKET GONE (VibeSpace restarted, a dropped connection): the browser keeps a tab it paused paused, and every override of
 *     the socket goes with it — the tabs fall back to the stored denial (measured: never this machine's position). The NEXT arm (by
 *     itself: bounded tries on the record's CURRENT address; a restart's adoption; `rearmNow` when the browser moved) places every
 *     tab again and releases what was paused. Tries spent ⇒ `down` (the tabs stay denied; the keeper says it).
 * A profile with no place never reaches this file: nothing is armed. No value of a place is ever in a log line or an event here (the
 * owner's decision: a place is the person's private fact).
 */
let WS = null; try { WS = require('ws').WebSocket; } catch { WS = null; }
const ENV = require('../browser-environment.js');   // B-9584 (B): the listed sites judged again at the hold (exact origins)

/** A paused tab's whole bound (its permission, its place): the measure's slowest tab took 59 ms. */
const BOUND_MS = 3000;
/** How long the hold waits for the browser to close a tab whose place it could not set. */
const CLOSE_MS = 2000;
/** The arm's own bound: the socket, the auto-attach, every tab already open. */
const ARM_MS = 8000;
/** The hold's tries again after its socket went, while its browser lives (then `down`). */
const REARM_MS = Object.freeze([250, 1000, 4000]);

/** The targets that run a DOCUMENT (navigator.geolocation): a tab, an extension's background page, an app, a webview — each held.
 *  A worker of any kind has no geolocation: released at once. */
const DOCUMENT_TYPES = Object.freeze(['page', 'background_page', 'app', 'webview']);
/** The override a place sets on a tab: the place with its accuracy. PURE. */
function overrideOf(plan) { return { latitude: Number(plan.latitude), longitude: Number(plan.longitude), accuracy: Number(plan.accuracy) }; }
const LOOPBACK = /^wss?:\/\/(?:127\.0\.0\.1|\[::1\]|localhost)(?::\d+)?\//;
/** A plan this file holds: a place, finite and in range, with its accuracy; anything else ⇒ null (never armed). PURE. */
function planOf(geolocation) {
  const g = geolocation && typeof geolocation === 'object' ? geolocation : null;
  if (!g) return null;
  if (g.kind !== 'place') return null;   // «blocked» is the profile's own stored denial alone (the keeper): never held here
  const lat = Number(g.latitude), lng = Number(g.longitude), acc = Number(g.accuracy);
  if (!(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180 && Number.isFinite(acc) && acc > 0)) return null;
  const sv = ENV.sitesVerdict(g.sites);   // B-9584 (B): the sites the place is given to (exact origins); a list that does not pass gives none
  return { kind: 'place', latitude: lat, longitude: lng, accuracy: acc, sites: sv.ok ? sv.value : [] };
}

function create({ WebSocketImpl = WS, now = Date.now, log = console, boundMs = BOUND_MS, closeMs = CLOSE_MS, armMs = ARM_MS, rearmMs = REARM_MS, onEvent = null } = {}) {
  const holds = new Map();
  const say = (m) => { try { log.log?.(`[browser] ${m}`); } catch { /* a log that throws says nothing */ } };
  const emit = (ev) => { if (typeof onEvent === 'function') { try { onEvent(ev); } catch (e) { say(`the place hold's listener failed — ${e && e.message}`); } } };
  const timer = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; };

  function call(h, method, params = {}, sessionId = null, ms = boundMs) {
    return new Promise((resolve) => {
      if (!h.ws || h.ws.readyState !== 1) return resolve({ error: { message: 'the place hold is not connected' } });
      const id = ++h.id;
      const t = timer(() => { if (h.waiting.delete(id)) resolve({ timeout: true }); }, ms);
      h.waiting.set(id, (m) => { clearTimeout(t); resolve(m); });
      try { h.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch (e) { h.waiting.delete(id); clearTimeout(t); resolve({ error: { message: String(e && e.message) } }); }
    });
  }
  const fine = (r) => !!r && !r.timeout && !r.error;

  /** One tab: its place, then released. Released EVERY time, placed or not: a tab whose place the browser refuses or does not answer
   *  inside the bound runs DENIED the location (the profile's own stored denial underneath — fail closed), never with this machine's;
   *  that is said (`unplaced`). A running tab ignores the release; a tab a dead socket left paused (the browser keeps it paused —
   *  measured) is released by the next arm, its place set first. A job whose socket went meanwhile leaves the tab to the next arm. */
  async function hold(h, sid, info, paused) {
    const deadline = now() + boundMs;
    const ws0 = h.ws;   // THIS socket's job: a re-arm runs in state «lost» until it holds, so the socket (not the state) says it went
    const tid = String(info.targetId || '');
    const o = await call(h, 'Emulation.setGeolocationOverride', overrideOf(h.plan), sid, Math.max(1, deadline - now()));
    if (h.state === 'gone' || h.ws !== ws0 || ws0.readyState !== 1) return false;   // the socket went mid-job: never a false «unplaced»
    const placed = fine(o);
    const ctx = String(info.browserContextId || '');
    if (placed) h.tabs.set(sid, tid);
    else {
      h.unplaced++;
      const why = o && o.timeout ? 'not answered' : 'refused';
      if (h.plan.sites.length) {   // B-9584 (B, 主开发 r1791): with a list, a tab without its place is CLOSED — never released
        const cl = await call(h, 'Target.closeTarget', { targetId: tid }, null, closeMs);
        if (h.state === 'gone' || h.ws !== ws0) return false;
        const shut = fine(cl) && !(cl.result && cl.result.success === false);
        if (!shut) h.dirty.add(ctx);   // a tab that could not be closed keeps its context WITHOUT grants (its listed sites read «denied»)
        say(`${h.profileId}: a tab ${paused ? 'opened' : 'open'} without its place was ${shut ? 'CLOSED' : 'not closed (its browser context gets no grant)'} — a site on its list there would have read this machine's location`);
        emit({ kind: 'closed', profileId: h.profileId, targetId: tid, why, shut, at: now(), opened: !!paused });
        return false;
      }
      say(`${h.profileId}: a tab ${paused ? 'opened' : 'open'} without its place — the browser ${why === 'refused' ? 'refused' : 'did not answer in ' + Math.round(boundMs / 1000) + ' s for'} it; it is denied the location (the profile's own setting), never given this machine's`);
      emit({ kind: 'unplaced', profileId: h.profileId, why, at: now(), opened: !!paused });
    }
    if (placed && h.state === 'held' && !h.granted.has(ctx)) await grantCtx(h, ctx);   // a new context: its grants after this tab's place, before its release
    if (h.state === 'gone' || h.ws !== ws0) return placed;
    // r1898 (7), measured on a real browser: while an arm or a RE-ARM runs, a placed tab waits for its context's grants — a tab its dead
    // socket left paused, released at its place, read «denied» on its listed site before the grant came; the open handler releases it
    if (placed && h.state !== 'held') { h.release.add(sid); return placed; }
    call(h, 'Runtime.runIfWaitingForDebugger', {}, sid, closeMs);
    return placed;
  }
  /** B-9584 (B, 主开发 r1898 (2)(3)): one browser context's permissions, on the hold's OWN socket — they die with it (measured: then
   *  «denied» from the stored setting, never this machine's position): every origin «denied» (over anything the browser stores, an
   *  allow given in its own bar included, while the hold lives), then each LISTED site «granted» (an exact origin; the tabs it can
   *  read from already hold the place). Never for a context that kept a tab the hold could neither place nor close. */
  async function grantCtx(h, ctx) {
    if (h.granted.has(ctx) || h.dirty.has(ctx)) return false;
    h.granted.add(ctx);
    const at = ctx ? { browserContextId: ctx } : {};
    const d = await call(h, 'Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied', ...at });
    if (!fine(d)) say(`${h.profileId}: the every-origin denial was not set on its browser (${d && d.timeout ? 'no answer' : 'refused'}) — the profile's own stored denial stands under it`);
    for (const origin of h.plan.sites) {
      const g = await call(h, 'Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted', origin, ...at });
      if (!fine(g)) { h.ungranted++; say(`${h.profileId}: a listed site was not granted its place (${g && g.timeout ? 'no answer' : 'refused'}) — it reads «denied»`); }
    }
    return true;
  }

  function onMessage(h, d) {
    let m; try { m = JSON.parse(typeof d === 'string' ? d : d.toString()); } catch { return; }
    if (m.id && h.waiting.has(m.id)) { const fn = h.waiting.get(m.id); h.waiting.delete(m.id); fn(m); return; }
    const p = m.params || {};
    if (m.method === 'Target.attachedToTarget') {
      const info = p.targetInfo || {}, sid = String(p.sessionId || '');
      if (!sid) return;
      if (!DOCUMENT_TYPES.includes(info.type)) { if (p.waitingForDebugger) call(h, 'Runtime.runIfWaitingForDebugger', {}, sid, closeMs); return; }   // a worker has no navigator.geolocation
      if (info.targetId) h.seen.add(String(info.targetId));
      h.ctxs.add(String(info.browserContextId || ''));
      const job = hold(h, sid, info, !!p.waitingForDebugger);
      h.pending.add(job); job.finally(() => h.pending.delete(job));
      return;
    }
    if (m.method === 'Target.detachedFromTarget') { h.tabs.delete(String(p.sessionId || '')); }
  }

  function connect(h) {
    return new Promise((resolve) => {
      if (!WebSocketImpl) return resolve({ ok: false, code: 'place_not_held', error: 'no WebSocket here' });
      let ws, settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const url = typeof h.url === 'function' ? h.url() : h.url;   // the record's CURRENT address (a relaunch moves it)
      if (!LOOPBACK.test(String(url || ''))) return done({ ok: false, code: 'place_not_held', error: 'the browser answered no loopback debugging address' });
      try { ws = new WebSocketImpl(url, { perMessageDeflate: false, handshakeTimeout: Math.min(armMs, 5000), maxPayload: 4 * 1024 * 1024 }); } catch (e) { return done({ ok: false, code: 'place_not_held', error: String(e && e.message) }); }
      h.ws = ws; h.id = 0; h.waiting = new Map(); h.tabs = new Map(); h.pending = new Set(); h.seen = new Set();
      h.ctxs = new Set(['']); h.granted = new Set(); h.dirty = new Set(); h.release = new Set();   // B-9584 (B): grants live on THIS socket only — a new one starts with none
      const tArm = timer(() => { try { ws.terminate ? ws.terminate() : ws.close(); } catch { /* gone */ } done({ ok: false, code: 'place_not_held', error: `the browser did not take this profile's place within ${Math.round(armMs / 1000)} s` }); }, armMs);   // its socket goes with it: never a second auto-attach beside the next try
      ws.on('message', (d) => { try { onMessage(h, d); } catch (e) { say(`${h.profileId}: a place hold event was not handled — ${e && e.message}`); } });
      ws.on('error', () => { /* the close follows */ });
      ws.on('close', () => { clearTimeout(tArm); for (const fn of h.waiting.values()) { try { fn({ error: { message: 'closed' } }); } catch { /* */ } } h.waiting.clear(); done({ ok: false, code: 'place_not_held', error: 'the browser closed the place hold' }); lost(h, ws); });
      ws.on('open', async () => {
        const a = await call(h, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
        if (!fine(a)) { clearTimeout(tArm); try { ws.close(); } catch { /* */ } return done({ ok: false, code: 'place_not_held', error: 'the browser refused to pause its new tabs' }); }
        // the tabs open now: attached by the call above (their attach events came first); any page it did not attach is attached here
        const g = await call(h, 'Target.getTargets');
        const infos = g && g.result && Array.isArray(g.result.targetInfos) ? g.result.targetInfos : [];
        for (const t of infos) {
          if (!t || !DOCUMENT_TYPES.includes(t.type) || h.seen.has(String(t.targetId))) continue;
          h.seen.add(String(t.targetId)); h.ctxs.add(String(t.browserContextId || ''));
          const at = await call(h, 'Target.attachToTarget', { targetId: String(t.targetId), flatten: true });
          if (fine(at) && at.result && at.result.sessionId) { const job = hold(h, String(at.result.sessionId), t, false); h.pending.add(job); job.finally(() => h.pending.delete(job)); }
        }
        await Promise.allSettled([...h.pending]);
        clearTimeout(tArm);
        if (h.state === 'gone') return done({ ok: false, code: 'place_not_held', error: 'disarmed' });
        if (h.ws !== ws || ws.readyState !== 1) return done({ ok: false, code: 'place_not_held', error: 'the browser closed the place hold' });   // r1707 (7): it went meanwhile — never a false «held» (its close re-arms)
        // B-9584 (B, 主开发 r1898 (7)): every open tab holds the place (or is closed) — ONLY NOW each context's grants, on this socket
        for (const c of [...h.ctxs]) await grantCtx(h, c);
        if (h.ws !== ws || ws.readyState !== 1) return done({ ok: false, code: 'place_not_held', error: 'the browser closed the place hold' });
        for (const s of h.release) call(h, 'Runtime.runIfWaitingForDebugger', {}, s, closeMs);   // the arm's placed tabs: only now, their grants set
        h.release.clear();
        const after = h.state === 'lost' ? 'lost' : h.after || null;
        h.state = 'held'; h.heldAt = now(); h.after = null;
        emit({ kind: 'held', profileId: h.profileId, at: h.heldAt, after, lostAt: h.lostAt || null });
        done({ ok: true });
      });
    });
  }

  function lost(h, ws) {
    if (h.ws !== ws || h.state === 'gone') return;   // rearmNow passes the hold's own (closed) socket after «down»
    const was = h.state;
    if (was === 'arming') return;   // the first arm's own failure is its answer (the start is refused by name)
    h.state = 'lost'; h.lostAt = h.lostAt || now();
    if (was === 'held') { say(`${h.profileId}: the place hold on its browser dropped — armed again`); emit({ kind: 'lost', profileId: h.profileId, at: h.lostAt }); }
    if (h.rearming) return;
    h.rearming = true;
    (async () => {
      for (const ms of rearmMs) {
        await new Promise((r) => timer(r, ms));
        if (h.state === 'gone' || holds.get(h.profileId) !== h) return;
        const r = await connect(h);
        if (r.ok) { h.rearming = false; h.lostAt = 0; return; }
      }
      h.rearming = false;
      if (h.state === 'gone' || holds.get(h.profileId) !== h) return;
      h.state = 'down';
      say(`${h.profileId}: the place hold could not be armed again`);
      emit({ kind: 'down', profileId: h.profileId, at: now(), lostAt: h.lostAt });
    })();
  }

  /** Arm the hold on one browser (`url` = its browser-level CDP endpoint). Bounded; → {ok} | {ok:false, code, error}. */
  async function arm(profileId, { url, plan, after = null } = {}) {
    const pid = String(profileId || '');
    const pl = planOf(plan);
    if (!pid || !pl) return { ok: false, code: 'place_not_held', error: 'no place to hold' };
    const u0 = typeof url === 'function' ? url() : url;
    if (typeof u0 !== 'string' || !LOOPBACK.test(u0)) return { ok: false, code: 'place_not_held', error: 'the browser answered no loopback debugging address' };
    disarm(pid, 'armed again');
    const h = { profileId: pid, url, plan: pl, state: 'arming', after, unplaced: 0, ungranted: 0, heldAt: 0, lostAt: 0, rearming: false, ctxs: new Set(['']), granted: new Set(), dirty: new Set() };
    holds.set(pid, h);
    const r = await connect(h);
    if (!r.ok && holds.get(pid) === h) { h.state = 'gone'; holds.delete(pid); try { h.ws && h.ws.close(); } catch { /* */ } }
    return r;
  }
  function disarm(profileId, why = 'disarmed') {
    const h = holds.get(String(profileId || ''));
    if (!h) return false;
    h.state = 'gone'; holds.delete(h.profileId);
    try { h.ws && h.ws.close(); } catch { /* gone */ }
    void why;
    return true;
  }
  /** The plan a hold keeps on a profile's browser (the dialog watch never replaces or clears it), or null. */
  function heldOf(profileId) { const h = holds.get(String(profileId || '')); return h && h.state !== 'gone' ? { ...h.plan } : null; }
  /** What the hold is now — never the place: its kind, its state, since when, how many tabs it could not place (they run denied). */
  function factOf(profileId) { const h = holds.get(String(profileId || '')); return h ? { kind: h.plan.kind, state: h.state, heldAt: h.heldAt || null, lostAt: h.lostAt || null, unplaced: h.unplaced, sites: h.plan.sites.length, ungranted: h.ungranted } : null; }   // B-9584 (B): the sites by their COUNT, never an origin
  /** The browser moved (a relaunch on a new address): arm again NOW on the record's current address, never on the dead one. */
  function rearmNow(profileId) {
    const h = holds.get(String(profileId || ''));
    if (!h || h.state === 'gone') return false;
    const ws = h.ws;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) { try { ws.terminate ? ws.terminate() : ws.close(); } catch { /* gone */ } return true; }   // its close re-arms (lost) on the getter's address
    if (h.state !== 'arming' && !h.rearming) lost(h, ws);   // r1707 (7): «down», or a socket already closed — no close will come: the re-arm starts HERE
    return true;
  }
  function dispose() { for (const pid of [...holds.keys()]) disarm(pid, 'disposed'); }
  return { arm, disarm, heldOf, factOf, rearmNow, dispose, _holds: holds };
}

module.exports = { create, overrideOf, planOf, DOCUMENT_TYPES, BOUND_MS, CLOSE_MS, ARM_MS, REARM_MS };
