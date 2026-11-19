'use strict';
// THE WORKFLOW RUN A USAGE LIMIT CUT SHORT (lg-recovery U3, B-3437 — the owner's ruling 2026-11-18 ~00:53Z, «推荐没问题» to
// option A): when a limit cut a multi-agent Workflow run short, the automatic continue names that run and tells the agent
// to RESUME it (resumeFromRunId) — never to launch it again from the start. This file READS the run; the words are
// src/server/auto-resume.js continuePromptFor's; the verdict is PURE src/workflow-disk.js cutShortRunOf.
//   WHICH RUN: the conversation's OWN — pinned by the Workflow tool's launch ack this conversation's stream carried
//     (noteLaunchAck: «Run ID: wf_…» / «Transcript dir: …/<sid>/subagents/workflows/wf_…», kept on the session, newest four);
//     with none remembered (a hub restart since the launch), its own workflows folder, listed through a bounded opendir.
//     The NEWEST run only.
//   WHEN: near the FIRE, never once at the arm — the Workflow tool returns at its LAUNCH and the run goes on after the
//     parent's walled turn (a hot switch can finish it). The auto-resume core asks in the six minutes before a usage wall's
//     TIMED fire, every two minutes, one read in flight per arm (a watch is never fired by the clock — never asked), and
//     names the run only if a fresh answer is there AND its limit has lifted by the moment the continue really goes (an
//     immediate fire before that reset says today's words); the run must have STOPPED.
//   WHAT PROVES IT («THAT LIMIT» IS THIS WALL'S LIMIT — 主开发's law, U3 cure): the run's journal (agents started, no
//     result); an unfinished agent whose LAST assistant record is the CLI's limit banner, its record within five hours
//     before the conversation's wall (or thirty minutes after it), its stated reset NOT BEFORE that wall (the limit was
//     still standing when the conversation itself walled — a run an earlier limit cut, one that had lifted by then, is not
//     this limit's) AND THE WALL'S OWN STATED RESET within the banner's rounding (the same limit, by the record — a limit
//     of another model or another account that happened to stand at the wall is not «that limit»; a wall that stated no
//     reset names nothing) and no later than the continue's fire; no terminal snapshot that ENDED the run, and a snapshot
//     that cannot be read (a link, not a file, refused) proves nothing — never «no snapshot».
//   HOW: fs.promises only (off the main loop); every file opened O_NOFOLLOW | O_NONBLOCK and read through its handle with a
//     byte bound; every folder on the way lstat'ed (the conversation's, its subagents/ and workflows/, the run's — a symlink
//     is not followed); listings bounded; the journal kept as its lines' heads only (a result line carries the agent's
//     whole return value — never parsed); a started / result / failed line whose head names no agent makes the journal
//     BLIND (no answer — never a count it cannot prove). The CLI's folder is the one ws-create reads: $CLAUDE_CONFIG_DIR,
//     else ~/.claude (a named account moves only its secret store — never its projects).
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { cutShortRunOf, RUN_ID_RE, STALL_MS } = require('../workflow-disk.js');

const JOURNAL_MAX = 32 * 1024 * 1024;   // bytes of journal read at most (its lines' heads are what is kept)
const HEAD = 600;                         // a journal line's head: type, key and agentId come first
const TAIL = 64 * 1024;                   // an agent transcript's tail searched for the limit record
const AGENTS_MAX = 16;                    // unfinished agents whose tails are read
const LIST_MAX = 2048;                    // entries read from one folder
const SNAP_MAX = 2 * 1024 * 1024;         // a terminal snapshot parsed whole up to this size
const OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
const SID_RE = /^[0-9a-f-]{8,64}$/i;
const RESET_SLACK_MS = 5 * 60 * 1000;   // a banner's reset may lie this far past the fire (its own minute rounding)
/** The CLI's own folder, as ws-create reads it (claudeWorktreeHookConfigured): $CLAUDE_CONFIG_DIR, else <home>/.claude.
 *  A `home` handed in (a suite's planted home) is that home's .claude. */
