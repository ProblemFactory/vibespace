/**
 * CodexAdapter — BackendAdapter implementation for Codex CLI.
 *
 * Terminal mode uses interactive `codex` under PTY/dtach.
 * Chat mode uses the dedicated app-server wrapper under dtach.
 */

const { BackendAdapter } = require('./base');
const { QUEUE_VERBS } = require('../backend-caps');   // the closed verb set — the caps row and this constructor read the SAME list
const path = require('path');
const fs = require('fs');
const SP = require('../sent-provenance.js'); // B-9a2e (PURE): a scan's own conversation rows, handed as data
const os = require('os');
const crypto = require('crypto');
const { isMainThread } = require('worker_threads');   // B-a60e: the finder walks only off the hub's thread (a worker's own)
const SOCK = require('../sock-path.js');   // B-3767 unit 2: THE folder verdict (ensureSocketDir) for the zst cache
// S3: the codex naming rule + zstd rollout readers live in discovery-facts
// (the tiny module the daemon bundle and every discovery collector share)
const { deriveCodexSessionName, classifyCodexThread, deriveCodexAgentName, ZSTD_SUPPORTED, isZstPath, isZstBuffer, zstdDecompressFrames, readHeadText, CODEX_ROLLOUT_RE } = require('../discovery-facts');
const { turnPreviewOf } = require('../assistant-note.js'); // PURE (B-40f8): THE preview of a user turn — the huge-session minimap too
const { userRecordOf, applyPeerOrigin } = require('../message-manager.js'); // lane minimap-person-rows r2 (LAW A′): THE message a claude user record makes — the scan never keeps a ladder of its own
const { userItemOf } = require('../codex-message-manager.js'); // …and THE message a codex user item makes
const { capsOf, toolAllowlistArgs } = require('../backend-caps');   // responseStyle enum — the ONE list, never a second copy here; the 「可用工具」 pick's PURE rule

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const CODEX_REMOTE_ROOT = path.join(__dirname, '..', '..', 'data', 'remote-jsonl');   // the remote-jsonl cache (hosts.fetchCodexJsonl)

// ── zstd rollouts (codex ≥0.153 may write rollout-*.jsonl.zst; S3) ──
// The seek family (line index / slab / search / turn scan) needs a SEEKABLE
// plain file, so a compressed rollout is MATERIALIZED once into a per-user
// temp cache keyed by (path, mtime, size) and every reader runs unchanged on
// the plain copy. Detection is by extension OR magic bytes — a remote .zst
// pulled into data/remote-jsonl/<host>/codex/<tid>.jsonl keeps its bytes.
// Bounded: the whole decompression is capped (ZST_MAX_PLAIN) — past that the
// reader fails with a NAMED error instead of a >512MB string.
const ZST_MAX_PLAIN = 256 * 1024 * 1024;
const ZST_CACHE_MAX = 24;
// B-3767 unit 2 (主开发 11:40Z): the cache folder is judged before use — sock-path's ensureSocketDir (made 0700; a folder, not a link,
// this uid's, no group/other bits). A folder another user planted is refused BY NAME with the way out (a coded error, as the
// reader's other refusals are), never written through; a refusal is not kept, so a removed folder is used at the next read
let _zstCacheDir = null;
function zstCacheDir() {
  if (_zstCacheDir) return _zstCacheDir;
  let uid = '';
  try { uid = String(os.userInfo().uid); } catch { uid = 'u'; }
  const dir = path.join(os.tmpdir(), `vibespace-zst-${uid}`);
  const v = SOCK.ensureSocketDir(dir);
  if (!v.ok) throw Object.assign(new Error(`the compressed-transcript cache ${dir} is refused: ${String(v.why).split(' — a socket')[0]} (the way out: start the hub again with TMPDIR set to a private folder — or have the folder's owner remove it (in a shared, sticky temp folder only its owner or root can))`), { code: 'EZSTCACHE' });
  return (_zstCacheDir = dir);
}
function fileIsZst(fp) {
  if (isZstPath(fp)) return true;
  let fd;
  try {
    fd = fs.openSync(fp, 'r');
    const b = Buffer.alloc(4);
    const n = fs.readSync(fd, b, 0, 4, 0);
    return n === 4 && isZstBuffer(b);
  } catch { return false; } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { } } }
}
/** Plain-text twin of a (possibly zstd) transcript path. Plain files return
 *  themselves; zstd files return their materialized copy (decompressed ONCE
 *  per (mtime,size), cache pruned to ZST_CACHE_MAX entries). Throws coded
 *  errors: EZSTUNSUPPORTED (old node), EZSTBIG (over the cap). */
function plainJsonlPath(fp) {
  if (!fp || !fileIsZst(fp)) return fp;
  if (!ZSTD_SUPPORTED) throw Object.assign(new Error(`compressed rollout needs node ≥22.15 (zstd): ${path.basename(fp)}`), { code: 'EZSTUNSUPPORTED' });
  const st = fs.statSync(fp);
  const key = crypto.createHash('sha1').update(fp).digest('hex').slice(0, 16);
  const dir = zstCacheDir();
  const out = path.join(dir, `${key}-${Math.round(st.mtimeMs)}-${st.size}.jsonl`);
  try { if (fs.statSync(out).isFile()) return out; } catch { }
  const plain = zstdDecompressFrames(fs.readFileSync(fp), { maxOutputLength: ZST_MAX_PLAIN });
  const tmp = out + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, plain, { mode: 0o600 });
  fs.renameSync(tmp, out);
  // prune: stale copies of THIS file first, then the oldest overall
  try {
    const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    for (const f of entries) if (f.startsWith(key + '-') && f !== path.basename(out)) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
    if (entries.length > ZST_CACHE_MAX) {
      const aged = entries.map((f) => { try { return { f, at: fs.statSync(path.join(dir, f)).mtimeMs }; } catch { return null; } }).filter(Boolean).sort((a, b) => a.at - b.at);
      for (const e of aged.slice(0, Math.max(0, aged.length - ZST_CACHE_MAX))) { try { fs.unlinkSync(path.join(dir, e.f)); } catch { } }
    }
  } catch { }
  return out;
}

function pushCodexConfigOverride(args, key, value) {
  if (!Array.isArray(args) || !key || value === undefined || value === null || value === '') return;
  args.push('-c', `${key}=${JSON.stringify(String(value))}`);
}

/** THE 「可用工具」 PICK OVER THE MODE (lane new-session-form): `pick` = toolAllowlistArgs' answer for codex — its sandbox
 *  and/or approval replace the mode's own (the rest of the resolved row stands). A DEGRADED row (no codex-linux-sandbox
 *  here) keeps its forced danger-full-access: a sandbox pick there would promise what the machine cannot enforce. */
const PICK_SANDBOX_POLICY = Object.freeze({ 'read-only': 'readOnly', 'workspace-write': 'workspaceWrite', 'danger-full-access': 'dangerFullAccess' });
function withCodexToolPick(resolved, pick) {
  if (!pick || !pick.dirty) return resolved;
  const out = { ...resolved };
  if (pick.approval) out.approvalPolicy = pick.approval;
  if (pick.sandbox && !resolved.degraded) { out.sandbox = pick.sandbox; out.sandboxPolicy = { type: PICK_SANDBOX_POLICY[pick.sandbox] }; }
  out.toolPick = { ...(pick.approval ? { approval: pick.approval } : {}), ...(pick.sandbox && !resolved.degraded ? { sandbox: pick.sandbox } : {}) };
  return out;
}

function resolveCodexPermissionMode(mode = 'default', { sandboxSupported = true } = {}) {
  if (!sandboxSupported && mode !== 'yolo') {
    return {
      permissionMode: mode === 'read-only' ? 'default' : mode,
      requestedPermissionMode: mode,
      approvalPolicy: mode === 'safe-yolo' ? 'on-failure' : 'on-request',
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
      degraded: true,
      degradedReason: 'codex-linux-sandbox executable not found',
    };
  }

  switch (mode) {
    case 'read-only':
      return {
        permissionMode: 'read-only',
        approvalPolicy: 'never',
        sandbox: 'read-only',
        sandboxPolicy: { type: 'readOnly' },
      };
    case 'safe-yolo':
      return {
        permissionMode: 'safe-yolo',
        approvalPolicy: 'on-failure',
        sandbox: 'workspace-write',
        sandboxPolicy: { type: 'workspaceWrite' },
      };
    case 'yolo':
      return {
        permissionMode: 'yolo',
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        sandboxPolicy: { type: 'dangerFullAccess' },
      };
    default:
      return {
        permissionMode: 'default',
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        sandboxPolicy: { type: 'workspaceWrite' },
      };
  }
}

function _walkJsonlFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fp = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fp);
      } else if (entry.isFile() && (fp.endsWith('.jsonl') || fp.endsWith('.jsonl.zst'))) {
        files.push(fp);
      }
    }
  }
  return files;
}

// THE LAST TURN'S MODEL AND EFFORT (owner report 2.369.32; B-21e4 item 4): the last turn_context's {model, effort} carried by a resume
// that names neither — read ONLY off the loop (lastCodexTurnContextAsync below). B-80cb: the synchronous pair (lastCodexTurnModel /
// lastCodexTurnEffort — a 32 MB string split on the loop, 115–136 ms each measured on stand-ins) had no product caller since
// resume-all-paced L2 and is gone.

/** RESUME CONTINUITY OFF THE LOOP (lane resume-all-paced, L2 — measured on a 120 MB rollout: `_lastTurnContextField` builds a 32 MB
 *  string and splits it, ~30 ms of the hub's loop, and a resume asks it TWICE — model, then effort): the last `turn_context`'s
 *  {model, effort} read BACKWARD from the end in 256 KB chunks through fs.promises, each field the LAST record that states it (nulls
 *  skipped — the sync rule), over the SAME window (the file whole up to head+tail, else the last 32 MB with its cut-off first line
 *  dropped). One read serves both knobs (memoized by size + mtime). → {model, effort} (null fields: none stated) | null (no rollout) */
const _turnCtxMemo = new Map();
const TURN_CTX_CHUNK = 256 * 1024;
async function lastCodexTurnContextAsync(threadId, { fsp = fs.promises } = {}) {
  const found = await findCodexSessionJsonlPathAsync(threadId);   // B-a60e remainder: awaited in the rollout index (a resume's road)
  if (!found) return null;
  let fp; try { fp = plainJsonlPath(found); } catch { return null; }
  let fh = null;
  try {
    const st = await fsp.stat(fp);
    const memo = _turnCtxMemo.get(fp);
    if (memo && memo.size === st.size && memo.mtimeMs === st.mtimeMs) return { model: memo.model, effort: memo.effort };
    const lower = st.size <= JSONL_HEAD_BYTES + JSONL_TAIL_BYTES ? 0 : st.size - JSONL_TAIL_BYTES;
    const out = { size: st.size, mtimeMs: st.mtimeMs, model: null, effort: null };
    fh = await fsp.open(fp, 'r');
    let end = st.size, carry = Buffer.alloc(0);
    while (end > lower && !(out.model && out.effort)) {
      const start = Math.max(lower, end - TURN_CTX_CHUNK);
      const buf = Buffer.alloc(end - start);
      const { bytesRead } = await fh.read(buf, 0, buf.length, start);
      const data = Buffer.concat([buf.subarray(0, bytesRead), carry]);
      let head = 0;
      if (start > lower) {   // the bytes before the chunk's first newline belong to a line that starts in an earlier chunk
        const f = data.indexOf(10);
        if (f < 0) { carry = data; end = start; continue; }
        carry = data.subarray(0, f); head = f + 1;
      } else {
        carry = Buffer.alloc(0);
        if (lower > 0) { const f = data.indexOf(10); head = f < 0 ? data.length : f + 1; }   // the window's cut-off first line (readJsonlBounded drops it)
      }
      const lines = data.toString('utf-8', head).split('\n');
      for (let i = lines.length - 1; i >= 0 && !(out.model && out.effort); i--) {
        const l = lines[i];
        if (l.indexOf('"turn_context"') < 0) continue;
        try {
          const r = JSON.parse(l);
          if (r.type !== 'turn_context') continue;
          if (!out.model && r.payload?.model) out.model = String(r.payload.model);
          if (!out.effort && r.payload?.effort) out.effort = String(r.payload.effort);
        } catch { }
      }
      end = start;
    }
    _turnCtxMemo.set(fp, out);
    if (_turnCtxMemo.size > 256) _turnCtxMemo.delete(_turnCtxMemo.keys().next().value);
    return { model: out.model, effort: out.effort };
  } catch { return null; } finally { if (fh) { try { await fh.close(); } catch { } } }
}

/** lane roster-per-pass: every rollout `findCodexSessionJsonlPath(id)` would find, read ONCE for a liveness sweep — the
 *  same walk as `_walkJsonlFiles` (the sessions tree, directories followed, `.jsonl` / `.jsonl.zst` files) plus the remote
 *  cache's codex directories (data/remote-jsonl/<host>/codex/: exact names, as its existsSync asks), through fs.promises, one directory at a time. Keyed by the
 *  last 36 characters of each rollout's name (a thread id is a UUID: `…-<id>.jsonl` ⇔ the key), with today's `endsWith`
 *  over the walked names for an id of another length. A directory that fails (EACCES, EMFILE, one that vanished mid-walk)
 *  or a walk past `boundMs` leaves it UNKNOWN (`ok: false`). A missing sessions directory or cache is not a failure.
 *  B-a60e remainder: it is also THE ROLLOUT INDEX's walk (below) — `pathOf(id)` answers the finder's own rule over the names
 *  the walk READ (a plain rollout first in the walk's order, else its .jsonl.zst, else the remote cache's exact name, a host
 *  at a time in listing order, .jsonl before .jsonl.zst), and `onDone(index)` is called ONCE when the walk ends — after the
 *  bound too (a late walk's names serve the next ask; what this call handed out never changes).
 *  → { ok, has(id) → boolean, pathOf(id) → path|null, dirs, entries, rollouts } */
async function codexTranscriptIndex({ boundMs = 10000, fsp = fs.promises, sessionsDir = CODEX_SESSIONS_DIR, remoteRoot = CODEX_REMOTE_ROOT, onDone = null } = {}) {
  const keys = new Set(), stems = [], fps = [], cached = new Set();
  const firstOf = new Map(), hostsSeen = [];   // key → { plain, zst } (the first of each in the walk's order) · [{ dir, names }] in listing order
  const st = { ok: true, dirs: 0, entries: 0, rollouts: 0 };   // ok: no listing failed
  let late = false;   // past the bound
  const listOf = async (dir, { quiet = [] } = {}) => {
    try { st.dirs++; const ents = await fsp.readdir(dir, { withFileTypes: true }); st.entries += ents.length; return ents; }
    catch (e) { if (e && quiet.includes(e.code)) return []; st.ok = false; return []; }
  };
  const note = (name, dir) => {
    const plain = name.endsWith('.jsonl'), stem = plain ? name.slice(0, -6) : name.endsWith('.jsonl.zst') ? name.slice(0, -10) : null;
    if (stem == null) return;
    st.rollouts++; const k = stem.slice(-36), fp = path.join(dir, name); keys.add(k); stems.push(stem); fps.push(fp);
    const f = firstOf.get(k) || {}; if (plain ? !f.plain : !f.zst) { f[plain ? 'plain' : 'zst'] = fp; firstOf.set(k, f); }
  };
  const has = (id) => {
    const k = String(id || ''); if (!k) return false;   // a name the walk READ is a fact even when it failed later
    if (k.length === 36 ? keys.has(k) : stems.some((x) => x.endsWith(k))) return true;
    return cached.has(k + '.jsonl') || cached.has(k + '.jsonl.zst');
  };
  const pathOf = (id) => {
    const k = String(id || ''); if (!k) return null;
    if (k.length === 36) { const f = firstOf.get(k); if (f) return f.plain || f.zst; }
    else { let zst = null; for (let i = 0; i < stems.length; i++) if (stems[i].endsWith(k)) { if (fps[i].endsWith('.jsonl')) return fps[i]; if (!zst) zst = fps[i]; } if (zst) return zst; }
    for (const h of hostsSeen) for (const ext of ['.jsonl', '.jsonl.zst']) if (h.names.has(k + ext)) return path.join(h.dir, k + ext);
    return null;
  };
  const key = sessionsDir + '\0' + remoteRoot;
  if (CODEX_WALKS_OUT.has(key)) { require('../session-store.js').stuckSaid(CODEX_WALKS_OUT, key, 'codex', sessionsDir); return { ...st, ok: false, late: true, has: () => false, pathOf: () => null }; }   // a stuck walk is not doubled, said once
  const walk = (async () => {
    const stack = [{ dir: sessionsDir, top: true }];
    while (stack.length) {
      const { dir, top } = stack.pop();
      for (const e of await listOf(dir, { quiet: top ? ['ENOENT'] : [] })) {
        if (e.isDirectory()) stack.push({ dir: path.join(dir, e.name), top: false });
        else if (e.isFile()) note(e.name, dir);
      }
      if (!st.ok || (late && !onDone)) return;   // a listing failed; or past the bound for a one-off read (the index's walk goes on to its end)
    }
    // the cache: findCodexSessionJsonlPath asks existsSync(<host>/codex/<id>.jsonl | .jsonl.zst) — an exact name, of any
    // kind, a link followed (a dangling one finds nothing); a host without a codex directory has none
    for (const h of await listOf(remoteRoot, { quiet: ['ENOENT'] })) {
      const d = path.join(remoteRoot, h.name, 'codex'), names = new Set();
      for (const e of await listOf(d, { quiet: ['ENOENT', 'ENOTDIR'] })) {
        if (!e.name.endsWith('.jsonl') && !e.name.endsWith('.jsonl.zst')) continue;
        if (e.isSymbolicLink()) { try { await fsp.stat(path.join(d, e.name)); } catch { continue; } }
        cached.add(e.name); names.add(e.name);
      }
      if (names.size) hostsSeen.push({ dir: d, names });
      if (!st.ok || (late && !onDone)) return;
    }
  })();
  CODEX_WALKS_OUT.set(key, { since: Date.now(), said: false });
  walk.then(() => {}, () => { st.ok = false; }).finally(() => {
    CODEX_WALKS_OUT.delete(key);
    if (typeof onDone === 'function') { try { onDone({ ok: st.ok, dirs: st.dirs, entries: st.entries, rollouts: st.rollouts, has, pathOf }); } catch { } }
  });
  let timer = null;
  const bound = new Promise((r) => { timer = setTimeout(() => { late = true; r(); }, boundMs); });
  try { await Promise.race([walk.catch(() => { st.ok = false; }), bound]); } finally { clearTimeout(timer); }
  const ok = st.ok && !late;   // a late walk that finishes after the bound changes nothing handed out
  return { ok, dirs: st.dirs, entries: st.entries, rollouts: st.rollouts, has, pathOf };
}
const CODEX_WALKS_OUT = new Map();   // roots → {since, said}

