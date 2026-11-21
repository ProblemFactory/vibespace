#!/usr/bin/env node
// test-answer-caps — lane lg-remote-hardening (B-7f0b, design q-042 D8; the coordinator's word r228): THE DEVICE LINK'S BOUNDS.
// A request and its answer each ride ONE control line (src/agentd/mux.js). FAST, in-process; nothing large is allocated (the
// Mux's bound is lowered for its legs; the hub's answer cap is judged on a 1 MiB op; the largest string is the app list's
// worst answer, about 1.8 MB).
//   ① THE TABLE IS A CENSUS: every op the agent answers (src/agentd/agentd.js) has a row in src/agentd/answer-caps.js, no row
//     names an op the agent lacks, the large caps sit ABOVE their producers' own bounds (no real answer refused), and the
//     table's line bound is the Mux's; the app list's worst answer, built from its producer's bounds, under its cap.
//   ② THE MUX: the SENDER refuses an over-long line BY NAME (nothing written) or sends its `overLong` refusal instead; the
//     RECEIVER ends the link BY NAME on a line still open past the bound (split over frames) or on a whole line over it —
//     each check cut in a copy is RED (the open line grows on; the over-long line goes out whole; it is passed over).
//   ③ THE AGENT: its refusal of an over-long answer keeps the id (that ONE op) and never the payload; a push becomes
//     `line-refused`; the agent wires it and states `answer-bounds`. THE USAGE PUSH's law RUN: the send refused on chunk k
//     of a walk ⇒ no seq goes out, the pending cursor is dropped, the saved cursor stays (the next walk starts there); its
//     stop cut in a copy is RED (the seq goes out, its ack commits past the refused events).
//   ④ THE HUB (DeviceManager._request over a stand-in device): an answer under its op's cap resolves; over it, refused BY NAME
//     with its size and cap, the link kept; the agent's own refusal arrives with its code; a request the Mux refuses is
//     refused by name (nothing pending; the product Mux's own throw too), its size and cap for the page; a write over the line
//     refused before it is encoded (a 48 MiB buffer, never encoded or touched); a refused push is
//     said once.
//   ⑤ THE PAGE: the Files view words the refusal by its code (zh / ja), its size and its cap — never a bare error; the hub's
//     own refusal of a write over the line too (a dialed machine; one with ssh writes it by that road, or says its own words).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-answer-caps-'));
const AC = require('../src/agentd/answer-caps.js');
const MX = require('../src/agentd/mux.js');
const tick = (n = 8) => new Promise((r) => { let i = 0; const go = () => (++i >= n ? r() : setImmediate(go)); setImmediate(go); });

