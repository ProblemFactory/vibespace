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

// THE LOOK AT 99f65d547 (主开发 07:49Z), pictures P1 + P2: the headline names WHAT runs — the tool and the command's first
// words (`{what}`) — and says, where it is seen (never in a fold), what happens if nothing is pressed and when (`{then}`):
// «it is ended by itself at HH:MM», «VibeSpace does not end it by itself», or law 3's «there is nothing to end».
const TEXT = Object.freeze({
  // the tool alone (no command words) or the tool AND its command's first words (`cmd*`) — a key each, so each language sets its own spacing
  command: 'Stuck on a command: {tool} has shown nothing since {since}, and nothing it started is working. {then}',
  cmd: 'Stuck on a command: {tool} «{cmd}» has shown nothing since {since}, and nothing it started is working. {then}',
  cmdAlive: 'Stuck on a command: {tool} «{cmd}» has shown nothing since {since}, and nothing it started is working — {cli} is running. {then}',
  cmdGone: 'Stuck on a command: {tool} «{cmd}» has shown nothing since {since}, and nothing it started is working — {cli} is not running. {then}',
  silent: 'No output since {since}, and no command is open. {then}',
  unknown: 'No output since {since} — whether its processes are working cannot be read on this machine. {then}',
  // the headline says whether the CLI process runs (the pictures of 11-15: in the fold, nobody saw it) — one key per fact
  commandAlive: 'Stuck on a command: {tool} has shown nothing since {since}, and nothing it started is working — {cli} is running. {then}',
  commandGone: 'Stuck on a command: {tool} has shown nothing since {since}, and nothing it started is working — {cli} is not running. {then}',
  silentAlive: 'No output since {since}, and no command is open — {cli} is running. {then}',
  silentGone: 'No output since {since}, and no command is open — {cli} is not running. {then}',
});
const THEN = Object.freeze({
  // an INSTANT CLAUSE (the For-you renderer's `{at, key, gone}`): its clock in the viewer's zone while it is ahead, `gone` after
  endAt: 'If nothing changes, the command is ended by itself at {time}.',
  endingNow: 'If nothing changes, the command is ended by itself at the next reading.',
  notByItself: 'VibeSpace does not end it by itself.',
  nothingToEnd: 'There is nothing to end: {cli} itself waits on a step with no command running.',
});
const CMD_MAX = 60;
/** the command's first words, as a param (escaped where it is drawn — the client's text nodes): its first line, control
 *  characters out, spaces collapsed, at most CMD_MAX characters (a cut is said with «…») */
function cmdWords(cmd) {
  const line = String(cmd == null ? '' : Array.isArray(cmd) ? cmd.join(' ') : cmd).split(/\r?\n/).find((l) => l.trim()) || '';
  const flat = line.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > CMD_MAX ? flat.slice(0, CMD_MAX - 1).trimEnd() + '…' : flat;
}
// L3: a restart of the CLI (Stop, steer) whose old process has not exited within its bound
const RESTART_TEXT = 'The old {cli} process has not exited since {since} (state {state}) — the next one waits for it';
const hhmm = (at) => { const d = new Date(Number(at)); return Number.isFinite(d.getTime()) && Number(at) > 0 ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''; };
const fill = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (x in p ? p[x] : m));   // ONE pass: a tool name holding «{since}» never corrupts it

/** the item's words for a speaking verdict (src/turn-liveness.js livenessVerdict, or the state an item carried across a gap
 *  says — speakingStateOf) — {text, detail, i18n}; null for a state that does not speak. `cli` = the harness's label;
 *  `endAt` = the instant the by-itself ending acts (0 = it does not); `nothingToEnd` = law 3 (a step open, nothing below);
 *  `kept` = the person chose to wait: the headline states no time (the kept card's own line says the next one — one time
 *  per card, the one that is true). */
function stuckWords(v, { cli = 'The CLI', endAt = 0, nothingToEnd = false, kept = false } = {}) {
  if (!v || !['stuck-on-command', 'silent', 'unknown'].includes(v.state)) return null;
  const known = v.cliAlive === true ? 'Alive' : v.cliAlive === false ? 'Gone' : '';
  const tool = String(v.tool || 'a tool').slice(0, 80);
  const cmd = v.state === 'stuck-on-command' ? cmdWords(v.cmd) : '';
  const key = v.state === 'stuck-on-command' ? TEXT[(cmd ? 'cmd' : 'command') + known] : v.state === 'silent' ? TEXT['silent' + known] : TEXT.unknown;
  const since = Number(v.since) || 0;
  const ends = v.state === 'stuck-on-command' && !nothingToEnd && Number(endAt) > 0;
  const thenKey = v.state === 'stuck-on-command' && nothingToEnd ? THEN.nothingToEnd : ends ? THEN.endAt : THEN.notByItself;
  const then = kept ? '' : thenKey === THEN.nothingToEnd ? { key: thenKey, params: { cli: String(cli) } } : ends ? { at: Number(endAt), key: thenKey, gone: THEN.endingNow } : { key: thenKey };
  const thenText = kept ? '' : fill(thenKey, thenKey === THEN.nothingToEnd ? { cli: String(cli) } : ends ? { time: hhmm(endAt) } : {});
  const text = fill(key, { tool, cmd, since: hhmm(since), cli: String(cli), then: thenText }).trim();
  const i18n = {
    text: { key, params: { ...(v.state === 'stuck-on-command' ? { tool, ...(cmd ? { cmd } : {}) } : {}), ...(known ? { cli: String(cli) } : {}), since: { at: since }, then } },
    detail: [],
  };
  return { text, detail: '', i18n };
}
/** L3: the item's words for a restart whose old process has not exited (the wrapper's sidecar `restartStuck`) */
function restartWords({ since, state }, { cli = 'The CLI' } = {}) {
  const p = { cli: String(cli), state: String(state || '?').slice(0, 2) };
  return { text: fill(RESTART_TEXT, { ...p, since: hhmm(since) }), detail: '', i18n: { text: { key: RESTART_TEXT, params: { ...p, since: { at: Number(since) || 0 } } }, detail: [] } };
}

module.exports = { TEXT, THEN, CMD_MAX, RESTART_TEXT, hhmm, cmdWords, stuckWords, restartWords };
