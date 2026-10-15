// usage-shape-fixture.mjs — a ledger in the SHAPE of this instance's (B-f95d ②, measured 2026-10-14 over the
// production ledger, read-only): what sizes a Usage-window answer is the number of DISTINCT keys per dimension and
// per cross, not the row count — so the distinct counts are the real ones and the rows are scaled down (≈ 40k of
// 1.01M). Synthesized (never the owner's data): uuid-shaped session ids, /home/u/… project paths, `sub-` account ids.
//   writeUsageShapeLedger(dataDir, { now }) → { rows, shape } — writes <dataDir>/usage-history/events-YYYY-MM.ndjson
import fs from 'node:fs';
import path from 'node:path';

export const SHAPE = Object.freeze({
  sessions: 14513, oneRowSessions: 11383, multiOriginSessions: 22, recentSessions: 1294, // active in the last 30 days
  projects: 940, projectOrigins: 968, /* a repo is almost always spent on by ONE origin */ days: 234, models: 24, accounts: 22, hosts: 4, modes: 3, backends: 2, pools: 2,
  origins: { main: 0.505, workflow: 0.353, subagent: 0.09, unknown: 0.052 }, // the row mix — drawn per project here
  rows: 40000, recentRowShare: 0.53,
});

// mulberry32 — a 32-bit generator with no short cycle (an LCG's low bits repeat and would collapse the distinct counts)
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
const uuid = (r) => `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-8${hex(r, 3)}-${hex(r, 12)}`;
const zipf = (r, n) => Math.min(n - 1, Math.floor(n * Math.pow(r(), 2.2))); // index 0 is the busiest

