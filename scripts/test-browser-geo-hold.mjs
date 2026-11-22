#!/usr/bin/env node
// test-browser-geo-hold — B-9584 U2c: A PROFILE'S PLACE ON THE STOCK BROWSER, ROAD B (src/server/browser-geo-hold.js), fast.
// The REAL hold over a FAKE browser endpoint (an in-process CDP socket on loopback that answers as Chrome does, and lets a leg
// hold, refuse or never answer the place). The hold ADDS a place on top of the profile's own stored denial (the keeper's, measured
// fail-closed on a real Chrome). What it pins:
//   ① ORDER — every new tab is paused and its place set BEFORE it is released; the hold gives NO permission.
//   ② THE TABS OPEN AT THE ARM get their place before the arm answers (the start's first blank).
//   ③ THE BOUND — a place refused, or not answered inside it ⇒ the tab RELEASED unplaced (it runs DENIED by the stored setting, never
//      this machine's position) and SAID — never closed, never held for good; a socket dead mid-job says nothing false.
//   ⑤ THE HOLD LOST ⇒ said, armed again; every open tab placed again and released («held» after «lost»); its tries spent ⇒ «down».
//   r1264 must 2 — the browser relaunched on a NEW address ⇒ the re-arm reaches it there; the arm's timer ends its own socket.
//   r1707 — the timer on the RE-ARM path; rearmNow after «down» reaches the relaunched browser; a socket gone while its tabs are placed
//      is never «held».
//   ⑥ planOf: a place in range with its accuracy only («blocked» is the stored denial alone, no hold).
//   B-9584 (B): a listed site — the places first, then (own socket) the every-origin denial and the exact origin's grant; a new
//      context granted between its tab's place and release; an unplaced tab CLOSED with a list; a re-arm grants after its places.
//   REDs (anchored): released before its place; no bound; a re-arm judged by state; a mid-job death said as unplaced; the re-arm on
//   the address it was armed with; the timer that keeps its socket; rearmNow that only ends a socket; the open handler's race.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebSocketServer, WebSocket } = require('ws');
const GH = require('../src/server/browser-geo-hold.js');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(10); return cond(); };
const J = JSON.stringify;
const PLACE = Object.freeze({ kind: 'place', latitude: 35.6762, longitude: 139.6503, accuracy: 50 });   // a stand-in place (no person's)

/** A fake browser endpoint. `mode.place`: 'ok' | 'refuse' | 'never' (the override's answer); `mode.close`: 'ok' | 'never'. */
async function fakeBrowser({ pages = [{ targetId: 'T0', type: 'page', url: 'about:blank' }] } = {}) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/devtools/browser/fake' });
  await new Promise((r) => wss.on('listening', r));
  const f = { calls: [], conns: 0, sockets: [], gone: 0, mode: { place: 'ok', close: 'ok', autoAttach: 'ok' }, refuseConnect: false, sid: 0, targets: new Map(pages.map((p) => [p.targetId, { ...p }])), closed: [], paused: new Set() };   // paused: the targets a dead socket left paused (attached again «waiting»)
  f.url = `ws://127.0.0.1:${wss.address().port}/devtools/browser/fake`;
  wss.on('connection', (ws) => {
    if (f.refuseConnect) { ws.terminate(); return; }
    f.conns++; f.sockets.push(ws); ws.on('close', () => { f.gone++; });
    const send = (o) => { try { ws.send(J(o)); } catch { /* gone */ } };
    const attach = (t, waiting) => { const sessionId = `S${++f.sid}`; send({ method: 'Target.attachedToTarget', params: { sessionId, targetInfo: t, waitingForDebugger: waiting } }); return sessionId; };
    f.open = (targetId, extra = {}) => { const t = { targetId, type: 'page', url: 'about:blank', ...extra }; f.targets.set(targetId, t); return attach(t, true); };   // extra may carry its browserContextId
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)); f.calls.push({ ...m, at: Date.now(), conn: f.conns });
      const answer = (result = {}) => send({ id: m.id, result });
      if (m.method === 'Target.setAutoAttach') { if (f.mode.autoAttach === 'never') return; for (const t of f.targets.values()) attach(t, f.paused.has(t.targetId)); return answer(); }
      if (m.method === 'Target.getTargets') return answer({ targetInfos: [...f.targets.values()] });
      if (m.method === 'Target.attachToTarget') return answer({ sessionId: `S${++f.sid}` });
      if (m.method === 'Emulation.setGeolocationOverride') { if (f.mode.place === 'never') return; if (f.mode.place === 'delay') { setTimeout(() => answer(), f.placeDelayMs || 150); return; } if (f.mode.place === 'refuse') return send({ id: m.id, error: { code: -32000, message: 'refused (a stand-in)' } }); return answer(); }
      if (m.method === 'Target.closeTarget') { if (f.mode.close === 'never') return; f.closed.push(m.params.targetId); f.targets.delete(m.params.targetId); return answer({ success: true }); }
      return answer();
    });
  });
  f.dropAll = () => { for (const s of f.sockets) { try { s.terminate(); } catch { /* gone */ } } f.sockets = []; };
  f.close = () => new Promise((r) => { f.dropAll(); wss.close(() => r()); });
  return f;
}
const of = (f, method, pred = () => true) => f.calls.filter((c) => c.method === method && pred(c));
const idx = (f, method, pred = () => true) => f.calls.findIndex((c) => c.method === method && pred(c));
const quiet = { log() { }, warn() { }, error() { } };

