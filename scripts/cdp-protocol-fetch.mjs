#!/usr/bin/env node
// THE CDP PROTOCOL FIXTURE WRITER (verify S2 r4, 2026-09-26; the browser-flag-census.mjs shape): launches ONE scratch
// headless Chrome, reads its own `GET /json/protocol` and `/json/version`, and writes the NAMES-ONLY listing under
// scripts/fixtures/cdp-protocol-<chrome version>/ — what test-browser-mediation ⑥ censuses src/cdp-census.js against,
// launch-free. Parameter schemas are dropped on purpose (the census classes METHODS; a 690 KB fixture would carry
// nothing the leg reads). Re-run after a Chrome upgrade; the heavy leg (test-browser-mediation-chrome ⑥) compares the
// LIVE protocol of the Chrome it launched and prints every method the table lacks. NOT a test-*.mjs (no tier).
//   node scripts/cdp-protocol-fetch.mjs [--chrome /usr/bin/google-chrome] [--out scripts/fixtures]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
const REPO = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const CHROME = arg('--chrome', ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p)) || '');
const OUT = path.resolve(REPO, arg('--out', 'scripts/fixtures'));
const getJson = (url) => new Promise((res) => http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { j = null; } res({ status: r.statusCode, json: j }); }); }).on('error', (e) => res({ status: 0, error: e.message })));
/** The names-only listing of a /json/protocol answer (the fixture's shape; `compare` in src/cdp-census.js reads it). */
export function namesOnly(protocol, version = {}) {
  return {
    browser: String(version.Browser || ''), protocolVersion: protocol && protocol.version ? `${protocol.version.major}.${protocol.version.minor}` : null, fetchedAt: new Date().toISOString(),
    how: 'GET /json/protocol of a scratch headless Chrome (scripts/cdp-protocol-fetch.mjs); parameter schemas dropped — method names, deprecated + experimental flags only',
    domains: (protocol && Array.isArray(protocol.domains) ? protocol.domains : []).map((d) => ({ domain: d.domain, deprecated: !!d.deprecated || undefined, experimental: !!d.experimental || undefined, commands: (d.commands || []).map((c) => ({ name: c.name, deprecated: !!c.deprecated || undefined, experimental: !!c.experimental || undefined })) })),
  };
}
/** Launch a scratch Chrome, read its protocol, end it. `{ok, version, protocol, error}` — never throws. */
export async function fetchLiveProtocol({ chrome = CHROME, root = scratch('cdp-protocol') } = {}) {
  if (!chrome) return { ok: false, error: 'no chrome binary' };
  fs.mkdirSync(root, { recursive: true });
  const port = await freePort();
  const c = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(root, 'ud')}`, 'about:blank'], { stdio: 'ignore', detached: true });
  try {
    let version = null;
    for (let i = 0; i < 150 && !version; i++) { const r = await getJson(`http://127.0.0.1:${port}/json/version`); if (r.status === 200 && r.json && r.json.webSocketDebuggerUrl) version = r.json; else await new Promise((r2) => setTimeout(r2, 100)); }
    if (!version) return { ok: false, error: 'chrome did not answer /json/version' };
    const p = await getJson(`http://127.0.0.1:${port}/json/protocol`);
    if (p.status !== 200 || !p.json) return { ok: false, error: `/json/protocol answered ${p.status}` };
    return { ok: true, version, protocol: p.json };
  } finally {
    try { process.kill(-c.pid, 'SIGKILL'); } catch { try { c.kill('SIGKILL'); } catch { /* gone */ } }
    await new Promise((r) => setTimeout(r, 400));
    try { endRootedProcesses(root); } catch { /* none */ }
    fs.rmSync(root, { recursive: true, force: true });
  }
}
export function chromeVersionOf(version) { const m = /Chrome\/(\d+\.\d+\.\d+\.\d+)/.exec(String(version && version.Browser || '')); return m ? m[1] : null; }
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await fetchLiveProtocol();
  if (!r.ok) { console.error('cdp-protocol-fetch:', r.error); process.exit(1); }
  const cv = chromeVersionOf(r.version) || 'unknown';
  const dir = path.join(OUT, `cdp-protocol-${cv}`); fs.mkdirSync(dir, { recursive: true });
  const listing = namesOnly(r.protocol, r.version);
  fs.writeFileSync(path.join(dir, 'protocol.json'), JSON.stringify(listing, null, 1) + '\n');
  console.log(JSON.stringify({ chrome: cv, protocol: listing.protocolVersion, domains: listing.domains.length, methods: listing.domains.reduce((n, d) => n + d.commands.length, 0), file: path.relative(REPO, path.join(dir, 'protocol.json')) }));
}
