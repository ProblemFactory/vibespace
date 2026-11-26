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
//      ⑤ (B-1217) is judged on its facts in order: the plant's witness (the place asked and swallowed, else a named skip), the release,
//      then the read waited from the release; a released tab that ran with no read is a named skip, one that never ran is RED.
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
const PLACE = Object.freeze({ kind: 'place', latitude: 12.5, longitude: 45.25, accuracy: 50 });   // a stand-in place: a round made-up pair (no person's, no city's — r2311)
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
const READ = `const read=(k,i)=>{navigator.permissions.query({name:'geolocation'}).then((ps)=>{const t0=performance.now(),callAt=Date.now();navigator.geolocation.getCurrentPosition((p)=>say({k,i,callAt,perm:ps.state,lat:p.coords.latitude,lng:p.coords.longitude,ms:Math.round(performance.now()-t0)}),(e)=>say({k,i,callAt,perm:ps.state,err:e.code,ms:Math.round(performance.now()-t0)}),{timeout:${READ_MS},maximumAge:0});});};`;
const POP="window.go=(k,delay)=>{const w=window.open('');const fire=()=>{const callAt=Date.now(),t0=performance.now();const fin=(o)=>{let q;try{q=w.navigator.permissions.query({name:'geolocation'});}catch(e){q=Promise.resolve({state:'unreadable'});}q.then((ps)=>say({k,i:'0',perm:ps.state,callAt,ms:Math.round(performance.now()-t0),...o}),()=>say({k,i:'0',perm:'unreadable',callAt,ms:Math.round(performance.now()-t0),...o}));};try{w.navigator.geolocation.getCurrentPosition((p)=>fin({lat:p.coords.latitude,lng:p.coords.longitude}),(e)=>fin({err:e.code}),{timeout:1500,maximumAge:0});}catch(e){fin({threw:String(e&&e.message).slice(0,80)});}};if(delay)setTimeout(fire,delay);else fire();return 'opened';};";
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const k = JSON.stringify(String(u.searchParams.get('k') || '').replace(/[^\w-]/g, '')), i = JSON.stringify(String(u.searchParams.get('i') || '0').replace(/\D/g, ''));
  if (req.method === 'POST' && u.pathname === '/report') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { reports.push({ at: Date.now(), ...JSON.parse(b) }); } catch { /* not ours */ } res.end('ok'); }); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (u.pathname === '/geo') return res.end(page(`${say}${READ}read(${k},${i});window.again=(n)=>read(${k},String(n));`));
  if (u.pathname === '/pop') return res.end(page(`${say}${READ}${POP}`));   // B-9584 (B): a listed site's popup read in the same script that opens it
  if (u.pathname === '/frame-host') { const src = String(u.searchParams.get('src') || ''); if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/geo\?[\w=&-]+$/.test(src)) { res.statusCode = 400; return res.end(''); } return res.end(`<!doctype html><meta charset="utf-8"><title>f</title><iframe src="${src}"${u.searchParams.get('allow') === '1' ? ' allow="geolocation"' : ''}></iframe>`); }   // a frame of one origin inside another's page
  if (u.pathname === '/worker') return res.end(page(`${say}const w=new Worker(URL.createObjectURL(new Blob(["postMessage('geolocation' in self.navigator)"],{type:'text/javascript'})));w.onmessage=(e)=>say({k:${k},i:'0',worker:e.data});`));   // a worker: no geolocation there
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
      this.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (m && m.method === 'Target.attachedToTarget' && m.params && m.params.targetInfo) ctl.attached.push({ tid: m.params.targetInfo.targetId, opener: m.params.targetInfo.openerId || null, sid: m.params.sessionId, waiting: !!m.params.waitingForDebugger, at: Date.now() }); if (m && m.id && ctl.relIds.has(m.id)) ctl.relReply.set(ctl.relIds.get(m.id), { at: Date.now(), error: m.error ? m.error.message : null }); });   // the hold's own attach events (r1707 (8): waited on, never a sleep)
    }
    send(data, ...rest) {
      let m = null; try { m = JSON.parse(String(data)); } catch { m = null; }
      if (m && m.method === 'Emulation.setGeolocationOverride' && m.sessionId) { ctl.asked.add(m.sessionId); if (!ctl.askedAt.has(m.sessionId)) ctl.askedAt.set(m.sessionId, Date.now()); }   // when the hold SENT a tab's place (one machine, one clock: the page's own callAt is compared)
      if (m && m.method === 'Runtime.runIfWaitingForDebugger' && m.sessionId) { ctl.released.add(m.sessionId); if (!ctl.releasedAt.has(m.sessionId)) ctl.releasedAt.set(m.sessionId, Date.now()); ctl.relIds.set(m.id, m.sessionId); }
      if (m && m.method === 'Emulation.setGeolocationOverride' && ctl.place !== 'pass') {
        if (ctl.place === 'refuse') { setImmediate(() => this.emit('message', Buffer.from(J({ id: m.id, error: { code: -32000, message: 'refused (a stand-in)' } })), false)); return; }
        if (ctl.place === 'swallow') { if (m.sessionId) ctl.swallowed.add(m.sessionId); return; }   // B-1217: the plant's witness — this tab's place was asked and never sent
        const d = /^delay:(\d+)$/.exec(ctl.place); if (d) { setTimeout(() => { try { super.send(data, ...rest); } catch { /* gone */ } }, Number(d[1])); return; }
      }
      return super.send(data, ...rest);
    }
  };
}
async function holdOn(c, plan, { G = GH, boundMs = 1500, rearmMs = [60000] } = {}) {
  const ctl = { place: 'pass', sockets: [], attached: [], asked: new Set(), askedAt: new Map(), released: new Set(), releasedAt: new Map(), relIds: new Map(), relReply: new Map(), swallowed: new Set() }, evs = [];
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
for (const [mode, label] of [['refuse', '④ the place REFUSED']]) {
  const c = await chrome({ grant: false });
  const { h, ctl, evs } = await holdOn(c, PLACE, { boundMs: 1500 });
  const k = `unplaced-${mode}`;
  await openThenMode(c, ctl, k, mode);
  const got = await reportsOf((x) => x.k === k, 1, SPACING_MS + 6000);
  ok(got.length === 1 && got[0].err === 1 && got[0].perm === 'denied' && evs.some((e) => e.kind === 'unplaced'), `${label}: the tab it opened is RELEASED unplaced inside the bound and said — it reads «denied» (the profile's own setting), never this machine's position (${J(got[0] || null)})`, { got, evs });
  h.dispose(); await stop(c);
}
// ⑤ the place NEVER ANSWERED — B-1217 (主开发 r5169). 2.369.420's first hosted run read it red once (heavy 7/7, Node 22, the runner's Chrome
// not recorded): «held», then «unplaced» 3 s later, and no read in one 9 s window counted from the open. Probed 24 times green (Chromium
// 154 on the second test machine, Chrome 158.0.8127.36 on the first): each tab released about 1.5 s after its attach, read «denied» about
// 10 ms later. Now judged on its FACTS IN ORDER, each waited on: the opener's tab paused by the hold, its place asked and SWALLOWED (the
// plant's witness — else a named skip: the scene did not form); the product's acts (released unplaced inside the bound, said «not
// answered»); then its read, waited from the RELEASE. A read that never comes is told apart: a tab that RAN with no read reaching the
// suite is a named skip (the page's report, never the product's act); a released tab that never ran is RED — a stuck tab a person sees.
const tabState = async (c, tid) => {
  try {
    const t = ((await c.cdp.send('Target.getTargets')).targetInfos || []).find((x) => x.targetId === tid) || null;
    if (!t) return { gone: true };
    const at = await c.cdp.send('Target.attachToTarget', { targetId: tid, flatten: true });
    const v = await Promise.race([c.cdp.send('Runtime.evaluate', { expression: 'document.readyState + " " + location.href', returnByValue: true }, at.sessionId).then((r) => (r && r.result ? r.result.value : null)).catch(() => null), sleep(3000).then(() => null)]);
    return { url: t.url, ran: typeof v === 'string', rs: v };
  } catch (e) { return { threw: String(e && e.message) }; }
};
async function fiveLeg(G, tag) {
  const c = await chrome({ grant: false });
  const { h, ctl, evs } = await holdOn(c, PLACE, { G, boundMs: 1500 });
  const k = `unplaced-swallow-${tag}`;
  const opener = await openThenMode(c, ctl, k, 'swallow');
  const child = opener ? await untilV(() => ctl.attached.find((a) => a.opener === opener) || null, 8000) : null;   // the tab the opener opens, paused by the hold
  const planted = child ? await untilV(() => (ctl.swallowed.has(child.sid) ? true : null), 8000) : null;   // WITNESS: its place asked and swallowed
  const r = { tag, scene: !opener ? 'the opener tab was never released' : !child ? 'the opener opened no tab the hold paused' : !planted ? 'the hold never asked that tab\'s place (the plant was not in force)' : null };
  if (!r.scene) {
    const relAt = await untilV(() => ctl.releasedAt.get(child.sid) || null, 1500 + 3000);   // the product's act: released (its bound 1.5 s, a margin)
    const un = evs.find((e) => e.kind === 'unplaced') || null;
    r.released = relAt ? relAt - child.at : null; r.why = un ? un.why : null; r.reply = ctl.relReply.get(child.sid) || null; r.got = [];
    if (relAt) { r.got = await reportsOf((x) => x.k === k, 1, READ_MS + 6000); if (!r.got.length) r.state = await tabState(c, child.tid); }   // the read, waited from the release
  }
  h.dispose(); await stop(c);
  return r;
}
{
  const f5 = await fiveLeg(GH, 'r');
  if (f5.scene) console.log(`  SKIP (named, counted): ⑤ the scene did not form — ${f5.scene}`);
  else {
    ok(f5.released !== null && f5.why === 'not answered', `⑤ the place NEVER ANSWERED: the tab it opened is RELEASED unplaced inside the bound and said («${f5.why}», released ${f5.released} ms after its attach)`, f5);
    if (f5.released !== null) {
      if (f5.got.length) ok(f5.got.length === 1 && f5.got[0].err === 1 && f5.got[0].perm === 'denied' && f5.got[0].lat === undefined, `⑤ …and it reads «denied» (the profile's own setting), never this machine's position (${J(f5.got[0])})`, f5.got);
      else if (f5.state && f5.state.ran) console.log(`  SKIP (named, counted): ⑤ the released tab ran (${f5.state.rs}) but its read never reached the suite within ${(READ_MS + 6000) / 1000} s of its release — the page's report, not judged`);
      else ok(false, '⑤ the tab the hold RELEASED never ran (still paused after its release) — a stuck tab a person would see', f5);
    }
  }
  // RED (B-1217): a hold copy that never releases a tab it could not place — the leg above sees no release (the tab stays paused)
  const noRel = MUT.load('src/server/browser-geo-hold.js', anchored(holdSrc, "    call(h, 'Runtime.runIfWaitingForDebugger', {}, sid, closeMs);\n    return placed;\n  }", "    if (placed) call(h, 'Runtime.runIfWaitingForDebugger', {}, sid, closeMs);\n    return placed;\n  }", 'geo chrome RED no unplaced release'), 'no-unplaced-release');
  const f5R = await fiveLeg(noRel, 'red');
  if (f5R.scene) console.log(`  SKIP (named, counted): ⑤ RED — the scene did not form (${f5R.scene})`);
  else ok(f5R.released === null && f5R.why === 'not answered', '⑤ RED (B-1217): a hold copy that never releases a tab it could not place — it says «unplaced» but the tab is never released: the leg above sees it', f5R);
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
// ⑥ (b) THE HOLD'S OWN NEXT ARM: it finds the tab its dead socket left paused, sets the place, releases it — its first read is the place.
// B-9584 (B), r1898 (7): the site LISTED and NO stand-in grant (the socket's death resets every override anyway, measured): the hold's
// re-arm is the only giver, so the place AND the grant must both be set before the tab runs
{
  const c = await chrome({ grant: false });
  const { h, ctl, evs } = await holdOn(c, { ...PLACE, sites: [ORIGIN] }, { boundMs: 20000, rearmMs: [3000] });
  const op = await openThenMode(c, ctl, 'rearm', 'swallow');
  await childAsked(ctl, op);
  for (const s of ctl.sockets) { try { s.terminate(); } catch { /* gone */ } }
  const t0 = Date.now();
  ctl.place = 'pass';   // the next arm's place goes through
  const got = await reportsOf((x) => x.k === 'rearm', 1, 10000);
  F.rearm = { firstReadAfterMs: got[0] ? got[0].at - t0 : null, read: got[0] || null, heldAgain: evs.some((e) => e.kind === 'held' && e.after === 'lost') };
  ok(got.length === 1 && isPlace(got[0]) && F.rearm.heldAgain, `⑥ (b) the hold's next arm (3 s here) sets the place on the tab its dead socket left paused and releases it: its first read IS the place, its grant given before it ran (${F.rearm.firstReadAfterMs} ms after the hold died) — never hung for good, never «denied» on its listed site, never this machine's place`, F.rearm);
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

// ═══ B-9584 (B) THE PLACE'S ROAD (the owner's choice; 主开发 r1791 / r1898): a LISTED site — the hold is the ONLY giver, on its own
// socket, after the place is set; every other site denied in silence (the stored denial + the hold's every-origin denial) ═══
// (4) every place a listed site's script can ask from: a new tab; a popup read in the same script that opens it (the ORDER asserted:
// asked AFTER the hold sent its place); a frame of ANOTHER origin inside a listed page (with allow="geolocation", and without); the
// listed site framed inside an UNLISTED page; a worker (no geolocation there at all: named); an unlisted site's own tab. (2)(7) the
// hold's socket dies: «denied» until it is armed again, then the place. (D) the dialog watch's own every-origin denial and its leaving.
// (r1791) with sites on the list a tab the hold could not place is CLOSED.
const LISTED = ORIGIN, OTHER = `http://localhost:${PORT}`;
const denied = (x) => !!x && x.err === 1 && x.perm === 'denied';
const refusedRead = (x) => !!x && x.err === 1 && x.lat === undefined;   // the read refused, whatever the frame's own permission query says
{
  const c = await chrome({ grant: false });
  const { h, ctl } = await holdOn(c, { ...PLACE, sites: [LISTED] });
  await openTabs(c, 'b-tab', 1);
  const [t1] = await reportsOf((x) => x.k === 'b-tab', 1, SPACING_MS + 4000);
  const op = await c.cdp.send('Target.createTarget', { url: `${LISTED}/pop?k=b-pop` });
  await untilV(() => { const a = ctl.attached.find((x) => x.tid === op.targetId); return a && ctl.released.has(a.sid) ? a : null; }, 8000);
  const oa = await c.cdp.send('Target.attachToTarget', { targetId: op.targetId, flatten: true });
  await c.cdp.send('Runtime.evaluate', { expression: "window.go('b-pop-now', 0)", userGesture: true }, oa.sessionId);
  const [pr] = await reportsOf((x) => x.k === 'b-pop-now', 1, 6000);
  const popA = ctl.attached.find((x) => x.opener === op.targetId) || null;
  const popPlaceAt = popA ? ctl.askedAt.get(popA.sid) || null : null;
  const framed = async (top, src, allow, k) => { await c.cdp.send('Target.createTarget', { url: `${top}/frame-host?src=${encodeURIComponent(src)}&allow=${allow ? 1 : 0}` }); return (await reportsOf((x) => x.k === k, 1, SPACING_MS + 4000))[0] || null; };
  const xf = await framed(LISTED, `${OTHER}/geo?k=b-xframe&i=0`, true, 'b-xframe');
  const xf0 = await framed(LISTED, `${OTHER}/geo?k=b-xframe0&i=0`, false, 'b-xframe0');
  const fr = await framed(OTHER, `${LISTED}/geo?k=b-framed&i=0`, true, 'b-framed');
  await c.cdp.send('Target.createTarget', { url: `${LISTED}/worker?k=b-worker` });
  const [wk] = await reportsOf((x) => x.k === 'b-worker', 1, 6000);
  await c.cdp.send('Target.createTarget', { url: `${OTHER}/geo?k=b-other&i=0` });
  const [ot] = await reportsOf((x) => x.k === 'b-other', 1, SPACING_MS + 4000);
  F.B = { newTab: t1 || null, popup: pr || null, popupAskedAfterItsPlaceMs: pr && popPlaceAt ? pr.callAt - popPlaceAt : null, crossFrameAllowed: xf, crossFrameNotAllowed: xf0, listedInUnlistedTop: fr, worker: wk || null, unlisted: ot || null };
  ok(isPlace(t1), `(B) (4) a listed site's NEW TAB: its first read is the place (${J(t1 || null)})`, F.B);
  ok(isPlace(pr) && !!popPlaceAt && pr.callAt >= popPlaceAt, `(B) (4)(8) a listed site's POPUP read in the same script that opens it: the place, and its ask came AFTER the hold sent the popup's place (+${F.B.popupAskedAfterItsPlaceMs} ms) — asserted every run`, F.B);
  ok(isPlace(xf) && refusedRead(xf0), `(B) (4) a frame of ANOTHER origin inside a listed page: with allow="geolocation" it reads the place (the top page's grant, its tab's place); without it its read is REFUSED, PERMISSION_DENIED by the frame's policy (measured: its own permission query still says «${xf0 && xf0.perm}») (${J({ xf, xf0 })})`, F.B);
  ok(denied(fr), `(B) (4) the listed site FRAMED inside an UNLISTED page: «denied» (the top page's own setting) (${J(fr)})`, F.B);
  ok(!!wk && wk.worker === false, `(B) (4) a WORKER of a listed page: no geolocation in it at all (${J(wk || null)})`, F.B);
  ok(denied(ot), `(B) (3) an UNLISTED site's tab: «denied», in silence (${J(ot || null)})`, F.B);
  // r2311 (3): AN AGENT's OWN CLEAR OF A LISTED TAB's POSITION — the mediation every agent call goes through refuses it BY NAME (both
  // roads), so the site still reads the place. FACT: the same clear sent raw by a second client on that tab (what the refusal stops);
  // the tab closed after it
  {
    const MED = require('../src/browser-mediation.js');
    const tg = await c.cdp.send('Target.createTarget', { url: `${LISTED}/geo?k=b-clr&i=0` });
    const [c0] = await reportsOf((x) => x.k === 'b-clr' && x.i === '0', 1, SPACING_MS + 6000);
    const v = MED.judge({ id: 1, method: 'Emulation.clearGeolocationOverride', params: {} }, MED.newScope({ targets: [tg.targetId] }), { place: () => 'place' });
    const vs = MED.judgeScope({ id: 2, method: 'Emulation.clearGeolocationOverride', params: {} }, null, { place: () => 'place' });
    const a2 = await c.cdp.send('Target.attachToTarget', { targetId: tg.targetId, flatten: true });   // a second client on the tab (the suite's own)
    if (v.kind !== 'refuse') await c.cdp.send('Emulation.clearGeolocationOverride', {}, a2.sessionId);   // sent only were it admitted
    await c.cdp.send('Runtime.evaluate', { expression: 'window.again(1)' }, a2.sessionId);
    const [c1] = await reportsOf((x) => x.k === 'b-clr' && x.i === '1', 1, SPACING_MS + 6000);
    await c.cdp.send('Emulation.clearGeolocationOverride', {}, a2.sessionId).catch(() => null);   // THE FACT: what an admitted clear does
    await c.cdp.send('Runtime.evaluate', { expression: 'window.again(2)' }, a2.sessionId);
    const [c2] = await reportsOf((x) => x.k === 'b-clr' && x.i === '2', 1, SPACING_MS + 8000);
    await c.cdp.send('Target.closeTarget', { targetId: tg.targetId }).catch(() => null);
    F.Bclear = { before: c0 || null, afterTheRefusedClear: c1 || null, refusedAs: v.kind === 'refuse' ? MED.refusalCodeOf(v.reply) : v.kind, scopeRoad: vs.kind === 'refuse' ? MED.refusalCodeOf(vs.reply) : vs.kind, factAnAdmittedClearReads: c2 || null };
    ok(isPlace(c0) && v.kind === 'refuse' && MED.refusalCodeOf(v.reply) === 'place_held' && vs.kind === 'refuse' && MED.refusalCodeOf(vs.reply) === 'place_held' && isPlace(c1), `r2311 (3) an agent's own clear of a LISTED tab's position: REFUSED by name on both roads (place_held); the site still reads the place — FACT, the same clear admitted, the site then reads: ${J(c2 || null)}`, F.Bclear);
  }
  h.dispose(); await stop(c);
}
{
  const c = await chrome({ grant: false });
  const { h, ctl, evs } = await holdOn(c, { ...PLACE, sites: [LISTED] }, { rearmMs: [1500] });
  await openTabs(c, 'b-run', 1);
  const [r0] = await reportsOf((x) => x.k === 'b-run', 1, SPACING_MS + 4000);
  const tab = (await pageTargets(c)).find((t) => t.url.includes('k=b-run&i=0'));
  const own = await c.cdp.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  const readAgain = async (n) => { await c.cdp.send('Target.activateTarget', { targetId: tab.targetId }); await c.cdp.send('Runtime.evaluate', { expression: `window.again(${n})` }, own.sessionId); return (await reportsOf((x) => x.k === 'b-run' && x.i === String(n), 1, 6000))[0] || null; };
  for (const s2 of ctl.sockets) { try { s2.terminate(); } catch { /* gone */ } }
  const rDead = await readAgain(1);   // between its death and its next arm (1.5 s here)
  const back = await untilV(() => evs.find((e) => e.kind === 'held' && e.after === 'lost') || null, 10000);
  const rBack = await readAgain(2);
  F.Bdeath = { before: r0 || null, betweenTheDeathAndTheArm: rDead, armedAgain: !!back, afterIt: rBack };
  ok(isPlace(r0) && denied(rDead) && !!back && isPlace(rBack), `(B) (2)(7) the hold's socket DIES: a listed site's running tab reads «denied» (its grant died with that socket — never this machine's position); armed again, the place again (${J(F.Bdeath)})`, F.Bdeath);
  const w = await connect(c.url);
  await w.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  const rW = await readAgain(3);
  w.close(); await sleep(400);
  const rW2 = await readAgain(4);
  F.Bwatch = { underAnotherClientsDenial: rW, afterThatClientLeft: rW2 };
  ok(!!rW && !!rW2 && (denied(rW) || isPlace(rW)) && (denied(rW2) || isPlace(rW2)), `(B) (D) the dialog watch's kind of client: its every-origin denial, then its leaving — never this machine's position; what the listed site reads (a FACT): ${J(F.Bwatch)}`, F.Bwatch);
  // r2311 (i): THE HOLD GRANTS AGAIN after that client left (the keeper asks it when the dialog watch's socket closes, and after the
  // watch's takeover reset): on its own socket, the listed site reads the PLACE again
  const regranted = await h.regrant(`bp-${c.tag}`);
  const rW3 = await readAgain(5);
  F.Bwatch.regranted = regranted; F.Bwatch.afterTheRegrant = rW3;
  ok(regranted === true && isPlace(rW3), `r2311 (i) after another client left (then: ${J(rW2)}), the hold GRANTS AGAIN on its own socket — the listed site reads the PLACE (${J(rW3)})`, F.Bwatch);
  ctl.place = 'refuse';
  await openTabs(c, 'b-unplaced', 1);
  const closedEv = await untilV(() => evs.find((e) => e.kind === 'closed') || null, SPACING_MS + 6000);
  const rU = await reportsOf((x) => x.k === 'b-unplaced', 1, 2000);
  F.Bunplaced = { closed: closedEv ? { why: closedEv.why, shut: closedEv.shut } : null, reads: rU.length };
  ok(!!closedEv && closedEv.shut === true && rU.length === 0, '(B) with sites on the list, a tab the hold could not place is CLOSED — it never reads (r1791)', F.Bunplaced);
  h.dispose(); await stop(c);
}
console.log('\nFACT ⑥ the hold dead inside a pause: ' + J({ paused: F.deathPaused, rearm: F.rearm, openedWhileDown: F.down }) + ' (a tab opened while it is down: the dead provider here; on a machine with a working one, this machine\'s real place where the site holds the permission)');
console.log('FACT ③ «blocked» (the stored denial alone) first read: ' + J(F.blocked));
console.log('FACT (B) ' + J({ B: F.B, death: F.Bdeath, watch: F.Bwatch, unplaced: F.Bunplaced }));
srv.close();
report();
