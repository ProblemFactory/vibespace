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
  // P8-2 x3 (2026-09-22): the guard numbers are IMPORTED, never copied — every consumer of the keeper's
  // ceiling names a guard number ONLY through the home (`limits.X` / `LIMITS.X`) and none re-spells a
  // guard literal. A grep census over the code with comments stripped (a comment may quote "150 %").
  const consumers = ['src/server/desktop-app-keeper.js', 'src/desktop-display.js', 'src/server/desktop-stream.js', 'src/routes/desktop-apps.js', 'src/desktop-apps.js', 'src/vnc.js'];
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const GUARD_NAMES = /(GUARD_SAMPLE_MS|GUARD_CPU_PCT|GUARD_CPU_SUSTAIN_MS|GUARD_RSS_BYTES|RUNAWAY_COOLDOWN_MS|CONCURRENT_CAP)/;
  const bareUses = [], literals = [], reads = [];
  for (const f of consumers) {
    const code = strip(read(f));
    for (const m of code.matchAll(new RegExp(`(?<![\\w.])${GUARD_NAMES.source}\\b`, 'g'))) bareUses.push(`${f}: ${m[1]}`);
    for (const m of code.matchAll(new RegExp(`\\b(?:limits|LIMITS)\\.${GUARD_NAMES.source}\\b`, 'g'))) reads.push(m[1]);
    for (const re of [new RegExp(`\\b${GUARD_NAMES.source}\\s*=\\s*\\d`), /2 \* 1024 \* 1024 \* 1024|2 \* 1024 \*\* 3/, /(?<!\d\s*\*\s*)5 \* 60 \* 1000/, /(?<!\d\s*\*\s*)60 \* 60 \* 1000/]) if (re.test(code)) literals.push(`${f}: ${re}`);
  }
  ok(reads.length >= 6 && new Set(reads).size >= 5, `census scope is non-vacuous (${reads.length} reads of ${new Set(reads).size} guard names through the home)`, reads);
  ok(bareUses.length === 0, 'no consumer names a guard number except through `limits.`/`LIMITS.` — imported, not copied', bareUses);
  ok(literals.length === 0, 'no consumer re-spells a guard literal (150 / 5 min / 2 GiB / 1 h / the cap)', literals);
  ok(/const GUARD_CPU_PCT = 150;/.test(strip(read('src/keeper-limits.js'))) && !!strip(`const X = 1; // GUARD_CPU_PCT = 150\n`).match(/const X = 1;\s*$/), 'CONTROL: the literal lives exactly once, in the home; the census strips comments (a quoted "150" in a comment is not a copy)');
  const neg = [...strip('const CONCURRENT_CAP = 6; x = limits.GUARD_CPU_PCT; // GUARD_RSS_BYTES\n').matchAll(new RegExp(`(?<![\\w.])${GUARD_NAMES.source}\\b`, 'g'))].map((m) => m[1]);
  ok(same(neg, ['CONCURRENT_CAP']), 'NEGATIVE CONTROL: a bare re-definition is what the census catches — a `limits.` read and a comment are not', neg);
}

