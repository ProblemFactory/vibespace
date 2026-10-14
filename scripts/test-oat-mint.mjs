#!/usr/bin/env node
// THE LONG-LIVED TOKEN MINT (lane oat-mint-flow, owner 2026-10-13): the hub
// runs `claude setup-token` in its own PTY and the token goes from the PTY
// straight into accounts.setOat. §1 the PURE screen reader over the REAL CLI
// 2.1.296 captures (URL step only, scratch config — never a sign-in) and
// synthetic success / error / garbage streams; §2 the ORCH over a FAKE claude
// (scripts/fixtures/oat-mint/fake-claude) through the REAL AccountManager:
// start → url → code → saved, isolation (scratch HOME + CLAUDE_CONFIG_DIR,
// credential env dropped, dir wiped), cancel kills + wipes, TTL, one mint per
// account, the store's refusal kept; §3 the routes (agent token refused by
// name, foreign mint ids 404); §4 THE SECRET'S ONE ROAD — a spy on every
// outbound path (log, console, stdout/stderr, broadcasts, GET answers, FILE
// WRITES) finds neither the token nor the code, and four RED mutant copies of
// the ORCH (token logged / in the GET state / in a broadcast / in a tmp file)
// are caught. oat-verify-fixes: §5 F1 a token is saved only under the account
// it PROVES (sign-in identity / one /usage panel window vs the anchors / else
// the person's pick); §6 F2 the child env is an allowlist (the verify's 28
// planted names, 0 reach; the blocklist = RED control); §7 F3 the boot sweep +
// stopAll on SIGTERM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fakeClaudeCmd } from './fixtures/oat-mint/fake-wrap.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require(path.join(REPO, 'src/oat-mint-model.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const FAKE = path.join(REPO, 'scripts/fixtures/oat-mint/fake-claude');
const ORCH = path.join(REPO, 'src/server/oat-mint.js');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(25); } return fn(); };
const feedAll = (text, size) => { let s = null; const steps = []; for (let i = 0; i < text.length; i += size) { const r = M.mintStep(s, text.slice(i, i + size)); s = r.state; steps.push(...r.steps); } return { s, steps }; };
// a per-PROCESS tail (lane oat-census-closure): the §4 spy scans os.tmpdir()'s top level, so a parallel copy of this suite
// (a mutant matrix) writing ITS token there was read as a leak in this one; the fixed part keeps every slice below
const TOKEN = ['sk', '-ant-oat01-'].join('') + 'Q7fakeTOKEN_' + require('node:crypto').randomBytes(8).toString('hex') + 'a1B2c3D4e5F6g7H8'.repeat(4) + '-zz';
const CODE = 'fakeAuthCode123#FAKESTATE';

