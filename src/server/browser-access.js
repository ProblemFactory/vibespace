'use strict';
/**
 * ONE way to reach a profile browser on ANY machine (agent browser P4,
 * docs/design-agent-browser-v2 §3.6 / §7.3 / D5 (b)). ORCH tier: it owns only
 * the DISPATCH — which transport reaches the machine named by `hostId` — while
 * the op names/shapes live in the SHARED table src/browser-serve.js and the
 * work runs where the browser lives. The same shape as
 * src/server/opencode-access.js, on purpose.
 *
 *   hostId falsy    → this machine's own facts (the shared module in-process;
 *                     the local rung is the transport with zero hops)
 *   paired device   → the `browser-serve` agentd op (the daemon bundles the
 *                     same module and runs the same runBrowserServeOp)
 *   a handle that cannot run the op → REFUSED by name (`host_needs_daemon`):
 *                     there is no shipped single-file rung for a browser yet,
 *                     and a silent local fallback would start the browser on
 *                     the wrong machine. ON THE REAL HostManager an ssh host
 *                     is given the bundled daemon over ssh (device() →
 *                     ensureAgentdOnHost) and SERVED; a failed bootstrap is
 *                     host_unavailable naming the reason; host_needs_daemon on
 *                     a real DeviceManager = its capability gate (an agent
 *                     predating browser-serve) — test-desktop-serve §5
 *
 * THE CDP FORWARD (§7.3 "transport is nearly free", §6.1): a browser's
 * loopback CDP port on a paired machine becomes a hub-side loopback url —
 * `net.createServer` on 127.0.0.1:0 piping each connection into
 * `device.tcpForward(remotePort)` over the existing agentd data plane, the
 * PortForwardManager shape verbatim. The device is resolved PER CONNECTION
 * (a re-dial stop()s the old DeviceManager; a captured handle would go stale).
 * NAT-proof, nothing public, nothing on a LAN. ONE listener per (hostId,
 * remotePort), REFERENCE-COUNTED: two records may name the same port (a
 * profile browser's own port and a `cdp` profile pointed at it), so a
 * record's release drops ONE reference and the listener closes at zero —
 * never under the other record's feet. `shutdown()` and a forced close are
 * the only unconditional teardowns.
 */
const net = require('net');
const B = require('../browser-profiles.js');
const S = require('../browser-serve.js');

