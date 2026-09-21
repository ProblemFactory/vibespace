#!/usr/bin/env node
// DESKTOP APPS — the PURE model (docs/design-desktop-apps.zh.md §6 row 1,
// P8-1, 2026-09-13): registry-row validation, the resolveBackend ladder over
// the FULL presence matrix (every missing combination, each fallback reason
// spelled exactly as §3's log line states it), the app-session state machine,
// the cap / runaway / idle / adoption verdicts, and the ONE constants home
// (src/keeper-limits.js) that opencode-serve and this model both read.
// No process, no file system, no fixed name. Run: node scripts/test-desktop-apps.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const M = require('../src/desktop-apps.js');
const L = require('../src/keeper-limits.js');
const D = require('../src/desktop-display.js');

console.log('§1 the ONE constants home');
ok(M.LIMITS === L, 'desktop-apps.LIMITS IS keeper-limits (the same object, not a copy)');
ok(L.GUARD_CPU_PCT === 150 && L.GUARD_CPU_SUSTAIN_MS === 300000 && L.GUARD_RSS_BYTES === 2 * 1024 ** 3 && L.RUNAWAY_COOLDOWN_MS === 3600000 && L.GUARD_SAMPLE_MS === 60000, 'the guard numbers are the 2.369.42 incident numbers (150 % / 5 min / 2 GiB / 1 h / 60 s)');
ok(Number.isInteger(L.CONCURRENT_CAP) && L.CONCURRENT_CAP >= 1, `CONCURRENT_CAP is a positive integer (${L.CONCURRENT_CAP})`);
{
  const oc = read('src/opencode-serve.js');
  ok(/require\('\.\/keeper-limits'\)/.test(oc) && !/const GUARD_CPU_PCT = 150/.test(oc), 'opencode-serve READS keeper-limits — its own literals are gone (the twin this home exists to end)');
  ok(/cliIdentity\.procSample\(pid\)/.test(oc), 'opencode-serve samples /proc through cli-identity.procSample — the same reader the desktop keeper uses');
  const kl = read('src/keeper-limits.js');
  ok(!/require\(/.test(kl), 'keeper-limits imports nothing');
  const da = read('src/desktop-apps.js');
  const reqs = [...da.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(same(reqs, ['./keeper-limits']), 'desktop-apps.js imports nothing but the constants home', reqs);
}

console.log('§2 DISPLAY_BACKENDS — the capability table');
ok(same(M.BACKEND_IDS, ['xpra', 'vnc-display', 'desktop-singleton']), 'three rungs in DA1 order: xpra > vnc-display > desktop-singleton');
for (const b of M.DISPLAY_BACKENDS) {
  ok(typeof b.perWindow === 'boolean' && typeof b.adaptive === 'boolean' && Array.isArray(b.needs) && b.needs.every((g) => Array.isArray(g) && g.length) && ['rfb', 'xpra'].includes(b.stream) && typeof b.wired === 'boolean', `row ${b.id} declares perWindow/adaptive/needs/stream/wired`);
  ok(Object.isFrozen(b) && Object.isFrozen(b.needs), `row ${b.id} is frozen (a rung is a declaration, not state)`);
}
ok(M.backendById('xpra').perWindow && M.backendById('xpra').adaptive && M.backendById('xpra').stream === 'xpra' && M.backendById('xpra').wired === false, 'xpra: per-window, adaptive, xpra stream, NOT wired in P8-1');
ok(!M.backendById('vnc-display').perWindow && !M.backendById('vnc-display').adaptive && M.backendById('vnc-display').stream === 'rfb' && M.backendById('vnc-display').wired === true, 'vnc-display: whole display, not adaptive, rfb, wired');
{
  const probed = new Set([...D.PROBE_BINS, 'desktop-singleton:running']);
  const needed = M.DISPLAY_BACKENDS.flatMap((b) => b.needs.flat());
  ok(needed.every((n) => probed.has(n)), 'every binary a rung needs is one desktop-display PROBES (a rung nobody can probe is prose)', needed.filter((n) => !probed.has(n)));
}

for (const b of M.DISPLAY_BACKENDS) {
  ok(b.recipes && Object.isFrozen(b.recipes) && b.needs.every((g) => typeof b.recipes[g.join('+')] === 'string'), `row ${b.id}: every needs-group names its bring-up recipe (r2 — the keeper looks it up, never spells a rung)`);
  for (const g of b.needs) { const via = g.join('+'); const name = M.recipeFor(b.id, via); ok(typeof D.RECIPES[name] === 'function', `${b.id} via ${via} ⇒ ${name} is a desktop-display RECIPE`); }
}
ok(Object.keys(D.RECIPES).every((n) => M.DISPLAY_BACKENDS.some((b) => Object.values(b.recipes).includes(n))), 'no recipe without a rung that names it');
ok(M.recipeFor('vnc-display', 'nope') === null && M.recipeFor('nope', 'Xvnc') === null && M.recipeFor('vnc-display', null) === null, 'an unknown (backend, via) pair names NO recipe — refused by name, never guessed');
ok(M.KEEPER_ENV.includes('VIBESPACE_DESKTOP_APP'), 'a registry row may not set VIBESPACE_DESKTOP_APP — the keeper stamps it on every process of a session (its identity when the leader is gone)');
{
  const r = M.resolveBackend({ bins: { Xvfb: '/x', x11vnc: '/x' } });
  ok(r.recipe === 'x-then-server' && r.ladder[1].recipe === 'x-then-server' && r.ladder[0].recipe === null, 'resolveBackend carries the recipe of the winner and of every rung that can run (null where it cannot)');
  ok(M.resolveBackend({ bins: { Xvnc: '/x' } }).recipe === 'x-serves-rfb' && M.resolveBackend({ bins: {}, singletonRunning: true }).recipe === 'shared' && M.resolveBackend({ bins: { xpra: '/x' } }).recipe === null && M.resolveBackend({ bins: { xpra: '/x' } }).ladder[0].recipe === 'xpra-seamless', 'each rung resolves to its own recipe name (one-pid Xvnc / the shared desktop / the not-yet-wired xpra names its recipe on the ladder but never wins)');
  // A FOURTH RUNG IS ONE ROW: a table copy with a new first rung resolves to it and to its recipe — nothing else is consulted
  const fourth = Object.freeze({ id: 'fake-rung', label: 'fake', perWindow: true, adaptive: false, stream: 'rfb', needs: Object.freeze([Object.freeze(['Xfake'])]), recipes: Object.freeze({ Xfake: 'x-then-server' }), wired: true });
  const r4 = M.resolveBackend({ bins: { Xfake: '/x', Xvfb: '/x', x11vnc: '/x' } }, {}, [fourth, ...M.DISPLAY_BACKENDS]);
  ok(r4.backend === 'fake-rung' && r4.recipe === 'x-then-server' && r4.ladder.length === 4 && r4.fallbackWhy === null, 'a fourth rung = one row: the ladder resolves to it and names its recipe', r4);
  ok(M.resolveBackend({ bins: { Xfake: '/x', Xvfb: '/x', x11vnc: '/x' } }, { backendPrefs: ['vnc-display'] }, [fourth, ...M.DISPLAY_BACKENDS]).backend === 'vnc-display', 'backendPrefs still restrict within the handed table');
  ok(M.resolveBackend({ bins: { Xfake: '/x' } }).backend === null, 'CONTROL: the DEFAULT table knows no Xfake');
}

console.log('§3 resolveBackend — the full presence matrix');
const BINS = ['xpra', 'Xvnc', 'Xtigervnc', 'Xvfb', 'x11vnc'];
// an independent oracle written from §3's table, not from the module
function oracle(bins, singletonRunning) {
  const has = (b) => !!bins[b];
  const rows = [
    { id: 'xpra', groups: [['xpra']], wired: false }, // P8-1: probed, recorded, NOT wired — present ⇒ passed over with its reason (2.369.131)
    { id: 'vnc-display', groups: [['Xvnc'], ['Xvfb', 'x11vnc']], wired: true },
    { id: 'desktop-singleton', groups: [['Xtigervnc'], ['Xvnc'], ['desktop-singleton:running']], wired: true },
  ];
  const fell = [];
  for (const r of rows) {
    const g = r.groups.find((grp) => grp.every((b) => (b === 'desktop-singleton:running' ? singletonRunning : has(b))));
    if (g && r.wired) return { backend: r.id, via: g.join('+'), fallbackWhy: fell.length ? fell.join('; ') : null };
    fell.push(g ? `${r.id} present (${g.join('+')}) but not wired until P8-2` : r.groups.map((grp) => `${grp.join('+')} not on PATH`).join('; '));
  }
  return { backend: null, via: null, fallbackWhy: fell.join('; ') };
}
{
  let n = 0, bad = null;
  for (let mask = 0; mask < 1 << BINS.length; mask++) {
    for (const singletonRunning of [false, true]) {
      const bins = {}; BINS.forEach((b, i) => { bins[b] = (mask >> i) & 1 ? `/usr/bin/${b}` : null; });
      const got = M.resolveBackend({ bins, singletonRunning });
      const want = oracle(bins, singletonRunning);
      n++;
      if (!bad && (got.backend !== want.backend || got.via !== want.via || got.fallbackWhy !== want.fallbackWhy)) bad = { bins, singletonRunning, got, want };
      if (!bad && got.ladder.length !== 3) bad = { bins, ladder: got.ladder };
    }
  }
  ok(!bad, `the ladder agrees with the §3 oracle on all ${n} presence combinations (backend, via, fallbackWhy, 3-rung ladder)`, bad);
}
{
  // 2.369.131 (the day xpra 6.5.3 landed on this box): a PRESENT but UNWIRED rung is passed
  // over with its reason — the ladder had chosen it and the keeper refused every launch
  // with backend-not-wired where vnc-display had been working. DA1 ("installed ⇒ preferred")
  // holds for a WIRED rung: the control below flips the row and xpra wins.
  const r = M.resolveBackend({ bins: { xpra: '/usr/bin/xpra', Xvfb: '/usr/bin/Xvfb', x11vnc: '/usr/bin/x11vnc' } });
  ok(r.backend === 'vnc-display' && r.via === 'Xvfb+x11vnc' && r.stream === 'rfb' && r.fallbackWhy === 'xpra present (xpra) but not wired until P8-2' && r.ladder[0].present === true && r.ladder[0].ok === false && r.ladder[0].recipe === 'xpra-seamless', 'THIS BOX SINCE 2026-09-21: xpra present but unwired ⇒ vnc-display, the reason names the unwired rung, the ladder still reports xpra as present with its recipe', r);
  ok(M.fallbackLogLine(r) === '[desktop] backend fallback: xpra→vnc-display (xpra present (xpra) but not wired until P8-2)', 'the §3 log line names the unwired rung', M.fallbackLogLine(r));
  const wiredTable = M.DISPLAY_BACKENDS.map((b) => (b.id === 'xpra' ? Object.freeze({ ...b, wired: true }) : b));
  const rw = M.resolveBackend({ bins: { xpra: '/usr/bin/xpra', Xvfb: '/usr/bin/Xvfb', x11vnc: '/usr/bin/x11vnc' } }, {}, wiredTable);
  ok(rw.backend === 'xpra' && rw.via === 'xpra' && rw.fallbackWhy === null && rw.stream === 'xpra' && M.fallbackLogLine(rw) === null, 'CONTROL (DA1 for P8-2): with the xpra row WIRED the same box resolves to xpra, no fallback, no log line', rw);
}
{
  const r = M.resolveBackend({ bins: { Xvfb: '/usr/bin/Xvfb', x11vnc: '/usr/bin/x11vnc' } });
  ok(r.backend === 'vnc-display' && r.via === 'Xvfb+x11vnc' && r.fallbackWhy === 'xpra not on PATH', 'THIS BOX: Xvfb+x11vnc only ⇒ vnc-display via Xvfb+x11vnc, fallbackWhy "xpra not on PATH" (the status-chip words)', r);
  ok(M.fallbackLogLine(r) === '[desktop] backend fallback: xpra→vnc-display (xpra not on PATH)', "the §3 log line, verbatim: '[desktop] backend fallback: xpra→vnc-display (xpra not on PATH)'", M.fallbackLogLine(r));
  ok(same(r.ladder.map((x) => [x.backend, x.ok, x.why]), [['xpra', false, 'xpra not on PATH'], ['vnc-display', true, null], ['desktop-singleton', false, 'Xtigervnc not on PATH; Xvnc not on PATH; desktop-singleton:running not on PATH']]), 'the ladder reports every rung with its reason (the launcher prints it)', r.ladder);
}
{
  const r = M.resolveBackend({ bins: { Xvnc: '/usr/bin/Xvnc' } });
  ok(r.backend === 'vnc-display' && r.via === 'Xvnc', 'THE FLEET IMAGE: Xvnc alone ⇒ vnc-display via Xvnc (both spellings are one rung)');
  const r2 = M.resolveBackend({ bins: { Xvfb: '/usr/bin/Xvfb' } });
  ok(r2.backend === null && r2.fallbackWhy === 'xpra not on PATH; Xvnc not on PATH; Xvfb+x11vnc not on PATH; Xtigervnc not on PATH; Xvnc not on PATH; desktop-singleton:running not on PATH', 'Xvfb without x11vnc ⇒ NO backend, and the reason names each missing group', r2.fallbackWhy);
  const r3 = M.resolveBackend({ bins: {}, singletonRunning: true });
  ok(r3.backend === 'desktop-singleton' && r3.via === 'desktop-singleton:running', 'only the shared desktop running ⇒ the D10 fallback rung');
  const r4 = M.resolveBackend({ bins: { xpra: '/x', Xvfb: '/x', x11vnc: '/x' } }, { backendPrefs: ['vnc-display'] });
  ok(r4.backend === 'vnc-display' && r4.fallbackWhy === null, 'a row\'s backendPrefs may RESTRICT the ladder (only vnc-display asked ⇒ vnc-display, no fallback)');
  const r5 = M.resolveBackend({ bins: { xpra: '/x', Xvfb: '/x', x11vnc: '/x' } }, { backendPrefs: ['nonsense'] });
  ok(r5.backend === 'vnc-display' && r5.ladder.length === 3 && r5.ladder[0].backend === 'xpra' && r5.ladder[0].present === true, 'unknown pref ids are ignored, never invented as rungs (the full ladder runs — and still passes over the unwired xpra)');
  ok(M.resolveBackend().backend === null && M.resolveBackend(null).backend === null, 'no facts ⇒ no backend (never a guess)');
}

console.log('§4 registry rows + launch requests');
ok(M.validateAppRow({ id: 'xterm', label: 'xterm', exec: 'xterm' }).ok, 'a minimal row validates');
ok(M.validateAppRow({ id: 'a.b-c_1', label: 'x', exec: '/usr/bin/x', args: ['-a', 'b'], cwd: '/tmp', env: { FOO: 'bar' }, category: 'c', backendPrefs: ['vnc-display'], needsWayland: false }).ok, 'a full row validates');
for (const [row, why] of [
  [{ id: 'Bad Id', label: 'x', exec: 'x' }, 'id with a space'],
  [{ id: '-x', label: 'x', exec: 'x' }, 'id starting with -'],
  [{ id: 'x', label: '', exec: 'x' }, 'empty label'],
  [{ id: 'x', label: 'x', exec: 'x\0y' }, 'NUL in exec'],
  [{ id: 'x', label: 'x', exec: 'x\ny' }, 'newline in exec'],
  [{ id: 'x', label: 'x', exec: 'x', args: 'not-an-array' }, 'args not an array'],
  [{ id: 'x', label: 'x', exec: 'x', env: { DISPLAY: ':9' } }, 'env DISPLAY (keeper-owned)'],
  [{ id: 'x', label: 'x', exec: 'x', env: { XAUTHORITY: '/f' } }, 'env XAUTHORITY (keeper-owned)'],
  [{ id: 'x', label: 'x', exec: 'x', env: { 'bad key': 'v' } }, 'env key with a space'],
  [{ id: 'x', label: 'x', exec: 'x', backendPrefs: ['nope'] }, 'backendPrefs naming a rung the table lacks'],
  [{ id: 'x', label: 'x', exec: 'x', needsWayland: 'yes' }, 'needsWayland not a boolean'],
  [null, 'null row'],
]) ok(!M.validateAppRow(row).ok, `refused: ${why}`);
ok(same(M.KEEPER_ENV, ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'VIBESPACE_DESKTOP_APP']), 'KEEPER_ENV names the five vars a row may never set (the fifth is the session marker the keeper stamps, r2)');
{
  const reg = M.DEFAULT_REGISTRY;
  ok(reg.every((r) => M.validateAppRow(r).ok), 'every DEFAULT_REGISTRY row validates');
  ok(reg[0].id === 'xterm' && reg.some((r) => r.id === 'gnome-calculator') && reg.some((r) => r.id === 'firefox') && reg.some((r) => r.id === 'code'), 'the default registry is xterm first + the short GUI allowlist (presence-checked by the keeper, never assumed)');
  const v = M.validateLaunchRequest({ appId: 'xterm' }, reg);
  ok(v.ok && v.launch.source === 'registry' && v.launch.row.id === 'xterm', '{appId} resolves a registry row');
  ok(!M.validateLaunchRequest({ appId: 'nope' }, reg).ok, 'an unknown appId is refused');
  const a = M.validateLaunchRequest({ exec: '/usr/bin/xterm', args: ['-e', 'top'], cwd: '/tmp' }, reg);
  ok(a.ok && a.launch.source === 'adhoc' && a.launch.row.label === 'xterm' && same(a.launch.row.args, ['-e', 'top']) && a.launch.row.cwd === '/tmp', '{exec,args,cwd} is an adhoc launch; label defaults to the exec basename');
  ok(!M.validateLaunchRequest({ exec: '' }, reg).ok && !M.validateLaunchRequest(null, reg).ok && !M.validateLaunchRequest({ exec: 'x', args: [1] }, reg).ok, 'empty / null / non-string args are refused');
  ok(M.validateLaunchRequest({ exec: 'x', cwd: '' }, reg).launch.row.cwd === null, 'an empty cwd is "none"');
}

console.log('§5 the state machine');
ok(same(M.APP_STATES, ['launching', 'ready', 'exited', 'failed']), 'four states');
ok(M.transition('launching', 'server-listening') === 'ready', 'launching → ready on server-listening');
ok(M.transition('launching', 'spawn-error') === 'failed' && M.transition('launching', 'app-exit') === 'exited' && M.transition('launching', 'stop') === 'exited', 'launching → failed on spawn-error, → exited on app-exit / stop');
ok(M.transition('ready', 'app-exit') === 'exited' && M.transition('ready', 'stop') === 'exited' && M.transition('ready', 'runaway') === 'failed' && M.transition('ready', 'display-gone') === 'failed', 'ready → exited (app-exit/stop), → failed (runaway/display-gone)');
ok(M.transition('ready', 'server-listening') === null, 'ready has no server-listening edge (idempotence is the keeper\'s, not the machine\'s)');
ok(M.transition('exited', 'stop') === null && M.transition('failed', 'app-exit') === null && M.transition('nope', 'stop') === null, 'terminal states and unknown states have no edges');
ok(M.isLiveState('launching') && M.isLiveState('ready') && !M.isLiveState('exited') && M.isTerminalState('failed'), 'isLiveState / isTerminalState');

console.log('§6 verdicts');
{
  const now = 1_000_000;
  const i = M.idleState({ startedAt: now - 10 * 60000, lastInputAt: now - 29 * 60000 + 1000 }, now, 30 * 60000);
  ok(!i.expired && i.remainingMs > 0 && i.remainingMs <= 61000 && i.idleMs >= 29 * 60000 - 1000, 'idle: 29 min since input under a 30 min limit ⇒ not expired, ~1 min left');
  ok(M.idleState({ startedAt: now - 31 * 60000, lastInputAt: now - 31 * 60000 }, now, 30 * 60000).expired, 'idle: 31 min ⇒ expired');
  ok(!M.idleState({ startedAt: now - 9e9 }, now, 0).expired && M.idleState({ startedAt: now - 9e9 }, now, 0).remainingMs === null, 'limit 0 ⇒ never expires (DA3: 0 = never)');
  ok(!M.idleState({ startedAt: now - 31 * 60000 }, now, 30 * 60000).expired === false, 'no lastInputAt ⇒ the start is the last input');
}
{
  const live = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, label: `App ${i}`, state: 'ready' }));
  ok(M.capVerdict(live(L.CONCURRENT_CAP - 1)) === null, 'below the cap ⇒ a launch may proceed');
  const v = M.capVerdict(live(L.CONCURRENT_CAP));
  ok(v && v.code === 'cap' && v.holders.length === L.CONCURRENT_CAP && /ceiling reached/.test(v.error) && /App 0 \(a0\)/.test(v.error) && /stop one first/.test(v.error), 'at the cap ⇒ a LOUD refusal naming the holders and the way out', v);
  ok(M.capVerdict(live(2), { CONCURRENT_CAP: 2 }).code === 'cap' && M.capVerdict(live(1), { CONCURRENT_CAP: 2 }) === null, 'the cap is the injected limits\' (the suite can shrink it)');
}
{
  const lim = { ...L, GUARD_CPU_SUSTAIN_MS: 1000 };
  const t0 = 10_000;
  let v = M.runawayVerdict({ cpuTicks: 0, rssBytes: 100 }, null, 0, t0, { limits: lim });
  ok(v.cpuPct === null && v.hotSince === 0 && v.why === null, 'first sample: no rate yet, not hot');
  v = M.runawayVerdict({ cpuTicks: 200, rssBytes: 100 }, { at: t0, cpuTicks: 0 }, 0, t0 + 1000, { limits: lim });
  ok(Math.round(v.cpuPct) === 200 && v.hotSince === t0 + 1000 && v.why === null, '200 % over one second ⇒ hot starts, no verdict yet');
  v = M.runawayVerdict({ cpuTicks: 400, rssBytes: 100 }, { at: t0 + 1000, cpuTicks: 200 }, t0 + 1000, t0 + 2000, { limits: lim });
  ok(/^200% CPU sustained for \d+ min \(limit 150%\)$/.test(v.why || ''), 'sustained past the limit ⇒ the runaway sentence names the numbers', v);
  v = M.runawayVerdict({ cpuTicks: 410, rssBytes: 100 }, { at: t0 + 2000, cpuTicks: 400 }, t0 + 1000, t0 + 3000, { limits: lim });
  ok(v.hotSince === 0 && v.why === null, 'CPU drops ⇒ hot resets (a one-off spike is not a runaway)');
  v = M.runawayVerdict({ cpuTicks: 0, rssBytes: lim.GUARD_RSS_BYTES + 1 }, null, 0, t0, { limits: lim });
  ok(/^RSS 2\.0 GB \(limit 2\.0 GB\)$/.test(v.why || ''), 'RSS over the limit ⇒ immediate verdict', v);
  ok(M.runawayVerdict(null, null, 0, t0).why === null, 'no sample ⇒ no verdict (no evidence, never a claim)');
  ok(M.runawayParkVerdict('xterm', { xterm: t0 + 60000 }, t0)?.code === 'runaway-parked' && M.runawayParkVerdict('xterm', { xterm: t0 - 1 }, t0) === null && M.runawayParkVerdict(null, {}, t0) === null, 'park: a future until refuses with its code; a passed one and an adhoc launch do not');
}
{
  const rec = { state: 'ready', lastError: null };
  ok(same(M.adoptVerdict(rec, { x: true, server: true, app: true }, true), { state: 'ready', adopted: true }), 'adopt: every part alive + banner ⇒ ready (adopted)');
  ok(M.adoptVerdict(rec, { x: false, server: false, app: false }, false).state === 'exited' && /X display gone/.test(M.adoptVerdict(rec, { x: false, server: false, app: false }, false).lastError), 'adopt: X dead ⇒ exited, lastError says the display is gone');
  ok(M.adoptVerdict(rec, { x: true, server: true, app: false }, true).state === 'exited' && /application exited while VibeSpace was down/.test(M.adoptVerdict(rec, { x: true, server: true, app: false }, true).lastError), 'adopt: app dead ⇒ exited, lastError says so');
  ok(M.adoptVerdict(rec, { x: true, server: false, app: true }, false).state === 'failed', 'adopt: picture server dead or silent ⇒ failed');
  ok(M.adoptVerdict({ state: 'ready', lastError: 'kept' }, { x: false, server: false, app: false }, false).lastError === 'kept', 'adopt: an existing lastError is KEPT');
  ok(M.adoptVerdict({ state: 'exited' }, { x: true, server: true, app: true }, true) === null, 'adopt: a terminal record is not re-adopted');
}
ok(same(M.streamTargetOf({ state: 'ready', port: 5901, backend: 'vnc-display' }), { kind: 'rfb', port: 5901, backend: 'vnc-display' }) && M.streamTargetOf({ state: 'launching', port: 5901, backend: 'vnc-display' }) === null && M.streamTargetOf({ state: 'ready', port: 1, backend: 'xpra' }).kind === 'xpra', 'streamTargetOf: ready+port ⇒ the rung\'s stream kind; launching ⇒ null');
{
  const r = M.newRecord({ id: 'da-1', label: 'x', exec: '/x', args: ['a'], cwd: null, source: 'adhoc', backend: 'vnc-display', via: 'Xvfb+x11vnc', fallbackWhy: 'xpra not on PATH', idleTimeoutMs: 60000, now: 5 });
  ok(r.state === 'launching' && r.startedAt === 5 && r.lastInputAt === 5 && same(Object.keys(r.pids), ['x', 'app', 'server', 'wm']) && same(Object.keys(r.starts), ['x', 'app', 'server', 'wm']) && r.display === null && r.port === null && r.idleTimeoutMs === 60000 && r.env === undefined, 'newRecord: the §4 shape, facts only, nothing derived');
}
ok(M.DESKTOP_SINGLETON_ID === 'desktop-singleton' && M.DEFAULT_IDLE_TIMEOUT_MIN === 30, 'DESKTOP_SINGLETON_ID + the DA3 default');

