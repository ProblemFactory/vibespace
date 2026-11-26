// B-360d found holder 4 (lane bl-loop-b, 主开发 r4997): THE INDEX's WRITE AFTER BIRTHS, IN WORK — a child of test-channel-index-births,
// so the work meter (scripts/work-meter.mjs) starts before the store module is loaded. argv: <the store module's path> <a scratch
// folder> <births>. The scene, at `births` and at 2 × `births`: a small index on disk (10 rows), then `births` rows BORN in one update
// (under BURST_ROWS: journaled), then the index's write asked (fold). The writer's own produce of the index is measured where the writer
// calls it (its dirty() is wrapped, nothing else changes): the FIRST produce after the births (the one that decides: the cure answers
// LATER and lays the births out in slices; the release laid every one out here) and the first that answers with bytes. Out: ONE JSON
// line { d1, d2, f1, f2, later1, later2 } — the work (blocks + native, never a clock) of those calls at each size
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startWorkMeter, measure } from '../work-meter.mjs';
const [, , MOD, DIR, BIRTHS, MODE = 'births'] = process.argv;   // MODE 'touched' (r5065 (2)): a laid-out index of 16 × `n` rows (the larger size's every 8th row fits), `n` EXISTING rows touched (every 8th: the same rows a chunk at both sizes), no births
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
startWorkMeter();
const require = createRequire(import.meta.url);
const { createChannelStore } = require(MOD);
const SW = require(path.join(REPO, 'src/store-writer.js'));
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function workOf(births, tag) {
  const dir = path.join(DIR, tag);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const w = SW.create({ log: quiet }), d0 = w.dirty, got = { armed: false, d: null, f: null, later: false };
  w.dirty = (file, o) => {
    if (o && typeof o.produce === 'function' && /index\.json$/.test(String(file))) {
      const p0 = o.produce;
      o = { ...o, produce: (...a) => {
        let r; const m = measure(() => { r = p0(...a); }, [MOD]);
        if (got.armed) {
          if (got.d === null) { got.d = m.total; got.later = !(r && typeof r === 'object'); }
          if (got.f === null && r && typeof r === 'object') got.f = m.total;
        }
        return r;
      } };
    }
    return d0(file, o);
  };
  const st = createChannelStore({ dir, log: quiet, writer: w, walk: { syncRows: 64, sliceMs: 0 } });
  const BASE = MODE === 'touched' ? 16 * Number(BIRTHS) : 10;
  for (let p = 0; p < BASE; p += 500) await st.index.update(() => { for (let i = p; i < Math.min(BASE, p + 500); i++) { const e = st.index.entry('acct', `a${i}`); e.title = `t${i}`; e.lastAt = 1_700_000_000_000 + i; } });
  await st.index.fold();   // the index on disk (a small one, or the touched scene's 16 × n rows laid out): the next write is the births' or the touches'
  if (MODE === 'touched') { for (let p = 0; p < births; p += 500) await st.index.update(() => { for (let i = p; i < Math.min(births, p + 500); i++) st.index.entry('acct', `a${i * 8}`, { create: false }).title = `touched ${i}`; }); }   // every 8th row: 32 a chunk at both sizes
  else for (let p = 0; p < births; p += 500) await st.index.update(() => { for (let i = p; i < Math.min(births, p + 500); i++) { const e = st.index.entry('acct', `b${i}`); e.title = `t${i}`; e.lastAt = 1_700_000_000_000 + i; } });   // pages of 500: under BURST_ROWS, both sizes the journaled road
  got.armed = true;
  const done = st.index.fold().then((v) => v !== false, () => false);
  for (let i = 0; i < 6000 && got.f === null; i++) await pause(2);
  await done;
  got.stats = (({ full, incremental, layoutSliced, applySliced, layoutRestarts, fallback, bursts }) => ({ full, incremental, layoutSliced, applySliced, layoutRestarts, fallback, bursts }))(st.index.flushStats());
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return got;
}
const a = await workOf(Number(BIRTHS), 'n'), b = await workOf(2 * Number(BIRTHS), 'n2');
process.stdout.write(JSON.stringify({ d1: a.d, d2: b.d, f1: a.f, f2: b.f, later1: a.later, later2: b.later, s1: a.stats, s2: b.stats }) + '\n');
process.exit(0);
