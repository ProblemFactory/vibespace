#!/usr/bin/env node
// AN AGENT WATCHES A CHANNEL — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-channel-agent-watch.mjs (its behaviour legs and every mutant / browser CONTROL stay there): the route hands the body whole to the engine, the read-back route, the route + CLI wiring of watch / unwatch / list --all, the CLI's next-turn default (src/agent-routes.js, data/bin/vibespace-channels, src/channel-watch-spec.js),
// ⑧ (d) THE ONE WALKER census (src/server/channels-access.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-channel-agent-watch-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 500) : '')); } };
const J2s = (x) => JSON.stringify(x);
{ const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const wv = asrc.slice(asrc.indexOf('const watchVerb = async'), asrc.indexOf("app.post('/api/agent/channels/watch'"));
  ok(/eng\.agentWatch\(ctx, b\.target, b\)/.test(wv) && !/keywords|delivery:|dailyWakeCap/.test(wv.replace(/\/\/.*$/gm, '')), 'the route hands the body WHOLE to the engine\'s one grammar — no schema of its own in watchVerb');
  ok(/app\.get\('\/api\/agent\/channels\/watches'/.test(asrc) && /agentWatchesFor\(channelPrincipal\(s, id\)/.test(asrc), 'the read-back route answers the caller\'s own principal'); }
// ── wiring pins: the route + CLI spell the three verbs ──
{
  const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8');
  ok(/app\.post\('\/api\/agent\/channels\/watch', async \(req, res\) => \{ const t = await watchVerb\('watch', req, res\)/.test(asrc) && /app\.post\('\/api\/agent\/channels\/unwatch', async \(req, res\) => \{ const t = await watchVerb\('unwatch', req, res\)/.test(asrc) && /listFor\(channelPrincipal\(s, id\), \{ all: /.test(asrc), 'wiring: the agent routes for watch / unwatch / list --all');
  ok(/verb === 'watch' \|\| verb === 'unwatch'/.test(cli) && /\/api\/agent\/channels\/list' \+ \(all \? '\?all=1' : ''\)/.test(cli) && /\{ target, args: rest \}/.test(cli), 'wiring: the CLI spells watch / unwatch / list --all and hands the watch flags to the server raw (lane agent-watch-parity: the grammar is the server\'s)');
}
{ const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8'); ok(cli && require(path.join(REPO, 'src/channel-watch-spec.js')).watchSpecFromArgs([]).spec.delivery === 'next-turn' && require(path.join(REPO, 'src/channel-watch-spec.js')).watchSpecOfBody({}).spec.delivery === 'next-turn', 'wiring (verify r1 ⑤): the CLI\'s default mode is next-turn — an agent never chooses a billed wake for itself by default'); }

console.log('⑧ (d) THE ONE WALKER (a census of src/server/channels-access.js)');
// (d) THE ONE WALKER, a census: channels-access.js reads `held.convs` only through heldConvsOf — every other mention is the
// writer's (the request created with `convs: []`, holdAside's push) or releaseAside's count of what the walker skipped (r16: and
// its write that takes the entries it counted out — an unreadable entry is counted once per request)
{
  const lines10 = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8').split('\n');
  const ALLOWED10 = [/const all = r2 && r2\.held && Array\.isArray\(r2\.held\.convs\) \? r2\.held\.convs : \[\];/, /const entries = \(Array\.isArray\(h\.convs\) \? h\.convs\.length : 0\) - convs\.length;/, /if \(!was\) r2\.held\.convs\.push\(/, /if \(!only && entries > 0\) h\.convs = convs;/];
  const walks = lines10.map((l, i) => ({ l, i: i + 1 })).filter(({ l }) => /\.convs\b/.test(l) && !/^\s*(\*|\/\/|\/\*\*)/.test(l) && !/\b(?:plan|p0)\.convs\b/.test(l) && !ALLOWED10.some((re) => re.test(l)));
  ok(walks.length === 0 && ALLOWED10.every((re) => lines10.some((l) => re.test(l))), `(d) THE ONE WALKER: no line of channels-access.js reads a held request's conversations but heldConvsOf (the writer's push and the skipped count aside) — ${walks.length} other read(s) (8b46c196: 7 — heldCountOf, fileHeldCard, holdAside's find, releaseAside, Deliver's flush, the answer, heldWatched)`, J2s(walks.map((x) => `${x.i}: ${x.l.trim().slice(0, 100)}`)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
