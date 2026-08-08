#!/usr/bin/env node
// LIVE integration test — pooled pseudo-accounts (B-6217) + long-lived tokens
// (B-211a) against REAL logged-in Claude subscriptions, in a THROWAWAY server
// so production data/accounts.json is NEVER touched.
//
// SAFETY (do not weaken):
//  · The throwaway gets COPIES of real creds dirs, never symlinks/originals.
//  · It only uses subs whose access token has >1.5h of life left, so the short
//    test window can never trigger a credential REFRESH — which would consume
//    the single-use refresh token and break production's copy (the exact
//    rotation invariant the whole design protects).
//  · A real oat is minted by an interactive browser flow we can't drive
//    headlessly, so the oat paths use a real subscription ACCESS token as a
//    stand-in: same sk-ant-oat01 format, real + inference-capable, and the
//    env-token path never refreshes it. (A true 1-year oat additionally
//    narrows scope to inference-only — irrelevant to the plumbing under test.)
//  · Real turns cost real Max quota (authorized). Kept minimal.
//
// Run: node scripts/dbg-oat-pool-live.mjs
import { spawn, execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD_SUBS = path.join(repo, 'data', 'subs');
const wt = '/tmp/vs-oatpool-live';
const PORT = 3994;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '  — ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── pick two production subs with the most token life (>1.5h) ────────────────
const now = Date.now();
const safe = [];
for (const id of (fs.existsSync(PROD_SUBS) ? fs.readdirSync(PROD_SUBS) : [])) {
  const f = path.join(PROD_SUBS, id, '.credentials.json');
  try {
    const o = JSON.parse(fs.readFileSync(f, 'utf-8')).claudeAiOauth || {};
    const hrs = o.expiresAt ? (o.expiresAt - now) / 3600e3 : -1;
    if (o.accessToken && hrs > 1.5) safe.push({ id, hrs, token: o.accessToken });
  } catch {}
}
safe.sort((a, b) => b.hrs - a.hrs);
if (safe.length < 2) {
  console.log(`SKIP: need 2 subs with >1.5h token life (found ${safe.length}). Re-run after using them once so tokens refresh, or when more accounts are fresh.`);
  process.exit(0);
}
const [A, B] = safe; // A = safest (most life)
console.log(`Using safe subs: A=${A.id} (${A.hrs.toFixed(1)}h)  B=${B.id} (${B.hrs.toFixed(1)}h)`);

// ── throwaway worktree + copied creds ────────────────────────────────────────
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// pre-populate the throwaway account store via the real AccountManager so the
// oat is encrypted under the throwaway's own key and dirs are seeded correctly
const dataDir = path.join(wt, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const { AccountManager } = require(path.join(wt, 'src', 'accounts.js'));
const am = new AccountManager({ dataDir, onChange: () => {} });
const copyCreds = (fromId, toId) => {
  for (const n of ['.credentials.json', '.claude.json']) {
    const s = path.join(PROD_SUBS, fromId, n);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(am.subDir(toId), n));
  }
};
const poolA = am.createSubscription({ name: 'PoolA (copy)' }).id; copyCreds(A.id, poolA);
const poolB = am.createSubscription({ name: 'PoolB (copy)' }).id; copyCreds(B.id, poolB);
const oatOnly = am.createSubscription({ name: 'OatOnly' }).id; am.setOat(oatOnly, A.token); // NO creds copy → loggedIn:false + oat
const loggedInOat = am.createSubscription({ name: 'LoggedInOat' }).id; copyCreds(B.id, loggedInOat); am.setOat(loggedInOat, A.token);
const plain = am.createSubscription({ name: 'PlainNoOat' }).id; copyCreds(A.id, plain);
const pool = am.createPool({ name: 'Live Pool' }); // over [poolA, poolB], points at one
console.log(`Accounts: pool=${pool.id} (→ ${pool.current})  oatOnly=${oatOnly}  loggedInOat=${loggedInOat}  plain=${plain}`);

// ── boot throwaway server ────────────────────────────────────────────────────
const spawnedSessions = new Set();
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt,
  env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CODE_OAUTH_TOKEN: A.token /* ambient — must be stripped from spawns */ },
  stdio: 'ignore',
});
const cleanup = () => {
  try { for (const sid of spawnedSessions) execSync(`pkill -f 'sockets/cw-${sid}' || true`, { stdio: 'ignore' }); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`pgrep -af 'sockets/cw-' | grep '${wt}' | awk '{print $1}' | xargs -r kill 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const homeDir = (await (await fetch(`http://127.0.0.1:${PORT}/api/home`)).json()).home;

const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
const created = new Map(); // reqId → {sessionId}
const errors = [];
ws.on('message', (d) => {
  let m; try { m = JSON.parse(d); } catch { return; }
  if (m.type === 'created') created.set(m.reqId, m.sessionId);
  if (m.type === 'error') errors.push(m.message || 'error');
});

let rq = 0;
const spawnChat = async (accountId, { expectError = false } = {}) => {
  const reqId = 'r' + (++rq);
  errors.length = 0;
  ws.send(JSON.stringify({ type: 'create', reqId, backend: 'claude', mode: 'chat', cwd: homeDir, accountId, cols: 80, rows: 24 }));
  for (let i = 0; i < 50 && !created.has(reqId) && !errors.length; i++) await sleep(200);
  const sid = created.get(reqId);
  if (sid) spawnedSessions.add(sid);
  return { sid, error: errors[0] || null };
};
// read the REAL claude child's env (chat-wrapper writes childPid to meta)
const claudeEnvOf = async (sid) => {
  for (let i = 0; i < 30; i++) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'session-buffers', `${sid}.json`), 'utf-8'));
      if (meta.childPid && fs.existsSync(`/proc/${meta.childPid}/environ`)) {
        const raw = fs.readFileSync(`/proc/${meta.childPid}/environ`, 'utf-8');
        const env = {};
        for (const kv of raw.split('\0')) { const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1); }
        return env;
      }
    } catch {}
    await sleep(300);
  }
  return null;
};
// send one turn; return true if the buffer shows a real assistant/result (proves
// the creds were accepted by Anthropic — a wrong token/dir would auth-fail)
const realTurn = async (sid, text) => {
  ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text }));
  const buf = path.join(dataDir, 'session-buffers', `${sid}.buf`);
  for (let i = 0; i < 90; i++) {
    try {
      const s = fs.readFileSync(buf, 'utf-8');
      // a successful result = Anthropic accepted the creds (a wrong token/dir
      // auth-fails before any result). Classify auth failure only from the
      // CLI's OWN error result, never a stray init substring.
      if (/"type"\s*:\s*"result"/.test(s) && /"subtype"\s*:\s*"success"/.test(s)) return { ok: true, authErr: false };
      if (/"is_error"\s*:\s*true/.test(s) && /oauth|token|authentication|401|invalid_grant/i.test(s)) return { ok: false, authErr: true };
    } catch {}
    await sleep(1000);
  }
  return { ok: false, authErr: false };
};

