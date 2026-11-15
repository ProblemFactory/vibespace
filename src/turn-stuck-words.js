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
});
const LINES = Object.freeze({
  alive: '{cli} is running.',
  gone: '{cli} is not running.',
});
const hhmm = (at) => { const d = new Date(Number(at)); return Number.isFinite(d.getTime()) && Number(at) > 0 ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''; };
const fill = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (x in p ? p[x] : m));   // ONE pass: a tool name holding «{since}» never corrupts it

/** the item's words for a speaking verdict (src/turn-liveness.js livenessVerdict) — {text, detail, i18n}; null for a state
 *  that does not speak. `cli` = the harness's label (Antigravity, Claude Code). */
function stuckWords(v, { cli = 'The CLI' } = {}) {
  if (!v || !['stuck-on-command', 'silent', 'unknown'].includes(v.state)) return null;
  const key = v.state === 'stuck-on-command' ? TEXT.command : v.state === 'silent' ? TEXT.silent : TEXT.unknown;
  const tool = String(v.tool || 'a tool').slice(0, 80);
  const since = Number(v.since) || 0;
  const text = fill(key, { tool, since: hhmm(since) });
  const line = v.cliAlive === false ? LINES.gone : v.cliAlive === true ? LINES.alive : null;
  const detail = line ? fill(line, { cli: String(cli) }) : '';
  const i18n = {
    text: { key, params: { ...(v.state === 'stuck-on-command' ? { tool } : {}), since: { at: since } } },
    detail: line ? [{ key: line, params: { cli: String(cli) } }] : [],
  };
  return { text, detail, i18n };
}

module.exports = { TEXT, LINES, hhmm, stuckWords };
