'use strict';
/**
 * THE HUB'S DEVICE-ACT AUDIT (lane device-act-audit, design q-042 §3 D4 + D10, 2026-10-19) — ORCH (fs).
 *
 * Every act / code op the hub sends to a device through src/agentd/client.js (THE ONE send point) is ONE line here —
 * src/device-acts.js `lineOf`: {at, id, hostId, machine, op, layer, by, summary, ok, code, outHead, ms}. The 2026-10-19
 * incident showed why: what a stolen hub did on the paired machines was in no record at all (exit-audit holds an agent's
 * exit runs only — 18 pods, 0 lines). The file is data/device-audit.jsonl, a RING of two files (→ .1 at maxBytes,
 * exit-audit's shape: the history is the last ~2 × 10 MiB of lines). Every line is broadcast (`onLine` — the Machines
 * card's 「活动…」 list patches its keyed rows in place) and read back BACKWARDS in chunks, a line parsed only after a raw
 * mark check, and every row judged again on the way out (device-acts `rowOf`: bounded, re-redacted).
 *
 * WHO READS IT: the owner every line (GET /api/hosts/:id/device-acts, the card); an agent only the lines `by` itself
 * (`vibespace-remote audit` — src/server/exit-routes.js; another subject's lines are `human_only`).
 * `byOfReq(req)` = the subject of a cookie request: `human:<a handle of its sign-in>` (12 hex of the cookie's sha256 —
 * never the cookie), `human:local` on an instance nobody signs in to.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DA = require('./device-acts.js');
const { Auth } = require('./auth.js');

const AUDIT_FILE = 'device-audit.jsonl';
const AUDIT_MAX_BYTES = 10 * 1024 * 1024;
const READ_CHUNK = 512 * 1024;
const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 500;
const OLD_RUN = 1000; // consecutive lines older than `since` that end a read

/** The subject of a cookie-authenticated request (never the cookie itself). */
function byOfReq(req) {
  let h = null;
  try { h = Auth.signInHandle(req); } catch { h = null; } // src/auth.js stays the ONE cookie reader (test-auth)
  return h ? 'human:' + h : 'human:local';
}

/** "15m" / "2h" / "3d" / "90s" / a bare number of ms → ms, or null. */
function durationMs(s) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/i.exec(String(s == null ? '' : s));
  if (!m) return null;
  const n = Number(m[1]), u = (m[2] || 'ms').toLowerCase();
  return Math.round(n * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 })[u]);
}

function create({ dataDir = null, maxBytes = AUDIT_MAX_BYTES, now = () => Date.now(), log = () => {}, onLine = null } = {}) {
  const bound = Math.max(64 * 1024, Number(maxBytes) || AUDIT_MAX_BYTES);
  let listener = typeof onLine === 'function' ? onLine : null;
  /** One line (a device-acts lineOf) → stored + broadcast. Never throws. → the stored record */
  function append(line) {
    const rec = { ...(line && typeof line === 'object' ? line : {}), at: Number(line && line.at) || now(), id: crypto.randomBytes(6).toString('hex') };
    if (dataDir) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        const f = path.join(dataDir, AUDIT_FILE), text = JSON.stringify(rec) + '\n';
        let size = 0; try { size = fs.statSync(f).size; } catch { }
        if (size > 0 && size + Buffer.byteLength(text) > bound) { try { fs.renameSync(f, f + '.1'); } catch (e) { log(`[device-audit] not rotated: ${e.message}`); } }
        fs.appendFileSync(f, text, { mode: 0o600 });
      } catch (e) { log(`[device-audit] line not written: ${e.message}`); }
    }
    if (listener) { try { listener(rec); } catch { } }
    return rec;
  }
  /** The newest `limit` rows that match, newest FIRST: `hostId`, `bys` (a list of exact subjects — an agent's own),
   *  `kind` (human | agent | job | system), `layer`, `since` (ms epoch). Read backwards over the ring, stopped at `limit`. */
  function tail({ hostId = null, bys = null, kind = null, layer = null, since = null, limit = LIMIT_DEFAULT } = {}) {
    if (!dataDir) return [];
    const n = Math.max(1, Math.min(LIMIT_MAX, Number(limit) || LIMIT_DEFAULT));
    const hostMark = hostId ? `"hostId":${JSON.stringify(String(hostId))}` : null;
    const byList = Array.isArray(bys) ? bys.filter(DA.validBy) : null;
    if (byList && !byList.length) return [];
    const byMarks = byList ? byList.map((b) => `"by":${JSON.stringify(b)}`) : null;
    const kindMark = kind && DA.BY_KINDS.includes(kind) ? `"by":"${kind}:` : null;
    const sinceAt = Number(since) || 0;
    const out = [];
    // the ring is in append order, which is time order but for a clock that stepped back: the read ends after OLD_RUN
    // consecutive lines older than `since` (a stepped clock's few lines never hide what came after them)
    let old = false, olds = 0;
    const judge = (raw) => {
      if (!raw || (hostMark && !raw.includes(hostMark)) || (byMarks && !byMarks.some((m) => raw.includes(m))) || (kindMark && !raw.includes(kindMark))) return;
      let j = null; try { j = JSON.parse(raw); } catch { return; }
      const r = DA.rowOf(j);
      if (!r) return;
      if (sinceAt && r.at < sinceAt) { if (++olds >= OLD_RUN) old = true; return; }
      olds = 0;
      if ((hostId && r.hostId !== String(hostId)) || (byList && !byList.includes(r.by)) || (kind && DA.kindOf(r.by) !== kind) || (layer && r.layer !== layer)) return;
      out.push(r);
    };
    for (const name of [AUDIT_FILE, AUDIT_FILE + '.1']) {
      if (out.length >= n || old) break;
      const f = path.join(dataDir, name);
      let fd = null;
      try {
        const st = fs.statSync(f); fd = fs.openSync(f, 'r');
        let pos = st.size, carry = Buffer.alloc(0);
        while (pos > 0 && out.length < n && !old) {
          const len = Math.min(READ_CHUNK, pos); pos -= len;
          const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos);
          const buf = carry.length ? Buffer.concat([b, carry]) : b;
          const nl = buf.indexOf(0x0a);
          if (nl < 0) { carry = buf; continue; }
          const lines = buf.subarray(nl + 1).toString('utf8').split('\n');
          for (let i = lines.length - 1; i >= 0 && out.length < n && !old; i--) judge(lines[i]);
          carry = buf.subarray(0, nl);
        }
        if (pos === 0 && out.length < n && !old && carry.length) judge(carry.toString('utf8'));
      } catch { /* no such file: the next ring file, or nothing */ }
      finally { if (fd !== null) { try { fs.closeSync(fd); } catch { } } }
    }
    return out;
  }
  return { append, tail, set onLine(f) { listener = typeof f === 'function' ? f : null; }, get onLine() { return listener; }, file: dataDir ? path.join(dataDir, AUDIT_FILE) : null };
}

module.exports = { create, byOfReq, durationMs, AUDIT_FILE, AUDIT_MAX_BYTES, LIMIT_DEFAULT, LIMIT_MAX };
