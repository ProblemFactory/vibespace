#!/usr/bin/env node
// B-9584 U2 — THE THREE FACTS THE START IS BUILT ON, MEASURED (heavy, tests only, run ONCE ALONE on the box by the integrator;
// 主开发 r726; the model: test-browser-ephemeral-life). It changes no product file. Each measure runs this box's REAL Chrome (and,
// for ①, the REAL agent-browser CLI) on scratch profiles under this run's own stamped root, against ONE loopback page; every
// other request goes to a DEAD proxy, so there are zero vendor calls and a geolocation provider can only fail. It JUDGES ONLY
// THAT EACH MEASURE RAN AND THAT ITS CONTROL CAN SEE THE OTHER ANSWER; the facts are printed whole for the line («FACT …»).
//   ① THE ZONE ON THE DRIVER ROAD: the CLI started with TZ=Asia/Tokyo in its own env opens the page — the page's Intl zone, and
//      TZ in the environ of every Chrome process of that world. CONTROL: a second world with TZ=America/Sao_Paulo (the two
//      read apart iff the CLI hands TZ on to Chrome; both the same iff it does not).
//   ② THE LANGUAGE KEPT IN THE PROFILE: Chrome twice on ONE scratch profile — first --lang=ja-JP --accept-lang=ja-JP, then
//      neither — navigator.languages and the Preferences file's intl.accept_languages after each. CONTROL: a fresh profile with
//      neither switch (the leg can tell a Japanese answer from the box's own).
//   ③ THE WATCH'S GAP: the profile already holds the geolocation permission for the page's origin (a person's earlier grant);
//      a page opens N tabs, ONE AT A TIME (each in the foreground: Chrome serves a position to that tab only — the first box run's
//      lesson), and each tab's FIRST script asks the position. Road A = today's watch (setDiscoverTargets →
//      targetCreated → attachToTarget flatten → Emulation.setGeolocationOverride); road B = paused (Target.setAutoAttach with
//      waitForDebuggerOnStart → the override → Runtime.runIfWaitingForDebugger). FACT: per road, how many first reads got the
//      override. CONTROL: no override at all ⇒ none does (the leg can see a miss). 主开发 r726: a first read that misses the
//      override where the permission is held is a STOP for the build (printed as such), not a gap to say.
// Without a Chrome on PATH, or the real agent-browser, it SKIPS BY NAME (its closing line «SKIP: …», never a green).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, CHROME_QUIET, CHROME_STORE, endRootedProcesses, driverArgs } from './scratch.mjs';
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const WS = require('ws');
const Ff = require('../src/browser-facts.js');
const ATL = require('../src/server/browser-attach-launch.js');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const N_TABS = 6;
const SPACING_MS = 4500;   // the box run of d5fb0c9ae (int361 01:35Z): six tabs opened at once ⇒ ONE answered — Chrome serves a position to the FOREGROUND tab only; so one tab at a time, each longer than the read's 4 s bound
const PLACE = Object.freeze({ latitude: 35.6762, longitude: 139.6503, accuracy: 50 });   // a stand-in place (no person's)

const ROOT = scratch('envmeasure');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')
  && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'TMPDIR', 'XDG_RUNTIME_DIR'].includes(k)));
const skipWhole = (why) => { console.log(`\nSKIP: ${why} — no leg ran on this machine`); process.exit(0); };
const CHROME = ATL.chromeExecutable(BASE_ENV);
if (!CHROME) skipWhole('no Chrome on PATH (the keeper\'s own lookup, src/server/browser-attach-launch.js chromeExecutable)');
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null;
try { const h0 = path.join(ROOT, 'v'); fs.mkdirSync(h0, { mode: 0o700 }); ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: { ...BASE_ENV, HOME: h0, TMPDIR: h0 } }).trim() : null; } catch { ver = null; }
if (!ver) skipWhole(`${DRIVER.skip} no real agent-browser resolves on PATH past the shim (the tree's real-driver fence, src/browser-facts.js binaryResolver)`);
process.on('exit', () => { try { endRootedProcesses(ROOT); } catch { /* best effort at exit */ } });
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => process.exit(130));

