#!/usr/bin/env node
// test-vault-run — THE DOOR of `vibespace-vault run` (lane vault-run-door, design q-043 §8 + §5 P0-f): src/server/vault-run-door.js
// over the PURE src/vault-run.js, a REAL vault engine on a scratch dir, the REAL For-you store, and REAL children (a fake
// printer that leaks the value in every form, split across pipe chunks). Fast tier, in-process.
//   ① THE SWITCH (decision ⑤) — off by default ⇒ entry_not_runnable BY NAME; ON needs 验证是你; a login / pairing / channel
//      token, a hub secret, a sign-in kind is refused BY NAME on the switch AND at the run — even when the store is forced
//      'opened', even when the model's ownDoorOf is made to say yes (the engine's own class check); the store is MARKED by the
//      vault (a hand edit reads as empty, said in the audit)
//   ② THE SCRUB — env / a 0600 file ($VAULT_FILE) / a template / stdin: the child prints the value raw, base64 (std / URL /
//      inside `Basic user:pass`), percent, JSON and hex (upper / lower) and — lane vault-scrub-forms — UTF-16 LE / BE (bytes),
//      base32, quoted-printable, a Python bytes repr, HTML entities, colour escapes and wrapped base64, every one cut across
//      two pipe chunks, on stdout AND stderr ⇒ an independent decoding oracle (every view: colours stripped, lines joined, QP /
//      \xNN / entities decoded, NULs dropped) finds 0 bytes of it in what the agent gets; ONE WINDOW PER RUN: a value split
//      between stdout and stderr is masked; a long new form across the 2 MiB cut is dropped whole; the file is 0600 in a 0700 dir
//      and gone after the run; the exit code passes; 2 MiB cut; the refusals (argv, a print tool, a short value, a hidden
//      character, a cut card, a job, a remote conversation, --on, a cwd or a template outside the fence, no such tool)
//   ③ THE CARD (decisions ② ④) — a NEW shape draws the card on a cluster AND a local instance; a local one runs a SEEN shape
//      without asking, a cluster asks every time; «always» (验证是你 first; never for a shell / an interpreter) runs the
//      shape without asking; deny / no answer / the card closed by another door / a changed item / a second run of the same
//      shape / the caller gone / a lock — each refused by name, nothing runs; the card shows the whole run, never a value
//   ④ THE LOCK (decision ③) — a lock mid-run: the child (deaf to SIGTERM) is gone within its bound, the answer is
//      vault_locked, the run folder is gone, the owner's For-you list names the conversation; a locked vault refuses first
//   ⑤ THE AUDIT — one vault-run line per run and refusal: the actor, the shape, the entries, the exit, the scrubbed bytes —
//      the oracle finds no value in data/vault-audit.jsonl, data/user-todos.json or data/vault-run.json
//   ⑥ THE TIMEOUT — `--timeout 1` stops the child, said
//   ⑥b A RUN ENDS WHOLE (the security review) — a backgrounded child in the group and a setsid'd one that ignores SIGTERM are
//      gone when the run ends, on a lock too; the boot sweep shreds a GONE hub's folder after ending its marked strays and
//      leaves a LIVE hub's alone; a grandchild holding the pipes mid-value never flushes half of it; the store's mark (a
//      non-hex mark reads as empty, never a throw), its generation (a restored older copy = a replay, read as empty),
//      switch-off taking its «always» back; bounded requests; the program on the card (a writable one gets no «always»);
//      the folder's hidden characters; `list` spelling an entry with !'()*
//   ⑦ MUTANTS — patched copies of the door RED: a new shape without a card; an audit line carrying a value; two scrubbers
//      (one per pipe — the split leaks); a cut that flushes the held tail (the edge leaks)
//   ⑧ PINS — the headers (the three holes, the sieve, write-then-cat accepted and audited), the wiring
//   ⑨ THE CARD ON THE PAGE — the For-you window's buttons (PURE itemView: Allow once / Always for this shape / Deny, no
//      «always» when not offered), the popup row, «always» and the switch asking 验证是你 FIRST, a typed reply never answering
//   ⑩ THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design D4): a closed entry's refusal names `request`; a request
//      lands ONCE (agent, entry, purpose — no expiry), a second for the same entry while one is open ⇒ request_pending by
//      name; its refusals by name; Allow once = a grant the run verdict honours for THAT conversation (the shape card still
//      asks) and spends; 8 hours = every run; deny / the card closed elsewhere / a changed item / a gone conversation grant
//      nothing; the switch OFF and a LOCK end every grant and withdraw every request; the use lines carry the purpose and the
//      run's receipt and `uses` reads back this conversation's alone; the request's card on the page
//   ⑩b THE CAP'S SHAPE (B-4934, q-043 verify L2): eight conversations × 8 open asks, then a NINTH conversation's first ask
//      is FILED (MUTANT: the old 64-request hub-wide cap ⇒ RED); one conversation's 9th ⇒ too_many_requests by name; 32
//      conversations asking ⇒ the 33rd too_many_askers by name while one already asking still asks; more than 8 asking ⇒
//      ONE Vault notice «N conversations are asking», re-worded in place, closed at 8 or fewer, quiet once the owner set it
//      aside, closed by a lock and by a boot
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (rel) => require(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VE = R('src/server/vault-engine.js');
const DOOR = R('src/server/vault-run-door.js');
const VR = R('src/vault-run.js');
const { UserTodoManager, DETAIL_MAX } = R('src/user-todos.js');
const ROOT = scratchDir('vault-run');
const M = mutantCopies('vault-run', REPO);
const PW = 'the second password of the run suite';
// the values: odd characters every form spells differently ( / + = & " \ and a non-ASCII letter)
const VALUE = 'Vr-S3cret/value+with=odd&chars"\\ü-0123';
const VALUE2 = 'app-login-pass-9876543210';
const VALUE3 = 'account-api-key-value-000111222';
const SHORT = 'abc1234';

// ── THE FAKES: one bin dir first on the child's PATH — a printer (node), a curl (a known tool: «always» is offered) ──
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const PRINTER = path.join(BIN, 'printer.js');
fs.writeFileSync(PRINTER, `
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
  if (mode === 'split') { const v = process.env.T, h = v.length >> 1; process.stdout.write('<' + v.slice(0, h)); await sleep(40); process.stderr.write(v.slice(h) + '>\\n'); await sleep(40); process.stdout.write(' tail\\n'); return; }   // ONE value, half on each pipe
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
ok(leaks('a ' + VALUE + ' b', VALUE).length && leaks(Buffer.from('user:' + VALUE).toString('base64'), VALUE).includes('base64') && leaks(Buffer.from(VALUE).toString('hex').toUpperCase(), VALUE).includes('hex') && leaks(encodeURIComponent(VALUE), VALUE).includes('percent') && leaks(JSON.stringify({ v: VALUE }), VALUE).includes('json') && !leaks('[vault:mounts/m1/secretKey] nothing here', VALUE).length,
  'THE ORACLE (independent of the scrubber): Node\'s own decoders find the value raw, in base64 inside Basic, upper hex, percent and JSON — and nothing in a placeholder');
{ const v = VALUE2, u16 = (x) => { const d = new (require('node:string_decoder').StringDecoder)('utf8'); return d.write(x) + d.end(); };
  const seen = [[u16(Buffer.from(v, 'utf16le')), 'UTF-16LE'], [[...v].map((c) => '&#' + c.codePointAt(0) + ';').join(''), 'entities'], [[...v].map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join(''), 'colours'], [[...Buffer.from(v)].map((x) => '=' + x.toString(16).toUpperCase()).join('').replace(/^(.{30})/, '$1=\r\n'), 'quoted-printable'], [[...Buffer.from(v)].map((x) => '\\x' + x.toString(16)).join(''), '\\xNN'], [Buffer.from(v).toString('base64').replace(/(.{8})/g, '$1\n'), 'wrapped base64']];
  const miss = seen.filter(([x]) => !leaks(x, v).length).map(([, n]) => n);
  ok(!miss.length && leaks('JZTW4ZDPOU', 'not-there').length === 0, 'THE ORACLE reads the new spellings in the clear too (UTF-16LE, entities, colours, quoted-printable, \\xNN, wrapped base64) — so a 0 below is not vacuous', miss); }

// ── A WORLD: a real engine (set up, unlocked), the real For-you store, stores with rows, the door ──
const ROWS = {
  mounts: [{ entry: 'm1', field: 'secretKey', label: 'my bucket', cipher: 'x'.repeat(60), v: VALUE }, { entry: "b(x)!'*", field: 'secretKey', label: 'odd name', cipher: 'x'.repeat(60), v: VALUE }, { entry: 'm2', field: 'secretKey', label: 'tiny', cipher: 'x'.repeat(40), v: SHORT }, { entry: 'm4', field: 'session', label: 'sess', kind: 'session-token', cipher: 'x'.repeat(60), v: VALUE }],
  'app-secrets': [{ entry: 'app1', field: 'item.0.1', label: 'app login', bytes: VALUE2.length, v: VALUE2 }],
  accounts: [{ entry: 'acct1', field: 'apiKey', label: 'my account', kind: 'api-key', bytes: VALUE3.length, v: VALUE3 }],
  channels: [{ entry: 'lark1', field: 'token', label: 'lark', kind: 'token', bytes: 40, v: 'channel-token-abcdefghijklmnop' }],
  secrets: [{ entry: 'host:dev1', field: 'token', label: 'link', bytes: 40, v: 'pairing-token-abcdefghijklmnop' }, { entry: 'agent:conv-1/gh-token', field: 'secret', label: 'Agent secret · gh-token', bytes: 30, v: 'agent-minted-value-0123456789' }],
};
const sourceOf = (store) => ({ vaultRows: () => ROWS[store].map(({ v, ...r }) => r), vaultReveal: (e, f) => { const r = ROWS[store].find((x) => x.entry === e && x.field === f); return r ? r.v : null; } });
const CALLER = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane X', cwd: null };
let worldN = 0;
async function world({ instance = 'local', killGraceMs = 400, askMs = null, doorMod = DOOR, setup = true, pipeGraceMs = 300 } = {}) {
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false });
  if (setup) await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const logs = [];
  const timerLog = [];   // every bound the door set (ms) — a bound is proven by the timer the door armed, never by a wall clock
  const timers = { set: (fn, ms) => { timerLog.push(ms); return setTimeout(fn, askMs != null && ms === VR.ASK_TTL_MS ? askMs : ms); }, clear: (h) => clearTimeout(h) };
  const gone = new Set();
  const mk = (mod = doorMod) => mod.create({ dataDir, vault, userTodos, sources: Object.fromEntries(Object.keys(ROWS).map((s) => [s, () => sourceOf(s)])), instanceKind: () => instance,
    runRoot: () => runRoot, home: os.homedir(), agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), killGraceMs, pipeGraceMs, timers, liveOf: (cid) => !gone.has(cid), log: (m) => logs.push(String(m)) });
  const door = mk();
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

console.log('① THE SWITCH — the owner opens an entry for runs; a login / pairing / channel token never');
{
  const w = await world();
  const r0 = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(r0.code === 'entry_not_runnable' && r0.ref === 'vault://mounts/m1/secretKey' && /Usable by agent runs/.test(r0.words) && !cardsOf(w).length, 'an entry NOT opened for runs ⇒ entry_not_runnable BY NAME (the reference, the Vault window\'s switch) — no card, nothing ran', r0);
  ok(w.door.rowFacts({ id: 'mounts:m1#secretKey', store: 'mounts' }).open === false && w.door.rowFacts({ id: 'mounts:m1#secretKey', store: 'mounts' }).can === true, 'the switch is OFF by default (the Vault window\'s row: can, not open)');
  const s1 = w.door.setRunnable({ id: 'mounts:m1#secretKey', on: true });
  ok(s1.code === 'reveal_needs_password', 'switching ON needs this page\'s 验证是你 window (the second password again) — refused without it', s1);
  ok(openRow(w).open === true && w.door.rowFacts({ id: 'mounts:m1#secretKey' }).open === true, 'with it: ON (the row says so)');
  const own = [['accounts:acct1#apiKey', 'login'], ['channels:lark1#token', 'channel'], ['secrets:host:dev1#token', 'pairing'], ['mounts:m4#session', 'login']];
  const sw = own.map(([id]) => w.door.setRunnable({ id, on: true, reauthed: true }));
  ok(sw.every((x) => x.code === 'entry_has_its_own_door' && /own door/.test(x.words)), 'a LOGIN key, a CHANNEL token, a PAIRING (machine link) token and a sign-in kind on a storage row cannot be switched on — entry_has_its_own_door by name', sw);
  // FORCED 'opened': a store the vault marks, holding the ids anyway (what a bug or a hand would leave)
  const body = JSON.stringify({ v: 1, gen: 99, runnable: ['accounts:acct1#apiKey', 'channels:lark1#token', 'mounts:m1#secretKey', 'mounts:m4#session', 'secrets:host:dev1#token'], always: [] });
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(DOOR.MARK_LABEL, body) }));
  const forced = w.mk();
  const refs = [['--env', 'T=vault://accounts/acct1/apiKey'], ['--env', 'T=vault://channels/lark1/token'], ['--env', 'T=vault://secrets/host:dev1/token'], ['--env', 'T=vault://mounts/m4/session']];
  const fr = [];
  for (const e of refs) fr.push(await forced.run({ caller: w.caller, args: [...e, '--', NODE, PRINTER, 'env'], cwd: w.work }));
  ok(fr.every((x) => x.code === 'entry_has_its_own_door' && typeof x.door === 'string' && x.words.includes(x.door)) && !cardsOf(w).length, 'FORCED open: a login / channel / pairing token and a sign-in kind are refused BY NAME at the run, naming their door — no card, nothing ran', fr.map((x) => [x.code, x.door]));
  // the ENGINE'S OWN check: the model's ownDoorOf made to say yes for everything — the door still refuses by its own table
  const keep = VR.ownDoorOf; VR.ownDoorOf = () => null;
  const fr2 = [];
  try { for (const e of refs.slice(0, 3)) fr2.push(await forced.run({ caller: w.caller, args: [...e, '--', NODE, PRINTER, 'env'], cwd: w.work })); } finally { VR.ownDoorOf = keep; }
  ok(fr2.every((x) => x.code === 'entry_has_its_own_door') && Object.keys(DOOR.RUN_CLASS).sort().join() === 'app-secrets,mounts' && ['accounts', 'channels', 'integrations', 'passkeys', 'automation', 'secrets'].every((s) => DOOR.NEVER_CLASS[s]), 'the ENGINE\'s entry-class check alone (the model\'s table made to say yes) still refuses them — two tables say no (RUN_CLASS: storage and app logins only)', fr2.map((x) => x.code));
  // THE MARK: a hand edit of the store (no mark that verifies) reads as EMPTY
  const raw = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...raw, runnable: [...raw.runnable, 'app-secrets:app1#item.0.1'] }));
  const edited = w.mk();
  const re = await edited.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(re.code === 'entry_not_runnable' && /vault-run-store-refused/.test(auditOf(w)), 'a HAND-EDITED store (its mark no longer verifies — an agent shares the uid, never the DEK) reads as EMPTY: every entry closed, said in the audit', re.code);
  ok(DOOR.DETAIL_MAX === DETAIL_MAX, 'the card bound is the For-you store\'s own detail bound (a cut card would differ from what runs)');
}

console.log('② THE SCRUB — every form of the value, cut across chunks, on both streams ⇒ 0 bytes reach the agent');
{
  const w = await world();
  openRow(w); openRow(w, 'app-secrets:app1#item.0.1');
  const legs = [
    ['env', ENV('env')],
    ['file', ['--file', 'K=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'file', '$VAULT_FILE{K}']],
    ['file (a reference in $VAULT_FILE)', ['--', NODE, PRINTER, 'file', '$VAULT_FILE{mounts/m1/secretKey}']],
    ['stdin', ['--stdin', 'vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'stdin']],
  ];
  fs.writeFileSync(path.join(w.work, 'tmpl.txt'), 'token=$VAULT{mounts/m1/secretKey}\n');
  legs.push(['template', ['--file', 'CFG=@tmpl.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}']]);
  for (const [name, args] of legs) {
    const { r, card } = await runAnswered(w, args);
    const out = (r.stdout || '') + (r.stderr || '');
    const lk = leaks(out, VALUE);
    ok(r.ok && r.exit === 3 && !lk.length && (out.match(/\[vault:mounts\/m1\/secretKey\]/g) || []).length >= 40 && /DONE/.test(r.stdout) && r.scrubbed.hits >= 40 && r.scrubbed.bytes > 40 * VALUE.length && !!card,
      `${name}: the child printed the value in 21 spellings (the 12 + UTF-16 LE / BE bytes, base32 ×2, quoted-printable, a Python bytes repr, HTML entities, colour escapes, wrapped base64), each cut across two chunks on stdout AND stderr at once (the other pipe's half between them) — the oracle finds NOTHING (0 bytes; the whole percent line lower-cased changes the value's own letters — a case swap, never masked, never the value), ${r.scrubbed && r.scrubbed.hits} placeholders, ${r.scrubbed && r.scrubbed.bytes} bytes scrubbed; the exit code (3) passes`, { lk, code: r.code, exit: r.exit, out: out.slice(0, 400) });
    if (name === 'file') {
      const m = /FILE (\d+) (\d+) (\S+)/.exec(r.stdout || '');
      ok(m && m[1] === '600' && m[2] === '700' && m[3].startsWith(w.runRoot + '/' + DOOR.RUN_DIR_PREFIX) && !fs.existsSync(m[3]) && !runDirs(w).length, 'the file is 0600 in a 0700 run folder under the run root — and the folder is SHREDDED and gone once the child is', m && m.slice(1));
    }
  }
  ok(!runDirs(w).length, 'no run folder is left after five runs');
  const big = await runAnswered(w, ENV('big'));
  ok(big.r.ok && big.r.truncated === true && Buffer.byteLength(big.r.stdout) <= VR.OUTPUT_MAX_BYTES && !leaks(big.r.stdout.slice(-200), VALUE).length, 'the output is cut at 2 MiB (said: truncated) — the value printed past the cut never arrives', { truncated: big.r.truncated, len: big.r.stdout && big.r.stdout.length });
  const edge = await runAnswered(w, ENV('edge'));
  const tail = (edge.r.stdout || '').slice(-400);
  ok(edge.r.ok && edge.r.truncated === true && !leaks(tail, VALUE).length && !tail.includes(VALUE.slice(0, 12)) && !tail.includes(VALUE.slice(0, 6)), 'a value printed ACROSS the 2 MiB cut: its first 12 bytes are inside the bound — the scrubber\'s held tail is DROPPED at a cut, never flushed (not even 6 bytes of it arrive)', { truncated: edge.r.truncated, tail: tail.slice(-60) });
  // ONE WINDOW PER RUN (the desk's q-043 M1): the run's ONE scrubber reads both pipes in arrival order
  const sp = await splitLeg(w);
  ok(sp.ok && sp.so === '<' + PH1 + ' tail\n' && sp.se === PH1 + '>\n' && !sp.lk.length, 'ONE WINDOW PER RUN: the child printed half the value on stdout and the rest on stderr — the run\'s one scrubber saw it whole: stdout «<[vault:…] tail», stderr «[vault:…]>» (each pipe shows where its part was), 0 bytes of it', sp);
  for (const [mode, what, dec] of [['edge2', 'its HTML entities (~200 characters, 60 inside the bound)', (s) => s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))], ['edge3', 'its UTF-16LE bytes (40 inside the bound)', (s) => s.replace(/\0/g, '')]]) {
    const e2 = await runAnswered(w, ENV(mode));
    const t2 = (e2.r.stdout || '').slice(-1200), d2 = dec(t2);
    ok(e2.r.ok && e2.r.truncated === true && !leaks(t2, VALUE).length && !d2.includes(VALUE.slice(0, 6)) && /x$/.test(t2), `a value printed ACROSS the 2 MiB cut as ${what}: the held tail is the window as the VIEW reads it (longest form − 1 characters of the value, its escapes and NULs beside them) — dropped at the cut, not even 6 characters of it arrive`, { truncated: e2.r.truncated, tail: JSON.stringify(t2.slice(-80)) });
  }
  const app = await runAnswered(w, ['--env', 'T=vault://app-secrets/app1/item.0.1', '--', NODE, PRINTER, 'env']);
  ok(app.r.ok && !leaks(app.r.stdout + app.r.stderr, VALUE2).length && /\[vault:app-secrets\/app1\/item\.0\.1\]/.test(app.r.stdout), 'an app login opened for runs: the same — its placeholder, 0 bytes of it', app.r.code);
  // the refusals — each BY NAME, before anything is read or spawned
  openRow(w, 'mounts:m2#secretKey');
  const REF = [
    [['--', NODE, PRINTER, 'env', 'vault://mounts/m1/secretKey'], 'argv_refused', 'a value on the command line (/proc/<pid>/cmdline)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'cat', '/etc/hostname'], 'tool_prints_secrets', 'a print tool (cat)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'sudo', 'true'], 'tool_wraps_another', 'a wrapper (sudo)'],
    [['--env', 'T=vault://mounts/m2/secretKey', '--', NODE, PRINTER, 'env'], 'entry_too_short_to_mask', 'a value under 8 bytes (it could not be scrubbed)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env\u202e'], 'hidden_chars', 'a direction mark in the command (the card would show another order)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'no-such-tool-vrd'], 'tool_not_found', 'a program not on the PATH (a bare name is never looked up in the cwd)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--on', 'mac', '--', NODE, PRINTER, 'env'], 'device_road_later', '--on a machine (P1 vault-run-device)'],
    [['--env', 'LD_PRELOAD=/tmp/x.so', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], 'env_refused', 'a hijack env name (LD_PRELOAD)'],
    [['--file', 'CFG=@/etc/hostname', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}'], 'template_refused', 'a template outside the project / temp / Downloads fence'],
    [['--env', 'T=vault://mounts/m9/secretKey', '--', NODE, PRINTER, 'env'], 'entry_unknown', 'an entry that is not there'],
  ];
  const before = cardsOf(w).length;
  const got = [];
  for (const [args, code] of REF) got.push((await w.door.run({ caller: w.caller, args, cwd: w.work })).code);
  ok(REF.every(([, code], i) => got[i] === code) && cardsOf(w).length === before, `refused BY NAME, no card, nothing spawned: ${REF.map(([, c, why], i) => `${why} ⇒ ${got[i]}`).join(' · ')}`, got);
  fs.writeFileSync(path.join(w.work, 'long.txt'), 'x'.repeat(DETAIL_MAX) + '$VAULT{mounts/m1/secretKey}');
  const cut = await w.door.run({ caller: w.caller, args: ['--file', 'CFG=@long.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}'], cwd: w.work });
  const job = await w.door.run({ caller: { job: true, name: 'nightly' }, args: ENV('env'), cwd: w.work });
  const remote = await w.door.run({ caller: { ...w.caller, remote: true }, args: ENV('env'), cwd: w.work });
  const fence = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: '/etc' });
  ok(cut.code === 'card_too_long' && job.code === 'job_no_use' && remote.code === 'device_road_later' && fence.code === 'cwd_refused', 'a card that would be cut ⇒ card_too_long · a Background Work job ⇒ job_no_use · a conversation on a paired machine ⇒ device_road_later · a cwd outside the fence ⇒ cwd_refused', [cut.code, job.code, remote.code, fence.code]);
}

console.log('②b AN AGENT\'S OWN ENTRY (vault-mint-put\'s mint / put) — opened by the owner, used by its conversation only');
{
  const w = await world();
  const id = 'secrets:agent:conv-1/gh-token#secret';
  ok(w.door.rowFacts({ id }).can === true && w.door.rowFacts({ id }).open === false, 'the Vault window\'s row of an agent\'s own entry carries the switch (off by default)');
  const r0 = await w.door.run({ caller: w.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r0.code === 'entry_not_runnable', 'not opened yet ⇒ entry_not_runnable (decision ⑤ holds for it too)', r0.code);
  ok(w.door.setRunnable({ id, on: true, reauthed: true }).open === true, 'the owner opens it');
  const own = await runAnswered(w, ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env']);
  ok(own.r.ok && !leaks(own.r.stdout + own.r.stderr, 'agent-minted-value-0123456789').length && /\[vault:agent:conv-1\/gh-token\]/.test(own.r.stdout), 'ITS conversation runs with it, spelled as mint hands it out — scrubbed to [vault:agent:conv-1/gh-token]', own.r.code);
  const other = await w.door.run({ caller: { ...w.caller, conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Lane Y' }, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(other.code === 'use_not_granted' && !cardsOf(w).length, 'ANOTHER conversation ⇒ use_not_granted, by name — no card, nothing read', other.code);
}

console.log('③ THE CARD — a NEW shape draws the card; cluster asks every time, local allows a SEEN shape; «always»');
/** THE LEG the card mutant is judged by: a NEW shape on a LOCAL instance (the default that allows) must draw the card. */
async function newShapeCards(doorMod) {
  const w = await world({ doorMod });
  openRow(w);
  const { r, card } = await runAnswered(w, ENV('env'), { answer: 'once' });
  return { card: !!card, ran: !!(r && r.ok), by: r && r.by };
}
{
  const local = await newShapeCards(DOOR);
  ok(local.card && local.ran && local.by === 'once', 'a NEW shape draws the card on a LOCAL instance (decision ②: a local instance allows only after one 允许) — answered once, it ran', local);
  const w = await world();
  openRow(w);
  const first = await runAnswered(w, ENV('env'));
  const it = first.card;
  ok(!!it && it.urgency === 'urgent' && it.text === 'Lane X wants to run a command with a stored secret' && it.detail.split('\n')[0].includes(PRINTER) && /Secrets: vault:\/\/mounts\/m1\/secretKey/.test(it.detail) && /Given as: env:T/.test(it.detail) && /Folder: /.test(it.detail) && /This shape = this whole command line/.test(it.detail) && /«Always» is not offered: an interpreter/.test(it.detail) && it.action.always === false,
    'the card: urgent, the asking conversation by name, the WHOLE run (the command with its references, the secrets, how each is given, the folder, what this shape means) — an interpreter offers no «always»', it && it.detail);
  ok(!leaks(JSON.stringify(it), VALUE).length, 'the card carries no byte of the value (its text, detail and action)');
  const again = await runAnswered(w, ENV('env'));
  ok(again.r.ok && again.r.by === 'seen' && !again.card, 'LOCAL: the same shape again runs without a card (seen this unlock — still scrubbed, still audited)', [again.r.by, !!again.card]);
  const other = await runAnswered(w, ENV('env', 'extra-arg'));
  ok(!!other.card && other.r.ok && other.r.by === 'once', 'LOCAL: an interpreter\'s other command line is a NEW shape ⇒ the card again', [!!other.card, other.r.by]);
  // «always»: a known tool naming a host (the fake curl)
  const CURLARGS = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  const c1 = await runAnswered(w, CURLARGS, { answer: null });
  ok(!!c1.card && c1.card.action.always === true && /Hosts: api\.example\.com/.test(c1.card.detail) && /the tool \+ its flags \+ the hosts \+ the secrets; positional arguments may change/.test(c1.card.detail), 'a known tool naming a host: the card offers «always» and says what this shape is (tool + flags + hosts + secrets; positionals may change)', c1.card && c1.card.detail);
  const noRe = w.door.answer(c1.card.action.askId, { answer: 'always' });
  ok(noRe.code === 'reveal_needs_password' && cardsOf(w).length === 1, '«always» WITHOUT 验证是你 ⇒ reveal_needs_password — the card stays up', noRe);
  const yes = w.door.answer(c1.card.action.askId, { answer: 'always', reauthed: true });
  const c1r = await c1.r;
  ok(yes.ok && yes.outcome === 'always' && yes.ttl === '30d' && c1r.ok && c1r.by === 'always' && /curl got \[vault:mounts\/m1\/secretKey\]/.test(c1r.stdout), '«always» WITH it (30 days, the default) ⇒ it ran, scrubbed', [yes, c1r.by]);
  const c2 = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/other']);
  ok(c2.r.ok && c2.r.by === 'always' && !c2.card, 'the same shape with another positional runs without a card (by «always»)', [c2.r.by, !!c2.card]);
  const c3 = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'deny' });
  ok(!!c3.card && c3.r.code === 'ask_denied', 'another HOST is another shape ⇒ the card; Deny ⇒ ask_denied, nothing ran', [!!c3.card, c3.r.code]);
  const st = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  ok(st.always.length === 1 && st.always[0].conv === 'conv-1' && typeof st.mark === 'string' && st.mark.length === 64 && !leaks(JSON.stringify(st), VALUE).length, 'the «always» is kept in data/vault-run.json under the vault\'s mark — the conversation and the shape key, never a value', st);
  const sh = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
  const shAlways = w.door.answer(sh.card.action.askId, { answer: 'always', reauthed: true });
  w.door.answer(sh.card.action.askId, { answer: 'deny' }); await sh.r;
  ok(sh.card.action.always === false && shAlways.code === 'always_not_offered', 'a SHELL\'s card offers no «always» (its whole script is its shape) — asked for anyway ⇒ always_not_offered', shAlways);
  // CLUSTER: asks EVERY time
  const cw = await world({ instance: 'cluster' });
  openRow(cw);
  const k1 = await runAnswered(cw, ENV('env')), k2 = await runAnswered(cw, ENV('env'));
  ok(!!k1.card && !!k2.card && k1.r.ok && k2.r.ok && k2.r.by === 'once', 'CLUSTER: a new shape asks, and the SAME shape asks AGAIN (decision ②: every run asks by default)', [!!k1.card, !!k2.card, k2.r.by]);
  // the card closed by another door / a changed item / no answer / a second run / the caller gone
  const d1 = cw.door.run({ caller: cw.caller, args: ENV('env', 'closed'), cwd: cw.work });
  const it1 = await waitCard(cw);
  cw.userTodos.setStatus(it1.id, 'done', 'user');
  const d1r = await d1;
  ok(d1r.code === 'ask_denied', 'the card closed by another door (the ✓ on the row, Mark all seen) settles the run NOT allowed — ask_denied, nothing ran', d1r.code);
  const d2 = cw.door.run({ caller: cw.caller, args: ENV('env', 'changed'), cwd: cw.work });
  const it2 = await waitCard(cw);
  const held = cw.userTodos._state.items.find((x) => x.id === it2.id); held.detail = held.detail.replace('changed', 'Changed');
  const d2a = cw.door.answer(it2.action.askId, { answer: 'once' });
  const d2r = await d2;
  ok(d2a.code === 'ask_changed' && d2r.code === 'ask_changed', 'an Allow on an item whose detail changed after it was shown ⇒ ask_changed, nothing ran (the belt)', [d2a.code, d2r.code]);
  const d3 = cw.door.run({ caller: cw.caller, args: ENV('env', 'twice'), cwd: cw.work });
  await waitCard(cw);
  const d3b = await cw.door.run({ caller: cw.caller, args: ENV('env', 'twice'), cwd: cw.work });
  ok(d3b.code === 'ask_pending' && cardsOf(cw).length === 1, 'a second run of a shape whose card is up ⇒ ask_pending (one card per conversation × shape)', d3b.code);
  const it3 = cardsOf(cw)[0]; cw.door.answer(it3.action.askId, { answer: 'deny' }); await d3;
  const ac = new AbortController();
  const d4 = cw.door.run({ caller: cw.caller, args: ENV('env', 'gone'), cwd: cw.work, signal: ac.signal });
  const it4 = await waitCard(cw); ac.abort();
  const d4r = await d4;
  ok(d4r.code === 'caller_gone' && !cardsOf(cw).length && cw.userTodos.get(it4.id).status !== 'open', 'the caller went away while its card waited ⇒ caller_gone, the card closes', d4r.code);
  const ew = await world({ instance: 'cluster', askMs: 80 });
  openRow(ew);
  const ex = await runAnswered(ew, ENV('env'), { answer: null });
  ok(!!ex.card && (await ex.r).code === 'ask_expired' && !cardsOf(ew).length, 'no answer within the card\'s life (60 s; 80 ms here) ⇒ ask_expired, nothing ran', (await ex.r).code);
  // the card closed by another door — the gate's words, again on a LOCAL instance
  const lw = await world();
  openRow(lw);
  const l1 = lw.door.run({ caller: lw.caller, args: ENV('ran', path.join(lw.work, 'ran.txt')), cwd: lw.work });
  const li = await waitCard(lw); lw.userTodos.setStatus(li.id, 'dismissed', 'user');
  ok((await l1).code === 'ask_denied' && !fs.existsSync(path.join(lw.work, 'ran.txt')), 'the card closed by another door (dismissed) on a local instance: nothing ran (the child never started)');
}

console.log('④ THE LOCK — a lock mid-run ends the child within its bound; the answer is vault_locked');
{
  const w = await world({ killGraceMs: 400 });
  openRow(w);
  const pidFile = path.join(w.work, 'pid.txt');
  const p = runAnswered(w, ENV('hang', pidFile));
  let pid = null; const t0 = Date.now();
  while (!pid && Date.now() - t0 < 5000) { try { pid = Number(fs.readFileSync(pidFile, 'utf8')) || null; } catch { } await sleep(10); }
  ok(!!pid && alive(pid) && runDirs(w).length === 1, 'the child (deaf to SIGTERM) runs, its run folder beside it', pid);
  const armed = w.timerLog.length;
  w.vault.lock('door');
  const { r } = await p;
  const killed = runLines(w).find((x) => x.outcome === 'vault_locked' && x.killed === true);
  ok(r.code === 'vault_locked' && r.killed === true && /already been told/.test(r.words) && !alive(pid) && w.timerLog.slice(armed).includes(400) && killed && killed.signal === 'SIGKILL',
    'a LOCK mid-run: the child (deaf to SIGTERM) is GONE within its bound — the lock armed the 400 ms grace and the SIGKILL after it ended the child (its line says signal SIGKILL); the agent\'s answer is vault_locked (the user was told)', { code: r.code, killed: r.killed, signal: killed && killed.signal, alive: alive(pid), timers: w.timerLog.slice(armed) });
  ok(!runDirs(w).length && !!killed, 'its run folder is gone; its audit line says vault_locked, killed');
  ok(JSON.stringify(w.vault.blockedSummary()).includes('Lane X'), 'the owner\'s For-you list of who the lock stopped names the conversation (the vault\'s one helper)', w.vault.blockedSummary());
  const lockedRun = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(lockedRun.code === 'vault_locked' && !cardsOf(w).length, 'a LOCKED vault refuses a run FIRST — no card, nothing read', lockedRun.code);
  // a lock with a card up
  await w.vault.unlock(PW);
  const c = w.door.run({ caller: w.caller, args: ENV('env', 'card-up'), cwd: w.work });
  await waitCard(w);
  w.vault.lock('agent');
  ok((await c).code === 'vault_locked' && !cardsOf(w).length, 'a lock while a card is up settles it: vault_locked, the card closes');
  await w.vault.unlock(PW);
  const after = await runAnswered(w, ENV('env'));
  ok(!!after.card && after.r.ok, 'after the lock the SEEN shapes are forgotten — the same shape asks again (the lock ends the unlock\'s allowances)', [!!after.card, after.r.by]);
}

console.log('⑤ THE AUDIT — one line per run and refusal, never a value');
/** THE LEG the audit mutant is judged by: a run, then every byte the door wrote — the audit, the For-you store, its own store. */
async function auditClean(doorMod) {
  const w = await world({ doorMod });
  openRow(w);
  const { r } = await runAnswered(w, ENV('env'));
  const files = ['vault-audit.jsonl', 'user-todos.json', DOOR.STORE_FILE].map((f) => { try { return fs.readFileSync(path.join(w.dataDir, f), 'utf8'); } catch { return ''; } }).join('\n');
  return { ran: !!(r && r.ok), receipt: r && r.receipt, leaks: leaks(files, VALUE), lines: runLines(w) };
}
{
  const a = await auditClean(DOOR);
  const ran = a.lines.find((x) => x.outcome === 'ran');
  ok(a.ran && !a.leaks.length, 'every byte the door wrote (data/vault-audit.jsonl, data/user-todos.json, data/vault-run.json) — the oracle finds NO value', a.leaks);
  ok(!!ran && ran.by.kind === 'agent' && ran.by.name === 'Lane X' && ran.entries[0] === 'vault://mounts/m1/secretKey' && /^[0-9a-f]{16}$/.test(ran.shapeId) && ran.exit === 3 && ran.allowedBy === 'once' && ran.scrubbed.bytes > 0 && ran.scrubbed.hits > 0 && Array.isArray(ran.injection) && typeof ran.cmd === 'string' && typeof ran.ms === 'number' && /\[vault:mounts\/m1\/secretKey\]/.test(ran.stdout),
    'the run\'s line: the actor, the entries (references), the shape, the injection, the command, what allowed it, the exit code, the time, the scrubbed bytes, the scrubbed head of the output', ran);
  ok(/^vr-[0-9a-f]{16}$/.test(ran.receipt) && a.receipt === ran.receipt, 'the agent\'s answer and the audit line carry ONE receipt (design D1: a use + a receipt)', [a.receipt, ran.receipt]);
}

console.log('⑥b A RUN ENDS WHOLE; the store\'s mark; the bounds; the program on the card (the security review)');
{
  const w = await world({ killGraceMs: 300 });
  openRow(w);
  const bgPid = path.join(w.work, 'bg.txt'), strayPid = path.join(w.work, 'stray.txt');
  const bg = await runAnswered(w, ENV('bg', bgPid));
  const st = await runAnswered(w, ENV('stray', strayPid));
  const pb = Number(fs.readFileSync(bgPid, 'utf8')), ps = Number(fs.readFileSync(strayPid, 'utf8'));
  await sleep(30);
  const strayLine = runLines(w).filter((x) => x.outcome === 'ran').pop();
  ok(bg.r.ok && st.r.ok && !alive(pb) && !alive(ps) && strayLine.strays >= 1, 'a child left behind in the run\'s group, and one in its OWN session deaf to SIGTERM (it carried the run\'s mark), are both GONE when the run ends — the audit counts the stray', { bg: alive(pb), stray: alive(ps), strays: strayLine.strays });
  // on a lock: the setsid'd stray of a run still running
  const lw = await world({ killGraceMs: 300 });
  openRow(lw);
  const p2 = path.join(lw.work, 'stray2.txt'), hold = path.join(lw.work, 'hold.txt');
  const run = runAnswered(lw, ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, '-e', `const k=require('child_process').spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});require('fs').writeFileSync(${JSON.stringify(p2)},String(k.pid));k.unref();require('fs').writeFileSync(${JSON.stringify(hold)},'1');setInterval(()=>{},1000)`]);
  for (let i = 0; i < 300 && !fs.existsSync(hold); i++) await sleep(10);
  const sp = Number(fs.readFileSync(p2, 'utf8'));
  ok(alive(sp) && runDirs(lw).length === 1, 'a run whose child left a stray in its own session runs');
  lw.vault.lock('door');
  const dirsAtLock = runDirs(lw).length;
  const lr = (await run).r;
  // the stray is SIGKILLed before the answer; its REAPING is its new parent's (the user's systemd) a moment later — measured:
  // state R, parent systemd, gone ≤ 10 ms; checked at once it read alive 2 runs in 5 on the base. A bounded wait (as the leg
  // above sleeps 30 ms): a stray never killed (deaf to SIGTERM, an endless timer) is still alive after it ⇒ still RED
  for (let i = 0; i < 200 && alive(sp); i++) await sleep(10);
  ok(lr.code === 'vault_locked' && !alive(sp) && dirsAtLock === 0, 'a LOCK: the run\'s files are shredded AT ONCE, its child and the stray in its own session (deaf to SIGTERM) are gone, the answer vault_locked', { code: lr.code, stray: alive(sp), dirsAtLock });
  // a grandchild holding the pipes mid-value: cut after 2 s — half a value never flushed
  const hw = await world();
  openRow(hw);
  const ph = await runAnswered(hw, ENV('pipehold'));
  ok(ph.r.ok && hw.timerLog.includes(300) && !(ph.r.stdout || '').includes(VALUE.slice(0, 10)) && !leaks(ph.r.stdout, VALUE).length, 'a grandchild in its own session holds the pipes and prints HALF the value: the pipes are cut a grace after the child\'s exit (2 s; 300 ms here) and the held half is DROPPED, never flushed', JSON.stringify(ph.r.stdout));
  // THE BOOT SWEEP: a GONE hub's folder (its marked stray ended, its files shredded); a LIVE hub's folder kept
  const sw = await world();
  const deadHub = require('child_process').spawnSync(NODE, ['-e', 'console.log(JSON.stringify(require(' + JSON.stringify(path.join(REPO, 'src/proc-identity.js')) + ').identityOf(process.pid)))'], { encoding: 'utf8' });
  const deadId = JSON.parse(deadHub.stdout);
  const liveKid = require('child_process').spawn(NODE, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const liveId = R('src/proc-identity.js').identityOf(liveKid.pid);
  const mkRunDir = (name, owner) => { const d = path.join(sw.runRoot, name); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(owner)); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); return d; };
  const gone = mkRunDir(DOOR.RUN_DIR_PREFIX + 'gone01', deadId), kept = mkRunDir(DOOR.RUN_DIR_PREFIX + 'live01', liveId);
  const orphan = require('child_process').spawn(NODE, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { env: { ...process.env, [DOOR.MARK_ENV]: DOOR.RUN_DIR_PREFIX + 'gone01' }, stdio: 'ignore', detached: true });
  await sleep(80);
  const n = sw.door.sweep();
  await sleep(30);
  ok(n === 1 && !fs.existsSync(gone) && fs.existsSync(kept) && fs.existsSync(path.join(kept, 'f0')) && !alive(orphan.pid), 'the BOOT SWEEP: the folder of a hub that is GONE is shredded after its marked orphan child (deaf to SIGTERM) is ended; the folder of a hub that LIVES (another hub on the box) is never touched', { n, gone: fs.existsSync(gone), kept: fs.existsSync(kept), orphan: alive(orphan.pid) });
  try { liveKid.kill('SIGKILL'); } catch { }
  // THE STORE'S MARK: a non-hex mark reads as empty (never a throw); a restored OLDER copy is a replay
  const mw = await world();
  openRow(mw);
  const FILE = path.join(mw.dataDir, DOOR.STORE_FILE);
  const good = fs.readFileSync(FILE, 'utf8');
  const g = JSON.parse(good);
  fs.writeFileSync(FILE, JSON.stringify({ ...g, mark: 'é'.padStart(64, 'a') }));
  let threw = null, r1 = null;
  try { r1 = await mw.mk().run({ caller: mw.caller, args: ENV('env'), cwd: mw.work }); } catch (e) { threw = e.message; }
  ok(!threw && r1.code === 'entry_not_runnable', 'a mark that is not 64 hex characters (é: the same length in JS, not in bytes) reads as EMPTY — never a throw that breaks every door', threw || r1.code);
  fs.writeFileSync(FILE, good);
  const d2 = mw.mk();
  d2.setRunnable({ id: 'app-secrets:app1#item.0.1', on: true, reauthed: true });   // a newer generation, read and written by this hub
  fs.writeFileSync(FILE, good);   // the older copy restored
  await mw.vault.lock('door'); await mw.vault.unlock(PW);
  const r2 = await d2.run({ caller: mw.caller, args: ENV('env'), cwd: mw.work });
  ok(r2.code === 'entry_not_runnable' && /a replay/.test(auditOf(mw)), 'a restored OLDER copy of the store (a generation below the one this hub wrote) is a REPLAY: read as empty, said in the audit', r2.code);
  // switch-off takes the entry's «always» back
  const aw = await world();
  openRow(aw);
  const CA = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
  const c1 = await runAnswered(aw, CA, { answer: 'always', reauthed: true });
  const c2 = await runAnswered(aw, CA);
  aw.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  openRow(aw);
  const c3 = await runAnswered(aw, CA, { answer: 'deny' });
  ok(c1.r.by === 'always' && c2.r.by === 'always' && !c2.card && !!c3.card && c3.r.code === 'ask_denied', 'switching the entry OFF takes back its «always» (and its seen shapes): switched on again, the same shape asks', [c1.r.by, c2.r.by, !!c3.card]);
  // the bounds, the folder's characters, the program on the card
  const big = await aw.door.run({ caller: aw.caller, args: ['--env', 'P=' + 'a.'.repeat(40000), '--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', 'https://api.example.com'], cwd: aw.work });
  const bigCwd = await aw.door.run({ caller: aw.caller, args: ENV('env'), cwd: '/tmp/' + 'a/'.repeat(3000) });
  const rlo = await aw.door.run({ caller: aw.caller, args: ENV('env'), cwd: aw.work + '/\u202e' });
  ok(big.code === 'request_too_large' && bigCwd.code === 'request_too_large' && rlo.code === 'hidden_chars', 'over 64 KiB of words or a 4 KiB folder ⇒ request_too_large before anything is read; a folder holding a direction mark ⇒ hidden_chars (the card prints the folder)', [big.code, bigCwd.code, rlo.code]);
  const wc = await runAnswered(aw, ['--env', 'T=vault://mounts/m1/secretKey', '--', WCURL, '-s', 'https://api.example.com/v1/a'], { answer: null });
  ok(!!wc.card && wc.card.action.always === false && new RegExp('Program: ' + WCURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' — in a folder an agent can write').test(wc.card.detail) && /«Always» is not offered: the program sits where an agent could have written it/.test(wc.card.detail), 'the card names the PROGRAM that runs (its real path); one an agent could have written (a folder it can write) is said and gets no «always»', wc.card && wc.card.detail);
  aw.door.answer(wc.card.action.askId, { answer: 'deny' }); await wc.r;
  const ok1 = await runAnswered(aw, CA, { answer: null });
  ok(!!ok1.card && new RegExp('Program: ' + CURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\n').test(ok1.card.detail + '\n'), 'a program in a folder no agent can write: its path on the card, no warning', ok1.card && ok1.card.detail.split('\n').slice(0, 3));
  aw.door.answer(ok1.card.action.askId, { answer: 'deny' }); await ok1.r;
  aw.door.setRunnable({ id: "mounts:b(x)!'*#secretKey", on: true, reauthed: true });
  const ls = aw.door.runnableFor();
  ok(ls.ok && ls.entries.some((e) => e.ref === "vault://mounts/b%28x%29%21%27%2A/secretKey") && ls.entries.every((e) => VR.parseRef(e.ref)), 'list spells every opened entry as a reference that parses — an entry name holding !\'()* too', ls.entries.map((e) => e.ref));
}

console.log('⑥ THE TIMEOUT');
{
  const w = await world();
  openRow(w);
  const { r } = await runAnswered(w, ['--timeout', '1', ...ENV('sleep', path.join(w.work, 'p2.txt'))]);
  ok(r.ok && r.timedOut === true && r.signal === 'SIGTERM' && w.timerLog.includes(1000), '--timeout 1: the door armed its 1 s bound, the child was stopped there (SIGTERM) and the answer says timedOut', { timedOut: r.timedOut, signal: r.signal, timers: w.timerLog });
}

console.log('⑦ MUTANTS — patched copies of the door, each RED on its leg');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const mutate = (from, to, tag) => { const n = SRC.split(from).length - 1; return { n, mod: n === 1 ? M.load('src/server/vault-run-door.js', SRC.replace(from, to), tag) : null }; };
  const m1 = mutate('seen: seen.has(pair)', 'seen: true', 'nocard');
  const r1 = m1.mod ? await newShapeCards(m1.mod) : null;
  ok(m1.n === 1 && r1 && !r1.card && r1.ran, `MUTANT «a new shape without a card» (seen read as true): the patch hits once and the leg goes RED — it ran with NO card (${r1 && r1.by}); the shipped door draws one`, r1);
  const m2 = mutate('const line = { ...head, receipt, allowedBy: verdict.by,', 'const line = { ...head, receipt, env: m.env, allowedBy: verdict.by,', 'auditvalue');
  const r2 = m2.mod ? await auditClean(m2.mod) : null;
  ok(m2.n === 1 && r2 && r2.leaks.length > 0, `MUTANT «an audit line carrying a value» (the child's env on the line): the patch hits once and the leg goes RED (the oracle finds ${r2 && r2.leaks.join(', ')}); the shipped door writes none`, r2 && r2.leaks);
  // lane vault-scrub-forms: ONE scrubber per run — two (one per pipe, the shape before) let a split value by
  const m3 = mutate("scrub = VR.createRunMasker(secrets, ['out', 'err'])", "scrub = ((a, b) => ({ push: (k, x) => (k === 'out' ? { out: a.push(x), err: '' } : { out: '', err: b.push(x) }), end: () => ({ out: a.end(), err: b.end() }), hits: 0, bytes: 0, byForm: {} }))(VR.createMasker(secrets), VR.createMasker(secrets))", 'twomasks');
  let r3 = null;
  if (m3.mod) { const w3 = await world({ doorMod: m3.mod }); openRow(w3); r3 = await splitLeg(w3); }
  ok(m3.n === 1 && r3 && r3.lk.length > 0, `MUTANT «two scrubbers, one per pipe» (the pre-lane shape): the patch hits once and the split leg goes RED (the oracle finds ${r3 && r3.lk.join(', ')}); the shipped door's ONE scrubber masks it`, r3);
  // a CUT keeps the held tail back: flushed, a long new form begun inside the bound would arrive in part
  const m4 = mutate('if (!cut) handOn(scrub.end());', 'handOn(scrub.end());', 'cutflush');
  let r4 = null;
  if (m4.mod) { const w4 = await world({ doorMod: m4.mod }); openRow(w4); const e = await runAnswered(w4, ENV('edge2')); const tl = (e.r.stdout || '').slice(-1200); r4 = { truncated: e.r.truncated, lk: leaks(tl, VALUE), head: tl.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).includes(VALUE.slice(0, 6)) }; }
  ok(m4.n === 1 && r4 && r4.truncated && (r4.lk.length > 0 || r4.head), 'MUTANT «a cut flushes the held tail»: the patch hits once and the edge leg goes RED (the first characters of the value\'s entities arrive); the shipped door drops them', r4);
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
}

