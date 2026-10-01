'use strict';
// THE BRIDGE WATCH (lane-dead-bridge, ORCH over PURE src/bridge-liveness.js +
// src/record-lateness.js — lane-hot-switch's late-record rule, reused).
//
// 2026-09-30: after a 12:03 crash one restored session's stdout bridge stayed
// DEAD for three hours while its CLI kept working; the owner's message at 15:05
// re-attached it and the backlog was consumed as live. Reproduced on raw dtach
// (the mechanism is in src/bridge-liveness.js's header). Four duties:
//
//   ① endAttachPtys()   — THE teardown of every attach pty, shared by the clean
//      shutdown and the CRASH path (the crash path had none: its attach clients
//      survived as orphans because node-pty's pty masters, inherited by every
//      later spawn, kept the ptys from hanging up).
//   ② sweepOrphans()    — end the orphaned `dtach -a` clients a previous server
//      left attached to OUR sockets (procfs scan, `dtach` processes only, the
//      PURE verdict). Run AFTER the new attach connected: dtach discards what
//      it reads while no client is attached, so attach-then-kill loses at most
//      the one read the master was holding, kill-then-attach loses everything
//      the unblocked wrapper pours out in between (measured).
//   ③ the WATCH         — every tick, a local dtach session silent for N minutes
//      (session.deadBridgeMinutes, default 3; 0 = off) whose CLI a witness says
//      kept working after the last byte (the wrapper's buffer FILE — a stat,
//      never a read — or an OTel api_request row for its conversation) is a
//      DEAD BRIDGE: re-attached through the ONE local healer
//      (reattachLocalPty), then its orphans ended. Bounded: 3 heals per hour per
//      session; a heal that brought nothing doubles that session's silence
//      (a CLI whose requests print nothing is quiet, not dead).
//   ④ the CATCH-UP      — what a heal (or the boot sweep) releases is counted
//      through the late-record rule (a record stamped > 2 min before it
//      arrives is late — the engine's gate keeps it from moving the pool or
//      the readings); when it drains, ONE card: "lost at … restored at … N
//      records caught up (they are shown, not re-run)".
const fs = require('fs');
const path = require('path');
const BL = require('../bridge-liveness.js');
const RL = require('../record-lateness.js');

