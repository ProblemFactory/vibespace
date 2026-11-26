#!/usr/bin/env node
// THE DESKTOP-SERVE SOURCE CENSUSES AND PINS (fast — source text, plus the op tables read off src/desktop-serve.js and src/app-serve.js
// loaded in-process; no browser, server or hub — lane text-legs, B-94d3). MOVED VERBATIM from the heavy
// scripts/test-desktop-serve.mjs (its runner, keeper, bridge, routes and every mutant-copy CONTROL stay there): §1 the runner answers
// every op of its table BY NAME (src/desktop-serve.js, src/app-serve.js) with the census's own CONTROL, the src/ callers' op census,
// §3 the daemon wiring and the shared tier (src/agentd/agentd.js, src/agentd/client.js, src/app-system-serve.js, data/bin/
// vibespace-agentd.js), §8's relay pins (src/server/stream-relay-rfb.js, src/server/stream-relay-xpra.js) and §bdisp's keeper pin
// (src/server/desktop-app-keeper.js). Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change.
// Run: node scripts/test-desktop-serve-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const DS = require(path.join(REPO, 'src/desktop-serve.js'));
let pass = 0, fail = 0;

const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); } };

console.log('§1 the census — the runner names every op of its table (source)');
const OPS = DS.DESKTOP_SERVE_OPS;
const AS = require('../src/app-serve.js');
const serveSrc = read('src/desktop-serve.js');
const runnerSrc = serveSrc.slice(serveSrc.indexOf('async function runDesktopServeOp('));
const appRunnerSrc = read('src/app-serve.js').slice(read('src/app-serve.js').indexOf('async function runAppOp('));
const handled = OPS.filter((op) => runnerSrc.includes(`op === '${op}'`) || (op === 'relaunch' && /\/\/ relaunch\n\s*return \{ ok: true, \.\.\.\(await ds\.relaunch\(/.test(runnerSrc))
  || (AS.APP_OPS.includes(op) && /if \(AS\.APP_OPS\.includes\(op\)\) return AS\.runAppOp\(ds\.apps, op, params\);/.test(runnerSrc) && (appRunnerSrc.includes(`op === '${op}'`) || (op === 'app-refresh' && /\/\/ app-refresh\n\s*return \{ ok: true, \.\.\.\(await apps\.recordRefresh\(/.test(appRunnerSrc)))));
ok(handled.length === OPS.length, `the runner answers every table op BY NAME (${handled.length}/${OPS.length}: ${OPS.filter((o) => !handled.includes(o)).join(' ') || 'none missing'})`);

{
  const from = "    if (op === 'fit') {";
  ok(serveSrc.split(from).length === 2, 'CONTROL setup: the fit branch is spelled once');
  const cut = serveSrc.replace(from, "    if (false) {");
  const cutRunner = cut.slice(cut.indexOf('async function runDesktopServeOp('));
  ok(!cutRunner.includes("op === 'fit'"), 'CONTROL: the census\'s by-name rule reddens a runner that stopped naming an op of its table');
}

{
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(path.join(REPO, d))) { const p = d + '/' + e; if (fs.statSync(path.join(REPO, p)).isDirectory()) walk(p); else if (/\.(js|mjs|cjs)$/.test(e)) files.push(p); } })('src');
  const RE = /(?:\bdesktopServe|\bdesktopAccess\.call)\(\s*(?:[\w.]+,\s*)?'([\w-]+)'/g;
  const RE_ACC = /\.call\(\s*[\w.]+,\s*'([\w-]+)'/g; // a file that requires the desktop access layer: every `.call(host, '<op>'`
  const sites = [];
  for (const f of files) {
    const t = read(f);
    for (const m of t.matchAll(RE)) sites.push([f, m[1]]);
    if (/require\([^)]*desktop-access[^)]*\)/.test(t) && f !== 'src/server/desktop-access.js') for (const m of t.matchAll(RE_ACC)) sites.push([f, m[1]]);
  }
  const outside = sites.filter(([, op]) => !OPS.includes(op));
  ok(outside.length === 0, `every literal op a src/ caller names is in the table (${sites.length} site(s)${outside.length ? '; outside: ' + JSON.stringify(outside) : ''})`);
  const planted = "desktopAccess.call(h, 'shell-exec', {})";
  ok([...planted.matchAll(RE)].map((m) => m[1]).join() === 'shell-exec', 'CONTROL: the census pattern reads a planted caller\'s op (it would be refused)');
}

console.log('§3 the daemon wiring (three-touch rule) and the SHARED tier');
{
  const ag = read('src/agentd/agentd.js'), cl = read('src/agentd/client.js');
  const caps = /capabilities: \[([^\]]*)\]/.exec(ag);
  ok(caps && /'desktop-serve'/.test(caps[1]), 'the hello-ack names the `desktop-serve` capability');
  const h = ag.slice(ag.indexOf("if (msg.op === 'desktop-serve') {"), ag.indexOf("if (msg.op === 'desktop-serve') {") + 1600);
  ok(h.length > 100 && /require\('\.\/\.\.\/desktop-serve\.js'\)/.test(h) && /runDesktopServeOp\(await desktopServe\(\)/.test(h), 'the handler requires the SHARED module (bundled) and runs its runner against the process\'s ONE machine keeper');
  ok((h.match(/mux\.control\(\{ op: 'desktop-serve-result', id: msg\.id, (result: r|error: String\(e\.message \|\| e\)) \}\)/g) || []).length === 2, 'both arms reply `desktop-serve-result` with the request id (touch 1: the op rides the reply)');
  ok(/^let dsKeeper = null;$/m.test(ag) && /if \(dsKeeper\) return dsReady;/.test(ag) && !/this\._?dsKeeper|this\.dsKeeper/.test(ag), 'ONE machine keeper per daemon PROCESS (module-level, never on `this` = the connection)');
  ok(/dsKeeper\.adoptAll\(\)[\s\S]{0,160}dsKeeper\.start\(\)/.test(ag) && /isLiveState\(r\.state\)\)\) desktopServe\(\);/.test(ag), 'the daemon adopts before its tick, and re-adopts at BOOT when its record holds a live session');
  const route = /if \(m\.op === 'fs-result'[^\n]*\) \{/.exec(cl);
  ok(route && route[0].includes("m.op === 'desktop-serve-result'"), 'the client\'s id-keyed routing set carries desktop-serve-result (a reply outside it would never resolve)');
  const meth = cl.slice(cl.indexOf('async desktopServe('), cl.indexOf('async desktopServe(') + 1400);
  ok(/capabilities\?\.includes\?\.\('desktop-serve'\)/.test(meth) && /e\.code = 'host_needs_daemon'; throw e;/.test(meth) && meth.indexOf("includes?.('desktop-serve')") < meth.indexOf('_request('), 'client.desktopServe asks ONLY a daemon that advertises it — otherwise host_needs_daemon, before any request (an unknown op HANGS)');
  const reqs = [...serveSrc.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(reqs.every((r) => ['fs', 'os', 'path', './storage-path.js' /* lane hub-fuse-sync-guard: PURE — the storage roots the witness classifies by */, './store-read.js' /* lane lg-store-writes: PURE — the store-read law (a record file that cannot be read is held) */, './desktop-apps', './desktop-pin' /* lane e2b: PURE, imports nothing */, './office-open' /* §7.9: PURE — the LibreOffice rows + the open-with verdict */, './keeper-limits', './desktop-display', './argv-words.js' /* rel254 verify F4b: PURE, requires nothing — a launch journalled as one line */, './conversation-env.js' /* r2271: PURE (no requires) — the handed mark an app's env carries */, './remoteapp' /* lane remoteapp-r1a: PURE, imports nothing — the RemoteApp request / argv / verdicts */, './app-serve' /* Layer 0 apps: SHARED (builtins + the PURE app-manifest + desktop-apps) */].includes(r)), `the SHARED module requires only builtins + the PURE models + the machine facts (${reqs.join(' ')}) — never src/server`);
  const asReqs = [...read('src/app-serve.js').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(asReqs.every((r) => ['fs', 'path', 'os', 'crypto', 'child_process', 'https', 'dns', './egress-fence.js' /* lane webhook-l1-server: addressVerdict's home (SHARED) */, './app-manifest.js', './desktop-apps.js', './install-slot.js', './app-kinds/index.js' /* lanes dc-apps-rows, dc-app-kinds: PURE, imports nothing but its siblings */, './app-squashfs.js', './app-system-serve.js' /* Layer 1: the app system's machine half (SHARED, pinned below) */, './app-system.js' /* Layer 1: PURE */, './app-witness.js' /* lane apps-launcher-witness: PURE, requires nothing (the .desktop reader is handed in) */, './app-kinds/flatpak.js', './app-kinds/registered.js', './argv-words.js' /* lane app-register-model: the flatpak door + the registered kind (PURE kind rows) + the argv splitter (PURE) — each requires nothing */, './agentd/durable-file.js' /* B-574d (lane bl-machines-b): THE device's one door — the index takes its name only after ONE sync (SHARED: node's fs and path only) */].includes(r)) && [...read('src/app-manifest.js').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).join() === './install-slot,./app-kinds/index.js' && read('src/install-slot.js').match(/require\(/g) === null && fs.readdirSync(path.join(REPO, 'src/app-kinds')).every((f) => [...read(`src/app-kinds/${f}`).matchAll(/require\(([^)]*)\)/g)].every((m) => /^'\.\/[a-z0-9-]+\.js'$/.test(m[1]))), `…and src/app-serve.js requires only builtins + the two PURE models + the Layer 1 pair (${asReqs.join(' ')}); src/app-manifest.js requires only the PURE package slot (requires NOTHING) + the kind folder (each file requires only its siblings — lane dc-app-kinds) — was: requires NOTHING`);
  const ssReqs = [...read('src/app-system-serve.js').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(ssReqs.length > 0 && ssReqs.every((r) => ['fs', 'path', './app-system.js', './app-manifest.js'].includes(r)) && [...read('src/app-system.js').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).join() === './install-slot', `…and Layer 1's src/app-system-serve.js requires only fs + path + the PURE pair (${ssReqs.join(' ')}); src/app-system.js requires only the PURE package slot (PKG_RE + apt's lock wait — lane dc-apps-rows)`);
  ok(caps && /'app-install'/.test(caps[1]) && /if \(\/\^app-\/\.test\(String\(action\)\) && !conn\.info\?\.capabilities\?\.includes\?\.\('app-install'\)\) \{[^\n]*e\.code = 'host_needs_daemon'; throw e; \}/.test(meth) && meth.indexOf("includes?.('app-install')") < meth.indexOf('_request('), 'Layer 0: the hello-ack names `app-install` and the client asks the app-* actions ONLY of a daemon that names it — before any request (an older daemon is never asked)');
  const bundle = path.join(REPO, 'data/bin/vibespace-agentd.js');
  if (fs.existsSync(bundle)) { const b = read('data/bin/vibespace-agentd.js'); ok(/capabilities: \[[^\]]*["']desktop-serve["'][^\]]*\]/.test(b) && /function runDesktopServeOp/.test(b), 'the BUILT daemon bundle carries the capability and the runner (npm run build:agentd)'); }
}

console.log('§8 the relays connect live (source pins)');
{
  const src = read('src/server/stream-relay-rfb.js') + read('src/server/stream-relay-xpra.js'); // F-B4: the upstream connects live in the relays
  ok((src.match(/net\.connect\(port, '127\.0\.0\.1'\)/g) || []).length === 1 && (src.match(/new WebSocketClient\(`ws:\/\/127\.0\.0\.1:\$\{port\}\/`/g) || []).length === 1, 'the two upstream connects are unchanged — they take the endpoint\'s port (the protocol is end to end: seats, backpressure, pings, closes untouched)');
}

console.log('§bdisp the hub keeper hands launchDisplay out (source pin)');
ok(/launchDisplay: machine\.launchDisplay/.test(read('src/server/desktop-app-keeper.js')), '§bdisp the hub keeper hands launchDisplay out (this machine only)');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
