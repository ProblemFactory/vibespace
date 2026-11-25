// vault-run-world.mjs — THE ONE WORLD of test-vault-run's three suites (B-54a9 split, 主开发 r3540 / r4355; lane bl-tests-a,
// 2026-11-25): test-vault-run (the door), test-vault-run-grants (⑩, ⑩b) and test-vault-run-seal (⑥b, ⑥c, ⑪, ⑫'s seal) import
// it. Every line below is test-vault-run's own setup, moved word for word: the imports, ok and its counts (live bindings: each
// suite's last line reads them), the fake printer and tools, the oracle, ROWS, world(), the card waits, and the door's patched-
// copy makers (SRCD, doorCopy, workerCopy, SMALL). A suite that imports it builds its own scratch dir, mutant folder and fixtures
// at its load, in its own process.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (rel) => require(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VE = R('src/server/vault-engine.js');
const DOOR = R('src/server/vault-run-door.js');
const VR = R('src/vault-run.js');
const { UserTodoManager, DETAIL_MAX } = R('src/user-todos.js');
const ROOT = scratchDir('vaultrun');   // r1152: never `vault-run` — /tmp/vs-vault-run-… is the vault run door's own folder shape (its start sweep judges it)
// THE SUITE'S OWN HOME AND ENVIRONMENT (主开发 2026-11-19 00:56Z — a suite judges the same under the kit and under a caller's whole
// environment: the kit hands a fresh empty home and a minimal env, the tree's fast tier or a probe the caller's own). Every door this
// suite builds gets SUITE_HOME as its home and SUITE_ENV (+ its PATH) as the agent env — never os.homedir() nor process.env; the
// mark below is the caller's; the leg through world()'s OWN default door proves no run sees it (the printer door's check beside it
// holds by construction — its env is built inline from SUITE_ENV).
const SUITE_HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(SUITE_HOME, 'Downloads'), { recursive: true });
// THE SUITE'S OWN TEMP FOLDER = its scratch root: the scratch root sits under /tmp WHATEVER the caller's TMPDIR says (src/fixture-guard.js
// TMP_ROOTS), while a door's temp folder defaulted to os.tmpdir() — under a caller's own TMPDIR every world's folder fell outside the
// fence (cwd_refused) wherever a leg ran in a folder that is not its caller's project (the throwaway probe's reading, 2026-11-19)
const SUITE_TMP = ROOT;
// …a temp folder only where a leg PINS it: every door world() builds gets SUITE_TMP (a leg may hand its own, B-7f97's privTmp); a door
// built outside world() and the suite's own process (Node's os.tmpdir(): mutant copies, a leg's own mkdtemp) still follow the caller's TMPDIR.
const SUITE_ENV = Object.freeze({ HOME: SUITE_HOME, PATH: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'), TMPDIR: SUITE_TMP, LANG: 'C.UTF-8' });
process.env.VS_SUITE_CALLER_MARK = 'the-caller-env';   // a variable only the CALLER's environment carries
const M = mutantCopies('vaultrun', REPO);   // r1152: its folder /tmp/vs-vaultrun-mut-<pid> (was vs-vault-run-mut-<pid>: a hub's start sweep shredded it mid-run)
const PW = 'the second password of the run suite';
// the values: odd characters every form spells differently ( / + = & " \ and a non-ASCII letter)
const VALUE = 'Vr-S3cret/value+with=odd&chars"\\ü-0123';
const VALUE2 = 'app-login-pass-9876543210';
const VALUE3 = 'account-api-key-value-000111222';
const SHORT = 'abc1234';

// ── THE FAKES: one bin dir first on the child's PATH — a printer (node), a curl (a known tool: «always» is offered) ──
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
const CURL = path.join(BIN, 'curl');
fs.writeFileSync(CURL, `#!/usr/bin/env node\nprocess.stdout.write('curl got ' + process.env.T + '\\n');\n`, { mode: 0o555 });
const WCURL = path.join(ROOT, 'wbin', 'curl');   // the same fake in a folder an agent can write (no «always» for it)
fs.mkdirSync(path.dirname(WCURL), { recursive: true }); fs.copyFileSync(CURL, WCURL); fs.chmodSync(WCURL, 0o755);
fs.chmodSync(BIN, 0o555);   // read-only: the door's programWritable is false for BIN/curl (given back at the end)
const NODE = process.execPath;
// round 10 (BLOCKER 1b): a fake gh in a NON-writable bin (so resolveTool finds it, programWritable is false) and a WRITABLE dir
// FIRST on the agent's PATH holding a `git` shim — the spawn-env seal must drop the writable dir (no agent git at the head) and
// point HOME + GH_CONFIG_DIR at a hub-owned dir under data/ (the agent's ~/.config/gh is bypassed; the token still rides env).
const GHBIN = path.join(ROOT, 'ghbin'); fs.mkdirSync(GHBIN, { recursive: true });
fs.writeFileSync(path.join(GHBIN, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('gh-fake\\n');\n", { mode: 0o555 });
fs.chmodSync(GHBIN, 0o555);
const WSEAL = path.join(ROOT, 'wseal'); fs.mkdirSync(WSEAL, { recursive: true });   // agent-writable (0755) — a shim at the PATH head
fs.writeFileSync(path.join(WSEAL, 'git'), "#!/usr/bin/env node\nrequire('fs').writeFileSync(process.env.STEAL||'/dev/null', process.env.GH_TOKEN||'');\n", { mode: 0o755 });
const NOTYET = path.join(ROOT, 'notyet-bin');   // round 11 (MAJOR 2): a dir that does NOT exist yet — the sealed PATH must DROP it (the unit bakes $HOME/.local/bin before the agent makes it), re-checked every spawn
// round 12: a test cannot chown a scratch binary to root, so the ownership check is an injectable door seam. The DEFAULT door (the
// card / run legs) models the "installed tool" dirs (BIN, GHBIN, the node prefix) + the real system dirs as ROOT-owned; the
// agent-writable WSEAL / NOTYET / work dirs are not. ⑫ instead passes the REAL DOOR.rootOwnedNoWrite to drive the actual rule.
const TRUSTED_ROOT = [BIN, GHBIN, path.dirname(NODE), '/usr/local/bin', '/usr/bin', '/bin'];
const isRootOwnedTest = (p) => TRUSTED_ROOT.some((d) => p === d || p.startsWith(d + '/'));
const { EventEmitter } = require('node:events');

// THE ORACLE: does `text` carry any byte of `value` — raw, any 10-character window of it, or after decoding every base64 /
// hex / percent run and every JSON string in it (Node's own decoders, not the scrubber's forms)
// lane vault-scrub-forms: the oracle reads EVERY view a real producer's spelling needs — colours stripped, lines joined,
// quoted-printable / \xNN / HTML entities decoded, the NULs of UTF-16 dropped, base32 runs decoded — each with its own
// decoder written here (never the module's)
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
// ── A WORLD: a real engine (set up, unlocked), the real For-you store, stores with rows, the door ──
const ROWS = {
  mounts: [{ entry: 'm1', field: 'secretKey', label: 'my bucket', cipher: 'x'.repeat(60), v: VALUE }, { entry: "b(x)!'*", field: 'secretKey', label: 'odd name', cipher: 'x'.repeat(60), v: VALUE }, { entry: 'm2', field: 'secretKey', label: 'tiny', cipher: 'x'.repeat(40), v: SHORT }, { entry: 'm4', field: 'session', label: 'sess', kind: 'session-token', cipher: 'x'.repeat(60), v: VALUE }],
  'app-secrets': [{ entry: 'app1', field: 'item.0.1', label: 'app login', bytes: VALUE2.length, v: VALUE2 }],
  accounts: [{ entry: 'acct1', field: 'apiKey', label: 'my account', kind: 'api-key', bytes: VALUE3.length, v: VALUE3 }],
  channels: [{ entry: 'lark1', field: 'token', label: 'lark', kind: 'token', bytes: 40, v: 'channel-token-abcdefghijklmnop' }],
  secrets: [{ entry: 'host:dev1', field: 'token', label: 'link', bytes: 40, v: 'pairing-token-abcdefghijklmnop' }, { entry: 'agent:conv-1/gh-token', field: 'secret', label: 'Agent secret · gh-token', bytes: 30, v: 'agent-minted-value-0123456789' },
    { entry: 'agent:conv-1/site-pw', field: 'secret', label: 'Agent secret · site-pw', bytes: 29, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane X', forHost: 'api.example.com' }, v: 'agent-minted-pw-0123456789abc' },
    { entry: 'agent:conv-1/gh-mint', field: 'secret', label: 'Agent secret · gh-mint', bytes: 30, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane X', forHost: 'github.com' }, v: 'agent-minted-ghv-0123456789abc' }, { entry: 'agent:conv-1/gh-ghe', field: 'secret', label: 'Agent secret \u00b7 gh-ghe', bytes: 31, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane X', forHost: 'ghe.example.test' }, v: 'agent-minted-ghe-0123456789abcd' }],   // round 16: a MINTED own entry --for a GHES host (the two_hosts BLOCKER: a <url> positional's host != the -R / GH_HOST host)   // lane vault-agent-own (r13): a MINTED own entry --for github.com (the cross-host minor: a call -R ghe.* approved on a card homes to the APPROVED host)   // lane vault-agent-own: a MINTED own entry, --for api.example.com
};
const sourceOf = (store) => ({ vaultRows: () => ROWS[store].map(({ v, ...r }) => r), vaultReveal: (e, f) => { const r = ROWS[store].find((x) => x.entry === e && x.field === f); return r ? r.v : null; } });
const CALLER = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane X', cwd: null };
let worldN = 0;
async function world({ instance = 'local', killGraceMs = 400, askMs = null, lateMs = null, doorMod = DOOR, setup = true, pipeGraceMs = 300, doorExtra = {}, runBoundMs = null } = {}) {   // doorExtra: the door's own seams (its scrubber worker's file, figures, silence bound)
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false });
  if (setup) await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const logs = [];
  const timerLog = [];   // every bound the door set (ms) — a bound is proven by the timer the door armed, never by a wall clock
  // runBoundMs (B-54a9, 主开发 r3437): a scene's --timeout 1 bound — ARMED as the door arms it (1000 ms, in the log) — fires after this
  // many ms of real time: a child that never ends by itself is stopped by THAT timer whenever it fires, so no verdict rests on the 1 s
  const timers = { set: (fn, ms) => { timerLog.push(ms); return setTimeout(fn, askMs != null && ms === VR.ASK_TTL_MS ? askMs : lateMs != null && ms === DOOR.LATE_TTL_MS ? lateMs : runBoundMs != null && ms === 1000 ? runBoundMs : ms); }, clear: (h) => clearTimeout(h) };
  const gone = new Set();
  const mk = (mod = doorMod, extra = {}) => mod.create({ dataDir, vault, userTodos, sources: Object.fromEntries(Object.keys(ROWS).map((s) => [s, () => sourceOf(s)])), instanceKind: () => instance,
    runRoot: () => runRoot, home: SUITE_HOME, tmpDir: SUITE_TMP, agentEnv: () => ({ ...SUITE_ENV, PATH: BIN + ':' + SUITE_ENV.PATH }), killGraceMs, pipeGraceMs, timers, liveOf: (cid) => !gone.has(cid), log: (m) => logs.push(String(m)), isRootOwned: isRootOwnedTest, ...extra });   // round 10: extra deps (a capturing spawnImpl, a PATH-with-a-writable-head agentEnv) for the spawn-env seal test
  const door = mk(doorMod, doorExtra);
  return { dir, dataDir, work, runRoot, vault, userTodos, door, logs, gone, mk, timerLog, caller: { ...CALLER, cwd: work } };
}
const cardsOf = (w) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-run-ask');
/** B-54a9 (主开发 r3437): A CARD OR THE RUN'S END, whichever comes first — for a road that may draw no card (the run then goes on
 *  without asking): the wait ends on the run's end, never on the card's whole bound. → the card, or null once the run ended */
async function waitCardOrEnd(w, run, ms = 3000) { let ended = false; Promise.resolve(run).then(() => { ended = true; }, () => { ended = true; }); const t = Date.now(); while (Date.now() - t < ms) { const c = cardsOf(w); if (c.length) return c[c.length - 1]; if (ended) return null; await sleep(5); } return null; }
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
const runDirs = (w) => fs.readdirSync(w.runRoot).filter((x) => x.startsWith(DOOR.RUN_DIR_PREFIX));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const PH1 = '[vault:mounts/m1/secretKey]';
/** ONE value, half on stdout and half on stderr (40 ms apart) → { ok, so, se, lk } (lane vault-scrub-forms). */
async function splitLeg(w, door = w.door) {
  if (!w.door.rowFacts({ id: 'mounts:m1#secretKey' }).open) openRow(w);
  const { r } = await runAnswered(w, ENV('split'), { door });
  const so = r.stdout || '', se = r.stderr || '';
  return { ok: !!r.ok, so, se, lk: [...leaks(so + se, VALUE), ...leaks(se + so, VALUE), ...leaks(so.split(PH1).join('') + se.split(PH1).join(''), VALUE)] };
}

const SRCD = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), SRCW = fs.readFileSync(path.join(REPO, 'src/server/vault-run-scrub-worker.js'), 'utf8');
const doorCopy = (from, to, tag) => M.load('src/server/vault-run-door.js', (Array.isArray(from) ? from : [[from, to]]).reduce((t, [f, x], k) => anchored(t, f, x, `${tag} (${k + 1})`), SRCD), tag.replace(/\W+/g, '-'));   // one edit, or a list of [from, to] pairs
const workerCopy = (from, to, tag) => M.write('src/server/vault-run-scrub-worker.js', anchored(SRCW, from, to, tag), tag.replace(/\W+/g, '-'));
const SMALL = { scrubSteps: { push: 64, run: 1 << 30 } };
export { fs, os, path, createRequire, pathToFileURL, scratchDir, anchored, mutantCopies, copiesCensus, require, REPO, R, pass, fail, ok, editAnchor, sleep, VE, DOOR, VR, UserTodoManager, DETAIL_MAX, ROOT, SUITE_HOME, SUITE_TMP, SUITE_ENV, M, PW, VALUE, VALUE2, VALUE3, SHORT, BIN, PRINTER, CURL, WCURL, NODE, GHBIN, WSEAL, NOTYET, TRUSTED_ROOT, isRootOwnedTest, EventEmitter, VIEWS_OF, unb32, leaks, leaksIn, ROWS, sourceOf, CALLER, worldN, world, cardsOf, waitCardOrEnd, waitCard, runAnswered, openRow, ENV, auditOf, runLines, runDirs, alive, PH1, splitLeg, SRCD, SRCW, doorCopy, workerCopy, SMALL };
