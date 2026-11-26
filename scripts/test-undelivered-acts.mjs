#!/usr/bin/env node
// B-5a4d ROOT UNIT 3 — SEND AGAIN AND DISMISS A MESSAGE PROVEN NOT DELIVERED (lane bl-keys-misc; the coordinator's r4655 / r4664, its
// cure r4682 and follow r4746). Moved out of test-wrapper-dead-handover as its own fast suite (that suite read 11.4 s alone with it — over
// the 10 s fast bound): the REAL chat wrapper over the stand-in CLI, the REAL store and normalizer, the hub's door
// (src/server/undelivered-door.js). No real CLI, no hub, no network.
//   ㉗ (unit 3, r4655 / r4664) SEND AGAIN and DISMISS a message proven not delivered: the real wrapper's ONE write (the old record
//      resent AND the new one handed) before anything is handed on, the words once in the CLI's stdin, a second press refused by
//      its record; a kill HELD in that window (a scene copy with a placed FIFO hold, never a clock) leaves the new message to the
//      next wrapper, drawn «Not delivered» with its words — RED: a copy that writes the end state alone loses them; Dismiss writes
//      first, a rebuild draws nothing, a live view keeps the bubble; the hub's door: the person only (both frames), once, words only;
//      (r4682 M1) a Send again HELD mid-turn and then taken back (Stop's put-back, the removal) ends its record there — the CLI's exit
//      never brings it back «Not delivered»; RED: the tip's wrapper (no ending) does; the door's two REDs (no pending mark, no person check)
//      (r5202, 2.369.421's law 6) a held Send again at a STOP: the Stop reaches the CLI while the records' sync is HELD (the hotfix's own
//      preload, its mark the witness), the record written after; RED: the write where it stood (inside the drop, before the forward)
// Run: node scripts/test-undelivered-acts.mjs
import { anchored } from './scratch.mjs';
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
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-undelivered-acts-'));
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
const M = mutantCopies('undelivered-acts', ROOT);
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
function startWrapper(c, hubId, { wrapper = WRAPPER, extra = [], env: more = {}, node = [] } = {}) {
  const buf = path.join(c.buffers, hubId + '.buf'), meta = path.join(c.buffers, hubId + '.json');
  const child = spawn(process.execPath, [...node, wrapper, buf, meta, process.execPath, STAND_IN, '--resume', c.conv, ...extra], { cwd: c.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HOME, CLAUDE_CONFIG_DIR: CFG, VIBESPACE_SKIP_AGENT_HOOKS: '1', STAND_IN_LONG_MS: '60000', ...more } });
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
  const mm = new MessageManager('undelivered-acts-suite'); mm.convertHistory(sm.raw());
  return mm;
}
const bubbleOf = (mm, id) => { const b = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === id); return b ? { chip: b.queueState || null, words: JSON.stringify(b.content).includes(words(id)), index: mm.messages.indexOf(b), of: mm.messages.length } : null; };

