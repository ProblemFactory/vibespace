#!/usr/bin/env node
// THE HOT-SWITCH VERDICT, RE-MEASURED ON THE INSTALLED CLI (heavy; lane-hot-switch).
//
// `capsOf('claude').hotSwitch === 'verified'` decides whether the pool may move a
// RUNNING conversation by re-pointing its credential link (every reader in the
// engine and ws-create asks exactly that). It is a measurement, dated and pinned
// to a CLI version (`hotSwitchEvidence`), and a CLI upgrade can take it away —
// so this gate runs the measurement (scripts/measure-claude-cred-read.mjs: the
// real binary, fake credentials, a loopback mock, a loopback-only network
// namespace) against WHATEVER claude is installed and judges three variants:
//   symlink       the pool's own move ⇒ the next turn MUST bill the new member
//                 (else 'verified' is false on this CLI: RED, with what it saw)
//   hardlink-same an equal-mtime replacement ⇒ the recorded blind spot; if the
//                 CLI now sees it, the record is stale (said, not red)
//   baseline      no change ⇒ the same member (the mock itself is sane)
// A different installed version that behaves the same is GREEN and says the
// evidence can be re-pinned. No sudo / strace / claude on this machine ⇒ SKIP
// with the reason (the measurement refuses rather than reach the network).
//
// ci-344-reds: a measurement that could not RUN is UNMEASURED, never a verdict. The
// 2.369.344 runner's belt killed the CLI at its first off-loopback connect (a DNS
// lookup of api.anthropic.com to the runner's resolver, 168.63.129.16:53 = ENETUNREACH
// inside the namespace) — every step said ABORTED with no account, and this gate read
// that as "the CLI kept [] after the link moved" ⇒ hotSwitch must not say 'verified'.
// Now: exit 3 / a record carrying `aborted` / every step ABORTED / no step answered and
// the network refused ⇒ ONE SKIP line naming the reason; the verdict path is unchanged.
// And the measurement pins the host's resolver ON lo inside its own namespace (so the
// runner measures again); the namespace stays CLOSED — an open one is RED, never a skip.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skip = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const ev = capsOf('claude').hotSwitchEvidence;

/** PURE: did the run MEASURE anything? → { open } (the namespace had a way out: RED) | { refused } (cannot run here)
 *  | { unmeasured } (ran, measured nothing) | { rec }. */
function measuredOf(r, rec) {
  const err = String(r.stderr || '');
  if (r.status === 2 && /REFUSED: not in a loopback-only namespace/.test(err)) return { open: (/REFUSED: not in a loopback-only namespace[^\n]*/.exec(err) || [''])[0] };
  if (r.status === 2 && /REFUSED/.test(err)) return { refused: err.trim().split('\n').pop() };
  const steps = ((rec && rec.results) || []).flatMap((x) => x.steps || []);
  const answered = steps.some((s) => s.result && typeof s.result === 'object');
  const aborted = (rec && rec.aborted) || [];
  const netRefused = /ENETUNREACH|EAI_AGAIN/.test(err);
  if (r.status === 3 || aborted.length || (steps.length && steps.every((s) => s.result === 'ABORTED')) || (!answered && netRefused)) {
    const first = aborted[0] || null;
    const where = first ? `${first.variant}: ${first.connect} = ${first.result}` : ((/ABORTED: [^\n]*/.exec(err) || /[^\n]*(?:ENETUNREACH|EAI_AGAIN)[^\n]*/.exec(err) || [`exit ${r.status}`])[0]).slice(0, 240);
    const dns = first ? /:53$/.test(first.connect) : /:53 = /.test(err);
    return { unmeasured: `the CLI's first off-loopback connect${dns ? ' (a DNS lookup — the resolver is not loopback here)' : ''} was refused inside the namespace and the measurement ABORTED before any turn was judged — ${where}` };
  }
  return { rec };
}

/** The namespace a record ran in stayed closed: the real CLI ran in it, and every resolver it could ask is an address ON lo. */
const isLo = (a, lo) => { const x = String(a).replace(/^::ffff:/i, ''); return /^127\./.test(x) || x === '::1' || (lo || []).includes(x); };
const closedOf = (rec) => rec.netns === true && Array.isArray(rec.resolver) && rec.resolver.every((a) => isLo(a, rec.loAddrs));

