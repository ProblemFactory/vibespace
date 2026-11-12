#!/usr/bin/env node
// lane hub-sync-holds — NOTHING SYNCHRONOUS RUNS A CHILD OR WALKS A TREE ON THE HUB'S LOOP (the owner's hub, 2026-11-11: the
// profile named each a hold of the main loop). FAST, in-process: a scratch HOME, stand-in commands on PATH, no network, no
// real agent CLI, no sudo (a stand-in answers to that name), nothing signalled.
//   §13 rank 13 — a plugin's STATUS is a kept fact: a snapshot / a broadcast runs no synchronous child; the fresh answer is ONE async
//       refresh with timeouts (tailscale ran pgrep + sudo -n + `tailscale status --json` on every snapshot: 4.7–4.9 s)
//   §16 rank 16 — the mail folder IS the index: every pass reads it ONCE, async, a failed walk never an answer (each 300 s pass re-listed
//       the whole tree with readdirSync: 1.5–1.7 s per mailbox, growing with it)
//   §12a rank 12a — no update runs inside the boot (a synchronous `git pull` held 5.5 s before the first loop turn, right
//       after scripts/update.sh had pulled): the update's ONE road is scripts/update.sh
//   the loop-child census (every synchronous child / tree walk a row) is scripts/test-loop-child-census.mjs
// Run: node scripts/test-hub-sync-holds.mjs
import fs from 'node:fs';
import { spawn as spawnChild } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hub-holds-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
// a scratch HOME before the plugin manager is loaded (its plugin root is ~/.vibespace/plugins)
process.env.HOME = path.join(tmp, 'home'); fs.mkdirSync(process.env.HOME, { recursive: true });
// stand-ins on PATH: each sleeps, prints nothing and exits 1 — a child that takes its time, never a real one
const BIN = path.join(tmp, 'bin'); fs.mkdirSync(BIN);
const SLOW_MS = 1500; // ≫ the 250 ms loop bound: a child this slow would be seen on the loop at once
const STANDLOG = path.join(tmp, 'stand-ins.log'); // each stand-in says it started (round 2: an abandoned ask starts nothing more)
fs.writeFileSync(path.join(BIN, 'pgrep'), `#!/bin/sh\necho pgrep >> '${STANDLOG}'\nexec sleep \${HSH_PGREP_SLEEP:-${SLOW_MS / 1000}}\n`, { mode: 0o755 }); // every status read runs it first; exec'd, so a kill leaves no orphan
fs.writeFileSync(path.join(BIN, 'sudo'), `#!/bin/sh\necho sudo >> '${STANDLOG}'\nexit 1\n`, { mode: 0o755 }); // no sudo here — a stand-in that says no at once
process.env.PATH = `${BIN}:${process.env.PATH}`;
// THE LOOP'S LONGEST TURN while `fn` runs (and its own await): a 10 ms beat's worst lateness, and the histogram's max
const longestTurn = async (fn) => {
  const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
  let last = Date.now(), worst = 0; const beat = setInterval(() => { const n = Date.now(); worst = Math.max(worst, n - last - 10); last = n; }, 10);
  const t0 = Date.now(); let out; try { out = await fn(); } finally { clearInterval(beat); h.disable(); }
  return { out, ms: Date.now() - t0, worstBeatMs: worst, maxDelayMs: Math.round(h.max / 1e6) };
};
const BOUND_MS = 250; // the boot law's hold (CLAUDE.md «Never block the event loop»): no step holds a turn this long

console.log('§13 rank 13 — a plugin snapshot runs no synchronous child; its status is a kept fact, refreshed async');
{
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const REAL = require(path.join(REPO, 'src/plugins/tailscale.js'));
  const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'data-')), plugins: [REAL] });
  // a person opens the panel: the snapshot — a stand-in pgrep that takes 3 s must not hold the loop
  const snap = await longestTurn(() => pm.list());
  const row = (snap.out || []).find((p) => p.id === 'tailscale') || {};
  ok(`§13 a snapshot with a ${SLOW_MS / 1000} s stand-in pgrep on PATH answers at once — the loop's longest turn under ${BOUND_MS} ms (its status is the KEPT fact: «checking» before the first read)`, snap.ms < BOUND_MS && snap.worstBeatMs < BOUND_MS && row.checking === true, { ms: snap.ms, worstBeat: snap.worstBeatMs, row });
  // the fresh read: ONE async refresh — the children take their 3 s, the loop never waits on them
  const fresh = await longestTurn(() => (typeof pm.refreshStatus === 'function' ? pm.refreshStatus('tailscale') : Promise.resolve(null)));
  ok(`§13 the fresh status is ONE async refresh: it takes the children's time (≥ ${SLOW_MS} ms) while no turn of the loop exceeds ${BOUND_MS} ms`, !!fresh.out && fresh.ms >= SLOW_MS - 200 && fresh.worstBeatMs < BOUND_MS && fresh.maxDelayMs < BOUND_MS, { ms: fresh.ms, worstBeat: fresh.worstBeatMs, maxDelay: fresh.maxDelayMs });
  const after = await longestTurn(() => pm.list());
  const row2 = (after.out || []).find((p) => p.id === 'tailscale') || {};
  ok('§13 the next snapshot answers the KEPT fact (the refresh\'s answer, no «checking»), again with no synchronous child on its turn', after.ms < BOUND_MS && row2.checking === undefined && row2.running === false && row2.sudo === false, { ms: after.ms, row: row2 });
  // ONE refresh at a time: two asks while one is in flight share it
  let both = null;
  if (typeof pm.refreshStatus === 'function') { const a = pm.refreshStatus('tailscale'), b = pm.refreshStatus('tailscale'); both = a === b; await a; }
  ok('§13 two asks while a refresh is in flight share it (never two sets of children)', both === true);
}

