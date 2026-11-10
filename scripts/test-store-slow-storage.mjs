#!/usr/bin/env node
// test-store-slow-storage — NO STORE WRITE HOLDS THE MAIN THREAD, on SLOW STORAGE (lane hub-loop-stalls, commit 2 item 0).
// HEAVY: real scratch hubs of THIS WORKING TREE (its files copied, never `git worktree add HEAD` — the change under test may be
// uncommitted), each with its data dir on a REAL FUSE mount (bindfs of a scratch dir — mounted and unmounted here) and run
// under strace's seccomp-bpf DELAY INJECTION on its OWN renames / fsyncs (rename, renameat, renameat2, fsync, fdatasync —
// never write/openat: those would also slow its sockets, logs and module loads). The holds are injected delays, not CPU, so
// another suite's load cannot make them up. Production's reading this stands in for (the owner's hub, six hours): 64 holds
// ≥ 1 s, 58 of them the channels index's rename (21.7 MB rewritten whole, 1.3 s median, 2.6 s max), data/ on fuse.bindfs.
// The busy stretch is driven through the product's own doors: a channel conversation marked read every 200 ms over a
// production-sized index (2 032 conversations, ~22 MB), three chat conversations ending a turn every 10 s (session-meta),
// GET /api/usage-stats every 10 s (the usage walk ⇒ the cursors). The preload scripts/fixtures/store-slow-preload.cjs times
// every main-thread sync fs call BY SITE and keeps the loop's gaps.
//   (a) 500 ms per call: in a ≥ 30 s busy stretch the four moved stores (channels/index.json, session-meta, the usage
//       cursors, usage-estimator's rates.json) cause NO main-thread hold ≥ 250 ms; every other hold ≥ 250 ms is LISTED by
//       its site (the census's debt — said, not failed);
//   (b) THE PACE on the busy index at local speed (0 ms injected): index writes a minute and MB a minute, after vs before;
//   (c) SIGTERM right after changes (500 ms per call): the last index change is on disk, and the exit flush leaves
//       nothing — round 6 (E1): no bound of ours; its own line names what it wrote;
//   (d) SIGKILL while an index write is in flight (1.1 s per call): the index still parses — the old or the new version;
//   (e) the canary / witness words for a data dir on bindfs (1.1 s per call — it speaks of a call ≥ 1 s): never
//       «not under a mount»;
//   (f) the boot at 500 ms per call: boot-to-ready split at the first loop turn (performance.nodeTiming.loopStart); the
//       migrations' own step (/api/boot-trace `steps` 'migrations') and its share of boot-to-Ready; after the first turn
//       NO hold ≥ 250 ms is a moved store's write (the index's ordering writes are awaited, never a sync flush);
//   (g) THE EXIT, round 6 (E1): SIGTERM right after a mark and a usage walk at 500, 1 200 and 2 600 ms per call, under a
//       stated 6 s grace (rounds 3–5 cut it at 2 s) and the default one: nothing left, the last mark on disk, no bound of
//       ours named. LAW D (round 2) by behaviour: the index's last change is written BY THE EXIT FLUSH (its line names
//       channels-index.write) — the shutdown's beginExit deferred the store's own flush; the RED CONTROL is a hub of this
//       tree with that one call removed from server.js (the round-1 slip: it sat inside a comment) — the store's own flush
//       writes it on the loop;
//   (i) THE CRASH PATH at 500 ms per call: an act owed behind a status write in flight — rank 0 written FIRST, nothing left,
//       the process ends by itself (round 6: no bound of ours);
//   (k) THE KEEPER FROM BOOT (round 6, E3 a): the real server.js booted, its install tree and data dir hanging, a crash ⇒
//       the line «after the crash» and the end at the crash + the grace;
//   (h) THE BUSY MINUTE at 1 200 ms per call (round 2, law C): 60 s of marks every 200 ms — every act's answer time
//       (p50 / max / unanswered) and, from the writer's own numbers (the preload), the writes and MB a minute of EVERY
//       file it wrote.
// THE RED CONTROL (default on): the same busy legs on the tree BEFORE the store writer — `git archive` of the parent of the
// commit that added src/store-writer.js (HEAD while it is uncommitted; a clone without that object SKIPS the control, said): (a) and (b) are red there.
//   --tree <dir>   run the legs against ANOTHER tree only (no expectations — a report)   --no-control   skip the control
//   STORE_SLOW_LEGS=k,i   a maintainer's subset (b a d g D i k j h control) — the gate runs every leg
// Out: STORE_SLOW_OUT (default a scratch dir, kept on failure): table.json, hub-*.log, strace-*.log.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const ti = argv.indexOf('--tree'), OTHER = ti >= 0 ? path.resolve(argv[ti + 1]) : null;
const CONTROL = !OTHER && !argv.includes('--no-control');
// a maintainer's subset (STORE_SLOW_LEGS=k,i — b a d g D i k j h control); the gate runs every leg
const LEGS = String(process.env.STORE_SLOW_LEGS || '').split(',').filter(Boolean), leg = (x) => !LEGS.length || LEGS.includes(x);
const DELAY = 500, DELAY_KILL = 1100, BUSY_MS = +(process.env.STORE_SLOW_BUSY_MS || 30000), CONVS = 2032, RECENT = 40;
const CALLS = 'rename,renameat,renameat2,fsync,fdatasync';
const MOVED = /(^|\/)channels\/index\.json$|(^|\/)session-meta\/|_cursors\.json$|(^|\/)rates\.json$/;
const OUT = process.env.STORE_SLOW_OUT || scratch('store-slow-out');
fs.mkdirSync(OUT, { recursive: true });
// NOT a /tmp/vs-* fixture root: the conversations' folders must read as real ones (discovery, the usage walk)
const ROOT = `/tmp/storeslow-${process.pid}`, BACK = path.join(ROOT, 'back'), MNT = path.join(ROOT, 'mnt'), HOME = path.join(ROOT, 'home'), WORK = path.join(ROOT, 'work'), BIN = path.join(ROOT, 'bin');
const PRELOAD = path.join(REPO, 'scripts/fixtures/store-slow-preload.cjs');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const info = (s) => console.log('  · ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let strace = null, hubPid = 0, mounted = false;
function endHub() { try { if (hubPid) process.kill(hubPid, 'SIGKILL'); } catch { } try { if (strace) strace.kill('SIGKILL'); } catch { } hubPid = 0; strace = null; for (const r of [WORK, HOME, BIN, path.join(MNT, 'trees')]) { try { endRootedProcesses(r); } catch { } } }
function cleanup() {
  endHub();
  if (mounted) { try { execFileSync('fusermount', ['-u', MNT], { stdio: 'ignore' }); } catch { try { execFileSync('fusermount', ['-uz', MNT], { stdio: 'ignore' }); } catch { } } mounted = false; }
  try { endRootedProcesses(ROOT); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
// THE THERMAL GUARD (optional): a box that logs its CPU temperature names that log's directory in
// VIBESPACE_THERMAL_LOG_DIR (files temps-*.csv, «<time>,<°C>» a line) — two readings ≥ 85 °C in a row stop the suite
// between hubs. Unset: no guard, said once.
const THERMAL_DIR = process.env.VIBESPACE_THERMAL_LOG_DIR || '';
if (!THERMAL_DIR) console.log('  · no thermal guard (VIBESPACE_THERMAL_LOG_DIR is not set)');
function guard() {
  if (!THERMAL_DIR) return null;
  try { const dir = THERMAL_DIR; const f = fs.readdirSync(dir).filter((n) => /^temps-.*\.csv$/.test(n)).map((n) => path.join(dir, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (f) { const l = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-2).map((x) => +x.split(',')[1]); if (l.length === 2 && l.every((t) => t >= 85)) return `k10temp ${l.join(', ')} °C`; } } catch { }
  return null;
}

let have = { strace: false, bindfs: false, fuse: false };
try { execFileSync('strace', ['-V'], { stdio: 'ignore' }); have.strace = true; } catch { }
try { execFileSync('bindfs', ['--version'], { stdio: 'ignore' }); have.bindfs = true; } catch { }
have.fuse = fs.existsSync('/dev/fuse');
if (!have.strace || !have.bindfs || !have.fuse) { console.log(`  ⊘ SKIP — the slow stand-in needs strace, bindfs and /dev/fuse (${JSON.stringify(have)})`); console.log('SKIPPED (evidence above)'); process.exit(0); }

// ── a production-shaped channels index: the row fields the store writes (its key `agents/<id>`), ~22 MB ──
function seedChannels(dir) {
  let seed = 12345; const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (n) => Math.floor(rnd() * n), pick = (a) => a[ri(a.length)];
  const hex = (n) => { let s = ''; while (s.length < n) s += ri(0x10000000).toString(16).padStart(7, '0'); return s.slice(0, n); };
  const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
  const W = 'the quick brown fox jumps over a lazy dog while agents build lanes and gates turn green after review of every census row'.split(' ');
  const text = (n) => { let s = ''; while (s.length < n) s += pick(W) + ' '; return s.slice(0, n); };
  const NOW = Date.now(), DAY = 864e5, convs = {}, stamps = {}, ids = [];
  for (let i = 0; i < CONVS; i++) { const id = uuid(), k = `agents/${id}`; ids.push(id); convs[k] = { key: k, id, adapterId: 'agents', vendorId: id, title: text(4 + ri(40)), kind: pick(['dm', 'group']), participants: text(4), lastAt: null, unread: ri(9), anchor: null, filterId: null, policy: null, pendingTodoId: null, reachEntries: [], stats: { hits7d: ri(9), msgs7d: ri(90) }, convCaps: { read: 'ok', sendAs: ['user'], why: null, at: NOW }, lane: { via: 'poll', lastPushAt: null, firstSeenByPoll: NOW - DAY, firstSeenTotal: 1 }, readAt: NOW - ri(9e8), createdAt: NOW - ri(9e9), listedAt: NOW, walkedAt: NOW, access: [], watchers: [], recent: Array.from({ length: RECENT }, () => ({ at: NOW - ri(9e8), from: text(12), text: text(180) })) }; stamps[k] = [NOW, NOW, NOW]; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: 1, conversations: convs, updatedAt: NOW, accountAssignments: {} }, null, 1));
  fs.writeFileSync(path.join(dir, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'agents', kind: 'agents', label: 'agents', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
  fs.writeFileSync(path.join(dir, 'poll-stamps.json'), JSON.stringify({ v: 1, fields: ['lastPollAt', 'lastScanAt', 'walkStartedAt'], stamps }));
  return { ids, bytes: fs.statSync(path.join(dir, 'index.json')).size };
}

// ── the stand-in conversation: a chat that ends a turn every 10 s (stdout + its transcript, usage-bearing) ──
function setupStubs() {
  for (const d of [HOME, WORK, BIN, BACK, MNT, path.join(HOME, '.claude/projects'), path.join(HOME, '.claude/sessions')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'turns.cjs'), `const fs=require('fs');const [SID,T]=process.argv.slice(2);let n=0;
setInterval(()=>{n++;const a={type:'assistant',message:{id:'msg_'+SID.slice(-6)+'_'+n,type:'message',role:'assistant',model:'claude-fable-5',content:[{type:'text',text:'turn '+n+' done'}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0}},requestId:'req_'+SID.slice(-8)+'_'+n,parent_tool_use_id:null,session_id:SID,uuid:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),timestamp:new Date().toISOString(),cwd:process.cwd()};
const r={type:'result',subtype:'success',is_error:false,duration_ms:1000,num_turns:1,result:'turn '+n+' done',session_id:SID,total_cost_usd:0,usage:a.message.usage};
process.stdout.write(JSON.stringify(a)+'\\n'+JSON.stringify(r)+'\\n');try{fs.appendFileSync(T,JSON.stringify(a)+'\\n');}catch{}},10000);process.stdin.resume();`);
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh
SID="5e551000-0000-4000-8000-$(printf '%012d' $$)"
CWD="$(pwd)"; D="$HOME/.claude/projects/$(printf '%s' "$CWD" | sed 's#[/._]#-#g')"
case " $* " in
  *" --version "*) echo "2.1.312 (Claude Code)"; exit 0;;
  *" --output-format "*) mkdir -p "$D"; : > "$D/$SID.jsonl"; sleep 1; printf '{"type":"system","subtype":"init","session_id":"%s","cwd":"%s","model":"claude-fable-5","apiKeySource":"none","tools":[],"mcp_servers":[]}\\n' "$SID" "$CWD"
    PS=$(sed 's/^.*) //' /proc/$$/stat | cut -d' ' -f20); mkdir -p "$HOME/.claude/sessions"
    printf '{"pid":%s,"sessionId":"%s","cwd":"%s","startedAt":%s,"kind":"interactive","procStart":"%s"}' "$$" "$SID" "$CWD" "$(date +%s%3N)" "$PS" > "$HOME/.claude/sessions/$$.json"
    exec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(BIN, 'turns.cjs'))} "$SID" "$D/$SID.jsonl";;
  *) exit 0;;
