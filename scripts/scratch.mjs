// Per-PROCESS scratch paths + free ports for the suites that spawn a throwaway
// server / headless chrome / git worktree (2.369.76). Fixed `/tmp/vs-<name>`
// paths and fixed ports were a MACHINE-wide collision: the heavy tier, a
// verifier agent running the same gate suite in its own worktree, and a
// developer's local run all shared `/tmp/vs-chatpage-smoke`, the chrome
// profile dir and port 3990 — one run's cleanup `git worktree remove --force`
// deleted another run's worktree mid-build (heavy tier RED at 40ad936d on
// test-chat-paging: esbuild lost its input, the retry's `worktree add` hit the
// path the other run had just recreated). 2.369.46 fixed ONE instance
// (test-chat-e2e's port 3995) inline; this is the third strike, so the idiom is
// shared and test-architecture sweeps every scripts/test-*.mjs for the fixed
// shapes. NOT a test-*.mjs on purpose: the tier census would demand a tier.
//
// SINCE 2026-09-09 the prefix and the tmp root are NOT literals here: they come
// from src/fixture-guard.js, the ONE declaration of what a fixture looks like.
// The production usage walk and session discovery skip exactly what this
// function mints, and the standing sweep (scripts/test-fixture-isolation.mjs)
// checks the real ~/.claude/projects for exactly what this function mints — so
// a suite that renames its scratch dir cannot walk out from under the guard.
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stampScratchRun, readRunRecord, runOwnerState, RUN_RECORD } from './scratch-run.mjs';
const require = createRequire(import.meta.url);
const { FIXTURE_CWD_PREFIX, TMP_ROOTS, FIXTURE_SID_PREFIX } = require('../src/fixture-guard.js');
const TEMP_SWEEPERS = require('../src/temp-sweepers.js');   // r1213: the PRODUCT's table of its temp-root sweepers (pure)
// B-ba47's follow-up pick (主开发 r791): A SUITE CARRIES NO CALLER CONVERSATION NAMES. Run from inside a conversation, a suite's
// children would reach the CALLER's hub with the caller's own credential (and a wrapper's leg read the caller's id). Removed at
// the FIRST import of this module, whether or not anything re-homes; src/conversation-env.js is the one list (test-architecture
// §112 holds it to the hub's injector sites). A suite that needs a conversation's names mints its own after the import.
// THE PROCESS MARKS STAY (主开发 r863 MUST 2): the conversation id and the two job marks are ids — no route, no credential — and
// they are how the person's Stop (src/left-behind.js) and a job's stop (src/jobs.js) find what a suite's children left behind;
// the line says they were kept. Names only on stderr, never a value.
// THE COMPUTED MARK (主开发 r979): with the hub's VIBESPACE_HANDED (the names the road that started the caller ADDED or
// CHANGED, written where the env was built), exactly those names go — a name nobody listed included — and the mark with
// them; a name the person's own shell set and the hub did not touch is in no mark and stays. Without a mark (a conversation
// started before it), the list in src/conversation-env.js is the floor. A harness that needs such a name sets it AFTER this
// import, in its own child, by name — never by inheritance.
const { withoutConversationNames } = require('../src/conversation-env.js');
export const CALLER_CONVERSATION_NAMES = (() => {
  const { dropped, kept, by } = withoutConversationNames(process.env, { keepMarks: true });
  for (const k of dropped) delete process.env[k];
  if (dropped.length) process.stderr.write(`scratch: the caller's conversation names are not carried: ${dropped.join(', ')}${kept.length ? `; the process marks are kept: ${kept.join(', ')}` : ''} (${by === 'mark' ? "by the hub's mark" : 'by the list: no mark'})\n`);
  return Object.freeze(dropped);
})();
export { stampScratchRun, readRunRecord, runOwnerState, RUN_RECORD };

/** The first-run Welcome wizard is skipped when localStorage 'vs-onboarded' is
 *  set OR when the machine already has sessions (app.js _checkOnboarding). A
 *  chrome suite that does not pre-set the flag is therefore GREEN on a
 *  developer box (whose ~/.claude has sessions) and RED on the Actions runner
 *  (empty ~/.claude): the wizard's modal covers the chrome under test and its
 *  own capture-phase Escape eats the first Esc (2.369.125 r7 — test-gear-menu's
 *  Esc legs, and the three suites red on every mirror run since 2.369.75).
 *  Every suite passes this to Page.addScriptToEvaluateOnNewDocument BEFORE its
 *  first Page.navigate; test-architecture §47 is the census.
 *  Lane vault-e2e-password: the same source snoozes the vault's setup ask (`vs-vault-later`, an epoch ms — src/lib/
 *  vault-unlock.js maybeNagVault): a scratch hub's vault is never set up, and its modal would cover the chrome under test
 *  the way the wizard did. A LOCKED vault's unlock modal is not snoozed by anything. */
/** The keys the preset writes. A suite that censuses what a PAGE stored excludes exactly these (test-slack-relay ④) — never
 *  a literal of its own: the .314 mirror went red when the vault key joined and the relay census still knew only the first. */
export const PRESET_KEYS = Object.freeze({ 'vs-onboarded': '1', 'vs-vault-later': '9999999999999', 'vs-rail-labels': 'done' });   // vs-rail-labels (lane door-day-one-landing): the first week's rail words, done
export const ONBOARDED_SOURCE = `try { ${Object.entries(PRESET_KEYS).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} } catch {}`;
// lane setting-doors (主开发 2026-11-16): EVERY Chrome a suite launches keeps its own store — Chrome's basic store flag + the mock
// keychain, the product's own src/browser-attach.js PROFILE_STORE (test-architecture pins the two equal) — so a suite never asks
// the session bus's Secret Service: a LOCKED login keyring hung 14 heavy Chrome suites to their full budget on 2026-11-15.
// scripts/chrome-store-census.mjs + test-architecture §47b: a Chrome launch without it is red.
export const CHROME_STORE = Object.freeze(['--password-store=basic', '--use-mock-keychain']);
// B-9dd0 unit 2 (主开发 2026-11-20 r198): EVERY Chrome a suite launches starts with its BACKGROUND NETWORK ROADS OFF — no
// component / variations / safe-browsing updates, no sync, no default apps, no pings, no domain-reliability or metrics uploads
// — so a suite's Chrome reaches only the loopback the suite drives (the hub under test, a stand-in), never Google's servers. No
// --disable-features here: a suite that passes its own would lose one of the two lists (Chrome keeps the last switch).
// scripts/chrome-store-census.mjs + test-architecture §47c: a Chrome launch without it is red.
// B-9dd0 (主开发 r3727): THE NAMES RULE, in the same list — every Chrome a suite launches resolves NO name but the loopback's
// and the suite's own: the measure (55394096f, 164 rows) saw every suite Chrome reach Google's background services in spite of
// the switches above. The switch and its grammar as the vendor's source has them (chromium.googlesource.com, tag 157.0.8103.78):
// services/network/public/cpp/network_switches.cc `kHostResolverRules[] = "host-resolver-rules"` («These mappings only apply to
// the host resolver»); net/base/host_mapping_rules.cc splits the list at «,» and a rule at « », the FIRST matching MAP wins, and an
// EXCLUDE that matches stops the search (the name resolves as usual); net/dns/mapped_host_resolver.cc fails a name mapped to
// «^NOTFOUND» with ERR_NAME_NOT_RESOLVED — on the box, no question leaves it. A suite that needs a name of its own gets it HERE:
// `map` (a name → an address, ahead of the rest) and `own` (EXCLUDE: resolved as usual) — never a switch of its own around this
// one (Chrome keeps the LAST copy of a switch). scripts/chrome-store-census.mjs + test-architecture §47d: a launch that names the
// switch itself is red by name.
export const chromeNames = ({ map = {}, own = [] } = {}) => {
  // r3968 / r4009: a name holding a space or a comma would SPLIT the rule (the vendor splits the list at «,» and a rule at « »);
  // a wildcard in `own` (« * » or « ? », base/strings/pattern.h's two) or an empty name would OPEN it (EXCLUDE * = the rule off):
  // each is refused by name, never written. Case needs nothing: the vendor lowers every pattern (AddRuleFromString:
  // `rule.hostname_pattern = base::ToLowerASCII(parts[1]);`) and a page's host is canonical lower case
  const word = (h, what) => { const v = String(h ?? ''); if (!v || /[\s,]/.test(v) || (what === 'own' && /[*?]/.test(v))) throw new Error(`chromeNames: ${what} «${v}» would ${v && /[\s,]/.test(v) ? 'split' : 'open'} the names rule — name each host, with no space, comma, star or question mark`); return v; };
  const maps = Object.entries(map || {}).map(([h, to]) => `MAP ${word(h, 'map')} ${word(to, 'map')}`);
  const keep = [...new Set([...(own || [])].map((h) => word(h, 'own')))].map((h) => `EXCLUDE ${h}`);
  return `--host-resolver-rules=${[...maps, 'MAP * ^NOTFOUND', 'EXCLUDE 127.0.0.1', 'EXCLUDE [::1]', 'EXCLUDE localhost', ...keep].join(', ')}`;
};
export const CHROME_QUIET = Object.freeze(['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--no-pings', '--disable-domain-reliability', '--metrics-recording-only', '--no-first-run', '--no-default-browser-check', chromeNames()]);
// B-9dd0's remainder (2) (主开发 r1134): THE BELT, for a Chrome whose page must reach only the suite's OWN targets — a dead proxy
// (127.0.0.1:9; Chrome never proxies the loopback) bypassed only for `own`, and a resolver that answers every NAME «not found»
// but the loopback's and `own`'s. `own` = the suite's own targets past the loopback (test-https-hub-chrome: the box's LAN address
// its hub serves on). THE GAP, named: the dead proxy and the resolver map do not cover the browser's direct UDP (WebRTC / STUN to
// an address literal). reachFrom (below) = the proof IN THE CHROME UNDER TEST, chromeReach = its CONTROL; each from a blank tab
// (no app CSP to report the probes).
export const chromeBelt = (own = []) => {
  const list = [...new Set([...own].map((h) => String(h || '')).filter(Boolean))];
  return Object.freeze(['--proxy-server=http://127.0.0.1:9', ...(list.length ? [`--proxy-bypass-list=${list.join(';')}`] : []), chromeNames({ own: list })]);   // r3727: the names rule from its ONE builder
};
// B-8695 (主开发 r4364): THE AGENT BROWSER's OWN CHROME. The real driver launches its Chrome with ONE line of switches — its config's
// `args` (a scratch HOME's ~/.agent-browser/config.json, a --config file) or AGENT_BROWSER_ARGS — and CUTS that line at every comma and
// every line break, each piece trimmed, empty pieces dropped: agent-browser 0.38.2 (the version the tree pins), its published source
// cli/src/native/actions.rs launch_options_from_env, `v.split([',', '\n']).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())`;
// the tree's own reading is src/browser-verbs.js driverArgsList. chromeNames' rule holds «, », so it arrives there in pieces: the
// catch-all alone (which takes 127.0.0.1 too) and stray words. So the line carries ONE rule with no comma: DRIVER_NAMES maps EVERY
// name, and an address written as numbers (the vendor's MatchPattern has no branch for one: the r3968 round), to the loopback, where
// every suite's own names and pages live. A page the agent browser opens at the box's own LAN address or name reaches it on the
// loopback; nothing it asks resolves off the box. The fence (allowedDomains) refuses no such switch (the same source:
// allowed_domains_disallowed_chrome_arg names profile, restore and app switches, startup URLs and positional words only).
export const DRIVER_NAMES = '--host-resolver-rules=MAP * 127.0.0.1';
/** THE ONE BUILDER of a suite's driver line (a config's `args`, an AGENT_BROWSER_ARGS): the switches handed (lists flattened),
 *  CHROME_QUIET's own names rule swapped for DRIVER_NAMES, DRIVER_NAMES last — written by the product's ONE writer of that line
 *  (src/browser-verbs.js driverArgsText), which refuses a switch the driver would cut (a comma or a line break inside it, a blank at
 *  an end) by name. Any other resolver rule is refused by name: the line holds one. scripts/chrome-store-census.mjs driverCensus +
 *  test-architecture §47e: a driver line a suite writes without it is red. → the line (a string) */
export const driverArgs = (...switches) => {
  const quiet = chromeNames(), list = switches.flat().map(String).filter((s) => s !== quiet);
  const rules = list.filter((s) => /^--host-resolver-rules(=|$)/.test(s));
  if (rules.length) throw new Error(`driverArgs: ${rules.map((s) => `«${s}»`).join(', ')} — the driver's line holds ONE resolver rule, DRIVER_NAMES (every name to the loopback, where a suite's own names live)`);
  const r = require('../src/browser-verbs.js').driverArgsText([...list, DRIVER_NAMES]);
  if (!r.ok) throw new Error(`driverArgs: ${r.error}`);
  return r.args;
};
/** B-9dd0's remainder (2) and the round's CONTROL (主开发 r1246; r1521: THE CHROME UNDER TEST is probed, never a second one):
 *  reachFrom(cdpPort) opens ONE fresh blank tab in the Chrome listening on `cdpPort` — the suite's OWN Chrome: its proxy and
 *  resolver switches are the whole browser's, so a tab of it is that browser — asks it three probes and closes the tab
 *  → { own, vendor, testnet } each 'reached' | 'refused' | 'timed out' (an opaque no-cors fetch resolves only when something
 *  answered), or { error }:
 *    own     — the box's OWN NAME at a listener of this process (0.0.0.0, a free port): a name that resolves and answers and is no
 *              target — the probe that tells a belt from no belt;
 *    vendor  — https://vendor.example/ (a reserved name: it never resolves, belt or not);
 *    testnet — https://192.0.2.1/ (often refused by the box's routing alone).
 *  The belt's leg: all three refused in the suite's own Chrome. Since r3727 CHROME_QUIET's names rule alone refuses all
 *  three (its catch-all takes an address written as numbers too), so the leg proves the suite's Chrome refuses them, rule and
 *  belt together, and no longer tells the belt from no belt (r3968): the CONTROL does that by the box's own name; its CONTROL
 *  (chromeReach below): `own` REACHED by a Chrome with no belt — where it is not, this box cannot show the belt and the suite
 *  says so by name (a SKIP), never a green it did not earn. test-ci-gate §2n: a suite that probes a second Chrome is red. */
export async function reachFrom(cdpPort, { timeoutMs = 20000 } = {}) {
  const http = (await import('node:http')).default, os = (await import('node:os')).default;
  const srv = http.createServer((q, r) => { r.writeHead(204, { 'access-control-allow-origin': '*' }); r.end(); });
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(0, '0.0.0.0', res); });
  const ownUrl = `http://${os.hostname()}:${srv.address().port}/`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let tab = null;
  try {
    for (const end = Date.now() + timeoutMs; !tab && Date.now() < end;) { try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }); if (r.ok) tab = await r.json(); } catch { /* not yet */ } if (!tab) await sleep(250); }
    if (!tab || !tab.webSocketDebuggerUrl) return { error: 'the Chrome under test opened no blank tab', ownUrl };
    const WebSocket = require('ws');
    const sock = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { sock.once('open', res); sock.once('error', rej); });
    const urls = [ownUrl, 'https://vendor.example/', 'https://192.0.2.1/'];
    const expression = `Promise.all(${JSON.stringify(urls)}.map((u) => Promise.race([fetch(u, { mode: 'no-cors', cache: 'no-store' }).then(() => 'reached', () => 'refused'), new Promise((r) => setTimeout(() => r('timed out'), 5000))])))`;
    const got = await new Promise((resolve) => { const t = setTimeout(() => resolve(null), 9000); sock.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (m.id === 1) { clearTimeout(t); resolve(m.result && m.result.result ? m.result.result.value : null); } }); sock.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); });
    try { sock.close(); } catch { /* gone */ }
    return Array.isArray(got) ? { own: got[0], vendor: got[1], testnet: got[2], ownUrl } : { error: 'the probe did not answer', ownUrl };
  } finally {
    if (tab && tab.id) { try { await fetch(`http://127.0.0.1:${cdpPort}/json/close/${tab.id}`); } catch { /* gone with its browser */ } }
    try { srv.closeAllConnections && srv.closeAllConnections(); } catch { /* none */ }
    await new Promise((r) => srv.close(() => r()));
  }
}
/** THE CONTROL's Chrome (r1246): ONE headless Chrome of its own with `args` beyond CHROME_QUIET + CHROME_STORE (none, for the
 *  control: no belt), probed by reachFrom on its own port; killed by its handle at the end. Never the belt's proof (r1521). */
export async function chromeReach(chromeBin, { args = [], env = process.env, dir, timeoutMs = 20000 } = {}) {
  const { spawn } = await import('node:child_process');
  const cdpPort = await freePort();
  fs.mkdirSync(dir, { recursive: true });
  // r3727: CHROME_QUIET's names rule refuses every name, the box's own too; the CONTROL proves the belt by reaching that one name,
  // so it gets it through the rule's allow list (`own`), the last copy of the switch (Chrome keeps the last) — never the rule left off
  // (r3968) a caller's `args` come AFTER this rule, so a caller's own copy would win: NO caller hands one — test-https-hub-chrome and
  // test-plugin-consent-chrome pass none; test-ci-gate's r1521 control plants a form with chromeBelt as TEXT, never launched
  const ch = spawn(chromeBin, [...CHROME_QUIET, chromeNames({ own: [os.hostname()] }), ...CHROME_STORE, ...args, '--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore', env });
  try { return await reachFrom(cdpPort, { timeoutMs }); }
  finally {
    try { ch.kill('SIGKILL'); } catch { /* gone */ }
    await new Promise((r) => { if (ch.exitCode !== null || ch.signalCode) return r(); ch.once('exit', r); setTimeout(r, 3000); });
  }
}
/** THE ONE RELAY of a server broadcast to a page (主开发 2026-11-20 04:54Z, lane bl-tests-chrome — 2.369.413's fourth hosted run:
 *  test-channel-window-render ⑫c walked the page's LIVE handler list and skipped the open picker's handler, right after a stale
 *  one that took itself out). Page-side JS source that hands ONE message object to every global handler over a SNAPSHOT of the
 *  list, each handler isolated — src/lib/ws.js's own dispatch (`[...this.globalHandlers].forEach(call)`): a handler that
 *  removes itself while handling (offGlobal splices the live list) never hides the next, and a handler that throws is SAID as
 *  the product says it (console.error('[ws] handler error', err)). `msg` = page-side JS source of the
 *  message; `list` = the page expression of the handler list. test-ci-gate §2l: its control, and the census that makes any
 *  suite still walking the live list red. */
export const relayBroadcastJs = (msg, list = 'window.app.ws.globalHandlers') => `{ const __msg = (${msg}); for (const __h of [...${list}]) { try { __h(__msg); } catch (__e) { console.error('[ws] handler error', __e); } } }`;

