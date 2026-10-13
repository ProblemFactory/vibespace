'use strict';
// THE LONG-LIVED TOKEN MINT, DRIVEN BY THE HUB (lane oat-mint-flow, owner
// 2026-10-13: "能不能自动完成登录+读取token？" — the dialog used to close, open
// a terminal on `claude setup-token`, and leave the person to copy the token
// and reopen the dialog to paste it). ORCH: the hub runs the CLI in a PTY it
// owns, the PURE src/oat-mint-model.js reads the screen, and the token goes
// straight from the PTY slice into accounts.setOat — THE save path of
// POST /api/accounts/:id/oat, every check of it kept (B-855a).
//
// Isolation: a scratch dir per mint (0700) is the CLI's HOME and
// CLAUDE_CONFIG_DIR — the hub's own ~/.claude is never read or written —
// deleted when the mint ends; the env is an ALLOWLIST over agentEnv()
// (mintEnvOf, oat-verify F2). $BROWSER is a 3-line script that writes the URL
// the CLI wants opened into the scratch dir: that one (redirect = localhost on
// THIS machine) is the zero-copy door for a browser running on the hub.
//
// WHOSE TOKEN IS IT (oat-verify F1): the browser sign-in decides the account,
// not the dialog. A token is saved ONLY under the row it is PROVEN to belong to:
// (1) the sign-in identity the CLI left in the scratch config, read in-process
// (CLI 2.1.296 writes none for setup-token — measured on the binary; a later
// CLI may); (2) else ONE /usage panel read with the NEW token (the auto-cli
// rung's own spawn, owner ruling 2026-10-13), its weekly window against every
// row's anchor. Another row's ⇒ refused, nothing saved. Nothing proven (no
// anchor, a shared window, the read failed) ⇒ `confirm`: the token waits in
// memory and the person picks the account — journaled owner-confirmed.
// A hub that dies mid-mint leaves its scratch dir: swept by age at boot (F3).
//
// THE SECRET'S ONE ROAD: PTY chunk → mintStep's `token` step → setOat. It is
// never a field of a mint, never logged, never in a broadcast / GET answer /
// error word (publicMint is a whitelist; words pass redact()). The pasted
// sign-in code goes to the PTY and nowhere else. scripts/test-oat-mint.mjs
// spies every outbound path and runs mutant copies of this file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { agentEnv } = require('../agent-env.js');
const { mintStep, initialMintParse, publicMint, codeVerdict, identityVerdict, mintEnvOf, MINT_DONE } = require('../oat-mint-model.js');
const { machineOauthAccount } = require('./usage-probe-log.js');
const readingLag = require('../reading-lag.js');

const MINT_TTL_MS = 10 * 60e3;
const SCRATCH_PREFIX = 'vs-oat-mint-';