try {
  console.log('\n── Pooled pseudo-account (B-6217) ──');
  // P1
  const poolDir = am.subDir(pool.id);
  check('pool creds dir is a SYMLINK (not a real dir)', fs.lstatSync(poolDir).isSymbolicLink());
  check('pool resolves to a member', [poolA, poolB].includes(am.poolCurrent(pool.id)));

  // P2 — real spawn on the pool, current target
  await fetch(`http://127.0.0.1:${PORT}/api/accounts/pool/${pool.id}/target`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: poolA }) });
  await sleep(400);
  const s2 = await spawnChat(pool.id);
  check('spawn a chat session ON the pool succeeds', !!s2.sid, s2.error);
  const e2 = s2.sid ? await claudeEnvOf(s2.sid) : null;
  check('claude env points CLAUDE_SECURESTORAGE_CONFIG_DIR at the POOL symlink dir', e2 && e2.CLAUDE_SECURESTORAGE_CONFIG_DIR === poolDir, e2 && e2.CLAUDE_SECURESTORAGE_CONFIG_DIR);
  check('the pool symlink resolves to member A (real creds behind it)', fs.realpathSync(poolDir) === fs.realpathSync(am.subDir(poolA)));
  const t2 = s2.sid ? await realTurn(s2.sid, 'Reply with exactly the word READY and nothing else.') : { ok: false };
  check('a REAL turn completes on the pool (creds valid THROUGH the symlink)', t2.ok, t2.authErr ? 'AUTH FAILED' : 'no result');

  // P3 — switch target, spawn again
  await fetch(`http://127.0.0.1:${PORT}/api/accounts/pool/${pool.id}/target`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: poolB }) });
  await sleep(400);
  check('after switch, pool symlink now resolves to member B', fs.realpathSync(poolDir) === fs.realpathSync(am.subDir(poolB)));
  const s3 = await spawnChat(pool.id);
  const e3 = s3.sid ? await claudeEnvOf(s3.sid) : null;
  check('a new spawn reads member B through the same pool path', e3 && fs.realpathSync(e3.CLAUDE_SECURESTORAGE_CONFIG_DIR) === fs.realpathSync(am.subDir(poolB)));
  const t3 = s3.sid ? await realTurn(s3.sid, 'Reply with exactly the word READY and nothing else.') : { ok: false };
  check('a REAL turn completes after the target switch', t3.ok, t3.authErr ? 'AUTH FAILED' : 'no result');

  // P4 — lock sharing: pool(target B) + a NORMAL session on member B → same real dir
  const sN = await spawnChat(poolB);
  const eN = sN.sid ? await claudeEnvOf(sN.sid) : null;
  check('a normal session on member B AND the pooled session resolve to the SAME real dir (shared .oauth_refresh.lock)',
    eN && e3 && fs.realpathSync(eN.CLAUDE_SECURESTORAGE_CONFIG_DIR) === fs.realpathSync(e3.CLAUDE_SECURESTORAGE_CONFIG_DIR));

  // P6 — remove the pool: symlink gone, member dirs intact
  await fetch(`http://127.0.0.1:${PORT}/api/accounts/${pool.id}`, { method: 'DELETE' });
  await sleep(300);
  check('removing the pool unlinks the symlink', !fs.existsSync(poolDir));
  check('member A creds survive the pool removal', fs.existsSync(am.subCredsPath(poolA)));
  check('member B creds survive the pool removal', fs.existsSync(am.subCredsPath(poolB)));

  console.log('\n── Long-lived token (B-211a) ──');
  // O1 — oat-only account: env token, NO securestorage dir, real turn works
  const sO = await spawnChat(oatOnly);
  check('spawn an OAT-ONLY account (no local login) succeeds', !!sO.sid, sO.error);
  const eO = sO.sid ? await claudeEnvOf(sO.sid) : null;
  check('oat-only claude env carries CLAUDE_CODE_OAUTH_TOKEN', !!(eO && eO.CLAUDE_CODE_OAUTH_TOKEN));
  check('oat-only claude env has NO CLAUDE_SECURESTORAGE_CONFIG_DIR', eO && !eO.CLAUDE_SECURESTORAGE_CONFIG_DIR);
  const tO = sO.sid ? await realTurn(sO.sid, 'Reply with exactly the word READY and nothing else.') : { ok: false };
  check('a REAL turn completes via the long-lived token (env-token inference works)', tO.ok, tO.authErr ? 'AUTH FAILED' : 'no result');

  // O2 — logged-in + oat, LOCAL spawn keeps the DIR (hot-swap intact), no env token
  const sL = await spawnChat(loggedInOat);
  const eL = sL.sid ? await claudeEnvOf(sL.sid) : null;
  check('logged-in+oat LOCAL spawn keeps the securestorage DIR', !!(eL && eL.CLAUDE_SECURESTORAGE_CONFIG_DIR));
  check('logged-in+oat LOCAL spawn does NOT use the env token', eL && !eL.CLAUDE_CODE_OAUTH_TOKEN);

  // O3 — ambient CLAUDE_CODE_OAUTH_TOKEN (set in the server env) is STRIPPED
  // from a spawn. Use the plain (no-oat) account: its env must NOT carry the
  // ambient token the server was booted with.
  const sP = await spawnChat(plain);
  const eP = sP.sid ? await claudeEnvOf(sP.sid) : null;
  check('server had an ambient CLAUDE_CODE_OAUTH_TOKEN (test setup)', true);
  check('ambient CLAUDE_CODE_OAUTH_TOKEN is STRIPPED from a normal spawn (no silent re-billing)', eP && !eP.CLAUDE_CODE_OAUTH_TOKEN, eP && eP.CLAUDE_CODE_OAUTH_TOKEN ? 'LEAKED' : '');

  // O4 — expired-oat refusal is NOT live-testable here: the running server
  // holds its OWN AccountManager instance, so a test-process store edit can't
  // expire the token without a restart (not allowed on this box). Covered by
  // scripts/test-account-verdicts.mjs (37 asserts: expired verdict + refusal).
  console.log('  · (expired-oat refusal: unit-tested in test-account-verdicts.mjs — not live-testable without a server restart)');
} catch (e) {
  failed++;
  console.error('  ✗ harness threw: ' + e.message + '\n' + e.stack);
} finally {
  try { ws.close(); } catch {}
}

console.log(failed ? `\n${failed} FAILED` : '\nALL LIVE SCENARIOS PASS');
process.exit(failed ? 1 : 0);
