#!/usr/bin/env node
// test-vault-run-model-gh — THE HEAVY TWIN of test-vault-run-model's ⑤c (主开发 r2048, lane bl-release, 2026-11-22): the gh grammar
// census against the INSTALLED gh — the whole live tree's help parsed in parallel, the pinned version, the binary's sha256, every
// allowlisted verb's help hash, the live envHijack derivation (`gh help environment`) — about 250 help / topic / version calls of a
// REAL program, so it is a binary leg and lives here; the fast suite keeps every version-independent leg (⑤d: the parse, entryOf,
// envHijackDrift, allowHashDrift on fixtures). gh runs with a SCRATCH HOME and a MINIMAL environment (set through the generator's
// setGhEnv): it reads no person's configuration — no hosts file, no token, no alias — only its own help, topics and version.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';   // FIRST after node's own (§113)
import { checker } from './lib/check.mjs';
import * as GHG from './gen-gh-grammar.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const V = require(path.join(REPO, 'src/vault-run.js'));

console.log('THE ENV gh RUNS IN: a scratch HOME, nothing of a person');
const HOME = scratchDir('vrm-gh-home');
fs.mkdirSync(path.join(HOME, '.config', 'gh'), { recursive: true });
const GH_ENV = GHG.scratchGhEnv(HOME);   // the generator's ONE builder (its CLI's re-pin reads gh alike)
GHG.setGhEnv(GH_ENV);
{
  const ALLOWED = 'GH_CONFIG_DIR GH_NO_UPDATE_NOTIFIER GH_PROMPT_DISABLED HOME LANG NO_COLOR PATH XDG_CONFIG_HOME';
  ok(Object.keys(GH_ENV).sort().join(' ') === ALLOWED, `gh's env is these eight names and nothing else (${Object.keys(GH_ENV).sort().join(' ')})`);
  ok(GH_ENV.HOME === HOME && HOME !== process.env.HOME && [GH_ENV.XDG_CONFIG_HOME, GH_ENV.GH_CONFIG_DIR].every((d) => d.startsWith(GH_ENV.HOME + path.sep)) && fs.readdirSync(GH_ENV.GH_CONFIG_DIR).length === 0,
    'its HOME is this run\'s own scratch folder (not even the suite\'s HOME), its config folders inside it and empty: no hosts file, no token, no alias');
  // WHAT gh RECEIVES, not the literal: a stand-in gh that prints its own environment, reached through the generator's spawn helpers
  const stub = scratchDir('vrm-gh-stub');
  fs.writeFileSync(path.join(stub, 'gh'), '#!/bin/sh\nenv\n', { mode: 0o755 });
  const seen = (env) => { GHG.setGhEnv(env); const out = GHG.ghHelp([]) || ''; return out.split('\n').map((l) => l.split('=')[0]).filter(Boolean).sort(); };
  const got = seen({ ...GH_ENV, PATH: `${stub}:${GH_ENV.PATH}` });
  const extra = got.filter((k) => !ALLOWED.split(' ').includes(k) && k !== 'PWD' && k !== 'SHLVL' && k !== '_' && k !== 'OLDPWD');
  ok(got.includes('HOME') && got.includes('GH_CONFIG_DIR') && extra.length === 0 && !got.some((k) => /TOKEN|^GH_HOST$/.test(k)),
    `the spawned gh RECEIVES the eight names and nothing of the caller (the shell adds only PWD / SHLVL / _): ${extra.join(' ') || 'nothing else'}`);
  const leak = seen(null);   // RED CONTROL: the generator with no env set hands gh the caller's whole environment
  ok(leak.filter((k) => !ALLOWED.split(' ').includes(k)).length > 3, `RED CONTROL: with no env set the same stand-in receives the caller's names (${leak.length} names) — the leg above is a measurement`);
  GHG.setGhEnv(GH_ENV);
}

