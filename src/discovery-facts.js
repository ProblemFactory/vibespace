'use strict';
/**
 * Shared discovery FACT extractors (CS separation, 2.278.0;
 * docs/design-cs-unification.md row "Session discovery facts").
 *
 * Discovery has three fact collectors — the local sweep (routes/sessions.js,
 * hot-path optimized: async parallel probes, B-2104 procStart verification,
 * tmux), the device daemon's discovery-snapshot (agentd.js, bundled by
 * esbuild), and the ssh script (hosts.js, the no-daemon fallback). The
 * COLLECTORS legitimately differ in transport and richness; what must never
 * differ is the INTERPRETATION of the same bytes. It did:
 *
 *  - naming: local took the FIRST LINE of the first real user message; the
 *    remote parser whitespace-collapsed the WHOLE message — the same session
 *    could be named differently depending on which machine it ran on;
 *  - tail-ids: three implementations (session-store full list / agentd
 *    uniq+last-8 / ssh grep|uniq|tail-8) feeding ONE consumer (claimJsonls)
 *    with subtly different mention windows;
 *  - the daemon's lock scan verified only pid LIVENESS — a recycled pid on a
 *    device produced a phantom "running" session, the exact hole the local
 *    sweep closed years ago ("verify process is actually claude").
 *
 * This module is deliberately tiny (fs/child_process only) so the daemon
 * bundle can carry it: the agentd bundle is built by esbuild from src/, so —
 * unlike the ssh one-file scanner — it CAN share code. Every rule below has
 * exactly one home.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const NAME_MAX = 80;

/** sessionIds appearing in a transcript's TAIL text, uniq-collapsed by run
 *  (records from one session are consecutive), last `max` runs. The LAST id
 *  is the current writer; earlier ones are mentions. Matches the ssh script's
 *  `grep -o | uniq | tail -8` exactly. */
function extractTailIds(text, max = 8) {
  const ids = [];
  const re = /"sessionId":"([\w-]+)"/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    if (ids[ids.length - 1] !== m[1]) ids.push(m[1]);
  }
  return ids.slice(-max);
}

/** The ONE naming rule: first non-empty LINE of a real user message, trimmed,
 *  ≤80 chars; injected <…>-tag context/reminders and slash-command echoes are
 *  not names. Takes a PARSED user record. Returns string|null. */
function nameFromUserRecord(d) {
  const msg = d?.message;
  if (!msg || !msg.content) return null;
  const content = Array.isArray(msg.content)
    ? (msg.content.find((c) => c && c.type === 'text')?.text || '')
    : String(msg.content);
  return nameFromText(content);
}

function nameFromText(text) {
  const firstLine = String(text || '').split('\n').find((l) => l.trim()) || '';
  const cand = firstLine.trim().slice(0, NAME_MAX).trim();
  if (!cand || cand.startsWith('<') || cand.startsWith('/')) return null;
  return cand;
}

/** Same rule over a RAW JSONL line that may be TRUNCATED (the ssh script caps
 *  N lines at ~1500-2000 bytes, so JSON.parse can fail) — full parse first,
 *  regex fallback for cut lines. */
function nameFromUserLine(line) {
  const s = String(line || '');
  try { return nameFromUserRecord(JSON.parse(s)); } catch { }
  // Truncated lines: prefer a properly closed string, but a cut that lands
  // MID-STRING leaves no closing quote — the old parser's regex required one
  // and silently named nothing. The first line is all we need, so an
  // unterminated tail is fine.
  const m = s.match(/"content":"((?:[^"\\]|\\.)*)"/) || s.match(/"text":"((?:[^"\\]|\\.)*)"/)
    || s.match(/"content":"((?:[^"\\]|\\.)*)/) || s.match(/"text":"((?:[^"\\]|\\.)*)/);
  if (!m) return null;
  let frag = m[1].replace(/\\$/, ''); // a cut mid-escape leaves a lone backslash
  let text;
  try { text = JSON.parse('"' + frag + '"'); }
  catch { text = frag.replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\"/g, '"'); }
  return nameFromText(text);
}

/** Portable "is this pid actually claude" — /proc on Linux (zero fork),
 *  `ps -o comm=` elsewhere. The verification the local sweep has had since
 *  the PID-reuse fix and the daemon snapshot never had. */