/** `/tmp/vs-<name>-<pid>` — unique per process, cleaned by the owning suite. */
// B-d8e3: name → the path this PROCESS decided for it (below) — one map for every copy of this module in the process (a mutant)
const MINTED = (globalThis[Symbol.for('vibespace.scratch.minted')] ??= new Map());
/** lane setting-doors pick 0 (2026-11-14): THE OWNER'S PAGE, written once for every suite — the marks a browser on this instance's own
 *  page sends (Sec-Fetch-Site same-origin and its Origin). A spend.* row changes ONLY with them (src/routes/persistence.js
 *  refuseSpendRows: a bearer, or a request with no mark of the page, is refused): a suite that writes a spending row on its scratch
 *  hub writes it with these headers, so «who may write» has one place in the tests too (test-spend-rows-owner ⑤ is the census). */
/** B-0248 (lane bl-loop-b): THE STORE WRITER'S CONTRACT AT THE CALL, for a suite whose world reads a store's file right after its door
 *  (the release wrote at the call): dirty() writes the bytes NOW on this thread — a pid temp, then the rename, as the writer names
 *  them; `makeDir` made — and calls onWritten; a write that throws is OWED (pending, durable() answers false, onWritten(false, err))
 *  until the next hand-off of that file lands it. Never a measure of the off-loop road: test-store-write-census ⑭ is */
export function landingWriter() {
  const failed = new Map();
  const write = (file, o) => {
    const b = o.produce ? o.produce() : null;
    if (b == null) return;
    const parts = Array.isArray(b) ? b : [b];
    if (o.makeDir) fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    for (let i = 0; i < parts.length; i++) fs.writeFileSync(tmp, parts[i], { flag: i ? 'a' : 'w' });
    fs.renameSync(tmp, file);
  };
  return {
    dirty(file, o = {}) {
      try { write(file, o); failed.delete(file); }
      catch (e) { failed.set(file, e); try { if (o.onWritten) o.onWritten(false, e); } catch { /* the store's */ } return; }
      try { if (o.onWritten) o.onWritten(true, null); } catch { /* the store's */ }
    },
    durable(file, { answer = null } = {}) { const ok = !failed.has(file); if (answer) answer(ok); return Promise.resolve(ok); },
    pending: (file) => failed.has(file),
    flushSync: (files) => ({ written: [], left: (files || []).filter((f) => failed.has(f)).map((f) => ({ file: f, why: String((failed.get(f) && failed.get(f).code) || 'failed') })) }),
    whyNotDurable: (file) => (failed.has(file) ? { why: 'failed', code: (failed.get(file) && failed.get(file).code) || null } : null),
    forget: (file) => { failed.delete(file); },
  };
}
export function ownerPageHeaders(base) { return { Origin: new URL(base).origin, 'Sec-Fetch-Site': 'same-origin' }; }

/** r1213: the temp-sweeper row (src/temp-sweepers.js) whose prefix the folder a scratch NAME mints (`vs-<name>-<pid>`) would wear,
 *  or null — `rows` for a census's plant. */
export function sweeperRowOf(name, rows = TEMP_SWEEPERS.ROWS) { return TEMP_SWEEPERS.rowOfName(`${FIXTURE_CWD_PREFIX}${name}-`, rows); }

export function scratch(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`scratch(): bad name ${JSON.stringify(name)}`);
  // lane H verify r2: `vs-ab-<n>` is the PRODUCT's socket-dir fallback shape (src/browser-profiles.js socketDirDecision),
  // which the scratch reaper (scripts/ci.mjs PRODUCT_ROOT_RE) never judges — a suite minting it would hide from the sweep
  if (name === 'ab') throw new Error('scratch(): "ab" would mint /tmp/vs-ab-<pid> — the product\'s own socket-dir shape; pick another name');
  // r1152 (A — the suites' hygiene) + r1213 (THE CLASS): no suite's folder wears a name a PRODUCT SWEEPER owns — every row of
  // src/temp-sweepers.js (the product's own table of the files that remove folders under the temp root by a name prefix: the
  // vault run door's run folders, the sign-in card's scratch, the token mint's) is refused by READING that table, never a hand
  // list: on 2026-11-21 another suite's hub shredded a running test-vault-run's copies (a mutant-copy folder is `<name>-mut`)
  const sw = sweeperRowOf(name);
  if (sw) throw new Error(`scratch(): "${name}" would mint /tmp/${FIXTURE_CWD_PREFIX}${name}-<pid> — the folder shape of ${sw.file} (${sw.prefix}…, which a hub's start sweep judges); pick another name`);
  if (MINTED.has(name)) return MINTED.get(name);
  let p = path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}${name}-${process.pid}`);
  if (fs.existsSync(p)) p = leftoverAside(p);
  MINTED.set(name, p);
  if (IS_SUITE) endScratchAtExit(p);
  return p;
}
/** B-d8e3 (lane bl-scratch, 2026-11-17): A FOLDER THIS PROCESS DID NOT MAKE IS NOT ITS FOLDER. The name carries the pid, and a
 *  pid comes back: a leftover of an earlier run (killed by a gate's timeout, so no exit hook ran) under the same name broke
 *  the next suite that drew that pid — test-vault-run's first write into a read-only stand-in the old run had left
 *  (EACCES). So a name is decided once per process (`MINTED`: the same name answers the same path), and when the pid-keyed
 *  path already exists at that first ask, the run takes a FRESH name beside it (`<name>-<pid>-<6 chars>`, unique by mkdtemp,
 *  then removed so the caller still gets a path that does not exist) and says so on stderr. The leftover is never touched
 *  here: the gate's directory sweep (scripts/scratch-sweep.mjs) judges it by its holders and its age. */
function leftoverAside(p) {
  const fresh = fs.mkdtempSync(`${p}-`);
  fs.rmdirSync(fresh);
  process.stderr.write(`scratch(): ${p} already exists and this process did not make it (an earlier run's leftover under a recycled pid) — left for the gate's sweep; this run uses ${fresh}\n`);
  return fresh;
}

/** B-60d2 (2026-10-07): A SUITE ENDS WHAT IT MADE. /tmp is tmpfs (RAM + swap) and held 30 of 62 GB: 13 986 `vs-*`
 *  directories older than a day — 157 names minted here by 75 suites had no removal on any path, and a suite with one
 *  removes nothing when it throws before its cleanup line. So a SUITE's mint (argv[1] is a scripts/test-*.mjs; a helper,
 *  a dbg probe and ci.mjs mint nothing that is removed for them) is registered, and removed when the process exits —
 *  a red, a throw, process.exit, the end of the event loop. A suite that HANDS its root to a detached process the reaper
 *  owns calls keepScratch(dir), and is an EXEMPT row of test-architecture §84 with its reason. A suite killed by a signal
 *  runs no exit hook: the gate's directory sweep (scripts/scratch-sweep.mjs) reaps that dir once nothing holds it and its
 *  newest write is a day old. */
const IS_SUITE = /^test-[A-Za-z0-9._-]+\.mjs$/.test(path.basename(process.argv[1] || ''));
const ENDS = new Set();
/** B-0d6d (lane bl-scratch, 2026-11-17): THE ROOTS ARE REMOVED LAST. Exit listeners run in the order they were added, and a
 *  suite's first scratch() came before its own exit hook — so a hook that reads its root at exit (a fake daemon's
 *  launches.log, which names the pids to kill) read a root already removed, and the fakes outlived the suite (`sleep 600`
 *  each, adopted by the user manager). So the closer is moved behind every other exit listener at the moment the exit is
 *  emitted: every road out of a process that runs exit listeners at all (the loop's end, process.exit, an uncaught throw
 *  or rejection — measured on Node 22 and 24) goes through process.emit('exit'), and emit copies its listener list only
 *  after this move. A hook that THROWS stops the listeners after it, so the closer also runs in the emit's finally (it
 *  was first before, and always ran). A second copy of this module (a mutant) wraps the wrapper; both run after the hooks. */
function armCloser() {
  process.on('exit', endAll);
  const emit = process.emit;
  process.emit = function emitRootsLast(event, ...rest) {
    if (event !== 'exit') return emit.call(this, event, ...rest);
    process.removeListener('exit', endAll); process.on('exit', endAll);
    try { return emit.call(this, event, ...rest); } finally { endAll(); }
  };
}
let closerArmed = false;
/** The delete helper: `dir` is removed when this process exits (idempotent; a non-scratch path is refused). */
export function endScratchAtExit(dir) {
  if (!String(dir).startsWith(path.join(TMP_ROOTS[0], FIXTURE_CWD_PREFIX))) throw new Error(`endScratchAtExit(): ${JSON.stringify(dir)} is not a ${TMP_ROOTS[0]}/${FIXTURE_CWD_PREFIX}* scratch dir`);
  if (!closerArmed) { closerArmed = true; armCloser(); }
  ENDS.add(dir);
  return dir;
}
/** A root handed to a detached process: not removed at exit (the dir sweep judges it by its holders). */
export function keepScratch(dir) { ENDS.delete(dir); return dir; }
function endAll() { for (const d of ENDS) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { } } ENDS.clear(); }

/** B-ba47 pick B (lane cli-update-needs-nothing, 2026-11-14): A SUITE RUNS ON A HOME OF ITS OWN. The 2.369.401 hotfix night
 *  handed a claim's suites the person's HOME (launched outside the lane env): hubs that named no HOME of their own found
 *  the real CLIs in ~/.local/bin, walked ~/.claude/projects and created their usage index under ~/.vibespace. So it is
 *  decided ONCE, here, at import — before the suite's own body runs: a SUITE or a DEBUG SCRIPT (argv[1] is a
 *  scripts/test-*.mjs or dbg-*.mjs — a person runs those by hand from a real shell) handed a home outside every temp
 *  root (src/home-verdict.js suiteRehome — the hub boot's own verdict) runs on /tmp/vs-rehome-<pid>, re-homed by the
 *  ONE value rule (rehomeEnv): HOME there, the four XDG base dirs unset (they follow it), every value naming a path under
 *  the handed home dropped (in either spelling, normalised), EVERY PATH entry under it dropped — node, npm and npx
 *  linked by name into the new home's own .vs-bin (binLinks; an agent CLI never). Every hub the suite starts with its env — spread, inherited, or
 *  HOME read from it — inherits the temp home by construction. A home already under a temp root (the lane env's) is
 *  left alone, so on a lane nothing changes. One stderr line says it: the NAMES dropped, never a value.
 *  test-architecture §113 holds every hub-booting suite to this module and every boot site's env to its class. */
const HV = require('../src/home-verdict.js');
/** What the process was handed — before the re-home: its home, PATH and CLI pins (the REAL-CLI ALLOW LIST's), and the node
 *  it was started with. */
// THE ACCOUNT ENTRY'S HOME IS THE HOME COMPARED when the handed HOME is empty or relative (主开发 01:18Z b): a path compared,
// never opened — with no home to compare against every value naming the account's own home would be carried
const HOME_COMPARED = (() => { const h = os.homedir(); return h && h.startsWith('/') ? h : os.userInfo().homedir; })();
const HANDED = Object.freeze({ HOME: HOME_COMPARED, PATH: process.env.PATH || '', EXEC: process.execPath,
  // the agent CLI PINS as handed (VS_<CLI>_BIN) — the real-CLI accessor's alone: the built environment carries none of them
  ...Object.fromEntries(HV.AGENT_CLIS.map((c) => `VS_${c.toUpperCase().replace(/-/g, '_')}_BIN`).map((k) => [k, process.env[k] || ''])),
  // the browser DRIVER's pin as handed (主开发 r2068): the driver's door below reads it alone
  VS_AGENT_BROWSER_BIN: process.env.VS_AGENT_BROWSER_BIN || '',
  // …and its INSTALLED BROWSERS as handed (主开发 r2777): the folder door below reads it alone
  VS_AGENT_BROWSER_BROWSERS: process.env.VS_AGENT_BROWSER_BROWSERS || '' });
/** THE ENVIRONMENT THIS PROCESS WAS STARTED WITH (B-ba47 B2, 主开发 2026-11-15 11:17Z item 3): the kernel's copy of the
 *  exec-time block, which no setenv changes (measured: a planted name, a changed one, a removed one, a long title set on the process
 *  leave it as it was) — what tells a name the suite set ITSELF from one it was handed (rehomeEnv `handed`: its own is kept
 *  as it is). A suite that loads this module only after its own code ran — a dynamic import of a module that loads it
 *  (`import('./mutant-copy.mjs')`: hub-home-census.mjs `lateLoads`) — keeps what it planted. null where there is no /proc. */
const STARTED_ENV = (() => {
  let t; try { t = fs.readFileSync('/proc/self/environ', 'utf8'); } catch { return null; }
  const o = {}; for (const kv of t.split('\0')) { const i = kv.indexOf('='); if (i > 0 && !Object.prototype.hasOwnProperty.call(o, kv.slice(0, i))) o[kv.slice(0, i)] = kv.slice(i + 1); }
  return Object.freeze(o);
})();
/** The re-home's folders are minted with this prefix (REHOMED's mkdtemp below spells the same path) — ci.mjs's reaper knows a
 *  re-home root by it (judgeScratch). */
export const REHOME_PREFIX = path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}rehome-`);
/** This checkout's scripts folder: an accessor's row is a FILE here (主开发 18:25Z item 2). */
const SCRIPTS_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/\/+$/, '');
/** Where this process's main file RESOLVES — read once, at import. */
const ME = (() => { try { return fs.realpathSync(process.argv[1]); } catch { return null; } })();
/** THE MAIN FILES THAT RUN ON THE HANDED HOME ON PURPOSE (主开发 01:18Z f): every other main file of this checkout's
 *  scripts folder that loads this module re-homes (and so does a test-* / dbg-* file anywhere). Each row a reason. */
const BY_HAND_BROWSER = "by hand: it drives the person's OWN browser driver (agent-browser, found on the person's PATH) — on purpose, the measurement's point";
export const NOT_REHOMED = Object.freeze([
  Object.freeze({ file: 'ci.mjs', why: "the TIER RUNNER: each suite re-homes itself from the env it hands; its own `gh api` runs on the account's gh sign-in and its usage-index sweep reads ~/.vibespace/db on purpose" }),
  Object.freeze({ file: 'probe-claude-stdout.mjs', why: "the owner's ONE real turn on the owner's own login, by hand — the stdout registry's wire probe" }),
  Object.freeze({ file: 'measure-tier3.mjs', why: "its §12.36 leg finds the stock Chrome in the person's own agent-browser install, on purpose, by hand" }),
  // 主开发 r1083 / r1139: the REMOTE tier's driver ships a snapshot and runs ITS ci.mjs over ssh
  Object.freeze({ file: 'ci-remote.mjs', why: "the REMOTE tier's driver: it ships a snapshot to the test machine and runs that snapshot's ci.mjs over ssh; the suites run there under the machine's lane homes (temp folders), so they are never re-homed; its own git, rsync and ssh run on the account's own config and agent, on purpose" }),
  // the by-hand browser measurements (主开发 02:28Z cure 6): re-homed, they no longer found the person's driver and SKIPPED in silence
  ...['measure-browser-windows.mjs', 'measure-dialog-hold.mjs', 'measure-held-enable.mjs', 'measure-hidden-window-cpu.mjs', 'measure-input-receipts.mjs', 'measure-navigation-loop.mjs', 'measure-shared-profile-freeze.mjs'].map((file) => Object.freeze({ file, why: BY_HAND_BROWSER })),
]);
const REHOMES = (() => {
  const base = path.basename(process.argv[1] || '');
  const dirReal = (() => { try { return fs.realpathSync(SCRIPTS_DIR); } catch { return SCRIPTS_DIR; } })();
  const inScripts = !!ME && path.dirname(ME) === dirReal;
  // a row is the FILE that resolves (a link named like the tier runner is not the tier runner — 主开发 02:28Z 8a)
  if (inScripts && NOT_REHOMED.some((r) => { try { return fs.realpathSync(path.join(dirReal, r.file)) === ME; } catch { return false; } })) return false;
  return /^(?:test|dbg)-[A-Za-z0-9._-]+\.mjs$/.test(base) || inScripts;
})();
// THE FILE-SYSTEM SIDE of the re-home — the resolver (src/home-verdict.js walk over lstat and readlink) and the linker — is
// src/home-links.js, shared with the hub's boot re-home (src/server/throwaway-root.js, B-ba47 shape H): one copy, both callers
const HL = require('../src/home-links.js');
export const linkTools = HL.linkTools;
/** THE DRIVER'S DOOR (主开发 r2068 / r2095): the real browser driver a RE-HOMED suite runs. The re-home BUILDS its PATH (its own
 *  .vs-bin + the system's folders), so a driver the run hands on PATH (npm -g puts it in node's own folder, never carried, r1083
 *  V1) no longer reaches the suites' fence (src/browser-facts.js binaryResolver over the suite's own PATH): every real-driver suite
 *  skipped whole. THE VARIABLE ONLY (r2095): a real browser's driver runs only where a runner NAMES it, on purpose — the program
 *  VS_AGENT_BROWSER_BIN names (as handed) is linked into the suite's own .vs-bin (a process LEFT ALONE: into a folder of its own, first
 *  on its PATH — DRIVER_LEFT_ALONE below, r2775); named and unusable (gone, not executable, or
 *  VibeSpace's own shim by its marker) is none, said by name; with no name, none — the fence skips in its own words, and no driver
 *  standing on a person's PATH is ever picked up. PURE over its probes (`usable`, `isShim`). */
// `skip`: THE ONE SENTENCE every real-driver suite's driver-less skip begins with (主开发 r2095), whole or a leg — the integrator's runner finds
// a skipped driver leg in any row's output by this fixed string and reports it NO READING / PARTIAL, never a plain green
export const DRIVER = Object.freeze({ name: 'agent-browser', env: 'VS_AGENT_BROWSER_BIN', browsersEnv: 'VS_AGENT_BROWSER_BROWSERS', shimMarker: 'VIBESPACE-AGENT-BROWSER-SHIM',   // test-home-verdict pins name + marker to src/browser-verbs.js
  skip: 'NO REAL DRIVER (VS_AGENT_BROWSER_BIN names none usable here):' });