/** B-a60e: a thread's LOCAL rollout path, KEPT. A local codex conversation's status() (chatStatus → _ensureParsed →
 *  parseCodexSessionJsonl → here) walked the whole ~/.codex/sessions tree with readdirSync on the hub's main loop at EVERY
 *  call. The path found is kept per thread id and asked again by an existsSync (two for a .jsonl.zst): gone (codex
 *  compressed it to .jsonl.zst, archived or deleted it) ⇒ dropped and looked up again; a kept .jsonl.zst whose plain twin is
 *  there ⇒ the plain wins. The walk took a plain file from ANY folder before a .zst (its read, S1): a kept .jsonl.zst a
 *  minute old is decided again — on the hub's thread by the first rollout-index walk BEGUN after that minute (asked, never
 *  waited for: the .zst answers meanwhile), on a worker's thread by a walk there as before — so a plain rollout of the
 *  thread made elsewhere wins. Only a LOCAL hit is kept: a remote-cache hit or «none» is looked up again at the next call
 *  (a local rollout must win the moment it appears). Bounded: the oldest kept path goes first. */
const CODEX_PATH_KEPT = new Map();   // threadId → { fp, at }
const CODEX_PATH_KEPT_MAX = 4096;
const CODEX_ZST_KEPT_MS = 60_000;
function keptCodexPath(threadId, { walking = false } = {}) {
  const k = CODEX_PATH_KEPT.get(threadId);
  if (!k) return null;
  if (k.fp.endsWith('.jsonl.zst')) {
    const plain = k.fp.slice(0, -'.zst'.length);
    if (fs.existsSync(plain)) { CODEX_PATH_KEPT.set(threadId, { fp: plain, at: Date.now() }); return plain; }
    if (Date.now() - k.at > CODEX_ZST_KEPT_MS) {   // a minute old: decided again
      if (walking) { CODEX_PATH_KEPT.delete(threadId); return null; }   // a worker's thread: walked again there
      const last = ROLLOUT_INDEX.last;
      if (last && last.startedAt > k.at + CODEX_ZST_KEPT_MS) {   // a walk begun after the minute: its answer decides
        const fp = last.pathOf(threadId);
        if (fp && fp !== k.fp && !isRemoteCachePath(fp) && fs.existsSync(fp)) return keepCodexPath(threadId, fp);
        CODEX_PATH_KEPT.set(threadId, { fp: k.fp, at: Date.now() });   // the .zst still the answer: kept another minute
      } else requestRolloutWalk();   // asked, never waited for here: the kept .zst answers meanwhile
    }
  }
  if (fs.existsSync(k.fp)) return k.fp;
  CODEX_PATH_KEPT.delete(threadId);
  return null;
}
function keepCodexPath(threadId, fp) {
  CODEX_PATH_KEPT.delete(threadId); CODEX_PATH_KEPT.set(threadId, { fp, at: Date.now() });
  if (CODEX_PATH_KEPT.size > CODEX_PATH_KEPT_MAX) CODEX_PATH_KEPT.delete(CODEX_PATH_KEPT.keys().next().value);
  return fp;
}

// ── THE ROLLOUT INDEX (B-a60e remainder: 主开发 r1430 / r1433, from the shape of lane bl-loop-a's note) ──
// The finder never walks the sessions tree on the hub's thread, nor on the device agent's: there is ONE index of every
// rollout, built by ONE asynchronous walk (codexTranscriptIndex: fs.promises, a directory at a time). Every asker of the
// moment shares that walk. It walks THIS machine's codex home: the hub's, or a paired machine's agent over its own (the
// machine is the walk's root). An answer is one of three:
//   · a PATH;
//   · «none» — only from a whole walk BEGUN after the thread was first missed, for a minute;
//   · «NOT KNOWN YET» — a walk is running, has failed, is past its bound, or its «none» is a minute old (one walk is asked).
// A synchronous asker takes «not known yet» as it is and asks again later (it corrects itself with no press). An
// asynchronous one awaits the walk (bounded: CODEX_ASK_BOUND_MS), then answers «not known yet». A late find is never «none».
const CODEX_NONE_FRESH_MS = 60_000;   // a «none» stands a minute after the walk that found it began (the kept .zst's minute)
const CODEX_ASK_BOUND_MS = 10_000;    // what an asynchronous asker waits for a walk (the liveness index's own bound)
const CODEX_WALK_RETRY_MS = 5_000;    // a walk that failed is not asked again sooner (a folder it cannot list stays unlistable a while)
const CODEX_MISSES_MAX = 4096;        // the threads missed, each with the time it was first missed (the oldest goes first)
const ROLLOUT_INDEX = { last: null, running: null, walks: 0, ended: 0, asks: 0, missAt: new Map() };   // ended = the walks that have ENDED (a reader's re-read epoch)
function isRemoteCachePath(fp) { return String(fp || '').startsWith(CODEX_REMOTE_ROOT + path.sep); }
/** One walk in flight, shared: the running one, else a new one (null = a failed walk ended less than CODEX_WALK_RETRY_MS ago).
 *  → a promise of the index the walk leaves (a failed or stuck walk: the one before it, or null) */
function requestRolloutWalk() {
  if (ROLLOUT_INDEX.running) return ROLLOUT_INDEX.running;
  const last = ROLLOUT_INDEX.last;
  if (last && !last.ok && Date.now() - last.endedAt < CODEX_WALK_RETRY_MS) return null;
  const startedAt = Date.now();
  let settle = null; const p = new Promise((r) => { settle = r; });
  ROLLOUT_INDEX.running = p; ROLLOUT_INDEX.walks++;
  let ended = false;
  const end = (idx) => {
    if (ended) return; ended = true; ROLLOUT_INDEX.ended++;
    if (ROLLOUT_INDEX.running === p) ROLLOUT_INDEX.running = null;
    if (idx) ROLLOUT_INDEX.last = { ...idx, startedAt, endedAt: Date.now() };
    settle(ROLLOUT_INDEX.last);
  };
  codexTranscriptIndex({ boundMs: CODEX_ASK_BOUND_MS, onDone: end }).then((r) => { if (r && r.late) end(null); }, () => end(null));   // late: another asker's walk is stuck out — nothing of ours ran
  return p;
}
/** A thread's rollout, never walked on this thread: → { fp, known } (fp null + known = «none»; known false = «not known yet») */
function codexRolloutLookup(threadId) {
  if (!threadId) return { fp: null, known: true };
  if (!isMainThread) return { fp: findCodexSessionJsonlPathWalking(threadId), known: true };   // a worker's own thread: walked there, as before
  ROLLOUT_INDEX.asks++;
  const kept = keptCodexPath(threadId);
  if (kept) return { fp: kept, known: true };
  const last = ROLLOUT_INDEX.last, now = Date.now();
  if (last) {
    const fp = last.pathOf(threadId);   // a name a walk READ is a fact, even from a walk that failed later
    if (fp && fs.existsSync(fp)) { ROLLOUT_INDEX.missAt.delete(threadId); return { fp: isRemoteCachePath(fp) ? fp : keepCodexPath(threadId, fp), known: true }; }
  }
  let missAt = ROLLOUT_INDEX.missAt.get(threadId);
  if (missAt === undefined) {
    missAt = now; ROLLOUT_INDEX.missAt.set(threadId, now);
    if (ROLLOUT_INDEX.missAt.size > CODEX_MISSES_MAX) ROLLOUT_INDEX.missAt.delete(ROLLOUT_INDEX.missAt.keys().next().value);
  }
  if (last && last.ok && last.startedAt >= missAt) {
    if (now - last.startedAt < CODEX_NONE_FRESH_MS) return { fp: null, known: true };
    ROLLOUT_INDEX.missAt.set(threadId, now);   // that «none» is a minute old: a walk begun from now decides again
  }
  requestRolloutWalk();
  return { fp: null, known: false };
}
/** The same, awaiting the walk it asks: at most two walks (a running one begun before the miss, then one after) inside
 *  `boundMs`; past them → «not known yet» (the walk goes on: the next ask reads what it left). */
async function codexRolloutLookupAsync(threadId, { boundMs = CODEX_ASK_BOUND_MS } = {}) {
  let r = codexRolloutLookup(threadId);
  const until = Date.now() + boundMs;
  for (let walks = 0; !r.known && walks < 2; walks++) {
    const p = ROLLOUT_INDEX.running || requestRolloutWalk();
    const left = until - Date.now();
    if (!p || left <= 0) break;
    let timer = null;
    const late = await Promise.race([p.then(() => false), new Promise((res) => { timer = setTimeout(() => res(true), left); })]);
    clearTimeout(timer);
    r = codexRolloutLookup(threadId);
    if (late) break;
  }
  return r;
}
/** The boot's warm (before the restore's first codex read) and a test's wait: the running walk, or a new one. */
function warmCodexRolloutIndex() { return ROLLOUT_INDEX.running || requestRolloutWalk() || Promise.resolve(ROLLOUT_INDEX.last); }
/** The index's epoch: how many walks have ended. A reader that read «not known yet» reads again only once it has moved (a
 *  synchronous road asked in a loop does no work and asks no walk between two walks). */
function rolloutIndexEpoch() { return ROLLOUT_INDEX.ended; }
/** A walk begun NOW (after any running one ends): what a store's writer, or a leg that has just written rollouts, awaits so the
 *  index has seen them. → the index it left */
async function refreshCodexRolloutIndex() { if (ROLLOUT_INDEX.running) await ROLLOUT_INDEX.running; return (await (requestRolloutWalk() || Promise.resolve(ROLLOUT_INDEX.last))); }
/** What the index has done (a leg reads it): its walks, the last walk's facts, whether one runs. */
function rolloutIndexStats() { const l = ROLLOUT_INDEX.last; return { walks: ROLLOUT_INDEX.walks, asks: ROLLOUT_INDEX.asks, running: !!ROLLOUT_INDEX.running, missed: ROLLOUT_INDEX.missAt.size, kept: CODEX_PATH_KEPT.size, last: l ? { ok: l.ok, rollouts: l.rollouts, dirs: l.dirs, startedAt: l.startedAt, endedAt: l.endedAt } : null }; }
function _resetRolloutIndexForTests() { ROLLOUT_INDEX.last = null; ROLLOUT_INDEX.running = null; ROLLOUT_INDEX.walks = 0; ROLLOUT_INDEX.ended++; ROLLOUT_INDEX.missAt.clear(); CODEX_PATH_KEPT.clear(); }

/** Locate a thread's rollout: `…-<threadId>.jsonl`, else its `.jsonl.zst`
 *  twin (codex ≥0.153 compression; the plain file wins when both exist), then
 *  the remote-jsonl cache. Returns the REAL path — readers materialize. A local hit is kept (B-a60e, above).
 *  B-a60e remainder: on the hub's thread (and the device agent's) it NEVER walks — the rollout index answers, and null is
 *  «none» or «not known yet» (codexRolloutLookup says which; an asynchronous caller awaits codexRolloutLookupAsync). A
 *  worker's thread (the transcript worker, the search index) walks synchronously as before: its own thread, off the loop. */
