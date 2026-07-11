#!/usr/bin/env node
/**
 * Unit test for claimJsonls (src/session-store.js) — the lock→JSONL claiming
 * used by BOTH local (/api/sessions) and remote (hosts.discoverSessions)
 * discovery. Replays the reported incident: N parallel claude sessions in ONE
 * cwd, where mtime-recency claiming misattributed JSONLs to locks.
 *
 * Run: node scripts/test-claim-jsonls.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { claimJsonls } = require('../src/session-store.js');

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function lock(sessionId, extra = {}) { return { sessionId, exactOnly: false, ...extra }; }
function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const claimedIdOf = (claims, l) => { for (const [jid, w] of claims) if (w === l) return jid; return null; };

// ── 1. THE INCIDENT: 4 parallel non-resumed sessions in one cwd, shuffled
//       mtimes, plus a just-killed 5th session's JSONL with the NEWEST mtime.
console.log('1. four parallel sessions + freshly killed fifth (shuffled mtimes)');
{
  const ids = ['aaaa-1', 'bbbb-2', 'cccc-3', 'dddd-4'];
  const locks = ids.map((id) => lock(id));
  const jsonls = [
    { id: 'kkkk-killed', mtime: 5000 }, // killed session, NEWEST mtime
    { id: 'dddd-4', mtime: 4000 },
    { id: 'aaaa-1', mtime: 1000 },
    { id: 'cccc-3', mtime: 3000 },
    { id: 'bbbb-2', mtime: 2000 },
  ];
  const tails = { 'kkkk-killed': ['kkkk-killed'], 'aaaa-1': ['aaaa-1'], 'bbbb-2': ['bbbb-2'], 'cccc-3': ['cccc-3'], 'dddd-4': ['dddd-4'] };
  let reads = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const claims = claimJsonls(shuffle(locks, seed), shuffle(jsonls, seed * 7), (j) => { reads++; return tails[j.id]; });
    check(`seed ${seed}: every lock claims its OWN file`, locks.every((l) => claimedIdOf(claims, l) === l.sessionId));
    check(`seed ${seed}: killed file stays unclaimed (stopped w/ RIGHT id)`, !claims.has('kkkk-killed'));
  }
  check('exact pass needed ZERO tail reads', reads === 0, `${reads} reads`);
  // Contrast: the OLD rule (newest unclaimed JSONL per lock) misattributes here —
  const oldFirst = [...jsonls].sort((a, b) => b.mtime - a.mtime)[0].id;
  check('(old algorithm would have claimed the killed file first)', oldFirst === 'kkkk-killed');
}

// ── 2. Resumed session: filename keeps ORIGINAL id, tail carries CURRENT id.
console.log('2. resumed session claims by tail id');
{
  const l1 = lock('resumed-new'); // current id after --resume
  const l2 = lock('plain-live');
  const jsonls = [
    { id: 'original-old', mtime: 9000 }, // resumed session's file (original name)
    { id: 'plain-live', mtime: 8000 },
    { id: 'stale-dead', mtime: 9500 },   // dead session, newest mtime
  ];
  const tails = {
    'original-old': ['original-old', 'resumed-new'], // tail ends with CURRENT id
    'plain-live': ['plain-live'],
    'stale-dead': ['stale-dead'],
  };
  const claims = claimJsonls([l1, l2], jsonls, (j) => tails[j.id]);
  check('resumed lock claims the original-named file via tail', claimedIdOf(claims, l1) === 'original-old');
  check('plain lock exact-claims its own file', claimedIdOf(claims, l2) === 'plain-live');
  check('dead file (newest mtime!) stays unclaimed', !claims.has('stale-dead'));
}

// ── 3. Current-writer preference: a file whose tail ENDS with the lock's id
//       beats a file that merely mentions it mid-tail.
console.log('3. current-writer (last tail id) beats mere mention');
{
  const l = lock('yyyy');
  const jsonls = [
    { id: 'mention', mtime: 9000 }, // newer, but yyyy only mid-tail
    { id: 'writer', mtime: 1000 },  // older, but yyyy is the LAST id
  ];
  const tails = { mention: ['yyyy', 'qqqq'], writer: ['xxxx', 'yyyy'] };
  const claims = claimJsonls([l, lock('other')], jsonls, (j) => tails[j.id]);
  check('lock claims the file it is currently writing', claimedIdOf(claims, l) === 'writer');
}

// ── 4. Brand-new session (nothing flushed): mtime fallback claims only
//       NO-EVIDENCE files; a dead session's transcript is never stolen.
console.log('4. fallback claims no-evidence files only');
{
  const l = lock('brand-new'); // id appears nowhere
  const l2 = lock('also-new'); // second brand-new lock, nothing left for it
  const jsonls = [
    { id: 'dead-hist', mtime: 9000 },  // newest, but tail names a dead session
    { id: 'empty-new', mtime: 8000 },  // empty file (size 0 → [])
  ];
  const tails = { 'dead-hist': ['dead-hist'], 'empty-new': [] };
  const claims = claimJsonls([l, l2], jsonls, (j) => tails[j.id]);
  check('brand-new lock takes the empty file', claimedIdOf(claims, l) === 'empty-new');
  check('dead transcript NEVER fallback-claimed', !claims.has('dead-hist'));
  check('second brand-new lock left unmatched (caller lists it by lock id)', claimedIdOf(claims, l2) === null);
}
// ── 4b. Only foreign-tail files available → fallback claims nothing.
console.log('4b. foreign-only dir: nothing claimed');
{
  const l = lock('brand-new');
  const claims = claimJsonls([l, lock('spacer')], [{ id: 'dead-1', mtime: 2 }, { id: 'dead-2', mtime: 1 }], (j) => [j.id]);
  check('no transcript stolen', claims.size === 0);
}

// ── 5. Single-lock-single-jsonl short-circuits with NO tail read.
console.log('5. unambiguous dir: no tail read');
{
  let reads = 0;
  const l = lock('does-not-match-filename');
  const claims = claimJsonls([l], [{ id: 'only-file', mtime: 1 }], () => { reads++; return []; });
  check('single lock claims the single file', claimedIdOf(claims, l) === 'only-file');
  check('no tail read performed', reads === 0, `${reads} reads`);
}

// ── 6. exactOnly (webui-tracked) locks never fall through to tail/mtime.
console.log('6. exactOnly lock misses → claims nothing');
{
  const l = lock('webui-id', { exactOnly: true });
  const claims = claimJsonls([l, lock('spacer')], [{ id: 'other-a', mtime: 2 }, { id: 'other-b', mtime: 1 }], () => []);
  check('exactOnly lock left unassigned', claimedIdOf(claims, l) === null);
}

// ── 7. Degraded (no tail data at all, no exact match — e.g. remote host whose
//       tail pipeline failed): behaves like the OLD algorithm (pure mtime).
console.log('7. no tail data → old mtime behavior');
{
  const l1 = lock('rot-1'); const l2 = lock('rot-2');
  const jsonls = [{ id: 'f-old', mtime: 1000 }, { id: 'f-new', mtime: 2000 }];
  const claims = claimJsonls([l1, l2], jsonls, () => null);
  check('both files claimed', claims.size === 2);
  check('newest file claimed first (lock order)', claims.get('f-new') === l1 && claims.get('f-old') === l2);
}

// ── 8. Old lock without sessionId (ancient CLI) → mtime fallback.
console.log('8. lock without sessionId falls back');
{
  const l = lock(null);
  const claims = claimJsonls([l, lock('live-x')], [{ id: 'live-x', mtime: 2 }, { id: 'mystery', mtime: 1 }], (j) => (j.id === 'mystery' ? [] : ['live-x']));
  check('id-less lock takes the leftover file', claimedIdOf(claims, l) === 'mystery');
}

// ── 9. Invariant: each JSONL claimed by at most one lock (dup lock ids too).
console.log('9. one claim per JSONL');
{
  const locks = [lock('dup'), lock('dup'), lock('zzz')];
  const jsonls = [{ id: 'dup', mtime: 3 }, { id: 'other', mtime: 2 }, { id: 'empty', mtime: 1 }];
  const claims = claimJsonls(locks, jsonls, (j) => (j.id === 'empty' ? [] : [j.id]));
  const owners = new Set(claims.values());
  check('no lock owns two files', owners.size === claims.size);
  check('every claimed id unique', new Set(claims.keys()).size === claims.size);
}

// ── 10. More locks than JSONLs: extras stay unmatched (caller lists them by
//        their lock sessionId — local Step 3 / remote parity path).
console.log('10. lock overflow leaves extras unmatched');
{
  const l1 = lock('has-file'); const l2 = lock('no-file-yet');
  const claims = claimJsonls([l1, l2], [{ id: 'has-file', mtime: 1 }], (j) => ['has-file']);
  check('only the real file is claimed', claims.size === 1 && claimedIdOf(claims, l1) === 'has-file');
  check('brand-new lock unmatched (listed via its own id by caller)', claimedIdOf(claims, l2) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