function create({ activeSessions, BUFFERS_DIR, SOCKETS_DIR, reattachLocalPty, serverSetting = () => undefined,
  getOtelIngest = () => null, feedPeerCard = null, log = console, now = () => Date.now(),
  procRoot = '/proc', kill = (pid, sig) => process.kill(pid, sig), selfPid = process.pid } = {}) {
  const startedAt = now();
  let timer = null, tickMs = null, ticking = false;
  const budgetSaid = new Map();   // id → last "heal budget spent" journal line (≤ 1/hour)

  // ── ① THE ONE teardown of the attach ptys ──
  function endAttachPtys() {
    let n = 0;
    for (const [, s] of activeSessions) { try { if (s && s.pty) { s.pty.kill(); n++; } } catch { } }
    return n;
  }

  // ── ② the orphan sweep ──
  function listOrphans(socketPath = null) {
    const out = [];
    let names; try { names = fs.readdirSync(procRoot); } catch { return out; }
    for (const n of names) {
      if (!/^\d+$/.test(n)) continue;
      let comm; try { comm = fs.readFileSync(`${procRoot}/${n}/comm`, 'utf8').trim(); } catch { continue; }
      if (comm !== 'dtach') continue;
      let argv, stat;
      try { argv = fs.readFileSync(`${procRoot}/${n}/cmdline`, 'utf8').split('\0'); stat = fs.readFileSync(`${procRoot}/${n}/stat`, 'utf8'); } catch { continue; }
      if (argv.length && argv[argv.length - 1] === '') argv.pop();
      const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');   // state ppid pgrp session tty_nr …
      const ppid = Number(f[1]), ttyNr = Number(f[4]);
      let parentComm = ''; try { parentComm = fs.readFileSync(`${procRoot}/${ppid}/comm`, 'utf8').trim(); } catch { }
      const v = BL.orphanAttachVerdict({ argv, ppid, parentComm, ttyNr, socketsDir: SOCKETS_DIR, selfPid });
      if (!v.orphan || (socketPath && v.socket !== socketPath)) continue;
      out.push({ pid: Number(n), socket: v.socket, why: v.why });
    }
    return out;
  }
  function sweepOrphans({ socketPath = null, why = 'boot' } = {}) {
    const killed = [];
    for (const o of listOrphans(socketPath)) { try { kill(o.pid, 'SIGKILL'); killed.push(o); } catch { } }
    if (killed.length) {
      try { log.log?.(`[bridge] ${why}: ended ${killed.length} orphaned dtach attach client(s) a previous server left attached — they held their sessions' output (${killed.map((o) => `pid ${o.pid} ${path.basename(o.socket)} ${o.why}`).join(', ')})`); } catch { }
      try { global.__vsEvent?.('bridge-orphans-ended', String(killed.length)); } catch { }
    }
    return killed;
  }

  // ── ④ the catch-up ──
  function armCatchUp(id, s, { restoredAt, silentSince, why }) {
    const st = BL.catchUpStart({ restoredAt, silentSince, why });
    let clock = null;
    const remote = !!s.host;
    let bytes = 0;
    const cu = {
      st, why,
      note(msg) {   // called by the claude stdout consumer for every parsed record
        const t = now();
        const j = RL.judge(clock, msg, t, { remote });
        clock = RL.observe(clock, msg, t).clock;
        BL.catchUpNote(st, j, RL.stampOf(msg), t);
      },
    };
    s._bridgeCatchUp = cu;
    let sub = null;   // the byte counter (every harness, not only the parsed claude records) — disposed when the catch-up settles
    try { sub = s.pty?.onData?.((d) => { bytes += (d && d.length) || 0; st.lastAt = Math.max(st.lastAt, now()); }); } catch { }
    const poll = setInterval(() => {
      if (s._bridgeCatchUp !== cu || !activeSessions.has(id)) { clearInterval(poll); try { sub?.dispose?.(); } catch { } return; }
      if (!BL.catchUpSettled(st, now())) return;
      clearInterval(poll);
      try { sub?.dispose?.(); } catch { }
      s._bridgeCatchUp = null;
      const empty = st.n === 0 && bytes <= 6;   // 6 = dtach's own clear-screen preamble
      s._bridgeEmptyHeals = why === 'heal' && empty ? (s._bridgeEmptyHeals || 0) + 1 : 0;
      const lostAt = BL.catchUpLostAt(st);
      try { log.log?.(`[bridge] ${id}: ${why} caught up ${st.n} record(s) / ${bytes} byte(s) — ${st.late} of them stamped > 2 min before they arrived (shown, never a live fact); output lost since ${new Date(lostAt).toISOString()}`); } catch { }
      const text = BL.catchUpCard(st);
      if (text && feedPeerCard) {
        try { feedPeerCard(s, { fromName: 'VibeSpace', kind: 'notification', text }); try { log.log?.(`[bridge] ${id}: card — ${text}`); } catch { } }
        catch (e) { log.warn?.(`[bridge] ${id}: the catch-up card failed: ${e && e.message}`); }
      }
    }, 1000);
    poll.unref?.();
    return cu;
  }

  /** Boot: end the orphans and count what each freed session catches up. ATTACH FIRST: a session with an orphan
   *  waits (≤ 3 s) until its own restored attach has produced its first byte — the client connected — because
   *  ending the orphan before that hands the backlog to a master that drops every read with no client attached. */
  async function bootSweep() {
    try {
      const bySock = new Map();
      for (const [, s] of activeSessions) if (s && s.socketPath) bySock.set(s.socketPath, s);
      const waiting = [...new Set(listOrphans().map((o) => bySock.get(o.socket)).filter(Boolean))];
      await Promise.all(waiting.map((s) => waitFirstByte(s, 1, 3000)));
      const killed = sweepOrphans({ why: 'boot' });
      const freed = new Set(killed.map((o) => o.socket));
      for (const [id, s] of activeSessions) {
        if (s && s.socketPath && freed.has(s.socketPath) && !s._bridgeCatchUp) armCatchUp(id, s, { restoredAt: now(), silentSince: s._lastPtyDataAt || startedAt, why: 'boot' });
      }
      return killed;
    } catch (e) { try { log.warn?.(`[bridge] boot sweep failed: ${e && e.message}`); } catch { } return []; }
  }

  // ── ③ the watch ──
  function statMtime(file, ms = 2000) {
    return Promise.race([
      fs.promises.stat(file).then((st) => st.mtimeMs, () => null),
      new Promise((r) => { const t = setTimeout(() => r(null), ms); t.unref?.(); }),
    ]);
  }
  function waitFirstByte(s, since, ms) {
    return new Promise((res) => {
      const t0 = Date.now();   // the bound is WALL time even when the watch runs on an injected clock
      const iv = setInterval(() => { if (Number(s._lastPtyDataAt) >= since || Date.now() - t0 >= ms) { clearInterval(iv); res(Number(s._lastPtyDataAt) >= since); } }, 50);   // NOT unref'd: bounded (≤ ms), and an awaited wait must keep its process alive
    });
  }
  /** After EVERY local re-attach (session-stdout's reattachLocalPty tells us — the watch's heal, the broken-stdin
   *  detector, the attach probe): count the catch-up, and once the new attach has connected (its first byte),
   *  end the orphans holding this socket's master — attach first, then kill (see ②). */
  function afterReattach(id, s, { kind = 'reattach', silentSince = null } = {}) {
    const at = now();
    if (!s._bridgeCatchUp) armCatchUp(id, s, { restoredAt: at, silentSince, why: kind });
    waitFirstByte(s, at, 3000).then(() => { try { sweepOrphans({ socketPath: s.socketPath, why: `${id} ${kind}` }); } catch { } });
  }
  function heal(id, s, v) {
    const at = now();
    s._bridgeHeals = BL.healBudget(s._bridgeHeals, at).heals.concat(at);
    let ok = false;
    try { ok = reattachLocalPty(id, s, `dead bridge: ${BL.verdictWords(v)}`, { kind: 'heal' }); } catch (e) { log.warn?.(`[bridge] ${id}: the re-attach threw: ${e && e.message}`); }
    if (!ok) return false;
    try { global.__vsEvent?.('bridge-dead-healed', v.witness); } catch { }
    return true;   // afterReattach (called by reattachLocalPty) armed the catch-up and the sweep
  }
  async function tick() {
    if (ticking) return [];
    ticking = true;
    const acted = [];
    try {
      const base = BL.silenceMsOf(serverSetting('session.deadBridgeMinutes'));
      if (!base) return acted;
      const otel = getOtelIngest();
      for (const [id, s] of [...activeSessions]) {
        if (!s || !s.socketPath || !s.pty || s._bridgeCatchUp) continue;
        const silenceMs = Math.min(3600e3, base * 2 ** Math.min(5, s._bridgeEmptyHeals || 0));
        const t = now();
        if (t - Math.max(Number(s._lastPtyDataAt) || 0, startedAt) < silenceMs) continue;   // cheap: no stat for a talking session
        const bufMtimeMs = await statMtime(path.join(BUFFERS_DIR, id + '.buf'));
        const sid = s.claudeSessionId || s.backendSessionId || null;
        let lastApiAt = null; try { lastApiAt = sid ? otel?.lastApiRequestAt?.(sid) || null : null; } catch { }
        const v = BL.bridgeVerdict({ now: now(), silenceMs, lastByteAt: s._lastPtyDataAt, attachedAt: startedAt, bufMtimeMs, lastApiAt, heals: s._bridgeHeals });
        if (v.verdict === 'dead') { if (heal(id, s, v)) acted.push({ id, verdict: v }); }
        else if (v.verdict === 'budget') {
          const said = budgetSaid.get(id) || 0;
          if (now() - said >= BL.HEAL_WINDOW_MS) { budgetSaid.set(id, now()); try { log.warn?.(`[bridge] ${id}: still silent (${BL.verdictWords(v)}) after ${BL.HEAL_MAX} re-attaches this hour — not re-attaching again until the hour is over`); } catch { } }
        }
      }
    } finally { ticking = false; }
    return acted;
  }
  function start() {
    if (timer) return false;
    const arm = () => {
      const want = BL.tickMsOf(BL.silenceMsOf(serverSetting('session.deadBridgeMinutes')));
      if (want === tickMs && timer) return;
      if (timer) clearInterval(timer);
      tickMs = want;
      timer = setInterval(() => { tick().catch(() => { }); arm(); }, tickMs);
      timer.unref?.();
    };
    arm();
    return true;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { endAttachPtys, listOrphans, sweepOrphans, bootSweep, armCatchUp, afterReattach, heal, tick, start, stop };
}

module.exports = { create };
