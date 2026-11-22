'use strict';
// scripts/test-channel-store-heap.mjs's child (主开发 r2542): ONE channel store opened over a stand-in index, its SETTLED heap
// printed (run under --expose-gc): the heap after the open's layout warm-up landed, less the heap before the store. argv: <store
// path> <repo> <data dir>
const path = require('path');
const [storePath, repo, dir] = process.argv.slice(2);
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const gcN = () => { for (let i = 0; i < 8; i++) global.gc(); };
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
(async () => {
  const SW = require(path.join(repo, 'src/store-writer.js'));
  const CS = require(storePath);
  await sleep(50); gcN(); const m0 = process.memoryUsage();
  const w = SW.create({ log: quiet });
  const st = CS.createChannelStore({ dir, log: quiet, writer: w });
  const rows = Object.keys(st.index.rows()).length;
  const warmed = () => Number((st.index.flushStats() || {}).layoutSliced) || 0;
  const t0 = Date.now(); while (Date.now() - t0 < 15000 && warmed() < 1) await sleep(50);
  await sleep(300); gcN(); await sleep(100); gcN();
  const m1 = process.memoryUsage();
  process.stdout.write(JSON.stringify({ rows, heap: m1.heapUsed - m0.heapUsed, warmed: warmed() }) + '\n');
  process.exit(0);
})().catch((e) => { process.stdout.write(JSON.stringify({ error: String((e && e.stack) || e).slice(0, 600) }) + '\n'); process.exit(1); });
