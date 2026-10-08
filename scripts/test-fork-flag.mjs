#!/usr/bin/env node
// A FORK IS A FORK WHOEVER ASKS (B-8b7b, hit 2026-10-02): a ws `create
// {fork: true}` sent through the API spawned `claude --resume <parent>` with no
// `--fork-session` — the flag came only from the CLIENT's extraArgs — so the
// "fork" resumed the parent and wrote a stray turn into its transcript (two
// writers on one JSONL, the B-4058 class). Now:
//   ① the claude adapter derives --fork-session (+ --resume-session-at) from
//     the fork fact, the ONE producer; every transport (local dtach, daemon
//     pipe, ssh, dial) composes that argv; a client copy is dropped;
//   ② a pending fork whose own CLI holds its PARENT's id on two consecutive
//     sightings is a resume in disguise: the chain hands its lock to
//     onResumedParent (ws-create kills it before its first turn and answers
//     the creator `fork-resumed-parent`).
// Control: a patched adapter that reads the flag from the client's extraArgs
// again ⇒ an API fork resumes the parent ⇒ ① RED.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  ✗   ' + m + (extra ? ' — ' + extra : '')); } };
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n');

const P = 'f2b9c1d0-1111-4222-8333-944455556666', AT = 'a1b2c3d4-0000-4000-8000-000000000001';
function table(mod) {
  const A = new mod.ClaudeCodeAdapter({});
  const argv = (o) => A.buildSessionArgs({ cwd: '/w', mode: 'chat', ...o }).args;
  const has = (a, f) => a.includes(f);
  const count = (a, f) => a.filter(x => x === f).length;
  const fork = argv({ resumeId: P, fork: true });
  const resume = argv({ resumeId: P });
  const at = argv({ resumeId: P, fork: true, forkAt: AT });
  const stale = argv({ resumeId: P, fork: true, forkAt: AT, extraArgs: ['--fork-session', '--resume-session-at', AT, '--verbose'] });
  const noFact = argv({ resumeId: P, extraArgs: ['--fork-session'] });
  const junkAt = argv({ resumeId: P, fork: true, forkAt: '$(touch x)' });
  const newSess = argv({ fork: true });
  return {
    fork: has(fork, '--fork-session') && fork[fork.indexOf('--resume') + 1] === P,
    resume: !has(resume, '--fork-session') && !has(resume, '--resume-session-at'),
    at: has(at, '--fork-session') && at[at.indexOf('--resume-session-at') + 1] === AT,
    staleOnce: count(stale, '--fork-session') === 1 && count(stale, '--resume-session-at') === 1 && has(stale, '--verbose'),
    noFact: !has(noFact, '--fork-session'),
    junkAt: has(junkAt, '--fork-session') && !has(junkAt, '--resume-session-at') && !junkAt.includes('$(touch x)'),
    newSess: !has(newSess, '--fork-session'),
    argv: { fork, at },
  };
}

console.log('— ① the adapter derives the fork flags from the fork fact');
const real = require(path.join(REPO, 'src/adapters/claude-code.js'));
const t = table(real);
ok(t.fork, 'fork:true + resumeId (no extraArgs — the API shape) ⇒ --resume <parent> --fork-session', JSON.stringify(t.argv.fork));
ok(t.resume, 'a plain resume ⇒ neither --fork-session nor --resume-session-at');
ok(t.at, 'forkAt ⇒ --resume-session-at <uuid> beside --fork-session', JSON.stringify(t.argv.at));
ok(t.staleOnce, 'a stale client\'s extraArgs copy ⇒ each flag spelled ONCE (the copy dropped, other extraArgs kept)');
ok(t.noFact, 'extraArgs --fork-session WITHOUT the fork fact ⇒ dropped (a guarded plain resume, never a half-fork the server does not track)');
ok(t.junkAt, 'a fork point that is not id-shaped never becomes an argv token (the fork still forks)');
ok(t.newSess, 'fork:true with no resume id ⇒ nothing to fork from, no flag');

console.log('— ① every transport composes that one argv');
const { buildRemoteExec } = require(path.join(REPO, 'src/remote-shell.js'));
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const remote = buildRemoteExec({ cwd: '/w', shq, parts: ['claude', ...t.argv.at.map(shq)] });
ok(remote.includes(`'--resume' '${P}' '--fork-session' '--resume-session-at' '${AT}'`), 'buildRemoteExec (ssh + dial) carries the adapter\'s fork flags verbatim', remote.slice(-160));
const wc = codeOnly(read('src/ws-create.js'));
ok(/let spawnArgs = sessionSpec\.args \|\| \[\];/.test(wc) && /spawnCmd, \.\.\.spawnArgs,\n\s*\];/.test(wc), 'local dtach + daemon pipe: r6Argv spreads spawnArgs, seeded from the adapter\'s sessionSpec.args');
ok(/forkAt: data\.fork && data\.forkAtUuid \? String\(data\.forkAtUuid\) : null,/.test(wc), 'ws-create hands the fork point (data.forkAtUuid) to buildSessionArgs, only on a fork');
const sshSrc = codeOnly(read('src/spawn/ssh.js')), dialSrc = codeOnly(read('src/spawn/dial.js'));
ok((sshSrc.match(/spawnArgs\.map\(shq\)/g) || []).length >= 1 && (dialSrc.match(/spawnArgs\.map\(shq\)/g) || []).length >= 1, 'ssh.js / dial.js compose spawnArgs (the adapter argv) into buildRemoteExec');

