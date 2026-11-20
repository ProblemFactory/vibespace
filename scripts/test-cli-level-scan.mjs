#!/usr/bin/env node
// test-cli-level-scan.mjs — row B-24e2 (lane login-request-card, 2026-11-20; the shape TAKEN by 主开发 12:22Z): A PAIRED MACHINE READS
// ITS OWN CLAUDE CODE FOR THE BACKGROUND SIGNAL, the hub keeps the verdict BY VERSION. In process, over planted binaries (no real
// vendor file is read by any leg) and the real modules:
//   ① the SHARED scan (src/cli-level-scan.js): a declaration found and its build named; a mention is no declaration; a declaration
//      across a chunk's edge (RED: no overlap); a read the bound cut is «cut», never «does not declare»; THE LOOP IS NEVER HELD — the
//      longest single step (one 8 MiB chunk's search) PRINTED and under 50 ms
//   ② the machine (src/machine-probes.js cliLevel): ONE scan per binary, never waited for; ONE scan at a time; A CUT READ IS
//      REMEMBERED for an hour, read again at once when the binary changes (RED: the cut not remembered — read at every ask)
//   ③ the hub's store (src/server/cli-level-reported.js): only a WHOLE read's verdict is kept, with the machine that said it; ≤ 20
//      versions, the oldest leaving; through the store writer; a restart keeps it; the catalog reads it after its own (RED: own only)
//   ④ the hub's ask: «reading» asked again at 5 / 15 / 45 s then said by name; «cut» ended at once by name with when it is read
//      again; THE LINK DROPS mid-ask: ended, the next facts read after the pause asks again (RED: a dropped ask never ends); an
//      older agent (no level) said once, never waited on
//   ⑤ the facts read is the trigger: a paired conversation above the span asks its machine; while asked its words say so; once
//      read, its background is known
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const LS = require(path.join(REPO, 'src/cli-level-scan.js'));
const MP = require(path.join(REPO, 'src/machine-probes.js'));
const R = require(path.join(REPO, 'src/server/cli-level-reported.js'));
const CMCS = require(path.join(REPO, 'src/server/cli-model-catalog.js'));
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
const CFX = require(path.join(REPO, 'src/server/conversation-facts.js'));
const ROOT = scratchDir('cli-level');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

// a planted build: filler bytes, the build's identity, and what it says of the signal (never a real vendor file)
const IDENT = (v) => `,VERSION:"${v}",PACKAGE_URL:"x",BUILD_TIME:"2026-11-19T10:00:00Z",`;
const DECL = 'u({type:T("system"),subtype:T("background_tasks_changed"),tasks:C(u({task_id:o()';   // as 2.1.322's record union spells it
const SEP = ';';   // a real build's statements are delimited: the identifier before «({type:» starts after it, never inside filler letters
const MENTION = 'if(e.subtype==="background_tasks_changed")log("background_tasks_changed");';
const filler = (n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = 97 + (i * 7919 % 26); return b; };
function plant(name, parts) { const f = path.join(ROOT, name); fs.writeFileSync(f, Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, 'latin1'))))); fs.chmodSync(f, 0o755); return f; }

