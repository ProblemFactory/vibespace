#!/usr/bin/env node
// THE ANTIGRAVITY STORE READER (lane agy-subagent-cards, 2026-10-21 — the owner: «使用子代理的时候怎么没有子代理卡片查看细节»).
// src/agy-store.js is the ONE parser of agy's on-disk store (PURE); the wrapper on the machine that holds the store
// (data/bin/agy-wrapper.js, its tail) and the hub's helper door (src/harnesses/antigravity.js) only do the I/O through it.
// Over a FIXTURE STORE copied in SHAPE from the owner's (scripts/fixtures/agy-store — placeholder ids, a CJK cwd, the db
// rows CAPTURED from a real sub conversation and re-encoded with every string replaced):
//   ① the token law: storeReadable allows the store's own shapes only, never the login file's name anywhere, never `..`
//     — RED: a copy without the name clause lets a token-named file through
//   ② the subagents JSON (spawnStepIndex is NOT unique — both fixture subs say 7, as measured) and the link that IS:
//     the parent's TASK message in the SUB's dir names the spawning step
//   ③ the parent's task by recipient + the sub's answer by sender (a background-command notice is no answer)
//   ④ the transcript (legible JSON): steps, the result head stripped, a delivered [Message], working → idle
//   ⑤ the steps → the ACP records the virtual session draws (tool calls paired FIFO, all closed; the journal's clip)
//   ⑥ THE CARD: role, type, task, running → completed, elapsed, the answer, the files it wrote
//   ⑦ the wire reader: varint / length / fixed / nested; a malformed blob throws; a nested message whose first byte is
//     a newline is a MESSAGE (render_info's summary {1: "…"}) — RED: a copy without that rule loses the summary
//   ⑧ the db through node:sqlite READ-ONLY: the captured rows decode to the expected strings (tool names, the verb, the
//     summary, the terminal command, the exit code, the text); the read-only handle refuses a write
//   ⑨ the artifacts road: a sub's write_file line → a diff record → the ACP reader's op; the descriptor's helper door
//     names the finished sub's transcript in the record's store (a running card / a non-id ⇒ nothing)
//   ⑩ ONE parser: the wrapper requires src/agy-store.js and parses no store shape itself; the shared module stays PURE;
//     every store read on any machine passes ONE gate (src/agy-store-fs.js — the wrapper and the hub)
//   ⑪ A SUB THAT ALREADY RAN (the cards' addendum, 2026-10-22): the journal a wrapper OLDER than the cards wrote
//     (scripts/fixtures/agy-store/journal-before-cards.jsonl, captured from the .339 wrapper over this store — its row,
//     the «started 1 subagent» line, no card) → the hub's reader (src/agy-backfill.js) places the SAME card after the row
//     and the sub's steps as its virtual session — RED: the plain ACP reader draws no card (the measured gap); a card of
//     its own / a store that does not know the sub / a named account whose root is gone / another machine ⇒ unchanged;
//     a turn end of an OLD wrapper's conversation: nothing inside the new wrapper's 60 s look, then the card + the
//     steps once, a working sub's new steps only — and acp-events routes them (the card frame, subagent-message)
// Run: node scripts/test-agy-store.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const AS = require(path.join(REPO, 'src/agy-store.js'));
const FIX = path.join(REPO, 'scripts/fixtures/agy-store');
const MUTH = mutantCopies('agy-store', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(cond, name, extra?)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const ROOT = scratchDir('agy-store');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const P = '9c0f0000-0000-4000-8000-0000000000a1', S = '49120000-0000-4000-8000-0000000000b1', S2 = '8af00000-0000-4000-8000-0000000000b2';
const SG = '.system_generated';
const jsonOf = (rel) => JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf8'));
const dirRows = (rel, of) => fs.readdirSync(path.join(FIX, rel)).filter((n) => n.endsWith('.json') && n !== 'read.json').map((n) => of(jsonOf(`${rel}/${n}`))).filter(Boolean);
const lines = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8').split('\n').filter(Boolean);

console.log('— ① the token law (the reader never opens the login file)');
{
  const pp = AS.storePaths(S);
  ok(['db', 'subagents', 'messages', 'transcript', 'transcriptFull'].every((k) => AS.storeReadable(pp[k])) && AS.storeReadable(`${AS.storePaths(P).messages}/c0000000-0000-4000-8000-0000000000c4.json`) && AS.storeReadable(AS.SUMMARIES),
    'the store\'s own shapes are readable (db, subagents/ + messages/ dirs and files, both transcripts; lane dead-socket-keeps-chat-meta: the store\'s INDEX conversation_summaries.db at its root — a title + last write per conversation, read by data/bin/agy-summaries.js)', pp);
  const refused = [AS.TOKEN_FILE, `./${AS.TOKEN_FILE}`, `brain/${S}/${SG}/messages/${AS.TOKEN_FILE}.json`, `brain/${S}/${SG}/logs/../../../${AS.TOKEN_FILE}`, `brain/${S}/${SG}/logs/../logs/transcript.jsonl`, 'settings.json', 'conversation_summaries.db-journal', `conversations/conversation_summaries.db`, `brain/${S}/conversation_summaries.db`, `brain/${S}/report.md`, `conversations/not-an-id.db`, '', null];
  ok(refused.every((r) => !AS.storeReadable(r)), 'the login file by its name ANYWHERE in a path, a `..` / `.` segment, a foreign shape, a non-id: refused', refused.filter((r) => AS.storeReadable(r)));
  ok(AS.storePaths('not-an-id') === null && AS.storePaths(`../${AS.TOKEN_FILE}`) === null && Object.values(AS.storePaths(S)).every((p) => !p.includes(AS.TOKEN_FILE)), 'storePaths builds a path only from a conversation id — never one naming the login file');
  const src = fs.readFileSync(path.join(REPO, 'src/agy-store.js'), 'utf8');
  const mut = src.replace("p.includes(TOKEN_FILE) || ", '');
  ok(mut !== src && MUTH.load('src/agy-store.js', mut, 'no-token').storeReadable(`brain/${S}/${SG}/messages/${AS.TOKEN_FILE}.json`) === true,
    'RED CONTROL: a copy without the name clause lets a token-named file in messages/ through (the clause is what refuses it)');
}

console.log('— ② the subagents JSON + the link that is unique');
const subRows = dirRows(`brain/${P}/${SG}/subagents`, AS.subagentRowOf);
{
  const s1 = subRows.find((r) => r.id === S), s2 = subRows.find((r) => r.id === S2);
  ok(s1 && s1.typeName === 'self' && s1.role === '示例评审专家' && s1.state === 'SUBAGENT_STATE_ALIVE' && s1.alive && s1.workspaces[0].startsWith('file:///home/u/workspace/'), 'subagentRowOf: id, typeName, role, state, alive, workspaces', s1);
  ok(s1.spawnStep === 7 && s2.spawnStep === 7, 'spawnStepIndex is NOT unique (both fixture subs say 7 — the owner\'s two subs of one call batch both said 187)');
  const t1 = AS.taskOf(dirRows(`brain/${S}/${SG}/messages`, AS.messageRowOf), { parentId: P, subId: S });
  const t2 = AS.taskOf(dirRows(`brain/${S2}/${SG}/messages`, AS.messageRowOf), { parentId: P, subId: S2 });
  ok(t1 && t1.step === 6 && t2 && t2.step === 7, 'the parent\'s TASK (in the sub\'s own messages) names the spawning step — 6 and 7: the unique link', { t1: t1 && t1.step, t2: t2 && t2.step });
  ok(AS.subagentRowOf({ conversationId: 'nope' }) === null && AS.subagentRowOf(null) === null && AS.subagentRowOf({ conversationId: S }).state === 'SUBAGENT_STATE_UNSPECIFIED', 'a row without a conversation id is no row; a row without a state is UNSPECIFIED (never "alive")');
}

console.log('— ③ the task by recipient, the answer by sender');
{
  const subMsgs = dirRows(`brain/${S}/${SG}/messages`, AS.messageRowOf);
  const task = AS.taskOf(subMsgs, { parentId: P, subId: S, step: 6 });
  ok(task && task.tool === 'invoke_subagent' && task.title === 'Message from Parent Agent' && /按 100 分制打分/.test(task.content) && task.args.Role === '示例评审专家' && task.args.TypeName === 'self', 'taskOf: invoke_subagent from the parent, its title / content / args', task);
  ok(AS.taskOf(subMsgs, { parentId: P, subId: S, step: 9 }) === null && AS.taskOf(subMsgs, { parentId: S2, subId: S }) === null, 'another step / another sender is not this sub\'s task');
  const parentMsgs = dirRows(`brain/${P}/${SG}/messages`, AS.messageRowOf);
  ok(AS.answersOf(parentMsgs, { parentId: P, subId: S }).length === 0 && parentMsgs.length === 1, 'before the answer: the parent\'s only message is a background command\'s notice — no answer');
  const answer = AS.messageRowOf(jsonOf('answer.json'));
  const answers = AS.answersOf(parentMsgs.concat([answer]), { parentId: P, subId: S });
  ok(answers.length === 1 && answers[0].tool === 'send_message' && /88\/100/.test(answers[0].content) && answers[0].title === 'Message from 示例评审专家 (self)', 'answersOf: what the sub sent its parent (send_message)', answers);
}

console.log('— ④ the transcript (legible JSON)');
const tLines = lines(`brain/${S}/${SG}/logs/transcript.jsonl`);
const steps = tLines.map(AS.transcriptStepOf);
{
  ok(steps.length === 10 && steps.every(Boolean) && steps.map((s) => s.type).join(',') === 'SYSTEM_MESSAGE,PLANNER_RESPONSE,GENERIC,PLANNER_RESPONSE,GENERIC,PLANNER_RESPONSE,GENERIC,PLANNER_RESPONSE,GENERIC,PLANNER_RESPONSE', 'ten steps, their types in order');
  ok(steps[1].toolCalls[0].name === 'read_file' && steps[3].toolCalls[0].args.toolSummary === 'count the lines of the sample' && steps[2].truncated.includes('content') && Number.isFinite(steps[0].at), 'tool calls + args, truncated_fields, created_at → ms');
  ok(AS.resultBody(steps[4].content).startsWith('Command exited with code 0.') && AS.resultBody('plain') === 'plain', 'resultBody strips agy\'s «Created At / Completed At» head');
  const d = AS.deliveredMessageOf(steps[0].content);
  ok(d && d.sender === P && /按 100 分制打分/.test(d.content) && !/SYSTEM_MESSAGE/.test(d.content), 'a delivered [Message] inside a SYSTEM_MESSAGE: sender + content (the closing tag dropped)', d);
  ok(AS.subPhaseOf(steps[4]) === 'working' && AS.subPhaseOf(steps[9]) === 'idle' && AS.subPhaseOf(null) === 'working' && AS.subPhaseOf(steps[7]) === 'working', 'working → idle: only a final planner response (DONE, no tool call) is idle; a sub with no step yet works');
  ok(AS.transcriptStepOf('not json') === null && AS.transcriptStepOf({ type: 'X' }) === null, 'a line that is not a step is null');
}

console.log('— ⑤ the steps → the ACP records the virtual session draws');
{
  const st = { pending: [] };
  const recs = steps.flatMap((s) => AS.stepRecords(s, st, { subId: S, parentId: P, parentName: 'Parent Agent', max: 4000 }));
  const kinds = recs.map((r) => (r.kind === 'update' ? r.update.sessionUpdate : r.kind));
  ok(kinds[0] === 'user' && recs[0].peer.name === 'Parent Agent' && /按 100 分制打分/.test(recs[0].peer.body), 'step 0 = the parent\'s task as a peer bubble from «Parent Agent»', recs[0]);
  const calls = recs.filter((r) => r.update?.sessionUpdate === 'tool_call'), upds = recs.filter((r) => r.update?.sessionUpdate === 'tool_call_update');
  ok(calls.length === 4 && upds.length === 4 && calls.every((c, i) => c.update.toolCallId === upds[i].update.toolCallId) && st.pending.length === 0, 'four tool calls, each closed by the NEXT result (FIFO) — none left open', { calls: calls.map((c) => c.update.toolCallId), upds: upds.map((u) => u.update.toolCallId) });
  ok(calls.map((c) => c.update.kind).join(',') === 'read,execute,edit,other' && calls[0].update.title === 'read_file', 'the tool kinds the wrapper\'s rows use (THE ONE mapping, agy-store kindOfTool)');
  ok(kinds.filter((k) => k === 'agent_thought_chunk').length === 3 && kinds[kinds.length - 1] === 'agent_message_chunk', 'thoughts and the final answer text');
  const big = AS.stepRecords({ ...steps[4], content: 'x'.repeat(10000) }, { pending: ['t1'] }, { subId: S, max: 4000 })[0];
  ok(big.update.content[0].content.text.length === 1501, 'a tool output clips at 1500 in the journal (the full text stays in the store)', big.update.content[0].content.text.length);
  const orphan = AS.stepRecords(steps[4], { pending: [] }, { subId: S });
  ok(orphan[0].update.sessionUpdate === 'tool_call' && orphan[0].update.status === 'completed', 'a result with no open call still shows (its own completed row)');
}

console.log('— ⑥ THE CARD');
{
  const row = subRows.find((r) => r.id === S);
  const task = AS.taskOf(dirRows(`brain/${S}/${SG}/messages`, AS.messageRowOf), { parentId: P, subId: S });
  const files = steps.flatMap(AS.writesOf);
  const running = AS.cardOf({ toolCallId: `${P}:6`, row, task, lastStep: steps[4], steps: 5, files: [] });
  ok(running.status === 'running' && running.subId === S && running.role === '示例评审专家' && running.typeName === 'self' && running.spawnStep === 6 && /按 100 分制打分/.test(running.task) && running.endedAt === null && running.elapsedMs === null && running.result === '', 'running: role, type, task, spawn step (the task\'s), no end', running);
  const answer = AS.messageRowOf(jsonOf('answer.json'));
  const done = AS.cardOf({ toolCallId: `${P}:6`, row, task, answer, lastStep: steps[9], steps: 10, files });
  ok(done.status === 'completed' && done.elapsedMs === 53881 && /88\/100/.test(done.result) && done.files.join() === '/home/u/workspace/示例项目/report.md', 'completed: elapsed (the task\'s delivery 14:32:32.119 → the last step 14:33:26 = 53 881 ms), the answer, the file it wrote', done);
  ok(AS.cardOf({ row: { ...row, alive: false, state: 'SUBAGENT_STATE_KILLED' }, lastStep: steps[4] }).status === 'stopped' && AS.cardOf({ row: { ...row, alive: false, state: 'SUBAGENT_STATE_FAILED' } }).status === 'failed' && AS.cardOf({ row: { ...row, alive: false, state: 'SUBAGENT_STATE_DONE' } }).status === 'completed', 'a state that left ALIVE ends the card in words: killed → stopped, failed → failed, any other → completed');
  ok(AS.createdSubagentOf(`Created the following subagent:\n{\n  "conversationId": "${S}",\n  "logAbsoluteUri": "file:///x"\n}\nThe subagent will send you a message…`) === S && AS.createdSubagentOf('Started.') === null, 'the invoke_subagent output names its sub (the measured «Created the following subagent: {…}»)');
  ok(AS.subagentInfoIds({ subagents: [{ type_name: 'self', role: 'r' }] }).length === 0 && AS.subagentInfoIds([{ conversation_id: S }])[0] === S, 'subagent_info: an id only when an id-shaped value rides it (the docs\' shape names none)');
}

console.log('— ⑦ the wire reader');
{
  const enc = new TextEncoder();
  const lenOf = (b) => [b.length];
  const msg = (f, bytes) => [(f << 3) | 2, ...lenOf(bytes), ...bytes];
  const strF = (f, s) => msg(f, [...enc.encode(s)]);
  // {5: "Ran", 9: {1: <34 chars>}, 3: 150 (varint), 4: fixed32, 10: {3: {1: "wc -l", 3: 0}}} — field 9's bytes are "\n\"…":
  // a newline (field 1's tag) then a PRINTABLE length byte (34 = '"') — exactly the measured render_info summary
  const SUM = 'count the lines of the sample file';
  const summary = strF(1, SUM);
  const blob = new Uint8Array([...strF(5, 'Ran'), ...msg(9, summary), 3 << 3, 150, 1, (4 << 3) | 5, 1, 2, 3, 4, ...msg(10, msg(3, [...strF(1, 'wc -l'), 3 << 3, 0]))]);
  const f = AS.pbFields(blob);
  ok(f.length === 5 && f[2].v === 150 && f[3].v === null && f[1].v instanceof Uint8Array, 'pbFields: length-delimited, varint (150 over two bytes), fixed32 skipped', f.map((x) => [x.f, x.wt]));
  const tree = AS.pbTree(blob);
  ok(AS.pbAll(tree, '9')[0].kind === 'msg' && AS.pbAll(tree, '9.1')[0].v === SUM && SUM.length === 34 && AS.pbAll(tree, '10.3.1')[0].v === 'wc -l' && AS.pbAll(tree, '10.3.3')[0].v === 0,
    'a nested message whose first byte is a newline (\\n = field 1, length-delimited) reads as a MESSAGE — 9.1 is the summary', tree);
  const strs = AS.pbStrings(blob);
  ok(JSON.stringify(strs) === JSON.stringify([{ path: '5', text: 'Ran' }, { path: '9.1', text: SUM }, { path: '10.3.1', text: 'wc -l' }]), 'pbStrings: every legible string with its field path', strs);
  let threw = 0; for (const bad of [[0x0a, 0x05, 0x41], [0x00], [0x0f], [0x80]]) { try { AS.pbFields(new Uint8Array(bad)); } catch { threw++; } }
  ok(threw === 4, 'a malformed blob throws (a length past the end, field 0, wire type 7, a truncated varint)');
  const src = fs.readFileSync(path.join(REPO, 'src/agy-store.js'), 'utf8');
  const mut = src.replace(" || /^[\\t\\n\\r]/.test(s)", '');
  ok(mut !== src && MUTH.load('src/agy-store.js', mut, 'no-lead').pbAll(MUTH.load('src/agy-store.js', mut, 'no-lead2').pbTree(blob), '9.1').length === 0,
    'RED CONTROL: a copy without the «never starts with a control byte» rule reads field 9 as a STRING — the summary is lost (the measured trap)');
}

console.log('— ⑧ the db through node:sqlite READ-ONLY (captured rows, re-encoded)');
{
  const fx = JSON.parse(fs.readFileSync(path.join(FIX, 'db-steps.json'), 'utf8'));
  const { DatabaseSync } = await import('node:sqlite');
  const dbFile = path.join(ROOT, 'conversations', `${fx.conversationId}.db`);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const w = new DatabaseSync(dbFile);
  // the MEASURED schema (agy 1.4.x)
  w.exec('CREATE TABLE `steps` (`idx` integer,`step_type` integer NOT NULL DEFAULT 0,`status` integer NOT NULL DEFAULT 0,`has_subtrajectory` numeric NOT NULL DEFAULT false,`metadata` blob,`error_details` blob,`permissions` blob,`task_details` blob,`render_info` blob,`step_payload` blob,`step_format` integer NOT NULL DEFAULT 0,PRIMARY KEY (`idx`))');
  const ins = w.prepare('INSERT INTO steps (idx, step_type, status, metadata, render_info, step_payload) VALUES (?, ?, ?, ?, ?, ?)');
  const hex = (h) => (h ? Buffer.from(h, 'hex') : null);
  for (const r of fx.rows) ins.run(r.idx, r.step_type, r.status, hex(r.metadata), hex(r.render_info), hex(r.step_payload));
  w.close();
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const rows = db.prepare('SELECT idx, step_type, status, metadata, render_info, step_payload FROM steps WHERE idx > ? ORDER BY idx').all(-1);
  let refused = false; try { db.prepare('INSERT INTO steps (idx) VALUES (99)').run(); } catch { refused = true; }
  db.close();
  ok(rows.length === 8 && refused, 'the captured 8 rows read through a READ-ONLY handle, which refuses a write');
  const st = Object.fromEntries(rows.map((r) => [r.idx, AS.dbStepOf(r)]));
  ok(st[0].type === 'SYSTEM_MESSAGE' && st[0].source === 'SYSTEM' && /^\[Message\] timestamp=/.test(st[0].content) && st[1].type === 'PLANNER_RESPONSE' && st[2].type === 'GENERIC' && Object.values(st).every((s) => s.status === 'DONE'), 'step types 101 / 15 / 132 and status 3 → SYSTEM_MESSAGE / PLANNER_RESPONSE / GENERIC / DONE (the measured integers)');
  ok(st[1].toolCalls.map((c) => c.name).join() === 'read_file,read_file' && st[4].toolCalls[0].name === 'run_command' && st[4].toolCalls[0].args.toolSummary === 'count the lines of the sample' && st[20].toolCalls[0].name === 'send_message', 'the planner rows\' tool calls: names + argsJson (payload 20.7)');
  ok(st[5].verb === 'Ran' && st[5].summary === 'count the lines of the sample' && st[5].command === 'wc -l 样例.md' && st[5].exitCode === 0 && st[2].verb === 'Analyzed' && st[21].verb === 'Messaged' && st[21].summary === 'Parent Agent',
    'the render words only the db carries: the verb «Ran» / «Analyzed» / «Messaged», the summary (9.1), the terminal command (10.3.1) and exit code (10.3.3)', { 5: st[5], 21: st[21] });
  ok(st[22].content === 'I sent my evaluation to the Parent Agent.' && st[1].thinking === 'Reading the sample first.' && Number.isFinite(st[22].at) && st[22].at > st[0].at, 'the text, the thinking, the created time (metadata 1 = {seconds, nanos})');
  const legible = rows.flatMap((r) => ['metadata', 'render_info', 'step_payload'].filter((c) => r[c]).flatMap((c) => AS.pbStrings(r[c])));
  ok(legible.some((x) => x.text === 'type.googleapis.com/exa.cortex.core.tools.RunCommand') && legible.every((x) => !/\/home\/(?!u\/)/.test(x.text)), `the fixture blobs' ${legible.length} legible strings carry the type URLs agy wrote, and no home path but the placeholder /home/u/`);
  const real = rows.map(AS.dbStepOf).filter((s) => s.type === 'GENERIC').map((s) => AS.stepRecords(s, { pending: [] }, { subId: fx.conversationId }));
  ok(real.every((r) => r.length === 1 && r[0].update.sessionUpdate === 'tool_call'), 'a db step feeds the same timeline records as a transcript step (the fallback when an agy writes no transcript)');
}

console.log('— ⑨ the artifacts road (a sub\'s writes → the parent\'s Artifacts rows)');
{
  const full = lines(`brain/${S}/${SG}/logs/transcript_full.jsonl`);
  const recs = AS.artifactRecordsOf(full[5]);
  ok(recs.length === 1 && recs[0].update.content[0].type === 'diff' && recs[0].update.content[0].path === '/home/u/workspace/示例项目/report.md' && /88\/100/.test(recs[0].update.content[0].newText) && recs[0].update.content[0].oldText === null, 'a write_file line → a diff record naming its path (oldText null = a new file)', recs);
  ok(AS.artifactRecordsOf(full[3]).length === 0 && AS.artifactRecordsOf('nope').length === 0, 'a run_command line / not a line → no record');
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const ops = H8.artifactsOf(JSON.parse(full[5]));
  ok(ops.length === 1 && ops[0].path === '/home/u/workspace/示例项目/report.md' && ops[0].op === 'write' && ops[0].bytes > 0 && ops[0].id.includes('report.md'), 'the descriptor\'s artifactsOf reads a SUB\'s transcript line (an op whose id names the step, the call and the path — two subs never fold into one row)', ops);
  const acp = { type: 'acp', kind: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'x', content: [{ type: 'diff', path: '/tmp/a.md', oldText: null, newText: 'hi' }] } };
  ok(H8.artifactsOf(acp).length === 1 && H8.artifactsOf(acp)[0].path === '/tmp/a.md', '…and the journal\'s ACP records as before (the ACP reader)');
  const home = path.join(ROOT, 'home');
  const fin = { type: 'acp', kind: 'subagent', subId: S, status: 'completed', role: '示例评审专家', home: '/elsewhere' };
  const files = H8.helperTranscriptsOf(fin, { home });
  ok(files.length === 1 && files[0].file === path.join(home, '.gemini/antigravity-cli/brain', S, SG, 'logs/transcript_full.jsonl') && files[0].via.kind === 'subagent' && files[0].via.name === '示例评审专家', 'helperTranscriptsOf: a FINISHED card names its sub\'s full transcript in the store (ctx.home first), via the sub\'s role', files);
  ok(H8.helperTranscriptsOf({ ...fin, home: '/srv/h' })[0].file.startsWith('/srv/h/.gemini/antigravity-cli/brain/') && H8.helperTranscriptsOf({ ...fin, home: '/srv/h/../x' })[0].file.startsWith(require('node:os').homedir()), '…else the record\'s HOME (an absolute, normalized path only — anything else is the machine login\'s)');
  ok([{ ...fin, status: 'running' }, { ...fin, subId: `../${AS.TOKEN_FILE}` }, { ...fin, kind: 'notice' }, { type: 'user' }, null].every((r) => H8.helperTranscriptsOf(r, { home }).length === 0), 'a running card, a non-id, another record ⇒ nothing (no disk read)');
}