function pidLooksClaude(pid) {
  try {
    const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf-8').trim();
    if (comm) return comm.includes('claude') || cmdlineLooksClaude(pid);
  } catch { }
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf-8', timeout: 2000 }).trim();
    return cmd === 'claude' || cmd.includes('claude');
  } catch { return false; }
}

function cmdlineLooksClaude(pid) {
  try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').includes('claude'); } catch { return false; }
}


/**
 * interpretDiscoveryLines — the ONE interpretation of the discovery fact
 * lines (LOCK/J/H/N/T/C/HC/K) into resumable session cards. It was ~120 lines
 * inline in hosts.discoverSessions; extracting it (R5 step 2 of
 * docs/design-three-tier.md) lets the DEVICE compute its own claims (the
 * `discovery.v2` op) with the byte-identical logic the server used to run
 * centrally — the orchestrator then only merges across machines. `claimJsonls`
 * is INJECTED (it lives in session-store, which this tiny module must not
 * pull in); the daemon passes its bundled copy, the server passes its own.
 * Pure: `out` string + descriptor in, plain session array out.
 */
function interpretDiscoveryLines(out, { hostId, hostName, claimJsonls }) {
  const locks = [];
  const keeperBySession = new Map(); // claudeSessionId → {sid} (live keeper sessions)
  const jsonls = [];
  const heads = new Map(); // jsonl path -> first record (cwd source)
  const codexRollouts = []; // B-10ed: codex rollout files on the host
  const codexCwd = new Map(); // rollout path -> cwd
  const tailIds = new Map(); // jsonl path -> [sessionIds in tail, last = current writer]
  for (const line of out.split('\n')) {
    if (line.startsWith('K ')) {
      // keeper meta: '<sid>\t<json>' — index by claude session id when known
      try {
        const ti = line.indexOf('\t');
        const ksid = line.slice(2, ti).trim();
        const km = JSON.parse(line.slice(ti + 1));
        if (ksid && km && km.exited === undefined) {
          const key = km.claudeSessionId || km.resumeId;
          if (key) keeperBySession.set(key, { sid: ksid, childPid: km.childPid });
        }
      } catch { }
      continue;
    }
    if (line.startsWith('LOCK ')) { try { locks.push(JSON.parse(line.slice(5))); } catch {} }
    else if (line.startsWith('J ')) {
      const m = line.match(/^J ([\d.]+) (\d+) (.+)$/);
      if (m) jsonls.push({ mtime: parseFloat(m[1]) * 1000, size: +m[2], path: m[3] });
    } else if (line.startsWith('C ')) {
      // codex rollout (B-10ed): "C <mtime> <size> <path>"
      const m = line.match(/^C ([\d.]+) (\d+) (.+)$/);
      if (m) codexRollouts.push({ mtime: parseFloat(m[1]) * 1000, size: +m[2], path: m[3] });
    } else if (line.startsWith('HC ')) {
      const t = line.indexOf('\t');
      const m = t > 3 && line.slice(t + 1).match(/^"cwd":"([^"]*)"/);
      if (m) codexCwd.set(line.slice(3, t), m[1]);
    } else if (line.startsWith('T ')) {
      const t = line.indexOf('\t');
      if (t > 2) {
        const ids = line.slice(t + 1).split(',').map(s => s.trim()).filter(s => /^[\w-]+$/.test(s));
        if (ids.length) tailIds.set(line.slice(2, t), ids);
      }
    } else if (line.startsWith('H ')) {
      const t = line.indexOf('\t');
      const m = t > 2 && line.slice(t + 1).match(/^"cwd":"([^"]*)"/);
      if (m) heads.set(line.slice(2, t), { ...(heads.get(line.slice(2, t)) || {}), cwd: m[1] });
    } else if (line.startsWith('N ')) {
      const t = line.indexOf('\t');
      if (t > 2) {
        const fp = line.slice(2, t);
        // first user record → session name (same rule as local naming);
        // content is either a plain string ("content":"...") or an array of
        // blocks ("content":[{"type":"text","text":"..."}]) — support both.
        // The line may be truncated at 1500 bytes.
        // ONE naming rule (discovery-facts, 2.278.0) — this parser used to
        // whitespace-collapse the whole message while local took the first
        // line: the same session named differently local vs remote.
        const name = nameFromUserLine(line.slice(t + 1));
        if (name && !heads.get(fp)?.name) heads.set(fp, { ...(heads.get(fp) || {}), name });
      }
    }
  }
  // lock-first claim per project dir — shared claimJsonls (same algorithm as
  // local /api/sessions): exact id (lock.sessionId = filename for non-resumed
  // sessions) → tail ids (resumed: records carry the CURRENT id while the
  // filename keeps the ORIGINAL) → mtime fallback. The old "newest JSONL in
  // the lock's dir" attributed files arbitrarily with N parallel sessions in
  // one cwd (real incident: 4 running read as 5; kill → wrong id stopped).
  const encode = (cwd) => (cwd || '').replace(/[/._]/g, '-');
  const byDir = new Map(); // projDirName -> { locks: [], jsonls: [] }
  const dirGroup = (d) => {
    if (!byDir.has(d)) byDir.set(d, { locks: [], jsonls: [] });
    return byDir.get(d);
  };
  for (const j of jsonls) dirGroup(path.basename(path.dirname(j.path))).jsonls.push(j);
  for (const lock of locks) dirGroup(encode(lock.cwd)).locks.push(lock);
  const claimed = new Set(); // jsonl paths
  const runningIds = new Set();
  const sessions = [];
  for (const [, g] of byDir) {
    if (!g.locks.length) continue;
    const jmetas = g.jsonls.map(j => ({ id: path.basename(j.path, '.jsonl'), mtime: j.mtime, path: j.path }));
    const claims = claimJsonls(
      g.locks.map(l => ({ sessionId: l.sessionId || null, exactOnly: false, lock: l })),
      jmetas,
      (j) => tailIds.get(j.path) || null,
    );
    const matchedLocks = new Set();
    for (const [jid, w] of claims) {
      const jm = jmetas.find(j => j.id === jid);
      claimed.add(jm.path);
      runningIds.add(jid);
      matchedLocks.add(w.lock);
      // pid rides to the card so Terminate can reach killRemotePid (2.191.0
      // — without it the EXTERNAL card's confirm ended in a silent no-op)
      sessions.push({ sessionId: jid, cwd: w.lock.cwd, status: 'remote-running', host: hostId, hostName: hostName, mtime: jm.mtime, pid: Number(w.lock.pid) || undefined, keeperSid: (keeperBySession.get(jid) || keeperBySession.get(w.lock.sessionId))?.sid });
    }
    // Locks with no JSONL yet (brand-new session, nothing flushed): list by
    // the lock's own sessionId instead of dropping them (or, before this fix,
    // stealing another session's transcript) — parity with local Step 3.
    for (const l of g.locks) {
      if (matchedLocks.has(l) || !l.sessionId || runningIds.has(l.sessionId)) continue;
      runningIds.add(l.sessionId);
      sessions.push({ sessionId: l.sessionId, cwd: l.cwd || null, status: 'remote-running', host: hostId, hostName: hostName, mtime: l.startedAt || Date.now(), pid: Number(l.pid) || undefined, keeperSid: keeperBySession.get(l.sessionId)?.sid });
    }
  }
  for (const j of jsonls) {
    if (claimed.has(j.path)) continue;
    const sid = path.basename(j.path, '.jsonl');
    if (runningIds.has(sid)) continue; // already listed via a lock
    const head = heads.get(j.path);
    sessions.push({ sessionId: sid, cwd: head?.cwd || null, name: head?.name || null, projDir: path.basename(path.dirname(j.path)), status: 'remote-stopped', host: hostId, hostName: hostName, mtime: j.mtime });
  }
  // Codex rollouts → resumable STOPPED cards (B-10ed). threadId = the uuid
  // tail of the rollout filename (same rule as codex-session-store). No
  // running-state detection (codex has no lock files) — a live webui codex
  // session dedups client-side by session id like every remote card.
  const TID_RE = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;
  for (const r of codexRollouts) {
    const m = String(r.path).match(TID_RE);
    if (!m) continue;
    sessions.push({ sessionId: m[1], backend: 'codex', cwd: codexCwd.get(r.path) || null, name: null, status: 'remote-stopped', host: hostId, hostName: hostName, mtime: r.mtime });
  }
  return sessions;
}

module.exports = { extractTailIds, nameFromUserRecord, nameFromUserLine, nameFromText, pidLooksClaude, interpretDiscoveryLines, NAME_MAX };
