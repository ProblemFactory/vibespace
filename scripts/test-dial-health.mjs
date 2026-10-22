#!/usr/bin/env node
// A SECOND AGENT WITH AN OLD TOKEN IS NAMED (lane host-stale-dialer, B-6136, 2026-10-12). The owner's Macbook ran its live
// agent AND a leftover one with a generation-1 token; the hub refused the old one every 30 s for a day and only the
// journal knew. PURE src/dial-health.js judges (secondDialerVerdict + the row's facts + the stop recipes), the server
// module src/server/dial-health-watch.js files ONE For-you item per episode (across boots) and rate-limits the journal.
// Over the REAL HostManager + UserTodoManager, in-process, on a hand clock. Controls are patched copies (mutant-copy.mjs).
// lane mac-repair-retires-stale (B-06e9, the owner's Macbook 2026-10-18: FOUR installs, three stale): the row and the item
// name the LIVE install (`device@<the host the current token was minted for>`), the recipe stops the agent ITSELF by its
// lock pid (the launch item is only a supervisor — the agent runs detached), and both say the door (a re-pair retires them).
// lane device-node-version (the Node.js security releases of 2026-10-21): THE FLOOR TABLE (PURE src/device-runtime.js) —
// below / at / above the floor per major line, an unlisted major and a daemon that said nothing ⇒ no chip, whose node it is
// ⇒ the recipe; the record (`deviceRuntime`, the REAL HostManager: persisted when it moved, the row's `runtime` offline
// too); the card's words in zh + ja and its CSS on theme vars; two patched-copy controls (at-the-floor read as old, a
// lexicographic compare).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DH = require('../src/dial-health.js');
const HW = require('../src/server/dial-health-watch.js');
// lane agent-context-owner-facts (B-7960 a): the item's «since» is the owner's clock, named — this fixture's instance runs in UTC
// (its pins), never whatever zone the box running the suite is in
require('../src/server/owner-facts.js').configure({ setting: (k) => (k === 'instance.timezone' ? 'UTC' : undefined) });
const { UserTodoManager } = require('../src/user-todos.js');
const { HostManager } = require('../src/hosts.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dhl-'));
const NOW = Date.parse('2026-10-12T10:00:00Z');
const MIN = 60000;
// the production record's shape (data/hosts.json host-dial-Macbook, 2026-10-12): an accept with daemon facts, a refusal without
const acc = (at) => ({ at, from: '100.101.102.103', attempt: 0, daemon: '2.369.257', platform: 'darwin' });
const ref = (at, since = at) => ({ code: 'token-mismatch', at, since, from: '100.101.102.103', attempt: 0, daemon: null, platform: null, dialed: null });

console.log('— PURE: the verdict table —');
const TABLE = [
  ['connected + a refusal newer than the accept ⇒ second dialer', { lastAccept: acc(NOW - 50 * MIN), lastRefusal: ref(NOW - 20e3, NOW - 15 * 3600e3), connected: true }, 'second-dialer-stale-token'],
  ['NOT connected but accepted 90 s ago + a newer refusal ⇒ second dialer (the brief\'s 2-min rule)', { lastAccept: acc(NOW - 90e3), lastRefusal: ref(NOW - 10e3), connected: false }, 'second-dialer-stale-token'],
  ['disconnected + a refusal newer than the accept ⇒ stale-token (re-pair)', { lastAccept: acc(NOW - 50 * MIN), lastRefusal: ref(NOW - 20e3), connected: false }, 'stale-token'],
  ['never accepted + a refusal ⇒ stale-token', { lastAccept: null, lastRefusal: ref(NOW - 20e3), connected: false }, 'stale-token'],
  ['an accept newer than the refusal ⇒ none', { lastAccept: acc(NOW - 10e3), lastRefusal: ref(NOW - 20e3), connected: true }, 'none'],
  ['connected, the refusal stopped 3 min ago ⇒ none (the extra agent is gone)', { lastAccept: acc(NOW - 50 * MIN), lastRefusal: ref(NOW - 3 * MIN), connected: true }, 'none'],
  ['connected + a duplicate-device refusal ⇒ none (B9 names that one)', { lastAccept: acc(NOW - 50 * MIN), lastRefusal: { ...ref(NOW - 20e3), code: 'duplicate-device' }, connected: true }, 'none'],
  ['no refusal ⇒ none', { lastAccept: acc(NOW - 50 * MIN), lastRefusal: null, connected: true }, 'none'],
];
const runTable = (M) => TABLE.map(([name, inp, want]) => [name, M.secondDialerVerdict({ ...inp, now: NOW }).kind, want]);
for (const [name, got, want] of runTable(DH)) ok(got === want, `DH-${TABLE.findIndex((r) => r[0] === name) + 1}: ${name} (${got})`);
{
  const v = DH.secondDialerVerdict({ ...TABLE[0][1], now: NOW });
  ok(v.from === '100.101.102.103' && v.since === NOW - 15 * 3600e3 && v.every === 30, 'DH-9: the verdict names the address, since when (the run\'s start, not the last knock) and the 30-s period', v);
}