console.log('§2 DISPLAY_BACKENDS — the capability table');
ok(same(M.BACKEND_IDS, ['xpra', 'vnc-display', 'desktop-singleton']), 'three rungs in DA1 order: xpra > vnc-display > desktop-singleton');
for (const b of M.DISPLAY_BACKENDS) {
  ok(typeof b.perWindow === 'boolean' && typeof b.adaptive === 'boolean' && Array.isArray(b.needs) && b.needs.every((g) => Array.isArray(g) && g.length) && ['rfb', 'xpra'].includes(b.stream) && typeof b.wired === 'boolean', `row ${b.id} declares perWindow/adaptive/needs/stream/wired`);
  ok(Object.isFrozen(b) && Object.isFrozen(b.needs), `row ${b.id} is frozen (a rung is a declaration, not state)`);
}
ok(M.backendById('xpra').perWindow && M.backendById('xpra').adaptive && M.backendById('xpra').stream === 'xpra' && M.backendById('xpra').wired === true, 'xpra: per-window, adaptive, xpra stream, WIRED since P8-2 (DA1: installed ⇒ every NEW session takes it)');
ok(M.DISPLAY_BACKENDS.every((b) => b.wired === true), 'every SHIPPED row is wired — an unwired row is a table copy the suites hand in, never a product state');
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
  ok(M.resolveBackend({ bins: { Xvnc: '/x' } }).recipe === 'x-serves-rfb' && M.resolveBackend({ bins: {}, singletonRunning: true }).recipe === 'shared' && M.resolveBackend({ bins: { xpra: '/x' } }).recipe === 'xpra-seamless' && M.resolveBackend({ bins: { xpra: '/x' } }).backend === 'xpra' && M.resolveBackend({ bins: { xpra: '/x' } }).stream === 'xpra', 'each rung resolves to its own recipe name (one-pid Xvnc / the shared desktop / xpra ⇒ xpra-seamless, stream xpra)');
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
    { id: 'xpra', groups: [['xpra']], wired: true }, // P8-2: wired (DA1) — 2.369.131's present-but-unwired verdict lives on as the control below
    { id: 'vnc-display', groups: [['Xvnc'], ['Xvfb', 'x11vnc']], wired: true },
    { id: 'desktop-singleton', groups: [['Xtigervnc'], ['Xvnc'], ['desktop-singleton:running']], wired: true },
  ];
  const fell = [];
  for (const r of rows) {
    const g = r.groups.find((grp) => grp.every((b) => (b === 'desktop-singleton:running' ? singletonRunning : has(b))));
    if (g && r.wired) return { backend: r.id, via: g.join('+'), fallbackWhy: fell.length ? fell.join('; ') : null };
    fell.push(g ? `${r.id} present (${g.join('+')}) but not wired` : r.groups.map((grp) => `${grp.join('+')} not on PATH`).join('; '));
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
  // THIS BOX SINCE P8-2 (2026-09-21): xpra 6.5.3 installed AND wired ⇒ xpra wins outright (DA1), nothing
  // fell, no log line. 2.369.131's present-but-unwired verdict (the day the binary landed on an unwired
  // row: the ladder chose it and the keeper refused every launch) is kept as the CONTROL through a table
  // copy — the shipped table has no unwired row.
  const r = M.resolveBackend({ bins: { xpra: '/usr/bin/xpra', Xvfb: '/usr/bin/Xvfb', x11vnc: '/usr/bin/x11vnc' } });
  ok(r.backend === 'xpra' && r.via === 'xpra' && r.stream === 'xpra' && r.recipe === 'xpra-seamless' && r.fallbackWhy === null && r.ladder[0].ok === true && r.ladder[0].present === true && M.fallbackLogLine(r) === null, 'THIS BOX SINCE P8-2: xpra present + wired ⇒ xpra via xpra-seamless, stream xpra, no fallback, no log line', r);
  ok(r.ladder.length === 3 && r.ladder[1].backend === 'vnc-display' && r.ladder[1].ok === true && r.ladder[1].via === 'Xvfb+x11vnc', 'the ladder still reports the rungs below the winner as runnable (the launcher shows every rung)', r.ladder);
  const unwiredTable = M.DISPLAY_BACKENDS.map((b) => (b.id === 'xpra' ? Object.freeze({ ...b, wired: false }) : b));
  const ru = M.resolveBackend({ bins: { xpra: '/usr/bin/xpra', Xvfb: '/usr/bin/Xvfb', x11vnc: '/usr/bin/x11vnc' } }, {}, unwiredTable);
  ok(ru.backend === 'vnc-display' && ru.via === 'Xvfb+x11vnc' && ru.stream === 'rfb' && ru.fallbackWhy === 'xpra present (xpra) but not wired' && ru.ladder[0].present === true && ru.ladder[0].ok === false && ru.ladder[0].recipe === 'xpra-seamless', 'CONTROL (2.369.131): with the xpra row UNWIRED the same box resolves to vnc-display, the reason names the unwired rung, the ladder still reports xpra as present with its recipe', ru);
  ok(M.fallbackLogLine(ru) === '[desktop] backend fallback: xpra→vnc-display (xpra present (xpra) but not wired)', 'the §3 log line names the unwired rung', M.fallbackLogLine(ru));
  // the instance preference (settings desktop.backendPrefs): REORDERS, never invents — the suites' pin and the owner's escape hatch
  const rp = M.resolveBackend({ bins: { xpra: '/usr/bin/xpra', Xvfb: '/usr/bin/Xvfb', x11vnc: '/usr/bin/x11vnc' } }, { backendPrefs: M.parseBackendPrefs('vnc-display, xpra, desktop-singleton') });
  ok(rp.backend === 'vnc-display' && rp.fallbackWhy === null && rp.ladder.length === 3 && rp.ladder[0].backend === 'vnc-display' && rp.ladder[1].backend === 'xpra' && rp.ladder[1].ok === true, 'prefs "vnc-display, xpra, desktop-singleton" put the whole-display rung first: it wins with NO fallback (nothing fell) and xpra is still reported runnable below it', rp);
  ok(same(M.parseBackendPrefs('vnc-display, xpra,nonsense,, xpra'), ['vnc-display', 'xpra']) && same(M.parseBackendPrefs(['xpra', 'bogus']), ['xpra']) && same(M.parseBackendPrefs(''), []) && same(M.parseBackendPrefs(undefined), []) && same(M.parseBackendPrefs(42), []), 'parseBackendPrefs: comma/space list or array, known ids only, deduped, empty/garbage ⇒ [] (= the table order)');
  ok(M.streamKindOf({ backend: 'xpra' }) === 'xpra' && M.streamKindOf({ backend: 'vnc-display' }) === 'rfb' && M.streamKindOf({ backend: 'desktop-singleton' }) === 'rfb' && M.streamKindOf({ backend: 'nope' }) === null && M.streamKindOf(null) === null, 'streamKindOf: the rung\'s stream kind from the table (the client picks its view by KIND, never by a backend id)');
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
  ok(r5.backend === 'xpra' && r5.ladder.length === 3 && r5.ladder[0].backend === 'xpra' && r5.ladder[0].present === true, 'unknown pref ids are ignored, never invented as rungs (the full ladder runs in table order — xpra wins)');
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
  // P8-2 x4: a SetDesktopSize is REPORTED (w, h) as it passes — split across chunks it is reported ONCE — and is never an input
  {
    const got = [];
    const s4 = S.rfbInputSieve({ onDesktopSize: (w, h) => got.push([w, h]) });
    const sd = Buffer.alloc(24); sd[0] = 251; sd.writeUInt16BE(900, 2); sd.writeUInt16BE(600, 4); sd[6] = 1; sd.writeUInt16BE(900, 16); sd.writeUInt16BE(600, 18);
    let n4 = 0; for (const b of [...hs, sd.subarray(0, 9), sd.subarray(9), key]) n4 += s4.feed(b);
    ok(same(got, [[900, 600]]) && n4 === 1 && s4.state().pending === 0 && !s4.state().opaque, 'a SetDesktopSize split across two chunks is reported ONCE as 900x600, counts as no input, and the KeyEvent after it counts');
    const s5 = S.rfbInputSieve(); let n5 = 0; for (const b of [...hs, sd, key]) n5 += s5.feed(b);
    ok(n5 === 1 && s5.state().messages === 2, 'CONTROL: a sieve built without the hook walks the same bytes unchanged');
    const s6 = S.rfbInputSieve({ onDesktopSize: () => { throw new Error('keeper down'); } }); let n6 = 0; for (const b of [...hs, sd, key]) n6 += s6.feed(b);
    ok(n6 === 1 && !s6.state().opaque, 'a hook that throws never breaks the walk (the keeper is optional at the bridge)');
    const hsLen = hs.reduce((a, b) => a + b.length, 0);
    const ra = S.rfbInputSieve({ onDesktopSize: (w, h) => got.push(['allowed', w, h]) }).strip(Buffer.concat([...hs, sd, key]), true);
    ok(same(got[1], ['allowed', 900, 600]) && ra.dropped === 0 && ra.relay && ra.relay.length === hsLen + 24 + key.length, 'through strip() with input ALLOWED the SetDesktopSize is relayed and reported (the holder\'s pane sizes the display)');
    // r8 (2026-09-22, the twin of the xpra display-size fence): a REFUSED viewer's SetDesktopSize is cut — Xvnc resizes the
    // SHARED display for whoever asks — and never reported (the display did not move); the FramebufferUpdateRequest beside it passes
    const fur = Buffer.from([3, 1, 0, 0, 0, 0, 3, 0, 2, 0]);
    const sr = S.rfbInputSieve({ onDesktopSize: (w, h) => got.push(['refused', w, h]) });
    const r = sr.strip(Buffer.concat([...hs, sd, fur, key]), false);
    ok(got.length === 2 && r.dropped === 2 && r.relay && r.relay.equals(Buffer.concat([...hs, fur])) && !sr.state().opaque, 'through strip() with input REFUSED the SetDesktopSize is CUT and not reported, beside the KeyEvent; the handshake + FramebufferUpdateRequest pass', { got, dropped: r.dropped });
    const r2 = sr.strip(Buffer.concat([sd.subarray(0, 9)]), false), r3 = sr.strip(sd.subarray(9), false);
    ok(r2.relay === null && r3.relay === null && r3.dropped === 1 && got.length === 2, 'a refused SetDesktopSize split across two chunks is cut whole, never reported');
    const r4 = sr.strip(sd, true);
    ok(r4.relay && r4.relay.equals(sd) && same(got[2], ['refused', 900, 600]), 'the same viewer ALLOWED (a takeover) ⇒ its next SetDesktopSize passes and is reported (the sieve\'s refusal is per message, never sticky)');
    // CONTROL: the x4 strip (a SetDesktopSize relayed whatever the policy) — the reproduced class
    const srcS = read('src/server/desktop-stream.js');
    const from = "if ((input || type === 251) && !allowInput) dropped++;";
    ok(srcS.split(from).length === 2, 'the rfb strip decision is spelled once (the control patches exactly it)');
    const file = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-rfbsize.js`);
    fs.writeFileSync(file, srcS.replace(from, "if (input && !allowInput) /* pre-fix (x4) */ dropped++;"));
    try {
      const rc = require(file).rfbInputSieve().strip(Buffer.concat([...hs, sd, key]), false);
      ok(rc.relay && rc.relay.equals(Buffer.concat([...hs, sd])) && rc.dropped === 1, 'CONTROL: the x4 strip relays a refused viewer\'s SetDesktopSize (Xvnc would resize the holder\'s display)');
    } finally { try { fs.unlinkSync(file); } catch {} }
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

console.log('§8 the xpra client stream, classified (P8-2) — the sieve, the netem knob, the client\'s own vocabulary');
{
  const S = require('../src/server/desktop-stream.js');
  // a rencodeplus packet: header P, flags 0x10 (rencodeplus), level 0, index 0, size; payload = list [type, 0]
  const rpkt = (type, { flags = 0x10, level = 0, index = 0, tail = Buffer.from([0]) } = {}) => { const t = Buffer.from(type); const payload = Buffer.concat([Buffer.from([192 + 2, 128 + t.length]), t, tail]); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = flags; h[2] = level; h[3] = index; h.writeUInt32BE(payload.length, 4); return Buffer.concat([h, payload]); };
  const bpkt = (type) => { const b = Buffer.from(`l${type.length}:${type}i0ee`); const h = Buffer.alloc(8); h[0] = 0x50; h.writeUInt32BE(b.length, 4); return Buffer.concat([h, b]); };
  const sv = S.xpraInputSieve();
  ok(sv.feed(rpkt('ping')) === 0 && sv.feed(rpkt('damage-sequence')) === 0 && sv.feed(rpkt('hello')) === 0 && sv.feed(rpkt('configure-window')) === 0, 'ping / damage-sequence / hello / configure-window are the client talking, not the user (0 inputs)');
  ok(sv.feed(rpkt('key-action')) === 1 && sv.feed(rpkt('button-action')) === 1 && sv.feed(rpkt('pointer-position')) === 1 && sv.feed(rpkt('wheel-motion')) === 1 && sv.feed(rpkt('clipboard-token')) === 1 && sv.feed(rpkt('clipboard-contents')) === 1, 'key-action / button-action / pointer-position / wheel-motion / clipboard-token / clipboard-contents each count as ONE input');
  ok(sv.feed(Buffer.concat([rpkt('damage-sequence'), rpkt('key-action'), rpkt('ping_echo'), rpkt('pointer-button')])) === 2, 'several packets in one chunk: each judged, two inputs');
  const half = rpkt('button-action');
  ok(sv.feed(half.subarray(0, 5)) === 0 && sv.state().pending === 5 && sv.feed(half.subarray(5)) === 1 && sv.state().pending === 0, 'a packet split across chunks waits for its tail, then counts once');
  ok(sv.feed(rpkt('ping', { index: 1 })) === 0 && sv.feed(rpkt('key-action', { index: 2 })) === 0 && sv.state().group === 2, 'a raw chunk (packet index ≠ 0) is never judged on its own — it waits for the main packet that FOLLOWS it (xpra\'s net/protocol.py sends raw chunks first)');
  ok(sv.feed(rpkt('ping', { level: 0x10 | 1 })) === 1 && sv.state().unread === 1, 'a COMPRESSED packet cannot be read ⇒ it COUNTS (never reap a live user)');
  ok(sv.feed(rpkt('ping', { flags: 0x4 })) === 1, 'a yaml-encoded packet cannot be read ⇒ counts');
  ok(sv.feed(Buffer.from('not a header at all')) === 1 && sv.state().pending === 0, 'bytes that are not an xpra header count once and are dropped (resync on the next chunk)');
  // strip(): THE POLICY PER PACKET (2026-09-22) — a refused viewer's INPUT packets are cut out, everything else relayed byte-identical
  {
    const st = S.xpraInputSieve();
    const talk = ['hello', 'ping_echo', 'damage-sequence', 'map-window'];
    const r1 = st.strip(Buffer.concat([rpkt('hello'), rpkt('key-action'), rpkt('ping_echo'), rpkt('button-action'), rpkt('damage-sequence'), rpkt('clipboard-token'), rpkt('map-window'), rpkt('configure-window'), rpkt('keyboard-config')]), false);
    ok(r1.inputs === 3 && r1.dropped === 5 && r1.relay.equals(Buffer.concat(talk.map((t) => rpkt(t)))), 'strip(refused): key-action / button-action / clipboard-token cut out, keyboard-config and (x5) configure-window fenced, hello / ping_echo / damage-sequence / map-window relayed byte-identical in order', { inputs: r1.inputs, dropped: r1.dropped });
    const r2 = st.strip(Buffer.concat([rpkt('hello'), rpkt('key-action')]), true);
    ok(r2.inputs === 1 && r2.dropped === 0 && r2.replayed === 2 && r2.replayedKinds.join() === 'keymap,window geometry' && r2.relay.equals(Buffer.concat([rpkt('keyboard-config'), rpkt('configure-window'), rpkt('hello'), rpkt('key-action')])), 'strip(allowed): everything relayed, the input still COUNTED — and the keyboard-config + configure-window fenced a moment ago go FIRST, in that order (held for the takeover)');
    const ka = rpkt('key-action');
    const r3a = st.strip(ka.subarray(0, 6), false), r3b = st.strip(ka.subarray(6), false);
    ok(r3a.relay === null && r3a.dropped === 0 && r3b.dropped === 1 && r3b.relay === null && st.state().pending === 0, 'a refused input split across two messages: the head is HELD (never relayed alone), the tail completes it and the whole packet is dropped');
    const hl = rpkt('hello');
    const r4a = st.strip(hl.subarray(0, 9), false), r4b = st.strip(hl.subarray(9), false);
    ok(r4a.relay === null && r4b.relay && r4b.relay.equals(hl), 'a hello split across two messages under a refusal is relayed WHOLE once complete');
    const r5 = st.strip(Buffer.concat([rpkt('x', { index: 1 }), rpkt('key-action')]), false);
    const r6 = st.strip(Buffer.concat([rpkt('x', { index: 1 }), rpkt('damage-sequence')]), false);
    ok(r5.relay === null && r5.dropped === 1 && r6.relay && r6.relay.equals(Buffer.concat([rpkt('x', { index: 1 }), rpkt('damage-sequence')])), 'a raw chunk travels WITH the main packet after it: dropped with a refused input, relayed with a relayed packet');
    const r7 = st.strip(Buffer.from('garbage that is not a header'), false), r8 = S.xpraInputSieve().strip(Buffer.from('garbage that is not a header'), true);
    ok(r7.relay === null && r7.dropped === 1 && r8.relay && r8.relay.toString() === 'garbage that is not a header' && r8.inputs === 1, 'unreadable bytes are input: DROPPED under a refusal (never injected behind it), relayed and counted when allowed');
    const r9 = st.strip(rpkt('ping', { level: 0x10 | 1 }), false);
    ok(r9.relay === null && r9.dropped === 1, 'a COMPRESSED packet cannot be read ⇒ treated as input ⇒ dropped under a refusal (the upstream html5 client never compresses what it sends)');
  }
  // WHAT A REFUSED VIEWER MAY SAY (round 2 of the P8-2 verify, 2026-09-22): an ALLOWLIST. A Watch-mode viewer's relayed
  // `shutdown-server` ended the whole app session on the real rung (xpra honours it from any client); every CONTROL
  // packet xpra knows is the same class. The server's lifecycle is the keeper's: shutdown-server / exit-server are cut
  // from EVERY viewer.
  const CONTROL = ['shutdown-server', 'exit-server', 'control', 'command_request', 'info-request', 'set-clipboard-enabled', 'sharing-toggle', 'logging', 'disconnect', 'suspend', 'set_deflate', 'no-such-packet'];
  const refusedBytes = Buffer.concat([rpkt('hello'), ...CONTROL.map((t) => rpkt(t)), rpkt('ping_echo')]);
  {
    const st = S.xpraInputSieve();
    const r = st.strip(refusedBytes, false);
    ok(r.relay && r.relay.equals(Buffer.concat([rpkt('hello'), rpkt('ping_echo')])) && r.dropped === CONTROL.length && r.lifecycle === 2 && r.inputs === 0, `strip(refused): only hello + ping_echo relayed — ${CONTROL.length} control packets cut (${CONTROL.join(', ')}), none of them counted as input, 2 named server-lifecycle`, { dropped: r.dropped, lifecycle: r.lifecycle, relayed: r.relay && r.relay.length });
    const a = S.xpraInputSieve().strip(Buffer.concat([rpkt('shutdown-server'), rpkt('control'), rpkt('exit-server'), rpkt('key-action')]), true);
    ok(a.relay && a.relay.equals(Buffer.concat([rpkt('control'), rpkt('key-action')])) && a.dropped === 2 && a.lifecycle === 2 && a.inputs === 1, 'strip(ALLOWED): shutdown-server and exit-server are cut from an input-allowed viewer too (the keeper owns the server\'s lifecycle); its other control and input packets pass');
    const bl = S.xpraInputSieve().strip(Buffer.concat([bpkt('shutdown-server'), bpkt('exit-server')]), true);
    ok(bl.relay === null && bl.lifecycle === 2, 'the bencode spelling of shutdown-server / exit-server is cut the same way');
    ok([...S.XPRA_WATCH_TYPES].every((t) => !S.XPRA_INPUT_TYPES.has(t) && !S.XPRA_LIFECYCLE_TYPES.has(t)), 'no watch type is input or lifecycle (the three sets are disjoint where it matters)');
    for (const t of S.XPRA_WATCH_TYPES) { const x = S.xpraInputSieve().strip(rpkt(t), false); ok(x.relay && x.relay.equals(rpkt(t)) && x.dropped === 0, `watch type ${t} is relayed for a refused viewer`); }
  }
  // THE SHIPPED CLIENT'S OWN PACKETS (src/lib/xpra-proto.js builders xpra-client.js sends with): every non-input one is
  // a watch type — a refused viewer's picture never loses a packet it needs (the r5 regression this allowlist must not reopen)
  {
    const P = await import('../src/lib/xpra-proto.js');
    const hints = ['display-configure', 'configure-display', 'keyboard-config'];
    const built = [
      ['hello', {}], P.pingPacket(1), P.pingEcho(1), P.damageAck(1, 1, 10, 10, 0), P.mapWindow(1, { x: 0, y: 0, w: 1, h: 1 }), P.configureWindow(1, { x: 0, y: 0, w: 1, h: 1 }), P.unmapWindow(1), P.clipboardNone(1, 'CLIPBOARD'),
    ].map((p) => String(p[0]));
    const keymaps = [P.keyboardConfigPacket(hints), P.keyboardConfigPacket([])].map((p) => String(p[0]));
    ok(keymaps.join() === 'keyboard-config,keymap-changed' && keymaps.every((t) => S.XPRA_KEYMAP_TYPES.has(t) && !S.XPRA_WATCH_TYPES.has(t)), `both keymap spellings the shipped client builds (${keymaps.join(', ')}) are XPRA_KEYMAP_TYPES and NOT watch types — the keymap fence`);
    const sizes = [P.displayPacket(['display-configure'], { width: 10, height: 10 }), P.displayPacket(['configure-display'], { width: 10, height: 10 }), P.displayPacket([], { width: 10, height: 10 })].map((p) => String(p[0]));
    ok(sizes.join() === 'display-configure,configure-display,desktop_size' && sizes.every((t) => S.XPRA_DISPLAY_TYPES.has(t) && !S.XPRA_WATCH_TYPES.has(t)), `all three display-size spellings the shipped client builds (${sizes.join(', ')}) are XPRA_DISPLAY_TYPES and NOT watch types — the display-size fence`);
    const client = read('src/lib/xpra-client.js');
    const used = [...new Set([...client.matchAll(/send\(P\.([a-zA-Z]+)\(/g)].map((m) => m[1]))];
    const nonInputBuilders = ['pingPacket', 'pingEcho', 'damageAck', 'mapWindow', 'configureWindow', 'clipboardNone', 'keyboardConfigPacket', 'displayPacket'];
    const inputBuilders = ['keyAction', 'buttonAction', 'pointerPosition', 'clipboardToken', 'clipboardContents', 'focusPacket', 'closeWindow'];
    ok(used.length >= 10 && used.every((u) => nonInputBuilders.includes(u) || inputBuilders.includes(u)), `every builder xpra-client.js sends through is classified here (${used.join(', ')}) — a new one must be judged watch or input`, used);
    // x5: configure-window LEFT the watch list (the geometry is the ACTIVE viewer's — held, replayed at a takeover) and so
    // did unmap-window (it unmaps the window for EVERY client; the shipped client never sends one — `used` above pins it)
    const watchOrHeld = (t) => S.XPRA_WATCH_TYPES.has(t) || S.XPRA_GEOMETRY_TYPES.has(t);
    ok(built.filter((t) => t !== 'unmap-window').every(watchOrHeld), `every non-input packet the shipped client sends is a watch type or a HELD geometry packet (${built.join(', ')})`, built.filter((t) => !watchOrHeld(t)));
    ok(!S.XPRA_WATCH_TYPES.has('configure-window') && S.XPRA_GEOMETRY_TYPES.has('configure-window') && !S.XPRA_WATCH_TYPES.has('unmap-window') && !used.includes('unmapWindow'), 'x5: configure-window is a HELD geometry packet and unmap-window is cut for a refused viewer (the shipped client never sends one)');
  }
  // the installed server's own lifecycle handlers (SKIP without the package): both spellings it registers are ours
  {
    const base = ['/usr/lib/python3/dist-packages/xpra/server/base.py'].find((f) => fs.existsSync(f));
    if (!base) console.log('  ⚠ SKIP: no xpra server/base.py on this box — the lifecycle census needs the installed server');
    else { const txt = fs.readFileSync(base, 'utf8'); const reg = /add_packets\(\s*"shutdown-server",\s*"exit-server"\s*\)/.test(txt); ok(reg && S.XPRA_LIFECYCLE_TYPES.has('shutdown-server') && S.XPRA_LIFECYCLE_TYPES.has('exit-server'), 'the installed server registers shutdown-server + exit-server as client packets (server/base.py add_packets) — both are XPRA_LIFECYCLE_TYPES'); }
  }
  // NEGATIVE CONTROL: the r5 strip (a denylist of input — every non-input packet relayed) on the same bytes relays the lifecycle packets
  {
    const srcS = read('src/server/desktop-stream.js');
    const from = "      if (life || (!allowInput && !(type !== null && XPRA_WATCH_TYPES.has(type)))) dropped++; else keep.push(u);";
    ok(srcS.split(from).length === 2, 'the allowlist decision is spelled once in the bridge (the control patches exactly it)');
    const dir = path.join(repo, 'src/server');
    const file = path.join(dir, `vs-dak-mut-${process.pid}-xstream.js`);
    fs.writeFileSync(file, srcS.replace(from, '      if (input && !allowInput) dropped++; else keep.push(u); // pre-fix (r5): a denylist of input'));
    try {
      const Pm = require(file);
      const r = Pm.xpraInputSieve().strip(refusedBytes, false);
      const types = []; for (let b = r.relay || Buffer.alloc(0); b.length >= 8;) { const n = b.readUInt32BE(4); types.push(S.xpraPacketType(b.subarray(8, 8 + n))); b = b.subarray(8 + n); }
      ok(types.includes('shutdown-server') && types.includes('exit-server') && r.dropped === 0, `CONTROL: the r5 strip relays a refused viewer's ${types.length} packets incl. shutdown-server + exit-server (the reproduced session kill)`, types);
    } finally { try { fs.unlinkSync(file); } catch {} }
  }
  // THE KEYMAP FENCE (hole B the r6 verify left open, 2026-09-22 — measured on the real rung: a Watch viewer's
  // keyboard-config reprogrammed the display's X keymap, which the holder / an agent's xdotool types through). A refused
  // viewer's keyboard-config / keymap-changed are cut like input; the LAST one is HELD and replayed ahead of everything
  // the first time its input is allowed (the shipped client sends its keymap once, after the hello: a pane that connected
  // in Watch mode and took over typed garbage without the replay — test-desktop-app-keeper §15 measures both on xpra).
  {
    const kc = rpkt('keyboard-config'), km = rpkt('keymap-changed'), pe = rpkt('ping_echo');
    ok([...S.XPRA_KEYMAP_TYPES].sort().join() === 'keyboard-config,keymap-changed' && [...S.XPRA_KEYMAP_TYPES].every((t) => !S.XPRA_WATCH_TYPES.has(t) && !S.XPRA_INPUT_TYPES.has(t)), 'XPRA_KEYMAP_TYPES = keyboard-config + keymap-changed: neither a watch type nor input');
    const st = S.xpraInputSieve();
    const a = st.strip(Buffer.concat([rpkt('hello'), kc, pe, km]), false);
    ok(a.relay && a.relay.equals(Buffer.concat([rpkt('hello'), pe])) && a.dropped === 2 && a.inputs === 0 && st.state().heldKeymap === km.length, 'refused: keyboard-config and keymap-changed are cut (neither counted as input), the hello and ping_echo pass; the LAST keymap packet is held', st.state());
    const b2 = st.strip(pe, false);
    ok(b2.relay && b2.relay.equals(pe) && b2.replayed === 0 && st.state().heldKeymap === km.length, 'still refused: nothing replayed, the keymap still held');
    const c = st.strip(pe, true);
    ok(c.replayed === 1 && c.relay && c.relay.equals(Buffer.concat([km, pe])) && st.state().heldKeymap === 0, 'the first ALLOWED message (a takeover) carries the held keymap AHEAD of its own packets, in one write');
    const d = st.strip(pe, true);
    ok(d.replayed === 0 && d.relay.equals(pe), 'replayed once, never again');
    const e = st.strip(kc, true);
    ok(e.relay && e.relay.equals(kc) && e.dropped === 0, 'an ALLOWED viewer\'s keyboard-config passes as before (the holder\'s keymap is the one X should carry)');
    const s2 = S.xpraInputSieve();
    const big = rpkt('keyboard-config', { tail: Buffer.alloc(S.XPRA_KEYMAP_HOLD_BYTES) });
    const f1 = s2.strip(big, false), f2 = s2.strip(pe, true);
    ok(f1.relay === null && f1.dropped === 1 && s2.state().heldKeymap === 0 && f2.replayed === 0 && f2.relay.equals(pe), `a refused keymap packet over XPRA_KEYMAP_HOLD_BYTES (${S.XPRA_KEYMAP_HOLD_BYTES} B; the shipped client's is ~2.4 KB) is cut and NOT held — nothing to replay`);
    const s3 = S.xpraInputSieve();
    s3.strip(kc, false);
    const g = s3.strip(Buffer.concat([rpkt('shutdown-server'), pe]), true);
    ok(g.replayed === 1 && g.relay.equals(Buffer.concat([kc, pe])) && g.lifecycle === 1, 'the replay rides a message whose other packet is cut (the lifecycle rule still holds)');
  }
  // CONTROL: the r6 allowlist (keyboard-config / keymap-changed listed as watch types) relays a refused viewer's keymap
  {
    const srcS = read('src/server/desktop-stream.js');
    const from = "const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', ";
    ok(srcS.split(from).length === 2, 'the watch allowlist is spelled once in the bridge (the control patches exactly it)');
    const file = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-xkeymap.js`);
    fs.writeFileSync(file, srcS.replace(from, "const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', 'keyboard-config', 'keymap-changed', "));
    try {
      const Pm = require(file);
      const r = Pm.xpraInputSieve().strip(Buffer.concat([rpkt('keyboard-config'), rpkt('keymap-changed')]), false);
      ok(r.relay && r.relay.equals(Buffer.concat([rpkt('keyboard-config'), rpkt('keymap-changed')])) && r.dropped === 0, 'CONTROL: the r6 allowlist relays a refused viewer\'s keyboard-config + keymap-changed (the reproduced keymap change)');
    } finally { try { fs.unlinkSync(file); } catch {} }
  }
  // THE DISPLAY-SIZE FENCE (round 3 of the P8-2 verify, 2026-09-22 — reproduced on the real rung: a Watch viewer's
  // display-configure 1x1 shrank the holder's 900x600 shared display to 1x1, and it stayed after the watcher left). The
  // keymap rule applied to the virtual root: cut for a refused viewer, the LAST one held and replayed at its takeover
  // (after the keymap, in one write) — test-desktop-app-keeper §16 measures both on the real xpra.
  {
    const dc = rpkt('display-configure'), cd = rpkt('configure-display'), ds = rpkt('desktop_size'), kc = rpkt('keyboard-config'), pe = rpkt('ping_echo');
    ok([...S.XPRA_DISPLAY_TYPES].sort().join() === 'configure-display,desktop_size,display-configure' && [...S.XPRA_DISPLAY_TYPES].every((t) => !S.XPRA_WATCH_TYPES.has(t) && !S.XPRA_INPUT_TYPES.has(t) && !S.XPRA_KEYMAP_TYPES.has(t)), 'XPRA_DISPLAY_TYPES = display-configure + configure-display + desktop_size: not a watch type, not input, not a keymap type');
    const st = S.xpraInputSieve();
    const a = st.strip(Buffer.concat([rpkt('hello'), dc, pe, cd, ds]), false);
    ok(a.relay && a.relay.equals(Buffer.concat([rpkt('hello'), pe])) && a.dropped === 3 && a.inputs === 0 && st.state().heldDisplay === ds.length && st.state().heldKeymap === 0, 'refused: all three display-size spellings are cut (none counted as input), the hello and ping_echo pass; the LAST one is held', st.state());
    st.strip(kc, false);
    const b2 = st.strip(pe, false);
    ok(b2.relay && b2.relay.equals(pe) && b2.replayed === 0 && st.state().heldDisplay === ds.length && st.state().heldKeymap === kc.length, 'still refused: nothing replayed — a keymap and a display size both held');
    const c = st.strip(pe, true);
    ok(c.replayed === 2 && c.replayedKinds.join() === 'keymap,display size' && c.relay && c.relay.equals(Buffer.concat([kc, ds, pe])) && st.state().heldDisplay === 0 && st.state().heldKeymap === 0, 'the takeover carries the held keymap THEN the held display size ahead of its own packets, in one write; replayedKinds names both (the log line\'s words)', c.replayedKinds);
    const d = st.strip(dc, true);
    ok(d.relay && d.relay.equals(dc) && d.dropped === 0 && d.replayed === 0, 'an ALLOWED viewer\'s display-configure passes as before (the holder\'s pane sizes the display)');
    const s2 = S.xpraInputSieve();
    const f1 = s2.strip(rpkt('display-configure', { tail: Buffer.alloc(S.XPRA_DISPLAY_HOLD_BYTES) }), false), f2 = s2.strip(pe, true);
    ok(f1.relay === null && f1.dropped === 1 && s2.state().heldDisplay === 0 && f2.replayed === 0 && f2.relay.equals(pe), `a refused display packet over XPRA_DISPLAY_HOLD_BYTES (${S.XPRA_DISPLAY_HOLD_BYTES} B) is cut and NOT held — nothing to replay`);
    const src = read('src/server/desktop-stream.js');
    ok(!/XPRA_WATCH_TYPES = [^\n]*'(display-configure|configure-display|desktop_size)'/.test(src), 'the bridge spells no display-size packet in its watch allowlist');
  }
  // CONTROL: the r7 allowlist (the display-size packets listed as watch types) relays a refused viewer's display size
  {
    const srcS = read('src/server/desktop-stream.js');
    const from = "const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', ";
    ok(srcS.split(from).length === 2, 'the watch allowlist is spelled once in the bridge (the display control patches exactly it)');
    const file = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-xdisplay.js`);
    fs.writeFileSync(file, srcS.replace(from, from + "'display-configure', 'configure-display', 'desktop_size', "));
    try {
      const Pm = require(file);
      const bytes = Buffer.concat([rpkt('display-configure'), rpkt('configure-display'), rpkt('desktop_size')]);
      const r = Pm.xpraInputSieve().strip(bytes, false);
      ok(r.relay && r.relay.equals(bytes) && r.dropped === 0, 'CONTROL: the r7 allowlist relays a refused viewer\'s display-configure + configure-display + desktop_size (the reproduced 900x600 ⇒ 1x1)');
    } finally { try { fs.unlinkSync(file); } catch {} }
    // CONTROL: the fence without the replay — a takeover carries nothing it held
    const fromN = '    if (allowInput && !st.oversize) {';
    ok(srcS.split(fromN).length === 2, 'the replay is spelled once in the bridge (the no-replay control patches exactly it)');
    const nfile = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-xnoreplay.js`);
    fs.writeFileSync(nfile, srcS.replace(fromN, '    if (false && allowInput) { /* pre-fix: fenced and never replayed */'));
    try {
      const sn = require(nfile).xpraInputSieve();
      sn.strip(rpkt('display-configure'), false);
      const c = sn.strip(rpkt('ping_echo'), true);
      ok(c.replayed === 0 && c.relay.equals(rpkt('ping_echo')), 'CONTROL: fenced without the replay, the takeover carries no held display size (the pane that took over keeps the old holder\'s)');
    } finally { try { fs.unlinkSync(nfile); } catch {} }
  }
  // THE HELD-BYTES CAP (hole A the r6 verify left open, 2026-09-22 — reproduced: a viewer DECLARING a 2 GiB packet and
  // streaming it grew the server by ~1 GB). A header declaring more than XPRA_MAX_PACKET_BYTES is judged in the chunk that
  // carries it; an incomplete packet + its raw chunks may hold at most one largest packet; the rfb stream's one
  // self-declared length (ClientCutText) has the same cap. test-desktop-stream-keepalive §5 drives the bridge's close.
  {
    const MiB = 1024 * 1024;
    ok(S.XPRA_MAX_PACKET_BYTES === 16 * MiB && S.RFB_MAX_MESSAGE_BYTES === 16 * MiB && S.WS_MAX_MESSAGE_BYTES === 16 * MiB + 8 && S.OVERSIZE_CLOSE === 1009 && S.OVERSIZE_REASON === 'packet-too-large', 'the caps: 16 MiB per xpra packet and per rfb cut text, one packet + its header per WebSocket message, closed 1009 packet-too-large');
    const consts = '/usr/lib/python3/dist-packages/xpra/net/constants.py', core = '/usr/lib/python3/dist-packages/xpra/server/core.py';
    if (!fs.existsSync(consts) || !fs.existsSync(core)) console.log('  ⚠ SKIP: no installed xpra net/constants.py + server/core.py — the "same number as xpra\'s own limit" census needs the package');
    else ok(/MAX_PACKET_SIZE: int = envint\("XPRA_MAX_PACKET_SIZE", 16 \* 1024 \* 1024\)/.test(fs.readFileSync(consts, 'utf8')) && /def accept_protocol[\s\S]{0,600}proto\.max_packet_size = MAX_PACKET_SIZE/.test(fs.readFileSync(core, 'utf8')), 'the installed xpra refuses a client packet over the SAME 16 MiB (net/constants.py MAX_PACKET_SIZE, set on every client connection by server/core.py accept_protocol) — the cap cuts nothing xpra would take');
    const hdr = (size, index = 0) => { const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h[3] = index; h.writeUInt32BE(size >>> 0, 4); return h; };
    const st = S.xpraInputSieve();
    const r = st.strip(Buffer.concat([rpkt('ping_echo'), hdr(2 ** 31), Buffer.alloc(1024)]), true);
    ok(r.oversize && r.oversize.declared === 2 ** 31 && r.oversize.cap === 16 * MiB && r.relay && r.relay.equals(rpkt('ping_echo')) && st.state().pending === 0, 'a header DECLARING 2 GiB is judged in the chunk that carries it: oversize named (declared, cap), nothing held, the complete packet before it still relayed', r.oversize);
    const r2 = st.strip(Buffer.alloc(MiB), true);
    ok(r2.relay === null && r2.oversize && st.state().pending === 0 && st.state().group === 0, 'after it NOTHING is held or relayed (the bridge is closing this viewer)');
    const s3 = S.xpraInputSieve();
    const e3 = s3.strip(hdr(16 * MiB), true);
    ok(!e3.oversize && s3.state().pending === 8 && s3.state().need === 16 * MiB + 8, 'exactly 16 MiB is xpra\'s own limit (it refuses MORE): the header is held, waiting for its bytes');
    const s3b = S.xpraInputSieve();
    ok(s3b.strip(hdr(16 * MiB + 1), true).oversize, '16 MiB + 1 is oversize');
    const s4 = S.xpraInputSieve({ maxPacket: 1024 });
    const raw = Buffer.concat([hdr(1000, 1), Buffer.alloc(1000)]);
    const g1 = s4.strip(raw, true);
    ok(!g1.oversize && s4.state().group === 1, 'a raw chunk (index 1) waits for its main packet');
    const g2 = s4.strip(Buffer.concat([hdr(1000), Buffer.alloc(100)]), true);
    ok(g2.oversize && /raw chunks \+ a partial packet/.test(g2.oversize.what) && s4.state().group === 0 && s4.state().pending === 0, `raw chunks + a partial packet holding more than one largest packet (1008 + 108 > 1032 at a 1024 cap) ⇒ oversize, both released`, g2.oversize);
    // a legitimate 16 MiB packet streamed in 64 KiB messages completes and is relayed WHOLE (held as a list, joined once)
    const s5 = S.xpraInputSieve();
    const bigPkt = rpkt('clipboard-contents', { tail: Buffer.alloc(16 * MiB - 64) });
    const t5 = Date.now(); const outs = [];
    for (let i = 0; i < bigPkt.length; i += 64 * 1024) { const x = s5.strip(bigPkt.subarray(i, i + 64 * 1024), true); if (x.relay) outs.push(x.relay); if (x.oversize) outs.push(null); }
    ok(outs.length === 1 && outs[0] && outs[0].equals(bigPkt) && s5.state().pending === 0, `a ${bigPkt.length - 8} B packet in ${Math.ceil(bigPkt.length / 65536)} messages is relayed whole, once (${Date.now() - t5} ms)`);
    // RFB: ClientCutText declares its own length (u32; negative = the extended clipboard)
    const hsR = [Buffer.from('RFB 003.008\n'), Buffer.from([1]), Buffer.from([1])];
    const cut = (n) => { const b = Buffer.alloc(8); b[0] = 6; b.writeInt32BE(n, 4); return b; };
    const rs = S.rfbInputSieve(); for (const x of hsR) rs.feed(x);
    const c1 = rs.strip(Buffer.concat([Buffer.from([3, 1, 0, 0, 0, 0, 0x04, 0x00, 0x03, 0x00]), cut(2 ** 31 - 1), Buffer.alloc(100)]), true);
    ok(c1.oversize && c1.oversize.declared === 2 ** 31 - 1 && c1.oversize.what === 'ClientCutText' && c1.relay && c1.relay.length === 10 && rs.state().pending === 0, 'rfb: a ClientCutText DECLARING 2 GiB is oversize in its own chunk; the FramebufferUpdateRequest before it relayed, nothing held', c1.oversize);
    ok(rs.feed(Buffer.alloc(MiB)) === 0 && rs.state().pending === 0, 'rfb: after it nothing is held');
    const rx = S.rfbInputSieve(); for (const x of hsR) rx.feed(x);
    ok(rx.strip(cut(-(2 ** 31)), true).oversize, 'rfb: the extended clipboard\'s negative length is judged by its magnitude (2^31 ⇒ oversize)');
    const ry = S.rfbInputSieve(); for (const x of hsR) ry.feed(x);
    const txt = Buffer.concat([cut(MiB), Buffer.alloc(MiB, 0x61)]); let yIn = 0, yRel = 0;
    for (let i = 0; i < txt.length; i += 64 * 1024) { const x = ry.strip(txt.subarray(i, i + 64 * 1024), true); yIn += x.inputs; if (x.relay) yRel += x.relay.length; if (x.oversize) yIn = -99; }
    ok(yIn === 1 && yRel === txt.length && ry.state().pending === 0, 'rfb: a 1 MiB cut text in 64 KiB chunks is relayed whole and counted ONE input (x11vnc takes up to 1 MB)');
  }
  // CONTROL: the bridge WITHOUT the cap (the constants patched to Infinity — the r6 sieve held every byte of an
  // incomplete packet) keeps holding a 2 GiB-declared packet's bytes as they stream
  {
    const srcS = read('src/server/desktop-stream.js');
    const from1 = 'const XPRA_MAX_PACKET_BYTES = 16 * 1024 * 1024;', from2 = 'const RFB_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;';
    ok(srcS.split(from1).length === 2 && srcS.split(from2).length === 2, 'each cap is spelled once in the bridge (the control patches exactly them)');
    const file = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-xcap.js`);
    fs.writeFileSync(file, srcS.replace(from1, 'const XPRA_MAX_PACKET_BYTES = Infinity; // pre-fix').replace(from2, 'const RFB_MAX_MESSAGE_BYTES = Infinity; // pre-fix'));
    try {
      const Pm = require(file);
      const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(2 ** 31, 4);
      const xs = Pm.xpraInputSieve(); let ov = null; xs.strip(h, true);
      for (let i = 0; i < 8; i++) { const x = xs.strip(Buffer.alloc(1024 * 1024), true); ov = ov || x.oversize; }
      ok(!ov && xs.state().pending === 8 + 8 * 1024 * 1024, `CONTROL: without the cap the xpra sieve HOLDS ${xs.state().pending} B of the 2 GiB packet and says nothing (the reproduced growth)`);
      const rs2 = Pm.rfbInputSieve(); for (const x of [Buffer.from('RFB 003.008\n'), Buffer.from([1]), Buffer.from([1])]) rs2.feed(x);
      const c = Buffer.alloc(8); c[0] = 6; c.writeInt32BE(2 ** 31 - 1, 4); rs2.feed(c);
      for (let i = 0; i < 4; i++) rs2.feed(Buffer.alloc(1024 * 1024));
      ok(!rs2.state().oversize && rs2.state().pending === 8 + 4 * 1024 * 1024, `CONTROL: without the cap the rfb sieve HOLDS ${rs2.state().pending} B of a 2 GiB cut text`);
    } finally { try { fs.unlinkSync(file); } catch {} }
  }
  const b = S.xpraInputSieve();
  ok(b.feed(bpkt('key-action')) === 1 && b.feed(bpkt('ping')) === 0 && b.feed(bpkt('clipboard-contents')) === 1, 'a bencode client (flags 0) is read the same way');
  ok(S.xpraPacketType(Buffer.concat([Buffer.from([192 + 1]), Buffer.from('70:'), Buffer.alloc(70, 0x61)])) === 'a'.repeat(70) && S.xpraPacketType(Buffer.from([192 + 1, 128 + 3])) === null && S.xpraPacketType(Buffer.from([1, 2, 3])) === null, 'xpraPacketType: the long-string spelling (length:bytes), a truncated string ⇒ null, a non-list ⇒ null');
  ok(same(S.xpraStrings(Buffer.concat([Buffer.from([192 + 3, 128 + 10]), Buffer.from('disconnect'), Buffer.from([128 + 16]), Buffer.from('connection error'), Buffer.from([128 + 5]), Buffer.from('oops!')])), ['disconnect', 'connection error', 'oops!']), 'xpraStrings reads the leading strings of a list — the words a `disconnect` carries, so the close line can NAME why xpra hung up');
  for (const t of S.XPRA_INPUT_TYPES) ok(S.xpraInputSieve().feed(rpkt(t)) === 1, `input type ${t} counts`);
  // the client's OWN vocabulary (xpra-html5's Constants.js on this box; SKIP with the reason elsewhere): every
  // type we count that the html5 client can emit is spelled there — a renamed packet would silently stop counting
  const consts = ['/usr/share/xpra/www/js/Constants.js', '/usr/local/share/xpra/www/js/Constants.js'].find((f) => fs.existsSync(f));
  if (!consts) console.log('  ⚠ SKIP: no xpra-html5 Constants.js on this box — the client-vocabulary census needs the installed client');
  else {
    const txt = fs.readFileSync(consts, 'utf8');
    const spelled = new Set([...txt.matchAll(/:"([a-z_-]+)"/g)].map((m) => m[1]));
    const ours = [...S.XPRA_INPUT_TYPES].filter((t) => spelled.has(t));
    ok(ours.length >= 6 && ['key-action', 'button-action', 'pointer-position', 'wheel-motion', 'clipboard-token', 'clipboard-contents'].every((t) => spelled.has(t)), `the installed html5 client spells ${ours.length} of our input types (${ours.join(', ')}) — key/button/pointer/wheel/clipboard all present`, [...spelled].filter((x) => /key|pointer|button|wheel|clip/.test(x)));
    for (const notInput of ['ping', 'ping_echo', 'damage-sequence', 'buffer-refresh', 'hello', 'connection-data', 'configure-window']) ok(spelled.has(notInput) && !S.XPRA_INPUT_TYPES.has(notInput), `${notInput} is a client packet and NOT input`);
  }
  // netem: the parser and the queue (dev-only, env-gated at the bridge)
  ok(same(S.parseNetem('rtt:200,kbps:1000'), { rttMs: 200, kbps: 1000 }) && same(S.parseNetem('kbps:500'), { rttMs: 0, kbps: 500 }) && same(S.parseNetem('RTT:50'), { rttMs: 50, kbps: 0 }) && S.parseNetem('off') === null && S.parseNetem('') === null && S.parseNetem('garbage') === null && S.parseNetem('rtt:0') === null, 'parseNetem: rtt/kbps in any order, off/empty/garbage/zero ⇒ null');
  ok(S.netemOfUrl('/api/desktop/x/stream?viewer=a&netem=rtt:200') === 'rtt:200' && S.netemOfUrl('/api/desktop/x/stream') === null, 'netemOfUrl reads the upgrade url\'s own knob');
  await new Promise((resolve) => {
    const t0 = Date.now(); const got = [];
    const q = S.netemQueue({ rttMs: 60, kbps: 8000 }); // 8000 kbps ⇒ 1000 bytes = 1 ms of air
    q.send(1000, () => got.push(['a', Date.now() - t0])); q.send(60000, () => got.push(['b', Date.now() - t0])); q.send(10, () => got.push(['c', Date.now() - t0]));
    setTimeout(() => {
      ok(got.map((g) => g[0]).join('') === 'abc', 'netemQueue delivers in order', got);
      ok(got[0][1] >= 28 && got[1][1] >= got[0][1] + 55 && got[2][1] >= got[1][1], `each message waits rtt/2 (a at ${got[0][1]} ms ≥ 30) and a 60 kB message lands only after its own airtime at 8 Mbps (b at ${got[1][1]} ms ≥ a + 60; c follows b)`, got);
      const q2 = S.netemQueue({ rttMs: 40 }); let fired = false; q2.send(1, () => { fired = true; }); q2.stop();
      setTimeout(() => { ok(!fired, 'stop() drops what is still queued (a closed bridge sends nothing late)'); resolve(); }, 60);
    }, 160);
  });
  // the bridge refuses NOTHING by rung any more: an xpra target is relayed (the keeper suite drives it against a fake upstream + the real xpra)
  const src = read('src/server/desktop-stream.js');
  ok(!/501, 'xpra stream not wired/.test(src) && /bridgeXpra\(ws, id, target\.port, viewerId, netem, req\)/.test(src), 'the 501-by-name refusal for xpra is gone; handleUpgrade hands an xpra target to bridgeXpra');
  ok(/netemEnabled \? /.test(src) && !/parseNetem\(q\)/.test(src.replace(/netemEnabled\) \{ const q = netemOfUrl[^\n]*/, '')), 'netem is read ONLY behind the netemEnabled gate (never on by default)');
  ok(/VIBESPACE_DESKTOP_NETEM === '1'/.test(read('server.js')), 'server.js flips the gate from VIBESPACE_DESKTOP_NETEM=1 and nothing else');
}

