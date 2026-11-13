#!/usr/bin/env node
// THE WINDOW'S TABLE (lane chrome-157 — the .401 read, 主开发 2026-11-13, laws W1–W6): every STATE × ACT of a profile's download
// window, the expected cell GENERATED from the laws below (written from the ruling, never from the code), the culls named; and a
// DRIVER that plays each cell over a checkout's REAL mediator (src/server/cdp-mediator.js) and a fake browser that MODELS Chrome's
// download state as the lane measured it on Chrome 154.0.8037.57 and Chrome for Testing 157.0.8103.50 (work/measure/probe-*.mjs):
//   · Browser.setDownloadBehavior moves the WHOLE profile's folder, sent with no session OR on a page session (the real driver
//     sends {behavior:'allowAndName', downloadPath, eventsEnabled:true} on its page session); the last writer wins; a
//     {behavior:'default'} from ANY connection puts the profile's own place back;
//   · with the browser form + eventsEnabled, every download of the profile reaches that connection (the person's included); with the
//     session form, only that page's own downloads reach that session; a download's frameId is the tab it began in;
//   · Browser.cancelDownload by guid cancels any download of the profile (the person's included).
// The closure list (主开发 19:58Z, S1–S8) is in it: the window lives with the connection that set it, a ceiling in flight, the bound
// speaks (the notice road), one rule for a download begun with no folder lent, own downloads always the lease's, the ordered put-back
// on the wire (the FOLDER column: who holds the profile's folder once every put-back has landed), no culls.
// Gates: test-cdp-census ⑫ (the PURE windowStep against every cell) and test-browser-mediation ⑥e (this checkout's mediator).
//   node scripts/download-window-cells.mjs                         print the table: the cells and the culls
//   node scripts/download-window-cells.mjs --drive [<checkout>]    drive every cell over that checkout's mediator (default: this one);
//                                                                  the set on the lease's page session (the real driver's), or with
//                                                                  VS_WINDOW_FORM=browser with no session
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILE = 'bp-0000000p', L = 'bk-000000l1', MM = 'bk-000000m1';
export const STATES = ['none', 'armed', 'flight', 'flight2', 'flightSet', 'closingOrdered', 'closingShort', 'closingLapse', 'lapsed'];
export const ACTS = ['setL', 'setLdef', 'setM', 'setMdef', 'setLpaused', 'beginOwn', 'beginOther', 'endAdmitted', 'endOther', 'bound', 'takeover', 'takeoverM', 'leaseEndL', 'leaseEndM', 'connGoneL', 'connGoneLother', 'connGoneM', 'repoint', 'hubStop', 'adopt', 'putBackDone'];

