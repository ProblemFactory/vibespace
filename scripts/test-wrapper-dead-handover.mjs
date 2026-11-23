#!/usr/bin/env node
// A HANDED FRAME's RECORD BY ITS CONVERSATION, DRAWN BY THE HISTORY READ (row B-5a4d, its root — 主开发 r3160's unit 1; the roads page
// /var/tmp/vibespace-lanes/bl-keys-misc/b5a4d/roads-page.md). A frame the person handed to a running turn whose CLI then died was lost in
// silence: every road to a next wrapper mints a new hub id, the exit teardown removes that id's files, and the stopped conversation's
// view reads the transcript alone. Now data/bin/chat-wrapper.js keeps each handed frame's record in <buffers>/handed/<conversation id>.json
// (0600; the id the CLI resumes by, moved at its init), settles it at its CLI's exit (that child's exit is the proof of «gone»), and the
// hub's history read (src/session-store.js through src/handed-records.js) draws «Not delivered» — or «Not confirmed» when no word came.
// FAST: the REAL wrapper over the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs), the tree's REAL teardown function
// (src/server/wrapper-files.js removeWrapperFiles — what src/server/session-stdout.js's exit teardown calls) and the REAL reader
// (src/session-store.js SessionMessages + src/message-manager.js), under a scratch home. Every scene is RED on the tip before this unit.
//   ① THE DYING WRAPPER: a frame handed while a tool runs; the CLI is killed — the wrapper settles it 'undelivered' at the exit (the word on
//      stdout, the record in handed/<C>.json, 0600); a frame the transcript shows taken in settles 'landed'
//   ② THE EXIT TEARDOWN removes the wrapper's files — the conversation's record stays (it is no wrapper file kind)
//   ③ THE STOPPED VIEW (buffer '', by the conversation's id) draws «Not delivered» with the words; RED: a wrapper copy that names its
//      record by the hub's id (the tip before this unit) — the view draws nothing
//   ④ A RESUME UNDER A NEW HUB ID: the new live session's history draws it too; the new wrapper's start writes nothing over it
//   ⑤ THE ID MOVES: a resume whose CLI announces another id — the records go to that id's file, a dead wrapper's records under the earlier
//      id travel with them; the view finds them by the current id
//   ⑥ A WRAPPER KILLED BEFORE IT COULD SETTLE: its record stays handed — the stopped view says «Not confirmed», never nothing
//   ⑦ TWO WRITERS: another writer's records in the file are kept (the merge by the record's own id; states only move forward)
//   ⑧ THE DRAWER's READ: four replies — none, ok, refused (a folder), torn — a refused or torn file draws nothing, said once
//   ⑨ A LIVE wrapper's frame in flight is never drawn «Not confirmed»; the page's words and chips (en / zh / ja), the chip table
import { stopWrapper, anchored } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 700)}`); } }
const WD = armWatchdog({ capMs: 45e3 });
const J = JSON.stringify;
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dead-handover-'));
const HOME = path.join(BASE, 'home'); fs.mkdirSync(path.join(HOME, '.claude', 'projects'), { recursive: true });
process.env.HOME = HOME;   // the reader's transcripts live here — never the machine's own home
const CFG = path.join(HOME, '.claude');
process.on('exit', () => { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { } });
const WRAPPER = path.join(ROOT, 'data/bin/chat-wrapper.js');
const STAND_IN = path.join(ROOT, 'scripts/fixtures/claude-stand-in-cli.cjs');
const SS = require(path.join(ROOT, 'src/session-store.js'));
const HANDED = require(path.join(ROOT, 'src/handed-records.js'));
const WF = require(path.join(ROOT, 'src/server/wrapper-files.js'));
const { MessageManager } = require(path.join(ROOT, 'src/message-manager.js'));
const { ClaudeCodeAdapter } = require(path.join(ROOT, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
const M = mutantCopies('dead-handover', ROOT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(10); } return fn(); };

// ── a conversation: its working folder, its transcript, its buffers folder (the hub's BUFFERS_DIR) ──
let k = 0;
const uuid = (n) => '33333333-0000-4000-8000-' + String(n).padStart(12, '0');
function conversation(tag, { conv = uuid(++k), transcript = null } = {}) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(BASE, 'cwd-' + tag + '-')));
  const proj = path.join(CFG, 'projects', SS.cwdToProjectDir(cwd)); fs.mkdirSync(proj, { recursive: true });
  const buffers = fs.mkdtempSync(path.join(BASE, 'buffers-' + tag + '-'));
  const c = { cwd, conv, proj, buffers, tfile: (id = conv) => path.join(proj, id + '.jsonl') };
  writeTranscript(c, conv, transcript || [{ type: 'user', uuid: uuid(900 + k), timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: 'start the long task' } }]);
  return c;
}
function writeTranscript(c, id, recs) { fs.writeFileSync(c.tfile(id), recs.map((r) => J({ sessionId: id, cwd: c.cwd, ...r })).join('\n') + '\n'); }
const recordsOf = (c, id = c.conv) => { try { return new Map(JSON.parse(fs.readFileSync(HANDED.fileOf(c.buffers, id), 'utf8')).frames.map((r) => [r.msgId, r])); } catch { return new Map(); } };
/** the REAL wrapper as the hub starts a resumed claude conversation (a NEW hub id each time): `--resume <conv>` (+ extra argv) */
function startWrapper(c, hubId, { wrapper = WRAPPER, extra = [] } = {}) {
  const buf = path.join(c.buffers, hubId + '.buf'), meta = path.join(c.buffers, hubId + '.json');
  const child = spawn(process.execPath, [wrapper, buf, meta, process.execPath, STAND_IN, '--resume', c.conv, ...extra], { cwd: c.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HOME, CLAUDE_CONFIG_DIR: CFG, VIBESPACE_SKIP_AGENT_HOOKS: '1', STAND_IN_LONG_MS: '60000' } });
  const out = []; let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { out.push(JSON.parse(l)); } catch { } } });
  const exited = new Promise((r) => child.once('exit', r));
  const log = () => { try { return fs.readFileSync(path.join(c.buffers, 'chat-wrapper.log'), 'utf8'); } catch { return ''; } };
  const sidecar = () => { try { return JSON.parse(fs.readFileSync(meta, 'utf8')); } catch { return {}; } };
  return { child, out, exited, log, sidecar, buf, hubId };
}
/** hand a frame to a running turn (a tool that runs on), as the person's Enter does → the frame's msgId */
async function handOne(w, msgId, words) {
  w.child.stdin.write(ad.formatChatInput('TOOL-A run a slow command', 'm-tool-' + msgId).stdinPayload + '\n');
  await until(() => w.out.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')));
  w.child.stdin.write(ad.formatChatInput(words, msgId, { steer: true }).stdinPayload + '\n');
  return until(() => w.out.some((r) => r.type === 'input_handover' && r.state === 'handed' && (r.msg_ids || []).includes(msgId)), 4000);
}
const killCli = (w) => { const pid = Number(w.sidecar().childPid); if (pid > 1) { try { process.kill(pid, 'SIGKILL'); } catch { } } return pid; };
const words = (id) => 'the words of ' + id;
/** THE STOPPED VIEW: the reader the view-only attach builds (buffer '', the conversation's ids), after the warm the transcript's warm makes */
async function stoppedView(c, ids = [c.conv], extra = {}) {
  await SS.warmSessionJsonlAsync(ids[0], c.cwd, { handedDir: c.buffers });   // THE STORE's OWN WARM (unit 2: the production road, not the module's)
  if (ids.length > 1) await HANDED.warm(ids.slice(1), { dir: c.buffers });
  const sm = new SS.SessionMessages({ backendSessionId: ids[0], claudeSessionId: ids[0], cwd: c.cwd, buffer: '', ...(ids.length > 1 ? { forkedFrom: ids.slice(1) } : {}), ...extra }, 'view', { buffersDir: c.buffers });
  const mm = new MessageManager('dead-handover-suite'); mm.convertHistory(sm.raw());
  return mm;
}
const bubbleOf = (mm, id) => { const b = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === id); return b ? { chip: b.queueState || null, words: JSON.stringify(b.content).includes(words(id)), index: mm.messages.indexOf(b), of: mm.messages.length } : null; };

// RED: the tip before this unit names the record by the HUB's id (a file no later reader looks for)
const CW_SRC = fs.readFileSync(WRAPPER, 'utf8');
const NAME = "const recordsName = () => convId || (HUB_ID ? 'hub-' + HUB_ID : '');";
const ctl = fs.mkdtempSync(path.join(BASE, 'ctl-'));
fs.mkdirSync(path.join(ctl, 'data', 'bin'), { recursive: true }); fs.symlinkSync(path.join(ROOT, 'src'), path.join(ctl, 'src'));
fs.writeFileSync(path.join(ctl, 'data', 'bin', 'chat-wrapper.js'), CW_SRC.split(NAME).join("const recordsName = () => (HUB_ID ? 'hub-' + HUB_ID : '');   // MUTANT: named by the hub's id"));
const R_HUBID = path.join(ctl, 'data', 'bin', 'chat-wrapper.js');

/** ONE SCENE: a conversation, a frame handed under hub id A, its CLI killed, the wrapper's own exit, the REAL teardown of A */
async function dies(tag, { wrapper = WRAPPER, takenIn = false } = {}) {
  const c = conversation(tag);
  const w = startWrapper(c, 'sess-1-' + tag, { wrapper });
  const MS = 'msg-' + tag;
  const handed = await handOne(w, MS, words(MS));
  const stampOf = () => { try { return JSON.parse(fs.readFileSync(w.buf, 'utf8').split('\n').filter((l) => l.includes('"webui_copy":true') && l.includes(MS)).pop() || '{}').cliUuid || null; } catch { return null; } };
  await until(() => !!stampOf(), 3000);
  if (takenIn) writeTranscript(c, c.conv, [{ type: 'user', uuid: uuid(800), timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: 'start the long task' } },
    { type: 'attachment', uuid: uuid(801), timestamp: new Date().toISOString(), attachment: { type: 'queued_command', prompt: words(MS), source_uuid: stampOf() } }]);
  const cli = killCli(w);
  await Promise.race([w.exited, sleep(8000)]);
  const before = { buf: fs.existsSync(w.buf), meta: fs.existsSync(path.join(c.buffers, w.hubId + '.json')) };
  WF.removeWrapperFiles(c.buffers, w.hubId);   // THE HUB's EXIT TEARDOWN (src/server/session-stdout.js:428 calls exactly this)
  await until(() => !fs.existsSync(w.buf), 3000);   // by order: the buffer gone (its other kinds go off the loop)
  return { c, w, MS, handed, cli, before, after: { buf: fs.existsSync(w.buf), handedDir: fs.existsSync(path.join(c.buffers, 'handed')) }, exited: w.child.exitCode !== null || w.child.signalCode !== null };
}

const [S1, S1t, S1r] = await Promise.all([dies('lost'), dies('taken', { takenIn: true }), dies('red', { wrapper: R_HUBID })]);

say('① THE DYING WRAPPER settles what it handed to the CLI that died');
WD.section('①');
const said1 = S1.w.out.filter((r) => r.type === 'input_handover' && r.via === 'exit');
const rec1 = recordsOf(S1.c).get(S1.MS);
const mode1 = (() => { try { return (fs.statSync(HANDED.fileOf(S1.c.buffers, S1.c.conv)).mode & 0o777).toString(8); } catch { return null; } })();
ok(S1.handed && S1.exited && J(said1.map((r) => [r.state, r.msg_ids])) === J([['undelivered', [S1.MS]]]) && rec1?.state === 'undelivered' && rec1?.cli?.pid === S1.cli && mode1 === '600',
  `a frame handed while a tool ran, its CLI killed: the wrapper settled it at the exit — «undelivered» said on stdout, its record in handed/<conversation>.json (mode ${mode1}) names the CLI it was handed to`, { said: said1, rec: rec1 && { state: rec1.state, cli: rec1.cli }, log: S1.w.log().split('\n').filter((l) => /handed at the CLI/.test(l)) });
const said1t = S1t.w.out.filter((r) => r.type === 'input_handover' && r.via === 'exit');
ok(J(said1t.map((r) => [r.state, r.msg_ids])) === J([['landed', [S1t.MS]]]) && recordsOf(S1t.c).get(S1t.MS)?.state === 'landed',
  'a frame the transcript shows taken in (a queued_command naming its stamp) is settled «landed» — by the CLI\'s own field', { said: said1t });

say('② THE EXIT TEARDOWN removes the wrapper\'s files — the conversation\'s record stays');
WD.section('②');
const STDOUT_SRC = fs.readFileSync(path.join(ROOT, 'src/server/session-stdout.js'), 'utf8');
ok(S1.before.buf && !S1.after.buf && S1.after.handedDir && !!rec1 && !WF.WRAPPER_FILE_KINDS.includes('handed') && STDOUT_SRC.includes("require('./wrapper-files.js').removeWrapperFiles(BUFFERS_DIR, id);"),
  'the teardown (the tree\'s own removeWrapperFiles, what session-stdout\'s exit calls) took the buffer — the record under handed/ is no wrapper file kind and survived', { before: S1.before, after: S1.after });

say('③ THE STOPPED VIEW — the first place the person looks');
WD.section('③');
const v1 = bubbleOf(await stoppedView(S1.c), S1.MS);
const v1r = bubbleOf(await stoppedView(S1r.c), S1r.MS);
ok(!!v1 && v1.chip === 'undelivered' && v1.words && v1.index === v1.of - 1 && !v1r && fs.existsSync(path.join(S1r.c.buffers, 'handed', 'hub-sess-1-red.json')),
  `the read-only view (buffer '', by the conversation's id) draws the message with «Not delivered» and its words, at its send time — RED: a wrapper that names its record by the hub's id draws ${v1r ? 'a bubble' : 'NOTHING'} (its file sits under the hub id no reader looks for)`, { v1, v1r });

say('④ A RESUME UNDER A NEW HUB ID');
WD.section('④');
const w2 = startWrapper(S1.c, 'sess-2-lost');
await until(() => w2.out.some((r) => r.type === 'queue_changed'));
const live = await (async () => {
  await HANDED.warm([S1.c.conv], { dir: S1.c.buffers });
  const ring = (() => { try { return fs.readFileSync(w2.buf, 'utf8'); } catch { return ''; } })();
  const sm = new SS.SessionMessages({ backendSessionId: S1.c.conv, claudeSessionId: S1.c.conv, cwd: S1.c.cwd, buffer: ring, pty: {}, createdAt: Date.now() - 50 }, 'sess-2-lost', { buffersDir: S1.c.buffers });
  const mm = new MessageManager('dead-handover-suite'); mm.convertHistory(sm.raw()); return bubbleOf(mm, S1.MS);
})();
await stopWrapper(w2.child);
ok(!!live && live.chip === 'undelivered' && live.words && recordsOf(S1.c).get(S1.MS)?.state === 'undelivered',
  'a Resume under a NEW hub id: the new live session\'s history draws «Not delivered» too — and the new wrapper\'s start wrote nothing over the record', { live });

say('⑤ THE ID MOVES — a resume whose CLI announces another id');
WD.section('⑤');
{
  const c = conversation('moves');
  const C1 = uuid(700);
  const dead = { msgId: 'msg-dead-earlier', cliUuid: uuid(701), copy: J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: words('msg-dead-earlier') }] }, msgId: 'msg-dead-earlier', cliUuid: uuid(701), _fromWebui: true, webui_copy: true, timestamp: new Date(Date.now() - 30000).toISOString() }), cli: { pid: 1, start: 'l1', boot: '' }, state: 'undelivered', at: Date.now() - 30000, settledAt: Date.now() - 29000, via: 'exit' };
  fs.mkdirSync(path.join(c.buffers, 'handed'), { recursive: true }); fs.writeFileSync(HANDED.fileOf(c.buffers, c.conv), J({ v: 1, frames: [dead] }));
  writeTranscript(c, C1, [{ type: 'user', uuid: uuid(702), timestamp: new Date(Date.now() - 20000).toISOString(), message: { role: 'user', content: 'resumed' } }]);
  const w = startWrapper(c, 'sess-5-moves', { extra: ['--session-id', C1] });   // the stand-in announces C1, the resume named c.conv
  await handOne(w, 'msg-after-move', words('msg-after-move'));
  await until(() => recordsOf(c, C1).has('msg-after-move'), 3000);
  await stopWrapper(w.child);
  const moved = recordsOf(c, C1);
  const view = await stoppedView(c, [C1]);
  ok(moved.has('msg-after-move') && moved.get('msg-dead-earlier')?.state === 'undelivered' && bubbleOf(view, 'msg-dead-earlier')?.chip === 'undelivered',
    'the records go to the announced id\'s file; a dead wrapper\'s record under the earlier id travels with them, and the view by the CURRENT id draws it', { ids: [...moved.keys()] });
}

say('⑥ A WRAPPER KILLED BEFORE IT COULD SETTLE');
WD.section('⑥');
{
  const c = conversation('killed');
  const w = startWrapper(c, 'sess-6-killed');
  await handOne(w, 'msg-killed', words('msg-killed'));
  const cli = Number(w.sidecar().childPid);
  try { w.child.kill('SIGKILL'); } catch { }
  await Promise.race([w.exited, sleep(4000)]);
  if (cli > 1) { try { process.kill(cli, 'SIGKILL'); } catch { } }   // its orphaned CLI (this suite's own process tree)
  WF.removeWrapperFiles(c.buffers, w.hubId);
  const v = bubbleOf(await stoppedView(c), 'msg-killed');
  ok(recordsOf(c).get('msg-killed')?.state === 'handed' && !!v && v.chip === 'unconfirmed' && v.words,
    `the wrapper was killed with no word: its record stays handed and the stopped view says «Not confirmed» with the words — never nothing`, { v });
}

say('⑦ TWO WRITERS — another writer\'s records are kept');
WD.section('⑦');
{
  const c = conversation('two');
  const other = { msgId: 'msg-other-writer', cliUuid: uuid(601), copy: J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: words('msg-other-writer') }] }, msgId: 'msg-other-writer', cliUuid: uuid(601), _fromWebui: true, webui_copy: true, timestamp: new Date().toISOString() }), cli: null, state: 'undelivered', at: Date.now() - 5000, settledAt: Date.now() - 4000, via: 'exit' };
  fs.mkdirSync(path.join(c.buffers, 'handed'), { recursive: true }); fs.writeFileSync(HANDED.fileOf(c.buffers, c.conv), J({ v: 1, frames: [other] }));
  const w = startWrapper(c, 'sess-7-two');
  await handOne(w, 'msg-mine', words('msg-mine'));
  await until(() => recordsOf(c).has('msg-mine'), 3000);
  await stopWrapper(w.child);
  const r = recordsOf(c);
  ok(r.get('msg-other-writer')?.state === 'undelivered' && r.has('msg-mine'), 'each write reads the file and merges by the record\'s own id: the other writer\'s record kept beside mine', { ids: [...r.keys()] });
}

say('⑧ THE DRAWER\'s READ — four replies');
WD.section('⑧');
{
  const dir = fs.mkdtempSync(path.join(BASE, 'replies-'));
  fs.mkdirSync(path.join(dir, 'handed', 'conv-folder.json'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'handed', 'conv-torn.json'), '{"v":1,"frames":[{"msgId":"x","co');
  const warned = []; const was = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  const got = await HANDED.warm(['conv-none', 'conv-folder', 'conv-torn'], { dir });
  await HANDED.warm(['conv-folder', 'conv-torn'], { dir });
  console.warn = was;
  const kinds = Object.fromEntries(got.map((g) => [g.id, g.kind]));
  ok(kinds['conv-none'] === 'none' && kinds['conv-folder'] === 'refused' && kinds['conv-torn'] === 'torn' && HANDED.recordsFor(['conv-folder', 'conv-torn'], { dir }).size === 0 && warned.filter((w) => w.includes('conv-folder')).length === 1 && warned.filter((w) => w.includes('conv-torn')).length === 1,
    `none · refused (a folder) · torn — a refused or torn file draws nothing and is said ONCE (${J(kinds)})`, { warned });
}

say('⑨ A LIVE wrapper\'s frame in flight; the page');
WD.section('⑨');
{
  const rec = (state, at) => new Map([['m', { msgId: 'm', copy: J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'x' }] }, msgId: 'm', _fromWebui: true, webui_copy: true, timestamp: new Date(at).toISOString() }), state, at }]]);
  const now = Date.now();
  ok(HANDED.drawnFor(rec('handed', now), { liveSince: now - 1000 }).length === 0 && HANDED.drawnFor(rec('handed', now - 5000), { liveSince: now - 1000 })[0]?.rec.unconfirmed === true && HANDED.drawnFor(rec('landed', now - 5000)).length === 0,
    'a frame the LIVE wrapper handed (at or after its start) is never drawn «Not confirmed»; one a dead wrapper left is; a finished one is not drawn');
  const QC = require(path.join(ROOT, 'src/queue-chips.js'));
  const CT = require(path.join(ROOT, 'src/channel-touch.js'));
  const CR = fs.readFileSync(path.join(ROOT, 'src/lib/chat-renderers.js'), 'utf8'), ZH = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  const TIPS = { undelivered: 'The conversation ended before the agent read this message — send it again', unconfirmed: 'The conversation ended while this message was being handed to the agent — it may not have reached it' };
  ok(['undelivered', 'unconfirmed'].every((s) => QC.QUEUE_CHIPS[s] && QC.QUEUE_CHIPS[s].inTurn === true && QC.QUEUE_CHIPS[s].place === 'here' && CT.opensTurn({ role: 'user', content: [{ type: 'text', text: 'x' }], turnIndex: 1, queueState: s }, { turnIndex: 0 }) === false)
    && CR.includes("state === 'undelivered' ? t('Not delivered')") && CR.includes("state === 'unconfirmed' ? t('Not confirmed')") && Object.values(TIPS).every((t) => CR.includes(`t('${t}')`) && ZH.includes(`"${t}": "`) && JA.includes(`"${t}": "`)) && ZH.includes('"Not delivered": "未送达"') && ZH.includes('"Not confirmed": "未确认"') && JA.includes('"Not delivered": "未配信"') && JA.includes('"Not confirmed": "未確認"'),
    'THE PAGE: «Not delivered» and «Not confirmed» are chips in the turn (no turn of their own), drawn in place, with their words in en / zh / ja — nothing of Stop or the input box');
}


// ══ UNIT 2 (r3200): the next wrapper's judge, the fork, the store's own lines, the bounds, the wrapper's writes ══
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
const sleepers = [];
process.on('exit', () => { for (const c of sleepers) { try { c.kill('SIGKILL'); } catch { } } });
/** a process that WAS the CLI a frame was handed to: its identity, then it ends (or `alive`: it runs on) */
async function cliOf({ alive = false } = {}) {
  const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); sleepers.push(c);
  await until(() => !!PI.startToken(c.pid), 3000);
  const id = { pid: c.pid, start: PI.startToken(c.pid), boot: PI.bootToken() };
  if (!alive) { const gone = new Promise((res) => c.once('exit', res)); c.kill('SIGKILL'); await gone; }
  return id;
}
const stampOf = (id) => '00000000-0000-4000-8000-' + Buffer.from(id).toString('hex').padEnd(12, '0').slice(0, 12);
const copyLine = (id, text = words(id), at = Date.now() - 30000) => J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, msgId: id, cliUuid: stampOf(id), _fromWebui: true, webui_copy: true, timestamp: new Date(at).toISOString() });
const recordOf = (id, cli, o = {}) => ({ msgId: id, cliUuid: stampOf(id), copy: o.copy !== undefined ? o.copy : copyLine(id, o.text, o.at), cli, state: o.state || 'handed', at: o.at || Date.now() - 30000, settledAt: o.settledAt || 0, via: 'enter' });
const place = (c, recs, id = c.conv) => { fs.mkdirSync(path.join(c.buffers, 'handed'), { recursive: true }); fs.writeFileSync(HANDED.fileOf(c.buffers, id), J({ v: 1, frames: recs })); };
const logHas = (w, re) => re.test(w.log());
/** RED copies of the wrapper: each its own folder, src/ linked; → { path, counts } (each edit through anchored(): a moved anchor throws by name) */
const redWrapper = (tag, edits) => {
  let s = CW_SRC; const counts = [];
  for (const [a, b] of edits) { s = anchored(s, a, b, 'the wrapper RED ' + tag); counts.push(1); }   // a moved anchor THROWS by the control's name
  const d = fs.mkdtempSync(path.join(BASE, 'ctl2-' + tag + '-')); fs.mkdirSync(path.join(d, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'src'), path.join(d, 'src')); fs.writeFileSync(path.join(d, 'data', 'bin', 'chat-wrapper.js'), s);
  return { path: path.join(d, 'data', 'bin', 'chat-wrapper.js'), counts };
};
const SS_SRC = fs.readFileSync(path.join(ROOT, 'src/session-store.js'), 'utf8');
const ssRed = (tag, from, to) => ({ n: 1, SS: require(M.write('src/session-store.js', anchored(SS_SRC, from, to, 'the store RED ' + tag), tag)) });   // a moved anchor THROWS by name
const R_SKIPID = redWrapper('skipid', [["    if (v === 'gone' || v === 'pid-recycled' || v === 'zombie') gone.push(r); else if (v === 'same') alive.push(r); else unknown.push(r);", '    gone.push(r);   // MUTANT: no identity judged']]);
const R_NOWINDOW = redWrapper('nowindow', [['        else if (from === 0 || (first !== null && d.at && first < d.at)) lost.push(d.msgId);', '        else if (true) lost.push(d.msgId);   // MUTANT: absence never proven']]);
const R_NOMERGE = redWrapper('nomerge', [['  const all = mergeRecords(new Map(got.kind === \'ok\' ? got.map : []), HR);', '  const all = new Map(HR);   // MUTANT: the file is not read into the write']]);
const R_ANYRANK = redWrapper('anyrank', [['function mergeRecords(into, from) { for (const [id, r] of from) { const was = into.get(id); if (!was || rankOf(r) > rankOf(was)) into.set(id, r); } return into; }', 'function mergeRecords(into, from) { for (const [id, r] of from) into.set(id, r); return into; }   // MUTANT: the later one wins']]);
const R_WRITEOVER = redWrapper('writeover', [["  if (got.kind === 'refused') { sayOnce('refused:' + file, `${path.basename(file)} could not be read (${got.why}) — nothing is written over it`); return false; }", "  if (false) { }   // MUTANT: a refused read written over"]]);
const RED_LIVE = ssRed('nolive', '{ liveSince: session.pty || session.socketPath ? Number(session.createdAt) || 0 : 0 }', '{ liveSince: 0 }');
const RED_FIRST = ssRed('nofirst', '    drawn = drawn.filter((d) => !(d.rec && typeof d.rec.cliUuid === \'string\' && recorded.has(d.rec.cliUuid)));\n', '');
const RED_FORK = ssRed('forkchain', 'session.forkedFrom.filter((x) => x && x !== forkSource)', 'session.forkedFrom');
const RED_WARM = ssRed('nowarm', 'HANDED.warm([claudeSessionId], opts && opts.handedDir ? { dir: opts.handedDir } : {}).catch(() => null)', 'Promise.resolve(null)');
/** a reader built as the attach builds it (`SSmod` = this tree's store or a RED copy), after the store's OWN warm of the transcript */
async function readerOf(c, session, { SSmod = SS, ids = [session.backendSessionId] } = {}) {
  await SSmod.warmSessionJsonlAsync(ids[0], c.cwd, { handedDir: c.buffers });
  if (ids.length > 1) await HANDED.warm(ids.slice(1), { dir: c.buffers });
  const sm = new SSmod.SessionMessages({ claudeSessionId: session.backendSessionId, cwd: c.cwd, buffer: '', ...session }, 'view', { buffersDir: c.buffers });
  const mm = new MessageManager('dead-handover-suite'); mm.convertHistory(sm.raw()); return mm;
}

/** ⑩ THE NEXT WRAPPER: four records a killed wrapper left handed — its CLI gone, alive, no identity, and one the transcript shows run */
async function nextWrapper(tag, wrapper = WRAPPER) {
  const c = conversation(tag);
  const [gone, alive] = await Promise.all([cliOf(), cliOf({ alive: true })]);
  writeTranscript(c, c.conv, [{ type: 'user', uuid: uuid(990), timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: 'start' } },
    { type: 'user', uuid: stampOf('msg-ran-own'), timestamp: new Date(Date.now() - 20000).toISOString(), message: { role: 'user', content: [{ type: 'text', text: words('msg-ran-own') }] } }]);
  place(c, [recordOf('msg-cli-gone', gone), recordOf('msg-cli-alive', alive), recordOf('msg-no-identity', null), recordOf('msg-ran-own', gone)]);
  const w = startWrapper(c, 'sess-10-' + tag, { wrapper });
  await until(() => logHas(w, /handed records at this start: \d+ frame/), 6000);
  const said = w.out.filter((r) => r.type === 'input_handover' && r.via === 'successor');
  await stopWrapper(w.child);
  return { c, said, recs: recordsOf(c), log: w.log() };
}
/** ⑪ A FORK: the parent has a record; the fork (--fork-session, its own id) hands a frame */
async function forkScene() {
  const c = conversation('fork');
  place(c, [recordOf('msg-parent-lost', { pid: 1, start: 'l1', boot: '' }, { state: 'undelivered', settledAt: Date.now() - 1000 })]);
  const F = uuid(500);
  writeTranscript(c, F, [{ type: 'user', uuid: uuid(501), timestamp: new Date(Date.now() - 10000).toISOString(), message: { role: 'user', content: 'forked' } }]);
  const w = startWrapper(c, 'sess-11-fork', { extra: ['--fork-session', '--session-id', F] });
  await handOne(w, 'msg-in-fork', words('msg-in-fork'));
  await until(() => recordsOf(c, F).has('msg-in-fork'), 3000);
  await stopWrapper(w.child);
  return { c, F };
}
/** ⑭ / ⑯ / ⑲: a dying wrapper whose transcript is past 4 MB and newer than the send, whose frame is long, or whose transcript is a FIFO */
async function diesWith(tag, { wrapper = WRAPPER, text = null, transcript = 'small' } = {}) {
  const c = conversation(tag);
  const w = startWrapper(c, 'sess-d-' + tag, { wrapper });
  const MS = 'msg-' + tag;
  await handOne(w, MS, text || words(MS));
  await until(() => recordsOf(c).has(MS), 3000);
  if (transcript === 'big-newer') { const later = new Date(Date.now() + 60000).toISOString(); const pad = 'the turn says more '.repeat(14); const lines = []; for (let i = 0; i < 12000; i++) lines.push(J({ sessionId: c.conv, cwd: c.cwd, type: 'assistant', uuid: uuid(20000 + i), timestamp: later, message: { id: 'msg_p' + i, role: 'assistant', content: [{ type: 'text', text: pad }] } })); fs.writeFileSync(c.tfile(), lines.join('\n') + '\n'); }
  if (transcript === 'fifo') { fs.rmSync(c.tfile(), { force: true }); spawnSyncLocal('mkfifo', [c.tfile()]); }
  killCli(w);
  // ⑲'s evidence is the exit itself: nothing ever opens the pipe for writing, so a wrapper whose exit an fs call holds never exits
  const exited = await Promise.race([w.exited.then(() => true), sleep(8000).then(() => false)]);
  WF.removeWrapperFiles(c.buffers, w.hubId);
  await until(() => !fs.existsSync(path.join(c.buffers, w.hubId + '.img')), 3000);
  if (transcript === 'fifo') fs.rmSync(c.tfile(), { force: true });
  return { c, w, MS, exited, rec: recordsOf(c).get(MS), log: w.log(), tsize: (() => { try { return fs.statSync(c.tfile()).size; } catch { return 0; } })() };
}
/** ⑦ (reworked) / ⑰ / ⑱: a live wrapper hands frames over a records file the suite placed (another writer, a bound, a torn or refused file) */
async function handsOver(tag, { wrapper = WRAPPER, before = null, between = null, frames = ['msg-a-' + tag], texts = null } = {}) {
  const c = conversation(tag);
  if (before) before(c);
  const w = startWrapper(c, 'sess-h-' + tag, { wrapper });
  for (let i = 0; i < frames.length; i++) {
    if (i && between) between(c);
    await handOne(w, frames[i], (texts && texts[i]) || words(frames[i]));
    await until(() => logHas(w, /handed records: /) || recordsOf(c).has(frames[i]), 3000);
  }
  await stopWrapper(w.child);
  return { c, recs: recordsOf(c), log: w.log() };
}
const { spawnSync: spawnSyncLocal } = await import('node:child_process');
const ROOTUSER = typeof process.getuid === 'function' && process.getuid() === 0;
const BIGCOPY = 'x'.repeat(170 * 1024);   // 48 of them read under the 8 MB bound; the frame after them passes it
const [U10, U10r, U11, U14, U14r, U16, U19, U7, U7m, U7r, U17b, U17c, U18t, U18r, U18rr] = await Promise.all([
  nextWrapper('next'), nextWrapper('next-red', R_SKIPID.path), forkScene(),
  diesWith('window', { transcript: 'big-newer' }), diesWith('window-red', { wrapper: R_NOWINDOW.path, transcript: 'big-newer' }),
  diesWith('long', { text: 'LONG-START ' + 'w'.repeat(12000) + ' LONG-END' }), diesWith('fifo', { transcript: 'fifo' }),
  ...['merge', 'merge-red', 'rank-red'].map((tag) => handsOver(tag, {
    wrapper: tag === 'merge-red' ? R_NOMERGE.path : tag === 'rank-red' ? R_ANYRANK.path : WRAPPER,
    before: (c) => place(c, [recordOf('msg-other-writer', null, { state: 'undelivered', settledAt: Date.now() - 4000 })]),
    between: (c) => { const r = recordsOf(c); const z = r.get('msg-z-' + tag); if (z) { r.set(z.msgId, { ...z, state: 'undelivered', settledAt: Date.now() }); place(c, [...r.values()]); } },
    frames: ['msg-z-' + tag, 'msg-y-' + tag],
  })),
  handsOver('bytes', { before: (c) => place(c, Array.from({ length: 48 }, (_, i) => recordOf('msg-big-' + i, null, { state: 'landed', settledAt: 1000 + i, text: BIGCOPY }))), frames: ['msg-after-big'], texts: ['y'.repeat(40 * 1024)] }),
  handsOver('count', { before: (c) => place(c, Array.from({ length: 50 }, (_, i) => recordOf('msg-u-' + i, null, { state: 'undelivered', settledAt: 1000 + i }))), frames: ['msg-fifty-one'] }),
  handsOver('torn', { before: (c) => { fs.mkdirSync(path.join(c.buffers, 'handed'), { recursive: true }); fs.writeFileSync(HANDED.fileOf(c.buffers, c.conv), '{"v":1,"frames":[{"msgId":"x","co'); }, frames: ['msg-after-torn'] }),
  handsOver('refused', { before: (c) => { place(c, [recordOf('msg-locked', null, { state: 'undelivered' })]); fs.chmodSync(HANDED.fileOf(c.buffers, c.conv), 0o000); }, frames: ['msg-after-refused'] }),
  handsOver('refused-red', { wrapper: R_WRITEOVER.path, before: (c) => { place(c, [recordOf('msg-locked', null, { state: 'undelivered' })]); fs.chmodSync(HANDED.fileOf(c.buffers, c.conv), 0o000); }, frames: ['msg-after-refused'] }),
]);

say('⑩ THE NEXT WRAPPER judges what a killed wrapper left handed — by each record\'s OWN CLI, before the transcript');
WD.section('⑩');
const st10 = (id) => U10.recs.get(id)?.state;
ok(st10('msg-cli-gone') === 'undelivered' && st10('msg-ran-own') === 'own-turn' && st10('msg-cli-alive') === 'handed' && st10('msg-no-identity') === 'handed'
  && U10.said.some((r) => r.state === 'undelivered' && r.msg_ids.includes('msg-cli-gone')) && U10.said.some((r) => r.state === 'own-turn' && r.msg_ids.includes('msg-ran-own'))
  && /1 left — the CLI it was handed to still runs; 1 left — its record names no CLI to judge \(unknown, never «gone»\)/.test(U10.log),
  `its CLI gone and absent → «${st10('msg-cli-gone')}»; its CLI gone and the transcript's user record names its stamp → «${st10('msg-ran-own')}»; its CLI ALIVE → left («${st10('msg-cli-alive')}»); NO identity → unknown, left («${st10('msg-no-identity')}») — said as the successor's`, { states: [...U10.recs.values()].map((r) => [r.msgId, r.state]) });
ok(R_SKIPID.counts[0] === 1 && U10r.recs.get('msg-cli-alive')?.state === 'undelivered', `RED: a copy that judges no identity (anchor ×${R_SKIPID.counts[0]}) calls the frame whose CLI still runs «not delivered» — the person would send it twice`);

say('⑪ A FORK takes none of its parent\'s records');
WD.section('⑪');
{
  const fRecs = recordsOf(U11.c, U11.F), pRecs = recordsOf(U11.c);
  const session = { backendSessionId: U11.F, forkedFrom: [U11.c.conv], _forkSourceId: U11.c.conv };
  const lane = bubbleOf(await readerOf(U11.c, session, { ids: [U11.F, U11.c.conv] }), 'msg-parent-lost');
  const red = RED_FORK.SS ? bubbleOf(await readerOf(U11.c, session, { SSmod: RED_FORK.SS, ids: [U11.F, U11.c.conv] }), 'msg-parent-lost') : 'no control';
  ok(fRecs.has('msg-in-fork') && !fRecs.has('msg-parent-lost') && pRecs.get('msg-parent-lost')?.state === 'undelivered' && !lane && RED_FORK.n === 1 && !!red && red !== 'no control',
    `the fork's own file holds its own frame and none of its parent's; the parent's record stays the parent's; the fork's history draws none of it — RED: a drawer that reads a fork's parent in its chain draws ${red ? 'the parent\'s bubble' : 'nothing'}`, { fork: [...fRecs.keys()], red });
}

say('⑫ A FRAME IN FLIGHT after a Resume is never drawn — through the store\'s own line');
WD.section('⑫');
{
  const c = conversation('inflight');
  const started = Date.now();
  const w = startWrapper(c, 'sess-12-inflight');
  await handOne(w, 'msg-in-flight', words('msg-in-flight'));
  await until(() => recordsOf(c).has('msg-in-flight'), 3000);
  const session = { backendSessionId: c.conv, pty: {}, createdAt: started };
  const lane = bubbleOf(await readerOf(c, session), 'msg-in-flight');
  const red = RED_LIVE.SS ? bubbleOf(await readerOf(c, session, { SSmod: RED_LIVE.SS }), 'msg-in-flight') : 'no control';
  await stopWrapper(w.child);
  ok(!lane && RED_LIVE.n === 1 && red && red !== 'no control' && red.chip === 'unconfirmed',
    `the live session's own frame (handed after its start) draws no «Not confirmed» bubble in its history — RED: a store whose drawer forgets the live start draws «${red && red.chip}»`, { lane, red });
}

