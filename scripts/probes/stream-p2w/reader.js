// reader.js — the agent's side of the mapped road, measured (lane stream-p2w-capture-probe leg 3): read raw frames of
// <frameBytes> from stdin the way src/agentd/stream-screen.js reads ffmpeg #1 (fill fixed buffers, count whole frames) and
// print fps, the inter-frame time and this process's CPU. Run with the device agent's own node.
//   node reader.js <frameBytes>                      frames on stdin (a cmd.exe pipe)
//   node reader.js <frameBytes> --spawn <exe> <args…>  THIS process spawns the writer (libuv pipes — the agent's shape)
const FB = Number(process.argv[2]);
const sp = process.argv.indexOf('--spawn');
const child = sp > 0 ? require('child_process').spawn(process.argv[sp + 1], process.argv.slice(sp + 2), { stdio: ['ignore', 'pipe', 'inherit'] }) : null;
const input = child ? child.stdout : process.stdin;
let filled = 0, frames = 0, bytes = 0, last = 0;
const gaps = [], t0 = process.hrtime.bigint(), c0 = process.cpuUsage();
const buf = Buffer.allocUnsafe(FB);
input.on('data', (d) => {
  bytes += d.length;
  let off = 0;
  while (off < d.length) {
    const take = Math.min(FB - filled, d.length - off);
    d.copy(buf, filled, off, off + take); filled += take; off += take;
    if (filled === FB) { filled = 0; frames++; const now = Number(process.hrtime.bigint() - t0) / 1e6; if (last) gaps.push(now - last); last = now; }
  }
});
input.on('end', () => {
  const ms = Number(process.hrtime.bigint() - t0) / 1e6, cpu = process.cpuUsage(c0), s = [...gaps].sort((a, b) => a - b);
  const q = (p) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null);
  console.error(JSON.stringify({ ev: 'reader', frameBytes: FB, frames, bytes, seconds: Math.round(ms) / 1000, fps: Math.round((frames * 1e5) / ms) / 100, mbPerS: Math.round(bytes / ms / 1e3), gapP50: q(0.5), gapP95: q(0.95), cpuOneCorePct: Math.round(((cpu.user + cpu.system) / 1e3 / ms) * 1000) / 10 }));
});
