'use strict';
/**
 * usage-walker.js — the usage-ledger walk as a SHARED MODULE
 * (R4 step 1 of docs/design-three-tier.md, the `usage.scan` op family).
 *
 * Runs ON the machine that owns the transcripts: bundled into the device
 * daemon (the `usage-scan` op runs it in a child process) and importable
 * anywhere else. It mirrors data/bin/vibespace-usage-scan — the shipped
 * single file that daemon-less ssh hosts still need (a host with no checkout
 * cannot require this module) — and the two MUST stay behavior-identical:
 * scripts/test-usage-walk-parity.mjs runs both over one fixture and demands
 * identical events. Any one-sided change fails it.
 *
 * DELIBERATELY NEVER PERSISTS THE CURSOR. The shipped script persists after
 * its own stdout flush — which on the relayed device path meant "accepted by
 * the local pipe", leaving a loss window if the daemon→server link died
 * mid-transfer (cursor advanced, events gone forever). Here the caller
 * commits the returned cursors only once receipt is proven (the server
 * writes them back over the device link AFTER the count-gated transfer
 * fully landed — two-phase, structurally loss-free; an uncommitted cursor
 * just re-emits and the server's rid dedup absorbs it).
 *
 * Event fields (keep in lockstep with the scanner + the local UsageHistory
 * walk): {rid, mid, ts, sid, model, cwd, wcwd?, origin, wf?, agent?, i, cw5,
 * cw1, cr, o, tier}.
 *
 * ORIGIN (2026-09-10). A request's usage is mined from three KINDS of file and
 * until now the event could not say which: a top-level transcript ('main'), a
 * subagent transcript (<sid>/subagents/agent-*.jsonl) or a workflow agent's
 * (<sid>/subagents/workflows/<wf>/agent-*.jsonl). All three already attribute
 * to the PARENT session id — but an agent record carries ITS OWN cwd, and an
 * agent that runs in a git worktree carries the worktree path, so the ledger's
 * "By project" cut listed every throwaway worktree as its own project (272 of
 * this instance's 3,155 agent transcripts, measured 2026-09-10). So:
 *   · `origin` is stamped on EVERY event (never "missing means main" — the
 *     backfill migration has to be able to say `unknown` about rows whose
 *     transcript is gone, and an absent field cannot say that)
 *   · `wf` = the workflow run id, workflow files only; `agent` = the agent
 *     file stem, subagent + workflow
 *   · `cwd` is the PARENT PROJECT's cwd for an agent event, and the
 *     transcript's own path rides along as `wcwd` — present ONLY when it
 *     DIFFERS (an equal copy on every row is bytes carrying no information)
 * Codex rollouts are always 'main': the codex store MERGES a sub-agent
 * rollout's records into the parent thread's read (src/codex-session-store.js
 * tags each record with its own file), so there is no second kind of file here
 * to separate.
 */
const fs = require('fs');
const zlib = require('zlib');
const os = require('os');
const path = require('path');
// THE FIXTURE GUARD (2026-09-09). A suite's synthetic transcript is not usage:
// its `assistant` records are hand-written, no API request ever happened, and
// on this instance 74,133 such rows claiming 914,640 fabricated tokens had
// already been ingested into the permanent ledger. The convention has ONE
// definition (src/fixture-guard.js); the shipped scanner beside this module
// carries an INLINE COPY of the two predicates because a checkout-less ssh
// host cannot require src/ — scripts/test-usage-walk-parity.mjs drives both
// spellings over the same table, so a one-sided edit fails there.
const { isFixtureProjectDir, isFixtureSid } = require('./fixture-guard.js');

function defaultCursorFile() {
  return process.env.VIBESPACE_USAGE_CURSOR || path.join(os.homedir(), '.vibespace', 'usage-cursor.json');
}

