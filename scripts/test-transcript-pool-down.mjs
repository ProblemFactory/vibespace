#!/usr/bin/env node
// test-transcript-pool-down.mjs — FAST (in-process): ROW B-422c (lane hub-loop-stalls, 主开发 r1006 — A for every road). AFTER A
// TRANSCRIPT-POOL FAILURE A READER READS NOTHING ON THE HUB'S LOOP AND SAYS SO BY NAME. The REAL pool made to refuse
// (src/adapters/codex.js transcriptPool().close(): every call answers 503), each road driven over a placed transcript in a
// scratch HOME; the transcript's SYNCHRONOUS reads on the main thread counted (readFileSync, openSync + readSync, statSync,
// lstatSync, readdirSync, existsSync of its path or folder), each road's longest loop turn printed. The six roads (census:
// /var/tmp/vibespace-lanes/hub-loop-stalls/b422c/census.md):
//   ① the gap read (jsonlGapInfoAsync) ② the slab read (readJsonlLineRangeAsync) ③ the turn map (scanJsonlUserTurnsAsync)
//   ④ the Claude history (warmSessionJsonlAsync, then SessionMessages) ⑤ the codex history (CodexSessionMessages.rawAsync)
//   ⑥ the codex thread-metas walk (collectCodexThreadMetasAsync — the 5 s poll's listing)
// THE LAW: after the refusal NO CONTENT READ of the transcript (readSync / readFileSync of the file) on any road, and no WALK of the
// codex sessions folder (readdirSync) by the metas road; the three reads refuse by name (the transcript reader is restarting); the
// two histories answer «not loaded yet» (or their kept copy); the walk answers its kept listing (or «not known»). A stat or an
// existsSync of the file and the codex rollout FINDER's walk run with the pool up too (the finder is row B-a60e's): printed, not
// judged here. RED: the base (c80f44e8b-20261121043050-box: every road read the transcript).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
// the scratch HOME first: the product reads ~/.claude and ~/.codex through os.homedir() — some at module load
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tpd-'));
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch (e) { process.stderr.write(`the scratch ${HOME} could not be removed: ${e.message}\n`); } });
for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(sig, () => process.exit(128 + n));
process.env.HOME = HOME;
process.env.VIBESPACE_SKIP_AGENT_HOOKS = '1';
const NOW = Date.now();

// THE PROBE, armed BEFORE any product module loads (a module that destructures `fs` at load gets the counting functions)
const watched = [];   // path prefixes of the placed transcripts
const fdPath = new Map();
let counting = null;   // {reads: [...]} while a road runs
const under = (p) => { const s = String(p); return watched.some((w) => s === w || s.startsWith(w + path.sep)); };
const note = (name, p) => { if (counting && under(p)) counting.reads.push(`${name} ${path.relative(HOME, String(p))}`); };
for (const name of ['readFileSync', 'statSync', 'lstatSync', 'readdirSync', 'existsSync', 'realpathSync']) {
  const real = fs[name];
  fs[name] = function (p, ...a) { note(name, p); return real.call(this, p, ...a); };
}
{ const real = fs.openSync; fs.openSync = function (p, ...a) { const fd = real.call(this, p, ...a); if (under(p)) fdPath.set(fd, String(p)); else fdPath.delete(fd); return fd; }; }
{ const real = fs.readSync; fs.readSync = function (fd, ...a) { if (fdPath.has(fd)) note('readSync', fdPath.get(fd)); return real.call(this, fd, ...a); }; }
(await import('node:module')).syncBuiltinESMExports();

// THE PLACED TRANSCRIPTS (~3 MB each; the shapes the parsers read)
const cwd = path.join(HOME, 'work', 'project-a');
fs.mkdirSync(cwd, { recursive: true });
const SS0 = require(path.join(REPO, 'src/session-store.js'));
const sid = '11111111-2222-4333-8444-555555555555', tid = '019a0000-1111-7222-8333-444444444444';
const projDir = path.join(HOME, '.claude', 'projects', SS0.cwdToProjectDir(cwd)), claudeFp = path.join(projDir, sid + '.jsonl');
fs.mkdirSync(projDir, { recursive: true });
{
  const lines = [];
  for (let k = 0; k < 6000; k++) {
    const user = k % 2 === 0;
    lines.push(JSON.stringify({ type: user ? 'user' : 'assistant', uuid: `u-${k}`, parentUuid: k ? `u-${k - 1}` : null, sessionId: sid, cwd, timestamp: new Date(NOW - (6000 - k) * 1000).toISOString(),
      message: user ? { role: 'user', content: `a question ${k} ` + 'q'.repeat(300) } : { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: `an answer ${k} ` + 'a'.repeat(300) }] } }));
  }
  fs.writeFileSync(claudeFp, lines.join('\n') + '\n');
}
const codexDir = path.join(HOME, '.codex', 'sessions', '2026', '11', '20'), codexFp = path.join(codexDir, `rollout-2026-11-20T00-00-00-${tid}.jsonl`);
fs.mkdirSync(codexDir, { recursive: true });
{
  const lines = [JSON.stringify({ timestamp: new Date(NOW - 7e6).toISOString(), type: 'session_meta', payload: { id: tid, cwd, originator: 'codex_cli_rs', cli_version: '0.153.0' } })];
  for (let k = 0; k < 6000; k++) {
    const user = k % 2 === 0;
    lines.push(JSON.stringify({ timestamp: new Date(NOW - (6000 - k) * 1000).toISOString(), type: 'response_item', payload: { type: 'message', role: user ? 'user' : 'assistant', content: [{ type: user ? 'input_text' : 'output_text', text: `${user ? 'a question' : 'an answer'} ${k} ` + 'c'.repeat(300) }] } }));
  }
  fs.writeFileSync(codexFp, lines.join('\n') + '\n');
}
watched.push(claudeFp, projDir, path.join(HOME, '.codex'));
console.log(`the placed transcripts: Claude ${fs.statSync(claudeFp).size} bytes, codex ${fs.statSync(codexFp).size} bytes (scratch HOME ${HOME})`);

