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
import { stopWrapper } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
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
  await HANDED.warm(ids, { dir: c.buffers });
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
  await sleep(100);   // its other kinds go off the loop
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

say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
