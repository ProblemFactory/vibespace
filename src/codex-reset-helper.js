'use strict';
// THE RESET-CREDIT HELPER (lane reset-path, 2026-10-01; docs/design-reset-credits.zh.md §17) —
// SHARED tier: node builtins only (+ the codex command src/codex-thread-read.js is configured
// with, so a re-resolved CLI path reaches this spawn too).
//
// WHY IT EXISTS. A stored codex reset credit is spent by `account/rateLimitResetCredit/consume`,
// a request the codex APP-SERVER makes. The only app-server VibeSpace reached was a LIVE chat
// session's (the wrapper's `codex-reset-credit` verb), so the Agents list answered
// `no_live_session` for an account with no chat open — and an account whose every conversation
// ran a wrapper older than the idempotency-key fix (2.369.199) could not spend a credit at all.
// This module is ONE bounded `codex app-server` child — the src/codex-thread-read.js spawn shape —
// speaking exactly what the wrapper speaks (the requests are judged against the MEASURED method
// tables by scripts/test-codex-protocol-drift.mjs, like the wrapper's):
//
//   initialize {clientInfo, capabilities} → initialized →
//   account/rateLimitResetCredit/consume {idempotencyKey} → account/rateLimits/read {} → kill
//
// under ONE wall (HELPER_WALL_MS, 30 s) for the whole child, killed at the end whatever happened.
// No retry here: a consume that got no answer inside the wall is reported `sent` + unanswered,
// and the engine's 10-minute floor (armed exactly by that) keeps the next press from minting a
// second key while the first may still land.
//
// A VENDOR CALL FROM A HUMAN CLICK, allowlisted deliberately (scripts/test-vendor-whitelist.mjs
// §8, with its gates): the ONE caller is the engine's manual use (POST
// /api/accounts/:id/reset-credit — human-only, cookie-only, one spawn per press, through the
// spend ceiling and the floor). Never a timer, never an agent token, never the auto rung.
//
// NETWORK, MEASURED (2026-10-01, codex-cli 0.159.3 — scripts/measure-reset-helper.mjs drove THIS
// function under `strace -f` inside `sudo -n unshare -n` + setpriv back to the user, with an EMPTY
// CODEX_HOME and HOME (no login, no route out)): the node process running this module made ZERO
// internet-family calls; every one came from the app-server's own startup — it starts
// `git ls-remote https://github.com/openai/plugins.git` (its plugin marketplace sync: 4 DNS
// attempts to the local resolver, all ENETUNREACH), `lsb_release -a` and a `bwrap --unshare-net`
// sandbox probe — and the logged-out consume answered "codex account authentication required for
// rate limit reset credits" in 167 ms. With a route out the startup also reaches chatgpt.com on its
// own (0.153.4, 2026-09-07: 7 INET connects incl. chatgpt.com:443 logged out — src/local-oracles.js
// `codex-app-server-config-read`); with a login the consume and the read ARE the vendor calls this
// helper exists for. MEASURED_CONNECTS is that record; the vendor-whitelist row pins it.
const { spawn } = require('child_process');

const HELPER_WALL_MS = 30000;
// the wrapper's own clientInfo (data/bin/codex-chat-wrapper.js) — the app-server sees one client
const CLIENT_INFO = Object.freeze({ name: 'claude-code-webui', title: 'Claude Code WebUI', version: '2.0.0' });
// THE MEASUREMENT (scripts/measure-reset-helper.mjs; never re-run by a gate — it starts the real
// vendor CLI). Every internet-family call it made, all refused by the empty network namespace:
// the counts per destination class are what the vendor-whitelist row pins.
const MEASURED_CONNECTS = Object.freeze({
  tool: 'strace -f -qq -s 256 -e trace=connect,sendto,sendmsg,execve', date: '2026-10-01', version: 'codex-cli 0.159.3',
  runner: 'sudo -n unshare -n + setpriv (an empty network namespace, back to this user); CODEX_HOME and HOME empty, vendor keys stripped',
  ours: Object.freeze({ inet: 0 }), // the node process that runs this module
  appServer: Object.freeze({ inet: 4, inetOk: 0, dns: 4, https: 0, other: 0, errors: 'ENETUNREACH' }),
  started: Object.freeze(['git ls-remote https://github.com/openai/plugins.git (the plugin marketplace sync)', 'lsb_release -a', 'bwrap --unshare-net /bin/true (its sandbox probe)']),
  consumeLoggedOut: 'codex account authentication required for rate limit reset credits (167 ms)',
  withNetwork: '0.153.4, 2026-09-07, logged out: 7 INET connects incl. chatgpt.com:443 — the app-server startup reaches the vendor on its own (src/local-oracles.js codex-app-server-config-read)',
});

