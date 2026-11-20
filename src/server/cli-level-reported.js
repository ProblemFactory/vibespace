'use strict';
/**
 * src/server/cli-level-reported.js — ORCH: WHAT A PAIRED MACHINE READ OF ITS OWN CLAUDE CODE (row B-24e2, lane login-request-card,
 * 2026-11-20; the shape TAKEN by 主开发 12:22Z). A conversation's background tasks are «unknown» on a build above the measured span
 * until that build's binary was read for the background signal; the hub reads only its OWN binary (src/server/cli-model-catalog.js),
 * so on a paired machine whose Claude Code is ahead of it the wait had no end and an automation grant's end refused its idle
 * conversations. Now the machine reads its own binary (src/machine-probes.js cliLevel, behind `probe-cli` — no new op) and the hub
 * keeps the verdict BY VERSION, with the machine that said it: one machine's read serves every conversation on that build.
 *
 *   boot({dataDir, log, writer})  — the store data/cli-level-reported.json loaded (small, own data); the writer = the store writer
 *   levelOf(version)              → {declared, by, at} | null — a machine's verdict (cli-model-catalog levelSignalOf asks it after its own)
 *   note(version, level, by)      → true when kept: only a WHOLE read's verdict ({declared:true} or {declared:false, whole:true})
 *   want(version, hostId, ask)    — a facts read of a paired conversation above the span whose build is unread: ONE ask per (machine,
 *                                   version) in flight, on the schedule ASK_STEPS_MS while the machine answers «reading»; every end is
 *                                   SAID once by name (read / cut — with when it is read again / still reading / an older agent / failed)
 *   asking(version, hostId)       → true while an ask is in flight (the facts' words: «it is being read on its machine now»)
 *
 * LAWS (主开发 12:22Z): a CUT read ends the ask at once by name (the machine remembers it, an hour); an ask whose LINK drops ends and
 * the next facts read asks again (a pause, never a wait on a dead link); the store is written through the store writer (atomic, off
 * the loop), bounded at KEEP versions, the oldest leaving; a hub restart keeps what the machines reported.
 */
const fs = require('fs');
const path = require('path');

const FILE = 'cli-level-reported.json';
const KEEP = 20;
const ASK_STEPS_MS = [5e3, 15e3, 45e3];   // while the machine answers «reading»: asked again after each, then ended by name
const PAUSE_MS = { failed: 10e3, reading: 60e3, old: 3600e3, offline: 10e3 };   // after an end: no ask for (machine, version) before this
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;

const st = { dataDir: null, reported: {}, held: null, writer: null, log: () => { }, asks: new Map(), paused: new Map(), said: new Set(), ends: new Map(),
  clock: { now: () => Date.now(), setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, clearTimeout: (t) => clearTimeout(t) } };