function findCodexSessionJsonlPath(threadId) {
  return threadId ? codexRolloutLookup(threadId).fp : null;
}
/** → the path (null = «none» or «not known yet» after the bounded wait) */
async function findCodexSessionJsonlPathAsync(threadId, opts) { return (await codexRolloutLookupAsync(threadId, opts)).fp; }
function findCodexSessionJsonlPathWalking(threadId) {
  const kept = keptCodexPath(threadId, { walking: true });
  if (kept) return kept;
  let zst = null;
  for (const fp of _walkJsonlFiles(CODEX_SESSIONS_DIR)) {
    if (fp.endsWith(`${threadId}.jsonl`)) return keepCodexPath(threadId, fp);
    if (!zst && fp.endsWith(`${threadId}.jsonl.zst`)) zst = fp;
  }
  if (zst) return keepCodexPath(threadId, zst);
  // Remote-cache scan (B-10ed, mirrors session-store's claude cache scan):
  // hosts.fetchCodexJsonl pulls a host's rollout into
  // data/remote-jsonl/<hostId>/codex/<threadId>.jsonl — finding it here makes
  // every codex history consumer remote-capable for free.
  try {
    for (const hostDir of fs.readdirSync(CODEX_REMOTE_ROOT)) {
      for (const ext of ['.jsonl', '.jsonl.zst']) {
        const p = path.join(CODEX_REMOTE_ROOT, hostDir, 'codex', `${threadId}${ext}`);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { }
  return null;
}

// Bounded JSONL read: head (session_meta, early turn_context) + tail (recent
// conversation), line-aligned. Two reasons full reads are wrong for huge
// rollouts: (1) Node cannot create a string > ~512MB — readFileSync('utf-8')
// THROWS on a 541MB file and the swallowed error left attach with an empty
// history (blank chat window); (2) even below the limit, parsing hundreds of
// MB of JSON synchronously blocks the event loop for the whole server.
const JSONL_HEAD_BYTES = 2 * 1024 * 1024;
const JSONL_TAIL_BYTES = 32 * 1024 * 1024;
function readJsonlBounded(fp, opts = {}) {
  fp = plainJsonlPath(fp); // zstd rollouts read through their materialized twin (S3)
  const stat = fs.statSync(fp);
  // `whole` (lane lg-recovery, 主开发 r2374 — only the transcript worker's ops pass it, for the sub-agent viewer): the file ENTIRE,
  // never the head + tail bound below (the viewer showed every line of a finished agent; the bound is the histories')
  if (opts.whole || stat.size <= JSONL_HEAD_BYTES + JSONL_TAIL_BYTES) return fs.readFileSync(fp, 'utf-8');
  const fd = fs.openSync(fp, 'r');
  try {
    const tailBuf = Buffer.alloc(JSONL_TAIL_BYTES);
    const tn = fs.readSync(fd, tailBuf, 0, JSONL_TAIL_BYTES, stat.size - JSONL_TAIL_BYTES);
    let tail = tailBuf.toString('utf-8', 0, tn);
    tail = tail.slice(tail.indexOf('\n') + 1); // drop the cut-off first line
    // Tail-only display window. The elided head+middle is NOT stitched in with a
    // seam marker anymore — the client seek-loads the whole file backward from
    // this tail as a continuous virtual scroll (no visible truncation notice).
    if (opts.tailOnly) {
      console.warn(`[jsonl] large session file ${path.basename(fp)} (${Math.round(stat.size / 1048576)}MB): tail-only display (last ${JSONL_TAIL_BYTES / 1048576}MB), earlier history seek-loaded on scroll`);
      return tail;
    }
    // Legacy head+tail path (no callers pass tailOnly=false today, but keep the
    // head stitch for safety — WITHOUT the old seam-marker injection).
    const headBuf = Buffer.alloc(JSONL_HEAD_BYTES);
    const hn = fs.readSync(fd, headBuf, 0, JSONL_HEAD_BYTES, 0);
    let head = headBuf.toString('utf-8', 0, hn);
    head = head.slice(0, head.lastIndexOf('\n') + 1);
    return head + tail;
  } finally { fs.closeSync(fd); }
}

// ── THE INCREMENTAL TAIL (perf lane chunk C, 2.369.167) ──
// readJsonlBounded's tailOnly rule as a BYTE SPAN, so a caller that already
// holds the parse of a file can fold in only what was appended. The rule, in
// bytes: a file ≤ HEAD+TAIL is kept whole (from 0); a bigger one keeps every
// line whose FIRST byte lies strictly after `size − TAIL` (the tail read drops
// the cut-off line up to and including the first '\n' at or after that byte —
// a line starting exactly there is dropped too). `jsonlTailLower(size)` is that
// bound (−1 = keep everything).
function jsonlTailLower(size) { return size <= JSONL_HEAD_BYTES + JSONL_TAIL_BYTES ? -1 : size - JSONL_TAIL_BYTES; }

/** Read [from, to) of an open fd fully (readSync may return short). */
function _preadAll(fd, from, to) {
  const buf = Buffer.allocUnsafe(Math.max(0, to - from));
  let off = 0;
  while (off < buf.length) {
    const n = fs.readSync(fd, buf, off, buf.length - off, from + off);
    if (!(n > 0)) break;                        // truncated under us — the caller sees a short buffer
    off += n;
  }
  return off === buf.length ? buf : buf.subarray(0, off);
}

/** Parse the lines of `buf` (whose byte 0 is file offset `base` and a line
 *  start). Every '\n'-terminated line is parsed exactly as the string path
 *  does (`trim()`, blank skipped, unparseable skipped, `dropSubagent` = the
 *  session-store isSubagentMessage rule); the bytes after the last '\n' (the
 *  line the writer has not finished) are parsed too — the string path parses
 *  them — but reported apart, never consumed. */
function _parseJsonlLines(buf, base, dropSubagent) {
  const s = _jsonlLineStepper(buf, base, dropSubagent);
  s.step(Infinity);
  return s.finish();
}
/** THE LINE PARSE, ONE IMPLEMENTATION (row B-422c unit 2): `_parseJsonlLines` runs it whole; the sliced road
 *  (`_stepSliced`) runs it a few hundred lines at a time with the loop free between — the same records, starts and end
 *  by construction. `step(n, maxBytes)` parses up to n '\n'-terminated lines (or until maxBytes are consumed) → true once none
 *  is left; `finish()` parses the bytes
 *  after the last '\n' (reported apart, never consumed) and answers {records, starts, end, partial}. */
function _jsonlLineStepper(buf, base, dropSubagent) {
  const records = [], starts = [];
  const keep = (msg) => !(dropSubagent && (msg.parent_tool_use_id || msg.isSidechain));
  let pos = 0;
  return {
    step(n, maxBytes = Infinity) {
      const from = pos;
      for (let i = 0; i < n; i++) {
        const nl = buf.indexOf(10, pos);
        if (nl === -1) return true;
        if (nl > pos) {
          const t = buf.toString('utf8', pos, nl).trim();
          if (t) { try { const msg = JSON.parse(t); if (keep(msg)) { records.push(msg); starts.push(base + pos); } } catch { } }
        }
        pos = nl + 1;
        if (pos - from >= maxBytes) return false;
      }
      return false;
    },
    finish() {
      let partial;
      if (pos < buf.length) {
        const t = buf.toString('utf8', pos, buf.length).trim();
        if (t) { try { const msg = JSON.parse(t); if (keep(msg)) partial = msg; } catch { } }
      }
      return { records, starts, end: base + pos, partial };
    },
  };
}

const _PROBE = 4096;
/** THE ONE tail reader with a memory. `prev` = the entry this function
 *  returned last time for the same path (or null). Returns
 *  `{entry, mode: 'hit'|'append'|'full', bytes}` — `bytes` = bytes read and
 *  parsed (the probes, ≤ 2 × 4 KiB, are verification and not counted).
 *  entry = {mtimeMs, size, ino, dev, spanStart, spanEnd, messages, starts,
 *  partial, headProbe, tailProbe, incr}: `messages` = every kept record of the
 *  complete lines in [spanStart, spanEnd) in file order, plus the parsed
 *  unterminated tail line when it parses (`partial` = 1); `starts[i]` = the
 *  file offset of messages[i]'s line. OUTPUT IDENTITY: `messages` is
 *  deep-equal to readJsonlBounded(tailOnly) + the line parse at the same size.
 *  An append is taken only when the file is the SAME inode, strictly grown,
 *  the appended region is below the tail bound, and the bytes at both ends of
 *  the cached span re-read equal (the append-only check); anything else is a
 *  full read. `opts.appendOnly` = return null instead of a full read (the
 *  async warm hands the full read to the worker). Never a new array in place:
 *  a caller holding the old `messages` never sees it change. */
function readJsonlTail(fp, prev, opts = {}) {
  const dropSubagent = !!opts.dropSubagent;
  // the hit is decided on a stat alone — before the zstd magic read, so an
  // unchanged transcript costs one stat and no read at all
  const isHit = (st) => !!prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size && prev.ino === st.ino;
  const stat0 = opts.stat || fs.statSync(fp);
  if (isHit(stat0)) return { entry: prev, mode: 'hit', bytes: 0 };
  const plain = plainJsonlPath(fp);           // a zstd rollout reads through its materialized twin (S3)
  const stat = plain === fp ? stat0 : fs.statSync(plain);
  if (plain !== fp && isHit(stat)) return { entry: prev, mode: 'hit', bytes: 0 };
  fp = plain;
  const size = stat.size;
  const lower = jsonlTailLower(size);
  const fd = fs.openSync(fp, 'r');
  try {
    if (prev && prev.incr && prev.ino === stat.ino && prev.dev === stat.dev && size > prev.size
      && prev.spanEnd <= prev.size && lower < prev.spanEnd) {
      const hp = prev.headProbe, tp = prev.tailProbe;
      const headOk = _preadAll(fd, prev.spanStart, prev.spanStart + hp.length).toString('latin1') === hp;
      const tailOk = headOk && _preadAll(fd, prev.spanEnd - tp.length, prev.spanEnd).toString('latin1') === tp;
      if (headOk && tailOk) {
        const buf = _preadAll(fd, prev.spanEnd, size);
        const got = _parseJsonlLines(buf, prev.spanEnd, dropSubagent);
        const nOld = prev.messages.length - (prev.partial ? 1 : 0);
        let drop = 0;
        while (drop < nOld && prev.starts[drop] <= lower) drop++;
        // lower < prev.spanEnd (checked above) ⇒ no appended line can be at or below it
        const messages = prev.messages.slice(drop, nOld).concat(got.records);
        const starts = prev.starts.slice(drop, nOld).concat(got.starts);
        if (got.partial !== undefined) messages.push(got.partial);
        const end = got.end;
        let spanStart = prev.spanStart;
        let headProbe = hp;
        if (lower >= spanStart) {                 // the head slid: re-anchor on the first kept line
          spanStart = starts.length ? starts[0] : end;
          headProbe = _preadAll(fd, spanStart, Math.min(end, spanStart + _PROBE)).toString('latin1');
        }
        const tailFrom = Math.max(spanStart, end - _PROBE);
        const tailProbe = end - prev.spanEnd >= end - tailFrom
          ? buf.toString('latin1', tailFrom - prev.spanEnd, end - prev.spanEnd)
          : _preadAll(fd, tailFrom, end).toString('latin1');
        const readEnd = prev.spanEnd + buf.length;
        const entry = { mtimeMs: readEnd === size ? stat.mtimeMs : -1, size: readEnd, ino: stat.ino, dev: stat.dev, spanStart, spanEnd: end, messages, starts, partial: got.partial !== undefined ? 1 : 0, headProbe, tailProbe, incr: true };
        return { entry, mode: 'append', bytes: buf.length };
      }
    }
    if (opts.appendOnly) return null;
    // FULL: exactly readJsonlBounded's tailOnly rule, on bytes
    const from = Math.max(lower, 0);
    const raw = _preadAll(fd, from, size);
    let start = from, buf = raw, incr = true;
    if (lower >= 0) {
      const nl = raw.indexOf(10);
      if (nl === -1) incr = false;              // one line longer than the tail: the string path keeps the fragment — never extended
      else { buf = raw.subarray(nl + 1); start = from + nl + 1; }
      if (opts.warnLarge !== false) console.warn(`[jsonl] large session file ${path.basename(fp)} (${Math.round(size / 1048576)}MB): tail-only display (last ${JSONL_TAIL_BYTES / 1048576}MB), earlier history seek-loaded on scroll`);
    }
    const got = _parseJsonlLines(buf, start, dropSubagent);
    const messages = got.records;
    if (got.partial !== undefined) messages.push(got.partial);
    const end = got.end;
    const readEnd = from + raw.length;
    const entry = {
      // a short read (truncated under us) is never a hit next time
      mtimeMs: readEnd === size ? stat.mtimeMs : -1, size: readEnd, ino: stat.ino, dev: stat.dev, spanStart: start, spanEnd: end,
      messages, starts: got.starts, partial: got.partial !== undefined ? 1 : 0,
      headProbe: buf.toString('latin1', 0, Math.min(end - start, _PROBE)),
      tailProbe: buf.toString('latin1', Math.max(0, end - start - _PROBE), end - start),
      incr,
    };
    return { entry, mode: 'full', bytes: raw.length };
  } finally { fs.closeSync(fd); }
}


// ── Byte-offset line index for seek-based lazy loading of huge JSONL files ──
// A full readFileSync is impossible (>512MB string) and a full normalize is
// expensive, but the MIDDLE of a big rollout is still seek-readable: build a
// line→byte-offset table ONCE (streaming, Buffer scan — never holds the whole
// file as a string), cache it by mtime+size, then read any line range by
// pread without touching the rest. This is how the WebUI lets you scroll into
// the elided middle that head+tail loading skips.
const _lineIndexCache = new Map(); // fp -> { mtimeMs, size, offsets, totalLines }
const LINE_INDEX_CHUNK = 16 * 1024 * 1024;

function getJsonlLineIndex(fp) {
  fp = plainJsonlPath(fp);
  const stat = fs.statSync(fp);
  const hit = _lineIndexCache.get(fp);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
  const fd = fs.openSync(fp, 'r');
  try {
    let offsets;      // byte offset where each line STARTS; offsets[i] = start of line i
    let scanFrom;
    // Incremental fast path: JSONL is append-only, so when the file has only
    // GROWN and its previous end was a clean line boundary, reuse the cached
    // offset table and scan JUST the appended tail — instead of re-streaming the
    // whole (100s-of-MB, actively-growing) file on every seek. This is what makes
    // jumps stay instant while a live session keeps writing.
    let canExtend = false;
    if (hit && stat.size > hit.size && stat.mtimeMs >= hit.mtimeMs && hit.size > 0) {
      const b = Buffer.alloc(1);
      fs.readSync(fd, b, 0, 1, hit.size - 1);
      canExtend = b[0] === 0x0a;   // old size ended exactly after a newline
    }
    if (canExtend) {
      offsets = hit.offsets.slice(); // copy so a held-elsewhere old entry isn't mutated
      offsets.push(hit.size);        // start of the first appended line (was popped before)
      scanFrom = hit.size;
    } else {
      offsets = [0];
      scanFrom = 0;
    }
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = scanFrom;
    while (pos < stat.size) {
      const n = fs.readSync(fd, buf, 0, LINE_INDEX_CHUNK, pos);
      if (n <= 0) break;
      for (let i = 0; i < n; i++) {
        if (buf[i] === 0x0a) offsets.push(pos + i + 1); // start of next line
      }
      pos += n;
    }
    // offsets now has one trailing entry == file end if the file ends with \n;
    // totalLines = number of line starts that actually begin a line (< size)
    while (offsets.length > 1 && offsets[offsets.length - 1] >= stat.size) offsets.pop();
    const entry = { mtimeMs: stat.mtimeMs, size: stat.size, offsets, totalLines: offsets.length };
    _lineIndexCache.set(fp, entry);
    if (_lineIndexCache.size > 32) _lineIndexCache.delete(_lineIndexCache.keys().next().value);
    return entry;
  } finally { fs.closeSync(fd); }
}

// Which line indices does the head+tail window cover? Lines [0, headEndLine)
// are in the head, [tailStartLine, totalLines) in the tail; the gap in between
// is what lazy loading fetches. Returns null when the file isn't elided.
// ── Worker-backed async variants (2.235.0) ──
// The sync scans above are correct but SINGLE-THREADED: on huge transcripts a
// line-index build runs seconds and a 32MB tail parse ~0.5-1s, and every such
// call blocks the ONE event loop for the whole server (the userL incident's
// degradation was exactly these, invisible in machine CPU%). The async
// variants run the SAME functions in a persistent worker (transcript-worker
// requires this module — zero duplication; the mtime+size caches live worker-
// side where the work happens). Worker down/timeout ⇒ sync inline fallback,
// identical behavior without the isolation.
// THE HISTORY READ'S BOUNDS (lane resume-all-paced L3 cure): the history lane worker's heap (above), and a page's size — 8192 lines
// AND 4 MB of their text, whichever comes first (a run of big tool outputs no longer crosses the thread line as one clone)
let HISTORY_HEAP_MB = 768, HISTORY_SOFT_CHECK = true;
const PAGE_LINES = 8192, PAGE_BYTES = 4 * 1048576;
/** tests only (test-codex-history-bound): the history lane's heap bound — its hard limit is read when the pool is made, its soft
 *  check at each page; `soft: false` sends no soft check (the red control: the hard limit alone, under a parent heap flag) */
function _setHistoryHeapMbForTest(mb, { soft = true } = {}) { HISTORY_HEAP_MB = mb; HISTORY_SOFT_CHECK = soft; }
/** row B-422c's legs: a stand-in transcript pool (`{call, inPlace?}`) in the real one's place; null = build the real one again */
function _setTranscriptPoolForTest(p) { _workerScript = true; _transcriptPool = p === false ? false : (p || null); _poolFails = p === false ? POOL_RETRY_MAX : 0; _poolRetryAt = 0; }   // false: no pool on this process, its build's tries spent (poolGone)
// what the paged reads did (the legs assert the paged road was taken; a field hub's numbers): pages served, reads done in pages,
// snapshots found gone, one-shot reads, reads that gave up (each with its reason, onFail)
const _pagedStats = { pages: 0, reads: 0, gone: 0, oneShot: 0, failed: 0 };
function pagedReadStats() { return { ..._pagedStats }; }
// B-f3f9: what the merged reads did (a conversation's whole history merged in the worker): pages, reads, snapshots gone, give-ups
const _mergedStats = { pages: 0, reads: 0, gone: 0, failed: 0 };
function mergedReadStats() { return { ..._mergedStats }; }
// A CODEX PARSE ON THE MAIN LOOP IS SAID (L3 cure, 主开发 23:16Z): every one is counted, and logged with its reason and size —
// the off-loop road failed (gone twice, the lane busy, the worker died, its heap bound, no pool), or a caller read a reader before
// its off-loop read. The road stays (a missing pool must not lose the history); it stops being invisible.
const _onLoop = { count: 0, recent: [] };
function codexParsesOnLoop() { return { count: _onLoop.count, recent: _onLoop.recent.slice() }; }
function _noteParseOnLoop(threadId, fp, why) {
  let mt = true; try { mt = require('worker_threads').isMainThread; } catch { }
  if (!mt) return;   // a worker's parse (the search index's) holds no loop of the hub's
  let mb = 0; try { mb = Math.round(fs.statSync(fp).size / 1048576); } catch { }
  _onLoop.count++;
  _onLoop.recent.push({ at: Date.now(), threadId, mb, why }); if (_onLoop.recent.length > 20) _onLoop.recent.shift();
  try { global.__vsMetric?.('codex-parse-on-loop', 1); } catch { }
  console.warn(`[codex] parsed ${threadId} (${mb} MB rollout) ON THE MAIN LOOP — ${why || 'no reason given'}`);
}

let _transcriptPool = null, _workerScript = null, _inPlace = null;
// B-f64b cure (主开发 11:47Z): a pool whose construction failed is tried again — every POOL_RETRY_MS, POOL_RETRY_MAX times in all,
// each failure said with its try — never «inline for good» after one failure (every codex row would read «still checking» until a restart)
const POOL_RETRY_MS = 60000, POOL_RETRY_MAX = 5;
let _poolFails = 0, _poolRetryAt = 0;
function _transcriptPoolGet() {
  // B-3b03: a bundle that ships no worker script (the device agent's single file) runs every op IN PLACE, on its own loop —
  // exactly what the release's inline runner did there (the device's task scan reads its own transcript: transcript-worker's
  // taskLines, B-299b A2's MUST-2); never on the hub, whose checkout always has the script (the hub's pool refuses instead)
  if (_workerScript === null) _workerScript = fs.existsSync(path.join(__dirname, '..', 'transcript-worker.js'));   // once a process
  if (!_workerScript) return (_inPlace ||= { inPlace: true, call: async (op, payload) => (await require('../transcript-worker').runOp(op, payload)).result });
  if (_transcriptPool === null || (_transcriptPool === false && _poolFails < POOL_RETRY_MAX && Date.now() >= _poolRetryAt)) {
    try {
      const { SafeFs } = require('../hub-pool').hubPool(path.join(__dirname, '..', 'transcript-worker.js'));   // r2660 (B): never in the device bundle
      // THE HISTORY LANE'S HEAP IS BOUNDED, and only its (lane resume-all-paced L3 cure, 主开发 23:16Z): the bound was measured
      // for the codex history read alone — the pool's two workers also serve Claude's history reads, the line index and the turn
      // scans, unmeasured under a cap, so they keep the runtime's limit as before. Twice: the worker's resourceLimits (a hard
      // limit — which a parent --max-old-space-size REPLACES, as usage-cold-worker.js measured) and its own check of its heap at
      // each page (HISTORY_HEAP_MB, sent with each page — binds under every start of the hub). A page over it is refused by name
      // (`heap_bound`): the snapshot dropped, the worker alive, the next call served; the reader parses on the loop, SAID.
      _transcriptPool = new SafeFs({
        workerPath: path.join(__dirname, '..', 'transcript-worker.js'), name: 'transcript',
        poolSize: 2,
        pathKeys: ['fp'],   // row B-422c: every op names its transcript `fp` — a blocked mount refused by name, a deadline remembered (B-23e5)
        climb: false,       // …that file alone: a transcript op's deadline may end a long parse, so two never name their folder (a project's every conversation)
        laneOpts: { history: { resourceLimits: { maxOldGenerationSizeMb: HISTORY_HEAP_MB }, hungMs: 0 }, warm: { resourceLimits: { maxOldGenerationSizeMb: HISTORY_HEAP_MB }, hungMs: 0 }, warm2: { resourceLimits: { maxOldGenerationSizeMb: HISTORY_HEAP_MB }, hungMs: 0 } },   // row B-422c: the history lane's pages parse a snapshot in memory — its deadline is a parse's, never a dead file: it ASKS the memory, never adds to it (B-23e5's parse-lane rule) · B-80cb cure: the claude warm's two lanes, the same bound and the same parse-lane rule each (they parse the same pages)
        // B-3b03: no inlineRun — the pool never runs an op on the main thread (a refusal reaches its callers; their own sync
        // fallback after ANY pool failure is theirs — SILENT but for parseCodexSessionJsonl's codex-parse-on-loop: row B-422c)
        timeouts: { default: 60000, gapInfo: 120000, lineRange: 60000, userTurns: 120000, taskLines: 120000, boundedParsed: 60000, boundedParsedPage: 60000, codexHistoryMergedPage: 120000, jsonlTail: 60000, codexThreadMetas: 30000, codexOpenThreads: 15000, locate: 20000 },
      });
      if (_poolFails) console.log(`[transcript-worker] the pool is up (try ${_poolFails + 1})`);
    } catch (e) {
      _transcriptPool = false; _poolFails++; _poolRetryAt = Date.now() + POOL_RETRY_MS;
      console.error(`[transcript-worker] pool unavailable (try ${_poolFails} of ${POOL_RETRY_MAX}${_poolFails < POOL_RETRY_MAX ? `, tried again in ${POOL_RETRY_MS / 1000} s` : ' — not tried again: until a restart every transcript read is refused by name, nothing read on the main loop (row B-422c)'}):`, e.message);
    }
  }
  return _transcriptPool || null;
}
// ROW B-422c (lane hub-loop-stalls, 主开发 r1006 — A for every road): AFTER A TRANSCRIPT-POOL FAILURE NOTHING IS READ ON THE HUB'S
// LOOP. A pool failure — a closed pool, no worker, a deadline, a path the pool remembers hung, a busy or bounded lane: every one a
// 503 or the history lane's own code — refuses BY NAME (`transcript_reader_restarting`; the page says it: «the transcript reader is
// restarting — try again»); an error of the op itself (the file gone, denied) stays what it was. A deadline or a hung path is the
// STORAGE's (`storageHung`): nothing is tried there. Never the release's sync whole-file function on the loop. The device's
// in-place road (a bundle with no worker script: its own loop, by design) is no pool failure.
const READER_RESTARTING = 'the transcript reader is restarting — try again in a moment';
const isPoolFailure = (e) => !!e && (e.status === 503 || e.code === 'heap_bound' || e.code === 'history_busy');
// THE STORAGE'S, said by the pool itself (unit 2's whole-state read): a deadline names the CALL that ran out it, not the file that
// hung — the pool's own memory (B-23e5, keyed `fp` for this pool) remembers the op the worker was RUNNING; the history lane never
// adds to it (its pages parse a snapshot). So a refusal is the storage's when its code says so (a path the memory refuses, a blocked
// mount) or the memory remembers THIS file — a queued call's deadline blames nothing
function poolRemembersHung(fp) { const p = _transcriptPool; try { return !!(fp && p && typeof p._hungOf === 'function' && p._hungOf({ fp }, 'jsonlTail', 0)); } catch { return false; } }
// `ownCall`: the HISTORY LANE runs one call at a time (a waiting call is refused `history_busy`, never queued on a worker) — a deadline
// there is the call's OWN, the storage's for the files it names (主开发 r1006: «a deadline … means the storage hangs»)
const isStorageHung = (e, fp, { ownCall = false } = {}) => !!e && (e.code === 'path-hung' || e.code === 'storage-blocked' || (ownCall && e.deadline === true) || poolRemembersHung(fp));   // `deadline`: the call RAN and overran (src/safe-fs.js) — never a wait that expired   // + a mount the door holds blocked (src/mount-door.js)
// THE CAUSE a refusal names to the page (主开发 r3077 — the notice says the cause it HAS): 'restarting' — no live worker (one is
// started again after a deadline's kill, none could start, or the pool itself is built again after its build failed); 'busy' — the
// reader is alive and BUSY or AT ITS BOUND (every worker out on a look, the history lane's turn not come, the heap bound, a call that
// waited behind others past its deadline); null — not known (the page then names no cause). The storage's (storageHung) and a reader
// gone for good (readerGone) outrank it at the page.
function readerCauseOf(e) {
  if (!e) return 'restarting';   // no pool object: its build is tried again (POOL_RETRY_MS) — given up for good is readerGone
  if (e.code === 'no-worker' || e.noWorker === true) return 'restarting';
  if (e.code === 'no-idle-worker' || e.code === 'history_busy' || e.code === 'warm_busy' || e.code === 'heap_bound' || e.safeFsTimeout === true) return 'busy';
  return null;
}
function readerRefusal(e, fp = null, opts = {}) {
  return Object.assign(new Error(READER_RESTARTING), { code: 'transcript_reader_restarting', status: 503, why: (e && (e.code || e.message)) || 'no transcript pool on this process', storageHung: isStorageHung(e, fp, opts), readerCause: readerCauseOf(e) });
}
/** row B-422c (r1243 / r1461): the transcript reader's refusal by name as the HTTP answer — PURE → { status, retryAfter, body }: which
 *  door refused (storageHung: the storage's own words; readerGone: the pool gone — no «moment»), its next try as the hub's instant
 *  (retryAt) and as a delay (retryIn: a page's clock is not the hub's); Retry-After in whole seconds, never under 2 */
function readerRefusedAnswer(e, now = Date.now()) {
  const at = Number(e && e.retryAt) || 0;
  return { status: 503, retryAfter: String(Math.max(2, Math.ceil((at - now) / 1000))),
    body: { error: e && e.message, code: e && e.code, storageHung: !!(e && e.storageHung), readerGone: !!(e && e.readerGone), readerCause: (e && e.readerCause) || null, retryAt: at || null, retryIn: at ? Math.max(0, at - now) : null } };
}
/** one op through the transcript pool → its answer; a pool failure ⇒ the refusal by name, never a read on this loop */
const POOL_BUSY = Symbol('the pool had no idle worker: the call was not sent');   // r2506: an idleOnly call's own answer, never a failure
// a pool failure as the reader's refusal BY NAME, noted on the file and on the pool, its next try said (poolRead's, and the probe's
// own door ask below)
function poolRefusalNoted(e, fp, op) { const r = readerRefusal(e, fp); notePoolRefusing(e); noteFileRefusal(fp, r, { history: HISTORY_OPS.has(op) }); r.retryAt = nextReadAt(fp); r.readerGone = poolGone(); return r; }
async function poolRead(op, payload, opts) {
  const fp = payload && payload.fp;   // unit 2: the FILE's state — a refusal notes it, any answer for it (a result, or the op's own error) forgives it
  const pool = _transcriptPoolGet();
  if (!pool) { const r = readerRefusal(null); notePoolRefusing(r); noteFileRefusal(fp, r, { history: HISTORY_OPS.has(op) }); r.retryAt = nextReadAt(fp); r.readerGone = poolGone(); throw r; }
  let out;
  try { out = await pool.call(op, payload, opts); }
  catch (e) {
    if (opts && opts.idleOnly && e && (e.code === 'no-idle-worker' || e.code === 'no-worker')) return POOL_BUSY;   // NOT sent (no worker idle, or none alive at the send — r2715): nothing noted, the pool not marked refusing
    if (!pool.inPlace && isPoolFailure(e)) throw poolRefusalNoted(e, fp, op);   // its next try, after the record took the refusal
    poolAnswered(fp, op);   // the op's own error: a worker ran it — the pool answered
    throw e;
  }
  poolAnswered(fp, op);
  return out;
}
async function jsonlGapInfoAsync(fp) { return poolRead('gapInfo', { fp }); }
async function readJsonlLineRangeAsync(fp, startLine, endLine) { return poolRead('lineRange', { fp, startLine, endLine }); }
async function scanJsonlUserTurnsAsync(fp, backend, sent = null) { return poolRead('userTurns', { fp, backend, sent }); }
/** readJsonlTail's FULL read in the worker (the async warm's cold path, chunk
 *  C): resolves `{entry, mode, bytes}` — the same span entry the sync reader
 *  builds, so the next change folds in as an append. Row B-422c: a pool
 *  failure REJECTS with the refusal by name (the caller keeps its kept copy or
 *  says «not loaded yet» — never parses inline on the loop); null = an answer
 *  with no entry. */
async function readJsonlTailAsync(fp, { dropSubagent = false } = {}) {
  return poolRead('jsonlTail', { fp, dropSubagent });
}
/** 主开发 r2344 (1) / r2506 / r2715: THE STORAGE RETRY'S PROBE — one small read of the file (its first bytes: the worker's `probe`,
 *  fileIsZst's open + 4 bytes + close) under a SHORT bound on the general pool. THE LAW, from the worker's side: NO CALL OTHER THAN
 *  THE PROBE IS EVER IN A WORKER WHOSE BOUND IS THE PROBE's — none before it (idleOnly: sent only to a worker idle at the send; none
 *  idle, or none alive ⇒ NOT sent), none handed to that worker while it is out (SafeFs's `look`: the worker leaves the hand-out until
 *  the probe answers or its deadline ends it). The `look` word skips the pool's path memory, so the probe asks that memory ITSELF
 *  first: a file it remembers dead is refused at the door, no worker. It never takes the LAST worker (keepOne, r2718: another live
 *  worker stays in the hand-out, else not sent). And ONE PROBE ON THE POOL AT A TIME (r2715, its third side: with
 *  every live worker out on a look the pool refuses every other call, so two probes would leave no worker for anyone): the same
 *  file's second asker gets the first's answer; another file's retry finds the probe out ⇒ 'busy' (its gap unspent).
 *  → true: the worker came back within the bound (fileIsZst swallows every error of its read, so the probe has no op error of its
 *  own: an answer means the storage answered); 'busy': NOT sent (nothing noted, the pool not marked refusing); a pool failure (its
 *  deadline above all: the storage still hangs) REJECTS with the refusal by name, noted on the file — its deadline remembered by the
 *  pool's path memory for calls this short. Answering forgives nothing (not a history read): the paged read after it does. */
let STORAGE_PROBE_MS = 1500;   // a suite's own bound: _setSlicedForTest({ probeMs })
let _probeOut = null;   // { fp, p }: the ONE probe out on the pool — set in the same turn of the loop as its send
async function probeTranscriptAsync(fp) {
  if (_probeOut) return _probeOut.fp === fp ? _probeOut.p : 'busy';
  const pool = _transcriptPoolGet();
  if (pool && !pool.inPlace && typeof pool._hungOf === 'function') {   // the path memory, asked first (the look word skips it)
    const h = pool._hungOf({ fp }, 'probe', STORAGE_PROBE_MS);
    if (h) throw poolRefusalNoted(Object.assign(new Error(`the transcript pool remembers ${h.path} hung — the probe was not sent`), { status: 503, code: 'path-hung', hungPath: h.path }), fp, 'probe');
  }
  // keepOne (r2718): THE PROBE NEVER TAKES THE LAST WORKER — while it is out every other call is handed out exactly as if the pool had
  // one worker fewer: never ended and never refused because of the probe. (A worker that dies by ITS OWN bound while the probe is out
  // is the pool's own matter — a deadline of that worker's call — not this law's.)
  const p = poolRead('probe', { fp }, { timeoutMs: STORAGE_PROBE_MS, idleOnly: true, look: true, keepOne: true }).then((out) => (out === POOL_BUSY ? 'busy' : true));
  _probeOut = { fp, p };
  try { return await p; } finally { if (_probeOut && _probeOut.p === p) _probeOut = null; }
}
async function readJsonlBoundedParsedAsync(fp, { tailOnly = true, dropSubagent = false } = {}) {
  const pool = _transcriptPoolGet();
  if (pool) { try { return await pool.call('boundedParsed', { fp, tailOnly, dropSubagent }); } catch {} }
  return null; // caller falls back to its own sync parse
}
/** readJsonlBoundedParsedAsync IN PAGES (lane resume-all-paced, L2 — measured: the reply's structured clone of 68 000 records held the
 *  MAIN loop ~100 ms at its deserialize): the worker reads the tail once and hands its records back a page at a time (≤ PAGE_LINES
 *  lines and ≤ PAGE_BYTES of their text) from one snapshot in the `history` lane's one worker, the loop free between pages. A
 *  snapshot gone (another read replaced it) ⇒ asked once more; again ⇒ the one-shot worker read. A page refused by the lane's heap
 *  bound (`heap_bound`) skips the one-shot read (it would hold more). `onFail(why)` hears why the paged road gave up. `slot` (B-299b):
 *  the worker's snapshot slot — '' the history reads' (default), 'helper' the artifact door's (a helper's page 0 never cuts a history read).
 *  B-cd4b unit 2: `entry` — the claude warm's one-shot reply (readJsonlTail's whole entry, `jsonlTail`) in pages, the worker running the
 *  same function once: page 0 carries the entry's facts, every page its messages and their line starts; assembled here → { entry, mode,
 *  bytes }, as `jsonlTail` answers; its one-shot read on the general pool is the fallback for EVERY refusal, the heap bound too (a warm
 *  refused by the history lane is read as before the unit, never parsed on the loop), `onFail` told why; `dropSubagent` is the
 *  worker's own line rule (slot 'warm').
 *  Row B-422c: `onFail(why, refusal)` — `refusal` = the reader's refusal by name when the POOL failed (closed, no worker, a deadline,
 *  a hung path, the lane's bound or wait; never on the device's in-place road), null when the op itself failed (the caller's own road).
 *  `whole` (lane lg-recovery, 主开发 r2374): the file ENTIRE, its one-shot too — the sub-agent viewer's read (slot 'subagent',
 *  src/server/subagent-transcript.js: a null is its refusal, never a read on the loop).
 *  → the records (or, with `entry`, { entry, mode, bytes }), or null */
async function readJsonlBoundedParsedPagedAsync(fp, { tailOnly = true, page = PAGE_LINES, onFail = null, slot = '', entry = false, dropSubagent = false, note = true, whole = false, lane = null } = {}) {   // note: false — a caller whose refusals say nothing of the file's history (the artifact pass's whole-file read) · B-80cb cure: `lane` — the claude warm's own (src/session-store.js pumpWarm: 'warm' / 'warm2'); unset = the history lane
  let refusal = null;   // the LAST pool failure on this road (a later op error clears it: then the op's failure is the answer)
  // ownCall: page 0 (it reads the FILE — later pages parse its snapshot in memory) is the history lane's own call; the one-shot runs in
  // the main pool. A pool refusal STAYS the road's answer through a later op error (never a sync parse of a refused file after it)
  const seen = (e, ownCall) => { if (pool && !pool.inPlace && isPoolFailure(e)) { refusal = readerRefusal(e, fp, { ownCall }); notePoolRefusing(e); if (note) noteFileRefusal(fp, refusal, { history: true }); } };
  const said = (why) => { _pagedStats.failed++; try { onFail?.(why, refusal); } catch { } return null; };
  const pool = _transcriptPoolGet();
  if (!pool) {
    refusal = readerRefusal(null); notePoolRefusing(refusal); if (note) noteFileRefusal(fp, refusal, { history: true });
    // the WARM's road (`entry`) is told by the refusal THROWN, as its one-shot would (its caller's catch reads the main process's slices
    // when the guard allows — the move's read: a null said here ended that road, and a history stayed «not loaded» until a restart)
    if (entry) { refusal.retryAt = nextReadAt(fp); refusal.readerGone = poolGone(); throw refusal; }
    return said('no transcript pool on this process');
  }
  let why = null;
  for (let tries = 0; tries < 2; tries++) {
    let token = null;   // set once page 0 answered: a page with it parses the snapshot in memory (seen in the catch below)
    try {
      const out = [], startsOut = [];
      let total = Infinity, start = 0, gone = false, head = null;
      while (start < total) {
        const r = await pool.call('boundedParsedPage', { fp, tailOnly, ...(whole ? { whole: true } : {}), start, count: page, maxBytes: PAGE_BYTES, capMb: HISTORY_SOFT_CHECK && !pool.inPlace ? HISTORY_HEAP_MB : 0, ...(token ? { token } : {}), ...(slot ? { slot } : {}), ...(entry ? { entry: true } : {}), ...(dropSubagent ? { dropSubagent: true } : {}) }, lane ? { lane } : undefined);   // B-80cb cure: every page in the lane that read page 0
        if (!r || r.gone) { gone = true; _pagedStats.gone++; why = 'its snapshot was gone twice (another read replaced it)'; break; }
        _pagedStats.pages++;
        token = r.token; total = r.total;
        if (entry && r.facts) head = r;
        for (const x of r.records) out.push(x);
        if (entry && r.starts) for (const x of r.starts) startsOut.push(x);
        start = Number.isInteger(r.next) && r.next > start ? r.next : start + page;
      }
      if (!gone && entry) { _pagedStats.reads++; poolAnswered(fp, 'boundedParsedPage'); return head ? { entry: { ...head.facts, messages: out, starts: startsOut }, mode: head.mode, bytes: head.bytes } : said('the paged entry came without its facts'); }
      if (!gone) { _pagedStats.reads++; poolAnswered(fp, 'boundedParsedPage'); return out; }
    } catch (e) {
      const code = e && e.code;
      // the warm's road: the history LANE's own bound or wait says nothing of the file — its one-shot read follows by design
      if (!(entry && (code === 'heap_bound' || code === 'history_busy' || code === 'warm_busy'))) seen(e, !token);   // warm_busy: a warm lane's own wait (round wf_32f917e5-722)
      if (code === 'heap_bound' && !entry) return said(`the history worker's heap bound (${HISTORY_HEAP_MB} MB): ${e.message}`);
      if (refusal && (refusal.storageHung || fileStorageHung(fp))) { if (entry) { refusal.retryAt = nextReadAt(fp); refusal.readerGone = poolGone(); throw refusal; } return said(`its storage hung (${(e && e.message) || e}) — no one-shot read sent into it`); }   // the warm's road: thrown, its catch reads it as the storage's   // nothing more tried there (a retry of a storage file is ONE call)
      why = code === 'heap_bound' ? `the ${lane || 'history'} worker's heap bound (${HISTORY_HEAP_MB} MB): ${e.message}` : code === 'history_busy' || code === 'warm_busy' ? `the ${lane || 'history'} lane was busy past its wait` : `the ${lane || 'history'} worker failed (${(e && e.message) || e})`;
      break;
    }
  }
  _pagedStats.oneShot++;
  if (entry) { try { onFail?.(`${why} — the entry read in one piece on the general pool`); } catch { } }   // B-cd4b unit 2: a warm refused by the history lane (its heap bound too) is read as before the unit, never parsed on the loop
  // row B-422c: the one-shot read never parses on this loop — the warm's entry through readJsonlTailAsync (a pool failure there
  // refuses BY NAME, thrown: the warm notes it), the records through the pool's own op (its failure seen: the refusal by name)
  if (entry) { const e1 = await readJsonlTailAsync(fp, { dropSubagent }); return e1 == null ? said(`${why}; then the one-shot read answered nothing`) : e1; }
  let r = null;
  try { r = await pool.call('boundedParsed', { fp, tailOnly, dropSubagent: !!dropSubagent, ...(whole ? { whole: true } : {}) }); } catch (e) { seen(e, false); why = `${why}; then the one-shot read failed too (${(e && e.message) || e})`; return said(why); }
  if (r == null) return said(`${why}; then the one-shot read answered nothing`);
  poolAnswered(fp, 'boundedParsed');
  return r;
}
/** B-f3f9: a codex conversation's WHOLE history read, parsed and MERGED in the transcript worker's `history` lane (its fork
 *  ancestry's files in order, its own last — `files` = [{fp, threadId, untilOrdinal}]), THEN the live buffer merged last:
 *  `liveBuffer()` is asked when the history is merged (read as late as the old road read it). The final records come back a page
 *  at a time (≤ PAGE_LINES records and ≤ PAGE_BYTES of their JSON), each with the thread its file names (`threads`, '' = the live
 *  buffer's). The history call's deadline grows with the files (60 s each, as the old road's per-file reads had). A snapshot gone
 *  (another read replaced it) ⇒ asked once more; a refusal (the heap bound, the lane busy, the worker down, no pool) ⇒ null and
 *  `onFail(why)` — the caller reads the old road. → { records, threads } | null */
async function codexHistoryMergedPagedAsync({ files = [], liveBuffer = () => '' } = {}, { page = PAGE_LINES, onFail = null } = {}) {
  const said = (why) => { _mergedStats.failed++; try { onFail?.(why); } catch { } return null; };
  const pool = _transcriptPoolGet();
  if (!pool) return said('no transcript pool on this process');
  // row B-422c unit 2: a file of it the memory calls the STORAGE's ⇒ the merged call is never sent into it (nothing tried there)
  const hungFile = (files || []).find((f) => f && fileStorageHung(f.fp));
  if (hungFile) return said(`its file ${path.basename(hungFile.fp)} is the storage's (a deadline, a hung path, a blocked mount) — not asked`);
  const capMb = HISTORY_SOFT_CHECK ? HISTORY_HEAP_MB : 0;
  const bufferNow = () => { try { return String((typeof liveBuffer === 'function' ? liveBuffer() : liveBuffer) || ''); } catch { return ''; } };
  let why = null;
  for (let tries = 0; tries < 2; tries++) {
    let reading = true;   // the first call reads the FILES; its pages parse the snapshot in memory
    try {
      const h = await pool.call('codexHistoryMergedPage', { files, capMb }, { timeoutMs: Math.min(600000, 60000 * Math.max(2, files.length)) });
      reading = false;
      if (!h || !h.token) { why = 'the history call answered nothing'; continue; }
      const records = [], threads = [];
      let total = Infinity, start = 0, gone = false, first = true;
      while (start < total) {
        const r = await pool.call('codexHistoryMergedPage', { token: h.token, start, count: page, maxBytes: PAGE_BYTES, capMb, ...(first ? { liveBuffer: bufferNow() } : {}) });
        first = false;
        if (!r || r.gone) { gone = true; _mergedStats.gone++; why = 'its snapshot was gone twice (another read replaced it)'; break; }
        _mergedStats.pages++;
        total = r.total;
        for (let i = 0; i < r.records.length; i++) { records.push(r.records[i]); threads.push(r.tix[i] >= 0 ? r.tids[r.tix[i]] : ''); }
        start = Number.isInteger(r.next) && r.next > start ? r.next : start + page;
      }
      if (!gone) { _mergedStats.reads++; for (const f of files || []) poolAnswered(f && f.fp, 'codexHistoryMergedPage'); return { records, threads }; }   // unit 2: its answer forgives every file it named
    } catch (e) {
      const code = e && e.code;
      // row B-422c unit 2: the merged call names its files in `files`, never `fp` — a POOL failure of it (a deadline above all: one of
      // them hung) is noted for EVERY file it names, so no file of it is read on the main process after a deadline
      if (!pool.inPlace && isPoolFailure(e)) { notePoolRefusing(e); for (const f of files || []) noteFileRefusal(f && f.fp, readerRefusal(e, f && f.fp, { ownCall: reading }), { history: true }); }   // the history lane's own call: its deadline names every file
      if (code === 'heap_bound') return said(`the history worker's heap bound (${HISTORY_HEAP_MB} MB): ${e.message}`);
      return said(code === 'history_busy' ? 'the history lane was busy past its wait' : `the history worker failed (${(e && e.message) || e})`);
    }
  }
  return said(why);
}
// ── ROW B-422c UNIT 2 (主开发 r1006 item 2): THE TWO HISTORIES' DEGRADATION ROAD ─────────────────────────────────────────────
// THE LAW: a person can always read a conversation's history, and no step of it holds the loop 250 ms. When the pool's refusal of
// ONE FILE is not the storage's and has stood SLICED_AFTER_MS (stated: 10 s — twenty times a worker's respawn), the two histories
// (the Claude tail, the codex rollout) read that file ON THE MAIN PROCESS: every file call async (libuv — never a sync call on this
// loop), the line parse in slices of SLICE_MS with the loop free between them (`_jsonlLineStepper`: the worker's records, by
// construction). THE GUARD — a storage that hung is never tried here: the file's record says the storage hung (a deadline, a hung
// path, a blocked mount: for the record's life), the mount door holds it blocked, or the pool remembers it hung ⇒ never; ONE such
// read at a time on the hub, and none while one that ran out its own deadline (SLICED_READ_DEADLINE_MS, then the file is the
// storage's) has not answered — at most one libuv thread parked in a dead file; a compressed rollout is never decompressed here
// (the worker's). Said once a file in the journal. The four other roads never take it.
let SLICED_AFTER_MS = 10000, SLICED_READ_DEADLINE_MS = 60000;
const SLICE_MS = 8, SLICE_LINES = 256, SLICE_BYTES = 1 << 20, ZSTD_MAGIC = 0xFD2FB528;
let STAND_GAP_MS = 120000;         // a refusal STANDS while the file is refused again within 2 min; past that it starts over (a re-open after «not loaded» still stands)
const FILE_REFUSALS_MAX = 4096, FILE_REFUSALS_HUNG_MAX = 8192;  // the storage's records are kept past the first bound (never forgotten first)
// THE POOL REFUSING EVERY CALL (closed, no worker, no idle one): a fact of the pool, not of one file — a parse of a session whose
// file the pool was never asked about reads nothing on the loop either while it stands; any answer of the pool ends it
const POOL_REFUSING_MS = 30000;
// a file the storage's is asked of the POOL again (off the loop — the pool's own memory refuses at once while it remembers, then one
// worker tries) at most once a gap: 30 s, doubling on each retry, at most 8 min (B-23e5's span); one caller claims each retry
let STORAGE_RETRY_MS = 30000;
const STORAGE_RETRY_MAX_MS = 8 * 60000;
function storageRetryDue(fp, { claim = true } = {}) {
  const r = fp && _fileRefusals.get(fp);
  if (!r || !(r.storage || r.ownDeadline)) return true;   // the door or the pool's memory alone: the pool's door answers at once
  if (poolGone() && _storageParked) return false;   // the pool gone: the ONE storage retry the main process may hold is parked — this one cannot run; its gap is not spent
  const now = Date.now();
  if (now < (r.retryAt || 0)) return false;
  if (claim) spendRetryGap(r, now);
  return true;
}
// the retry's gap SPENT — by a retry that was sent (主开发 r2506: a probe not sent, no worker idle, spends nothing)
const spendRetryGap = (r, now) => { r.retryGap = Math.min(STORAGE_RETRY_MAX_MS, (r.retryGap || STORAGE_RETRY_MS) * 2); r.retryAt = now + r.retryGap; };   // the next retry waits twice as long (30 s, 1 min, 2 … ≤ 8 min)
function storageRetryClaim(fp) { const r = fp && _fileRefusals.get(fp); const now = Date.now(); if (r && (r.storage || r.ownDeadline) && now >= (r.retryAt || 0)) spendRetryGap(r, now); }   // once a retry: two askers answered by one probe spend one gap
let _poolRefusedAt = 0;
const POOL_WIDE = new Set(['no-worker']);   // SafeFs's own code (src/safe-fs.js NO_WORKER); its `no-idle-worker` (NO_IDLE: an `idleOnly` call while every worker
// is busy) is ORDINARY LOAD, never a pool that refuses — dropped ON PURPOSE (round w5gioyat2 asked); the one transcript call that passes idleOnly, the storage retry's probe (r2506), takes it as its own answer — POOL_BUSY in poolRead, never a failure
function notePoolRefusing(e) { if (!e || POOL_WIDE.has(e.code) || /safeFs closed/.test(String(e.message || '')) || e.why === 'no transcript pool on this process') { _poolRefusedAt = Date.now(); _poolRefusedCause = e && e.readerCause !== undefined ? e.readerCause : readerCauseOf(e); } }
let _poolRefusedCause = null;   // r3077: the cause of the pool-wide refusal standing (its own words at the page)
// an answer of the pool ends «refusing every call»; only a HISTORY READ's answer forgives the file (a task scan or a gap read answered
// on the other worker says nothing of whether its tail can be read: the whole-state read's MUST)
const HISTORY_OPS = new Set(['jsonlTail', 'boundedParsed', 'boundedParsedPage', 'codexHistoryMergedPage']);
function poolAnswered(fp, op) { _poolRefusedAt = 0; if (HISTORY_OPS.has(op)) forgiveFile(fp); }
// the pool gone (its construction failed — retried, or given up after POOL_RETRY_MAX) refuses every call too, renewed by nothing
function poolGone() { return (_transcriptPool === false && _poolFails >= POOL_RETRY_MAX) || !!(_transcriptPool && _transcriptPool._closed); }   // closed for good, or its build given up (B-f64b's tries spent): no call can answer until a restart — a build still to be tried again is NOT gone
function poolRefusing() { return _transcriptPool === false || poolGone() || (!!_poolRefusedAt && Date.now() - _poolRefusedAt <= POOL_REFUSING_MS); }   // + a pool closed for good: no call needed to say so
const _fileRefusals = new Map();   // fp → { firstAt, lastAt, count, storage, ownDeadline, why } — the pool's refusals of ONE file, standing
const _slicedSaid = new Set();
let _slicedChain = Promise.resolve(), _slicedParked = 0;
// r1461 (1): the STORAGE RETRY's own line and its own parked count — a read parked by one conversation's storage retry (the pool gone,
// its mount dead) never refuses or holds another file's read, and at most ONE storage retry is parked at a time however many
// conversations sit on the dead mount (the main process holds at most two libuv threads in dead files: one of each)
let _storageChain = Promise.resolve(), _storageParked = 0;
const _parkedFiles = new Set();   // the files a main-process read is parked in: never a second read sent into one (plain or storage retry)
const _slicedJoin = new Map();     // kind:fp → the read in flight (a second ask of the same file joins it)
function noteFileRefusal(fp, refusal, { history = false } = {}) {
  if (!fp) return null;
  const storage = !!(refusal && refusal.storageHung);
  // a PLAIN refusal says something of a file's history only when a history read was refused (a task scan or a gap read refused on a
  // restarting worker says nothing of its tail — the mirror of the forgiving); the STORAGE's is noted whatever the op
  if (!history && !storage) return _fileRefusals.get(fp) || null;
  const now = Date.now();
  let rec = _fileRefusals.get(fp);
  if (rec && !rec.storage && !rec.ownDeadline && now - rec.lastAt > STAND_GAP_MS) { rec.firstAt = now; rec.count = 0; }   // not refused for a while: it starts over
  if (rec) { _fileRefusals.delete(fp); _fileRefusals.set(fp, rec); }   // the NEWEST place: the bound goes to the files refused longest ago
  else {
    rec = { firstAt: now, lastAt: now, count: 0, storage: false, ownDeadline: false, why: '' };
    _fileRefusals.set(fp, rec);
    if (_fileRefusals.size > FILE_REFUSALS_MAX) {   // the oldest record that is NOT the storage's goes first; past the second bound, the oldest
      for (const [k, r] of _fileRefusals) if (!r.storage && !r.ownDeadline && k !== fp) { _fileRefusals.delete(k); break; }
      while (_fileRefusals.size > FILE_REFUSALS_HUNG_MAX) _fileRefusals.delete(_fileRefusals.keys().next().value);
    }
  }
  rec.lastAt = now; rec.count++;
  rec.why = (refusal && refusal.why) || rec.why || 'refused';
  rec.cause = (refusal && refusal.readerCause) || null;   // r3077: the cause the newest refusal named (the page's words)
  if (storage && !rec.storage) {   // the STORAGE's — for the record's life: only a history read's answer for the file forgives it (never a timer: the pool's own retry may still be wedged in it)
    rec.storage = true;
    rec.retryGap = STORAGE_RETRY_MS;   // the first retry waits one gap; each RETRY then doubles it (storageRetryDue) — never each refusal (a tail and a task scan refused at once are one event)
    rec.retryAt = now + rec.retryGap;
  }
  return rec;
}
const forgiveFile = (fp) => { if (fp) _fileRefusals.delete(fp); };   // the pool answered for it: the refusal no longer stands
/** r3077: the cause to name for this file's refusal — its own record's, else the pool-wide refusal's (a pool not built yet: restarting);
 *  null = not known. Memory only */
function readerCauseFor(fp) {
  const r = fp && _fileRefusals.get(fp);
  if (r && r.cause) return r.cause;
  if (_transcriptPool === false) return 'restarting';
  return _poolRefusedAt && Date.now() - _poolRefusedAt <= POOL_REFUSING_MS ? _poolRefusedCause : null;
}
/** has the pool refused this file with no answer for it since (any pool answer for it forgives the record)? — memory only */
function fileRefused(fp) { return !!(fp && _fileRefusals.get(fp)); }
/** the storage's, as far as memory knows (its record, the mount door) — never a file call */
function fileStorageHung(fp) {
  if (!fp) return false;
  const r = _fileRefusals.get(fp);
  if (r && (r.storage || r.ownDeadline)) return true;   // a refusal that named the storage, our own read's deadline — for the record's life
  if (poolRemembersHung(fp)) return true;   // the pool's memory (B-23e5): time-bounded by itself
  try { return !!require('../mount-door').blocked(fp); } catch { return false; }
}
/** May this file's history be read on the main process now? → { ok, why } (never a file call: memory only) */
function slicedRoadFor(fp, { storageRetry = false } = {}) {
  const rec = fp && _fileRefusals.get(fp);
  if (!rec) return { ok: false, why: 'no refusal of it stands' };
  if (_parkedFiles.has(fp)) return { ok: false, why: 'its own read on the main process is still parked — never a second one into the same file' };   // r1461's read: a storage retry into the file a plain read is parked in
  // `storageRetry`: the storage's DUE retry (storageRetryDue claimed it) while the pool refuses every call — the pool cannot retry it,
  // so the main process does, under the same guard (one at a time, none while one is parked, the read's own deadline)
  if (!storageRetry && fileStorageHung(fp)) return { ok: false, why: 'its storage hung (a deadline, a hung path or a blocked mount) — never tried here' };
  const stood = Date.now() - rec.firstAt;
  if (!storageRetry && stood < SLICED_AFTER_MS) return { ok: false, why: `refused for ${Math.round(stood / 1000)} s — the main process reads it past ${SLICED_AFTER_MS / 1000} s` };
  let mp = false; try { mp = require('../mount-door').blocked(fp); } catch { mp = false; }
  if (mp) return { ok: false, why: 'its mount is blocked' };
  if (_transcriptPool && typeof _transcriptPool._hungOf === 'function' && _transcriptPool._hungOf({ fp }, 'jsonlTail', 0)) return { ok: false, why: 'the transcript pool remembers it hung' };   // patience 0: any entry AT OR ABOVE it refuses (every transcript entry is one)
  if (!storageRetry && _slicedParked) return { ok: false, why: 'a read on the main process is still parked in a file that never answered' };
  if (storageRetry && _storageParked) return { ok: false, why: 'a storage retry on the main process is still parked in a file that never answered — one at a time' };
  return { ok: true, why: `the transcript reader refused it for ${Math.round(stood / 1000)} s (${rec.count} refusals: ${rec.why})` };
}
const STORAGE_FAIL_CODES = new Set(['EIO', 'ETIMEDOUT', 'ESTALE', 'EHOSTDOWN', 'EHOSTUNREACH', 'ENOTCONN', 'ECONNRESET', 'ECONNABORTED', 'EREMOTEIO', 'ENXIO']);
/** the file's bounded tail bytes, every call async, under ONE deadline (a deadline ⇒ the storage's, `storageHung`) */
function _readTailBytesAsync(fp, { storageRetry = false } = {}) {
  let parked = false, timer = null;
  const work = (async () => {
    const fh = await fs.promises.open(fp, 'r');
    try {
      const stat = await fh.stat();
      const head = Buffer.alloc(4);
      const h = await fh.read(head, 0, 4, 0);
      if (h.bytesRead === 4 && head.readUInt32LE(0) === ZSTD_MAGIC) throw Object.assign(new Error('a compressed rollout — only the worker decompresses it'), { code: 'sliced_zst' });
      const size = stat.size, lower = jsonlTailLower(size), from = Math.max(lower, 0);
      const raw = Buffer.allocUnsafe(Math.max(0, size - from));
      let off = 0;
      while (off < raw.length) { const { bytesRead } = await fh.read(raw, off, Math.min(raw.length - off, 4 << 20), from + off); if (!(bytesRead > 0)) break; off += bytesRead; }
      return { stat, size, lower, from, raw: off === raw.length ? raw : raw.subarray(0, off) };
    } finally { await fh.close().catch((e) => console.warn(`[transcript] the main-process read of ${path.basename(fp)}: its file handle did not close (${e.message})`)); }
  })();
  // a late reply that is the FILE's answer — its bytes, or the file's own error (a FIFO's ESPIPE, a gone file, a folder) — is the storage
  // answering; an I/O failure after the hang (EIO, ETIMEDOUT, ESTALE … a soft mount giving up) is the storage FAILING: the mark stays
  const answered = () => { if (parked) { const r = _fileRefusals.get(fp); if (r) r.ownDeadline = false; } };
  work.then(answered, (e) => { if (!STORAGE_FAIL_CODES.has(e && e.code)) answered(); }).finally(() => { if (parked) { _parkedFiles.delete(fp); if (storageRetry) _storageParked--; else _slicedParked--; } });   // a parked read that answers late frees its place — and the file answered: its own-deadline mark ends
  const deadline = new Promise((_, rej) => { timer = setTimeout(() => { parked = true; _parkedFiles.add(fp); if (storageRetry) _storageParked++; else _slicedParked++; rej(Object.assign(new Error(`no answer in ${SLICED_READ_DEADLINE_MS / 1000} s — the storage hangs`), { code: 'sliced_read_deadline', storageHung: true })); }, SLICED_READ_DEADLINE_MS); });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
/** the line parse in slices: SLICE_LINES lines at a time until SLICE_MS, then the loop's turn */
async function _stepSliced(stepper) {
  for (;;) {
    const t0 = performance.now();
    let done = false;
    do { done = stepper.step(SLICE_LINES, SLICE_BYTES); } while (!done && performance.now() - t0 < SLICE_MS);   // ≤ 256 lines or ≥ 1 MB a step, the clock after each
    if (done) return stepper.finish();
    await new Promise((r) => setImmediate(r));
  }
}
/** one read on the main process at a time (the same file's second ask joins it); the guard asked at ITS turn; said once a file */
function _slicedTurn(kind, fp, read, { storageRetry = false } = {}) {
  const key = kind + ':' + fp;
  if (_slicedJoin.has(key)) return _slicedJoin.get(key);
  const run = async () => {
    const road = slicedRoadFor(fp, { storageRetry });
    if (!road.ok) throw Object.assign(new Error(road.why), { code: 'sliced_refused' });
    const sayOnce = (key, line) => { if (_slicedSaid.has(key)) return; if (_slicedSaid.size > 512) _slicedSaid.clear(); _slicedSaid.add(key); console.warn(line); };
    sayOnce(fp, `[transcript] ${path.basename(fp)}: ${road.why} — its history is read on the main process in bounded slices (row B-422c)`);
    try {
      const out = await read();
      const rec = _fileRefusals.get(fp);
      if (rec) { rec.storage = false; rec.ownDeadline = false; }   // the file ANSWERED a read: no storage of it is hung (the pool's refusal of it stands)
      return out;
    }
    catch (e) {
      if (e && (e.storageHung || e.code === 'sliced_read_deadline')) {   // our own read's deadline: the storage's for the record's life — and its retry waits a GAP (r1461's read: with no retryAt it was due at once, and went into the file its read is parked in)
        const rec = _fileRefusals.get(fp) || noteFileRefusal(fp, { why: e.message }, { history: true });
        rec.ownDeadline = true;
        if (!(rec.retryAt > Date.now())) { rec.retryGap = rec.retryGap || STORAGE_RETRY_MS; rec.retryAt = Date.now() + rec.retryGap; }
      }   // a record evicted meanwhile is made again (a history read's)
      sayOnce('failed:' + fp, `[transcript] ${path.basename(fp)}: the main process's read of its history failed (${(e && e.message) || e}) — «not loaded» (row B-422c)`);
      throw e;
    }
  };
  // a storage retry takes ITS OWN line (r1461 (1)): one of them at a time, never ahead of nor behind another file's read
  const turn = (storageRetry ? _storageChain : _slicedChain).then(run, run);
  if (storageRetry) _storageChain = turn.then(() => { }, () => { }); else _slicedChain = turn.then(() => { }, () => { });
  _slicedJoin.set(key, turn);
  turn.then(() => _slicedJoin.delete(key), () => _slicedJoin.delete(key));
  return turn;
}
/** readJsonlTail's FULL read on the main process, sliced — the same entry ({entry, mode: 'full', bytes}); throws its refusal */
function readJsonlTailSliced(fp, { dropSubagent = false, storageRetry = false } = {}) {
  return _slicedTurn('tail' + (dropSubagent ? '-d' : ''), fp, async () => {
    if (isZstPath(fp)) throw Object.assign(new Error('a compressed rollout — only the worker decompresses it'), { code: 'sliced_zst' });
    const { stat, size, lower, from, raw } = await _readTailBytesAsync(fp, { storageRetry });
    let start = from, buf = raw, incr = true;
    if (lower >= 0) { const nl = raw.indexOf(10); if (nl === -1) incr = false; else { buf = raw.subarray(nl + 1); start = from + nl + 1; } }
    const got = await _stepSliced(_jsonlLineStepper(buf, start, !!dropSubagent));
    const messages = got.records;
    if (got.partial !== undefined) messages.push(got.partial);
    const end = got.end, readEnd = from + raw.length;
    const entry = {
      mtimeMs: readEnd === size ? stat.mtimeMs : -1, size: readEnd, ino: stat.ino, dev: stat.dev, spanStart: start, spanEnd: end,
      messages, starts: got.starts, partial: got.partial !== undefined ? 1 : 0,
      headProbe: buf.toString('latin1', 0, Math.min(end - start, _PROBE)),
      tailProbe: buf.toString('latin1', Math.max(0, end - start - _PROBE), end - start),
      incr,
    };
    return { entry, mode: 'full', bytes: raw.length };
  }, { storageRetry });
}
/** parseCodexSessionJsonl's read and parse (readJsonlBounded tail-only + every line) on the main process, sliced → the records */
function readCodexRolloutSliced(fp, { storageRetry = false } = {}) {
  return _slicedTurn('rollout', fp, async () => {
    if (isZstPath(fp)) throw Object.assign(new Error('a compressed rollout — only the worker decompresses it'), { code: 'sliced_zst' });
    const { lower, raw } = await _readTailBytesAsync(fp, { storageRetry });
    let buf = raw;
    if (lower >= 0) { const nl = raw.indexOf(10); if (nl !== -1) buf = raw.subarray(nl + 1); }
    const got = await _stepSliced(_jsonlLineStepper(buf, 0, false));
    if (got.partial !== undefined) got.records.push(got.partial);
    return got.records;
  }, { storageRetry });
}
/** r1243 item 2 — WHEN A PAGE TOLD «NOT LOADED» MAY ASK AGAIN AND BE ANSWERED (it re-asks by itself then, never a re-open): a file the
 *  storage's — its retry time; a refusal that has not stood the stated time — the moment it has (the sliced road opens); a road that
 *  cannot open (a read parked in a dead file, a compressed rollout) — a minute; otherwise a worker's respawn away (2 s). Never sooner
 *  than 2 s, so a page's re-asks stay bounded. Memory only. */
function nextReadAt(fp) {
  const now = Date.now(), floor = now + 2000;
  const r = fp && _fileRefusals.get(fp);
  if (fileStorageHung(fp)) return Math.max(floor, (r && r.retryAt) || now + STORAGE_RETRY_MS, poolGone() && _storageParked ? now + 60000 : 0);   // the storage retry's one place held: not before a minute
  if (r && r.firstAt + SLICED_AFTER_MS > now) return Math.max(floor, r.firstAt + SLICED_AFTER_MS + 250);
  if (_slicedParked || (fp && isZstPath(fp))) return now + 60000;
  return floor;
}
/** row B-422c unit 2's legs: the stated time and the read's deadline (ms; null = the product's), and the file records' state */
function _setSlicedForTest({ afterMs = null, deadlineMs = null, standGapMs = null, storageRetryMs = null, probeMs = null } = {}) { STORAGE_PROBE_MS = probeMs == null ? 1500 : probeMs; SLICED_AFTER_MS = afterMs == null ? 10000 : afterMs; SLICED_READ_DEADLINE_MS = deadlineMs == null ? 60000 : deadlineMs; STAND_GAP_MS = standGapMs == null ? 120000 : standGapMs; STORAGE_RETRY_MS = storageRetryMs == null ? 30000 : storageRetryMs; }
const slicedState = () => ({ files: _fileRefusals.size, parked: _slicedParked, storageParked: _storageParked, parkedFiles: _parkedFiles.size, said: _slicedSaid.size });

/** Generic off-loop call (S3: codex discovery ops) → the worker's result. Row B-422c: `whenRefused(refusal)` is what a POOL
 *  FAILURE answers — a kept answer or null, NEVER a read on this loop (the release ran an inline walk here: the codex sessions
 *  tree on the 5 s poll while the pool was down); an error of the op itself answers the same. The device's in-place road runs the
 *  op on its own loop, as before. */
async function transcriptWorkerCall(op, payload, whenRefused = () => null) {
  try { return await poolRead(op, payload); } catch (e) { return whenRefused(e); }
}

function jsonlGapInfo(fp) {
  fp = plainJsonlPath(fp);
  const stat = fs.statSync(fp);
  if (stat.size <= JSONL_HEAD_BYTES + JSONL_TAIL_BYTES) return null;
  const { offsets, totalLines } = getJsonlLineIndex(fp);
  const tailStartByte = stat.size - JSONL_TAIL_BYTES;
  // first line whose start is within the head budget is excluded once offset > head
  let headEndLine = 0;
  while (headEndLine < totalLines && offsets[headEndLine] < JSONL_HEAD_BYTES) headEndLine++;
  let tailStartLine = headEndLine;
  while (tailStartLine < totalLines && offsets[tailStartLine] < tailStartByte) tailStartLine++;
  return { headEndLine, tailStartLine, totalLines, gapRecords: Math.max(0, tailStartLine - headEndLine) };
}

// Full-file user-turn scan for a whole-conversation minimap. Streams the file
// in chunks (no big string), pre-filters to lines containing a user-role marker
// (~2k of 300k lines), JSON-parses only those. Returns turns in TIME coordinates
// (the universal minimap axis) plus each turn's file line (for seek-jumping).
const _turnScanCache = new Map(); // fp -> { mtimeMs, size, turns }
/** `sent` = VibeSpace's own record of this ONE conversation (B-9a2e — handed as data: the worker never opens the store). */
function scanJsonlUserTurns(fp, backend, sent = null) {
  fp = plainJsonlPath(fp);
  const stat = fs.statSync(fp);
  const hit = _turnScanCache.get(fp);
  const sig = SP.sigOf(sent);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size && hit.sig === sig) return hit.turns;
  return SP.withRows(Array.isArray(sent) ? sent : [], () => scanTurnsOf(fp, backend, stat, sig));
}
function scanTurnsOf(fp, backend, stat, sig) {
  const fd = fs.openSync(fp, 'r');
  const turns = [];
  const needle = '"role":"user"';
  const handleLine = (raw, line) => {
    if (!raw || raw.indexOf(needle) === -1) return;
    let rec; try { rec = JSON.parse(raw); } catch { return; }
    const turn = backend === 'codex' ? _codexUserTurn(rec, line) : _claudeUserTurn(rec, line);
    if (turn) turns.push(turn);
  };
  try {
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = 0, line = 0, carry = '';
    while (pos < stat.size) {
      const n = fs.readSync(fd, buf, 0, LINE_INDEX_CHUNK, pos);
      if (n <= 0) break;
      const text = carry + buf.toString('utf-8', 0, n);
      const parts = text.split('\n');
      carry = parts.pop();
      for (const raw of parts) handleLine(raw.trim(), line++);
      pos += n;
    }
    handleLine(carry.trim(), line);
  } finally { fs.closeSync(fd); }
  _turnScanCache.set(fp, { mtimeMs: stat.mtimeMs, size: stat.size, sig, turns });
  if (_turnScanCache.size > 32) _turnScanCache.delete(_turnScanCache.keys().next().value);
  return turns;
}

// B-40f8: THE turn preview (src/assistant-note.js) over THE message the record's
// normalizer makes (lane minimap-person-rows r2, LAW A′: message-manager
// userRecordOf / codex-message-manager userItemOf — the same stamps the attach
// slab's turnMap reads; a peer / the auto-resume continue are cards, never notes)
function _turnOf(line, ts, msg) {
  const p = turnPreviewOf(msg);
  return p ? { line, ts, preview: p.preview, isCompact: !!p.isCompact, ...(p.note ? { note: p.note } : {}), ...(p.other ? { other: p.other } : {}) } : null; // lane minimap-person-rows: `other` = nobody typed it (personRow) — the list folds it
}

function _claudeUserTurn(rec, line) {
  if (rec.type !== 'user' || rec.message?.role !== 'user') return null;
  if (Array.isArray(rec.message.content) && rec.message.content.some((b) => b.type === 'tool_result')) return null; // tool result, not a real user turn
  const u = userRecordOf(rec); // THE normalizer's stamps (lane minimap-person-rows r2) — provenance before words, never a text test of the scan's own
  if (u.companion || u.nudge) return null; // an isMeta companion line / the safety stop's nudge: the normalizer gives neither a turn of its own
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  const msg = { role: 'user', ts, content: [{ type: 'text', text: u.text }], ...u.stamps, ...(u.synthetic ? { synthetic: true } : {}) };
  if (u.peer) applyPeerOrigin(msg, u.peer.po, u.peer.said); // a peer delivery's name + PATH (a notice or another session) — and a group report's card
  return _turnOf(line, ts, msg);
}

function _codexUserTurn(rec, line) {
  if (rec.type !== 'response_item' || rec.payload?.type !== 'message' || rec.payload?.role !== 'user') return null;
  const u = userItemOf(rec.payload, { conv: null, at: rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0 }); // THE codex normalizer's message (lane minimap-person-rows r2): the marker OR the rollout copy's frame, the goal's continue, auto-resume
  if (!u) return null;
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  return _turnOf(line, ts, { role: 'user', content: u.content, ...u.stamps });
}

// ── Full-file streaming search ──
// Search the ENTIRE JSONL (including the elided middle of huge files) without
// ever holding it in memory. Chunked Buffer scan with a cheap raw-substring
// pre-filter, then JSON.parse only the candidate lines and match against the
// record's extracted text. Coordinates are {line, ts} — the same axes the
// full-extent minimap uses — so the client can seek-jump to any match.
// Caveat: the raw pre-filter can miss text whose JSON encoding differs from
// the query (embedded quotes/newlines); plain words and CJK are stored
// literally in these files, so real-world queries are unaffected.
function _searchableTextOf(rec, backend) {
  const parts = [];
  const push = (v) => { if (typeof v === 'string' && v) parts.push(v); };
  if (backend === 'codex') {
    const p = rec.payload || {};
    if (Array.isArray(p.content)) for (const b of p.content) push(b?.text);
    push(typeof p.content === 'string' ? p.content : '');
    push(p.arguments); push(p.output); push(p.text);
    if (Array.isArray(p.summary)) for (const b of p.summary) push(b?.text);
  } else {
    const m = rec.message || {};
    if (typeof m.content === 'string') push(m.content);
    else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (!b) continue;
        push(b.text); push(b.thinking);
        if (b.type === 'tool_use' && b.input !== undefined) { try { push(JSON.stringify(b.input)); } catch {} }
        if (b.type === 'tool_result') {
          if (typeof b.content === 'string') push(b.content);
          else if (Array.isArray(b.content)) for (const c of b.content) push(c?.text);
        }
      }
    }
  }
  return parts.join(' ');
}

// Build a match object for one raw JSONL line, or null if it doesn't match.
function _matchJsonlLine(raw, line, backend, q) {
  if (!raw || raw.toLowerCase().indexOf(q) === -1) return null; // cheap pre-filter
  let rec; try { rec = JSON.parse(raw); } catch { return null; }
  const text = _searchableTextOf(rec, backend);
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  const role = backend === 'codex'
    ? (rec.payload?.role || rec.payload?.type || rec.type || '')
    : (rec.message?.role || rec.type || '');
  const from = Math.max(0, idx - 30);
  const preview = (from > 0 ? '…' : '') + text.slice(from, idx + q.length + 50).replace(/\s+/g, ' ') + (idx + q.length + 50 < text.length ? '…' : '');
  return { line, ts, role, preview };
}

function searchJsonlFull(fp, backend, query, maxResults = 500) {
  const q = String(query || '').toLowerCase();
  if (!q) return { matches: [], truncated: false };
  fp = plainJsonlPath(fp);
  const stat = fs.statSync(fp);
  const fd = fs.openSync(fp, 'r');
  const matches = [];
  let truncated = false;
  try {
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = 0, line = 0, carry = '';
    while (pos < stat.size && matches.length < maxResults) {
      const n = fs.readSync(fd, buf, 0, LINE_INDEX_CHUNK, pos);
      if (n <= 0) break;
      const text = carry + buf.toString('utf-8', 0, n);
      const parts = text.split('\n');
      carry = parts.pop();
      for (const raw of parts) {
        if (matches.length >= maxResults) { truncated = true; break; }
        const m = _matchJsonlLine(raw.trim(), line++, backend, q);
        if (m) matches.push(m);
      }
      pos += n;
    }
    if (matches.length >= maxResults && pos < stat.size) truncated = true;
    else if (matches.length < maxResults) { const m = _matchJsonlLine(carry.trim(), line, backend, q); if (m) matches.push(m); }
  } finally { fs.closeSync(fd); }
  return { matches, truncated };
}

// Streaming full-file search: reads the file ASYNChronously (yields to the event
// loop between chunks, so the response flushes progressively and other requests
// aren't blocked) and calls onMatch(match) as each hit is found — so the client
// can show a live "found N, still searching…" count (less-style). Returns the
// final { total, truncated } once the whole file has been scanned (or aborted).
async function searchJsonlFullStream(fp, backend, query, onMatch, opts = {}) {
  const maxResults = opts.maxResults || 500;
  const signal = opts.signal;
  const q = String(query || '').toLowerCase();
  if (!q) return { total: 0, truncated: false };
  fp = plainJsonlPath(fp);
  const stat = fs.statSync(fp);
  const fh = await fs.promises.open(fp, 'r');
  let total = 0, truncated = false;
  try {
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = 0, line = 0, carry = '';
    while (pos < stat.size && total < maxResults) {
      if (signal?.aborted) break;
      const { bytesRead } = await fh.read(buf, 0, LINE_INDEX_CHUNK, pos);
      if (bytesRead <= 0) break;
      const chunk = carry + buf.toString('utf-8', 0, bytesRead);
      const parts = chunk.split('\n');
      carry = parts.pop();
      for (const raw of parts) {
        if (total >= maxResults) { truncated = true; break; }
        const m = _matchJsonlLine(raw.trim(), line++, backend, q);
        if (m) { total++; onMatch(m); }
      }
      pos += bytesRead;
    }
    if (total >= maxResults && pos < stat.size) truncated = true;
    else if (total < maxResults && !signal?.aborted) { const m = _matchJsonlLine(carry.trim(), line, backend, q); if (m) { total++; onMatch(m); } }
  } finally { await fh.close(); }
  return { total, truncated };
}

// Read raw records for line range [startLine, endLine) by seeking to the
// indexed byte offsets — no full-file read, no string-limit risk.
function readJsonlLineRange(fp, startLine, endLine) {
  fp = plainJsonlPath(fp);
  const { offsets, totalLines, size } = getJsonlLineIndex(fp);
  const s = Math.max(0, Math.min(startLine, totalLines));
  const e = Math.max(s, Math.min(endLine, totalLines));
  if (e <= s) return [];
  const startByte = offsets[s];
  const endByte = e < totalLines ? offsets[e] : size;
  const len = endByte - startByte;
  if (len <= 0) return [];
  const fd = fs.openSync(fp, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, startByte);
    const text = buf.toString('utf-8', 0, n);
    const records = [];
    let li = s;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      const curLine = li++;
      if (!trimmed) continue;
      try { const rec = JSON.parse(trimmed); rec.__line = curLine; records.push(rec); } catch {}
    }
    return records;
  } finally { fs.closeSync(fd); }
}


