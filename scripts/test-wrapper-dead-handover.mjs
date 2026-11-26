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
//   ㉖ (r4372) ONE BUBBLE where the hub's own send record (the live ring) meets a drawn copy of the same message — in BOTH orders,
//      each placed by its records' dates (never this run's clock); RED: the drawer before the cure draws a second bubble copy-first
//   ㉗ (unit 3, r4655 / r4664) SEND AGAIN and DISMISS a message proven not delivered: the real wrapper's ONE write (the old record
//      resent AND the new one handed) before anything is handed on, the words once in the CLI's stdin, a second press refused by
//      its record; a kill HELD in that window (a scene copy with a placed FIFO hold, never a clock) leaves the new message to the
//      next wrapper, drawn «Not delivered» with its words — RED: a copy that writes the end state alone loses them; Dismiss writes
//      first, a rebuild draws nothing, a live view keeps the bubble; the hub's door: the person only (both frames), once, words only
import { stopWrapper, anchored } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
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
function startWrapper(c, hubId, { wrapper = WRAPPER, extra = [], env: more = {} } = {}) {
  const buf = path.join(c.buffers, hubId + '.buf'), meta = path.join(c.buffers, hubId + '.json');
  const child = spawn(process.execPath, [wrapper, buf, meta, process.execPath, STAND_IN, '--resume', c.conv, ...extra], { cwd: c.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HOME, CLAUDE_CONFIG_DIR: CFG, VIBESPACE_SKIP_AGENT_HOOKS: '1', STAND_IN_LONG_MS: '60000', ...more } });
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
// r3282 (round w7fd2q32u): the cure's REDs
const LC = require(path.join(ROOT, 'src/claude-lock-capture.js'));
const RED_PENDING = ssRed('pending', '    if (forkSource && historySessionId === forkSource) return;\n', '');
const R_NOFORK = redWrapper('nofork', [["const IS_FORK = args.includes('--fork-session');", 'const IS_FORK = false;   // MUTANT: the fork flag never read']]);
const R_INPROC = redWrapper('inproc', [['  const { tail, from } = await tailViaChild(file);', "  const { tail, from } = await (async () => { const st = await fs.promises.stat(file); return { tail: await fs.promises.readFile(file, 'utf8'), from: Math.max(0, st.size - DEAD_TAIL_MAX) }; })();   // MUTANT: read in this process"]]);
const R_NOCOMPACT = redWrapper('nocompact', [['        else if (compactAt && !(d.at && compactAt < d.at)) { left.push(d.msgId); compacted++; }\n', '']]);
const R_NOHEAD = redWrapper('nohead', [['    if (!r.copy || Buffer.byteLength(JSON.stringify({ v: 1, conv: recordsName(), frames: [r] })) <= HANDED_FILE_MAX) continue;', '    continue;   // MUTANT: no head kept']]);
const R_HEADLATE = redWrapper('headlate', [['    if (!r.copy || Buffer.byteLength(JSON.stringify({ v: 1, conv: recordsName(), frames: [r] })) <= HANDED_FILE_MAX) continue;', '    continue;   // MUTANT: the head kept only AFTER the drop (the cure as it was)'],
  ["  if (Buffer.byteLength(text) > HANDED_FILE_MAX) { sayOnce('big:' + file,", "  if (Buffer.byteLength(text) > HANDED_FILE_MAX) { for (const r of [...all.values()]) if (r.copy) { const head = { ...r, copy: null }; all.set(r.msgId, head); if (HR.has(r.msgId)) HR.set(r.msgId, head); } text = JSON.stringify({ v: 1, conv: recordsName(), frames: [...all.values()] }); }\n  if (Buffer.byteLength(text) > HANDED_FILE_MAX) { sayOnce('big:' + file,"]]);
const R_ANYSUMMARY = redWrapper('anysummary', [["else if (r && r.type === 'summary' && Date.parse(r.timestamp)) compactAt = Math.max(compactAt, Date.parse(r.timestamp));", "else if (r && r.type === 'summary') compactAt = Math.max(compactAt, Date.parse(r.timestamp) || Infinity); /* MUTANT: any summary line (mid-line: never a // comment) */"]]);
const PI_SRC = fs.readFileSync(path.join(ROOT, 'src/proc-identity.js'), 'utf8');
const RED_VERDICTS = M.load('src/proc-identity.js', anchored(PI_SRC, "    if (!(rows instanceof Map) || !rows.size) return 'unknown';", "    if (!(rows instanceof Map) || !rows.size) return 'gone';   // MUTANT: a failed listing read as gone", 'the identity RED listing'), 'listing');
const HR_SRC = fs.readFileSync(path.join(ROOT, 'src/handed-records.js'), 'utf8');
const RED_RANK = M.load('src/handed-records.js', anchored(HR_SRC, "const RANK = { handed: 0, undelivered: 1, landed: 2, 'own-turn': 2, kept: 2 };", "const RANK = { handed: 0, landed: 1, 'own-turn': 1, kept: 1, undelivered: 1 };   // MUTANT: the ranks before", 'the drawer RED rank'), 'rank');
const LC_SRC = fs.readFileSync(path.join(ROOT, 'src/claude-lock-capture.js'), 'utf8');
const RED_LEGACY = M.load('src/claude-lock-capture.js', anchored(LC_SRC, "  return meta.forkRequested === true && cur && ff.length && !ff.includes(cur) ? ff[0] : null;", '  return null;   // MUTANT: no reading of a pre-.134 record', 'the restore RED legacy'), 'legacy');
const DEAD_READ = Number((/^const DEAD_READ_MS = (\d+);/m.exec(CW_SRC) || [])[1]) || 2000;   // the product's own bound (a wait, never a literal)
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
  // the evidence, both of it: the journal's line AND the said records on stdout (the pipe can be read after the line is on disk —
  // the hosted runner's second try)
  const saidAs = (st) => w.out.some((r) => r.type === 'input_handover' && r.via === 'successor' && r.state === st);
  await until(() => logHas(w, /handed records at this start: \d+ frame/) && saidAs('undelivered') && saidAs('own-turn'), 6000);
  const said = w.out.filter((r) => r.type === 'input_handover' && r.via === 'successor');
  await stopWrapper(w.child);
  return { c, said, recs: recordsOf(c), log: w.log() };
}
/** ⑪ A FORK: the parent has a record; the fork (--fork-session, its own id) hands a frame */
async function forkScene(tag = 'fork', wrapper = WRAPPER) {
  const c = conversation(tag);
  place(c, [recordOf('msg-parent-lost', { pid: 1, start: 'l1', boot: '' }, { state: 'undelivered', settledAt: Date.now() - 1000 })]);
  const F = uuid(500);
  writeTranscript(c, F, [{ type: 'user', uuid: uuid(501), timestamp: new Date(Date.now() - 10000).toISOString(), message: { role: 'user', content: 'forked' } }]);
  const w = startWrapper(c, 'sess-11-' + tag, { wrapper, extra: ['--fork-session', '--session-id', F] });
  await handOne(w, 'msg-in-fork', words('msg-in-fork'));
  await until(() => recordsOf(c, F).has('msg-in-fork'), 3000);
  await stopWrapper(w.child);
  return { c, F };
}
/** ⑳ THE JUDGE's MAPPING: a recycled pid, a real zombie, a birth this machine cannot read, no identity — over a whole, small transcript */
async function zombieOf() {
  // the child ends AFTER its shell became `sleep 60` (which never reaps): a shell that collects a finished background job before its
  // exec (the hosted runner's first tries) can no longer take the zombie away
  const sh = spawn('sh', ['-c', '(sleep 0.3) & echo $!; exec sleep 60'], { stdio: ['ignore', 'pipe', 'ignore'] }); sleepers.push(sh);
  let out = ''; sh.stdout.on('data', (d) => { out += d; });
  await until(() => /^\d+\n/.test(out), 3000);
  const pid = Number(out.split('\n')[0]);
  await until(() => PI.stateOf(pid) === 'Z', 3000);
  const state = PI.stateOf(pid), start = PI.startToken(pid);
  return { pid, start, boot: PI.bootToken(), state, held: state === 'Z' && !!start };   // a zombie this machine HOLDS, its birth read
}
async function mapScene() {
  const c = conversation('map');
  const [rec, live, z] = await Promise.all([cliOf({ alive: true }), cliOf({ alive: true }), zombieOf()]);
  // the zombie's record only when a zombie is HELD with its birth read (the precondition, said in ⑳ when it is not met)
  place(c, [recordOf('mR-recycled', { ...rec, start: 'l1' }), ...(z.held ? [recordOf('mZ-zombie', { pid: z.pid, start: z.start, boot: z.boot })] : []), recordOf('mU-unknown', { pid: live.pid, start: 'pMon Jan  1 00:00:00 2001', boot: '' }), recordOf('mN-noid', { pid: 4242, start: '', boot: '' })]);
  const w = startWrapper(c, 'sess-20-map');
  await until(() => logHas(w, /handed records at this start: \d+ frame/), 6000);
  await stopWrapper(w.child);
  return { c, recs: recordsOf(c), log: w.log(), zstate: z.state, zHeld: z.held };
}
/** ⑲'s RED: a copy that reads the tail IN ITS OWN PROCESS, over the same pipe — still running when the lane has exited and the
 *  product's own read bound has passed again */