esac
`, { mode: 0o755 });
}
const TREE_FILES = ['src', 'public', 'server.js', 'package.json', 'release', 'tools', 'editor-helper.sh', 'data/bin'];
/** the tree BEFORE the store writer: `git archive` of the parent of the commit that added it (HEAD while uncommitted) */
function controlTree() {
  try {
    let add = ''; try { add = execFileSync('git', ['-C', REPO, 'log', '-1', '--diff-filter=A', '--format=%H', '--', 'src/store-writer.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { add = ''; }
    const ref = add ? `${add}~1` : 'HEAD';
    const sha = execFileSync('git', ['-C', REPO, 'rev-parse', '--short=9', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dir = path.join(ROOT, 'control-src'); fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['-C', REPO, 'archive', ref, ...TREE_FILES.filter((f) => f !== 'public')], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
    execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 30 });
    fs.cpSync(path.join(REPO, 'public'), path.join(dir, 'public'), { recursive: true });   // the built assets (never in git)
    return { dir, sha };
  } catch (e) { return { error: (e && e.message ? e.message.split('\n')[0] : String(e)).slice(0, 200) }; }
}

let PORT = 0, VNC = {};
const logs = {};
/** ONE scratch hub of `tree` on the bindfs mount, under strace with `delayMs` per call (0 = traced, not delayed). */
async function boot(tag, tree, delayMs, extraEnv = {}, { reuseOf = null } = {}) {
  // round 3 (law 3): `reuseOf` — boot AGAIN over another hub's tree and data dir (a restart: its conversations' dtach
  // sessions still alive), never a fresh copy
  const dirTag = reuseOf || tag, wtB = path.join(BACK, 'trees', dirTag, 'wt'), wt = path.join(MNT, 'trees', dirTag, 'wt');
  let seed = null;
  if (!reuseOf) {
    fs.rmSync(path.join(BACK, 'trees', tag), { recursive: true, force: true }); fs.mkdirSync(wtB, { recursive: true });
    for (const f of TREE_FILES) fs.cpSync(path.join(tree, f), path.join(wtB, f), { recursive: true });
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wtB, 'node_modules'));
    seed = seedChannels(path.join(wtB, 'data/channels'));
    for (const f of fs.readdirSync(path.join(HOME, '.claude/sessions'))) fs.rmSync(path.join(HOME, '.claude/sessions', f), { force: true });
  }
  const sl = path.join(OUT, `strace-${tag}.log`), logf = path.join(OUT, `hub-${tag}.log`); logs[tag] = logf;
  const args = ['-f', '--seccomp-bpf', '-qq', '-ttt', '-o', sl, '-e', `trace=${CALLS}`, ...(delayMs > 0 ? ['-e', `inject=${CALLS}:delay_enter=${delayMs * 1000}`] : []), process.execPath, '-r', PRELOAD, 'server.js'];
  const fd = fs.openSync(logf, 'w'); const t0 = Date.now();
  strace = spawn('strace', args, { cwd: wt, env: { ...process.env, ...VNC, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1', STORE_SLOW_OUT: OUT, STORE_SLOW_TAG: tag, STORE_SLOW_TREE: wt, ...extraEnv }, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  let readyAt = 0; while (Date.now() - t0 < 120000) { if (fs.readFileSync(logf, 'utf8').includes('Ready.')) { readyAt = Date.now(); break; } await sleep(100); }
  try { const kids = fs.readFileSync(`/proc/${strace.pid}/task/${strace.pid}/children`, 'utf8').trim().split(/\s+/).map(Number).filter(Boolean); hubPid = kids.find((p) => { try { return fs.readlinkSync(`/proc/${p}/exe`) === process.execPath; } catch { return false; } }) || 0; } catch { hubPid = 0; }
  return { tag, wt, wtB, seed, logf, sl, readyAt, bootMs: readyAt ? readyAt - t0 : null, spawnedAt: t0, hub: hubPid };
}
const slowOf = (h) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `slow-${h.tag}-${h.hub}.json`), 'utf8')); } catch { return null; } };
/** round 3 (law 3): end ONLY the hub (its conversations' dtach sessions live on, as at a real restart) — the strace that
 *  followed it is told to detach (SIGTERM: it lets its tracees go) */
async function stopHubOnly(h, waitMs = 60000) {
  const t0 = Date.now(); let comm = ''; try { comm = fs.readFileSync(`/proc/${h.hub}/comm`, 'utf8').trim(); } catch { }
  if (h.hub && /node|MainThread/.test(comm)) { try { process.kill(h.hub, 'SIGTERM'); } catch { } }
  while (Date.now() - t0 < waitMs) { try { process.kill(h.hub, 0); } catch { break; } await sleep(50); }
  try { if (strace) strace.kill('SIGTERM'); } catch { } await sleep(500); strace = null; hubPid = 0;
  return Date.now() - t0;
}
async function stopHub(h, sig = 'SIGTERM', waitMs = 30000) {
  const t0 = Date.now(); let comm = ''; try { comm = fs.readFileSync(`/proc/${h.hub}/comm`, 'utf8').trim(); } catch { }
  if (h.hub && /node|MainThread/.test(comm)) { try { process.kill(h.hub, sig); } catch { } }
  while (Date.now() - t0 < waitMs) { try { process.kill(h.hub, 0); } catch { break; } await sleep(50); }
  const ms = Date.now() - t0; endHub(); await sleep(300); return ms;
}
const req = (method, p, body) => new Promise((r) => { const b = body ? JSON.stringify(body) : null; const q = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: b ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) } : {} }, (res) => { res.resume(); res.on('end', () => r(res.statusCode)); }); q.on('error', () => r(0)); if (b) q.end(b); else q.end(); });
async function createChats(n) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const got = []; ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type === 'created') got.push(m.reqId); } catch { } }); ws.on('error', () => { });
  // round 2: at 1 200 ms per call the hub's socket took longer than 5 s to open (the (h) run threw «not open»): up to 30 s, and a
  // socket that never opened is SAID (no conversation made) — never a throw that ends the suite
  await new Promise((r) => { ws.on('open', r); setTimeout(r, 30000); });
  if (ws.readyState !== 1) { info(`the hub's socket did not open in 30 s (readyState ${ws.readyState}) — no conversation created`); try { ws.terminate(); } catch { } return 0; }
  for (let i = 0; i < n; i++) { fs.mkdirSync(path.join(WORK, 'P' + i), { recursive: true }); ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: path.join(WORK, 'P' + i), cols: 80, rows: 24, reqId: 'q' + i })); const t = Date.now(); while (Date.now() - t < 30000 && !got.includes('q' + i)) await sleep(50); }
  ws.close(); return got.length;
}
/** the busy stretch: a mark every 200 ms, a usage walk every 10 s — the marks' times kept */
async function busy(h, ms) {
  const marks = [], codes = {}; let i = 0; const from = Date.now();
  const mt = setInterval(async () => { const at = Date.now(); const id = h.seed.ids[(i++ * 7) % h.seed.ids.length]; const m = { at, id, ms: null }; marks.push(m); const c = await req('POST', `/api/channels/agents/${id}/read`, { at }); m.ms = Date.now() - at; codes[c] = (codes[c] || 0) + 1; }, 200);
  const st = setInterval(() => { req('GET', '/api/usage-stats'); }, 10000);
  await sleep(ms); clearInterval(mt); clearInterval(st); await sleep(400);
  return { from, to: Date.now(), marks, codes };
}
/** the index's writes in [from, to] from strace's own renames (any thread): count, MB, a minute */
function paceOf(h, from, to) {
  let n = 0;   // one START line per rename (a delayed one is «<unfinished …>», resumed later)
  try { for (const l of fs.readFileSync(h.sl, 'utf8').split('\n')) { const m = /^\d+\s+(\d+\.\d+)\s+rename(?:at2?)?\(.*"[^"]*channels\/index\.json"(?:[,)]| <unfinished)/.exec(l); if (!m) continue; const t = +m[1] * 1000; if (t >= from && t <= to) n++; } } catch { }
  const min = (to - from) / 60000; return { writes: n, perMin: +(n / min).toFixed(1), mbPerMin: +((n * h.seed.bytes) / 1048576 / min).toFixed(0) };
}
/** round 3 (law 1): every whole-file store's writes in [from, to] from strace's OWN rename starts (any thread) → Map(relative
 *  file → [ms…]) — the longest stretch between two writes of a store that changes all the time is its oldest change's age */
function renamesOf(h, from, to) {
  const by = new Map();
  try { for (const l of fs.readFileSync(h.sl, 'utf8').split('\n')) {
    const m = /^\d+\s+(\d+\.\d+)\s+rename(?:at2?)?\((.*)$/.exec(l); if (!m || /^\s*<\.\.\./.test(m[2])) continue;
    const q = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]); const dest = q[1]; if (!dest || !dest.includes('/data/')) continue;
    const t = +m[1] * 1000; if (t < from || t > to) continue;
    const rel0 = dest.slice(dest.indexOf('/data/') + 1); (by.get(rel0) || by.set(rel0, []).get(rel0)).push(t);
  } } catch { }
  return by;
}
/** the main loop's gaps ≥ 250 ms in [from, to], each with the main-thread sync calls inside it (by site, by file) */
function holdsOf(h, from, to) {
  const s = slowOf(h); if (!s) return null;
  const big = s.gaps.filter((g) => g.end >= from && g.end - g.ms <= to && g.ms >= 250);
  const rows = big.map((g) => { const inside = s.calls.filter((c) => c.at < g.end && c.at + c.ms > g.end - g.ms); return { ms: g.ms, end: g.end, calls: inside.map((c) => ({ site: c.site, fn: c.fn, file: c.file, ms: c.ms })) }; });
  const movedCalls = s.calls.filter((c) => c.at >= from && c.at <= to && c.ms >= 250 && MOVED.test(c.file || ''));
  return { gaps: rows, movedCalls, s };
}
const siteSummary = (gaps) => { const m = new Map(); for (const g of gaps) { const k = g.calls.length ? [...new Set(g.calls.map((c) => `${c.site} ${c.fn}(${c.file})`))].join(' + ') : '(no sync fs call on the main thread)'; const r = m.get(k) || { n: 0, ms: 0, max: 0 }; r.n++; r.ms += g.ms; r.max = Math.max(r.max, g.ms); m.set(k, r); } return [...m].sort((a, b) => b[1].ms - a[1].ms); };

const table = { tree: OTHER || REPO, delayMs: DELAY, busyMs: BUSY_MS, runs: {}, loads: [] };
// THE BOX'S LOAD beside every number (the coordinator's rule: measure under whatever the box carries, state it, never add load)
const loadNow = (leg) => { try { const l = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' '); table.loads.push({ leg, at: new Date().toISOString(), load: l }); return l; } catch { return '?'; } };
const save = () => fs.writeFileSync(path.join(OUT, 'table.json'), JSON.stringify(table, null, 1));
async function busyRun(tag, tree, delayMs, { settleMs = 0 } = {}) {
  info(`${tag}: the box's load ${loadNow(tag)}`);
  const h = await boot(tag, tree, delayMs);
  if (!h.readyAt || !h.hub) { ok(false, `${tag}: the hub became ready (${delayMs} ms per call)`, fs.readFileSync(h.logf, 'utf8').slice(-1500)); await stopHub(h, 'SIGKILL', 2000); return null; }
  if (settleMs) await sleep(settleMs);   // (f): the boot's own holds after its first loop turn, before any conversation exists
  const createsAt = Date.now(); const chats = await createChats(3); await sleep(1500);
  const b = await busy(h, BUSY_MS);
  return { h, chats, b, createsAt };
}