console.log('— ⑩ ONE parser');
{
  const wrap = fs.readFileSync(path.join(REPO, 'data/bin/agy-wrapper.js'), 'utf8');
  ok(/require\(path\.join\(__dirname, '\.\.', '\.\.', 'src', 'agy-store\.js'\)\)/.test(wrap), 'the wrapper requires src/agy-store.js (the shared-module rule: it runs where the store lives)');
  ok(!/subagentDescriptor|sourceMetadata|step_index'|"step_index|pbFields|\bstep_payload\b(?! FROM)/.test(wrap.replace(/'SELECT idx, step_type, status, metadata, render_info, step_payload FROM steps[^']*'/, '')), 'the wrapper parses no store shape itself (no subagentDescriptor / sourceMetadata / step_index / protobuf of its own) — only the I/O');
  const gate = fs.readFileSync(path.join(REPO, 'src/agy-store-fs.js'), 'utf8');
  ok(/require\(path\.join\(__dirname, '\.\.', '\.\.', 'src', 'agy-store-fs\.js'\)\)\.storeReader\(/.test(wrap) && !/openSync|readdirSync|realpathSync/.test(wrap.slice(wrap.indexOf('// ── SUBAGENT CARDS'), wrap.indexOf('// ── agy → journal'))) && /AS\.storeReadable\(rel\)/.test(gate) && /O_NOFOLLOW/.test(gate) && /fs\.realpathSync\(abs\) !== want/.test(gate),
    'every store read passes ONE gate, src/agy-store-fs.js (the verdict + no link past the store root + O_NOFOLLOW; test-vault-law drives it): the wrapper opens nothing itself');
  ok(/require\('\.\/agy-store-fs'\)/.test(fs.readFileSync(path.join(REPO, 'src/agy-backfill.js'), 'utf8')) && !/openSync|readdirSync|readFileSync/.test(fs.readFileSync(path.join(REPO, 'src/agy-backfill.js'), 'utf8')), '…and the hub\'s reader of a sub that already ran (src/agy-backfill.js) reads only through it');
  const arch = fs.readFileSync(path.join(REPO, 'scripts/test-architecture.mjs'), 'utf8');
  ok(/'src\/agy-store\.js',/.test(arch), 'src/agy-store.js is in test-architecture\'s PURE set (no builtin, no fs — the I/O stays with its callers)');
}

