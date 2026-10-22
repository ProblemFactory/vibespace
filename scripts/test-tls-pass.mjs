#!/usr/bin/env node
// test-tls-pass — lane tls-pass-retry (2026-10-13, owner on .260 "我现在是260，怎么用不了https地址"): the https PASS
// (src/server/tls.js) over a STUB tailscale (never the real one) — what each raw failure becomes, the log line it leaves,
// and when the next automatic pass runs (fake timers). MEASURED cause: the boot loop was held past execFile's 10 s
// `timeout`, whose kill destroys the UNREAD stdout — an answer the child gave in ms came back `code 0, out ''` ⇒ "Tailscale
// is not running". §1 a held loop keeps the answer (CONTROL: the base runChild loses it — RED); §2 sleeps past the bound /
// half a JSON / Running then a miss ⇒ plan + log + cadence; §3 POST /api/tls/recheck — people only, a pass now.
// Lane gate-flakes-341 (the 2.369.341 fast gate, load 18→25: «half a JSON ⇒ status-unreadable (0 bytes)» red, green alone):
// the stub is a SHELL, and on that box one free call took 14.9 s — the half stub had not printed when the hub's 300 ms bound
// answered TIMEOUT (0 bytes, honestly: nothing had arrived). No row judges whether a shell starts within a bound any more: a
// stub that ANSWERS gets 60 s (the bound answers only for `sleep`), and §1's hold lasts until the child HAS answered.
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TLS = require(path.join(REPO, 'src/server/tls.js'));
const express = require(path.join(REPO, 'node_modules/express'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const DNS = 'box-a.tail1a2b3c.ts.net';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tlspass-'));
const stub = path.join(dir, 'tailscale'), modeFile = path.join(dir, 'mode'), callsFile = path.join(dir, 'calls');
let cur = null;
const mode = (m) => { cur = m; fs.writeFileSync(modeFile, m); };
const calls = () => { try { return fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ BackendState: 'Running', Self: { DNSName: DNS + '.' }, CertDomains: [DNS] }));
fs.writeFileSync(stub, `#!/bin/sh
D='${dir}'
echo "$1" >> "$D/calls"
echo $$ > "$D/pid"
if [ "$1" = cert ]; then cp "$D/leaf.crt" "$3"; cp "$D/leaf.key" "$5"; exit 0; fi
case "$(cat "$D/mode")" in
  sleep) exec sleep 5 ;;
  half) printf '{"BackendState":"Run' ;;
  halfblock) printf '{"BackendState":"Run'; : > "$D/wrote"; exec sleep 5 ;;
  slowhalf) sleep 1; printf '{"BackendState":"Run' ;;
  run) cat "$D/status.json" ;;
esac
`, { mode: 0o755 });
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(dir, 'leaf.key'), '-out', path.join(dir, 'leaf.crt'), '-days', '30', '-subj', '/CN=' + DNS, '-addext', 'subjectAltName=DNS:' + DNS], { stdio: 'ignore' });

/** THE BOUND: the hub's 300 ms answers for the `sleep` stub; a stub that answers (half a JSON, the status, the cert) gets 60 s —
 *  the reader's verdict on what it said is judged, never how fast a loaded box started a shell. `run: null` = the hub's own. */
