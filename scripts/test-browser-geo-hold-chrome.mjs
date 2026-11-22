#!/usr/bin/env node
// test-browser-geo-hold-chrome — B-9584 U2c: A PROFILE'S PLACE ON THE STOCK BROWSER, FAIL CLOSED AT THE BROWSER (heavy). This machine's
// Chrome on scratch profiles under this run's own stamped root, ONE loopback page, every other request to a DEAD proxy (zero vendor
// calls; a location provider can only fail — «this machine's answer» reads as an error here, the real position on a machine with a
// working provider). Each profile starts with its OWN stored denial written exactly as the keeper writes it (the default and every
// stored geolocation row «block») over a site the person ALLOWED BEFORE. The REAL hold (src/server/browser-geo-hold.js) adds the place
// on top; a WebSocket wrapper lets a leg hold, refuse or delay the place it sends. Where a leg must READ the place, the suite's own
// client grants the origin — the stand-in for the permission the place's road will give (today nothing gives it).
//   ① A PLACE: three new tabs, each FIRST read is the place. RED: released before its place, the place 2.5 s late.
//   ② THE TAB OPEN AT THE ARM reads the place.
//   ③ «BLOCKED» = the stored denial alone (no hold): the site allowed before reads «denied». RED: no stored denial ⇒ it keeps «granted».
//   ④ REFUSED / ⑤ NEVER ANSWERED: the tab released UNPLACED inside the bound, said, and it reads «denied» — never this machine's.
//   ⑥ THE HOLD DIES: (a) a paused tab stays paused; (b) the next arm places and releases it; (c) a tab opened while it is down reads
//      «denied»; (d) TODAY (no site allowed the place) a RUNNING placed tab reads «denied» before and after the hold's own socket dies.
//   ⑦ ANOTHER CLIENT VISITS a held tab and leaves: the tab's next read is still the place.
// Without a Chrome on PATH it SKIPS BY NAME (its closing line «SKIP: …», never a green).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, freePort, CHROME_QUIET, CHROME_STORE, endRootedProcesses, anchored, ONBOARDED_SOURCE } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = require('ws');
const ATL = require('../src/server/browser-attach-launch.js');
const GH = require('../src/server/browser-geo-hold.js');
const ENVm = require('../src/browser-environment.js');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const PLACE = Object.freeze({ kind: 'place', latitude: 35.6762, longitude: 139.6503, accuracy: 50 });   // a stand-in place (no person's)
const SPACING_MS = 3000, READ_MS = 1000;   // a tab a time, each in the foreground; a first read waits at most READ_MS for its answer
const quiet = { log() { }, warn() { }, error() { } };

const ROOT = scratch('geohold');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')
  && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'TMPDIR', 'XDG_RUNTIME_DIR'].includes(k)));
const CHROME = ATL.chromeExecutable(BASE_ENV);
if (!CHROME) { console.log('\nSKIP: no Chrome on PATH (the keeper\'s own lookup, src/server/browser-attach-launch.js chromeExecutable) — no leg ran on this machine'); process.exit(0); }
process.on('exit', () => { try { endRootedProcesses(ROOT); } catch { /* best effort at exit */ } });
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => process.exit(130));

