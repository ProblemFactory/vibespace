#!/usr/bin/env node
// B-cd4b's last part (lane bl-loop-a, 主开发 r1132): THE WRAPPER'S HOLD — WHAT A WRAPPER HAS SAID IS ON DISK BEFORE IT CAN BE LOST TO
// A RESTART (src/said-journal.js says the law). The real chat wrappers over stand-ins written at run time in this run's scratch (no
// real CLI, no hub, no network); the hub's half in-process over the REAL claude consumer.
//  ① EVERY SAID LINE IS IN THE FILE WHEN IT IS SAID — a permission ask, an assistant text, a tool's line, a stream event; RED: the
//     journal cut (the timer alone, the base) ⇒ the ask is said with nothing of it in the file
//  ② A KILL NEVER BEATS IT: the wrapper SIGKILLed the moment the ask is said — the file holds it; RED: the journal cut ⇒ it does not
//  ③ NEVER AN APPEND ONTO A PREVIOUS LIFE: a stale file before the start — the first said line makes the file the ring; RED: the
//     journal armed from its start ⇒ the previous life's line stays under the new one
//  ④ A WHOLE REWRITE BETWEEN: a line appended, the ring renamed over the file (a durable result), a line said after — in the new
//     file; RED: the descriptor kept across the rename ⇒ the line goes to the replaced file
//  ⑤ THE FENCE, the wrapper's half: `webui_fence` answered by `_fence` in the file at its place, never acked, never the CLI's,
//     kept across a whole rewrite while it rides the ring, gone after its keep; the sidecar adverts caps.fence
//  ⑥ THE CODEX WRAPPER: every record it says is in the file when said, its fence the same; RED: its journal cut
//  ⑦ THE HUB'S GATE (src/server/session-stdout.js setupSessionPty `fence`, the REAL claude consumer): what the survivor said between
//     its catch-up and its connect (dtach dropped it) reaches the consumer FIRST, the live lines once, the fence never; RED: the gap
//     not fed ⇒ that line is lost; the bound: no fence ⇒ the held bytes are fed as they came, said
//  ⑧ THE GAP, PURE (src/said-journal.js fenceGap): a torn first line, the transport records, the preamble, a line not in the file
//  ⑨ THE CENSUS: every ring add and every stdout write of both wrappers is classified — a said line goes through the journal; a new
//     site is red BY NAME (planted controls)
//  ⑩ THE RESTORE'S WIRING (src/server/boot-restore.js): a fence only for a wrapper whose sidecar adverts it, from where the catch-up's
//     read ended (restoreCatchUp's own end, driven)
// ITS FOLLOW (主开发 r1236):
//  ⑪ THE RESTORE READS WHOLE LINES ONLY: a catch-up read landing in the middle of an append (placed half-written under the read) feeds
//     its whole lines; the torn tail is that read's partial and arrives WHOLE through the fence, parsed by the real claude consumer;
//     RED: the tail fed as it lay (the base's shape) ⇒ that line is lost
//  ⑫ AFTER A FAILED APPEND (a planted write: half its bytes, then ENOSPC) nothing is appended until a whole rewrite succeeds; a second
//     episode is said again; REDs: the journal left armed (two records merged), said once a life
//  ⑬ THE APPEND BUDGET: past it nothing more is appended, said once (a single line over it named by its size); RED: no budget ⇒ the file grows
// ITS SECOND FOLLOW (主开发 r1266):
//  ⑭ WHOLE LINES ONLY WHERE A FENCE FOLLOWS: a TERMINAL survivor's screen file gaining a question with no line end is fed as read (the
//     release's road); RED: whole lines for every survivor ⇒ the question is never drawn
//  ⑮ A READ TORN INSIDE A MANY-BYTE CHARACTER: its partial compared as BYTES — the torn head leaves the buffer, the line once; RED: as text.
//     On the FENCED road too (r1418 (1): a journaled wrapper's Chinese conversation). r1418 (2): a CHAT record whose sidecar could not
//     be read takes WHOLE LINES with no fence (a torn tail never fed); RED the release's as-read road feeds the torn head
//  and in ⑦ a fence split across two chunks; in ⑧ the accepted window (a line drawn twice set aside, nothing said lost — and, r1418
//  (3), a real gap line after it FED; RED: the window cut ⇒ that line is lost)
// Run: node scripts/test-wrapper-said-journal.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = scratch('said-journal');
fs.mkdirSync(HOME, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(5); } return fn(); };
const readFile = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const M = mutantCopies('said-journal', REPO);
const SJ = require(path.join(REPO, 'src/said-journal.js'));
const CW = 'data/bin/chat-wrapper.js', CX = 'data/bin/codex-chat-wrapper.js';
const cwSrc = read(CW), cxSrc = read(CX), sjSrc = read('src/said-journal.js');
const JOURNAL_PLANT = "const JOURNAL = SJ ? SJ.create({ file: bufferFile, rewrite: () => persistNow(), say: log }) : null;";
const CX_JOURNAL_PLANT = "const JOURNAL = SJ ? SJ.create({ file: bufferFile, rewrite: () => { if (writeTimer) { clearTimeout(writeTimer); } persistBuffer(); }, say: log }) : null;";

// THE STAND-IN CLI: a frame `stand_in_say` (forwarded raw — no turn opens) is answered by its lines in ONE write; every stdin line kept
const STAND = path.join(HOME, 'stand-in-say.cjs');
fs.writeFileSync(STAND, `const fs = require('fs');
const cap = process.env.SAY_CAPTURE;
let b = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) !== -1) { const line = b.slice(0, i); b = b.slice(i + 1); if (!line.trim()) continue; if (cap) fs.appendFileSync(cap, line + '\\n');
  let m; try { m = JSON.parse(line); } catch { continue; }
  if (m && m.type === 'stand_in_say' && Array.isArray(m.lines) && m.lines.length) process.stdout.write(m.lines.map((l) => JSON.stringify(l)).join('\\n') + '\\n'); } });
process.stdin.on('end', () => process.exit(0));
setInterval(() => { }, 1e3);
`);
// a tree that is the repo's but for the files named (data/bin: the wrappers are real copies — a symlinked main script resolves to the
// repo's own src; src: one symlink an entry, the named files real)
const mirror = (tag, files = {}) => {
  const dir = fs.mkdtempSync(path.join(HOME, `mirror-${tag}-`));
  fs.mkdirSync(path.join(dir, 'data', 'bin'), { recursive: true });
  for (const w of [CW, CX]) fs.writeFileSync(path.join(dir, w), files[w] !== undefined ? files[w] : read(w));
  const srcOwn = Object.keys(files).filter((f) => f.startsWith('src/'));
  if (!srcOwn.length) fs.symlinkSync(path.join(REPO, 'src'), path.join(dir, 'src'));
  else {
    fs.mkdirSync(path.join(dir, 'src'));
    for (const e of fs.readdirSync(path.join(REPO, 'src'))) if (!srcOwn.includes(`src/${e}`)) fs.symlinkSync(path.join(REPO, 'src', e), path.join(dir, 'src', e));
    for (const f of srcOwn) fs.writeFileSync(path.join(dir, f), files[f]);
  }
  return dir;
};
// the claude wrapper over the stand-in: every line it says, with whether the file held it AT THAT MOMENT
const runClaude = async (root, { stale = null, onSaid = null } = {}) => {
  const dir = fs.mkdtempSync(path.join(HOME, 'cw-'));
  const buf = path.join(dir, 's.buf'), side = path.join(dir, 's.json'), cap = path.join(dir, 'cli-stdin.log');
  if (stale !== null) fs.writeFileSync(buf, stale);
  const w = spawn(process.execPath, [path.join(root, CW), buf, side, process.execPath, STAND], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, VIBESPACE_SKIP_AGENT_HOOKS: '1', SAY_CAPTURE: cap } });
  const said = []; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i).replace(/\r$/, ''); lb = lb.slice(i + 1); let r = null; try { r = JSON.parse(l); } catch { continue; }
    const e = { r, l, inFile: readFile(buf).includes(l + '\n') }; said.push(e); if (onSaid) onSaid(e, w); } });
  w.stderr.on('data', () => { });
  const exited = new Promise((res) => w.on('exit', res));
  await until(() => fs.existsSync(side));
  const send = (o) => { try { w.stdin.write(JSON.stringify(o) + '\n'); } catch { } };
  return { w, dir, buf, side, cap, said, send, say: (lines, extra = {}) => send({ type: 'stand_in_say', lines, ...extra }), exited, end: async () => { try { w.kill('SIGKILL'); } catch { } await exited; } };
};
const saidOf = (c, pred) => c.said.find((e) => pred(e.r));
const ASK = { type: 'control_request', request_id: 'perm-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } } };
const TEXT = (t, id = 'msg-' + t) => ({ type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'text', text: t }] } });
const TOOL = { type: 'assistant', message: { id: 'msg-tool', role: 'assistant', content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } }] } };
const EVENT = { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } } };
const RESULT = { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 's' };
const isAsk = (r) => r.type === 'control_request' && r.request_id === 'perm-1';