const ANSWER_MS = 60000;
const answering = (bin, args, ms) => TLS.runChild(bin, args, cur === 'sleep' ? ms : Math.max(ms, ANSWER_MS));
/** a hub over the stub with fake timers: every scheduled pass is recorded (ms) and fired by hand */
function hub(tag, { run = answering } = {}) {
  const lines = [], timers = [];
  const fake = { setTimeout: (fn, ms) => { const t = { fn, ms, unref() { } }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.cleared = true; } };
  const data = path.join(dir, tag); fs.mkdirSync(data);
  const h = TLS.create({ app: express(), httpServer: http.createServer(), dataDir: data, port: 3456, tailscaleBin: stub, statusTimeoutMs: 300, timers: fake, ...(run ? { run } : {}), log: { log: (s) => lines.push(s), warn: (s) => lines.push(s) } });
  const next = () => timers.filter((t) => !t.cleared).at(-1);
  return { h, lines, timers, next, fire: async () => { const t = next(); t.cleared = true; await t.fn(); } };
}
try {
  console.log('§1 a held loop past the bound keeps the answer the child already gave');
  {
    mode('run');
    // THE HOLD: ≥ 700 ms (past the 200 ms bound) AND until the child HAS answered — exited (a held loop reaps nothing: its pid is a zombie) or, `wrote`,
    // its bytes are in the pipe — never a fixed 700 ms a loaded box may not fit a shell's start in (bounded: 60 s)
    const exited = () => { let pid = ''; try { pid = fs.readFileSync(path.join(dir, 'pid'), 'utf8').trim(); } catch { } if (!/^\d+$/.test(pid)) return false; try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0] === 'Z'; } catch { return true; } }; // no /proc: the 700 ms
    const wrote = () => fs.existsSync(path.join(dir, 'wrote'));
    const held = async (runChild, done = exited, minMs = 700) => { for (const f of ['pid', 'wrote']) fs.rmSync(path.join(dir, f), { force: true }); const p = runChild(stub, ['status', '--json'], 200); const t0 = Date.now(); while ((Date.now() - t0 < minMs || !done()) && Date.now() - t0 < 60000); return p; };
    const r = await held(TLS.runChild);
    ok(r.code === 0 && JSON.parse(r.out).Self.DNSName === DNS + '.' && r.ms >= 700, `the answer survives a 700 ms hold over a 200 ms bound (code ${r.code}, ${r.out.length} bytes, ${r.ms} ms)`);
    // …and the PART it gave: half a JSON, then it blocks — the bound answers TIMEOUT with those 20 bytes, never «0 bytes»
    mode('halfblock'); const hb = await held(TLS.runChild, wrote, 300); mode('run');
    ok(hb.code === 'TIMEOUT' && hb.out === '{"BackendState":"Run', `a held loop keeps the PART the child gave too: half a JSON, then it blocks ⇒ ${hb.code} with its ${Buffer.byteLength(hb.out)} bytes`);
    const t = await TLS.runChild(stub, ['status', '--json'], 50000);
    // (lane wall-clock-ratchet-down: the old `t.ms < 5000` judged the machine — the free loop's answer is the child's
    // own exit 0 and its whole status; the ms are information)
    ok(t.code === 0 && JSON.parse(t.out).Self.DNSName === DNS + '.', `a free loop: ${t.ms} ms`);
    // CONTROL: the base runChild (execFile's own timeout) — the same hold throws the answer away
    const base = path.join(dir, 'base'); fs.mkdirSync(path.join(base, 'server'), { recursive: true });
    let baseSrc = null;
    try { baseSrc = execFileSync('git', ['-C', REPO, 'show', '4d8f5bf5f:src/server/tls.js'], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { }
    if (!baseSrc) console.log('  SKIP §1 CONTROL — the base object 4d8f5bf5f is not in this clone (a shallow checkout)');
    else {
      fs.writeFileSync(path.join(base, 'server/tls.js'), baseSrc);
      fs.copyFileSync(path.join(REPO, 'src/tls-plan.js'), path.join(base, 'tls-plan.js'));
      const b = await held(require(path.join(base, 'server/tls.js')).runChild);
      ok(b.code === 0 && b.out === '' && b.err === '', `CONTROL base runChild: the same hold gives code ${b.code}, out ${JSON.stringify(b.out)} — the owner's "not running" (RED)`);
    }
  }
  console.log('§2 the pass over the stub: plan + log line + the next pass');
  {
    const A = hub('a'); mode('sleep'); A.h.start(); await A.h.pass();
    let s = A.h.status();
    ok(s.why === 'status-unreadable' && s.probe && s.probe.code === 'TIMEOUT' && s.probe.bound === 300, `sleeps past the bound ⇒ ${s.why}, probe ${JSON.stringify(s.probe)}`);
    ok(A.lines.some((l) => /^\[tls\] tailscale status: timed out after 300 ms \(\d+ ms, 0 bytes out\)/.test(l)), `the raw line is logged: ${A.lines.find((l) => /timed out/.test(l))}`);
    ok(A.next() && A.next().ms === 60000 && s.nextPassMs === 60000, `a boot miss ⇒ the next pass in ${A.next() && A.next().ms / 1000} s`);
    mode('half'); await A.fire(); s = A.h.status();
    ok(s.why === 'status-unreadable' && s.probe.code === 0 && s.probe.bytes === 20, `half a JSON ⇒ ${s.why} (${s.probe.bytes} bytes), never no-tailscale`);
    ok(A.lines.some((l) => l.startsWith('[tls] tailscale status: exit 0 but no readable JSON (')), 'its raw line is logged');
    ok(A.next().ms === 300000, `the 2nd boot miss ⇒ ${A.next().ms / 1000} s`);
    await A.fire(); ok(A.next().ms === 3600000, `the 3rd ⇒ ${A.next().ms / 1000} s (hourly)`);
    mode('run'); await A.fire(); s = A.h.status();
    ok(s.serving && s.url === `https://${DNS}:3456` && s.probe === null && calls().includes('cert'), `Running ⇒ the certificate is fetched and served: ${s.url}`);
    ok(A.next().ms === 3600000, 'serving ⇒ hourly');
    mode('half'); await A.fire(); s = A.h.status();
    ok(s.why === 'status-unreadable' && A.next().ms === 3600000, `a miss after a served pass keeps the hourly cadence (${A.next().ms / 1000} s)`);
    A.h.stop(); ok(A.next() === undefined, 'stop clears the timer');
    // RED CONTROL: the leg before lane gate-flakes-341 — the hub's own 300 ms bound over a stub as slow as that loaded box's
    // (it prints after 1 s) answers TIMEOUT with 0 bytes and logs no «exit 0» line: the gate's two red rows, by construction
    const C = hub('c', { run: null }); mode('slowhalf'); C.h.start(); await C.h.pass(); const sc = C.h.status(); C.h.stop();
    const D = hub('d'); D.h.start(); await D.h.pass(); const sd = D.h.status(); D.h.stop();
    ok(sc.why === 'status-unreadable' && sc.probe.code === 'TIMEOUT' && sc.probe.bytes === 0 && !C.lines.some((l) => l.startsWith('[tls] tailscale status: exit 0 but no readable JSON (')) && sd.probe && sd.probe.code === 0 && sd.probe.bytes === 20 && D.lines.some((l) => l.startsWith('[tls] tailscale status: exit 0 but no readable JSON (')), `RED CONTROL: the same half a JSON from a stub that needs 1 s — the hub's 300 ms bound reads ${sc.probe.code} (${sc.probe.bytes} bytes, no «exit 0» line: the .341 red); the answering bound reads exit ${sd.probe && sd.probe.code} (${sd.probe && sd.probe.bytes} bytes)`);
  }
  console.log('§3 POST /api/tls/recheck — people only, a pass now');
  {
    const B = hub('b'); mode('half'); B.h.start(); await B.h.pass();
    const app = express(); B.h.registerRoutes(app);
    const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r));
    const url = `http://127.0.0.1:${srv.address().port}/api/tls/recheck`;
    try {
      mode('run'); const before = calls().length;
      for (const tok of ['vsst_abc123', 'jbt_abc123']) {
        const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + tok } });
        const j = await r.json();
        ok(r.status === 403 && j.code === 'agent-forbidden' && calls().length === before, `an agent token (${tok.slice(0, 5)}) is refused by name and runs no pass`);
      }
      const r = await fetch(url, { method: 'POST' }); const j = await r.json();
      ok(r.status === 200 && j.serving && j.url === `https://${DNS}:3456` && j.probe === null, `the person's press re-plans now: unreadable → ${j.url}`);
      ok(B.next().ms === 3600000, 'and the cadence follows the new plan (hourly)');
    } finally { srv.close(); B.h.stop(); }
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
