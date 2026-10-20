// THE AGENT-OUTPUT SINK CENSUS (lane agent-output-sinks; design q-043 D3 ②③ + §5 P0-b).
//
// A credential an agent's own text carries must never LAND in a store a reader (the owner's For-you tray, a peer in a
// group, anyone with the disk — the incident's pod shell, a PVC snapshot) can read. The five writers that keep an
// agent's own text (design D3 ③: a task PROGRESS note/detail, a vibespace-ask FOR-YOU text/detail, a session-status
// NOTICE, a MESSAGE to a group / its held stash, a JOB's log) each pass it through THE ONE BELT (src/agent-output-belt.js)
// BEFORE it lands: the vault's live-value masker (src/vault-run.js maskText → `[vault:<entry>]`) + the shape census
// (src/secret-shapes.js redactSecrets → «redacted»). This suite plants a sentinel, drives the REAL writers over a SCRATCH
// data dir with a fake unlocked vault, spawns the REAL job-wrapper as the fake child, and reads every store back: ZERO
// raw hits. Two mutants: a writer with its belt stripped LEAKS (RED); a CLI bin the census does not classify is RED.
//
// THE SEAM (base 2.369.326): src/vault-run.js is sibling lane vault-run-model's PURE scrubber (P0-e), not on this base
// yet (the brief: reuse it, rebase when named). The SHAPE leg (redactSecrets) + the belt's maskable-entry enumeration run
// fully here; the LIVE-VALUE leg (maskText + its forms — vault-run.js FORMS) is existsSync-guarded — it activates when vault-run.js lands
// (writing it into the tree would trip test-architecture §51). Verified by hand against 5470a4e1 — see the lane report.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { StringDecoder } from 'node:string_decoder';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const r = (p) => require(path.join(REPO, p));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const SB = r('src/secret-box.js');
const belt = r('src/agent-output-belt.js');
const { UserTodoManager } = r('src/user-todos.js');
const { TaskGroupManager } = r('src/task-groups.js');
const { SessionStatusManager } = r('src/session-status.js');
const deliverMod = r('src/server/conversation-deliver.js');

// ---- sentinels, built at runtime by concatenation (never a literal token in the source — secret-scan safe) ----
const SHAPEMAT = crypto.randomBytes(20).toString('hex');            // the material of a GitHub-PAT shape
const SHAPE = ['gh', 'p', '_'].join('') + SHAPEMAT;                   // redactSecrets R4: the prefix stays, the material goes
const KVMAT = crypto.randomBytes(16).toString('hex');               // the value of a secret-named KV
const KV = 'token=' + KVMAT;                                         // redactSecrets R2: name 'token' ⇒ value «redacted»
const MARKER = 'PLAINMARKER' + crypto.randomBytes(4).toString('hex'); // a non-secret control — it must SURVIVE
const LIVEID = 'sinkprobe-' + crypto.randomBytes(4).toString('hex');
const LIVEVAL = 'LIVEVAL' + crypto.randomBytes(16).toString('hex');  // a planted vault value (non-shape)
const HOSTVAL = 'HOSTVAL' + crypto.randomBytes(16).toString('hex');  // a host: token — never shown, never masked
const leaks = (hay, needle) => String(hay).includes(needle);

// ---- a scratch data dir with a FAKE unlocked vault (never production; the belt reaches it via SB.vaultForDir) ----
const dataDir = scratch('aos-data');
fs.mkdirSync(dataDir, { recursive: true });
SB.registerVault(dataDir, {
  state: () => 'unlocked',
  secretNames: () => [{ name: 'apikey:' + LIVEID, at: 1 }, { name: 'host:box', at: 2 }],
  secretGet: (n) => n === 'apikey:' + LIVEID ? { ok: true, value: Buffer.from(LIVEVAL, 'utf8') }
    : n === 'host:box' ? { ok: true, value: Buffer.from(HOSTVAL, 'utf8') }
      : { ok: true, value: null },
});
// lane vault-scrub-forms (q-043 verify M1): the value in every NEW spelling a real producer prints by itself — built here
// with Node's own codecs or from the spec, never with src/vault-run.js
const spellingsOf = (v) => {
  const b = Buffer.from(v), dec = (x) => { const d = new StringDecoder('utf8'); return d.write(x) + d.end(); };
  const bits = [...b].map((x) => x.toString(2).padStart(8, '0')).join('');
  let b32 = ''; for (let i = 0; i < bits.length; i += 5) b32 += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  const qp = [...b].map((x) => (x >= 33 && x <= 126 && x !== 61 ? String.fromCharCode(x) : '=' + x.toString(16).padStart(2, '0').toUpperCase()));
  return [
    ['UTF-16LE (PowerShell Out-File)', dec(Buffer.from(v, 'utf16le'))], ['UTF-16BE', dec(Buffer.from(v, 'utf16le').swap16())],
    ['base32 (oathtool -v)', b32 + '='.repeat((8 - (b32.length % 8)) % 8)], ['base32, lower-case, unpadded', b32.toLowerCase()],
    ['quoted-printable, a soft break inside', qp.slice(0, 9).join('') + '=\r\n' + qp.slice(9).join('')],
    ['\\xNN every byte', [...b].map((x) => '\\x' + x.toString(16).padStart(2, '0')).join('')], ['\\u{…} every character', [...v].map((c) => '\\u{' + c.codePointAt(0).toString(16) + '}').join('')],
    ['HTML entities &#NN;', [...v].map((c) => '&#' + c.codePointAt(0) + ';').join('')], ['colour escapes every 4 characters', [...v].map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join('')],
    ['base64 wrapped every 20 columns', b.toString('base64').replace(/(.{20})(?=.)/g, '$1\n')],
  ];
};
const readFile = (f) => { try { return fs.readFileSync(path.join(dataDir, f), 'utf8'); } catch { return ''; } };