// the dead-handover suite's own helpers this leg uses (copied: a suite is no module)
const stampOf = (id) => '00000000-0000-4000-8000-' + Buffer.from(id).toString('hex').padEnd(12, '0').slice(0, 12);
const copyLine = (id, text = words(id), at = Date.now() - 30000) => J({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, msgId: id, cliUuid: stampOf(id), _fromWebui: true, webui_copy: true, timestamp: new Date(at).toISOString() });
const recordOf = (id, cli, o = {}) => ({ msgId: id, cliUuid: stampOf(id), copy: o.copy !== undefined ? o.copy : copyLine(id, o.text, o.at), cli, state: o.state || 'handed', at: o.at || Date.now() - 30000, settledAt: o.settledAt || 0, via: 'enter' });
const place = (c, recs, id = c.conv) => { fs.mkdirSync(path.join(c.buffers, 'handed'), { recursive: true }); fs.writeFileSync(HANDED.fileOf(c.buffers, id), J({ v: 1, frames: recs })); };
const logHas = (w, re) => re.test(w.log());
const CW_SRC = fs.readFileSync(WRAPPER, 'utf8');
/** RED copies of the wrapper: each its own folder, src/ linked; → { path, counts } (each edit through anchored(): a moved anchor throws by name) */
const redWrapper = (tag, edits) => {
  let s = CW_SRC; const counts = [];
  for (const [a, b] of edits) { s = anchored(s, a, b, 'the wrapper RED ' + tag); counts.push(1); }   // a moved anchor THROWS by the control's name
  const d = fs.mkdtempSync(path.join(BASE, 'ctl2-' + tag + '-')); fs.mkdirSync(path.join(d, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'src'), path.join(d, 'src')); fs.writeFileSync(path.join(d, 'data', 'bin', 'chat-wrapper.js'), s);
  return { path: path.join(d, 'data', 'bin', 'chat-wrapper.js'), counts };
};

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
    const mm = new MessageManager('undelivered-acts-suite');
    mm.convertHistory([{ ...JSON.parse(copyLine('mU3-live')), undelivered: true }]);
    mm.processLive({ type: 'input_handover', state: 'dismissed', msg_ids: ['mU3-live'], via: 'dismiss' });
    const b = bubbleOf(mm, 'mU3-live');
    const mm2 = new MessageManager('undelivered-acts-suite');
    mm2.convertHistory([{ ...JSON.parse(copyLine('mU3-live')), undelivered: true }, { type: 'input_handover', state: 'dismissed', msg_ids: ['mU3-live'], via: 'dismiss' }]);
    ok(b?.chip === 'dismissed' && b.words === true && bubbleOf(mm2, 'mU3-live') === null, 'live: the bubble stays with «Removed, not delivered» and its words; a rebuild of the same records draws it no more', { live: b, rebuilt: bubbleOf(mm2, 'mU3-live') });
  }


  // (g) r4682 M1: A SEND AGAIN HELD MID-TURN, THEN TAKEN BACK — by Stop (put back into the box) and by the person's removal — never
  // reached the CLI: its record ends in that road, and the CLI's exit does not bring it back «Not delivered». RED: the tip's wrapper
  const TAKEN_STOP = "  endTakenBack(dropped.map((q) => q.msgId), 'stop');   // unit 3's cure: a held Send again put back — its record ends here\n";
  const TAKEN_REMOVE = "  endTakenBack([dropped.msgId], 'remove');   // unit 3's cure: a held Send again removed — its record ends here\n";
  const R_TIP = redWrapper('u3-tip', [[TAKEN_STOP, '  /* MUTANT: the tip — nothing ends the record */\n'], [TAKEN_REMOVE, '  /* MUTANT: the tip — nothing ends the record */\n']]);
  const takenBack = async (tag, how, wrapper) => {
    const c = conversation('u3-tb-' + tag);
    place(c, [recordOf('mTB-old', null, { state: 'undelivered', settledAt: Date.now() - 1000 })]);
    const w = startWrapper(c, 'sess-u3-tb-' + tag, wrapper ? { wrapper } : {});
    await live(w);
    w.child.stdin.write(ad.formatChatInput('TOOL-A run a slow command', 'm-tool-tb-' + tag).stdinPayload + '\n');   // a turn that runs a tool (60 s)
    await until(() => w.out.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')), 6000);
    sendAgain(w, words('mTB-old'), 'mTB-new', 'mTB-old');   // no steer: HELD behind the running turn
    await until(() => w.out.some((r) => r.type === 'queued_input' && r.msg_id === 'mTB-new'), 6000);
    const heldRec = recordsOf(c).get('mTB-new')?.state;
    if (how === 'stop') w.child.stdin.write(J({ type: 'control_request', request_id: 'tb-stop-' + tag, request: { subtype: 'interrupt' } }) + '\n');
    else { const row = [...w.out].reverse().find((r) => r.type === 'queue_changed' && (r.items || []).some((it) => it.msgId === 'mTB-new')); w.child.stdin.write(J({ type: 'queue-op', op: 'remove', id: row ? row.items.find((it) => it.msgId === 'mTB-new').id : 'none' }) + '\n'); }
    await until(() => w.out.some((r) => r.type === 'queue_op_result' && r.op === 'remove' && r.msg_id === 'mTB-new' && r.ok !== false), 6000);
    const taken = recordsOf(c).get('mTB-new');
    killCli(w);   // THE CLI ENDS: the wrapper settles what it handed to that CLI (settleOnExit), then exits — its exit is the fact waited on
    const exited = await until(() => w.child.exitCode !== null || w.child.signalCode !== null, 8000);   // r4746: the never-clause is read only after the exit (said by name if it never came)
    await stop(w);
    const b = (await stoppedView(c)).messages.find((m) => m.role === 'user' && m.webuiMsgId === 'mTB-new');
    return { exited, heldRec, taken: taken && { state: taken.state, via: taken.via }, after: recordsOf(c).get('mTB-new')?.state, chip: b ? b.queueState || null : null };
  };
  const TBs = await takenBack('stop', 'stop'), TBr = await takenBack('remove', 'remove'), TBred = await takenBack('red', 'stop', R_TIP.path), TBredR = await takenBack('red-remove', 'remove', R_TIP.path);
  ok(TBs.exited && TBr.exited && TBs.heldRec === 'handed' && TBs.taken?.state === 'dismissed' && TBs.taken?.via === 'stop' && TBs.after === 'dismissed' && TBs.chip !== 'undelivered'
    && TBr.taken?.state === 'dismissed' && TBr.taken?.via === 'remove' && TBr.after === 'dismissed' && TBr.chip !== 'undelivered',
    'a Send again HELD mid-turn and taken back — by Stop and by the removal — ends its record in that road («dismissed»); the CLI\'s exit leaves it so and the rebuild draws no «Not delivered»', { TBs, TBr });
  ok(R_TIP.counts.join() === '1,1' && TBred.exited && TBred.after === 'undelivered' && TBred.chip === 'undelivered' && TBredR.exited && TBredR.after === 'undelivered' && TBredR.chip === 'undelivered',
    'RED (the tip\'s wrapper), on BOTH roads: nothing ends the record — the CLI\'s exit settles the words the person took back (by Stop, by the removal) «not delivered», offered again', { TBred, TBredR });

  // (h) r5202 (the hotfix 2.369.421's law 6): A HELD SEND AGAIN AT A STOP — the Stop reaches the CLI FIRST, the taken-back record's write
  // after it. The hotfix's own scene: the wrapper's first fsync of a handed records file after ARM is HELD by a preload until this run
  // releases it (never a clock); its mark names the file it held — the WITNESS that the hold was in force (r5135 law 1)
  const HOLDJS = path.join(BASE, 'hold-sync.cjs');
  fs.writeFileSync(HOLDJS, [
    "'use strict';",
    "const fs = require('fs'), E = process.env, ARM = E.SYNC_HOLD_ARM || '', MARK = E.SYNC_HOLD_MARK || '', REL = E.SYNC_HOLD_RELEASE || '';",
    "const paths = new Map(), open = fs.openSync;",
    "fs.openSync = function (p, ...a) { const fd = open.call(fs, p, ...a); try { paths.set(fd, String(p)); } catch (e) { } return fd; };",
    "const realSync = fs.fsyncSync; let done = false;",
    "fs.fsyncSync = function (fd) {",
    "  if (!done && ARM && fs.existsSync(ARM) && /[\\\\/]handed[\\\\/]/.test(paths.get(fd) || '')) {   // only the handed records' sync: a meta timer's passes",
    "    done = true;",
    "    try { fs.writeFileSync(MARK, JSON.stringify({ file: paths.get(fd) || null })); } catch (e) { }",
    "    const sab = new Int32Array(new SharedArrayBuffer(4)), end = Date.now() + 30000;   // the run releases it; 30 s only names a run that never did",
    "    while (!fs.existsSync(REL) && Date.now() < end) Atomics.wait(sab, 0, 0, 10);",
    "  }",
    "  return realSync.call(fs, fd);",
    "};",
  ].join('\n') + '\n');
  const OWED_LINE = "  if (changed) { if (handedAfterStop) handedDue = true; else if (!writeRecords()) log(`handed records: ${ids.join(', ')} taken back (${via}) — its record could not be written now (this wrapper carries it: the next records write takes it)`); }\n";
  const R_INDROP = redWrapper('u3-indrop', [[OWED_LINE, "  if (changed && !writeRecords()) log(`handed records: ${ids.join(', ')} taken back (${via})`);   /* MUTANT: the write where it stood — inside the drop, before the forward */\n"]]);
  const stopHeld = async (tag, wrapper) => {
    const c = conversation('u3-sh-' + tag), cap = path.join(BASE, 'cap-sh-' + tag), arm = path.join(BASE, 'arm-sh-' + tag), mark = path.join(BASE, 'held-sh-' + tag), rel = path.join(BASE, 'rel-sh-' + tag);
    place(c, [recordOf('mSH-old', null, { state: 'undelivered', settledAt: Date.now() - 1000 })]);
    const w = startWrapper(c, 'sess-u3-sh-' + tag, { ...(wrapper ? { wrapper } : {}), node: ['-r', HOLDJS], env: { STUB_CAPTURE: cap, SYNC_HOLD_ARM: arm, SYNC_HOLD_MARK: mark, SYNC_HOLD_RELEASE: rel } });
    await live(w);
    w.child.stdin.write(ad.formatChatInput('TOOL-A run a slow command', 'm-tool-sh-' + tag).stdinPayload + '\n');   // a turn that runs a tool
    await until(() => w.out.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')), 6000);
    sendAgain(w, words('mSH-old'), 'mSH-new', 'mSH-old');   // HELD behind the running turn — its record written «handed» now, before the hold is armed
    const queued = await until(() => w.out.some((r) => r.type === 'queued_input' && r.msg_id === 'mSH-new'), 6000);
    fs.writeFileSync(arm, '1');   // ARM: the next fsync of a handed records file waits for this run's release
    w.child.stdin.write(J({ type: 'control_request', request_id: 'sh-stop-' + tag, request: { subtype: 'interrupt' } }) + '\n');   // THE PERSON's STOP
    const held = await until(() => fs.existsSync(mark), 6000);   // the witness: the taken-back record's sync is held now
    const cliGotStop = await until(() => capOf(cap).includes('"subtype":"interrupt"'), 3000);   // the Stop in the CLI's stdin WHILE the sync is held — its absence past 3 s is the red, said by name
    const onDisk = recordsOf(c).get('mSH-new')?.state;   // while held: still «handed» in the file
    fs.writeFileSync(rel, '1');   // RELEASE
    const written = await until(() => recordsOf(c).get('mSH-new')?.state === 'dismissed', 6000);
    await stop(w);
    let file = null; try { file = JSON.parse(fs.readFileSync(mark, 'utf8')).file; } catch { }
    return { queued, held, file, cliGotStop, onDisk, written };
  };
  const SH = await stopHeld('owed'), SHr = await stopHeld('indrop', R_INDROP.path);
  ok(SH.queued && SH.held && /[\\/]handed[\\/]/.test(SH.file || '') && SH.cliGotStop && SH.onDisk === 'handed' && SH.written,
    'a held Send again at a Stop: the Stop reaches the CLI WHILE the records sync is held (the witness: the held file is a handed records file), and the taken-back record is written «dismissed» after it', SH);
  ok(R_INDROP.counts.join() === '1' && SHr.queued && SHr.held && !SHr.cliGotStop && SHr.written,
    'RED: the write where it stood (inside the drop, before the forward) — the held sync holds the Stop: the CLI has not read it while the sync is held', SHr);
  // (e) THE HUB'S DOOR (src/server/undelivered-door.js): the person only at BOTH frames, the advert, once, the words only
  {
    const DOOR = require(path.join(ROOT, 'src/server/undelivered-door.js'));
    const pic = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
    const mkSession = () => {
      const mm = new MessageManager('undelivered-acts-suite');
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

    // r4682: the door's checks each have their RED — a copy without the pending mark sends twice; a copy without the person check sends for anyone
    const DOOR_SRC = fs.readFileSync(path.join(ROOT, 'src/server/undelivered-door.js'), 'utf8');
    const NOPEND = M.load('src/server/undelivered-door.js', anchored(DOOR_SRC, '  pend.set(msgId, g.bubble.acts);   // before the write: a second press on this loop meets it\n', '  /* MUTANT: no pending mark */\n', 'door RED nopend'), 'door-nopend');
    const ANYONE = M.load('src/server/undelivered-door.js', anchored(DOOR_SRC, "  if (!by) return refused('human_only');\n", '  /* MUTANT: no person check */\n', 'door RED anyone'), 'door-anyone');
    const sR = mkSession(), sentR = [], sendR = (sid, frame, opts) => { sentR.push(frame); return { ok: true }; };
    const n1 = NOPEND.resend(sR, 'sess-door', { by: person, msgId: 'mD-old', sendUserInput: sendR }), n2 = NOPEND.resend(sR, 'sess-door', { by: person, msgId: 'mD-old', sendUserInput: sendR });
    const a1 = ANYONE.dismiss(mkSession(), 'sess-door', { by: null, msgId: 'mD-old' });
    ok(n1.ok === true && n2.ok === true && sentR.length === 2 && a1.ok === true, 'RED: a door without its pending mark sends a second press too (2 sends); a door without its person check takes a press from no person', { n2, a1 });
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

for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 2, label: 'B-5a4d unit 3 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