const claudeDirOf = (home) => (home ? path.join(home, '.claude') : (process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')));

/** Read at most `max` bytes of a REGULAR file through one handle (never a link, never a FIFO); `tail` = the last bytes. */
async function readBounded(file, max, { tail = false } = {}) {
  let fh = null;
  try {
    fh = await fsp.open(file, OPEN_FLAGS);
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const n = Math.min(st.size, max), pos = tail ? Math.max(0, st.size - n) : 0;
    const buf = Buffer.alloc(n);
    let off = 0;
    while (off < n) { const { bytesRead } = await fh.read(buf, off, n - off, pos + off); if (!bytesRead) break; off += bytesRead; }
    return { text: buf.subarray(0, off).toString('utf8'), size: st.size, mtimeMs: st.mtimeMs, whole: st.size <= max };
  } catch { return null; } finally { try { if (fh) await fh.close(); } catch { } }
}

/** The journal as its lines' heads: {type, key, agentId} per line, re-serialized (journalAttemptsFromText reads them). */
const HEADS_CACHE = new Map();   // journal path → {mtimeMs, size, text}: a journal that did not change is not read again (32 kept)
async function journalHeads(file, max = JOURNAL_MAX) {
  let fh = null;
  try {
    fh = await fsp.open(file, OPEN_FLAGS);
    const st = await fh.stat();
    if (!st.isFile() || st.size > max) return null;
    const hit = HEADS_CACHE.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return { text: hit.text, mtimeMs: st.mtimeMs };
    const out = [], chunk = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, st.size)));
    let pos = 0, head = '', skipping = false, blind = false;
    const take = (h) => {
      const type = /"type"\s*:\s*"(launched|started|result|failed)"/.exec(h);
      const agent = /"agentId"\s*:\s*"([0-9a-f]{1,64})"/.exec(h);
      if (type && !agent && type[1] !== 'launched') { blind = true; return; }   // an agent's line whose head does not name it: the arithmetic cannot be proven
      if (!type && h.length >= HEAD && !/"type"\s*:/.test(h)) { blind = true; return; }   // a cut head that shows NO type at all: what it is cannot be told (a long line of ANOTHER type — a progress or log line the CLI may add — is not an agent's and is skipped)
      if (!type || !agent) return;
      const key = /"key"\s*:\s*"((?:[^"\\]|\\.){0,200})"/.exec(h);
      out.push(JSON.stringify({ type: type[1], agentId: agent[1], ...(key ? { key: key[1] } : {}) }));
    };
    while (pos < st.size) {
      const { bytesRead } = await fh.read(chunk, 0, chunk.length, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      const s = chunk.subarray(0, bytesRead).toString('latin1');   // the heads are ASCII; a split UTF-8 char is never read
      let i = 0;
      for (;;) {
        const nl = s.indexOf('\n', i);
        const piece = nl < 0 ? s.slice(i) : s.slice(i, nl);
        if (!skipping) { head += piece.slice(0, Math.max(0, HEAD - head.length)); if (head.length >= HEAD && nl < 0) skipping = true; }
        if (nl < 0) break;
        if (/^\s*\{/.test(head)) take(head);
        head = ''; skipping = false; i = nl + 1;
      }
    }
    // a last line with no newline is still being written — no record yet
    if (blind) return null;   // (not cached: a journal that changes is read again)
    const text = out.join('\n');
    HEADS_CACHE.set(file, { mtimeMs: st.mtimeMs, size: st.size, text });
    while (HEADS_CACHE.size > 32) HEADS_CACHE.delete(HEADS_CACHE.keys().next().value);
    return { text, mtimeMs: st.mtimeMs };
  } catch { return null; } finally { try { if (fh) await fh.close(); } catch { } }
}

/** A folder, never through a link: lstat. */
async function isRealDir(p) { try { const st = await fsp.lstat(p); return st.isDirectory(); } catch { return false; } }

/** Up to LIST_MAX names of one folder (a bounded iteration — never the whole of a huge folder). */
async function listBounded(dir) {
  const names = [];
  let d = null;
  try { d = await fsp.opendir(dir); for await (const e of d) { names.push(e.name); if (names.length >= LIST_MAX) break; } } catch { } finally { try { if (d) await d.close(); } catch { } }
  return names;
}

