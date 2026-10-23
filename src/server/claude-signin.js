'use strict';
// THE HUMANE CLAUDE SIGN-IN, DRIVEN BY THE HUB (lane door-signin-card, owner
// 2026-10-22: 7 naive fleet testers (naive-cluster-1/-2) all stopped at the
// Claude sign-in — a terminal TUI with a theme picker, a login-method menu, a
// URL cut at the window edge, "Paste code here", a "trust this folder?" prompt).
// ORCH: the hub runs VibeSpace's subscription-login helper (data/bin/vibespace-
// claude-subscription-login.mjs → `claude auth login --claudeai`) in a PTY IT
// OWNS — the person never sees a terminal — the PURE src/signin-model.js reads
// the screen (url -> code-prompt -> connected / error), the pasted code goes
// into the PTY and nowhere else, and the credential is the helper's (written
// into the account's own pre-seeded config dir).
//
// FINALIZING the account (the duplicate-identity merge, the login-expiry sweep,
// the pool wake) is NOT re-implemented here: the client card calls the EXISTING
// /api/accounts/subscription/:id/finalize (add) or /api/accounts/:id/relogin-
// finalize routes once the sign-in lands, exactly as the old terminal flow's
// poll did. This ORCH only does the part the person used to do by hand.
//
// ISOLATION: a scratch dir per run (0700) is the child's HOME and holds a no-op
// $BROWSER opener (a headless pod opens no browser — the person opens the URL
// in their own tab); CLAUDE_CONFIG_DIR is the ACCOUNT's own dir (the helper
// points both config envs at it, where its credential lands). The env is the
// oat mint's allowlist (mintEnvOf over agentEnv) — no hub secret rides along.
// publicSignin whitelists what leaves; the OAuth login prints no token. A hub
// that dies mid-run leaves its scratch dir: swept by age at boot.
// scripts/test-claude-signin.mjs spies every outbound path (the pasted code
// reaches ONLY the PTY) and runs the flow over a FAKE claude.
//
// THE VERIFY ROUND (lane door-signin-fixes): a run dies with the card that
// started it — the card's close sends DELETE, and the run is HELD by the page
// that started it (WS `claude-signin-hold`): when its last holder's socket
// closes and none re-holds within SIGNIN_ORPHAN_MS (a page's reconnect, a
// phone back from the mail app), the run is cancelled — PTY, grandchild and
// scratch gone, not left to the 10-min TTL. A secret typed into the PTY never
// rides its failure text: once a code was sent, a silent death says
// ENDED_AFTER_CODE, never the screen (whose last line echoes the code). The
// never-signed-in row a card makes is marked `signinPending` (accounts.js):
// reused by the next attempt, swept past the TTL at boot and at each start.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { agentEnv } = require('../agent-env.js');
const { initialSigninParse, signinStep, publicSignin, codeVerdict, SIGNIN_DONE, ENDED_AFTER_CODE, RAW_AFTER_MS } = require('../signin-model.js');
const { mintEnvOf, initialRawScreen, rawAppend, rawSince } = require('../oat-mint-model.js');

const SIGNIN_TTL_MS = 10 * 60e3;
// how long a run outlives its last holder's socket (a page reconnecting, a
// phone switched to the mail app for the sign-in link) before it is cancelled
const SIGNIN_ORPHAN_MS = 3 * 60e3;
const SCRATCH_PREFIX = 'vs-signin-';
// mirror of data/bin/vibespace-claude-subscription-login.mjs LOGIN_STATUS_FILE
// (the helper writes { state:'success'|'error'|'running' } there on exit)
const LOGIN_STATUS_FILE = '.vibespace-login-status.json';

