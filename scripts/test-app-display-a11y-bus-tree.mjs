#!/usr/bin/env node
// AN APP ON ITS OWN DISPLAY HAS AN ACCESSIBILITY BUS — the REAL tree read (lane app-display-a11y-bus, 2026-10-12, B-4a59
// piece 3). A pod's shape: a scratch Xvfb, NO user session bus and NO AT_SPI_BUS_ADDRESS anywhere, the companion plan's
// private bus (D.startPortalBus), the GTK fixture app launched with the env desktop-serve composes (the plan's appEnv +
// D.appA11yBus's) and the agent-side tree reader (window-targets snapshotTarget / actOnNode — the helper) in the env the
// engine gives a tree read of that record (WT.treeEnvOf).
//   ① WITH the launcher: the reader names the fixture's button + label; pressing the button BY THE TREE changes the label.
//   ② RED CONTROL — the .261 plan (no launcher on the bus): the app has no a11y bus, the reader in the engine's env for that
//      record (no own bus ⇒ the pod's global) cannot read it (helper_error / 0 nodes).
//   ③ teardown: the bus ends ⇒ nothing of the launcher / a11y daemon / registryd / app is left.
//   PNG (VS_A11Y_PNG): the fixture's display beside the tree the agent read.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, gtkRow } from './scratch.mjs';
const require = createRequire(import.meta.url);
const M = require('../src/desktop-apps.js');
const D = require('../src/desktop-display.js');
const WT = require('../src/window-targets.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIXTURE = new URL('./fixtures/window-target-app.py', import.meta.url).pathname;

const need = ['Xvfb', 'dbus-daemon', 'dbus-send', 'python3'].filter((b) => !D.binOnPath(b, { env: process.env }));
const lb = D.portalBins({ env: process.env, names: M.A11Y_BINS });
const pb = D.portalBins({ env: process.env });
if (need.length || !lb['at-spi-bus-launcher'] || !lb['at-spi2-registryd'] || !pb['xdg-desktop-portal']) {
  console.log(`test-app-display-a11y-bus-tree: SKIP — ${need.join(', ') || 'at-spi2-core / xdg-desktop-portal not installed'}`);
  process.exit(0);
}
const S = scratchDir('vs-ada11y-tree');
const RT = path.join(S, 'xrt'); fs.mkdirSync(RT, { recursive: true, mode: 0o700 });
const pod = { PATH: process.env.PATH, HOME: S, LANG: 'C.UTF-8', XDG_RUNTIME_DIR: RT, GIO_USE_VFS: 'local', GVFS_DISABLE_FUSE: '1' }; // §76: a private runtime dir — never the owner's; no user bus at all
const kids = [];
const sessionLeft = (sid) => spawnSync('ps', ['-o', 'pid,args', '--no-headers', '-s', String(sid)], { encoding: 'utf8' }).stdout.trim();

async function xvfb() {
  const xv = spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '640x420x24', '-nolisten', 'tcp'], { env: pod, stdio: ['ignore', 'pipe', 'ignore'] });
  kids.push(xv);
  return new Promise((res, rej) => { let b = ''; xv.stdout.on('data', (d) => { b += d; if (/\n/.test(b)) res(':' + b.trim()); }); setTimeout(() => rej(new Error('Xvfb gave no display in 5 s')), 5000); });
}
/** the app the way desktop-serve starts it on its own bus: the display + the plan's appEnv + the a11y bus's */
async function launch({ withLauncher }) {
  const display = await xvfb();
  const bins = withLauncher ? pb : { ...pb, 'at-spi-bus-launcher': null };
  const plan = M.portalPlan({ dir: path.join(S, withLauncher ? 'on' : 'off'), display, bins, a11y: await D.a11yBusAddress({ env: pod }), why: 'row' });
  const bus = await D.startPortalBus({ plan, env: { ...pod, DISPLAY: display } });
  kids.push(bus);
  const ab = await D.appA11yBus({ user: plan.appEnv.AT_SPI_BUS_ADDRESS || null, address: plan.address, env: pod });
  const rec = { id: 'da-a11y', display, ...(ab.bus ? { a11yBus: ab.bus } : {}), a11y: ab.a11y }; // the record's facts, as the bring-up writes them
  const app = spawn('python3', [FIXTURE], { env: { ...pod, DISPLAY: display, ...plan.appEnv, ...ab.appEnv, VS_WT_TITLE: 'a11y fixture' }, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(app);
  let err = ''; app.stderr.on('data', (d) => { err += d; });
  const pid = await new Promise((res) => { let b = ''; app.stdout.on('data', (d) => { b += d; const m = b.match(/READY (\d+)/); if (m) res(Number(m[1])); }); setTimeout(() => res(null), 10000); });
  return { display, plan, bus, ab, rec, app, pid, err: () => err };
}
const names = (nodes) => nodes.filter((n) => /button|label/.test(n.role)).map((n) => `${n.role}:${n.name}`);

let shot = null;
try {
  console.log('① WITH the launcher — a pod\'s app on its own session, read by the agent');
  const on = await launch({ withLauncher: true });
  ok(on.pid && on.ab.a11y === 'own' && /^unix:path=/.test(on.rec.a11yBus || ''), `the app is up (pid ${on.pid}); the record: a11y ${on.ab.a11y}, a11yBus ${(on.rec.a11yBus || '').slice(0, 70)}…`);
  await sleep(400);
  const env1 = WT.treeEnvOf(on.rec, pod);
  let r = null;
  // the push button's role is the name THIS box's AT-SPI gives it (B-4260 — scripts/fixtures/gtk-rows.json: "button"
  // on the hub's at-spi2-core 2.60, "push button" on AIDev's 2.52), never one box's spelling
  const PB = gtkRow().pushButtonRole;
  for (let i = 0; i < 10; i++) { r = await WT.snapshotTarget({ pids: [on.pid], budget: 300, env: env1 }); if (r.ok && names(r.snapshot.nodes).includes(`${PB}:Count`)) break; await sleep(300); }
  const seen = r && r.ok ? names(r.snapshot.nodes) : [];
  ok(seen.includes(`${PB}:Count`) && seen.includes('label:count 0'), `the tree reader on the app's bus names its widgets: ${seen.slice(0, 5).join(', ')} (${r && r.ok ? r.snapshot.nodes.length : 0} nodes)`);
  ok(!/Error retrieving accessibility bus address/.test(on.err()), 'the app found its a11y bus (no "Error retrieving accessibility bus address" warning)');
  const btn = r && r.ok ? r.snapshot.nodes.find((n) => n.role === PB && n.name === 'Count') : null;
  const entry = btn ? { pid: btn.pid ?? on.pid, path: btn.path, role: btn.role, name: btn.name } : null;
  const pick = btn ? WT.pickAction(btn.actions, null) : { ok: false };
  const a = entry && pick.ok ? await WT.actOnNode({ entry, verb: 'do_action', action: pick.index, env: env1 }) : { ok: false, why: `no Count node (${btn ? Object.keys(btn).join(',') : 'none'})` };
  await sleep(300);
  const r2 = await WT.snapshotTarget({ pids: [on.pid], budget: 300, env: env1 });
  ok(a.ok && r2.ok && names(r2.snapshot.nodes).includes('label:count 1'), `pressing Count BY THE TREE on the app's bus ⇒ the label reads "count 1" (${a.ok ? 'pressed' : a.why})`);
  if (process.env.VS_A11Y_PNG && r2.ok) {
    const px = path.join(S, 'display.png');
    const sh = await WT.screenshotDisplay({ xenv: { ...pod, DISPLAY: on.display }, out: px });
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const lines = r2.snapshot.nodes.map((n) => `${'  '.repeat(Math.min(6, (n.path || []).length))}${esc(n.role)} <b>${esc(n.name || '')}</b>`).join('\n');
    fs.writeFileSync(path.join(S, 'tree.html'), `<!doctype html><meta charset=utf-8><body style="margin:0;font:13px system-ui;background:#f4f4f5;display:flex;gap:16px;padding:16px">
<div><div style="font-weight:600;margin-bottom:6px">The app's own display (${esc(on.display)}, a pod: no user bus)</div>${sh.ok ? `<img src="display.png" style="border:1px solid #ccc;width:420px">` : esc(sh.why)}</div>
<div style="flex:1"><div style="font-weight:600;margin-bottom:6px">What the agent's tree read sees — on the app's a11y bus (rec.a11yBus)</div><pre style="background:#fff;border:1px solid #ccc;padding:8px;margin:0;font-size:12px">${lines}</pre>
<div style="margin-top:8px;color:#555">a11y: ${esc(on.ab.a11y)} · after pressing Count by the tree · RED control (no launcher): ${'{RED}'}</div></div></body>`);
    shot = { html: path.join(S, 'tree.html') };
  }
  on.bus.kill('SIGTERM'); on.app.kill('SIGTERM');
  let left = 'x';
  for (let i = 0; i < 60 && left; i++) { await sleep(50); left = sessionLeft(on.bus.pid); }
  ok(!left, '③ the bus ended ⇒ the launcher, its a11y daemon and registryd left with it');

  console.log('② RED CONTROL — the .261 plan (no a11y launcher on the private bus)');
  const off = await launch({ withLauncher: false });
  await sleep(600);
  const env0 = WT.treeEnvOf(off.rec, pod);
  const r0 = await WT.snapshotTarget({ pids: [off.pid], budget: 300, env: env0 });
  const n0 = r0.ok ? r0.snapshot.nodes.length : 0;
  ok(off.pid && !off.rec.a11yBus && env0 === pod && n0 === 0 && /Error retrieving accessibility bus address/.test(off.err()), `without the launcher: no a11yBus, the app warned it has no a11y bus, the reader got ${r0.ok ? `${n0} nodes` : `${r0.code}: ${(r0.why || '').slice(0, 90)}`}`);
  if (shot) shot.red = r0.ok ? `${n0} nodes` : `${r0.code} (${(r0.why || '').match(/Couldn't connect to accessibility bus|[^:]+$/)?.[0] || ''})`;
  off.bus.kill('SIGTERM'); off.app.kill('SIGTERM');
} catch (e) { ok(false, `the run: ${e.stack}`); }
finally { for (const k of kids) { try { k.kill('SIGTERM'); } catch { /* gone */ } } }

if (shot && process.env.VS_A11Y_PNG) {
  fs.writeFileSync(shot.html, fs.readFileSync(shot.html, 'utf8').replace('{RED}', String(shot.red || '?').replace(/</g, '&lt;')));
  const chrome = D.binOnPath('google-chrome', { env: process.env }) || D.binOnPath('chromium', { env: process.env });
  if (chrome) {
    const c = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(S, 'chrome')}`, '--window-size=1100,560', `--screenshot=${process.env.VS_A11Y_PNG}`, `file://${shot.html}`], { env: { ...pod, HOME: S }, encoding: 'utf8', timeout: 30000 });
    ok(fs.existsSync(process.env.VS_A11Y_PNG), `PNG ${process.env.VS_A11Y_PNG} (chrome rc ${c.status})`);
  }
}
await sleep(300);
try { fs.rmSync(S, { recursive: true, force: true }); } catch { /* left for the sweep */ }
console.log(`\ntest-app-display-a11y-bus-tree: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
