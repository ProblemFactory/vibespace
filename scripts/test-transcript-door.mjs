#!/usr/bin/env node
// B-80cb (主开发 r1355) — THE ONE DOOR EVERY TRANSCRIPT READER TAKES (src/attach-read.js readOffLoop). Judged by COUNTS, never a clock:
//   A) the claude reader's door (SessionMessages.rawAsync — the worker's warm of its tail, then its merge): a reader taken through
//      readOffLoop and then read (activePendingPermissions, raw — the re-attach of a conversation whose history is loaded) opens its
//      transcript ZERO times on this thread; RED CONTROL: a copy whose reader has no door — readOffLoop passes it by and the read
//      parses the tail here (it opens the transcript on this thread)
//   D) THE CENSUS (主开发 r1355 D): every product read of a transcript reader goes through the door first (a door between its
//      maker and its first synchronous read); the synchronous parse has exactly its named callers — a new one is red by name
//      (the parse itself stays); RED CONTROLS: a planted read with no door, a planted caller — each named
//   F) THE WARM'S READ IS NEVER THROWN AWAY (B-80cb cure, 主开发 r1524): a tail the cache does not admit (its live set past its bound —
//      a restart's storm of long conversations; the bound set low here) is handed to its reader's parse — the reader reads it with
//      ZERO opens of the transcript on this thread; RED: a copy whose warm drops what the cache did not admit (the road before the cure)
// The stand-ins live on the DISK (fixture-guard TMP_ROOTS[1] — never the memory-backed temp folder) and are removed at every exit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import './scratch.mjs';   // §113 THE ORDER (主开发 r1845): the scratch import first after node's own
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const { TMP_ROOTS } = require(path.join(REPO, 'src/fixture-guard.js'));
const ROOT = fs.mkdtempSync(path.join(TMP_ROOTS[1], 'vs-transcript-door-'));
const gone = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', gone);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { gone(); process.exit(130); });
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;
os.homedir = () => HOME;

// a claude transcript of a few MB (the door's work is the same at any size: the tail parsed in the worker)
const CWD = '/w/door';
const PROJ = path.join(HOME, '.claude', 'projects', CWD.replace(/[^A-Za-z0-9]/g, '-'));
fs.mkdirSync(PROJ, { recursive: true });
const ID = '7d7d7d7d-0000-4000-8000-000000000001';
const FP = path.join(PROJ, `${ID}.jsonl`);
const TEXT = 'x'.repeat(600);
const lines = [];
for (let i = 0; i < 4000; i++) {
  const at = new Date(Date.UTC(2026, 10, 1) + i * 1000).toISOString();
  lines.push(JSON.stringify(i % 2 === 0
    ? { type: 'user', uuid: `u-${i}`, sessionId: ID, cwd: CWD, timestamp: at, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: `ask ${i}` }] } }
    : { type: 'assistant', uuid: `a-${i}`, sessionId: ID, cwd: CWD, timestamp: at, requestId: `req_${i}`, message: { id: `msg_${i}`, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: TEXT }] } }));
}
fs.writeFileSync(FP, lines.join('\n') + '\n');

const { readOffLoop } = require(path.join(REPO, 'src/attach-read.js'));
const SS_REL = 'src/session-store.js', SS_SRC = fs.readFileSync(path.join(REPO, SS_REL), 'utf8');
// the transcript opened on THIS thread (a worker's reads are its own thread's): fs.openSync / readFileSync of the file
const opensDuring = async (fn, fp = FP) => {
  const realOpen = fs.openSync, realRead = fs.readFileSync;
  let n = 0;
  fs.openSync = function (p, ...a) { if (String(p) === fp) n++; return realOpen.call(this, p, ...a); };
  fs.readFileSync = function (p, ...a) { if (String(p) === fp) n++; return realRead.call(this, p, ...a); };
  try { const v = await fn(); return { n, v }; } finally { fs.openSync = realOpen; fs.readFileSync = realRead; }
};
const session = () => ({ backend: 'claude', claudeSessionId: ID, backendSessionId: ID, cwd: CWD, buffer: '' });