// ── the loopback page and the dead proxy ──
const reports = [];
const page = (body) => `<!doctype html><meta charset="utf-8"><title>g</title><script>${body}</script>`;
const say = "const say=(o)=>fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});";
const READ = `const read=(k,i)=>{navigator.permissions.query({name:'geolocation'}).then((ps)=>{const t0=performance.now();navigator.geolocation.getCurrentPosition((p)=>say({k,i,perm:ps.state,lat:p.coords.latitude,lng:p.coords.longitude,ms:Math.round(performance.now()-t0)}),(e)=>say({k,i,perm:ps.state,err:e.code,ms:Math.round(performance.now()-t0)}),{timeout:${READ_MS},maximumAge:0});});};`;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const k = JSON.stringify(String(u.searchParams.get('k') || '').replace(/[^\w-]/g, '')), i = JSON.stringify(String(u.searchParams.get('i') || '0').replace(/\D/g, ''));
  if (req.method === 'POST' && u.pathname === '/report') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { reports.push({ at: Date.now(), ...JSON.parse(b) }); } catch { /* not ours */ } res.end('ok'); }); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (u.pathname === '/geo') return res.end(page(`${say}${READ}read(${k},${i});window.again=(n)=>read(${k},String(n));`));
  if (u.pathname === '/opener') { const n = Math.min(6, Number(u.searchParams.get('n')) || 1), first = Math.min(5000, Number(u.searchParams.get('first')) || 0); return res.end(page(`let i=0;const next=()=>{if(i>=${n})return;window.open('/geo?k='+encodeURIComponent(${k})+'&i='+(i++),'_blank');setTimeout(next,${SPACING_MS});};setTimeout(next,${first});`)); }
  res.statusCode = 404; res.end('');
});
const PORT = await freePort(), DEAD = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROXY = `--proxy-server=http://127.0.0.1:${DEAD}`;
const reportsOf = async (pred, n, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms && reports.filter(pred).length < n) await sleep(50); return reports.filter(pred); };
const isPlace = (x) => x && x.lat !== undefined && Math.abs(Number(x.lat) - PLACE.latitude) < 1e-6 && Math.abs(Number(x.lng) - PLACE.longitude) < 1e-6;
console.log(`chrome: ${CHROME} · root ${ROOT} · page ${ORIGIN} · dead proxy :${DEAD}`);

// ── a raw CDP client, Chrome on a scratch profile ──
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url, { perMessageDeflate: false });
    let id = 0; const wait = new Map();
    ws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); if (m.error) w.rej(new Error(m.error.message)); else w.res(m.result); } });
    ws.on('open', () => resolve({ send: (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(J({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }), close: () => { try { ws.close(); } catch { /* gone */ } } }));
    ws.on('error', reject);
  });
}
let nChrome = 0;
/** A Chrome on a scratch profile. `stored` = the profile's OWN stored denial written before its launch exactly as the keeper writes it
 *  (src/browser-environment.js geoStoredDenial) over a site the person ALLOWED BEFORE (a stored row); `grant` = the suite's own client
 *  grants the page's origin — the stand-in for the permission the place's road will give (today nothing gives it). */
