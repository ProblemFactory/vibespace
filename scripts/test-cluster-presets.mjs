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
// §6 lane engine-plugin: fleet.json `browserEngine` (the chart's customBrowser) — parsed, merged as ONE field, diffed by value,
//    said without its addresses; the live reader sees a flip once.
// §5 THE FLEET FACTS — fleet.json (lane oauth-relay-one-source, 2026-10-23 — the owner: «你为啥搞了两套分发 auth client
//    的方案»: the Google client rows were presets files, live; the relay page a chart env, at restart): PURE parseFleet /
//    mergeFleet (per FIELD: the release's field wins, '' included; a field neither names is absent) / diffFleet /
//    fleetWords; ORCH over the kubelet's shape: the boot read + its line, a swap seen ONCE with «relay page changed (now
//    …)», the override wins, a same-content swap fires nothing, a malformed or non-object file keeps the previous facts
//    (one line), a relayUrl that is no relay page address said ONCE (never the value), the file withdrawn ⇒ null (the
//    env fallback), fleet.json no longer a stray. CONTROL: a merge reading the layers in the wrong order lets the
//    cluster win.
// B-e0d1 (end of file): THE DROPLINE CLUSTER PRESET RESOLVES — the real store over a scratch data dir: the Connect plan takes the
//   preset's client id and its relay page beside the hub's own https; no preset ⇒ unchanged; ONE PAIR, NEVER MIXED (batch 11
//   cure): the person's own relay page beside the preset ⇒ the person's values alone (no preset client id), with a planted
//   mixed answer as the leg's control
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  const ints = PL.parseIntegrations([{ id: 'lark', values: { appId: 'cli_1', appSecret: 7 } }, { id: 'cloud:browserbase', key: 'k1', label: 'L', values: { apiKey: 'cb_x' } }, { values: {} }, { id: 'x' }, null]);
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
  const im = PL.mergeLayers('integrations', { cluster: PL.parseIntegrations([{ id: 'lark', values: { appId: 'a', appSecret: 'x' } }, { id: 'cloud:browserbase', values: { apiKey: 'cb_1' } }]), release: PL.parseIntegrations([{ id: 'lark', values: { appId: 'b', appSecret: 'y' } }]) });
  ok(im.entries.length === 2 && im.entries[0].values.appId === 'b' && im.entries[1].id === 'cloud:browserbase', 'integrations: the identity is row id + preset key — the release\'s lark/default replaces the cluster\'s, cloak/default (same key, another row) stays');
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
  ok(none.none && none.text === 'Company presets: none.', `no presets ⇒ "${none.text}"`);
  const sum = PL.summarize({ dir: '/etc/vibespace/presets', updatedAt: 1000, items: [{ kind: 'gdrive', source: 'cluster', n: 3 }, { kind: 'lark', source: 'cluster', n: 1 }, { kind: 'gdrive', source: 'release', n: 1 }, { kind: 'cloud:browserbase', source: 'env', n: 1 }, { kind: 'lark', source: 'release', n: 0 }] });
  const line = PL.presetsLine(sum, { t, ago, now: 1000 + 120000 });
  ok(line.text === 'Company presets: 3 Google clients, 1 Lark app — from the cluster, updated 2 min ago; 1 Google client — from this release’s own values, updated 2 min ago; Browserbase (cloud browser) key — from the environment (a restart is needed to change them)', `the brief's sentence, per source: "${line.text}"`);
  ok(sum.groups.map((x) => x.source).join() === 'cluster,release,env' && !sum.groups.some((x) => x.items.some((i) => i.n === 0)), 'summarize keeps the source order and drops zero counts');
  const errs = PL.presetsLine(PL.summarize({ items: [{ kind: 'gdrive', source: 'cluster', n: 1 }], errors: [{ layer: 'release', file: 'integrations.json', code: 'unparseable', kept: true }, { layer: 'cluster', file: 'gdrive-clients.json', code: 'too-large', kept: false }] }), { t });
  ok(errs.errors.length === 2 && /override\/integrations\.json.*previous presets are kept/.test(errs.errors[0]) && /gdrive-clients\.json.*no presets until it is fixed/.test(errs.errors[1]), 'an unreadable file is SAID — kept (it had presets) or offering none (it never read)');
  ok(PL.itemWords({ kind: 'cloud:browserbase', n: 2 }, { t }) === `2 ${R.rowById('cloud:browserbase').label} keys`, 'a browser key row is worded by its registry label');

  // CONTROLS: the per-key merge is the property — a whole-file override and a wrong layer order are both red
  const src = fs.readFileSync(path.join(REPO, 'src/preset-layers.js'), 'utf-8');
  const wholeFile = M.load('src/preset-layers.js', editAnchor(src, "  const present = LAYERS.filter((l) => Array.isArray(layers[l]));", "  if (Array.isArray(layers.release)) layers = { release: layers.release };\n  const present = LAYERS.filter((l) => Array.isArray(layers[l]));", "src/preset-layers.js"), 'wholefile');
  const wf = wholeFile.mergeLayers('gdrive', { cluster: cl, release: rel });
  ok(wf.entries.map((e) => e.key).join() !== 'org1,org2,channels,extra' && !wf.entries.some((e) => e.key === 'org1'), 'CONTROL: a whole-file override (the release file replaces the cluster file) HIDES the company\'s org1 + channels — the per-key assert above is red on it');
  const wrongOrder = M.load('src/preset-layers.js', editAnchor(src, "const LAYERS = Object.freeze(['cluster', 'release']);", "const LAYERS = Object.freeze(['release', 'cluster']);", "src/preset-layers.js"), 'order');
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
  const dropper = M.load('src/server/cluster-presets.js', editAnchor(srcR, anchor, anchor + '\n      slot.list = null;', "src/server/cluster-presets.js"), 'drop');
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
  const okWords = anyEntry ? (!line.none && /from the cluster/.test(line.text) === wantCluster && /from this release/.test(line.text) === wantRelease && !/from the environment/.test(line.text)) : (line.none && /^Company presets: none\.$/.test(line.text));
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
    const envI = state === 'present' ? JSON.stringify([{ id: 'cloud:browserbase', values: { apiKey: SENT.env.integrations } }]) : state === 'malformed' ? `[{"id":"cloud:browserbase","values":{"apiKey":"${SENT.env.integrations}"}},]` : undefined;
    const lines = []; const st = IS.create({ dataDir, env: envI === undefined ? {} : { VIBESPACE_INTEGRATIONS: envI }, presets: none, log: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) } });
    const res = st.resolveIntegration('cloud:browserbase');
    return { d, res, errs: errs.slice(), lines };
  };
  const p = envCell('present');
  ok(p.d.length === 1 && p.d[0].clientSecret === SENT.env.gdrive && p.res.source === 'cluster' && p.res.values.apiKey === SENT.env.integrations, 'env=present, directory silent: Google clients from VIBESPACE_GDRIVE_CLIENTS, the cloak row from VIBESPACE_INTEGRATIONS (source cluster)');
  const a = envCell('absent');
  ok(a.d.length === 0 && a.res.source === 'none' && a.res.whyCode === 'no-preset', 'env=absent, directory silent: no Google client, the row says no-preset (the dialogs: your own client)');
  const m = envCell('malformed');
  console.error = prevErr;                      // the captures are over — ok()'s own ✗ goes to stderr again
  ok(m.d.length === 0 && m.res.source === 'none' && m.errs.length === 1 && m.lines.some((l) => /unparseable|not valid JSON/.test(l)) && !leaks([m.errs, m.lines]).length, 'env=malformed: [] / none, ONE line each, no bytes of the secret');
  // the directory ANSWERS ⇒ the env is not consulted, even when it speaks
  process.env.VIBESPACE_GDRIVE_CLIENTS = JSON.stringify([g('ek', SENT.env.gdrive)]);
  const spoken = CP.create({ dir: cellDir({ cluster: 'present', release: 'absent' }), log: quiet.log });
  CP.setSharedPresets(spoken);
  const d2 = MountManager.drivePresets();
  const st2 = IS.create({ dataDir: path.join(ROOT, 'cell-env-spoken'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'cloud:browserbase', values: { apiKey: SENT.env.integrations } }]) }, presets: spoken, log: quiet.log });
  ok(d2.map((x) => x.key).join() === 'k' && d2[0].clientSecret === SENT.cluster.gdrive && st2.resolveIntegration('cloud:browserbase').source === 'none' && st2.resolveIntegration('lark', { credentialKey: 'cluster:k' }).values.appSecret === SENT.cluster.integrations, 'the directory answers ⇒ the env is NOT consulted for that kind (one rung, never a mix): the env\'s ek and its cloak key are invisible');

  // THE USER'S OWN KEY WINS — AT THE CONSUMER
  const own = MountManager._driveClient({ clientId: 'mine.apps.googleusercontent.com', clientPreset: 'k' });
  const preset = MountManager._driveClient({ clientPreset: 'k' });
  ok(own === null && preset && preset.clientSecret === SENT.cluster.gdrive, 'Drive: a record with its OWN client id gets no preset (null = its own is used) while the same preset key resolves for a record without one');
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  ok(msrc.includes("let cid = clientId, csec = clientSecret;\n      if (!cid) { const pc = MountManager.pickerClient(this, tok, clientPreset);") && msrc.includes("const pc = MountManager._driveClient({ clientPreset: clientPreset || null });\n    const si = MountManager.signInOf(x, tok);") && msrc.includes('if (m.clientId) return null; // custom client on the record itself'), 'WIRING: the Drive connect path asks the preset (_driveClient, through B-e40d\'s pickerClient — its sign-in\'s client only after a swap) only without an own client id, and _driveClient yields to a record\'s own id');
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
  const leaky = M.load('src/server/cluster-presets.js', editAnchor(srcR, a1, "try { parsed = JSON.parse(text); } catch (e) { return { error: { code: 'unparseable', detail: e.message } }; }", "src/server/cluster-presets.js"), 'leaky');
  const lcap = capture(); leaky.create({ dir: cellDir({ cluster: 'malformed', release: 'absent' }), log: lcap.log });   // the table's `},]` bytes: V8 quotes the 10 bytes before the token
  ok(leaks(lcap.lines).length > 0, 'CONTROL: a copy that logs e.message prints the secret\'s bytes — the never-a-value assert is red on it');
  // a torn read published: no post-read re-check
  const a2 = "      if (after === sig) { outs = read; break; }";
  ok(srcR.includes(a2), 'control anchor: the post-read signature re-check');
  const torn = M.load('src/server/cluster-presets.js', editAnchor(srcR, a2, "      outs = read; break;", "src/server/cluster-presets.js"), 'torn');
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
  const mute = M.load('src/server/cluster-presets.js', editAnchor(srcR, a3, "    if (false) log.warn(", "src/server/cluster-presets.js"), 'mute');
  const mcap = capture(); mute.create({ dir: cellDir({ cluster: 'present', release: 'absent' }, { 'browser-keys.json': '[]' }), log: mcap.log });
  ok(!mcap.lines.some((l) => /ignored/.test(l)), 'CONTROL: a copy that never says a stray file ignores browser-keys.json in silence — the future-key assert is red on it');
  // the consumer substituting a preset for the user's own client
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  const a4 = "    if (m.clientId) return null; // custom client on the record itself\n";
  ok(msrc.includes(a4), 'control anchor: _driveClient yields to the record\'s own client');
  const subst = M.load('src/mounts.js', editAnchor(msrc, a4, '', "src/mounts.js"), 'subst');
  const prevShared = CP.setSharedPresets(CP.create({ dir: cellDir({ cluster: 'present', release: 'absent' }), log: capture().log }));
  const got = subst.MountManager._driveClient({ clientId: 'mine.apps.googleusercontent.com', clientPreset: 'k' });
  CP.setSharedPresets(prevShared);
  ok(got && got.clientSecret === SENT.cluster.gdrive, 'CONTROL: a _driveClient without the own-client rule hands the PRESET to a record that has its own client — the user-wins assert is red on it');
  // the watch's failure freezing the presets: no poll after a refused watch
  const a5 = "    } catch (e) { log.warn(`[presets] cannot watch ${dir} (${e && e.code}) — polling every ${Math.round(pollMs / 1000)} s`); }\n    poll = setInterval(() => { reload(); }, pollMs);";
  ok(srcR.includes(a5), 'control anchor: the poll starts whatever the watch did');
  const frozen = M.load('src/server/cluster-presets.js', editAnchor(srcR, a5, "    } catch (e) { log.warn(`[presets] cannot watch ${dir} (${e && e.code})`); return; }\n    poll = setInterval(() => { reload(); }, pollMs);", "src/server/cluster-presets.js"), 'frozen');
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
  const valuesOnly = M.load('src/server/cluster-presets.js', editAnchor(srcR, a6, '    const sources = [];', "src/server/cluster-presets.js"), 'valuesonly');
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
  const bare = SRC.includes(LINE) ? M.load('src/server/integration-store.js', editAnchor(SRC, LINE, 'const legacyIdsOf = () => [];', "src/server/integration-store.js"), 'no-legacy') : null;
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
  const a5 = "    for (const k of FLEET_FIELDS) if (fleetValueOk(k, f[k])) { facts[k] = k === 'browserEngine' ? parseBrowserEngineFact(f[k]) : f[k]; layerOf[k] = layer; }"; // lane engine-plugin: the write per field, + the engine fact
  ok(srcP.includes(a5), 'control anchor: the per-field write');
  const rev = M.load('src/preset-layers.js', editAnchor(srcP, a5, "    for (const k of FLEET_FIELDS) if (fleetValueOk(k, f[k]) && !(k in facts)) { facts[k] = k === 'browserEngine' ? parseBrowserEngineFact(f[k]) : f[k]; layerOf[k] = layer; }", "src/preset-layers.js"), 'fleet-first-wins');
  ok(rev.mergeFleet({ cluster: { relayUrl: RELAY1 }, release: { relayUrl: MINE } }).facts.relayUrl === RELAY1, 'CONTROL: a merge where the first layer read keeps its field lets the CLUSTER win — the override assert above is red on it');
}