/** The verdict over a record that RAN — [name, holds, detail] rows (the shipped judgement, unchanged). */
function verdictRows(rec) {
  const v = Object.fromEntries(rec.results.map((x) => [x.variant, x]));
  const msg2 = (name) => (v[name]?.steps || []).find((s) => s.step === 'msg2')?.accts || [];
  const msg1 = (name) => (v[name]?.steps || []).find((s) => s.step === 'msg1')?.accts || [];
  const blind = msg2('hardlink-same').every((a) => a === 'A:200');
  return {
    blind,
    rows: [
      ['baseline: no change ⇒ the same member both turns (the mock and the probe are sane)',
        msg1('baseline').every((a) => a === 'A:200') && msg2('baseline').length > 0 && msg2('baseline').every((a) => a === 'A:200'), JSON.stringify(v.baseline?.steps)],
      [`THE VERDICT on ${rec.cli}: after the pool's own re-point the NEXT turn bills the new member — hotSwitch 'verified' holds`,
        msg2('symlink').length > 0 && msg2('symlink').every((a) => a === 'B:200'),
        `the CLI kept ${JSON.stringify(msg2('symlink'))} after the link moved — capsOf('claude').hotSwitch must NOT say 'verified' on this CLI (re-declare it, and the pool's wall path restarts instead)`],
      ['the OTel organization.id is the machine-wide label for both tokens (never the billed account)',
        (v.symlink?.otel || []).every((o) => o.org === (v.symlink.otel[0] || {}).org), JSON.stringify(v.symlink?.otel)],
    ],
  };
}

ok('the claude row carries its measurement', !!ev && !!ev.cli && !!ev.record && fs.existsSync(path.join(REPO, ev.record)), JSON.stringify(ev));

