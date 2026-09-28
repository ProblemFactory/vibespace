'use strict';
/**
 * THE OAUTH LOOPBACK FLOW — DUAL-MODE (docs/design-communication-panel.zh.md
 * §12.4, §14.9; the extraction of src/gmail-sync.js's own flow, P1).
 *
 * SHARED tier: node `http` + `crypto` + the PURE registry only. It is the ONE
 * consent-flow machine every adapter runs through, and it knows NOTHING about
 * any vendor: the caller hands in `buildConsentUrl({redirectUri, state})` and
 * `exchange({code, redirectUri})`; this module owns the listener, the
 * `state`, the paste-back path and the port's lifetime.
 *
 * TWO MODES, because the two vendors are not the same shape (§12.4):
 *
 *   ephemeral — `listen(0, '127.0.0.1')`, the port read back from
 *               `server.address()`, redirect_uri `http://127.0.0.1:<port>`.
 *               Google accepts any loopback port (RFC 8252 §7.3); this is
 *               exactly what src/gmail-sync.js does today.
 *   fixed     — the port AND the whole URL literal come from the `lark`
 *               row's `setup.callbackUrl` (src/integration-registry.js, the
 *               ONE definition site; the registry suite asserts the literal
 *               does not appear in THIS file). Lark redirects only to a URL
 *               registered ahead of time, byte for byte.
 *
 * A FIXED PORT IS A MACHINE-GLOBAL NAME. This box runs a production service
 * beside many development checkouts, so the fixed port is bound ONLY for the
 * duration of one flow and released on completion, cancel and timeout alike;
 * `EADDRINUSE` becomes a NAMED refusal ("another VibeSpace or tool is running
 * a Lark consent flow on port N; finish or cancel it, or use paste-back") and
 * the flow falls straight through to the PASTE-BACK path, which needs no local
 * port at all — the user pastes the redirect URL their browser could not
 * reach. Remote-browser users already take that path (§14.9(a)); it is the
 * existing surface made reachable earlier, not a new one.
 *
 * THE TWO `state` CHECKS ARE CARRIED VERBATIM from both places gmail-sync
 * performs them — the loopback request handler and `forwardCallback` — and
 * scripts/test-oauth-loopback.mjs pins both lines. An extraction that dropped
 * one would turn a fixed, publicly known loopback port into a code-injection
 * target for any local process.
 *
 * A FLOW'S END IS THE END OF WHAT IT HELD (client-from-mount verify r3). The
 * `exchange` closure an adapter hands in captures the vendor client — for
 * Gmail the PLAINTEXT client secret (a storage mount's borrowed one, since
 * 2.369.195) — and this map used to keep every flow for the process
 * lifetime: `take()` had no caller, `cancel()` left the record in place, so a
 * cancelled / timed-out / landed flow pinned its secret for ever and 10 000
 * begins pinned 10 000 copies. Three rules now: (1) the closure is DROPPED
 * the moment the flow can no longer use it — at cancel / timeout (unless an
 * exchange is in flight, which consults `cancelled()` itself) and after the
 * exchange returned; a code landing on an ended flow is reported by name
 * ("… before its code arrived"), never exchanged; (2) an ENDED flow is
 * RETIRED from the map `FLOW_RETIRE_MS` after its end (status() answers the
 * dialog's polling meanwhile; the channels engine sweeps its own pending
 * records on the same 30 min), swept at every begin() and status();
 * (3) at most `MAX_RUNNING_FLOWS` run at once — the 33rd begin() ends the
 * OLDEST running flow by name (a human never has 32 consents open; an
 * automated caller cannot pin more than 32 secrets or listeners).
 *
 * VERIFY r4 — THE END DROPS EVERY CLOSURE THE ADAPTER HANDED IN, AND THE
 * MACHINE'S OWN ENDS ARE SAID. (a) r3 dropped `exchange` and kept `onDone`
 * "until a late code has been reported". Both adapters create the two in ONE
 * scope (`const {clientId, clientSecret} = cred.values; … exchange: …,
 * onDone: …`) and closures of one scope share ONE context, so the kept
 * `onDone` kept the secret: a heap snapshot of the real Gmail adapter after a
 * cancel still held the plaintext (30 min, until retirement). `forget(st)`
 * drops BOTH; while an exchange is in flight both stay until it returns.
 * (b) So nothing can report a flow that ended earlier — and two ends are
 * nobody's act but this machine's: the TIMEOUT and the CAP. Each is REPORTED
 * ONCE through `onDone` ({ok:false, cancelled, error}) and then forgotten
 * (`endByItself`); a caller's own cancel (cancel / a newer begin of the same
 * id / stopAll) reports nothing, as before. (c) The cap's cause is its own
 * name, `over-limit`: r3 called it `superseded`, the word consumers read as
 * "a NEWER sign-in of this account stands" — a cap eviction mid-exchange was
 * logged as that and said nowhere. (d) begin()'s OWN exits: a flow ended
 * while begin() awaits its listener (a same-tick second begin, the cap,
 * stopAll) never keeps the listener it was binding — in fixed mode that
 * listener held the registered port for the process lifetime — and a
 * `buildConsentUrl` that throws leaves no flow, no listener, no closure.
 */
