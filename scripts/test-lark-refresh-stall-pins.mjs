#!/usr/bin/env node
// THE LARK REFRESH STALL — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from
// the heavy scripts/test-lark-refresh-stall.mjs, whose bounded-fetch drives, the For-you store, the dictionaries' vendor census
// and the engine landings stay there: the refresh and the code exchange carry the live bound, the For-you line words its cause
// through one rule, the producer's refused-shape sentence, the re-authorize dialog's reconnect read and Escape / close seams.
// Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-lark-refresh-stall-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

console.log('\n② R1: the refresh is bounded by LIVE loop time, never by a timer that came due across a hold');
{
  const src = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf-8');
  const refresh = src.slice(src.indexOf('  async function refreshAccessToken('), src.indexOf('  function bearerNow('));
  ok(/what: 'lark token refresh', liveMs: REFRESH_BOUND_MS,/.test(refresh) && !/AbortSignal\.timeout/.test(refresh), 'the refresh POST carries the live bound and no AbortSignal.timeout');
  ok(/method: 'POST', what: 'lark token exchange', liveMs: REFRESH_BOUND_MS,/.test(src), 'r2: the consent\'s code exchange carries the same live bound (① X proves it across the hold)');
}

console.log('\n⑤ R4: the words name the MEASURED stall');
{
  const acts = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf-8');
  const lay = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-layout.js'), 'utf-8');   // int361 (主开发's seam): the rule lives in owner-press-attended's ONE renderer, saidLine
  ok(acts.includes('const said = (l) => saidLine(l, t') && lay.includes("if (typeof v.key === 'string') return t(v.key, v.params || undefined);"), 'the For-you renderer (`said` → saidLine) fills a words-param with its own params — the rule this suite renders by');

  // the producer files its words WITHOUT a refused shape (never a literal on the screen) — its store refusal is said
  const eng0 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  ok(/the For-you store refused the dead sign-in's cause words/.test(eng0) && /it = fileWith\(false\)/.test(eng0), 'r2: the producer (speakSignin) says a refusal in the log and files the item without the refused words');
}

console.log('\n⑥ R5: a consent that lands on a dead sign-in is «signed in — verifying» until its first request answers');
{
  // the re-authorize dialog: a landing missed while the socket was down is read ONCE on reconnect; Escape on a running
  // sign-in asks first (the dialog-yield seam) — source facts here, the chrome leg in test-integrations-ui (l)
  const dlg = fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf-8');
  ok(/app\.ws\.onStateChange\(onState\)/.test(dlg) && /fetchJson\('\/api\/channels\?scope=accounts'\)\.then\(\(d\) => \{ if \(d && Array\.isArray\(d\.adapters\)\) judge/.test(dlg), 'r2: the dialog\'s watcher re-reads the account ONCE on every reconnect (a landing broadcast missed while the socket was down)');
  const md = fs.readFileSync(path.join(REPO, 'src/lib/mounts-dialog.js'), 'utf-8');
  ok(/escapeToClose: true, onEscape: \(\) => escapeAsk\(\) \}\)/.test(md) && /tr\('Cancel the sign-in\?'\)/.test(md) && /askFirst: showConfirmDialog/.test(dlg), 'r2: the re-authorize dialog\'s Escape on a RUNNING sign-in asks «Cancel the sign-in?» (onEscape, the OAT shape)');
  ok(/onClose: closed, escapeToClose: true/.test(md) && /onClose: \(\) => \{ closed = true; if \(watcher\) \{ watcher\.off\(\); watcher = null; \} \}/.test(dlg), 'r3: every close of the dialog (✕, backdrop, Escape, its finish) tears its watcher down — the chrome count in test-integrations-ui (r)');
  // r4 (acceptance r3): a watcher its start makes AFTER the close (✕ while the reauthorize POST waits) is taken at once, and
  // the dialog shows no consent page for a close during its start; `poll` / `stopPoll` stand BEFORE the shell handed `closed`
  // (the dialog-yield seam: a raised form's end runs it early)
  ok(/watcher = authWatcher\(app, a\.id, [^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(closed\) \{ watcher\.off\(\); watcher = null; \}/.test(dlg) && /const promise = start\(/.test(md) && /const r = await promise;[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(gone\(\)\) \{ if \(typeof cancel === 'function'\)/.test(md) && /const gone = \(\) => !status\.isConnected/.test(md),   // lane gmail-connect-wall r4: the start's answer is awaited as `promise` (the press in flight is recorded first) and the close check is `gone()` (disconnected, or — live — closed); the same law
    'r4: a close while «Preparing authorization…» takes the watcher made after it, opens no consent page and cancels the consent — the chrome count in test-integrations-ui (r)');
  const rd = md.slice(md.indexOf('export function reauthDialog('), md.indexOf('\nexport ', md.indexOf('export function reauthDialog(') + 1));
  const iStop = rd.indexOf('const stopPoll = () =>'), iShell = rd.indexOf('createModalShell(');
  ok(iStop > 0 && iShell > iStop && rd.indexOf('const stopPoll = () =>', iStop + 1) < 0 && rd.indexOf('createModalShell(', iShell + 1) < 0, `r4: reauthDialog declares \`poll\` / \`stopPoll\` ONCE, before its createModalShell call that is handed \`closed\` (stopPoll at ${iStop}, the shell at ${iShell} of its body)`);
}

console.log(`\n${fail ? `FAILED (${pass} passed, ${fail} failed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
