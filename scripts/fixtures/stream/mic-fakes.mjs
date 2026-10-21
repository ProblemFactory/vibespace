// lane stream-mic-road: THE FAKE MICROPHONE SINK the suites hand a real agent (VIBESPACE_MIC_HELPER — src/desktop-mic.js's seam,
// as VIBESPACE_INPUT_STUB_FILE is the injector's): a script standing in for the helper's three commands — `facts` prints the
// facts.json beside it (its `platform` decides the road: win32 = PCM from the agent's ffmpeg, darwin = length-framed Opus),
// `render` records what it was handed (render-<n>.json: its env names, its argv; render-<n>.bin: its stdin; render-<n>.end: the
// byte count once stdin closed), `setdefault` rewrites facts.json's default microphone. Used by test-stream-mic-op and
// test-desktop-webrtc-chrome ⑰.
import fs from 'node:fs';
import path from 'node:path';

const ROLES = ['console', 'multimedia', 'communications'];
const SCRIPT = `#!/usr/bin/env node
const fs = require('fs'), path = require('path'), D = __dirname, cmd = process.argv[2] || '';
const facts = () => JSON.parse(fs.readFileSync(path.join(D, 'facts.json'), 'utf8'));
if (cmd === 'facts') { process.stdout.write(JSON.stringify(facts()) + '\\n'); process.exit(0); }
else if (cmd === 'setdefault') {
  const f = facts(), id = process.env.VS_MIC_DEVICE || ''; let name = null;
  fs.appendFileSync(path.join(D, 'setdefault.log'), id + '\\n');
  if (f.platform === 'darwin') { const d = f.devices.find((x) => x.uid === id); if (d) { f.defaults.input = { uid: id, name: d.name }; name = d.name; } }
  else { const e = f.endpoints.find((x) => x.id === id && x.flow === 'capture'); if (e) { for (const r of ['console', 'multimedia', 'communications']) f.defaults.capture[r] = { name: e.name, id }; name = e.name; } }
  if (!name) { process.stdout.write(JSON.stringify({ ok: false, error: 'no such device' }) + '\\n'); process.exit(1); }
  fs.writeFileSync(path.join(D, 'facts.json'), JSON.stringify(f));
  process.stdout.write(JSON.stringify({ ok: true, endpoint: name, id }) + '\\n'); process.exit(0);
} else if (cmd === 'render') {
  const n = fs.readdirSync(D).filter((x) => /^render-\\d+\\.json$/.test(x)).length + 1;
  fs.writeFileSync(path.join(D, 'render-' + n + '.json'), JSON.stringify({ n, device: process.env.VS_MIC_DEVICE || null, speakers: process.env.VS_MIC_SPEAKERS === '1', argv: process.argv.slice(2), at: Date.now() }));
  const out = fs.openSync(path.join(D, 'render-' + n + '.bin'), 'w'); let bytes = 0;
  process.stderr.write(JSON.stringify({ ev: 'started', endpoint: process.env.VS_MIC_DEVICE || 'speakers' }) + '\\n');
  process.stdin.on('data', (d) => { fs.writeSync(out, d); bytes += d.length; });
  process.stdin.on('end', () => { fs.closeSync(out); fs.writeFileSync(path.join(D, 'render-' + n + '.end'), String(bytes)); process.stderr.write(JSON.stringify({ ev: 'end', why: 'stdin_closed', frames: bytes / 4 }) + '\\n'); process.exit(0); });
} else process.exit(2);
`;

/** A Windows machine's facts (the helper's `facts`): a speaker + a microphone, VB-CABLE's two endpoints when `cable`. */
export const winFacts = ({ cable = true, speaker = true } = {}) => ({
  ok: true, platform: 'win32',
  endpoints: [...(speaker ? [{ flow: 'render', name: 'Speakers (Sound Blaster X3)', state: 1, id: 'spk-1', defaultFor: ROLES }] : []), { flow: 'capture', name: 'Mic (Sound Blaster X3)', state: 1, id: 'mic-1', defaultFor: ROLES },
    ...(cable ? [{ flow: 'render', name: 'CABLE Input (VB-Audio Virtual Cable)', state: 1, id: 'cab-in', defaultFor: [] }, { flow: 'capture', name: 'CABLE Output (VB-Audio Virtual Cable)', state: 1, id: 'cab-out', defaultFor: [] }] : [])],
  defaults: { render: Object.fromEntries(ROLES.map((r) => [r, speaker ? { name: 'Speakers (Sound Blaster X3)', id: 'spk-1' } : { name: '', id: '' }])), capture: Object.fromEntries(ROLES.map((r) => [r, { name: 'Mic (Sound Blaster X3)', id: 'mic-1' }])) },
});
/** A Mac's facts: its own microphone + speakers, «VibeSpace Microphone» when `ours`. */
export const macFacts = ({ ours = true } = {}) => ({
  ok: true, platform: 'darwin',
  devices: [{ uid: 'BuiltInMicrophoneDevice', name: 'MacBook Pro Microphone', inputs: 1, outputs: 0 }, { uid: 'BuiltInSpeakerDevice', name: 'MacBook Pro Speakers', inputs: 0, outputs: 2 }, ...(ours ? [{ uid: 'VibeSpaceMic_UID', name: 'VibeSpace Microphone', inputs: 2, outputs: 2 }] : [])],
  defaults: { input: { uid: 'BuiltInMicrophoneDevice', name: 'MacBook Pro Microphone' }, output: { uid: 'BuiltInSpeakerDevice', name: 'MacBook Pro Speakers' }, system: { uid: 'BuiltInSpeakerDevice', name: 'MacBook Pro Speakers' } },
});

/** The fake in `dir` (created). → { exe, dir, setFacts(f), renders(), ended(n), binOf(n), setdefaults() } */
export function writeFakeMic(dir, facts = winFacts()) {
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'vibespace-mic-fake.cjs');
  fs.writeFileSync(exe, SCRIPT, { mode: 0o755 });
  const setFacts = (f) => fs.writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(f));
  setFacts(facts);
  const renders = () => fs.readdirSync(dir).filter((x) => /^render-\d+\.json$/.test(x)).map((x) => JSON.parse(fs.readFileSync(path.join(dir, x), 'utf8'))).sort((a, b) => a.n - b.n);
  const ended = (n) => fs.existsSync(path.join(dir, `render-${n}.end`));
  const binOf = (n) => (fs.existsSync(path.join(dir, `render-${n}.bin`)) ? fs.readFileSync(path.join(dir, `render-${n}.bin`)) : Buffer.alloc(0));
  const setdefaults = () => (fs.existsSync(path.join(dir, 'setdefault.log')) ? fs.readFileSync(path.join(dir, 'setdefault.log'), 'utf8').trim().split('\n').filter(Boolean) : []);
  return { exe, dir, setFacts, renders, ended, binOf, setdefaults };
}

/** 1 kHz energy against 3 kHz in s16le stereo PCM's left channel (Goertzel over the whole run): the tone made it through. */
export function toneRatio(pcm, { from = 0 } = {}) {
  const n = Math.floor(pcm.length / 4); if (n - from < 4800) return 0;
  const g = (f) => { const c = 2 * Math.cos(2 * Math.PI * f / 48000); let s1 = 0, s2 = 0; for (let k = from; k < n; k++) { const s0 = pcm.readInt16LE(k * 4) / 32768 + c * s1 - s2; s2 = s1; s1 = s0; } return s1 * s1 + s2 * s2 - c * s1 * s2; };
  return g(1000) / Math.max(1e-9, g(3000));
}