async function legsOf(G, only = null) {
  const out = {};
  const evs = [];
  const run = (k) => !only || only.includes(k);
  // ① + ② a place: the tab at the arm placed before the arm answers; a new tab paused, placed, THEN released; no permission given
  if (run('place')) {
    const f = await fakeBrowser();
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 400, closeMs: 300, armMs: 3000, rearmMs: [40, 80], onEvent: (e) => evs.push(e) });
    const r = await h.arm('bp-00000001', { url: () => f.url, plan: PLACE });
    const t0Override = idx(f, 'Emulation.setGeolocationOverride');
    out.armOk = r.ok === true;
    out.firstTabPlaced = t0Override >= 0 && J(f.calls[t0Override].params) === J({ latitude: 35.6762, longitude: 139.6503, accuracy: 50 });
    const sid = f.open('T1');
    await until(() => idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sid) >= 0, 1000);
    const iO = idx(f, 'Emulation.setGeolocationOverride', (c) => c.sessionId === sid), iR = idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sid);
    out.placeOrder = iO >= 0 && iR > iO;
    out.noPermission = of(f, 'Browser.setPermission', (c) => c.params.setting === 'granted').length === 0 && of(f, 'Browser.setPermission', (c) => c.params.setting === 'denied' && !c.params.origin).length >= 1;   // B-9584 (B): no grant without a listed site; the every-origin denial on its own socket
    out.held = J(h.heldOf('bp-00000001')) === J({ ...PLACE, sites: [] }) && h.factOf('bp-00000001').state === 'held';
    // ⑤ lost ⇒ said, armed again on its own, every open tab placed again and THEN released
    const n0 = f.calls.length;
    f.dropAll();
    await until(() => evs.some((e) => e.kind === 'held' && e.after === 'lost'), 2000);
    out.lostSaid = evs.some((e) => e.kind === 'lost' && e.profileId === 'bp-00000001');
    out.heldAgain = evs.some((e) => e.kind === 'held' && e.after === 'lost') && f.conns === 2 && f.calls.slice(n0).some((c) => c.method === 'Emulation.setGeolocationOverride');
    await until(() => f.calls.slice(n0).filter((c) => c.conn === 2 && c.method === 'Runtime.runIfWaitingForDebugger').length >= 2, 1000);
    { const again = f.calls.slice(n0).filter((c) => c.conn === 2); const sids = [...new Set(again.filter((c) => c.method === 'Emulation.setGeolocationOverride').map((c) => c.sessionId))];
      out.rearmReleased = sids.length >= 2 && sids.every((x) => { const a = again.findIndex((c) => c.method === 'Emulation.setGeolocationOverride' && c.sessionId === x), b = again.findIndex((c) => c.method === 'Runtime.runIfWaitingForDebugger' && c.sessionId === x); return a >= 0 && b > a; }); }
    out.noValueInEvents = !evs.some((e) => /35\.67|139\.65/.test(J(e)));
    // ⑤ tries spent ⇒ down (said; the tabs stay on the stored denial)
    f.refuseConnect = true; f.dropAll();
    await until(() => evs.some((e) => e.kind === 'down'), 2000);
    out.down = evs.some((e) => e.kind === 'down' && e.profileId === 'bp-00000001');
    h.dispose(); await f.close();
  }
  // ③ THE BOUND: a place refused, or not answered inside it ⇒ the tab RELEASED unplaced (it runs denied by the stored setting) and SAID — never held for good
  for (const mode of run('bound') ? ['never', 'refuse'] : []) {
    const f = await fakeBrowser({ pages: [] });
    const e2 = [];
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 300, closeMs: 300, armMs: 3000, rearmMs: [40], onEvent: (e) => e2.push(e) });
    await h.arm('bp-00000003', { url: f.url, plan: PLACE });
    f.mode.place = mode;
    const t0 = Date.now(), sid = f.open('T3');
    await until(() => idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sid) >= 0, 1000);
    const ms = Date.now() - t0;
    out[`${mode}Released`] = idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sid) >= 0 && ms < (mode === 'never' ? 300 + 400 : 300);   // a refusal released before its bound (300 ms) would have run out
    out[`${mode}NeverClosed`] = of(f, 'Target.closeTarget').length === 0;
    out[`${mode}Said`] = e2.some((e) => e.kind === 'unplaced' && e.why === (mode === 'never' ? 'not answered' : 'refused') && e.opened === true) && h.factOf('bp-00000003').unplaced === 1;
    out[`${mode}Ms`] = ms;
    h.dispose(); await f.close();
  }
  // a socket that dies MID-JOB (its place never answered) files no «unplaced» — the next arm takes the tab
  if (run('midjob')) {
    const f = await fakeBrowser({ pages: [] });
    const e3 = [];
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 5000, closeMs: 300, armMs: 3000, rearmMs: [5000], onEvent: (e) => e3.push(e) });
    await h.arm('bp-00000004', { url: f.url, plan: PLACE });
    f.mode.place = 'never';
    f.open('T4');
    await sleep(120);
    f.dropAll();
    await until(() => e3.some((e) => e.kind === 'lost'), 1500);
    await sleep(100);
    out.midJobQuiet = e3.some((e) => e.kind === 'lost') && !e3.some((e) => e.kind === 'unplaced');
    h.dispose(); await f.close();
  }
  // r1264 must 2: the browser MOVED (a relaunch on a new address) ⇒ the re-arm reaches it there (the url is the record's, read at each try)
  if (run('moved')) {
    const f1 = await fakeBrowser(), f2 = await fakeBrowser();
    let cur = f1.url;
    const e4 = [];
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 300, closeMs: 300, armMs: 3000, rearmMs: [40, 80, 160], onEvent: (e) => e4.push(e) });
    await h.arm('bp-00000006', { url: () => cur, plan: PLACE });
    cur = f2.url;                // the record now names the relaunched browser
    h.rearmNow('bp-00000006');   // the keeper's word at the heal
    await until(() => e4.some((e) => e.kind === 'held' && e.after === 'lost'), 2000);
    out.movedHeld = f2.conns === 1 && f1.conns === 1 && of(f2, 'Emulation.setGeolocationOverride').length >= 1 && !e4.some((e) => e.kind === 'down');
    h.dispose(); await f1.close(); await f2.close();
  }
  // the arm's timer ends its socket (never a second auto-attach beside the next try)
  if (run('timer')) {
    const f = await fakeBrowser();
    f.mode.autoAttach = 'never';
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 300, closeMs: 300, armMs: 400, rearmMs: [5000] });
    const r = await h.arm('bp-00000007', { url: f.url, plan: PLACE });
    await until(() => f.gone >= 1, 1000);
    out.timerEnds = r.ok === false && f.gone === 1;
    h.dispose(); await f.close();
  }
  // r1707 (8): the arm's timer on the RE-ARM path ends its own socket — never a second auto-attach left open beside the next try
  if (run('retimer')) {
    const f = await fakeBrowser();
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 2000, closeMs: 300, armMs: 150, rearmMs: [40, 300] });   // a call's bound far past the arm's timer: only the TIMER can end a re-arm's socket in time (else the open handler's own refusal closes it, and the RED could not bite)
    const r = await h.arm('bp-00000008', { url: f.url, plan: PLACE });
    f.mode.autoAttach = 'never';
    f.dropAll();                                  // lost: its re-arms' auto-attach is never answered
    await until(() => f.conns >= 3, 3000);        // the second try connected (the first try's timer ran out well before)
    await sleep(50);
    out.retimerOpen = f.conns - f.gone;           // the sockets still open on the browser: the second try's alone
    out.retimerEnds = r.ok === true && f.conns >= 3 && out.retimerOpen === 1;
    h.dispose(); await f.close();
  }
  // r1707 (7): rearmNow after «down» (every try spent) starts the re-arm itself and reaches the relaunched browser
  if (run('downmoved')) {
    const f1 = await fakeBrowser(), f2 = await fakeBrowser();
    let cur = f1.url;
    const e5 = [];
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 300, closeMs: 300, armMs: 1000, rearmMs: [40, 80], onEvent: (e) => e5.push(e) });
    await h.arm('bp-00000009', { url: () => cur, plan: PLACE });
    f1.refuseConnect = true; f1.dropAll();
    await until(() => e5.some((e) => e.kind === 'down'), 3000);
    cur = f2.url;                                 // the heal relaunched Chrome on a new address
    h.rearmNow('bp-00000009');
    await until(() => e5.some((e) => e.kind === 'held' && e.after === 'lost'), 1500);   // a held browser comes back in ~100 ms here; the RED spends this bound
    out.downMovedHeld = e5.some((e) => e.kind === 'down') && f2.conns === 1 && e5.some((e) => e.kind === 'held' && e.after === 'lost') && (h.factOf('bp-00000009') || {}).state === 'held';
    h.dispose(); await f1.close(); await f2.close();
  }
  // r1707 (7): the open handler's race — a re-arm whose socket goes WHILE its tabs are being placed is never said «held»
  if (run('race')) {
    const f = await fakeBrowser();
    const e6 = [];
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 1500, closeMs: 300, armMs: 4000, rearmMs: [40, 80], onEvent: (e) => e6.push(e) });
    await h.arm('bp-0000000a', { url: f.url, plan: PLACE });
    f.mode.place = 'never';
    f.dropAll();                                                                   // lost: the re-arm's tab waits on a place never answered
    await until(() => f.calls.some((c) => c.conn === 2 && c.method === 'Emulation.setGeolocationOverride'), 2000);
    f.refuseConnect = true; f.dropAll();                                           // its socket goes while the open handler waits on that job
    await until(() => e6.some((e) => e.kind === 'down'), 2000);
    out.raceQuiet = e6.some((e) => e.kind === 'down') && !e6.some((e) => e.kind === 'held' && e.after === 'lost');
    h.dispose(); await f.close();
  }
  // B-9584 (B, 主开发 r1898): A LISTED SITE — the place on every open tab FIRST, then (on the hold's own socket) the every-origin denial
  // and the listed grant; a tab the hold could not place is CLOSED (never released); a new context's grants after its tab's place and
  // before its release; a re-arm grants again on its new socket, after its places
  if (run('sites')) {
    const f = await fakeBrowser();
    const e7 = [];
    const SITE = 'http://127.0.0.1:9';
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet, boundMs: 600, closeMs: 300, armMs: 3000, rearmMs: [40, 80], onEvent: (e) => e7.push(e) });
    f.mode.place = 'delay'; f.placeDelayMs = 150;   // the browser answers each place 150 ms late: a grant sent before that answer is seen
    const r = await h.arm('bp-0000000b', { url: () => f.url, plan: { ...PLACE, sites: [SITE + '/a/path', SITE] } });
    const iPlace = idx(f, 'Emulation.setGeolocationOverride'), iDeny = idx(f, 'Browser.setPermission', (c) => c.params.setting === 'denied' && !c.params.origin), iGrant = idx(f, 'Browser.setPermission', (c) => c.params.setting === 'granted');
    out.sitesOrder = r.ok === true && iPlace >= 0 && iDeny > iPlace && iGrant > iDeny && f.calls[iDeny].at - f.calls[iPlace].at >= 140;   // the grants only once the place was ANSWERED
    out.sitesExact = J(of(f, 'Browser.setPermission', (c) => c.params.setting === 'granted').map((c) => c.params.origin)) === J([SITE]) && J(h.heldOf('bp-0000000b').sites) === J([SITE]);
    // a new context: its tab placed, then its grants, then its release
    const sidC = f.open('T10', { browserContextId: 'C2' });
    await until(() => idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sidC) >= 0, 1000);
    const cO = idx(f, 'Emulation.setGeolocationOverride', (c) => c.sessionId === sidC), cG = idx(f, 'Browser.setPermission', (c) => c.params.browserContextId === 'C2' && c.params.setting === 'granted'), cR = idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sidC);
    out.sitesNewCtx = cO >= 0 && cG > cO && cR > cG;
    // a tab whose place is refused, with sites on the list: CLOSED, never released, said with its target id (no value)
    f.mode.place = 'refuse';
    const sidX = f.open('T11');
    await until(() => f.closed.includes('T11'), 1000);
    out.sitesClosed = f.closed.includes('T11') && idx(f, 'Runtime.runIfWaitingForDebugger', (c) => c.sessionId === sidX) < 0 && e7.some((e) => e.kind === 'closed' && e.targetId === 'T11' && e.shut === true) && !e7.some((e) => e.kind === 'unplaced');
    // the hold lost and armed again: on the new socket, every place before its grants
    f.mode.place = 'ok';
    const n0 = f.calls.length;
    f.paused.add('T0');   // r1898 (7): a tab the dead socket left PAUSED
    f.dropAll();
    await until(() => e7.some((e) => e.kind === 'held' && e.after === 'lost'), 2000);
    const again = f.calls.slice(n0).filter((c) => c.conn === 2);
    const aPlaceLast = again.map((c) => c.method).lastIndexOf('Emulation.setGeolocationOverride'), aGrantFirst = again.findIndex((c) => c.method === 'Browser.setPermission' && c.params.setting === 'granted');
    out.sitesRearm = aGrantFirst > aPlaceLast && aPlaceLast >= 0;
    const aRel = again.map((c, i) => (c.method === 'Runtime.runIfWaitingForDebugger' ? i : -1)).filter((i) => i >= 0);
    out.sitesRearmRelease = aGrantFirst >= 0 && aRel.length > 0 && aRel.every((i) => i > aGrantFirst);   // the paused tab released only once its grants are set
    out.noOriginInEvents = !e7.some((e) => /127\.0\.0\.1:9/.test(J(e)));
    h.dispose(); await f.close();
  }
  // an arm with no loopback address or nothing to hold — never armed; «blocked» is no hold (the stored denial alone)
  if (run('refused')) {
    const h = G.create({ WebSocketImpl: WebSocket, log: quiet });
    const a = await h.arm('bp-00000005', { url: 'ws://203.0.113.9:9222/devtools/browser/x', plan: PLACE });
    const b = await h.arm('bp-00000005', { url: 'ws://127.0.0.1:9/devtools/browser/x', plan: null });
    const c = await h.arm('bp-00000005', { url: 'ws://127.0.0.1:9/devtools/browser/x', plan: { kind: 'blocked' } });
    out.refusedArm = a.ok === false && a.code === 'place_not_held' && b.ok === false && c.ok === false && h.heldOf('bp-00000005') === null;
  }
  return out;
}

