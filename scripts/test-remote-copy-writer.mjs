#!/usr/bin/env node
// test-remote-copy-writer — lane bl-loop-b, B-0248 step 2 unit 4 (主开发 r3320 / r3883): A REMOTE TRANSCRIPT's WHOLE COPY IS THE
// STORE WRITER's. src/hosts.js wrote a remote transcript's whole cached copy (up to the 64 MB fetch cap) by writeFileSync + rename
// ON THE LOOP after a mkdir of its folder; now _landCacheWhole hands the fetched buffer to the store writer by reference and the
// copy's record (.meta) follows it once it is on disk. FAST, in-process: a real HostManager over a scratch data folder, a dial
// host whose device data plane is a stand-in (the remote file's bytes in memory), the real store writer's thread.
//   ① a placed stall in every main-thread write under the data folder (scripts/fixtures/fs-stall.cjs): a ~1 MB whole refetch holds
//     nothing on the loop, the copy whole on disk and its record after it. RED: the instance's copy written at the call (the
//     release's mkdir + temp + rename on the loop) holds the loop a stall's length or more.
// (Its own suite, not a leg of test-codex-zst: that suite's time is its own — lane bl-loop-b, the unit's line.)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { scratchDir } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const home = scratchDir('remote-copy-writer');
const rec = (o) => JSON.stringify(o) + '\n';
const rollout = (tid, cwd, firstUser) => [
  rec({ timestamp: '2026-11-24T00:00:00.000Z', type: 'session_meta', payload: { id: tid, cwd, timestamp: '2026-11-24T00:00:00.000Z', cli_version: '0.153.4' } }),
  rec({ timestamp: '2026-11-24T00:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: firstUser }] } }),
  rec({ timestamp: '2026-11-24T00:00:02.000Z', type: 'turn_context', payload: { model: 'gpt-6-astra', cwd } }),
].join('');
// ── B-0248 step 2, unit 4 (lane bl-loop-b, 主开发 r3320 / r3883): A WHOLE REFETCH IS WRITTEN BY THE STORE WRITER ──────────────
// The release wrote a remote transcript's whole copy (up to the 64 MB fetch cap) by writeFileSync + rename ON THE LOOP, after a
// mkdir of its folder: on the tree's slow-storage road that held the loop for the rename's whole delay (the page
// bl-loop-b/b0248-page.md, row 7). A placed 300 ms stall in every main-thread write under the hub's data folder
// (scripts/fixtures/fs-stall.cjs; the writer's thread loads its own fs, never held): a ~1 MB whole fetch (a stall is per call, not per byte)
console.log('① B-0248 unit 4: a remote transcript\'s WHOLE refetch is the store writer\'s — the loop never waits for its write');
{
  const STALL = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));
  const STALL_MS = 300, TICK_MS = 10;   // three stalled calls in the red (its mkdir, write, rename): the suite's time
  const lateMeter = () => { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; };
  const TIDW = '77777777-6666-4555-8444-333333333333';
  const filler = Array.from({ length: 500 }, (_, i) => rec({ timestamp: '2026-11-24T00:00:10.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `turn ${i} ` + 'w'.repeat(2000) }] } })).join('');
  const big = Buffer.from(rollout(TIDW, '/work/whole', 'a long remote thread') + filler);
  let nW = 0;
  const wholeScene = async (HMc, { release = false } = {}) => {
    const dataDir = path.join(home, 'hostdata-b0248-' + (++nW)); fs.mkdirSync(dataDir, { recursive: true });
    const hm = new HMc({ dataDir });
    hm._state.hosts.push({ id: 'hw', name: 'W', transport: 'dial' });
    hm._ssh = async () => { throw new Error('the legacy ssh rung must not be needed here'); };
    // the RED copy: this instance's whole copy written AT THE CALL, the release's mkdir + temp + rename on the loop
    if (release) hm._landCacheWhole = async (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file); };
    const rp = `/home/u/.codex/sessions/2026/11/24/rollout-2026-11-24T00-00-00-${TIDW}.jsonl`;
    hm.deviceBounded = async () => ({
      runCmd: async () => ({ stdout: rp + '\n', stderr: '', code: 0 }),
      fsStat: async () => ({ stat: { size: big.length, mtimeMs: 1000 * 1000 } }),
      fsReadRange: async (p, off, len) => ({ data: big.subarray(off, off + len) }),
    });
    const S = STALL.install({ under: dataDir, ms: STALL_MS }), meter = lateMeter();
    let got = null, err = null, late = null;
    try { got = await hm.fetchTranscript('hw', 'codex', TIDW); } catch (e) { err = e && e.message; } finally { late = meter.stop(); S.restore(); }
    let same = false, meta = null; try { same = fs.readFileSync(got).equals(big); meta = JSON.parse(fs.readFileSync(got + '.meta', 'utf8')); } catch { }
    const st = S.calls.filter((c) => c.kind === 'write' && c.stalled);
    return { late, err, same, metaSize: meta && meta.size, stalled: st.length, fns: [...new Set(st.map((c) => c.fn))] };
  };
  const { HostManager: HMW } = require(path.join(REPO, 'src/hosts.js'));
  const A = await wholeScene(HMW);
  ok(A.late < STALL_MS && A.stalled === 0 && A.same && A.metaSize === big.length && !A.err, `① THE PLACED STALL (${STALL_MS} ms in every main-thread write under the data folder): a ${(big.length / 1048576).toFixed(1)} MB whole refetch, the loop's worst lateness ${A.late} ms < one stall, NO main-thread write stalled, the copy whole on disk and its record after it`, A);
  const AX = await wholeScene(HMW, { release: true });
  ok(AX.late >= STALL_MS && AX.stalled > 0, `① RED control (the release's whole write: mkdir + temp + rename on the loop): the loop is held a stall's length or more (${AX.late} ms; ${AX.stalled} main-thread writes stalled: ${AX.fns.join(', ')}) (red)`, AX);
}

report();
