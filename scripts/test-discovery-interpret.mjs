#!/usr/bin/env node
// R5 step 2 — the discovery fact-line INTERPRETATION is ONE shared function
// (discovery-facts.interpretDiscoveryLines), so the device can compute its
// own claims (discovery.v2) with the byte-identical logic the server ran
// centrally. This pins the extraction: a golden fixture of LOCK/J/H/N/T/C/HC/K
// lines → the exact session-card set, covering the claim algorithm's tricky
// cases (resumed session via tail-id, N-parallel-in-one-cwd, lock-with-no-
// jsonl, stopped transcript, codex rollout, keeper adoption).
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { interpretDiscoveryLines } = require(REPO + '/src/discovery-facts.js');
const { claimJsonls } = require(REPO + '/src/session-store.js');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const run = (lines) => interpretDiscoveryLines(lines.join('\n'), { hostId: 'host-x', hostName: 'BoxX', claimJsonls });

// ── case 1: a running lock over its own transcript (exact-id claim) ──
{
  const proj = '/HOME/.claude/projects/-home-u-proj';
  const A = 'aaaaaaaa-1111-2222-3333-444444444444';
  const s = run([
    `LOCK {"pid":1001,"sessionId":"${A}","cwd":"/home/u/proj","startedAt":1700000000}`,
    `J 1700000100.5 5000 ${proj}/${A}.jsonl`,
    `H ${proj}/${A}.jsonl\t"cwd":"/home/u/proj"`,
    `N ${proj}/${A}.jsonl\t{"type":"user","message":{"role":"user","content":"first real question"}}`,
    `T ${proj}/${A}.jsonl\t${A},`,
  ]);
  ok(s.length === 1 && s[0].sessionId === A && s[0].status === 'remote-running' && s[0].pid === 1001, 'running lock → one running card with pid');
  ok(s[0].host === 'host-x' && s[0].hostName === 'BoxX', 'host descriptor injected as parameters');
}

// ── case 2: a RESUMED session — lock id ≠ filename, current id in the tail ──
{
  const proj = '/HOME/.claude/projects/-home-u-work';
  const ORIG = 'bbbbbbbb-1111-2222-3333-444444444444';
  const CUR = 'cccccccc-9999-8888-7777-666666666666';
  const s = run([
    `LOCK {"pid":2002,"sessionId":"${CUR}","cwd":"/home/u/work","startedAt":1700000000}`,
    `J 1700000200 8000 ${proj}/${ORIG}.jsonl`, // filename keeps the ORIGINAL id
    `T ${proj}/${ORIG}.jsonl\t${ORIG},${CUR},`, // tail carries the current writer last
  ]);
  ok(s.length === 1 && s[0].sessionId === ORIG && s[0].status === 'remote-running', 'resumed session claims its ORIGINAL-named transcript via the tail id (not stolen, not doubled)');
}

// ── case 3: two parallel sessions in ONE cwd — no mtime mis-attribution ──
{
  const proj = '/HOME/.claude/projects/-home-u-multi';
  const P = 'dddddddd-0000-0000-0000-000000000001';
  const Q = 'eeeeeeee-0000-0000-0000-000000000002';
  const s = run([
    `LOCK {"pid":3003,"sessionId":"${P}","cwd":"/home/u/multi","startedAt":1700000000}`,
    `LOCK {"pid":3004,"sessionId":"${Q}","cwd":"/home/u/multi","startedAt":1700000000}`,
    `J 1700000300 100 ${proj}/${P}.jsonl`,
    `J 1700000400 100 ${proj}/${Q}.jsonl`,
    `T ${proj}/${P}.jsonl\t${P},`,
    `T ${proj}/${Q}.jsonl\t${Q},`,
  ]);
  const ids = s.map((x) => x.sessionId).sort();
  ok(s.length === 2 && ids[0] === P && ids[1] === Q && s.every((x) => x.status === 'remote-running'), 'two locks in one cwd each claim their OWN transcript (the N-parallel incident)');
}

// ── case 4: a lock with no flushed transcript yet → listed by its own id ──
{
  const F = 'ffffffff-0000-0000-0000-000000000003';
  const s = run([`LOCK {"pid":4004,"sessionId":"${F}","cwd":"/home/u/fresh","startedAt":1700000500}`]);
  ok(s.length === 1 && s[0].sessionId === F && s[0].status === 'remote-running' && s[0].cwd === '/home/u/fresh', 'brand-new lock with no jsonl → listed by its own id (never dropped/stealing)');
}

// ── case 5: a stopped transcript (no lock) → resumable STOPPED card + name ──
{
  const proj = '/HOME/.claude/projects/-home-u-old';
  const S = '99999999-0000-0000-0000-000000000004';
  const s = run([
    `J 1699999999 3000 ${proj}/${S}.jsonl`,
    `H ${proj}/${S}.jsonl\t"cwd":"/home/u/old"`,
    `N ${proj}/${S}.jsonl\t{"type":"user","message":{"role":"user","content":"an old session about migrations"}}`,
  ]);
  ok(s.length === 1 && s[0].sessionId === S && s[0].status === 'remote-stopped' && s[0].cwd === '/home/u/old', 'unclaimed transcript → stopped card with cwd');
  ok(s[0].name === 'an old session about migrations', 'name taken from the first real user message (shared naming rule)');
}

// ── case 6: codex rollout → resumable stopped codex card ──
{
  const T = '11111111-2222-3333-4444-555555555555';
  const rp = `/HOME/.codex/sessions/2026/08/11/rollout-2026-08-11T00-00-00-${T}.jsonl`;
  const s = run([
    `C 1700001000 4000 ${rp}`,
    `HC ${rp}\t"cwd":"/home/u/cx"`,
  ]);
  ok(s.length === 1 && s[0].sessionId === T && s[0].backend === 'codex' && s[0].status === 'remote-stopped' && s[0].cwd === '/home/u/cx', 'codex rollout → resumable stopped codex card');
}

// ── case 7: keeper meta adopts a running session (keeperSid on the card) ──
{
  const proj = '/HOME/.claude/projects/-home-u-keep';
  const K = '22222222-3333-4444-5555-666666666666';
  const s = run([
    `LOCK {"pid":5005,"sessionId":"${K}","cwd":"/home/u/keep","startedAt":1700002000}`,
    `J 1700002100 200 ${proj}/${K}.jsonl`,
    `T ${proj}/${K}.jsonl\t${K},`,
    `K sess-9\t{"claudeSessionId":"${K}","childPid":5006}`,
  ]);
  ok(s.length === 1 && s[0].keeperSid === 'sess-9', 'a live keeper meta attaches its sid to the running card (reattach-not-respawn)');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
