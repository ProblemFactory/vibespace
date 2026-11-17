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
//
// THE TWO ROADS FOLLOW CREDIT (主开发 2026-11-17 — a master defect the separation's skeptic confirmed on the release):
// the hub used to credit the device as it DELIVERED a session's output while this bridge threw away the attach link's
// answer, so a stalled attach client made the HUB hold the session's whole output (and a reattach replay); the input road
// credited the attach client at once whatever the device link took. Now the device session runs under MANUAL credit:
// output goes on to the attach side and the device is credited only for what that side took (a false answer = the credit
// waits for the attach channel's writable); input is credited to the attach side only for what the device link took
// (a false answer = it waits for the device channel's writable). The hub holds at most about one window each way; what a
// stalled reader leaves unsent now sits on the DEVICE AGENT's side of its link (its senders queue — they do not pause).
// THE GAP: bytes the device sends right behind its open answer (a reattach replay rides the same read) are KEPT until the
// open has gone to the attach side, then pass through the same accounting — never dropped, never left uncredited.
// THE ORPHAN: when the attach side dies, a pipe session's device channel stays open (the keeper model) — it goes back to
// the release's road: what is owed is credited at once and every later byte as it arrives. B-beaf: a daemon that says
// `pipe-detach` takes the real end instead — the handle's detach closes the channel and the device ends that tail.
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
    let attachChan = null, owedDevice = 0, owedAttach = 0;   // credit held back on each road (see THE TWO ROADS above)
    let early = null;   // device bytes that arrived before the wire (THE GAP above)
    let attachGone = false;   // the attach side's link died: a pipe handle is an orphan from then on
    const bridge = this._bridges.get(sid);
    // THE ORPHAN's road (the release's): what is owed is credited now, every later byte as it arrives, nothing forwarded
    const orphan = () => {
      const h = handle; if (!h) return;
      const owed = owedDevice + (early || []).reduce((n, b) => n + b.length, 0);
      owedDevice = 0; early = null;
      h.onData = (b) => { try { h.credit(b.length); } catch { } };
      h.onWritable = null;
      if (owed) { try { h.credit(owed); } catch { } }
    };
    // B-beaf (3): the attach side is gone — a daemon that says pipe-detach ends the channel's tail (the handle's detach answers
    // true), an older daemon's channel takes THE ORPHAN's road
    const letGo = () => { const h = handle; if (!h) return; let done = false; try { done = typeof h.detach === 'function' && h.detach() === true; } catch { done = false; } if (!done) orphan(); };
    // the moment the device handle exists — BEFORE its open answer: keep what arrives early, and hear the input road's writable
    const prewire = (chan) => {
      if (attachGone) { if (isPty) { try { handle.kill(); } catch { } } else letGo(); return; }   // the attach side died while the open was asked: a live pty is ended (onDead found no handle yet), a pipe session is an orphan
      attachChan = chan; early = [];
      handle.onData = (buf) => { early.push(buf); };
      handle.onWritable = () => {   // the device link took the queued input: the attach side may send again
        const n = owedAttach; owedAttach = 0; if (n) { try { mux.credit(chan, n); } catch { } }
      };
    };
    // after the open has gone to the attach side: the output road, then the kept bytes through it in order
    const wire = (chan) => {
      if (attachGone) return;   // the orphan's road is already set (onDead / prewire)
      handle.onData = (buf) => {   // device → attach: the device is credited for what the attach side took
        let ok = false; try { ok = mux.data(chan, buf) !== false; } catch { ok = false; }
        if (ok) { try { handle.credit(buf.length); } catch { } } else owedDevice += buf.length;
      };
      const kept = early || []; early = null;
      for (const b of kept) handle.onData(b);
    };
    const mux = new Mux(sock, {
      onControl: async (msg) => {
        if (msg.op === 'hello') {
          if (msg.protoVersion !== PROTO_VERSION) { mux.control({ op: 'proto-mismatch', protoVersion: PROTO_VERSION }); sock.end(); return; }
          // lane vault-e2e-password-fix-r2: the device token is the vault's — LOCKED ⇒ the attach is told by name and the link
          // closed (a throw here would be an unhandled rejection in the hub); its wrapper retries after the unlock
          let want = null;
          try { want = this.hostTokenFor(deviceId); } catch (e) { mux.control({ op: 'session-error', error: (e && e.message) || 'the vault is locked', code: (e && e.code) || null }); sock.end(); return; }
          // verify-r3: THE ONE DOOR — a constant-time compare over the two digests (a raw `!==` stops at the first differing
          // character; any local process may knock on this loopback port)
          const PT = require('./pairing-token.js');
          if (!want || !PT.tokenMatches(msg.hostToken, PT.tokenHash(want))) { mux.control({ op: 'auth-fail' }); sock.end(); return; }
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
            handle = await dm.openSession({ cmd: msg.cmd, args: msg.args, cols: msg.cols, rows: msg.rows, cwd: msg.cwd, env: msg.env, manualCredit: true });
            prewire(chan);
            if (bridge) bridge.ptyHandle = handle; // so close(sid) can kill it
            const ready = await handle.ready;
            handle.onExit = (code) => { try { mux.control({ op: 'session-exit', chan, code }); } catch { } };
            mux.control({ op: 'session-open', chan, pid: ready.pid });
            wire(chan);   // after the open: the kept bytes follow it, in order
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
              manualCredit: true,
            });
            prewire(chan);   // B-beaf: an attach already gone is let go here; the bridge still awaits `ready` (a refusal is caught)
            const ready = await handle.ready;
            // A real CHILD exit arrives as the _remote_exit sentinel in the
            // byte stream — reaching onExit here means the DEVICE LINK died
            // (DeviceManager's mux.onDead fires s.onExit(-1) on every open
            // handle). Discarding it froze dial chat permanently after any
            // link drop (B-b87b CRITICAL): the attach client kept a healthy
            // loopback socket to a corpse, input written into the void. Tear
            // the loopback DOWN so the attach client dies and chat-wrapper's
            // backoff respawns it against a re-dialed device.
            handle.onExit = () => { try { mux.destroy?.(); } catch { } try { sock.destroy(); } catch { } };
            mux.control({ op: 'pipe-session-open', chan, pid: ready.pid, existing: !!ready.existing, exited: ready.exited });
            wire(chan);   // after the open: the kept bytes (a replay's first part) follow it, in order
          } catch (e) {
            mux.control({ op: 'session-error', chan, error: e.message });
          }
          return;
        }
        // kill-pipe-session etc. — forward best-effort
        if (msg.op === 'kill-pipe-session' && handle) { try { handle.kill(); } catch { } }
      },
      onData: (chan, buf) => {   // attach → device: the attach side is credited for what the device link took
        if (!handle) { try { mux.credit(chan, buf.length); } catch { } return; }
        let ok = true; try { ok = handle.write(buf) !== false; } catch { ok = true; }   // the bytes as bytes (a character split across two frames stays whole); a dead link drops it, as before
        if (ok) { try { mux.credit(chan, buf.length); } catch { } } else owedAttach += buf.length;
      },
      onWritable: (chan) => {   // the attach side took the queued output: the device may send again
        if (chan !== attachChan || !owedDevice || !handle) return;
        const n = owedDevice; owedDevice = 0; try { handle.credit(n); } catch { }
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
        attachGone = true;
        // THE ORPHAN / B-beaf (3): a pipe session's device channel — its device-side TAIL ends now on a daemon that says
        // pipe-detach (the session and its buffer live on; the next attach comes with its offset on a new channel), else
        // back to the release's road (see above)
        if (!isPty && handle) letGo();
        // B-beaf r2 (#8): a mux that died of missed pongs (an attach stuck in a blocking stdout write) still has its socket —
        // end it, so the attach exits now and reattaches with its offset (its later input would go to a let-go channel)
        if (!isPty) { try { sock.destroy(); } catch { } }
      },
    });
  }
}

module.exports = { DialSessionBridge };
