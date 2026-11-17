'use strict';
// THE INTERFACE (the separation, M1 — lane B, piece B2: the skeleton and the relay; design: «The processes (revision)» —
// interface, «The link», THE PROGRAMME M1). The one process that must always answer: the ONE listener of the hub's port
// (plain and TLS by the first byte, ./front.js), and the relay of every page connection to the party that owns it over
// that party's link (./relay.js), routed by the owner map (./owners.js — a stub until the owner-map lane's module is
// taken). It owns no work: no engine, no store, no key, no child start, no parse of a payload, and no synchronous disk call
// once it listens (scripts/test-interface-relay.mjs holds each as a law). Its link to a party is the tree's own frame code
// (src/agentd/mux.js); a same-machine link runs with the heartbeat OFF (a silent party is late, never dead).
// Piece B2's first half: the module, proven in-process with a link handed in. Its process entry, the party's admission by
// its start secret and today's hub joining the link (the hub's own listener deleted) are the second half.
const { Mux } = require('../agentd/mux.js');
const front = require('./front.js');
const relay = require('./relay.js');
const owners = require('./owners.js');

/** → { listen(port, host) → Promise, useCertificate(pem), attachLink(stream, { party }), close(), stats() } */
function create({ ownerOf = owners.ownerOf, firstByteMs } = {}) {
  const r = relay.create({ ownerOf });
  const f = front.create({ onPage: (socket, facts) => r.open(socket, facts), firstByteMs });
  let link = null;
  function attachLink(stream) {
    // closeAfterQueue (lane readings 78f27628f, OPT-IN): a page's end reaches its owner only behind that page's own bytes
    // still waiting for credit — «as received» (B2a MUST 4); today's device link keeps the release's close
    link = new Mux(stream, { heartbeat: false, closeAfterQueue: true, ...r.handlers, onDead: (why) => { link = null; r.handlers.onDead(why); } });
    r.attach(link);
    return link;
  }
  return {
    listen: (port, host) => new Promise((resolve, reject) => { f.server.once('error', reject); f.server.listen(port, host, () => { f.server.removeListener('error', reject); resolve(f.server.address()); }); }),
    useCertificate: f.useCertificate,
    attachLink,
    close: async () => { try { link && link.destroy(); } catch { } await f.close(); },
    stats: () => ({ ...r.stats(), linked: !!link, tls: f.serving(), acceptErrors: f.acceptErrors().count }),
  };
}

module.exports = { create };