say('⑬ THE PRODUCTION WARM — the store\'s own warm reads the records beside the transcript');
WD.section('⑬');
{
  const [freshLane, fresh] = await Promise.all([diesWith('warm-lane'), diesWith('warm-red')]);   // two conversations no build has read yet
  const lane = bubbleOf(await stoppedView(freshLane.c), freshLane.MS);
  const red = RED_WARM.SS ? bubbleOf(await readerOf(fresh.c, { backendSessionId: fresh.c.conv }, { SSmod: RED_WARM.SS }), fresh.MS) : 'no control';
  ok(!!lane && lane.chip === 'undelivered' && RED_WARM.n === 1 && red !== 'no control' && !red,
    `the stopped view through SS.warmSessionJsonlAsync draws «${lane && lane.chip}» at its FIRST build — RED: a store whose warm reads only the transcript draws ${red ? 'a bubble' : 'NOTHING'} at the first build`);
}

say('⑭ THE ABSENCE WINDOW — a transcript past 4 MB newer than the send proves nothing');
WD.section('⑭');
ok(U14.tsize > 4 * 1024 * 1024 && U14.rec?.state === 'handed' && /cannot prove either way/.test(U14.log) && bubbleOf(await stoppedView(U14.c), U14.MS)?.chip === 'unconfirmed' && R_NOWINDOW.counts[0] === 1 && U14r.rec?.state === 'undelivered',
  `a ${(U14.tsize / 1048576).toFixed(1)} MB transcript whose window starts after the send: the frame is LEFT (said) and drawn «Not confirmed» — RED: a copy that takes absence as proven calls it «${U14r.rec?.state}»`);