console.log('§9 P8-2 x4 — THE PICTURE IS THE APP on the vnc-display rung: the fit policy column + the PURE fit plan');
{
  // the policy: a CAPABILITY of the (rung, via) pair, from the table — never a backend-id switch anywhere else
  ok(same(M.fitPolicyOf({ backend: 'vnc-display', via: 'Xvnc' }), { mode: 'follows', by: 'keeper' }), 'vnc-display via Xvnc: the display FOLLOWS (SetDesktopSize) and the keeper fits');
  ok(same(M.fitPolicyOf({ backend: 'vnc-display', via: 'Xvfb+x11vnc' }), { mode: 'fixed', by: 'keeper' }), 'vnc-display via Xvfb+x11vnc: the display is FIXED, the keeper still fits the app to it');
  ok(same(M.fitPolicyOf({ backend: 'xpra', via: 'xpra' }), { mode: 'client', by: 'client' }), 'xpra: the CLIENT fits (x2) — the keeper never touches an xpra display');
  ok(same(M.fitPolicyOf({ backend: 'desktop-singleton', via: 'Xtigervnc' }), { mode: 'shared', by: null }) && same(M.fitPolicyOf({ backend: 'desktop-singleton', via: 'desktop-singleton:running' }), { mode: 'shared', by: null }), 'the shared desktop: never fitted (its own WM, the user\'s other windows)');
  ok(M.fitPolicyOf({ backend: 'vnc-display', via: null }) === null && M.fitPolicyOf({ backend: 'nope', via: 'Xvnc' }) === null && M.fitPolicyOf(null) === null && M.fitPolicyOf({ backend: 'vnc-display', via: 'Xvnc' }, [{ id: 'vnc-display', stream: 'rfb' }]) === null, 'an older record without a via / an unknown rung / a table row without a fit column ⇒ null: no fit, no claim');
  ok(M.keeperFits(M.fitPolicyOf({ backend: 'vnc-display', via: 'Xvnc' })) && M.keeperFits(M.fitPolicyOf({ backend: 'vnc-display', via: 'Xvfb+x11vnc' })) && !M.keeperFits(M.fitPolicyOf({ backend: 'xpra', via: 'xpra' })) && !M.keeperFits(M.fitPolicyOf({ backend: 'desktop-singleton', via: 'Xvnc' })) && !M.keeperFits(null), 'keeperFits = exactly the two vnc-display spellings');
  for (const b of M.DISPLAY_BACKENDS) ok(b.fit && Object.keys(b.recipes).every((via) => typeof b.fit[via] === 'string'), `${b.id}: every via that has a recipe has a fit verdict (${Object.entries(b.fit).map(([k, v]) => `${k}→${v}`).join(', ')})`);
  // the plan
  const fb = { w: 1280, h: 800 };
  const main = { id: 5, depth: 1, mapped: true, w: 484, h: 316, x: 0, y: 0, cls: 'XTerm', instance: 'xterm', name: 'xterm' };
  const child = { id: 6, depth: 2, mapped: true, w: 484, h: 316, x: 1, y: 1, cls: null, instance: null, name: null };
  const leader = { id: 7, depth: 1, mapped: true, w: 1, h: 1, x: 0, y: 0, cls: 'XTerm', instance: 'xterm', name: null };
  const p1 = M.appFitPlan([main, child, leader], fb);
  ok(p1.main && p1.main.id === 5 && same(p1.resize, { id: 5, w: 1280, h: 800 }) && p1.moves.length === 0 && !p1.settled, 'the largest CLASSED top-level is the main: moved to 0,0 and resized to the framebuffer; the depth-2 child and the 1x1 leader are never candidates');
  ok(M.topLevelWindows([main, child, leader, { id: 8, depth: 1, mapped: false, w: 300, h: 300 }]).map((w) => w.id).join(',') === '5', 'topLevelWindows = depth 1, mapped (or unknown), larger than 1x1');
  const fitted = { ...main, w: 1280, h: 800 };
  const p2 = M.appFitPlan([fitted, child], fb);
  ok(p2.main && p2.main.id === 5 && p2.resize === null && p2.settled, 'a main already at 0,0 × the framebuffer is SETTLED — nothing to do (the tick belt must not touch it)');
  const bigDialog = { id: 9, depth: 1, mapped: true, w: 1300, h: 200, x: 10, y: 10, cls: 'XTerm', name: 'dialog' }; // 260,000 px² > the unfitted main's 152,944
  const p3 = M.appFitPlan([main, bigDialog], fb, { applied: { wid: 5 } });
  ok(p3.main.id === 5 && same(p3.resize, { id: 5, w: 1280, h: 800 }) && same(p3.moves, [{ id: 9, x: 0, y: 10 }]), 'STABILITY: the applied main stays the main even when a LARGER top-level appears (it is re-fitted); a dialog wider than the framebuffer goes to x 0 (never resized), its y kept');
  const p3b = M.appFitPlan([main, bigDialog], fb);
  ok(p3b.main.id === 9, 'CONTROL: without an applied wid the larger one would be picked (why the plan carries the applied main)');
  ok(M.appFitPlan([fitted, bigDialog], fb).main.id === 5, 'and once fitted the main IS the largest — the applied wid only matters before the first act');
  const dlg = { id: 10, depth: 1, mapped: true, w: 300, h: 200, x: 1200, y: 700, cls: 'Gtk', name: 'Open' };
  const p4 = M.appFitPlan([fitted, dlg], fb, { applied: { wid: 5 } });
  ok(same(p4.moves, [{ id: 10, x: 980, y: 600 }]) && p4.resize === null && !p4.settled, 'a dialog overflowing the framebuffer is NUDGED inside (x/y clamped to fb − size), its size untouched');
  const inside = { ...dlg, x: 100, y: 100 };
  ok(M.appFitPlan([fitted, inside], fb, { applied: { wid: 5 } }).settled, 'a dialog already inside is left where the app put it');
  ok(M.appFitPlan([fitted, { ...dlg, x: -20, y: -5 }], fb, { applied: { wid: 5 } }).moves[0].x === 0 && M.appFitPlan([fitted, { ...dlg, x: -20, y: -5 }], fb, { applied: { wid: 5 } }).moves[0].y === 0, 'a negative origin is clamped to 0');
  const p5 = M.appFitPlan([main, child], { w: 900, h: 600 }, { applied: { wid: 5 } });
  ok(same(p5.resize, { id: 5, w: 900, h: 600 }), 'a framebuffer that shrank ⇒ the main is re-fitted to the NEW size (the follow)');
  ok(M.appFitPlan([], fb).main === null && /no top-level/.test(M.appFitPlan([], fb).why) && M.appFitPlan([main], null).main === null && /no framebuffer/.test(M.appFitPlan([main], { w: 0, h: 0 }).why), 'no window / no framebuffer ⇒ main null with the reason (the keeper keeps asking, bounded)');
  const unnamed = { id: 11, depth: 1, mapped: true, w: 200, h: 200, x: 5, y: 5, cls: null, instance: null, name: null };
  ok(M.appFitPlan([unnamed], fb).main.id === 11, 'a display whose only top-level is class-less still gets it as the main (better than nothing on screen)');
  ok(M.appFitPlan([{ id: 12, mapped: true, w: 200, h: 100, x: 0, y: 0, cls: 'A' }], fb).main.id === 12, 'rows WITHOUT a depth (the pre-x4 enumeration shape) are taken as top-levels');
  ok(M.appFitPlan([{ ...main, id: 20 }, { ...main, id: 21, w: 484, h: 316 }], fb).main.id === 20, 'two equal top-levels: the LOWER id (the older window) is the main — deterministic');
  // A REPARENTING WM (2026-09-22 — the fleet image starts xfwm4 on this rung; the verifier's minimal WM and the real
  // xfwm4 4.18 show the same shape): an UNNAMED depth-1 frame holds the CLASSED client at depth 2; the WM's own helpers
  // are classed depth-1 rows. The CLIENT is the app window; the FRAME must cover the framebuffer.
  const frame = { id: 30, depth: 1, mapped: true, w: 494, h: 350, x: 393, y: 225, cls: null, instance: null, name: null };
  const client = { id: 31, depth: 2, mapped: true, w: 484, h: 316, x: 398, y: 254, cls: 'XTerm', instance: 'xterm', name: 'xv-wm-title' };
  const deco = { id: 32, depth: 2, mapped: true, w: 21, h: 29, x: 861, y: 225, cls: null, instance: null, name: null };
  const helper = { id: 33, depth: 1, mapped: true, w: 5, h: 5, x: -1000, y: -1000, cls: 'Xfwm4', instance: 'xfwm4', name: 'Xfwm4' };
  const menu = { id: 34, depth: 1, mapped: true, w: 200, h: 300, x: 1200, y: 700, cls: 'XTerm', instance: 'xterm', name: null };
  const wmPlan = M.appFitPlan([frame, client, deco, helper, menu], fb);
  ok(same(M.appWindows([frame, client, deco, helper, menu]).map((w) => [w.id, w.frame && w.frame.id]), [[31, 30]]), 'appWindows: the frame\'s shallowest CLASSED descendant is the app window (with its frame); once a frame is seen, depth-1 classed rows (the WM\'s helper, an override-redirect menu) are not the app\'s');
  ok(wmPlan.main.id === 31 && wmPlan.main.name === 'xv-wm-title' && same(wmPlan.resize, { id: 31, w: 1270, h: 766, framed: true }) && wmPlan.moves.length === 0, 'the main is the CLIENT (its own name → the title), the act names the client with the size that makes its FRAME the framebuffer; the helper and the menu are never moved', wmPlan);
  ok(M.appFitPlan([{ ...frame, x: 0, y: 0, w: 1280, h: 800 }, { ...client, x: 0, y: 24, w: 1280, h: 776 }], fb).settled, 'a frame at 0,0 × the framebuffer (the WM maximised the client under its title bar) is SETTLED');
  const frame2 = { id: 40, depth: 1, mapped: true, w: 310, h: 230, x: 2000, y: 1500, cls: null, instance: null, name: null };
  const client2 = { id: 41, depth: 2, mapped: true, w: 300, h: 200, x: 2005, y: 1529, cls: 'Zenity', instance: 'zenity', name: 'Info' };
  const p6 = M.appFitPlan([{ ...frame, x: 0, y: 0, w: 1280, h: 800 }, { ...client, x: 0, y: 24, w: 1280, h: 776 }, frame2, client2], fb, { applied: { wid: 31 } });
  ok(same(p6.moves, [{ id: 41, x: 970, y: 570 }]) && p6.resize === null, 'a second framed window off the framebuffer: the move names its CLIENT and the corner that puts its FRAME inside (1280−310, 800−230)', p6.moves);
  ok(M.appWindows([frame, { ...client, mapped: false }]).length === 0 && M.appFitPlan([frame, { ...client, mapped: false }], fb).main === null, 'a frame whose client is not viewable (iconified) holds no app window');
  ok(M.appWindows([main, child, leader]).length === 1 && M.appWindows([main, child, leader])[0].frame === null, 'CONTROL: bare X (a classed top-level with an unnamed child) is NOT a frame — the pre-WM rule is unchanged');
  // the keeper's records are FACTS: newRecord carries no fb/fit; the VIEW lays fitMode over
  ok(!('fb' in M.newRecord({ id: 'x', label: 'x', exec: 'x', args: [], cwd: null, env: null, source: 'adhoc', backend: 'vnc-display', via: 'Xvnc', fallbackWhy: null, idleTimeoutMs: 0, now: 1 })), 'a new record carries no fb/fit — the keeper writes them as measured facts');
  // the chip (client PURE helper): fixed names the geometry + the group's X server; follows/client/none print nothing
  const win = read('src/lib/desktop-app-window.js');
  ok(/export function fitChipText\(rec\)/.test(win) && /rec\.fitMode !== 'fixed'\) return ''/.test(win) && /desktop-app-chip-fit/.test(win) && /install tigervnc for a window that follows/.test(win), 'desktop-app-window.js exports fitChipText: only a FIXED display prints, naming the geometry and the group\'s X server, with the tigervnc remedy');
  // the app's OWN title on a keeper-fitted rung (x4): X's name, cleaned; null ⇒ the window keeps the label
  ok(M.windowTitleOf('Calculator') === 'Calculator' && M.windowTitleOf('计算器 "x" \\ é') === '计算器 "x" \\ é' && M.windowTitleOf('vs-fit "q" <b>x</b>') === 'vs-fit "q" <b>x</b>', 'windowTitleOf keeps a title VERBATIM (quotes, backslashes, CJK, angle brackets — escaping is the page\'s job, textContent)');
  ok(M.windowTitleOf('  a\tb\u0007c\u009b\n ') === 'abc' && M.windowTitleOf('\u0000\u0001') === null && M.windowTitleOf('') === null && M.windowTitleOf(null) === null && M.windowTitleOf(42) === null, 'control characters (C0, DEL, C1) are dropped and the rest trimmed; nothing left / not a string ⇒ null (the label stays)');
  const longT = M.windowTitleOf('中'.repeat(250) + '😀');
  ok(Array.from(longT).length === M.APP_TITLE_MAX && M.APP_TITLE_MAX === 200 && M.windowTitleOf('a'.repeat(199) + '😀') === 'a'.repeat(199) + '😀', `capped at APP_TITLE_MAX (${M.APP_TITLE_MAX}) CODE POINTS — a surrogate pair is never split`);
  ok(/const title = M\.windowTitleOf\(plan\.main\.name\)/.test(read('src/server/desktop-app-keeper.js')) && /rec\.appTitle = title/.test(read('src/server/desktop-app-keeper.js')) && /appTitle \|\| \(rec && rec\.appTitle\)\) \|\| \(rec && rec\.label\)/.test(read('src/lib/desktop-app-window.js')) && /const label = titleText\(\);/.test(read('src/lib/desktop-app-window.js')), 'WIRING PIN: the keeper records the fitted main\'s title as `appTitle` and the window shows it before the label (titleText — the title bar and the blocked overlay read the same name)');
  { const one = (p2) => M.appMainWindow(p2); const rows = [{ id: 1, name: 'Xpra-CorralWindow-0x5', cls: null, instance: null, w: 640, h: 472, depth: 1 }, { id: 5, name: 'app "t"', cls: 'XTerm', instance: 'xterm', w: 640, h: 472, depth: 2 }];
    const seam = rows.filter((w) => !/^Xpra/.test(w.name));
    ok(M.appMainWindow(seam, { seamless: true })?.id === 5 && one(seam) === null, 'appMainWindow({seamless}) picks the app among xpra\'s seamless rows (depth 2, its Corral parent dropped) — CONTROL: the frame grouping (seamless off) drops that orphaned row and finds nothing'); }
  ok(/onDesktopSize: \(id, w, h\) => keeper\.noteDesktopSize/.test(read('src/server/window-live-wiring.js')) && /noteDesktopSize\(id, w, h\)/.test(read('src/server/desktop-app-keeper.js')), 'WIRING PIN: the bridge\'s SetDesktopSize report reaches keeper.noteDesktopSize through the desktop scene\'s wiring (the 2.331.0 dead-fix lesson)');
  ok(/^\s*keeper\.setWatchProbe\?\.\(\(id\) => stream\.connections\(id\) > 0\);/m.test(read('src/server/window-live-wiring.js')) && /beltDue\(rec\.id, fitState\(rec\.id\), t\)/.test(read('src/server/desktop-app-keeper.js')), 'WIRING PIN: the fit belt\'s "somebody watches" fact is the bridge\'s open-socket count, wired as CODE at the start of a line (never text after a mid-line //)');
}

