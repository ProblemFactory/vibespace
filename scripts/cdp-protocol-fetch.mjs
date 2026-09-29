#!/usr/bin/env node
// THE CDP PROTOCOL FIXTURE WRITER (verify S2 r4, 2026-09-26; the browser-flag-census.mjs shape): launches ONE scratch
// headless Chrome, reads its own `GET /json/protocol` and `/json/version`, and writes the NAMES-ONLY listing under
// scripts/fixtures/cdp-protocol-<chrome version>/ — what test-cdp-census / test-browser-mediation ⑥ census
// src/cdp-census.js against, launch-free. Parameter SCHEMAS are dropped on purpose (types, descriptions, returns — the
// census classes METHODS; a 690 KB fixture would carry nothing the legs read). Since lane-cdp-154 (2026-09-28) a
// listing also carries each command's parameter NAMES (`params`, an optional one ends in `?`) and each domain's EVENT
// names with theirs (`events`): the 153 → 154 diff could not say which methods changed their parameters or which events
// went, because the 153 fixture had neither — the next Chrome's diff can (`diffListings`). Re-run after a Chrome
// upgrade; the heavy leg (test-browser-mediation-chrome ⑥) compares the LIVE protocol of the Chrome it launched and
// prints every method the table lacks. NOT a test-*.mjs (no tier).
//   node scripts/cdp-protocol-fetch.mjs [--chrome /usr/bin/google-chrome] [--out scripts/fixtures] [--scratch-name cdp-protocol]
//   node scripts/cdp-protocol-fetch.mjs --diff <older version> <newer version>   (two fixtures under --out; prints the diff)
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
/** A parameter list as NAMES (`'url'`, an optional one `'referrer?'`) — never a type, a schema or a description. */
const paramNames = (list) => (Array.isArray(list) ? list : []).filter((p) => p && p.name).map((p) => p.name + (p.optional ? '?' : ''));
/** The names-only listing of a /json/protocol answer (the fixture's shape; `compare` in src/cdp-census.js reads it). */
export function namesOnly(protocol, version = {}) {
  return {
    browser: String(version.Browser || ''), protocolVersion: protocol && protocol.version ? `${protocol.version.major}.${protocol.version.minor}` : null, fetchedAt: new Date().toISOString(),
    how: 'GET /json/protocol of a scratch headless Chrome (scripts/cdp-protocol-fetch.mjs); schemas dropped — method, parameter and event NAMES, deprecated + experimental flags only',
    domains: (protocol && Array.isArray(protocol.domains) ? protocol.domains : []).map((d) => ({
      domain: d.domain, deprecated: !!d.deprecated || undefined, experimental: !!d.experimental || undefined,
      commands: (d.commands || []).map((c) => ({ name: c.name, deprecated: !!c.deprecated || undefined, experimental: !!c.experimental || undefined, params: paramNames(c.parameters) })),
      events: (d.events || []).map((e) => ({ name: e.name, deprecated: !!e.deprecated || undefined, experimental: !!e.experimental || undefined, params: paramNames(e.parameters) })),
    })),
  };
}
/**
 * PURE — what changed between two listings (fixtures or live protocols; a live one is read the same way): methods
 * added / removed / re-flagged (deprecated, experimental), domains added / removed / re-flagged, and — ONLY where BOTH
 * listings recorded them — commands whose parameter names changed and events added / removed / changed. A side that
 * never recorded parameters (the names-only fixtures before 2026-09-28) makes that part `null` with `unrecorded`
 * naming the side: an unknown is said, never reported as "nothing changed".
 */
