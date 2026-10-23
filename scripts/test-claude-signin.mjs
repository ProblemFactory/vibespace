#!/usr/bin/env node
// test-claude-signin — the humane Claude sign-in ORCH over a FAKE claude (lane
// door-signin-card): the hub drives the subscription-login helper in a PTY it
// owns, the PURE src/signin-model.js reads the screen, the pasted code reaches
// ONLY the PTY, and the credential is the helper's (this ORCH never finalizes —
// the client calls the existing /finalize routes).
//   ① start → the fake is spawned as the HELPER (node helperPath --config-dir
//      <account dir> --claude <claude>), cwd a 0700 scratch, env the oat-mint
//      ALLOWLIST (HOME=scratch, CLAUDE_CONFIG_DIR=account dir, no hub secret);
//   ② the URL screen → phase url → waiting-code, the broadcast carries the URL,
//      publicSignin leaks no scratch path / pty / parse;
//   ③ sendCode writes the code (+\r) to the PTY and NOWHERE else → phase connecting;
//   ④ the helper's "subscription credentials saved." → connected + the scratch wiped;
//   ⑤ an error screen → failed with the CLI line;
//   ⑥ exit 0 + the helper's success status file, no "saved" line → connected (backstop);
//   ⑦ one sign-in per account (a second start while live → 409);
//   ⑧ cancel → cancelled + the PTY killed;
//   ⑨ SPY: the pasted code never appears in ANY broadcast;
//   ⑩ the routes refuse an agent bearer by name (human-only).
// THE VERIFY ROUND (lane door-signin-fixes — each leg below was RED on 959d583e):
//   ⑪ claim 2: an ECHOING pty (a tty echoes the pasted code onto the prompt's line) and a CLI that
//      dies SILENTLY after the code → the published error (every broadcast + the GET answer) holds
//      neither the code nor the prompt — a fixed sentence; before any code, a bare prompt line is
//      never published either (the last line is cut at the prompt); oat-mint-model's redact masks
//      what stands after the prompt;
//   ⑫ claim 4: the run is HELD by the page that started it — the holder's socket closing with no
//      re-hold within orphanMs cancels it (PTY killed); a re-hold (a reconnect) keeps it; the
//      module's WS seam (socketHold / socketClosed) reaches the hub instance;
//   ⑬ debris: the REAL AccountManager — three failed attempts leave ONE never-signed-in row (the
//      card's row is reused), a success converts it (the mark cleared, never swept), a marked row
//      past the TTL with no live run is swept at the next start and at boot; a terminal-Add row,
//      a signed-in row and a row with a live run never are;
//   ⑭ REAL node-pty + the REAL helper + a fake `claude` (sh): close (the DELETE route) → helper +
//      grandchild gone ≤ 1.5 s, scratch removed; the holder's socket closing → the same; a fake
//      that READS the code on a real tty (echoed by the line discipline) and exits 1 silently →
//      the published error holds no code.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGNIN = require(path.join(ROOT, 'src/server/claude-signin.js'));
const { create, registerSigninRoutes } = SIGNIN;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 400)); } };
// a leg that THROWS (a seam the tree does not have yet) is a failed leg, never a crashed suite
const leg = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log('  ✗ ' + name + ' — threw: ' + String((e && e.message) || e).slice(0, 200)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T_START = Date.now();

const ESC = '\x1b';
const URL = 'https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a&scope=user%3Ainference&state=abcdef0123';
const S_URL = 'Browser didn’t open? Use the url below to sign in (c to copy):\r\r\n\r\r\n' + ESC + ']8;;' + URL + '\x07' + URL + ESC + ']8;;\x07' + '\r\r\n\r\r\nPaste' + ESC + '[2C' + 'code here if prompted >' + ESC + '[1C';
const S_OK = '\r\r\nVibeSpace: subscription credentials saved.\r\r\n';
const S_ERR = '\r\r\nOAuth error: that code was rejected\r\r\n';

function makeFake({ echo = false } = {}) {
  let onData = () => { }, onExit = () => { };
  const fp = { killed: false, writes: [], opts: null,
    onData: (cb) => { onData = cb; }, onExit: (cb) => { onExit = cb; },
    // echo: what is written comes back on the screen, as a real tty's line discipline (or Ink's text field) does
    write: (d) => { fp.writes.push(d); if (echo) onData(String(d).replace(/\r$/, '\r\r\n')); }, kill: () => { fp.killed = true; },
    emit: (d) => onData(d), exit: (code) => onExit({ exitCode: code }) };
  return fp;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'signin-test-'));