try {
  console.log('— ① EVERY SAID LINE IS IN THE FILE WHEN IT IS SAID · ② A KILL NEVER BEATS IT');
  {
    const life = async (root) => {
      let askAtSay = null;
      const c = await runClaude(root, { onSaid: (e, w) => { if (isAsk(e.r) && askAtSay === null) { askAtSay = e.inFile; try { w.kill('SIGKILL'); } catch { } } } });
      c.say([TEXT('ARM')]);   // the first said line arms the journal (the file becomes the ring)
      await until(() => !!saidOf(c, (r) => r.message && r.message.id === 'msg-ARM'));
      c.say([TEXT('SAID-TEXT'), TOOL, EVENT, ASK]);   // ONE chunk of the CLI's output, the ask last — and the wrapper killed the moment it is said
      await c.exited;
      const lines = c.said.filter((e) => !String(e.r.type || '').startsWith('_'));
      return { lines: lines.map((e) => (e.r.type || '?') + (e.inFile ? '' : '✗')), askAtSay, askAfterKill: readFile(c.buf).includes(JSON.stringify(ASK) + '\n'), all: lines.length >= 5 && lines.every((e) => e.inFile) };
    };
    const g = await life(REPO);
    const r = await life(mirror('no-journal', { [CW]: anchored(cwSrc, JOURNAL_PLANT, 'const JOURNAL = null;', 'the journal cut') }));
    ok(g.all && g.askAtSay === true, `① every line the wrapper said was in its file at that moment — the permission ask, the assistant text, the tool line, the stream event (${g.lines.join(', ')})`, g);
    ok(g.askAfterKill, '② a kill never beats it: the wrapper SIGKILLed the moment the ask was said — the file holds the ask', g);
    ok(r.askAtSay === false && !r.askAfterKill, `RED: the journal cut (the timer alone, the base) ⇒ the ask is said with nothing of it in the file, and the kill loses it (${r.lines.join(', ')})`, r);
  }

  console.log('— ③ NEVER AN APPEND ONTO A PREVIOUS LIFE');
  {
    const STALE = JSON.stringify(TEXT('STALE-LIFE', 'msg-stale')) + '\n';
    const life = async (root) => {
      const c = await runClaude(root, { stale: STALE });
      c.say([TEXT('NEW-LIFE')]);
      await until(() => !!saidOf(c, (r) => r.message && r.message.id === 'msg-NEW-LIFE'));
      const e = saidOf(c, (r) => r.message && r.message.id === 'msg-NEW-LIFE'), f = readFile(c.buf);
      await c.end();
      return { inFile: !!(e && e.inFile), stale: f.includes('STALE-LIFE'), fresh: f.includes('NEW-LIFE') };
    };
    const g = await life(REPO);
    // the module's own rule, driven alone (the real wrapper's first said line is a durable queue record: a whole rewrite either way)
    const armLeg = (SJm) => {
      const f = path.join(fs.mkdtempSync(path.join(HOME, 'arm-')), 'a.buf'); fs.writeFileSync(f, STALE);
      let ring = ''; const j = SJm.create({ file: f, rewrite: () => { fs.writeFileSync(f, ring); j.rewritten(); } });
      ring += 'NEW-LIFE\n'; j.add('NEW-LIFE\n'); const flushed = j.flush(); const t = readFile(f); j.close();
      return { flushed, stale: t.includes('STALE-LIFE'), fresh: t.includes('NEW-LIFE') };
    };
    const ga = armLeg(SJ), ra = armLeg(require(M.write('src/said-journal.js', anchored(sjSrc, "let fd = null, pending = '', armed = false, armTried = false", "let fd = null, pending = '', armed = true, armTried = false", 'armed from its start'), 'sj-armed')));
    ok(g.inFile && g.fresh && !g.stale && ga.flushed && ga.fresh && !ga.stale, 'a file a previous life left: the first said line makes the file the ring (a whole rewrite) — the new line in it, the old life\'s gone (the wrapper, and the journal alone)', { g, ga });
    ok(ra.fresh && ra.stale, 'RED: the journal armed from its start ⇒ the new line is appended UNDER the previous life\'s', ra);
  }

  console.log('— ④ A WHOLE REWRITE BETWEEN: the descriptor is the new file\'s');
  {
    const life = async (root) => {
      const c = await runClaude(root);
      const step = async (line, pred) => { c.say([line]); await until(() => !!saidOf(c, pred)); return saidOf(c, pred); };
      await step(TEXT('W-ARM'), (r) => r.message && r.message.id === 'msg-W-ARM');
      const a2 = await step(TEXT('W-APPENDED'), (r) => r.message && r.message.id === 'msg-W-APPENDED');   // an append: the descriptor opened
      const ino0 = (() => { try { return fs.statSync(c.buf).ino; } catch { return 0; } })();
      await step(RESULT, (r) => r.type === 'result');   // durable: the ring renamed over the file
      const ino1 = (() => { try { return fs.statSync(c.buf).ino; } catch { return 0; } })();
      const b = await step(TEXT('W-AFTER'), (r) => r.message && r.message.id === 'msg-W-AFTER');
      await c.end();
      return { appended: !!(a2 && a2.inFile), renamed: ino0 !== ino1, after: !!(b && b.inFile) };
    };
    const g = await life(REPO);
    const r = await life(mirror('keeps-fd', { 'src/said-journal.js': anchored(sjSrc, "overSaid = false; fd = closeWritten(fd, where, say); },", "overSaid = false; },", 'the descriptor kept') }));
    ok(g.appended && g.renamed && g.after, 'a line appended, the ring renamed over the file (a durable result), a line said after it — in the NEW file the moment it is said', g);
    ok(r.renamed && !r.after, 'RED: the descriptor kept across the rename ⇒ the line said after it went to the replaced file', r);
  }

  console.log('— ⑤ THE FENCE, the wrapper\'s half');
  {
    const c = await runClaude(REPO);
    c.say([TEXT('F-ARM')]); await until(() => !!saidOf(c, (r) => r.message && r.message.id === 'msg-F-ARM'));
    const acks0 = c.said.filter((e) => e.r.type === '_stdin_ack').length;
    c.send(JSON.parse(SJ.fenceAsk('F-1')));
    await until(() => !!saidOf(c, (r) => r.type === SJ.FENCE_TYPE && r.id === 'F-1'));
    const fe = saidOf(c, (r) => r.type === SJ.FENCE_TYPE && r.id === 'F-1');
    c.say([RESULT]); await until(() => !!saidOf(c, (r) => r.type === 'result'));   // a whole rewrite while the fence rides the ring
    const f = readFile(c.buf), fAt = f.indexOf(SJ.fenceLine('F-1') + '\n'), rAt = f.indexOf(JSON.stringify(RESULT) + '\n');
    const acks = c.said.filter((e) => e.r.type === '_stdin_ack').length - acks0;   // the fence's frame and the say: ONE ack, the say's
    let caps = {}; try { caps = JSON.parse(readFile(c.side)).caps || {}; } catch { }
    const cli = readFile(c.cap);
    await c.end();
    ok(!!fe && fe.inFile && fAt >= 0 && rAt > fAt && acks === 1 && !/webui_fence/.test(cli) && caps.fence === SJ.FENCE_VERSION,
      `a hub's \`webui_fence\` is answered by \`_fence\` in the file at its place the moment it is said, kept there by a whole rewrite while it rides the ring; never acked, never the CLI's; the sidecar adverts caps.fence ${caps.fence}`, { fe: !!fe && fe.inFile, fAt, rAt, acks, cliGotIt: /webui_fence/.test(cli), caps });
    // its keep: a wrapper whose FENCE_KEEP_MS is 50 — the fence leaves the ring, and the next whole rewrite leaves it out
    const k = await runClaude(mirror('fence-keep', { [CW]: anchored(cwSrc, 'const FENCE_KEEP_MS = 10000;', 'const FENCE_KEEP_MS = 50;', 'a short keep') }));
    k.say([TEXT('K-ARM')]); await until(() => !!saidOf(k, (r) => r.message && r.message.id === 'msg-K-ARM'));
    k.send(JSON.parse(SJ.fenceAsk('F-2'))); await until(() => !!saidOf(k, (r) => r.type === SJ.FENCE_TYPE && r.id === 'F-2'));
    const kept = readFile(k.buf).includes(SJ.fenceLine('F-2') + '\n');
    let gone = false;
    for (let n = 0; n < 400 && !gone; n++) {   // one durable result after another (each a whole rewrite) until the keep has passed — what happened, never a clock
      const res = { ...RESULT, result: `keep-${n}` };
      k.say([res]); await until(() => !!saidOf(k, (r) => r.type === 'result' && r.result === `keep-${n}`));
      gone = !readFile(k.buf).includes(SJ.fenceLine('F-2'));
    }
    await k.end();
    ok(kept && gone, 'its keep passed, the fence left the ring: the next whole rewrite leaves it out of the file', { kept, gone });
  }

  console.log('— ⑥ THE CODEX WRAPPER: every record it says is in the file when said; its fence');
  {
    const rpcDir = fs.mkdtempSync(path.join(HOME, 'cx-stub-'));
    const STUBX = `
const fs = require('fs');
let b = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  b += d;
  let i;
  while ((i = b.indexOf('\\n')) !== -1) {
    const line = b.slice(0, i); b = b.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id !== undefined && m.method) {
      const result = m.method === 'thread/start' ? { thread: { id: 'th-said-1' } } : m.method === 'turn/start' ? { turn: { id: 'turn-' + m.id } } : {};
      process.stdout.write(JSON.stringify({ id: m.id, result }) + '\\n');
    }
  }
});
process.stdin.on('end', () => process.exit(0));
setInterval(() => {}, 1e3);
`;
    const life = async (root) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'cx-'));
      const buf = path.join(dir, 'x.buf'), meta = path.join(dir, 'x.json');
      const w = spawn(process.execPath, [path.join(root, CX), buf, meta, process.execPath, '-e', STUBX], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CODEX_WEBUI_CWD: rpcDir, VIBESPACE_API: '', VIBESPACE_SESSION_TOKEN: '', VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
      const said = []; let lb = '';
      w.stdout.setEncoding('utf8');
      w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i).replace(/\r$/, ''); lb = lb.slice(i + 1); let r = null; try { r = JSON.parse(l); } catch { continue; } said.push({ r, inFile: readFile(buf).includes(l + '\n') }); } });
      w.stderr.on('data', () => { });
      const exited = new Promise((res) => w.on('exit', res));
      const readMeta = () => { try { return JSON.parse(readFile(meta)); } catch { return null; } };
      await until(() => !!(readMeta() && readMeta().threadId), 10000);
      const n0 = said.length;
      w.stdin.write(SJ.fenceAsk('X-1') + '\n');
      await until(() => said.some((e) => e.r.type === SJ.FENCE_TYPE && e.r.id === 'X-1'), root === REPO ? 3000 : 300);   // the red's wrapper answers none
      const m = readMeta() || {};
      try { w.kill('SIGKILL'); } catch { } await exited;
      const lines = said.filter((e) => !String(e.r.type || '').startsWith('_'));
      const fence = said.find((e) => e.r.type === SJ.FENCE_TYPE && e.r.id === 'X-1');
      const fenceAcks = said.slice(n0).filter((e) => e.r.type === '_stdin_ack').length;   // r1236: the two wrappers agree — never acked
      return { n: lines.length, all: lines.length > 0 && lines.every((e) => e.inFile), anyOut: lines.some((e) => !e.inFile), fence: !!(fence && fence.inFile), fenceAcks, caps: (m.caps && m.caps.fence) || null, thread: m.threadId || null };
    };
    const g = await life(REPO);
    const r = await life(mirror('cx-no-journal', { [CX]: anchored(cxSrc, CX_JOURNAL_PLANT, 'const JOURNAL = null;', 'the codex journal cut') }));
    ok(g.thread === 'th-said-1' && g.all && g.fence && g.fenceAcks === 0 && g.caps === SJ.FENCE_VERSION, `the codex wrapper: every record it said (${g.n}) was in its file at that moment; its fence the same, and never acked (${g.fenceAcks} acks: the claude wrapper's rule); the sidecar adverts caps.fence ${g.caps}`, g);
    ok(r.thread === 'th-said-1' && r.anyOut && !r.fence, 'RED: its journal cut ⇒ a record is said with nothing of it in the file (the 1 s timer alone), and no fence is answered', r);
  }

  console.log('— ⑦ THE HUB\'S GATE (session-stdout setupSessionPty `fence`, the REAL claude consumer)');
  {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    const { ptyListeners } = require(path.join(REPO, 'src/pty-duck.js'));
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers'));
    const anyFn = () => new Proxy(function () { }, { get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : anyFn()), apply: () => undefined });
    const soOf = (mod, tag) => { const dd = fs.mkdtempSync(path.join(HOME, `so-${tag}-`)); for (const s of ['buffers', 'meta']) fs.mkdirSync(path.join(dd, s)); const engine = new Proxy({ _vsuPending: new Map() }, { get: (t, k) => (k in t ? t[k] : anyFn()), has: () => true });
      return mod.create({ rootDir: dd, BUFFERS_DIR: path.join(dd, 'buffers'), META_DIR: path.join(dd, 'meta'), DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(dd, 'none'), CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(), activeSessions: new Map(), engine,
        checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { }, noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h, sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
        getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null, getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor: () => ({}) }), getBrain: () => anyFn(), getPages: () => null, getPermissionRules: () => null, agentEnv: () => ({}) }); };
    const rec = (k) => JSON.stringify({ type: 'system', subtype: 'informational', level: 'info', content: `GAP-${k}` });
    const run = async (so, { fence = true, answer = true, split = false } = {}) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'gate-')), file = path.join(dir, 'w.buf');
      fs.writeFileSync(file, rec(0) + '\n');                                   // what the catch-up read
      const rb = Object.assign(BR.restoreBufOf(file, fs.readFileSync(file)), { fence: true });   // a journaled wrapper's read (its sidecar adverts caps.fence)
      fs.appendFileSync(file, rec(1) + '\n');                                  // said after the catch-up, before the connect: dtach DROPPED it
      const Ld = ptyListeners(), Le = ptyListeners(), writes = [];
      const duck = { pid: 0, onData: (cb) => Ld.on(cb), onExit: (cb) => Le.on(cb), write(s) { writes.push(String(s)); }, resize() { }, kill() { } };
      const sid = 'w-fence7';
      const sess = { mode: 'chat', backend: 'claude', buffer: rec(0) + '\n', sockName: null, clients: new Set(), _normalizer: createMessageManager('claude', sid) };
      const warns = [], w0 = console.warn; console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
      let threw = null;
      try {
        try { so.setupSessionPty(sess, sid, duck, { fence: fence ? { rb, read: BR.restoreCatchUp } : null }); } catch (e) { threw = String((e && e.stack) || e); }
        Ld.emit('\x1b[H\x1b[J');                                               // dtach's preamble: the client is connected, raw
        const ask = writes.map((x) => { try { return JSON.parse(x); } catch { return null; } }).find((o) => o && o.type === 'webui_fence');
        fs.appendFileSync(file, rec(2) + '\n'); Ld.emit(rec(2) + '\r\n');      // said after the connect: in the file, then on the live stream
        if (answer) {
          const fl = SJ.fenceLine(ask ? ask.id : 'none');
          fs.appendFileSync(file, fl + '\n' + rec(3) + '\n');
          if (split) { Ld.emit(fl.slice(0, 11)); Ld.emit(fl.slice(11) + '\r\n' + rec(3) + '\r\n'); }   // r1266 (c): the fence split across two chunks
          else Ld.emit(fl + '\r\n' + rec(3) + '\r\n');   // the fence, then a line after it
        } else await until(() => sess.buffer.includes('GAP-2'), 3000);           // no fence: the bound
        const b = sess.buffer;
        return { threw, asked: !!ask, at: [1, 2, 3].map((k) => b.indexOf(`GAP-${k}`)), n: [1, 2, 3].map((k) => b.split(`GAP-${k}`).length - 1), fence: b.includes(SJ.FENCE_TYPE), warns };
      } finally { console.warn = w0; }
    };
    const SO = require(path.join(REPO, 'src/server/session-stdout.js'));
    const soSrc = read('src/server/session-stdout.js');
    const g = await run(soOf(SO, 'g'));
    const r = await run(soOf(require(M.write('src/server/session-stdout.js', anchored(soSrc, '      else if (gap.lost) {', '      else if (false) {', 'gap-not-fed'), 'gap-not-fed')), 'r'));
    const nf = await run(soOf(SO, 'nf'), { fence: false });
    const sp = await run(soOf(SO, 'sp'), { split: true });
    const bd = await run(soOf(require(M.write('src/server/session-stdout.js', anchored(soSrc, 'const FENCE_WAIT_MS = 3000,', 'const FENCE_WAIT_MS = 50,', 'short-bound'), 'short-bound')), 'bd'), { answer: false });
    ok(!g.threw && g.asked && g.n.join() === '1,1,1' && g.at[0] < g.at[1] && g.at[1] < g.at[2] && !g.fence,
      `the gate asks the fence at the first byte; what the survivor said between the catch-up and the connect reaches the consumer FIRST (${g.at.join(' < ')}), each live line once, the fence record never`, g);
    ok(!r.threw && r.n[0] === 0 && r.n[1] === 1 && r.n[2] === 1, 'RED: the gap not fed ⇒ the line said between the catch-up and the connect never reaches the conversation', r);
    ok(!nf.threw && !nf.asked && nf.n[1] === 1, 'a wrapper with no fence (its sidecar adverts none): no ask, the live lines as before', nf);
    ok(!sp.threw && sp.asked && sp.n.join() === '1,1,1' && sp.at[0] < sp.at[1] && sp.at[1] < sp.at[2] && !sp.fence, `a fence SPLIT across two chunks is found (the previous tail + the new bytes), the order kept (${sp.at.join(' < ')})`, sp);
    ok(!bd.threw && bd.asked && bd.n[1] === 1 && bd.n[0] === 0 && bd.warns.some((w) => /no fence came back in 50 ms/.test(w)), 'the bound: no fence back ⇒ the held bytes are fed as they came, and that is SAID', bd);
  }

  console.log('— ⑧ THE GAP, PURE (src/said-journal.js fenceGap)');
  {
    const fl = SJ.fenceLine('P'), A = '{"type":"a","n":1}', B = '{"type":"a","n":2}', C = '{"type":"a","n":3}', ACK = '{"type":"_stdin_ack","timestamp":1}';
    const g1 = SJ.fenceGap({ text: `${A}\n${B}\n${fl}\n${C}\n`, drop: '' }, fl, `${B}\r\n`);
    const g2 = SJ.fenceGap({ text: `${A}\n${B}\n${fl}\n` }, fl, `\x1b[H\x1b[J${B.slice(5)}\r\n`);
    const g3 = SJ.fenceGap({ text: `${A}\n${B}\n${fl}\n` }, fl, `${ACK}\r\n${B}\r\n`);
    const g4 = SJ.fenceGap({ text: `${A}\n${fl}\n` }, fl, `${C}\r\n`);
    const g5 = SJ.fenceGap({ text: `${A}\n` }, fl, '');
    const g6 = SJ.fenceGap(null, fl, ''), g7 = SJ.fenceGap({ skipped: 'rewritten' }, fl, '');
    const g8 = SJ.fenceGap({ text: `${A}\n${B}\n${fl}\n` }, fl, '');
    const X = '{"type":"a","n":9}', g9 = SJ.fenceGap({ text: `${B}\n${fl}\n` }, fl, `${X}\r\n${B}\r\n`, `${A}\n${X}\n`), g9n = SJ.fenceGap({ text: `${B}\n${fl}\n` }, fl, `${X}\r\n${B}\r\n`);
    ok(g1.lost === `${A}\n` && g2.lost === `${A}\n${B.slice(0, 5)}` && g3.lost === `${A}\n` && g8.lost === `${A}\n${B}\n`,
      'the gap = the file\'s lines before the fence less the live stream\'s END: a line the connect tore gives back its head; the preamble and the transport records are no live line; nothing live ⇒ all of it', { g1, g2, g3, g8 });
    ok(!!g4.skipped && !!g5.skipped && !!g6.skipped && g7.skipped === 'rewritten', 'a live line the file does not hold, no fence in the file, no file past the catch-up: fed nothing, the reason said', { g4, g5, g6, g7 });
    ok(g9.lost === '' && g9.twice === 1 && !!g9n.skipped, `THE ACCEPTED WINDOW (r1266): a line the catch-up fed that came live again is set aside as drawn twice (${g9.twice}) — the gap is the rest, nothing said lost; without the catch-up's text it reads as a mismatch`, { g9, g9n });
    // r1418 (3): the window FEEDS lost text — a set-aside line followed by a REAL gap line (C: said after the catch-up, dropped by dtach)
    const gw = (sj) => sj.fenceGap({ text: `${C}\n${B}\n${fl}\n` }, fl, `${X}\r\n${B}\r\n`, `${A}\n${X}\n`);
    const SJnw = require(M.write('src/said-journal.js', anchored(read('src/said-journal.js'), '  if (m.miss !== undefined && fed) {', '  if (false) {', 'no-accepted-window'), 'no-accepted-window'));
    const g10 = gw(SJ), r10 = gw(SJnw);
    ok(g10.lost === `${C}\n` && g10.twice === 1, `the accepted window with a REAL gap line after the set-aside one: the drawn-twice line set aside (${g10.twice}), the gap line FED (${JSON.stringify(g10.lost)})`, g10);
    ok(!!r10.skipped && !r10.lost, `RED: the window cut ⇒ a mismatch: fed nothing — the gap line is lost (${r10.skipped})`, r10);
  }

  console.log('— ⑨ THE CENSUS: every ring add and every stdout write of both wrappers, classified');
  {
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    // a ring add is SAID when the journal takes it on its line or the next; the rest are never said (their reasons) — and every
    // stdout write goes after the journal's flush or is a transport record (never in the ring)
    const NOT_SAID = { [CW]: [
      ['KC.pinnedLines(', null, 1, 'the trim\'s pins: a held copy\'s line written again at the head'],
      ["if (buffered) { buffer += line + '\\n'; schedulePersist(); }", null, 2, 'a frame-file body and a handed frame\'s body: the CLI\'s input, never said'],
      ["buffer += line + '\\n';", 'copies.set(msgId', 1, 'a held copy: never said (B-5a4d: written with its queue record)'],
      ["else { buffer += next + '\\n'; schedulePersist(); }", null, 1, 'a held copy\'s edit: never said'],
      ["buffer += line + '\\n';", 'durable();', 1, 'an answered permission (stdin): never said (B-5a4d: durable)'],
      ["type: '_remote_state'", null, 2, 'a transport record (filtered before the normalizer, never in the ring)'],
      ['const TAIL_JS = ', null, 1, 'the transcript tail reader\'s OWN stdout (B-5a4d root, unit 2: a script the wrapper runs in a child of its own) — the child\'s pipe back to the wrapper, never the wrapper\'s stdout nor its ring'],
    ], [CX]: [
      ['JSON.stringify(nack)', null, 1, 'a torn stdin line\'s receipt (transport)'],
      ['JSON.stringify(ack)', null, 1, 'the stdin ack (transport)'],
    ] };
    const SAID = { [CW]: 4, [CX]: 2 };
    const census = (rel, src) => {
      const L = strip(src).split('\n'), next = (i) => { for (let k = i + 1; k < L.length; k++) if (L[k].trim()) return L[k]; return ''; };
      let said = 0; const unlisted = [], seen = new Map();
      const classify = (ln, i, what) => { const row = NOT_SAID[rel].find(([a, b]) => ln.includes(a) && (b === null || next(i).includes(b))); if (!row) unlisted.push(`${rel}:${i + 1} (${what})`); else seen.set(row, (seen.get(row) || 0) + 1); };
      L.forEach((ln, i) => {
        if (/\bbuffer \+= /.test(ln)) { if (ln.includes('JOURNAL.add(') || next(i).includes('JOURNAL.add(')) said++; else classify(ln, i, 'a ring add'); }
        if (/process\.stdout\.write\(/.test(ln) && !L.slice(Math.max(0, i - 6), i + 1).some((x) => x.includes('JOURNAL.flush()'))) classify(ln, i, 'a stdout write');
      });
      return { said, unlisted, wrong: NOT_SAID[rel].filter((row) => (seen.get(row) || 0) !== row[2]).map((row) => `«${row[0]}» ${seen.get(row) || 0} of ${row[2]}`) };
    };
    const cw = census(CW, cwSrc), cx = census(CX, cxSrc);
    const pl = census(CW, cwSrc + "\nfunction plantedSay(x, r) {\n  buffer += x + '\\n'; schedulePersist();\n  process.stdout.write(JSON.stringify(r) + '\\n');\n}\n");
    ok(cw.said === SAID[CW] && cx.said === SAID[CX] && !cw.unlisted.length && !cx.unlisted.length && !cw.wrong.length && !cx.wrong.length,
      `every ring add of the two wrappers is a said line the journal takes (${cw.said} + ${cx.said}) or names why it is never said, and every stdout write follows the journal's flush or is a transport record (unlisted ${[...cw.unlisted, ...cx.unlisted].join(', ') || 'none'}; ${[...cw.wrong, ...cx.wrong].join(', ') || 'every row as counted'})`, { cw, cx });
    ok(pl.unlisted.length === 2 && pl.unlisted.every((u) => u.startsWith(`${CW}:`)), `CONTROL: a planted ring add and a planted stdout write outside the journal are named (${pl.unlisted.join(', ')})`, pl);
  }

  console.log('— ⑪ THE RESTORE READS WHOLE LINES ONLY (主开发 r1236): a catch-up that lands in the middle of an append');
  {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    const brSrc = read('src/server/boot-restore.js');
    const BRr = require(M.write('src/server/boot-restore.js', anchored(brSrc, "const whole = body.subarray(0, nl + 1), text = whole.toString('utf-8')", "const whole = body.subarray(0, nl + 1), text = body.toString('utf-8')", 'feeds-the-torn-tail'), 'feeds-the-torn-tail'));   // the base's shape: the read's tail fed as it lay
    const { ptyListeners } = require(path.join(REPO, 'src/pty-duck.js'));
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers'));
    const SO = require(path.join(REPO, 'src/server/session-stdout.js'));
    const anyFn = () => new Proxy(function () { }, { get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : anyFn()), apply: () => undefined });
    const soOf = (tag) => { const dd = fs.mkdtempSync(path.join(HOME, `so11-${tag}-`)); for (const x of ['buffers', 'meta']) fs.mkdirSync(path.join(dd, x)); const engine = new Proxy({ _vsuPending: new Map() }, { get: (t, k) => (k in t ? t[k] : anyFn()), has: () => true });
      return SO.create({ rootDir: dd, BUFFERS_DIR: path.join(dd, 'buffers'), META_DIR: path.join(dd, 'meta'), DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(dd, 'none'), CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(), activeSessions: new Map(), engine,
        checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { }, noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h, sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
        getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null, getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor: () => ({}) }), getBrain: () => anyFn(), getPages: () => null, getPermissionRules: () => null, agentEnv: () => ({}) }); };
    const rec = (k) => JSON.stringify({ type: 'system', subtype: 'informational', level: 'info', content: `GAP-${k}` });
    const BIG = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'w11', cwd: '/' + 'p'.repeat(9000), apiKeySource: 'the-whole-line' });   // a line over two pages
    const run = async (BRm) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'whole-')), file = path.join(dir, 'w.buf');
      fs.writeFileSync(file, rec(0) + '\n');
      const rb0 = Object.assign(BRm.restoreBufOf(file, fs.readFileSync(file)), { fence: true });   // a journaled wrapper's read
      const head = BIG.slice(0, 4000);
      fs.appendFileSync(file, rec(1) + '\n' + head);   // THE PLACED STALL: the append of BIG half-written under the catch-up's read
      const cu = BRm.restoreCatchUp(rb0);
      fs.appendFileSync(file, BIG.slice(4000) + '\n');   // the append completes after the read
      const Ld = ptyListeners(), Le = ptyListeners(), writes = [];
      const duck = { pid: 0, onData: (cb) => Ld.on(cb), onExit: (cb) => Le.on(cb), write(x) { writes.push(String(x)); }, resize() { }, kill() { } };
      const sid = 'w-whole11';
      const sess = { mode: 'chat', backend: 'claude', buffer: rec(0) + '\n', sockName: null, clients: new Set(), _normalizer: createMessageManager('claude', sid) };
      const so = soOf(BRm === BR ? 'g' : 'r');
      const w0 = console.warn; console.warn = () => { };
      let threw = null;
      try {
        try { so.setupSessionPty(sess, sid, duck, { catchUp: cu && cu.text ? cu : null, fence: { rb: cu && cu.text ? cu.rb : rb0, read: BRm.restoreCatchUp } }); } catch (e) { threw = String((e && e.stack) || e); }
        Ld.emit('\x1b[H\x1b[J');
        const ask = writes.map((x) => { try { return JSON.parse(x); } catch { return null; } }).find((o) => o && o.type === 'webui_fence');
        const fl = SJ.fenceLine(ask ? ask.id : 'none');
        fs.appendFileSync(file, fl + '\n' + rec(3) + '\n'); Ld.emit(fl + '\r\n' + rec(3) + '\r\n');
      } finally { console.warn = w0; }
      const at = ['GAP-1', '"apiKeySource":"the-whole-line"', 'GAP-3'].map((x) => sess.buffer.indexOf(x));
      return { threw, fedText: !!(cu && cu.text), tornFed: !!(cu && cu.text && cu.text.includes(head) && !cu.text.includes(BIG)), partial: cu && cu.rb ? cu.rb.partial.length : null, parsed: sess._apiKeySource || null, gap1: sess.buffer.split('GAP-1').length - 1, gap3: sess.buffer.split('GAP-3').length - 1, order: at[0] >= 0 && at[0] < at[1] && at[1] < at[2] };
    };
    const g = await run(BR), r = await run(BRr);
    ok(!g.threw && g.fedText && !g.tornFed && g.partial === 4000 && g.parsed === 'the-whole-line' && g.gap1 === 1 && g.gap3 === 1 && g.order,
      `a catch-up read landing in the middle of an append feeds only its WHOLE lines: the torn tail (${g.partial} bytes) is that read's partial, and the line arrives WHOLE through the fence, parsed by the real claude consumer (its apiKeySource «${g.parsed}»), once, in its order (the caught-up line, the whole line, the live line)`, g);
    ok(!r.threw && r.tornFed && r.parsed === null, 'RED: the read\'s tail fed as it lay (the base\'s shape) ⇒ the consumer holds the head, the whole line lands on top of it, and that said line is lost (nothing parsed)', r);
  }

  console.log('— ⑫ AFTER A FAILED APPEND NOTHING IS APPENDED until a whole rewrite · ⑬ THE APPEND BUDGET');
  {
    const SJr = require(M.write('src/said-journal.js', anchored(sjSrc, 'fd = closeWritten(fd, where, say); armed = false;\n    if (!failedSaid)', 'fd = closeWritten(fd, where, say);\n    if (!failedSaid)', 'armed-after-failure'), 'armed-after-failure'));   // stale-pins: kept (the red plants the base's fail(): armed left set)
    const SJo = require(M.write('src/said-journal.js', anchored(sjSrc, 'rewritten() { pending = \'\'; armed = true; since = 0; failedSaid = false; overSaid = false;', 'rewritten() { pending = \'\'; armed = true; since = 0; overSaid = false;', 'said-once-a-life'), 'said-once-a-life'));
    const SJb = require(M.write('src/said-journal.js', anchored(sjSrc, 'if (since + b.length > budget) {', 'if (false) {', 'no-budget'), 'no-budget'));
    const line = (k) => `{"type":"a","n":${k},"pad":"${'x'.repeat(40)}"}\n`;
    const episode = (SJm) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'fail-')), f = path.join(dir, 'j.buf'); fs.writeFileSync(f, '');
      let calls = 0, failAt = 2; const said = []; let ring = '';
      const plan = { openSync: (p, m) => fs.openSync(p, m), writeSync: (fd, b, off, len) => { calls++; if (calls === failAt) { fs.writeSync(fd, b, off, Math.floor(len / 2)); const e = new Error('planted: no space left'); e.code = 'ENOSPC'; throw e; } return fs.writeSync(fd, b, off, len); } };
      const j = SJm.create({ file: f, rewrite: () => { fs.writeFileSync(f, ring); j.rewritten(); }, say: (l) => said.push(l), fs: plan });
      const put = (k) => { ring += line(k); j.add(line(k)); return j.flush(); };
      put(1); put(2); put(3); put(4);   // 1 arms (a whole rewrite), 2 appended, 3 torn (half, then ENOSPC), 4 after the failure
      const afterFail = readFile(f), saidFirst = said.length;
      fs.writeFileSync(f, ring); j.rewritten();   // the timer's whole rewrite succeeds: the episode ends
      put(5); calls = 0; failAt = 1; put(6);   // a second episode
      j.close();
      return { torn: afterFail.includes(line(3).slice(0, 20)) && !afterFail.includes(line(3)), four: afterFail.includes('"n":4'), saidFirst, saidAll: said.length, fiveWhole: readFile(f).includes(line(5)) };
    };
    const g = episode(SJ), r = episode(SJr), o = episode(SJo);
    ok(g.torn && !g.four && g.saidFirst === 1 && g.fiveWhole && g.saidAll === 2,
      'a write that throws after a partial write leaves half a record — and NOTHING more is appended until a whole rewrite succeeds; after it the journal appends again; a second failure episode is said again', g);
    ok(r.four, 'RED: the journal left armed after the failure ⇒ the next record is appended onto the torn one (two records, one line no reader parses)', r);
    ok(o.saidAll === 1, 'RED: said once a life ⇒ the second episode is silent', o);
    const budget = (SJm) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'budget-')), f = path.join(dir, 'b.buf'); fs.writeFileSync(f, '');
      const said = []; let ring = '';
      const j = SJm.create({ file: f, rewrite: () => { fs.writeFileSync(f, ring); j.rewritten(); }, say: (l) => said.push(l), budget: 3 * line(0).length });
      const res = []; for (let k = 1; k <= 7; k++) { ring += line(k); j.add(line(k)); res.push(j.flush()); }   // 1 arms; then appends with no rewrite
      j.close();
      return { res: res.map((x) => (x ? 1 : 0)).join(''), size: fs.statSync(f).size, said: said.filter((l) => /since the last whole rewrite/.test(l)).length };
    };
    const gb = budget(SJ), rb = budget(SJb);
    const big = (() => { const dir = fs.mkdtempSync(path.join(HOME, 'big-')), f = path.join(dir, 'g.buf'); fs.writeFileSync(f, ''); const said = []; let ring = ''; const j = SJ.create({ file: f, rewrite: () => { fs.writeFileSync(f, ring); j.rewritten(); }, say: (l) => said.push(l), budget: 32 });
      ring += line(1); j.add(line(1)); j.flush(); ring += line(2); j.add(line(2)); const r2 = j.flush(); j.close(); return { r2, said }; })();
    ok(gb.res === '1111000' && gb.said === 1 && gb.size === 4 * line(0).length,
      `the append budget: past ${3 * line(0).length} bytes appended since the last whole rewrite nothing more is appended, and that is said once (${gb.res}; the file ${gb.size} bytes)`, gb);
    ok(rb.res === '1111111' && rb.size === 7 * line(0).length, 'RED: no budget ⇒ the file grows with every append while the whole rewrite never comes', rb);
    ok(big.r2 === false && big.said.some((l) => l.includes(`a write of ${line(2).length} bytes would pass its bound`)), `a single line over the budget is named by its size (r1266 (e): never «appended 0 bytes»)`, big);
  }

  console.log('— ⑭ A TERMINAL\'S CATCH-UP IS FED AS READ (主开发 r1266, the MUST) · ⑮ A READ TORN INSIDE A MANY-BYTE CHARACTER');
  {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js')), brSrc = read('src/server/boot-restore.js');
    const BRall = require(M.write('src/server/boot-restore.js', anchored(brSrc, 'if (!rb.fence && !rb.wholeLines) return body.length > pb.length', 'if (false) return body.length > pb.length', 'whole-lines-for-all'), 'whole-lines-for-all'));   // stale-pins: kept (the red plants the follow's first shape: whole lines for every survivor)
    const BRtext = require(M.write('src/server/boot-restore.js', anchored(brSrc, 'pfx = body.subarray(0, pb.length).equals(pb);', "pfx = body.toString('utf-8').startsWith(rb.partial);", 'partial-as-text'), 'partial-as-text'));
    const { ptyListeners } = require(path.join(REPO, 'src/pty-duck.js'));
    const { createMessageManager } = require(path.join(REPO, 'src/normalizers'));
    const SO = require(path.join(REPO, 'src/server/session-stdout.js'));
    const anyFn = () => new Proxy(function () { }, { get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : anyFn()), apply: () => undefined });
    const soOf = (tag) => { const dd = fs.mkdtempSync(path.join(HOME, `so14-${tag}-`)); for (const x of ['buffers', 'meta']) fs.mkdirSync(path.join(dd, x)); const engine = new Proxy({ _vsuPending: new Map() }, { get: (t, k) => (k in t ? t[k] : anyFn()), has: () => true });
      return SO.create({ rootDir: dd, BUFFERS_DIR: path.join(dd, 'buffers'), META_DIR: path.join(dd, 'meta'), DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(dd, 'none'), CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(), activeSessions: new Map(), engine,
        checkClaudeGoalStatus() { }, broadcastToSession() { }, broadcastActiveSessions() { }, noteModelSeen() { }, noteHarnessModels() { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h, sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
        getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null, getNoConvoRef: () => ({ map: new Map() }), getDeliver: () => ({ stashFor: () => ({}) }), getBrain: () => anyFn(), getPages: () => null, getPermissionRules: () => null, agentEnv: () => ({}) }); };
    const duckOf = () => { const Ld = ptyListeners(), Le = ptyListeners(); return { pid: 0, onData: (cb) => Ld.on(cb), onExit: (cb) => Le.on(cb), write() { }, resize() { }, kill() { } }; };
    // ⑭ a plain shell survivor: the timer writes a question with NO line end into its screen file inside the attach window
    const term = (BRm, tag) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'term-')), file = path.join(dir, 't.buf');
      fs.writeFileSync(file, '$ ./deploy.sh\r\n');
      const rb = BRm.restoreBufOf(file, fs.readFileSync(file));   // a terminal's read: no fence (its sidecar adverts none)
      const ASKQ = 'Overwrite existing file? [y/N] ';
      fs.writeFileSync(file + '.t', '$ ./deploy.sh\r\nchecking…\r\n' + ASKQ); fs.renameSync(file + '.t', file);   // rewritten WHOLE (the terminal's own road)
      const cu = BRm.restoreCatchUp(rb);
      const sess = { mode: 'terminal', backend: 'terminal', buffer: '$ ./deploy.sh\r\n', sockName: null, clients: new Set() };
      let threw = null; try { soOf(tag).setupSessionPty(sess, 'w-term14', duckOf(), { catchUp: cu && cu.text ? cu : null }); } catch (e) { threw = String((e && e.stack) || e); }
      return { threw, fed: !!(cu && cu.text && cu.text.includes(ASKQ)), shown: sess.buffer.endsWith(ASKQ) };
    };
    const tg = term(BR, 'tg'), tr = term(BRall, 'tr');
    ok(!tg.threw && tg.fed && tg.shown, 'a TERMINAL survivor whose screen file gains a question with no line end in the attach window: its catch-up feeds the read as the release did — the question is on the screen', tg);
    ok(!tr.threw && !tr.fed && !tr.shown, 'RED: whole lines for every survivor (the follow\'s first shape) ⇒ the question is never drawn: the program waits on an answer nobody is asked', tr);
    // ⑮ a chat survivor's registration read torn INSIDE a many-byte character (a Chinese line): the read's partial ends in a
    // replacement mark — compared as BYTES, the head leaves the buffer and the whole line comes back once
    const cjk = (BRm, tag, fenced = false) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'cjk-')), file = path.join(dir, 'c.buf');
      const LINE = JSON.stringify({ type: 'system', subtype: 'informational', level: 'info', content: '这是一个会被撕开的中文句子，在一个多字节字符的中间' });
      const lb = Buffer.from(LINE + '\n', 'utf-8'), cut = lb.indexOf(Buffer.from('撕', 'utf-8')) + 1;   // inside the character's three bytes
      fs.writeFileSync(file, Buffer.concat([Buffer.from('{"type":"system","subtype":"informational","content":"head"}\n'), lb.subarray(0, cut)]));
      const raw = fs.readFileSync(file), rb = BRm.restoreBufOf(file, raw);
      if (fenced) rb.fence = true;   // r1418 (1): a journaled wrapper (its sidecar adverts the fence): the whole-lines road
      fs.appendFileSync(file, lb.subarray(cut));
      const cu = BRm.restoreCatchUp(rb);
      const sid = 'w-cjk15', sess = { mode: 'chat', backend: 'claude', buffer: raw.toString('utf-8'), sockName: null, clients: new Set(), _normalizer: createMessageManager('claude', sid) };
      let threw = null; try { soOf(tag).setupSessionPty(sess, sid, duckOf(), { catchUp: cu && cu.text ? cu : null }); } catch (e) { threw = String((e && e.stack) || e); }
      return { threw, torn: rb.partial.includes('�'), dropped: !!(cu && cu.drop), whole: sess.buffer.split(LINE).length - 1, mark: sess.buffer.includes('�') };
    };
    const cg = cjk(BR, 'cg'), cr = cjk(BRtext, 'cr');
    ok(!cg.threw && cg.torn && cg.dropped && cg.whole === 1 && !cg.mark, 'a registration read torn INSIDE a many-byte character (its partial ends in a replacement mark): compared as bytes, the torn head leaves the buffer and the whole line is in it ONCE, no mark left', cg);
    ok(!cr.threw && cr.torn && !cr.dropped && cr.mark, 'RED: the partial compared as decoded text ⇒ never equal: the torn head (its replacement mark) stays glued before the whole line — a page built from it holds a line that will not parse', cr);
    const cgf = cjk(BR, 'cgf', true), crf = cjk(BRtext, 'crf', true);
    ok(!cgf.threw && cgf.torn && cgf.dropped && cgf.whole === 1 && !cgf.mark, 'the same on the FENCED road (r1418 (1): a journaled wrapper, whole lines): compared as bytes, the torn head leaves the buffer and the whole line is in it ONCE, no mark left', cgf);
    ok(!crf.threw && crf.torn && !crf.dropped && crf.mark, 'RED (fenced): the partial compared as text ⇒ the torn head stays glued before the whole line', crf);
    // r1418 (2): a CHAT record whose sidecar could not be read — maybe a journaled wrapper, its file appended: a catch-up landing
    // mid-append takes WHOLE LINES (the torn tail never fed: the line said after the connect lands clean), and asks no fence
    const unread = (wholeLines) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'unread-')), file = path.join(dir, 'u.buf');
      const H = '{"type":"a","n":0}\n', A1 = '{"type":"a","n":1}\n', B1 = '{"type":"assistant","text":"a line torn in the middle of its append"}\n';
      fs.writeFileSync(file, H);
      const rb = BR.restoreBufOf(file, fs.readFileSync(file));
      if (wholeLines) rb.wholeLines = true;
      fs.appendFileSync(file, A1 + B1.slice(0, 20));   // A whole, B torn mid-append
      const cu = BR.restoreCatchUp(rb);
      return { text: cu && cu.text, torn: !!(cu && cu.text && cu.text.includes(B1.slice(0, 20))), fence: !!(cu && cu.rb && cu.rb.fence) };
    };
    const uw = unread(true), ua = unread(false);
    ok(uw.text === '{"type":"a","n":1}\n' && !uw.torn && !uw.fence, `a chat record whose sidecar could not be read: its catch-up feeds WHOLE LINES only (${JSON.stringify(uw.text)}), the torn tail never fed, no fence asked`, uw);
    ok(ua.torn, 'RED: fed AS READ (the release for that record) ⇒ the torn head is fed — the same line said after the connect lands glued to it and will not parse', ua);
    const WIRE = "else if (restoreBuf && !wrapperObs && sessionMode === 'chat') restoreBuf.wholeLines = true;";
    const wired = (t) => { const i = t.indexOf(WIRE), j = t.indexOf("wrapperObs.caps.fence === SJ.FENCE_VERSION) restoreBuf.fence = true;"); return i > 0 && j > 0 && i > j && i - j < 600; };
    ok(wired(brSrc), 'the restore marks it: a chat record (its mode) whose sidecar was not read gets `wholeLines`, right after the fence\'s own mark (by text)');
    ok(!wired(brSrc.replace(WIRE, '')), 'CONTROL: a copy without the mark is named');
  }

  console.log('— ⑩ THE RESTORE\'S WIRING (src/server/boot-restore.js)');
  {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    const dir = fs.mkdtempSync(path.join(HOME, 'br-')), f = path.join(dir, 'r.buf');
    const a = (n) => `{"type":"a","n":${n}}\n`;
    fs.writeFileSync(f, a(0));
    const rb0 = Object.assign(BR.restoreBufOf(f, fs.readFileSync(f)), { fence: true });
    fs.appendFileSync(f, a(1));
    const cu = BR.restoreCatchUp(rb0);   // the catch-up: what came after the registration's read — and where ITS read ended
    fs.appendFileSync(f, a(2));
    const nx = cu && cu.rb ? BR.restoreCatchUp(cu.rb) : null;   // the fence reads on from there: exactly what came after
    const brSrc = read('src/server/boot-restore.js'), ssSrc = read('src/server/session-stdout.js');
    ok(!!cu && cu.text === a(1) && !!cu.rb && cu.rb.len === a(0).length + a(1).length && !!nx && nx.text === a(2)
      && /if \(restoreBuf && wrapperObs && wrapperObs\.caps && wrapperObs\.caps\.fence === SJ\.FENCE_VERSION\) restoreBuf\.fence = true;/.test(brSrc)
      && /const rb0 = session\._restoreBuf, fence = rb0 && rb0\.fence && !\(cu && cu\.skipped\) && !\(cu && cu\.text && !cu\.rb\) \? \{ rb: cu && cu\.text \? cu\.rb : rb0, read: restoreCatchUp \} : null;/.test(brSrc)
      && /win = gate\.tail \+ data, kw = win\.indexOf\(fl\)/.test(ssSrc) && /const all = gate\.held\.join\(''\), k = gate\.size - win\.length \+ kw;/.test(ssSrc) && !/tailAt/.test(brSrc)
      && /attachToDtach\(id, socketPath, session, \{ restore: true, catchUp: cu && cu\.text \? cu : null, fence \}\);/.test(brSrc)
      && /setupSessionPty\(session, id, attachPty, \{ catchUp, fence \}\);/.test(ssSrc),
      'a fence only for a wrapper whose sidecar adverts it, read from where the catch-up\'s read ENDED (restoreCatchUp returns its own end: the next read is exactly what came after), handed to the local attach only (pinned by text)', { cu: cu && { text: cu.text, len: cu.rb && cu.rb.len }, nx: nx && nx.text });
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