console.log('— PURE: the row\'s facts + the stop recipe per platform (the live install named; the agent itself stopped) —');
const LIVE_BASE = 'https://hub.example.invalid:8443';
const KILL = 'kill $(cat ~/.vibespace/device@<x>/state/agentd.lock)';
const rowHost = (platform, base = null) => ({ id: 'host-dial-M', name: 'Macbook', transport: 'dial', deviceId: 'Macbook', dial: { lastAccept: { ...acc(NOW - 50 * MIN), platform }, lastRefusal: ref(NOW - 20e3), ...(base ? { mintedBase: base } : {}) } });
const rowsOf = (M) => ({ mac: M.dialHealthRow(rowHost('darwin'), { connected: true, now: NOW }), macLive: M.dialHealthRow(rowHost('darwin', LIVE_BASE), { connected: true, now: NOW }) });
{
  const { mac, macLive } = rowsOf(DH);
  ok(mac && mac.kind === 'second-dialer-stale-token' && mac.live === null && mac.recipe === `ls ~/.vibespace | grep '^device@'\nlaunchctl bootout gui/$(id -u)/cc.vibespace.device.device-<x>\n${KILL}`, 'ROW-1: darwin, no minted base on record ⇒ every install listed, the launch item booted out AND the agent killed by its lock pid (bootout alone leaves the detached agent dialing)', mac);
  ok(macLive && macLive.live === 'device@hub.example.invalid' && macLive.recipe.split('\n')[0] === "ls ~/.vibespace | grep '^device@' | grep -vxF 'device@hub.example.invalid'" && macLive.recipe.endsWith(KILL), 'ROW-1b: darwin + `dial.mintedBase` ⇒ `live` = device@<that host>, and the listing line leaves the live install out (the ones to stop, each <x>)', macLive);
  const lin = DH.dialHealthRow(rowHost('linux', LIVE_BASE), { connected: true, now: NOW });
  ok(lin.recipe === `ls ~/.vibespace | grep '^device@' | grep -vxF 'device@hub.example.invalid'\nsystemctl --user disable --now vibespace-device-device-<x>.service\n${KILL}`, 'ROW-2: linux ⇒ the user unit disabled + the agent killed by its lock pid', lin.recipe);
  const win = DH.dialHealthRow(rowHost('win32', LIVE_BASE), { connected: true, now: NOW });
  ok(/Where-Object \{ \$_ -ne 'device@hub\.example\.invalid' \}\nUnregister-ScheduledTask -TaskName 'VibeSpaceDevice-<x>' -Confirm:\$false\nStop-Process -Id \(Get-Content "\$env:USERPROFILE\\\.vibespace\\device@<x>\\state\\agentd\.lock"\)$/.test(win.recipe), 'ROW-3: windows ⇒ the scheduled task unregistered + the agent stopped by its lock pid', win.recipe);
  ok(DH.dialHealthRow(rowHost(null, LIVE_BASE), { connected: true, now: NOW }).recipe === null && DH.dialHealthRow(rowHost(null, LIVE_BASE), { connected: true, now: NOW }).live === 'device@hub.example.invalid', 'ROW-4: an unknown platform ⇒ the line without a recipe (no Copy) — the live install still named');
  ok(DH.dialHealthRow(rowHost('darwin'), { connected: false, now: NOW }) === null, 'ROW-5: disconnected ⇒ no second-dialer line (the row\'s own REFUSED state says re-pair)');
  // the installer's rule (scripts/vibespace-agentd-install.sh: ROOT=device@<the dial host, [A-Za-z0-9.-] kept>, KEY = its basename
  // with every other byte → '-', the plist cc.vibespace.device.$KEY / the unit vibespace-device-$KEY.service; the ps1 task VibeSpaceDevice-<host>)
  const LI = [['http://192.0.2.10:3456', 'device@192.0.2.10'], ['wss://hub.example.invalid/api/device-dial?device=x', 'device@hub.example.invalid'], ['ws://[2001:db8::1]:3456/api/device-dial', 'device@2001'], ['', null], ['not a url', null]];
  const sh = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.sh'), 'utf8'), ps1 = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.ps1'), 'utf8');
  const shHost = (u) => spawnSync('bash', ['-c', `printf '%s' "$1" | sed -E 's|^[a-z]+://([^/:?]+).*|\\1|' | tr -cd 'A-Za-z0-9.-'`, 'x', u], { encoding: 'utf8' }).stdout;
  ok(LI.every(([u, want]) => DH.liveInstallOf(u) === want && (want === null || 'device@' + shHost(u) === want)) && sh.includes(`DIAL_HOST=$(printf '%s' "$DIAL_URL" | sed -E 's|^[a-z]+://([^/:?]+).*|\\1|' | tr -cd 'A-Za-z0-9.-')`) && sh.includes('ROOT="$HOME/.vibespace/device@${DIAL_HOST:-dial}"') && sh.includes(`KEY=$(basename "$ROOT" | tr -c 'A-Za-z0-9.-' '-' | sed 's/-*$//')`) && sh.includes('LABEL="cc.vibespace.device.$KEY"') && sh.includes('UNIT="vibespace-device-$KEY.service"') && ps1.includes('$task = "VibeSpaceDevice-$dialHost"'), 'ROW-6: liveInstallOf is the installer\'s own root rule (the SAME sed + tr run by bash on each base) and the recipe\'s label / unit / task names are the installers\' own', LI.map(([u]) => [u, DH.liveInstallOf(u), shHost(u)]));
  // ROW-7: the recipe RUN by a real shell in a scratch HOME — the listing line names only the others; the kill line stops the
  // detached agent of the install it names (a scratch node whose argv names vibespace-device), never the live one's
  const H = fs.mkdtempSync(path.join(SCR, 'home-'));
  for (const d of ['device@hub.example.invalid', 'device@192.0.2.10', 'device@old.example.invalid', 'agentd', 'disabled-launchagents']) fs.mkdirSync(path.join(H, '.vibespace', d, 'state'), { recursive: true });
  const agent = () => { const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e6)', 'vibespace-device'], { stdio: 'ignore', detached: true }); c.unref(); return c; };
  const stale = agent(), live = agent();
  fs.writeFileSync(path.join(H, '.vibespace', 'device@192.0.2.10', 'state', 'agentd.lock'), String(stale.pid));
  fs.writeFileSync(path.join(H, '.vibespace', 'device@hub.example.invalid', 'state', 'agentd.lock'), String(live.pid));
  const [listLine, , killLine] = macLive.recipe.split('\n');
  const listed = spawnSync('bash', ['-c', listLine], { encoding: 'utf8', env: { ...process.env, HOME: H } }).stdout.trim().split('\n');
  spawnSync('bash', ['-c', killLine.replace(/<x>/g, '192.0.2.10')], { env: { ...process.env, HOME: H } });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  let gone = false; for (let i = 0; i < 40 && !gone; i++) { gone = !alive(stale.pid); if (!gone) await new Promise((r) => setTimeout(r, 50)); }
  ok(JSON.stringify(listed) === JSON.stringify(['device@192.0.2.10', 'device@old.example.invalid']) && gone && alive(live.pid), 'ROW-7: bash runs the copied recipe in a scratch HOME — the listing names the two others (not the live one, not agentd/ nor disabled-launchagents/); the kill line with <x> = 192.0.2.10 stops THAT agent; the live agent keeps running', { listed, staleGone: gone, liveAlive: alive(live.pid) });
  for (const c of [stale, live]) { try { process.kill(c.pid, 'SIGKILL'); } catch { } }
}