async function chrome({ stored = true, grant = true } = {}) {
  const tag = `c${++nChrome}`, udd = path.join(ROOT, tag), home = path.join(ROOT, `${tag}-home`);
  fs.mkdirSync(path.join(udd, 'Default'), { recursive: true, mode: 0o700 }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const before = { profile: { content_settings: { exceptions: { geolocation: { [`${ORIGIN},*`]: { last_modified: '13377777777000000', setting: 1 } } } } } };
  fs.writeFileSync(path.join(udd, 'Default', 'Preferences'), J(stored ? ENVm.geoStoredDenial(before).prefs : before));
  const child = spawn(CHROME, ['--headless=new', `--user-data-dir=${udd}`, '--remote-debugging-port=0', '--disable-popup-blocking', '--no-first-run', ...CHROME_QUIET, ...CHROME_STORE, PROXY, 'about:blank'], { env: { ...BASE_ENV, HOME: home, TMPDIR: home }, stdio: 'ignore' });
  const pf = path.join(udd, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !ATL.readPortFile(pf).text; i++) await sleep(50);
  const txt = ATL.readPortFile(pf).text;
  if (!txt) { try { child.kill('SIGKILL'); } catch { /* gone */ } throw new Error(`${tag}: Chrome wrote no DevToolsActivePort in 15 s`); }
  const [port, p] = txt.trim().split('\n');
  const url = `ws://127.0.0.1:${port}${p}`;
  const cdp = await connect(url);
  if (grant) await cdp.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted', origin: ORIGIN });
  return { tag, child, url, cdp };
}
async function stop(c) {
  try { await Promise.race([c.cdp.send('Browser.close'), sleep(3000)]); } catch { /* closing */ }
  c.cdp.close();
  for (let i = 0; i < 100 && c.child.exitCode === null && c.child.signalCode === null; i++) await sleep(50);
  if (c.child.exitCode === null && c.child.signalCode === null) { try { c.child.kill('SIGKILL'); } catch { /* gone */ } }
}
/** The hold's socket, wrapped: `ctl.place` = 'pass' | 'refuse' | 'swallow' | 'delay:<ms>' for the place it sends; `ctl.sockets` its sockets. */
function wrapped(ctl) {
  return class extends WS.WebSocket {
    constructor(...a) {
      super(...a); ctl.sockets.push(this);
      this.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (m && m.method === 'Target.attachedToTarget' && m.params && m.params.targetInfo) ctl.attached.push({ tid: m.params.targetInfo.targetId, opener: m.params.targetInfo.openerId || null, sid: m.params.sessionId, waiting: !!m.params.waitingForDebugger }); });   // the hold's own attach events (r1707 (8): waited on, never a sleep)
    }
    send(data, ...rest) {
      let m = null; try { m = JSON.parse(String(data)); } catch { m = null; }
      if (m && m.method === 'Emulation.setGeolocationOverride' && m.sessionId) ctl.asked.add(m.sessionId);
      if (m && m.method === 'Runtime.runIfWaitingForDebugger' && m.sessionId) ctl.released.add(m.sessionId);
      if (m && m.method === 'Emulation.setGeolocationOverride' && ctl.place !== 'pass') {
        if (ctl.place === 'refuse') { setImmediate(() => this.emit('message', Buffer.from(J({ id: m.id, error: { code: -32000, message: 'refused (a stand-in)' } })), false)); return; }
        if (ctl.place === 'swallow') return;
        const d = /^delay:(\d+)$/.exec(ctl.place); if (d) { setTimeout(() => { try { super.send(data, ...rest); } catch { /* gone */ } }, Number(d[1])); return; }
      }
      return super.send(data, ...rest);
    }
  };
}
async function holdOn(c, plan, { G = GH, boundMs = 1500, rearmMs = [60000] } = {}) {
  const ctl = { place: 'pass', sockets: [], attached: [], asked: new Set(), released: new Set() }, evs = [];
  const h = G.create({ WebSocketImpl: wrapped(ctl), log: quiet, boundMs, closeMs: 1500, armMs: 8000, rearmMs, onEvent: (e) => evs.push(e) });
  const r = await h.arm(`bp-${c.tag}`, { url: c.url, plan });
  return { h, ctl, evs, armed: r };
}
const openTabs = async (c, k, n, first = 0) => c.cdp.send('Target.createTarget', { url: `${ORIGIN}/opener?k=${k}&n=${n}&first=${first}` });
/** The opener gets its place as any tab; the leg's mode is set only after it (the tab under test is the one it opens). */
/** A wait whose test IS its read (a value, or null when the bound runs out). */
const untilV = async (fn, ms) => { const t0 = Date.now(); let v = fn(); while (!v && Date.now() - t0 < ms) { await sleep(25); v = fn(); } return v || null; };
/** The opener gets its place as any tab; the leg's mode is set only once the hold has RELEASED the opener (its own attach event, never a
 *  sleep — r1707 (8)); the tab under test is the one it opens. → the opener's target id. */