{ // §13 a refresh that never answers; the client's words before the first answer
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  let calls = 0;
  const STUCK = { id: 'acme-stuck', label: 'Stuck', description: 'x', provides: [], create: () => ({ install() { }, start() { }, stop() { }, status() { return { kept: 'the last answer' }; }, statusAsync() { calls++; return new Promise(() => { }); } }) };
  const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'stuck-')), plugins: [STUCK], statusBoundMs: 300 });
  const hold = setInterval(() => { }, 1000); // the bound's timer is unref'd (a hub's loop is always held; this suite's is not)
  const t0 = Date.now(); const st = typeof pm.refreshStatus === 'function' ? await pm.refreshStatus('acme-stuck') : null; const took = Date.now() - t0;
  clearInterval(hold);
  await sleep(600);
  ok('§13 a refresh that NEVER answers ends at its bound: the kept answer stands, said as stale (statusError with its time and why) — and nothing retries it by itself (no timer: the next ask does)', !!st && took >= 280 && st.kept === 'the last answer' && st.statusError && /took over 300 ms/.test(st.statusError.why) && calls === 1, { took, st, calls });
  const UI = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8');
  ok('§13 the panel says «Checking…» on a row the server has not read yet — its switch and Install wait (never «not installed» / «stopped» by default) — and the OPEN panel redraws when `plugins-updated` arrives (the listener ends with the panel)', /chip = p\.checking \? \(p\.statusError \? t\('Status unknown — it could not be read'\) : t\('Checking…'\)\)/.test(UI) && /swDisabled = \(!!p\.checking && !p\.statusError\) \|\|/.test(UI) && /if \(!p\.checking && !p\.installed/.test(UI) && /this\.ws\?\.onGlobal\?\.\(\(msg\) => \{\s*\n\s*if \(!body\.isConnected\) \{ offWs\?\.\(\); return; \}\s*\n\s*if \(msg && msg\.type === 'plugins-updated'\)/.test(UI));
}

{ // §13 a decision that ACTS reads a fresh answer: the boot's install-or-start (frp, relay default-on) with a frpc on PATH only
  const FRP_PATH = path.join(REPO, 'src/plugins/frp.js');
  const ENV_KEYS = ['VIBESPACE_FRPS_ADDR', 'VIBESPACE_FRPS_TOKEN'];
  const envWas = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.VIBESPACE_FRPS_ADDR = 'relay.example.invalid';
  process.env.VIBESPACE_FRPS_TOKEN = ['knock', 'hub', 'holds'].join('-'); // a stand-in relay key: the relay env is read at module load
  delete require.cache[require.resolve(FRP_PATH)];
  const FRP = require(FRP_PATH);
  for (const k of ENV_KEYS) { if (envWas[k] === undefined) delete process.env[k]; else process.env[k] = envWas[k]; }
  const FBIN = path.join(tmp, 'frp-path'); fs.mkdirSync(FBIN);
  const RAN = path.join(tmp, 'frpc-ran');
  fs.writeFileSync(path.join(FBIN, 'frpc'), `#!/bin/sh\necho "$*" >> '${RAN}'\nexit 0\n`, { mode: 0o755 }); // a stand-in: says it ran, exits
  const pathWas = process.env.PATH; process.env.PATH = `${FBIN}:${pathWas}`;
  const fetched = []; const fetchWas = globalThis.fetch;
  globalThis.fetch = async (u) => { fetched.push(String(u)); throw new Error('no network in this suite'); };
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'frp-')), plugins: [FRP] });
  pm.bootReplay();
  for (let i = 0; i < 100 && !fs.existsSync(RAN) && !fetched.length; i++) await sleep(50);
  globalThis.fetch = fetchWas; process.env.PATH = pathWas;
  ok('§13 a decision that acts reads a FRESH `which` (the kept answer is empty before its first read): the boot\'s install-or-start STARTS the frpc on PATH and downloads nothing', fetched.length === 0 && fs.existsSync(RAN), { fetched, ran: fs.existsSync(RAN) });
}