say('⑮ THE DRAWER ASKS THE TRANSCRIPT FIRST');
WD.section('⑮');
{
  const c = conversation('first');
  writeTranscript(c, c.conv, [{ type: 'user', uuid: uuid(980), timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: 'start' } },
    { type: 'attachment', uuid: uuid(981), timestamp: new Date(Date.now() - 10000).toISOString(), attachment: { type: 'queued_command', prompt: words('msg-recorded'), source_uuid: stampOf('msg-recorded') } }]);
  place(c, [recordOf('msg-recorded', null)]);
  const lane = bubbleOf(await stoppedView(c), 'msg-recorded');
  const red = RED_FIRST.SS ? bubbleOf(await readerOf(c, { backendSessionId: c.conv }, { SSmod: RED_FIRST.SS }), 'msg-recorded') : 'no control';
  ok(!lane && RED_FIRST.n === 1 && red && red !== 'no control' && red.chip === 'unconfirmed',
    `a record still handed whose stamp the transcript holds (the CLI took it in) is never drawn beside it — RED: a drawer that does not ask draws «${red && red.chip}» too`, { lane, red });
}

say('⑯ THE RECORD KEEPS WHAT IT DRAWS — a long message, its kept file gone with the wrapper\'s folder');
WD.section('⑯');
{
  const mm = await stoppedView(U16.c);
  const b = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === U16.MS);
  const text = b ? JSON.stringify(b.content) : '';
  ok(!!b && b.queueState === 'undelivered' && text.includes('LONG-START') && text.includes('LONG-END') && text.length > 12000,
    `a ${(12000 / 1024).toFixed(0)} KB message whose kept text went with the teardown is drawn WHOLE from its record (${text.length} chars)`);
}