let installed = null;
/** The wired layer; an unwired process gets a LOUD refusal, never a no-op. */
function access() {
  return installed || {
    call: async () => { const e = new Error('the browser access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    forwardCdp: async () => { const e = new Error('the browser access layer is not wired on this instance'); e.code = 'host_unavailable'; throw e; },
    hostKnown: () => false, closeForward: () => false, forwards: () => [],
  };
}

const named = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

/**
 * @param hosts   HostManager (deviceBounded / get / isLocal) or null (local only)
 * @param env     () => the sanitised base env for the LOCAL rung (agentEnv)
 * @param local   an install()ed browser-serve handle (injectable for the gate)
 */
function create({ hosts = null, env = () => ({}), homeDir = undefined, local = null, log = console, install = true, connectMs = 8000 } = {}) {
  let localFacts = local;
  const localOf = () => { if (!localFacts) localFacts = S.install({ env: env(), homeDir, log }); return localFacts; };
  const forwards = new Map(); // `${hostId}:${remotePort}` → { server, sockets, localPort, hostId, remotePort, refs }
  const opening = new Map(); // key → the in-flight listen (so a concurrent second caller joins it)

  function isLocal(hostId) { return !hostId || hostId === 'local' || (hosts && typeof hosts.isLocal === 'function' && hosts.isLocal(hostId)); }
  /** Is this a machine we know (paired device / ssh host)? Local always. */
  function hostKnown(hostId) {
    if (isLocal(hostId)) return true;
    if (!hosts || typeof hosts.get !== 'function') return false;
    try { return !!hosts.get(hostId); } catch { return false; }
  }
  async function deviceOf(hostId) {
    if (!hosts || typeof hosts.deviceBounded !== 'function') throw named('host_unavailable', 'remote machines are not configured on this instance');
    if (!hostKnown(hostId)) throw named('unsupported-host', `${JSON.stringify(hostId)} is not a paired machine on this instance`);
    let dm;
    try { dm = await hosts.deviceBounded(hostId, connectMs); }
    catch (e) { throw named('host_unavailable', `${hostId}: ${e && e.message}`); }
    if (typeof dm.browserServe !== 'function') throw named('host_needs_daemon', `${hostId}: this machine's agent cannot serve a browser (no daemon, or one that predates browser-serve) — upgrade the agent on it`);
    return dm;
  }

  /** Run ONE browser-serve op on the machine named by hostId. Throws a
   *  coded error on every failure (no silent failures law); the op's own
   *  `{ok:false, code, error}` is thrown too, so callers see ONE shape. */
  async function call(hostId, action, params = {}) {
    if (!S.BROWSER_SERVE_OPS.includes(action)) throw named('bad-request', `unknown browser-serve op '${action}'`);
    let r;
    if (isLocal(hostId)) r = await S.runBrowserServeOp(localOf(), action, params);
    else {
      const dm = await deviceOf(hostId);
      try { r = await dm.browserServe(action, params); }
      catch (e) { throw named(e && e.code === 'host_needs_daemon' ? 'host_needs_daemon' : 'host_unavailable', `${hostId}: ${e && e.message}`); }
    }
    if (!r || r.ok === false) throw named((r && r.code) || 'op_failed', (r && r.error) || `browser-serve ${action} failed on ${hostId || 'this machine'}`);
    return r;
  }

  /**
   * A hub-side loopback listener for a paired machine's loopback port.
   * Idempotent per (hostId, remotePort); returns `{localPort, url, close}`
   * where `url` is `remoteUrl` re-pointed at the forward (scheme + path kept).
   * For the LOCAL machine no forward is made: the port is already ours.
   */
  async function forwardCdp(hostId, remotePort, { remoteUrl = null } = {}) {
    const rp = Number(remotePort);
    if (!Number.isInteger(rp) || rp < 1 || rp > 65535) throw named('bad-request', `bad CDP port ${JSON.stringify(remotePort)}`);
    if (isLocal(hostId)) return { localPort: rp, url: B.forwardedCdpUrl(remoteUrl || rp, rp), close: () => false, local: true };
    const key = `${hostId}:${rp}`;
    const have = forwards.get(key);
    if (have) { have.refs++; return { localPort: have.localPort, url: B.forwardedCdpUrl(remoteUrl || rp, have.localPort), close: () => closeForward(key) }; }
    // two records starting at once on the same key share ONE listen (the
    // second joins the first's promise instead of minting a second server)
    if (opening.has(key)) { await opening.get(key); return forwardCdp(hostId, rp, { remoteUrl }); }
    const p = (async () => {
      await deviceOf(hostId); // fail loud NOW so the caller can say "device offline"
      const sockets = new Set();
      const server = net.createServer({ allowHalfOpen: true }, async (sock) => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
        sock.on('error', () => { try { sock.destroy(); } catch { /* gone */ } });
        let h;
        try { const dm = await deviceOf(hostId); h = await dm.tcpForward(rp); }
        catch (e) { log.warn?.(`[browser] cdp forward ${key}: upstream failed — ${e && e.message}`); try { sock.destroy(); } catch { /* gone */ } return; }
        if (sock.destroyed) { try { h.close(); } catch { /* gone */ } return; }
        h.onData = (b) => { try { sock.write(b); } catch { /* gone */ } };
        h.onClose = () => { try { sock.end(); } catch { /* gone */ } };
        sock.on('data', (b) => { try { h.write(b); } catch { /* gone */ } });
        sock.on('close', () => { try { h.close(); } catch { /* gone */ } });
      });
      const localPort = await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
      });
      forwards.set(key, { server, sockets, localPort, hostId, remotePort: rp, refs: 1 });
      log.log?.(`[browser] cdp forward: 127.0.0.1:${localPort} → ${hostId}:${rp}`);
      return { localPort, url: B.forwardedCdpUrl(remoteUrl || rp, localPort), close: () => closeForward(key) };
    })();
    opening.set(key, p.catch(() => { }));
    try { return await p; } finally { opening.delete(key); }
  }
  /** Release ONE reference on the (hostId:remotePort) forward; the listener
   *  and its connections go down when the last holder releases (or on
   *  `force`). Returns true when THIS call tore the listener down. */
  function closeForward(key, { force = false } = {}) {
    const f = forwards.get(key);
    if (!f) return false;
    f.refs = Math.max(0, f.refs - 1);
    if (f.refs > 0 && !force) return false;
    for (const s of f.sockets) { try { s.destroy(); } catch { /* gone */ } }
    try { f.server.close(); } catch { /* gone */ }
    forwards.delete(key);
    return true;
  }
  function listForwards() { return [...forwards.values()].map((f) => ({ hostId: f.hostId, remotePort: f.remotePort, localPort: f.localPort, connections: f.sockets.size, refs: f.refs })); }
  function shutdown() { for (const k of [...forwards.keys()]) closeForward(k, { force: true }); }

  const layer = { call, forwardCdp, closeForward, forwards: listForwards, hostKnown, isLocal, shutdown, _local: localOf };
  if (install) installed = layer;
  return layer;
}

module.exports = { create, access };
