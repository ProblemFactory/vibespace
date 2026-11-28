'use strict';
// OPS ROUTES (decomposition #11): version/update visibility, the detached
// UI-driven self-update op, and maintenance mode. Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { childStarter } = require('./child-starter');   // B-360d part 1 (r2303): the version's git starts in the small process, never the hub

function create({ app, rootDir, wss, WS_OPEN, bootPhase = null, throwaway = () => require('./throwaway-root.js').throwaway(rootDir), throwawayView = () => require('./throwaway-root.js').view() }) {   // `throwaway`: THE ONE TEST (B-ba47 shape H r1278), a seam for the suites
// ── Version / update visibility (⚙ menu shows current + latest at the Update entry) ──
// Latest = the canonical repo's master package.json — fetched LAZILY on
// request only (never a background timer), cached 6h, best-effort: offline
// instances just show the local version.
const versionInfo = { fetchedAt: 0, latest: null, commit: null };
let commitAsk = null;   // the first ask's git run, shared by every ask while it runs (B-360d part 1)
// ONE reader of a file on the canonical repo's master (package.json for
// /api/version, the user changelogs for /api/changelog-diff) → {ok, status,
// text}; never throws. VIBESPACE_CHANGELOG_FIXTURE_DIR (TEST ONLY — a chrome
// suite's scratch server) reads the same names from a local directory instead:
// a gate never reaches the network, and a file missing there answers 404 like
// an older canonical without it.
const CANONICAL_RAW = 'https://raw.githubusercontent.com/ProblemFactory/vibespace/master/';
let saidOffline = false, tmpJudged = null;
// THE ONE TEST (B-ba47 shape H, 主开发 r1278: rule 3 asks it): a THROWAWAY copy — a linked worktree wherever it sits, or a temp root
// handed a temp home — answers offline; a person's own clone under a temp root, run with their own home, asks. Judged once; a judge
// that throws is never «online».
const tmpRootOf = () => (tmpJudged = tmpJudged || Promise.resolve().then(() => (throwaway() === false ? null
  : `the hub's root ${rootDir} is a throwaway copy (src/server/throwaway-root.js: a linked worktree, or a temp folder handed a temp home — never a person's instance)`))
  .catch((e) => `the hub's root ${rootDir} could not be judged (${(e && e.message) || e}) — never online on a guess`));
async function canonicalFile(name, timeoutMs) {
  const fixtureDir = process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR;
  if (fixtureDir) {
    try { return { ok: true, status: 200, text: await fs.promises.readFile(path.join(fixtureDir, name), 'utf8') }; }
    catch (e) { return { ok: false, status: e && e.code === 'ENOENT' ? 404 : 0, text: null }; }
  }
  // B-9dd0 (lane bl-scratch, 2026-11-17): A GATE NEVER ASKS GITHUB. A scratch hub under a suite answered /api/version by
  // fetching this file (an acceptance's socket sampler saw raw.githubusercontent.com during a chrome suite) — an egress a test
  // must never make. A THROWAWAY hub (src/server/throwaway-root.js, the one test — every lane's worktree hub and every suite's
  // scratch hub, flag or not, the push gate and the mirror too) or one that runs under VS_NO_REAL_CLI=1 (every lane env,
  // acceptance run, the test machine) answers offline (status 0: the menu shows the local version only); a suite that needs
  // the files hands the fixture dir above.
  // B-9dd0 cure (the readers, 08:54Z) → B-ba47 shape H r1278: ONE judge for every gate — the boot's verdict, the root and the
  // temp roots realpath'd there (a scratch hub reached through a linked temp path is one too); the first offline answer says why
  // in one journal line
  const offline = process.env.VS_NO_REAL_CLI === '1' ? 'VS_NO_REAL_CLI=1' : await tmpRootOf();
  if (offline) { if (!saidOffline) { saidOffline = true; console.log(`[version] the canonical repo is not asked (answered offline): ${offline}`); } return { ok: false, status: 0, text: null }; }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(CANONICAL_RAW + name, { signal: ctl.signal });
    return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : null };
  } catch { return { ok: false, status: 0, text: null }; }
  finally { clearTimeout(t); }
}
// ── UI-driven self-update (2.111.21): the update runs as a DETACHED op with
// its output in data/update.log; the client shows a progress dialog, keeps
// polling across the restart (KillMode=process / the container supervisor
// leave the detached script alive), and reloads when /api/version changes.
// Replaced the "suddenly opens a terminal that just sits there" flow.
let _selfUpdate = null; // { pid, startedAt, child }
const _updateLogPath = path.join(rootDir, 'data', 'update.log');
// ckpt61 cure 2: A START THAT FAILED AT ONCE ENDS THE RUN, SAID. The route answered «started» before the queued 'error' arrived; the
// dialog reads the log for its end mark (src/lib/app.js: «Update failed (exit N)») — without it, it spun to its ten-minute timeout.
// The failure and the mark are written into the log, and answered from here when even that write was refused (a full table)
let _selfUpdateFailed = null; // { why }
const failedStart = (why) => `\nthe update could not be started (${why})\n__UPDATE_EXIT:127\n`;
app.post('/api/self-update', (req, res) => {
  try {
    if (!fs.existsSync(path.join(rootDir, 'scripts', 'update.sh'))) return res.status(400).json({ error: 'update script not found' });
    if (_selfUpdate) { try { process.kill(_selfUpdate.pid, 0); return res.json({ success: true, already: true }); } catch { _selfUpdate = null; } }
    // The pid map dies with the server (the update's own restart!) while the
    // DETACHED script keeps running — unlinking its live log here sent the
    // first run's remaining output to an unlinked inode and spawned a second
    // concurrent update.sh. A recent log without the exit sentinel = a run
    // still in flight; hand the dialog the existing log instead. (update.sh
    // also flocks data/.update.lock as the hard guard.)
    try {
      const st = fs.statSync(_updateLogPath);
      if (Date.now() - st.mtimeMs < 10 * 60 * 1000) {
        const fd = fs.openSync(_updateLogPath, 'r');
        const len = Math.min(st.size, 4000);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, st.size - len);
        fs.closeSync(fd);
        if (!buf.toString('utf8').includes('__UPDATE_EXIT:') && !_selfUpdateFailed) return res.json({ success: true, already: true });   // a run that failed at once is not in flight
      }
    } catch {}
    try { fs.unlinkSync(_updateLogPath); } catch {}
    const fd = fs.openSync(_updateLogPath, 'a');
    _selfUpdateFailed = null;
    // Run the LATEST update script, not the checkout's (2.368.11, the history-
    // rewrite stranding): a fix to update logic rides the very update that is
    // broken — the old script could never pull it (chicken-and-egg; the miku
    // fleet froze exactly this way). origin/master's script is the same trust
    // domain as the code the update is about to pull and run anyway; fetch
    // failure (offline) falls back to the checkout's copy.
    const child = spawn('bash', ['-c',
      'UP=scripts/update.sh; ' +
      'if git fetch origin master --quiet 2>/dev/null && git show origin/master:scripts/update.sh > data/.update-latest.sh 2>/dev/null && [ -s data/.update-latest.sh ]; then UP=data/.update-latest.sh; fi; ' +
      'bash "$UP"; echo "__UPDATE_EXIT:$?"'], {
      cwd: rootDir, detached: true, stdio: ['ignore', fd, fd],
      env: { ...process.env, VIBESPACE_SUPERVISED: process.env.VIBESPACE_SUPERVISED || '1' },
    });
    // ckpt61: its error listener at once — a start that fails (a full file table, no bash) queues an 'error' for the next tick, and
    // with no listener that is an uncaught exception: the hub ended. The update did not start: said in the journal, its mark cleared
    child.on('error', (e) => {
      const why = (e && e.code) || String(e);
      console.warn(`[update] the update could not be started: ${why}`);
      if (_selfUpdate && _selfUpdate.child === child) _selfUpdate = null;
      _selfUpdateFailed = { why };
      fs.promises.appendFile(_updateLogPath, failedStart(why)).catch(() => { });   // the dialog reads it (async: the log may sit on a network mount); refused ⇒ the status answers it
    });
    fs.closeSync(fd);
    child.unref();
    _selfUpdate = { pid: child.pid, startedAt: Date.now(), child };
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/self-update/status', (req, res) => {
  let log = '';
  try {
    const st = fs.statSync(_updateLogPath);
    const fd = fs.openSync(_updateLogPath, 'r');
    const len = Math.min(st.size, 6000);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    log = buf.toString('utf8');
  } catch {}
  if (_selfUpdateFailed && !log.includes('__UPDATE_EXIT:')) log += failedStart(_selfUpdateFailed.why);   // cure 2: the dialog is told
  let running = false;
  if (_selfUpdate) { try { process.kill(_selfUpdate.pid, 0); running = true; } catch {} }
  res.json({ running, log });
});