say('⑰ THE BOUNDS — by bytes and by count, said');
WD.section('⑰');
{
  const size = (() => { try { return fs.statSync(HANDED.fileOf(U17b.c.buffers, U17b.c.conv)).size; } catch { return -1; } })();
  ok(size > 0 && size <= 8 * 1024 * 1024 && U17b.recs.has('msg-after-big') && U17b.recs.size < 49,
    `the file stays within its own read bound (${size} bytes ≤ 8 MB) — the oldest finished records went to make room; the new one is there`, { size, n: U17b.recs.size });
  ok(U17c.recs.size === 50 && !U17c.recs.has('msg-u-0') && U17c.recs.has('msg-fifty-one') && /1 record\(s\) not finished left .*msg-u-0 \(undelivered\)/.test(U17c.log),
    'past 50 records an undelivered one leaves only WITH a journal line naming it (the oldest)');
}

say('⑱ THE WRAPPER\'s OWN WRITE — a torn file kept aside, a refused one never written over');
WD.section('⑱');
{
  const torn = (() => { try { return fs.readFileSync(HANDED.fileOf(U18t.c.buffers, U18t.c.conv) + '-torn', 'utf8'); } catch { return null; } })();
  ok(torn === '{"v":1,"frames":[{"msgId":"x","co' && U18t.recs.has('msg-after-torn'), 'a torn file is kept aside ONCE as …-torn, byte for byte; a new file starts with the frame');
  if (ROOTUSER) say('  · (the refused-read leg needs a user a file mode can refuse — this run is root: not judged here)');
  else {
    const f = HANDED.fileOf(U18r.c.buffers, U18r.c.conv), fr = HANDED.fileOf(U18rr.c.buffers, U18rr.c.conv);
    const modeOf = (p) => { try { return (fs.statSync(p).mode & 0o777).toString(8); } catch { return null; } };
    try { fs.chmodSync(f, 0o600); fs.chmodSync(fr, 0o600); } catch { }
    const lane = recordsOf(U18r.c), red = recordsOf(U18rr.c);
    ok(lane.size === 1 && lane.has('msg-locked') && /could not be read \(EACCES\) — nothing is written over it/.test(U18r.log) && R_WRITEOVER.counts[0] === 1 && red.has('msg-after-refused'),
      `a REGULAR file whose read is refused (a placed refusal: no read permission), with a hand-over in that life: nothing is written over it, said — RED: a copy that writes anyway replaced it`, { lane: [...lane.keys()], red: [...red.keys()], mode: modeOf(f) });
  }
}

