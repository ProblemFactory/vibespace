#!/usr/bin/env node
/**
 * ssh → ws graduation exists since 2.248.0 but was button-only, so machines
 * stayed on ssh forever. These pin the AUTOMATIC path's guards — every one of
 * them is a way to do something the operator did not ask for.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { HostManager } = require('../src/hosts.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const srv = readFileSync(new URL('../src/server/mounts-plugins-wiring.js', import.meta.url), 'utf-8')
  + readFileSync(new URL('../server.js', import.meta.url), 'utf-8');
const block = srv.slice(srv.indexOf('hosts.onSshConnected ='), srv.indexOf('const discDirtyTimers'));
ok(block.length > 200, 'auto-graduate handler exists');
ok(verdictOf(/serverSetting\('agentd\.autoGraduate'\) === false/.test(block)), 'honours the off switch');
ok(verdictOf(/h\.transport === 'dial' \|\| h\.deviceId/.test(block)), 'skips machines already on ws');
ok(verdictOf(/h\.autoGraduate === false/.test(block)), 'honours a per-machine opt-out');
// The guard asks instance-url for THE OPERATOR'S ADDRESS (B-f55a): operatorUrl() is the effective address only when its source is an
// explicit Publish, the setting or the env — never the hub's own https address nor an automatic relay publish (frp-auto); its
// behaviour per source is test-instance-url §2b. The dial takes that same judged address (serverUrl), never url()'s fallback.
// (The old `agentdDeps.publicUrl` binding was a ghost since the split, which is why this suite sat red and excluded.) RED CONTROL:
// the same pin over the block with the guard cut out must fail, so the leg is not true of any block.
const URL_GUARD = /if \(!instanceUrl\.operatorUrl\(\)\) return;/;
const DIAL_JUDGED = /const base = instanceUrl\.operatorUrl\(\); if \(!base\) return; const out = await graduateHostToDial\(hosts\.get\(hostId\), \{ by: 'system:graduate', serverUrl: base \}\);/;
const urlRule = (b) => URL_GUARD.test(b) && DIAL_JUDGED.test(b) && !/viaRelay: true/.test(b);
ok(verdictOf(urlRule(block)), 'the handler\'s URL guard returns unless the OPERATOR declared an address (instanceUrl.operatorUrl()), the dial takes that same address as serverUrl, and the handler carries no `viaRelay: true`');
const cutBlock = block.replace(URL_GUARD, '');
ok(cutBlock !== block && !urlRule(cutBlock), 'RED CONTROL (a source pin\'s): the handler with its URL guard cut out fails that leg — the pin names that guard, nothing wider');
const oldDial = block.replace(DIAL_JUDGED, "const out = await graduateHostToDial(hosts.get(hostId), { by: 'system:graduate' });");   // stale-pins: kept (the RED control plants the old dial)
ok(oldDial !== block && !urlRule(oldDial), 'RED CONTROL: a dial that passes no serverUrl (graduateHostToDial then takes url(), which may be an automatic relay address) fails it');
ok(!urlRule(block + '\n{ viaRelay: true }'), 'RED CONTROL: a handler that self-publishes to the relay fails it too');
ok(verdictOf(/6 \* 60 \* 60 \* 1000/.test(block)), 'at most one attempt per machine per 6h');
ok(verdictOf(/catch \(e\)[\s\S]{0,200}serverNotice/.test(block)), 'a failed attempt is reported, never silent');

// the extracted function must keep the invariants the button path had
const fn = srv.slice(srv.indexOf('async function graduateHostToDial'), srv.indexOf('app.post(\'/api/hosts/:id/graduate-dial\''));
ok(verdictOf(/http_code[\s\S]{0,400}graduation aborted \(staying on ssh\)/.test(fn)), 'machine is asked whether it can reach us BEFORE installing');
ok(gateOf(/const attempt = hosts\.beginGraduation\(h\.id, \{ dialRoot: root \}\);[\s\S]{0,200}const rollBack = \(\) => \{ attempt\.rollBack\(\);/.test(fn)) && verdictOf(/if \(!inst\.ok\) \{ rollBack\(\); throw new Error\('installer failed/.test(fn)), 'a failed installer rolls the record back (an upgrade this press made; lane lg-remote-hardening, unit 3\'s cure)');
ok(verdictOf(fn.includes("require('../hosts.js').dialRootOf(base)")), 'dialRoot mirrors the installer derivation (B-2ca0 follow-up: ONE derivation, src/hosts.js dialRootOf — test-ssh-config-block ⑧ drives it against the installer\'s own sed / tr, an IPv6 base included)');

// ssh must remain reachable as the rescue channel
const hostsSrc = readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf-8');
ok(verdictOf(/onSshConnected\?\.\(id\)/.test(hostsSrc)), 'the ssh connect path fires the hook');
const dc = hostsSrc.slice(hostsSrc.indexOf('async _deviceConnect(id)'), hostsSrc.indexOf('/** M2 remote install'));
ok(verdictOf(/dialOnline\?\.\(h\.deviceId\)[\s\S]{0,400}catch \{ \/\* ssh fallback below \*\//.test(dc)), 'a dead ws link still falls back to ssh');

// a throwing consumer must not break connects
const h = new HostManager({ dataDir: scratch('grad') });
h.onSshConnected = () => { throw new Error('boom'); };
let threw = false;
try { h.onSshConnected?.('x'); } catch { threw = true; }
ok(verdictOf(threw), '(sanity) the hook itself can throw…');
ok(verdictOf(/try \{ this\.onSshConnected\?\.\(id\); \} catch \{ \}/.test(hostsSrc)), '…and the connect path swallows it');

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
