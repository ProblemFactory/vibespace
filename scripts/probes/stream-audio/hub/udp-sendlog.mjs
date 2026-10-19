// udp-sendlog.mjs — VibeSpace lane stream-audio-probe (probe only): a --import preload that logs every DTLS datagram this
// process sends or receives (record types 20–63): size, the far end, the local socket. It found werift 0.25's ICE-lite
// answering a ClientHello from one pair on ANOTHER pair (the first one the browser nominated).
//   node --import ./udp-sendlog.mjs audio-leg.mjs …   (lines on stderr: DTLS-SEND / DTLS-RECV)
import dgram from 'node:dgram';
const orig = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function (msg, ...rest) {
  try {
    const b = Buffer.isBuffer(msg) ? msg : Array.isArray(msg) ? Buffer.concat(msg) : Buffer.from(msg);
    if (b[0] >= 20 && b[0] <= 63) { const port = rest.find((x) => typeof x === 'number' && x > 100); const addr = rest.find((x) => typeof x === 'string'); let local = null; try { local = this.address(); } catch { } console.error(`DTLS-SEND type=${b[0]} len=${b.length} to=${addr}:${port} from=${local && local.address}:${local && local.port}`); }
  } catch { }
  return orig.call(this, msg, ...rest);
};
const origOn = dgram.Socket.prototype.emit;
dgram.Socket.prototype.emit = function (ev, msg, rinfo) { if (ev === 'message' && msg && msg[0] >= 20 && msg[0] <= 63) { let local = null; try { local = this.address(); } catch { } console.error(`DTLS-RECV type=${msg[0]} len=${msg.length} from=${rinfo.address}:${rinfo.port} at=${local && local.address}:${local && local.port}`); } return origOn.apply(this, arguments); };