const accDirs = path.join(tmpRoot, 'accts');
const accounts = { get: (id) => (id === 'acc-1' ? { id: 'acc-1', name: 'me' } : null), subDir: (id) => path.join(accDirs, String(id)) };
const SECRET_ENV = { PATH: '/usr/bin:/bin', HOME: '/root', AWS_SECRET_ACCESS_KEY: 'AKIAsecret', ANTHROPIC_API_KEY: 'sk-ant-nope', LANG: 'C.UTF-8' };

function newOrch({ echo = false, ...extra } = {}) {
  const broadcasts = [];
  let fake = null;
  const orch = create({
    accounts, claudeCmd: '/opt/claude', nodeCmd: '/opt/node', helperPath: '/opt/helper.mjs',
    broadcastAll: (m) => broadcasts.push(m), env: SECRET_ENV, tmpRoot,
    spawnPty: (file, args, opts) => { fake = makeFake({ echo }); fake.file = file; fake.args = args; fake.opts = opts; return fake; },
    now: () => Date.now(), log: () => { }, ...extra,
  });
  return { orch, broadcasts, getFake: () => fake };
}

// ①②③④⑨ the happy path
{
  const { orch, broadcasts, getFake } = newOrch();
  const r = orch.start({ accountId: 'acc-1' });
  const fake = getFake();
  ok(r.ok && r.signin.phase === 'starting', '① start ok, phase starting', r);
  ok(fake.file === '/opt/node' && fake.args[0] === '/opt/helper.mjs' && fake.args[1] === '--config-dir' && fake.args[2] === path.join(accDirs, 'acc-1') && fake.args[3] === '--claude' && fake.args[4] === '/opt/claude', '① spawned the helper with the account dir', { file: fake.file, args: fake.args });
  const env = fake.opts.env;
  ok(env.HOME === fake.opts.cwd && env.CLAUDE_CONFIG_DIR === path.join(accDirs, 'acc-1'), '① env: HOME=scratch, CLAUDE_CONFIG_DIR=account dir', { HOME: env.HOME, CCD: env.CLAUDE_CONFIG_DIR, cwd: fake.opts.cwd });
  ok(!('AWS_SECRET_ACCESS_KEY' in env) && !('ANTHROPIC_API_KEY' in env), '① no hub secret in the child env (allowlist)', Object.keys(env));
  ok(fake.opts.cols === 400, '① cols 400 so the URL is never wrapped');

  fake.emit(S_URL);
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'waiting-code' && last.url === URL, '② url screen → waiting-code, URL whole', last);
  ok(!('scratch' in last) && !('dir' in last) && !('pty' in last) && !('parse' in last), '② publicSignin leaks no scratch/dir/pty/parse', Object.keys(last));

  const sc = orch.sendCode('acc-1', '  mycode#state  ');
  ok(sc.ok && sc.signin.phase === 'connecting', '③ sendCode → connecting', sc);
  ok(fake.writes.join('') === 'mycode#state\r', '③ the code (trimmed) + \\r is the ONLY thing written to the PTY', fake.writes);

  const cwd = fake.opts.cwd;
  fake.emit(S_OK);
  const done = broadcasts[broadcasts.length - 1].signin;
  ok(done.phase === 'connected', '④ "credentials saved" → connected', done);
  ok(!fs.existsSync(cwd), '④ the scratch dir is wiped on connected', cwd);

  ok(broadcasts.every((b) => JSON.stringify(b).indexOf('mycode') < 0), '⑨ SPY: the pasted code is in NO broadcast');
  ok(broadcasts.every((b) => JSON.stringify(b).indexOf('signin-test-') < 0 || JSON.stringify(b).indexOf(cwd) < 0), '⑨ SPY: no scratch path in a broadcast');
}

