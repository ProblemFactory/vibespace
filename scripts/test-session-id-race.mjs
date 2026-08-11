#!/usr/bin/env node
// Session id / socket-name COUNTER RACE (2026-08-11, proven in production
// data on a fleet instance: four sessions minted ids sess-21/22/31/34 all
// carried sockName cw-36, differing only by the Date.now() millisecond).
// Cause: `id` incremented the counter, then `sockName` RE-READ the counter
// ~100 lines and several awaits later, so a burst of concurrent creates all
// saw the latest value. Two landing in the same millisecond share a socket
// path AND a session-meta file — one session's metadata (name,
// claudeSessionId, account, taskId) silently overwrites the other's.
// This pins the invariant STRUCTURALLY: one captured value feeds both.
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

// ── 1. source invariant: no site may RE-READ the counter for a name/id ──
for (const rel of ['src/ws-handler.js', 'server.js']) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  const reReads = src.split('\n')
    .map((l, i) => ({ l, i: i + 1 }))
    .filter(({ l }) => /sessionCounterRef\.value/.test(l) && !/\+\+sessionCounterRef\.value/.test(l) && !/^\s*\/\//.test(l));
  ok(reReads.length === 0, `${rel}: zero bare re-reads of sessionCounterRef.value (id and sockName must share ONE captured value)`,
    reReads.map((r) => `${rel}:${r.i} ${r.l.trim().slice(0, 90)}`).join('\n    '));
}

// ── 2. behavioural: simulate the real interleaving ──
// The create path is: mint id → await (cwd preflight / host inference /
// keeper probe) → build sockName. Model both versions over 4 concurrent
// creates and assert the FIXED shape cannot produce a shared counter.
const mk = (reRead) => {
  const ref = { value: 20 };
  const out = [];
  const starts = [];
  for (let k = 0; k < 4; k++) {
    const seq = ++ref.value;            // id minted
    starts.push({ seq, k });
  }
  // all four resume AFTER the awaits (counter now at its latest value)
  for (const st of starts) {
    const sockSeq = reRead ? ref.value : st.seq;
    out.push({ id: `sess-${st.seq}`, sock: `cw-${sockSeq}` });
  }
  return out;
};
const buggy = mk(true), fixed = mk(false);
ok(new Set(buggy.map((r) => r.sock)).size === 1,
  'negative control: the re-read shape gives all four creates the SAME sockName counter (the production symptom)');
ok(new Set(fixed.map((r) => r.sock)).size === 4,
  'captured-value shape gives four DISTINCT sockName counters');
ok(fixed.every((r) => r.id.split('-')[1] === r.sock.split('-')[1]),
  'every session\'s id counter MATCHES its sockName counter (the field evidence showed 7/15 mismatched)');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