let laneDone = () => { };
const laneExited = new Promise((r) => { laneDone = r; });
async function pipeRed() {
  const c = conversation('fifo-red');
  const w = startWrapper(c, 'sess-d-fifo-red', { wrapper: R_INPROC.path });
  const MS = 'msg-fifo-red';
  await handOne(w, MS, words(MS));
  await until(() => recordsOf(c).has(MS), 3000);
  fs.rmSync(c.tfile(), { force: true }); spawnSyncLocal('mkfifo', [c.tfile()]);
  killCli(w);
  const [laneOk] = await Promise.all([laneExited, sleep(DEAD_READ)]);   // the lane has exited, and this copy's own read bound has passed
  const exited = await Promise.race([w.exited.then(() => true), sleep(DEAD_READ).then(() => false)]);   // …and passed again: a copy not held would be gone
  if (!exited) { try { w.child.kill('SIGKILL'); } catch { } await w.exited; }
  fs.rmSync(c.tfile(), { force: true });
  return { exited, laneOk };
}
/** ⑭ / ⑯ / ⑲: a dying wrapper whose transcript is past 4 MB and newer than the send, whose frame is long, or whose transcript is a FIFO */
async function diesWith(tag, { wrapper = WRAPPER, text = null, transcript = 'small', onExit = null } = {}) {
  const c = conversation(tag);
  const w = startWrapper(c, 'sess-d-' + tag, { wrapper });
  const MS = 'msg-' + tag;
  await handOne(w, MS, text || words(MS));
  await until(() => recordsOf(c).has(MS), 3000);
  if (transcript === 'big-newer') { const later = new Date(Date.now() + 60000).toISOString(); const pad = 'the turn says more '.repeat(14); const lines = []; for (let i = 0; i < 12000; i++) lines.push(J({ sessionId: c.conv, cwd: c.cwd, type: 'assistant', uuid: uuid(20000 + i), timestamp: later, message: { id: 'msg_p' + i, role: 'assistant', content: [{ type: 'text', text: pad }] } })); fs.writeFileSync(c.tfile(), lines.join('\n') + '\n'); }
  if (transcript === 'fifo') { fs.rmSync(c.tfile(), { force: true }); spawnSyncLocal('mkfifo', [c.tfile()]); }
  if (transcript === 'titled') writeTranscript(c, c.conv, [{ type: 'summary', summary: 'A conversation title', leafUuid: uuid(985 + k) }, { type: 'user', uuid: uuid(990 + k), timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: 'start' } }]);   // a TITLE line (no time) — no compaction; the frame's record not in it
  if (transcript === 'compacted') writeTranscript(c, c.conv, [{ type: 'user', uuid: uuid(960 + k), timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: 'start' } }, { type: 'system', subtype: 'compact_boundary', uuid: uuid(970 + k), timestamp: new Date(Date.now() + 1000).toISOString() }]);   // the whole file, compacted after the send, the frame's record not in it
  killCli(w);
  // ⑲'s evidence is the exit itself: nothing ever opens the pipe for writing, so a wrapper whose exit an fs call holds never exits
  const exited = await Promise.race([w.exited.then(() => true), sleep(8000).then(() => false)]);
  if (onExit) onExit(exited);
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
const HUGE = 'h'.repeat(9 * 1024 * 1024);   // one message past the records file's 8 MB bound
const [U10, U10r, U11, U14, U14r, U16, U19, U7, U7m, U7r, U17b, U17c, U18t, U18r, U18rr, U11r, U20, U25, U25r, U24, U24r, U19r, U24b, U24br, U25t, U25tr] = await Promise.all([
  nextWrapper('next'), nextWrapper('next-red', R_SKIPID.path), forkScene(),
  diesWith('window', { transcript: 'big-newer' }), diesWith('window-red', { wrapper: R_NOWINDOW.path, transcript: 'big-newer' }),
  diesWith('long', { text: 'LONG-START ' + 'w'.repeat(12000) + ' LONG-END' }), diesWith('fifo', { transcript: 'fifo', onExit: (x) => laneDone(x) }),
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
  forkScene('fork-red', R_NOFORK.path), mapScene(),
  diesWith('compact', { transcript: 'compacted' }), diesWith('compact-red', { wrapper: R_NOCOMPACT.path, transcript: 'compacted' }),
  handsOver('huge', { frames: ['mH-huge', 'mA-after'], texts: [HUGE, words('mA-after')] }), handsOver('huge-red', { wrapper: R_NOHEAD.path, frames: ['mH-huge', 'mA-after'], texts: [HUGE, words('mA-after')] }),
  pipeRed(),
  handsOver('huge2', { frames: ['mS-small', 'mH2-huge'], texts: [words('mS-small'), HUGE] }), handsOver('huge2-red', { wrapper: R_HEADLATE.path, frames: ['mS-small', 'mH2-huge'], texts: [words('mS-small'), HUGE] }),
  diesWith('titled', { transcript: 'titled' }), diesWith('titled-red', { wrapper: R_ANYSUMMARY.path, transcript: 'titled' }),
]);

