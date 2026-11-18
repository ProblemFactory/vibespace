#!/usr/bin/env node
// THE CHANNELS ENGINE's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-channels-engine.mjs
// (its engine / drain / route legs and every patched-copy CONTROL stay there): the messages route forwards `beforeId`
// (src/routes/channels.js), the thread pane never marks a REFUSED older page exhausted (src/lib/channel-thread-pane.js), and the
// engine, the channels routes and the OAuth loopback quote no vendor (src/server/channels-engine.js + its family files through
// scripts/channels-engine-src.mjs, src/routes/channels.js, src/oauth-loopback.js). Each reads the file BY NAME, so ci.mjs's affected
// rule selects this suite on a change of one of them.
// Run: node scripts/test-channels-engine-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { engineSource } from './channels-engine-src.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

console.log('— the messages route, the thread pane, the vendor-neutral engine (source pins + census)');
{
  // The messages route forwards BOTH halves of the page boundary.
  const msrc = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/beforeId/.test(msrc) && /messages\(req\.params\.adapterId, req\.params\.convId, \{ before, beforeId, limit \}\)/.test(msrc),
    'the messages route forwards `beforeId` — dropping it would put the paging loss straight back');
}
{
  // the pane's half (client): a REFUSED older page never marks the thread exhausted, and the "beyond reach" words
  const paneSrc = fs.readFileSync(path.join(REPO, 'src/lib/channel-thread-pane.js'), 'utf-8');
  ok(/if \(prepend && \(r\.exhausted \|\| r\.vendorHasNoOlder\) && !\(r\.records \|\| \[\]\)\.length && !r\.refused\) \{/.test(paneSrc) && /r\.olderBeyondReach && !list\.querySelector\('\.chanthread-beyond'\)/.test(paneSrc), 'wiring pin: the pane marks the thread exhausted only on an answer that was not refused, and draws the "beyond reach" words once');
}
{
const engSrcC = engineSource(REPO);
const routeSrcC = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  const code = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const quoted = (s) => (code(s).match(/['"`](lark|slack|gmail|fake)['"`]/g) || []).length;
  ok(quoted(engSrcC) === 0 && quoted(routeSrcC) === 0 && quoted(fs.readFileSync(path.join(REPO, 'src/oauth-loopback.js'), 'utf-8')) === 0
    && !/SlackManifest|SlackWords|slackConsent|slackRelayUrl|LARK_CALLBACK_URL/.test(engSrcC + routeSrcC), 'consent: the engine, the channels routes and oauth-loopback quote no vendor id and name no vendor\'s consent module');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