// THE REAL POOL, made to refuse
const C = require(path.join(REPO, 'src/adapters/codex.js'));
const pool = C.transcriptPool();
ok(!!pool && typeof pool.close === 'function', 'premise: this process has the real transcript pool');
pool.close();
let probe0 = null; try { await pool.call('gapInfo', { fp: claudeFp }); } catch (e) { probe0 = e; }
ok(!!probe0 && probe0.status === 503, `premise: the real pool refuses every call (${probe0 && probe0.message})`);

/** one road: its answer (or its refusal), the transcript's sync reads on the main thread, the longest loop turn */
async function road(name, fn) {
  const r = { name, reads: [], longest: 0 };
  let spin = true, last = performance.now();
  const tick = () => { const t = performance.now(); if (t - last > r.longest) r.longest = t - last; last = t; if (spin) setImmediate(tick); };
  setImmediate(tick);
  counting = r;
  try { r.out = await fn(); } catch (e) { r.err = { code: e && e.code, status: e && e.status, message: String((e && e.message) || e).slice(0, 160) }; }
  finally { counting = null; spin = false; }
  await new Promise((res) => setImmediate(res));
  r.longest = Math.round(r.longest);
  console.log(`  · ${name}: ${r.reads.length} sync read(s) of the transcript on the main thread${r.reads.length ? ` (${[...new Set(r.reads)].slice(0, 4).join(', ')})` : ''}; the longest turn ${r.longest} ms; ${r.err ? `refused: ${r.err.code || r.err.status} «${r.err.message}»` : `answered ${JSON.stringify(r.out === undefined ? null : Array.isArray(r.out) ? `[${r.out.length}]` : r.out && typeof r.out === 'object' ? Object.keys(r.out).slice(0, 6) : r.out).slice(0, 120)}`}`);
  return r;
}
const content = (r) => r.reads.filter((x) => /^(readSync|readFileSync) /.test(x)), walks = (r) => r.reads.filter((x) => /^readdirSync /.test(x));
const byName = (r) => !!(r.err && /restarting|try again|transcript_reader/i.test(`${r.err.code} ${r.err.message}`)) || !!(r.out && typeof r.out === 'object' && /restarting|not loaded/i.test(String(r.out.refused || r.out.notLoaded || '')));

console.log('the six roads, the pool refusing');
const R1 = await road('① the gap read', () => C.jsonlGapInfoAsync(claudeFp));
const R2 = await road('② the slab read', () => C.readJsonlLineRangeAsync(claudeFp, 100, 400));
const R3 = await road('③ the turn map', () => C.scanJsonlUserTurnsAsync(claudeFp, 'claude'));
const R4 = await road('④ the Claude history (the warm, then the reader)', async () => {
  const warmed = await SS0.warmSessionJsonlAsync(sid, cwd);
  const m = new SS0.SessionMessages({ backend: 'claude', claudeSessionId: sid, cwd, buffer: '' }, sid, {});
  m._ensureParsed();
  return { warmed, records: Array.isArray(m._all) ? m._all.length : null, notLoaded: m.notLoaded || null };
});
const CS = require(path.join(REPO, 'src/codex-session-store.js'));
const R5 = await road('⑤ the codex history (rawAsync)', async () => {
  const m = new CS.CodexSessionMessages({ backend: 'codex', backendSessionId: tid, cwd, buffer: '' }, tid, {});
  const all = await m.rawAsync();
  return { records: Array.isArray(all) ? all.length : null, notLoaded: m.notLoaded || null };
});
const R6 = await road('⑥ the codex thread-metas walk', () => CS.collectCodexThreadMetasAsync());

for (const r of [R1, R2, R3]) ok(content(r).length === 0 && byName(r), `${r.name}: reads NOTHING of the transcript on the loop after the pool's refusal and refuses by name (${content(r).length} content reads, the longest turn ${r.longest} ms)`, { reads: r.reads.slice(0, 6), err: r.err, out: r.out });
for (const r of [R4, R5]) ok(content(r).length === 0 && !!(r.out && r.out.notLoaded), `${r.name}: reads NOTHING of the transcript on the loop and answers «not loaded yet» (${content(r).length} content reads, the longest turn ${r.longest} ms)`, { reads: r.reads.slice(0, 6), out: r.out, err: r.err });
ok(walks(R6).length === 0 && content(R6).length === 0, `${R6.name}: walks NOTHING on the loop — the kept listing, or «not known» (${walks(R6).length} folder reads, the longest turn ${R6.longest} ms)`, { reads: R6.reads.slice(0, 6), out: Array.isArray(R6.out) ? R6.out.length : R6.out, err: R6.err });
report();
