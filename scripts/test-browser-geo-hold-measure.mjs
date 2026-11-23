#!/usr/bin/env node
// test-browser-geo-hold-measure — B-9584 U2c, round wlupk6i1e (主开发 r1264): THREE FACTS the fail-closed shape needs, MEASURED on this
// machine's REAL Chrome (heavy, tests only; it changes no product file). Scratch profiles under this run's stamped root, ONE loopback
// page, every other request to a DEAD proxy (zero vendor calls: a location provider can only fail — «this machine's answer» reads as an
// error here, the real place on a machine with a working provider). Every page read prints the permission's state and what it got.
// «A site allowed earlier» = a STORED grant written into the profile's own Preferences before its launch (a control proves Chrome
// read it: the site's permission state is «granted» with nothing else set).
//   (a) THE HOLD'S OWN SOCKET DYING under a placed RUNNING tab: a client sets the place on the tab (and, for «blocked», the every-origin
//       denial), the page reads; the client's socket is TERMINATED; the page reads again BEFORE anything re-arms. Printed.
//   (b) THE PROFILE'S OWN STORED SETTING written at launch: default geolocation = block, with the site's earlier grant kept — does the
//       grant win? — and with the site's grant rewritten to block. Printed (and whether Chrome kept what was written).
//   (c) ON THAT STORED DENIAL, a live client: «prompt» for every origin plus the place (the site still ASKING), then a per-site grant plus
//       the place; then the client's socket TERMINATED and the page reads again (back to the stored denial?). Printed.
// It JUDGES only that each measure ran and that its control could see the other answer; each ✓ line carries its facts whole (a single-suite
// run brings its log back green or red). Its first run (the integrator's queue, at f36b21f2e) is the line's: the kb essay of
// src/server/browser-geo-hold.js quotes it. Without a Chrome it SKIPS BY NAME.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, CHROME_QUIET, CHROME_STORE, endRootedProcesses } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const WS = require('ws');
const ATL = require('../src/server/browser-attach-launch.js');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const PLACE = Object.freeze({ latitude: 35.6762, longitude: 139.6503, accuracy: 50 });   // a stand-in place (no person's)
const ROOT = scratch('geomeasure');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')
  && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'TMPDIR', 'XDG_RUNTIME_DIR'].includes(k)));
const CHROME = ATL.chromeExecutable(BASE_ENV);
if (!CHROME) { console.log('\nSKIP: no Chrome on PATH (the keeper\'s own lookup) — no measure ran on this machine'); process.exit(0); }
process.on('exit', () => { try { endRootedProcesses(ROOT); } catch { /* best effort */ } });
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => process.exit(130));

