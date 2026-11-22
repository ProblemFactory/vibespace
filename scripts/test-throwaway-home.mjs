#!/usr/bin/env node
// B-ba47 shape H — THE PIN (heavy): A HUB STARTED FROM A GIT WORKTREE USES A HOME OF ITS OWN, AFTER FEATURES. The 2.369.401 hotfix
// night: a claim launched outside its lane's env ran hubs on a person's HOME (their usage index CREATED under ~/.vibespace/db).
// Shape H re-homes such a hub at its boot's first act (src/server/throwaway-root.js); this pin boots one through THE SUITES' ONE
// HUB BOOT (scripts/hub-boot.mjs startHub) and USES it, under 主开发 r1412's three laws:
//   (1) THE HANDED HOME IS NEVER A REAL HOME, ON ANY MACHINE: a STAND-IN this suite makes, owns and removes (inside the helper's
//       minted root — the helper's own law, a HOME in the root, holds unchanged). If the re-home under test FAILS, everything the hub
//       writes lands in a folder nobody uses.
//   (2) The product treats a home under a temp root as a suite's own, so the stand-in's folder is named «no temp root» by THE HUB'S
//       SEAM (VIBESPACE_REHOME_NOT_TEMP, src/server/throwaway-root.js seamOf): it can only make a hub re-home MORE, touches no gate,
//       and the PURE verdict keeps its own fast rows (test-home-verdict ②, test-throwaway-boot ⑥); this pin proves the wiring once.
//   (3) THE CHECK COVERS THE FAILURE: a hub that did NOT re-home is ended at once by the helper (by its identity), and the suite
//       reports by name every path it touched in the stand-in (the stand-in's listing alone, never a walk of a real home).
// The features: a chat session on a STAND-IN claude (outside the home), a job (and a program only the stand-in's ~/.local/bin holds:
// not on the hub's PATH), both indexes, the update check (offline: a throwaway copy), the first screen's BANNER read in a real browser (its picture).
// THE READ RECORDER: a preload in the hub's own process lists every fs call naming the stand-in (either spelling), marked BEFORE or
// AFTER the re-home; its node children lose NODE_OPTIONS at the re-home (a named NOT of the built env), so what they and the shell
// children do is judged by the stand-in's listing, byte for byte.
import './scratch.mjs';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, vncEnv, scratch, ONBOARDED_SOURCE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv, endHub } from './hub-boot.mjs';
import { loadPage } from './cdp-page-load.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const ORIGIN = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0, skipped = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call'); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const skip = (n, why) => { skipped++; console.log(`  ○ SKIP ${n} — ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
armWatchdog({ exit: (code) => process.exit(code) });

// ONE minted root (hub-boot rules 1, 9): the tree, the stand-in, the tools, the recorder's file and the browser's home live here; at
// exit — or a signal — the helper ends the hub and everything rooted here, removes the worktree through git, then the root
const root = mintRoot('throwaway-home');
const wt = path.join(root, 'wt'), OUTSIDE = path.join(root, 'outside'), STANDIN = path.join(OUTSIDE, 'home'), tools = path.join(root, 'tools'), cwd = path.join(root, 'cwd');
const chromeHome = path.join(root, 'chrome-home'), chromeDir = path.join(root, 'chrome-profile'), TOUCHES = path.join(root, 'touches.jsonl'), RECORDER = path.join(root, 'recorder.cjs');
const SHOTS = process.env.VS_UI_SHOTS_DIR ? path.join(process.env.VS_UI_SHOTS_DIR, 'test-throwaway-home') : scratch('throwaway-home-shots');
for (const d of [tools, cwd, chromeHome, chromeDir, SHOTS]) fs.mkdirSync(d, { recursive: true });

// ── (1) THE STAND-IN: what a person's home holds (fabricated, expired: nothing here reaches a vendor), 0700, owned by this suite ──
fs.mkdirSync(STANDIN, { recursive: true, mode: 0o700 });
const put = (rel, body, mode) => { const p = path.join(STANDIN, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, mode ? { mode } : undefined); };
const standinValue = ['expired', 'standin', 'value'].join('-');   // built at runtime (the public repo's law: never a token-shaped literal)
put('.claude/settings.json', JSON.stringify({ hooks: {}, model: 'sonnet' }, null, 2));
put('.claude/.credentials.json', JSON.stringify({ claudeAiOauth: { accessToken: standinValue, expiresAt: Date.now() - 1000 } }), 0o600);
put('.claude/projects/-home-person-work/0b5e7f00-0000-4000-8000-000000000001.jsonl', '{"type":"user","message":{"role":"user","content":"hello"}}\n');
put('.claude.json', JSON.stringify({ oauthAccount: { emailAddress: 'person@example.invalid' } }));
put('.codex/config.toml', 'model = "gpt-5"\n');
put('.vibespace/db/0123456789abcdef/usage.db', "a person's own index: never touched\n");
put('.config/google-chrome/Local State', '{}\n');
put('.profile', 'PATH="$HOME/.local/bin:$PATH"; export PATH\n');   // the person's login profile names their own CLIs
put('.local/bin/claude', '#!/bin/sh\n[ "$1" = --version ] && { echo "2.1.314 (Claude Code)"; exit 0; }\nexit 1\n', 0o755);
put('.local/bin/person-cli', '#!/bin/sh\necho "the person\'s own program"\n', 0o755);   // a program only the person\'s ~/.local/bin holds (a made-up name: no host program)
const standinReal = fs.realpathSync(STANDIN);
const SPELLINGS = [...new Set([STANDIN, standinReal])];
const namesStandin = (s) => SPELLINGS.some((p) => String(s).includes(p));

// ── the hub's tools, OUTSIDE the stand-in: a login shell that reads $HOME/.profile (as a person's does), the stand-in claude ──
fs.writeFileSync(path.join(tools, 'login-shell'), '#!/bin/sh\n[ -r "$HOME/.profile" ] && . "$HOME/.profile"\nwhile [ $# -gt 0 ]; do case "$1" in -c) shift; exec /bin/sh -c "$1";; *) shift;; esac; done\nexec /bin/sh\n', { mode: 0o755 });
fs.writeFileSync(path.join(tools, 'claude'), `#!/bin/sh
for a in "$@"; do case "$a" in --version) echo "2.1.274 (Claude Code) stand-in"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac; done
mkdir -p "$HOME/.stand-in-claude-was-here" && echo "$HOME" > "$HOME/.stand-in-claude-was-here/home"
printf '%s\\n' '{"type":"system","subtype":"init","session_id":"e2e00000-0000-4000-8000-00000000b47a","model":"claude-fable-5","cwd":"/tmp","tools":[],"permissionMode":"default","claude_code_version":"2.1.274"}'
exec cat >/dev/null
`, { mode: 0o755 });

// ── THE READ RECORDER (the hub's own process): every fs call naming the stand-in, BEFORE or AFTER the re-home (HOME moved away) ──
fs.writeFileSync(RECORDER, `'use strict';
const fs = require('fs');
const S = ${JSON.stringify(SPELLINGS)}, OUT = ${JSON.stringify(TOUCHES)}, append = fs.appendFileSync.bind(fs);
const names = (a) => { try { const s = a instanceof URL ? a.pathname : Buffer.isBuffer(a) ? a.toString() : String(a); return S.some((p) => s === p || s.startsWith(p + '/')); } catch { return false; } };
const wrap = (obj, label) => { for (const k of Object.keys(obj)) { const f = obj[k]; if (typeof f !== 'function' || /^[A-Z]/.test(k) || k === 'appendFileSync') continue;
  const w = function (...a) { if (names(a[0]) || names(a[1])) { try { append(OUT, JSON.stringify({ phase: S.includes(process.env.HOME) ? 'before' : 'after', call: label + k, path: String(a[0]) }) + '\\n'); } catch { } } return f.apply(this, a); };
  for (const p of Object.keys(f)) w[p] = f[p]; obj[k] = w; } };
wrap(fs, 'fs.'); wrap(fs.promises, 'fs.promises.');
`);

// ── the tree: a LINKED worktree (the re-home's sign) of this checkout, with the tree's own src / public / data/bin ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(path.join(wt, f))} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const own = path.join(wt, '.home');

/** every path under `dir`: its kind, size and sha256 (a link: its target) — sorted, so two listings compare as text */
const listing = (dir) => { const out = []; const walk = (d) => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n), rel = path.relative(dir, p), st = fs.lstatSync(p);
  if (st.isSymbolicLink()) out.push(`L ${rel} -> ${fs.readlinkSync(p)}`); else if (st.isDirectory()) { out.push(`D ${rel}`); walk(p); } else if (st.isFile()) out.push(`F ${rel} ${st.size} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)}`); else out.push(`S ${rel}`); } };
  walk(dir); return out; };
const touches = () => { try { return fs.readFileSync(TOUCHES, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const api = async (p, body) => { const r = await fetch(ORIGIN + p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };

const before = listing(STANDIN);
ok(before.filter((l) => l.startsWith('F ')).length >= 10, `(1) the STAND-IN this suite made (${STANDIN}, inside the helper's minted root) holds what a person's home holds (${before.filter((l) => l.startsWith('F ')).length} files: a sign-in, settings, a transcript, the CLIs' state, an index, a browser's, a login profile and two CLIs)`);
const env = { ...strippedEnv(), ...VNC_ENV, HOME: STANDIN, VIBESPACE_REHOME_NOT_TEMP: OUTSIDE, PATH: `${STANDIN}/.local/bin:${process.env.PATH || ''}`,   /* the handed PATH: the re-home BUILDS its own (nothing of this carried); CLAUDE_CMD names the stand-in claude */ SHELL: path.join(tools, 'login-shell'),
  CLAUDE_CMD: path.join(tools, 'claude'), CLAUDE_CONFIG_DIR: path.join(STANDIN, '.claude'), VIBESPACE_PASSWORD: '' };
// no switch that would hide the gates under test: the update check and the runtime check must be off BECAUSE the copy is throwaway
for (const k of ['VS_NO_REAL_CLI', 'NO_AUTO_UPDATE', 'VIBESPACE_SKIP_AGENT_HOOKS', 'VIBESPACE_FORCE_AGENT_HOOKS', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'VIBESPACE_REAL_INSTALL']) delete env[k];
const hub = startHub({ root, tree: wt, port: PORT, env, nodeArgs: ['-r', RECORDER] });
const up = await hub.ready({ ms: 120000 });
ok(up, 'the hub boots through the helper from a LINKED worktree, handed the stand-in as its HOME (and the seam naming its folder no temp root)', hub.log().slice(-1500));
const tv = up ? await api('/api/throwaway') : { j: null };
const rehomed = !!(tv.j && tv.j.rehomed && tv.j.home === own);
if (!rehomed) {
  // (3) THE CHECK COVERS THE FAILURE: the hub is ended by its identity at once, and every path it touched in the stand-in is said
  try { endHub({ pid: hub.pid, starttime: hub.starttime, root }); } catch { }
  await sleep(1000);
  const after0 = listing(STANDIN);
  ok(false, '(3) THE HUB DID NOT RE-HOME — ended at once by the helper (its identity); what it touched in the STAND-IN, by name:', {
    answer: tv.j, added: after0.filter((l) => !before.includes(l)), changedOrGone: before.filter((l) => !after0.includes(l)), recorded: touches().slice(0, 60) });
  console.log(`\ntest-throwaway-home: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(1);
}
const log = () => hub.log();
ok(rehomed && tv.j.throwaway === true && !namesStandin(JSON.stringify(tv.j)), `(2) RE-HOMED at the first act: the first screen's answer (GET /api/throwaway) names its OWN home ${own} — and no path of the stand-in`, tv.j);
ok(new RegExp(`\\[throwaway\\] this copy runs from a git worktree \\([^)]*\\): its home is ${own.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}, for itself and everything it starts`).test(log()) && /A suite's seam \(VIBESPACE_REHOME_NOT_TEMP\) named /.test(log())
  && !namesStandin(log()) && !log().includes(standinValue),
  "(2) the boot says it: its own home, the seam that named the stand-in's folder — and NO spelling of the stand-in's path, no value, anywhere in the hub's log", log().split('\n').filter((l) => /\[throwaway\]/.test(l)));