console.log('① the shared scan');
{
  const A = plant('declares', [filler(300000), IDENT('2.1.399'), filler(500000), SEP, DECL, filler(1000)]);
  const a = await LS.scanLevel(A);
  ok(a.declared === true && a.whole === true && a.version === '2.1.399' && Number.isInteger(a.at), 'a build whose record union DECLARES the signal: declared, read whole, its build named by its own identity', a);
  const B = plant('mentions', [filler(200000), IDENT('2.1.400'), MENTION, filler(200000)]);
  const b = await LS.scanLevel(B);
  ok(b.declared === false && b.whole === true && b.version === '2.1.400', 'a MENTION (a comparison, a log line) is no declaration — and «does not declare» is said only after EVERY byte was read', b);
  const edge = LS.CHUNK - 20;
  const C = plant('edge', [filler(edge - 1), SEP, DECL, filler(1 << 20), IDENT('2.1.401')]);
  const c = await LS.scanLevel(C);
  ok(c.declared === true && c.at === edge, 'a declaration ACROSS the 8 MiB chunk edge is found (the overlap carries its head into the next read)', c);
  const SRC = fs.readFileSync(path.join(REPO, 'src/cli-level-scan.js'), 'utf8');
  const NOV = mutantCopies('level-no-overlap', REPO).load('src/cli-level-scan.js', anchored(SRC, 'const CHUNK = 8 << 20, OVERLAP = 4096;', 'const CHUNK = 8 << 20, OVERLAP = 0;', 'no-overlap'), 'no-overlap');
  const cr = await NOV.scanLevel(C);
  ok(cr.declared === false, '① RED CONTROL: no overlap — the same declaration across the edge is missed', cr);
  const hang = { stat: async () => ({ isFile: () => true, size: 1 << 30 }), read: () => new Promise(() => { }), close: async () => { } };
  const d = await LS.scanLevel('/nowhere', { timeoutMs: 40, open: async () => hang });
  ok(d.error === 'timeout' && d.cut === true && d.declared === undefined, 'a read the bound CUT says «cut» (unknown) — never «does not declare»', d);
  const E = plant('big', [filler(3 * LS.CHUNK), IDENT('2.1.402'), MENTION]);
  const e = await LS.scanLevel(E, { now: () => performance.now() });
  console.log(`    THE LOOP: the longest single step of a ${(e.size / 1048576).toFixed(1)} MiB scan = ${e.maxStepMs.toFixed(2)} ms (one ${LS.CHUNK >> 20} MiB chunk's search); the whole scan ${e.ms.toFixed(1)} ms`);
  ok(e.whole === true && e.maxStepMs < 50, 'THE DEVICE AGENT\'S LOOP IS NEVER HELD: reads are asynchronous, and the longest single step (one chunk\'s search) is under 50 ms — printed above', { maxStepMs: e.maxStepMs });
}