// ── the loopback page and the dead proxy ──
const reports = [];
const say = "const say=(o)=>fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});";
const page = (body) => `<!doctype html><meta charset="utf-8"><title>m</title><script>${body}</script>`;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), k = JSON.stringify(String(u.searchParams.get('k') || '').replace(/[^\w-]/g, ''));
  if (req.method === 'POST' && u.pathname === '/report') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { reports.push({ at: Date.now(), ...JSON.parse(b) }); } catch { /* not ours */ } res.end('ok'); }); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (u.pathname === '/probe') return res.end(page(`${say}say({k:${k},zone:Intl.DateTimeFormat().resolvedOptions().timeZone,lang:navigator.language,langs:navigator.languages});`));
  if (u.pathname === '/opener') return res.end(page(`let i=0;const next=()=>{if(i>=${N_TABS})return;window.open('/geo?k='+encodeURIComponent(${k})+'&i='+(i++),'_blank');setTimeout(next,${SPACING_MS});};next();`));
  if (u.pathname === '/geo') { const i = JSON.stringify(String(u.searchParams.get('i') || '')); return res.end(page(`${say}const t0=performance.now();navigator.geolocation.getCurrentPosition((p)=>say({k:${k},i:${i},lat:p.coords.latitude,lng:p.coords.longitude,ms:Math.round(performance.now()-t0),vis:document.visibilityState}),(e)=>say({k:${k},i:${i},err:e.code,ms:Math.round(performance.now()-t0),vis:document.visibilityState}),{timeout:4000,maximumAge:0});`)); }
  res.statusCode = 404; res.end('');
});
const PORT = await freePort(), DEAD = await freePort();
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROXY = `--proxy-server=http://127.0.0.1:${DEAD}`;   // nothing listens: every non-loopback request fails (loopback bypasses a proxy)
const reportsOf = async (pred, n, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms && reports.filter(pred).length < n) await sleep(50); return reports.filter(pred); };
console.log(`chrome: ${CHROME} · agent-browser: ${REAL_AB} (${ver}) · root ${ROOT} · page ${ORIGIN} · dead proxy :${DEAD} · ${N_TABS} tabs a road`);

