#!/usr/bin/env node
// OPENCODE S9 — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the heavy
// scripts/test-opencode-s9.mjs, whose mock / real serve, real boot, real binary and real browser legs, every patched-copy
// CONTROL and the size-of-the-control pins (R7–R10's *_NEUTER tables are the suite's own) stay there: the wiring pins, ROUND 2's
// two wiring findings, ROUNDS 3–11's «written down where the next person will look» docs pins, ROUND 4's pty source pin and its
// held-pty wiring, ROUND 10's ⚙-card branch. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite
// on a change of that file.
// Run: node scripts/test-opencode-s9-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0; const fails = [];
const ok = (name, cond, detail) => { if (typeof name !== 'string') throw new TypeError(`ok(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fails.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); } };

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');

const bugIndex = () => ((t) => (t.split(/^## INDEX\b.*$/m)[1] || '').split(/^## /m)[0])(read('docs/kb-bugfix-invariants.md'));

console.log('\n— WIRING PINS (a fix that is not wired is not a fix) —');
{
  const routes = read('src/routes/opencode.js');
  ok('routes exist for roll-back / restore (the only ones a client calls)', ['/api/opencode/revert', '/api/opencode/unrevert'].every((r) => routes.includes(r)));
  // lane dc-dead-sweep (2026-10-05): the asks / status / todos / session-list routes had no caller outside this suite — deleted
  ok('the caller-less asks / status / todos / session-list routes are gone', !['/api/opencode/questions', '/api/opencode/question/:requestId/reply', '/api/opencode/question/:requestId/reject', '/api/opencode/status', '/api/opencode/todos', '/api/opencode/sessions'].some((r) => routes.includes(r)));

  ok('…every route reaches a machine through ONE helper (hostId is a parameter, never a branch) and NOTHING calls the access layer around it',
    /const host = \(req\.method === 'GET' \? req\.query\.host : req\.body\?\.host\) \|\| null;/.test(routes)
    && (routes.match(/ctx\.access\.call\(/g) || []).length === 1
    && (routes.match(/await call\(req,/g) || []).length >= 3); // state + revert + unrevert since lane dc-dead-sweep
  ok('…and every result a route hands back is filtered through publicView (transport secrets are stripped STRUCTURALLY, not by "no route asks for that op today")', /return ctx\.access\.publicView\(op, await ctx\.access\.call\(host, op, params\)\);/.test(routes));
  ok('…every mutating route BROADCASTS (multi-client law)', (routes.match(/notify\(/g) || []).length >= (routes.match(/router\.post\(/g) || []).length + 1);
  ok('…and every failure answers with the machine-side reason', /function fail\(res, e\)/.test(routes) && /res\.status\(status\)\.json\(\{ error/.test(routes));
  ok('the access layer + its routes are wired from a src/server wiring module (server.js stays bootstrap-sized)', read('src/server/mounts-plugins-wiring.js').includes("require('./opencode-access').create("));
  const wsh = read('src/ws-handler.js');
  ok('ws permission-response routes an opencode-serve ask to the serve route, not to a session stdin', /data\.via === 'opencode-serve'/.test(wsh) && /'answer'/.test(wsh) && /'reject'/.test(wsh));
  ok('…and a refusal reaches the user (code opencode-question)', /code: 'opencode-question'/.test(wsh));
  const rend = read('src/lib/chat-renderers.js');
  ok('the ask card forwards `via`+`host` on BOTH submit and cancel (harness-neutral)', (rend.match(/msg\.permission\.via \? \{ via: msg\.permission\.via/g) || []).length === 2);
  ok('a STALE ask renders without a Submit button', /msg\.permission\.stale/.test(rend) && /no longer waiting for an answer/.test(rend));
  const cv = read('src/lib/chat-view.js');
  ok('the message popup offers the roll-back on a USER message only, behind a confirm dialog (never a native confirm)', /_addOpencodeRevertActions/.test(cv) && /showConfirmDialog\(/.test(cv) && /msg\.role === 'user'/.test(cv));
  ok('…and "Restore" appears only while a roll-back is actually staged', /const staged = row\?\.opencode\?\.revert/.test(cv));
  ok('an open window reacts to the broadcast (noteOpencodeChange), and the client never chains on its own echo', /noteOpencodeChange/.test(cv) && /noteOpencodeChange/.test(read('src/lib/app.js')));
  const card = read('src/lib/session-card.js');
  ok('the session card offers the serve terminal for opencode sessions on THIS machine', /session\.opencodeTerminal/.test(card) && /=== 'opencode' && !c\.s\.host/.test(card));
  ok('ws-create bridges the serve pty into the normal terminal path (no dtach spawn for it)', /data\.opencodePty/.test(read('src/ws-create.js')) && /!r6Handle && !ocPty/.test(read('src/ws-create.js')));
  ok('…and a serve terminal asked for a REMOTE machine is refused WITH the reason (the ws is not a promise the menu keeps)', /code: 'opencode-pty-remote'/.test(read('src/ws-create.js')) && /if \(data\.hostId \|\| session\.host\) \{/.test(read('src/ws-create.js')));
  // …and BOTH refusals carry the id that un-hangs `ws.request`, spelled the way
  // every other refusal in that file spells it. The grep above passes on the
  // CODE alone, which is how a bare `reqId` (a free identifier — the lost-binding
  // class this project has been bitten by four times) sat on this branch: the
  // route throws only when a user clicks "Open terminal in this session" on a
  // remote OpenCode session, and the window then hangs on a reply that a
  // ReferenceError ate. test-server-globals is the general net; this is the pin
  // that says WHICH promise the two lines owe.
  ok("…and both OpenCode-pty refusals answer the REQUEST (`reqId: data.reqId`, not a bare identifier) — an error without it leaves the window spinning",
    (() => {
      const src = read('src/ws-create.js');
      const sites = [...src.matchAll(/\{ type: 'error', code: 'opencode-pty-(?:remote|failed)',[^}]*\}/g)].map((m) => m[0]);
      return sites.length === 2 && sites.every((x) => /reqId: data\.reqId/.test(x));
    })(), JSON.stringify([...read('src/ws-create.js').matchAll(/code: 'opencode-pty-[a-z]+',[^,]*,/g)].map((m) => m[0])));
  ok('the pty session field is registered with an owner', /_opencodePtyId:/.test(read('src/session-schema.js')));

  ok('docs: kb-file-structure + kb-api + kb-features + the design S9 row mention the remainder', ['docs/kb-file-structure.md', 'docs/kb-api.md', 'docs/kb-features.md', 'docs/design-harness-plugins.md'].every((f) => /B-eac2|opencode-events|\/api\/opencode/.test(read(f))));
  // THE READER SITES: the bug the browser leg found (a fourth site that never
  // prepared) must stay fixed, and the invariant is "enumerate the sites", not
  // "assert the count in prose"
  ok('EVERY createSessionMessages() call site awaits the reader\'s prepare() (the fourth-site bug, B-eac2)', (() => {
    const files = ['src/ws-handler.js', 'src/transcript-service.js'];
    for (const f of files) {
      const src = read(f);
      const sites = [...src.matchAll(/createSessionMessages\(/g)].length;
      const prepares = [...src.matchAll(/sm\.prepare\b/g)].length;
      if (f === 'src/ws-handler.js' && prepares < 1) return false;         // the viewOnly site
      if (f === 'src/transcript-service.js' && prepares < 3) return false; // its three sites
      if (!sites && f === 'src/transcript-service.js') continue;
    }
    return true;
  })());
  ok('…and the incident is written down', /THE FOURTH READER SITE/.test(read('docs/kb-bugfix-invariants.md')));

}

console.log('\n— ROUND 2 (findings from the review of this branch) —');

{
  // ④ + ⑤ the two wiring-shaped findings
  const wsh = read('src/ws-handler.js');
  ok('an ask we could not answer refuses ONE ACTION — `scope:\'action\'`, never the 2.363.1 "attach failed" that flips a live window read-only',
    /type: 'error', scope: 'action', code: 'opencode-question'/.test(wsh) && /msg\?\.scope === 'action'/.test(read('src/lib/chat-view.js')));
  const cli = read('src/server/cli-env.js');
  ok('the live lane\'s dirty signal NOTIFIES every client (coalesced), and the client re-polls on it',
    /onChange: \(\(\) => \{/.test(cli) && /type: 'opencode-updated', kind: 'store'/.test(cli)
    && /OPENCODE_CHANGE_COALESCE_MS/.test(cli) && /reason === 'lane' \|\| reason === 'messages'/.test(cli)
    && /msg\.type !== 'opencode-updated'/.test(read('src/lib/app.js')));
  const ad = read('src/agentd/agentd.js');
  ok('the daemon\'s facts live per PROCESS, not per connection (`this` inside a Mux handler IS the connection — a reconnect would arm a second live lane and leak the first)',
    (() => { const d = ad.indexOf('let ocFacts = null;'); return d > 0 && d < ad.indexOf('function serveConnection(') && /if \(!ocFacts\)/.test(ad) && !/this\._ocFacts/.test(ad); })());
}

console.log('\n— ROUND 3 (findings from the second review of this branch) —');

{
  // the three mechanisms are written down where the next person will look
  const kfs = read('docs/kb-file-structure.md');
  ok('docs: the own-write ledger, the woken sleep and the terminal 404 are in the kb essays + the incident file',
    /noteOwnWrite/.test(kfs) && /ownWriteVerdict/.test(kfs) && /wakes it|wake it|wake the sleep|WAKES/i.test(kfs) && /ptyGone/.test(kfs)
    && /OUR OWN CLICK REPORTED AS SOMEONE ELSE'S TURN/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 3/.test(bugIndex()));
}

console.log('\n— ROUND 4 (findings from the third review of this branch) —');
{
  // SOURCE PIN: the six methods are the only place this could come back.
  const src = read('src/opencode-serve.js');
  const ptyBlock = src.slice(src.indexOf('  // ── PTY (a shell the SERVE owns'), src.indexOf('  authHeader()'));
  ok('source pin: not one method of the pty family builds a `directory` query', ptyBlock.length > 200 && !/directory/.test(ptyBlock.replace(/^\s*\*.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), ptyBlock.split('\n').filter((l) => /directory/.test(l) && !/^\s*[*/]/.test(l)));
}
{
  // THE WIRING PIN (the 2.355.0 law: a fix whose call site is not staged is a
  // green unit test over dead code). `_opencodePtyId` finally has a reader.
  const srv = read('server.js'), cli = read('src/server/cli-env.js');
  ok('wiring: server.js hands cli-env the live sessions\' pty ids and cli-env passes them to the facts as heldPtyIds',
    /getHeldPtyIds:\s*\(\)\s*=>/.test(srv) && /_opencodePtyId/.test(srv)
    && /getHeldPtyIds/.test(cli) && /heldPtyIds:\s*\(\)\s*=>/.test(cli));
  ok('…so the session field has a consumer at last (it was written in ws-create and read nowhere)',
    /_opencodePtyId/.test(read('src/ws-create.js')) && /_opencodePtyId/.test(srv));
}

{
  // the three mechanisms are written down where the next person will look
  const kfs = read('docs/kb-file-structure.md');
  ok('docs: the directory-free pty family, the pty reaper and the re-resolved store watch are in the kb essays + the incident file',
    /reapPtys/.test(kfs) && /no `directory`|NO `directory`|directory-free/i.test(kfs) && /re-resolv/i.test(kfs)
    && /A SERVE TERMINAL INDEXED THE USER'S REPO/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 4/.test(bugIndex()));
}

console.log('\n— ROUND 5 (findings from the fourth review of this branch) —');

{
  // …and both mechanisms are written down where the next person will look
  const kfs = read('docs/kb-file-structure.md');
  ok('docs: the per-process question map and the service-gated lane are in the kb essays + the incident file + the index',
    /questionsFor/.test(kfs) && /ROUND 5/.test(kfs)
    && /A DEAD ASK STAYED ANSWERABLE/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 5/.test(bugIndex()));
}

console.log('\n— ROUND 6 (the fifth review of this branch: stop() vs an arm already in flight) —');

{
  // …and the invariant is written down where the next person will look
  const kfs = read('docs/kb-file-structure.md');
  ok('docs: "stop() is terminal for work already in flight" is in the kb essays + the incident file + the index',
    /ROUND 6/.test(kfs) && /laneStopped/.test(kfs)
    && /A SERVICE THAT WAS TURNED OFF KEPT THE WATCH/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 6/.test(bugIndex()));

}

console.log('\n— ROUND 7 (the sixth review: stop() vs the KEEPER ladder already in flight) —');

{
  // …and the invariant is written down where the next person will look
  const kfs = read('docs/kb-file-structure.md');
  ok('docs: "the check belongs at the ACQUISITION point" is in the kb essays + the incident file + the index',
    /ROUND 7/.test(kfs) && /adopt\(\)/.test(kfs)
    && /A SERVICE THAT WAS TURNED OFF STILL ADOPTED/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 7/.test(bugIndex()));

}

console.log('\n— ROUND 8 (the seventh review: a Disable→Enable pair inside one ladder) —');

{
  const kfs = read('docs/kb-file-structure.md');

  ok('docs: "a level is not a cancellation" is in the kb essays + the incident file + the index',
    /ROUND 8/.test(kfs) && /stopEpoch/.test(kfs)
    && /A LEVEL IS NOT A CANCELLATION/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 8/.test(bugIndex()));

}

console.log('\n— ROUND 9 (the eighth review: two ladders, one record) —');

{
  const kfs = read('docs/kb-file-structure.md');

  ok('docs: "a record you do not own" is in the kb essays + the incident file + the index',
    /ROUND 9/.test(kfs) && /clearRecord/.test(kfs)
    && /A RECORD YOU DO NOT OWN/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 9/.test(bugIndex()));

}

console.log('\n— ROUND 10 (the ninth review: a recorded serve that is ALIVE and silent) —');
{
  ok("…and the ⚙ card does not call it a crash loop: the opencode row has its own 'blocked' branch, translated in zh + ja",
    /parkedKind === 'blocked'/.test(read('src/lib/plugins-ui.js'))
    && /blocked by a serve we could not identify/.test(read('src/lib/i18n-zh.js'))
    && /blocked by a serve we could not identify/.test(read('src/lib/i18n-ja.js')));
}

{
  const kfs = read('docs/kb-file-structure.md');

  ok('docs: "the record we were about to overwrite" is in the kb essays + the incident file + the index',
    /ROUND 10/.test(kfs) && /settleRecordedServe/.test(kfs)
    && /THE RECORD WE WERE ABOUT TO OVERWRITE/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 10/.test(bugIndex()));

  // ROUND 11 — the same contract: the essay lives in the kb, the incident in
  // the invariants file, the index line in the kb-bugfix INDEX head (CLAUDE.md until lane claude-md-diet), and the SHIPPED script's
  // own entry says the settlement reached it too (that file was the unfixed
  // twin — a kb that still describes the old `locate()` is how the twin got
  // shipped in the first place).
  ok('docs: ROUND 11 (the portable identity rung, the blind verdict, and the button the park left enabled) is in the kb essays + the incident file + the index',
    /ROUND 11/.test(kfs) && /'blind'/.test(kfs) && /hostCanIdentify/.test(kfs)
    && /A GUARD THAT CAN NEVER ANSWER IS AN OUTAGE/.test(read('docs/kb-bugfix-invariants.md'))
    && /S9 REMAINDER ROUND 11/.test(bugIndex()));
  ok('docs: the SHIPPED ssh script\'s own kb entry says its record is SETTLED (it carried the unfixed twin of the round-10 bug)',
    /vibespace-opencode-op[\s\S]{0,4000}?SETTLED BEFORE ANYTHING OVERWRITES IT/.test(kfs));

}

console.log(`\n${fails.length ? fails.length + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