for (let i = 0; i < 80 && !/\[runtime\] the boot's runtime check is off/.test(log()); i++) await sleep(250);
ok(/\[runtime\] the boot's runtime check is off: a throwaway copy/.test(log()), "rule 3 on the one test: the boot's runtime check is OFF because the copy is throwaway (no switch hands it off here)");
const ver = await api('/api/version?fresh=1');
for (let i = 0; i < 40 && !/\[version\] the canonical repo is not asked/.test(log()); i++) await sleep(250);
ok(ver.status === 200 && ver.j && ver.j.latest === null && /\[version\] the canonical repo is not asked \(answered offline\): the hub's root [^\n]* is a throwaway copy/.test(log()), "…and the update check answers OFFLINE for the same reason, said once", ver.j);

// ── the features ──
const frames = []; const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
ws.on('message', (d) => { try { frames.push(JSON.parse(d)); } catch { } });
const waitFrame = async (pred, n = 120) => { for (let i = 0; i < n; i++) { const f = frames.find(pred); if (f) return f; await sleep(250); } return null; };
ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, reqId: 'c1', name: 'pin', cols: 80, rows: 24 }));
const c1 = await waitFrame((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c1');
ok(c1 && c1.type === 'created', 'a chat session starts on the STAND-IN claude it was handed by name (CLAUDE_CMD, outside the stand-in)', c1);
for (let i = 0; i < 40 && !fs.existsSync(path.join(own, '.stand-in-claude-was-here', 'home')); i++) await sleep(250);
ok(fs.existsSync(path.join(own, '.stand-in-claude-was-here', 'home')) && fs.readFileSync(path.join(own, '.stand-in-claude-was-here', 'home'), 'utf8').trim() === own, "…and the CLI it started lives in the hub's OWN home (it wrote its HOME there)");
if (c1 && c1.sessionId) { ws.send(JSON.stringify({ type: 'kill', sessionId: c1.sessionId })); await waitFrame((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === c1.sessionId, 40); }
ws.close();
for (let i = 0; i < 120; i++) { const r = await fetch(ORIGIN + '/api/jobs').catch(() => null); if (r && r.status === 200) break; await sleep(250); }
const jb = await api('/api/jobs', { kind: 'task', name: 'pin', cmd: { argv: ['sh', '-c', 'mkdir -p "$HOME/.job-was-here" && echo "$HOME" > "$HOME/.job-was-here/home" && { command -v person-cli || echo none; } > "$HOME/.job-was-here/which"'], cwd } });
let job = null; for (let i = 0; i < 80 && jb.j && jb.j.job; i++) { job = (await api(`/api/jobs/${jb.j.job.id}?tail=20`)).j?.job; if (job && job.run && job.run.endedAt) break; await sleep(500); }
const jobHome = path.join(own, '.job-was-here', 'home');
ok(fs.existsSync(jobHome) && fs.readFileSync(jobHome, 'utf8').trim() === own, "a JOB runs with the hub's own home as its $HOME (it wrote there)", { created: jb.status, error: jb.j && jb.j.error, state: job && job.state });
const which = (() => { try { return fs.readFileSync(path.join(own, '.job-was-here', 'which'), 'utf8').trim(); } catch { return null; } })();
ok(which === 'none', "…and a program only the stand-in's ~/.local/bin holds (on the PATH it was handed, in its login profile) is NOT on the hub's PATH: the PATH is built, nothing of the handed one carried", which);
for (let i = 0; i < 30; i++) { try { await fetch(ORIGIN + '/api/search?q=probe'); } catch { } if (/\[search-index\] ready/.test(log())) break; await sleep(1000); }
// (B-360d unit 1: the usage index is RETIRED — the Usage window answers from the ledger's own cells; only the search index opens a folder)
const dirOf = (tag) => { const m = new RegExp(`\\[${tag}\\] ready: [^\\n]*\\((/[^)\\n]+)\\)`).exec(log()); return m ? m[1] : null; };
ok(String(dirOf('search-index')).startsWith(own + '/') && !/\[usage-index\] ready/.test(log()), `the search index opened under the OWN home — the hotfix night's writer (search: ${dirOf('search-index')}); the retired usage index opens nothing`, log().split('\n').filter((l) => /-index\]/.test(l)).slice(0, 6));

// ── the first screen's BANNER, read in a real browser (its picture) ──
if (!CHROME) skip("the first screen's banner in a browser", 'no Chrome on this machine');
else {
  const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
  try {
    const target = await waitPageTarget(CDP_PORT, { child: chrome, who: 'test-throwaway-home' });   // scripts/cdp-page-target.mjs: a miss always waits, each ask bounded
    if (!target) throw new Error(`no page target on DevTools port ${CDP_PORT} (${waitPageTarget.lastSeen})`);
    const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r) => sock.on('open', r));
    let seq = 0; const pend = new Map(); sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
    const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.value; };
    await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await loadPage(cdp, ORIGIN + '/');
    let text = null; for (let i = 0; i < 60 && !text; i++) { text = await evalJs(`(() => { const b = document.getElementById('throwaway-banner'); return b ? b.innerText : null; })()`).catch(() => null); if (!text) await sleep(250); }
    const shot = await cdp('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(SHOTS, 'first-screen-banner.png'), Buffer.from(shot.data, 'base64'));
    ok(!!text && text.includes('runs from a git worktree') && text.includes(own) && text.includes('VIBESPACE_REAL_INSTALL=1') && !namesStandin(text),
      `the FIRST SCREEN says it: one strip with its own home and the two doors as exact text — no path of the stand-in (picture: ${path.join(SHOTS, 'first-screen-banner.png')})`, text);
    sock.close();
  } catch (e) { ok(false, "the first screen's banner could not be read in the browser", String(e && e.stack || e)); }
  finally { try { chrome.kill('SIGKILL'); } catch { } }
}