export function diffListings(older, newer) {
  const doms = (l) => new Map((l && Array.isArray(l.domains) ? l.domains : []).map((d) => [d.domain, d]));
  const flags = (x) => `${x && x.deprecated ? 'deprecated' : ''}${x && x.experimental ? ' experimental' : ''}`.trim() || 'stable';
  const cmds = (l) => { const m = new Map(); for (const d of doms(l).values()) for (const c of (d.commands || [])) m.set(d.domain + '.' + c.name, c); return m; };
  const evs = (l) => { const m = new Map(); for (const d of doms(l).values()) for (const e of (d.events || [])) m.set(d.domain + '.' + e.name, e); return m; };
  const recordsParams = (l) => [...cmds(l).values()].some((c) => Array.isArray(c.params) || Array.isArray(c.parameters));
  const recordsEvents = (l) => [...doms(l).values()].some((d) => Array.isArray(d.events));
  const pnames = (c) => (Array.isArray(c.params) ? c.params : paramNames(c.parameters));
  const [da, db, ca, cb] = [doms(older), doms(newer), cmds(older), cmds(newer)];
  const out = {
    domains: { added: [...db.keys()].filter((k) => !da.has(k)).sort(), removed: [...da.keys()].filter((k) => !db.has(k)).sort(), reflagged: [...db.keys()].filter((k) => da.has(k) && flags(da.get(k)) !== flags(db.get(k))).map((k) => `${k}: ${flags(da.get(k))} → ${flags(db.get(k))}`) },
    methods: { added: [...cb.keys()].filter((k) => !ca.has(k)).sort(), removed: [...ca.keys()].filter((k) => !cb.has(k)).sort(), reflagged: [...cb.keys()].filter((k) => ca.has(k) && flags(ca.get(k)) !== flags(cb.get(k))).map((k) => `${k}: ${flags(ca.get(k))} → ${flags(cb.get(k))}`).sort() },
    params: null, events: null, unrecorded: [],
  };
  const sides = [['older', older], ['newer', newer]];
  const noParams = sides.filter(([, l]) => !recordsParams(l)).map(([s]) => s);
  if (noParams.length) out.unrecorded.push(...noParams.map((s) => `${s}: parameter names`));
  else {
    const changed = [];
    for (const [k, c] of cb) {
      if (!ca.has(k)) continue;
      const a = pnames(ca.get(k)), b = pnames(c);
      if (a.join() !== b.join()) changed.push({ method: k, added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });
    }
    out.params = { changed };
  }
  const noEvents = sides.filter(([, l]) => !recordsEvents(l)).map(([s]) => s);
  if (noEvents.length) out.unrecorded.push(...noEvents.map((s) => `${s}: events`));
  else {
    const [ea, eb] = [evs(older), evs(newer)];
    const changed = [];
    for (const [k, e] of eb) { if (!ea.has(k)) continue; const a = pnames(ea.get(k)), b = pnames(e); if (a.join() !== b.join()) changed.push({ event: k, added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) }); }
    out.events = { added: [...eb.keys()].filter((k) => !ea.has(k)).sort(), removed: [...ea.keys()].filter((k) => !eb.has(k)).sort(), changed };
  }
  return out;
}
/** Launch a scratch Chrome, read its protocol, end it. `{ok, version, protocol, error}` — never throws (a binary that
 *  cannot be spawned is `{ok:false}`, and the scratch root is removed either way). */
export async function fetchLiveProtocol({ chrome = CHROME, root = scratch('cdp-protocol') } = {}) {
  if (!chrome) return { ok: false, error: 'no chrome binary' };
  fs.mkdirSync(root, { recursive: true });
  const port = await freePort();
  let spawnError = null;
  const c = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(root, 'ud')}`, 'about:blank'], { stdio: 'ignore', detached: true });
  // lane-cdp-154: a missing / unrunnable binary is an 'error' EVENT — unheard, it crashed the process and left the root
  c.on('error', (e) => { spawnError = e; });
  try {
    let version = null;
    for (let i = 0; i < 150 && !version && !spawnError; i++) { const r = await getJson(`http://127.0.0.1:${port}/json/version`); if (r.status === 200 && r.json && r.json.webSocketDebuggerUrl) version = r.json; else await new Promise((r2) => setTimeout(r2, 100)); }
    if (spawnError) return { ok: false, error: `could not start ${chrome}: ${spawnError.code || spawnError.message}` };
    if (!version) return { ok: false, error: 'chrome did not answer /json/version' };
    const p = await getJson(`http://127.0.0.1:${port}/json/protocol`);
    if (p.status !== 200 || !p.json) return { ok: false, error: `/json/protocol answered ${p.status}` };
    return { ok: true, version, protocol: p.json };
  } finally {
    if (c.pid) { try { process.kill(-c.pid, 'SIGKILL'); } catch { try { c.kill('SIGKILL'); } catch { /* gone */ } } }
    await new Promise((r) => setTimeout(r, 400));
    try { endRootedProcesses(root); } catch { /* none */ }
    fs.rmSync(root, { recursive: true, force: true });
  }
}
export function chromeVersionOf(version) { const m = /Chrome\/(\d+\.\d+\.\d+\.\d+)/.exec(String(version && version.Browser || '')); return m ? m[1] : null; }
const fixtureOf = (v) => JSON.parse(fs.readFileSync(path.join(OUT, `cdp-protocol-${v}`, 'protocol.json'), 'utf8'));
if (import.meta.url === `file://${process.argv[1]}`) {
  const di = process.argv.indexOf('--diff');
  if (di > 0) {
    const [a, b] = process.argv.slice(di + 1, di + 3);
    console.log(JSON.stringify({ from: a, to: b, ...diffListings(fixtureOf(a), fixtureOf(b)) }, null, 1));
    process.exit(0);
  }
  const r = await fetchLiveProtocol({ root: scratch(arg('--scratch-name', 'cdp-protocol')) });
  if (!r.ok) { console.error('cdp-protocol-fetch:', r.error); process.exit(1); }
  const cv = chromeVersionOf(r.version) || 'unknown';
  const dir = path.join(OUT, `cdp-protocol-${cv}`); fs.mkdirSync(dir, { recursive: true });
  const listing = namesOnly(r.protocol, r.version);
  fs.writeFileSync(path.join(dir, 'protocol.json'), JSON.stringify(listing, null, 1) + '\n');
  console.log(JSON.stringify({ chrome: cv, protocol: listing.protocolVersion, domains: listing.domains.length, methods: listing.domains.reduce((n, d) => n + d.commands.length, 0), events: listing.domains.reduce((n, d) => n + d.events.length, 0), file: path.relative(REPO, path.join(dir, 'protocol.json')) }));
}