// ── THE LAWS (主开发's list 18:08Z + the closure list 19:58Z) — the first line that speaks decides the cell; no combination is culled ─
const OPEN = ['armed', 'flight', 'flight2', 'flightSet'], CLOSING = ['closingOrdered', 'closingShort', 'closingLapse'];
const folderOf = (after) => (/^(armed|flight)/.test(after) ? 'agent' : 'person');   // once every put-back has landed
const c = (after, e = {}) => ({ after, reply: e.reply || null, putBack: !!e.putBack, delivered: !!e.delivered, told: !!e.told, folder: folderOf(after) });
export const LAWS = [
  ['W6: a hub start puts the profile back — a window already standing (a lease that set before the boot reached it) puts itself back by its own doors', (s, a) => a === 'adopt' && c(s, { putBack: s === 'none' })],
  ['a repoint (the browser restarted / stopped): its setting died with it — no record, nothing put back', (s, a) => a === 'repoint' && c('none')],
  ['the hub stopping puts an open window back and leaves no record', (s, a) => a === 'hubStop' && c('none', { putBack: OPEN.includes(s) })],
  ['the person drives: a set is refused by name', (s, a) => a === 'setLpaused' && c(s, { reply: 'browser_interrupted' })],
  ['W3: one window per profile — another lease\'s set is refused while one stands', (s, a) => (a === 'setM' || a === 'setMdef') && (OPEN.includes(s) || CLOSING.includes(s)) && c(s, { reply: 'method_refused' })],
  ['W1: another lease\'s set opens its own window when none stands', (s, a) => a === 'setM' && c('armed@M', { reply: 'forward' })],
  ['W4: «default» is forwarded and closes the setter\'s window (no put-back: it is one)', (s, a) => (a === 'setLdef' || a === 'setMdef') && c('none', { reply: 'forward' })],
  ['W1: a put-back on a connection of its own cannot be ordered before a new set — refused, a moment', (s, a) => a === 'setL' && s === 'closingShort' && c(s, { reply: 'method_refused' })],
  ['S2 (c): a re-set never moves the deadline; in flight it is ONE more expectation, once', (s, a) => a === 'setL' && c({ flight: 'flightSet', flight2: 'flight2Set', armed: 'armed', flightSet: 'flightSet' }[s] || 'armed', { reply: 'forward' })],
  ['W1: a download its own tab begins in an open window is its own — counted, told to it', (s, a) => a === 'beginOwn' && OPEN.includes(s) && c({ armed: 'flight', flight: 'flight2', flight2: 'flight3', flightSet: 'flight2' }[s], { delivered: true })],
  ['S2 (b) + S4: a download its own tab begins with no folder of its lent goes to the profile\'s own place — ONE rule: told, and told of it as its own', (s, a) => a === 'beginOwn' && c(s, { delivered: true, told: true })],
  ['W2: another\'s download is never the lease\'s and changes nothing', (s, a) => (a === 'beginOther' || a === 'endOther') && c(s)],
  ['W1: the last end puts the profile back; a second keeps it open; a set after the begin waits for its own; S4: an own download ending outside the window is still told', (s, a) => a === 'endAdmitted' && (s === 'flight' ? c('closingOrdered', { putBack: true, delivered: true }) : s === 'flight2' ? c('flight', { delivered: true }) : s === 'flightSet' ? c('armed', { delivered: true }) : c(s, { delivered: true }))],
  ['S1 / S2: the deadline — none begun: put back, lapsed, told; in flight: the ceiling (the file is fixed at its begin), put back, told', (s, a) => a === 'bound' && (s === 'armed' ? c('closingLapse', { putBack: true, told: true }) : ['flight', 'flight2', 'flightSet'].includes(s) ? c('closingOrdered', { putBack: true, told: true }) : c(s))],
  ['S5: a takeover — of this conversation or another\'s — puts an open window back, and the lease is told', (s, a) => (a === 'takeover' || a === 'takeoverM') && (OPEN.includes(s) ? c('closingOrdered', { putBack: true, told: true }) : c(s === 'lapsed' ? 'none' : s))],
  ['the lease\'s end puts its window back', (s, a) => a === 'leaseEndL' && (OPEN.includes(s) ? c('closingShort', { putBack: true }) : c(s === 'lapsed' ? 'none' : s))],
  ['S1: the window lives with the connection that set it — its close puts it back, and the lease is told', (s, a) => a === 'connGoneL' && (OPEN.includes(s) ? c('closingShort', { putBack: true, told: true }) : c(s))],
  ['another connection of the lease, another lease: nothing', (s, a) => ['connGoneLother', 'leaseEndM', 'connGoneM'].includes(a) && c(s)],
  ['the put-back answered: the window is gone (after the bound: lapsed); a stale answer changes nothing', (s, a) => a === 'putBackDone' && c(s === 'closingLapse' ? 'lapsed' : CLOSING.includes(s) ? 'none' : s)],
];
/** The table: [{state, act, law, cell}] — every state × act. */
export function table() {
  const out = [];
  for (const s of STATES) for (const a of ACTS) {
    let hit = null;
    for (const [law, f] of LAWS) { const r = f(s, a); if (r) { hit = { law, ...(r.cull ? { cull: r.cull } : { cell: r }) }; break; } }
    out.push({ state: s, act: a, ...(hit || { law: 'NO LAW SPEAKS', cell: null }) });
  }
  return out;
}