/** The CLI's project folder name for a cwd: every character that is not a letter or a digit becomes «-»
 *  (src/harnesses/helper-transcripts.js projDirOf); the session store's own mapping is tried second. */
function projectDirsFor(cwd) {
  const a = String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
  let b = null; try { b = require('../session-store.js').cwdToProjectDir(cwd); } catch { }
  return [...new Set([a, b].filter(Boolean))];
}

/** PURE: the Workflow tool's launch ack in a tool_result text ⇒ {runId, dir|null} (or null). */
function ackRunOf(text) {
  const t = String(text || '');
  if (!/^\s*Workflow (?:"[^"\n]{0,200}" )?(?:started in the background|launched in background)\b/.test(t)) return null;   // the ack's own first line
  const td = /Transcript dir: (\/\S+\/(wf_[A-Za-z0-9_-]{1,64}))\s*$/m.exec(t);
  const id = td ? td[2] : ((/Run ID: (wf_[A-Za-z0-9_-]{1,64})\b/.exec(t) || [])[1] || null);
  if (!id || !RUN_ID_RE.test(id)) return null;
  return { runId: id, dir: td ? td[1] : null };
}
/** The claude stream saw the Workflow TOOL's own result (its caller keys on the tool_use's name): keep the run on the
 *  session (the newest four, by id), with the conversation id it was launched under (a resume may fork a new one). */
function noteLaunchAck(session, text) {
  const r = ackRunOf(text);
  const sid = session && (session.claudeSessionId || session.backendSessionId);
  if (!session || !r || !sid || !SID_RE.test(String(sid))) return false;
  const list = (Array.isArray(session._wfRuns) ? session._wfRuns : []).filter((x) => x && x.runId !== r.runId);
  list.push({ runId: r.runId, dir: r.dir, sid: String(sid), at: Date.now() });
  session._wfRuns = list.slice(-4);
  return true;
}

/** Every candidate run folder of THIS conversation: the remembered acks (a Transcript dir only under
 *  <home>/.claude/projects/<one folder>/<the ack's sid>/subagents/workflows/<runId>), the ack's run under the CLI's own
 *  project mapping, and the conversation's workflows folder listed (bounded). The caller judges the NEWEST of them all. */
async function candidates({ home, cwd, sid, runs }) {
  const projects = path.join(claudeDirOf(home), 'projects');
  const sids = [...new Set([sid, ...(Array.isArray(runs) ? runs : []).map((r) => r && r.sid).filter((x) => SID_RE.test(String(x || '')))].map(String))];
  const out = new Set();
  for (const r of Array.isArray(runs) ? runs : []) {
    if (!r || !RUN_ID_RE.test(String(r.runId || ''))) continue;
    const rs = SID_RE.test(String(r.sid || '')) ? String(r.sid) : sid;
    if (typeof r.dir === 'string' && path.isAbsolute(r.dir)) {
      const rel = path.relative(projects, r.dir).split(path.sep);
      if (rel.length === 5 && rel[0] && !rel.includes('..') && rel[1] === rs && rel[2] === 'subagents' && rel[3] === 'workflows' && rel[4] === r.runId) out.add(r.dir);
    }
    for (const p of projectDirsFor(cwd)) out.add(path.join(projects, p, rs, 'subagents', 'workflows', r.runId));
  }
  for (const s1 of sids) for (const p of projectDirsFor(cwd)) {
    const root = path.join(projects, p, s1), wfDir = path.join(root, 'subagents', 'workflows');
    if (!(await isRealDir(path.join(projects, p))) || !(await isRealDir(root)) || !(await isRealDir(path.join(root, 'subagents'))) || !(await isRealDir(wfDir))) continue;   // the project folder too (U3 cure 2)
    for (const n of await listBounded(wfDir)) if (RUN_ID_RE.test(n)) out.add(path.join(wfDir, n));
  }
  return [...out];
}

/** The newest candidate by its journal's mtime (lstat — a linked journal is no journal). */
async function newestOf(dirs) {
  let best = null;
  for (const d of dirs) { try { const st = await fsp.lstat(path.join(d, 'journal.jsonl')); if (st.isFile() && (!best || st.mtimeMs > best.m)) best = { d, m: st.mtimeMs }; } catch { } }
  return best ? best.d : null;
}

/** → {runId, unfinished, resetAt} | null — never throws. `wallAt` = the stop fact's own instant (the walled turn's end): an
 *  agent's limit counts only if its stated reset is NOT BEFORE it (this wall's limit, still standing when the conversation
 *  walled); `fireAt` = when the continue will go (a limit that resets later than that is not resumed into); `resetAt` = the
 *  latest proven reset — the core names the run only if the continue really goes after it (auto-resume.js freshRun). */
async function runAtWall({ cwd, sid, wallAt, wallResetAt = 0, fireAt = 0, runs = null, home = null, now = Date.now(), journalMax = JOURNAL_MAX } = {}) {
  try {
    if (!cwd || !sid || !SID_RE.test(String(sid)) || !(Number(wallAt) > 0) || !(Number(wallResetAt) > 0)) return null;   // a wall that stated no reset names nothing
    const runDir = await newestOf(await candidates({ home, cwd, sid: String(sid), runs }));
    if (!runDir) return null;
    const runId = path.basename(runDir);
    const sidDir = path.dirname(path.dirname(path.dirname(runDir)));
    // every folder on the way is a real one (the ack's remembered path is not listed through candidates' checks)
    if (!RUN_ID_RE.test(runId) || !(await isRealDir(path.dirname(sidDir))) || !(await isRealDir(sidDir)) || !(await isRealDir(path.join(sidDir, 'subagents'))) || !(await isRealDir(path.dirname(runDir))) || !(await isRealDir(runDir))) return null;
    const j = await journalHeads(path.join(runDir, 'journal.jsonl'), journalMax);
    if (!j) return null;
    let last = j.mtimeMs;
    for (const n of await listBounded(runDir)) { try { const st = await fsp.lstat(path.join(runDir, n)); if (st.isFile() && st.mtimeMs > last) last = st.mtimeMs; } catch { } }
    // the terminal snapshot (<sid>/workflows/<runId>.json): a run it says ENDED is not named; a workflows/ that is not a
    // real folder (a link) proves nothing — never followed, never «no snapshot»
    // (the read's MUST 3) and a snapshot that is there but cannot be read — a link, a folder, a FIFO, refused — proves nothing
    // either: only «no such file» is «no snapshot»
    let snapshotStatus = null;
    const lst = async (p) => { try { return await fsp.lstat(p); } catch (e) { return e && e.code === 'ENOENT' ? null : 'refused'; } };
    const wfSt = await lst(path.join(sidDir, 'workflows'));
    const snapF = path.join(sidDir, 'workflows', `${runId}.json`);
    const snapSt = wfSt && wfSt !== 'refused' && wfSt.isDirectory() ? await lst(snapF) : null;
    if (wfSt === 'refused' || (wfSt && !wfSt.isDirectory()) || snapSt === 'refused' || (snapSt && !snapSt.isFile())) snapshotStatus = 'unknown';
    else if (snapSt) {
      const snap = await readBounded(snapF, SNAP_MAX);
      if (snap && snap.whole) { try { const o = JSON.parse(snap.text); snapshotStatus = String((o && o.status) || (o && o.error ? 'failed' : 'completed')); } catch { snapshotStatus = 'unknown'; } }
      else snapshotStatus = 'unknown';   // unreadable, or too big to read whole: a «status» found in it may be a result's — proves nothing
    }
    const { journalAttemptsFromText } = require('../workflow-disk.js');
    const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');
    const { started, done, superseded } = journalAttemptsFromText(j.text);
    const unfinished = [...started].filter((a) => !done.has(a) && !superseded.has(a));
    // THE LIMIT IN THE AGENTS' OWN RECORDS: an unfinished agent's LAST assistant record is the CLI's limit banner, and that
    // banner's own stated reset is NOT BEFORE the conversation's wall (THIS wall's limit — one that had lifted by then cut
    // the run on an earlier limit; U3 cure, 主开发's law), IS the wall's own stated reset (± the banner's rounding — the
    // same limit, by the record: the read's MUST 2) and no later than this continue's fire (+ 5 min) — a run another,
    // longer limit killed (a model's weekly cap) would die again at once; a banner with no readable reset proves nothing
    let limitAt = 0, provenN = 0, endedOnLimit = 0, newestLimit = 0, resetMax = 0;
    for (const a of unfinished.slice(0, AGENTS_MAX)) {
      const t = await readBounded(path.join(runDir, `agent-${a}.jsonl`), TAIL, { tail: true });
      if (!t) continue;
      const lines = t.text.split('\n');
      if (!t.whole) lines.shift();   // the first line of a tail may be cut
      let lastRec = null, lastLine = -1;
      lines.forEach((line, k) => { if (!line.trim()) return; let o = null; try { o = JSON.parse(line); } catch { return; } lastLine = k; if (o && o.type === 'assistant') lastRec = { o, k }; });
      if (!lastRec) continue;
      const msg = lastRec.o.message || {};
      const text = Array.isArray(msg.content) ? msg.content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join(' ') : String(msg.content || '');
      const at = Date.parse(lastRec.o.timestamp) || 0;
      if (msg.model !== '<synthetic>' || !ClaudeCodeAdapter.parseLimitBanner(text) || !(at > 0)) continue;
      const resetAt = ClaudeCodeAdapter.parseBannerResetMs(text, at);
      if (!(resetAt > 0) || resetAt < Number(wallAt) || (Number(fireAt) > 0 && resetAt > Number(fireAt) + RESET_SLACK_MS)) continue;
      if (Math.abs(resetAt - Number(wallResetAt)) > RESET_SLACK_MS) continue;   // THIS wall's limit: the wall's own stated reset, within the banner's rounding
      provenN++; if (at > limitAt) limitAt = at; if (at > newestLimit) newestLimit = at; if (resetAt > resetMax) resetMax = resetAt;
      if (lastRec.k === lastLine) endedOnLimit++;
    }
    const endsOnLimit = provenN > 0 && endedOnLimit === Math.min(unfinished.length, AGENTS_MAX) && last <= newestLimit + 120 * 1000;
    const v = cutShortRunOf({ runId, journalText: j.text, lastActivity: last, limitAt, wallAt: Number(wallAt), now, snapshotStatus, limitProven: provenN > 0, endsOnLimit, stallMs: STALL_MS });
    return v ? { ...v, resetAt: resetMax } : null;
  } catch { return null; }
}

/** The auto-resume core's dep: the conversation's own run — read only for a session a USAGE WALL stopped (U1's fact; its
 *  instant is the wall's), never a remote one (its files are not here). */
function runAtWallFor(session, { home = null, fireAt = 0 } = {}) {
  let sb = null; try { sb = require('../stopped-by.js').normalizeStoppedBy(session && session._stoppedBy); } catch { sb = null; }   // every reader re-validates the stop fact
  const sid = session && (session.claudeSessionId || session.backendSessionId);
  // the harness's DECLARED spawn row (src/harnesses — never an id branch): only a conversation kept under ~/.claude/projects by
  // its claudeSessionId has Workflow run folders there; a remote run's files are not here
  let field = null; try { field = require('../harnesses').get(session && session.backend).spawn.conversationIdField || null; } catch { field = null; }
  if (!session || session.host || field !== 'claudeSessionId' || !sid || !session.cwd || !sb || sb.kind !== 'quota') return Promise.resolve(null);
  return runAtWall({ cwd: session.cwd, sid, wallAt: Number(sb.at), wallResetAt: Number(sb.resetsAt) || 0, fireAt, runs: session._wfRuns || null, home });
}

module.exports = { runAtWall, runAtWallFor, ackRunOf, noteLaunchAck, journalHeads, readBounded, claudeDirOf, JOURNAL_MAX, LIST_MAX, AGENTS_MAX, RESET_SLACK_MS };
