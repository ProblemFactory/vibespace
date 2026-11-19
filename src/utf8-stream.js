'use strict';
// B-b968 (after B-5019): A BYTE STREAM THAT ARRIVES IN FRAMES IS DECODED AS ONE STREAM. A frame — a link frame, a read chunk of
// a file still being written — may end inside a multi-byte UTF-8 character (a zh / ja character is three bytes, an emoji
// four); decoded frame by frame, both halves became U+FFFD. ONE decoder per stream keeps the cut bytes until the rest arrives:
// a frame that ends inside a character hands on only what is whole (nothing at all for a frame of one partial character); a
// stray lead byte is held until the next frame and handed on then as U+FFFD; a leading byte-order mark is kept (ignoreBOM),
// as the per-frame decode kept it. PURE (the global TextDecoder; no require): this machine's re-attached terminal (src/server/
// dial-pairing.js daemonPtyShim — a session re-attached through the hub's own agent) and its pipe sessions (src/pty-duck.js
// pipePtyShim), the device's pty INPUT (src/agentd/pty-input.js) and every device's chat tail read edge (src/agentd/agentd.js
// session-events-watch) read this ONE rule.

/** → (buf) => void: decode `buf` as the NEXT bytes of one byte stream and hand `write` only whole characters. A string is
 *  handed on as it is (a caller that already holds text). */
function utf8Stream(write) {
  const dec = new TextDecoder('utf-8', { ignoreBOM: true });
  return (buf) => { const s = typeof buf === 'string' ? buf : dec.decode(buf, { stream: true }); if (s) write(s); };
}

module.exports = { utf8Stream };