// `fp`: the rollout's path when the caller has ALREADY looked it up (null = it looked and found none) — never walked twice (the
// checkpoint's test-task-scan-loop ⑤ red: the off-loop read's fallback walked ~/.codex/sessions a second time on the main loop)
function parseCodexSessionJsonl(threadId, { why = null, fp: known } = {}) {
  const fp = known !== undefined ? known : findCodexSessionJsonlPath(threadId);
  // MISSING ROLLOUT (B-21e4 item 5): serve the thread/read records the store's
  // warmTranscript hook cached (0.153 paginated history with no rollout file on
  // this machine). Lazy require — codex-thread-read never requires this module.
  if (!fp) { try { return require('../codex-thread-read').cachedThreadRecords(threadId) || []; } catch { return []; } }
  _noteParseOnLoop(threadId, fp, why);   // the sync parse of a rollout is ON the caller's loop: on the hub's main thread, said
  const messages = [];
  try {
    // Tail-only: earlier history is seek-loaded on scroll (no seam marker).
    const content = readJsonlBounded(fp, { tailOnly: true });
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { messages.push(JSON.parse(trimmed)); } catch {}
    }
  } catch {}
  return messages;
}

// formatCodexRoleLabel + the thread classification: MOVED to
// discovery-facts.js (2026-09-24, the sub-agent flood) — ONE rule for the
// local listing, the live wrapper_meta, the daemon snapshot and the ssh
// script's SC lines. normalizeCodexSource keeps its old signature (the live
// wrapper_meta hands a bare `source`).
function normalizeCodexSource(source) {
  return classifyCodexThread({ source });
}

