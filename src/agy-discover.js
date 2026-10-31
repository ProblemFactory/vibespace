'use strict';
// ANTIGRAVITY'S STORE.DISCOVER (lane dead-socket-keeps-chat-meta — the owner's 2026-10-30 incident: a stopped agy session
// whose meta a boot deleted had NO road back but a typed conversation id, because no list anywhere named an agy
// conversation). Each account root this machine holds — its own login (HOME) and every named Google account's
// (<data>/agy-subs/<id>, src/agy-backfill.js homeOf's shape) — keeps agy's own INDEX, conversation_summaries.db: a title
// and the last write per conversation. The sidebar lists them like claude's and codex's (stopped rows; Resume carries the
// row's account, cwd and name). THE READ: the index is opened only by data/bin/agy-summaries.js, a child (no db on the
// hub's thread — test-architecture §73); the hub stats each root's index at most once per CHECK_MS and asks the child only
// for a root whose index changed (size + mtime). Never a transcript, never a conversation's own db.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const AS = require('./agy-store');

const CHECK_MS = 15000;   // a root's index is looked at ≤ once per 15 s (the sidebar polls /api/sessions every 5 s)
const CHILD_MS = 10000;   // the child's bound — no answer keeps the last rows
const CHILD = path.join(__dirname, '..', 'data', 'bin', 'agy-summaries.js');
const DATA_DIR = path.join(__dirname, '..', 'data');
const cache = new Map();  // home → { accountId, home, sig, rows, checkedAt }
let inflight = null;
/** The child, bounded (killed past `ms`): {code, out}. Its env is built, never the hub's (test-architecture §94): it reads
 *  the roots it is handed — no login, no token, nothing of the hub's. */
const runIndexChild = (bin, args, ms) => new Promise((resolve) => {
  execFile(bin, args, { env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: ms, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 }, (e, out) => resolve({ code: e ? (e.code || e.signal || 1) : 0, out: String(out || '') }));
});

/** The account a row of this machine's own login root names — the create's word for it (accounts.resolveForSpawn:
 *  'subscription' = the CLI's own login), so a resume goes to THAT store, never the harness default (r2). */
const MACHINE_LOGIN = 'subscription';
/** The account roots: this machine's login (accountId null) and each <data>/agy-subs/<agy-…> folder. */
async function rootsOf(dataDir) {
  let names = [];
  try { names = await fs.promises.readdir(path.join(dataDir, 'agy-subs')); } catch { names = []; }
  return [{ accountId: null, home: os.homedir() }, ...names.filter((n) => /^agy-[0-9a-f]{6,32}$/.test(n)).sort().map((n) => ({ accountId: n, home: path.join(dataDir, 'agy-subs', n) }))];
}
async function refresh(dataDir, now, runChild) {
  const roots = await rootsOf(dataDir), stale = [];
  for (const r of roots) {
    const c = cache.get(r.home);
    if (c && now - c.checkedAt < CHECK_MS) continue;
    let sig = null;
    try { const st = await fs.promises.stat(path.join(r.home, '.gemini', 'antigravity-cli', AS.SUMMARIES)); sig = `${st.size}:${st.mtimeMs}`; } catch { sig = null; }
    if (!sig) cache.set(r.home, { ...r, sig: null, rows: [], checkedAt: now });
    else if (c && c.sig === sig) c.checkedAt = now;
    else stale.push({ ...r, sig });
  }
  for (const h of [...cache.keys()]) if (!roots.some((r) => r.home === h)) cache.delete(h);
  if (!stale.length) return;
  const res = await runChild(process.execPath, [CHILD, ...stale.map((r) => r.home)], CHILD_MS);
  let out = null;
  try { out = res && res.code === 0 ? JSON.parse(res.out) : null; } catch { out = null; }
  for (const r of stale) {
    const rows = out && Array.isArray(out[r.home]) ? out[r.home].filter((x) => x && AS.isId(x.id)) : null;
    const was = cache.get(r.home);
    cache.set(r.home, rows ? { ...r, rows, checkedAt: now } : { ...r, sig: null, rows: (was && was.rows) || [], checkedAt: now }); // no answer: the last rows stand, asked again next time
  }
}
/** The descriptor's discover: one row per top-level conversation of every root — status 'live' while a session of this
 *  harness runs it (its webui id / name / mode, as codex's rows), else 'stopped'. `harnessId` = the descriptor's own id. */
async function discover({ activeSessions, harnessId, dataDir = DATA_DIR, now = Date.now(), runChild = runIndexChild } = {}) {
  if (!inflight) inflight = refresh(dataDir, now, runChild).finally(() => { inflight = null; });
  try { await inflight; } catch { /* the last rows */ }
  const live = new Map();
  for (const [id, s] of activeSessions || []) if (s && s.backend === harnessId && !s.host && s.backendSessionId) live.set(s.backendSessionId, { id, s });
  const out = [];
  for (const c of cache.values()) {
    for (const r of c.rows || []) {
      const a = live.get(r.id);
      out.push({ backend: harnessId, backendSessionId: r.id, sessionId: r.id, cwd: r.cwd || '', startedAt: r.at || 0, status: a ? 'live' : 'stopped', name: r.title || '',
        accountId: c.accountId || MACHINE_LOGIN, webuiId: a ? a.id : null, webuiName: a ? a.s.name || null : null, webuiMode: a ? a.s.mode || null : null });
    }
  }
  return out.sort((x, y) => y.startedAt - x.startedAt);
}

module.exports = { discover, rootsOf, runIndexChild, CHECK_MS, _cache: cache };
