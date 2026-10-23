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

// ② no half URL (lane signin-card-real-screen: the rule is «never half a link», not «a blank line after it»):
//    the VISIBLE text is withheld until the line after it has begun; an OSC-8 link's TARGET is whole once its
//    terminator arrived — and withheld while the OSC is still arriving
{
  const vis = S_HEAD + URL + '\r\r\n'; // plain text, no hyperlink
  ok(!run([vis]).steps.some((s) => s.kind === 'url'), '② a plain-text url is withheld until the line after it begins', run([vis]).steps.map((s) => s.kind));
  const r2 = M.signinStep(M.signinStep(M.initialSigninParse(), vis, {}).state, 'Paste code here if prompted > ', {});
  ok(r2.steps.some((s) => s.kind === 'url' && s.url === URL), '② …and emitted once the next line (the prompt, no blank line between) begins', r2.steps);
  const r3 = M.signinStep(M.signinStep(M.initialSigninParse(), vis, {}).state, S_BLANK, {});
  ok(r3.steps.some((s) => s.kind === 'url' && s.url === URL), '② …or a blank line (the 2.1.296 shape) lands', r3.steps);
  const half = S_HEAD + ESC + ']8;;' + URL.slice(0, 50);
  ok(!run([half]).steps.some((s) => s.kind === 'url'), '② an OSC-8 target still arriving (no terminator yet) is no url');
  ok(run([S_HEAD + S_URL]).steps.some((s) => s.kind === 'url' && s.url === URL), '② the OSC-8 target is whole once its terminator arrived — however its visible text wraps');
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
  ok(M.signinCardView({}).state === 'no-login' && M.signinCardView({ phase: 'cancelled' }).state === 'no-login', '④ no run / a cancelled run → no-login (the pressable «Sign in»)');
  ok(M.signinCardView({ phase: 'starting' }).state === 'starting', '④ a LIVE run starting → «starting» — never a pressable «Sign in» again (the fleet debris: a row per press)');
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
  ok(M.signinCardView({ phase: 'url' }).state === 'starting', '④ url with no url string → starting (never a blank link, never a second press)');
  const rs = M.signinCardView({ phase: 'starting', rawHint: 'stalled' }), ru = M.signinCardView({ phase: 'waiting-code', url: URL, rawHint: 'unknown' });
  ok(rs.rawHint === 'stalled' && ru.rawHint === 'unknown' && M.signinCardView({ phase: 'failed', rawHint: 'stalled' }).rawHint === undefined && M.signinCardView({ phase: 'starting', rawHint: 'bogus' }).rawHint === null, '④ the raw screen\'s cue rides a LIVE view only (stalled / unknown), never a done one or an unknown word', [rs, ru]);
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

// ⑦ THE REAL SCREEN (lane signin-card-real-screen): the captures are the oracle, byte-exact —
//    scripts/fixtures/claude-signin/cli-2.1.308-auth-login.pty (`claude auth login --claudeai` in a PTY, a scratch
//    config dir with no credentials, the study lane naive-cluster-4) and cli-2.1.309-auth-login.txt (a fresh fleet pod,
//    ANSI stripped, the query redacted). The prompt is on the VERY NEXT line — no blank line — so the base reader
//    (url only before a blank line) read [code-prompt] alone and the card sat at «starting» for 10 minutes.
{
  const fs = require('fs');
  const FX = path.join(ROOT, 'scripts/fixtures/claude-signin');
  const cap = fs.readFileSync(path.join(FX, 'cli-2.1.308-auth-login.pty'), 'utf8');
  const target = /\x1b\]8;;(https:[^\x07]+)\x07/.exec(cap)[1];
  for (const size of [1, 7, 4096]) {
    const chunks = []; for (let i = 0; i < cap.length; i += size) chunks.push(cap.slice(i, i + size));
    const r = run(chunks);
    const kinds = r.steps.map((x) => x.kind).join(',');
    ok(kinds === 'url,code-prompt' && r.steps[0].url === target, `⑦ the REAL 2.1.308 auth-login screen in ${size}-byte chunks → url (the OSC-8 target, whole) then code-prompt`, kinds);
  }
  ok(/^https:\/\/claude\.com\/cai\/oauth\/authorize\?code=true&client_id=[\w-]+&response_type=code&redirect_uri=https%3A%2F%2Fplatform\.claude\.com%2Foauth%2Fcode%2Fcallback&scope=[^&]+&code_challenge=[\w-]+&code_challenge_method=S256&state=[\w-]+$/.test(target), '⑦ the URL is the code-page sign-in (redirect platform.claude.com/oauth/code/callback)', target.slice(0, 90));
  const vis = cap.replace(/\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
  ok(run([vis]).steps.map((x) => x.kind).join(',') === 'url,code-prompt' && run([vis]).steps[0].url === target, '⑦ its VISIBLE text alone (the hyperlink stripped) reads the same URL — it ends at its line, the prompt on the next');
  const atPrompt = cap.slice(0, cap.indexOf('Session terminated'));
  ok(M.signinStep(null, atPrompt).unknown === false, '⑦ the reader knows every line of the real screen (no raw-screen flip at the prompt)');
  ok(M.signinStep(null, cap).unknown === true, '⑦ …and the capture\'s trailing harness line («Session terminated…», the capture tool\'s, after the CLI was killed) is an UNKNOWN line — the raw-screen flip');
  const { cleanPty } = require(path.join(ROOT, 'src/oat-mint-model.js'));
  const shown = cleanPty(atPrompt);
  ok(shown.slice(shown.indexOf('https://')).search(/\n[ \t]*\n/) < 0, '⑦ (why the base reader read no link) there is NO blank line between the URL and the prompt — the base cut needed one');
  const t309 = fs.readFileSync(path.join(FX, 'cli-2.1.309-auth-login.txt'), 'utf8');
  const lines309 = t309.split('\n').slice(1).map((l) => l.trim()).filter(Boolean); // line 1 = the capture's own note
  const lines308 = shown.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\?[^\s]*$/, '?<REDACTED>'));
  ok(JSON.stringify(lines309) === JSON.stringify(lines308), '⑦ 2.1.309 (a fresh fleet pod) prints the SAME screen as 2.1.308, line for line (the query redacted)', { lines309, lines308 });
  const r309 = run([t309.replace('<REDACTED>', 'code=true&state=s309')]);
  ok(r309.steps.map((x) => x.kind).join(',') === 'url,code-prompt' && r309.steps[0].url === 'https://claude.com/cai/oauth/authorize?code=true&state=s309', '⑦ the 2.1.309 screen (its query filled in) → url then code-prompt', r309.steps);
  ok(run([t309]).steps.map((x) => x.kind).join(',') === 'code-prompt', '⑦ …while its redacted «<REDACTED>» query is never a link (no < > in a URL the card opens)');
}