say('⑩ THE NEXT WRAPPER judges what a killed wrapper left handed — by each record\'s OWN CLI, before the transcript');
WD.section('⑩');
const st10 = (id) => U10.recs.get(id)?.state;
ok(st10('msg-cli-gone') === 'undelivered' && st10('msg-ran-own') === 'own-turn' && st10('msg-cli-alive') === 'handed' && st10('msg-no-identity') === 'handed'
  && U10.said.some((r) => r.state === 'undelivered' && r.msg_ids.includes('msg-cli-gone')) && U10.said.some((r) => r.state === 'own-turn' && r.msg_ids.includes('msg-ran-own'))
  && /1 left — the CLI it was handed to still runs; 1 left — its record names no CLI this machine can judge \(unknown, never «gone»\)/.test(U10.log),
  `its CLI gone and absent → «${st10('msg-cli-gone')}»; its CLI gone and the transcript's user record names its stamp → «${st10('msg-ran-own')}»; its CLI ALIVE → left («${st10('msg-cli-alive')}»); NO identity → unknown, left («${st10('msg-no-identity')}») — said as the successor's`, { states: [...U10.recs.values()].map((r) => [r.msgId, r.state]) });
ok(R_SKIPID.counts[0] === 1 && U10r.recs.get('msg-cli-alive')?.state === 'undelivered', `RED: a copy that judges no identity (anchor ×${R_SKIPID.counts[0]}) calls the frame whose CLI still runs «not delivered» — the person would send it twice`);

