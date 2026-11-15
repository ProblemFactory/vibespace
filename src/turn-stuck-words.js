'use strict';
// PURE (imports nothing; CJS) — THE WORDS OF A STUCK TURN (lane turn-never-silent, law L2 — the owner: «agy 动不动就卡住再也不动»).
// Every sentence is a fact the hub READ: nothing written by the CLI since an instant, whether anything below it worked, the
// open tool step's NAME, whether the CLI process is alive. Never a guess at why. Two states speak with different words
// (主开发's ruling Q1, 2026-11-15 02:55Z):
//  · «stuck on a command» — a tool step is open and nothing below the CLI is working: every door;
//  · «silent» — no tool step is open: «no output for N minutes; the CLI is running» — Keep waiting and Stop the turn only;
//  · «unknown» — its processes cannot be read on this machine: what is known, and the same two doors.
// The record keeps the English (UTC named); each viewer reads it through `i18n` (dictionary keys + params; an instant is a
// param `{at}` the client says in the viewer's own zone).

const TEXT = Object.freeze({
  command: 'Stuck on a command: {tool} has shown nothing since {since}, and nothing it started is working',
  silent: 'No output since {since}, and no command is open',
  unknown: 'No output since {since} — whether its processes are working cannot be read on this machine',
  // the headline says whether the CLI process runs (the pictures of 11-15: in the fold, nobody saw it) — one key per fact
  commandAlive: 'Stuck on a command: {tool} has shown nothing since {since}, and nothing it started is working — {cli} is running',
  commandGone: 'Stuck on a command: {tool} has shown nothing since {since}, and nothing it started is working — {cli} is not running',
  silentAlive: 'No output since {since}, and no command is open — {cli} is running',
  silentGone: 'No output since {since}, and no command is open — {cli} is not running',
});
const LINES = Object.freeze({
  alive: '{cli} is running.',
  gone: '{cli} is not running.',
  endAt: 'If nothing changes, the command is ended by itself at {endAt}.',
});
// L3: a restart of the CLI (Stop, steer) whose old process has not exited within its bound
const RESTART_TEXT = 'The old {cli} process has not exited since {since} (state {state}) — the next one waits for it';
const hhmm = (at) => { const d = new Date(Number(at)); return Number.isFinite(d.getTime()) && Number(at) > 0 ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''; };
const fill = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (x in p ? p[x] : m));   // ONE pass: a tool name holding «{since}» never corrupts it

/** the item's words for a speaking verdict (src/turn-liveness.js livenessVerdict) — {text, detail, i18n}; null for a state
 *  that does not speak. `cli` = the harness's label (Antigravity, Claude Code). */
function stuckWords(v, { cli = 'The CLI', endAt = 0 } = {}) {
  if (!v || !['stuck-on-command', 'silent', 'unknown'].includes(v.state)) return null;
  const known = v.cliAlive === true ? 'Alive' : v.cliAlive === false ? 'Gone' : '';
  const key = v.state === 'stuck-on-command' ? TEXT['command' + known] : v.state === 'silent' ? TEXT['silent' + known] : TEXT.unknown;
  const tool = String(v.tool || 'a tool').slice(0, 80);
  const since = Number(v.since) || 0;
  const text = fill(key, { tool, since: hhmm(since), cli: String(cli) });
  const line = null;   // the CLI's state is IN the headline now (LINES.alive / gone stay for an item filed before)
  const ends = v.state === 'stuck-on-command' && Number(endAt) > 0;
  const detail = [line ? fill(line, { cli: String(cli) }) : '', ends ? fill(LINES.endAt, { endAt: hhmm(endAt) }) : ''].filter(Boolean).join(' ');
  const i18n = {
    text: { key, params: { ...(v.state === 'stuck-on-command' ? { tool } : {}), ...(known ? { cli: String(cli) } : {}), since: { at: since } } },
    detail: [...(line ? [{ key: line, params: { cli: String(cli) } }] : []), ...(ends ? [{ key: LINES.endAt, params: { endAt: { at: Number(endAt) } } }] : [])],
  };
  return { text, detail, i18n };
}
/** L3: the item's words for a restart whose old process has not exited (the wrapper's sidecar `restartStuck`) */
function restartWords({ since, state }, { cli = 'The CLI' } = {}) {
  const p = { cli: String(cli), state: String(state || '?').slice(0, 2) };
  return { text: fill(RESTART_TEXT, { ...p, since: hhmm(since) }), detail: '', i18n: { text: { key: RESTART_TEXT, params: { ...p, since: { at: Number(since) || 0 } } }, detail: [] } };
}

module.exports = { TEXT, LINES, RESTART_TEXT, hhmm, stuckWords, restartWords };
