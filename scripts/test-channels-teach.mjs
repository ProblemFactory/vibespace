#!/usr/bin/env node
// LANE CHANNELS-TEACH (a fleet user's incident, 2026-10-18 — the owner: "他的agent默认都不会用vibespace channels必须直接提醒才会用").
// A Task-Group session asked for "everything about <company>" on an instance whose four accounts (2 110 conversations) were
// ALL granted to everyone: its SessionStart block and its per-turn reminder never named `vibespace-channels`, so it grepped
// shared folders, other sessions' transcripts and python over data/channels/ — and never ran the tool. The door is now
// TAUGHT on the session's REACH. Fast, in-process:
//   ① PURE text: the tools section's paragraph by reach (read / request), the header's CLI count, the reminder's segment
//      (each ≤ 120 B) and the manual pointer; no reach ⇒ both byte-identical to a call that never heard of channels
//   ② the REAL engine (fake-poll adapter, 2 000 conversations): reachCountFor = listFor's own walk, counted — no reach ⇒
//      null; an account directory or a `requestable` row ⇒ 'request'; an account granted to everyone ⇒ 'read'; the
//      built-in Agents adapter (msg-acl: other sessions) never counts; parity with listFor over the principals; the cost
//   ③ the REAL routes (setupAgentRoutes over a fake app + a real TaskGroupManager + the engine): SessionStart and the
//      per-turn reminder carry `vibespace-channels` + `vibespace-docs channels` with reach, neither without it, neither
//      with the integration off or no engine; a requestable-only session gets the request words; the per-session memo
//   ④ CONTROLS (scripts/mutant-copy.mjs, scratch copies): a tools section without the paragraph, a route that teaches
//      without reach, an engine that counts the Agents adapter — each turns its leg RED
// Run: node scripts/test-channels-teach.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const B = (t) => Buffer.byteLength(String(t || ''), 'utf-8');
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const TG = require(path.join(REPO, 'src/task-groups.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
const { createChannelRegistry } = require(path.join(REPO, 'src/channels/index.js'));
const ROOT = scratch('chan-teach');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('chan-teach', REPO);
const T4 = { status: true, ask: true, task: true, jobs: true };
const section = (TGM, T, multi = false) => TGM.TaskGroupManager.prototype._toolsSectionParts.call({}, multi ? '--group <id> ' : '', multi, T).join('\n');

console.log('① PURE: the paragraph, the header count, the reminder segment');
{
  const none = section(TG, T4), off = section(TG, { ...T4, channels: false });
  const read = section(TG, { ...T4, channels: 'read' }), req = section(TG, { ...T4, channels: 'request' });
  ok(none === off && section(TG, T4, true) === section(TG, { ...T4, channels: false }, true), 'no reach (channels: false) ⇒ the tools section is byte-identical to one rendered without the flag (single and multi)');
  // lane cli-registry: the header counts every paragraph that rendered (vibespace-msg's too since the registry: 5 → 6)
  ok(/— 5 CLIs on your PATH/.test(none) && /— 6 CLIs on your PATH/.test(read) && /— 6 CLIs on your PATH/.test(req), 'the header\'s CLI count includes vibespace-channels only with reach (5 → 6)');
  const P = TG.CHANNELS_SECTION_LINES;
  ok(read.includes(P.read) && !read.includes(P.request) && req.includes(P.request) && !req.includes(P.read), 'read reach ⇒ the read paragraph, request-only ⇒ the request paragraph (one, never both)');
  ok(['`vibespace-channels list`', '`vibespace-channels search "<words>"`', '`vibespace-channels read <conv>`', '`reply` only PROPOSES', 'BEFORE any other connector or file', '`vibespace-docs channels`'].every((w) => P.read.includes(w)), 'the read paragraph is copy-ready: list, search "<words>", read <conv>, reply = a proposal, look here BEFORE any other connector, the manual', P.read);
  ok(['`vibespace-channels list --all`', '`vibespace-channels request <conv> "why"`', '`vibespace-docs channels`'].every((w) => P.request.includes(w)) && !/search|read <conv>/.test(P.request), 'the request paragraph teaches list --all + request <conv> "why" (no search / read: nothing is readable yet)', P.request);
  ok(!/vibespace-channels|vibespace-docs channels/.test(none), 'no reach ⇒ the section never names the tool or its manual');
  // the paragraph sits with the other CLIs, before the msg line, and the multi-group section carries it once
  ok(read.indexOf(P.read) > read.indexOf('vibespace-job run') && read.indexOf(P.read) < read.indexOf('Other agents:') && section(TG, { ...T4, channels: 'read' }, true).split(P.read).length === 2, 'its place: after the jobs line, before Other agents; once in the multi-group section');
  const S = AR.CHANNELS_REMINDER_SEG;
  ok(B(S.read) <= 120 && B(S.request) <= 120, `the reminder segments are ≤ 120 B (read ${B(S.read)}, request ${B(S.request)})`);
  const r0 = AR.perTurnToolsLine(T4), rOff = AR.perTurnToolsLine({ ...T4, channels: false });
  const rRead = AR.perTurnToolsLine({ ...T4, channels: 'read' }), rReq = AR.perTurnToolsLine({ ...T4, channels: 'request' });
  // lane cli-registry: the docs pointer names every OPEN row's topic in the registry's order (channels after jobs)
  ok(r0 === rOff && !/channels/.test(r0) && r0.includes('vibespace-docs [status|ask|task|jobs|msg|pages|design|exit|window|browser|apps] —'), 'no reach ⇒ the reminder line is the one without the flag, no `channels` anywhere in it');
  ok(rRead.includes(S.read) && rRead.includes('vibespace-docs [status|ask|task|jobs|channels|msg|pages|design|exit|window|browser|apps] —') && rReq.includes(S.request) && !rReq.includes(S.read), 'read reach ⇒ the read segment + `channels` in the vibespace-docs list; request-only ⇒ the request segment');
  ok(B(rRead) - B(r0) === B(S.read) + B(' · ') + B('|channels'), `the reminder grows by the segment + its separator + "|channels" only (${B(r0)} → ${B(rRead)} B)`);
  ok(AR.perTurnToolsLine({ ...T4, channels: 'read' }, { multi: true, manager: true }).includes('vibespace-task --group <id> progress') && AR.perTurnToolsLine(T4, { manager: true }).includes('you are a Group MANAGER'), 'the moved line keeps its multi-group and manager clauses');
}

// ── the real engine ──
const A = 'fake-poll';
const EVERY = { kind: 'everyone', id: '*' };
const AG = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: [], msgLevelFor: () => 'none' };
const clock = () => Date.UTC(2026, 9, 18, 6);
function mkEngine(name, { ENGM = ENG } = {}) {
  const dataDir = path.join(ROOT, name);
  const registry = createChannelRegistry();
  registry.register(FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock }));
  const deliver = { deliverToConversation: async () => ({ ok: true, lane: 'message' }), stashFor: () => ({ stored: true }) };
  return ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir, now: clock }), deliver, now: clock, log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
}
async function seed(eng, n) {
  await eng.pass(A, { force: true });
  await eng.store.index.update(() => { for (let i = 0; i < n; i++) { const en = eng.store.index.entry(A, 'oc_' + i); en.lastAt = clock() - i * 1000; en.kind = i % 4 ? 'group' : 'dm'; en.title = 'conversation ' + i; } });
}
// what listFor says, read the same way: 'read' when it lists a readable row, 'request' when it lists only rows to ask for
// (its own requestable rows, or with --all the directory's titles), null when it lists nothing
const fromList = (eng, p) => {
  const own = eng.listFor(p).conversations.filter((c) => c.adapterId !== 'agents');
  if (own.some((c) => c.level === 'visible')) return 'read';
  return own.length || eng.listFor(p, { all: true }).conversations.some((c) => c.adapterId !== 'agents') ? 'request' : null;
};
const time = (f, reps) => { f(); const t0 = process.hrtime.bigint(); for (let i = 0; i < reps; i++) f(); return Number(process.hrtime.bigint() - t0) / 1e6 / reps; };

