#!/usr/bin/env node
// test-vault-run-offloop — THE SCAN OFF THE LOOP's legs (lane lg-vault-file; 主开发 r1505 / r1573 / r1919 / r2161), moved out of
// test-vault-run into their own fast suite and row by 主开发 r2322 «THE COST»: a worker a run is the door's own cost since the scan
// left the hub's loop, and these legs are its proofs. src/server/vault-run-door.js `startScrub` + src/server/vault-run-scrub-worker.js
// over a REAL vault engine on a scratch dir, the REAL For-you store and REAL children (the same fake printer as test-vault-run's).
//   (0) A READING: a run's worker start and its ready wait (the door's startScrub), the median of nine — never judged.
//   (1) the loop is not held · (2) byte for byte against the masker on the loop (end / cut / past the figure, each mode's red)
//   (3) a lost worker withholds by name (dies, mute, out of order, a throw in its masker, a refused build) · (4) the bound is on
//   silence, not work · (5) a worker that cannot start refuses the run · (6) what is posted and not answered is bounded
//   r1919 (1) the lock sees a run until its worker ended · (2) an unanswered run keeps its once-grant spent · (3) the CLI says
//   the command ran · r2161 (a)–(f) · (7) no worker outlives its run (four runs, a timeout, a gone caller, a lock, closeAll).
//   Every leg has its red control (a patched copy of the door, the worker or the CLI, in this process's scratch dir).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';   // THE ONE ASSERTION HELPER (B-1747): a swapped call throws, never a green leg
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (rel) => require(path.join(REPO, rel));
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VE = R('src/server/vault-engine.js');
const DOOR = R('src/server/vault-run-door.js');
const VR = R('src/vault-run.js');
const { UserTodoManager } = R('src/user-todos.js');
const ROOT = scratchDir('vaultrunoff');   // r1152: never `vault-run` — /tmp/vs-vault-run-… is the vault run door's own folder shape
// THE SUITE'S OWN HOME, TEMP FOLDER AND ENVIRONMENT (as test-vault-run's): every door this suite builds gets them, never os.homedir() / process.env
const SUITE_HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(SUITE_HOME, 'Downloads'), { recursive: true });
const SUITE_TMP = ROOT;
const SUITE_ENV = Object.freeze({ HOME: SUITE_HOME, PATH: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'), TMPDIR: SUITE_TMP, LANG: 'C.UTF-8' });
const M = mutantCopies('vaultrunoff', REPO);
const PW = 'the second password of the off-loop suite';
const VALUE = 'Vr-S3cret/value+with=odd&chars"\\ü-0123';   // test-vault-run's value: odd characters every form spells differently

// ── THE FAKE PRINTER (test-vault-run's own, verbatim) on a read-only bin dir first on the child's PATH ──
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const PRINTER = path.join(BIN, 'printer.js');
fs.writeFileSync(PRINTER, `// stale-pins: kept (the fake printer's own spawn below, not a pin on src/jobs.js)
const fs = require('fs'), path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [mode, arg] = process.argv.slice(2);
(async () => {
  if (mode === 'hang') { process.on('SIGTERM', () => {}); fs.writeFileSync(arg, String(process.pid)); setInterval(() => {}, 1000); return; }
  if (mode === 'sleep') { fs.writeFileSync(arg, String(process.pid)); setInterval(() => {}, 1000); return; }
  if (mode === 'bg' || mode === 'stray') {   // a child left behind: in the run's group (bg) or in its own session, deaf to SIGTERM (stray)
    const k = require('child_process').spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { detached: mode === 'stray', stdio: 'ignore' });
    fs.writeFileSync(arg, String(k.pid)); k.unref(); return;
  }
  if (mode === 'pipehold') {   // a grandchild in its own session holds stdout and prints HALF the value, then waits; the child leaves
    const v = process.env.T;
    require('child_process').spawn(process.execPath, ['-e', 'process.stdout.write("<" + process.argv[1]); setInterval(()=>{},1000)', v.slice(0, 14)], { detached: true, stdio: ['ignore', 'inherit', 'ignore'] }).unref();
    return;
  }
  if (mode === 'ran') { fs.writeFileSync(arg, 'ran'); return; }
  if (mode === 'nice') { process.stdin.on('data', () => {}); process.stdin.on('end', () => process.stdout.write('NICE ' + require('os').getPriority())); return; }   // B-7f18: the run's own niceness, read by itself once its stdin closed (the door writes it after the set)
  if (mode === 'json') { const v = process.env.T, b = Buffer.from(v); process.stdout.write('{"meta":{"rc":"ok"},"key":"deadbeefcafef00dba5eba11","use_auth":false,"site":"HQ","auth":"' + b.toString('base64') + '","raw":"' + v + '","ok":true}\\n'); return; }
  if (mode === 'split') { const v = process.env.T, h = v.length >> 1; process.stdout.write('<' + v.slice(0, h)); await sleep(40); process.stderr.write(v.slice(h) + '>\\n'); await sleep(40); process.stdout.write(' tail\\n'); return; }   // ONE value, half on each pipe
  if (mode === 'drip') { for (let i = 0; i < 10; i++) { process.stdout.write('drip ' + i + (i === 4 ? ' ' + process.env.T : '') + '\\n'); await sleep(5); } return; }   // ten pieces 5 ms apart, the value in the fifth (THE BOUND ON SILENCE's lawful slow run)
  if (mode === 'soft') { process.stdout.write('token=' + process.env.T + '\\n' + '=\\n'.repeat(150000) + 'done\\n'); return; }   // 300 KB of soft breaks after the value: the QP view holds them, each turn rescans the hold (THE SCAN OFF THE LOOP's costly output)
  if (mode === 'edge2') { process.stdout.write('x'.repeat(2 * 1024 * 1024 - 60) + [...process.env.T].map((c) => '&#' + c.codePointAt(0) + ';').join('') + 'y'.repeat(4096)); return; }   // a LONG new form across the 2 MiB cut
  if (mode === 'edge3') { process.stdout.write(Buffer.concat([Buffer.from('x'.repeat(2 * 1024 * 1024 - 40)), Buffer.from(process.env.T, 'utf16le'), Buffer.from('y'.repeat(4096))])); return; }
  let v;
  if (mode === 'env') v = process.env.T;
  else if (mode === 'file') { const st = fs.statSync(arg), dst = fs.statSync(path.dirname(arg)); process.stdout.write('FILE ' + (st.mode & 0o777).toString(8) + ' ' + (dst.mode & 0o777).toString(8) + ' ' + path.dirname(arg) + '\\n'); v = fs.readFileSync(arg, 'utf8'); }
  else if (mode === 'template') v = fs.readFileSync(arg, 'utf8').replace(/^token=/, '').replace(/\\n$/, '');
  else if (mode === 'stdin') v = fs.readFileSync(0, 'utf8').replace(/\\n$/, '');
  else if (mode === 'big') { process.stdout.write('x'.repeat(3 * 1024 * 1024)); process.stdout.write(process.env.T); return; }
  else if (mode === 'edge') { process.stdout.write('x'.repeat(2 * 1024 * 1024 - 12) + process.env.T + 'y'.repeat(4096)); return; }   // the value ACROSS the 2 MiB cut
  const b = Buffer.from(v);
  const forms = [v, b.toString('base64'), b.toString('base64url'), b.toString('base64').replace(/=+$/, ''), encodeURIComponent(v), encodeURIComponent(v).toLowerCase(), JSON.stringify(v), JSON.stringify(v).slice(1, -1), b.toString('hex'), b.toString('hex').toUpperCase(), 'Authorization: Basic ' + Buffer.from('user:' + v).toString('base64'), 'Basic ' + Buffer.from('ab:' + v).toString('base64')];
  // lane vault-scrub-forms: what a real producer prints by itself (base32, a quoted-printable body, a Python bytes repr, HTML
  // entities, colour escapes, base64 wrapped at 76) — and UTF-16 as BYTES (the door decodes them)
  const bits = [...b].map((x) => x.toString(2).padStart(8, '0')).join(''); let b32 = ''; for (let i = 0; i < bits.length; i += 5) b32 += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; b32 += '='.repeat((8 - (b32.length % 8)) % 8);
  const qp = [...b].map((x) => (x >= 33 && x <= 126 && x !== 61 ? String.fromCharCode(x) : '=' + x.toString(16).padStart(2, '0').toUpperCase()));
  forms.push(b32, b32.replace(/=+$/, '').toLowerCase(), qp.slice(0, 9).join('') + '=\\r\\n' + qp.slice(9).join(''),
    "b'" + [...b].map((x) => (x === 92 ? '\\\\\\\\' : x === 39 ? "\\\\'" : x >= 32 && x < 127 ? String.fromCharCode(x) : '\\\\x' + x.toString(16).padStart(2, '0'))).join('') + "'",
    [...v].map((c) => '&#' + c.codePointAt(0) + ';').join(''), [...v].map((c, i) => (i && i % 4 === 0 ? '\\x1b[0m' : '') + c).join(''),
    Buffer.from('x'.repeat(48) + v).toString('base64').replace(/(.{76})/g, '$1\\n'));
  // each spelling cut across two chunks on BOTH pipes at once — the other pipe's half arrives between a pipe's two halves
  // (the run's one scrubber reads each pipe on its own too, lane vault-scrub-forms)
  const pipes = [process.stdout, process.stderr];
  for (const f of forms) { const h = f.length >> 1; for (const out of pipes) out.write('<' + f.slice(0, h)); await sleep(6); for (const out of pipes) out.write(f.slice(h) + '>\\n'); }
  for (const f of [Buffer.from(v, 'utf16le'), Buffer.from(v, 'utf16le').swap16()]) { const h = f.length >> 1; for (const out of pipes) out.write(Buffer.concat([Buffer.from('<'), f.subarray(0, h)])); await sleep(6); for (const out of pipes) out.write(Buffer.concat([f.subarray(h), Buffer.from('>\\n')])); }
  process.stdout.write('DONE ' + mode + '\\n');
  process.exitCode = 3;
})();
`);
fs.chmodSync(BIN, 0o555);
const NODE = process.execPath;
const TRUSTED_ROOT = [BIN, path.dirname(NODE), '/usr/local/bin', '/usr/bin', '/bin'];
const isRootOwnedTest = (p) => TRUSTED_ROOT.some((d) => p === d || p.startsWith(d + '/'));

// THE ORACLE (test-vault-run's own, verbatim): Node's own decoders, every view a real producer's spelling needs — never the module's
const VIEWS_OF = (t) => {
  const latin = (s) => Buffer.from(s, 'latin1').toString('utf8');
  return [t, t.replace(/\x1b\[[0-9;]*[mK]/g, ''), t.replace(/[\r\n]/g, ''), latin(t.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))),
    latin(t.replace(/\\x([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\\')), t.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))), t.replace(/\0/g, '')];
};
const unb32 = (s) => { const bits = [...s.toUpperCase().replace(/=+$/, '')].map((c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join(''); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out).toString('utf8'); };
function leaks(text, value) {
  const out = [];
  for (const t of VIEWS_OF(String(text || ''))) out.push(...leaksIn(t, value));
  for (const m of String(text || '').matchAll(/[A-Za-z2-7]{16,}=*/g)) if (/^[A-Z2-7]+=*$|^[a-z2-7]+=*$/.test(m[0]) && unb32(m[0]).includes(String(value))) out.push('base32');
  return [...new Set(out)];
}
function leaksIn(text, value) {
  const t = String(text || ''), v = String(value), out = [];
  if (t.includes(v)) out.push('raw');
  for (let i = 0; i + 10 <= v.length; i++) if (t.includes(v.slice(i, i + 10))) { out.push('raw-window@' + i); break; }
  const pct = (x) => { try { return Buffer.from(x.replace(/%([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'); } catch { return ''; } };
  if (pct(t).includes(v) || pct(t.replace(/\+/g, '%20')).includes(v)) out.push('percent');   // a form's `+` for a space too
  for (const m of t.matchAll(/[A-Za-z0-9+/_-]{12,}={0,2}/g)) for (let k = 0; k < 4; k++) for (const enc of ['base64', 'base64url']) { const d = Buffer.from('A'.repeat(k) + m[0], enc).toString('utf8'); if (d.includes(v)) { out.push('base64'); break; } }
  for (const m of t.matchAll(/[0-9A-Fa-f]{16,}/g)) for (const k of [0, 1]) { const s = m[0].slice(k); const d = Buffer.from(s.slice(0, s.length - (s.length % 2)), 'hex').toString('utf8'); if (d.includes(v)) out.push('hex'); }
  for (const m of t.matchAll(/"(?:[^"\\\n]|\\.)*"/g)) { try { if (String(JSON.parse(m[0])).includes(v)) out.push('json'); } catch { } }
  return [...new Set(out)];
}
ok(!!(leaks('a ' + VALUE + ' b', VALUE).length && leaks(Buffer.from(VALUE).toString('base64'), VALUE).includes('base64') && !leaks('[vault:mounts/m1/secretKey]', VALUE).length), 'THE ORACLE (independent of the scrubber) finds the value raw and in base64 — and nothing in a placeholder');

// ── A WORLD (test-vault-run's): a real engine (set up, unlocked), the real For-you store, the one store row these legs run ──
const ROWS = {
  mounts: [{ entry: 'm1', field: 'secretKey', label: 'my bucket', cipher: 'x'.repeat(60), v: VALUE }],
};
const sourceOf = (store) => ({ vaultRows: () => ROWS[store].map(({ v, ...r }) => r), vaultReveal: (e, f) => { const r = ROWS[store].find((x) => x.entry === e && x.field === f); return r ? r.v : null; } });
const CALLER = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane X', cwd: null };
let worldN = 0;
async function world({ instance = 'local', killGraceMs = 400, askMs = null, lateMs = null, doorMod = DOOR, setup = true, pipeGraceMs = 300, doorExtra = {} } = {}) {   // doorExtra: the door's own seams (its scrubber worker's file, figures, silence bound)
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false });
  if (setup) await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const logs = [];
  const timerLog = [];   // every bound the door set (ms) — a bound is proven by the timer the door armed, never by a wall clock
  const timers = { set: (fn, ms) => { timerLog.push(ms); return setTimeout(fn, askMs != null && ms === VR.ASK_TTL_MS ? askMs : lateMs != null && ms === DOOR.LATE_TTL_MS ? lateMs : ms); }, clear: (h) => clearTimeout(h) };
  const gone = new Set();
  const mk = (mod = doorMod, extra = {}) => mod.create({ dataDir, vault, userTodos, sources: Object.fromEntries(Object.keys(ROWS).map((s) => [s, () => sourceOf(s)])), instanceKind: () => instance,
    runRoot: () => runRoot, home: SUITE_HOME, tmpDir: SUITE_TMP, agentEnv: () => ({ ...SUITE_ENV, PATH: BIN + ':' + SUITE_ENV.PATH }), killGraceMs, pipeGraceMs, timers, liveOf: (cid) => !gone.has(cid), log: (m) => logs.push(String(m)), isRootOwned: isRootOwnedTest, ...extra });   // round 10: extra deps (a capturing spawnImpl, a PATH-with-a-writable-head agentEnv) for the spawn-env seal test
  const door = mk(doorMod, doorExtra);
  return { dir, dataDir, work, runRoot, vault, userTodos, door, logs, gone, mk, timerLog, caller: { ...CALLER, cwd: work } };
}
const cardsOf = (w) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-run-ask');
async function waitCard(w, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { const c = cardsOf(w); if (c.length) return c[c.length - 1]; await sleep(5); } return null; }
/** A run whose card (if one comes) is answered `answer`. → { r, card, a } */
async function runAnswered(w, args, { answer = 'once', reauthed = false, door = w.door, caller = w.caller, cwd = w.work, ttl } = {}) {
  let settled = false;
  const p = door.run({ caller, args, cwd }).then((r) => { settled = true; return r; });
  let card = null;
  const t = Date.now();
  while (!settled && Date.now() - t < 3000) { const c = cardsOf(w); if (c.length) { card = c[c.length - 1]; break; } await sleep(5); }
  if (answer === null) return { r: p, card, a: null };   // the caller answers (or not) itself — `r` is the pending run
  let a = null;
  if (card && answer) a = door.answer(card.action.askId, { answer, reauthed, ...(ttl ? { ttl } : {}) });
  return { r: await p, card, a };
}
const openRow = (w, id = 'mounts:m1#secretKey') => w.door.setRunnable({ id, on: true, reauthed: true });
const ENV = (mode, ...rest) => ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, mode, ...rest];
const auditOf = (w) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8'); } catch { return ''; } };
const runLines = (w) => auditOf(w).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === 'vault-run');
const PH1 = '[vault:mounts/m1/secretKey]';
const SRCD = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), SRCW = fs.readFileSync(path.join(REPO, 'src/server/vault-run-scrub-worker.js'), 'utf8');
const doorCopy = (from, to, tag) => M.load('src/server/vault-run-door.js', (Array.isArray(from) ? from : [[from, to]]).reduce((t, [f, x], k) => anchored(t, f, x, `${tag} (${k + 1})`), SRCD), tag.replace(/\W+/g, '-'));   // one edit, or a list of [from, to] pairs
const workerCopy = (from, to, tag) => M.write('src/server/vault-run-scrub-worker.js', anchored(SRCW, from, to, tag), tag.replace(/\W+/g, '-'));

console.log('THE SCAN OFF THE LOOP — one scrubber worker a run (主开发 r1505 / r1573 / r1919 / r2161; its own row since r2322)');
// THE SCAN OFF THE LOOP (lane lg-vault-file, 主开发 r1505 / r1573): ONE SCRUBBER WORKER A RUN — the masker never runs on the
// hub's loop; a worker that dies or keeps silent past its bound withholds by name, never raw; one that cannot start refuses the run
// before the child spawns; the bound is on silence, not on a lawful run's work; what is posted and not answered is bounded by the
// run's output cap; the output is the loop masker's byte for byte; no worker outlives its run. r1919's follow: a lock sees a run until
// its worker has ended; an answer that cannot be written after the child ran keeps its once-grant spent; the CLI says the command ran.
{
  const worlds = [];
  const W = async (o = {}) => { const w = await world(o); openRow(w); worlds.push(w); return w; };
  // (0) THE COST OF A RUN'S WORKER (主开发 r2322: the figure the kb names) — a READING, never judged (a fast suite holds no wall-clock
  // bound): nine starts of the door's own scrubber worker, each from `new Worker` to its «ready» (what every run now waits for before
  // its child spawns), the median and the slowest printed; each worker is closed at once (it never held a value)
  {
    const wc = await W(), took = [];
    for (let i = 0; i < 9; i++) { const t1 = performance.now(); const sc = await wc.door._startScrub(); took.push(performance.now() - t1); if (sc && typeof sc.close === 'function') sc.close(); }
    took.sort((x, y) => x - y);
    console.log(`    judged — a run's worker start and its ready wait (the door's startScrub, nine starts): median ${took[4].toFixed(1)} ms, slowest ${took[8].toFixed(1)} ms — a reading, never judged`);
  }
  // (1) THE LOOP IS NOT HELD: a costly output (300 KB of soft breaks the QP view holds, each turn rescanning the hold, under a
  // planted turn's figure of 2^27) — the main thread builds no masker and runs no scan; a 5 ms timer reads the loop's longest gap
  const costly = async (doorMod) => {
    const w = await W({ doorMod, doorExtra: { scrubSteps: { push: 2 ** 27, run: 2 ** 40 }, scrubSilenceMs: 120000 } });   // this leg judges the loop, not silence (the read's #13)
    const real = VR.createRunMasker; let made = 0; VR.createRunMasker = (...a) => { made++; return real(...a); };
    let last = performance.now(), gap = 0; const tick = setInterval(() => { const t = performance.now(); if (t - last > gap) gap = t - last; last = t; }, 5);
    let r = null; try { ({ r } = await runAnswered(w, ENV('soft'))); } finally { clearInterval(tick); VR.createRunMasker = real; }
    return { ok: !!(r && r.ok), made, gap: Math.round(gap), done: /done/.test((r && r.stdout) || ''), leaks: leaks(((r && r.stdout) || '') + ((r && r.stderr) || ''), VALUE).length };
  };
  const LOOP = "try { scrub = await Promise.resolve((() => { let mk = null; const sc = { onOut() { }, stats: { posted: 0, inflight: 0, maxInflight: 0, withheld: 0 }, give(sec) { mk = VR.createRunMasker(sec, ['out', 'err'], scrubSteps ? { steps: scrubSteps } : {}); }, push(k, t) { if (t) sc.onOut(mk.push(k, t)); }, end(cut) { const o = mk.end(cut); return Promise.resolve({ out: o.out, err: o.err, counts: { hits: mk.hits, bytes: mk.bytes, byForm: mk.byForm, over: mk.over, withheld: mk.withheld }, lost: false }); }, close() { } }; return sc; })()); }";
  const loopDoor = doorCopy('try { scrub = await startScrub(); }', LOOP, 'the scan on the loop');
  const c1 = await costly(DOOR), c0 = await costly(loopDoor);
  console.log(`    judged — the loop while a costly output is scrubbed (300 KB of held soft breaks): in its worker the main thread built ${c1.made} masker(s), its longest gap ${c1.gap} ms; on the loop (the control) ${c0.made}, ${c0.gap} ms`);
  ok(c1.ok && c1.done && c1.leaks === 0 && c1.made === 0 && c0.made === 1, `THE LOOP IS NOT HELD: the run's scrubber is its worker's — the main thread built no masker and ran no scan (${c1.made}; the scan on the loop builds ${c0.made}); the loop's longest gaps are printed above as a reading, never judged here (a fast suite holds no wall-clock bound); red control: «the scan on the loop» (the masker built on the main thread)`, { c1, c0 });
  // (2) BYTE FOR BYTE: the run's worker against the masker on the loop, the same pieces on two pipes interleaved at seeded
  // points — a run that ends on its own, one CUT, one past a planted turn's figure («over») — the output and every count
  const seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const b = Buffer.from(VALUE), spell = [VALUE, b.toString('base64'), b.toString('hex'), JSON.stringify({ k: VALUE }), encodeURIComponent(VALUE)];
  const MODES = [['end', null], ['cut', null], ['over', { push: 3000, run: 2 ** 40 }]];
  const byteForByte = async (modes, workerFile = null) => {   // → the runs that differ (a worker copy for the red controls of r1919 (6))
    const rnd = seeded(1573), differ = [];
    for (const [mode, steps] of modes) {
      const wd = await W({ doorExtra: { ...(steps ? { scrubSteps: steps } : {}), ...(workerFile ? { scrubWorkerFile: workerFile } : {}) } });
      for (let i = 0; i < 3; i++) {
        let text = ''; for (let l = 0; l < 6; l++) text += rnd() < 0.5 ? `line ${l} ${'x'.repeat(Math.floor(rnd() * 60))}\n` : spell[Math.floor(rnd() * spell.length)] + '\n';
        text += mode === 'cut' ? spell[Math.floor(rnd() * spell.length)].slice(0, 9) : '';
        const pieces = []; for (let at = 0; at < text.length;) { const n = 1 + Math.floor(rnd() * 80); pieces.push([rnd() < 0.7 ? 'out' : 'err', text.slice(at, at + n)]); at += n; }
        const secrets = [{ label: 'mounts/m1/secretKey', value: VALUE }];
        const ref = VR.createRunMasker(secrets, ['out', 'err'], steps ? { steps } : {}), want = { out: '', err: '' };
        for (const [k, t] of pieces) { const o = ref.push(k, t); want.out += o.out; want.err += o.err; }
        { const o = ref.end(mode === 'cut'); want.out += o.out; want.err += o.err; }
        const sc = await wd.door._startScrub(), got = { out: '', err: '' }; sc.give(secrets);
        sc.onOut = (o) => { got.out += o.out; got.err += o.err; };
        for (const [k, t] of pieces) sc.push(k, t);
        const e = await sc.end(mode === 'cut'); got.out += e.out; got.err += e.err;
        const wc = JSON.stringify({ hits: ref.hits, bytes: ref.bytes, byForm: ref.byForm, over: ref.over, withheld: ref.withheld }), gc = JSON.stringify(e.counts);
        if (got.out !== want.out || got.err !== want.err || wc !== gc || (mode === 'over' && !ref.over)) differ.push({ mode, i, want: wc, got: gc, over: ref.over });   // the read's #17: «past the figure» is met, or the run is no proof of it
      }
    }
    return differ;
  };
  const differ = await byteForByte(MODES);
  console.log(`    judged — the worker against the masker on the loop: 9 runs (3 ending on their own, 3 cut, 3 past a planted figure), ${differ.length} differ`);
  ok(differ.length === 0, `BYTE FOR BYTE: the run's worker hands on what the masker on the loop hands on — the output and every count, ending on its own, at a cut and past the figure («over», met in each), two pipes interleaved: ${differ.length} of 9 differ; red control: «the worker drops the planted figures»`, differ.slice(0, 2));
  {
    const noSteps = workerCopy("msg.steps ? { steps: msg.steps } : {}", "{}", 'the worker drops the planted figures');
    const wd = await W({ doorExtra: { scrubWorkerFile: noSteps, scrubSteps: { push: 3000, run: 2 ** 40 } } }), secrets = [{ label: 'mounts/m1/secretKey', value: VALUE }];
    const text = Array.from({ length: 8 }, (_, l) => spell[l % spell.length] + '\n').join(''), ref = VR.createRunMasker(secrets, ['out', 'err'], { steps: { push: 3000, run: 2 ** 40 } }), want = { out: '', err: '' };
    for (let at = 0; at < text.length; at += 40) { const o = ref.push(at % 80 ? 'err' : 'out', text.slice(at, at + 40)); want.out += o.out; want.err += o.err; }
    { const o = ref.end(false); want.out += o.out; want.err += o.err; }
    const sc = await wd.door._startScrub(), got = { out: '', err: '' }; sc.give(secrets); sc.onOut = (o) => { got.out += o.out; got.err += o.err; };
    for (let at = 0; at < text.length; at += 40) sc.push(at % 80 ? 'err' : 'out', text.slice(at, at + 40));
    const e = await sc.end(false); got.out += e.out; got.err += e.err;
    ok(ref.over && (got.out !== want.out || got.err !== want.err || !!e.counts.over !== ref.over), 'MUTANT «the worker drops the planted figures»: the leg goes RED — the loop\'s masker went over its figure, the worker did not', { refOver: ref.over, workerOver: e.counts.over });
  }
  {   // r1919 (6): THE END AND CUT MODES each go RED on a worker that breaks them — its end drops the last text; its end never cuts
    const dropEnd = workerCopy("if (msg.type === 'end') { const o = m.end(!!msg.cut); parentPort.postMessage({ type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); }", "if (msg.type === 'end') { const o = m.end(!!msg.cut); parentPort.postMessage({ type: 'end', seq: msg.seq, out: '', err: '', counts: counts() }); }", 'the worker\'s end drops its last text');
    const noCut = workerCopy('const o = m.end(!!msg.cut);', 'const o = m.end(false);', 'the worker\'s end never cuts');
    const dE = await byteForByte([MODES[0]], dropEnd), dC = await byteForByte([MODES[1]], noCut);
    ok(dE.length > 0 && dC.length > 0, `MUTANTS «the worker's end drops its last text» (the runs ending on their own) and «the worker's end never cuts» (the cut runs): each mode's leg goes RED — ${dE.length} of 3 and ${dC.length} of 3 differ`, { dE: dE.slice(0, 1), dC: dC.slice(0, 1) });
  }
  // (3) A LOST WORKER WITHHOLDS BY NAME: a worker that dies at its third piece; one that keeps silent from its third piece past a
  // planted bound of 300 ms — the output after it under the cut's placeholder with the words, nothing of the value, the record's field
  const lostLeg = async (doorMod, workerFile, silenceMs = 10000) => {
    const w = await W({ doorMod, doorExtra: { scrubWorkerFile: workerFile, scrubSilenceMs: silenceMs } });
    const { r } = await runAnswered(w, ENV('env'));
    const ran = runLines(w).find((x) => x.outcome === 'ran'), out = (r && (r.stdout || '') + (r.stderr || '')) || '';
    const why = ((w.logs.find((l) => /the run's scrubber stopped \(/.test(l)) || '').match(/stopped \((\w+)\)/) || [])[1] || null;   // what the door named the loss
    return { ok: !!(r && r.ok), said: out.includes('(scrub_worker_gone)]'), ph: out.includes('[vault:…]'), leaks: leaks(out, VALUE).length, answer: r && r.scrubbed ? r.scrubbed.withheld : null, line: ran && ran.scrubbed ? ran.scrubbed.withheld : null, live: w.door.scrubLive(), why };
  };
  const dies = workerCopy("if (msg.type === 'push') { const o = m.push(msg.stream, msg.text);", "if (msg.type === 'push') { if (msg.seq >= 3) process.exit(7); const o = m.push(msg.stream, msg.text);", 'the worker dies at its third piece');
  const mute = workerCopy("if (msg.type === 'push') { const o = m.push(msg.stream, msg.text);", "if ((msg.type === 'push' || msg.type === 'end') && msg.seq >= 3) return; if (msg.type === 'push') { const o = m.push(msg.stream, msg.text);", 'the worker keeps silent from its third piece, its end too');   // r1919 (6): caught by the silence bound itself
  const muteEnd = workerCopy("if (msg.type === 'push') { const o = m.push(msg.stream, msg.text);", "if (msg.type === 'push') { if (msg.seq >= 3) return; const o = m.push(msg.stream, msg.text);", 'the worker keeps silent from its third piece and answers its end');
  const lostOk = (x) => x.ok && x.said && x.ph && x.leaks === 0 && x.answer === 'scrub_worker_gone' && x.line === 'scrub_worker_gone' && x.live === 0;
  const buildFails = workerCopy("try { m = VR.createRunMasker(", "try { throw Object.assign(new Error('planted'), { code: 'planted' }); m = VR.createRunMasker(", 'the worker refuses its build');
  // r1919 (6): + a reply out of order (the second held back, sent after the third) and a throw inside the masker's push (its third)
  const outOfOrder = workerCopy("parentPort.postMessage({ type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); return; }", "const r = { type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }; if (msg.seq === 2) { globalThis.h2 = r; return; } parentPort.postMessage(r); if (msg.seq === 3 && globalThis.h2) parentPort.postMessage(globalThis.h2); return; }", 'the worker answers its second piece after its third');
  const pushThrows = workerCopy("try { m = VR.createRunMasker(valuesOf(msg.secrets), ['out', 'err'], msg.steps ? { steps: msg.steps } : {}); }", "try { m = VR.createRunMasker(msg.secrets, ['out', 'err'], msg.steps ? { steps: msg.steps } : {}); const mm = m, p0 = m.push; let n = 0; m.push = (k, t) => { if (++n >= 3) throw new Error('planted: a throw inside the masker push'); return p0.call(mm, k, t); }; }", 'the masker\'s push throws at its third piece');
  const ld = await lostLeg(DOOR, dies), lm = await lostLeg(DOOR, mute, 300), lme = await lostLeg(DOOR, muteEnd, 300), lb = await lostLeg(DOOR, buildFails), lo = await lostLeg(DOOR, outOfOrder), lt = await lostLeg(DOOR, pushThrows);
  ok([ld, lm, lme, lb, lo, lt].every(lostOk) && ld.why === 'exit' && lm.why === 'silent' && ['order', 'silent'].includes(lme.why) && lo.why === 'order' && ['error', 'exit'].includes(lt.why), `A LOST WORKER WITHHOLDS BY NAME: a worker that died at its third piece (${ld.why}); one silent from its third piece, its end too, caught by THE SILENCE BOUND ITSELF (${lm.why}); one silent from its third piece that answers its end while pieces are owed (${lme.why}); one whose build of the run's masker threw; one that answered its second piece after its third (${lo.why}); one whose masker's push threw (${lt.why}) — the output after it under the cut's placeholder with «(scrub_worker_gone)», nothing of the value, the answer and the audit line \`withheld: 'scrub_worker_gone'\`, no worker left; red control: «a lost worker answered as an empty end»`, { ld, lm, lme, lb, lo, lt });
  const silentDrop = doorCopy("const lossOut = () => ({ out: SCRUB_CUT_PH, err: SCRUB_GONE_WORDS, counts: { ...last, hits: last.hits + 1 }, lost: true });", "const lossOut = () => ({ out: '', err: '', counts: last, lost: false });", 'a lost worker answered as an empty end');
  const lx = await lostLeg(silentDrop, dies);
  ok(!lostOk(lx), 'MUTANT «a lost worker answered as an empty end»: the patch hits once and the leg goes RED — the stretch vanished unsaid, the record silent; the shipped door withholds it by name', lx);
  const early = await lostLeg(doorCopy("if (msg.seq !== seq + 1 || answered !== seq) { lose('order'); return; }", "if (msg.seq !== seq + 1) { lose('order'); return; }", 'an end taken before every piece was answered'), muteEnd, 300);
  ok(!lostOk(early) && early.leaks > 0, `MUTANT «an end taken before every piece was answered»: the patch hits once and the leg goes RED — the silent worker's end was taken as the run's, and its held half value went out (${early.leaks} leak(s)); the shipped door counts it a loss`, early);
  // (4) THE BOUND IS ON SILENCE, not on work: a worker that answers every piece 40 ms after the last (a lawful slow run, ten pieces,
  // about 440 ms in all) under a bound of 300 ms is never withheld; red control: the bound armed once and never reset (a bound on the
  // whole run) — the whole run outlasts the bound, each gap does not, so the control still bites (主开发 r2322: the pace and bound halved)
  const slow = workerCopy("if (msg.type === 'push') { const o = m.push(msg.stream, msg.text); parentPort.postMessage({ type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); return; }\n  if (msg.type === 'end') { const o = m.end(!!msg.cut); parentPort.postMessage({ type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); }",
    "if (msg.type === 'push') { const o = m.push(msg.stream, msg.text), r = { type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }; globalThis.q = (globalThis.q || Promise.resolve()).then(() => new Promise((ok) => setTimeout(ok, 40))).then(() => parentPort.postMessage(r)); return; }\n  if (msg.type === 'end') { const o = m.end(!!msg.cut), r = { type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }; globalThis.q = (globalThis.q || Promise.resolve()).then(() => new Promise((ok) => setTimeout(ok, 40))).then(() => parentPort.postMessage(r)); }", 'the worker answers 40 ms after its last answer');
  const slowLeg = async (doorMod) => { const w = await W({ doorMod, doorExtra: { scrubWorkerFile: slow, scrubSilenceMs: 300 } }); const { r } = await runAnswered(w, ENV('drip')); const out = (r && (r.stdout || '') + (r.stderr || '')) || ''; return { ok: !!(r && r.ok), lost: out.includes('(scrub_worker_gone)]'), masked: out.includes(PH1) }; };
  const s1 = await slowLeg(DOOR), s0 = await slowLeg(doorCopy([["sc.onOut({ out: msg.out, err: msg.err }); arm(); return;", "sc.onOut({ out: msg.out, err: msg.err }); return;"], ["if (heard === at && owed()) lose(started ? 'silent' : 'start'); else arm();", "if (owed()) lose(started ? 'silent' : 'start'); else arm();"]], null, 'the bound armed once, never reset'));
  ok(s1.ok && !s1.lost && s1.masked && s0.lost, `THE BOUND IS ON SILENCE, NOT ON WORK: a worker answering each of ten pieces 40 ms after the last (about 440 ms in all) under a bound of 300 ms is never withheld and masks the value; red control: «the bound armed once, never reset» withholds it`, { s1, s0 });
  // (5) A WORKER THAT CANNOT START refuses the run by name before the child spawns (its build planted to fail; no worker file at all)
  const refusedW = workerCopy("parentPort.postMessage({ type: 'ready' });", "parentPort.postMessage({ type: 'refused', code: 'planted' });", 'the worker refuses at its start');
  const startLeg = async (workerFile, silenceMs = 10000) => { const w = await W({ doorExtra: { scrubWorkerFile: workerFile, scrubSilenceMs: silenceMs } }); const ranF = path.join(w.work, 'ran.txt'); const { r } = await runAnswered(w, ENV('ran', ranF)); const line = runLines(w).find((x) => x.outcome === 'spawn_failed'); return { code: r && r.code, why: r && r.why, spawned: fs.existsSync(ranF), line: !!line, lineWhy: line ? line.why : null, live: w.door.scrubLive() }; };
  const neverReady = workerCopy("parentPort.postMessage({ type: 'ready' });", "", 'the worker never says ready');   // r1919 (6)
  const f1 = await startLeg(refusedW), f2 = await startLeg(path.join(M.dir, 'no-such-worker.js')), f3 = await startLeg(neverReady, 300);
  ok([f1, f2, f3].every((x) => x.code === 'spawn_failed' && /scrubber could not start/.test(String(x.why)) && !x.spawned && x.line && x.live === 0) && /scrubber_start/.test(String(f3.lineWhy)), 'A WORKER THAT CANNOT START refuses the run by name (spawn_failed: the scrubber could not start) before the child spawns — it refused at its start, there is no worker file, or it never says ready (its silence bound at the start: «scrubber_start» on the line) — and no worker is left', { f1, f2, f3 });
  // (6) WHAT IS POSTED AND NOT YET ANSWERED is bounded by the run's output cap: a 3 MiB flood
  const holdAll = workerCopy("if (msg.type === 'push') { const o = m.push(msg.stream, msg.text); parentPort.postMessage({ type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); return; }\n  if (msg.type === 'end') {", "if (msg.type === 'push') { const o = m.push(msg.stream, msg.text); (globalThis.held = globalThis.held || []).push({ type: 'out', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); return; }\n  if (msg.type === 'end') { for (const r of globalThis.held || []) parentPort.postMessage(r);", 'the worker holds every answer until the end');
  const floodLeg = async (doorMod) => { const wf = await W({ doorMod, doorExtra: { scrubWorkerFile: holdAll } }); const big = await runAnswered(wf, ENV('big')); return { ok: !!(big.r && big.r.ok), truncated: !!(big.r && big.r.truncated), leaks: leaks(((big.r && big.r.stdout) || '').slice(-2000), VALUE).length, ...wf.door.lastScrubStats() }; };
  const f6 = await floodLeg(DOOR), f60 = await floodLeg(doorCopy('const text = dec[k].write(b);', 'const text = dec[k].write(buf);', 'the read posted before the cap\'s cut'));
  ok(f6.ok && f6.truncated && f6.leaks === 0 && f6.maxInflight > VR.OUTPUT_MAX_BYTES / 2 && f6.posted <= VR.OUTPUT_MAX_BYTES && f6.maxInflight <= VR.OUTPUT_MAX_BYTES && f60.posted > VR.OUTPUT_MAX_BYTES, `WHAT IS POSTED AND NOT ANSWERED IS BOUNDED BY THE RUN'S CAP: a 3 MiB flood to a worker that answers nothing until the end — ${f6.maxInflight} characters at most unanswered at once, ${f6.posted} posted in all (the cap ${VR.OUTPUT_MAX_BYTES} bytes); red control: «the read posted before the cap's cut» posts ${f60.posted}`, { f6, f60 });
  // r1919 (1): THE LOCK SEES A RUN UNTIL ITS WORKER HAS ENDED — a worker that answers its end 400 ms late; a lock in that wait
  // finds the run (still counted), ends its worker and the run answers the lock's own line; red control: the run out of the walk at its child's end
  const endWaitLeg = async (doorMod, tag) => {
    const mark = path.join(ROOT, `endwait-${tag}.txt`);
    const wf = workerCopy("if (msg.type === 'end') { const o = m.end(!!msg.cut); parentPort.postMessage({ type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); }",
      `if (msg.type === 'end') { const o = m.end(!!msg.cut), r = { type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }; require('fs').writeFileSync(${JSON.stringify(mark)}, '1'); setTimeout(() => parentPort.postMessage(r), 400); }`, `the worker answers its end 400 ms late (${tag})`);
    const w = await W({ doorMod, doorExtra: { scrubWorkerFile: wf } });
    const p = runAnswered(w, ENV('env'));
    for (let k = 0; k < 300 && !fs.existsSync(mark); k++) await sleep(10);
    const waited = fs.existsSync(mark), counted = w.door.running();
    w.door.onLocked('test');
    const { r } = await p;
    const line = runLines(w).pop();
    return { waited, counted, ok: !!(r && r.ok), code: r && r.code, line: line && line.outcome, killed: line ? line.killed : null, withheld: line && line.scrubbed ? line.scrubbed.withheld : null, leaks: leaks(JSON.stringify(r || {}) + JSON.stringify(line || {}), VALUE).length,
      ranSaid: !!(r && r.ran === true && /the command RAN to its end before the lock — do not run it again blindly/.test(String(r.words)) && /on this instance's page/.test(String(r.words))), receipt: !!(r && r.receipt && line && line.receipt === r.receipt) };   // r2161 (c): the words say the command RAN; its receipt reaches the caller
  };
  const e1 = await endWaitLeg(DOOR, 'shipped'), e0 = await endWaitLeg(doorCopy('done = true; rec.done = true;', 'done = true; rec.done = true; runs.delete(rec);', 'the run leaves the lock\'s walk at its child\'s end'), 'control');
  const eR = await endWaitLeg(doorCopy('const ranFirst = stoppedAt !== \'lock\';', 'const ranFirst = false;', 'the lock after the run says only that a run waits'), 'ransaid');
  ok(e1.ranSaid && e1.receipt && !eR.ranSaid, `r2161 (c) A LOCK AFTER A FINISHED CHILD SAYS THE COMMAND RAN: its words «the command RAN to its end before the lock — do not run it again blindly» (still where a person unlocks it), \`ran: true\` and its receipt (the line's); red control: «the lock after the run says only that a run waits»`, { e1: { ranSaid: e1.ranSaid, receipt: e1.receipt }, eR: { ranSaid: eR.ranSaid, code: eR.code } });
  ok(e1.waited && e1.counted === 1 && e1.code === 'vault_locked' && e1.line === 'vault_locked' && e1.killed === false && e1.withheld === 'scrub_worker_gone' && e1.leaks === 0 && e0.waited && e0.counted === 0 && e0.ok,
    `r1919 (1) THE LOCK SEES A RUN UNTIL ITS WORKER HAS ENDED: its child gone, its worker still answering the end — the run is counted (${e1.counted}), the lock ends its worker and the run answers vault_locked (the line: not killed, its output withheld by name, nothing of the value); red control: «the run leaves the lock's walk at its child's end» (counted ${e0.counted}, answered ${e0.ok ? 'ran' : e0.code})`, { e1, e0 });
  // r2161 (b): THE CLOSE OF ALL RUNS SIGNALS ONLY A CHILD IT STILL HOLDS — the hub's closeAll lands while a run's child has ended and
  // its worker still answers the end: no group signal, no end-mark sweep (process.kill counted while closeAll runs); red control: the walk with no skip
  const closeLeg = async (doorMod, tag) => {
    const mark = path.join(ROOT, `closewait-${tag}.txt`);
    const wf = workerCopy("if (msg.type === 'end') { const o = m.end(!!msg.cut); parentPort.postMessage({ type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }); }",
      `if (msg.type === 'end') { const o = m.end(!!msg.cut), r = { type: 'end', seq: msg.seq, out: o.out, err: o.err, counts: counts() }; require('fs').writeFileSync(${JSON.stringify(mark)}, '1'); setTimeout(() => parentPort.postMessage(r), 400); }`, `the worker answers its end 400 ms late (close ${tag})`);
    const w = await W({ doorMod, doorExtra: { scrubWorkerFile: wf } });
    const p = runAnswered(w, ENV('env'));
    for (let k = 0; k < 300 && !fs.existsSync(mark); k++) await sleep(10);
    const waited = fs.existsSync(mark), realKill = process.kill, sent = [];
    process.kill = (pid, sig) => { sent.push([pid, sig]); return true; };   // counted, never sent (closeAll is synchronous)
    try { w.door.closeAll(); } finally { process.kill = realKill; }
    const { r } = await p;
    return { waited, sent: sent.length, ok: !!(r && r.ok), withheld: r && r.scrubbed ? r.scrubbed.withheld : null };
  };
  const k1 = await closeLeg(DOOR, 'shipped'), k0 = await closeLeg(doorCopy('function closeAll() { for (const rec of [...runs]) { if (rec.done) continue; killGroup(', 'function closeAll() { for (const rec of [...runs]) { killGroup(', 'closeAll signals a run whose child ended'), 'control');   // stale-pins: kept (the replacement IS the release's closeAll)
  ok(k1.waited && k1.sent === 0 && k1.ok && k1.withheld === 'scrub_worker_gone' && k0.waited && k0.sent > 0, `r2161 (b) THE CLOSE OF ALL RUNS SIGNALS ONLY A CHILD IT STILL HOLDS: closeAll while a run's child has ended and its worker answers the end — ${k1.sent} signal(s) sent (no group signal, no end-mark sweep), the run answered with its output withheld by name; red control: «closeAll signals a run whose child ended» sends ${k0.sent}`, { k1, k0 });
  // r1919 (2): A REPLY AFTER THE CHILD RAN NEVER GIVES THE ONCE-GRANT BACK — the run's answer planted to throw after its worker's end:
  // run_unanswered (the command RAN), the grant stays spent, the run line and the use line carry the receipt; red control: the release's catch (spawn_failed, burned)
  const unansweredLeg = async (doorMod) => {
    const w = await world({ doorMod }); worlds.push(w);   // the entry stays CLOSED: the run rides a once-grant
    const caller = { ...w.caller, scope: 'webui-1' };
    const q = w.door.request({ caller, entry: 'vault://mounts/m1/secretKey', purpose: 'the unanswered answer leg' });
    w.door.answerRequest(q.askId, { answer: 'once', reauthed: true });
    const granted = w.door._grants.size, ranF = path.join(w.work, 'ran.txt');
    const { r } = await runAnswered(w, ENV('ran', ranF), { caller });
    const line = runLines(w).pop(), use = (w.door.usesFor(caller).uses || []).find((u) => u.receipt && r && u.receipt === r.receipt);
    return { granted, ran: fs.existsSync(ranF), code: r && r.code, words: r && r.words, receipt: r && r.receipt, left: w.door._grants.size, line: line && line.outcome, lineReceipt: line && line.receipt, use: use ? use.outcome : null };
  };
  const THROW = ['          lastScrub = { ...scrub.stats };', "          lastScrub = { ...scrub.stats }; throw new Error('planted: the answer could not be written');"];
  const u1 = await unansweredLeg(doorCopy([THROW], null, 'the answer cannot be written'));
  const u0 = await unansweredLeg(doorCopy([THROW, [
    "try { note('run_unanswered', { ...head, receipt, why: 'the answer could not be written' }); } catch { }\n          resolve(named('run_unanswered', { receipt }));", "resolve(named('spawn_failed', { why: 'the run could not be answered' }));"]], null, 'the release catch gives the grant back'));   // stale-pins: kept (its replacement IS the release's catch)
  const AUDIT_FAILS = ["    const note = (outcome, extra = {}) => { try { audit('vault-run', { by, outcome, ...extra }); }", "    const note = (outcome, extra = {}) => { try { if (outcome === 'run_unanswered') throw new Error('planted: the audit line fails'); audit('vault-run', { by, outcome, ...extra }); }"];
  const uf1 = await unansweredLeg(doorCopy([THROW, AUDIT_FAILS], null, 'the answer and its audit line cannot be written'));
  const uf0 = await unansweredLeg(doorCopy([THROW, ["    const note = (outcome, extra = {}) => { try { audit('vault-run', { by, outcome, ...extra }); } finally { useLines(outcome, runReceipt, !!extra.receipt); } };", "    const note = (outcome, extra = {}) => { if (outcome === 'run_unanswered') throw new Error('planted: the audit line fails'); audit('vault-run', { by, outcome, ...extra }); useLines(outcome, runReceipt, !!extra.receipt); };"]], null, 'the release note with its audit line failing'));
  ok(uf1.code === 'run_unanswered' && uf1.use === 'run_unanswered' && uf1.left === 0 && uf0.code === 'run_unanswered' && uf0.use === null, `r2161 (f) THE USE LINE OF A CHILD THAT RAN IS WRITTEN EVEN WHEN ITS AUDIT LINE FAILS (the unanswered road, the audit planted to throw): the use line carries the receipt, the grant stays spent; red control: «the release note with its audit line failing» writes none`, { uf1, uf0 });
  ok(u1.granted === 1 && u1.ran && u1.code === 'run_unanswered' && /RAN/.test(String(u1.words)) && !!u1.receipt && u1.left === 0 && u1.line === 'run_unanswered' && u1.lineReceipt === u1.receipt && u1.use === 'run_unanswered' && u0.ran && u0.code === 'spawn_failed' && u0.left === 1,
    `r1919 (2) A REPLY AFTER THE CHILD RAN NEVER GIVES THE ONCE-GRANT BACK: an answer that could not be written is run_unanswered («the command RAN…»), outside BURNED — the once-grant stays spent (${u1.left} left), the run line and the use line carry its receipt; red control: «the release catch gives the grant back» (spawn_failed: ${u0.left} grant back)`, { u1, u0 });
  // r2161 (a): A ONCE-GRANT NEVER COMES BACK FOR A CHILD THAT RAN, on the older road too — the child's 'error' event after its pid
  // exists (the kill fallback can emit one) is no spawn failure: the run answers its end, the grant stays spent; red control: the release's handler
  const lateErrLeg = async (doorMod) => {
    const spawnLate = (...a) => { const c = require('node:child_process').spawn(...a); if (c.pid) setImmediate(() => c.emit('error', Object.assign(new Error('planted: an error after the spawn'), { code: 'EPLANTED' }))); return c; };
    const w = await world({ doorMod, doorExtra: { spawnImpl: spawnLate } }); worlds.push(w);
    const caller = { ...w.caller, scope: 'webui-1' };
    const q = w.door.request({ caller, entry: 'vault://mounts/m1/secretKey', purpose: 'the late error leg' });
    w.door.answerRequest(q.askId, { answer: 'once', reauthed: true });
    const ranF = path.join(w.work, 'ran.txt');
    const { r } = await runAnswered(w, ENV('ran', ranF), { caller });
    return { ran: fs.existsSync(ranF), ok: !!(r && r.ok), code: r && r.code, left: w.door._grants.size, line: (runLines(w).pop() || {}).outcome, said: w.logs.some((l) => /the child's error after its spawn \(EPLANTED\)/.test(l)) };
  };
  const la1 = await lateErrLeg(DOOR);
  const la0 = await lateErrLeg(doorCopy("child.on('error', (e) => { const why = String((e && e.code) || (e && e.message) || 'spawn').slice(0, 80); if (!child.pid) { spawnError = why; finish(null, null); } else { try { log(", "child.on('error', (e) => { const why = String((e && e.code) || (e && e.message) || 'spawn').slice(0, 80); spawnError = why; if (!child.pid) { finish(null, null); } else { try { log(", 'any child error is the spawn\'s'));
  ok(la1.ran && la1.ok && la1.left === 0 && la1.line === 'ran' && la1.said && la0.ran && la0.code === 'spawn_failed' && la0.left === 1, `r2161 (a) A ONCE-GRANT NEVER COMES BACK FOR A CHILD THAT RAN: a child 'error' event after its pid is said in the journal and the run answers its end (ran, the grant spent: ${la1.left} left); red control: «any child error is the spawn's» answers spawn_failed and gives the grant back (${la0.left})`, { la1, la0 });
  // r2161 (e): A START REFUSED WHILE THE VAULT LOCKS writes the blocked record, as its sibling branch does; red control: the branch without it
  const lockStartLeg = async (doorMod) => {
    const w = await W({ doorMod, doorExtra: { scrubWorkerFile: neverReady, scrubSilenceMs: 300 } });   // r2322: the start bound halved (the lock lands as soon as the worker is made)
    const p = runAnswered(w, ENV('env'));
    for (let k = 0; k < 300 && w.door.scrubThreads() < 1; k++) await sleep(5);
    const started = w.door.scrubThreads() >= 1; w.vault.lock('test');
    const { r } = await p;
    return { started, code: r && r.code, blocked: w.vault.blockedSummary().actors.some((a) => a.verbs.includes('vibespace-vault run')) };
  };
  const ls1 = await lockStartLeg(DOOR), ls0 = await lockStartLeg(doorCopy("if (lockGen !== lg0 || vaultState() !== 'unlocked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } note('vault_locked', head); return named('vault_locked'); } note('spawn_failed'", "if (lockGen !== lg0 || vaultState() !== 'unlocked') { note('vault_locked', head); return named('vault_locked'); } note('spawn_failed'", 'the refused start under a lock records no block'));   // stale-pins: kept (the replacement IS the release's branch)
  ok(ls1.started && ls1.code === 'vault_locked' && ls1.blocked && ls0.started && ls0.code === 'vault_locked' && !ls0.blocked, `r2161 (e) A START REFUSED WHILE THE VAULT LOCKS answers vault_locked and writes the blocked record (the owner's list of who the lock stopped names the run); red control: «the refused start under a lock records no block»`, { ls1, ls0 });
  // r1919 (3): THE CLI SAYS THE COMMAND RAN when its output is withheld — the words from its ONE table (data/bin/vibespace-vault
  // RUN_SAID), a cause it does not know yet said without it; red control: the release's sentence (it never said the command ran)
  const cliSays = async (cli, withheld, body = null) => {   // body: the answer itself (a refusal), else a ran answer withheld by `withheld`
    const srv = require('node:http').createServer((q, s) => { q.resume(); q.on('end', () => { s.setHeader('Content-Type', 'application/json'); s.end(JSON.stringify(body || { ok: true, exit: 0, stdout: '', stderr: '', scrubbed: { hits: 1, bytes: 1, withheld }, receipt: 'rcpt-leg' })); }); });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    try {
      const p = require('node:child_process').spawn(NODE, [cli, 'run', '--', 'true'], { env: { ...SUITE_ENV, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'leg-session' }, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = ''; p.stderr.on('data', (c) => { err += c; });
      const rc = await new Promise((ok) => p.on('close', ok));
      return { withheld, rc, err: err.slice(0, 600) };
    } finally { srv.close(); }
  };
  const CLI = path.join(REPO, 'data/bin/vibespace-vault');
  const ranSaid = (x) => x.rc === 0 && /# vibespace-vault run: the command ran; [^\n]*withheld[^\n]* do not run it again blindly/.test(x.err) && (x.withheld === 'a_cause_not_known_yet' ? !x.err.includes(x.withheld) : x.err.includes(`(${x.withheld})`));
  const cs = []; for (const k of ['scrub_worker_gone', 'scrub_work_bound', 'a_cause_not_known_yet']) cs.push(await cliSays(CLI, k));
  const cliOld = M.write('data/bin/vibespace-vault', anchored(fs.readFileSync(CLI, 'utf8'), "scrub_worker_gone: 'the command ran; its scrubber stopped, so the output after the words is withheld (scrub_worker_gone) — do not run it again blindly',", "scrub_worker_gone: 'the scrubber stopped — the output after the words is withheld (scrub_worker_gone)',", 'test-vault-run r1919 (3): the release sentence'), 'the CLI\'s release sentence');
  const co = await cliSays(cliOld, 'scrub_worker_gone');
  // r2161 (c)(d): a REFUSAL of a child that ran — a lock after its end (`ran: true`), an unanswered run — says the command ran and shows its receipt
  const LOCKED_ANS = { ok: false, code: 'vault_locked', error: 'the vault is locked — the command RAN to its end before the lock', killed: false, ran: true, receipt: 'rcpt-lock' }, UNANSWERED = { ok: false, code: 'run_unanswered', error: DOOR.MORE_WORDS.run_unanswered, receipt: 'rcpt-unans' };
  const refSaid = (x, rc) => x.rc === 1 && /the command ran before the lock; [^\n]* do not run it again blindly/.test(x.err) && /# vibespace-vault run: receipt rcpt-lock/.test(x.err) && /# vibespace-vault run: receipt rcpt-unans/.test(rc.err) && /\(run_unanswered\)/.test(rc.err) && rc.rc === 1;
  const cl = await cliSays(CLI, null, LOCKED_ANS), cu = await cliSays(CLI, null, UNANSWERED);
  const cliRel = M.write('data/bin/vibespace-vault', anchored(fs.readFileSync(CLI, 'utf8'), "    if (d.ran === true) console.error(`# vibespace-vault run: ${RUN_SAID.ranLocked}`);   // r2161 (c): the child FINISHED before the lock\n    if (d.receipt) console.error(`# vibespace-vault run: receipt ${d.receipt}`);", '', 'test-vault-run r2161 (c)(d): the release refusal road'), 'the CLI\'s release refusal road');
  const cl0 = await cliSays(cliRel, null, LOCKED_ANS), cu0 = await cliSays(cliRel, null, UNANSWERED);
  ok(refSaid(cl, cu) && !refSaid(cl0, cu0), 'r2161 (c)(d) THE CLI ON A REFUSAL OF A CHILD THAT RAN: a lock after its end says «the command ran before the lock; … — do not run it again blindly», and it and an unanswered run each show their receipt; red control: «the CLI\'s release refusal road»', { cl, cu, cl0 });
  ok(cs.every(ranSaid) && !ranSaid(co), 'r1919 (3) THE CLI SAYS THE COMMAND RAN: a withheld output (the scrubber lost, the work bound, a cause it does not know yet) is said from its one table — «the command ran; … withheld … — do not run it again blindly», the cause by name; red control: «the CLI\'s release sentence»', { cs, co });
  // (7) NO WORKER OUTLIVES ITS RUN: four runs end to end (r2322: four, not twelve), a lock mid-run, a gone caller, the hub's closeAll mid-run — and every world above
  const wn = await W();
  for (let i = 0; i < 4; i++) await runAnswered(wn, ENV('env'));
  const held = async (pid) => { for (let k = 0; k < 500 && !(fs.existsSync(pid) && wn.door.running() === 1); k++) await sleep(10); };   // the child's pid AND the run in `runs` (the read's #16)
  const tmo = await runAnswered(wn, ['--timeout', '1', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', path.join(wn.work, 'tmo.pid')]);
  const tmoLine = runLines(wn).filter((x) => x.outcome === 'ran' && x.timedOut).pop();
  const acG = new AbortController(), pidG = path.join(wn.work, 'gone.pid'), pg = wn.door.run({ caller: wn.caller, args: ENV('sleep', pidG), cwd: wn.work, signal: acG.signal });
  { const cg = await waitCard(wn, 1500); if (cg && cg.status === 'open') wn.door.answer(cg.action.askId, { answer: 'once' }); }   // a new shape asks first: answered, so the child runs
  await held(pidG); acG.abort(); const rgn = await pg;
  const goneLine = runLines(wn).filter((x) => x.outcome === 'caller_gone').pop();
  const pidL = path.join(wn.work, 'lock.pid'), pl = runAnswered(wn, ENV('hang', pidL)); await held(pidL);
  const liveDuring = wn.door.scrubThreads(); wn.door.onLocked('test'); const rl = await (await pl).r;
  const lockLine = runLines(wn).filter((x) => x.outcome === 'vault_locked').pop();
  const pidC = path.join(wn.work, 'close.pid'), pc = runAnswered(wn, ENV('hang', pidC)); await held(pidC);
  const liveClose = wn.door.scrubThreads(); wn.door.closeAll(); await (await pc).r;
  const settle = async (ds, rounds = 200) => { for (let k = 0; k < rounds && ds.some((x) => x.door.scrubThreads() > 0); k++) await sleep(10); return ds.map((x) => x.door.scrubThreads()); };   // a thread's 'exit' comes a few ms after terminate()
  const lefts = await settle(worlds), fields = (l) => !!(l && l.scrubbed && ['hits', 'bytes', 'byForm'].every((k) => k in l.scrubbed));
  ok(!!(liveDuring === 1 && liveClose === 1 && lefts.every((n) => n === 0) && tmo.r && tmo.r.timedOut && rgn.code === 'caller_gone' && rl && rl.code === 'vault_locked' && fields(tmoLine) && fields(goneLine) && fields(lockLine)), `NO WORKER OUTLIVES ITS RUN — its THREAD counted, made and exited: four runs, a timeout, a gone caller, a lock mid-run (each line keeps the record's fields), the hub's closeAll mid-run and every run above — ${lefts.reduce((n, x) => n + x, 0)} threads left over ${worlds.length} doors (one live during each held run); red control: «a worker stopped and never terminated»`, { liveDuring, liveClose, lefts, timeout: tmoLine && tmoLine.scrubbed, gone: goneLine && goneLine.scrubbed, lock: lockLine && lockLine.scrubbed });
  {
    const wl = await world({ doorMod: doorCopy('if (w) { scrubLive.delete(w); try { w.terminate(); } catch { } } };', 'if (w) { scrubLive.delete(w); } };', 'a worker stopped and never terminated') }); openRow(wl);
    await runAnswered(wl, ENV('env'));
    const [n] = await settle([wl], 30);   // r2322: a thread never terminated never exits — 300 ms reads it as well as the 2 s bound did
    ok(n > 0, `MUTANT «a worker stopped and never terminated»: the leg goes RED — ${n} thread(s) left after its run (the door's own list forgot it; the thread count did not)`, n);
  }
}

for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
report();
