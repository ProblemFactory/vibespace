#!/usr/bin/env node
// THE CHANNEL STORE's SOURCE PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-channel-store.mjs
// (its store legs over a scratch data dir and every patched-copy CONTROL stay there): ⑨ the tier + hygiene pins of src/channel-store.js
// (its requires, no whole-index writer, the sealing looping writer, the dropped dedup on a throw, no NUL byte, writeJsonAtomic), the
// route-error words (src/lib/channel-words.js) and the no-once-only-flag pin. Each reads the file BY NAME, so ci.mjs's affected rule
// selects this suite on a change of one of them.
// Run: node scripts/test-channel-store-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

// ── ⑨ tier + hygiene pins ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  // A CENSUS READS CODE: this file's own header names the export it refuses
  // to have, so prose is blanked before asking whether one survives.
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const reqs = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(reqs.every((r) => ['fs', 'path', 'crypto', './channel-record.js', './channel-reactions.js', './channel-thread.js', './channel-facts.js', './channel-revisions.js', './timed-sync.js', './store-writer.js', './fd-close.js', './store-read.js', './store-hold.js', './store-read-hold.js'].includes(r)), 'the store is SHARED (B-f276 family r3188: and the store-read law\'s helper, the people memos\' holds): node builtins only — fs, path, and crypto for the attachment cache\'s file names (2026-09-26) — plus, since lane channel-threads, the PURE modules the side log\'s dedup key and compaction fold are theirs, and (lane lark-threads) the place patch\'s widen-only rules, and (lane message-facts) the fx lines\' compaction fold, and (lane channel-record-revisions) the rv lines\' (SHARED may import PURE); the SHARED store writer (lane hub-loop-stalls: the index\'s write off the main thread) — and (lane lg-store-writes, B-15ac) the SHARED close of a written file, src/fd-close.js (builtins only: fs)', reqs.join(','));
  ok(!/module\.exports[\s\S]*writeIndex|exports\.writeIndex/.test(src), 'there is deliberately NO "write the whole index back" export — the serialized owner is the index\'s only writer (§5.1), and (design 011 lane 1, store-timing) the PURE store-write clock around the index read and write');
  ok(!/writeAdapters/.test(noComments), '…and none for adapters.json either (r2): every caller used to re-parse and write its own private copy back, which is the read-modify-write lost update this invariant exists to eliminate');
  ok(/appendLines\(fp[\s\S]{0,300}?for \(const r of fresh\) rememberVendorId/.test(src) && !/if \(set\.has\(r\.vendorId\)[\s\S]{0,120}?rememberVendorId/.test(src), 'the dedup set is written AFTER the bytes are durable, never inside the selection loop');
  ok(!/appendFileSync\(fp/.test(noComments) && /function writeAll\(fd, str\)[\s\S]{0,200}?while \(off < buf\.length\) off \+= fs\.writeSync/.test(src),
    'the message log is written through the sealing, LOOPING writer (r3) — `appendFileSync` throws after a partial chunk and `fs.writeSync` does not retry a short write');
  ok(/try \{\s*healed = appendLines\(fp[\s\S]{0,200}?\} catch \(e\) \{[\s\S]{0,160}?dedup\.delete\(`\$\{adapterId\}\/\$\{convId\}`\);[\s\S]{0,120}?throw e;/.test(src),
    'a throw from INSIDE the write DROPS the cached dedup set before it propagates (r4) — a prefix may be durable and only the log knows which records; the set is rebuilt from the bytes on the retry');
  ok(!fs.readFileSync(path.join(REPO, 'src/channel-store.js')).includes(0), 'no raw NUL byte (it would hide the module from grep, file(1) and every source census)');
  ok(/writeJsonAtomic/.test(src) && !/fs\.writeFileSync\(indexFile/.test(src), 'the index goes through writeJsonAtomic (tmp+rename) — a bare writeFileSync is silent data loss on the exact crash this product exists to survive');
}

console.log('— the store-blocked words and the refused flush (source pins)');
{
    const W = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
    ok((W.match(/case 'store-blocked'/g) || []).length === 2, 'PIN: both route-error worders (channels + groups) say store-blocked in words');
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');
  ok(!/_said/.test(src), 'PIN: no once-only flag silences a refused index flush after its first line');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
