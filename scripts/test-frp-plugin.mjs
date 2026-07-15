#!/usr/bin/env node
// LIVE test for the frp plugin (B-0b60 public exposure) against the REAL frps
// relay. Needs the relay env: reads ~/workspace/39AI/vibespace-deploy/frp/
// frps-secrets.env (private) if VIBESPACE_FRPS_* aren't already set. Installs
// frpc into ~/.vibespace/plugins/frp, publishes a local echo server, and
// verifies the public URL round-trips. Skips (exit 0) if no relay config.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// pull relay config from the private secrets file if not in env
if (!process.env.VIBESPACE_FRPS_ADDR) {
  const sec = path.join(os.homedir(), 'workspace/39AI/vibespace-deploy/frp/frps-secrets.env');
  try {
    const suffix = { FRPS_SERVER: 'ADDR', FRPS_BIND_PORT: 'PORT', FRPS_TOKEN: 'TOKEN' };
    for (const line of fs.readFileSync(sec, 'utf-8').split('\n')) {
      const m = line.match(/^(FRPS_\w+)=(.*)$/); if (!m || !suffix[m[1]]) continue;
      process.env['VIBESPACE_FRPS_' + suffix[m[1]]] = m[2];
    }
  } catch {}
}
if (!process.env.VIBESPACE_FRPS_ADDR || !process.env.VIBESPACE_FRPS_TOKEN) {
  console.log('SKIP: no frp relay configured (set VIBESPACE_FRPS_ADDR/TOKEN)');
  process.exit(0);
}

const { PluginManager } = require('../src/plugins.js');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n      ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pm = new PluginManager({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-frp-')), broadcast: () => {} });
let echoSrv, published;
try {
  const st0 = pm.status('frp');
  check('plugin reports configured (relay env present)', st0.configured === true && st0.publicHost === process.env.VIBESPACE_FRPS_ADDR, JSON.stringify(st0));

  await pm.install('frp');
  check('frpc installs', pm.status('frp').installed === true);

  pm.start('frp');
  await sleep(2000);
  check('frpc daemon starts + connects', pm.status('frp').running === true);

  // a local "dev server"
  const echoPort = await new Promise((res) => {
    echoSrv = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('PUB:'), d]))));
    echoSrv.listen(0, '127.0.0.1', () => res(echoSrv.address().port));
  });

  published = await pm.frpPublish('vstest-fwd', echoPort);
  check('frpPublish returns a public URL', /^http:\/\/.+:\d+\/$/.test(published.url || ''), JSON.stringify(published));

  // the public URL must round-trip through the relay back to our echo server
  const host = published.publicHost, port = published.remotePort;
  let reply = '';
  for (let i = 0; i < 10 && !reply.includes('PUB:hi'); i++) {
    reply = await new Promise((res) => {
      const c = net.connect(port, host, () => c.write('hi'));
      let b = ''; c.on('data', (d) => { b += d; if (b.includes('PUB:hi')) { c.end(); res(b); } });
      c.on('error', () => res('')); setTimeout(() => { try { c.destroy(); } catch {} res(b); }, 2500);
    });
    if (!reply.includes('PUB:hi')) await sleep(800);
  }
  check('bytes round-trip PUBLICLY through the relay', reply.includes('PUB:hi'), JSON.stringify(reply));

  await pm.frpUnpublish('vstest-fwd');
  await sleep(1500);
  // after unpublish the public port must STOP working
  const gone = await new Promise((res) => {
    const c = net.connect(port, host, () => c.write('hi'));
    let b = ''; c.on('data', (d) => { b += d; }); c.on('error', () => res(true));
    c.on('close', () => res(!b.includes('PUB:hi'))); setTimeout(() => { try { c.destroy(); } catch {} res(!b.includes('PUB:hi')); }, 2500);
  });
  check('unpublish closes the public port', gone === true);
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { echoSrv?.close(); } catch {}
  try { await pm.frpUnpublish('vstest-fwd'); } catch {}
  try { pm.stop('frp'); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nfrp plugin test passed');
process.exit(failed ? 1 : 0);