const openThenMode = async (c, ctl, k, mode) => {
  const t = await openTabs(c, k, 1, 1500);
  const seen = await untilV(() => { const a = ctl.attached.find((x) => x.tid === t.targetId); return a && ctl.released.has(a.sid) ? a : null; }, 8000);
  ctl.place = mode;
  return seen ? t.targetId : null;
};
/** The tab an opener opened, once the hold has asked its place (it waits in its pause): its own attach event, never a sleep. */
const childAsked = (ctl, openerId, ms = 8000) => untilV(() => (openerId ? ctl.attached.find((x) => x.opener === openerId && ctl.asked.has(x.sid)) : null) || null, ms);
const pageTargets = async (c) => ((await c.cdp.send('Target.getTargets')).targetInfos || []).filter((t) => t.type === 'page');
const F = {};
const MUT = mutantCopies('geo-hold-chrome-reds', REPO);
const holdSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-geo-hold.js'), 'utf8');

// ① a place, three tabs; ② the tab open at the arm
{
  const c = await chrome();
  const { h, armed } = await holdOn(c, PLACE);
  const first = (await pageTargets(c))[0];
  const ses = await c.cdp.send('Target.attachToTarget', { targetId: first.targetId, flatten: true });
  await c.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }, ses.sessionId);   // the tree's rule for a chrome suite's every navigate (this page is no VibeSpace page: harmless)
  await c.cdp.send('Page.navigate', { url: `${ORIGIN}/geo?k=arm&i=0` }, ses.sessionId);
  const [ra] = await reportsOf((x) => x.k === 'arm', 1, 6000);
  await openTabs(c, 'place', 3);
  const got = await reportsOf((x) => x.k === 'place', 3, 3 * SPACING_MS + 6000);
  F.place = { armed: armed.ok, armTab: ra || null, tabs: got.map((x) => (isPlace(x) ? `the place in ${x.ms} ms` : `NOT the place: ${J(x)}`)) };
  ok(armed.ok && isPlace(ra), '② the tab open at the arm (the start\'s blank), navigated after it: its first read is the place', F.place);
  ok(got.length === 3 && got.every(isPlace), `① a PLACE: three new tabs (the origin holds the permission), each FIRST read is the place — ${J(F.place.tabs)}`, F.place);
  h.dispose(); await stop(c);
}
// ① RED: released before its place, the place 2.5 s late
{
  const early = MUT.load('src/server/browser-geo-hold.js', anchored(holdSrc, "    const o = await call(h, 'Emulation.setGeolocationOverride', overrideOf(h.plan), sid, Math.max(1, deadline - now()));", "    call(h, 'Runtime.runIfWaitingForDebugger', {}, sid, closeMs); const o = await call(h, 'Emulation.setGeolocationOverride', overrideOf(h.plan), sid, Math.max(1, deadline - now()));", 'geo chrome RED early'), 'released-early');
  const c = await chrome();
  const { h, ctl } = await holdOn(c, PLACE, { G: early, boundMs: 6000 });
  await openThenMode(c, ctl, 'early', 'delay:2500');
  const got = await reportsOf((x) => x.k === 'early', 1, SPACING_MS + 6000);
  ok(got.length === 1 && !isPlace(got[0]), `① RED — a tab released before its place (sent 2.5 s late): its first read is NOT the place (${J(got[0] || null)}) — the leg above can see a miss`, got);
  h.dispose(); await stop(c);
}
// ③ «BLOCKED» = the profile's OWN stored denial alone, no hold: a site the person allowed before reads «denied» (RED: no stored denial)
for (const [stored, label] of [[true, '③ «BLOCKED» is the profile\'s own stored denial ALONE (no hold, nothing of ours alive)'], [false, '③ RED — the profile WITHOUT the stored denial']]) {
  const c = await chrome({ stored, grant: false });
  const k = `blocked-${stored ? 'stored' : 'red'}`;
  await openTabs(c, k, 1);
  const got = await reportsOf((x) => x.k === k, 1, SPACING_MS + 6000);
  if (stored) F.blocked = got[0] || null;
  ok(got.length === 1 && (stored ? got[0].err === 1 && got[0].perm === 'denied' : got[0].perm === 'granted' && got[0].lat === undefined),
    stored ? `${label}: a site the person ALLOWED BEFORE reads «denied» (error ${got[0] ? got[0].err : '—'}, permission ${got[0] ? got[0].perm : '—'})` : `${label}: the site allowed before keeps «granted» and asks this machine (${J(got[0] || null)}) — the leg above can see the difference`, got);
  await stop(c);
}
// ④ the place REFUSED; ⑤ NEVER ANSWERED — the tab released UNPLACED inside the bound and said; it reads «denied» (the stored setting), never this machine's
for (const [mode, label] of [['refuse', '④ the place REFUSED'], ['swallow', '⑤ the place NEVER ANSWERED']]) {
  const c = await chrome({ grant: false });
  const { h, ctl, evs } = await holdOn(c, PLACE, { boundMs: 1500 });
  const k = `unplaced-${mode}`;
  await openThenMode(c, ctl, k, mode);
  const got = await reportsOf((x) => x.k === k, 1, SPACING_MS + 6000);
  ok(got.length === 1 && got[0].err === 1 && got[0].perm === 'denied' && evs.some((e) => e.kind === 'unplaced'), `${label}: the tab it opened is RELEASED unplaced inside the bound and said — it reads «denied» (the profile's own setting), never this machine's position (${J(got[0] || null)})`, { got, evs });
  h.dispose(); await stop(c);
}
// ⑥ THE HOLD DIES INSIDE THE PAUSE. (a) the browser does NOT release the tab by itself; (b) the hold's own next arm does, its place
// first; (c) a tab OPENED while the hold is down is not paused: it runs without the place (what it reads printed: the kb sentence)
{
  const c = await chrome();
  const { h, ctl } = await holdOn(c, PLACE, { boundMs: 60000, rearmMs: [600000] });
  const op = await openThenMode(c, ctl, 'death', 'swallow');
  await childAsked(ctl, op);   // the opener's tab opened (1.5 s after its load) and waits in its pause: its place never answered
  for (const s of ctl.sockets) { try { s.terminate(); } catch { /* gone */ } }
  const early = await reportsOf((x) => x.k === 'death', 1, 3000);
  F.deathPaused = { readWithin3000ms: early.length > 0 };
  ok(!F.deathPaused.readWithin3000ms, '⑥ (a) THE HOLD DIES INSIDE THE PAUSE: the browser does NOT release the tab by itself — no read in 3 s (so the hold\'s next arm must)', F.deathPaused);
  h.dispose(); await stop(c);
}
// ⑥ (b) THE HOLD'S OWN NEXT ARM: it finds the tab its dead socket left paused, sets the place, releases it — its first read is the place
{
  const c = await chrome();
  const { h, ctl, evs } = await holdOn(c, PLACE, { boundMs: 20000, rearmMs: [3000] });
  const op = await openThenMode(c, ctl, 'rearm', 'swallow');
  await childAsked(ctl, op);
  for (const s of ctl.sockets) { try { s.terminate(); } catch { /* gone */ } }
  const t0 = Date.now();
  ctl.place = 'pass';   // the next arm's place goes through
  const got = await reportsOf((x) => x.k === 'rearm', 1, 10000);
  F.rearm = { firstReadAfterMs: got[0] ? got[0].at - t0 : null, read: got[0] || null, heldAgain: evs.some((e) => e.kind === 'held' && e.after === 'lost') };
  ok(got.length === 1 && isPlace(got[0]) && F.rearm.heldAgain, `⑥ (b) the hold's next arm (3 s here) sets the place on the tab its dead socket left paused and releases it: its first read IS the place (${F.rearm.firstReadAfterMs} ms after the hold died) — never hung for good, never this machine's place`, F.rearm);
  h.dispose(); await stop(c);
}
{
  const c = await chrome({ grant: false });
  const { h, ctl } = await holdOn(c, PLACE, { rearmMs: [60000] });
  await sleep(300);
  for (const s of ctl.sockets) { try { s.terminate(); } catch { /* gone */ } }
  await sleep(300);
  await openTabs(c, 'down', 1);
  const got = await reportsOf((x) => x.k === 'down', 1, SPACING_MS + 6000);
  F.down = got[0] || null;
  ok(got.length === 1 && got[0].err === 1 && got[0].perm === 'denied', `⑥ (c) a tab OPENED while the hold is down is not paused and reads «denied» (the profile's own setting) — never this machine's position (${J(got[0] || null)})`, F.down);
  h.dispose(); await stop(c);
}
// ⑥ (d) TODAY (no site is allowed the place): a RUNNING placed tab reads «denied» before AND after the hold's own socket dies (every hub
// restart) — the profile's own stored denial, whatever of ours is down. (That the socket's overrides go with it is measure (a)'s fact,
// test-browser-geo-hold-measure; a grant given beside the place is the place's road, a later unit — r1707 (8), said as what it shows.)
{
  const c = await chrome({ grant: false });
  const { h, ctl } = await holdOn(c, PLACE, { rearmMs: [600000] });
  await openTabs(c, 'running', 1);
  const [r0] = await reportsOf((x) => x.k === 'running', 1, SPACING_MS + 4000);
  for (const s2 of ctl.sockets) { try { s2.terminate(); } catch { /* gone */ } }
  await sleep(400);
  const tab = (await pageTargets(c)).find((t) => t.url.includes('k=running&i=0'));
  const own = await c.cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  await c.cdp.send('Target.activateTarget', { targetId: tab.targetId });
  await c.cdp.send('Runtime.evaluate', { expression: 'window.again(1)' }, own.sessionId);
  const got = await reportsOf((x) => x.k === 'running', 2, 6000);
  F.running = { before: r0 || null, after: got[1] || null };
  ok(!!r0 && r0.err === 1 && r0.perm === 'denied' && got.length === 2 && got[1].err === 1 && got[1].perm === 'denied', `⑥ (d) TODAY (no site allowed the place): a running placed tab reads «denied» before and after the hold's own socket dies — the profile's own setting, never this machine's position (${J(F.running)})`, F.running);
  h.dispose(); await stop(c);
}
// ⑦ another client visits a held tab and leaves: the place stands
{
  const c = await chrome();
  const { h } = await holdOn(c, PLACE);
  await openTabs(c, 'visit', 1);
  const [r1] = await reportsOf((x) => x.k === 'visit', 1, SPACING_MS + 4000);
  const tab = (await pageTargets(c)).find((t) => t.url.includes('k=visit&i=0'));
  const v = await connect(c.url);
  const vs = await v.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  await v.send('Runtime.evaluate', { expression: '1+1' }, vs.sessionId);
  await v.send('Target.detachFromTarget', { sessionId: vs.sessionId });
  v.close(); await sleep(300);
  await c.cdp.send('Target.activateTarget', { targetId: tab.targetId });
  const own = await c.cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  await c.cdp.send('Runtime.evaluate', { expression: 'window.again(1)' }, own.sessionId);
  const got = await reportsOf((x) => x.k === 'visit', 2, 6000);
  F.visit = { first: r1 || null, after: got[1] || null };
  ok(isPlace(r1) && got.length === 2 && isPlace(got[1]), '⑦ ANOTHER CLIENT attaches a held tab and leaves: the tab\'s next read is still the place', F.visit);
  h.dispose(); await stop(c);
}
console.log('\nFACT ⑥ the hold dead inside a pause: ' + J({ paused: F.deathPaused, rearm: F.rearm, openedWhileDown: F.down }) + ' (a tab opened while it is down: the dead provider here; on a machine with a working one, this machine\'s real place where the site holds the permission)');
console.log('FACT ③ «blocked» (the stored denial alone) first read: ' + J(F.blocked));
srv.close();
report();
