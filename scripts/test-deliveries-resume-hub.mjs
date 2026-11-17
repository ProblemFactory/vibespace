#!/usr/bin/env node
// test-deliveries-resume-hub.mjs — the manager design's piece 7 ON A REAL HUB (主开发 2026-11-17; the owner's narrowed rule 04:56Z,
// the grant on the job 05:02Z, its three writers 05:13Z): a throwaway hub (this tree), a stub CLI that logs every stdin frame by
// conversation, the REAL jobs engine (notify-cron reminders), the REAL spend guard and ledger, the REAL resume road — and a
// MACHINE RESTART staged by ending every process rooted in the scratch tree, then booting again over the same data.
//   ① the grant's writers BEFORE the end: the person's press (POST /api/jobs/:id/wake-grant); a manager key holding the verb
//      jobs.wakeGrant (the row records the key); a key WITHOUT the verb refused by name; an agent token's write refused by name,
//      naming the propose door; propose-wake with no proposal card on this instance ⇒ proposal_door_not_ready, the grant still no
//   ② the restart: R ended by it (kept `dead-socket-at-boot` — the boot writes it); P ended by a PERSON and A by an AGENT (kept
//      `ended` + endedBy — STAND-IN for piece 3's writer, which no tree has yet: this suite writes that record as piece 3 will)
//   ③ the first reminders fire: R is resumed with NO grant — ONE frame, the design's sentence, the window's line; P's schedule
//      WITHOUT the grant and A's plain job wait — nothing starts — and their journals say it was ended on purpose (RED CONTROL:
//      R's road is the restart road applied to the same reminder shape)
//   ④ the person grants P's schedule between its two fires; the second fire resumes P ONCE, the line «you allowed it»; A's granted
//      job resumes A; K's job, granted by the manager key, resumes K and the line names the key; ONE ledger row per resume
// THE MOMENTS (主开发 12:46Z): no wall-clock minute marks — one-time reminders at fixed offsets from their registration (75 s and
// 120 s: both well after the second boot), and every check WAITS on the ledger's row / the resumed run, never a fixed sleep.
// (P's two fires are two one-time reminders: the grant flips the second — the schedule-level rule is the in-process suite's.)
// Run: node scripts/test-deliveries-resume-hub.mjs   (heavy: ~2.5 min; the integrator runs it alone at lining)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VNC_ENV = await vncEnv();
const [PORT] = await freePorts(1);
const BASE = `http://127.0.0.1:${PORT}`;
const wt = scratch('dr-wt'), stubDir = scratch('dr-stub'), fakeHome = scratch('dr-home'), CWD = scratch('dr-cwd');
for (const d of [stubDir, fakeHome, CWD]) fs.mkdirSync(d, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECOND = 'deliveries resume leg second password';

// ── a throwaway hub: the committed tree + this tree's src / public / data/bin (the CLI ships there) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
execSync(`rm -rf ${wt}/data/bin && mkdir -p ${wt}/data && cp -r ${repo}/data/bin ${wt}/data/bin`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
// a stub claude: every spawn announces ITS OWN conversation id and records its env + argv (the token, what the spawn asked)
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
// a RESUMED run (the manager design's piece 4) is that conversation: it echoes --resume's id; every run logs its stdin lines by id
const sid = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : require('crypto').randomUUID();
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid, args, token: process.env.VIBESPACE_SESSION_TOKEN || null, webui: process.env.CLAUDE_WEBUI_SESSION_ID || null }));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.274' }) + '\\n');
// its transcript, where the CLI keeps one (~/.claude/projects/<the folder, encoded>/<id>.jsonl): an ENDED conversation is found by it
if (!args.includes('--resume')) { const proj = require('path').join(require('os').homedir(), '.claude', 'projects', process.cwd().replace(/[/._]/g, '-')); fs.mkdirSync(proj, { recursive: true }); const at = new Date().toISOString(); fs.writeFileSync(proj + '/' + sid + '.jsonl', JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' }, uuid: 'u-' + sid, timestamp: at, cwd: process.cwd(), sessionId: sid }) + '\\n' + JSON.stringify({ type: 'assistant', message: { id: 'msg_' + sid, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: 'a-' + sid, parentUuid: 'u-' + sid, timestamp: at, cwd: process.cwd(), sessionId: sid }) + '\\n'); }
let inBuf = '';
process.stdin.on('data', (d) => { inBuf += d; let i; while ((i = inBuf.indexOf('\\n')) >= 0) { const line = inBuf.slice(0, i); inBuf = inBuf.slice(i + 1); if (line.trim()) fs.appendFileSync(${JSON.stringify(stubDir)} + '/stdin-' + sid + '.ndjson', line + '\\n'); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
let srv = null;
const hubLog = path.join(stubDir, 'hub.log');
/** (re)start the hub on the same tree and data — the restart road needs a second boot over the first one's records */
async function boot() {
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1' }, stdio: ['ignore', fs.openSync(hubLog, 'a'), fs.openSync(hubLog, 'a')] });
  for (let i = 0; i < 120; i++) { try { await fetch(`${BASE}/api/home`); return true; } catch { await sleep(250); } }
  return false;
}
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir, CWD]) { try { endRootedProcesses(root); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, fakeHome, stubDir, CWD]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5 }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
await boot();

/** ONE request — a PERSON on the page (Sec-Fetch-Site same-origin: the person doors' rule) or an agent's Bearer. */
const req = (method, p, body, { bearer = null } = {}) => new Promise((resolve) => {
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const headers = { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : { 'Sec-Fetch-Site': 'same-origin', Origin: BASE }), ...(data ? { 'Content-Length': data.length } : {}) };
  const r = http.request(`${BASE}${p}`, { method, headers }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, json: j }); }); });
  r.on('error', (e) => resolve({ status: 0, json: { error: e.message } }));
  if (data) r.write(data); r.end();
});
const cli = (args, token) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-api'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => { let json = null; try { json = JSON.parse(out); } catch { } resolve({ code, out, err, json }); });
});
const stubs = () => fs.readdirSync(stubDir).filter((x) => x.startsWith('env-')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
const active = async () => ((await req('GET', '/api/active')).json || {}).sessions || [];
const until = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(250); } };

