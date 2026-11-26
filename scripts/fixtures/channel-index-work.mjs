// B-360d found holder 1 (lane bl-loop-b, 主开发 r4598 / r4690): THE INDEX's PRODUCE AND LANDING IN WORK — a child of
// test-channel-index-burst, so the work meter (scripts/work-meter.mjs) starts before the store module is loaded. argv: <the store
// module's path> <a scratch folder> <rows>. The scene, at `rows` and at 2 × `rows`: a store whose layout is built in slices (a small
// sync bound), `rows` rows BORN in one update; the writer's own produce and landing of the index are measured where the writer calls
// them (its dirty() is wrapped, nothing else changes): the FIRST produce that answers with bytes (the layout landed in slices before
// it) and its landing. Out: ONE JSON line { p1, p2, l1, l2 } — the work (blocks + native, never a clock) of those calls at each size
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startWorkMeter, measure } from '../work-meter.mjs';
const [, , MOD, DIR, ROWS] = process.argv;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
startWorkMeter();
const require = createRequire(import.meta.url);
const { createChannelStore } = require(MOD);
const SW = require(path.join(REPO, 'src/store-writer.js'));
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function workOf(rows, tag) {
  const dir = path.join(DIR, tag);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet }), d0 = w.dirty, got = { p: null, l: null };
  w.dirty = (file, o) => {
    if (o && /index\.json$/.test(String(file))) {
      const p0 = o.produce, w0 = o.onWritten;
      o = { ...o,
        ...(typeof p0 === 'function' ? { produce: (...a) => { let r; const m = measure(() => { r = p0(...a); }, [MOD]); if (got.p === null && r && typeof r === 'object') got.p = m.total; return r; } } : {}),
        ...(typeof w0 === 'function' ? { onWritten: (...a) => { let r; const m = measure(() => { r = w0(...a); }, [MOD]); if (got.p !== null && got.l === null) got.l = m.total; return r; } } : {}) };
    }
    return d0(file, o);
  };
  const st = createChannelStore({ dir, log: quiet, writer: w, walk: { syncRows: 64 } });
  await st.index.update(() => { for (let i = 0; i < rows; i++) { const e = st.index.entry('acct', `c${i}`); e.title = `t${i}`; e.lastAt = 1_700_000_000_000 + i; } });
  for (let i = 0; i < 3000 && got.l === null; i++) await pause(5);
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return got;
}
const a = await workOf(Number(ROWS), 'n'), b = await workOf(2 * Number(ROWS), 'n2');
process.stdout.write(JSON.stringify({ p1: a.p, p2: b.p, l1: a.l, l2: b.l }) + '\n');
process.exit(0);