// ⑤ an error screen
{
  const { orch, broadcasts, getFake } = newOrch();
  orch.start({ accountId: 'acc-1' });
  getFake().emit(S_URL);
  getFake().emit(S_ERR);
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'failed' && /OAuth error/.test(last.error || ''), '⑤ error screen → failed with the CLI line', last);
}

// ⑥ exit-0 + status file backstop (no "saved" line)
{
  const { orch, broadcasts, getFake } = newOrch();
  orch.start({ accountId: 'acc-1' });
  const fake = getFake();
  fake.emit(S_URL);
  orch.sendCode('acc-1', 'code#x');
  // the helper wrote its success status into the ACCOUNT dir, then exited 0, with no "saved" line captured
  fs.writeFileSync(path.join(accDirs, 'acc-1', '.vibespace-login-status.json'), JSON.stringify({ state: 'success', attempt: 'a1' }));
  fake.exit(0);
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'connected', '⑥ exit 0 + success status (no saved line) → connected', last);
}

// ⑥b exit non-zero → failed
{
  const { orch, broadcasts, getFake } = newOrch();
  orch.start({ accountId: 'acc-1' });
  getFake().emit(S_URL);
  getFake().exit(1);
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'failed', '⑥b exit non-zero → failed', last);
}

// ⑦ one sign-in per account
{
  const { orch, getFake } = newOrch();
  orch.start({ accountId: 'acc-1' });
  getFake().emit(S_URL);
  const again = orch.start({ accountId: 'acc-1' });
  ok(!again.ok && again.status === 409 && again.code === 'signin_running', '⑦ a second start while live → 409', again);
}

// ⑧ cancel kills the PTY
{
  const { orch, broadcasts, getFake } = newOrch();
  orch.start({ accountId: 'acc-1' });
  const fake = getFake();
  fake.emit(S_URL);
  const c = orch.cancel('acc-1');
  ok(c.ok && c.signin.phase === 'cancelled' && fake.killed, '⑧ cancel → cancelled + PTY killed', { phase: c.signin.phase, killed: fake.killed });
  // unknown account
  ok(orch.start({ accountId: 'nope' }).status === 404, '⑧ unknown account → 404');
}

// ⑩ routes refuse an agent bearer
{
  const { orch } = newOrch();
  const routes = {};
  const app = { post: (p, h) => { routes['POST ' + p] = h; }, get: (p, h) => { routes['GET ' + p] = h; }, delete: (p, h) => { routes['DELETE ' + p] = h; } };
  registerSigninRoutes(app, { signin: orch, isAgentBearer: () => true });
  let code = 0, body = null;
  const res = { status: (c) => { code = c; return res; }, json: (b) => { body = b; return res; } };
  routes['POST /api/accounts/:id/signin']({ params: { id: 'acc-1' }, body: {} }, res);
  ok(code === 403 && body && body.code === 'agent_forbidden', '⑩ an agent bearer is refused by name', { code, body });
  ok(typeof routes['POST /api/accounts/:id/signin/code'] === 'function' && typeof routes['DELETE /api/accounts/:id/signin'] === 'function' && typeof routes['GET /api/accounts/:id/signin'] === 'function', '⑩ all four routes registered');
}

// ── THE VERIFY ROUND (lane door-signin-fixes) ──
const CODE = 'zq7Lk9#stateXYZ';
const carries = (x, w) => JSON.stringify(x || null).includes(w);

