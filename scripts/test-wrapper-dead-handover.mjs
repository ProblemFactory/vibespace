#!/usr/bin/env node
// THE NEXT WRAPPER SETTLES WHAT A DEAD ONE HANDED (row B-5a4d, its root — 主开发 r2852). A wrapper that died mid-turn wrote no settle
// for a frame it had handed to the CLI, and its successor's first write replaced its file: the copy and its 'handed' record stayed
// owed in the hub's ring for the life of the conversation object, the message afloat with «read at its next tool call» for good.
// data/bin/chat-wrapper.js now reads the last wrapper's file ONCE before its first write and settles each frame handed with no settle:
// 'landed' when the transcript's tail holds the frame's stamp, 'stopped' when the read proves it is not there. FAST, the REAL wrapper
// over the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs), a scratch config folder holding the conversation's transcript.
//   ① THE SETTLE: a dead file with five frames — one the CLI recorded (landed), one it never did (stopped), one settled before it died,
//      one Stop kept, one copy with no stamp (an older build: left) — ONE record each for the two, on stdout and in the new file, after
//      the boot's queue baseline; nothing for the other three; the log says the count
//   ② THE WINDOW: a transcript past the bound (4 MB read from its end) — a stamp inside the window lands; a frame sent after the
//      window's first record and absent is stopped; one sent before it cannot be proven either way and is left (said)
//   ③ NO DEAD ONE: a fresh start, and a last file with no hand-over — no settle record
//   ④ THE PAGE: the normalizer draws a 'stopped' frame IN ITS PLACE with the 'stopped' chip, a 'landed' one with «Steered»;
//      RED: a normalizer that does not know 'stopped' keeps it afloat with «read at its next tool call»
//   ⑤ RED: a wrapper copy that never settles says nothing of the dead one's frames
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
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 600)}`); } }
const WD = armWatchdog({ capMs: 30e3 });
const WRAPPER = path.join(ROOT, 'data/bin/chat-wrapper.js');
const STAND_IN = path.join(ROOT, 'scripts/fixtures/claude-stand-in-cli.cjs');
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dead-handover-'));
process.on('exit', () => { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { } });
const CFG = path.join(BASE, 'config');   // the conversation's CLAUDE_CONFIG_DIR — never the machine's own
const M = mutantCopies('dead-handover', ROOT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(10); } return fn(); };

// ── the lines, as the wrapper writes them ──
const uuidOf = (id) => '00000000-0000-4000-8000-' + Buffer.from(id).toString('hex').padEnd(12, '0').slice(0, 12);
const T = (hhmm) => `2026-11-23T${hhmm}:00.000Z`;
const copy = (id, { stamp = true, at = T('10:00') } = {}) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'words of ' + id }] }, msgId: id, cliUuid: stamp ? uuidOf(id) : null, handNo: 1, _fromWebui: true, webui_copy: true, timestamp: at });
const hand = (ids, state) => JSON.stringify({ type: 'input_handover', state, msg_ids: ids, via: 'enter' });
const dropped = (o) => JSON.stringify({ type: 'queue_dropped', id: '1-1', items: [], keptIds: [], landedIds: [], ...o });
const queueEmpty = JSON.stringify({ type: 'queue_changed', items: [] });
let k = 0;
const rec = (sid, cwd, o) => JSON.stringify({ sessionId: sid, cwd, ...o });
const said = (sid, cwd, at, text = 'the turn says more ') => rec(sid, cwd, { type: 'assistant', uuid: '11111111-0000-4000-8000-' + String(k++).padStart(12, '0'), timestamp: at, message: { id: 'msg_' + k, role: 'assistant', content: [{ type: 'text', text }] } });
/** a world: a working folder, its transcript under CFG, a buffer folder holding the last wrapper's file (null = none) */
function world(tag, { dead = null, transcript = [] } = {}) {
  const cwd = fs.mkdtempSync(path.join(BASE, 'cwd-' + tag + '-'));
  const real = fs.realpathSync(cwd);
  const sid = '55555555-0000-4000-8000-' + Buffer.from(tag).toString('hex').padEnd(12, '0').slice(0, 12);
  const proj = path.join(CFG, 'projects', real.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, sid + '.jsonl'), transcript.map((f) => f(sid, real)).join('\n') + (transcript.length ? '\n' : ''));
  const dir = fs.mkdtempSync(path.join(BASE, 'buf-' + tag + '-'));
  if (dead !== null) fs.writeFileSync(path.join(dir, 's.buf'), dead);
  return { cwd: real, sid, dir, buf: path.join(dir, 's.buf') };
}
/** the REAL wrapper (or a copy) started as the hub starts a resumed claude conversation; → its records, its file, its log */
async function start(w, { wrapper = WRAPPER, waitFor = 'log', graceMs = 6000 } = {}) {
  const child = spawn(process.execPath, [wrapper, w.buf, path.join(w.dir, 's.json'), process.execPath, STAND_IN, '--resume', w.sid], { cwd: w.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CONFIG_DIR: CFG, VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
  const recs = []; let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { recs.push(JSON.parse(l)); } catch { } } });
  const log = () => { try { return fs.readFileSync(path.join(w.dir, 'chat-wrapper.log'), 'utf8'); } catch { return ''; } };
  try {
    const baseline = await until(() => recs.some((r) => r.type === 'queue_changed'), graceMs);
    if (waitFor === 'log') await until(() => /dead hand-overs: /.test(log()), graceMs);
    else await sleep(waitFor);   // a RED copy says nothing: its silence is read after a bound (its baseline came first)
    const file = (() => { try { return fs.readFileSync(w.buf, 'utf8'); } catch { return ''; } })();
    const settles = recs.filter((r) => r.type === 'input_handover' && r.via === 'successor');
    return { baseline, recs, settles, file, log: log(), by: (st) => settles.filter((r) => r.state === st).flatMap((r) => r.msg_ids) };
  } finally { await stopWrapper(child, { dir: w.dir }); }
}
const J = JSON.stringify;

const ML = 'msg-landed', MS = 'msg-stopped', MD = 'msg-settled', MK = 'msg-kept', MN = 'msg-nostamp';
const DEAD1 = [queueEmpty,
  copy(ML), hand([ML], 'handed'),
  copy(MS), hand([MS], 'handed'),
  copy(MD), hand([MD], 'handed'), hand([MD], 'landed'),
  copy(MK), hand([MK], 'handed'), dropped({ keptIds: [MK] }),
  copy(MN, { stamp: false }), hand([MN], 'handed'),
].join('\n') + '\n';
const w1 = world('one', { dead: DEAD1, transcript: [
  (sid, cwd) => rec(sid, cwd, { type: 'user', uuid: '33333333-0000-4000-8000-000000000001', timestamp: T('09:59'), message: { role: 'user', content: 'start the long task' } }),
  (sid, cwd) => said(sid, cwd, T('09:59')),
  (sid, cwd) => rec(sid, cwd, { type: 'user', uuid: uuidOf(ML), timestamp: T('10:00'), message: { role: 'user', content: [{ type: 'text', text: 'words of ' + ML }] } }),   // the CLI's record of the landed frame
  (sid, cwd) => said(sid, cwd, T('10:01')),
] });
const MW = 'msg-in-window', MP = 'msg-provable', MU = 'msg-unprovable';
const DEAD2 = [copy(MU, { at: T('09:00') }), hand([MU], 'handed'), copy(MP, { at: T('10:00') }), hand([MP], 'handed'), copy(MW, { at: T('09:31') }), hand([MW], 'handed')].join('\n') + '\n';
const PAD = 'the turn says more '.repeat(14);
const old = Array.from({ length: 3000 }, () => (sid, cwd) => said(sid, cwd, T('08:00'), PAD));       // ~1 MB the read never reaches
const recent = Array.from({ length: 15000 }, () => (sid, cwd) => said(sid, cwd, T('09:30'), PAD));   // ~4.5 MB: the window starts inside these
const w2 = world('two', { dead: DEAD2, transcript: [...old, ...recent,
  (sid, cwd) => rec(sid, cwd, { type: 'user', uuid: uuidOf(MW), timestamp: T('09:31'), message: { role: 'user', content: [{ type: 'text', text: 'words of ' + MW }] } }),
  (sid, cwd) => said(sid, cwd, T('09:32')),
] });
const tsize = fs.statSync(path.join(CFG, 'projects', w2.cwd.replace(/[/._]/g, '-'), w2.sid + '.jsonl')).size;
// every scene's wrapper runs AT ONCE (each its own folder, transcript and stand-in); each section reads its own
const CW_SRC = fs.readFileSync(WRAPPER, 'utf8');
const CALL = "settleDeadHandovers(DEAD).catch((e) => log(`dead hand-overs: not settled (${e && e.message})`));   // B-5a4d's root: after the baseline, off the input path\n";
const ctl = fs.mkdtempSync(path.join(BASE, 'ctl-'));
fs.mkdirSync(path.join(ctl, 'data', 'bin'), { recursive: true });
fs.symlinkSync(path.join(ROOT, 'src'), path.join(ctl, 'src'));
fs.writeFileSync(path.join(ctl, 'data', 'bin', 'chat-wrapper.js'), CW_SRC.split(CALL).join(''));
const RUNS = Promise.all([
  start(w1),
  start(w2),
  start(world('fresh'), { waitFor: 300 }),
  start(world('quiet', { dead: [queueEmpty, copy('msg-held-only'), JSON.stringify({ type: 'queued_input', msg_id: 'msg-held-only', turn_id: null })].join('\n') + '\n' }), { waitFor: 300 }),
  start(world('red', { dead: DEAD1, transcript: [(sid, cwd) => rec(sid, cwd, { type: 'user', uuid: uuidOf(ML), timestamp: T('10:00'), message: { role: 'user', content: 'x' } })] }), { wrapper: path.join(ctl, 'data', 'bin', 'chat-wrapper.js'), waitFor: 1000 }),
]);
say('① THE SETTLE — the dead one\'s five frames: landed, stopped, settled before, kept by Stop, no stamp');
WD.section('①');
const [r1, r2, r3a, r3b, r5] = await RUNS;
ok(r1.baseline && J(r1.by('landed')) === J([ML]) && J(r1.by('stopped')) === J([MS]) && r1.settles.length === 2,
  `the frame the CLI recorded is settled 'landed', the one it never recorded 'stopped' — ONE record each, on stdout (landed ${J(r1.by('landed'))}, stopped ${J(r1.by('stopped'))})`, { settles: r1.settles, log: r1.log.slice(-400) });
ok(![MD, MK, MN].some((id) => r1.settles.some((r) => r.msg_ids.includes(id))) && /dead hand-overs: 3 frame\(s\) the last wrapper handed with no settle — 1 landed, 1 stopped, 1 left as they were \(1 with no stamp/.test(r1.log),
  'a frame settled before the death, one Stop kept and a copy with no stamp get NO record; the log says 3 owed — 1 landed, 1 stopped, 1 left (no stamp)', { log: r1.log.split('\n').filter((l) => l.includes('dead hand-overs')) });
const at = (s) => r1.file.indexOf(s);
ok(at('"type":"queue_changed"') >= 0 && at('"state":"landed"') > at('"type":"queue_changed"') && at('"state":"stopped"') > at('"type":"queue_changed"') && !r1.file.includes('"webui_copy":true'),
  'the settles are IN THE NEW FILE after the boot\'s queue baseline (written through, as every hand-over word); the dead copies are not carried into it', { file: r1.file.slice(0, 400) });

say('② THE WINDOW — a transcript past the 4 MB read: a stamp inside lands; absence is proven only back to the window\'s first record');
WD.section('②');
ok(tsize > 4 * 1024 * 1024 + 500000 && J(r2.by('landed')) === J([MW]) && J(r2.by('stopped')) === J([MP]) && !r2.settles.some((r) => r.msg_ids.includes(MU)) && /1 the last 4194304 bytes of the transcript cannot prove either way/.test(r2.log),
  `a ${(tsize / 1048576).toFixed(1)} MB transcript: the stamp inside the window lands; a frame sent after the window's first record is stopped; one sent before it is LEFT and said (landed ${J(r2.by('landed'))}, stopped ${J(r2.by('stopped'))})`, { settles: r2.settles, log: r2.log.split('\n').filter((l) => l.includes('dead hand-overs')) });

