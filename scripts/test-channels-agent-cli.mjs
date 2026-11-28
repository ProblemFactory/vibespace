#!/usr/bin/env node
// THE AGENT CLI (docs/design-communication-panel.zh.md §11; gate row
// `test-channels-agent-cli`, fast): data/bin/vibespace-channels driven against
// a STUB server on a free port — list / read / reply / status / request —
// with the assertions §17 names: `reply` ONLY proposes (the stub sees one
// POST to /reply and nothing that sends), an INVISIBLE conversation and a
// NONEXISTENT one print the SAME uniform error, and `send-not-available` is
// said with its code and creates nothing. The stub's not-found text is the
// engine's own constant (src/channel-acl.js), so the CLI's words are pinned to
// the product's.
// B-7e49 (lane lg-recovery, 主开发 r2184): every leg that runs the CLI as a child — the stub and the verbs, ⑳–㉔ — MOVED VERBATIM
// to the heavy twin scripts/test-channels-agent-cli-verbs.mjs (a leg that starts a real child is heavy). This file keeps the
// TABLE: the CLI's presence, the refused-set census, and §T — the twin holds the moved sections and serves THIS file's
// refusal fixtures byte for byte, and it is a heavy row.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const CLI = path.join(REPO, 'data/bin/vibespace-channels');
ok(gateOf(fs.existsSync(CLI)) && (fs.statSync(CLI).mode & 0o111) !== 0, 'data/bin/vibespace-channels exists and is executable');
ok(verdictOf(require(path.join(REPO, 'src/hosts.js')).HostManager.AGENT_TOOLS.includes('vibespace-channels')), 'it is in HostManager.AGENT_TOOLS (ships to remote hosts with the other tools)');
ok(gateOf(fs.existsSync(path.join(REPO, 'docs/agent/channels-manual.md'))) && require(path.join(REPO, 'src/agent-routes.js')).AGENT_DOC_TOPICS.channels === 'channels-manual.md', 'the manual exists and the docs route knows the topic');

