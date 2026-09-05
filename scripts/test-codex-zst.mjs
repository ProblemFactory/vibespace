#!/usr/bin/env node
// Harness S3 (2.369.31): the descriptor STORE + codex facts off the hot path
// + zstd rollouts (codex ≥0.153). Real fixtures under a temp HOME:
//   ① zstd readers (discovery-facts + adapters/codex): multi-frame decompress,
//      bounded head reads, materialized plain twin, locate .jsonl.zst
//   ② the usage walk (module + shipped scanner) counts a .zst rollout, with
//      an incremental cursor (compressed-size keyed)
//   ③ discovery interpretation: NC names (codex naming rule, truncated lines),
//      CO open rollouts → remote-running, .zst thread ids, dedup of twins
//   ④ the async codex listing keeps the MAIN THREAD free over a 2000-rollout
//      tree (worker-side walk + dir-mtime cache) and lists every thread
//   ⑤ descriptor store contract + route/consumer wiring pins
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 400) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// isolated HOME so adapters/codex's CODEX_SESSIONS_DIR (read at require time) is ours
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-zst-home-'));
process.env.HOME = home; process.env.CODEX_HOME = path.join(home, '.codex');
const cxDir = path.join(home, '.codex', 'sessions', '2026', '09', '05');
fs.mkdirSync(cxDir, { recursive: true });
const TID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', TID2 = '11111111-2222-4333-8444-555555555555';
const rec = (o) => JSON.stringify(o) + '\n';
const rollout = (tid, cwd, firstUser, n = 3) => [
  rec({ timestamp: '2026-09-05T00:00:00.000Z', type: 'session_meta', payload: { id: tid, cwd, timestamp: '2026-09-05T00:00:00.000Z', cli_version: '0.153.4' } }),
  rec({ timestamp: '2026-09-05T00:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>\nfoo\n</recommended_plugins>' }] } }),
  rec({ timestamp: '2026-09-05T00:00:02.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: firstUser }] } }),
  rec({ timestamp: '2026-09-05T00:00:03.000Z', type: 'turn_context', payload: { model: 'gpt-6-astra', cwd } }),
  ...Array.from({ length: n }, (_, i) => rec({ timestamp: `2026-09-05T00:00:0${4 + i}.000Z`, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1000 * (i + 1), cached_input_tokens: 500 * (i + 1), output_tokens: 10 }, total_token_usage: { total_tokens: 1000 * (i + 1) + 10 } } } })),
].join('');
const plainText = rollout(TID, '/work/plain', 'please fix the parser bug in lexer.js');
const zstText = rollout(TID2, '/work/zst', 'compressed rollout question about zstd');
// two frames (an appended rollout) + a skippable frame in between
const frame1 = zlib.zstdCompressSync(Buffer.from(zstText.slice(0, 300)));
const skippable = Buffer.concat([Buffer.from([0x50, 0x2a, 0x4d, 0x18]), Buffer.from([4, 0, 0, 0]), Buffer.from('xxxx')]);
const frame2 = zlib.zstdCompressSync(Buffer.from(zstText.slice(300)));
const zstBuf = Buffer.concat([frame1, skippable, frame2]);
const plainPath = path.join(cxDir, `rollout-2026-09-05T00-00-00-${TID}.jsonl`);
const zstPath = path.join(cxDir, `rollout-2026-09-05T00-00-00-${TID2}.jsonl.zst`);
fs.writeFileSync(plainPath, plainText);
fs.writeFileSync(zstPath, zstBuf);

