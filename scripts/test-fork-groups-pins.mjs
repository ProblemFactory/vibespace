#!/usr/bin/env node
// A FORK JOINS ITS SOURCE'S GROUPS — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-fork-groups.mjs, whose PURE plan, the DRIVEN real methods (lifted from the source and
// run), the mutant copies and the browser legs stay there: ④ the wiring + the census over src/lib (one fork create, the
// _doForkSession callers, the created handler, ws-create's group, the PURE module imported by both consumers, the store's
// notify). Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-fork-groups-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => { if (typeof name !== 'string') throw new TypeError(`ok(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`);
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const FG_PATH = path.join(REPO, 'src/lib/fork-groups.js');

const lifeSrc = rd('src/lib/session-lifecycle.js');
const tasksSrc = rd('src/lib/sidebar-tasks.js');

console.log('④ WIRING + census');
{
  ok(/if \(mode !== 'chat'\) \{ this\._doForkSession\(sessionInfo, ''\); return; \}/.test(lifeSrc), 'terminal-mode forkSession goes through _doForkSession');
  ok(/forkFromMessage\(sessionInfo, messageUuid\) \{\s*this\._openForkDialog\(/.test(lifeSrc) && /this\._doForkSession\(info, text, at, customName\)/.test(rd('src/lib/app.js')),
    'fork-at-message and the Fork dialog\'s send button both land in _doForkSession');
  const libDir = path.join(REPO, 'src/lib');
  const forkCreates = [], doForkCallers = [];
  for (const f of fs.readdirSync(libDir).filter((n) => n.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(libDir, f), 'utf8');
    // every createSession({...}) object literal that names a `fork` key
    for (const m of s.matchAll(/createSession\(\{/g)) {
      let depth = 0, end = -1;
      for (let k = m.index + 'createSession('.length; k < s.length; k++) {
        if (s[k] === '{') depth++;
        else if (s[k] === '}' && --depth === 0) { end = k; break; }
      }
      const obj = s.slice(m.index, end + 1);
      if (/\bfork\s*:/.test(obj)) forkCreates.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
    for (const m of s.matchAll(/_doForkSession\(/g)) doForkCallers.push(f);
  }
  ok(forkCreates.length === 1 && forkCreates[0].startsWith('session-lifecycle.js:') && lifeSrc.slice(0, lifeSrc.indexOf('async _doForkSession(')).split('\n').length < Number(forkCreates[0].split(':')[1]), 'CENSUS: exactly ONE client createSession({…}) names a `fork` key (the one in _doForkSession) — a second fork path would bypass the plan', forkCreates.join(' '));
  ok(doForkCallers.every((f) => f === 'session-lifecycle.js' || f === 'app.js') && doForkCallers.length >= 3, 'CENSUS: _doForkSession is called only from session-lifecycle.js / app.js', doForkCallers.join(' '));
  ok(/const bindIds = \[\.\.\.new Set\(\[taskId, \.\.\.\(Array\.isArray\(taskIds\) \? taskIds : \[\]\), \.\.\.\(extraTaskBinds \|\| \[\]\)\]\.filter\(Boolean\)\)\];/.test(lifeSrc)
    && /this\.sidebar\?\._registerPendingTaskBind\?\.\(msg\.sessionId, bindIds, \{ notId: fork \? \(backendSessionId \|\| resumeId \|\| null\) : null \}\);/.test(lifeSrc),
    'the `created` handler registers taskId + the New Session form\'s taskIds (lane new-session-form) + extraTaskBinds, guarded by the fork source id');
  ok(/fork: fork\|\|undefined, cols:120, rows:30, reqId,\n\s+taskId: taskId \|\| \(Array\.isArray\(taskIds\) && taskIds\[0\]\) \|\| undefined,/.test(lifeSrc)
    && /const spawnGroups = spawnGroupIds\(data\);/.test(rd('src/ws-create.js')) && /_initialGroupId: spawnGroups\[0\] \|\| null,/.test(rd('src/ws-create.js'))
    && /const TASK_ID_RE = \/\^T-\[\\w-\]\{1,60\}\$\/;/.test(rd('src/new-session-spec.js')),
    'the ws create message carries `taskId` (+ the form\'s `taskIds`) and ws-create turns it into `_initialGroupId` — the same id shape, judged in src/new-session-spec.js (the task context from the first turn — no spawn ENV carries it)');
  ok(!/VIBESPACE_TASK_ID/.test(fs.readFileSync(FG_PATH, 'utf8').replace(/VIBESPACE_TASK_ID[\s/]+has had no producer/, '')) && !/spawns VIBESPACE_TASK_ID/.test(lifeSrc),
    'no text claims a VIBESPACE_TASK_ID spawn env (its producer left in the Task refactor P2)');
  ok(/import \{ mergePendingBind, pendingBindVerdict, sweepPendingBinds \} from '\.\/fork-groups\.js';/.test(tasksSrc)
    && /import \{ forkGroupPlan \} from '\.\/fork-groups\.js';/.test(lifeSrc), 'both consumers import the ONE pure module');
  ok(!/^import|require\(/m.test(fs.readFileSync(FG_PATH, 'utf8')), 'fork-groups.js imports nothing (PURE)');
  ok(/if \(!t\.sessions\.includes\(key\)\) \{[\s\S]{0,120}this\._notify\(id\);/.test(rd('src/task-groups.js')),   // lane task-group-fanout: it names the group (the delta's)
    'multi-client: a bind goes through the store\'s bind(), which notifies (tasks-updated broadcast) — nothing new needed');
}

console.log(`\ntest-fork-groups-pins: ${pass} passed, ${fail} failed`);

process.exit(fail ? 1 : 0);