export function driverDoor({ named = '', usable = () => false, isShim = () => false } = {}) {
  if (!named) return { path: null, named: false };
  return named.startsWith('/') && usable(named) && !isShim(named) ? { path: named, named: true } : { path: null, named: true, why: `${DRIVER.env} names ${named}: no usable ${DRIVER.name} there` };
}
const isExecFile = (p) => { try { const st = fs.statSync(p); return st.isFile() && (st.mode & 0o111) !== 0; } catch { return false; } };
const isDriverShim = (p) => { try { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(512); const n = fs.readSync(fd, b, 0, 512, 0); return b.subarray(0, n).toString('utf8').includes(DRIVER.shimMarker); } finally { fs.closeSync(fd); } } catch { return false; } };
/** THE DRIVER'S INSTALLED BROWSERS (主开发 r2777, the box's row 401): a real-driver suite that needs the driver's OWN installed Chrome
 *  builds reads them where the driver installs them, <home>/.agent-browser/browsers (os.homedir(): test-browser-live-input,
 *  test-browser-live-fit, test-browser-profiles-ui; test-browser-live uses them when there), and a suite's own home — re-homed, or
 *  a row's scratch — has none. The driver documents NO variable for that folder (agent-browser.dev/configuration: only
 *  AGENT_BROWSER_EXECUTABLE_PATH, «Custom browser executable path», ONE executable — the suites list builds), so THE SAME LAW AS THE
 *  DOOR: the folder VS_AGENT_BROWSER_BROWSERS names (as handed; the driver's layout, chrome-<version>/chrome) is linked as
 *  <home>/.agent-browser/browsers (placeBrowsers: quiet when it is already that folder, caught, the link left with the home); named and not a folder is none, said by name; with no name, none — never found, never fetched.
 *  PURE over its probe (`isDir`). */
export function browsersDoor({ named = '', isDir = () => false } = {}) {
  if (!named) return { path: null, named: false };
  return named.startsWith('/') && isDir(named) ? { path: named, named: true } : { path: null, named: true, why: `${DRIVER.browsersEnv} names ${named}: no folder of installed browsers there` };
}
const isDirAt = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
/** places the named folder as <home>/.agent-browser/browsers → null (no name) | { at, target } | { at: null, why[, same] }. QUIET when
 *  what stands there already IS the named folder (a child of a named run, a sibling that placed it first — between this one's look and
 *  its link too: EEXIST is «there already»); one that is another folder is never covered, said; a home that cannot take the link is
 *  none, said by the variable's name — never a stack trace (r2825). THE LINK STAYS (r2825 (3), the choice said): a re-homed home is
 *  removed whole at exit (the link, never its target — rmSync follows no link), and a left-alone home is the RUNNER's (a box row's
 *  own scratch, removed with its row, r2203): nothing takes it back, so a suite sharing that home never loses it mid-run. */
function placeBrowsers(home, me) {
  const b = browsersDoor({ named: HANDED[DRIVER.browsersEnv], isDir: isDirAt });
  if (!b.named) return null;
  const none = (why) => { process.stderr.write(`[scratch] ${me}: ${why} — its installed-browser legs cannot run\n`); return Object.freeze({ at: null, why }); };
  if (!b.path) return none(b.why);
  let real = b.path; try { real = fs.realpathSync(b.path); } catch { }
  const parent = path.join(home, '.agent-browser'), at = path.join(parent, 'browsers');
  const stands = () => { try { fs.lstatSync(at); return true; } catch { return false; } };
  const thereAlready = () => {
    let same = false; try { same = fs.realpathSync(at) === real; } catch { }
    if (same) return Object.freeze({ at: null, why: 'the named folder is there already', same: true });
    process.stderr.write(`[scratch] ${me}: ${at} is there already — ${DRIVER.browsersEnv} left unplaced\n`);
    return Object.freeze({ at: null, why: `${at} is there already` });
  };
  if (stands()) return thereAlready();
  try { fs.mkdirSync(parent, { recursive: true }); fs.symlinkSync(real, at); }
  catch (e) {
    if (e && e.code === 'EEXIST' && stands()) return thereAlready();   // placed by another between the look and the link
    return none(`${DRIVER.browsersEnv} names ${b.path}: ${at} cannot take it (${(e && (e.code || e.message)) || 'refused'})`);
  }
  return Object.freeze({ at, target: real });
}
export const makeResolver = HL.makeResolver;
export const resolveFs = HL.resolveFs;
const isFile = HL.isFile;
/** THE SEAM (主开发 23:36Z, on three conditions): `VS_REHOME_NOT_TEMP=<a folder a suite made under a temp root>` — that
 *  folder is NOT a temp root for the verdict, so a stand-in home made in it is re-homed. It can only turn a re-home ON;
 *  a value outside every temp root is ignored; the line names it when used. Set by test-home-verdict (and a reader's
 *  probe) only — test-architecture §113 pins that nothing in the product or the wrappers sets or reads it. */
export const NOT_TEMP_ENV = 'VS_REHOME_NOT_TEMP';
const SEAM_AT = (() => {
  const v = process.env[NOT_TEMP_ENV]; if (!v || !v.startsWith('/')) return null;
  const r = resolveFs(v), roots = [...TMP_ROOTS, os.tmpdir()].map((t) => resolveFs(t) || t);
  if (!r || !HV.tempRootOf(r, roots)) return null;   // a value outside every temp root is IGNORED
  return { path: r, isRoot: roots.includes(r) };       // the seam set to a temp root ITSELF is refused at the re-home (d)
})();
const SEAM = SEAM_AT && !SEAM_AT.isRoot ? SEAM_AT.path : null;
/** THE SUITE'S OWN NODE (主开发 18:25Z A1, 23:36Z's five amendments): when the node this process runs RESOLVES under the
 *  handed home, every `spawn(process.execPath)`, `fork()`, daemon and `dirname(process.execPath)` PATH would bring that
 *  folder back — with the agent CLIs a per-account install keeps beside node. So the suite gets a node of its own, out of
 *  the home: `<cache>/vs-node-<key>/bin/node` (key = the file's identity), a LINK of the file where the system allows it,
 *  else a COPY; npm / npx beside it as links to the handed install's own. Made ASIDE and renamed into place; RUN ONCE where
 *  it stands (it must print this node's version), else the re-home REFUSES by name; reused only when OURS — judged by lstat,
 *  never through a link: a folder, our owner, mode 0700, its stamp agreeing with the file's own identity; anything else at
 *  the name is never adopted (this run makes its own, removed at exit). Each use touches the folder; the gate sweep reaps
 *  a `vs-node-*` folder a day after its last use (age alone). The cache is /var/tmp (disk: /tmp may be RAM, a copy is the
 *  node binary's size); with the seam set, beside the seam folder. */
export const NODE_CACHE_PREFIX = 'vs-node-';
/** The present FORM of a node folder, in its name: an older form of our own shape never blocks this one (主开发 02:28Z cure 4) —
 *  the sweep ages the old ones out by their shape. */
export const NODE_CACHE_FORM = 'v2';
export function nodeKeyOf(st) { return require('node:crypto').createHash('sha256').update(`${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 16); }
/** The node folder at `dir`, if it is OURS for `key` — judged without following a link, and holding EXACTLY what was made
 *  (主开发 01:18Z a: a program installed into it later makes it not ours). → { file } | null */
export function oursNode(dir, key, { lstat = fs.lstatSync, read = (f) => fs.readFileSync(f, 'utf8'), readdir = (d) => fs.readdirSync(d), uid = process.getuid() } = {}) {
  try {
    const d = lstat(dir), b = lstat(path.join(dir, 'bin')), sf = lstat(path.join(dir, 'stamp.json')), f = lstat(path.join(dir, 'bin', 'node'));
    if (!d.isDirectory() || d.uid !== uid || (d.mode & 0o777) !== 0o700 || !b.isDirectory() || !sf.isFile() || !f.isFile()) return null;
    const st = JSON.parse(read(path.join(dir, 'stamp.json')));
    if (st.source !== key || !st.file || st.file.ino !== f.ino || st.file.size !== f.size || st.file.mtimeMs !== f.mtimeMs) return null;
    if (JSON.stringify([...readdir(dir)].sort()) !== '["bin","stamp.json"]' || JSON.stringify([...readdir(path.join(dir, 'bin'))].sort()) !== JSON.stringify([...(st.bin || [])].sort())) return null;
    return { file: path.join(dir, 'bin', 'node') };
  } catch { return null; }
}
/** Put the node file at `dst`: a COPY of `src`, with the clone flag (主开发 01:18Z must-fix 1: never a link — a link moves
 *  the person's own file's link count and changed-time; a copy changes nothing under the handed home). */
export function placeNodeFile(src, dst, { copy = (a, b) => { fs.copyFileSync(a, b, fs.constants.COPYFILE_FICLONE); fs.chmodSync(b, 0o755); } } = {}) {
  copy(src, dst);
}
const runOnce = (file) => spawnSync(file, ['-p', 'process.version'], { encoding: 'utf8', cwd: '/', env: { PATH: '/usr/bin:/bin' }, timeout: 20000 });
/** The suite's own node for `src` (resolved, under the handed home): → { file, made, dir, own? } or { refused: why }. */
export function ownNode(src, nodeInstall, opt = {}) {
  try { return makeOwnNode(src, nodeInstall, opt); } catch (e) { return { refused: `its node cache cannot be made (${(e && e.code) || e}${e && e.path ? ' at ' + e.path : ''})` }; }
}
function makeOwnNode(src, nodeInstall, { root = SEAM ? `${SEAM}.node-cache` : '/var/tmp', run = runOnce, place = placeNodeFile } = {}) {
  const st = fs.statSync(src), key = nodeKeyOf(st);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const final = path.join(root, `${NODE_CACHE_PREFIX}${NODE_CACHE_FORM}-${key}`);
  const touch = (d) => { const t = new Date(); try { fs.utimesSync(d, t, t); } catch { } };
  const have = oursNode(final, key);
  if (have) { touch(final); return { ...have, dir: final }; }
  const aside = fs.mkdtempSync(`${final}.tmp-`);
  try { return makeIn(aside); } catch (e) { try { fs.rmSync(aside, { recursive: true, force: true }); } catch { } throw e; }   // a make that throws removes what it made (cure 5)
  function makeIn(aside) {
  fs.chmodSync(aside, 0o700);
  fs.mkdirSync(path.join(aside, 'bin'), { mode: 0o700 });
  const file = path.join(aside, 'bin', 'node');
  place(src, file);
  const made = ['node'];
  for (const n of ['npm', 'npx']) { const b = path.join(nodeInstall, n); if (fs.existsSync(b)) try { fs.symlinkSync(b, path.join(aside, 'bin', n)); made.push(n); } catch { } }
  const ran = run(file);
  if (ran.status !== 0 || String(ran.stdout).trim() !== process.version) {
    fs.rmSync(aside, { recursive: true, force: true });
    return { refused: `it does not run out of the home (${ran.error ? ran.error.code : `exit ${ran.status}`}${ran.stderr ? ', ' + String(ran.stderr).trim().split('\n')[0].slice(0, 120) : ''})` };
  }
  const fst = fs.lstatSync(file);
  fs.writeFileSync(path.join(aside, 'stamp.json'), JSON.stringify({ source: key, file: { ino: fst.ino, size: fst.size, mtimeMs: fst.mtimeMs }, bin: made }) + '\n', { mode: 0o600 });
  try { fs.renameSync(aside, final); return { file: path.join(final, 'bin', 'node'), dir: final }; } catch { }
  const won = oursNode(final, key);   // another import won the race: used only after the SAME check
  if (won) { fs.rmSync(aside, { recursive: true, force: true }); touch(final); return { ...won, dir: final }; }
  process.on('exit', () => { try { fs.rmSync(aside, { recursive: true, force: true }); } catch { } });   // never adopted: this run's own
  return { file, dir: aside, own: true };
  }
}
/** null when this process was left alone; else { home, why, dropped, notCarried, linked, node, initPaths, seam }. */
export const REHOMED = (() => {
  if (!REHOMES) return null;
  const resolve = makeResolver();
  const v = HV.suiteRehome({ home: HANDED.HOME, tmpRoots: TMP_ROOTS, varRoots: [os.tmpdir()], notTemp: SEAM ? [SEAM] : [], resolve });
  if (!v.rehome) return null;
  const me = path.basename(process.argv[1]);
  const refuse = (what) => { process.stderr.write(`[scratch] ${me}: handed a home outside every temp root, and ${what} — it REFUSES to run there: run it with a node outside the home (a system node), or through the lane's environment (a home under a temp root)\n`); process.exit(1); };
  if (SEAM_AT && SEAM_AT.isRoot) refuse(`the seam ${NOT_TEMP_ENV} names a temp root itself (${SEAM_AT.path}) — it may name only a folder a suite made under one`);
  const checkout = path.dirname(SCRIPTS_DIR);
  const src = resolve(HANDED.EXEC) || HANDED.EXEC;
  const nodeUnder = HV.judgePath(src, HV.homeKeys([HANDED.HOME], resolve), { resolve });
  let node = null;
  if (nodeUnder) {
    node = ownNode(src, path.dirname(src));
    if (node.refused) refuse(`the node it runs (${src.startsWith(HANDED.HOME + '/') ? '~' + src.slice(HANDED.HOME.length) : 'under that home'}) ${node.refused}`);
  }
  // the new home is MADE, never assumed (主开发 17:06Z item D): a fresh unique folder, 0700 — never a fixed name that may exist
  const home = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}rehome-`)));
  fs.chmodSync(home, 0o700);
  stampScratchRun(home);   // as the scratch homes are (主开发 18:25Z item 6): a hub that inherits it is attributable to this run
  const { env, carried, notCarriedNames, notCarried, handedPath, binDir, own, ownPath } = HV.rehomeEnv(process.env, { oldHome: HANDED.HOME, newHome: home, platform: process.platform, resolve, checkout, handed: STARTED_ENV });
  env.npm_config_prefix = path.join(home, '.npm-global');   // npm's global folder dies with the run (主开发 01:18Z a) — never the node cache's own
  const dropped = notCarriedNames.map((x) => x.name);
  const runs = node ? node.file : src;
  const linked = linkTools(binDir, HV.binLinks({ execPath: runs, nodeInstall: path.dirname(src), handedPath, home: HANDED.HOME, exists: isFile, resolve, platform: process.platform }));
  // THE DRIVER'S DOOR (主开发 r2068 / r2095, above): the one program the run NAMES, linked as agent-browser into this home's own folder
  const drv = driverDoor({ named: HANDED[DRIVER.env], usable: isExecFile, isShim: isDriverShim });
  if (drv.path) { let real = drv.path; try { real = fs.realpathSync(drv.path); } catch { } linked.push(...linkTools(binDir, [{ name: DRIVER.name, target: real }])); }
  else if (drv.named) process.stderr.write(`[scratch] ${me}: ${drv.why} — its real-driver legs cannot run\n`);
  const browsers = placeBrowsers(home, me);   // the driver's installed browsers the run NAMES (r2777), in this home of its own
  for (const k of Object.keys(process.env)) if (!Object.prototype.hasOwnProperty.call(env, k)) delete process.env[k];
  Object.assign(process.env, env);
  let initPaths = null;
  if (node) {
    process.execPath = node.file; process.argv[0] = node.file;   // the suite's own answers to «where is node» (A1)
    const M = require('node:module');
    initPaths = typeof M._initPaths === 'function';   // the CJS global folders follow the new HOME and node
    if (initPaths) M._initPaths();
  }
  const n = dropped.length, groups = new Map();
  const KNOBS = (() => { try { return new Set(JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, 'suite-env-knobs.json'), 'utf8')).knobs); } catch { return new Set(); } })();
  for (const x of notCarriedNames) { const t = HV.ENV_NOT.find((r) => r.name === x.name)?.tag || (KNOBS.has(x.name) ? "a suite's own knob — to carry it, name it under VS_" : x.why); if (!groups.has(t)) groups.set(t, []); groups.get(t).push(x.name); }
  process.stderr.write(`[scratch] ${me}: handed a home outside every temp root — it runs on its own (${home}): HOME there; the environment is BUILT: ${carried.length} name${carried.length === 1 ? '' : 's'} carried`
    + `${n ? `, ${n} not carried — ${[...groups].map(([t, l]) => `${l.join(', ')} (${t})`).join('; ')} — one a suite needs: add it to src/home-verdict.js ENV_ROWS with its shape, or run through the lane's environment` : ''}; `
    + `${node ? `node: its own (${node.file}, a copy), out of the home${initPaths ? '' : ' — the module folders were NOT re-read (this node has no Module._initPaths)'}; ` : ''}`
    + `PATH is its own: ${binDir} (${linked.join(', ') || 'nothing linked'}) + the system's directories`
    + `${notCarried.length ? ` — not carried: ${notCarried.join(', ')}` : ''}; a tool missing there: install it in a system directory, or add a named row to src/home-verdict.js TOOL_ROWS (a real agent CLI: scripts/scratch.mjs REAL_CLI_ALLOW)`
    + `${SEAM ? `; the seam ${NOT_TEMP_ENV} made ${SEAM} not a temp root` : ''}`
    + `${own.length || ownPath.length ? `; LOADED AFTER ITS OWN CODE RAN — what it set itself is kept as it is: ${[...own, ...(ownPath.length ? [`${ownPath.length} PATH entr${ownPath.length === 1 ? 'y' : 'ies'} of its own (in front)`] : [])].join(', ')}` : ''}`
    + `${STARTED_ENV ? '' : '; the environment it was started with is not readable here (no /proc): every name was judged'}\n`);
  return Object.freeze({ home, why: v.why, dropped: Object.freeze(dropped), notCarried: Object.freeze(notCarried), linked: Object.freeze(linked), node: node ? Object.freeze({ file: node.file }) : null, initPaths, seam: SEAM, carried: Object.freeze(carried), notCarriedNames: Object.freeze(notCarriedNames), compared: HANDED.HOME, own: Object.freeze(own), ownPath: Object.freeze(ownPath), browsers });
})();
/** THE DRIVER'S DOOR, LEFT ALONE (主开发 r2775, the box's real-driver rows read NO READING): a process the re-home LEAVES ALONE (its
 *  handed home is already under a temp root — every box row's own scratch home, r2203; a file the re-home judges only: a test-* /
 *  dbg-* file, or a main file of this checkout's scripts folder that is no NOT_REHOMED row — never the tier runner) keeps the PATH it was handed, and a runner
 *  names the driver in the variable only (r2095). The door applies WHEREVER A RUNNER NAMES A USABLE DRIVER, re-homed or not: here
 *  the one program VS_AGENT_BROWSER_BIN names is linked as agent-browser into a folder of this run's own (under the scratch temp
 *  root, stamped, removed at exit) put FIRST on PATH, so the suite's fence (src/browser-facts.js binaryResolver over its own PATH)
 *  finds THAT program; named and unusable (gone, not executable, the shim) is none, said by name; with no name, none: nothing
 *  changes. null when re-homed (the re-home's own door above) or with no name; else { dir, linked, target } or { dir: null, why }. */