function create({ accounts, claudeCmd = 'claude', broadcastAll = () => { }, spawnPty = null, env = process.env,
  tmpRoot = os.tmpdir(), ttlMs = MINT_TTL_MS, now = () => Date.now(), log = (...a) => console.log(...a),
  probePanel = null, windows = () => ({}), journal = () => { }, exitHook = false, sweepAgeMs = MINT_TTL_MS + 5 * 60e3 } = {}) {
  const mints = new Map(); // id → { id, accountId, phase, url, localUrl, error, verdict, signedInAs, other, choices, startedAt, endedAt, mintedAt, pty, dir, parse, lastLine, timer } — publicMint whitelists what leaves
  // a token waiting for the person's pick (F1 `confirm`): hub memory only, keyed
  // by mint id — never a field of a mint, so no copy of one can carry it
  const held = new Map();
  const spawn = spawnPty || ((file, args, opts) => require('node-pty').spawn(file, args, opts));
  const emit = (m) => { try { broadcastAll({ type: 'oat-mint', mint: publicMint(m) }); } catch { } };
  const live = (m) => m && !MINT_DONE.includes(m.phase);
  const wipe = (m) => {
    m.parse = null;
    if (m.dir) { try { fs.rmSync(m.dir, { recursive: true, force: true }); } catch { } m.dir = null; }
  };
  const kill = (m) => { const p = m.pty; m.pty = null; if (p) { try { p.kill('SIGKILL'); } catch { } } };
  const end = (m, phase, error = null) => {
    if (!live(m)) return;
    m.phase = phase; m.error = error; m.endedAt = now();
    kill(m); wipe(m); held.delete(m.id); m.choices = null;
    log(`[oat-mint] ${m.id} ${m.accountId} → ${phase}`);
    emit(m);
  };
  const readLocalUrl = (m) => {
    try { const u = fs.readFileSync(path.join(m.dir, 'browser-url'), 'utf8').trim().split('\n')[0]; return /^https?:\/\/\S+$/.test(u) ? u : null; } catch { return null; }
  };
  const childEnv = (dir) => mintEnvOf(agentEnv(env), { home: dir, configDir: path.join(dir, 'config'), browser: path.join(dir, 'open-url') });
  const nameOf = (id) => { const a = accounts.get(id); return (a && a.name) || String(id); };
  const note = (m, outcome, extra = {}) => { try { journal({ mint: m.id, accountId: m.accountId, name: nameOf(m.accountId), outcome, ...extra }); } catch { } };
  const save = (m, token, how) => {
    // THE save path of POST /oat — the same verification (account exists, a
    // Claude subscription, the sk-ant-oat shape); a refusal is the CLI's run
    // failing in words, the token itself never quoted. `how` = the proof (F1).
    try {
      const r = accounts.setOat(m.accountId, token);
      m.mintedAt = (r && r.mintedAt) || now();
      note(m, how);
      end(m, 'saved');
    } catch (e) { end(m, 'failed', String((e && e.message) || 'could not store the token')); }
  };
  // ── F1: whose token is it ──
  // the row's own login (its dir's .claude.json — the panel-identity read) or
  // the email declared / confirmed on the row
  const rowIdentity = (id) => {
    const a = accounts.get(id); if (!a) return null;
    let own = null; try { own = machineOauthAccount(accounts.subDir(id)); } catch { }
    const email = (own && own.email) || a.email || null, orgUuid = (own && own.orgUuid) || null;
    return email || orgUuid ? { email, orgUuid } : null;
  };
  // what the CLI wrote at sign-in into the scratch config — read here, in
  // process, never logged or sent (only its email is ever shown)
  const signedIn = (m) => { for (const d of [path.join(m.dir, 'config'), m.dir]) { const o = machineOauthAccount(d); if (o && (o.email || o.orgUuid)) return o; } return null; };
  // the panel's weekly window against every row's anchor (reading-lag's own verdicts)
  const panelVerdict = (accountId, panel) => {
    const win = readingLag.windowOf(panel);
    if (!win.sevenDay && !Object.keys(win.scoped).length) return { verdict: 'none', why: 'the panel states no weekly window' };
    let ws = {}; try { ws = windows() || {}; } catch { }
    const own = ws[accountId] ? readingLag.compareWindows(win, ws[accountId]) : 'unknown';
    const others = Object.keys(ws).filter((id) => id !== accountId && readingLag.compareWindows(win, ws[id]) === 'agree');
    const fp = readingLag.windowFingerprint(win);
    if (own === 'agree' && !others.length) return { verdict: 'match', fp };
    if (own !== 'agree' && others.length) return { verdict: 'mismatch', fp, others };
    return { verdict: 'none', fp, why: own === 'agree' ? `the window is shared with ${others.length} other account(s)` : (own === 'unknown' ? 'the row has no anchor yet' : 'the window matches no account') };
  };
  // the rows a person may pick: subscriptions whose creds row declares a long-lived token (setOat's own check)
  const canHoldOat = (id) => { try { const a = accounts.get(id); return !!(a && accounts._credsOf(accounts._acctBackend(a)).longLivedToken); } catch { return false; } };
  const refuse = (m, sentence, extra) => { m.verdict = 'identity_mismatch'; note(m, 'identity_mismatch', extra); end(m, 'failed', sentence); };
  const ask = (m, token, why) => {
    held.set(m.id, token); kill(m); wipe(m);
    m.phase = 'confirm'; m.verdict = 'unproven';
    m.choices = (accounts.list().accounts || []).filter((x) => x && x.type === 'subscription' && !x.pooled && canHoldOat(x.id)).map((x) => ({ id: x.id, name: x.name || x.id }));
    note(m, 'awaiting-owner', { why });
    emit(m);
  };
  const decide = async (m, token) => {
    kill(m);
    const who = m.dir ? signedIn(m) : null;
    if (who && who.email) m.signedInAs = who.email;
    const iv = identityVerdict(rowIdentity(m.accountId), who);
    if (iv === 'match') return save(m, token, 'identity-proven');
    if (iv === 'mismatch') return refuse(m, `this token belongs to ${who.email || who.orgName || 'another account'}, not ${nameOf(m.accountId)} — not saved`, { on: 'sign-in identity' });
    if (!probePanel || !m.dir) return ask(m, token, 'no sign-in identity in the scratch config');
    let panel = null;
    try { panel = await probePanel({ env: { ...childEnv(m.dir), CLAUDE_CODE_OAUTH_TOKEN: token }, cwd: m.dir }); } catch { panel = null; }
    if (!live(m)) return; // cancelled or timed out during the read
    const pv = panel ? panelVerdict(m.accountId, panel) : { verdict: 'none', why: 'the /usage read failed' };
    if (pv.verdict === 'match') return save(m, token, 'fingerprint-proven');
    if (pv.verdict === 'mismatch') { m.other = pv.others.map(nameOf).join(', '); return refuse(m, `this token's usage window matches ${m.other}, not ${nameOf(m.accountId)} — not saved`, { on: 'usage window', fp: pv.fp }); }
    return ask(m, token, pv.why);
  };
  const feed = (m, chunk, opts) => {
    if (!live(m) || !m.parse) return;
    const r = mintStep(m.parse, chunk, opts);
    m.parse = r.state; m.lastLine = r.lastLine;
    let moved = false;
    for (const st of r.steps) {
      if (st.kind === 'token') { m.parse = null; decide(m, st.token); return; }
      if (st.kind === 'error') { end(m, 'failed', st.line); return; }
      if (st.kind === 'url') { m.url = st.url; m.localUrl = readLocalUrl(m); if (m.phase === 'starting') m.phase = 'url'; moved = true; }
      if (st.kind === 'code-prompt' && (m.phase === 'starting' || m.phase === 'url')) { m.phase = m.url ? 'waiting-code' : m.phase; m.prompted = true; moved = true; }
    }
    if (m.prompted && m.url && m.phase === 'url') { m.phase = 'waiting-code'; moved = true; }
    // $BROWSER may land a beat after the screen's URL — pick it up then
    if (m.url && !m.localUrl && m.dir) { const l = readLocalUrl(m); if (l) { m.localUrl = l; moved = true; } }
    if (moved) emit(m);
  };

  function forAccount(accountId) {
    for (const m of mints.values()) if (m.accountId === accountId && live(m)) return m;
    let last = null;
    for (const m of mints.values()) if (m.accountId === accountId && (!last || m.startedAt > last.startedAt)) last = m;
    return last;
  }

  function start({ accountId }) {
    const a = accounts.get(accountId);
    if (!a) return { ok: false, status: 404, error: 'unknown account: ' + accountId, code: 'unknown_account' };
    const running = forAccount(accountId);
    if (live(running)) return { ok: false, status: 409, error: 'a sign-in for this account is already running', code: 'mint_running', mint: publicMint(running) };
    const id = 'om-' + crypto.randomBytes(6).toString('hex');
    const dir = fs.mkdtempSync(path.join(tmpRoot, SCRATCH_PREFIX));
    fs.chmodSync(dir, 0o700);
    const opener = path.join(dir, 'open-url');
    fs.writeFileSync(opener, '#!/bin/sh\nprintf \'%s\\n\' "$1" > "$(dirname "$0")/browser-url"\nexit 0\n', { mode: 0o700 });
    const e = childEnv(dir);
    const m = { id, accountId, phase: 'starting', url: null, localUrl: null, error: null, startedAt: now(), endedAt: null, mintedAt: null, pty: null, dir: dir, parse: initialMintParse(), lastLine: '' };
    mints.set(id, m);
    try {
      m.pty = spawn(claudeCmd, ['setup-token'], { name: 'xterm-256color', cols: 400, rows: 50, cwd: dir, env: e });
    } catch (err) {
      end(m, 'failed', 'could not run `claude setup-token`: ' + String((err && err.message) || err));
      return { ok: true, mint: publicMint(m) };
    }
    const p = m.pty;
    p.onData((d) => { if (m.pty === p) feed(m, d); });
    p.onExit(({ exitCode } = {}) => {
      if (m.pty !== p) return;
      m.pty = null;
      feed(m, '', { final: true });
      if (live(m)) end(m, 'failed', m.lastLine || ('the sign-in command ended (exit ' + exitCode + ') without a token'));
    });
    m.timer = setTimeout(() => {
      if (live(m)) end(m, 'failed', 'the sign-in was not finished within 10 minutes');
      const t2 = setTimeout(() => mints.delete(id), 60e3); if (t2.unref) t2.unref();
    }, ttlMs);
    if (m.timer.unref) m.timer.unref();
    log(`[oat-mint] ${id} ${accountId} started`);
    emit(m);
    return { ok: true, mint: publicMint(m) };
  }

  function sendCode(mid, code) {
    const m = mints.get(mid);
    if (!m) return { ok: false, status: 404, error: 'no such sign-in', code: 'unknown_mint' };
    if (!live(m) || !m.pty || !(m.phase === 'url' || m.phase === 'waiting-code')) return { ok: false, status: 409, error: 'this sign-in is not waiting for a code', code: 'not_waiting', mint: publicMint(m) };
    const v = codeVerdict(code);
    if (!v.ok) return { ok: false, status: 400, error: v.error, code: v.code };
    try { m.pty.write(v.code); m.pty.write('\r'); } catch { end(m, 'failed', 'the sign-in command is gone'); return { ok: true, mint: publicMint(m) }; }
    m.phase = 'minting';
    emit(m);
    return { ok: true, mint: publicMint(m) };
  }

  function cancel(mid) {
    const m = mints.get(mid);
    if (!m) return { ok: false, status: 404, error: 'no such sign-in', code: 'unknown_mint' };
    end(m, 'cancelled');
    return { ok: true, mint: publicMint(m) };
  }

  /** The person's answer to `confirm`: save under the row they PICKED (one of
   *  the listed subscription rows; default = the dialog's), or drop it. */
  function confirm(mid, { save: yes = false, accountId = null } = {}) {
    const m = mints.get(mid);
    if (!m) return { ok: false, status: 404, error: 'no such sign-in', code: 'unknown_mint' };
    if (m.phase !== 'confirm' || !held.has(m.id)) {
      const theirs = m.verdict === 'identity_mismatch';
      return { ok: false, status: 409, error: theirs ? (m.error || 'this token belongs to another account — not saved') : 'this sign-in is not waiting for a confirmation', code: theirs ? 'identity_mismatch' : 'not_confirming', mint: publicMint(m) };
    }
    if (!yes) { note(m, 'owner-declined'); end(m, 'cancelled'); return { ok: true, mint: publicMint(m) }; }
    const to = accountId || m.accountId;
    if (!(m.choices || []).some((c) => c.id === to)) return { ok: false, status: 400, error: 'pick one of the listed subscription accounts', code: 'bad_choice' };
    const token = held.get(m.id); held.delete(m.id);
    // a row that knows no identity yet learns the one the dialog SHOWED (this
    // sign-in's email) — only on this yes, never from a mint on its own
    if (m.signedInAs && !rowIdentity(to)) { try { accounts.setEmail(to, m.signedInAs); } catch { } }
    m.accountId = to;
    save(m, token, 'owner-confirmed');
    return { ok: true, mint: publicMint(m) };
  }

  function get(mid) { const m = mints.get(mid); return m ? publicMint(m) : null; }
  function stopAll() { for (const m of mints.values()) { end(m, 'cancelled'); if (m.timer) clearTimeout(m.timer); } held.clear(); }

  // F3: a hub killed mid-mint (SIGKILL, a crash) leaves its 0700 scratch dir —
  // swept at boot by AGE (another instance's live mint is younger than its own
  // TTL); an orderly exit stops every mint (exitHook: the server's SIGINT /
  // SIGTERM path ends in process.exit).
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
    if (n) log(`[oat-mint] boot sweep: removed ${n} orphaned sign-in scratch dir(s)`);
    return n;
  }
  sweep();
  if (exitHook) process.on('exit', stopAll);

  return { start, sendCode, cancel, confirm, get, forAccount: (aid) => publicMint(forAccount(aid)), stopAll, sweep, _mints: mints, _held: held };
}

