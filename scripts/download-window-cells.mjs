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
// Gates: test-browser-mediation ⑥d (the PURE windowStep against every cell) and ⑥e (this checkout's mediator against every cell).
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
export const STATES = ['none', 'armed', 'flight', 'flight2', 'closingOrdered', 'closingShort', 'lapsed'];
export const ACTS = ['setL', 'setLdef', 'setM', 'setMdef', 'setLpaused', 'beginOwn', 'beginOther', 'endAdmitted', 'endOther', 'bound', 'takeover', 'leaseEndL', 'leaseEndM', 'connGoneL', 'connGoneM', 'repoint', 'hubStop', 'adopt', 'putBackDone'];

// ── THE LAWS (主开发's list, 18:08Z) — the first line that speaks decides the cell ─────────────────────────────────────────────
const OPEN = ['armed', 'flight', 'flight2'], CLOSING = ['closingOrdered', 'closingShort'];
const flightAfter = { armed: 'flight', flight: 'flight2', flight2: 'flight3' };
const c = (after, e = {}) => ({ after, reply: e.reply || null, putBack: !!e.putBack, cancel: !!e.cancel, delivered: !!e.delivered, told: !!e.told });
export const LAWS = [
  ['cull: no admitted download exists in this state', (s, a) => a === 'endAdmitted' && !['flight', 'flight2'].includes(s) && { cull: 'no admitted download exists in this state' }],
  ['cull: a hub start holds no window (a new mediator)', (s, a) => a === 'adopt' && s !== 'none' && { cull: 'a hub start holds no window (a new mediator)' }],
  ['W6: a hub start adopting puts the profile back', (s, a) => a === 'adopt' && c('none', { putBack: true })],
  ['W6: a repoint (the browser restarted / stopped) leaves no record and puts nothing back', (s, a) => a === 'repoint' && c('none')],
  ['W6: the hub stopping puts an open window back and leaves no record', (s, a) => a === 'hubStop' && c('none', { putBack: OPEN.includes(s) })],
  ['the person drives: a set is refused by name', (s, a) => a === 'setLpaused' && c(s, { reply: 'browser_interrupted' })],
  ['W3: one window per profile — another lease\'s set is refused while one stands', (s, a) => (a === 'setM' || a === 'setMdef') && (OPEN.includes(s) || CLOSING.includes(s)) && c(s, { reply: 'method_refused' })],
  ['W1: another lease\'s set opens its own window when none stands', (s, a) => a === 'setM' && c('armed@M', { reply: 'forward' })],
  ['W4: «default» is forwarded and closes the setter\'s window (no put-back: it is one)', (s, a) => (a === 'setLdef' || a === 'setMdef') && c('none', { reply: 'forward' })],
  ['W1: closing on a connection of its own — the lease\'s next set waits for nothing it could race: refused, a moment', (s, a) => a === 'setL' && s === 'closingShort' && c(s, { reply: 'method_refused' })],
  ['W1: the lease\'s set opens (or re-arms) its window; in flight it stays as it is', (s, a) => a === 'setL' && c(['flight', 'flight2'].includes(s) ? s : 'armed', { reply: 'forward' })],
  ['W1: a download its own frame begins in an open window is its own (admitted, told to it)', (s, a) => a === 'beginOwn' && OPEN.includes(s) && c(flightAfter[s], { delivered: true })],
  ['W1: a download its frame begins after the bound passed is canceled — it never lands in the person\'s folder', (s, a) => a === 'beginOwn' && s === 'lapsed' && c(s, { cancel: true, delivered: true })],
  ['W2: any other download is never the lease\'s and changes nothing', (s, a) => (a === 'beginOwn' || a === 'beginOther' || a === 'endOther') && c(s)],
  ['W1: the window closes when the lease\'s downloads have ended — a second keeps it open', (s, a) => a === 'endAdmitted' && (s === 'flight2' ? c('flight', { delivered: true }) : c('closingOrdered', { putBack: true, delivered: true }))],
  ['W1: no download of the lease begun within the bound ⇒ closed, put back, the lease told', (s, a) => a === 'bound' && (s === 'armed' ? c('closingOrdered>lapsed', { putBack: true, told: true }) : c(s))],
  ['a takeover puts an open window back and the lease is told', (s, a) => a === 'takeover' && (OPEN.includes(s) ? c('closingOrdered', { putBack: true, told: true }) : c(s === 'lapsed' ? 'none' : s))],
  ['the lease\'s end puts its window back', (s, a) => a === 'leaseEndL' && (OPEN.includes(s) ? c('closingShort', { putBack: true }) : c(s === 'lapsed' ? 'none' : s))],
  ['W5: the lease\'s LAST connection closing puts its window back', (s, a) => a === 'connGoneL' && (OPEN.includes(s) ? c('closingShort', { putBack: true }) : c(s))],
  ['another lease\'s end or connection changes nothing', (s, a) => (a === 'leaseEndM' || a === 'connGoneM') && c(s)],
  ['the put-back answered: the window is gone (a stale answer changes nothing)', (s, a) => a === 'putBackDone' && c(CLOSING.includes(s) ? 'none' : s)],
];
/** The table: [{state, act, law, cell | cull}] — every state × act. */
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
  if (s === 'none') return null;
  if (s === 'armed') return { phase: 'open', ...base, began: [], bound: 15000, deadline: 1000 };
  if (s === 'flight') return { phase: 'open', ...base, began: ['g1'], bound: 15000, deadline: 1000 };
  if (s === 'flight2') return { phase: 'open', ...base, began: ['g1', 'g2'], bound: 15000, deadline: 1000 };
  if (s === 'closingOrdered') return { phase: 'closing', ...base, ordered: true, then: null };
  if (s === 'closingShort') return { phase: 'closing', ...base, ordered: false, then: null };
  if (s === 'lapsed') return { phase: 'lapsed', ...base };
  throw new Error('no state ' + s);
}
export function pureAct(a) {
  const set = (by, behavior, paused = false) => ({ kind: 'set', by, behavior, now: 2000, paused });
  return ({
    setL: set('K-L', 'allowAndName'), setLdef: set('K-L', 'default'), setM: set('K-M', 'allowAndName'), setMdef: set('K-M', 'default'), setLpaused: set('K-L', 'allowAndName', true),
    beginOwn: { kind: 'begin', own: true, guid: 'g3' }, beginOther: { kind: 'begin', own: false, guid: 'gP' }, endAdmitted: { kind: 'end', guid: 'g1', ordered: true }, endOther: { kind: 'end', guid: 'gP', ordered: true },
    bound: { kind: 'bound', now: 1e12, ordered: true }, takeover: { kind: 'takeover', ordered: true }, leaseEndL: { kind: 'leaseEnd', key: 'K-L' }, leaseEndM: { kind: 'leaseEnd', key: 'K-M' },
    connGoneL: { kind: 'connGone', key: 'K-L' }, connGoneM: { kind: 'connGone', key: 'K-M' }, repoint: { kind: 'repoint' }, hubStop: { kind: 'hubStop' }, adopt: { kind: 'adopt' }, putBackDone: { kind: 'putBackDone', n: 1 },
  })[a];
}
/** windowStep's state as a canonical name (the owner named when it is not the lease L). */
export function canonPure(st) {
  if (!st) return 'none';
  const who = st.owner === 'K-L' ? '' : '@M';
  if (st.phase === 'open') return (st.began.length ? (st.began.length === 1 ? 'flight' : 'flight' + st.began.length) : 'armed') + who;
  if (st.phase === 'closing') return (st.ordered ? 'closingOrdered' : 'closingShort') + (st.then === 'lapsed' ? '>lapsed' : '') + who;
  return st.phase + who;
}
/** Compare windowStep with every cell: → [{state, act, law, want, got, pass}] (culls skipped). */
export function pureCells(windowStep) {
  return table().filter((r) => r.cell).map((r) => {
    const x = windowStep(pureState(r.state), pureAct(r.act));
    const got = { after: canonPure(x.state), reply: x.refuse ? x.refuse.code : (x.forward ? 'forward' : null), putBack: !!x.putBack, cancel: !!x.cancel, delivered: !!(x.admit || x.cancel || (r.act === 'endAdmitted' && r.state.startsWith('flight'))), told: !!x.told };
    const want = r.cell;
    const pass = ['after', 'reply', 'putBack', 'cancel', 'delivered', 'told'].every((k) => got[k] === want[k]);
    return { state: r.state, act: r.act, law: r.law, want, got, pass };
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
    ws.sessions = new Map(); ws.browserEvents = false; ws.sessionEvents = new Set(); socks.add(ws); ws.on('close', () => socks.delete(ws));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      const sid = m.sessionId || null;
      st.seen.push({ method: m.method, sid, id: m.id, mediator: !ws.attached || Number(m.id) >= 1e9, params: m.method && /^Browser\.(setDownloadBehavior|cancelDownload)$/.test(m.method) ? m.params : undefined });
      const rep = (result) => { try { ws.send(JSON.stringify({ id: m.id, ...(sid ? { sessionId: sid } : {}), result })); } catch { /* gone */ } };
      if (m.method === 'Target.attachToTarget') { ws.attached = true; const s = 'S-' + (nextS++); ws.sessions.set(s, m.params.targetId); return rep({ sessionId: s }); }
      if (m.method === 'Browser.setDownloadBehavior') {
        const apply = () => { st.behavior = m.params.behavior; st.path = m.params.downloadPath || null; if (sid) { if (m.params.eventsEnabled) ws.sessionEvents.add(sid); else if (m.params.behavior === 'default') { /* measured: a default elsewhere leaves a session's events on */ } } else ws.browserEvents = !!m.params.eventsEnabled; rep({}); };
        if (m.params.behavior === 'default' && !sid && (!ws.attached || Number(m.id) >= 1e9) && st.holdDefault) { st.held.push(apply); return; }   // (the suite holds the MEDIATOR's put-back — browser-level — to look at the window while it closes)
        return apply();
      }
      if (m.method === 'Browser.cancelDownload') { const dl = st.downloads.get(m.params.guid); if (dl && !dl.done) { dl.done = true; emit(dl, 'canceled'); } return rep({}); }
      return rep({});
    });
  }));
  const recipients = (frameId) => { const out = []; for (const s of socks) { if (s.browserEvents) out.push([s, null]); for (const sid of s.sessionEvents) if (s.sessions.get(sid) === frameId) out.push([s, sid]); } return out; };
  const emit = (dl, state) => { for (const [s, sid] of dl.to) { try { s.send(JSON.stringify({ method: 'Browser.downloadProgress', ...(sid ? { sessionId: sid } : {}), params: { guid: dl.guid, totalBytes: 8, receivedBytes: state === 'completed' ? 8 : 1, state } })); } catch { /* gone */ } } };
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => {
    port = srv.address().port;
    resolve({
      url: `ws://127.0.0.1:${port}/devtools/browser/RAW-ID`, st,
      /** a download BEGINS in tab `frameId`: its folder fixed now (the profile-wide behaviour); its events to the measured recipients */
      begin(guid, frameId) { const to = recipients(frameId); const where = st.behavior === 'default' ? 'PERSON' : st.path; st.downloads.set(guid, { guid, to, where, done: false }); for (const [s, sid] of to) { try { s.send(JSON.stringify({ method: 'Browser.downloadWillBegin', ...(sid ? { sessionId: sid } : {}), params: { frameId, guid, url: 'http://site.example/' + guid, suggestedFilename: guid + '.txt' } })); } catch { /* gone */ } } return where; },
      end(guid, state = 'completed') { const dl = st.downloads.get(guid); if (dl && !dl.done) { dl.done = true; emit(dl, state); } },
      release() { const h = st.held.splice(0); for (const f of h) f(); return h.length; },
      putBacks: () => st.seen.filter((x) => x.method === 'Browser.setDownloadBehavior' && !x.sid && x.mediator && x.params && x.params.behavior === 'default').length,   // the MEDIATOR's: a short connection of its own, or its internal ids on a lease's
      cancels: () => st.seen.filter((x) => x.method === 'Browser.cancelDownload' && x.mediator).length,
      close() { for (const s of socks) { try { s.terminate(); } catch { /* gone */ } } srv.close(); },
    });
  }));
}