// ── Maintenance mode (2.189.0): operator-onsite transparency ──
// When someone (an admin / a support agent) is actively connected to this
// instance troubleshooting it, a persistent banner tells the user so. State
// survives server restarts (troubleshooting often restarts the server) and
// AUTO-EXPIRES (default 2h, max 24h) so a forgotten toggle can't linger.
const MAINT_FILE = path.join(rootDir, 'data', 'maintenance.json');
let _maintenance = null;
// r3333 unit 3 (lane lg-group-parents, the store-read family): THE BANNER's RECORD IS HELD when it cannot be read — the release read
// any failure as «no banner» (the operator-connected banner was lost) and the next POST wrote over it. HELD: GET answers no banner
// (the page shows none), every POST is refused BY NAME before anything changes (each one rewrites the whole record: an update
// would end a banner the file holds, an on/off would write over another operator's banner unseen), it is read again off the loop
// and at its read the banner is back and broadcast. Torn bytes: kept aside ONCE, then no banner.
const MAINT_WORDS = 'the maintenance banner\'s record (maintenance.json) could not be read — nothing was changed; it is read again by itself, try again in a minute';
const maintValid = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const maintSay = () => { const json = JSON.stringify({ type: 'maintenance-updated', maintenance: maintState() }); wss.clients.forEach((c) => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } }); };
const maintHold = require('../store-read-hold.js').create({ file: MAINT_FILE, valid: maintValid, aside: (mark) => `${MAINT_FILE}.corrupt-${mark}`, words: () => MAINT_WORDS, code: 'maintenance_unread',
  log: (m) => console.warn(`[maintenance] ${m}`), onLift: (v) => { _maintenance = maintValid(v) ? v : null; try { maintSay(); } catch {} } });
{ let read; try { read = { text: fs.readFileSync(MAINT_FILE, 'utf-8') }; } catch (error) { read = { error }; }
  const a = require('../store-read.js').storeAnswer(read, { valid: maintValid });
  if (maintHold.start(a) === 'data') _maintenance = a.value; }
