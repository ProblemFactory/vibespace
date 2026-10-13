#!/usr/bin/env node
// AN APP ON ITS OWN DISPLAY HAS AN ACCESSIBILITY BUS — where the user has none (lane app-display-a11y-bus, 2026-10-12,
// B-4a59 piece 3). On a fleet pod there is no user session bus and no a11y bus: a GTK app on its private session warned
// "Error retrieving accessibility bus address: …ServiceUnknown (org.a11y.Bus)" and the agent's tree reader died
// "Couldn't connect to accessibility bus" (SIGABRT ⇒ helper_error) — dialogs invisible again. The companion bus now
// activates org.a11y.Bus (at-spi-bus-launcher); the bring-up asks GetAddress once and the record keeps the address.
//   ① PURE — the plan's service row, a11yBusPlan (user / own / unavailable + the package; never a throw), a11yBusOf.
//   ② PURE — the reader's env: treeEnvOf / a11yBusesOf (an app's own bus, never a global; a junk address ⇒ base).
//   ③ CENSUS — every tree call of the window-targets engine runs in treeEnvOf's env (a grep of the source; RED control:
//      one call put back on the global env() is named).
//   ④ the REAL plan bus (D.startPortalBus, a pod's env: no user bus) — D.appA11yBus ⇒ 'own' + an address under the
//      plan's run/ dir; the launcher + its a11y daemon live in the bus's session and leave with it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const M = require('../src/desktop-apps.js');
const D = require('../src/desktop-display.js');
const WT = require('../src/window-targets.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('① PURE — the a11y row of the plan, whose bus, the ask\'s answer');
const bins = { 'dbus-daemon': '/usr/bin/dbus-daemon', 'xdg-desktop-portal': '/x/xdp', 'xdg-desktop-portal-gtk': '/x/xdpg', 'at-spi-bus-launcher': '/usr/libexec/at-spi-bus-launcher' };
const pl = M.portalPlan({ dir: '/d/da-1', display: ':7', bins, why: 'flatpak' });
const svc = pl.files.find((f) => f.file === '/d/da-1/portal/services/org.a11y.Bus.service');
ok(pl.ok && svc && svc.text === '[D-BUS Service]\nName=org.a11y.Bus\nExec=/usr/libexec/at-spi-bus-launcher\n', 'portalPlan: org.a11y.Bus is ACTIVATABLE on the private bus (the launcher binary, no shell)');
const noL = M.portalPlan({ dir: '/d/da-1', display: ':7', bins: { ...bins, 'at-spi-bus-launcher': null } });
ok(noL.ok && !noL.files.some((f) => /org\.a11y\.Bus/.test(f.file)), 'no launcher on this machine ⇒ no service file — the portal still starts');
ok(M.PORTAL_BINS.includes('at-spi-bus-launcher') && M.A11Y_BINS.join() === 'at-spi-bus-launcher,at-spi2-registryd' && M.A11Y_BUS_NAME === 'org.a11y.Bus', 'the launcher is probed with the portal binaries (PATH, then /usr/libexec); registryd is required too');
const both = { 'at-spi-bus-launcher': '/l', 'at-spi2-registryd': '/r' };
const u = M.a11yBusPlan({ user: 'unix:path=/run/user/1000/at-spi/bus_0', bins: both });
ok(u.a11y === 'user' && !u.ask, 'the user HAS an a11y bus ⇒ \'user\', nothing asked (today\'s behaviour: the plan hands the user\'s address)');
const o = M.a11yBusPlan({ user: null, bins: both });
ok(o.a11y === 'own' && o.ask, 'no user a11y bus (a pod) + at-spi2-core here ⇒ \'own\': ask the private bus');
let threw = null, miss = null;
try { miss = [M.a11yBusPlan({ bins: { 'at-spi2-registryd': '/r' } }), M.a11yBusPlan({ bins: null }), M.a11yBusPlan()]; } catch (e) { threw = e; }
ok(!threw && miss.every((m) => !m.ask && /^unavailable: .*not found on this machine \(package at-spi2-core\)$/.test(m.a11y)) && miss[0].a11y.startsWith('unavailable: at-spi-bus-launcher not found'), `RED CONTROL: the launcher missing ⇒ the plan SAYS unavailable with the package, never a throw ("${miss && miss[0].a11y}")`);
const addr = 'unix:path=/d/da-1/portal/run/at-spi/bus_7,guid=ab';
const got = M.a11yBusOf({ plan: o, got: addr });
ok(got.a11y === 'own' && got.bus === addr && got.appEnv.AT_SPI_BUS_ADDRESS === addr, 'the ask answered ⇒ the record keeps the address (a11yBus) and the app is handed AT_SPI_BUS_ADDRESS');
ok(M.a11yBusOf({ plan: o, got: null }).a11y.startsWith('unavailable: the private bus gave no org.a11y.Bus address') && M.a11yBusOf({ plan: o, got: 'tcp:host=x' }).bus === null, 'no answer / a non-unix answer ⇒ unavailable, nothing handed');
ok(M.a11yBusOf({ plan: u }).a11y === 'user' && !Object.keys(M.a11yBusOf({ plan: u }).appEnv).length && M.a11yBusOf({ plan: miss[0] }).a11y === miss[0].a11y, '\'user\' / \'unavailable\' hand nothing over the plan\'s appEnv');

