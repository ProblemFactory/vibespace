#!/usr/bin/env node
// THE INCREMENTAL JSONL TAIL CACHE (perf lane chunk C, 2.369.167 — "an attach of
// a loaded session re-parses nothing it already holds").
//
// THE HOT PATH: every re-attach of a loaded chat session calls
// `sm.activePendingPermissions()` and `sm.chatStatus()`, i.e. SessionMessages
// `_ensureParsed` → `parseSessionJsonl`, SYNC on the server's loop. Its cache is
// keyed by (mtime, size), and a live conversation's transcript grows between any
// two attaches — so the whole 32 MiB tail was re-read and re-parsed every time
// to learn about the few KB the CLI had appended.
//
// THE FIX UNDER TEST (src/adapters/codex.js `readJsonlTail` + session-store's
// cache entry `{mtimeMs, size, ino, spanStart, spanEnd, messages, starts, …}`):
// a grown, append-only file is read from `spanEnd` to its end ONLY, whole lines
// are parsed and appended, the unterminated tail line is left for the next read,
// and head records slide out by their byte span exactly where readJsonlBounded's
// tail rule would cut them. Anything else (shrink, a replaced file, a rewritten
// byte under the probes) is today's full read.
//
// THE ORACLE is today's algorithm (2.369.160) copied verbatim below — NOT the
// module's own reader, so a bug shared by the new reader and a refactored
// readJsonlBounded cannot agree with itself.
//
// Legs (red on the unfixed code: it stamps no `srv-jsonl-parse-bytes` and reads
// the whole tail on every change):
//  (a) grow by 100 records ⇒ the second parse reads ONLY the appended bytes and
//      equals a fresh parse; (b) grow across the 34 MiB head+tail threshold and
//      further ⇒ the head slides, equal to a fresh tailOnly parse, bytes read =
//      the appended bytes; (c) shrink / replace ⇒ a full re-read, equal; (d) an
//      unterminated trailing line — invalid JSON excluded, then completed and
//      included ONCE; a VALID unterminated line included like the oracle does,
//      then terminated + followed and still included once; (e) same mtime+size ⇒
//      no read at all (same array); (f) an in-place rewrite of a head byte with a
//      larger size ⇒ a full re-read (the append-only check); (g) the async warm
//      (the attach entry point): worker-built entries are incremental-capable and
//      a small append is folded inline; (h) SessionMessages over the incremental
//      cache = SessionMessages over a cold cache (raw / chatStatus / pending
//      permissions), incl. the buffer-merge memo.
// Run: node scripts/test-jsonl-incremental.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchHome, fixtureSid } from './scratch.mjs';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };

// the REAL home's project list, read BEFORE this process is re-homed — the per-suite
// census at the end proves the fixture never landed there (test-fixture-isolation (c))
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require('../src/fixture-guard.js');
const home = scratchHome('jsonl-incr-home', fs);
const cleanup = () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
process.env.HOME = home;
os.homedir = () => home;

const metrics = [];
global.__vsMetric = (name, value) => metrics.push({ name, value });
const bytesSince = (mark) => metrics.slice(mark).filter((m) => m.name === 'srv-jsonl-parse-bytes').reduce((s, m) => s + m.value, 0);
const bytesStamps = (mark) => metrics.slice(mark).filter((m) => m.name === 'srv-jsonl-parse-bytes').length;

const store = require('../src/session-store.js');
const { SessionMessages } = store;
const clearCache = () => { if (typeof store.jsonlCacheClear === 'function') store.jsonlCacheClear(); };

const CWD = '/tmp/vs-jsonl-incr-cwd';
const PROJ = path.join(home, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
fs.mkdirSync(PROJ, { recursive: true });

// ── THE ORACLE: readJsonlBounded(tailOnly) + session-store's line parse, as of 2.369.160 ──
const HEAD = 2 * 1024 * 1024, TAIL = 32 * 1024 * 1024;
function oracle(fp) {
  const stat = fs.statSync(fp);
  let content;
  if (stat.size <= HEAD + TAIL) content = fs.readFileSync(fp, 'utf-8');
  else {
    const fd = fs.openSync(fp, 'r');
    try {
      const tailBuf = Buffer.alloc(TAIL);
      const tn = fs.readSync(fd, tailBuf, 0, TAIL, stat.size - TAIL);
      let tail = tailBuf.toString('utf-8', 0, tn);
      content = tail.slice(tail.indexOf('\n') + 1);
    } finally { fs.closeSync(fd); }
  }
  const messages = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (!(msg.parent_tool_use_id || msg.isSidechain)) messages.push(msg);
    } catch { }
  }
  return messages;
}
const same = (a, b) => a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
const diffAt = (a, b) => { let i = 0; while (i < a.length && i < b.length && JSON.stringify(a[i]) === JSON.stringify(b[i])) i++; return `lengths ${a.length} vs ${b.length}, first difference at #${i}`; };

