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
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
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
report();
