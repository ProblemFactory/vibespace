'use strict';
// THE RELAY (the separation, M1 — the interface, piece B2). A page connection rides ONE byte channel of the link to the
// party that owns it, AS RECEIVED: this process never parses what flows. The channel opens with ONE open line on the
// link's control channel — { op: 'open', chan, to, trace, stamp } — where `to` is the owner the owner map answers and the
// STAMP is written HERE and nowhere else (today: whether the page's connection is TLS, and its address; who signed in
// joins in piece B3). Bytes go both ways UNDER CREDIT, so at most one window per channel waits in this process:
//   page → link   mux.data(); a FALSE answer pauses the page socket until the channel is writable again (onWritable);
//   link → page   written to the page socket; credit goes back ONLY for bytes the socket took — a page that stops reading
//                 withholds the credit (its 'drain' returns it), and the party behind holds the rest in its own queue.
// A page's end half-closes its channel; the owner's close ends the page's side; a dead link closes every page OF THAT LINK.
// With NO link attached an arriving page is closed at once (nothing is queued for a party that is not there).
// A RE-ATTACH (piece B2b): each pair belongs to the link it was opened on, and that link's handlers are bound to it — a
// link that dies after a newer one was attached ends only its own pages and never empties the newer link's pairs.
const crypto = require('crypto');

/** → { handlersFor(mux) (that link's onData / onClose / onWritable / onDead), attach(mux) (the link pages open on),
 *  current(), open(page, facts), stats() } */
function create({ ownerOf, newTrace = () => crypto.randomBytes(8).toString('hex') } = {}) {
  let mux = null, next = 1;
  const pairs = new Map();   // chan → { page, mux (the link it rides), owed, ended: { page, owner }, gone }
  const stats = { opened: 0, toLink: 0, toPage: 0, paused: 0, withheld: 0 };
  const done = (chan, p) => { if (p.ended.page && p.ended.owner) pairs.delete(chan); };

  function open(page, facts = {}) {
    if (!mux) { page.destroy(); return null; }   // no link: closed at once
    const m = mux, chan = next++;
    const p = { page, mux: m, owed: 0, ended: { page: false, owner: false } };
    pairs.set(chan, p); stats.opened++;
    m.control({ op: 'open', chan, to: ownerOf({ kind: 'route' }), trace: newTrace(), stamp: { secure: !!facts.secure, addr: facts.addr || null, port: facts.port || null } });
    const live = () => !p.gone;   // the pair's own link still lives
    page.on('data', (b) => { stats.toLink += b.length; if (live() && !m.data(chan, b)) { page.pause(); stats.paused++; } });
    page.on('drain', () => { if (p.owed && live()) { const n = p.owed; p.owed = 0; m.credit(chan, n); } });
    page.on('end', () => { p.ended.page = true; if (live()) m.closeChan(chan); done(chan, p); });
    page.on('close', () => { if (!p.ended.page) { p.ended.page = true; if (live()) m.closeChan(chan); } p.ended.owner = true; pairs.delete(chan); });
    page.on('error', () => { });
    return chan;
  }
  /** the callbacks of ONE link, bound to it (a re-attached link gets its own) */
  function handlersFor(m) {
    const mine = (chan) => { const p = pairs.get(chan); return p && p.mux === m ? p : null; };
    return {
      onData(chan, buf) {
        const p = mine(chan);
        if (!p) { m.credit(chan, buf.length); return; }   // a channel already gone: its bytes are dropped, never left owing
        stats.toPage += buf.length;
        if (p.page.write(buf)) m.credit(chan, buf.length);
        else { p.owed += buf.length; stats.withheld++; }
      },
      onClose(chan) { const p = mine(chan); if (!p) return; p.ended.owner = true; try { p.page.end(); } catch { } done(chan, p); },
      onWritable(chan) { const p = mine(chan); if (p && p.page.isPaused && p.page.isPaused()) p.page.resume(); },
      onDead() {
        if (mux === m) mux = null;   // only THIS link stops being the one pages open on
        for (const [chan, p] of pairs) if (p.mux === m) { p.gone = true; try { p.page.destroy(); } catch { } pairs.delete(chan); }
      },
    };
  }
  /** what waits in THIS process for the pages: the page sockets' unsent bytes (the bytes whose credit is withheld are among them) */
  const held = () => { let n = 0; for (const p of pairs.values()) n += p.page.writableLength || 0; return n; };
  return { handlersFor, attach(m) { mux = m; }, current: () => mux, open, stats: () => ({ ...stats, channels: pairs.size, held: held() }) };
}

module.exports = { create };
