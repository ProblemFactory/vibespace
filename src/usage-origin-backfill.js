'use strict';
/**
 * usage-origin-backfill.js — THE ONE-SHOT BACKFILL of `origin` onto the
 * permanent usage ledger (2026-09-10, run by migration
 * `2026-09-usage-origin-backfill`).
 *
 * WHAT IT REPAIRS. From this release every ledger event says WHICH kind of
 * transcript produced it — 'main' (the conversation), 'subagent', 'workflow' —
 * plus the workflow run id and the agent file stem, and an agent event's `cwd`
 * is the PARENT project's cwd with its own directory riding along as `wcwd`
 * (src/usage-walker.js). Events written BEFORE that say nothing: the Usage
 * window cannot separate what an agent spent from what the conversation spent,
 * and every agent that ran in a git worktree is its own row in "By project"
 * (272 of this instance's 3,155 agent transcripts carry a worktree cwd,
 * measured 2026-09-10).
 *
 * HOW IT NAMES A ROW. The transcript tree is walked ONCE to build
 * rid → {origin, wf, agent, own cwd, parent cwd}; every ledger row is then
 * looked up by its rid:
 *   · found in a main transcript  ⇒ origin 'main' (nothing else changes)
 *   · found in an agent transcript ⇒ origin/wf/agent stamped, cwd rewritten to
 *     the parent project's cwd, the agent's own dir kept as `wcwd` when it
 *     differs
 *   · a codex row (`be:'codex'`) ⇒ 'main' with NO lookup: the codex store
 *     merges a sub-agent's rollout into the parent thread's read, so a rollout
 *     is never a second kind of file (the walker states the same rule)
 *   · anything else ⇒ origin 'unknown', HONESTLY — a transcript that has been
 *     rotated away, or a remote host's row whose transcripts live on another
 *     machine. "unknown" is a real answer; guessing 'main' would quietly make
 *     the agent split under-report exactly where it matters.
 * A rid that appears in BOTH a main and an agent transcript (a sidechain
 * record written to both) is 'main': that is the file the parent conversation
 * owns, and the two carry the same project cwd anyway.
 *
 * RULES (the migration-runner contract): archive, never destroy; idempotent; a
 * failure is loud and retried next boot. Each shard is COPIED verbatim under
 * data/archive/ before it is rewritten, and rewritten atomically (tmp+rename).
 * A row that already carries an `origin` is left exactly as it is, so a second
 * run — or a run after some rows were re-scanned by the new walker — changes
 * nothing. An unparseable line is kept verbatim: we only touch what we can
 * NAME.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isFixtureProjectDir, isFixtureSid } = require('./fixture-guard.js');
// THE SAME project-cwd ladder the walk uses (src/usage-walker.js): this
// migration must answer "which repo did this agent work for" exactly the way
// the walk answers it from now on, or the rows it names and the rows the walk
// names disagree about the same conversation. Not a copy — the export.
const { makeProjectCwdReader } = require('./usage-walker.js');

const USAGE_PAT = Buffer.from('"usage"');
const CWD_PAT = Buffer.from('"cwd"');
const RID_RE = /"requestId":"([^"]{1,256})"/;
const CWD_RE = /"cwd":"([^"]{0,4096})"/; // no alternation: this runs over untrusted MB-sized lines
const CHUNK = 8 * 1024 * 1024;

const _day = (now) => new Date(now).toISOString().slice(0, 10);
function _writeAtomic(fp, text) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp + '.tmp', text);
  fs.renameSync(fp + '.tmp', fp);
}

/** Feed every COMPLETE line of a file to onLine as a Buffer view (no copy, no
 *  utf-8 decode until the caller asks for one) — a transcript can be hundreds
 *  of MB and must never be materialized whole. */
function _eachLine(fp, onLine) {
  let fd;
  try { fd = fs.openSync(fp, 'r'); } catch { return 0; }
  let read = 0;
  try {
    let rest = Buffer.alloc(0);
    for (;;) {
      const buf = Buffer.alloc(CHUNK);
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n <= 0) break;
      read += n;
      const data = rest.length ? Buffer.concat([rest, buf.subarray(0, n)]) : buf.subarray(0, n);
      let lineStart = 0, idx;
      while ((idx = data.indexOf(10, lineStart)) !== -1) { onLine(data.subarray(lineStart, idx)); lineStart = idx + 1; }
      rest = Buffer.from(data.subarray(lineStart)); // copy: `data` is about to be reused
    }
    if (rest.length) onLine(rest);
  } catch { } finally { try { fs.closeSync(fd); } catch { } }
  return read;
}