// ── the driver: one fresh world per cell over a checkout's REAL mediator ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(WS, url) {
  const ws = new WS.WebSocket(url); let id = 0; const waits = new Map(); const events = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id != null && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } else if (m.id == null) events.push(m); });
  const call = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; const t = setTimeout(() => { if (waits.delete(i)) res({ noReply: true }); }, 3000); waits.set(i, (m) => { clearTimeout(t); res(m); }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { ws, call, events, open: new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }) };
}
const codeOf = (m) => (m && m.error ? String(m.error.message || '').split(':')[0] : (m && m.noReply ? 'no-reply' : 'forward'));
const BOUND_MS = 400;
/** Drive one cell on `road` over the checkout at `root`: → {state, act, road, want, got, pass, note} */
export async function driveCell(root, road, state, act, want, { mods = null } = {}) {
  const require = createRequire(path.join(root, 'scripts', 'x.mjs'));
  const WS = require('ws');
  const MED = mods && mods.MED ? mods.MED : require(path.join(root, 'src/server/cdp-mediator.js')); const M = mods && mods.M ? mods.M : require(path.join(root, 'src/browser-mediation.js'));   // (a suite's mutant copy may stand in)
  const f = await fakeChrome(WS);
  const logs = [];
  const med = MED.create({ log: { log: (l) => logs.push(String(l)), warn: (l) => logs.push('W ' + String(l)) }, windowBoundMs: BOUND_MS });
  const paused = { v: false };
  const mode = road === 'scope' ? M.SCOPE_MODE : M.MEDIATED_MODE;
  const lease = async (bk, tab) => { const g = await med.grantFor({ profileId: PROFILE, browserKey: bk, upstream: f.url, targetIds: [tab], paused: () => paused.v, mode }); const cl = client(WS, g.url); await cl.open; const a = await cl.call('Target.attachToTarget', { targetId: tab, flatten: true }); return { g, cl, sid: a.result && a.result.sessionId, tab }; };
  let note = '';
  const got = { after: null, reply: null, putBack: false, cancel: false, delivered: false, told: false };
  try {
    const l = await lease(L, 'T-L'), m = await lease(MM, 'T-M');
    const form = process.env.VS_WINDOW_FORM === 'browser' ? 'browser' : 'session';
    const set = (who, behavior) => who.cl.call('Browser.setDownloadBehavior', behavior === 'default' ? { behavior } : { behavior, downloadPath: '/agent/' + who.tab, eventsEnabled: true }, form === 'session' ? who.sid : undefined);   // the real driver's shape: on its page session (VS_WINDOW_FORM=browser: with no session)
    // ── the state
    const setup = {
      none: async () => {},
      armed: async () => { await set(l, 'allowAndName'); },
      flight: async () => { await set(l, 'allowAndName'); f.begin('g1', 'T-L'); await sleep(60); },
      flight2: async () => { await set(l, 'allowAndName'); f.begin('g1', 'T-L'); f.begin('g2', 'T-L'); await sleep(60); },
      closingOrdered: async () => { await set(l, 'allowAndName'); f.begin('g1', 'T-L'); await sleep(60); f.st.holdDefault = true; f.end('g1'); await sleep(80); },
      closingShort: async () => { await set(l, 'allowAndName'); f.st.holdDefault = true; l.cl.ws.close(); await sleep(120); },
      lapsed: async () => { await set(l, 'allowAndName'); await sleep(BOUND_MS + 250); },
    };
    await setup[state]();
    const view0 = typeof med.downloadWindowOf === 'function' ? med.downloadWindowOf(PROFILE) : null;
    const pb0 = f.putBacks(), cx0 = f.cancels(), told0 = Date.now() - 1;
    if (act !== 'putBackDone' && act !== 'adopt') f.st.holdDefault = true;   // a put-back the act sends stays on its way while the window is looked at
    const evOf = (guid) => l.cl.events.some((e) => e.params && e.params.guid === guid);
    const ensureL = async () => { if (l.cl.ws.readyState !== 1) { const g = await med.grantFor({ profileId: PROFILE, browserKey: L, upstream: f.url, targetIds: ['T-L'], paused: () => paused.v, mode }); l.cl = client(WS, g.url); await l.cl.open; const a = await l.cl.call('Target.attachToTarget', { targetId: 'T-L', flatten: true }); l.sid = a.result && a.result.sessionId; } };
    // ── the act
    const acts = {
      setL: async () => { await ensureL(); got.reply = codeOf(await set(l, 'allowAndName')); },
      setLdef: async () => { await ensureL(); got.reply = codeOf(await set(l, 'default')); },
      setM: async () => { got.reply = codeOf(await set(m, 'allowAndName')); },
      setMdef: async () => { got.reply = codeOf(await set(m, 'default')); },
      setLpaused: async () => { await ensureL(); paused.v = true; got.reply = codeOf(await set(l, 'allowAndName')); paused.v = false; },
      beginOwn: async () => { f.begin('g3', 'T-L'); await sleep(80); got.delivered = evOf('g3'); },
      beginOther: async () => { f.begin('gP', 'T-P'); await sleep(80); got.delivered = evOf('gP'); },
      endAdmitted: async () => { f.end('g1'); await sleep(80); got.delivered = l.cl.events.some((e) => e.method === 'Browser.downloadProgress' && e.params && e.params.guid === 'g1'); },
      endOther: async () => { f.begin('gP', 'T-P'); await sleep(30); f.end('gP'); await sleep(80); got.delivered = evOf('gP'); },
      bound: async () => { await sleep(BOUND_MS + 150); },
      takeover: async () => { const r = med.interrupt({ profileId: PROFILE, browserKey: L }); got.told = !!(r && r.downloadsPutBack); },
      leaseEndL: async () => { med.revoke({ profileId: PROFILE, browserKey: L }); },
      leaseEndM: async () => { med.revoke({ profileId: PROFILE, browserKey: MM }); },
      connGoneL: async () => { try { l.cl.ws.close(); } catch { /* gone */ } },
      connGoneM: async () => { try { m.cl.ws.close(); } catch { /* gone */ } },
      repoint: async () => { med.repoint(PROFILE, f.url.replace('RAW-ID', 'RAW-ID2')); },
      hubStop: async () => { med.shutdown(); },
      adopt: async () => { if (typeof med.adopt !== 'function') { note = 'no adoption door on this checkout'; return; } await med.adopt(PROFILE, f.url); },
      putBackDone: async () => { f.st.holdDefault = false; f.release(); },
    };
    await acts[act]();
    await sleep(act === 'bound' ? 60 : 120);
    got.putBack = f.putBacks() > pb0;
    got.cancel = f.cancels() > cx0;
    if (act === 'bound') { const t = typeof med.windowToldOf === 'function' ? med.windowToldOf(PROFILE, L) : null; got.told = !!(t && /no download began/.test(t.why) && Number(t.at) > told0); }
    const v = typeof med.downloadWindowOf === 'function' ? med.downloadWindowOf(PROFILE) : null;
    got.after = canonView(v, view0, state);
    if (act === 'hubStop' || act === 'repoint') got.after = v && v.phase ? got.after : 'none';
    f.st.holdDefault = false; f.release();
  } catch (e) { note = 'threw: ' + (e && e.message); }
  finally { try { med.shutdown(); } catch { /* gone */ } f.close(); }
  // a cell whose act carries no reply / delivery / told is not judged on them
  const keys = ['after', 'putBack', 'cancel', ...(act.startsWith('set') ? ['reply'] : []), ...(/^(begin|end)/.test(act) ? ['delivered'] : []), ...(act === 'takeover' || act === 'bound' ? ['told'] : [])];
  const pass = !note && keys.every((k) => got[k] === want[k]);
  return { state, act, road, want, got, pass, note };
}
/** The mediator's own view as a canonical name; a checkout whose view has no `phase` (before the .401 read) is read as best it can. */
function canonView(v, v0, state) {
  if (!v) return 'none';
  const who = v.browserKey === MM ? '@M' : '';
  if (!v.phase) return (Number(v.began) - Number(v.ended || 0) > 0 ? 'flight' : 'armed') + who;   // (639e093b8's view: {browserKey, began, ended, at})
  if (v.phase === 'open') return (v.began ? (v.began === 1 ? 'flight' : 'flight' + v.began) : 'armed') + who;
  if (v.phase === 'closing') return (v.ordered ? 'closingOrdered' : 'closingShort') + (v.then === 'lapsed' ? '>lapsed' : '') + who;
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
