// DialSessionBridge (graduation B.2) — lets sessions run on DIAL-OUT devices.
// The dialed-in ws link is a single mux OWNED by the server's DeviceManager,
// so the disposable vibespace-agentd-attach process (chat-wrapper's child)
// cannot reach the device directly. This bridge listens on 127.0.0.1 and
// PROXIES the attach protocol: to the attach client it looks exactly like the
// daemon (hello-ack / pipe-session-open / byte channel + credit); each
// open/attach-pipe-session op is forwarded through deviceForDial's
// openPipeSession. One bridge per session; the PORT rides the 0600 attach
// config file, so nothing secret or bulky is in argv (2.126.0 law).
//
// Server restart: the wrapper (inside dtach) survives and respawns attach
// against the recorded port — restore() re-listens on the SAME port from
// session meta so reattach lands (same shape as host-mounts' tunnel re-own).
'use strict';

const net = require('net');
const path = require('path');
const { Mux, PROTO_VERSION } = require('./agentd/mux.js');

class DialSessionBridge {
  /** @param deps { deviceForDial:(deviceId)=>Promise<DeviceManager>, hostTokenFor:(deviceId)=>string, log } */
  constructor({ deviceForDial, hostTokenFor, log }) {
    this.deviceForDial = deviceForDial;
    this.hostTokenFor = hostTokenFor;
    this.log = log || (() => {});
    this._bridges = new Map(); // sid → { server, port, deviceId }
  }

  /** Create (or return) the loopback bridge for one session. `port` pins an
   *  exact port (restore path); 0 lets the OS pick. */
  async ensure({ sid, deviceId, port = 0 }) {
    const existing = this._bridges.get(sid);
    if (existing) return existing.port;
    const server = net.createServer((sock) => this._serve(sock, sid, deviceId));
    server.on('error', (e) => this.log(`bridge ${sid}: ${e.message}`));
    const bound = await new Promise((resolve, reject) => {
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
      server.on('error', reject);
    });
    this._bridges.set(sid, { server, port: bound, deviceId });
    this.log(`dial session bridge up: sid=${sid} device=${deviceId} port=${bound}`);
    return bound;
  }

  close(sid) {
    const b = this._bridges.get(sid);
    if (!b) return;
    // A PTY (terminal) device session is LIVE, not persistent — kill it on
    // teardown so claude doesn't orphan on the device (review: the kill path
    // otherwise never reached the device handle). PIPE (chat) sessions are the
    // keeper model — leave them running for reattach.
    if (b.ptyHandle) { try { b.ptyHandle.kill(); } catch { } b.ptyHandle = null; }
    try { b.server.close(); } catch { }
    this._bridges.delete(sid);
  }

  _serve(sock, sid, deviceId) {
    sock.on('error', () => { });
    let authed = false;
    let handle = null; // device pipe-session handle
    let isPty = false;
    let pendingResize = null; // a resize that raced the open-session await
    const bridge = this._bridges.get(sid);
    const mux = new Mux(sock, {
      onControl: async (msg) => {
        if (msg.op === 'hello') {
          if (msg.protoVersion !== PROTO_VERSION) { mux.control({ op: 'proto-mismatch', protoVersion: PROTO_VERSION }); sock.end(); return; }
          const want = this.hostTokenFor(deviceId);
          if (!want || msg.hostToken !== want) { mux.control({ op: 'auth-fail' }); sock.end(); return; }
          authed = true;
          mux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: 'bridge', platform: process.platform, arch: process.arch, nodeVersion: process.version, capabilities: [] });
          return;
        }
        if (!authed) { sock.end(); return; }
        // PTY / terminal-on-dial (B-0d70): proxy a device node-pty session
        // (open-session / resize / kill + live bytes). No offset/replay — a
        // pty is live; pty-wrapper respawns the attach on transport death.
        if (msg.op === 'open-session') {
          const chan = msg.chan;
          isPty = true;
          try {
            const dm = await this.deviceForDial(deviceId);
            handle = await dm.openSession({ cmd: msg.cmd, args: msg.args, cols: msg.cols, rows: msg.rows, cwd: msg.cwd, env: msg.env });
            if (bridge) bridge.ptyHandle = handle; // so close(sid) can kill it
            const ready = await handle.ready;
            handle.onData = (buf) => { try { mux.data(chan, buf); } catch { } };
            handle.onExit = (code) => { try { mux.control({ op: 'session-exit', chan, code }); } catch { } };
            mux.control({ op: 'session-open', chan, pid: ready.pid });
            // apply a resize that arrived while we were still opening (the mux
            // fires onControl un-serialized, so a startup SIGWINCH can beat the
            // open — review finding)
            if (pendingResize) { try { handle.resize(pendingResize.cols, pendingResize.rows); } catch { } pendingResize = null; }
          } catch (e) {
            mux.control({ op: 'session-error', chan, error: e.message });
          }
          return;
        }
        if (msg.op === 'resize-session') { if (handle) { try { handle.resize(msg.cols, msg.rows); } catch { } } else { pendingResize = { cols: msg.cols, rows: msg.rows }; } return; }
        if (msg.op === 'kill-session' && handle) { try { handle.kill(); } catch { } return; }
        if (msg.op === 'open-pipe-session' || msg.op === 'attach-pipe-session') {
          const chan = msg.chan;
          try {
            const dm = await this.deviceForDial(deviceId);
            handle = await dm.openPipeSession({
              sid: msg.sid || sid,
              cmd: msg.op === 'open-pipe-session' ? msg.cmd : undefined,
              args: msg.args, cwd: msg.cwd, env: msg.env,
              offset: msg.offset || 0,
            });
            const ready = await handle.ready;
            handle.onData = (buf) => { try { mux.data(chan, buf); } catch { } };
            handle.onExit = () => { /* the _remote_exit sentinel rides the byte stream */ };
            mux.control({ op: 'pipe-session-open', chan, pid: ready.pid, existing: !!ready.existing, exited: ready.exited });
          } catch (e) {
            mux.control({ op: 'session-error', chan, error: e.message });
          }
          return;
        }
        // kill-pipe-session etc. — forward best-effort
        if (msg.op === 'kill-pipe-session' && handle) { try { handle.kill(); } catch { } }
      },
      onData: (chan, buf) => {
        if (handle) { try { handle.write(buf.toString('utf-8')); } catch { } }
        try { mux.credit(chan, buf.length); } catch { }
      },
      onDead: () => {
        // A PIPE (chat) session is the keeper model — the daemon-owned child
        // lives on and reattaches by offset, so leave it. A PTY (terminal)
        // session is LIVE and only reachable through this attach; on attach
        // death kill the device pty so claude doesn't orphan on the device
        // (review HIGH: pty-wrapper's REMOTE_RETRY respawns attach → a fresh
        // pty each flap, leaking the old claude forever otherwise).
        if (isPty && handle) { try { handle.kill(); } catch { } }
        if (isPty && bridge && bridge.ptyHandle === handle) bridge.ptyHandle = null;
      },
    });
  }
}

module.exports = { DialSessionBridge };