console.log('— ① zstd readers');
const DF = require(path.join(REPO, 'src/discovery-facts.js'));
ok(DF.ZSTD_SUPPORTED === true, `this node (${process.versions.node}) has zlib zstd (the readers need ≥22.15)`);
ok(DF.isZstBuffer(zstBuf) && !DF.isZstBuffer(Buffer.from(plainText)) && DF.isZstPath(zstPath) && !DF.isZstPath(plainPath), 'zstd detection by magic bytes and by extension');
ok(DF.zstdDecompressFrames(zstBuf).toString() === zstText, 'zstdDecompressFrames concatenates EVERY frame and steps over skippable frames (zstdDecompressSync alone stops after the first)');
ok(DF.zstdDecompressFrames(zstBuf.subarray(0, frame1.length + 20)).toString() === zstText.slice(0, 300), 'a truncated trailing frame yields the earlier frames\' text (bounded prefix reads work)');
let big = null; try { DF.zstdDecompressFrames(zstBuf, { maxOutputLength: 100 }); } catch (e) { big = e.code; }
ok(big === 'EZSTBIG', 'exceeding maxOutputLength throws the coded EZSTBIG error (never a giant string)');
const headZ = DF.readHeadText(zstPath, 100000), headP = DF.readHeadText(plainPath, 100000);
ok(headZ === zstText && headP === plainText, 'readHeadText returns plain text for both a .zst and a plain rollout');
ok(DF.readHeadText(zstPath, 200).length <= 200 && DF.readHeadText(zstPath, 200).endsWith('\n'), 'readHeadText caps the PLAIN bytes and drops the cut-off last line');
ok(DF.codexThreadIdOf(zstPath) === TID2 && DF.codexThreadIdOf(plainPath) === TID && DF.CODEX_ROLLOUT_RE.test('rollout-x.jsonl.zst') && !DF.CODEX_ROLLOUT_RE.test('notes.jsonl'), 'thread-id + rollout-name rules accept .jsonl and .jsonl.zst');
const CX = require(path.join(REPO, 'src/adapters/codex.js'));
ok(CX.findCodexSessionJsonlPath(TID2) === zstPath && CX.findCodexSessionJsonlPath(TID) === plainPath, 'findCodexSessionJsonlPath locates a .jsonl.zst rollout (plain wins when both exist)');
const twin = CX.plainJsonlPath(zstPath);
ok(twin !== zstPath && fs.readFileSync(twin, 'utf8') === zstText && CX.plainJsonlPath(plainPath) === plainPath, 'plainJsonlPath materializes a compressed rollout ONCE into the per-user temp cache; plain files return themselves');
ok(CX.plainJsonlPath(zstPath) === twin, '…and reuses the cached twin for the same (mtime,size)');
const meta = CX.extractCodexThreadMeta(zstPath);
ok(meta.threadId === TID2 && meta.cwd === '/work/zst' && meta.name === 'compressed rollout question about zstd', 'extractCodexThreadMeta reads a .zst head (cwd + name via the shared naming rule, injected <recommended_plugins> block skipped)', meta);
  const parsed = CX.parseCodexSessionJsonl(TID2);
  const recs = Array.isArray(parsed) ? parsed : (parsed?.records || parsed?.messages || []);
  ok(recs.length >= 5, `parseCodexSessionJsonl(threadId) reads a .zst rollout through the twin (${recs.length} records)`, Object.keys(parsed || {}).slice(0, 5));