// deriveCodexSessionName: MOVED to discovery-facts.js (S3) — ONE naming rule
// for the local listing, the daemon snapshot and the ssh script's NC lines.

function deriveCodexReviewName(target, hint) {
  const type = String(target?.type || '').trim();
  if (!type) return 'Review';

  if (type === 'uncommittedChanges' || type === 'workingTree') {
    return 'Review: Working Tree';
  }
  if (type === 'baseBranch') {
    const branch = String(target.branch || target.baseBranch || target.base_branch || '').trim();
    return branch ? `Review: ${branch}`.slice(0, 120) : 'Review: Base Branch';
  }
  if (type === 'commit') {
    const sha = String(target.sha || target.commit || target.commitSha || '').trim();
    return sha ? `Review: ${sha.slice(0, 12)}` : 'Review: Commit';
  }
  if (type === 'custom') {
    const custom = deriveCodexSessionName(hint || target.instructions || '');
    return custom ? `Review: ${custom}`.slice(0, 120) : 'Review: Custom';
  }

  const fallback = deriveCodexSessionName(hint || target.instructions || '');
  return fallback ? `Review: ${fallback}`.slice(0, 120) : 'Review';
}

// deriveCodexAgentName: MOVED to discovery-facts.js with the classifier.

// mtime-keyed cache: listCodexThreads runs extractCodexThreadMeta on EVERY
// thread JSONL per /api/sessions poll (and per user-state normalization) —
// uncached this re-read+re-parsed the entire ~/.codex/sessions tree each time.
// Mirrors the Claude side's _sessionMetaCache.
const _threadMetaCache = new Map(); // filePath -> { mtimeMs, meta }
const THREAD_META_HEAD_BYTES = 262144; // session_meta + first user msg live at the head