/** Walk ~/.claude/projects once → { map: Map<rid, fileIndex>, files: [...] }.
 *  The file list mirrors src/usage-walker.js exactly (top-level transcripts,
 *  <sid>/subagents/*.jsonl, <sid>/subagents/workflows/<wf>/agent-*.jsonl) and
 *  refuses the fixture convention for the same reason the walk does. */
function buildRidOrigins({ projectsDir, onProgress = null }) {
  const files = [];               // {origin, wf, agent, sid, own, parent}
  const map = new Map();          // rid → index into files
  const projectCwdFor = makeProjectCwdReader();
  let bytes = 0;
  let projDirs = [];
  try { projDirs = fs.readdirSync(projectsDir); } catch { }
  for (const pd of projDirs.sort()) {
    if (isFixtureProjectDir(pd)) continue;
    const pdAbs = path.join(projectsDir, pd);
    let entries = [];
    try { entries = fs.readdirSync(pdAbs); } catch { continue; }
    const found = [];             // {fp, sid, origin, wf?, agent?}
    const mains = [];
    for (const fn of entries.sort()) {
      if (fn.endsWith('.jsonl')) { found.push({ fp: path.join(pdAbs, fn), sid: fn.replace(/\.jsonl$/, ''), origin: 'main' }); mains.push(path.join(pdAbs, fn)); continue; }
      if (!/^[0-9a-f-]{36}$/i.test(fn)) continue;
      const subDir = path.join(pdAbs, fn, 'subagents');
      let subs = []; try { subs = fs.readdirSync(subDir); } catch { continue; }
      for (const sf of subs.sort()) {
        if (sf.endsWith('.jsonl')) { found.push({ fp: path.join(subDir, sf), sid: fn, origin: 'subagent', agent: sf.replace(/\.jsonl$/, '') }); continue; }
        if (sf !== 'workflows') continue;
        let wfs = []; try { wfs = fs.readdirSync(path.join(subDir, 'workflows')); } catch { continue; }
        for (const wf of wfs.sort()) {
          let afs = []; try { afs = fs.readdirSync(path.join(subDir, 'workflows', wf)); } catch { continue; }
          for (const af of afs.sort()) if (af.startsWith('agent-') && af.endsWith('.jsonl')) found.push({ fp: path.join(subDir, 'workflows', wf, af), sid: fn, origin: 'workflow', wf, agent: af.replace(/\.jsonl$/, '') });
        }
      }
    }
    mains.sort();
    // MAIN FILES FIRST: a rid written to both a parent transcript and an agent
    // transcript belongs to the conversation (below, an agent hit never
    // overwrites a main hit — this order just makes that the common path).
    found.sort((a, b) => (a.origin === 'main' ? 0 : 1) - (b.origin === 'main' ? 0 : 1));
    for (const f of found) {
      if (isFixtureSid(f.sid)) continue;
      let st; try { st = fs.statSync(f.fp); } catch { continue; }
      if (!st.isFile()) continue;
      const idx = files.length;
      const desc = { origin: f.origin, wf: f.wf || null, agent: f.agent || null, sid: f.sid, own: null, parent: null };
      files.push(desc);
      bytes += _eachLine(f.fp, (line) => {
        if (desc.own === null && line.indexOf(CWD_PAT) >= 0) {
          const m = CWD_RE.exec(line.toString('utf8'));
          if (m) { try { desc.own = JSON.parse('"' + m[1] + '"'); } catch { desc.own = m[1]; } }
        }
        if (line.indexOf(USAGE_PAT) < 0) return;
        const text = line.toString('utf8');
        let rid = null;
        const q = RID_RE.exec(text);
        if (q) rid = q[1];
        else {
          let r; try { r = JSON.parse(text); } catch { return; }
          if (r.type !== 'assistant' || !r.message || !r.message.usage) return;
          rid = r.requestId || r.message.id || r.uuid || null;
        }
        if (!rid) return;
        const prev = map.get(rid);
        // FIRST WRITER WINS, and main files were sorted first: a sidechain rid
        // present in both never loses its conversation.
        if (prev === undefined || (files[prev].origin !== 'main' && desc.origin === 'main')) map.set(rid, idx);
      });
      if (desc.origin !== 'main') desc.parent = projectCwdFor(pdAbs, pd, f.sid, mains);
      onProgress?.(files.length, bytes);
    }
  }
  return { map, files, bytes };
}

