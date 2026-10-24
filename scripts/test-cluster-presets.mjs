#!/usr/bin/env node
// COMPANY PRESETS FROM A WATCHED DIRECTORY (lane cluster-presets, B-53fe —
// the owner: "这种环境问题怎么总是出现 以后能避免吗 每次下发环境变量都要给人家重启").
// Fast tier, in-process, no server.
//
// §1 PURE src/preset-layers.js — the two parsers ARE the env readers' rules;
//    the merge is PER KEY (cluster < release override; a key the release does
//    not name keeps the company's entry); both layers absent = null (the env
//    fallback), a present `[]` is an answer; the three-rung chain with the
//    registry's own precedence (the user's key > release > cluster); the diff
//    names keys, never values; the line's words (none / cluster / release /
//    env, errors kept or not). CONTROLS (patched copies, scratch dir): a
//    whole-file override hides the company's other clients; a merge that
//    reads the layers in the wrong order lets the cluster win.
// §2 ORCH src/server/cluster-presets.js over a scratch directory written in
//    the kubelet's AtomicWriter shape (a timestamped dir + an atomic `..data`
//    rename, top-level symlinks into it): the boot read, a swap seen ONCE with
//    ONE journal line naming keys (the secret absent from every line), a swap
//    that changes nothing fires nothing, a malformed / too-large file keeps
//    the previous presets with ONE line per transition and never throws, a
//    removed key falls back to the env (null), a plain directory's in-place
//    override edit is caught by the poll, the directory rules (explicit / ''
//    off / the default only for the server's own instance). CONTROL: a copy
//    whose failure path drops the previous presets.
// §3 THE LAYER TABLE (verify r1, T1): sources × states × keys ⇒ the effective
//    preset per key + the words + what was logged (never a value), every cell
//    a fresh directory; the env cells and "the user's own key wins" at the two
//    CONSUMERS; a future key said by name; a ..data swap mid-read never torn;
//    the watch dying ⇒ the poll; a swap storm coalesced. Five more controls.
// §4 THE LAYER MOVES, THE VALUES DO NOT (B-8145): a release migrated with
//    override blocks EQUAL to the cluster's loses them on upgrade ⇒ every key
//    now comes from the cluster with identical values: the snapshot follows,
//    the REAL wiring's summary (/api/integrations presets.groups) and its
//    cluster-presets-updated broadcast say "from the cluster", no journal
//    line (nothing rotated), no card re-derive; back again when an equal
//    override returns; a later cluster rotation then reaches the user (with the
//    override still projected it is shadowed — the field symptom). CONTROL:
//    a copy that compares the values only leaves the summary on "release".
// §5 THE FLEET FACTS — fleet.json (lane oauth-relay-one-source, 2026-10-23 — the owner: «你为啥搞了两套分发 auth client
//    的方案»: the Google client rows were presets files, live; the relay page a chart env, at restart): PURE parseFleet /
//    mergeFleet (per FIELD: the release's field wins, '' included; a field neither names is absent) / diffFleet /
//    fleetWords; ORCH over the kubelet's shape: the boot read + its line, a swap seen ONCE with «relay page changed (now
//    …)», the override wins, a same-content swap fires nothing, a malformed or non-object file keeps the previous facts
//    (one line), a relayUrl that is no relay page address said ONCE (never the value), the file withdrawn ⇒ null (the
//    env fallback), fleet.json no longer a stray. CONTROL: a merge reading the layers in the wrong order lets the
//    cluster win.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return Date.now() - t0; await sleep(15); } return -1; };