say('⑪ A FORK takes none of its parent\'s records');
WD.section('⑪');
{
  const fRecs = recordsOf(U11.c, U11.F), pRecs = recordsOf(U11.c), P = U11.c.conv, F = U11.F;
  const draws = async (session, SSmod = SS, ids = [F, P]) => !!bubbleOf(await readerOf(U11.c, session, { SSmod, ids }), 'msg-parent-lost');
  // THE LIVE ROAD — ws-create's own fields (its ONE rule, forkSourceOf; the assignment pinned below), then the adoption's chain
  const live = { _forkRequested: true, claudeSessionId: P, backendSessionId: P, forkedFrom: null, _forkSourceId: LC.forkSourceOf({ fork: true, resumeId: P }), createdAt: Date.now() - 5000 };
  const pending = await draws(live, SS, [P]), pendingRed = await draws(live, RED_PENDING.SS, [P]);
  LC.adoptCapturedId(live, F);   // the adoption pushes the parent into the chain, as both production roads do
  const adopted = await draws(live), adoptedRed = await draws(live, RED_FORK.SS);
  // THE RESTORE ROAD — the meta as ws-create and the adoption wrote it, the fork source by the restore's ONE rule (pinned below)
  const fromMeta = (m) => ({ claudeSessionId: m.claudeSessionId, backendSessionId: m.claudeSessionId, forkedFrom: m.forkedFrom || null, _forkSourceId: LC.restoredForkSource(m), createdAt: m.createdAt });
  const metaF = { claudeSessionId: F, forkedFrom: [P], forkRequested: true, forkSourceId: LC.forkSourceOf({ fork: true, resumeId: P }), createdAt: Date.now() - 5000 };
  const restored = await draws(fromMeta(metaF));
  // A FORK FROM BEFORE 2.369.134 — no forkSourceId in its meta: its own chain names the source (restoredForkPending's reading)
  const metaOld = { claudeSessionId: F, forkedFrom: [P], forkRequested: true, createdAt: Date.now() - 5000 };
  const old = await draws(fromMeta(metaOld)), oldRed = await draws({ ...fromMeta(metaOld), _forkSourceId: RED_LEGACY.restoredForkSource(metaOld) });
  // AN IMPLICIT FORK (a resume that minted a new id — no fork flag): its earlier id IS this conversation's, its records drawn
  const imp = await draws(fromMeta({ claudeSessionId: F, forkedFrom: [P], forkRequested: false, createdAt: Date.now() - 5000 }));
  ok(fRecs.has('msg-in-fork') && !fRecs.has('msg-parent-lost') && pRecs.get('msg-parent-lost')?.state === 'undelivered' && recordsOf(U11r.c, U11r.F).has('msg-parent-lost'),
    'the wrapper\'s half: the fork\'s own file holds its own frame and none of its parent\'s; the parent\'s record stays the parent\'s — RED: a copy that never reads the fork flag merges the parent\'s records into the fork\'s file', { fork: [...fRecs.keys()], red: [...recordsOf(U11r.c, U11r.F).keys()] });
  ok(!pending && !adopted && !restored && !old && imp && live._forkSourceId === P && LC.restoredForkSource(metaF) === P && LC.restoredForkSource(metaOld) === P,
    'the drawer\'s half, by production\'s roads: a live fork still borrowing its parent\'s id draws nothing; adopted (the parent pushed into its chain) it draws none of the parent\'s; restored from its meta, and from a meta older than 2.369.134 (no fork source: its own chain names it), the same; a resume\'s implicit fork draws its earlier id\'s records (its own)', { pending, adopted, restored, old, imp });
  ok(pendingRed && adoptedRed && oldRed, 'RED: a drawer that draws for a fork still borrowing its parent\'s id, a drawer that keeps the parent in the chain, and a restore that does not read a pre-.134 record each draw the parent\'s «Not delivered» in the fork', { pendingRed, adoptedRed, oldRed });
  // THE ASSIGNMENTS — where production builds the session: ws-create's literal, boot-restore's sessionFromMeta (each with its control)
  const WC = fs.readFileSync(path.join(ROOT, 'src/ws-create.js'), 'utf8'), BRT = fs.readFileSync(path.join(ROOT, 'src/server/boot-restore.js'), 'utf8');
  const wcPin = (t) => /\{[^}]*\bforkSourceOf\b[^}]*\} = require\('\.\/claude-lock-capture'\)/.test(t) && /\n\s+_forkRequested: !!data\.fork && !!capsOf\(backend\)\.fork,[^\n]*\n\s+_forkSourceId: capsOf\(backend\)\.fork \? forkSourceOf\(data\) : null,/.test(t)
    && t.includes('forkSourceId: (data.fork && (data.forkedFromId || data.resumeId)) ? String(data.forkedFromId || data.resumeId) : undefined,');
  const brPin = (t) => /\{[^}]*\brestoredForkSource\b[^}]*\} = require\('\.\.\/claude-lock-capture'\)/.test(t) && /function sessionFromMeta\(meta, transportFacts\) \{\n  return \{[\s\S]{0,1500}?\n    _forkSourceId: restoredForkSource\(meta\),/.test(t);
  const same = ['p-1', 'x-2'].every((id) => LC.forkSourceOf({ fork: true, resumeId: id }) === id) && LC.forkSourceOf({ fork: true, forkedFromId: 'x-3', resumeId: 'p-3' }) === 'x-3' && LC.forkSourceOf({ resumeId: 'p-4' }) === null;
  ok(wcPin(WC) && brPin(BRT) && same && !wcPin(anchored(WC, '            _forkSourceId: capsOf(backend).fork ? forkSourceOf(data) : null,', '            _forkSourceId: forkSourceOf(data),   // MUTANT: not asked of the capability', 'the create RED')) && !brPin(anchored(BRT, '    _forkSourceId: restoredForkSource(meta),', '    // (MUTANT: no fork source)', 'the restore RED')),
    'ws-create\'s session carries _forkSourceId by forkSourceOf, asked of the harness\'s fork capability as _forkRequested is (r3330; the meta\'s forkSourceId is the same rule) and boot-restore\'s sessionFromMeta (all three restore roads) by restoredForkSource — CONTROL: either assignment removed, its pin is red');
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

ok(U19r.laneOk === true && U19r.exited === false, `RED: a copy that reads the tail in ITS OWN process over the same pipe is still running after the lane's wrapper exited and the read bound (${DEAD_READ} ms) passed again — its exit held`, U19r);
ok(/spawn\(process\.execPath, \['-e', TAIL_JS, file, String\(DEAD_TAIL_MAX\)\], \{ stdio: \['ignore', 'pipe', 'ignore'\], env: \{\} \}\)/.test(CW_SRC),
  'the tail\'s child is handed NO environment (env: {} — none of the account\'s names; the spawn census reads it as built from nothing)');

say('⑳ THE JUDGE\'s MAPPING — a recycled pid and a zombie are gone, a birth this machine cannot read is unknown');
WD.section('⑳');
{
  const st = (id) => U20.recs.get(id)?.state;
  if (!U20.zHeld) say(`  · PRECONDITION NOT MET HERE: no zombie with a readable birth could be held on this machine (its state «${U20.zstate}») — the zombie half of ⑳ is NOT judged in this run; the recycled, unreadable-birth and no-birth halves are`);
  ok((U20.zHeld ? U20.zstate === 'Z' && st('mZ-zombie') === 'undelivered' : !U20.recs.has('mZ-zombie')) && st('mR-recycled') === 'undelivered' && st('mU-unknown') === 'handed' && st('mN-noid') === 'handed' && /2 left — /.test(U20.log),
    `a record whose pid now belongs to another birth (recycled)${U20.zHeld ? ' and one whose CLI is a zombie are' : ' is'} judged GONE — the whole transcript proves ${U20.zHeld ? `them «${st('mR-recycled')}» / «${st('mZ-zombie')}»` : `it «${st('mR-recycled')}» (the zombie half NOT judged: precondition above)`}; a birth recorded by a rung this machine cannot read and a record with no birth are UNKNOWN — left «${st('mU-unknown')}» / «${st('mN-noid')}», said`, { held: U20.zHeld, zstate: U20.zstate, states: [...U20.recs.values()].map((r) => [r.msgId, r.state]) });
}

say('㉑ ONE LOOK OFF A PROCFS — a listing that failed proves nothing, and one listing answers every record');
WD.section('㉑');
{
  let calls = 0;
  const rows = new Map([[101, { stat: 'S', lstart: 'Mon Nov 23 05:00:00 2026' }], [102, { stat: 'Z', lstart: 'Mon Nov 23 05:00:01 2026' }], [103, { stat: 'S', lstart: 'Mon Nov 23 05:00:02 2026' }]]);
  const asks = [{ pid: 101, token: 'pMon Nov 23  05:00:00 2026' }, { pid: 102, token: 'pMon Nov 23 05:00:01 2026' }, { pid: 103, token: 'pTue Nov 24 05:00:02 2026' }, { pid: 104, token: 'pMon Nov 23 05:00:03 2026' }, { pid: 101, token: 'l12345' }, { pid: 105, token: '' }];
  const answered = await PI.tokenVerdicts(asks, { procfs: false, listing: async () => { calls++; return rows; } });
  const failed = await PI.tokenVerdicts(asks, { procfs: false, listing: async () => null });
  const threw = await PI.tokenVerdicts(asks, { procfs: false, listing: async () => { throw new Error('ps did not answer'); } });
  const red = await RED_VERDICTS.tokenVerdicts(asks, { procfs: false, listing: async () => null });
  ok(J(answered) === J(['same', 'zombie', 'pid-recycled', 'gone', 'unknown', 'unknown-identity']) && calls === 1,
    'a listing that answered: the same start = same, Z = zombie, another start = recycled, not listed = GONE, a procfs birth = unknown here, no birth = unknown-identity — ONE listing for all six', { answered, calls });
  ok(failed.every((v) => v === 'unknown' || v === 'unknown-identity') && threw.every((v) => v === 'unknown' || v === 'unknown-identity'),
    'a listing that failed or passed its bound (no answer) or threw: every verdict UNKNOWN — never «gone» (a living CLI is never called gone because ps did not answer)', { failed, threw });
  ok(red.includes('gone'), 'RED: a copy that reads a failed listing as an answer calls the records gone', { red });
  const probe = spawnSyncLocal('ps', ['-p', String(process.pid), '-o', 'lstart='], { encoding: 'utf8' });
  if (probe.status !== 0 || !String(probe.stdout || '').trim()) say('  · (no ps answers here: the REAL listing is not judged in this run)');
  else {
    const [alive, dead] = await Promise.all([cliOf({ alive: true }), cliOf()]);
    const t = 'p' + String(spawnSyncLocal('ps', ['-p', String(alive.pid), '-o', 'lstart='], { encoding: 'utf8' }).stdout || '').trim();
    const real = await PI.tokenVerdicts([{ pid: alive.pid, token: t }, { pid: dead.pid, token: t }], { procfs: false });
    ok(J(real) === J(['same', 'gone']), 'the REAL listing (ps -A, its own env) reads a living process\'s start in the words its own ps -p wrote, and a dead pid as gone', { real });
  }
  ok(/let vs = null; try \{ vs = PI && PI\.tokenVerdicts \? await PI\.tokenVerdicts\(asked\) : null; \} catch \{ vs = null; \}/.test(CW_SRC) && !/PI\.tokenVerdict\(Number\(r\.cli\.pid\)/.test(CW_SRC),   // stale-pins: kept — an ABSENCE check: the one-ps-a-record call is gone
    'the wrapper\'s start asks ONE look for all its records (tokenVerdicts), never one ps a record');
}

say('㉒ THE RANKS — what the CLI or the person said beats a proven absence, in both places');
WD.section('㉒');
{
  const c = conversation('rank'), earlier = uuid(700);
  place(c, [recordOf('mL-landed', null, { state: 'undelivered', settledAt: Date.now() - 1000 }), recordOf('mO-own', null, { state: 'own-turn', settledAt: Date.now() - 1000 })]);
  place(c, [recordOf('mL-landed', null, { state: 'landed', settledAt: Date.now() }), recordOf('mO-own', null, { state: 'undelivered', settledAt: Date.now() })], earlier);
  const ids = [c.conv, earlier];
  await HANDED.warm(ids, { dir: c.buffers }); await RED_RANK.warm(ids, { dir: c.buffers });
  const lane = HANDED.recordsFor(ids, { dir: c.buffers }), redRecs = RED_RANK.recordsFor(ids, { dir: c.buffers });
  const rankOf = (t, f) => (new RegExp('^const RANK = (\\{[^}]*\\});', 'm').exec(t) || [])[1];
  ok(lane.get('mL-landed')?.state === 'landed' && lane.get('mO-own')?.state === 'own-turn' && HANDED.drawnFor(lane).length === 0 && rankOf(CW_SRC) === rankOf(HR_SRC) && !!rankOf(CW_SRC),
    'the drawer\'s merge: «landed» beats an «undelivered» found first, «own-turn» stays over a later «undelivered» — nothing drawn; the wrapper\'s RANK is the drawer\'s, the same table', { lane: [...lane.values()].map((r) => r.state) });
  ok(redRecs.get('mL-landed')?.state === 'undelivered', 'RED: with the ranks before, the first word written wins — «undelivered» drawn for a frame the CLI took');
}

say('㉓ THE PRODUCTION FOLDER — the drawer\'s default records folder IS the server\'s buffers folder');
WD.section('㉓');
{
  const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), WIRE = fs.readFileSync(path.join(ROOT, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/^const DEFAULT_DIR = HUB_MAIN \? path\.join\(__dirname, '\.\.', 'data', 'session-buffers'\) : null;/m.test(HR_SRC) && /require\.main\.filename === path\.join\(__dirname, '\.\.', 'server\.js'\)/.test(HR_SRC)
    && /^const BUFFERS_DIR = path\.join\(__dirname, 'data', 'session-buffers'\);/m.test(SRV) && path.join(ROOT, 'src', '..', 'data', 'session-buffers') === path.join(ROOT, 'data', 'session-buffers')
    && /new SessionMessages\(session, sessionId, \{ buffersDir: BUFFERS_DIR/.test(WIRE) && HANDED.DEFAULT_DIR === null,
    'in the hub\'s own process (require.main = server.js) the records folder is <root>/data/session-buffers/handed = server.js BUFFERS_DIR, and the history reader the hub builds is handed BUFFERS_DIR; in any other process (this suite) there is none');
}

say('㉔ ONE RECORD PAST THE FILE\'s BOUND — its words go, its head stays');
WD.section('㉔');
{
  const h = U24.recs.get('mH-huge');
  ok(!!h && h.copy === null && /past the file's bound/.test(h.copyGone || '') && !!h.cli && U24.recs.has('mA-after') && /mH-huge: one record alone passes \d+ bytes — its words are not kept, its head is/.test(U24.log),
    'a message of 9 MB in one frame: its record keeps its head (its id, its state, the CLI it was handed to), its words not — said; the frame after it is recorded', { h: h && { copy: h.copy, gone: h.copyGone, state: h.state }, keys: [...U24.recs.keys()] });
  ok(!U24r.recs.has('mH-huge') && U24r.recs.has('mA-after'), 'RED: a copy that keeps no head loses that frame\'s record entirely (the next write dropped it to fit; the writes after it were never stopped)', { keys: [...U24r.recs.keys()] });
}

{
  const a = U24b.recs.get('mS-small'), h = U24b.recs.get('mH2-huge');
  ok(!!a && typeof a.copy === 'string' && !!h && h.copy === null && !/not finished left/.test(U24b.log),
    'a small handed frame and then one frame of 9 MB: the huge one loses its words FIRST (its head kept) and the small one stays whole — nothing is dropped to make room (r3330)', { keys: [...U24b.recs.keys()] });
  ok(!U24br.recs.has('mS-small') && U24br.recs.get('mH2-huge')?.copy === null, 'RED: the head kept only after the drop (the cure as it was) drops the small frame whole to fit, then strips the huge one — neither can be drawn', { keys: [...U24br.recs.keys()] });
}

say('㉕ A COMPACTION AT OR AFTER THE SEND proves no absence');
WD.section('㉕');
ok(U25.rec?.state === 'handed' && /compacted at or after the send — its absence proves nothing/.test(U25.log) && U25r.rec?.state === 'undelivered',
  `a whole transcript compacted after the send, the frame's record not in it: left «${U25.rec?.state}» and said — RED: a copy without the guard calls it «${U25r.rec?.state}»`);
ok(U25t.rec?.state === 'undelivered' && U25tr.rec?.state === 'handed',
  `a TITLE summary line (no time) is no compaction: the whole transcript still proves the frame «${U25t.rec?.state}» — RED: a guard that takes any summary line leaves it «${U25tr.rec?.state}» (send it again quietly off)`);

say('㉖ ONE BUBBLE where the hub\'s own send record meets a drawn copy of the same message — both orders, placed by dates (r4372)');
WD.section('㉖');
{
  // FIXED DATES, never this run's clock: the transcript's start T0, the hub's send record in the live ring at TS (the claude adapter's
  // userMsg: _fromWebui + msgId + its time, no webui_copy), the record handed and settled 30 s before TS (a paired machine's clock behind
  // the hub's: the copy is placed FIRST) or 30 s after it (one clock: the send record first, as today)
  const T0 = Date.parse('2026-11-25T10:00:00.000Z'), TS = T0 + 60000;
  const HR_OLD = M.write('src/handed-records.js', anchored(HR_SRC, '(m.webui_copy || m._fromWebui))) continue;', 'm.webui_copy)) continue;   /* MUTANT: the drawer before r4372 */', 'the drawer RED meet'), 'meet-old');
  const SS_OLD = ssRed('meet-old', "const HANDED = require('./handed-records.js');", 'const HANDED = require(' + J(HR_OLD) + ');   /* MUTANT: the drawer before r4372 */').SS;
  let n = 0;
  const meet = async (Store, tag, recAt, state) => {
    const MS = 'msg-meet-' + tag;
    const c = conversation('meet-' + tag, { transcript: [{ type: 'user', uuid: uuid(960 + ++n), timestamp: new Date(T0).toISOString(), message: { role: 'user', content: 'start the long task' } }] });
    place(c, [recordOf(MS, null, { state, at: recAt, settledAt: state === 'handed' ? 0 : recAt + 1000 })]);
    await Store.warmSessionJsonlAsync(c.conv, c.cwd, { handedDir: c.buffers });   // the store's OWN warm (its records cache is the copy's own)
    const ring = J({ type: 'user', message: { role: 'user', content: words(MS) }, msgId: MS, timestamp: new Date(TS).toISOString(), _fromWebui: true }) + '\n';
    const sm = new Store.SessionMessages({ backendSessionId: c.conv, claudeSessionId: c.conv, cwd: c.cwd, buffer: ring }, 'view', { buffersDir: c.buffers });
    const raw = sm.raw(), mm = new MessageManager('dead-handover-suite'); mm.convertHistory(raw);
    const bubbles = mm.messages.filter((m) => m.role === 'user' && m.webuiMsgId === MS);
    return { bubbles: bubbles.length, chip: bubbles.length ? bubbles[0].queueState || null : 'none', copyAt: raw.findIndex((r) => r && r.msgId === MS && r.webui_copy), sendAt: raw.findIndex((r) => r && r.msgId === MS && r._fromWebui && !r.webui_copy) };
  };
  const cf = await meet(SS, 'copy-first', TS - 30000, 'undelivered'), cfU = await meet(SS, 'copy-first-unconfirmed', TS - 30000, 'handed');
  const sf = await meet(SS, 'send-first', TS + 30000, 'undelivered');
  const rcf = await meet(SS_OLD, 'copy-first-red', TS - 30000, 'undelivered'), rcfU = await meet(SS_OLD, 'copy-first-unconfirmed-red', TS - 30000, 'handed');
  const rsf = await meet(SS_OLD, 'send-first-old', TS + 30000, 'undelivered');
  ok(rcf.copyAt >= 0 && rcf.sendAt > rcf.copyAt && rsf.sendAt >= 0 && rsf.copyAt > rsf.sendAt,
    `the two orders are PLACED by the records' dates (the drawer before the cure, which draws the copy in both): copy first ${rcf.copyAt} < ${rcf.sendAt}, send first ${rsf.sendAt} < ${rsf.copyAt}`, { rcf, rsf });
  ok(cf.bubbles === 1 && cf.copyAt === -1 && cf.sendAt >= 0 && cfU.bubbles === 1 && cfU.copyAt === -1,
    `the copy dated BEFORE the hub's send record («Not delivered» and «Not confirmed» alike): ONE bubble — the drawer counts the hub's own send record as the history holding the frame (no copy drawn)`, { cf, cfU });
  ok(sf.bubbles === 1 && rsf.bubbles === 1 && sf.chip === rsf.chip && cf.chip === rsf.chip,
    `the send record first: ONE bubble, as before the cure; and the copy-first bubble's chip is the send-first one's (${J(cf.chip)} = ${J(rsf.chip)}): what the live ring says`, { sf, rsf, cf });
  ok(rcf.bubbles === 2 && rcfU.bubbles === 2,
    `RED: the drawer before the cure draws a SECOND bubble when the copy is dated first (${rcf.bubbles} «Not delivered», ${rcfU.bubbles} «Not confirmed») — the message manager's drop by msgId holds only after a send record`, { rcf, rcfU });
}

say('㉗ UNIT 3 — SEND AGAIN and DISMISS a message proven not delivered (r4655 / r4664)');
WD.section('㉗');
{
  const sendAgain = (w, text, newId, oldId) => w.child.stdin.write(ad.formatChatInput(J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, webui_resend_of: oldId }), newId, {}).stdinPayload + '\n');
  const capOf = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const timesIn = (f, text) => capOf(f).split('\n').filter((l) => l.includes(text)).length;
  const stop = async (w) => { killCli(w); try { w.child.kill('SIGKILL'); } catch { } await Promise.race([w.exited, sleep(5000)]); WF.removeWrapperFiles(w.c ? w.c.buffers : path.dirname(w.buf), w.hubId); };
  const live = (w) => until(() => Number(w.sidecar().childPid) > 1 && !!(w.sidecar().caps || {}).undeliveredActs, 6000);

  // (a) THE REAL WRAPPER: one write, the words once, a second press refused by its record, a frame for a record not «not delivered» dropped
  const cA = conversation('u3-again'), capA = path.join(BASE, 'cap-u3-again');
  place(cA, [recordOf('mU3-old', null, { state: 'undelivered', settledAt: Date.now() - 1000 }), recordOf('mU3-landed', null, { state: 'landed', settledAt: Date.now() - 1000 })]);
  const wA = startWrapper(cA, 'sess-u3-again', { env: { STUB_CAPTURE: capA } });
  const upA = await live(wA);
  sendAgain(wA, words('mU3-old'), 'mU3-new', 'mU3-old');
  await until(() => wA.out.some((r) => r.type === 'input_handover' && r.state === 'resent'), 6000);
  await until(() => timesIn(capA, words('mU3-old')) > 0, 6000);
  sendAgain(wA, words('mU3-old'), 'mU3-new2', 'mU3-old');   // the second press (a second window, a second device)
  sendAgain(wA, words('mU3-landed'), 'mU3-new3', 'mU3-landed');   // a record that is not «not delivered» (the CLI took it)
  await until(() => wA.out.filter((r) => r.type === 'queue_op_result' && r.op === 'resend').length >= 2, 6000);
  const recA = recordsOf(cA), saidA = wA.out.find((r) => r.type === 'input_handover' && r.state === 'resent');
  const refA = Object.fromEntries(wA.out.filter((r) => r.type === 'queue_op_result' && r.op === 'resend').map((r) => [r.msg_id, r.reason]));
  ok(upA && recA.get('mU3-old')?.state === 'resent' && recA.get('mU3-new')?.state === 'handed' && typeof recA.get('mU3-new')?.copy === 'string' && recA.get('mU3-new').copy.includes(words('mU3-old')) && !!recA.get('mU3-new').cli && saidA?.resent_as === 'mU3-new',
    'Send again: ONE write ends the old record «resent» AND carries the new message\'s own record, handed (its copy, its CLI), then the word says it', { old: recA.get('mU3-old')?.state, nu: recA.get('mU3-new') && { state: recA.get('mU3-new').state, cli: !!recA.get('mU3-new').cli }, said: saidA });
  ok(timesIn(capA, words('mU3-old')) === 1 && refA['mU3-new2'] === 'already-resent' && !recA.has('mU3-new2') && refA['mU3-new3'] === 'not-undelivered' && timesIn(capA, words('mU3-landed')) === 0,
    'ONCE: the words reached the CLI once — a second press is refused by the record («already-resent», nothing written, nothing sent), and a press for a record that is not «not delivered» is dropped, refused by name', { refA, cli: timesIn(capA, words('mU3-old')) });
  await stop(wA);

  // (b) THE KILL HELD IN THE WINDOW between the one write and the hand-over (a scene copy: a FIFO read nobody writes — a hold, never a clock)
  const WRITE_LINE = "  if (!writeRecords()) { HR.set(old, was); HR.delete(msgId); return actRefused('resend', 'not-written', fields); }\n";
  const HOLD_LINE = '  fs.readFileSync(process.env.U3_HOLD);   /* SCENE: held between the one write and the hand-over */\n';
  const NEW_LINE = "  HR.set(msgId, { msgId, cliUuid: st.uuid, copy, cli: cliNow(), state: 'handed', at: Date.now(), settledAt: 0, via: 'resend' });\n";
  const R_HOLD = redWrapper('u3-hold', [[WRITE_LINE, WRITE_LINE + HOLD_LINE]]);
  const R_ALONE = redWrapper('u3-alone', [[NEW_LINE, '  /* MUTANT: the end state alone — no record of the new message */\n'], [WRITE_LINE, WRITE_LINE + HOLD_LINE]]);
  const held = async (tag, wrapper) => {
    const c = conversation('u3-' + tag), fifo = path.join(BASE, 'hold-' + tag), cap = path.join(BASE, 'cap-u3-' + tag);
    execFileSync('mkfifo', [fifo]);
    place(c, [recordOf('mU3h-old', null, { state: 'undelivered', settledAt: Date.now() - 1000 })]);
    const w = startWrapper(c, 'sess-u3-' + tag, { wrapper, env: { U3_HOLD: fifo, STUB_CAPTURE: cap } });
    await live(w);
    sendAgain(w, words('mU3h-old'), 'mU3h-new', 'mU3h-old');
    const wrote = await until(() => recordsOf(c).get('mU3h-old')?.state === 'resent', 6000);   // the write landed — the wrapper is held now
    const inWindow = { wrote, recs: [...recordsOf(c).keys()], said: w.out.some((r) => r.type === 'input_handover' && r.state === 'resent'), cli: timesIn(cap, words('mU3h-old')) };
    await stop(w);
    if (tag === 'hold') {   // THE NEXT WRAPPER (a Resume): it judges what the killed one left (the RED left nothing to judge)
      const w2 = startWrapper(c, 'sess-u3n-' + tag);
      await until(() => w2.out.some((r) => r.type === 'input_handover' && r.state === 'undelivered'), 8000);
      await stop(w2);
    }
    const mm = await stoppedView(c);
    const b = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === 'mU3h-new');
    return { inWindow, after: Object.fromEntries([...recordsOf(c)].map(([k, r]) => [k, r.state])), bubble: b ? { chip: b.queueState || null, words: JSON.stringify(b.content).includes(words('mU3h-old')) } : null, anyWords: mm.messages.some((m) => m.role === 'user' && JSON.stringify(m.content).includes(words('mU3h-old'))) };
  };
  const H = await held('hold', R_HOLD.path), HR_ = await held('alone', R_ALONE.path);
  ok(H.inWindow.wrote && H.inWindow.recs.includes('mU3h-new') && !H.inWindow.said && H.inWindow.cli === 0 && H.after['mU3h-new'] === 'undelivered' && H.bubble?.chip === 'undelivered' && H.bubble?.words === true,
    'A KILL HELD in the window between the one write and the hand-over (nothing said, nothing in the CLI): the next wrapper settles the NEW message «not delivered» and the view draws it with its words — never «resent» and the words nowhere', H);
  ok(R_HOLD.counts.join() === '1' && R_ALONE.counts.join() === '1,1' && HR_.inWindow.wrote && HR_.after['mU3h-old'] === 'resent' && !('mU3h-new' in HR_.after) && HR_.anyWords === false,
    'RED: a copy that writes the end state alone, killed in the same window — the old record says «resent» and the words are nowhere', HR_);

  // (c) DISMISS: the end state in the file first, a second press refused, a rebuild draws nothing — and before it, the bubble was drawn
  const cD = conversation('u3-dismiss');
  place(cD, [recordOf('mU3-dis', null, { state: 'undelivered', settledAt: Date.now() - 1000 })]);
  const before = bubbleOf(await stoppedView(cD), 'mU3-dis');
  const wD = startWrapper(cD, 'sess-u3-dismiss');
  await live(wD);
  wD.child.stdin.write(J({ type: 'undelivered-dismiss', msg_id: 'mU3-dis' }) + '\n');
  await until(() => wD.out.some((r) => r.type === 'input_handover' && r.state === 'dismissed'), 6000);
  wD.child.stdin.write(J({ type: 'undelivered-dismiss', msg_id: 'mU3-dis' }) + '\n');
  await until(() => wD.out.some((r) => r.type === 'queue_op_result' && r.op === 'dismiss'), 6000);
  const recD = recordsOf(cD), refD = wD.out.find((r) => r.type === 'queue_op_result' && r.op === 'dismiss');
  await stop(wD);
  const afterD = bubbleOf(await stoppedView(cD), 'mU3-dis');
  ok(before?.chip === 'undelivered' && recD.get('mU3-dis')?.state === 'dismissed' && refD?.reason === 'dismissed' && afterD === null,
    `Dismiss: «${before?.chip}» drawn before; the record «${recD.get('mU3-dis')?.state}» in the file; a second press refused («${refD?.reason}»); the rebuild draws it no more`, { before, after: afterD });

  // (d) A LIVE view keeps the dismissed bubble — its words selectable until the next rebuild (no undo, no confirm)
  {
    const mm = new MessageManager('dead-handover-suite');
    mm.convertHistory([{ ...JSON.parse(copyLine('mU3-live')), undelivered: true }]);
    mm.processLive({ type: 'input_handover', state: 'dismissed', msg_ids: ['mU3-live'], via: 'dismiss' });
    const b = bubbleOf(mm, 'mU3-live');
    const mm2 = new MessageManager('dead-handover-suite');
    mm2.convertHistory([{ ...JSON.parse(copyLine('mU3-live')), undelivered: true }, { type: 'input_handover', state: 'dismissed', msg_ids: ['mU3-live'], via: 'dismiss' }]);
    ok(b?.chip === 'dismissed' && b.words === true && bubbleOf(mm2, 'mU3-live') === null, 'live: the bubble stays with «Removed, not delivered» and its words; a rebuild of the same records draws it no more', { live: b, rebuilt: bubbleOf(mm2, 'mU3-live') });
  }

  // (e) THE HUB'S DOOR (src/server/undelivered-door.js): the person only at BOTH frames, the advert, once, the words only
  {
    const DOOR = require(path.join(ROOT, 'src/server/undelivered-door.js'));
    const pic = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
    const mkSession = () => {
      const mm = new MessageManager('dead-handover-suite');
      mm.convertHistory([{ ...JSON.parse(copyLine('mD-old')), undelivered: true }, { ...JSON.parse(J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: words('mD-pic') }, pic] }, msgId: 'mD-pic', cliUuid: stampOf('mD-pic'), _fromWebui: true, webui_copy: true, timestamp: new Date(Date.now() - 20000).toISOString() })), undelivered: true }]);
      const writes = [];
      return { pty: { write: (x) => writes.push(String(x)) }, mode: 'chat', socketPath: null, _normalizer: mm, _undeliveredActs: true, writes };
    };
    const person = { kind: 'human', actBy: null };
    const sent = [], sendUserInput = (sid, frame, opts) => { sent.push({ sid, frame, opts }); return { ok: true }; };   // the typing path's stand-in: what the door hands it
    const s1 = mkSession();
    const noOne = [DOOR.resend(s1, 'sess-door', { by: null, msgId: 'mD-old', sendUserInput }), DOOR.dismiss(s1, 'sess-door', { by: null, msgId: 'mD-old' })];
    const old = DOOR.resend({ ...s1, _undeliveredActs: false }, 'sess-old', { by: person, msgId: 'mD-old', sendUserInput });
    ok(noOne.every((r) => r.ok === false && r.reason === 'human_only') && old.reason === 'wrapper-old' && sent.length === 0 && s1.writes.length === 0,
      'the door: a sign-in that is not a person\'s is refused by name at BOTH frames (human_only), an agent started before the update by its advert — nothing sent, nothing written', { noOne, old });
    const r1 = DOOR.resend(s1, 'sess-door', { by: person, msgId: 'mD-old', sendUserInput });
    const r2 = DOOR.resend(s1, 'sess-door', { by: person, msgId: 'mD-old', sendUserInput });
    s1._normalizer.processLive({ type: 'input_handover', state: 'resent', msg_ids: ['mD-old'], resent_as: 'x', via: 'resend' });
    const r3 = DOOR.resend(s1, 'sess-door', { by: person, msgId: 'mD-old', sendUserInput });
    const f1 = sent[0] ? JSON.parse(sent[0].frame) : null;
    ok(r1.ok === true && r2.reason === 'pending' && r3.reason === 'already-resent' && sent.length === 1 && f1?.webui_resend_of === 'mD-old' && f1.message.content.length === 1 && f1.message.content[0].text === words('mD-old') && sent[0].opts.origin === 'ws' && sent[0].opts.door === 'enter' && sent[0].opts.msgId !== 'mD-old',
      'Send again is the person\'s own send road (origin ws, the Enter door) with the OLD words and a new id; a second press while its word is out is refused «pending», after the word «already-resent» — sent once', { r1, r2, r3, opts: sent[0] && sent[0].opts });
    const p = DOOR.resend(s1, 'sess-door', { by: person, msgId: 'mD-pic', sendUserInput });
    const fp = sent[1] ? JSON.parse(sent[1].frame) : null;
    ok(p.ok === true && p.pictures === 1 && fp?.message.content.every((b) => b.type === 'text'), 'a message that carried a picture: its words go again, the picture does not — the answer counts it (the page says so)', { p });
    const s2 = mkSession();
    const d1 = DOOR.dismiss(s2, 'sess-door', { by: person, msgId: 'mD-old' }), d2 = DOOR.dismiss(s2, 'sess-door', { by: person, msgId: 'mD-old' });
    s2._normalizer.processLive({ type: 'queue_op_result', op: 'dismiss', ok: false, reason: 'not-written', msg_id: 'mD-old' });   // the wrapper's refusal: the press is answered
    const d3 = DOOR.dismiss(s2, 'sess-door', { by: person, msgId: 'mD-old' });
    ok(d1.ok === true && d2.reason === 'pending' && d3.ok === true && s2.writes.length === 2 && JSON.parse(s2.writes[0]).type === 'undelivered-dismiss' && JSON.parse(s2.writes[0]).msg_id === 'mD-old',
      'Dismiss: the frame to the wrapper once per press; a second press while its word is out «pending»; the wrapper\'s refusal answers it (the act count moved — never a clock) and the person may press again', { d1, d2, d3, writes: s2.writes.length });
  }
  // (f) THE WIRING: the ws cases hand `by` only for a socket whose handshake proved a person (the rewind's and End-them's proof)
  const WSH = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
  ok(WSH.includes("case 'undelivered-resend':\n        case 'undelivered-dismiss': {") && WSH.includes("D = require('./server/undelivered-door.js'), by = ws._personPage === true ? byOfWs(ws) : null;") && WSH.includes("ws.send(JSON.stringify({ type: data.type + '-result', sessionId: data.sessionId, reqId: data.reqId ?? null, msgId, ...r }))"),
    'the two ws cases: `by` only from the handshake\'s person proof, the answer to THIS socket alone');
}

say('⑦b TWO WRITERS — the merge and the forward-only state, each with its control');
WD.section('⑦b');
ok(U7.recs.get('msg-other-writer')?.state === 'undelivered' && U7.recs.get('msg-z-merge')?.state === 'undelivered' && U7.recs.has('msg-y-merge')
  && R_NOMERGE.counts[0] === 1 && !U7m.recs.has('msg-other-writer') && R_ANYRANK.counts[0] === 1 && U7r.recs.get('msg-z-rank-red')?.state === 'handed',
  `another writer's record is kept and a verdict another writer wrote («undelivered») is never moved back by this wrapper's older «handed» — RED: a write that does not read the file loses the other's record; a merge where the later wins moves the verdict back («${U7r.recs.get('msg-z-rank-red')?.state}»)`, { lane: [...U7.recs.values()].map((r) => [r.msgId, r.state]) });

for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 8, label: 'B-5a4d root ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