const WebSocket = require('ws');
let ws = null;
const frames = [];
async function connect() { ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r) => ws.on('open', r)); ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} }); }
await connect();
/** A live conversation through the real create path (the owner's own ws frame) → {wid, sid, token}. */
async function liveConversation(reqId, extra = {}) {
  const before = new Set(stubs().map((x) => x.sid));
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, ...extra }));
  const created = await until(() => frames.find((m) => m && m.type === 'created' && m.reqId === reqId));
  const st = await until(() => stubs().find((x) => !before.has(x.sid) && x.token));
  const live = st && await until(async () => (await active()).find((s) => s.id === (created && created.sessionId) && (s.backendSessionId === st.sid || s.claudeSessionId === st.sid)));
  return { wid: created && created.sessionId, sid: st && st.sid, token: st && st.token, live: !!live };
}


const stdinOf = (sid) => { try { return fs.readFileSync(path.join(stubDir, `stdin-${sid}.ndjson`), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const userFrames = (sid) => stdinOf(sid).filter((m) => m.type === 'user');
const frameText = (m) => { const c = m && m.message && m.message.content; return typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : JSON.stringify(m); };
const ledgerRows = () => { try { const b = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'spend-budget.json'), 'utf8')).budget || {}; return (b.instance || []).length; } catch { return 0; } };
const resumedRun = (sid) => stubs().filter((x) => x.args.includes('--resume') && x.args[x.args.indexOf('--resume') + 1] === sid);
const jobsAll = async () => ((await req('GET', '/api/jobs')).json || {}).jobs || [];
const jobNamed = async (name) => (await jobsAll()).find((j) => j.name === name) || null;
const job = (args, token) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-job'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ code, out, err }));
});
/** the STAND-IN for piece 3's writer: the kept record of a conversation ended ON PURPOSE (its meta moved to `.json.stopped`
 *  with stopReason «ended» and who) — written while the hub is down, read by the next boot like any kept record */
function endOnPurpose(sid, endedBy) {
  const dir = path.join(wt, 'data', 'session-meta');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let m = null; try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (!m || (m.claudeSessionId !== sid && m.backendSessionId !== sid)) continue;
    fs.writeFileSync(path.join(dir, f + '.stopped'), JSON.stringify({ ...m, status: 'stopped', stopReason: 'ended', stoppedAt: Date.now(), endedBy }));
    fs.unlinkSync(path.join(dir, f));
    return f;
  }
  return null;
}
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();   // a one-time reminder's moment, relative to its registration

