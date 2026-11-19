#!/usr/bin/env node
// OPENCODE ON A REMOTE MACHINE — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-opencode-remote.mjs, whose op table / result shapes / the shipped script against a mock
// serve / the settlement decision stay there (the table-against-script and bundle legs too — module values, a built bundle): the
// script's unknown-op refusal, the device rung's three-touch pins, the shared serve record, resource discipline on someone else's
// machine. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-opencode-remote-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0; const fails = [];
const ok = (name, cond, detail) => { if (typeof name !== 'string') throw new TypeError(`ok(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fails.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); } };

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const SCRIPT = read('data/bin/vibespace-opencode-op');

console.log('\n— THE OP TABLE IS ONE DEFINITION —');
{
  ok("the ssh script refuses an unknown op the same way", /unknown opencode op/.test(SCRIPT) && /known:/.test(SCRIPT));

}

console.log('\n— THE DEVICE RUNG (three-touch rule) —');
{
  const agentd = read('src/agentd/agentd.js');
  const client = read('src/agentd/client.js');
  ok('the daemon handles the op and runs THE SHARED runOpencodeOp (not a re-implementation)', /msg\.op === 'opencode-serve'/.test(agentd) && /runOpencodeOp/.test(agentd) && /require\('\.\/\.\.\/opencode-serve\.js'\)/.test(agentd));
  ok('the reply carries `op` (an op-less reply times out — the 2.300.0 rule)', /op: 'opencode-serve-result'/.test(agentd));
  ok('…and the client ROUTES that op in its id-keyed set', /m\.op === 'opencode-serve-result'/.test(client));
  ok('the capability is advertised in the hello-ack', /capabilities: \[[^\]]*'opencode-serve'[^\]]*\]/.test(agentd)); // by content, never the list's tail (test-architecture §56)
  ok('the client GATES on the capability (an old daemon is never asked — unknown ops HANG)', /capabilities\?\.includes\?\.\('opencode-serve'\)/.test(client));
  // ONE PER PROCESS, and the shape of the mistake matters: inside a Mux
  // control handler `this` is the CONNECTION, so a `this._ocFacts` cache is
  // rebuilt on every reconnect and each install() arms another live lane
  // (SSE + fs.watch) while the old one keeps running — a silent unbounded
  // leak on a dial device that reconnects on every link blip.
  ok('the daemon keeps ONE facts singleton PER PROCESS (never on `this` — that is the connection)', (() => {
    const decl = agentd.indexOf('let ocFacts = null;');
    return decl > 0 && decl < agentd.indexOf('function serveConnection(') && /if \(!ocFacts\)/.test(agentd) && !/this\._ocFacts/.test(agentd);
  })());

  const hosts = read('src/hosts.js');
  ok('hosts.opencodeOp prefers the DEVICE rung and falls back to ssh only for a real ssh host', /async opencodeOp\(/.test(hosts) && /dm\.opencodeServe\(/.test(hosts) && /if \(h\.transport === 'dial'\) throw e;/.test(hosts));
  // …and the fallback must not COST anything: both rungs key off the SAME
  // record, so an ssh retry after a device failure REUSES the daemon's serve
  // instead of starting a second `opencode serve` on that machine.
  ok('the device rung and the shipped script share ONE serve record (a fallback never spawns a second serve)', (() => {
    const daemonDataDir = /dataDir: path\.join\(process\.env\.HOME \|\| require\('os'\)\.homedir\(\), '\.vibespace'\)/.test(read('src/agentd/agentd.js'));
    const locatorRecord = /const recordPath = path\.join\(dataDir, 'opencode-serve\.json'\);/.test(read('src/opencode-serve.js'));
    const scriptRecord = /const BASE = path\.join\(HOME, '\.vibespace'\);/.test(SCRIPT) && /const RECORD = path\.join\(BASE, 'opencode-serve\.json'\);/.test(SCRIPT);
    return daemonDataDir && locatorRecord && scriptRecord;
  })());
  ok('…the shipped script rides the COMMAND (base64), never stdin next to the payload (head -c over-reads a pipe)', /base64 -d > "\$HOME\/\.vibespace\/bin\/vibespace-opencode-op"/.test(hosts));
  ok('…and a failing rung THROWS with the machine-side reason', /throw new Error\(parsed\.error/.test(hosts));
  ok('the access layer routes by hostId ALONE (no second "is this remote" branch downstream)', /if \(!hostId\) return runOpencodeOp/.test(read('src/server/opencode-access.js')));
}

console.log('\n— RESOURCE DISCIPLINE ON SOMEONE ELSE\'S MACHINE —');
{
  ok('the shipped script starts the serve from its OWN empty repo, never $HOME', /opencode-serve-cwd/.test(SCRIPT) && /git', \['init'/.test(SCRIPT) && !/cwd: HOME/.test(SCRIPT));
  // strip comments first: the header EXPLAINS the v2 rule, the code must not USE it
  const CODE = SCRIPT.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  ok('…uses v1 routes ONLY (every /api/session/:id/… route boots an indexing instance)', !/\/api\/session/.test(CODE), (CODE.match(/.*\/api\/session.*/g) || []).slice(0, 3));
  ok('…never asks for a project-scoped listing on a host that is not ours (the listing itself left with `discover`, lane dc-dead-sweep)', !/scope=project/.test(SCRIPT) && !/scope: 'project'/.test(SCRIPT));
  ok('…caps every response it reads into memory', /maxBytes/.test(SCRIPT));
  ok('…writes its record atomically (tmp + rename)', /renameSync/.test(SCRIPT));
  ok('…and reuses a healthy recorded serve instead of spawning per call, then SETTLES the record before anything overwrites it (round 11)',
    /if \(await healthy\(rec\.port\)\) return rec\.port;/.test(SCRIPT) && /await settleRecordedServe\(rec\) === 'answered'/.test(SCRIPT));
}

console.log(`\n${fails.length ? fails.length + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