console.log('A) the claude reader\'s door: a re-attach reads its transcript off the loop');
{
  const SS = require(path.join(REPO, SS_REL));
  SS.jsonlCacheClear();
  const sm = new SS.SessionMessages(session(), 'w-door', {});
  const r = await opensDuring(async () => { const took = await readOffLoop(sm, { label: 'door' }); const perms = sm.activePendingPermissions(); return { took, rows: sm.raw().length, perms: !!perms }; });
  ok(typeof sm.rawAsync === 'function' && r.v.took === true && r.v.rows > 0 && r.n === 0,
    `a claude reader taken through readOffLoop, then read (activePendingPermissions, raw): ${r.v.rows} records, ${r.n} open(s) of its transcript on this thread`, r);
  let SSx = null, why = null;
  try { SSx = mutantCopies('transcript-door-none', REPO).load(SS_REL, anchored(SS_SRC, '  async rawAsync({ wanted = null } = {}) {', '  async rawAsyncGone({ wanted = null } = {}) {', 'the claude reader has no door'), 'nodoor'); } catch (e) { why = e.message; }
  let x = null;
  if (SSx) {
    SSx.jsonlCacheClear();
    const smx = new SSx.SessionMessages(session(), 'w-door-x', {});
    x = await opensDuring(async () => { const took = await readOffLoop(smx, { label: 'door-x' }); smx.activePendingPermissions(); return { took, rows: smx.raw().length }; });
  }
  ok(!!x && x.v.took === false && x.v.rows > 0 && x.n >= 1, `RED CONTROL (a claude reader with no door — the road before this unit): readOffLoop passes it by, the read opens its transcript ${x ? x.n : '?'} time(s) on this thread`, x || why);
}
console.log('D) the census: every product read of a transcript reader goes through the door; a new caller of the synchronous parse is red by name');
const srcFiles = (() => { const out = []; out.push('server.js');   // the hub's entry file, read (never started)
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) { if (rel !== 'src/public' && rel !== 'src/lib') walk(rel); } else if (e.name.endsWith('.js')) out.push(rel); } }; walk('src'); return out.filter((rel) => fs.existsSync(path.join(REPO, rel))); })();
const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else']);
const FN = /^\s*(?:async\s+)?function\s+(\w+)\s*\(|^\s{2}(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{\s*$|^\s*(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/;
const fnOf = (L, i) => { for (let j = i; j >= 0; j--) { const m = FN.exec(L[j]); if (m) { const n = m[1] || m[2] || m[3]; if (!KW.has(n)) return n; } } return null; };
const isCode = (l) => !/^\s*(\/\/|\*|\/\*)/.test(l);
// a worker thread's file reads where it runs — never the hub's loop
const OFF_LOOP_FILES = new Set(['src/transcript-worker.js', 'src/search-index-worker.js', 'src/sessions-sweep-worker.js', 'src/safe-fs-worker.js']);
const SYNC_PARSE = /\b(parseSessionJsonl|parseCodexSessionJsonl|readJsonlTail|readJsonlBounded)\(/g;
const MAKER = /\b(createSessionMessages|readerFor)\(|\.createReader\(|new (?:\w+\.)?(?:Codex)?SessionMessages\(/g;
const READS = '\\??\\.(?:raw|chatStatus|activePendingPermissions|slice|tail|all|helperResults|taskState|wrapperMeta|search)(?:\\?\\.)?\\(|\\??\\.total\\b|\\??\\.pendingPermissions\\b';
// the synchronous parse's callers (and the raw tail reads under it), each with why it stands — a NEW caller is red by name; the
// parse itself stays: a refusal would turn a rare stall into a failed read (主开发 r1355 D)
const SYNC_CALLERS = {
  'src/session-store.js|_ensureParsed': 'the claude reader\'s own parse — after the door a cache hit (the worker parsed the tail)',
  'src/session-store.js|parseSessionJsonl': 'the claude parse\'s own tail read (an append folded in, or the cold read when the pool is down)',
  'src/session-store.js|warmOnce': 'the warm\'s inline fold of an append (≤ WARM_INLINE_APPEND_MAX) — the bytes the file grew by (the train moved it into warmOnce)',
  'src/codex-session-store.js|_ensureParsed': 'the codex reader\'s sync road — every product read takes the door first; said in the hub\'s log by name',
  'src/codex-session-store.js|parseCodexSessionJsonlAsync': 'the off-loop read\'s fallback when the worker failed (counted and said)',
  'src/adapters/codex.js|parseCodexSessionJsonl': 'the codex parse\'s own bounded tail read',
};
// a reader's MAKERS (the readers they make are judged where they are read); a harness descriptor's `createReader:` is one too
const FACTORIES = { 'src/agentd/agentd.js|getTranscriptService': 'the device agent\'s service', 'src/server/mounts-plugins-wiring.js|createSessionMessages': 'the hub\'s reader factory', 'src/transcript-service.js|readerFor': 'the service\'s own maker' };
function census(files) {   // {rel: text} → { sync, unnamedSync, doorless, sites }
  const sync = [], unnamedSync = [], doorless = [], sites = [];
  for (const [rel, text] of Object.entries(files)) {
    if (OFF_LOOP_FILES.has(rel)) continue;
    const L = text.split('\n');
    L.forEach((l, i) => {
      if (!isCode(l)) return;
      for (const m of l.matchAll(SYNC_PARSE)) {
        if (new RegExp(`function\\s+${m[1]}\\s*\\(`).test(l)) continue;
        const key = `${rel}|${fnOf(L, i)}`;
        sync.push(key);
        if (!SYNC_CALLERS[key]) unnamedSync.push(`${rel}:${i + 1} ${key}`);
      }
      for (const m of l.matchAll(MAKER)) {
        if (/function\s+(createSessionMessages|readerFor)\s*\(/.test(l) || /\bcreateReader\s*:\s*(?:async\s*)?\(/.test(l)) continue;
        if (FACTORIES[`${rel}|${fnOf(L, i)}`]) continue;
        sites.push(`${rel}:${i + 1}`);
        const v = /(?:const|let)\s+(\w+)\s*=/.exec(l) || /(\w+)\s*=\s*createSessionMessages/.exec(l);
        const name = v ? v[1] : null;
        if (!name) { doorless.push(`${rel}:${i + 1} (no reader variable)`); continue; }
        const rd = new RegExp(`\\b${name}(?:${READS})`);
        let j = -1, kind = '';
        const own = rd.exec(l.slice(m.index + m[0].length));
        if (own) { j = i; kind = own[0]; }
        for (let k = i + 1; j < 0 && k < Math.min(L.length, i + 200); k++) { if (!isCode(L[k])) continue; const r = rd.exec(L[k]); if (r) { j = k; kind = r[0]; } }
        // the window: the maker's line to the first read, CODE lines only (a comment naming the door is no door); a task-state read's
        // door may stand just before its maker (its task warm, five code lines)
        const win = L.slice(i, (j >= 0 ? j : i) + 1).filter(isCode).join('\n');
        const before = L.slice(Math.max(0, i - 5), i).filter(isCode).join('\n');
        const door = new RegExp(`readOffLoop\\(${name}\\b|\\b${name}\\.rawAsync\\(`).test(win) || (/taskState/.test(kind) && /taskWarmOf\(/.test(before + '\n' + win));
        if (!door) doorless.push(`${rel}:${i + 1} ${name} → ${kind || 'no read in sight'}`);
      }
    });
  }
  return { sync, unnamedSync, doorless, sites };
}
const files = Object.fromEntries(srcFiles.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]));
const c = census(files);
ok(c.unnamedSync.length === 0 && c.sync.length === 8 && c.doorless.length === 0 && c.sites.length === 8,   // on 2.369.417 the train's code adds one caller of the sync parse (the parse's own inline fold, parseSessionJsonl) and two read sites; every site goes through the door (none doorless)
  `every product read of a transcript reader goes through the door (${c.sites.length} sites: ${c.sites.join(', ')}); the synchronous parse has exactly its named callers (${[...new Set(c.sync)].join(', ')})`, c);
const planted = { ...files,
  'src/transcript-service.js': files['src/transcript-service.js'] + '\nfunction plantedRead(r) { const sm = readerFor(r, null); return sm.chatStatus(); }\n',
  'src/session-store.js': files['src/session-store.js'] + '\nfunction plantedParse() { return parseSessionJsonl(\'x\', \'/w\'); }\n' };
const p = census(planted);
ok(p.doorless.some((d) => d.includes('sm → sm.chatStatus(')) && p.unnamedSync.some((d) => d.includes('plantedParse')),
  `RED CONTROLS (a planted read with no door, a planted caller of the synchronous parse): each named — ${[...p.doorless, ...p.unnamedSync].join(' · ')}`, p);
console.log('F) the warm\'s read is never thrown away (主开发 r1524): a tail the cache does not admit is handed to its reader\'s parse');
{
  const small = (n) => { const id = `7d7d7d7d-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`, fp = path.join(PROJ, `${id}.jsonl`); fs.writeFileSync(fp, lines.map((l) => l.replaceAll(ID, id)).join('\n') + '\n'); return { id, fp }; };
  const handoff = async (M) => {
    M._warmHandoffTestSeam({ liveMaxBytes: 1 });   // the cache's live set: one entry — the second warm's tail is not admitted
    try {
      M.jsonlCacheClear();
      const A = small(10), B = small(11), h0 = M.warmHandoffStats();
      const wa = await M.warmSessionJsonlAsync(A.id, CWD), wb = await M.warmSessionJsonlAsync(B.id, CWD);
      const rd = await opensDuring(async () => new M.SessionMessages({ backend: 'claude', claudeSessionId: B.id, backendSessionId: B.id, cwd: CWD, buffer: '' }, 'w-handoff', {}).raw().length, B.fp);
      const h1 = M.warmHandoffStats();
      return { warmed: [wa, wb], rows: rd.v, opens: rd.n, held: h1.held - h0.held, taken: h1.taken - h0.taken };
    } finally { M._warmHandoffTestSeam({ liveMaxBytes: null }); M.jsonlCacheClear(); }
  };
  const SS = require(path.join(REPO, SS_REL));
  const ho = await handoff(SS);
  ok(ho.warmed[0] === true && ho.warmed[1] === true && ho.rows > 0 && ho.opens === 0 && ho.held === 1 && ho.taken === 1,
    `a warmed tail the cache did not admit: held for its reader (${ho.held}), taken by its parse (${ho.taken}) — ${ho.rows} records, ${ho.opens} open(s) of the transcript on this thread`, ho);
  let SSh = null, whyh = null;
  try { SSh = mutantCopies('transcript-door-no-handoff', REPO).load(SS_REL, anchored(SS_SRC, '  if (_jsonlCache.get(id) === entry) { _warmHandoff.delete(id); return; }\n', '  return;\n', 'the warm drops what the cache did not admit'), 'nohandoff'); } catch (e) { whyh = e.message; }
  const hox = SSh ? await handoff(SSh) : null;
  ok(!!hox && hox.rows > 0 && hox.opens >= 1 && hox.held === 0, `RED CONTROL (the warm drops what the cache did not admit): its reader opened the transcript ${hox ? hox.opens : '?'} time(s) on this thread — the parse on the loop`, hox || whyh);
}
report();
