#!/usr/bin/env node
// AGENT FEEDBACK — THE ROUTES + THE STORE (lane agent-feedback). Fast, in-process: express on 127.0.0.1:0 with the REAL
// auth layer (src/auth.js — the /api/agent/ door and the write-origin gate stand before the routes, as in server.js),
// the real store (src/server/feedback-store.js) in a scratch data dir, a fake clock, fake live sessions and a fake jobs
// manager.
//   ① the agent route: a vsst_ bearer files a report; WHO filed it is the token's (name, Task Group, harness, instance)
//      — a body naming another session / group / harness changes nothing; an unnamed session is named as the sidebar
//      names it (the harness's title); no bearer (a cookie) / an unknown token ⇒ 401;
//      a jbt_ job files as its owner conversation; refusals by name (400 + code)
//   ② pacing (one report / 10 s / session ⇒ 429 `paced` + Retry-After; another session is not held) and the dedup
//      (another session's same words ⇒ `duplicate`, ×2 on one record)
//   ③ /mine: the caller's own reports only (filed or repeated)
//   ④ the owner's routes: GET newest first + open + dropped; PATCH open ⇄ handled; an agent bearer ⇒ 403 by name; a
//      cross-site PATCH ⇒ 403 `cross-site` from the auth layer, the record untouched; unknown id 404, bad status 400
//   ⑤ the StateSync mirror: every change is a `state-sync` op on store `feedback` to every client; a client's
//      `state-set` into it is refused (src/ws-handler.js's case, cut verbatim) — CONTROL: a writable store takes it
//   ⑥ persistence: data/feedback.json written before the answer; a new store over the same dir has every row and the
//      same mirror version (a client never sees a rollback); the wiring registers the mirror and the routes
//   ⑦ the CLI as a child process: a report with --about / --kind (`sent: N characters`), a stray word refused (exit 2,
//      nothing sent), --text - (stdin) keeps quotes, paced / refused ⇒ the server's sentence, a repeat ⇒ ×2, `list`, usage
// Run: node scripts/test-feedback-routes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const express = require('express');
const { Auth } = require(path.join(REPO, 'src/auth.js'));
const FS = require(path.join(REPO, 'src/server/feedback-store.js'));
const { registerFeedbackRoutes } = require(path.join(REPO, 'src/routes/feedback.js'));
const { SyncStore } = require(path.join(REPO, 'src/sync-store.js'));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };

const dir = scratchDir('feedback-routes');
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
let clock = 1_800_000_000_000;
const sent = [];   // every frame the mirror broadcast (one fake client)
const wss = { clients: new Set([{ readyState: 1, send: (m) => sent.push(JSON.parse(m)) }]) };
const store = FS.create({ dataDir, wss, now: () => clock });
const sess = (id, o) => [id, { agentToken: o.token, name: o.name, _nameExplicit: o.given !== false, _cliTitle: o.title || null, backend: o.backend, claudeSessionId: o.cid, cwd: '/w', _initialGroupId: o.group || null }];
const activeSessions = new Map([
  sess('w1', { token: 'vsst_' + 'a'.repeat(40), name: 'lane alpha', backend: 'claude', cid: 'cid-alpha', group: 'T-1', title: 'a harness title the given name outranks' }),
  sess('w2', { token: 'vsst_' + 'b'.repeat(40), name: 'lane beta', backend: 'codex', cid: 'cid-beta' }),
  sess('w3', { token: 'vsst_' + 'd'.repeat(40), name: 'Session 3', given: false, title: 'Fix the login page', backend: 'claude', cid: 'cid-delta' }),
]);
const JOB = { id: 'j-1', name: 'watcher', owner: { conversation: { id: 'cid-beta' } } };
const jm = { ready: true, jobByToken: (t) => (t === 'jbt_' + 'c'.repeat(40) ? JOB : null) };
const GROUPS = { 'T-1': { id: 'T-1', name: 'VibeSpace 车道' } };
const app = express();
const auth = new Auth(dataDir);   // no password: the open instance — the write-origin gate still judges every cookie write
app.use(auth.middleware());
app.use(express.json());
registerFeedbackRoutes(app, { store, activeSessions, getJobs: () => jm, groupOf: (s) => GROUPS[s._initialGroupId] || null, instance: () => ({ name: 'box-1', version: '2.369.301' }) });
const srv = app.listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const SAME = { origin: BASE, 'sec-fetch-site': 'same-origin' };
async function call(method, route, { bearer, body, headers = {} } = {}) {
  const h = { ...headers };
  if (bearer) h.authorization = 'Bearer ' + bearer;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(BASE + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}
const A = 'vsst_' + 'a'.repeat(40), Bt = 'vsst_' + 'b'.repeat(40), J = 'jbt_' + 'c'.repeat(40);

try {
  console.log('— ① the agent route: the caller is the token\'s');
  {
    const r = await call('POST', '/api/agent/feedback', { bearer: A, body: { text: 'vibespace-task backlog-add has no --group hint when I am in two groups', about: 'vibespace-task', kind: 'cli', session: { id: 'cid-beta', name: 'spoof' }, group: { id: 'T-9', name: 'other' }, harness: 'codex', instance: { name: 'evil' } } });
    const rep = r.body && r.body.report;
    ok(r.status === 200 && r.body.ok && !r.body.duplicate && /^fb-[0-9a-f]{10}$/.test(rep.id) && r.body.chars === 70, `a vsst_ bearer files a report (${r.status}, ${rep && rep.id}, chars ${r.body && r.body.chars})`, r.body);
    ok(rep.session.id === 'cid-alpha' && rep.session.name === 'lane alpha' && rep.group.id === 'T-1' && rep.group.name === 'VibeSpace 车道' && rep.harness === 'claude' && rep.instance.name === 'box-1' && rep.instance.version === '2.369.301', 'session / group / harness / instance are the TOKEN\'s: the body\'s session, group, harness and instance were ignored', rep);
    ok(rep.kind === 'cli' && rep.about === 'vibespace-task' && rep.status === 'open' && rep.count === 1 && rep.at === clock, 'kind / about from the body, open, ×1, at = the server clock');
    const none = await call('POST', '/api/agent/feedback', { body: { text: 'x' }, headers: { cookie: 'vs_token=deadbeef', ...SAME } });
    ok(none.status === 401 && /missing session token/.test(none.body.error), `no bearer — the owner's cookie on the agent route ⇒ 401 by name (${none.body && none.body.error})`);
    const bad = await call('POST', '/api/agent/feedback', { bearer: 'vsst_' + 'z'.repeat(40), body: { text: 'x' } });
    const badJob = await call('POST', '/api/agent/feedback', { bearer: 'jbt_' + 'z'.repeat(40), body: { text: 'x' } });
    ok(bad.status === 401 && /unknown session token/.test(bad.body.error) && badJob.status === 401 && /unknown job token/.test(badJob.body.error), 'an unknown session / job token ⇒ 401');
    clock += 1000;
    const job = await call('POST', '/api/agent/feedback', { bearer: J, body: { text: 'a watch job cannot say which conversation woke it', kind: 'flow' } });
    ok(job.status === 200 && job.body.report.session.id === 'cid-beta' && job.body.report.session.name === 'lane beta' && job.body.report.harness === 'codex', `a jbt_ job files as its OWNER conversation (live: its name and harness) (${JSON.stringify(job.body.report && job.body.report.session)})`);
    const unnamed = await call('POST', '/api/agent/feedback', { bearer: 'vsst_' + 'd'.repeat(40), body: { text: 'an unnamed session reports' } });
    ok(unnamed.status === 200 && unnamed.body.report.session.name === 'Fix the login page', `an UNNAMED session ('Session 3') is named as the sidebar names it: the harness's title (${unnamed.body.report && unnamed.body.report.session.name})`);
    const refuse = await Promise.all([{ text: '' }, { text: 'x'.repeat(2001) }, { text: 'x', kind: 'bug' }, { text: 'x', about: 'a'.repeat(61) }].map((b) => call('POST', '/api/agent/feedback', { bearer: Bt, body: b })));
    ok(refuse.map((x) => `${x.status}:${x.body.code}`).join(' ') === '400:text_missing 400:text_too_long 400:kind_unknown 400:about_too_long', `refusals by name, nothing filed (${refuse.map((x) => x.body.code).join(', ')})`);
    ok(store.list().reports.length === 3, 'three reports stored (the refusals filed nothing)');
  }

  console.log('— ② pacing and the dedup');
  {
    clock += 10_000;
    const first = await call('POST', '/api/agent/feedback', { bearer: A, body: { text: 'The Design window   opens behind the chat on a phone', kind: 'ui' } });
    clock += 3_000;
    const second = await call('POST', '/api/agent/feedback', { bearer: A, body: { text: 'another thing' } });
    ok(first.status === 200 && second.status === 429 && second.body.code === 'paced' && second.body.retryAfterS === 7 && second.headers.get('retry-after') === '7' && /wait 7 s/.test(second.body.error), `one report / 10 s / session: 3 s later ⇒ 429 paced, Retry-After 7 (${second.body && second.body.error})`);
    const other = await call('POST', '/api/agent/feedback', { bearer: Bt, body: { text: 'the design window opens behind the chat on a phone ', kind: 'ui' } });
    ok(other.status === 200 && other.body.duplicate === true && other.body.report.id === first.body.report.id && other.body.report.count === 2 && other.body.report.session.id === 'cid-alpha', `ANOTHER session is not held by alpha's pace; its same words (case, spaces) ⇒ duplicate, ×2 on alpha's record (${other.body && other.body.report && other.body.report.count})`);
    clock += 7_000;
    ok((await call('POST', '/api/agent/feedback', { bearer: A, body: { text: 'another thing' } })).status === 200, '10 s after its last report alpha files again');
  }

  console.log('— ③ /mine');
  {
    const a = await call('GET', '/api/agent/feedback/mine', { bearer: A });
    const b = await call('GET', '/api/agent/feedback/mine', { bearer: Bt });
    const ta = a.body.reports.map((r) => r.text), tb = b.body.reports.map((r) => r.text);
    ok(a.status === 200 && ta.length === 3 && ta[0] === 'another thing' && !ta.some((t) => /watch job/.test(t)), `alpha's own three, newest first (${ta.join(' | ')})`);
    ok(tb.length === 2 && tb.some((t) => /watch job/.test(t)) && tb.some((t) => /Design window/.test(t)) && !tb.some((t) => /backlog-add/.test(t)), `beta's: its job's report + the one it REPEATED; never alpha's own (${tb.join(' | ')})`);
    ok(!a.body.reports.some((r) => 'reporters' in r), 'the public rows (no reporter list)');
    const noTok = await call('GET', '/api/agent/feedback/mine', { headers: { cookie: 'vs_token=x' } });
    ok(noTok.status === 401, '/mine without a bearer ⇒ 401');
  }

  console.log('— ④ the owner\'s routes');
  let target;
  {
    const l = await call('GET', '/api/feedback', { headers: { cookie: 'vs_token=x' } });
    const ats = l.body.reports.map((r) => r.lastAt);
    ok(l.status === 200 && l.body.reports.length === 5 && ats.every((x, i) => i === 0 || ats[i - 1] >= x) && l.body.open === 5 && l.body.dropped === 0, `GET /api/feedback: 5 reports newest first, open 5, dropped 0`, l.body);
    target = l.body.reports.find((r) => /backlog-add/.test(r.text));
    const agentGet = await call('GET', '/api/feedback', { bearer: A });
    const agentPatch = await call('PATCH', `/api/feedback/${target.id}`, { bearer: A, body: { status: 'handled' } });
    ok(agentGet.status === 403 && agentGet.body.code === 'agent_forbidden' && agentPatch.status === 403 && agentPatch.body.code === 'agent_forbidden' && /vibespace-feedback list/.test(agentGet.body.error), 'an agent bearer on the owner\'s list / PATCH ⇒ 403 by name (it is pointed at vibespace-feedback list)');
    const xs = await call('PATCH', `/api/feedback/${target.id}`, { body: { status: 'handled' }, headers: { cookie: 'vs_token=x', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
    ok(xs.status === 403 && xs.body.error === 'cross-site' && store.list().reports.find((r) => r.id === target.id).status === 'open', 'a CROSS-SITE PATCH ⇒ 403 cross-site from the auth layer; the record stays open');
    sent.length = 0;
    clock += 1000;
    const h = await call('PATCH', `/api/feedback/${target.id}`, { body: { status: 'handled' }, headers: { cookie: 'vs_token=x', ...SAME } });
    ok(h.status === 200 && h.body.report.status === 'handled' && h.body.report.handledAt === clock && h.body.report.handledBy === 'owner', 'a same-origin PATCH {handled} ⇒ handled, stamped');
    ok(sent.length === 1 && sent[0].type === 'state-sync' && sent[0].store === 'feedback' && sent[0].op === 'set' && sent[0].key === target.id && sent[0].value.status === 'handled', 'the mirror broadcast ONE state-sync op to the client (store feedback, the row handled)', sent);
    const back = await call('PATCH', `/api/feedback/${target.id}`, { body: { status: 'open' }, headers: SAME });
    ok(back.status === 200 && back.body.report.status === 'open' && back.body.report.handledAt === null, 'PATCH {open} reopens');
    const miss = await call('PATCH', '/api/feedback/fb-nope', { body: { status: 'handled' }, headers: SAME });
    const wrong = await call('PATCH', `/api/feedback/${target.id}`, { body: { status: 'done' }, headers: SAME });
    ok(miss.status === 404 && miss.body.code === 'not_found' && wrong.status === 400 && wrong.body.code === 'status_unknown', 'an unknown id ⇒ 404, an unknown status ⇒ 400');
    await call('PATCH', `/api/feedback/${target.id}`, { body: { status: 'handled' }, headers: SAME });
    ok((await call('GET', '/api/feedback')).body.open === 4, 'open counts what is not handled (4)');
  }

  console.log('— ⑤ the StateSync mirror');
  {
    const snap = store.sync.getSnapshot();
    ok(Object.keys(snap.data).length === 5 && snap.data[target.id].status === 'handled' && !('reporters' in snap.data[target.id]) && snap.version > 0, `the snapshot a client loads (/api/sync/feedback) holds every public row (v${snap.version})`);
    const ws = read('src/ws-handler.js');
    const a = ws.indexOf("        case 'state-set': {"), b = ws.indexOf("        case 'state-resync': {");
    const CASE = a > 0 && b > a ? ws.slice(a, b) : '';
    ok(/store\.clientWrites !== false/.test(CASE) && /store\.set\(data\.key, data\.value, ws\)/.test(CASE), 'src/ws-handler.js: the state-set case cut verbatim (it reads clientWrites)');
    const run = (stores) => new Function('getSyncStore', 'activeSessions', `return function handle(data, ws) { switch (data.type) {\n${CASE}\n} };`)((n) => stores[n], new Map());
    const before = JSON.stringify(store.sync.getSnapshot());
    run({ feedback: store.sync })({ type: 'state-set', store: 'feedback', key: target.id, value: { ...snap.data[target.id], text: 'forged', status: 'open' } }, {});
    run({ feedback: store.sync })({ type: 'state-set', store: 'feedback', key: target.id, value: '' }, {});
    run({ feedback: store.sync })({ type: 'state-set', store: 'feedback', key: 'fb-forged', value: { id: 'fb-forged', text: 'x' } }, {});
    ok(JSON.stringify(store.sync.getSnapshot()) === before, 'a client\'s state-set into `feedback` (forge, delete, plant) changes nothing');
    const w = new SyncStore('ctl', null, { clients: new Set() });
    run({ ctl: w })({ type: 'state-set', store: 'ctl', key: 'k', value: 'v' }, {});
    ok(w.get('k') === 'v' && w.clientWrites === true, 'CONTROL: the same case writes into a client-writable store (no file: a memory-only SyncStore)');
  }

  console.log('— ⑥ persistence + the wiring');
  {
    const file = path.join(dataDir, 'feedback.json');
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(disk.v === 1 && disk.records.length === 5 && disk.records.some((r) => r.count === 2 && r.reporters.length === 2) && disk.syncVersion === store.sync.version, `data/feedback.json holds the 5 records (reporters too) and the mirror version ${disk.syncVersion}`);
    ok(!fs.readdirSync(dataDir).some((f) => /\.tmp/.test(f)), 'no tmp file left beside it (tmp + rename)');
    const again = FS.create({ dataDir, now: () => clock });
    ok(again.list().reports.length === 5 && again.sync.version === store.sync.version && JSON.stringify(again.sync.getSnapshot().data) === JSON.stringify(store.sync.getSnapshot().data), 'a new store over the same dir: every row, the same mirror version (a reconnecting client sees no rollback)');
    ok(again.sync.getOpsSince(store.sync.version + 5).full !== undefined && again.sync.getOpsSince(store.sync.version).ops.length === 0, 'a client at the persisted version is current; one past it gets the full snapshot');
    fs.writeFileSync(file, '{ torn');
    const torn = FS.create({ dataDir, now: () => clock });
    ok(torn.list().reports.length === 0, 'an unreadable file ⇒ an empty ring (the server boots)');
    const W = read('src/server/mounts-plugins-wiring.js'), S = read('server.js');
    ok(/syncStores\.feedback = feedback\.sync/.test(W) && /registerFeedbackRoutes\(app, \{/.test(W) && /auth, wss, WS_OPEN, syncStores,/.test(S), 'the wiring: server.js hands its SyncStore table to the mounts-plugins wiring, which registers the mirror and the routes');
  }

  console.log('— ⑦ the CLI (data/bin/vibespace-feedback as a child, against this server)');
  {
    const { execFile } = require('node:child_process');
    const cli = (args, { token = A, input } = {}) => new Promise((resolve) => {
      const c = execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-feedback'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: BASE, VIBESPACE_SESSION_TOKEN: token }, timeout: 15000 }, (err, out, errOut) => resolve({ code: err ? (err.code ?? 1) : 0, out, err: errOut }));
      if (input !== undefined) { c.stdin.end(input); }
    });
    clock += 60_000;
    const n0 = store.list().reports.length;
    const DOC = 'the "docs" topic list in vibespace-docs is cut on a narrow terminal';
    const sentR = await cli([DOC, '--about', 'vibespace-docs', '--kind', 'docs']);
    const made = store.list().reports[0];
    ok(sentR.code === 0 && /sent to the maintainers \(fb-[0-9a-f]{10}\)/.test(sentR.out) && sentR.out.includes(`sent: ${DOC.length} characters`) && made.about === 'vibespace-docs' && made.kind === 'docs' && made.session.name === 'lane alpha' && store.list().reports.length === n0 + 1, `vibespace-feedback "…" --about --kind ⇒ filed, "sent: ${DOC.length} characters" (${sentR.out.trim().split('\n').join(' / ')})`, sentR);
    clock += 60_000;
    const stray = await cli(['it broke', 'when', 'quoted']);
    ok(stray.code === 2 && /the report is ONE argument — 2 more words followed it/.test(stray.err) && /nothing was sent/.test(stray.err) && store.list().reports.length === n0 + 1, `a stray word ⇒ exit 2 by name, nothing sent (${stray.err.trim().slice(0, 120)})`);
    const viaStdin = await cli(['--text', '-', '--about', 'vibespace-msg'], { input: 'a quoted "word" and a $(subshell) kept\n' });
    ok(viaStdin.code === 0 && store.list().reports[0].text === 'a quoted "word" and a $(subshell) kept', '--text - (stdin) carries quotes intact (one trailing newline trimmed)');
    clock += 1000;
    const paced = await cli(['too soon']);
    ok(paced.code === 1 && /wait 9 s/.test(paced.err), `paced ⇒ exit 1 with the server's sentence (${paced.err.trim()})`);
    const dupR = await cli(['the "docs" topic list in vibespace-docs is cut on a narrow terminal', '--about', 'vibespace-docs'], { token: Bt });
    ok(dupR.code === 0 && /already reported \(fb-[0-9a-f]{10}\) — counted again: ×2/.test(dupR.out), `another session's same words ⇒ "already reported … ×2" (${dupR.out.trim().split('\n')[0]})`);
    const list = await cli(['list']);
    ok(list.code === 0 && /\[docs · vibespace-docs\] open ×2/.test(list.out) && /a quoted "word"/.test(list.out) && !/watch job/.test(list.out), 'list prints its own reports (kind · about, status, ×count, the text) — never another session\'s');
    const usage = await cli([]);
    ok(usage.code === 0 && /^usage — tell the maintainers what felt wrong/.test(usage.out) && /vibespace-feedback "what felt wrong, and where" \[--about <tool\|flow>\] \[--kind cli\|flow\|ui\|docs\|other\]/.test(usage.out) && /your reports:/.test(usage.out), 'no arguments ⇒ the copy-ready usage + its reports');
    const bad = await cli(['x', '--kind', 'bug']);
    ok(bad.code === 2 && /--kind is one of cli \| flow \| ui \| docs \| other/.test(bad.err), `a refusal the server names ⇒ exit 2 with its sentence (${bad.err.trim()})`);
  }
} finally {
  srv.close();
}
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