export const DRIVER_LEFT_ALONE = (() => {
  if (!HANDED[DRIVER.env] && !HANDED[DRIVER.browsersEnv]) return null;   // NEITHER NAME: nothing at all, not one file call (r2825 (1))
  if (!REHOMES || REHOMED) return null;   // only a file the re-home judges (REHOMES) and left alone — never the tier runner, never a person's home
  const v = HV.suiteRehome({ home: HANDED.HOME, tmpRoots: TMP_ROOTS, varRoots: [os.tmpdir()], notTemp: SEAM ? [SEAM] : [], resolve: makeResolver() });
  if (v.rehome || v.why !== 'temp-home') return null;   // its home is a throwaway (a box row's own scratch, a lane's): the door's case
  const me = path.basename(process.argv[1] || '');
  const drv = driverDoor({ named: HANDED[DRIVER.env], usable: isExecFile, isShim: isDriverShim });
  let driver = null;
  if (drv.named && !drv.path) { process.stderr.write(`[scratch] ${me}: ${drv.why} — its real-driver legs cannot run\n`); driver = { dir: null, why: drv.why }; }
  else if (drv.path) {
    let real = drv.path; try { real = fs.realpathSync(drv.path); } catch { }
    try {
      const dir = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}driver-`)));
      stampScratchRun(dir);   // this run's own, as the scratch homes are
      const linked = linkTools(dir, [{ name: DRIVER.name, target: real }]);
      process.env.PATH = dir + (process.env.PATH ? path.delimiter + process.env.PATH : '');
      driver = { dir, linked: Object.freeze(linked), target: real };
    } catch (e) {   // a temp root that cannot take its folder: none, said by the variable's name — never a stack trace (r2825 (2))
      const why = `${DRIVER.env} names ${drv.path}: no folder of this run's own could hold it (${(e && (e.code || e.message)) || 'refused'})`;
      process.stderr.write(`[scratch] ${me}: ${why} — its real-driver legs cannot run\n`); driver = { dir: null, why };
    }
  }
  const browsers = placeBrowsers(HANDED.HOME, me);   // the home is the runner's: the link stays with it (placeBrowsers)
  return driver || browsers ? Object.freeze({ ...(driver || { dir: null }), browsers }) : null;
})();
/** Is the process whose main file RESOLVES to `me` a row of `rows` — the row's FILE in this checkout's scripts folder,
 *  compared where both resolve (主开发 18:25Z item 2: a file with a row's name elsewhere, or a link named after one, is not
 *  the row)? The model is ACCIDENT, not adversary: a suite that rewrites its own argument list is deliberate evasion,
 *  which no accessor stops. Pure over `resolve`. */
export function isRowCaller(me, rows, { scriptsDir = SCRIPTS_DIR, resolve = (f) => { try { return fs.realpathSync(f); } catch { return null; } } } = {}) {
  return !!me && rows.some((r) => resolve(path.join(scriptsDir, r.suite)) === me);
}
/** THE WATCHERS (主开发 17:06Z item C): a suite whose law is «the person's home is untouched» READS the handed home on
 *  purpose — through this ONE accessor, which answers only a process whose main file resolves to a row's file in this
 *  checkout, and throws for every other. A row may READ, never write. test-architecture §113 holds every caller to a row;
 *  each watcher is RED (never a skip) when the accessor fails. */
export const HOME_WATCHERS = Object.freeze([
  Object.freeze({ suite: 'test-fixture-isolation.mjs', why: "READS the real transcript folder (~/.claude/projects) — the standing sweep for fixture litter the gate runs last on purpose" }),
  Object.freeze({ suite: 'test-claude-retention.mjs', why: "READS the person's ~/.claude tree to hash it — «the owner's home is untouched» by the retention sweep" }),
]);
export function handedHome() {
  if (!isRowCaller(ME, HOME_WATCHERS)) throw new Error(`handedHome(): ${path.basename(process.argv[1] || '')} is not a row of HOME_WATCHERS (scripts/scratch.mjs) as a file of this checkout — only a watcher reads the handed home`);
  return HANDED.HOME;
}
/** THE REAL-CLI ALLOW LIST (主开发's rulings, 2026-11-14): a script that runs a REAL agent CLI found on the HANDED env (the
 *  one it was started with, before the re-home) is a row here with its reason. A SUITE row is FENCED — a home of its own,
 *  no person's sign-in, no turn beyond the one the hosted run is sanctioned for — and the CLI is its point; a BY-HAND row
 *  is never a gate. handedCliCandidates() answers only a process whose main file resolves to a row's file in this checkout; test-architecture §113 holds every caller to one. */
export const REAL_CLI_ALLOW = Object.freeze([
  Object.freeze({ suite: 'test-claude-steer-chrome.mjs', kind: 'suite', why: "§A, the fenced leg: the real claude behind the real wrapper, under the leg's own scratch HOME, talking only to a loopback mock of POST /v1/messages — nothing billed, no sign-in read" }),
  // row 7 (主开发 r1083 cure 2): the SAME fenced shape — §A runs the real claude behind the real wrapper against a loopback mock
  Object.freeze({ suite: 'test-claude-wrapper-queue.mjs', kind: 'suite', why: "§A, the fenced leg: the real claude behind the real wrapper, under the leg's own scratch HOME, talking only to a loopback mock of the messages API — nothing billed, no sign-in read" }),
  // row 2 (主开发 2026-11-14 12:20Z): KEPT on three conditions — its reason below; no tier, suite or other script names or
  // imports it (test-architecture §113); nobody in a lane runs it (it reads pool members' sign-ins — the owner's word per run)
  Object.freeze({ suite: 'dbg-oat-pool-live.mjs', kind: 'by-hand', why: "by hand only, on the owner's word for that run; never a gate — the LIVE pool test (real subscriptions, the owner's quota): its throwaway hub runs on a temp home and is handed the real claude as CLAUDE_CMD; the sign-in goes by value (CLAUDE_CODE_OAUTH_TOKEN) and by the creds it copies from data/subs" }),
  // rows 3–5 (主开发 17:08Z): the three suites that look for the real CLI — each judged by what it DOES with it
  Object.freeze({ suite: 'test-chat-e2e.mjs', kind: 'suite', why: "a WHOLE TURN — the ONE haiku turn through the product's own chat pipe (the fast tier's EXCEPTION row): on a scratch home of its own, signed in by the CI token alone (VIBESPACE_CI_OAT, by value), the turn the hosted run is sanctioned for — the real CLI is its point" }),
  Object.freeze({ suite: 'test-init-frame.mjs', kind: 'suite', why: "READS the installed CLI's bytes (its init-frame schema) — never spawned for a turn, no sign-in: it tells us when the CLI's frames change — the CLI is its point" }),
  // row 8 (主开发 r2084): the record oracle READS the pinned claude's bytes — FENCED to the hosted runner, by the runner's own mark
  Object.freeze({ suite: 'test-record-shape.mjs', kind: 'suite', why: "READS the installed claude's bytes (strings over the binary) for the record oracle — never spawned, no sign-in; FENCED to the hosted runner, known by its own mark (GITHUB_ACTIONS=true), where the workflow's pin step installed it: on a person's machine, and under VS_NO_REAL_CLI=1, it reads NO real install (a named skip); a file named by a person's own hand is read only where the suite is not re-homed" }),
  // row 6 (the re-land, 2026-11-21): the train's codex protocol drift gate reads the installed version
  Object.freeze({ suite: 'test-codex-protocol-drift.mjs', kind: 'suite', why: "READS the installed codex's version off its package.json — the codex VibeSpace would run, by the handed env — to pick the measured protocol table; a native install with no package.json above it is asked its --version once (no sign-in, a scratch HOME): the CLI is its point" }),
  Object.freeze({ suite: 'test-stdout-registry.mjs', kind: 'suite', why: "greps the installed CLI's bytes and asks `--version` — no turn (its one real turn lives in scripts/probe-claude-stdout.mjs), no sign-in: the stdout consumers against the CLI's own strings — the CLI is its point" }),
]);
/** The REAL `cli` a row may run: the first of handedCliCandidates that resolves to a file, resolved — or null. A row only. */
export function handedCli(cli) {
  return handedCliCandidates(cli).map((c) => { try { return fs.realpathSync(c); } catch { return null; } }).find((c) => isFile(c)) || null;
}
/** Where a REAL `cli` may be, by the handed env: $VS_<CLI>_BIN, each handed PATH dir, the handed ~/.local/bin. */
export function handedCliCandidates(cli) {
  if (!isRowCaller(ME, REAL_CLI_ALLOW)) throw new Error(`handedCliCandidates(): ${path.basename(process.argv[1] || '')} is not a row of REAL_CLI_ALLOW (scripts/scratch.mjs) as a file of this checkout`);
  return cliCandidatesOf(cli, HANDED);
}
/** Where the RUN NAMES its real `cli` (主开发 r1139): the HANDED `VS_<CLI>_BIN` — the workflow sets it where it installs the
 *  program — or null. Never a PATH candidate (a candidate is where a program MAY be). A row only. */
export function handedCliNamed(cli) {
  if (!isRowCaller(ME, REAL_CLI_ALLOW)) throw new Error(`handedCliNamed(): ${path.basename(process.argv[1] || '')} is not a row of REAL_CLI_ALLOW (scripts/scratch.mjs) as a file of this checkout`);
  return HANDED[`VS_${String(cli).toUpperCase().replace(/-/g, '_')}_BIN`] || null;   // the key as HANDED spells it
}
/** PURE — WHICH binary a fenced leg runs (主开发 r1156): the NAMED path ITSELF when the run names one (another usable candidate
 *  never stands in for it: named and unusable is «named and not found»), else the first usable candidate; none under the
 *  switch. `usable(p)` → the resolved usable file, or null. */
export function fencedProgram({ off = false, named = null, candidates = [], usable = () => null } = {}) {
  if (off) return null;
  if (named) return usable(named) || null;
  for (const c of candidates || []) { const r = usable(c); if (r) return r; }
  return null;
}
/** PURE — a FENCED real-program leg's verdict (主开发 r1083 / r1139), ONE for every fenced suite: the lanes' switch (VS_NO_REAL_CLI)
 *  ⇒ a counted skip; a usable program ⇒ run; the run NAMES its program (the handed variable) and it is not there ⇒ RED; not
 *  named and not found ⇒ a counted skip said by name. Never a pass for a leg that did not run. */
export function fencedVerdict({ off = false, named = null, found = null } = {}) {
  if (off) return { act: 'skip', why: 'VS_NO_REAL_CLI=1 — the real program is not run here' };
  if (found) return { act: 'run', why: '' };
  if (named) return { act: 'red', why: `the run NAMES its program (${named}) and no usable binary is there` };
  return { act: 'skip', why: 'the run names no program (no handed VS_<CLI>_BIN) and none is found by the handed env' };
}
/** PURE: where a REAL `cli` may be, by a handed env `{ HOME, PATH, VS_<CLI>_BIN }`. */
export function cliCandidatesOf(cli, handed) {
  return [handed[`VS_${String(cli).toUpperCase()}_BIN`], ...String(handed.PATH || '').split(':').filter(Boolean).map((d) => path.join(d, cli)), path.join(handed.HOME || '/nonexistent', '.local/bin', cli)].filter(Boolean);
}

/** lane app-page-csp (design q-043 D6, §5 P0-d): EVERY CHROME SUITE ENDS WITH ZERO CSP REPORTS — the ONE teardown check.
 *  A SUITE's hubs inherit `VIBESPACE_CSP_REPORTS_FILE` (set here at import; server.js hands it to src/server/csp-reports.js):
 *  every report the app page's report-only policy (src/app-csp.js) posts to a scratch hub lands in THIS process's one
 *  file, whatever the suite's tree, data dir or cleanup order. At exit — before the scratch roots are removed — that file
 *  and every `<root>/data/csp-reports.jsonl` / `<root>/<dir>/data/csp-reports.jsonl` under a root still standing (a hub
 *  spawned without the inherited env) are read: a line ⇒ the reports are printed and the suite FAILS (exit 1). That is
 *  how the policy is proven complete before a later lane enforces it. A suite that posts reports ON PURPOSE
 *  (test-csp-report) hands its sink an explicit file of its own. */
export const CSP_REPORTS_ENV = 'VIBESPACE_CSP_REPORTS_FILE';
// B-d8e3: the same pid-keyed name, so the same rule — a folder this process did not make (a killed run's, its report lines in it)
// is left to the sweep and this run takes a fresh one beside it (never another run's reports, never its folder removed here)
export const CSP_REPORTS_FILE = IS_SUITE ? path.join((() => { const d = path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}csp-reports-${process.pid}`); return fs.existsSync(d) ? leftoverAside(d) : d; })(), 'csp-reports.jsonl') : null;
/** THE ONE EXCEPTION LIST (主开发's ruling, 2026-10-20): a report a suite may end with, pinned by suite + directive + what
 *  was blocked + where. Every other report in any suite FAILS it. Never 'unsafe-inline' on the app page instead.
 *  EMPTY since lane design-frame-host (B-8679): its two rows — test-design-window's artboard / print / print-all srcdoc
 *  frames and test-channels-aggregate-ui's mail frame, both inheriting the app page's policy — went when those frames
 *  moved to the hub's frame host (src/server/frame-host.js: their own policy, a real header). A suite's OWN probe frame
 *  (a srcdoc it makes to read or forge a document) takes its reports with `takeCspReports`. */
export const CSP_EXCEPTIONS = Object.freeze([]);
/** The exception row a report line is excused by, or null. `suite` = the suite file's basename. */
export function cspExcused(line, suite = path.basename(process.argv[1] || '')) {
  let r; try { r = typeof line === 'string' ? JSON.parse(line) : line; } catch { return null; }
  return CSP_EXCEPTIONS.find((x) => x.suite === suite && r && (!x.directive || x.directive.test(String(r.directive))) && (x.blocked == null || r.blocked === x.blocked) && (x.source == null || r.source === x.source) && r.document === x.document) || null;
}
/** A NEGATIVE CONTROL THAT PARSES HOSTILE MARKUP RUNS HERE (lane chrome-156-drift): `expression` is evaluated in a FRESH
 *  about:blank tab of the suite's own Chrome — a page with no content-security policy — over that tab's own socket, and the
 *  tab is closed; resolves the value (returnByValue). Since Chrome 156 an inline handler is reported when its attribute is
 *  SET — in an inert document (createHTMLDocument / DOMParser / <template>) too, as the page that ran the code, at the
 *  position of the statement (measured on 156.0.8078.47; 155 reported only a handler that compiled). On the app page such a
 *  control IS a CSP report: the runner's «script-src-attr inline, line 1 column 101, source ""» was three suites' own
 *  control — `d.innerHTML =` at column 101 of the evaluated line. The same browser parses the same markup here; nothing
 *  reports and no handler runs. Bounded: a tab that never answers rejects after `ms`. */
export async function evalInBlankTab(cdpPort, expression, { ms = 15000 } = {}) {
  const t = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  try {
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('the blank tab\'s socket did not open')); });
    const r = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`the blank tab gave no answer in ${ms} ms`)), ms);
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { clearTimeout(timer); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (r.exceptionDetails) throw new Error('the blank tab threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  } finally {
    try { ws.close(); } catch { }
    try { await fetch(`http://127.0.0.1:${cdpPort}/json/close/${t.id}`); } catch { }
  }
}

/** WHAT THE DOOR SAW, SAID (lane bl-tests-e — the 2.369.413 hosted run: test-exit-access-ui's «a real click on 显示输出» logged
 *  «covered at press time by DIV.» and «measured again at (0, 0)» — an empty class named nothing, and a ZERO box was called a cover).
 *  The page half's helpers, one text every page source of the door carries. `desc` names an element by its tag, id, classes (three)
 *  and its box [left,top width×height]; one with no id and no class names its nearest ancestor that has one. `hider` = the NEAREST
 *  ancestor-or-self that hides it: display: none, content-visibility: hidden, or where a visibility other than visible STARTS.
 *  `winSay` = a product window's facts: its id, type, title, the conversation it shows, on show or every reason it is not (the
 *  window manager's own flags — minimized, another desktop, the Stage, a hidden tab — then the DOM: a hider, no box, a hidden page).
 *  `lostSay` = a target that is not under its point: gone (it left the document), NOT LAID OUT (a zero box) or hidden, each with its
 *  hider and its window. Read only: nothing here writes the page. */
const NAME_SRC = String.raw`const cls = (n) => String(typeof n.className === 'string' ? n.className : (typeof n.getAttribute === 'function' && n.getAttribute('class')) || '').trim(); const nm = (n) => String(n.tagName || '?').toLowerCase() + (n.id ? '#' + n.id : '') + (cls(n) ? '.' + cls(n).split(/\s+/).slice(0, 3).join('.') : ''); const named = (n) => { let s = nm(n); if (!n.id && !cls(n)) { let a = n.parentElement; while (a && !a.id && !cls(a)) a = a.parentElement; s += a ? ' (no id, no class — inside ' + nm(a) + ')' : ' (no id, no class)'; } return s; };`;
// the press instant's listeners (ARM_REAL) name what they saw WITHOUT a box: reading a box there would flush layout before the product's handlers
const NAME_ONLY_SRC = NAME_SRC + String.raw` const desc = (n) => (n && n.tagName ? named(n) : null);`;
const DESC_SRC = NAME_SRC + String.raw` const box = (n) => { const q = n.getBoundingClientRect(); return '[' + Math.round(q.left) + ',' + Math.round(q.top) + ' ' + Math.round(q.width) + '×' + Math.round(q.height) + ']'; }; const desc = (n) => { if (!n || !n.tagName) return null; const s = named(n), i = s.indexOf(' ('); return i < 0 ? s + ' ' + box(n) : s.slice(0, i) + ' ' + box(n) + s.slice(i); };`;
// hider: the nearest ancestor-or-self that hides `e` — a visibility only when e itself is not visible (a visible descendant is drawn), and
// only where it STARTS; content-visibility: hidden only on an ancestor (e's own box is drawn); a CLOSED <details> hides all but its summary
const SAY_SRC = DESC_SRC + String.raw` const hider = (e) => { const own = getComputedStyle(e).visibility !== 'visible'; for (let n = e, prev = null; n && n.nodeType === 1; prev = n, n = n.parentElement) { const cs = getComputedStyle(n), why = []; if (cs.display === 'none') why.push('display: none'); if (n !== e && cs.contentVisibility === 'hidden') why.push('content-visibility: hidden'); if (own && cs.visibility !== 'visible' && !(n.parentElement && n.parentElement.nodeType === 1 && getComputedStyle(n.parentElement).visibility !== 'visible')) why.push('visibility: ' + cs.visibility); if (prev && String(n.tagName).toUpperCase() === 'DETAILS' && !n.open && !(String(prev.tagName).toUpperCase() === 'SUMMARY' && (typeof n.querySelector !== 'function' || n.querySelector(':scope > summary') === prev))) why.push('a closed details: only its summary is drawn'); if (why.length) return desc(n) + ' (' + why.join(', ') + ')'; } return null; };
 const frameOf = (w) => { const A = typeof app !== 'undefined' ? app : null; const ch = w && w._tabChain; const host = ch && Array.isArray(ch.tabs) && A && A.wm && A.wm.windows ? A.wm.windows.get(ch.tabs[0]) : null; return host || w; };
 const winSay = (w, el) => { const top = w ? frameOf(w) : null; const frame = (top && top.element) || el || null; const node = (w && w.content) || el || frame; const why = []; if (top) { if (top.isMinimized) why.push('minimized' + (top !== w ? ' (its tab group)' : '')); if (top._hiddenByDesktop) why.push('on another desktop'); if (top._hiddenByStage) why.push('behind the Stage'); } if (w && w.content && w.content.classList && w.content.classList.contains('tab-hidden')) why.push('a hidden tab'); if (node) { const h = hider(node); if (h) why.push('hidden by ' + h); const q = node.getBoundingClientRect(); if (!(q.width > 0 && q.height > 0)) why.push('not laid out'); } if (document.visibilityState !== 'visible') why.push('the page is ' + document.visibilityState); const A = typeof app !== 'undefined' ? app : null; const s = w && A && A.sessions && typeof A.sessions.get === 'function' ? A.sessions.get(w.id) : null; return { id: w ? w.id : (el && el.id) || null, type: w ? w.type : null, title: w ? w.title : null, conv: (s && s.sessionId) || null, ...(top && top !== w ? { tabOf: top.id } : {}), onShow: !why.length, why, box: node ? box(node) : null, active: !!(frame && frame.classList && frame.classList.contains('window-active')) }; };
 const winOf = (e) => { const A = typeof app !== 'undefined' ? app : null; const pick = (part) => { let best = null, depth = -1; for (const v of A.wm.windows.values()) { const n0 = v[part]; if (!n0 || typeof n0.contains !== 'function' || !n0.contains(e)) continue; let d = 0; for (let n = n0; n; n = n.parentElement) d++; if (d > depth) { depth = d; best = v; } } return best; }; const best = A && A.wm && A.wm.windows ? (pick('content') || pick('element')) : null; if (best) return winSay(best); const el = typeof e.closest === 'function' ? e.closest('.window') : null; return el ? winSay(null, el) : null; };
 const lostSay = (e) => { if (!e) return { gone: 'no target' }; if (!e.isConnected) return { gone: 'it left the document' }; let out; try { const q = e.getBoundingClientRect(); out = { laid: q.width > 0 && q.height > 0, size: Math.round(q.width) + '×' + Math.round(q.height) }; } catch (x) { return { sayErr: String((x && x.message) || x) }; } try { out.hiddenBy = hider(e); out.win = winOf(e); } catch (x) { out.sayErr = String((x && x.message) || x); } return out; };`;
