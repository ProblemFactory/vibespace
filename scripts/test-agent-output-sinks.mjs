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
const readFileIn = (d, f) => { try { return fs.readFileSync(path.join(d, f), 'utf8'); } catch { return ''; } };

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
console.log('§3 the JOB LOG — the real job-wrapper masks a fake child’s output (shapes, chunk-split), its spec handed the engine’s way');
{
  // lane mirror-331-reds-security (the .331 mirror's red): job-spec-off-argv (.331) moved the spec off argv into a 0600
  // FILE of the run's ctl dir — `[wrapper, ctlDir, specPath]` (src/jobs.js). This leg still handed it base64 on argv:
  // the wrapper REFUSED the run by name and two of the three checks passed on the refusal line. The leg now writes the
  // spec as the engine does, a run that did not RUN is red, and the engine's own road + a stripped masker are legs.
  // the fake child prints a shape, then the same shape split across two writes (chunk-split residual is documented,
  // but a whole-chunk shape must be caught)
  const childScript = `process.stdout.write('out token=' + ${JSON.stringify(KVMAT)} + '\\n'); process.stdout.write('split tok' + 'en=' + ${JSON.stringify(KVMAT)} + '\\n');`;
  const wrapper = path.join(REPO, 'data', 'bin', 'job-wrapper.js');
  const readLog = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  const runWrapper = (wrapperPath, tag, { onArgv = false, outside = false } = {}) => {
    const ctl = scratch('aos-job-' + tag);
    fs.mkdirSync(ctl, { recursive: true });
    const spec = { argv: [process.execPath, '-e', childScript], cwd: ctl, env: { PATH: process.env.PATH }, logCapBytes: 1 << 20, stdinOpen: false };
    let arg = Buffer.from(JSON.stringify(spec)).toString('base64'), specPath = null;
    if (!onArgv) { // the engine's way: 0600 at open, O_EXCL, a fresh name per start, in the ctl dir
      specPath = arg = path.join(outside ? path.dirname(ctl) : ctl, `spec.${Date.now()}.json`); // outside: a path the wrapper never reads nor removes
      const fd = fs.openSync(specPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
      try { fs.writeSync(fd, JSON.stringify(spec)); } finally { fs.closeSync(fd); }
    }
    // the wrapper is detached-style but spawnSync waits for it; the child is tiny
    spawnSync(process.execPath, [wrapperPath, ctl, arg], { timeout: 15000, env: { PATH: process.env.PATH } });
    return { log: readLog(path.join(ctl, 'current.log')), specLeft: !!specPath && fs.existsSync(specPath) };
  };
  // the run RAN: the child's own words are in the log and no refusal line (a refused spec writes ONE named line)
  const ran = (log) => log.includes('out ') && log.includes('split ') && !log.includes('[job-wrapper] refused');
  const real = runWrapper(wrapper, 'file');
  ok(real.log.length > 0, 'the job log was written');
  ok(ran(real.log) && !real.specLeft, 'the run RAN: the child’s own lines are in the log, no refusal line, the spec file consumed (read once, unlinked)');
  ok(!leaks(real.log, 'token=' + KVMAT), 'a whole-chunk shape in the child output is masked in the job log');
  ok(leaks(real.log, '«redacted»'), 'the job log shows «redacted» where the secret was');
  // CONTROL — a refused run (a spec path outside the ctl dir): refused BY NAME, and the RAN check is red on it. The base's
  // call (the spec base64 on argv — a ≤ .330 server's) is NEVER RUN since lane job-wrapper-proto1-retire (2.369.340: the
  // protocol-1 compat lane job-wrapper-update-window kept for an update's window is gone): «not started», and the job's
  // words never reach the log — the row after.
  const old = runWrapper(wrapper, 'outside', { outside: true });
  ok(old.log.includes('[job-wrapper] refused: the spec path names no file of the ctl dir') && !ran(old.log), 'CONTROL: a spec path outside the ctl dir is refused by name — the RAN check is red on it, so the leg can no longer pass on a refusal');
  const v330 = runWrapper(wrapper, 'argv', { onArgv: true });
  ok(!ran(v330.log) && v330.log.startsWith('[job-wrapper] not started: the server spoke protocol 1 (a server older than 2.369.331)') && !leaks(v330.log, KVMAT), 'a .330 server’s call (the spec base64 on argv — an update’s window) is NOT run: the log says «not started» by name, and no word of the job (nor its secret) reaches it');
  // MUTANT 3 — the wrapper's maskChunk returns the raw chunk (its shape census still required from this tree): the log LEAKS
  const W0 = fs.readFileSync(wrapper, 'utf8');
  const REQ = "require(path.join(__dirname, '..', '..', 'src', 'secret-shapes.js'))", RET = "return out === text ? buf : Buffer.from(out, 'utf8');";
  const mutDir = scratch('aos-job-mut'); fs.mkdirSync(mutDir, { recursive: true });
  const mutPath = path.join(mutDir, 'job-wrapper.js');
  fs.writeFileSync(mutPath, W0.replace(REQ, `require(${JSON.stringify(path.join(REPO, 'src', 'secret-shapes.js'))})`).replace(RET, 'return buf;'));
  const mut = W0.split(REQ).length === 2 && W0.split(RET).length === 2 ? runWrapper(mutPath, 'mut') : { log: '' };
  ok(ran(mut.log) && leaks(mut.log, 'token=' + KVMAT), 'MUTANT 3: a wrapper whose masker returns the raw chunk LEAKS the shape into the job log (so the masker is what stops it)');
  // THE ENGINE'S OWN ROAD: a task the real JobManager starts — src/jobs.js writes the spec file and spawns
  // <dataDir>/bin/job-wrapper.js, here a SYMLINK to this tree's wrapper (production: dataDir is <repo>/data, so the
  // wrapper's own `../../src` is this tree; a COPY elsewhere loses its masker) — prints the shape; its run's log is masked
  const { JobManager } = r('src/jobs.js');
  const dd = scratch('aos-jobs-engine');
  fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
  fs.symlinkSync(wrapper, path.join(dd, 'bin', 'job-wrapper.js'));
  const E = new JobManager({ dataDir: dd, broadcast: () => {}, notifyUser: () => {}, log: () => {} });
  E.init();
  const owner = { conversation: { backend: 'claude', id: 'conv-aos' }, sessionId: 'sess-aos', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
  const made = E.create({ kind: 'task', name: 'aos-shape', cmd: { argv: [process.execPath, '-e', childScript], cwd: dd }, owner }, { conversationId: 'conv-aos', sessionId: 'sess-aos', sessionCreatedAt: 1, groups: new Set() });
  const job = made.job && E.jobs.get(made.job.id);
  const runLog = job && job.runs && job.runs.length ? job.runs[job.runs.length - 1].log : null;
  let elog = '';
  for (let i = 0; i < 75 && runLog; i++) { elog = readLog(runLog); if (elog.includes('[job-wrapper] exit')) break; await new Promise((res) => setTimeout(res, 200)); }
  ok(!made.error && ran(elog) && !leaks(elog, 'token=' + KVMAT) && leaks(elog, '«redacted»'), 'THE ENGINE’S ROAD: a job the real JobManager starts prints the shape — its run’s log ran, is masked and shows «redacted»', made.error || elog.slice(0, 300));
  try { E.shutdown(); for (const t of E._timers || []) clearInterval(t); } catch { }
}

// ---------------------------------------------------------------------------
// lane job-notify-user r2 → r3: THE JOBS ROAD TO A PERSON — --notify-user made it the documented way to reach the owner's
// tray, and a notify cron's --text (`token=…`) landed there raw (r2: the store belted only origin 'agent'). r3: the mask
// covers the AGENT's words as FIELDS, never the product's sentence — `jobs` is an AGENT-FIELDS origin (src/inbox-origin.js):
// the engine files a template + fields (src/job-model.js FOR_YOU_WORDS), the store belts each field on its own (r2 belted
// the whole sentence: a job named refresh-token read «Task refresh-token: «redacted»», the outcome gone). On the message
// road the job's NAME is belted on every copy (the header, the chat card's label, the stash, the retry meta), the agent's
// own --text returns to its AUTHOR whole, and a SUBSCRIBER (another conversation) gets it belted. The real wiring over a
// real store; a raw PIECE (12 characters of the material) is the needle — the header cuts a name at 40 characters
console.log('§3b the JOBS ROAD — the real jobs wiring: the agent\'s words as FIELDS (For you, a subscriber, every label), the author\'s own reminder whole');
{
  const JW = r('src/server/jobs-wiring.js');
  const dj = scratch('aos-jobs-road');
  fs.mkdirSync(dj, { recursive: true });
  const tj = new UserTodoManager({ dataDir: dj, onChange: () => {} });
  const told = [];
  const w = JW.create({ app: { get() {}, post() {}, put() {}, delete() {}, patch() {}, use() {} }, dataDir: dj, broadcastAll() {}, userTodos: tj, log() {}, serverSetting: () => undefined, taskGroups: null, activeSessions: new Map(),
    deliver: { peerReachable: () => true, deliverToConversation: async (cid, text, opts) => { told.push({ cid, text, fromName: opts && opts.fromName, meta: opts && opts.retry && opts.retry.meta }); return { ok: true, lane: 'message' }; }, onRetry() {}, registerStashJudge() {} } });
  const E = w.jm;
  E.init(); for (const t of E._timers || []) clearInterval(t);
  E._spawn = (job, trigger) => { job.runs = job.runs || []; job.runs.push({ startedAt: Date.now(), trigger }); job.state = 'up'; };
  const owner = { conversation: { id: 'conv-road' }, sessionId: 'sess-road', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
  const caller = { conversationId: 'conv-road', sessionId: 'sess-road', sessionCreatedAt: 1, groups: new Set() };
  const piece = (h) => leaks(h, SHAPEMAT.slice(0, 12)) || leaks(h, KVMAT.slice(0, 12));
  const TEXT = 'deploy ' + MARKER + ' ' + SHAPE + ' ' + KV;
  const nc = E.jobs.get(E.create({ kind: 'cron', name: 'road-nc', schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: TEXT }, notifyUser: true, owner }, caller).job.id);
  nc.subscribers = [{ conversationId: 'conv-sub' }];
  nc.nextFireAt = Date.now() - 1000;
  await E._cronTick(); await new Promise((res) => setTimeout(res, 30));
  const tk = E.jobs.get(E.create({ kind: 'task', name: 'road ' + SHAPE, cmd: { argv: ['true'] }, notifyUser: true, owner }, caller).job.id);
  E._finalizeRun(tk, tk.runs[tk.runs.length - 1], { code: 0, endedAt: Date.now() }, 'sweep');
  const rt = E.jobs.get(E.create({ kind: 'task', name: 'refresh-token', cmd: { argv: ['true'] }, notifyUser: true, owner }, caller).job.id);
  E._finalizeRun(rt, rt.runs[rt.runs.length - 1], { code: 0, endedAt: Date.now() }, 'sweep');
  await new Promise((res) => setTimeout(res, 30));
  tj._flush(); E._save();
  const f = readFileIn(dj, 'user-todos.json');
  const items = tj.snapshot().open.filter((i) => i.origin === 'jobs');
  ok(items.length === 3 && !piece(f) && leaks(f, '«redacted»') && leaks(f, MARKER), 'user-todos.json: a job\'s For-you copies (a notify cron\'s --text, a task\'s NAME in the sentence and the label) carry no raw piece, the marker survives');
  const rtItem = items.find((i) => i.jobId === rt.id);
  ok(rtItem && rtItem.text === 'Task refresh-token: done (ok)' && /· refresh-token$|^refresh-token$/.test(rtItem.sessionName || ''), 'a job NAMED with a secret word keeps the product\'s sentence whole — «Task refresh-token: done (ok)» (r2: «Task refresh-token: «redacted»»)', rtItem && [rtItem.text, rtItem.sessionName]);
  const toOwner = told.filter((x) => x.cid === 'conv-road'), toSub = told.filter((x) => x.cid === 'conv-sub');
  ok(toOwner.some((x) => leaks(x.text, TEXT)), 'the AUTHOR gets its own reminder WHOLE — the owner conversation that wrote the --text (the belt protects a person and other agents, never the author from itself)', toOwner.map((x) => x.text.slice(0, 160)));
  ok(toSub.length === 1 && !piece(toSub[0].text) && leaks(toSub[0].text, MARKER) && leaks(toSub[0].text, '«redacted»'), 'a SUBSCRIBER (another conversation) gets it belted, the marker kept', toSub.map((x) => x.text.slice(0, 160)));
  // the NAME's copies only — the owner's retry meta / stash TEXT is its own reminder (whole, above); the two task ends land
  // inside the owner's 30 s floor, so their message is the STASH entry (its jobName — the label the drain and the spill print)
  const stashNames = [...E.pendingNotifs.values()].flat().map((n) => n.jobName);
  const labels = told.map((x) => [x.fromName, x.meta && x.meta.jobName, x.text.split('):')[0]]).flat().concat(stashNames).filter(Boolean);
  ok(told.length >= 2 && stashNames.length >= 1 && !labels.some(piece) && labels.some((l) => /road-ghp_«redacted»/.test(l)), 'the job\'s NAME is belted on every message-road copy — the chat card\'s label (fromName), the header, the retry meta, the stash (claim r2-0 (b): it reached the chat raw)', labels);
  try { E.shutdown(); } catch { }
}
{
  // THE ORIGIN CENSUS: every For-you origin is classified — the agent's WHOLE words, the agent's words as FIELDS in the
  // product's sentence, or a producer's own sentence; each class IS the store's set (a new origin is a decision, red by name)
  const { INBOX_ORIGINS, AGENT_WORDS_ORIGINS, AGENT_FIELDS_ORIGINS } = r('src/inbox-origin.js');
  const ORIGIN_CLASS = {
    agent: 'agent words: vibespace-ask — the agent\'s own item (its text, detail, params; never its conversation\'s name)',
    jobs: 'agent fields: a job\'s NAME and a notify cron\'s --text as fields of the product\'s sentence (src/server/jobs-wiring.js, lane job-notify-user r3)',
    spend: 'producer: the spend engine\'s sentence (a cap, a total)', login: 'producer: a login-expiry notice', pool: 'producer: the account pool\'s notice',
    channels: 'producer: a channel card drawn from the call\'s facts (vibespace-channels\' own lane and its redaction)', browser: 'producer: a browser login / profile notice',
    machines: 'producer: exit-proxy\'s approval card — its detail is the command a person reads above Allow (exit-reach.js\'s law, not this belt)',
    vault: 'producer: a vault notice (entry names, never a value)', apps: 'producer: the apps engine\'s proposal card', plugin: 'producer: a built-in plugin\'s own reminder', server: 'producer: the server\'s own notice',
  };
  const unclassified = (origins) => origins.filter((o) => !(o in ORIGIN_CLASS));
  ok(unclassified([...INBOX_ORIGINS]).length === 0, `every For-you origin is classified (${INBOX_ORIGINS.length})${unclassified([...INBOX_ORIGINS]).length ? ' — unclassified: ' + unclassified([...INBOX_ORIGINS]).join(', ') : ''}`);
  const cls = (c) => Object.entries(ORIGIN_CLASS).filter(([, v]) => v.startsWith(c)).map(([k]) => k).sort();
  ok(JSON.stringify(cls('agent words')) === JSON.stringify([...AGENT_WORDS_ORIGINS].sort()) && JSON.stringify(cls('agent fields')) === JSON.stringify([...AGENT_FIELDS_ORIGINS].sort()), `the store belts EXACTLY these — whole words (${cls('agent words').join(', ')}), fields (${cls('agent fields').join(', ')})`);
  ok(unclassified([...INBOX_ORIGINS, 'ghost']).join() === 'ghost', 'CONTROL: one more origin the census does not know is RED by name');
  // …EXTENDED TO THE WRITERS (lane job-notify-user r3, claim r2-0 (a)): a filer of a FIELDS origin outside the listed set is red
  // by name — a planted second filer with origin 'jobs' stayed green under §93 (it counts the belt's callers, not the filers)
  const FIELDS_FILERS = { 'src/server/jobs-wiring.js': 2 };   // notifyUser (every copy the engine files) + noticeDropped
  const files = {};
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) files[rel] = fs.readFileSync(path.join(REPO, rel), 'utf8'); } };
  walk('src'); files['server.js'] = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const filers = (fs0) => {
    const out = {}, bad = [];
    const re = new RegExp(String.raw`origin:\s*['"](${AGENT_FIELDS_ORIGINS.join('|')})['"]`, 'g');
    for (const [rel, src] of Object.entries(fs0)) {
      const lines = src.split('\n');
      lines.forEach((l, i) => { if (/^\s*(\/\/|\*)/.test(l)) return; for (const m of l.matchAll(re)) { out[rel] = (out[rel] || 0) + 1; if (!(rel in FIELDS_FILERS)) bad.push(`${rel}:${i + 1} files origin '${m[1]}' (an agent-fields origin) — not one of the listed filers`); } });
    }
    for (const [rel, n] of Object.entries(FIELDS_FILERS)) if ((out[rel] || 0) !== n) bad.push(`${rel} files ${out[rel] || 0} agent-fields item(s), the census lists ${n}`);
    return bad;
  };
  const tree = filers(files);
  ok(tree.length === 0, `every filer of an agent-fields origin is a listed one (${Object.entries(FIELDS_FILERS).map(([k, n]) => k.replace(/^src\//, '') + ' ×' + n).join(', ')})${tree.length ? ' — ' + tree.join('; ') : ''}`);
  const ghost = filers({ ...files, 'src/server/ghost-jobs.js': "function f(userTodos) {\n  userTodos.add('jobs', { origin: 'jobs', text: 'x' });\n}\n" });
  ok(ghost.length === 1 && /^src\/server\/ghost-jobs\.js:2 files origin 'jobs'/.test(ghost[0]), 'CONTROL: a planted second filer with origin \'jobs\' (src/server/ghost-jobs.js) is RED by name', ghost);
  // …and the store refuses what such a filer would file: a fields item with a composed sentence (never belted whole)
  const dg = scratch('aos-ghost'); fs.mkdirSync(dg, { recursive: true });
  const tg = new UserTodoManager({ dataDir: dg, onChange: () => {} });
  let gerr = ''; try { tg.add('jobs', { origin: 'jobs', text: 'Task x ' + SHAPE + ': done (ok)' }); } catch (e) { gerr = e.message; }
  ok(/files its words as i18n \{key, params\}/.test(gerr) && tg.snapshot().open.length === 0, 'the store REFUSES a jobs filing with a composed text (fail closed: the fields are what it belts)', gerr);
  // THE WRITER BY WHAT IT WRITES (lane job-notify-user r4, claim r3-1 FINDING 2): the census above reads the literal — a filer
  // spelling the origin 'jo' + 'bs', AGENT_FIELDS_ORIGINS[0] or a template literal stayed green in both censuses. The STORE
  // asserts its caller for a fields origin (src/inbox-origin.js FIELDS_FILERS): each planted shape, compiled as a module AT
  // src/server/ghost-jobs.js (in memory — nothing is written into the tree), files into a REAL store and is refused BY NAME;
  // CONTROL: the very same code compiled at the listed filer's path files
  const { FIELDS_FILERS: FF } = require(path.join(REPO, 'src/inbox-origin.js'));
  ok(JSON.stringify(Object.keys(FF)) === JSON.stringify([...AGENT_FIELDS_ORIGINS]) && Object.entries(FF).every(([o, fs0]) => fs0.every((f) => f in FIELDS_FILERS)), 'the store\'s filer table (FIELDS_FILERS) names one listed filer per fields origin — the census above counts the same files', JSON.stringify(FF));
  const Mod = require('module');
  const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const GHOSTS = {
    "'jo' + 'bs'": "'jo' + 'bs'",
    'AGENT_FIELDS_ORIGINS[0]': "require('../inbox-origin.js').AGENT_FIELDS_ORIGINS[0]",
    'a template literal': "`${'jo'}bs`",
    "the literal origin: 'jobs'": "'jobs'",
  };
  const wd = scratch('aos-writer'); fs.mkdirSync(wd, { recursive: true });
  const wt = new UserTodoManager({ dataDir: wd, onChange: () => {}, expirySweepMs: 0 });
  const fileVia = (rel, expr) => { try { asModule(rel, `module.exports = (t) => t.add('claude:conv-ghost', { origin: ${expr}, by: 'agent', jobId: 'jb-0000a0a0', jobFact: 'ask', jobName: 'ghost', i18n: { text: { key: '{name} needs your input', params: { name: 'ghost' } } } });`)(wt); return null; } catch (e) { return e.message; } };
  const said = Object.fromEntries(Object.entries(GHOSTS).map(([n, expr]) => [n, fileVia('src/server/ghost-jobs.js', expr)]));
  const named = Object.entries(said).filter(([, m]) => /^origin 'jobs' is filed only by src\/server\/jobs-wiring\.js — src\/server\/ghost-jobs\.js is not its filer$/.test(m || ''));
  ok(named.length === 4 && wt.snapshot().open.length === 0, `every planted writer of origin 'jobs' — ${Object.keys(GHOSTS).join(', ')} — is REFUSED by the store BY NAME (src/server/ghost-jobs.js is not its filer)`, JSON.stringify(said));
  const listed = fileVia('src/server/jobs-wiring.js', GHOSTS["'jo' + 'bs'"]);
  ok(listed === null && wt.snapshot().open.length === 1, 'CONTROL: the same code at the listed filer\'s path (src/server/jobs-wiring.js) files — the store reads its CALLER, not a blanket refusal', listed);
  wt.stop && wt.stop();
}

