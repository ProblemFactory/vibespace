'use strict';
// OPS ROUTES (decomposition #11): version/update visibility, the detached
// UI-driven self-update op, and maintenance mode. Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

function create({ app, rootDir, wss, WS_OPEN, bootPhase = null }) {
// ── Version / update visibility (⚙ menu shows current + latest at the Update entry) ──
// Latest = the canonical repo's master package.json — fetched LAZILY on
// request only (never a background timer), cached 6h, best-effort: offline
// instances just show the local version.
const versionInfo = { fetchedAt: 0, latest: null, commit: null };
// ONE reader of a file on the canonical repo's master (package.json for
// /api/version, the user changelogs for /api/changelog-diff) → {ok, status,
// text}; never throws. VIBESPACE_CHANGELOG_FIXTURE_DIR (TEST ONLY — a chrome
// suite's scratch server) reads the same names from a local directory instead:
// a gate never reaches the network, and a file missing there answers 404 like
// an older canonical without it.
const CANONICAL_RAW = 'https://raw.githubusercontent.com/ProblemFactory/vibespace/master/';
async function canonicalFile(name, timeoutMs) {
  const fixtureDir = process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR;
  if (fixtureDir) {
    try { return { ok: true, status: 200, text: await fs.promises.readFile(path.join(fixtureDir, name), 'utf8') }; }
    catch (e) { return { ok: false, status: e && e.code === 'ENOENT' ? 404 : 0, text: null }; }
  }
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
let _selfUpdate = null; // { pid, startedAt }
const _updateLogPath = path.join(rootDir, 'data', 'update.log');
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
        if (!buf.toString('utf8').includes('__UPDATE_EXIT:')) return res.json({ success: true, already: true });
      }
    } catch {}
    try { fs.unlinkSync(_updateLogPath); } catch {}
    const fd = fs.openSync(_updateLogPath, 'a');
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
    fs.closeSync(fd);
    child.unref();
    _selfUpdate = { pid: child.pid, startedAt: Date.now() };
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
try { _maintenance = JSON.parse(fs.readFileSync(MAINT_FILE, 'utf-8')); } catch {}
function maintState() {
  if (_maintenance?.active && _maintenance.until && Date.now() > _maintenance.until) _maintenance = { active: false };
  return _maintenance?.active ? _maintenance : { active: false };
}
app.get('/api/maintenance', (req, res) => res.json(maintState()));
app.post('/api/maintenance', (req, res) => {
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
  const json = JSON.stringify({ type: 'maintenance-updated', maintenance: maintState() });
  wss.clients.forEach((c) => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
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
        scope: rec.scope === 'affected' ? 'affected' : 'full', selected: Array.isArray(rec.selected) ? rec.selected.length : 0, lanes: Number(rec.lanes) || 0 };
      if (m[2] === 'pid') { let live = false; try { process.kill(row.pid, 0); live = true; } catch {} if (live) running.push(row); }
      else runs.push(row);
    }
  } catch { /* no directory yet = no runs; not an error */ }
  runs.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  res.json({ runs: runs.slice(0, 12), running });
});

app.get('/api/version', async (req, res) => {
  if (versionInfo.commit === null) {
    try { versionInfo.commit = execFileSync('git', ['-C', rootDir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim(); }
    catch { versionInfo.commit = ''; }
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
