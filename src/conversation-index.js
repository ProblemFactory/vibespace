'use strict';
/**
 * conversation-index.js — the orchestrator's CONVERSATION-LOCATION INDEX
 * (the R3 tail of docs/design-three-tier.md: "a normalized transcript mirror +
 * conversation-location index (so history stays readable when an owning
 * machine is unreachable)"). The raw mirror already exists — data/remote-jsonl
 * — but WHICH MACHINE owns a conversation was only discoverable by scanning
 * that cache for a file, i.e. only for conversations whose transcript had
 * already been pulled at least once. This index records ownership from BOTH
 * sources — discovery (a host listed the conversation) and transcript fetches
 * (we pulled its file from a host) — so the resume host-inference and the
 * dead-host rescue can locate a conversation the cache has never seen.
 *
 * One record per conversation id, with per-host claims kept separately:
 * a conversation legitimately lives on ONE machine, but transcripts can be
 * copied around — ownerHost() answers only when exactly one registered host
 * claims it (the same owners.length === 1 rule the 2.218.0 inference used),
 * or when one claim is decisively fresher than every other (a re-imaged
 * machine re-listing an old copy must not permanently veto the live home).
 */
const fs = require('fs');
const path = require('path');

const MAX_CONVS = 5000;
const DECISIVE_MS = 7 * 24 * 3600 * 1000; // a week fresher = decisive

class ConversationIndex {
  constructor({ dataDir }) {
    this.file = path.join(dataDir, 'conversation-index.json');
    this._state = { v: 1, conv: {} };
    try { this._state = JSON.parse(fs.readFileSync(this.file, 'utf-8')) || this._state; } catch { }
    if (!this._state.conv) this._state.conv = {};
    this._dirty = false;
    this._timer = null;
    this._lastJson = null;
    process.on('exit', () => { try { this._flush(); } catch { } });
  }

  /** Record that `hostId` claims conversation `sid`. src: 'discovery'|'fetch'. */
  note(sid, hostId, { cwd, backend, src, size, mtime } = {}) {
    if (!sid || !hostId || !/^[\w-]+$/.test(sid)) return;
    const c = this._state.conv[sid] || (this._state.conv[sid] = { hosts: {} });
    const h = c.hosts[hostId] || (c.hosts[hostId] = {});
    h.lastSeen = Date.now();
    h.src = src || h.src || null;
    if (cwd) h.cwd = cwd;
    if (backend) h.backend = backend;
    if (size != null) h.size = size;
    if (mtime != null) h.mtime = mtime;
    this._schedule();
  }

  noteDiscovery(hostId, sessions) {
    for (const s of sessions || []) {
      if (!s || !s.sessionId) continue;
      this.note(s.sessionId, hostId, { cwd: s.cwd, backend: s.backend || 'claude', src: 'discovery' });
    }
  }

  /** The single owning host of a conversation, or null when unknown/ambiguous.
   *  `isRegistered(hostId)` filters claims from since-removed hosts. */
  ownerHost(sid, isRegistered = () => true) {
    const c = this._state.conv[sid];
    if (!c) return null;
    const claims = Object.entries(c.hosts || {}).filter(([hid]) => isRegistered(hid))
      .sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
    if (!claims.length) return null;
    if (claims.length === 1) return claims[0][0];
    // several hosts claim it: only a DECISIVELY fresher claim wins — otherwise
    // stay honest and answer "ambiguous" (null), exactly like the cache scan
    const [a, b] = claims;
    if ((a[1].lastSeen || 0) - (b[1].lastSeen || 0) > DECISIVE_MS) return a[0];
    return null;
  }

  lookup(sid) { return this._state.conv[sid] || null; }

  _schedule() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this._flush(); }, 1500);
    if (this._timer.unref) this._timer.unref();
  }

  _flush() {
    if (!this._dirty) return;
    this._dirty = false;
    try {
      const ids = Object.keys(this._state.conv);
      if (ids.length > MAX_CONVS) {
        const newest = (c) => Math.max(0, ...Object.values(c.hosts || {}).map((h) => h.lastSeen || 0));
        ids.sort((x, y) => newest(this._state.conv[y]) - newest(this._state.conv[x]));
        for (const drop of ids.slice(MAX_CONVS)) delete this._state.conv[drop];
      }
      const json = JSON.stringify(this._state);
      if (json === this._lastJson) return;
      this._lastJson = json;
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    } catch { }
  }
}

module.exports = { ConversationIndex };