console.log('§10 HiDPI (2.369.158, docs/design-desktop-apps.zh.md §7.6): the app scale, its knobs, the launch dpr');
{
  ok(same(M.APP_SCALES, [1, 1.5, 2]) && Object.isFrozen(M.APP_SCALES), 'the scales the setting offers: 1, 1.5, 2');
  ok(M.appScaleFor('auto', 2) === 2 && M.appScaleFor(undefined, 2) === 2 && M.appScaleFor('', 1) === 1 && M.appScaleFor(null, 1.5) === 2, 'auto (also unset — the setting\'s default) follows the launching client\'s devicePixelRatio');
  // r2 (the verifier, measured): 1.5× is TEXT ONLY in GTK (no fractional GDK_SCALE on X11 — the calculator's minimum 370x616 device px
  // at 1.5× vs 720x1232 at 2×), so on a DPR-1.5 screen its keys drew at 0.67× their 1×-screen size. auto never picks the fraction:
  const AUTO = [[1, 1], [1.2, 1], [1.25, 1], [1.49, 1], [1.5, 2], [1.75, 2], [2, 2], [3, 2], [0.5, 1], ['x', 1]];
  const autoGot = AUTO.map(([d]) => M.appScaleFor('auto', d));
  ok(same(autoGot, AUTO.map(([, w]) => w)), `auto = 2 from a DPR of 1.5 up, else 1 — never the text-only 1.5 (${AUTO.map(([d], i) => `${d} ⇒ ${autoGot[i]}`).join(', ')})`);
  const preFixAuto = (d) => Math.min(2, Math.max(1, Math.round(M.normalizeDpr(d) * 2) / 2)); // the shipped-then-refuted rule: the nearest 0.5
  ok(!same(AUTO.map(([d]) => preFixAuto(d)), AUTO.map(([, w]) => w)) && preFixAuto(1.5) === 1.5 && preFixAuto(1.25) === 1.5, 'CONTROL: the pre-fix rule (the nearest 0.5) fails that table — it picks 1.5 on a 1.25 and a 1.5 screen');
  ok(M.appScaleFor('1', 2) === 1 && M.appScaleFor('1.5', 1) === 1.5 && M.appScaleFor(2, 1) === 2 && M.appScaleFor('3', 1) === 1, 'an explicit scale wins over the DPR (as a string — the enum\'s values — or a number); an unknown value ⇒ 1');
  const k2 = M.scaleKnobs(2), k15 = M.scaleKnobs(1.5), k1 = M.scaleKnobs(1);
  ok(k2.gdkScale === 2 && k2.dpi === 96 && k2.env.GDK_SCALE === '2' && k2.env.QT_SCALE_FACTOR === '2' && k2.env.QT_ENABLE_HIGHDPI_SCALING === '1', '2×: GDK_SCALE=2 (GTK3 + GTK4 widgets AND fonts 2×, measured) with the display at 96 dpi — Xft.dpi multiplies with GDK_SCALE (192 would be 4× text, measured)');
  ok(k15.gdkScale === 1 && k15.dpi === 144 && k15.env.GDK_SCALE === '1', '1.5×: the integer part in GDK_SCALE, the fraction in the display\'s font dpi (144)');
  ok(k1.dpi === 96 && k1.xresources === '' && k1.env.GDK_SCALE === '1', '1×: 96 dpi, no X resources');
  ok(!('GDK_DPI_SCALE' in k2.env) && !('GDK_DPI_SCALE' in k15.env), 'GDK_DPI_SCALE is NOT set (GTK4 ignores it — measured — and in GTK3 it would double-count the fraction already in Xft.dpi)');
  ok(/XTerm\*faceName: Monospace\n/.test(k2.xresources) && /XTerm\*faceSize: 16\n/.test(k2.xresources) && /UXTerm\*faceSize: 16\n/.test(k2.xresources) && /XTerm\*faceSize: 8\n/.test(k15.xresources), 'xterm gets an Xft face at a scale > 1 (its bitmap default no dpi reaches — measured): faceSize 8 × GDK_SCALE, the fraction through Xft.dpi');
  ok(M.scaleKnobs(7).scale === 1 && M.scaleKnobs('2').scale === 2, 'scaleKnobs takes only the offered scales (anything else ⇒ 1)');
  // the launch request's dpr
  const reg = M.DEFAULT_REGISTRY;
  const v1 = M.validateLaunchRequest({ appId: 'xterm', dpr: 2 }, reg), v2 = M.validateLaunchRequest({ exec: 'xterm' }, reg), v3 = M.validateLaunchRequest({ appId: 'xterm', dpr: 1.25 }, reg);
  ok(v1.ok && v1.launch.dpr === 2 && v2.ok && v2.launch.dpr === 1 && v3.launch.dpr === 1.25, 'POST /api/desktop/apps `dpr`: carried through (2, 1.25); absent ⇒ 1');
  const bad = [0.5, 3.5, 'x', -1, Infinity].map((d) => M.validateLaunchRequest({ appId: 'xterm', dpr: d }, reg));
  ok(bad.every((b) => !b.ok && /dpr must be a number from 1 to 3/.test(b.error)), 'a dpr outside 1..3 (or not a number) is REFUSED by name, never silently clamped');
  const rec = M.newRecord({ id: 'da-1', label: 'x', exec: '/usr/bin/xterm', source: 'registry', backend: 'xpra', now: 1, scale: 2, dpi: 96 });
  const recD = M.newRecord({ id: 'da-2', label: 'x', exec: '/usr/bin/xterm', source: 'registry', backend: 'vnc-display', now: 1 });
  ok(rec.scale === 2 && rec.dpi === 96 && recD.scale === 1 && recD.dpi === 96, 'the record carries its scale and its display\'s font dpi (fixed at launch; defaults 1 / 96)');
  const keeper = read('src/server/desktop-app-keeper.js'), disp = read('src/desktop-display.js');
  ok(/const knobs = backend\.stream === 'xpra' \? M\.scaleKnobs\(M\.appScaleFor\(serverSetting\('desktop\.appScale'\), v\.launch\.dpr\)\) : M\.scaleKnobs\(1\);/.test(keeper), 'WIRING PIN: the keeper decides the scale ONCE at launch from `desktop.appScale` + the request\'s dpr — on the xpra STREAM only (a whole-display rung\'s picture is CSS px)');
  ok(/\.\.\.\(M\.streamKindOf\(rec, backends\) === 'xpra' \? knobs\.env : \{\}\), \.\.\.\(rec\.env \|\| \{\}\)/.test(keeper) && /display\.applyXResources\(\{ binPath: f\.bins\.xrdb, env: appEnv, text: knobs\.xresources \}\)/.test(keeper), 'WIRING PIN: the app\'s env gets the knobs (a row\'s own env still wins) and the X resources are merged BEFORE the app starts');
  { const iWait = keeper.indexOf('display.waitForXftDpi('), iMerge = keeper.indexOf('display.applyXResources('), iApp = keeper.indexOf('display.startApp(');
    ok(iWait > 0 && iWait < iMerge && iMerge < iApp && /if \(own && M\.streamKindOf\(rec, backends\) === 'xpra'\) \{\n\s*const xd = await display\.waitForXftDpi\(/.test(keeper), 'WIRING PIN (r2, the verifier\'s race): on its own xpra display the keeper WAITS for xpra\'s resource write (Xft.dpi) BEFORE it merges its X resources and BEFORE it starts the app — xpra replaces the database ~1 s after the display is up'); }
  ok(/dpi: rec\.dpi \|\| 96,/.test(keeper) && /startXpra\(\{ binPath: ctx\.bins\.xpra, port, dir: ctx\.dir, env, logFd: ctx\.logFd, dpi: ctx\.dpi \}\)/.test(disp), 'WIRING PIN: the record\'s dpi reaches `xpra start --dpi` through the recipe ctx');
  const schema = read('src/lib/settings-schema.js');
  ok(/'desktop\.appScale': \{\s*type: 'enum', default: 'auto', options: \[\s*\{ value: 'auto'[^\]]*\{ value: '1', [^\]]*\{ value: '1\.5', [^\]]*\{ value: '2', /.test(schema), 'the setting `desktop.appScale` (auto | 1 | 1.5 | 2, default auto) exists in the schema — only for working code');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
