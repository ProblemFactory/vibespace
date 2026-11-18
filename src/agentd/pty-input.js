'use strict';
// B-5019: the device's PTY INPUT. The link delivers a person's keystrokes (and a pasted text) as FRAMES, and a frame may end in
// the middle of a multi-byte UTF-8 character — a zh / ja character is three bytes. Decoded frame by frame, both halves of it
// became U+FFFD in the terminal. ONE decoder per pty session keeps the cut bytes until the rest arrives; a frame that ends
// inside a character writes only what is whole (nothing at all for a frame of one partial character). A stray lead byte
// (an 8-bit Meta key, a non-UTF-8 sender) is held until the next frame and then written as U+FFFD — the release wrote it at
// once; the 1–3 bytes held when a session ends are dropped (no dec.end(): nothing reads a dead pty). DEVICE tier (the
// daemon bundle); requires nothing of ours.
const { StringDecoder } = require('string_decoder');

/** → (buf) => void: decode `buf` as the NEXT bytes of one byte stream and hand `write` only whole characters. */
function ptyInput(write) {
  const dec = new StringDecoder('utf8');
  return (buf) => { const s = dec.write(buf); if (s) write(s); };
}

module.exports = { ptyInput };