console.log('① the table is a census');
{
  const opsOf = (src) => [...new Set([...src.matchAll(/msg\.op === '([a-z0-9-]+)'|case '([a-z0-9-]+)':/g)].map((m) => m[1] || m[2]))].sort();
  const AG = read('src/agentd/agentd.js'), ops = opsOf(AG), rows = Object.keys(AC.CAPS).sort();
  const missing = ops.filter((o) => !rows.includes(o)), dead = rows.filter((r) => !ops.includes(r));
  ok(ops.length > 40 && missing.length === 0 && dead.length === 0, `every op the agent answers has a cap row, and no row names an op it lacks (${ops.length} ops, ${rows.length} rows)`, { missing, dead });
  const planted = opsOf(AG + "\n    if (msg.op === 'a-new-op') { }\n").filter((o) => !rows.includes(o));
  ok(planted.join() === 'a-new-op', 'CONTROL: a new op of the agent with no cap row is RED by name', planted);
  ok(AC.LINE_MAX === MX.LINE_MAX && AC.FRAME_MAX === MX.FRAME_MAX && MX.LINE_MAX === MX.FRAME_MAX - 5, `the table's line bound is the Mux's (${AC.LINE_MAX} = ${AC.FRAME_MAX} − 5: a line rides one frame)`, { AC: [AC.LINE_MAX, AC.FRAME_MAX], MX: [MX.LINE_MAX, MX.FRAME_MAX] });
  const still = Number((read('src/stream-model.js').match(/stillMaxBytes: (\d+) \* 1024 \* 1024/) || [])[1]) * 1024 * 1024;
  const dread = Number((read('src/design-model.js').match(/readBytes: (\d+) \* MiB/) || [])[1]) * 1024 * 1024;
  const b64 = (n) => Math.ceil(n / 3) * 4;
  ok(still > 0 && dread > 0 && AC.CAPS['desktop-grab'] > b64(still) && AC.CAPS['design-fs'] > b64(dread) && Object.values(AC.CAPS).every((c) => c <= AC.LINE_MAX),
    `the large caps sit above their producers' own bounds — a screen grab (still ${still} B ⇒ base64 ${b64(still)} < cap ${AC.CAPS['desktop-grab']}), a design read (${dread} B ⇒ ${b64(dread)} < ${AC.CAPS['design-fs']}); no cap above the line`, { still, dread });
  const listN = Number((read('src/agentd/agentd.js').match(/readdirSync\(m\.path, \{ withFileTypes: true \}\)\.slice\(0, (\d+)\)/) || [])[1]);
  ok(listN > 0 && listN * (255 * 6 + 120) < AC.CAPS['fs-op'], `a listing's own bound (${listN} entries × a 255-byte name escaped 6× + its fields) fits under fs-op's cap ${AC.CAPS['fs-op']}`, { listN });
  // the tightest margin (the coordinator's r310 (4)): the app list's WORST answer, built from its producer's own bounds — a
  // name cleaned to NAME_MAX units (its last unit may be half a pair: escaped, 6 bytes), a launch line the run door takes
  // (≤ RUN_LINE_MAX units, no hidden character), each unit 3 bytes at worst. The row's own ≈ figure must be this one (to
  // 0.01 MiB), so a later raise of either bound makes the row's figure stale — red here — and a raise past the cap is red too
  const IA = require('../src/installed-apps.js'), MDM = require('../src/machine-desktop-model.js');
  const nameMax = Number((read('src/installed-apps.js').match(/const NAME_MAX = (\d+);/) || [])[1]);
  const appRow = { name: '中'.repeat(nameMax - 1) + '\ud83d', launch: '中'.repeat(MDM.RUN_LINE_MAX), source: 'applications', seenAt: 1795193300172 };
  const appsLine = Buffer.byteLength(JSON.stringify({ op: 'desktop-apps-list-result', id: 2 ** 31, result: { ok: true, platform: 'win32', rows: Array(IA.INSTALLED_MAX).fill(appRow), total: 99999, truncated: true, listedAt: 1795193300172, ms: 20000, timedOut: true } }) + '\n');
  const appsSaid = Number((read('src/agentd/answer-caps.js').match(/'desktop-apps-list': 2 \* MiB,[^\n]*≈ (\d+\.\d+) MiB/) || [])[1]);
  ok(nameMax > 0 && IA.INSTALLED_MAX > 0 && MDM.RUN_LINE_MAX > 0 && appsLine < AC.CAPS['desktop-apps-list'] && Math.abs(appsSaid - appsLine / (1024 * 1024)) < 0.01,
    `the app list's worst answer (${IA.INSTALLED_MAX} rows × a ${nameMax}-unit name + a ${MDM.RUN_LINE_MAX}-unit launch line, 3 bytes a unit) is ${appsLine} bytes = ${(appsLine / (1024 * 1024)).toFixed(3)} MiB, under its cap ${AC.sizeOf(AC.CAPS['desktop-apps-list'])} — the tightest margin — and the row's own figure says it (≈ ${appsSaid} MiB)`, { appsLine, appsSaid, nameMax, rows: IA.INSTALLED_MAX, line: MDM.RUN_LINE_MAX });
  ok(AC.capOf('fs-op') === AC.CAPS['fs-op'] && AC.capOf('no-such-op') === AC.LINE_MAX && AC.capOf('sysinfo') === AC.SMALL, 'capOf reads the table (an op with no row: the line itself — the census keeps that set empty)', { fs: AC.capOf('fs-op'), none: AC.capOf('no-such-op'), sys: AC.capOf('sysinfo') });
}

