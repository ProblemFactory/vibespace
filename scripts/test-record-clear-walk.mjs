#!/usr/bin/env node
// test-record-clear-walk — "CLEAR CONTENT…" THE RUNTIME SENTINEL WALK (verify r3 of lane-redact,
// 2026-09-28: the reader-census round). A THROWAWAY server (git worktree, own data/, a scratch HOME,
// `claude` hidden from PATH, a stub CLI behind the real chat-wrapper — zero vendor calls) with
// ALL FIVE stores seeded so that EVERY record carries its OWN sentinel word (`SNTL-<kind><n><field>`),
// a real chat session (the agent's seat: a vsst_ token, a conversation id, a member of an agent
// group, bound to a Task Group), a real Background Work job (a jbt_ token), a WebSocket client
// capturing every broadcast, and sign-in ON (a password) so the owner's cookie is a real cookie.
//
//   §1 BEFORE: every endpoint the reader census names (scripts/test-record-clear-census.mjs) is
//      called and PROVED to carry the sentinel of the record it serves — a reader that never
//      showed the word would make the absence after the clear vacuous
//   §2 AUTHORITY: the owner's door under every token kind (no cookie 401 · vsmt_ 401 · vsst_ 403 ·
//      jbt_ 403 · a cross-site form POST 400 · a text/plain body 400), an agent clearing its OWN
//      entries vs another session's / another member's message (403 not_yours), a job token
//      (403), an id from another store's namespace (404, nothing else touched), the 200-item cap
//      + a 201st (400 too_many), an unknown kind (400) — and after every refusal the record STILL
//      carries its word (nothing was cleared by a refused call)
//   §3 THE CLEAR: the owner clears every record (batch + single), then the six brief cases —
//      a reply typed after the clear quotes the sentence, an agent resolving by the old text
//      finds nothing (and "cleared" matches nothing), a job's already-resolved For-you item is
//      cleared by the cascade, a group message posted after the last report and cleared before
//      the next turn reports as the sentence, a wake that could not be delivered was never
//      stashed, a config bundle exported after the clear re-imports as cleared
//   §4 AFTER: every §1 endpoint again — NO sentinel anywhere; every broadcast the ws client saw
//      during the clear carries none; the data dir, the scratch HOME and the server's journal
//      are grepped — the ONLY files allowed to hold a word are the DECLARED append-only bytes
//      (the group log's ndjson, a run's own log file); the stub CLI's stdin (what a chat turn
//      injects: the override notice, the reply quote) carries none
//   §5 CONTROL: a patched server copy whose For-you snapshot skips the fold (serves the item's
//      original words from a shadow copy) makes the SAME walk go RED (run in-process over the
//      real store: the fold that the copy drops is the one every reader depends on)
// Heavy tier (boots a server). SKIPs nothing: every rung is a real process.
import { execSync, spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const T0 = Date.now();
const [PORT, SVC_PORT] = await freePorts(2);
const wt = scratch('rc-walk-wt');
const fakeHome = scratchHome('rc-walk-home', fs);
const stubDir = scratch('rc-walk-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
const CTX = path.join(fakeHome, 'ctx');
const CTX2 = path.join(fakeHome, 'ctx2');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const note = (s) => console.log('  · ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const RC = require(path.join(repo, 'src/record-clear.js'));
const CT = RC.CLEARED_TEXT;
const MUT = mutantCopies('rc-walk', repo);

// ── THE SENTINELS: one per record and per text field, all sharing the base ──
const S = 'SNTL';
const has = (x) => (typeof x === 'string' ? x : J(x) || '').includes(S);
const wordsIn = (x) => { const t = typeof x === 'string' ? x : J(x) || ''; return [...new Set(t.match(/SNTL-[a-z0-9]+/g) || [])].sort(); };
const w = (tag) => `${S}-${tag}`;

// identities
const SID = 'f01d0000-0000-4000-8000-00000000d00d';         // the agent's seat (a stub chat session that prints this id)
const K = 'claude:' + SID;
const OTHER_CID = 'b0b00000-0000-4000-8000-00000000b002';
const OTHER = 'claude:' + OTHER_CID;
const B_CID = 'c0c00000-0000-4000-8000-00000000c003';       // the other group member (never live)
const W = 'T-260928-work', W2 = 'T-260928-side', WX = 'T-260928-other';
const PASSWORD = 'walk-pw-' + process.pid;

// ── the worktree ──
try { execSync('git worktree prune', { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', path.join('data', 'bin'), 'docs']) {
  fs.rmSync(path.join(wt, f), { recursive: true, force: true });
  fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const DATA = path.join(wt, 'data');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(CWD, { recursive: true }); fs.mkdirSync(CTX, { recursive: true }); fs.mkdirSync(CTX2, { recursive: true });

const H = 3600e3, NOW = Date.now();
// ACTIVITY: 工作 holds the agent's own entry (note + detail), another session's, an owner's (no session);
// a second group the agent is also in (multi-group injection); a third the agent is NOT in
const act = (id, hoursAgo, note, session, detail) => ({ id, at: NOW - hoursAgo * H, note, ...(detail ? { detail } : {}), session });
const group = (id, title, x) => ({ id, title, kind: 'task', archived: false, attention: null, objective: 'ship', backlog: [], progress: [], sessions: [], folders: [], contextDir: null, color: null, injectContext: true, colorSeq: 0, createdAt: NOW - 30 * H, updatedAt: NOW - 2 * H, contentUpdatedAt: NOW - 2 * H, ...x });
fs.writeFileSync(path.join(DATA, 'task-groups.json'), J({ version: 1, tasks: {
  [W]: group(W, '工作', { sessions: [K, OTHER], folders: [CWD], contextDir: CTX, progress: [
    act('P-0000a1', 9, `mine: ${w('a1n')} pasted`, K, `${w('a1d')} the whole mail`),
    act('P-0000a2', 8, `theirs: ${w('a2n')}`, OTHER),
    act('P-0000a3', 7, `owner: ${w('a3n')}`, null, w('a3d')),
    act('P-0000a4', 6, 'routine: built the bundle', K),
  ] }),
  [W2]: group(W2, 'side', { sessions: [K], contextDir: CTX2, progress: [act('P-0000b1', 5, `side: ${w('b1n')}`, K, w('b1d'))] }),
  [WX]: group(WX, 'other', { sessions: [OTHER], progress: [act('P-0000e1', 4, `not mine: ${w('x1n')}`, OTHER)] }),
} }, null, 2));
// 2.369.204: an entry the live 500 no longer holds — MOVED to the group's archive (data/task-groups-archive/<id>/<YYYY-MM>.ndjson)
{ const a9 = act('P-0000a9', 30, `archived: ${w('a9n')}`, OTHER, w('a9d')); const d = path.join(DATA, 'task-groups-archive', W); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, new Date(a9.at).toISOString().slice(0, 7) + '.ndjson'), J(a9) + '\n'); }
// FOR-YOU
const JOB_ID = 'jb-d00d0001', JOB_RUN_ID = 'jb-d00d0002', JOB_ARCH_ID = 'jb-d00d0003', JOB_OTHER_ID = 'jb-d00d0004';
const todo = (id, x) => ({ id, sessionKey: K, text: 'x', detail: null, urgency: 'normal', kind: 'action', status: 'open', by: 'agent', sessionName: null, jobId: null, i18n: null, action: null, expiresAt: null, options: null, reply: null, origin: 'agent', createdAt: NOW - 2 * H, resolvedAt: null, resolvedBy: null, ...x });
const T1 = 'ut-d00d000001', T2 = 'ut-d00d000002', T3 = 'ut-d00d000003', T4 = 'ut-d00d000004', T5 = 'ut-d00d000005', T6 = 'ut-d00d000006';
fs.writeFileSync(path.join(DATA, 'user-todos.json'), J({ items: [
  todo(T1, { text: `Forward ${w('t1x')}?`, detail: `${w('t1d')} the mail`, options: [w('t1o'), 'No'] }),
  // a server producer's item: its words as STRUCTURE (i18n params) — a client prefers them over `text`
  todo(T6, { sessionKey: 'channels', origin: 'channels', sessionName: 'Channels', text: `Channel ${w('t6x')}: 3 failed passes`, detail: `Vendor said: ${w('t6d')}`, i18n: { text: { key: 'Channel {label}: {n} failed passes', params: { label: w('t6i'), n: 3 } }, detail: [{ key: 'Vendor said: {v}', params: { v: w('t6j') } }] } }),
  todo(T2, { text: `Old ${w('t2x')}`, detail: `${w('t2d')} ` + 'y'.repeat(700), status: 'done', resolvedAt: NOW - H, resolvedBy: 'user', createdAt: NOW - 4 * H }),
  todo(T3, { text: `${w('t3x')} needs your input`, detail: `${w('t3d')} asked`, origin: 'jobs', jobId: JOB_ID, sessionName: w('t3s'), status: 'done', resolvedAt: NOW - H, resolvedBy: 'user' }), // resolved BEFORE the job is cleared (the brief's case)
  todo(T4, { text: `Replied ${w('t4x')}`, status: 'done', resolvedAt: NOW - H, resolvedBy: 'reply', reply: { text: w('t4r'), at: NOW - H } }),
  todo(T5, { sessionKey: OTHER, text: `Other's ${w('t5x')}`, detail: w('t5d') }),
] }, null, 2));
// STATUS
fs.writeFileSync(path.join(DATA, 'session-status.json'), J({
  statuses: { [K]: { state: 'blocked', urgency: 'high', reason: w('s3r'), detail: w('s3d'), setBy: 'agent', at: NOW - 30 * 60e3, pendingNotices: [] },
    [OTHER]: { state: 'working', urgency: null, reason: w('s4r'), detail: null, setBy: 'agent', at: NOW - 20 * 60e3, pendingNotices: [] } },
  history: { [K]: [
    { state: 'working', urgency: null, reason: w('s1r'), detail: w('s1d'), setBy: 'agent', at: NOW - 2 * H },
    { event: 'vcs', kind: 'branch', branch: w('s2b'), setBy: 'agent', at: NOW - H },
    { state: 'blocked', urgency: 'high', reason: w('s3r'), detail: w('s3d'), setBy: 'agent', at: NOW - 30 * 60e3 },
  ], [OTHER]: [{ state: 'working', urgency: null, reason: w('s4r'), detail: null, setBy: 'agent', at: NOW - 20 * 60e3 }] },
}, null, 2));
// JOBS: a cron parent (the agent's own conversation owns it) with every text field, its run (a log
// file + lastLine), an archived one-shot, another conversation's job; a held notification; a spill file
const JT = NOW - 60e3, JRUN = NOW - 4 * H, JARCH = NOW - 6 * H;
const jobOwner = { conversation: { id: SID }, sessionId: 'cw-me', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [W] };
const jobRec = (id, x) => ({ id, kind: 'task', name: 'job', note: '', cmd: { argv: ['sh', '-c', 'true'], cwd: CWD }, envFrom: [], restart: 'on-failure', health: null, ports: [], publish: false, singleInstance: true, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: false, notifyOk: false, schedule: null, catchUp: 'once', action: null, context: null, interaction: { pending: null, answers: [] }, owner: jobOwner, access: { view: 'group', control: 'session' }, stopWithOwner: false, desiredUp: false, state: 'done', proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, runs: [], createdAt: JT, ...x });
const run = (startedAt, lastLine) => ({ startedAt, trigger: 'cron', log: path.join(DATA, 'job-logs', 'x', String(startedAt), 'current.log'), endedAt: startedAt + 1000, exit: 0, cause: 'exit', lastLine });
fs.writeFileSync(path.join(DATA, 'jobs.json'), J([
  jobRec(JOB_ID, { kind: 'cron', name: w('j1n'), note: w('j1o'), context: { payload: w('j1c') }, schedule: { cron: '0 9 * * *' }, action: { type: 'notify', text: w('j1a') }, state: 'down', progress: w('j1p'),
    lastNotify: { ts: JT, lane: 'stash', ok: true, reason: w('j1l') }, notifyLog: [{ ts: JT, lane: 'stash', ok: false, reason: w('j1g'), to: 'f01d0000' }],
    interaction: { pending: { panel: { title: w('j1q'), blocks: [{ type: 'markdown', text: w('j1m') }, { type: 'buttons', options: ['ok'] }] }, version: 1, postedAt: JT, timeoutS: 1800 }, answers: [{ version: 0, ts: JT, a: w('j1w') }] } }),
  jobRec(JOB_RUN_ID, { name: `${w('j1n')} run`, cronParent: JOB_ID, runs: [run(JRUN, w('j2l'))], ack: { by: 'user-opened', at: JT } }),
  jobRec(JOB_OTHER_ID, { name: w('j4n'), owner: { ...jobOwner, conversation: { id: OTHER_CID } }, access: { view: 'all', control: 'all' }, runs: [run(JRUN, w('j4l'))], ack: { by: 'user-opened', at: JT } }),
]));
fs.writeFileSync(path.join(DATA, 'jobs-archive.json'), J([
  jobRec(JOB_ARCH_ID, { name: w('j3n'), note: w('j3o'), context: { payload: w('j3c') }, runs: [run(JARCH, w('j3l'))], notifyLog: [{ ts: JARCH, lane: 'message', ok: false, reason: w('j3g') }], lastNotify: { ts: JARCH, ok: false, reason: w('j3g') }, archivedAt: NOW - 3 * H, archivedWhy: 'done-24h', ack: { by: 'user', at: NOW - 5 * H } }),
]));
for (const [id, at, line] of [[JOB_RUN_ID, JRUN, w('j2f')], [JOB_ARCH_ID, JARCH, w('j3f')], [JOB_OTHER_ID, JRUN, w('j4f')]]) {
  fs.mkdirSync(path.join(DATA, 'job-logs', id, String(at)), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'job-logs', id, String(at), 'current.log'), `started\n${line}\n`);
}
fs.writeFileSync(path.join(DATA, 'job-notifications.json'), J({ [SID]: [{ ts: JT, jobId: JOB_ID, jobName: w('j1n'), text: w('j5h'), held: { kind: 'not-reachable' } }] }));
fs.mkdirSync(path.join(DATA, 'job-notifications-read'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'job-notifications-read', `${SID}.md`), `# drained\n- ${new Date(JT).toISOString()} ${JOB_ID} ${w('j6s')}\n`);
// GROUPS through the real store + engine: G (the agent + B), G2 (B alone with another — the agent is no member)
let GID = null, GID2 = null, M1 = null, M2 = null, M3 = null, INV = null, REN = null; const GROUP_RECS = [];
{
  const { createChannelStore } = require(path.join(repo, 'src/channel-store.js'));
  const GE = require(path.join(repo, 'src/server/groups-engine.js'));
  const G = require(path.join(repo, 'src/channel-groups.js'));
  const store = createChannelStore({ dir: path.join(DATA, 'channels') });
  const roster = [{ cid: SID, name: 'me', groups: [W], reachability: null }, { cid: B_CID, name: 'bee', groups: [W], reachability: null }, { cid: OTHER_CID, name: 'other', groups: [W], reachability: null }];
  let t = NOW - 20 * 60e3;
  const eng = GE.create({ store, deliver: { deliverToConversation: async () => ({ ok: false, reason: 'seed' }) }, broadcast: () => {}, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
  const made = await eng.create({ by: G.OWNER, name: w('g4f'), members: [SID, B_CID], context: w('g3c'), quiet: true, consent: () => ({ ok: true }) });
  if (!made.ok) throw new Error('seed group: ' + J(made));
  GID = made.group.id;
  const ren = await eng.rename({ by: G.OWNER, group: GID, name: 'finance' });
  if (!ren.ok) throw new Error('seed rename: ' + J(ren));
  M1 = (await eng.post({ group: GID, from: B_CID, text: `bee: ${w('g1t')}` })).message.vendorId;
  M2 = (await eng.post({ group: GID, from: SID, text: `me: ${w('g2t')}` })).message.vendorId;
  const made2 = await eng.create({ by: G.OWNER, name: 'private', members: [B_CID, OTHER_CID], quiet: true, consent: () => ({ ok: true }) });
  GID2 = made2.group.id;
  M3 = (await eng.post({ group: GID2, from: B_CID, text: `private: ${w('g5t')}` })).message.vendorId;
  await eng.markRead({ group: GID });
  { // the invite (raw.context) and rename (raw.from) records, by kind; every record of G that carries a word is cleared later
    const recs = store.readTail('groups', GID, { limit: 50 });
    GROUP_RECS.push(...recs.filter((r) => has(r)).map((r) => r.vendorId));
    INV = (recs.find((r) => r.raw && r.raw.kind === 'invite' && r.raw.member === B_CID) || {}).vendorId;
    REN = (recs.find((r) => r.raw && r.raw.kind === 'rename') || {}).vendorId;
    if (!INV || !REN) throw new Error('seed: no invite/rename record ' + J(recs.map((r) => r.raw && r.raw.kind)));
  }
  store.close();
}

// ── the stub CLI (the agent's seat): prints an init record with SID, answers every user turn, logs its stdin ──
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${J(SID)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${J(CWD)}, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281' });
let buf = '', n = 0;
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    fs.appendFileSync(${J(STDIN_LOG)}, line + '\\n');
    let m = null; try { m = JSON.parse(line); } catch {}
    if (m && m.type === 'user') {
      n++;
      setTimeout(() => {
        out({ type: 'assistant', message: { id: 'msg_' + n, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'ok ' + n }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'a-' + n });
        out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10, num_turns: 1, result: 'ok', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
      }, 150);
    }
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
// `claude` HIDDEN from PATH: every PATH dir that holds a `claude` is dropped (the stub is named by CLAUDE_CMD)
const PATH_NO_CLAUDE = (process.env.PATH || '').split(':').filter((d) => { try { return d && !fs.existsSync(path.join(d, 'claude')); } catch { return true; } }).join(':');
const JOURNAL = path.join(stubDir, 'server-journal.log');
const journalFd = fs.openSync(JOURNAL, 'w');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: PATH_NO_CLAUDE, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, CODEX_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' }, stdio: ['ignore', journalFd, journalFd] });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
  if (!process.env.VS_KEEP) for (const d of [wt, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  try { execSync('git worktree prune', { cwd: repo, stdio: 'ignore' }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST' }); break; } catch { await sleep(250); } }

// ── the owner's cookie (sign-in ON) ──
const login = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ password: PASSWORD }) });
const COOKIE = (login.headers.get('set-cookie') || '').split(';')[0];
check('sign-in is ON and the owner holds a cookie', login.status === 200 && /=/.test(COOKIE), { status: login.status, COOKIE });
const url = (p) => `http://127.0.0.1:${PORT}${p}`;
const raw = async (p, { method = 'GET', body, headers = {}, cookie = true } = {}) => {
  const r = await fetch(url(p), { method, headers: { ...(cookie ? { cookie: COOKIE } : {}), ...(body !== undefined && typeof body !== 'string' ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : J(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json };
};
for (let i = 0; i < 80; i++) { const r = await raw('/api/jobs'); if (r.status === 200) break; await sleep(250); }

// ── the ws client: the owner's live client (cookie), capturing every broadcast ──
const WebSocket = require('ws');
const wsc = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { cookie: COOKIE } });
await new Promise((res, rej) => { wsc.on('open', res); wsc.on('error', rej); });
const frames = [];
wsc.on('message', (d) => { try { frames.push(JSON.parse(d)); } catch {} });
const wsSend = (o) => wsc.send(J(o));
const framesOf = (type) => frames.filter((f) => f.type === type);
// the agent's seat: a chat session on the stub (its init record carries SID ⇒ key K, a member of G, bound to 工作 + side)
const WIN = await new Promise((res, rej) => {
  const reqId = 'walk-' + Math.random().toString(36).slice(2);
  const to = setTimeout(() => rej(new Error('create timed out')), 20000);
  const on = (d) => { const m = JSON.parse(d); if (m.type === 'created' && m.reqId === reqId) { clearTimeout(to); wsc.off('message', on); res(m.sessionId); } if (m.type === 'error' && m.reqId === reqId) { clearTimeout(to); rej(new Error(m.message)); } };
  wsc.on('message', on);
  wsSend({ type: 'create', reqId, backend: 'claude', mode: 'chat', cwd: CWD, cols: 80, rows: 24 });
});
let TOKEN = null, META = null;
for (let i = 0; i < 60 && !TOKEN; i++) {
  try { for (const f of fs.readdirSync(path.join(DATA, 'session-meta'))) { const m = JSON.parse(fs.readFileSync(path.join(DATA, 'session-meta', f), 'utf8')); if (m.agentToken && m.cwd === CWD) { TOKEN = m.agentToken; META = path.join(DATA, 'session-meta', f); } } } catch {}
  if (!TOKEN) await sleep(250);
}
check('the agent\'s seat exists: a chat session with a vsst_ token', !!TOKEN && TOKEN.startsWith('vsst_'), { WIN, TOKEN });
wsSend({ type: 'attach', sessionId: WIN });
// its conversation id must be SID (the stub's init record) — the routes key it as claude:<SID>
let seat = null;
for (let i = 0; i < 60; i++) { const r = await raw('/api/sessions/active').catch(() => null); const list = (r && r.json && (r.json.sessions || r.json)) || []; seat = (Array.isArray(list) ? list : []).find((s) => s.id === WIN || s.sessionId === WIN) || null; if (seat && (seat.claudeSessionId === SID || seat.backendSessionId === SID)) break; seat = null; await sleep(250); }
if (!seat) { // the active-sessions broadcast carries the same facts
  for (let i = 0; i < 40 && !seat; i++) { const f = framesOf('active-sessions').slice(-1)[0]; const list = f ? (f.sessions || []) : []; seat = list.find((s) => (s.id === WIN || s.sessionId === WIN) && (s.claudeSessionId === SID || s.backendSessionId === SID)) || null; if (!seat) await sleep(250); }
}
check('the seat\'s conversation id is the stub\'s SID (key claude:<SID>)', !!seat, framesOf('active-sessions').slice(-1)[0]);
const AG = { authorization: `Bearer ${TOKEN}` };
const agent = (p, opts = {}) => raw(p, { ...opts, cookie: false, headers: { ...AG, ...(opts.headers || {}) } });
// one user turn so the session counts as user-initiated (the group report rides a typed turn)
const turn = async (text) => { wsSend({ type: 'chat-input', sessionId: WIN, text }); await sleep(900); };
await turn('hello');
const stdinLog = () => { try { return fs.readFileSync(STDIN_LOG, 'utf8'); } catch { return ''; } };
check('the stub received the typed turn on its stdin', stdinLog().includes('hello'), stdinLog().slice(-300));

// a real Background Work job created by the agent: its command writes its jbt_ token to a file
const TOKFILE = path.join(stubDir, 'jbt.txt');
const OUTFILE = path.join(stubDir, 'out.txt'); fs.writeFileSync(OUTFILE, w('j7e') + '\n');
const mk = await agent('/api/agent/jobs', { method: 'POST', body: { kind: 'task', name: `live ${w('j7n')}`, cmd: { argv: ['sh', '-c', `echo "$VIBESPACE_JOB_TOKEN" > ${TOKFILE}; cat ${OUTFILE}; sleep 300`], cwd: CWD }, note: w('j7o') } });
const LIVE_JOB = mk.json && mk.json.job && mk.json.job.id;
let JBT = null;
for (let i = 0; i < 60 && !JBT; i++) { try { JBT = fs.readFileSync(TOKFILE, 'utf8').trim(); } catch {} if (!JBT) await sleep(250); }
check('a live job of the agent\'s conversation holds a jbt_ token', !!LIVE_JOB && !!JBT && JBT.startsWith('jbt_'), { mk: mk.json, JBT });
const jobAs = (p, opts = {}) => raw(p, { ...opts, cookie: false, headers: { authorization: `Bearer ${JBT}` } });
// verify r8 ③: a PUBLISHED SERVICE the owner created — its forward is labelled `service: <name>`, and on an instance without
// frp its publish logs a line (the journal rides the server's console ring into every incident captured later)
const svcMk = await raw('/api/jobs', { method: 'POST', body: { kind: 'service', name: `svc ${w('j8n')}`, cmd: { argv: [process.execPath, '-e', `require('http').createServer((q, s) => s.end('ok')).listen(${SVC_PORT}, '127.0.0.1')`], cwd: CWD }, ports: [SVC_PORT], publish: true } });
const SVC_JOB = svcMk.json && svcMk.json.job && svcMk.json.job.id;
{ let fwd = null; for (let i = 0; i < 60 && !fwd; i++) { const r = await raw('/api/port-forwards'); fwd = ((r.json && r.json.forwards) || []).find((f) => Number(f.remotePort) === SVC_PORT && has(f.label)); if (!fwd) await sleep(250); }
  check('verify r8: a published service of the owner is up and its forward is labelled with its name (the Ports panel)', !!SVC_JOB && !!fwd, { svc: svcMk.json, fwd }); }
await sleep(1500); // the run's first output line is announced (the event ring, lastLine)

// ── the CLIs (real data/bin scripts, the hidden-claude PATH, the agent's or the job's token) ──
const cli = (bin, args, tok = TOKEN) => new Promise((resolve) => execFile(process.execPath, [path.join(wt, 'data/bin', bin), ...args], { env: { PATH: PATH_NO_CLAUDE, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, ...(tok.startsWith('jbt_') ? { VIBESPACE_JOB_TOKEN: tok } : { VIBESPACE_SESSION_TOKEN: tok }) }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: String(stdout) + '\n' + String(stderr) })));
const statusCli = fs.existsSync(path.join(DATA, 'bin', 'vibespace-status')) ? path.join(DATA, 'bin', 'vibespace-status') : null;

// ── THE PROBES: every endpoint the census names — {name, call() → text, before: [sentinels it must show]} ──
const PROBES = [
  { name: 'file data/job-notifications.json (the held stash, seeded — drained by the first injection below)', call: async () => ({ out: fs.readFileSync(path.join(DATA, 'job-notifications.json'), 'utf8') }), before: ['j1n', 'j5h'], once: true },
  { name: 'GET /api/tasks (cookie)', call: () => raw('/api/tasks'), before: ['a1n', 'a1d', 'a2n', 'a3n', 'a3d', 'b1n', 'b1d', 'x1n'] },
  { name: 'GET /api/tasks/:id/progress (cookie: the live list, then the archive)', call: () => raw(`/api/tasks/${W}/progress?limit=200`), before: ['a1n', 'a1d', 'a2n', 'a3n', 'a3d', 'a9n', 'a9d'] },
  { name: 'file data/task-groups-archive/ (the archived Activity log)', call: async () => ({ out: fs.readdirSync(path.join(DATA, 'task-groups-archive', W)).map((f) => fs.readFileSync(path.join(DATA, 'task-groups-archive', W, f), 'utf8')).join('') }), before: ['a9n', 'a9d'] },
  { name: 'GET /api/user-todos (cookie, the snapshot: preview + i18n + options + reply)', call: () => raw('/api/user-todos'), before: ['t1x', 't1d', 't1o', 't6x', 't6d', 't6i', 't6j', 't2x', 't2d', 't3x', 't3s', 't4x', 't4r', 't5x'] },
  { name: 'GET /api/user-todos/:id (cookie, the whole item)', call: () => raw(`/api/user-todos/${T2}`), before: ['t2x', 't2d'] },
  { name: 'GET /api/session-status (cookie, the current records)', call: () => raw('/api/session-status'), before: ['s3r', 's3d', 's4r'] },
  { name: 'GET /api/session-status/history (cookie)', call: () => raw(`/api/session-status/history?sessionKey=${encodeURIComponent(K)}`), before: ['s1r', 's1d', 's2b', 's3r', 's3d'] },
  { name: 'GET /api/jobs (cookie: the registry + the held digest)', call: () => raw('/api/jobs'), before: ['j1n', 'j1o', 'j1c', 'j1p', 'j2l', 'j4n', 'j7n', 'j8n'] },
  { name: 'GET /api/jobs?archived=1 (cookie)', call: () => raw('/api/jobs?archived=1'), before: ['j3n', 'j3o', 'j3l'] },
  { name: 'GET /api/jobs/:id?tail (cookie: snapshot + interaction + runs, the cron parent)', call: () => raw(`/api/jobs/${JOB_ID}?tail=50`), before: ['j1n', 'j1o', 'j1c', 'j1p', 'j1l', 'j1g', 'j1q', 'j1m', 'j1w'] },
  { name: 'GET /api/jobs/:id?tail (cookie: the run child with its log tail)', call: () => raw(`/api/jobs/${JOB_RUN_ID}?tail=50`), before: ['j2l', 'j2f'] },
  { name: 'GET /api/jobs/:id?tail (cookie: an ARCHIVED job read through)', call: () => raw(`/api/jobs/${JOB_ARCH_ID}?tail=50`), before: ['j3n', 'j3l', 'j3f', 'j3g'] },
  { name: 'GET /api/channel-groups (cookie: lastText)', call: () => raw('/api/channel-groups'), before: ['g2t', 'g5t'] },
  { name: 'GET /api/channel-groups/:id/messages (cookie, folded)', call: () => raw(`/api/channel-groups/${GID}/messages?limit=50`), before: ['g1t', 'g2t', 'g3c', 'g4f'] },
  // verify r7: EVERY section the route offers (the backup an owner takes after a clear), not only the Task Groups — the census
  // (§H1c) derives the section list from routes/persistence.js and fails this probe when it misses one
  { name: 'POST /api/config/export {every section} (cookie)', call: () => raw('/api/config/export', { method: 'POST', body: { sections: ['settings', 'customThemes', 'layouts', 'userState', 'bookmarks', 'tasks', 'pricing', 'clientPrefs'], clientPrefs: { theme: 'dark', 'vibespace.lang': 'zh' } } }), before: ['a1n', 'a1d', 'a2n', 'b1n', 'x1n'] },
  { name: 'GET /api/agent/task (vsst_: the last 10 entries)', call: () => agent('/api/agent/task?group=' + W), before: ['a1n', 'a2n', 'a3n'] },
  { name: 'GET /api/agent/task-context (vsst_: the SessionStart injection, multi-group)', call: () => agent('/api/agent/task-context'), before: ['a1n', 'b1n'] },
  { name: 'GET /api/agent/prompt-context (vsst_: the per-turn injection)', call: () => agent('/api/agent/prompt-context'), before: [] },
  { name: 'GET /api/agent/stop-check (vsst_: the Stop nudge)', call: () => agent('/api/agent/stop-check'), before: [] },
  { name: 'POST /api/agent/user-todo {list} (vsst_: the open items)', call: () => agent('/api/agent/user-todo', { method: 'POST', body: { list: true } }), before: ['t1x', 't1d', 't1o'] },
  { name: 'POST /api/agent/user-todo {show} (vsst_)', call: () => agent('/api/agent/user-todo', { method: 'POST', body: { show: T2 } }), before: ['t2x', 't2d'] },
  { name: 'POST /api/agent/session-status {show} (vsst_)', call: () => agent('/api/agent/session-status', { method: 'POST', body: { show: true } }), before: ['s3r'] },
  { name: 'GET /api/agent/jobs (vsst_)', call: () => agent('/api/agent/jobs'), before: ['j1n', 'j1o', 'j1c', 'j1p', 'j2l', 'j7n'] },
  { name: 'GET /api/agent/jobs?archived=1 (vsst_)', call: () => agent('/api/agent/jobs?archived=1'), before: ['j3n', 'j3l'] },
  { name: 'GET /api/agent/jobs/:ref?tail (vsst_: the cron parent)', call: () => agent(`/api/agent/jobs/${JOB_ID}?tail=50`), before: ['j1n', 'j1p'] },
  { name: 'GET /api/agent/jobs/:ref?tail (vsst_: the run + its log)', call: () => agent(`/api/agent/jobs/${JOB_RUN_ID}?tail=50`), before: ['j2l', 'j2f'] },
  { name: 'GET /api/agent/jobs/:ref?tail (vsst_: the archive read-through)', call: () => agent(`/api/agent/jobs/${JOB_ARCH_ID}?tail=50`), before: ['j3n', 'j3l', 'j3f'] },
  { name: 'GET /api/agent/jobs/:ref?tail (jbt_: the job reads ITSELF)', call: () => jobAs(`/api/agent/jobs/${LIVE_JOB}?tail=50`), before: ['j7n', 'j7o', 'j7e'] },
  { name: 'GET /api/agent/msg/groups (vsst_: counts + names, no lastText)', call: () => agent('/api/agent/msg/groups'), before: [] },
  { name: 'GET /api/agent/msg/read?group (vsst_, folded)', call: () => agent(`/api/agent/msg/read?group=${GID}&limit=50`), before: ['g1t', 'g2t', 'g3c', 'g4f'] },
  { name: 'GET /api/agent/msg/peers (vsst_: another session\'s stateReason)', call: () => agent('/api/agent/msg/peers'), before: [] },
  { name: 'CLI vibespace-task show --full', call: () => cli('vibespace-task', ['show', '--full', '--group', W]), before: ['a1n', 'a2n', 'a3n'] },
  { name: 'CLI vibespace-ask list', call: () => cli('vibespace-ask', ['list']), before: ['t1x'] },
  { name: 'CLI vibespace-ask show', call: () => cli('vibespace-ask', ['show', T2]), before: ['t2x', 't2d'] },
  { name: 'CLI vibespace-job list', call: () => cli('vibespace-job', ['list']), before: ['j1n', 'j7n'] },
  { name: 'CLI vibespace-job show (the cron parent)', call: () => cli('vibespace-job', ['show', JOB_ID]), before: ['j1n'] },
  { name: 'CLI vibespace-job logs (the run)', call: () => cli('vibespace-job', ['logs', JOB_RUN_ID]), before: ['j2f'] },
  { name: 'CLI vibespace-job poll (the archived one)', call: () => cli('vibespace-job', ['poll', JOB_ARCH_ID]), before: ['j3n'] },
  { name: 'CLI vibespace-job show (jbt_, itself)', call: () => cli('vibespace-job', ['show', LIVE_JOB], JBT), before: ['j7n'] },
  { name: 'CLI vibespace-msg read <group>', call: () => cli('vibespace-msg', ['read', GID]), before: ['g1t', 'g2t'] },
  { name: 'CLI vibespace-msg group list', call: () => cli('vibespace-msg', ['group', 'list']), before: [] },
  ...(statusCli ? [{ name: 'CLI vibespace-status show (generated)', call: () => new Promise((resolve) => execFile(process.execPath, [statusCli, 'show'], { env: { PATH: PATH_NO_CLAUDE, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: TOKEN }, timeout: 20000 }, (err, so, se) => resolve({ code: err ? err.code : 0, out: String(so) + String(se) }))), before: ['s3r'] }] : []),
  { name: 'file TASK.md (工作)', call: async () => ({ out: fs.readFileSync(path.join(CTX, '.vibespace', 'TASK.md'), 'utf8') }), before: ['a1n', 'a1d', 'a2n', 'a3n'] },
  { name: 'file TASK.md (side)', call: async () => ({ out: fs.readFileSync(path.join(CTX2, '.vibespace', 'TASK.md'), 'utf8') }), before: ['b1n', 'b1d'] },
  { name: 'file data/job-notifications-read/<cid>.md (the spill)', call: async () => ({ out: fs.readFileSync(path.join(DATA, 'job-notifications-read', `${SID}.md`), 'utf8') }), before: ['j6s'] },
  { name: 'file data/job-notifications.json (the held stash of a non-live owner conversation, after the clear)', call: async () => ({ out: fs.readFileSync(path.join(DATA, 'job-notifications.json'), 'utf8') }), before: [], after: true },
  { name: 'CLI vibespace-channels list (reaches no group log)', call: () => cli('vibespace-channels', ['list']), before: [] },
  { name: 'file data/channels/groups.json (lastText)', call: async () => ({ out: fs.readFileSync(path.join(DATA, 'channels', 'groups.json'), 'utf8') }), before: ['g2t', 'g5t'] },
];
const textOf = (r) => (r && typeof r.out === 'string') ? r.out : (r && r.text) || '';
console.log('\n§1 BEFORE: every reader carries its record\'s own word');
const before = new Map();
for (const p of PROBES) {
  if (p.after) continue;
  let r; try { r = await p.call(); } catch (e) { r = { text: 'THREW ' + e.message }; }
  const t = textOf(r);
  before.set(p.name, t);
  const missing = p.before.filter((s) => !t.includes(w(s)));
  check(`${p.name} — shows ${p.before.length ? p.before.join(' ') : '(reader exercised; asserted clean after)'}`, !missing.length, { missing, status: r && r.status, head: t.slice(0, 400) });
}
// the two injections and the Stop nudge are asserted in §4; here we only note what they carried
note(`prompt-context before carried: ${wordsIn(before.get('GET /api/agent/prompt-context (vsst_: the per-turn injection)')).join(' ') || '(nothing — the group report rides the NEXT user turn)'}`);
// the raw channels reader (verify r1's finding) stays 404 for a group log
{ const r = await raw(`/api/channels/groups/${GID}/messages`); check('GET /api/channels/groups/<gid>/messages is 404 (the raw reader verify r1 closed)', r.status === 404 && !has(r.text), { status: r.status, text: r.text.slice(0, 200) }); }
{ const r = await raw(`/api/channels/search?adapter=groups&q=${S}`); check('GET /api/channels/search?adapter=groups finds no group log (not an account)', r.status === 404 && !has(r.text), { status: r.status, text: r.text.slice(0, 200) }); }
{ const r = await agent(`/api/agent/channels/search?q=${S}`); check('GET /api/agent/channels/search reaches no group log', !has(r.text), { status: r.status, text: r.text.slice(0, 300) }); }
{ const r = await agent(`/api/agent/msg/read?group=${GID2}&limit=50`); check('GET /api/agent/msg/read of a group the agent is NOT in serves nothing', r.status !== 200 && !has(r.text), { status: r.status, text: r.text.slice(0, 200) }); }

// a HELD notification made by the product itself (the seeded one was drained into §1's injection, as it should): the live
// job announces a word; its owner conversation is the stub (no CLI inbox) ⇒ the ladder cannot deliver ⇒ held in the stash
{ const an = await agent(`/api/agent/jobs/${JOB_OTHER_ID}/announce`, { method: 'POST', body: { text: `${w('j8a')}\nsecond line ${w('j8b')}` } }); await sleep(2600);
  const held = fs.readFileSync(path.join(DATA, 'job-notifications.json'), 'utf8');
  check('an announce on a job whose owner conversation is NOT live is HELD with its words (before the clear)', an.status === 200 && held.includes(w('j8a')) && held.includes(w('j8b')), { an: an.json, held: held.slice(0, 300) }); }

// ── §2 AUTHORITY ──
console.log('\n§2 AUTHORITY: the owner\'s door under every token kind, and an agent\'s reach');
const clearOne = (item, opts = {}) => raw('/api/records/clear', { method: 'POST', body: item, ...opts });
const stillThere = async (probeName, word) => (textOf(await PROBES.find((p) => p.name === probeName).call())).includes(w(word));
{ const r = await clearOne({ kind: 'activity', groupId: W, id: 'P-0000a2' }, { cookie: false }); check('no cookie ⇒ 401 (sign-in on)', r.status === 401, r); }
{ const r = await clearOne({ kind: 'activity', groupId: W, id: 'P-0000a2' }, { cookie: false, headers: { authorization: 'Bearer vsmt_0000000000000000000000000000000000000000' } }); check('a mount token (vsmt_) ⇒ 401 (it opens /dav only)', r.status === 401, r); }
{ const r = await clearOne({ kind: 'activity', groupId: W, id: 'P-0000a2' }, { cookie: false, headers: AG }); check('a session token (vsst_) alone ⇒ 401 (the cookie route needs the cookie)', r.status === 401, r); }
{ const r = await clearOne({ kind: 'activity', groupId: W, id: 'P-0000a2' }, { headers: AG }); check('cookie + vsst_ ⇒ 403 agent_forbidden (an agent volunteering its token is refused by name)', r.status === 403 && r.json && r.json.code === 'agent_forbidden', r); }
{ const r = await clearOne({ kind: 'activity', groupId: W, id: 'P-0000a2' }, { headers: { authorization: `Bearer ${JBT}` } }); check('cookie + jbt_ ⇒ 403 agent_forbidden', r.status === 403 && r.json && r.json.code === 'agent_forbidden', r); }
{ const r = await raw('/api/records/clear', { method: 'POST', body: `kind=activity&groupId=${W}&id=P-0000a2`, headers: { 'content-type': 'application/x-www-form-urlencoded' } }); check('a cross-site FORM post (urlencoded body, cookie SameSite=Lax) ⇒ 400 bad_items (no urlencoded parser; Lax withholds the cookie cross-site anyway)', r.status === 400 && r.json && r.json.code === 'bad_items', r); }
{ const r = await raw('/api/records/clear', { method: 'POST', body: J({ kind: 'activity', groupId: W, id: 'P-0000a2' }), headers: { 'content-type': 'text/plain' } }); check('a text/plain JSON body (a form\'s enctype trick) ⇒ 400 bad_items', r.status === 400 && r.json && r.json.code === 'bad_items', r); }
{ const r = await raw('/api/records/clear-many', { method: 'POST', body: { items: Array.from({ length: 201 }, (_, i) => ({ kind: 'activity', groupId: W, id: 'P-' + String(i).padStart(6, '0') })) } }); check('201 items ⇒ 400 too_many (the cap is 200)', r.status === 400 && r.json && r.json.code === 'too_many', r); }
{ const r = await clearOne({ kind: 'mailbox', id: 'x' }); check('an unknown kind ⇒ 400 bad_kind', r.status === 400 && r.json && r.json.code === 'bad_kind', r); }
// an id from ANOTHER store's namespace: nothing is cleared anywhere
{ const r1 = await clearOne({ kind: 'todo', id: JOB_ID }); const r2 = await clearOne({ kind: 'job', id: T1 }); const r3 = await clearOne({ kind: 'activity', groupId: W, id: T1 }); const r4 = await clearOne({ kind: 'status', sessionKey: K, id: 'P-0000a1' }); const r5 = await clearOne({ kind: 'group-message', groupId: GID, id: JOB_ID });
  check('an id from another store\'s namespace ⇒ 404 not_found on every kind', [r1, r2, r3, r4, r5].every((r) => r.status === 404 && r.json.code === 'not_found'), [r1, r2, r3, r4, r5].map((r) => r.status + ' ' + (r.json && r.json.code)));
  check('…and the records those ids DO name are untouched', (await stillThere('GET /api/jobs/:id?tail (cookie: snapshot + interaction + runs, the cron parent)', 'j1n')) && (await stillThere('GET /api/user-todos/:id (cookie, the whole item)', 't2x')) && (await stillThere('GET /api/tasks (cookie)', 'a1n'))); }
// the agent's own verbs: its own entry ✓, another session's ✗, a job token ✗, another member's message ✗
const redact = (body) => agent('/api/agent/task/progress-redact', { method: 'POST', body });
{ const r = await redact({ group: W, ref: 'P-0000a2' }); check('agent: another session\'s Activity entry ⇒ 403 not_yours', r.status === 403 && r.json.code === 'not_yours', r); }
{ const r = await redact({ group: W, ref: 'P-0000a3' }); check('agent: the OWNER\'s entry (no session) ⇒ 403 not_yours (fails closed)', r.status === 403 && r.json.code === 'not_yours', r); }
{ const r = await redact({ group: WX, ref: 'P-0000e1' }); check('agent: an entry of a group it is NOT in ⇒ refused (403/404), never cleared', r.status === 403 || r.status === 404, r); check('…and that entry still carries its word', await stillThere('GET /api/tasks (cookie)', 'x1n')); }
{ const r = await raw('/api/agent/task/progress-redact', { method: 'POST', body: { group: W, ref: 'P-0000a1' }, cookie: false, headers: { authorization: `Bearer ${JBT}` } }); check('a job token on the agent verb ⇒ 401/403, nothing cleared', (r.status === 401 || r.status === 403) && (await stillThere('GET /api/tasks (cookie)', 'a1n')), r); }
{ const r = await agent('/api/agent/user-todo', { method: 'POST', body: { clear: T5 } }); check('agent: another session\'s For-you item ⇒ 403 not_yours', r.status === 403 && r.json.code === 'not_yours', r); }
{ const r = await agent('/api/agent/user-todo', { method: 'POST', body: { clear: T3 } }); check('agent: a Background-Work item under its OWN key (origin jobs) ⇒ 403 not_yours (a producer\'s item is never the agent\'s)', r.status === 403 && r.json.code === 'not_yours', r); }
{ const r = await agent('/api/agent/msg/group', { method: 'POST', body: { verb: 'clear', group: GID, id: M1 } }); check('agent: another member\'s group message through vibespace-msg ⇒ refused (no clear verb for groups on the agent side — the owner clears)', r.status >= 400 && (await stillThere('GET /api/channel-groups/:id/messages (cookie, folded)', 'g1t')), r); }
{ const r = await redact({ group: W, ref: 'P-0000a1' }); check('agent: its OWN entry ⇒ cleared', r.status === 200 && r.json.cleared === 1, r); }
{ const r = await agent('/api/agent/user-todo', { method: 'POST', body: { clear: T1 } }); check('agent: its OWN For-you item ⇒ cleared', r.status === 200 && r.json.cleared === 1, r); }
{ const r = await redact({ group: W, ref: 'P-0000a1' }); check('agent: clearing its own entry again ⇒ already (idempotent)', r.status === 200 && r.json.already === 1, r); }
// the pending fork: the seat's meta says it is a fork waiting for its own id ⇒ 409 pending_fork
{ const m = JSON.parse(fs.readFileSync(META, 'utf8')); note(`(pending fork is a live flag _forkRequested on the session — judged by test-record-clear-stores §1, not re-spawned here; meta forkRequested=${m.forkRequested})`); }

// ── §3 THE CLEAR ──
console.log('\n§3 THE CLEAR: the owner clears everything, then the six brief cases');
const clearedFrames0 = frames.length;
const items = [
  { kind: 'activity', groupId: W, id: 'P-0000a2' }, { kind: 'activity', groupId: W, id: 'P-0000a3' }, { kind: 'activity', groupId: W, id: 'P-0000a9' }, { kind: 'activity', groupId: W2, id: 'P-0000b1' }, { kind: 'activity', groupId: WX, id: 'P-0000e1' },
  { kind: 'todo', id: T2 }, { kind: 'todo', id: T4 }, { kind: 'todo', id: T5 }, { kind: 'todo', id: T6 },
  { kind: 'status', sessionKey: K, id: NOW - 2 * H }, { kind: 'status', sessionKey: K, id: NOW - H }, { kind: 'status', sessionKey: K, id: NOW - 30 * 60e3 }, { kind: 'status', sessionKey: OTHER, id: NOW - 20 * 60e3 },
  { kind: 'job', id: JOB_ID }, { kind: 'job', id: JOB_ARCH_ID }, { kind: 'job', id: JOB_OTHER_ID }, { kind: 'job', id: LIVE_JOB }, { kind: 'job', id: SVC_JOB },
  ...GROUP_RECS.map((vid) => ({ kind: 'group-message', groupId: GID, id: vid })), { kind: 'group-message', groupId: GID2, id: M3 },
];
const many = await raw('/api/records/clear-many', { method: 'POST', body: { items } });
const clearedFramesDone = frames.length;
check('the owner\'s clear-many clears every record (T3 rides the job cascade)', many.status === 200 && many.json.ok && many.json.cleared >= items.length && !many.json.refused.length && !many.json.unknown.length, many.json);
await sleep(1200); // the debounced stores flush (500 ms) + the broadcasts
const CLEAR_AT = Date.now();
// (a) a reply typed AFTER the clear (a client mid-edit sends its reply to the item id): the quote block is built from the store
{ const r = await raw(`/api/user-todos/${T2}/reply`, { method: 'POST', body: { text: 'my own reply words' } }); await sleep(900);
  const tail = stdinLog().split('\n').filter(Boolean).slice(-3).join('\n');
  check('(a) a reply sent after the clear reaches the session with the SENTENCE in its quote, never the old words', (r.status === 200 || r.status === 409) && !has(tail) && (tail.includes(CT) || r.status === 409), { status: r.status, body: r.text.slice(0, 200), tail: tail.slice(0, 400) }); }
// (b) the agent resolving by the OLD text finds nothing; "cleared" matches nothing (a cleared item answers to its id only)
{ const r1 = await agent('/api/agent/user-todo', { method: 'POST', body: { resolve: w('t1x') } }); const r2 = await agent('/api/agent/user-todo', { method: 'POST', body: { resolve: 'cleared' } });
  const only = (t, q) => wordsIn(t).every((x) => x === q);
  check('(b) resolve by the old text ⇒ no match (the answer echoes the query, nothing else); resolve "cleared" ⇒ no match', !!(r1.json && r1.json.error) && !!(r2.json && r2.json.error) && only(r1.text, w('t1x')) && !has(r2.text), { r1: r1.text.slice(0, 200), r2: r2.text.slice(0, 200) }); }
// (c) a job whose For-you item was ALREADY resolved: the cascade cleared it too
{ const r = await raw('/api/user-todos'); const all = [...((r.json.todos || {}).open || []), ...((r.json.todos || {}).resolved || [])]; const it = all.find((x) => x.id === T3) || null; check('(c) the cleared job\'s already-resolved For-you item lost its words too (the cascade covers every status)', !!it && it.text === CT && !has(it), it); }
// (d) a group message posted after the last report, cleared BEFORE the member's next turn: the report says the sentence
let M6 = null;
{ const post = await raw(`/api/channel-groups/${GID}/post`, { method: 'POST', body: { text: `bee again: ${w('g6t')}`, from: B_CID } });
  M6 = post.json && post.json.message && post.json.message.vendorId;
  check('(d) a message posted after the last report (the owner\'s route, as bee)', post.status === 200 && !!M6, post.text.slice(0, 200)); }
let judgeFrames = clearedFramesDone;
if (M6) {
  const rc = await clearOne({ kind: 'group-message', groupId: GID, id: M6 });
  await sleep(300); judgeFrames = frames.length; // the post itself rode a broadcast (its words, as posted — before its clear)
  const pc = await agent('/api/agent/prompt-context');
  check('(d) the next-turn report of a message cleared before the turn carries the sentence, not the word', rc.status === 200 && !pc.text.includes(w('g6t')) && pc.text.includes(CT), { rc: rc.json, pc: pc.text.slice(0, 600) });
}
// a job that announces AFTER its clear puts new words in the viewers' ring; a SECOND clear answers `already` for the record and still takes them
{ const an = await jobAs(`/api/agent/jobs/${LIVE_JOB}/announce`, { method: 'POST', body: { text: w('j9a') } }); await sleep(800);
  const pc1 = await agent('/api/agent/prompt-context'); // consumes the update ring up to now (the words were new output — legitimately shown)
  const an2 = await jobAs(`/api/agent/jobs/${LIVE_JOB}/announce`, { method: 'POST', body: { text: w('j9b') } }); await sleep(800);
  const rc = await clearOne({ kind: 'job', id: LIVE_JOB });
  const pc2 = await agent('/api/agent/prompt-context');
  check('a second clear of a cleared job (the record answers already, or cleared for its new delivery reason) takes a later announce\'s words from the viewers\' ring', an.status === 200 && an2.status === 200 && rc.status === 200 && (rc.json.already + rc.json.cleared) === 1 && pc1.text.includes(w('j9a')) && !pc2.text.includes(w('j9b')), { rc: rc.json, pc1: wordsIn(pc1.text), pc2: wordsIn(pc2.text) }); }
await sleep(300); judgeFrames = frames.length; // the announces above rode live peer cards (their words as new output, before the second clear)
// (e) a wake that could not be delivered is NEVER stashed (the engine's law) — the stash file holds no group word
{ let stash = ''; try { stash = fs.readFileSync(path.join(DATA, 'msg-stash.json'), 'utf8'); } catch {} check('(e) data/msg-stash.json holds no group message word (a refused wake rides the next report, never the stash)', !has(stash), stash.slice(0, 300)); }
// (f) a config bundle exported AFTER the clear re-imports as cleared (and one exported BEFORE is the user's own snapshot — declared)
{ const ex = await raw('/api/config/export', { method: 'POST', body: { sections: ['tasks'] } }); const im = await raw('/api/config/import', { method: 'POST', body: { file: ex.json, sections: ['tasks'] } }); await sleep(400); const t = await raw('/api/tasks');
  check('(f) export after the clear carries no word; its re-import keeps every entry cleared (stamp + sentence)', !has(ex.text) && im.status === 200 && !has(t.text) && (t.json.tasks || []).find((g) => g.id === W).progress.filter((p) => p.clearedAt).length >= 3, { ex: wordsIn(ex.text), im: im.text.slice(0, 200), t: wordsIn(t.text) }); }

// ── §4 AFTER ──
console.log('\n§4 AFTER: every reader again — no word anywhere');
for (const p of PROBES) {
  if (p.once) continue;
  let r; try { r = await p.call(); } catch (e) { r = { text: 'THREW ' + e.message }; }
  const t = textOf(r);
  check(`${p.name} — clean`, !has(t), { words: wordsIn(t), status: r && r.status, head: t.slice(0, 300) });
}
// a job that ran again after the clear: its NEW output is its own (the live job's run started before the clear ⇒ withheld)
{ const r = await raw(`/api/jobs/${LIVE_JOB}?tail=50`); check('the live job cleared mid-run: its snapshot withholds the covered log and names it', r.json && r.json.job && r.json.job.logWithheld === true && !has(r.text), r.json && r.json.job && { logWithheld: r.json.job.logWithheld, logTail: r.json.job.logTail, name: r.json.job.name, words: wordsIn(r.text) }); }
// the live job is STOPPED by force after the clear (the wrapper dies with it: no exit marker) — the run's finalize must not re-stamp its last line from the withheld log
{ const st = await raw(`/api/jobs/${LIVE_JOB}/stop`, { method: 'POST', body: { force: true } }); let r = null, run = null; for (let i = 0; i < 60; i++) { r = await raw(`/api/jobs/${LIVE_JOB}?tail=50`); run = r.json && r.json.job && r.json.job.run; if (run && run.endedAt) break; await sleep(500); } check('a run that started before the clear and ended after it does not re-publish the withheld log as its last line', st.status === 200 && !!run && !!run.endedAt && !has(r.text), { st: st.json, run, words: wordsIn(r.text) }); }
// the broadcasts the owner's client saw from the clear on
{ const seen = frames.slice(judgeFrames); const leak = seen.filter((f) => has(f)); check(`every broadcast after the clear answered (${seen.length} frames: ${[...new Set(seen.map((f) => f.type))].join(' ')}) carries no word`, !leak.length, leak.slice(0, 3).map((f) => ({ type: f.type, words: wordsIn(f) }))); }
// "Hand over now" after the clear (verify r3 on the merged tree: the census's derived file list found this route outside the old
// hand list): the owner hands the seat's waiting notices over as ONE turn — what reaches the stub's stdin carries no word; a
// seat with nothing waiting is refused by name (409 nothing_waiting), never a leak
{ const ho = await raw(`/api/sessions/${WIN}/stash/hand-over`, { method: 'POST', body: {} }); await sleep(900);
  const tail = stdinLog().split('\n').filter(Boolean).slice(-3).join('\n');
  check(`POST /api/sessions/:id/stash/hand-over after the clear ⇒ ${ho.status} ${(ho.json && (ho.json.code || (ho.json.ok && 'delivered ' + ho.json.delivered))) || ''}: nothing it delivered carries a word`, (ho.status === 200 || (ho.status === 409 && ho.json && ho.json.code === 'nothing_waiting')) && !has(tail) && !has(ho.text), { status: ho.status, body: ho.text.slice(0, 200), tail: wordsIn(tail) });
  const hoA = await raw(`/api/sessions/${WIN}/stash/hand-over`, { method: 'POST', body: {}, headers: AG }); check('…and an agent\'s bearer on it ⇒ 403 agent_forbidden', hoA.status === 403 && hoA.json && hoA.json.code === 'agent_forbidden', hoA); }
// a second user turn after the clear: what the chat injects (override notices, the group report, the held job notifications) carries no word
await turn('second turn');
{ const log = stdinLog(); const after = log.slice(log.indexOf('second turn')); check('the stub\'s stdin after the clear (a typed turn + what rode it) carries no word', !has(after), wordsIn(after)); }
// the files: the ONLY holders of a word are the declared append-only bytes
{
  const out = execSync(`grep -rl -F ${J(S)} ${J(DATA)} ${J(fakeHome)} 2>/dev/null || true`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const rel = out.map((f) => f.replace(DATA + '/', 'data/').replace(fakeHome + '/', '$HOME/'));
  // the 2.369.221 integration (lane global-search): the search index under $HOME/.vibespace/db/<hash>/ is a TRANSCRIPT-CLASS copy
  // (test-record-clear-census EXCEPTIONS: it re-derives from the conversation's own record). Its holder is declared by what its own
  // reader finds: every word in its files is found by GET /api/search ONLY as a USER-side message of the seat's own conversation — what went INTO the
  // agent: a typed turn, or a server delivery (a drained job notification, a group report) that the CLI records in its transcript
  // (this stub keeps none, and a delivery never crosses its stdin) — and no artifact row holds one. A word that reached the index
  // any other way (an assistant row, another conversation, an artifact, a byte no row explains) stays undeclared ⇒ red.
  const IX = /^\$HOME\/\.vibespace\/db\/[0-9a-f]+\/search\.db(?:-wal|-shm)?$/;
  const ixFiles = out.filter((f, i) => IX.test(rel[i]));
  const ixWords = [...new Set(ixFiles.flatMap((f) => wordsIn(fs.readFileSync(f, 'latin1'))))];
  // read through the index's OWN reader (the worker holds the db with locking_mode=EXCLUSIVE — a second connection reads "locked")
  const ixHits = [];
  for (const x of ixWords) { const r = await raw(`/api/search?q=${encodeURIComponent(x)}&limit=100`); for (const h of (r.json && r.json.hits) || []) ixHits.push({ word: x, kind: h.kind, sid: h.sid || h.sessionId || null, role: h.role || null, at: h.uuid || h.path || null, has: has(h.snippet) }); }
  const found = new Set(ixHits.filter((h) => h.has).map((h) => h.word));   // (raw page bytes: a word at the end of a value can carry the next record byte — a found prefix counts)
  const ixDeclared = ixHits.every((h) => h.kind === 'message' && h.sid === SID && h.role === 'user') && ixWords.every((x) => found.has(x) || [...found].some((d) => x.startsWith(d)));
  const declared = (f) => /^data\/channels\/msgs\/groups\/[^/]+\.ndjson$/.test(f) || /^data\/job-logs\/[^/]+\/\d+\/current\.log$/.test(f) || (IX.test(f) && ixDeclared);
  const undeclared = rel.filter((f) => !declared(f));
  check(`the data dir + HOME: every file still holding a word is a DECLARED append-only holder (${rel.length} files: ${rel.join(', ')})`, !undeclared.length, undeclared);
  check(`…the search index holds a word only in the seat's own user-side rows (${ixWords.length} word(s) in its files; GET /api/search finds them in: ${[...new Set(ixHits.map((h) => h.kind + ' ' + (h.role || '') + ' ' + h.at))].join(', ') || 'nothing'})`, !ixFiles.length || ixDeclared, { hits: ixHits, words: ixWords });
  check('…and the declared holders are exactly the group log and the run logs (the clear withholds both from every reader)', rel.some((f) => f.startsWith('data/channels/msgs/groups/')) && rel.some((f) => f.startsWith('data/job-logs/')), rel);
}
// the server's own journal: ids only
{ const j = fs.readFileSync(JOURNAL, 'utf8'); const lines = j.split('\n').filter((l) => has(l)); check('the server journal carries no word (the [clear] lines name ids only)', !lines.length, lines.slice(0, 5)); check('…and it DID write the [clear] receipts', /\[clear\] (activity|todo|status|job|group-message)/.test(j), j.split('\n').filter((l) => l.includes('[clear]')).slice(0, 3)); }
// verify r8 ③ ②: an incident captured AFTER the clear (its server half copies the console ring — the journal) and the
// published service's forward (relabelled by the door) carry no word
{ const inc = await raw('/api/incident', { method: 'POST', body: { note: 'walk after the clear', rings: {}, snapshot: {} } });
  const b = inc.json && inc.json.id ? fs.readFileSync(path.join(DATA, 'incidents', inc.json.id, 'bundle.json'), 'utf8') : '';
  check('verify r8: an incident captured after the clear — its server console ring (the journal) included — carries no word', !!b && b.includes('"console"') && !has(b), { id: inc.json, words: wordsIn(b), at: b.slice(Math.max(0, b.indexOf(S) - 200), b.indexOf(S) + 40) });
  let fwds = null; for (let i = 0; i < 20; i++) { fwds = await raw('/api/port-forwards'); if (!has(fwds.text)) break; await sleep(250); }
  check('verify r8: the published service\'s forward reads the sentence (GET /api/port-forwards carries no word)', !has(fwds.text) && ((fwds.json && fwds.json.forwards) || []).some((f) => Number(f.remotePort) === SVC_PORT && f.label === 'service: ' + CT), wordsIn(fwds.text));
  await raw(`/api/jobs/${SVC_JOB}/stop`, { method: 'POST', body: { force: true } }); }
// telemetry + incidents: no word
{ const tel = execSync(`grep -rl -F ${J(S)} ${J(path.join(DATA, 'telemetry'))} ${J(path.join(DATA, 'incidents'))} 2>/dev/null || true`, { encoding: 'utf8' }).trim(); check('telemetry shards + incident captures carry no word', !tel, tel); }

// ── §5 CONTROL: the walk's judge over a copy whose For-you snapshot serves a SHADOW copy of the words ──
console.log('\n§5 CONTROL: a reader that keeps a shadow copy of the words makes the same judge go red');
{
  const src = fs.readFileSync(path.join(repo, 'src/user-todos.js'), 'utf8');
  const at = src.indexOf('  snapshot() {');
  const patched = src.slice(0, at) + `  snapshot() { const s = this._snapshot0(); if (!this._shadow) this._shadow = new Map(this._state.items.map((i) => [i.id, i.text])); const fix = (i) => ({ ...i, text: this._shadow.get(i.id) || i.text }); for (const k of Object.keys(s)) if (Array.isArray(s[k])) s[k] = s[k].map(fix); return s; }\n  _snapshot0() {` + src.slice(at + '  snapshot() {'.length);
  const { UserTodoManager: Mut } = MUT.load('src/user-todos.js', patched, 'shadow-snapshot');
  const dir = scratch('rc-walk-ctl'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'user-todos.json'), J({ items: [todo('ut-c0000001', { text: `shadow ${w('c1x')}` })] }));
  const m = new Mut({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
  m.snapshot(); // the shadow forms
  const r = m.clearItems(['ut-c0000001'], { by: 'owner' });
  const leak = has(m.snapshot());
  check('CONTROL: the patched copy (a snapshot reading a shadow copy of the text) still shows the word after the clear — the walk\'s judge is RED on it', r.cleared.length === 1 && leak, { r, snap: m.snapshot() });
  try { m.stop(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}
for (const row of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1, label: '§5 ' })) check(row.name, row.pass, row.detail);

try { wsc.close(); } catch {}
console.log(`\n${failed ? '✗' : '✓'} test-record-clear-walk: ${passed} passed, ${failed} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