function create({ accounts, claudeCmd = 'claude', nodeCmd = process.execPath, helperPath,
  broadcastAll = () => { }, spawnPty = null, env = process.env, tmpRoot = os.tmpdir(),
  ttlMs = SIGNIN_TTL_MS, now = () => Date.now(), log = (...a) => console.log(...a),
  exitHook = false, sweepAgeMs = SIGNIN_TTL_MS + 5 * 60e3, orphanMs = SIGNIN_ORPHAN_MS, hub = false, rawAfterMs = RAW_AFTER_MS } = {}) {
  const runs = new Map(); // accountId -> { id, accountId, dir, scratch, phase, url, email, error, rev, startedAt, endedAt, pty, parse, lastLine, timer, codeSent, holders, orphanTimer }
  const spawn = spawnPty || ((file, args, opts) => require('node-pty').spawn(file, args, opts));
  const live = (m) => m && !SIGNIN_DONE.includes(m.phase);
  const emit = (m) => { m.rev = (Number(m.rev) || 0) + 1; try { broadcastAll({ type: 'claude-signin', signin: publicSignin(m) }); } catch { } };
  const wipe = (m) => { m.parse = null; if (m.scratch) { try { fs.rmSync(m.scratch, { recursive: true, force: true }); } catch { } m.scratch = null; } };
  const kill = (m) => { const p = m.pty; m.pty = null; if (p) { try { p.kill('SIGKILL'); } catch { } } };
  const end = (m, phase, error = null) => {
    if (!live(m)) return;
    m.phase = phase; m.error = error; m.endedAt = now();
    if (m.orphanTimer) { clearTimeout(m.orphanTimer); m.orphanTimer = null; }
    if (m.rawTimer) { clearTimeout(m.rawTimer); m.rawTimer = null; }
    m.holders = null;
    if (phase === 'connected') m.screen = initialRawScreen(); // a landed sign-in's screen (the echoed code) is dropped at once
    kill(m); wipe(m);
    log(`[claude-signin] ${m.id} ${m.accountId} -> ${phase}`);
    emit(m);
  };
  // a dir that lost its .claude.json would show the theme / trust / onboarding
  // screens and hang the headless login — a belt (the add flow's dir is already
  // seeded by the account manager; this only fires on a dir missing the file).
  const ensureSeed = (dir) => {
    try {
      const f = path.join(dir, '.claude.json');
      if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ hasCompletedOnboarding: true, hasTrustDialogAccepted: true }), { mode: 0o600 });
    } catch { }
  };
  const statusOk = (dir) => {
    try { const s = JSON.parse(fs.readFileSync(path.join(dir, LOGIN_STATUS_FILE), 'utf8')); return s && s.state === 'success'; } catch { return false; }
  };

  const feed = (m, chunk, opts) => {
    if (!live(m) || !m.parse) return;
    // THE RAW SCREEN (lane signin-card-real-screen, the owner's fallback): every byte the CLI wrote, in this
    // run's memory only — the person's own card reads it (GET …/signin/screen), nothing broadcasts or logs it
    if (chunk) {
      m.screen = rawAppend(m.screen, chunk);
      if (!m.outputAt) {
        m.outputAt = now();
        // N s after the CLI's first output and still no link read ⇒ the card shows the raw screen (the code box stays)
        m.rawTimer = setTimeout(() => { m.rawTimer = null; if (live(m) && !m.url && m.phase !== 'connecting') { m.stalled = true; m.rawHint = 'stalled'; emit(m); } }, rawAfterMs);
        if (m.rawTimer.unref) m.rawTimer.unref();
      }
    }
    const r = signinStep(m.parse, chunk, { ...(opts || {}), typed: m.typed || null }); // the echoed code is a line the reader knows
    m.parse = r.state; m.lastLine = r.lastLine;
    let moved = false;
    for (const st of r.steps) {
      if (st.kind === 'connected') { end(m, 'connected'); return; }
      if (st.kind === 'error') { end(m, 'failed', st.line); return; }
      if (st.kind === 'url') { m.url = st.url; if (m.phase === 'starting') m.phase = 'url'; moved = true; }
      if (st.kind === 'code-prompt') { if ((m.phase === 'starting' || m.phase === 'url') && m.url) m.phase = 'waiting-code'; moved = true; }
    }
    if (m.url && m.phase === 'url' && r.state.seen && r.state.seen.prompt) { m.phase = 'waiting-code'; moved = true; }
    // the parser keeps watching: a recognised state flips the card back to the parsed view
    const hint = r.unknown ? 'unknown' : (m.stalled && !m.url ? 'stalled' : null);
    if (hint !== (m.rawHint || null)) { m.rawHint = hint; moved = true; }
    if (moved) emit(m);
  };

  function forAccount(accountId) { return runs.get(accountId) || null; }

  // the never-signed-in rows the card made (accounts.js `signinPending`): one
  // past the TTL since its mark or its last run, with no run live, is debris.
  function sweepPending({ except = null } = {}) {
    if (typeof accounts.pendingSignins !== 'function' || typeof accounts.discardPendingSignin !== 'function') return 0;
    let n = 0;
    for (const p of accounts.pendingSignins()) {
      if (p.id === except) continue;
      const m = runs.get(p.id);
      if (live(m)) continue;
      const last = Math.max(Number(p.signinPending) || 0, Number(m && (m.endedAt || m.startedAt)) || 0);
      if (now() - last < ttlMs) continue;
      try { if (accounts.discardPendingSignin(p.id)) { runs.delete(p.id); n++; } } catch { }
    }
    if (n) log(`[claude-signin] removed ${n} never-signed-in account row(s) past the sign-in TTL`);
    return n;
  }

  function start({ accountId }) {
    const a = accounts.get(accountId);
    if (!a) return { ok: false, status: 404, error: 'unknown account: ' + accountId, code: 'unknown_account' };
    const running = forAccount(accountId);
    // ONE login run per account (lane signin-card-real-screen — a second press, a second card, the tour's terminal
    // road): a press on a live run JOINS it, never a second helper on the same config dir
    if (live(running)) return { ok: true, joined: true, signin: publicSignin(running) };
    sweepPending({ except: accountId });
    let dir;
    try { dir = accounts.subDir(accountId); } catch (e) { return { ok: false, status: 400, error: String((e && e.message) || e), code: 'no_dir' }; }
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { }
    ensureSeed(dir);
    const id = 'si-' + crypto.randomBytes(6).toString('hex');
    const scratch = fs.mkdtempSync(path.join(tmpRoot, SCRATCH_PREFIX));
    try { fs.chmodSync(scratch, 0o700); } catch { }
    const opener = path.join(scratch, 'open-url');
    try { fs.writeFileSync(opener, '#!/bin/sh\nexit 0\n', { mode: 0o700 }); } catch { }
    const e = mintEnvOf(agentEnv(env), { home: scratch, configDir: dir, browser: opener });
    const m = { id, accountId, dir, scratch, phase: 'starting', url: null, email: null, error: null, rev: 0, startedAt: now(), endedAt: null, pty: null, parse: initialSigninParse(), lastLine: '', timer: null, codeSent: false, holders: null, orphanTimer: null, screen: initialRawScreen(), outputAt: 0, rawTimer: null, stalled: false, rawHint: null };
    runs.set(accountId, m);
    if (!helperPath) { end(m, 'failed', 'the sign-in helper is not configured'); return { ok: true, signin: publicSignin(m) }; }
    try {
      m.pty = spawn(nodeCmd, [helperPath, '--config-dir', dir, '--claude', claudeCmd], { name: 'xterm-256color', cols: 400, rows: 50, cwd: scratch, env: e });
    } catch (err) {
      end(m, 'failed', 'could not start the Claude sign-in: ' + String((err && err.message) || err));
      return { ok: true, signin: publicSignin(m) };
    }
    const p = m.pty;
    p.onData((d) => { if (m.pty === p) feed(m, d); });
    p.onExit(({ exitCode } = {}) => {
      if (m.pty !== p) return;
      m.pty = null;
      feed(m, '', { final: true });
      if (live(m)) {
        if (exitCode === 0 && statusOk(dir)) end(m, 'connected');
        // once a code was sent the screen echoes it — the backstop never reads the screen then
        else end(m, 'failed', m.codeSent ? ENDED_AFTER_CODE : (m.lastLine || ('the sign-in ended (exit ' + exitCode + ') without logging in')));
      }
    });
    m.timer = setTimeout(() => {
      if (live(m)) end(m, 'failed', 'the sign-in was not finished within 10 minutes');
      const t2 = setTimeout(() => { if (runs.get(accountId) === m) runs.delete(accountId); }, 60e3); if (t2.unref) t2.unref();
    }, ttlMs);
    if (m.timer.unref) m.timer.unref();
    log(`[claude-signin] ${id} ${accountId} started`);
    emit(m);
    return { ok: true, signin: publicSignin(m) };
  }

  function sendCode(accountId, code) {
    const m = runs.get(accountId);
    if (!m) return { ok: false, status: 404, error: 'no sign-in is running', code: 'unknown_signin' };
    // the raw screen's code box (lane signin-card-real-screen): the reader placed no link, the person read the prompt themselves
    const rawWaiting = m.phase === 'starting' && !!m.rawHint;
    if (!live(m) || !m.pty || !(m.phase === 'url' || m.phase === 'waiting-code' || rawWaiting)) return { ok: false, status: 409, error: 'this sign-in is not waiting for a code', code: 'not_waiting', signin: publicSignin(m) };
    const v = codeVerdict(code);
    if (!v.ok) return { ok: false, status: 400, error: v.error, code: v.code };
    m.codeSent = true;
    m.typed = v.code; // memory only: the raw screen reads its tty echo as • (never a field of a run's snapshot)
    try { m.pty.write(v.code); m.pty.write('\r'); } catch { end(m, 'failed', 'the sign-in command is gone'); return { ok: true, signin: publicSignin(m) }; }
    m.phase = 'connecting';
    emit(m);
    return { ok: true, signin: publicSignin(m) };
  }

  function cancel(accountId) {
    const m = runs.get(accountId);
    if (!m) return { ok: false, status: 404, error: 'no sign-in is running', code: 'unknown_signin' };
    end(m, 'cancelled');
    return { ok: true, signin: publicSignin(m) };
  }

  function get(accountId) { const m = runs.get(accountId); return m ? publicSignin(m) : null; }
  // the raw screen since `from` (the card's «原始画面») — the run's own memory, null when there is no run
  function screen(accountId, from) { const m = runs.get(accountId); return m ? { id: m.id, ...rawSince(m.screen, from, { mask: m.typed }) } : null; }
  function stopAll() { for (const m of runs.values()) { end(m, 'cancelled'); if (m.timer) clearTimeout(m.timer); } }

  // THE RUN IS THE STARTING PAGE'S: the card holds it over its socket (and again
  // after every reconnect); the last holder's socket closing arms the orphan
  // timer, a re-hold disarms it.
  function hold(accountId, runId, sock) {
    const m = runs.get(accountId);
    if (!live(m) || !sock || (runId && m.id !== runId)) return false;
    (m.holders || (m.holders = new Set())).add(sock);
    if (m.orphanTimer) { clearTimeout(m.orphanTimer); m.orphanTimer = null; }
    return true;
  }
  function releaseSocket(sock) {
    for (const m of runs.values()) {
      if (!live(m) || !m.holders || !m.holders.delete(sock) || m.holders.size) continue;
      if (m.orphanTimer) clearTimeout(m.orphanTimer);
      m.orphanTimer = setTimeout(() => { m.orphanTimer = null; if (live(m) && !(m.holders && m.holders.size)) end(m, 'cancelled'); }, orphanMs);
      if (m.orphanTimer.unref) m.orphanTimer.unref();
    }
  }

  // a hub killed mid-run leaves its 0700 scratch dir — swept at boot by AGE.
  function sweep() {
    let n = 0, names = [];
    try { names = fs.readdirSync(tmpRoot); } catch { }
    for (const f of names) {
      if (!f.startsWith(SCRATCH_PREFIX)) continue;
      const p = path.join(tmpRoot, f);
      try {
        const st = fs.lstatSync(p);
        if (!st.isDirectory() || (process.getuid && st.uid !== process.getuid()) || now() - st.mtimeMs < sweepAgeMs) continue;
        fs.rmSync(p, { recursive: true, force: true }); n++;
      } catch { }
    }
    if (n) log(`[claude-signin] boot sweep: removed ${n} orphaned sign-in scratch dir(s)`);
    return n;
  }
  sweep();
  sweepPending();
  if (exitHook) process.on('exit', stopAll);

  const api = { start, sendCode, cancel, get, screen, forAccount: (aid) => publicSignin(forAccount(aid)), isLive: (aid) => live(runs.get(aid)), hold, releaseSocket, stopAll, sweep, sweepPending, _runs: runs };
  if (hub) HUB = api;
  return api;
}

