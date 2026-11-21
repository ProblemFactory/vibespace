#!/usr/bin/env node
// B-46fc part 2 — A PAGE THAT LEAVES WITH ITS SOCKET NOT OPEN HANDS ITS LAYOUT SAVE TO THE HUB BY A ROUTE (POST /api/layout-sync), and
// the hub has ONE «apply a layout save» for both roads (src/server/layout-sync-door.js → ws-handler's applyLayoutSync). In-process: the
// REAL ws handler over a stand-in store (test-desktop-record's hub shape), the door driven as the route drives it.
//  ① the same frame by the socket and by the door: the same record written, the same answer
//  ② ORDER: a page's late save from an older base, after ANOTHER writer stored a newer record, changes nothing (refused stale: the record
//     kept, nothing written, nothing broadcast)
//  ③ THE WRITER TOKEN: the page's own earlier socket write (its ack unread) is its own — its handed-off save from the older base is
//     written; CONTROL the same frame without the token is refused stale
//  ④ bounds: no door yet ⇒ 503; not a layout-sync frame ⇒ 400; past 256 KB ⇒ refused by name
//  ⑤ wiring: the socket's case and the route call the one function; the route is guarded like every desktops door and reads its own
//     body (the 256 KB bound BEFORE the parse); the page hands its queued frames off after the leave flush, its socket's frames carry
//     the writer token, the route's answers are heard by the socket's own handlers; kb-api names the route
//  ⑥ THE HAND-OFF DRIVEN (src/lib/layout-handoff.js, a stand-in queue and a stand-in post — its round wgk4tnn0w's MUST): the newest
//     frame of a desktop, other frames kept, a desktop change queued ahead holds its frame back, ONCE when hidden and pagehide both fire,
//     the budget with what is in flight, the answers HEARD, and a hand-off that fails is OWED again (back in the queue unless a newer
//     frame is there, straight onto a socket that opened); RED a copy with the release-of-the-unit's swallow (the frame lost)
// Fixtures are invented. Run: node scripts/test-layout-sync-route.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name must be a string'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } return !!c; };
const J = JSON.stringify;
const DOOR = require(path.join(REPO, 'src/server/layout-sync-door.js'));
const WSH = require(path.join(REPO, 'src/ws-handler.js'));
const GB = (l, t) => ({ left: l, top: t, width: 0.45, height: 0.45 });
const R = (id, o = {}) => ({ winId: id, title: id, type: 'files', isMinimized: false, isMaximized: false, gridBounds: GB(0, 0), zIndex: 10, openSpec: { action: 'openFileExplorer', path: '/x/' + id }, explorerPath: '/x/' + id, ...o });
const SEED = () => ({ desktopMeta: [{ id: 'desk-a', name: 'Alpha' }], desktops: { 'desk-a': { autoSave: { windows: [R('a-1', { gridBounds: GB(0.1, 0.1) }), R('a-2', { gridBounds: GB(0.5, 0.1) })], updatedAt: 1000 } } } });
const tick = () => new Promise((r) => setTimeout(r, 5)); // two stamps a ms apart
function hub(seed, WSHX = WSH) {
  let layouts = JSON.parse(J(seed)), writes = 0;
  const ctx = new Proxy({ telemetry: { record: () => { } }, activeSessionsPayload: () => [], serverNotice: () => { }, activeSessions: new Map(), WS_OPEN: 1, readLayouts: () => JSON.parse(J(layouts)), writeLayouts: (d) => { writes++; layouts = JSON.parse(J(d)); } }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
  const on = {}, wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
  const quiet = (fn) => { const o = console.warn, l = console.log; console.warn = () => { }; console.log = () => { }; try { return fn(); } finally { console.warn = o; console.log = l; } };
  quiet(() => WSHX.registerWsHandler(wss, ctx));
  const connect = () => {
    const h = {}, frames = [];
    const sock = { readyState: 1, send: (s) => frames.push(JSON.parse(s)), on: (ev, fn) => { h[ev] = fn; } };
    wss.clients.add(sock); quiet(() => on.connection(sock));
    return { frames, send: async (m) => { const o = console.warn, l = console.log; console.warn = () => { }; console.log = () => { }; try { await h.message(J(m)); } finally { console.warn = o; console.log = l; } } };
  };
  const route = (frame) => { const o = console.warn, l = console.log; console.warn = () => { }; console.log = () => { }; try { return DOOR.apply(JSON.parse(J(frame))); } finally { console.warn = o; console.log = l; } };
  return { connect, route, layouts: () => layouts, writes: () => writes };
}
const frame = (windows, o = {}) => ({ type: 'layout-sync', desktopId: 'desk-a', state: { windows }, evidence: [], sentAt: o.sentAt || 7, viewport: 'desktop', base: o.base, ...(o.writer ? { writer: o.writer } : {}) });
const recOf = (H) => { const r = JSON.parse(J(H.layouts().desktops['desk-a'].autoSave)); delete r.updatedAt; return r; };
const ids = (H) => (H.layouts().desktops['desk-a'].autoSave.windows || []).map((w) => w.winId).join();
const kinds = (list) => list.map((f) => f.type + (f.reason ? ':' + f.reason : '')).join();

console.log('④ bounds');
{
  const before = DOOR.apply(frame([R('x')]));
  ok(before.status === 503 && /not ready/.test(before.error), 'no door yet (no ws handler registered) ⇒ 503, said', before);
}
const W3 = () => [R('a-1', { gridBounds: GB(0.1, 0.1) }), R('a-2', { gridBounds: GB(0.5, 0.1) }), R('a-3', { gridBounds: GB(0.1, 0.5) })];
console.log('① ONE «apply a layout save»: the socket and the route');
{
  const HS = hub(SEED()), HR = hub(SEED()), page = HS.connect();
  await page.send(frame(W3(), { base: 1000, writer: 'wpage00001' }));
  const viaRoute = HR.route(frame(W3(), { base: 1000, writer: 'wpage00001' }));
  ok(J(recOf(HS)) === J(recOf(HR)) && ids(HR) === 'a-1,a-2,a-3' && HS.writes() === 1 && HR.writes() === 1, 'the same frame by the socket and by the route writes the SAME record (a-3 added), once each', { socket: ids(HS), route: ids(HR) });
  ok(kinds(page.frames.filter((f) => /^layout-sync-/.test(f.type))) === 'layout-sync-ack' && kinds(viaRoute.answers) === 'layout-sync-ack' && viaRoute.status === 200, 'the same answer: the socket heard its ack, the route answers it (the frames the socket would have heard)', { socket: kinds(page.frames), route: kinds(viaRoute.answers) });
}
console.log('④ bounds (the door ready)');
{
  const H = hub(SEED());
  const notOne = DOOR.apply({ type: 'state-set' });
  ok(notOne.status === 400 && H.writes() === 0, 'not a layout-sync frame ⇒ 400, nothing written', notOne);
  ok(DOOR.sizeVerdict(300 * 1024) && /300 KB is over the 256 KB/.test(DOOR.sizeVerdict(300 * 1024)) && DOOR.sizeVerdict(1000) === null, 'past 256 KB a body is refused by name (the route answers 413); a small one passes', DOOR.sizeVerdict(300 * 1024));
}
console.log('② ORDER: a late save never overwrites a newer record another device stored');
{
  const H = hub(SEED()), page = H.connect(), desk = H.connect();
  await page.send(frame(W3(), { base: 1000, writer: 'wpage00002' }));
  const t1 = page.frames.find((f) => f.type === 'layout-sync-ack').updatedAt;
  await tick();
  const fromDesk = [R('a-1', { gridBounds: GB(0.2, 0.2) }), R('a-2', { gridBounds: GB(0.5, 0.1) }), R('a-3', { gridBounds: GB(0.1, 0.5) }), R('d-1', { gridBounds: GB(0.6, 0.6) })];
  await desk.send(frame(fromDesk, { base: t1, writer: 'wdesk00002' }));
  const kept = J(recOf(H)), writesBefore = H.writes(), heard = desk.frames.length;
  const late = H.route(frame([R('a-1', { gridBounds: GB(0.9, 0.9) }), R('a-2', { gridBounds: GB(0.5, 0.1) }), R('a-3', { gridBounds: GB(0.1, 0.5) })], { base: t1, writer: 'wpage00002' }));
  ok(kinds(late.answers) === 'layout-sync-refused:stale' && J(recOf(H)) === kept && H.writes() === writesBefore && desk.frames.length === heard && ids(H) === 'a-1,a-2,a-3,d-1',
    'the page\'s handed-off save from base t1, after the desk stored a newer record: REFUSED stale — the desk\'s record kept (d-1 stays), nothing written, nothing broadcast', { answers: kinds(late.answers), ids: ids(H) });
  // CONTROL (its round): the same scene through a handler whose staleness gate always passes — the late save LANDS over the desk's record
  const WSH_PATH = require.resolve(path.join(REPO, 'src/ws-handler.js')), DR = require(path.join(REPO, 'src/lib/desktop-record.js')), realStale = DR.staleVerdict;
  delete require.cache[WSH_PATH]; DR.staleVerdict = () => ({ ok: true, judged: false });
  let WSHOff = null; try { WSHOff = require(WSH_PATH); } finally { DR.staleVerdict = realStale; delete require.cache[WSH_PATH]; require(WSH_PATH); }
  {
    const H = hub(SEED(), WSHOff), page = H.connect(), desk = H.connect();
    await page.send(frame(W3(), { base: 1000, writer: 'wpage00012' }));
    const t1 = page.frames.find((f) => f.type === 'layout-sync-ack').updatedAt;
    await tick();
    await desk.send(frame([R('a-1', { gridBounds: GB(0.2, 0.2) }), R('a-2', { gridBounds: GB(0.5, 0.1) }), R('a-3', { gridBounds: GB(0.1, 0.5) }), R('d-1', { gridBounds: GB(0.6, 0.6) })], { base: t1, writer: 'wdesk00012' }));
    const late = H.route(frame([R('a-1', { gridBounds: GB(0.9, 0.9) }), R('a-2', { gridBounds: GB(0.5, 0.1) }), R('a-3', { gridBounds: GB(0.1, 0.5) }), R('d-1', { gridBounds: GB(0.6, 0.6) })], { base: t1, writer: 'wpage00012' }));
    ok(kinds(late.answers) === 'layout-sync-ack' && H.layouts().desktops['desk-a'].autoSave.windows[0].gridBounds.left === 0.9, 'CONTROL the staleness gate off ⇒ the late save LANDS over the desk\'s newer record (the leg above can fail)', { answers: kinds(late.answers) });
  }
  // the hub ready again for the legs below (the copy's registration pointed the door at itself)
  hub(SEED());
}
console.log('③ THE WRITER TOKEN: the page\'s own unacked write is its own');
{
  const own = async (withToken) => {
    const H = hub(SEED()), page = H.connect();
    await page.send(frame(W3(), { base: 1000, writer: 'wpage00003' })); // written (t1); the page never reads its ack: its base stays 1000
    await tick();
    const later = [R('a-1', { gridBounds: GB(0.1, 0.1) }), R('a-2', { gridBounds: GB(0.5, 0.1) }), R('a-3', { gridBounds: GB(0.1, 0.5) }), R('a-4', { gridBounds: GB(0.6, 0.5) })];
    const r = H.route(frame(later, { base: 1000, ...(withToken ? { writer: 'wpage00003' } : {}) }));
    return { answers: kinds(r.answers), ids: ids(H) };
  };
  const mine = await own(true), stranger = await own(false);
  ok(mine.answers === 'layout-sync-ack' && mine.ids === 'a-1,a-2,a-3,a-4' && stranger.answers === 'layout-sync-refused:stale' && stranger.ids === 'a-1,a-2,a-3',
    'the page\'s handed-off save naming its writer token is judged as its OWN (its socket\'s unacked write is no stranger\'s): written; CONTROL the same frame without the token is refused stale', { mine, stranger });
}
console.log('⑤ wiring');
{
  const ws = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), per = fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8');
  const lay = fs.readFileSync(path.join(REPO, 'src/lib/layout.js'), 'utf8'), sock = fs.readFileSync(path.join(REPO, 'src/lib/ws.js'), 'utf8'), api = fs.readFileSync(path.join(REPO, 'docs/kb-api.md'), 'utf8');
  ok(/case 'layout-sync': \{ applyLayoutSync\(ws, data\); break; \}/.test(ws) && /require\('\.\/server\/layout-sync-door\.js'\)\.set\(applyLayoutSync\)/.test(ws) && (ws.match(/function applyLayoutSync\(/g) || []).length === 1,
    'ws-handler: the socket\'s case calls the ONE applyLayoutSync, and hands it to the door');
  const bodyAt = per.indexOf("router.use('/api/layout-sync', layoutSyncBody);"), routeAt = per.indexOf("router.post('/api/layout-sync', (req, res) => {");
  ok(bodyAt > 0 && routeAt > bodyAt && /express\.json\(\{ limit: require\('\.\.\/server\/layout-sync-door\.js'\)\.MAX_BYTES \}\)/.test(per) && /router\.ownsBody = \(p\) => layer\.regexp\.test\(p\) \|\| layoutSyncLayer\.regexp\.test\(p\);/.test(per) && /router\.post\('\/api\/layout-sync', \(req, res\) => \{[\s\S]{0,200}door\.apply\(req\.body\)/.test(per) && /layouts-autosave\|layout-sync\|custom-grids/.test(per),
    'the route reads its OWN body (server.js\'s 50 MB parser skips it: ownsBody) — 256 KB refused by name BEFORE the parse; through the door; guarded like every desktops door');
  ok(/addEventListener\?\.\('pagehide', \(\) => this\._flushOnLeave\('pagehide'\)\);[\s\S]{0,600}addEventListener\?\.\('pagehide', \(\) => this\._handOffQueued\('pagehide'\)\);/.test(lay) && /const runs = handOff\(this\.app\.ws, \{\s*post: \(text\) => fetch\('\/api\/layout-sync', \{ method: 'POST', keepalive: true/.test(lay) && /inFlight: this\._handOffInFlight \|\| \(this\._handOffInFlight = new Set\(\)\)/.test(lay),
    'the page: its queued layout frames go through the ONE hand-off (src/lib/layout-handoff.js) AFTER the leave flush — by keepalive, one in-flight set across calls');
  ok(/this\.heard\(d\);/.test(sock) && /heard\(d\) \{[\s\S]{0,600}\[\.\.\.this\.globalHandlers\]\.forEach\(call\);/.test(sock), 'the socket\'s own frames and the route\'s answers reach the page\'s handlers through ONE door (ws.js heard)');
  ok(/if \(d && d\.type === 'layout-sync' && !d\.writer\) d = \{ \.\.\.d, writer: this\.layoutWriter \}/.test(sock) && /POST \/api\/layout-sync/.test(api), 'every layout-sync frame carries this page\'s writer token; kb-api names the route');
}
console.log('⑥ THE HAND-OFF, driven (a stand-in queue and post)');
{
  const HO = require(path.join(REPO, 'src/lib/layout-handoff.js'));
  const LS = (desk, v, extra = '') => J({ type: 'layout-sync', desktopId: desk, state: { windows: [{ winId: desk + '-' + v, pad: extra }] }, base: 1, writer: 'wpage00006' });
  const OTHER = J({ type: 'state-set', key: 'k' }), MAKE = J({ type: 'desktop-create', desktopId: 'desk-n' });
  const sockOf = (pending, readyState = 3) => { const s = { pending: [...pending], heardFrames: [], sent: [], ws: { readyState, send: (t) => s.sent.push(t) }, heard: (d) => s.heardFrames.push(d) }; return s; };
  const answer = (answers) => ({ ok: true, status: 200, json: async () => ({ ok: true, answers }) });
  // (a) the newest frame of each desktop leaves; another frame stays; the older frame of a desktop whose newest leaves is superseded
  {
    const sock = sockOf([LS('desk-a', 1), OTHER, LS('desk-a', 2), LS('desk-b', 1)]), posted = [];
    const runs = HO.handOff(sock, { post: async (t) => { posted.push(JSON.parse(t).state.windows[0].winId); return answer([{ type: 'layout-sync-ack', desktopId: JSON.parse(t).desktopId }]); } });
    await Promise.all(runs);
    ok(J(posted) === J(['desk-a-2', 'desk-b-1']) && J(sock.pending) === J([OTHER]) && sock.heardFrames.map((d) => d.type + ':' + d.desktopId).join() === 'layout-sync-ack:desk-a,layout-sync-ack:desk-b',
      '(a) the newest frame of each desktop leaves (desk-a v2, desk-b), the other frame stays queued, desk-a v1 superseded; the hub\'s acks HEARD by the page\'s handlers', { posted, pending: sock.pending.length, heard: sock.heardFrames });
  }
  // (b) a desktop change queued AHEAD of its desktop's frame: the frame waits for the socket, in order
  {
    const sock = sockOf([MAKE, LS('desk-n', 1)]), posted = [], said = [];
    HO.handOff(sock, { post: async (t) => { posted.push(t); return answer([]); }, warn: (m) => said.push(m) });
    ok(!posted.length && J(sock.pending) === J([MAKE, LS('desk-n', 1)]) && said.some((m) => /a desktop change is queued ahead of it/.test(m)), '(b) a desktop change queued ahead: its desktop\'s frame waits for the socket, the queue kept in order, said', { posted: posted.length, said });
  }
  // (c) ONCE when hidden and pagehide both fire (the first post still in flight); (d) the budget counts what is in flight
  {
    const sock = sockOf([LS('desk-a', 1, 'x'.repeat(40 * 1024))]), inFlight = new Set(), posted = [], said = [];
    let release = null; const gate = new Promise((r) => { release = r; });
    const post = async (t) => { posted.push(t); await gate; return answer([]); };
    const first = HO.handOff(sock, { post, inFlight }), second = HO.handOff(sock, { post, inFlight });
    sock.pending.push(LS('desk-b', 1, 'y'.repeat(30 * 1024)));
    const third = HO.handOff(sock, { post, inFlight, warn: (m) => said.push(m) });
    release(); await Promise.all([...first, ...second, ...third]);
    ok(posted.length === 1 && first.length === 1 && second.length === 0 && third.length === 0 && sock.pending.length === 1 && said.some((m) => /* stale-pins: kept — the driver's own words, read from its warn */ /over the hand-off budget/.test(m)), '(c) hidden then pagehide while the first post is in flight: the frame goes ONCE; (d) a 30 KB frame WAITS while 40 KB are still in flight (the 60 KB budget counts them), said', { posted: posted.length, first: first.length, second: second.length, third: third.length, said });
  }
  // (e) THE MUST: a hand-off that FAILS is owed again — back at the queue's head; not when a newer frame of its desktop is queued; onto
  // a socket that opened meanwhile; a refused request (503) too
  {
    const sock = sockOf([LS('desk-a', 1)]);
    await Promise.all(HO.handOff(sock, { post: async () => { throw new TypeError('Failed to fetch'); } }));
    ok(J(sock.pending) === J([LS('desk-a', 1)]), '(e) the post REJECTED (offline): the frame is back in the queue — the socket carries it at the reconnect, as at the release', sock.pending.length);
    const sock2 = sockOf([LS('desk-a', 1)]);
    const r2 = HO.handOff(sock2, { post: async () => { sock2.pending.push(LS('desk-a', 2)); throw new TypeError('Failed to fetch'); } });
    await Promise.all(r2);
    ok(J(sock2.pending) === J([LS('desk-a', 2)]), '(e) …not when a NEWER frame of its desktop was queued meanwhile (it carries the act)', sock2.pending.length);
    const sock3 = sockOf([LS('desk-a', 1)]);
    await Promise.all(HO.handOff(sock3, { post: async () => { sock3.ws.readyState = 1; return { ok: false, status: 503, json: async () => ({}) }; } }));
    ok(J(sock3.sent) === J([LS('desk-a', 1)]) && !sock3.pending.length, '(e) a refused request (503) while the socket OPENED meanwhile: the frame goes straight onto the socket', { sent: sock3.sent.length, pending: sock3.pending.length });
  }
  // RED: the unit's first cut (the frame left the queue before the post had an outcome, a rejection swallowed)
  {
    const SRC = fs.readFileSync(path.join(REPO, 'src/lib/layout-handoff.js'), 'utf8');
    const SW = mutantCopies('layout-handoff-swallow', REPO).load('src/lib/layout-handoff.js', anchored(SRC, '      else sock.pending = requeue(sock.pending, text);\n', /* stale-pins: kept — the control's PLANT (the swallow), not a pin */ '      else void 0;\n', 'the swallow'), 'swallow');
    const sock = sockOf([LS('desk-a', 1)]);
    await Promise.all(SW.handOff(sock, { post: async () => { throw new TypeError('Failed to fetch'); } }));
    ok(sock.pending.length === 0, 'CONTROL the first cut\'s swallow: the failed frame is GONE from the queue (the must\'s harm) — the leg above can fail', sock.pending.length);
  }
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
