'use strict';
// ONE delivery ladder for "get a message into a conversation" (2.362.0,
// B-274d/B-dfd2) — extracted from jobs-wiring so background-job notifications
// and agent-to-agent messages ride the SAME implementation (CS law: transport
// is selected inside, callers never branch). Rungs, in order:
//   0. VibeSpace channel socket (EXPERIMENTAL, agents.vibespaceChannel)
//   1. LOCAL CLI inbox — scan this machine's ~/.claude/sessions registry
//   2. REMOTE machine — conversation-index names the owner host; that host's
//      agentd runs the SAME findPeer+postToPeer against ITS registry via the
//      'peer-post' device op (capability-gated; daemon-first doctrine — no
//      ssh-script twin: any host we deliver to can run the daemon)
//   3. STASH — durable per-conversation queue (data/msg-stash.json), drained
//      into the conversation's next context injection. Machine-agnostic by
//      construction: remote sessions' hooks already call back to this hub.
// Envelope is CHANNEL-READY (owner direction 2026-08-20): every stashed entry
// carries {source, fromName, text, ts} — 'agent' today; Gmail/Lark/Slack
// connectors later feed the same ladder with their own source tags.
const fs = require('fs');
const path = require('path');

const STASH_CAP = 30; // per-conversation; oldest fall off

function create({ dataDir, peerMsg, getHosts, getConvIndex, serverSetting, activeSessions, emitPeerCard, log = () => { } }) {
  const stashFile = path.join(dataDir, 'msg-stash.json');
  let stash = {};
  try { stash = JSON.parse(fs.readFileSync(stashFile, 'utf-8')) || {}; } catch { }
  let stashTimer = null;
  const writeStashNow = () => {
    try { fs.writeFileSync(stashFile + '.tmp', JSON.stringify(stash)); fs.renameSync(stashFile + '.tmp', stashFile); } catch (e) { log('[deliver] stash persist failed:', e.message); }
  };
  const persistStash = () => {
    if (stashTimer) return;
    stashTimer = setTimeout(() => { stashTimer = null; writeStashNow(); }, 500);
  };
  // SIGTERM/SIGINT belt (review-caught): a debounced-only write loses a
  // just-stashed "queued" promise on the ROUTINE restart path — same law as
  // every other data/*.json store.
  const flush = () => { if (stashTimer) { clearTimeout(stashTimer); stashTimer = null; } writeStashNow(); };

  function stashFor(cid, envelope) {
    const q = stash[cid] || (stash[cid] = []);
    q.push({ source: envelope.source || 'agent', fromName: envelope.fromName || null, text: String(envelope.text || ''), ts: Date.now() });
    if (q.length > STASH_CAP) q.splice(0, q.length - STASH_CAP);
    persistStash();
  }
  function drainStash(cid) {
    const q = stash[cid] || [];
    if (q.length) { delete stash[cid]; persistStash(); }
    return q;
  }
  function stashCount(cid) { return (stash[cid] || []).length; }

  // rung 2 helper: which registered machine owns this conversation? null =
  // local/unknown (the local rung already ran by the time this is asked).
  function ownerHostOf(cid) {
    try {
      const hosts = getHosts?.();
      const idx = getConvIndex?.();
      if (!hosts || !idx) return null;
      const hid = idx.ownerHost(cid, (id) => { try { return !!hosts.get(id); } catch { return false; } });
      return hid && hid !== 'local' ? hid : null;
    } catch { return null; }
  }

  /** One delivery attempt down the ladder. Returns {ok, lane, peerName?,
   *  hostId?, reason?} — the caller decides whether a miss stashes (jobs and
   *  agent-msg both do; a future fire-and-forget source may not).
   *  opts.fromName/opts.cardText label the CHAT CARD the server renders on a
   *  successful post (2.363.0): the CLI records server-posted injections with
   *  a body-less origin (unregistered poster), so the delivery site is the
   *  ONLY party that can render the message visibly in the live window. */
  async function deliverToConversation(cid, text, opts = {}) {
    const cardOk = () => { try { emitPeerCard?.(cid, { fromName: opts.fromName || null, text: opts.cardText || text }); } catch (e) { log('[deliver] card emit failed:', e.message); } };
    // rung 0: VibeSpace channel socket (experimental, per-session opt-in)
    try {
      if (serverSetting?.('agents.vibespaceChannel') === true && activeSessions) {
        for (const [wid, s] of activeSessions) {
          if ((s.backendSessionId || s.claudeSessionId) !== cid) continue;
          const sock = path.join(dataDir, 'channel-socks', wid + '.sock');
          if (!fs.existsSync(sock)) continue;
          const rc = await peerMsg.postChannelEvent(sock, text, { kind: 'peer_message' });
          if (rc.ok) { cardOk(); return { ok: true, lane: 'channel', peerName: s.name || null }; }
        }
      }
    } catch (e) { log('[deliver] channel lane failed (falling through):', e.message); }
    // rung 1: this machine's CLI inbox registry
    try {
      const peer = peerMsg.findPeer(cid);
      if (peer) {
        const r = await peerMsg.postToPeer(peer, text);
        if (r.ok) { cardOk(); return { ok: true, lane: 'message', peerName: peer.name || null }; }
        log(`[deliver] local peer post to ${peer.socketPath} failed: ${r.reason}`);
        return { ok: false, lane: 'message', reason: r.reason };
      }
    } catch (e) { return { ok: false, reason: e.message }; }
    // rung 2: the owning machine's daemon posts to ITS local registry
    const hid = ownerHostOf(cid);
    if (hid) {
      try {
        const hosts = getHosts?.();
        // BOUNDED connect (review-caught): plain device() rides the full
        // ~2.7min retry ladder on a down host — a send request must fall to
        // the stash rung honestly instead (the background connect still heals).
        const dm = await (hosts.deviceBounded ? hosts.deviceBounded(hid, 6000) : hosts.device(hid));
        const r = await dm.peerPost({ cid, text });
        if (r && r.ok) { cardOk(); return { ok: true, lane: 'remote-message', peerName: r.peerName || null, hostId: hid }; }
        return { ok: false, lane: 'remote-message', hostId: hid, reason: (r && r.reason) || 'remote daemon could not reach the inbox' };
      } catch (e) {
        // capability gate / daemon down — an honest miss, the stash covers it
        return { ok: false, lane: 'remote-message', hostId: hid, reason: e.message };
      }
    }
    return { ok: false, reason: 'no live inbox for this conversation on any reachable machine' };
  }

  function peerReachable(cid) {
    try { if (peerMsg.findPeer(cid)) return true; } catch { }
    return !!ownerHostOf(cid); // a remote owner MAY be reachable — optimistic preview, the ladder decides for real
  }

  return {
    deliverToConversation, peerReachable, stashFor, drainStash, stashCount, flush,
    // exposed for the stash-drain sites: a drained message enters the agent's
    // context invisibly — the drain site emits the same card the live lanes do
    emitPeerCard: (cid, card) => { try { emitPeerCard?.(cid, card); } catch { } },
  };
}

module.exports = { create };
