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
const PAUSE_MS = { failed: 10e3, reading: 60e3, old: 3600e3 };   // after an end: no ask for (machine, version) before this
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;

const st = { dataDir: null, reported: {}, writer: null, log: () => { }, asks: new Map(), paused: new Map(), said: new Set(),
  clock: { now: () => Date.now(), setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, clearTimeout: (t) => clearTimeout(t) } };

const isRow = (r) => !!r && typeof r === 'object' && !Array.isArray(r) && typeof r.declared === 'boolean' && (r.by === null || typeof r.by === 'object') && typeof r.at === 'string';
function boot({ dataDir = null, log = null, writer = null, clock = null } = {}) {
  st.dataDir = dataDir; st.writer = writer; if (log) st.log = log; if (clock) st.clock = { ...st.clock, ...clock };
  st.reported = {};
  if (!dataDir) return;
  let j = null;
  try { j = JSON.parse(fs.readFileSync(path.join(dataDir, FILE), 'utf8')); } catch { j = null; }   // own data, a few hundred bytes
  if (j && typeof j === 'object' && !Array.isArray(j) && j.schema === 1 && j.versions && typeof j.versions === 'object') {
    for (const [v, r] of Object.entries(j.versions)) if (v !== '__proto__' && VERSION.test(v) && isRow(r)) st.reported[v] = { declared: r.declared, by: r.by || null, at: r.at };
  }
}
function save() {
  if (!st.dataDir) return;
  const w = st.writer || require('../store-writer.js').storeWriter();
  try { w.dirty(path.join(st.dataDir, FILE), { name: 'cli-level-reported.write', produce: () => JSON.stringify({ schema: 1, versions: st.reported }) }); }
  catch (e) { st.log(`[cli-level] the reported verdicts could not be written (${(e && (e.code || e.message)) || e}) — they stay in force until the next start`); }
}
function levelOf(version) { const r = typeof version === 'string' ? st.reported[version] : null; return r ? { ...r } : null; }
function note(version, level, by = null) {
  if (typeof version !== 'string' || !VERSION.test(version) || !level || typeof level !== 'object') return false;
  if (!(level.declared === true || (level.declared === false && level.whole === true))) return false;   // a «not found» in bytes not all read says nothing
  st.reported[version] = { declared: level.declared === true, by: by && typeof by === 'object' ? { host: by.host || null, name: by.name || null } : null, at: new Date(st.clock.now()).toISOString() };
  const ks = Object.keys(st.reported);
  if (ks.length > KEEP) for (const k of ks.sort((a, b) => st.reported[a].at.localeCompare(st.reported[b].at)).slice(0, ks.length - KEEP)) delete st.reported[k];
  save();
  return true;
}
const keyOf = (version, hostId) => `${hostId}|${version}`;
function asking(version, hostId) { return st.asks.has(keyOf(version, hostId)); }
function sayOnce(k, line) { if (st.said.has(k)) return; st.said.add(k); if (st.said.size > 200) st.said.delete(st.said.values().next().value); st.log(line); }
/** an ask's END: said by name, and a pause before (machine, version) is asked again */
function end(k, line, pause) { const a = st.asks.get(k); if (a && a.timer) st.clock.clearTimeout(a.timer); st.asks.delete(k); if (line) st.log(line); if (pause) st.paused.set(k, st.clock.now() + pause); }
function want(version, hostId, ask, { nameOf = () => null } = {}) {
  if (typeof version !== 'string' || !VERSION.test(version) || !hostId || typeof ask !== 'function') return;
  if (st.reported[version]) return;
  const k = keyOf(version, hostId);
  if (st.asks.has(k) || (st.paused.get(k) || 0) > st.clock.now()) return;
  const who = () => { let n = null; try { n = nameOf(hostId); } catch { n = null; } return n ? `«${n}»` : hostId; };
  const a = { step: 0, timer: null };
  st.asks.set(k, a);
  const once = () => {
    Promise.resolve().then(() => ask(hostId)).then((lv) => {
      if (st.asks.get(k) !== a) return;   // ended meanwhile
      if (!lv || typeof lv !== 'object') return end(k, null, PAUSE_MS.old) || sayOnce(`old|${hostId}`, `[cli-level] ${who()}: its device agent predates the read of its own Claude Code for the background signal — ${version}'s background stays unknown there until the agent is updated`);
      if (lv.state === 'read') {
        const v = lv.version && VERSION.test(lv.version) ? lv.version : version;
        const kept = note(v, lv, { host: hostId, name: (() => { try { return nameOf(hostId) || null; } catch { return null; } })() });
        return end(k, `[cli-level] ${who()}: its Claude Code ${v} ${lv.declared ? 'DECLARES' : 'does not declare'} the background signal (read on that machine${kept ? '' : ' — not kept: the read was not whole'})`, v === version ? 0 : PAUSE_MS.reading);
      }
      if (lv.state === 'cut') return end(k, `[cli-level] ${who()}: its Claude Code ${version} could not be read whole for the background signal (${String(lv.why || 'cut').slice(0, 80)}) — it is read again ${Number(lv.retryAt) ? 'after ' + new Date(Number(lv.retryAt)).toISOString() : 'later'}`, Math.max(PAUSE_MS.failed, (Number(lv.retryAt) || 0) - st.clock.now()));
      if (lv.state === 'reading' && a.step < ASK_STEPS_MS.length) { a.timer = st.clock.setTimeout(once, ASK_STEPS_MS[a.step++]); return; }
      if (lv.state === 'reading') return end(k, `[cli-level] ${who()}: its Claude Code ${version} was still being read for the background signal after ${ASK_STEPS_MS.reduce((x, y) => x + y, 0) / 1000} s — asked again at a later facts read`, PAUSE_MS.reading);
      return end(k, `[cli-level] ${who()}: its Claude Code ${version} has no binary to read (${String(lv.state).slice(0, 40)})`, PAUSE_MS.old);
    }, (e) => {
      // THE LINK DROPPED (or the ask failed): the ask ends — the next facts read after the pause asks again, never a wait on a dead link
      if (st.asks.get(k) === a) end(k, `[cli-level] ${who()}: the ask for its Claude Code ${version}'s background signal ended (${String((e && (e.code || e.message)) || e).slice(0, 120)}) — asked again at the next facts read`, PAUSE_MS.failed);
    });
  };
  once();
}
/** tests only: a fresh process (the store stays on disk) */
function _reset() { for (const a of st.asks.values()) if (a.timer) st.clock.clearTimeout(a.timer); st.asks.clear(); st.paused.clear(); st.said.clear(); st.reported = {}; st.dataDir = null; st.writer = null; }

module.exports = { boot, levelOf, note, want, asking, FILE, KEEP, ASK_STEPS_MS, PAUSE_MS, _reset };