console.log('§1 the PURE screen reader');
{
  const fx = (f) => fs.readFileSync(path.join(REPO, 'scripts/fixtures/oat-mint', f), 'utf8');
  const urls = [];
  for (const f of ['cli-2.1.296-url-80col.raw', 'cli-2.1.296-url-400col.raw']) {
    for (const size of [1, 7, 4096]) {
      const { steps } = feedAll(fx(f), size);
      const kinds = steps.map((x) => x.kind).join(',');
      ok(kinds === 'url,code-prompt', `${f} in ${size}-byte chunks → url then code-prompt (the measured 2.1.296 screen)`, kinds);
      urls.push(steps[0] && steps[0].url);
    }
  }
  ok(urls.every((u) => /^https:\/\/claude\.com\/cai\/oauth\/authorize\?code=true&client_id=[\w-]+&response_type=code&redirect_uri=https%3A%2F%2Fplatform\.claude\.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=[\w-]+&code_challenge_method=S256&state=[\w-]+$/.test(u)),
    'the 80-column capture (URL wrapped over 5 lines) and the 400-column one read the same whole URL shape', urls[0]);
  ok(urls[0] === urls[2] && urls[3] === urls[5], 'chunking never changes the URL');
  const succ = '\x1b[32m✓\x1b[1CLong-lived authentication token created successfully!\r\r\n\r\r\nYour\x1b[1COAuth\x1b[1Ctoken\x1b[1C(valid\x1b[1Cfor\x1b[1C1\x1b[1Cyear):\r\r\n\r\r\n'
    + TOKEN.match(/.{1,40}/g).join('\r\r\n') + '\r\r\n\r\r\nStore\x1b[1Cthis\x1b[1Ctoken\x1b[1Csecurely.\r\r\n';
  for (const size of [1, 13, 9999]) {
    const { steps } = feedAll(succ, size);
    const tk = steps.filter((x) => x.kind === 'token');
    ok(tk.length === 1 && tk[0].token === TOKEN, `success screen in ${size}-byte chunks → ONE token step, the wrapped token re-joined exactly`);
  }
  const partial = succ.slice(0, succ.indexOf('Store'));
  ok(!M.mintStep(null, partial).steps.some((x) => x.kind === 'token'), 'no token step before the closing line arrives (a half-printed token is never saved)');
  ok(M.mintStep(null, partial, { final: true }).steps.some((x) => x.kind === 'token' && x.token === TOKEN), '… but the process end (final) reads what is there');
  ok(M.mintStep(null, 'blah\n' + TOKEN + '\n').steps.some((x) => x.token === TOKEN), "another CLI's wording: a line holding the token on its own");
  const r1 = M.mintStep(null, succ);
  ok(r1.state.raw === '' && !JSON.stringify(r1.state).includes('sk-ant'), 'after the token step the parser keeps no copy of the screen');
  const err = M.mintStep(null, 'x\r\r\nOAuth\x1b[1Cerror:\x1b[1CInvalid code ' + TOKEN + ' (rejected)\r\r\n').steps;
  ok(err.length === 1 && err[0].kind === 'error' && err[0].line.startsWith('OAuth error: Invalid code') && !err[0].line.includes(TOKEN.slice(14)), 'an OAuth error line → error, any Anthropic key in it masked', err);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let g = ''; for (let i = 0; i < 20000; i++) g += String.fromCharCode(Math.floor(rnd() * 0x2ff));
  ok(feedAll(g.replace(/https|sk-ant|paste|oauth|error/gi, ''), 333).steps.length === 0, 'garbage (20k random chars) → no step');
  ok(M.mintStep(null, 'https://claude.example/a?b=c').steps.length === 0, 'a URL with no line after it is not yet a URL (never half a link)');
  ok(M.lastLine('real failure here\n✻\n *\n·\n') === 'real failure here' && M.lastLine('x ' + TOKEN) === ['x sk', '-ant-…'].join(''), 'lastLine skips spinner frames and masks a token');
  const pub = M.publicMint({ id: 'om-1', accountId: 'sub-1', phase: 'url', url: 'https://x', token: TOKEN, _p: {}, code: CODE, error: 'bad ' + TOKEN });
  ok(!JSON.stringify(pub).includes(['sk', '-ant-oat01'].join('')) && !JSON.stringify(pub).includes(CODE) && Object.keys(pub).join() === 'id,accountId,phase,url,localUrl,error,startedAt,endedAt,mintedAt,reason,signedInAs,other,choices', 'publicMint is a whitelist (token / code / handles dropped, error masked)', pub);
  ok(M.codeVerdict(' a#b ').ok && M.codeVerdict(' a#b ').code === 'a#b' && !M.codeVerdict('').ok && !M.codeVerdict('a\nb').ok && !M.codeVerdict('x'.repeat(2001)).ok, 'codeVerdict: one printable line ≤ 2000');
  ok(!/require\(|^import /m.test(fs.readFileSync(path.join(REPO, 'src/oat-mint-model.js'), 'utf8')), 'the model imports nothing (PURE)');
}

// ── the spy: every outbound path of one ORCH instance ────────────────────
function spyOn(createFn, extra = {}) {
  const out = { logs: [], casts: [], answers: [] };
  const mint = createFn({ log: (...a) => out.logs.push(a.join(' ')), broadcastAll: (m) => out.casts.push(JSON.stringify(m)), ...extra });
  return { mint, out };
}
function captureStd() {
  const got = []; const keep = {};
  for (const k of ['log', 'error', 'warn', 'info']) { keep[k] = console[k]; console[k] = (...a) => { got.push(a.join(' ')); }; }
  const w1 = process.stdout.write.bind(process.stdout), w2 = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c, ...r) => { got.push(String(c)); return true; }; process.stderr.write = (c, ...r) => { got.push(String(c)); return true; };
  return () => { for (const k of Object.keys(keep)) console[k] = keep[k]; process.stdout.write = w1; process.stderr.write = w2; return got; };
}
// F4: FILE WRITES — every fs write door the ORCH could take, plus a post-run
// scan of this run's dirs and os.tmpdir()'s top level for the token's bytes
function spyFiles() {
  const t0 = Date.now(); const got = []; const keep = {};
  const has = (d) => { try { const b = Buffer.isBuffer(d) ? d.toString('latin1') : (ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength).toString('latin1') : String(d)); return b.includes(TOKEN) || b.includes(TOKEN.slice(13, 40)); } catch { return false; } };
  const doors = ['writeFileSync', 'appendFileSync', 'writeSync', 'writeFile', 'appendFile', 'write'];
  for (const k of doors) { keep[k] = fs[k]; fs[k] = function (a, b, ...r) { if (has(b)) got.push(k + ':' + String(a)); return keep[k].call(this, a, b, ...r); }; }
  for (const k of ['writeFile', 'appendFile']) { keep['p' + k] = fs.promises[k]; fs.promises[k] = function (a, b, ...r) { if (has(b)) got.push('promises.' + k + ':' + String(a)); return keep['p' + k].call(this, a, b, ...r); }; }
  const ws0 = fs.createWriteStream; fs.createWriteStream = function (...a) { const ws = ws0.apply(this, a); const w = ws.write.bind(ws); ws.write = (c, ...r) => { if (has(c)) got.push('stream:' + String(a[0])); return w(c, ...r); }; return ws; };
  return () => {
    for (const k of doors) fs[k] = keep[k];
    for (const k of ['writeFile', 'appendFile']) fs.promises[k] = keep['p' + k];
    fs.createWriteStream = ws0;
    const scan = (d, deep) => { let n = []; try { n = fs.readdirSync(d); } catch { } for (const f of n) { const p = path.join(d, f); let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory() && deep) scan(p, deep); else if (st.isFile() && st.mtimeMs >= t0 - 1000 && st.size < 4e6) { try { if (has(fs.readFileSync(p))) got.push('on-disk:' + p); } catch { } } } };
    scan(tmpBase, true); scan(os.tmpdir(), false);
    return got;
  };
}
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oatmint-'));
const am = new AccountManager({ dataDir: path.join(tmpBase, 'data') });
const sub = am.createSubscription({ name: 'Work Max' }).id;
const sub2 = am.createSubscription({ name: 'Second' }).id;
am.setEmail(sub, 'work@example.com'); am.setEmail(sub2, 'second@example.com');
// the oauthAccount the fake CLI writes into the scratch config at sign-in (CLI 2.1.296 itself writes none: ident null)
const IDENT = { work: JSON.stringify({ emailAddress: 'work@example.com', organizationUuid: 'org-work-uuid' }), second: JSON.stringify({ emailAddress: 'second@example.com', organizationUuid: 'org-second-uuid' }), fresh: JSON.stringify({ emailAddress: 'fresh@example.com' }) };
// THE 28 hub names oat-verify planted (lens 3) — none may reach the mint child (F2)
const PLANTED = { ANTHROPIC_API_KEY: ['sk', '-ant-api03-hubkey'].join(''), ANTHROPIC_AUTH_TOKEN: 'x', CLAUDE_CODE_OAUTH_TOKEN: ['sk', '-ant-oat01-hubown'].join(''), ANTHROPIC_BASE_URL: 'http://evil.example', CLAUDE_CONFIG_DIR: '/nonexistent/.claude',
  OPENAI_API_KEY: 'sk-openai', GH_TOKEN: ['gh', 'p_x'].join(''), GITHUB_TOKEN: ['gh', 'p_y'].join(''), AWS_SECRET_ACCESS_KEY: 'aws', FISH_API_KEY: 'fish', GOOGLE_API_KEY: 'g', SLACK_BOT_TOKEN: ['xo', 'xb'].join(''), LARK_APP_SECRET: 'lark',
  VIBESPACE_SESSION_TOKEN: 'vsst_hub', VIBESPACE_JOB_TOKEN: 'jbt_hub', VIBESPACE_TOKEN: 'vt', VIBESPACE_AUTH_TOKEN: 'va', SSH_AUTH_SOCK: '/tmp/ssh-agent.sock', GPG_AGENT_INFO: 'g', CLAUDE_CODE_USE_BEDROCK: '1', ANTHROPIC_VERTEX_PROJECT_ID: 'p', AWS_BEARER_TOKEN_BEDROCK: 'b',
  LD_PRELOAD: '', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', DISPLAY: ':99', XAUTHORITY: '/tmp/xauth-planted', NODE_OPTIONS: '--no-warnings' };
const UR = require(path.join(REPO, 'src/usage-routes.js'));
const readingLag = require(path.join(REPO, 'src/reading-lag.js'));
const PANEL_A = 'Current session: 12% used · resets Oct 14, 3am (UTC)\nCurrent week (all models): 40% used · resets Oct 17, 9am (UTC)\n';
const PANEL_B = 'Current session: 70% used · resets Oct 14, 5am (UTC)\nCurrent week (all models): 22% used · resets Oct 19, 2pm (UTC)\n';
const winOf = (t) => readingLag.windowOf(UR.parseCliUsageText(t));
const rec = path.join(tmpBase, 'fake-record.jsonl');
const readRec = () => (fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const scratchRoot = path.join(tmpBase, 'scratch'); fs.mkdirSync(scratchRoot);
const baseEnv = () => ({ ...process.env, ...PLANTED, VIBESPACE_SECRET_THING: 'x' });
const loadOrch = (src) => {
  if (!src) { delete require.cache[ORCH]; return require(ORCH); }
  const Module = require('node:module');
  const m = new Module(ORCH, null); m.filename = ORCH; m.paths = Module._nodeModulePaths(path.dirname(ORCH)); m._compile(src, ORCH); return m.exports;
};
// the fake's knobs ride in a wrapper (the child env is an allowlist); `probe` = the production probePanel over the same fake
const mk = (O, mode, { ident = IDENT.work, panel = null, probe = false, ...over } = {}) => (spy) => {
  const cmd = fakeClaudeCmd(tmpBase, { MODE: mode, TOKEN, RECORD: rec, IDENTITY: ident, PANEL: panel });
  return O.create({ accounts: am, claudeCmd: cmd, env: baseEnv(), tmpRoot: scratchRoot, ...(probe ? { probePanel: O.panelProbeVia((o, done) => UR.spawnPanelProbe(cmd, o, done), UR.parseCliUsageText) } : {}), ...spy, ...over });
};

/** One full mint through an ORCH copy; returns what leaked where. */
async function saveFlow(O, accountId) {
  const restore = captureStd();
  const unspy = spyFiles();
  let res = null;
  try {
    const { mint, out } = spyOn(mk(O, 'code'));
    const st = mint.start({ accountId });
    out.answers.push(JSON.stringify(st));
    const id = st.mint.id;
    await until(() => mint.get(id)?.phase === 'waiting-code');
    out.answers.push(JSON.stringify(mint.get(id)));
    out.answers.push(JSON.stringify(mint.sendCode(id, CODE)));
    await until(() => ['saved', 'failed'].includes(mint.get(id)?.phase));
    out.answers.push(JSON.stringify(mint.get(id)), JSON.stringify(mint.forAccount(accountId)));
    res = { mint, out, id };
  } finally { res && (res.std = restore()); if (!res) restore(); const files = unspy(); if (res) res.files = files; }
  const leaks = [];
  if (res.files.length) leaks.push('file:token');
  for (const [where, list] of [['log', res.out.logs], ['broadcast', res.out.casts], ['GET/answer', res.out.answers], ['console/stdout', res.std]]) {
    for (const s of list) { if (s.includes(TOKEN) || s.includes(TOKEN.slice(13, 40))) leaks.push(where + ':token'); if (s.includes(CODE)) leaks.push(where + ':code'); }
  }
  return { ...res, leaks: [...new Set(leaks)] };
}

console.log('§2 the ORCH over the fake claude, through the REAL AccountManager');
{
  const O = loadOrch();
  const r = await saveFlow(O, sub);
  const m = r.mint.get(r.id);
  ok(m.phase === 'saved' && m.mintedAt > 0, 'start → url → waiting-code → code → saved', m);
  ok(am.getOat(sub) === TOKEN, 'the token landed in the REAL store (accounts.setOat — the POST /oat save path, its checks run)');
  const phases = r.out.casts.map((c) => JSON.parse(c).mint.phase);
  ok(['starting', 'waiting-code', 'minting', 'saved'].every((p) => phases.includes(p)) && r.out.casts.every((c) => JSON.parse(c).type === 'oat-mint'), 'every phase is broadcast as a WS `oat-mint` message', phases);
  const cast = JSON.parse(r.out.casts.find((c) => JSON.parse(c).mint.phase === 'waiting-code')).mint;
  ok(/^https:\/\/claude\.example\/cai\/oauth\/authorize\?/.test(cast.url) && /redirect_uri=http%3A%2F%2Flocalhost/.test(cast.localUrl || ''), 'the screen URL (code page) AND the $BROWSER URL (localhost callback, the zero-copy door) are both carried', cast);
  ok(r.leaks.length === 0, 'THE SPY: neither the token nor the sign-in code on any outbound path (log, console, stdout/stderr, broadcasts, GET answers, file writes)', r.leaks);
  const facts = readRec();
  const f = facts.find((x) => x.code === CODE);
  ok(f && f.home.startsWith(scratchRoot) && f.config.startsWith(f.home) && f.home !== os.homedir(), 'the CLI ran with a scratch HOME + CLAUDE_CONFIG_DIR (never the hub\'s ~/.claude)', f);
  ok(f && !f.apiKey && !f.oauthEnv && f.vibespaceVars.length === 0 && f.browser, 'spawn hygiene: agentEnv() + every credential name dropped; $BROWSER is ours', f);
  ok(f && f.code === CODE, 'the pasted code reached the CLI as one line');
  ok(fs.readdirSync(scratchRoot).length === 0, 'the scratch dir is gone after the mint');
  const again = r.mint.start({ accountId: sub });
  ok(again.ok, 'a finished mint never blocks the next one');
  const twice = r.mint.start({ accountId: sub });
  ok(!twice.ok && twice.status === 409 && twice.code === 'mint_running', 'ONE mint per account at a time (409 mint_running)', twice);
  const other = r.mint.start({ accountId: sub2 });
  ok(other.ok, '… another account may mint beside it');
  await until(() => r.mint.get(other.mint.id)?.phase === 'waiting-code');
  const pid = readRec().filter((x) => !x.code).pop().pid;
  r.mint.cancel(again.mint.id); r.mint.cancel(other.mint.id);
  await sleep(150);
  let alive = true; try { process.kill(pid, 0); } catch { alive = false; }
  ok(r.mint.get(other.mint.id).phase === 'cancelled' && !alive, 'cancel → phase cancelled and the CLI process is gone', { phase: r.mint.get(other.mint.id).phase, alive });
  ok(fs.readdirSync(scratchRoot).length === 0, 'cancel wipes the scratch config dir');
  ok(r.mint.sendCode(other.mint.id, 'x').code === 'not_waiting' && r.mint.cancel('om-nope').status === 404, 'a code to a finished mint / an unknown id is refused');
  ok(r.mint.start({ accountId: 'sub-nope' }).status === 404, 'an unknown account is refused before anything runs');
}
{
  const O = loadOrch();
  const { mint, out } = spyOn(mk(O, 'hang', { ttlMs: 400 }));
  const st = mint.start({ accountId: sub2 });
  await until(() => mint.get(st.mint.id)?.phase === 'url');
  await until(() => mint.get(st.mint.id)?.phase === 'failed', 3000);
  ok(mint.get(st.mint.id).phase === 'failed' && /10 minutes/.test(mint.get(st.mint.id).error), 'TTL: an unfinished sign-in fails by itself (10 min in the product, 400 ms here)', mint.get(st.mint.id));
  ok(fs.readdirSync(scratchRoot).length === 0, '… its process killed and its dir wiped');
  const e1 = spyOn(mk(O, 'error')).mint; const s1 = e1.start({ accountId: sub2 });
  await until(() => e1.get(s1.mint.id)?.phase === 'waiting-code'); e1.sendCode(s1.mint.id, 'bad#code');
  await until(() => e1.get(s1.mint.id)?.phase === 'failed');
  ok(/^OAuth error: Invalid code/.test(e1.get(s1.mint.id).error || ''), 'a refused code → failed with the CLI\'s words', e1.get(s1.mint.id));
  const e2 = spyOn(mk(O, 'exit')).mint; const s2 = e2.start({ accountId: sub2 });
  await until(() => e2.get(s2.mint.id)?.phase === 'failed');
  ok(/sign-in server went away/.test(e2.get(s2.mint.id).error || ''), 'the CLI dying without a token → failed with its last line', e2.get(s2.mint.id));
  const key = am.add({ name: 'An API key', key: ['sk', '-ant-api03-'].join('') + 'k'.repeat(40) });
  am.setEmail(key.id || key, 'work@example.com'); // its identity PROVEN (F1), so the store's own check is what answers
  const e3 = spyOn(mk(O, 'code')).mint; const s3 = e3.start({ accountId: key.id || key });
  if (s3.ok) { await until(() => e3.get(s3.mint.id)?.phase === 'waiting-code'); e3.sendCode(s3.mint.id, CODE); await until(() => ['saved', 'failed'].includes(e3.get(s3.mint.id)?.phase)); }
  const k3 = s3.ok ? e3.get(s3.mint.id) : s3;
  ok(k3.phase === 'failed' && /subscription accounts only/.test(k3.error) && !am.getOat(key.id || key), 'the store\'s own refusal is kept (an API-key account never gets an oat) — said in its words', k3);
  const e4 = spyOn(mk(O, 'code', { claudeCmd: path.join(tmpBase, 'no-such-claude') })).mint; const s4 = e4.start({ accountId: sub2 });
  await until(() => e4.get(s4.mint.id)?.phase === 'failed');
  ok(e4.get(s4.mint.id).phase === 'failed', 'a missing claude binary → failed, said', e4.get(s4.mint.id));
  await sleep(100);
  ok(fs.readdirSync(scratchRoot).length === 0, 'every ending wiped its scratch dir');
}

console.log('§3 the routes');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  const O = loadOrch();
  const app = express(); app.use(express.json());
  const mint = O.create({ accounts: am, claudeCmd: fakeClaudeCmd(tmpBase, { MODE: 'code', TOKEN, RECORD: rec, IDENTITY: IDENT.second }), env: baseEnv(), tmpRoot: scratchRoot, log: () => { } });
  const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || ''));
  O.registerMintRoutes(app, { mint, isAgentBearer });
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const call = async (method, p, body, auth) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const A = `/api/accounts/${sub2}/oat/mint`;
  const agent = await Promise.all([['POST', A], ['GET', A], ['GET', A + '/om-x'], ['POST', A + '/om-x/code', { code: 'a' }], ['DELETE', A + '/om-x'], ['POST', A + '/om-x/confirm', { save: true }]].map(([m, p, b]) => call(m, p, b, 'Bearer vsst_abc')));
  ok(agent.every((r) => r.status === 403 && r.j.code === 'agent_forbidden'), 'all six mint routes (+ confirm) refuse an agent session token by name', agent.map((r) => r.status));
  ok((await call('POST', A, null, 'Bearer jbt_x')).status === 403, '… and a job token');
  const s = await call('POST', A);
  ok(s.status === 200 && s.j.mint.phase === 'starting', 'POST …/oat/mint → {mint: starting}', s.j);
  const id = s.j.mint.id;
  await until(() => mint.get(id)?.phase === 'waiting-code');
  const g = await call('GET', A + '/' + id); const ga = await call('GET', A);
  ok(g.j.mint.phase === 'waiting-code' && ga.j.mint.id === id, 'GET by id and GET the account\'s live mint (a reopened dialog finds it)');
  ok((await call('GET', `/api/accounts/${sub}/oat/mint/${id}`)).status === 404, 'a mint id under ANOTHER account is 404');
  ok((await call('POST', A + '/' + id + '/code', { code: '' })).j.code === 'empty_code', 'an empty code is refused');
  const c = await call('POST', A + '/' + id + '/code', { code: CODE });
  ok(c.status === 200 && c.j.mint.phase === 'minting', 'POST …/code → minting');
  await until(() => mint.get(id)?.phase === 'saved');
  const gs = await call('GET', A + '/' + id);
  ok(gs.j.mint.phase === 'saved' && !JSON.stringify(gs.j).includes(TOKEN.slice(13, 40)) && am.getOat(sub2) === TOKEN, 'saved via the routes; the answer never holds the token');
  const s2 = await call('POST', A); await until(() => mint.get(s2.j.mint.id)?.phase === 'waiting-code');
  const d = await call('DELETE', A + '/' + s2.j.mint.id);
  ok(d.j.mint.phase === 'cancelled', 'DELETE → cancelled');
  const cf = await call('POST', A + '/' + s2.j.mint.id + '/confirm', { save: true });
  ok(cf.status === 409 && cf.j.code === 'not_confirming', 'confirm on a mint that is not waiting for one → 409 not_confirming', cf);
  mint.stopAll(); srv.close();
  // the pick + the refusal over HTTP: a 2.1.296-shaped sign-in (no identity) → confirm; another account's → 409 identity_mismatch
  const app2 = express(); app2.use(express.json());
  const m2 = O.create({ accounts: am, claudeCmd: fakeClaudeCmd(tmpBase, { MODE: 'code', TOKEN, RECORD: rec }), env: baseEnv(), tmpRoot: scratchRoot, log: () => { } });
  const m3 = O.create({ accounts: am, claudeCmd: fakeClaudeCmd(tmpBase, { MODE: 'code', TOKEN, RECORD: rec, IDENTITY: IDENT.work }), env: baseEnv(), tmpRoot: scratchRoot, log: () => { } });
  let which = m2; const proxy = new Proxy({}, { get: (t, k) => which[k] });
  O.registerMintRoutes(app2, { mint: proxy, isAgentBearer });
  const srv2 = http.createServer(app2); await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
  const call2 = async (method, p, body) => { const r = await fetch('http://127.0.0.1:' + srv2.address().port + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  am.clearOat(sub2);
  const p1 = await call2('POST', A); await until(() => m2.get(p1.j.mint.id)?.phase === 'waiting-code');
  await call2('POST', A + '/' + p1.j.mint.id + '/code', { code: CODE }); await until(() => m2.get(p1.j.mint.id)?.phase === 'confirm');
  const g1 = await call2('GET', A + '/' + p1.j.mint.id);
  ok(g1.j.mint.phase === 'confirm' && g1.j.mint.reason === 'unproven' && g1.j.mint.choices.some((c) => c.id === sub2) && !JSON.stringify(g1.j).includes(TOKEN.slice(13, 40)) && !am.getOat(sub2), 'no proof → GET says confirm (the rows to pick from), nothing saved yet, no token in the answer', g1.j);
  const y1 = await call2('POST', A + '/' + p1.j.mint.id + '/confirm', { save: true, accountId: sub2 });
  ok(y1.status === 200 && y1.j.mint.phase === 'saved' && am.getOat(sub2) === TOKEN, 'POST …/confirm {save:true} → saved (owner-confirmed)', y1.j);
  which = m3; am.clearOat(sub2);
  const p2 = await call2('POST', A); await until(() => m3.get(p2.j.mint.id)?.phase === 'waiting-code');
  await call2('POST', A + '/' + p2.j.mint.id + '/code', { code: CODE }); await until(() => m3.get(p2.j.mint.id)?.phase === 'failed');
  const y2 = await call2('POST', A + '/' + p2.j.mint.id + '/confirm', { save: true });
  ok(y2.status === 409 && y2.j.code === 'identity_mismatch' && /work@example\.com/.test(y2.j.error) && !/org-work-uuid/.test(JSON.stringify(y2.j)) && !am.getOat(sub2), "another account's sign-in → 409 identity_mismatch naming its email (never a uuid), nothing saved", y2.j);
  m2.stopAll(); m3.stopAll(); srv2.close();
}

console.log('§4 RED mutants — the spy catches each leak');
{
  const src = fs.readFileSync(ORCH, 'utf8');
  const anchor = '      const r = accounts.setOat(m.accountId, token);\n';
  ok(src.includes(anchor) && src.includes('  function get(mid) { const m = mints.get(mid); return m ? publicMint(m) : null; }'), 'mutant anchors present (the save line, get())');
  const mutants = [
    ['the token logged', src.replace(anchor, anchor + "      log('[oat-mint] saved ' + token);\n"), 'log'],
    ['the token in the GET state', src.replace(anchor, anchor + '      m.lastToken = token;\n').replace('return m ? publicMint(m) : null; }', 'return m ? { ...publicMint(m), lastToken: m.lastToken } : null; }'), 'GET/answer'],
    ['the token in the WS broadcast', src.replace(anchor, anchor + "      broadcastAll({ type: 'oat-mint', mint: publicMint(m), token });\n"), 'broadcast'],
    ['the token written to a tmp file (oat-verify F4)', src.replace(anchor, anchor + "      try { fs.appendFileSync(path.join(os.tmpdir(), 'oatv-leak-' + process.pid + '.txt'), token + '\\n'); } catch { }\n"), 'file'],
  ];
  for (const [what, msrc, where] of mutants) {
    ok(msrc !== src, `mutant applies: ${what}`);
    am.clearOat(sub);
    const r = await saveFlow(loadOrch(msrc), sub);
    ok(r.mint.get(r.id).phase === 'saved' && r.leaks.includes(where + ':token'), `RED: ${what} ⇒ the spy names it (${where})`, r.leaks);
    fs.rmSync(path.join(os.tmpdir(), 'oatv-leak-' + process.pid + '.txt'), { force: true });
  }
  am.clearOat(sub);
  const r = await saveFlow(loadOrch(), sub);
  ok(r.leaks.length === 0 && am.getOat(sub) === TOKEN, 'control: the shipped ORCH, same harness → no leak');
}

/** One mint through an ORCH copy up to where it stops: saved / failed / confirm. */
async function runMint(O, accountId, over = {}) {
  const js = [];
  const { mint, out } = spyOn(mk(O, 'code', { journal: (j) => js.push(j), ...over }));
  const st = mint.start({ accountId });
  const id = st.mint.id;
  await until(() => mint.get(id)?.phase === 'waiting-code');
  mint.sendCode(id, CODE);
  await until(() => ['saved', 'failed', 'confirm'].includes(mint.get(id)?.phase), 12000);
  return { mint, out, id, js, m: mint.get(id) };
}
const noTokenOut = (r) => ![...r.out.casts, ...r.out.logs, JSON.stringify(r.mint.get(r.id))].some((x) => x.includes(TOKEN.slice(13, 40)));

console.log('§5 F1 — a token is saved only under the account it PROVES');
{
  ok(M.identityVerdict({ email: 'A@x.io' }, { email: 'a@x.io', orgUuid: 'o1' }) === 'match' && M.identityVerdict({ email: 'a@x.io', orgUuid: 'o1' }, { email: 'a@x.io', orgUuid: 'o2' }) === 'mismatch'
    && M.identityVerdict({ orgUuid: 'o1' }, { email: 'b@x.io', orgUuid: 'o1' }) === 'match' && M.identityVerdict({ email: 'a@x.io' }, { email: 'b@x.io', orgUuid: 'o1' }) === 'mismatch'
    && M.identityVerdict(null, { email: 'a@x.io' }) === 'none' && M.identityVerdict({ email: 'a@x.io' }, null) === 'none' && M.identityVerdict({ email: 'a@x.io' }, { orgUuid: 'o1' }) === 'none',
    'PURE identityVerdict: every key both sides know must agree (one org, another seat ⇒ mismatch); nothing shared ⇒ none');
  const O = loadOrch();
  const calls = []; const realSet = am.setOat.bind(am); am.setOat = (id, t) => { calls.push(id); return realSet(id, t); };
  am.clearOat(sub); calls.length = 0;
  let r = await runMint(O, sub, { ident: IDENT.work });
  ok(r.m.phase === 'saved' && am.getOat(sub) === TOKEN && calls.join() === sub && r.js.some((j) => j.outcome === 'identity-proven'), "the sign-in identity matches the row ⇒ saved ONCE, journaled identity-proven", { phase: r.m.phase, calls, js: r.js });
  am.clearOat(sub); calls.length = 0;
  r = await runMint(O, sub, { ident: IDENT.second });
  ok(r.m.phase === 'failed' && r.m.reason === 'identity_mismatch' && r.m.signedInAs === 'second@example.com' && /second@example\.com/.test(r.m.error) && /Work Max/.test(r.m.error) && !/uuid/.test(JSON.stringify(r.m)),
    "THE VERIFY'S PROBE: B's sign-in during C's mint ⇒ failed identity_mismatch, said with B's email and C's name (never a uuid)", r.m);
  ok(!am.getOat(sub) && calls.length === 0 && fs.readdirSync(scratchRoot).length === 0 && r.mint._held.size === 0 && noTokenOut(r), '… nothing saved, no setOat call, the scratch dir wiped, nothing held, no token out');
  ok(r.mint.confirm(r.id, { save: true }).code === 'identity_mismatch', '… and a confirm after it is refused 409 identity_mismatch');
  // RED control = the base: the mint saved whatever the CLI printed
  const unchecked = fs.readFileSync(ORCH, 'utf8').replace("    const iv = identityVerdict(rowIdentity(m.accountId), who);\n", "    return save(m, token, 'unchecked');\n    const iv = identityVerdict(rowIdentity(m.accountId), who);\n");
  ok(unchecked !== fs.readFileSync(ORCH, 'utf8'), 'RED control applies (decide → save, the .262 shape)');
  am.clearOat(sub);
  const rc = await runMint(loadOrch(unchecked), sub, { ident: IDENT.second });
  console.log(`    RED control (the base, no proof): B's sign-in during C's mint ⇒ phase ${rc.m.phase}, stored under Work Max: ${am.getOat(sub) === TOKEN}`);
  ok(rc.m.phase === 'saved' && am.getOat(sub) === TOKEN, 'RED control: without the proof B\'s token IS saved under C');
  am.clearOat(sub);
  // a row with no identity yet: the pick names the sign-in; the row learns it on the yes only
  const sub3 = am.createSubscription({ name: 'Fresh' }).id;
  r = await runMint(O, sub3, { ident: IDENT.fresh });
  ok(r.m.phase === 'confirm' && r.m.reason === 'unproven' && r.m.signedInAs === 'fresh@example.com' && [sub, sub2, sub3].every((id) => r.m.choices.some((c) => c.id === id)) && !am.getOat(sub3), 'a row with no identity ⇒ confirm, showing the sign-in (fresh@…) and the rows to pick from — nothing saved', r.m);
  ok(r.mint._held.size === 1 && fs.readdirSync(scratchRoot).length === 0 && noTokenOut(r), '… the token waits in hub memory only (scratch dir already wiped, never in a broadcast / GET / log)');
  const y = r.mint.confirm(r.id, { save: true });
  ok(y.ok && y.mint.phase === 'saved' && am.getOat(sub3) === TOKEN && r.js.some((j) => j.outcome === 'owner-confirmed') && (am.list().accounts.find((a) => a.id === sub3) || {}).email === 'fresh@example.com' && r.mint._held.size === 0,
    '… the yes saves it (journaled owner-confirmed) and the row learns the email it was shown', y);
  // CLI 2.1.296 shape: no identity at all, no probe
  r = await runMint(O, sub, { ident: null });
  ok(r.m.phase === 'confirm' && !r.m.signedInAs && r.m.choices.some((c) => c.id === sub), 'no identity in the scratch config (CLI 2.1.296) and no probe ⇒ confirm, never a silent save', r.m);
  ok(r.mint.confirm(r.id, { save: true, accountId: 'sub-nope' }).code === 'bad_choice' && !am.getOat(sub), 'a pick outside the listed rows is refused (400 bad_choice)');
  const y2 = r.mint.confirm(r.id, { save: true, accountId: sub2 });
  ok(y2.ok && am.getOat(sub2) === TOKEN && !am.getOat(sub) && y2.mint.accountId === sub2, 'the person picked ANOTHER row ⇒ saved under the picked row', y2.mint);
  am.clearOat(sub2);
  r = await runMint(O, sub, { ident: null });
  const n1 = r.mint.confirm(r.id, { save: false });
  ok(n1.mint.phase === 'cancelled' && r.mint._held.size === 0 && !am.getOat(sub) && r.js.some((j) => j.outcome === 'owner-declined'), '不保存 ⇒ cancelled, the held token dropped, nothing saved');
  r = await runMint(O, sub, { ident: null, ttlMs: 2500 });
  ok(r.m.phase === 'confirm', '(a pick left unanswered…)');
  await until(() => r.mint.get(r.id)?.phase === 'failed', 5000);
  ok(r.mint.get(r.id).phase === 'failed' && r.mint._held.size === 0 && !am.getOat(sub), '… the TTL drops the held token: failed, nothing saved');
  r = await runMint(O, sub, { ident: null }); r.mint.cancel(r.id);
  ok(r.mint._held.size === 0 && r.mint.get(r.id).phase === 'cancelled', 'cancel during the pick drops the held token');
  // THE SECOND LOOK (owner ruling): ONE /usage panel read with the NEW token, its window vs every row's anchor
  const anchors = { [sub]: { ...winOf(PANEL_A), producer: 'login' }, [sub2]: { ...winOf(PANEL_B), producer: 'login' } }; // the ⟳ panel's stamps name their producer (lane oat-identity-fix-r2)
  ok(anchors[sub].sevenDay && anchors[sub2].sevenDay && anchors[sub].sevenDay !== anchors[sub2].sevenDay, 'fixture: two rows with distinct weekly anchors');
  const probeFacts0 = readRec().filter((x) => x.probe).length;
  r = await runMint(O, sub, { ident: null, probe: true, panel: PANEL_A, windows: () => anchors });
  const pf = readRec().filter((x) => x.probe).slice(probeFacts0);
  ok(r.m.phase === 'saved' && am.getOat(sub) === TOKEN && r.js.some((j) => j.outcome === 'fingerprint-proven'), "the panel's window = the row's own anchor (no one else's) ⇒ saved, journaled fingerprint-proven", { m: r.m, js: r.js });
  ok(pf.length === 1 && pf[0].argv.join(' ') === '-p /usage --strict-mcp-config' && pf[0].tokenIsTheMinted && !pf[0].tokenInArgv && pf[0].config.startsWith(scratchRoot) && !pf[0].apiKey,
    'ONE probe: argv = PANEL_PROBE_ARGS (never a prompt), the NEW token in its env (never argv), the mint\'s scratch config, no hub key', pf);
  ok(pf[0].config === path.join(pf[0].home, 'config') && pf[0].cwd === path.join(pf[0].config, 'cwd') && pf[0].cwd !== pf[0].home && pf[0].cwd !== fs.realpathSync(os.tmpdir()),
    '… with the panel probe\'s own isolation (spawnPanelProbe from the root): cwd = the empty dir inside the scratch config — never the PTY cwd, never os.tmpdir() (mirror-263 §19)', pf[0] && { home: pf[0].home, config: pf[0].config, cwd: pf[0].cwd });
  ok(!pf[0].envKeys.some((k) => k in PLANTED && k !== 'CLAUDE_CODE_OAUTH_TOKEN' && k !== 'CLAUDE_CONFIG_DIR'), '… and the probe child carries none of the 28 planted names either', pf[0].envKeys);
  am.clearOat(sub);
  r = await runMint(O, sub, { ident: null, probe: true, panel: PANEL_B, windows: () => anchors });
  ok(r.m.phase === 'failed' && r.m.reason === 'identity_mismatch' && r.m.other === 'Second' && /Second/.test(r.m.error) && !am.getOat(sub) && !am.getOat(sub2), "the panel's window = ANOTHER row's anchor ⇒ failed identity_mismatch naming that row, nothing saved anywhere", r.m);
  for (const [what, over] of [['the row has no anchor yet', { panel: PANEL_A, windows: () => ({}) }], ['the window is shared with another row', { panel: PANEL_A, windows: () => ({ [sub]: anchors[sub], [sub2]: anchors[sub] }) }],
    ['the /usage read failed (the scope refusal an oat may get)', { panel: null, windows: () => anchors }], ['the panel is not a usage panel', { panel: 'Error: something else\n', windows: () => anchors }]]) {
    r = await runMint(O, sub, { ident: null, probe: true, ...over });
    ok(r.m.phase === 'confirm' && !am.getOat(sub) && r.js.some((j) => j.outcome === 'awaiting-owner'), `${what} ⇒ the pick, never a silent save`, { m: r.m, js: r.js });
    r.mint.cancel(r.id);
  }
  am.clearOat(sub);
  const rc2 = await runMint(loadOrch(unchecked), sub, { ident: null, probe: true, panel: PANEL_B, windows: () => anchors });
  console.log(`    RED control (the base, no probe): Second's window during Work Max's mint ⇒ phase ${rc2.m.phase}, stored under Work Max: ${am.getOat(sub) === TOKEN}`);
  ok(rc2.m.phase === 'saved' && am.getOat(sub) === TOKEN, "RED control: the base saves without a probe — another row's token under this one");
  am.clearOat(sub); am.setOat = realSet;
  ok(fs.readdirSync(scratchRoot).length === 0, 'every F1 ending wiped its scratch dir');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes('"CLI 的 setup-token 不记录登录的是哪个账号，无法自动核对。你刚在浏览器里登录的是哪个账号？"') && zh.includes('"这把 token 属于 {email}，不是 {name}；没有保存"') && zh.includes('"这把 token 的用量窗口和 {other} 的一致，不是 {name}；没有保存"')
    && ['"This sign-in is {email}."', '"Don’t save"', '"This token belongs to {email}, not {name} — not saved."', '"This token’s usage window matches {other}, not {name} — not saved."'].every((k) => zh.includes(k) && ja.includes(k)), 'the dialog\'s pick / refusal words in zh (the ruling\'s sentences) and ja');
}