console.log('— the words: every key the line / item uses, in zh and ja —');
{
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const it = HW.itemOf({ machine: 'Macbook', from: '100.101.102.103', since: NOW - 15 * 3600e3, every: 30, live: 'device@hub.example.invalid' });
  const keys = [it.i18n.text.key, ...it.i18n.detail.map((d) => d.key), 'Copy the stop command', 'Copied — run it on that machine'];
  const itNo = HW.itemOf({ machine: 'Macbook', from: '100.101.102.103', since: NOW - 15 * 3600e3, every: 30 });
  ok(it.i18n.detail.length === 4 && /The live install on that machine is device@hub\.example\.invalid; stop the others — the stop command stops its launch item and the agent itself\./.test(it.detail) && /Re-pairing this machine from its Machines card retires the older installs of this hub for you/.test(it.detail) && itNo.i18n.detail.length === 3 && !/live install/.test(itNo.detail) && /Re-pairing this machine/.test(itNo.detail), 'W-0 (lane mac-repair-retires-stale): the item names the live install when the record knows it, and always says the door — a re-pair retires them', [it.detail, itNo.detail]);
  const miss = keys.filter((k) => !zh[k] || !ja[k]);
  ok(!miss.length, `W-1: ${keys.length} keys in both dictionaries`, miss);
  ok(zh[it.i18n.detail[0].key].startsWith('另一个 VibeSpace agent 也在从 {from} 用旧的 token 拨入（每 {every} 秒被拒，自 {since}）'), 'W-2: the zh line is the brief\'s sentence');
  const SM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(SM.includes(`tr('${it.i18n.detail[0].key}'`) && SM.includes(`dh.live ? tr('${it.i18n.detail[2].key}', { live: dh.live }) : ''`) && SM.includes(`tr('${it.i18n.detail[3].key}')`) && SM.includes('if (h.dialHealth) row.appendChild(secondDialerLine(h.dialHealth));') && SM.includes('glyph.innerHTML = UI_ICONS.alert;') && SM.includes('copyText(dh.recipe)'), 'W-3: the row painter draws the same sentences (+ the live install, + the door), the icons.js glyph and Copies the recipe (never runs it)');
  const css = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8').split('\n').filter((l) => l.startsWith('.mounts-second-dialer'));
  ok(css.length >= 3 && css.every((l) => !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(l)), `W-4: the line's CSS (${css.length} rules) uses theme vars only`);
}

