#!/usr/bin/env node
// THE WHOLE-LEDGER LAW — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-ledger-whole-law.mjs (its behaviour legs and every mutant / browser CONTROL stay there): ① the pool engine's two money writers stand behind the whole-ledger gate (src/server/usage-pool-engine.js); ⑲ (13) / ⑳ (9) the
// standing item files with its own action.type as a notice, named in no answer list (src/server/hub-act-ask.js, src/lib/user-todos-row.js,
// src/lib/inbox-window-layout.js, src/lib/user-todos-actions.js, src/inbox-reply.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-ledger-whole-law-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); if (d !== undefined) console.error('    ' + JSON.stringify(d).slice(0, 700)); } };
console.log('① the wiring (source pin)');
{
  // the wiring: the engine's two money writers stand behind the gate
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const auto = eng.slice(eng.indexOf('function maybePoolAutoSwitchForPool('), eng.indexOf('function maybePoolAutoSwitchForPool(') + 600);
  ok(/function sweepUsageAnchors\(\) \{ return _wholeLedger\.run\(sweepUsageAnchorsNow\); \}/.test(eng) && /if \(_wholeLedger\.holds\(\)\) return;/.test(auto) && /wholeLedgerGate\(\{\s*ledger: usageHistory/.test(eng), '① the wiring: the pool engine\'s sweep goes through the gate, its automatic decision returns while it holds');
}


console.log('⑲ (13) the standing item is not a decision row (source pin)');
  // ── 13. THE STANDING ITEM IS NOT A DECISION ROW — its own action.type (the cards stay hub-act-ask) ──
  {
    const HA = require(REPO + '/src/server/hub-act-ask.js');
    ok(HA.STANDING_TYPE === 'hub-act-standing' && HA.ACTION_TYPE === 'hub-act-ask' && /type: STANDING_TYPE, askId: st\.askId/.test(fs.readFileSync(REPO + '/src/server/hub-act-ask.js', 'utf8')),
      `⑲ (13) a background subject's standing item files with its OWN action.type (${HA.STANDING_TYPE || 'hub-act-ask, like a card'}) — never a decision row (9a0d429d: hub-act-ask, which lane wake-approve-card's registry makes a decision row: its no-longer-asked close and the owner's reopen refused)`);
  }

console.log('⑳ (9) the standing item is a notice (source pins)');
  // ── 9. THE STANDING ITEM IS A NOTICE — filed `kind: 'notice'`, its type in no answer list (rendered: test-user-todos-layout) ──
  {
    const HA = require(REPO + '/src/server/hub-act-ask.js'), src = fs.readFileSync(REPO + '/src/server/hub-act-ask.js', 'utf8');
    const row = fs.readFileSync(REPO + '/src/lib/user-todos-row.js', 'utf8'), lay = fs.readFileSync(REPO + '/src/lib/inbox-window-layout.js', 'utf8'), act = fs.readFileSync(REPO + '/src/lib/user-todos-actions.js', 'utf8'), rep = require(REPO + '/src/inbox-reply.js');
    const filed = /kind: 'notice', by: 'agent', sessionName: 'Machines',[^\n]*\n\s*action: \{ type: STANDING_TYPE/.test(src);
    const answered = [row, lay, act].filter((s) => s.includes(`'${HA.STANDING_TYPE}'`)).length + ((rep.ANSWER_ACTION_TYPES || []).includes(HA.STANDING_TYPE) ? 1 : 0);
    ok(HA.STANDING_TYPE === 'hub-act-standing' && filed && answered === 0,
      `⑳ (9) the standing item files as a notice (${filed ? 'kind notice' : 'kind action'}) and ${answered} answer list(s) name its type — no Allow once / Always / Deny drawn (3c4fa614: kind action, 4 answer lists — rendered with the 60 s card's three answers)`, { filed, answered });
  }

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