function maintState() {
  if (_maintenance?.active && _maintenance.until && Date.now() > _maintenance.until) _maintenance = { active: false };
  return _maintenance?.active ? _maintenance : { active: false };
}
app.get('/api/maintenance', (req, res) => res.json(maintState()));
// B-ba47 shape H (the plan's (b)): what a copy run from a git worktree says on its first screen — its own home, the two doors
app.get('/api/throwaway', (req, res) => res.json(throwawayView()));
app.post('/api/maintenance', (req, res) => {
  if (maintHold.held()) return res.status(503).json({ error: MAINT_WORDS, code: 'maintenance_unread' });   // r3333 unit 3: before anything changes
  const b = req.body || {};
  if (b.update != null && _maintenance?.active) {
    // live progress line ("checking the transcript cache…") — the banner shows
    // the latest one and keeps a timeline; each update EXTENDS the expiry
    // (active troubleshooting must not expire mid-work; hard cap 24h from start)
    const upd = { ts: Date.now(), text: String(b.update).slice(0, 300) };
    _maintenance.updates = [...(_maintenance.updates || []), upd].slice(-50);
    _maintenance.until = Math.min((_maintenance.since || Date.now()) + 24 * 3600e3,
      Math.max(_maintenance.until || 0, Date.now() + 3600e3));
  } else if (b.on) {
    const hours = Math.min(24, Math.max(0.25, Number(b.hours) || 2));
    _maintenance = {
      active: true,
      message: String(b.message || '').slice(0, 300),
      by: String(b.by || '').slice(0, 80),
      since: Date.now(),
      until: Date.now() + hours * 3600e3,
      updates: [],
    };
  } else {
    _maintenance = { active: false };
  }
  try { fs.writeFileSync(MAINT_FILE, JSON.stringify(_maintenance)); } catch {}
  maintSay();
  res.json({ success: true, maintenance: maintState() });
});

