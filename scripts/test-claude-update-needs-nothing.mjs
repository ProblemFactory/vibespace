#!/usr/bin/env node
// test-claude-update-needs-nothing — THE DRILL (lane cli-update-needs-nothing, 2.369.390). The owner's founding requirement
// (2026-03-22, item 7): «使用原生claude code，确保claude code更新不需要重新更新本项目代码（除非claude code有breaking change）».
// A hub on THIS release is handed a Claude Code it has never seen — an unknown version, a new binary, a catalog with a model
// id and an alias target no table of ours names, a new family — and, with no release of ours:
//   §B the new model is pickable, in its 1M form; any catalog id resolves when typed, its [1m] form too;
//   §C it is priced from the CLI's own catalog, the source said where prices are shown, nothing written to pricing.json;
//   §D it lands in its family's quota lane (a NEW family gets its own);
//   §F no model-side sentence tells the person to wait for a release;
//   §H the maintainers hear first: one local event per new binary and per new id, said once (a restart says nothing);
//   §I a binary whose catalog cannot be read keeps the shipped rows + one quiet line, never a broken menu;
//   §J a catalog value out of bounds is refused BY NAME, never clamped; §K the person's own prices win;
//   (§L, the box's own installed claude read for real, is the HUB LEG's — a 340 MB read is heavy work)
//   §M the census: every model-keyed site in src/ has a row in scripts/fixtures/cli-update-census.json, every row says
//      «no release on an ordinary update» and by which road.
// Every assertion carries its RED CONTROL: the same scene with the ledger off — the shipped tables alone, i.e. what the
// .387 tree does — named and red. The scenes that need cli-self-measure (its probe core: the token-file accounts placed
// again; its quiet record line) and the model chip (fable-52's follow-up) join in a second commit after those lanes land.
// PURE + the stand-in: the fake `claude` is a /bin/sh stub whose bytes carry a catalog literal in the CLI's own minified
// shape (the reader never runs it). §L reads the box's real claude when one is installed (informational on the mirror).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { lit, writeStandIn, neverSeen } from './claude-catalog-stand-in.mjs';
import { trackedFiles } from './tracked-files.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CMC = require(path.join(ROOT, 'src/claude-model-catalog.js'));
const CP = require(path.join(ROOT, 'src/catalog-pricing.js'));
const CAT = require(path.join(ROOT, 'src/server/cli-model-catalog.js'));
const UHM = require(path.join(ROOT, 'src/usage-history.js'));
const FAM = require(path.join(ROOT, 'src/model-family.js'));
const MP = require(path.join(ROOT, 'src/model-providers.js'));
let pass = 0, fail = 0, skip = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + e : '')); } };
const red = (c, m, e) => ok(c, 'RED CONTROL (the shipped tables alone — today\'s tree): ' + m, e);
const dir = scratch('cunn');
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/claude-model-catalog-2.1.321.json'), 'utf8'));

// ── the stand-in (scripts/claude-catalog-stand-in.mjs): a /bin/sh stub whose bytes carry the never-seen catalog ──
let nCli = 0;
const fakeCli = (o) => writeStandIn(path.join(dir, `claude-${++nCli}`), o);
const NEW = neverSeen(BASE);

const events = [];
const bcasts = [];
const CATALOG_LAYER_OF = () => CMC.priceLayerOf([{ state: 'read', ...CAT.view() }]);
const ev = (n, d) => events.push({ n, d });
const note = (file, version) => CAT.noteBinary({ cmd: file, version, dataDir: path.join(dir, 'data'), which: (c) => c, event: ev, log: () => { } });
const env = require(path.join(ROOT, 'src/server/cli-env.js')).create({ rootDir: ROOT, CLAUDE_CMD_RAW: path.join(dir, 'no-claude'), CODEX_CMD_RAW: path.join(dir, 'no-codex'), resolveCmd: (c) => c, getOAuthToken: () => { }, usagePollingEnabled: () => false, refreshHarnessModels: () => { }, broadcast: (m) => bcasts.push(m), getTelemetry: () => null, getPlugins: () => null });
const ids = () => env.AVAILABLE_MODELS.claude.map((m) => m.id);
const SEED = CMC.menuRows(null, env.CLAUDE_MODEL_ALIASES, env.CLAUDE_KNOWN_MODELS);
const sub = (catalog) => MP.withListed({ id: 'anthropic', kind: 'anthropic-subscription', modelsSource: 'listed', listedBy: 'harness-cache', models: [] }, catalog);
fs.mkdirSync(path.join(dir, 'uh', 'usage-history'), { recursive: true });
const uh = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh'), homeDir: path.join(dir, 'uh') });
const ev1 = (model, t = {}) => ({ model, i: t.i || 0, o: t.o || 0, cw5: t.cw5 || 0, cw1: t.cw1 || 0, cr: t.cr || 0, ts: Date.now() });
const M = 1e6;