console.log('§6 F2 — the mint child gets an ALLOWLIST env');
{
  const names = Object.keys(PLANTED);
  const { agentEnv } = require(path.join(REPO, 'src/agent-env.js'));
  const pure = M.mintEnvOf(agentEnv(baseEnv()), { home: '/h', configDir: '/h/config', browser: '/h/open-url' });
  const pureReach = names.filter((k) => k in pure && !(k === 'CLAUDE_CONFIG_DIR' && pure[k] === '/h/config'));
  ok(names.length === 28 && pureReach.length === 0 && pure.HOME === '/h' && pure.BROWSER === '/h/open-url' && pure.DISABLE_AUTOUPDATER === '1' && pure.PATH === process.env.PATH, 'PURE mintEnvOf: 0 of the 28 planted names pass; HOME / CLAUDE_CONFIG_DIR / BROWSER / PATH set', pureReach);
  const legacy = agentEnv(baseEnv());
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', 'CLAUDE_CONFIG_DIR', 'ANTHROPIC_BASE_URL']) delete legacy[k];
  const legacyReach = names.filter((k) => k in legacy);
  console.log(`    RED control (the .262 blocklist over agentEnv): ${legacyReach.length} of 28 reach the child — ${legacyReach.join(', ')}`);
  ok(legacyReach.length >= 15, 'RED control: the 6-name blocklist lets most of them through');
  const kids = readRec().filter((x) => x.envKeys && !x.probe);
  const shell = ['PWD', 'OLDPWD', 'SHLVL', '_'];
  const beyond = new Set(kids.flatMap((x) => x.envKeys).filter((k) => !M.MINT_ENV_ALLOW.includes(k) && !/^LC_[A-Z]+$/.test(k) && !['HOME', 'CLAUDE_CONFIG_DIR', 'BROWSER', 'TERM', 'DISABLE_AUTOUPDATER'].includes(k) && !k.startsWith('FAKE_OAT_') && !shell.includes(k)));
  ok(kids.length >= 10 && kids.every((x) => !x.envKeys.some((k) => names.includes(k) && k !== 'CLAUDE_CONFIG_DIR')) && kids.every((x) => x.config && x.config.startsWith(x.home)), `LIVE: all ${kids.length} mint children of this run carried 0 of the 28 (env names the fake CLI recorded)`);
  ok(beyond.size === 0, '… and nothing beyond the allowlist (+ the wrapper\'s own FAKE_OAT_* knobs, the shell\'s PWD/SHLVL)', [...beyond]);
}

