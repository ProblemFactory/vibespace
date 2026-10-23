'use strict';
// THE CSP REPORT SINK (lane app-page-csp — design q-043 D6, §5 row P0-d): `POST /api/csp-report`, where a browser posts what
// the app page's REPORT-ONLY policy (src/app-csp.js) would have blocked.
//   · OUTSIDE THE SIGN-IN GATE by design (src/auth.js THE DOORS; test-auth's DOORS row): a browser posts a report with no
//     cookie, and a sandboxed frame's with `Origin: null` — the route judges its own: a report content type (a page on
//     another site cannot send one without a CORS preflight, which this server never answers), ≤ 32 KB read (the rest is
//     never buffered), ≤ 60 posts a minute per address that ADD a line (a repeat is never paced — it writes nothing; a
//     refusal is a count, never a log line).
//   · NEVER A VALUE: a report is reduced by app-csp `reportsOf` (no sample, no query, a URL cut to origin + 3 segments, a
//     segment that looks like a token cut to `<token>` — B-a35f). The one exception: a sink handed an explicit `file` (a
//     chrome suite's scratch hub — scripts/scratch.mjs VIBESPACE_CSP_REPORTS_FILE) keeps a script-src report's sample, the
//     first 40 characters of the handler it names, so the suite's teardown says WHAT was reported (lane chrome-156-drift:
//     the runner's «script-src-attr inline, line 1 column 101, source ""» named no element); data/ never holds one.
//   · ONE LINE per (directive, blocked, source, line) in data/csp-reports.jsonl (0600; past 1 MB it rotates to .1);
//     the keys on disk are read at boot, so a restart re-writes nothing.
//   · ONE For-you notice per NEW (directive, blocked) pair (origin `server`, key `csp-report`) — never per report, never for
//     a frame the page made (app-csp noticeWorthy: a mail's trackers, the design frames' scripts — lines only); a pair
//     noticed at any earlier boot never files again (the line that filed it carries `noticed: true`); ≤ 10 new pairs a day
//     file (a forged flood from a non-browser caller cannot fill the tray — the rest stay lines, and file on a later day).
//   · THE SANITIZER'S PARSE (lane chrome-156-followups — app-csp THE SANITIZER'S PARSE IS NOT A GAP): a script-src-attr
//     inline report with a handler's sample, set by this page's own /bundle.js, is read against the bundle ON DISK — the
//     build its `?v=` names (another build: unread, it keeps its notice) — once per build: the text is read, DOMPurify's
//     parse sites kept (app-csp purifyParseSites — a handful of numbers), the text dropped. A report AT one is a line of
//     kind `sanitizer-parse`: no notice, its own count. No bundle, an unreadable one, any other position ⇒ the report is
//     what it always was. The sample is read to judge and never written (a chrome suite's file keeps it, as before).
//   · THE COUNT (主开发's ruling 2): reports since this boot and lines on disk, the app page's apart from the frames' and
//     the sanitizer's — `GET /api/csp-reports` (behind the sign-in, like every read) answers it; the Diagnostics report
//     shows it as a chip (the sanitizer's own chip only when it has a line).
//   · THE CHROME SUITES' TEARDOWN (scripts/scratch.mjs cspReportsAtExit): a scratch hub's file must be empty when a suite
//     ends — the policy is proven complete before the later lane enforces it.

const fs = require('fs');
const path = require('path');
const C = require('../app-csp.js');

const FILE = 'csp-reports.jsonl';
const BODY_MAX = 32 * 1024;
const FILE_MAX = 1024 * 1024;
const PACE_PER_MIN = 60;
const PACE_ADDRS = 1000;       // addresses the pace remembers (the oldest minute is forgotten first)
const KEYS_MAX = 20000;        // line keys kept in memory (past it the set restarts — a repeat may be written once more)
const NOTICES_PER_DAY = 10;
const NOTICE_KEY = 'csp-report';
if (C.REPORT_PATH !== '/api/csp-report') throw new Error('csp-reports: register() writes the report path as a literal — move it with C.REPORT_PATH');

// the app page's bundle, as server.js serves it (public/ beside src/) — `bundle` names another (test-csp-report)
const BUNDLE = path.join(__dirname, '..', '..', 'public', 'bundle.js');

