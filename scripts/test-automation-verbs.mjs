#!/usr/bin/env node
// THE CONVERSATION VERBS ON A REAL HUB (heavy: a worktree hub, a stub claude behind the real chat wrapper, no browser — lane
// automation-verbs, design q-046 L2 over L1's keys). The coordinator's own road, end to end, through the REAL vibespace-api:
//   ① the vault set up (a person on the page — Sec-Fetch-Site same-origin), a Task Group, a LIVE coordinator conversation
//      (its own vsst_ in the stub's env), a second live conversation in the same group with NO grant, an agent group of the
//      coordinator's
//   ② a key minted with the six verbs and granted to the coordinator's conversation
//   ③ the coordinator: conversations open (the CLI's argv reaches the worker's spawn: --model / --effort / --permission-mode)
//      ⇒ its sessionId AND conversation id (open waits for it) · status · rename · bind into its Task Group · groups invite
//      (quiet) · end ⇒ every effect seen on the hub (the session list, the Task Group, the group's members, the worker gone)
//   ④ THE AUDIT: one line per verb for the coordinator (open / status / rename / bind / invite / end, ok), names only;
//      THE SPEND: one automation-open stamp charged to the key's identity (data/spend-budget.json)
//   ⑤ a conversation WITHOUT a grant opens ⇒ the first-use card in For you (action automation-ask); the person denies ⇒
//      ask_denied (exit 1), nothing spawned, nothing charged
//   ⑥ LOCKED ⇒ 423 vault_locked on every verb of the door, and the CLI exits 3
// Run: node scripts/test-automation-verbs.mjs
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
const wt = scratch('av-wt'), stubDir = scratch('av-stub'), fakeHome = scratch('av-home'), CWD = scratch('av-cwd');
for (const d of [stubDir, fakeHome, CWD]) fs.mkdirSync(d, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECOND = 'automation verbs leg second password';

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
const sid = require('crypto').randomUUID();
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid, args, token: process.env.VIBESPACE_SESSION_TOKEN || null, webui: process.env.CLAUDE_WEBUI_SESSION_ID || null }));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.274' }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
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
for (let i = 0; i < 80; i++) { try { await fetch(`${BASE}/api/home`); break; } catch { await sleep(250); } }

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
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r) => ws.on('open', r));
const frames = [];
ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
/** A live conversation through the real create path (the owner's own ws frame) → {wid, sid, token}. */
async function liveConversation(reqId, extra = {}) {
  const before = new Set(stubs().map((x) => x.sid));
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, ...extra }));
  const created = await until(() => frames.find((m) => m && m.type === 'created' && m.reqId === reqId));
  const st = await until(() => stubs().find((x) => !before.has(x.sid) && x.token));
  const live = st && await until(async () => (await active()).find((s) => s.id === (created && created.sessionId) && (s.backendSessionId === st.sid || s.claudeSessionId === st.sid)));
  return { wid: created && created.sessionId, sid: st && st.sid, token: st && st.token, live: !!live };
}

