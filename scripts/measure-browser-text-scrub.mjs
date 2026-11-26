// MEASURE (run alone through the kit: `tb gate <wt> --one measure-browser-text-scrub`; never on a hub, never judged) — line 1051's
// follow (row B-360d, lane mask-value-shape, 主开发 r4754 (2) / r4795): THE SCRUB WORKER's OWN TEXT JOB, timed from its post to its
// answer on the REAL worker file (src/server/browser-scrub-worker.js, the same compiled scrubber the loop uses), over eight text
// shapes, 32 and 128 made-up values, 1 and 4 MiB halves, then the three worst at 16 MiB. It prints rows and judges nothing: the
// reading behind SCRUB_FIG.textMax (src/server/browser-dialogs.js) and the CLI's SCRUB_HALF_MAX — a half the worker takes must
// fit, at twice its worst lawful time, inside the frames' 10 s turn bound. Read it again when the scrubber or the figures change.
// THE READING THE CAP CAME FROM (test machine 2, 2026-11-26, run adb5d05ea-20261126043753-box):
//   VALUES n=32 forms=591 compile+first-job 87.7 ms (answered)
//   ROW values=32 shape=prose MiB=1 ms=276.4 rate=276.4 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=prose MiB=4 ms=1218.6 rate=304.7 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=raw-dense MiB=1 ms=322.8 rate=322.8 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=raw-dense MiB=4 ms=1182.8 rate=295.7 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=views-dense MiB=1 ms=621.2 rate=621.2 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=views-dense MiB=4 ms=2313.9 rate=578.5 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=near-miss MiB=1 ms=411.4 rate=411.4 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=near-miss MiB=4 ms=2251.8 rate=562.9 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=near-miss-tight MiB=1 ms=558.5 rate=558.5 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=near-miss-tight MiB=4 ms=2571.5 rate=642.9 ms/MiB ANSWERED (changed)
//   ROW values=32 shape=json-snapshot MiB=1 ms=384.9 rate=384.9 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=json-snapshot MiB=4 ms=1798.8 rate=449.7 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=digits MiB=1 ms=46.9 rate=46.9 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=digits MiB=4 ms=211.1 rate=52.8 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=periodic MiB=1 ms=51.1 rate=51.1 ms/MiB ANSWERED (unchanged)
//   ROW values=32 shape=periodic MiB=4 ms=179.4 rate=44.9 ms/MiB ANSWERED (unchanged)
//   VALUES n=128 forms=2331 compile+first-job 132.3 ms (answered)
//   ROW values=128 shape=prose MiB=1 ms=148.0 rate=148.0 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=prose MiB=4 ms=868.4 rate=217.1 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=raw-dense MiB=1 ms=600.1 rate=600.1 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=raw-dense MiB=4 ms=2511.7 rate=627.9 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=views-dense MiB=1 ms=706.2 rate=706.2 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=views-dense MiB=4 ms=3616.6 rate=904.2 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=near-miss MiB=1 ms=616.9 rate=616.9 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=near-miss MiB=4 ms=3194.4 rate=798.6 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=near-miss-tight MiB=1 ms=855.8 rate=855.8 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=near-miss-tight MiB=4 ms=3726.3 rate=931.6 ms/MiB ANSWERED (changed)
//   ROW values=128 shape=json-snapshot MiB=1 ms=411.0 rate=411.0 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=json-snapshot MiB=4 ms=1704.9 rate=426.2 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=digits MiB=1 ms=61.1 rate=61.1 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=digits MiB=4 ms=248.7 rate=62.2 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=periodic MiB=1 ms=93.8 rate=93.8 ms/MiB ANSWERED (unchanged)
//   ROW values=128 shape=periodic MiB=4 ms=202.3 rate=50.6 ms/MiB ANSWERED (unchanged)
//   ROW16 values=128 shape=near-miss-tight MiB=16 ms=17662.1 rate=1103.9 ms/MiB ANSWERED
//   ROW16 values=128 shape=views-dense MiB=16 ms=15248.5 rate=953.0 ms/MiB ANSWERED
//   ROW16 values=128 shape=near-miss MiB=16 ms=16182.4 rate=1011.4 ms/MiB ANSWERED
//   WORST LAWFUL RATE 1103.9 ms/MiB (values=128 shape=near-miss-tight MiB=16 ms=17662.1); at 16 MiB that is 17.66 s
//   WORST LAWFUL 16 MiB HALF 17662.1 ms (values=128 shape=near-miss-tight)
// So: 16 MiB (the old cap) 17.7 s — past the bound; 4 MiB 3.7 s at worst, twice that 7.5 s — inside it. textMax = 4 MiB.
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VS = require(path.join(REPO, 'src/vault-scrubber.js'));
const WFILE = path.join(REPO, 'src/server/browser-scrub-worker.js');
const MiB = 1024 * 1024;
// made-up values, a web login's shapes: mixed case, digits, symbols; one periodic, one with a multi-byte letter
const ALPH = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+?';
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const word = (n) => Array.from({ length: n }, () => ALPH[Math.floor(rnd() * ALPH.length)]).join('');
const valuesOf = (n) => { const v = []; for (let i = 0; i < n; i++) v.push(i === 0 ? 'abababababababab9!' : i === 1 ? 'pässwörd-' + word(10) : word(12 + (i % 21))); return v.map((value, i) => ({ value, label: 'probe-' + i })); };
const fill = (unit, bytes) => { const u = Buffer.byteLength(unit, 'utf8'); let s = unit.repeat(Math.ceil(bytes / u)); while (Buffer.byteLength(s, 'utf8') > bytes) s = s.slice(0, s.length - Math.max(1, Math.floor((Buffer.byteLength(s, 'utf8') - bytes) / 2))); return s; };
const FILLER = 'lorem ipsum dolor sit amet, consectetur ';
function shapes(vals) {
  const forms = vals.flatMap((x) => VS.formsOf(x.value).map((f) => f.text));
  return {
    prose: () => FILLER + 'adipiscing elit sed do eiusmod tempor incididunt ut labore\n',
    'raw-dense': () => vals.map((x) => FILLER + x.value + ' ').join('') + '\n',
    'views-dense': () => forms.map((f) => FILLER + f + ' ').join('') + '\n',
    'near-miss': () => forms.map((f) => FILLER + f.slice(0, -1) + ' ').join('') + '\n',
    'near-miss-tight': () => forms.map((f) => f.slice(0, -1)).join('') + '\n',
    'json-snapshot': () => vals.map((x, i) => `{"ref":"e${i}","role":"textbox","name":"Field \\"${i}\\"","value":"${x.value.slice(0, 5)}\\n","n":${i * 37},"x":-12.5e3},`).join('') + '\n',
    digits: () => '1234567890 -12.5e3, 0.000123 ' + '9'.repeat(40) + ' ',
    periodic: () => 'ab'.repeat(512) + ' ',
  };
}
const w = new Worker(WFILE);
let seq = 0; const pend = new Map();
w.on('message', (m) => { if (m && m.type === 'done' && pend.has(m.seq)) { const r = pend.get(m.seq); pend.delete(m.seq); r(m); } });
const job = (text) => new Promise((resolve) => { const s = ++seq; const t0 = process.hrtime.bigint(); pend.set(s, (m) => resolve({ ms: Number(process.hrtime.bigint() - t0) / 1e6, m })); w.postMessage({ type: 'text', seq: s, text }); });
const rows = [];
for (const nv of [32, 128]) {
  const vals = valuesOf(nv);
  const t0 = process.hrtime.bigint();
  w.postMessage({ type: 'values', pairs: vals, sigs: [], minB: VS.MIN_MASK_BYTES, budgetMs: 5000 });
  const first = await job('x');   // the values' compile rides the first job's turn
  console.log(`VALUES n=${nv} forms=${vals.reduce((a, x) => a + VS.formsOf(x.value).length, 0)} compile+first-job ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms (${first.m.withheld ? 'withheld ' + first.m.withheld : 'answered'})`);
  const S = shapes(vals);
  for (const [name, unitOf] of Object.entries(S)) {
    for (const mib of [1, 4]) {
      const text = fill(unitOf(), mib * MiB);
      const { ms, m } = await job(text);
      const out = m.r && typeof m.r.out === 'string' ? m.r.out : null;
      const row = { nv, name, mib, ms, lawful: !!out, why: m.withheld || '', changed: out != null && out !== text };
      rows.push(row);
      console.log(`ROW values=${nv} shape=${name} MiB=${mib} ms=${ms.toFixed(1)} rate=${(ms / mib).toFixed(1)} ms/MiB ${row.lawful ? 'ANSWERED' + (row.changed ? ' (changed)' : ' (unchanged)') : 'WITHHELD (' + row.why + ')'}`);
    }
  }
}
// 16 MiB: the three worst LAWFUL rates at 4 MiB, each once
const top = rows.filter((r) => r.mib === 4 && r.lawful).sort((a, b) => b.ms - a.ms).slice(0, 3);
for (const t of top) {
  const vals = valuesOf(t.nv); w.postMessage({ type: 'values', pairs: vals, sigs: [], minB: VS.MIN_MASK_BYTES, budgetMs: 5000 }); await job('x');
  const text = fill(shapes(vals)[t.name](), 16 * MiB);
  const { ms, m } = await job(text);
  const out = m.r && typeof m.r.out === 'string' ? m.r.out : null;
  rows.push({ nv: t.nv, name: t.name, mib: 16, ms, lawful: !!out, why: m.withheld || '' });
  console.log(`ROW16 values=${t.nv} shape=${t.name} MiB=16 ms=${ms.toFixed(1)} rate=${(ms / 16).toFixed(1)} ms/MiB ${out ? 'ANSWERED' : 'WITHHELD (' + m.withheld + ')'}`);
}
const lawful = rows.filter((r) => r.lawful && r.mib >= 4).sort((a, b) => b.ms / b.mib - a.ms / a.mib);
const wst = lawful[0];
console.log(`WORST LAWFUL RATE ${(wst.ms / wst.mib).toFixed(1)} ms/MiB (values=${wst.nv} shape=${wst.name} MiB=${wst.mib} ms=${wst.ms.toFixed(1)}); at 16 MiB that is ${(16 * wst.ms / wst.mib / 1000).toFixed(2)} s`);
const w16 = rows.filter((r) => r.mib === 16 && r.lawful).sort((a, b) => b.ms - a.ms)[0];
if (w16) console.log(`WORST LAWFUL 16 MiB HALF ${w16.ms.toFixed(1)} ms (values=${w16.nv} shape=${w16.name})`);
await w.terminate();
console.log('MEASURE DONE');
