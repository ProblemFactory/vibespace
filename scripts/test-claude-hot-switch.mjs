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

ok('the claude row carries its measurement', !!ev && !!ev.cli && !!ev.record && fs.existsSync(path.join(REPO, ev.record)), JSON.stringify(ev));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hotsw-gate-'));
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
const out = path.join(dir, 'measure.json');
const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/measure-claude-cred-read.mjs'), '--variant', 'baseline,symlink,hardlink-same', '--gap', '3000', '--out', out], { encoding: 'utf8', timeout: 8 * 60e3, env: { ...process.env } });
if (r.status === 2 && /REFUSED/.test(r.stderr || '')) {
  skip++;
  console.log('  SKIP: the measurement cannot run here — ' + String(r.stderr).trim().split('\n').pop());
} else {
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { }
  ok('the measurement ran', r.status === 0 && !!rec, `exit ${r.status}: ${String(r.stderr || '').slice(-400)}`);
  if (rec) {
    const v = Object.fromEntries(rec.results.map((x) => [x.variant, x]));
    const msg2 = (name) => (v[name]?.steps || []).find((s) => s.step === 'msg2')?.accts || [];
    const msg1 = (name) => (v[name]?.steps || []).find((s) => s.step === 'msg1')?.accts || [];
    console.log(`  (installed ${rec.cli}; the caps row pins ${ev && ev.cli})`);
    ok('baseline: no change ⇒ the same member both turns (the mock and the probe are sane)',
      msg1('baseline').every((a) => a === 'A:200') && msg2('baseline').length > 0 && msg2('baseline').every((a) => a === 'A:200'), JSON.stringify(v.baseline?.steps));
    ok(`THE VERDICT on ${rec.cli}: after the pool's own re-point the NEXT turn bills the new member — hotSwitch 'verified' holds`,
      msg2('symlink').length > 0 && msg2('symlink').every((a) => a === 'B:200'),
      `the CLI kept ${JSON.stringify(msg2('symlink'))} after the link moved — capsOf('claude').hotSwitch must NOT say 'verified' on this CLI (re-declare it, and the pool's wall path restarts instead)`);
    const blind = msg2('hardlink-same').every((a) => a === 'A:200');
    console.log(`  (the recorded blind spot — an equal-mtime replacement is ${blind ? 'still NOT' : 'NOW'} seen by ${rec.cli}${blind ? '' : ': update the evidence record'})`);
    ok('the OTel organization.id is the machine-wide label for both tokens (never the billed account)',
      (v.symlink?.otel || []).every((o) => o.org === (v.symlink.otel[0] || {}).org), JSON.stringify(v.symlink?.otel));
    if (ev && rec.cli && !String(rec.cli).startsWith(ev.cli)) console.log(`  NOTE: installed ${rec.cli} measured the same as the pinned ${ev.cli} — re-pin hotSwitchEvidence (cli/measuredAt/record) when convenient`);
  }
}
console.log(fail ? `${fail} FAILED (${pass} passed${skip ? `, ${skip} skipped` : ''})` : `ALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