try {
  console.log('§0 the reader — a strict literal, never evaluated');
  {
    const text = 'var SOo=' + lit(BASE) + ';';
    const r = CMC.catalogIn(text, text.indexOf(CMC.ANCHOR));
    ok(r.ok && r.raw.models.length === 24 && r.raw.models.map((m) => m.id).join() === BASE.models.map((m) => m.id).join(), "2.1.321's catalog (the fixture, in the CLI's minified shape) parses to its 24 models", JSON.stringify({ ok: r.ok, code: r.code }));
    const v = CMC.validateCatalog(r.raw);
    const f52 = v.models.find((m) => m.id === 'claude-fable-5-2');
    ok(f52 && f52.family === 'fable' && f52.label === 'Fable 5.2' && f52.window === 1000000 && f52.oneM === 'native' && f52.maxOutput === 128000 && f52.tier === 'tier_8_40_cache_read_0_20' && f52.price.input === 8 && f52.price.output === 40 && f52.price.cacheWrite5m === 10 && f52.price.cacheWrite1h === 16 && f52.price.cacheRead === 0.2 && v.aliases.fable === 'claude-fable-5-2', 'Fable 5.2 reads as the binary states it: family, «Fable 5.2», 1M native, 128k out, $8/$40, cw $10 / $16, hit $0.20, `fable` → it', JSON.stringify(f52));
    const h55 = v.models.find((m) => m.id === 'claude-haiku-5-5');
    ok(h55 && h55.price.long && h55.price.long.above === 100000 && h55.price.long.input === 0.5 && h55.price.input === 0.1, "Haiku 5.5's long-prompt tier is its own block (never flattened over the top-level rates)", JSON.stringify(h55 && h55.price));
    const h45 = v.models.find((m) => m.id === 'claude-haiku-4-5');
    ok(h45 && h45.oneM === null && h45.firstParty === 'claude-haiku-4-5-20251001', 'a 200k model with only `supports_1m_suffix` has no 1M form; its dated first-party id is kept', JSON.stringify(h45));
    globalThis.__cunnPwn = 0;
    for (const [bad, code] of [['{schema_version:1,pricing_tiers:{},models:[Ye()]}', 'not-a-literal'], ['{schema_version:1,pricing_tiers:{},models:[(()=>{globalThis.__cunnPwn=1})()]}', 'not-a-literal'], ['{__proto__:{x:1},schema_version:1,pricing_tiers:{},models:[]}', 'forbidden-key'], ['{schema_version:1,pricing_tiers:{},models:[`x`]}', 'not-a-literal'], ['{schema_version:1,pricing_tiers:{},models:[...a]}', 'not-a-literal']]) {
      const p = CMC.parseLiteral(bad, 0);
      ok(!p.ok && p.code === code, `refused by name: ${bad.slice(0, 60)} → ${code}`, JSON.stringify(p));
    }
    ok(globalThis.__cunnPwn === 0, 'nothing from a catalog is ever executed (a planted IIFE never ran)');
  }

  console.log('§1 an unseen binary: an unknown version, a new file, a catalog no table of ours names');
  const cli900 = fakeCli({ version: '2.1.900', builtAt: '2026-12-01T00:00:00Z', catalog: NEW });
  const e900 = await note(cli900, '2.1.900');
  ok(e900 && e900.state === 'read' && e900.cli === '2.1.900' && e900.builtAt === '2026-12-01T00:00:00Z' && e900.models.length === 26 && e900.refused.length === 0, 'read once, never run: 2.1.900, built 2026-12-01, 26 models, nothing refused', JSON.stringify(e900 && { state: e900.state, cli: e900.cli, n: e900.models.length, refused: e900.refused, reason: e900.reason }));
  const ledger = JSON.parse(fs.readFileSync(path.join(dir, 'data', CAT.LEDGER), 'utf8'));
  ok(ledger.schema === 1 && Object.keys(ledger.binaries).length === 1 && ledger.binaries[ledger.current].evidence.anchor === CMC.ANCHOR && ledger.binaries[ledger.current].evidence.versionAgrees === true, 'the ledger keeps it (keyed by version + the file identity) with the evidence: the anchor, its offset, the version string agreeing with --version', JSON.stringify(ledger.binaries[ledger.current].evidence));

  console.log('§B the new model is pickable — in its 1M form; any catalog id resolves when typed');
  {
    const want = ['fable', 'fable[1m]', 'quill', 'quill[1m]', 'claude-fable-6', 'claude-fable-6[1m]', 'claude-quill-1', 'claude-quill-1[1m]'];
    ok(want.every((id) => ids().includes(id)), 'the picker lists the new model, its 1M form, the new family and its aliases', JSON.stringify(ids()));
    red(!want.some((id) => SEED.some((r) => r.id === id && /6|quill/.test(id))), 'the shipped rows name neither claude-fable-6 nor quill');
    const row = (id) => env.AVAILABLE_MODELS.claude.find((r) => r.id === id);
    ok(row('fable').label === 'fable · Fable 6 · 1M' && row('fable').resolves === 'claude-fable-6' && row('quill[1m]').label === 'quill[1m] · Quill 1 · 1M' && row('quill').context === 200000, 'an alias says what it means on THIS CLI («fable · Fable 6 · 1M»; quill 200k, quill[1m] 1M)', JSON.stringify([row('fable'), row('quill'), row('quill[1m]')]));
    red(SEED.find((r) => r.id === 'fable').label === 'fable (latest, 200k)', "the shipped alias label says «fable (latest, 200k)» — and names no model");
    ok(row('claude-fable-6[1m]').context === 1000000 && row('claude-quill-1').context === 200000 && row('claude-fable-6').label === 'Fable 6', 'a full-id row carries the CLI\'s own label and window');
    const p = sub(env.AVAILABLE_MODELS.claude);
    ok(MP.resolveModel(p, 'claude-fable-6[1m]') === 'claude-fable-6[1m]' && MP.resolveModel(p, 'claude-quill-1[1m]') === 'claude-quill-1[1m]' && MP.resolveModel(p, 'quill') === 'quill', 'the new model and the new alias resolve as picked, the 1M form kept', JSON.stringify([MP.resolveModel(p, 'claude-fable-6[1m]'), MP.resolveModel(p, 'quill')]));
    ok(MP.resolveModel(p, 'claude-opus-4-6[1m]') === 'claude-opus-4-6[1m]' && MP.resolveModel(p, 'claude-sonnet-4-5') === 'claude-sonnet-4-5', 'a catalog id the dropdown does not feature resolves when typed — its [1m] form too (ruling R4)');
    red(!MP.ID_PATTERNS.anthropic.test('claude-quill-1[1m]') && MP.resolveModel(sub(SEED), 'quill') === null, "the .387 open branch tested the whole typed id against `^claude-[a-z0-9.-]*$`: a typed …[1m] and the alias `quill` were refused");
    ok(env.AVAILABLE_MODELS.claude.length <= 40, 'the dropdown stays short: per family the latest + the ids we ship, each with its 1M form (' + env.AVAILABLE_MODELS.claude.length + ' rows)');
    const lr = MP.listedRows(env.AVAILABLE_MODELS.claude).find((r) => r.id === 'claude-quill-1');
    ok(lr && lr.context === 200000, "listedRows keeps the harness row's own size (the badge says 200k for Quill 1)", JSON.stringify(lr));
  }

  console.log('§C priced from the CLI\'s own catalog; the source said where prices are shown');
  {
    const f6 = uh._cost(ev1('claude-fable-6', { i: M, o: M, cw5: M, cw1: M, cr: M }));
    ok(Math.abs(f6 - (6 + 30 + 7.5 + 12 + 0.6)) < 1e-9 && uh._tier('claude-fable-6[1m]') === 'fable-6', 'claude-fable-6 (and [1m]) costs the catalog tier\'s hand arithmetic ($56.10 for 1M of each class)', String(f6));
    const q1 = uh._cost(ev1('claude-quill-1', { i: M, o: M }));
    ok(Math.abs(q1 - 6) < 1e-9, 'claude-quill-1 — a family no table of ours names — costs $1 + $5', String(q1));
    const s = uh.pricingView().sources;
    ok(s['fable-6'] && s['fable-6'].from === 'catalog' && s['fable-6'].cli === '2.1.900' && s.fable.from === 'shipped', "the price table says each row's source (the editor's Source column): fable-6 = Claude Code 2.1.900, fable = VibeSpace's", JSON.stringify([s['fable-6'], s.fable]));
    const disk = JSON.parse(fs.readFileSync(uh.pricingFile, 'utf8'));
    ok(!('fable-6' in disk.tiers) && !('quill-1' in disk.tiers), 'nothing catalog-derived is written to pricing.json');
    uh.setPricing({ tiers: { 'fable-6': { ...uh.pricingView().tiers['fable-6'] } } });
    ok(!('fable-6' in JSON.parse(fs.readFileSync(uh.pricingFile, 'utf8')).tiers), 'saving the editor with an UNCHANGED catalog row does not make it the person\'s');
    const file = uh._pricingFile;
    const t0 = CP.mergePricing(file, null, { shipped: UHM.DEFAULT_PRICING });
    const k = (id) => { const m = id.toLowerCase(); for (const key of Object.keys(t0.pricing.tiers).filter((x) => x !== '_default').sort((a, b) => b.length - a.length)) if (m.includes(key)) return key; return '_default'; };
    red(k('claude-fable-6') === 'fable' && k('claude-quill-1') === '_default', 'claude-fable-6 fell on Fable 5\'s `fable` row ($10/$50) and claude-quill-1 on `_default` ($3/$15)', `${k('claude-fable-6')} / ${k('claude-quill-1')}`);
    const page = fs.readFileSync(path.join(ROOT, 'src/lib/usage-window.js'), 'utf8');
    ok(/<th>\$\{t\('Source'\)\}<\/th><\/tr>`/.test(page) && /t\('From Claude Code \{v\}', \{ v: src\.cli/.test(page) && /t\('Entered by you'\)/.test(page) && /std\.textContent = /.test(page), "the price editor draws a Source cell per row, by textContent (VibeSpace's table · From Claude Code {v} · Entered by you)");
  }

  console.log('§D the quota lane is a fact about ONE account\'s reading (acceptance r1 law C, r2 law C final)');
  {
    ok(FAM.familyOfModel('claude-quill-1') === 'quill' && FAM.familyOfModel('claude-fable-6') === 'fable' && FAM.familyOfModel('claude-mythos-5-2') === 'fable', 'the catalog\'s family per model (claude-quill-1 → quill, by id); claude-fable-6 → fable; Mythos stays in the Fable lane (the seed)');
    const X = { scopedWeekly: [{ name: 'Fable', usedPct: 100 }, { name: 'Opus', usedPct: 10 }] };   // a member whose OWN reading shows no Quill cap
    const Y = { scopedWeekly: [{ name: 'Fable', usedPct: 10 }, { name: 'Quill', usedPct: 5 }] };     // a member whose reading does
    const py = FAM.projectCacheForFamily(Y, 'quill'), px = FAM.projectCacheForFamily(X, 'quill');
    ok(py.scopedWeekly.map((b) => b.name).join() === 'Quill' && py.spareScoped.map((b) => b.name).join() === 'Fable', 'the member whose reading carries a «Quill» bucket has the Quill lane (its Fable cap set aside)', JSON.stringify(py));
    ok(px === X && FAM.projectCacheForFamily(X, 'quill') === X, 'the member whose reading does not is judged by EVERY scoped cap it has — its Fable cap at 100 % still walls a Quill conversation, after Y\'s reading as before it (no process-wide memory)');
    red(FAM.projectCacheForFamily({ scopedWeekly: [...X.scopedWeekly, { name: 'Quill' }] }, 'quill').spareScoped.some((b) => b.name === 'Fable'), 'a lane, where it exists, sets the Fable cap aside — r2\'s tip granted it to X from ANOTHER account\'s reading (one global observed set), so the pool preferred X\'s full Fable cap');
    FAM.setCatalogFamilies({ 'quill-1': 'quill', 'fable-5-2': 'claude', 'opus-5-5': 'model', 'sonnet-5-5': 'son', 'haiku-5-5': 'opu', 'x-1': 'included', 'quillx-1': 'quillx' });
    const real = ['claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].map((id) => FAM.familyOfModel(id));
    ok(real.join() === 'fable,opus,sonnet,haiku', 'the verifier\'s word table: the four real ids keep their lane under claude / model / son / opu / included', real.join());
    ok(FAM.familyOfScopedBucket('Model cap') === null && FAM.familyOfScopedBucket('Overage Included') === null, '«Model cap» and «Overage Included» stay family-less (only a bucket\'s WHOLE name can be a family)');
    ok(FAM.familyOfModel('claude-quill-1') === 'quill', 'claude-quill-1 stays in ITS family beside «claude» and «quillx» (read by id, never as a word)');
    FAM.setCatalogFamilies(CMC.familiesOf(CAT.view()));
    const before = FAM.familyOfModel('claude-quill-1');
    FAM.setCatalogFamilies({});
    red(before === 'quill' && FAM.familyOfModel('claude-quill-1') === null, 'the .388 rule: a family no word names has no family at all (no projection)');
    FAM.setCatalogFamilies(CMC.familiesOf(CAT.view()));
  }

  console.log('§E the alias guard (the lock and the chip hold an alias by its word)');
  {
    ok(CMC.aliasGuard(CAT.view()).length === 0, 'every alias of the new catalog names a model inside its word (fable → claude-fable-6, quill → claude-quill-1)');
    const bent = CMC.aliasGuard({ aliases: { fable: 'claude-quill-1' } });
    ok(bent.length === 1 && bent[0].alias === 'fable', 'a catalog whose alias leaves its word is named (the hub says it once: cli-unknown-model-alias)', JSON.stringify(bent));
  }

  console.log('§F no model-side sentence tells the person to wait for a release');
  {
    const WAIT = /\b(release|update vibespace|wait)\b|发布|发版|等待|リリース|待って/i;
    const zh = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
    const val = (src, key) => { const m = new RegExp('^  ' + JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': "([^"]*)"', 'm').exec(src); return m ? m[1] : null; };
    const words = [...env.AVAILABLE_MODELS.claude.map((r) => r.label), ...events.map((e) => e.d), 'From Claude Code {v}', "VibeSpace's table", 'Entered by you', 'Source'];
    for (const k of ['From Claude Code {v}', "VibeSpace's table"]) words.push(val(zh, k), val(ja, k));
    ok(words.every((w) => typeof w === 'string' && w.length) && !words.some((w) => WAIT.test(w)), `none of the ${words.length} picker labels, price-source words (en / zh / ja) and Diagnostics lines says to wait for a release`, JSON.stringify(words.filter((w) => !w || WAIT.test(w))));
    red(WAIT.test('records may show as new fields until the next release') && WAIT.test('Until a release registers one'), 'the matcher is not vacuous: the .387 «until the next release» sentences are what it catches (cli-registration\'s — cli-self-measure rewords those)');
  }

  console.log('§H the maintainers hear first — once');
  {
    const read = events.filter((e) => e.n === 'cli-model-catalog-read'), unk = events.filter((e) => e.n === 'cli-unknown-model');
    ok(read.length === 1 && /claude 2\.1\.900 · built 2026-12-01 · 26 models · new: claude-fable-6, claude-quill-1/.test(read[0].d), 'ONE `cli-model-catalog-read`: the version, the build date, the count, the new ids', JSON.stringify(read));
    ok(unk.map((e) => e.d).join(' | ') === 'claude-fable-6 · fable · Claude Code 2.1.900 | claude-quill-1 · quill · Claude Code 2.1.900', 'ONE `cli-unknown-model` per new id (Diagnostics\' Harness drift rows)', JSON.stringify(unk));
    ok(!events.some((e) => /\/|home|@|account/i.test(e.d.replace(/\$[\d.]+\/\$[\d.]+/g, ''))), 'no path, no account, no identifier in any detail');
    const n = events.length;
    await note(cli900, '2.1.900');
    CAT._reset();
    await note(cli900, '2.1.900');
    ok(events.length === n, 'the same binary again, and again after a restart (the ledger kept): nothing said twice', String(events.length - n));
  }

  console.log('§I a binary whose catalog cannot be read: the shipped rows + ONE quiet line');
  {
    const n = events.length;
    const broken = fakeCli({ version: '2.1.901', builtAt: '2026-12-02T00:00:00Z', body: lit(NEW).replace('models:[', 'models:[Ye(),') });
    const e = await note(broken, '2.1.901');
    ok(e.state === 'unreadable' && e.reason.code === 'not-a-literal', 'refused by name: not-a-literal', JSON.stringify(e.reason));
    ok(ids().join() === SEED.map((r) => r.id).join(), 'the picker is exactly the shipped rows — never empty, never broken');
    const said = events.slice(n);
    ok(said.length === 1 && said[0].n === 'cli-unknown-model-catalog' && /Claude Code 2\.1\.901: its own model list could not be read here \(not-a-literal at \+\d+\) — VibeSpace uses its built-in list/.test(said[0].d), 'ONE quiet Diagnostics line, no For-you item', JSON.stringify(said));
    ok(uh._tier('claude-fable-6') === 'fable-6', "an unreadable binary takes no price away: a conversation 2.1.900 served stays priced (the union of every catalog read)");
    await note(cli900, '2.1.900');
    ok(ids().includes('claude-fable-6'), 'back on the readable binary, its rows return at once (no re-read: the ledger)');
  }

  console.log('§J a value out of bounds is refused BY NAME — never clamped');
  {
    const bad = structuredClone(NEW);
    bad.pricing_tiers.tier_6_30 = { ...bad.pricing_tiers.tier_6_30, input: 5000 };
    bad.models.find((m) => m.id === 'claude-quill-1').context.window = 99000000;
    bad.models.find((m) => m.id === 'claude-quill-1').display_name = 'Q'.repeat(80);
    const v = CMC.validateCatalog(bad);
    const f6 = v.models.find((m) => m.id === 'claude-fable-6'), q1 = v.models.find((m) => m.id === 'claude-quill-1');
    const names = v.refused.map((r) => `${r.id} ${r.field} ${r.code}`);
    ok(f6.price === null && names.includes('claude-fable-6 price.input price-range') && names.includes('claude-quill-1 context.window context-range') && names.includes('claude-quill-1 display_name label-long'), 'refused by name: price.input 5000, window 99 M, an 80-char label', JSON.stringify(names));
    ok(q1.window === null && q1.label === 'claude-quill-1' && !CMC.priceLayerOf([{ state: 'read', cli: 'x', builtAt: 'x', models: v.models }]).rows['fable-6'], 'nothing is clamped: the refused price is no row at all (the id keeps the shipped answer), the window unknown, the label the id');
  }

  console.log('§K the person first — PER MODEL; an own shipped row vs the catalog by the newer source (ruling R3; acceptance r1, law B)');
  {
    const L321 = CMC.priceLayerOf([{ state: 'read', cli: '2.1.321', builtAt: '2026-11-09T15:53:28Z', models: CMC.validateCatalog(BASE).models }]);
    const opt = { shipped: UHM.DEFAULT_PRICING, checked: UHM.SHIPPED_PRICES_CHECKED };
    const tierOf = (pr, id) => { const m = id.toLowerCase(); for (const k of Object.keys(pr.tiers).filter((x) => x !== '_default').sort((x, y) => y.length - x.length)) if (m.includes(k)) return k; return '_default'; };
    const row = (i, o) => ({ input: i, output: o, cacheWrite5m: i, cacheWrite1h: i, cacheRead: i / 10 });
    // (1) the person edits the `opus` FAMILY row: Opus 4.8 (which falls on it) stays on theirs — no longer key slides under it
    const a = CP.mergePricing({ version: 2, tiers: { ...UHM.DEFAULT_PRICING, opus: row(4, 20) }, accounts: {} }, L321, opt);
    ok(tierOf(a.pricing, 'claude-opus-4-8') === 'opus' && !('opus-4-8' in a.pricing.tiers) && a.disagreements.some((d) => d.id === 'claude-opus-4-8' && d.used === 'you' && d.fellOn === 'opus'), "a person's `opus` row (4 / 20): claude-opus-4-8 stays on it — the catalog's 5 / 25 adds no key under it, and the disagreement names the person's row as the one in force", JSON.stringify(a.disagreements.filter((d) => /opus-4-8/.test(d.id))));
    // (2) the person edits `haiku`: Haiku 4.5 stays on their 0.5. Haiku 5.5 has its OWN shipped row since 2.369.391 (lane
    //     fable-52-cli-321 typed the two rows the .390 catalog moved), so the own-row rule (B1 below) holds it: a FAMILY row never prices it
    const b = CP.mergePricing({ version: 2, tiers: { ...UHM.DEFAULT_PRICING, haiku: row(0.5, 2.5) }, accounts: {} }, L321, opt);
    ok(tierOf(b.pricing, 'claude-haiku-4-5-20251001') === 'haiku' && !('haiku-4-5' in b.pricing.tiers) && b.disagreements.some((d) => d.id === 'claude-haiku-4-5' && d.fellOn === 'haiku' && d.used === 'you') && tierOf(b.pricing, 'claude-haiku-5-5') === 'haiku-5-5' && b.pricing.sources['haiku-5-5'].from === 'shipped' && b.pricing.tiers['haiku-5-5'].input === 0.1 && b.disagreements.some((d) => d.id === 'claude-haiku-5-5' && d.fellOn === 'haiku' && d.used === 'shipped' && d.outranked === true), "a person's `haiku` row (0.5): Haiku 4.5 is not put back at the shipped $1 — their row stands for it; Haiku 5.5 is on its OWN shipped row ($0.10, the catalog's price), never their family row (the own-row rule, as B1) — and the disagreement NAMES their row (round 9, 主开发's ruling: never silently)", JSON.stringify({ h55: tierOf(b.pricing, 'claude-haiku-5-5'), src: b.pricing.sources['haiku-5-5'] }));
    // (3) a CUSTOM key the person added: an id that falls on it stays on it (the catalog adds no key under it)…
    const c = CP.mergePricing({ version: 2, tiers: { ...UHM.DEFAULT_PRICING, 'haiku-4': row(0.3, 1.5) }, accounts: {} }, L321, opt);
    ok(tierOf(c.pricing, 'claude-haiku-4-5-20251001') === 'haiku-4' && !('haiku-4-5' in c.pricing.tiers) && c.pricing.sources['haiku-4'].from === 'you' && c.disagreements.some((d) => d.id === 'claude-haiku-4-5' && d.fellOn === 'haiku-4' && d.used === 'you'), "a custom key the person added (`haiku-4`): claude-haiku-4-5 stays on it — the catalog's $1 adds no `haiku-4-5` key under it, and the disagreement names their row", JSON.stringify(c.disagreements.map((d) => [d.id, d.fellOn, d.used])));
    // …while a model with its OWN shipped row keeps that row, the longer key (2.369.391's `haiku-5-5` under a person's `haiku-5`)
    const c2 = CP.mergePricing({ version: 2, tiers: { ...UHM.DEFAULT_PRICING, 'haiku-5': row(0.3, 1.5) }, accounts: {} }, L321, opt);
    const c3 = CP.mergePricing({ version: 2, tiers: { ...UHM.DEFAULT_PRICING, 'haiku-5': row(0.3, 1.5) }, accounts: {} }, null, opt);   // no catalog read at all
    const named = (r) => r.disagreements.find((d) => d.id === 'claude-haiku-5-5' && d.fellOn === 'haiku-5' && d.key === 'haiku-5-5' && d.used === 'shipped' && d.outranked === true);
    ok(tierOf(c2.pricing, 'claude-haiku-5-5') === 'haiku-5-5' && c2.pricing.sources['haiku-5-5'].from === 'shipped' && c2.pricing.sources['haiku-5'].from === 'you' && !!named(c2) && !!named(c3), "a custom key SHORTER than a model's own shipped row (`haiku-5` against `haiku-5-5`): Haiku 5.5 is priced on its own row (the own-row rule stands — 主开发's ruling) but NEVER SILENTLY: the disagreement names the person's key, the own row now in force and where to change it — with the catalog read and without it (the r8 tree: an empty line)", JSON.stringify({ c2: named(c2) || c2.disagreements, c3: named(c3) || c3.disagreements }));
    // (4) two accounts: one account's override shields THAT account only
    fs.mkdirSync(path.join(dir, 'uh2', 'usage-history'), { recursive: true });
    const uh2 = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh2'), homeDir: path.join(dir, 'uh2') });
    uh2.setPricing({ accounts: { acctA: { tiers: { haiku: row(9, 9) } } } });
    const e = (acct, model) => ({ model, acct, i: 50000, o: 0, cw5: 0, cw1: 0, cr: 0, ts: Date.now() });
    const ca = uh2._cost(e('acctA', 'claude-haiku-4-5-20251001')), cb = uh2._cost(e('acctB', 'claude-haiku-4-5-20251001'));
    const ha = uh2._cost(e('acctA', 'claude-haiku-5-5')), hb = uh2._cost(e('acctB', 'claude-haiku-5-5'));
    ok(Math.abs(ca - 0.45) < 1e-9 && Math.abs(cb - 0.05) < 1e-9 && Math.abs(ha - 0.005) < 1e-9 && Math.abs(hb - 0.005) < 1e-9, `two accounts: account A's own \`haiku\` override prices A's Haiku 4.5 ($${ca.toFixed(4)}), every other account pays the shipped $1 ($${cb.toFixed(4)}); Haiku 5.5 is on its own row for both ($0.10: $${ha.toFixed(4)} / $${hb.toFixed(4)}) — a family override never reaches it`);
    // B1 (acceptance r2): a NEWER catalog that replaces a model's OWN shipped row never hands it to an account's FAMILY override
    const later = structuredClone(BASE);
    later.pricing_tiers.tier_7_35 = { input: 7, output: 35, cache_write_5m: 8.75, cache_write_1h: 14, cache_read: 0.7, web_search: 0.01 };
    later.pricing_tiers.tier_3_5_15 = { input: 3.5, output: 15, cache_write_5m: 4.375, cache_write_1h: 7, cache_read: 0.35, web_search: 0.01 };
    later.models.find((m) => m.id === 'claude-fable-5-2').pricing = 'tier_7_35';
    later.models.find((m) => m.id === 'claude-opus-5-5').pricing = 'tier_3_5_15';
    const Llater = CMC.priceLayerOf([{ state: 'read', cli: '2.1.950', builtAt: '2026-12-15T00:00:00Z', models: CMC.validateCatalog(later).models }]);
    fs.mkdirSync(path.join(dir, 'uh5', 'usage-history'), { recursive: true });
    const uh5 = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh5'), homeDir: path.join(dir, 'uh5') });
    uh5.setPricing({ accounts: { acctF: { tiers: { fable: row(50, 50), opus: row(50, 50) } } } });
    const layerNow = CATALOG_LAYER_OF();
    UHM.setCatalogPricing(Llater);
    const c5 = (acct, model) => uh5._cost({ model, acct, i: 1e6, o: 0, cw5: 0, cw1: 0, cr: 0, ts: Date.now() });
    const fA = c5('acctF', 'claude-fable-5-2'), fB = c5('acctOther', 'claude-fable-5-2'), oA = c5('acctF', 'claude-opus-5-5'), oB = c5('acctOther', 'claude-opus-5-5');
    UHM.setCatalogPricing(layerNow);
    ok(fA === 7 && fB === 7 && oA === 3.5 && oB === 3.5, `a later build reprices fable-5-2 ($7) and opus-5-5 ($3.50), the shipped OWN rows it replaces: an account overriding only \`fable\` / \`opus\` at $50 pays the catalog's price like every account ($${fA} / $${oA}), never its family override`, JSON.stringify({ fA, fB, oA, oB }));
    red(CP.fileTierOf({ tiers: { ...UHM.DEFAULT_PRICING, 'fable-5-2': row(7, 35) }, sources: { 'fable-5-2': { from: 'catalog' } } }, 'claude-fable-5-2') === 'fable', "r2's fileTierOf filtered the MERGED table by the source word: the replaced own key vanished and fable-5-2 fell to `fable` — the account's $50");
    // B2: a disagreement is said when it comes to EXIST — here at the person's save, after the read
    const nB2 = events.length;
    uh.setPricing({ tiers: { opus: row(4, 20) } });
    const saidB2 = events.slice(nB2).filter((x) => x.n === 'cli-unknown-model-price' && /your «opus» row \$4\/\$20/.test(x.d));
    uh.setPricing({ tiers: { opus: row(4, 20) } });
    ok(saidB2.length >= 1 && events.slice(nB2).filter((x) => /your «opus» row/.test(x.d)).length === saidB2.length, `the person saves \`opus\` 4 / 20 after the read: ${saidB2.length} Opus id(s) on their row against the catalog are said at the save, once each (a second save says nothing)`, JSON.stringify(events.slice(nB2).map((x) => x.d)));
    uh.setPricing({ tiers: { opus: { ...UHM.DEFAULT_PRICING.opus } } });
    // ROUND 9 (主开发's ruling on the price key — never silently, and the sentence whole): a key the person typed that a model's own row
    // now outranks is SAID, by the model's name, with where to change it — within the 200-character bound every said line has
    const nB4 = events.length;
    uh.setPricing({ tiers: { 'haiku-5': row(0.3, 1.5) } });
    const outLine = events.slice(nB4).map((x) => x.d).find((d) => /your «haiku-5» row/.test(d));
    ok(!!outLine && /^Haiku 5\.5: your «haiku-5» row \$0\.3\/\$1\.5/.test(outLine) && /edit «haiku-5-5» to change it$/.test(outLine) && outLine.length < 200, `a key the person typed that an own row outranks is said WHOLE (${outLine ? outLine.length : 0} characters), by the model's name and with where to change it: «${outLine}»`);
    // …and with NO catalog label (a model the CLI's catalog does not list) it is named by the model's name read off its id, never the id
    const nB5 = events.length;
    CAT._sayPrices([{ id: 'claude-haiku-5-5', label: null, key: 'haiku-5-5', fellOn: 'haiku-5', ours: row(0.4, 2), shipped: row(0.1, 0.5), catalog: null, used: 'shipped', outranked: true }], { save: false });
    const noLabel = events.slice(nB5).map((x) => x.d).find((d) => /your «haiku-5» row \$0\.4\/\$2/.test(d));
    ok(!!noLabel && /^Haiku 5\.5: /.test(noLabel) && !/claude-haiku-5-5/.test(noLabel) && /edit «haiku-5-5» to change it$/.test(noLabel) && noLabel.length < 200, `…with no catalog label the line names the model read off its id («Haiku 5.5»), whole: «${noLabel}»`);
    uh.setPricing({ tiers: { 'haiku-5': undefined, opus: { ...UHM.DEFAULT_PRICING.opus } } });
    // B3: the export carries what a person entered, nothing else; an import never adopts a catalog row
    const exp = JSON.parse(JSON.stringify(uh.pricingTable()));
    ok(!('fable-6' in exp.tiers) && !('quill-1' in exp.tiers) && !exp.sources, 'the config export (pricingTable) holds the disk rows only: no catalog key, no `sources`');
    fs.mkdirSync(path.join(dir, 'uh6', 'usage-history'), { recursive: true });
    const layerKeep = CATALOG_LAYER_OF();
    UHM.setCatalogPricing(null); // a hub that has not read the catalog
    const uh6 = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh6'), homeDir: path.join(dir, 'uh6') });
    uh6.setPricing(JSON.parse(JSON.stringify(uh.pricingView()))); // an export taken from r2's tip: the merged table + its sources
    const disk6 = JSON.parse(fs.readFileSync(uh6.pricingFile, 'utf8'));
    UHM.setCatalogPricing(layerKeep);
    ok(!('fable-6' in disk6.tiers) && !('quill-1' in disk6.tiers), "importing r2's merged export on a hub without the catalog writes NO catalog row as the person's (the exporter's `sources` said catalog)");
    // the .390 shipped table = this one without the two rows 2.369.391 typed by hand (lane fable-52-cli-321 r2: the public table, read 2026-11-09)
    const t390 = { ...UHM.DEFAULT_PRICING }; delete t390['haiku-5-5']; delete t390['sonnet-5-5'];
    const opt390 = { ...opt, shipped: t390 };
    red(CP.mergePricing({ version: 2, tiers: t390, accounts: {} }, null, opt390).pricing.tiers['haiku-5-5'] === undefined && tierOf({ tiers: t390 }, 'claude-haiku-5-5') === 'haiku', 'the .390 shipped table alone (no own Haiku 5.5 row) prices Haiku 5.5 on the Haiku 4.5 row (×10) for every account');
    // the own-row date rule (R3) and this release's two moves, as before
    const own = { version: 2, tiers: { ...UHM.DEFAULT_PRICING }, accounts: {} };
    const L = (builtAt) => ({ rows: { 'fable-5-2': { id: 'claude-fable-5-2', label: 'Fable 5.2', row: { input: 7, output: 35, cacheWrite5m: 8.75, cacheWrite1h: 14, cacheRead: 0.2 }, cli: '2.1.999', builtAt } } });
    const newer = CP.mergePricing(own, L('2026-11-10T00:00:01Z'), opt), tie = CP.mergePricing(own, L('2026-11-09T23:00:00Z'), opt);
    ok(newer.pricing.tiers['fable-5-2'].input === 7 && newer.disagreements[0].used === 'catalog' && tie.pricing.tiers['fable-5-2'].input === 8 && tie.disagreements[0].used === 'shipped', `an own shipped row vs the catalog: a CLI built after ${UHM.SHIPPED_PRICES_CHECKED} wins; one built that day ties to the shipped row — both said`);
    const moved = CP.mergePricing(own, L321, opt);
    const keys = Object.entries(moved.pricing.sources).filter(([, x]) => x.from === 'catalog').map(([k]) => k).sort();
    ok(!keys.length && !moved.disagreements.length, "on this release's table (Haiku 5.5 and Sonnet 5.5 typed as their own rows, 2.369.391) 2.1.321's catalog moves nothing — every price it names is the shipped one", keys.join() + ' ' + JSON.stringify(moved.disagreements));
    const moved390 = CP.mergePricing({ version: 2, tiers: t390, accounts: {} }, L321, opt390);
    const keys390 = Object.entries(moved390.pricing.sources).filter(([, x]) => x.from === 'catalog').map(([k]) => k).sort();
    const same = (k) => JSON.stringify(moved390.pricing.tiers[k]) === JSON.stringify(UHM.DEFAULT_PRICING[k]);
    ok(keys390.join() === 'haiku-5-5,sonnet-5-5' && same('haiku-5-5') && same('sonnet-5-5'), "…on the .390 table it moved exactly Haiku 5.5 and Sonnet 5.5's cache hit — to the very rows this release ships, byte for byte", keys390.join() + ' ' + JSON.stringify(keys390.map((k) => [moved390.pricing.tiers[k], UHM.DEFAULT_PRICING[k]])));
    const fileTable = { version: 2, tiers: { ...UHM.DEFAULT_PRICING, 'fable-6': row(1, 2) }, accounts: {} };
    const yours = CP.mergePricing(fileTable, CMC.priceLayerOf([{ state: 'read', ...CAT.view() }]), opt);
    ok(yours.pricing.tiers['fable-6'].input === 1 && yours.pricing.sources['fable-6'].from === 'you', "a row the person typed for the new model's own key wins over the catalog's, said as theirs");
  }

  console.log('§A what the hub read is in force from the FIRST answer after a restart — before any tick, no re-read (acceptance r1, law A)');
  {
    const ledgerFile = path.join(dir, 'data', CAT.LEDGER);
    const ledgerBytes = fs.readFileSync(ledgerFile, 'utf8');
    const nEv = events.length;
    CAT._reset(); UHM.setCatalogPricing(null); FAM.setCatalogFamilies({});
    CAT.apply({ save: false }); // a fresh process: no ledger loaded yet ⇒ every reader on the shipped tables
    fs.mkdirSync(path.join(dir, 'uh3', 'usage-history'), { recursive: true });
    const uh3 = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh3'), homeDir: path.join(dir, 'uh3') });
    red(!ids().includes('claude-fable-6') && uh3._tier('claude-fable-6') === 'fable', 'r1\'s tip: until the first tick (20 s, or never when --version gives no answer) the restarted hub served the shipped list and prices');
    fs.chmodSync(cli900, 0o000); // the binary cannot even be opened: boot must not need it
    const v = CAT.boot({ dataDir: path.join(dir, 'data'), event: ev, log: () => { } });
    fs.chmodSync(cli900, 0o755);
    ok(v && v.cli === '2.1.900' && ids().includes('claude-fable-6') && ids().includes('claude-quill-1[1m]'), 'boot (the server\'s cli-env create): the ledger\'s list is in force at once — no tick, no binary', JSON.stringify(v && v.cli));
    const uh4 = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh3'), homeDir: path.join(dir, 'uh3') });
    ok(uh4._tier('claude-fable-6') === 'fable-6' && uh4.pricingView().sources['fable-6'].from === 'catalog' && uh3._tier('claude-fable-6') === 'fable-6', '…its prices too, for an instance made after boot AND one made before it (the Source column says «From Claude Code»)');
    ok(FAM.familyOfModel('claude-quill-1') === 'quill', '…and its families');
    ok(/\nconst CMCS = require\('\.\/cli-model-catalog\.js'\);[\s\S]*?try \{ CMCS\.boot\(\{ dataDir: path\.join\(rootDir, 'data'\) \}\); \} catch \{ \}\n/.test(fs.readFileSync(path.join(ROOT, 'src/server/cli-env.js'), 'utf8')), 'the SERVER\'s boot call: cli-env create() boots the ledger from <root>/data (the drill\'s restart is that call; the hub leg proves it on a real second process)');
    ok(events.length === nEv && fs.readFileSync(ledgerFile, 'utf8') === ledgerBytes, 'nothing re-read, nothing said again, the ledger untouched');
  }

  console.log('§D2 THE LOOP LAW on every file, and a read that never finishes bounds only itself (acceptance r1, law D)');
  {
    // the verifier's shape: eleven nested openings right before the anchor, then ~520 KB of an object that never closes —
    // every start parses the whole window (r1's tip: up to 64 starts × ~532 KB, 339–364 ms)
    const deep = '{a:'.repeat(10) + '{' + CMC.ANCHOR + 'q:1,'.repeat(130000); // depth 12 exactly: every start runs to the window's end
    const crafted = fakeCli({ version: '2.1.902', builtAt: '2026-12-03T00:00:00Z', body: deep });
    // THE WORK CENSUS (law D; no wall-clock bound in a fast suite — test-ci-gate): the same text the hub reads, asked of the
    // reader directly — how many starts it parsed and how many characters, against its constants
    const text = 'var SOo=' + deep;
    const ec = await CAT.readBinary(crafted, {});
    const w = { ok: ec.state === 'read', parsed: ec.evidence.parse.starts, candidates: ec.evidence.parse.of, spent: ec.evidence.parse.chars };
    ok(ec.state === 'unreadable' && !w.ok && w.parsed <= CMC.START_TRIES && w.spent <= CMC.PARSE_BUDGET + text.length, `a crafted file (11 nested openings before the anchor, ~520 KB never closing): refused (${ec.reason.code}) after ${w.parsed} of ${w.candidates} starts and ${w.spent} characters parsed (the bound: ≤ ${CMC.START_TRIES} starts, ${CMC.PARSE_BUDGET} characters + one window)`, JSON.stringify({ parsed: w.parsed, spent: w.spent }));
    const ai = text.indexOf(CMC.ANCHOR), opens = [...text.slice(Math.max(0, ai - 4096), ai)].filter((c) => c === '{').length;
    red(opens >= 11 && opens * (text.length - ai) > 4 * CMC.PARSE_BUDGET, `r1's tip parsed EVERY opening within 4 KB before the anchor (up to 64) to the window's end: ${opens} × ~${Math.round((text.length - ai) / 1000)} KB here (it held the loop 339–364 ms)`);
    const never = () => new Promise(() => { });
    const en = await CAT.readBinary(cli900, { open: never, timeoutMs: 20 });
    ok(en.state === 'unreadable' && en.reason.code === 'timeout' && en.retry === true, 'a read whose open never returns (a FIFO swapped in): bounded by the read\'s own timeout (20 ms here, READ_TIMEOUT_MS in the hub) — `timeout`, marked to try again', JSON.stringify(en.reason));
    const nd = path.join(dir, 'fifo-standin'); fs.mkdirSync(nd, { recursive: true });
    const ed = await CAT.readBinary(nd, {});
    ok(ed.reason && ed.reason.code === 'not-a-file' && ed.retry === true, 'a path that is not a regular file when opened: refused by name (not-a-file), never read');
    const cli903 = fakeCli({ version: '2.1.903', builtAt: '2026-12-04T00:00:00Z', catalog: NEW });
    const p1 = CAT.noteBinary({ cmd: cli903, version: '2.1.903', dataDir: path.join(dir, 'data'), which: (c) => c, open: never, timeoutMs: 20 });
    const r1 = await p1; // bounded by the read's own timeout: a stuck open never holds the chain
    const r2 = await CAT.noteBinary({ cmd: cli903, version: '2.1.903', dataDir: path.join(dir, 'data'), which: (c) => c });
    ok(r1 && r1.retry === true && r2 && r2.state === 'read', 'the stuck read blocks nothing after it: the next tick reads the same binary', JSON.stringify([r1 && r1.reason, r2 && r2.state]));
    await note(cli900, '2.1.900');
  }

  console.log('§E2 the ledger never makes the hub repeat itself (acceptance r1, law E)');
  {
    const d2 = path.join(dir, 'data-e'); fs.mkdirSync(d2, { recursive: true });
    fs.writeFileSync(path.join(d2, CAT.LEDGER), JSON.stringify({ schema: 1, binaries: { x: null, y: 5, z: { state: 'read' } }, said: ['a', 3] }));
    fs.writeFileSync(path.join(d2, CAT.LEDGER + '.tmp-99999'), 'a kill between write and rename');
    const ne = events.length;
    CAT._reset();
    const e1 = await CAT.noteBinary({ cmd: cli900, version: '2.1.900', dataDir: d2, which: (c) => c, event: ev, log: () => { } });
    const saved = JSON.parse(fs.readFileSync(path.join(d2, CAT.LEDGER), 'utf8'));
    ok(e1 && e1.state === 'read' && !('x' in saved.binaries) && !('y' in saved.binaries) && !('z' in saved.binaries) && Object.keys(saved.binaries).length === 1, 'a ledger holding non-entries ({"x":null}, 5, a half entry): what the load accepts the save writes — dropped, read once, saved');
    ok(!fs.existsSync(path.join(d2, CAT.LEDGER + '.tmp-99999')), 'the tmp file a kill left between write and rename is removed at the next save');
    const ne2 = events.length;
    CAT._reset();
    await CAT.noteBinary({ cmd: cli900, version: '2.1.900', dataDir: d2, which: (c) => c, event: ev, log: () => { } });
    ok(events.length === ne2 && ne2 > ne, 'a restart over it re-reads nothing and says nothing again (the first read said its lines once)', String(events.length - ne2));
    const locked = fakeCli({ version: '2.1.904', builtAt: '2026-12-05T00:00:00Z', catalog: NEW });
    fs.chmodSync(locked, 0o000);
    const n3 = events.length;
    const l1 = await CAT.noteBinary({ cmd: locked, version: '2.1.904', dataDir: d2, which: (c) => c });
    fs.chmodSync(locked, 0o755);
    const l2 = await CAT.noteBinary({ cmd: locked, version: '2.1.904', dataDir: d2, which: (c) => c });
    ok(l1 && l1.reason && l1.reason.code === 'EACCES' && l1.retry === true && l2 && l2.state === 'read' && events.filter((x, i) => i >= n3 && x.n === 'cli-unknown-model-catalog').length === 1, 'an I/O failure (EACCES at first sight, chmod later — the same key) is tried again at a later tick and then read; said once', JSON.stringify([l1 && l1.reason, l2 && l2.state]));
    const bad = fakeCli({ version: '2.1.905', builtAt: '2026-12-06T00:00:00Z', body: lit(NEW).replace('models:[', 'models:[Ye(),') });
    const b1 = await CAT.noteBinary({ cmd: bad, version: '2.1.905', dataDir: d2, which: (c) => c });
    const b2 = await CAT.noteBinary({ cmd: bad, version: '2.1.905', dataDir: d2, which: (c) => c });
    ok(b1.reason.code === 'not-a-literal' && !b1.retry && b2 === b1, 'a CONTENT verdict (not a literal) stays stored: never read again on that binary');
    // small r2 (1): a catalog larger than the bound is refused under its own name, stored as a content verdict
    const big = structuredClone(NEW);
    for (let k = 0; k < 160; k++) big.models.push({ id: `claude-pad-${k}`, family: 'pad', display_name: 'P'.repeat(4000), provider_ids: { first_party: `claude-pad-${k}` } });
    const eb = await CAT.readBinary(fakeCli({ version: '2.1.907', builtAt: '2026-12-08T00:00:00Z', catalog: big }), {});
    ok(eb.state === 'unreadable' && eb.reason.code === 'literal-long' && !eb.retry, 'a catalog larger than the bound (~650 KB) is refused as `literal-long` — not unterminated-string / bad-key — and kept as a content verdict', JSON.stringify(eb.reason));
    // small r2 (2): realpath / stat inside the bound — one that never answers leaves no later tick pending
    const hang = () => new Promise(() => { });
    const rp = await CAT.noteBinary({ cmd: cli900, version: '2.1.900', dataDir: d2, which: (c) => c, fsx: { realpath: hang }, timeoutMs: 20 });
    const after = await CAT.noteBinary({ cmd: locked, version: '2.1.904', dataDir: d2, which: (c) => c });
    ok(rp === null && after && after.state === 'read', 'a realpath that never answers is bounded (null, nothing stored) and the next tick for another binary proceeds');
    // small r2 (3): an entry the reader could not have produced is dropped at load — never a menu that throws for ever
    const d3 = path.join(dir, 'data-shape'); fs.mkdirSync(d3, { recursive: true });
    const good = JSON.parse(fs.readFileSync(path.join(d2, CAT.LEDGER), 'utf8'));
    const k0 = Object.keys(good.binaries)[0];
    fs.writeFileSync(path.join(d3, CAT.LEDGER), JSON.stringify({ schema: 1, current: 'bad1', said: [], binaries: { bad1: { ...good.binaries[k0], models: [null] }, bad2: { ...good.binaries[k0], aliases: { fable: { toString: 1 } } } } }));
    CAT._reset();
    let threw = null; try { CAT.boot({ dataDir: d3, event: ev, log: () => { } }); } catch (e) { threw = e; }
    ok(!threw && CAT.view() === null && ids().join() === SEED.map((r) => r.id).join(), 'a ledger entry with models [null], one with an alias object for a name: dropped at load — boot does not throw, the list is the seed (and the binary is read again at the next tick)');
    CAT._reset();
    // TIDY (acceptance r3, 1): the «said» set forgets nothing still true — 10 000 padding lines after the current ones, two
    // restarts: 0 repeats; a save leaves only lines that are still true
    const dS = path.join(dir, 'data'); const lf = path.join(dS, CAT.LEDGER);
    const ledger0 = JSON.parse(fs.readFileSync(lf, 'utf8'));
    const pad = []; for (let k = 0; k < 10000; k++) pad.push(k % 2 ? `cli-unknown-model-price|claude-pad-${k}|{}|{}|catalog` : `pad-${k}|x`);
    fs.writeFileSync(lf, JSON.stringify({ ...ledger0, said: [...ledger0.said, ...pad] }));
    const nS = events.length;
    for (let r = 0; r < 2; r++) { CAT._reset(); CAT.boot({ dataDir: dS, event: ev, log: () => { } }); new UHM.UsageHistory({ dataDir: path.join(dir, 'uh'), homeDir: path.join(dir, 'uh') }); await note(cli900, '2.1.900'); }
    ok(events.length === nS, `10 000 padding lines after the current ones, two restarts: ${events.length - nS} line(s) said again (r3's load kept only the newest 2 000 and said 7 price lines again)`, JSON.stringify(events.slice(nS).map((x) => x.n)));
    CAT.apply(); // a save
    const saidNow = JSON.parse(fs.readFileSync(lf, 'utf8')).said;
    ok(saidNow.length < 100 && !saidNow.some((k) => k.startsWith('pad-') || k.includes('claude-pad-')) && ledger0.said.every((k) => saidNow.includes(k) || !k.startsWith('cli-model-catalog-read|')), `a save keeps only what is still true (${saidNow.length} lines: the kept builds, their models, the current disagreements) — the file is bounded by that`, String(saidNow.length));
    // …and a save BEFORE any price table has recomputed keeps every price line (unknown is not «ended»): the ledger loaded with
    // no reader fed, a save, THEN a usage-history built ⇒ 0 lines said again (主开发's mutant 2: the clause removed ⇒ all said again)
    const priced = JSON.parse(fs.readFileSync(lf, 'utf8')).said.filter((k) => k.startsWith('cli-unknown-model-price|'));
    CAT._reset(); CAT._load(dS); CAT._saveNow();
    const keptP = JSON.parse(fs.readFileSync(lf, 'utf8')).said.filter((k) => k.startsWith('cli-unknown-model-price|'));
    const nP = events.length;
    CAT.boot({ dataDir: dS, event: ev, log: () => { } }); new UHM.UsageHistory({ dataDir: path.join(dir, 'uh'), homeDir: path.join(dir, 'uh') });
    ok(priced.length > 0 && keptP.length === priced.length && events.length === nP, `a save before any price table reported keeps all ${priced.length} price line(s); the first recomputation after it says ${events.length - nP} again`, JSON.stringify({ priced: priced.length, kept: keptP.length, said: events.slice(nP).map((x) => x.d) }));
    // TIDY (2): an import never drops a typed row in silence — the rows the export marked as the catalog's are named
    fs.mkdirSync(path.join(dir, 'uh7', 'usage-history'), { recursive: true });
    const uh7 = new UHM.UsageHistory({ dataDir: path.join(dir, 'uh7'), homeDir: path.join(dir, 'uh7') });
    const rowT = (i, o) => ({ input: i, output: o, cacheWrite5m: i, cacheWrite1h: i, cacheRead: i / 10 });
    uh7.setPricing({ tiers: { opus: rowT(4, 20), 'haiku-5-5': rowT(0.1, 0.5), sonnet: rowT(3, 15) }, sources: { opus: { from: 'catalog' }, 'haiku-5-5': { from: 'catalog' }, sonnet: { from: 'you' } } });
    const disk7 = JSON.parse(fs.readFileSync(uh7.pricingFile, 'utf8'));
    const persist = fs.readFileSync(path.join(ROOT, 'src/routes/persistence.js'), 'utf8');
    ok(uh7.lastCatalogSkips().join() === 'haiku-5-5,opus' && disk7.tiers.sonnet.input === 3 && /pricingSkipped = uh\?\.lastCatalogSkips\?\.\(\) \|\| \[\];/.test(persist) && /not imported as yours — the export marked these as Claude Code's own prices: \$\{pricingSkipped\.slice\(0, 20\)\.join\(', '\)\}/.test(persist), "an import skips the rows the export marked as the catalog's (opus, haiku-5-5) and SAYS them by key in the import's own summary; the person's own row (sonnet) is written");
    await note(cli900, '2.1.900');
  }

  console.log('§S the smaller laws (acceptance r1)');
  {
    env.AVAILABLE_MODELS.claude.push({ id: 'claude-served-once', label: 'Served once' }); // the passive ingest of a served model
    const nb = bcasts.length;
    await note(fakeCli({ version: '2.1.906', builtAt: '2026-12-07T00:00:00Z', catalog: NEW }), '2.1.906');
    ok(ids().includes('claude-served-once'), '(1) a catalog read keeps the rows that came from elsewhere (the passive ingest, the /v1/models fetch)');
    ok(bcasts.length - nb === 1 && bcasts[bcasts.length - 1].type === 'available-models-dirty', '(2) THE NOTIFY LAW: one recomputation = one `available-models-dirty` signal', JSON.stringify(bcasts.slice(nb)));
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/lib/app.js'), 'utf8');
    ok(/const refreshAvailableModels = \(\) => fetchJson\('\/api\/available-models'\)\.then\(applyAvailableModels\);/.test(appSrc) && /msg\.type === 'available-models-dirty'\) refreshAvailableModels\(\)/.test(appSrc), '(2) …and the client applies the boot fetch and every signal through ONE function (Settings › default model, the session options)');
    const remote = CMC.remoteRows(env.AVAILABLE_MODELS.claude);
    const rIds = remote.map((r) => r.id);
    ok(!rIds.includes('claude-fable-6') && !rIds.includes('quill') && remote.find((r) => r.id === 'fable').label === 'fable' && rIds.includes('claude-fable-5-2') && remote.every((r) => r.context === undefined && r.resolves === undefined), '(3) ANOTHER MACHINE: the shipped rows only, aliases plain, no size or mapping claimed — nothing this hub\'s catalog alone knows', JSON.stringify(rIds));
    const pm = fs.readFileSync(path.join(ROOT, 'src/routes/provider-models.js'), 'utf8'), ap = fs.readFileSync(path.join(ROOT, 'src/lib/app.js'), 'utf8');
    ok(/models: host \? CMC\.remoteRows\(m\.models\) : m\.models/.test(pm) && /menu\(backend, accountOfSession\(s\) \|\| \{ backend \}, s\.host \|\| null\)/.test(pm) && /menu\(backend, null, host\)/.test(pm) && /menu\(backend, a, host\)/.test(pm) && !/if \(s\.host/.test(pm) && /\$\{hostId \? `&host=\$\{encodeURIComponent\(hostId\)\}` : ''\}/.test(ap), '(3) …through ONE `host` parameter on every door: a running conversation\'s machine and the New Session dialog\'s machine (no branch)');
    const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8'), uw = fs.readFileSync(path.join(ROOT, 'src/lib/usage-window.js'), 'utf8');
    ok(/\.usage-price-scroll \{ max-width: 100%; overflow-x: auto;/.test(css) && /\.usage-price-src \{ color: var\(--text-dim\)/.test(css) && /scroll\.className = 'usage-price-scroll'; scroll\.appendChild\(tbl\)/.test(uw), '(4) the price table scrolls sideways on a phone (every column, Source included, reachable); the Source cell has its own rule');
    const rv = CMC.validateCatalog({ models: [{ id: 'claude-x-1', family: 'constructor', display_name: 'X' }, { id: 'claude-y-1', family: 'yy1', display_name: '<img src=x>' }, { id: 'claude-z-1', family: 'zz1', display_name: 'Z'.repeat(80) }], pricing_tiers: {}, aliases: { tostring: { default: 'claude-y-1' }, toString: { default: 'claude-y-1' } }, latest_per_family: { hasOwnProperty: 'claude-y-1' } });
    const codes = rv.refused.map((r) => `${r.id}:${r.field}:${r.code}`);
    ok(codes.includes('claude-x-1:family:reserved-name') && codes.includes('hasOwnProperty:latest_per_family:reserved-name') && codes.some((c) => /^toString:aliases:/.test(c)), '(5) a family / alias / key that is a built-in property name is refused by name', JSON.stringify(codes));
    ok(codes.includes('claude-y-1:display_name:label-chars') && codes.includes('claude-z-1:display_name:label-long'), '(6) a refused display_name is named for what it is: label-chars (markup / control) vs label-long');
  }

  console.log('§M the census — every model-keyed site has a row; every row: no release on an ordinary update, and by which road');
  {
    const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/cli-update-census.json'), 'utf8'));
    const GREP_CANDIDATES = 'fable|opus|sonnet|haiku|mythos|claude-|\\[1m|familyOf|1000000|200000|1e6|2e5'; // one prefilter for git grep (ERE) and the scan
    const KINDS = {
      'family-word': /(?:includes|startsWith|test|match|===|==)\s*\(?\s*['"/`](?:\\b)?(?:fable|opus|sonnet|haiku|mythos)\b/,
      'model-id-literal': /['"`]claude-(?:fable|opus|sonnet|haiku|mythos|3|4)[-a-z0-9.\[\]]*['"`]/,
      'one-m-suffix': /\\\[1m\\\]|'\[1m\]'|"\[1m\]"|\[1m\]\$/,
      'family-of': /\bfamilyOf(?:Model|ScopedBucket)\s*\(/,
      'context-claim': /\b(?:1000000|200000|1e6|2e5)\b.*(?:context|window|ctx)|(?:context|window|ctx).*\b(?:1000000|200000|1e6|2e5)\b/i,
      'family-key': /['"`](?:fable|opus|sonnet|haiku|mythos)(?:[-.][0-9a-z.]+)*(?:\[1m\])?['"`]|(?:^\s*|[{,]\s*)(?:fable|opus|sonnet|haiku|mythos)\s*:/,
    };
    // a file that holds none of the kinds' key words cannot hold a site: skipped before any line is split (the census's cost)
    const MAYBE = new RegExp(GREP_CANDIDATES); // `\[1m` (no closing bracket): the plain [1m] AND the escaped regex form \[1m\]
    const scan = (files) => { const hits = new Map(); for (const [rel, text] of files) if (MAYBE.test(text)) text.split('\n').forEach((l) => { const s = l.trim(); if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return; for (const [k, re] of Object.entries(KINDS)) if (re.test(l)) hits.set(rel + '|' + k, (hits.get(rel + '|' + k) || 0) + 1); }); return hits; };
    // what is SOURCE = what git tracks (scripts/tracked-files.mjs): a generated bundle (data/bin/vibespace-agentd.js) is out of scope by construction
    // the candidates: `git grep -l` over the TRACKED files (the same scope as trackedFiles — a generated bundle is out by
    // construction), git doing the scan; every candidate is then judged line by line below
    const cand = new Set(execFileSync('git', ['-C', ROOT, 'grep', '-lE', GREP_CANDIDATES, '--', 'src', 'data/bin', 'server.js'], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 1 << 26 }).split('\n').filter(Boolean));
    const files = trackedFiles(ROOT, 'src', 'data/bin', 'server.js').filter((rel) => cand.has(rel)).filter((rel) => (/\.(c|m)?js$/.test(rel) || rel.startsWith('data/bin/')) && !/\/i18n-[a-z]+\.js$/.test(rel) && !/\.min\.js$/.test(rel) && !/\/vendor\//.test(rel)).map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]);
    const hits = scan(files);
    const rowKeys = new Set(C.rows.filter((r) => r.match).map((r) => r.file + '|' + r.match));
    const unrowed = [...hits.keys()].filter((k) => !rowKeys.has(k)), dead = [...rowKeys].filter((k) => !hits.has(k));
    console.log(`  (the grep: ${hits.size} model-keyed sites in ${files.length} candidate files)`);
    ok(!unrowed.length, 'every model-keyed site in src/ has a census row', unrowed.join(', '));
    ok(!dead.length, 'no census row is dead (its site still exists)', dead.join(', '));
    const shape = C.rows.every((r) => typeof r.id === 'string' && r.id && fs.existsSync(path.join(ROOT, r.file)) && r.keyedOn === 'model' && r.needsReleaseOnOrdinaryUpdate === false && typeof r.road === 'string' && r.road.length > 10 && typeof r.suite === 'string' && fs.existsSync(path.join(ROOT, 'scripts', r.suite + '.mjs')));
    ok(shape && new Set(C.rows.map((r) => r.id)).size === C.rows.length, `every one of the ${C.rows.length} rows: {id, file, keyedOn, needsReleaseOnOrdinaryUpdate: false, road, suite} — no release of ours on an ordinary update`);
    const counted = C.rows.filter((r) => r.match), moved = counted.filter((r) => hits.get(r.file + '|' + r.match) !== r.sites);
    ok(!moved.length && counted.every((r) => Number.isInteger(r.sites) && r.sites > 0), `every row's site count is the tree's (${counted.reduce((n, r) => n + r.sites, 0)} sites): a new site in an already-rowed file is judged again`, moved.map((r) => `${r.id} ${r.sites} → ${hits.get(r.file + '|' + r.match)}`).join(', '));
    const planted = scan([['src/planted.js', "const T = { 'claude-fable-6': { input: 6 } };\nif (m.includes('sonnet')) x();\nconst M = new Map([['fable-6', { input: 6 }], ['quill', {}]]);\nswitch (fam) { case 'fable': a(); }\n"], ['src/planted-rate.js', "const RATE = { opus: { input: 1 }, sonnet: { input: 2 } };\n"]]);
    red(['model-id-literal', 'family-word', 'family-key'].every((k) => planted.has('src/planted.js|' + k) && !rowKeys.has('src/planted.js|' + k)) && planted.has('src/planted-rate.js|family-key'), 'a new model-keyed table planted in src/ (an id-keyed row, a family-word branch, a Map on short ids, a switch on a family, an unquoted `{ opus: …, sonnet: … }` on ONE line) is a site with no row');
    const escaped = 'const core = (m) => String(m).replace(/\\s*\\[1m\\]$/, \'\');\n';
    red(MAYBE.test(escaped) && new RegExp(GREP_CANDIDATES).test(escaped) && scan([['src/planted-1m.js', escaped]]).has('src/planted-1m.js|one-m-suffix'), 'a file whose only model site is the ESCAPED [1m] regex passes both prefilters (git grep and the scan) and is a site: r3\'s cheaper census missed it');
    const anchorsSrc = files.find(([r]) => r === 'src/usage-anchors.js')[1], uhSrc = files.find(([r]) => r === 'src/usage-history.js')[1];
    const grown = scan([['src/usage-anchors.js', anchorsSrc + "\nif (m.includes('opus')) y();\n"], ['src/usage-history.js', uhSrc.replace("  'fable-5-2': {", "  'fable-6': { input: 6, output: 30, cacheWrite5m: 7.5, cacheWrite1h: 12, cacheRead: 0.6 },\n  'fable-5-2': {")]]);
    const rowOf = (k) => C.rows.find((r) => r.file + '|' + r.match === k);
    red(grown.get('src/usage-anchors.js|family-word') !== rowOf('src/usage-anchors.js|family-word').sites && grown.get('src/usage-history.js|family-key') !== rowOf('src/usage-history.js|family-key').sites, 'a new site in an already-rowed file (an `includes(\'opus\')` in usage-anchors; a `fable-6` row in DEFAULT_PRICING) moves its row\'s count — red');
  }
} catch (e) { fail++; console.log('  ✗ the drill threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skip} skipped)` : `\nALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