/**
 * @param {object} o
 * @param {string} o.dataDir        the instance's data/ directory
 * @param {string} o.id             the migration id (stamped on every changed row)
 * @param {string} [o.projectsDir]  ~/.claude/projects
 * @param {number} [o.now]
 * @param {boolean} [o.dryRun]      report only; touch nothing
 */
function backfillUsageOrigin({ dataDir, id, projectsDir = path.join(os.homedir(), '.claude', 'projects'), now = Date.now(), dryRun = false }) {
  const t0 = Date.now();
  const historyDir = path.join(dataDir, 'usage-history');
  const archiveDir = path.join(dataDir, 'archive', `usage-origin-backfill-${_day(now)}`);
  const report = {
    shards: 0, shardsRewritten: 0, rowsIn: 0, changed: 0, already: 0, unparseable: 0,
    origins: { main: 0, subagent: 0, workflow: 0, unknown: 0 },
    cwdRewritten: 0, wcwdStamped: 0, codexRows: 0,
    transcripts: 0, transcriptBytes: 0, rids: 0, archived: [], dryRun: !!dryRun, ms: 0,
  };

  let shardNames = [];
  try { shardNames = fs.readdirSync(historyDir).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort(); } catch { }
  report.shards = shardNames.length;
  if (!shardNames.length) { report.ms = Date.now() - t0; return report; }

  const { map, files, bytes } = buildRidOrigins({ projectsDir });
  report.transcripts = files.length; report.transcriptBytes = bytes; report.rids = map.size;

  for (const name of shardNames) {
    const fp = path.join(historyDir, name);
    let text = ''; try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const out = [];
    let dirty = false;
    for (const line of text.split('\n')) {
      if (!line) continue;
      report.rowsIn++;
      let e = null; try { e = JSON.parse(line); } catch { }
      // Only an OBJECT can be named. Anything else (an unparseable line, a bare
      // scalar) stays verbatim — we only rewrite what we can read.
      if (!e || typeof e !== 'object' || Array.isArray(e)) { report.unparseable++; out.push(line); continue; }
      if (typeof e.origin === 'string' && e.origin) {
        report.already++; report.origins[e.origin] = (report.origins[e.origin] || 0) + 1; out.push(line); continue;
      }
      let origin = 'unknown';
      if (e.be === 'codex') { origin = 'main'; report.codexRows++; }
      else {
        const idx = e.rid !== undefined && e.rid !== null ? map.get(String(e.rid)) : undefined;
        if (idx !== undefined) {
          const f = files[idx];
          origin = f.origin;
          if (f.origin !== 'main') {
            if (f.agent) e.agent = f.agent;
            if (f.wf) e.wf = f.wf;
            const own = e.cwd || f.own || null;
            const par = f.parent || null;
            if (par && own && own !== par) { e.cwd = par; e.wcwd = own; report.cwdRewritten++; report.wcwdStamped++; }
            else if (par && !own) { e.cwd = par; report.cwdRewritten++; }
          }
        }
      }
      // Deliberately NO per-row "repairedBy" stamp (the anchors repair's
      // pattern): that is ~30 bytes on every one of this instance's ~700,000
      // rows for a fact the migration ledger, the archived shard copy and the
      // printed report already state — and a rewritten `cwd` keeps its
      // original in `wcwd`, so nothing this touches is unrecoverable.
      e.origin = origin;
      report.origins[origin]++; report.changed++; dirty = true;
      out.push(JSON.stringify(e));
    }
    if (!dirty || dryRun) continue;
    // ARCHIVE THE WHOLE SHARD before touching it: this migration REWRITES rows
    // in place, so the only way back is a verbatim copy.
    fs.mkdirSync(archiveDir, { recursive: true });
    let dest = path.join(archiveDir, name);
    for (let i = 2; fs.existsSync(dest); i++) dest = path.join(archiveDir, name + '.' + i); // never overwrite an earlier copy
    fs.copyFileSync(fp, dest);
    report.archived.push(path.basename(dest));
    _writeAtomic(fp, out.join('\n') + '\n');
    report.shardsRewritten++;
  }
  // The archive says WHO copied these shards and when — a directory of
  // unlabelled ndjson is not a recovery path anybody can act on.
  if (report.archived.length && !dryRun) {
    try { _writeAtomic(path.join(archiveDir, '_migration.json'), JSON.stringify({ migration: id, at: now, store: 'usage-history', shards: report.archived, reason: 'verbatim copies taken before `origin` was stamped onto every row in place' }, null, 2)); } catch { }
  }
  report.ms = Date.now() - t0;
  return report;
}

module.exports = { backfillUsageOrigin, buildRidOrigins };
