#!/usr/bin/env node
// THE READINGS' ATTRIBUTION — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-readings-attribution.mjs, whose producers, the ledger, the migrations and repairs on fixtures, the
// real engine and pool, the browser panel, the probe world and every patched-copy CONTROL (with its premise) stay there: §7 the
// session-less producer's key, §8 the meter's wiring, §9 the source pins + §9b the law index and the kb full row (each round's
// rule with its NEGATIVE CONTROL over the text), §11d/§11f/§12a/§12b/§12c/§12d's source and docs pins, §13's byte-identical
// mirror, §15/§16/§16b/§16c's SOURCE PINS, §19 ⓪ the probe's isolation and ⑨'s hourly repair. Each reads the file it pins BY
// NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-readings-attribution-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const code = (f) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

{
    const engSrc = code('src/server/usage-pool-engine.js');
    ok('§5b WIRING: maybePoolAutoSwitchForPool decides on switchCandidates, and the act sites keep healthyPoolMembers',
      /const members = switchCandidates\(poolId\)/.test(engSrc) && /const alive = healthyPoolMembers\(poolId\)/.test(engSrc), '');
}

// ── §7 the session-less producer is keyed by its spawn's config dir ─────────
{
  const ur = read('src/usage-routes.js');
  ok('§7 the spawn\'s creds dir is derived ONCE from `key`…', /const credsDir = isGlobal \? null : accounts\.subDir\(key\);/.test(ur) && /if \(credsDir\) env\.CLAUDE_SECURESTORAGE_CONFIG_DIR = credsDir;/.test(ur));
  // …and it is derived exactly ONCE in that function, so "the key and the
  // credentials are one decision" is STRUCTURAL rather than a check that could
  // never fail (an unfalsifiable guard is not protection — 2.369.43).
  const panelBody = ur.slice(ur.indexOf('async function refreshViaCliPanel'), ur.indexOf("app.post('/api/usage/refresh'"));
  const subDirRefs = (panelBody.match(/accounts\.subDir\(/g) || []).length;
  ok('§7 …exactly ONE derivation of the creds dir in the whole function (a second one is how the two could ever disagree)', subDirRefs === 1, 'subDir( refs in refreshViaCliPanel: ' + subDirRefs);
  // …and the WRITE names that same `key`. The pin moved with the mechanism
  // (2026-09-08): the panel no longer builds a path and renames a temp file —
  // every usage-cache write in the product goes through src/usage-cache-write.js
  // so a reading merges into the file's typed `limits` per limitId. What must
  // stay true is what it always was: the object goes to the file for `key`, and
  // nothing in this function writes that directory behind the choke point.
  ok('§7 …and writes the panel back under that same key', /usageWrite\.writeCacheObject\(\{ cacheDir: USAGE_CACHE_DIR, key, obj: merged/.test(panelBody), 'panel write site');
  ok('§7 …and nothing in the panel refresh writes the cache directory directly', !/fs\.writeFileSync\([^)]*USAGE_CACHE_DIR/.test(panelBody) && !/fs\.renameSync/.test(panelBody), 'raw writes inside refreshViaCliPanel');   // stale-pins: kept — an absence check
  ok('§7 …and says WHY (a reading with no session is keyed by the credentials its process was handed)', /its identity IS the config dir the spawn was given/.test(ur));
}

// ── §8 UI honesty ──────────────────────────────────────────────────────────
{
  ok('§8 the pure module imports nothing (DOM-free by construction)', !/^\s*import /m.test(read('src/lib/usage-source.js')));

  const um = read('src/lib/usage-meter.js');
  // The import list GREW with the limit-aware helpers (B-9213/B-8b12), so the
  // pin asserts the four provenance rules are still imported FROM THE PURE
  // MODULE and that there is still exactly ONE provenance line per panel —
  // the mechanism — instead of pinning the literal line, which would go red
  // for every future helper and green for a second hand-written line.
  const imp = (um.match(/import \{([^}]*)\} from '\.\/usage-source\.js';/) || [, ''])[1];
  ok('§8 WIRING: the meter imports the pure rules and renders ONE provenance line for both panels',
    ['corroborationNote', 'readingSource', 'stampText', 'staleSince'].every((n) => imp.includes(n)) && (um.match(/\$\{sourceLine\(/g) || []).length === 2,
    'usage-source import: ' + imp.trim());
  ok('§8 WIRING: it reads the per-account credential state /api/usage now carries', /this\._usageLogins = data\?\.logins \|\| \{\}/.test(um) && /logins: \(\(\) => \{/.test(read('src/usage-routes.js')));
  ok('§8 WIRING: every interpolated value goes through escHtml (the panel renders peer-controlled account names)', /escHtml\(src\.tip\)/.test(um) && /escHtml\(t\('via \{source\}'/.test(um));
}

// ── §9 source pins: nobody may key on the observation again ────────────────
{
  const eng = code('src/server/usage-pool-engine.js');
  ok('§9 orgVerifiedKey exists nowhere in executable code (the comments keep the refutation on record)', !/\borgVerifiedKey\b/.test(eng) && /REFUTED AND REMOVED: `orgVerifiedKey/.test(read('src/server/usage-pool-engine.js')));
  ok('§9 sessionReadingMember is gone too — one question, one answer', !/\bsessionReadingMember\b/.test(eng));
  ok('§9 the OTel label has NO reader left in the engine (observedMemberFor / corroborateReading / noteDivergence retired 2026-09-30 — the org is a machine-wide label)', !/\bobservedMemberFor\b|\bcorroborateReading\b|\bnoteDivergence\b|observedOrgFor\?\.\(/.test(eng));
  ok('§9 server.js executes no setTruthLookup at all (the OTel map may never key a bake again)', !/setTruthLookup\s*\(/.test(code('server.js')));
  ok('§9 the ingest writes no attribution record (the corrective-record era is over)', !/recordAttribution\(/.test(code('src/server/otel-ingest.js')));
  const st = read('src/slot-transitions.js');
  ok('§9 accounts.js is the ONLY writer of the transition ledger', /\.record\(/.test(code('src/accounts.js')) && !/slotTransitions\.record\(/.test(code('src/server/usage-pool-engine.js')));
  ok('§9 …and the engine holds a READ-ONLY view of it', /const slotTransitions = new SlotTransitions/.test(read('src/server/usage-pool-engine.js')) && /READ-ONLY view of the transition ledger/.test(read('src/server/usage-pool-engine.js')));
  ok('§9 the statusline resolves the credential LINK per write (its spawn key is fixed for the process\'s life)', /VIBESPACE_ACCOUNT_LINK/.test(read('data/bin/vibespace-usage')) && /fs\.readlinkSync\(link\)/.test(read('data/bin/vibespace-usage')) && /VIBESPACE_ACCOUNT_LINK=\$\{spawnAccount\.linkPath\}/.test(read('src/spawn/local.js')));
  ok('§9 …and the spawn seam NAMES that link (linkPath) instead of letting the consumer guess which localEnv key holds it', /linkPath: link,/.test(read('src/accounts.js')) && /linkPath: this\._acctDir\('claude', id\),/.test(read('src/accounts.js')));
  ok('§9 …and the REMOTE branch deliberately has no such twin, with the reason written down', /Spawn-fixed BY CONSTRUCTION on a remote host/.test(read('src/ws-create.js')));
  ok('§9 login-state has ONE home, and every consumer imports it from there', ["src/server/usage-pool-engine.js", "src/usage-routes.js", "src/reading-repair.js"].every((f) => /require\('\.\.?\/(\.\.\/)?login-state\.js'\)/.test(read(f))));
  ok('§9 the migration is registered append-only with a dated id', /id: '2026-09-reattribute-readings-by-slot'/.test(read('src/server/migrations.js')));
  ok('§9 …and it says out loud what it did, even when that is nothing', /\[migrate\] readings-by-slot:/.test(read('src/server/migrations.js')));
  // §9b THE LAW INDEX IS A SOURCE PIN TOO (integration r2, a reproduced
  // merge-only doc regression). CLAUDE.md is auto-loaded and its routing table
  // is what gates the NEXT change to this subsystem, so a superseded paragraph
  // there outranks any essay that contradicts it. The Pool/billing row is ONE
  // 3.3 KB line, so a hand-merge that keeps "both sides verbatim" resurrects
  // the refuted rule SUB-LINE, where a lost/resurrected-LINE check sees
  // nothing. Pinned against the code that refutes it, not against a snapshot:
  // the row may not claim the observed org still routes VALUES while
  // readingSlotFor is what every value producer calls.
  {
    const md = read('CLAUDE.md');
    const row = md.split('\n').find((l) => /^\|\s*\*\*Pool\/billing decisions\*\*/.test(l)) || '';
    ok('§9b the Pool/billing routing row exists and is one well-formed 3-cell row', !!row && row.split('|').length === 5, String(row.length));
    const REFUTED = /quota VALUES keep the observed-org routing/;
    ok('§9b …and it does NOT still say the observed org routes quota VALUES (the rule this chain deleted from the code)', !REFUTED.test(row), row.slice(0, 200));
    ok('§9b …while the rule that REPLACED it is stated there', /EVERY reading AND every rejection is attributed to the credential SLOT/.test(row) && /readingSlotFor/.test(row));
    // the CODE half of the same claim — the doc is wrong precisely because the
    // engine routes every value through the slot and the OTel override is dead
    const engSrc = code('src/server/usage-pool-engine.js');
    ok('§9b …and the engine agrees: values go through readingSlotFor, nothing keys on the observation', /readingSlotFor\(/.test(engSrc) && !/\borgVerifiedKey\b/.test(engSrc) && !/setTruthLookup\s*\(/.test(code('server.js')));
    // NEGATIVE CONTROL: the pin can SEE the refuted sentence when it is there
    // (this is the leg the merge defeated — a line-granularity check reports
    // zero resurrected lines with the paragraph present).
    ok('§9b NEGATIVE CONTROL: the same predicate fails on the pre-fix row text', (() => {
      const prefix = row.slice(0, 1331);
      const resurrected = prefix + "**A REJECTION is attributed to the credential SLOT (the token-slot-validated link), never to the OTel-observed org — that names the identity the CLI cached at SPAWN (2026-09-07 loop incident); quota VALUES keep the observed-org routing.** " + row.slice(1331);
      return REFUTED.test(resurrected) && resurrected.split('|').length === 5;
    })());
    // …and the historical ESSAY is deliberately allowed to keep the refuted
    // rule (it narrates round 1 keeping it and round 2 finishing it) — a pin
    // that also banned the record would delete the history.
    // (and it narrates it in the PAST tense — "kept", not "keep" — which is
    // exactly the difference between a record and a rule)
    ok('§9b …and the kb ESSAY may still narrate the refuted rule as history, in the past tense', /Round 1 \(2\.369\.66\) changed only the CONSUMER:/.test(read('docs/kb-file-structure.md')) && /quota VALUES kept the observed-org routing/.test(read('docs/kb-file-structure.md')));
    // The SAME rule for the 2026-09-08 half: the auto-loaded index is what gates
    // the NEXT change to this subsystem, so the row must carry the rule the code
    // now runs, and the file index must name the module that holds it.
    // 2026-09-15 SIZE LAW (owner: CLAUDE.md is an INDEX, ≤ ~300 chars per
    // entry, the essay lives in the kb it points to): the auto-loaded row
    // above keeps the HEAD + the replacement rule; the FULL row — every
    // round's block, in order, with its terminators — lives verbatim in
    // docs/kb-design-lessons.md §18 (`### Row: Pool/billing decisions`,
    // the `**It belongs in…**` cell) and THAT is what the round-by-round
    // pins and their negative controls below read.
    const full = (() => {
      const kb = read('docs/kb-design-lessons.md');
      const m = kb.match(/^### Row: Pool\/billing decisions\n[\s\S]*?^\*\*It belongs in…\*\* (.*)$/m);
      return m ? m[1] : '';
    })();
    ok('§9b the FULL Pool/billing row lives in kb-design-lessons §18 and is longer than the index head', full.length > row.length && full.length > 10000, String(full.length));
    ok('§9b the routing full also states the rule THIS change added (the window outranks the bookkeeping)',
      /LAG SHADOW/.test(full) && /WINDOW IDENTITY GUARD/.test(full) && /reading-lag\.js/.test(full) && /NO EVIDENCE ⇒ NO REFUSAL/.test(full), full.slice(-320));
    ok('§9b …including the two properties a later edit is most likely to drop: the PHASE comparison, and that `ownWindow` is stamped and never read back out of `sevenDay.resetsAt`',
      /resetsAt mod 604800/.test(full) && /NEVER read back out of `sevenDay\.resetsAt`/.test(full));
    ok('§9b …and the file index names the PURE module beside the ledger it works with', /^  reading-lag\.js — PURE \(imports nothing\)/m.test(((t) => (t.split(/^## INDEX\b.*$/m)[1] || '').split(/^## /m)[0])(read('docs/kb-file-structure.md'))));
    // r2: the auto-loaded index gates the NEXT change, so it must carry the two
    // rules round 2 established — WHICH HALF of a window identifies an account,
    // and WHERE the established window may be kept. Both are the kind of thing
    // a later edit "simplifies" back, and each one cost a reproduced incident.
    ok('§9b …and the two rules ROUND 2 established: the weekly half is the only identity evidence (a 5h window names a TIME), and the established window lives in a sidecar no reading producer writes',
      /WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE/.test(full) && /FIVE-HOUR window names a TIME/.test(full)
      && /ESTABLISHED WINDOW LIVES IN A SIDECAR/.test(full) && /\.window-<key>/.test(full)
      && /NOT a field of the usage-cache snapshot/.test(full), full.slice(-400));
    ok('§9b NEGATIVE CONTROL: those predicates fail on the full as ROUND 1 left it (they are not matching prose that was already there)',
      (() => {
        const r1 = full.replace(/\*\*THE WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE\*\*[\s\S]*?The statusline carries a byte-identical MIRROR/,
          'A weekly window is an ACCOUNT FINGERPRINT compared by its PHASE (`resetsAt mod 604800`, ±120s) because a roll adds exactly one week. `cache.ownWindow` is STAMPED AT THE WRITE by the one producer whose key and credential dir are the same decision (refreshViaCliPanel) and NEVER read back out of `sevenDay.resetsAt`; every session-attributed writer PRESERVES it. The statusline carries a byte-identical MIRROR');
        return r1.length < full.length
          && !/WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE/.test(r1) && !/ESTABLISHED WINDOW LIVES IN A SIDECAR/.test(r1)
          // …while the ROUND 1 properties this full also pins are still there,
          // so the control differs in exactly the dimension it names
          && /resetsAt mod 604800/.test(r1) && /NEVER read back out of `sevenDay\.resetsAt`/.test(r1);
      })());
    ok('§9b NEGATIVE CONTROL: the same predicates fail on the full as it stood before this change (they are not matching prose that was always there)',
      // the terminus moves with the chain: every later round appends to the
      // SAME block, so this control strips through whatever the last one ended
      // with (r4: "…AFTER the guard chose the key.**") and must still remove
      // strictly more than nothing, or it has silently stopped applying.
      (() => { const before = full.replace(/\*\*AND THE READING IS EVIDENCE ABOUT ITSELF[\s\S]*?AFTER the guard chose the key\.\*\* /, ''); return !/LAG SHADOW/.test(before) && !/reading-lag\.js/.test(before) && !/PER BUCKET/.test(before) && before.length < full.length; })());
    // r3: the two rules THIS round established are exactly the kind a later edit
    // "simplifies" back — one of them is a single line's POSITION, the other is
    // which of two clocks a shipped single file is allowed to believe.
    ok('§9b …and the two rules ROUND 3 established: the clock ranks BELOW the windows (a proxy may not overrule what it stands for, and an unknown age does not expire), and the statusline dates the RE-POINT from the link the pool re-mints — never from its own last observation',
      /THE CLOCK RANKS BELOW THE WINDOWS/.test(full) && /`repointAgeMs == null` is UNKNOWN/.test(full)
      && /lstat\(link\)\.mtimeMs`? IS that instant/.test(full) && /systematically OLDER than the re-point/.test(full)
      && /AND THE STATUSLINE RUNS THE GUARD/.test(full) && /\.window-refused\.ndjson/.test(full), full.slice(-900));
    ok('§9b NEGATIVE CONTROL: those predicates fail on the full as ROUND 2 left it (they are not matching prose that was already there)',
      (() => {
        const r2 = full.replace(/\*\*THE CLOCK RANKS BELOW THE WINDOWS\*\*[\s\S]*?nothing is written anywhere\)\. /, '');
        return r2.length < full.length
          && !/THE CLOCK RANKS BELOW THE WINDOWS/.test(r2) && !/AND THE STATUSLINE RUNS THE GUARD/.test(r2)
          // …while the ROUND 1+2 properties this full also pins are still there
          && /WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE/.test(r2) && /ESTABLISHED WINDOW LIVES IN A SIDECAR/.test(r2)
          && /resetsAt mod 604800/.test(r2);
      })());
    // r4: the rule most likely to be "simplified" back is the one that reads as
    // an optimisation — deciding a record once instead of once per bucket.
    ok('§9b …and the rule ROUND 4 established: the repair moves PER BUCKET (the {5h,7d} primary half decides where the record goes; every other bucket is archived with its own reason), and "no evidence ⇒ no refusal" governs REFUSING TO WRITE, not MOVING',
      /THE REPAIR MOVES PER BUCKET, NEVER WHOLESALE/.test(full) && /ONE BUCKET AT A TIME/.test(full)
      && /the PRIMARY half is `\{5h,7d\}`/.test(full) && /governs REFUSING TO WRITE, not MOVING/.test(full)
      && /preserve-merges the previous scoped bucket/.test(full), full.slice(-900));
    ok('§9b NEGATIVE CONTROL: that predicate fails on the full as ROUND 3 left it (it is not matching prose that was already there)',
      (() => {
        const r3 = full.replace(/\*\*AND THE REPAIR MOVES PER BUCKET, NEVER WHOLESALE[\s\S]*?AFTER the guard chose the key\.\*\* /, '');
        return r3.length < full.length
          && !/THE REPAIR MOVES PER BUCKET/.test(r3) && !/ONE BUCKET AT A TIME/.test(r3)
          // …while every earlier round's properties this full pins are still there
          && /THE CLOCK RANKS BELOW THE WINDOWS/.test(r3) && /AND THE STATUSLINE RUNS THE GUARD/.test(r3)
          && /WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE/.test(r3);
      })());
    // r5: the rule most likely to be "simplified" back is the one that reads
    // like bookkeeping — which KEY the cache half iterates. It is the whole
    // difference between arming the live guard on an identity and arming it on
    // one of that identity's two files.
    ok('§9b …and the two rules ROUND 5 established: an identity can hold MORE THAN ONE cache file (so the cache half enumerates the files the product accepts, and the `acct:` rung is the only one that may ask the streams), and a bucket\'s fate is decided on the RECORD\'s buckets, not on the dated view of them',
      /AND AN IDENTITY CAN HOLD MORE THAN ONE CACHE FILE/.test(full) && /keyed on the FILES the product accepts/.test(full)
      && /structurally inert on it/.test(full) && /re-poisoned the just-cleaned stream on the next tick/.test(full)
      && /documented LAST RESORT/.test(full) && /a PSEUDO key never/.test(full)
      && /A BUCKET'S FATE IS DECIDED ON THE RECORD'S BUCKETS/.test(full) && /counted PARTIAL/.test(full), full.slice(-1200));
    ok('§9b NEGATIVE CONTROL: those predicates fail on the full as ROUND 4 left it (they are not matching prose that was already there)',
      (() => {
        const r4 = full.replace(/\*\*AND AN IDENTITY CAN HOLD MORE THAN ONE CACHE FILE[\s\S]*?never a drop line\.\*\*/, '');
        return r4.length < full.length
          && !/AN IDENTITY CAN HOLD MORE THAN ONE CACHE FILE/.test(r4) && !/A BUCKET'S FATE IS DECIDED ON THE RECORD'S BUCKETS/.test(r4)
          // …while every earlier round's properties this full pins are still there
          && /THE REPAIR MOVES PER BUCKET/.test(r4) && /THE CLOCK RANKS BELOW THE WINDOWS/.test(r4)
          && /WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE/.test(r4);
      })());
    // r6: the rule most likely to be dropped is the one that reads like an
    // implementation detail of r5 — that the DIRECTORY is not every file.
    ok('§9b …and the rule ROUND 6 established: the `__global__` key has a SECOND snapshot outside the directory (`data/usage-cache.json`), judged by the directory half\'s own answer, archived-then-UNLINKED rather than mirrored, and reported as its own state',
      /AND THE `__global__` KEY HAS A SECOND SNAPSHOT, OUTSIDE THAT DIRECTORY/.test(full)
      && /USAGE_CACHE_FILE/.test(full) && /newest-wins merge/.test(full)
      && /never a second `identityKeyFor` over that payload/.test(full)
      && /UNLINKED, not mirrored/.test(full) && /globalFile: clean \/ archived \/ unresolvable \/ absent/.test(full)
      && /STANDING SWEEP derives the persisted-snapshot ROOTS from the source/.test(full), full.slice(-1400));
    ok('§9b NEGATIVE CONTROL: that predicate fails on the full as ROUND 5 left it (it is not matching prose that was already there)',
      (() => {
        const r5 = full.replace(/ \*\*AND THE `__global__` KEY HAS A SECOND SNAPSHOT, OUTSIDE THAT DIRECTORY[\s\S]*?to judge or seed it with\.\*\*/, '');
        return r5.length < full.length
          && !/SECOND SNAPSHOT, OUTSIDE THAT DIRECTORY/.test(r5) && !/globalFile: clean \/ archived/.test(r5)
          // …while every earlier round's properties this full pins are still there
          && /AN IDENTITY CAN HOLD MORE THAN ONE CACHE FILE/.test(r5) && /THE REPAIR MOVES PER BUCKET/.test(r5)
          && /WEEKLY HALF IS THE ONLY IDENTITY EVIDENCE/.test(r5);
      })());
  }
}

{
  // the codex panel's disk seed must actually be able to see it
  const seedLine = read('src/usage-routes.js').split('\n').find((l) => /exec\(fn\)/.test(l) && /cxs/.test(l));
  const lit = seedLine && seedLine.match(/\/(\^\(cxs[^/]+)\//);
  const seedRe = lit ? new RegExp(lit[1]) : null;
  ok('§11a …so the codex panel\'s own disk seed can read it (a host-<id> file would be invisible to it)', !!seedRe && seedRe.test('__global_codex__.json') && !seedRe.test('host-h1.json'), String(seedLine).trim().slice(0, 120));
}
{
    ok('§11d …and the engine\'s reader is the FILE one, deliberately (making it account-aware would make a wiped member a valid switch TARGET)', /const st = memberLoginState\(linkedId\);/.test(read('src/server/usage-pool-engine.js')) && /loginState\(fp, \{ backend: 'claude' \}\)/.test(read('src/server/usage-pool-engine.js')) && /DELIBERATELY THE FILE, NOT THE ACCOUNT/.test(read('src/server/usage-pool-engine.js')));
}

// (f) LOW — the kb essay a reader reaches FIRST still documented the mechanism
//     this change deleted. A refuted claim stays on record, but it must be
//     MARKED refuted where it lives.
{
  // PER MENTION, not per line: these essays are single giant paragraphs, so a
  // line-level rule passes as soon as ANY other sentence on it says REFUTED
  // (measured — it let the very sentence this leg exists for slip back in).
  for (const f of ['docs/kb-file-structure.md', 'docs/kb-bugfix-invariants.md']) {
    const src = read(f);
    const stale = [];
    let hits = 0;
    for (const m2 of src.matchAll(/sessionReadingMember|unsatisfiable guard/g)) {
      hits++;
      const near = src.slice(Math.max(0, m2.index - 40), m2.index + 260);
      if (!/REFUTED|DELETED/.test(near)) stale.push(near.slice(0, 100).replace(/\s+/g, ' '));
    }
    ok(`§11f ${f}: every mention of the deleted resolver / the "unsatisfiable guard" claim is marked REFUTED WHERE IT STANDS (${hits} mentions)`, stale.length === 0 && hits >= 3, stale.join(' | '));
  }
  ok('§11f …and both essays name the resolver that replaced it', /readingSlotFor/.test(read('docs/kb-file-structure.md')) && /readingSlotFor/.test(read('docs/kb-bugfix-invariants.md')));
}
{
  // WIRING PIN: a pure join that the orchestrator never hands dataDir to is the
  // 2.355.0 unstaged-wiring class.
  ok('§12a WIRING: repairReadings passes dataDir into repairAttribution, and the lookup goes through the join (never the raw sid)', /repairAttribution\(\{ dataDir, historyDir:/.test(read('src/reading-repair.js')) && /transitions\.slotAt\(keys, r\.ts/.test(read('src/reading-repair.js')) && !/transitions\.slotAt\(r\.sid/.test(code('src/reading-repair.js')));
  ok('§12a WIRING: the journal backfill records the SAME namespace the engine prints (webui id), so its rows are joinable by the same map', /per-session switch \$\{poolId\}\/\$\{sid\}/.test(read('src/server/usage-pool-engine.js')) && /const row = s\n\s*\? \{ sessionId: s\[2\]/.test(read('src/reading-repair.js')));

  ok('§12b …and this is the attribution log\'s own invariant (src/server/usage-attribution.js, moved out of server.js), applied at the second site that reaches the same decision', /never to the pool id itself/.test(read('src/server/usage-attribution.js')) && /_nonPoolAcct/.test(code('src/usage-history.js')));

  ok('§12c …both new keys carry zh+ja entries', (() => {
    const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
    return ['session transcript', "A live Codex session on this account's credential slot pushed its own rate limits."].every((k) => zh.includes(JSON.stringify(k).slice(1, -1)) && ja.includes(JSON.stringify(k).slice(1, -1)));
  })());

  ok('§12c WIRING: every codex snapshot writer stamps a source, and the engine takes it as a PARAMETER (one helper, two channels — one of which does not always carry a reading)', /const writeSnap = \(snap, source\) =>/.test(read('src/server/usage-pool-engine.js')) && /snap\.source = source;/.test(read('src/server/usage-pool-engine.js')) && /writeSnap\(snap0, 'codex-rate-limits'\)/.test(read('src/server/usage-pool-engine.js')) && /writeSnap\(snap, 'limit-banner'\)/.test(read('src/server/usage-pool-engine.js')) && /if \(snap\) snap\.source = 'codex-rate-limits';/.test(read('src/usage-routes.js')) && /normalized\.source = 'codex-rollout';/.test(read('src/usage-routes.js')));

  ok('§12d the rule NAMES the server-side twin it mirrors (one reading-lag rule, two implementations that must not drift)', /a re-point reaches the running CLI on its NEXT request/i.test(read('src/server/usage-pool-engine.js')) && /NEXT request/.test(read('data/bin/vibespace-usage')));
}
{
  // ── ONE RULE, TWO SPELLINGS (the statusline ships as a single file)
  const SRC = read('src/reading-lag.js'), TOOL = read('data/bin/vibespace-usage');
  const cut = (txt) => {
    const a = txt.indexOf('// >>> reading-lag mirror'), b = txt.indexOf('// <<< reading-lag mirror');
    return a >= 0 && b > a ? txt.slice(a, b) : null;
  };
  const bSrc = cut(SRC), bTool = cut(TOOL);
  ok('§13 the statusline carries a BYTE-IDENTICAL mirror of the rule (it ships to checkout-less hosts and cannot require src/)',
    !!bSrc && bSrc.length > 2000 && bSrc === bTool, `src=${bSrc && bSrc.length} tool=${bTool && bTool.length}`);

    ok('§13 …and the shipped tool USES it (the r3 sidecar now records the window + the instant, and asks the shared rule)',
      /const d = decideLagShadow\(\{/.test(TOOL) && /prevWindow: ownWindowOf\(st\.key\) \|\| st\.win \|\| null/.test(TOOL) && /writeSlotState\(sf, \{ key, fp, win, at: Date\.now\(\) \}/.test(TOOL), '');
}
{
    const ur = read('src/usage-routes.js');
    // (inc-mubu23bd-5vxi: the capture READS the sidecar — the naming ladder asks
    // its `scoped` map which model a cap window is — and must never WRITE it)
    ok('§15 SOURCE PIN: the ONLY producer that writes the window sidecar is the panel refresh — the one whose key and credential dir are the same decision (rate-limit-capture may only READ it, for the model-cap naming ladder)',
      // lane oat-identity-fix-r3: every `.window-` write goes through its owner's ONE writer (src/window-stamp.js — the census of
      // WHO writes is test-oat-identity §9a, derived from the source), every read through its ONE reader
      /windowStamp\.writeWindowStamp\(USAGE_CACHE_DIR, key, \{ \.\.\.w, at: Date\.now\(\), source: 'on-demand'/.test(ur)
      && !/writeSidecar|writeWindowStamp|writeFileSync\([^)]*windowSidecarName|renameSync\([^)]*windowSidecarName/.test(code('src/rate-limit-capture.js'))
      && /require\('\.\/window-stamp\.js'\)\.readWindowStamp\(cacheDir, key\)/.test(code('src/rate-limit-capture.js')), '');
    ok('§15 …and it is never READ BACK from `sevenDay.resetsAt` (the field a mis-filed reading overwrites — that would let one bad write redefine the account)',
      /windowStamp\.readWindowStamp\(USAGE_CACHE_DIR, key\)/.test(code('src/server/usage-pool-engine.js')) && !/ownWindow = .*sevenDay\.resetsAt/.test(code('src/server/usage-pool-engine.js'))); // the sidecar's ONE reader (lane oat-identity-fix-r3)

    const shipped = read('data/bin/vibespace-usage');

    ok('§15 SOURCE PIN: the shipped tool dates the RE-POINT from the link the pool re-minted, and keeps `st.at` only as forensics',
      /fs\.lstatSync\(process\.env\.VIBESPACE_ACCOUNT_LINK\)\.mtimeMs/.test(shipped)
      && /repointAgeMs: repointAgeMs\(\),/.test(shipped)
      && !/repointAgeMs: Date\.now\(\) - \(Number\(st\.at\)/.test(shipped)
      && /at: Date\.now\(\) \}/.test(shipped), '');
    ok('§15 SOURCE PIN: in BOTH spellings the clock bound sits BELOW the two window rungs, and a null age does not expire',
      [read('src/reading-lag.js'), shipped].every((txt) => {
        const w1 = txt.indexOf("why: 'window-of-previous-slot'");
        const w2 = txt.indexOf("why: 'window-of-new-slot'");
        const cl = txt.indexOf("why: 'shadow-expired'");
        return w1 > 0 && w2 > w1 && cl > w2 && /repointAgeMs != null && \(!\(Number\(repointAgeMs\) >= 0\)/.test(txt);
      }), '');

  ok('§16 the migration is registered append-only with a dated id, and says out loud what it did',
    /id: '2026-09-refile-readings-by-window(-v\d+)?'/.test(read('src/server/migrations.js')) && /\[migrate\] readings-by-window:/.test(read('src/server/migrations.js')));
  ok('§16 …and it hands the CURRENT roster as the only accounts that may RECEIVE a reading (a removed subscription cannot hold one)',
    /roster = accounts\.filter\(\(a\) => a\.type === 'subscription'\)\.map\(\(a\) => a\.id\)/.test(read('src/server/migrations.js')));
  ok('§16 …and the RECORDS as well (r5): resolving a cache FILE to its identity is `usageIdentityGroups`\' job, which reads backend + type + email — ids alone would make this a second, weaker spelling of the engine\'s map',
    /accounts = \(st\?\.accounts \|\| \[\]\)\.filter\(\(a\) => a && a\.id\)/.test(read('src/server/migrations.js'))
    && /repairByWindow\(\{ dataDir, roster, accounts, id:/.test(read('src/server/migrations.js')));
}

  {
    const eng = read('src/server/usage-pool-engine.js');
    const calls = [...eng.matchAll(/(?<!function )guardReadingTarget\(([^,]+),\s*([^,]+),/g)].map((m) => m[2].trim());
    ok('§16b every live guard call is handed a PRODUCER PAYLOAD, never a merged cache snapshot (a merged snapshot is the one shape that can be mixed)',
      calls.length === 3 && calls.every((a) => /^readingLag\.windowOf\((parsed|snap)\)$/.test(a) || a === 'win'),
      JSON.stringify(calls));
    // (inc-mubu23bd-5vxi: since 2.1.274 one record states EVERY window; the guard
    // is handed exactly those — `lanesSnapshot(ev)` is derived from the record
    // alone, never from a cache — so the premise "one response, one payload" holds)
    ok('§16b …and the one that is not a whole payload is a rate_limit_event — ONE response: its representative bucket, or every window that same response stated (never a cache snapshot)',
      /const win = ev\.status === 'rejected' \? null : readingLag\.windowOf\(ev\.windows \? lanesSnapshot\(ev, \{ named: true \}\) : ev\);/.test(eng)
      && /function lanesSnapshot\(ev, \{ named = false \} = \{\}\) \{\n  const out = \{\};\n  for \(const l of lanesOf\(ev\)\)/.test(read('src/rate-limit-capture.js'))
      && /if \(x\.kind === 'sevenDay'\) out\.sevenDay = r;/.test(read('src/reading-lag.js')), '');
    ok('§16b …and each cache writer preserves the TARGET\'s own scopedWeekly, read AFTER the guard has chosen the key (so a re-file can never import a stranger\'s bucket)',
      (() => {
        const tool = read('data/bin/vibespace-usage');
        const refile = tool.indexOf("if (d.action === 'refile') key = d.key;");
        const openFile = tool.indexOf("const f = path.join(CACHE_DIR, key + '.json');", refile);
        const preserve = tool.indexOf('const prevScoped = (prev && Array.isArray(prev.scopedWeekly)) ? prev.scopedWeekly : [];', openFile);
        return /if \(\(!parsed\.scopedWeekly \|\| !parsed\.scopedWeekly\.length\) && Array\.isArray\(prev\.scopedWeekly\)/.test(eng)
          && refile > 0 && openFile > refile && preserve > openFile;
      })(), '');
  }
{
    ok('§16c SOURCE PIN: that IS how the live guard is keyed — the engine reads `.window-<cache file name>`, so an identity with two files needs two sidecars',
      /files = usageWrite\.listCacheDir\(USAGE_CACHE_DIR\);[\s\S]{0,500}for \(const fn of files\) if \(fn\.endsWith\('\.json'\) && !fn\.startsWith\('__models__'\) && !fn\.startsWith\('\.'\)\) keys\.add\(fn\.slice\(0, -5\)\);\n  try \{ for \(const a of \(accounts\.list\(\)\.accounts \|\| \[\]\)\) if \(a && typeof a\.id === 'string' && a\.id && !keys\.has\(a\.id\)\) rosterOnly\.push\(a\.id\); \} catch \{ \}/.test(read('src/server/usage-pool-engine.js'))   // B-6a92: + every account of the roster (one known only by its stamp; r5: read once, then memory)   // lane lg-store-writes U6.2: the walk lists the folder through the cache module (the pending copies first) — the pin moved with this leg from the heavy test-readings-attribution
      && /for \(const key of keys\) \{[\s\S]{0,200}windowStamp\.readWindowStamp\(USAGE_CACHE_DIR, key\)/.test(read('src/server/usage-pool-engine.js'))
      && /for \(const key of rosterOnly\) \{\n    if \(!_stampOnly\.has\(key\)\) \{ let w0 = null; try \{ w0 = windowStamp\.readWindowStamp\(USAGE_CACHE_DIR, key\); \}/.test(read('src/server/usage-pool-engine.js')), ''); // the sidecar's ONE reader (lane oat-identity-fix-r3) names it `.window-<key>`

    const eng = read('src/server/usage-pool-engine.js');
    ok('§16c SOURCE PIN: the sweep anchors the FRESHEST cache of an identity group, so the machine login\'s snapshot is what the next tick records for the whole identity',
      /if \(!g\.cache \|\| (?:m\.)?cache\.fetchedAt > g\.cache\.fetchedAt\) \{ g\.cache = (?:m\.)?cache; g\.accountId = (?:m\.)?accountId; \}/.test(eng)   // B-87fd identity unit 4: the group's members first, each member's own fields
      // B-a5c0: the per-group step moved into usage-estimator's sweepAnchorGroup — the engine hands it the group whole
      && /sweepAnchorGroup\(\{\s*identityKey, group: g, anchors: usageAnchors,/.test(eng)
      // (no-5h-window r5: the freshest cache is read through the identity's own «no 5h limit» — `group.tomb5h`)
      && /const cache = (?:withOwnAbsence\(group\?\.cache, group\?\.tomb5h\)|group\?\.cache);[\s\S]{0,3000}anchors\.maybeRecord\(\{ identityKey, accountId: group\.accountId, cache,/.test(read('src/usage-estimator.js')), '');

    ok('§16c SOURCE PIN: that is the engine\'s own spelling — both pseudo caches are recorded with a null accountId',
      /const gOwner = globalKeyOwner\(fn\.slice\(0, -5\)\);[^\n]*\n\s*const accountId = \(fn === '__global__\.json' \|\| gOwner\) \? null : fn\.slice\(0, -5\);/.test(read('src/server/usage-pool-engine.js')));

      // .396 seam (lane hub-loop-stalls, commit 2): the boot runs the migrations inside bootTrace.step('migrations', () => …),
      // so the call ends «runLocalMigrations());» — the pin follows the wrapper's close paren; the reload must still FOLLOW it
      ok('§16c(h) WIRING PIN: server.js calls usage.reloadRateLimitCache() right after runLocalMigrations() (inside its boot-trace step), and usage-routes exports it',
        /runLocalMigrations\(\)\)?;(?:\s*persistenceRouter\.reloadSettings\?\.\(\)\s*(?:\/\*[^*]*\*\/)?\s*;)?\s*usage\.reloadRateLimitCache\?\.\(\)/.test(read('server.js')) && /reloadRateLimitCache,/.test(read('src/usage-routes.js')));

    // SOURCE PINS: the two product facts this half stands on — the file the
    // seed is read from, and the newest-wins merge a stale copy wins.
    ok('§16c SOURCE PIN: `data/usage-cache.json` really is the `__global__` slot\'s other home — one reader, one writer, and the same-account merge writes the NAMED subscription\'s snapshot into it',
      /const USAGE_CACHE_FILE = path\.join\(__dirname, 'data', 'usage-cache\.json'\);/.test(read('server.js'))
      && /function readUsageCache\(\) \{[\s\S]{0,200}JSON\.parse\(fs\.readFileSync\(USAGE_CACHE_FILE, 'utf-8'\)\)[\s\S]{0,80}cached\?\.claude/.test(read('src/usage-routes.js'))
      // (lane no-5h-window r4: the merged snapshot keeps the slot's OWN «no 5h limit» — quota-model withOwnAbsence)
      && /const \{ name, email, \.\.\.usage \} = newest;\s*\n\s*_rateLimitCache = (?:quotaModel\.withOwnAbsence\(usage, g\)|usage); writeUsageCache\(\);/.test(read('src/usage-routes.js'))
      // …and the wrapper holds NOTHING but that payload, which is why archiving
      // `.claude` archives the whole file
      // (B-360d part 3 U2: the copy is written by the store writer — its produce makes the same bytes)
      && /storeWriter\(\)\.dirty\(USAGE_CACHE_FILE, \{ name: 'usage-cache\.write', makeDir: true, produce: \(\) => \(_rateLimitCache \? JSON\.stringify\(\{ claude: _rateLimitCache \}, null, 2\) : null\) \}\);/.test(read('src/usage-routes.js')), '');
    ok('§16c SOURCE PIN: …and it is read back NEWEST-WINS, which is why a rewound rebuild can never displace a stale copy — and why `!_rateLimitCache` re-seeds it once the copy is gone',
      /if \(!_rateLimitCache \|\| \(u\.fetchedAt > \(_rateLimitCache\.fetchedAt \|\| 0\)\)\) \{ _rateLimitCache = u; writeUsageCache\(\); \}/.test(read('src/usage-routes.js'))
      && /out\.fetchedAt = anchor\.fetchedAt;/.test(read('src/reading-repair.js')), '');
}

  {
    const ur = read('src/usage-routes.js');
    const body = ur.slice(ur.indexOf('async function refreshViaCliPanel'), ur.indexOf("app.post('/api/usage/refresh'"));
    const spawnBody = ur.slice(ur.indexOf('function spawnPanelProbe('), ur.indexOf('function setupUsage('));
    ok('§19 ⓪ the panel spawn sets CLAUDE_CONFIG_DIR to the account\'s isolated probe dir, derived from the ONE creds dir (never a second subDir lookup)',
      /const probeConfigDir = credsDir \? path\.join\(credsDir, '\.probe-config'\) : null;/.test(body) && /spawnPanelProbe\(bin, \{ root: probeConfigDir, env, setting: serverSetting \}/.test(body) && /if \(probeConfigDir\) env\.CLAUDE_CONFIG_DIR = probeConfigDir;/.test(spawnBody) && (body.match(/accounts\.subDir\(/g) || []).length === 1);
    // mirror-263 §19: the mint's second look made the spawn shared and each caller brought its own env + cwd — the isolation left the site
    const om = read('src/server/oat-mint.js');
    ok('§19 ⓪ …ONE spawn site owns the isolation: spawnPanelProbe derives the config dir AND the empty cwd from the root its caller proves; no caller sets CLAUDE_CONFIG_DIR or a cwd for it (the panel refresher and the token mint\'s probe rung pass a root)',
      /function spawnPanelProbe\(bin, \{ root, env: identityEnv, setting \}, done\)/.test(spawnBody)   // B-5279: + the usage-refresh row's reader (the fence) && /const probeCwd = probeCwdOf\(probeConfigDir\);/.test(spawnBody) && /fs\.mkdirSync\(probeCwd, /.test(spawnBody)
      && !/env\.CLAUDE_CONFIG_DIR/.test(body) && /probePanel\(\{ root: configOf\(m\.dir\), env: /.test(om) && !/probePanel\(\{[^\n]*cwd:/.test(om) && /spawnOnce\(\{ root, env \}/.test(om));
    ok('§19 ⓪ …the measurement that justifies it is recorded beside the code (the CLI version and which file each env var moves)', /2\.1\.274/.test(ur) && /CLAUDE_CONFIG_DIR \|\| \$HOME/.test(ur));
    ok('§19 ⓪ …and the identity gate runs BEFORE the write and returns false on a refusal', body.indexOf('if (idv.refused) {') > 0 && body.indexOf('if (idv.refused) {') < body.indexOf('usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key, obj: merged') && /if \(idv\.refused\) \{[\s\S]{0,1600}?return false;/.test(body));
  }
{
    ok('§19 ⑨ …and the standing repair runs HOURLY too (server.js; its anchors read off the loop first since B-1319), quiet unless it changed something', /setInterval\(\(\) => \{ (?:require\('\.\/src\/reading-repair\.js'\)\.prefetchAnchorRows\(path\.join\(__dirname, 'data', 'usage-anchors'\)\)\.then\(\(\) => accounts\.signinFactsSettled\(\)\.catch\(\(\) => \(\{\}\)\)\)\.then\(\(settled\) => \{ )?try \{ const rep = repairIdentityAnchors\('hourly', \{ since: settled && settled\.since \}\)/.test(read('server.js')) && /if \(why !== 'hourly' \|\| changed\)/.test(read('src/server/usage-pool-engine.js')));
}
{
  // the wiring pins: registered once, run at every boot after the one-shots, exported, routed
  ok('§20 the migration is registered append-only with a dated id and says out loud what it did',
    /id: '2026-09-repair-sidecars-by-api-phase'/.test(read('src/server/migrations.js')) && /\[migrate\] sidecars-by-api-phase:/.test(read('src/server/migrations.js')));
  ok('§20 …and the SAME repair runs at every boot, after the one-shot registry (server.js), through the engine\'s one entry point',
    (() => { const sv = read('server.js'); const i = sv.indexOf("const rep = repairIdentityAnchors('boot', { since: settled && settled.since }); usage.reloadRateLimitCache?.(rep);"); return i > 0 && i > sv.indexOf('.runLocalMigrations();'); })() && /repairIdentityAnchors, \/\/ B-855a c2/.test(read('src/server/usage-pool-engine.js')) && /repairSidecarsByApiPhase\(\{ dataDir: path\.join\(rootDir, 'data'\), accounts: list, id: 'identity-repair:' \+ why, ownIdsOf: usageIdentityAccountIds \}\)/.test(read('src/server/usage-pool-engine.js')));   // B-6a92 r8: the repair is handed the row's own identity group
  ok('§20 …the human-triggered route exists and hands the engine\'s entry point to setupUsage',
    /app\.post\('\/api\/usage\/repair-identity'/.test(read('src/usage-routes.js')) && /repairIdentityAnchors\('manual', \{ since: settled && settled\.since \}\)/.test(read('src/usage-routes.js')) && /settled = await accounts\.signinFactsNow\(null\)/.test(read('src/usage-routes.js')) && /establishedWindows, repairIdentityAnchors, probeUsageForAccountKey/.test(read('server.js')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
