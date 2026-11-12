#!/usr/bin/env node
// THE CDP METHODS OUR DRIVER SENDS — names only, the binary never run (lane chrome-157 round 2, 主开发's condition 6:
// «nothing our own tools send on a mediated lease lacks a census row»; the second reader's extractor, int359/acc-398/c157/rebuild-3).
//
// A method with no census row is refused by name on every mediated lease (src/browser-mediation.js judge), so a method the
// agent's driver (agent-browser) needs that the census lacks would be an OUTAGE, not a feature probe's -32601. This reads the
// driver's binary as BYTES: every '.' preceded by a censused / fixture DOMAIN, the identifier after it matched to the LONGEST
// known method or event name it starts with — a binary's string table runs names together («…contentSizePage.captureScreenshot»,
// «Emulation.setTimezoneOverridedeviceScaleFactor…»), so a name is never assumed to end at a non-identifier byte (the lane's first
// extraction did, and found 20 fused fragments). A Domain.word that is no known name is listed `unmatched` — reviewed by hand
// (page JavaScript in the driver's bundled dashboard: CSS.escape, Storage.getItem, a component's displayName…) and recorded in
// the fixture's `notCdp`, so a NEW unmatched name on a re-extraction is red until judged.
//
//   node scripts/agent-browser-cdp-census.mjs <agent-browser binary>            print { version, methods, events, unmatched }
//   node scripts/agent-browser-cdp-census.mjs <agent-browser binary> --write    (re)write scripts/fixtures/browser-verbs/cdp-methods-<version>.json
//
// The version is the package.json beside the binary (bin/../package.json) — read, never `--version`. Gate: test-cdp-census ⑨.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** The names the extraction can recognise: every censused Chrome's fixture (commands + events) and every census row. */
export function knownNames(repo = REPO) {
  const C = require(path.join(repo, 'src/cdp-census.js'));
  const FIX = path.join(repo, 'scripts/fixtures');
  const methods = new Set(), events = new Set(), domains = new Set();
  for (const d of fs.readdirSync(FIX).filter((x) => x.startsWith('cdp-protocol-'))) {
    for (const dom of JSON.parse(fs.readFileSync(path.join(FIX, d, 'protocol.json'), 'utf8')).domains) {
      domains.add(dom.domain);
      for (const c of dom.commands || []) methods.add(dom.domain + '.' + (c.name || c));
      for (const e of dom.events || []) events.add(dom.domain + '.' + (e.name || e));
    }
  }
  for (const r of C.rows()) { domains.add(r.domain); methods.add(r.domain + '.' + r.method); }
  return { methods, events, domains };
}

/** Extract from a buffer / latin1 string: `{ methods, events, unmatched }`, each sorted and de-duplicated. */
export function extract(bytes, known = knownNames()) {
  const buf = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('latin1');
  const doms = [...known.domains].sort((a, b) => b.length - a.length);
  const found = new Set(), unmatched = new Set();
  let i = -1;
  while ((i = buf.indexOf('.', i + 1)) !== -1) {
    const d = doms.find((x) => i >= x.length && buf.startsWith(x, i - x.length));
    if (!d) continue;
    const m = /^[a-z][A-Za-z0-9]*/.exec(buf.slice(i + 1, i + 120));
    if (!m) continue;
    let best = null;
    for (let L = m[0].length; L > 0; L--) { const n = d + '.' + m[0].slice(0, L); if (known.methods.has(n) || known.events.has(n)) { best = n; break; } }
    if (best) found.add(best); else unmatched.add(d + '.' + m[0]);
  }
  return {
    methods: [...found].filter((n) => known.methods.has(n)).sort(),
    events: [...found].filter((n) => !known.methods.has(n)).sort(),
    unmatched: [...unmatched].sort(),
  };
}

/** The driver's version, read from the package.json beside the binary (never by running it). */
export function versionBeside(bin) {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(bin), '..', 'package.json'), 'utf8')).version || null; } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [bin, flag] = process.argv.slice(2);
  if (!bin) { console.error('usage: node scripts/agent-browser-cdp-census.mjs <agent-browser binary> [--write]'); process.exit(2); }
  const version = versionBeside(bin);
  const r = extract(fs.readFileSync(bin));
  const out = { version, extractedFrom: path.basename(bin) + ' (names only — read as bytes, never run)', methods: r.methods, events: r.events, unmatched: r.unmatched };
  if (flag === '--write') {
    if (!version) { console.error('no package.json beside the binary — the version is unknown; nothing written'); process.exit(1); }
    const file = path.join(REPO, 'scripts/fixtures/browser-verbs', `cdp-methods-${version}.json`);
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const notCdp = Object.fromEntries(r.unmatched.map((n) => [n, (prev.notCdp && prev.notCdp[n]) || 'UNJUDGED — read the binary around it and say what it is']));
    fs.writeFileSync(file, JSON.stringify({ version, measured: new Date().toISOString().slice(0, 10), extractedFrom: out.extractedFrom, methods: r.methods, events: r.events, notCdp }, null, 1) + '\n');
    console.log(`wrote ${path.relative(REPO, file)}: ${r.methods.length} methods, ${r.events.length} events, ${r.unmatched.length} not CDP`);
  } else console.log(JSON.stringify(out, null, 1));
}