/**
 * consumeResetCreditViaAppServer({ idempotencyKey, env, cwd, codexCmd?, extraArgs?, wallMs?, onSent? })
 *   → Promise<{ sent, answered, outcome, result, error, rateLimits, resetCredits, readError, stage, ms }>
 * NEVER rejects. `sent` = the consume was written to the app-server's stdin (the one fact the
 * floor arms on); `answered` = the app-server answered it (a result or a JSON-RPC error);
 * `outcome` = the vendor's word (`reset | nothingToReset | noCredit | alreadyRedeemed`);
 * `rateLimits` / `resetCredits` = the post-consume `account/rateLimits/read` (null + `readError`
 * when it failed). `stage` = where it ended: spawn | initialize | consume | read | done.
 * `onSent(idempotencyKey)` runs synchronously right after the consume is written.
 * THE BELTS (verify r1, the credential class): `env` is REQUIRED and must name `CODEX_HOME` (the account's own
 * login) — the module never inherits process.env (the server's own home would be the machine's global login);
 * `pressedBy` must be 'person' (the engine passes the attempt's origin: a record the auto rung opened is refused
 * here, whatever the static census missed). The child is a process GROUP (detached) and the wall kills the group:
 * the app-server's own children (its plugin-marketplace `git ls-remote`, `lsb_release`, the `bwrap` probe) go with it.
 * `readFirst(reading)` (verify r1, the unknown consume): when given, ONE `account/rateLimits/read` goes out
 * BEFORE the consume and the judge is awaited with {rateLimits, resetCredits}; a false answer ends the run
 * with `skipped: true` and NO consume (the earlier request had landed, or the reading could not tell) —
 * the same spawn, the same press, one more read on the same login.
 */
