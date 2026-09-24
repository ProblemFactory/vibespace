#!/usr/bin/env node
// THE RECONNECT STORM (perf lane ⑤b — the THIRD layer of inc-mtndq0vb, 2.369.16,
// userW): after a server restart 19 chat windows re-attached IN THE SAME SECOND,
// the history rebuilds they triggered blocked the server's loop for 4 minutes,
// the heartbeat read its own stall as dead clients and terminated them, and the
// kills queued on those sockets were lost. 2.369.16 fixed the SERVER half
// (time-sliced single-flight rebuilds, a stall-aware heartbeat, acknowledged
// kills); the client still sent all 19 attaches in one tick — 14 of them for
// windows nobody could see (other desktops, tab guests, minimized).
//
// THE FIX UNDER TEST: a SUSPENDED ChatView (any hider of the reason set) takes a
// slot in the App's reconnect queue (src/lib/reconnect-queue.js; delays from the
// PURE `reconnectSlot`: 1500 ms + k·250 ms, capped at 6 s) while a displayed view
// re-attaches at once; un-hiding a queued view attaches it NOW; the heartbeat's
// longest loop gap per round is telemetry metric `srv-loop-gap-ms`.
//
// THE HARNESS (perf chunks C and D measure on it too): a scratch worktree server
// (fake HOME, VIBESPACE_SKIP_AGENT_HOOKS=1, free ports) with 19 LIVE chat sessions
// under the REAL data/bin/chat-wrapper.js driving a stub `claude` (prints its
// stream-json system/init frame for the resumed id, then idles on stdin) over
// §1c-shaped transcripts (scripts/huge-transcript-fixture.mjs, 6 MB each); a
// headless chrome page lays out 5 windows DISPLAYED on the active desktop and 14
// HIDDEN (5 + 5 on two other desktops, 2 tab hosts behind their guests, 2
// minimized) — the hidden ones FIRST in window order, so the unfixed client sends
// their attaches ahead of the visible ones exactly as an arbitrary layout can —
// then drops the socket (`app.ws.ws.close()` via CDP) and measures the storm.
// Server arrival = the `attach-ack` the server sends synchronously on receipt.
//
// CONTROL: the same run against a second scratch worktree whose chat-view has the
// stagger NEUTERED at source level (string-exact marker, asserted) — it must show
// the storm (≥ 15 attaches in one second), or the harness proves nothing.
//
// ASSERTS (fix vs control): (a) attaches-per-second peak at the server ≤ 6;
// (b) the 5 visible windows' `attached` p95 ≤ the control's (+ a 50 ms noise band);
// (c) the 14 hidden windows' acks spread ≥ 14 × 250 ms past the reconnect and all
// land within the control's last + 6 s; (d) `srv-loop-gap-ms` max over the storm
// ≤ the control's (+ max(25 %, 50 ms) noise band; printed); (e) a hidden window
// un-hidden 500 ms after the RECONNECT (the socket is still down 500 ms after the
// drop — the reconnect waits 2–3 s — so nothing is queued yet then) attaches
// within one round trip of the un-hide, its slot cancelled; (f) loadHistory
// rebuilds (calls minus identical-skips) ≤ the control's.
//
// LIVE TURNS BETWEEN DROPS (perf chunk C, 2.369.167): before each drop every
// transcript grows by a live turn (VS_STORM_APPEND_KB, default 64 KB — what the
// CLI writes while nobody is attached), so each re-attach meets a CHANGED file:
// its chatStatus()/activePendingPermissions() read the transcript SYNC on the
// loop. The harness preload also counts every .jsonl byte the server process
// reads, per thread (a harness-only instrument — the product's own
// `srv-jsonl-parse-bytes` / `srv-jsonl-parse-ms` are printed beside it). (g) fix:
// the main thread reads ≤ 2 × the appended bytes (+ ≤ 16 KiB of probes per session)
// over the storm — the parse cache and the task-event scan each read the new
// bytes once; the unfixed parse cache re-read every whole transcript (19 × 6 MB).
//
// RESUME BY SEQ (perf chunk D, 2.369.167): every `msg` frame carries the
// session's `seq`; a same-epoch re-attach inside the server's op ring gets
// `attached {slab:'held', replay}` — the frames it missed, verbatim — instead of
// a slab + an HTTP catch-up; a capable client whose socket stops draining gets
// ONE `lagged` and resumes by seq. The CONTROL additionally has the resume
// neutered in chat-view (the second string-exact marker), so it is the
// pre-chunk-D client. (h) fix: 0 `attached` frames carry a slab (control 19),
// 0 catch-ups, 0 loadHistory, the bytes on the wire per reconnect printed beside
// the control's; (i) with LIVE RECORDS IN FLIGHT across the drop (the stub CLI
// answers a `VS_BURST` prompt with 12 text / tool_use / tool_result triples over
// ~3 s), every window's cards — ids, order, roles, status, content — equal the
// server normalizer's slab for the same range fetched fresh after the storm
// (printed for the control too: its catch-up fetches missed CREATES only);
// (j) the lagged leg (fix): one displayed window's socket throttled while its
// session emits 64 × 400 KB tool results ⇒ exactly one `ws-lagged` at the server, the
// socket's send queue sampled ≤ limit + one frame (a harness preload patches
// ws's send), and after un-throttling the window equals the server within 10 s.
// WHAT THE CONTROL IS NOT (perf r1, the verifier's finding): the control is THIS
// tree with the client's stagger and resume neutered — its server still ships
// this tree's attach slab. Its bytes / p95 are therefore not master's: on the
// 6 MB fixture master (348aa226) ships 12.3 MB per 19-window reconnect with a
// visible attached p95 of 131–167 ms (the verifier's probe, 5 drops), and the
// first cut's control measured 29 MB only because perf 1's 1.5 MB text window
// was on the server. Cite master's numbers for a before/after, this control only
// for "the stagger / the resume is what moved it".
// Run: node scripts/test-reconnect-storm.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const N = 19, N_HIDDEN = 14, N_VISIBLE = 5;
const FIXTURE_MB = Number(process.env.VS_STORM_FIXTURE_MB || 6);
const APPEND_KB = Number(process.env.VS_STORM_APPEND_KB ?? 64);
const CONTROL_MARKER = 'if (q && this._suspended && !this._readOnly && !this._disposed) {';
const CONTROL_SEQ_MARKER = "if (!this._seqPoisoned && this._serverOpSeq != null && typeof this._lastSeq === 'number' && this._seqEpoch) {"; // chunk D: the control never resumes by seq (perf r1: the poisoned-watermark guard is part of the line)
const LAG_LIMIT = 4 * 1048576; // src/op-seq.js LAGGED_LIMIT_BYTES (the production default — no knob)
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 250) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };

// ── everything this suite starts, so every exit path ends it ──
const procs = new Set(), dirs = new Set(), worktrees = new Set();
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  // the fake-claude sessions live under dtach and would outlive their server:
  // every dtach master / wrapper / stub of THIS run carries its worktree path
  for (const wt of worktrees) { try { execSync(`pkill -9 -f ${JSON.stringify(wt)}`, { stdio: 'ignore' }); } catch { } }
  for (const wt of worktrees) { try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { } try { fs.rmSync(wt, { recursive: true, force: true }); } catch { } }
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

// the REAL home's project list before anything runs — the per-suite census at the end proves no
// fixture landed there (every server here runs under its own scratch HOME)
const REAL_PROJECTS = path.join(process.env.HOME || '', '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require('../src/fixture-guard.js');

const SIDS = Array.from({ length: N }, (_, i) => fixtureSid((0x5700 + i).toString(16)));

async function prepareVariant(variant) {
  const wt = scratch(`rstorm-${variant}`);
  const fakeHome = scratchHome(`rstorm-${variant}-home`, fs); dirs.add(fakeHome);
  const home = fakeHome;
  const cwd = scratch(`rstorm-${variant}-cwd`); dirs.add(cwd); fs.mkdirSync(cwd, { recursive: true });
  const stub = scratch(`rstorm-${variant}-claude`); dirs.add(stub);
  // §1c-shaped transcripts, one per conversation, under the ISOLATED home
  const proj = path.join(home, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  for (const sid of SIDS) await writeHugeTranscript({ file: path.join(proj, `${sid}.jsonl`), sid, cwd, targetBytes: FIXTURE_MB * 1048576 });
  // the stub CLI: answers the boot probes, announces a stream-json init for the
  // RESUMED id, then idles on stdin exactly where the real CLI waits for a turn
  fs.writeFileSync(stub, `#!/bin/sh
SID=""; prev=""
for a in "$@"; do
  case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac
  if [ "$prev" = "--resume" ]; then SID="$a"; fi
  prev="$a"
done
[ -n "$SID" ] || SID="${fixtureSid('57ff')}"
printf '%s\\n' "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"session_id\\":\\"$SID\\",\\"model\\":\\"claude-fable-5\\",\\"cwd\\":\\"$PWD\\",\\"tools\\":[],\\"permissionMode\\":\\"default\\",\\"claude_code_version\\":\\"2.1.274\\"}"
# chunk D: a prompt carrying VS_BURST is answered by LIVE records over ~3 s (text, then a
# tool_use whose tool_result lands a beat later = a create and an EDIT); VS_BIG_BURST by
# 64 tool calls whose results carry 400 KB each, at once (the lagged leg). Any other stdin line is ignored.
R=0
while IFS= read -r line; do
  case "$line" in *VS_BIG_BURST*) N=64; BIG=1 ;; *VS_BURST*) N=12; BIG=0 ;; *) continue ;; esac
  R=$((R+1)); i=0
  while [ $i -lt $N ]; do
    i=$((i+1))
    if [ $BIG = 1 ]; then
      printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_big_%s_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"tool_use","id":"toolu_big_%s_%s","name":"Bash","input":{"command":"cat big %s"}}]}}\\n' "$SID" "$R" "$i" "$R" "$i" "$i"
      printf '{"type":"user","parent_tool_use_id":null,"session_id":"%s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_big_%s_%s","content":"' "$SID" "$R" "$i"
      head -c 400000 /dev/zero | tr '\\0' b
      printf '"}]}}\\n'
    else
      printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_b_%s_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"text","text":"burst %s.%s answer"}]}}\\n' "$SID" "$R" "$i" "$R" "$i"
      printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_t_%s_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"tool_use","id":"toolu_b_%s_%s","name":"Bash","input":{"command":"ls %s"}}]}}\\n' "$SID" "$R" "$i" "$R" "$i" "$i"
      sleep 0.12
      printf '{"type":"user","parent_tool_use_id":null,"session_id":"%s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_b_%s_%s","content":"out %s.%s"}]}}\\n' "$SID" "$R" "$i" "$R" "$i"
      sleep 0.12
    fi
  done
  printf '{"type":"result","subtype":"success","session_id":"%s","duration_ms":1,"total_cost_usd":0,"is_error":false}\\n' "$SID"
done
`, { mode: 0o755 });
  // a throwaway worktree with the WORKING TREE overlaid (a pre-commit run tests what is about to ship)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  if (variant === 'control') {
    const f = path.join(wt, 'src/lib/chat-view.js');
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes(CONTROL_MARKER)) throw new Error('control: the stagger marker is gone from chat-view.js — update CONTROL_MARKER');
    // a RUNTIME marker (esbuild drops comments and folds a bare `false &&`), asserted in the bundle below
    if (!src.includes(CONTROL_SEQ_MARKER)) throw new Error('control: the resume-by-seq marker is gone from chat-view.js — update CONTROL_SEQ_MARKER');
    fs.writeFileSync(f, src.replace(CONTROL_MARKER, "if ((window.__stormControl = 'stagger neutered') && false) {")
      .replace(CONTROL_SEQ_MARKER, "if ((window.__stormControlSeq = 'op-seq neutered') && false) {"));
  }
  // the overlaid src/lib/build-version.js carries the REAL version (= /api/version): a 'test' stamp would
  // make the stale-bundle check reload the tab on connect — and again on the storm's reconnect
  if (!fs.existsSync(path.join(wt, 'src/lib/build-version.js'))) throw new Error('src/lib/build-version.js is missing — run `npm run build` first');
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  const bundle = fs.readFileSync(path.join(wt, 'public/bundle.js'), 'utf8');
  const neutered = bundle.includes('stagger neutered');
  if ((variant === 'control') !== neutered) throw new Error(`${variant}: the bundle ${neutered ? 'IS' : 'is NOT'} neutered`);
  if ((variant === 'control') !== bundle.includes('op-seq neutered')) throw new Error(`${variant}: the bundle's resume-by-seq is ${variant === 'control' ? 'NOT ' : ''}neutered`);
  return { wt, home: fakeHome, cwd, stub, proj };
}