// ⑧ THE CLI'S LIVE LOGIN REFUSAL — a table row over the REAL 2.1.308 stream-json records (a credential-less config
//    dir: «hello», then «/login»; fixture cli-2.1.308-not-logged-in.jsonl). The CLI does not die: the refusal is a
//    synthetic assistant record; the chat's card reads it from the server's `signin-wall`.
{
  const fs = require('fs');
  const recs = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/claude-signin/cli-2.1.308-not-logged-in.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const walls = recs.map((r) => M.liveWallOf(r));
  ok(recs.length === 4 && walls.filter(Boolean).length === 1 && walls[0] && walls[0].reason === 'not_logged_in' && walls[0].detail === 'Not logged in · Please run /login', '⑧ exactly the refusal record is the wall (not_logged_in + the CLI\'s words); its result record and the «/login» answer are not', walls);
  ok(recs[0].error === 'authentication_failed' && recs[0].message.model === '<synthetic>' && recs[2].local_command_outcome && recs[2].local_command_outcome.kind === 'unavailable_headless', '⑧ (the fixture is what the brief measured) authentication_failed on a <synthetic> record; «/login» = unavailable_headless');
  const quoting = { ...recs[0], error: undefined, message: { ...recs[0].message, model: 'claude-opus-5-5' } };
  const sub = { ...recs[0], parent_tool_use_id: 'toolu_1' };
  const other = { ...recs[0], error: 'rate_limit' };
  ok(!M.liveWallOf(quoting) && !M.liveWallOf(sub) && !M.liveWallOf(other) && !M.liveWallOf(null) && !M.liveWallOf({ type: 'result', result: 'Not logged in' }), '⑧ a model QUOTING the words, a sub-agent\'s record, another error\'s synthetic record, a result → no wall');
  ok(Array.isArray(M.LIVE_WALLS) && M.LIVE_WALLS.length >= 1 && Object.isFrozen(M.LIVE_WALLS[0]), '⑧ the wall is a frozen TABLE row (the next live wall is a row, not a branch)');
}

// ⑨ THE FIRST SIGN-IN BECOMES THE DEFAULT — only where nothing else could serve (主开发 2026-10-23 04:27)
{
  const F = M.firstSigninDefault, base = { cardRow: true, loggedIn: true, hasDefault: false, globalLoggedIn: false, platform: 'linux', envKey: false };
  ok(F(base) === true, '⑨ a card row that logged in, no Claude default, a signed-out machine login, Linux → the default');
  const rows = [['cardRow', false], ['loggedIn', false], ['hasDefault', true], ['globalLoggedIn', true], ['platform', 'darwin'], ['envKey', true]].map(([k, v]) => [k, F({ ...base, [k]: v })]);
  ok(rows.every(([, v]) => v === false) && F({}) === false, '⑨ any other fact keeps the default as it is (a terminal-road row, no login, a default exists — never swapped, a machine login, macOS Keychain unknowable, an API key)', rows);
}

console.log(`\ntest-signin-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