{ // §13 round 2 — the acceptance panel's three moderates on rank 13, on the REAL tailscale / frp plugins
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const REAL = require(path.join(REPO, 'src/plugins/tailscale.js'));
  const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { } await sleep(20); } return false; };
  const TSD = path.join(process.env.HOME, '.vibespace', 'plugins', 'tailscale'); fs.mkdirSync(TSD, { recursive: true });
  const standLog = () => { try { return fs.readFileSync(STANDLOG, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  { // 1. OUR daemon running and NO tailscale command resolvable: the probe answers what it knows — never a rejection left «Checking…»
    const NOCLI = path.join(tmp, 'nocli-path'); fs.mkdirSync(NOCLI);
    fs.symlinkSync('/usr/bin/which', path.join(NOCLI, 'which')); for (const n of ['pgrep', 'sudo']) fs.symlinkSync(path.join(BIN, n), path.join(NOCLI, n));
    const daemon = spawnChild(process.execPath, ['-e', 'setInterval(() => {}, 1e6)', 'tailscaled'], { stdio: 'ignore' }); // its cmdline names tailscaled
    fs.writeFileSync(path.join(TSD, 'tailscaled.pid'), String(daemon.pid));
    const pathWas = process.env.PATH; process.env.PATH = NOCLI; process.env.HSH_PGREP_SLEEP = '0';
    let row = null, rejected = null;
    try {
      const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'nocli-')), plugins: [REAL] });
      try { row = await pm.refreshStatus('tailscale'); } catch (e) { rejected = e.message; }
    } finally { process.env.PATH = pathWas; delete process.env.HSH_PGREP_SLEEP; daemon.kill('SIGKILL'); fs.rmSync(path.join(TSD, 'tailscaled.pid'), { force: true }); }
    ok('§13 our daemon RUNNING and no tailscale command anywhere: the refresh ANSWERS (running, cli: false) — never a rejection that leaves the row «Checking…» with its switch disabled', !rejected && !!row && row.running === true && row.cli === false && row.checking === undefined && !row.statusError, { rejected, row: row && { running: row.running, cli: row.cli, checking: row.checking, statusError: row.statusError } });
  }
  { // 2. an ask abandoned at its bound STARTS NOTHING MORE and WRITES NOTHING (a 1 s stand-in pgrep against a 300 ms bound)
    fs.writeFileSync(STANDLOG, ''); process.env.HSH_PGREP_SLEEP = '1';
    const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'bound-')), plugins: [REAL], statusBoundMs: 300 });
    const hold = setInterval(() => { }, 1000);
    const t0 = Date.now(); const st = await pm.refreshStatus('tailscale'); const took = Date.now() - t0;
    await sleep(Math.max(0, 1400 - (Date.now() - t0))); clearInterval(hold); delete process.env.HSH_PGREP_SLEEP;
    const after = pm.status('tailscale'); const log = standLog();
    ok('§13 an ask abandoned at its bound STARTS NOTHING MORE and WRITES NOTHING: ended at 300 ms (statusError), and 1.4 s on its 1 s pgrep was the last child it ever started (no sudo after it) and the row is still the pre-answer one (checking), not a late write', !!st.statusError && /took over 300 ms/.test(st.statusError.why) && log.filter((l) => l === 'pgrep').length === 1 && !log.includes('sudo') && after.checking === true, { took, statusError: st.statusError, log, checking: after.checking });
  }
  { // 3. frp before its first `which`: «Checking…», never «not installed» + Install over the PATH's frpc
    const FBIN3 = path.join(tmp, 'frp-path-3'); fs.mkdirSync(FBIN3); fs.writeFileSync(path.join(FBIN3, 'frpc'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    for (const m of ['src/plugins/which-kept.js', 'src/plugins/frp.js']) delete require.cache[require.resolve(path.join(REPO, m))]; // a fresh hub: no `which` answered yet
    const FRP3 = require(path.join(REPO, 'src/plugins/frp.js'));
    const pathWas = process.env.PATH; process.env.PATH = `${FBIN3}:${pathWas}`;
    let before, fresh;
    try {
      const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'frpchk-')), plugins: [FRP3] });
      before = (pm.list() || []).find((p) => p.id === 'frp') || {};
      fresh = await pm.refreshStatus('frp');
    } finally { process.env.PATH = pathWas; }
    ok('§13 frp BEFORE its first `which`: the row says «Checking…» (checking, so no Install is offered) — then, read, installed with no «checking»', before.checking === true && !!fresh && fresh.installed === true && fresh.checking === undefined, { before: { checking: before.checking, installed: before.installed }, fresh: fresh && { checking: fresh.checking, installed: fresh.installed } });
  }
  { // 4. never refreshed by a timer: the census of the manager's refresh callers, on the SYNTAX TREE (round 3 — the line-text
    // grep missed a call inside a timer's callback written on another line): every call of refreshStatus / refreshAll whose
    // receiver is the manager (`this` in plugins.js, `plugins`, `getPlugins()`) is a row by its scope; one inside a
    // setTimeout / setInterval / setImmediate callback is red by name. A plant proves it.
    const { walk, scopeOf } = await import(path.join(REPO, 'scripts/sync-fs-census.mjs'));
    const A = createRequire(path.join(REPO, 'package.json'))('acorn');
    const TIMER = new Set(['setTimeout', 'setInterval', 'setImmediate']);
    const callers = (patch = {}) => {
      const rows = []; const files = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join('src', f)), ...Object.keys(patch)];
      for (const f of [...new Set(files)]) {
        const src = patch[f] !== undefined ? patch[f] : fs.readFileSync(path.join(REPO, f), 'utf8'); if (!/refresh(?:Status|All)\(/.test(src)) continue;
        const code = src.replace(/^#!.*/, ''); let ast; try { ast = A.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, locations: true }); } catch { ast = A.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
        walk(ast, (n, ps) => {
          if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return; const k = n.callee.property.name; if (k !== 'refreshStatus' && k !== 'refreshAll') return;
          const o = n.callee.object; if (!(o.type === 'ThisExpression' || (o.type === 'Identifier' && o.name === 'plugins') || (o.type === 'CallExpression' && o.callee.type === 'Identifier' && o.callee.name === 'getPlugins'))) return;
          const timer = ps.some((a) => a.type === 'CallExpression' && ((a.callee.type === 'Identifier' && TIMER.has(a.callee.name)) || (a.callee.type === 'MemberExpression' && !a.callee.computed && TIMER.has(a.callee.property.name))));
          rows.push(`${f}|${scopeOf(ps)}|${k}${timer ? '|TIMER' : ''}`);
        });
      }
      return rows.sort();
    };
    const want = ['src/plugins.js|PluginManager.constructor > notify|refreshStatus', 'src/plugins.js|PluginManager.refreshAll|refreshStatus', 'src/plugins.js|PluginManager.bootReplay|refreshAll', 'src/plugins.js|PluginManager._act > after|refreshStatus', 'src/server/mounts-plugins-wiring.js|create > route:GET /api/plugins|refreshAll', 'src/server/mounts-plugins-wiring.js|create > route:GET /api/plugins/:id/status|refreshStatus'].sort();
    const now = callers();
    const pl = fs.readFileSync(path.join(REPO, 'src/plugins.js'), 'utf8');
    const planted = callers({ 'src/plugins.js': pl.replace('  bootReplay() {\n', '  bootReplay() {\n    setInterval(() => {\n      this.refreshAll();\n    }, 60000);\n') });
    ok('§13 NEVER refreshed by a timer — on the syntax tree, the manager\'s refresh callers are exactly: its own event (h.notify), refreshAll\'s loop, bootReplay, an act\'s fresh read (_act), GET /api/plugins, GET …/status — none inside a timer\'s callback (a planted setInterval → refreshAll, the call on its own line, is RED)', JSON.stringify(now) === JSON.stringify(want) && planted.some((r) => /bootReplay\|refreshAll\|TIMER$/.test(r)), { now, planted: planted.filter((r) => /TIMER/.test(r)) });
  }

  const UI = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8');
  ok('§13 the panel: a first answer that FAILED says «Status unknown» and frees the switch (a running daemon can always be stopped); the stale mark is a visible line on the row, not only a hover title; no tailscale command ⇒ its own words, no «Log in…»', /p\.checking \? \(p\.statusError \? t\('Status unknown — it could not be read'\) : t\('Checking…'\)\)/.test(UI) && /swDisabled = \(!!p\.checking && !p\.statusError\) \|\| p\.mode === 'system' \|\| \(!p\.installed && !running && !p\.statusError\)/.test(UI) && /if \(p\.statusError\) \{\n\s+const stale = Object\.assign\(document\.createElement\('div'\), \{ className: 'plugin-row-fact', textContent: t\('Not read again just now \(\{why\}\)/.test(UI) && /p\.backendState !== 'Running' && p\.cli !== false/.test(UI));
}

{ // §13 round 3 — the accepted round's small items, each pinned
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const WK = require(path.join(REPO, 'src/plugins/which-kept.js'));
  const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { } await sleep(20); } return false; };
  { // (a) a FAILED status keeps its stamp while the answer is the same: no broadcast → redraw → GET → refresh loop
    let calls = 0; const sent = [];
    const FAIL = { id: 'acme-fail', label: 'Fail', description: 'x', provides: [], create: () => ({ install() { }, start() { }, stop() { }, status() { return { kept: true }; }, statusAsync() { calls++; return Promise.reject(new Error('probe failed')); } }) };
    const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'fail-')), plugins: [FAIL], broadcast: (m) => sent.push(m.type) });
    const a = await pm.refreshStatus('acme-fail'); await sleep(5); const b = await pm.refreshStatus('acme-fail'); await sleep(5); const c = await pm.refreshStatus('acme-fail'); // asks ms apart: a stamp that moved would differ
    ok('§13 (a) a status that keeps FAILING the same way keeps its stamp: three asks, ONE broadcast (the first) — no panel loop of redraw → GET → refresh', calls === 3 && sent.filter((t) => t === 'plugins-updated').length === 1 && a.statusError && c.statusError && a.statusError.at === c.statusError.at, { calls, sent, at: [a.statusError && a.statusError.at, c.statusError && c.statusError.at] });
  }
  { // (b) an ACT supersedes the refresh in flight: a Stop pressed while a refresh reads the old state
    const st = { running: true }; let keptRow = { running: true };
    const P = { id: 'acme-act', label: 'Act', description: 'x', provides: [], create: () => ({ install() { }, start() { st.running = true; }, stop() { st.running = false; }, status() { return keptRow; },
      async statusAsync({ signal } = {}) { const read = st.running; await sleep(120); if (signal && signal.aborted) throw signal.reason; keptRow = { running: read }; return keptRow; } }) };
    const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'act-')), plugins: [P] });
    const inflight = pm.refreshStatus('acme-act'); await sleep(30);
    await pm.stop('acme-act');
    await inflight.catch(() => { }); await until(() => pm.status('acme-act').running === false, 2000); await sleep(150);
    const row = pm.status('acme-act');
    { const R = { id: 'acme-refuse', label: 'R', description: 'x', provides: [], create: () => ({ install() { }, start() { throw Object.assign(new Error('refused by name'), { code: 'refused' }); }, stop() { }, status() { return {}; } }) };
      const pr = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'refuse-')), plugins: [R] }); let se = null, ret;
      try { ret = pr.start('acme-refuse'); } catch (e) { se = e; }
      ok('§13 (b) an act keeps its VERB\'s contract: a sync verb\'s refusal is thrown IN PLACE (a caller\'s try / catch holds it — test-frp-plugin\'s revoked identity), never turned into a rejected promise', !!se && se.code === 'refused' && ret === undefined, { se: se && se.code, ret: typeof ret }); }
    ok('§13 (b) a Stop pressed while a refresh is in flight: that refresh (it read «running» before the act) is dropped, a fresh read follows the act — the row says stopped, not «connected» until the next ask', row.running === false && !row.statusError, row);
  }
  { // (c) an aborted ask kills its `which` too — and a child that ignores SIGTERM is SIGKILLed after a grace (our own child)
    const DIR = path.join(tmp, 'which-stubborn'); fs.mkdirSync(DIR); const PIDF = path.join(DIR, 'pid');
    fs.writeFileSync(path.join(DIR, 'which'), `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(PIDF)}, String(process.pid)); process.on('SIGTERM', () => { }); setTimeout(() => { }, 20000);\n`, { mode: 0o755 });
    const pathWas = process.env.PATH; process.env.PATH = `${DIR}:${pathWas}`;
    const ac = new AbortController(); const t0 = Date.now();
    const p = WK.whichNow('vs-no-such-cmd-c', { signal: ac.signal });
    await until(() => fs.existsSync(PIDF)); const pid = Number(fs.readFileSync(PIDF, 'utf8'));
    ac.abort(new Error('the ask was abandoned')); const got = await p; process.env.PATH = pathWas;
    const gone = await until(() => !fs.existsSync(`/proc/${pid}`), WK.GRACE_MS + 2000);
    ok(`§13 (c) an aborted ask kills its \`which\` child — one that IGNORES SIGTERM is SIGKILLed after the ${WK.GRACE_MS} ms grace; the abandoned lookup records nothing (the name stays unknown)`, gone && got === null && !WK.whichKnown('vs-no-such-cmd-c'), { pid, gone, got, known: WK.whichKnown('vs-no-such-cmd-c'), ms: Date.now() - t0 });
  }
  { // (d) a `which` that cannot be SPAWNED: no unhandled rejection, the name not poisoned — the next ask answers
    let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
    const real = WK._seam.get(); WK._seam.set(() => { throw Object.assign(new Error('spawn EAGAIN'), { code: 'EAGAIN' }); });
    const first = await WK.whichNow('node'); const kept = WK.whichKept('node'); await sleep(50);
    WK._seam.set(real); const second = await WK.whichNow('node'); await sleep(20); process.off('unhandledRejection', onU);
    ok('§13 (d) a `which` that could not be SPAWNED answers null with NO unhandled rejection and leaves the name unknown — the next ask (the spawn working again) answers the real path', first === null && unhandled === 0 && !!second && /node$/.test(second) && WK.whichKnown('node'), { first, kept, second, unhandled });
  }
}

