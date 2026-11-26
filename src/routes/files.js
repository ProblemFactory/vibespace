/**
 * File System API routes — file browsing, content read/write, upload/download,
 * clipboard image paste, binary chunks, Excel/Word preview.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { serviceEnv } = require('../agent-env.js');
const { childStarter } = require('../server/child-starter');   // the paste's clipboard reads start in the small process, never the hub (r1066)
const multer = require('multer');

const router = express.Router();

function expandTilde(p) {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.substring(1));
  return p;
}
function safePath(p) { return path.resolve(expandTilde(p)); }

// Files cross-host: when ?host=<id> is present, dispatch to the RemoteFs
// (ssh-backed) instead of the local filesystem. rfs(req) returns the
// RemoteFs instance + host id, or null for local.
function rfs(req) {
  const host = req.query.host || req.body?.host;
  if (!host) return null;
  const inst = remoteFsFor(req);
  return inst ? { fs: inst, host } : null;
}
/** lane device-act-audit: the RemoteFs bound to THIS request's subject — every act it sends a device names the person's
 *  sign-in (src/device-audit.js byOfReq). */
function remoteFsFor(req) {
  const inst = req.app.locals.getRemoteFs?.();
  return inst && typeof inst.as === 'function' ? inst.as(require('../device-audit.js').byOfReq(req)) : inst || null;
}
// remote paths are used verbatim (no local path.resolve — they live on the
// remote); '~' expands remotely inside RemoteFs
const remotePath = (p) => String(p || '~');
// A remote STREAM helper that throws synchronously inside an async route is a
// request NEVER ANSWERED: express 4 does not see a rejected handler and
// server.js's unhandledRejection only logs. It happened twice — the dial
// `_spawn` (B-0d70 review) and a CJK name in the attachment header (lane
// raw-filename r2: remote Download of `截图.png` hung). Every remote streaming
// dispatch goes through here, so such a throw is an answer (502, no name).
function remoteStream(res, fn) {
  try { return fn(); }
  catch (e) {
    if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.status(502).json({ error: String((e && e.message) || e) }); }
    else { try { res.end(); } catch { } }
  }
}

// ── SafeFs facade (2.109.0) ──
// LOCAL (non-?host=) filesystem calls run in a dedicated worker_threads pool
// (own thread, per-op deadline, kill+respawn) so a hung mount can NEVER starve
// the main event loop / shared libuv pool again — the structural fix behind the
// tactical canary/watchdog/circuit-breaker. path.resolve / safePath / traversal
// checks stay HERE in the main process; the worker only executes the already-
// resolved absolute path. app.locals.safeFs is wired in server.js; if the pool
// couldn't start, sfs() REFUSES by name (B-3b03: a path op never runs on the main thread). Timeouts surface as
// err.status===503 → the routes map that to a "storage not responding" reply.
const { parseArchiveListing, fsErrorBody } = require('../remote-fs'); // verify-r2: a Files refusal travels as a code the client words
const { contentDisposition, fileNameOf } = require('../file-disposition');
// B-23e5, 主开发's r275 / r316 / r1368: A PERSON'S OWN PRESS IS TRIED — the page marks a person's press with this header (the Files
// window's Refresh, a folder / a bookmark opened, the path field's Enter, Up, the context menu's Open, the code editor's open / pressed
// reload / save, the document window's and the pane editor's saves — test-safe-fs-path-memory's door census); such a call is asked
// ONCE despite the pool's memory of a dead path. Every other request — a poll, a watcher, an auto reload, an agent's loop — carries
// none. THE MARK IS A PERSON'S PRESS AND NOTHING ELSE (r1368 / r1396): the header, AND no bearer (an agent's, a job's or an automation
// key's token never sets it), AND not a FOREIGN page (write-origin.js `foreignPageWhy`: a stated same-origin site decides alone — the
// browser's own word, whatever origin a proxy shows; any other stated site is foreign; with no site stated, a stated origin must be ours;
// neither stated — a plain-http LAN address — the custom header itself is the proof: no other site can send it without a preflight
// the hub never grants). It buys ONE try despite the memory and nothing else: no deadline, size or count, never an access door.
const { pressBearer, foreignPageWhy, ownOriginOf } = require('../write-origin');
const ATTENDED_HEADER = 'x-vibespace-attended';
const attendedOf = (req) => !!(req && typeof req.get === 'function' && req.get(ATTENDED_HEADER) === '1'
  && !pressBearer(req.headers) && !foreignPageWhy(req.headers, ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) })));
/** the pool with NO mark — for a helper built once that closes over its first request (the folder field's dir slice): it must never
 *  read the mark from that request (r336) */
function sfsPlain(req) {
  return req.app.locals.safeFs || { call: async () => { throw require('../safe-fs').noWorkerRefusal('the file pool'); } };   // B-3b03: no pool ⇒ refused by name, never an in-main run
}
function sfs(req) {
  const pool = sfsPlain(req);
  if (!req.app.locals.safeFs) return pool;
  return attendedOf(req) ? { call: (op, payload, opts = {}) => pool.call(op, payload, { ...opts, attended: true }) } : pool;
}

// A mount-guard refusal SAID (lane file-preview-mount, userW inc-mvq4hn9x: «Error: refused: a synchronous fs call on a
// storage mount from the main thread» on opening a workbook from chat). src/server/sync-fs-witness.js refuses a SYNC fs
// call on a storage mount from the main thread (EVSMOUNTSYNC) — right, and its journal line names the call site. An
// answer of a PREVIEW read route (PREVIEW_READS — r2: never a write, rename, mkdir…, which keep their own words,
// err.message + roMountHint) that still carries the refusal is re-said: the storage by name, why, the way on — code
// storage_sync_refused (the client's fsErrorText words it in the reader's language; `error` = the English for agents).
const GUARD_REFUSAL = require('../server/sync-fs-witness').REFUSAL;
const SP = require('../storage-path');
function syncRefusedBody(req) {
  let row = null;
  for (const raw of [req.query.path, req.query.dir, req.body?.path, req.body?.src, req.body?.dest, req.body?.destDir]) {
    if (row || typeof raw !== 'string' || !raw) continue;
    try { row = SP.storageRootOf(safePath(raw)); } catch { }
  }
  const mount = row ? (row.name || path.basename(row.root)) : '';
  const on = mount ? `this file is on the storage «${mount}»` : 'this file is on a storage';
  // 主开发's merged .399 read: the person's words — what it is, what cannot be done here, the way on; no version (a «being fixed
  // (x.y.z)» was false on the hub that ran x.y.z) and none of the hub's inside (why: the guard keeps every storage read off the
  // main thread, and this view reads there — docs/kb-file-structure.md, src/routes/files.js)
  return { error: `${on}, and this kind of preview cannot be shown for a file on a storage yet — download it, or copy it to a local folder and open it there`,
    code: 'storage_sync_refused', params: { mount } };
}
const PREVIEW_READS = new Set(['/api/file/info', '/api/file/content', '/api/file/binary', '/api/file/csv', '/api/file/excel', '/api/file/docx']);
router.use((req, res, next) => {
  if (req.method !== 'GET' || !PREVIEW_READS.has(req.path.replace(/\/+$/, ''))) return next();
  const json = res.json;
  res.json = function (body) {
    if (body && typeof body.error === 'string' && !body.code && body.error.includes(GUARD_REFUSAL)) body = syncRefusedBody(req);
    return json.call(this, body);
  };
  next();
});
// B-3b03 (lane hub-loop-stalls): the file pool REFUSES a call while it has no live worker (src/safe-fs.js — never an op on the
// main thread). Every local answer of this router that carries that refusal is SAID in a person's words with its code — the
// Files window, a file's view, the chat's link-open and the downloads word storage_no_worker in the reader's language
// (fsErrorText); the folder field shows `error` after «The machine did not answer:» — never the pool's inside words, never cut.
const FILE_POOL_REFUSED = require('../safe-fs').noWorkerRefusal('the file pool').message.split(' is running')[0];   // «no worker of the file pool» — another pool's refusal keeps its own words
const PATH_HUNG_HEAD = require('../safe-fs').PATH_HUNG.message.split(' {s}')[0];   // B-23e5: «this folder or file did not answer in time and is not asked again for»
const STORAGE_PATH_HUNG = 'this folder or file did not answer in time — try again in {s} s';
// B-23e5's remainder (r1378 (2)): a call at or under a path a person's press is still trying — one worker on it, never two
const PATH_TRYING_HEAD = require('../safe-fs').PATH_TRYING.message.split(': {path}')[0];
const STORAGE_PATH_TRYING = 'this folder or file is still being tried — wait for the answer to the first press';
const NO_IDLE_HEAD = require('../safe-fs').NO_IDLE.message.split(' {pool}')[0];   // r1733 (6): «every worker of» — the looks hold every worker
const STORAGE_BUSY = 'the file readers are all busy — try again in a moment';
const STORAGE_NO_WORKER = 'the file readers are restarting — try again in a moment';   // a deadline kill, a crash, a worker that could not start — each is retried (no pool at all: server.js's boot line)
router.use((req, res, next) => {
  const json = res.json;
  res.json = function (body) {
    if (body && typeof body.error === 'string' && !body.code && body.error.startsWith(FILE_POOL_REFUSED)) body = { ...body, error: STORAGE_NO_WORKER, code: 'storage_no_worker' };
    else if (body && typeof body.error === 'string' && !body.code && body.error.startsWith(PATH_HUNG_HEAD)) {   // B-23e5: a dead path the pool remembers
      const s = Number((/not asked again for (\d+) s/.exec(body.error) || [])[1]) || 30;
      body = { ...body, error: STORAGE_PATH_HUNG.replace('{s}', String(s)), code: 'storage_path_hung', params: { s } };
    } else if (body && typeof body.error === 'string' && !body.code && body.error.startsWith(PATH_TRYING_HEAD)) body = { ...body, error: STORAGE_PATH_TRYING, code: 'storage_path_trying' };
    else if (body && typeof body.error === 'string' && !body.code && body.error.startsWith(NO_IDLE_HEAD)) body = { ...body, error: STORAGE_BUSY, code: 'storage_busy' };
    return json.call(this, body);
  };
  next();
});

// Hung-mount circuit breaker (2.108.4): while a mount is CONNECTING (IO-probe
// window) or was detected hanging, every file op under its root fails fast —
// an open explorer window pointed at a dead mountpoint used to stuff the
// libuv threadpool with never-returning fs ops and starve the whole server
// (real outage; the watchdog reclaims the mount but in-flight ops drain for
// minutes). Remote (?host=) ops don't touch the local fs and pass through.
router.use((req, res, next) => {
  const mounts = req.app.locals.mounts;
  if (!mounts?.pathBlocked) return next();
  const raw = req.query.path || req.query.dir || req.body?.path || req.body?.destDir || req.body?.dest || req.body?.src;
  if (!raw || req.query.host || req.body?.host) return next();
  let p; try { p = safePath(String(raw)); } catch { return next(); }
  if (mounts.pathBlocked(p)) {
    // B-5ce7 cure: a PARKED mount says so and names its doors (nothing reconnects it by itself — «try again» would be false)
    const pk = mounts.parkedAt?.(p);
    if (pk) return res.status(503).json({ error: require('../mount-door.js').parkedSentence(pk.name), code: 'storage_parked', params: { name: pk.name } });
    return res.status(503).json({ error: require('../mount-door.js').sentenceFor(p) });   // the door's own words (one spelling)
  }
  // A registered storage that is NOT mounted: its mount point is a bare local
  // directory — anything written there is stranded (and blocks the next
  // connect). Refuse instead of pretending the folder is the storage.
  const shadow = mounts.shadowedBy?.(p);
  if (shadow) {
    return res.status(503).json({ error: `“${shadow.name}” is not connected — this folder is its mount point; connect the storage before using it.` });
  }
  next();
});
// B-fcc7 (the remainder): a machine's PULL folder while it is not mounted (its machine offline, a heal pending) is a bare local
// folder — an empty one that reads as «the machine's files are gone», a write there stranded under the next mount. Refused with
// the row's state, as a code the client words in the reader's language (fsErrorText); its own pass, so it never waits on the
// storage manager above. EVERY path the request names (its read 2: a copy, a move or a compress FROM the bare folder succeeded
// empty when only its destination was asked) — a remote side (?host, srcHost, destHost) is not this machine's; an upload's
// multipart destDir is read inside its route, so an upload is not refused here. B-02f6 remainder: ASYNC — a writer refused under a
// record whose real folder never resolved waits for the proof (pullShadowOfReal: the record's real folder by the starter, kept)
router.use(async (req, res, next) => {
  const q = req.query || {}, b = req.body || {};
  if (q.host || b.host) return next();
  // what the request READS or takes away — a folder probed empty is refused (one holding files shows them, a stray can be
  // deleted or moved out) — and what it ADDS there: refused under ANY such folder (read 4: hidden under the next mount, or
  // blocking it). A POST's / PUT's `path` is where it writes; a GET's or a DELETE's is what it reads or removes
  const route = String(req.path || '').replace(/\/+$/, '').toLowerCase();   // as express matches it: no trailing slash, any case (read 6)
  const writes = req.method === 'POST' && (PATH_WRITES.has(route) || /^\/api\/tasks\/[^/]+\/export$/.test(route));   // read 5: only the routes whose `path` IS what they write (an archive's path is read); read 6: a task group's export writes its path
  const reads = [q.path, q.dir, b.oldPath, ...(Array.isArray(b.paths) ? b.paths : []), b.srcHost ? null : b.src, writes ? null : b.path];
  const adds = [b.newPath, b.destHost ? null : b.dest, b.destHost ? null : b.destDir, writes ? b.path : null];
  // read 5: a removal or a move OUT of such a folder (a stray cleared) has it probed again once it answered — never the sweep's wait
  if (req.method !== 'GET' && req.method !== 'HEAD') res.on('finish', () => { if (res.statusCode < 300) for (const raw of reads) { if (typeof raw === 'string' && raw) { try { require('../machine-mounts.js').pullTouched(safePath(raw)); } catch { } } } });
  for (const [list, writer] of [[reads, false], [adds, true]]) {
    for (const raw of list) {
      if (typeof raw !== 'string' || !raw) continue;
      let p; try { p = safePath(raw); } catch { continue; }
      const pull = await require('../machine-mounts.js').pullShadowOfReal(p, { writer });
      if (pull) return res.status(503).json(pullShadowBody(pull));
    }
  }
  next();
});
const PATH_WRITES = new Set(['/api/mkdir', '/api/file/write']);   // the routes whose body `path` is what they CREATE
const pullShadowBody = (s) => require('../machine-mounts.js').pullShadowBody(s);   // the words live with the door (WebDAV says the same)