function create({ dataDir, file: fileOpt = null, bundle = BUNDLE, getUserTodos = () => null, now = Date.now, log = console, fileMax = FILE_MAX, bodyMax = BODY_MAX, pacePerMin = PACE_PER_MIN, noticesPerDay = NOTICES_PER_DAY } = {}) {
  // `file`: the scratch hubs of a chrome suite write where the suite reads (scripts/scratch.mjs, VIBESPACE_CSP_REPORTS_FILE)
  const file = fileOpt || path.join(dataDir, FILE), rotated = file + '.1';
  const samples = !!fileOpt; // a chrome suite's file keeps the sample (above); a hub's own data/ never
  const lines = new Set(), noticed = new Set();
  // THE COUNT: reports since this boot; lines on disk per file (the rotation moves the current file's to .1)
  const zero = () => ({ app: 0, frames: 0, sanitizer: 0 });
  const since = zero(), disk = { [rotated]: zero(), [file]: zero() };
  const sideOf = C.sideOf;
  for (const f of [rotated, file]) {
    let t = '';
    try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const l of t.split('\n')) {
      if (!l) continue;
      try { const r = JSON.parse(l); if (!r || !r.directive) continue; lines.add(C.lineKey(r)); disk[f][sideOf(r)]++; if (r.noticed) noticed.add(C.pairKey(r)); } catch { /* a torn line */ }
    }
  }
  const pace = new Map(); // address → { min, n }
  const stats = { received: 0, written: 0, duplicate: 0, refused: 0, paced: 0, noticed: 0, held: 0, sanitizer: 0, otherBuild: 0 };
  let day = { day: '', n: 0 }, wrote = false;

  function paceOk(addr) {
    const min = Math.floor(now() / 60e3);
    let p = pace.get(addr);
    if (!p || p.min !== min) { pace.delete(addr); p = { min, n: 0 }; pace.set(addr, p); if (pace.size > PACE_ADDRS) pace.delete(pace.keys().next().value); }
    return ++p.n <= pacePerMin;
  }
  function append(row) {
    const s = JSON.stringify(row) + '\n';
    try { if (fs.statSync(file).size + Buffer.byteLength(s) > fileMax) { fs.renameSync(file, rotated); disk[rotated] = disk[file]; disk[file] = zero(); } } catch { /* no file yet */ }
    if (!wrote) { fs.mkdirSync(path.dirname(file), { recursive: true }); wrote = true; }
    fs.appendFileSync(file, s, { mode: 0o600 });
  }
  /** File the pair's ONE notice; true when it is filed (the store exists, today's ten are not spent). */
  function notice(r) {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (day.day !== today) day = { day: today, n: 0 };
    if (day.n >= noticesPerDay) { stats.held++; return false; }
    const todos = getUserTodos && getUserTodos();
    if (!todos) return false;
    const w = C.noticeWords(r);
    try { todos.add(NOTICE_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Page security', text: w.text, detail: w.detail, i18n: w.i18n }); } catch (e) { log.warn?.(`[csp] the For-you notice was not filed — ${e && e.message}`); return false; }
    day.n++; stats.noticed++;
    log.log?.(`[csp] the page reported what the enforced policy would block: ${r.directive} ${r.blocked} (a For-you notice; data/${FILE})`);
    return true;
  }
  // THE SANITIZER'S PARSE SITES of the bundle on disk: { v, sites: Promise<Set<'line:column'>> } — one read per build
  let parse = null;
  async function parseSites() {
    const v = String(Math.floor((await fs.promises.stat(bundle)).mtimeMs));
    if (!parse || parse.v !== v) parse = { v, sites: fs.promises.readFile(bundle, 'utf8').then((t) => new Set(C.purifyParseSites(t).map(([l, c]) => `${l}:${c}`)), () => new Set()) };
    return parse;
  }
  /** Reports carrying a `site` (app-csp reportOf, `site: true`) → `kind: 'sanitizer-parse'` where the bundle's code at
   *  that position is DOMPurify's parse; `site` is dropped from every report. Never throws. */
  async function classify(reports) {
    for (const r of reports) {
      const at = r.site;
      if (!at) continue;
      delete r.site;
      try {
        const p = await parseSites();
        if (at.v && at.v !== p.v) { stats.otherBuild++; continue; }
        if ((await p.sites).has(`${at.line}:${at.column}`)) { r.kind = C.KIND_SANITIZER; stats.sanitizer++; }
      } catch { /* no bundle on disk: the report keeps its notice */ }
    }
    return reports;
  }
  /** Reports (app-csp reportOf rows) → their lines + notices: { written, noticed }. */
  function record(reports, { at = now() } = {}) {
    let written = 0, filed = 0;
    for (const r of reports) {
      const lk = C.lineKey(r), pk = C.pairKey(r);
      since[sideOf(r)]++;
      const fresh = !lines.has(lk);
      const tell = !noticed.has(pk) && C.noticeWorthy(r) && notice(r);
      if (tell) { noticed.add(pk); filed++; }
      if (!fresh && !tell) { stats.duplicate++; continue; }
      if (fresh) { if (lines.size >= KEYS_MAX) lines.clear(); lines.add(lk); }
      try { append({ at: new Date(at).toISOString(), ...r, ...(tell ? { noticed: true } : {}) }); disk[file][sideOf(r)]++; written++; stats.written++; } catch (e) { log.warn?.(`[csp] data/${FILE} was not written — ${e && e.code || e && e.message}`); }
    }
    return { written, noticed: filed };
  }

  function handler(req, res) {
    stats.received++;
    const refuse = (status, error, counter = 'refused') => { stats[counter]++; req.resume(); res.status(status).set('Connection', 'close').json({ error }); };
    if (!C.isReportType(req.headers['content-type'])) return refuse(415, 'not a report');
    const declared = Number(req.headers['content-length']);
    if (declared > bodyMax) return refuse(413, 'report too large');
    const parts = []; let size = 0, over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > bodyMax) { over = true; parts.length = 0; refuse(413, 'report too large'); return; }
      parts.push(c);
    });
    req.on('end', () => {
      if (over) return;
      const got = C.reportsOf(Buffer.concat(parts).toString('utf8'), { sample: samples, site: true });
      // THE PACE counts only a post that would ADD a line: a browser repeats a violation once per occurrence (a mail list
      // full of trackers), and a repeat costs a parse and a lookup — pacing those let a burst of repeats hide the next NEW
      // report (measured: a chrome suite's teardown read 17 lines one run, 1 the next)
      if (got.some((r) => !lines.has(C.lineKey(r))) && !paceOk(String(req.socket && req.socket.remoteAddress || '?'))) { stats.paced++; return res.status(429).json({ error: 'too many reports' }); }
      if (!got.some((r) => r.site)) { record(got); res.status(204).end(); return; }
      classify(got).then(() => { record(got); res.status(204).end(); });
    });
    req.on('error', () => { /* the browser went away */ });
  }

  /** What Diagnostics shows: the app page's reports apart from the frames' and the sanitizer's (since this boot / lines on disk). */
  const onDisk = (side) => disk[rotated][side] + disk[file][side];
  const summary = () => ({ policy: 'report-only', app: { reports: since.app, lines: onDisk('app') }, frames: { reports: since.frames, lines: onDisk('frames') }, sanitizer: { reports: since.sanitizer, lines: onDisk('sanitizer') }, noticed: noticed.size, refused: stats.refused, paced: stats.paced });
  return {
    file, record, classify, handler, summary, stats: () => ({ ...stats, lines: lines.size, pairs: noticed.size }),
    /** `POST /api/csp-report` — BEFORE the json body parser (the route reads its own ≤ 32 KB); `GET /api/csp-reports` = the count */
    register(app) {
      app.post('/api/csp-report', handler); // = C.REPORT_PATH, written as a literal: test-auth's route census reads the path
      app.get('/api/csp-reports', (req, res) => res.json(summary()));
    },
    /** The app page's header: [name, value] */
    header: () => [C.HEADER, C.appPolicy()],
  };
}

module.exports = { create, FILE, BODY_MAX, FILE_MAX, PACE_PER_MIN, NOTICES_PER_DAY, NOTICE_KEY };
