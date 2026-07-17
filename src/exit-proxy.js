/**
 * ExitProxyManager (task #164) — ON-DEMAND egress through a paired machine.
 *
 * An agent (running in a session on THIS instance) can borrow a remote
 * machine's network for a SINGLE command when it needs that machine's network
 * position (a region, an internal network, a fixed IP) — NOT a session-wide
 * proxy. Two tiers:
 *   • BORROW (SOCKS): the machine's daemon serves a SOCKS5 proxy on its
 *     loopback; we reach it via device.tcpForward (the port-forward shape) and
 *     bind a local 127.0.0.1:<port>. The agent points ONE command at
 *     socks5h://127.0.0.1:<port> — the tool stays local, only its egress is the
 *     remote machine. Covers proxy-aware TCP (curl/git/ssh/most http libs).
 *   • RUN (native): execute the command ON the machine via device.runCmd — the
 *     universal fallback (ICMP/ping, UDP, proxy-unaware tools, that machine's
 *     own DNS). Handled by the route, not here.
 *
 * Gated per-machine by hosts.allowExit (default off — SSRF/abuse). The device
 * SOCKS binds the machine's loopback, so the tunnel stays loopback↔loopback
 * (tcp-connect keeps its never-a-general-proxy rule; the SOCKS server is the
 * one sanctioned egress point, inside the machine owner's own network).
 */
'use strict';

const net = require('net');

class ExitProxyManager {
  /** @param deps { hosts, broadcast, log } */
  constructor({ hosts, broadcast, log } = {}) {
    this.hosts = hosts;
    this.broadcast = broadcast || (() => {});
    this.log = log || (() => {});
    this._live = new Map(); // hostId → { server, sockets:Set, localPort, deviceSocksPort }
  }

  /** Machines the agent may use as exits (allowExit on), with online + live. */
  list() {
    let all = [];
    try { all = this.hosts.list?.() || []; } catch { return []; }
    return all
      .filter((h) => h && h.allowExit)
      .map((h) => ({
        id: h.id, name: h.name || h.id,
        transport: h.transport || 'ssh',
        online: h.transport === 'dial' ? !!h.online : true, // ssh probed at use time
        active: this._live.has(h.id),
        localPort: this._live.get(h.id)?.localPort || null,
      }));
  }

  /** Resolve a machine ref (id / exact name / unique name substring) to a host
   *  record, requiring allowExit. Throws a guidance error otherwise. */
  resolve(ref) {
    const all = (this.hosts.list?.() || []).filter((h) => h && h.allowExit);
    if (!ref) {
      if (all.length === 1) return all[0];
      if (!all.length) throw new Error('no machine is enabled as an exit — turn on "Allow as exit" for a machine in the Remote tab first');
      throw new Error(`more than one exit machine — name one: ${all.map((h) => h.name || h.id).join(', ')}`);
    }
    const r = String(ref).toLowerCase();
    let m = all.find((h) => h.id === ref) || all.find((h) => (h.name || '').toLowerCase() === r);
    if (!m) {
      const subs = all.filter((h) => (h.name || '').toLowerCase().includes(r) || h.id.toLowerCase().includes(r));
      if (subs.length === 1) m = subs[0];
      else if (subs.length > 1) throw new Error(`"${ref}" matches ${subs.length} exits — be more specific: ${subs.map((h) => h.name || h.id).join(', ')}`);
    }
    if (!m) {
      // named a machine that exists but isn't an exit? point that out precisely
      const any = (this.hosts.list?.() || []).find((h) => h.id === ref || (h.name || '').toLowerCase() === r);
      if (any) throw new Error(`machine "${any.name || ref}" is not enabled as an exit — turn on "Allow as exit" for it first`);
      throw new Error(`no exit machine matches "${ref}"`);
    }
    return m;
  }

  /** Ensure a SOCKS egress forward to <machine ref> and return its local proxy
   *  URL. Idempotent — reuses the live forward. */
  async use(ref) {
    const h = this.resolve(ref);
    const existing = this._live.get(h.id);
    if (existing && existing.server.listening) {
      return { machine: h.name || h.id, hostId: h.id, localPort: existing.localPort, url: `socks5h://127.0.0.1:${existing.localPort}` };
    }
    const dm = await this.hosts.device(h.id); // throws if offline
    const { port: socksPort } = await dm.serveSocks();
    const sockets = new Set();
    const server = net.createServer({ allowHalfOpen: true }, async (sock) => {
      sockets.add(sock);
      sock.on('close', () => sockets.delete(sock));
      sock.on('error', () => { try { sock.destroy(); } catch {} });
      let ch;
      try {
        // resolve the device PER CONNECTION (a dial re-dial stop()s the old
        // DeviceManager — port-forward's hard-won lesson)
        const d = await this.hosts.device(h.id);
        ch = await d.tcpForward(socksPort);
      } catch { try { sock.destroy(); } catch {} return; }
      if (sock.destroyed) { try { ch.close(); } catch {} return; }
      ch.onData = (b) => { try { sock.write(b); } catch {} };
      ch.onClose = () => { try { sock.end(); } catch {} };
      sock.on('data', (b) => { try { ch.write(b); } catch {} });
      sock.on('close', () => { try { ch.close(); } catch {} });
    });
    const localPort = await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    this._live.set(h.id, { server, sockets, localPort, deviceSocksPort: socksPort });
    this.log(`exit ${h.name || h.id}: socks5h://127.0.0.1:${localPort} → device SOCKS ${socksPort}`);
    this.broadcast?.({ type: 'exits-updated', exits: this.list() });
    return { machine: h.name || h.id, hostId: h.id, localPort, url: `socks5h://127.0.0.1:${localPort}` };
  }

  /** Tear down a machine's exit forward (best-effort remote SOCKS stop). */
  async stop(hostId) {
    const l = this._live.get(hostId);
    if (!l) return;
    for (const s of l.sockets) { try { s.destroy(); } catch {} }
    try { l.server.close(); } catch {}
    this._live.delete(hostId);
    try { const dm = await this.hosts.device(hostId); await dm.unserveSocks(l.deviceSocksPort); } catch {}
    this.broadcast?.({ type: 'exits-updated', exits: this.list() });
  }

  /** A machine was unpaired / disabled as an exit — drop its forward. */
  onMachineUnpaired(hostId) { if (hostId) this.stop(hostId).catch(() => {}); }
}

module.exports = { ExitProxyManager };