console.log('② the machine: one scan per binary, one at a time, a cut read remembered');
{
  const F = plant('claude-a', [filler(1000), IDENT('2.1.403'), SEP, DECL]);
  let n = 0, release = null;
  const gated = () => { n++; return new Promise((r) => { release = r; }); };
  MP._levelReset();
  const a1 = await MP.cliLevel(F, { scan: gated });
  const a2 = await MP.cliLevel(F, { scan: gated });
  ok(a1.state === 'reading' && a2.state === 'reading' && n === 1, 'the first ask STARTS the scan and is answered «reading» at once (never waited for); a second ask meanwhile starts none', { a1, a2, n });
  const G = plant('claude-b', [filler(1000), IDENT('2.1.404'), SEP, DECL]);
  const g1 = await MP.cliLevel(G, { scan: gated });
  ok(g1.state === 'reading' && n === 1, 'ONE scan at a time: another binary asked meanwhile is «reading», its scan not started', { g1, n });
  release({ declared: true, whole: true, version: '2.1.403', size: 1000, maxStepMs: 1 }); await MP._levelInFlight();
  const a3 = await MP.cliLevel(F, { scan: gated });
  ok(a3.state === 'read' && a3.declared === true && a3.version === '2.1.403' && n === 1, 'once read, the machine answers from its memory: read, declared, its build — no second scan', a3);
  // A CUT READ IS REMEMBERED
  const runCut = async (mod) => {
    mod._levelReset();
    let t = 1_800_000_000_000, k = 0;
    const cut = async () => { k++; return { error: 'timeout', retry: true, cut: true }; };
    const H = plant('claude-cut-' + (mod === MP ? 'a' : 'b'), [filler(500), IDENT('2.1.405')]);
    await mod.cliLevel(H, { scan: cut, now: () => t }); await mod._levelInFlight();
    const c1 = await mod.cliLevel(H, { scan: cut, now: () => t });
    t += 600e3; const c2 = await mod.cliLevel(H, { scan: cut, now: () => t });
    t += 3001e3; const c3 = await mod.cliLevel(H, { scan: cut, now: () => t }); await mod._levelInFlight();
    const before = k;
    fs.appendFileSync(H, 'x'); fs.utimesSync(H, new Date(t / 1000 + 5), new Date(t / 1000 + 5));
    const c4 = await mod.cliLevel(H, { scan: cut, now: () => t }); await mod._levelInFlight();
    return { c1: c1.state, retryIn: c1.retryAt - (t - 3601e3), c2: c2.state, c3: c3.state, k, before, c4: c4.state, after: k };
  };
  const cr = await runCut(MP);
  ok(cr.c1 === 'cut' && cr.retryIn === 3600e3 && cr.c2 === 'cut' && cr.k >= 2 && cr.before === 2,
    'A CUT READ IS REMEMBERED: the machine answers «cut» (when it is read again: an hour) and does NOT scan it again at every ask; past the hour it is read once more', cr);
  ok(cr.c4 === 'reading' && cr.after === cr.before + 1, '…and at once when the binary\'s identity changes (a new build is a new file)', cr);
  const MSRC = fs.readFileSync(path.join(REPO, 'src/machine-probes.js'), 'utf8');
  const FORGET = mutantCopies('level-cut-forgotten', REPO).load('src/machine-probes.js', anchored(MSRC, "  if (m && !(m.state === 'cut' && now() >= m.retryAt)) return { ...m };", "  if (m && m.state !== 'cut') return { ...m };", 'cut-forgotten'), 'cut-forgotten');
  const fr = await runCut(FORGET);
  ok(fr.c2 === 'reading' && fr.k > cr.k, '② RED CONTROL: the cut not remembered — the same binary is scanned again at every ask (a slow disk read for a minute at every facts read)', fr);
  MP._levelReset();
}

console.log('③ the hub keeps a machine\'s verdict by version');
{
  const dir = path.join(ROOT, 'hub'); fs.mkdirSync(dir, { recursive: true });
  const writes = [];
  const writer = { dirty: (f, o) => { writes.push({ f, name: o.name }); fs.writeFileSync(f, o.produce()); } };   // the store writer's contract (dirty → produce)
  let t = 1_800_000_000_000;
  R._reset(); R.boot({ dataDir: dir, writer, clock: { now: () => t } });
  ok(R.note('2.1.410', { declared: true }, { host: 'h-1', name: 'box-a' }) === true && R.levelOf('2.1.410').declared === true && R.levelOf('2.1.410').by.name === 'box-a',
    'a machine\'s DECLARED is kept by version, with the machine that said it', R.levelOf('2.1.410'));
  ok(R.note('2.1.411', { declared: false, whole: false }) === false && R.levelOf('2.1.411') === null && R.note('2.1.411', { declared: false, whole: true }) === true && R.levelOf('2.1.411').declared === false,
    'a «not found» is kept ONLY from a whole read (bytes not all read say nothing)', R.levelOf('2.1.411'));
  ok(writes.length === 2 && writes.every((w) => w.name === 'cli-level-reported.write' && w.f === path.join(dir, R.FILE)), 'each kept verdict is written through the store writer (its own record name)', writes);
  for (let i = 0; i < 25; i++) { t += 1000; R.note(`2.2.${i}`, { declared: true }, { host: 'h-2', name: 'box-b' }); }
  const kept = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, R.FILE), 'utf8')).versions);
  ok(kept.length === R.KEEP && !kept.includes('2.1.410') && kept.includes('2.2.24'), `bounded at ${R.KEEP} versions, the oldest leaving`, kept);
  R._reset(); R.boot({ dataDir: dir, writer });
  ok(R.levelOf('2.2.24') && R.levelOf('2.2.24').declared === true && R.levelOf('2.2.24').by.host === 'h-2', 'a hub restart keeps what the machines reported', R.levelOf('2.2.24'));
  CMCS._reset();
  ok(CMCS.levelSignalOf('2.2.24') === true && CMCS.levelSignalOf('9.9.9') === null, 'the catalog answers a build no binary of its own was read for from a machine\'s verdict (its own read first)', { r: CMCS.levelSignalOf('2.2.24') });
  const CSRC = fs.readFileSync(path.join(REPO, 'src/server/cli-model-catalog.js'), 'utf8');
  const OWN = mutantCopies('level-own-only', REPO).load('src/server/cli-model-catalog.js', anchored(CSRC, "  return r ? r.declared : out;", "  return out;", 'own-only'), 'own-only');
  OWN._reset();
  ok(OWN.levelSignalOf('2.2.24') === null, '③ RED CONTROL: the hub\'s own read only (before B-24e2) — the machine-ahead build stays unknown for good', { r: OWN.levelSignalOf('2.2.24') });
  R._reset();
}

