#!/usr/bin/env node
// THE STOP NUDGE, MEASURED (B-a8f0, lane stop-nudge-free; NOT a test-*.mjs, no tier). Reads the spend guard's
// persisted ledger (data/spend-budget.json — src/server/spend-guard.js writes `{v, budget: {identities: {<id>:
// [{at, reason}]}}, nudge: {<session-status key>: {at, n, everSeenStatus}}}`) and prints, per identity per UTC day,
// the Stop hook's billed nudges (`reason: 'stop-nudge'`) beside every unattended billed turn. READ-ONLY: pass a COPY
// of the production file (the guard rewrites it in place); identity keys are shortened, nothing else is printed.
// The ledger keeps 24 h (pruneBudget's DAY_MS) — the "per day" rows are the slices of that window.
//   node scripts/measure-stop-nudges.mjs <copy of spend-budget.json> [--now <ms>] [--json]
// THE METHOD (the BEFORE / AFTER number): the free stop needs the bookkeeping stamp (`s._bookkeptAt`, in memory),
// which exists only once the release runs — so BEFORE = stop-nudge stamps in the 24 h before the release, AFTER =
// the same count 24 h after it on the same instance (compare at a similar unattended load: the `all` column). The
// nudges the release freed = BEFORE − AFTER; the server journals no line for a free stop (it never asks the guard).
// `bookkeeping sessions` = nudged sessions whose record says they HAVE reported a status (`everSeenStatus`) — the
// sessions the new first rule can free; a never-reporting session stays under the old exit condition.
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const ni = args.indexOf('--now');
const now = ni >= 0 ? Number(args[ni + 1]) : Date.now();
if (!file) { console.error('usage: node scripts/measure-stop-nudges.mjs <copy of spend-budget.json> [--now <ms>] [--json]'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const identities = (raw.budget || raw).identities || {};
const DAY = 24 * 3600 * 1000;
const short = (k) => (String(k).length > 12 ? String(k).slice(0, 10) + '…' : String(k));
const day = (at) => new Date(at).toISOString().slice(0, 10);
const rows = [];
let n24 = 0, all24 = 0;
for (const [id, list] of Object.entries(identities)) {
  const per = new Map();
  for (const t of Array.isArray(list) ? list : []) {
    const at = Number(t && t.at) || Number(t) || 0;
    if (!at) continue;
    const d = day(at), r = per.get(d) || { nudges: 0, all: 0 };
    r.all++; if (t && t.reason === 'stop-nudge') r.nudges++;
    per.set(d, r);
    if (now - at <= DAY && at <= now) { all24++; if (t && t.reason === 'stop-nudge') n24++; }
  }
  for (const [d, r] of [...per].sort()) rows.push({ identity: short(id), day: d, ...r });
}
const nudge = raw.nudge || {};
const recent = Object.values(nudge).filter((r) => r && now - (Number(r.at) || 0) <= DAY);
const out = {
  now: new Date(now).toISOString(), rows,
  last24h: { nudges: n24, unattended: all24, share: all24 ? Math.round((n24 / all24) * 1000) / 10 : 0 },
  sessionsNudged24h: recent.length, bookkeepingSessions24h: recent.filter((r) => r.everSeenStatus).length,
  neverReported24h: recent.filter((r) => !r.everSeenStatus).length,
};
if (args.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`stop nudges in the spend ledger (now ${out.now})`);
console.log('identity      day         nudges  all-unattended');
for (const r of rows) console.log(`${r.identity.padEnd(13)} ${r.day}  ${String(r.nudges).padStart(6)}  ${String(r.all).padStart(14)}`);
console.log(`last 24 h: ${n24} stop nudges of ${all24} unattended billed turns (${out.last24h.share}%)`);
console.log(`sessions nudged in the last 24 h: ${out.sessionsNudged24h} — ${out.bookkeepingSessions24h} that report a status (the first rule can free them), ${out.neverReported24h} that never did (the exit condition's)`);
console.log('method: BEFORE = this run before the release; AFTER = the same run 24 h after it; freed = BEFORE − AFTER (a free stop asks no guard and leaves no stamp)');