function consumeResetCreditViaAppServer({ idempotencyKey, env, cwd, codexCmd, extraArgs, wallMs = HELPER_WALL_MS, onSent, readFirst = null, pressedBy = null } = {}) {
  const t0 = Date.now();
  let cfg = {};
  try { cfg = require('./codex-thread-read.js').configure({}); } catch { cfg = {}; }
  const cmd = codexCmd || cfg.codexCmd || null;
  const args = ['app-server', ...(Array.isArray(extraArgs) ? extraArgs : (Array.isArray(cfg.extraArgs) ? cfg.extraArgs : []))];
  return new Promise((resolve) => {
    const out = { sent: false, answered: false, outcome: null, result: null, error: null, rateLimits: null, resetCredits: null, readError: null, stage: 'spawn', ms: 0, skipped: false };
    let child = null, settled = false, buf = '', nextId = 1, timer = null;
    const pending = new Map();
    // the whole process GROUP (the child is detached = its own group leader), else the child alone — declared
    // ABOVE finish like `timer` (a refusal before the spawn runs finish first)
    const killTree = (sig) => { if (!child || !child.pid) return; try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { } } };
    // `timer` is declared ABOVE finish (verify r1): a refusal before the spawn calls finish before the wall exists —
    // a `const timer` below it threw "Cannot access 'timer' before initialization" into the Promise executor and
    // the "never rejects" contract rejected exactly on the refusals
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error && !out.error && !(out.answered && out.stage === 'read')) out.error = String(error);
      if (error && out.answered && out.stage === 'read' && !out.readError) out.readError = String(error);
      out.ms = Date.now() - t0;
      try { child && child.stdin && child.stdin.end(); } catch { }
      killTree('SIGTERM');
      const k = setTimeout(() => killTree('SIGKILL'), 2000);
      if (k && k.unref) k.unref();
      // a SNAPSHOT: the request chain below may still wake (its pending promises are dropped, never
      // rejected into it) — what was resolved is what happened up to the wall, never edited after
      pending.clear();
      resolve({ ...out });
    };
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) return finish('an idempotencyKey is required (one per press)');
    if (pressedBy !== 'person') return finish('refused: only a person\'s press starts the reset-credit helper (pressedBy)');
    if (!env || typeof env !== 'object' || typeof env.CODEX_HOME !== 'string' || !env.CODEX_HOME) return finish('refused: the helper runs only on an explicit CODEX_HOME (the account\'s own login) — no env, no login');
    if (!cmd) return finish('codex command not configured (codex-cli is not installed here)');
    timer = setTimeout(() => finish(out.stage === 'consume'
      ? `account/rateLimitResetCredit/consume timed out after ${wallMs}ms`
      : `the codex helper did not finish within ${wallMs}ms (stage ${out.stage})`), wallMs);
    if (timer && timer.unref) timer.unref();
    const send = (o) => { child.stdin.write(JSON.stringify(o) + '\n'); };
    const request = (method, params) => new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      try { send({ id, method, params }); } catch (e) { pending.delete(id); rej(e); }
    });
    const notify = (method, params) => { try { send({ method, params }); } catch { } };
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: cwd || undefined, detached: true });
    } catch (e) { return finish(`could not start codex app-server: ${e.message}`); }
    child.on('error', (e) => finish(`could not start codex app-server: ${e.message}`));
    child.on('exit', (code, sig) => finish(`codex app-server exited (${sig || code}) during ${out.stage}`));
    child.stdin.on('error', () => { });
    child.stderr.on('data', () => { });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        // a RESPONSE (id, no method). Notifications and server requests are not ours to answer:
        // none of these three methods asks the client anything
        if (m && m.id !== undefined && !m.method && pending.has(m.id)) {
          const p = pending.get(m.id); pending.delete(m.id);
          if (m.error) p.rej(new Error(m.error.message || `JSON-RPC ${m.id} failed`)); else p.res(m.result);
        }
      }
    });
    (async () => {
      out.stage = 'initialize';
      await request('initialize', { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true } });
      notify('initialized');
      if (typeof readFirst === 'function') {
        // THE READ BEFORE THE CONSUME (verify r1): an earlier request on this login got no answer — this reading
        // says whether it landed; the consume goes out only if the judge says the credit is still to be spent
        out.stage = 'read-first';
        let r0 = null, readErr = null;
        try { r0 = await request('account/rateLimits/read', {}); } catch (e) { if (settled) return; readErr = String((e && e.message) || e); }
        if (settled) return;
        const rl0 = (r0 && (r0.rateLimits || r0.rate_limits)) || null, rc0 = (r0 && (r0.rateLimitResetCredits || r0.rate_limit_reset_credits)) || null;
        if (!readErr && !rl0) readErr = 'no rateLimits in the read before the consume';
        let go = false;
        // THE READ FAILED (verify r8 T0): the judge decides — an unsettled prior still refuses (it needs a reading), else
        // the consume goes out on the count the dialog showed (a failed read never blocks a person's press; said there)
        try { go = (await readFirst(readErr ? { rateLimits: null, resetCredits: null, readError: readErr } : { rateLimits: rl0, resetCredits: rc0 })) === true; } catch { go = false; }
        if (settled) return;
        if (readErr) out.readError = readErr;
        if (!go) { out.skipped = true; out.rateLimits = rl0; out.resetCredits = rc0; out.stage = 'skipped'; return finish(readErr ? `the read before the consume failed (${readErr.slice(0, 120)}) — nothing sent` : undefined); }
      }
      out.stage = 'consume';
      const consumed = request('account/rateLimitResetCredit/consume', { idempotencyKey });
      // THE REQUEST WENT OUT — the one fact the engine's floor arms on (written to the app-server's
      // stdin with this press's key; the app-server makes the vendor call)
      out.sent = true;
      try { if (typeof onSent === 'function') onSent(idempotencyKey); } catch { }
      let r = null;
      try { r = await consumed; } catch (e) { if (settled) return; out.answered = true; out.error = String((e && e.message) || e); return finish(); }
      if (settled) return;
      out.answered = true;
      out.result = r || null;
      out.outcome = (r && r.outcome) || null;
      // the post-consume reading, like the wrapper's: the engine writes it through the ONE cache
      // writer BEFORE it reads the answer (reset credits r3 — the pool decides on that cache)
      out.stage = 'read';
      try {
        const r2 = await request('account/rateLimits/read', {});
        if (settled) return;
        out.rateLimits = (r2 && (r2.rateLimits || r2.rate_limits)) || null;
        out.resetCredits = (r2 && (r2.rateLimitResetCredits || r2.rate_limit_reset_credits)) || null;
        if (!out.rateLimits) out.readError = 'no rateLimits in the post-reset read';
      } catch (e) { out.readError = String((e && e.message) || e); }
      out.stage = 'done';
      finish();
    })().catch((e) => finish(e && e.message ? e.message : String(e)));
  });
}

module.exports = { consumeResetCreditViaAppServer, HELPER_WALL_MS, CLIENT_INFO, MEASURED_CONNECTS };
