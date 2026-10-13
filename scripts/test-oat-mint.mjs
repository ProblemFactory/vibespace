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
const TOKEN = ['sk', '-ant-oat01-'].join('') + 'Q7fakeTOKEN_' + 'a1B2c3D4e5F6g7H8'.repeat(5) + '-zz';
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
  const anchors = { [sub]: winOf(PANEL_A), [sub2]: winOf(PANEL_B) };
  ok(anchors[sub].sevenDay && anchors[sub2].sevenDay && anchors[sub].sevenDay !== anchors[sub2].sevenDay, 'fixture: two rows with distinct weekly anchors');
  const probeFacts0 = readRec().filter((x) => x.probe).length;
  r = await runMint(O, sub, { ident: null, probe: true, panel: PANEL_A, windows: () => anchors });
  const pf = readRec().filter((x) => x.probe).slice(probeFacts0);
  ok(r.m.phase === 'saved' && am.getOat(sub) === TOKEN && r.js.some((j) => j.outcome === 'fingerprint-proven'), "the panel's window = the row's own anchor (no one else's) ⇒ saved, journaled fingerprint-proven", { m: r.m, js: r.js });
  ok(pf.length === 1 && pf[0].argv.join(' ') === '-p /usage --strict-mcp-config' && pf[0].tokenIsTheMinted && !pf[0].tokenInArgv && pf[0].config.startsWith(scratchRoot) && !pf[0].apiKey,
    'ONE probe: argv = PANEL_PROBE_ARGS (never a prompt), the NEW token in its env (never argv), the mint\'s scratch config, no hub key', pf);
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
fs.rmSync(tmpBase, { recursive: true, force: true });
console.log(`\ntest-oat-mint: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
