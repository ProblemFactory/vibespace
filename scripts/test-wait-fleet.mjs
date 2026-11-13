#!/usr/bin/env node
// THE FLEET DAY'S NUMBERS (lane queued-is-not-woke laws 2 + 3, SHAPE C — 主开发 13:42Z): scripts/wait-fleet.mjs, reader B's
// simulation (int359/acc-399/cut-b, copied) on the REAL engine + watch + For-you store + ladder — 20 workers in 1–4 h turns, a
// coordinator posting quietly, one 8 h hang — swept every five minutes. The numbers 主开发 asked for, each a leg with its
// bound: owner items a day at four hours; sender entries HANDED to the coordinator a day under «never the same set twice»;
// reads and their time per sweep; the hang seen after how many minutes. A red control: a slot that forgets the set it handed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = JSON.stringify;
const MUT = mutantCopies('wait-fleet', REPO);
const day = (env) => { const out = execFileSync(process.execPath, [path.join(REPO, 'scripts/wait-fleet.mjs')], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 600000 }); const l = out.split('\n').find((x) => x.startsWith('FLEET ')); return l ? JSON.parse(l.slice(6)) : null; };
console.log('THE FLEET DAY (seed 42, the 8 h hang) — the release\'s rules measured 102 owner items and 254 lines to the coordinator a day');
const d = day({ SEED: '42', HANG: '1' });
console.log('   ' + J(d));
ok(`owner items a day at FOUR hours: ${d && d.ownerItemsDay} (at most 15; reader B measured about 100 at one hour)`, !!d && d.ownerItemsDay <= 15 && d.ownerItemsDay >= 1, J(d && d.ownerItemsByCid));
ok(`sender entries HANDED to the coordinator a day under «never the same set twice»: ${d && d.senderEntriesHandedToCoordDay} (at most 30; 254 lines before) — and no sender handed the same set twice with no emptying between (${d && d.sameSetHandedAgainDay}; an emptied set that fills again is a new wait)`, !!d && d.senderEntriesHandedToCoordDay <= 30 && d.sameSetHandedAgainDay === 0, J(d && { toCoord: d.senderEntriesHandedToCoordDay, filings: d.slotFilingsDay, same: d.sameSetHandedAgainDay }));
ok(`reads a sweep at the ${d && d.periodMin}-minute period: median ${d && d.readsPerSweep.median}, max ${d && d.readsPerSweep.max}; a sweep's time median ${d && d.msPerSweep.median} ms, max ${d && d.msPerSweep.max} ms`, !!d && d.periodMin === 5 && d.readsPerSweep.max <= 60 && d.msPerSweep.median <= 50, J(d && { reads: d.readsPerSweep, ms: d.msPerSweep }));
ok(`the hang seen after ${d && d.hangSeenAfterMin} minutes of its turn (its first message's four hours, a sweep's five minutes)`, !!d && d.hangSeenAfterMin != null && d.hangSeenAfterMin >= 240 && d.hangSeenAfterMin <= 480, J(d && d.hangSeenAfterMin));
console.log('RED CONTROL');
{
  const rel = 'src/server/conversation-deliver.js';
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const a = "    for (const e of took || []) if (e && e.slot) (slots[cid] || (slots[cid] = {}))[e.slot] = { handed: e.setKey || '[]', at: Date.now() };";
  const m = src.includes(a) ? MUT.write(rel, src.split(a).join('    void took;'), 'forget') : null;
  const c = m ? day({ SEED: '42', HANG: '1', FLEET_DELIVER: m }) : null;
  ok('CONTROL: a slot that forgets the set it handed ⇒ senders are handed the same set again (rule a red)', !!c && c.sameSetHandedAgainDay > 0, J(c && { same: c.sameSetHandedAgainDay, toCoord: c.senderEntriesHandedToCoordDay }));
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
