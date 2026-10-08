#!/usr/bin/env node
// test-pid-identity — A PID IS NEVER AN IDENTITY (B-1cc6, lane pid-identity-census). src/proc-identity.js's table over a
// fixture /proc tree (same / recycled / gone / zombie / rebooted / no starttime / no /proc), the report-once rule, a
// MUTANT that signals on a bare pid (must turn this table red), and one REAL leg: a live scratch `sleep` whose stored
// record carries a wrong starttime is never signalled (pid-recycled + the journal line), the right one is.
// The census itself is test-architecture §85 (scripts/pid-identity-census.mjs). Fast, in-process, ~1 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pid-identity-'));
const root = path.join(tmp, 'proc');
const stat = (pid, comm, state, start) => {
  fs.mkdirSync(path.join(root, String(pid)), { recursive: true });
  const rest = [state, '1', pid, pid, '0', '-1', '4194560', '0', '0', '0', '0', '0', '0', '0', '0', '20', '0', '1', '0', String(start), '1000', '10'];
  fs.writeFileSync(path.join(root, String(pid), 'stat'), `${pid} (${comm}) ${rest.join(' ')}\n`);
};
fs.mkdirSync(path.join(root, 'sys/kernel/random'), { recursive: true });
fs.writeFileSync(path.join(root, 'sys/kernel/random/boot_id'), 'boot-A\n');
stat(4242, 'sl) eep', 'S', 1000); // a comm holding ") " — field 22 is counted from the LAST ')'
stat(4343, 'zomb', 'Z', 2000);
const noproc = path.join(tmp, 'noproc'); fs.mkdirSync(noproc);