// ── THE PROJECT'S cwd — which repo an agent transcript worked FOR ──────────
// An agent record carries the agent's own directory, so the event must be
// attributed to the parent PROJECT instead. The project DIRECTORY NAME is
// claude's own grouping and it is the ENCODING of that cwd, so a candidate can
// be VERIFIED by encoding it forward (the map is deterministic that way only —
// decoding is ambiguous, kb-design-lessons §5).
//
// A conversation's cwd is NOT constant: measured on this instance, 3 of 782
// top-level transcripts state more than one, and one of them is the biggest
// spender here — a directory rename left its FIRST record saying
// `…/claude-code-webui` while its latest records and its project dir both say
// `…/vibespace`, so "the first cwd" filed $7,828 of one conversation's agent
// spend under a path that no longer exists, in a SECOND row beside its own
// main spend. Hence the ladder: a candidate that encodes to the directory name
// wins; otherwise the conversation's MOST RECENT cwd; a sibling top-level
// transcript answers when the parent's own file has been rotated away (every
// transcript in a project dir shares one project by construction). Every read
// is a bounded window (a transcript can be hundreds of MB) and memoized.
const CWD_WINDOW_BYTES = 128 * 1024;
const encodeCwd = (c) => String(c).replace(/[/._]/g, '-');
function makeProjectCwdReader() {
  const winMemo = new Map();   // fp|tail → [cwd…]
  const dirMemo = new Map();   // pdAbs → cwd|null  (the sibling fallback)
  const sidMemo = new Map();   // pdAbs|sid → cwd|null
  /** Ordered distinct cwds stated inside one bounded window of a transcript. */
  function readCwds(fp, tail) {
    const key = fp + (tail ? '|t' : '|h');
    if (winMemo.has(key)) return winMemo.get(key);
    const out = [];
    let fd = null;
    try {
      fd = fs.openSync(fp, 'r');
      const size = fs.fstatSync(fd).size;
      const len = Math.min(CWD_WINDOW_BYTES, size);
      const pos = tail ? size - len : 0;
      const buf = Buffer.alloc(len);
      const n = fs.readSync(fd, buf, 0, len, pos);
      const lines = buf.subarray(0, Math.max(0, n)).toString('utf8').split('\n');
      if (tail && pos > 0) lines.shift(); // a tail window opens mid-line
      for (const line of lines) {
        if (line.indexOf('"cwd"') < 0) continue;
        let r; try { r = JSON.parse(line); } catch { continue; } // a cut line never parses
        if (r && typeof r.cwd === 'string' && r.cwd && !out.includes(r.cwd)) out.push(r.cwd);
      }
    } catch { } finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
    winMemo.set(key, out);
    return out;
  }
  /** @param mains sorted absolute paths of the dir's top-level transcripts */
  return function projectCwdFor(pdAbs, pdName, sid, mains) {
    const sk = pdAbs + '|' + sid;
    if (sidMemo.has(sk)) return sidMemo.get(sk);
    const match = (list) => list.find((c) => encodeCwd(c) === pdName) || null;
    const own = path.join(pdAbs, sid + '.jsonl');
    let out = match(readCwds(own, false));
    if (!out) {
      const t = readCwds(own, true);
      out = match(t) || t[t.length - 1] || null;   // the conversation's most recent cwd
    }
    if (!out) out = readCwds(own, false)[0] || null;
    if (!out) {
      if (!dirMemo.has(pdAbs)) {
        let sib = null;
        for (const m of mains) { const c = readCwds(m, false); sib = match(c) || c[0] || null; if (sib) break; }
        dirMemo.set(pdAbs, sib);
      }
      out = dirMemo.get(pdAbs);
    }
    sidMemo.set(sk, out);
    return out;
  };
}

/** Walk ~/.claude/projects incrementally. Returns
 *  {events: [ndjson-line…], cursors, cursorFile} — cursor NOT persisted. */