console.log('§7 the bridge\'s RFB input sieve — its message table DERIVED from the client we ship (r3)');
{
  // The sieve is PURE over its own state and exported from the ORCH bridge; a
  // wrong length in its table does not flip it to `opaque`, it MISALIGNS the
  // rest of the connection (r3: EnableContinuousUpdates was listed as 4 bytes,
  // noVNC sends 10, every later KeyEvent was read as the tail of something
  // else and the idle clock stopped seeing the user). So the table is not
  // typed here: every `RFB.messages.*` encoder in node_modules/@novnc/novnc/
  // core/rfb.js is parsed for its pushes, each fixed-shape one is built at
  // the derived length and driven through the sieve followed by a KeyEvent,
  // which MUST count. A variable-shape encoder is driven at a real shape.
  const S = require('../src/server/desktop-stream.js');
  const src = read('node_modules/@novnc/novnc/core/rfb.js');
  const start = src.indexOf('\nRFB.messages = {');
  const end = src.indexOf('\n};', start);
  ok(start > 0 && end > start, 'noVNC ships an `RFB.messages = {…}` encoder table (the census source)');
  const table = src.slice(start, end);
  const encoders = [];
  const re = /\n    ([A-Za-z_]\w*)\(sock[^)]*\) \{\n([\s\S]*?)\n    \},?/g;
  let m;
  while ((m = re.exec(table))) {
    const [, name, body] = m;
    const type = /sock\.sQpush8\((\d+)\);\s*\/\/ msg-type/.exec(body);
    if (!type) continue;
    const variable = /sQpushBytes|sQpushString|for \(|while \(/.test(body);
    let bytes = 0;
    for (const p of body.matchAll(/sQpush(8|16|32)\(/g)) bytes += { 8: 1, 16: 2, 32: 4 }[p[1]];
    encoders.push({ name, type: Number(type[1]), bytes, variable });
  }
  const byName = Object.fromEntries(encoders.map((e) => [e.name, e]));
  ok(encoders.length >= 10 && byName.enableContinuousUpdates && byName.keyEvent && byName.pointerEvent && byName.extendedPointerEvent && byName.clientFence && byName.xvpOp && byName.setDesktopSize && byName.clientCutText && byName.clientEncodings && byName.pixelFormat && byName.fbUpdateRequest && byName.QEMUExtendedKeyEvent, `parsed ${encoders.length} client-message encoders from the shipped noVNC`, encoders.map((e) => e.name));
  ok(byName.enableContinuousUpdates.bytes === 10 && !byName.enableContinuousUpdates.variable, 'noVNC\'s EnableContinuousUpdates is 10 bytes (type, enable, x, y, w, h) — the r3 defect was a 4 in the table', byName.enableContinuousUpdates);
  ok(byName.pointerEvent.bytes === 6 && byName.extendedPointerEvent.bytes === 7 && byName.pointerEvent.type === 5 && byName.extendedPointerEvent.type === 5, 'type 5 has TWO shapes in the shipped client: 6 bytes, or 7 with the ExtendedMouseButtons marker bit — a fixed-length table cannot say it');
  // the sieve's own fixed table must agree with every fixed-shape encoder it lists, and list no type the client can send at another length
  for (const [t, len] of Object.entries(S.RFB_FIXED_LEN)) {
    const encs = encoders.filter((e) => e.type === Number(t));
    ok(encs.length >= 1 && encs.every((e) => !e.variable && e.bytes === len), `RFB_FIXED_LEN[${t}] = ${len} matches the shipped encoder(s) ${encs.map((e) => `${e.name}:${e.bytes}${e.variable ? ' (variable!)' : ''}`).join(', ') || '(none — a type the client never sends)'}`);
  }
  const hs = [Buffer.from('RFB 003.008\n'), Buffer.from([1]), Buffer.from([1])];
  const key = Buffer.from([4, 1, 0, 0, 0, 0, 0, 0x61]);
  const INPUT_TYPES = new Set(S.RFB_INPUT_TYPES);
  // build ONE message of each encoder at the derived length (a shape hint where the length depends on the message's own bytes)
  const shapeOf = (e) => {
    if (e.name === 'clientEncodings') return Buffer.from([2, 0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 5]); // 2 encodings
    if (e.name === 'clientCutText') return Buffer.from([6, 0, 0, 0, 0, 0, 0, 3, 0x61, 0x62, 0x63]); // "abc"
    if (e.name.startsWith('extendedClipboard')) return Buffer.from([6, 0, 0, 0, 0xff, 0xff, 0xff, 0xfc, 0x10, 0, 0, 1]); // extended: length -4, 4 bytes
    if (e.name === 'clientFence') return Buffer.from([248, 0, 0, 0, 0x80, 0, 0, 1, 3, 0x61, 0x62, 0x63]); // 3-byte payload
    if (e.name === 'setDesktopSize') { const b = Buffer.alloc(24); b[0] = 251; b[6] = 1; return b; }        // 1 screen
    if (e.name === 'extendedPointerEvent') return Buffer.from([5, 0x81, 0, 10, 0, 20, 0x02]);
    if (e.name === 'QEMUExtendedKeyEvent') { const b = Buffer.alloc(12); b[0] = 255; b[1] = 0; return b; }
    const b = Buffer.alloc(e.bytes); b[0] = e.type; return b;
  };
  for (const e of encoders) {
    if (e.name === 'extendedClipboardCaps') continue; // never sent by a client: noVNC only answers the server's caps
    const msg = shapeOf(e);
    const s = S.rfbInputSieve();
    let n = 0; for (const b of [...hs, msg, key]) n += s.feed(b);
    const st = s.state();
    const expect = 1 + (INPUT_TYPES.has(e.type) ? 1 : 0);
    ok(!st.opaque && st.pending === 0 && st.messages === 2 && n === expect, `${e.name} (type ${e.type}, ${e.variable ? 'variable' : e.bytes + ' bytes'}) then a KeyEvent ⇒ 2 messages walked, ${expect} input(s), nothing pending`, st);
  }
  // the incident's own shape end to end: handshake + SetPixelFormat + SetEncodings + ECU + FramebufferUpdateRequest + KeyEvent
  {
    const spf = Buffer.alloc(20); const se = Buffer.from([2, 0, 0, 1, 0, 0, 0, 0]);
    const ecu = Buffer.from([150, 1, 0, 0, 0, 0, 0x05, 0x00, 0x03, 0x20]); const fbur = Buffer.from([3, 1, 0, 0, 0, 0, 0x04, 0x00, 0x03, 0x00]);
    const s = S.rfbInputSieve(); let n = 0; for (const b of [...hs, spf, se, ecu, fbur, key]) n += s.feed(b);
    ok(n === 1 && s.state().pending === 0, 'the r3 sequence (noVNC on a ContinuousUpdates server) counts the KeyEvent (round 2 counted 0 and left 4 bytes pending)');
    const s3 = S.rfbInputSieve(); let n3 = 0; for (const b of [...hs, spf, se, ecu, key, key, key]) n3 += s3.feed(b);
    ok(n3 === 3, 'ECU then three KeyEvents ⇒ 3 inputs (round 2: 0, opaque:false, pending 10 — followable and permanently wrong)');
  }
  // NEGATIVE CONTROL: a patched copy of the real bridge with the round-2 table — same sequence, KeyEvents lost, sieve still 'followable'
  {
    const srcS = read('src/server/desktop-stream.js');
    const from = 'const RFB_FIXED_LEN = Object.freeze({ 0: 20, 3: 10, 4: 8, 150: 10, 250: 4 });';
    ok(srcS.split(from).length === 2, 'the fixed table is spelled once in the bridge (the control patches exactly it)');
    const dir = path.join(repo, 'src/server');
    for (const f of fs.readdirSync(dir)) { const mm = /^vs-dak-mut-(\d+)-/.exec(f); if (mm) { try { process.kill(Number(mm[1]), 0); } catch { try { fs.unlinkSync(path.join(dir, f)); } catch {} } } }
    const file = path.join(dir, `vs-dak-mut-${process.pid}-stream.js`);
    fs.writeFileSync(file, srcS.replace(from, 'const RFB_FIXED_LEN = Object.freeze({ 0: 20, 3: 10, 4: 8, 5: 6, 150: 4 }); // pre-fix'));
    try {
      const P = require(file);
      const spf = Buffer.alloc(20); const se = Buffer.from([2, 0, 0, 1, 0, 0, 0, 0]);
      const ecu = Buffer.from([150, 1, 0, 0, 0, 0, 0x05, 0x00, 0x03, 0x20]); const fbur = Buffer.from([3, 1, 0, 0, 0, 0, 0x04, 0x00, 0x03, 0x00]);
      const s = P.rfbInputSieve(); let n = 0; for (const b of [...hs, spf, se, ecu, fbur, key]) n += s.feed(b);
      ok(n === 0 && s.state().opaque === false && s.state().pending === 4, `CONTROL: the round-2 table on the same bytes counts 0 inputs, is NOT opaque and leaves 4 bytes pending (misaligned, not refused)`, s.state());
    } finally { try { fs.unlinkSync(file); } catch {} }
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