const http = require('http');
const crypto = require('crypto');
const { LARK_CALLBACK_URL } = require('./integration-registry.js');

/** gmail-sync's own budget for a consent flow, carried over. */
const FLOW_TIMEOUT_MS = 10 * 60 * 1000;
/** verify r3: an ENDED flow (done / cancelled / timed out) leaves the map this long after its end — the
 *  same 30 min the channels engine keeps its own pending record (PENDING_FLOW_TTL_MS). */
const FLOW_RETIRE_MS = 30 * 60 * 1000;
/** verify r3: the most consent flows that may RUN at once; the next begin() ends the oldest (`over-limit`). */
const MAX_RUNNING_FLOWS = 32;
/** verify r4: the causes of the two ends that are this machine's OWN act (each reported once through `onDone`). */
const CAUSE_TIMEOUT = 'timeout';
const CAUSE_OVER_LIMIT = 'over-limit';
const PORT_BUSY_CODE = 'port-busy';
const MODES = Object.freeze(['ephemeral', 'fixed']);

/** The fixed mode's target, parsed ONCE from the registry's literal. */
function fixedTarget(callbackUrl) {
  const u = new URL(String(callbackUrl || LARK_CALLBACK_URL));
  if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:') throw new Error(`oauth-loopback: a fixed callback must be an http://127.0.0.1 loopback URL (got ${u.origin})`);
  const port = Number(u.port);
  if (!(port > 0 && port <= 65535)) throw new Error(`oauth-loopback: the fixed callback URL names no port (${String(callbackUrl)})`);
  return { url: u.toString(), port, pathname: u.pathname };
}

class OAuthFlowError extends Error {
  constructor(code, message, detail = null) { super(message); this.name = 'OAuthFlowError'; this.code = code; this.detail = detail; }
}

/**
 * `fixedCallbackUrl` is the ONE place a deployment (or a suite, with a free
 * port) may substitute the registered fixed callback; it defaults to the
 * registry's literal and an adapter never names one — `begin({callbackUrl})`
 * still wins when given.
 */
