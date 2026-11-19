#!/usr/bin/env node
// test-resume-line.mjs — the manager design's piece 4 (主开发 2026-11-17): THE ONE LINE OF RESUMES NOBODY PRESSED. Every resume nobody
// pressed waits its turn on one line, and at most two start at a time; each next starts when a start before it ENDED (created,
// refused, failed, a throw — any end); one asker's waiting resumes past ten are refused by name with the count; a conversation
// already in line is joined, never started twice. PURE src/resume-line.js + ORCH src/server/resume-line.js, with a stand-in start
// whose end the leg places (never a clock guess). No hub, no CLI, no billed turn.
//   ① ten resumes at once: never more than two in flight, all ten ended — RED CONTROL: the constant patched to ten (a mutant copy)
//   ② the eleventh WAITING resume of one asker is refused by name (line_full) with the count; another asker is not
//   ③ the same conversation twice: joined (one start, both askers hear its end)
//   ④ a start that throws or refuses frees its place: the line moves on
//   ⑤ the PURE arithmetic: enqueue / takeStartable / finished / positionOf
//   ⑦ ONE START HAS A BOUND (the cure round's must 4): a start that never answers frees its place at its bound, says ONE named
//      line and answers its asker; a late answer is dropped, said — RED CONTROL: no bound ⇒ the line is dead behind two such starts
//   ⑧ a start that ends refused is logged with its target
//   ⑥ rowDesktopOf: the desktop of the row that shows a conversation in the hub's layouts — {id, name}, the first in the desktops'
//      order, or null (no row: no page makes a window, the hub never picks a desktop)
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // a red control's edit fails BY NAME when its anchor moves (RULES: a new red control is anchored)

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const L = require(path.join(REPO, 'src/resume-line.js'));
const { createResumeLine } = require(path.join(REPO, 'src/server/resume-line.js'));

// a stand-in start whose end the leg places: each start waits on its own gate
const rig = () => {
  const gates = new Map(); let inFlight = 0, most = 0; const started = [];
  const start = (e) => { inFlight++; most = Math.max(most, inFlight); started.push(e.target); return new Promise((res, rej) => gates.set(e.target, { res: (v) => { inFlight--; res(v); }, rej: (x) => { inFlight--; rej(x); } })); };
  return { gates, start, started, most: () => most, inFlight: () => inFlight };
};
const endAll = async (R) => { for (let k = 0; k < 40 && R.gates.size; k++) { for (const [t, g] of [...R.gates]) { R.gates.delete(t); g.res({ ok: true, target: t }); } await tick(1); } };

console.log('— ① TEN AT ONCE: never more than two in flight');
{
  const R = rig(), line = createResumeLine({ start: R.start });
  const subs = Array.from({ length: 10 }, (_, k) => line.submit({ target: 'claude:c' + k, by: 'key-1' }));
  await tick(1);
  const atOnce = R.inFlight(), waiting = line.state().waiting;
  const results = Promise.all(subs.map((s) => s.result));
  await endAll(R);
  const all = await results;
  ok(subs.every((s) => s.ok) && atOnce === 2 && waiting === 8 && R.most() === 2 && all.length === 10 && all.every((r) => r && r.ok), `① ten resumes at once: ${atOnce} started, ${waiting} waiting, never more than ${R.most()} in flight, all ten ended`, { atOnce, waiting, most: R.most() });
  ok(subs[0].position === 0 && subs[1].position === 0 && subs[2].position === 1 && subs[9].position === 8, '① …each answered with its place in line (0 = started now)', subs.map((s) => s.position));
  // RED CONTROL: the constant patched to ten, in a mutant copy of the PURE arithmetic (the ORCH copy beside it requires it)
  const M = mutantCopies('resume-line', REPO);
  const pure = fs.readFileSync(path.join(REPO, 'src/resume-line.js'), 'utf8'), orch = fs.readFileSync(path.join(REPO, 'src/server/resume-line.js'), 'utf8');
  const patched = anchored(pure, 'const MAX_STARTS = 2;', 'const MAX_STARTS = 10;', 'max-starts-ten');
  ok(patched !== pure, '① (the constant patch applied)');
  const pureCopy = M.write('src/resume-line.js', patched, 'max-ten');
  const orchCopy = anchored(orch, "require('../resume-line.js')", `require(${JSON.stringify(pureCopy)})`, 'the resume-line ORCH reads the patched copy');   // the ORCH copy reads the PATCHED arithmetic
  ok(orchCopy !== orch, '① (the ORCH copy rewired to the patched arithmetic)');
  const P = require(M.write('src/server/resume-line.js', orchCopy, 'max-ten'));
  const R2 = rig(), line2 = P.createResumeLine({ start: R2.start });
  for (let k = 0; k < 10; k++) line2.submit({ target: 'claude:d' + k, by: 'key-1' });
  await tick(1);
  ok(R2.most() === 10, `① RED CONTROL: the constant patched to ten — ${R2.most()} creates in flight at once (the storm the line exists to prevent)`);
  await endAll(R2);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: '① ' })) ok(r.pass, r.name, r.detail);
}