// ── HEAVY RELEASE-GATE RESULTS (2026-09-07, the fast/heavy gate split) ──
// The pre-push hook runs the FAST tier and then launches the HEAVY tier
// detached (scripts/ci.mjs --heavy), which writes data/ci-heavy/<sha>.{green,
// red}. That verdict lands minutes after the developer walked away, so it
// needs a place a human can find it without knowing the file layout: the
// ⚙ → Diagnostics report reads this route (and `npm run ci:status` prints the
// same records at the terminal). Read-only, tiny local JSON files, no git —
// "is HEAD blocked?" is an ancestry question and belongs to the CLI.
const CI_HEAVY_DIR = path.join(rootDir, 'data', 'ci-heavy');
app.get('/api/ci-heavy', (req, res) => {
  const runs = [], running = [];
  try {
    for (const f of fs.readdirSync(CI_HEAVY_DIR)) {
      // `skipped` is not a verdict, it is the ABSENCE of one, recorded out
      // loud (2026-09-07 round 2): a commit whose heavy run never got the
      // machine lock has no green and no red, and without this row that is
      // indistinguishable from "nobody has pushed lately".
      const m = /^([0-9a-f]{7,40})\.(green|red|pid|skipped)$/.exec(f);
      if (!m) continue;
      let rec = {};
      try { rec = JSON.parse(fs.readFileSync(path.join(CI_HEAVY_DIR, f), 'utf-8')); } catch {}
      // `absent` (2026-09-07 round 6) is how many of those `suites` the gated
      // COMMIT does not contain — a heavy run is isolated at a sha, and this
      // gate's table can name suites that sha never had (measured: 42 of 97 at
      // master~300). Without it "97 suites" is a number the record itself
      // contradicts, which is the marker-kind lesson one field smaller.
      const row = { sha: rec.sha || m[1], result: m[2] === 'pid' ? 'running' : m[2], startedAt: rec.startedAt || 0, endedAt: rec.endedAt || 0, ms: rec.ms || 0, suites: rec.suites || 0, absent: Array.isArray(rec.absent) ? rec.absent.length : 0, failed: Array.isArray(rec.failed) ? rec.failed.slice(0, 20) : [], flaky: Array.isArray(rec.flaky) ? rec.flaky.slice(0, 20) : [], pid: rec.pid || 0, reason: typeof rec.reason === 'string' ? rec.reason.slice(0, 200) : '', unlocked: !!rec.unlocked,
        // 2026-09-15: a push-time run is IMPACT-SCOPED (only the suites the
        // pushed range touches); `scope` says so and `selected` is how many,
        // so a green row cannot read as the full tier when it was not. A marker
        // written before the field is a full run. `lanes` = the parallel lane
        // count the run used (0 = written before lanes existed).
        scope: rec.scope === 'affected' ? 'affected' : 'full', selected: Array.isArray(rec.selected) ? rec.selected.length : 0, lanes: Number(rec.lanes) || 0,
        // U2 L4 (主开发 r5567): a green that PASSED WITH PLACED LINES (scripts/fixtures/placed-reds.json) says how many — the report never reads it GREEN
        placed: Array.isArray(rec.placed) ? rec.placed.reduce((a, x) => a + (Number(x && x.n) || 0), 0) : 0 };
      if (m[2] === 'pid') { let live = false; try { process.kill(row.pid, 0); live = true; } catch {} if (live) running.push(row); }
      else runs.push(row);
    }
  } catch { /* no directory yet = no runs; not an error */ }
  runs.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  res.json({ runs: runs.slice(0, 12), running });
});

// lane runtime-floor: the node this server runs, its floor (src/runtime-floor.js), the instance's own runtime and the boot
// check — ⚙ Diagnostics report says it (src/server/runtime-boot.js answer)
app.get('/api/runtime', (req, res) => res.json(require('./runtime-boot.js').answer()));
app.get('/api/version', async (req, res) => {
  if (versionInfo.commit === null) {
    // B-360d part 1 (主开发 r2303): git runs THROUGH THE HUB'S STARTER (src/server/child-starter.js), bounded 3 s, never on the
    // loop: run synchronously it held the loop for its whole run at the first ask after a start (21–39 ms on a stand-in). The
    // commit is KEPT as before (git's failure too: ''); the starter's «no answer» is no answer (the next ask runs it again); asks
    // while it runs share the one run. Gated by scripts/test-first-ask-children.mjs.
    commitAsk = commitAsk || childStarter().run('git', ['-C', rootDir, 'rev-parse', '--short', 'HEAD'], { timeoutMs: 3000, capture: true, envAdd: { PATH: process.env.PATH || '' } })
      .then((r) => (!r || r.unknown ? null : r.code === 0 && !r.timedOut && !r.overflow ? String(r.stdout || '').trim() : ''), () => null)
      .then((c) => { if (c !== null && versionInfo.commit === null) versionInfo.commit = c; })
      .finally(() => { commitAsk = null; });
    await commitAsk;
  }
  // 15min TTL (was 6h — during active release evenings the gear menu showed
  // "no update" for hours; real report). ?fresh=1 (the update dialog / menu
  // open) bypasses the cache with a 60s floor so clicks can't hammer GitHub.
  const _verTtl = req.query.fresh ? 60 * 1000 : 15 * 60 * 1000;
  if (Date.now() - versionInfo.fetchedAt > _verTtl) {
    versionInfo.fetchedAt = Date.now(); // stamped even on failure — no hammering while offline
    const r = await canonicalFile('package.json', 5000);
    if (r.ok) { try { versionInfo.latest = JSON.parse(r.text).version || null; } catch {} }
  }
  res.json({ version: require(require('path').join(rootDir, 'package.json')).version, commit: versionInfo.commit || null, latest: versionInfo.latest, phase: bootPhase ? bootPhase.snapshot().phase : 'ready' });
});
// The boot phase (B-0ece): cheap, no network — the boot splash, the update dialog and the stale-tab reload poll it
// and reload / restore only on `ready`. An older server has no route (404) = ready, the pre-phase rule.
app.get('/api/boot', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: require(require('path').join(rootDir, 'package.json')).version, ...(bootPhase ? bootPhase.snapshot() : { phase: 'ready', waitingOn: [], stuck: [], sessions: 0 }) });
});

