#!/usr/bin/env node
// B-5019 — THE DEVICE'S PTY INPUT DECODES ONE STREAM, NOT EACH FRAME. src/agentd/agentd.js wrote every input frame of a pty
// session as `buf.toString('utf-8')`: a frame that ended inside a multi-byte character (a zh / ja character is three bytes,
// an emoji four) turned both halves into U+FFFD. Now `ptyInput` (src/agentd/pty-input.js) keeps ONE decoder per session.
//   ① every cut of a mixed text (ASCII, zh, ja, an emoji, a combining mark) into two frames, and into one-byte frames, arrives
//      whole and in order; a frame of one partial character writes NOTHING (no empty write); a STRAY lead byte is held until
//      the next frame and written as U+FFFD in that frame's ONE write (the key after it kept).
//   ② one decoder per session: two sessions cut at the same time each get their own character back.
//   RED CONTROL: ① and ② over the release's road (each frame decoded on its own) — both go red (the stray byte: written at once,
//      in a write of its own).
//   ③ the wiring: agentd.js makes one ptyInput per pty session and its onData writes through it; no per-frame decode is left
//      (a text pin: the real daemon's pty road is the heavy suites').
//   ④ B-b968: the SAME rule (src/utf8-stream.js, SHARED) on the hub's pty OUTPUT (the real daemonPtyShim over a stand-in handle,
//      every cut; CONTROL: the release's per-frame shim ⇒ U+FFFD) and on the device chat tail's read edge (a text pin).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const { ptyInput } = require(path.join(REPO, 'src/agentd/pty-input.js'));
const TEXT = 'ls 中文 かな \u{1F600} é ok';
const BYTES = Buffer.from(TEXT, 'utf-8');
const releaseRoad = (write) => (buf) => write(buf.toString('utf-8'));   // the release's agentd.js line, as it was
const feed = (make, frames) => { const out = []; const f = make((s) => out.push(s)); for (const b of frames) f(b); return out; };
const cuts = (make) => {   // ①: every two-frame cut + one-byte frames + a frame of one partial character
  const bad = [];
  for (let i = 1; i < BYTES.length; i++) { const out = feed(make, [BYTES.subarray(0, i), BYTES.subarray(i)]); if (out.join('') !== TEXT || out.some((s) => s === '')) bad.push(i); }
  const ones = feed(make, [...BYTES].map((b) => Buffer.from([b]))).join('');
  const zh = Buffer.from('中', 'utf-8');
  const partial = JSON.stringify(feed(make, [zh.subarray(0, 1), zh.subarray(1, 2)])) === '[]' && feed(make, [zh.subarray(0, 2), zh.subarray(2)]).join('') === '中';
  // the cure (its readers): a STRAY lead byte (an 8-bit Meta key, a non-UTF-8 sender) is held until the next frame, then written
  // as U+FFFD before that frame's own text — never a character invented, never the next key lost
  const lone = feed(make, [Buffer.from([0xc3])]), loneThen = JSON.stringify(feed(make, [Buffer.from([0xc3]), Buffer.from('a')]));   // the writes, counted
  return { bad, ones: ones === TEXT, partial, cutsTried: BYTES.length - 1, lone: JSON.stringify(lone), loneThen };
};
const twoSessions = (make) => {   // ②
  const a = [], b = [];
  const fa = make((s) => a.push(s)), fb = make((s) => b.push(s));
  const zh = Buffer.from('中', 'utf-8'), ja = Buffer.from('か', 'utf-8');
  fa(zh.subarray(0, 1)); fb(ja.subarray(0, 2)); fa(zh.subarray(1)); fb(ja.subarray(2));
  return a.join('') === '中' && b.join('') === 'か';
};