// ---------------------------------------------------------------------------
console.log('§1 the five writers pass a SHAPE sentinel through the belt before it lands');
// --- user-todos (vibespace-ask / For-you) ---
const todos = new UserTodoManager({ dataDir, onChange: () => {} });
todos.add('sess-a', { text: 'ask ' + SHAPE, detail: 'detail ' + KV, origin: 'agent' });
todos.add('sess-ctl', { text: MARKER + ' a plain working note (no secret)', origin: 'agent' });
todos._flush();
{
  const f = readFile('user-todos.json');
  ok(!leaks(f, SHAPEMAT) && !leaks(f, KVMAT), 'user-todos.json carries no raw secret material (text + detail belted)');
  ok(leaks(f, '«redacted»'), 'user-todos.json shows «redacted» where the secret was');
  ok(leaks(f, MARKER), 'user-todos.json keeps the non-secret marker (the belt is not a blanket wipe) [control]');
}
// --- task-groups (vibespace-task progress) ---
const tg = new TaskGroupManager({ dataDir, onChange: () => {}, readUserState: () => ({}), getSetting: () => undefined, isPathShadowed: () => false });
const grp = tg.create({ title: 'sink census', kind: 'task' });
tg.addProgress(grp.id, { note: 'progress ' + SHAPE, detail: 'ctx ' + KV });
{
  const f = readFile('task-groups.json');
  ok(!leaks(f, SHAPEMAT) && !leaks(f, KVMAT), 'task-groups.json carries no raw secret material (note + detail belted)');
  ok(leaks(f, '«redacted»'), 'task-groups.json shows «redacted» where the secret was');
}
// --- session-status (vibespace-status notice) ---
const ss = new SessionStatusManager({ dataDir, onChange: () => {} });
ss.setByAgent('sess-a', { state: 'working', reason: 'why ' + SHAPE, detail: 'more ' + KV });
ss._flush();
{
  const f = readFile('session-status.json');
  ok(!leaks(f, SHAPEMAT) && !leaks(f, KVMAT), 'session-status.json carries no raw secret material (reason + detail belted)');
}
// --- conversation-deliver (vibespace-msg held stash) ---
const deliver = deliverMod.create({
  dataDir, peerMsg: { findPeer: () => null }, getHosts: () => [], getConvIndex: () => null,
  serverSetting: () => undefined, activeSessions: () => ({}), emitPeerCard: () => {},
});
deliver.stashFor('cid-a', { text: 'message ' + SHAPE + ' ' + KV, source: 'agent' });
deliver.flush();
{
  const f = readFile('msg-stash.json');
  ok(!leaks(f, SHAPEMAT) && !leaks(f, KVMAT), 'msg-stash.json carries no raw secret material (stashed message belted)');
}

// ---------------------------------------------------------------------------
console.log('§2a the belt enumerates only the AGENT-REACHABLE secrets (host: / file: never shown, never masked)');
{
  const labels = belt.maskableSecrets(SB.vaultForDir(dataDir)).map((x) => x.label);
  ok(labels.includes('apikey:' + LIVEID), 'an apikey: entry is maskable (agent-reachable)');
  ok(!labels.includes('host:box'), 'a host: entry is NOT maskable (the vault never shows it to an agent)');
  ok(belt.maskableSecrets({ state: () => 'locked', secretNames: () => [], secretGet: () => null }).length === 0, 'a LOCKED vault yields no maskable values (nothing to read)');
}

