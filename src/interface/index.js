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
// THE GREETING, VERSION 2 (主开发 r1087): every link opens with a fresh challenge from here, and a party's hello PROVES its start
// value (a proof keyed by the digest it was admitted by — ../link-proof.js), never sends it: no start value is on any link.
// Piece B2b: a link is a PARTY only once its hello is admitted (./admission.js — the start secret the supervisor minted for
// this start; lane readings' contract v1 §3). Until then nothing is relayed to it and its bytes are credited and dropped;
// a refused hello is answered {op:'auth-fail'} and the link ends; a link that says no hello within HELLO_MS is ended. A
// RE-ATTACH of an admitted party destroys its old link FIRST, and the old link's death ends only its own pages (the relay
// binds each link's callbacks to it). Every link is built as the contract says: closeAfterQueue, heartbeat off,
// maxControl 64 KiB. An admitted party may push the certificate (`{op:'certificate', cert, key}`) — one that cannot be
// loaded keeps the old context and is answered, never thrown out of the frame code's unguarded control callback.
// THE SIGN-IN TABLE (piece B3b-1, 主开发 r1060 «the interface's ONE store» + r1517 (A)): with a table (./signin.js, the start
// line names its file — main.js hands it in with useSignin before it listens) every head meets it FIRST: the held state and the
// sign-in road are answered here, and every other head is relayed with the table's ONE fact on its stamp (`signin`: 'off', a
// live login's digest, or null) and, on a page answer, the slide's cookie. After a party's hello-ack the table's state goes to
// it (`{op:'signin-state', enabled, password, sso, held}`), and again at every change; a party's `{op:'signin-revoke-all', why}`
// (a vault lock — B3b-2 sends it) revokes every login, answered `{op:'signin-revoke-all-ack', revoked}` (the hub closes its own
// page sockets with the signed-out code, as today). Without a table (a suite's relay alone) nothing of this runs.
const { Mux } = require('../agentd/mux.js');
const front = require('./front.js');
const relay = require('./relay.js');
const owners = require('./owners.js');
const admission = require('./admission.js');
const { challenge } = require('../link-proof.js');   // the greeting's fresh challenge (version 2: the start value never crosses a link)

const HELLO_MS = 10000;          // a link that names no party in this long is ended (an accident, never a party)
const MAX_CONTROL = 64 * 1024;   // contract v1 §3: an outer control line over 64 KiB is a protocol error
const CAPABILITIES = ['relay@1', 'certificate@1', 'signin@1'];   // what a party may ask of this interface (each name carries its shape's version)

/** → { listen(port, host) → Promise, useCertificate(pem), useSignin(table), admit(line), attachLink(stream), close(), stats() } */
function create({ ownerOf = owners.ownerOf, firstByteMs, handshakeMs, helloMs = HELLO_MS, clocks, firstChan, signin = null, log = console } = {}) {
  const r = relay.create({ ownerOf, firstChan });
  let table = null;
  /** every head meets the table first (the held state, the road); the rest is relayed with its fact */
  /** a fault of the table on ONE head is said by name and answers that head — the interface never ends on it */
  const failed = (e) => { try { log.error?.(`[interface] the sign-in table failed on a head (${(e && e.code) || (e && e.name) || 'error'}) — answered by name`); } catch { } };
  const onExchange = (req, res, facts) => {
    if (!table) return r.exchange(req, res, facts);
    let h;
    try { if (table.road(req, res, facts)) return; h = table.head(req, facts); }
    catch (e) { failed(e); req.resume(); if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }); res.end('{"error":"signin-failed"}'); } return; }
    r.exchange(req, res, { ...facts, signin: h.fact, lines: h.lines });
  };
  const onUpgrade = (req, socket, head, facts) => {
    if (!table) return r.upgrade(req, socket, head, facts);
    let fact;
    try { if (table.upgradeRefused(req)) return table.refuseUpgrade(socket); fact = table.head(req, facts, { upgrade: true }).fact; }   // shut: every upgrade but a paired machine's dial-in
    catch (e) { failed(e); try { socket.destroy(); } catch { } return; }
    r.upgrade(req, socket, head, { ...facts, signin: fact });
  };
  const f = front.create({ onExchange, onUpgrade, firstByteMs, handshakeMs, clocks });   // THE FRAMING UNIT: Node's parser on every page socket, ONE exchange a channel
  const tell = (line) => { for (const l of links.values()) { try { l.control(line); } catch { } } };   // the table's state, to every admitted party
  function useSignin(t) { table = t || null; if (table) table.onChange(tell); }
  const gate = admission.create();
  const links = new Map();   // party → its admitted link
  if (signin) useSignin(signin);
  const said = { refused: 0, lastRefused: null, certRefused: 0, lastCertRefused: null };
  function attachLink(stream) {
    let party = null, rh = null;
    const nonce = challenge();   // THIS link's challenge: a proof answers it once, and is worth nothing on another link
    const link = new Mux(stream, {
      heartbeat: false, closeAfterQueue: true, maxControl: MAX_CONTROL,
      onControl: (m) => {
        if (!party) {
          const v = gate.check(m, nonce);
          if (!v.ok) { said.refused++; said.lastRefused = v.why; try { link.control({ op: 'auth-fail' }); } catch { } link.destroy(); return; }
          clearTimeout(timer);
          const old = links.get(v.party);
          if (old && old !== link) { try { old.destroy(); } catch { } }   // a re-attach: the old link goes FIRST (its onDead ends its own pages)
          party = v.party; rh = r.handlersFor(link); links.set(party, link); r.attach(link);
          link.control({ op: 'hello-ack', protoVersion: admission.PROTO_VERSION, party: 'interface', capabilities: CAPABILITIES });
          if (table) { try { link.control(table.stateLine()); } catch { } }   // the table's state, before any channel
          return;
        }
        if (m && m.op === 'signin-revoke-all') {   // a vault lock (the hub, B3b-2's sender): every login revoked, said by name
          const n = table ? table.revokeAll() : 0;
          try { log.log?.(`[interface] every login signed out (${String(m.why || 'asked').slice(0, 60)}) — ${n} login(s)`); } catch { }
          try { link.control({ op: 'signin-revoke-all-ack', revoked: n }); } catch { }
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
    try { link.control({ op: 'challenge', protoVersion: admission.PROTO_VERSION, nonce }); } catch { }   // the greeting opens with the challenge, before any hello
    const timer = setTimeout(() => { if (!party) { said.refused++; said.lastRefused = 'no-hello'; link.destroy(); } }, helloMs);
    timer.unref?.();
    return link;
  }
  return {
    listen: (port, host) => new Promise((resolve, reject) => { f.server.once('error', reject); f.server.listen(port, host, () => { f.server.removeListener('error', reject); resolve(f.server.address()); }); }),
    useCertificate: f.useCertificate,
    useSignin,
    admit: gate.admit,
    attachLink,
    close: async () => { for (const l of links.values()) { try { l.destroy(); } catch { } } await f.close(); },
    stats: () => ({ ...r.stats(), linked: links.size > 0, parties: [...links.keys()], tls: f.serving(), acceptErrors: f.acceptErrors().count, ...said, ...(table ? { signin: table.stats() } : {}) }),
  };
}

module.exports = { create, HELLO_MS, MAX_CONTROL, CAPABILITIES };
