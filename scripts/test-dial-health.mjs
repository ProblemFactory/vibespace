#!/usr/bin/env node
// A SECOND AGENT WITH AN OLD TOKEN IS NAMED (lane host-stale-dialer, B-6136, 2026-10-12). The owner's Macbook ran its live
// agent AND a leftover one with a generation-1 token; the hub refused the old one every 30 s for a day and only the
// journal knew. PURE src/dial-health.js judges (secondDialerVerdict + the row's facts + the stop recipes), the server
// module src/server/dial-health-watch.js files ONE For-you item per episode (across boots) and rate-limits the journal.
// Over the REAL HostManager + UserTodoManager, in-process, on a hand clock. Controls are patched copies (mutant-copy.mjs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DH = require('../src/dial-health.js');
const HW = require('../src/server/dial-health-watch.js');
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

console.log('— PURE: the row\'s facts + the stop recipe per platform —');
{
  const host = (platform, connected = true) => ({ id: 'host-dial-M', name: 'Macbook', transport: 'dial', deviceId: 'Macbook', dial: { lastAccept: { ...acc(NOW - 50 * MIN), platform }, lastRefusal: ref(NOW - 20e3) } });
  const mac = DH.dialHealthRow(host('darwin'), { connected: true, now: NOW });
  ok(mac && mac.kind === 'second-dialer-stale-token' && /^launchctl list \| grep -i vibespace\nlaunchctl bootout gui\/\$\(id -u\)\/<label>$/.test(mac.recipe), 'ROW-1: darwin ⇒ launchctl list | grep -i vibespace + launchctl bootout gui/$(id -u)/<label>', mac);
  ok(/^systemctl --user list-units \| grep -i vibespace/.test(DH.dialHealthRow(host('linux'), { connected: true, now: NOW }).recipe), 'ROW-2: linux ⇒ systemctl --user list-units | grep -i vibespace');
  ok(/^schtasks \/query \| findstr \/i vibespace/.test(DH.dialHealthRow(host('win32'), { connected: true, now: NOW }).recipe), 'ROW-3: windows ⇒ schtasks /query | findstr /i vibespace');
  ok(DH.dialHealthRow(host(null), { connected: true, now: NOW }).recipe === null, 'ROW-4: an unknown platform ⇒ the line without a recipe (no Copy)');
  ok(DH.dialHealthRow(host('darwin'), { connected: false, now: NOW }) === null, 'ROW-5: disconnected ⇒ no second-dialer line (the row\'s own REFUSED state says re-pair)');
}

console.log('— the words: every key the line / item uses, in zh and ja —');
{
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const it = HW.itemOf({ machine: 'Macbook', from: '100.101.102.103', since: NOW - 15 * 3600e3, every: 30 });
  const keys = [it.i18n.text.key, ...it.i18n.detail.map((d) => d.key), 'Copy the stop command', 'Copied — run it on that machine'];
  const miss = keys.filter((k) => !zh[k] || !ja[k]);
  ok(!miss.length, `W-1: ${keys.length} keys in both dictionaries`, miss);
  ok(zh[it.i18n.detail[0].key].startsWith('另一个 VibeSpace agent 也在从 {from} 用旧的 token 拨入（每 {every} 秒被拒，自 {since}）'), 'W-2: the zh line is the brief\'s sentence');
  const SM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(SM.includes(`tr('${it.i18n.detail[0].key}'`) && SM.includes('if (h.dialHealth) row.appendChild(secondDialerLine(h.dialHealth));') && SM.includes('glyph.innerHTML = UI_ICONS.alert;') && SM.includes('copyText(dh.recipe)'), 'W-3: the row painter draws the same sentence, the icons.js glyph and Copies the recipe (never runs it)');
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
  ok(row.dialHealth && row.dialHealth.kind === 'second-dialer-stale-token' && row.dialHealth.platform === 'darwin' && /launchctl/.test(row.dialHealth.recipe), 'H-2: hosts.list() row carries `dialHealth` (darwin recipe) while connected', row.dialHealth);
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
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: 'mutant-copy (dial-health): ' })) ok(r.pass, r.name, r.detail);
}
fs.rmSync(SCR, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
