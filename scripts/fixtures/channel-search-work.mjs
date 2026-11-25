// B-360d found holder 3 (lane bl-loop-b, 主开发 r4581 / r4582): THE STORE's SEARCH IN WORK — a child of test-channel-search, so the
// work meter (scripts/work-meter.mjs) starts before the store module is loaded. argv: <the store module's path> <a scratch folder>
// <rows> <logs>. Out: ONE JSON line { w1, w2, r1, r2 } — the search's work (its blocks and its native work, never a clock) over an
// account of `rows` rows and over one of 2 × `rows` rows, each holding the same `logs` one-record logs (each reading the second of
// two takes: the per-account map built by the first), and the two answers (they must be the same)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startWorkMeter, measureAsync } from '../work-meter.mjs';
const [, , MOD, DIR, ROWS, LOGS] = process.argv;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
startWorkMeter();
const require = createRequire(import.meta.url);
const { createChannelStore } = require(MOD);
const { makeRecord } = require(path.join(REPO, 'src/channel-record.js'));
const T = 1_700_000_000_000, A = 'acct';
async function workOf(rows, tag) {
  const dir = path.join(DIR, tag);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const st = createChannelStore({ dir, log: { log() {}, warn() {} } });
  await st.index.update(() => { for (let i = 0; i < rows; i++) { const e = st.index.entry(A, `c${i}`); e.lastAt = T - i * 1000; e.title = `thread ${i}`; } });
  for (let j = 0; j < Number(LOGS); j++) { const c = `c${j * 3}`; st.appendRecords(A, c, [makeRecord({ adapterId: A, convId: c, vendorId: `${c}-m`, at: T - j, author: { id: 'u1', name: 'Ada' }, text: `a note ${j}`, mentions: [], attachments: [] })]); }
  let r = null;
  const ask = async () => { r = await st.search(A, 'note', { limit: 100 }); };
  await measureAsync(ask, [MOD]);
  const w = await measureAsync(ask, [MOD]);
  st.close();
  return { w: w.total, r: JSON.stringify(r) };
}
const one = await workOf(Number(ROWS), 'n'), two = await workOf(2 * Number(ROWS), 'n2');
process.stdout.write(JSON.stringify({ w1: one.w, w2: two.w, same: one.r === two.r, r1: one.r.slice(0, 200) }) + '\n');
process.exit(0);