console.log('§7 F3 — orphaned scratch dirs are swept at boot; an orderly exit stops every mint');
{
  const root = path.join(tmpBase, 'sweep'); fs.mkdirSync(root);
  const old = path.join(root, 'vs-oat-mint-OLD1'), fresh = path.join(root, 'vs-oat-mint-NEW1'), other = path.join(root, 'vs-other-OLD');
  for (const d of [old, fresh, other]) { fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'browser-url'), 'https://claude.example/x\n'); }
  const hourAgo = (Date.now() - 3600e3) / 1000; fs.utimesSync(old, hourAgo, hourAgo); fs.utimesSync(other, hourAgo, hourAgo);
  const noSweep = fs.readFileSync(ORCH, 'utf8').replace('  sweep();\n', '');
  loadOrch(noSweep).create({ accounts: am, tmpRoot: root, log: () => { } });
  ok(fs.existsSync(old), 'RED control: without the boot sweep the hour-old orphan stays');
  const logs = []; loadOrch().create({ accounts: am, tmpRoot: root, log: (l) => logs.push(l) });
  ok(!fs.existsSync(old) && fs.existsSync(fresh) && fs.existsSync(other) && logs.some((l) => /boot sweep: removed 1 /.test(l)), 'boot sweep: the hour-old vs-oat-mint-* dir is gone; a fresh one (another instance\'s live mint) and a non-mint dir stay', logs);
  const child = path.join(tmpBase, 'hub-child.cjs');
  fs.writeFileSync(child, `const O = require(${JSON.stringify(ORCH)}); const { AccountManager } = require(${JSON.stringify(path.join(REPO, 'src/accounts.js'))});
const am = new AccountManager({ dataDir: process.argv[2] }); const id = am.createSubscription({ name: 'Child' }).id;
const mint = O.create({ accounts: am, claudeCmd: process.argv[3], tmpRoot: process.argv[4], log: () => { }, exitHook: process.argv[5] === '1' });
const st = mint.start({ accountId: id });
const t = setInterval(() => { const m = mint._mints.get(st.mint.id); if (m && m.phase !== 'starting' && m.pty) { clearInterval(t); process.stdout.write(JSON.stringify({ dir: m.dir, pid: m.pty.pid }) + '\\n'); } }, 25);
process.on('SIGTERM', () => process.exit(0)); // server.js: SIGTERM → shutdown() → process.exit
setInterval(() => { }, 1000);
`);
  const runChild = (hook) => new Promise((resolve) => {
    const root2 = fs.mkdtempSync(path.join(tmpBase, 'hub-'));
    const c = spawn(process.execPath, [child, path.join(root2, 'data'), fakeClaudeCmd(tmpBase, { MODE: 'hang', TOKEN }), root2, hook ? '1' : '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '', sent = false;
    const to = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } resolve(null); }, 15000);
    c.stdout.on('data', (d) => {
      buf += d; const nl = buf.indexOf('\n'); if (nl < 0 || sent) return; sent = true;
      const info = JSON.parse(buf.slice(0, nl));
      c.on('exit', async () => { clearTimeout(to); await sleep(300); let alive = true; try { process.kill(info.pid, 0); } catch { alive = false; } resolve({ dirLeft: fs.existsSync(info.dir), alive }); });
      c.kill('SIGTERM');
    });
  });
  const without = await runChild(false);
  console.log(`    RED control (no exit hook, the .262 wiring): SIGTERM mid-mint ⇒ scratch dir left: ${without && without.dirLeft}, CLI alive: ${without && without.alive}`);
  ok(without && without.dirLeft, 'RED control: a hub stopped by SIGTERM mid-mint without the hook orphans its scratch dir');
  const withHook = await runChild(true);
  ok(withHook && !withHook.dirLeft && !withHook.alive, 'exitHook: SIGTERM mid-mint ⇒ stopAll ran — the CLI is gone and its scratch dir removed', withHook);
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  ok(/require\('\.\/oat-mint\.js'\)\.create\(\{[^\n]*exitHook: true/.test(wiring) && /probePanel: require\('\.\/oat-mint\.js'\)\.panelProbeVia\(\(o, done\) => usageRoutesMod\.spawnPanelProbe\(CLAUDE_CMD, o, done\)/.test(wiring),
    'the server wires exitHook: true and the probe through usage-routes spawnPanelProbe (the one allowlisted /usage spawn)');
}
// §8 (lane pool-oat-materialize, q-035 invariants 1 + 2): THE MATERIALIZED FILE IS THE TOKEN'S ONE
// PLACE ON DISK. With the hub's CLI measured (2.1.296) a mint for a member whose login is dead also
// writes the token into <member dir>/.credentials.json — through account-material's
// writeCredentialFile and nothing else. The spy tells that ONE allowed write from a leak by its
// stack, the disk scan finds the bytes in exactly that one file, and THE ONE-WRITER CENSUS reads
// src/: every write primitive accounts.js holds is a named row, account-material writes content only
// in its two private writers, and no src file but writeCredentialFile writes a path naming a credentials file.
// VERIFY R1 F6 (pool-oat-verify: the census was a TEXT match — a write through a path variable, a remover
// that skips "ours?", a foreign archive, a second plaintext copy were all green): THE BEHAVIOUR CENSUS runs
// the store's every oat flow under a stack-aware spy on fs + fs.promises + FileHandle and asks each
// mutation inside a member dir WHO did it (only writeCredentialFile / archiveCredentialFile /
// removeCredentialFile, reached from the store's one actor; a removal only through the remover, whose
// "ours?" question is its own precondition); the STRUCTURE census (⑤ ⑥) is by enclosing function, never
// argument text — code that never runs in a suite (a guarded plant) is still a named row or RED.
console.log('§8 the materialized file — the token\'s ONE place on disk + the one-writer census, behaviour and structure (lane pool-oat-materialize + verify r1 F6)');
{
  const Module8 = require('node:module');
  const ACC = path.join(REPO, 'src/accounts.js');
  const compileAcc = (src) => { const m = new Module8(ACC, null); m.filename = ACC; m.paths = Module8._nodeModulePaths(path.dirname(ACC)); m._compile(src, ACC); return m.exports; };
  const has8 = (d) => { try { const b = Buffer.isBuffer(d) ? d.toString('latin1') : (ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength).toString('latin1') : String(d)); return b.includes(TOKEN) || b.includes(TOKEN.slice(13, 40)); } catch { return false; } };
  // the FileHandle prototype (the async writer writes through a handle)
  const FHP = await (async () => { const p = path.join(tmpBase, 'fhp-probe'); fs.writeFileSync(p, ''); const fh = await fs.promises.open(p, 'r'); const proto = Object.getPrototypeOf(fh); await fh.close(); return proto; })();
  const spyWrites = () => {
    const keep = {}, allowed = [], leaked = [];
    const doors = ['writeFileSync', 'appendFileSync', 'writeSync', 'writeFile', 'appendFile', 'write'];
    const judge = (k) => { const st = String(new Error().stack); (/account-material\.js/.test(st) && /writeCredentialFile/.test(st) ? allowed : leaked).push(k); };
    for (const k of doors) { keep[k] = fs[k]; fs[k] = function (a, b, ...r) { if (has8(b)) judge(k); return keep[k].call(this, a, b, ...r); }; }
    for (const k of ['writeFile', 'appendFile']) { keep['p' + k] = fs.promises[k]; fs.promises[k] = function (a, b, ...r) { if (has8(b)) leaked.push('promises.' + k); return keep['p' + k].call(this, a, b, ...r); }; }
    for (const k of ['writeFile', 'write', 'appendFile']) { keep['h' + k] = FHP[k]; FHP[k] = function (b, ...r) { if (has8(b)) judge('handle.' + k); return keep['h' + k].call(this, b, ...r); }; }
    const ws0 = fs.createWriteStream; fs.createWriteStream = function (...a) { const ws = ws0.apply(this, a); const w = ws.write.bind(ws); ws.write = (c, ...r) => { if (has8(c)) leaked.push('stream:' + String(a[0])); return w(c, ...r); }; return ws; };
    return () => { for (const k of doors) fs[k] = keep[k]; for (const k of ['writeFile', 'appendFile']) fs.promises[k] = keep['p' + k]; for (const k of ['writeFile', 'write', 'appendFile']) FHP[k] = keep['h' + k]; fs.createWriteStream = ws0; return { allowed, leaked }; };
  };
  const onDisk = (root) => { const out = []; (function scan(d) { let n = []; try { n = fs.readdirSync(d); } catch { } for (const f of n) { const p = path.join(d, f); let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) scan(p); else if (st.isFile() && st.size < 4e6) { try { if (has8(fs.readFileSync(p))) out.push(p); } catch { } } } })(root); return out; };
  const deadLogin = (now) => JSON.stringify({ claudeAiOauth: { accessToken: 'acc-dead', refreshToken: 'ref-dead', expiresAt: now - 7200e3, refreshTokenExpiresAt: now - 3600e3, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } });
  // one mint, end to end, through an AccountManager built from `accSrc` (null = the real one)
  const matRun = async (tag, accSrc, { direct = false } = {}) => {
    const AM = accSrc ? compileAcc(accSrc).AccountManager : AccountManager;
    const root8 = fs.mkdtempSync(path.join(tmpBase, 'mat-' + tag + '-'));
    const amM = new AM({ dataDir: path.join(root8, 'data') });
    const mem = amM.createSubscription({ name: 'Dead Max' }).id;
    amM.setEmail(mem, 'work@example.com');
    fs.writeFileSync(path.join(amM.subDir(mem), '.credentials.json'), deadLogin(Date.now()), { mode: 0o600 });
    amM.noteCliVersion('2.1.296 (Claude Code)'); await amM.oatFileSettled();
    const cmd = fakeClaudeCmd(tmpBase, { MODE: 'code', TOKEN, RECORD: rec, IDENTITY: IDENT.work });
    const restoreStd = captureStd(); const unspy = spyWrites();
    let res = null, std = [], w = null;
    try {
      const out = { logs: [], casts: [], answers: [] };
      if (direct) { // the store's own save path (what the mint calls) — no PTY round for a mutant
        out.answers.push(JSON.stringify(amM.setOat(mem, TOKEN)));
        await amM.oatFileSettled(); // the file act runs on the store's queue (verify r1 F13)
        out.answers.push(JSON.stringify(amM.list()));
        res = { out, phase: 'saved', amM, mem };
      } else {
      const mint = loadOrch().create({ accounts: amM, claudeCmd: cmd, env: baseEnv(), tmpRoot: scratchRoot, log: (...a) => out.logs.push(a.join(' ')), broadcastAll: (m) => out.casts.push(JSON.stringify(m)) });
      const st = mint.start({ accountId: mem }); out.answers.push(JSON.stringify(st));
      await until(() => mint.get(st.mint.id)?.phase === 'waiting-code');
      out.answers.push(JSON.stringify(mint.sendCode(st.mint.id, CODE)));
      await until(() => ['saved', 'failed'].includes(mint.get(st.mint.id)?.phase));
      await amM.oatFileSettled();
      out.answers.push(JSON.stringify(mint.get(st.mint.id)), JSON.stringify(amM.list()));
      res = { out, phase: mint.get(st.mint.id).phase, amM, mem };
      }
    } finally { std = restoreStd(); w = unspy(); }
    const leaks = [];
    for (const [where, list] of [['log', res.out.logs], ['broadcast', res.out.casts], ['GET/answer', res.out.answers], ['console/stdout', std]]) for (const s of list) if (s.includes(TOKEN) || s.includes(TOKEN.slice(13, 40))) leaks.push(where);
    return { ...res, writes: w, leaks: [...new Set(leaks)], disk: onDisk(root8), member: path.join(res.amM.subDir(res.mem), '.credentials.json'), root: root8 };
  };
  const r = await matRun('real', null);
  ok(r.phase === 'saved' && r.amM.getOat(r.mem) === TOKEN, 'the mint saved the token under the proven row (caps open: CLI 2.1.296)', r.phase);
  ok(r.disk.length === 1 && r.disk[0] === r.member && (fs.statSync(r.member).mode & 0o777) === 0o600, 'THE DISK: the token\'s bytes sit in exactly ONE file — <member dir>/.credentials.json, 0600 (accounts.json holds it encrypted)', r.disk.map((p) => path.relative(tmpBase, p)));
  ok(r.writes.allowed.length === 1 && r.writes.leaked.length === 0, 'THE SPY: exactly one write carried the token, and its stack is account-material\'s writeCredentialFile (a FileHandle write since verify r1 — the spy covers handles)', r.writes);
  ok(r.leaks.length === 0, 'no log / broadcast / GET answer (the roster included) / console carries it', r.leaks);
  const accSrc = fs.readFileSync(ACC, 'utf8');
  const A1 = "        await material.writeCredentialFile(dir, oatFileMerge(seen.fileState === 'present' ? seen.file : null, body), { expect: v.archive ? null : seen.stat });\n";
  const mLog = accSrc.includes(A1) ? await matRun('log', accSrc.replace(A1, A1 + "        console.log('[oat-file] wrote', body.claudeAiOauth.accessToken);\n"), { direct: true }) : null;
  ok(!!mLog && mLog.leaks.includes('console/stdout'), 'RED control (invariant 1): a planted console.log(token) beside the write is caught', mLog && mLog.leaks);
  const mBak = accSrc.includes(A1) ? await matRun('bak', accSrc.replace(A1, A1 + "        fs.writeFileSync(path.join(dir, '.credentials.json.bak'), JSON.stringify(body), { mode: 0o600 });\n"), { direct: true }) : null;
  ok(!!mBak && mBak.writes.leaked.length >= 1 && mBak.disk.length === 2, 'RED control (invariant 1): a planted second copy (.credentials.json.bak) is caught by the spy AND the disk scan', mBak && { leaked: mBak.writes.leaked, disk: mBak.disk.length });
  for (const m of [mLog, mBak]) if (m) fs.rmSync(m.root, { recursive: true, force: true }); // a RED control's planted copy is its own: the whole-disk scans below judge the suite's tmp root

  // THE ONE-WRITER CENSUS (acorn over src/) — by enclosing function
  const acorn = require('acorn');
  const WRITE = /^(writeFileSync|writeFile|appendFileSync|appendFile|writeSync|createWriteStream|copyFileSync|copyFile|cpSync|renameSync|rename|openSync|open|symlinkSync|symlink|linkSync|link|unlinkSync|unlink|rmSync|rm|truncateSync|truncate|chmodSync|chmod|writePrivateFile|writePrivateFileAsync|writeCredentialFile|archiveCredentialFile|removeCredentialFile|moveCredentialArchives)$/;
  const parse = (src, rel) => { for (const sourceType of ['script', 'module']) { try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, locations: true }); } catch { } } throw new Error('unparseable: ' + rel); };
  // THE DOOR WALK (verify r2 F1 — a door under another name is still that door): ONE acorn pass per file gives every
  // write-door call by enclosing function, the file's require edges (by function, a non-literal one = dynamic) and the
  // identifiers each function names. An ALIAS resolves to its door before the name is matched: `const { rename: mv } =
  // require('node:fs/promises')`, `const w = fs.writeFile` (or `.bind(fs)`), `fsp['rename'](…)`, `fs.rename.call(…)` /
  // `.apply(…)`, `Reflect.apply(fs.rename, …)`, `(0, fs.rename)(…)`.
  const NON_GENERIC = /^(writePrivateFile|writePrivateFileAsync|writeCredentialFile|archiveCredentialFile|removeCredentialFile|moveCredentialArchives)$/;
  const walkOf = (src, rel) => {
    const ast = parse(src, rel);
    const kids = (n) => { const out = []; for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v); } return out; };
    const keyOf = (m) => (!m || m.type !== 'MemberExpression') ? null : !m.computed ? (m.property.type === 'Identifier' ? m.property.name : null)
      : m.property.type === 'Literal' && typeof m.property.value === 'string' ? m.property.value
      : m.property.type === 'TemplateLiteral' && !m.property.expressions.length ? m.property.quasis[0].value.cooked : null;
    const isReq = (n) => !!n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require';
    const FS_SPEC = /^(node:)?fs(\/promises)?$/;
    const alias = new Map(), fsLocal = new Set(['fs', 'fsp', 'fsP', 'fsPromises']);
    const fsSource = (e) => !!e && ((isReq(e) && e.arguments[0] && FS_SPEC.test(String(e.arguments[0].value))) || (e.type === 'Identifier' && fsLocal.has(e.name)) || (e.type === 'MemberExpression' && keyOf(e) === 'promises' && fsSource(e.object)) || (e.type === 'AwaitExpression' && fsSource(e.argument)));
    const doorOf = (e) => { // the door an expression NAMES (a function value), or null
      if (!e) return null;
      if (e.type === 'Identifier') return alias.get(e.name) || null;
      if (e.type === 'MemberExpression') { const k = keyOf(e); return k === 'call' || k === 'apply' || k === 'bind' ? doorOf(e.object) : k; }
      if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && keyOf(e.callee) === 'bind') return doorOf(e.callee.object);
      if (e.type === 'SequenceExpression') return doorOf(e.expressions[e.expressions.length - 1]);
      return null;
    };
    // pass 1: the aliases (to a fixpoint: an alias of an alias, `const fsp2 = fs.promises`)
    for (let round = 0; round < 4; round++) {
      const before = alias.size + fsLocal.size;
      (function p1(n) {
        if (n.type === 'VariableDeclarator' || (n.type === 'AssignmentExpression' && n.operator === '=')) {
          const id = n.type === 'VariableDeclarator' ? n.id : n.left, init = n.type === 'VariableDeclarator' ? n.init : n.right;
          if (id && id.type === 'ObjectPattern' && (fsSource(init) || isReq(init))) for (const p of id.properties) {
            if (p.type !== 'Property') continue;
            const k = p.computed ? (p.key.type === 'Literal' ? p.key.value : null) : (p.key.name || p.key.value);
            const v = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
            if (v.type === 'Identifier' && typeof k === 'string') { if (k === 'promises' && fsSource(init)) fsLocal.add(v.name); else if (WRITE.test(k) && k !== v.name) alias.set(v.name, k); else if (WRITE.test(k) && fsSource(init)) alias.set(v.name, k); }
          }
          if (id && id.type === 'Identifier' && init) {
            if (fsSource(init) || (init.type === 'MemberExpression' && keyOf(init) === 'promises' && fsSource(init.object))) fsLocal.add(id.name);
            else { const d = init.type === 'Identifier' || init.type === 'MemberExpression' || init.type === 'CallExpression' || init.type === 'SequenceExpression' ? doorOf(init) : null; if (d && WRITE.test(d) && !(init.type === 'CallExpression' && !(init.callee.type === 'MemberExpression' && keyOf(init.callee) === 'bind'))) alias.set(id.name, d); }
          }
        }
        kids(n).forEach(p1);
      })(ast);
      if (alias.size + fsLocal.size === before) break;
    }
    // pass 2: the calls, the require edges, the names each function uses
    const calls = [], reqs = [], idents = new Map(), top = new Map();
    const anc = [];
    const fnOf = () => { for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (a.type === 'MethodDefinition') return a.key.name || String(a.key.value); if (a.type === 'FunctionDeclaration') return a.id.name; } return '(top)'; };
    (function p2(n) {
      anc.push(n);
      if (n.type === 'Identifier') { const f = fnOf(); if (!idents.has(f)) idents.set(f, new Set()); idents.get(f).add(n.name); }
      if (n.type === 'ImportExpression') reqs.push({ fn: fnOf(), spec: n.source.type === 'Literal' ? String(n.source.value) : null, line: n.loc.start.line });
      if (n.type === 'ImportDeclaration') reqs.push({ fn: '(top)', spec: String(n.source.value), line: n.loc.start.line });
      if (n.type === 'CallExpression') {
        const c = n.callee;
        // a require edge: require('x') (a non-literal argument = dynamic), or X.require(…) / createRequire(…)(…) = dynamic
        if (isReq(n)) reqs.push({ fn: fnOf(), spec: n.arguments[0] && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' ? n.arguments[0].value : null, line: n.loc.start.line });
        else if ((c.type === 'MemberExpression' && keyOf(c) === 'require') || (c.type === 'CallExpression' && c.callee.type === 'Identifier' && c.callee.name === 'createRequire')) reqs.push({ fn: fnOf(), spec: null, line: n.loc.start.line });
        let name = null, resolved = false, positional = true; // resolved = reached through an alias / a computed key / .call / .apply / Reflect.apply / .bind
        if (c.type === 'Identifier') { if (alias.has(c.name)) { name = alias.get(c.name); resolved = true; } else name = c.name; }
        else if (c.type === 'MemberExpression') {
          const k = keyOf(c);
          if (k === 'apply' && c.object.type === 'Identifier' && c.object.name === 'Reflect') { name = doorOf(n.arguments[0]); resolved = true; positional = false; }
          else if (k === 'call' || k === 'apply') { name = doorOf(c.object); resolved = true; positional = false; }
          else { name = k; resolved = !!c.computed; }
        } else if (c.type === 'CallExpression' || c.type === 'SequenceExpression') { name = doorOf(c); resolved = true; }
        // a READ open (flag 'r' / none, in the positional form) is not a write door
        const readOpen = positional && /^open(Sync)?$/.test(name || '') && (n.arguments.length < 2 || /^'r'$/.test(src.slice(n.arguments[1].start, n.arguments[1].end)));
        // a generic door name counts as a member call (fs.x / fsp.x / fh.x) or a RESOLVED alias — a local `link()` helper is not one
        const generic = !NON_GENERIC.test(name || '');
        if (name && WRITE.test(name) && !readOpen && !(generic && c.type === 'Identifier' && !resolved)) {
          calls.push({ fn: fnOf(), name, args: n.arguments.map((x) => src.slice(x.start, x.end)).join(' , '), line: n.loc.start.line, ...(resolved ? { via: src.slice(c.start, c.end).slice(0, 60) } : {}) });
        }
      }
      // top-level require bindings: `const X = require('x')`, `const { a, b: c } = require('x')`, `const y = require('x').z`
      if (n.type === 'VariableDeclarator' && anc.length === 3 && anc[1].type === 'VariableDeclaration') {
        const init = n.init && n.init.type === 'MemberExpression' ? n.init.object : n.init;
        if (isReq(init) && init.arguments[0] && typeof init.arguments[0].value === 'string') {
          const names = n.id.type === 'Identifier' ? [n.id.name] : n.id.type === 'ObjectPattern' ? n.id.properties.map((p) => p.type === 'Property' ? (p.value.type === 'AssignmentPattern' ? p.value.left.name : p.value.name) : p.argument && p.argument.name).filter(Boolean) : [];
          for (const x of names) top.set(x, init.arguments[0].value);
        }
      }
      kids(n).forEach(p2);
      anc.pop();
    })(ast);
    return { calls, reqs, idents, top };
  };
  const callsOf = (src, rel) => walkOf(src, rel).calls;
  // every write accounts.js may do, by function — a new row is a new writer and must be judged here
  const ACC_ROWS = ['constructor rmSync', '_save writeFileSync', '_save renameSync', 'reloginResolve renameSync', 'importBundle writePrivateFile', 'mergeSubscription chmodSync', 'mergeSubscription writePrivateFile', 'mergeSubscription writePrivateFile', 'mergeSubscription moveCredentialArchives', 'mergeSubscription rmSync', 'remove unlinkSync', 'remove rmSync', 'remove rmSync', '_healPoolsAfterRemoval unlinkSync', '_healPoolsAfterRemoval unlinkSync', '_syncOatFileNow archiveCredentialFile', '_syncOatFileNow writeCredentialFile', '_syncOatFileNow removeCredentialFile', 'dropSessionPoolLink unlinkSync', 'sweepSessionPoolLinks unlinkSync', 'captureConsoleLogin rmSync'];
  // every content write account-material holds, by function: its two private writers (sync for a merge / an import,
  // fs.promises for the oat's acts) — the oat helpers reach content only through them
  const MAT_CONTENT = ['writePrivateFile', 'writePrivateFileAsync'];
  const srcFiles = []; (function ls(d) { for (const f of fs.readdirSync(path.join(REPO, d))) { const p = path.join(d, f); const st = fs.statSync(path.join(REPO, p)); if (st.isDirectory()) ls(p); else if (/\.(c?js|mjs)$/.test(f)) srcFiles.push(p); } })('src');
  // the oat's ACTS in accounts.js, by function: the modules THEY reach are the oat's closure (⑦) — each name must exist
  const OAT_ACT_FNS = ['_key', '_holdsCiphertext', '_enc', '_dec', 'setOat', 'clearOat', 'getOat', '_oatFact', 'noteCliVersion', '_oatFixture', 'oatFileCaps', 'syncOatFile', 'oatFileSettled', '_oatMemberLinked', '_syncOatFileNow', 'syncOatFiles', '_oatFileDoor', 'usageToken'];
  const parsed = new Map(), text8 = new Map(); // rel → the walk / the text of the file ON DISK (a planted override is walked fresh)
  const census = (override = {}) => {
    const read = (rel) => { if (rel in override) return override[rel]; if (!text8.has(rel)) text8.set(rel, fs.readFileSync(path.join(REPO, rel), 'utf8')); return text8.get(rel); };
    const walkRel = (rel) => { if (rel in override) return walkOf(override[rel], rel); if (!parsed.has(rel)) parsed.set(rel, walkOf(read(rel), rel)); return parsed.get(rel); };
    const callsOfRel = (rel) => walkRel(rel).calls;
    const acc = callsOfRel('src/accounts.js').map((c) => `${c.fn} ${c.name}`).sort();
    const want = ACC_ROWS.slice().sort();
    const extra = acc.filter((x, i, a) => a.filter((y) => y === x).length > want.filter((y) => y === x).length && a.indexOf(x) === i);
    const missing = want.filter((x, i, a) => a.filter((y) => y === x).length > acc.filter((y) => y === x).length && a.indexOf(x) === i);
    const matCalls = callsOfRel('src/account-material.js');
    const matContent = matCalls.filter((c) => /^(openSync|open|writeFileSync|writeFile|writeSync|write|appendFileSync|appendFile|createWriteStream|copyFileSync|copyFile)$/.test(c.name)).map((c) => c.fn);
    const credWrites = [];
    // (a call's arguments are text of its file: a file that never names a credentials path cannot write one — parse only those)
    const naming = (re) => srcFiles.filter((rel) => re.test(read(rel)));
    for (const rel of naming(/credentials\.json|subCredsPath\(|credsPath/)) for (const c of callsOfRel(rel)) if (/^(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|copyFileSync|copyFile|cpSync|renameSync|rename|openSync|open|writePrivateFile|writePrivateFileAsync|linkSync|link|symlinkSync|symlink)$/.test(c.name) && /credentials\.json|subCredsPath\(|credsPath/.test(c.args) && !(/^renameSync$|^rename$/.test(c.name) && /^src\b/.test(c.args))) credWrites.push(`${rel} ${c.fn} ${c.name}`);
    // ④ (verify r1 F6: all three oat acts, not the writer alone) — their callers across src
    const oatRoad = naming(/writeCredentialFile|archiveCredentialFile|removeCredentialFile/).filter((rel) => rel !== 'src/account-material.js').flatMap((rel) => callsOfRel(rel).filter((c) => /^(writeCredentialFile|archiveCredentialFile|removeCredentialFile)$/.test(c.name)).map((c) => `${rel} ${c.fn} ${c.name}`)).sort();
    // ⑤ the private writers' callers across src, by function (a write through a path VARIABLE is still a row)
    const privRoad = naming(/writePrivateFile/).flatMap((rel) => callsOfRel(rel).filter((c) => /^writePrivateFile(Async)?$/.test(c.name)).map((c) => `${rel} ${c.fn} ${c.name}`)).sort();
    // THE REQUIRE CLOSURE (verify r2 F1: a token write in a NEW module the clock or an act requires was invisible) —
    // src-local edges followed transitively; a package / builtin is a named external, a non-literal require is dynamic
    const known = new Set([...srcFiles, ...Object.keys(override)]);
    const resolve = (from, spec) => { const b0 = path.join(path.dirname(from), spec); for (const x of [b0, b0 + '.js', b0 + '.cjs', path.join(b0, 'index.js')]) if (known.has(x)) return x; return b0 + ' (unresolved)'; };
    const closureOf = (seeds) => {
      const mods = new Set(), ext = new Set(), dyn = [], queue = [];
      const take = (from, spec, fn) => { if (spec == null) { dyn.push(`${from} ${fn}`); return; } if (!/^\.\.?\//.test(spec)) { ext.add(spec.replace(/^node:/, '')); return; } const t = resolve(from, spec); if (!mods.has(t)) { mods.add(t); queue.push(t); } };
      for (const x of seeds) if (x.rel) { if (!mods.has(x.rel)) { mods.add(x.rel); queue.push(x.rel); } } else take(x.from, x.spec, x.fn);
      while (queue.length) { const rel = queue.shift(); if (!known.has(rel)) continue; for (const r of walkRel(rel).reqs) take(rel, r.spec, r.fn); }
      const doors = {}; for (const rel of mods) doors[rel] = known.has(rel) ? walkRel(rel).calls.map((x) => `${x.fn} ${x.name}`).sort() : ['(not a src file)'];
      return { mods: [...mods].sort(), ext: [...ext].sort(), dyn, doors };
    };
    // ⑥ the oat's clock: oat-file-sync.js AND its whole closure — no module, no require, not one door / material act
    const clk = closureOf([{ rel: 'src/server/oat-file-sync.js' }]);
    const clock = [...clk.mods.filter((m) => m !== 'src/server/oat-file-sync.js').map((m) => 'module ' + m), ...clk.ext.map((x) => 'require ' + x), ...clk.dyn.map((x) => 'dynamic require ' + x), ...Object.entries(clk.doors).flatMap(([rel, d]) => d.map((x) => `${rel} ${x}`))];
    // ⑦ accounts.js' oat ACTS: the modules they require (inline, or a top-level binding a function names), transitively
    const accW = walkRel('src/accounts.js');
    const actSeeds = accW.reqs.filter((r) => OAT_ACT_FNS.includes(r.fn)).map((r) => ({ from: 'src/accounts.js', spec: r.spec, fn: r.fn }));
    for (const f of OAT_ACT_FNS) for (const id of (accW.idents.get(f) || [])) if (accW.top.has(id)) actSeeds.push({ from: 'src/accounts.js', spec: accW.top.get(id), fn: f });
    const act = closureOf(actSeeds);
    // ⑧ every module edge accounts.js has, by function (a new one — a module some function reaches — is judged here)
    const accEdges = [...new Set(accW.reqs.map((r) => `${r.fn} ${r.spec == null ? '(dynamic)' : r.spec}`))].sort();
    const actFnsMissing = OAT_ACT_FNS.filter((f) => !accW.idents.has(f));
    return { extra, missing, matContent: [...new Set(matContent)].sort(), credWrites, oatRoad, privRoad, clock, act, accEdges, actFnsMissing };
  };
  const c = census();
  ok(c.extra.length === 0 && c.missing.length === 0, `THE ONE-WRITER CENSUS ①: accounts.js holds exactly its ${ACC_ROWS.length} named write rows (the oat's three are _syncOatFileNow's archive / write / remove; merge + import go through writePrivateFile; the merge moves archives)`, c);
  ok(JSON.stringify(c.matContent) === JSON.stringify(MAT_CONTENT), '② account-material writes CONTENT only inside writePrivateFile / writePrivateFileAsync (tmp `wx` 0600 + fsync + rename / link)', c.matContent);
  ok(JSON.stringify(c.credWrites) === JSON.stringify(['src/account-material.js writeCredentialFile writePrivateFileAsync']), '③ across every src file, ONE call writes a path naming a credentials file: account-material\'s writeCredentialFile', c.credWrites);
  ok(JSON.stringify(c.oatRoad) === JSON.stringify(['src/accounts.js _syncOatFileNow archiveCredentialFile', 'src/accounts.js _syncOatFileNow removeCredentialFile', 'src/accounts.js _syncOatFileNow writeCredentialFile']), '④ the oat\'s three acts (write / archive / remove) have ONE caller across src: accounts._syncOatFileNow (reached from setOat / clearOat / the CLI version / the sweep / a merge / an import)', c.oatRoad);
  ok(JSON.stringify(c.privRoad) === JSON.stringify(['src/account-material.js removeCredentialFile writePrivateFileAsync', 'src/account-material.js writeCredentialFile writePrivateFileAsync', 'src/accounts.js importBundle writePrivateFile', 'src/accounts.js mergeSubscription writePrivateFile', 'src/accounts.js mergeSubscription writePrivateFile']), '⑤ the private writers have their named callers across src (the oat writer, the remover keeping the CLI\'s keys, the import, the merge ×2 — its survivor\'s other keys archived first, verify r2 F3) — a write through a path variable is still a row', c.privRoad);
  ok(c.clock.length === 0, '⑥ the oat\'s clock — src/server/oat-file-sync.js AND its whole require closure (verify r2 F1) — requires no module, calls not one write door or material act (aliases resolved) — the store is the actor', c.clock);
  // ⑦ (verify r2 F1) the oat's ACTS: every module accounts.js' oat functions reach (an inline require, or a top-level binding a
  // function names), transitively — each a NAMED module with its NAMED write doors by function, the externals named
  const ACT_MODULES = {
    'src/account-material.js': ['archiveCredentialFile chmod', 'archiveCredentialFile link', 'archiveCredentialFile rename', 'archiveCredentialFile unlink', 'linkInto link', 'linkInto rename', 'moveAside rename', 'moveCredentialArchives renameSync', 'putBack chmod', 'putBack link', 'putBack unlink', 'removeCredentialFile unlink', 'removeCredentialFile writePrivateFileAsync', 'repointPoolSymlink renameSync', 'repointPoolSymlink symlinkSync', 'writeCredentialFile chmod', 'writeCredentialFile writePrivateFileAsync', 'writePrivateFile openSync', 'writePrivateFile renameSync', 'writePrivateFile unlinkSync', 'writePrivateFile writeFileSync', 'writePrivateFileAsync chmod', 'writePrivateFileAsync open', 'writePrivateFileAsync rename', 'writePrivateFileAsync unlink', 'writePrivateFileAsync unlink', 'writePrivateFileAsync writeFile'],
    'src/backend-caps.js': [], 'src/cli-caps.js': [], 'src/key-file.js': [], 'src/login-expiry.js': [], // lane key-file-law-stores: + src/key-file.js (PURE, THE KEY-FILE LAW)
    'src/secret-box.js': ['mintKeyFile linkSync', 'mintKeyFile unlinkSync', 'mintKeyFile writeFileSync', 'mintKeyFile writeFileSync'], // the KEY file (O1's mint, through lawfulKey), never a credential; key-file-law-fix L2: the no-hard-link fallback is a second, exclusive 'wx' write (no rename) // the KEY file (O1's mint, through lawfulKey), never a credential
  };
  const ACT_EXT = ['crypto', 'fs', 'path'];
  const actOk = (cx) => JSON.stringify(cx.act.mods) === JSON.stringify(Object.keys(ACT_MODULES).sort()) && JSON.stringify(cx.act.ext) === JSON.stringify(ACT_EXT) && !cx.act.dyn.length && Object.entries(ACT_MODULES).every(([rel, rows]) => JSON.stringify(cx.act.doors[rel] || []) === JSON.stringify(rows.slice().sort()));
  ok(c.actFnsMissing.length === 0, `⑦ the ${OAT_ACT_FNS.length} oat functions the closure starts from all exist in accounts.js (a rename would empty the seed silently)`, c.actFnsMissing);
  ok(actOk(c), `⑦ the oat acts reach exactly ${Object.keys(ACT_MODULES).length} modules (account-material's named doors, secret-box's key mint, four PURE modules with none) and only ${ACT_EXT.join(' / ')} — no dynamic require`, { mods: c.act.mods, ext: c.act.ext, dyn: c.act.dyn, doors: Object.fromEntries(Object.entries(c.act.doors).filter(([rel, d]) => JSON.stringify(d) !== JSON.stringify((ACT_MODULES[rel] || ['(unnamed)']).slice().sort()))) });
  // ⑧ every module edge accounts.js has, by function — a NEW one (a module a function reaches) is judged here first
  const ACC_EDGES = ['(top) ./backend-caps.js', '(top) ./cli-caps.js', '(top) ./harnesses', '(top) ./login-expiry.js', '(top) ./login-state.js', '(top) ./oat-identity-model.js', '(top) ./secret-box.js', '(top) ./slot-transitions.js', '(top) crypto', '(top) fs', '(top) os', '(top) path', '_healPoolsAfterRemoval ./account-material.js', '_syncOatFileNow ./account-material.js', 'ensureSessionPoolLink ./account-material.js', 'importBundle ./account-material.js', 'mergeSubscription ./account-material.js', 'setPoolTarget ./account-material.js'];
  ok(JSON.stringify(c.accEdges) === JSON.stringify(ACC_EDGES), `⑧ accounts.js requires exactly its ${ACC_EDGES.length} named module edges, by function (verify r2 F1: an inline require in an act was a door nobody counted)`, c.accEdges.filter((x) => !ACC_EDGES.includes(x)).concat(ACC_EDGES.filter((x) => !c.accEdges.includes(x)).map((x) => '-' + x)));
  const planted = accSrc.replace("    a.oatEnc = this._enc(token);\n", "    a.oatEnc = this._enc(token);\n    fs.writeFileSync(this.subCredsPath(id), JSON.stringify({ claudeAiOauth: { accessToken: token } }), { mode: 0o600 });\n");
  const cp = planted !== accSrc ? census({ 'src/accounts.js': planted }) : null;
  ok(!!cp && cp.extra.includes('setOat writeFileSync') && cp.credWrites.some((x) => /^src\/accounts\.js setOat/.test(x)), 'RED control (invariant 2): a planted writer in setOat is a new accounts.js row AND a second credentials-file write', cp && { extra: cp.extra, credWrites: cp.credWrites });
  const matSrc = fs.readFileSync(path.join(REPO, 'src/account-material.js'), 'utf8');
  const plantedM = matSrc.replace("  await writePrivateFileAsync(path.join(dir, '.credentials.json'), JSON.stringify(body), { expect });", "  await fsp.writeFile(path.join(dir, '.credentials.json'), JSON.stringify(body), { mode: 0o600 });");
  const cm = plantedM !== matSrc ? census({ 'src/account-material.js': plantedM }) : null;
  ok(!!cm && cm.matContent.includes('writeCredentialFile'), 'RED control (invariant 2): writeCredentialFile writing around its private writer (non-atomic) is caught', cm && cm.matContent);
  // the verifier's GUARDED plants (pool-oat-verify p/mutants.py g1–g6: `if (process.env.POV_NEVER)` — never run in a
  // suite, so only the STRUCTURE can see them), planted in the oat's clock
  const syncSrc = fs.readFileSync(path.join(REPO, 'src/server/oat-file-sync.js'), 'utf8');
  const SA = '      caps = accounts.noteCliVersion(v);      // a changed verdict re-syncs every row itself\n';
  const G = {
    g1: "if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { try { require('fs').writeFileSync(require('path').join(accounts.subDir(a.id), '.credentials.json'), '{}'); } catch { } }",
    g2: "if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { try { const p = accounts.subCredsPath(a.id); require('fs').writeFileSync(p, accounts.getOat(a.id) || ''); } catch { } }",
    g3: "if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { try { const p = accounts.subCredsPath(a.id); require('../account-material.js').writePrivateFile(p, '{}'); } catch { } }",
    g4: "if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { try { require('../account-material.js').removeCredentialFile(accounts.subDir(a.id)); } catch { } }",
    g5: "if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { try { require('../account-material.js').archiveCredentialFile(accounts.subDir(a.id)); } catch { } }",
    g6: "if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { try { require('fs').writeFileSync(require('path').join(accounts.subDir(a.id), 'oat.txt'), accounts.getOat(a.id) || ''); } catch { } }",
  };
  const gRed = {};
  for (const [g, code] of Object.entries(G)) {
    if (!syncSrc.includes(SA)) { gRed[g] = 'anchor missing'; continue; }
    const cg = census({ 'src/server/oat-file-sync.js': syncSrc.replace(SA, SA + '      ' + code + '\n') });
    gRed[g] = [cg.clock.length ? '⑥' : '', JSON.stringify(cg.oatRoad) !== JSON.stringify(c.oatRoad) ? '④' : '', JSON.stringify(cg.privRoad) !== JSON.stringify(c.privRoad) ? '⑤' : '', cg.credWrites.length !== c.credWrites.length ? '③' : ''].filter(Boolean).join('');
  }
  // verify r2's GUARDED plants (pool-oat-verify-r2 p/mutants-r2.py r2a2 / r2a4 / r2b2 / r2b4 — GREEN on c9fea70ad) + this lane's own:
  // a NEW module the clock requires, an aliased rename in the clock and in the actor, Reflect.apply, a PURE module of the act
  // closure growing a write through a computed key, a two-hop new module writing via .call, a dynamic require
  const CACHE_MOD = "'use strict';\nconst fsp = require('fs').promises;\nconst path = require('path');\nasync function keep(accounts, where) {\n  for (const a of (accounts.list().accounts || [])) {\n    const t = accounts.getOat(a.id); if (!t) continue;\n    const dest = where === 'member' ? path.join(accounts.subDir(a.id), '.oat-cache') : path.join(path.dirname(accounts.subDir(a.id)), '..', 'oat-cache-' + a.id);\n    try { await fsp.writeFile(dest, t, { mode: 0o600 }); } catch { }\n  }\n}\nmodule.exports = { keep };\n";
  const ACT_A = "    const v = materializeVerdict({ file: seen.file, fileState: seen.fileState, dirState: seen.dirState, oat: fact && { ...fact, readable: !!token }, ours, current, shape, caps, linked }, now);\n";
  const leSrc = fs.readFileSync(path.join(REPO, 'src/login-expiry.js'), 'utf8');
  const LE_A = "function oatFileBody(token, { expiresAt, shape, mintedAt = null, account = null } = {}) {\n";
  const clockPlant = (code) => syncSrc.replace(SA, SA + '      ' + code + '\n');
  const R2 = {
    'r2a2 new module (member)': { 'src/server/oat-file-cache.js': CACHE_MOD, 'src/server/oat-file-sync.js': clockPlant("if (process.env.POV_NEVER) await require('./oat-file-cache.js').keep(accounts, 'member');") },
    'r2a4 new module (data dir)': { 'src/server/oat-file-cache.js': CACHE_MOD, 'src/server/oat-file-sync.js': clockPlant("if (process.env.POV_NEVER) await require('./oat-file-cache.js').keep(accounts, 'data');") },
    'r2b2 { rename: mv } in the clock': { 'src/server/oat-file-sync.js': clockPlant("if (process.env.POV_NEVER) for (const a of (accounts.list().accounts || [])) { const { rename: mv } = require('node:fs/promises'); const p = accounts.subCredsPath(a.id); try { await mv(p, p + '.dead-' + Date.now()); } catch { } }") },
    'r2b4 { rename: mv } in the actor': { 'src/accounts.js': accSrc.replace(ACT_A, ACT_A + "    if (process.env.POV_NEVER && v.verdict === 'keep-login') { const { rename: mv } = require('node:fs/promises'); try { await mv(path.join(dir, '.credentials.json'), path.join(dir, '.credentials.json.dead-' + now)); } catch { } }\n") },
    'own Reflect.apply in the actor': { 'src/accounts.js': accSrc.replace(ACT_A, ACT_A + "    if (process.env.POV_NEVER) await Reflect.apply(fs.promises.rename, fs.promises, [path.join(dir, '.credentials.json'), path.join(dir, '.x')]);\n") },
    'own PURE login-expiry writes (computed key)': { 'src/login-expiry.js': leSrc.replace(LE_A, LE_A + "  if (process.env.POV_NEVER) require('fs')['appendFileSync'](require('os').tmpdir() + '/oat-x', String(token));\n") },
    'own two-hop module via .call': { 'src/server/oat-a.js': "module.exports = require('./oat-b.js');\n", 'src/server/oat-b.js': "const fsp = require('fs').promises;\nmodule.exports = { keep: (accounts) => Promise.all((accounts.list().accounts || []).map((a) => fsp.writeFile.call(fsp, '/tmp/oat-' + a.id, accounts.getOat(a.id) || ''))) };\n", 'src/server/oat-file-sync.js': clockPlant("if (process.env.POV_NEVER) await require('./oat-a.js').keep(accounts);") },
    'own dynamic require': { 'src/server/oat-file-sync.js': clockPlant("if (process.env.POV_NEVER) require(['..', 'account-material.js'].join('/')).writePrivateFile(accounts.subCredsPath('x'), '{}');") },
  };
  const r2Red = {};
  for (const [name, ov] of Object.entries(R2)) {
    if (Object.entries(ov).some(([rel, v]) => fs.existsSync(path.join(REPO, rel)) && v === fs.readFileSync(path.join(REPO, rel), 'utf8'))) { r2Red[name] = 'anchor missing'; continue; }
    const cr = census(ov);
    r2Red[name] = [cr.clock.length ? '⑥' : '', !actOk(cr) ? '⑦' : '', JSON.stringify(cr.accEdges) !== JSON.stringify(c.accEdges) ? '⑧' : '', cr.extra.length || cr.missing.length ? '①' : ''].filter(Boolean).join('') || 'GREEN';
  }
  ok(Object.values(r2Red).every((x) => /^[①⑥⑦⑧]+$/.test(x)), 'RED controls (verify r2 F1): the verifier\'s four GREEN guarded plants and this lane\'s four — a new module (two hops too), an aliased / Reflect.apply rename, a PURE module growing a computed-key write, a dynamic require — are each RED by structure: ' + JSON.stringify(r2Red), r2Red);
  ok(Object.values(gRed).every((x) => /⑥/.test(x)) && /④/.test(gRed.g4) && /④/.test(gRed.g5) && /⑤/.test(gRed.g3), 'RED controls (verify r1 F6): the verifier\'s six GUARDED plants in the oat\'s clock — a literal path, a path variable, writePrivateFile(var), a remover without "ours?", a foreign archive, a second plaintext copy — are each RED by structure (⑥ every one; ④ the remove + archive; ⑤ the private writer): ' + JSON.stringify(gRed), gRed);

  // THE BEHAVIOUR CENSUS (verify r1 F6): every oat flow, a stack-aware spy on every mutation door
  const SYNC_DOORS = ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'chmodSync', 'symlinkSync', 'linkSync', 'copyFileSync', 'truncateSync', 'utimesSync', 'mkdirSync', 'openSync', 'cpSync'];
  const ASYNC_DOORS = ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'chmod', 'symlink', 'link', 'copyFile', 'truncate', 'utimes', 'mkdir', 'open', 'cp'];
  // every flow token shares this tail (the per-member tokens differ only before it)
  const FLOW_TAIL = TOKEN.slice(TOKEN.indexOf('TOKEN_'), TOKEN.indexOf('TOKEN_') + 30);
  const seen8 = new Map(); // path → `${ino}:${mtimeMs}:${size}` → holds the tail? (an unchanged file cannot have gained bytes)
  const behaviour = async (AM, { plantTick = null, drop = false } = {}) => {
    const lim0 = Error.stackTraceLimit; Error.stackTraceLimit = 64; // the async frames (who awaited whom) sit deep
    const root = fs.mkdtempSync(path.join(tmpBase, 'beh-'));
    const am = new AM({ dataDir: path.join(root, 'data') });
    const subs = path.join(am.dataDir, 'subs') + path.sep;
    const rows = [];
    // THE WHOLE DISK (verify r2 F1: a token copy written OUTSIDE every member dir was unseen): after each step, every regular
    // file under the suite's tmp root (this run's data dir included) is read for the flow's token bytes — the one place allowed
    // is <a data dir>/subs/<member>/.credentials.json (another behaviour run's root is that run's to judge)
    const disk = [];
    const look = (step) => { (function scan(d) { let names = []; try { names = fs.readdirSync(d); } catch { } for (const f of names) { const p = path.join(d, f); if (d === tmpBase && f.startsWith('beh-') && p !== root) continue; let st; try { st = fs.lstatSync(p); } catch { continue; } if (st.isDirectory()) scan(p); else if (st.isFile() && st.size < 4e6) { const sig = `${st.ino}:${st.mtimeMs}:${st.size}`, c8 = seen8.get(p); let hit; if (c8 && c8.sig === sig) hit = c8.hit; else { let b = ''; try { b = fs.readFileSync(p, 'latin1'); } catch { } hit = b.includes(FLOW_TAIL); seen8.set(p, { sig, hit }); } if (hit && !/(^|\/)data\/subs\/[^/]+\/\.credentials\.json$/.test(path.relative(tmpBase, p))) disk.push(`${step}: ${path.relative(tmpBase, p)}`); } } })(tmpBase); };
    const inMember = (p) => typeof p === 'string' && p.startsWith(subs) && p.length > subs.length;
    const wrap = (obj, k, kind, flagsAt = -1) => { const k0 = obj[k]; obj[k] = function (...a) {
      const ps = [a[0], a[1]].filter((x) => typeof x === 'string' || Buffer.isBuffer(x)).map(String);
      const writes = !(flagsAt >= 0 && !/[wax+]/.test(String(a[flagsAt] || 'r')));
      if (writes && ps.some(inMember)) rows.push({ door: kind + k, path: path.relative(subs, ps.find(inMember)), stack: String(new Error().stack) });
      return k0.apply(this, a);
    }; return () => { obj[k] = k0; }; };
    const unwrap = [...SYNC_DOORS.map((k) => wrap(fs, k, '', k === 'openSync' ? 1 : -1)), ...ASYNC_DOORS.map((k) => wrap(fs.promises, k, 'promises.', k === 'open' ? 1 : -1))];
    const L = (now) => ({ claudeAiOauth: { accessToken: 'acc-' + Math.random().toString(36).slice(2), refreshToken: 'ref-x', expiresAt: now + 3600e3, refreshTokenExpiresAt: now + 20 * 864e5, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } });
    const D = (now) => ({ claudeAiOauth: { accessToken: 'acc-dead', refreshToken: 'ref-dead', expiresAt: now - 7200e3, refreshTokenExpiresAt: now - 3600e3, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } });
    let ids = null;
    try {
      // members made with the spy OFF (createSubscription seeds its dir — not an oat act)
      unwrap.forEach((u) => u());
      const now = Date.now();
      ids = { dead: am.createSubscription({ name: 'Dead' }).id, live: am.createSubscription({ name: 'Live' }).id, wiped: am.createSubscription({ name: 'Wiped' }).id, mcp: am.createSubscription({ name: 'MCP' }).id, held: am.createSubscription({ name: 'Held' }).id };
      fs.writeFileSync(path.join(am.subDir(ids.dead), '.credentials.json'), JSON.stringify(D(now)), { mode: 0o600 });
      fs.writeFileSync(path.join(am.subDir(ids.live), '.credentials.json'), JSON.stringify(L(now)), { mode: 0o600 });
      fs.writeFileSync(path.join(am.subDir(ids.wiped), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: now - 864e5, scopes: ['user:inference'], subscriptionType: 'pro' } }), { mode: 0o600 });
      fs.writeFileSync(path.join(am.subDir(ids.mcp), '.credentials.json'), JSON.stringify({ ...D(now), mcpOAuth: { 's|1': { accessToken: 'm' } } }), { mode: 0o600 });
      fs.writeFileSync(path.join(am.subDir(ids.held), '.credentials.json'), JSON.stringify(D(now)), { mode: 0o600 });
      const P = am.createPool({ name: 'P' }).id;
      unwrap.splice(0, unwrap.length, ...SYNC_DOORS.map((k) => wrap(fs, k, '', k === 'openSync' ? 1 : -1)), ...ASYNC_DOORS.map((k) => wrap(fs.promises, k, 'promises.', k === 'open' ? 1 : -1)));
      // the flows: gate shut → mint ×5; the CLI measured (the sweep materializes); a re-mint; a sweep; the oat-file-sync tick
      for (const [k, id] of Object.entries(ids)) am.setOat(id, TOKEN.replace('Q7fake', 'Q7' + k.slice(0, 4)));
      await am.oatFileSettled(); look('mint ×5, gate shut');
      am.noteCliVersion('2.1.296 (Claude Code)'); await am.oatFileSettled(); look('the CLI measured');
      am.setOat(ids.dead, TOKEN); await am.oatFileSettled(); look('a re-mint');
      await am.syncOatFiles(); look('a sweep');
      const S8 = plantTick ? (() => { const f = path.join(REPO, 'src/server/oat-file-sync.js'); const m = new Module8(f, null); m.filename = f; m.paths = Module8._nodeModulePaths(path.dirname(f)); m._compile(plantTick, f); return m.exports; })() : require(path.join(REPO, 'src/server/oat-file-sync.js'));
      const h = S8.start({ accounts: am, machineProbes: { cliVersion: async () => '2.1.296 (Claude Code)' }, claudeCmd: 'x', log: () => { }, bootDelayMs: 1e9, recheckMs: 1e9 });
      await h.tick(); look('the clock\'s tick');
      // a link on `held`, then an unmeasured CLI (the held file stays, the others go), the link ends, the next tick takes it back
      unwrap.forEach((u) => u()); am.ensureSessionPoolLink(P, 'sess-1-1791900000000', ids.held, { why: 'spawn' }); unwrap.splice(0, unwrap.length, ...SYNC_DOORS.map((k) => wrap(fs, k, '', k === 'openSync' ? 1 : -1)), ...ASYNC_DOORS.map((k) => wrap(fs.promises, k, 'promises.', k === 'open' ? 1 : -1)));
      am.noteCliVersion('2.1.300 (Claude Code)'); await am.oatFileSettled(); look('an unmeasured CLI');
      unwrap.forEach((u) => u()); am.dropSessionPoolLink(P, 'sess-1-1791900000000'); unwrap.splice(0, unwrap.length, ...SYNC_DOORS.map((k) => wrap(fs, k, '', k === 'openSync' ? 1 : -1)), ...ASYNC_DOORS.map((k) => wrap(fs.promises, k, 'promises.', k === 'open' ? 1 : -1)));
      await h.tick(); h.stop(); look('the next tick');
      // back on the measured CLI, clearOat everywhere (ours only goes; the mcp member keeps its key)
      am.noteCliVersion('2.1.296'); await am.oatFileSettled();
      for (const id of Object.values(ids)) am.clearOat(id);
      await am.oatFileSettled(); look('clearOat ×5');
    } finally { unwrap.forEach((u) => u()); Error.stackTraceLimit = lim0; }
    if (drop) fs.rmSync(root, { recursive: true, force: true });
    const ACT = /(writeCredentialFile|archiveCredentialFile|removeCredentialFile) \([^)\n]*account-material\.js/;
    const judged = rows.map((x) => {
      const actor = /_syncOatFileNow/.test(x.stack) && ACT.test(x.stack);
      const act = (/removeCredentialFile/.test(x.stack) && 'remove') || (/archiveCredentialFile/.test(x.stack) && 'archive') || (/writeCredentialFile/.test(x.stack) && 'write') || null;
      const removal = /unlink|rm$/.test(x.door) && path.basename(x.path) === '.credentials.json'; // (the writer dropping its own tmp is part of the write)
      return { door: x.door, path: x.path.replace(/sub-[0-9a-f]+/, 'sub-…'), ok: actor && (!removal || act === 'remove'), act };
    });
    return { rows: judged, disk, bad: judged.filter((x) => !x.ok), acts: [...new Set(judged.map((x) => x.act))].sort(), live: (() => { try { return JSON.parse(fs.readFileSync(path.join(am.subDir(ids.live), '.credentials.json'), 'utf8')).claudeAiOauth.refreshToken === 'ref-x'; } catch { return false; } })(), mcpKept: (() => { try { return !!JSON.parse(fs.readFileSync(path.join(am.subDir(ids.mcp), '.credentials.json'), 'utf8')).mcpOAuth; } catch { return false; } })() };
  };
  const b = await behaviour(AccountManager);
  ok(b.rows.length >= 10 && b.bad.length === 0 && JSON.stringify(b.acts) === JSON.stringify(['archive', 'remove', 'write']), `THE BEHAVIOUR CENSUS: every flow (mint ×5 gate shut, the CLI measured, a re-mint, a sweep, an oat-file-sync tick, a link + an unmeasured CLI + the link's end, clearOat ×5) — ${b.rows.length} mutations inside member dirs, each by write / archive / remove reached from the store's one actor; every removal through the remover`, { n: b.rows.length, bad: b.bad.slice(0, 4), acts: b.acts });
  ok(b.live && b.mcpKept, '…and through all of it the LIVE login is byte-intact and the CLI\'s mcpOAuth stays in service', { live: b.live, mcp: b.mcpKept });
  ok(b.disk.length === 0, 'THE WHOLE DISK (verify r2 F1): after each of the 9 steps, no regular file under the suite\'s tmp root holds a flow token\'s bytes but a member\'s .credentials.json', b.disk.slice(0, 6));
  // RED controls: plants that RUN (the guarded ones are the structure's), in the clock and in the store
  const bRed = {};
  for (const [name, code] of [
    ['a write through a path variable (c2)', "for (const a of (accounts.list().accounts || [])) { try { const p = accounts.subCredsPath(a.id); require('fs').writeFileSync(p + '.x', '{}'); } catch { } }"],
    ['a rename through a variable (c6)', "for (const a of (accounts.list().accounts || [])) { try { const p = accounts.subCredsPath(a.id); require('fs').renameSync(p, p + '.x'); require('fs').renameSync(p + '.x', p); } catch { } }"],
    ['a second plaintext copy (oat.txt)', "for (const a of (accounts.list().accounts || [])) { try { require('fs').writeFileSync(require('path').join(accounts.subDir(a.id), 'oat.txt'), 'x'); } catch { } }"],
    ['a remover without "ours?" (c4)', "for (const a of (accounts.list().accounts || [])) { try { await require('../account-material.js').removeCredentialFile(accounts.subDir(a.id), { isOurs: () => true }); } catch { } }"],
    // verify r2 r2a3 (GREEN on c9fea70ad): an UNGUARDED copy of every token OUTSIDE every member dir — only the whole-disk scan sees it
    ['a token copy in the data dir (r2a3)', "for (const a of (accounts.list().accounts || [])) { const t = accounts.getOat(a.id); if (t) { try { require('fs').writeFileSync(require('path').join(accounts.subDir(a.id), '..', '..', 'oat-cache-' + a.id), t, { mode: 0o600 }); } catch { } } }"],
  ]) {
    const bb = syncSrc.includes(SA) ? await behaviour(AccountManager, { plantTick: syncSrc.replace(SA, SA + '      ' + code + '\n'), drop: true }) : null;
    bRed[name] = bb ? { bad: bb.bad.length, disk: bb.disk.length } : 'anchor missing';
  }
  ok(Object.values(bRed).every((n) => n && typeof n === 'object' && n.bad + n.disk > 0) && bRed['a token copy in the data dir (r2a3)'].disk > 0, 'RED controls (verify r1 F6 + r2 F1): plants that RUN in the clock — a path-variable write, a rename, a plaintext copy, a remover handed a yes-man "ours?" (stacks not the store\'s actor), a token copy outside every member dir (the whole-disk scan) — are each caught by the behaviour census: ' + JSON.stringify(bRed), bRed);
}
fs.rmSync(tmpBase, { recursive: true, force: true });
console.log(`\ntest-oat-mint: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