console.log('⑤c THE gh GRAMMAR CENSUS (round 5/6/7/8) — the shipped gh grammar (host-reaching + {default:1} POSITIVE-PROOF default-host-only entries) + its pinned version + envHijack must EQUAL the live gh, re-parsed over the WHOLE live tree IN PARALLEL (a census fails a drift). ROUND 7: the version pin is a HARD GATE — a live gh ≠ the pinned version is a named skip off-gate (a machine whose gh is not the pinned one) and RED on CI; EXTENSION COMMANDS are excluded from the walk (never exec a third-party binary in a test). ROUND 8: the census ALSO diffs envHijack live-vs-shipped. ROUND 9 (MAJOR 2): the shipped grammar IS the REVIEWED ALLOWLIST (every other verb ABSENT \u21d2 BLIND), and every allowlisted verb\'s live help-text HASH must equal its pinned review sha \u2014 a reworded help is RED by name (re-review it, then node scripts/gen-gh-grammar.mjs --repin --reason "<why>"). ROUND 10: each verb grammar entry ALSO carries its GENERATED launch set (--web/--editor flags), diffed with the rest of the table');
await (async () => {
  const gh = V.knownToolOf('gh'), shipped = gh.grammar || {}, pinned = gh.grammarVersion || null;
  const canon = (t) => Object.keys(t).sort().map((k) => k + '=' + JSON.stringify(t[k])).join('\n');
  if (GHG.ghHelp([]) == null) {                                   // gh not runnable here
    if (process.env.CI || process.env.GITHUB_ACTIONS) ok(false, 'gh grammar census REQUIRED on the gate (the runner ships gh) but gh is not runnable — the pin cannot be silently skipped');   // a SKIP on the gate is RED
    else console.log(`  · SKIP gh grammar census: gh not runnable here — install gh ${pinned} to re-parse the grammar`);
  } else {
    const live = GHG.ghVersion();
    if (live !== pinned) {   // round 7 (BLOCKER 1): a version mismatch is a named skip off-gate (a machine whose gh is not the pinned one), RED on the gate — a diff against a DIFFERENT gh is meaningless (a flag whose meaning moved IS the risk), so the whole census yields to ONE skip, not a hard assert
      if (process.env.CI || process.env.GITHUB_ACTIONS) { ok(false, `gh grammar census REQUIRED on the gate at the pinned gh ${pinned}, but the live gh is ${live} — the runner must ship the pinned gh, or re-pin for the runner's gh with \`node scripts/gen-gh-grammar.mjs --repin --reason "<why>"\` (version + the 32 help hashes), then --write if a reviewed shape changed`, { pinned, live }); return; }
      console.log(`  · SKIP gh grammar census: live gh ${live} ≠ pinned ${pinned} — install gh ${pinned} to re-parse the grammar`); return;
    }
    const { table, unreadable, shas } = await GHG.buildGrammarParallel();                            // the WHOLE live tree, concurrently (~0.9 s): the SAME parse as the serial generator, so no spurious drift; shas = the live help-text sha of every EMITTED (allowlisted) verb
    const shippedKeys = new Set(Object.keys(shipped)), liveKeys = new Set(Object.keys(table));
    const added = [...liveKeys].filter((k) => !shippedKeys.has(k));                                  // an allowlisted verb the live gh reaches that the literal lacks ⇒ RED by name
    const removed = [...shippedKeys].filter((k) => !liveKeys.has(k));                                // a shipped verb the live gh no longer reaches (or whose --help failed, or that left the allowlist)
    const changed = [...liveKeys].filter((k) => shippedKeys.has(k) && JSON.stringify(table[k]) !== JSON.stringify(shipped[k]));   // a value flag / repository TYPE / spec / host drift
    const helpFailed = unreadable.filter((u) => shippedKeys.has(u));                                 // a shipped verb's --help failed ⇒ ✗ by name, never a silent continue
    const drift = added.length || removed.length || changed.length || helpFailed.length;
    ok(!drift && canon(table) === canon(shipped), `the shipped gh grammar equals the live gh over the WHOLE tree (${Object.keys(shipped).length} reviewed-allowlist verbs @ gh ${pinned}) — no drift`, drift ? { added, removed, changed, helpFailed } : undefined);
    // round 9 (MAJOR 2): every allowlisted verb's live help-text sha must EQUAL its pinned ALLOWLIST sha — a reworded help (re-review the verb) or a version-pin move is RED BY NAME. The ok:own roster is pinned to the help a human reviewed, never re-derived from prose
    const hashDrift = GHG.allowHashDrift(shas);
    ok(GHG.toolSha256Of(GHG.ghBinPath()) === gh.toolSha256, `round 12/15: the row's toolSha256 EQUALS the lane's bundled gh ${pinned} sha256 — a FIXTURE/release invariant (test-vault-run's digestVouch + the WIRE leg read it); the door no longer GATES on it (round 15: a sealed gh of any version RUNS, drift-recorded) — re-pin a version roll with --repin`, { pin: gh.toolSha256, bin: GHG.ghBinPath() });
    ok(hashDrift.length === 0, `every allowlisted verb's live help equals its pinned review hash (${GHG.ALLOWLIST.length} verbs @ gh ${pinned}) — no help drift; on a drift: re-review the named verb(s), then \`node scripts/gen-gh-grammar.mjs --repin --reason "<why>"\``, hashDrift.length ? hashDrift : undefined);
    // round 8 (MAJOR 3) / round 9 (MINOR 3): the census pins envHijack through the SAME compare a stale-literal test drives (envHijackDrift) — a stale list (a dropped GH_BROWSER, a missing GH_PATH after gh grew it) is RED by name, not a silent drift the headers only CLAIMED
    const liveHijack = GHG.envHijack(), shippedHijack = gh.envHijack || [];
    const hijackDrift = GHG.envHijackDrift(liveHijack, shippedHijack);
    ok(liveHijack != null && !hijackDrift, `the shipped envHijack (${shippedHijack.length} program-naming env vars) equals the live \`gh help environment\` derivation @ gh ${pinned} — no drift`, hijackDrift || undefined);
    console.log(`  · the gh grammar census: ${Object.keys(shipped).length} verbs + ${shippedHijack.length} env @ gh ${pinned}`);
  }
})();

report();