console.log('④ the hub\'s ask: its schedule, a cut, a dropped link, an older agent');
{
  const mkClock = () => { const c = { t: 1_800_000_000_000, timers: [] }; c.clock = { now: () => c.t, setTimeout: (fn, ms) => { const x = { at: c.t + ms, fn }; c.timers.push(x); return x; }, clearTimeout: (x) => { c.timers = c.timers.filter((y) => y !== x); } }; c.advance = async (ms) => { const to = c.t + ms; for (;;) { c.timers.sort((a, b) => a.at - b.at); const x = c.timers[0]; if (!x || x.at > to) break; c.timers.shift(); c.t = x.at; x.fn(); for (let i = 0; i < 12; i++) await null; } c.t = to; for (let i = 0; i < 12; i++) await null; }; return c; };
  const settle = async () => { for (let i = 0; i < 12; i++) await null; };
  const run = async (mod, answers) => {
    const c = mkClock(), logs = [], asks = [];
    mod._reset(); mod.boot({ dataDir: null, log: (l) => logs.push(l), clock: c.clock });
    const ask = async (h) => { asks.push(h); const a = answers.shift(); if (a instanceof Error) throw a; return a === undefined ? { state: 'reading' } : a; };
    mod.want('2.1.420', 'h-9', ask, { nameOf: () => 'box-c' }); await settle();
    return { c, logs, asks, ask };
  };
  const S = await run(R, [{ state: 'reading' }, { state: 'reading' }, { state: 'read', declared: true, whole: true, version: '2.1.420' }]);
  const askingAt0 = R.asking('2.1.420', 'h-9');
  await S.c.advance(5e3); await S.c.advance(15e3);
  ok(askingAt0 && S.asks.length === 3 && !R.asking('2.1.420', 'h-9') && R.levelOf('2.1.420').declared === true && S.logs.some((l) => /«box-c»: its Claude Code 2\.1\.420 DECLARES/.test(l)),
    '«reading» is asked again at 5 and 15 s; the read is kept by version and SAID by name', { asks: S.asks.length, logs: S.logs });
  const L = await run(R, []);
  await L.c.advance(65e3);
  const endLine = L.logs.find((l) => /still being read .* after 65 s/.test(l));
  L.ask && R.want('2.1.420', 'h-9', L.ask); await settle();
  const pausedAsks = L.asks.length;
  ok(L.asks.length === 4 && !!endLine && pausedAsks === 4, '…a machine still reading after 5 + 15 + 45 s: the ask ENDS by name, and is not asked again at once', { asks: L.asks.length, endLine });
  const C2 = await run(R, [{ state: 'cut', at: 1_800_000_000_000, retryAt: 1_800_003_600_000, why: 'timeout' }]);
  ok(C2.asks.length === 1 && !R.asking('2.1.420', 'h-9') && C2.logs.some((l) => /«box-c»: its Claude Code 2\.1\.420 could not be read whole .*read again after 2027-/.test(l)),
    'a CUT read ends the ask AT ONCE by name — the machine\'s name and when it is read again', C2.logs);
  // THE LINK DROPS MID-ASK
  const drop = async (mod) => {
    const D = await run(mod, [new Error('link closed')]);
    const ended = !mod.asking('2.1.420', 'h-9');
    mod.want('2.1.420', 'h-9', D.ask); await settle();
    const inPause = D.asks.length;
    await D.c.advance(10e3);
    mod.want('2.1.420', 'h-9', D.ask); await settle();
    return { ended, inPause, after: D.asks.length, said: D.logs.some((l) => /ended \(link closed\) — asked again at the next facts read/.test(l)) };
  };
  const dr = await drop(R);
  ok(dr.ended && dr.said && dr.inPause === 1 && dr.after === 2, 'THE LINK DROPS MID-ASK: the ask ENDS, said; the next facts read after the pause asks again (none waits on a dead link, none is lost)', dr);
  const RSRC = fs.readFileSync(path.join(REPO, 'src/server/cli-level-reported.js'), 'utf8');
  const STUCK = mutantCopies('level-ask-stuck', REPO).load('src/server/cli-level-reported.js', anchored(RSRC, "      if (st.asks.get(k) === a) end(k, `[cli-level] ${who()}: the ask for", "      if (false) end(k, `[cli-level] ${who()}: the ask for", 'ask-stuck'), 'ask-stuck');
  const sr = await drop(STUCK);
  ok(!sr.ended && sr.after === 1, '④ RED CONTROL: a dropped ask that never ends — the conversation waits on a dead link for good, no later read asks again', sr);
  const O = await run(R, [null]);
  R.want('2.1.420', 'h-9', O.ask); await settle();
  ok(O.asks.length === 1 && !R.asking('2.1.420', 'h-9') && O.logs.filter((l) => /predates the read of its own Claude Code/.test(l)).length === 1,
    'an OLDER device agent (it ignores the flag: no level) is said once, never waited on, not asked again within the hour', O.logs);
  R._reset();
}