console.log('② the engine\'s reach count over 2 000 conversations');
const cost = {};
{
  const eng = mkEngine('e2');
  await seed(eng, 2000);
  ok(Object.keys(eng.store.index.live()).length >= 2000 && typeof eng.reachCountFor === 'function', `${Object.keys(eng.store.index.live()).length} conversations; the engine answers reachCountFor`);
  await eng.setAgentDirectory(A, { groups: false, singles: false });
  ok(eng.reachCountFor(AG) === null && fromList(eng, AG) === null, 'no grant, the directory off ⇒ null (listFor lists nothing either)');
  cost.none = time(() => eng.reachCountFor(AG), 20); cost.listNone = time(() => eng.listFor(AG), 20);
  await eng.setAgentDirectory(A, { groups: true, singles: false });
  ok(eng.reachCountFor(AG) === 'request' && fromList(eng, AG) === 'request', 'the account directory lists group titles ⇒ \'request\' (listFor --all names them, nothing readable)');
  await eng.setAgentDirectory(A, { groups: false, singles: false });
  ok((await eng.setReach(A, 'oc_7', { principal: { kind: 'agent', id: 'agent-1' }, level: 'requestable' })).ok && eng.reachCountFor(AG) === 'request' && fromList(eng, AG) === 'request', 'ONE conversation requestable for this agent ⇒ \'request\'');
  ok((await eng.setGrain(A, { kind: 'account' }, { access: [{ principal: EVERY, authority: 'draft' }] })).ok && eng.reachCountFor(AG) === 'read' && fromList(eng, AG) === 'read', 'the account granted to everyone (the incident\'s shape: everyone, draft) ⇒ \'read\'');
  cost.every = time(() => eng.reachCountFor(AG), 200); cost.listEvery = time(() => eng.listFor(AG), 5);
  const OTHER = { kind: 'agent', id: 'agent-9', name: 'Nobody', groups: ['g-other'], msgLevelFor: () => 'none' };
  ok(eng.reachCountFor(OTHER) === 'read' && eng.reachCountFor({ kind: 'user' }) === 'read', 'everyone means every agent (another one too) — and the owner');
  await eng.setGrain(A, { kind: 'account' }, { access: [{ principal: { kind: 'agent', id: 'agent-1' }, authority: 'draft' }] });
  ok(eng.reachCountFor(AG) === 'read' && eng.reachCountFor(OTHER) === null && fromList(eng, OTHER) === null, 'the account granted to ONE agent ⇒ it reads; another agent with no row reads nothing (null)');
  // the built-in Agents adapter: its conversations are other SESSIONS (msg-acl's reach, vibespace-msg's door) — never a
  // channel the user connected, so a session that may message a peer is not taught vibespace-channels for it
  await eng.store.index.update(() => { const en = eng.store.index.entry('agents', 'agent-2'); en.kind = 'dm'; en.title = 'Other'; en.lastAt = clock(); });
  const PEER = { kind: 'agent', id: 'agent-8', name: 'Peer', groups: [], msgLevelFor: () => 'visible' };
  ok(eng.listFor(PEER).conversations.some((c) => c.adapterId === 'agents' && c.level === 'visible') && eng.reachCountFor(PEER) === null, 'a peer session it may message (the Agents adapter, visible to it) is NOT reach: listFor shows it, reachCountFor says null', eng.listFor(PEER).conversations.map((c) => c.key));
  const parity = [AG, OTHER, PEER, { ...AG, id: 'agent-3' }].map((p) => [p.id, eng.reachCountFor(p), fromList(eng, p)]);
  ok(parity.every(([, a, b]) => a === b), 'parity: reachCountFor answers what listFor / listFor --all would show, for every principal', parity);
}
console.log(`    cost over 2 000 conversations: no reach ${cost.none.toFixed(3)} ms (listFor ${cost.listNone.toFixed(3)} ms) · everyone ${cost.every.toFixed(3)} ms (listFor ${cost.listEvery.toFixed(2)} ms, 200 rows built)`);
ok(cost.every < cost.listEvery, `the reach count builds nothing: ${cost.every.toFixed(3)} ms vs listFor's ${cost.listEvery.toFixed(2)} ms when everything is readable`);