say('③ NO DEAD ONE — a fresh start, a last file with no hand-over: no settle');
WD.section('③');
ok(r3a.baseline && r3b.baseline && r3a.settles.length === 0 && r3b.settles.length === 0 && !/dead hand-overs/.test(r3a.log + r3b.log),
  'a start with no last file, and one whose last file holds no hand-over: no settle record, no log line (nothing was read past a stat)', { a: r3a.settles, b: r3b.settles });

say('④ THE PAGE — a stopped frame IN ITS PLACE with its chip; a landed one «Steered»');
WD.section('④');
const { MessageManager } = require(path.join(ROOT, 'src/message-manager.js'));
const MM_SRC = fs.readFileSync(path.join(ROOT, 'src/message-manager.js'), 'utf8');
const UNKNOWN = require(M.write('src/message-manager.js', anchored(MM_SRC, "kept: 'kept', stopped: 'stopped' }[raw.state];", "kept: 'kept' }[raw.state];   // MUTANT: 'stopped' unknown", 'no-stopped'), 'no-stopped')).MessageManager;
const draw = (MMClass, id, settle) => {
  const mm = new MMClass('dead-handover-suite');
  mm.convertHistory([JSON.parse(copy(id)), JSON.parse(hand([id], 'handed')), JSON.parse(JSON.stringify({ type: 'input_handover', state: settle, msg_ids: [id], via: 'successor' }))]);
  const b = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === id);
  return { chip: b ? b.queueState || null : 'no bubble', afloat: !!(b && (mm._afloat || []).includes(b)) };
};
const pS = draw(MessageManager, MS, 'stopped'), pL = draw(MessageManager, ML, 'landed'), pR = draw(UNKNOWN, MS, 'stopped');
ok(pS.chip === 'stopped' && !pS.afloat && pL.chip === 'steered' && !pL.afloat && pR.chip === 'handed' && pR.afloat,
  `the settled frames take their place: 'stopped' → chip «${pS.chip}», afloat ${pS.afloat}; 'landed' → «${pL.chip}», afloat ${pL.afloat} — RED: a normalizer that does not know 'stopped' leaves «${pR.chip}» afloat ${pR.afloat}`, { pS, pL, pR });

say('⑤ RED — a wrapper copy that never settles');
WD.section('⑤');
ok(CW_SRC.split(CALL).length === 2 && r5.baseline && r5.settles.length === 0,
  `RED: a copy of the wrapper without the settle call (its anchor spelled once: ${CW_SRC.split(CALL).length - 1}) starts, says its baseline and NOTHING of the dead one's frames`, { settles: r5.settles });

for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 1, label: 'B-5a4d root ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
