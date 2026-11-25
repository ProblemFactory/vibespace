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
  try { SSx = mutantCopies('transcript-door-none', REPO).load(SS_REL, anchored(SS_SRC, '  async rawAsync({ wanted = null, bulk = false } = {}) {', '  async rawAsyncGone({ wanted = null, bulk = false } = {}) {', 'the claude reader has no door'), 'nodoor'); } catch (e) { why = e.message; }
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
// line 782's form on a570e01a8 (lane mask-value-shape, 主开发 r3991): a ONE-LINE function ABOVE the call, closed on its own line (its
// braces balance there), never encloses the call — the scan goes on past it (src/codex-session-store.js _ensureParsed's `fpOf`)
const closedOnItsLine = (l) => { const o = (l.match(/\{/g) || []).length; return o > 0 && o === (l.match(/\}/g) || []).length; };
const fnOf = (L, i) => { for (let j = i; j >= 0; j--) { const m = FN.exec(L[j]); if (m) { const n = m[1] || m[2] || m[3]; if (!KW.has(n) && !(j < i && closedOnItsLine(L[j]))) return n; } } return null; };
const fnOfAsWritten = (L, i) => { for (let j = i; j >= 0; j--) { const m = FN.exec(L[j]); if (m) { const n = m[1] || m[2] || m[3]; if (!KW.has(n)) return n; } } return null; };   // the red control's
const isCode = (l) => !/^\s*(\/\/|\*|\/\*)/.test(l);
const fnOfDefault = fnOf;
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
function census(files, fnOf = fnOfDefault) {   // {rel: text} → { sync, unnamedSync, doorless, sites }
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
// line 782's form on a570e01a8: a caller is named by the function that ENCLOSES it, never by a one-line helper above it
const nestedSrc = { 'src/session-store.js': 'function _ensureParsed() {\n  const fpOf = (id) => { return id; };\n  return parseSessionJsonl(fpOf(\'x\'), \'/w\');\n}\n' };
const nested = census(nestedSrc), nestedRed = census(nestedSrc, fnOfAsWritten);
ok(nested.unnamedSync.length === 0 && nested.sync.join() === 'src/session-store.js|_ensureParsed' && nestedRed.sync.join() === 'src/session-store.js|fpOf' && nestedRed.unnamedSync.length === 1,
  `a caller is named by its ENCLOSING function, never by a one-line helper closed above it (${nested.sync.join()}); RED CONTROL, the finder as first written: ${nestedRed.sync.join()}`, { nested, nestedRed });
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
      return { warmed: [wa, wb], rows: rd.v, opens: rd.n, held: h1.held - h0.held, taken: h1.served - h0.served };
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
  // 主开发 r3562 (2): THE HANDOFF'S BOUND WHEN EVERY WARM ROAD HANDS OVER. The release's three warm roads (the warm, its storage
  // retry, the sliced read when the pool is gone) put through ONE function (putUnlessNewer, its put the cure's _warmPut), so the
  // handoff is ONE map under ONE bound whichever road hands over: seven warms whose tails the cache does not admit leave
  // WARM_HANDOFF_MAX (4) held, the oldest pushed out (counted). RED: a copy without the bound
  const bounded = async (M) => {
    M._warmHandoffTestSeam({ liveMaxBytes: 1 });
    try {
      M.jsonlCacheClear();   // the cache and the handoff both start empty
      const h0 = M.warmHandoffStats();
      for (let n = 20; n < 27; n++) { const X = small(n); await M.warmSessionJsonlAsync(X.id, CWD); }
      const h1 = M.warmHandoffStats();
      return { holding: h1.holding, held: h1.held - h0.held, pushedOut: h1.pushedOut - h0.pushedOut };
    } finally { M._warmHandoffTestSeam({ liveMaxBytes: null }); M.jsonlCacheClear(); }
  };
  const roads = (SS_SRC.match(/\bputUnlessNewer\(claudeSessionId, /g) || []).length;
  const onePut = /const putUnlessNewer = \(id, entry\) => \{[^\n]*\) return false; _warmPut\(id, entry\); return true; \};/.test(SS_SRC);   // line 816's form: it answers whether it put
  const hb = await bounded(SS);
  ok(roads === 3 && onePut && hb.held >= 5 && hb.holding === 4 && hb.pushedOut === hb.held - 4,
    `r3562 (2) — the handoff holds at most 4 whichever warm road hands over: the three roads put through ONE function (${roads} callers of putUnlessNewer, its put _warmPut: ${onePut}); ${hb.held} hand-overs left ${hb.holding} held, ${hb.pushedOut} pushed out`, { roads, onePut, ...hb });
  let SSb = null, whyb = null;
  try { SSb = mutantCopies('transcript-door-no-bound', REPO).load(SS_REL, anchored(SS_SRC, '  while (_warmHandoff.size > WARM_HANDOFF_MAX) {', '  while (false) {', 'the handoff without its bound'), 'nobound'); } catch (e) { whyb = String((e && e.message) || e); }
  const hbx = SSb ? await bounded(SSb) : null;
  ok(!!hbx && hbx.held >= 5 && hbx.holding === hbx.held && hbx.pushedOut === 0, `RED CONTROL (the handoff without its bound): ${hbx ? hbx.held : '?'} hand-overs left ${hbx ? hbx.holding : '?'} held — every one`, hbx || whyb);
  // round wf_32f917e5-722 (its SHOULD, taken): «UNLESS NEWER» ASKS THE HANDOFF TOO — an older read of the same file (the sliced read
  // or the storage retry, which no warm joins) never replaces a newer handed tail. Read on a copy that names the helper and the map
  // (nothing else changed); RED: the release's form, the cache alone asked
  const PUT_TAIL = '\nmodule.exports.__t = { putUnlessNewer, _warmHandoff };\n';
  const putOlder = async (src, tag) => {
    const M = mutantCopies('transcript-door-' + tag, REPO).load(SS_REL, src + PUT_TAIL, tag);
    M._warmHandoffTestSeam({ liveMaxBytes: 1 });
    try {
      M.jsonlCacheClear();
      const A = small(40), B = small(41);
      await M.warmSessionJsonlAsync(A.id, CWD); await M.warmSessionJsonlAsync(B.id, CWD);   // B's tail: not admitted, handed over
      const h = M.__t._warmHandoff.get(B.id), newer = h && h.entry;
      if (!newer) return { handed: false };
      if (newer.lookAt == null) return { handed: true, looked: false };   // line 816's law judges a read by its LOOK's moment: a warm's read carries one
      const older = { ...newer, lookAt: newer.lookAt - 1000 };   // the same file, its look taken BEFORE the handed tail's (a read that waited)
      const answered = M.__t.putUnlessNewer(B.id, older);
      const kept = (M.__t._warmHandoff.get(B.id) || {}).entry;
      return { handed: true, looked: true, answered, keptNewer: kept === newer, tookOlder: kept === older };
    } finally { M._warmHandoffTestSeam({ liveMaxBytes: null }); M.jsonlCacheClear(); }
  };
  const pn = await putOlder(SS_SRC, 'unless-newer');
  ok(pn.handed && pn.looked && pn.answered === false && pn.keptNewer && !pn.tookOlder, `«unless newer» asks the handoff: an older read of a handed file lands — the newer handed tail stays, and the put answers false (not «ready») (${JSON.stringify(pn)})`, pn);
  let pnx = null, whyn = null;
  try { pnx = await putOlder(anchored(SS_SRC, 'const putUnlessNewer = (id, entry) => { if (cachedCopyWins(_jsonlCache.get(id) || _handoffGet(id), entry)) return false;', 'const putUnlessNewer = (id, entry) => { if (cachedCopyWins(_jsonlCache.get(id), entry)) return false;', 'line 816\'s «unless newer»: the cache alone'), 'unless-newer-cache'); } catch (e) { whyn = String((e && e.message) || e); }   // stale-pins: kept (the release's own form, put back by the control)
  ok(!!pnx && pnx.handed && pnx.looked && pnx.answered === true && pnx.tookOlder, `RED CONTROL (line 816's «unless newer», the cache alone asked): the older read replaced the newer handed tail (${JSON.stringify(pnx)})`, pnx || whyn);
  // its other SHOULD, taken: a warm lane's own wait (warm_busy) is the lane's, never the file's — named beside history_busy where the
  // warm's road skips the file's note, and where the reader's cause is said (busy)
  const CX_SRC = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
  ok(CX_SRC.includes("code === 'history_busy' || code === 'warm_busy'))) seen(e, !token);") && CX_SRC.includes("e.code === 'history_busy' || e.code === 'warm_busy' || e.code === 'heap_bound'"),
    'a warm lane\'s own wait (warm_busy) is named beside history_busy: the warm road notes nothing on the FILE for it, and the reader\'s cause says «busy»');
  // ── 主开发 r2195 (round wll8bb3rr): the handed tail serves EVERY reader of its warm; the door carries the bulk word and asks «still
  // wanted» after the warm; handed tails go at their time; a handed tail read from the first byte says so ──
  const ssCopy = (tag, from, to, what) => { try { return { M: mutantCopies(`transcript-door-${tag}`, REPO).load(SS_REL, anchored(SS_SRC, from, to, what), tag) }; } catch (e) { return { why: e.message }; } };
  const notAdmitted = async (M, fn) => { M._warmHandoffTestSeam({ liveMaxBytes: 1 }); try { M.jsonlCacheClear(); return await fn(); } finally { M._warmHandoffTestSeam({ liveMaxBytes: null }); M.jsonlCacheClear(); } };
  const readerOf = (M, id, w) => new M.SessionMessages({ backend: 'claude', claudeSessionId: id, backendSessionId: id, cwd: CWD, buffer: '' }, w, {});
  // F2 (THE MUST): two readers joined on ONE warm the cache does not admit (a view and its live attach; two devices' re-attaches) —
  // ZERO opens of the transcript on this thread for BOTH. RED: the handed tail taken once (the second reader parses on the loop)
  const twoReaders = (M) => notAdmitted(M, async () => {
    const A = small(12), B = small(13);
    await M.warmSessionJsonlAsync(A.id, CWD);   // the live set: A's — B's tail is not admitted
    const r1 = readerOf(M, B.id, 'w-two-1'), r2 = readerOf(M, B.id, 'w-two-2');
    const rd = await opensDuring(async () => { const [x, y] = await Promise.all([r1.rawAsync(), r2.rawAsync()]); return [x ? x.length : -1, y ? y.length : -1]; }, B.fp);
    return { rows: rd.v, opens: rd.n };
  });
  const tr = await twoReaders(SS);
  ok(tr.rows[0] > 0 && tr.rows[1] === tr.rows[0] && tr.opens === 0, `TWO READERS joined on one warm the cache did not admit: both read ${tr.rows.join(' + ')} records with ${tr.opens} open(s) of the transcript on this thread`, tr);
  const once = ssCopy('handoff-once', '    if (held) _handoffStats.served++;', '    if (held) { _warmHandoff.delete(claudeSessionId); _handoffStats.served++; }', 'the handed tail taken once');   // stale-pins: kept — the RED plants the cut before this cure back into a copy
  const trx = once.M ? await twoReaders(once.M) : null;
  ok(!!trx && trx.opens >= 1, `RED CONTROL (the handed tail taken ONCE — the cut before this cure): the second reader opened the transcript ${trx ? trx.opens : '?'} time(s) on this thread — the parse on the loop`, trx || once.why);
  // F3: the first caller LEAVES while the warm runs (its «wanted» turns false): it takes no parse; the second still reads its records
  // with ZERO opens. RED: «still wanted» not asked after the warm (the leaver parses)
  const leaver = (M) => notAdmitted(M, async () => {
    const A = small(14), B = small(15);
    await M.warmSessionJsonlAsync(A.id, CWD);
    const r1 = readerOf(M, B.id, 'w-left'), r2 = readerOf(M, B.id, 'w-stay');
    let open = true;
    const rd = await opensDuring(async () => { const p1 = r1.rawAsync({ wanted: () => open }), p2 = r2.rawAsync(); open = false; const [x, y] = await Promise.all([p1, p2]); return { left: x, leftParsed: !!r1._all, stay: y ? y.length : -1 }; }, B.fp);
    return { ...rd.v, opens: rd.n };
  });
  const lv = await leaver(SS);
  ok(lv.left === null && lv.leftParsed === false && lv.stay > 0 && lv.opens === 0, `a reader whose caller LEFT during the warm takes no parse; the other reader of the same warm reads its ${lv.stay} records with ${lv.opens} open(s) on this thread`, lv);
  const noAfter = ssCopy('no-after-wanted', "    if (typeof wanted === 'function' && !wanted()) return null;\n    this._ensureParsed();", '    this._ensureParsed();', '«still wanted» not asked after the warm');
  const lvx = noAfter.M ? await leaver(noAfter.M) : null;
  ok(!!lvx && lvx.leftParsed === true, `RED CONTROL (the door not asking «still wanted» after the warm): the reader whose caller left parsed all the same (${lvx ? lvx.leftParsed : '?'})`, lvx || noAfter.why);
  // F4 (r2195 (a)): THE DOOR CARRIES THE BULK WORD — a bulk resume's first attach read through the door warms in the BULK line (its own
  // warm never counts as a person's). RED: the door without the word
  const bulkDoor = async (M) => { M.jsonlCacheClear(); const C = small(16), l0 = M.warmLineStats(); await readerOf(M, C.id, 'w-bulk').rawAsync({ bulk: true }); const l1 = M.warmLineStats(); M.jsonlCacheClear(); return { turns: l1.turns - l0.turns, bulk: l1.bulkTurns - l0.bulkTurns }; };
  const bd = await bulkDoor(SS);
  ok(bd.turns === 1 && bd.bulk === 1, `the door's own warm of a bulk resume's first attach waits in the BULK line (${bd.bulk} bulk turn of ${bd.turns})`, bd);
  const noWord = ssCopy('door-no-bulk', '    if (id) { try { await warmSessionJsonlAsync(id, this._session.cwd, bulk === true ? { bulk: true } : null); } catch { } }', '    if (id) { try { await warmSessionJsonlAsync(id, this._session.cwd); } catch { } }', 'the door without the bulk word');   // stale-pins: kept — the RED plants the cut before this cure back into a copy
  const bdx = noWord.M ? await bulkDoor(noWord.M) : null;
  ok(!!bdx && bdx.turns === 1 && bdx.bulk === 0, `RED CONTROL (the door without the bulk word — the cut before this cure): its warm took a PERSON's turn (${bdx ? bdx.bulk : '?'} bulk)`, bdx || noWord.why);
  // F5 (r2195 (b)): A HANDED TAIL GOES AT ITS TIME — the census tick (jsonlCacheTrim, the memory census's minute) drops one nobody came
  // for, counted. RED: no sweep (it stays until newer ones push it out)
  const sweep = (M) => notAdmitted(M, async () => {
    const A = small(17), B = small(18);
    await M.warmSessionJsonlAsync(A.id, CWD); await M.warmSessionJsonlAsync(B.id, CWD);   // B's tail handed, nobody reads it
    const h0 = M.warmHandoffStats(), t = M.jsonlCacheTrim(Date.now() + 121000), h1 = M.warmHandoffStats();
    return { holdingBefore: h0.holding, holdingAfter: h1.holding, expired: h1.expiredAtSweep - h0.expiredAtSweep, said: t && t.handoffsExpired };
  });
  const sw = await sweep(SS);
  ok(sw.holdingBefore === 1 && sw.holdingAfter === 0 && sw.expired === 1 && sw.said === 1, `a handed tail nobody came for goes at the census tick past its time (${sw.holdingBefore} → ${sw.holdingAfter} held, ${sw.expired} counted expired)`, sw);
  const noSweep = ssCopy('no-sweep', '  for (const [hid, h] of [..._warmHandoff]) if (now - h.at > WARM_HANDOFF_MS) {', '  for (const [hid, h] of []) if (now - h.at > WARM_HANDOFF_MS) {', 'no sweep of the handed tails');
  const swx = noSweep.M ? await sweep(noSweep.M) : null;
  ok(!!swx && swx.holdingAfter === 1, `RED CONTROL (no sweep): the handed tail is still held after its time (${swx ? swx.holdingAfter : '?'})`, swx || noSweep.why);
  // F5b (r2257 (3)): A RE-PUT OF THE SAME ENTRY KEEPS ITS FIRST TIME — a conversation warmed again and again is not held past its time:
  // its first put 60 s back (the clock read through Date.now), a second warm now re-puts it; the sweep 61 s later drops it. RED: the
  // re-put resets the time (the tail held on)
  const reput = (M) => notAdmitted(M, async () => {
    const A = small(21), B = small(22), real = Date.now;
    await M.warmSessionJsonlAsync(A.id, CWD);
    Date.now = () => real() - 60000;
    try { await M.warmSessionJsonlAsync(B.id, CWD); } finally { Date.now = real; }   // B's tail handed 60 s back
    await M.warmSessionJsonlAsync(B.id, CWD);   // warmed again now: the SAME entry re-put
    const h0 = M.warmHandoffStats(), t = M.jsonlCacheTrim(real() + 61000), h1 = M.warmHandoffStats();
    return { holdingBefore: h0.holding, holdingAfter: h1.holding, expired: h1.expiredAtSweep - h0.expiredAtSweep, said: t && t.handoffsExpired };
  });
  const rp = await reput(SS);
  ok(rp.holdingBefore === 1 && rp.holdingAfter === 0 && rp.expired === 1, `a handed tail warmed again keeps its FIRST time: the sweep past it drops it (${rp.holdingBefore} → ${rp.holdingAfter} held)`, rp);
  const resetTime = ssCopy('reput-resets', '{ entry, at: same ? prev.at : Date.now() }', '{ entry, at: Date.now() }', 'a re-put that resets the time');   // stale-pins: kept — the RED plants a re-put that resets the time
  const rpx = resetTime.M ? await reput(resetTime.M) : null;
  ok(!!rpx && rpx.holdingAfter === 1, `RED CONTROL (a re-put resets the time): the tail warmed again is still held past its first time (${rpx ? rpx.holdingAfter : '?'})`, rpx || resetTime.why);
  // F6 (r2195 (e)): a reader fed from a handed tail read from the file's FIRST BYTE says so (fromStart). RED: the cache alone asked
  const whole = (M) => notAdmitted(M, async () => {
    const A = small(19), B = small(20);
    await M.warmSessionJsonlAsync(A.id, CWD); await M.warmSessionJsonlAsync(B.id, CWD);
    return { fromStart: readerOf(M, B.id, 'w-whole').fromStart };
  });
  const wh = await whole(SS);
  ok(wh.fromStart === true, `a reader fed from a handed tail read from the first byte says «from the start» (${wh.fromStart})`, wh);
  const cacheOnly = ssCopy('fromstart-cache-only', '(_jsonlCache.get(historySessionId) || _handoffGet(historySessionId))', '_jsonlCache.get(historySessionId)', 'the from-start mark from the cache alone');
  const whx = cacheOnly.M ? await whole(cacheOnly.M) : null;
  ok(!!whx && whx.fromStart === false, `RED CONTROL (the from-start mark read from the cache alone): the whole tail said «not from the start» (${whx ? whx.fromStart : '?'})`, whx || cacheOnly.why);
}
report();