// ── the PURE side: a canonical state ↔ windowStep's state, an act ↔ windowStep's act ──────────────────────────────────────────
export function pureState(s) {
  const base = { owner: 'K-L', n: 1 };
  const open = (began, pending = false) => ({ phase: 'open', ...base, began, bound: 30000, deadline: 1000, pending });
  if (s === 'none') return null;
  if (s === 'armed') return open([]);
  if (s === 'flight') return open(['g1']);
  if (s === 'flight2') return open(['g1', 'g2']);
  if (s === 'flightSet') return open(['g1'], true);
  if (s === 'closingOrdered') return { phase: 'closing', ...base, ordered: true, then: null };
  if (s === 'closingShort') return { phase: 'closing', ...base, ordered: false, then: null };
  if (s === 'closingLapse') return { phase: 'closing', ...base, ordered: true, then: 'lapsed' };
  if (s === 'lapsed') return { phase: 'lapsed', ...base };
  throw new Error('no state ' + s);
}
export function pureAct(a) {
  const set = (by, behavior, paused = false) => ({ kind: 'set', by, behavior, now: 2000, paused });
  return ({
    setL: set('K-L', 'allowAndName'), setLdef: set('K-L', 'default'), setM: set('K-M', 'allowAndName'), setMdef: set('K-M', 'default'), setLpaused: set('K-L', 'allowAndName', true),
    beginOwn: { kind: 'begin', own: true, guid: 'g3', now: 2000 }, beginOther: { kind: 'begin', own: false, guid: 'gP', now: 2000 }, endAdmitted: { kind: 'end', guid: 'g1', ordered: true }, endOther: { kind: 'end', guid: 'gP', ordered: true },
    bound: { kind: 'bound', now: 1e12, ordered: true }, takeover: { kind: 'takeover', ordered: true }, takeoverM: { kind: 'takeover', ordered: true }, leaseEndL: { kind: 'leaseEnd', key: 'K-L' }, leaseEndM: { kind: 'leaseEnd', key: 'K-M' },
    connGoneL: { kind: 'connGone', key: 'K-L' }, connGoneLother: { kind: 'noop' }, connGoneM: { kind: 'connGone', key: 'K-M' }, repoint: { kind: 'repoint' }, hubStop: { kind: 'hubStop' }, adopt: { kind: 'adopt' }, putBackDone: { kind: 'putBackDone', n: 1 },
  })[a];
}
/** windowStep's state as a canonical name (the owner named when it is not the lease L). */
export function canonPure(st) {
  if (!st) return 'none';
  const who = st.owner === 'K-L' ? '' : '@M';
  if (st.phase === 'open') return (st.began.length ? (st.began.length === 1 ? 'flight' : 'flight' + st.began.length) + (st.pending ? 'Set' : '') : 'armed') + who;
  if (st.phase === 'closing') return (st.then === 'lapsed' ? (st.ordered ? 'closingLapse' : 'closingShortLapse') : (st.ordered ? 'closingOrdered' : 'closingShort')) + who;
  return st.phase + who;
}
const KEYS = ['after', 'reply', 'putBack', 'delivered', 'told', 'folder'];
/** Compare windowStep with every cell: → [{state, act, law, want, got, pass}] (`delivered` and `folder` are the mediator's — derived here). */
export function pureCells(windowStep) {
  return table().filter((r) => r.cell).map((r) => {
    const x = windowStep(pureState(r.state), pureAct(r.act));
    const after = canonPure(x.state);
    const got = { after, reply: x.refuse ? x.refuse.code : (x.forward ? 'forward' : null), putBack: !!x.putBack, delivered: r.act === 'beginOwn' || r.act === 'endAdmitted', told: !!x.told, folder: folderOf(after) };
    const want = r.cell;
    return { state: r.state, act: r.act, law: r.law, want, got, pass: KEYS.every((k) => got[k] === want[k]) };
  });
}

