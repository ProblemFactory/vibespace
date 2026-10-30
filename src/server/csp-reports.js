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
//     inline report with a handler's sample, set by one of this page's own scripts that embed a DOMPurify (app-csp
//     PARSE_SCRIPTS — /bundle.js, and mermaid's own copy in /mermaid.js since lane csp-mermaid-sites), is read against
//     THAT script ON DISK (public/) — the build its own `?v=` names (another build: unread, it keeps its notice) — once per
//     script and build: the text is read, DOMPurify's parse sites kept (app-csp purifyParseSites — a handful of numbers),
//     the text dropped. A report AT one of that script's sites is a line of kind `sanitizer-parse`: no notice, its own
//     count. No such script on disk, an unreadable one, any other position (another script's site too) ⇒ the report is
//     what it always was. The sample is read to judge and never written (a chrome suite's file keeps it, as before).
//     The `?v=` names the bytes that ran: a stale stamp on one of these scripts is redirected to its own (static-public).
//     Chrome 156 posts source-file with NO query at all (measured: a classic script, a module, a redirected module) — no
//     stamp to read, so the file on disk is judged: the bytes a lazy import fetches (express.static ignores the query).
//   · A HUB THAT MET THE BUG (lane csp-mermaid-sites r2 — a hub that took mermaid's parse as the app's on .351–.361 kept
//     «1 on the app page» and its For-you notice after the upgrade: the reclassified report shares the old line's key,
//     so it was a duplicate, never written). At boot, a line on disk an earlier version judged the app page's — a
//     script-src-attr inline line set by one of PARSE_SCRIPTS at a line and column — is re-judged against that script
//     on disk now (its site; a line keeps no `?v=`, so a build whose site moved leaves it the app's). One the sanitizer
//     explains is rewritten as a `sanitizer-parse` line (`rejudged`, no `noticed`: its pair may file again for a real
//     gap), the For-you notice it filed (its own words) is closed, and that is said ONCE — one log line; the next boot
//     finds nothing to re-judge. The store not up at boot ⇒ the first report tries again.
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

// the app page's scripts, as server.js serves them (public/ beside src/) — `publicDir` names another (test-csp-report)
const PUBLIC = path.join(__dirname, '..', '..', 'public');

/** A line on disk judged the app page's that one of PARSE_SCRIPTS may have set in the sanitizer's parse → its script, or
 *  null: script-src-attr inline, no kind, the app page's (never a frame's), a line and a column, the script on the
 *  document's origin. */
function recheckOf(r) {
  if (r.kind || r.directive !== 'script-src-attr' || r.blocked !== 'inline' || !C.noticeWorthy(r) || !(r.line > 0) || !(r.column > 0)) return null;
  try { const s = new URL(r.source), d = new URL(r.document); return s.origin === d.origin && C.PARSE_SCRIPTS.includes(s.pathname) ? s.pathname : null; } catch { return null; }
}