router.get('/api/home', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json({ home: await R.fs.home(R.host) }); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  // repoDir: where THIS server runs from — the ⚙ "Update VibeSpace…" action
  // runs scripts/update.sh there (the client can't know the install path).
  // harnesses: installed-state per backend (S8) — the New Session picker hides
  // an ACP harness whose CLI is not on this machine (claude/codex/shell always listed)
  let harnesses = null;
  try { harnesses = typeof req.app.locals.harnessAvailability === 'function' ? req.app.locals.harnessAvailability() : null; } catch { harnesses = null; }
  // zone (lane agent-context-owner-facts, B-7960 a): the owner's zone as the hub resolved it — the board prints in it
  res.json({ zone: require('../server/owner-facts.js').zone(), home: os.homedir(), authEnabled: !!req.app.locals.authEnabled, ssoEnabled: !!req.app.locals.ssoEnabled, repoDir: path.resolve(__dirname, '..', '..'), publicUrlDefault: process.env.VIBESPACE_PUBLIC_URL || null, instancePublicUrl: req.app.locals.instancePublicUrl || null, harnesses });
});

// THE HOME'S FOLDERS (lane door-day-one-landing — the naive-user studies: every tester typed `…/work` by guessing; the
// folder holding their files was never offered). Each folder of this machine's home with a bounded count of the files it
// holds — the New Session dialog's and the tour's folder chips (src/day-one.js folderChips orders them). Local only (a
// remote machine's chips stay its recent folders); walked in the SafeFs pool (a hung mount is named, never walked); one
// answer is kept 10 s, so a dialog opened twice walks once.
let _homeFolders = { at: 0, body: null };
router.get('/api/home-folders', async (req, res) => {
  if (req.query.host) return res.json({ folders: [], unsupported: 'remote' });
  const now = Date.now();
  if (_homeFolders.body && now - _homeFolders.at < 10e3) return res.json(_homeFolders.body);
  const home = os.homedir();
  try {
    const { folders } = await sfs(req).call('folderCensus', { path: home });
    // lane path-field (study round 4: a fresh pod PRESELECTED ~/vibespace, the product's own checkout — it holds the most
    // files): the instance's own checkout, its data dir and dot-folders are never offered (PURE isExcludedPath)
    // (B-5561 / r1748 (a): each home folder's checkout fact is its OWN call, behind — the exclusion is waited for inside a bound, and an
    // answer built while a fact was still out is never kept: the next ask asks again)
    const hac = new AbortController(); res.on('close', () => { if (!res.writableEnded) hac.abort(); });   // (r2178 (4): the dialog closed: the wait ends)
    const sw = await dirSliceOf(req).selfWhole(1500, hac.signal).catch(() => null);
    const self = sw && sw.v;
    const { isExcludedPath } = require('../path-candidates.js');
    const kept = (Array.isArray(folders) ? folders : []).filter((f) => !(f && f.path && isExcludedPath(f.path, self || { home, roots: [] })));
    const body = { home, folders: kept };
    _homeFolders = sw && sw.whole ? { at: now, body } : { at: 0, body: null };
    res.json(body);
  } catch (e) { res.status(e.status || 500).json({ home, folders: [], error: String((e && e.message) || e).slice(0, 160) }); }
});

// Bounded filename search — the chat's relative-path resolver's last resort
// (`SCRIPTS.md` clicked in a reply, not directly under the session cwd). Depth-
// capped, dep/VCS dirs pruned, 3s kill, first 16 hits — a user-initiated click,
// never a background scan. Local machine only (remote sessions return empty).
router.get('/api/file/locate', (req, res) => {
  // Remote sessions have no bounded-find channel here — say UNSUPPORTED
  // instead of a bare empty result, which read as "the file doesn't exist"
  // and made the feature look broken rather than absent on remote hosts.
  if (req.query.host) return res.json({ hits: [], unsupported: 'remote' });
  const name = String(req.query.name || '').trim();
  const root = path.resolve(String(req.query.root || os.homedir()));
  const type = req.query.type === 'd' ? 'd' : 'f';
  if (!name || name.includes('/') || name.includes('..') || name.length > 120) return res.status(400).json({ error: 'bad name' });
  const args = [root, '-maxdepth', '5',
    '(', '-name', 'node_modules', '-o', '-name', '.git', '-o', '-name', '.venv', '-o', '-name', '__pycache__', ')', '-prune',
    '-o', '-name', name, '-type', type, '-print'];
  execFile('find', args, { timeout: 3000, maxBuffer: 256 * 1024 }, (err, stdout) => {
    // find exits non-zero on permission noise — hits on stdout still count
    const hits = String(stdout || '').split('\n').filter(Boolean).slice(0, 16);
    res.json({ hits });
  });
});

// System monospace fonts via fc-list (cached). B-360d part 1 (主开发 r2303): the lister runs THROUGH THE HUB'S STARTER
// (src/server/child-starter.js: a small process forks it, never the hub), bounded 3 s, never on the loop: run synchronously it
// held the loop for its whole run at the first ask after a start (25–54 ms on a stand-in). The list is KEPT as before (a failure
// is not: the next ask tries again); asks while it runs share the one run. Gated by scripts/test-first-ask-children.mjs.
let _cachedMonoFonts = null, _monoFontsAsk = null;
router.get('/api/fonts', async (req, res) => {
  if (_cachedMonoFonts) return res.json({ fonts: _cachedMonoFonts });
  _monoFontsAsk = _monoFontsAsk || childStarter().run('fc-list', [':spacing=mono', 'family'], { timeoutMs: 3000, capture: true, envAdd: { PATH: process.env.PATH || '' } })
    .then((r) => {
      if (!r || r.code !== 0 || r.timedOut || r.overflow || r.unknown) return null;
      const fonts = [...new Set(
        String(r.stdout || '').trim().split('\n')
          .map(line => line.split(',')[0].trim())
          .filter(f => f && !/emoji|sign/i.test(f))
      )].sort((a, b) => a.localeCompare(b));
      _cachedMonoFonts = fonts;
      return fonts;
    }, () => null)
    .finally(() => { _monoFontsAsk = null; });
  res.json({ fonts: (await _monoFontsAsk) || [] });
});

// THE PATH FIELD's answer (lane path-field): one dir-slice per server (src/server/dir-slice.js — the listing cache per
// folder, the folder index, the exclusion facts), the mounts read at most every 5 s.
function dirSliceOf(req) {
  const L = req.app.locals;
  if (!L._dirSlice) {
    let mc = { at: 0, rows: [] };
    L._dirSlice = require('../server/dir-slice.js').create({
      call: (op, payload, opts) => sfsPlain(req).call(op, payload, opts),   // built ONCE over the first request: never its mark (r336); the field's calls ride idleOnly (B-d833)
      // (B-d833: a BLOCKED mount is no row, but the walk skips it: every mounted row is handed, `blocked` said)
      mounts: () => {
        if (Date.now() - mc.at > 5000) { let rows = []; try { rows = (L.mounts?.list?.() || []).filter((m) => m && m.mounted && m.path).map((m) => ({ ...m, blocked: !!L.mounts?.pathBlocked?.(m.path) })); } catch { rows = []; } mc = { at: Date.now(), rows }; }
        return mc.rows;
      },
    });
  }
  return L._dirSlice;
}
const jsonList = (v) => { if (Array.isArray(v)) return v.map(String); if (typeof v !== 'string' || !v) return []; try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : []; } catch { return [v]; } };

// Directory autocomplete — returns dirs matching partial path, with 500ms timeout.
// lane path-field: with `bases` / `q` / `probe` / `kind` (the path field asks) the answer ALSO carries the listing slice
// (PURE src/path-candidates.js sliceListing: each base listed, the typed parent against each base, the fuzzy index hits,
// each probed folder's facts — exists / git / fileCount / mtime), `self` (the exclusion facts) and `took`, within the
// 500 ms budget (`partial` when the machine was slower; the caches still fill). `suggestions` is answered as before.
router.get('/api/dir-complete', async (req, res) => {
  const R = rfs(req);
  const sliced = req.query.bases != null || req.query.q != null || req.query.probe != null || req.query.kind != null;
  if (R && sliced) {
    const guard = setTimeout(() => { if (!res.headersSent) res.json({ suggestions: [], partial: true, error: 'machine did not answer in time' }); }, 2500);
    // r1633 (1): the page's abort (a newer ask of the same field) ends a paired machine's late wait at once
    const ac = new AbortController(); if (typeof res.on === 'function') res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
      const ans = await R.fs.dirSlice(R.host, { text: String(req.query.path || ''), bases: jsonList(req.query.bases), probe: jsonList(req.query.probe), q: String(req.query.q || ''), kind: String(req.query.kind || 'folder'), press: req.query.press === '1', late: req.query.late === '1' }, { signal: ac.signal });
      clearTimeout(guard);
      if (!res.headersSent) res.json(ans);
    } catch (e) {
      clearTimeout(guard);
      if (!res.headersSent) res.json({ suggestions: [], error: String(e.message || e).slice(0, 120), ...require('../hosts.js').refusalBody(e) });
    }
    return;
  }
  if (!R && sliced) {
    try {
      // B-d833 M1: the page's abort (a field removed, a text that moved) closes this response — the field's re-asks end with it
      const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
      const ans = await dirSliceOf(req).slice({ text: String(req.query.path || ''), bases: jsonList(req.query.bases), probe: jsonList(req.query.probe), press: req.query.press === '1', late: req.query.late === '1', q: String(req.query.q || ''), kind: String(req.query.kind || 'folder'), budgetMs: 450, signal: ac.signal });   // r1633: `late` = the page's quiet re-ask (the late-facts wait)
      return res.json({ suggestions: require('../path-candidates.js').legacySuggestions(ans.listing, String(req.query.path || '')), ...ans });
    } catch (e) { return res.json({ suggestions: [], error: String((e && e.message) || e).slice(0, 120) }); }
  }
  if (R) {
    // A down/lagging machine was indistinguishable from "no matching folders":
    // every failure mapped to an empty list (so did the layers below), and the
    // remote leg could dangle ~6s where the local branch has a 500ms budget.
    // Bound it and NAME the failure so the caller can say so instead of
    // silently showing no completions.
    const guard = setTimeout(() => { if (!res.headersSent) res.json({ suggestions: [], error: 'machine did not answer in time' }); }, 2000);
    try {
      const suggestions = await R.fs.dirComplete(R.host, req.query.path || '');
      clearTimeout(guard);
      if (!res.headersSent) res.json({ suggestions });
    } catch (e) {
      clearTimeout(guard);
      if (!res.headersSent) res.json({ suggestions: [], error: String(e.message || e).slice(0, 120), ...require('../hosts.js').refusalBody(e) });
    }
    return;
  }
  const input = req.query.path || '';
  // row B-422c, second half (主开发 r3499 / r3507; lane mask-value-shape): the legacy local answer NAMES a refusal, as the remote one
  // does — its bound is `partial` with its words, a refusal is its error and code; only a parent that does not exist (ENOENT /
  // ENOTDIR) is a plain empty answer («nothing matches» is true then). The reply gains fields and loses none.
  const timeout = setTimeout(() => { if (!res.headersSent) res.json({ suggestions: [], partial: true, error: 'storage did not answer in time — try again in a moment' }); }, 500);

  try {
    const expanded = expandTilde(input);
    const lastSlash = expanded.lastIndexOf('/');
    const parentDir = lastSlash >= 0 ? expanded.substring(0, lastSlash) || '/' : '.';
    const prefix = lastSlash >= 0 ? expanded.substring(lastSlash + 1).toLowerCase() : expanded.toLowerCase();
    const resolved = path.resolve(parentDir);

    const { entries } = await sfs(req).call('readdirNames', { path: resolved });
    const dirs = [];
    for (const e of entries) {
      if (!e.isDirectory) continue;
      if (e.name.startsWith('.') && !prefix.startsWith('.')) continue;
      if (prefix && !e.name.toLowerCase().startsWith(prefix)) continue;
      dirs.push(path.join(resolved, e.name));
      if (dirs.length >= 20) break;
    }
    clearTimeout(timeout);
    if (!res.headersSent) res.json({ suggestions: dirs });
  } catch (e) {
    clearTimeout(timeout);
    if (res.headersSent) return;
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return res.json({ suggestions: [] });
    const down = e && (e.code === 'no-worker' || e.code === 'no-idle-worker' || e.safeFsTimeout === true);
    res.json({ suggestions: [], error: down ? (e.safeFsTimeout === true && !e.noWorker ? 'storage did not answer in time — try again in a moment' : 'not read now: its reader is restarting — try again in a moment') : String((e && e.message) || e).slice(0, 120), code: (e && e.code) || (e && e.safeFsTimeout ? 'timeout' : 'error') });
  }
});

router.get('/api/files', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.list(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  const dirPath = safePath(req.query.path || os.homedir());
  try {
    const { items } = await sfs(req).call('listDir', { path: dirPath });
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ path: dirPath, items });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }   // B-3b03: a refusal of the pool is worded by the router (storage_no_worker)
});