/** PURE: the Node half of the words — a miss the page half described (lostSay's fields + `hit`, what stood under the point) → one
 *  sentence. A zero box is NOT LAID OUT and names what hides it and the window it sits in, on show or why not — never «covered». */
export function lostWords(m) {
  if (!m) return 'nothing measured (no such element on the page)';
  if (m.gone) return m.gone === 'no target' ? 'no target' : `it left the page (${m.gone})`;
  const w = m.win;
  if (m.sayErr && m.laid !== false) return `the page could not say why (${m.sayErr}); under its point: ${m.hit || 'nothing'}`;
  const where = w ? `in window ${w.id || '(no id)'} (${[w.type, w.title ? `«${clipWords(w.title, SCENE_BOUNDS.title)}»` : null, w.conv ? `conversation ${w.conv}` : null, w.tabOf ? `a tab of ${w.tabOf}` : null].filter(Boolean).join(', ') || 'no window record'}${w.box ? ' ' + w.box : ''}), on show: ${w.onShow ? 'yes' : `no — ${(w.why || []).join(', ')}`}` : 'in no window';
  if (m.laid === false) return `NOT LAID OUT (${m.size}) — ${m.hiddenBy ? `hidden by ${m.hiddenBy}` : m.sayErr ? `the page could not say what hides it (${m.sayErr})` : 'no ancestor hides it (an empty box)'} — ${where}`;
  if (m.hiddenBy) return `HIDDEN by ${m.hiddenBy} — ${where}; under its point: ${m.hit || 'nothing'}`;
  return `covered by ${m.hit || 'nothing'} — ${where}`;
}

/** THE PAGE AS IT STANDS (lane bl-tests-e, the .413 facts unit — a red press is placed from what the page held, never guessed): the
 *  page half, PURE (a string), read only → { page, size, desktop, windows: [winSay + name + over], open, error? }. Every product
 *  window: the conversation it shows (`names` = { sessionId: a suite's own name }), on show or every reason not, and — when on show —
 *  what stands OVER the middle of its part on the page (each named as the highest ancestor that does not hold the window — a popup
 *  inside #main-wrapper is the popup; a window in a tab group is judged by its group's frame, as the product's own hider is). `open` = what is open over the page: the For-you
 *  popup, a dialog's overlay, a popover, a menu, a toast — laid out and not hidden. */
export function pageSceneSource({ names = {} } = {}) {
  return `(() => { try { ${SAY_SRC} const NAMES = ${JSON.stringify(names)}; const A = typeof app !== 'undefined' ? app : null;
    const out = { page: document.visibilityState + (typeof document.hasFocus === 'function' ? (document.hasFocus() ? ', focused' : ', not focused') : ''), size: innerWidth + '×' + innerHeight, desktop: null, windows: [], open: [] };
    try { out.desktop = A && A.desktopManager ? (A.desktopManager.activeDesktopId || null) : null; } catch { }
    const top = (n, frame) => { let k = n; while (k.parentElement && k.parentElement !== document.body && !k.parentElement.contains(frame)) k = k.parentElement; return k; };   // the highest ancestor that does not hold the window (a popup inside #main-wrapper is the popup, never #main-wrapper)
    for (const w of (A && A.wm && A.wm.windows ? [...A.wm.windows.values()] : [])) {
      const s = winSay(w); if (s.conv && Object.prototype.hasOwnProperty.call(NAMES, s.conv)) s.name = NAMES[s.conv]; s.over = [];
      const frame = (frameOf(w) || w).element || w.element;
      if (s.onShow && frame && typeof document.elementsFromPoint === 'function') { const c = (w.content || frame).getBoundingClientRect(); const l = Math.max(c.left, 0), r = Math.min(c.left + c.width, innerWidth), t = Math.max(c.top, 0), b = Math.min(c.top + c.height, innerHeight); if (!(r > l && b > t)) s.over.push('(its middle is off the page)'); else { const seen = new Set(); for (const n of document.elementsFromPoint((l + r) / 2, (t + b) / 2)) { if (frame.contains(n)) break; const k = top(n, frame); if (!seen.has(k)) { seen.add(k); if (s.over.length < 12) s.over.push(desc(k)); } } s.overCount = seen.size; } }
      out.windows.push(s);
    }
    for (const n of document.querySelectorAll('#user-todos-popup, .dialog-overlay, [data-popover], .context-menu, .taskbar-context-menu, #global-toasts > .global-toast')) { const q = n.getBoundingClientRect(); if (q.width > 0 && q.height > 0 && !hider(n)) { out.openCount = (out.openCount || 0) + 1; if (out.open.length < 40) out.open.push(desc(n)); } }
    return out; } catch (x) { return { error: String((x && x.message) || x) }; } })()`;
}
/** PURE: a string cut to `n` characters, the cut said («…») — every page-made word a log prints goes through it */
export const clipWords = (s, n = 80) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
export const SCENE_BOUNDS = Object.freeze({ title: 80, item: 160, windows: 12, open: 6, over: 4 });
/** PURE: a scene (pageSceneSource's answer) → lines a log reads, BOUNDED (SCENE_BOUNDS: a title, each named element, the windows, the
 *  open list — a cut list says how many more). */
export function sceneWords(sc) {
  const B = SCENE_BOUNDS, more = (list, n, total = list.length) => (total > n ? [...list.slice(0, n), `${total - n} more`] : list.slice(0, n));
  if (!sc) return ['(no scene was read)'];
  if (sc.error) return [`(the page could not be read: ${clipWords(sc.error, B.item)})`];
  const wins = Array.isArray(sc.windows) ? sc.windows : [];
  const lines = [`page: ${clipWords(sc.page, B.item)} · ${clipWords(sc.size, 20)}${sc.desktop ? ` · desktop ${clipWords(sc.desktop, B.title)}` : ''} · ${wins.length} window(s)`];
  for (const w of wins.slice(0, B.windows)) {
    const what = [clipWords(w.type, 20), w.title ? `«${clipWords(w.title, B.title)}»` : null, w.conv ? `conversation ${clipWords(w.conv, B.title)}${w.name ? ` (${clipWords(w.name, B.title)})` : ''}` : null, w.tabOf ? `(a tab of ${clipWords(w.tabOf, B.title)})` : null].filter(Boolean).join(' ');
    const over = Array.isArray(w.over) ? w.over : [];
    lines.push(`window ${clipWords(w.id, B.title)} ${what} — ${w.onShow ? `ON SHOW ${clipWords(w.box, 40)}${w.active ? ', active' : ''}${over.length ? ` · over its middle: ${more(over.map((x) => clipWords(x, B.item)), B.over, Number.isFinite(w.overCount) ? w.overCount : over.length).join(' · ')}` : ' · nothing over its middle'}` : `NOT on show: ${(w.why || []).slice(0, 8).map((x) => clipWords(x, B.item)).join(', ')}`}`);
  }
  if (wins.length > B.windows) lines.push(`${wins.length - B.windows} more window(s)`);
  const open = Array.isArray(sc.open) ? sc.open : [];
  const openN = Number.isFinite(sc.openCount) ? sc.openCount : open.length;
  lines.push(openN ? `open over the page: ${more(open.map((x) => clipWords(x, B.item)), B.open, openN).join(' · ')}` : 'open over the page: nothing');
  return lines;
}

/** THE MEASURE, PURE (B-4f03, lane bl-tests-e — the three last copies' needs, folded into the one door): realClicker's page half
 *  as a string. `sel` = a selector, or an EXPRESSION (a string that starts with «(», evaluated in the page — pairing-ui-harness's
 *  text matches). `scroll` = 'center' (the default) | 'nearest' (the least move: a row in a list) | 'if-needed' (centred ONLY when
 *  the target is not wholly in view — a press that scrolls its own target moves it under the pointer: test-wake-approve-card-
 *  chrome measured a second centre scroll move a centred Approve by 40 px and the press arm rightly refused it). `aimLeft` = aim
 *  that many px in from the target's left edge, the centre when it is narrower than twice that (a row's centre may hold its own buttons). The
 *  element is kept as window.__vsRealClickEl for the still look, the under-the-pointer ask and the landing arm. */
export function realClickMeasureSource(sel, { scroll = 'center', aimLeft = null } = {}) {
  const s = String(sel);
  const target = s.startsWith('(') ? s : `document.querySelector(${JSON.stringify(s)})`;
  const SCROLL = {
    center: "e.scrollIntoView({ block: 'center' });",
    nearest: "e.scrollIntoView({ block: 'nearest' });",
    'if-needed': "{ const p = e.getBoundingClientRect(); if (p.top < 0 || p.bottom > innerHeight || p.left < 0 || p.right > innerWidth) e.scrollIntoView({ block: 'center' }); }",
  };
  if (!Object.hasOwn(SCROLL, scroll)) throw new Error(`realClick: scroll is center / nearest / if-needed (got ${JSON.stringify(scroll)})`);
  if (aimLeft != null && !(Number.isFinite(aimLeft) && aimLeft >= 0)) throw new Error(`realClick: aimLeft is a number of px ≥ 0 (got ${JSON.stringify(aimLeft)})`);
  const aim = aimLeft == null ? 'q.left + q.width / 2' : `q.left + Math.min(q.width / 2, ${aimLeft})`;
  return `(() => { ${SAY_SRC} const e = ${target}; if (!e) return null; ${SCROLL[scroll]} const q = e.getBoundingClientRect(); const x = ${aim}, y = q.top + q.height / 2; window.__vsRealClickEl = e; const hit = document.elementFromPoint(x, y); const hits = !!hit && (hit === e || e.contains(hit)); return { x, y, w: q.width, h: q.height, hit: desc(hit), hits, ...(hits ? {} : lostSay(e)) }; })()`;
}

/** THE PRESS ARM, ASKED OF THE PRODUCT (lane bl-tests-e — the 2.369.413 checkpoint's hosted red: test-exit-access-ui's Allow,
 *  pressed through this door ~80 ms after the door was called, counted for NOTHING — the product rightly ignored it — and the ask
 *  expired 60 s later in a cascade of fifteen legs). An approval the product ARMS (src/lib/press-arm.js: a press counts only once the
 *  control sat still ARM_MS since it appeared or moved) is pressed as a person's press: the door reads EVERY arm mark the product
 *  keeps on the target and its ancestors — `_armSince` (with `_armTop`: none, or a top that moved since the product last read it,
 *  is re-armed at the press — press-arm.js armAfterLayout), `_openedAt` (a card / dock opened under the pointer), an Outbox card's
 *  `data-armed-at` (the time it may decide, on the Date clock) — never a list of selectors, and waits for the LATEST of them by
 *  the page's own clock. The For-you WINDOW's pane arm is not readable from the page (its state getter carries no armAt) — a suite
 *  that presses an armed action there keeps its own wait. The page half, PURE (a string): → { marks: [{ mark, since, age |
 *  readyIn, moved }] }. */
export function armProbeSource() {
  return `(() => { const e = window.__vsRealClickEl; const marks = []; if (!e) return { marks }; const now = performance.now();
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      if (typeof n._armSince === 'number') { const moved = !!n.isConnected && (typeof n._armTop !== 'number' || Math.abs(n.getBoundingClientRect().top - n._armTop) > 1); marks.push({ mark: '_armSince', self: n === e, since: n._armSince, age: now - n._armSince, moved }); }
      if (typeof n._openedAt === 'number') marks.push({ mark: '_openedAt', since: n._openedAt, age: now - n._openedAt, moved: false });
      if (n.dataset && n.dataset.armedAt && Number.isFinite(Number(n.dataset.armedAt))) { const at = Number(n.dataset.armedAt); marks.push({ mark: 'data-armed-at', since: at, readyIn: at - Date.now(), moved: false }); }
    }
    return { marks }; })()`;
}
/** PURE: one probe → the door's next step: 'press' (no mark, or every mark ARM_MS old / past its ready time), or { wait: ms } — the
 *  LATEST mark's rest, a whole arm when any moved since the product last read it (its next pass re-arms it, then it ages). */
export function armStep(probe, armMs) {
  const marks = (probe && Array.isArray(probe.marks)) ? probe.marks : [];
  if (!marks.length) return 'press';
  if (marks.some((m) => m.moved)) return { wait: armMs, moved: true };
  const rest = Math.max(...marks.map((m) => (Number.isFinite(m.readyIn) ? m.readyIn : Number.isFinite(m.age) ? armMs - m.age : armMs)));
  return rest <= 0 ? 'press' : { wait: Math.ceil(rest) };
}
let _armMs = null, _armErr = null;
/** the product's ARM_MS, read from its own module (never typed here) — once, at the first armed target; a failed read says why */
async function armMsOf() {
  if (_armMs == null) { try { _armMs = (await import(new URL('../src/lib/press-arm.js', import.meta.url).href)).ARM_MS; } catch (e) { _armMs = NaN; _armErr = e; } }
  if (!Number.isFinite(_armMs)) throw new Error('realClick: the product\'s press arm (src/lib/press-arm.js ARM_MS) could not be read', { cause: _armErr || undefined });
  return _armMs;
}

/** A REAL CLICK AS ONE ACT (int358 — test-channel-jump ② was red 4 runs of 7 on the 2.369.358 train): a suite's real click
 *  MEASURED its element, then pressed where it HAD been; rows that move while an agent's turn lands (the card grows, the
 *  chat's tail pin scrolls it) put a NEIGHBOUR under the pointer, and the product rightly opened the neighbour. This door
 *  measures (scrolled into view), moves the pointer there and asks AT PRESS TIME whether the element under the pointer
 *  (document.elementFromPoint) is the measured one or inside it; a target that moved is re-aimed ONCE and said in the log;
 *  still not under the pointer ⇒ no press (false; `realClick.lastMiss` says why). `realClick.reaimed` = the last re-aim.
 *  `evalJs(expr)` = the suite's Runtime.evaluate (returnByValue); `cdp(method, params)` = its socket; `beforePress` = a
 *  test hook between the measure and the press (a RED control's scripted late shift). B-4f03: `scroll` / `aimLeft` / an
 *  EXPRESSION target (realClickMeasureSource above); `uncover` = the suite's own hook, run ONCE a call when another element
 *  covers the target's point (its toasts), then the point is measured again. A HIDDEN page is brought to the front first. An ARMED
 *  target (armProbeSource above) is pressed only once its latest mark is ARM_MS old — measured after the page is in front and the
 *  point proven; one that does not age within three arm times is NOT pressed and fails by name; a press the product re-stamped
 *  the target's own arm at (it moved) fails by name. `realClick.armed` =
 *  { mark, waitedMs } of the last armed press. `sleep` is injectable (a suite's fast legs drive the door on a scripted clock).
 *  WHAT IT SAW IS SAID (lane bl-tests-e, the .413 facts unit): every miss carries `why` (lostWords — an element by its tag, id,
 *  classes and box); a target with a ZERO box is NOT LAID OUT — named with the ancestor that hides it and the window it sits in, on
 *  show or why not — never «covered», never aimed at its (0, 0); at the measure and at the press it is looked at once more (laid
 *  out and covered there: the suite's uncover once, as before), then fails by name; after the press arm's wait it fails at once. A
 *  box under a hiding ancestor is HIDDEN, never «moved». The door never changes which page is in front without saying so in its
 *  line (`realClick.front`). */