console.log('— ⑪ A SUB THAT ALREADY RAN (the cards\' addendum): the hub draws its card from the store');
{
  const { storeReader } = require(path.join(REPO, 'src/agy-store-fs.js'));
  const BF = require(path.join(REPO, 'src/agy-backfill.js'));
  const { AcpMessageManager, AcpSessionMessages } = require(path.join(REPO, 'src/acp-message-manager.js'));
  const SUBS = require(path.join(REPO, 'src/server/acp-subagents.js'));
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const ACCT = 'agy-0123456789ab', DATA = path.join(ROOT, 'data11'), BUFS = path.join(DATA, 'session-buffers');
  const mkStore = (home, { lines: n = null, answered = true } = {}) => {
    const store = path.join(home, '.gemini', 'antigravity-cli');
    fs.mkdirSync(store, { recursive: true });
    fs.cpSync(path.join(FIX, 'brain'), path.join(store, 'brain'), { recursive: true });
    const t = path.join(store, 'brain', S, SG, 'logs', 'transcript.jsonl');
    const all = fs.readFileSync(t, 'utf8').split('\n').filter(Boolean);
    if (n != null) fs.writeFileSync(t, all.slice(0, n).join('\n') + '\n');
    if (answered) fs.copyFileSync(path.join(FIX, 'answer.json'), path.join(store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
    return { store, t, rest: all.slice(n == null ? all.length : n) };
  };
  const home = path.join(DATA, 'agy-subs', ACCT);
  fs.mkdirSync(BUFS, { recursive: true });
  mkStore(home);
  const JOURNAL = fs.readFileSync(path.join(FIX, 'journal-before-cards.jsonl'), 'utf8');
  const jrecs = JOURNAL.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const KEY = `${P}:6`;
  ok(jrecs.some((r) => r.update?.title === 'invoke_subagent') && jrecs.some((r) => r.kind === 'notice' && r.noticeKind === 'subagents') && !jrecs.some((r) => r.kind === 'subagent' || r.kind === 'sub'),
    'the fixture IS an old wrapper\'s journal: the invoke_subagent row + «started 1 subagent», no card, no sub step (captured from the .339 wrapper)');
  const spawns = AS.unlinkedSpawns(jrecs);
  ok(spawns.length === 1 && spawns[0].toolCallId === KEY && spawns[0].parentId === P && spawns[0].step === 6 && spawns[0].ts === '2026-10-21T14:32:31.950Z' && AS.unlinkedSpawns([...jrecs, { type: 'acp', kind: 'subagent', toolCallId: KEY }]).length === 0,
    'unlinkedSpawns: the row no card names → {its key, the parent, the spawning step} — a row with its own card is not one', spawns);
  const snap = AS.snapshotOf(storeReader(home), { parentId: P, toolCallId: KEY, step: 6 });
  ok(!!snap && snap.subId === S && snap.final && snap.card.status === 'completed' && snap.card.role === '示例评审专家' && snap.card.elapsedMs === 53881 && /88\/100/.test(snap.card.result) && snap.card.steps === 10 && snap.card.files.join() === '/home/u/workspace/示例项目/report.md' && snap.subs.length === 13 && snap.subs.every((x) => x.subId === S && x.toolCallId === KEY),
    'snapshotOf (the store read whole): the card the wrapper\'s tail ends with — completed, 53 881 ms, the answer, the file, ten steps — and its 13 sub records', snap && { ...snap.card, subs: snap.subs.length });
  ok(AS.snapshotOf(storeReader(home), { parentId: P, toolCallId: `${P}:99`, step: 99 }) === null && AS.snapshotOf(storeReader(path.join(ROOT, 'nohome')), { parentId: P, toolCallId: KEY, step: 6 }) === null, '…a step no task names / a store that does not exist ⇒ null (no card, no error)');
  // THE HISTORY a re-attach rebuilds (the update's own restart is one)
  const sess = (o = {}) => ({ backend: 'antigravity', buffer: JOURNAL, _accountId: ACCT, ...o });
  const plain = new AcpMessageManager('p'); plain.convertHistory(new AcpSessionMessages(sess(), 'p', { buffersDir: BUFS }).raw());
  ok(!plain.messages.some((m) => m.taskInfo?.subId), 'RED (the measured gap): the plain ACP reader over that journal draws NO card — what a reload showed before this addendum');
  const s1 = sess();
  await BF.warmCards(s1, { dataDir: DATA }); // B-299b A1: the attach's warm reads the store off the loop (the descriptor's store.warmTranscript)
  const raw = new BF.AgySessionMessages(s1, 'p', { buffersDir: BUFS }).raw();
  const at = raw.findIndex((r) => r.update?.toolCallId === KEY && r.update.sessionUpdate === 'tool_call');
  ok(raw.length === jrecs.length + 1 && raw[at + 1].kind === 'subagent' && raw[at + 1].toolCallId === KEY && raw[at + 1].home === home && raw[at + 1].ts === raw[at].ts, 'the antigravity reader: the card right after its row (its time, the account\'s store as its home) — nothing else added to the parent\'s records', raw.map((r) => r.kind));
  const mm = new AcpMessageManager('p'); mm.convertHistory(raw);
  const cards = mm.messages.filter((m) => m.taskInfo?.subId === S);
  ok(cards.length === 1 && cards[0].toolName === 'Agent' && cards[0].status === 'complete' && cards[0].taskInfo.status === 'completed' && cards[0].taskInfo.elapsedMs === 53881 && /88\/100/.test(cards[0].content[0].output) && cards[0].content[0].input.prompt.includes('按 100 分制打分'),
    'the rebuilt history draws THE CARD (Agent, completed, elapsed, the task, the answer) where the row spun', mm.messages.map((m) => `${m.role}:${m.toolName || ''}:${m.status}`));
  const view = SUBS.normalizerFor(s1, `sub-${S}`); view.convertHistory(s1.subagentBuffers?.get(S) || []);
  const vt = view.messages.filter((m) => m.role === 'tool');
  ok(s1.subagentBuffers?.get(S)?.length === 13 && SUBS.seed(new Map([['p', s1]]), S, 'p') === s1 && view.messages[0].role === 'user' && view.messages[0].peerFrom === 'Parent Agent' && vt.length === 4 && vt.every((m) => m.status === 'complete'),
    '…and its sub-<id> timeline: the sub\'s steps are its virtual session\'s buffer (the task bubble, four tool cards, closed)', view.messages.map((m) => `${m.role}:${m.toolName || ''}:${m.status}`));
  ok(H8.helperTranscriptsOf(raw[at + 1])[0]?.file === path.join(home, '.gemini/antigravity-cli/brain', S, SG, 'logs/transcript_full.jsonl'), '…and the finished card opens the helper door in the ACCOUNT\'s store (the files it wrote join the Artifacts rows)');
  ok(H8.store.SessionMessages === BF.AgySessionMessages && typeof H8.store.afterTurn === 'function', 'the descriptor reads antigravity history with it (store.SessionMessages) and names the turn-end read (store.afterTurn)');
  const withOwn = JOURNAL + JSON.stringify({ ts: '2026-10-21T14:32:32.000Z', type: 'acp', kind: 'subagent', ...snap.card }) + '\n';
  const own = new BF.AgySessionMessages(sess({ buffer: withOwn }), 'p', { buffersDir: BUFS }).raw();
  ok(own.filter((r) => r.kind === 'subagent').length === 1, 'a row whose wrapper journaled its own card: unchanged (never a second card)');
  const nohome = path.join(ROOT, 'empty-home'); fs.mkdirSync(nohome, { recursive: true });
  const cases = [['a store that does not know the sub', { _accountId: 'agy-00000000ffff' }], ['another machine\'s conversation', { host: 'm1' }], ['an account id that is not one', { _accountId: '../x' }], ['a named account whose root is gone (asked on the worker\'s road)', { _accountId: 'agy-0000000000ee' }]];
  fs.mkdirSync(path.join(DATA, 'agy-subs', 'agy-00000000ffff', '.gemini', 'antigravity-cli'), { recursive: true });
  const caseSessions = cases.map(([, o]) => sess(o)); for (const cs of caseSessions) await BF.warmCards(cs, { dataDir: DATA });
  ok(caseSessions.every((cs) => new BF.AgySessionMessages(cs, 'p', { buffersDir: BUFS }).raw().length === jrecs.length) && BF.homeOf(sess({ _accountId: 'agy-0000000000ee' }), { dataDir: DATA }) === null && BF.homeOf(sess({ _accountId: 'agy-0000000000ee' }), { dataDir: DATA, stat: false }) === path.join(DATA, 'agy-subs', 'agy-0000000000ee') && BF.homeOf(sess({ _accountId: null }), { dataDir: DATA }) === require('node:os').homedir(),
    'unchanged (no card, no error): ' + cases.map((c) => c[0]).join(' / ') + '; a named account whose root is gone reads NO store (never the machine login\'s); no account = the machine\'s own login');
  // THE TURN END of a conversation an OLD wrapper still serves
  const t0 = Date.parse('2026-10-21T14:32:31.950Z');
  const s2 = sess(); s2._agyCards = new Map(); s2._agyCards.dataDir = DATA;   // what the first rebuild records (no rebuild yet here)
  ok((await BF.afterTurn(s2, { now: t0 + 30000 })).length === 0, 'turn end, the row 30 s old: NOTHING (the new wrapper\'s own look is 60 s — never two writers of one card)');
  const late = await BF.afterTurn(s2, { now: t0 + 61000 });
  ok(late.length === 14 && late[0].kind === 'subagent' && late[0].status === 'completed' && late.slice(1).every((r) => r.kind === 'sub' && r.subId === S), '61 s: the card + its 13 sub steps, once', late.map((r) => r.kind));
  ok((await BF.afterTurn(s2, { now: t0 + 120000 })).length === 0, '…and never again (a finished sub is not read twice)');
  const home3 = path.join(ROOT, 'h3'), w = mkStore(home3, { lines: 5, answered: false });
  const s3 = sess({ _accountId: null }); s3._agyCards = new Map();
  const pre = process.env.HOME; process.env.HOME = home3;
  let a3, b3, c3;
  try {
    a3 = await BF.afterTurn(s3, { now: t0 + 61000 });
    fs.appendFileSync(w.t, w.rest.join('\n') + '\n');
    fs.copyFileSync(path.join(FIX, 'answer.json'), path.join(w.store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
    b3 = await BF.afterTurn(s3, { now: t0 + 63000 });
    c3 = await BF.afterTurn(s3, { now: t0 + 67000 });
  } finally { process.env.HOME = pre; }
  ok(a3[0]?.status === 'running' && a3.length === 1 + a3.filter((r) => r.kind === 'sub').length && a3.length > 1 && b3.length === 0 && c3[0]?.status === 'completed' && c3.length === 1 + 13 - (a3.length - 1),
    'a WORKING sub (the machine login\'s store): its running card + its steps so far; inside 5 s nothing; then the finished card + ONLY the steps not yet sent', { first: a3.map((r) => r.kind + (r.status ? ':' + r.status : '')), second: b3.length, third: c3.length });
  // acp-events routes them: the card frame + subagent-message, at prompt_end
  const s4 = sess({ buffer: '', clients: new Map() }); s4._agyCards = new Map(); s4._agyCards.dataDir = DATA;
  const frames = [], mm4 = new AcpMessageManager('p4'); mm4.onOp((op) => frames.push({ type: 'msg', ...op }));
  let onData = null;
  require(path.join(REPO, 'src/server/stdout/acp-events.js')).create({ engine: { noteTurnEnd() { } } }).attach(s4, 'p4', { onData: (cb) => { onData = cb; } }, {
    feedLive: (s, m) => mm4.processLive(m), broadcastToSession: (s, id, f) => frames.push(f), broadcastActiveSessions() { }, readSessionMeta: () => null, writeSessionMeta() { }, updateSessionTodos() { },
  });
  // B-299b A1 r2: every main-thread read under the store while the turn end runs, by path — what is left is NAMED
  const helperReads = [], RS = ['openSync', 'readFileSync', 'readdirSync', 'realpathSync', 'lstatSync', 'statSync', 'existsSync'], realRS = {};
  for (const k of RS) { realRS[k] = fs[k]; fs[k] = function (p0, ...a) { if (typeof p0 === 'string' && p0.startsWith(home)) helperReads.push(p0); return realRS[k].call(this, p0, ...a); }; }
  try {
    onData(JOURNAL);
    for (let k = 0; k < 500 && !frames.some((f) => f.type === 'subagent-message' && f.subId === S); k++) await new Promise((r) => setTimeout(r, 10)); // B-299b A1: the turn end's read answers off the loop
    await require(path.join(REPO, 'src/server/artifact-registry.js')).helperSettled(s4); // B-299b A6 (its round): the artifact door's fold ends INSIDE the window
  } finally { for (const k of RS) fs[k] = realRS[k]; }
  ok(helperReads.length === 0, `the turn end's main-thread reads under the store: NONE — the artifact door's read of the finished sub's transcript_full left the loop too (B-299b: the transcript pool's pager)`, [...new Set(helperReads)].map((x) => path.relative(home, x)));
  const cardFrame = frames.find((f) => f.type === 'msg' && ((f.op === 'edit' && f.fields?.taskInfo?.subId === S) || (f.op === 'create' && f.message?.taskInfo?.subId === S)));
  const subFrames = frames.filter((f) => f.type === 'subagent-message' && f.subId === S);
  ok(!!cardFrame && subFrames.length === 13 && s4.subagentBuffers?.get(S)?.length === 13, 'acp-events at the old wrapper\'s prompt_end: THE CARD frame + 13 subagent-message frames (the sub-<id> viewer\'s live feed)', { card: !!cardFrame, subs: subFrames.length });
}

// ── ⑪b B-299b A1 (lane bl-loop-a): THE CARDS ARE READ OFF THE HUB'S LOOP ── the warm + its reader and a turn end of a
// conversation with a sub that already ran make ZERO sync fs calls into the store on the main thread (path- AND fd-named; the
// «agy-cards» worker reads it); the cards and steps are the release's, on EVERY road a reader is built on (the descriptor's
// warm with a live session; View History's / the history page's fresh reader with none). Rows are asked CARD_CHUNK a call and
// once (a second reader joins); a warm past its bound draws what landed, the rest reach the live conversation WHEN they land.
// A «not found» is asked again when the parent's subagents LISTING moved, when the kept transcript learned the row's sub id, or
// after NOT_FOUND_MS — never kept for a failed read; an empty answer never drops a card. RED: the store read on the main
// thread (the release's road), the A1 descriptor (no warm without a session).
console.log('— ⑪b B-299b A1: the cards off the hub\'s loop');
{
  const BF = require(path.join(REPO, 'src/agy-backfill.js'));
  const AC = require(path.join(REPO, 'src/agy-cards.js'));
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const { parseAcpBufferRecords } = require(path.join(REPO, 'src/acp-message-manager.js'));
  const mkStore = (h) => { const st = path.join(h, '.gemini', 'antigravity-cli'); fs.mkdirSync(st, { recursive: true }); fs.cpSync(path.join(FIX, 'brain'), path.join(st, 'brain'), { recursive: true }); fs.copyFileSync(path.join(FIX, 'answer.json'), path.join(st, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json')); return st; };
  const ACCT = 'agy-0123456789ac', DATA = path.join(ROOT, 'data11b'), home = path.join(DATA, 'agy-subs', ACCT), store = mkStore(home), BUFS = path.join(DATA, 'b');
  const JOURNAL = fs.readFileSync(path.join(FIX, 'journal-before-cards.jsonl'), 'utf8'), KEY = `${P}:6`;
  const SPAWNS = AS.unlinkedSpawns(JOURNAL.split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const sess = (o = {}) => ({ backend: 'antigravity', backendSessionId: P, buffer: JOURNAL, _accountId: ACCT, ...o });
  const withData = (x) => { x._agyCards = new Map(); x._agyCards.dataDir = DATA; return x; }; // the account's root under this suite's data dir (the hub's = homeOf's default)
  const cardsIn = (x) => new BF.AgySessionMessages(x, 'p', { buffersDir: BUFS }).raw().filter((r) => r.kind === 'subagent' && r.toolCallId === KEY);
  const fresh = () => { BF._cardCache.clear(); BF._cardsInflight.clear(); };
  const tick = () => new Promise((r) => setImmediate(r));
  // the counter: a sync fs call naming a path under the store, or an fd one of those opened (readSync / fstatSync / readFileSync(fd) / closeSync)
  const SYNC = ['openSync', 'readSync', 'readFileSync', 'readdirSync', 'realpathSync', 'lstatSync', 'statSync', 'fstatSync', 'closeSync', 'existsSync', 'accessSync'];
  const counting = async (fn) => {
    let n = 0; const fds = new Set(), real = {};
    for (const k of SYNC) { real[k] = fs[k]; fs[k] = function (p0, ...a) { const named = typeof p0 === 'string' && p0.startsWith(store); if (named || (typeof p0 === 'number' && fds.has(p0))) n++; const r = real[k].call(this, p0, ...a); if (k === 'openSync' && named) fds.add(r); if (k === 'closeSync') fds.delete(p0); return r; }; }
    try { await fn(); } finally { for (const k of SYNC) fs[k] = real[k]; }
    return n;
  };
  { // the counter's own CONTROL: an fd it opened is followed (open + read + fstat + close = 4)
    const f = path.join(store, 'brain', P, SG, 'subagents', `${S}.json`);
    const nfd = await counting(async () => { const fd = fs.openSync(f, 'r'); fs.readSync(fd, Buffer.alloc(8), 0, 8, 0); fs.fstatSync(fd); fs.closeSync(fd); });
    ok(nfd === 4, `the counter counts a path-named open AND the calls on the fd it gave (${nfd} of 4)`);
  }
  // 1. the hub's roads, counted — each one ASKING the worker (the kept cards cleared first)
  fresh();
  const s1 = sess(); let c1 = [];
  const nAttach = await counting(async () => { await BF.warmCards(s1, { dataDir: DATA }); c1 = cardsIn(s1); });
  fresh();
  const t0 = Date.parse('2026-10-21T14:32:31.950Z'), s2 = withData(sess());
  let late = []; const nTurn = await counting(async () => { late = await BF.afterTurn(s2, { now: t0 + 61000 }); });
  ok(nAttach === 0 && nTurn === 0 && c1.length === 1 && c1[0].status === 'completed' && late.length === 14 && late[0].kind === 'subagent',
    `a warm + its reader and a turn end make ${nAttach} and ${nTurn} sync fs calls into the store on the main thread (path- or fd-named — the worker reads it); the card and its 13 steps as the release drew them`, { nAttach, nTurn, late: late.length });
  // RED: the release's road — the worker's own code called on the main thread
  const src = fs.readFileSync(path.join(REPO, 'src/agy-backfill.js'), 'utf8'), CALL = "got = await pool().call('agySnapshots',";
  const Rel = mutantCopies('agy-cards-inline', REPO).load('src/agy-backfill.js', anchored(src, CALL, "got = await (async (op, x) => require('./agy-cards.js').snapshotsOf(x))('agySnapshots',", 'inline'), 'inline');
  const nRel = await counting(async () => { await Rel.warmCards(sess(), { dataDir: DATA }); });
  ok(src.split(CALL).length === 2 && nRel > 3, `control (the store read on the main thread, as the release read it): ${nRel} sync calls into the store ⇒ RED`);
  // 2. EVERY ROAD a reader is built on (M2): the descriptor's warm with the live session (ws-handler's attach); a FRESH reader
  // object with no session (ws-handler's View History, transcript-service's history page of a stopped conversation)
  fresh();
  const s5 = withData(sess());
  await H8.store.warmTranscript(P, '', { session: s5 });
  const viaDesc = cardsIn(s5);
  const hv = path.join(ROOT, 'h11v'), storeV = mkStore(hv);
  fs.mkdirSync(path.join(storeV, 'brain', P, SG, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(storeV, 'brain', P, SG, 'logs', 'transcript.jsonl'), [ // the parent's own steps: the spawn and «Created the following subagent»
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-10-21T14:31:00Z', content: '评审一下' },
    { step_index: 5, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-21T14:32:30Z', content: '', tool_calls: [{ name: 'invoke_subagent', args: {} }] },
    { step_index: 6, source: 'SYSTEM', type: 'GENERIC', status: 'DONE', created_at: '2026-10-21T14:32:31.950Z', content: `Created the following subagent:\n{\n  "conversationId": "${S}"\n}\n` },
    { step_index: 8, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-21T14:33:00Z', content: 'and one more', tool_calls: [{ name: 'view_file', args: {} }, { name: 'invoke_subagent', args: {} }] },
    { step_index: 9, source: 'SYSTEM', type: 'GENERIC', status: 'DONE', created_at: '2026-10-21T14:33:01Z', content: 'file read' },
    { step_index: 10, source: 'SYSTEM', type: 'GENERIC', status: 'DONE', created_at: '2026-10-21T14:33:02Z', content: `Created the following subagent:\n{\n  "conversationId": "${S2}"\n}\n` },
  ].map((x) => JSON.stringify(x)).join('\n') + '\n');
  const synthetic = () => ({ backend: 'antigravity', backendSessionId: P, claudeSessionId: P, agentKind: 'primary', cwd: '', buffer: '' }); // what ws-handler / transcript-service build per request
  const dsrc = fs.readFileSync(path.join(REPO, 'src/harnesses/antigravity.js'), 'utf8'), DW = "if (!o.remote) await AGY_BACKFILL.warmCards(o.session || { backend: 'antigravity', backendSessionId: id, buffer: '' }, o.attach ? { viewWaitMs: AGY_BACKFILL.CARDS_WAIT_MS } : {});";
  const preH = process.env.HOME; process.env.HOME = hv;
  let viaView = [], viewRed = [], scanSame = false, scanN = -1;
  try {
    fresh(); BF._historyCache.delete(P);
    await H8.store.warmTranscript(P, '', { remote: false });
    viaView = cardsIn(synthetic());
    // the warm's spawn scan builds no records: the SAME rows the history's records name (the kept steps alone, and with the ring)
    const ids = (xs) => xs.map((x) => `${x.toolCallId}@${x.ts}`).join();
    const ring = sess({ _accountId: null });
    scanN = BF.spawnsOf(synthetic()).length;
    scanSame = ids(BF.spawnsOf(synthetic())) === ids(AS.unlinkedSpawns(BF.withHistory(synthetic(), []))) && ids(BF.spawnsOf(ring)) === ids(AS.unlinkedSpawns(BF.withHistory(ring, parseAcpBufferRecords(JOURNAL))));
    fresh();
    const D1 = mutantCopies('agy-desc-a1', REPO).load('src/harnesses/antigravity.js', anchored(dsrc, DW, 'if (o.session && !o.remote) await AGY_BACKFILL.warmCards(o.session);', 'a1'), 'a1');
    await D1.store.warmTranscript(P, '', { remote: false });
    viewRed = cardsIn(synthetic());
  } finally { process.env.HOME = preH; BF._historyCache.delete(P); }
  ok(dsrc.split(DW).length === 2 && viaDesc.length === 1 && viaDesc[0].status === 'completed' && viaView.length === 1 && viaView[0].status === 'completed' && viaView[0].home === hv && viewRed.length === 0,
    'every road a reader is built on draws THE CARD: the descriptor\'s warm with the live session, and a FRESH reader with no session (View History; the history page of a stopped conversation — its spawn found in the kept transcript); RED: the A1 descriptor (cards warmed only for a live session) ⇒ none', { desc: viaDesc.length, view: viaView.length, red: viewRed.length });
  ok(scanSame && scanN === 2, `the warm's spawn scan (no records built): the same rows as the history's records — the kept steps alone (${scanN}: a planner step with two calls, the spawn the SECOND) and with the ring`);
  const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), tsSrc = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
  ok(wsSrc.includes('await warm(session.claudeSessionId || session.backendSessionId, session.cwd, { remote: !!session.host, session, attach: true, bulk: bulkRead })') && tsSrc.includes('{ remote: !!r.host, ...(live ? { session: live } : {}) }'),
    'the callers hand the warm the session it reads the cards for: ws-handler\'s attach its live session, transcript-service\'s history read the live one when there is one');
  // the cure (the chain's read, small): an ATTACH of a conversation with no late road (no acp-events pipeline — a restored one)
  // waits the LIVE bound for its cards before its first answer, never the history page's; RED: cadb07780's descriptor (no attach)
  {
    const boundOf = async (D, o) => {
      const realWC = BF.warmCards; let got = null;
      BF.warmCards = async (s, opts) => { got = { late: typeof s._acpLate === 'function', ...(opts || {}) }; };
      try { await D.store.warmTranscript(P, '', o); } finally { BF.warmCards = realWC; }
      return !got ? null : got.waitMs != null ? got.waitMs : got.late ? (got.liveWaitMs != null ? got.liveWaitMs : BF.CARDS_WAIT_MS) : (got.viewWaitMs != null ? got.viewWaitMs : BF.CARDS_VIEW_WAIT_MS);
    };
    const DA = mutantCopies('agy-desc-no-attach', REPO).load('src/harnesses/antigravity.js', anchored(dsrc, DW, () => "if (!o.remote) await AGY_BACKFILL.warmCards(o.session || { backend: 'antigravity', backendSessionId: id, buffer: '' });", 'no-attach'), 'no-attach');   // stale-pins: kept (cadb07780's descriptor line, planted back as the RED control)
    fresh();
    const atAttach = await boundOf(H8, { session: withData(sess()), attach: true }), atView = await boundOf(H8, { session: withData(sess()) }), atRed = await boundOf(DA, { session: withData(sess()), attach: true });
    ok(atAttach === BF.CARDS_WAIT_MS && BF.CARDS_WAIT_MS < BF.CARDS_VIEW_WAIT_MS && atView === BF.CARDS_VIEW_WAIT_MS && atRed === BF.CARDS_VIEW_WAIT_MS,
      `an attach with no late road waits the live bound for its cards (${atAttach / 1000} s), a history page its one draw (${atView / 1000} s); RED (cadb07780's descriptor): the attach waits ${atRed / 1000} s before its first answer`);
  }
  // 3. THE QUEUE (M3): CARD_CHUNK rows a call, a row being read JOINED, the first answer kept while the rest wait; the bound + the late road
  const fake = (asks, o = {}) => asks.map((a) => ({ toolCallId: a.toolCallId, snap: { subId: S, card: { toolCallId: a.toolCallId, subId: S, status: 'completed', role: 'r' }, subs: [{ subId: S, toolCallId: a.toolCallId, rec: { type: 'x' } }], final: true, ...o }, sig: 'L#', clean: true }));
  const many = Array.from({ length: 20 }, (_, i) => ({ toolCallId: `${P}:${100 + i}`, parentId: P, step: 100 + i, ts: null }));
  fresh();
  const calls = [], gate = [];
  const held = () => ({ call: (op, x) => new Promise((res) => { calls.push(x.asks.length); gate.push(() => res(fake(x.asks))); }) });
  const pa = BF.refreshAsync(sess(), many, { dataDir: DATA, pool: held }), pb = BF.refreshAsync(sess(), many, { dataDir: DATA, pool: held });
  await tick();
  const asked = calls.join('+');
  gate[0](); await tick(); await tick();
  const part = BF.refresh(sess(), many).length;
  gate[1](); gate[2]();
  const [ra, rb] = await Promise.all([pa, pb]);
  ok(asked === '8+8+4' && calls.length === 3 && part === 8 && ra.length === 20 && rb.length === 20,
    `20 rows = ${asked} (CARD_CHUNK ${BF.CARD_CHUNK} a call); a second reader asking the same rows at once JOINS them (${calls.length} calls, not 6); the first answer is kept while the rest wait (${part} of 20 drawn)`);
  fresh();
  let release = null; const routed = [];
  const slow = () => ({ call: (op, x) => new Promise((res) => { release = () => res(AC.snapshotsOf(x)); }) }); // the worker's own answer, when the leg says
  const sl = withData(sess()); sl._acpLate = (recs) => routed.push(...recs);
  await BF.warmCards(sl, { waitMs: 20, pool: slow });
  const before = cardsIn(sl).length;
  release(); for (let k = 0; k < 200 && !routed.length; k++) await new Promise((r) => setTimeout(r, 5));
  const after = cardsIn(sl).length, again = await BF.afterTurn(sl, { now: t0 + 61000, pool: slow });
  ok(before === 0 && routed.length === 14 && routed[0].kind === 'subagent' && routed[0].status === 'completed' && routed.slice(1).every((r) => r.kind === 'sub') && after === 1 && again.length === 0,
    `a warm whose worker answers past its bound (20 ms): the attach draws without it; the card + its 13 steps reach the live conversation's late road WHEN it answers (${routed.length} records); the next reader draws it; the turn end sends nothing twice`, { before, routed: routed.length, after, again: again.length });
  const pool1 = BF._cardsPool();
  ok(pool1.poolSize === 1 && !!pool1._serial && BF.CARDS_QUEUE_MS > BF.CARDS_RUN_MS && BF.CARDS_RUN_MS >= 30000,
    `the worker is ONE and serial: a call waits for its turn in main on its own clock (${BF.CARDS_QUEUE_MS / 1000} s) and runs on another (${BF.CARDS_RUN_MS / 1000} s) — a queue after a restart times nothing out; a wedged read fails only itself`);
  // 3b. r3 (the second read's musts): a reader with no live road waits for its one draw; a live one's failed call is asked once
  // more; the device agent's bundle (no worker script) reads its own store in place, as the release did there
  {
    const at = (ms, v) => () => ({ call: (op, x) => new Promise((res) => setTimeout(() => res(typeof v === 'function' ? v(x) : v), ms)) });
    fresh();
    const syn = withData(sess({ buffer: JOURNAL })); delete syn._acpLate;            // View History's reader: no late road
    await BF.warmCards(syn, { liveWaitMs: 20, viewWaitMs: 5000, pool: at(120, (x) => AC.snapshotsOf(x)) });
    const viewDrawn = cardsIn(syn).length;
    fresh();
    const lv = withData(sess()); const lr = []; lv._acpLate = (recs) => lr.push(...recs);
    await BF.warmCards(lv, { liveWaitMs: 20, viewWaitMs: 5000, pool: at(120, (x) => AC.snapshotsOf(x)) });
    const liveDrawn = cardsIn(lv).length;
    for (let k = 0; k < 200 && !lr.length; k++) await new Promise((r) => setTimeout(r, 5));
    ok(viewDrawn === 1 && liveDrawn === 0 && lr.length === 14, `a worker slower than the live bound: View History's reader WAITS and draws the card (${viewDrawn}); a live conversation draws without it (${liveDrawn}) and gets it on its late road (${lr.length} records)`);
    fresh();
    let tries = 0; const rr = []; const rv = withData(sess()); rv._acpLate = (recs) => rr.push(...recs);
    const flakyPool = () => ({ call: async (op, x) => { tries++; if (tries === 1) throw Object.assign(new Error('worker gone'), { code: 'EX' }); return AC.snapshotsOf(x); } });
    await BF.warmCards(rv, { liveWaitMs: 1000, retryMs: 30, pool: flakyPool, log: () => { } });
    for (let k = 0; k < 200 && !rr.length; k++) await new Promise((r) => setTimeout(r, 5));
    ok(tries === 2 && rr.length === 14, `a live conversation whose call failed (an idle one has no turn end): asked ONCE more, its card routed then (${tries} calls, ${rr.length} records)`);
    fresh();
    const bsrc = fs.readFileSync(path.join(REPO, 'src/agy-backfill.js'), 'utf8'), WK = "if (!fs.existsSync(path.join(__dirname, 'agy-cards-worker.js'))) return";
    const Dev = mutantCopies('agy-cards-device', REPO).load('src/agy-backfill.js', anchored(bsrc, WK, "if (!fs.existsSync(path.join(__dirname, 'agy-cards-worker-not-shipped.js'))) return", 'device'), 'device');
    const dv = sess(); dv._agyCards = new Map(); dv._agyCards.dataDir = DATA;
    await Dev.warmCards(dv, { dataDir: DATA });
    const devCards = new Dev.AgySessionMessages(dv, 'p', { buffersDir: BUFS }).raw().filter((r) => r.kind === 'subagent' && r.toolCallId === KEY);
    ok(bsrc.split(WK).length === 2 && Dev._cardsPool().inPlace === true && devCards.length === 1 && devCards[0].status === 'completed',
      'a bundle that ships no agy-cards worker (the device agent\'s): its own store read IN PLACE on its own loop, the card drawn as the release drew it there (never a worker respawning forever)');
    // a FOUND snapshot whose reads failed somewhere: never replaces a card already read; alone it is kept NOT final (asked again)
    fresh();
    const snapAns = (o) => (x) => x.asks.map((a) => ({ toolCallId: a.toolCallId, snap: { subId: S, card: { toolCallId: a.toolCallId, subId: S, status: o.status, steps: o.steps }, subs: [], final: o.final !== false }, sig: 'L#', clean: o.clean }));
    const T5 = Date.parse('2026-10-21T14:40:00Z'), w5 = () => withData(sess({ _accountId: 'agy-0123456789ae' }));
    const g1 = await BF.refreshAsync(w5(), SPAWNS, { dataDir: DATA, now: T5, pool: at(0, snapAns({ status: 'completed', steps: 0, clean: false })) });
    const k1 = BF._cardCache.get(`agy-0123456789ae\0${KEY}`);
    const g2 = await BF.refreshAsync(w5(), SPAWNS, { dataDir: DATA, now: T5 + 6000, pool: at(0, snapAns({ status: 'running', steps: 10, clean: true, final: false })) });
    const g3 = await BF.refreshAsync(w5(), SPAWNS, { dataDir: DATA, now: T5 + 12000, pool: at(0, snapAns({ status: 'completed', steps: 0, clean: false })) });
    ok(g1.length === 1 && k1 && k1.final === false && g2[0].card.steps === 10 && g2[0].card.status === 'running' && g3[0].card.steps === 10 && g3[0].card.status === 'running',
      'a found card whose reads failed (0 steps): kept NOT final, asked again; the clean read replaces it (a working sub, 10 steps); a later read that fails (0 steps, «completed») never replaces the card already read', { first: k1 && k1.final, second: g2[0] && g2[0].card, third: g3[0] && g3[0].card });
  }
  // 4. «NOT FOUND» (主开发's bound, M4): asked again only when its SIGNAL moved — the parent's subagents listing, the sub id the
  // kept transcript learned — or after NOT_FOUND_MS (a link written where no listing looks); never kept for a failed read
  const ACCT2 = 'agy-0123456789ad', store2 = mkStore(path.join(DATA, 'agy-subs', ACCT2));
  const taskF = path.join(store2, 'brain', S, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c1.json'), taskText = fs.readFileSync(taskF, 'utf8');
  const drift = () => { const j = JSON.parse(taskText); j.sourceMetadata.tool.stepIndex = 27; fs.writeFileSync(taskF, JSON.stringify(j)); }; // the stream's step and the task's disagree (measured: :24 vs 27) — no row by step
  const rowF = path.join(store2, 'brain', P, SG, 'subagents', `${S}.json`), rowText = fs.readFileSync(rowF, 'utf8');
  let snaps = 0; const so = AS.snapshotOf; AS.snapshotOf = (...a) => { snaps++; return so(...a); };
  const local = () => ({ call: async (op, x) => AC.snapshotsOf(x) }); // the worker's own code, in this thread (to count its reads)
  const T = t0 + 61000, ask = async (dt, pool = local) => { const n0 = snaps; const r = await BF.refreshAsync(withData(sess({ _accountId: ACCT2 })), SPAWNS, { dataDir: DATA, now: T + dt, pool }); return { found: r.length, reads: snaps - n0, status: r[0] ? r[0].card.status : null }; };
  const rd = fs.readdirSync;
  try {
    fresh(); // a. the sub's row not written yet, then written IN PLACE (the folder's own time unmoved)
    const dirM0 = fs.statSync(path.dirname(rowF)).mtimeMs;
    fs.writeFileSync(rowF, '{}');
    const a1 = await ask(0), a2 = await ask(6000);
    fs.writeFileSync(rowF, rowText);
    const a3 = await ask(12000), dirM1 = fs.statSync(path.dirname(rowF)).mtimeMs;
    ok(a1.found === 0 && a1.reads === 1 && a2.reads === 0 && a3.found === 1 && a3.reads === 1 && dirM1 === dirM0,
      `«not found» (${a1.reads} read), asked again over the SAME listing: ${a2.reads} reads; the row rewritten IN PLACE (the folder's own time unmoved: ${dirM1 === dirM0}) moves the listing: found`, { a1, a2, a3 });
    fresh(); drift(); // b. the sub id learned later — the listing unchanged
    const b1 = await ask(0), b2 = await ask(6000);
    BF._historyCache.set(P, { home: path.dirname(path.dirname(store2)), account: ACCT2, next: 0, size: 0, steps: [], created: new Map([[6, S]]), capped: false, ms: 0, bytes: 0, at: Date.now() }); // the kept transcript read «Created the following subagent: S» at step 6
    const b3 = await ask(12000);
    BF._historyCache.delete(P);
    ok(b1.found === 0 && b1.reads === 1 && b2.reads === 0 && b3.found === 1 && b3.reads === 1,
      `a row the store cannot place by its step: «not found», skipped over the same signal (${b2.reads} reads); the kept transcript then names its sub (the listing unchanged) — the next ask READS and finds it`, { b1, b2, b3 });
    fresh(); drift(); // c. the floor: the link written where no listing looks (the sub's own messages)
    const f1 = await ask(0), f2 = await ask(30000);
    fs.writeFileSync(taskF, taskText);
    const f3 = await ask(40000), f4 = await ask(62000);
    ok(f1.found === 0 && f2.reads === 0 && f3.reads === 0 && f3.found === 0 && f4.reads === 1 && f4.found === 1,
      `a link written in the sub's own messages (no listing shows it): skipped inside ${BF.NOT_FOUND_MS / 1000} s (${f2.reads}, ${f3.reads} reads), then READ and found at 62 s`, { f1, f2, f3, f4 });
    fresh(); // d. a read that FAILED is never kept as «not found»
    const subMsgs = path.join(store2, 'brain', S, SG, 'messages');
    let fail = 1; fs.readdirSync = function (p0, ...a) { if (fail > 0 && typeof p0 === 'string' && p0 === subMsgs) { fail--; throw Object.assign(new Error('EIO: i/o error, scandir'), { code: 'EIO' }); } return rd.call(this, p0, ...a); };
    const d1 = await ask(0), d2 = await ask(6000);
    fs.readdirSync = rd;
    ok(fail === 0 && d1.found === 0 && d1.reads === 1 && d2.reads === 1 && d2.found === 1,
      `a read that FAILED (EIO on the sub's messages): «not found» this once and never kept — the next ask reads again (${d2.reads}) and finds it`, { d1, d2 });
    fresh(); // e. an empty answer never drops a card already read
    let mode = 'card';
    const flaky = () => ({ call: async (op, x) => (mode === 'card' ? fake(x.asks, { final: false }) : x.asks.map((a) => ({ toolCallId: a.toolCallId, snap: null, sig: null, clean: false }))) });
    const e1 = await ask(0, flaky); mode = 'none';
    const e2 = await ask(6000, flaky);
    ok(e1.found === 1 && e2.found === 1 && e2.status === 'completed', 'a WORKING card read once, then an answer with nothing in it (a read that failed): the card stays', { e1, e2 });
  } finally { AS.snapshotOf = so; fs.readdirSync = rd; fs.writeFileSync(taskF, taskText); fs.writeFileSync(rowF, rowText); BF._historyCache.delete(P); fresh(); }
}

// ── ⑫ CARD DETAILS (lane agy-card-details, 2026-10-22 — the owner, two screenshots of an Antigravity chat: «很多卡片
// 都缺少细节») ── the owner's store SHAPES, MADE UP here (placeholder ids — the owner's never ride a test): agy's tool
// args are JSON-ENCODED STRINGS in the store ("Path":"\"/x\"", "StartLine":"1"); two subs spawned in ONE planner step
// (the stream gave each its own step 24/25, the sub rows' spawnStepIndex BOTH say 27 — the drift); one sub KILLED mid-read.
console.log('— ⑫ card details (the arg normalizer, link-by-id, a killed sub closed)');
{
  const { storeReader } = require(path.join(REPO, 'src/agy-store-fs.js'));
  const { withCards } = require(path.join(REPO, 'src/agy-backfill.js'));
  ok(AS.decodeScalar(JSON.stringify('/home/u/x.md')) === '/home/u/x.md' && AS.decodeScalar('400') === 400 && AS.decodeScalar('/home/u/x.md') === '/home/u/x.md' && AS.decodeScalar('7z x a.zip') === '7z x a.zip',
    'decodeScalar: a JSON-encoded scalar → that scalar; a clean path / command (even digit-leading) stays itself');
  const rd = AS.normalizeAgyToolArgs({ EndLine: '400', Path: JSON.stringify('/home/u/x.md'), StartLine: '1' });
  ok(rd.file_path === '/home/u/x.md' && rd.offset === 1 && rd.limit === 400 && rd.Path === '/home/u/x.md',
    'normalizeAgyToolArgs: Path→file_path, StartLine→offset, EndLine→limit; the raw keys (decoded) stay for the 技术细节 fold', rd);
  const rc = AS.normalizeAgyToolArgs({ CommandLine: JSON.stringify('ls -la'), toolAction: JSON.stringify('List'), toolSummary: JSON.stringify('list the dir') });
  ok(rc.command === 'ls -la' && rc.title === 'List' && rc.summary === 'list the dir',
    '…CommandLine→command, toolAction→title, toolSummary→summary (agy’s own human words for the act)', rc);
  const wline = JSON.stringify({ step_index: 3, type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ name: 'write_file', args: { Path: JSON.stringify('/home/u/report.md'), Content: JSON.stringify('# hi\n') } }] });
  const arec = AS.artifactRecordsOf(wline);
  ok(arec.length === 1 && arec[0].update.content[0].path === '/home/u/report.md' && arec[0].update.content[0].newText === '# hi\n',
    'artifactRecordsOf: the store’s JSON-encoded Path + Content are decoded — never a \"-wrapped path', arec[0] && arec[0].update.content[0].path);

  const PX = 'aa000000-0000-4000-8000-0000000000f0', SA = 'aa000000-0000-4000-8000-0000000000f1', SB = 'aa000000-0000-4000-8000-0000000000f2';
  const home = path.join(ROOT, 'cards'), brain = path.join(home, '.gemini/antigravity-cli/brain');
  const W = (rel, body) => { const p = path.join(brain, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  const created = (id) => `Created At: x\nCompleted At: y\nCreated the following subagent:\n{\n  "conversationId": "${id}",\n  "logAbsoluteUri": "file:///x"\n}\nThe subagent will send you a message when it has completed its task.`;
  W(`${PX}/${SG}/logs/transcript.jsonl`, [
    { step_index: 23, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', content: 'Spawning two analysts.', tool_calls: [{ name: 'invoke_subagent', args: { Role: JSON.stringify('A-L'), TypeName: JSON.stringify('research') } }, { name: 'invoke_subagent', args: { Role: JSON.stringify('N-Z'), TypeName: JSON.stringify('research') } }] },
    { step_index: 24, source: 'MODEL', type: 'GENERIC', status: 'DONE', content: created(SA) },
    { step_index: 25, source: 'MODEL', type: 'GENERIC', status: 'DONE', content: created(SB) },
  ].map((o) => JSON.stringify(o)).join('\n') + '\n');
  W(`${PX}/${SG}/subagents/${SA}.json`, JSON.stringify({ conversationId: SA, subagentDescriptor: { typeName: 'research', role: 'A-L' }, state: 'SUBAGENT_STATE_KILLED', spawnStepIndex: 27, workspaceUris: ['file:///home/u/ws'] }));
  W(`${PX}/${SG}/subagents/${SB}.json`, JSON.stringify({ conversationId: SB, subagentDescriptor: { typeName: 'research', role: 'N-Z' }, state: 'SUBAGENT_STATE_KILLED', spawnStepIndex: 27, workspaceUris: ['file:///home/u/ws'] }));
  const taskMsg = (sub, step, tail) => JSON.stringify({ id: `d0000000-0000-4000-8000-0000000000${tail}`, recipient: sub, sender: PX, timestamp: '2026-10-21T23:10:41Z', renderDetails: { messageTitle: 'Message from Parent Agent' }, content: 'Analyze.', sourceMetadata: { tool: { conversationId: PX, stepIndex: step, toolCall: { name: 'invoke_subagent', id: 'call_x' } } } });
  W(`${SA}/${SG}/messages/d0000000-0000-4000-8000-0000000000d4.json`, taskMsg(SA, 24, 'd4'));
  W(`${SB}/${SG}/messages/d0000000-0000-4000-8000-0000000000d5.json`, taskMsg(SB, 25, 'd5'));
  const viewArgs = (p, sum) => ({ AbsolutePath: JSON.stringify(p), StartLine: JSON.stringify(1), EndLine: JSON.stringify(400), toolSummary: JSON.stringify(sum) });
  W(`${SA}/${SG}/logs/transcript.jsonl`, [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', content: 'Analyze A-L.' },
    { step_index: 10, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', content: '', tool_calls: [{ name: 'view_file', args: viewArgs('/home/u/a.txt', 'Reading a.txt') }, { name: 'view_file', args: viewArgs('/home/u/b.txt', 'Reading b.txt') }] },
  ].map((o) => JSON.stringify(o)).join('\n') + '\n');
  W(`${SB}/${SG}/logs/transcript.jsonl`, [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', content: 'Analyze N-Z.' },
    { step_index: 10, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', content: '', tool_calls: [{ name: 'view_file', args: viewArgs('/home/u/z.txt', 'Reading z.txt') }] },
  ].map((o) => JSON.stringify(o)).join('\n') + '\n');
  const reader = storeReader(home);
  ok(AS.subIdForStep(reader, PX, 24) === SA && AS.subIdForStep(reader, PX, 25) === SB && AS.subIdForStep(reader, PX, 99) === null,
    'subIdForStep: «Created the following subagent: {id}» at the step names the sub — unique per call, drift-proof (never spawnStepIndex 27)');
  const snapA = AS.snapshotOf(reader, { parentId: PX, toolCallId: `${PX}:24`, step: 24, now: Date.parse('2026-10-21T23:20:00Z') });
  const openA = new Set(); for (const s of snapA.subs) { const u = s.rec.update; if (u?.sessionUpdate === 'tool_call') openA.add(u.toolCallId); if (u?.sessionUpdate === 'tool_call_update' && u.status !== 'in_progress') openA.delete(u.toolCallId); }
  const firstView = snapA.subs.map((s) => s.rec.update).find((u) => u?.sessionUpdate === 'tool_call' && u.title === 'view_file');
  const closers = snapA.subs.map((s) => s.rec.update).filter((u) => u?.sessionUpdate === 'tool_call_update' && u.status === 'failed' && u.content?.[0]?.content?.text === AS.SUB_TERMINATED);
  ok(snapA && snapA.subId === SA && snapA.card.status === 'stopped' && firstView?.rawInput?.file_path === '/home/u/a.txt' && firstView?.rawInput?.AbsolutePath === '/home/u/a.txt',
    'snapshotOf a KILLED sub: linked by id, stopped, the read card’s path decoded (file_path + the raw AbsolutePath kept)', { subId: snapA && snapA.subId, status: snapA && snapA.card.status, fp: firstView?.rawInput?.file_path });
  ok(openA.size === 0 && closers.length === 2 && /Reading [ab]\.txt/.test(snapA.card.lastText),
    'a killed sub leaves NO tool card open: its 2 unfinished view_file calls close as «terminated» (SUB_TERMINATED), lastText = its last read', { open: openA.size, closed: closers.length, lastText: snapA.card.lastText });
  const journal = [
    { type: 'acp', kind: 'update', sessionId: PX, ts: '2026-10-21T23:10:39.000Z', update: { sessionUpdate: 'tool_call', toolCallId: `${PX}:24`, title: 'invoke_subagent', kind: 'other', status: 'in_progress', rawInput: { Role: 'A-L' } } },
    { type: 'acp', kind: 'update', sessionId: PX, ts: '2026-10-21T23:10:40.000Z', update: { sessionUpdate: 'tool_call', toolCallId: `${PX}:25`, title: 'invoke_subagent', kind: 'other', status: 'in_progress', rawInput: { Role: 'N-Z' } } },
  ];
  const spawns = AS.unlinkedSpawns(journal);
  ok(spawns.length === 2 && spawns[0].step === 24 && spawns[1].step === 25,
    'unlinkedSpawns: two invoke_subagent rows of ONE planner step get DISTINCT stream steps (24 / 25) — never folded into one', spawns.map((s) => s.step));
  const preHome = process.env.HOME; process.env.HOME = home;
  let cards;
  try { const who = { _accountId: null, host: 'local' }; await require(path.join(REPO, 'src/agy-backfill.js')).refreshAsync(who, AS.unlinkedSpawns(journal), { dataDir: path.join(home, 'data') }); const out = withCards(who, journal, { dataDir: path.join(home, 'data') }); cards = out.filter((r) => r.kind === 'subagent'); } // B-299b A1: read off the loop first
  finally { process.env.HOME = preHome; }
  ok(cards.length === 2 && cards.map((c) => c.subId).sort().join() === [SA, SB].sort().join() && cards.every((c) => c.status === 'stopped'),
    'withCards: the history gets BOTH subs’ cards (A-L and N-Z), each stopped — never one card for two subs', cards.map((c) => c.subId));
}

// ── ⑬ THE CONVERSATION'S WHOLE HISTORY (lane agy-harness-fixes, bug 1 — the owner: a long agy conversation said
// «没有更早的消息» a few hundred messages back). SYNTHETIC: a 301-step transcript (~1.7 MB — a long conversation's size)
// and a journal ring holding only steps 220..300 (the wrapper's 800 KB ring after the cut, opened by a half line).
console.log('— ⑬ the whole history: the steps before the journal\'s 800 KB ring come from agy\'s own transcript (lane agy-harness-fixes)');
{
  const BF = require(path.join(REPO, 'src/agy-backfill.js'));
  const { AcpMessageManager, AcpSessionMessages, parseAcpBufferRecords } = require(path.join(REPO, 'src/acp-message-manager.js'));
  const C = 'c0de0000-0000-4000-8000-00000000c0de', SUBX = 'c0de0000-0000-4000-8000-0000000005b1', C2 = 'c0de0000-0000-4000-8000-00000000c0d2';
  const T0 = Date.UTC(2026, 9, 24, 8, 0, 0), at = (i) => new Date(T0 + i * 1000).toISOString();
  const NUDGE_T = 10, CTX = '<vibespace-context>\nTask group: demo\n</vibespace-context>\n', PAD = 'x'.repeat(20000);
  const stepLine = (i) => {
    const t = Math.floor(i / 4), k = i % 4, base = { step_index: i, status: 'DONE', created_at: at(i) };
    if (k === 0) return { ...base, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: t === NUDGE_T ? '<vibespace-reminder>finish the list</vibespace-reminder>' : (t % 5 === 1 ? CTX : '') + `question ${t}` };
    if (k === 1) return { ...base, source: 'MODEL', type: 'PLANNER_RESPONSE', content: `answer ${t} begins`, thinking: `thinking ${t}`, tool_calls: [{ name: t === 3 ? 'invoke_subagent' : 'run_command', args: { CommandLine: `"echo ${t}"` } }] };
    if (k === 2) return { ...base, source: 'MODEL', type: 'GENERIC', content: t === 3 ? `Created At: ${at(i)}\nCreated the following subagent: {\n  "conversationId": "${SUBX}"\n}` : `Created At: ${at(i)}\nCompleted At: ${at(i)}\nCommand exited with code 0.\n\nCommand output:\n${t} ${PAD}\n` };
    return { ...base, source: 'MODEL', type: 'PLANNER_RESPONSE', content: `answer ${t} done` };
  };
  // the LIVE journal the wrapper writes for turn t (its record shapes; keys `<conversation>:<step_index>`)
  const ringOf = (t) => {
    const out = [{ ts: at(4 * t), type: 'acp', kind: 'user', msgId: `m${t}`, content: [{ type: 'text', text: `question ${t}` }], peer: null }];
    const up = (i, u) => out.push({ ts: at(i), type: 'acp', kind: 'update', sessionId: C, update: u });
    if (4 * t + 1 <= 300) up(4 * t + 1, { sessionUpdate: 'agent_message_chunk', messageId: `${C}:${4 * t + 1}`, content: { type: 'text', text: `answer ${t} begins` } });
    if (4 * t + 2 <= 300) { up(4 * t + 2, { sessionUpdate: 'tool_call', toolCallId: `${C}:${4 * t + 2}`, title: 'run_command', kind: 'execute', status: 'in_progress', rawInput: { command: `echo ${t}` } }); up(4 * t + 2, { sessionUpdate: 'tool_call_update', toolCallId: `${C}:${4 * t + 2}`, status: 'completed', content: [{ type: 'content', content: { type: 'text', text: `${t}` } }] }); }
    if (4 * t + 3 <= 300) up(4 * t + 3, { sessionUpdate: 'agent_message_chunk', messageId: `${C}:${4 * t + 3}`, content: { type: 'text', text: `answer ${t} done` } });
    return out;
  };
  const H13 = path.join(ROOT, 'h13'), TR = path.join(H13, '.gemini', 'antigravity-cli', 'brain', C, SG, 'logs', 'transcript.jsonl');
  fs.mkdirSync(path.dirname(TR), { recursive: true });
  fs.writeFileSync(TR, Array.from({ length: 301 }, (_, i) => JSON.stringify(stepLine(i))).join('\n') + '\n');
  const ringRecs = []; for (let t = 55; t <= 75; t++) ringRecs.push(...ringOf(t));
  const HALF = '":"answer 54 done"}}}\n'; // the old slice's corrupt first line
  const RING = HALF + ringRecs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const sess = (o = {}) => ({ backend: 'antigravity', backendSessionId: C, host: 'local', _accountId: null, buffer: RING, ...o });
  const preHome = process.env.HOME; process.env.HOME = H13;
  try {
    // the loop while the warm reads ~1.5 MB: a sampler counts the loop turns that ran while the warm was still pending
    // (the proof is the mechanism — awaited reads + parse slices — never a wall-clock bound; the gap is only printed)
    let maxGap = 0, last = performance.now(), sampling = true, turnsWhilePending = 0;
    const tick = () => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; if (sampling) { turnsWhilePending++; setImmediate(tick); } };
    setImmediate(tick);
    const t0 = performance.now();
    const warmed = await require(path.join(REPO, 'src/harnesses/antigravity.js')).store.warmTranscript(C, '/home/u/proj', { remote: false, session: sess() });
    const warmMs = performance.now() - t0; sampling = false;
    const e = BF.historyOf(sess()), size = fs.statSync(TR).size;
    ok(warmed === true && e && e.steps.length === 301 && e.steps[0].idx === 0 && e.steps[300].idx === 300 && e.bytes === size && !e.capped && e.created.get(14) === SUBX,
      `the descriptor's warmTranscript reads the transcript ONCE, async, through the gate: 301 steps, ${size} B (≈ ${(size / 1048576).toFixed(2)} MB) in ${warmMs.toFixed(1)} ms — the sub step 14 created is named`, e && { steps: e.steps.length, bytes: e.bytes, capped: e.capped });
    ok(turnsWhilePending >= 3, `…and the loop ran through it: ${turnsWhilePending} loop turns while the warm was pending (awaited 512 KB reads + parse slices; measured longest gap ${maxGap.toFixed(1)} ms)`, turnsWhilePending);
    // THE SYMPTOM (the base reader): the history begins at the ring
    const plain = new AcpMessageManager('p13'); plain.convertHistory(new AcpSessionMessages(sess(), 'p13').raw());
    const userTexts = (mm) => mm.messages.filter((m) => m.role === 'user').map((m) => (m.content || []).map((b) => b.text || '').join(''));
    ok(userTexts(plain)[0] === 'question 55', 'RED (the measured symptom): the plain ACP reader\'s history begins at the ring (question 55 — nothing earlier)', userTexts(plain).slice(0, 2));
    const t1 = performance.now();
    const sm = new BF.AgySessionMessages(sess(), 'p13'), raw = sm.raw();
    const spliceMs = performance.now() - t1;
    const ringParsed = parseAcpBufferRecords(RING);
    ok(ringParsed.length === ringRecs.length, 'the ring\'s corrupt first half line is no record (parse drops it)', ringParsed.length);
    const pre = raw.length - ringParsed.length;
    ok(raw[0].kind === 'user' && raw[0].msgId === `${C}:0` && raw[0].content[0].text === 'question 0' && raw[0].ts === at(0) && sm.total === raw.length && pre > 0,
      `the antigravity reader's history starts at STEP 0 (+${pre} records before the ring, spliced in ${spliceMs.toFixed(1)} ms, no disk read): total = the whole conversation`, { first: raw[0], total: sm.total, pre });
    const mm = new AcpMessageManager('a13'); mm.convertHistory(raw);
    const users = userTexts(mm);
    ok(users.length === 75 && users[0] === 'question 0' && users[54] === 'question 55' && users[users.length - 1] === 'question 75' && new Set(users).size === 75,
      'the rendered conversation: 75 user turns in order 0..75 (the stop-time nudge never a bubble, the ring\'s own bubble of turn 55 not twice)', { n: users.length, first: users[0], at54: users[54], last: users[users.length - 1] });
    ok(!users.some((u) => u.includes('vibespace-context') || u.includes('vibespace-reminder')) && users[1] === 'question 1', 'a user bubble is what the person typed: the wrapper\'s task-context prefix stripped (turns 1, 6, 11 …)', users.slice(0, 3));
    const preRecs = raw.slice(0, pre);
    ok(!preRecs.some((r) => r.update && r.update.sessionUpdate === 'agent_thought_chunk') && preRecs.every((r) => !r.update || /^c0de0000-0000-4000-8000-00000000c0de:\d+$/.test(r.update.messageId || r.update.toolCallId)) && preRecs.every((r) => r.ts),
      'the steps drawn as the LIVE journal draws them: keys `<conversation>:<step>`, every record its step\'s time, no thought (the live journal has none)');
    const tool14 = preRecs.filter((r) => r.update && r.update.toolCallId === `${C}:14`);
    ok(tool14.length === 2 && tool14[0].update.title === 'invoke_subagent' && AS.unlinkedSpawns(raw).some((x) => x.toolCallId === `${C}:14` && x.step === 14),
      'a tool row sits at its GENERIC step (the stream\'s tool step): the invoke_subagent row before the ring is a spawn withCards links by the kept sub id', tool14.map((r) => r.update.sessionUpdate));
    const tool6 = preRecs.filter((r) => r.update && r.update.toolCallId === `${C}:6`);
    ok(tool6.length === 2 && tool6[0].update.rawInput.command === 'echo 1' && tool6[1].update.status === 'completed' && tool6[1].update.content[0].content.text.length <= 20001,
      'the tool row\'s input through THE arg normalizer (the store\'s JSON-encoded CommandLine → command), its output clipped at the live journal\'s 20 000', tool6[0]?.update?.rawInput);
    // the cut rules
    const msgFirst = ringRecs.slice(1); // the ring opens on step 221 (its bubble fell out)
    const r2 = AS.historySplice(msgFirst, e.steps, C);
    ok(r2.cut === 221 && r2.records[r2.prepended - 1].msgId === `${C}:220` && r2.records.filter((r) => r.kind === 'user' && r.content[0].text === 'question 55').length === 1,
      'a ring that opens mid-turn (no bubble before its first step): the steps up to it, incl. that turn\'s USER_INPUT, are drawn — the bubble once', { cut: r2.cut, prepended: r2.prepended });
    const whole = []; for (let t = 0; t <= 3; t++) whole.push(...ringOf(t));
    ok(AS.historySplice(whole, e.steps, C).prepended === 0 && AS.historySplice([], e.steps, C).prepended > 0 && AS.historySplice(ringRecs, e.steps, 'not-an-id').prepended === 0,
      'a ring that holds the conversation\'s start adds nothing; an EMPTY ring (a stopped conversation\'s view) is the transcript whole; a non-id adds nothing');
    ok(BF.historyOf(sess({ _accountId: 'agy-0123456789ab' })) === null && new BF.AgySessionMessages(sess({ _accountId: 'agy-0123456789ab' }), 'x').raw().length === ringParsed.length && BF.historyOf(sess({ backendSessionId: C2 })) === null,
      'another account\'s conversation / a conversation never warmed: the ring alone (no read, no other login\'s steps)');
    // the cache: a later warm reads only what agy APPENDED (a byte-identical rewrite of step 0 is NOT re-read); a shrunk file is read again
    const all = fs.readFileSync(TR, 'utf8');
    fs.writeFileSync(TR, all.replace('"question 0"', '"QUESTION 0"') + [301, 302, 303, 304].map((i) => JSON.stringify(stepLine(i))).join('\n') + '\n');
    await BF.warmHistory(C, { session: sess() });
    const e2 = BF.historyOf(sess());
    ok(e2.steps.length === 305 && e2.steps[0].content === 'question 0' && e2.bytes === fs.statSync(TR).size, 'a second warm reads only the appended lines (305 steps; step 0 as first read — the bytes before the old end are not read again)', { n: e2.steps.length, s0: e2.steps[0].content });
    fs.writeFileSync(TR, all.split('\n').slice(0, 100).join('\n') + '\n');
    await BF.warmHistory(C, { session: sess() });
    ok(BF.historyOf(sess()).steps.length === 100, 'a transcript that SHRANK is read again from the start (100 steps)', BF.historyOf(sess()).steps.length);
    // the budget
    const TR2 = path.join(H13, '.gemini', 'antigravity-cli', 'brain', C2, SG, 'logs', 'transcript.jsonl');
    fs.mkdirSync(path.dirname(TR2), { recursive: true }); fs.writeFileSync(TR2, all);
    await BF.warmHistory(C2, { session: sess({ backendSessionId: C2 }), maxBytes: 64 * 1024 });
    const e3 = BF.historyOf(sess({ backendSessionId: C2 }));
    ok(e3 && e3.capped && e3.bytes <= 64 * 1024 && e3.steps.length > 0 && e3.steps.length < 301, `BOUNDED: a read budget of 64 KB stops the read (${e3 && e3.steps.length} steps, ${e3 && e3.bytes} B, capped) — never the whole file`, e3 && { n: e3.steps.length, bytes: e3.bytes });
    ok(await BF.warmHistory(C, { remote: true }) === false && await BF.warmHistory('../x', {}) === false && await BF.warmHistory(C, { session: sess({ host: 'mac-1' }) }) === false, 'a remote / another machine\'s / a non-id conversation is never read here');
    let warmedN = 0;
    for (let i = 0; i < BF.HISTORY_CACHE_MAX + 3; i++) {
      const id = `c0de0000-0000-4000-8000-${String(i).padStart(12, '0')}`, f = path.join(H13, '.gemini', 'antigravity-cli', 'brain', id, SG, 'logs', 'transcript.jsonl');
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(stepLine(0)) + '\n');
      if (await BF.warmHistory(id, { session: sess({ backendSessionId: id }) })) warmedN++;
    }
    ok(warmedN === BF.HISTORY_CACHE_MAX + 3 && BF._historyCache.size === BF.HISTORY_CACHE_MAX, `the kept transcripts are bounded: ${warmedN} conversations warmed, ${BF._historyCache.size} kept (the oldest dropped)`);
    // B-299b (the history warm — MEASURED: 30 conversations warmed at once held the loop 608 ms, their 8 ms slices stacking in one loop
    // turn): ONE warm parses at a time across conversations. A clock that moves 10 ms a call makes every slice check due (each warm yields
    // every 64 lines); two warms asked at once parse ONE after the other; CONTROL a copy without the queue interleaves them
    const BSRC = fs.readFileSync(path.join(REPO, 'src/agy-backfill.js'), 'utf8');
    const BQ = mutantCopies('agy-warm-unqueued', REPO).load('src/agy-backfill.js', anchored(BSRC, '  const p = oneWarm(async () => {', /* stale-pins: kept — the control's PLANT (the warm unqueued), not a pin */ '  const p = (async (fn) => fn())(async () => {', 'the warm without its queue'), 'unqueued');
    const parsedOrder = async (B, tag) => {
      const ids = ['a', 'b'].map((k) => `c0de0000-0000-4000-8000-00000000${tag}${k}0`), seq = [];
      for (const [n, id] of ids.entries()) {
        const f = path.join(H13, '.gemini', 'antigravity-cli', 'brain', id, SG, 'logs', 'transcript.jsonl');
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, Array.from({ length: 640 }, (_, i) => JSON.stringify({ ...stepLine(4 * i + 1), step_index: i, content: `warm-${n} ${i}` })).join('\n') + '\n');
      }
      const realStep = AS.transcriptStepOf, realNow = Date.now; let clock = realNow();
      AS.transcriptStepOf = (line) => { seq.push(String(line).includes('"warm-0 ') ? 0 : 1); return realStep(line); };
      Date.now = () => (clock += 10);
      try { await Promise.all(ids.map((id) => B.warmHistory(id, { session: sess({ backendSessionId: id }) }))); } finally { AS.transcriptStepOf = realStep; Date.now = realNow; }
      let switches = 0; for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) switches++;
      return { lines: seq.length, switches };
    };
    const oneAt = await parsedOrder(BF, 'e1'), both = await parsedOrder(BQ, 'e2');
    ok(oneAt.lines === 1280 && oneAt.switches === 1 && both.lines === 1280 && both.switches > 1,
      'two conversations warmed at once: ONE warm parses at a time (1 280 lines, one hand-over from the first to the second, each slice its own loop turn); CONTROL a copy without the queue interleaves their slices', { queued: oneAt, unqueued: both });
    // 主开发 r839: the store's read has no deadline of its own — a warm whose read NEVER returns holds the queue's head at most WARM_HEAD_MS:
    // the next warm goes on, said ONCE; CONTROL a copy whose head is unbounded keeps the next one waiting
    const hangId = 'c0de0000-0000-4000-8000-00000000e3a0', nextId = 'c0de0000-0000-4000-8000-00000000e3b0';
    for (const id of [hangId, nextId]) { const f = path.join(H13, '.gemini', 'antigravity-cli', 'brain', id, SG, 'logs', 'transcript.jsonl'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(stepLine(0)) + '\n'); }
    const HANG = '    const reader = storeReader(home, { log });\n';
    const hung = (to) => anchored(BSRC, HANG, `    const reader = id === '${hangId}' ? { linesFrom: () => new Promise(() => { }) } : storeReader(home, { log });\n`, 'a read that never returns' + to);
    const BH = mutantCopies('agy-warm-hang', REPO).load('src/agy-backfill.js', hung(''), 'hang');
    const BU = mutantCopies('agy-warm-hang-unbounded', REPO).load('src/agy-backfill.js', anchored(hung(' (unbounded)'), '      release();\n    }, WARM_HEAD_MS);', /* stale-pins: kept — the control's PLANT (the head unbounded), not a pin */ '    }, WARM_HEAD_MS);', 'the head unbounded'), 'hangunbounded');
    const behindHang = async (B) => {
      B._setWarmHeadMsForTest(50);
      const said = [], realWarn = console.warn; console.warn = (...x) => said.push(x.join(' '));
      try {
        B.warmHistory(hangId, { session: sess({ backendSessionId: hangId }) }); // never settles
        const next = B.warmHistory(nextId, { session: sess({ backendSessionId: nextId }) });
        const won = await Promise.race([next.then(() => 'next'), new Promise((r) => setTimeout(() => r('still waiting'), 400))]);
        B.warmHistory('c0de0000-0000-4000-8000-00000000e3c0', { session: sess({ backendSessionId: 'c0de0000-0000-4000-8000-00000000e3c0' }) });
        await new Promise((r) => setTimeout(r, 120));
        return { won, said: said.filter((m) => /history warm has not settled/.test(m)).length };
      } finally { console.warn = realWarn; }
    };
    const bounded = await behindHang(BH), unbounded = await behindHang(BU);
    ok(bounded.won === 'next' && bounded.said === 1 && unbounded.won === 'still waiting',
      'a warm whose store read never returns holds the queue\'s head 50 ms at most here (10 s on the hub): the next warm goes on, said ONCE; CONTROL a copy with the head unbounded keeps the next one waiting', { bounded, unbounded });
  } finally { process.env.HOME = preHome; }
  // the base ACP reader is UNCHANGED (only agy has a transcript)
  ok(!/historySplice|warmHistory|transcript/.test(fs.readFileSync(path.join(REPO, 'src/acp-message-manager.js'), 'utf8').split('class AcpSessionMessages')[1].split('\nAcpMessageManager._seen')[0]), 'the base AcpSessionMessages is unchanged (no transcript read — the backfill lives in the agy subclass)');
  ok(!/openSync|readdirSync|readFileSync/.test(fs.readFileSync(path.join(REPO, 'src/agy-backfill.js'), 'utf8')), 'the backfill reads through the ONE gate (agy-store-fs linesFrom), never fs itself');
  // THE RING CUT (acp-events): the live buffer's 800 000-byte bound starts on a whole line
  const evSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/acp-events.js'), 'utf8');
  const feedRing = (mod) => {
    const s = { backend: 'antigravity', buffer: '' }; let onData;
    mod.create({ engine: { noteTurnEnd() { } } }).attach(s, 'r13', { onData: (cb) => { onData = cb; } }, { feedLive() { }, broadcastToSession() { }, broadcastActiveSessions() { }, readSessionMeta: () => null, writeSessionMeta() { }, updateSessionTodos() { } });
    let txt = ''; for (let i = 0; txt.length < 1400000; i++) txt += JSON.stringify({ ts: at(i), type: 'acp', kind: 'notice', level: 'info', text: `line ${i} ` + 'y'.repeat(300 + (i % 97)), noticeKind: 'test' }) + '\n';
    for (let o = 0; o < txt.length; o += 65521) onData(txt.slice(o, o + 65521)); // chunks that never align with a line
    const lines13 = s.buffer.split('\n').filter(Boolean);
    return { len: s.buffer.length, bad: lines13.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } }).length, n: lines13.length };
  };
  const good = feedRing(require(path.join(REPO, 'src/server/stdout/acp-events.js')));
  ok(good.bad === 0 && good.len <= 1200000 && good.n > 100, `acp-events: after > 1.2 MB of journal the live buffer starts on a WHOLE line — ${good.n} lines, 0 corrupt`, good);
  const cutLine = "if (session.buffer.length > 1200000) { const cut = session.buffer.indexOf('\\n', session.buffer.length - 800000); session.buffer = cut >= 0 ? session.buffer.slice(cut + 1) : ''; }";
  ok(evSrc.includes(cutLine), 'control anchor: the newline-aligned cut is in acp-events');
  const bad = feedRing(MUTH.load('src/server/stdout/acp-events.js', evSrc.replace(cutLine, 'if (session.buffer.length > 1200000) session.buffer = session.buffer.slice(-800000);'), 'halfline'));
  ok(bad.bad === 1, 'CONTROL: the byte cut (the pre-fix slice) leaves ONE corrupt half record as the buffer\'s first line', bad);
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