// A LIVE TURN as the CLI writes it while nobody is attached: a prompt, tool calls
// and their results, a closing text — ≈ `kb` KB, uuids minted per (sid, round).
function appendLiveTurn(proj, sid, round, kb) {
  const at = (k) => new Date(Date.UTC(2026, 8, 23, 12, round, k % 60)).toISOString();
  const recs = [{ type: 'user', uuid: `${sid.slice(0, 24)}${String(round).padStart(4, '0')}00000000`, timestamp: at(0), sessionId: sid, message: { role: 'user', content: [{ type: 'text', text: `live turn ${round} 继续` }] } }];
  let bytes = 0, k = 1;
  while (bytes < kb * 1024) {
    const id = `toolu_live_${round}_${k}`;
    const a = { type: 'assistant', uuid: `${sid.slice(0, 24)}${String(round).padStart(4, '0')}${String(k).padStart(8, '0')}`, timestamp: at(k), sessionId: sid, requestId: `req_live_${round}_${k}`, message: { id: `msg_live_${round}_${k}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: `ls ${k}` } }] } };
    const r = { type: 'user', uuid: `${sid.slice(0, 20)}ffff${String(round).padStart(4, '0')}${String(k).padStart(8, '0')}`, timestamp: at(k), sessionId: sid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'o'.repeat(2000) }] } };
    recs.push(a, r); bytes += JSON.stringify(a).length + JSON.stringify(r).length; k++;
  }
  recs.push({ type: 'assistant', uuid: `${sid.slice(0, 20)}eeee${String(round).padStart(4, '0')}00000000`, timestamp: at(k), sessionId: sid, requestId: `req_live_${round}_end`, message: { id: `msg_live_${round}_end`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `turn ${round} done 完成` }] } });
  const text = recs.map((x) => JSON.stringify(x)).join('\n') + '\n';
  fs.appendFileSync(path.join(proj, `${sid}.jsonl`), text);
  return Buffer.byteLength(text);
}

async function runVariant(variant) {
  console.log(`— ${variant}: preparing (${N} × ${FIXTURE_MB} MB §1c transcripts, worktree, bundle)`);
  const { wt, home: fakeHome, cwd, stub, proj } = await prepareVariant(variant);
  const [PORT, CDP_PORT] = await freePorts(2);
  // A HARNESS-ONLY loop instrument beside the product's metric: `srv-loop-gap-ms` is the heartbeat
  // pulse's view (a 1 s timer's lateness, ≥ 50 ms recorded) — right for Diagnostics, too coarse to
  // tell two sub-50 ms storms apart. perf_hooks.monitorEventLoopDelay (5 ms resolution) logs the
  // max delay per 250 ms into a scratch file; never a production knob, loaded with `node -r`.
  const loopLog = scratch(`rstorm-${variant}-loop`); dirs.add(loopLog);
  const preload = scratch(`rstorm-${variant}-preload`) + '.cjs'; dirs.add(preload);
  fs.writeFileSync(preload, `const { monitorEventLoopDelay } = require('perf_hooks'); const fs = require('fs');
const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
setInterval(() => { try { fs.appendFileSync(${JSON.stringify(loopLog)}, Date.now() + ' ' + (h.max / 1e6).toFixed(1) + '\\n'); } catch {} h.reset(); }, 250).unref();
`);
  // …and the transcript bytes this process reads, per thread (the preload runs in every
  // worker too): every .jsonl open→read and readFileSync, flushed as '<ms> <thread> <bytes>'
  // lines every 250 ms (readFileSync's own internal reads are not counted twice)
  const jsonlLog = scratch(`rstorm-${variant}-jsonl`); dirs.add(jsonlLog);
  fs.appendFileSync(preload, `{ const wt = require('worker_threads'); const fdPath = new Set(); let acc = 0, inRF = 0;
const o = fs.openSync; fs.openSync = function (p, ...a) { const fd = o.call(this, p, ...a); if (typeof p === 'string' && p.endsWith('.jsonl')) fdPath.add(fd); return fd; };
const c = fs.closeSync; fs.closeSync = function (fd) { fdPath.delete(fd); return c.call(this, fd); };
const rs = fs.readSync; fs.readSync = function (fd, ...a) { const n = rs.call(this, fd, ...a); if (!inRF && fdPath.has(fd)) acc += n; return n; };
const rf = fs.readFileSync; fs.readFileSync = function (p, ...a) { inRF++; let r; try { r = rf.call(this, p, ...a); } finally { inRF--; } if (typeof p === 'string' && p.endsWith('.jsonl')) acc += typeof r === 'string' ? Buffer.byteLength(r) : r.length; return r; };
setInterval(() => { if (acc) { try { fs.appendFileSync(${JSON.stringify(jsonlLog)}, Date.now() + ' ' + wt.threadId + ' ' + acc + '\\n'); } catch {} acc = 0; } }, 250).unref(); }
`);
  // …and (chunk D) the largest send queue any server socket reached per 250 ms, plus the largest
  // single frame sent: ws's own WebSocket.prototype.send wrapped (the server's instance — resolved
  // from the worktree's server.js), main thread only. Harness-only, like the two above.
  const bufLog = scratch(`rstorm-${variant}-buf`); dirs.add(bufLog);
  fs.appendFileSync(preload, `{ const wt = require('worker_threads'); if (wt.isMainThread) { let WS = null; try { WS = require('module').createRequire(process.cwd() + '/server.js')('ws'); } catch {}
if (WS && WS.prototype && typeof WS.prototype.send === 'function') { const s0 = WS.prototype.send; let mx = 0, fr = 0;
let mmx = 0, mfr = 0;
WS.prototype.send = function (data, ...a) { const r = s0.call(this, data, ...a); const b = this.bufferedAmount || 0; if (b > mx) mx = b; const n = data && data.length || 0; if (n > fr) fr = n;
  // the queue the cut governs, on the sockets it cut: per socket the max right after a stamped msg
  // frame, folded into the logged max once (and from then on) that socket was sent a lagged frame
  if (typeof data === 'string' && data.startsWith('{"type":"msg"')) { if (b > (this.__mmx || 0)) this.__mmx = b; if (n > (this.__mfr || 0)) this.__mfr = n; if (this.__lagged) { if (b > mmx) mmx = b; if (n > mfr) mfr = n; } }
  else if (typeof data === 'string' && data.startsWith('{"type":"lagged"')) { this.__lagged = true; if ((this.__mmx || 0) > mmx) mmx = this.__mmx; if ((this.__mfr || 0) > mfr) mfr = this.__mfr; }
  return r; };
setInterval(() => { if (mx || fr) { try { fs.appendFileSync(${JSON.stringify(bufLog)}, Date.now() + ' ' + mx + ' ' + fr + ' ' + mmx + ' ' + mfr + '\\n'); } catch {} mx = 0; fr = 0; mmx = 0; mfr = 0; } }, 250).unref(); } } }
`);
  let journal = '';
  const srv = spawn(process.execPath, ['-r', preload, 'server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-20000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-20000); });
  const chromeDir = scratch(`rstorm-${variant}-chrome`); dirs.add(chromeDir);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox',
    '--disable-dev-shm-usage', '--window-size=1500,1050', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  const up = await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000);
  if (!up) throw new Error(`${variant}: the scratch server never answered\n${journal.slice(-1500)}`);

  // ── 19 LIVE chat sessions through the real create path (stub CLI behind the real wrapper) ──
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  const ids = [];
  for (let i = 0; i < N; i++) {
    ctl.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, resume: true, resumeId: SIDS[i], reqId: 'c' + i, name: 'storm ' + i, cols: 80, rows: 24 }));
    await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c' + i), 20000, 100);
    const c = frames.find((m) => m.type === 'created' && m.reqId === 'c' + i);
    if (!c) throw new Error(`${variant}: create ${i} failed: ${JSON.stringify(frames.find((m) => m.reqId === 'c' + i) || frames.slice(-2)).slice(0, 400)}`);
    ids.push(c.sessionId);
  }
  const killAll = async () => {
    for (const id of ids) { try { ctl.send(JSON.stringify({ type: 'kill', sessionId: id })); } catch { } }
    await until(() => ids.every((id) => frames.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === id)), 10000, 200);
  };

  // ── CDP ──
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!target) throw new Error('chrome never exposed a CDP page target');
  const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdpWs.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  cdpWs.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?');
  });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cdpWs.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
  if (!await until(() => ev('!!(window.app && window.app.ready)'), 30000)) throw new Error('the app never booted');
  await ev('window.app.ready.then(() => true)');

  // ── the layout: 14 hidden FIRST in window order, 5 displayed last ──
  //   0–4 → desktop B · 5–9 → desktop C · 10, 11 = tab hosts behind guests 14, 15 · 12, 13 minimized · 14–18 displayed
  const setup = await ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ids = ${JSON.stringify(ids)}, cwd = ${JSON.stringify(cwd)};
    const app = window.app, dm = app.desktopManager, wm = app.wm;
    const deskB = dm.createDesktop('B'), deskC = dm.createDesktop('C');
    const wins = [];
    for (let i = 0; i < ids.length; i++) { wins.push(app.attachSession(ids[i], 'storm ' + i, cwd, { mode: 'chat', backend: 'claude' }).id); await sleep(60); }
    const view = (i) => app.sessions.get(wins[i]);
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      if (wins.every((w, i) => view(i) && view(i)._messages && view(i)._messages.length > 0 && view(i)._total > 0)) break;
      await sleep(500);
    }
    const loaded = wins.filter((w, i) => view(i) && view(i)._messages?.length > 0 && view(i)._total > 0).length;
    for (let i = 0; i < 5; i++) dm.moveWindowToDesktop(wins[i], deskB);
    for (let i = 5; i < 10; i++) dm.moveWindowToDesktop(wins[i], deskC);
    wm.createTabChain(wm.windows.get(wins[10]), wm.windows.get(wins[14]));
    wm.createTabChain(wm.windows.get(wins[11]), wm.windows.get(wins[15]));
    wm.minimize(wins[12]); wm.minimize(wins[13]);
    wm.syncHiddenViews?.();
    await sleep(1500);
    // receipt stamps FIRST in the dispatch (before any view's handler runs)
    const S = window.__storm = { sends: [], acks: [], attached: [], conn: [], lh: [], reset: [], catchUp: [] };
    const sidToWin = {}; ids.forEach((s, i) => { sidToWin[s] = i; });
    app.ws.globalHandlers.unshift((m) => {
      if (m.type === 'attach-ack' && m.sessionId in sidToWin) S.acks.push({ i: sidToWin[m.sessionId], t: performance.now(), re: m.progress !== undefined || m.queued !== undefined });
      else if (m.type === 'attached' && m.sessionId in sidToWin) S.attached.push({ i: sidToWin[m.sessionId], t: performance.now() });
    });
    const send0 = app.ws.send.bind(app.ws);
    app.ws.send = (m) => { if (m && m.type === 'attach' && m.sessionId in sidToWin) S.sends.push({ i: sidToWin[m.sessionId], t: performance.now() }); return send0(m); };
    app.ws._stateListeners.unshift((c) => S.conn.push({ c, t: performance.now(), wall: Date.now() })); // FIRST: before any view's handler sends
    // the three ways a re-attach can touch a view's DOM: loadHistory (rebuild or identical-skip), the
    // epoch-changed _fullViewReset, the same-epoch _reattachCatchUp (an HTTP fetch of what was missed)
    const wrap = (v, i, name, bucket) => { const orig = v[name]; if (typeof orig !== 'function') return; v[name] = function (...a) { S[bucket].push({ i, t: performance.now() }); return orig.apply(this, a); }; };
    wins.forEach((w, i) => { const v = view(i); if (!v) return; wrap(v, i, 'loadHistory', 'lh'); wrap(v, i, '_fullViewReset', 'reset'); wrap(v, i, '_reattachCatchUp', 'catchUp'); });
    window.__stormWins = wins;
    const diag = wins.map((w, i) => { const v = view(i); return v ? { n: v._messages?.length, total: v._total, ro: !!v._readOnly, disc: !!v._disconnected } : null; });
    return { loaded, diag, waitedMs: Date.now() - t0, suspended: wins.map((w, i) => !!view(i)?._suspended), reasons: wins.map((w, i) => [...(view(i)?._hiddenReasons || [])].join('+')) };
  })()`);
  check(`${variant}: all ${N} live windows loaded their history (${setup.loaded}/${N}, ${Math.round(setup.waitedMs / 1000)} s)`, setup.loaded === N, JSON.stringify(setup.diag) + '\n' + journal.slice(-800));
  const hiddenIdx = setup.suspended.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  check(`${variant}: ${N_HIDDEN} windows are SUSPENDED (desktop / tab / minimized) and ${N_VISIBLE} displayed (${setup.reasons.map((r, i) => i + ':' + (r || 'shown')).join(' ')})`,
    hiddenIdx.length === N_HIDDEN && hiddenIdx.every((i) => i < 14), setup.reasons);

  // quiet: the heartbeat round that covers the storm must not also cover the setup's rebuilds
  await sleep(31000);

  const storm = async ({ unhide = null } = {}) => ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const S = window.__storm, wins = window.__stormWins, app = window.app;
    for (const k of ['sends', 'acks', 'attached', 'conn', 'lh', 'reset', 'catchUp']) S[k].length = 0;
    const skipsBefore = wins.map((w) => (app.sessions.get(w)?._traceRing || []).filter((e) => e.tag === 'loadHistory:identical-skip').length);
    const tDrop = performance.now(), dropWall = Date.now();
    app.ws.ws.close();
    let t = Date.now(); while (!S.conn.some((c) => c.c) && Date.now() - t < 20000) await sleep(20);
    const conn = S.conn.find((c) => c.c);
    if (!conn) return { error: 'never reconnected' };
    let tUnhide = null;
    if (${unhide == null ? 'false' : 'true'}) {
      while (performance.now() < conn.t + 500) await sleep(5);
      tUnhide = performance.now();
      app.wm.restore(wins[${unhide == null ? 0 : unhide}]);
    }
    t = Date.now();
    while (Date.now() - t < 60000) {
      const got = new Set(S.attached.filter((a) => a.t >= conn.t).map((a) => a.i));
      if (got.size === wins.length) break;
      await sleep(50);
    }
    await sleep(1500);
    const skipsAfter = wins.map((w) => (app.sessions.get(w)?._traceRing || []).filter((e) => e.tag === 'loadHistory:identical-skip').length);
    const queued = wins.map((w) => (app.sessions.get(w)?._traceRing || []).filter((e) => e.tag === 'reconnect:attach' && e.t >= dropWall).map((e) => e.why));
    // chunk D: what each re-attach cost on the wire (src/lib/ws.js's attach-frame ring) and which rung it took
    const sidSet = new Set(${JSON.stringify(ids)});
    const af = (window.__vsAttachFrames || []).filter((f) => f.t >= dropWall && sidSet.has(f.sid));
    const heldTr = wins.map((w) => (app.sessions.get(w)?._traceRing || []).filter((e) => e.tag === 'reattach:held' && e.t >= dropWall));
    const rel = (x) => Math.round(x - conn.t);
    return {
      dropWall, endWall: Date.now(), reconnectAfterDropMs: Math.round(conn.t - tDrop), unhideAt: tUnhide == null ? null : rel(tUnhide),
      sends: S.sends.filter((s) => s.t >= conn.t).map((s) => ({ i: s.i, t: rel(s.t) })),
      acks: S.acks.filter((a) => a.t >= conn.t && !a.re).map((a) => ({ i: a.i, t: rel(a.t) })),
      attached: S.attached.filter((a) => a.t >= conn.t).map((a) => ({ i: a.i, t: rel(a.t) })),
      lh: S.lh.filter((x) => x.t >= conn.t).length, resets: S.reset.filter((x) => x.t >= conn.t).length, catchUps: S.catchUp.filter((x) => x.t >= conn.t).length,
      skips: skipsAfter.reduce((n, v, i) => n + (v - skipsBefore[i]), 0),
      queued,
      frames: { n: af.length, slab: af.filter((f) => f.slab).length, held: af.filter((f) => f.held).length, bytes: af.reduce((a, f) => a + f.len, 0), slabBytes: af.filter((f) => f.slab).reduce((a, f) => a + f.len, 0), replayOps: af.reduce((a, f) => a + (f.replay || 0), 0) },
      heldApplied: heldTr.reduce((a, t) => a + t.reduce((b, e) => b + (e.applied || 0), 0), 0), heldViews: heldTr.filter((t) => t.length).length,
    };
  })()`);

  const telemetryMetric = (name, fromWall, toWall) => {
    const dir = path.join(wt, 'data', 'telemetry');
    let recs = [];
    try { for (const f of fs.readdirSync(dir)) if (/^events-.*\.ndjson$/.test(f)) for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); if (r.name === name) recs.push(r); } catch { } } } catch { }
    return recs.filter((r) => r.ts >= fromWall && r.ts <= toWall).map((r) => r.value);
  };
  const telemetryGaps = (fromWall, toWall) => telemetryMetric('srv-loop-gap-ms', fromWall, toWall);
  const telemetryEvents = (name, fromWall, toWall) => {
    const dir = path.join(wt, 'data', 'telemetry'); const recs = [];
    try { for (const f of fs.readdirSync(dir)) if (/^events-.*\.ndjson$/.test(f)) for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); if (r.name === name && r.ts >= fromWall && r.ts <= toWall) recs.push(r); } catch { } } } catch { }
    return recs;
  };
  const bufSamples = (fromWall, toWall) => {
    // buf/frame = every frame on every socket; msgBuf/msgFrame = on the socket(s) that were sent `lagged`, the queue right after a stamped `msg` frame went out (the frames the cut governs)
    let buf = 0, frame = 0, msgBuf = 0, msgFrame = 0;
    try { for (const l of fs.readFileSync(bufLog, 'utf8').split('\n')) { const [t, b, f, mb, mf] = l.split(' ').map(Number); if (t >= fromWall && t <= toWall + 250) { if (b > buf) buf = b; if (f > frame) frame = f; if (mb > msgBuf) msgBuf = mb; if (mf > msgFrame) msgFrame = mf; } } } catch { }
    return { buf, frame, msgBuf, msgFrame };
  };
  const jsonlReads = (fromWall, toWall) => {
    const out = { main: 0, worker: 0 };
    try { for (const l of fs.readFileSync(jsonlLog, 'utf8').split('\n')) { const [t, th, n] = l.split(' ').map(Number); if (t >= fromWall && t <= toWall + 250) out[th === 0 ? 'main' : 'worker'] += n; } } catch { }
    return out;
  };
  let round = 0;
  const liveTurns = () => { round++; let b = 0; if (APPEND_KB > 0) for (const sid of SIDS) b += appendLiveTurn(proj, sid, round, APPEND_KB); return b; };

  const loopDelay = (fromWall, toWall) => {
    let max = 0;
    try { for (const l of fs.readFileSync(loopLog, 'utf8').split('\n')) { const [t, v] = l.split(' ').map(Number); if (t >= fromWall && t <= toWall + 250 && v > max) max = v; } } catch { }
    return Math.round(max);
  };
  const appended = liveTurns();
  await sleep(300); // the preload's 250 ms flush: the append's own reads (none — the harness writes) never land in the window
  const s1 = await storm();
  if (s1.error) throw new Error(`${variant}: ${s1.error}`);
  // the heartbeat ticks every 30 s: wait until the round(s) covering the storm are recorded + flushed
  await sleep(Math.max(0, s1.endWall + 33000 - Date.now()));
  const gaps = telemetryGaps(s1.dropWall - 200, s1.endWall + 33000);
  const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10;
  const result = { storm: s1, gapMax: gaps.length ? Math.max(...gaps) : 0, gaps, loopMax: loopDelay(s1.dropWall, s1.endWall),
    appended, jsonl: jsonlReads(s1.dropWall, s1.endWall),
    parseBytes: sum(telemetryMetric('srv-jsonl-parse-bytes', s1.dropWall - 200, s1.endWall + 33000)),
    parseMs: sum(telemetryMetric('srv-jsonl-parse-ms', s1.dropWall - 200, s1.endWall + 33000)) };

  if (variant === 'fix') {
    // (e) un-hide a minimized window (slot 3 ⇒ 2250 ms) 500 ms after the reconnect
    liveTurns();
    await sleep(300);
    const s2 = await storm({ unhide: 13 });
    result.unhide = s2;
  }

  // ── (i) chunk D: LIVE RECORDS IN FLIGHT across the drop, then every window vs the server ──
  // THE REFERENCE: the server normalizer's messages for each window's own [start, end), fetched
  // fresh (GET /api/session-messages — a live session answers from its normalizer) AFTER the
  // bursts ended; a window equals it when its cards (id, role, status, toolStatus, content) and
  // their DOM order match exactly.
  await ev(`(() => { window.__stormDomCheck = async () => {
    const app = window.app, wins = window.__stormWins, out = [];
    for (let i = 0; i < wins.length; i++) {
      const v = app.sessions.get(wins[i]);
      if (!v) { out.push({ i, eq: false, why: 'no view' }); continue; }
      const ids = v._getSessionIds();
      const start = v._windowStart, end = v._windowEnd;
      const q = new URLSearchParams({ backend: ids.backend || 'claude', backendSessionId: ids.backendSessionId, cwd: ids.cwd || '', offset: String(start), limit: String(end - start) });
      let d = null; try { d = await (await fetch('/api/session-messages?' + q)).json(); } catch (e) { out.push({ i, eq: false, why: String(e) }); continue; }
      const proj = (m) => JSON.stringify([m.id, m.role, m.status || null, m.toolStatus || null, m.content]);
      const want = (d.messages || []).map(proj), have = v._messages.map(proj);
      let firstDiff = -1; for (let k = 0; k < Math.max(want.length, have.length); k++) if (want[k] !== have[k]) { firstDiff = k; break; }
      const domIds = [...v._messageList.querySelectorAll(':scope > [data-msg-id]')].map((el) => el.dataset.msgId);
      const elIds = v._messages.filter((m) => v._elements.get(m.id)?.isConnected).map((m) => m.id);
      out.push({ i, eq: firstDiff < 0 && d.total === v._total, domOrder: JSON.stringify(domIds) === JSON.stringify(elIds), n: want.length, total: v._total, srvTotal: d.total, firstDiff,
        diff: firstDiff < 0 ? null : { want: (want[firstDiff] || '').slice(0, 160), have: (have[firstDiff] || '').slice(0, 160) } });
    }
    return out;
  }; return true; })()`);
  const burstAll = () => { for (const id of ids) ctl.send(JSON.stringify({ type: 'chat-input', sessionId: id, text: 'VS_BURST ' + Date.now(), msgId: 'burst-' + id + '-' + Date.now() })); };
  await sleep(1000);
  const tBurst = Date.now();
  burstAll();
  await sleep(150); // the first records are out; the rest are in flight for ~3 s across the drop
  const s3 = await storm();
  await sleep(Math.max(0, tBurst + 3200 + 2000 - Date.now())); // every burst ended (12 × 240 ms) + settle
  result.inflight = { storm: s3, dom: await ev('window.__stormDomCheck()') };

  // ── (j) chunk D, fix only: the LAGGED leg — one displayed window's socket stops draining ──
  if (variant === 'fix') {
    const LAG_WIN = 16;
    const lagSid = ids[LAG_WIN];
    const lagBefore = telemetryEvents('ws-lagged', 0, Date.now() + 1).length;
    const traceLagged = () => ev(`(window.app.sessions.get(window.__stormWins[${LAG_WIN}])?._traceRing || []).filter((e) => e.tag === 'lagged').length`);
    const tracedBefore = await traceLagged();
    await cdp('Network.enable');
    // a crawl: the renderer drains ~2 KB/s, so the server's queue for this socket can only grow
    await cdp('Network.emulateNetworkConditions', { offline: false, latency: 200, downloadThroughput: 2048, uploadThroughput: 2048 });
    const tLag = Date.now();
    ctl.send(JSON.stringify({ type: 'chat-input', sessionId: lagSid, text: 'VS_BIG_BURST ' + tLag, msgId: 'big-' + tLag }));
    // the cut is visible SERVER-side (the page cannot read its frame until it drains): poll the ledger
    let lagged = [];
    let how = 'network-throttle';
    const waitLag = async (ms) => { await until(() => { lagged = telemetryEvents('ws-lagged', tLag - 50, Date.now() + 1); return lagged.length > 0; }, ms, 250); };
    await waitLag(20000);
    if (!lagged.length) {
      // this chrome's throttle does not hold back websocket reads: stop the page's main thread
      // instead (the renderer stops consuming its socket's data pipe ⇒ TCP backpressure)
      how = 'main-thread block';
      cdp('Runtime.evaluate', { expression: 'const t = Date.now(); while (Date.now() - t < 15000) {} 1' }); // not awaited: the page is busy for 15 s
      await waitLag(20000);
    }
    const tCut = Date.now();
    // the queue up to the moment the cut was SEEN (the ledger flushes ≤ 2 s after it): no re-attach
    // can have happened yet (the page has not drained its `lagged`), so every frame queued here is
    // the burst itself — this is the bound the cut enforces
    const bufAtCut = bufSamples(tLag - 50, tCut);
    const attachAt = await ev(`(window.__vsAttachFrames || []).filter((f) => f.t >= ${tLag} && f.sid === ${JSON.stringify(lagSid)}).map((f) => f.t)`);
    await sleep(3000); // more of the burst is refused, never queued
    const bufMax = bufSamples(tLag - 50, Date.now()); // printed: includes the recovery attach frame if it went out already
    await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const tOpen = Date.now();
    let dom = null;
    await until(async () => {
      if (await ev('document.readyState') !== 'complete') return false;
      dom = (await ev('window.__stormDomCheck()'))[LAG_WIN];
      return dom && dom.eq && dom.domOrder;
    }, 30000, 500);
    const recoveredMs = dom && dom.eq ? Date.now() - tOpen : null;
    await sleep(1500);
    const traced = (await traceLagged()) - tracedBefore;
    result.lagged = { how, bufAtCut, reattachBeforeUnthrottle: (attachAt || []).map((t) => t - tLag), events: lagged.length, eventsTotal: telemetryEvents('ws-lagged', 0, Date.now() + 1).length - lagBefore, detail: lagged.map((e) => e.detail), cutAfterMs: tCut - tLag, bufMax, recoveredMs, dom, traced,
      frames: await ev(`(window.__vsAttachFrames || []).filter((f) => f.t >= ${tLag} && f.sid === ${JSON.stringify(lagSid)}).map((f) => ({ len: f.len, slab: f.slab, held: f.held, replay: f.replay }))`) };
  }
  result.pageErrors = pageErrors.slice(0, 5);
  await killAll();
  try { ctl.close(); } catch { }
  try { cdpWs.close(); } catch { }
  try { chrome.kill('SIGKILL'); } catch { } procs.delete(chrome);
  try { srv.kill('SIGKILL'); } catch { } procs.delete(srv);
  try { execSync(`pkill -9 -f ${JSON.stringify(wt)}`, { stdio: 'ignore' }); } catch { }
  return result;
}

const peakPerSecond = (ts) => { const s = [...ts].sort((a, b) => a - b); let best = 0; for (let i = 0, j = 0; i < s.length; i++) { while (s[i] - s[j] >= 1000) j++; best = Math.max(best, i - j + 1); } return best; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : NaN; };
const firstBy = (rows) => { const m = new Map(); for (const r of rows) if (!m.has(r.i)) m.set(r.i, r.t); return m; };

let fix, control;
try {
  fix = await runVariant('fix');
  if (process.env.VS_STORM_DUMP) fs.writeFileSync(process.env.VS_STORM_DUMP, JSON.stringify(fix)); // debugging aid
  if (process.env.VS_STORM_ONLY === 'fix') { console.log(JSON.stringify(fix).slice(0, 4000)); process.exit(failed ? 1 : 0); } // debugging aid, never the gate
  control = await runVariant('control');
} catch (e) {
  console.error('✗ the harness threw:', e && (e.stack || e.message));
  process.exit(1);
}

const summarize = (name, r) => {
  const acks = firstBy(r.storm.acks), att = firstBy(r.storm.attached);
  const vis = [14, 15, 16, 17, 18], hid = [...Array(14).keys()];
  const out = {
    name, reconnectAfterDropMs: r.storm.reconnectAfterDropMs,
    acked: acks.size, attached: att.size,
    peak: peakPerSecond([...acks.values()]),
    visP95: p95(vis.map((i) => att.get(i)).filter(Number.isFinite)),
    hidSpread: Math.max(...hid.map((i) => acks.get(i) ?? -1)),
    hidFirst: Math.min(...hid.map((i) => acks.get(i) ?? 1e9)),
    hidLastAttached: Math.max(...hid.map((i) => att.get(i) ?? -1)),
    rebuilds: r.storm.lh - r.storm.skips + r.storm.resets, lh: r.storm.lh, skips: r.storm.skips, resets: r.storm.resets, catchUps: r.storm.catchUps,
    gapMax: r.gapMax, gaps: r.gaps, loopMax: r.loopMax,
    appended: r.appended, jsonlMain: r.jsonl.main, jsonlWorker: r.jsonl.worker, parseBytes: r.parseBytes, parseMs: r.parseMs,
    sendsPerWin: [...Array(19).keys()].map((i) => r.storm.sends.filter((s) => s.i === i).length),
    frames: r.storm.frames, heldApplied: r.storm.heldApplied, heldViews: r.storm.heldViews,
    inflight: r.inflight && { frames: r.inflight.storm.frames, lh: r.inflight.storm.lh, catchUps: r.inflight.storm.catchUps, resets: r.inflight.storm.resets, heldApplied: r.inflight.storm.heldApplied,
      eq: r.inflight.dom.filter((d) => d.eq && d.domOrder).length, bad: r.inflight.dom.filter((d) => !(d.eq && d.domOrder)) },
  };
  const fr = out.frames, kb = (b) => (b / 1024).toFixed(1);
  console.log(`  ${name.padEnd(7)} [chunk D] attached frames ${fr.n}: with a slab ${fr.slab} (${kb(fr.slabBytes)} KB), held ${fr.held} (${fr.replayOps} replayed ops, ${out.heldApplied} applied in ${out.heldViews} views) · bytes on the wire for the whole reconnect ${kb(fr.bytes)} KB (${kb(fr.bytes / Math.max(1, fr.n))} KB per window)`);
  if (out.inflight) console.log(`  ${name.padEnd(7)} [chunk D, records in flight] attached with a slab ${out.inflight.frames.slab}, held ${out.inflight.frames.held} (${out.inflight.frames.replayOps} replayed ops, ${out.inflight.heldApplied} applied) · ${kb(out.inflight.frames.bytes)} KB on the wire · loadHistory ${out.inflight.lh}, catch-ups ${out.inflight.catchUps}, full resets ${out.inflight.resets} · windows equal to the server afterwards ${out.inflight.eq}/19${out.inflight.bad.length ? ' — first mismatch: ' + JSON.stringify(out.inflight.bad[0]).slice(0, 400) : ''}`);
  console.log(`  ${name.padEnd(7)} reconnect +${out.reconnectAfterDropMs} ms after the drop · acks ${out.acked}/19 · attached ${out.attached}/19 · peak ${out.peak}/s · visible attached p95 ${out.visP95} ms · hidden acks ${out.hidFirst}…${out.hidSpread} ms, last attached ${out.hidLastAttached} ms · loadHistory ${out.lh} (identical-skip ${out.skips}) + full resets ${out.resets} ⇒ rebuilds ${out.rebuilds}, same-epoch catch-ups ${out.catchUps} · srv-loop-gap-ms max ${out.gapMax || '<50'} [${out.gaps.join(',')}] · loop delay max (5 ms histogram) ${out.loopMax} ms · live turns appended ${(out.appended / 1024).toFixed(0)} KB ⇒ .jsonl bytes read: main ${(out.jsonlMain / 1048576).toFixed(2)} MB, workers ${(out.jsonlWorker / 1048576).toFixed(2)} MB · srv-jsonl-parse-bytes ${(out.parseBytes / 1048576).toFixed(2)} MB · srv-jsonl-parse-ms Σ ${out.parseMs} ms`);
  return out;
};
console.log('— measurements (ms after the reconnect; server arrival = attach-ack receipt)');
const F = summarize('fix', fix), C = summarize('control', control);

console.log('— asserts');
check(`every window re-attached in both runs (fix ${F.attached}/19, control ${C.attached}/19)`, F.attached === 19 && C.attached === 19);
check(`each window sent exactly ONE attach in the fix storm (${F.sendsPerWin.join('')})`, F.sendsPerWin.every((n) => n === 1));
check(`CONTROL shows the storm: ≥ 15 attaches in one second at the server (${C.peak}/s) — else the harness proves nothing`, C.peak >= 15);
check(`(a) fix: attaches-per-second peak at the server ≤ 6 (${F.peak}/s; control ${C.peak}/s)`, F.peak <= 6);
check(`(b) fix: the 5 visible windows' attached p95 ≤ the control's (+50 ms noise band): ${F.visP95} ≤ ${C.visP95}`, F.visP95 <= C.visP95 + 50);
check(`(c) fix: the 14 hidden acks spread ≥ 14 × 250 ms past the reconnect (first ${F.hidFirst}, last ${F.hidSpread})`, F.hidSpread >= 14 * 250 && F.hidFirst >= 1400);
check(`(c) fix: every hidden window attached within the control's last + 6 s (${F.hidLastAttached} ≤ ${C.hidLastAttached + 6000})`, F.hidLastAttached <= C.hidLastAttached + 6000);
const hiddenQueued = fix.storm.queued.slice(0, 14).filter((w) => w.includes('slot')).length;
check(`(c) fix: the 14 hidden windows attached from their queue SLOT (${hiddenQueued}/14) and no displayed one queued`, hiddenQueued === 14 && fix.storm.queued.slice(14).every((w) => w.length === 0), fix.storm.queued);
const band = Math.max(C.gapMax * 0.25, 50);
check(`(d) fix: srv-loop-gap-ms max over the storm ≤ the control's (+${Math.round(band)} ms noise band): ${F.gapMax || '<50'} vs ${C.gapMax || '<50'}`, F.gapMax <= Math.max(C.gapMax + band, 50));
const lband = Math.max(C.loopMax * 0.25, 25);
check(`(d) fix: the server's loop-delay max over the storm (harness histogram) ≤ the control's (+${Math.round(lband)} ms noise band): ${F.loopMax} vs ${C.loopMax}`, F.loopMax <= C.loopMax + lband);
{
  const u = fix.unhide;
  const ack13 = u ? firstBy(u.acks).get(13) : undefined;
  const sends13 = u ? u.sends.filter((s) => s.i === 13) : [];
  check(`(e) un-hidden at +${u?.unhideAt} ms (before its 2250 ms slot): its attach reached the server ${ack13 != null && u.unhideAt != null ? ack13 - u.unhideAt : '?'} ms after the un-hide (≤ 300 ms = one round trip + the loop)`,
    u && ack13 != null && ack13 - u.unhideAt <= 300 && ack13 < 1500, u && { acks: u.acks.filter((a) => a.i === 13), unhideAt: u.unhideAt });
  check(`(e) its slot was cancelled: exactly one attach for it (${sends13.length}), sent by the un-hide (${JSON.stringify(u?.queued?.[13])})`, sends13.length === 1 && (u?.queued?.[13] || []).join() === 'unhide');
}
check(`(f) fix: DOM rebuilds (loadHistory minus identical-skips, plus epoch full resets) ≤ the control's (fix ${F.rebuilds}, control ${C.rebuilds}; identical-skips ${F.skips} vs ${C.skips})`, F.rebuilds <= C.rebuilds && F.skips >= C.skips);
// (chunk D moved the same-epoch rung: the fix resumes by seq — held, no catch-up — while the control,
// resume neutered, is the pre-chunk-D client: every window still takes the catch-up)
check(`(f) control: every window took the same-epoch catch-up (${C.catchUps}); fix: none did (${F.catchUps}) — every window resumed held instead (${F.frames.held}/19)`, C.catchUps === 19 && F.catchUps === 0 && F.frames.held === 19);
// ── chunk D ──
check(`(h) fix: 0 attached frames carry a slab over the storm (control ${C.frames.slab}/19) — ${(F.frames.bytes / 1024).toFixed(1)} KB on the wire vs the control's ${(C.frames.bytes / 1024).toFixed(1)} KB`, F.frames.slab === 0 && C.frames.slab === 19 && F.frames.bytes < C.frames.bytes);
check(`(h) fix: a same-epoch reconnect inside the ring runs NO loadHistory, not even the identical compare (${F.lh}), and no full reset (${F.resets})`, F.lh === 0 && F.resets === 0);
if (F.inflight && C.inflight) {
  check(`(i) fix, records in flight across the drop: all 19 windows equal the server's slab afterwards — ids, order, roles, status, content (${F.inflight.eq}/19; control ${C.inflight.eq}/19)`, F.inflight.eq === 19, F.inflight.bad.slice(0, 2));
  check(`(i) fix: every window resumed held (${F.inflight.frames.held}/19), none took a slab (${F.inflight.frames.slab}), a catch-up (${F.inflight.catchUps}) or a loadHistory (${F.inflight.lh}); the replays carried ${F.inflight.frames.replayOps} ops`, F.inflight.frames.held === 19 && F.inflight.frames.slab === 0 && F.inflight.catchUps === 0 && F.inflight.lh === 0 && F.inflight.frames.replayOps > 0);
}
{
  const L = fix.lagged;
  if (!L) check('(j) the lagged leg ran', false);
  else {
    console.log(`  lagged leg: stalled by ${L.how}; ws-lagged ${L.events} (${L.detail.join(' | ')}), cut seen ${L.cutAfterMs} ms after the burst began · server send queue right after a msg frame, max ${L.bufMax.msgBuf} B (limit ${LAG_LIMIT} + largest msg frame ${L.bufMax.msgFrame} B); any frame ${L.bufMax.buf} B (largest ${L.bufMax.frame} B — the recovery attach's slab) · the page's re-attach landed ${JSON.stringify(L.reattachBeforeUnthrottle)} ms after the burst began (before the un-throttle when listed) · the page traced ${L.traced} lagged · recovered to the server's state ${L.recoveredMs} ms after un-throttling · its attach frames after the burst ${JSON.stringify(L.frames)}`);
    check(`(j) exactly ONE ws-lagged at the server for the stalled socket (${L.events}; total over the leg ${L.eventsTotal})`, L.events === 1 && L.eventsTotal === 1, L.detail);
    check(`(j) the send queue the cut governs stayed bounded: after any msg frame ≤ limit ${LAG_LIMIT} + one msg frame (${L.bufMax.msgBuf} ≤ ${LAG_LIMIT + L.bufMax.msgFrame}) — never the 25.6 MB burst`, L.bufMax.msgBuf > LAG_LIMIT && L.bufMax.msgBuf <= LAG_LIMIT + L.bufMax.msgFrame && L.bufMax.msgFrame < 1048576);
    check(`(j) the window received exactly one lagged and re-attached (${L.traced}); it equals the server within 10 s of the link coming back (${L.recoveredMs} ms)`, L.traced === 1 && L.recoveredMs != null && L.recoveredMs <= 10000 && L.dom?.eq && L.dom?.domOrder, L.dom);
  }
}
if (APPEND_KB > 0) {
  // TWO readers see each appended byte once per re-attach — the parse cache (chatStatus / pending
  // permissions) and the task-event scan (taskState, incremental by byte cursor since 2.180.1) —
  // plus, per session, the parse cache's two ≤ 4 KiB append-only probes and the 4-byte zstd magic
  // read (measured: exactly 2 × appended + 19 × 8196 bytes) — bounded here at 16 KiB per session
  const bound = 2 * F.appended + N * 16384;
  check(`(g) fix: over the storm the server's MAIN thread read ≤ 2 × the appended transcript bytes + ≤ 16 KiB per session (${(F.jsonlMain / 1048576).toFixed(2)} MB read ≤ ${(bound / 1048576).toFixed(2)} MB; ${(F.appended / 1048576).toFixed(2)} MB appended; the whole transcripts are ${(N * FIXTURE_MB)} MB) — a re-attach re-parses nothing it already holds`, F.jsonlMain <= bound, { main: F.jsonlMain, worker: F.jsonlWorker, appended: F.appended });
  check(`(g) fix: the product's own srv-jsonl-parse-bytes over the storm is stamped and ≤ 2 × the appended bytes (${F.parseBytes} vs ${F.appended})`, F.parseBytes > 0 && F.parseBytes <= 2 * F.appended);
}
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, lit.offenders.slice(0, 3));
}
check(`no page exception in either run (${[...fix.pageErrors, ...control.pageErrors].join(' | ').slice(0, 300)})`, !fix.pageErrors.length && !control.pageErrors.length);

console.log(`\n${failed ? 'FAIL' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);
