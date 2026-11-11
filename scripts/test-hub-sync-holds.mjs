#!/usr/bin/env node
// lane hub-sync-holds — NOTHING SYNCHRONOUS RUNS A CHILD OR WALKS A TREE ON THE HUB'S LOOP (the owner's hub, 2026-11-11: the
// profile named each a hold of the main loop). FAST, in-process: a scratch HOME, stand-in commands on PATH, no network, no
// real agent CLI, no sudo (a stand-in answers to that name), nothing signalled.
//   §13 rank 13 — a plugin's STATUS is a kept fact: a snapshot / a broadcast runs no child; the fresh answer is ONE async
//       refresh with timeouts (tailscale ran pgrep + sudo -n + `tailscale status --json` on every snapshot: 4.7–4.9 s)
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
const SLOW_MS = 3000;
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

console.log('§13 rank 13 — a plugin snapshot runs no child; its status is a kept fact, refreshed async');
{
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const REAL = require(path.join(REPO, 'src/plugins/tailscale.js'));
  const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'data-')), plugins: [REAL] });
  // a person opens the panel: the snapshot — a stand-in pgrep that takes 3 s must not hold the loop
  const snap = await longestTurn(() => pm.list());
  const row = (snap.out || []).find((p) => p.id === 'tailscale') || {};
  ok(`§13 a snapshot with a 3 s stand-in pgrep on PATH answers at once — the loop's longest turn under ${BOUND_MS} ms (its status is the KEPT fact: «checking» before the first read)`, snap.ms < BOUND_MS && snap.worstBeatMs < BOUND_MS && row.checking === true, { ms: snap.ms, worstBeat: snap.worstBeatMs, row });
  // the fresh read: ONE async refresh — the children take their 3 s, the loop never waits on them
  const fresh = await longestTurn(() => (typeof pm.refreshStatus === 'function' ? pm.refreshStatus('tailscale') : Promise.resolve(null)));
  ok(`§13 the fresh status is ONE async refresh: it takes the children's time (≥ ${SLOW_MS} ms) while no turn of the loop exceeds ${BOUND_MS} ms`, !!fresh.out && fresh.ms >= SLOW_MS - 200 && fresh.worstBeatMs < BOUND_MS && fresh.maxDelayMs < BOUND_MS, { ms: fresh.ms, worstBeat: fresh.worstBeatMs, maxDelay: fresh.maxDelayMs });
  const after = await longestTurn(() => pm.list());
  const row2 = (after.out || []).find((p) => p.id === 'tailscale') || {};
  ok('§13 the next snapshot answers the KEPT fact (the refresh\'s answer, no «checking»), again with no child on its turn', after.ms < BOUND_MS && row2.checking === undefined && row2.running === false && row2.sudo === false, { ms: after.ms, row: row2 });
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
  { // 2. an ask abandoned at its bound STARTS NOTHING MORE and WRITES NOTHING (a 3 s stand-in pgrep against a 1 s bound)
    fs.writeFileSync(STANDLOG, '');
    const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'bound-')), plugins: [REAL], statusBoundMs: 1000 });
    const hold = setInterval(() => { }, 1000);
    const t0 = Date.now(); const st = await pm.refreshStatus('tailscale'); const took = Date.now() - t0;
    await sleep(Math.max(0, SLOW_MS + 800 - (Date.now() - t0))); clearInterval(hold);
    const after = pm.status('tailscale'); const log = standLog();
    ok('§13 an ask abandoned at its bound STARTS NOTHING MORE and WRITES NOTHING: ended at 1 s (statusError), and 3.8 s on its pgrep was the last child it ever started (no sudo after it) and the row is still the pre-answer one (checking), not a late write', took >= 900 && took < 2500 && !!st.statusError && log.filter((l) => l === 'pgrep').length === 1 && !log.includes('sudo') && after.checking === true, { took, statusError: st.statusError, log, checking: after.checking });
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
  { // 4. never refreshed by a timer: the census of refresh callers (any new caller — a timer's or not — is red until it is argued here)
    const rows = []; const files = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join('src', f))];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(REPO, f), 'utf8').split('\n');
      lines.forEach((l, i) => { if (/^\s*(\/\/|\*)/.test(l)) return; if (/\b(this|plugins|getPlugins\(\)\??)\.refreshStatus\(/.test(l)) rows.push(`${f}:refreshStatus:${/setTimeout|setInterval/.test(l) ? 'TIMER' : 'call'}`); if (/(\bplugins|\bthis|getPlugins\(\)\??)\.refreshAll\(/.test(l)) rows.push(`${f}:refreshAll:${/setTimeout|setInterval/.test(l) ? 'TIMER' : 'call'}`); });
    }
    const want = ['src/plugins.js:refreshStatus:call', 'src/plugins.js:refreshStatus:call', 'src/plugins.js:refreshAll:call', 'src/server/mounts-plugins-wiring.js:refreshAll:call', 'src/server/mounts-plugins-wiring.js:refreshStatus:call'].sort();
    // the receivers that are the plugin manager: `this` (plugins.js), `plugins`, `getPlugins()` (auto-resume's own refreshStatus is another object)
    ok('§13 NEVER refreshed by a timer — the plugin manager\'s refresh callers are exactly: the plugin\'s own event (h.notify), refreshAll\'s loop, bootReplay, GET /api/plugins, GET …/status; none on a timer line', JSON.stringify(rows.sort()) === JSON.stringify(want), rows);
  }
  const UI = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8');
  ok('§13 the panel: a first answer that FAILED says «Status unknown» and frees the switch (a running daemon can always be stopped); the stale mark is a visible line on the row, not only a hover title; no tailscale command ⇒ its own words, no «Log in…»', /p\.checking \? \(p\.statusError \? t\('Status unknown — it could not be read'\) : t\('Checking…'\)\)/.test(UI) && /swDisabled = \(!!p\.checking && !p\.statusError\) \|\| p\.mode === 'system' \|\| \(!p\.installed && !running\)/.test(UI) && /if \(p\.statusError\) \{\n\s+const stale = Object\.assign\(document\.createElement\('div'\), \{ className: 'plugin-row-fact', textContent: t\('Not read again just now \(\{why\}\)/.test(UI) && /p\.backendState !== 'Running' && p\.cli !== false/.test(UI));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