// ── the fake browser: Chrome's download state as measured (154 + 157) ─────────────────────────────────────────────────────────
export function fakeChrome(WS) {
  const { WebSocketServer } = WS;
  const st = { behavior: 'default', path: null, holdDefault: false, held: [], seen: [], downloads: new Map() };
  const socks = new Set(); let port = 0, nextS = 1;
  const srv = http.createServer((req, res) => {
    const j = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/json/version') return j({ Browser: 'Model/157 (the lane\'s measurements)', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/RAW-ID` });
    if (req.url === '/json/list' || req.url === '/json') return j([]);
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  srv.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => {
    ws.sessions = new Map(); ws.browserEvents = false; ws.sessionEvents = new Set(); ws.queue = []; socks.add(ws); ws.on('close', () => socks.delete(ws));
    const handle = (m) => {
      const sid = m.sessionId || null;
      const rep = (result) => { try { ws.send(JSON.stringify({ id: m.id, ...(sid ? { sessionId: sid } : {}), result })); } catch { /* gone */ } };
      if (m.method === 'Target.attachToTarget') { ws.attached = true; const s2 = 'S-' + (nextS++); ws.sessions.set(s2, m.params.targetId); return rep({ sessionId: s2 }); }
      if (m.method === 'Browser.setDownloadBehavior') {
        st.behavior = m.params.behavior; st.path = m.params.downloadPath || null;   // the last writer wins, profile-wide (measured: both wire forms)
        if (sid) { if (m.params.eventsEnabled) ws.sessionEvents.add(sid); else ws.sessionEvents.delete(sid); } else ws.browserEvents = !!m.params.eventsEnabled;
        return rep({});
      }
      if (m.method === 'Browser.cancelDownload') { const dl = st.downloads.get(m.params.guid); if (dl && !dl.done) { dl.done = true; emit(dl, 'canceled'); } return rep({}); }
      return rep({});
    };
    // ONE connection's calls are handled in order (as Chrome does): while a held put-back of the mediator's waits on it, later calls
    // on THAT connection wait behind it — so an ordered put-back stays ordered, and one on a short connection does not
    ws.release = () => { const q = ws.queue.splice(0); for (const m of q) handle(m); };
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      const mediator = !ws.attached || Number(m.id) >= 1e9;   // the MEDIATOR's own call: a short connection of its own, or an internal id on a lease's
      st.seen.push({ method: m.method, sid: m.sessionId || null, id: m.id, mediator, params: m.method && /^Browser\.(setDownloadBehavior|cancelDownload)$/.test(m.method) ? m.params : undefined });
      if (ws.queue.length) { ws.queue.push(m); return; }
      if (m.method === 'Browser.setDownloadBehavior' && m.params && m.params.behavior === 'default' && mediator && st.holdDefault) { ws.queue.push(m); st.held.push(ws); return; }
      handle(m);
    });
  }));
  // measured: browser-level events on a connection reach it for EVERY download; a page session's only for that page's own
  const recipients = (frameId) => { const out = []; for (const s of socks) { for (const sid of s.sessionEvents) if (s.sessions.get(sid) === frameId) out.push([s, sid]); if (s.browserEvents) out.push([s, null]); } return out; };   // (dispatch order measured: the page session's copy first)
  const emit = (dl, state) => { for (const [s, sid] of dl.to) { try { s.send(JSON.stringify({ method: 'Browser.downloadProgress', ...(sid ? { sessionId: sid } : {}), params: { guid: dl.guid, totalBytes: 8, receivedBytes: state === 'completed' ? 8 : 1, state } })); } catch { /* gone */ } } };
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => {
    port = srv.address().port;
    resolve({
      url: `ws://127.0.0.1:${port}/devtools/browser/RAW-ID`, st,
      /** a download BEGINS in tab `frameId`: its folder fixed NOW (measured — a put-back after the begin moves it nowhere) */
      begin(guid, frameId) { const to = recipients(frameId); const where = st.behavior === 'default' ? 'PERSON' : st.path; st.downloads.set(guid, { guid, to, where, done: false }); for (const [s, sid] of to) { try { s.send(JSON.stringify({ method: 'Browser.downloadWillBegin', ...(sid ? { sessionId: sid } : {}), params: { frameId, guid, url: 'http://site.example/' + guid, suggestedFilename: guid + '.txt' } })); } catch { /* gone */ } } return where; },
      end(guid, state = 'completed') { const dl = st.downloads.get(guid); if (dl && !dl.done) { dl.done = true; emit(dl, state); } },
      release() { st.holdDefault = false; const h = st.held.splice(0); for (const s of new Set(h)) s.release(); return h.length; },
      putBacks: () => st.seen.filter((x) => x.method === 'Browser.setDownloadBehavior' && x.mediator && x.params && x.params.behavior === 'default').length,
      folder: () => (st.behavior === 'default' ? 'person' : 'agent'),
      close() { for (const s of socks) { try { s.terminate(); } catch { /* gone */ } } srv.close(); },
    });
  }));
}