export function realClicker({ evalJs, cdp, log = (line) => console.log(line), sleep = (ms) => new Promise((res) => setTimeout(res, ms)) }) {
  const desc = NAME_ONLY_SRC;   // the press instant's words (NAME_ONLY_SRC above): tag, id, classes — never an empty class; no box read there
  const MEASURE = (sel, o) => realClickMeasureSource(sel, o);
  const UNDER = (x, y) => `(() => { ${SAY_SRC} const e = window.__vsRealClickEl, hit = document.elementFromPoint(${x}, ${y}); const hits = !!e && e.isConnected && !!hit && (hit === e || e.contains(hit)); return { hit: desc(hit), hits, ...(hits ? {} : lostSay(e)) }; })()`;
  // B-8b8c (lane dialog-press): the same door's two halves — it waits while its target MOVES (THE still verdict: its rect on
  // two looks a frame apart, a running box-moving transition on it or an ancestor), then checks where the press LANDED. A
  // disabled or covered target is not waited on (a suite may press one on purpose; the re-aim below handles a cover).
  const ARM_REAL = `(() => { ${desc} const e = window.__vsRealClickEl; const S = window.__vsStillSeen = { down: null, up: null, click: null }; const rec = { down: (ev) => ({ mine: !!e && (ev.target === e || e.contains(ev.target)), what: desc(ev.target) }), up: (ev) => { if (!e || !e.isConnected) return { gone: true }; const h = document.elementFromPoint(ev.clientX, ev.clientY); return { mine: !!h && (h === e || e.contains(h)), what: desc(h) }; }, click: (ev) => ({ mine: !!e && (ev.target === e || e.contains(ev.target)), anc: !!e && ev.target !== e && typeof ev.target.contains === 'function' && ev.target.contains(e), what: desc(ev.target) }) }; const on = (type, key) => { const f = (ev) => { if (!S[key]) S[key] = rec[key](ev); document.removeEventListener(type, f, true); }; document.addEventListener(type, f, true); }; on('pointerdown', 'down'); on('pointerup', 'up'); on('click', 'click'); const own = () => (e && typeof e._armSince === 'number' ? e._armSince : null); const sd = () => { S.stampDown = own(); document.removeEventListener('pointerdown', sd, true); }; document.addEventListener('pointerdown', sd, true); const sc = () => { document.removeEventListener('click', sc, true); setTimeout(() => { S.stampAfter = own(); }, 0); }; document.addEventListener('click', sc, true); return true; })()`;
  const realClick = async (sel, { beforePress = null, stillMs = 3000, scroll = 'center', aimLeft = null, uncover = null } = {}) => {
    realClick.lastMiss = null; realClick.reaimed = null; realClick.landed = null; realClick.armed = null; realClick.front = false;
    const mo = { scroll, aimLeft };
    // a HIDDEN page is brought to the front first (a background tab advances no animation: the still look would wait for ever, and
    // the press arm is measured on the page a person looks at); a visible page is left as the suite put it. The door SAYS it in its
    // line: which page is in front is the suite's world, and a press made after the door changed it is read with that line beside it
    let hiddenPage = false;
    try { hiddenPage = !!(await evalJs(`document.visibilityState === 'hidden'`)); } catch { }
    if (hiddenPage) {
      try { await cdp('Page.bringToFront'); realClick.front = true; log(`  [realClick] ${sel}: the page was HIDDEN (another page in front) — the door brought it to the front (Page.bringToFront) before the measure`); }
      catch (x) { log(`  [realClick] ${sel}: the page is HIDDEN and could not be brought to the front (${(x && x.message) || x})`); }
    }
    let uncovered = false;
    const clearOnce = async (at) => { if (!uncover || uncovered) return false; uncovered = true; await uncover(at); return true; };
    const missOf = (m, extra = {}) => (m ? { ...m, ...extra, why: extra.why || lostWords(m) } : null);   // null stays null: no such element
    let r = await evalJs(MEASURE(sel, mo));
    if (r && !r.hits && r.laid === false) r = await evalJs(MEASURE(sel, mo));   // a ZERO box is NOT a cover: looked at once more, never uncovered
    if (r && !r.hits && r.laid !== false && await clearOnce(r)) r = await evalJs(MEASURE(sel, mo));
    if (!r || !r.hits) { realClick.lastMiss = missOf(r); return false; }
    {
      const t0 = Date.now(); let prev = null, look = null, v = 'moving';
      while (Date.now() - t0 < stillMs) { look = await evalJs(stillLookSource('JS:window.__vsRealClickEl')); v = stillVerdict(prev, look); if (v !== 'moving') break; prev = look; await sleep(40); }
      if (v === 'moving') { realClick.lastMiss = { ...r, why: `it never held still in ${stillMs} ms${look && look.movers && look.movers.length ? ` (moving: ${look.movers.join(', ')})` : ''}` }; log(`  [realClick] ${sel}: ${realClick.lastMiss.why} — no press`); return false; }
      // a look with no box (stillVerdict 'gone') is never the aim: its centre is (0, 0), the page's corner — the press loop below says it
      if (look && look.found && Array.isArray(look.rect) && look.rect[2] > 0 && look.rect[3] > 0) r = { ...r, ...(aimLeft == null ? { x: look.x, y: look.y } : { x: look.rect[0] + Math.min(look.rect[2] / 2, aimLeft), y: look.rect[1] + look.rect[3] / 2 }) };
    }
    if (beforePress) await beforePress(r);
    for (let aim = 0; ; aim++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      const u = await evalJs(UNDER(r.x, r.y));
      if (u && u.hits) break;
      const again = (m) => (!m ? 'nothing (gone)' : m.hits ? `(${Math.round(m.x)}, ${Math.round(m.y)})` : m.laid === false ? lostWords(m) : `(${Math.round(m.x)}, ${Math.round(m.y)}) — still not under its point: ${lostWords(m)}`);
      if (u && u.laid === false) {   // a ZERO box: NOT LAID OUT — never «covered»; looked at once more (the one re-aim), then failed by name
        let r2 = aim === 0 ? await evalJs(MEASURE(sel, mo)) : null, cleared2 = false;
        // laid out again on that look but not under its point: the suite's uncover runs once there, as the old door's did, and it is measured again
        if (r2 && !r2.hits && r2.laid !== false && await clearOnce(r2)) { cleared2 = lostWords(r2); r2 = await evalJs(MEASURE(sel, mo)); }
        const then = !r2 ? '' : r2.hits ? `; laid out again at ${again(r2)}` : r2.laid === false ? ' and once more' : `; on one more look ${again(r2)}`;
        const uncov = cleared2 ? ` (on that look ${cleared2} — the suite's uncover ran once)` : '';
        if (r2 && r2.hits) { realClick.reaimed = { from: { x: Math.round(r.x), y: Math.round(r.y) }, notLaidOut: true, to: { x: Math.round(r2.x), y: Math.round(r2.y) }, ...(cleared2 ? { uncovered: true } : {}) }; log(`  [realClick] ${sel}: ${lostWords(u)} — seen at the press${uncov}${then} — re-aimed once`); r = r2; continue; }
        realClick.lastMiss = { ...r, atPress: u, again: r2, why: `${lostWords(u)} — seen at the press${uncov}${then}` }; log(`  [realClick] ${sel}: ${realClick.lastMiss.why} — not pressed`); return false;
      }
      const cleared = aim === 0 ? await clearOnce(u) : false;
      if (aim === 1) { realClick.lastMiss = { ...r, atPress: u, why: `still not under the pointer after one re-aim — ${lostWords(u)}` }; log(`  [realClick] ${sel}: still not under the pointer after one re-aim (${lostWords(u)}) — no press`); return false; }
      const r2 = await evalJs(MEASURE(sel, mo));
      realClick.reaimed = { from: { x: Math.round(r.x), y: Math.round(r.y) }, under: u && u.hit, to: r2 ? { x: Math.round(r2.x), y: Math.round(r2.y) } : null, ...(cleared ? { uncovered: true } : {}) };
      if (cleared) log(`  [realClick] ${sel}: ${u && u.hiddenBy ? `HIDDEN at press time — ${lostWords(u)}` : `covered at press time by ${u && u.hit}`} — the suite's uncover ran once; measured again: ${again(r2)}`);
      else log(`  [realClick] ${sel}: ${u && u.gone ? `it left the page between the measure and the press (${u.gone})` : u && u.hiddenBy ? `HIDDEN at press time — ${lostWords(u)}` : 'it moved between the measure and the press'} — at (${Math.round(r.x)}, ${Math.round(r.y)}) the pointer was over ${u && u.hit}; re-aimed once at ${again(r2)}`);
      if (!r2 || !r2.hits) { realClick.lastMiss = missOf(r2); return false; }
      r = r2;
    }
    // THE PRESS ARM (armProbeSource): an approval the product arms is pressed only once its mark is ARM_MS old, never inside it
    let arm = await evalJs(armProbeSource());
    const armedNow = (p) => !!(p && Array.isArray(p.marks) && p.marks.length);
    const marksSaid = (p) => (p && p.marks || []).map((m) => m.mark + (m.moved ? ' (moved)' : '')).join(' + ');
    if (armedNow(arm)) {
      const ARM = await armMsOf();
      let waited = 0;
      for (let step = armStep(arm, ARM); step !== 'press'; step = armStep(arm, ARM)) {
        if (waited >= 3 * ARM) { const mv = arm.marks.some((m) => m.moved); realClick.lastMiss = { ...r, arm, why: `ARMED (${marksSaid(arm)}) and not ${ARM} ms still after ${waited} ms${mv ? ' — a STALE stamp: it moved since the product last read it and no pass of the product read it again (a person would press, be told, and press again)' : ''} — not pressed` }; log(`  [realClick] ${sel}: ${realClick.lastMiss.why}`); return false; }
        const w = Math.min(step.wait + 30, 3 * ARM - waited); await sleep(w); waited += w;
        arm = await evalJs(armProbeSource());
      }
      realClick.armed = { mark: marksSaid(arm), waitedMs: waited };
      if (waited) {
        const u2 = await evalJs(UNDER(r.x, r.y));
        if (!u2 || !u2.hits) { realClick.lastMiss = { ...r, atPress: u2, why: `not under the pointer after the arm's ${waited} ms — not pressed (${u2 ? lostWords(u2) : 'nothing measured'})` }; log(`  [realClick] ${sel}: ${realClick.lastMiss.why}`); return false; }
      }
    }
    const ownStamp = armedNow(arm) ? (arm.marks.find((m) => m.mark === '_armSince' && m.self) || null) : null;   // the target carries its OWN stamp: judged at the press itself (ARM_REAL)
    await evalJs(ARM_REAL);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    let seen = null;
    for (let i = 0; i < 40; i++) { seen = await evalJs('window.__vsStillSeen || null'); if (seen && seen.down) break; await sleep(25); }
    realClick.landed = landingVerdict(seen, { click: 'any' });
    if (!realClick.landed.ok) { realClick.lastMiss = { ...r, seen, why: realClick.landed.why }; log(`  [realClick] ${sel}: MISSED — ${realClick.landed.why}`); return false; }
    if (ownStamp) {   // the product re-stamped the target's OWN arm AT the press (it moved): the press counted for nothing — said here, never as a cascade.
      // The stamp is read at the INSTANT of the press (the capture listener, before any handler) and right after the click's dispatch —
      // never a round trip later, where a later row pass that moved the same element would read as a re-arm of a press that counted
      for (let i = 0; i < 20 && !(seen && Object.prototype.hasOwnProperty.call(seen, 'stampAfter')); i++) { await sleep(25); seen = await evalJs('window.__vsStillSeen || null'); }
      if (seen && Number.isFinite(seen.stampDown) && Number.isFinite(seen.stampAfter) && seen.stampAfter > seen.stampDown) { realClick.lastMiss = { ...r, arm, seen, why: 'the product RE-ARMED it at the press (_armSince) — the press counted for nothing' }; log(`  [realClick] ${sel}: ${realClick.lastMiss.why}`); return false; }
    }
    return true;
  };
  realClick.lastMiss = null; realClick.reaimed = null; realClick.landed = null; realClick.armed = null; realClick.front = false;
  return realClick;
}

/** THE STILL PRESS (B-8b8c, lane dialog-press — MEASURED on test-refresh-note-chrome, the .390 mirror's red): a form drawn
 *  21–30 ms after the suite's own sidebar toggle rides #main-wrapper's 0.2 s margin-left slide WITH the whole workspace; 确定's
 *  centre, read during the slide, was 取消 by the time the press arrived (or the footer: the mousedown on 确定, the release
 *  after it slid ⇒ the click on their common ancestor). The dialog never moved inside its window — the ground under it did.
 *  A press lands only on a target that is STILL: the element at its own point, enabled, the same rect on two looks a frame
 *  apart, and NO running transition / animation that can move it (on it or any ancestor — document.getAnimations by effect
 *  target, a property that moves a box). Then it CHECKS WHERE IT LANDED (a one-shot capture listener: pointerdown, click): a
 *  press that lands elsewhere is a named miss, never a silent one.
 *  PURE parts: STILL_MOVERS, stillVerdict, landingVerdict (scripts/test-still-press.mjs). */
export const STILL_MOVERS = /^(left|top|right|bottom|inset|margin|padding|transform|translate|scale|rotate|width|height|min-width|min-height|max-width|max-height|flex|grid|gap|border-width|border-left-width|border-top-width|font-size|line-height|zoom)/;
/** One look → the next: 'gone' (no target / no box) · 'disabled' · 'moving' (a mover runs, or the rect changed since the
 *  last look, or there is no last look) · 'covered' (another element at its point) · 'press'. */
export function stillVerdict(prev, now, { epsilon = 0.5 } = {}) {
  if (!now || !now.found) return 'gone';
  if (!Array.isArray(now.rect) || !(now.rect[2] > 0 && now.rect[3] > 0)) return 'gone';
  if (now.disabled) return 'disabled';
  if (Array.isArray(now.movers) && now.movers.length) return 'moving';
  if (!prev || !prev.found || !Array.isArray(prev.rect) || prev.rect.some((v, i) => Math.abs(v - now.rect[i]) > epsilon)) return 'moving';
  if (!now.hits) return 'covered';
  return 'press';
}
/** Where it landed (the capture listener's record {down, up, click}) → {ok, why}. down = the pointerdown's target; up = what
 *  stood under the RELEASE point (elementFromPoint — a pointer capture retargets the event, never the point; `gone` = the
 *  target left the page on its press, nothing to judge); click = its target, `anc` = an ancestor of the target (the release
 *  retargeted by a capture, e.g. a title bar's drag — it lands when the release was over the target). `click: false` = a target
 *  that acts on its pointerdown (no click owed); `click: 'any'` = none owed, but one that came must land. */