export function writeUsageShapeLedger(dataDir, { now = Date.now(), seed = 20261014 } = {}) {
  const r = rng(seed), S = SHAPE, DAY = 86400e3;
  const MODELS = ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5', 'claude-fable-5', 'claude-sonnet-5', 'claude-haiku-5',
    'claude-opus-4-8', 'claude-sonnet-4-8', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-6', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
    'gpt-6-astra', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];
  const accts = Array.from({ length: S.accounts - 2 }, (_, i) => ({ acct: 'sub-' + hex(r, 12), atype: i % 5 === 4 ? 'codex-subscription' : 'subscription', aname: `Account ${i + 1}` }));
  accts.push({ acct: null, atype: 'global', aname: null }, { acct: 'api-' + hex(r, 12), atype: 'api', aname: 'API key' }); // + the CLI login, an API key = 22 buckets
  const pools = ['pool-' + hex(r, 12), 'pool-' + hex(r, 12)];
  const hosts = [null, 'h-' + hex(r, 8), 'h-' + hex(r, 8), 'h-' + hex(r, 8)];
  const modes = [null, 'plan', 'acceptEdits'];
  const projects = Array.from({ length: S.projects }, (_, i) => `/home/u/workspace/${['app', 'svc', 'lib', 'site', 'tool'][i % 5]}-${String(i).padStart(3, '0')}${i % 7 === 0 ? '/packages/core' : ''}`);
  const other = (o) => (o === 'subagent' ? 'main' : 'subagent');
  // 234 ledger days in the last year: the 30 most recent all present (the default range), the rest spread back
  // (each a UTC noon — a row lands within ±10 h of it, so it never spills into a 235th day key)
  const noon = Math.floor(now / DAY) * DAY - 12 * 3600e3; // yesterday 12:00 UTC: every row is in the past
  const days = [];
  for (let d = 0; d < 30; d++) days.push(noon - d * DAY);
  for (let d = 0; days.length < S.days; d++) days.push(noon - (30 + Math.floor((d * 335) / (S.days - 30))) * DAY);
  const ORIG = Object.entries(S.origins);
  const pickOrigin = () => { let x = r(); for (const [k, p] of ORIG) { if ((x -= p) < 0) return k; } return 'main'; };
  const projOrigin = projects.map(() => pickOrigin());
  // the 22 two-origin sessions sit in projects 0–21 (+22 project pairs); sessions 940–945 run in projects 100–105 under
  // the OTHER origin (+6) = 968 project×origin pairs, while session×origin stays sessions + 22
  const extra = S.projectOrigins - S.projects - S.multiOriginSessions;
  const sess = Array.from({ length: S.sessions }, (_, i) => {
    const be = r() < 0.85 ? 'claude' : 'codex';
    const a = accts[be === 'codex' ? 4 + 5 * Math.floor(r() * 4) : zipf(r, accts.length)];
    const odd = i >= S.projects && i < S.projects + extra, p = odd ? 100 + i - S.projects : i < S.projects ? i : zipf(r, S.projects);
    return { sid: uuid(r), be, ...a, cwd: projects[p], host: hosts[r() < 0.8 ? 0 : 1 + Math.floor(r() * 3)],
      mode: modes[r() < 0.9 ? 0 : 1 + Math.floor(r() * 2)], origin: odd ? other(projOrigin[p]) : projOrigin[p], pool: r() < 0.3 ? pools[r() < 0.5 ? 0 : 1] : null, recent: false };
  });
  // the multi-row sessions are the first ones (index ≥ oneRowSessions is single-row); the busiest are the recent ones
  const multi = S.sessions - S.oneRowSessions;
  for (let i = 0; i < S.recentSessions; i++) sess[i].recent = true;
  const rows = [];
  const push = (s, origin, recent) => {
    const day = recent ? days[Math.floor(r() * 30)] : days[30 + Math.floor(r() * (S.days - 30))];
    const ts = Math.floor(day + (r() - 0.5) * 20 * 3600e3);
    const model = s.be === 'codex' ? MODELS[16 + Math.floor(r() * 8)] : MODELS[zipf(r, 16)];
    const rid = s.be === 'codex' ? `cx:${s.sid}:${Math.floor(r() * 1e9)}` : 'req_011C' + hex(r, 18);
    rows.push({ rid, mid: 'msg_011C' + hex(r, 18), ts, sid: s.sid, be: s.be, model, acct: s.acct, ...(s.pool ? { pool: s.pool } : {}), atype: s.atype, aname: s.aname,
      mode: s.mode, host: s.host, cwd: s.cwd, origin, ...(origin === 'subagent' || origin === 'workflow' ? { agent: 'agent-' + hex(r, 17) } : {}),
      i: Math.floor(r() * 50), cw5: Math.floor(r() * 5000), cw1: 0, cr: Math.floor(r() * 500000), o: Math.floor(r() * 2000), tier: 'standard' });
  };
  // every session gets its first row (single-row sessions: their only one)
  for (let i = 0; i < S.sessions; i++) push(sess[i], sess[i].origin, sess[i].recent);
  // 22 sessions also spent through a second origin (a conversation with its own subagents)
  for (let i = 0; i < S.multiOriginSessions; i++) { const s = sess[i]; push(s, other(s.origin), s.recent); }
  // the rest of the rows go to the multi-row sessions, the recent ones taking recentRowShare
  while (rows.length < S.rows) {
    const recent = r() < S.recentRowShare;
    const i = recent ? zipf(r, S.recentSessions) : S.recentSessions + zipf(r, multi - S.recentSessions);
    push(sess[i], sess[i].origin, sess[i].recent);
  }
  const dir = path.join(dataDir, 'usage-history');
  fs.mkdirSync(dir, { recursive: true });
  const shards = new Map();
  for (const e of rows.sort((a, b) => a.ts - b.ts)) {
    const k = new Date(e.ts).toISOString().slice(0, 7);
    if (!shards.has(k)) shards.set(k, []);
    shards.get(k).push(JSON.stringify(e));
  }
  for (const [k, lines] of shards) fs.writeFileSync(path.join(dir, `events-${k}.ndjson`), lines.join('\n') + '\n');
  return { rows: rows.length, shape: S };
}