console.log('§16 rank 16 — the mail folder IS the index: every pass reads it once, async, off the loop; a walk that did not finish is never an answer');
{
  const { GmailSync } = require(path.join(REPO, 'src/gmail-sync.js'));
  const MAIL = path.join(tmp, 'mail'); const N = 20000;
  for (const sub of ['', '2026-10', '2026-11']) fs.mkdirSync(path.join(MAIL, sub), { recursive: true });
  const subs = ['', '2026-10', '2026-11'];
  for (let i = 0; i < N; i++) fs.writeFileSync(path.join(MAIL, subs[i % 3], `m${i}_${(0x10000000 + i).toString(16)}.eml`), '');
  fs.writeFileSync(path.join(MAIL, '.vibespace-gmail-state.json'), JSON.stringify({ historyId: '100', email: 'stand-in@example.invalid' }));
  const gs = new GmailSync({});
  gs._api = async () => ({ history: [], historyId: '101' }); // no network: an incremental pass with nothing new
  const w = { cfg: { id: 'm1', dir: MAIL, pollSeconds: 300 }, tok: {}, email: 'stand-in@example.invalid', stopped: false, timer: null };
  // the walks a pass makes: every sync readdir (a hold) and every async one
  const walks = { sync: 0, async: 0 };
  const rs = fs.readdirSync, ra = fs.promises.readdir;
  fs.readdirSync = function (d, ...a) { if (String(d).startsWith(MAIL)) walks.sync++; return rs.call(this, d, ...a); };
  fs.promises.readdir = function (d, ...a) { if (String(d).startsWith(MAIL)) walks.async++; return ra.call(this, d, ...a); };
  let p1, p2, w1, w2;
  try {
    p1 = await longestTurn(() => gs._syncOnce(w)); w1 = { ...walks };
    p2 = await longestTurn(() => gs._syncOnce(w)); w2 = { sync: walks.sync - w1.sync, async: walks.async - w1.async };
  } finally { fs.readdirSync = rs; fs.promises.readdir = ra; }
  ok(`§16 a pass over ${N} stored messages walks the tree ONCE, async (no readdirSync on the loop), counts every one, and holds no turn over ${BOUND_MS} ms`, w1.sync === 0 && w1.async === 3 && w.count === N && p1.worstBeatMs < BOUND_MS && p1.maxDelayMs < BOUND_MS, { walks: w1, count: w.count, ms: p1.ms, worstBeat: p1.worstBeatMs, maxDelay: p1.maxDelayMs });
  ok(`§16 the next pass reads the folder AGAIN — once, async, no turn over ${BOUND_MS} ms — nothing about it is kept from the pass before`, w2.sync === 0 && w2.async === 3 && w.count === N && p2.worstBeatMs < BOUND_MS, { walks: w2, count: w.count, ms: p2.ms, worstBeat: p2.worstBeatMs });
}