console.log(`test-store-slow-storage — tree ${OTHER || REPO}; data dir on bindfs; ${CALLS} delayed per call; out ${OUT}`);
const T0 = Date.now();
VNC = await vncEnv(); PORT = await freePort(); setupStubs();
execFileSync('bindfs', ['--no-allow-other', BACK, MNT]); mounted = true;
const fsLine = (fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').find((l) => l.includes(` ${MNT} `)) || '').split(' - ')[1] || '';
ok(/^fuse\.bindfs /.test(fsLine), `the scratch data dirs live on a real FUSE mount (${fsLine.split(' ').slice(0, 2).join(' ')})`);
const TREE = OTHER || REPO;
const label = OTHER ? 'other tree' : 'this tree';

// ── (b) after: the pace at local speed ──
console.log(`— (b) the pace of the busy index at local speed (${label})`);
const r0 = leg('b') ? await busyRun('tree0', TREE, 0) : null;
if (r0) {
  const p = paceOf(r0.h, r0.b.from, r0.b.to); table.runs.tree0 = { pace: p, marks: r0.b.codes, chats: r0.chats }; save();
  ok(r0.b.codes['200'] > 0 && !Object.keys(r0.b.codes).some((c) => c !== '200'), `the index is marked through POST /api/channels/agents/<id>/read every 200 ms (${JSON.stringify(r0.b.codes)})`);
  info(`${label}: ${p.writes} index writes in ${Math.round((r0.b.to - r0.b.from) / 1000)} s = ${p.perMin} a minute, ${p.mbPerMin} MB a minute (index ${(r0.h.seed.bytes / 1048576).toFixed(1)} MB)`);
  if (!OTHER) ok(p.perMin <= 10 && p.mbPerMin <= 250, `AFTER: the busy ${(r0.h.seed.bytes / 1048576).toFixed(0)} MB index is written at its stated pace — ${p.perMin} writes / ${p.mbPerMin} MB a minute (≤ 10 / ≤ 250)`);
  await stopHub(r0.h);
}

// ── (a) + (f) + (c) at 500 ms per call ──
console.log(`— (a) (f) (c) ${DELAY} ms per call (${label})`);
if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
const r5 = !leg('a') ? null : await busyRun('tree500', TREE, DELAY, { settleMs: OTHER ? 0 : 12000 });
if (r5) {
  const H = holdsOf(r5.h, r5.b.from, r5.b.to);
  const movedGaps = H ? H.gaps.filter((g) => g.calls.some((c) => MOVED.test(c.file || ''))) : [];
  table.runs.tree500 = { holds: H && H.gaps, bootMs: r5.h.bootMs }; save();
  const sum = H ? siteSummary(H.gaps) : [];
  info(`${label}: ${H ? H.gaps.length : '?'} main-loop holds ≥ 250 ms in the ${Math.round((r5.b.to - r5.b.from) / 1000)} s busy stretch`);
  for (const [k, v] of sum) info(`   ${v.n} × ${k} — ${(v.ms / 1000).toFixed(1)} s in all, max ${v.max} ms`);
  if (!OTHER) {
    ok(H && movedGaps.length === 0 && H.movedCalls.length === 0, `(a) the four moved stores (channels index, session-meta, usage cursors, rates.json) cause NO main-thread hold ≥ 250 ms at ${DELAY} ms per call`, { movedGaps: movedGaps.slice(0, 4), movedCalls: H && H.movedCalls.slice(0, 4) });
    // (f) the boot split at the first loop turn — /api/boot-trace's own numbers: `mainMs` (the main module) + the listen
    //     callback's hold (it ran before the first turn and printed «Ready.»), then the holds AFTER the first turn until the
    //     creates began (hub-relative ms = epoch − startedAt)
    let bt = null; try { bt = JSON.parse(await new Promise((r) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/boot-trace' }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => r(d)); }).on('error', () => r('null')))); fs.writeFileSync(path.join(OUT, 'boot-trace-tree500.json'), JSON.stringify(bt)); } catch { bt = null; }
    if (bt && Number.isFinite(bt.mainMs)) {
      const listen = (bt.holds || []).find((x) => x.name === 'listen' || x.label === 'listen' || x.step === 'listen') || null;
      const firstTurn = bt.mainMs + (listen ? listen.ms : 0) + (bt.startAt || 0);
      const endAt = r5.createsAt - bt.startedAt + (bt.startAt || 0);
      const after = (bt.holds || []).filter((x) => x !== listen && x.at >= firstTurn - 5 && x.at < endAt && x.ms >= 250);
      const readyRel = r5.h.readyAt - bt.startedAt + (bt.startAt || 0);
      table.runs.tree500.boot = { mainMs: bt.mainMs, listenHoldMs: listen ? listen.ms : null, firstTurnMs: Math.round(firstTurn), readyMs: Math.round(readyRel), afterTurn: { holds: after.length, ms: after.reduce((n, x) => n + x.ms, 0), largest: after.slice().sort((p2, q) => q.ms - p2.ms).slice(0, 3).map((x) => ({ ms: x.ms, at: x.at, name: x.name || x.label || x.step || null })) }, untilMs: Math.round(endAt) };
      const mig = (bt.steps || []).find((x) => x.name === 'migrations') || null;
      table.runs.tree500.boot.migrations = mig ? { at: Math.round(mig.at), ms: Math.round(mig.ms), shareOfReady: +(mig.ms / readyRel).toFixed(3) } : null;
      info(`(f) the migrations' own step: ${mig ? `${Math.round(mig.ms)} ms at ${(mig.at / 1000).toFixed(1)} s — ${(100 * mig.ms / readyRel).toFixed(1)} % of boot-to-Ready (${(readyRel / 1000).toFixed(1)} s)` : 'not in the trace'}`);
      info(`(f) boot at ${DELAY} ms per call: the FIRST LOOP TURN at ${(firstTurn / 1000).toFixed(1)} s (main module ${(bt.mainMs / 1000).toFixed(1)} s + the listen callback ${listen ? (listen.ms / 1000).toFixed(1) : '?'} s, which printed «Ready.» at ${(readyRel / 1000).toFixed(1)} s); AFTER it, until the first conversation was created (${(endAt / 1000).toFixed(1)} s), ${after.length} hold(s) ≥ 250 ms = ${(after.reduce((n, x) => n + x.ms, 0) / 1000).toFixed(1)} s (largest ${after.map((x) => x.ms).sort((p2, q) => q - p2).slice(0, 3).join(', ')} ms)`);
    }
    if (bt && Number.isFinite(bt.mainMs)) {   // each boot hold after the first turn, by the main-thread sync calls inside it
      const sl = slowOf(r5.h), base = bt.startedAt - (bt.startAt || 0), b0 = table.runs.tree500.boot;
      for (const x of (bt.holds || []).filter((y) => y.at >= b0.firstTurnMs - 5 && y.at < b0.untilMs && y.ms >= 250).sort((p2, q) => q.ms - p2.ms)) {
        const a0 = base + x.at, e0 = a0 + x.ms, by = new Map();
        for (const c of (sl ? sl.calls : [])) if (c.at < e0 && c.at + c.ms > a0) { const k = `${c.site} ${c.fn}(${c.file})`; by.set(k, (by.get(k) || 0) + c.ms); }
        info(`   boot hold ${x.ms} ms${x.name ? ` (${x.name})` : ''}: ${[...by].sort((p2, q) => q[1] - p2[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(v)} ms`).join(' + ') || '(no sync fs call on the main thread)'}`);
      }
    }
    ok(!!(bt && Number.isFinite(bt.mainMs)), '(f) the boot split is read from /api/boot-trace (mainMs, the listen hold, the holds after the first turn)');
    ok(!!(table.runs.tree500.boot && table.runs.tree500.boot.migrations), `(f) the migrations' step is in the boot trace (${JSON.stringify(table.runs.tree500.boot && table.runs.tree500.boot.migrations)})`);
    if (bt && Number.isFinite(bt.mainMs)) {
      const sl = slowOf(r5.h), base = bt.startedAt - (bt.startAt || 0), b0 = table.runs.tree500.boot;
      const movedBoot = (sl ? sl.calls : []).filter((c) => c.at >= base + b0.firstTurnMs - 5 && c.at < base + b0.untilMs && c.ms >= 250 && MOVED.test(c.file || '')).map((c) => `${c.site} ${c.fn}(${c.file}) ${Math.round(c.ms)} ms`);
      ok(movedBoot.length === 0, `(f) after the first turn no main-thread call ≥ 250 ms is a moved store's write (the index's ordering writes are awaited off the loop)`, movedBoot.slice(0, 4));
    }
    // (c) SIGTERM right after a change of every moved store
    const id = r5.h.seed.ids[11], at = Date.now() + 7;
    const c1 = await req('POST', `/api/channels/agents/${id}/read`, { at });
    await req('GET', '/api/usage-stats');
    const sigAt = Date.now();
    const stopMs = await stopHub(r5.h, 'SIGTERM', 30000);
    const log = fs.readFileSync(r5.h.logf, 'utf8'); const line = (log.match(/\[store-write\] exit: \d+ stores? written[^\n]*/) || [''])[0];
    let row = null; try { row = JSON.parse(fs.readFileSync(path.join(r5.h.wtB, 'data/channels/index.json'), 'utf8')).conversations[`agents/${id}`]; } catch (e) { row = { error: e.message }; }
    const flushMs = +((/written in (\d+) ms/.exec(line) || [])[1] || NaN);
    table.runs.tree500.sigterm = { stopMs, line, readAtOnDisk: row && row.readAt, want: at }; save();
    info(`(c) SIGTERM ${c1 === 200 ? 'right after a mark + a usage walk' : '(the mark answered ' + c1 + ')'}: the hub exited in ${stopMs} ms; ${line || '(no exit line)'}`);
    ok(c1 === 200 && ((row && row.readAt === at) || /NOT written[^\n]*channels-index/.test(line)), `(c) the last index change is on disk (readAt ${row && row.readAt} = ${at}) — or the exit line names the index`, { line, row: row && { readAt: row.readAt } });
    // round 6 (E1): no bound of ours — the exit writes every store owed and says what it wrote; nothing «NOT written»
    ok(!/NOT written|bound/.test(line) && !/after the stop signal/.test(log) && (!line || Number.isFinite(flushMs)), `(c) the exit flush leaves nothing and no bound of ours is named (${line || 'no line: under 250 ms and nothing left'}); the hub ended by itself in ${stopMs} ms`);
    // LAW D by behaviour: during the shutdown the index reaches its file only through the WRITER — the exit flush (named in its
    // line) or the writer's thread (a write already in flight) — never the store's own flush on the loop, unnamed (what the
    // shutdown did with beginExit() inside a comment: law D's control below)
    const namedD = /\] exit: \d+ stores? written in \d+ ms \([^)]*channels-index\.write/.test(line);
    const ixMainD = (((slowOf(r5.h) || {}).calls) || []).filter((c) => c.at >= sigAt - 50 && /channels\/index\.json/.test(c.file || '') && c.ms >= 250).map((c) => `${c.site} ${c.fn} ${Math.round(c.ms)} ms`);
    ok(namedD || !ixMainD.length, `(c) LAW D: during the shutdown the index reached its file through the writer — ${namedD ? 'written BY THE EXIT FLUSH (named in its line)' : 'by the writer\'s own thread (no main-thread write of it, none named)'}: ${line.slice(0, 200)}`, { line, ixMainD });
  }
  if (r5.h.hub) await stopHub(r5.h);
}

// ── (d) + (e) at 1.1 s per call ──
if (!OTHER && leg('d')) {
  console.log(`— (d) (e) ${DELAY_KILL} ms per call: SIGKILL inside an index write; the witness's words for a bindfs data dir`);
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const h = await boot('tree1100', TREE, DELAY_KILL);
  if (!h.readyAt || !h.hub) ok(false, '(d) the hub became ready at 1.1 s per call', fs.readFileSync(h.logf, 'utf8').slice(-1500));
  else {
    const dir = path.join(h.wtB, 'data/channels'); const before = fs.readFileSync(path.join(dir, 'index.json'));
    let tmp = null; const t0 = Date.now(); let k = 0;
    while (Date.now() - t0 < 60000 && !tmp) { if (k++ % 5 === 0) await req('POST', `/api/channels/agents/${h.seed.ids[k % h.seed.ids.length]}/read`, { at: Date.now() }); tmp = fs.readdirSync(dir).find((f) => /^index\.json\.tmp/.test(f)) || null; if (!tmp) await sleep(40); }
    await sleep(150);
    const inFlight = !!tmp && fs.existsSync(path.join(dir, tmp));
    await stopHub(h, 'SIGKILL', 5000);
    let parsed = null, err = null; const after = fs.readFileSync(path.join(dir, 'index.json'));
    try { parsed = JSON.parse(after.toString('utf8')); } catch (e) { err = e.message; }
    let tmpParsed = null; try { tmpParsed = tmp && fs.existsSync(path.join(dir, tmp)) ? JSON.parse(fs.readFileSync(path.join(dir, tmp), 'utf8')) : null; } catch { tmpParsed = 'torn tmp (never read by the store)'; }
    const old = after.equals(before);
    ok(inFlight, `(d) an index write was IN FLIGHT when the hub was killed (${tmp || 'no temp file seen in 60 s'})`);
    ok(!!parsed && Object.keys(parsed.conversations || {}).length === CONVS, `(d) after SIGKILL the index parses whole — the ${old ? 'OLD' : 'NEW'} version (${Object.keys((parsed && parsed.conversations) || {}).length} conversations)`, err);
    const words = fs.readFileSync(h.logf, 'utf8').split('\n').filter((l) => /\[(canary|sync-fs)\]/.test(l) && l.includes(h.wt));
    table.runs.tree1100 = { inFlight, version: old ? 'old' : 'new', tmp: typeof tmpParsed === 'string' ? tmpParsed : !!tmpParsed, words: words.slice(0, 6) }; save();
    info(`(e) ${words.length} witness line(s) named a path of the bindfs data dir${words[0] ? ': ' + words[0].slice(0, 260) : ''}`);
    ok(words.length > 0 && !words.some((l) => /not under a mount/.test(l)), `(e) the canary / witness never says «not under a mount» for the bindfs data dir (${words.length} line(s); ${words.filter((l) => /fuse\.bindfs/.test(l)).length} name fuse.bindfs)`);
  }
}

// ── (g) THE EXIT, round 6 (E1 — no bound of ours): SIGTERM at 500, 1 200 and 2 600 ms per call, under a stated 6 s grace and
//    the default one — rounds 3–5 cut the first at a third of the grace (2 s); now each writes everything it owes ──
if (!OTHER && leg('g')) {
  console.log('— (g) the exit: SIGTERM right after a mark and a usage walk — a stated 6 s grace and the default, no bound of ours in either');
  const P = require(path.join(TREE, 'src/store-pace.js'));
  table.runs.exitBound = [];
  for (const delayMs of [500, 1200, 2600]) {   // 2 600 ms: the owner's hub's measured max rename — where one owed write outgrows the old 2 s bound
    for (const [label2, env2] of [['a stated 6 s grace (rounds 3–5: a 2 s bound)', { VIBESPACE_STOP_GRACE_S: '6' }], ['the default grace', {}]]) {
      if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
      const bnd = P.stopGraceOf({ ...process.env, ...env2 });
      const h = await boot(`exit${delayMs}-${env2.VIBESPACE_STOP_GRACE_S ? 'old' : 'new'}`, TREE, delayMs, env2);
      loadNow(`exit${delayMs}`);
      if (!h.readyAt || !h.hub) { ok(false, `(g) the hub became ready at ${delayMs} ms per call`, fs.readFileSync(h.logf, 'utf8').slice(-800)); await stopHub(h, 'SIGKILL', 2000); continue; }
      await sleep(3000);
      const id = h.seed.ids[23], at = Date.now() + 3;
      const c1 = await req('POST', `/api/channels/agents/${id}/read`, { at });
      await req('GET', '/api/usage-stats');
      const stopMs = await stopHub(h, 'SIGTERM', 60000);
      const log = fs.readFileSync(h.logf, 'utf8'); const line = (log.match(/\[store-write\] exit: \d+ stores? written[^\n]*/) || [''])[0], keeperSaid = (log.match(/\[store-write\] exit: [\d.]+ s after the stop signal[^\n]*/) || [''])[0];
      let row = null; try { row = JSON.parse(fs.readFileSync(path.join(h.wtB, 'data/channels/index.json'), 'utf8')).conversations[`agents/${id}`]; } catch (e) { row = { error: e.message }; }
      const written = +((/exit: (\d+) stores? written/.exec(line) || [])[1] || 0), flushMs = +((/written in (\d+) ms/.exec(line) || [])[1] || 0);
      const left = /NOT written[^:]*: (.*?) — their last changes/.exec(line);
      const r = { delayMs, grace: label2, graceMs: bnd.graceMs, mark: c1, stopMs, written, flushMs, left: left ? left[1] : null, markOnDisk: !!(row && row.readAt === at), keeperSaid: keeperSaid || null };
      table.runs.exitBound.push(r); save();
      info(`(g) ${delayMs} ms per call, ${label2} (${bnd.graceMs / 1000} s): exit in ${(stopMs / 1000).toFixed(1)} s; ${line || '(no exit line — under 250 ms, nothing left)'}; the last mark ${r.markOnDisk ? 'ON disk' : 'NOT on disk'}${keeperSaid ? `; the keeper: ${keeperSaid.slice(0, 120)}…` : ''}`);
      ok(c1 === 200 && r.markOnDisk && !r.left && !/bound/.test(line), `(g) ${label2} at ${delayMs} ms per call: nothing left, the last mark on disk — no bound of ours (exit ${(stopMs / 1000).toFixed(1)} s)`, r);
    }
  }
}

// ── LAW D's RED CONTROL: this tree with the shutdown's beginExit() removed (the round-1 slip — it sat inside a comment) ──
if (!OTHER && leg('D')) {
  console.log('— LAW D control: the same SIGTERM with the shutdown\'s exit START removed (beginExit + the rank-0 flush) — the stores\' own flushes write the index outside the exit');
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const mutDir = path.join(ROOT, 'mut-d'); fs.mkdirSync(mutDir, { recursive: true });
  for (const f of TREE_FILES) fs.cpSync(path.join(TREE, f), path.join(mutDir, f), { recursive: true });
  // round 3: exitFlush({only:'rank0'}) begins the exit by itself, so the mutant removes the whole START of the exit
  const sj = fs.readFileSync(path.join(mutDir, 'server.js'), 'utf8'), ANCHOR = "try { const SW0 = require('./src/store-writer.js').storeWriter(); SW0.beginExit(); SW0.exitFlush({ only: 'rank0' }); } catch {} ";
  ok(sj.split(ANCHOR).length === 2, 'LAW D control premise: the shutdown begins its exit once (beginExit + the rank-0 flush — the mutant removes exactly that statement)');
  fs.writeFileSync(path.join(mutDir, 'server.js'), sj.split(ANCHOR).join(''));
  const h = await boot('exitD-mut', mutDir, DELAY);
  loadNow('exitD-mut');
  if (!h.readyAt || !h.hub) { ok(false, 'LAW D control: the hub became ready', fs.readFileSync(h.logf, 'utf8').slice(-800)); await stopHub(h, 'SIGKILL', 2000); }
  else {
    await sleep(3000);
    const id = h.seed.ids[29], at = Date.now() + 5;
    const c1 = await req('POST', `/api/channels/agents/${id}/read`, { at });
    const sigAt = Date.now();
    const stopMs = await stopHub(h, 'SIGTERM', 60000);
    const log = fs.readFileSync(h.logf, 'utf8'); const line = (log.match(/\[store-write\] exit:[^\n]*/) || [''])[0];
    const sl = slowOf(h); const onLoop = (sl ? sl.calls : []).filter((c) => c.at >= sigAt - 50 && /channels\/index\.json/.test(c.file || '') && c.ms >= 250).map((c) => `${c.site} ${c.fn} ${Math.round(c.ms)} ms`);
    table.runs.exitDmut = { mark: c1, stopMs, line, onLoop }; save();
    info(`LAW D control: exit in ${(stopMs / 1000).toFixed(1)} s; ${line || '(no exit line)'}; the index on the main thread: ${onLoop.slice(0, 3).join(' · ') || 'none ≥ 250 ms'}`);
    // round 3 (law 2): every write goes through the thread now, so the mutant's sign is not a main-thread write — it is the
    // index written by the stores' OWN flushes, outside the exit's order and bound: the line names neither it nor a rank-0 pass
    ok(c1 === 200 && !/\] exit: \d+ stores? written in \d+ ms \([^)]*channels-index\.write/.test(line) && !/the first \d+ before the shutdown/.test(line), `LAW D control is RED without the exit's start: the index was written by the stores' own shutdown flushes, outside the exit's one order and bound — the line names neither it nor a rank-0 pass (${line.slice(0, 160) || 'no exit line'})`, { line, onLoop });
  }
}

// ── (i) THE CRASH PATH (round 3, law 2): the server's own uncaughtException handler on slow storage — a status write in
//    flight, a person's act owed: rank 0 on disk FIRST (before the unmoved stores), inside the crash's own bound, the exit ends
if (!OTHER && leg('i')) {
  console.log('— (i) the crash path at 500 ms per call: a status write in flight, an act owed — rank 0 first; the exit writes everything and ends by itself');
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const CF = path.join(OUT, 'crash-crash500');
  const h = await boot('crash500', TREE, DELAY, { STORE_SLOW_CRASH_FILE: CF });
  loadNow('crash500');
  if (!h.readyAt || !h.hub) { ok(false, '(i) the hub became ready', fs.readFileSync(h.logf, 'utf8').slice(-800)); await stopHub(h, 'SIGKILL', 2000); }
  else {
    await sleep(3000);
    // the channels engine answers marks first (its 22 MB index loaded): one mark awaited, then the scene
    let warm = 0; for (let k = 0; k < 20 && warm !== 200; k++) { warm = await req('POST', `/api/channels/agents/${h.seed.ids[30]}/read`, { at: Date.now() }); if (warm !== 200) await sleep(500); }
    await sleep(2500);   // that mark's own writes settle
    const id = h.seed.ids[31], at = Date.now() + 9;
    req('POST', '/api/session-status', { sessionKey: 'crash-probe', state: 'working', reason: 'the crash path' });   // its durable write: in flight
    await sleep(40);
    const pm = req('POST', `/api/channels/agents/${id}/read`, { at });   // a person's act: applied in memory, its journal line owed behind the status write in flight
    await sleep(250);   // the hub reads and applies the mark (localhost) while the status write (500 ms) still flies
    const tC = Date.now(); fs.writeFileSync(CF, '1');
    let gone = 0; while (Date.now() - tC < 60000) { try { process.kill(h.hub, 0); } catch { gone = Date.now(); break; } await sleep(25); }
    await pm.catch(() => null);
    const crashMs = gone ? gone - tC : null; endHub(); await sleep(300);
    const log = fs.readFileSync(h.logf, 'utf8'); const line = (log.match(/\[store-write\] exit after the crash: \d+ stores? written[^\n]*/) || [''])[0];
    const acts = (() => { try { return fs.readFileSync(path.join(h.wtB, 'data/channels/index-acts.ndjson'), 'utf8'); } catch { return ''; } })();
    let row = null; try { row = JSON.parse(fs.readFileSync(path.join(h.wtB, 'data/channels/index.json'), 'utf8')).conversations[`agents/${id}`]; } catch { }
    const onDisk = acts.includes(`"readAt":${at}`) || !!(row && row.readAt === at);
    const m = /written in (\d+) ms \(([^)]*)\)(?:; the first (\d+) before the crash road's own unmoved stores \(census debt\), which took (\d+) ms)?/.exec(line) || [];
    const first = m[3] ? +m[3] : 0, debtMs = m[4] ? +m[4] : null, names = (m[2] || '').split(', ');
    const markCode = await Promise.race([pm, sleep(100).then(() => 'no answer (the process ended)')]);
    table.runs.crash500 = { crashMs, line, onDisk, first, debtMs, warm, markCode }; save();
    info(`(i) crashed ${crashMs != null ? `→ gone in ${(crashMs / 1000).toFixed(1)} s` : '(never ended in 60 s)'}; ${line || '(no exit line)'}; the act ${onDisk ? 'ON disk' : 'NOT on disk'}`);
    ok(crashMs != null && first >= 1 && /channels-acts\.write/.test(names.slice(0, first).join(',')) && onDisk && !/NOT written|bound|signal|shutdown's/.test(line) && !/exit after the crash: [\d.]+ s after the crash/.test(log),
      `(i) LAW 2 on the crash path: the act (rank 0) written FIRST — before the crash road's own unmoved stores (${debtMs} ms of census debt) — on disk; nothing left, and the process ended BY ITSELF ${crashMs} ms after the crash (no keeper: inside the grace)`, { line, onDisk, crashMs });
  }
}

// ── (k) THE KEEPER IS THERE FROM BOOT (round 6, E3 a): the REAL server.js booted (a stated grace of 3 s), then the install
//    tree (the keeper's own file + store-pace) AND the data directory (the telemetry shard the crash road appends to) hang
//    — FIFOs nobody writes — and a crash: the keeper's line «after the crash» and the end, one grace after the crash.
//    Round 5's keeper was born at the FIRST store write (a hub that had written nothing loaded it at the crash, from the
//    hanging install: no line, no end) ──
if (!OTHER && leg('k')) {
  console.log('— (k) the real server booted, its install tree and data dir hanging, then a crash: the keeper (born at the boot) says the line and ends it at the crash + the grace');
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const CF = path.join(OUT, 'crash-bootkeeper');
  const h = await boot('bootkeeper', TREE, 0, { STORE_SLOW_CRASH_FILE: CF, VIBESPACE_STOP_GRACE_S: '3' });
  if (!h.readyAt || !h.hub) { ok(false, '(k) the hub became ready', fs.readFileSync(h.logf, 'utf8').slice(-800)); await stopHub(h, 'SIGKILL', 2000); }
  else {
    await sleep(1500);
    // for the table, read before anything hangs: the hub's thread count and the writer's own count of the store writes it
    // made so far (a fresh hub writes some at its boot; the keeper was started before any)
    const threadsAtBoot = (() => { try { return fs.readdirSync(`/proc/${h.hub}/task`).length; } catch { return null; } })();
    const sl0 = slowOf(h), writes0 = sl0 && sl0.writer ? sl0.writer.reduce((n, r) => n + (r.writes || 0), 0) : null;
    const inst = path.join(h.wtB, 'src'), d = new Date(), shard = path.join(h.wtB, 'data/telemetry', `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`);
    for (const n of ['store-exit-keeper.js', 'store-pace.js']) { fs.renameSync(path.join(inst, n), path.join(inst, n + '.away')); execFileSync('mkfifo', [path.join(inst, n)]); }
    fs.mkdirSync(path.dirname(shard), { recursive: true }); try { fs.renameSync(shard, shard + '.away'); } catch { } execFileSync('mkfifo', [shard]);
    const tC = Date.now(); fs.writeFileSync(CF, '1');
    let gone = 0; while (Date.now() - tC < 30000) { try { process.kill(h.hub, 0); } catch { gone = Date.now(); break; } await sleep(25); }
    const crashMs = gone ? gone - tC : null; endHub(); await sleep(300);
    for (const n of ['store-exit-keeper.js', 'store-pace.js']) { try { fs.unlinkSync(path.join(inst, n)); fs.renameSync(path.join(inst, n + '.away'), path.join(inst, n)); } catch { } }
    try { fs.unlinkSync(shard); fs.renameSync(shard + '.away', shard); } catch { }
    const log = fs.readFileSync(h.logf, 'utf8'), kl = (log.match(/\[store-write\] exit after the crash: [\d.]+ s after the crash[^\n]*/) || [''])[0];
    table.runs.bootKeeper = { crashMs, line: kl, writesBeforeCrash: writes0, threads: threadsAtBoot }; save();
    info(`(k) the crash → gone in ${crashMs != null ? (crashMs / 1000).toFixed(1) + ' s' : '(never, 30 s)'}; the writer had written ${writes0 == null ? '?' : writes0} store write(s) before it; ${kl ? kl.slice(0, 220) + '…' : '(no keeper line)'}`);
    ok(crashMs != null && crashMs >= 3000 - 100 && crashMs < 3000 + 4000 && /the grace a service manager gives a stop \(3\.0 s, VIBESPACE_STOP_GRACE_S\) is spent/.test(kl) && /the main thread is still in openat on [^ ]*events-\d{4}-\d{2}\.ndjson/.test(kl) && / — the writer's exit keeper ends the process now$/.test(kl) && !/signal|shutdown's/.test(kl),
      `(k) E3 (a): the real server.js, its install tree and data directory hanging, then a crash — the keeper born at the BOOT said «after the crash» (the main thread in openat on the telemetry shard) and ended it ${crashMs} ms after the crash (the grace 3 s)`, { crashMs, kl, tail: log.slice(-600) });
  }
}
// ── (j) THE RESTART (round 3, law 3): a file's first version is a fact of the DISK — a hub restarted over its conversations
//    (their dtach sessions alive) updates their metas through the writer: no session-meta write on the main thread ──
if (!OTHER && leg('j')) {
  console.log('— (j) the restart at 1 200 ms per call: the restored conversations\' metas — none written on the main thread');
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const h1 = await boot('restartA', TREE, DELAY);
  if (!h1.readyAt || !h1.hub) { ok(false, '(j) the first hub became ready', fs.readFileSync(h1.logf, 'utf8').slice(-800)); await stopHub(h1, 'SIGKILL', 2000); }
  else {
    const chats = await createChats(3); await sleep(4000);
    await stopHubOnly(h1);
    const metasOnDisk = (() => { try { return fs.readdirSync(path.join(h1.wtB, 'data/session-meta')).filter((f) => f.endsWith('.json')).length; } catch { return 0; } })();
    loadNow('restartB');
    const h2 = await boot('restartB', TREE, 1200, {}, { reuseOf: 'restartA' });
    if (!h2.readyAt || !h2.hub) { ok(false, '(j) the restarted hub became ready', fs.readFileSync(h2.logf, 'utf8').slice(-800)); }
    else {
      await sleep(15000);   // the restore, the reattaches and their first meta updates
      const sl = slowOf(h2);
      const mainMeta = (sl ? sl.sites : []).filter((r) => /session-meta\//.test(Object.keys(r.files || {}).join(' ')) && /renameSync|writeFileSync/.test(r.fn));
      const mainMetaCalls = mainMeta.reduce((n, r) => n + r.n, 0), holds = (sl ? sl.calls : []).filter((c) => /session-meta\//.test(c.file || '') && c.ms >= 250).map((c) => `${c.site} ${c.fn} ${Math.round(c.ms)} ms`);
      const writer = ((sl && sl.writer) || []).filter((r) => /session-meta\//.test(r.file));
      table.runs.restart = { chats, metasOnDisk, mainMetaCalls, holds, writerMetaWrites: writer.reduce((n, r) => n + r.writes, 0) }; save();
      info(`(j) ${chats} conversations, ${metasOnDisk} metas on disk at the restart: after it ${mainMetaCalls} session-meta write${mainMetaCalls === 1 ? '' : 's'} on the MAIN thread${holds.length ? ` (${holds.slice(0, 3).join(' · ')})` : ''}; ${table.runs.restart.writerMetaWrites} through the writer`);
      ok(chats >= 2 && metasOnDisk >= 2 && mainMetaCalls === 0 && !holds.length, `(j) LAW 3: a hub restarted over ${metasOnDisk} existing metas at 1 200 ms per call writes none of them on the main thread (${table.runs.restart.writerMetaWrites} meta writes went through the writer)`, table.runs.restart);
    }
    await stopHub(h2.hub ? h2 : h1, 'SIGTERM', 60000);
  }
}

// ── (h) THE BUSY MINUTE at 1 200 ms per call (law C): every act answered; every file's writes and MB a minute ──
if (!OTHER && leg('h')) {
  console.log('— (h) the busy minute at 1 200 ms per call: every act\'s answer (p50 / max / unanswered) and MB a minute for EVERY file');
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const DH = 1200, load0 = loadNow('busy1200');
  const h = await boot('busy1200', TREE, DH);
  if (!h.readyAt || !h.hub) { ok(false, `(h) the hub became ready at ${DH} ms per call`, fs.readFileSync(h.logf, 'utf8').slice(-800)); await stopHub(h, 'SIGKILL', 2000); }
  else {
    const chats = await createChats(3); await sleep(2500);
    const s0 = slowOf(h);
    const b = await busy(h, 60000);
    await sleep(5000 + 1100);   // the acts still owed get 5 s past the stretch; the preload's dump is at most 1 s old after it
    const s1 = slowOf(h), load1 = loadNow('busy1200-end');
    const lat = b.marks.filter((m) => m.ms != null).map((m) => m.ms).sort((x, y) => x - y);
    const unanswered = b.marks.length - lat.length, p50 = lat[Math.floor(lat.length / 2)] ?? null, max = lat.length ? lat[lat.length - 1] : null;
    const min = (b.to - b.from) / 60000;
    const w0 = new Map(((s0 && s0.writer) || []).map((r) => [r.file, r]));
    const rn = renamesOf(h, b.from, b.to);
    const stretchOf = (f) => { const ts = (rn.get(f) || []).slice().sort((x, y) => x - y); if (!ts.length) return null; let m = ts[0] - b.from; for (let i = 1; i < ts.length; i++) m = Math.max(m, ts[i] - ts[i - 1]); return Math.round(Math.max(m, b.to - ts[ts.length - 1])); };
    const files = ((s1 && s1.writer) || []).map((r) => { const a = w0.get(r.file) || { writes: 0, bytesWritten: 0 }; return { name: r.name, file: r.file, writes: r.writes - a.writes, bytes: r.bytesWritten - a.bytesWritten, maxMs: r.maxMs, failures: r.failures,
      gapMs: r.gapMs, stretchMs: stretchOf(r.file), oldestNowMs: r.oldestAgeMs || 0, maxAgeSinceBootMs: r.maxAgeMs, urgent: !!r.urgent }; })
      .filter((r) => r.writes > 0).map((r) => ({ ...r, perMin: +(r.writes / min).toFixed(1), mbPerMin: +(r.bytes / 1048576 / min).toFixed(3) })).sort((x, y) => y.bytes - x.bytes);
    const okCodes = b.codes['200'] || 0;
    table.runs.busy1200 = { delayMs: DH, load: [load0, load1], chats, acts: { n: b.marks.length, answered: lat.length, ok: okCodes, codes: b.codes, p50, max, unanswered }, files }; save();
    info(`(h) ${b.marks.length} acts in ${Math.round(min * 60)} s at ${DH} ms per call (load ${load0} → ${load1}; ${chats} chat conversations ending turns): answered ${lat.length}, p50 ${p50} ms, max ${max} ms, unanswered ${unanswered} (${JSON.stringify(b.codes)})`);
    for (const r of files) info(`   ${r.file} (${r.name}): ${r.writes} writes = ${r.perMin} a minute, ${r.mbPerMin} MB a minute; its slowest write ${r.maxMs} ms${r.failures ? `, ${r.failures} failures` : ''}; the longest stretch between two of its writes ${r.stretchMs == null ? '(appends — no rename)' : `${(r.stretchMs / 1000).toFixed(1)} s`}; its oldest change still owed at the end ${(r.oldestNowMs / 1000).toFixed(1)} s (the writer's measured max since boot ${(r.maxAgeSinceBootMs / 1000).toFixed(1)} s; its gap ${(r.gapMs / 1000).toFixed(1)} s)`);
    ok(files.length > 0, `(h) the writer's own per-file numbers were read (${files.length} files)`);
    ok(unanswered === 0 && okCodes === b.marks.length, `(h) every act was answered 200 — ${okCodes} of ${b.marks.length} (none waits on an index write; a durable act is the NEXT write)`, b.codes);
    // ROUND 3 (law 1, bound a): an act is on disk within 2K + 1 writes, K = the durable stores owed (here the act journal and
    // the conversations' metas — a binding / a person's act each); the writes' own time is the storage's (each ~${DH} ms)
    const PA = require(path.join(TREE, 'src/store-pace.js')), Kd = Math.max(1, files.filter((r) => /index-acts|session-meta|session-status/.test(r.file)).length), slowA = Math.max(DH, ...files.map((r) => r.maxMs || 0));
    const actBound = PA.actBoundWrites ? PA.actBoundWrites(Kd) * slowA + 1500 : 3 * DH + 1500;
    ok(max != null && max <= actBound, `(h) LAW 1 (a): the slowest act answered in ${max} ms (p50 ${p50} ms) ≤ ${PA.actBoundWrites ? PA.actBoundWrites(Kd) : 3} writes of ${slowA} ms + 1.5 s = ${actBound} ms (${Kd} durable stores could be owed)`);
    const ix = files.find((r) => /channels\/index\.json$/.test(r.file));
    // ROUND 3 (law 1, bound b): the busy index — changed by every mark — is written within its gap plus PACED_BOUND writes,
    // under the stream of acts (round 2: once in the minute; the act queue starved it)
    const PW = require(path.join(TREE, 'src/store-pace.js')), nPaced = files.filter((r) => !/index-acts/.test(r.file)).length, slowest = Math.max(DH, ...files.map((r) => r.maxMs || 0));
    const ixBound = ix ? Math.max(ix.gapMs || 0, 500) + PW.pacedBoundWrites(nPaced) * slowest + 1500 : null;
    ok(!!ix && ix.writes >= 2 && ix.stretchMs != null && ix.stretchMs <= ixBound, `(h) LAW 1 (b): under 5 acts a second at ${DH} ms per call the busy index is written ${ix && ix.writes} times; the longest stretch between two of its writes ${ix && ix.stretchMs} ms ≤ its gap + ${PW.pacedBoundWrites(nPaced)} writes (${nPaced} paced files) = ${ixBound} ms`, ix);
    ok(!ix || ix.mbPerMin <= 250, `(h) the busy index at ${DH} ms per call: ${ix ? `${ix.writes} whole writes, ${ix.mbPerMin} MB a minute` : 'no whole write in the minute'} (≤ 250 MB)`);
    await stopHub(h);
  }
}

// ── THE RED CONTROL: the tree before the store writer ──
if (CONTROL && leg('control')) {
  const C = controlTree();
  if (C.error) console.log(`  ⊘ SKIP the red control — the tree before the store writer could not be read from git (${C.error})`);
  else console.log(`— RED CONTROL: the same busy legs on ${C.sha} (before the store writer)`);
  const b0 = C.error ? null : await busyRun('base0', C.dir, 0);
  if (b0) { const p = paceOf(b0.h, b0.b.from, b0.b.to); table.runs.base0 = { pace: p, sha: C.sha }; save(); info(`before (${C.sha}): ${p.writes} index writes = ${p.perMin} a minute, ${p.mbPerMin} MB a minute`); ok(p.perMin >= 30, `CONTROL (b) is RED before: the busy index is rewritten whole ${p.perMin} times / ${p.mbPerMin} MB a minute`); await stopHub(b0.h); }
  if (guard()) { ok(false, `thermal stop: ${guard()}`); process.exit(1); }
  const b5 = C.error ? null : await busyRun('base500', C.dir, DELAY);
  if (b5) {
    const H = holdsOf(b5.h, b5.b.from, b5.b.to); const moved = H ? H.gaps.filter((g) => g.calls.some((c) => MOVED.test(c.file || ''))) : [];
    table.runs.base500 = { holds: H && H.gaps, sha: C.sha }; save();
    info(`before (${C.sha}) at ${DELAY} ms per call: ${H ? H.gaps.length : '?'} holds ≥ 250 ms, ${moved.length} of them a moved store's write`);
    for (const [k, v] of (H ? siteSummary(H.gaps) : []).slice(0, 6)) info(`   ${v.n} × ${k} — ${(v.ms / 1000).toFixed(1)} s, max ${v.max} ms`);
    ok(moved.length > 0, `CONTROL (a) is RED before: ${moved.length} main-thread holds ≥ 250 ms were a moved store's write`);
    await stopHub(b5.h);
  }
}
const secs = Math.round((Date.now() - T0) / 1000);
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ` passed, ${fail} failed` : ''}) — ${secs} s; table ${path.join(OUT, 'table.json')}`);
process.exit(fail ? 1 : 0);