function createOAuthLoopback({ now = () => Date.now(), log = console, fixedCallbackUrl = null } = {}) {
  const flows = new Map();   // flowId -> st
  const byId = new Map();    // caller's own id ('lark'/'gmail'/…) -> flowId of the ONE running flow

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Release the port (if held) and the timer — on EVERY exit. */
  function release(st) {
    if (st.server) { try { st.server.close(); } catch {} st.server = null; }
    st.listening = false;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  }
  /** verify r3: the flow's END — what it held is dropped. verify r4: BOTH closures the adapter handed in go
   *  together (they are created in one scope and share one context: a kept `onDone` kept the secret `exchange`
   *  captured). Returns the `onDone` it dropped, for the ONE report an end may still owe. */
  function forget(st) { const cb = st.onDone; st.exchange = null; st.onDone = null; if (st.endedAt == null) st.endedAt = now(); return cb; }
  async function report(cb, r) {
    if (typeof cb === 'function') { try { await cb(r); } catch (e) { log.warn && log.warn('[oauth-loopback] onDone threw:', e && e.message); } }
  }
  /** verify r4: what an end that is this machine's own act says (the flow's status and its one report). */
  const endSentence = (st, why) => (why === CAUSE_TIMEOUT
    ? `the ${st.label} sign-in was not finished in time — sign in again`
    : `the ${st.label} sign-in was ended to keep the number of open sign-ins at ${MAX_RUNNING_FLOWS} (newer ones were started while it waited) — sign in again`);
  /** verify r4: THE MACHINE'S OWN END (the timeout, the cap) — cancelled by name, REPORTED ONCE, forgotten. While
   *  an exchange is in flight its own return reports (it consults `cancelled()` and refuses by name). */
  function endByItself(flowId, why) {
    const st = flows.get(flowId);
    if (!st || st.done || st.cancelled) return false;
    const inFlight = st.exchanging;
    const cb = st.onDone;
    cancel(flowId, why);
    if (inFlight) return true;
    st.error = endSentence(st, why);
    report(cb, { ok: false, result: null, error: st.error, cancelled: why, flowId: st.flowId, id: st.id });
    return true;
  }
  /** verify r3: ENDED flows leave the map after FLOW_RETIRE_MS (a dialog still polls status() meanwhile). */
  function sweep() {
    const t = now();
    for (const [id, st] of flows) if ((st.done || st.cancelled) && st.endedAt != null && t - st.endedAt > FLOW_RETIRE_MS) { st.onDone = null; st.exchange = null; flows.delete(id); }
  }

  /** Exchange ONCE. A second code (a replayed callback, or the loopback AND a
   *  paste-back of the same URL) is ignored: the first exchange is the flow. */
  async function finish(st, code) {
    if (st.done || st.exchanging) return;
    // verify r3: a code landing on a flow that ENDED (cancelled / timed out / over the cap) is never exchanged —
    // the vendor is not called for a consent nobody can keep. verify r4: its closures went at the end (both of
    // them), so the landing is SAID on the flow (status() reads it by name) and in the log, not through `onDone`
    if (st.cancelled) {
      if (!st.error) st.error = `the ${st.label} sign-in was ${st.cancelled === CAUSE_TIMEOUT ? 'past its time limit' : st.cancelled} before its code arrived — sign in again`;
      st.result = null; st.done = true; st.finishedAt = now(); forget(st);
      log.warn && log.warn(`[oauth-loopback] ${st.id}: a code landed on a sign-in that had ended (${st.cancelled}) — not exchanged`);
      return;
    }
    st.exchanging = true;
    try {
      // verify r7 (channels lane R5): the exchange is handed `cancelled()` — a disconnect, a cancel, a newer begin()
      // or the timeout landing WHILE the vendor round trips used to be undone by the token the exchange then stored;
      // the exchange consults it before writing and THROWS to refuse (its own sentence names the cause).
      // verify r8: THE WRITE IS THE FACT. An exchange that RESOLVED has landed its consent and this machine cannot
      // undo a write, so the report says ok:true whatever cancel arrived between that write and this line (r7 said
      // {ok:false, "nothing was connected"} over a token on disk — the record connected, its card contradicting it,
      // no pass kicked). The late cancel is CARRIED (`cancelled`) for a consumer whose DURABLE write is still ahead
      // (the engine's pending path refuses it there); the record door's consumer reads ok as landed.
      st.result = await st.exchange({ code, redirectUri: st.redirectUri, state: st.state, flowId: st.flowId, cancelled: () => st.cancelled || null });
      st.error = null;
      if (st.cancelled) log.warn && log.warn(`[oauth-loopback] ${st.id}: a ${st.cancelled} arrived after the exchange had completed — the consent stands, the report says ok`);
    } catch (e) {
      st.error = String((e && e.message) || e);
      st.result = null;
    } finally {
      st.exchanging = false;
      st.done = true;
      st.finishedAt = now();
      release(st);
      const cb = forget(st);   // verify r3: the exchange has returned — its closure (the client secret) is dropped here; r4: `onDone` with it
      if (byId.get(st.id) === st.flowId) byId.delete(st.id);
      await report(cb, { ok: !st.error, result: st.result, error: st.error, cancelled: st.cancelled || null, flowId: st.flowId, id: st.id });
    }
  }

  function listen(srv, port) {
    return new Promise((resolve, reject) => {
      const onError = (e) => { srv.removeListener('listening', onListening); reject(e); };
      const onListening = () => { srv.removeListener('error', onError); resolve(); };
      srv.once('error', onError);
      srv.once('listening', onListening);
      srv.listen(port, '127.0.0.1');
    });
  }

  /**
   * Begin ONE consent flow.
   *   id              the caller's own name for the flow ('lark', 'gmail'); one running flow per id
   *   mode            'ephemeral' | 'fixed'
   *   callbackUrl     fixed mode only; defaults to the registry's Lark literal
   *   buildConsentUrl ({redirectUri, state}) => the vendor consent URL
   *   exchange        async ({code, redirectUri, state, flowId, cancelled}) => the token record (opaque here);
   *                   RESOLVING MEANS THE CONSENT LANDED (verify r8: the report is ok:true and this machine cannot
   *                   undo a write) — consult `cancelled()` right before writing and THROW to refuse a flow ended
   *                   meanwhile (a disconnect / cancel / newer begin() / the timeout / stopAll)
   *   successText     what the browser tab says after the redirect landed
   *   timeoutMs       the flow's own budget (default FLOW_TIMEOUT_MS)
   *   onDone          async ({ok, result, error, cancelled, flowId, id}) — the adapter's finish hook; `cancelled`
   *                   beside ok:true = a cancel that arrived AFTER the exchange resolved (carried for a consumer
   *                   whose durable write is still ahead; the record's own door reads ok as landed)
   */
  async function begin({ id, mode, callbackUrl = null, buildConsentUrl, exchange, successText = 'VibeSpace: connected — you can close this tab.', timeoutMs = FLOW_TIMEOUT_MS, onDone = null, label = null } = {}) {
    if (!id || typeof id !== 'string') throw new OAuthFlowError('bad-request', 'oauth-loopback: `id` is required');
    if (!MODES.includes(mode)) throw new OAuthFlowError('bad-request', `oauth-loopback: mode must be one of ${MODES.join('|')} (got ${JSON.stringify(mode)})`);
    if (typeof buildConsentUrl !== 'function' || typeof exchange !== 'function') throw new OAuthFlowError('bad-request', 'oauth-loopback: buildConsentUrl and exchange are required');
    sweep();
    // One flow per id at a time — the same rule gmail-sync's startAuth() has.
    if (byId.has(id)) cancel(byId.get(id), 'superseded');
    // verify r3: at most MAX_RUNNING_FLOWS run at once — the oldest is ended BY NAME so the set of live
    // listeners and held clients stays bounded whatever a caller does (a human never has 32 consents open).
    // verify r4: its cause is `over-limit`, never `superseded` (no newer sign-in of ITS id exists), and it is reported
    const running = [...flows.values()].filter((s) => !s.done && !s.cancelled).sort((a, b) => a.startedAt - b.startedAt);
    while (running.length >= MAX_RUNNING_FLOWS) {
      const old = running.shift();
      endByItself(old.flowId, CAUSE_OVER_LIMIT);
      log.warn && log.warn(`[oauth-loopback] ${old.id}: ended (${CAUSE_OVER_LIMIT}) — ${MAX_RUNNING_FLOWS} consent flows were already running; the oldest is ended so the set stays bounded`);
    }

    const state = crypto.randomBytes(12).toString('hex');
    const flowId = crypto.randomBytes(8).toString('hex');
    const st = {
      flowId, id, mode, label: label || id, state, exchange, onDone,
      consentUrl: null, redirectUri: null, port: null, pathname: null,
      server: null, listening: false, refusal: null,
      result: null, error: null, done: false, exchanging: false, cancelled: null,
      startedAt: now(), finishedAt: null, expiresAt: now() + timeoutMs, timer: null,
    };
    flows.set(flowId, st);
    byId.set(id, flowId);

    const srv = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        // Fixed mode: the registered path is part of the byte-for-byte URL; a
        // request on any other path is not this flow's callback.
        if (st.pathname && u.pathname !== st.pathname) { res.writeHead(404).end('not the registered callback path'); return; }
        if (u.searchParams.get('state') !== state) { res.writeHead(400).end('state mismatch'); return; }
        const code = u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<h3>${escapeHtml(successText)}</h3>`);
        if (code) await finish(st, code);
      } catch (e) { st.error = e.message; }
    });

    // verify r4: begin()'s OWN exits. `unlist` = this flow leaves both maps (never a NEWER flow's `byId` entry);
    // `bound` = the listener is the flow's only while the flow still runs — one ended while begin() awaited the
    // bind (a same-tick second begin of its id, the cap, stopAll) closes the listener it was given at once
    // (cancel() had no server to release yet: the listener outlived the flow, and in fixed mode held the port)
    const unlist = () => { flows.delete(flowId); if (byId.get(id) === flowId) byId.delete(id); };
    const bound = () => { if (st.cancelled || st.done) { try { srv.close(); } catch {} return; } st.server = srv; st.listening = true; };
    if (mode === 'ephemeral') {
      try {
        await listen(srv, 0);
        st.port = srv.address().port;
        st.redirectUri = `http://127.0.0.1:${st.port}`;
        bound();
      } catch (e) {
        unlist();
        throw new OAuthFlowError('listen-failed', `could not bind an ephemeral loopback port: ${(e && e.code) || (e && e.message) || e}`);
      }
    } else {
      const target = fixedTarget(callbackUrl || fixedCallbackUrl || null);
      st.port = target.port; st.pathname = target.pathname;
      st.redirectUri = target.url;          // registered byte for byte — the same whether or not we hold the port
      try {
        await listen(srv, target.port);
        bound();
      } catch (e) {
        try { srv.close(); } catch {}
        if (e && e.code === 'EADDRINUSE') {
          // THE NAMED REFUSAL + the paste-back fallback (§12.4). Not a failure
          // of the flow: the consent URL is still built with the registered
          // redirect_uri, and the code comes back through forwardCallback.
          st.refusal = { code: PORT_BUSY_CODE, port: target.port, message: `another VibeSpace or tool is running a ${st.label} consent flow on port ${target.port}; finish or cancel it, or use paste-back (paste the redirect URL your browser lands on)` };
          log.warn && log.warn(`[oauth-loopback] ${id}: ${st.refusal.message}`);
        } else {
          unlist();
          throw new OAuthFlowError('listen-failed', `could not bind the fixed loopback port ${target.port}: ${(e && e.code) || (e && e.message) || e}`);
        }
      }
    }

    // verify r4: a consent URL that cannot be built leaves NOTHING — the flow had a listener and no timer
    // (nothing would ever have ended it), so the port and both closures go here and the caller gets the throw
    try { st.consentUrl = String(buildConsentUrl({ redirectUri: st.redirectUri, state })); }
    catch (e) { st.cancelled = st.cancelled || 'failed'; release(st); forget(st); unlist(); throw e; }
    if (!st.cancelled && !st.done) {
      st.timer = setTimeout(() => endByItself(flowId, CAUSE_TIMEOUT), timeoutMs);   // verify r4: the timeout is SAID (reported once), then forgotten
      if (st.timer.unref) st.timer.unref();
    }
    return status(flowId);
  }

  /** Remote / port-busy paste-back: the user pastes the redirect URL their
   *  browser landed on; the code inside is all we need. The `state` check is
   *  gmail-sync's, verbatim. */
  async function forwardCallback(flowId, url) {
    const st = flows.get(flowId);
    if (!st || st.done || st.cancelled) throw new OAuthFlowError('no-flow', 'no authorization in progress');
    const u = new URL(String(url));
    if (u.searchParams.get('state') !== st.state) throw new Error('state mismatch — restart the flow');
    const code = u.searchParams.get('code');
    if (!code) throw new Error('no code in that URL');
    await finish(st, code);
    return { ok: !st.error, result: st.result, error: st.error };
  }

  function status(flowId) {
    sweep();
    const st = flows.get(flowId);
    if (!st) return null;
    return {
      flowId: st.flowId, id: st.id, mode: st.mode, label: st.label,
      running: !st.done && !st.cancelled, done: st.done, ok: st.done ? !st.error : null,
      error: st.error, cancelled: st.cancelled,
      consentUrl: st.consentUrl, redirectUri: st.redirectUri, port: st.port,
      listening: st.listening, refusal: st.refusal,
      pasteBack: true,                       // ALWAYS offered — remote browsers take it whatever the port did
      startedAt: st.startedAt, expiresAt: st.expiresAt, finishedAt: st.finishedAt,
    };
  }
  /** The finished flow's result — read ONCE by the adapter that began it. */
  function take(flowId) {
    const st = flows.get(flowId);
    if (!st) return null;
    const out = { ok: st.done && !st.error, result: st.result, error: st.error, cancelled: st.cancelled };
    if (st.done || st.cancelled) { st.onDone = null; st.exchange = null; flows.delete(flowId); }
    return out;
  }

  function cancel(flowId, why = 'cancelled') {
    const st = flows.get(flowId);
    if (!st) return false;
    if (st.done || st.cancelled) return false;
    st.cancelled = why;
    release(st);
    // verify r3: the closure goes with the flow — unless an exchange is in flight, which consults `cancelled()`
    // itself and drops the closure when it returns (⑥). verify r4: `onDone` goes WITH it (one scope, one context:
    // kept, it kept the secret); the machine's own ends report first (`endByItself`)
    if (!st.exchanging) forget(st);
    if (byId.get(st.id) === st.flowId) byId.delete(st.id);
    return true;
  }

  function stopAll() { for (const id of [...flows.keys()]) cancel(id, 'shutdown'); }
  const runningFor = (id) => (byId.has(id) ? status(byId.get(id)) : null);

  return { begin, status, forwardCallback, take, cancel, stopAll, runningFor, FLOW_TIMEOUT_MS, FLOW_RETIRE_MS, MAX_RUNNING_FLOWS };
}

module.exports = { createOAuthLoopback, OAuthFlowError, fixedTarget, FLOW_TIMEOUT_MS, FLOW_RETIRE_MS, MAX_RUNNING_FLOWS, CAUSE_TIMEOUT, CAUSE_OVER_LIMIT, PORT_BUSY_CODE, MODES };
