'use strict';
// THE INTERFACE (the separation, M1 — lane B, piece B2: the skeleton and the relay; design: «The processes (revision)» —
// interface, «The link», THE PROGRAMME M1). The one process that must always answer: the ONE listener of the hub's port
// (plain and TLS by the first byte, ./front.js), and the relay of every EXCHANGE — one head and its answer, or one
// upgrade — to the party that owns it over that party's link (./relay.js; the framing unit, 主开发 r922), routed by the
// owner map (./owners.js — a stub until the owner-map lane's module is taken). It owns no work: no engine, no store, no
// key, no child start, no parse of a body's content (it parses request and answer HEADS with Node's own parser — the
// design's sentence as r922 amends it), and no synchronous disk call once it listens (scripts/test-interface-relay.mjs
// and scripts/test-interface-framing.mjs hold each as a law). Its link to a party is the tree's own frame code
// (src/agentd/mux.js); a same-machine link runs with the heartbeat OFF (a silent party is late, never dead).
// Piece B2b: a link is a PARTY only once its hello is admitted (./admission.js — the start secret the supervisor minted for
// this start; lane readings' contract v1 §3). Until then nothing is relayed to it and its bytes are credited and dropped;
// a refused hello is answered {op:'auth-fail'} and the link ends; a link that says no hello within HELLO_MS is ended. A
// RE-ATTACH of an admitted party destroys its old link FIRST, and the old link's death ends only its own pages (the relay
// binds each link's callbacks to it). Every link is built as the contract says: closeAfterQueue, heartbeat off,
// maxControl 64 KiB. An admitted party may push the certificate (`{op:'certificate', cert, key}`) — one that cannot be
// loaded keeps the old context and is answered, never thrown out of the frame code's unguarded control callback.
const { Mux } = require('../agentd/mux.js');
const front = require('./front.js');
const relay = require('./relay.js');
const owners = require('./owners.js');
const admission = require('./admission.js');

const HELLO_MS = 10000;          // a link that names no party in this long is ended (an accident, never a party)
const MAX_CONTROL = 64 * 1024;   // contract v1 §3: an outer control line over 64 KiB is a protocol error
const CAPABILITIES = ['relay@1', 'certificate@1'];   // what a party may ask of this interface (each name carries its shape's version)

/** → { listen(port, host) → Promise, useCertificate(pem), admit(line), attachLink(stream), close(), stats() } */
function create({ ownerOf = owners.ownerOf, firstByteMs, handshakeMs, helloMs = HELLO_MS, clocks, firstChan } = {}) {
  const r = relay.create({ ownerOf, firstChan });
  const f = front.create({ onExchange: r.exchange, onUpgrade: r.upgrade, firstByteMs, handshakeMs, clocks });   // THE FRAMING UNIT: Node's parser on every page socket, ONE exchange a channel
  const gate = admission.create();
  const links = new Map();   // party → its admitted link
  const said = { refused: 0, lastRefused: null, certRefused: 0, lastCertRefused: null };
  function attachLink(stream) {
    let party = null, rh = null;
    const link = new Mux(stream, {
      heartbeat: false, closeAfterQueue: true, maxControl: MAX_CONTROL,
      onControl: (m) => {
        if (!party) {
          const v = gate.check(m);
          if (!v.ok) { said.refused++; said.lastRefused = v.why; try { link.control({ op: 'auth-fail' }); } catch { } link.destroy(); return; }
          clearTimeout(timer);
          const old = links.get(v.party);
          if (old && old !== link) { try { old.destroy(); } catch { } }   // a re-attach: the old link goes FIRST (its onDead ends its own pages)
          party = v.party; rh = r.handlersFor(link); links.set(party, link); r.attach(link);
          link.control({ op: 'hello-ack', protoVersion: admission.PROTO_VERSION, party: 'interface', capabilities: CAPABILITIES });
          return;
        }
        if (m && m.op === 'certificate') {
          const res = f.useCertificate(m.cert && m.key ? { cert: m.cert, key: m.key } : null);
          if (!res.ok) { said.certRefused++; said.lastCertRefused = res.why; }
          try { link.control({ op: 'certificate-ack', ok: res.ok, ...(res.ok ? {} : { why: res.why }) }); } catch { }
        }
      },
      onData: (chan, buf) => (rh ? rh.onData(chan, buf) : link.credit(chan, buf.length)),   // not a party yet: dropped, never owed
      onClose: (chan) => { if (rh) rh.onClose(chan); },
      onWritable: (chan) => { if (rh) rh.onWritable(chan); },
      onDead: (why) => { clearTimeout(timer); if (rh) rh.onDead(why); if (party && links.get(party) === link) links.delete(party); },
    });
    const timer = setTimeout(() => { if (!party) { said.refused++; said.lastRefused = 'no-hello'; link.destroy(); } }, helloMs);
    timer.unref?.();
    return link;
  }
  return {
    listen: (port, host) => new Promise((resolve, reject) => { f.server.once('error', reject); f.server.listen(port, host, () => { f.server.removeListener('error', reject); resolve(f.server.address()); }); }),
    useCertificate: f.useCertificate,
    admit: gate.admit,
    attachLink,
    close: async () => { for (const l of links.values()) { try { l.destroy(); } catch { } } await f.close(); },
    stats: () => ({ ...r.stats(), linked: links.size > 0, parties: [...links.keys()], tls: f.serving(), acceptErrors: f.acceptErrors().count, ...said }),
  };
}

module.exports = { create, HELLO_MS, MAX_CONTROL, CAPABILITIES };
