'use strict';
/**
 * THE HOUR'S COUNTS (lane hub-loop-stalls, «loop-day-report» M5) — one process-wide tally the hot paths bump and the hourly
 * report takes: page-socket messages in / out (src/ws-handler.js), characters of conversation output handed to a parser
 * (src/server/stdout/index.js), conversation creates / resumes (src/ws-create.js), store writes handed to the writer thread
 * and the longest (src/store-writer.js). An increment is a property add — nothing here reads a clock, a file or a socket.
 * `take()` hands the hour's counts back and starts the next hour; `peek()` reads without resetting (the exit line).
 */
const NAMES = Object.freeze(['wsIn', 'wsOut', 'parsedChars', 'creates', 'resumes', 'writes']);
const MAXES = Object.freeze(['writeMaxMs']);
let c = fresh();
function fresh() { const o = {}; for (const n of NAMES) o[n] = 0; for (const n of MAXES) o[n] = null; return o; }
function inc(name, n = 1) { if (Object.prototype.hasOwnProperty.call(c, name) && Number.isFinite(n)) c[name] += n; }
function max(name, v) { if (MAXES.includes(name) && Number.isFinite(v) && (c[name] === null || v > c[name])) c[name] = v; }
function peek() { return { ...c }; }
function take() { const out = c; c = fresh(); return out; }
module.exports = { NAMES, MAXES, inc, max, peek, take };
