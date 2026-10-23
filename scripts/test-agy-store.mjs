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
import { scratchDir } from './scratch.mjs';
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
  ok(['db', 'subagents', 'messages', 'transcript', 'transcriptFull'].every((k) => AS.storeReadable(pp[k])) && AS.storeReadable(`${AS.storePaths(P).messages}/c0000000-0000-4000-8000-0000000000c4.json`),
    'the store\'s own shapes are readable (db, subagents/ + messages/ dirs and files, both transcripts)', pp);
  const refused = [AS.TOKEN_FILE, `./${AS.TOKEN_FILE}`, `brain/${S}/${SG}/messages/${AS.TOKEN_FILE}.json`, `brain/${S}/${SG}/logs/../../../${AS.TOKEN_FILE}`, `brain/${S}/${SG}/logs/../logs/transcript.jsonl`, 'settings.json', 'conversation_summaries.db', `brain/${S}/report.md`, `conversations/not-an-id.db`, '', null];
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
  const cases = [['a store that does not know the sub', { _accountId: 'agy-00000000ffff' }], ['another machine\'s conversation', { host: 'm1' }], ['an account id that is not one', { _accountId: '../x' }]];
  fs.mkdirSync(path.join(DATA, 'agy-subs', 'agy-00000000ffff', '.gemini', 'antigravity-cli'), { recursive: true });
  ok(cases.every(([, o]) => new BF.AgySessionMessages(sess(o), 'p', { buffersDir: BUFS }).raw().length === jrecs.length) && BF.homeOf(sess({ _accountId: 'agy-0000000000ee' }), { dataDir: DATA }) === null && BF.homeOf(sess({ _accountId: null }), { dataDir: DATA }) === require('node:os').homedir(),
    'unchanged (no card, no error): ' + cases.map((c) => c[0]).join(' / ') + '; a named account whose root is gone reads NO store (never the machine login\'s); no account = the machine\'s own login');
  // THE TURN END of a conversation an OLD wrapper still serves
  const t0 = Date.parse('2026-10-21T14:32:31.950Z');
  const s2 = sess(); s2._agyCards = new Map(); s2._agyCards.dataDir = DATA;   // what the first rebuild records (no rebuild yet here)
  ok(BF.afterTurn(s2, { now: t0 + 30000 }).length === 0, 'turn end, the row 30 s old: NOTHING (the new wrapper\'s own look is 60 s — never two writers of one card)');
  const late = BF.afterTurn(s2, { now: t0 + 61000 });
  ok(late.length === 14 && late[0].kind === 'subagent' && late[0].status === 'completed' && late.slice(1).every((r) => r.kind === 'sub' && r.subId === S), '61 s: the card + its 13 sub steps, once', late.map((r) => r.kind));
  ok(BF.afterTurn(s2, { now: t0 + 120000 }).length === 0, '…and never again (a finished sub is not read twice)');
  const home3 = path.join(ROOT, 'h3'), w = mkStore(home3, { lines: 5, answered: false });
  const s3 = sess({ _accountId: null }); s3._agyCards = new Map();
  const pre = process.env.HOME; process.env.HOME = home3;
  let a3, b3, c3;
  try {
    a3 = BF.afterTurn(s3, { now: t0 + 61000 });
    fs.appendFileSync(w.t, w.rest.join('\n') + '\n');
    fs.copyFileSync(path.join(FIX, 'answer.json'), path.join(w.store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
    b3 = BF.afterTurn(s3, { now: t0 + 63000 });
    c3 = BF.afterTurn(s3, { now: t0 + 67000 });
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
  onData(JOURNAL);
  const cardFrame = frames.find((f) => f.type === 'msg' && ((f.op === 'edit' && f.fields?.taskInfo?.subId === S) || (f.op === 'create' && f.message?.taskInfo?.subId === S)));
  const subFrames = frames.filter((f) => f.type === 'subagent-message' && f.subId === S);
  ok(!!cardFrame && subFrames.length === 13 && s4.subagentBuffers?.get(S)?.length === 13, 'acp-events at the old wrapper\'s prompt_end: THE CARD frame + 13 subagent-message frames (the sub-<id> viewer\'s live feed)', { card: !!cardFrame, subs: subFrames.length });
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
  try { const out = withCards({ _accountId: null, host: 'local' }, journal, { dataDir: path.join(home, 'data') }); cards = out.filter((r) => r.kind === 'subagent'); }
  finally { process.env.HOME = preHome; }
  ok(cards.length === 2 && cards.map((c) => c.subId).sort().join() === [SA, SB].sort().join() && cards.every((c) => c.status === 'stopped'),
    'withCards: the history gets BOTH subs’ cards (A-L and N-Z), each stopped — never one card for two subs', cards.map((c) => c.subId));
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