// ---------------------------------------------------------------------------
console.log('§2b the LIVE-VALUE leg — a planted vault value and its forms reach ZERO sink (vault-run.js seam)');
const HAVE_VR = fs.existsSync(path.join(REPO, 'src/vault-run.js'));
if (!HAVE_VR) {
  console.log('  — SKIP: src/vault-run.js is sibling lane vault-run-model (P0-e), not on this base. The live-value');
  console.log('    leg activates at the rebase; verified by hand against 5470a4e1 (see the lane report). The shape leg');
  console.log('    above and the enumeration in §2a run fully, so this suite is not vacuous on this base.');
} else {
  const b64 = Buffer.from(LIVEVAL, 'utf8').toString('base64');
  const todos2 = new UserTodoManager({ dataDir, onChange: () => {} });
  todos2.add('sess-live', { text: 'raw ' + LIVEVAL, detail: 'b64 ' + b64, origin: 'agent' });
  todos2._flush();
  const f = readFile('user-todos.json');
  ok(!leaks(f, LIVEVAL) && !leaks(f, b64), 'a live vault value and its base64 form reach ZERO sink');
  ok(leaks(f, '[vault:apikey:' + LIVEID + ']'), 'the value is replaced by its [vault:<entry>] placeholder');
  ok(!leaks(f, HOSTVAL), 'a host: value is still never in a sink (it was never masked because it is never shown)');
  // lane vault-scrub-forms: the same live value in every new spelling, through the same sink — read back from the stored
  // fields (not the file's JSON text, which escapes a NUL or an ESC and would hide a leak)
  const SP = spellingsOf(LIVEVAL), PHL = '[vault:apikey:' + LIVEID + ']';
  const todos3 = new UserTodoManager({ dataDir, onChange: () => {} });
  for (const [name, text] of SP) todos3.add('sess-live-forms', { text: 'the value as ' + name, detail: '<' + text + '>', origin: 'agent' });
  todos3._flush();
  const strings = []; (function walk(x) { if (typeof x === 'string') strings.push(x); else if (x && typeof x === 'object') for (const y of Object.values(x)) walk(y); })(JSON.parse(readFile('user-todos.json') || '{}'));
  const kept = SP.filter(([, s]) => strings.some((x) => x.includes(s))).map(([n]) => n);
  ok(!kept.length && strings.filter((x) => x === '<' + PHL + '>').length >= SP.length && !strings.some((x) => x.includes(LIVEVAL)), `the live value in ${SP.length} more spellings a real tool prints (${SP.map(([n]) => n).join(', ')}) reaches ZERO sink: each stored detail is exactly «<${PHL}>»${kept.length ? ' — KEPT: ' + kept.join(', ') : ''}`);
}

// ---------------------------------------------------------------------------
console.log('§3 the JOB LOG — the real job-wrapper masks a fake child’s output (shapes, chunk-split)');
{
  const ctl = scratch('aos-job');
  fs.mkdirSync(ctl, { recursive: true });
  // the fake child prints a shape, then the same shape split across two writes (chunk-split residual is documented,
  // but a whole-chunk shape must be caught)
  const childScript = `process.stdout.write('out token=' + ${JSON.stringify(KVMAT)} + '\\n'); process.stdout.write('split tok' + 'en=' + ${JSON.stringify(KVMAT)} + '\\n');`;
  const spec = { argv: [process.execPath, '-e', childScript], cwd: ctl, env: { PATH: process.env.PATH }, logCapBytes: 1 << 20, stdinOpen: false };
  const wrapper = path.join(REPO, 'data', 'bin', 'job-wrapper.js');
  const res = spawnSync(process.execPath, [wrapper, ctl, Buffer.from(JSON.stringify(spec)).toString('base64')], { timeout: 15000 });
  // the wrapper is detached-style but spawnSync waits for it; the child is tiny
  const log = (() => { try { return fs.readFileSync(path.join(ctl, 'current.log'), 'utf8'); } catch { return ''; } })();
  ok(log.length > 0, 'the job log was written');
  ok(!leaks(log, 'token=' + KVMAT), 'a whole-chunk shape in the child output is masked in the job log');
  ok(leaks(log, '«redacted»'), 'the job log shows «redacted» where the secret was');
}