console.log('— hosts.js: the refusal run keeps `since`; the row carries `dialHealth` (the REAL HostManager) —');
{
  const dir = fs.mkdtempSync(path.join(SCR, 'h-'));
  fs.writeFileSync(path.join(dir, 'hosts.json'), JSON.stringify({ hosts: [{ id: 'host-dial-Macbook', name: 'Macbook', transport: 'dial', deviceId: 'Macbook' }] }));
  const hm = new HostManager({ dataDir: dir });
  let live = false; hm.dialOnline = () => live;
  const t0 = Date.now();
  hm.noteDial('Macbook', 'refused', { at: t0 - 40 * MIN, from: '100.101.102.103', code: 'token-mismatch' });
  hm.noteDial('Macbook', 'accepted', { at: t0 - 39 * MIN, from: '100.101.102.103', daemon: '2.369.257', platform: 'darwin' });
  live = true;
  hm.noteDial('Macbook', 'refused', { at: t0 - 31 * MIN, from: '100.101.102.103', code: 'token-mismatch' });
  for (let i = 30; i >= 0; i -= 0.5) hm.noteDial('Macbook', 'refused', { at: t0 - i * MIN, from: '100.101.102.103', code: 'token-mismatch' });
  const lr = hm.findByDeviceId('Macbook').dial.lastRefusal;
  ok(lr.since === t0 - 40 * MIN && lr.at === t0, 'H-1: knocks before the accept and 63 after it, never 10 min apart ⇒ ONE run: `since` = its first knock (the production shape: since Oct 11 18:26, the accept Oct 12 09:15)', { since: lr.since, at: lr.at });
  const w = HW.create({ dataDir: dir, hosts: hm, tickMs: 0 });
  const row = hm.list()[0];
  ok(row.dialHealth && row.dialHealth.kind === 'second-dialer-stale-token' && row.dialHealth.platform === 'darwin' && /launchctl/.test(row.dialHealth.recipe) && row.dialHealth.live === null, 'H-2: hosts.list() row carries `dialHealth` (darwin recipe) while connected', row.dialHealth);
  hm.noteDial('Macbook', 'minted', { at: t0 - 45 * MIN, host: '192.0.2.10:3456', base: 'http://192.0.2.10:3456' }); // the CURRENT command was minted for this base
  hm.noteDial('Macbook', 'accepted', { at: t0 - 39 * MIN, from: '100.101.102.103', daemon: '2.369.257', platform: 'darwin' });
  hm.noteDial('Macbook', 'refused', { at: t0, from: '100.101.102.103', code: 'token-mismatch' });
  const row2 = hm.list()[0];
  ok(row2.dialHealth && row2.dialHealth.live === 'device@192.0.2.10' && row2.dialHealth.recipe.startsWith("ls ~/.vibespace | grep '^device@' | grep -vxF 'device@192.0.2.10'"), 'H-2b (lane mac-repair-retires-stale): a mint stamps `dial.mintedBase` ⇒ the row names device@<its host> as the live install and its recipe lists the others', row2.dialHealth);
  live = false;
  ok(!('dialHealth' in hm.list()[0]), 'H-3: the link gone ⇒ no `dialHealth` (the row\'s REFUSED state speaks)');
  hm.noteDial('Macbook', 'refused', { at: t0 + 20 * MIN, from: '100.101.102.103', code: 'token-mismatch' });
  ok(hm.findByDeviceId('Macbook').dial.lastRefusal.since === t0 + 20 * MIN, 'H-4: a knock after a 20-min gap starts a new run');
  w.stop();
}