console.log('⑤ the facts read is the trigger');
{
  R._reset(); CMCS._reset();
  let answer = { state: 'reading' };
  const asked = [];
  const hosts = { cliLevelOf: async (h) => { asked.push(h); return answer; }, get: () => ({ name: 'box-d' }) };
  const src = CFX.sourcesFrom({ hosts });
  const st = { fromStart: true, cli: '2.1.430', bg: null, tools: [], bgStarted: [], bgAsk: [], wake: null };
  const d1 = src.levelDeclared('2.1.430', 'h-4');
  for (let i = 0; i < 8; i++) await null;   // the ask leaves in the next turn
  const f1 = CF.trackedFacts(st, { keeps: { background: true }, levelDeclared: () => d1 });
  ok(d1 === 'reading' && asked.length === 1 && f1.background === null && /being read on its machine now/.test(f1.backgroundWhy), 'a paired conversation above the span ASKS its machine at the facts read; while asked, its words say it is being read there', { d1, why: f1.backgroundWhy });
  ok(src.levelDeclared('2.1.430', null) === null && asked.length === 1, '…a conversation on THIS hub asks no machine (its own read is the catalog\'s)', { asked });
  answer = { state: 'read', declared: true, whole: true, version: '2.1.430' };
  R._reset(); R.want('2.1.430', 'h-4', hosts.cliLevelOf); for (let i = 0; i < 8; i++) await null;
  const d2 = src.levelDeclared('2.1.430', 'h-4');
  const f2 = CF.trackedFacts(st, { keeps: { background: true }, levelDeclared: () => d2 });
  ok(d2 === true && Array.isArray(f2.background) && f2.background.length === 0, 'once the machine read it: the build declares the signal ⇒ its never-published background is KNOWN empty (the end can be judged)', { d2, f2: f2.background });
  R._reset();
}

report();