// ⑪ claim 2: the pasted code never rides a failed run's text
await leg('⑪', async () => {
  const { orch, broadcasts, getFake } = newOrch({ echo: true });
  orch.start({ accountId: 'acc-1' });
  getFake().emit(S_URL);
  orch.sendCode('acc-1', CODE);
  ok(getFake().writes.join('') === CODE + '\r', '⑪ (control) the code went to the PTY, which echoed it onto the prompt line');
  getFake().exit(1); // the CLI dies SILENTLY after the code: non-zero, no worded error line
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'failed', '⑪ a silent death after the code → failed', last);
  ok(!broadcasts.some((b) => carries(b, CODE)), '⑪ CLAIM 2: the pasted code is in NO broadcast after a silent death', { error: last.error });
  ok(!carries(orch.get('acc-1'), CODE), '⑪ CLAIM 2: … nor in the GET answer', orch.get('acc-1'));
  ok(!/paste\s+(?:the\s+)?code/i.test(last.error || ''), '⑪ the published error is not the prompt line', last.error);
  ok(/ended before Claude confirmed it/.test(last.error || ''), '⑪ it is the fixed sentence («the sign-in ended before Claude confirmed it — try again»)', last.error);
});
await leg('⑪b', async () => {
  // before any code: the screen's last line is the bare prompt — never published as «why»
  const { orch, broadcasts, getFake } = newOrch({ echo: true });
  orch.start({ accountId: 'acc-1' });
  getFake().emit(S_URL);
  getFake().exit(1);
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'failed' && !/paste\s+(?:the\s+)?code/i.test(last.error || '') && /exit 1/.test(last.error || ''), '⑪b no code sent, a bare prompt last line → the exit sentence, never the prompt (the last line is cut at it)', last);
  // CONTROL: an unmatched error line before any code IS what the backstop says
  const o2 = newOrch({ echo: true });
  o2.orch.start({ accountId: 'acc-1' });
  o2.getFake().emit(S_URL);
  o2.getFake().emit('\r\r\nError: fetch failed (ECONNRESET)\r\r\n');
  o2.getFake().exit(1);
  const l2 = o2.broadcasts[o2.broadcasts.length - 1].signin;
  ok(l2.phase === 'failed' && /fetch failed/.test(l2.error || ''), '⑪b CONTROL: before a code, the CLI’s own last line is still the «why»', l2);
  // CONTROL: a worded error line after the code is that line (no code)
  const o3 = newOrch({ echo: true });
  o3.orch.start({ accountId: 'acc-1' });
  o3.getFake().emit(S_URL);
  o3.orch.sendCode('acc-1', CODE);
  o3.getFake().emit(S_ERR);
  const l3 = o3.broadcasts[o3.broadcasts.length - 1].signin;
  ok(l3.phase === 'failed' && /OAuth error/.test(l3.error || '') && !o3.broadcasts.some((b) => carries(b, CODE)), '⑪b CONTROL: a worded error after the code → that line, no code', l3);
});
await leg('⑪c', async () => {
  const OM = require(path.join(ROOT, 'src/oat-mint-model.js'));
  const line = 'Paste code here if prompted > ' + CODE;
  ok(!OM.redact(line).includes(CODE) && !OM.lastLine('Browser didn’t open?\n' + line).includes(CODE), '⑪c oat-mint-model redact / lastLine mask what stands after the code prompt (the OAT mint’s backstop too)', { redact: OM.redact(line), last: OM.lastLine(line) });
  ok(OM.redact('OAuth error: invalid_grant') === 'OAuth error: invalid_grant', '⑪c CONTROL: a line with no prompt is untouched');
});

