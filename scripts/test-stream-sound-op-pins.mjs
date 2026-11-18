#!/usr/bin/env node
// THE SOUND OP — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-stream-sound-op.mjs (its behaviour legs and every mutant / browser CONTROL stay there): §0 the helpers' sources (src/mic-helper-source.js's `loopback` verb, the Mac screen helper tools/vibespace-screen/vibespace-screen.swift riding src/agentd/mac-helper-source.js) and the client's THREE-TOUCH pin (src/agentd/client.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-stream-sound-op-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { moduleText, readTexts } from './mic-helper-embed.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const MSRC = require(path.join(REPO, 'src/agentd/mac-helper-source.js'));
console.log('§0 the helpers\' sources');
{
  ok(fs.readFileSync(path.join(REPO, 'src/mic-helper-source.js'), 'utf8') === moduleText(readTexts()), 'src/mic-helper-source.js is the generated text of tools/vibespace-mic/ (node scripts/mic-helper-embed.mjs after editing them)');
  const WIN = require(path.join(REPO, 'src/mic-helper-source.js')).WIN;
  const lb = WIN.slice(WIN.indexOf('static int Loopback()'), WIN.indexOf('/// setdefault:'));
  ok(/cmd == "loopback"\) return Loopback\(\)/.test(WIN) && lb.length > 500 && /GetDefaultAudioEndpoint\(0, 0, out dev\)/.test(lb) && /0x00020000 \| 0x00040000 \| AUTOCONVERT/.test(lb) && /IAudioCaptureClient/.test(lb), 'the Windows helper\'s `loopback` verb: WASAPI LOOPBACK (0x00020000, event-driven, AUTOCONVERTPCM → 48 kHz float stereo) of the default RENDER endpoint (flow 0)');
  ok((lb.match(/ReleaseBuffer\((kaFrames|want), 2\)/g) || []).length === 2 && /Initialize\(0, 0x00040000 \| AUTOCONVERT, 400000/.test(lb), 'beside it a SILENT render stream on the same endpoint (AUDCLNT_BUFFERFLAGS_SILENT) — the keep-alive without which a quiet machine delivers nothing (the probe\'s leg 1b)');
  ok(!/GetEnvironmentVariable|args\[1\]|GetDefaultAudioEndpoint\(1/.test(lb) && /OpenStandardOutput/.test(lb) && /OpenStandardInput/.test(lb), 'it reads nothing from env or argv, never the CAPTURE flow (no microphone); PCM to stdout, it ends when stdin closes');
  const SWIFT = fs.readFileSync(path.join(REPO, 'tools/vibespace-screen/vibespace-screen.swift'), 'utf8');
  ok(MSRC.SOURCE === SWIFT && MSRC.VERSION === 'vs-' + MSRC.SHA256.slice(0, 12) && MSRC.VERSION !== 'vs-054d5cc35456', `the Mac's screen helper rides the bundle verbatim; its VERSION moved (vs-054d5cc35456 → ${MSRC.VERSION}) — the owner switches Screen Recording on once more for it (helper_changed_regrant)`);
  ok(/c\.capturesAudio = on/.test(SWIFT) && /s\.updateConfiguration\(c\)/.test(SWIFT) && /addStreamOutput\(self, type: \.audio/.test(SWIFT) && (SWIFT.match(/SCStream\(filter:/g) || []).length === 1 && /excludesCurrentProcessAudio = true/.test(SWIFT), 'the Mac: capturesAudio on the SAME SCStream (updateConfiguration — one SCStream in the helper), its own process excluded');
  ok(/mFormatID: kAudioFormatOpus, mFormatFlags: 0, mBytesPerPacket: 0, mFramesPerPacket: 960/.test(SWIFT) && /conv\.bitRate = 64000/.test(SWIFT) && /Data\(\[0x91\]\) \+ Data\("Opus"\.utf8\)/.test(SWIFT) && /A\.contains\("--audio"\)/.test(SWIFT) && /p\.first == "audio", p\.count > 1/.test(SWIFT) && !/AVCaptureDevice|kAudioDevicePropertyScopeInput/.test(SWIFT), 'AudioToolbox Opus 20 ms 64 kbps → FLV audio tags (0x91 \'Opus\'); `audio on|off` on stdin, `--audio` from the start; no microphone anywhere');
}
console.log('§1 the client\'s routing set (source pin)');
{
  const client = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  ok(/m\.op === 'stream-audio-result'/.test(client) && /async streamAudio\(sid, \{ on = false \} = \{\}\) \{\s*const conn = await this\.connect\(\);\s*if \(!conn\.info\?\.capabilities\?\.includes\?\.\(SOUND_CAPABILITY\)\)/.test(client), 'THREE-TOUCH: stream-audio-result is in the client\'s id-keyed routing set; the method is capability-gated');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