console.log('② PURE — the reader\'s env: the app\'s own bus, never a global');
const base = { PATH: '/bin', AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/1000/at-spi/bus_0' };
ok(WT.treeEnvOf({ a11yBus: addr }, base).AT_SPI_BUS_ADDRESS === addr && WT.treeEnvOf({ a11yBus: addr }, base).PATH === '/bin', 'a record with its own a11y bus ⇒ the tree read runs on THAT address');
ok(WT.treeEnvOf({}, base) === base && WT.treeEnvOf(null, base) === base && WT.treeEnvOf({ a11yBus: 'tcp:host=evil' }, base) === base, 'no own bus (the user\'s desktop apps, agent browsers) / a junk address ⇒ the base env unchanged');
ok(WT.a11yBusesOf([{ a11yBus: addr }, { a11yBus: addr }, {}, null, { a11yBus: 'x' }]).join() === addr, 'a11yBusesOf: the distinct own buses (the listing reads each once)');

console.log('③ CENSUS — every tree call of the engine runs in treeEnvOf\'s env');
const ENGINE = fs.readFileSync(new URL('../src/server/window-targets-engine.js', import.meta.url), 'utf8');
const TREE_CALLS = /wt\.(probeA11y|snapshotTarget|actOnNode|focusNode|focusedNode|runHelper)\(([^;]*?)env: ([^,}]+)/g;
const census = (src) => {
  const rows = [...src.matchAll(TREE_CALLS)].map((m) => ({ call: m[1], env: m[3].trim(), line: src.slice(0, m.index).split('\n').length }));
  const fnOf = (line) => { const pre = src.split('\n').slice(0, line).reverse().find((l) => /^ {2}(async )?function \w+/.test(l)); return pre ? pre.match(/function (\w+)/)[1] : '?'; };
  return rows.map((r) => ({ ...r, fn: fnOf(r.line) })).map((r) => {
    const tree = /^WT\.treeEnvOf\(/.test(r.env) || (r.env === 'base' && r.fn === 'act' && /const base = WT\.treeEnvOf\(rec, env\(\)\)/.test(src))
      || (r.fn === 'list' && (r.env === 'base' || /WT\.treeEnvOf\(\{ a11yBus: bus \}, base\)/.test(r.env))); // list: the user's bus for the desktop class + each own bus
    return { ...r, verdict: tree ? 'ok' : 'RED' };
  });
};
const rows = census(ENGINE);
for (const r of rows) console.log(`    ${r.verdict === 'RED' ? '✗' : '·'} ${r.fn}: wt.${r.call} env: ${r.env.slice(0, 50)}`);
ok(rows.length >= 9 && rows.every((r) => r.verdict === 'ok') && ['probeMode', 'snapshot', 'act', 'list'].every((f) => rows.some((r) => r.fn === f)), `${rows.length} tree calls (probeMode, snapshot, act's node verbs, list) — every one on treeEnvOf's env`);
const mutant = ENGINE.replace('env: WT.treeEnvOf(rec, env()), ...helperOpts() });\n    const held', 'env: env(), ...helperOpts() });\n    const held');
const red = census(mutant).filter((r) => r.verdict === 'RED');
ok(mutant !== ENGINE && red.length === 1 && red[0].fn === 'snapshot' && red[0].call === 'snapshotTarget', `RED CONTROL: snapshot's read put back on the global env() ⇒ RED on exactly it (${red.map((r) => `${r.fn}:${r.call}`).join(', ')})`);

console.log('④ the REAL plan bus — a pod\'s env (no user bus): D.appA11yBus');
const need = ['dbus-daemon', 'dbus-send'].filter((b) => !D.binOnPath(b, { env: process.env }));
const lb = D.portalBins({ env: process.env, names: M.A11Y_BINS });
const pb = D.portalBins({ env: process.env });
const skip = need.length ? `${need.join(', ')} not on PATH` : !lb['at-spi-bus-launcher'] || !lb['at-spi2-registryd'] ? 'at-spi2-core not installed' : !pb['xdg-desktop-portal'] ? 'xdg-desktop-portal not installed' : null;
if (skip) console.log(`  SKIP ④ — ${skip}`);
else {
  const S = scratchDir('vs-ada11y-fast');
  const RT = path.join(S, 'xrt'); fs.mkdirSync(RT, { recursive: true, mode: 0o700 });
  const pod = { PATH: process.env.PATH, HOME: S, LANG: 'C.UTF-8', XDG_RUNTIME_DIR: RT }; // §76: a private runtime dir — never the owner's
  const plan = M.portalPlan({ dir: path.join(S, 'app'), display: ':0', bins: pb, why: 'row' });
  let child = null;
  try {
    child = await D.startPortalBus({ plan, env: pod });
    const t0 = Date.now();
    const ab = await D.appA11yBus({ user: null, address: plan.address, env: pod });
    const ms = Date.now() - t0;
    ok(ab.a11y === 'own' && ab.bus && ab.bus.startsWith(`unix:path=${path.join(S, 'app', 'portal', 'run')}/`) && ab.appEnv.AT_SPI_BUS_ADDRESS === ab.bus, `appA11yBus on the plan's bus ⇒ own, the address under the plan's run/ dir (${ms} ms: GetAddress activated the launcher)`);
    const ps = spawnSync('ps', ['-o', 'args', '--no-headers', '-s', String(child.pid)], { encoding: 'utf8' }).stdout;
    ok(/at-spi-bus-launcher/.test(ps) && /accessibility\.conf/.test(ps), 'the launcher and its a11y dbus-daemon run in the private bus\'s session');
    const kept = await D.appA11yBus({ user: 'unix:path=/run/user/1000/at-spi/bus_0', address: plan.address, env: pod });
    ok(kept.a11y === 'user' && kept.bus === null, 'the user\'s address given ⇒ \'user\' (nothing asked)');
    child.kill('SIGTERM');
    let left = 'x';
    for (let i = 0; i < 40 && left; i++) { await sleep(50); left = spawnSync('ps', ['-o', 'args', '--no-headers', '-s', String(child.pid)], { encoding: 'utf8' }).stdout.trim(); }
    ok(!left, 'the bus ended ⇒ the launcher, its a11y daemon and registryd are gone with it (nothing left in the session)');
  } catch (e) { ok(false, `the plan's bus: ${e.message}`); try { child?.kill('SIGKILL'); } catch { /* gone */ } }
  try { fs.rmSync(S, { recursive: true, force: true }); } catch { /* left for the sweep */ }
}

console.log(`\ntest-app-display-a11y-bus: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
