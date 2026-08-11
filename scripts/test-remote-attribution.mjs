#!/usr/bin/env node
// Per-account attribution for REMOTE ledger events (2.294.0, the owner's live
// complaint: a remote message's billing row could only say "<host>'s machine
// login"). VibeSpace records which account it spawned a remote session with —
// the ingest just discarded it. Now it resolves by-time like local events,
// and ONLY sessions VibeSpace never spawned keep the host bucket.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(REPO + '/src/usage-history.js');
let pass=0, fail=0; const ok=(c,n,e)=>{if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.error('  ✗ '+n+(e?'\n    '+e:''));}};

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-remattr-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-remattr-home-'));
const ACCT = 'sub-abc123';
const uh = new UsageHistory({ dataDir, homeDir: home,
  resolveAccount: (id) => (id === ACCT ? { type: 'subscription', name: 'Fish Max' } : null) });

const T0 = Date.parse('2026-08-11T00:00:00Z');
const SPAWNED = 'aaaaaaaa-1111-2222-3333-444444444444';   // VibeSpace spawned it with ACCT
const EXTERNAL = 'bbbbbbbb-1111-2222-3333-444444444444';  // someone's own terminal on that machine
uh.recordAttribution({ sid: SPAWNED, acct: ACCT, pool: null, ts: T0 });

const ndjson = [
  { rid: 'req_1', mid: 'msg_1', ts: T0 + 60000, sid: SPAWNED, model: 'claude-fable-5', i: 100, o: 20, cr: 5, cw5: 0, cw1: 0 },
  { rid: 'req_2', mid: 'msg_2', ts: T0 + 90000, sid: EXTERNAL, model: 'claude-fable-5', i: 50, o: 10, cr: 0, cw5: 0, cw1: 0 },
  // predates the attribution entry by more than the grace window → NOT the account
  { rid: 'req_0', mid: 'msg_0', ts: T0 - 3600000, sid: SPAWNED, model: 'claude-fable-5', i: 10, o: 2, cr: 0, cw5: 0, cw1: 0 },
].map((e) => JSON.stringify(e)).join('\n');

const { added } = uh.ingestRemoteEvents('host-x', 'AIDev', ndjson);
ok(added === 3, `all three events ingested (${added})`);
const evs = uh._loadEvents();
const list = (evs?.events || evs || []);
const byMid = Object.fromEntries(list.map((e) => [e.mid, e]));

ok(byMid.msg_1?.acct === ACCT && byMid.msg_1?.atype === 'subscription' && byMid.msg_1?.aname === 'Fish Max',
  'a VibeSpace-spawned remote session bills to the REAL account (the complaint)');
ok(byMid.msg_1?.host === 'host-x', 'the machine dimension is preserved (device filter still works)');
ok(byMid.msg_2?.acct === 'host-x' && byMid.msg_2?.atype === 'host',
  'a session VibeSpace never spawned keeps the honest host bucket (never invented into an account)');
ok(byMid.msg_0?.acct === 'host-x', 'a request predating the attribution entry is NOT back-billed to the account');
ok(uh.eventForMid('msg_1')?.acct === ACCT, 'the message-billing popup lookup (by message.id) resolves the account');
ok(uh.eventForRid('h:host-x:req_1')?.acct === ACCT, 'the request-id lookup resolves it too');

// re-attribution on load must not undo it
const uh2 = new UsageHistory({ dataDir, homeDir: home, resolveAccount: (id) => (id === ACCT ? { type: 'subscription', name: 'Fish Max' } : null) });
const l2 = uh2._loadEvents();
const again = (l2?.events || l2 || []).find((e) => e.mid === 'msg_1');
ok(again?.acct === ACCT, 'a fresh load keeps the resolved account (no re-bucketing to global)');

fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);