// File info (size + binary detection) without reading full content
router.get('/api/file/info', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.info(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  const filePath = safePath(req.query.path);
  try {
    const info = await sfs(req).call('fileInfo', { path: filePath });
    res.json({ path: filePath, size: info.size, modified: info.modified, isBinary: info.isBinary, isDirectory: info.isDirectory });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// Read text file content (limit raised to 10MB)
router.get('/api/file/content', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.readText(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json({ ...fsErrorBody(e), size: e.size, ...(e && e.code === 'file_not_there' ? { code: 'file_not_there' } : {}) }); } }   // r2221 ★7: the machine's own «not there», typed
  const filePath = safePath(req.query.path);
  try {
    const r = await sfs(req).call('readText', { path: filePath, maxSize: 10 * 1024 * 1024 });
    res.json({ path: filePath, content: r.content, size: r.size });
  } catch (err) { res.status(err.status || 400).json({ error: err.message, size: err.size, ...(err && err.code === 'ENOENT' ? { code: 'file_not_there' } : {}) }); }   // r2221 ★7: the read's OWN verdict that the entry does not exist, typed
});

// Read binary file chunk as raw bytes
router.get('/api/file/binary', async (req, res) => {
  const offset = parseInt(req.query.offset) || 0;
  const length = Math.min(parseInt(req.query.length) || 65536, 1048576); // max 1MB per chunk
  const R = rfs(req);
  if (R) {
    try {
      const info = await R.fs.info(R.host, remotePath(req.query.path));
      const buf = await R.fs.readBinary(R.host, remotePath(req.query.path), offset, length);
      res.set({ 'Content-Type': 'application/octet-stream', 'X-File-Size': info.size, 'X-Offset': offset, 'X-Bytes-Read': buf.length });
      return res.send(buf);
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const filePath = safePath(req.query.path);
  try {
    const r = await sfs(req).call('readChunk', { path: filePath, offset, length });
    res.set({ 'Content-Type': 'application/octet-stream', 'X-File-Size': r.size, 'X-Offset': offset, 'X-Bytes-Read': r.bytesRead });
    res.send(Buffer.from(r.buffer, 0, r.bytesRead));
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// Serve raw files (PDF, images, etc.) — NAMED (lane raw-filename, userW 2026-09-28
// "我从vibespace预览里下载文件，文件名都叫raw"): every preview element (<img>, <video>,
// <audio>, the PDF <iframe>, the chat's thumbs + overlay, the jobs panel's pictures)
// streams from this URL, and a response without a Content-Disposition is saved under
// the URL's last path segment — `raw`. `inline` keeps the preview a preview; the name
// rides only a SUCCESSFUL transfer (sendFile's `headers` are set on its 'headers'
// event, as res.download does), so a 404 / 403 answers byte-for-byte as before.
// The remote branch names the file inside RemoteFs.downloadTo (inline unless
// attachment). Census of every byte-serving route: scripts/test-raw-filename.mjs.
router.get('/api/file/raw', async (req, res) => {
  const R = rfs(req);
  if (R) return remoteStream(res, () => R.fs.downloadTo(R.host, remotePath(req.query.path), res));
  const filePath = safePath(req.query.path);
  // Fail-fast on a wedged mount (sendFile itself streams via main-thread fs and
  // can't be pooled without a rewrite); a missing file (non-503) falls through
  // to sendFile's own 404 so behaviour is unchanged for the normal cases.
  try { await sfs(req).call('stat', { path: filePath }, { timeoutMs: 8000 }); }
  catch (e) { if (e.status === 503) return res.status(503).json({ error: e.code === 'no-worker' || e.code === 'path-hung' || e.code === 'path-trying' || e.code === 'no-idle-worker' ? e.message : e.code === 'storage-blocked' && e.message ? e.message : 'Storage not responding — try again in a moment.' }); }   // the door's own words (a parked mount's); B-3b03 follow-up: the pool's refusal goes to the router's words (storage_no_worker)
  const named = contentDisposition(fileNameOf(filePath), 'inline');
  // dotfiles 'allow' (r2): without it send's LEGACY rule answered 404 for any basename starting
  // with '.', so `.env.png` could not be previewed — this route serves the paths the user opens
  // (the content route reads dotfiles too); the web-root protection that rule exists for is moot
  try {
    res.sendFile(filePath, { dotfiles: 'allow', ...(named ? { headers: { 'Content-Disposition': named } } : {}) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Path-based file serving — enables <base href> for HTML preview.
// /api/file/serve/home/user/project/style.css → serves /home/user/project/style.css
// This allows relative paths in HTML previews (CSS, images, fonts, JS) to resolve correctly.
router.get('/api/file/serve/*', async (req, res) => {
  const filePath = '/' + req.params[0]; // reconstruct absolute path
  try {
    if (!(await sfs(req).call('exists', { path: filePath })).exists) return res.status(404).end();
    res.sendFile(filePath);
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// Download file
router.get('/api/download', async (req, res) => {
  const R = rfs(req);
  if (R) return remoteStream(res, () => R.fs.downloadTo(R.host, remotePath(req.query.path), res, { attachment: true }));
  const filePath = safePath(req.query.path);
  try { await sfs(req).call('stat', { path: filePath }, { timeoutMs: 8000 }); }
  catch (e) { if (e.status === 503) return res.status(503).json({ error: e.code === 'no-worker' || e.code === 'path-hung' || e.code === 'path-trying' || e.code === 'no-idle-worker' ? e.message : e.code === 'storage-blocked' && e.message ? e.message : 'Storage not responding — try again in a moment.' }); }   // the door's own words (a parked mount's); B-3b03 follow-up: the pool's refusal goes to the router's words (storage_no_worker)
  try {
    res.download(filePath, { dotfiles: 'allow' }); // r2: a `.env` Download was send's legacy-dotfile 404
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Preview Excel files
// Remote spreadsheet/doc/CSV previews (B-b87b): the parsers (xlsx/mammoth/
// csvRange) are LOCAL-only — pull the remote file into a size+TTL-validated
// local temp and run the SAME local parse. The cache matters for the CSV
// pager, which re-requests row ranges on every scroll.
const _remoteTmpCache = new Map(); // `${host}|${path}` → {tmp, size, at}
async function remoteToLocalTmp(R, p, capBytes) {
  const info = await R.fs.info(R.host, p);
  if ((info.size || 0) > capBytes) {
    const e = new Error(`file too large to preview (${((info.size || 0) / 1048576).toFixed(1)} MB > ${Math.round(capBytes / 1048576)} MB)`);
    e.status = 413; throw e;
  }
  const key = `${R.host}|${p}`;
  const hit = _remoteTmpCache.get(key);
  if (hit && hit.size === info.size && Date.now() - hit.at < 60000 && fs.existsSync(hit.tmp)) return hit.tmp;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webui-remote-'));
  const tmp = path.join(dir, path.basename(p) || 'file');
  await R.fs.fetchToLocal(R.host, p, tmp, capBytes);
  if (hit) { try { fs.rmSync(path.dirname(hit.tmp), { recursive: true }); } catch {} }
  _remoteTmpCache.set(key, { tmp, size: info.size, at: Date.now() });
  if (_remoteTmpCache.size > 8) {
    const [k0, v0] = _remoteTmpCache.entries().next().value;
    try { fs.rmSync(path.dirname(v0.tmp), { recursive: true }); } catch {}
    _remoteTmpCache.delete(k0);
  }
  return tmp;
}

router.get('/api/file/excel', async (req, res) => {
  const R = rfs(req);
  let filePath;
  try { filePath = R ? await remoteToLocalTmp(R, remotePath(req.query.path), 20 * 1024 * 1024) : safePath(req.query.path); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  try {
    // lane file-preview-mount (userW inc-mvq4hn9x, 2.369.358): the workbook is read AND parsed by SafeFs (xlsxSheets, in
    // its PARSE lane — r2: never an IO worker) — XLSX.readFile(path) did the lib's own readFileSync on the main thread
    // (the mount guard refused it on a storage mount) and parsed up to 20 MB in-main. Over the 20 MB cap: refused by name.
    // The parse is bounded (5000 rows, 50 sheets, 256 columns, 2000 characters a cell) and every cut is named
    // (`truncated`, `limits` — the viewer says them); a parse that waited out its turn says so (parse_busy). r3: a request
    // whose client went (the window closed, another workbook clicked) leaves the lane's queue — never parsed ahead of the
    // one on screen (the response closed before its answer ⇒ the signal; src/safe-fs.js _wait).
    const left = new AbortController();
    res.on('close', () => { if (!res.writableFinished) left.abort(); });
    const r = await sfs(req).call('xlsxSheets', { path: filePath, capBytes: 20 * 1024 * 1024, maxRows: 5000 }, { signal: left.signal });
    res.json({ sheets: r.sheets, truncated: r.truncated, limits: r.limits });
  } catch (err) {
    if (err.code === 'request_gone') return;   // nobody is left to answer
    if (err.status === 413) return res.status(413).json({ error: `Excel file too large to preview (${err.size != null ? (err.size / 1048576).toFixed(1) + ' MB > 20 MB' : 'over 20 MB'})` });
    if (err.code === 'parse_busy') return res.status(503).json({ error: err.message, code: 'parse_busy' });
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Preview Word files
router.get('/api/file/docx', async (req, res) => {
  const R = rfs(req);
  let filePath;
  try { filePath = R ? await remoteToLocalTmp(R, remotePath(req.query.path), 20 * 1024 * 1024) : safePath(req.query.path); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  try {
    // lane file-preview-mount: the bytes through the SafeFs pool (readFile, the remote road's 20 MB cap), mammoth parses
    // the BUFFER — its {path} form read the file with the main process's own fs. The conversion stays in-main, bounded by
    // the cap (mammoth is promise-chained; kb-file-structure files.js).
    const r = await sfs(req).call('readFile', { path: filePath, capBytes: 20 * 1024 * 1024 });
    const result = await require('mammoth').convertToHtml({ buffer: Buffer.from(r.buffer) });
    res.json({ html: result.value });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// A write failing inside a READ-ONLY mount should SAY so — the bare
// "EROFS: read-only file system" (or a naked "create failed" toast) doesn't
// tell the user WHY the folder rejects writes (real report: creating a file
// in an RO share showed only "创建文件失败"). Matches the failing path
// against connected read-only mount records; falls back to a generic
// read-only note on EROFS.
function roMountHint(req, p, err) {
  const msg = `${err?.code || ''} ${err?.message || err || ''}`;
  if (!/EROFS|EACCES|EPERM|read-only/i.test(msg)) return '';
  try {
    for (const m of (req.app.locals.mounts?.list?.() || [])) {
      if (m?.mounted && m.mode === 'ro' && m.path && (p === m.path || String(p).startsWith(m.path + '/'))) {
        return ` — “${m.name}” is connected READ-ONLY (this share/mount was set up without write access; files under it can’t be created or changed)`;
      }
    }
  } catch {}
  return /EROFS|read-only/i.test(msg) ? ' — this folder is on a read-only filesystem' : '';
}

router.post('/api/mkdir', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.mkdir(R.host, remotePath(req.body.path))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  try {
    const made = safePath(req.body.path);
    await sfs(req).call('mkdir', { path: made });
    // r4927: the folder field's kept listing above the folder made is dropped at the collector's one door (src/dir-collect.js
    // folderMade) — this hub's collector, when one was made; a paired machine's agent drops its own (src/agentd/agentd.js)
    const ds = req.app.locals && req.app.locals._dirSlice;
    if (ds && typeof ds.folderMade === 'function') { try { ds.folderMade(made); } catch { /* the listing ages out in its 2 s */ } }
    res.json({ success: true });
  }
  catch (err) { res.status(err.status || 400).json({ error: err.message + roMountHint(req, req.body.path, err) }); }
});

// B-23e5 line 311's musts — 主开发 r2221 / r2222 / r2299 LAW A: ONE WRITE OF ONE FILE AT A TIME, AT THE HUB (src/server/file-writes.js):
// a write starts only after the one before it of that file (machine + the path as asked) ENDED — LANDED, FAILED or UNKNOWN; UNKNOWN
// (its deadline, a sibling's, a restarted worker, the device request's timer, a broken link) is answered as unknown, «it may have been
// saved» — never «not saved» — and releases the file like the others; a write the pool shows NEVER STARTED is «not saved: it never
// started». A landed write's reply names the text it saved (length + digest) — the page compares it with its box (law 2).
const FW = require('../server/file-writes');
router.post('/api/file/write', async (req, res) => {
  const R = rfs(req);
  const content = req.body.content || '';
  if (R) {
    const p = remotePath(req.body.path), machine = String(R.host);   // the machine by its id: no hosts lookup on this road (the page words it without the name)
    try { await FW.orderedWrite(`${R.host}\n${p}`, () => R.fs.write(R.host, p, Buffer.from(content))); return res.json({ success: true, saved: FW.savedOf(content) }); }
    catch (e) { const a = FW.answerOf(e, machine); return a ? res.status(a.status).json(a.body) : res.status(400).json(fsErrorBody(e)); }
  }
  try {
    const p = safePath(req.body.path);
    await FW.orderedWrite(`\n${p}`, () => sfs(req).call('writeFile', { path: p, content }));
    res.json({ success: true, saved: FW.savedOf(content) });
  } catch (err) {
    const a = FW.answerOf(err, 'this machine'); if (a) return res.status(a.status).json(a.body);
    res.status(err.status || 400).json({ error: err.message + roMountHint(req, req.body.path, err) });
  }
});

// B-3767 (lane bl-scratch, 2026-11-18): A TEMP FILE THE HUB NAMES — «open in editor» on a chat block. The client used to write
// /tmp/claude-webui/<name> (a machine-wide folder another user's hub may own); the hub now writes it into its own temp folder
// (src/server/hub-tmp.js: <tmp>/vibespace-<uid>-<data hash>/editor) and answers the path; a refusal says the path and why
router.post('/api/file/temp', async (req, res) => {
  const name = String(req.body?.name || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) return res.status(400).json({ error: 'name must be a plain file name', code: 'bad_name' });
  sweepOwnTmp();
  const r = await HUB_TMP.hubTmpDir('editor', { dataDir: HUB_DATA });
  if (!r.dir) return res.status(500).json({ error: `the editor's temp folder: ${r.why}`, code: 'hub_tmp_refused' });
  const p = path.join(r.dir, name);
  try { await sfs(req).call('writeFile', { path: p, content: String(req.body?.content || '') }); res.json({ success: true, path: p }); }
  catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

router.post('/api/rename', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.rename(R.host, remotePath(req.body.oldPath), remotePath(req.body.newPath))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  try { await sfs(req).call('rename', { oldPath: safePath(req.body.oldPath), newPath: safePath(req.body.newPath) }); res.json({ success: true }); }
  catch (err) { res.status(err.status || 400).json({ error: err.message + roMountHint(req, req.body.oldPath, err) }); }
});

router.delete('/api/file', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.remove(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  const filePath = safePath(req.query.path);
  try {
    await sfs(req).call('remove', { path: filePath });
    res.json({ success: true });
  } catch (err) { res.status(err.status || 400).json({ error: err.message + roMountHint(req, filePath, err) }); }
});

// File upload
// B-3767 (lane bl-scratch, 2026-11-18): the multer temp files land in THIS hub's own temp folder (src/server/hub-tmp.js:
// <tmp>/vibespace-<uid>-<data hash>/uploads, 0700, judged before use), never a machine-wide name another user may own; a
// folder it cannot use is the request's error BY NAME (the upload route answers it, never a hang)
const HUB_TMP = require('../server/hub-tmp.js');
const HUB_DATA = path.join(__dirname, '..', '..', 'data');
// B-3767 unit 2 (B-4371): the hub's own temp root gets the tree's age sweep — asked by the roads that write there (upload, temp
// file, paste), at most once in 10 min, off the request (never awaited); what it removed or refused is said in one line
let ownTmpSweptAt = 0;
const sweepOwnTmp = () => {
  const now = Date.now(); if (now - ownTmpSweptAt < 10 * 60 * 1000) return; ownTmpSweptAt = now;
  HUB_TMP.sweepHubTmp({ dataDir: HUB_DATA }).then((r) => { if (r.removed.length || r.refused.length) console.log(`[files] the hub's own temp root: ${r.removed.length} old file(s) removed${r.refused.length ? ' — refused: ' + r.refused.join('; ') : ''}`); }, () => { });
};
const upload = multer({ storage: HUB_TMP.hubTmpStorage(multer, 'uploads', { dataDir: HUB_DATA }) });
const uploadFiles = (req, res, next) => { sweepOwnTmp(); upload.array('files')(req, res, (err) => (err ? res.status(err.status || 500).json({ error: err.message, code: err.code || 'upload_failed' }) : next())); };
// lane chat-attachments-persist (road a): a file the person gives a conversation whose cwd is TEMPORARY — chat.uploadDir
// unset, the cwd under os.tmpdir() / /tmp / /var/tmp — is kept with the conversation instead (data/chat-attachments/<conv>/
// files/, a remote host's ~/.vibespace/chat-attachments/<conv>/), and the answer says where; a cwd that is not temporary
// keeps today's road (the agent wants the file beside its work). A same-named file is never overwritten: «name (1).ext».
const CA = require('../server/chat-attachments.js');
const ATTACH_ROOT = path.join(__dirname, '..', '..', 'data', 'chat-attachments');
const TEMP_ROOTS = () => [...new Set([os.tmpdir(), '/tmp', '/var/tmp'].map((p) => path.resolve(p)))];
const underTempRoot = (p, roots = TEMP_ROOTS()) => roots.some((r) => p === r || p.startsWith(r + path.sep));
const REMOTE_TEMP_RE = /^\/(?:tmp|var\/tmp)(?:\/|$)/;
/** «a.png» → «a (1).png», «a (2).png»… — the first name `taken(name)` answers false for (bounded). */
async function freeName(name, taken) {
  if (!(await taken(name))) return name;
  const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 1000; n++) { const c = `${base} (${n})${ext}`; if (!(await taken(c))) return c; }
  throw new Error(`Too many files named ${name}`);
}
/** The top-level component of every upload name renamed once when it is taken (a file, or a folder's root). */
async function freeTops(names, taken) {
  const map = new Map();
  for (const n of names) { const top = String(n).split('/')[0]; if (top && !map.has(top)) map.set(top, await freeName(top, taken)); }
  return (n) => { const parts = String(n).split('/'); parts[0] = map.get(parts[0]) || parts[0]; return parts.join('/'); };
}
// lane artifacts-registries: the composer names its chat (`sessionId`) ⇒ each landed file is that conversation's `upload`
// row (src/server/artifact-registry.js); a file-explorer upload names none and feeds nothing
function noteChatUploads(req, files) {
  const sessionId = req.body && req.body.sessionId ? String(req.body.sessionId) : '';
  if (!sessionId || !files.length) return;
  try { require('../server/artifact-registry.js').noteUploads({ sessionId, host: req.query.host ? String(req.query.host) : '', files }); } catch (e) { console.warn('[upload] artifacts rows not fed:', e.message); }
}
router.post('/api/upload', uploadFiles, async (req, res) => {
  let destDir = req.body.destDir || os.homedir();
  const conv = req.body && req.body.sessionId ? String(req.body.sessionId) : '';
  const keepWithConv = req.body.uploadDirSet !== '1' && CA.convOk(conv);   // chat.uploadDir unset (today's default = the cwd) and a conversation named
  let keptFrom = null;   // the temporary folder the files were kept away from (said in the answer)
  const preservePaths = req.body.preservePaths === '1'; // folder upload: keep relative paths
  // Client sends correct UTF-8 filenames as JSON to avoid multer encoding issues
  let clientNames = [];
  try { clientNames = JSON.parse(req.body.fileNames || '[]'); } catch {}
  // Remote upload: stream each temp file to the host over ssh
  const R = rfs(req);
  // row B-422c, second half (主开发 r3499 / r3507; lane mask-value-shape): a refusal at file k of n says what LANDED before it — `landed`
  // (files 1..k−1, in order, as a success lists them) and `landedOf` — so the page's retry never places a landed file a second time (the
  // kept road numbers a same-named file). The reply gains fields and loses none.
  const landedBody = (results, dir) => (results && results.length ? { landed: results, landedOf: (req.files || []).length, ...(keptFrom ? { keptWithConversation: true, keptFrom, dir } : {}) } : {});
  let landedL = null, landedDir = null, noted = false;
  // line 834's round (主开发 r3771): the files that LANDED before a refusal are the conversation's `upload` rows too — the page takes
  // them as uploaded and never posts them again, so the refusal road notes them (once: never a second time after the success road's)
  const note = (results) => { if (noted || !results || !results.length) return; noted = true; noteChatUploads(req, results); };
  if (R) {
    try {
      const results = []; landedL = results;
      if (keepWithConv && REMOTE_TEMP_RE.test(String(destDir))) {   // road a, a remote host: its own persistent folder, absolute
        const home = String(await R.fs.home(R.host) || '').replace(/\/+$/, '');
        if (home) { keptFrom = destDir; destDir = `${home}/.vibespace/chat-attachments/${conv}`; await R.fs.mkdir(R.host, destDir); }
      }
      const dir = destDir.endsWith('/') ? destDir : destDir + '/';
      const names = req.files.map((f, i) => clientNames[i] || f.originalname);
      for (const n of names) if (n.includes('..')) throw new Error('Invalid file name: ' + n);
      // a same-named file is numbered ONLY on the kept-with-conversation road (the hub's own folder); elsewhere an upload
      // replaces it, as it always did (the explorer, a chat in an ordinary folder)
      const rename = keptFrom ? await freeTops(names, async (top) => { try { return !!(await R.fs.stat(R.host, dir + top)); } catch { return false; } }) : (n) => n;
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const name = rename(names[i]);
        const dest = dir + name;
        await R.fs.write(R.host, dest, await fs.promises.readFile(file.path));
        await fs.promises.unlink(file.path).catch(() => {});
        results.push({ name, path: dest, size: file.size });
      }
      note(results);
      return res.json({ success: true, files: results, ...(keptFrom ? { keptWithConversation: true, keptFrom, dir: destDir } : {}) });
    } catch (e) {
      for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
      note(landedL);
      return res.status(400).json({ ...fsErrorBody(e), ...landedBody(landedL, destDir) });   // B-7f0b D8: a refusal by code (a file over the device link's line) is worded on the page
    }
  }
  try {
    const results = []; landedL = results;
    let destRoot = path.resolve(expandTilde(destDir)); // chat.uploadDir may be ~/Downloads
    if (keepWithConv && underTempRoot(destRoot, req.app.locals.chatTempRoots || TEMP_ROOTS())) { keptFrom = destRoot; destRoot = path.join(req.app.locals.chatAttachmentsRoot || ATTACH_ROOT, conv, 'files'); }   // road a: kept with the conversation (a gate's root: app.locals.chatAttachmentsRoot)
    // B-fcc7 (read 5): an upload ADDS to its folder — a machine's pull folder that is not mounted refuses it (its multipart destDir
    // is read only here, after multer: the router's pass above saw an empty body); the catch below lets the temp files go
    const pullUp = await require('../machine-mounts.js').pullShadowOfReal(destRoot, { writer: true });   // B-02f6 remainder: the writers' door
    if (pullUp) throw Object.assign(new Error(pullShadowBody(pullUp).error), { status: 503, pullBody: pullShadowBody(pullUp) });
    // dest side may be a mount → all dest-touching fs ops go through SafeFs.
    // The multer temp files live in /tmp (fast, local) — their unlink stays fs.
    landedDir = destRoot;
    await sfs(req).call('mkdir', { path: destRoot }); // ensure target exists (plain-file uploads to a fresh dir)
    // lane chat-attachments-persist: on the KEPT road a same-named file (or folder) is never overwritten — «name (1).ext»;
    // anywhere else an upload replaces a same-named file, as it always did
    const names = req.files.map((f, i) => clientNames[i] || f.originalname);
    const rename = !keptFrom ? (n) => n : await freeTops(names, async (top) => { const p = path.resolve(destRoot, top); if (p !== destRoot && !p.startsWith(destRoot + path.sep)) return false; try { return !!(await sfs(req).call('exists', { path: p })).exists; } catch { return false; } });
    if (keptFrom) {   // THE LINK beside the files: which conversation they belong to — it outlives the hub's session record
      // B-a09e: the link is ON DISK before the first file is placed (its write is the store writer's): a crash between them leaves a
      // link with no files (nothing to offer for removal), never files with no link (Settings' Remove door would offer them as gone)
      // (its smalls, 主开发 09:18Z): the landing's ANSWER is read — not on disk (rejected, or held past the writer's bound) ⇒ NO file is
      // placed and the upload is refused by name (the person uploads again); the same link already on disk is not written again
      const live = req.app.locals.activeSessions && req.app.locals.activeSessions.get(conv);
      const L = await CA.linkOnDisk(path.dirname(path.dirname(destRoot)), conv, live ? { backend: live.backend || 'claude', tx: live.backendSessionId || live.claudeSessionId || null } : {});
      if (!L.ok) { const msg = `nothing was uploaded: this conversation's folder link is not on disk yet (${L.why}) — upload again in a moment`; throw Object.assign(new Error(msg), { status: 503, pullBody: { error: msg, code: 'not-on-disk', notOnDisk: true } }); }
    }
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const name = rename(names[i]);
      const dest = path.resolve(destRoot, name);
      // Confine to the chosen folder: a name containing ../ would otherwise
      // silently write outside the upload destination
      if (dest !== destRoot && !dest.startsWith(destRoot + path.sep)) {
        throw new Error(`Invalid file name: ${name}`);
      }
      // For folder uploads, create intermediate directories
      if (preservePaths && name.includes('/')) {
        await sfs(req).call('mkdir', { path: path.dirname(dest) });
      }
      if (keptFrom) {   // road a: into the conversation's own folder as a temp file LINKED to a free name — never overwriting
        const got = await CA.placeFile(file.path, destRoot, name);
        await fs.promises.unlink(file.path).catch(() => { });
        results.push({ name: got, path: path.join(destRoot, got), size: file.size });
        continue;
      }
      await sfs(req).call('copy', { src: file.path, dest, overwrite: true });
      fs.unlinkSync(file.path);
      results.push({ name, path: dest, size: file.size });
    }
    note(results);
    res.json({ success: true, files: results, ...(keptFrom ? { keptWithConversation: true, keptFrom, dir: destRoot } : {}) });
  } catch (err) {
    // Clean up remaining multer temp files on failure (they leaked in /tmp)
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    note(landedL);
    res.status(err.status || 400).json({ ...(err.pullBody || { error: err.message }), ...landedBody(landedL, landedDir) });   // B-fcc7: a pull folder's refusal keeps its code
  }
});

// Paste temp hygiene (restart audit #29): a REMOTE host's ~/.vibespace/paste/ was never cleaned by anything — it grew forever.
// Sweep its files older than 24h, fire-and-forget, at most once per hour per host. THIS machine's pastes live in the hub's own
// folder (<tmp>/vibespace-<uid>-<data hash>/paste, B-3767), swept with the rest of that root by HUB_TMP.sweepHubTmp (judged, by
// age). B-5527 (one release after B-3767, 主开发 r590): the legacy leg — a delete by the name prefix claude-paste-* over the SHARED
// temp folder, which reached a sibling scratch hub's files — is retired; nothing here looks at the shared temp folder.
const _pasteSweepAt = new Map(); // hostId → last sweep ts
function sweepPasteTemps(rfsInst, host) {
  if (!host || !rfsInst) return;
  const now = Date.now();
  if (now - (_pasteSweepAt.get(host) || 0) < 60 * 60 * 1000) return;
  _pasteSweepAt.set(host, now);
  rfsInst._run(host, `find ~/.vibespace/paste -type f -mmin +1440 -delete 2>/dev/null || true`).catch(() => {});
}

// THE CLIPBOARD'S POLL (the paste below): how long the clipboard is asked whether it holds the picture — today's bound
const CLIPBOARD_POLL_MS = 5000;
/** macOS: the pasted picture onto the clipboard (osascript) through the hub's starter — its whole env built HERE (the service
 *  env; the old road gave it the hub's whole env, its secrets included) */
function macClipboardWrite(starter, tmpPath) {
  return starter.run('osascript', ['-e', `set the clipboard to (read POSIX file "${tmpPath}" as «class PNGf»)`], { timeoutMs: 5000, capture: true, wholeEnv: true, env: serviceEnv(process.env) });
}
/** a picture the clipboard never took, BY NAME (the terminal words the code): the program missing, the display not opened, or no
 *  picture in time — from the last read's own answer */
function clipboardWhy(r, display) {
  if (r && r.error === 'ENOENT') return { code: 'clipboard_no_program', words: `the clipboard program is not installed on the machine VibeSpace runs on` };
  // r1090: the HELPER could not ask (the starter down, restarting, never answering) — its own fault, never the clipboard's
  if (r && r.unknown) return { code: 'clipboard_no_helper', words: 'could not ask the clipboard (the helper process did not answer) — paste again' };
  if (r && /can't open display/i.test(String(r.stderr || ''))) return { code: 'clipboard_no_display', words: `the display ${display || '(none)'} could not be opened for the clipboard` };
  return { code: 'clipboard_not_taken', words: 'the clipboard did not take the picture in time' };
}
// Paste image from clipboard → save to temp file + set X clipboard via xclip
router.post('/api/paste-image', async (req, res) => {
  try {
    const { dataUrl, sessionId } = req.body; // "data:image/png;base64,..."
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Not an image' });
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid data URL' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const mimeType = `image/${match[1]}`;
    const buf = Buffer.from(match[2], 'base64');
    // REMOTE terminal session (B-65ec): the CLI reads the clipboard ON ITS OWN
    // machine — the local xclip dance below can never reach it. Instead land
    // the image as a file on the host and hand the client the remote path to
    // TYPE into the PTY (the drag-drop model). Server-side host resolution:
    // the session object is authoritative (client openSpec can lag).
    const sess = sessionId && req.app.locals.activeSessions?.get?.(String(sessionId));
    if (sess?.host) {
      const rfsInst = remoteFsFor(req);
      if (!rfsInst) return res.status(500).json({ error: 'remote fs unavailable' });
      const remotePath = `~/.vibespace/paste/paste-${Date.now()}.${ext}`;
      await rfsInst.mkdir(sess.host, '~/.vibespace/paste');
      await rfsInst.write(sess.host, remotePath, buf);
      sweepPasteTemps(rfsInst, sess.host);
      return res.json({ ready: true, remotePath });
    }
    // B-3767: the paste lands in THIS hub's own temp folder (never the shared root, where any user could read it)
    sweepOwnTmp();
    const pasteDir = await HUB_TMP.hubTmpDir('paste', { dataDir: HUB_DATA });
    if (!pasteDir.dir) return res.status(500).json({ error: `the paste's temp folder: ${pasteDir.why}`, code: 'hub_tmp_refused' });
    const tmpPath = path.join(pasteDir.dir, `claude-paste-${Date.now()}.${ext}`);
    await fs.promises.writeFile(tmpPath, buf);   // B-3767 follow-up: off the loop (a reader's should); swept by sweepOwnTmp above (B-5527)
    // Set system clipboard with image — macOS uses osascript, Linux uses xclip
    // B-323e's family, 主开发 r1066 — the paste's own site: the clipboard's READS (the poll below, every 200 ms for up to 5 s) and
    // macOS's one write run through the hub's STARTER (src/server/child-starter.js: a small process forks them, never the hub; each
    // awaited, each bounded, its env the one this route built) — they no longer hold the hub's loop. NOT YET OFF THE LOOP (r1090,
    // said): a poll that runs out re-probes the display ONCE (req.app.locals.refreshXEnv → src/server/cli-env.js detectXDisplay /
    // stabilizeXAuth, src/server/cli-cmd.js resolveCmd) — synchronous children, the loop-child census's DEBT rows «per refreshXEnv».
    // The program that OWNS the clipboard (xclip: it lives until another program takes the clipboard, by design) is started as before.
    // A picture the clipboard never takes is ANSWERED BY NAME within the same bound (`code` + `error`; the terminal words it) — before,
    // the answer was a silent `ready: false`; a read that finds NO program answers that at once (no further read, no re-probe)
    const isMac = process.platform === 'darwin';
    const starter = childStarter();
    try {
      if (isMac) {
        const r = await macClipboardWrite(starter, tmpPath);
        if (r && r.code === 0 && !r.timedOut && !r.unknown) res.json({ path: tmpPath, ready: true });
        else { const why = clipboardWhy(r, null); res.json({ path: tmpPath, ready: false, code: why.code, error: why.words }); }
      } else {
        // Use the display the server PROBED at startup (app.locals.xEnv) — the
        // inherited DISPLAY is often stale, and XWayland needs the compositor's
        // XAUTHORITY cookie or xclip fails with "Can't open display". If the
        // cycle fails, re-probe ONCE and retry: a compositor restart rotates
        // the cookie out from under a long-running server (real incident).
        const attempt = (retriesLeft) => {
          const xEnv = req.app.locals.xEnv || {};
          // xclip's env is BUILT (lane spawn-env-debts): it lives until another app takes the clipboard — the service list
          // + the display it pastes to and its cookie, chosen exactly as before (the probed one, else the inherited one:
          // detectXDisplay's '' cookie candidate IS the inherited XAUTHORITY), never the hub's tokens
          const clipEnv = serviceEnv(process.env, { add: { DISPLAY: xEnv.DISPLAY || process.env.DISPLAY || ':0', XAUTHORITY: xEnv.XAUTHORITY || process.env.XAUTHORITY || null } });
          const cp = spawn('bash', ['-c', `cat "${tmpPath}" | xclip -selection clipboard -t ${mimeType}`], {
            env: clipEnv, detached: true, stdio: 'ignore',
          });
          cp.on('error', (e) => console.warn(`[files] the clipboard helper could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
          cp.unref();
          const pollStart = Date.now(), pollFor = Number(req.app.locals.clipboardPollMs) > 0 ? Number(req.app.locals.clipboardPollMs) : CLIPBOARD_POLL_MS;   // a suite's seam: its own shorter bound
          let last = null;
          const poll = async () => {
            try {
              last = await starter.run('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], { timeoutMs: 1000, capture: true, wholeEnv: true, env: clipEnv });
              if (last && last.code === 0 && String(last.stdout || '').includes('image/')) return res.json({ path: tmpPath, ready: true });
              // r1090: the program is not there — said AT ONCE (no further read, no re-probe: neither can bring it)
              if (last && last.error === 'ENOENT') { const why = clipboardWhy(last, clipEnv.DISPLAY); return res.json({ path: tmpPath, ready: false, code: why.code, error: why.words }); }
            } catch { }
            if (Date.now() - pollStart < pollFor) return void setTimeout(poll, 200);
            if (retriesLeft > 0 && req.app.locals.refreshXEnv) {
              req.app.locals.refreshXEnv();
              return attempt(retriesLeft - 1);
            }
            const why = clipboardWhy(last, clipEnv.DISPLAY);
            res.json({ path: tmpPath, ready: false, code: why.code, error: why.words });
          };
          setTimeout(poll, 300);
        };
        attempt(1);
      }
    } catch {
      res.json({ path: tmpPath, ready: false });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quote-aware CSV field split (commas inside "..." stay in one field,
// "" unescapes to "). Embedded newlines inside quotes are not supported —
// the endpoint streams line-by-line by design.
function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', inQ = false, wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"' && cur === '') {
      inQ = true; wasQuoted = true;
    } else if (ch === sep) {
      out.push(wasQuoted ? cur : cur.trim()); cur = ''; wasQuoted = false;
    } else cur += ch;
  }
  out.push(wasQuoted ? cur : cur.trim());
  return out;
}

// CSV/TSV row-range read. The line-scan (offset/limit/sep threaded through)
// runs in the SafeFs pool via the csvRange op — a SYNC port of the old
// streaming reader that returns the identical response shape — so a huge or
// mount-backed CSV never touches the main thread. Handles arbitrarily large
// files by chunked reads inside the worker.
router.get('/api/file/csv', async (req, res) => {
  const R = rfs(req);
  let filePath;
  try { filePath = R ? await remoteToLocalTmp(R, remotePath(req.query.path), 64 * 1024 * 1024) : safePath(req.query.path); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const offset = parseInt(req.query.offset) || 0;
  const limit = parseInt(req.query.limit) || 100;
  const sep = req.query.sep || ',';
  try {
    const r = await sfs(req).call('csvRange', { path: filePath, offset, limit, sep });
    res.json(r);
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

// Format code via server-side CLI tools (for languages not supported by Prettier)
router.post('/api/format', (req, res) => {
  const { code, language, filePath } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'code and language required' });

  // Map language → CLI formatter command
  const formatters = {
    python: { cmd: 'black', args: ['-', '-q', '--fast'], stdin: true },
    shell: { cmd: 'shfmt', args: ['-'], stdin: true },
    go: { cmd: 'gofmt', args: [], stdin: true },
    rust: { cmd: 'rustfmt', args: ['--edition', '2021'], stdin: true },
  };

  // Try ruff first for Python (faster), fall back to black
  const fmt = formatters[language];
  if (!fmt) return res.status(400).json({ error: `No server-side formatter for ${language}` });

  const tryFormat = (cmd, args) => {
    try {
      const result = execFileSync(cmd === 'ruff' ? 'ruff' : cmd,
        cmd === 'ruff' ? ['format', '-'] : args,
        { input: code, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      return result;
    } catch (err) {
      if (err.stdout) return err.stdout; // some formatters return non-zero but still output
      throw err;
    }
  };

  try {
    let formatted;
    if (language === 'python') {
      // Try ruff format first (fast), fall back to black
      try { formatted = tryFormat('ruff', ['format', '-']); }
      catch { formatted = tryFormat('black', ['-', '-q', '--fast']); }
    } else {
      formatted = tryFormat(fmt.cmd, fmt.args);
    }
    res.json({ formatted });
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message;
    res.status(422).json({ error: stderr.split('\n')[0]?.substring(0, 200) || 'Format failed' });
  }
});


// ── Archive operations (zip / tar family via system tools) ──
// All subprocess calls use execFile with arg arrays — no shell interpolation.
const { execFile } = require('child_process');

function archiveType(p) {
  const n = p.toLowerCase();
  if (n.endsWith('.zip')) return 'zip';
  if (n.endsWith('.tar') || n.endsWith('.tar.gz') || n.endsWith('.tgz')
    || n.endsWith('.tar.bz2') || n.endsWith('.tbz2') || n.endsWith('.tar.xz') || n.endsWith('.txz')) return 'tar';
  return null;
}

// Create an archive from files/folders that share one parent directory.
// Runs with cwd = parent so the archive holds clean relative paths.
router.post('/api/archive', async (req, res) => {
  const { paths, dest, overwrite } = req.body || {};
  if (!Array.isArray(paths) || !paths.length || !dest) return res.status(400).json({ error: 'paths[] and dest required' });
  const R = rfs(req);
  if (R) {
    try {
      const parent = path.posix.dirname(remotePath(paths[0]));
      const names = paths.map(p => path.posix.basename(p));
      await R.fs.makeArchive(R.host, remotePath(dest), parent, names);
      return res.json({ success: true, dest });
    } catch (e) { return res.status(400).json(fsErrorBody(e)); }
  }
  const absPaths = paths.map(safePath);
  const destPath = safePath(dest);
  const parent = path.dirname(absPaths[0]);
  if (!absPaths.every(p => path.dirname(p) === parent)) return res.status(400).json({ error: 'all paths must share one parent directory' });
  const names = absPaths.map(p => path.basename(p));
  // dest existence/cleanup on a mount → SafeFs; the zip/tar work is a child
  // process (kept as-is — child procs don't touch the libuv pool).
  try {
    if ((await sfs(req).call('exists', { path: destPath })).exists) {
      if (!overwrite) return res.status(409).json({ error: 'exists', dest: destPath });
      await sfs(req).call('unlink', { path: destPath });
    }
  } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const type = archiveType(destPath);
  let cmd, args;
  if (type === 'zip') { cmd = 'zip'; args = ['-r', '-q', '-y', destPath, ...names]; }
  else if (type === 'tar') {
    const n = destPath.toLowerCase();
    const flag = n.endsWith('.tar') ? '-cf' : (n.endsWith('.bz2') || n.endsWith('.tbz2')) ? '-cjf' : (n.endsWith('.xz') || n.endsWith('.txz')) ? '-cJf' : '-czf';
    cmd = 'tar'; args = [flag, destPath, ...names];
  } else return res.status(400).json({ error: 'dest must end in .zip, .tar, .tar.gz/.tgz, .tar.bz2 or .tar.xz' });
  execFile(cmd, args, { cwd: parent, timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, async (err, _o, stderr) => {
    if (err) { try { await sfs(req).call('unlink', { path: destPath }); } catch {} return res.status(400).json({ error: (stderr || err.message).split('\n')[0] }); }
    let size = 0; try { size = (await sfs(req).call('stat', { path: destPath })).size; } catch {}
    res.json({ success: true, dest: destPath, size });
  });
});

// List archive contents (preview without extracting)
router.get('/api/archive/list', async (req, res) => {
  const R = rfs(req);
  if (R) { try { return res.json(await R.fs.archiveList(R.host, remotePath(req.query.path))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  const fp = safePath(req.query.path || '');
  const type = archiveType(fp);
  if (!type) return res.status(400).json({ error: 'unsupported archive type' });
  try { if (!(await sfs(req).call('exists', { path: fp })).exists) return res.status(404).json({ error: 'not found' }); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const opts = { timeout: 60000, maxBuffer: 64 * 1024 * 1024 };
  // ONE parser for local and remote listings (src/remote-fs.js
  // parseArchiveListing) — the shapes drifted once and crashed the remote
  // archive viewer (B-b87b); sharing the implementation retires the class.
  if (type === 'zip') {
    execFile('unzip', ['-l', '-qq', fp], opts, (err, out) => {
      if (err) return res.status(400).json({ error: 'failed to read zip: ' + (err.message || '').split('\n')[0] });
      res.json({ ...parseArchiveListing('zip', out), type });
    });
  } else {
    execFile('tar', ['-tvf', fp], opts, (err, out) => {
      if (err) return res.status(400).json({ error: 'failed to read tar: ' + (err.message || '').split('\n')[0] });
      res.json({ ...parseArchiveListing('tar', out), type });
    });
  }
});

// Extract ONE entry to a temp file and return its path — the client then opens
// it through the normal viewer pipeline (editor / image / pdf / …).
router.post('/api/archive/extract-entry', (req, res) => {
  const { path: ap, entry } = req.body || {};
  if (!ap || !entry) return res.status(400).json({ error: 'path and entry required' });
  if (entry.endsWith('/')) return res.status(400).json({ error: 'cannot open a directory entry' });
  // Remote archives (B-b87b): extract the entry OFF the host into a local
  // temp file — the viewer pipeline that opens it is local by definition.
  const R = rfs(req);
  if (R) {
    const rTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webui-archive-'));
    const rOut = path.join(rTmp, path.basename(entry) || 'entry');
    return R.fs.archiveExtractEntry(R.host, remotePath(ap), entry, rOut)
      .then((r) => res.json({ path: rOut, size: r.size }))
      .catch((e) => { try { fs.rmSync(rTmp, { recursive: true }); } catch {} res.status(e.status || 400).json(fsErrorBody(e)); });
  }
  const fp = safePath(ap);
  const type = archiveType(fp);
  if (!type) return res.status(400).json({ error: 'unsupported archive type' });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webui-archive-'));
  const outPath = path.join(tmpDir, path.basename(entry) || 'entry');
  const outStream = fs.createWriteStream(outPath);
  // ckpt61 cure 3 — THE LAW, widened: ANY stream the hub opens on these roads has its error listener before anything that can
  // throw (a full file table fails its open on a later tick: unheard, the hub ended)
  let outErr = null;
  outStream.on('error', (e) => { outErr = outErr || e; });
  let cmd, args;
  if (type === 'zip') {
    // unzip treats [ ] * ? as globs — escape for a literal member name
    const literal = entry.replace(/([\[\]*?])/g, '\\$1');
    cmd = 'unzip'; args = ['-p', fp, literal];
  } else { cmd = 'tar'; args = ['-xOf', fp, entry]; }
  // spawn (not execFile): execFile buffers stdout internally and maxBuffer
  // kills the child — for streaming, pipe from a spawned process instead
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  child.on('error', (e) => console.warn(`[files] an archive entry's reader could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
  if (!child.stdout) { try { outStream.destroy(); } catch {} try { fs.rmSync(tmpDir, { recursive: true }); } catch {} return res.status(503).json({ error: 'the archive could not be read now (its reader did not start)' }); }   // ckpt61 cure 3
  child.stdout.pipe(outStream);
  let written = 0, killed = false;
  const CAP = 200 * 1024 * 1024;
  const timer = setTimeout(() => { killed = true; child.kill(); }, 120000);
  child.stdout.on('data', (c) => { written += c.length; if (written > CAP && !killed) { killed = true; child.kill(); } });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (killed) { try { fs.rmSync(tmpDir, { recursive: true }); } catch {} return res.status(413).json({ error: 'entry too large (>200MB)' }); }
    if (code !== 0) { try { fs.rmSync(tmpDir, { recursive: true }); } catch {} return res.status(400).json({ error: `extract failed (exit ${code})` }); }
    if (outErr) { try { fs.rmSync(tmpDir, { recursive: true }); } catch {} return res.status(503).json({ error: `the entry could not be written (${outErr.code || outErr.message})` }); }   // ckpt61 cure 3
    outStream.end(() => res.json({ path: outPath, size: written }));
  });
});

// Extract a whole archive into dest
// ── Async extraction ops with progress (2.111.18) ──
// POST /api/archive/extract with progress:1 returns {opId} immediately; the
// extraction runs detached from the request with a per-entry counter (total
// from a streamed listing pass), polled via GET /api/archive/extract-status.
// A big archive used to hold the HTTP request for minutes with zero feedback.
const extractOps = new Map(); // opId → {done,total,status,error,dest,child}
// ── Interrupted-extraction journal (restart audit #23): a server death mid-
// extraction truncates the file being inflated at that instant, and the
// natural retry posts overwrite:false → unzip -n / tar -xk SKIP the truncated
// (existing) file and report success — silent corruption surviving the visible
// recovery. Persist archive+dest across restarts: a re-extract into a
// journaled dest escalates to overwrite so the fresh pass rewrites (repairs)
// every file from the archive; the entry clears only on clean completion. ──
const EXTRACT_JOURNAL_AT = { file: path.join(__dirname, '..', '..', 'data', 'extract-journal.json') };   // the suites' seam moves it (router.__extractJournal.at)
// r3333 unit 2 (lane lg-group-parents, the store-read family): THE JOURNAL IS HELD when it cannot be read — never «no extraction
// was cut short». It is read ONCE (at its first use, the one sync read as before) through the family's helper
// (src/store-read-hold.js), kept in memory, read again OFF the loop while held, lifted with no restart:
//   · HELD (a read that failed): every local extraction is refused BY NAME before anything starts — no folder made, no mark,
//     no spawn — a mark cannot be written while held, so an extraction that is cut short would be lost to the next retry
//   · TORN BYTES: kept aside ONCE, then it starts empty — and for the rest of this run an extraction into a folder that already
//     holds something is refused by name (whether an earlier one into it was cut short is unknown: the journal's silence calls
//     nothing whole); a NEW or EMPTY folder cannot hold a cut-short file, so that one goes on (the page offers no «Overwrite»)
//   · nothing is written over the file while held (the helper's writable())
const SR = require('../store-read.js');
const SRH = require('../store-read-hold.js');   // the family's hold (one read again off the loop, torn bytes kept aside once)
const EXTRACT_JOURNAL_WORDS = 'the extraction journal could not be read, so it is not known whether an earlier extraction into this folder was cut short — try again when it reads (it is read again by itself)';
const EXTRACT_TORN_WORDS = 'the extraction journal\'s earlier record did not parse (it is kept aside), so it is not known whether an earlier extraction into this folder was cut short — extract it into a new or empty folder';
// B-574d (lane nl-journals): a mark that could not reach the disk starts NOTHING — the extraction it guards would be lost to the next retry
const EXTRACT_UNWRITTEN_WORDS = 'the extraction journal could not be written, so an extraction cut short here could not be repaired by a later one — nothing was extracted; try again when VibeSpace can write its data folder again';
const FCJ = require('../fd-close.js');   // B-574d: the tree's one synced replace (renameSynced) — the journal's mark is on disk before the spawn
let journalNoSyncSaid = false;   // a file system that does no sync at all: said once (the mark still lands)
const journalValid = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
let extractJournal = null, journalHold = null, journalTorn = false;
function journalLoad() {
  if (journalHold) return;
  journalHold = SRH.create({ file: EXTRACT_JOURNAL_AT.file, valid: journalValid, aside: (mark) => `${EXTRACT_JOURNAL_AT.file}.corrupt-${mark}`, words: () => EXTRACT_JOURNAL_WORDS, code: 'extract_journal_unread', log: (m) => console.warn(`[extract] ${m}`),
    onLift: (v, f) => { extractJournal = journalValid(v) ? v : {}; if (f && f.setAside) journalTorn = true; } });
  let read; try { read = { text: fs.readFileSync(EXTRACT_JOURNAL_AT.file, 'utf-8') }; } catch (error) { read = { error }; }
  const a = SR.storeAnswer(read, { valid: journalValid });
  const st = journalHold.start(a);
  extractJournal = st === 'data' ? a.value : st === 'missing' ? {} : null;
}
/** the refusal of a local extraction while the journal is HELD — null: it goes on */
function extractJournalRefusal() {
  journalLoad();
  return journalHold.held() ? { error: EXTRACT_JOURNAL_WORDS, code: 'extract_journal_unread' } : null;
}
/** torn in this run: only a new or empty folder goes on — `names` = the folder's listing ([] when it is not there; null: unread) */
function extractTornRefusal(names) {
  if (!journalTorn) return null;
  return Array.isArray(names) && !names.length ? null : { error: EXTRACT_TORN_WORDS, code: 'extract_journal_torn' };
}
function readExtractJournal() { journalLoad(); return extractJournal || {}; }
function writeExtractJournal(j) {
  // B-574d (lane nl-journals): THE MARK IS ON DISK BEFORE ITS NAME POINTS AT IT — its temp written, SYNCED, closed, then renamed (src/
  // fd-close.js renameSynced): after a power cut the next start reads the mark (#23), never a name over no bytes. A write that fails
  // (the sync, the close, the rename) is a FAILED WRITE — false, and the memory keeps what the disk holds: a start is refused by its
  // caller; a clear takes the memory anyway (the extraction ended whole — clearExtractMark). A file system that does no sync lands it, said once.
  // Never over a held journal (nothing written over a file that could not be read).
  if (!journalHold || !journalHold.writable('a mark of the extraction journal')) return;
  const f = EXTRACT_JOURNAL_AT.file;
  // r4828: NO TEMP LEFT on any road — the door removes its temp on a failed write, sync or close but keeps it on a failed rename
  try { FCJ.renameSynced(f + '.tmp', f, JSON.stringify(j), { where: '[extract] the extraction journal', say: (w) => { if (!journalNoSyncSaid) { journalNoSyncSaid = true; console.warn(w); } } }); }
  catch (e) { try { fs.unlinkSync(f + '.tmp'); } catch { /* the door removed it, or it was never made */ } console.warn(`[extract] the extraction journal could not be written (${(e && e.code) || (e && e.message) || e})`); return false; }
  extractJournal = j;
  return true;
}
function markExtractStart(fp, destDir) {
  const j = { ...readExtractJournal() };
  j[fp + '\n' + destDir] = Date.now();
  const keys = Object.keys(j);
  if (keys.length > 200) for (const k of keys.sort((a, b) => j[a] - j[b]).slice(0, keys.length - 200)) delete j[k];
  return writeExtractJournal(j) === true;   // B-574d: false = the mark is not on disk (a failed write, or a held journal) — its caller starts nothing
}
function clearExtractMark(fp, destDir) {
  const j = { ...readExtractJournal() };
  if ((fp + '\n' + destDir) in j) {
    delete j[fp + '\n' + destDir];
    // B-574d: an extraction that ENDED WHOLE is known whole in this run even when its clear did not reach the disk — the memory takes
    // the clear (a later extraction into that folder is never turned into an overwrite in this run, over the person's edits since);
    // the mark left on disk goes at the journal's next write (every write is the whole journal)
    if (writeExtractJournal(j) === false) { extractJournal = j; console.warn('[extract] an ended extraction\'s mark stays on disk until the journal\'s next write'); }
  }
}
function hadInterruptedExtract(fp, destDir) {
  return (fp + '\n' + destDir) in readExtractJournal();
}
router.get('/api/archive/extract-status', (req, res) => {
  const op = extractOps.get(String(req.query.id || ''));
  if (!op) return res.status(404).json({ error: 'unknown op' });
  res.json({ done: op.done, total: op.total, status: op.status, error: op.error, dest: op.dest, code: op.code, params: op.params });
});
router.delete('/api/archive/extract-status', (req, res) => {
  const op = extractOps.get(String(req.query.id || ''));
  if (!op) return res.status(404).json({ error: 'unknown op' });
  op.status = 'cancelled';
  try { op.child?.kill('SIGTERM'); } catch {}
  res.json({ success: true });
});

router.post('/api/archive/extract', async (req, res) => {
  const { path: ap, dest, overwrite } = req.body || {};
  if (!ap || !dest) return res.status(400).json({ error: 'path and dest required' });
  const R = rfs(req);
  if (R) {
    // Remote extraction runs as the SAME polled op as local: the synchronous
    // call held the request for up to 5 minutes (RemoteFs timeoutMs) with zero
    // client feedback — the pre-2.111.18 "frozen for minutes" bug, remote-only.
    // No per-entry count is available (one ssh command, nothing to tally), so
    // the op stays indeterminate: total 0, status running → done/error.
    if (req.body.progress) {
      const opId = 'ex-' + require('crypto').randomBytes(6).toString('hex');
      const op = { done: 0, total: 0, status: 'running', error: null, dest: String(dest), child: null };
      extractOps.set(opId, op);
      res.json({ success: true, opId });
      R.fs.archiveExtract(R.host, remotePath(ap), remotePath(dest))
        .then(() => { if (op.status !== 'cancelled') op.status = 'done'; })
        .catch((e) => { if (op.status !== 'cancelled') { op.status = 'error'; op.error = String(e.message || e).split('\n')[0]; Object.assign(op, fsErrorBody(e), { error: op.error }); } })
        .finally(() => setTimeout(() => extractOps.delete(opId), 5 * 60 * 1000).unref());   // unref: a finished op's table entry never holds a process (B-fcc7's find)
      return;
    }
    try { return res.json(await R.fs.archiveExtract(R.host, remotePath(ap), remotePath(dest))); } catch (e) { return res.status(400).json(fsErrorBody(e)); }
  }
  const fp = safePath(ap);
  const destDir = safePath(dest);
  const type = archiveType(fp);
  if (!type) return res.status(400).json({ error: 'unsupported archive type' });
  { const refused = extractJournalRefusal(); if (refused) return res.status(503).json(refused); }   // r3333 unit 2: before any folder, mark or spawn
  if (journalTorn) {   // r3333 unit 2: the journal was torn in this run — only a new or empty folder (it cannot hold a cut-short file)
    let names = null;
    try { ({ entries: names } = await sfs(req).call('readdirNames', { path: destDir })); } catch (e) { names = e && e.code === 'ENOENT' ? [] : null; }
    const refused = extractTornRefusal(names); if (refused) return res.status(503).json(refused);
  }
  try { await sfs(req).call('mkdir', { path: destDir }); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  // #23: a prior extraction of this archive into this dest was interrupted —
  // its truncated files EXIST, so skip-existing would silently keep them.
  // Escalate to overwrite: the fresh pass only rewrites the archive's own
  // entries, repairing any truncated survivors.
  const effOverwrite = !!overwrite || hadInterruptedExtract(fp, destDir);
  if (req.body.progress) {
    const opId = 'ex-' + require('crypto').randomBytes(6).toString('hex');
    const op = { done: 0, total: 0, status: 'listing', error: null, dest: destDir, child: null };
    extractOps.set(opId, op);
    res.json({ success: true, opId });
    const lineCounter = (onLine) => {
      let rem = '';
      return (d) => { const parts = (rem + d.toString()).split('\n'); rem = parts.pop(); onLine(parts.filter(Boolean).length); };
    };
    const startExtract = () => {
      if (op.status === 'cancelled') return;
      op.status = 'running';
      // #23: journal BEFORE spawning (on disk — B-574d); cleared only on clean completion. A mark not written starts nothing, by name
      if (!markExtractStart(fp, destDir)) { Object.assign(op, { status: 'error', error: EXTRACT_UNWRITTEN_WORDS, code: 'extract_journal_unwritten' }); setTimeout(() => extractOps.delete(opId), 5 * 60 * 1000).unref(); return; }
      const args = type === 'zip'
        ? [effOverwrite ? '-o' : '-n', fp, '-d', destDir]          // verbose by default: one " inflating:" line per entry
        : [effOverwrite ? '-xvf' : '-xvkf', fp, '-C', destDir];    // -v: one line per entry
      const child = spawn(type === 'zip' ? 'unzip' : 'tar', args);
      op.child = child;
      const bump = lineCounter((n) => { op.done = op.total ? Math.min(op.done + n, op.total) : op.done + n; });
      let errTail = '';
      child.stdout.on('data', bump);
      child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-2000); bump(d); });
      child.on('error', (e) => { op.status = 'error'; op.error = e.message; });
      child.on('close', (code) => {
        if (op.status === 'cancelled') { setTimeout(() => extractOps.delete(opId), 60000); return; }
        // tar -k exits non-zero on already-existing files (skip semantics);
        // unzip exit 1 = warnings only — both are success for our purposes.
        const ok = code === 0 || (type === 'zip' && code === 1) || (type !== 'zip' && !effOverwrite && /(already |: File )exists/i.test(errTail));
        if (ok) { op.status = 'done'; if (op.total) op.done = op.total; clearExtractMark(fp, destDir); }
        else { op.status = 'error'; op.error = (errTail.split('\n').filter(Boolean)[0] || `exit ${code}`); }
        setTimeout(() => extractOps.delete(opId), 5 * 60 * 1000).unref();
      });
    };
    // total pass: streamed entry count (never buffers the listing)
    try {
      const lister = spawn(type === 'zip' ? 'unzip' : 'tar', type === 'zip' ? ['-Z1', fp] : ['-tf', fp]);
      let cnt = 0;
      lister.stdout.on('data', lineCounter((n) => { cnt += n; }));
      lister.on('close', () => { op.total = cnt; startExtract(); });
      lister.on('error', () => startExtract()); // no total → indeterminate count
    } catch { startExtract(); }
    return;
  }
  let cmd, args;
  if (type === 'zip') { cmd = 'unzip'; args = [effOverwrite ? '-o' : '-n', '-q', fp, '-d', destDir]; }
  else { cmd = 'tar'; args = [effOverwrite ? '-xf' : '-xkf', fp, '-C', destDir]; }
  if (!markExtractStart(fp, destDir)) return res.status(503).json({ error: EXTRACT_UNWRITTEN_WORDS, code: 'extract_journal_unwritten' }); // #23 + B-574d: on disk before the spawn, or nothing starts
  execFile(cmd, args, { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => {
    // tar -k exits non-zero when files already existed — treat as success (skip-existing semantics)
    if (err && !(cmd === 'tar' && !effOverwrite && /(already |: File )exists/i.test(stderr || ''))) {
      return res.status(400).json({ error: (stderr || err.message).split('\n')[0] });
    }
    clearExtractMark(fp, destDir);
    res.json({ success: true, dest: destDir });
  });
});

// ── Copy/move progress ops (2.215.0, user ask: a big — especially
// CROSS-MACHINE — copy held the HTTP request with ZERO feedback). Same
// pattern as archive extraction: POST with progress:true returns an opId
// immediately, GET /api/file/transfer-status polls {done,total(bytes),
// status,error,dest}, DELETE cancels (best-effort — a local worker copy
// can't be aborted mid-flight; the op is marked cancelled and the UI moves
// on). Cross-host relays count bytes INLINE on the stream; local/same-host
// branches poll `du` on the destination. ──
const transferOps = new Map(); // opId → {done,total,status,error,dest,cancel}
// Staged-write suffix (restart audit #22) — keep in sync with copy/move in
// src/safe-fs-worker.js: dest is written as `<dest>.vs-partial` and renamed
// into place on success, so an interrupted transfer leaves only a clearly
// marked partial (never a truncated file at the final name). The du progress
// poll must watch both names.
const PARTIAL_SUFFIX = '.vs-partial';
router.get('/api/file/transfer-status', (req, res) => {
  const op = transferOps.get(String(req.query.id || ''));
  if (!op) return res.status(404).json({ error: 'unknown op' });
  res.json({ done: op.done, total: op.total, status: op.status, error: op.error, dest: op.dest, code: op.code, params: op.params });
});
router.delete('/api/file/transfer-status', (req, res) => {
  const op = transferOps.get(String(req.query.id || ''));
  if (!op) return res.status(404).json({ error: 'unknown op' });
  op.status = 'cancelled';
  try { op.cancel?.(); } catch {}
  res.json({ success: true });
});
// du-based byte totals/progress. Portable: GNU `du -sb`, BSD falls back to
// -sk × 1024 (macOS hosts have no -b).
const DU_SH = (p) => { const q = `'${String(p).replace(/'/g, `'\\''`)}'`; return `du -sb ${q} 2>/dev/null | cut -f1 | grep . || du -sk ${q} 2>/dev/null | awk '{print $1*1024}'`; };
// lane hub-fuse-sync-guard: the destination is wherever the person copies to — a storage mount too — and this runs every
// 1.2 s for the whole copy: an async stat (never the loop), the walk in a child — B-323e's remainder (lane bl-chat-b, r2681):
// that child asked of the hub's starter, never started from the hub's own process (two a tick: the destination and its partial
// twin); the same 30 s bound; a no-reply reads 0, as a failed du did — the bar keeps its last value, the copy goes on
function localDuBytes(p) {
  return fs.promises.stat(p).then((st) => (!st.isDirectory() ? st.size
    : Promise.resolve().then(() => require('../server/child-starter').childStarter().run('sh', ['-c', DU_SH(p)], { timeoutMs: 30000, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '' } }))
      .then((r) => parseInt(String((r && r.stdout) || ''), 10) || 0, () => 0)), () => 0);
}
function remoteDuBytes(inst, host, p) {
  return inst._run(host, DU_SH(p)).then((r) => parseInt(r.stdout ?? r, 10) || 0).catch(() => 0);
}
// Poll dest size into op.done while a branch we can't instrument runs.
function attachDuPoll(op, duFn) {
  let busy = false; // one measurement at a time: a slow mount never stacks a stat per tick
  const t = setInterval(async () => { if (busy) return; busy = true; try { const b = await duFn(); if (b > op.done) op.done = b; } finally { busy = false; } }, 1200);
  t.unref?.();
  return () => clearInterval(t);
}
// Run a route body detached from the HTTP response: the sink records the
// outcome on the op; the client learns it from the poll.
function opSink(op, opId) {
  const done = (o) => {
    if (op.status === 'cancelled') return;
    if (o && o.error) { op.status = 'error'; op.error = o.error; op.dest = o.dest || op.dest; if (o.code) { op.code = o.code; op.params = o.params; } }
    else { op.status = 'done'; op.dest = o?.dest || op.dest; if (op.total) op.done = op.total; }
    setTimeout(() => transferOps.delete(opId), 5 * 60 * 1000).unref();   // unref: a finished op's table entry never holds a process (B-fcc7's find: a suite lived 5 min past its verdict)
  };
  return { json: done, status: () => ({ json: done }) };
}
// progress:true entry — answer with the opId immediately, run the normal
// route body detached with an opSink. The synchronous-409 overwrite check
// still runs INSIDE the body; in op mode it surfaces as error:'exists',
// which the client maps back onto its confirm-overwrite flow.
function startTransferOp(req, res, body) {
  const opId = 'tf-' + require('crypto').randomBytes(6).toString('hex');
  const op = { done: 0, total: 0, status: 'running', error: null, dest: req.body?.dest || null, cancel: null };
  transferOps.set(opId, op);
  req._transferOp = op;
  res.json({ success: true, opId });
  Promise.resolve(body(req, opSink(op, opId))).catch((e) => {
    if (op.status === 'running') { op.status = 'error'; op.error = e.message; }
    setTimeout(() => transferOps.delete(opId), 5 * 60 * 1000).unref();
  }).then(() => { const src = req.body?.src; if (typeof src === 'string' && src && !req.body?.srcHost) { try { require('../machine-mounts.js').pullTouched(safePath(src)); } catch { } } });   // B-fcc7 (read 6): a stray moved OUT of a pull folder — probed once the move ENDED (its reply came first)
}

// Cross-host transfer relay: stream src (local or remote) → dest (local or
// remote) through the server. Smart selection: same host uses remote cp/mv
// (handled below); different hosts (or host↔local) stream here.
async function crossHostTransfer(req, res, { move }) {
  const { src, dest, srcHost, destHost, overwrite } = req.body || {};
  if (!src || !dest) return res.status(400).json({ error: 'src and dest required' });
  const inst = remoteFsFor(req);
  const op = req._transferOp || null;
  if (op) (srcHost ? remoteDuBytes(inst, srcHost, src) : localDuBytes(safePath(src))).then((b) => { if (b) op.total = b; });
  const count = (stream) => { if (op && stream) stream.on('data', (d) => { op.done += d.length; }); };
  const isDir = async (host, p) => host ? (await inst.info(host, p)).isDirectory : fs.statSync(safePath(p)).isDirectory();
  let dir;
  try { dir = await isDir(srcHost, src); } catch (e) { return res.status(400).json({ error: 'source not found: ' + e.message }); }
  const base = path.posix.basename(src.replace(/\/+$/, ''));
  const destPath = dest.endsWith('/') ? dest + base : dest;
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  // NOTE: inst.info() exits 0 even for missing paths (its trailing echo wins),
  // so existence needs a real `[ -e ]` probe.
  const exists = async (host, p) => host ? await inst._run(host, `[ -e ${shq(p)} ]`).then(() => true, () => false) : fs.existsSync(safePath(p));
  if (!overwrite && await exists(destHost, destPath)) return res.status(409).json({ error: 'exists', dest: destPath });
  if (dir) {
    // Folder transfer: tar stream from the source side piped straight into a
    // tar extract on the destination side (through the server) — no temp
    // archive, arbitrary trees, preserves permissions/symlinks.
    const { spawn } = require('child_process');
    const srcParent = path.posix.dirname(src.replace(/\/+$/, ''));
    const destParent = path.posix.dirname(destPath);
    const destBase = path.posix.basename(destPath);
    let srcChild;
    if (srcHost) srcChild = inst._spawn(srcHost, `cd ${shq(srcParent)} && tar -cf - ${shq(base)}`);
    else { const sp = safePath(src); srcChild = spawn('tar', ['-cf', '-', path.basename(sp)], { cwd: path.dirname(sp) }); }
    srcChild.on('error', (e) => console.warn(`[files] a copy's reader could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
    let stageLocal = null, destChild = null;
    try {
      let localRename = null;
      if (destHost) {
        const h = inst._host(destHost);
        if (overwrite) {
          // merge-overwrite into the existing tree — also the heal path for an
          // earlier interrupted attempt (each file rewritten whole).
          // extract lands as <base>; rename remotely if the target name differs
          const post = destBase === base ? '' : ` && mv ${shq(destParent + '/' + base)} ${shq(destPath)}`;
          destChild = spawn('ssh', [...inst.hosts.sshArgs(h), '--', `mkdir -p ${shq(destParent)} && tar -xf - -C ${shq(destParent)}${post}`], { env: inst.hosts.sshEnv() });
        } else {
          // Staged extract (#22): untar into a marked temp sibling and mv into
          // place only when tar exits clean — a truncated stream (server death
          // mid-copy) makes tar fail, and the guard removes the partial instead
          // of leaving a half tree at the final name. The 409 pre-check above
          // guarantees destPath is free, so the mv never collides.
          const stage = destParent + '/' + PARTIAL_SUFFIX + '-' + Date.now().toString(36);
          destChild = spawn('ssh', [...inst.hosts.sshArgs(h), '--',
            `mkdir -p ${shq(stage)} && { tar -xf - -C ${shq(stage)} && mv ${shq(stage + '/' + base)} ${shq(destPath)} && rm -rf ${shq(stage)}; } || { rm -rf ${shq(stage)}; exit 1; }`], { env: inst.hosts.sshEnv() });
        }
      } else {
        const dp = safePath(destPath), dParent = path.dirname(dp);
        fs.mkdirSync(dParent, { recursive: true });
        if (overwrite) {
          destChild = spawn('tar', ['-xf', '-', '-C', dParent]);
          if (path.basename(dp) !== base) localRename = { from: path.join(dParent, base), to: dp };
        } else {
          // Staged extract (#22), local flavor: an interrupted stream leaves
          // only the marked `.vs-partial-*` dir, never a half tree at dp.
          stageLocal = fs.mkdtempSync(path.join(dParent, PARTIAL_SUFFIX + '-'));
          destChild = spawn('tar', ['-xf', '-', '-C', stageLocal]);
          localRename = { from: path.join(stageLocal, base), to: dp };
        }
      }
      destChild.on('error', (e) => console.warn(`[files] a copy's writer could not be started: ${(e && e.code) || e}`));   // ckpt61 cure 2: the hub survives a start that fails (the road's own failure words owed: the next unit)
      // ckpt61 cure 3: a side that failed at once has no pipe — refused in the copy's own words; the catch below ends the side that
      // DID start (never left holding the hub's handles while the table is full)
      if (!srcChild.stdout || !destChild.stdin) throw new Error('the copy could not be started');
      count(srcChild.stdout);
      if (op) op.cancel = () => { try { srcChild.kill('SIGTERM'); } catch {} try { destChild.kill('SIGTERM'); } catch {} };
      srcChild.stdout.pipe(destChild.stdin);
      let srcErr = '', dstErr = '';
      srcChild.stderr?.on('data', d => { srcErr += d; });
      destChild.stderr?.on('data', d => { dstErr += d; });
      await Promise.all([
        new Promise((resolve, reject) => srcChild.on('close', c => c === 0 ? resolve() : reject(new Error('source read failed: ' + (srcErr.trim().slice(0, 200) || c))))),
        new Promise((resolve, reject) => destChild.on('close', c => c === 0 ? resolve() : reject(new Error('extract failed: ' + (dstErr.trim().slice(0, 200) || c))))),
      ]);
      if (localRename) fs.renameSync(localRename.from, localRename.to);
      if (stageLocal) { try { fs.rmSync(stageLocal, { recursive: true, force: true }); } catch {} }
      if (move) { if (srcHost) await inst.remove(srcHost, src); else fs.rmSync(safePath(src), { recursive: true, force: true }); }
      return res.json({ success: true, dest: destPath });
    } catch (e) {
      // ckpt61 cure 3: a side that failed never leaves the other running — cure 4 (THE KILL LAW): only a child this request STARTED
      // and holds is signalled: a real pid beside the two codes (a start that failed in this same tick has none yet: its kill went to
      // whatever that slot held — 0 is the hub's own process group)
      for (const c of [srcChild, destChild]) { try { if (c && Number.isInteger(c.pid) && c.pid > 0 && c.exitCode === null && c.signalCode === null) c.kill('SIGTERM'); } catch {} }
      if (stageLocal) { try { fs.rmSync(stageLocal, { recursive: true, force: true }); } catch {} }
      return res.status(400).json({ error: e.message });
    }
  }
  // Source byte count for the staged-write size guard below (#22): `cat` ends
  // CLEANLY on a dead pipe's EOF (server death mid-copy), so byte-count
  // equality is the only truncation signal either side has.
  let srcSize = null;
  try {
    srcSize = srcHost
      ? parseInt(String(await inst._run(srcHost, `wc -c < ${shq(src)}`)), 10)
      : fs.statSync(safePath(src)).size;
    if (!Number.isFinite(srcSize)) srcSize = null;
  } catch { srcSize = null; }
  // reader stream
  let reader;
  if (srcHost) reader = inst._spawn(srcHost, `cat '${String(src).replace(/'/g, `'\\''`)}'`).stdout;
  else reader = fs.createReadStream(safePath(src));
  // ckpt61 cure 3 (THE LAW, widened to streams): a remote reader that never started (its child has no stdout at a full table) is
  // refused BEFORE any stream is made; a local one has its error listener at once (its open fails on a later tick)
  if (!reader) return res.status(503).json({ error: 'the copy could not be started (its reader did not start)' });
  reader.on('error', () => { });   // heard here; the transfer's own promise below answers it
  count(reader);
  if (op) op.cancel = () => { try { reader.destroy(new Error('cancelled')); } catch {} };
  try {
    if (destHost) {
      const h = inst._host(destHost);
      const { spawn } = require('child_process');
      // Staged write (#22): land bytes at the .vs-partial name and only mv to
      // the final name when the byte count matches the source — `cat` exits 0
      // on the EOF a dying server produces, which used to leave a truncated
      // file that looked complete at the real destination.
      const part = destPath + PARTIAL_SUFFIX;
      const sizeGuard = srcSize != null ? ` && [ "$(wc -c < ${shq(part)})" -eq ${srcSize} ]` : '';
      const w = spawn('ssh', [...inst.hosts.sshArgs(h), '--',
        `mkdir -p "$(dirname ${shq(destPath)})" && { cat > ${shq(part)}${sizeGuard} && mv -f ${shq(part)} ${shq(destPath)}; } || { rm -f ${shq(part)}; exit 1; }`], { env: inst.hosts.sshEnv() });
      // ckpt61 cure 3: the writer's error listener FIRST — with none, any failed start (a full file table, no ssh) ended the hub;
      // a start that failed at once has no stdin (the reader then ended, the copy refused in its own words)
      let wErr = null;
      w.on('error', (e) => { wErr = e; });
      if (!w.stdin) { try { reader.destroy(); } catch {} throw new Error('the remote write could not be started'); }
      reader.pipe(w.stdin);
      await new Promise((resolve, reject) => { w.on('close', c => c === 0 ? resolve() : reject(new Error(wErr ? `the remote write could not be started (${wErr.code || wErr.message})` : 'remote write failed'))); reader.on('error', reject); });
    } else {
      const dPath = safePath(destPath);
      fs.mkdirSync(path.dirname(dPath), { recursive: true });
      // Staged write (#22): stream into .vs-partial, rename only after a clean
      // 'finish' AND a source-size match (a remote `cat` reader that dies
      // mid-stream still 'end's cleanly) — an interrupted transfer leaves the
      // marked partial, never a truncated file at the final name.
      const part = dPath + PARTIAL_SUFFIX;
      try {
        await new Promise((resolve, reject) => { const w = fs.createWriteStream(part); w.on('error', reject); w.on('finish', resolve); reader.on('error', reject); reader.pipe(w); });   // ckpt61 cure 3: the listeners before the pipe
        if (srcSize != null && fs.statSync(part).size !== srcSize) throw new Error('transfer truncated (source changed or connection dropped)');
        fs.renameSync(part, dPath);
      } catch (e) { try { fs.rmSync(part, { force: true }); } catch {} throw e; }
    }
    if (move) { if (srcHost) await inst.remove(srcHost, src); else fs.rmSync(safePath(src), { force: true }); }
    res.json({ success: true, dest: destPath });
  } catch (e) { res.status(400).json({ error: e.message }); }
}

// Copy file/dir (recursive). dest is the FULL target path.
async function doCopy(req, res) {
  const { srcHost, destHost } = req.body || {};
  const op = req._transferOp || null;
  // cross-host (or host↔local) → relay stream through the server
  if ((srcHost || destHost) && srcHost !== destHost) return crossHostTransfer(req, res, { move: false });
  const R = rfs(req) || (srcHost ? { fs: remoteFsFor(req), host: srcHost } : null);
  if (R) {
    let stop = null;
    if (op) {
      remoteDuBytes(R.fs, R.host, req.body.src).then((b) => { if (b) op.total = b; });
      stop = attachDuPoll(op, () => remoteDuBytes(R.fs, R.host, req.body.dest));
    }
    try { return res.json(await R.fs.copy(R.host, remotePath(req.body.src), remotePath(req.body.dest))); }
    catch (e) { return res.status(400).json(fsErrorBody(e)); }
    finally { stop?.(); }
  }
  const { src, dest, overwrite } = req.body || {};
  if (!src || !dest) return res.status(400).json({ error: 'src and dest required' });
  const s = safePath(src), d = safePath(dest);
  if (s === d) return res.status(400).json({ error: 'source and destination are the same' });
  if (d.startsWith(s + '/')) return res.status(400).json({ error: 'cannot copy a folder into itself' });
  let stop = null;
  try {
    if (!overwrite && (await sfs(req).call('exists', { path: d })).exists) return res.status(409).json({ error: 'exists', dest: d });
    if (op) { localDuBytes(s).then((b) => { if (b) op.total = b; }); stop = attachDuPoll(op, async () => Math.max(await localDuBytes(d), await localDuBytes(d + PARTIAL_SUFFIX))); }
    await sfs(req).call('copy', { src: s, dest: d, overwrite: !!overwrite });
    res.json({ success: true, dest: d });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); } finally { stop?.(); }
}
router.post('/api/file/copy', async (req, res) => {
  if (req.body?.progress) return startTransferOp(req, res, doCopy);
  return doCopy(req, res);
});

// Move file/dir. dest is the FULL target path. Falls back to copy+rm across devices.
async function doMove(req, res) {
  const { srcHost, destHost } = req.body || {};
  const op = req._transferOp || null;
  if ((srcHost || destHost) && srcHost !== destHost) return crossHostTransfer(req, res, { move: true });
  const R = srcHost ? { fs: remoteFsFor(req), host: srcHost } : null;
  if (R) { try { return res.json(await R.fs.move(R.host, remotePath(req.body.src), remotePath(req.body.dest))); } catch (e) { return res.status(400).json(fsErrorBody(e)); } }
  const { src, dest, overwrite } = req.body || {};
  if (!src || !dest) return res.status(400).json({ error: 'src and dest required' });
  const s = safePath(src), d = safePath(dest);
  if (s === d) return res.json({ success: true, dest: d }); // no-op
  if (d.startsWith(s + '/')) return res.status(400).json({ error: 'cannot move a folder into itself' });
  let stop = null;
  try {
    if (!overwrite && (await sfs(req).call('exists', { path: d })).exists) return res.status(409).json({ error: 'exists', dest: d });
    // same-device rename is instant — the poll only matters on the EXDEV
    // copy+rm fallback, where dest grows measurably
    if (op) { localDuBytes(s).then((b) => { if (b) op.total = b; }); stop = attachDuPoll(op, async () => Math.max(await localDuBytes(d), await localDuBytes(d + PARTIAL_SUFFIX))); }
    // worker `move` handles the overwrite-rm + rename/EXDEV-fallback atomically
    await sfs(req).call('move', { src: s, dest: d, overwrite: !!overwrite });
    res.json({ success: true, dest: d });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); } finally { stop?.(); }
}
router.post('/api/file/move', async (req, res) => {
  if (req.body?.progress) return startTransferOp(req, res, doMove);
  return doMove(req, res);
});

// Stream a folder (or file) as a zip download — no temp archive on disk
router.get('/api/download-zip', async (req, res) => {
  const R = rfs(req);
  if (R) return remoteStream(res, () => R.fs.downloadZipTo(R.host, remotePath(req.query.path), res));
  const fp = safePath(req.query.path || '');
  try { if (!(await sfs(req).call('exists', { path: fp })).exists) return res.status(404).json({ error: 'not found' }); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const base = path.basename(fp) || 'archive';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(base)}.zip`);
  const child = spawn('zip', ['-r', '-q', '-y', '-', base], { cwd: path.dirname(fp), stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.pipe(res);
  child.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end(); });
  child.on('close', (code) => { if (code !== 0 && !res.writableEnded) res.end(); });
  res.on('close', () => { try { child.kill(); } catch {} });
});

// Extended properties: stat + optional recursive size/count for directories
router.get('/api/file/stat', async (req, res) => {
  const R = rfs(req);
  if (R) {
    try {
      const s = await R.fs.stat(R.host, remotePath(req.query.path), !!req.query.du);
      // duSize = the field the Properties dialog actually reads; emitting only
      // `du` here meant every REMOTE folder showed "unknown" after a du that
      // had run, shipped, and was dropped (B-b87b shape-drift class). `du` is
      // kept for any older client.
      return res.json({ path: s.path, isDirectory: s.kind === 'directory', size: s.size, modified: s.modified, created: 0, mode: s.mode, uid: s.uid, gid: s.gid, du: s.du, duSize: s.du, duPartial: s.duPartial });
    } catch (e) { return res.status(400).json(fsErrorBody(e)); }
  }
  const fp = safePath(req.query.path || '');
  try {
    const st = await sfs(req).call('stat', { path: fp, entryCount: true });
    const out = {
      path: fp,
      isDirectory: st.isDirectory,
      size: st.size,
      modified: st.mtimeMs,
      created: st.birthtimeMs,
      mode: '0' + (st.mode & 0o777).toString(8),
      uid: st.uid, gid: st.gid,
    };
    if (st.isDirectory) {
      if (st.entryCount != null) out.entryCount = st.entryCount;
      if (req.query.du) {
        // du can crawl for a while on huge trees — bounded, best-effort (child
        // process, not the libuv pool — kept as-is)
        return execFile('du', ['-sb', fp], { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, o) => {
          if (!err) { const n = parseInt(o.split('\t')[0]); if (Number.isFinite(n)) out.duSize = n; }
          res.json(out);
        });
      }
    }
    res.json(out);
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

// r3333 unit 2: the suites' ONE seam — the journal's file moved to a scratch folder (the real logic, never the checkout's data/)
router.__extractJournal = Object.freeze({
  at(file) { if (journalHold) journalHold.stop(); journalHold = null; extractJournal = null; journalTorn = false; EXTRACT_JOURNAL_AT.file = file; },
  refusal: () => extractJournalRefusal(), torn: (names) => extractTornRefusal(names), mark: (fp, d) => markExtractStart(fp, d), clear: (fp, d) => clearExtractMark(fp, d), had: (fp, d) => hadInterruptedExtract(fp, d),
});
module.exports = router;