try {
  console.log('① five conversations, their reminders, and the grant\'s writers');
  const su = await req('POST', '/api/vault/setup', { password: SECOND });
  check('the vault set up by a person on the page (the keys need it)', su.status === 200 && su.json && su.json.state === 'unlocked', su);
  const C = await liveConversation('dr-coord', { name: 'coordinator' });
  const E = await liveConversation('dr-other', { name: 'no verb' });
  const R = await liveConversation('dr-r', { name: 'restart ended' });
  const P = await liveConversation('dr-p', { name: 'person ended' });
  const A = await liveConversation('dr-a', { name: 'agent ended' });
  const K = await liveConversation('dr-k', { name: 'key granted' });
  check('six live conversations, each with its own token and conversation id', [C, E, R, P, A, K].every((x) => x.live && /^vsst_/.test(x.token)), [C, E, R, P, A, K].map((x) => x.live));
  const T1 = isoIn(75e3), T2 = isoIn(120e3);
  const reg = async (who, name, at, text) => job(['notify-cron', '--name', name, '--at', at, '--text', text], who.token);
  const regs = [await reg(R, 'r-remind', T1, 'the R reminder'), await reg(P, 'p-remind', T1, 'the P reminder'), await reg(P, 'p-second', T2, 'the P second reminder'), await reg(A, 'a-plain', T1, 'the A plain result'), await reg(A, 'a-granted', T2, 'the A granted result'), await reg(K, 'k-remind', T2, 'the K reminder')];
  check(`six one-time reminders registered by their own conversations (at ${T1} and ${T2})`, regs.every((r) => r.code === 0), regs.map((r) => r.err || r.out).join(' | '));
  const J = {}; for (const n of ['r-remind', 'p-remind', 'p-second', 'a-plain', 'a-granted', 'k-remind']) J[n] = await jobNamed(n);
  check('…each owned by its conversation, no grant (the default)', Object.values(J).every((j) => j && j.wakesEndedOwner === false), Object.values(J).map((j) => j && [j.name, j.wakesEndedOwner]));

  const byToken = await req('POST', `/api/agent/jobs/${J['p-remind'].id}/wake-grant`, { grant: true }, { bearer: P.token });
  const cookieWithBearer = await req('POST', `/api/jobs/${J['p-remind'].id}/wake-grant`, { grant: true }, { bearer: P.token });
  check('an agent token\'s WRITE is refused by name — on its own route and on the person\'s — naming the doors that exist (the person\'s, the key verb)',
    byToken.status === 403 && byToken.json.code === 'wake_grant_person_only' && /Terminate confirm/.test(byToken.json.error) && /jobs\.wakeGrant/.test(byToken.json.error) && cookieWithBearer.status === 403 && cookieWithBearer.json.code === 'wake_grant_person_only', { byToken, cookieWithBearer });
  const created = await req('POST', '/api/agent/jobs', { kind: 'cron', name: 'sneaky', schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: 'x' }, wakesEndedOwner: true }, { bearer: P.token });
  check('…and a registration carrying the field is refused by name (nothing created)', created.status === 403 && created.json.code === 'wake_grant_person_only' && !(await jobNamed('sneaky')), created);
  const prop = await job(['propose-wake', J['p-remind'].id, 'so the morning digest reaches it after an end'], P.token);
  const regProp = await job(['notify-cron', '--name', 'p-extra', '--at', isoIn(3600e3), '--text', 'extra', '--propose-wake', 'it carries the digest'], P.token);
  check('propose-wake with no proposal card on this instance ⇒ refused by name (proposal_door_not_ready); --propose-wake at registration creates the job and says the same',
    prop.code !== 0 && /proposal card is not on this instance/.test(prop.err + prop.out) && regProp.code === 0 && /wake proposal was NOT filed/.test(regProp.out), { prop, regProp });
  const rows0 = (await req('GET', `/api/jobs-wake-grants?conversation=${P.sid}`)).json || {};
  check('…the grant stays NO until a person\'s press (the doors\' rows say so)', Array.isArray(rows0.rows) && rows0.rows.length >= 2 && rows0.rows.every((r) => r.grant === false), rows0);

  const pressA = await req('POST', `/api/jobs/${J['a-granted'].id}/wake-grant`, { grant: true });
  check('the PERSON\'s press grants A\'s second job (the row records the person)', pressA.status === 200 && pressA.json.wakesEndedOwner === true && pressA.json.wakeGrantBy && pressA.json.wakeGrantBy.kind === 'person', pressA);
  const mk = await req('POST', '/api/automation/keys', { name: 'dispatch', scopes: ['jobs.wakeGrant'], limits: { cwdRoots: [CWD], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] } });
  const KEY = mk.json && mk.json.key && mk.json.key.id;
  await req('POST', `/api/automation/keys/${KEY}/grants`, { subjects: [`session:${C.sid}`] });
  const kg = ((await req('GET', '/api/automation/keys')).json.keys.find((k) => k.id === KEY) || { grants: [] }).grants.find((g) => g.subject === `session:${C.sid}`);
  const widen = kg && await req('POST', `/api/automation/grants/${kg.id}/reach`, { reach: 'instance' });
  const mk2 = await req('POST', '/api/automation/keys', { name: 'reader', scopes: ['conversations.status'], limits: { cwdRoots: [CWD], accounts: 'any', permissionModes: ['default'], models: 'any', modes: ['chat'] } });
  await req('POST', `/api/automation/keys/${mk2.json.key.id}/grants`, { subjects: [`session:${E.sid}`] });
  const viaKey = await cli(['call', 'jobs.wakeGrant', '--job', J['k-remind'].id, '--grant', 'on'], C.token);
  const noVerb = await cli(['call', 'jobs.wakeGrant', '--job', J['k-remind'].id, '--grant', 'on'], E.token);
  const kj = await jobNamed('k-remind');
  check('a MANAGER KEY holding jobs.wakeGrant sets K\'s grant (the row records the key by name)', viaKey.code === 0 && !!widen && kj.wakesEndedOwner === true && kj.wakeGrantBy && kj.wakeGrantBy.kind === 'key' && kj.wakeGrantBy.name === 'dispatch', { viaKey, wg: kj && kj.wakeGrantBy });
  check('…a key WITHOUT the verb is refused by name (verb_not_in_scope)', noVerb.code !== 0 && /verb_not_in_scope/.test(noVerb.err + noVerb.out), noVerb);

  console.log('② the machine restarts: R by the restart; P by a person, A by an agent, K by a person (piece 3\'s record, stood in)');
  try { ws.close(); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  await sleep(400);
  for (const root of [wt, CWD, fakeHome]) { try { endRootedProcesses(root); } catch { } }
  await sleep(600);
  const kept = [endOnPurpose(P.sid, { kind: 'person', actorId: 'person', name: null }), endOnPurpose(A.sid, { kind: 'agent', actorId: `agent:${C.sid}`, name: 'coordinator' }), endOnPurpose(K.sid, { kind: 'person', actorId: 'person', name: null })];   // piece 3's endedBy {kind, actorId, name}
  check('the kept records of the three ended on purpose (stand-in for piece 3\'s writer)', kept.every(Boolean), kept);
  const booted = await boot();
  await connect();
  const keptR = await until(() => fs.readdirSync(path.join(wt, 'data', 'session-meta')).filter((f) => f.endsWith('.json.stopped')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); } catch { return null; } }).find((m) => m && (m.claudeSessionId === R.sid || m.backendSessionId === R.sid) && m.stopReason === 'dead-socket-at-boot'), 20000);
  check('the hub boots again; R\'s record says the restart ended it (dead-socket-at-boot — the boot wrote it)', booted && !!keptR, { booted, keptR: !!keptR });
  const ledger0 = ledgerRows();

  console.log(`③ ${T1}: the first reminders`);
  const rBack = await until(() => (resumedRun(R.sid).length && userFrames(R.sid).length >= 1 && ledgerRows() > ledger0 ? true : null), 150000);   // waits on the ledger's row
  const rf = userFrames(R.sid);
  check('R (ended by the restart, NO grant) is resumed: its CLI started with --resume, ONE user frame — the reminder and the design\'s sentence',
    !!rBack && resumedRun(R.sid).length === 1 && rf.length === 1 && /the R reminder/.test(frameText(rf[0])) && /resumed to hand you this/.test(frameText(rf[0])), { runs: resumedRun(R.sid).length, frames: rf.map(frameText) });
  const rRow = (await active()).find((s) => s.backendSessionId === R.sid || s.claudeSessionId === R.sid);
  check('…its window\'s line says what resumed it and when (the session\'s resumedBy)', !!rRow && rRow.resumedBy && rRow.resumedBy.params && /r-remind/.test(rRow.resumedBy.params.what) && Number(rRow.resumedBy.at) > 0, rRow && rRow.resumedBy);
  const wakeLine = (j) => (j.notifyLog || []).find((l) => l && l.lane === 'wake' && l.ok === false);
  const jobOf = async (n) => ((await req('GET', `/api/jobs/${J[n].id}`)).json || {}).job || {};
  await until(async () => (wakeLine(await jobOf('p-remind')) && wakeLine(await jobOf('a-plain')) ? true : null), 60000);   // waits on the journals' wake lines
  const pJ = await jobOf('p-remind'), aJ = await jobOf('a-plain');
  check('P\'s schedule WITHOUT the grant fired at a PERSON-ended conversation: NOTHING starts (no --resume run, no frame)', resumedRun(P.sid).length === 0 && userFrames(P.sid).length === 0, { runs: resumedRun(P.sid).length });
  check('…its journal says its owner was ended on purpose, and by whom', !!wakeLine(pJ) && /ended on purpose by a person/.test(wakeLine(pJ).reason), pJ.notifyLog);
  const pRowW = await until(async () => { const rows = ((await req('GET', '/api/sessions')).json || {}).sessions || []; const r = rows.find((x) => (x.backendSessionId || x.sessionId) === P.sid); return r && r.waiting ? r : null; }, 15000);   // the sweep's cache answers for 4.5 s
  check('…and P\'s ENDED row in the sessions list carries the waiting fact (n ≥ 1, ended on purpose) — the card and the window\'s bar word it', !!pRowW && pRowW.waiting && pRowW.waiting.n >= 1 && pRowW.waiting.code === 'ended_on_purpose', pRowW && pRowW.waiting);
  check('A\'s job WITHOUT the grant at an AGENT-ended conversation waits — its journal names the agent', resumedRun(A.sid).length === 0 && !!wakeLine(aJ) && /coordinator/.test(wakeLine(aJ).reason), aJ.notifyLog);

  console.log(`④ ${T2}: the granted ones`);
  const pressP = await req('POST', `/api/jobs/${J['p-second'].id}/wake-grant`, { grant: true });
  check('the person grants P\'s second reminder between the two fires', pressP.status === 200 && pressP.json.wakesEndedOwner === true, pressP);
  const ledger1 = ledgerRows();
  const pBack = await until(() => (userFrames(P.sid).length && userFrames(A.sid).length && userFrames(K.sid).length && ledgerRows() >= ledger1 + 3 ? true : null), 150000);   // waits on the ledger's rows
  const rowOf = async (sid) => (await active()).find((s) => s.backendSessionId === sid || s.claudeSessionId === sid);
  const pRow = await rowOf(P.sid), kRow = await rowOf(K.sid), aRow = await rowOf(A.sid);
  check('the same schedule WITH the grant resumes P ONCE (one run, one frame) — and the window says what resumed it and that the person allowed it',
    !!pBack && resumedRun(P.sid).length === 1 && userFrames(P.sid).length === 1 && /the P second reminder/.test(frameText(userFrames(P.sid)[0])) && /the P reminder/.test(frameText(userFrames(P.sid)[0])) && pRow && pRow.resumedBy && /you allowed it/.test(pRow.resumedBy.key), { runs: resumedRun(P.sid).length, line: pRow && pRow.resumedBy });
  check('A\'s job WITH the person\'s grant resumes the AGENT-ended conversation (its waiting plain result rides the same frame)',
    resumedRun(A.sid).length === 1 && userFrames(A.sid).length === 1 && /the A granted result/.test(frameText(userFrames(A.sid)[0])) && /the A plain result/.test(frameText(userFrames(A.sid)[0])) && aRow && aRow.resumedBy, { frames: userFrames(A.sid).map(frameText) });
  check('K\'s job, granted by the MANAGER KEY, resumes K — and the line names the key', resumedRun(K.sid).length === 1 && userFrames(K.sid).length === 1 && kRow && kRow.resumedBy && kRow.resumedBy.params && kRow.resumedBy.params.by === 'dispatch', kRow && kRow.resumedBy);
  check('ONE ledger row per resumed delivery (R, P, A, K: four) — the resumes themselves charge nothing', ledgerRows() - ledger0 === 4, { before: ledger0, after: ledgerRows() });
} catch (e) {
  failed++; console.error('  ✗ threw: ' + ((e && e.stack) || e));
} finally {
  try { ws.close(); } catch { }
  cleanup();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