console.log('— ② usage walk counts compressed rollouts (module + shipped scanner, incremental)');
{
  const { runUsageWalk } = require(path.join(REPO, 'src/usage-walker.js'));
  const cursorFile = path.join(home, 'cursor.json');
  const r1 = runUsageWalk({ home, cursorFile });
  const cx = r1.events.map((l) => JSON.parse(l)).filter((e) => e.be === 'codex');
  const zstEvs = cx.filter((e) => e.sid === TID2), plainEvs = cx.filter((e) => e.sid === TID);
  ok(zstEvs.length === 3 && plainEvs.length === 3 && zstEvs[0].model === 'gpt-6-astra' && zstEvs[0].cwd === '/work/zst', `the walker module counts the .zst rollout like the plain one (${zstEvs.length}+${plainEvs.length})`);
  ok(r1.cursors[zstPath]?.zsize === zstBuf.length && r1.cursors[zstPath].offset === Buffer.byteLength(zstText), 'the .zst cursor records compressed size + PLAIN offset');
  fs.writeFileSync(cursorFile, JSON.stringify(r1.cursors));
  const r2 = runUsageWalk({ home, cursorFile });
  ok(r2.events.length === 0, 'a committed cursor makes the compressed rollout incremental (unchanged size ⇒ skipped, no decompress)');
  // append a frame → only the new events
  const extra = rec({ timestamp: '2026-09-05T00:00:09.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 9000, cached_input_tokens: 100, output_tokens: 1 }, total_token_usage: { total_tokens: 99999 } } } });
  fs.appendFileSync(zstPath, zlib.zstdCompressSync(Buffer.from(extra)));
  const r3 = runUsageWalk({ home, cursorFile });
  const e3 = r3.events.map((l) => JSON.parse(l)).filter((e) => e.be === 'codex');
  ok(e3.length === 1 && e3[0].rid === `cx:${TID2}:99999`, 'an appended frame yields exactly the new event (plain-offset cursor over the re-decompressed stream)');
  const scOut = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], { encoding: 'utf8', env: { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex'), VIBESPACE_USAGE_CURSOR: path.join(home, 'sc-cursor.json') }, timeout: 30000 });
  const sc = scOut.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.be === 'codex');
  const mod = runUsageWalk({ home, cursorFile: path.join(home, 'fresh-cursor.json') }).events.map((l) => JSON.parse(l)).filter((e) => e.be === 'codex');
  ok(sc.length === 7 && JSON.stringify(sc) === JSON.stringify(mod), `the shipped scanner emits the SAME codex events as the module incl. the .zst rollout (${sc.length}) — parity holds`);
}

console.log('— ③ discovery interpretation: NC names, CO liveness, .zst ids');
{
  const run = (lines) => DF.interpretDiscoveryLines(lines.join('\n'), { hostId: 'h1', hostName: 'Box', claimJsonls: () => new Map() });
  const rp = `/HOME/.codex/sessions/2026/09/05/rollout-2026-09-05T00-00-00-${TID}.jsonl`;
  const rz = `/HOME/.codex/sessions/2026/09/05/rollout-2026-09-05T00-00-00-${TID2}.jsonl.zst`;
  const inj = JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>\nfoo' }] } });
  const real = JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'please fix the parser bug in lexer.js' }] } });
  const s = run([`C 1700001000 4000 ${rp}`, `HC ${rp}\t"cwd":"/work/plain"`, `NC ${rp}\t${inj}`, `NC ${rp}\t${real}`, `C 1700000900 3000 ${rz}`, `HC ${rz}\t"cwd":"/work/zst"`, `CO ${rz}`]);
  const a = s.find((x) => x.sessionId === TID), b = s.find((x) => x.sessionId === TID2);
  ok(a && a.name === 'please fix the parser bug in lexer.js' && a.status === 'remote-stopped', 'NC lines name the thread through the codex naming rule (the injected <recommended_plugins> record is skipped)', a);
  ok(b && b.backend === 'codex' && b.status === 'remote-running' && b.cwd === '/work/zst' && b.name === null, 'a CO line marks the thread RUNNING on the host (Resume must not double-write); a .zst rollout gets its thread id', b);
  const cut = `NC ${rp}\t` + JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'a long question that gets cut off by the 2000-byte cap somewhere in the middle of the' }] } }).slice(0, 120);
  const s2 = run([`C 1700001000 4000 ${rp}`, cut]);
  ok(s2[0]?.name && /^a long questio/.test(s2[0].name), 'a TRUNCATED NC line still names from the cut "text":"…" fragment', { got: s2[0]?.name, cut });
  const twins = run([`C 1700001000 4000 ${rp}`, `C 1700000000 900 ${rp.replace(/\.jsonl$/, '.jsonl.zst')}`]);
  ok(twins.length === 1 && twins[0].sessionId === TID, 'a .jsonl and its .jsonl.zst twin list ONCE');
  const lines = DF.synthesizeDiscoveryLines({ locks: [], jsonls: [], codexRollouts: [{ path: rz, size: 3000, mtimeMs: 1700000900000, headCwd: '/work/zst', userLines: [real] }], codexOpen: [rz] });
  ok(/^NC /m.test(lines) && /^CO /m.test(lines) && run(lines.split('\n'))[0].status === 'remote-running' && run(lines.split('\n'))[0].name === 'please fix the parser bug in lexer.js', 'the daemon snapshot (userLines + codexOpen) synthesizes NC/CO lines the same interpreter reads (device/ssh parity)');
  ok(DF.nameFromCodexUserLine(inj) === null && DF.nameFromCodexUserLine('{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"nope"}]}}') === null, 'assistant records and injected blocks never name a thread');
}