console.log('— ② ONE ASKER\'S ELEVENTH WAITING RESUME is refused by name, with the count');
{
  const R = rig(), line = createResumeLine({ start: R.start });
  const subs = Array.from({ length: 12 }, (_, k) => line.submit({ target: 'codex:e' + k, by: 'key-2' }));   // 2 start, 10 wait
  const eleventh = line.submit({ target: 'codex:e12', by: 'key-2' });
  const other = line.submit({ target: 'codex:f0', by: 'key-3' });
  ok(subs.every((s) => s.ok) && line.state().running === 2 && eleventh.ok === false && eleventh.code === 'line_full' && eleventh.count === 10, `② key-2's eleventh WAITING resume: refused by name — ${eleventh.code}, count ${eleventh.count}`, eleventh);
  ok(other.ok === true && other.position === 11, `② …another asker is not refused (its place: ${other.position})`, other);
  await endAll(R);
}

console.log('— ③ THE SAME CONVERSATION TWICE: joined');
{
  const R = rig(), line = createResumeLine({ start: R.start });
  const a = line.submit({ target: 'claude:same', by: 'key-4' }), b = line.submit({ target: 'claude:same', by: 'key-5' });
  await tick(1);
  ok(a.ok && b.ok && b.joined === true && R.started.length === 1, `③ the second ask for a conversation in line JOINS it — ${R.started.length} start`, { a: a.position, b });
  await endAll(R);
  const [ra, rb] = await Promise.all([a.result, b.result]);
  ok(ra && rb && ra === rb && ra.target === 'claude:same', '③ …both askers hear the same end');
}

console.log('— ④ A START THAT THROWS OR REFUSES FREES ITS PLACE');
{
  const R = rig(), line = createResumeLine({ start: R.start, log: () => {} });
  const s = ['x0', 'x1', 'x2', 'x3'].map((t) => line.submit({ target: 'claude:' + t, by: 'key-6' }));
  await tick(1);
  R.gates.get('claude:x0').rej(new Error('the machine is unreachable')); R.gates.delete('claude:x0');
  R.gates.get('claude:x1').res({ ok: false, why: 'no transcript here' }); R.gates.delete('claude:x1');
  await tick(5);
  ok(R.started.join() === 'claude:x0,claude:x1,claude:x2,claude:x3', `④ a thrown start and a refused one each free their place: the next two start (${R.started.join(' ')})`);
  const r0 = await s[0].result;
  ok(r0 && r0.ok === false && /unreachable/.test(r0.why), '④ …and the thrown start answers its asker by name', r0);
  await endAll(R);
}

console.log('— ⑤ THE PURE ARITHMETIC');
{
  const line = L.emptyLine();
  L.enqueue(line, { id: 'a', target: 't1', by: 'k' }); L.enqueue(line, { id: 'b', target: 't2', by: 'k' }); L.enqueue(line, { id: 'c', target: 't3', by: 'k' });
  const first = L.takeStartable(line, { maxStarts: 2 }).map((e) => e.id);
  ok(first.join() === 'a,b' && L.positionOf(line, 'c') === 1 && L.positionOf(line, 'a') === 0 && L.positionOf(line, 'zz') === -1, '⑤ two start, the third waits first in line');
  L.finished(line, 'a');
  ok(L.takeStartable(line, { maxStarts: 2 }).map((e) => e.id).join() === 'c' && L.takeStartable(line, { maxStarts: 2 }).length === 0, '⑤ a start that ended frees one place — exactly one more starts');
  ok(L.MAX_STARTS === 2 && L.PER_ASKER_MAX === 10 && L.START_BOUND_MS === 180000, '⑤ the constants: two starts at a time, ten waiting per asker, one start bounded at 180 s (twice the create\'s own 90 s)');
}