// the hub's ONE instance, for the WS layer (src/ws-handler.js): a page holds its
// run (`claude-signin-hold` {accountId, id}) and its socket's close releases it.
let HUB = null;
function socketHold(sock, data) { return !!(HUB && data && HUB.hold(String(data.accountId || ''), String(data.id || ''), sock)); }
function socketClosed(sock) { if (HUB) HUB.releaseSocket(sock); }

/** The sign-in routes (human-only — an agent's session / job token is refused
 *  by name; a sign-in is the person's own consent). Answers are publicSignin
 *  shapes only. */
function registerSigninRoutes(app, { signin, isAgentBearer }) {
  const refuse = (req, res) => { if (!isAgentBearer(req)) return false; res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' }); return true; };
  const answer = (res, r) => (r.ok ? res.json({ success: true, signin: r.signin }) : res.status(r.status || 400).json({ error: r.error, code: r.code, signin: r.signin || null }));
  app.post('/api/accounts/:id/signin', (req, res) => { if (refuse(req, res)) return; try { answer(res, signin.start({ accountId: req.params.id })); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get('/api/accounts/:id/signin', (req, res) => { if (refuse(req, res)) return; res.json({ signin: signin.get(req.params.id) }); });
  // the raw screen (lane signin-card-real-screen): answered to the asking page only — never broadcast, logged or stored
  app.get('/api/accounts/:id/signin/screen', (req, res) => { if (refuse(req, res)) return; res.set('Cache-Control', 'no-store'); res.json({ screen: signin.screen(req.params.id, req.query && req.query.from) }); });
  app.post('/api/accounts/:id/signin/code', (req, res) => { if (refuse(req, res)) return; answer(res, signin.sendCode(req.params.id, req.body && req.body.code)); });
  app.delete('/api/accounts/:id/signin', (req, res) => { if (refuse(req, res)) return; answer(res, signin.cancel(req.params.id)); });
}

module.exports = { create, registerSigninRoutes, socketHold, socketClosed, SIGNIN_TTL_MS, SIGNIN_ORPHAN_MS, SCRATCH_PREFIX, LOGIN_STATUS_FILE };