// §6 lane engine-plugin (design-custom-browser-plugin §1.4): fleet.json `browserEngine` — the fleet's custom browser kernel
console.log('§6 fleet.json browserEngine — the fleet\'s custom browser kernel rides the same layers');
{
  const EID = 'vibespace.custom-browser', SHA = 'cd'.repeat(32);
  const full = { plugin: EID, default: true, source: { git: 'git@git.example.test:fleet/k.git', ref: 'main' }, kernel: { url: 'https://dl.example.test/k.tar.zst', sha256: SHA.toUpperCase() } };
  const p = PL.parseFleet({ browserEngine: full, relayUrl: ' https://admin.fleet.example.test/relay/ ' });
  ok(p.browserEngine && p.browserEngine.plugin === EID && p.browserEngine.default === true && p.browserEngine.kernel.sha256 === SHA && p.relayUrl === 'https://admin.fleet.example.test/relay/', 'parseFleet: browserEngine normalized beside relayUrl (the sha256 lower-cased)', p);
  const bad = [PL.parseFleet({ browserEngine: { plugin: 'Not An Id', default: true } }), PL.parseFleet({ browserEngine: 'yes' }), PL.parseFleet({ browserEngine: { default: true } })];
  const odd = PL.parseFleet({ browserEngine: { plugin: EID, default: 'true', kernel: { sha256: 'xyz' }, source: 7 } }).browserEngine;
  const long = PL.parseFleet({ browserEngine: { plugin: EID, kernel: { sha256: 'a'.repeat(65), url: 7 } } }).browserEngine;
  ok(bad.every((x) => !('browserEngine' in x)) && odd.default === false && odd.kernel.sha256 === 'xyz' && odd.source.git === '' && long.kernel.sha256 === 'a'.repeat(65) && long.kernel.url === '7',
    'a value of another shape is not named (no plugin id ⇒ no fact); default only when true; a malformed source reads empty — the KERNEL fields are kept AS NAMED (engine-distribution round 3): a malformed sha256 is the install\'s refusal by name (engine_sha_malformed), never blanked into the package\'s, nor clipped to 64 into a valid-looking pin', { bad, odd, long });
  const mC = PL.mergeFleet({ cluster: { browserEngine: p.browserEngine }, release: null });
  const mR = PL.mergeFleet({ cluster: { browserEngine: p.browserEngine }, release: PL.parseFleet({ browserEngine: { plugin: EID, default: false } }) });
  ok(mC.facts.browserEngine.default === true && mC.layerOf.browserEngine === 'cluster' && mR.facts.browserEngine.default === false && mR.layerOf.browserEngine === 'release' && mR.facts.browserEngine.kernel.url === '', 'mergeFleet: ONE field — the release\'s object replaces the cluster\'s whole (its kernel included)');
  ok(PL.diffFleet(mC, PL.mergeFleet({ cluster: { browserEngine: PL.parseFleet({ browserEngine: full }).browserEngine } })).length === 0 && PL.diffFleet(mC, mR).join() === 'browserEngine' && PL.diffFleet(null, mC).join() === 'browserEngine', 'diffFleet compares the object by value (the same content ⇒ no change, a flip ⇒ browserEngine)');
  const w = PL.fleetWords(['browserEngine'], mR);
  ok(w === `browser engine changed (now ${EID}, not the default)` && !/git@|https:/.test(PL.fleetWords(['browserEngine'], mC)), 'fleetWords: «browser engine changed (now <plugin>, …)» — never its source or kernel address', w);
  const dir = path.join(ROOT, 'fleet-engine');
  const ROWS = { 'gdrive-clients.json': [g('org1', SECRET_A, 'Org')] };
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: 'https://admin.fleet.example.test/relay/', browserEngine: full } });
  const cap = capture();
  const r = CP.create({ dir, log: cap.log, debounceMs: 30, pollMs: 250 });
  ok(r.fleet() && r.fleet().browserEngine && r.fleet().browserEngine.default === true && cap.lines.some((l) => l.includes(`browser engine ${EID} (the default of new browsers)`)) && !cap.lines.some((l) => /git@|dl\.example/.test(l)), `boot read: fleet() carries the engine fact; the boot line names it (never its addresses): ${cap.lines[0]}`);
  const changes = []; r.onChange((c) => changes.push(c));
  await r.start();
  cap.lines.length = 0;
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: 'https://admin.fleet.example.test/relay/', browserEngine: { ...full, default: false } } });
  await until(() => changes.length >= 1, 3000);
  const ln = cap.lines.filter((l) => /\[presets\] changed/.test(l));
  ok(changes.length === 1 && r.fleet().browserEngine.default === false && ln.length === 1 && ln[0].endsWith(`browser engine changed (now ${EID}, not the default)`), 'a flip of the Secret is seen ONCE, live (no restart), said by plugin id + whether it is the default', ln);
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: 'https://admin.fleet.example.test/relay/' } });
  await until(() => changes.length >= 2, 3000);
  ok(!('browserEngine' in r.fleet()) && r.fleet().relayUrl === 'https://admin.fleet.example.test/relay/', 'the key dropped ⇒ the fact absent (the policy falls back to the user\'s value or the default), the relay page untouched');
  r.stop();
  // lane engine-distribution: + `preinstall` (true only when true) — and the Plugin Git credential rides the SAME layers
  ok(PL.parseFleet({ browserEngine: { ...full, preinstall: true } }).browserEngine.preinstall === true && PL.parseFleet({ browserEngine: { ...full, preinstall: 'true' } }).browserEngine.preinstall === false && PL.parseFleet({ browserEngine: full }).browserEngine.preinstall === false,
    'parseFleet: browserEngine.preinstall is true only when true (the boot job downloads the kernel right away), else false (at its first use)');
  const gdir = path.join(ROOT, 'fleet-plugin-git');
  const TOK = ['fleet', 'pat', 'x9Qe', 'Zt41'].join('-'); // built at runtime, never one literal
  project(gdir, { ...ROWS, 'integrations.json': [{ id: 'plugin-git', key: 'default', label: 'Fleet git', values: { host: 'git.example.test', token: TOK } }] });
  const rg = CP.create({ dir: gdir, log: capture().log, debounceMs: 30, pollMs: 250 });
  const gdata = path.join(ROOT, 'fleet-plugin-git-data'); fs.mkdirSync(gdata, { recursive: true });
  const st = IS.create({ dataDir: gdata, env: {}, presets: rg, log: { log() {}, warn() {}, error() {} } });
  const res = st.resolveIntegration('plugin-git'), pv = st.publicView('plugin-git');
  ok(res.source === 'cluster' && res.values.host === 'git.example.test' && res.values.token === TOK && pv.source === 'cluster' && !JSON.stringify(pv).includes(TOK) && pv.values.host === 'git.example.test',
    'the presets\' integrations.json ships the plugin-git credential to every pod: the store resolves it from the cluster layer (the installer\'s one road), its card shows the host — the token never', { source: res.source, card: pv.values });
  rg.stop();
}

