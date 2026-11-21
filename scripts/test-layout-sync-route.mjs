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
//  ⑤ wiring: the socket's case and the route call the one function; the route is guarded like every desktops door; the page hands
//     its queued frames off after the leave flush, its socket's frames carry the writer token; kb-api names the route
// Fixtures are invented. Run: node scripts/test-layout-sync-route.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
function hub(seed) {
  let layouts = JSON.parse(J(seed)), writes = 0;
  const ctx = new Proxy({ telemetry: { record: () => { } }, activeSessionsPayload: () => [], serverNotice: () => { }, activeSessions: new Map(), WS_OPEN: 1, readLayouts: () => JSON.parse(J(layouts)), writeLayouts: (d) => { writes++; layouts = JSON.parse(J(d)); } }, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined) });
  const on = {}, wss = { _heartbeatTimer: true, clients: new Set(), on: (ev, fn) => { on[ev] = fn; } };
  const quiet = (fn) => { const o = console.warn, l = console.log; console.warn = () => { }; console.log = () => { }; try { return fn(); } finally { console.warn = o; console.log = l; } };
  quiet(() => WSH.registerWsHandler(wss, ctx));
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
  ok(/router\.post\('\/api\/layout-sync', \(req, res\) => \{[\s\S]{0,400}door\.sizeVerdict\([\s\S]{0,200}status\(413\)[\s\S]{0,120}door\.apply\(req\.body\)/.test(per) && /layouts-autosave\|layout-sync\|custom-grids/.test(per),
    'the route: bounded (413 by name), through the door, and guarded like every desktops door (a held store answers by name)');
  ok(/addEventListener\?\.\('pagehide', \(\) => this\._flushOnLeave\('pagehide'\)\);[\s\S]{0,600}addEventListener\?\.\('pagehide', \(\) => this\._handOffQueued\('pagehide'\)\);/.test(lay) && /fetch\('\/api\/layout-sync', \{ method: 'POST', keepalive: true/.test(lay) && /ws\.pending = \[\.\.\.keep, \.\.\.left\]/.test(lay),
    'the page: its queued layout frames leave by keepalive AFTER the leave flush, and leave the queue (never sent twice)');
  ok(/if \(d && d\.type === 'layout-sync' && !d\.writer\) d = \{ \.\.\.d, writer: this\.layoutWriter \}/.test(sock) && /POST \/api\/layout-sync/.test(api), 'every layout-sync frame carries this page\'s writer token; kb-api names the route');
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