console.log('— For you: ONE item per episode, across two boots; resolved after 10 clear minutes —');
const world = (Mod = HW, dir = fs.mkdtempSync(path.join(SCR, 'w-'))) => {
  let clock = NOW, logs = [];
  const todos = new UserTodoManager({ dataDir: dir });
  const mk = () => Mod.create({ userTodos: todos, dataDir: dir, log: (l) => logs.push(l), now: () => clock, tickMs: 0 });
  const open = () => todos._state.items.filter((t) => t.status === 'open' && t.sessionKey === 'machines');
  return { dir, todos, mk, open, tick: (ms) => { clock += ms; return clock; }, now: () => clock, logs: () => logs };
};
const macHost = (w, { refAt, since } = {}) => ({ id: 'host-dial-Macbook', name: 'Macbook', transport: 'dial', deviceId: 'Macbook', dial: { lastAccept: acc(NOW - 50 * MIN), lastRefusal: ref(refAt ?? w.now() - 10e3, since ?? NOW - 15 * 3600e3) } });
{
  const W = world();
  let a = W.mk();
  a.observe(macHost(W), { connected: true });
  for (let i = 0; i < 6; i++) { W.tick(30e3); a.observe(macHost(W), { connected: true }); }
  ok(W.open().length === 1, 'FY-1: the first second-dialer verdict files ONE item; 6 more knocks file nothing', W.open().map((t) => t.text));
  ok(/^Macbook: a second VibeSpace agent keeps dialing in with an old token$/.test(W.open()[0].text) && /from 100\.101\.102\.103 .*every 30 s since 2026-10-11 19:00 UTC/.test(W.open()[0].detail), 'FY-2: the item names the machine, the address, the period and since when', W.open()[0]);
  a.stop();
  const b = W.mk(); // boot 2: same data dir, a new process
  W.tick(30e3); b.observe(macHost(W), { connected: true });
  ok(W.open().length === 1, 'FY-3: a restart while it still knocks files NO second item (the ledger outlives the boot)');
  const id = W.open()[0].id;
  W.tick(3 * MIN); b.observe(macHost(W, { refAt: W.now() - 3 * MIN }), { connected: true });
  ok(W.open().length === 1, 'FY-4: the knocking stopped 3 min ago ⇒ the item stays (the clear clock started)');
  W.tick(5 * MIN); b.observe(macHost(W, { refAt: W.now() - 8 * MIN }), { connected: true });
  ok(W.open().length === 1, 'FY-5: 5 clear minutes ⇒ still open');
  W.tick(6 * MIN); b.observe(macHost(W, { refAt: W.now() - 14 * MIN }), { connected: true });
  ok(W.open().length === 0 && W.todos.get(id).status === 'done', 'FY-6: 10 clear minutes ⇒ resolved (`done`, by system)', W.todos.get(id));
  W.tick(MIN); b.observe(macHost(W), { connected: true });
  ok(W.open().length === 1, 'FY-7: it comes back later ⇒ a new episode, ONE open item again');
  // a dismissed item stays dismissed through the same episode (another boot included)
  W.todos.setStatus(W.open()[0].id, 'dismissed', 'user');
  const c = W.mk(); W.tick(30e3); c.observe(macHost(W), { connected: true });
  ok(W.open().length === 0, 'FY-8: dismissed by the owner ⇒ not filed again in that episode (boot 3)');
}

console.log('— the journal: the first line at once, then once per 10 min while the verdict holds —');
{
  const W = world(); const a = W.mk();
  const v = { kind: 'second-dialer-stale-token' };
  const seq = []; for (let i = 0; i < 41; i++) { seq.push(a.shouldLog('h', v)); W.tick(30e3); }
  ok(seq.filter(Boolean).length === 3 && seq[0] === true && seq[20] === true && seq[40] === true, `LOG-1: 41 knocks 30 s apart (20 min) ⇒ 3 lines at 0 / 10 / 20 min (${seq.map((x) => (x ? 'L' : '.')).join('')})`);
  ok(a.shouldLog('h', { kind: 'stale-token' }) && a.shouldLog('h', { kind: 'none' }), 'LOG-2: any other verdict keeps the address budget (logRefusal)');
  const DP = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8');
  const i1 = DP.indexOf("if (health && health.v.kind === 'second-dialer-stale-token') {"), i2 = DP.indexOf("logRefusal(facts, why === 'token-mismatch' ? deviceId : ''");
  ok(i1 > 0 && i2 > i1 && /getDialHealth\(\)\.shouldLog\(health\.h\.id, health\.v\)\) console\.log\(/.test(DP.slice(i1, i2)) && /\n      return null;\n    \}\n/.test(DP.slice(i1, i2)), 'LOG-3: dial-pairing\'s refusal road asks the verdict BEFORE logRefusal and returns (never both lines)');
}