const isRow = (r) => !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.declared === 'boolean' && (r.by === null || typeof r.by === 'object') && typeof r.at === 'string';
function readStore() {   // → {versions} | null (no such file) | {failed: code}
  let text;
  try { text = fs.readFileSync(path.join(st.dataDir, FILE), 'utf8'); } catch (e) { return e && e.code === 'ENOENT' ? null : { failed: (e && e.code) || 'read-failed' }; }   // own data, a few hundred bytes
  let j = null; try { j = JSON.parse(text); } catch { return { failed: 'damaged' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || j.schema !== 1 || !j.versions || typeof j.versions !== 'object') return { failed: 'damaged' };
  const out = {};
  for (const [v, r] of Object.entries(j.versions)) if (v !== '__proto__' && VERSION.test(v) && isRow(r)) out[v] = { declared: r.declared, by: r.by || null, at: r.at };
  return { versions: out };
}
function boot({ dataDir = null, log = null, writer = null, clock = null } = {}) {
  st.dataDir = dataDir; st.writer = writer; if (log) st.log = log; if (clock) st.clock = { ...st.clock, ...clock };
  st.reported = {}; st.held = null;
  if (!dataDir) return;
  const r = readStore();
  // THE STORE-READ LAW (round wwf11hqbh (4)): a read that FAILED (not «no such file») is HELD — nothing is written over it until a
  // read succeeds (the save asks again); what was kept there is never lost to an empty start
  if (r && r.failed) { st.held = r.failed; st.log(`[cli-level] data/${FILE} could not be read (${r.failed}) — it is held, nothing is written over it until a read succeeds`); return; }
  if (r) st.reported = r.versions;
}
function trim() {   // ≤ KEEP versions, the oldest leaving — in memory too, whatever the save then does (wr3vak19m (2))
  const ks = Object.keys(st.reported);
  if (ks.length > KEEP) for (const k of ks.sort((a, b) => st.reported[a].at.localeCompare(st.reported[b].at)).slice(0, ks.length - KEEP)) delete st.reported[k];
}
function save() {
  trim();
  if (!st.dataDir) return;
  if (st.held) {
    const r = readStore();
    if (r && r.failed) return;   // still held: said once at boot
    st.reported = { ...((r && r.versions) || {}), ...st.reported }; st.held = null;   // the file read at last: what it kept, then what came since
  }
  trim();   // the held store's merge too (round wiqep65pr (5))
  const w = st.writer || require('../store-writer.js').storeWriter();
  try { w.dirty(path.join(st.dataDir, FILE), { name: 'cli-level-reported.write', produce: () => JSON.stringify({ schema: 1, versions: st.reported }) }); }
  catch (e) { st.log(`[cli-level] the reported verdicts could not be written (${(e && (e.code || e.message)) || e}) — they stay in force until the next start`); }
}
function levelOf(version) { const r = typeof version === 'string' ? st.reported[version] : null; return r ? { ...r } : null; }
function note(version, level, by = null) {
  if (typeof version !== 'string' || !VERSION.test(version) || !level || typeof level !== 'object') return false;
  if (!(level.declared === true || (level.declared === false && level.whole === true))) return false;   // a «not found» in bytes not all read says nothing
  st.reported[version] = { declared: level.declared === true, by: by && typeof by === 'object' ? { host: by.host || null, name: by.name || null } : null, at: new Date(st.clock.now()).toISOString() };
  save();
  return true;
}
const keyOf = (version, hostId) => `${hostId}|${version}`;
function asking(version, hostId) { return st.asks.has(keyOf(version, hostId)); }
/** the last END of an ask for (machine, version), while its pause lasts — the words a refused end says (round wwf11hqbh (5)):
 *  → {kind: 'old' | 'cut' | 'gone' | 'offline' | 'reading' | 'failed', retryAt?, read?} | null */
function endOf(version, hostId) { const k = keyOf(version, hostId), e = st.ends.get(k); return e && (st.paused.get(k) || 0) > st.clock.now() ? { ...e } : null; }
function sayOnce(k, line) { if (st.said.has(k)) return; st.said.add(k); if (st.said.size > 200) st.said.delete(st.said.values().next().value); st.log(line); }
/** an ask's END: said ONCE by name per (machine, version, kind), and a pause before (machine, version) is asked again */
function end(k, kind, line, pause, extra = {}) {
  const a = st.asks.get(k); if (a && a.timer) st.clock.clearTimeout(a.timer); st.asks.delete(k);
  if (line) sayOnce(`${k}|${kind}`, line);
  if (pause) { st.paused.set(k, st.clock.now() + pause); st.ends.set(k, { kind, ...extra }); } else st.ends.delete(k);
  if (st.ends.size > 400) st.ends.delete(st.ends.keys().next().value);
}
function want(version, hostId, ask, { nameOf = () => null } = {}) {
  if (typeof version !== 'string' || !VERSION.test(version) || !hostId || typeof ask !== 'function') return;
  if (st.reported[version]) return;
  const k = keyOf(version, hostId);
  if (st.asks.has(k) || (st.paused.get(k) || 0) > st.clock.now()) return;
  const name = () => { let n = null; try { n = nameOf(hostId); } catch { n = null; } return n || null; };
  const who = () => (name() ? `«${name()}»` : hostId);
  const a = { step: 0, timer: null };
  st.asks.set(k, a);
  const once = () => {
    Promise.resolve().then(() => ask(hostId, version)).then((lv) => {
      if (st.asks.get(k) !== a) return;   // ended meanwhile
      if (!lv || typeof lv !== 'object') return end(k, 'old', `[cli-level] ${who()}: its device agent is older — it cannot read its own Claude Code for the background signal; ${version}'s background stays unknown there until the agent is updated`, PAUSE_MS.old);
      if (lv.state === 'offline') return end(k, 'offline', null, PAUSE_MS.offline);   // a quiet skip until its next connect (a list never connects)
      if (lv.state === 'read' && lv.version === version) {
        const kept = note(version, lv, { host: hostId, name: name() });
        return end(k, 'read', `[cli-level] ${who()}: its Claude Code ${version} ${lv.declared ? 'DECLARES' : 'does not declare'} the background signal (read on that machine${kept ? '' : ' — not kept: the read was not whole'})`, 0);
      }
      // NEVER A VERDICT UNDER A VERSION THE MACHINE DID NOT READ FOR THAT CONVERSATION (round wwf11hqbh, the must): a read that names
      // another build (an older agent reads its PATH's program), or none, or the build's own file gone — ended BY NAME, the hour's pause
      if (lv.unnamed === true) return end(k, 'unnamed', `[cli-level] ${who()}: the file read for its Claude Code ${version} names no build — its background stays unknown`, PAUSE_MS.old);   // (2)
      if (lv.state === 'none') return end(k, 'none', `[cli-level] ${who()}: no Claude Code program was found there for ${version} (none on its agent's PATH, no process started from it) — its background stays unknown`, PAUSE_MS.old);   // (1)
      if (lv.state === 'read' || lv.state === 'gone') return end(k, 'gone', `[cli-level] ${who()}: that build (${version}) is no longer on the machine${lv.read || (lv.state === 'read' && lv.version) ? ` (its program reads ${lv.read || lv.version})` : ''} — its background stays unknown`, PAUSE_MS.old, { read: lv.read || lv.version || null });
      if (lv.state === 'cut') return end(k, 'cut', `[cli-level] ${who()}: its Claude Code ${version} could not be read whole for the background signal (${String(lv.why || 'cut').slice(0, 80)}) — it is read again ${Number(lv.retryAt) ? 'after ' + new Date(Number(lv.retryAt)).toISOString() : 'later'}`, Math.max(PAUSE_MS.failed, (Number(lv.retryAt) || 0) - st.clock.now()), { retryAt: Number(lv.retryAt) || null });
      if (lv.state === 'reading' && a.step < ASK_STEPS_MS.length) { a.timer = st.clock.setTimeout(once, ASK_STEPS_MS[a.step++]); return; }
      if (lv.state === 'reading') return end(k, 'reading', `[cli-level] ${who()}: its Claude Code ${version} was still being read for the background signal after ${ASK_STEPS_MS.reduce((x, y) => x + y, 0) / 1000} s — asked again at a later facts read`, PAUSE_MS.reading);
      return end(k, 'gone', `[cli-level] ${who()}: its Claude Code ${version} has no program to read (${String(lv.state).slice(0, 40)})`, PAUSE_MS.old);
    }, (e) => {
      // THE LINK DROPPED (or the ask failed): the ask ends — the next facts read after the pause asks again, never a wait on a dead link
      if (st.asks.get(k) === a) end(k, 'failed', `[cli-level] ${who()}: the ask for its Claude Code ${version}'s background signal ended (${String((e && (e.code || e.message)) || e).slice(0, 120)}) — asked again at the next facts read`, PAUSE_MS.failed);
    });
  };
  once();
}
/** THE DOOR, judged before any ask (round wiqep65pr): `hosts`'s machine `hostId` → 'ok' | 'unpaired' (no longer in the list) |
 *  'offline' (its link is down: a list never connects) | 'old' (its agent does not advertise «cli-level» in the hello it sent — read
 *  off the link in memory, no call). Synchronous. */
function linkOf(hosts, hostId) {
  // (wr3vak19m (6)) a machine that is no longer in the list is said as that — never «not connected» by its raw id (a HELD list throws:
  // unknown, read as not connected until it reads)
  let known = true; try { known = !(hosts && typeof hosts.get === 'function') || !!hosts.get(hostId); } catch { known = true; }
  if (!known) return 'unpaired';
  let dm = null; try { dm = hosts && typeof hosts.connectedDevice === 'function' ? hosts.connectedDevice(hostId) : null; } catch { dm = null; }
  if (!dm) return 'offline';
  // (wr3vak19m (1)) the hello off the link — memory only, never status() (it evaluates the socket path's witness on the loop)
  let caps = []; try { const i = typeof dm.helloInfo === 'function' ? dm.helloInfo() : null; caps = i && Array.isArray(i.capabilities) ? i.capabilities : []; } catch { caps = []; }
  return caps.includes('cli-level') ? 'ok' : 'old';
}
/** the door's state said ONCE in the journal by name (the words carry it at every read) */
function sayDoor(version, hostId, link, name) {
  const who = name ? `«${name}»` : hostId;
  if (link === 'old') sayOnce(`${keyOf(version, hostId)}|old`, `[cli-level] ${who}: its device agent is older — it cannot read its own Claude Code for the background signal; ${version}'s background stays unknown there until the agent is updated`);
}
/** tests only: a fresh process (the store stays on disk) */
function _reset() { for (const a of st.asks.values()) if (a.timer) st.clock.clearTimeout(a.timer); st.asks.clear(); st.paused.clear(); st.said.clear(); st.ends.clear(); st.reported = {}; st.held = null; st.dataDir = null; st.writer = null; }

module.exports = { boot, levelOf, note, want, asking, endOf, linkOf, sayDoor, FILE, KEEP, ASK_STEPS_MS, PAUSE_MS, _reset };