console.log('— ① ONE producer: no other src file spells the flag in code');
const files = fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter(f => /\.(c?js|mjs)$/.test(f));
const spellers = files.filter(f => /['"`]--fork-session\b/.test(codeOnly(fs.readFileSync(path.join(REPO, 'src', f), 'utf8'))));
ok(spellers.length === 1 && spellers[0] === path.join('adapters', 'claude-code.js'), 'the --fork-session literal lives in src/adapters/claude-code.js only (the client copy removed)', JSON.stringify(spellers));
const sl = codeOnly(read('src/lib/session-lifecycle.js'));
const doFork = sl.slice(sl.indexOf('async _doForkSession('), sl.indexOf('viewSession(sessionId'));
ok(/fork: true,/.test(doFork) && /forkAtUuid: resumeAt \|\| undefined,/.test(doFork) && !/extraArgs/.test(doFork), 'the client\'s fork create sends the fact (fork + forkAtUuid), no extraArgs');

const M = mutantCopies('fork-flag', REPO);
const adSrc = read('src/adapters/claude-code.js');
const mutSrc = adSrc.replace("    args.push(...claudeForkArgs({ resumeId, fork: options.fork, forkAt: options.forkAt }));\n", '').replace("      if (FORK_FLAGS.has(flag)) {", '      if (false) {');
ok(mutSrc !== adSrc && mutSrc.includes('if (false) {'), 'control edit applied (the adapter reads the flag from the client\'s extraArgs again)');
const mt = table(M.load('src/adapters/claude-code.js', mutSrc, 'client-flag'));
ok(!mt.fork && !mt.at, 'control: the client-extraArgs adapter ⇒ an API fork (no extraArgs) RESUMES the parent ⇒ ① RED', JSON.stringify(mt.argv.fork));

console.log('— ② a fork whose own CLI holds its parent\'s id is a resume in disguise');
const LC = require(path.join(REPO, 'src/claude-lock-capture.js'));
const T0 = Date.now() - 5000;
const depth = (m) => (pid) => m[pid] || 0;
const lock = (pid, sessionId, startedAt = T0 + 100) => ({ pid, sessionId, cwd: '/w', startedAt });
const v = (locks, m) => LC.forkResumedParent({ locks, createdAt: T0, seedId: P, pidDepth: depth(m) });
ok(v([lock(7001, P)], { 7001: 1 })?.pid === 7001, 'the nearest own lock names the parent ⇒ that lock (its pid is the writer to stop)');
ok(v([lock(7001, 'f-own')], { 7001: 1 }) === null, 'the fork\'s own new id ⇒ no verdict');
ok(v([lock(7001, P, T0 - 1)], { 7001: 1 }) === null, 'a lock older than the create ⇒ no verdict (never this spawn\'s)');
ok(v([lock(7001, P)], {}) === null, 'the parent\'s lock held by a process OUTSIDE the fork\'s tree (the live parent) ⇒ no verdict');
ok(v([lock(7001, 'f-own'), lock(7002, P)], { 7001: 1, 7002: 2 }) === null, 'a deeper descendant\'s parent-id lock (a claude the fork runs from a tool) ⇒ no verdict (nearest wins)');
ok(LC.pickClaudeLock({ locks: [lock(7001, P)], createdAt: T0, excludeId: P, pidDepth: depth({ 7001: 1 }) }) === null, 'the seed is still never a PICK (the parent never adopts the fork, the fork never adopts the parent)');

function chain({ sightings, proofFn = null }) {
  const session = { _forkRequested: true, claudeSessionId: P, backend: 'claude', createdAt: T0 };
  const active = new Map([['s1', session]]);
  const q = []; const got = { betrayed: null, adopted: null, attempts: 0, steps: 0 };
  let i = 0;
  LC.armLockCapture({ id: 's1', session, activeSessions: active, schedule: (fn) => { q.push(fn); return null; },
    attempt: () => { got.attempts++; return null; }, onAdopt: (x) => { got.adopted = x; },
    proof: proofFn || (() => sightings[i++] || null), onResumedParent: (l) => { got.betrayed = l; } });
  while (q.length && got.steps < 20) { got.steps++; q.shift()(); }
  return got;
}
const L = lock(7001, P);
const c2 = chain({ sightings: [L, L] });
ok(c2.betrayed === L && c2.adopted === null && c2.steps === 2, 'armLockCapture: two consecutive sightings ⇒ onResumedParent(lock), the chain ends, nothing adopted', JSON.stringify(c2));
const c1 = chain({ sightings: [L, null, L, null, null] });
ok(c1.betrayed === null && c1.steps === 20, 'one sighting between clean reads (a lock caught mid-rewrite) ⇒ never a verdict; the capture keeps running');
const cr = chain({ sightings: [], proofFn: () => { throw new Error('torn'); } });
ok(cr.betrayed === null && cr.attempts > 0, 'a proof that throws ⇒ no verdict, the id capture goes on');

const wcFull = read('src/ws-create.js');
const wire = codeOnly(wcFull.slice(wcFull.indexOf('armLockCapture({'), wcFull.indexOf('onAdopt: (lockId)')));
ok(/proof: \(\) => captureForkProof\(\{ session, sessionsDir: SESSIONS_DIR, sidecarPath: metaFileW, readPpid \}\)/.test(wire)
  && /process\.kill\(Number\(lock\.pid\), 'SIGKILL'\)/.test(wire) && /session\.pty\?\.kill\(\)/.test(wire)
  && /code: 'fork-resumed-parent'/.test(wire) && /reqId: data\.reqId/.test(wire), 'ws-create: the create chain arms the proof; a verdict SIGKILLs the fork\'s CLI, ends its session and answers the creator fork-resumed-parent');

console.log(`\ntest-fork-flag: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