// ── CONTROLS (no CLI needed): the skip road and the verdict road, fed fake records ──
{
  const step = (name, accts, result) => ({ step: name, result: result || { subtype: 'success', is_error: false, text: 'ok' }, accts, orgHeaders: [] });
  const ran = (variant, a1, a2) => ({ variant, steps: [step('msg1', a1), { ...step('msg2', a2), change: variant, gapMs: 3000 }], otel: [{ phase: 'after-change', event: 'api_request', org: 'eeee' }] });
  const good = { cli: '9.9.9 (Claude Code)', results: [ran('baseline', ['A:200'], ['A:200']), ran('symlink', ['A:200'], ['B:200']), ran('hardlink-same', ['A:200'], ['A:200'])] };
  // the 2.369.344 runner's record, as it came back (run 39925587509, shard 5)
  const abortedSteps = [{ step: 'msg1', result: 'ABORTED', accts: [], orgHeaders: [] }, { step: 'msg2', change: 'none', gapMs: 3000, result: 'ABORTED', accts: [], orgHeaders: [] }];
  const runnerRec = { cli: '2.1.309 (Claude Code)', aborted: [{ variant: 'baseline', connect: '168.63.129.16:53', result: '-1 ENETUNREACH (Network is unreachable)' }], results: [{ variant: 'baseline', steps: abortedSteps }] };
  const runnerErr = 'ABORTED: the CLI connect()ed off loopback inside the namespace (the namespace refused it — check it anyway) — baseline: 168.63.129.16:53 = -1 ENETUNREACH (Network is unreachable)';
  const u = measuredOf({ status: 3, stderr: runnerErr }, runnerRec);
  ok('CONTROL: the runner\'s ABORTED record (exit 3, every step ABORTED, accts []) takes the SKIP road — unmeasured, never a verdict', !!u.unmeasured && !u.rec && /168\.63\.129\.16:53/.test(u.unmeasured) && /DNS lookup/.test(u.unmeasured), JSON.stringify(u));
  ok('…each signal alone says unmeasured: exit 3 / a record carrying `aborted` / every step ABORTED / no step answered + ENETUNREACH or EAI_AGAIN',
    !!measuredOf({ status: 3, stderr: '' }, null).unmeasured
    && !!measuredOf({ status: 0, stderr: '' }, { ...runnerRec, results: [] }).unmeasured
    && !!measuredOf({ status: 0, stderr: '' }, { cli: 'x', results: [{ variant: 'baseline', steps: abortedSteps }] }).unmeasured
    && !!measuredOf({ status: 1, stderr: 'getaddrinfo EAI_AGAIN api.example.invalid' }, null).unmeasured
    && !!measuredOf({ status: 1, stderr: 'connect ENETUNREACH' }, { cli: 'x', results: [{ variant: 'baseline', steps: [{ step: 'msg1', result: 'EXITED', accts: [] }] }] }).unmeasured);
  ok('…a REFUSED run (no sudo / strace / claude) stays the cannot-run SKIP', !!measuredOf({ status: 2, stderr: 'REFUSED: needs strace\n' }, null).refused);
  const g = measuredOf({ status: 0, stderr: '[measure] event (symlink) mock socket ECONNRESET: x\nENETUNREACH in a CLI stderr tail\n' }, good);
  ok('CONTROL: a record that RAN still goes to the verdict (a stray network word in stderr never erases a measured turn)', !!g.rec && !g.unmeasured, JSON.stringify(g).slice(0, 200));
  const gv = verdictRows(good);
  ok('…and the verdict holds on it (baseline A/A, symlink A→B, the blind spot still blind)', gv.rows.every(([, c]) => c) && gv.blind, JSON.stringify(gv.rows.map(([n, c]) => [n.slice(0, 40), c])));
  const kept = { ...good, results: [ran('baseline', ['A:200'], ['A:200']), ran('symlink', ['A:200'], ['A:200']), ran('hardlink-same', ['A:200'], ['A:200'])] };
  const kv = verdictRows(kept);
  ok('NEGATIVE CONTROL: a CLI that RAN and kept A after the link moved is still RED on THE VERDICT (the skip road did not swallow the real failure)',
    !!measuredOf({ status: 0, stderr: '' }, kept).rec && kv.rows[1][1] === false && kv.rows[0][1] === true, JSON.stringify(kv.rows.map(([, c]) => c)));
  ok('CONTROL: an OPEN namespace (the inner rung saw a link besides lo) is RED, never the cannot-run skip',
    !!measuredOf({ status: 2, stderr: 'REFUSED: not in a loopback-only namespace\n' }, null).open && !measuredOf({ status: 2, stderr: 'REFUSED: not in a loopback-only namespace\n' }, null).refused);
  ok('CONTROL: the resolver pinned ON lo is a closed namespace (the runner\'s 168.63.129.16 as a lo address)', closedOf({ netns: true, resolver: ['168.63.129.16'], loAddrs: ['127.0.0.1', '168.63.129.16', '::1'] }) && closedOf({ netns: true, resolver: ['127.0.0.53'], loAddrs: ['127.0.0.1'] }));
  ok('NEGATIVE CONTROL: a resolver NOT on lo (a route to a real DNS), or a run outside the namespace, is not closed',
    !closedOf({ netns: true, resolver: ['168.63.129.16'], loAddrs: ['127.0.0.1', '::1'] }) && !closedOf({ netns: false, resolver: ['127.0.0.53'], loAddrs: [] }) && !closedOf({ netns: true, loAddrs: ['127.0.0.1'] }));
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hotsw-gate-'));
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
const out = path.join(dir, 'measure.json');
const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/measure-claude-cred-read.mjs'), '--variant', 'baseline,symlink,hardlink-same', '--gap', '3000', '--out', out], { encoding: 'utf8', timeout: 8 * 60e3, env: { ...process.env } });
let rec0 = null;
try { rec0 = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { }
const m = measuredOf(r, rec0);
if (m.open) {
  ok('the measurement\'s namespace is closed (lo only) — the real CLI never runs with a way out', false, m.open);
} else if (m.refused) {
  skip++;
  console.log('  SKIP: the measurement cannot run here — ' + m.refused);
} else if (m.unmeasured) {
  skip++;
  console.log(`  SKIP: unmeasured — ${m.unmeasured}`);
  console.log(`  (installed ${(rec0 && rec0.cli) || '?'}; the caps row pins ${ev && ev.cli} — not measured on this run, so not evidence either way)`);
} else {
  const rec = m.rec;
  ok('the measurement ran', r.status === 0 && !!rec, `exit ${r.status}: ${String(r.stderr || '').slice(-400)}`);
  if (rec) {
    console.log(`  (installed ${rec.cli}; the caps row pins ${ev && ev.cli})`);
    const { rows, blind } = verdictRows(rec);
    ok(...rows[0]);
    ok(...rows[1]);
    console.log(`  (the recorded blind spot — an equal-mtime replacement is ${blind ? 'still NOT' : 'NOW'} seen by ${rec.cli}${blind ? '' : ': update the evidence record'})`);
    ok(...rows[2]);
    ok('the namespace stayed closed: the real CLI ran in it and every resolver it could ask is an address ON lo (no route to a real DNS)', closedOf(rec), JSON.stringify({ netns: rec.netns, resolver: rec.resolver, loAddrs: rec.loAddrs }));
    if (ev && rec.cli && !String(rec.cli).startsWith(ev.cli)) console.log(`  NOTE: installed ${rec.cli} measured the same as the pinned ${ev.cli} — re-pin hotSwitchEvidence (cli/measuredAt/record) when convenient`);
  }
}
console.log(fail ? `${fail} FAILED (${pass} passed${skip ? `, ${skip} skipped` : ''})` : `ALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