// A thread that cannot be read VANISHES from the session list (no threadId ⇒
// no card) — the loudest symptom with the quietest cause, so every failed
// extraction says so VERBATIM once per file per 10 minutes (the discovery poll
// is 5s: unthrottled this would be a log firehose). The compressed-head cap
// bug lived behind a bare `catch {}` here for exactly this reason.
const _extractFailLogged = new Map(); // filePath -> lastLoggedAt
function _noteExtractFailure(filePath, e) {
  const now = Date.now();
  if (now - (_extractFailLogged.get(filePath) || 0) < 600000) return;
  _extractFailLogged.set(filePath, now);
  if (_extractFailLogged.size > 500) _extractFailLogged.delete(_extractFailLogged.keys().next().value);
  console.warn(`[codex] thread meta unreadable, thread hidden until it reads: ${path.basename(filePath)}: ${e?.code || ''} ${e?.message || e}`.trim());
}

function extractCodexThreadMeta(filePath) {
  let cachedStat = null;
  try {
    cachedStat = fs.statSync(filePath);
    const hit = _threadMetaCache.get(filePath);
    if (hit && hit.mtimeMs === cachedStat.mtimeMs) return hit.meta;
  } catch {}
  let threadId = '';
  let cwd = '';
  let name = '';
  let updatedAt = 0;
  let source = null;
  let sourceMeta = normalizeCodexSource(null);
  let forkedFromId = null;
  let forkedFromChain = null;
  // 0.153 fork boundary (SessionMeta in codex-rs protocol.rs, verified against
  // the 0.153.4 generated bindings): `forked_from_ordinal_exclusive` (PARENT-
  // numbered, exclusive) or `history_base {thread_id, end_ordinal_exclusive}`
  // (a paginated 'Referenced' fork — the child rollout carries NO copy of the
  // parent's records, its history IS the parent's prefix below that ordinal).
  // `subagent_history_start_ordinal` is CHILD-numbered: a sub-agent rollout
  // copies its inherited context in below it. Read from the thread's OWN
  // session_meta only (a copied ancestor meta describes another boundary).
  let forkedFromOrdinal = null;
  let ownHistoryStartOrdinal = null;
  let historyMode = null;
  let sessionAgentRole = '';
  let sessionAgentNickname = '';
  let sessionAgentPath = '';
  let startedAt = 0;
  let reviewDetected = false;
  let reviewTarget = null;
  let reviewHint = '';
  let firstUserName = '';
  let scannedRecords = 0;
  let extractFailed = false;
  try {
    const stat = cachedStat || fs.statSync(filePath);
    updatedAt = stat.mtimeMs || 0;
    // Head read only — all meta-bearing records are at the start; reading
    // multi-MB session files whole just to break at record 200 wasted IO.
    // readHeadText (discovery-facts) handles a zstd rollout with a bounded
    // COMPRESSED prefix — the daemon snapshot reads heads the same way.
    const head = readHeadText(filePath, THREAD_META_HEAD_BYTES);
    for (const line of head.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      scannedRecords++;
      let msg = null;
      try { msg = JSON.parse(trimmed); } catch { continue; }

      if (msg.type === 'session_meta') {
        if (!threadId) threadId = msg.payload?.id || '';
        cwd = msg.payload?.cwd || cwd;
        const explicitName = deriveCodexSessionName(
          msg.payload?.session_name
          || msg.payload?.sessionName
          || msg.payload?.name
          || msg.payload?.threadName
          || '',
        );
        if (explicitName) name = explicitName;
        if (Array.isArray(msg.payload?.forked_from)) forkedFromChain = msg.payload.forked_from;
        if ((msg.payload?.id || '') === threadId) {
          const p = msg.payload || {};
          const ord = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
          // forked_from_id from the thread's OWN meta only, like the boundary
          // below: a sub-agent rollout copies its PARENT's session_meta at
          // line 1 (29/79 local rollouts), whose forked_from_id names the
          // GRANDPARENT — "last wins" paired the child's own boundary ordinal
          // with the grandparent's id, so a merged fork read cut the wrong
          // file (round-3 fixture: two real rollouts, byte copies).
          if (!forkedFromId && p.forked_from_id) forkedFromId = p.forked_from_id;
          if (forkedFromOrdinal === null) {
            forkedFromOrdinal = ord(p.forked_from_ordinal_exclusive);
            const hb = p.history_base && typeof p.history_base === 'object' ? p.history_base : null;
            if (forkedFromOrdinal === null && hb && p.forked_from_id && hb.thread_id === p.forked_from_id) forkedFromOrdinal = ord(hb.end_ordinal_exclusive);
          }
          if (ownHistoryStartOrdinal === null) ownHistoryStartOrdinal = ord(p.subagent_history_start_ordinal);
          if (!historyMode && typeof p.history_mode === 'string') historyMode = p.history_mode;
        }
        // The FIRST session_meta is the thread's own (threadId is taken from
        // it above) — classify from the WHOLE payload, not just `source`:
        // 0.153 v2 children also say `thread_source: "subagent"` at the top
        // level (classifyCodexThread, the one rule; 2026-09-24).
        if (!source && (msg.payload?.id || '') === threadId) {
          source = msg.payload?.source || null;
          sourceMeta = classifyCodexThread(msg.payload || {});
        }
        sessionAgentRole = msg.payload?.agent_role || msg.payload?.agentRole || sessionAgentRole;
        sessionAgentNickname = msg.payload?.agent_nickname || msg.payload?.agentNickname || sessionAgentNickname;
        // B-7473: the thread's own agent path + creation time (the sub-agent
        // roster the /api/subagents fallback answers with). Own meta only —
        // the inherited PARENT copy at ordinal 1 must not overwrite it.
        if ((msg.payload?.id || '') === threadId) {
          if (!sessionAgentPath) sessionAgentPath = msg.payload?.agent_path || msg.payload?.agentPath || '';
          if (!startedAt) startedAt = Date.parse(msg.payload?.timestamp || '') || 0;
        }
        continue;
      }

      if (msg.type === 'event_msg') {
        const eventType = msg.payload?.type || '';
        if (eventType === 'entered_review_mode') {
          reviewDetected = true;
          reviewTarget = msg.payload?.target || reviewTarget;
          reviewHint = msg.payload?.user_facing_hint || reviewHint;
        }
        if (eventType === 'review_started' && !reviewTarget) {
          reviewTarget = msg.payload?.target || reviewTarget;
        }
      }

      if (msg.type === 'response_item' && msg.payload?.type === 'enteredReviewMode') {
        reviewDetected = true;
        reviewTarget = msg.payload?.target || reviewTarget;
        reviewHint = msg.payload?.userFacingHint || msg.payload?.user_facing_hint || reviewHint;
      }

      if (!firstUserName && msg.type === 'response_item' && msg.payload?.type === 'message' && msg.payload?.role === 'user') {
        const content = msg.payload?.content || [];
        const firstText = content
          .filter((item) => item.type === 'input_text')
          .map((item) => item.text || '')
          .find((text) => deriveCodexSessionName(text)) || '';
        const nextName = deriveCodexSessionName(firstText);
        if (nextName) firstUserName = nextName;
      }

      if (scannedRecords >= 200 && threadId && cwd && (firstUserName || reviewDetected || sourceMeta.agentKind !== 'primary')) {
        break;
      }
    }
  } catch (e) { extractFailed = true; _noteExtractFailure(filePath, e); }

  if (!sourceMeta.agentRole && sessionAgentRole) sourceMeta.agentRole = sessionAgentRole;
  if (!sourceMeta.agentNickname && sessionAgentNickname) sourceMeta.agentNickname = sessionAgentNickname;
  if (!sourceMeta.parentThreadId && forkedFromId && sourceMeta.agentKind !== 'primary') {
    sourceMeta.parentThreadId = forkedFromId;
  }

  if (reviewDetected || sourceMeta.agentKind === 'review') {
    sourceMeta = {
      ...sourceMeta,
      sourceKind: 'review',
      agentKind: 'review',
      parentThreadId: sourceMeta.parentThreadId || forkedFromId || null,
    };
    name = deriveCodexReviewName(reviewTarget, reviewHint || firstUserName);
  } else if (sourceMeta.agentKind === 'subagent') {
    name = deriveCodexAgentName(sourceMeta.agentKind, sourceMeta.agentRole, sourceMeta.agentNickname) || firstUserName;
  } else if (!name) {
    name = firstUserName || deriveCodexAgentName(sourceMeta.agentKind, sourceMeta.agentRole, sourceMeta.agentNickname);
  }

  const meta = {
    threadId,
    cwd,
    name,
    updatedAt,
    source,
    sourceKind: sourceMeta.sourceKind,
    agentKind: sourceMeta.agentKind,
    agentRole: sourceMeta.agentRole,
    agentNickname: sourceMeta.agentNickname,
    agentPath: sourceMeta.agentPath || sessionAgentPath || '',  // '/root/water_research' (B-7473 sub-agent roster)
    depth: Number.isInteger(sourceMeta.depth) ? sourceMeta.depth : null,
    startedAt: startedAt || 0,
    parentThreadId: sourceMeta.parentThreadId,
    forkedFrom: forkedFromChain || [],
    forkedFromId: forkedFromId || null,   // codex's own fork parent (thread/fork or a sub-agent spawn)
    forkedFromOrdinal,                    // PARENT-numbered exclusive boundary (0.153 paginated forks), else null
    ownHistoryStartOrdinal,               // CHILD-numbered: a sub-agent's own history starts here (inherited context below)
    historyMode,                          // 'legacy' | 'paginated' (0.153), else null
  };
  // NEVER cache a failed extraction: a transient IO error (EMFILE under fd
  // pressure, mid-write race) would otherwise be cached keyed by the file's
  // current mtime — and if the session never writes again (terminated), the
  // empty threadId is cached FOREVER and the thread silently vanishes from
  // discovery until a server restart.
  if (cachedStat && !extractFailed) {
    _threadMetaCache.set(filePath, { mtimeMs: cachedStat.mtimeMs, meta });
    // Bounded: evict oldest entries past 2000 files
    if (_threadMetaCache.size > 2000) {
      const firstKey = _threadMetaCache.keys().next().value;
      _threadMetaCache.delete(firstKey);
    }
  }
  return meta;
}