console.log('— lane device-node-version: the node a machine\'s agent runs on (PURE src/device-runtime.js + the REAL HostManager) —');
{
  const DR = require('../src/device-runtime.js');
  const RT = [
    ['22 below its floor, its own node ⇒ old, re-install', { node: 'v22.22.0', own: true }, 'old', 'reinstall'],
    ['22 one patch below (22.23.3) ⇒ old', { node: 'v22.23.3', own: true }, 'old', 'reinstall'],
    ['22.9.9 (minor 9 < 23 — numbers, not text) ⇒ old', { node: 'v22.9.9', own: true }, 'old', 'reinstall'],
    ['22 AT its floor (22.23.4) ⇒ ok', { node: 'v22.23.4', own: true }, 'ok', null],
    ['22 above (22.24.0) ⇒ ok', { node: 'v22.24.0', own: false }, 'ok', null],
    ['24 below (24.12.0) on a node the machine had ⇒ old, the system recipe', { node: 'v24.12.0', own: false }, 'old', 'system'],
    ['24 AT its floor (24.22.1) ⇒ ok', { node: 'v24.22.1', own: false }, 'ok', null],
    ['24 above (24.23.0 — a higher minor, a lower patch) ⇒ ok', { node: 'v24.23.0', own: false }, 'ok', null],
    ['26 below (26.12.0), whose node not said (an older agent) ⇒ old, re-install', { node: 'v26.12.0', own: null }, 'old', 'reinstall'],
    ['26 AT its floor (26.12.1) ⇒ ok', { node: 'v26.12.1', own: null }, 'ok', null],
    ['26 above (27 is another line; 26.20.0) ⇒ ok', { node: 'v26.20.0', own: true }, 'ok', null],
    ['an unlisted major (20) ⇒ unlisted: no chip', { node: 'v20.19.5', own: false }, 'unlisted', null],
    ['an odd major (25) ⇒ unlisted: no chip', { node: 'v25.1.0', own: true }, 'unlisted', null],
    ['a major the table has not met yet (28) ⇒ unlisted: no chip', { node: 'v28.0.0', own: true }, 'unlisted', null],
    ['a daemon that said no node ⇒ unknown: no chip', { node: null, own: null }, 'unknown', null],
    ['a malformed version (no v) ⇒ unknown', { node: '22.22.0', own: true }, 'unknown', null],
  ];
  const runRT = (M) => RT.map(([name, inp, state, fix]) => { const v = M.runtimeVerdict(inp); return [name, v.state, v.fix, state, fix]; });
  runRT(DR).forEach(([name, s, f, ws, wf], i) => ok(s === ws && f === wf, `RT-${i + 1}: ${name} (${s}${f ? ' · ' + f : ''})`));
  ok(JSON.stringify(Object.keys(DR.NODE_FLOORS)) === '["22","24","26"]' && DR.NODE_FLOORS[22].floor === '22.23.4' && DR.NODE_FLOORS[24].floor === '24.22.1' && DR.NODE_FLOORS[26].floor === '26.12.1'
    && Object.values(DR.NODE_FLOORS).every((r) => r.advisory === 'nodejs-2026-10-21') && DR.ADVISORIES['nodejs-2026-10-21'].date === '2026-10-21'
    && DR.ADVISORIES['nodejs-2026-10-21'].cves.join(' ') === 'CVE-2026-111497 CVE-2026-105482 CVE-2026-105483 CVE-2026-106069' && Object.isFrozen(DR.NODE_FLOORS) && Object.isFrozen(DR.NODE_FLOORS[22]),
    'RT-T: the table IS the advisory — three lines (22 / 24 / 26), their fixed releases, the advisory\'s date and four CVE ids; frozen', DR.NODE_FLOORS);
  const bad = DR.runtimeOf({ node: 'v22.22.0\n', openssl: 'x'.repeat(41), own: 'yes', platform: 'plan9' });
  const good = DR.runtimeOf({ node: 'v22.22.0', openssl: '3.0.15+quic', own: true, platform: 'darwin' });
  ok(Object.values(bad).every((x) => x === null) && JSON.stringify(good) === '{"node":"v22.22.0","openssl":"3.0.15+quic","own":true,"platform":"darwin"}' && JSON.stringify(DR.runtimeOf(null)) === '{"node":null,"openssl":null,"own":null,"platform":null}',
    'RT-B: a statement is bounded — a malformed node / openssl / own / platform is not said (null)', { bad, good });
  const rowOf = (rt) => DR.runtimeRow({ deviceRuntime: rt });
  const lines = ['darwin', 'linux', 'win32'].map((p) => rowOf({ node: 'v24.12.0', own: false, platform: p, at: 5 }).line);
  ok(lines[0] === 'brew upgrade node' && lines[1].startsWith('sudo apt-get install --only-upgrade nodejs') && lines[2] === 'winget upgrade OpenJS.NodeJS.LTS' && rowOf({ node: 'v24.12.0', own: false }).line === null && rowOf({ node: 'v22.22.0', own: true, platform: 'darwin' }).line === null,
    'RT-R1: a system node below the floor carries its platform\'s upgrade line (none when the platform is not said; never for the installer\'s own node)', lines);
  const r1 = rowOf({ node: 'v22.22.0', openssl: '3.0.15+quic', own: true, platform: 'darwin', at: 1234 });
  ok(r1.state === 'old' && r1.fix === 'reinstall' && r1.openssl === '3.0.15+quic' && r1.own === true && r1.at === 1234 && r1.date === '2026-10-21' && r1.cves.length === 4 && r1.floor === '22.23.4'
    && DR.runtimeRow({}).state === 'unknown' && DR.runtimeRow({}).fix === null, 'RT-R2: the row = the verdict + what the agent said + the advisory; a record whose agent never said ⇒ unknown', r1);

  // the REAL HostManager: a dial device + an ssh machine
  const dir = fs.mkdtempSync(path.join(SCR, 'rt-'));
  fs.writeFileSync(path.join(dir, 'hosts.json'), JSON.stringify({ hosts: [{ id: 'host-dial-Macbook', name: 'Macbook', transport: 'dial', deviceId: 'Macbook' }, { id: 'host-ssh-box', name: 'box', transport: 'ssh', user: 'u', host: '192.0.2.7', port: 22 }] }));
  const hm = new HostManager({ dataDir: dir });
  hm.dialOnline = () => false;
  const said = { node: 'v22.22.0', openssl: '3.0.15+quic', own: true, platform: 'darwin' };
  const m1 = hm.noteRuntime('host-dial-Macbook', said);
  const disk1 = JSON.parse(fs.readFileSync(path.join(dir, 'hosts.json'), 'utf8')).hosts[0].deviceRuntime;
  const m2 = hm.noteRuntime('host-dial-Macbook', { ...said });
  const m3 = hm.noteRuntime('host-dial-Macbook', { ...said, openssl: '3.0.16+quic' });
  ok(m1 === true && disk1 && disk1.node === 'v22.22.0' && disk1.own === true && Number.isFinite(disk1.at) && m2 === false && m3 === true && hm.noteRuntime('host-nope', said) === false,
    'H-RT1: noteRuntime keeps the statement on the record (`deviceRuntime`, on disk at once) — the same one again moves nothing, a new OpenSSL moves it, an unknown row is no-op', { m1, m2, m3, disk1 });
  const rows = new HostManager({ dataDir: dir }).list();
  const dRow = rows.find((r) => r.id === 'host-dial-Macbook'), sRow = rows.find((r) => r.id === 'host-ssh-box');
  ok(dRow.runtime && dRow.runtime.state === 'old' && dRow.runtime.fix === 'reinstall' && dRow.runtime.node === 'v22.22.0' && dRow.runtime.openssl === '3.0.16+quic' && dRow.online === false
    && sRow.runtime && sRow.runtime.state === 'unknown' && sRow.runtime.fix === null,
    'H-RT2: after a restart, offline, the /api/hosts row carries `runtime` (old · re-install · its node + OpenSSL); a machine whose agent never said reads unknown', { d: dRow.runtime, s: sRow.runtime });
  // an agent older than the field: the client's door hands what the hello-ack had (no nodeVersion) ⇒ not said ⇒ unknown, no chip
  hm.noteRuntime('host-ssh-box', DR.runtimeOf({ node: undefined, openssl: undefined, own: undefined, platform: 'linux' }));
  const sRow2 = hm.list().find((r) => r.id === 'host-ssh-box');
  ok(sRow2.runtime.state === 'unknown' && sRow2.runtime.node === null, 'H-RT3: a hello-ack without the fields ⇒ the row\'s runtime is unknown (no chip)', sRow2.runtime);
  const CL = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8'), DP = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8'), HS = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  ok(CL.includes("this._onRuntime?.(require('../device-runtime.js').runtimeOf({ node: msg.nodeVersion, openssl: msg.openssl, own: msg.nodeOwn, platform: msg.platform }))")
    && DP.includes('onRuntime: (rt) => { const h = hosts.findByDeviceId(deviceId); if (h && hosts.noteRuntime?.(h.id, rt))') && HS.includes('onRuntime: (rt) => this.noteRuntime(id, rt)'),
    'H-RT4: the wiring — the hub\'s client hands every hello-ack\'s runtime to its construction site: a dial device (dial-pairing.js, the card repainted) and an ssh machine (hosts.js)');

  // the words: every key the card uses, in zh and ja; the chip's zh is the brief's; the CSS on theme vars
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const LINE = fs.readFileSync(path.join(REPO, 'src/lib/machine-runtime-line.js'), 'utf8');
  const keys = [...LINE.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)].map((m) => m[1]);
  const miss = keys.filter((k) => !zh[k] || !ja[k]);
  ok(keys.length === 7 && !miss.length && zh['Runtime too old'] === '运行时过旧' && zh['Install again…'] === '重新安装…', `W-RT1: the card's ${keys.length} keys are in both dictionaries; the chip says 「运行时过旧」, the door 「重新安装…」`, miss);
  const css = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8').split('\n').filter((l) => l.startsWith('.agents-mach-runtime'));
  const sheet = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set([...sheet.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const dead = css.flatMap((l) => [...l.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)].filter((u) => !u[2] && !defined.has(u[1])).map((u) => u[1]));
  ok(css.length === 4 && css.every((l) => !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(l)) && !dead.length, `W-RT2: the runtime line's CSS (${css.length} rules) uses theme vars only — each one the theme defines (a var nothing defines paints nothing)`, dead);
  const MA = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ok(MA.includes('const rtl = runtimeLineEl(h.runtime, { dial: isDialDev });') && MA.includes("runtimeFixEl(rtl.words, { onReinstall: isDialDev ? () => this.sidebar?._showDevicePairDialog?.(h) : null })"),
    'W-RT3: the Machines card draws the line in every machine\'s summary and the recipe under its tools — the door (a dial device) opens the pairing sheet');

  // controls: patched copies of the table's compare
  const M2 = mutantCopies('dhlrt', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/device-runtime.js'), 'utf8');
  const mA = src.replace('const below = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };', 'const below = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return true; };');
  ok(mA !== src, '(rt-a) the patch applies');
  const ra = runRT(M2.load('src/device-runtime.js', mA, 'atfloor')).filter(([, s, f, ws, wf]) => s !== ws || f !== wf);
  ok(ra.length === 3 && ra.every(([n]) => /AT its floor/.test(n)), `CONTROL (rt-a): the floor itself read as old ⇒ the three AT-the-floor rows red (${ra.length})`, ra);
  const mB = src.replace("  const old = below(t, tripleOf('v' + row.floor));", '  const old = node.slice(1) < row.floor;');
  ok(mB !== src, '(rt-b) the patch applies');
  const rb = runRT(M2.load('src/device-runtime.js', mB, 'lexical')).filter(([, s, f, ws, wf]) => s !== ws || f !== wf);
  ok(rb.length >= 1 && rb.some(([n]) => n.startsWith('22.9.9')), `CONTROL (rt-b): versions compared as text ⇒ 22.9.9 reads as fixed (${rb.length} rows red)`, rb);
  for (const r of copiesCensus(M2.files, M2.dir, REPO, { minCopies: 2, label: 'mutant-copy (device-runtime): ' })) ok(r.pass, r.name, r.detail);
}

console.log('— controls (patched copies) —');
{
  const M = mutantCopies('dhl', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/dial-health.js'), 'utf8');
  const mA = src.replace('  if (refAt <= accAt) return NONE;', '  if (false) return NONE;');
  ok(mA !== src, '(a) the patch applies');
  const A = M.load('src/dial-health.js', mA, 'noorder');
  const ra = runTable(A).filter(([, got, want]) => got !== want);
  ok(ra.length >= 1 && ra.some(([n]) => n.startsWith('an accept newer')), `CONTROL (a): without "refusal newer than the accept" an old refusal reads as a second agent — ${ra.length} table rows red`, ra);
  const mB = src.replace('  const live = !!connected || (accAt > 0 && now - accAt <= RECENT_MS);', '  const live = true;');
  ok(mB !== src, '(b) the patch applies');
  const rb = runTable(M.load('src/dial-health.js', mB, 'nolive')).filter(([, got, want]) => got !== want);
  ok(rb.length >= 2, `CONTROL (b): without the connected rule a disconnected device's re-pair reads as a second agent — ${rb.length} rows red`, rb);
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/dial-health-watch.js'), 'utf8');
  const mC = wsrc.replace('      if (!rec) {\n', '      if (true) {\n');
  ok(mC !== wsrc, '(c) the patch applies');
  const C = world(M.load('src/server/dial-health-watch.js', mC, 'nodedupe')); const c1 = C.mk();
  c1.observe(macHost(C), { connected: true }); C.tick(30e3);
  C.todos.setStatus(C.open()[0].id, 'dismissed', 'user'); C.mk().observe(macHost(C), { connected: true });
  ok(C.open().length === 1, 'CONTROL (c): without the ledger rule the next boot files it again over the owner\'s dismissal — FY-8 goes red');
  const mD = wsrc.replace('    if (!DH.logDue(lastLogAt.get(hostId), t)) return false;\n', '');
  ok(mD !== wsrc, '(d) the patch applies');
  const D = world(M.load('src/server/dial-health-watch.js', mD, 'nolog')).mk();
  let nD = 0; for (let i = 0; i < 41; i++) if (D.shouldLog('h', { kind: 'second-dialer-stale-token' })) nD++;
  ok(nD === 41, `CONTROL (d): without the 10-min rule the journal says it at every knock (${nD} lines) — LOG-1 red`);
  // lane mac-repair-retires-stale: (e) the recipe as it was — the launch item only, no kill line ⇒ ROW-1 red; (f) no live
  // install on the row ⇒ ROW-1b red
  const mE = src.replace(" 'kill $(cat ~/.vibespace/device@<x>/state/agentd.lock)'],\n  linux:", "],\n  linux:");
  ok(mE !== src, '(e) the patch applies');
  const E = rowsOf(M.load('src/dial-health.js', mE, 'nokill'));
  ok(E.mac && !E.mac.recipe.includes(KILL), 'CONTROL (e): a darwin recipe without the kill line (bootout only — the detached agent keeps dialing) ⇒ ROW-1 red', E.mac && E.mac.recipe);
  const mF = src.replace('  const live = liveInstallOf(d.mintedBase);', '  const live = null;');
  ok(mF !== src, '(f) the patch applies');
  const F = rowsOf(M.load('src/dial-health.js', mF, 'nolivekey'));
  ok(F.macLive && F.macLive.live === null && !F.macLive.recipe.includes('grep -vxF'), 'CONTROL (f): a row that does not name the live install lists every install, the live one too ⇒ ROW-1b red', F.macLive);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 6, label: 'mutant-copy (dial-health): ' })) ok(r.pass, r.name, r.detail);
}
fs.rmSync(SCR, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
