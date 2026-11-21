'use strict';
// THE START NAMES ITS PIPE (the separation, M1 — lane B, the B2b cure; 主开发 2026-11-18 00:02Z, law 1 AMENDED). The ONE
// reader of a start pipe, for both children the supervisor starts: the hub (src/server/hub-port.js) and the interface
// (src/interface/main.js).
// THE WORD: the supervisor — the one hand that passes the pipe — sets ONE word in the child's environment,
// VIBESPACE_START_FD=<n>, naming the descriptor the start pipe sits on (the way Node names its IPC channel in
// NODE_CHANNEL_FD, and socket activation its count in LISTEN_FDS). The word is part of the START: it is no setting,
// nothing stores it, no door edits it.
//   NO WORD  ⇒ no start pipe. No descriptor is looked at or read: in a process nobody passed anything to, descriptor 3 is
//              the runtime's own (its event poll, its ring, its own pipes, in an order one Node version picks), and a
//              parent may leave one there (socket activation hands its first exactly there).
//   THE WORD ⇒ the named descriptor IS the start pipe, or the start ends BY NAME in bounded time (each a `why` below):
//              the word names no descriptor · the descriptor is not open · it is no pipe or socket · no line inside
//              START_LINE_MS · the pipe ended before its first line. (A first line that is no start is judged by the
//              caller: each child knows its own start.)
// THE WORD GOES NO FURTHER: it is read once and DELETED from the environment it came in — by the hub at server.js line 5
// (hub-port.js claim), BEFORE its first child can be spawned — so no child of this process ever believes it has a start
// pipe; and it is on none of the three env lists (src/agent-env.js agentEnv / daemonEnv / serviceEnv) —
// scripts/test-hub-port.mjs ⑧ holds all three, each with a red control.
// The first line carries the start's secret: it is parsed here and NEVER echoed (no log line, no error text names it).
const fs = require('fs');
const net = require('net');

const START_WORD = 'VIBESPACE_START_FD';
const START_LINE_MS = 5000;
const MAX_START_LINE = 64 * 1024;   // a first line longer than this is no start (the bytes are not kept growing for 5 s)

/** a stream's FIRST line, bounded → Promise<{ first, rest, pipe } | { why, pipe }> — `first` the parsed JSON (null: not JSON),
 *  `rest` the bytes after it; the stream is left PAUSED with no listener of ours (the caller resumes it, or lets it be) */
function firstLine(pipe, { ms = START_LINE_MS } = {}) {
  return new Promise((resolve) => {
    let buf = '', settled = false;
    const done = (v) => {
      if (settled) return; settled = true; clearTimeout(timer);
      try { pipe.pause(); } catch { }
      pipe.removeListener('data', onData); pipe.removeListener('end', onEnd); pipe.removeListener('error', onFault);
      resolve({ ...v, pipe });
    };
    const onData = (chunk) => {
      // TWO BOUNDS: the clock (`ms`, the timer below) and the size (MAX_START_LINE); the newline is looked for in the NEW chunk
      // only — what came before held none
      const i = chunk.indexOf('\n');
      if (i < 0) { buf += chunk; if (buf.length > MAX_START_LINE) done({ first: null, rest: '' }); return; }
      const line = buf + chunk.slice(0, i);
      let first = null; try { first = JSON.parse(line); } catch { }   // never echoed: the line carries the secret
      done({ first, rest: chunk.slice(i + 1) });
    };
    const onEnd = () => done({ why: 'ended' });
    const onFault = (e) => done({ why: 'read-fault', code: (e && e.code) || 'error' });   // a READ FAULT, said as one with its code (never «ended»)
    const timer = setTimeout(() => done({ why: 'no-line', ms }), ms);
    try { pipe.setEncoding?.('utf8'); } catch { }
    pipe.on('data', onData); pipe.on('end', onEnd); pipe.on('error', onFault);
  });
}

/** the start word, TAKEN: read once and deleted from `env` (synchronous, no descriptor touched) → { word: false } |
 *  { word: true, raw, fd } (fd NaN when the word names no descriptor) */
function takeWord(env = process.env) {
  if (!env || env[START_WORD] === undefined) return { word: false };
  const raw = String(env[START_WORD]);
  delete env[START_WORD];
  return { word: true, raw, fd: /^[0-9]{1,4}$/.test(raw) ? Number(raw) : NaN };
}

/** the start the environment names → Promise<{ word: false } | { word: true, fd, why } | { word: true, fd, first, rest, pipe }>
 *  `taken` = a word already taken (takeWord) — else `env` loses it here (it goes no further); `fstat` is the suites' seam */
function openStart({ env = process.env, taken = null, ms = START_LINE_MS, fstat = fs.fstat } = {}) {
  const w = taken || takeWord(env);
  if (!w.word) return Promise.resolve({ word: false });
  const raw = w.raw, fd = w.fd;
  if (!(fd >= 3)) return Promise.resolve({ word: true, fd: null, raw: raw.slice(0, 16), why: 'no-descriptor' });   // 0–2 are stdio, never a start pipe
  return new Promise((resolve) => {
    fstat(fd, (err, st) => {
      if (err) return resolve({ word: true, fd, why: 'not-open' });
      if (!(st.isFIFO() || st.isSocket())) return resolve({ word: true, fd, why: 'not-a-pipe' });
      let pipe;
      try { pipe = new net.Socket({ fd, readable: true, writable: false }); } catch { return resolve({ word: true, fd, why: 'not-a-pipe' }); }
      firstLine(pipe, { ms }).then((r) => resolve({ word: true, fd, ...r }));
    });
  });
}

/** one log sentence for a start that ends (`s` from openStart / firstLine; `why` 'no-start' is the caller's) — never the line */
function whyText(s) {
  switch (s && s.why) {
    case 'no-descriptor': return `${START_WORD}=${JSON.stringify(s.raw || '')} names no descriptor`;
    case 'not-open': return `the start pipe (fd ${s.fd}) named by ${START_WORD} is not open`;
    case 'not-a-pipe': return `the start pipe (fd ${s.fd}) named by ${START_WORD} is no pipe or socket`;
    case 'no-line': return `no line on the start pipe${s.fd ? ` (fd ${s.fd})` : ''} within ${(s.ms || START_LINE_MS) / 1000} s`;
    case 'ended': return `the start pipe${s.fd ? ` (fd ${s.fd})` : ''} ended before its first line`;
    case 'read-fault': return `the start pipe${s.fd ? ` (fd ${s.fd})` : ''} could not be read (${s.code || 'error'})`;
    case 'no-start': return 'the start pipe\'s first line is no start';
    default: return 'the start is not readable';
  }
}

module.exports = { START_WORD, START_LINE_MS, MAX_START_LINE, takeWord, firstLine, openStart, whyText };
