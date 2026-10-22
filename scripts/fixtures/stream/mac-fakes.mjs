// lane stream-p3m-build: THE FAKE MAC SCREEN HELPER of scripts/test-stream-mac.mjs — a paired Mac's helper
// (tools/vibespace-screen) on a Linux box, from shapes, at the helper's FIXED path (src/stream-plan.js macHelperPaths):
//   writeFakeMacHelper(home, cfg)  `~/.vibespace/helpers/vibespace-screen` (a Node script — `#!<this node>`) + its version file
//                                  (cfg.version — the shipped one unless a leg says otherwise). Every argv and every stdin line
//                                  → cfg.log (one JSON line each). `facts` prints cfg.facts with cfg.tcc; `capture` (Screen
//                                  Recording granted) says `started` (its size, the picture's frame, the window's pid), then
//                                  writes cfg.flv's pictures at --fps and a stats line every 10; `key` on stdin = the next
//                                  picture is the file's first key frame; cfg.endAfter pictures ⇒ an `end` line with cfg.endCode
//                                  (exit 3); cfg.dieAfter ⇒ exit 1 with no end line; cfg.moveAfter ⇒ a `frame` line (the window
//                                  moved to cfg.movedFrame); `input` answers `ready`, then one line per command (cfg.inputAnswer
//                                  for every command but `P`; logged with the child's pid). cfg is re-read at every start (a leg
//                                  edits it with set()) — a RUNNING input child keeps its birth's answer (macOS's per-process
//                                  verdict) unless cfg.inputLive (its own AXIsProcessTrusted flipping: re-read at every line);
//                                  cfg.inputDelayMs = every answer but `P`'s that late (lines in flight — lane stream-mac-ax-respawn).
//                                  lane stream-fallback-never-silent: cfg.endOnce = a token file — the endAfter ending happens only
//                                  while it exists, and takes it (ONE ending: the capture started again plays on); cfg.factsFail
//                                  = a counter file — while it holds n > 0 a `facts` run fails (exit 1, nothing on stdout), n - 1.
//                                  lane fast-debt-clear: cfg.pace = pictures a second the fake WRITES (its `started` line still
//                                  says --fps): a leg that counts pictures gets them sooner
//                                  lane speaker-passthrough-v1: THE SOUND — `audio on` / `audio off` on stdin answer ONE `audio`
//                                  line ({on} — or {on: false, error} when cfg.audioRefuse and it did not start with --audio: a
//                                  live switch macOS refused), and while on it writes cfg.opus's packets (a file of u32LE-length-
//                                  framed Opus packets) as FLV AUDIO tags (0x91 'Opus' + the packet — the real helper's shape) every
//                                  20 ms beside the pictures; `--audio` = on from the start (its `started` line says audio: true)
//   MAC_FACTS                      the canned facts (two 4K displays at 2×, two windows — names invented)
import fs from 'node:fs';
import path from 'node:path';

export const MAC_FACTS = Object.freeze({
  os: '26.5.2', arch: 'arm64', locked: false, front: 501, pid: 900,
  displays: [
    { id: 3, x: 0, y: 0, w: 1920, h: 1080, pw: 3840, ph: 2160, scale: 2, main: true, asleep: false, hz: 120, hdr: true, name: 'Studio 27 (2)' },
    { id: 2, x: -1920, y: 0, w: 1920, h: 1080, pw: 3840, ph: 2160, scale: 2, main: false, asleep: false, hz: 120, hdr: true, name: 'Studio 27 (1)' },
  ],
  windows: [
    { id: 4242, pid: 777, app: 'TextEdit', bundle: 'com.apple.TextEdit', title: 'notes.txt', x: -1678, y: 106, w: 656, h: 422, onScreen: true, minimized: false },
    { id: 4343, pid: 778, app: 'Preview', bundle: 'com.apple.Preview', title: 'report.pdf', x: 100, y: 100, w: 800, h: 600, onScreen: false, minimized: true },
  ],
});