export function landingVerdict(seen, { click = true } = {}) {
  if (!seen || !seen.down) return { ok: false, why: 'no pointerdown reached the page' };
  if (!seen.down.mine) return { ok: false, why: `the press landed on ${seen.down.what}, not on the target` };
  if (seen.up && !seen.up.gone && !seen.up.mine) return { ok: false, why: `released over ${seen.up.what} — the target moved between the press and the release` };
  if (!click) return { ok: true };
  if (!seen.click) return click === 'any' ? { ok: true } : { ok: false, why: 'no click followed the press' };
  if (!seen.click.mine && !(seen.click.anc && seen.up && seen.up.mine)) return { ok: false, why: `the click went to ${seen.click.what}` };
  return { ok: true };
}
/** The page half (one expression): the target by selector, or `JS:<expression>` → what a look reads. */
export function stillLookSource(sel) {
  const target = sel.startsWith('JS:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})`;
  return `(() => { const e = ${target}; if (!e || !e.isConnected) return { found: false };
    const desc = (n) => (n ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : null);
    // a target that WRAPS (an inline link over two lines) is aimed at its FIRST line fragment: its bounding box's centre is its own
    // paragraph, never the link (lane login-request-card — the UI train's hosted mirror: «covered, under its point: div.ut-text»)
    const q = e.getBoundingClientRect(); const fr = typeof e.getClientRects === 'function' ? e.getClientRects() : null; const a = fr && fr.length > 1 && fr[0].width > 0 && fr[0].height > 0 ? fr[0] : q;
    const x = a.left + a.width / 2, y = a.top + a.height / 2; const h = document.elementFromPoint(x, y);
    const MOV = ${STILL_MOVERS};
    const kebab = (p) => String(p).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    const movers = (typeof document.getAnimations === 'function' ? document.getAnimations() : []).filter((a) => a.playState === 'running' && a.effect && a.effect.target && typeof a.effect.target.contains === 'function' && a.effect.target.contains(e))
      .flatMap((a) => (a.transitionProperty ? [a.transitionProperty] : typeof a.effect.getKeyframes === 'function' ? [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))] : []).map(kebab).filter((p) => MOV.test(p)).map((p) => p + '@' + desc(a.effect.target)));
    return { found: true, rect: [q.left, q.top, q.width, q.height], x, y, hits: !!h && (h === e || e.contains(h)), under: desc(h), disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true', movers }; })()`;
}
export function stillPresser({ evalJs, cdp, log = (line) => console.log(line), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const ARM = (sel) => {
    const target = sel.startsWith('JS:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})`;
    return `(() => { const e = ${target}; const desc = (n) => (n ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : null);
      const S = window.__vsStillSeen = { down: null, up: null, click: null };
      const rec = { down: (ev) => ({ mine: !!e && (ev.target === e || e.contains(ev.target)), what: desc(ev.target) }), up: (ev) => { if (!e || !e.isConnected) return { gone: true }; const h = document.elementFromPoint(ev.clientX, ev.clientY); return { mine: !!h && (h === e || e.contains(h)), what: desc(h) }; }, click: (ev) => ({ mine: !!e && (ev.target === e || e.contains(ev.target)), anc: !!e && ev.target !== e && typeof ev.target.contains === 'function' && ev.target.contains(e), what: desc(ev.target) }) };
      const on = (type, key) => { const f = (ev) => { if (!S[key]) S[key] = rec[key](ev); document.removeEventListener(type, f, true); }; document.addEventListener(type, f, true); };
      on('pointerdown', 'down'); on('pointerup', 'up'); on('click', 'click'); return true; })()`;
  };
  /** press(sel, {touch, timeoutMs, click, gate, aim, hold}) → true | false (`hold` = ms between the mouse's down and its up) (press.last says what it saw); `gate: false` = the
   *  mutant road (no still gate — a RED control's): it presses the first look that is under its point; `aim(look)` = a test
   *  hook between the look and the press that may hand back another point (a RED control's stale aim: where it WAS). */
  const press = async (sel, { touch = false, timeoutMs = 5000, click = true, gate = true, aim = null, hold = 0 } = {}) => {
    const t0 = Date.now();
    let prev = null, now = null, verdict = 'gone', looks = 0;
    while (Date.now() - t0 < timeoutMs) {
      now = await evalJs(stillLookSource(sel)); looks++;
      verdict = gate ? stillVerdict(prev, now) : (now && now.found && now.hits && !now.disabled ? 'press' : 'gone');
      if (verdict === 'press') break;
      prev = now;
      await sleep(40);   // two frames apart at the least: the next look sees a rect that moved
    }
    press.last = { sel, verdict, look: now, looks, waitedMs: Date.now() - t0, seen: null, landed: null };
    if (verdict !== 'press') {
      log(`  [stillPress] ${sel}: NOT pressed — ${verdict} after ${press.last.waitedMs} ms, ${looks} looks (under its point: ${now && now.under}${now && now.movers && now.movers.length ? `; moving: ${now.movers.join(', ')}` : ''})`);
      return false;
    }
    await evalJs(ARM(sel));
    const { x, y } = aim ? ((await aim(now)) || now) : now;
    if (touch) { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); if (hold > 0) await sleep(hold); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }   // hold (lane vault-2fa-pick): a person's press lasts tens of ms — what moves between the down and the up is judged by the release
    let seen = null;
    for (let i = 0; i < 40; i++) { seen = await evalJs('window.__vsStillSeen || null'); if (seen && seen.down && (seen.click || !click)) break; await sleep(25); }
    const landed = landingVerdict(seen, { click });
    press.last = { ...press.last, seen, landed };
    if (!landed.ok) { log(`  [stillPress] ${sel}: MISSED — ${landed.why} (aimed at (${Math.round(x)}, ${Math.round(y)}) after ${press.last.waitedMs} ms)`); return false; }
    return true;
  };
  press.last = null;
  return press;
}
/** A suite that plants a violation ON PURPOSE (a negative control) TAKES its report: waits ≤ `ms` for `want` lines matching
 *  `match` (a parsed line → bool) in this suite's file, removes them and returns them (the hub never writes the same key
 *  twice). What is left is what the teardown judges. */
// THE TAKE NEVER REWRITES THE HUB'S FILE (B-c327 — it read the file, wrote the rest to a .take and renamed that over it:
// a report the hub appended between the read and the rename was lost, and the teardown could not see it). The file stays
// the hub's, append-only; what this suite took is kept HERE, line by line, and every reader of this suite's file —
// cspReportLines: the take itself, a suite's own read, the teardown (cspReportsIn) — leaves it out.
const CSP_TAKEN = new Map(); // a taken line's text → how many times it was taken
/** The report lines of `file` (this suite's CSP_REPORTS_FILE by default), less every line this suite took from it. */
export function cspReportLines(file = CSP_REPORTS_FILE) {
  let lines = []; try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { }
  if (file !== CSP_REPORTS_FILE || !CSP_TAKEN.size) return lines;
  const left = new Map(CSP_TAKEN);
  return lines.filter((l) => { const n = left.get(l) || 0; if (n) left.set(l, n - 1); return !n; });
}
export async function takeCspReports(match, { ms = 5000, step = 100, want = 1 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const lines = cspReportLines();
    const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const hit = parsed.filter((r) => r && match(r));
    if (hit.length >= want || Date.now() - t0 > ms) {
      lines.forEach((l, i) => { if (parsed[i] && match(parsed[i])) CSP_TAKEN.set(l, (CSP_TAKEN.get(l) || 0) + 1); });
      return hit;
    }
    await new Promise((r) => setTimeout(r, step));
  }
}
/** A SUITE'S OWN PROBE IS NEVER COUNTED AS THE APP'S (lane ci-mirror-hygiene, 2.369.362 — the mirror's Chrome 156 ran
 *  test-chat-mermaid-chrome red on 2.369.361, both tries, on its OWN XSS probe). A hostile payload a suite plants ON THE
 *  APP PAGE to prove the product drops it can still be REPORTED: the product's sanitizer parses it in an inert document,
 *  and since Chrome 156 a dropped inline handler is reported when its attribute is SET (evalInBlankTab) — nothing ran.
 *  One browser files that report, another does not, so it is EXPECTED — keyed by the probe's own payload: `key` names all
 *  of PROBE_KEY_FIELDS (`sample` = the payload's handler text, the browser's ≤ 40-character cut; `source` = the code that
 *  set it; `document` = the app page) and a line must match every one exactly; a key that names fewer throws (it would
 *  take somebody else's report). Called once the reports have landed (a report-uri post takes ~0.4 s): the matching
 *  lines are taken out of this suite's file → { taken, ok, kind, noticed } — `ok` = none (a browser that does not report
 *  it, Chrome 154) or EXACTLY one; `kind` / `noticed` = the hub's verdict on the taken line (lane csp-mermaid-sites r2:
 *  the take alone took a NOTICED line as gladly as the sanitizer's — the suite judges them, probeVerdictFault below).
 *  A line that differs in any field is not taken: the suite's legs and the teardown name it, red.
 *  Never a wider policy, never a dropped probe, never a leg skipped by the browser's version. */
export const PROBE_KEY_FIELDS = Object.freeze(['directive', 'blocked', 'sample', 'source', 'document']);
export async function takeProbeCspReport(key, { ms = 0 } = {}) {
  const missing = PROBE_KEY_FIELDS.filter((k) => typeof key?.[k] !== 'string' || !key[k]);
  if (missing.length) throw new Error(`takeProbeCspReport: the key names no ${missing.join(' / ')} — a probe's report is keyed by its own payload`);
  const taken = await takeCspReports((r) => PROBE_KEY_FIELDS.every((k) => r[k] === key[k]), { ms, want: 1 });
  return { taken, ok: taken.length <= 1, kind: taken[0] ? taken[0].kind || null : null, noticed: !!(taken[0] && taken[0].noticed) };
}
/** THE HUB'S VERDICT ON A PROBE THE SANITIZER DROPPED (lane csp-mermaid-sites r2 — merged beside the take, the real-browser
 *  leg passed whether the hub judged the probe's report the sanitizer's or filed the For-you notice). A browser that
 *  reports a dropped inline handler (Chrome ≥ REPORTS_DROPPED_HANDLER) files EXACTLY the probe's one line, and the hub
 *  judged it the sanitizer's parse: kind `sanitizer-parse`, no notice, no page-security notice in For you, and the count
 *  Diagnostics shows (GET /api/csp-reports — lines) +1 for the sanitizer, +0 for the app page; an older one files none and
 *  counts none. `probe` = takeProbeCspReport's answer, `major` = the browser's, `forYou` = the hub's open For-you items
 *  keyed `csp-report`, `count` = { before, after } (the summary before the probe was drawn and once its report landed).
 *  → '' when so, else what is wrong, in words (the leg prints it, red by name). */
export const REPORTS_DROPPED_HANDLER = 156;
export function probeVerdictFault(probe, { major, forYou = [], count = null } = {}) {
  const n = probe && Array.isArray(probe.taken) ? probe.taken.length : 0, p0 = n ? probe.taken[0] : null, out = [];
  const reports = Number(major) >= REPORTS_DROPPED_HANDLER;
  if (reports && n !== 1) out.push(`Chrome ${major} reports a dropped inline handler, and ${n} line(s) of the probe's arrived (want exactly 1)`);
  if (!reports && n !== 0) out.push(`Chrome ${major} reports no dropped inline handler, yet ${n} line(s) of the probe's arrived`);
  if (p0 && probe.kind !== 'sanitizer-parse') {
    let table = null; try { table = require('../src/app-csp.js').PARSE_SCRIPTS; } catch { }
    const script = (() => { try { return new URL(p0.source).pathname; } catch { return p0.source; } })();
    out.push(`the hub judged the probe's report the APP page's (kind ${probe.kind || 'none'}), not the sanitizer's parse — set by ${p0.source} at ${p0.line}:${p0.column}; ${table && table.includes(script) ? `${script} is in app-csp PARSE_SCRIPTS, so its parse site is not where the browser reported it` : `${script} is NOT in app-csp PARSE_SCRIPTS (${JSON.stringify(table)}): the CSP judge does not know this sanitizer`}`);
  }
  if (p0 && probe.noticed) out.push('the hub filed a For-you notice for it');
  const notices = (forYou || []).filter((x) => x && x.status !== 'done' && x.status !== 'dismissed');
  if (notices.length) out.push(`For you holds ${notices.length} page-security notice(s): ${notices.map((x) => `«${x.text}»`).join(' ')}`);
  if (count) {
    const d = (side) => (count.after?.[side]?.lines ?? NaN) - (count.before?.[side]?.lines ?? NaN);
    const want = reports ? 1 : 0;
    if (d('sanitizer') !== want || d('app') !== 0) out.push(`the count Diagnostics shows moved sanitizer +${d('sanitizer')} / app page +${d('app')} (want +${want} / +0)`);
  }
  return out.join('; ');
}
/** WHAT a report line names, in words (lane chrome-156-drift — the runner's line «script-src-attr inline, line 1 column
 *  101, source ""» named no element): the directive, the code's own SAMPLE (src/app-csp.js 'report-sample'; a suite's hub
 *  keeps it), where the code that set it ran — a line with no source is a script with no URL, the SUITE's own
 *  Runtime.evaluate — and, for an inline handler, the Chrome 156 rule that reports one when its attribute is SET. */
export function cspWhat(line) {
  let r; try { r = typeof line === 'string' ? JSON.parse(line) : line; } catch { return 'an unreadable line'; }
  if (!r || !r.directive) return 'an unreadable line';
  const at = `${r.line == null ? '?' : r.line}:${r.column == null ? '?' : r.column}`;
  const where = r.source ? `code in ${r.source} at ${at}` : `code with NO URL at ${at} — a script this SUITE evaluated over CDP (Runtime.evaluate), not the app's bundle`;
  const what = r.sample ? `«${r.sample}»` : (/^script-src/.test(r.directive) ? '(no sample — a hub outside this suite\'s file keeps none)' : `${r.blocked}`);
  if (r.kind === 'sanitizer-parse') return `${r.directive} ${r.blocked} — ${what}, set by ${where}, on ${r.document || 'the page'} · the SANITIZER's parse: DOMPurify's inert DOMParser document set this handler and dropped it, nothing ran (src/app-csp.js THE SANITIZER'S PARSE — counted apart, never a notice, not a gap in the policy)`;
  const attr = r.directive === 'script-src-attr' ? ' · an inline HANDLER: since Chrome 156 one is reported when its attribute is SET — in an inert document (createHTMLDocument / DOMParser / <template>) too — so a negative control built from markup belongs in a blank tab with no policy' : '';
  return `${r.directive} ${r.blocked} — ${what}, set by ${where}, on ${r.document || 'the page'}${attr}`;
}
/** A line the collector named the sanitizer's parse (src/app-csp.js KIND_SANITIZER) — printed at the end, never a failure:
 *  the policy is complete exactly when nothing ELSE was reported (lane chrome-156-followups). */
export const cspSanitizerLine = (l) => { try { return JSON.parse(l).kind === 'sanitizer-parse'; } catch { return false; } };
/** The report lines in these files: [{ file, lines }] (a file that is missing or empty is not listed). */
export function cspReportsIn(files) {
  const out = [];
  for (const f of files) { const lines = cspReportLines(f); if (lines.length) out.push({ file: f, lines }); } // this suite's own file less what it took (B-c327)
  return out;
}
function cspReportsAtExit() {
  const files = [CSP_REPORTS_FILE];
  for (const r of ENDS) {
    files.push(path.join(r, 'data', 'csp-reports.jsonl'));
    try { for (const e of fs.readdirSync(r, { withFileTypes: true })) if (e.isDirectory()) files.push(path.join(r, e.name, 'data', 'csp-reports.jsonl')); } catch { }
  }
  const all = cspReportsIn(files);
  try { fs.rmSync(path.dirname(CSP_REPORTS_FILE), { recursive: true, force: true }); } catch { }
  const excused = all.flatMap((f) => f.lines.filter((l) => cspExcused(l)));
  if (excused.length) console.log(`\n  CSP: ${excused.length} report(s) excused by the ONE exception list (scripts/scratch.mjs CSP_EXCEPTIONS — ${[...new Set(excused.map((l) => cspExcused(l).suite))].join(', ')})`);
  const dropped = all.flatMap((f) => f.lines.filter((l) => !cspExcused(l) && cspSanitizerLine(l)));
  if (dropped.length) { console.log(`\n  CSP: ${dropped.length} line(s) of the sanitizer's parse — not a gap in the policy:`); for (const l of dropped.slice(0, 10)) console.log(`      ↳ ${cspWhat(l)}`); }
  const found = all.map((f) => ({ ...f, lines: f.lines.filter((l) => !cspExcused(l) && !cspSanitizerLine(l)) })).filter((f) => f.lines.length);
  if (!found.length) return;
  const n = found.reduce((a, f) => a + f.lines.length, 0);
  console.error(`\n  ✗ CSP: the app page reported ${n} thing(s) its content-security policy would block (src/app-csp.js — the policy must be complete before it is enforced):`);
  for (const f of found) { console.error(`    ${f.file}`); for (const l of f.lines.slice(0, 40)) console.error(`      ${l}\n        ↳ ${cspWhat(l)}`); if (f.lines.length > 40) console.error(`      … ${f.lines.length - 40} more`); }
  console.error('FAILED (CSP reports at the end of the suite)');
  process.exitCode = 1;
}
if (CSP_REPORTS_FILE) { process.env[CSP_REPORTS_ENV] = CSP_REPORTS_FILE; process.on('exit', cspReportsAtExit); }

/** WHAT THE GATE'S DIRECTORY SWEEP MAY JUDGE (B-60d2) — scripts/scratch-sweep.mjs reads these, never a hand list.
 *  `prefixes`: a unit is a directory `<under>/<prefix><name>` — what scratch() mints, and a verify workspace
 *  `/tmp/vs-work/<lane>` (lane-ops: verifiers work there; the workspace itself is never a unit). `production`: never a
 *  unit — the product's agent-browser socket dir (src/browser-profiles.js socketDirDecision: /tmp/vs-ab-<uid>, the shape
 *  scratch('ab') refuses), sock-path's tmp rung (src/sock-path.js: /tmp/vs-dev-<uid>) and the workspace. */
export const WORK_ROOT = path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}work`);
export const SCRATCH_SWEEP = Object.freeze({
  prefixes: Object.freeze([Object.freeze({ under: TMP_ROOTS[0], prefix: FIXTURE_CWD_PREFIX }), Object.freeze({ under: WORK_ROOT, prefix: '' }), Object.freeze({ under: '/var/tmp', prefix: NODE_CACHE_PREFIX, nameRe: /^vs-node-(?:v\d+-)?[0-9a-f]{16}(?:\.tmp-[A-Za-z0-9]{6})?$/, marker: 'stamp.json', markerExempt: /\.tmp-/, staleMs: 7 * 24 * 3600e3 }), Object.freeze({ under: '/var/tmp', prefix: 'vs-hv-', nameRe: /^vs-hv-[A-Za-z0-9]{6}$/ })]),   // the suites' own node (B-ba47 A1): by its own shape, a week after its last use (a half-made one by its name); the home-verdict suite's made stand-ins
  production: Object.freeze([/^\/tmp\/vs-ab-(?:\d+|u)$/, /^\/tmp\/vs-dev-(?:\d+|u)$/, new RegExp(`^${WORK_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)]),
});

/** `scratch(name)` CREATED and OWNED (B-1d08, 2026-09-29): the directory plus
 *  its run record `<dir>/.vs-run.json` naming this process (pid + starttime +
 *  boot). The gate's scratch-orphan reaper (scripts/ci.mjs) never touches a
 *  process that names a root whose owner is alive, and convicts the ones under
 *  a root whose owner is gone — so a suite that PLANTS a detached process (a
 *  stray it wants to observe) plants it under a root made here, or another
 *  run's sweep may read it as litter. Returns the path; the caller removes it. */
export function scratchDir(name) {
  const dir = scratch(name);
  fs.mkdirSync(dir, { recursive: true });
  stampScratchRun(dir);
  return dir;
}

/** An ISOLATED $HOME for a suite that boots a server and needs discovery
 *  (2026-09-09). The server can only discover transcripts under the home it
 *  runs with, so the fixture goes HERE and the developer's real ~/.claude is
 *  never touched. `dirs` are pre-created because a spawned CLI/server must not
 *  race the first mkdir. Returns the home path; the caller removes it in its
 *  exit AND signal handlers. Stamped with this process's run record (B-1d08):
 *  the server's detached device daemon lives under this HOME, and it is litter
 *  exactly when this suite is gone. */
export function scratchHome(name, fsArg, dirs = ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) {
  const home = scratch(name);
  for (const d of dirs) (fsArg || fs).mkdirSync(path.join(home, d), { recursive: true });
  (fsArg || fs).mkdirSync(home, { recursive: true });
  stampScratchRun(home);
  return home;
}

/** B-0d3e: THE ONE DOOR FOR A RED CONTROL'S EDIT. `src` with `anchor` (a string, or a RegExp) replaced by `to` (a string
 *  or a replacer). The anchor must be in `src` exactly `count` times (1 by default; `count: 'any'` = at least once):
 *  anything else THROWS BY NAME — «ANCHOR GONE» / «ANCHOR NOT UNIQUE: n times» with the control's name and the anchor's
 *  first characters — so a control never builds nothing in silence, and the red says which product line moved.
 *  A string anchor's `to` is literal; a RegExp anchor's string `to` reads `$1` as String.prototype.replace does; a replacer
 *  is called once per match as replace calls it (match, …groups, offset, string), whatever `count` is. A RegExp that can
 *  match the empty string is refused by name (it would "match" between every character); a sticky flag is ignored. */
export function anchored(src, anchor, to, name, { count = 1 } = {}) {
  const text = String(src);
  const label = `${name ? `«${name}»: ` : ''}${String(anchor instanceof RegExp ? anchor : JSON.stringify(anchor)).slice(0, 80)}`;
  let n, all = null;
  if (anchor instanceof RegExp) {
    all = new RegExp(anchor.source, anchor.flags.replace(/[gy]/g, '') + 'g');
    if (new RegExp(`(?:${anchor.source})`, anchor.flags.replace(/[gy]/g, '')).test('') || [...text.matchAll(all)].some((m) => m[0] === '')) throw new Error(`ANCHOR MATCHES NOTHING ${label} — a RegExp anchor that can match the empty string marks no product line`);
    n = [...text.matchAll(all)].length;
  } else n = anchor === '' ? 0 : text.split(String(anchor)).length - 1;
  if (!n) throw new Error(`ANCHOR GONE ${label} — the control's anchor is not in the source (move it with the product line)`);
  if (count !== 'any' && n !== count) throw new Error(`ANCHOR NOT UNIQUE ${label} — ${n} times, the control expects ${count}`);
  if (all) return count === 1 ? text.replace(new RegExp(anchor.source, anchor.flags.replace(/[gy]/g, '')), to) : text.replace(all, to);
  const rep = typeof to === 'function' ? to : () => to;
  return count === 1 ? text.replace(String(anchor), rep) : text.replaceAll(String(anchor), rep);
}

/** A suite's synthetic conversation id: `e2e00000-0000-4000-8000-<12 hex>`.
 *  Nothing else may mint one — the walk and discovery both refuse this family
 *  wherever it lands, which is the only guard that still works when the
 *  fixture carries no cwd at all (a hand-written `assistant` record has none). */
export function fixtureSid(suffix) {
  if (!/^[0-9a-f]{1,12}$/.test(suffix)) throw new Error(`fixtureSid(): bad suffix ${JSON.stringify(suffix)}`);
  return FIXTURE_SID_PREFIX + suffix.padStart(12, '0');
}

const listen0 = () => new Promise((res, rej) => {
  const s = net.createServer(); s.unref(); s.once('error', rej);
  s.listen(0, '127.0.0.1', () => res(s));
});

/** N distinct free loopback ports. Every listener is held open until ALL are
 *  chosen (closing each before the next listen(0) may hand the same port back). */
