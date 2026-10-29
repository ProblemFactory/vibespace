#!/usr/bin/env node
// test-ci-gate-watchdog — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §12 a suite's own clock fires before the gate's and names its leg (scripts/suite-watchdog.mjs).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SUITES, EXCLUDED, censusFindings, listSuiteFiles, heavyBlocker, machineGlobalFixtures, defaultLockPath, killedFromOutside, OUTSIDE_SIGNALS, scratchOrphans, judgeScratch, liveScratchPaths, SCRATCH_ROOT_RE, REAP_NAMES, reapReport, reapByHand, scratchRootsOf, ROOT_ENV, argvScratchRoots, PRODUCT_ROOT_RE, FAST_DISQUALIFIERS, FAST_MAX_MS, fastRuleFindings, FAST_SUM_CAP_MS } from './ci.mjs';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, git, makeRepo, commit, STUB_SLICE, stubGateRepo, writeMarker, report } from './ci-gate-kit.mjs'; // the shared kit (lane fast-tier-ratchet: the gate is seven ≤ 10 s parts)

try {


// ── §12 A SUITE'S OWN CLOCK FIRES FIRST AND NAMES ITS LEG (lane suite-watchdog-census, 2026-10-15) ──
// rel281's mirror: test-voice-teach-chrome's own `setTimeout(() => { console.log('✗ TIMEOUT (300 s)'); end(1); }, 300e3)`
// ended the suite twice with that one line — its stdout stopped in ⑤, and the gate's hang report (§11) never ran: the
// row's budget is 900 s, the suite had exited at 300. THE TWO-CLOCK RULE: a suite's own deadline fires BEFORE the
// gate's (budget − margin), from inside (it can name its leg and read its own report), and the gate's clock stays the
// backstop for a main thread that cannot run a timer (busy / blocked — §11's /proc line). One shared clock,
// scripts/suite-watchdog.mjs; the gate tells the child its budget + where a report goes. The census: a timer that ends
// a suite with a failure IS that clock; no timer in a suite can only fire after its gate's budget; a cap fires first.
console.log('\n§12 a suite\'s own clock fires before the gate\'s and names its leg (scripts/suite-watchdog.mjs)');
{
  const WD = await import('./suite-watchdog.mjs');
  const CI = await import('./ci.mjs');
  // PURE: when it fires
  const B = WD.SUITE_BUDGET_ENV;
  const d900 = WD.watchdogDeadline({ env: { [B]: '900000' }, capMs: 300e3 }), dGate = WD.watchdogDeadline({ env: { [B]: '600000' } }), dHand = WD.watchdogDeadline({ env: {} });
  ok(d900.ms === 300000 && d900.capped && dGate.ms === 570000 && dGate.fromGate && !dGate.capped && dHand.ms === 270000 && !dHand.fromGate,
    `deadline = min(the suite's own cap, the gate's budget − 30 s): cap 300 s under 900 s ⇒ ${d900.ms / 1000} s; 600 s ⇒ ${dGate.ms / 1000} s; by hand (300 s) ⇒ ${dHand.ms / 1000} s`);
  const dLate = WD.watchdogDeadline({ env: { [B]: '600000' }, capMs: 25 * 60 * 1000 }), dShort = WD.watchdogDeadline({ env: { [B]: '3000' } });
  ok(dLate.ms === 570000 && !dLate.capped && dShort.ms === 2700 && WD.marginFor(3000) === 300 && WD.marginFor(900000) === 30000,
    `a cap at or past the gate's budget never wins (25 min under 600 s ⇒ ${dLate.ms / 1000} s); a short budget keeps a tenth (3 s ⇒ ${dShort.ms} ms)`);
  ok(['① Connect with Fish Audio', '\nⓐ two sessions'.trim(), '§12 a suite', '— §1 the fixed pool', '  ㉑ the scale'].every(WD.isSectionHeader) && !['  ✓ the card says 已连接', 'agent-browser (real binary)', '    (PNG x.png)', ''].some(WD.isSectionHeader),
    'a section header is what the suites already print: ① … ㊿ / ⓐ … / §N / — §N (a ✓ line, a note, a blank are not)');
  const wl = WD.watchdogLines({ elapsedMs: 300120, deadline: d900, section: '⑤ the context switch ⇒ the first-time preview', sectionMs: 251400, lastLine: '  ✓ the first dictation opens the PREVIEW', pending: ['CDP Page.captureScreenshot (250.9 s)'] });
  ok(wl[0] === "✗ WATCHDOG at 300.1 s (the suite's own ceiling; the gate's budget 900.0 s) — in ⑤ the context switch ⇒ the first-time preview, 251.4 s into it"
    && wl[1] === '  [watchdog] its last line: ✓ the first dictation opens the PREVIEW' && wl[2] === '  [watchdog] waiting on: CDP Page.captureScreenshot (250.9 s)',
    `the lines it says first: the section, how long in it, its last line, what it waits on — ${wl[0]}`);

  // THE CENSUS — every timer call in scripts/test-*.mjs (acorn at each `setTimeout(` / `setInterval(`; comments skipped)
  const acorn = createRequire(import.meta.url)('acorn');
  const MIN_SUITE_CLOCK_MS = 60000; // shorter = a leg's own bound (test-notify-retry's 20 s hot-loop guard names its leg)
  const num = (n) => !n ? NaN : n.type === 'Literal' && typeof n.value === 'number' ? n.value
    : n.type === 'BinaryExpression' ? ({ '*': (a, b) => a * b, '+': (a, b) => a + b, '-': (a, b) => a - b, '/': (a, b) => a / b }[n.operator] || (() => NaN))(num(n.left), num(n.right)) : NaN;
  const ENDS = /process\.exit\(\s*(?!0\s*\))[^)]|\b(?:end|finish|done|die|bail|fatal|quit|abort)\w*\(\s*[1-9]|process\.kill\(\s*process\.pid/;
  const lineAt = (src, i) => src.slice(src.lastIndexOf('\n', i) + 1, i);
  const timersOf = (src) => {
    const out = [], RE = /\bset(?:Timeout|Interval)\s*\(/g;
    for (let m; (m = RE.exec(src));) {
      if (src[m.index - 1] === '.' || /^\s*(?:\/\/|\*)/.test(lineAt(src, m.index))) continue;
      let n; try { n = acorn.parseExpressionAt(src, m.index, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { continue; }
      while (n && !(n.type === 'CallExpression' && n.callee.type === 'Identifier')) n = n.type === 'CallExpression' ? n.callee : n.type === 'MemberExpression' ? n.object : null;
      if (!n || n.arguments.length < 2) continue;
      const cb = n.arguments[0], fnCb = /Function/.test(cb.type);
      out.push({ at: m.index, line: src.slice(0, m.index).split('\n').length, ms: num(n.arguments[1]), delay: src.slice(n.arguments[1].start, n.arguments[1].end), ends: fnCb && ENDS.test(src.slice(cb.start, cb.end)) });
    }
    return out;
  };
  const armsOf = (src) => {
    const out = [], RE = /\barmWatchdog\s*\(/g;
    for (let m; (m = RE.exec(src));) {
      if (/^\s*(?:\/\/|\*)|\bfunction\s+$/.test(lineAt(src, m.index)) || /^export\s/.test(lineAt(src, m.index))) continue;
      let n; try { n = acorn.parseExpressionAt(src, m.index, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { continue; }
      const o = n.arguments && n.arguments[0], cap = o && o.type === 'ObjectExpression' ? o.properties.find((p) => p.key && p.key.name === 'capMs') : null;
      out.push({ at: m.index, line: src.slice(0, m.index).split('\n').length, capMs: cap ? num(cap.value) : 0 });
    }
    return out;
  };
  const rowOf = new Map(SUITES.map((s) => [s.name, s]));
  // a hit is judged only where it is CODE: the name tokens acorn's tokenizer sees (a planted line in a string — this
  // section's own controls, a child program's source — is text); tokenized only for a file with something to judge
  const codeAt = (src) => { const at = new Set(); try { for (const t of acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true })) if (t.type === acorn.tokTypes.name && /^(?:set(?:Timeout|Interval)|armWatchdog)$/.test(t.value)) at.add(t.start); } catch { return null; } return at; };
  const judge = (name, src) => {
    const row = rowOf.get(name), budget = row ? CI.budgetFor(row) : WD.DEFAULT_BUDGET_MS, last = budget - WD.marginFor(budget), reds = [];
    let code = null; const real = (h) => { code = code || codeAt(src); return !code || code.has(h.at); }; // a file acorn cannot read: every hit counts
    for (const t of timersOf(src).filter((h) => ((h.ends && !(h.ms < MIN_SUITE_CLOCK_MS)) || h.ms >= last) && real(h))) {
      if (t.ends && !(t.ms < MIN_SUITE_CLOCK_MS)) reds.push(`${name}:${t.line} a self-kill on its own clock (${t.delay}) — it names no leg; armWatchdog (scripts/suite-watchdog.mjs)`);
      else if (t.ms >= last) reds.push(`${name}:${t.line} a timer (${t.delay}) that can only fire at or after the gate's budget − margin (${last / 1000} s of ${budget / 1000} s)`);
    }
    const arms = armsOf(src).filter(real);
    for (const a of arms) if (a.capMs && !(a.capMs < last)) reds.push(`${name}:${a.line} armWatchdog capMs ${a.capMs} is not before the gate's budget − margin (${last} ms)`);
    return { reds, arms: arms.length, budget };
  };
  const census = listSuiteFiles(REPO).map((name) => ({ name, ...judge(name, fs.readFileSync(path.join(REPO, 'scripts', name + '.mjs'), 'utf-8')) }));
  const reds = census.flatMap((c) => c.reds), armed = census.filter((c) => c.arms).map((c) => `${c.name} (${c.budget / 1000} s)`);
  ok(census.length > 500 && !reds.length, `CENSUS: ${census.length} suites — no self-kill on its own clock, no timer past its gate's budget; armed: ${armed.join(', ')}${reds.length ? '\n      RED: ' + reds.join('\n      RED: ') : ''}`);
  ok(['test-voice-teach-chrome', 'test-voice-chrome', 'test-phone-composer-chrome', 'test-browser-resources'].every((n) => (census.find((c) => c.name === n) || {}).arms === 1),
    'the four suites that held their own clock (voice-teach 300 s, voice 240 s, phone-composer 150 s — rows of 900 s; browser-resources 25 min under a 600 s row) arm the shared one');
  const vt = fs.readFileSync(path.join(REPO, 'scripts', 'test-voice-teach-chrome.mjs'), 'utf-8');
  const OLD_VT = "setTimeout(() => { console.log('✗ TIMEOUT (300 s)'); end(1); }, 300e3).unref();";
  const planted = judge('test-voice-teach-chrome', vt.replace(/^armWatchdog\(.*$/m, OLD_VT)), late = judge('test-browser-resources', "const W = setTimeout(() => { reap(); process.exit(1); }, 25 * 60 * 1000);");
  ok(planted.reds.length === 1 && /self-kill on its own clock \(300e3\)/.test(planted.reds[0]) && late.reds.length === 1,
    `CONTROL (RED): rel281's line planted back into test-voice-teach-chrome ⇒ ${planted.reds[0]}; browser-resources' old 25-min one ⇒ red too`);
  const capLate = judge('test-voice-chrome', 'armWatchdog({ capMs: 900e3, exit: end });'), pastGate = judge('test-browser-resources', 'setTimeout(() => ch.kill("SIGKILL"), 590000);');
  ok(capLate.reds.length === 1 && /capMs 900000/.test(capLate.reds[0]) && pastGate.reds.length === 1 && /at or after the gate's budget/.test(pastGate.reds[0]),
    'CONTROL (RED): a cap that cannot fire before the gate (900 s on a 900 s row), a child-kill timer at 590 s on a 600 s row');

  // WIRING: the budget is ONE number (ci.mjs budgetFor) told to the child, with the report's path when the tier arms one
  const CISRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(CISRC.includes(`const env = { ...laneEnv(lane), ${WD.SUITE_BUDGET_ENV}: String(budgetFor(s)) };`) && CISRC.includes(`if (hr.armed) env.${WD.SUITE_HANG_ENV} = hr.file; else delete env.${WD.SUITE_HANG_ENV};`) && /\{ cwd: root, stdio: \['ignore', 'pipe', 'pipe'\], env \}\);/.test(CISRC),
    `WIRING: runSuiteAsync tells every suite ${WD.SUITE_BUDGET_ENV} (budgetFor) and ${WD.SUITE_HANG_ENV} (or removes an outer run's)`);

  // REAL: a planted hang through the gate's own runner — the NEW clock and rel281's OLD one, at once, under a 4 s row
  const root = mktmp('watchdog'), hangDir = path.join(root, 'fail-logs'), sha = 'fedcba9876543210';
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  for (const f of ['suite-watchdog.mjs', 'hang-report.mjs']) fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(root, 'scripts', f));
  const SHAPES = [['sk', 'ant'].join('-'), 'xo' + 'xb-'], tokens = SHAPES.map((x, i) => x + 'planted' + i + 'Q'.repeat(24)).join(' ');
  const body = `process.env.VS_PLANTED_TOKENS = ${JSON.stringify(tokens)};
console.log('① planted: a leg that passes');
console.log('  ✓ the first leg');
console.log('② planted: an until that never resolves');
console.log('  · waiting for an answer nobody sends');
setInterval(() => {}, 1000);
await new Promise(() => {});
`;
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-watchdog.mjs'), `import { armWatchdog } from './suite-watchdog.mjs';\narmWatchdog({ pending: () => ['the planted answer'] });\n` + body);
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-selfkill.mjs'), `setTimeout(() => { console.log('✗ TIMEOUT (3 s)'); process.exit(1); }, 3000).unref();\n` + body);
  const row = (name) => ({ name, tier: 'fast', budgetMs: 4000 });
  const [nw, old] = await Promise.all([
    CI.runSuiteAsync(row('test-planted-watchdog'), { root, sha, lane: 1, hang: { dir: hangDir, attempt: 1 } }),
    CI.runSuiteAsync(row('test-planted-selfkill'), { root, sha, lane: 2, hang: { dir: hangDir, attempt: 1 } }),
  ]);
  const file = path.join(hangDir, 'fedcba98.test-planted-watchdog.1.hang.json'), tail = nw.lines[1] || '';
  console.log([nw.lines[0].trim(), ...tail.split('\n').filter((l) => /WATCHDOG|\[watchdog\]|\[hang\]/.test(l))].map((l) => '      ' + l).join('\n'));
  ok(!nw.ok && nw.ms < 4000 && !/ETIMEDOUT|SIGUSR2|SIGTERM/.test(nw.lines[0]) && nw.lines[0].trim().split('\n')[0].endsWith(` — hang report (the suite's own watchdog): ${file}`) && nw.hangReport === file,
    `the planted hang ends at ITS clock (${nw.ms} ms of a 4 s row, exit 1 — the gate never asked, no SIGUSR2) and the ✗ row names the report the suite wrote`);
  ok(/✗ WATCHDOG at 3\.\d s \(the gate's budget 4\.0 s − 0\.4 s\) — in ② planted: an until that never resolves, \d\.\d s into it/.test(tail) && tail.includes('[watchdog] its last line: · waiting for an answer nobody sends') && tail.includes('[watchdog] waiting on: the planted answer'),
    'its output ends with the leg it was in (②, not the first leg), its last line, and what it waited on');
  ok(/\[hang\] JS main: idle at the watchdog/.test(tail) && /\[hang\] handles holding the loop: timer ×1 —/.test(tail) && tail.includes(`[watchdog] report: ${file}`),
    '…then the gate\'s own digest (hang-report.mjs) over its in-process report: the loop idle, the interval holding it');
  const rep = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  ok(rep && JSON.parse(rep).libuv && !rep.includes('environmentVariables') && !SHAPES.some((x) => rep.includes(x)) && !rep.includes('networkInterfaces'),
    'the report it wrote is whole, with no environment (no planted token shape) and no network interfaces');
  ok(!old.ok && /✗ TIMEOUT \(3 s\)/.test(old.lines[1] || '') && !/WATCHDOG|\[hang\]|hang report/.test(old.lines.join('\n')) && !fs.existsSync(path.join(hangDir, 'fedcba98.test-planted-selfkill.1.hang.json')),
    'CONTROL (RED): rel281\'s shape — a self-kill on the suite\'s own clock — says `✗ TIMEOUT (3 s)` and nothing else: no leg, no digest, no report');
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