class CodexAdapter extends BackendAdapter {
  constructor(config = {}) {
    super();
    this.config = config;
  }


  /**
   * Build session args for Codex terminal/chat modes.
   */
  buildSessionArgs(options) {
    const { cwd, model, effort, permissionMode, resumeId, fork = false, extraArgs = [], mode = 'terminal', initialPrompt = '' } = options;
    const resolvedPermission = withCodexToolPick(resolveCodexPermissionMode(permissionMode, {
      sandboxSupported: this.config.codexSandboxSupported !== false,
    }), toolAllowlistArgs({ backend: 'codex', pick: options.tools }));

    if (mode === 'chat') {
      return {
        cmd: this.config.codexCmd || 'codex',
        args: ['app-server', ...extraArgs],
        wrapper: this.config.chatWrapper,
        cwd: cwd || os.homedir(),
        mode,
        env: {
          CODEX_WEBUI_MODEL: model || '',
          CODEX_WEBUI_EFFORT: effort || '',
          CODEX_WEBUI_RESUME_ID: resumeId || '',
          CODEX_WEBUI_FORK: fork ? '1' : '',
          CODEX_WEBUI_PERMISSION_MODE: resolvedPermission.permissionMode,
          CODEX_WEBUI_REQUESTED_PERMISSION_MODE: resolvedPermission.requestedPermissionMode || '',
          CODEX_WEBUI_PERMISSION_FALLBACK: resolvedPermission.degradedReason || '',
          CODEX_WEBUI_APPROVAL_POLICY: resolvedPermission.approvalPolicy,
          CODEX_WEBUI_SANDBOX: resolvedPermission.sandbox,
          CODEX_WEBUI_TOOLS_PICK: resolvedPermission.toolPick ? JSON.stringify(resolvedPermission.toolPick) : '', // the wrapper's withToolsPick
          CODEX_WEBUI_CWD: cwd || os.homedir(),
          CODEX_WEBUI_SESSION_NAME: options.sessionName || '',
          // RESPONSE STYLE (2.369.58): the per-session `outputStyle` slot,
          // spelled in codex's own vocabulary (Personality: none | friendly |
          // pragmatic). '' = the user chose nothing ⇒ the wrapper omits the
          // key entirely and ~/.codex/config.toml decides. An out-of-enum
          // value never reaches the app-server.
          CODEX_WEBUI_PERSONALITY: capsOf('codex').responseStyle.values.includes(options.outputStyle || '') ? options.outputStyle : '', // codex's enum is CLOSED — an unknown value is dropped, never forwarded
        },
        permission: resolvedPermission,
      };
    }

    const commonArgs = [];
    if (model) commonArgs.push('--model', model);
    pushCodexConfigOverride(commonArgs, 'model_reasoning_effort', effort);
    if (resolvedPermission.approvalPolicy) commonArgs.push('--ask-for-approval', resolvedPermission.approvalPolicy);
    if (resolvedPermission.sandbox) commonArgs.push('--sandbox', resolvedPermission.sandbox);
    // Terminal twin of the chat wrapper's networkAccess (2.369.17): the
    // vibespace-* tools on PATH POST to loopback, which codex's sandbox
    // blocks by default. Filesystem policy stays workspace-write.
    if (resolvedPermission.sandbox === 'workspace-write') commonArgs.push('-c', 'sandbox_workspace_write.network_access=true'); // bare TOML boolean — the quoted form is a string
    if (extraArgs.length) commonArgs.push(...extraArgs);

    const args = resumeId
      ? ['resume', ...commonArgs, resumeId]
      : [...commonArgs];

    if (initialPrompt) args.push(initialPrompt);

    return {
      cmd: this.config.codexCmd || 'codex',
      args,
      wrapper: this.config.ptyWrapper,
      cwd: cwd || os.homedir(),
      mode,
      permission: resolvedPermission,
    };
  }