// §7 lane fleet-plugin-catalog (the owner 2026-11-05: 「内核不是插件吗？把内核那套放到 admin 里」): the fleet's engine plugin lives in
// the CLUSTER layer (the admin's Secret) first; a release override may still pin its own. The cluster alone, the override alone,
// both (the override's browserEngine wins as ONE field — a plugin sha and its kernel are a pair; the relay page beside it still
// merges by itself), and a pin change seen live with the field named («browser engine changed»).
console.log('§7 fleet.json browserEngine — the cluster layer, the override, both; a new pin is a change event');
{
  const EID = 'vibespace.custom-browser';
  const pin = (ref, over = {}) => ({ plugin: EID, default: true, preinstall: false, source: { git: 'https://git.fleet.example.test/acme/engine.git', ref }, kernel: { url: '', sha256: '' }, ...over });
  const S1 = 'a1'.repeat(20), S2 = 'b2'.repeat(20), SR = 'c3'.repeat(20);
  const ROWS = { 'gdrive-clients.json': [g('org1', SECRET_A, 'Org')] };
  const RELAY = 'https://admin.fleet.example.test/relay/';
  const read = (files) => { const d = fs.mkdtempSync(path.join(ROOT, 'fpc-')); project(d, { ...ROWS, ...files }); const r = CP.create({ dir: d, log: capture().log }); const out = r.fleet(); r.stop(); return out; };
  const onlyCluster = read({ 'fleet.json': { relayUrl: RELAY, browserEngine: pin(S1) } });
  const onlyRelease = read({ 'override/fleet.json': { browserEngine: pin(SR, { default: false }) } });
  const both = read({ 'fleet.json': { relayUrl: RELAY, browserEngine: pin(S1, { preinstall: true }) }, 'override/fleet.json': { browserEngine: pin(SR, { default: false }) } });
  ok(onlyCluster.browserEngine.source.ref === S1 && onlyCluster.browserEngine.default === true && onlyCluster.relayUrl === RELAY, 'the CLUSTER layer alone (the admin\'s Secret) names the engine plugin at its pin — every pod reads it');
  ok(onlyRelease.browserEngine.source.ref === SR && !('relayUrl' in onlyRelease), 'the release override alone (the chart\'s customBrowser) still pins ONE pod');
  ok(both.browserEngine.source.ref === SR && both.browserEngine.default === false && both.browserEngine.preinstall === false && both.relayUrl === RELAY,
    'both: the override\'s browserEngine wins as ONE field (its pin, default and preinstall — never the cluster\'s preinstall mixed into the release\'s pin); the cluster\'s relay page beside it stays', both);
  const mB = PL.mergeFleet({ cluster: PL.parseFleet({ relayUrl: RELAY, browserEngine: pin(S1) }), release: PL.parseFleet({ browserEngine: pin(SR) }) });
  ok(mB.layerOf.browserEngine === 'release' && mB.layerOf.relayUrl === 'cluster', 'per FIELD: browserEngine from the release, relayUrl from the cluster', mB.layerOf);
  const dir = path.join(ROOT, 'fleet-pin');
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY, browserEngine: pin(S1) } });
  const cap = capture();
  const r = CP.create({ dir, log: cap.log, debounceMs: 30, pollMs: 250 });
  const changes = []; r.onChange((c) => changes.push(c));
  await r.start();
  cap.lines.length = 0;
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY, browserEngine: pin(S2) } });
  await until(() => changes.length >= 1, 3000);
  const ln = cap.lines.filter((l) => /\[presets\] changed/.test(l));
  ok(changes.length === 1 && changes[0].kinds.join() === 'fleet' && r.fleet().browserEngine.source.ref === S2 && ln.length === 1 && ln[0].endsWith(`browser engine changed (now ${EID}, the default of new browsers)`) && !/git\.fleet|a1a1|b2b2/.test(ln[0]),
    'the admin\'s new pin in the cluster Secret is ONE change event (kind fleet), live, the field named «browser engine changed» — never its address or sha in the journal', ln);
  project(dir, { ...ROWS, 'fleet.json': { relayUrl: RELAY, browserEngine: pin(S2) }, 'override/fleet.json': { browserEngine: pin(S2) } });
  await until(() => changes.length >= 2, 3000);
  ok(changes.length === 2 && changes[1].kinds.length === 0 && changes[1].sources.includes('fleet') && !cap.lines.some((l, i) => i > 0 && /\[presets\] changed/.test(l) && l !== ln[0]),
    'an override equal to the cluster\'s pin moves only the layer (sources: fleet, no kind) — no «changed» line, so the engine job sees no new pin', { kinds: changes[1] && changes[1].kinds, sources: changes[1] && changes[1].sources });
  r.stop();
}