{ // §16 THROUGH start(): the real worker, its own loop and timers (each wait ≥ 60 s compressed to GAP ms), a stubbed Gmail API
  const { GmailSync } = require(path.join(REPO, 'src/gmail-sync.js'));
  const ST = globalThis.setTimeout; let GAP = 30;
  globalThis.setTimeout = (fn, ms, ...a) => ST(fn, ms >= 60000 ? GAP : ms, ...a);
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { } await sleep(10); } return false; };
  const hex = (b, i) => (b + i).toString(16);
  const box = (ids) => ({ ids, history: [], got: {}, list: null });
  const api = (b) => async (_w, q) => { // GmailSync calls this._api(w, pathq)
    if (q === '/profile') return { emailAddress: 'stand-in@example.invalid', historyId: '900', messagesTotal: b.ids.length };
    if (q.startsWith('/history?')) { const add = b.history.splice(0); return { history: add.length ? [{ messagesAdded: add.map((id) => ({ message: { id } })) }] : [], historyId: '900' }; }
    if (q.startsWith('/messages?')) return { messages: b.list ? b.list() : b.ids.map((id) => ({ id })) };
    const m = /^\/messages\/([^?]+)\?format=raw$/.exec(q);
    if (m) { b.got[m[1]] = (b.got[m[1]] || 0) + 1; return { raw: Buffer.from(`Subject: m ${m[1]}\r\n\r\nbody`).toString('base64url'), internalDate: '1767225600000', labelIds: ['INBOX'] }; }
    throw new Error('unexpected ' + q);
  };
  const onDisk = (dir) => { const out = []; const scan = (d, depth) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory() && depth < 2 && !e.name.startsWith('.')) scan(path.join(d, e.name), depth + 1); else if (/_[a-f0-9]{8,20}\.eml$/.test(e.name)) out.push(e.name); } }; try { scan(dir, 0); } catch { } return out; };
  const total = (b) => Object.values(b.got).reduce((a, n) => a + n, 0);
  const plant = (dir, ids, tag = 'm') => { fs.mkdirSync(dir, { recursive: true }); for (const id of ids) fs.writeFileSync(path.join(dir, `${tag}_${id}.eml`), ''); };
  const stateOf = (dir, st) => fs.writeFileSync(path.join(dir, '.vibespace-gmail-state.json'), JSON.stringify(st));
  const cfgOf = (id, dir) => ({ id, dir, token: '{}', pollSeconds: 300 });
  const locked = [];
  try {
    { // a person empties the folder to sync it again (rm -rf + mkdir, the state file gone), the worker running
      const dir = path.join(tmp, 'mail-empty'), b = box(Array.from({ length: 30 }, (_, i) => hex(0xa0000000, i)));
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('e', dir));
      const seeded = await until(() => w.state === 'idle' && onDisk(dir).length === 30);
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
      const again = await until(() => onDisk(dir).length === 30 && w.state === 'idle');
      gs.stop('e');
      ok('§16 a folder EMPTIED to sync again (rm -rf + mkdir, its state file gone, the worker running): the next pass downloads all 30 again and the count follows — the folder is the index, nothing kept contradicts it', seeded && again && total(b) === 60 && w.count === 30, { seeded, again, downloads: total(b), onDisk: onDisk(dir).length, count: w.count });
    }
    { // a walk that does not finish: the root unreadable, then a subfolder — and from the very first pass
      const dir = path.join(tmp, 'mail-fail'), b = box([]);
      const ids = Array.from({ length: 40 }, (_, i) => hex(0xb0000000, i));
      plant(dir, ids.slice(0, 30)); plant(path.join(dir, '2026-01'), ids.slice(30));
      stateOf(dir, { historyId: '900', email: 'stand-in@example.invalid' });
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('f', dir));
      const first = await until(() => w.state === 'idle' && w.count === 40);
      const okAt = w.lastSyncAt; fs.chmodSync(dir, 0o000); locked.push(dir);
      const failed = await until(() => w.state === 'error');
      const said = String(w.error || ''); const countWhileFailed = w.count; await sleep(150); const stillFailing = w.lastSyncAt === okAt && w.count === 40 && w.state !== 'idle'; // no pass SUCCEEDED while it could not be read
      fs.chmodSync(dir, 0o755);
      const healed = await until(() => w.state === 'idle' && w.count === 40);
      const sub = path.join(dir, '2026-01'); fs.chmodSync(sub, 0o000); locked.push(sub);
      const subFailed = await until(() => w.state === 'error' && /could not be read/.test(String(w.error)));
      const subCount = w.count; fs.chmodSync(sub, 0o755);
      const subHealed = await until(() => w.state === 'idle' && w.count === 40);
      gs.stop('f');
      ok('§16 a walk that did NOT finish is never an answer: the root unreadable ⇒ the pass fails before any download, the mount\'s state names the folder, the count stays 40 (never 0 over 40 files) and the next pass (the loop\'s own backoff) reads it again — 40, nothing downloaded; the same for an unreadable SUBfolder', first && failed && /could not be read \(EACCES\)/.test(said) && said.includes(dir) && countWhileFailed === 40 && stillFailing && healed && subFailed && subCount === 40 && subHealed && total(b) === 0, { first, failed, said, countWhileFailed, stillFailing, healed, subFailed, subCount, subHealed, downloads: total(b) });
      const dir2 = path.join(tmp, 'mail-fail-first'); plant(dir2, ids.slice(0, 5)); stateOf(dir2, { historyId: '900' }); fs.chmodSync(dir2, 0o000); locked.push(dir2);
      const gs2 = new GmailSync({}); gs2._api = api(b); const w2 = gs2.start(cfgOf('f2', dir2));
      const firstFailed = await until(() => w2.state === 'error'); const st2 = gs2.status('f2');
      fs.chmodSync(dir2, 0o755);
      const firstHealed = await until(() => w2.state === 'idle' && w2.count === 5);
      gs2.stop('f2');
      ok('§16 …and when the FIRST walk fails, the count is unknown (null — the sidebar says the failure, never «0 emails»), then 5 once the folder reads', firstFailed && st2.count === null && st2.state === 'error' && firstHealed && total(b) === 0, { firstFailed, status: st2, firstHealed, downloads: total(b) });
    }
    { // the retry is never LATER than a normal pass: pollSeconds 0.3, the long waits PARKED (a fixed 120 s backoff would never come)
      GAP = 60000;
      const dir = path.join(tmp, 'mail-soon'), b = box([]); const ids = Array.from({ length: 6 }, (_, i) => hex(0xb8000000, i));
      plant(dir, ids); stateOf(dir, { historyId: '900', email: 'stand-in@example.invalid' }); fs.chmodSync(dir, 0o300); locked.push(dir);
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start({ ...cfgOf('s', dir), pollSeconds: 0.3 });
      const failed = await until(() => w.state === 'error', 3000);
      fs.chmodSync(dir, 0o755);
      const healed = await until(() => w.state === 'idle' && w.count === 6, 3000);
      gs.stop('s'); GAP = 30;
      ok('§16 a failed pass is tried again no LATER than a normal pass would come (pollSeconds 0.3 ⇒ healed within a second; the mounts\' 300 s ⇒ 120 s)', failed && healed && total(b) === 0, { failed, healed, downloads: total(b) });
    }
    { // a file deleted on disk, a file added by another process — each seen within one pass
      const dir = path.join(tmp, 'mail-change'), ids = Array.from({ length: 10 }, (_, i) => hex(0xc0000000, i)), b = box([]);
      plant(dir, ids); stateOf(dir, { historyId: '900', email: 'stand-in@example.invalid' });
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('c', dir));
      const first = await until(() => w.state === 'idle' && w.count === 10);
      fs.rmSync(path.join(dir, `m_${ids[3]}.eml`)); b.history.push(ids[3]);
      const refetched = await until(() => b.got[ids[3]] === 1 && onDisk(dir).some((n) => n.endsWith(`_${ids[3]}.eml`)));
      const byHand = hex(0xc1000000, 0); fs.writeFileSync(path.join(dir, `byhand_${byHand}.eml`), ''); b.history.push(byHand);
      const counted = await until(() => b.history.length === 0 && w.state === 'idle' && w.count === 11);
      gs.stop('c');
      ok('§16 a file DELETED on disk is downloaded again when Gmail lists it (one pass); a file ADDED by another process is counted and never fetched a second time', first && refetched && counted && !b.got[byHand] && onDisk(dir).filter((n) => n.endsWith(`_${byHand}.eml`)).length === 1, { first, refetched, counted, gotByHand: b.got[byHand] || 0, count: w.count });
    }
    { // the folder missing at the first walk, its mail arriving after
      const dir = path.join(tmp, 'mail-missing', 'not-yet'), b = box([]);
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('x', dir));
      const seeded = await until(() => w.state === 'idle' && w.count === 0);
      const ids = Array.from({ length: 10 }, (_, i) => hex(0xd0000000, i)); plant(dir, ids, 'ext'); b.history.push(...ids);
      const counted = await until(() => b.history.length === 0 && w.state === 'idle' && w.count === 10);
      gs.stop('x');
      ok('§16 the folder MISSING at the first walk: mail another process puts there afterwards is counted at the next pass and never downloaded again', seeded && counted && total(b) === 0, { seeded, counted, downloads: total(b), count: w.count });
    }
    { // within a pass the set grows by what the sync writes: one id listed twice on a seed page is fetched once
      const dir = path.join(tmp, 'mail-twice'), A = hex(0xe0000000, 1), B = hex(0xe0000000, 2), b = box([A, B]);
      b.list = () => [{ id: A }, { id: A }, { id: B }];
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('t', dir));
      const done = await until(() => w.state === 'idle' && b.got[A] && b.got[B]);
      gs.stop('t');
      ok('§16 within a pass the set grows by what the sync writes: an id listed twice on one seed page is downloaded ONCE', done && b.got[A] === 1 && b.got[B] === 1 && w.count === 2, { done, got: b.got, count: w.count });
    }
    { // round 3 (a): a pass that ENDS IN ERROR, and the one that HEALS it, are PUSHED at once — an open panel never keeps «Checking…»
      const dir = path.join(tmp, 'mail-push'), b = box([]); plant(dir, [hex(0xb9000000, 0)]); stateOf(dir, { historyId: '900', email: 'stand-in@example.invalid' });
      const pushes = []; let w = null;
      const gs = new GmailSync({ onProgress: () => pushes.push(w ? w.state : '?') }); gs._api = api(b); w = gs.start(cfgOf('p', dir));
      const first = await until(() => w.state === 'idle' && w.count === 1); const before = pushes.length;
      fs.chmodSync(dir, 0o000); locked.push(dir);
      const failed = await until(() => w.state === 'error'); await sleep(200); const atError = pushes.slice(before);
      fs.chmodSync(dir, 0o755);
      const healed = await until(() => w.state === 'idle'); await sleep(100); const afterHeal = pushes.slice(before);
      gs.stop('p');
      ok('§16 (round 3) a pass that ENDS IN ERROR is pushed at once (mounts-updated — an open panel says «Sync stopped»), repeated failures with the same words push nothing more, and the pass that HEALS it is pushed', first && failed && healed && atError.filter((x) => x === 'error').length === 1 && afterHeal.filter((x) => x === 'error').length === 1 && afterHeal.slice(atError.length).includes('idle'), { atError, afterHeal });
    }
    { // round 3 (b): an id history.list names twice is fetched ONCE on the incremental road too
      const dir = path.join(tmp, 'mail-dup-inc'), b = box([]); plant(dir, [hex(0xba000000, 0)]); stateOf(dir, { historyId: '900', email: 'stand-in@example.invalid' });
      const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('d', dir));
      const first = await until(() => w.state === 'idle' && w.count === 1);
      const X = hex(0xba000000, 9); b.history.push(X, X);
      const done = await until(() => b.history.length === 0 && w.state === 'idle' && w.count === 2);
      gs.stop('d');
      ok('§16 (round 3) an id history.list names TWICE is fetched once on the incremental road (the seed page was already so)', first && done && b.got[X] === 1, { first, done, got: b.got[X] });
    }
    { // ONE walk at a time: start() walks nothing of its own; the first pass walks once; two asks in flight share one walk
      GAP = 60000; // the loop parked after its first pass
      const dir = path.join(tmp, 'mail-one'), b = box([]); plant(dir, [hex(0xf0000000, 0)]); stateOf(dir, { historyId: '900', email: 'stand-in@example.invalid' });
      let rootReads = 0; const ra = fs.promises.readdir;
      fs.promises.readdir = function (d, ...a) { if (String(d) === dir) rootReads++; return ra.call(this, d, ...a); };
      let afterFirst = -1, shared = false, afterTwo = -1;
      try {
        const gs = new GmailSync({}); gs._api = api(b); const w = gs.start(cfgOf('o', dir));
        await until(() => w.lastSyncAt > 0); afterFirst = rootReads;
        const p = gs._seenIds(w), q = gs._seenIds(w); shared = p === q; await p; afterTwo = rootReads;
        gs.stop('o');
      } finally { fs.promises.readdir = ra; GAP = 30; }
      ok('§16 ONE walk at a time: start() + its first pass read the folder ONCE; two asks while a walk runs share it (one more read, not two)', afterFirst === 1 && shared && afterTwo === 2, { afterFirst, shared, afterTwo });
    }
  } finally {
    globalThis.setTimeout = ST;
    for (const d of locked) { try { fs.chmodSync(d, 0o755); } catch { } }
  }
  const SB = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok('§16 the sidebar SAYS a failed pass («Sync stopped: … — it tries again in 2 minutes», the server\'s words) — never «Synced — N emails» over a failure', /m\.gmailState === 'error'\) \{[\s\S]{0,400}tr\('Sync stopped: \{error\} — it tries again in 2 minutes', \{ error: m\.gmailError/.test(SB) && SB.indexOf("m.gmailState === 'error'") < SB.indexOf("tr('Synced — {n} emails'"));
}

console.log('§12a rank 12a — a boot with the update switch on (no NO_AUTO_UPDATE) runs no update before its first loop turn');
{
  const SJ = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const code = SJ.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const boot = code.slice(0, code.indexOf('hub.listen(PORT'));   // everything the boot runs before it listens
  const pull = /autoUpdate\(|'git',\s*\[[^\]]*'pull'|'npm',\s*\['(?:install|ci|run)'/.exec(boot);
  ok('§12a server.js runs NO update before it listens — no autoUpdate(), no `git pull`, no npm install / build: a restart (systemd\'s, a crash, update.sh\'s own) serves at once; the update\'s one road is scripts/update.sh', boot.length > 1000 && !pull, pull && pull[0]);
  const US = fs.readFileSync(path.join(REPO, 'scripts/update.sh'), 'utf8');
  ok('§12a …and the update road still pulls, installs, builds and THEN restarts (scripts/update.sh), so nothing is lost by the boot not pulling', /git pull --ff-only/.test(US) && /npm install --no-audit --no-fund/.test(US) && /npm run build/.test(US) && US.indexOf('npm run build') < US.indexOf('systemctl --user restart vibespace'));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