const PL = require(path.join(REPO, 'src/preset-layers.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));
const CP = require(path.join(REPO, 'src/server/cluster-presets.js'));
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
const M = mutantCopies('cpr', REPO);

const SECRET_A = 'GOC' + 'SPX-cluster-secret-AAAAAAAAAAAAAAAAAAAA';
const SECRET_B = 'GOC' + 'SPX-rotated-secret-BBBBBBBBBBBBBBBBBBBB';
const SECRET_U = 'GOC' + 'SPX-release-override-UUUUUUUUUUUUUUUUU';
const LARK_S = 'lark-app-secret-LLLLLLLLLLLLLLLLLLLLLLLL';
const g = (key, secret, label) => ({ key, label: label || key, clientId: `${key}.apps.googleusercontent.com`, clientSecret: secret });

// ═══ §1 PURE ════════════════════════════════════════════════════════════
console.log('§1 PURE preset-layers');
{
  // the env readers' rules, verbatim
  const ints = PL.parseIntegrations([{ id: 'lark', values: { appId: 'cli_1', appSecret: 7 } }, { id: 'cloak', key: 'k1', label: 'L', values: { licenseKey: 'cb_x' } }, { values: {} }, { id: 'x' }, null]);
  ok(ints.length === 2 && ints[0].key === 'default' && ints[0].label === null && ints[0].values.appSecret === '7' && ints[1].key === 'k1' && ints[1].label === 'L', 'parseIntegrations: a missing key is default, values stringified, an entry without id / values skipped');
  const drv = PL.parseDriveClients([g('org1', 'x'), { key: 'k', clientId: 'c' }, { key: 'n', clientId: 'c', clientSecret: 's' }]);
  ok(drv.length === 2 && drv[1].label === 'n', 'parseDriveClients: an entry missing key / clientId / clientSecret skipped, the label defaults to the key');
  let threw = 0; for (const bad of [{}, 'abc', 3, null]) { try { PL.parseIntegrations(bad); } catch { threw++; } try { PL.parseDriveClients(bad); } catch { threw++; } }
  ok(threw === 8, 'both parsers THROW on a top level that is not an array (the reader turns it into a named error, never a silent [])');

  // the merge, per key
  const cl = [g('org1', SECRET_A, 'Org'), g('org2', SECRET_A), g('channels', SECRET_A)];
  const rel = [g('org2', SECRET_U, 'Mine'), g('extra', SECRET_U)];
  const m = PL.mergeLayers('gdrive', { cluster: cl, release: rel });
  ok(m.entries.map((e) => e.key).join() === 'org1,org2,channels,extra', `per key: the release REPLACES org2 in place, ADDS extra, KEEPS the company's org1 + channels (${m.entries.map((e) => e.key).join()})`);
  ok(m.entries[1].clientSecret === SECRET_U && m.layerOf.org2 === 'release' && m.layerOf.org1 === 'cluster' && m.layerOf.extra === 'release', 'the replaced entry is the release\'s, and layerOf names where each came from');
  ok(PL.mergeLayers('gdrive', {}) === null && PL.mergeLayers('gdrive', { cluster: null, release: null }) === null, 'both layers absent ⇒ null — the directory says nothing, the caller falls back to the env');
  const empty = PL.mergeLayers('gdrive', { cluster: [] });
  ok(empty && empty.entries.length === 0, 'a PRESENT [] is an answer (no presets), never the env fallback');
  ok(PL.mergeLayers('gdrive', { release: rel }).entries.length === 2, 'a release layer alone (no cluster Secret yet) still serves');
  const dup = PL.mergeLayers('gdrive', { cluster: [g('a', '1'), g('a', '2')] });
  ok(dup.entries.length === 1 && dup.entries[0].clientSecret === '1', 'within one layer the FIRST entry of a key wins (what find() over the env list always answered)');
  const im = PL.mergeLayers('integrations', { cluster: PL.parseIntegrations([{ id: 'lark', values: { appId: 'a', appSecret: 'x' } }, { id: 'cloak', values: { licenseKey: 'cb_1' } }]), release: PL.parseIntegrations([{ id: 'lark', values: { appId: 'b', appSecret: 'y' } }]) });
  ok(im.entries.length === 2 && im.entries[0].values.appId === 'b' && im.entries[1].id === 'cloak', 'integrations: the identity is row id + preset key — the release\'s lark/default replaces the cluster\'s, cloak/default (same key, another row) stays');
  let threwKind = false; try { PL.mergeLayers('nope', {}); } catch { threwKind = true; }
  ok(threwKind, 'an unknown kind throws (never a silent null)');

  // the three-rung chain with the registry's OWN precedence: user > release > cluster
  const lark = R.rowById('lark');
  const chain = (own, layers) => { const mm = PL.mergeLayers('integrations', layers); const pick = R.pickPreset(mm ? mm.entries.filter((e) => e.id === 'lark').map((e) => ({ key: e.key, label: e.label, values: e.values })) : [], { savedKey: null, prefer: null }); return R.resolvePrecedence(own, pick.preset, {}); };
  const L1 = PL.parseIntegrations([{ id: 'lark', values: { appId: 'cluster', appSecret: 's' } }]);
  const L2 = PL.parseIntegrations([{ id: 'lark', values: { appId: 'release', appSecret: 's' } }]);
  ok(chain({}, { cluster: L1 }).values.appId === 'cluster', 'chain: the cluster alone serves');
  ok(chain({}, { cluster: L1, release: L2 }).values.appId === 'release', 'chain: the release override outranks the cluster');
  ok(chain({ appId: 'mine', appSecret: 'm' }, { cluster: L1, release: L2 }).source === 'user' && chain({ appId: 'mine', appSecret: 'm' }, { cluster: L1, release: L2 }).values.appId === 'mine', 'chain: the user\'s own key outranks both (resolvePrecedence, unchanged)');
  ok(!!lark && lark.bindsPerAccount === true, '(the lark row binds per account — its chain is the account dialog\'s presets; the precedence rule is the same table)');

  // the diff: keys, never values
  const d = PL.diffEntries('gdrive', [g('org1', SECRET_A), g('gone', SECRET_A), g('lbl', SECRET_A, 'Old')], [g('org1', SECRET_B), g('new', SECRET_B), g('lbl', SECRET_A, 'New')]);
  ok(d.added.join() === 'new' && d.removed.join() === 'gone' && d.rotated.join() === 'org1' && d.relabeled.join() === 'lbl', `diffEntries: added / removed / rotated / relabeled by key (${JSON.stringify(d)})`);
  const words = PL.diffWords('gdrive', d) + PL.diffWords('integrations', PL.diffEntries('integrations', PL.parseIntegrations([{ id: 'lark', key: 'j', values: { appSecret: LARK_S } }]), PL.parseIntegrations([{ id: 'lark', key: 'j', values: { appSecret: LARK_S + 'x' } }])));
  ok(!words.includes(SECRET_A) && !words.includes(SECRET_B) && !words.includes(LARK_S) && /rotated org1/.test(words) && /rotated lark\/j/.test(words), `the journal words carry keys and never a value: "${words}"`);
  ok(PL.diffEmpty(PL.diffEntries('gdrive', [g('a', '1')], [g('a', '1')])) && PL.diffWords('gdrive', PL.diffEntries('gdrive', [], [])) === '', 'equal lists diff to nothing, and say nothing');

  // the line (P3)
  const t = (s, p) => String(s).replace(/\{(\w+)\}/g, (m0, k) => (p && p[k] !== undefined ? String(p[k]) : m0));
  const ago = (ms) => `${Math.round(ms / 60000)} min ago`;
  const none = PL.presetsLine(PL.summarize({}), { t, ago });
  ok(none.none && none.text === 'Company presets: none — ask your admin.', `no presets ⇒ "${none.text}"`);
  const sum = PL.summarize({ dir: '/etc/vibespace/presets', updatedAt: 1000, items: [{ kind: 'gdrive', source: 'cluster', n: 3 }, { kind: 'lark', source: 'cluster', n: 1 }, { kind: 'gdrive', source: 'release', n: 1 }, { kind: 'cloak', source: 'env', n: 1 }, { kind: 'lark', source: 'release', n: 0 }] });
  const line = PL.presetsLine(sum, { t, ago, now: 1000 + 120000 });
  ok(line.text === 'Company presets: 3 Google clients, 1 Lark app — from the cluster, updated 2 min ago; 1 Google client — from this release’s own values, updated 2 min ago; CloakBrowser key — from the environment (a restart is needed to change them)', `the brief's sentence, per source: "${line.text}"`);
  ok(sum.groups.map((x) => x.source).join() === 'cluster,release,env' && !sum.groups.some((x) => x.items.some((i) => i.n === 0)), 'summarize keeps the source order and drops zero counts');
  const errs = PL.presetsLine(PL.summarize({ items: [{ kind: 'gdrive', source: 'cluster', n: 1 }], errors: [{ layer: 'release', file: 'integrations.json', code: 'unparseable', kept: true }, { layer: 'cluster', file: 'gdrive-clients.json', code: 'too-large', kept: false }] }), { t });
  ok(errs.errors.length === 2 && /override\/integrations\.json.*previous presets are kept/.test(errs.errors[0]) && /gdrive-clients\.json.*no presets until it is fixed/.test(errs.errors[1]), 'an unreadable file is SAID — kept (it had presets) or offering none (it never read)');
  ok(PL.itemWords({ kind: 'cloud:browserbase', n: 2 }, { t }) === `2 ${R.rowById('cloud:browserbase').label} keys`, 'a browser key row is worded by its registry label');

  // CONTROLS: the per-key merge is the property — a whole-file override and a wrong layer order are both red
  const src = fs.readFileSync(path.join(REPO, 'src/preset-layers.js'), 'utf-8');
  const wholeFile = M.load('src/preset-layers.js', src.replace("  const present = LAYERS.filter((l) => Array.isArray(layers[l]));", "  if (Array.isArray(layers.release)) layers = { release: layers.release };\n  const present = LAYERS.filter((l) => Array.isArray(layers[l]));"), 'wholefile');
  const wf = wholeFile.mergeLayers('gdrive', { cluster: cl, release: rel });
  ok(wf.entries.map((e) => e.key).join() !== 'org1,org2,channels,extra' && !wf.entries.some((e) => e.key === 'org1'), 'CONTROL: a whole-file override (the release file replaces the cluster file) HIDES the company\'s org1 + channels — the per-key assert above is red on it');
  const wrongOrder = M.load('src/preset-layers.js', src.replace("const LAYERS = Object.freeze(['cluster', 'release']);", "const LAYERS = Object.freeze(['release', 'cluster']);"), 'order');
  ok(wrongOrder.mergeLayers('gdrive', { cluster: cl, release: rel }).entries.find((e) => e.key === 'org2').clientSecret === SECRET_A, 'CONTROL: the layers read in the wrong order let the CLUSTER win org2 — the override assert above is red on it');
}

// ═══ §2 ORCH the reader ═════════════════════════════════════════════════
console.log('§2 ORCH cluster-presets reader');
let seq = 0;
/** The kubelet's AtomicWriter: a fresh timestamped dir, `..data_tmp` → rename over `..data`, top-level symlinks into `..data` created once, the old dir removed. */
function project(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  const ts = `..2026_10_01_22_${String(++seq).padStart(2, '0')}_00.${process.pid}${seq}`;
  fs.mkdirSync(path.join(dir, ts, 'override'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, ts, rel), typeof body === 'string' ? body : JSON.stringify(body));
  let old = null; try { old = fs.readlinkSync(path.join(dir, '..data')); } catch {}
  try { fs.unlinkSync(path.join(dir, '..data_tmp')); } catch {}
  fs.symlinkSync(ts, path.join(dir, '..data_tmp'));
  fs.renameSync(path.join(dir, '..data_tmp'), path.join(dir, '..data'));
  // the kubelet links EVERY projected path's first component at the top level (a file it never read is still there to be seen)
  for (const top of new Set(['integrations.json', 'gdrive-clients.json', 'override', ...Object.keys(files).map((f) => f.split('/')[0])])) { try { fs.lstatSync(path.join(dir, top)); } catch { fs.symlinkSync(`..data/${top}`, path.join(dir, top)); } }
  if (old) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
}
function capture() { const lines = []; return { lines, log: { log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push('E ' + a.join(' ')), warn: (...a) => lines.push('W ' + a.join(' ')) } }; }
{
  const dir = path.join(ROOT, 'presets');
  project(dir, { 'gdrive-clients.json': [g('org1', SECRET_A, 'Org'), g('channels', SECRET_A)], 'integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }] });
  const cap = capture();
  const r = CP.create({ dir, log: cap.log, debounceMs: 30, pollMs: 250 });
  ok(r.entries('gdrive').map((e) => e.key).join() === 'org1,channels' && r.entries('integrations')[0].key === 'jarvis', 'boot read (sync): the cluster files through the symlinks into ..data');
  ok(cap.lines.length === 1 && /integrations 1, Google clients 2/.test(cap.lines[0]) && !cap.lines.join().includes(SECRET_A), `boot says what it found, value-free: ${cap.lines[0]}`);
  const copy = r.entries('gdrive'); copy[0].clientSecret = 'mutated';
  ok(r.entries('gdrive')[0].clientSecret === SECRET_A, 'entries() hands out copies — a consumer cannot mutate the snapshot');
  const changes = []; r.onChange((c) => changes.push(c));
  await r.start();

  // a rotation + an override, by an atomic ..data swap
  cap.lines.length = 0;
  project(dir, { 'gdrive-clients.json': [g('org1', SECRET_B, 'Org'), g('channels', SECRET_A), g('org2', SECRET_A)], 'integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }], 'override/gdrive-clients.json': [g('channels', SECRET_U, 'Mine')] });
  const ms = await until(() => changes.length >= 1, 3000);
  ok(ms >= 0 && changes.length === 1, `the swap is seen ONCE (${ms} ms after the rename; the watch, not the 250 ms poll, carries it when < 250)`);
  ok(r.entries('gdrive').find((e) => e.key === 'org1').clientSecret === SECRET_B && r.entries('gdrive').find((e) => e.key === 'channels').clientSecret === SECRET_U && r.entries('gdrive').length === 3, 'the snapshot follows: org1 rotated, channels from the release override, org2 added');
  const changed = cap.lines.filter((l) => /\[presets\] changed/.test(l));
  ok(changed.length === 1 && /added org2/.test(changed[0]) && /rotated org1, channels/.test(changed[0]) && !cap.lines.join('\n').includes(SECRET_A) && !cap.lines.join('\n').includes(SECRET_B) && !cap.lines.join('\n').includes(SECRET_U), `ONE journal line naming what changed, never a secret: ${changed[0]}`);
  ok(changes[0].kinds.join() === 'gdrive', 'the change names its kinds (integrations did not move)');
  const st = r.status();
  ok(st.items.some((i) => i.kind === 'gdrive' && i.source === 'release' && i.n === 1) && st.items.some((i) => i.kind === 'gdrive' && i.source === 'cluster' && i.n === 2) && Number.isInteger(st.updatedAt), `status(): counted by layer, updatedAt = the files' mtime (${JSON.stringify(st.items)})`);

  // a swap that changes nothing fires nothing
  const before = changes.length;
  project(dir, { 'gdrive-clients.json': [g('org1', SECRET_B, 'Org'), g('channels', SECRET_A), g('org2', SECRET_A)], 'integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }], 'override/gdrive-clients.json': [g('channels', SECRET_U, 'Mine')] });
  await sleep(600);
  ok(changes.length === before, 'a swap with the same content fires no listener and no line');

  // a malformed file keeps the previous presets, ONE line per transition, never a throw
  cap.lines.length = 0;
  const leak = `[{"key":"org1","clientId":"c","clientSecret":"${SECRET_B}"},]`;
  project(dir, { 'gdrive-clients.json': leak, 'integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }], 'override/gdrive-clients.json': [g('channels', SECRET_U, 'Mine')] });
  await until(() => cap.lines.some((l) => /could not be read/.test(l)), 3000);
  ok(r.entries('gdrive').length === 3 && r.entries('gdrive').find((e) => e.key === 'org2'), 'a malformed cluster file: the PREVIOUS presets stay in effect');
  const errLines = cap.lines.filter((l) => /could not be read/.test(l));
  ok(errLines.length === 1 && /unparseable/.test(errLines[0]) && /keeping the previous presets/.test(errLines[0]) && !errLines[0].includes(SECRET_B.slice(-6)), `ONE line, position only (no bytes of the secret): ${errLines[0]}`);
  ok(r.status().errors.length === 1 && r.status().errors[0].kept === true && r.status().errors[0].code === 'unparseable', 'status() carries the typed error (kept: true)');
  ok(changes[changes.length - 1].kinds.length === 0, 'the error transition still notifies (kinds []) — the summary line must say it');
  // persisting malformed + another swap: no second line
  project(dir, { 'gdrive-clients.json': leak, 'integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }], 'override/gdrive-clients.json': [g('channels', SECRET_U, 'Mine')], 'override/integrations.json': '[]' });
  await sleep(600);
  ok(cap.lines.filter((l) => /could not be read/.test(l)).length === 1, 'the same failure on the next swap is not said again');
  // fixed
  project(dir, { 'gdrive-clients.json': [g('org1', SECRET_B, 'Org')], 'integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }] });
  await until(() => cap.lines.some((l) => /reads again/.test(l)), 3000);
  ok(cap.lines.some((l) => /gdrive-clients\.json reads again/.test(l)) && r.status().errors.length === 0 && r.entries('gdrive').map((e) => e.key).join() === 'org1', 'fixed: "reads again", the new presets in effect, the error gone');
  // too large
  cap.lines.length = 0;
  project(dir, { 'gdrive-clients.json': JSON.stringify([g('org1', SECRET_B)]) + ' '.repeat(CP.MAX_BYTES), 'integrations.json': '[]' });
  await until(() => cap.lines.some((l) => /too-large/.test(l)), 3000);
  ok(cap.lines.some((l) => /too-large/.test(l)) && r.entries('gdrive').length === 1, `a file over ${CP.MAX_BYTES} bytes is refused before it is read; the previous presets stay`);
  ok(r.entries('integrations').length === 0, 'a present [] is the answer for integrations (lark withdrawn)');
  // a key removed from the Secret: the kind falls back to the env
  project(dir, { 'integrations.json': '[]' });
  await until(() => r.entries('gdrive') === null, 3000);
  ok(r.entries('gdrive') === null, 'the Secret lost its gdriveClients key ⇒ entries(gdrive) null ⇒ the env is the fallback');
  r.stop();
  const after = changes.length;
  project(dir, { 'gdrive-clients.json': [g('late', SECRET_A)] });
  await sleep(500);
  ok(changes.length === after && r.entries('gdrive') === null, 'stop(): no watch, no poll, no listener after it');

  // a PLAIN directory (self-hosting): an in-place edit of override/ is caught by the poll
  const plain = path.join(ROOT, 'plain');
  fs.mkdirSync(path.join(plain, 'override'), { recursive: true });
  fs.writeFileSync(path.join(plain, 'gdrive-clients.json'), JSON.stringify([g('org1', SECRET_A)]));
  const cap2 = capture();
  const p2 = CP.create({ dir: plain, log: cap2.log, debounceMs: 30, pollMs: 150 });
  const ch2 = []; p2.onChange((c) => ch2.push(c)); await p2.start();
  fs.writeFileSync(path.join(plain, 'override', 'gdrive-clients.json'), JSON.stringify([g('org1', SECRET_U)]));
  const ms2 = await until(() => ch2.length > 0, 3000);
  ok(ms2 >= 0 && p2.entries('gdrive')[0].clientSecret === SECRET_U, `a plain directory's override/ edited in place is picked up (${ms2} ms, the stat-signature poll)`);
  p2.stop();

  // the directory rules
  ok(CP.resolveDir({ VIBESPACE_PRESETS_DIR: '/x/y' }) === '/x/y' && CP.resolveDir({ VIBESPACE_PRESETS_DIR: '' }, { useDefault: true, isDir: () => true }) === null, 'VIBESPACE_PRESETS_DIR: explicit wins; set and empty = OFF, even where the default exists');
  ok(CP.resolveDir({}, { useDefault: true, isDir: (p) => p === CP.DEFAULT_DIR }) === CP.DEFAULT_DIR && CP.resolveDir({}, { useDefault: true, isDir: () => false }) === null, 'the default /etc/vibespace/presets counts only when it is a directory');
  ok(CP.resolveDir({}, { useDefault: false, isDir: () => true }) === null, 'a process that is NOT the server (a suite, a helper) never probes the default — only an explicit dir');
  const prev = CP.setSharedPresets(null);
  const saved = process.env.VIBESPACE_PRESETS_DIR; delete process.env.VIBESPACE_PRESETS_DIR;
  ok(CP.sharedPresets().dir === null && CP.sharedPresets().entries('gdrive') === null, 'sharedPresets() made lazily = no directory (the env readers answer as before)');
  if (saved !== undefined) process.env.VIBESPACE_PRESETS_DIR = saved;
  CP.setSharedPresets(prev);
  const none = CP.create({ dir: path.join(ROOT, 'missing'), log: capture().log });
  ok(none.entries('gdrive') === null && none.entries('integrations') === null, 'a directory that does not exist: both kinds absent, no throw');

  // CONTROL: the failure path that DROPS the previous presets
  const srcR = fs.readFileSync(path.join(REPO, 'src/server/cluster-presets.js'), 'utf-8');
  const anchor = "      slot.error = { layer: slot.layer, file: FILES[slot.kind], code: out.error.code, kept: !!slot.list };";
  ok(srcR.includes(anchor), 'the control\'s anchor exists in the reader');
  const dropper = M.load('src/server/cluster-presets.js', srcR.replace(anchor, anchor + '\n      slot.list = null;'), 'drop');
  const dir3 = path.join(ROOT, 'ctl');
  project(dir3, { 'gdrive-clients.json': [g('org1', SECRET_A)] });
  const d3 = dropper.create({ dir: dir3, log: capture().log, debounceMs: 20, pollMs: 100 });
  await d3.start();
  project(dir3, { 'gdrive-clients.json': '[{"key":' });
  await sleep(500);
  ok(d3.entries('gdrive') === null, 'CONTROL: a copy that drops the slot on a parse error leaves NO presets — the keep-the-previous assert above is red on it');
  d3.stop();
}

// ═══ §3 THE LAYER TABLE (verify r1, T1) ═════════════════════════════════
// sources {cluster file, override file, env, the user's own key} × states
// {present, absent, unreadable, malformed JSON, a key with an empty value, not
// an array, a stale ..data swap mid-read} × keys {gdriveClients, integrations,
// a future key} ⇒ the effective preset per key + the words the UI says + what
// was logged (never a value). Every file cell is a fresh directory in the
// kubelet's shape + the reader's boot read; the env cells go through the two
// consumers (MountManager.drivePresets, the REAL integration store); "the
// user's own key wins" is proven AT THE CONSUMER (MountManager._driveClient —
// the Drive connect path asks it only without an own client id — and the
// store's resolve). CONTROLS, one per rule: a value in a line (e.message), a
// torn read published (no post-read re-check), a stray file unsaid, the
// consumer substituting a preset for the user's own client, the watch's
// failure freezing the presets (no poll).
console.log('§3 THE LAYER TABLE');
const IS = require(path.join(REPO, 'src/server/integration-store.js'));
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const SENT = { cluster: { gdrive: 'GOC' + 'SPX-SC-gdrive-CCCCCCCCCCCCCC', integrations: 'SC-lark-secret-CCCCCCCCCCCCCC' }, release: { gdrive: 'GOC' + 'SPX-SR-gdrive-RRRRRRRRRRRRRR', integrations: 'SR-lark-secret-RRRRRRRRRRRRRR' }, env: { gdrive: 'GOC' + 'SPX-SE-gdrive-EEEEEEEEEEEEEE', integrations: 'SE-cloak-license-EEEEEEEEEEEEE' } };
const ALL_SENT = [...Object.values(SENT.cluster), ...Object.values(SENT.release), ...Object.values(SENT.env)];
const leaks = (x) => { const s = typeof x === 'string' ? x : JSON.stringify(x); return ALL_SENT.filter((v) => s.includes(v) || s.includes(v.slice(-6))); };   // -6: V8's JSON-error window quotes ~10 bytes before the position
const ROOTLESS = typeof process.getuid === 'function' && process.getuid() !== 0;   // root reads a 000 file: that state is skipped as root, said
const STATES = ['present', 'absent', 'unreadable', 'malformed', 'empty', 'notarray'].filter((s) => ROOTLESS || s !== 'unreadable');
if (!ROOTLESS) console.log('  … SKIP the unreadable state: running as root (a 000 file reads)');
const t3 = (s, p) => String(s).replace(/\{(\w+)\}/g, (m0, k) => (p && p[k] !== undefined ? String(p[k]) : m0));
const ago3 = (ms) => `${Math.round(ms / 60000)} min ago`;
/** One layer file's bytes in one state (null = no file); an error state carries the layer's sentinel INSIDE the bytes. */
function fileBody(kind, state, secret) {
  switch (state) {
    case 'absent': return null;
    case 'present': case 'unreadable': return JSON.stringify(kind === 'gdrive' ? [g('k', secret, 'K')] : [{ id: 'lark', key: 'k', label: 'K', values: { appId: 'cli_k', appSecret: secret } }]);
    case 'malformed': return kind === 'gdrive' ? `[{"key":"k","clientId":"c","clientSecret":"${secret}"},]` : `[{"id":"lark","key":"k","values":{"appSecret":"${secret}"}},]`;
    case 'empty': return JSON.stringify(kind === 'gdrive' ? [g('k', '', 'K')] : [{ id: 'lark', key: 'k', label: 'K', values: { appId: '', appSecret: '' } }]);
    case 'notarray': return JSON.stringify({ key: 'k', clientId: 'c', clientSecret: secret, values: { appSecret: secret } });
    default: throw new Error('state ' + state);
  }
}
let cellN = 0;
/** The directory of one cell: `spec[layer] = state` applied to BOTH kinds of that layer; `extra` = more files by relative path. */
function cellDir(spec, extra = {}) {
  const dir = path.join(ROOT, `cell-${++cellN}`);
  const files = { ...extra }; const unreadable = [];
  for (const layer of P3.LAYERS) for (const kind of P3.KINDS) {
    const body = fileBody(kind, spec[layer], SENT[layer][kind]);
    if (body === null) continue;
    const rel = (layer === 'release' ? CP.OVERRIDE_DIR + '/' : '') + CP.FILES[kind];
    files[rel] = body; if (spec[layer] === 'unreadable') unreadable.push(rel);
  }
  project(dir, files);
  for (const rel of unreadable) fs.chmodSync(path.join(dir, fs.readlinkSync(path.join(dir, '..data')), rel), 0o000);
  return dir;
}
const P3 = PL;
const ERR_CODE = { unreadable: 'unreadable', malformed: 'unparseable', notarray: 'not-an-array' };
/** THE RULE a cell is judged by: per key the release's entry replaces the cluster's; an error / absent layer contributes nothing; a present file — even one whose only entry was dropped — is an ANSWER (never the env); `empty` = gdrive drops the entry at parse, integrations keeps it with '' values. */
function expectKind(kind, c, r) {
  const names = (st) => st === 'present' || (st === 'empty' && kind === 'integrations');
  const answers = (st) => st === 'present' || st === 'empty';
  for (const [layer, st] of [['release', r], ['cluster', c]]) if (names(st)) return { from: layer, present: true, value: st === 'empty' ? '' : SENT[layer][kind] };
  if (answers(c) || answers(r)) return { from: 'none', present: true, value: null };
  return { from: 'env', present: false, value: null };
}
const secretOf = (kind, e) => (kind === 'gdrive' ? e.clientSecret : e.values.appSecret);
let cells = 0;
for (const c of STATES) for (const r of STATES) {
  const dir = cellDir({ cluster: c, release: r });
  const cap = capture();
  const rd = CP.create({ dir, log: cap.log });
  const st = rd.status();
  const sum = P3.summarize({ dir, items: st.items, updatedAt: st.updatedAt, loadedAt: st.loadedAt, errors: st.errors });
  const line = P3.presetsLine(sum, { t: t3, ago: ago3 });
  const name = `cluster=${c} × release=${r}`;
  const bad = [];
  let anyEntry = false;
  for (const kind of P3.KINDS) {
    const exp = expectKind(kind, c, r); const e = rd.entries(kind);
    if (!exp.present) { if (e !== null) bad.push(`${kind}: expected null (the env rung), got ${JSON.stringify(e)}`); continue; }
    if (!Array.isArray(e)) { bad.push(`${kind}: expected an answer, got ${e}`); continue; }
    if (exp.from === 'none') { if (e.length) bad.push(`${kind}: expected no entry, got ${e.length}`); continue; }
    anyEntry = true;
    if (e.length !== 1 || e[0].key !== 'k') { bad.push(`${kind}: expected the one key k, got ${e.map((x) => x.key).join()}`); continue; }
    if (secretOf(kind, e[0]) !== exp.value) bad.push(`${kind}: expected the ${exp.from}'s value, got another`);
    const src = st.items.find((i) => i.kind === (kind === 'gdrive' ? 'gdrive' : 'lark'));
    if (!src || src.source !== exp.from || src.n !== 1) bad.push(`${kind}: status item should say ${exp.from} ×1, got ${JSON.stringify(src)}`);
  }
  ok(!bad.length, `${name}: the effective preset per key${bad.length ? ' — ' + bad.join('; ') : ''}`);
  // the errors: one typed row + ONE line per failing layer file, kept:false at boot
  const expErrs = []; for (const layer of P3.LAYERS) for (const kind of P3.KINDS) if (ERR_CODE[{ cluster: c, release: r }[layer]]) expErrs.push({ layer, file: CP.FILES[kind], code: ERR_CODE[{ cluster: c, release: r }[layer]] });
  const gotErrs = st.errors.map((x) => ({ layer: x.layer, file: x.file, code: x.code }));
  const errLines = cap.lines.filter((l) => /could not be read/.test(l));
  ok(JSON.stringify(gotErrs.sort((a, b) => (a.layer + a.file).localeCompare(b.layer + b.file))) === JSON.stringify(expErrs.sort((a, b) => (a.layer + a.file).localeCompare(b.layer + b.file))) && st.errors.every((x) => x.kept === false) && errLines.length === expErrs.length && expErrs.every((x) => errLines.some((l) => l.includes((x.layer === 'release' ? 'override/' : '') + x.file) && l.includes(x.code) && /no presets from it until it is fixed/.test(l))),
    `${name}: ${expErrs.length} typed error row(s) (kept:false) + ${expErrs.length} line(s) naming file + code${expErrs.length ? '' : ' — none'}`);
  // the words
  const wantCluster = P3.KINDS.some((k) => expectKind(k, c, r).from === 'cluster'), wantRelease = P3.KINDS.some((k) => expectKind(k, c, r).from === 'release');
  const okWords = anyEntry ? (!line.none && /from the cluster/.test(line.text) === wantCluster && /from this release/.test(line.text) === wantRelease && !/from the environment/.test(line.text)) : (line.none && /none — ask your admin/.test(line.text));
  ok(okWords && line.errors.length === expErrs.length && line.errors.every((s) => /offers no presets until it is fixed/.test(s)), `${name}: the line says it — "${line.text}"${line.errors.length ? ' + ' + line.errors.length + ' error sentence(s)' : ''}`);
  // never a value
  const leaked = leaks([cap.lines, st, sum, line]);
  ok(!leaked.length, `${name}: no value in any line / status / summary / words${leaked.length ? ' — LEAKED ' + leaked.join(', ') : ''}`);
  cells++;
}
ok(cells === STATES.length * STATES.length, `${cells} file cells (${STATES.length} × ${STATES.length} states, both keys each)`);

// the env source: only when the directory says nothing about the kind
{
  const quiet = capture();
  const empty = path.join(ROOT, 'cell-env-empty'); fs.mkdirSync(empty, { recursive: true });
  const none = CP.create({ dir: empty, log: quiet.log });
  const prevShared = CP.setSharedPresets(none);
  const savedEnv = {}; for (const k of ['VIBESPACE_GDRIVE_CLIENTS', 'VIBESPACE_GDRIVE_CLIENT_ID', 'VIBESPACE_GDRIVE_CLIENT_SECRET']) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  const errs = []; const prevErr = console.error; console.error = (...a) => errs.push(a.join(' '));
  const envCell = (state) => {
    delete process.env.VIBESPACE_GDRIVE_CLIENTS; errs.length = 0;
    if (state === 'present') process.env.VIBESPACE_GDRIVE_CLIENTS = JSON.stringify([g('ek', SENT.env.gdrive)]);
    if (state === 'malformed') process.env.VIBESPACE_GDRIVE_CLIENTS = `[{"key":"ek","clientId":"c","clientSecret":"${SENT.env.gdrive}"},]`;
    const d = MountManager.drivePresets();
    const dataDir = path.join(ROOT, 'cell-env-' + state); fs.mkdirSync(dataDir, { recursive: true });
    const envI = state === 'present' ? JSON.stringify([{ id: 'cloak', values: { licenseKey: SENT.env.integrations } }]) : state === 'malformed' ? `[{"id":"cloak","values":{"licenseKey":"${SENT.env.integrations}"}},]` : undefined;
    const lines = []; const st = IS.create({ dataDir, env: envI === undefined ? {} : { VIBESPACE_INTEGRATIONS: envI }, presets: none, log: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) } });
    const res = st.resolveIntegration('cloak');
    return { d, res, errs: errs.slice(), lines };
  };
  const p = envCell('present');
  ok(p.d.length === 1 && p.d[0].clientSecret === SENT.env.gdrive && p.res.source === 'cluster' && p.res.values.licenseKey === SENT.env.integrations, 'env=present, directory silent: Google clients from VIBESPACE_GDRIVE_CLIENTS, the cloak row from VIBESPACE_INTEGRATIONS (source cluster)');
  const a = envCell('absent');
  ok(a.d.length === 0 && a.res.source === 'none' && a.res.whyCode === 'no-preset', 'env=absent, directory silent: no Google client, the row says no-preset (the dialogs: ask your admin)');
  const m = envCell('malformed');
  console.error = prevErr;                      // the captures are over — ok()'s own ✗ goes to stderr again
  ok(m.d.length === 0 && m.res.source === 'none' && m.errs.length === 1 && m.lines.some((l) => /unparseable|not valid JSON/.test(l)) && !leaks([m.errs, m.lines]).length, 'env=malformed: [] / none, ONE line each, no bytes of the secret');
  // the directory ANSWERS ⇒ the env is not consulted, even when it speaks
  process.env.VIBESPACE_GDRIVE_CLIENTS = JSON.stringify([g('ek', SENT.env.gdrive)]);
  const spoken = CP.create({ dir: cellDir({ cluster: 'present', release: 'absent' }), log: quiet.log });
  CP.setSharedPresets(spoken);
  const d2 = MountManager.drivePresets();
  const st2 = IS.create({ dataDir: path.join(ROOT, 'cell-env-spoken'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'cloak', values: { licenseKey: SENT.env.integrations } }]) }, presets: spoken, log: quiet.log });
  ok(d2.map((x) => x.key).join() === 'k' && d2[0].clientSecret === SENT.cluster.gdrive && st2.resolveIntegration('cloak').source === 'none' && st2.resolveIntegration('lark', { credentialKey: 'cluster:k' }).values.appSecret === SENT.cluster.integrations, 'the directory answers ⇒ the env is NOT consulted for that kind (one rung, never a mix): the env\'s ek and its cloak key are invisible');

  // THE USER'S OWN KEY WINS — AT THE CONSUMER
  const own = MountManager._driveClient({ clientId: 'mine.apps.googleusercontent.com', clientPreset: 'k' });
  const preset = MountManager._driveClient({ clientPreset: 'k' });
  ok(own === null && preset && preset.clientSecret === SENT.cluster.gdrive, 'Drive: a record with its OWN client id gets no preset (null = its own is used) while the same preset key resolves for a record without one');
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  ok(msrc.includes("let cid = clientId, csec = clientSecret;\n      if (!cid) { const pc = MountManager._driveClient({ clientPreset: clientPreset || null });") && msrc.includes('if (m.clientId) return null; // custom client on the record itself'), 'WIRING: the Drive connect path asks _driveClient only without an own client id, and _driveClient yields to a record\'s own id');
  st2.setIntegration('cloud:browserless', { apiKey: 'MINE-OWN-browserless-key-0000' });
  const spokenB = CP.create({ dir: cellDir({ cluster: 'absent', release: 'present' }, { 'integrations.json': JSON.stringify([{ id: 'cloud:browserless', values: { apiKey: SENT.cluster.integrations } }]) }), log: quiet.log });   // the cluster file is the extra one (a present cluster state would overwrite it)
  const st3 = IS.create({ dataDir: path.join(ROOT, 'cell-env-spoken'), env: {}, presets: spokenB, log: quiet.log });
  const r3 = st3.resolveIntegration('cloud:browserless');
  ok(r3.source === 'user' && r3.values.apiKey === 'MINE-OWN-browserless-key-0000' && st3.publicView('cloud:browserless').clusterAvailable === true, 'integrations: the user\'s own saved key outranks a cluster preset of the same row at the REAL store (the card still says a cluster default exists)');
  for (const [k, v] of Object.entries(savedEnv)) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }
  CP.setSharedPresets(prevShared);
}

// A FUTURE KEY: a file the reader does not know is SAID by name, never silently ignored; a stale ..data swap mid-read; the watch dying; a storm
{
  const cap = capture();
  const dir = cellDir({ cluster: 'present', release: 'absent' }, { 'browser-keys.json': '[]', 'override/lark.json': '{}' });
  const rd = CP.create({ dir, log: cap.log });
  const stray = cap.lines.filter((l) => /ignored/.test(l));
  ok(stray.length === 1 && /ignored browser-keys\.json, override\/lark\.json/.test(stray[0]) && /the files read are integrations\.json, gdrive-clients\.json/.test(stray[0]) && rd.entries('gdrive').length === 1 && rd.entries('integrations').length === 1 && rd.status().errors.length === 0, `a future / mistyped file: ONE line names it, the known files unaffected — ${stray[0]}`);
  // the torn read: a ..data swap landing BETWEEN two slot reads of one reload is never published
  const tdir = cellDir({ cluster: 'present', release: 'absent' });
  const tcap = capture();
  const tr = CP.create({ dir: tdir, log: tcap.log, debounceMs: 20, pollMs: 100000 });
  const published = []; tr.onChange((ch) => published.push({ kinds: ch.kinds.slice(), gdrive: tr.entries('gdrive')[0].clientSecret, lark: tr.entries('integrations')[0].values.appSecret }));
  const NEWG = 'GOC' + 'SPX-SC-gdrive-NEWNEWNEWNEWNEW', NEWL = 'SC-lark-secret-NEWNEWNEWNEWNEW';
  const realRead = fs.promises.readFile; let armed = true; let open; const gate = new Promise((res) => { open = res; });
  const tornRead = async function (f, ...a) {
    const s = String(f);
    if (/[/]integrations\.json$/.test(s) && !/override/.test(s) && armed) await gate;
    const text = await realRead.call(this, f, ...a);
    if (armed && /[/]gdrive-clients\.json$/.test(s) && !/override/.test(s)) { armed = false; project(tdir, { 'gdrive-clients.json': [g('k', NEWG, 'K')], 'integrations.json': [{ id: 'lark', key: 'k', label: 'K', values: { appId: 'cli_k', appSecret: NEWL } }] }); open(); }
    return text;
  };
  fs.promises.readFile = tornRead;
  await tr.reload();
  fs.promises.readFile = realRead;
  ok(published.length === 1 && published[0].gdrive === NEWG && published[0].lark === NEWL && tcap.lines.filter((l) => /changed/.test(l)).length === 1, `a swap landing BETWEEN two slot reads: ONE consistent snapshot published (both from the new tree), ONE journal line — never a torn mix (${JSON.stringify(published.map((p) => [p.gdrive.slice(-6), p.lark.slice(-6)]))})`);
  tr.stop();
  // the watch dies (EMFILE) ⇒ said once, the poll carries the next swap
  const wdir = cellDir({ cluster: 'present', release: 'absent' });
  const wcap = capture();
  const realWatch = fs.watch; fs.watch = () => { const e = new Error('EMFILE: too many open files, watch'); e.code = 'EMFILE'; throw e; };
  const wr = CP.create({ dir: wdir, log: wcap.log, debounceMs: 20, pollMs: 120 });
  const wseen = []; wr.onChange((ch) => wseen.push(ch.kinds.join()));
  await wr.start(); fs.watch = realWatch;
  project(wdir, { 'gdrive-clients.json': [g('k', NEWG, 'K')] });
  const wms = await until(() => wseen.length > 0, 4000);
  ok(wcap.lines.some((l) => /cannot watch .* \(EMFILE\) — polling every/.test(l)) && wms >= 0 && wr.entries('gdrive')[0].clientSecret === NEWG, `the watch refused (EMFILE) is said once and the poll carries the swap (${wms} ms at a 120 ms poll) — the presets never freeze`);
  wr.stop();
  // a swap STORM (an admin applying many times) ⇒ coalesced, the final state right and in order
  const sdir = cellDir({ cluster: 'present', release: 'absent' });
  const sr = CP.create({ dir: sdir, log: capture().log, debounceMs: 30, pollMs: 100000 });
  const sseen = []; sr.onChange(() => sseen.push(sr.entries('gdrive')[0].clientSecret));
  await sr.start();
  const N = 40;
  for (let i = 1; i <= N; i++) { project(sdir, { 'gdrive-clients.json': [g('k', `GOCSPX-storm-${String(i).padStart(3, '0')}`, 'K')] }); await sleep(3); }
  await until(() => sseen.length && sseen[sseen.length - 1].endsWith('-040'), 4000); await sleep(200);
  ok(sseen.length >= 1 && sseen.length <= 8 && sseen[sseen.length - 1].endsWith('-040') && sseen.every((s, i) => i === 0 || s > sseen[i - 1]), `${N} swaps in ~${N * 3} ms ⇒ ${sseen.length} notification(s) (debounced, single-flight), the last state in effect, in order`);
  sr.stop();
}

// CONTROLS — one per rule of this table
{
  const srcR = fs.readFileSync(path.join(REPO, 'src/server/cluster-presets.js'), 'utf-8');
  // a value in a line: the pre-describeJsonError shape (V8 quotes the bytes around a JSON error)
  const a1 = "try { parsed = JSON.parse(text); } catch (e) { return { error: { code: 'unparseable', detail: describeJsonError(e) } }; }";
  ok(srcR.includes(a1), 'control anchor: the JSON error is described by position');
  const leaky = M.load('src/server/cluster-presets.js', srcR.replace(a1, "try { parsed = JSON.parse(text); } catch (e) { return { error: { code: 'unparseable', detail: e.message } }; }"), 'leaky');
  const lcap = capture(); leaky.create({ dir: cellDir({ cluster: 'malformed', release: 'absent' }), log: lcap.log });   // the table's `},]` bytes: V8 quotes the 10 bytes before the token
  ok(leaks(lcap.lines).length > 0, 'CONTROL: a copy that logs e.message prints the secret\'s bytes — the never-a-value assert is red on it');
  // a torn read published: no post-read re-check
  const a2 = "      if (after === sig) { outs = read; break; }";
  ok(srcR.includes(a2), 'control anchor: the post-read signature re-check');
  const torn = M.load('src/server/cluster-presets.js', srcR.replace(a2, "      outs = read; break;"), 'torn');
  const tdir = cellDir({ cluster: 'present', release: 'absent' });
  const tr = torn.create({ dir: tdir, log: capture().log, debounceMs: 20, pollMs: 100000 });
  const pub = []; tr.onChange(() => pub.push([tr.entries('gdrive')[0].clientSecret, tr.entries('integrations')[0].values.appSecret]));
  const NEWG = 'GOC' + 'SPX-SC-gdrive-NEWNEWNEWNEWNEW', NEWL = 'SC-lark-secret-NEWNEWNEWNEWNEW';
  const realRead = fs.promises.readFile; let armed = true; let open; const gate = new Promise((res) => { open = res; });
  fs.promises.readFile = async function (f, ...a) { const s = String(f); if (/[/]integrations\.json$/.test(s) && !/override/.test(s) && armed) await gate; const text = await realRead.call(this, f, ...a); if (armed && /[/]gdrive-clients\.json$/.test(s) && !/override/.test(s)) { armed = false; project(tdir, { 'gdrive-clients.json': [g('k', NEWG, 'K')], 'integrations.json': [{ id: 'lark', key: 'k', label: 'K', values: { appId: 'cli_k', appSecret: NEWL } }] }); open(); } return text; };
  await tr.reload(); fs.promises.readFile = realRead; tr.stop();
  ok(pub.length === 1 && pub[0][0] === SENT.cluster.gdrive && pub[0][1] === NEWL, 'CONTROL: a copy without the post-read re-check PUBLISHES a torn snapshot (gdrive from the old tree, integrations from the new) — the torn-read assert is red on it');
  // a stray file unsaid
  const a3 = "    if (key && key !== saidStrays) log.warn(";
  ok(srcR.includes(a3), 'control anchor: the stray-file line');
  const mute = M.load('src/server/cluster-presets.js', srcR.replace(a3, "    if (false) log.warn("), 'mute');
  const mcap = capture(); mute.create({ dir: cellDir({ cluster: 'present', release: 'absent' }, { 'browser-keys.json': '[]' }), log: mcap.log });
  ok(!mcap.lines.some((l) => /ignored/.test(l)), 'CONTROL: a copy that never says a stray file ignores browser-keys.json in silence — the future-key assert is red on it');
  // the consumer substituting a preset for the user's own client
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  const a4 = "    if (m.clientId) return null; // custom client on the record itself\n";
  ok(msrc.includes(a4), 'control anchor: _driveClient yields to the record\'s own client');
  const subst = M.load('src/mounts.js', msrc.replace(a4, ''), 'subst');
  const prevShared = CP.setSharedPresets(CP.create({ dir: cellDir({ cluster: 'present', release: 'absent' }), log: capture().log }));
  const got = subst.MountManager._driveClient({ clientId: 'mine.apps.googleusercontent.com', clientPreset: 'k' });
  CP.setSharedPresets(prevShared);
  ok(got && got.clientSecret === SENT.cluster.gdrive, 'CONTROL: a _driveClient without the own-client rule hands the PRESET to a record that has its own client — the user-wins assert is red on it');
  // the watch's failure freezing the presets: no poll after a refused watch
  const a5 = "    } catch (e) { log.warn(`[presets] cannot watch ${dir} (${e && e.code}) — polling every ${Math.round(pollMs / 1000)} s`); }\n    poll = setInterval(() => { reload(); }, pollMs);";
  ok(srcR.includes(a5), 'control anchor: the poll starts whatever the watch did');
  const frozen = M.load('src/server/cluster-presets.js', srcR.replace(a5, "    } catch (e) { log.warn(`[presets] cannot watch ${dir} (${e && e.code})`); return; }\n    poll = setInterval(() => { reload(); }, pollMs);"), 'frozen');
  const fdir = cellDir({ cluster: 'present', release: 'absent' });
  const realWatch = fs.watch; fs.watch = () => { const e = new Error('EMFILE'); e.code = 'EMFILE'; throw e; };
  const fr = frozen.create({ dir: fdir, log: capture().log, debounceMs: 20, pollMs: 100 });
  const fseen = []; fr.onChange((ch) => fseen.push(ch));
  await fr.start(); fs.watch = realWatch;
  project(fdir, { 'gdrive-clients.json': [g('k', NEWG, 'K')] });
  await sleep(500); fr.stop();
  ok(fseen.length === 0 && fr.entries('gdrive')[0].clientSecret === SENT.cluster.gdrive, 'CONTROL: a copy with no poll behind a refused watch FREEZES on the boot presets — the watcher-dead assert is red on it');
}

// ═══ §4 THE LAYER MOVES, THE VALUES DO NOT (B-8145) ═════════════════════
console.log('§4 a key changes layer with identical values (B-8145)');
{
  const wiring = require(path.join(REPO, 'src/server/integrations-wiring.js'));
  const CL_G = [g('org1', SECRET_A, 'Org'), g('org2', SECRET_A), g('channels', SECRET_A)];
  const CL_I = [{ id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_x', appSecret: LARK_S } }];
  const groupsOf = (sum) => sum.groups.map((gr) => `${gr.source}:${gr.items.map((i) => `${i.kind}=${i.n}`).join('+')}`).join(' ');
  /** A release migrated with blocks equal to the cluster's, then upgraded without them: what the reader + the REAL wiring publish. */
  async function migrate(CPX, tag) {
    const dir = path.join(ROOT, 'mig-' + tag); const data = path.join(ROOT, 'mig-data-' + tag); fs.mkdirSync(data, { recursive: true });
    project(dir, { 'gdrive-clients.json': CL_G, 'integrations.json': CL_I, 'override/gdrive-clients.json': CL_G, 'override/integrations.json': CL_I });
    const cap = capture(); const frames = []; const changes = [];
    const r = CPX.create({ dir, log: cap.log, debounceMs: 20, pollMs: 100000 });
    const w = wiring.create({ app: { use() {} }, dataDir: data, bcastAll: (m) => frames.push(JSON.parse(JSON.stringify(m))), env: {}, presets: r, log: cap.log });
    r.onChange((c) => changes.push(c));
    await r.reload();                                        // the boot tree again: nothing moved
    const o = { boot: groupsOf(w.presetsSummary()), quiet: changes.length };
    cap.lines.length = 0;
    project(dir, { 'gdrive-clients.json': CL_G, 'integrations.json': CL_I });   // the upgrade: override/ empties, every value identical
    await r.reload();
    const pushed = frames.filter((f) => f.type === 'cluster-presets-updated');
    Object.assign(o, { after: groupsOf(w.presetsSummary()), pushed: pushed.length ? groupsOf(pushed[pushed.length - 1].presets) : null, change: changes[changes.length - 1] || null, lines: cap.lines.slice(), cards: frames.filter((f) => f.type === 'integrations-updated').length, secret: r.entries('gdrive')[0].clientSecret });
    project(dir, { 'gdrive-clients.json': CL_G, 'integrations.json': CL_I, 'override/gdrive-clients.json': CL_G });   // an equal override comes back (gdrive only)
    await r.reload();
    o.back = groupsOf(w.presetsSummary());
    o.n = changes.length;
    project(dir, { 'gdrive-clients.json': CL_G, 'integrations.json': CL_I, 'override/gdrive-clients.json': CL_G });   // the same tree again
    await r.reload();
    o.same = changes.length === o.n;
    // the rotation: shadowed while the override is projected, in effect once it is gone
    const ROT = [g('org1', SECRET_B, 'Org'), g('org2', SECRET_A), g('channels', SECRET_A)];
    project(dir, { 'gdrive-clients.json': ROT, 'integrations.json': CL_I, 'override/gdrive-clients.json': CL_G });
    await r.reload(); o.shadowed = r.entries('gdrive')[0].clientSecret;
    project(dir, { 'gdrive-clients.json': ROT, 'integrations.json': CL_I });
    await r.reload(); o.rotated = r.entries('gdrive')[0].clientSecret;
    r.stop();
    return o;
  }
  const m = await migrate(CP, 'fix');
  ok(m.boot === 'release:gdrive=3+lark=1' && m.quiet === 0, `boot: every key from the release's override (${m.boot}); a re-read of the same tree fires nothing`);
  ok(m.after === 'cluster:gdrive=3+lark=1' && m.pushed === m.after, `the override gone, values identical ⇒ the summary AND the cluster-presets-updated push say "from the cluster" (${m.after} · pushed ${m.pushed})`);
  ok(m.change && m.change.kinds.length === 0 && m.change.sources.join() === 'integrations,gdrive', `the change names no value kind and both moved sources (kinds [${m.change && m.change.kinds}] · sources [${m.change && m.change.sources}])`);
  ok(!m.lines.some((l) => /\[presets\] changed/.test(l)) && m.cards === 0 && m.secret === SECRET_A, 'no journal line (nothing was added, removed or rotated) and no card re-derive — the same values stay in effect');
  ok(m.back === 'cluster:lark=1 release:gdrive=3' && m.same, `an equal override returning moves the summary back (${m.back}); the same tree again fires nothing`);
  ok(m.shadowed === SECRET_A && m.rotated === SECRET_B, 'a cluster rotation of org1 is SHADOWED while the equal override is projected (the field symptom) and in effect once the override is gone');
  // CONTROL: the reader before B-8145 — the values compared, the layers not
  const srcR = fs.readFileSync(path.join(REPO, 'src/server/cluster-presets.js'), 'utf-8');
  const a6 = '    const sources = [...P.KINDS, FLEET].filter((k) => attributionOf(merged[k]) !== attributionOf(next[k]));';
  ok(srcR.includes(a6), 'control anchor: the attribution comparison');
  const valuesOnly = M.load('src/server/cluster-presets.js', srcR.replace(a6, '    const sources = [];'), 'valuesonly');
  const c = await migrate(valuesOnly, 'ctl');
  ok(c.after === 'release:gdrive=3+lark=1' && c.pushed === null, `CONTROL: a copy that compares the values only keeps the summary on "release" after the override is gone and pushes nothing (${c.after}) — the asserts above are red on it`);
}

// §D lane decision-core → lane llm-plugin-rename: the LLM row's cluster preset rides the Slack row's road — its OWN
// prefix (VIBESPACE_INTEGRATION_LLM_*), resolved by the ONE store, read by the ONE caller (the engine never sees env).
// The fleet's PRE-RENAME spellings — the old single-field prefix, a JSON entry under the old row id — still resolve the
// row (the row DECLARES them: clusterEnv.legacy), and when both spellings are set the new one wins (said once).
{
  const S = require(path.join(REPO, 'src/server/integration-store.js'));
  const E = require(path.join(REPO, 'src/server/decision-engine.js'));
  const { PluginManager } = require(path.join(REPO, 'src/plugins.js'));
  const LLM = require(path.join(REPO, 'src/plugins/llm.js'));
  const row = R.rowById('llm');
  const OLD_ID = row && row.clusterEnv.legacy ? row.clusterEnv.legacy.jsonKeys[0] : null;
  ok(!!row && !!OLD_ID && !R.rowById(OLD_ID), `llm: the row exists under its new id; its pre-rename id (${OLD_ID}) is no row — only a declared legacy spelling (this suite never builds or reads an env name: every leg resolves through the ONE store)`);
  let seq = 0;
  const mk = (env, { store = S, settings = null } = {}) => {
    const dd = path.join(scratch('llm-presets-' + (++seq)), 'data'); fs.mkdirSync(dd, { recursive: true });
    const said = [];
    const st = store.create({ dataDir: dd, env, log: { warn() {}, log: (l) => said.push(String(l)), error() {} } });
    const eng = E.create({ dataDir: dd, integrations: st, log: { warn() {} } });
    if (settings) new PluginManager({ dataDir: dd, plugins: [LLM], settings: { read: () => settings, patch: () => {} }, decisionEngine: eng });
    return { st, eng, said };
  };
  const KEY_NEW = 'sk-or-dummy-' + 'cluster-0001', KEY_OLD = 'sk-dummy-' + 'legacy-0002', KEY_JSON = 'sk-or-dummy-' + 'json-0003';
  const NEW = { VIBESPACE_INTEGRATION_LLM_PROVIDER: 'openrouter', VIBESPACE_INTEGRATION_LLM_APIKEY: KEY_NEW, VIBESPACE_INTEGRATION_LLM_MODEL: 'typesafe/jev-router' };
  const OLD = { VIBESPACE_INTEGRATION_DECISION_API_PROVIDER: 'openai', VIBESPACE_INTEGRATION_DECISION_API_APIKEY: KEY_OLD, VIBESPACE_INTEGRATION_DECISION_API_MODEL: 'gpt-6-luna-mini' };
  const a = mk(NEW), s1 = a.eng.status(), res = a.st.resolveIntegration('llm');
  ok(res.source === 'cluster' && s1.configured && s1.provider === 'openrouter' && s1.model === 'typesafe/jev-router' && s1.keySource === 'cluster' && !JSON.stringify(s1).includes(KEY_NEW), `the new prefix resolves as the cluster default and the engine reads it through the store — the preset's MODEL is the judging model while the cluster's key is in use, the key never in its status (${res.source}, ${s1.provider}, ${s1.model})`);
  ok(!a.st.publicView('llm').fields.some((f) => f.key === 'model') && a.st.publicView('llm').values.model === undefined, 'the card shows provider + key only — the preset\'s model never reaches the card');
  const b = mk(OLD), s2 = b.eng.status(), r2 = b.st.resolveIntegration('llm');
  ok(r2.source === 'cluster' && r2.values.apiKey === KEY_OLD && s2.provider === 'openai' && s2.model === 'gpt-6-luna-mini', `LEGACY: the OLD prefix alone still resolves the row (the fleet's presets keep working) — provider, key and the model it chose (${r2.source}, ${s2.provider}, ${s2.model})`);
  const c = mk({ ...OLD, ...NEW }), r3 = c.st.resolveIntegration('llm'); c.st.resolveIntegration('llm');
  ok(r3.source === 'cluster' && r3.values.apiKey === KEY_NEW && r3.values.provider === 'openrouter' && c.eng.status().model === 'typesafe/jev-router', 'LEGACY: both prefixes set ⇒ the NEW one wins, whole (never a field-by-field mix)');
  ok(c.said.filter((l) => /pre-rename/.test(l)).length === 1 && !c.said.join('\n').includes(KEY_OLD) && !c.said.join('\n').includes(KEY_NEW), 'both set is SAID once (two resolves, one line) — names only, never a value', c.said.join(' | '));
  const jsonOld = [{ id: OLD_ID, key: 'fleet', values: { provider: 'openrouter', apiKey: KEY_JSON, model: 'openai/gpt-6-luna-decisions' } }];
  const d = mk({ VIBESPACE_INTEGRATIONS: JSON.stringify(jsonOld) }), r4 = d.st.resolveIntegration('llm');
  ok(r4.source === 'cluster' && r4.clusterKey === 'fleet' && r4.values.apiKey === KEY_JSON && d.eng.status().model === 'openai/gpt-6-luna-decisions', `LEGACY: a JSON entry under the old id still resolves the row (${r4.source} ${r4.clusterKey})`);
  const e = mk({ VIBESPACE_INTEGRATIONS: JSON.stringify([...jsonOld, { id: 'llm', key: 'new', values: { provider: 'openrouter', apiKey: KEY_NEW } }]) }), r5 = e.st.resolveIntegration('llm');
  ok(r5.clusterKey === 'new' && r5.values.apiKey === KEY_NEW && e.st.publicView('llm').clusterOptions.map((o) => o.key).join() === 'new', 'LEGACY: a JSON entry under each id ⇒ the new id\'s entries are the presets (the old ones are not offered beside them)');
  // the plugin's judgeModel row outranks the preset's; a user's OWN key never borrows the cluster's model
  const f = mk(NEW, { settings: { 'plugin.llm.judgeModel': 'openai/gpt-6-luna' } });
  ok(f.eng.status().model === 'openai/gpt-6-luna', `the plugin's judgeModel row outranks the preset's model (${f.eng.status().model})`);
  const g = mk(NEW); g.st.setIntegration('llm', { provider: 'openai', apiKey: 'sk-dummy-' + 'own-key-0004' });
  ok(g.eng.status().keySource === 'user' && g.eng.status().model === 'gpt-6-luna', `a user's OWN key never takes the cluster's model — the provider's default (${g.eng.status().model})`);
  // RED CONTROL: the store without its legacy read answers nothing for the old prefix
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/integration-store.js'), 'utf8');
  const LINE = "const legacyIdsOf = (row) => (row.clusterEnv && row.clusterEnv.legacy && Array.isArray(row.clusterEnv.legacy.jsonKeys) ? row.clusterEnv.legacy.jsonKeys : []);";
  const bare = SRC.includes(LINE) ? M.load('src/server/integration-store.js', SRC.replace(LINE, 'const legacyIdsOf = () => [];'), 'no-legacy') : null;
  const h = bare ? mk(OLD, { store: bare }) : null;
  ok(!!h && h.st.resolveIntegration('llm').source === 'none' && h.eng.status().configured === false, 'RED CONTROL: a store copy WITHOUT the legacy read leaves an old-prefix cluster unconfigured (the leg above proves the read)');
  const none = mk({});
  ok(none.eng.status().configured === false, 'no prefix (new or old), no own key ⇒ the engine is not configured (no key)');
}

// ═══ §5 THE FLEET FACTS (lane oauth-relay-one-source) ═══════════════════
console.log('§5 fleet.json — the fleet\'s relay page rides the presets');
{
  const RELAY1 = 'https://admin.fleet.example.test/relay/', RELAY2 = 'https://admin2.fleet.example.test/relay/', MINE = 'https://mine.example.test/relay/';
  // PURE
  ok(JSON.stringify(PL.parseFleet({ relayUrl: `  ${RELAY1} `, other: 'x', n: 3 })) === JSON.stringify({ relayUrl: RELAY1 }) && JSON.stringify(PL.parseFleet({ relayUrl: 7 })) === '{}', 'parseFleet: the known field, trimmed; an unknown field or a non-string value is not named');
  let threw = 0; for (const bad of [[], 'abc', 3, null, [{ relayUrl: RELAY1 }]]) { try { PL.parseFleet(bad); } catch { threw++; } }
  ok(threw === 5, 'parseFleet THROWS on a top level that is not an object (the reader turns it into a named error)');
  ok(PL.mergeFleet({ cluster: null, release: null }) === null && PL.mergeFleet({}) === null, 'both layers absent ⇒ null (the caller\'s fallback)');
  const mC = PL.mergeFleet({ cluster: { relayUrl: RELAY1 }, release: null });
  const mR = PL.mergeFleet({ cluster: { relayUrl: RELAY1 }, release: { relayUrl: MINE } });
  const mE = PL.mergeFleet({ cluster: { relayUrl: RELAY1 }, release: {} });
  const mB = PL.mergeFleet({ cluster: { relayUrl: RELAY1 }, release: { relayUrl: '' } });
  ok(mC.facts.relayUrl === RELAY1 && mC.layerOf.relayUrl === 'cluster' && mR.facts.relayUrl === MINE && mR.layerOf.relayUrl === 'release' && mE.facts.relayUrl === RELAY1 && mE.layerOf.relayUrl === 'cluster' && mB.facts.relayUrl === '' && mB.layerOf.relayUrl === 'release',
    'mergeFleet per FIELD: the release\'s field wins (its "" = none), a release file naming no field keeps the cluster\'s');
  const mN = PL.mergeFleet({ cluster: {}, release: null });
  ok(mN && !('relayUrl' in mN.facts), 'a present fleet.json naming no relayUrl: the field is ABSENT (not "")');
  ok(PL.diffFleet(mC, PL.mergeFleet({ cluster: { relayUrl: RELAY1 } })).length === 0 && PL.diffFleet(mC, mR).join() === 'relayUrl' && PL.diffFleet(mN, mB).join() === 'relayUrl' && PL.diffFleet(null, mC).join() === 'relayUrl', 'diffFleet: equal ⇒ [], a moved value / absent vs "" / null vs set ⇒ the field');
  ok(PL.fleetWords(['relayUrl'], mR) === `relay page changed (now ${MINE})` && PL.fleetWords(['relayUrl'], mB) === 'relay page changed (now none)' && /unset — the environment is the fallback/.test(PL.fleetWords(['relayUrl'], null)), 'fleetWords: «relay page changed (now <page> | none | unset — the environment is the fallback)»');

  // ORCH over the kubelet's shape
  const dir = path.join(ROOT, 'fleet');
  const ROWS = { 'gdrive-clients.json': [g('org1', SECRET_A, 'Org')] };
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY1 } });
  const cap = capture();
  const r = CP.create({ dir, log: cap.log, debounceMs: 30, pollMs: 250 });
  ok(JSON.stringify(r.fleet()) === JSON.stringify({ relayUrl: RELAY1 }) && r.status().present.fleet === true, 'boot read: fleet() = the cluster\'s facts (a copy), status().present.fleet');
  ok(cap.lines.length === 1 && cap.lines[0].includes(`relay page ${RELAY1}`) && !cap.lines.some((l) => /ignored/.test(l)), `boot says the relay page beside the rows; fleet.json is NOT a stray: ${cap.lines[0]}`);
  const f0 = r.fleet(); f0.relayUrl = 'mutated';
  ok(r.fleet().relayUrl === RELAY1, 'fleet() hands out a copy');
  const changes = []; r.onChange((c) => changes.push(c));
  await r.start();
  cap.lines.length = 0;
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY2 } });
  await until(() => changes.length >= 1, 3000);
  const ln = cap.lines.filter((l) => /\[presets\] changed/.test(l));
  ok(changes.length === 1 && changes[0].kinds.join() === 'fleet' && r.fleet().relayUrl === RELAY2 && ln.length === 1 && ln[0].endsWith(`relay page changed (now ${RELAY2})`), `a Secret edit of fleet.json is seen ONCE, the change names kind fleet, ONE journal line: ${ln[0]}`);
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY2 }, 'override/fleet.json': { relayUrl: MINE } });
  await until(() => changes.length >= 2, 3000);
  ok(r.fleet().relayUrl === MINE && changes[1].kinds.join() === 'fleet' && changes[1].sources.includes('fleet'), 'the release\'s override/fleet.json wins over the cluster\'s (like the rows)');
  const n2 = changes.length;
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY2 }, 'override/fleet.json': { relayUrl: MINE } });
  await r.reload();                                   // single flight: answers once the swapped tree has been read
  ok(changes.length === n2, 'a swap with the same content fires nothing');
  cap.lines.length = 0;
  project(dir, { ...ROWS, 'fleet.json': '{"relayUrl": "https://x/",', 'override/fleet.json': { relayUrl: MINE } });
  await until(() => cap.lines.some((l) => /could not be read/.test(l)), 3000);
  ok(r.fleet().relayUrl === MINE && cap.lines.filter((l) => /fleet\.json could not be read \(unparseable/.test(l)).length === 1 && r.status().errors.some((e) => e.file === 'fleet.json' && e.kept === true), 'a malformed fleet.json keeps the previous facts, ONE line, the typed error (kept)');
  cap.lines.length = 0;
  project(dir, { ...ROWS, 'fleet.json': '[]' });
  await until(() => cap.lines.some((l) => /not-an-object/.test(l)), 3000);
  ok(cap.lines.some((l) => /fleet\.json could not be read \(not-an-object: the top level must be a JSON object\)/.test(l)), 'a fleet.json whose top level is not an object: named not-an-object');
  cap.lines.length = 0;
  const BAD = 'http://admin.fleet.example.test/relay/?k=SECRETISH';
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: BAD } });
  await until(() => cap.lines.some((l) => /not a relay page address/.test(l)), 3000);
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: BAD }, 'integrations.json': '[]' });
  await r.reload();
  const badL = cap.lines.filter((l) => /not a relay page address/.test(l));
  ok(badL.length === 1 && !badL[0].includes('SECRETISH') && /\[presets\] fleet\.json: relayUrl is not a relay page address/.test(badL[0]), `a relayUrl that is no relay page address is said ONCE across swaps, never its value: ${badL[0]}`);
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY1 } });
  await until(() => r.fleet() && r.fleet().relayUrl === RELAY1, 3000);
  cap.lines.length = 0;
  project(dir, { ...ROWS });
  await until(() => r.fleet() === null, 3000);
  ok(r.fleet() === null && r.status().present.fleet === false && cap.lines.some((l) => /relay page changed \(now unset — the environment is the fallback\)/.test(l)), 'the Secret lost its fleet key ⇒ fleet() null (the caller\'s fallback), said');
  r.stop();
  // CONTROL: a merge reading the layers in the wrong order — the cluster wins over the release
  const srcP = fs.readFileSync(path.join(REPO, 'src/preset-layers.js'), 'utf-8');
  const a5 = "    for (const k of FLEET_FIELDS) if (typeof f[k] === 'string') { facts[k] = f[k]; layerOf[k] = layer; }";
  ok(srcP.includes(a5), 'control anchor: the per-field write');
  const rev = M.load('src/preset-layers.js', srcP.replace(a5, "    for (const k of FLEET_FIELDS) if (typeof f[k] === 'string' && !(k in facts)) { facts[k] = f[k]; layerOf[k] = layer; }"), 'fleet-first-wins');
  ok(rev.mergeFleet({ cluster: { relayUrl: RELAY1 }, release: { relayUrl: MINE } }).facts.relayUrl === RELAY1, 'CONTROL: a merge where the first layer read keeps its field lets the CLUSTER win — the override assert above is red on it');
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 8 })) ok(row.pass, row.name, row.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