console.log('— B-9584 U2c: the place hold over a fake browser endpoint (on top of the profile\'s own stored denial)');
ok(J(GH.planOf({ kind: 'place', latitude: 35.6762, longitude: 139.6503, accuracy: 100 })) === J({ kind: 'place', latitude: 35.6762, longitude: 139.6503, accuracy: 100, sites: [] }) && GH.planOf({ kind: 'blocked' }) === null
  && GH.planOf(null) === null && GH.planOf({ kind: 'place', latitude: 95, longitude: 0, accuracy: 10 }) === null && GH.planOf({ kind: 'place', latitude: 1, longitude: 2 }) === null,
  '⑥ planOf: a place in range with its accuracy only; «blocked» is no hold (the profile\'s own stored denial alone); nothing, out of range, no accuracy ⇒ null', null);
ok(J(GH.overrideOf(PLACE)) === J({ latitude: 35.6762, longitude: 139.6503, accuracy: 50 }), '⑥ overrideOf: the place with its accuracy', null);
ok(J(GH.planOf({ ...PLACE, sites: ['https://B.example/x', 'https://a.example'] }).sites) === J(['https://a.example', 'https://b.example']) && J(GH.planOf({ ...PLACE, sites: ['*.example.com'] }).sites) === '[]' && J(GH.planOf(PLACE).sites) === '[]', '(B) planOf: the sites judged again at the hold (exact origins, sorted); a list that does not pass gives NO site the place', null);
const R = await legsOf(GH);
ok(R.armOk && R.firstTabPlaced, '② the tab open at the arm (the start\'s first blank) has its place BEFORE the arm answers', R);
ok(R.placeOrder, '① a new tab is paused, its place set, THEN released (Runtime.runIfWaitingForDebugger after the override)', R);
ok(R.noPermission && R.held, '① the hold gives NO grant without a listed site — only its every-origin denial on its own socket (the stored denial stands under the place); it names its plan', R);
ok(R.neverReleased && R.neverNeverClosed && R.neverSaid, `③ THE BOUND: a place not answered within it ⇒ the tab RELEASED unplaced (${R.neverMs} ms for a 300 ms bound) — it runs denied by the stored setting, never closed — and said («not answered»)`, R);
ok(R.refuseReleased && R.refuseNeverClosed && R.refuseSaid, `③ a place REFUSED by the browser ⇒ the tab released unplaced at once (${R.refuseMs} ms), said («refused»)`, R);
ok(R.midJobQuiet, '③ a socket that dies mid-job files NO «unplaced» (the tab waits for the next arm — never a false word)', R);
ok(R.lostSaid && R.heldAgain && R.rearmReleased && R.noValueInEvents, '⑤ the hold LOST ⇒ said, armed again on its own, every open tab placed again and THEN released («held» after «lost»); no event carries a value of the place', R);
ok(R.down, '⑤ its tries spent (the browser takes no new socket) ⇒ «down» (said; the tabs stay on the stored denial)', R);
ok(R.movedHeld, 'r1264 must 2: the browser relaunched on a NEW address ⇒ the re-arm reaches it THERE (the record\'s address, read at each try), never «down» against the dead one', R);
ok(R.timerEnds, 'the arm\'s timer ends its own socket (never a second auto-attach beside the next try)', R);
ok(R.retimerEnds, `r1707 (8): the arm's timer on the RE-ARM path ends its own socket — one socket open on the browser while the next try runs (${R.retimerOpen})`, R);
ok(R.downMovedHeld, 'r1707 (7): rearmNow after «down» (every try spent) starts the re-arm itself and reaches the relaunched browser — its place held again', R);
ok(R.raceQuiet, 'r1707 (7): a re-arm whose socket goes while its tabs are placed is never said «held» over a dead socket (no false «given again»)', R);
ok(R.sitesOrder && R.sitesExact, 'B-9584 (B): a listed site — every open tab holds the place FIRST, then the every-origin denial, then the grant of the EXACT origin (a path dropped, once), on the hold\'s own socket', R);
ok(R.sitesNewCtx, '(B) a new browser context: its tab placed, THEN its grants, THEN its release', R);
ok(R.sitesClosed, '(B) with sites on the list, a tab whose place is refused is CLOSED (never released), said with its target id', R);
ok(R.sitesRearmRelease, '(B) r1898 (7) the hold armed again: a tab its dead socket left PAUSED is released only AFTER its context\'s grants (released at its place, a listed site read «denied» on a real browser)', R);
ok(R.sitesRearm && R.noOriginInEvents, '(B) the hold armed again: on its new socket every place BEFORE its grants (between the death and then, «denied»); no event names a site', R);
ok(R.refusedArm, 'an arm with no loopback address, nothing to hold, or «blocked» ⇒ refused by name (place_not_held), nothing held', R);