// B-e0d1: THE DROPLINE CLUSTER PRESET RESOLVES — the real store over a scratch data dir, the preset in the environment's
// single-field form (VIBESPACE_INTEGRATION_DROPLINE_*): the Connect plan takes its client id and its relay page
{
  const DO = require(path.join(REPO, 'src/server/dropline-oauth.js'));
  const quiet = capture();
  const empty = CP.create({ dir: path.join(ROOT, 'dl-none'), log: quiet.log });
  const mk = (env, tag) => { const dataDir = path.join(ROOT, 'dl-' + tag); fs.mkdirSync(dataDir, { recursive: true }); return IS.create({ dataDir, env, presets: empty, log: quiet.log }); };
  const planOf = (st, url = 'https://hub.example.ts.net') => DO.create({ client: {}, flows: {}, integrations: () => st, instanceUrl: () => url, tokens: {} }).callbackPlan();
  const CID = 'dlclient' + 'Cluster01', RL = 'https://relay.example.test/relay/';
  const withPreset = mk({ VIBESPACE_INTEGRATION_DROPLINE_CLIENTID: CID, VIBESPACE_INTEGRATION_DROPLINE_RELAYURL: RL }, 'preset');
  const p = planOf(withPreset);
  ok(p.clientId === CID && p.preset === true && p.via === 'relay' && p.redirectUri === RL, 'B-e0d1: a fleet Dropline preset RESOLVES — the Connect plan takes the preset\'s client id and sends the browser to ITS relay page (the client is registered there), even beside the hub\'s own https', JSON.stringify(p));
  const noPreset = planOf(mk({}, 'bare'));
  ok(noPreset.clientId === '' && noPreset.preset === false && noPreset.via === 'own-https', 'B-e0d1: …with no preset nothing changes: no client id, the hub\'s own https address', JSON.stringify(noPreset));
  // ONE PAIR, NEVER MIXED: the person saved their own relay page on a cluster that has a preset — the person's values outrank
  // the WHOLE preset (the store's precedence), so the plan carries no preset client id beside the person's page
  const OWN = 'https://own.example.test/relay/';
  const mixedStore = mk({ VIBESPACE_INTEGRATION_DROPLINE_CLIENTID: CID, VIBESPACE_INTEGRATION_DROPLINE_RELAYURL: RL }, 'mixed');
  mixedStore.setIntegration('dropline', { relayUrl: OWN });
  const onePair = (q) => q.clientId === '' && q.preset === false && q.relayUrl === OWN && q.via === 'own-https' && /^https:\/\/hub\.example\.ts\.net\//.test(q.redirectUri || '');
  const m = planOf(mixedStore);
  ok(onePair(m), 'B-e0d1: ONE PAIR, NEVER MIXED — the person\'s own relay page beside a preset gives the person\'s values alone: no preset client id, preset false', JSON.stringify(m));
  ok(!onePair({ ...m, clientId: CID, preset: true }), 'CONTROL: a mixed answer (the preset\'s client id beside the person\'s page — a per-field merge) fails that leg');
  // B-1e9a (1): AN apiKey-ONLY PRESET KEEPS ITS KEY THROUGH CONNECT — the first Connect self-registers a client; written as the
  // person's row it outranked the WHOLE preset (resolvePrecedence: one pair, never merged) and the cluster's key stopped resolving.
  // The hub's own client now sits beside the tokens; a second Connect reuses it (no second registration)
  const KEY = ['dl', 'clusterKey' + 'Abc123'].join('_');
  const startWorld = (mod, st) => {
    let regs = 0, tok = null;
    const tokens = { read: () => tok, write: (v) => { tok = v; }, clear: () => { tok = null; } };
    const door = mod.create({ client: { register: async () => ({ clientId: 'selfreg' + 'Client' + String(++regs).padStart(2, '0') }), authorizeUrl: () => 'https://consent.example.test/' }, flows: { begin: async () => ({ flowId: 'f1', consentUrl: 'https://consent.example.test/' }) }, integrations: () => st, instanceUrl: () => 'https://hub.example.ts.net', tokens });
    return { door, regs: () => regs, tok: () => tok };
  };
  const keyAfter = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, tag), w = startWorld(mod, st);
    const before = st.resolveIntegration('dropline');
    const s1 = await w.door.start({}), s2 = await w.door.start({});
    const after = st.resolveIntegration('dropline');
    return { started: s1.ok && s2.ok, regs: w.regs(), kept: (w.tok() || {}).registeredClientId || null, before: before.source + ':' + !!(before.values || {}).apiKey, after: after.source + ':' + ((after.values || {}).apiKey === KEY) };
  };
  const ka = await keyAfter(DO, 'keyonly');
  ok(ka.started && ka.before === 'cluster:true' && ka.after === 'cluster:true' && ka.regs === 1 && /^selfregClient01$/.test(ka.kept || ''),
    'B-1e9a: an apiKey-only cluster preset — two Connects: ONE registration, the hub\'s client kept beside the tokens, and the cluster\'s key STILL resolves (never the person\'s row over the preset)', ka);
  const DOSRC = fs.readFileSync(path.join(REPO, 'src/server/dropline-oauth.js'), 'utf8');
  const oldWrite = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "        if (plan.source !== 'cluster' && st && typeof st.setIntegration === 'function') st.setIntegration(KIND, { clientId });", "        if (st && typeof st.setIntegration === 'function') st.setIntegration(KIND, { clientId });", 'B-1e9a: the person\'s row written over a preset'), 'dl-oldwrite');   // stale-pins: kept — a RED control: the old road (the person's row written over a preset) restored on purpose
  const kr = await keyAfter(oldWrite, 'keyonly-red');
  ok(kr.after !== 'cluster:true', 'RED control: the registration written as the person\'s row (the old road) ⇒ the cluster\'s key no longer resolves after the first Connect', kr);
  // B-1e9a (2): A FLEET CLIENT WITH NO RELAY PAGE — the plan sent the vendor to this pod's own https (a callback the fleet's client
  // was never registered for): no Connect now, nothing registered, and the card's reason names the operator's mistake
  const relayLess = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_CLIENTID: CID }, tag), w = startWorld(mod, st);
    const plan = w.door.callbackPlan(), why = w.door.connectWhy(), r = await w.door.start({});
    return { via: plan.via, redirectUri: plan.redirectUri, why, ok: r.ok, code: r.connectWhy || null, routeCode: r.why || null, message: r.message || '', regs: w.regs() };
  };
  const rl = await relayLess(DO, 'norelay');
  ok(rl.via === null && rl.redirectUri === null && rl.why === 'preset-no-relay' && rl.ok === false && rl.code === 'preset-no-relay' && rl.routeCode === 'preset-no-relay' && /Dropline preset a relayUrl \(or the fleet a relay page\)/.test(rl.message) && rl.regs === 0,
    'B-1e9a: a fleet preset with a client id and NO relay page (none of its own, none of the fleet\'s) ⇒ no Connect (never the pod\'s own https for the fleet\'s client), nothing registered, the reason «preset-no-relay» names the preset\'s relayUrl (or the fleet\'s page) — words true on every deploy road', rl);
  // …the FLEET's sign-in relay page (fleet.json relayUrl; here the chart's last-release env form) serves a preset that names none
  const FR = 'https://fleet-relay.example.test/relay/';
  const fleetRelay = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_CLIENTID: CID, VIBESPACE_OAUTH_RELAY_URL: FR }, tag), w = startWorld(mod, st);
    const plan = w.door.callbackPlan(), r = await w.door.start({});
    return { via: plan.via, redirectUri: plan.redirectUri, ok: r.ok, regs: w.regs() };
  };
  const fr = await fleetRelay(DO, 'fleetrelay');
  ok(fr.via === 'relay' && fr.redirectUri === FR && fr.ok === true && fr.regs === 0, 'B-1e9a: a preset client with no relay page of its own takes the FLEET\'s sign-in relay page (the one road every integration reads) — Connect runs there, nothing registered', fr);
  const noFleet = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "relayPick({ fleet: String(safeCall(() => (st && typeof st.fleetRelayUrl === 'function' ? st.fleetRelayUrl() : ''), '') || ''), preset:", "relayPick({ fleet: '', preset:", 'B-1e9a: the fleet relay page not read'), 'dl-nofleet');
  const frr = await fleetRelay(noFleet, 'fleetrelay-red');
  ok(frr.via === null && frr.ok === false, 'RED control: without the fleet\'s page that preset is refused although the fleet has a relay page', frr);
  // B-1e9a cure (主开发's must): the fleet's page goes through THE OWNING RULE (consent-road relayPick) — a plain-http fleet page is
  // NO page: the Connect refuses by name (preset-no-relay), never handing http to the vendor as the redirect
  const httpFleet = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_CLIENTID: CID, VIBESPACE_OAUTH_RELAY_URL: 'http://fleet-relay.example.test/relay/' }, tag), w = startWorld(mod, st);
    const plan = w.door.callbackPlan(), r = await w.door.start({});
    return { via: plan.via, redirectUri: plan.redirectUri, ok: r.ok, code: r.why || null, regs: w.regs() };
  };
  const hf = await httpFleet(DO, 'httpfleet');
  ok(hf.via === null && hf.redirectUri === null && hf.ok === false && hf.code === 'preset-no-relay' && hf.regs === 0, 'B-1e9a cure: a PLAIN-HTTP fleet relay page is no page by the owning rule — the Connect refuses by name (preset-no-relay), nothing registered, never http handed to the vendor', hf);
  const rawFleet = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "      ? relayPick({ fleet: String(safeCall(() => (st && typeof st.fleetRelayUrl === 'function' ? st.fleetRelayUrl() : ''), '') || ''), preset: String(preset.relayUrl || '') }).url\n", "      ? (String(preset.relayUrl || '') || String(safeCall(() => st.fleetRelayUrl(), '') || ''))\n", 'B-1e9a cure: the fleet page read raw (a second copy of the rule)'), 'dl-rawfleet');   // stale-pins: kept — a RED control: the raw read restored on purpose
  const hfr = await httpFleet(rawFleet, 'httpfleet-red');
  ok(hfr.via === 'relay' && /^http:\/\//.test(hfr.redirectUri || ''), 'RED control: the fleet page read RAW (a second copy of the rule) hands the vendor a plain-http redirect', hfr);
  // B-1e9a cure: a LOCKED vault at Connect over an apiKey-only preset — the sealed tokens file is read by start(): refused BY NAME
  // (vault-locked) — the parent answered an unnamed 500 with the store's raw sentence (the RED below)
  const lockedAt = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, tag); let regs = 0;
    const tokens = { read: () => { throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); }, write: () => { throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); }, clear: () => { } };
    const door = mod.create({ client: { register: async () => ({ clientId: 'selfreg' + 'Client0' + (++regs) }), authorizeUrl: () => 'https://consent.example.test/' }, flows: { begin: async () => ({ flowId: 'f1', consentUrl: 'u' }) }, integrations: () => st, instanceUrl: () => 'https://hub.example.ts.net', tokens });
    let r; try { r = await door.start({}); } catch (e) { r = { threw: e.code || e.message }; }
    return { ok: r.ok, code: r.why || r.threw || null, regs };
  };
  const la = await lockedAt(DO, 'lockedat');
  ok(la.ok === false && la.code === 'vault-locked' && la.regs === 0, 'B-1e9a cure: a locked vault at Connect over an apiKey-only preset ⇒ refused by name (vault-locked), nothing registered', la);
  const rawRead = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "    try { rec = tokens.read() || {}; } catch (e) { if (locked(e)) return LOCKED; throw e; }\n", "    rec = tokens.read() || {};\n", 'B-1e9a cure: the raw read of the sealed file'), 'dl-rawread');   // stale-pins: kept — a RED control: the parent's raw read restored on purpose
  const lar = await lockedAt(rawRead, 'lockedat-red');
  ok(lar.code === 'vault_locked' && lar.regs === 0, 'RED control: the raw read (the parent) throws the store\'s own error — an unnamed refusal (the route\'s 500), not the card\'s vault-locked', lar);
  // B-1e9a cure: an instance that Connected over an apiKey-only preset BEFORE the fix keeps the person's row {clientId} — the door
  // NAMES it (presetShadowed → the card's one press), and the store's «use the cluster's settings» heals it
  const shadow = (mod, tag, env, ownVals) => { const st = mk(env, tag); if (ownVals) st.setIntegration('dropline', ownVals); return { st, door: startWorld(mod, st).door }; };
  const sh1 = shadow(DO, 'shadow', { VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, { clientId: 'oldClient' + '0001' });
  const named = sh1.door.presetShadowed(); sh1.st.useClusterDefault('dropline');
  const healed = sh1.door.presetShadowed(), back = sh1.st.resolveIntegration('dropline');
  const ownKey = shadow(DO, 'shadow-own', { VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, { apiKey: ['dl', 'ownKey' + 'Xyz789'].join('_') }).door.presetShadowed();
  const noPre = shadow(DO, 'shadow-none', {}, { clientId: 'oldClient' + '0002' }).door.presetShadowed();
  ok(named === 'dropline' && healed === null && back.source === 'cluster' && (back.values || {}).apiKey === KEY && ownKey === null && noPre === null,
    'B-1e9a cure: the person\'s row {clientId} over a preset is NAMED (presetShadowed = the row) and «use the cluster\'s settings» heals it (the cluster\'s key resolves again); the person\'s own key, or no preset, is no such case', { named, healed, back: back.source, ownKey, noPre });
  const anyRow = M.load('src/server/dropline-oauth.js', anchored(DOSRC, " && typeof st.presetsFor === 'function' && st.presetsFor(KIND).length > 0 ? KIND : null;", " ? KIND : null;", 'B-1e9a cure: shadow without asking for a preset'), 'dl-anyrow');
  const nr = shadow(anyRow, 'shadow-none-red', {}, { clientId: 'oldClient' + '0003' }).door.presetShadowed();
  ok(nr === 'dropline', 'RED control: without the preset check a person\'s own client id on a pod with NO preset would be offered «use the cluster\'s settings»', { nr });
  // B-1e9a cure 3 (主开发's must — a vendor call whose result cannot be kept is not made): the vault LOCKED and NO tokens file yet
  // (a fresh instance; after every Disconnect) — the sealed read gives nothing without throwing, so the lock is asked of the
  // file's writer (writable()) BEFORE the register: refused by name, nothing registered at the vendor
  const lockedNoFile = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, tag); let regs = 0;
    const tokens = { read: () => null, writable: () => false, write: () => { throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); }, clear: () => { } };
    const door = mod.create({ client: { register: async () => ({ clientId: 'selfreg' + 'Client0' + (++regs) }), authorizeUrl: () => 'https://consent.example.test/' }, flows: { begin: async () => ({ flowId: 'f1', consentUrl: 'u' }) }, integrations: () => st, instanceUrl: () => 'https://hub.example.ts.net', tokens });
    let r; try { r = await door.start({}); } catch (e) { r = { threw: e.code || e.message }; }
    return { ok: r.ok, code: r.why || r.threw || null, regs };
  };
  const lnf = await lockedNoFile(DO, 'lockednofile');
  ok(lnf.ok === false && lnf.code === 'vault-locked' && lnf.regs === 0, 'B-1e9a cure 3: LOCKED with no tokens file yet ⇒ the Connect is refused by name (vault-locked) BEFORE the vendor\'s register — register count 0', lnf);
  const noAsk = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "    if (tokens && typeof tokens.writable === 'function' && !tokens.writable()) return LOCKED;\n", '', 'B-1e9a cure 3: the lock not asked before the register'), 'dl-noask');
  const lnr = await lockedNoFile(noAsk, 'lockednofile-red');
  ok(lnr.code === 'vault-locked' && lnr.regs === 1, 'RED control: without the ask the vendor registers a client the locked write then throws away (register count 1)', lnr);
  // cure 3 (1): a refresh (or any write) that lands DURING the awaited register is kept — the write reads the record again after it
  const raceAt = async (mod, tag) => {
    const st = mk({ VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, tag); let tok = { refreshedAt: 1 };
    const tokens = { read: () => tok, write: (v) => { tok = v; }, clear: () => { tok = null; } };
    const door = mod.create({ client: { register: async () => { tok = { ...tok, refreshedAt: 2 }; return { clientId: 'selfreg' + 'Race01' }; }, authorizeUrl: () => 'u' }, flows: { begin: async () => ({ flowId: 'f1', consentUrl: 'u' }) }, integrations: () => st, instanceUrl: () => 'https://hub.example.ts.net', tokens });
    const r = await door.start({});
    return { ok: r.ok, refreshedAt: tok.refreshedAt, kept: tok.registeredClientId || null };
  };
  const ra = await raceAt(DO, 'race');
  ok(ra.ok === true && ra.refreshedAt === 2 && ra.kept === 'selfregRace01', 'B-1e9a cure 3: a write landing DURING the register (a refresh) is kept — the registration is written over the record read AFTER the await', ra);
  const staleCopy = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "        const fresh = tokens.read() || {};", "        const fresh = rec;", 'B-1e9a cure 3: the pre-await copy written back'), 'dl-stalecopy');
  const rar = await raceAt(staleCopy, 'race-red');
  ok(rar.refreshedAt === 1 && rar.kept === 'selfregRace01', 'RED control: writing back the copy read BEFORE the await loses the refresh that landed during it', rar);
  // cure 3 (3): the person's OWN relay page goes through the same page check as every other road (relayPageOf: no loopback host,
  // no credentials, no query) — it passed an https prefix test alone (the store's own field rule refuses a query, not a loopback host)
  const OWNPAGE = 'https://own-relay.example.test/relay/';
  const ownPlan = (mod, tag, page) => { const st = mk({}, tag); st.setIntegration('dropline', { relayUrl: page }); return mod.create({ client: {}, flows: {}, integrations: () => st, instanceUrl: () => '', tokens: {} }).callbackPlan(); };
  const op = { good: ownPlan(DO, 'own-good', OWNPAGE), v4: ownPlan(DO, 'own-v4', 'https://127.0.0.1/relay/'), name: ownPlan(DO, 'own-name', 'https://localhost/relay/') };
  ok(op.good.via === 'relay' && op.good.redirectUri === OWNPAGE && op.v4.redirectUri === null && op.name.redirectUri === null, 'B-1e9a cure 3: the person\'s own relay page passes THE page check — a good page is the redirect, a loopback host (127.0.0.1, localhost) is none (no Connect), never handed to the vendor', { good: op.good.redirectUri, v4: op.v4.redirectUri, name: op.name.redirectUri });
  const prefixOnly = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "      : relayPageOf(String(own.relayUrl || preset.relayUrl || ''));", "      : String(own.relayUrl || '').trim() || relayPageOf(preset.relayUrl);", 'B-1e9a cure 3: the own page by a prefix test alone'), 'dl-prefixonly');   // stale-pins: kept — a RED control: the parent's prefix-test line restored on purpose
  const opr = ownPlan(prefixOnly, 'own-v4-red', 'https://127.0.0.1/relay/');
  ok(opr.redirectUri === 'https://127.0.0.1/relay/', 'RED control: the prefix test alone (the parent) hands a loopback page to the vendor as the redirect', { redirectUri: opr.redirectUri });
  // cure 3 (4): SEVERAL cluster settings and none the default — the store refuses «use the cluster's settings» (no-cluster-default);
  // the door gives the card the choices instead (presetChoices: the store has no default to give — publicView clusterAvailable false), and a choice heals the row
  const KEY2 = ['dl', 'clusterKey' + 'Def456'].join('_');
  const two = JSON.stringify([{ id: 'dropline', key: 'teamA', label: 'Team A', values: { apiKey: KEY } }, { id: 'dropline', key: 'teamB', label: 'Team B', values: { apiKey: KEY2 } }]);
  const sh2 = shadow(DO, 'shadow-two', { VIBESPACE_INTEGRATIONS: two }, { clientId: 'oldClient' + '0004' });
  const choices = sh2.door.presetChoices();
  let refused = null; try { sh2.st.useClusterDefault('dropline'); } catch (e) { refused = e.code; }
  sh2.st.setClusterKey('dropline', 'teamB');
  const pickedB = sh2.st.resolveIntegration('dropline'), afterPick = sh2.door.presetChoices();
  const oneCh = shadow(DO, 'shadow-one', { VIBESPACE_INTEGRATION_DROPLINE_APIKEY: KEY }, { clientId: 'oldClient' + '0005' }).door.presetChoices();
  ok(JSON.stringify(choices) === JSON.stringify([{ key: 'teamA', label: 'Team A' }, { key: 'teamB', label: 'Team B' }]) && refused === 'no-cluster-default' && pickedB.source === 'cluster' && (pickedB.values || {}).apiKey === KEY2 && afterPick === null && oneCh === null,
    'B-1e9a cure 3: several cluster settings and none the default ⇒ the press would be refused (no-cluster-default), so the door names the CHOICES (key + label); picking one heals the row (its key resolves); one preset ⇒ no choices (the one press)', { choices, refused, picked: pickedB.source, afterPick, oneCh });
  // cure 3 (the read): ANY «no default» with several settings draws the picker — a saved choice the cluster no longer provides
  // ('preset-gone', reached before the ambiguous rung) is refused by the press just the same; the door reads the store's
  // clusterAvailable, never one of its codes (a stand-in store answering publicView's shape)
  const TWO = [{ key: 'teamA', label: 'Team A' }, { key: 'teamB', label: 'Team B' }];
  const goneSt = { resolveIntegration: () => ({ source: 'user', values: { clientId: 'oldClient' + '0006' } }), presetsFor: () => TWO, publicView: () => ({ clusterAvailable: false, clusterWhyCode: 'preset-gone', clusterOptions: TWO }) };
  const goneOf = (mod) => mod.create({ client: {}, flows: {}, integrations: () => goneSt, instanceUrl: () => '', tokens: {} }).presetChoices();
  const gone = goneOf(DO);
  ok(JSON.stringify(gone) === JSON.stringify(TWO), 'B-1e9a cure 3: a saved choice the cluster no longer provides (preset-gone) with several settings ⇒ the choices too — the press would be refused there as well', { gone });
  const onlyAmb = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "v && !v.clusterAvailable && Array.isArray(v.clusterOptions)", "v && v.clusterWhyCode === 'ambiguous' && Array.isArray(v.clusterOptions)", 'B-1e9a cure 3: the picker for ambiguous only'), 'dl-onlyamb');
  ok(goneOf(onlyAmb) === null, 'RED control: choices for the ambiguous code alone leave a preset-gone row with the press the store refuses (no door)', { gone: goneOf(onlyAmb) });
  // …and a store that HAS a default to give (a saved choice among several, still provided) ⇒ no choices: the one press works there
  const keptSt = { ...goneSt, publicView: () => ({ clusterAvailable: true, clusterWhyCode: null, clusterOptions: TWO }) };
  const keptOf = (mod) => mod.create({ client: {}, flows: {}, integrations: () => keptSt, instanceUrl: () => '', tokens: {} }).presetChoices();
  ok(keptOf(DO) === null, 'B-1e9a cure 3: several settings but a default the store can give (a saved choice still provided) ⇒ no choices — the one press heals it', { kept: keptOf(DO) });
  const anyMany = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "v && !v.clusterAvailable && Array.isArray(v.clusterOptions)", "v && Array.isArray(v.clusterOptions)", 'B-1e9a cure 3: choices whenever several'), 'dl-anymany');
  ok(Array.isArray(keptOf(anyMany)) && keptOf(anyMany).length === 2, 'RED control: choices whenever there are several would draw a picker where the one press works', { kept: keptOf(anyMany) });
  // cure 3 (the read): on the person's road a lock landing DURING the register still keeps the registered client id — the
  // person's row (it needs no vault) is written before the sealed record is read again; the refusal is by name
  const ownLockMid = async (mod, tag) => {
    const st = mk({}, tag); let lockedNow = false, regs = 0;
    const lockedErr = () => Object.assign(new Error('the vault is locked'), { code: 'vault_locked' });
    const tokens = { read: () => { if (lockedNow) throw lockedErr(); return {}; }, writable: () => !lockedNow, write: () => { if (lockedNow) throw lockedErr(); }, clear: () => { } };
    const door = mod.create({ client: { register: async () => { lockedNow = true; return { clientId: 'selfreg' + 'Own0' + (++regs) }; }, authorizeUrl: () => 'u' }, flows: { begin: async () => ({ flowId: 'f1', consentUrl: 'u' }) }, integrations: () => st, instanceUrl: () => 'https://hub.example.ts.net', tokens });
    const r = await door.start({});
    const v = st.resolveIntegration('dropline');
    return { ok: r.ok, code: r.why || null, regs, kept: (v.values || {}).clientId || null, source: v.source };
  };
  const olm = await ownLockMid(DO, 'own-lockmid');
  ok(olm.ok === false && olm.code === 'vault-locked' && olm.regs === 1 && olm.kept === 'selfregOwn01' && olm.source === 'user', 'B-1e9a cure 3: the person\'s road — a lock landing DURING the register: refused by name, and the registered client id is KEPT in the person\'s row (a first registration is not lost to the lock)', olm);
  const readFirst = M.load('src/server/dropline-oauth.js', anchored(anchored(DOSRC, "        if (plan.source !== 'cluster' && st && typeof st.setIntegration === 'function') st.setIntegration(KIND, { clientId });\n", '', 'B-1e9a cure 3: the person\'s row not first'), "        else tokens.write({ ...fresh, registeredFor: plan.redirectUri });", "        else { if (st && typeof st.setIntegration === 'function') st.setIntegration(KIND, { clientId }); tokens.write({ ...fresh, registeredFor: plan.redirectUri }); }", 'B-1e9a cure 3: the person\'s row after the read'), 'dl-readfirst');
  const olr = await ownLockMid(readFirst, 'own-lockmid-red');
  ok(olr.code === 'vault-locked' && olr.kept === null, 'RED control: reading the sealed record BEFORE the person\'s row loses the registered client id to a lock landing during the register', olr);
  const noBranch = M.load('src/server/dropline-oauth.js', anchored(DOSRC, "    if (c.preset && !c.relayUrl) return { redirectUri: null, via: null, presetNoRelay: true, ...c };\n", '', 'B-1e9a: the relay-less preset branch removed'), 'dl-nobranch');
  const rr = await relayLess(noBranch, 'norelay-red');
  ok(rr.via === 'own-https' && rr.ok === true, 'RED control: without the branch the fleet\'s client is sent to the pod\'s own https (the vendor would refuse the callback)', rr);
  // B-1e9a (the read): the hub's own client kept beside the tokens SURVIVES THE SIGN-IN and a DISCONNECT — the REAL Dropline client
  // (src/server/dropline-client.js) over an in-memory token store and a stand-in vendor: connectWith writes the pair with the kept
  // registration; Disconnect forgets the sign-in, keeps the registration (one client per deployment)
  const DC = require(path.join(REPO, 'src/server/dropline-client.js'));
  const carry = async (mod) => {
    let tok = { registeredFor: 'https://hub.example.ts.net/api/channels/oauth/cb/dropline', registeredClientId: 'selfregClient01' };
    const tokens = { read: () => tok, write: (v) => { tok = v; }, clear: () => { tok = null; } };
    const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => (/\/oauth\/token$/.test(String(url)) ? { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600 } : { name: 'Ada', team: 'T' }), text: async () => '' });
    const c = mod.create({ tokens, fetchImpl, oauthBase: 'https://oauth.example.test', base: 'https://api.example.test', log: quiet.log });
    await c.connectWith({ clientId: 'selfregClient01', code: 'c1', verifier: 'v1', redirectUri: tok.registeredFor });
    const afterSignIn = { access: !!(tok && tok.access), kept: tok && tok.registeredClientId };
    c.disconnect();
    return { afterSignIn, afterDisconnect: { access: !!(tok && tok.access), kept: tok && tok.registeredClientId, connected: c.connected() } };
  };
  // B-1e9a cure: a Disconnect while the vault is LOCKED refuses by name — never the sealed file cleared blind (the registration with it)
  const lockedDisc = (mod) => {
    let cleared = 0, wrote = 0;
    const tokens = { read: () => { throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); }, write: () => { wrote++; }, clear: () => { cleared++; } };
    const c = mod.create({ tokens, fetchImpl: async () => ({ ok: true, json: async () => ({}) }), log: quiet.log });
    let code = null; try { c.disconnect(); } catch (e) { code = e.code || e.message; }
    return { code, cleared, wrote };
  };
  const ld = lockedDisc(DC);
  ok(ld.code === 'vault-locked' && ld.cleared === 0 && ld.wrote === 0, 'B-1e9a cure: a Disconnect while the vault is locked ⇒ refused by name (vault-locked) — the sealed sign-in and the kept registration untouched', ld);
  const cy = await carry(DC);
  ok(cy.afterSignIn.access && cy.afterSignIn.kept === 'selfregClient01' && !cy.afterDisconnect.access && cy.afterDisconnect.kept === 'selfregClient01' && cy.afterDisconnect.connected === false,
    'B-1e9a: the real client — the sign-in keeps the hub\'s registered client beside the pair; Disconnect forgets the sign-in (not connected) and keeps the registration', cy);
  const DCSRC = fs.readFileSync(path.join(REPO, 'src/server/dropline-client.js'), 'utf8');
  const noCarry = M.load('src/server/dropline-client.js', anchored(DCSRC, ", registeredClientId: (pairNow() || {}).registeredClientId || null });", " });", 'B-1e9a: the sign-in drops the registration'), 'dl-nocarry');
  const cyr = await carry(noCarry);
  ok(!cyr.afterSignIn.kept, 'RED control: a sign-in that does not carry the registration loses the hub\'s client (the next Connect would register another)', cyr);
  const oldDisc = M.load('src/server/dropline-client.js', anchored(DCSRC, "    if (p.registeredClientId) tokens.write({ registeredFor: p.registeredFor || null, registeredClientId: p.registeredClientId }, { byPerson: true }); else tokens.clear();", "    tokens.clear();", 'B-1e9a: Disconnect clears the registration'), 'dl-olddisc');
  const cyd = await carry(oldDisc);
  ok(cyd.afterSignIn.kept === 'selfregClient01' && !cyd.afterDisconnect.kept, 'RED control: the old Disconnect (clear everything) drops the registration — a new vendor client at the next Connect', cyd);
  const blindDisc = M.load('src/server/dropline-client.js', anchored(DCSRC, "    if (pairLocked) throw lockedError();", "    if (false) throw lockedError();", 'B-1e9a cure: a locked Disconnect not refused'), 'dl-blinddisc');
  const ldr = lockedDisc(blindDisc);
  ok(ldr.code === null && ldr.cleared === 1, 'RED control: a Disconnect that does not refuse while locked clears the sealed file blind', ldr);
  // B-1e9a cure 3 (the read): a lock landing between Connect and the LANDING — the code is not exchanged (its pair could not be
  // written): refused by name before the vendor's token call, the code unspent
  const landLocked = async (mod) => {
    let fetched = 0;
    const tokens = { read: () => null, writable: () => false, write: () => { throw Object.assign(new Error('the vault is locked'), { code: 'vault_locked' }); }, clear: () => { } };
    const c = mod.create({ tokens, fetchImpl: async () => { fetched++; return { ok: true, status: 200, json: async () => ({ access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600 }), text: async () => '' }; }, oauthBase: 'https://oauth.example.test', base: 'https://api.example.test', log: quiet.log });
    let code = null; try { await c.connectWith({ clientId: 'selfregClient01', code: 'c1', verifier: 'v1', redirectUri: 'https://hub.example.ts.net/cb' }); } catch (e) { code = e.code || e.message; }
    return { code, fetched };
  };
  const ll = await landLocked(DC);
  ok(ll.code === 'vault-locked' && ll.fetched === 0, 'B-1e9a cure 3: a landing while the vault is locked ⇒ refused by name (vault-locked) BEFORE the code exchange — no token call at the vendor', ll);
  const blindLand = M.load('src/server/dropline-client.js', anchored(DCSRC, "    if (typeof tokens.writable === 'function' && !tokens.writable()) throw lockedError();\n", '', 'B-1e9a cure 3: the landing does not ask the lock'), 'dl-blindland');
  const llr = await landLocked(blindLand);
  ok(llr.fetched === 1, 'RED control: without the ask the code is exchanged at the vendor and the pair then thrown away at the locked write', llr);
  quiet.lines.length = 0; empty.stop?.();
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 8 })) ok(row.pass, row.name, row.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