// ⑫ claim 4 (server): the run is the starting page's
await leg('⑫', async () => {
  const sock = { name: 'page-a' }, other = { name: 'page-b' };
  const { orch, broadcasts, getFake } = newOrch({ orphanMs: 30 });
  orch.start({ accountId: 'acc-1' });
  const fake = getFake(); fake.emit(S_URL);
  const runId = orch.get('acc-1').id;
  ok(orch.hold('acc-1', 'si-not-this-run', sock) === false, '⑫ a hold naming another run is refused');
  ok(orch.hold('acc-1', runId, sock) === true, '⑫ the starting page holds its run');
  orch.releaseSocket(other);
  await sleep(80);
  ok(orch.get('acc-1').phase === 'waiting-code' && !fake.killed, '⑫ another socket closing leaves it alone');
  orch.releaseSocket(sock);
  orch.hold('acc-1', runId, other); // a reconnect re-holds within orphanMs
  await sleep(80);
  ok(orch.get('acc-1').phase === 'waiting-code' && !fake.killed, '⑫ a re-hold within orphanMs (a reconnect) keeps the run');
  orch.releaseSocket(other);
  await sleep(80);
  const last = broadcasts[broadcasts.length - 1].signin;
  ok(last.phase === 'cancelled' && fake.killed, '⑫ CLAIM 4: the last holder’s socket closed, nobody re-held → cancelled + the PTY killed', { phase: last.phase, killed: fake.killed });
  // the WS layer's seam reaches the HUB instance
  const h = newOrch({ orphanMs: 0, hub: true });
  h.orch.start({ accountId: 'acc-1' }); h.getFake().emit(S_URL);
  ok(SIGNIN.socketHold(sock, { accountId: 'acc-1', id: h.orch.get('acc-1').id }) === true, '⑫ socketHold (ws-handler `claude-signin-hold`) holds the hub’s run');
  SIGNIN.socketClosed(sock); await sleep(30);
  ok(h.orch.get('acc-1').phase === 'cancelled' && h.getFake().killed, '⑫ socketClosed (ws-handler close) ends a run nobody holds', h.orch.get('acc-1'));
  const wsSrc = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
  ok(/case 'claude-signin-hold':[\s\S]{0,200}socketHold\(ws, data\)/.test(wsSrc) && /ws\.on\('close'[\s\S]{0,400}socketClosed\(ws\)/.test(wsSrc), '⑫ wiring: ws-handler hands the hold and the close to the ORCH');
});

// ⑬ debris: the REAL AccountManager
await leg('⑬', async () => {
  const { AccountManager } = require(path.join(ROOT, 'src/accounts.js'));
  const dd = fs.mkdtempSync(path.join(tmpRoot, 'am-'));
  const am = new AccountManager({ dataDir: dd });
  let clock = Date.now();
  let fake = null;
  const mk = () => create({ accounts: am, claudeCmd: '/opt/claude', nodeCmd: '/opt/node', helperPath: '/opt/helper.mjs', broadcastAll: () => { }, env: SECRET_ENV, tmpRoot,
    spawnPty: () => (fake = makeFake()), now: () => clock, log: () => { } });
  const orch = mk();
  const subs = () => am.list().accounts.filter((a) => a.type === 'subscription');
  const attempt = () => { const c = am.pendingSignin({ busy: (aid) => orch.isLive(aid) }); orch.start({ accountId: c.id }); fake.emit(S_URL); fake.exit(1); return c.id; };
  const ids = [attempt(), attempt(), attempt()];
  ok(subs().length === 1 && new Set(ids).size === 1, '⑬ three failed attempts → ONE never-signed-in row (the card’s row is reused)', { rows: subs().map((a) => a.id), ids });
  // a live run on the pending row: the next card gets a row of its own, never the busy one
  const busyId = am.pendingSignin({ busy: () => false }).id; orch.start({ accountId: busyId }); fake.emit(S_URL);
  const second = am.pendingSignin({ busy: (aid) => orch.isLive(aid) });
  ok(second.id !== busyId, '⑬ a row with a sign-in running is never handed to another attempt', { busyId, second: second.id });
  orch.cancel(busyId);
  // a success converts it: finalize with a login clears the mark — the next attempt makes a NEW row
  fs.writeFileSync(path.join(am.subDir(busyId), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'at-x', refreshToken: 'rt', expiresAt: Date.now() + 3600e3, email: 'me@co.example' } }));
  const fin = am.finalizeSubscription(busyId);
  ok(fin.loggedIn && !am.pendingSignins().some((p) => p.id === busyId), '⑬ a success converts the row (finalize clears the mark — an account now)', am.pendingSignins());
  ok(am.pendingSignin({ busy: () => false }).id !== busyId, '⑬ … and the next attempt never reuses a signed-in row');
  // the sweep: past the TTL since its mark / its last run, no live run ⇒ removed at the next start; the others stay
  const termRow = am.createSubscription({ name: 'Terminal add' }).id; // the terminal Add flow's row: unmarked
  const liveRow = am.createSubscription({ signinPending: true }).id;
  clock += 11 * 60e3;
  orch.start({ accountId: liveRow }); fake.emit(S_URL); // live ⇒ kept
  const left = new Set(am.list().accounts.map((a) => a.id));
  ok(am.pendingSignins().filter((p) => p.id !== liveRow).length === 0, '⑬ the next start sweeps every marked never-signed-in row past the TTL', am.pendingSignins());
  ok(left.has(busyId) && left.has(termRow) && left.has(liveRow), '⑬ … never the signed-in row, the terminal-Add row or the row with a live run', [...left]);
  orch.cancel(liveRow);
  // at boot: a marked row past the TTL goes when the ORCH is created
  const old = am.createSubscription({ signinPending: true }).id;
  clock += 11 * 60e3;
  mk();
  ok(!am.get(old), '⑬ at boot (the ORCH’s creation) a marked row past the TTL is swept');
  const routeSrc = fs.readFileSync(path.join(ROOT, 'src/server/account-usage-routes.js'), 'utf8');
  ok(/req\.body\.signin === true[\s\S]{0,120}accounts\.pendingSignin\(\{ busy: \(aid\) => claudeSignin\.isLive\(aid\) \}\)/.test(routeSrc), '⑬ wiring: POST /api/accounts/subscription {signin:true} → accounts.pendingSignin (busy = a live run)');
});