// ── records: a §1c-ish mix (prompts, tool calls + results, multibyte text, sidechain
// noise, a blank line and a garbage line now and then) ──
let seq = 0;
const ts = () => new Date(Date.UTC(2026, 8, 23, 0, 0, 0) + seq * 1000).toISOString();
function record(sid, padBytes = 600) {
  const i = seq++;
  const pad = 'p'.repeat(padBytes + (i * 37) % 400);
  switch (i % 7) {
    case 0: return { type: 'user', uuid: `u-${i}`, timestamp: ts(), sessionId: sid, message: { role: 'user', content: [{ type: 'text', text: `问题 ${i} ${pad}` }] } };
    case 1: return { type: 'assistant', uuid: `a-${i}`, timestamp: ts(), sessionId: sid, requestId: `req_${i}`, message: { id: `msg_${i}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: `toolu_${i}`, name: 'Bash', input: { command: `ls ${i}` } }] } };
    case 2: return { type: 'user', uuid: `r-${i}`, timestamp: ts(), sessionId: sid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${i - 1}`, content: `out ${pad}` }] } };
    case 3: return { type: 'assistant', uuid: `s-${i}`, timestamp: ts(), sessionId: sid, isSidechain: true, parent_tool_use_id: `toolu_${i - 2}`, message: { id: `msg_s${i}`, role: 'assistant', content: [{ type: 'text', text: 'sidechain noise' }] } };
    case 4: return { type: 'assistant', uuid: `t-${i}`, timestamp: ts(), sessionId: sid, requestId: `req_${i}`, message: { id: `msg_${i}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `答案 ${i} марker ${pad}` }] } };
    case 5: return { type: 'system', subtype: 'stop_hook_summary', uuid: `y-${i}`, timestamp: ts(), sessionId: sid };
    default: return { type: 'attachment', uuid: `x-${i}`, timestamp: ts(), sessionId: sid, attachment: { type: 'hook_success', content: pad } };
  }
}
function lines(sid, n, padBytes) {
  let out = '';
  for (let k = 0; k < n; k++) {
    out += JSON.stringify(record(sid, padBytes)) + '\n';
    if (seq % 97 === 0) out += '\n';                 // a blank line
    if (seq % 211 === 0) out += '{"not json\n';     // a garbage line
  }
  return out;
}
function writeBig(fp, sid, targetBytes, padBytes = 4000) {
  const fd = fs.openSync(fp, 'w');
  let size = 0;
  while (size < targetBytes) { const chunk = lines(sid, 200, padBytes); fs.writeSync(fd, chunk); size += Buffer.byteLength(chunk); }
  fs.closeSync(fd);
}
const append = (fp, text) => fs.appendFileSync(fp, text);
// mtime granularity: a same-size same-mtime rewrite is the ONE case no stat can see;
// every leg that changes content moves the size, and (e) is the only same-stat leg
const parse = (sid) => store.parseSessionJsonl(sid, CWD);

// ── (a) grow by 100 records ──
{
  const sid = fixtureSid('c0a');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 6 * 1048576, 1200);
  const m0 = metrics.length;
  const t0 = performance.now(); const p1 = parse(sid); const cold = performance.now() - t0;
  ok(same(p1, oracle(fp)), `(a) cold parse equals the oracle (${p1.length} records, ${(fs.statSync(fp).size / 1048576).toFixed(1)} MB)`, diffAt(p1, oracle(fp)));
  const before = fs.statSync(fp).size;
  append(fp, lines(sid, 100, 800));
  const appended = fs.statSync(fp).size - before;
  const m1 = metrics.length;
  const t1 = performance.now(); const p2 = parse(sid); const warm = performance.now() - t1;
  ok(same(p2, oracle(fp)), `(a) after +100 records the cached parse equals a fresh parse (${p2.length} records)`, diffAt(p2, oracle(fp)));
  const read = bytesSince(m1);
  ok(bytesStamps(m1) === 1 && read === appended, `(a) the second parse read ONLY the appended bytes (srv-jsonl-parse-bytes ${read} = appended ${appended}; file ${fs.statSync(fp).size})`, { stamps: bytesStamps(m1), read, appended });
  ok(bytesSince(m0) - read === before, `(a) the cold parse stamped the whole file (${bytesSince(m0) - read} = ${before})`);
  ok(p2 !== p1 && p1.length < p2.length, '(a) a NEW array is returned (a caller holding the old one never sees it grow)');
  console.log(`    cold ${cold.toFixed(1)} ms · +100 records ${warm.toFixed(2)} ms`);
}

// ── (b) grow across the 34 MiB threshold, then further: the head slides ──
{
  const sid = fixtureSid('c0b');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, HEAD + TAIL - 1024 * 1024);            // 33 MiB: whole-file mode
  const p1 = parse(sid);
  ok(same(p1, oracle(fp)), `(b) whole-file mode (${(fs.statSync(fp).size / 1048576).toFixed(2)} MB) equals the oracle`, diffAt(p1, oracle(fp)));
  let s0 = fs.statSync(fp).size;
  append(fp, lines(sid, 400, 4000));                         // crosses 34 MiB ⇒ tail mode
  let appended = fs.statSync(fp).size - s0;
  let m = metrics.length;
  const p2 = parse(sid);
  const o2 = oracle(fp);
  ok(fs.statSync(fp).size > HEAD + TAIL && same(p2, o2), `(b) crossing into tail mode (${(fs.statSync(fp).size / 1048576).toFixed(2)} MB): the head slid, equal to a fresh tailOnly parse (${p1.length} → ${p2.length} records)`, diffAt(p2, o2));
  ok(p2[0]?.uuid !== p1[0]?.uuid, `(b) the first record moved (${p1[0]?.uuid} → ${p2[0]?.uuid})`);
  ok(bytesSince(m) === appended, `(b) the slide read only the appended bytes (${bytesSince(m)} = ${appended})`);
  for (let round = 0; round < 3; round++) {
    s0 = fs.statSync(fp).size;
    append(fp, lines(sid, 150 + round * 90, 3000 + round * 1111));
    appended = fs.statSync(fp).size - s0;
    m = metrics.length;
    const p = parse(sid);
    const o = oracle(fp);
    ok(same(p, o) && bytesSince(m) === appended, `(b) tail mode, append round ${round + 1} (+${(appended / 1024).toFixed(0)} KB): equal to the oracle, read ${bytesSince(m)} bytes`, same(p, o) ? { read: bytesSince(m), appended } : diffAt(p, o));
  }
}

// ── (c) shrink / replace ⇒ full re-read ──
{
  const sid = fixtureSid('c0c');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 2 * 1048576, 900);
  parse(sid);
  // shrink: truncate to the first half, at a line boundary
  const buf = fs.readFileSync(fp);
  const cut = buf.indexOf(10, buf.length >> 1) + 1;
  fs.truncateSync(fp, cut);
  let m = metrics.length;
  let p = parse(sid);
  ok(same(p, oracle(fp)) && bytesSince(m) === cut, `(c) truncated to ${cut} bytes: a full re-read (${bytesSince(m)} bytes), equal`, diffAt(p, oracle(fp)));
  // replace: a NEW file (new inode) that is LARGER and starts with the same bytes
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, fs.readFileSync(fp).toString('utf-8').replace(/问题/, '问答') + lines(sid, 50, 900));
  fs.renameSync(tmp, fp);
  m = metrics.length;
  p = parse(sid);
  ok(same(p, oracle(fp)) && bytesSince(m) === fs.statSync(fp).size, `(c) replaced by a larger file (new inode): a full re-read (${bytesSince(m)} bytes), equal`, diffAt(p, oracle(fp)));
  // rotate: the SAME inode rewritten from byte 0 with different, longer content
  fs.writeFileSync(fp, lines(sid, 3000, 500));
  m = metrics.length;
  p = parse(sid);
  ok(same(p, oracle(fp)) && bytesSince(m) === fs.statSync(fp).size, `(c) rewritten in place from byte 0: a full re-read, equal (${p.length} records)`, diffAt(p, oracle(fp)));
}

// ── (d) the unterminated trailing line ──
{
  const sid = fixtureSid('c0d');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 1048576, 700);
  parse(sid);
  const rec = JSON.stringify({ type: 'user', uuid: 'partial-1', timestamp: ts(), sessionId: sid, message: { role: 'user', content: [{ type: 'text', text: '半行 partial марker' }] } });
  const half = Buffer.from(rec).subarray(0, 23);            // mid-record, mid-nothing-parseable
  append(fp, half);
  let p = parse(sid);
  ok(same(p, oracle(fp)) && !p.some((r) => r.uuid === 'partial-1'), '(d) a half-written line is excluded (equal to the oracle)');
  append(fp, Buffer.from(rec).subarray(23));
  append(fp, '\n' + lines(sid, 5, 300));
  p = parse(sid);
  ok(same(p, oracle(fp)) && p.filter((r) => r.uuid === 'partial-1').length === 1, '(d) completed on the next append: included exactly ONCE, equal to the oracle', diffAt(p, oracle(fp)));
  // a VALID record with no newline yet: the oracle parses it — so must we…
  const rec2 = JSON.stringify({ type: 'user', uuid: 'partial-2', timestamp: ts(), sessionId: sid, message: { role: 'user', content: [{ type: 'text', text: 'no newline yet 世界' }] } });
  append(fp, rec2);
  p = parse(sid);
  ok(same(p, oracle(fp)) && p.filter((r) => r.uuid === 'partial-2').length === 1, '(d) a VALID unterminated line is included, as the oracle includes it');
  // …and when its newline and more records land, it is still there ONCE
  const m = metrics.length;
  const tailText = '\n' + lines(sid, 3, 300);
  append(fp, tailText);
  p = parse(sid);
  ok(same(p, oracle(fp)) && p.filter((r) => r.uuid === 'partial-2').length === 1, '(d) terminated + followed: still exactly ONCE, equal to the oracle', diffAt(p, oracle(fp)));
  ok(bytesSince(m) === Buffer.byteLength(rec2) + Buffer.byteLength(tailText), `(d) the unterminated bytes are re-read, nothing else (${bytesSince(m)} bytes)`);
}

// ── (e) same mtime + size ⇒ no read ──
{
  const sid = fixtureSid('c0e');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 1048576, 700);
  const p1 = parse(sid);
  const m = metrics.length;
  const realRead = fs.readSync, realOpen = fs.openSync, realReadFile = fs.readFileSync;
  let reads = 0;
  fs.readSync = (...a) => { reads++; if (process.env.DBG) console.log(new Error().stack); return realRead(...a); };
  fs.readFileSync = (f, ...a) => { if (String(f).endsWith('.jsonl')) reads++; return realReadFile(f, ...a); };
  let p2;
  try { p2 = parse(sid); } finally { fs.readSync = realRead; fs.openSync = realOpen; fs.readFileSync = realReadFile; }
  ok(p2 === p1 && reads === 0 && bytesStamps(m) === 0, `(e) unchanged file: the cached array, zero reads, no metric (reads ${reads})`);
}

// ── (f) an in-place rewrite of a head byte + a larger size ⇒ full re-read ──
{
  const sid = fixtureSid('c0f');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 1048576, 700);
  parse(sid);
  const ino = fs.statSync(fp).ino;
  // the first record's text: `问题 0` → `问题 9` (same byte length, same inode)
  const fd = fs.openSync(fp, 'r+');
  const head = Buffer.alloc(400); fs.readSync(fd, head, 0, 400, 0);
  const at = head.indexOf(Buffer.from('问题 '));
  fs.writeSync(fd, Buffer.from('9'), 0, 1, at + Buffer.byteLength('问题 '));
  fs.closeSync(fd);
  append(fp, lines(sid, 20, 300));
  const m = metrics.length;
  const p = parse(sid);
  ok(fs.statSync(fp).ino === ino && same(p, oracle(fp)) && bytesSince(m) === fs.statSync(fp).size, `(f) head byte rewritten + grown (same inode): a FULL re-read (${bytesSince(m)} bytes of ${fs.statSync(fp).size}), equal`, diffAt(p, oracle(fp)));
  ok(p[0]?.message?.content?.[0]?.text?.startsWith('问题 9'), '(f) the rewritten byte is visible (never the stale cached record)');
}

// ── (g) the async warm (the attach entry point) ──
{
  const sid = fixtureSid('c0a0');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 3 * 1048576, 900);
  clearCache();
  const warmed = await store.warmSessionJsonlAsync(sid, CWD);
  ok(warmed === true, '(g) the cold warm filled the cache (worker or inline)');
  let m = metrics.length;
  const p0 = parse(sid);
  ok(same(p0, oracle(fp)) && bytesStamps(m) === 0, '(g) the sync parse after the warm is a hit, equal to the oracle');
  const s0 = fs.statSync(fp).size;
  append(fp, lines(sid, 40, 500));
  m = metrics.length;
  ok(await store.warmSessionJsonlAsync(sid, CWD) === true, '(g) the warm after an append succeeded');
  ok(bytesSince(m) === fs.statSync(fp).size - s0, `(g) …by reading only the appended bytes (${bytesSince(m)} = ${fs.statSync(fp).size - s0}) — a worker-built entry is incremental-capable`);
  m = metrics.length;
  const p1 = parse(sid);
  ok(same(p1, oracle(fp)) && bytesStamps(m) === 0, '(g) and the sync parse after it is a hit, equal to the oracle');
}

// ── (h) SessionMessages over the incremental cache = over a cold cache ──
{
  const sid = fixtureSid('c0b0');
  const fp = path.join(PROJ, sid + '.jsonl');
  writeBig(fp, sid, 2 * 1048576, 900);
  // a live buffer: one record the JSONL has (dedups), a stdout-only init and result,
  // a pending permission request, a sidechain record (dropped)
  const lastUser = oracle(fp).filter((r) => r.type === 'user').pop();
  const buffer = [
    JSON.stringify(lastUser),
    JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, model: 'claude-fable-5', slash_commands: ['a', 'b'] }),
    JSON.stringify({ type: 'control_request', request_id: 'rq-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', tool_use_id: 'toolu_pending', input: { command: 'rm x' } } }),
    JSON.stringify({ type: 'result', subtype: 'success', session_id: sid }),
    JSON.stringify({ type: 'assistant', isSidechain: true, parent_tool_use_id: 'toolu_x', message: { id: 'msg_side', content: [] } }),
  ].join('\n') + '\n';
  const session = { claudeSessionId: sid, cwd: CWD, buffer, backend: 'claude', mode: 'chat' };
  const view = (sm) => JSON.stringify({ raw: sm.raw(), total: sm.total, status: sm.chatStatus(), perms: sm.activePendingPermissions(), pending: sm.pendingPermissions, tail: sm.tail(30) });
  new SessionMessages(session).raw();                       // cache warm
  append(fp, lines(sid, 60, 700));
  const warmView = view(new SessionMessages(session));
  const again = view(new SessionMessages(session));          // the merge memo (same jsonl, same buffer)
  clearCache();
  const coldView = view(new SessionMessages(session));
  ok(warmView === coldView, `(h) SessionMessages over the incremental cache = over a cold cache (raw/total/chatStatus/pending permissions/tail, ${warmView.length} bytes)`);
  ok(again === coldView, '(h) a second SessionMessages over the same jsonl + buffer (the merge memo) is identical too');
  const sm = new SessionMessages({ ...session, buffer: buffer + JSON.stringify({ type: 'control_request', request_id: 'rq-2', request: { subtype: 'can_use_tool', tool_name: 'Read', tool_use_id: 'toolu_pending2', input: {} } }) + '\n' });
  ok(!!sm.activePendingPermissions()['toolu_pending2'] && !!sm.activePendingPermissions()['toolu_pending'], '(h) a changed buffer is merged afresh (never the memo of the old one)');
  const sm2 = new SessionMessages(session);
  const perms = sm2.pendingPermissions; perms.injected = 1;
  ok(!('injected' in new SessionMessages(session).pendingPermissions), '(h) one instance mutating its pendingPermissions object never leaks into the next (per-instance copy)');
}

// ── the REAL home is untouched (this process was re-homed before the code under test loaded) ──
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(lit.offenders.length === 0 && !after.some((d) => d.name === path.basename(PROJ)), `the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.slice(0, 3));
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