// REDs — copies of the hold, anchored
const src = (await import('node:fs')).readFileSync(path.join(REPO, 'src/server/browser-geo-hold.js'), 'utf8');
const MUT = mutantCopies('geo-hold-reds', REPO);
const early = MUT.load('src/server/browser-geo-hold.js', anchored(src, "    const o = await call(h, 'Emulation.setGeolocationOverride', overrideOf(h.plan), sid, Math.max(1, deadline - now()));", "    call(h, 'Runtime.runIfWaitingForDebugger', {}, sid, closeMs); const o = await call(h, 'Emulation.setGeolocationOverride', overrideOf(h.plan), sid, Math.max(1, deadline - now()));", 'geo RED early'), 'released-early');
ok(!(await legsOf(early, ['place'])).placeOrder, 'RED — released BEFORE its place: the order leg goes red (the tab\'s first script would run without the place)', null);
const noBound = MUT.load('src/server/browser-geo-hold.js', anchored(src, '    const deadline = now() + boundMs;', '    const deadline = now() + 600000;', 'geo RED no bound'), 'no-bound');
ok(!(await legsOf(noBound, ['bound'])).neverReleased, 'RED — no bound: a place never answered keeps the tab paused (not released inside the bound)', null);
const byState = MUT.load('src/server/browser-geo-hold.js', anchored(src, "    if (h.state === 'gone' || h.ws !== ws0 || ws0.readyState !== 1) return false;", "    if (h.state === 'gone' || h.state === 'lost') return false;", 'geo RED re-arm by state'), 're-arm-by-state');
ok(!(await legsOf(byState, ['place'])).rearmReleased, 'RED — a re-arm that judges «gone» by the hold\'s STATE (it reads «lost» until it holds): no tab it finds is released (a tab a dead hold left paused would hang)', null);
const midSaid = MUT.load('src/server/browser-geo-hold.js', anchored(src, "    if (h.state === 'gone' || h.ws !== ws0 || ws0.readyState !== 1) return false;", "    if (h.state === 'gone' || h.ws !== ws0) return false;", 'geo RED mid-job said'), 'mid-job-said');
ok(!(await legsOf(midSaid, ['midjob'])).midJobQuiet, 'RED — a socket that died mid-job read as a refusal: a FALSE «unplaced» is said', null);
const stale = MUT.load('src/server/browser-geo-hold.js', anchored(src, "      const url = typeof h.url === 'function' ? h.url() : h.url;", "      const url = typeof h.url === 'function' ? (h.url0 = h.url0 || h.url()) : h.url;", 'geo RED stale address'), 'stale-address');
ok(!(await legsOf(stale, ['moved'])).movedHeld, 'RED — the re-arm on the address it was ARMED with: the relaunched browser is never reached (down against the dead one)', null);
const reTerm = MUT.load('src/server/browser-geo-hold.js', anchored(src, 'const tArm = timer(() => { try { ws.terminate ? ws.terminate() : ws.close(); } catch { /* gone */ } done(', 'const tArm = timer(() => { done(', 'geo RED timer keeps its socket'), 'timer-keeps');
ok(!(await legsOf(reTerm, ['retimer'])).retimerEnds, 'RED — the arm\'s timer that leaves its socket open: on the re-arm path a second auto-attach stays beside the next try', null);
const downStuck = MUT.load('src/server/browser-geo-hold.js', anchored(src, "    if (h.state !== 'arming' && !h.rearming) lost(h, ws);", '    void ws;', 'geo RED rearm after down'), 'down-stuck');
ok(!(await legsOf(downStuck, ['downmoved'])).downMovedHeld, 'RED — rearmNow that only ends a socket: after «down» there is none to end, the relaunched browser is never held again', null);
const raceHeld = MUT.load('src/server/browser-geo-hold.js', anchored(src, '        if (h.ws !== ws || ws.readyState !== 1) return done(', '        if (false) return done(', 'geo RED race said held', { count: 2 }), 'race-held');   // (B): the check before the grants AND the one after them
ok(!(await legsOf(raceHeld, ['race'])).raceQuiet, 'RED — the open handler without its socket check: a FALSE «held» (the place «given again») over a dead socket', null);
const grantEarly = MUT.load('src/server/browser-geo-hold.js', anchored(anchored(src, '        for (const c of [...h.ctxs]) await grantCtx(h, c);\n', '', 'geo RED grants early (drop)'), "        if (!fine(a)) { clearTimeout(tArm);", "        for (const c of [...h.ctxs]) await grantCtx(h, c);\n        if (!fine(a)) { clearTimeout(tArm);", 'geo RED grants early (add)'), 'grants-early');
ok(!(await legsOf(grantEarly, ['sites'])).sitesOrder, 'RED — the grants before the open tabs hold the place: a listed site\'s running tab would read this machine\'s position in between', null);
const releaseEarly = MUT.load('src/server/browser-geo-hold.js', anchored(src, "    if (placed && h.state !== 'held') { h.release.add(sid); return placed; }\n", '', 'geo RED arm releases before grants'), 'release-early');
ok(!(await legsOf(releaseEarly, ['sites'])).sitesRearmRelease, 'RED — the arm releases each placed tab at its place: a paused tab of a listed site reads «denied» before its grant', null);
const releaseUnplaced = MUT.load('src/server/browser-geo-hold.js', anchored(src, '      if (h.plan.sites.length) {   // B-9584 (B, 主开发 r1791)', '      if (false) {   // B-9584 (B, 主开发 r1791)', 'geo RED unplaced released'), 'unplaced-released');
ok(!(await legsOf(releaseUnplaced, ['sites'])).sitesClosed, 'RED — an unplaced tab RELEASED with sites on the list: a listed site there reads this machine\'s position', null);
for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { label: 'geo hold REDs: ' })) ok(c.pass, c.name, c.detail);
report();