console.log('② the mux: the sender refuses an over-long line by name; the receiver ends the link by name on a line open past the bound');
{
  const sink = () => { const s = new EventEmitter(); s.out = []; s.write = (d) => { s.out.push(Buffer.from(d)); return true; }; s.destroy = () => {}; return s; };
  const s1 = sink(), m1 = new MX.Mux(s1, { heartbeat: false, lineMax: 1024 });
  let e1 = null; try { m1.control({ op: 'x', id: 1, pad: 'a'.repeat(2000) }); } catch (e) { e1 = e; }
  ok(!!e1 && e1.code === 'control-line-too-large' && e1.bytes > 1024 && e1.cap === 1024 && s1.out.length === 0, `an over-long line is NOT sent: refused by name (${e1 && e1.code}, ${e1 && e1.bytes} > ${e1 && e1.cap}), nothing written`, { code: e1 && e1.code, written: s1.out.length });
  const s2 = sink(), m2 = new MX.Mux(s2, { heartbeat: false, lineMax: 1024, overLong: (o, b, c) => ({ op: o.op, id: o.id, code: 'answer-too-large', bytes: b, cap: c }) });
  m2.control({ op: 'x-result', id: 7, pad: 'a'.repeat(2000) });
  const sent = s2.out.length === 1 ? JSON.parse(s2.out[0].subarray(9).toString('utf8')) : null;
  ok(!!sent && sent.id === 7 && sent.code === 'answer-too-large' && sent.cap === 1024 && !('pad' in sent), 'with an `overLong` hook its refusal goes in the line\'s place — the id kept, the payload never', sent);
  const s2b = sink(), m2b = new MX.Mux(s2b, { heartbeat: false, lineMax: 1024, overLong: () => ({ op: 'x', pad: 'z'.repeat(2000) }) });
  const went = [m2b.control({ op: 'ok-line' }), (() => { try { return m2b.control({ op: 'x', pad: 'a'.repeat(2000) }); } catch (e) { return e.code; } })()];
  ok(went[0] === true && went[1] === 'control-line-too-large' && s2b.out.length === 1, `control() answers how the line went (${went[0]}); a refusal itself over the bound is refused by name (${went[1]}), nothing more written`, { went, written: s2b.out.length });
  ok(m2.control({ op: 'x-result', id: 8, pad: 'a'.repeat(2000) }) === false, 'control() answers false when its refusal went in the line\'s place (the agent\'s usage push stops its batch on it)');
  // the receiver: one line split over three frames, no newline, past the bound
  const recvOf = (Mod) => { const s = new EventEmitter(); s.write = () => true; s.destroy = () => {}; const got = { dead: null, lines: [] }; const m = new Mod.Mux(s, { heartbeat: false, lineMax: 1024, onControl: (o, bytes) => got.lines.push([o.op, bytes]), onDead: (r) => { got.dead = r; } }); return { s, m, got }; };
  const R = recvOf(MX);
  for (let i = 0; i < 3; i++) R.s.emit('data', MX.encodeFrame(MX.T.DATA, 0, Buffer.from('a'.repeat(500))));
  ok(typeof R.got.dead === 'string' && /^control-line-too-large/.test(R.got.dead) && R.got.lines.length === 0, `a line still open past the bound ends the link BY NAME («${R.got.dead}»), nothing delivered`, R.got);
  const R1 = recvOf(MX); R1.s.emit('data', MX.encodeFrame(MX.T.DATA, 0, Buffer.from('c'.repeat(600)))); R1.s.emit('data', MX.encodeFrame(MX.T.DATA, 0, Buffer.from('c'.repeat(500) + '\n')));
  R1.s.emit('data', MX.encodeFrame(MX.T.DATA, 0, Buffer.from(JSON.stringify({ op: 'after' }) + '\n')));
  ok(typeof R1.got.dead === 'string' && /^control-line-too-large/.test(R1.got.dead) && R1.got.lines.length === 0, `a WHOLE line over the bound (its newline in a later frame) ends the link by name too («${R1.got.dead}»), and nothing after it is read`, R1.got);
  const R2 = recvOf(MX); R2.s.emit('data', MX.encodeFrame(MX.T.DATA, 0, Buffer.from(JSON.stringify({ op: 'small', pad: 'b'.repeat(800) }) + '\n')));
  ok(R2.got.dead === null && R2.got.lines.length === 1 && R2.got.lines[0][0] === 'small' && R2.got.lines[0][1] > 800 && R2.got.lines[0][1] <= 1024, `a line under the bound arrives, with its length (${R2.got.lines[0] && R2.got.lines[0][1]} bytes) for the hub's cap`, R2.got);
  // CONTROL: the release's receiver (the open-line bound cut, in a copy) — the line grows on
  const MSRC = read('src/agentd/mux.js');
  const M = mutantCopies('answer-caps', REPO);
  const cut = anchored(MSRC, "          if (!this._detached && this._ctlAcc.length > this._lineMax) {", "          if (false) {", 'mux-open-line');
  const Rel = M.load('src/agentd/mux.js', cut, 'mux-open-line');
  const R3 = recvOf(Rel);
  for (let i = 0; i < 3; i++) R3.s.emit('data', Rel.encodeFrame(Rel.T.DATA, 0, Buffer.from('a'.repeat(500))));
  ok(R3.got.dead === null && R3.m._ctlAcc.length === 1500, `CONTROL (the open-line bound cut, in a copy): the line grows past the bound (${R3.m._ctlAcc.length} bytes held) — RED`, { dead: R3.got.dead, held: R3.m._ctlAcc.length });
  // CONTROL (r310 (2)): the SENDER's refusal cut, in a copy — the over-long line goes out whole (the frame the peer dies on)
  const SendRel = M.load('src/agentd/mux.js', anchored(MSRC, '    if (b.length > this._lineMax) {', '    if (false) {', 'mux-send'), 'mux-send');
  const s5 = sink(), m5 = new SendRel.Mux(s5, { heartbeat: false, lineMax: 1024 });
  let e5 = null; try { m5.control({ op: 'x', id: 1, pad: 'a'.repeat(2000) }); } catch (e) { e5 = e; }
  ok(e5 === null && s5.out.length === 1 && s5.out[0].length > 1024, `CONTROL (the sender's refusal cut, in a copy): the over-long line is written whole (${s5.out[0] ? s5.out[0].length : 0} bytes), nothing refused — RED`, { thrown: e5 && e5.code, written: s5.out.length });
  // CONTROL (r310 (2)): the WHOLE-LINE check cut, in a copy — the over-long line is passed over and the next one is read
  const WholeRel = M.load('src/agentd/mux.js', anchored(MSRC, '            if (bytes > this._lineMax) { this._lineDead = true;', '            if (false) { this._lineDead = true;', 'mux-whole-line'), 'mux-whole-line');
  const R4 = recvOf(WholeRel); R4.s.emit('data', WholeRel.encodeFrame(WholeRel.T.DATA, 0, Buffer.from('c'.repeat(600)))); R4.s.emit('data', WholeRel.encodeFrame(WholeRel.T.DATA, 0, Buffer.from('c'.repeat(500) + '\n')));
  R4.s.emit('data', WholeRel.encodeFrame(WholeRel.T.DATA, 0, Buffer.from(JSON.stringify({ op: 'after' }) + '\n')));
  ok(R4.got.dead === null && R4.got.lines.length === 1 && R4.got.lines[0][0] === 'after', `CONTROL (the whole-line check cut, in a copy): the 1100-byte line is passed over and the next line read (${JSON.stringify(R4.got.lines)}) — RED`, R4.got);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
}