console.log('— ④ async listing keeps the main thread free (2000 rollouts)');
{
  const CS = require(path.join(REPO, 'src/codex-session-store.js'));
  const bigDir = path.join(home, '.codex', 'sessions', '2026', '09', '06');
  fs.mkdirSync(bigDir, { recursive: true });
  for (let i = 0; i < 2000; i++) {
    const tid = `${(i + 0x10000000).toString(16).padStart(8, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`;
    fs.writeFileSync(path.join(bigDir, `rollout-2026-09-06T00-00-00-${tid}.jsonl`), rollout(tid, `/w/${i}`, `question ${i}`, 1));
  }
  const gaps = []; let last = Date.now(); const ticker = setInterval(() => { const now = Date.now(); gaps.push(now - last); last = now; }, 5);
  const t0 = Date.now();
  const list = await CS.listCodexThreadsAsync({ activeSessions: new Map() });
  const wall = Date.now() - t0;
  clearInterval(ticker);
  const worst = Math.max(...gaps, 0);
  ok(list.length === 2002, `listCodexThreadsAsync lists every thread (${list.length}) in ${wall}ms`);
  ok(worst < 250, `the main thread never stalled while the worker walked the tree (worst tick gap ${worst}ms over ${gaps.length} ticks)`);
  const t1 = Date.now(); await CS.listCodexThreadsAsync({ activeSessions: new Map() }); const wall2 = Date.now() - t1;
  await sleep(2100); // the worker holds its own dir cache; exercise the cache INLINE after the 2s settle window
  CS.collectCodexThreadMetas(); const before = CS.dirCacheStats().hits; CS.collectCodexThreadMetas();
  ok(CS.dirCacheStats().size >= 4 && CS.dirCacheStats().hits > before, `the per-directory mtime cache serves a repeat walk without readdir (${JSON.stringify(CS.dirCacheStats())}; worker listing ${wall2}ms)`);
  const sync = CS.listCodexThreads({ activeSessions: new Map() });
  ok(sync.length === list.length && sync[0].sessionId === list[0].sessionId, 'the sync listing (user-action consumers) returns the same threads');
  const withLive = await CS.listCodexThreadsAsync({ activeSessions: new Map([['w1', { backend: 'codex', backendSessionId: TID, name: 'live one', mode: 'chat', forkedFrom: [TID2] }]]) });
  ok(withLive.find((t) => t.sessionId === TID)?.status === 'live' && !withLive.find((t) => t.sessionId === TID2), 'a live webui session marks its thread live and hides its forkedFrom sources (unchanged merge rules)');
}