console.log('— ⑦ ONE START HAS A BOUND');
{
  const run = async (startBoundMs) => {
    const lines = [], gates = new Map(), started = [];
    const start = (e) => { started.push(e.target); return e.target === 'claude:next' ? Promise.resolve({ ok: true, sessionId: 'sess-next' }) : new Promise((res) => gates.set(e.target, res)); };   // the two hang; the third answers at once
    const line = createResumeLine({ start, startBoundMs, log: (l) => lines.push(l) });
    const a = line.submit({ target: 'codex:hang-1', by: 'k' }), b = line.submit({ target: 'codex:hang-2', by: 'k' }), c = line.submit({ target: 'claude:next', by: 'k' });
    await tick(startBoundMs === Infinity ? 120 : 90);
    return { lines, gates, started, line, a, b, c };
  };
  const B = await run(40);
  const ra = await B.a.result;
  ok(B.started.join() === 'codex:hang-1,codex:hang-2,claude:next', `⑦ two starts that never answer: at their bound (40 ms) both places free — the third STARTS (${B.started.join(' ')})`, B.started);
  ok(ra && ra.ok === false && /^the start did not answer in 40 ms — its place in line is freed$/.test(ra.why) && B.lines.filter((l) => /^\[resume-line\] codex:hang-1: did not start — the start did not answer in 40 ms/.test(l)).length === 1, '⑦ …its asker is answered with the reason, and ONE named line says it', { ra, lines: B.lines });
  B.gates.get('codex:hang-1')({ ok: true, sessionId: 'sess-late' });
  await tick(5);
  const st = B.line.state();
  ok(B.lines.some((l) => /^\[resume-line\] codex:hang-1: its start answered after its bound — dropped \(it started\)$/.test(l)) && st.running === 0 && st.waiting === 0 && (await B.c.result).ok, '⑦ a late answer is dropped and said (the in-flight map below keeps one conversation from starting twice); it frees nothing twice', { lines: B.lines, st });
  const N = await run(Infinity);
  ok(N.started.join() === 'codex:hang-1,codex:hang-2' && N.line.state().waiting === 1, `⑦ RED CONTROL: no bound — two starts that never answer hold both places and the third NEVER starts (${N.started.join(' ')}; waiting ${N.line.state().waiting})`);
}

console.log('— ⑧ A START THAT ENDS REFUSED IS LOGGED WITH ITS TARGET');
{
  const lines = [];
  const line = createResumeLine({ start: () => Promise.resolve({ ok: false, why: 'the vault is locked' }), log: (l) => lines.push(l) });
  const q = line.submit({ target: 'claude:locked', by: 'k' });
  await q.result;
  ok(lines.includes('[resume-line] claude:locked: did not start — the vault is locked'), '⑧ «[resume-line] <target>: did not start — <why>» — a queued resume\'s failing end is never silent', lines);
}

console.log('— ⑥ THE ROW\'S DESKTOP');
{
  const row = (o) => ({ winId: 'w', type: 'chat', ...o });
  const L0 = { desktopMeta: [{ id: 'desk-a', name: 'Desk A' }, { id: 'desk-b', name: 'Desk B' }], desktops: {
    'desk-b': { autoSave: { windows: [row({ openSpec: { action: 'attachSession', serverId: 'sess-1', backend: 'claude', backendSessionId: 'c-1' } }), row({ backend: 'codex', backendSessionId: 'x-9' })] } },
    'desk-a': { autoSave: { windows: [row({ backend: 'claude', backendSessionId: 'c-2' })] } } } };
  ok(JSON.stringify(L.rowDesktopOf(L0, 'claude:c-1')) === '{"id":"desk-b","name":"Desk B"}' && JSON.stringify(L.rowDesktopOf(L0, 'codex:x-9')) === '{"id":"desk-b","name":"Desk B"}', '⑥ a row (by its open spec, or its own fields) ⇒ its desktop, with the name the person gave it');
  ok(L.rowDesktopOf(L0, 'codex:c-1') === null && L.rowDesktopOf(L0, 'claude:nope') === null && L.rowDesktopOf(null, 'claude:c-1') === null && L.rowDesktopOf(L0, 'c-1') === null, '⑥ another harness\'s id, no row, no layouts, no key ⇒ null');
  const L1 = { ...L0, desktops: { ...L0.desktops, 'desk-a': { autoSave: { windows: [row({ backend: 'claude', backendSessionId: 'c-1' })] } } } };
  ok(L.rowDesktopOf(L1, 'claude:c-1').id === 'desk-a', '⑥ rows on two desktops ⇒ the first in the desktops\' own order');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