console.log('③ the agent: an over-long answer refused for that ONE op, a push named; wired and stated');
{
  const a = AC.refusalOf({ op: 'desktop-grab-result', id: 42, png: 'x' }, 70 * 1024 * 1024, AC.LINE_MAX);
  ok(a.id === 42 && a.op === 'desktop-grab-result' && a.code === 'answer-too-large' && a.bytes === 70 * 1024 * 1024 && a.cap === AC.LINE_MAX && !('png' in a) && /70\.0 MiB/.test(a.error) && /64\.0 MiB/.test(a.error), 'an answer becomes a refusal of that ONE op by name — its id kept, its size and the cap said, the payload never carried', a);
  const p = AC.refusalOf({ op: 'usage-events', batch: [1, 2] }, 90 * 1024 * 1024);
  ok(p.op === 'line-refused' && p.of === 'usage-events' && p.code === 'answer-too-large' && !('batch' in p) && !('id' in p), 'a push (no id) becomes `line-refused` naming the push — the link kept (the usage push used to end it)', p);
  const AG = read('src/agentd/agentd.js');
  ok(AG.includes("overLong: (obj, bytes, cap) => require('./answer-caps.js').refusalOf(obj, bytes, cap),") && /'hub-key', 'answer-bounds'/.test(AG), 'the agent\'s Mux takes that refusal as its `overLong`, and its hello-ack states `answer-bounds`');
  ok(AG.includes('AC.usagePushLoop(st, {') && AG.includes('if (st && st.acked) st.acked(msg.seq);') && read('src/agentd/answer-caps.js').includes('if (!err && stdout) r = usagePushWalked(st, stdout, send, commit, { now });') && !/pendingCursors\.(?:set|get|delete)\(/.test(AG),
    'the agent\'s usage push and its ack run the ONE law (answer-caps.js usagePushWalked / usagePushAcked, its own bounds) — the agent holds no copy of it');
  ok(AC.PUSH_LINES === 500 && AC.PUSH_TEXT === 8 * 1024 * 1024 && JSON.stringify(AC.pushChunksOf(Array.from({ length: 1200 }, (_, i) => 'e' + i)).map((c) => c.length)) === '[500,500,200]', 'the push\'s chunks: ≤ 500 lines and ≤ 8 MiB of their text each (1200 events ⇒ 500 + 500 + 200)');
  const tc = AC.pushChunksOf(['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40), 'd'.repeat(300), 'e'.repeat(10)], 500, 100);
  ok(JSON.stringify(tc.map((c) => c.map((l) => l[0]).join(''))) === '["ab","c","d","e"]', `…bounded by their TEXT (a 100-byte bound: ${JSON.stringify(tc.map((c) => c.map((l) => l[0]).join('')))}) — a line longer than the bound alone in its chunk (its producer's, row B-5278)`);
  // THE USAGE PUSH's LAW, RUN (the coordinator's r310 (1)): a walk of 1200 events (three chunks), the send refused on chunk k
  const cf = path.join(tmp, 'usage-push-cursor.json');
  const commitTo = (cur) => fs.writeFileSync(cf, JSON.stringify(cur));
  const walkOut = (n, cur) => Array.from({ length: n }, (_, i) => JSON.stringify({ rid: 'r' + i, t: i })).concat(JSON.stringify({ __cursors__: cur })).join('\n') + '\n';
  const runPush = (Lib, k, how) => {
    commitTo({ at: 'C0' });   // the cursor saved before this walk
    const st = { seq: 0, pendingCursors: new Map() }, out = [];
    let calls = 0;
    const send = (obj) => { if (calls++ === k) { if (how === 'throw') throw Object.assign(new Error('refused'), { code: 'control-line-too-large' }); return false; } out.push(obj); return true; };
    const r = Lib.usagePushWalked(st, walkOut(1200, { at: 'C1' }), send, commitTo);
    const pending = st.pendingCursors.size;
    const acked = Lib.usagePushAcked(st, r.seq, commitTo);   // even an ack of that seq (a late or a forged one) commits nothing
    return { r, out, pending, acked, saved: JSON.parse(fs.readFileSync(cf, 'utf8')).at };
  };
  for (const how of ['false', 'throw']) for (const k of [0, 1, 2]) {
    const x = runPush(AC, k, how);
    ok(x.r.refusedAt === k && x.out.length === k && x.out.every((o) => !('seq' in o)) && x.pending === 0 && x.acked === false && x.saved === 'C0',
      `the send refused on chunk ${k} of 3 (${how === 'false' ? 'its refusal went in the line\'s place' : 'refused by name, nothing sent'}): ${x.out.length} chunk(s) out, NO seq went out, the pending cursor dropped, an ack of it commits nothing — the cursor file still holds the one saved before (C0): the next walk starts there`, { refusedAt: x.r.refusedAt, out: x.out.length, pending: x.pending, acked: x.acked, saved: x.saved });
  }
  const whole = runPush(AC, -1, 'false');
  ok(whole.r.sent === true && whole.out.length === 3 && whole.out.map((o) => ('seq' in o ? o.seq : '-')).join() === `-,-,${whole.r.seq}` && whole.pending === 1 && whole.acked === true && whole.saved === 'C1',
    `a walk sent whole: three chunks, the seq on the LAST only (${whole.out.map((o) => ('seq' in o ? o.seq : '-')).join()}), its ack commits its cursor (C1)`, { out: whole.out.length, saved: whole.saved });
  { commitTo({ at: 'C0' }); const st = { seq: 0, pendingCursors: new Map() }; const r = AC.usagePushWalked(st, JSON.stringify({ __cursors__: { at: 'C2' } }) + '\n', () => { throw new Error('nothing to send'); }, commitTo);
    ok(r.committed === true && st.seq === 0 && JSON.parse(fs.readFileSync(cf, 'utf8')).at === 'C2', 'a walk with no new events commits its cursor at once (nothing to lose, nothing sent)'); }
  // CONTROL: the refusal's stop cut, in a copy — the later chunks go on, the LAST one carries the seq, its ack commits C1: the refused events are lost
  const PM = mutantCopies('answer-caps-push', REPO);
  const PushRel = PM.load('src/agentd/answer-caps.js', anchored(read('src/agentd/answer-caps.js'), '    if (!sent) { st.pendingCursors.delete(seq); if (st.moreSeq === seq) { delete st.moreSeq; delete st.moreAt; } return { seq, refusedAt: c, chunks: chunks.length, more }; }', '    if (!sent) { /* the stop cut */ }', 'push-stop'), 'push-stop');
  const red = runPush(PushRel, 1, 'false');
  ok(red.out.length === 2 && red.out.some((o) => 'seq' in o) && red.acked === true && red.saved === 'C1', `CONTROL (the stop cut, in a copy): after chunk 1 is refused the seq still goes out (${red.out.length} chunks out) and its ack commits C1 — the refused 500 events never walked again — RED`, { out: red.out.length, saved: red.saved });
  for (const r of copiesCensus(PM.files, PM.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
  const RF0 = read('src/remote-fs.js'), DH = read('src/server/desktop-handover-engine.js');
  ok(RF0.includes("} catch (e) { if (e && e.code === 'answer-too-large') throw e; /* legacy ssh below") && DH.includes("if (e && e.code === 'answer-too-large') return named('answer-too-large', "),
    'a listing refused by its cap is said (never swapped for the ssh fallback\'s partial list); a screen grab\'s refusal keeps its name for the agent (never «did not answer»)');
  ok(read('src/routes/window-targets.js').includes("still_too_big: 413, 'answer-too-large': 413"), 'a refused screen grab answers 413 beside «still too big» (never a bare 500)');
}

console.log('④ the hub: each answer judged against its op\'s cap; refusals by name, the link kept');
{
  const { DeviceManager } = require('../src/agentd/client.js');
  const { PROTO_VERSION } = MX;
  const pairOf = (answer) => {
    const hub = new EventEmitter(), dev = new EventEmitter();
    hub.write = (d) => { const b = Buffer.from(d); setImmediate(() => dev.emit('data', b)); return true; }; hub.destroy = () => {};
    dev.write = (d) => { const b = Buffer.from(d); setImmediate(() => hub.emit('data', b)); return true; }; dev.destroy = () => {};
    const seen = { hellos: 0 };
    const devMux = new MX.Mux(dev, { heartbeat: false, onControl: (m) => {
      if (m.op === 'hello') { seen.hellos++; return devMux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: require('../package.json').version, platform: 'linux', capabilities: ['sysinfo', 'answer-bounds'] }); }
      if (m.op === 'sysinfo') return answer(m, devMux);
    } });
    const logs = [];
    const dm = new DeviceManager({ dataDir: path.join(tmp, 'dm-' + Math.random().toString(36).slice(2)), bundlePath: path.join(tmp, 'none.js'), version: require('../package.json').version, transport: { kind: 'stream', hostToken: () => 'vsht_ok', getStream: () => hub }, log: (l) => logs.push(String(l)), machine: 'box-1' });
    return { dm, devMux, logs, seen };
  };
  const ask = async (dm) => { try { return { r: await dm._request({ op: 'sysinfo', timeoutMs: 5000 }) }; } catch (e) { return { e }; } };
  const MiB = 1024 * 1024;
  const A = pairOf((m, mux) => mux.control({ op: 'sysinfo-result', id: m.id, ok: true, pad: 'x'.repeat(1000) }));
  const a = await ask(A.dm);
  ok(!!a.r && a.r.ok === true, 'an answer under its op\'s cap (sysinfo: 1 MiB) resolves as before', a.e && a.e.message);
  const B = pairOf((m, mux) => mux.control({ op: 'sysinfo-result', id: m.id, ok: true, pad: 'x'.repeat(Math.ceil(1.2 * MiB)) }));
  const b = await ask(B.dm);
  ok(!!b.e && b.e.code === 'answer-too-large' && b.e.op === 'sysinfo' && b.e.bytes > MiB && b.e.cap === MiB && b.e.params && /MiB/.test(b.e.params.size) && b.e.params.cap === '1.0 MiB' && /box-1/.test(b.e.message), `an answer OVER its op's cap is refused BY NAME («${b.e && b.e.message}»)`, b.e && { code: b.e.code, bytes: b.e.bytes, cap: b.e.cap, params: b.e.params });
  const b2 = await ask(B.dm);
  ok(!!b2.e && b2.e.code === 'answer-too-large' && B.seen.hellos === 1, `…and the link is KEPT: the next ask is answered on the SAME link (one hello in all: ${B.seen.hellos}), refused again by its own size`, { code: b2.e && b2.e.code, hellos: B.seen.hellos });
  const C = pairOf((m, mux) => mux.control({ op: 'sysinfo-result', id: m.id, error: 'this machine\'s answer (sysinfo-result) is 70.0 MiB — over the 64.0 MiB a line of the device link may carry: refused (answer-too-large)', code: 'answer-too-large', bytes: 70 * MiB, cap: AC.LINE_MAX }));
  const c = await ask(C.dm);
  ok(!!c.e && c.e.code === 'answer-too-large' && c.e.bytes === 70 * MiB && c.e.params && c.e.params.size === '70.0 MiB' && c.e.params.cap === '64.0 MiB', 'the agent\'s OWN refusal of an over-long answer arrives with its code, its size and the cap', c.e && { code: c.e.code, params: c.e.params });
  // a request the Mux refuses (over the line): refused by name, nothing left pending
  const D = new DeviceManager({ dataDir: path.join(tmp, 'dm-d'), bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  const pend = new Map();
  D.connect = async () => ({ nextId: 1, pending: pend, info: {}, mux: { control() { throw Object.assign(new Error('a control line of 70000000 bytes (sysinfo) is over the device link\'s 67108859 — not sent'), { code: 'control-line-too-large', bytes: 70000000, cap: 67108859 }); } } });
  let d = null; try { await D._request({ op: 'sysinfo', timeoutMs: 5000 }); } catch (e) { d = e; }
  ok(!!d && d.code === 'control-line-too-large' && pend.size === 0 && !!d.params && d.params.size === '66.8 MiB' && d.params.cap === '64.0 MiB', `a request over the line is refused BY NAME before it is sent («${d && d.message}»), nothing left pending, its size and the cap in its params for the page`, { code: d && d.code, pending: pend.size });
  const D2 = new DeviceManager({ dataDir: path.join(tmp, 'dm-d2'), bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  const pend2 = new Map(), s6 = new EventEmitter(); s6.out = []; s6.write = (b) => { s6.out.push(b); return true; }; s6.destroy = () => {};
  D2.connect = async () => ({ nextId: 1, pending: pend2, info: {}, mux: new MX.Mux(s6, { heartbeat: false, lineMax: 1024 }) });
  let d2 = null; try { await D2._request({ op: 'sysinfo', pad: 'a'.repeat(2000), timeoutMs: 5000 }); } catch (e) { d2 = e; }
  ok(!!d2 && d2.code === 'control-line-too-large' && pend2.size === 0 && s6.out.length === 0 && d2.params && d2.params.op === 'sysinfo' && d2.params.cap === '1.0 KiB', `…the product Mux's own throw meets the request maker the same way («${d2 && d2.message}»: nothing written, nothing pending)`, { code: d2 && d2.code, params: d2 && d2.params, written: s6.out.length });
  // a write whose request would be over the line: refused BEFORE it is encoded (the file's own size and the most one write
  // may carry), nothing asked of the device; a small write goes as before
  const D3 = new DeviceManager({ dataDir: path.join(tmp, 'dm-d3'), bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  let asked3 = 0, sent3 = null; D3._request = async (pl) => { asked3++; sent3 = pl; return { ok: true }; };
  const big3 = Buffer.alloc(48 * 1024 * 1024 + 1);   // never encoded: its length alone is judged
  let e3 = null; try { await D3.fsWrite('/w/big.bin', big3); } catch (e) { e3 = e; }
  await D3.fsWrite('/w/s.txt', Buffer.from('hi'));
  ok(!!e3 && e3.code === 'control-line-too-large' && e3.bytes > e3.cap && e3.cap > 47 * 1024 * 1024 && e3.params && e3.params.size === '48.0 MiB' && /^4[78]\.\d MiB$/.test(e3.params.cap) && asked3 === 1 && sent3 && sent3.data64 === 'aGk=',
    `a write over the line is refused before it is encoded («${e3 && e3.message}»: the file's ${e3 && e3.params && e3.params.size} over the ${e3 && e3.params && e3.params.cap} one write may carry), nothing asked of the device; a small write goes as before`, { code: e3 && e3.code, params: e3 && e3.params, asked: asked3 });
  // a push the agent refused: said once
  const E = pairOf((m, mux) => mux.control({ op: 'sysinfo-result', id: m.id, ok: true }));
  await ask(E.dm);
  for (let i = 0; i < 2; i++) E.devMux.control({ op: 'line-refused', of: 'usage-events', error: 'this machine\'s answer (usage-events) is 90.0 MiB — over the 64.0 MiB a line of the device link may carry: refused (answer-too-large)', code: 'answer-too-large', bytes: 90 * MiB, cap: AC.LINE_MAX });
  await tick(20);
  const said = E.logs.filter((l) => /refused its own usage-events push/.test(l));
  ok(said.length === 1 && /box-1/.test(said[0]), `a push the agent refused is said in the journal ONCE a kind a minute («${said[0] || ''}»)`, said);
  for (let i = 0; i < 40; i++) E.devMux.control({ op: 'line-refused', of: 'kind-' + i + '\u0007', error: 'x\u001b[2Jy', code: 'answer-too-large' });
  await tick(20);
  const kinds = E.logs.filter((l) => /refused its own kind-/.test(l));
  const allSaid = E.logs.filter((l) => /refused its own /.test(l)).length;
  ok(E.dm._lineRefusedAt.size <= 33 && kinds.length > 0 && allSaid <= 5 && kinds.every((l) => !/[\x00-\x1f\x7f]/.test(l)), `the device's own words are bounded: forty new kinds make ${allSaid} journal lines in the minute (at most five), keep no growing memory (${E.dm._lineRefusedAt.size} held), and no control character reaches the journal`, { held: E.dm._lineRefusedAt.size, said: allSaid, sample: kinds[0] });
  for (const x of [A, B, C, E]) { try { x.dm.disconnect?.(); } catch { } }
}

console.log('⑤ the page: the Files view words the refusal by its code');
{
  const RF = read('src/remote-fs.js'), FX = read('src/lib/file-explorer-ops.js');
  const K = "the machine's answer is {size} — over the {cap} this view may take, so it is not shown";
  ok(/const FS_REFUSALS = Object\.freeze\(\[[^\]]*'answer-too-large'[^\]]*\]\)/.test(RF), 'the files route forwards the refusal\'s code and params to the page (FS_REFUSALS)');
  ok(FX.includes("if (d && d.code === 'answer-too-large') return t(\"" + K + "\", { size: p.size || '?', cap: p.cap || '?' });"), 'the Files view words it by its code — its size and its cap, never a bare error');
  for (const lang of ['zh', 'ja']) ok(read(`src/lib/i18n-${lang}.js`).includes(JSON.stringify(K) + ':'), `the sentence has its ${lang} row`);
  // the hub's OWN refusal of a request over the line (r310 (3): a write whose data is over it) — worded by its code too
  const K2 = 'this is {size} — over the {cap} one transfer to the machine may carry, so it was not sent';
  ok(/const FS_REFUSALS = Object\.freeze\(\[[^\]]*'control-line-too-large'[^\]]*\]\)/.test(RF) && FX.includes("if (d && d.code === 'control-line-too-large') return t('" + K2 + "', { size: p.size || '?', cap: p.cap || '?' });"), 'the hub\'s own refusal of a request over the line travels by its code and the Files view words it (its size and the cap)');
  for (const lang of ['zh', 'ja']) ok(read(`src/lib/i18n-${lang}.js`).includes(JSON.stringify(K2) + ':'), `…its sentence has its ${lang} row`);
  const { RemoteFs, fsErrorBody } = require('../src/remote-fs.js');
  const overLine = () => Object.assign(new Error('a control line of 70000000 bytes (fs-op) is over the device link\'s 67108859 — not sent'), { code: 'control-line-too-large', params: { op: 'fs-op', size: '66.8 MiB', cap: '64.0 MiB' } });
  const writeVia = async (devErr, transport, sshOk) => {
    const rf = new RemoteFs({ get: () => ({ id: 'h-1', transport }) });
    let sshTried = 0;
    rf._win = async () => null; rf._devAbs = async (id, dm, p) => p;
    rf._dev = async () => ({ fsWrite: async () => { throw devErr; } });
    rf._sshWrite = async () => { sshTried++; if (sshOk) return { success: true }; throw new Error('ssh: write failed (No space left on device)'); };
    try { return { r: await rf.write('h-1', '/w/big.bin', Buffer.alloc(8)), sshTried }; } catch (e) { return { e, sshTried }; }
  };
  const w1 = await writeVia(overLine(), 'dial', false), w2 = await writeVia(overLine(), 'ssh', true), w3 = await writeVia(overLine(), 'ssh', false), w4 = await writeVia(new Error('link lost'), 'ssh', false);
  const body1 = w1.e ? fsErrorBody(w1.e) : null;
  ok(!!body1 && body1.code === 'control-line-too-large' && body1.params.size === '66.8 MiB' && body1.params.cap === '64.0 MiB' && w1.sshTried === 0, `a write refused over the line on a DIALED machine (no ssh road): the page gets the refusal by its code and params (${JSON.stringify(body1)}), no ssh attempt`, { body1, sshTried: w1.sshTried });
  ok(!!w2.r && w2.r.success === true && !!w3.e && /No space left/.test(w3.e.message) && !fsErrorBody(w3.e).code && !!w4.e && /No space left/.test(w4.e.message),
    'a machine WITH an ssh road: that road writes it (the working road kept), and when it fails its OWN words are said (a full disk is never hidden behind the line\'s refusal); any other device error falls to the ssh road as before', { w2: w2.r, w3: w3.e && w3.e.message, w4: w4.e && w4.e.message });
  const UP = read('src/routes/files.js');
  ok(UP.includes("      return res.status(400).json(fsErrorBody(e));   // B-7f0b D8: a refusal by code"), 'the upload road answers a refusal by its code too (the explorer\'s upload words it with fsErrorText)');
}

fs.rmSync(tmp, { recursive: true, force: true });
report();