console.log('⑧ PINS — the headers say the holes; the wiring');
{
  const door = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  const wire = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/THE SCRUBBER IS A SIEVE/.test(door) && /WRITE-THEN-CAT IS ACCEPTED AND AUDITED/.test(door) && /NOT isolation/.test(door) && /egress fence is P1/.test(door), 'the door\'s header names §8.6\'s three holes: the same uid (not isolation), a tool sending it elsewhere (P1 egress), THE SCRUBBER IS A SIEVE — write-then-cat accepted and audited');
  const manual = fs.readFileSync(path.join(REPO, 'docs/agent/vault-manual.md'), 'utf8').replace(/\s+/g, ' ');
  ok(manual.includes('the output is scrubbed of the value\'s common spellings; a command that re-encodes it can still show it — the owner sees the whole command before it runs') && /A part of a value is never blanked; a value under 8 bytes is never used at all/.test(manual), 'the manual says what scrubbing does not promise in ONE sentence (lane vault-scrub-forms, the desk\'s q-043 M1) — and states the floor');
  ok(/THE THREE HOLES this door does NOT close/.test(routes) && /THE SCRUBBER IS A SIEVE/.test(routes) && /write-then-cat is accepted and audited/.test(routes), 'the route\'s header restates them');
  ok(/require\('\.\/vault-run-door\.js'\)\.create\(\{ dataDir: path\.join\(rootDir, 'data'\), vault, sources: vaultSources, userTodos,/.test(wire) && /agentEnv: \(\) => require\('\.\.\/agent-env\.js'\)\.agentEnv\(process\.env, \{ drop: require\('\.\.\/harness-env\.js'\)\.agentCredentialEnvNames/.test(wire) && /registerVaultRoutes\(app, \{[^\n]*run: vaultRun,/.test(wire) && /process\.once\('exit', \(\) => \{ try \{ vaultRun\.closeAll\(\); \} catch \{ \} \}\);/.test(wire) && /instanceKindOf\(process\.env/.test(wire),
    'the hub wires the door: the vault, the Vault window\'s sources, For you, agentEnv() (the harness credentials dropped), the instance\'s kind, the routes — and every child ends with the hub');
}

console.log('⑨ THE CARD ON THE PAGE — the For-you window, the popup row, the Vault window\'s switch');
{
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = (always) => L.itemView({ id: 'ut-1', sessionKey: 'claude:conv-1', text: 'Lane X wants to run a command with a stored secret', detail: 'curl -s https://api.example.com', urgency: 'urgent', kind: 'action', status: 'open', createdAt: 1, options: null, reply: null,
    action: { type: 'vault-run-ask', askId: 'a'.repeat(32), always, tool: 'curl' } }, { t: (x) => x, words: 'w', detail: 'd', name: 'Lane X', origin: { origin: 'vault', label: 'Vault' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '' });
  const a1 = view(true).actions, a0 = view(false).actions;
  ok(a1.slice(0, 3).join() === 'hub-once,shape-always,hub-deny' && a0.slice(0, 2).join() === 'hub-once,hub-deny' && !a0.includes('shape-always') && !a1.includes('reply'), 'the For-you window: Allow once / Always for this shape / Deny first — no «always» button when the card does not offer it, no reply box', { a1, a0 });
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const row = read('src/lib/user-todos-row.js'), win = read('src/lib/inbox-window.js'), act = read('src/lib/user-todos-actions.js'), vw = read('src/lib/vault-window.js');
  ok(/const HELD_ASKS = \['hub-act-ask', 'automation-ask', 'pool-cross-provider', 'vault-run-ask', 'vault-grant-ask'\];/.test(row) && /heldAnswers\(i\)\.map/.test(row) && /type === 'vault-run-ask' \? t\('Always let this conversation use it \(these hosts\)'\)/.test(row) && /i\.action\.type === 'vault-run-ask' && i\.action\.always === false/.test(row), 'the popup row: Allow once / Always (lane vault-use-grants: «Always let this conversation use it (these hosts)» — a standing approval; not when the card offers none) / Deny');
  ok(/'shape-always': \(\) => actBtn\('shape-always'/.test(win) && /a === 'auto-always' \|\| a === 'pool-always' \|\| a === 'shape-always' \? 'always'/.test(win), 'the For-you window\'s «Always for this shape» answers always');
  ok(/if \(answer === 'always' && !revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) return false;/.test(act) && /\/api\/vault\/run\/asks\//.test(act) && /\.\.\.\(answer === 'always' \? revealHeaders\(\) : \{\}\)/.test(act) && /r\.outcome === 'always'/.test(act), '«always» opens 验证是你 FIRST, in the press\'s own task, and sends this page\'s window; the answer reads `outcome`');
  ok(/if \(row\.run && row\.run\.can\)/.test(vw) && /if \(on && !revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) \{ box\.checked = false; return; \}/.test(vw) && /fetchJson\('\/api\/vault\/runnable'/.test(vw), 'the Vault window: «Usable by agent runs» on a row that can be opened; ON asks 验证是你 first, OFF never');
  ok(R('src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('vault-run-ask'), 'a typed reply never answers the run card — its buttons do');
  // lane vault-scrub-forms (q-043 verify M1): the card says what scrubbing does NOT promise — on the row, in the window, in three languages
  const NOTE = 'The output is scrubbed of the secret\'s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.';
  const call = "t('" + NOTE.replace(/'/g, "\\'") + "')", zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(row.includes("(i.action.type === 'vault-run-ask' ? `<div class=\"ut-exit-note\">${escHtml(" + call + ")}</div>` : '')") && win.includes("if (!card && it.action && it.action.type === 'vault-run-ask') c.detail.append(mk('div', 'iw-run-note', " + call + "));")
    && zh.includes(JSON.stringify(NOTE) + ': "') && ja.includes(JSON.stringify(NOTE) + ': "'), 'the RUN card says what the scrubbing does not promise («…a command that re-encodes it can still show it — read the whole command before you allow it») — on the popup row and under the For-you window\'s detail, with its Chinese and Japanese');
}

console.log('⑩ THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design D4: vibespace-vault request / uses)');
{
  const w = await world();   // a LOCAL instance (a seen shape runs without its card)
  const caller = { ...w.caller, scope: 'webui-1' };   // the use law's spelling of this conversation (its vault-use conv)
  const other = { conversationId: 'conv-9', sessionKey: 'claude:conv-9', name: 'Lane Nine', cwd: w.work, scope: 'webui-9' };
  const reqsOf = () => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-grant-ask');
  const M1 = 'vault://mounts/m1/secretKey', PURPOSE = 'upload the nightly backup to my bucket';
  const r0 = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(r0.code === 'entry_not_runnable' && /vibespace-vault request <vault:\/\/…> --for/.test(r0.words) && !/in the chat/.test(r0.words), 'a CLOSED entry ⇒ entry_not_runnable, its words naming `vibespace-vault request … --for` (never «ask in the chat»)', r0.words);
  const bad = [
    [{ caller, entry: M1, purpose: '' }, 'purpose_required'], [{ caller, entry: M1, purpose: 'x'.repeat(201) }, 'purpose_too_long'],
    [{ caller, entry: 'mounts/m1/secretKey', purpose: 'p' }, 'bad_reference'], [{ caller, entry: 'vault://accounts/acct1/apiKey', purpose: 'p' }, 'entry_has_its_own_door'],
    [{ caller, entry: 'vault://channels/lark1/token', purpose: 'p' }, 'entry_has_its_own_door'], [{ caller, entry: 'vault://mounts/nope/secretKey', purpose: 'p' }, 'entry_unknown'],
    [{ caller: { ...caller, job: true }, entry: M1, purpose: 'p' }, 'job_no_use'], [{ caller: { ...caller, remote: true }, entry: M1, purpose: 'p' }, 'device_road_later'],
    [{ caller: other, entry: 'vault://agent:conv-1/gh-token', purpose: 'p' }, 'use_not_granted'], [{ caller, entry: M1, purpose: 'deploy \u202eit' }, 'hidden_chars'],
  ];
  const got = bad.map(([a]) => w.door.request(a).code);
  ok(got.every((c, i) => c === bad[i][1]) && !reqsOf().length, 'refused BY NAME, nothing filed: no purpose, a purpose over 200, not a reference, a login / a channel token (their own doors), no such entry, a job, a remote conversation, ANOTHER conversation\'s own entry, a hidden character', got);
  const q1 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const it = reqsOf()[0];
  ok(q1.ok && q1.askId && reqsOf().length === 1 && it.origin === 'vault' && it.kind === 'action' && it.urgency === 'high' && !it.expiresAt && it.text === 'Lane X asks to use a stored secret'
    && it.detail.includes('my bucket — ' + M1) && it.detail.includes(PURPOSE) && it.action.askId === q1.askId, 'the request lands ONCE: one For-you ask naming the agent, the entry (label + reference) and the purpose — urgency high, NO expiry (it waits for the owner)', it);
  const q2 = w.door.request({ caller, entry: M1, purpose: 'again, please' });
  ok(q2.code === 'request_pending' && /already asked/.test(q2.words) && reqsOf().length === 1, 'a second request for the same entry while one is open ⇒ request_pending BY NAME — still ONE ask', q2);
  const u0 = w.door.usesFor(caller);
  ok(u0.ok && u0.requests.length === 1 && u0.requests[0].entry === M1 && u0.requests[0].purpose === PURPOSE && !u0.grants.length && !w.door.usesFor(other).requests.length, 'uses names the open request to ITS conversation only');
  const GHP = ['gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789'].join('');   // a token shape built at runtime (the secret scan)
  const leaky = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: `push with ${GHP} please` });
  const leakIt = reqsOf().find((x) => x.action.askId === leaky.askId);
  ok(leaky.ok && leakIt && !leakIt.detail.includes(GHP) && /«redacted»/.test(leakIt.detail) && !auditOf(w).includes(GHP), 'a purpose holding a secret shape lands «redacted» in the tray and the audit (the agent\'s words are a sink too)');
  ok(w.door.answerRequest(leaky.askId, { answer: 'deny' }).outcome === 'denied' && !w.door._grants.size && !reqsOf().some((x) => x.action.askId === leaky.askId), 'deny (a click) ⇒ no grant, the ask resolved');
  const again = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: 'once more' });
  ok(again.code === 'request_quiet' && /10 minutes/.test(again.words) && !reqsOf().some((x) => x.detail.includes('once more')), 'the same entry asked again right after a deny ⇒ request_quiet for 10 minutes (no card — the owner is not asked twice)', again);
  w.door._reqQuiet.clear();   // (the suite's later legs ask for it again)
  ok(w.door.answerRequest(q1.askId, { answer: 'always' }).code === 'bad_grant_answer', 'the answer is once, 8h or deny (no «always» — the per-row switch is the owner\'s always)');
  const nr = w.door.answerRequest(q1.askId, { answer: 'once' });
  ok(nr.code === 'reveal_needs_password' && reqsOf().length === 1 && !w.door._grants.size, 'Allow WITHOUT this page\'s 验证是你 ⇒ reveal_needs_password, the card stays up (a grant opens the entry as the switch does — the review: a click alone is forgeable on a hub with no sign-in)', nr);
  const g1 = w.door.answerRequest(q1.askId, { answer: 'once', reauthed: true });
  ok(g1.ok && g1.outcome === 'granted-once' && !reqsOf().length && w.door._grants.size === 1 && !fs.existsSync(path.join(w.dataDir, DOOR.STORE_FILE)), 'Allow once ⇒ ONE grant row, in memory only (the store file holds no grant)', g1);
  ok(w.door.answerRequest(q1.askId, { answer: 'once', reauthed: true }).code === 'ask_settled', 'a second answer ⇒ ask_settled');
  const ro = await w.door.run({ caller: other, args: ENV('env'), cwd: w.work });
  ok(ro.code === 'entry_not_runnable', 'the grant is THAT conversation\'s — another conversation\'s run of the same entry ⇒ entry_not_runnable');
  const run1 = await runAnswered(w, ENV('env'), { caller });
  ok(run1.card && run1.r.ok && run1.r.stdout.includes('[vault:mounts/m1/secretKey]') && !leaks(run1.r.stdout + run1.r.stderr, VALUE).length, 'THE GRANT IS HONOURED BY THE RUN VERDICT: the closed entry runs for this conversation — its new shape still draws the card first (the owner sees the command), the output scrubbed', run1.r && run1.r.code);
  ok(!w.door._grants.size, 'Allow once is SPENT by that run (before it started)');
  const run2 = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(run2.code === 'entry_not_runnable', 'the same (now seen) shape again ⇒ entry_not_runnable — once is once');
  const uses = w.door.usesFor(caller).uses;
  ok(uses.some((u) => u.outcome === 'ok' && u.entry === M1 && u.door === 'run' && u.purpose === PURPOSE && u.receipt === run1.r.receipt) && uses[0].outcome === 'entry_not_runnable' && !w.door.usesFor(other).uses.some((u) => u.outcome === 'ok'),
    'THE USE LINES: `uses` reads back THIS conversation\'s own — the entry, the purpose its grant carried, the outcome, the run\'s receipt (one receipt: the answer, the run line, the use line), newest first; another conversation\'s are not its', uses.slice(0, 3));
  const lines = auditOf(w).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(lines.filter((l) => l.event === 'vault-request').length === 2 && lines.some((l) => l.event === 'vault-grant' && l.answer === 'once' && l.conv === 'webui-1') && lines.some((l) => l.event === 'vault-grant' && l.answer === 'deny') && !leaks(auditOf(w), VALUE).length, 'the audit: each request and each answer is a line (conversation, entry, purpose, answer) — never a value');
  // L3 (int331): a once-grant whose run FAILS before the child ran is NOT burned — it is restored, the agent runs it again
  const ql3 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  w.door.answerRequest(ql3.askId, { answer: 'once', reauthed: true });
  ok(w.door._grants.size === 1, 'L3 setup: a fresh once-grant opens the entry again');
  const _vL3 = ROWS.mounts[0].v; ROWS.mounts[0].v = null;   // the entry's value momentarily unreadable ⇒ the run gets entry_unknown, nothing runs
  const l3fail = await runAnswered(w, ENV('env'), { caller });
  ROWS.mounts[0].v = _vL3;
  ok(l3fail.r.code === 'entry_too_short_to_mask' && w.door._grants.size === 1, 'L3: a run that FAILS before the child ran (the value cannot be scrubbed — nothing ran) RESTORES the once-grant, it is not burned');
  const l3ok = await runAnswered(w, ENV('env'), { caller });
  ok(l3ok.r.ok && !w.door._grants.size, '…then a real run honours the restored grant once and SPENDS it (a once-grant is spent only when a child ran)');
  // 8 HOURS: every run of the conversation, until the switch goes OFF or the vault locks
  const q3 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const g3 = w.door.answerRequest(q3.askId, { answer: '8h', reauthed: true });
  const ra = await w.door.run({ caller, args: ENV('env'), cwd: w.work }), rb = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(g3.outcome === 'granted' && ra.ok && rb.ok && w.door._grants.size === 1 && [...w.door._grants.values()][0].until - Date.now() <= DOOR.GRANT_MS, 'For 8 hours ⇒ every run of the conversation (the seen shape without a card on a local instance), the grant stays — ≤ 8 hours', [ra.code, rb.code]);
  ok(w.door.request({ caller, entry: M1, purpose: 'x' }).already === 'granted' && w.door.runnableFor(caller).entries.some((e) => e.ref === M1 && e.by === 'grant') && !w.door.runnableFor(other).entries.length, 'a request for an entry already granted answers so (nothing filed); `list` names it to THAT conversation alone');
  openRow(w); w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  ok(!w.door._grants.size, 'switching the entry OFF ends its grants too (OFF = closed for every conversation)');
  // the card closed elsewhere / a changed item / a gone conversation — no grant
  const q4 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  w.userTodos.setStatus(reqsOf()[0].id, 'dismissed', 'user');
  w.door._reqQuiet.clear();   // a dismissed card quiets the pair like a deny (the next legs ask again)
  ok(w.door.answerRequest(q4.askId, { answer: 'once', reauthed: true }).code === 'ask_settled' && !w.door._grants.size, 'the request\'s card closed by another door (dismissed) ⇒ settled, not granted — a late answer is ask_settled');
  const q5 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const i5 = reqsOf()[0]; const held5 = w.userTodos._state.items.find((x) => x.id === i5.id); held5.detail = held5.detail.replace('nightly', 'Nightly');
  const a5 = w.door.answerRequest(q5.askId, { answer: 'once', reauthed: true });
  ok(q5.ok && a5.code === 'ask_changed' && !w.door._grants.size, 'a request whose item changed after it was shown ⇒ ask_changed, nothing granted (the belt)', a5);
  const q6 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  if (q6.ok) { w.gone.add('conv-1'); const a6 = w.door.answerRequest(q6.askId, { answer: 'once', reauthed: true }); w.gone.delete('conv-1'); ok(a6.code === 'conversation_gone' && !w.door._grants.size, 'the conversation that asked has ended ⇒ conversation_gone, nothing granted', a6); }
  // THE LOCK: an open request withdrawn vault_locked, every grant ended
  w.door._reqQuiet.clear();
  const q7 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const q8 = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: 'log in to the app' });
  w.door.answerRequest(q8.askId, { answer: '8h', reauthed: true });
  const i7 = reqsOf()[0];
  w.vault.lock('agent');
  const after = w.userTodos.get(i7.id);
  ok(q7.ok && after && after.status === 'done' && after.resolvedBy === 'vault_locked' && !w.door._requests.size && !w.door._grants.size, 'A LOCK withdraws every open request (its item resolved by vault_locked) and ends every grant', after && [after.status, after.resolvedBy]);
  await w.vault.unlock(PW);
  const r9 = await w.door.run({ caller, args: ['--env', 'T=vault://app-secrets/app1/item.0.1', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r9.code === 'entry_not_runnable', 'after the unlock the 8-hour grant is gone — the entry is closed again');
  const lockedReq = (w.vault.lock('agent'), w.door.request({ caller, entry: M1, purpose: PURPOSE }));
  ok(lockedReq.code === 'vault_locked' && /already been told/.test(lockedReq.words) && w.vault.blockedSummary().actors.some((a) => a.verbs.includes('vibespace-vault request')), 'a LOCKED vault refuses a request first (the told words) and notes who it stopped', lockedReq);
  await w.vault.unlock(PW);
  // THE REVIEW'S USE-LINE LEGS: one receipt for every entry of a refused run; a child that RAN is a use whatever ended it;
  // the owner's silence / the hub's tray / the agent's own cancel never count toward the daily-failure card
  const two = await w.door.run({ caller, args: ['--env', 'A=vault://app-secrets/app1/item.0.1', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], cwd: w.work });
  const twoLines = w.door.usesFor(caller).uses.slice(0, 2);
  ok(two.code === 'entry_not_runnable' && twoLines.length === 2 && twoLines.every((u) => u.outcome === 'entry_not_runnable' && /^vr-[0-9a-f]{16}$/.test(u.receipt)) && twoLines[0].receipt === twoLines[1].receipt && !JSON.stringify(two).includes('vr-'),
    'a refused run naming two entries: one use line each, ONE receipt between them (the audit\'s — never in the refused answer)', twoLines);
  openRow(w);
  const ac = new AbortController(), pidF = path.join(w.work, 'gone.pid');
  const pg = w.door.run({ caller, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: w.work, signal: ac.signal });
  const c0 = await waitCard(w); if (c0) w.door.answer(c0.action.askId, { answer: 'once' });
  for (let k = 0; k < 300 && !fs.existsSync(pidF); k++) await sleep(10);
  ac.abort();
  const rg = await pg;
  const goneUse = w.door.usesFor(caller).uses[0];
  ok(rg.code === 'caller_gone' && goneUse && goneUse.outcome === 'caller_gone' && goneUse.door === 'run' && /^vr-/.test(goneUse.receipt), 'a run whose child RAN with the value and whose caller went away is still a use line (caller_gone, its receipt)', goneUse);
  w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  const VU = R('src/vault-use.js');
  ok(['ask_expired', 'ask_unfiled', 'caller_gone', 'vault_locked'].every((c) => !VU.counts(c)) && ['ask_denied', 'entry_not_runnable', 'use_not_granted'].every((c) => VU.counts(c)), 'the daily-failure count: the owner\'s silence, the hub\'s tray, the agent\'s own cancel and the lock never count; a refusal that IS the actor\'s (denied, closed, not granted) does');
  // the agent's OWN entry: its conversation may ask for it (the mint's scope = the use law's conv)
  const qa = w.door.request({ caller: { ...caller, conversationId: 'conv-x', scope: 'conv-1' }, entry: 'vault://agent:conv-1/gh-token', purpose: 'push the release tag' });
  ok(qa.ok, 'an agent may ask for its OWN minted entry (scope = the use law\'s conv, as vault-mint-put spells it)', qa);
  // a previous process's request: reconcile resolves it (the hub forgot it — and a restart locks the vault anyway)
  const w2 = await world();
  const d1 = w2.mk(); const qx = d1.request({ caller, entry: M1, purpose: PURPOSE });
  const d2 = w2.mk();
  ok(qx.ok && d2.reconcile() >= 1 && !(w2.userTodos.snapshot().open || []).some((x) => x.action && x.action.type === 'vault-grant-ask'), 'boot: a request a previous process filed is resolved (reconcile) — it can never be answered');
  const bounded = []; for (let k = 0; k < 9; k++) bounded.push(w2.door.request({ caller: { ...caller, scope: 'webui-b' }, entry: k < 3 ? ['vault://mounts/m1/secretKey', 'vault://mounts/m2/secretKey', 'vault://app-secrets/app1/item.0.1'][k] : 'vault://mounts/m1/secretKey', purpose: 'p' + k }).code || 'ok');
  ok(bounded.filter((c) => c === 'ok').length === 3 && bounded.slice(3).every((c) => c === 'request_pending'), 'one open request per conversation × entry — each further one for an entry already asked ⇒ request_pending', bounded);
  // the card on the page
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = L.itemView({ id: 'ut-r', sessionKey: 'claude:conv-1', text: 'Lane X asks to use a stored secret', detail: 'Secret: my bucket — ' + M1, urgency: 'high', kind: 'action', status: 'open', createdAt: 1, options: null, reply: null,
    action: { type: 'vault-grant-ask', askId: 'b'.repeat(32) } }, { t: (x) => x, words: 'w', detail: 'd', name: 'Lane X', origin: { origin: 'vault', label: 'Vault' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '' });
  ok(view.actions.slice(0, 3).join() === 'hub-once,grant-8h,hub-deny' && !view.actions.includes('reply'), 'the For-you window: Allow once / For 8 hours / Deny first — no reply box', view.actions);
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  ok(/const GRANT_ANSWERS = \['once', '8h', 'deny'\];/.test(read('src/lib/user-todos-row.js')) && /a === '8h' \? t\('For 8 hours'\)/.test(read('src/lib/user-todos-row.js')) && /a === 'grant-8h' \? '8h'/.test(read('src/lib/inbox-window.js'))
    && /\/api\/vault\/request\/asks\//.test(read('src/lib/user-todos-actions.js')) && R('src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('vault-grant-ask') && /\{ type: 'vault-grant-ask', identity: 'askId',/.test(read('src/foryou-actions.js')), 'the popup row and the window answer once / 8h / deny through POST /api/vault/request/asks/:askId; a typed reply never answers it; one item per request (THE For-you action registry\'s row)');
}

console.log('⑩b THE CAP\'S SHAPE (B-4934, q-043 verify L2): 8 open asks per conversation; hub-wide a count of CONVERSATIONS (32); «N conversations are asking»');
{
  const CAP_ROWS = Array.from({ length: 9 }, (_, k) => ({ entry: `cap${k}`, field: 'secretKey', label: `bucket ${k}`, cipher: 'x'.repeat(60), v: VALUE }));
  ROWS.mounts.push(...CAP_ROWS);
  try {
    const capRef = (k) => `vault://mounts/cap${k}/secretKey`;
    const conv = (k, w) => ({ conversationId: `conv-c${k}`, sessionKey: `claude:conv-c${k}`, name: `Lane C${k}`, cwd: w.work, scope: `webui-c${k}` });
    /** eight conversations × 8 open asks (the table the old 64-request cap called full), then a NINTH conversation's first */
    const capLeg = async (doorMod) => {
      const w = await world({ doorMod });
      const eight = []; for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) eight.push(w.door.request({ caller: conv(k, w), entry: capRef(j), purpose: `job ${j}` }));
      return { w, eight, ninth: w.door.request({ caller: conv(8, w), entry: capRef(0), purpose: 'my first ask' }) };
    };
    const { w, eight, ninth } = await capLeg(DOOR);
    ok(eight.every((r) => r.ok) && ninth.ok && w.door._requests.size === 65, 'eight conversations × 8 open asks (64), then a NINTH conversation\'s first ask is FILED — never refused for the other conversations\' asks', [eight.filter((r) => !r.ok).map((r) => r.code), ninth.code]);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const NEW_CAP = "if (!askers.has(scope) && askers.size >= REQUEST_CALLERS_MAX) return named('too_many_askers');";
    const mOld = SRC.split(NEW_CAP).length === 2 ? M.load('src/server/vault-run-door.js', SRC.replace(NEW_CAP, "if (requests.size >= 64) return named('too_many_requests');"), 'oldcap') : null;
    const old = mOld ? await capLeg(mOld) : null;
    ok(old && old.eight.every((r) => r.ok) && old.ninth.code === 'too_many_requests', 'MUTANT «the hub-wide bound counts REQUESTS (64)» — the pre-fix shape: the ninth conversation\'s first ask is refused too_many_requests ⇒ RED; the shipped door files it', old && old.ninth);
    const over = w.door.request({ caller: conv(0, w), entry: capRef(8), purpose: 'one more' });
    ok(over.code === 'too_many_requests' && over.words === DOOR.MORE_WORDS.too_many_requests && /this conversation already has 8 questions waiting/.test(over.words) && DOOR.statusOf(over.code) === 429 && w.door._requests.size === 65,
      'the PER-CONVERSATION cap holds: one conversation\'s 9th open ask ⇒ too_many_requests BY NAME (429; the words name ITS 8 and `vibespace-vault uses`)', over);
    // THE TRAY LINE: more than 8 conversations asking ⇒ ONE Vault notice, its count in its words
    const lineOf = () => (w.userTodos.snapshot().open || []).filter((i) => i.sessionKey === 'vault' && i.text === DOOR.ASKING_TEXT);
    const L9 = lineOf();
    ok(L9.length === 1 && L9[0].origin === 'vault' && L9[0].kind === 'notice' && !L9[0].action && L9[0].i18n.text.key === '{n} conversations are asking to use stored secrets' && L9[0].i18n.text.params.n === 9,
      'NINE conversations asking (more than 8) ⇒ ONE Vault notice in the owner\'s For you «9 conversations are asking to use stored secrets» — a notice (each ask is its own card)', L9);
    const id9 = L9[0] && L9[0].id;
    const t10 = w.door.request({ caller: conv(9, w), entry: capRef(0), purpose: 'p' });
    const L10 = lineOf();
    ok(t10.ok && L10.length === 1 && L10[0].id === id9 && L10[0].i18n.text.params.n === 10, 'a tenth conversation ⇒ the SAME row says 10 (re-worded in place — never a second row)', L10.map((i) => [i.id, i.i18n.text.params.n]));
    const idsOf = (k) => [...w.door._requests.values()].filter((q) => q.scope === `webui-c${k}`).map((q) => q.askId);
    for (const a of idsOf(9)) w.door.answerRequest(a, { answer: 'deny' });
    ok(lineOf().length === 1 && lineOf()[0].id === id9 && lineOf()[0].i18n.text.params.n === 9, 'an answer lowers it (10 → 9)', lineOf().map((i) => i.i18n.text.params.n));
    for (const a of idsOf(8)) w.door.answerRequest(a, { answer: 'deny' });
    const closed = w.userTodos.get(id9);
    ok(!lineOf().length && closed.status === 'done' && closed.resolvedBy === 'vault', '8 or fewer asking ⇒ the line is closed (by the vault, not the owner)', closed && [closed.status, closed.resolvedBy]);
    // THE HUB-WIDE BOUND counts CONVERSATIONS: 32 asking ⇒ the 33rd refused BY NAME; one already asking still asks
    w.door._reqQuiet.clear();   // (the denies above quieted conv-c8 / c9 × cap0)
    const more = []; for (let k = 8; k < 32; k++) more.push(w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' }));
    const n33 = w.door.request({ caller: conv(32, w), entry: capRef(0), purpose: 'p' });
    const again31 = w.door.request({ caller: conv(31, w), entry: capRef(1), purpose: 'p' });
    ok(more.every((r) => r.ok) && n33.code === 'too_many_askers' && n33.words === DOOR.MORE_WORDS.too_many_askers && /^32 other conversations are waiting on the user's answers already — nothing was filed/.test(n33.words) && DOOR.statusOf('too_many_askers') === 429 && again31.ok,
      '32 conversations asking at once ⇒ the 33rd is refused too_many_askers BY NAME (429; nothing filed) while a conversation ALREADY asking still asks (the bound counts conversations, never requests)', [more.filter((r) => !r.ok).map((r) => r.code), n33, again31.code]);
    ok(lineOf().length === 1 && lineOf()[0].i18n.text.params.n === 32 && !(w.userTodos.snapshot().open || []).some((i) => i.sessionKey === 'claude:conv-c32'), 'the line says 32; the refused 33rd filed nothing', lineOf().map((i) => i.i18n.text.params.n));
    // SET ASIDE by the owner ⇒ quiet while the count moves
    const id32 = lineOf()[0].id;
    w.userTodos.setStatus(id32, 'dismissed', 'user');
    for (const a of idsOf(31)) w.door.answerRequest(a, { answer: 'deny' });
    ok(w.userTodos.get(id32).status === 'dismissed' && !lineOf().length, 'the owner dismissed the line ⇒ it stays dismissed while the count moves (32 → 31) — never reopened under their pointer');
    w.vault.lock('agent');
    ok(!w.door._requests.size && !lineOf().length, 'a LOCK withdraws every request; no line');
    await w.vault.unlock(PW);
    // a NEW episode files it again; a LOCK with the line open closes it; a BOOT closes a previous process's
    for (let k = 0; k < 9; k++) w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' });
    const ep2 = lineOf();
    ok(ep2.length === 1 && ep2[0].i18n.text.params.n === 9, 'a new episode (nine asking after the lock) ⇒ the line again', ep2.map((i) => [i.status, i.i18n.text.params.n]));
    w.vault.lock('agent');
    const atLock = ep2[0] && w.userTodos.get(ep2[0].id);
    ok(atLock && atLock.status === 'done' && atLock.resolvedBy === 'vault' && !lineOf().length, 'a LOCK with the line open closes it (by the vault — one recount after the whole withdrawal)', atLock && [atLock.status, atLock.resolvedBy]);
    await w.vault.unlock(PW);
    for (let k = 0; k < 9; k++) w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' });
    const before = lineOf().length;
    w.mk().reconcile();
    ok(before === 1 && !lineOf().length, 'a BOOT (reconcile): a line a previous process filed is closed — its requests died with it', before);
  } finally { ROWS.mounts.splice(-CAP_ROWS.length); }
}

try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
