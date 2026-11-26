'use strict';
// A STAND-IN STORE-WRITER THREAD for in-process suites (channel-store-off-loop: test-channel-store-loop-free and
// test-channel-store-writer-laws). It runs the REAL writeJob (src/store-writer-worker.js) after the milliseconds named in
// `<ctl>/hold-<basename>` (if that file exists); `<ctl>/fail-<basename>` = that file's write fails (EIO, the storage
// refusing); `<ctl>/die-<basename>` = the thread EXITS as that file's write reaches it (once: the switch is removed — the writer's
// thread lost in flight; the writer restarts it); `<ctl>/dieafter-<basename>` = the thread exits right AFTER that file's write, before
// its answer (once: the file renamed, the reply lost); every hold or refusal it applies is appended to `<ctl>/applied-<basename>`
// (`applied(base)`, a control's witness — 主开发 r5135 law 1). `make(ctl)` writes the worker script into `ctl` and returns its path with the switches:
//   const S = make(dir); SW.create({ workerPath: S.path, ... }); S.hold('adapters.json', 600); S.unhold(...); S.failOn(..., true)
const fs = require('fs');
const path = require('path');
const WORKER = path.join(__dirname, '..', '..', 'src', 'store-writer-worker.js');

function make(ctl) {
  fs.mkdirSync(ctl, { recursive: true });
  const file = path.join(ctl, 'stand.cjs');
  fs.writeFileSync(file, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const path = require('path');
const { writeJob } = require(${JSON.stringify(WORKER)});
const S = new Int32Array(workerData.sab), Z = new Int32Array(new SharedArrayBuffer(4)), CTL = ${JSON.stringify(ctl)};
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null;
  const b = path.basename(m.file), hold = path.join(CTL, 'hold-' + b), die = path.join(CTL, 'die-' + b), dieAfter = path.join(CTL, 'dieafter-' + b);
  if (m.ev === 'write' && fs.existsSync(die)) { try { fs.unlinkSync(die); } catch { } process.exit(7); }
  if (fs.existsSync(hold)) { try { fs.appendFileSync(path.join(CTL, 'applied-' + b), 'hold '); } catch { } let ms = 0; try { const seq = fs.readFileSync(hold, 'utf8').split(' ').filter(Boolean); ms = Number(seq[0]) || 0; if (seq.length > 1) fs.writeFileSync(hold, seq.slice(1).join(' ')); } catch { } Atomics.wait(Z, 0, 0, ms); }
  if (fs.existsSync(path.join(CTL, 'fail-' + b))) { try { fs.appendFileSync(path.join(CTL, 'applied-' + b), 'fail '); } catch { } err = { code: 'EIO', message: 'the storage failed' }; }
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } }
  else { try { writeJob(m); } catch (e) { err = { code: e.code || null, message: e.message }; try { fs.unlinkSync(m.tmp); } catch { } } }
  if (m.ev === 'write' && fs.existsSync(dieAfter)) { try { fs.unlinkSync(dieAfter); } catch { } process.exit(8); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (err && S.byteLength >= 48) { const c = Buffer.from(String(err.code || 'EWRITE').slice(0, 32), 'latin1'); new Uint8Array(S.buffer, 16, 32).set(c); Atomics.store(S, 3, c.length); } else Atomics.store(S, 3, 0);
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 1);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err });
});
`);
  return {
    path: file,
    hold: (base, ms) => fs.writeFileSync(path.join(ctl, 'hold-' + base), String(ms)),
    // a SEQUENCE of holds (r5209's leg): each write of the file takes the next number, the last one stays — holdSeq(base, [0, 400])
    holdSeq: (base, list) => fs.writeFileSync(path.join(ctl, 'hold-' + base), list.map((x) => String(Number(x) || 0)).join(' ')),
    unhold: (base) => { try { fs.unlinkSync(path.join(ctl, 'hold-' + base)); } catch { } },
    die: (base) => fs.writeFileSync(path.join(ctl, 'die-' + base), '1'),
    dieAfter: (base) => fs.writeFileSync(path.join(ctl, 'dieafter-' + base), '1'),
    failOn: (base, on) => { const f = path.join(ctl, 'fail-' + base); if (on) fs.writeFileSync(f, '1'); else try { fs.unlinkSync(f); } catch { } },
    // 主开发 r5135 law 1: what the thread APPLIED to a file's writes (every process whose writer runs this thread appends here) —
    // a control's witness that its placed hold or refusal was in force: ['hold', 'fail', …] in the order applied
    applied: (base) => { try { return fs.readFileSync(path.join(ctl, 'applied-' + base), 'utf8').split(' ').filter(Boolean); } catch { return []; } },
    clearApplied: (base) => { try { fs.unlinkSync(path.join(ctl, 'applied-' + base)); } catch { } },
  };
}

module.exports = { make };