  // ── Protocol formatting (called by ws-handler) ──

  formatChatInput(text, msgId) {
    const stdinPayload = JSON.stringify({ type: 'chat-input', text, msgId });
    const userMsg = CodexAdapter._buildUserPreview(text, msgId);
    return { stdinPayload, userMsg };
  }

  formatInterrupt() {
    return JSON.stringify({ type: 'interrupt' });
  }

  postInterrupt() {} // no SIGINT fallback needed

  formatPermissionResponse(data) {
    // requestUserInput answers arrive from the unified AskUserQuestion UI as
    // toolInput.answers (same shape as Claude); the wrapper expects them in
    // responseData.{decision,answers} — translate here so running wrappers
    // (which persist inside dtach across server restarts) need no change.
    let responseData = data.responseData || null;
    if (!responseData && data.toolInput?.answers) {
      responseData = {
        decision: data.approved ? 'accept' : (data.abort ? 'cancel' : 'decline'),
        answers: data.toolInput.answers,
      };
    }
    return JSON.stringify({
      type: 'permission-response',
      requestId: data.requestId,
      approved: !!data.approved,
      alwaysAllow: Array.isArray(data.permissionUpdates) && data.permissionUpdates.length > 0,
      abort: !!data.abort,
      responseData,
    });
  }

  formatSetPermissionMode(mode) {
    return JSON.stringify({ type: 'set-permission-mode', mode });
  }

  // Mid-session model switch: the wrapper stores it in meta.model, which is
  // passed on every turn/start — takes effect from the next turn.
  formatSetModel(model) {
    return JSON.stringify({ type: 'set-model', model });
  }

  // Mid-session RESPONSE STYLE switch — LIVE, unlike claude's spawn-only
  // outputStyle: the wrapper turns this into `thread/settings/update
  // {threadId, personality}` on the SAME thread (0.153.4 schema). '' clears the
  // thread override and hands the choice back to ~/.codex/config.toml.
  formatSetResponseStyle(style) {
    return JSON.stringify({ type: 'set-response-style', style: style || '' });
  }

  // READ-ONLY permission-rule read (owner ruling 10): the wrapper answers with
  // `config/read {cwd, includeLayers:true}` — layers + origins, i.e. "which
  // layer won this key". It asks the SESSION's own app-server on purpose: a
  // fresh child cannot see the `sessionFlags` layer (`-c` overrides this
  // session was spawned with), so it would answer about a different session.
  // No write verb exists here and none is planned (config/value/write's
  // optimistic concurrency makes a careless write data loss).
  formatReadPermissionRules({ requestId = '' } = {}) {
    return JSON.stringify({ type: 'read-permission-rules', requestId: String(requestId || '') });
  }

  // Mid-session effort switch: wrapper stores it and passes it on the next
  // turn/start (effort is a per-turn param, like model).
  formatSetEffort(effort) {
    return JSON.stringify({ type: 'set-effort', effort });
  }

  // QUEUE OPS — every verb in codex's `inputModes.queueVerbs` row has a branch
  // here (a declared verb with no construction branch is a RED test). The
  // wrapper owns the queue THROUGH the app-server (thread/queue/list is the
  // truth) and executes the op:
  //   'steer'     turn/steer into the RUNNING turn, then thread/queue/delete
  //               the copy (measured: a steer does NOT dequeue)
  //   'remove'    thread/queue/delete
  //   'steer-all' the same, per item, in queue order (measured: several steers
  //               in one turn are accepted)
  //   'reorder'   RELATIVE here (`afterId`, null = to the front); the wrapper
  //               re-lists and computes the app-server's absolute full-order
  //               array. This layer must NOT speak in absolute orders: a full
  //               order composed against a stale render deletes whatever a
  //               peer queued in between (design-harness-features §2.1).
  //   'edit'      the new TEXT only; the wrapper rebuilds the full `input`,
  //               preserving attachments by exclusion.
  //   'run-now'   ONE item, and the id is MANDATORY — thread/queue/start with
  //               no id means "drain the whole queue", so a lost id must
  //               become an error here, never a silent run-all.
  //   'run-all'   the deliberate, separate drain verb.
  formatQueueOp({ op, id, afterId, text } = {}) {
    if (!QUEUE_VERBS.includes(op)) throw new Error(`unknown queue op "${op}"`);
    if (op === 'steer-all' || op === 'run-all') return JSON.stringify({ type: 'queue-op', op, id: null });
    if (!id) throw new Error(`queue op "${op}" needs an item id`);
    if (op === 'reorder') {
      // `afterId: null` is a POSITION (the front), not a missing argument —
      // an absent key would be an ambiguity the wrapper cannot resolve.
      if (afterId === undefined) throw new Error('queue op "reorder" needs an anchor (afterId, or null for the front of the queue)');
      const anchor = afterId === null ? null : String(afterId);
      if (anchor === id) throw new Error('queue op "reorder" cannot anchor an item to itself');
      return JSON.stringify({ type: 'queue-op', op, id, afterId: anchor });
    }
    if (op === 'edit') {
      if (typeof text !== 'string' || !text.trim()) throw new Error('queue op "edit" needs the new message text');
      return JSON.stringify({ type: 'queue-op', op, id, text });
    }
    return JSON.stringify({ type: 'queue-op', op, id });
  }

  // RE-STATE THE QUEUE (2026-09-09). Not a queue OP — it changes nothing and
  // carries no item: it asks the wrapper to publish `meta.queue` again with
  // `force`, because `publishQueue` dedups on its own fingerprint and a server
  // that lost the last publication to the stdout ring cannot be told "still
  // empty" any other way. No id, no text, so no size gate is possible or
  // needed.
  formatQueueResync() {
    return JSON.stringify({ type: 'queue-resync' });
  }

  /** Build a preview user message for buffer before JSONL arrives.
   *  ITS CONTENT MUST BE SPELLED EXACTLY AS THE WRAPPER SPELLS ITS OWN COPY
   *  (round 3, 2026-09-07): both carry the same `webui_msg_id`, so the merge
   *  keeps whichever lands FIRST — this one — and the ours↔codex twin claim is
   *  then made under THIS record's content key. Codex persists what
   *  `encodeUserInput` sent, i.e. the TEXT first and attachments after it
   *  (measured: 0 of 5489 user records in the local rollout corpus begin with
   *  an `input_image`), so an attachments-first preview meant every message
   *  with an image rendered twice after a reload no matter what the wrapper
   *  wrote. test-codex-p2-wrapper ⑦ compares the two producers byte for byte. */
  static _buildUserPreview(rawText, msgId) {
    let text = typeof rawText === 'string' ? rawText : '';
    const attachments = [];
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === 'user' && parsed.message) {
        text = '';
        for (const block of parsed.message.content || []) {
          if (block.type === 'text' && block.text) text = block.text;
          if (block.type === 'image' && block.source?.data) {
            attachments.push({ type: 'input_image', image_url: `data:${block.source.media_type || 'image/png'};base64,${block.source.data}` });
          }
        }
      }
    } catch {}
    const content = [
      ...(text ? [{ type: 'input_text', text }] : []),
      ...attachments.map(a => ({ type: 'input_image', image_url: a.image_url })),
    ];
    if (!content.length) return null;
    return { timestamp: new Date().toISOString(), type: 'response_item', _fromWebui: true, payload: { type: 'message', role: 'user', webui_msg_id: msgId || '', content } };
  }
}

// transcriptPool: the pool itself (test-codex-attach-off-loop ⑤ reads its routing)
module.exports = { codexTranscriptIndex, transcriptPool: _transcriptPoolGet,
  pagedReadStats, codexParsesOnLoop, _setHistoryHeapMbForTest, codexHistoryMergedPagedAsync, mergedReadStats, // B-f3f9
  _setTranscriptPoolForTest, // row B-422c's legs
  readJsonlTailSliced, readCodexRolloutSliced, slicedRoadFor, readerRefusedAnswer, readerCauseOf, readerCauseFor, fileStorageHung, fileRefused, poolRefusing, poolGone, storageRetryDue, storageRetryClaim, nextReadAt, slicedState, _setSlicedForTest, // row B-422c unit 2: the histories' sliced road
  jsonlGapInfoAsync, readJsonlLineRangeAsync, scanJsonlUserTurnsAsync, readJsonlBoundedParsedAsync, readJsonlBoundedParsedPagedAsync, readJsonlTailAsync, probeTranscriptAsync, transcriptWorkerCall,
  plainJsonlPath, fileIsZst, ZST_MAX_PLAIN, deriveCodexSessionName, CODEX_ROLLOUT_RE, lastCodexTurnContextAsync,
  CODEX_SESSIONS_DIR,
  CodexAdapter,
  findCodexSessionJsonlPath, findCodexSessionJsonlPathAsync, codexRolloutLookup, codexRolloutLookupAsync, warmCodexRolloutIndex, refreshCodexRolloutIndex, rolloutIndexEpoch, rolloutIndexStats, _resetRolloutIndexForTests,   // B-a60e remainder: THE ROLLOUT INDEX
  CODEX_NONE_FRESH_MS, CODEX_ASK_BOUND_MS,
  normalizeCodexSource,
  parseCodexSessionJsonl,
  extractCodexThreadMeta,
  readJsonlBounded,
  readJsonlTail, jsonlTailLower, JSONL_TAIL_BYTES,
  jsonlGapInfo,
  readJsonlLineRange,
  scanJsonlUserTurns,
  searchJsonlFull,
  searchJsonlFullStream,
};