// ── the real routes ──
function mkRoutes({ AGR = AR, TGM = TG, eng = null, settings = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'routes-'));
  const tasks = new TGM.TaskGroupManager({ dataDir: dir, onChange: () => {} });
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
  const activeSessions = new Map();
  AGR.setupAgentRoutes({
    app, activeSessions, tasks,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], dropNotices: () => {}, pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`,
    serverSetting: (k) => settings[k],
    scheduleCtxSync: () => {},
    remoteCtxBaseFor: () => null,
    getChannels: () => eng,
  });
  const cwd = path.join(dir, 'work');
  const g = tasks.create({ title: 'Deals', objective: 'pull everything about the company and give the latest status', folders: [cwd] });
  let n = 0;
  const session = (o = {}) => { const id = 'sess' + (++n); const s = { agentToken: 'vsst_' + id, backend: 'claude', cwd, name: 'w' + n, claudeSessionId: 'c0ffee00-0000-4000-8000-00000000000' + n, ...o }; activeSessions.set(id, s); return s; };
  const call = (route, s) => {
    let out = null;
    const req = { headers: { authorization: 'Bearer ' + s.agentToken }, query: {}, body: {} };
    const res = { json: (o) => { out = o; return res; }, status: () => res, setHeader: () => {} };
    routes[`GET /api/agent/${route}`](req, res);
    return (out && out.context) || '';
  };
  // SessionStart, then the first quiet prompt (the reminder rides alone)
  const turns = (s) => { const start = call('task-context', s); const p1 = call('prompt-context', s); return { start, p1 }; };
  return { tasks, g, session, call, turns, settings };
}
const taught = (t) => /vibespace-channels/.test(t) && /vibespace-docs channels|\|channels[|\]]/.test(t);   // lane cli-registry: `channels` sits after jobs in the pointer
const legsOf = async ({ AGR = AR, TGM = TG, ENGM = ENG } = {}, tag = 'real') => {
  const eng = mkEngine('r-' + tag, { ENGM });
  await seed(eng, 40);
  await eng.setAgentDirectory(A, { groups: false, singles: false });
  const R = mkRoutes({ AGR, TGM, eng });
  const out = {};
  out.none = R.turns(R.session());
  await eng.setGrain(A, { kind: 'account' }, { access: [{ principal: EVERY, authority: 'draft' }] });
  out.read = R.turns(R.session());
  R.settings['agents.vibespaceIntegration'] = false;
  out.off = R.turns(R.session());
  delete R.settings['agents.vibespaceIntegration'];
  await eng.setGrain(A, { kind: 'account' }, { access: [] });
  await eng.setAgentDirectory(A, { groups: true, singles: false });
  out.request = R.turns(R.session());
  // the Agents adapter only (a peer it may message): no reach
  await eng.setAgentDirectory(A, { groups: false, singles: false });
  await eng.store.index.update(() => { const en = eng.store.index.entry('agents', 'c0ffee00-0000-4000-8000-000000000099'); en.kind = 'dm'; en.title = 'Peer'; en.lastAt = clock(); });
  out.peer = R.turns(R.session());
  const R0 = mkRoutes({ AGR, TGM, eng: null });
  out.noEngine = R0.turns(R0.session());
  return { out, eng, R };
};

console.log('③ the routes: SessionStart + the per-turn reminder, on reach');
const real = await legsOf();
{
  const { out } = real;
  ok(out.read.start.includes('<vibespace-task-context>') && out.read.start.includes(TG.CHANNELS_SECTION_LINES.read) && /— 6 CLIs on your PATH/.test(out.read.start), 'READ REACH: the SessionStart block carries the read paragraph (and counts 5 CLIs)', out.read.start.slice(0, 300));
  ok(out.read.p1.includes('<vibespace-reminder>') && out.read.p1.includes(AR.CHANNELS_REMINDER_SEG.read) && out.read.p1.includes('|channels|msg|'), 'READ REACH: the first quiet prompt\'s reminder carries `vibespace-channels list|search|read` and `channels` in the manual list', out.read.p1);
  ok(!taught(out.none.start) && !taught(out.none.p1) && /— 5 CLIs on your PATH/.test(out.none.start), 'NO REACH (nothing granted, no directory): neither block names vibespace-channels', [out.none.start.slice(0, 200), out.none.p1]);
  ok(out.off.start === '' && out.off.p1 === '', 'INTEGRATION OFF: nothing is injected at all (neither block)');
  ok(out.request.start.includes(TG.CHANNELS_SECTION_LINES.request) && out.request.p1.includes(AR.CHANNELS_REMINDER_SEG.request) && !out.request.p1.includes(AR.CHANNELS_REMINDER_SEG.read), 'REQUESTABLE ONLY (the directory\'s titles): the request words in both blocks', out.request.p1);
  ok(!taught(out.peer.start) && !taught(out.peer.p1), 'a peer session it may message (the built-in Agents adapter) does not teach vibespace-channels');
  const scrub = (t) => t.replace(/vs-chan-teach-\d+\/routes-[^/\s`]+/g, '<dir>').replace(/\bw\d+\b/g, 'w').replace(/sess\d+/g, 'sess');
  ok(scrub(out.noEngine.start) === scrub(out.none.start) && out.noEngine.p1 === out.none.p1, 'NO ENGINE ⇒ byte-identical to an engine with no reach: the SessionStart block (paths scrubbed) and the reminder');
}
{ // the memo: SessionStart asks fresh; a prompt reads the per-session memo for a minute
  const { eng, R } = real;
  await eng.setAgentDirectory(A, { groups: false, singles: false });
  await eng.setGrain(A, { kind: 'account' }, { access: [] });
  const s = R.session();
  const t0 = R.turns(s);
  await eng.setGrain(A, { kind: 'account' }, { access: [{ principal: EVERY, authority: 'draft' }] });
  const held = R.call('prompt-context', s);
  const realNow = Date.now;
  let later = '';
  try { Date.now = () => realNow() + 61e3; later = R.call('prompt-context', s); } finally { Date.now = realNow; }
  ok(!taught(t0.p1) && !taught(held) && later.includes(AR.CHANNELS_REMINDER_SEG.read), 'a grant given mid-session reaches the reminder once the per-session memo (60 s) lapses — not on every prompt\'s walk', [held, later]);
  ok(!held.includes('<vibespace-task-context>') && !later.includes('<vibespace-task-context>') && !later.includes('<vibespace-task-update>'), 'a reach change re-sends NO block: the seen marks key on group content / folder / build, never the tools text — only the reminder moves', later.slice(0, 200));
  const s2 = R.session();
  ok(R.call('task-context', s2).includes(TG.CHANNELS_SECTION_LINES.read), 'a new session\'s SessionStart asks fresh');
}

