'use strict';
// AN NDJSON FILE READ BY ITS LINES IN BOUNDED READS (row B-360d, lane hub-loop-stalls — 主开发 r713 / r725). The OTel stash
// (data/usage-history/otel-truth.ndjson) was 476 631 564 bytes on the owner's hub on 2026-11-20. Its two readers each read it
// WHOLE: the ingest's replay at every start (ONE buffer, the file's size of memory at once) and the ledger backfill migration
// (ONE string: past the runtime's longest string, 536 870 888 characters, that read throws and its catch answered «no stash»).
// Here a file is read through ONE descriptor in reads of at most READ_BYTES; a line cut by a read's end is carried to the next
// read; nothing larger than a read (and the one line it carries) is ever held. Two drivers over ONE scan:
//   · eachLine(fh, onLine, opts) — ASYNC, for the hub's loop: `turn()` after every read (never on the tick the read resolved
//     on) and between slices of lines (`sliceMs` of the real clock, checked every 256 lines);
//   · eachLineSync(fd, onLine, opts) — SYNCHRONOUS, for a migration's own pass: the same reads, the same lines, no turns.
// onLine(buf, a, nl, at): ONE non-empty line, the bytes [a, nl) of `buf` (valid only during the call; the newline excluded) and
// its offset in the file, `at`. A last line with no newline is a line too. A line longer than a read (no newline inside
// `maxLine` bytes) is skipped whole and COUNTED, never grown into one allocation. A read that fails THROWS: the caller says
// what that means (never «empty»). → {bytes, lines, long}: the bytes read (the file's size as the read saw it), the lines
// handed, the long lines skipped. SHARED by src/server/otel-ingest.js and src/ledger-slot-backfill.js.
const READ_BYTES = 4 * 1024 * 1024;
const defaultTurn = () => new Promise((r) => setImmediate(() => setImmediate(r)));   // past the next timers phase

/** the lines of buf[a, end) (+ the unterminated last one at `eof`) until `stop()` asks for a turn (asked every 256 lines) →
 *  the offset to go on from (≥ end when every byte is taken; the start of a cut line otherwise) */
function scan(buf, a, end, eof, base, onLine, stop, st) {
  for (let n = 1; a < end; n++) {
    if (stop && (n & 255) === 0 && stop()) return a;
    let nl = buf.indexOf(10, a);
    if (nl < 0 || nl >= end) { if (!eof) return a; nl = end; }
    if (nl > a) { st.lines++; onLine(buf, a, nl, base + a); }
    a = nl + 1;
  }
  return a;
}
/** after a scan stopped at a cut line: the cut bytes move to the buffer's start (the next read lands after them); a cut line
 *  that fills the whole buffer is a LONG line — dropped, and the reads skip on to its newline */
function carry(c, a, end) {
  if (a > end) a = end;
  const have = end - a;
  if (have >= c.maxLine) { c.skipping = true; c.st.long++; c.base += end; c.have = 0; return; }
  if (a > 0 && have) c.buf.copy(c.buf, 0, a, end);
  c.base += a; c.have = have;
}
/** a long line's remaining bytes: up to its newline (that newline ends it) → the offset of the next line, or -1: still inside it */
function skipLong(c, end) {
  const nl = c.buf.indexOf(10, 0);
  if (nl < 0 || nl >= end) { c.base += end; c.have = 0; return -1; }
  c.skipping = false;
  return nl + 1;
}
/** the reader's state: ONE buffer that holds a read and the line it carries (max(readBytes, maxLine)); each read asks at most
 *  readBytes; a carried line of maxLine bytes or more is a LONG line */
const state = (readBytes, maxLine) => ({ buf: Buffer.allocUnsafe(Math.max(64, readBytes, maxLine)), readBytes: Math.max(1, readBytes), maxLine: Math.max(1, maxLine), have: 0, base: 0, pos: 0, skipping: false, st: { bytes: 0, lines: 0, long: 0 } });
const roomOf = (c) => Math.min(c.readBytes, c.buf.length - c.have);

/** ASYNC: every line of the file behind FileHandle `fh`, from offset 0 to the first read that answers nothing */
async function eachLine(fh, onLine, { readBytes = READ_BYTES, maxLine = READ_BYTES, sliceMs = 20, turn = defaultTurn } = {}) {
  const c = state(readBytes, maxLine);
  for (;;) {
    const { bytesRead } = await fh.read(c.buf, c.have, roomOf(c), c.pos);
    c.pos += bytesRead; c.st.bytes = c.pos;
    const end = c.have + bytesRead, eof = bytesRead === 0;
    await turn();
    let a = 0;
    if (c.skipping && (a = skipLong(c, end)) < 0) { if (eof) return c.st; continue; }
    for (;;) {
      let until = performance.now() + sliceMs, asked = false;
      a = scan(c.buf, a, end, eof, c.base, onLine, () => (performance.now() >= until ? (asked = true) : false), c.st);
      if (!asked) break;
      await turn();
    }
    if (eof) return c.st;
    carry(c, a, end);
  }
}
/** SYNCHRONOUS: the same lines through descriptor `fd` (fs.readSync), no turns — for a pass that is already its own step */
function eachLineSync(fd, onLine, { readBytes = READ_BYTES, maxLine = READ_BYTES, fs = require('fs') } = {}) {
  const c = state(readBytes, maxLine);
  for (;;) {
    const bytesRead = fs.readSync(fd, c.buf, c.have, roomOf(c), c.pos);
    c.pos += bytesRead; c.st.bytes = c.pos;
    const end = c.have + bytesRead, eof = bytesRead === 0;
    let a = 0;
    if (c.skipping && (a = skipLong(c, end)) < 0) { if (eof) return c.st; continue; }
    a = scan(c.buf, a, end, eof, c.base, onLine, null, c.st);
    if (eof) return c.st;
    carry(c, a, end);
  }
}

module.exports = { eachLine, eachLineSync, READ_BYTES };
