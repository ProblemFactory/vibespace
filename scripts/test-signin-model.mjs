#!/usr/bin/env node
// test-signin-model — the humane Claude sign-in's PURE model (lane door-signin-card):
//  ① signinStep reads a RECORDED 2.1.30x subscription-login screen (a fake claude's
//     transcript: an OSC-8 hyperlink, ESC[nC cursor-move spacing, a URL wrapped across a
//     narrow write with a bare CRLF, every line \r\r\n) and yields url → code-prompt →
//     connected — fed in CHUNKS split mid-URL and mid-success-line;
//  ② the URL is NEVER emitted before the blank line after it arrives (no half URL);
//  ③ an error screen yields {kind:'error'} with the CLI's line (redacted, ≤300);
//  ④ signinCardView maps every phase to the brief's five states (no-login / url-shown /
//     waiting-code / connected / failed+why) with canResend + submitting;
//  ⑤ codeVerdict (empty / control-char / ok); publicSignin is a WHITELIST (no scratch
//     path / pty / parse leaks); signinShowVerdict (stale / older-run / show).
//  ⑥ (lane door-signin-fixes) the last line is cut at the code prompt; the fixed sentence of a
//     silent death after a code; the card's «why» masks what followed the prompt; signinWallOf.
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require(path.join(ROOT, 'src/signin-model.js'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 400)); } };

const ESC = '\x1b';
const URL = 'https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=deadbeefcafe';
const URL_a = URL.slice(0, 72), URL_b = URL.slice(72);
// the real screen, modeled on the measured 2.1.296 shape (oat-mint-model header) +
// VibeSpace's helper success line; owner-run against a real 2.1.30x login confirms it.
const S_HEAD = 'Browser didn’t open? Use the url below to sign in (c to copy):\r\r\n\r\r\n';
const S_URL = ESC + ']8;;' + URL + '\x07' + URL_a + '\r\r\n' + URL_b + ESC + ']8;;\x07' + '\r\r\n'; // the hyperlink, text wrapped
const S_BLANK = '\r\r\n';
const S_PROMPT = 'Paste' + ESC + '[2C' + 'code here if prompted >' + ESC + '[1C';
const S_OK = '\r\r\nVibeSpace: subscription credentials saved.\r\r\n';
const S_ERR = '\r\r\nOAuth error: the code you pasted was rejected (state mismatch)\r\r\n';

function run(chunks) {
  let st = M.initialSigninParse(); const steps = []; let last = '';
  for (const c of chunks) { const r = M.signinStep(st, c, {}); st = r.state; last = r.lastLine; for (const s of r.steps) steps.push(s); }
  return { steps, last };
}

// ① the whole screen, fed in chunks split mid-URL and mid-success-line
{
  const whole = S_HEAD + S_URL + S_BLANK + S_PROMPT;
  const cut = S_HEAD.length + 40; // mid-URL
  const r = run([whole.slice(0, cut), whole.slice(cut), S_OK.slice(0, 20), S_OK.slice(20)]);
  const kinds = r.steps.map((s) => s.kind);
  ok(kinds.filter((k) => k === 'url').length === 1, '① exactly one url step', kinds);
  const urlStep = r.steps.find((s) => s.kind === 'url');
  ok(urlStep && urlStep.url === URL, '① the url is rejoined whole across the wrap', urlStep && urlStep.url);
  ok(kinds.includes('code-prompt'), '① code-prompt seen (ESC-spaced "Paste  code here")', kinds);
  ok(kinds.filter((k) => k === 'connected').length === 1, '① one connected step on the saved line', kinds);
  ok(kinds.indexOf('url') < kinds.indexOf('connected'), '① order: url before connected', kinds);
}

// ② no half URL: the URL line arrived but not the blank line after it → no url yet
{
  const r = run([S_HEAD + S_URL]); // no trailing blank line
  ok(!r.steps.some((s) => s.kind === 'url'), '② url withheld until the line after it arrives', r.steps.map((s) => s.kind));
  const r2 = M.signinStep(M.signinStep(M.initialSigninParse(), S_HEAD + S_URL, {}).state, S_BLANK, {});
  ok(r2.steps.some((s) => s.kind === 'url' && s.url === URL), '② url emitted once the blank line lands', r2.steps);
}

// ③ an error screen
{
  const r = run([S_HEAD + S_ERR]);
  const e = r.steps.find((s) => s.kind === 'error');
  ok(e && /OAuth error/.test(e.line), '③ error step carries the CLI line', e);
  ok(!r.steps.some((s) => s.kind === 'connected'), '③ no connected on an error screen', r.steps.map((s) => s.kind));
  ok(e && e.line.length <= 300, '③ error line ≤ 300', e && e.line.length);
}