function table(PI, label) {
  const o = { procRoot: root };
  const v = (rec, opts = o) => PI.judge(rec, opts).verdict;
  const rows = [
    ['identityOf a live pid', JSON.stringify(PI.identityOf(4242, o)), JSON.stringify({ pid: 4242, starttime: 1000, bootId: 'boot-A' })],
    ['identityOf a gone pid', PI.identityOf(9999, o), null],
    ['same', v({ pid: 4242, starttime: 1000, bootId: 'boot-A' }), 'same'],
    ['same, a record with no bootId', v({ pid: 4242, starttime: 1000 }), 'same'],
    ['recycled (another starttime)', v({ pid: 4242, starttime: 999, bootId: 'boot-A' }), 'pid-recycled'],
    ['gone', v({ pid: 9999, starttime: 1000, bootId: 'boot-A' }), 'gone'],
    ['rebooted (another bootId)', v({ pid: 4242, starttime: 1000, bootId: 'boot-B' }), 'gone'],
    ['zombie', v({ pid: 4343, starttime: 2000 }), 'zombie'],
    ['no starttime (an older build)', v({ pid: 4242 }), 'unknown-identity'],
    ['no /proc, no ps', v({ pid: 4242, lstart: 'Tue Oct 7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: false }) }), 'unknown'],
    ['no /proc, ps says same', v({ pid: 4242, lstart: 'Tue Oct  7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: true, state: 'S', lstart: 'Tue Oct 7 01:00:00 2026' }) }), 'same'],
    ['no /proc, ps says another start', v({ pid: 4242, lstart: 'Tue Oct 7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: true, state: 'S', lstart: 'Wed Oct 8 02:00:00 2026' }) }), 'pid-recycled'],
    ['no /proc, ps finds none', v({ pid: 4242, lstart: 'Tue Oct 7 01:00:00 2026' }, { procRoot: noproc, ps: () => ({ ran: true, lstart: null }) }), 'gone'],
    ['no /proc, a starttime-only record', v({ pid: 4242, starttime: 1000 }, { procRoot: noproc, ps: () => ({ ran: true, lstart: 'x' }) }), 'unknown'],
    ['aliveIdentity same / zombie / unknown', [PI.aliveIdentity({ pid: 4242, starttime: 1000 }, o), PI.aliveIdentity({ pid: 4343, starttime: 2000 }, o), PI.aliveIdentity({ pid: 4242 }, o)].join(), 'true,false,'],
    ['sameProcess(pid, identity)', [PI.sameProcess(4242, { starttime: 1000 }, o), PI.sameProcess(4242, { starttime: 1 }, o)].join(), 'true,false'],
  ];
  const sent = [], said = [];
  const sig = (rec, extra = {}) => PI.signalIdentity(rec, 'SIGTERM', { ...o, kill: (p, s) => sent.push(`${p}:${s}`), say: (l) => said.push(l), what: 'fixture', ...extra });
  PI._resetReported();
  rows.push(['signal same (group first)', JSON.stringify(sig({ pid: 4242, starttime: 1000 }, { group: true })), JSON.stringify({ ok: true, target: -4242 })]);
  rows.push(['signal recycled', JSON.stringify(sig({ pid: 4242, starttime: 999 })), JSON.stringify({ ok: false, why: 'pid-recycled' })]);
  sig({ pid: 4242, starttime: 999 });
  rows.push(['signal no-starttime record', JSON.stringify(sig({ pid: 4242 })), JSON.stringify({ ok: false, why: 'unknown-identity' })]);
  rows.push(['signal zombie', JSON.stringify(sig({ pid: 4343, starttime: 2000 })), JSON.stringify({ ok: false, why: 'gone' })]);
  rows.push(['signals sent', sent.join(), '-4242:SIGTERM']);
  rows.push(['refusals said ONCE each (recycled ×2 → 1 line)', said.length, 2]);
  rows.push(['the unknown-identity line', /cannot prove is ours — restart it to re-record — not signalled$/.test(said[1] || ''), true]);
  const bad = rows.filter(([, got, want]) => got !== want);
  return { rows, bad, label };
}

const PI = require(path.join(REPO, 'src/proc-identity.js'));
const t = table(PI, 'proc-identity');
for (const [n, got, want] of t.rows) ok(got === want, `${n} → ${got}${got === want ? '' : ' (want ' + want + ')'}`);

// MUTANT: a copy that signals whatever the verdict (a bare pid) must turn the table red
const src = fs.readFileSync(path.join(REPO, 'src/proc-identity.js'), 'utf8');
const mut = src.replace("if (verdict !== 'same') {", "if (false) {");
fs.writeFileSync(path.join(tmp, 'proc-identity-mutant.js'), mut);
const m = table(require(path.join(tmp, 'proc-identity-mutant.js')), 'mutant');
ok(mut !== src && m.bad.some(([n]) => n === 'signal recycled') && m.bad.some(([n]) => n === 'signals sent'), `CONTROL: a copy that kills on a bare pid is RED (${m.bad.map(([n]) => n).join(', ')})`);

// REAL: a live scratch sleep, its record stored with a WRONG starttime ⇒ no signal, one line; the right one ⇒ signalled
const child = spawn('sleep', ['30'], { stdio: 'ignore' });
const exited = new Promise((r) => child.on('exit', (code, s) => r(s)));
await new Promise((r) => setTimeout(r, 50));
const real = PI.identityOf(child.pid);
ok(real && real.starttime > 0 && real.bootId.length > 8, `identityOf a real sleep (pid ${child.pid}) → starttime ${real && real.starttime}, bootId ${real && real.bootId.slice(0, 8)}…`);
const said = [];
const wrong = PI.signalIdentity({ ...real, starttime: real.starttime - 1 }, 'SIGTERM', { say: (l) => said.push(l), what: 'scratch sleep' });
const older = PI.signalIdentity({ pid: real.pid }, 'SIGTERM', { say: (l) => said.push(l), what: 'scratch sleep' });
let alive = true; try { process.kill(child.pid, 0); } catch { alive = false; }
ok(wrong.why === 'pid-recycled' && older.why === 'unknown-identity' && alive, `a recycled-pid record and an older (no starttime) record: NOT signalled, the sleep lives (${wrong.why}, ${older.why}, alive=${alive})`);
console.log('    ' + said.join('\n    '));
ok(said.length === 2 && /pid-recycled, not signalled/.test(said[0]), 'the journal hears both refusals once');
const right = PI.signalIdentity(real, 'SIGTERM');
ok(right.ok && (await exited) === 'SIGTERM', `the true record is signalled and the sleep ends by SIGTERM (${JSON.stringify(right)})`);
ok(PI.signalIdentity(real, 'SIGTERM').ok === false, 'the same record after the exit: gone, nothing sent');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