// ── r7: THE REFUSED-SET CENSUS ────────────────────────────────────────────
// The CLI's `refresh` treats a closed set of codes as a REFUSAL (exit 4, "not
// refreshed: <the engine's sentence> (retry in N s)") and everything else as
// an error (exit 1). r6 found `account-changed` (409) and `stopped` (503)
// missing from it — an agent read "error" for "retry in a moment". The set is
// DERIVED here from the agent route's own STATUS table (src/agent-routes.js
// `chanAnswer`): every code it answers with a retry-able status (429 / 409 /
// 503) that the refresh path can produce must be in the CLI's list, and
// nothing else may be — a code in one and not the other is red. The two
// retry-able codes that belong to the REPLY verb alone (`send-not-available`,
// `rate-floor`) are named as the exception and each is PROVEN reply-only:
// the engine's request-set region never spells it, the reply path does.
const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
const chanAnswerSrc = asrc.slice(asrc.indexOf('const chanAnswer = (res, r) => {'), asrc.indexOf('};', asrc.indexOf('const chanAnswer = (res, r) => {')));
const statusExpr = /const status = ([^;]+);/.exec(chanAnswerSrc);
const ROUTE_STATUS = new Map();   // code → status
if (statusExpr) for (const part of statusExpr[1].split(' : ')) { const m = /^(.*)\?\s*(\d{3})\s*$/.exec(part.trim()); if (!m) continue; for (const c of m[1].matchAll(/code === '([^']+)'/g)) ROUTE_STATUS.set(c[1], Number(m[2])); }
const RETRYABLE = new Set([429, 409, 503]);
// R4 (B-6acc): `compose-not-available` belongs to the COMPOSE verb alone, the same way;
// 2026-09-27: `not-withdrawable` belongs to WITHDRAW (and reply/compose --replaces) alone
const REPLY_ONLY = ['send-not-available', 'rate-floor', 'compose-not-available', 'not-withdrawable', 'rest-not-sent', 'rest-already', 'rest-nothing-left', 'rest-files-gone'];   // lane bl-msg B-da74: «Send the rest» refusals — a proposal's, never a refresh's
// lane held-except-doors r2: a grant row's refusals by the ONE writer (409 by name — they were a 500) belong to the WATCH verb
// alone (an agent's own watch / unwatch writes the grain's watch row) — proven like the reply ones: the request-set region
// never spells them
const GRANT_ONLY = ['except_conflicts', 'except_unnamed'];
const routeRetryable = [...ROUTE_STATUS].filter(([, st]) => RETRYABLE.has(st)).map(([c]) => c);
const expectedRefused = routeRetryable.filter((c) => !REPLY_ONLY.includes(c) && !GRANT_ONLY.includes(c)).sort();
const cliSrc = fs.readFileSync(CLI, 'utf-8');
const cliSetM = /const REFRESH_REFUSED = \[([^\]]*)\]/.exec(cliSrc);
const cliRefused = cliSetM ? [...cliSetM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : [];
ok(ROUTE_STATUS.size >= 8 && routeRetryable.length >= 7, `CENSUS setup: the agent route's STATUS table parsed — ${ROUTE_STATUS.size} codes, ${routeRetryable.length} retry-able (429/409/503): ${routeRetryable.join(', ')}`);
const esrc = engineSource(REPO);
const requestSetRegion = esrc.slice(esrc.indexOf('async function pass(adapterId'), esrc.indexOf('async function watch(adapterId'));
ok(gateOf(REPLY_ONLY.every((c) => !requestSetRegion.includes(`'${c}'`))) && verdictOf(REPLY_ONLY.every((c) => asrc.includes(`'${c}'`) || esrc.includes(`'${c}'`))), `CENSUS: the retry-able codes excepted as reply / compose only (${REPLY_ONLY.join(', ')}) are never spelled in the engine's pass / request-set region and are spelled by the reply path`);
ok(verdictOf(GRANT_ONLY.every((c) => !requestSetRegion.includes(`'${c}'`) && ROUTE_STATUS.get(c) === 409)), `CENSUS: the grant row's refusals (${GRANT_ONLY.join(', ')}) are 409 on the agent route and never spelled in the engine's pass / request-set region (the watch verb's alone — lane held-except-doors r2)`, GRANT_ONLY.map((c) => `${c}:${ROUTE_STATUS.get(c)}`).join(' '));
ok(cliRefused.length > 0 && JSON.stringify(cliRefused) === JSON.stringify(expectedRefused), `CENSUS: the CLI's REFRESH_REFUSED set == the route's retry-able refresh codes — [${cliRefused.join(', ')}]`, `cli [${cliRefused.join(', ')}] vs route [${expectedRefused.join(', ')}]`);
const words = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
ok(verdictOf(cliRefused.every((c) => words.includes(`case '${c}'`))), 'CENSUS: every refused code has its own words in channel-words.js (the panel says it in the device\'s language)', cliRefused.filter((c) => !words.includes(`case '${c}'`)).join(', '));
// one fixture per refused code: the route's status, the engine's own sentence (verbatim from the engine's refusal builders / the route), the wait where the engine gives one
const REFUSAL_FIXTURES = {
  'refresh-floor': { error: 'this conversation was refreshed 8 s ago (floor 20 s) — read it now, or refresh again in 12 s', retryAfterSec: 12 },
  'refresh-queue-full': { error: '180 refreshes of Ops mail are already waiting — read what is there now, or try again in a moment', retryAfterSec: 1 },
  'vendor-budget': { error: 'this account\'s vendor budget for this minute (60 requests/min) is spent — try again in 23 s', retryAfterSec: 23 },
  'backoff': { error: 'the vendor refused this account\'s last fetch (rate-limited) — it is retried in 27 s; read what is there now', retryAfterSec: 27 },
  'account-changed': { error: 'the account changed while the refresh waited (removed) — refresh again', retryAfterSec: 0 },
  'stopped': { error: 'the channels engine is stopping — refresh again after the restart', retryAfterSec: 0 },
  'store-blocked': { error: 'the channels are paused: the list of conversations (index.json) could not be read — nothing is fetched or sent until it reads again and VibeSpace is restarted (it is loaded at the next start)', retryAfterSec: 0 },   // B-f276 1b
};
for (const c of Object.keys(REFUSAL_FIXTURES)) REFUSAL_FIXTURES[c].status = ROUTE_STATUS.get(c) || 500;
ok(JSON.stringify(Object.keys(REFUSAL_FIXTURES).sort()) === JSON.stringify(expectedRefused), 'CENSUS: one fixture per refused code — a code added to the route without a fixture here is red', Object.keys(REFUSAL_FIXTURES).sort().join(', '));
// ── §T THE TWIN HOLDS THE VERBS (B-7e49: a leg cannot fall between the two files) ───────────────────────────────────────────
{
  const twinRel = 'scripts/test-channels-agent-cli-verbs.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ['// ── the verbs ─', '// ── 2026-09-26: the agent', '// ── 2026-09-27: WITHDRAW and --replaces ──', '// ── lane channel-threads (spec §5)', '// ── lane channel-attach-read (B-d6b9)', '// ── ⑳ design 008 S6 (lane channels-followups)', '// ── ㉑ lane channels-proposals-recall', '// ── ㉒ lane channels-search-says-hidden', '㉓ lane judged-watch-state (B-f42e)', '// ── ㉔ lane channel-reauth-visible'];
  ok(gateOf(MOVED.every((h) => twin.includes(h))) && gateOf(MOVED.every((h) => here.split(h).length === 2)) && !/http\.createServer\(|execFile\(|await run\(/.test(here),
    `§T the heavy twin holds the ${MOVED.length} sections that run the CLI as a child (the verbs … ㉔), and this file runs none of them`);
  const fixturesOf = (t) => { const a = t.indexOf('const REFUSAL_FIXTURES = {'); const b = a < 0 ? -1 : t.indexOf('\n', t.indexOf('REFUSAL_FIXTURES[c].status = ', a)); return a >= 0 && b > a ? t.slice(a, b) : null; };
  ok(fixturesOf(here) !== null && fixturesOf(here) === fixturesOf(twin), '§T the twin serves THIS file\'s refusal fixtures, byte for byte (the ones the census above judged)');
  const ci = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  ok(verdictOf(/\{ name: 'test-channels-agent-cli-verbs', tier: 'heavy',/.test(ci)), '§T the twin is a HEAVY row of the tier');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