// ── a raw CDP client (the browser endpoint), and Chrome started directly on a scratch profile ──
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url, { perMessageDeflate: false });
    let id = 0; const wait = new Map(), on = [];
    ws.on('message', (d) => { let m; try { m = JSON.parse(String(d)); } catch { return; } if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); if (m.error) w.rej(new Error(m.error.message)); else w.res(m.result); } else if (m.method) for (const f of on) f(m); });
    ws.on('open', () => resolve({ send: (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }), on: (f) => on.push(f), close: () => { try { ws.close(); } catch { /* gone */ } } }));
    ws.on('error', reject);
  });
}
async function chrome(tag, args = []) {
  const udd = path.join(ROOT, tag), home = path.join(ROOT, `${tag}-home`);
  fs.mkdirSync(udd, { recursive: true, mode: 0o700 }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const pf = path.join(udd, 'DevToolsActivePort'); try { fs.rmSync(pf, { force: true }); } catch { /* none */ }
  const child = spawn(CHROME, ['--headless=new', `--user-data-dir=${udd}`, '--remote-debugging-port=0', '--disable-popup-blocking', ...CHROME_QUIET, ...CHROME_STORE, PROXY, ...args, 'about:blank'], { env: { ...BASE_ENV, HOME: home, TMPDIR: home }, stdio: 'ignore' });
  for (let i = 0; i < 300 && !ATL.readPortFile(pf).text; i++) await sleep(50);
  const txt = ATL.readPortFile(pf).text;
  if (!txt) { try { child.kill('SIGKILL'); } catch { /* gone */ } throw new Error(`${tag}: Chrome wrote no DevToolsActivePort in 15 s`); }
  const [port, p] = txt.trim().split('\n');
  return { udd, child, cdp: await connect(`ws://127.0.0.1:${port}${p}`) };
}
async function stop(c) {
  try { await Promise.race([c.cdp.send('Browser.close'), sleep(3000)]); } catch { /* closing */ }
  c.cdp.close();
  for (let i = 0; i < 100 && c.child.exitCode === null && c.child.signalCode === null; i++) await sleep(50);
  if (c.child.exitCode === null && c.child.signalCode === null) { try { c.child.kill('SIGKILL'); } catch { /* gone */ } }
}
const F = {};   // the facts, printed at the end

// ── ① THE ZONE ON THE DRIVER ROAD ──
const ab = (args, env, timeout = 60000) => new Promise((resolve) => { execFile(REAL_AB, args, { env, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, out: String(so || '').trim().slice(-200), err: (String(se || '') + (err ? ' ' + String(err.message) : '')).trim().slice(-300) })); });
const chromeEnvUnder = (dir) => {   // every Chrome process of this world (its cmdline names a path under the world's home): its TZ
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').join(' '); } catch { continue; }
    if (!cmd.includes(dir) || !/chrom/i.test(cmd.split(' ')[0])) continue;
    let tz = null; try { const e = fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0').find((x) => x.startsWith('TZ=')); tz = e ? e.slice(3) : '(none)'; } catch { tz = '(unreadable)'; }
    out.push({ pid: Number(d), tz });
  }
  return out;
};
F.zone = {};
for (const [tag, tz] of [['tz1', 'Asia/Tokyo'], ['tz2', 'America/Sao_Paulo']]) {
  const H = path.join(ROOT, tag), X = path.join(H, 'run');
  fs.mkdirSync(path.join(H, '.agent-browser'), { recursive: true, mode: 0o700 }); fs.mkdirSync(X, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(H, '.agent-browser', 'config.json'), JSON.stringify({ args: driverArgs(...CHROME_QUIET, ...CHROME_STORE, PROXY) }), { mode: 0o600 });
  const env = { ...BASE_ENV, HOME: H, TMPDIR: H, XDG_RUNTIME_DIR: X, TZ: tz };
  const verb = await ab(['open', `${ORIGIN}/probe?k=${tag}`], env);
  const [r] = await reportsOf((x) => x.k === tag, 1, 20000);
  F.zone[tag] = { asked: tz, verb: verb.ok ? 'ok' : verb.err, pageZone: r ? r.zone : null, chrome: chromeEnvUnder(H) };
  await ab(['close'], env, 20000);
}
const z1 = F.zone.tz1.pageZone, z2 = F.zone.tz2.pageZone, own = Intl.DateTimeFormat().resolvedOptions().timeZone;
F.zoneReaches = z1 === 'Asia/Tokyo' && z2 === 'America/Sao_Paulo' ? 'yes' : z1 && z1 === z2 ? 'no' : 'unclear';
ok(!!z1 && !!z2, `① THE ZONE ON THE DRIVER ROAD ran: both worlds' pages answered (${z1} · ${z2}); this process's own zone ${own}`, F.zone);
ok(F.zoneReaches !== 'unclear', `① CONTROL: the two worlds read apart (TZ reaches Chrome) or the same (it does not) — never a mix: «${F.zoneReaches}»`, F.zone);

// ── ② THE LANGUAGE KEPT IN THE PROFILE ──
const prefsLang = (udd) => { try { const j = JSON.parse(fs.readFileSync(path.join(udd, 'Default', 'Preferences'), 'utf8')); return j.intl && 'accept_languages' in j.intl ? j.intl.accept_languages : '(absent)'; } catch { return '(no Preferences)'; } };
const langOf = async (tag, args, k) => { const c = await chrome(tag, args); await c.cdp.send('Target.createTarget', { url: `${ORIGIN}/probe?k=${k}` }); const [r] = await reportsOf((x) => x.k === k, 1, 10000); await stop(c); return { langs: r ? r.langs : null, prefs: prefsLang(c.udd) }; };
F.lang = { first: await langOf('lang', ['--lang=ja-JP', '--accept-lang=ja-JP'], 'lang1'), second: await langOf('lang', [], 'lang2'), fresh: await langOf('langctl', [], 'lang3') };
const first0 = (F.lang.first.langs || [])[0], second0 = (F.lang.second.langs || [])[0], fresh0 = (F.lang.fresh.langs || [])[0];
F.langKept = first0 === 'ja-JP' && second0 === 'ja-JP' ? 'yes' : first0 === 'ja-JP' && second0 === fresh0 ? 'no' : 'unclear';
ok(first0 === 'ja-JP' && !!second0 && !!fresh0, `② THE LANGUAGE ran: the switched start answers ${J(F.lang.first.langs)}, the next start without the switch ${J(F.lang.second.langs)}, a fresh profile ${J(F.lang.fresh.langs)}`, F.lang);
ok(fresh0 !== 'ja-JP' && F.langKept !== 'unclear', `② CONTROL: a fresh profile is not Japanese (${fresh0}), so the next start reads as kept or as the box's: «${F.langKept}»`, F.lang);