export function writeFakeMacHelper(home, cfg) {
  const dir = path.join(home, '.vibespace', 'helpers');
  fs.mkdirSync(dir, { recursive: true });
  const cfgFile = path.join(home, 'fake-mac-helper.json');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  const bin = path.join(dir, 'vibespace-screen');
  fs.writeFileSync(bin, `#!${process.execPath}
'use strict';
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(cfgFile)}, 'utf8'));
let a = process.argv.slice(2);
const log = (o) => { if (cfg.log) fs.appendFileSync(cfg.log, JSON.stringify(o) + '\\n'); };
log({ argv: a });
if (a[0] === '--disclaim') a = a.slice(1); // a real helper re-spawns ITSELF disclaimed here; the fake records that it was asked to
const say = (o) => process.stderr.write(JSON.stringify(o) + '\\n');
const opt = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
const lines = (f) => { let buf = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); f(l); } }); process.stdin.on('end', () => process.exit(0)); };
if (a[0] === 'version') { process.stdout.write(cfg.version + '\\n'); process.exit(0); }
const take = (f) => { try { fs.unlinkSync(f); return true; } catch { return false; } };
const count = (f) => { try { const n = Number(fs.readFileSync(f, 'utf8')) || 0; if (n <= 0) return false; fs.writeFileSync(f, String(n - 1)); return true; } catch { return false; } };
if (a[0] === 'facts' && cfg.factsFail && count(cfg.factsFail)) { process.stderr.write('fake facts: the shareable content could not be read\\n'); process.exit(1); }
if (a[0] === 'facts') { process.stdout.write(JSON.stringify({ t: 'facts', version: cfg.reports || cfg.version, disclaimed: true, ...cfg.facts, tcc: cfg.tcc }) + '\\n'); process.exit(0); }
if (a[0] === 'input') {
  process.stdout.write('ready\\n');
  const answer = () => { if (!cfg.inputLive) return cfg.inputAnswer || 'ok'; try { return JSON.parse(fs.readFileSync(${JSON.stringify(cfgFile)}, 'utf8')).inputAnswer || 'ok'; } catch { return cfg.inputAnswer || 'ok'; } };
  lines((l) => { log({ input: l, pid: process.pid }); const out = (l[0] === 'P' ? 'ok' : answer()) + '\\n'; if (cfg.inputDelayMs && l[0] !== 'P') setTimeout(() => process.stdout.write(out), cfg.inputDelayMs); else process.stdout.write(out); });
} else if (a[0] === 'capture') {
  if (cfg.tcc.screen !== 'granted') { say({ t: 'end', code: 'screen_permission', error: 'Screen Recording is off for vibespace-screen' }); process.exit(3); }
  const [w, h] = String(opt('size') || '1280x720').split('x').map(Number), fps = Number(opt('fps')) || 30, win = opt('window');
  const withAudio = a.includes('--audio');
  say({ t: 'started', w, h, fps, kbps: Number(opt('kbps')), scale: 2, frame: win ? cfg.windowFrame : cfg.displayFrame, pid: win ? cfg.windowPid : 0, window: win ? Number(win) : 0, version: cfg.version, lowLatency: true, audio: withAudio });
  // lane speaker-passthrough-v1: THE SOUND's packets (cfg.opus: u32LE length + packet, looped) as FLV audio tags
  const opus = []; if (cfg.opus) { const ob = fs.readFileSync(cfg.opus); for (let k = 0; k + 4 <= ob.length;) { const L = ob.readUInt32LE(k); opus.push(ob.subarray(k + 4, k + 4 + L)); k += 4 + L; } }
  let audioTimer = null, apk = 0; const t0 = Date.now();
  const audioTag = (pkt) => { const body = Buffer.concat([Buffer.from([0x91]), Buffer.from('Opus'), pkt]); const ms = Date.now() - t0; const tg = Buffer.alloc(11); tg[0] = 8; tg.writeUIntBE(body.length, 1, 3); tg.writeUIntBE(ms & 0xffffff, 4, 3); tg[7] = (ms >> 24) & 255; const tail = Buffer.alloc(4); tail.writeUInt32BE(11 + body.length); return Buffer.concat([tg, body, tail]); };
  const audioOn = () => { if (audioTimer || !opus.length) return; audioTimer = setInterval(() => { process.stdout.write(audioTag(opus[apk % opus.length])); apk++; }, 20); };
  const audioOff = () => { clearInterval(audioTimer); audioTimer = null; };
  const flv = fs.readFileSync(cfg.flv);
  let i = 9 + 4; const tags = [];
  while (i + 11 <= flv.length) { const size = (flv[i + 1] << 16) | (flv[i + 2] << 8) | flv[i + 3]; tags.push(flv.subarray(i, i + 11 + size + 4)); i += 11 + size + 4; }
  const head = Buffer.concat([flv.subarray(0, 13), tags[0]]), pics = tags.slice(1), k0 = pics.findIndex((t) => t[11] === 0x17);
  process.stdout.on('error', () => process.exit(0));
  process.stdout.write(head);
  let n = 0, sent = 0, forced = 0, next = null;
  lines((l) => {
    log({ ctl: l }); if (l === 'key') { next = k0; forced++; } if (l === 'quit') process.exit(0);
    if (l === 'audio on') { if (cfg.audioRefuse && !withAudio) say({ t: 'audio', on: false, error: 'updateConfiguration: the operation couldn’t be completed (-3812)' }); else { audioOn(); say({ t: 'audio', on: true }); } }
    if (l === 'audio off') { audioOff(); say({ t: 'audio', on: false }); }
  });
  if (withAudio) audioOn();
  setInterval(() => {
    if (cfg.dieAfter && sent >= cfg.dieAfter) process.exit(1);
    if (cfg.endAfter && sent >= cfg.endAfter && (!cfg.endOnce || take(cfg.endOnce))) { say({ t: 'end', code: cfg.endCode, error: 'the fake ended it' }); process.exit(3); }
    if (cfg.moveAfter && sent === cfg.moveAfter) say({ t: 'frame', frame: cfg.movedFrame });
    if (next != null) { n = next; next = null; }
    process.stdout.write(pics[n % pics.length]); n++; sent++;
    if (sent % 10 === 0) say({ t: 'stats', captured: sent, encoded: sent, idle: 0, repeats: 0, keys: 1, forced, dropped: 0, encMs: 9.5, capMs: 1.2, kbps: 900, bps: 0, w, h, fps, lowLatency: true, audio: audioTimer ? { packets: apk, buffers: apk, peakDb: -20 } : null });
  }, 1000 / (Number(cfg.pace) || fps));
} else { process.stderr.write('fake helper: no mode in ' + a.join(' ') + '\\n'); process.exit(2); }
`, { mode: 0o755 });
  if (cfg.version != null) fs.writeFileSync(bin + '.version', cfg.version);
  return { bin, dir, cfgFile, set: (patch) => fs.writeFileSync(cfgFile, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(cfgFile, 'utf8')), patch))) };
}

/** The fake helper's record: [{ argv } | { ctl } | { input }]. */
export function helperLog(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; }