say('⑲ THE READ BOUND — a transcript that never answers holds nothing');
WD.section('⑲');
ok(U19.rec?.state === 'handed' && /not read in 2 s/.test(U19.log) && U19.exited === true, `the transcript is a pipe nobody writes: the settle gives up at its bound (said), the frame is left, and the wrapper EXITS though nothing ever wrote the pipe (a read held in this process would hold its exit: the unit's first gate waited it out) — exited ${U19.exited}`);

say('⑦b TWO WRITERS — the merge and the forward-only state, each with its control');
WD.section('⑦b');
ok(U7.recs.get('msg-other-writer')?.state === 'undelivered' && U7.recs.get('msg-z-merge')?.state === 'undelivered' && U7.recs.has('msg-y-merge')
  && R_NOMERGE.counts[0] === 1 && !U7m.recs.has('msg-other-writer') && R_ANYRANK.counts[0] === 1 && U7r.recs.get('msg-z-rank-red')?.state === 'handed',
  `another writer's record is kept and a verdict another writer wrote («undelivered») is never moved back by this wrapper's older «handed» — RED: a write that does not read the file loses the other's record; a merge where the later wins moves the verdict back («${U7r.recs.get('msg-z-rank-red')?.state}»)`, { lane: [...U7.recs.values()].map((r) => [r.msgId, r.state]) });

for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 4, label: 'B-5a4d root ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