// ⑭ REAL node-pty + the REAL helper + a fake `claude` (sh), observed through /proc
await leg('⑭', async () => {
  const alive = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return st.split(') ')[1][0] !== 'Z' ? 'alive' : 'zombie'; } catch { return 'gone'; } };
  const childrenOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return []; } };
  const descendants = (pid) => { const out = []; const walk = (p) => { for (const c of childrenOf(p)) { out.push(c); walk(c); } }; walk(pid); return out; };
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'pty-'));
  const screen = `printf 'Browser didn\\342\\200\\231t open? Use the url below to sign in (c to copy):\\r\\n\\r\\n'
printf 'https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a&state=ptystate\\r\\n\\r\\n'
printf 'Paste code here if prompted > '
`;
  const HANG = path.join(dir, 'claude-hang'); fs.writeFileSync(HANG, '#!/bin/sh\n' + screen + 'exec sleep 1000\n', { mode: 0o755 });
  const READ = path.join(dir, 'claude-read'); fs.writeFileSync(READ, '#!/bin/sh\n' + screen + 'read code\nexit 1\n', { mode: 0o755 });
  const HELPER = path.join(ROOT, 'data/bin/vibespace-claude-subscription-login.mjs');
  const accts = path.join(dir, 'accts');
  const acc = { get: (id) => ({ id }), subDir: (id) => path.join(accts, id) };
  const mk = (claudeCmd, extra = {}) => { const bc = []; const o = create({ accounts: acc, claudeCmd, nodeCmd: process.execPath, helperPath: HELPER, broadcastAll: (m) => bc.push(m), env: { PATH: process.env.PATH, HOME: os.homedir(), LANG: 'C.UTF-8' }, tmpRoot: dir, log: () => { }, ...extra }); return { o, bc }; };
  const waitPhase = async (bc, ph, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const l = bc[bc.length - 1]; if (l && l.signin && l.signin.phase === ph) return l.signin; await sleep(25); } return bc[bc.length - 1] && bc[bc.length - 1].signin; };
  const goneWithin = async (pids, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pids.every((p) => alive(p) === 'gone')) return Date.now() - t0; await sleep(25); } return -1; };
  const treeOf = (o, id) => { const m = o._runs.get(id); const pid = m && m.pty && m.pty.pid; return { pid, kids: pid ? descendants(pid) : [], scratch: m && m.scratch }; };
  // close: the card's DELETE (the route's handler) ends the helper AND the fake claude within 1.5 s
  {
    const { o, bc } = mk(HANG);
    const routes = {}; registerSigninRoutes({ post: (p, h) => { routes['POST ' + p] = h; }, get: (p, h) => { routes['GET ' + p] = h; }, delete: (p, h) => { routes['DELETE ' + p] = h; } }, { signin: o, isAgentBearer: () => false });
    let ans = null; const res = { status: () => res, json: (b) => { ans = b; return res; } };
    routes['POST /api/accounts/:id/signin']({ params: { id: 'acc-p1' } }, res);
    const s = await waitPhase(bc, 'waiting-code');
    const t = treeOf(o, 'acc-p1');
    ok(s && s.phase === 'waiting-code' && t.pid && t.kids.length >= 1 && [t.pid, ...t.kids].every((p) => alive(p) === 'alive'), '⑭ (setup) a real pty: the helper + the fake claude are up, the screen read to waiting-code', { phase: s && s.phase, t });
    routes['DELETE /api/accounts/:id/signin']({ params: { id: 'acc-p1' } }, res);
    const ms = await goneWithin([t.pid, ...t.kids], 1500);
    ok(ms >= 0 && !fs.existsSync(t.scratch), `⑭ CLAIM 4: close (DELETE …/signin) → helper + grandchild gone in ${ms} ms (≤ 1.5 s), the scratch removed`, { ms, scratch: fs.existsSync(t.scratch), states: [t.pid, ...t.kids].map(alive) });
  }
  // the holder's socket closes and nobody re-holds → the same
  {
    const { o, bc } = mk(HANG, { orphanMs: 0 });
    o.start({ accountId: 'acc-p2' });
    await waitPhase(bc, 'waiting-code');
    const t = treeOf(o, 'acc-p2');
    const sock = { page: 'p2' };
    o.hold('acc-p2', o.get('acc-p2').id, sock);
    o.releaseSocket(sock);
    const ms = await goneWithin([t.pid, ...t.kids], 1500);
    ok(ms >= 0 && !fs.existsSync(t.scratch) && o.get('acc-p2').phase === 'cancelled', `⑭ CLAIM 4: the starting page’s socket closed → helper + grandchild gone in ${ms} ms (≤ 1.5 s), the scratch removed`, { ms, phase: o.get('acc-p2').phase, states: [t.pid, ...t.kids].map(alive) });
  }
  // a REAL tty echoes the code; the fake claude reads it and exits 1 SILENTLY → no code in what is published
  {
    const { o, bc } = mk(READ);
    o.start({ accountId: 'acc-p3' });
    await waitPhase(bc, 'waiting-code');
    o.sendCode('acc-p3', CODE);
    const s = await waitPhase(bc, 'failed');
    ok(s && s.phase === 'failed' && !bc.some((b) => carries(b, CODE)) && !carries(o.get('acc-p3'), CODE), '⑭ CLAIM 2 on a real tty: the code echoed by the line discipline, a silent exit 1 → failed, no broadcast / GET answer holds the code', { error: s && s.error });
  }
});

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { }
console.log(`\ntest-claude-signin: ${pass} passed, ${fail} failed (${Date.now() - T_START} ms)`);
process.exit(fail ? 1 : 0);