try {
  console.log('① the vault, a Task Group, the coordinator, a conversation with no grant, an agent group');
  const su = await req('POST', '/api/vault/setup', { password: SECOND });
  check('the vault set up by a person on the page ⇒ unlocked', su.status === 200 && su.json && su.json.state === 'unlocked', su);
  const tg = await req('POST', '/api/tasks', { title: 'Automation lane group' });
  const TASK = tg.json && (tg.json.task ? tg.json.task.id : tg.json.id);
  check(`a Task Group (${TASK})`, /^T-/.test(String(TASK)), tg);
  const C = await liveConversation('av-coord', { taskId: TASK, name: 'coordinator' });
  const D = await liveConversation('av-other', { taskId: TASK, name: 'no grant' }); // the same Task Group (the group create reaches it) — and no grant of its own
  check('the coordinator (in the Task Group) and a second conversation: live, each with its own vsst_ and conversation id', C.live && D.live && /^vsst_/.test(C.token) && /^vsst_/.test(D.token) && C.sid !== D.sid, { C: { ...C, token: !!C.token }, D: { ...D, token: !!D.token } });
  const gr = await req('POST', '/api/agent/msg/group', { op: 'create', name: 'workers', members: [D.sid], quiet: true, yes: true }, { bearer: C.token });
  const GROUP = gr.json && gr.json.group && (gr.json.group.id || gr.json.group);
  check(`the coordinator's agent group (${GROUP})`, gr.status === 200 && /^g-/.test(String(GROUP)), gr);

  console.log('② a key with the six verbs, granted to the coordinator');
  const SCOPES = ['conversations.open', 'conversations.rename', 'conversations.bind', 'conversations.end', 'groups.invite', 'conversations.status'];
  const mk = await req('POST', '/api/automation/keys', { name: 'dispatch', scopes: SCOPES });
  const KEY = mk.json && mk.json.key && mk.json.key.id;
  const gt = KEY && await req('POST', `/api/automation/keys/${KEY}/grants`, { subjects: [`session:${C.sid}`] });
  check(`the key minted (${KEY}) and granted to session:<coordinator>; no value in the answer`, /^ak-/.test(String(KEY)) && gt && gt.status === 200 && !/vsak_/.test(JSON.stringify(mk.json)), { mk: mk.status, gt: gt && gt.status });

  console.log("③ the coordinator's road through the REAL vibespace-api");
  const op = await cli(['conversations', 'open', '--cwd', CWD, '--name', 'worker one', '--model', 'opus', '--effort', 'xhigh', '--permission', 'bypassPermissions'], C.token);
  const W = op.json || {};
  const wStub = stubs().find((x) => x.sid === W.claudeSessionId);
  check('conversations open: exit 0, the worker\'s sessionId AND its conversation id (open waited for it), not pending', op.code === 0 && /^sess-/.test(String(W.sessionId)) && !!W.claudeSessionId && W.pending === false && W.sessionKey === `claude:${W.claudeSessionId}`, op);
  check("…its spawn got what the coordinator asked: --model opus, --effort xhigh, --permission-mode bypassPermissions (the owner's create path)",
    !!wStub && wStub.args.join(' ').includes('--model opus') && wStub.args.join(' ').includes('--effort xhigh') && wStub.args.join(' ').includes('--permission-mode bypassPermissions'), wStub && wStub.args);
  const st = await cli(['conversations', 'status', W.sessionId], C.token);
  check('conversations status (by its sess- id): the same ids', st.code === 0 && st.json && st.json.claudeSessionId === W.claudeSessionId && st.json.pending === false, st);
  const rn = await cli(['conversations', 'rename', W.claudeSessionId, 'worker renamed'], C.token);
  const named = await until(async () => (await active()).find((s) => s.id === W.sessionId && s.name === 'worker renamed'));
  check('conversations rename: exit 0 and the session list says «worker renamed»', rn.code === 0 && !!named, { rn, named: !!named });
  const bd = await cli(['conversations', 'bind', W.sessionId, TASK], C.token);
  const inTask = await until(async () => { const t = ((await req('GET', '/api/tasks')).json || {}); const list = Array.isArray(t) ? t : (t.tasks || []); const g = list.find((x) => x.id === TASK); return g && (g.sessions || []).some((k) => String(k.sessionKey || k) === `claude:${W.claudeSessionId}`) ? g : null; });
  check("conversations bind: exit 0 and the Task Group lists claude:<worker>", bd.code === 0 && !!inTask, { bd, inTask: !!inTask });
  const iv = await cli(['groups', 'invite', GROUP, W.sessionKey], C.token);
  const mem = await until(async () => { const g = await req('GET', '/api/agent/msg/groups', undefined, { bearer: C.token }); const list = (g.json && (g.json.groups || g.json)) || []; const it = (Array.isArray(list) ? list : []).find((x) => x.id === GROUP); return it && JSON.stringify(it).includes(W.claudeSessionId) ? it : null; });
  check('groups invite: exit 0 and the group lists the worker', iv.code === 0 && !!mem, { iv, mem: !!mem });
  const en = await cli(['conversations', 'end', W.sessionId], C.token);
  const gone = await until(async () => !(await active()).some((s) => s.id === W.sessionId));
  check('conversations end: exit 0 and the worker is gone from the live list', en.code === 0 && !!gone, en);

  console.log('④ the audit, the spend');
  const audit = fs.readFileSync(path.join(wt, 'data', 'automation-audit.jsonl'), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const mine = audit.filter((l) => l.subject === `session:${C.sid}` && l.verb !== 'key.grant');
  check(`the audit: one ok line per verb for the coordinator (${mine.map((l) => l.verb).join(', ')}), names and ids only`,
    JSON.stringify(mine.map((l) => l.verb)) === JSON.stringify(['conversations.open', 'conversations.status', 'conversations.rename', 'conversations.bind', 'groups.invite', 'conversations.end']) && mine.every((l) => l.ok && l.key === KEY) && !audit.some((l) => /vsak_/.test(JSON.stringify(l))), mine);
  const spend = await until(() => { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'spend-budget.json'), 'utf8')); return (j.budget && j.budget.identities && j.budget.identities[`automation:${KEY}`]) || null; } catch { return null; } }, 5000);
  check('the spend: ONE automation-open stamp charged to the key (automation:<keyId>)', Array.isArray(spend) && spend.length === 1 && spend[0].reason === 'automation-open', spend);

  console.log('⑤ a conversation WITHOUT a grant ⇒ the first-use card; the person denies');
  const nBefore = (await active()).length;
  const pend = cli(['conversations', 'open', '--cwd', CWD, '--name', 'should not spawn'], D.token);
  const card = await until(async () => { const t = (await req('GET', '/api/user-todos')).json; const open = (t && t.todos && t.todos.open) || []; return open.find((i) => i.action && i.action.type === 'automation-ask' && i.action.subject === `session:${D.sid}`); }, 15000);
  check('ONE urgent For-you card for that conversation (action automation-ask, naming the key and the verb)', !!card && card.urgency === 'urgent' && card.action.verb === 'conversations.open' && card.action.keyId === KEY, card && { urgency: card.urgency, action: card.action });
  const an = card && await req('POST', `/api/automation/asks/${card.action.askId}`, { answer: 'deny' });
  const dr = await pend;
  await sleep(600);
  const spend2 = (() => { try { return JSON.parse(fs.readFileSync(path.join(wt, 'data', 'spend-budget.json'), 'utf8')).budget.identities[`automation:${KEY}`]; } catch { return null; } })();
  check('the person denies ⇒ the CLI exits 1 with ask_denied; nothing spawned, nothing charged', an && an.status === 200 && dr.code === 1 && /ask_denied/.test(dr.err) && (await active()).length === nBefore && Array.isArray(spend2) && spend2.length === 1, { an: an && an.status, dr, spend2 });

  console.log('⑥ LOCKED ⇒ 423 on every verb');
  await req('POST', '/api/vault/lock');
  const answers = [];
  for (const [verb, args] of [['conversations.open', { cwd: CWD }], ['conversations.status', { target: C.sid }], ['conversations.rename', { name: 'x' }], ['conversations.bind', { target: C.sid, task: TASK }], ['conversations.end', { target: C.sid }], ['groups.invite', { group: GROUP, target: D.sid }]]) {
    const r = await req('POST', `/api/agent/automation/${verb}`, args, { bearer: C.token });
    answers.push([verb, r.status, r.json && r.json.code]);
  }
  const lk = await cli(['conversations', 'status', C.sid], C.token);
  check('every verb of the door answers 423 vault_locked; the CLI exits 3 and says so', answers.every(([, s, c]) => s === 423 && c === 'vault_locked') && lk.code === 3 && /vault_locked/.test(lk.err), { answers, lk: lk.code });
  check('…and the coordinator is still live (a locked vault ends nothing)', (await active()).some((s) => s.id === C.wid));
} catch (e) {
  failed++; console.error('  ✗ the leg threw: ' + (e && e.stack || e));
}
try { ws.close(); } catch {}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
cleanup();
process.exit(failed ? 1 : 0);