function create({ dataDir, file: fileOpt = null, publicDir = PUBLIC, getUserTodos = () => null, now = Date.now, log = console, fileMax = FILE_MAX, bodyMax = BODY_MAX, pacePerMin = PACE_PER_MIN, noticesPerDay = NOTICES_PER_DAY } = {}) {
  // `file`: the scratch hubs of a chrome suite write where the suite reads (scripts/scratch.mjs, VIBESPACE_CSP_REPORTS_FILE)
  const file = fileOpt || path.join(dataDir, FILE), rotated = file + '.1';
  const samples = !!fileOpt; // a chrome suite's file keeps the sample (above); a hub's own data/ never
  const lines = new Set(), noticed = new Set();
  // THE COUNT: reports since this boot; lines on disk per file (the rotation moves the current file's to .1)
  const zero = () => ({ app: 0, frames: 0, sanitizer: 0 });
  const since = zero(), disk = { [rotated]: zero(), [file]: zero() };
  const sideOf = C.sideOf;
  let stale = []; // { raw, r, script }: lines an earlier version judged the app page's that a sanitizer may explain (above)
  const textOf = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } }; // the line file (or its .1), or null
  function load() {
    lines.clear(); noticed.clear(); disk[rotated] = zero(); disk[file] = zero(); stale = [];
    for (const f of [rotated, file]) {
      const t = textOf(f);
      if (t == null) continue;
      for (const l of t.split('\n')) {
        if (!l) continue;
        try {
          const r = JSON.parse(l); if (!r || !r.directive) continue;
          lines.add(C.lineKey(r)); disk[f][sideOf(r)]++; if (r.noticed) noticed.add(C.pairKey(r));
          const script = recheckOf(r); if (script) stale.push({ raw: l, r, script });
        } catch { /* a torn line */ }
      }
    }
  }
  load();
  const pace = new Map(); // address → { min, n }
  const stats = { received: 0, written: 0, duplicate: 0, refused: 0, paced: 0, noticed: 0, held: 0, sanitizer: 0, otherBuild: 0, rejudged: 0 };
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
  // THE SANITIZER'S PARSE SITES of each script on disk: script → { v, sites: Promise<Set<'line:column'>> } — one read per
  // script and build; a script only from app-csp's table (siteOf names no other), its file under public/
  const parse = new Map();
  async function parseSites(script) {
    if (!C.PARSE_SCRIPTS.includes(script)) throw new Error('not a script with a sanitizer');
    const f = path.join(publicDir, script.slice(1));
    const v = String(Math.floor((await fs.promises.stat(f)).mtimeMs));
    if (!parse.has(script) || parse.get(script).v !== v) parse.set(script, { v, sites: fs.promises.readFile(f, 'utf8').then((t) => new Set(C.purifyParseSites(t).map(([l, c]) => `${l}:${c}`)), () => new Set()) });
    return parse.get(script);
  }
  /** Reports carrying a `site` (app-csp reportOf, `site: true`) → `kind: 'sanitizer-parse'` where THAT script's code at
   *  that position is DOMPurify's parse; `site` is dropped from every report. Never throws. */
  async function classify(reports) {
    for (const r of reports) {
      const at = r.site;
      if (!at) continue;
      delete r.site;
      try {
        const p = await parseSites(at.script);
        if (at.v && at.v !== p.v) { stats.otherBuild++; continue; }
        if ((await p.sites).has(`${at.line}:${at.column}`)) { r.kind = C.KIND_SANITIZER; stats.sanitizer++; }
      } catch { /* no such script on disk: the report keeps its notice */ }
    }
    return reports;
  }
  /** A HUB THAT MET THE BUG (above): the lines on disk a sanitizer explains → `sanitizer-parse` lines, the notices they
   *  filed closed, said once → { lines, closed }. Once per boot (the store not up yet: tried again at the next report). */
  let rejudging = null;
  function rejudge() {
    if (rejudging) return rejudging;
    if (!stale.length) return (rejudging = Promise.resolve({ lines: 0, closed: 0 }));
    let todos;
    try { todos = getUserTodos && getUserTodos(); } catch { return Promise.resolve({ lines: 0, closed: 0, later: true }); }
    rejudging = (async () => {
      const hits = [];
      for (const c of stale) { try { if ((await (await parseSites(c.script)).sites).has(`${c.r.line}:${c.r.column}`)) hits.push(c); } catch { /* no such script on disk: the line stays */ } }
      if (!hits.length) return { lines: 0, closed: 0 };
      // the notice a line filed carries its words (noticeWords) — a later filing of the pair names another place, and stays
      const words = new Set(hits.filter((h) => h.r.noticed).map((h) => { const w = C.noticeWords(h.r); return `${w.text}\u0000${w.detail}`; }));
      let closed = 0;
      if (words.size && todos && typeof todos.idsWhere === 'function') {
        const ids = todos.idsWhere((i) => i.sessionKey === NOTICE_KEY && i.status === 'open' && words.has(`${i.text}\u0000${i.detail}`));
        if (ids.length) { try { closed = todos.setStatusMany(ids, 'done', 'system').changed.length; } catch (e) { log.warn?.(`[csp] the For-you notice was not closed — ${e && e.message}`); } }
      }
      const raws = new Set(hits.map((h) => h.raw)), at = new Date(now()).toISOString();
      for (const f of [rotated, file]) {
        const t = textOf(f);
        if (t == null) continue;
        const was = t.split('\n'), out = was.map((l) => { if (!raws.has(l)) return l; const { noticed: _n, ...r } = JSON.parse(l); return JSON.stringify({ ...r, kind: C.KIND_SANITIZER, rejudged: at }); });
        if (out.every((l, i) => l === was[i])) continue;
        try { fs.writeFileSync(f + '.rejudge', out.join('\n'), { mode: 0o600 }); fs.renameSync(f + '.rejudge', f); } catch (e) { log.warn?.(`[csp] data/${FILE} was not re-judged — ${e && e.code || e && e.message}`); }
      }
      load();
      stats.rejudged += hits.length;
      log.log?.(`[csp] ${hits.length} line(s) an earlier version filed as the app page's were the sanitizer's parse (${[...new Set(hits.map((h) => h.script))].join(', ')}, re-judged against app-csp PARSE_SCRIPTS): counted as the sanitizer's now; ${closed} For-you notice(s) they filed closed`);
      return { lines: hits.length, closed };
    })();
    return rejudging;
  }
  if (stale.length) setImmediate(rejudge);

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
      rejudge(); // a hub that met the bug: done at boot, unless the store was not up yet
      classify(got).then(() => { record(got); res.status(204).end(); });
    });
    req.on('error', () => { /* the browser went away */ });
  }

  /** What Diagnostics shows: the app page's reports apart from the frames' and the sanitizer's (since this boot / lines on disk). */
  const onDisk = (side) => disk[rotated][side] + disk[file][side];
  const summary = () => ({ policy: 'report-only', app: { reports: since.app, lines: onDisk('app') }, frames: { reports: since.frames, lines: onDisk('frames') }, sanitizer: { reports: since.sanitizer, lines: onDisk('sanitizer') }, noticed: noticed.size, refused: stats.refused, paced: stats.paced });
  return {
    file, record, classify, handler, summary, rejudge, stats: () => ({ ...stats, lines: lines.size, pairs: noticed.size }),
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