console.log('— ⑤ descriptor store contract + wiring pins');
{
  const { HARNESSES, chatHarnessIds } = require(path.join(REPO, 'src/harnesses/index.js'));
  for (const id of chatHarnessIds()) {
    const st = HARNESSES[id].store;
    ok(st && typeof st.locate === 'function' && (typeof st.SessionMessages === 'function' || typeof st.createReader === 'function'), `${id}: store declares locate + a reader`);
  }
  for (const id of ['claude', 'codex']) {
    const st = HARNESSES[id].store;
    ok(typeof st.discover === 'function' && typeof st.forkChain === 'function' && typeof st.writerSweep === 'function' && typeof st.remoteFind === 'function' && typeof st.remoteFind('abc').findExpr === 'string' && typeof st.remoteFind('abc').cacheRel === 'string' && typeof st.remoteFind('abc').root === 'string', `${id}: store declares discover/forkChain/writerSweep/remoteFind`);
  }
  ok(/rollout-\*abc\.jsonl\.zst/.test(HARNESSES.codex.store.remoteFind('abc').findExpr) && HARNESSES.codex.store.forkChain(TID2).length === 0, 'codex remoteFind matches .jsonl and .jsonl.zst; forkChain reads the rollout meta');
  const rs = read('src/routes/sessions.js');
  ok(/for \(const h of listHarnesses\(\)\) \{\s*\n\s*if \(!h\.store \|\| typeof h\.store\.discover !== 'function'\) continue;\s*\n\s*const entries = await h\.store\.discover\(\{ activeSessions, webuiPids, devSnap \}\);/.test(rs) && !/listCodexThreads\(\{ activeSessions \}\)/.test(rs) && !/runningByProjDir/.test(rs), 'routes/sessions discovers through every harness\'s store.discover (the claude sweep moved to session-store, the codex walk to the worker) — no backend ternary');
  ok(/async function discoverClaudeSessions\(\{ activeSessions, webuiPids = new Set\(\), devSnap = null \} = \{\}\)/.test(read('src/session-store.js')), 'session-store owns discoverClaudeSessions (lock-first sweep, verbatim)');
  const ts = read('src/transcript-service.js');
  ok(/function localTranscriptPath\(r\)/.test(ts) && /h\.store\.locate\(r\.sessionId, r\.cwd\)/.test(ts) && /hosts\.fetchTranscript\(r\.host, r\.backend \|\| 'claude', r\.sessionId\)/.test(ts) && !/r\.backend === 'codex' \? findCodexSessionJsonlPath/.test(ts), 'transcript-service locates + fetches through the descriptor store (no codex ternaries)');
  const hs = read('src/hosts.js');
  ok(/async fetchTranscript\(id, backend, sessionId/.test(hs) && /h\.store\.remoteFind\(sessionId\)/.test(hs) && /return this\.fetchTranscript\(id, 'codex', threadId, opts\)/.test(hs) && /return this\.fetchTranscript\(id, 'claude', sessionId, opts\)/.test(hs), 'hosts.fetchTranscript is THE remote fetch; the two legacy methods are shims');
  ok(/-name 'rollout-\*\.jsonl' -o -name 'rollout-\*\.jsonl\.zst'/.test(hs) && /printf 'NC %s\\\\t'/.test(hs) && /echo "CO \$t"/.test(hs) && /zstd -dc -- "\$f"/.test(hs), 'the ssh discovery script lists .zst rollouts, emits NC name lines (zstd(1) for compressed heads) and CO open-rollout lines');
  const ag = read('src/agentd/agentd.js');
  ok(/rollout-\.\*\\\.jsonl\(\?:\\\.zst\)\?\$/.test(ag) && /r\.userLines = head\.split/.test(ag) && /listOpenCodexRolloutPaths\(\{ sessionsDir: croot \}\)/.test(ag) && /codexOpen: snap\.codexOpen \|\| \[\]/.test(ag), 'the daemon snapshot carries .zst rollouts, userLines and codexOpen (one implementation via discovery-facts)');
  const tw = read('src/transcript-worker.js');
  ok(/case 'codexThreadMetas'/.test(tw) && /case 'codexOpenThreads'/.test(tw) && /transcriptWorkerCall\('codexThreadMetas', \{\}, collectCodexThreadMetas\)/.test(read('src/codex-session-store.js')), 'the rollout walk and the /proc scan run as transcript-worker ops with inline fallbacks');
  const uw = read('src/usage-walker.js'), sc = read('data/bin/vibespace-usage-scan');
  ok(/\\\.jsonl\(\\\.zst\)\?\$\/i/.test(uw) && /\\\.jsonl\(\\\.zst\)\?\$\/i/.test(sc) && /cur\.zsize === st\.size/.test(uw) && /cur\.zsize === st\.size/.test(sc) && /function zstdPlain\(buf\)/.test(uw) && /function zstdPlain\(buf\)/.test(sc), 'walker module + shipped scanner carry the SAME zst handling (lockstep)');
  ok(/'test-codex-zst'/.test(read('scripts/ci.mjs')), 'this suite is in the release gate');
}
try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