// Changelog diff for the update-confirm dialog (user directive: clicking
// Update shows every change between the running and latest versions first).
// The canonical repo's user changelog IN THE DEVICE'S LANGUAGE (2026-09-30:
// CHANGELOG.md is en, CHANGELOG.zh.md / CHANGELOG.ja.md the same entries in
// zh / ja — docs/changelog-style.md), lazily fetched + cached per language
// like /api/version. An entry the language file lacks (an older canonical
// without the file, or a version not translated yet) is served in English —
// each entry says which language it is (`lang`).
function versionNewerThan(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}
const CHANGELOG_FILES = { en: 'CHANGELOG.md', zh: 'CHANGELOG.zh.md', ja: 'CHANGELOG.ja.md' };
// lang → { text, fetchedAt }; text null = the canonical has no such file (404)
// or it was never fetched. A network failure keeps the last text (offline-safe).
const changelogCache = {};
async function changelogText(lang, fresh) {
  const c = changelogCache[lang] || (changelogCache[lang] = { text: null, fetchedAt: 0 });
  if (Date.now() - c.fetchedAt > (fresh ? 60 * 1000 : 15 * 60 * 1000)) {
    c.fetchedAt = Date.now(); // stamped even on failure — offline-safe
    const r = await canonicalFile(CHANGELOG_FILES[lang], 8000);
    if (r.ok) c.text = r.text;
    else if (r.status === 404) c.text = null; // the canonical has no file in this language (yet)
  }
  return c.text;
}
/** `## <version>` blocks of one changelog text, keyed by version. */
function changelogEntries(text) {
  const all = [];
  for (const block of String(text || '').split(/\n## /).slice(1)) {
    const nl = block.indexOf('\n');
    const head = (nl < 0 ? block : block.slice(0, nl)).trim();
    const ver = (head.match(/^(\d+\.\d+\.\d+)/) || [])[1];
    if (!ver) continue;
    all.push({ version: ver, head, body: nl < 0 ? '' : block.slice(nl + 1).trim() });
  }
  return all;
}
app.get('/api/changelog-diff', async (req, res) => {
  const cur = require(require('path').join(rootDir, 'package.json')).version;
  const lang = Object.prototype.hasOwnProperty.call(CHANGELOG_FILES, req.query.lang) ? req.query.lang : 'en';
  const fresh = !!req.query.fresh;
  const [enText, langText] = await Promise.all([changelogText('en', fresh), lang === 'en' ? null : changelogText(lang, fresh)]);
  const inLang = new Map(changelogEntries(langText).map((e) => [e.version, e]));
  // The English file is the canonical list of versions; each entry comes in
  // the requested language when that file has it, else in English.
  const all = changelogEntries(enText).map((e) => (inLang.has(e.version) ? { ...inLang.get(e.version), lang } : { ...e, lang: 'en' }));
  const entries = all.filter((e) => versionNewerThan(e.version, cur));
  // Already on the latest? Show the CURRENT version's own changelog entry
  // (matched, else the newest) instead of an empty dialog (user request).
  const atLatest = entries.length === 0;
  if (atLatest && all.length) entries.push(all.find((e) => e.version === cur) || all[0]);
  res.json({ current: cur, latest: versionInfo.latest || null, lang, entries, atLatest });
});


  return { versionInfo, maintState };
}
module.exports = { create };