export async function freePorts(n) {
  const servers = [];
  for (let i = 0; i < n; i++) servers.push(await listen0());
  const ports = servers.map((s) => s.address().port);
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

export async function freePort() { return (await freePorts(1))[0]; }

/** A DEAD loopback port: bound on 127.0.0.1:0, read, closed — a port the kernel just released and nothing on this
 *  box holds, so a connect is refused. Dead for the NEXT SECONDS only: use it at once, never write it down. NEVER a
 *  fixed "nobody listens on 19888" literal (2026-10-06, mirror-green-220: test-browser-ephemeral's fake answered
 *  `get cdp-url` with ws://127.0.0.1:19888 — another project's workbench listened there on the dev box and answered
 *  404, the product read "answered", the local heavy stayed green while the runner was red). test-architecture §81
 *  is the census: no suite names a literal loopback endpoint. */
export async function deadPort() { return (await freePorts(1))[0]; }
/** N distinct dead ports (all held until every one is chosen — see freePorts). */
export async function deadPorts(n) { return freePorts(n); }
/** `${scheme}://127.0.0.1:<deadPort>${rest}` — a URL nothing answers. */
export async function deadUrl(scheme = 'http', rest = '') { return `${scheme}://127.0.0.1:${await deadPort()}${rest}`; }

/** THE SINGLETON DESKTOP'S NAMES, PER RUN (2026-09-25 — the heavy RED on
 *  69720f2b). src/vnc.js's singleton Desktop claims the MACHINE-GLOBAL X display
 *  `:7` and RFB port 5901 unless VIBESPACE_VNC_DISPLAY / VIBESPACE_VNC_PORT name
 *  others, and it ADOPTS whatever already listens on its port (by design —
 *  KasmVNC, an app-only restart). This box has Xtigervnc on PATH since
 *  2026-09-21, so every scratch server that opened the Desktop started — or
 *  adopted — ONE Xtigervnc shared by every run on the box and by the owner's
 *  production instance, and `:7` sits in the band `-displayfd` hands out
 *  lowest-first to every desktop-app keeper's Xvfb (measured: picks 6 9 11 …
 *  around a live :7), so a suite's Xvfb could hold the display the singleton
 *  needs. Every suite that spawns server.js spreads this into the server env
 *  (test-architecture §57 is the census). The port comes from freePort(); the
 *  display from `freeDisplay` seeded by that port. */
export async function vncEnv() {
  const port = await freePort();
  return { VIBESPACE_VNC_DISPLAY: `:${freeDisplay(port)}`, VIBESPACE_VNC_PORT: String(port) };
}
/** THE GTK ROW (B-4260, lane ci-aidev-desktop-batch): what THIS box's desktop stack draws the suites' GNOME Calculator
 *  as — measured at provision INSIDE a private xpra (scripts/ci-provision-aidev.sh, its gtk-row step) into
 *  scripts/fixtures/gtk-rows.json, keyed by the GTK 4 major.minor: `calcSize2x` (the window at GDK_SCALE=2), `calcMin2x`
 *  (its minimum once settled — 720×1232 on the hub's 4.22, 694×980 on AIDev's 4.14, which first announces 694×1004),
 *  `calcButtonBound` (the minimum ignores Xft.dpi — 50 does, 46 does not), `pushButtonRole` ("button" from at-spi2-core
 *  2.60, "push button" before). A GTK with no row THROWS, naming the measurement: a pixel leg on a box nobody measured
 *  would judge nothing — never a skip. `version` / `rows` are seams. */
export function gtkRow({ version, rows } = {}) {
  if (version === undefined) { try { version = require('node:child_process').execFileSync('dpkg-query', ['-W', '-f=${Version}', 'libgtk-4-1'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/[+~].*$/, '').trim(); } catch { version = ''; } }
  if (rows === undefined) { try { rows = JSON.parse(fs.readFileSync(new URL('./fixtures/gtk-rows.json', import.meta.url), 'utf-8')).rows; } catch { rows = {}; } }
  const key = String(version || '').split('.').slice(0, 2).join('.');
  const row = rows && key && rows[key];
  if (!row) throw new Error(`no measured GTK row for GTK ${version || '(libgtk-4-1 not installed)'} on this box — run scripts/ci-provision-aidev.sh's gtk-row step here and add its row to scripts/fixtures/gtk-rows.json under "${key || '?'}"`);
  return { key, ...row };
}

/** Far above the lowest-first `-displayfd` band the keepers draw from, below
 *  the X TCP ceiling (6000 + n). */
export const VNC_DISPLAY_RANGE = Object.freeze({ lo: 1000, span: 20000 });
/** The first X display number at or after a seed-derived start whose lock file
 *  AND socket are both absent (a lock alone is left behind by a SIGKILLed
 *  server; a socket alone by a crashed one — either may still be claimed).
 *  `exists` is a parameter so the rule is testable without an X server. */
export function freeDisplay(seed, { exists = (p) => fs.existsSync(p) } = {}) {
  const { lo, span } = VNC_DISPLAY_RANGE;
  const s = Math.abs(Math.trunc(Number(seed) || 0));
  for (let i = 0; i < span; i++) {
    const n = lo + ((s + i) % span);
    if (!exists(`/tmp/.X${n}-lock`) && !exists(`/tmp/.X11-unix/X${n}`)) return n;
  }
  throw new Error(`freeDisplay(): no free X display in :${lo}..:${lo + span - 1}`);
}

/** EVERY PROCESS ROOTED IN A SCRATCH DIR — the teardown of a suite whose worktree
 *  server spawned sessions (2026-09-25, test-browser-resources: 140 live leftovers
 *  from 20 runs). A server's terminal/chat sessions run under dtach — DETACHED by
 *  design (production's must outlive a restart; systemd's KillMode=process is the
 *  same rule) — so killing the server ends none of them, and they run with the
 *  REAL HOME and cwd `/tmp`: the scratch root is only in their arguments
 *  (`dtach -c <root>/…/data/sockets/cw-…`, `node <root>/…/data/bin/pty-wrapper.js`).
 *  A suite that boots a server owns what that server started: this lists every
 *  process whose cwd, HOME, daemon root (DAEMON_ROOT_ENV — B-442c: the server's
 *  device daemon is title-rewritten, so neither its argv nor `pkill -f <root>` names
 *  the root) or any argv token (its start, or after `=`) lies in `root` — never
 *  this process or its ancestors — and signals each (SIGKILL by default;
 *  synchronous, so it runs inside an 'exit' handler). Returns the pids. The gate's
 *  reaper (scripts/ci.mjs argvScratchRoots) is the net for a suite that never got
 *  here; test-architecture §57b names a server-booting suite that never calls this. */
export function endRootedProcesses(root, { signal = 'SIGKILL', procRoot = '/proc', self = process.pid } = {}) {
  const r = path.resolve(String(root || ''));
  if (!r || r === '/' || !r.startsWith('/tmp/')) throw new Error(`endRootedProcesses(): refusing root ${JSON.stringify(root)} (a /tmp scratch dir only)`);
  const under = (x) => { const v = String(x || ''); return v === r || v.startsWith(r + '/'); };
  const skip = new Set();
  for (let q = self; q > 1 && !skip.has(q);) {
    skip.add(q);
    try { const st = fs.readFileSync(`${procRoot}/${q}/stat`, 'latin1'); q = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { break; }
  }
  const hit = [];
  let pids = []; try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return hit; }
  for (const pid of pids) {
    if (skip.has(pid)) continue;
    let rooted = false;
    try { rooted = under(fs.readlinkSync(`${procRoot}/${pid}/cwd`)); } catch { }
    if (!rooted) try { rooted = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split(/[\0\s]+/).some((t) => under(t) || t.split('=').slice(1).some((v) => under(v))); } catch { }
    if (!rooted) try { const env = fs.readFileSync(`${procRoot}/${pid}/environ`, 'utf8').split('\0'); rooted = ['HOME', ...DAEMON_ROOT_ENV].some((k) => under((env.find((kv) => kv.startsWith(k + '=')) || '').slice(k.length + 1))); } catch { }
    if (!rooted) continue;
    try { process.kill(pid, signal); hit.push(pid); } catch { }
  }
  return hit;
}

/** The env names a vibespace-device daemon takes its root from (src/agentd/agentd.js ROOT: VIBESPACE_DEVICE_ROOT, else
 *  VIBESPACE_AGENTD_ROOT, else ~/.vibespace/agentd under HOME) — both kept by agent-env.js daemonEnv across a re-exec. */
export const DAEMON_ROOT_ENV = Object.freeze(['VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT']);
/** A daemon's argv (the bundle it runs) and its comm (vibespace-device, cut to 15 bytes by the kernel) — exported so a suite that
 *  ends a daemon by its own pid judges it by THIS rule, never a copy (B-b403 cure 3). */
export const DAEMON_ARGV = /(?:^|\/)(?:vibespace-)?agentd\.js$/;
export const DAEMON_COMM = 'vibespace-devic';
/** B-442c (2026-10-02, the 16:23 OOM): END THE DAEMON(S) OF ONE DAEMON ROOT, MID-RUN — and nothing else its server started
 *  (a suite restarting its server over a fresh daemon keeps its dtach sessions). A daemon = a process whose
 *  VIBESPACE_DEVICE_ROOT / VIBESPACE_AGENTD_ROOT lies in `root` AND that is one (comm `vibespace-devic…`, or an argv
 *  naming an agentd bundle: a re-exec child before it renames itself), plus the pid `<root>/state/agentd.pid` names.
 *  The pid file ALONE is what test-restore-liveness trusted: a self-upgrade spawns the NEW daemon before it writes
 *  its pid, so a kill in that window ended the old pid, the suite then deleted the root, and the orphan — its
 *  bundle gone — grew to 45.7 GB. Two passes, `settleMs` apart: a re-exec forked between the scan and the kill is
 *  caught by the second. Synchronous (an 'exit' handler may call it); returns the pids signalled. */
export function endDaemonsOf(root, { signal = 'SIGKILL', procRoot = '/proc', passes = 2, settleMs = 150 } = {}) {
  const r = path.resolve(String(root || ''));
  if (!r || r === '/' || !r.startsWith('/tmp/')) throw new Error(`endDaemonsOf(): refusing root ${JSON.stringify(root)} (a /tmp scratch dir only)`);
  const under = (x) => { const v = String(x || ''); return v === r || v.startsWith(r + '/'); };
  const hit = new Set();
  const end = (pid) => { if (pid > 0 && pid !== process.pid && !hit.has(pid)) try { process.kill(pid, signal); hit.add(pid); } catch { } };
  try { end(Number(fs.readFileSync(path.join(r, 'state', 'agentd.pid'), 'utf8').trim())); } catch { }
  for (let k = 0; k < passes; k++) {
    if (k) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, settleMs);
    let pids = []; try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return [...hit]; }
    for (const pid of pids) {
      let env; try { env = fs.readFileSync(`${procRoot}/${pid}/environ`, 'utf8').split('\0'); } catch { continue; }
      if (!DAEMON_ROOT_ENV.some((n) => under((env.find((kv) => kv.startsWith(n + '=')) || '').slice(n.length + 1)))) continue;
      let comm = '', argv = []; try { comm = fs.readFileSync(`${procRoot}/${pid}/comm`, 'utf8').trim(); } catch { }
      try { argv = fs.readFileSync(`${procRoot}/${pid}/cmdline`, 'utf8').split('\0'); } catch { }
      if (comm.startsWith(DAEMON_COMM) || argv.some((a) => DAEMON_ARGV.test(a))) end(pid);
    }
  }
  return [...hit];
}

/** mirror-green-217 (the 2.369.217 Actions red, ENOTEMPTY rmdir of agentd/state): END a daemon root's daemon(s) AND WAIT
 *  until each is gone — only then may the caller delete the root. The daemon's SIGTERM handler appends "SIGTERM — exiting"
 *  to <root>/state/agentd.log, so an rmSync racing that exit re-creates the file between rimraf's unlink and its rmdir.
 *  Gone = no /proc entry, or a zombie (state Z: every fd closed — a daemon this process spawned stays one while this
 *  synchronous wait holds the loop that would reap it). Bounded: SIGKILL at `timeoutMs`, then the same wait. Synchronous
 *  (an 'exit' handler may call it); returns { pids, gone, killed }. */
export function endDaemonsAndWait(root, { signal = 'SIGTERM', timeoutMs = 5000, pollMs = 10, procRoot = '/proc' } = {}) {
  const goneOne = (pid) => { try { return fs.readFileSync(`${procRoot}/${pid}/stat`, 'utf8').replace(/^.*\) /s, '')[0] === 'Z'; } catch { return true; } };
  const waitGone = (pids) => {
    const until = Date.now() + timeoutMs;
    while (!pids.every(goneOne) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
    return pids.every(goneOne);
  };
  const pids = endDaemonsOf(root, { signal, procRoot });
  let killed = false;
  if (!waitGone(pids)) { killed = true; for (const pid of pids) try { process.kill(pid, 'SIGKILL'); } catch { } }
  return { pids, gone: waitGone(pids), killed };
}

/** The ambient vendor credentials a REAL agent CLI would bill against instead
 *  of the login the leg means to use (B-5f0b, the 2.369.69 lesson): a fake
 *  CODEX_HOME / HOME removes the LOGIN, never an env key — a leaked
 *  OPENAI_API_KEY / CODEX_API_KEY lets a real `codex app-server`'s own idle
 *  drain run a billed turn, and ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
 *  outrank the oat/subscription a claude leg seeds. */
export const VENDOR_KEY_ENV = Object.freeze(['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']);

/** A copy of `env` without VENDOR_KEY_ENV — every spawn of a REAL claude /
 *  codex / opencode in a suite goes through this (test-architecture §50). */
export function withoutVendorKeys(env = process.env) {
  const out = { ...env };
  for (const k of VENDOR_KEY_ENV) delete out[k];
  return out;
}

/** STOP A WRAPPER, THEN REMOVE ITS SCRATCH DIR — in that order (2.369.172 r1,
 *  the Actions mirror's red on test-codex-p2-client: `ENOTEMPTY: directory not
 *  empty, rmdir /tmp/vs-cxfork-…`). Since 2.369.172 every wrapper answers
 *  SIGTERM/SIGHUP/SIGINT with a synchronous record — the meta first, then the
 *  buffer, then a log line (`appendFileSync` CREATES chat-wrapper.log /
 *  codex-chat-wrapper.log when it is absent) — so a suite that kills the wrapper
 *  and calls `rmSync(dir)` in the same tick races that append: on the 2-vCPU
 *  runner the log file landed between rmSync's listing and its rmdir. Four fast
 *  suites had exactly that shape (no exit wait at all); this is the ONE idiom.
 *  Waits for the child's exit (SIGKILL after `graceMs`), then removes the dir
 *  with retries. Safe on a child that already exited. */
export async function stopWrapper(child, { dir = null, graceMs = 3000 } = {}) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    try { child.kill('SIGTERM'); } catch { }
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, graceMs);
    await exited;
    clearTimeout(t);
  }
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
}

/** THE HOSTED RUNNER'S FACE (ci358-reds — the 2.369.358 mirror red on test-chat-scroll and test-artifacts-handover-ui, both
 *  green here; desktop-small's .358 hotfix measured the same): the Actions runner's sans-serif is DejaVu Sans, this box's is
 *  not, and a layout a face can tip (a paragraph's wrap, a chip's width) went red there only. A chrome suite whose legs
 *  measure such a layout runs as FONT LEGS: `dejavu` — its Chrome under a scratch fontconfig naming only the dirs the runner
 *  has (DejaVu, Liberation, Noto CJK, the colour emoji face; the system conf.d still applies) — then `box`, the box's own
 *  face, never run where that IS DejaVu Sans (the runner). `--font dejavu|box` runs one leg; without it the suite runs each
 *  leg as a child (runFontLegs) and fails if one does. A box without the DejaVu dir runs `box` alone and says so. */
export const RUNNER_FONT_DIRS = Object.freeze(['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/liberation', '/usr/share/fonts/opentype/noto']);
const EMOJI_FACE = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'; // linked alone: its dir also holds Noto Sans, which would be the sans-serif
/** The face this box's fontconfig answers for sans-serif ('' when fc-match is missing). */
export function boxSans() { try { return execFileSync('fc-match', ['-f', '%{family}', 'sans-serif'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch { return ''; } }
/** The legs this box runs: ['dejavu', 'box'] | ['dejavu'] (the box IS DejaVu) | ['box'] (no DejaVu dir). */
export function fontLegs() {
  if (!fs.existsSync(path.join(RUNNER_FONT_DIRS[0], 'DejaVuSans.ttf'))) return ['box'];
  return /^DejaVu Sans(,|$)/.test(boxSans()) ? ['dejavu'] : ['dejavu', 'box'];
}
/** The `dejavu` leg's Chrome env: { FONTCONFIG_FILE } of a fontconfig written under `dir` (the suite removes `dir`). */
export function runnerFontEnv(dir) {
  const emoji = path.join(dir, 'emoji');
  fs.mkdirSync(emoji, { recursive: true });
  if (fs.existsSync(EMOJI_FACE)) { try { fs.symlinkSync(EMOJI_FACE, path.join(emoji, path.basename(EMOJI_FACE))); } catch { } }
  const file = path.join(dir, 'fonts.conf');
  fs.writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${[...RUNNER_FONT_DIRS, emoji].map((d) => `  <dir>${d}</dir>\n`).join('')}  <cachedir>${path.join(dir, 'cache')}</cachedir>\n  <include ignore_missing="yes">/etc/fonts/conf.d</include>\n</fontconfig>\n`);
  return { FONTCONFIG_FILE: file };
}
/** Run `script` once per font leg (`--font <leg>` appended), output inherited; the exit code is the first failing leg's. */
export function runFontLegs(script, argv = process.argv.slice(2)) {
  let code = 0;
  for (const leg of fontLegs()) {
    console.log(`── font leg ${leg}${leg === 'dejavu' ? " (the hosted runner's sans-serif, a scratch fontconfig)" : ` (this box's own: ${boxSans() || '?'})`} ──`);
    const r = spawnSync(process.execPath, [script, ...argv, '--font', leg], { stdio: 'inherit', env: process.env });
    if (r.status !== 0 && !code) code = r.status || 1;
  }
  return code;
}
/** The face Chrome drew `selector`'s text in (CSS.getPlatformFontsForNode — the most glyphs), or null; `cdp(method, params)`.
 *  The LAST match first: an element content-visibility skips has drawn nothing (an empty font list). */
export async function drawnFace(cdp, selector) {
  try {
    await cdp('DOM.enable'); await cdp('CSS.enable');
    const { root } = await cdp('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    for (const nodeId of [...(nodeIds || [])].reverse().slice(0, 20)) {
      const { fonts } = await cdp('CSS.getPlatformFontsForNode', { nodeId });
      const top = [...(fonts || [])].sort((a, b) => b.glyphCount - a.glyphCount)[0];
      if (top?.familyName) return top.familyName;
    }
    return null;
  } catch { return null; }
}