function runUsageWalk({ home = os.homedir(), cursorFile = defaultCursorFile(),
  // 2.297.0 (the twin-killer): the LOCAL ledger walk consumes this module
  // in-process — explicit dir overrides + an injected cursor store + an
  // onEvent hook (parsed objects instead of NDJSON strings) are what let
  // UsageHistory.scan() delete its own copy of this walk. Defaults keep the
  // daemon/scan-op call shape byte-identical.
  projectsDir = null, codexSessionsDir = null, cursors: injectedCursors = null, onEvent = null } = {}) {
  const PROJECTS = projectsDir || path.join(home, '.claude', 'projects');
  let cursors = injectedCursors;
  if (!cursors) { try { cursors = JSON.parse(fs.readFileSync(cursorFile, 'utf-8')) || {}; } catch { cursors = {}; } }
  const out = [];
  let filesTouched = 0;
  const emit = onEvent ? ((ev) => onEvent(ev)) : ((ev) => out.push(JSON.stringify(ev)));

  const projectCwdFor = makeProjectCwdReader();

  function handleLine(line, cur, info) {
    if (line.indexOf('"usage"') < 0) return;
    let r; try { r = JSON.parse(line); } catch { return; }
    if (r.type !== 'assistant') return;
    const msg = r.message; if (!msg || typeof msg !== 'object') return;
    const u = msg.usage; if (!u || typeof u !== 'object') return;
    const rid = r.requestId || msg.id || r.uuid;
    if (!rid) return;
    if (rid === cur.lastRid) return; // contiguous duplicate of the same request
    cur.lastRid = rid;
    const cc = u.cache_creation || {};
    const own = r.cwd || null;
    const par = (info && info.pcwd) || null;  // null for a top-level transcript
    emit({
      rid,
      // message.id join field (2.267.3 rule): live stdout records lack
      // requestId, so per-message billing lookups join on mid
      mid: (msg.id && msg.id !== rid) ? msg.id : undefined,
      ts: Date.parse(r.timestamp) || Date.now(),
      sid: cur.sid,
      model: msg.model || null,
      cwd: par || own,
      wcwd: (par && own && own !== par) ? own : undefined, // the agent's OWN dir, only when it differs
      origin: (info && info.origin) || 'main',
      wf: (info && info.wf) || undefined,
      agent: (info && info.agent) || undefined,
      i: u.input_tokens || 0,
      cw5: cc.ephemeral_5m_input_tokens || 0,
      cw1: cc.ephemeral_1h_input_tokens || 0,
      cr: u.cache_read_input_tokens || 0,
      o: u.output_tokens || 0,
      tier: u.service_tier || null,
    });
  }

  function scanFileWith(fp, cur, size, onLine) {
    let fd;
    try { fd = fs.openSync(fp, 'r'); } catch { return; }
    try {
      let pos = cur.offset;
      let rest = Buffer.alloc(0);
      const CHUNK = 8 * 1024 * 1024;
      while (pos < size) {
        const want = Math.min(CHUNK, size - pos);
        const buf = Buffer.alloc(want);
        const n = fs.readSync(fd, buf, 0, want, pos);
        if (n <= 0) break;
        pos += n;
        const data = rest.length ? Buffer.concat([rest, buf.subarray(0, n)]) : buf.subarray(0, n);
        let idx;
        let lineStart = 0;
        while ((idx = data.indexOf(10, lineStart)) !== -1) {
          const line = data.subarray(lineStart, idx).toString('utf8');
          lineStart = idx + 1;
          cur.offset += Buffer.byteLength(line, 'utf8') + 1; // BYTES, never string length (CJK)
          onLine(line);
        }
        rest = data.subarray(lineStart);
      }
      // incomplete trailing line stays unconsumed (offset not advanced past it)
    } finally { try { fs.closeSync(fd); } catch { } }
  }

  let projDirs = [];
  try { projDirs = fs.readdirSync(PROJECTS); } catch { }
  for (const pd of projDirs) {
    if (isFixtureProjectDir(pd)) continue; // a suite's throwaway cwd — never usage
    const pdAbs = path.join(PROJECTS, pd);
    let entries = [];
    try { entries = fs.readdirSync(pdAbs); } catch { continue; }
    // Top-level transcripts PLUS subagent/workflow agent transcripts (the
    // 2.265.0 walk — workflow agents' usage exists ONLY there); events
    // attribute to the PARENT session id, and carry WHICH kind of file they
    // came from (`origin`, 2026-09-10).
    const files = []; // {fp, sid, origin, wf?, agent?}
    const mains = []; // top-level transcript paths — the project-cwd fallback
    for (const fn of entries) {
      if (fn.endsWith('.jsonl')) { files.push({ fp: path.join(pdAbs, fn), sid: fn.replace(/\.jsonl$/, ''), origin: 'main' }); mains.push(path.join(pdAbs, fn)); continue; }
      if (!/^[0-9a-f-]{36}$/i.test(fn)) continue; // session dirs only
      const subDir = path.join(pdAbs, fn, 'subagents');
      let subs = []; try { subs = fs.readdirSync(subDir); } catch { continue; }
      for (const sf of subs) {
        if (sf.endsWith('.jsonl')) { files.push({ fp: path.join(subDir, sf), sid: fn, origin: 'subagent', agent: sf.replace(/\.jsonl$/, '') }); continue; }
        if (sf !== 'workflows') continue;
        let wfs = []; try { wfs = fs.readdirSync(path.join(subDir, 'workflows')); } catch { continue; }
        for (const wf of wfs) {
          let afs = []; try { afs = fs.readdirSync(path.join(subDir, 'workflows', wf)); } catch { continue; }
          for (const af of afs) if (af.startsWith('agent-') && af.endsWith('.jsonl')) files.push({ fp: path.join(subDir, 'workflows', wf, af), sid: fn, origin: 'workflow', wf, agent: af.replace(/\.jsonl$/, '') });
        }
      }
    }
    mains.sort(); // the sibling fallback must pick the SAME file in both spellings
    for (const { fp, sid, origin, wf, agent } of files) {
      if (isFixtureSid(sid)) continue; // synthetic conversation id — no request ever happened
      let st; try { st = fs.statSync(fp); } catch { continue; }
      if (!st.isFile()) continue;
      const cur = cursors[fp] || { offset: 0, lastRid: null };
      if (st.size < cur.offset) { cur.offset = 0; cur.lastRid = null; } // rotated/truncated
      cur.sid = sid;
      // NOTE: the unchanged-file path keeps cur.sid in the cursor entry —
      // matching the shipped scanner exactly (parity over cursor bytes too)
      if (st.size === cur.offset) { cursors[fp] = cur; continue; }
      filesTouched++;
      // The parent project's cwd is resolved only for the files that need it
      // (an agent transcript with new bytes) — never for a main transcript,
      // whose own record already carries the authoritative value.
      const info = { origin, wf, agent, pcwd: origin === 'main' ? null : projectCwdFor(pdAbs, pd, sid, mains) };
      scanFileWith(fp, cur, st.size, (line) => handleLine(line, cur, info));
      delete cur.sid;
      cursors[fp] = cur;
    }
  }

  // ── Codex rollouts (v2, R4): ~/.codex/sessions/**/rollout-*-<threadId>.jsonl
  // (CODEX_HOME honored like the local walk). Per-request usage rides
  // event_msg/token_count records (info.last_token_usage; info===null =
  // rate-limit heartbeat, skip). NO requestId — the synthetic rid is the
  // CUMULATIVE token total (strictly monotonic per thread → replays dedup);
  // model/cwd come from the preceding turn_context and PERSIST IN THE CURSOR
  // (an incremental scan may start mid-file). input INCLUDES cached → fresh =
  // difference; rollouts report no cache-write counts (cw 0).
  const codexDir = codexSessionsDir || path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'sessions');
  let rollouts = [];
  try { rollouts = fs.readdirSync(codexDir, { recursive: true }); } catch { }
  for (const rel of rollouts) {
    const m = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/i.exec(String(rel));
    if (!m) continue;
    if (isFixtureSid(m[1])) continue; // synthetic thread id — same rule, both harnesses
    const fp = path.join(codexDir, String(rel));
    let st; try { st = fs.statSync(fp); } catch { continue; }
    if (!st.isFile()) continue;
    const zst = !!m[2];
    if (zst && !ZSTD_OK) continue; // this runtime cannot read compressed rollouts
    const cur = cursors[fp] || { offset: 0, lastRid: null };
    if (zst) { if (cur.zsize === st.size) { cursors[fp] = cur; continue; } if (!cur.zsize || st.size < cur.zsize) { cur.offset = 0; cur.lastRid = null; } }
    else { if (st.size < cur.offset) { cur.offset = 0; cur.lastRid = null; } if (st.size === cur.offset) { cursors[fp] = cur; continue; } }
    const sid = m[1].toLowerCase();
    filesTouched++;
    const scanRollout = (onLine) => {
      if (!zst) return scanFileWith(fp, cur, st.size, onLine);
      let plain; try { plain = zstdPlain(fs.readFileSync(fp)); } catch { return; }
      if (plain.length < cur.offset) { cur.offset = 0; cur.lastRid = null; }
      scanBufferWith(plain, cur, onLine);
      cur.zsize = st.size;
    };
    scanRollout((line) => {
      if (line.indexOf('"turn_context"') >= 0) {
        let r; try { r = JSON.parse(line); } catch { return; }
        if (r.type === 'turn_context' && r.payload) {
          if (r.payload.model) cur.model = r.payload.model;
          if (r.payload.cwd) cur.cwd = r.payload.cwd;
          if (r.payload.effort) cur.effort = String(r.payload.effort); // reasoning effort per turn (0.149+) — persisted like model
        }
        return;
      }
      if (line.indexOf('"token_usage_record"') >= 0) {
        // 0.153 per-response ledger twin: PRECEDES its token_count by 1–5 lines
        // (830/830 real pairs: same turn_id, usage.total_tokens equal) and names
        // the vendor response id — codex's `mid` join field (the popup's second
        // key; rid stays the cumulative-total key already baked into every
        // ledger). Parked in the CURSOR so a scan boundary between the pair
        // loses nothing; consumed by the next token_count, matched on the total.
        let r; try { r = JSON.parse(line); } catch { return; }
        if (r.type === 'token_usage_record' && r.payload) {
          const u = r.payload.usage || {};
          cur.pendMid = r.payload.response_id ? String(r.payload.response_id) : null;
          cur.pendTotal = typeof u.total_tokens === 'number' ? u.total_tokens : null;
          return;
        }
      }
      if (line.indexOf('"token_count"') < 0) return;
      let r; try { r = JSON.parse(line); } catch { return; }
      if (r.type !== 'event_msg' || r.payload?.type !== 'token_count') return;
      const info = r.payload.info;
      const last = info && info.last_token_usage;
      if (!last || !(last.input_tokens || last.output_tokens)) return;
      const ts = Date.parse(r.timestamp) || Date.now();
      const cum = info.total_token_usage ? info.total_token_usage.total_tokens : null;
      const rid = `cx:${sid}:${cum != null ? cum : cur.offset + '-' + ts}`;
      const pendMid = cur.pendMid || null, pendTotal = cur.pendTotal;
      delete cur.pendMid; delete cur.pendTotal; // consumed by this token_count whether or not it emits
      if (rid === cur.lastRid) return;
      cur.lastRid = rid;
      const cached = last.cached_input_tokens || 0;
      const mid = pendMid && (pendTotal == null || typeof last.total_tokens !== 'number' || pendTotal === last.total_tokens) ? pendMid : undefined;
      emit({
        rid, mid, be: 'codex', ts, sid,
        model: cur.model || null,
        cwd: cur.cwd || null,
        // ALWAYS 'main': a codex sub-agent's rollout is merged into the parent
        // thread by the store itself (codex-session-store tags each record
        // with its own file), so a rollout is never a second kind of file here.
        origin: 'main',
        effort: cur.effort || undefined,
        i: Math.max(0, (last.input_tokens || 0) - cached),
        cw5: 0, cw1: 0,
        cr: cached,
        o: last.output_tokens || 0,
        tier: null,
      });
    });
    cursors[fp] = cur;
  }

  return { events: out, cursors, cursorFile, filesTouched };
}

