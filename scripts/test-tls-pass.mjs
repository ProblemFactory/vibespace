#!/usr/bin/env node
// test-tls-pass — lane tls-pass-retry (2026-10-13, owner on .260 "我现在是260，怎么用不了https地址"): the https PASS
// (src/server/tls.js) over a STUB tailscale (never the real one) — what each raw failure becomes, the log line it leaves,
// and when the next automatic pass runs (fake timers). MEASURED cause: the boot loop was held past execFile's 10 s
// `timeout`, whose kill destroys the UNREAD stdout — an answer the child gave in ms came back `code 0, out ''` ⇒ "Tailscale
// is not running". §1 a held loop keeps the answer (CONTROL: the base runChild loses it — RED); §2 sleeps past the bound /
// half a JSON / Running then a miss ⇒ plan + log + cadence; §3 POST /api/tls/recheck — people only, a pass now.
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
const mode = (m) => fs.writeFileSync(modeFile, m);
const calls = () => { try { return fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ BackendState: 'Running', Self: { DNSName: DNS + '.' }, CertDomains: [DNS] }));
fs.writeFileSync(stub, `#!/bin/sh
D='${dir}'
echo "$1" >> "$D/calls"
if [ "$1" = cert ]; then cp "$D/leaf.crt" "$3"; cp "$D/leaf.key" "$5"; exit 0; fi
case "$(cat "$D/mode")" in
  sleep) exec sleep 5 ;;
  half) printf '{"BackendState":"Run' ;;
  run) cat "$D/status.json" ;;
esac
`, { mode: 0o755 });
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(dir, 'leaf.key'), '-out', path.join(dir, 'leaf.crt'), '-days', '30', '-subj', '/CN=' + DNS, '-addext', 'subjectAltName=DNS:' + DNS], { stdio: 'ignore' });

/** a hub over the stub with fake timers: every scheduled pass is recorded (ms) and fired by hand */
function hub(tag) {
  const lines = [], timers = [];
  const fake = { setTimeout: (fn, ms) => { const t = { fn, ms, unref() { } }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.cleared = true; } };
  const data = path.join(dir, tag); fs.mkdirSync(data);
  const h = TLS.create({ app: express(), httpServer: http.createServer(), dataDir: data, port: 3456, tailscaleBin: stub, statusTimeoutMs: 300, timers: fake, log: { log: (s) => lines.push(s), warn: (s) => lines.push(s) } });
  const next = () => timers.filter((t) => !t.cleared).at(-1);
  return { h, lines, timers, next, fire: async () => { const t = next(); t.cleared = true; await t.fn(); } };
}
try {
  console.log('§1 a held loop past the bound keeps the answer the child already gave');
  {
    mode('run');
    const held = async (runChild) => { const p = runChild(stub, ['status', '--json'], 200); const until = Date.now() + 700; while (Date.now() < until); return p; };
    const r = await held(TLS.runChild);
    ok(r.code === 0 && JSON.parse(r.out).Self.DNSName === DNS + '.' && r.ms >= 700, `the answer survives a 700 ms hold over a 200 ms bound (code ${r.code}, ${r.out.length} bytes, ${r.ms} ms)`);
    const t = await TLS.runChild(stub, ['status', '--json'], 50000);
    ok(t.code === 0 && t.ms < 5000, `a free loop: ${t.ms} ms`);
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