// ── ③ THE WATCH'S GAP ──
async function gap(tag, road) {
  const c = await chrome(tag, []);
  const timeline = [];
  await c.cdp.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'granted', origin: ORIGIN });   // the person's earlier grant
  if (road === 'A') {
    await c.cdp.send('Target.setDiscoverTargets', { discover: true });
    c.cdp.on(async (m) => {
      if (m.method !== 'Target.targetCreated' || m.params.targetInfo.type !== 'page') return;
      const t0 = Date.now();
      try { const a = await c.cdp.send('Target.attachToTarget', { targetId: m.params.targetInfo.targetId, flatten: true }); await c.cdp.send('Emulation.setGeolocationOverride', PLACE, a.sessionId); timeline.push(Date.now() - t0); } catch (e) { timeline.push(`err ${String(e.message).slice(0, 60)}`); }
    });
  } else if (road === 'B') {
    c.cdp.on(async (m) => {
      if (m.method !== 'Target.attachedToTarget') return;
      const sid = m.params.sessionId, t0 = Date.now();
      try { if (m.params.targetInfo.type === 'page') await c.cdp.send('Emulation.setGeolocationOverride', PLACE, sid); } catch (e) { timeline.push(`err ${String(e.message).slice(0, 60)}`); }
      try { await c.cdp.send('Runtime.runIfWaitingForDebugger', {}, sid); } catch { /* not paused */ }
      timeline.push(Date.now() - t0);
    });
    await c.cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }
  const k = `gap-${tag}`;
  await c.cdp.send('Target.createTarget', { url: `${ORIGIN}/opener?k=${k}` });
  const got = await reportsOf((x) => x.k === k && x.i !== undefined, N_TABS, N_TABS * SPACING_MS + 10000);
  await stop(c);
  const hit = (x) => Math.abs(Number(x.lat) - PLACE.latitude) < 1e-6 && Math.abs(Number(x.lng) - PLACE.longitude) < 1e-6;
  return { tabs: got.length, overrides: got.filter(hit).length, misses: got.filter((x) => !hit(x)).map((x) => (x.err !== undefined ? `error ${x.err} after ${x.ms} ms (${x.vis})` : `a place after ${x.ms} ms (${x.vis})`)), hidden: got.filter((x) => x.vis !== 'visible').length, watchMs: timeline };
}
F.gap = { A: await gap('gapA', 'A'), B: await gap('gapB', 'B'), none: await gap('gapN', 'none') };
ok(F.gap.A.tabs === N_TABS && F.gap.B.tabs === N_TABS && F.gap.none.tabs === N_TABS, `③ THE WATCH'S GAP ran: every road's ${N_TABS} tabs answered their first read (A ${F.gap.A.tabs} · B ${F.gap.B.tabs} · none ${F.gap.none.tabs})`, F.gap);
ok(F.gap.none.overrides === 0, `③ CONTROL: with no override no first read gets the stand-in place (${F.gap.none.overrides} of ${F.gap.none.tabs}; the misses: ${J(F.gap.none.misses)}) — the leg can see a miss`, F.gap.none);
F.stop = F.gap.A.overrides < F.gap.A.tabs ? `STOP (主开发 r726): road A (today's watch) — ${F.gap.A.tabs - F.gap.A.overrides} of ${F.gap.A.tabs} first reads in a tab whose origin holds the permission did NOT get the override` : 'no stop on road A';

// ── the facts, whole ──
function J(v) { return JSON.stringify(v); }
console.log('\nFACT ① the zone on the driver road — TZ in the CLI\'s env reaches Chrome: ' + F.zoneReaches + ' · ' + J(F.zone));
console.log('FACT ② the language kept in the profile — a start without the switch keeps the earlier one: ' + F.langKept + ' · ' + J(F.lang));
console.log(`FACT ③ the watch's gap — road A (today's watch) ${F.gap.A.overrides}/${F.gap.A.tabs} first reads overridden (watch ${J(F.gap.A.watchMs)} ms; misses ${J(F.gap.A.misses)}) · road B (paused) ${F.gap.B.overrides}/${F.gap.B.tabs} (watch ${J(F.gap.B.watchMs)} ms; misses ${J(F.gap.B.misses)}) · none ${F.gap.none.overrides}/${F.gap.none.tabs}`);
console.log('FACT ③ ' + F.stop);
srv.close();
report();