// ---------------------------------------------------------------------------
console.log('§4 MUTANT 1 — a writer with its belt stripped LEAKS the sentinel (the belt is load-bearing)');
{
  const Module = require('module');
  const abs = path.join(REPO, 'src/user-todos.js');
  let src = fs.readFileSync(abs, 'utf8');
  const before = src;
  src = src.replace('belt.maskForSink(text.trim(), { dataDir: _dataDir })', 'text.trim()')
           .replace('belt.maskForSink(detail.trim(), { dataDir: _dataDir })', 'detail.trim()');
  ok(src !== before, 'MUTANT 1 setup: the belt calls were found and removed from a user-todos copy');
  const m = new Module(abs); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs));
  m._compile(src, abs);
  const dirM = scratch('aos-mutant');
  fs.mkdirSync(dirM, { recursive: true });
  SB.registerVault(dirM, { state: () => 'unlocked', secretNames: () => [{ name: 'apikey:' + LIVEID, at: 1 }], secretGet: () => ({ ok: true, value: Buffer.from(LIVEVAL, 'utf8') }) });
  const mut = new m.exports.UserTodoManager({ dataDir: dirM, onChange: () => {} });
  mut.add('sess-m', { text: 'ask ' + SHAPE, detail: 'd ' + KV, origin: 'agent' });
  mut._flush();
  const fM = (() => { try { return fs.readFileSync(path.join(dirM, 'user-todos.json'), 'utf8'); } catch { return ''; } })();
  ok(leaks(fM, SHAPEMAT) || leaks(fM, KVMAT), 'MUTANT 1: the belt-stripped writer LEAKS the sentinel (so the real belt is what stops it)');
}

// ---------------------------------------------------------------------------
console.log('§5 THE BIN CENSUS — every agent CLI that can carry text to a sink is classified (MUTANT 2: an extra bin is RED)');
{
  const REG = r('src/agent-cli-registry.js');
  const rows = (REG.ROWS || REG.default || []).map((x) => x.name).filter(Boolean);
  // every bin is EITHER a writer whose text the belt masks (its sink + the writer it reaches) OR declared sink-free
  const CLASS = {
    'vibespace-task': 'sink: task-groups progress note/detail — belted (src/task-groups.js addProgress)',
    'vibespace-ask': 'sink: user-todos For-you text/detail — belted (src/user-todos.js add)',
    'vibespace-status': 'sink: session-status notice reason/detail — belted (src/session-status.js _validate)',
    'vibespace-msg': 'sink: group log + msg-stash — belted (groups-engine appendIn, conversation-deliver stashFor)',
    'vibespace-job': 'sink: job log — the job-wrapper masks the child output (data/bin/job-wrapper.js)',
    'vibespace-channels': 'no agent-authored sink: a send is a PROPOSAL the owner edits; raw-api output has its own redaction',
    'vibespace-feedback': 'no store a reader shares: feedback goes to the maintainers’ own store (feedback-store)',
    'vibespace-page': 'no agent-text sink in this lane: a published page is the owner’s surface',
    'vibespace-design': 'no agent-text credential sink: a design canvas is drawings, not an agent’s prose output',
    'vibespace-exit': 'already belted upstream: exit output heads pass secret-shapes (exit-reach.js) — not this lane',
    'vibespace-remote': 'no agent-authored store sink: a remote shell’s output is the agent’s own read, not a shared store',
    'vibespace-window': 'no store sink: window targets are ids/rects, not agent prose',
    'vibespace-browser': 'no agent-text store sink: browser traces have their own redaction (browser-trace.js)',
    'vibespace-app': 'no agent-text store sink: app manifests/state are structured, not an agent’s prose',
    'vibespace-vault': 'no agent-text sink: it prints only receipts (design D3 ①; P0-c)',
    'vibespace-api': 'no agent-text store sink: an api call’s card words come from the spec',
    'vibespace-docs': 'no sink: it only reads the manuals',
  };
  const census = (bins) => bins.filter((b) => !(b in CLASS));
  ok(rows.length >= 15, `the registry lists the agent CLIs (${rows.length} rows)`);
  const universe = Array.from(new Set(rows));
  ok(census(universe).length === 0, `every agent CLI bin is classified (sink or sink-free)${census(universe).length ? ' — unclassified: ' + census(universe).join(', ') : ''}`);
  // MUTANT 2: one more bin the census does not know ⇒ RED
  ok(census([...universe, 'vibespace-ghost']).length === 1, 'MUTANT 2: a registry with one more bin not in the census is RED');
  // the five sink writers are all present and classified as sinks
  const sinks = Object.entries(CLASS).filter(([, v]) => v.startsWith('sink:')).map(([k]) => k);
  ok(sinks.length === 5 && sinks.every((b) => universe.includes(b)), `the five sink writers are named and present (${sinks.join(', ')})`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