// zstd rollouts (codex ≥0.153 may write rollout-*.jsonl.zst; S3). Node ≥22.15
// has zlib.zstd*; an older runtime skips compressed rollouts (their events are
// simply absent — never a crash). Every frame is decompressed (zstdDecompressSync
// stops after the first); output capped so a rollout can never inflate past
// ZST_MAX_PLAIN. The cursor for a compressed file is {offset: PLAIN bytes
// consumed, zsize: COMPRESSED size seen} — unchanged compressed size ⇒ skip.
const ZST_MAX_PLAIN = 256 * 1024 * 1024;
const ZSTD_OK = typeof zlib.zstdDecompressSync === 'function';
function zstdPlain(buf) {
  const parts = []; let at = 0, total = 0;
  while (at < buf.length) {
    if (buf.length - at >= 8 && (buf[at] & 0xf0) === 0x50 && buf[at + 1] === 0x2a && buf[at + 2] === 0x4d && buf[at + 3] === 0x18) { at += 8 + buf.readUInt32LE(at + 4); continue; } // skippable frame
    if (!(buf[at] === 0x28 && buf[at + 1] === 0xb5 && buf[at + 2] === 0x2f && buf[at + 3] === 0xfd)) break;
    let r; try { r = zlib.zstdDecompressSync(buf.subarray(at), { info: true, maxOutputLength: ZST_MAX_PLAIN - total }); } catch { break; }
    parts.push(r.buffer); total += r.buffer.length;
    const consumed = Number(r.engine && r.engine.bytesWritten) || 0;
    if (consumed <= 0) break;
    at += consumed;
  }
  return parts.length === 1 ? parts[0] : Buffer.concat(parts);
}
function scanBufferWith(data, cur, onLine) {
  let lineStart = cur.offset, idx;
  while ((idx = data.indexOf(10, lineStart)) !== -1) {
    const line = data.subarray(lineStart, idx).toString('utf8');
    lineStart = idx + 1;
    cur.offset += Buffer.byteLength(line, 'utf8') + 1;
    onLine(line);
  }
}

module.exports = { runUsageWalk, defaultCursorFile, zstdPlain, scanBufferWith, ZSTD_OK, makeProjectCwdReader, encodeCwd };