console.log('④ CONTROLS: each leg can go red');
{ // a tools section without the paragraph: a copy of the registry whose channels row teaches nothing at session start (lane
  // cli-registry: the paragraph is that row's), required by a copy of task-groups
  const src = fs.readFileSync(path.join(REPO, 'src/agent-cli-registry.js'), 'utf8');
  const cut = src.replace("      sessionStart: ({ reach }) => channelsByReach(CHANNELS_SECTION_LINES, reach),\n", '      sessionStart: null,\n');
  const regCopy = MUT.write('src/agent-cli-registry.js', cut, 'no-paragraph-reg');
  const tsrc = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
  const tcut = tsrc.replace("require('./agent-cli-registry.js')", `require(${JSON.stringify(regCopy)})`);
  const TGX = MUT.load('src/task-groups.js', tcut, 'no-paragraph');
  const m = await legsOf({ TGM: TGX }, 'no-paragraph');
  ok(cut !== src && tcut !== tsrc && !m.out.read.start.includes(TG.CHANNELS_SECTION_LINES.read), 'CONTROL: a tools section without the paragraph ⇒ the READ REACH SessionStart leg is RED (the incident: nothing names the tool)');
}
{ // a route that teaches without asking reach
  const src = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const cut = src.replace("  if (!integrationOnMaster()) return false;\n  const eng = channelsEngine();\n  if (!eng || typeof eng.reachCountFor !== 'function') return false;\n  const t = Date.now();", "  return 'read';\n  const eng = channelsEngine();\n  const t = Date.now();");
  const ARX = MUT.load('src/agent-routes.js', cut, 'teach-anyway');
  const m = await legsOf({ AGR: ARX }, 'teach-anyway');
  ok(cut !== src && taught(m.out.none.p1) && taught(m.out.noEngine.start), 'CONTROL: a route that teaches without reach ⇒ the NO REACH and NO ENGINE legs are RED');
}
{ // an engine that counts the Agents adapter: a copy of the access family without the msg-acl skip, required by a copy of the engine
  const src = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
  const cut = src.replace("      if (mod && mod.reach === 'msg-acl') continue;\n      recs.set(r.id, r);", "      recs.set(r.id, r);");
  const accessCopy = MUT.write('src/server/channels-access.js', cut, 'count-agents');
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const ecut = esrc.replace("const ChannelsAccess = require('./channels-access.js');", `const ChannelsAccess = require(${JSON.stringify(accessCopy)});`);
  const ENGX = MUT.load('src/server/channels-engine.js', ecut, 'count-agents-eng');
  const PEER = { kind: 'agent', id: 'agent-8', name: 'Peer', groups: [], msgLevelFor: () => 'visible' };
  const verdict = async (ENGM, tag) => {
    const e = mkEngine(tag, { ENGM });
    await seed(e, 10);
    await e.setAgentDirectory(A, { groups: false, singles: false });
    await e.store.index.update(() => { const en = e.store.index.entry('agents', 'agent-2'); en.kind = 'dm'; en.title = 'Other'; en.lastAt = clock(); });
    return e.reachCountFor(PEER);
  };
  const real0 = await verdict(ENG, 'e4-real'), red = await verdict(ENGX, 'e4-mutant');
  ok(cut !== src && ecut !== esrc && real0 === null && red === 'read', `CONTROL: an engine that counts the Agents adapter ⇒ the peer leg is RED (real ${real0}, copy ${red})`);
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
