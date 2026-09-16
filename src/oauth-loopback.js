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
 */
const http = require('http');
const crypto = require('crypto');
const { LARK_CALLBACK_URL } = require('./integration-registry.js');

/** gmail-sync's own budget for a consent flow, carried over. */
const FLOW_TIMEOUT_MS = 10 * 60 * 1000;
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

  /** Exchange ONCE. A second code (a replayed callback, or the loopback AND a
   *  paste-back of the same URL) is ignored: the first exchange is the flow. */
  async function finish(st, code) {
    if (st.done || st.exchanging) return;
    st.exchanging = true;
    try {
      st.result = await st.exchange({ code, redirectUri: st.redirectUri, state: st.state });
      st.error = null;
    } catch (e) {
      st.error = String((e && e.message) || e);
      st.result = null;
    } finally {
      st.exchanging = false;
      st.done = true;
      st.finishedAt = now();
      release(st);
      if (byId.get(st.id) === st.flowId) byId.delete(st.id);
      if (typeof st.onDone === 'function') { try { await st.onDone({ ok: !st.error, result: st.result, error: st.error, flowId: st.flowId, id: st.id }); } catch (e) { log.warn && log.warn('[oauth-loopback] onDone threw:', e && e.message); } }
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
   *   exchange        async ({code, redirectUri, state}) => the token record (opaque here)
   *   successText     what the browser tab says after the redirect landed
   *   timeoutMs       the flow's own budget (default FLOW_TIMEOUT_MS)
   *   onDone          async ({ok, result, error, flowId, id}) — the adapter's finish hook
   */
  async function begin({ id, mode, callbackUrl = null, buildConsentUrl, exchange, successText = 'VibeSpace: connected — you can close this tab.', timeoutMs = FLOW_TIMEOUT_MS, onDone = null, label = null } = {}) {
    if (!id || typeof id !== 'string') throw new OAuthFlowError('bad-request', 'oauth-loopback: `id` is required');
    if (!MODES.includes(mode)) throw new OAuthFlowError('bad-request', `oauth-loopback: mode must be one of ${MODES.join('|')} (got ${JSON.stringify(mode)})`);
    if (typeof buildConsentUrl !== 'function' || typeof exchange !== 'function') throw new OAuthFlowError('bad-request', 'oauth-loopback: buildConsentUrl and exchange are required');
    // One flow per id at a time — the same rule gmail-sync's startAuth() has.
    if (byId.has(id)) cancel(byId.get(id), 'superseded');

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

    if (mode === 'ephemeral') {
      try {
        await listen(srv, 0);
        st.server = srv; st.listening = true;
        st.port = srv.address().port;
        st.redirectUri = `http://127.0.0.1:${st.port}`;
      } catch (e) {
        flows.delete(flowId); byId.delete(id);
        throw new OAuthFlowError('listen-failed', `could not bind an ephemeral loopback port: ${(e && e.code) || (e && e.message) || e}`);
      }
    } else {
      const target = fixedTarget(callbackUrl || fixedCallbackUrl || null);
      st.port = target.port; st.pathname = target.pathname;
      st.redirectUri = target.url;          // registered byte for byte — the same whether or not we hold the port
      try {
        await listen(srv, target.port);
        st.server = srv; st.listening = true;
      } catch (e) {
        try { srv.close(); } catch {}
        if (e && e.code === 'EADDRINUSE') {
          // THE NAMED REFUSAL + the paste-back fallback (§12.4). Not a failure
          // of the flow: the consent URL is still built with the registered
          // redirect_uri, and the code comes back through forwardCallback.
          st.refusal = { code: PORT_BUSY_CODE, port: target.port, message: `another VibeSpace or tool is running a ${st.label} consent flow on port ${target.port}; finish or cancel it, or use paste-back (paste the redirect URL your browser lands on)` };
          log.warn && log.warn(`[oauth-loopback] ${id}: ${st.refusal.message}`);
        } else {
          flows.delete(flowId); byId.delete(id);
          throw new OAuthFlowError('listen-failed', `could not bind the fixed loopback port ${target.port}: ${(e && e.code) || (e && e.message) || e}`);
        }
      }
    }

    st.consentUrl = String(buildConsentUrl({ redirectUri: st.redirectUri, state }));
    st.timer = setTimeout(() => cancel(flowId, 'timeout'), timeoutMs);
    if (st.timer.unref) st.timer.unref();
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
    if (st.done || st.cancelled) flows.delete(flowId);
    return out;
  }

  function cancel(flowId, why = 'cancelled') {
    const st = flows.get(flowId);
    if (!st) return false;
    if (st.done || st.cancelled) return false;
    st.cancelled = why;
    release(st);
    if (byId.get(st.id) === st.flowId) byId.delete(st.id);
    return true;
  }

  function stopAll() { for (const id of [...flows.keys()]) cancel(id, 'shutdown'); }
  const runningFor = (id) => (byId.has(id) ? status(byId.get(id)) : null);

  return { begin, status, forwardCallback, take, cancel, stopAll, runningFor, FLOW_TIMEOUT_MS };
}

module.exports = { createOAuthLoopback, OAuthFlowError, fixedTarget, FLOW_TIMEOUT_MS, PORT_BUSY_CODE, MODES };