/** The production `probePanel`: ONE /usage panel read through the auto-cli
 *  rung's own spawn (usage-routes spawnPanelProbe — the one allowlisted site)
 *  and its parser; any failure is null (⇒ the pick, never a silent save). */
function panelProbeVia(spawnOnce, parse) {
  return ({ env, cwd }) => new Promise((resolve) => {
    try { spawnOnce({ env, cwd }, (err, stdout) => { if (err) return resolve(null); try { resolve(parse(String(stdout || '')) || null); } catch { resolve(null); } }); } catch { resolve(null); }
  });
}

/** The mint routes (human-only — an agent's session / job token is refused
 *  by name; a mint is the per-account consent to run the subscription on
 *  remote machines). Answers are publicMint shapes only. */
function registerMintRoutes(app, { mint, isAgentBearer }) {
  const refuse = (req, res) => { if (!isAgentBearer(req)) return false; res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' }); return true; };
  const answer = (res, r) => (r.ok ? res.json({ success: true, mint: r.mint }) : res.status(r.status || 400).json({ error: r.error, code: r.code, mint: r.mint || null }));
  const own = (req, res) => { const m = mint.get(req.params.mid); if (!m || m.accountId !== req.params.id) { res.status(404).json({ error: 'no such sign-in', code: 'unknown_mint' }); return null; } return m; };
  app.post('/api/accounts/:id/oat/mint', (req, res) => { if (refuse(req, res)) return; try { answer(res, mint.start({ accountId: req.params.id })); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get('/api/accounts/:id/oat/mint', (req, res) => { if (refuse(req, res)) return; res.json({ mint: mint.forAccount(req.params.id) }); });
  app.get('/api/accounts/:id/oat/mint/:mid', (req, res) => { if (refuse(req, res)) return; const m = own(req, res); if (m) res.json({ mint: m }); });
  app.post('/api/accounts/:id/oat/mint/:mid/code', (req, res) => { if (refuse(req, res)) return; if (!own(req, res)) return; answer(res, mint.sendCode(req.params.mid, req.body && req.body.code)); });
  app.delete('/api/accounts/:id/oat/mint/:mid', (req, res) => { if (refuse(req, res)) return; if (!own(req, res)) return; answer(res, mint.cancel(req.params.mid)); });
  app.post('/api/accounts/:id/oat/mint/:mid/confirm', (req, res) => { if (refuse(req, res)) return; if (!own(req, res)) return; const b = req.body || {}; answer(res, mint.confirm(req.params.mid, { save: b.save === true, accountId: typeof b.accountId === 'string' ? b.accountId : null })); });
}

module.exports = { create, registerMintRoutes, panelProbeVia, MINT_TTL_MS, SCRATCH_PREFIX };