console.log('① every cut arrives whole');
const c = cuts(ptyInput);
ok(c.bad.length === 0, `all ${c.cutsTried} two-frame cuts give the text back whole, no empty write`, c.bad);
ok(c.ones === true, 'one-byte frames give the text back whole');
ok(c.partial === true, 'a frame of one partial character writes nothing until the rest arrives');
ok(c.lone === '[]' && c.loneThen === JSON.stringify(['\uFFFDa']), 'a stray lead byte is held, then written as U+FFFD in the next frame\'s ONE write, just before its text (the key after it is never lost)', { lone: c.lone, loneThen: c.loneThen });
console.log('② one decoder per session');
ok(twoSessions(ptyInput) === true, 'two sessions cut at the same time each get their own character back');
console.log('RED CONTROL: the release road (each frame decoded on its own)');
const cr = cuts(releaseRoad), sr = twoSessions(releaseRoad);
ok(cr.bad.length > 0 && cr.ones === false && cr.partial === false && sr === false && cr.lone !== '[]' && cr.loneThen !== JSON.stringify(['\uFFFDa']), 'CONTROL (the per-frame decode): the cuts turn into U+FFFD, one-byte frames too, a stray byte is written at once, a partial character is written broken, two sessions get broken characters (red)', { bad: cr.bad.length, ones: cr.ones, partial: cr.partial, sessions: sr, lone: cr.lone, loneThen: cr.loneThen });