// ④ signinCardView — the five states
{
  ok(M.signinCardView({ phase: 'starting' }).state === 'no-login', '④ starting → no-login');
  ok(M.signinCardView({ phase: 'url', url: URL }).state === 'url-shown', '④ url → url-shown');
  const wc = M.signinCardView({ phase: 'waiting-code', url: URL });
  ok(wc.state === 'waiting-code' && wc.submitting === false, '④ waiting-code (not submitting)', wc);
  const cn = M.signinCardView({ phase: 'connecting', url: URL });
  ok(cn.state === 'waiting-code' && cn.submitting === true, '④ connecting → waiting-code submitting', cn);
  const done = M.signinCardView({ phase: 'connected', email: 'a@b.co' }, { hasWaiting: true });
  ok(done.state === 'connected' && done.canResend === true && done.email === 'a@b.co', '④ connected + canResend + email', done);
  ok(M.signinCardView({ phase: 'connected' }, { hasWaiting: false }).canResend === false, '④ connected, nothing waiting → no resend');
  const fail = M.signinCardView({ phase: 'failed', error: 'OAuth error: nope' });
  ok(fail.state === 'failed' && fail.why === 'OAuth error: nope', '④ failed carries why', fail);
  ok(M.signinCardView({ phase: 'url' }).state === 'no-login', '④ url with no url string → no-login (never a blank link)');
}

// ⑤ codeVerdict / publicSignin / signinShowVerdict
{
  ok(M.codeVerdict('').ok === false && M.codeVerdict('').code === 'empty_code', '⑤ empty code refused');
  ok(M.codeVerdict('abc\x00def').ok === false, '⑤ control char refused');
  const cv = M.codeVerdict('  abc#state  ');
  ok(cv.ok === true && cv.code === 'abc#state', '⑤ a real code trimmed + accepted', cv);

  const internal = { id: 'si-1', accountId: 'acc-9', phase: 'waiting-code', url: URL, email: 'me@x.io', error: null, rev: 3, startedAt: 100, endedAt: null, pty: {}, dir: '/tmp/vs-oat-xyz/secret', parse: { raw: 'SECRET' } };
  const pub = M.publicSignin(internal);
  ok(!('dir' in pub) && !('pty' in pub) && !('parse' in pub), '⑤ publicSignin drops pty/dir/parse', Object.keys(pub));
  ok(pub.url === URL && pub.email === 'me@x.io' && pub.phase === 'waiting-code' && pub.rev === 3, '⑤ publicSignin keeps the whitelist', pub);
  ok(JSON.stringify(pub).indexOf('secret') < 0 && JSON.stringify(pub).indexOf('SECRET') < 0, '⑤ no scratch path / raw leaks');

  const shown = { id: 'si-1', phase: 'waiting-code', rev: 5, startedAt: 100 };
  ok(M.signinShowVerdict(shown, { id: 'si-1', rev: 4, startedAt: 100 }) === 'stale', '⑤ same run, older rev → stale');
  ok(M.signinShowVerdict(shown, { id: 'si-0', rev: 1, startedAt: 50 }) === 'older-run', '⑤ an older run’s echo → older-run');
  ok(M.signinShowVerdict(shown, { id: 'si-1', rev: 6, startedAt: 100 }) === 'show', '⑤ a newer rev → show');
}

// ⑥ THE VERIFY ROUND (lane door-signin-fixes): what a failure may say, and which wall a chat gets
{
  const CODE = 'zq7Lk9#stateXYZ';
  const typed = S_HEAD + S_URL + S_BLANK + S_PROMPT + CODE + '\r\r\n';
  const r = M.signinStep(M.initialSigninParse(), typed);
  ok(typeof M.cutAtPrompt === 'function' && r.lastLine.indexOf(CODE) < 0 && !/paste\s+code/i.test(r.lastLine), '⑥ the last line is CUT at the code prompt — an echoed code never becomes a «why»', r.lastLine);
  ok(M.cutAtPrompt && M.cutAtPrompt('OAuth error: x') === 'OAuth error: x' && M.cutAtPrompt('Paste code here if prompted > ' + CODE) === '', '⑥ cutAtPrompt keeps a line with no prompt, drops the prompt and what follows it');
  ok(/ended before Claude confirmed it/.test(M.ENDED_AFTER_CODE || ''), '⑥ the fixed sentence a silent death after a code says', M.ENDED_AFTER_CODE);
  const v = M.signinCardView({ phase: 'failed', error: 'Paste code here if prompted > ' + CODE });
  ok(v.state === 'failed' && v.why.indexOf(CODE) < 0, '⑥ the card’s «why» never shows what followed the prompt (redact gained the prompt shape)', v);
  ok(M.signinWallOf && M.signinWallOf({ oauthSubscription: true }) === 'card', '⑥ signinWallOf: a LOCAL conversation of the harness whose subscriptions the card signs in (its oauthUsage row) → the card');
  ok(M.signinWallOf && M.signinWallOf({ oauthSubscription: false }) === 'terminal' && M.signinWallOf({ oauthSubscription: true, host: 'h1' }) === 'terminal' && M.signinWallOf({}) === 'terminal', '⑥ signinWallOf: another harness (no such row) / a remote host / no facts → the terminal road');
  const CAPS = require(path.join(ROOT, 'src/backend-caps.js'));
  ok(CAPS.capsOf('claude').oauthUsage === true && CAPS.capsOf('codex').oauthUsage !== true && CAPS.capsOf('opencode').oauthUsage !== true, '⑥ the declared row today: claude’s subscriptions are the card’s, codex / opencode keep the terminal road');
}

console.log(`\ntest-signin-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