const reports = [];
const page = (body) => `<!doctype html><meta charset="utf-8"><title>m</title><script>${body}</script>`;
const say = "const say=(o)=>fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});";
const READ = "const read=(k,i)=>{navigator.permissions.query({name:'geolocation'}).then((ps)=>{const t0=performance.now();navigator.geolocation.getCurrentPosition((p)=>say({k,i,perm:ps.state,lat:p.coords.latitude,lng:p.coords.longitude,ms:Math.round(performance.now()-t0)}),(e)=>say({k,i,perm:ps.state,err:e.code,ms:Math.round(performance.now()-t0)}),{timeout:1500,maximumAge:0});});};";
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const k = J(String(u.searchParams.get('k') || '').replace(/[^\w-]/g, ''));
  if (req.method === 'POST' && u.pathname === '/report') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { reports.push({ at: Date.now(), ...JSON.parse(b) }); } catch { /* not ours */ } res.end('ok'); }); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (u.pathname === '/geo') return res.end(page(`${say}${READ}read(${k},'0');window.again=(n)=>read(${k},String(n));`));
  res.statusCode = 404; res.end('');
});
const PORT = await freePort(), DEAD = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROXY = `--proxy-server=http://127.0.0.1:${DEAD}`;
const reportsOf = async (pred, n, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms && reports.filter(pred).length < n) await sleep(50); return reports.filter(pred); };
const isPlace = (x) => !!x && x.lat !== undefined && Math.abs(Number(x.lat) - PLACE.latitude) < 1e-6;
const said = (x) => (!x ? 'no read' : isPlace(x) ? `the place (permission ${x.perm})` : x.lat !== undefined ? `ANOTHER position (permission ${x.perm})` : `error ${x.err} (permission ${x.perm})`);
console.log(`chrome: ${CHROME} · root ${ROOT} · page ${ORIGIN} · dead proxy :${DEAD}`);

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url, { perMessageDeflate: false });
    let id = 0; const wait = new Map();
    ws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); if (m.error) w.rej(new Error(m.error.message)); else w.res(m.result); } });
    ws.on('open', () => resolve({ ws, send: (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(J({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }), close: () => { try { ws.close(); } catch { /* gone */ } }, kill: () => { try { ws.terminate(); } catch { /* gone */ } } }));
    ws.on('error', reject);
  });
}
/** The profile's own stored geolocation state, written before its first launch (Chrome's Preferences shape). */
function prefsWith({ deflt = null, site = null } = {}) {
  const p = { profile: { content_settings: { exceptions: {} } } };
  if (deflt !== null) p.profile.default_content_setting_values = { geolocation: deflt };
  if (site !== null) p.profile.content_settings.exceptions.geolocation = { [`${ORIGIN},*`]: { last_modified: '13377777777000000', setting: site } };
  return p;
}
let nC = 0;
async function chrome(prefs = null) {
  const tag = `c${++nC}`, udd = path.join(ROOT, tag), home = path.join(ROOT, `${tag}-home`);
  fs.mkdirSync(path.join(udd, 'Default'), { recursive: true, mode: 0o700 }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (prefs) fs.writeFileSync(path.join(udd, 'Default', 'Preferences'), J(prefs));
  const child = spawn(CHROME, ['--headless=new', `--user-data-dir=${udd}`, '--remote-debugging-port=0', '--no-first-run', ...CHROME_QUIET, ...CHROME_STORE, PROXY, 'about:blank'], { env: { ...BASE_ENV, HOME: home, TMPDIR: home }, stdio: 'ignore' });
  const pf = path.join(udd, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !ATL.readPortFile(pf).text; i++) await sleep(50);
  const txt = ATL.readPortFile(pf).text;
  if (!txt) { try { child.kill('SIGKILL'); } catch { /* gone */ } throw new Error(`${tag}: Chrome wrote no DevToolsActivePort in 15 s`); }
  const [port, p] = txt.trim().split('\n');
  const url = `ws://127.0.0.1:${port}${p}`;
  return { tag, udd, child, url, cdp: await connect(url) };
}
async function stop(c) {
  try { await Promise.race([c.cdp.send('Browser.close'), sleep(3000)]); } catch { /* closing */ }
  c.cdp.close();
  for (let i = 0; i < 100 && c.child.exitCode === null && c.child.signalCode === null; i++) await sleep(50);
  if (c.child.exitCode === null && c.child.signalCode === null) { try { c.child.kill('SIGKILL'); } catch { /* gone */ } }
}
const storedOf = (c) => { try { const j = JSON.parse(fs.readFileSync(path.join(c.udd, 'Default', 'Preferences'), 'utf8')); const pr = j.profile || {}; return { default: (pr.default_content_setting_values || {}).geolocation ?? null, site: (((pr.content_settings || {}).exceptions || {}).geolocation || {})[`${ORIGIN},*`] ? (((pr.content_settings || {}).exceptions || {}).geolocation || {})[`${ORIGIN},*`].setting : null }; } catch (e) { return { unreadable: String(e && e.message).slice(0, 80) }; } };
/** A tab on the page, its own session on `cli` (the suite's client, or a «hold» client): → { targetId, sid } */
async function openTab(c, k) {
  const t = await c.cdp.send('Target.createTarget', { url: `${ORIGIN}/geo?k=${k}` });
  const a = await c.cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  return { targetId: t.targetId, sid: a.sessionId };
}
const again = async (c, tab, n) => { await c.cdp.send('Target.activateTarget', { targetId: tab.targetId }); await c.cdp.send('Runtime.evaluate', { expression: `window.again(${n})` }, tab.sid); };
const readOf = async (k, i, ms = 4000) => (await reportsOf((x) => x.k === k && x.i === String(i), 1, ms))[0] || null;
const F = {};

// ── THE CONTROL: Chrome reads a stored grant we write (else (b) cannot be read) ──
{
  const c = await chrome(prefsWith({ site: 1 }));
  // 主开发 r2842: the browser's OWN version answer, once, at the start — a fact run keeps the line that says what it measured on
  { const v = await c.cdp.send('Browser.getVersion').catch(() => null); F.browser = v ? { product: v.product, protocol: v.protocolVersion, program: CHROME } : { answer: 'none', program: CHROME }; console.log(`browser: ${v ? v.product : 'no version answer'} · ${CHROME}`); }
  const t = await openTab(c, 'ctl');
  F.control = { read: said(await readOf('ctl', 0)), stored: storedOf(c) };
  await stop(c);
  ok(/permission granted/.test(F.control.read), `CONTROL: a stored grant written into the profile's Preferences is READ by Chrome — the site's permission is «granted» with nothing else set (${F.control.read})`, F.control);
}
// ── (a) THE HOLD'S OWN SOCKET DYING under a placed RUNNING tab ──
for (const kind of ['place', 'blocked']) {
  const c = await chrome(prefsWith({ site: 1 }));   // the site allowed earlier (stored)
  const k = `a-${kind}`;
  const tab = await openTab(c, k);
  await readOf(k, 0);   // its first read (no hold yet), discarded
  const hold = await connect(c.url);
  const hs = await hold.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  if (kind === 'blocked') await hold.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
  await hold.send('Emulation.setGeolocationOverride', kind === 'place' ? PLACE : {}, hs.sessionId);
  await again(c, tab, 1);
  const held = await readOf(k, 1);
  hold.kill(); await sleep(400);
  await again(c, tab, 2);
  const after = await readOf(k, 2);
  F[`a_${kind}`] = { whileHeld: said(held), afterTheSocketDied: said(after) };
  await stop(c);
}
ok(!!F.a_place && F.a_place.whileHeld !== 'no read' && F.a_place.afterTheSocketDied !== 'no read' && /the place/.test(F.a_place.whileHeld), `(a) RAN: a placed running tab read ${F.a_place.whileHeld} while held; after the hold's own socket died: ${F.a_place.afterTheSocketDied}`, F.a_place);
ok(!!F.a_blocked && F.a_blocked.afterTheSocketDied !== 'no read', `(a) RAN for «blocked»: while held ${F.a_blocked.whileHeld}; after the hold's own socket died: ${F.a_blocked.afterTheSocketDied}`, F.a_blocked);
// ── (b) THE PROFILE'S OWN STORED SETTING ──
for (const [name, prefs] of [['default block, the site allowed before', prefsWith({ deflt: 2, site: 1 })], ['default block, the site rewritten to block', prefsWith({ deflt: 2, site: 2 })], ['default block, no site row', prefsWith({ deflt: 2 })]]) {
  const c = await chrome(prefs);
  const k = `b${nC}`;
  await openTab(c, k);
  const r = await readOf(k, 0);
  await stop(c);
  F[`b: ${name}`] = { read: said(r), storedAfter: storedOf(c) };
}
ok(Object.keys(F).filter((x) => x.startsWith('b: ')).every((x) => F[x].read !== 'no read'), `(b) RAN: ${Object.keys(F).filter((x) => x.startsWith('b: ')).map((x) => `${x.slice(3)} ⇒ ${F[x].read}`).join(' · ')}`, Object.fromEntries(Object.entries(F).filter(([x]) => x.startsWith('b: '))));
// ── (c) ON THE STORED DENIAL, a live client ──
for (const [name, setting, origin] of [['prompt, every origin', 'prompt', null], ['granted, the site only', 'granted', ORIGIN]]) {
  const c = await chrome(prefsWith({ deflt: 2, site: 2 }));
  const k = `c${nC}`;
  const tab = await openTab(c, k);
  await readOf(k, 0);   // the stored denial, discarded
  const hold = await connect(c.url);
  const hs = await hold.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  await hold.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting, ...(origin ? { origin } : {}) });
  await hold.send('Emulation.setGeolocationOverride', PLACE, hs.sessionId);
  await again(c, tab, 1);
  const held = await readOf(k, 1);
  hold.kill(); await sleep(400);
  await again(c, tab, 2);
  const after = await readOf(k, 2);
  F[`c: ${name}`] = { whileHeld: said(held), afterTheSocketDied: said(after), storedAfter: storedOf(c) };
  await stop(c);
}
ok(Object.keys(F).filter((x) => x.startsWith('c: ')).every((x) => F[x].whileHeld !== 'no read' && F[x].afterTheSocketDied !== 'no read'), `(c) RAN: ${Object.keys(F).filter((x) => x.startsWith('c: ')).map((x) => `${x.slice(3)} ⇒ held: ${F[x].whileHeld}; socket died: ${F[x].afterTheSocketDied}`).join(' · ')}`, Object.fromEntries(Object.entries(F).filter(([x]) => x.startsWith('c: '))));
console.log('\nFACTS ' + J(F));
srv.close();
report();