// ── the driver: one fresh world per cell over a checkout's REAL mediator ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(WS, url) {
  const ws = new WS.WebSocket(url); let id = 0; const waits = new Map(); const events = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id != null && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } else if (m.id == null) events.push(m); });
  const call = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; const t = setTimeout(() => { if (waits.delete(i)) res({ noReply: true }); }, 3000); waits.set(i, (m) => { clearTimeout(t); res(m); }); try { ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); } catch { clearTimeout(t); waits.delete(i); res({ noReply: true }); } });
  return { ws, call, events, open: new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }) };
}
const codeOf = (m) => (m && m.error ? String(m.error.message || '').split(':')[0] : (m && m.noReply ? 'no-reply' : 'forward'));
const BOUND_MS = 800;
/** Drive one cell on `road` over the checkout at `root` (or `mods` — a mutant copy): → {state, act, road, want, got, pass, note} */
export async function driveCell(root, road, state, act, want, { mods = null } = {}) {
  const require = createRequire(path.join(root, 'scripts', 'x.mjs'));
  const WS = require('ws');
  const MED = mods && mods.MED ? mods.MED : require(path.join(root, 'src/server/cdp-mediator.js')); const M = mods && mods.M ? mods.M : require(path.join(root, 'src/browser-mediation.js'));   // (a suite's mutant copy may stand in)
  const f = await fakeChrome(WS);
  const logs = [], told = [];
  const med = MED.create({ log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push('W ' + String(l)) }, windowBoundMs: BOUND_MS });
  if (typeof med.onTold === 'function') med.onTold((t) => told.push(t));
  const paused = { v: false };
  const mode = road === 'scope' ? M.SCOPE_MODE : M.MEDIATED_MODE;
  const form = process.env.VS_WINDOW_FORM === 'browser' ? 'browser' : 'session';
  const conn = async (bk, tab) => { const g = await med.grantFor({ profileId: PROFILE, browserKey: bk, upstream: f.url, targetIds: [tab], paused: () => paused.v, mode }); const cl = client(WS, g.url); await cl.open; const a = await cl.call('Target.attachToTarget', { targetId: tab, flatten: true }); return { cl, sid: a.result && a.result.sessionId }; };
  let note = '';
  const got = { after: null, reply: null, putBack: false, delivered: false, told: false, folder: null };
  try {
    const L1 = await conn(L, 'T-L'), L2 = await conn(L, 'T-L'), m = await conn(MM, 'T-M');   // L's setting connection and another of its own; M
    for (const c2 of [L1, L2]) await c2.cl.call('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true }, c2.sid);   // L hears its own downloads on both its connections (as the real driver does after its first `download`)
    const lc = () => (L1.cl.ws.readyState === 1 ? L1 : L2);
    const set = (who, behavior) => who.cl.call('Browser.setDownloadBehavior', behavior === 'default' ? { behavior, eventsEnabled: true } : { behavior, downloadPath: '/agent/' + (who === m ? 'M' : 'L'), eventsEnabled: true }, form === 'session' ? who.sid : undefined);   // the real driver's shape: on its page session (VS_WINDOW_FORM=browser: none)
    const settle = (ms = 60) => sleep(ms);
    const pre = act === 'endAdmitted' && !['flight', 'flight2', 'flightSet', 'closingOrdered'].includes(state);   // an own download already in flight, begun outside this state's window
    if (pre) { f.begin('g1', 'T-L'); await settle(); }
    const setup = {
      none: async () => { },
      armed: async () => { await set(L1, 'allowAndName'); },
      flight: async () => { await set(L1, 'allowAndName'); f.begin('g1', 'T-L'); await settle(); },
      flight2: async () => { await set(L1, 'allowAndName'); f.begin('g1', 'T-L'); f.begin('g2', 'T-L'); await settle(); },
      flightSet: async () => { await set(L1, 'allowAndName'); f.begin('g1', 'T-L'); await settle(); await set(L1, 'allowAndName'); },
      closingOrdered: async () => { await set(L1, 'allowAndName'); f.begin('g1', 'T-L'); await settle(); f.st.holdDefault = true; med.interrupt({ profileId: PROFILE, browserKey: L }); await settle(); },
      closingShort: async () => { await set(L1, 'allowAndName'); f.st.holdDefault = true; L1.cl.ws.close(); await settle(120); },
      closingLapse: async () => { await set(L1, 'allowAndName'); f.st.holdDefault = true; await sleep(BOUND_MS + 250); },
      lapsed: async () => { await set(L1, 'allowAndName'); await sleep(BOUND_MS + 250); },
    };
    await setup[state]();
    const pb0 = f.putBacks(), told0 = told.filter((t) => t.browserKey === L).length;
    if (act !== 'putBackDone' && act !== 'adopt') f.st.holdDefault = true;   // a put-back the act sends stays on its way while the window is looked at
    const evOf = (guid, method = null) => [...L1.cl.events, ...L2.cl.events].some((e) => e.params && e.params.guid === guid && (!method || e.method === method));
    // a set sent on a connection whose held put-back is still on its way waits behind it (one connection, in order — as Chrome does):
    // the suite lets the hold go after the set is on the wire, then reads the answer
    const answer = async (p) => { const r = await Promise.race([p, sleep(60).then(() => null)]); if (r) return r; f.release(); return p; };
    const acts = {
      setL: async () => { got.reply = codeOf(await answer(set(lc(), 'allowAndName'))); },
      setLdef: async () => { got.reply = codeOf(await answer(set(lc(), 'default'))); },
      setM: async () => { got.reply = codeOf(await answer(set(m, 'allowAndName'))); },
      setMdef: async () => { got.reply = codeOf(await answer(set(m, 'default'))); },
      setLpaused: async () => { paused.v = true; got.reply = codeOf(await answer(set(lc(), 'allowAndName'))); paused.v = false; },
      beginOwn: async () => { f.begin('g3', 'T-L'); await settle(80); got.delivered = evOf('g3'); },
      beginOther: async () => { f.begin('gP', 'T-P'); await settle(80); got.delivered = evOf('gP'); },
      endAdmitted: async () => { f.end('g1'); await settle(80); got.delivered = evOf('g1', 'Browser.downloadProgress'); },
      endOther: async () => { f.begin('gP', 'T-P'); await settle(30); f.end('gP'); await settle(80); got.delivered = evOf('gP'); },
      bound: async () => { await sleep(BOUND_MS + 150); },
      takeover: async () => { med.interrupt({ profileId: PROFILE, browserKey: L }); },
      takeoverM: async () => { med.interrupt({ profileId: PROFILE, browserKey: MM }); },
      leaseEndL: async () => { med.revoke({ profileId: PROFILE, browserKey: L }); },
      leaseEndM: async () => { med.revoke({ profileId: PROFILE, browserKey: MM }); },
      connGoneL: async () => { try { L1.cl.ws.close(); } catch { /* gone */ } },
      connGoneLother: async () => { try { L2.cl.ws.close(); } catch { /* gone */ } },
      connGoneM: async () => { try { m.cl.ws.close(); } catch { /* gone */ } },
      repoint: async () => { med.repoint(PROFILE, f.url.replace('RAW-ID', 'RAW-ID2')); f.st.behavior = 'default'; f.st.held.length = 0; },   // (a restarted browser starts with the profile's own place)
      hubStop: async () => { med.shutdown(); },
      adopt: async () => { if (typeof med.adopt !== 'function') { note = 'no adoption door on this checkout'; return; } await med.adopt(PROFILE, f.url); },
      putBackDone: async () => { f.release(); },
    };
    await acts[act]();
    await sleep(act === 'bound' ? 60 : 120);
    got.putBack = f.putBacks() > pb0;
    got.told = typeof med.onTold === 'function' ? told.filter((t) => t.browserKey === L).length > told0 : false;
    const v = typeof med.downloadWindowOf === 'function' ? med.downloadWindowOf(PROFILE) : null;
    got.after = canonView(v);
    if (act === 'hubStop' || act === 'repoint') got.after = v && v.phase ? got.after : 'none';
    f.release(); await sleep(120);   // every put-back lands — then whose folder is it?
    got.folder = f.folder();
  } catch (e) { note = 'threw: ' + (e && e.message); }
  finally { try { med.shutdown(); } catch { /* gone */ } f.close(); }
  const keys = ['after', 'putBack', 'folder', ...(act.startsWith('set') ? ['reply'] : []), ...(/^(begin|end)/.test(act) ? ['delivered'] : []), 'told'];
  const pass = !note && keys.every((k) => got[k] === want[k]);
  return { state, act, road, want, got, pass, note };
}
/** The mediator's own view as a canonical name; a checkout whose view has no `phase` (before the .401 read) is read as best it can. */
function canonView(v) {
  if (!v) return 'none';
  const who = v.browserKey === MM ? '@M' : '';
  if (!v.phase) return (Number(v.began) - Number(v.ended || 0) > 0 ? 'flight' : 'armed') + who;   // (639e093b8's view: {browserKey, began, ended, at})
  if (v.phase === 'open') return (v.began ? (v.began === 1 ? 'flight' : 'flight' + v.began) + (v.pending ? 'Set' : '') : 'armed') + who;
  if (v.phase === 'closing') return (v.then === 'lapsed' ? (v.ordered ? 'closingLapse' : 'closingShortLapse') : (v.ordered ? 'closingOrdered' : 'closingShort')) + who;
  return v.phase + who;
}
/** Every cell on both roads over `root`: → {cells, culls, results} */
export async function driveAll(root, { roads = ['mediated', 'scope'], only = null, mods = null, parallel = 6 } = {}) {
  const t = table();
  const jobs = [];
  for (const road of roads) for (const r of t) { if (r.cell && (!only || only(r))) jobs.push({ road, r }); }
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= jobs.length) return; const { road, r } = jobs[i]; results[i] = { ...(await driveCell(root, road, r.state, r.act, r.cell, { mods })), law: r.law }; } };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));   // each cell is a world of its own (its fake, its mediator, its ports)
  return { cells: t.filter((r) => r.cell).length, culls: t.filter((r) => r.cull), results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = table();
  if (process.argv[2] !== '--drive') {
    for (const r of t) console.log(`${r.state.padEnd(15)} ${r.act.padEnd(12)} ${r.cull ? 'CULL — ' + r.cull : JSON.stringify(r.cell)}   [${r.law}]`);
    console.log(`${t.filter((r) => r.cell).length} cells, ${t.filter((r) => r.cull).length} culls, ${t.filter((r) => !r.cell && !r.cull).length} with no law`);
  } else {
    const root = path.resolve(process.argv[3] || HERE);
    const out = await driveAll(root);
    const red = out.results.filter((r) => !r.pass);
    for (const r of red) console.log(`RED ${r.road.padEnd(8)} ${r.state.padEnd(15)} ${r.act.padEnd(12)} want ${JSON.stringify(r.want)} got ${JSON.stringify(r.got)}${r.note ? ' — ' + r.note : ''}`);
    console.log(`${root}: ${out.results.length - red.length} of ${out.results.length} cells green (${out.cells} cells × ${out.results.length / out.cells} roads; ${out.culls.length} culls)`);
  }
}