console.log('③ the wiring in agentd.js (a text pin)');
const src = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf-8');
ok(/const \{ ptyInput \} = require\('\.\/pty-input\.js'\);/.test(src)
  && /sessions\.set\(chan, \{ proc, out, input: ptyInput\(\(s\) => proc\.write\(s\)\) \}\);/.test(src)   // restacked over B-beaf: the session also keeps its held sender (`out`)
  && /if \(sx\) \{ try \{ sx\.input\(buf\); \} catch \{ \} mux\.credit\(chan, buf\.length\); return; \}/.test(src)
  && !/sx\.proc\.write\(buf\.toString\(/.test(src),   // stale-pins: kept — an absence check (the release's per-frame decode is gone)
  'agentd.js makes ONE ptyInput per pty session and its onData writes through it; no per-frame decode of session input is left');

// ④ B-b968: the SAME rule on the hub's side — a session re-attached through this machine's own agent (src/server/dial-pairing.js
// daemonPtyShim), this machine's pipe sessions (src/pty-duck.js pipePtyShim) and every device's chat tail read edge (agentd.js
// session-events-watch) decode ONE stream through src/utf8-stream.js (PURE: the global TextDecoder)
console.log('④ the re-attached terminal, the pipe sessions and the chat tail decode one stream (src/utf8-stream.js)');
const { utf8Stream } = require(path.join(REPO, 'src/utf8-stream.js'));
const { ptyListeners } = require(path.join(REPO, 'src/pty-duck.js'));
const DP_SRC = fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf-8');
const shimOf = (src) => {   // the real daemonPtyShim, cut out of its file by its own lines (a moved line THROWS by name, never a silent pass)
  const a = src.indexOf('function daemonPtyShim(handle) {'); const b = a < 0 ? -1 : src.indexOf('\n}\n', a);
  if (a < 0 || b < 0) throw new Error('daemonPtyShim: the function is not where the leg reads it (move the leg with it)');
  return new Function('ptyListeners', 'utf8Stream', src.slice(a, b + 2) + '\nreturn daemonPtyShim;')(ptyListeners, utf8Stream);
};
const viaShim = (shim) => (write) => { const h = { pid: 1 }; const p = shim(h); p.onData(write); return (buf) => h.onData(buf); };
const hub = cuts(viaShim(shimOf(DP_SRC)));
ok(hub.bad.length === 0 && hub.ones === true && hub.partial === true && twoSessions(viaShim(shimOf(DP_SRC))) === true, `the re-attach shim (a session through this machine's own agent) over a stand-in handle: all ${hub.cutsTried} two-frame cuts, one-byte frames and a partial character give the text back whole; two terminals each keep their own character`, hub.bad);
const RELEASE_SHIM_LINE = "  handle.onData = (buf) => data.emit(buf.toString('utf-8'));\n"; // stale-pins: kept — the control plants the release's line
const NOW_SHIM_LINES = "  const decode = utf8Stream((s) => data.emit(s));   // B-b968: a frame that ends inside a character (zh / ja: three bytes) holds its bytes\n  handle.onData = (buf) => decode(buf);\n";
ok(DP_SRC.split(NOW_SHIM_LINES).length === 2, 'the anchor of the control «the release\'s shim» is in dial-pairing.js once');
const hubRel = cuts(viaShim(shimOf(anchored(DP_SRC, NOW_SHIM_LINES, RELEASE_SHIM_LINE, 'release-shim'))));
ok(hubRel.bad.length > 0 && hubRel.ones === false, 'CONTROL (the release\'s shim: each output frame decoded on its own): the cuts turn into U+FFFD — RED', hubRel.bad.length);
ok(cuts(utf8Stream).bad.length === 0 && /const \{ utf8Stream \} = require\('\.\.\/utf8-stream\.js'\);/.test(fs.readFileSync(path.join(REPO, 'src/agentd/pty-input.js'), 'utf-8')) && /function ptyInput\(write\) \{ return utf8Stream\(write\); \}/.test(fs.readFileSync(path.join(REPO, 'src/agentd/pty-input.js'), 'utf-8')), 'ONE rule for every edge: src/utf8-stream.js gives the text back whole, and the device\'s pty input IS it');
ok(/const \{ utf8Stream \} = require\('\.\.\/utf8-stream\.js'\);/.test(src) && /t = \{ pos: st2\.size, buf: '', mm: null, ops: \[\], dec: null \};/.test(src) && /\(t\.dec \|\|= utf8Stream\(\(s\) => \{ t\.buf \+= s; \}\)\)\(buf\);/.test(src) && !/t\.buf \+= buf\.toString\(/.test(src),   // stale-pins: kept — an absence check (the read edge's per-chunk decode is gone)
  'the chat tail\'s read edge (session-events-watch): ONE decoder per tail — a read that ends inside a character holds its bytes for the next read; no per-chunk decode is left');
ok(/const \{ utf8Stream \} = require\('\.\.\/utf8-stream\.js'\);/.test(DP_SRC) && !/handle\.onData = \(buf\) => data\.emit\(buf\.toString\(/.test(DP_SRC), 'the re-attach shim requires the one rule and decodes no frame on its own');   // stale-pins: kept — an absence check
// the PIPE sessions (this machine's chat road R6: the device pumps .out in 64 KiB chunks at any byte, the link splits at its window)
const { pipePtyShim } = require(path.join(REPO, 'src/pty-duck.js'));
const PD_SRC = fs.readFileSync(path.join(REPO, 'src/pty-duck.js'), 'utf-8');
const pipeOf = (src) => { const a = src.indexOf('function pipePtyShim(handle) {'); const b = a < 0 ? -1 : src.indexOf('\n}\n', a); if (a < 0 || b < 0) throw new Error('pipePtyShim: the function is not where the leg reads it'); return new Function('ptyListeners', 'utf8Stream', src.slice(a, b + 2) + '\nreturn pipePtyShim;')(ptyListeners, utf8Stream); };
const pipe = cuts(viaShim(pipePtyShim));
ok(pipe.bad.length === 0 && pipe.ones === true && pipe.partial === true && twoSessions(viaShim(pipePtyShim)) === true, `the PIPE shim (src/pty-duck.js, this machine's chat sessions): all ${pipe.cutsTried} cuts, one-byte frames and a partial character whole; two sessions each their own`, pipe.bad);
const pipeRel = cuts(viaShim(pipeOf(anchored(PD_SRC, "  const decode = utf8Stream((s) => data.emit(s));   // B-b968: a 64 KiB pump chunk or a link frame that ends inside a character holds its bytes\n  handle.onData = (buf) => decode(buf);\n", "  handle.onData = (buf) => data.emit(typeof buf === 'string' ? buf : buf.toString('utf-8'));\n", 'release-pipe-shim')))); // stale-pins: kept — the control plants the release's line
ok(pipeRel.bad.length > 0 && pipeRel.ones === false, 'CONTROL (the release\'s pipe shim: each chunk decoded on its own): the cuts turn into U+FFFD — RED', pipeRel.bad.length);
ok(JSON.stringify(feed(utf8Stream, [Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a')])) === JSON.stringify(['\uFEFF', 'a']) && JSON.stringify(feed(utf8Stream, ['ready'])) === JSON.stringify(['ready']), 'a leading byte-order mark is KEPT (as the per-frame decode kept it), and a string is handed on as it is');
report();
