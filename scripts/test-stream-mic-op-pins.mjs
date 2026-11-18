#!/usr/bin/env node
// THE MIC OP — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-stream-mic-op.mjs (its behaviour legs and every mutant / browser CONTROL stay there): §0 the helpers' sources (src/mic-helper-source.js = the generated text of tools/vibespace-mic/, the Windows / Mac helpers and the plug-in) and the client's THREE-TOUCH pin (src/agentd/client.js).
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-stream-mic-op-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { moduleText, readTexts } from './mic-helper-embed.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
console.log('§0 the helpers\' sources');
{
  ok(fs.readFileSync(path.join(REPO, 'src/mic-helper-source.js'), 'utf8') === moduleText(readTexts()), 'src/mic-helper-source.js is the generated text of tools/vibespace-mic/ (run node scripts/mic-helper-embed.mjs after editing them)');
  const S = require(path.join(REPO, 'src/mic-helper-source.js'));
  ok(/static int Main\(string\[\] args\)/.test(S.WIN) && /cmd == "facts"/.test(S.WIN) && /cmd == "render"/.test(S.WIN) && /cmd == "setdefault"/.test(S.WIN) && /GetEnvironmentVariable\("VS_MIC_DEVICE"\)/.test(S.WIN) && /GetEnvironmentVariable\("VS_MIC_SPEAKERS"\)/.test(S.WIN) && !/args\[1\]/.test(S.WIN), 'the Windows helper: facts / render / setdefault; its names come from the ENV (VS_MIC_DEVICE / VS_MIC_SPEAKERS), never argv');
  // lane speaker-passthrough-v1: the `loopback` verb (the machine's SOUND for the stream) captures the SPEAKER's mix — never a microphone
  const noLoop = S.WIN.slice(0, S.WIN.indexOf('[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317")')) + S.WIN.slice(S.WIN.indexOf('interface IAudioRenderClient {'), S.WIN.indexOf('static int Loopback()')) + S.WIN.slice(S.WIN.indexOf('/// setdefault:'));
  ok(/AUTOCONVERTPCM|0x80000000/.test(S.WIN) && /SetDefaultEndpoint/.test(S.WIN) && /f8679f50-850a-41cf-9c72-430f290290c8/.test(S.WIN) && !/Capture|IAudioCaptureClient/.test(noLoop.replace(/flow == 0 \? "render" : "capture"/g, '').replace(/\/\/[^\n]*/g, '')) && !/GetDefaultAudioEndpoint\(1/.test(S.WIN), 'it renders (shared mode, the engine converts) and sets the default capture endpoint (IPolicyConfig) — outside the `loopback` verb (the machine\'s sound: the SPEAKER\'s mix, lane speaker-passthrough-v1) it captures nothing, and it never opens a microphone');
  ok(/case "render": exit\(render\(\)\)/.test(S.MAC) && /kAudioFormatOpus/.test(S.MAC) && /env\["VS_MIC_DEVICE"\]/.test(S.MAC) && /kAudioHardwarePropertyDefaultInputDevice/.test(S.MAC) && !/AVCaptureDevice|kAudioObjectPropertyScopeInput, &a, 0, nil, &size, &p\b/.test(S.MAC), 'the Mac helper: renders length-framed Opus (AudioToolbox decodes) to a device by UID from the ENV; it never reads a microphone (no TCC grant needed)');
  ok(/#define kDeviceUID "VibeSpaceMic_UID"/.test(S.PLUGIN_C) && /CFSTR\("VibeSpace Microphone"\)/.test(S.PLUGIN_C) && /<string>app\.vibespace\.audio\.mic<\/string>/.test(S.PLUGIN_PLIST) && /6C2F3A8E-1B7D-4E5A-9C0F-3D2B1A4E5F60/.test(S.PLUGIN_PLIST), 'the plug-in keeps the UID the owner\'s installed copy answers (VibeSpaceMic_UID), its name and its factory');
  ok(S.PLUGIN_C.split('\n').slice(10).join('\n') === fs.readFileSync(path.join(REPO, 'scripts/probes/stream-audio/mac/vsmic/vsmic.c'), 'utf8').split('\n').slice(fs.readFileSync(path.join(REPO, 'scripts/probes/stream-audio/mac/vsmic/vsmic.c'), 'utf8').split('\n').findIndex((l) => l.startsWith('#include'))).join('\n'), 'the plug-in\'s code IS the probe\'s measured build (only its head differs)');
}
console.log('§1 the client\'s routing set (source pin)');
{
const cli = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
ok(/m\.op === 'stream-mic-result'/.test(cli) && /daemon lacks stream-mic \(capabilities gate\)/.test(cli), 'THREE-TOUCH: stream-mic-result is in the client\'s id-keyed routing set; the method is capability-gated');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