// ---------------------------------------------------------------------------
console.log('§4 MUTANT 1 — a writer with its belt stripped LEAKS the sentinel (the belt is load-bearing)');
{
  const Module = require('module');
  const abs = path.join(REPO, 'src/user-todos.js');
  let src = fs.readFileSync(abs, 'utf8');
  const before = src;
  src = src.replace('beltOf(text.trim())', 'text.trim()').replace('beltOf(detail.trim())', 'detail.trim()');
  ok(src !== before, 'MUTANT 1 setup: the belt calls were found and removed from a user-todos copy');
  const load = (code, tag) => { const m = new Module(abs); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
  const dirM = scratch('aos-mutant');
  fs.mkdirSync(dirM, { recursive: true });
  SB.registerVault(dirM, { state: () => 'unlocked', secretNames: () => [{ name: 'apikey:' + LIVEID, at: 1 }], secretGet: () => ({ ok: true, value: Buffer.from(LIVEVAL, 'utf8') }) });
  const mut = new (load(src)).UserTodoManager({ dataDir: dirM, onChange: () => {} });
  mut.add('sess-m', { text: 'ask ' + SHAPE, detail: 'd ' + KV, origin: 'agent' });
  mut._flush();
  const fM = (() => { try { return fs.readFileSync(path.join(dirM, 'user-todos.json'), 'utf8'); } catch { return ''; } })();
  ok(leaks(fM, SHAPEMAT) || leaks(fM, KVMAT), 'MUTANT 1: the belt-stripped writer LEAKS the sentinel (so the real belt is what stops it)');
  // MUTANT 4 (lane job-notify-user r2 → r3): the FIELDS belt stripped — the params and the label's job name unbelted — LEAKS a
  // job's name into For you (so the per-field belt is what stops it)
  const FIELDS = 'i18n = i18n == null ? null : normalizeI18n((normalizeI18n(i18n), maskI18nParams(i18n, beltOf)));';
  const LABEL = 'beltOf(jobName.trim().slice(0, 200))';
  const src4 = before.replace(FIELDS, 'i18n = normalizeI18n(i18n);').replace(LABEL, 'jobName.trim().slice(0, 200)');
  ok(before.split(FIELDS).length === 2 && before.split(LABEL).length === 2 && src4 !== before, 'MUTANT 4 setup: the per-field belt (params + the label\'s job name) was found once each and stripped in a user-todos copy');
  const dir4 = scratch('aos-mutant-jobs');
  fs.mkdirSync(dir4, { recursive: true });
  const JOBWORDS = { i18n: { text: { key: 'Task {name}: {state} ({cause})', params: { name: 'road ' + SHAPE, state: 'done', cause: 'ok' } } }, jobId: 'jb-m4', jobFact: 'end:done:ok', jobName: 'road ' + SHAPE };
  const mut4 = new (load(src4)).UserTodoManager({ dataDir: dir4, onChange: () => {} });
  mut4.add('claude:conv-m4', { origin: 'jobs', by: 'agent', ...JOBWORDS });
  mut4._flush();
  ok(leaks(readFileIn(dir4, 'user-todos.json'), SHAPEMAT), 'MUTANT 4: a store whose fields belt is stripped LEAKS a job\'s name into For you (so the per-field belt is what stops it)');
  // MUTANT 5 (r3): the r2 rule — the WHOLE composed sentence belted — swallows the product's words after a secret-named job's
  // name (the fields rule keeps them; the leg above proves the sentence survives on the real store)
  const WHOLE = "const rawText = typeof text === 'string' ? (agentWords ? beltOf(text.trim()) : text.trim()) : '';";
  const src5 = before.replace(WHOLE, "const rawText = typeof text === 'string' ? (agentWords || agentFields ? beltOf(text.trim()) : text.trim()) : '';");
  ok(before.split(WHOLE).length === 2, 'MUTANT 5 setup: the whole-text rule was found once and widened to the fields origin in a user-todos copy');
  const dir5 = scratch('aos-mutant-whole'); fs.mkdirSync(dir5, { recursive: true });
  const mut5 = new (load(src5)).UserTodoManager({ dataDir: dir5, onChange: () => {} });
  const m5 = mut5.add('claude:conv-m5', { origin: 'jobs', by: 'agent', i18n: { text: { key: 'Task {name}: {state} ({cause})', params: { name: 'refresh-token', state: 'done', cause: 'ok' } } }, jobId: 'jb-m5', jobFact: 'end:done:ok' });
  ok(m5.text !== 'Task refresh-token: done (ok)' && /redacted/.test(m5.text), 'MUTANT 5: the r2 whole-sentence belt eats the outcome of a job named refresh-token (so belting FIELDS is what keeps the product\'s words)', m5.text);
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
    'vibespace-job': 'sink: job log + For you + the owner message — the job-wrapper masks the child output (data/bin/job-wrapper.js); a fire belts its words (src/jobs.js), a job\'s For-you copy is an agent-words origin (src/user-todos.js add)',
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
