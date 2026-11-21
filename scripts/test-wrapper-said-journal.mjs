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
    const r = await life(mirror('keeps-fd', { 'src/said-journal.js': anchored(sjSrc, "rewritten() { pending = ''; armed = true; fd = closeWritten(fd, where, say); },", "rewritten() { pending = ''; armed = true; },", 'the descriptor kept') }));
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
      w.stdin.write(SJ.fenceAsk('X-1') + '\n');
      await until(() => said.some((e) => e.r.type === SJ.FENCE_TYPE && e.r.id === 'X-1'), root === REPO ? 3000 : 300);   // the red's wrapper answers none
      const m = readMeta() || {};
      try { w.kill('SIGKILL'); } catch { } await exited;
      const lines = said.filter((e) => !String(e.r.type || '').startsWith('_'));
      const fence = said.find((e) => e.r.type === SJ.FENCE_TYPE && e.r.id === 'X-1');
      return { n: lines.length, all: lines.length > 0 && lines.every((e) => e.inFile), anyOut: lines.some((e) => !e.inFile), fence: !!(fence && fence.inFile), caps: (m.caps && m.caps.fence) || null, thread: m.threadId || null };
    };
    const g = await life(REPO);
    const r = await life(mirror('cx-no-journal', { [CX]: anchored(cxSrc, CX_JOURNAL_PLANT, 'const JOURNAL = null;', 'the codex journal cut') }));
    ok(g.thread === 'th-said-1' && g.all && g.fence && g.caps === SJ.FENCE_VERSION, `the codex wrapper: every record it said (${g.n}) was in its file at that moment; its fence the same; the sidecar adverts caps.fence ${g.caps}`, g);
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
    const run = async (so, { fence = true, answer = true } = {}) => {
      const dir = fs.mkdtempSync(path.join(HOME, 'gate-')), file = path.join(dir, 'w.buf');
      fs.writeFileSync(file, rec(0) + '\n');                                   // what the catch-up read
      const rb = BR.restoreBufOf(file, fs.readFileSync(file));
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
          fs.appendFileSync(file, fl + '\n' + rec(3) + '\n'); Ld.emit(fl + '\r\n' + rec(3) + '\r\n');   // the fence, then a line after it
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
    const bd = await run(soOf(require(M.write('src/server/session-stdout.js', anchored(soSrc, 'const FENCE_WAIT_MS = 3000,', 'const FENCE_WAIT_MS = 50,', 'short-bound'), 'short-bound')), 'bd'), { answer: false });
    ok(!g.threw && g.asked && g.n.join() === '1,1,1' && g.at[0] < g.at[1] && g.at[1] < g.at[2] && !g.fence,
      `the gate asks the fence at the first byte; what the survivor said between the catch-up and the connect reaches the consumer FIRST (${g.at.join(' < ')}), each live line once, the fence record never`, g);
    ok(!r.threw && r.n[0] === 0 && r.n[1] === 1 && r.n[2] === 1, 'RED: the gap not fed ⇒ the line said between the catch-up and the connect never reaches the conversation', r);
    ok(!nf.threw && !nf.asked && nf.n[1] === 1, 'a wrapper with no fence (its sidecar adverts none): no ask, the live lines as before', nf);
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
    ok(g1.lost === `${A}\n` && g2.lost === `${A}\n${B.slice(0, 5)}` && g3.lost === `${A}\n` && g8.lost === `${A}\n${B}\n`,
      'the gap = the file\'s lines before the fence less the live stream\'s END: a line the connect tore gives back its head; the preamble and the transport records are no live line; nothing live ⇒ all of it', { g1, g2, g3, g8 });
    ok(!!g4.skipped && !!g5.skipped && !!g6.skipped && g7.skipped === 'rewritten', 'a live line the file does not hold, no fence in the file, no file past the catch-up: fed nothing, the reason said', { g4, g5, g6, g7 });
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

  console.log('— ⑩ THE RESTORE\'S WIRING (src/server/boot-restore.js)');
  {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    const dir = fs.mkdtempSync(path.join(HOME, 'br-')), f = path.join(dir, 'r.buf');
    const a = (n) => `{"type":"a","n":${n}}\n`;
    fs.writeFileSync(f, a(0));
    const rb0 = BR.restoreBufOf(f, fs.readFileSync(f));
    fs.appendFileSync(f, a(1));
    const cu = BR.restoreCatchUp(rb0);   // the catch-up: what came after the registration's read — and where ITS read ended
    fs.appendFileSync(f, a(2));
    const nx = cu && cu.rb ? BR.restoreCatchUp(cu.rb) : null;   // the fence reads on from there: exactly what came after
    const brSrc = read('src/server/boot-restore.js'), ssSrc = read('src/server/session-stdout.js');
    ok(!!cu && cu.text === a(1) && !!cu.rb && cu.rb.len === a(0).length + a(1).length && !!nx && nx.text === a(2)
      && /if \(restoreBuf && wrapperObs && wrapperObs\.caps && wrapperObs\.caps\.fence === SJ\.FENCE_VERSION\) restoreBuf\.fence = true;/.test(brSrc)
      && /const rb0 = session\._restoreBuf, fence = rb0 && rb0\.fence && !\(cu && cu\.skipped\) \? \{ rb: \(cu && cu\.rb\) \|\| rb0, read: restoreCatchUp \} : null;/.test(brSrc)
      && /attachToDtach\(id, socketPath, session, \{ restore: true, catchUp: cu && cu\.text \? cu : null, fence \}\);/.test(brSrc)
      && /setupSessionPty\(session, id, attachPty, \{ catchUp, fence \}\);/.test(ssSrc),
      'a fence only for a wrapper whose sidecar adverts it, read from where the catch-up\'s read ENDED (restoreCatchUp returns its own end: the next read is exactly what came after), handed to the local attach only (pinned by text)', { cu: cu && { text: cu.text, len: cu.rb && cu.rb.len }, nx: nx && nx.text });
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