// ── the hub ended by its identity; then the stand-in, byte for byte, and the recorder ──
try { endHub({ pid: hub.pid, starttime: hub.starttime, root, hubOnly: false }); } catch { }
await sleep(1500);
const after = listing(STANDIN), ownList = fs.existsSync(own) ? listing(own) : [];
const gone = before.filter((l) => !after.includes(l)), added = after.filter((l) => !before.includes(l));
ok(gone.length === 0 && added.length === 0, `THE STAND-IN, BYTE FOR BYTE AFTER THE FEATURES: ${before.length} entries before, the same ${after.length} after — nothing added, removed or changed`, { added: added.slice(0, 40), changedOrGone: gone.slice(0, 40) });
const t = touches(), afterTouches = t.filter((x) => x.phase === 'after'), beforeTouches = t.filter((x) => x.phase === 'before');
const NAMED = [/^(?:fs\.)?(?:lstatSync|realpathSync|statSync)$/];   // the first act's own reads of the handed home: its walk (lstat), its other spelling (realpath), a tool probe (stat)
const own0 = (x) => x.path === STANDIN || x.path === standinReal || x.path === path.join(STANDIN, '.local', 'bin', 'dtach') || x.path === path.join(standinReal, '.local', 'bin', 'dtach');
ok(afterTouches.length === 0 && beforeTouches.every((x) => NAMED.some((re) => re.test(x.call.replace(/^fs\.(promises\.)?/, ''))) && own0(x)),
  `THE READ RECORDER (the hub's own process): ${beforeTouches.length} touch(es) of the stand-in BEFORE the re-home, each a named one (the home itself, its other spelling, the product's own dtach probe); NONE after`, { before: beforeTouches.slice(0, 20), after: afterTouches.slice(0, 20) });
ok(ownList.some((l) => /^D \.vibespace\/db/.test(l)) && ownList.some((l) => /^D \.job-was-here$/.test(l)) && ownList.some((l) => /^D \.stand-in-claude-was-here$/.test(l)),
  `what the hub and its children wrote lives under ${own} (${ownList.filter((l) => /^F /.test(l)).length} files: the indexes, the job's folder, the CLI's)`, ownList.slice(0, 30));
console.log(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(failed ? 1 : 0);
