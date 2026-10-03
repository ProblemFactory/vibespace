#!/usr/bin/env node
// ALL AGENTS — ONE PRINCIPAL IN EVERY PERMISSION SURFACE (fast; lane everyone-principal, 2026-10-02 — the owner:
// "所有配置权限的地方都加入"所有"这个选项，userW说有些浏览器profile啥的他想让所有agent共享使用").
//
//   ① THE CENSUS (grep-derived, printed): every `principalPicker({…})` call in src/lib is a permission surface that
//      offers the ALL AGENTS row (`everyone:` in its options) or is EXEMPT with a reason; every PURE reach / ACL model
//      (a file that declares PRINCIPAL_KINDS / WHO_KINDS / OWNER_KINDS, or is named *-acl.js / *-reach.js) is a row
//      with the spelling of "everyone" it carries — a new surface or model without a row is RED. The raw-API lane's
//      module (src/channel-api*.js, not landed) inherits the row: when it lands it must spell `everyone`. Two planted
//      controls: a picker call without the row, a model whose kinds lack it.
//   ② THE PURE TABLES per model: everyone + specific rows ⇒ MAX (a specific row never narrows below All), widen-only,
//      removing All restores the specific rows exactly; exit reach's `everyone` and a browser profile's `all` ARE the
//      All row (no second spelling: an `everyone` ROW is refused there) and keep the rows picked beside it.
//   ③ THE MONEY RULE over the REAL channels engine: an All-agents watcher wakes every RUNNING conversation, each under
//      ITS OWN daily cap (N conversations × cap 2 ⇒ exactly 2 wakes each, the rest held), a conversation that starts
//      later gets its own fresh cap, a named agent beside All is never billed twice for the same hits. Controls (patched
//      engine copies): one shared ledger ⇒ 2 wakes in all; no cap on the fan-out ⇒ every hit bills everybody.
//   ④ THE REQUEST FLOW: an agent's `request` on a conversation All agents may see is answered "already allowed" — no
//      For-you card.
//   ⑤ WIRING PINS: every dialog maps the All row onto its own model's spelling.
//   ⑥ i18n: the new words are in both dictionaries.
// Run: node scripts/test-everyone-principal.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { gitEnvFrom } from './git-env.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const J = (x) => JSON.stringify(x);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const tracked = execFileSync('git', ['ls-files', 'src'], { cwd: REPO, encoding: 'utf-8', env: gitEnvFrom(process.env) }).split('\n').filter((f) => f.endsWith('.js'));

const ROOT = scratch('evp');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const M = mutantCopies('evp', REPO);

// ═══ ① THE CENSUS ═══════════════════════════════════════════════════════════
console.log('① the census: every permission surface offers ALL AGENTS (or says why not); every reach model spells it');
/** Every `principalPicker({ … })` CALL of a source text: `[{at, text}]` — the options object, braces balanced (strings
 *  and template literals skipped). The definition (`function principalPicker(`) is not a call. */
function pickerCalls(src) {
  const out = [];
  const re = /(?<![\w.])principalPicker\(\{/g;
  let m;
  while ((m = re.exec(src))) {
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
    let i = m.index + 'principalPicker('.length, depth = 0, q = null;
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    out.push({ at: src.slice(0, m.index).split('\n').length, text: src.slice(start, i) });
  }
  return out;
}
/** THE SURFACES (one row per permission surface; `match` picks its call inside its file). `before` = did the surface
 *  offer "everyone" before this lane, and how. */
const SURFACES = [
  { file: 'src/lib/channel-filter-editor.js', match: /placeholder: t\('Add an agent or group…'\)/, surface: 'Channels · Grant access… (who may read and act)', model: 'channel-filter ACCESS + channel-acl reach', before: 'no', spelled: "{kind:'everyone', id:'*'} access row" },
  { file: 'src/lib/channel-filter-editor.js', match: /placeholder: t\('Who gets woken\?'\)/, surface: 'Channels · Notify… (who is woken)', model: 'channel-filter WATCHERS (fan-out, a cap per conversation)', before: 'no', spelled: "{kind:'everyone', id:'*'} watcher — offered when All holds access ('roster')" },
  { file: 'src/lib/channel-reach-editor.js', match: /placeholder: t\('Grant reach to…'\)/, surface: 'Channels · Reach & policy → Grant reach to…', model: 'channel-acl', before: 'no', spelled: "{kind:'everyone', id:'*'} grant" },
  { file: 'src/lib/window-share.js', match: /label: t\('Share with agents'\)/, surface: 'Desktop app · Share with agents (launcher row + window dialog)', model: 'window-reach', before: 'no', spelled: "{kind:'everyone', id:'*'} reach row" },
  { file: 'src/lib/exit-access-dialog.js', match: /label: grant === 'use'/, surface: 'Machine · Who can use <machine>? (network + commands)', model: 'exit-reach', before: 'yes — the "All my conversations" radio', spelled: "mode 'everyone' (the radio is gone; the picker's All row IS the mode, rows kept beside it)" },
  { file: 'src/lib/browser-who-dialog.js', match: /label: t\('Who can use it'\)/, surface: 'Agent browser · Who can use <profile>?', model: 'browser-profiles who-list', before: 'yes — the "All my conversations" radio (the default)', spelled: "use.mode 'all' = owner {kind:'instance'} (rows kept as owner.who)" },
  { file: 'src/lib/browser-new-profile.js', match: /label: t\('Who can use it'\)/, surface: 'Agent browser · New profile… → Who can use it (the .200 dialog, folded onto the one control at the 2.369.202 integration)', model: 'browser-profiles who-list', before: 'yes — the "All my conversations" radio (the default)', spelled: "use.mode 'all' (the create body sends no list)" },
];
const EXEMPT = [
  { file: 'src/lib/channel-group-dialogs.js', match: /label: t\('Members'\)/, surface: 'Agent group · New group / Invite…', why: 'MEMBERSHIP, not a permission: a group is its named members (design §22 D1, explicit); "every conversation" would be a broadcast channel, a different feature — reach to outsiders is msg-acl\'s (below)' },
  { file: 'src/lib/window-share.js', match: /label: t\('Agent'\)/, surface: 'Desktop app · Ask an agent to take control…', why: 'a REQUEST to ONE agent (it is told and may be woken — a billed turn): "all agents" would be a fan-out of billed turns nobody chose; the share above is where All is offered' },
];
/** THE MODELS (grep-derived candidates must each be a row; `spelled(mod)` proves the spelling is really there). */
const MODELS = [
  { file: 'src/lib/principal-picker-model.js', model: 'THE picker (every surface above)', before: 'no', spelled: "row kind 'everyone' (everyoneRow), first", esm: true, check: (m) => m.PRINCIPAL_KINDS.includes('everyone') && m.everyoneRow().kind === 'everyone' },
  { file: 'src/channel-acl.js', model: 'channel reach grants (hidden < requestable < visible)', before: 'no', spelled: "principal {kind:'everyone', id:'*'}, via 'everyone'", check: (m) => m.PRINCIPAL_KINDS.includes('everyone') && m.principalApplies({ kind: 'agent', id: 'x' }, { principal: { kind: 'everyone', id: '*' } }) },
  { file: 'src/channel-filter.js', model: 'channel ACCESS + WATCHERS per grain', before: 'no', spelled: "principal {kind:'everyone', id:'*'}; watcher fan-out everyone:*><cid>", check: (m) => m.PRINCIPAL_KINDS.includes('everyone') && m.principalKey({ kind: 'everyone', id: 'q' }) === 'everyone:*' },
  { file: 'src/window-reach.js', model: 'desktop-app window reach (hidden by default)', before: 'no', spelled: "row principal {kind:'everyone', id:'*'}, via 'everyone'", check: (m) => m.PRINCIPAL_KINDS.includes('everyone') && m.reachFor({ rows: [{ principal: { kind: 'everyone', id: '*' } }] }, { sessionKeys: ['claude:x'] }).level === 'exposed' },
  { file: 'src/exit-reach.js', model: 'machine exit reach (use / run)', before: 'yes', spelled: "mode 'everyone' (an everyone ROW refused — one spelling)", check: (m) => m.MODES.includes('everyone') },
  { file: 'src/browser-profiles.js', model: 'agent-browser profile who-may-use', before: 'yes', spelled: "owner {kind:'instance'} ⇒ whoMayUse mode 'all'", check: (m) => m.whoMayUse({ owner: { kind: 'instance', id: null } }).mode === 'all' },
  { file: 'src/msg-acl.js', model: 'agent ↔ agent messaging reach (Task Group / session levels)', before: 'yes', spelled: "externalVisibility / reachability 'visible' | 'messageable' — open to EVERY outsider (no principal list to add a row to)", check: (m) => m.levelFor({ groups: ['g'], reachability: 'inherit' }, ['other'], () => 'messageable') === 'messageable' },
];
/** Informational rows the census prints (no picker, no principal list): what the brief named that is not a surface. */
const NOT_SURFACES = [
  { what: 'Task Group (its own lists)', why: 'its members ARE the group (bindings / folders); its reach to outsiders is msg-acl\'s externalVisibility (row above)' },
  { what: 'integration-registry `consumers` / browser-backend key consumers', why: 'code modules that read a credential, never an agent principal — nothing to grant to "all agents"' },
];
function census(files) {
  const calls = [];
  for (const [f, src] of Object.entries(files)) for (const c of pickerCalls(src)) calls.push({ file: f, ...c });
  const rows = [...SURFACES.map((r) => ({ ...r, kind: 'surface' })), ...EXEMPT.map((r) => ({ ...r, kind: 'exempt' }))];
  const problems = [];
  for (const c of calls) {
    const hit = rows.filter((r) => r.file === c.file && r.match.test(c.text));
    if (hit.length !== 1) { problems.push(`${c.file}:${c.at} — ${hit.length ? 'matched by ' + hit.length + ' rows' : 'a principal picker no census row names (a new permission surface: offer ALL AGENTS with `everyone:` and add its row, or EXEMPT it with a reason)'}`); continue; }
    c.row = hit[0];
    if (hit[0].kind === 'surface' && !/\beveryone\s*:/.test(c.text)) problems.push(`${c.file}:${c.at} — ${hit[0].surface}: no ALL AGENTS row (\`everyone:\` missing from its options)`);
  }
  for (const r of rows) { const n = calls.filter((c) => c.row === r).length; if (n !== 1) problems.push(`${r.file} — the row "${r.surface}" matches ${n} calls (stale census row)`); }
  return { calls, problems };
}
const libFiles = Object.fromEntries(tracked.filter((f) => f.startsWith('src/lib/')).map((f) => [f, read(f)]));
const real = census(libFiles);
ok(!real.problems.length && real.calls.length === SURFACES.length + EXEMPT.length, `every principal picker in src/lib is a census row: ${real.calls.length} calls = ${SURFACES.length} surfaces offering ALL AGENTS + ${EXEMPT.length} exempt with a reason`, real.problems);
// the models
const MODEL_RE = /\b(PRINCIPAL_KINDS|WHO_KINDS|OWNER_KINDS)\s*=/;
const candidates = tracked.filter((f) => MODEL_RE.test(read(f)) || /(^|\/|-)(acl|reach)\.js$/.test(f));
const unlisted = candidates.filter((f) => !MODELS.some((m) => m.file === f));
ok(!unlisted.length && candidates.length === MODELS.length, `every reach / ACL model is a row (${candidates.length} grep-derived: ${candidates.join(', ')})`, unlisted.length ? `no row: ${unlisted.join(', ')}` : MODELS.filter((m) => !candidates.includes(m.file)).map((m) => m.file));
const loaded = {};
for (const m of MODELS) {
  let mod = null;
  try { mod = m.esm ? await import(pathToFileURL(path.join(REPO, m.file)).href) : require(path.join(REPO, m.file)); } catch (e) { mod = null; }
  loaded[m.file] = mod;
  let good = false; try { good = !!mod && !!m.check(mod); } catch { good = false; }
  ok(good, `${m.file} spells ALL AGENTS: ${m.spelled}`);
}
// the raw-API lane INHERITS the row (its tier lives on the access row — design: "TIER per (credential, principal) on
// the EXISTING access row"): when its module lands it must spell `everyone` (the default tier under All = read)
const rawApi = tracked.filter((f) => /^src\/(lib\/)?channel-api[\w-]*\.js$/.test(f));
if (rawApi.length) for (const f of rawApi) ok(/\beveryone\b/.test(read(f)), `${f} (the raw-API tiers) spells ALL AGENTS — the tier under All is read at most by default`);
else ok(true, 'the raw-API tier module has not landed (src/channel-api*.js) — when it does, this census requires it to spell `everyone` (its tier rides the access row this lane extended)');
// THE PRINTED TABLE (the report's)
console.log('\n  surface · model · had "everyone" before this lane · how it is spelled now');
for (const r of SURFACES) console.log(`  · ${r.surface} · ${r.model} · ${r.before} · ${r.spelled}`);
for (const r of EXEMPT) console.log(`  · ${r.surface} · EXEMPT — ${r.why}`);
for (const m of MODELS) console.log(`  · [model] ${m.file} · ${m.model} · ${m.before} · ${m.spelled}`);
for (const n of NOT_SURFACES) console.log(`  · [not a surface] ${n.what} — ${n.why}`);
console.log('  · [inherits] the raw-API tier rows (SharedContext/vibespace-channel-raw-api-design.md) — the access row\'s everyone principal; default tier under All = read\n');
// CONTROLS
{
  const f = 'src/lib/channel-reach-editor.js';
  const planted = { ...libFiles, [f]: libFiles[f].replace(", everyone: { key: 'everyone:*' } });", ' });') };
  const c1 = census(planted);
  ok(planted[f] !== libFiles[f] && c1.problems.some((p) => /Grant reach to/.test(p) && /no ALL AGENTS row/.test(p)), 'CONTROL (1): the reach editor\'s picker without `everyone:` is RED (a surface without the All row)', c1.problems);
  const plantedNew = { ...libFiles, 'src/lib/planted-share.js': "import { principalPicker } from './principal-picker.js';\nconst p = principalPicker({ items: [], multi: true, label: t('Planted') });\n" };
  ok(census(plantedNew).problems.some((p) => /planted-share\.js/.test(p) && /no census row names/.test(p)), 'CONTROL (1b): a NEW picker call no row names is RED (a new permission surface must say how it offers All agents)');
  // (2) a NEW model file declaring a principal kind list is a candidate with no row ⇒ red; a REAL model whose kinds
  // lose `everyone` (a patched copy of channel-acl, loaded) fails its own spelling check ⇒ red
  const unlistedOf = (texts) => Object.entries(texts).filter(([f, src]) => (MODEL_RE.test(src) || /(^|\/|-)(acl|reach)\.js$/.test(f)) && !MODELS.some((m) => m.file === f)).map(([f]) => f);
  const realTexts = Object.fromEntries(tracked.map((f) => [f, read(f)]));
  ok(!unlistedOf(realTexts).length && J(unlistedOf({ ...realTexts, 'src/planted-thing.js': "const PRINCIPAL_KINDS = Object.freeze(['agent', 'group']);\n" })) === J(['src/planted-thing.js']), 'CONTROL (2a): a planted model declaring PRINCIPAL_KINDS (without a census row) is RED');
  const aclSrc = read('src/channel-acl.js');
  const LINE = "const PRINCIPAL_KINDS = Object.freeze(['agent', 'group', 'everyone']);";
  const noAll = aclSrc.includes(LINE) ? M.load('src/channel-acl.js', aclSrc.replace(LINE, "const PRINCIPAL_KINDS = Object.freeze(['agent', 'group']);"), 'no-everyone') : null;
  let spelled = true; try { spelled = !!MODELS.find((m) => m.file === 'src/channel-acl.js').check(noAll); } catch { spelled = false; }
  ok(!!noAll && !spelled, 'CONTROL (2b): channel-acl with `everyone` dropped from its kinds fails its census spelling check — RED');
}

// ═══ ② THE PURE TABLES ══════════════════════════════════════════════════════
console.log('② the PURE tables: everyone + specific rows — MAX, widen-only, removing All restores the specific rows');
const ACL = require(path.join(REPO, 'src/channel-acl.js'));
const F = require(path.join(REPO, 'src/channel-filter.js'));
const R = require(path.join(REPO, 'src/window-reach.js'));
const E = require(path.join(REPO, 'src/exit-reach.js'));
const B = require(path.join(REPO, 'src/browser-profiles.js'));
{
  // channel-acl
  const target = { key: 'lark-1/c1', adapterId: 'lark-1' };
  const ALL = { kind: 'everyone', id: '*' };
  const gA = (principal, level, scope = { kind: 'conversation', id: target.key }, origin = 'user') => ACL.validateGrant({ principal, scope, level, origin }).grant;
  const ag = { kind: 'agent', id: 'cid-a', groups: ['tg-1'] };
  const T = [
    ['All visible, nothing else', [gA(ALL, 'visible')], ag, 'visible', 'everyone'],
    ['All visible + agent requestable (a specific row never narrows)', [gA({ kind: 'agent', id: 'cid-a' }, 'requestable'), gA(ALL, 'visible')], ag, 'visible', 'everyone'],
    ['agent visible + All requestable', [gA(ALL, 'requestable'), gA({ kind: 'agent', id: 'cid-a' }, 'visible')], ag, 'visible', 'agent'],
    ['All at the account scope', [gA(ALL, 'visible', { kind: 'adapter', id: 'lark-1' }, 'access')], ag, 'visible', 'everyone'],
    ['All on ANOTHER conversation', [gA(ALL, 'visible', { kind: 'conversation', id: 'lark-1/c2' })], ag, 'hidden', 'default'],
    ['All never names the user ctx (the user is not an agent)', [gA(ALL, 'visible')], { kind: 'user' }, 'hidden', 'default'],
    ['All never names an id-less ctx', [gA(ALL, 'visible')], { kind: 'agent' }, 'hidden', 'default'],
  ];
  const bad = T.filter(([, gs, ctx, lv, via]) => { const e = ACL.effective(ctx, target, gs); return e.level !== lv || e.via !== via; }).map(([n, gs, ctx]) => [n, ACL.effective(ctx, target, gs)]);
  ok(!bad.length, `channel-acl: ${T.length}-row table — MAX over the agent's / its group's / All's rows, via named`, bad);
  const v = ACL.validateGrant({ principal: { kind: 'everyone', id: 'anything', name: 'x' }, scope: { kind: 'conversation', id: target.key }, level: 'visible', origin: 'access' });
  ok(v.ok && v.grant.principal.id === '*' && v.grant.principal.name === null && ACL.grantId(v.grant) === 'everyone:*|conversation:lark-1/c1|access', 'channel-acl: ONE spelling on disk ({kind:everyone, id:*}, no name), one row per (All, scope, origin)');
  const both = ACL.applyGrant(ACL.applyGrant([gA({ kind: 'agent', id: 'cid-a' }, 'requestable')], gA(ALL, 'visible')), gA({ kind: 'group', id: 'tg-1' }, 'requestable'));
  const back = ACL.removeGrant(both, { principal: ALL, scope: { kind: 'conversation', id: target.key }, origin: 'user' });
  ok(back.length === 2 && J(back.map((g) => g.principal.id)) === J(['cid-a', 'tg-1']) && ACL.effective(ag, target, back).level === 'requestable', 'channel-acl: removing All leaves every specific row exactly as it was (requestable again)');
}
{
  // channel-filter: access + watchers + the fan-out
  const ALL = { kind: 'everyone', id: '*' };
  const va = F.validateAccess([{ principal: { kind: 'everyone', id: 'x', name: 'All' }, authority: 'draft' }, { principal: { kind: 'agent', id: 'cid-a', name: 'A' }, authority: 'send' }], { policyRequiresReview: false, offersSend: true });
  ok(va.ok && va.access[0].principal.id === '*' && va.access[0].principal.name === null && F.principalKey(va.access[0].principal) === 'everyone:*', 'channel-filter: an All access row is stored {kind:everyone, id:*}, keyed everyone:*', va);
  ok(F.rowNames({ principal: ALL }, { kind: 'agent', id: 'zz' }) && !F.rowNames({ principal: ALL }, { kind: 'user' }) && F.rowNames({ principal: { kind: 'everyone', id: '*', target: 'c1' } }, { kind: 'agent', id: 'c1' }) && !F.rowNames({ principal: { kind: 'everyone', id: '*', target: 'c1' } }, { kind: 'agent', id: 'c2' }), 'channel-filter: an All row names EVERY agent (a fan-out target names its own conversation only)');
  const vw = F.validateWatchers([{ principal: ALL, notify: 'wake' }], [{ principal: { kind: 'agent', id: 'cid-a' } }]);
  ok(!vw.ok && vw.code === 'watcher-needs-access' && /all agents has no access here/.test(vw.error), 'channel-filter: an All watcher NEEDS All\'s access row (watcher-needs-access, worded "all agents")', vw);
  const eff = F.effectiveGrants({ conversation: { access: [{ principal: { kind: 'agent', id: 'cid-a' }, authority: 'draft' }], watchers: [] }, account: { access: [{ principal: ALL, authority: 'send' }], watchers: [{ principal: ALL, notify: 'wake', mode: 'all', dailyWakeCap: 2 }] } }, {});
  const authFor = (ctx) => (eff.access.some((x) => F.rowNames(x.row, ctx) && x.row.authority === 'send') ? 'send' : 'draft');
  ok(eff.access.length === 2 && authFor({ kind: 'agent', id: 'cid-a' }) === 'send' && authFor({ kind: 'agent', id: 'cid-z' }) === 'send', 'channel-filter: A\'s own draft row never narrows All\'s send (authority = MAX over every row naming the agent — the engine\'s rule)');
  const rmAll = F.effectiveGrants({ conversation: { access: [{ principal: { kind: 'agent', id: 'cid-a' }, authority: 'draft' }], watchers: [] }, account: { access: [], watchers: [] } }, {});
  ok(rmAll.access.length === 1 && rmAll.access[0].row.principal.id === 'cid-a' && rmAll.access[0].row.authority === 'draft', 'channel-filter: removing All leaves A\'s own row as it was');
  // THE FAN-OUT
  const root = { principal: ALL, notify: 'wake', mode: 'all', dailyWakeCap: 2, stats: { wakes: [{ at: 1, ok: true }], fan: { c2: { wakes: [{ at: 5, ok: true }], hits: [] } } } };
  const live = [{ cid: 'c1', name: 'One' }, { cid: 'c2', name: 'Two' }, { cid: 'c2', name: 'dup' }, { cid: '' }, { cid: 'c3' }];
  const fo = F.fanOutWatchers({ access: [], watchers: [{ watcher: { principal: { kind: 'agent', id: 'cid-a' } }, source: 'conversation' }, { watcher: root, source: 'account', patternId: null, why: [] }] }, live);
  const keys = fo.watchers.map((x) => F.principalKey(x.watcher.principal));
  ok(J(keys) === J(['agent:cid-a', 'everyone:*>c1', 'everyone:*>c2', 'everyone:*>c3']), 'fan-out: the All watcher becomes ONE item per running conversation (deduped, id-less dropped), in its place, each its own key', keys);
  ok(fo.watchers[2].watcher.stats.wakes.length === 1 && fo.watchers[2].watcher.stats.wakes[0].at === 5 && fo.watchers[1].watcher.stats.wakes.length === 0 && fo.watchers[1].watcher.dailyWakeCap === 2 && fo.watchers[1].fan.cid === 'c1' && fo.watchers[1].source === 'account', 'fan-out: each target carries ITS OWN ledger (stats.fan[cid]) and the stored row\'s settings — never the shared stats.wakes');
  ok(F.fanOutWatchers({ access: [], watchers: [{ watcher: root, source: 'account' }] }, []).watchers.length === 0, 'fan-out: nobody running ⇒ nobody woken (an All watcher is never a target of its own)');
  const noAll = { access: [], watchers: [{ watcher: { principal: { kind: 'agent', id: 'a' } } }] };
  ok(F.fanOutWatchers(noAll, live) === noAll, 'fan-out: an answer without an All watcher is returned untouched (the same object)');
  ok(J(F.fanOfKey('everyone:*>c9')) === J({ root: 'everyone:*', cid: 'c9' }) && F.fanOfKey('everyone:*') === null && F.fanOfKey('agent:x') === null && F.fanTargetOf({ kind: 'everyone', id: '*', target: 'c9' }) === 'c9', 'fan-out keys: everyone:*><cid> ⇄ {root, cid}');
  ok(F.ledgerRowsOf(root.stats).length === 2, 'the card counts an All row\'s wakes over every conversation\'s ledger');
  const st = { fan: { old: { wakes: [{ at: 1 }], hits: [] }, fresh: { wakes: [{ at: 9e12 }], hits: [] } } };
  F.pruneFan(st, 9e12 + 1000);
  ok(J(Object.keys(st.fan)) === J(['fresh']), 'pruneFan: a conversation with nothing in its 7-day window leaves the map (it never grows with every conversation that ever ran)');
  ok(F.expectedWakesTotal([{ principal: ALL, notify: 'wake', matchedPerDay: 10, dailyWakeCap: 2 }, { principal: { kind: 'agent', id: 'a' }, notify: 'wake', matchedPerDay: 10, dailyWakeCap: 3 }], { running: 4 }) === 11, 'the Notify total counts All as one budget PER RUNNING conversation (2 × 4 + 3)');
}
{
  // window-reach
  const ALLP = { kind: 'everyone', id: '*' };
  const rec0 = R.emptyRecord('w1');
  const g1 = R.grant(rec0, ALLP, { by: 'user', at: 1 });
  const g2 = R.grant(g1.record, { kind: 'session', id: 'claude:abc', name: 'A' }, { by: 'user', at: 2 });
  const g3 = R.grant(g2.record, { kind: 'group', id: 'tg-1' }, { by: 'user', at: 3 });
  const T = [
    [g1.record, { sessionKeys: ['claude:zzz'] }, 'exposed', 'everyone'],
    [g3.record, { sessionKeys: ['claude:abc'] }, 'exposed', 'session'],
    [g3.record, { sessionKeys: ['claude:zzz'], groupIds: ['tg-1'] }, 'exposed', 'group'],
    [g3.record, { sessionKeys: ['claude:zzz'] }, 'exposed', 'everyone'],
    [g1.record, { sessionKeys: [] }, 'hidden', null],
    [rec0, { sessionKeys: ['claude:zzz'] }, 'hidden', null],
  ];
  const bad = T.filter(([rec, ctx, lv, via]) => { const r = R.reachFor(rec, ctx); return r.level !== lv || r.via !== via; }).map(([rec, ctx]) => [ctx, R.reachFor(rec, ctx)]);
  ok(!bad.length, `window-reach: ${T.length}-row table — All exposes every agent session, a session's / group's own row is named first, no caller ⇒ hidden`, bad);
  ok(g1.changed && g1.row.principal.id === '*' && !g1.row.principal.name && !R.grant(g1.record, { kind: 'everyone', id: 'other' }).changed, 'window-reach: ONE All row (any id spells *; a second grant changes nothing)');
  const rv = R.revoke(g3.record, ALLP);
  ok(rv.changed && J(rv.record.rows.map((r) => r.principal.kind)) === J(['session', 'group']) && R.reachFor(rv.record, { sessionKeys: ['claude:zzz'] }).level === 'hidden', 'window-reach: revoking All drops only the All row — the session and group rows stay as they were');
  const pm = R.pickerModel({ sessions: [{ id: 's1', name: 'A', backend: 'claude', backendSessionId: 'abc' }], groups: [], record: g1.record });
  ok(pm.everyone && pm.everyone.checked === true && !pm.others.length && R.pickerModel({ sessions: [], groups: [], record: rec0 }).everyone.checked === false, 'window-reach: the picker model answers All as its own entry (checked from the record), never as an "other"');
  const ns = R.normShare({ principals: [ALLP, { kind: 'group', id: 'tg-1' }], mode: 'auto' });
  ok(ns.ok && ns.share.principals[0].kind === 'everyone' && R.launchSummary({ touched: true, choice: { principals: [ALLP], mode: 'auto' } }).hidden === false && R.principalsNow([ALLP], { sessions: [], groups: [] })[0].absent === undefined, 'window-reach: a launch share may carry All (never "absent", never "hidden")');
}
{
  // exit-reach: All IS the everyone mode (no second spelling) and keeps the rows picked beside it
  const cur = E.exitAccessOf(null);
  const rows = [{ kind: 'group', id: 'tg-1' }, { kind: 'session', id: 'claude:abc' }];
  const v1 = E.patchVerdict(cur, { use: { mode: 'everyone', who: rows } });
  ok(v1.ok && v1.access.use.mode === 'everyone' && v1.access.use.who.length === 2, 'exit-reach: everyone + the rows picked beside it — accepted, the rows KEPT', v1);
  const stored = E.storedExit(v1.access);
  const back = E.exitAccessOf({ exit: stored });
  ok(J(stored.use.who) === J(rows) && back.use.mode === 'everyone' && J(back.use.who) === J(rows), 'exit-reach: stored and read back — the kept rows survive the disk');
  ok(E.exitVerdict(back, 'use', { sessionKeys: ['claude:nobody'] }).ok && E.exitVerdict(back, 'use', { sessionKeys: ['claude:nobody'] }).via === 'everyone', 'exit-reach: everyone admits every caller (the kept rows decide nothing — no change to what a grant allows)');
  const v2 = E.patchVerdict(back, { use: { mode: 'only', who: back.use.who } });
  ok(v2.ok && v2.access.use.mode === 'only' && J(v2.access.use.who) === J(rows) && !E.exitVerdict(v2.access, 'use', { sessionKeys: ['claude:nobody'] }).ok, 'exit-reach: taking All away restores EXACTLY the rows that were picked (the dialog sends them back)');
  const v3 = E.patchVerdict(cur, { use: { mode: 'only', who: [{ kind: 'everyone', id: '*' }] } });
  ok(!v3.ok && v3.code === 'bad_principal' && /mode "everyone"/.test(v3.error), 'exit-reach: an `everyone` ROW is refused bad_principal — All agents is the mode (one spelling)', v3);
  ok(E.exitAccessOf({ exit: { use: { mode: 'only', who: [{ kind: 'everyone', id: '*' }, { kind: 'group', id: 'tg-1' }] }, run: { mode: 'nobody' } } }).use.who.length === 1, 'exit-reach: an `everyone` row on disk is dropped at the read (never consulted as a list row)');
  ok(E.patchVerdict(cur, { use: { mode: 'everyone' } }).ok && E.patchVerdict(cur, { use: { mode: 'nobody', who: rows } }).access.use.who.length === 0, 'exit-reach: everyone with no rows is fine; nobody keeps none');
}
{
  // browser-profiles: All IS `all` (owner instance) and keeps the rows
  const p0 = { id: 'p-1', label: 'work', owner: { kind: 'only', who: [{ kind: 'task', id: 'tg-1' }] } };
  const K = 'bk-0a1b2c3d';
  const v1 = B.usePatchVerdict({ profile: p0, use: { mode: 'all', who: [{ kind: 'task', id: 'tg-1' }, { kind: 'session', key: K }] }, knownTask: () => true, knownKey: () => true });
  ok(v1.ok && v1.owner.kind === 'instance' && v1.owner.who.length === 2, 'browser-profiles: all + the rows picked beside it ⇒ owner {kind:instance, who:[…]}', v1);
  const p1 = { ...p0, owner: v1.owner };
  const U = B.whoMayUse(p1);
  ok(U.mode === 'all' && U.kept.length === 2 && B.mayAttach(p1, { browserKey: 'bk-99999999' }).ok && B.mayAttach(p1, { browserKey: 'bk-99999999' }).via === 'all', 'browser-profiles: whoMayUse answers all (+ kept) — every conversation is admitted, the kept rows decide nothing');
  ok(J(B.useDigestOf(p1)) === J({ mode: 'all', who: [{ kind: 'task', id: 'tg-1' }, { kind: 'session', key: K }] }) && /"s"/.test(B.useStamp(p1)) && B.useStamp(p1) !== B.useStamp({ ...p0, owner: { kind: 'instance', id: null } }), 'browser-profiles: the digest and the stamp carry the kept rows (a list written under All is still a list a stale dialog must not overwrite)');
  const v2 = B.usePatchVerdict({ profile: p1, use: { mode: 'only', who: [{ kind: 'task', id: 'tg-1' }, { kind: 'session', key: K }] }, knownTask: () => false, knownKey: () => false });
  ok(v2.ok && v2.owner.kind === 'only' && v2.owner.who.length === 2, 'browser-profiles: taking All away restores the kept rows — accepted as KNOWN even when the task / key would no longer be (they were in the list)', v2);
  const sv = B.useShapeVerdict({ mode: 'only', who: [{ kind: 'everyone', id: '*' }] });
  ok(!sv.ok && /All agents is mode "all"/.test(sv.error), 'browser-profiles: an `everyone` ROW is refused — All agents is mode "all" (one spelling)', sv);
  ok(B.useShapeVerdict({ mode: 'all' }).ok && B.usePatchVerdict({ profile: p0, use: { mode: 'all' } }).owner.kind === 'instance' && !('who' in B.usePatchVerdict({ profile: p0, use: { mode: 'all' } }).owner), 'browser-profiles: a bare all is the plain instance owner (no rows kept)');
  ok(B.ownerWithConversation(p1, 'bk-12345678') === null, 'browser-profiles: a pick under All writes nothing (every conversation may already)');
}
{
  // browser-who-model: the dialog's picker ⇄ the wire
  const W = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-who-model.js')).href);
  const view = { use: { mode: 'all', who: [{ kind: 'task', id: 'tg-1', title: 'Ops' }] } };
  const pr = W.pickerRows(view, { sessions: [], groups: [{ id: 'tg-1', title: 'Ops' }] });
  ok(J(pr.selected) === J([W.EVERYONE_KEY, 'task:tg-1']), 'browser-who-model: a profile under All opens with ALL AGENTS picked and the kept rows picked beside it', pr.selected);
  ok(J(W.draftUse(pr.selected, pr.wire)) === J({ mode: 'all', who: [{ kind: 'task', id: 'tg-1' }] }) && J(W.draftUse(['task:tg-1'], pr.wire)) === J({ mode: 'only', who: [{ kind: 'task', id: 'tg-1' }] }) && W.draftUse([], pr.wire) === null && J(W.draftUse([W.EVERYONE_KEY], pr.wire)) === J({ mode: 'all' }), 'browser-who-model: draftUse — All ⇒ all (+ kept rows), without All ⇒ only, nothing ⇒ refused in place');
  const ch = W.whoChips({ mode: 'all', who: [{ kind: 'task', id: 'tg-1' }, { kind: 'task', id: 'tg-2' }] }, { t: (s, p) => s.replace('{n}', p && p.n) });
  ok(ch.mode === 'all' && ch.kept === 2 && ch.allText === 'All agents (2 more rows)' && W.whoChips({ mode: 'all' }).allText === 'All agents', 'browser-who-model: the panel says "All agents" first — "(N more rows)" when rows are kept');
  ok(W.saveWords({ label: 'work', mode: 'all' }, (s, p = {}) => s.replace(/\{(\w+)\}/g, (_, k) => p[k])) === 'Who can use work: All agents', 'browser-who-model: the toast names All agents');
}
{
  // the words: the Notify preview says the fan-out and its money
  const CW = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  const tr = (s, p = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (p[k] !== undefined ? String(p[k]) : '{' + k + '}'));
  const s1 = CW.notifySentence({ principal: { kind: 'everyone', id: '*' }, notify: 'wake', mode: 'all', dailyWakeCap: 3 }, tr, { scope: 'account' });
  const s2 = CW.notifySentence({ principal: { kind: 'everyone', id: '*' }, notify: 'digest', digestMinutes: 30, mode: 'all', dailyWakeCap: 3 }, tr, { scope: 'conversation' });
  ok(/^Every running conversation will be woken right away/.test(s1) && /a billed turn for each/.test(s1) && /3 times a day each/.test(s1) && /billed turn for each/.test(s2) && /every 30 minutes/.test(s2), 'the Notify preview under All says it: every running conversation, a billed turn for each, the cap EACH', [s1, s2]);
  ok(CW.grainSummaryText({ access: [{ principal: { kind: 'agent', id: 'a', name: 'A' }, authority: 'draft' }, { principal: { kind: 'everyone', id: '*' }, authority: 'draft' }] }).indexOf('All agents') < CW.grainSummaryText({ access: [{ principal: { kind: 'agent', id: 'a', name: 'A' }, authority: 'draft' }, { principal: { kind: 'everyone', id: '*' }, authority: 'draft' }] }).indexOf('A ('), 'the account / conversation card line names All agents FIRST');
}

// ═══ ③ THE MONEY RULE over the REAL engine ═════════════════════════════════
console.log('③ the money rule: an All-agents watcher wakes every running conversation, each under ITS OWN cap');
const CH = require(path.join(REPO, 'src/channels/index.js'));
const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
const ENGINE_SRC = read('src/server/channels-engine.js');
const engines = [];
async function world(ENGmod, name, { live }) {
  const A = 'evp', OPS = 'ops';
  let seqNo = 0;
  const recs = [];
  const mint = (text) => makeRecord({ adapterId: A, convId: OPS, vendorId: `evp-${++seqNo}`, at: Date.now() + seqNo, author: { id: 'u-ada', name: 'Ada', isSelf: false, isBot: false }, text, mentions: [], attachments: [], replyTo: null, threadKey: OPS, raw: {} });
  const mod = {
    kind: A,
    caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata' },
    create() {
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
        async listConversations() { return { conversations: [makeConversation({ id: OPS, vendorId: OPS, title: 'Ops room', kind: 'group', participants: 'Ada', lastAt: null })], cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
        async history(convId, { anchor = null, limit = 50 } = {}) {
          let idx = 0;
          if (anchor) { const at = recs.findIndex((r) => r.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          const anchorFound = !anchor || idx > 0;
          const pending = recs.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page, anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: anchorFound && drained, complete: anchorFound && drained };
        },
        async send() { return { ok: true, vendorMessageId: 'x', at: Date.now(), sentAs: 'user' }; },
        async reconcile() { return { unknown: true }; },
      };
    },
  };
  const ladder = { calls: [], stash: [],
    async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; },
    stashFor(cid, env) { ladder.stash.push({ cid, ...env }); } };
  const todos = [];
  const userTodos = { add(key, it) { const x = { id: `todo-${todos.length + 1}`, status: 'open', sessionKey: key, ...it }; todos.push(x); return x; }, get(id) { return todos.find((x) => x.id === id) || null; }, setStatus() {} };
  const dataDir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: 'EVP mail', enabled: true, linkedAt: 1, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null }] }));
  const registry = CH.createChannelRegistry(); registry.register(mod);
  const base = Date.now(); let offset = 0;
  const e = ENGmod.create({ dataDir, env: {}, registry, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: ladder, userTodos, serverSetting: () => undefined, liveSessions: () => live, now: () => base + offset });
  engines.push(e);
  await e.pass(A, { force: true });
  const ingest = async (...texts) => { offset += 61e3; for (const t of texts) recs.push(mint(t)); await e.pass(A, { force: true }); await e.settleWakes(); };
  const en = () => e.store.index.snapshot().conversations[`${A}/${OPS}`];
  return { e, A, OPS, ladder, todos, ingest, en, OPSC: { kind: 'conversation', convId: OPS } };
}
const ALLP = { kind: 'everyone', id: '*' };
const per = (calls) => { const m = {}; for (const c of calls) m[c.cid] = (m[c.cid] || 0) + 1; return m; };
async function moneyLeg(ENGmod, name) {
  const live = [{ cid: 'agent-1', name: 'One', groups: [] }, { cid: 'agent-2', name: 'Two', groups: [] }, { cid: 'agent-3', name: 'Three', groups: [] }];
  const w = await world(ENGmod, name, { live });
  const a = await w.e.setAccess(w.A, w.OPSC, [{ principal: ALLP, authority: 'draft' }]);
  const s = await w.e.setWatchers(w.A, w.OPSC, [{ principal: ALLP, notify: 'wake', mode: 'all', dailyWakeCap: 2 }]);
  for (const t of ['GPU one', 'GPU two', 'GPU three', 'GPU four']) await w.ingest(t);
  return { w, live, a, s, counts: per(w.ladder.calls) };
}
{
  const { w, live, a, s, counts } = await moneyLeg(require(path.join(REPO, 'src/server/channels-engine.js')), 'money');
  ok(a.ok && s.ok && s.watchers.length === 1 && s.watchers[0].principal.kind === 'everyone', 'the grain holds ONE All access row and ONE All watcher (cap 2)', { a: a.code, s: s.code });
  ok(J(counts) === J({ 'agent-1': 2, 'agent-2': 2, 'agent-3': 2 }) && w.ladder.calls.every((c) => c.opts && c.opts.spendReason === 'channel-message'), `4 batches × 3 running conversations under a cap of 2 ⇒ EXACTLY 2 billed wakes each (${J(counts)}), every one through the ladder's money door`);
  const row = (w.en().watchers || [])[0];
  ok(row && Object.keys(row.stats.fan || {}).sort().join() === 'agent-1,agent-2,agent-3' && ['agent-1', 'agent-2', 'agent-3'].every((c) => row.stats.fan[c].wakes.filter((x) => x.ok !== false).length === 2) && !(row.stats.wakes || []).length, 'each conversation\'s wakes sit in ITS OWN ledger (stats.fan[cid], 2 each) — the shared ledger stays empty');
  ok(['agent-1', 'agent-2', 'agent-3'].every((c) => (w.en().pending || []).filter((p) => p.for === `everyone:*>${c}`).length === 2), 'the hits past each cap are HELD per conversation (2 pending each) — a hold, never a drop');
  ok(w.e.digest().conversations.some((c) => c.watchers && c.watchers.some((x) => x.principal.kind === 'everyone')), 'the view still shows ONE All watcher (the fan-out is the wake path\'s, never the card\'s)');
  // a DEAD BOOT's reservation inside a per-conversation ledger is released like any other (its slot freed)
  await w.e.store.index.update((ix) => { const e2 = ix.conversations[`${w.A}/${w.OPS}`]; e2.watchers[0].stats.fan['agent-2'].wakes.push({ at: Date.now(), n: 1, cid: 'agent-2', ok: true, lane: 'reserved', reserved: true, bootId: 'a-dead-boot', id: 'ghost' }); });
  const relN = await w.e.releaseStaleReservations();
  ok(relN === 1 && !w.en().watchers[0].stats.fan['agent-2'].wakes.some((r) => r.id === 'ghost') && w.en().watchers[0].stats.fan['agent-2'].wakes.length === 2, 'a dead boot\'s reservation in ONE conversation\'s ledger is released at the boot sweep (its slot freed, the real rows kept)', relN);
  // a conversation that starts LATER gets its own fresh cap
  live.push({ cid: 'agent-4', name: 'Four', groups: [] });
  const n0 = w.ladder.calls.length;
  await w.ingest('GPU five');
  const after = per(w.ladder.calls.slice(n0));
  ok(J(after) === J({ 'agent-4': 1 }), `a conversation that started after the cap was spent is woken under ITS OWN cap (${J(after)}); the three capped ones are not`);
  // a named agent beside All: one batch never bills one conversation twice for the same hits
  const live2 = [{ cid: 'agent-1', name: 'One', groups: [] }, { cid: 'agent-2', name: 'Two', groups: [] }];
  const w2 = await world(require(path.join(REPO, 'src/server/channels-engine.js')), 'twice', { live: live2 });
  await w2.e.setAccess(w2.A, w2.OPSC, [{ principal: ALLP }, { principal: { kind: 'agent', id: 'agent-1', name: 'One' } }]);
  await w2.e.setWatchers(w2.A, w2.OPSC, [{ principal: { kind: 'agent', id: 'agent-1', name: 'One' }, notify: 'wake', dailyWakeCap: 10 }, { principal: ALLP, notify: 'wake', dailyWakeCap: 10 }]);
  await w2.ingest('GPU one');
  ok(J(per(w2.ladder.calls)) === J({ 'agent-1': 1, 'agent-2': 1 }), `agent-1 named AND covered by All: ONE wake for the batch (${J(per(w2.ladder.calls))}) — never billed twice for the same hits`);
  // removing All's access removes its watcher — and the named agent's rows stay
  const r2 = await w2.e.setAccess(w2.A, w2.OPSC, [{ principal: { kind: 'agent', id: 'agent-1', name: 'One' } }]);
  ok(r2.ok && (w2.en().watchers || []).length === 1 && w2.en().watchers[0].principal.id === 'agent-1' && w2.en().access.length === 1, 'removing All\'s access removes the All notification; agent-1\'s own access + notification stay exactly as they were');
  // an ACCOUNT-grain All DIGEST: each running conversation holds its own window and gets its own digest (never one for all)
  const live3 = [{ cid: 'agent-1', name: 'One', groups: [] }, { cid: 'agent-2', name: 'Two', groups: [] }, { cid: 'agent-3', name: 'Three', groups: [] }];
  const w3 = await world(require(path.join(REPO, 'src/server/channels-engine.js')), 'digest', { live: live3 });
  const acct = { kind: 'account' };
  const a3 = await w3.e.setAccess(w3.A, acct, [{ principal: ALLP }]);
  const s3 = await w3.e.setWatchers(w3.A, acct, [{ principal: ALLP, notify: 'digest', digestMinutes: 30, dailyWakeCap: 5 }]);
  await w3.ingest('GPU one', 'GPU two');
  const held3 = ['agent-1', 'agent-2', 'agent-3'].every((c) => (w3.en().pending || []).filter((p) => p.for === `everyone:*>${c}`).length === 2);
  ok(a3.ok && s3.ok && w3.ladder.calls.length === 0 && held3, 'an ACCOUNT-grain All digest: nothing delivered yet, each running conversation holds the 2 hits under ITS OWN window', { a3: a3.code, s3: s3.code, pending: (w3.en().pending || []).map((p) => p.for) });
  const f3 = await w3.e.flushScope(w3.A, 'account', null);
  const p3 = per(w3.ladder.calls);
  ok(f3 && J(p3) === J({ 'agent-1': 1, 'agent-2': 1, 'agent-3': 1 }) && w3.ladder.calls.every((c) => /^### Channel digest/.test(c.text) && /GPU one/.test(c.text) && /GPU two/.test(c.text)) && !(w3.en().pending || []).length, `…its flush delivers ONE digest PER running conversation (${J(p3)}), each with both hits, and clears every window`);
  // ④ THE REQUEST FLOW — a conversation All agents may see: "already allowed", no card
  await w.e.setAccess(w.A, w.OPSC, [{ principal: ALLP, authority: 'draft' }]);
  const rq = await w.e.request({ kind: 'agent', id: 'agent-9', name: 'Nine', groups: [] }, w.A, w.OPS, 'I need it');
  ok(rq.ok && rq.already === true && rq.via === 'everyone' && rq.level === 'visible' && w.todos.length === 0, '④ an agent\'s request on a conversation All agents may see is answered "already allowed" (via everyone) — no For-you card', rq);
  const cli = read('data/bin/vibespace-channels');
  ok(/r\.via === 'everyone' \? `already allowed — the user gave every agent access/.test(cli), '④ the CLI says "already allowed" for it (never "a request was filed")');
}
{
  // CONTROLS — patched copies of the engine (outside the tree)
  const SHARED = "    const w = holder && Array.isArray(holder.watchers) ? holder.watchers.find((x) => pkOf(x.principal) === (fan ? fan.root : pk)) : null;\n    if (w && (!w.stats || typeof w.stats !== 'object')) w.stats = { wakes: [], hits: [] };\n    if (!w || !fan) return w;";
  ok(ENGINE_SRC.split(SHARED).length === 2, 'CONTROL setup: the fan-out ledger lines are where the controls patch them');
  // a CLOSED WORLD (the engine copy requires the filter copy by absolute path): every fan-out target READS and WRITES
  // the stored row's one ledger — the pre-lane shape of a per-principal ledger applied to All
  const FSRC = read('src/channel-filter.js');
  const FAN_READ = '  return { ...root, principal: { kind: \'everyone\', id: EVERYONE_ID, target: str(cid), name: name || null }, stats: fanStatsOf(root, cid) };';
  ok(FSRC.split(FAN_READ).length === 2, 'CONTROL setup: the fan-out target\'s ledger read');
  const fCopy = M.write('src/channel-filter.js', FSRC.replace(FAN_READ, FAN_READ.replace('stats: fanStatsOf(root, cid)', 'stats: root.stats || { wakes: [], hits: [] }')), 'shared-f', { esm: false });
  const shared = M.load('src/server/channels-engine.js', ENGINE_SRC.replace(SHARED, SHARED.replace('if (!w || !fan) return w;', 'if (!w || fan || !fan) return w;')).replace("const F = require('../channel-filter.js');", `const F = require(${JSON.stringify(fCopy)});`), 'shared');
  const c1 = await moneyLeg(shared, 'ctl-shared');
  const tot1 = Object.values(c1.counts).reduce((x, y) => x + y, 0);
  ok(tot1 === 2, `CONTROL (a): ONE ledger shared by every conversation ⇒ only ${tot1} wakes in all (not 2 each) — the "2 each" leg above would go red`, c1.counts);
  const PACE = '    const pace = F.paceVerdict(paceWakes, t, F.digestCap(w));\n    if (!pace.ok) {';
  ok(ENGINE_SRC.split(PACE).length === 2, 'CONTROL setup: the wake\'s pace line');
  const uncapped = M.load('src/server/channels-engine.js', ENGINE_SRC.replace(PACE, '    const pace = F.fanTargetOf(w.principal) ? { ok: true } : F.paceVerdict(paceWakes, t, F.digestCap(w));\n    if (!pace.ok) {'), 'uncapped');
  const c2 = await moneyLeg(uncapped, 'ctl-uncapped');
  ok(Object.values(c2.counts).every((n) => n === 4), `CONTROL (b): a fan-out without its cap bills EVERY hit to EVERY conversation (${J(c2.counts)}) — All × N uncapped, the money rule red`, c2.counts);
}
for (const e of engines) { try { e.stop(); } catch {} }

// ═══ ⑦ THE REACH TABLE (verify r1, T1) ══════════════════════════════════════
// Every model × principal set {All only / All + named / named only / none} × actor {a conversation that existed at
// the grant / one born after / a Task Group member / a fork (carries its source's id) / a conversation in no Task
// Group / a caller with no identity} × operation ⇒ ONE verdict per cell. A Background Work job (jbt_) is NOT a
// conversation on any All surface: channels (agentSession: vsst_ only), window targets (vsst_ only), exit
// (agentOr401: jbt_ refused by name), the agent browser (vsst_ only) — it acts, where it acts at all, AS its owner
// conversation (vibespace-msg / jobs), so it is covered exactly when its owner is. On the fleet every conversation is
// the pod user's: "every conversation" = every conversation on THIS instance, whichever allowed sign-in started it.
console.log('⑦ the reach table: four principal sets × six actors × read / request / act / be woken, per model');
{
  const ALL = { kind: 'everyone', id: '*' };
  const A1 = 'cid-a1', A9 = 'cid-born-later', TG = 'tg-ops';
  const actors = {
    'existed at the grant': { kind: 'agent', id: A1, groups: [] },
    'born after the grant': { kind: 'agent', id: A9, groups: [] },
    'Task Group member': { kind: 'agent', id: 'cid-member', groups: [TG] },
    'fork (its source\'s id)': { kind: 'agent', id: A1, groups: [] },
    'no Task Group': { kind: 'agent', id: 'cid-lonely', groups: [] },
    'no identity': { kind: 'agent' },
  };
  const bad = [];
  const cell = (model, set, actor, op, got, want) => { if (got !== want) bad.push(`${model} · ${set} · ${actor} · ${op}: got ${J(got)}, want ${J(want)}`); };
  // ── channel-acl: read = canSee, request = canRequest ──
  {
    const target = { key: 'lark-1/c1', adapterId: 'lark-1' };
    const g = (principal, level) => ACL.validateGrant({ principal, scope: { kind: 'conversation', id: target.key }, level, origin: 'user' }).grant;
    const SETS = {
      'All only': [g(ALL, 'visible')],
      'All + named': [g(ALL, 'visible'), g({ kind: 'agent', id: A1 }, 'requestable'), g({ kind: 'group', id: TG }, 'requestable')],
      'named only': [g({ kind: 'agent', id: A1 }, 'visible'), g({ kind: 'group', id: TG }, 'visible')],
      'none': [],
    };
    const WANT = { 'All only': 'visible', 'All + named': 'visible', 'named only': { 'existed at the grant': 'visible', 'fork (its source\'s id)': 'visible', 'Task Group member': 'visible' }, 'none': 'hidden' };
    for (const [set, grants] of Object.entries(SETS)) for (const [actor, ctx] of Object.entries(actors)) {
      const e = ACL.effective(ctx, target, grants);
      let want = typeof WANT[set] === 'string' ? WANT[set] : (WANT[set][actor] || 'hidden');
      if (actor === 'no identity') want = set === 'All only' || set === 'All + named' || set === 'none' ? 'hidden' : 'hidden';
      cell('channel-acl', set, actor, 'read', ACL.canSee(e.level), want === 'visible');
      cell('channel-acl', set, actor, 'request', ACL.canRequest(e.level), want === 'requestable');
    }
  }
  // ── channel-filter: act = the authority (MAX over the rows naming the agent), be woken = the fan-out / the row ──
  {
    const live = Object.values(actors).filter((c) => c.id).map((c) => ({ cid: c.id, name: c.id, groups: c.groups }));
    const SETS = {
      'All only': { access: [{ principal: ALL, authority: 'send' }], watchers: [{ principal: ALL, notify: 'wake', mode: 'all', dailyWakeCap: 2 }] },
      'All + named': { access: [{ principal: ALL, authority: 'send' }, { principal: { kind: 'agent', id: A1 }, authority: 'draft' }, { principal: { kind: 'group', id: TG }, authority: 'draft' }], watchers: [{ principal: ALL, notify: 'wake', mode: 'all', dailyWakeCap: 2 }, { principal: { kind: 'agent', id: A1 }, notify: 'wake', mode: 'all', dailyWakeCap: 2 }] },
      'named only': { access: [{ principal: { kind: 'agent', id: A1 }, authority: 'send' }, { principal: { kind: 'group', id: TG }, authority: 'draft' }], watchers: [{ principal: { kind: 'agent', id: A1 }, notify: 'wake', mode: 'all', dailyWakeCap: 2 }, { principal: { kind: 'group', id: TG }, notify: 'wake', mode: 'all', dailyWakeCap: 2 }] },
      'none': { access: [], watchers: [] },
    };
    for (const [set, grain] of Object.entries(SETS)) {
      const eff = F.effectiveGrants({ conversation: grain, account: { access: [], watchers: [] } }, {}) || { access: [], watchers: [] };   // an empty grain answers null
      const fo = F.fanOutWatchers(eff, live);
      for (const [actor, ctx] of Object.entries(actors)) {
        const rows = eff.access.filter((x) => F.rowNames(x.row, ctx));
        const act = rows.length ? (rows.some((x) => x.row.authority === 'send') ? 'send' : 'draft') : null;
        const named = actor === 'existed at the grant' || actor === 'fork (its source\'s id)';
        const member = actor === 'Task Group member';
        const wantAct = !ctx.id ? null : set === 'All only' || set === 'All + named' ? 'send' : set === 'named only' ? (named ? 'send' : member ? 'draft' : null) : null;
        cell('channel-filter', set, actor, 'act (authority)', act, wantAct);
        // be woken: a fan-out item names this conversation, or a row names it (a group's round-robin reaches a member)
        const woken = !!ctx.id && fo.watchers.some((x) => F.rowNames(x.watcher, ctx));
        const wantWoken = !!ctx.id && (set === 'All only' || set === 'All + named' || (set === 'named only' && (named || member)));
        cell('channel-filter', set, actor, 'be woken', woken, wantWoken);
      }
      // the fan-out is ONE item per live conversation under All, and the named agent's own row stays its own
      // (a fork carries its source's id ⇒ ONE target for the two — the fan-out dedupes by conversation id)
      if (set === 'All + named') cell('channel-filter', set, '(fan-out)', 'items', fo.watchers.filter((x) => F.fanTargetOf(x.watcher.principal)).length, new Set(live.map((x) => x.cid)).size);
    }
  }
  // ── window-reach: act = isExposed (a caller with no key is hidden even under All) ──
  {
    const grant = (rec, p) => R.grant(rec, p, { by: 'user', at: 1 }).record;
    const key = (c) => (c.id ? [`claude:${c.id}`] : []);
    const SETS = {
      'All only': grant(R.emptyRecord('w1'), ALL),
      'All + named': grant(grant(grant(R.emptyRecord('w1'), ALL), { kind: 'session', id: `claude:${A1}` }), { kind: 'group', id: TG }),
      'named only': grant(grant(R.emptyRecord('w1'), { kind: 'session', id: `claude:${A1}` }), { kind: 'group', id: TG }),
      'none': R.emptyRecord('w1'),
    };
    for (const [set, rec] of Object.entries(SETS)) for (const [actor, ctx] of Object.entries(actors)) {
      const r = R.reachFor(rec, { sessionKeys: key(ctx), groupIds: ctx.groups || [] });
      const named = actor === 'existed at the grant' || actor === 'fork (its source\'s id)';
      const want = !!ctx.id && (set === 'All only' || set === 'All + named' || (set === 'named only' && (named || actor === 'Task Group member')));
      cell('window-reach', set, actor, 'act (exposed)', r.level === 'exposed', want);
      if (want) cell('window-reach', set, actor, 'via', r.via, set === 'named only' || (set === 'All + named' && (named || actor === 'Task Group member')) ? (named ? 'session' : 'group') : 'everyone');
    }
  }
  // ── exit-reach: act = use / run ──
  {
    const cur = E.exitAccessOf(null);
    const mk = (use) => E.patchVerdict(cur, { use, run: use }).access;
    const SETS = {
      'All only': mk({ mode: 'everyone' }),
      'All + named': mk({ mode: 'everyone', who: [{ kind: 'session', id: `claude:${A1}` }, { kind: 'group', id: TG }] }),
      'named only': mk({ mode: 'only', who: [{ kind: 'session', id: `claude:${A1}` }, { kind: 'group', id: TG }] }),
      'none': mk({ mode: 'nobody' }),
    };
    for (const [set, access] of Object.entries(SETS)) for (const [actor, ctx] of Object.entries(actors)) for (const grant of ['use', 'run']) {
      const v = E.exitVerdict(access, grant, { sessionKeys: ctx.id ? [`claude:${ctx.id}`] : [], groupIds: ctx.groups || [] });
      const named = actor === 'existed at the grant' || actor === 'fork (its source\'s id)';
      // everyone admits every caller the route let in (the route refuses a job token and a token-less call before this)
      const want = set === 'All only' || set === 'All + named' ? true : set === 'named only' ? !!ctx.id && (named || actor === 'Task Group member') : false;
      cell('exit-reach', set, actor, grant, !!v.ok, want);
    }
  }
  // ── browser-profiles: act = mayAttach (a conversation = its browser key; a Task Group = its id) ──
  {
    // a conversation's browser key is `bk-<8 hex>`; the fork shares its source's
    const KEYS = { 'cid-a1': 'bk-0a1b2c3d', 'cid-born-later': 'bk-0b0b0b0b', 'cid-member': 'bk-0c0c0c0c', 'cid-lonely': 'bk-0d0d0d0d' };
    const bk = (c) => (c.id ? KEYS[c.id] : null);
    const SETS = {
      'All only': { owner: { kind: 'instance', id: null } },
      'All + named': { owner: { kind: 'instance', id: null, who: [{ kind: 'session', id: bk(actors['existed at the grant']) }, { kind: 'task', id: TG }] } },
      'named only': { owner: { kind: 'only', who: [{ kind: 'session', id: bk(actors['existed at the grant']) }, { kind: 'task', id: TG }] } },
      'none': { owner: { kind: 'only', who: [{ kind: 'task', id: 'tg-nobody' }] } },
    };
    for (const [set, p] of Object.entries(SETS)) for (const [actor, ctx] of Object.entries(actors)) {
      const profile = { id: 'p-1', label: 'work', ...p };
      const r = ctx.id ? B.mayAttach(profile, { browserKey: bk(ctx), taskIds: ctx.groups || [] }) : { ok: false };
      const named = actor === 'existed at the grant' || actor === 'fork (its source\'s id)';
      const want = !!ctx.id && (set === 'All only' || set === 'All + named' || (set === 'named only' && (named || actor === 'Task Group member')));
      cell('browser-profiles', set, actor, 'act (attach)', !!r.ok, want);
    }
  }
  const cells = 4 * 6 * (2 + 2 + 1 + 2 + 1) + 1;
  ok(!bad.length, `the reach table holds: ${cells} cells over five models (All covers a conversation born after the grant; a named row beside All never narrows; a jbt_ job and an identity-less caller are never a principal)`, bad.slice(0, 12));
  console.log('  actor · covered under All? · as a named row? — a conversation that existed: yes · yes; born after: yes · no; a Task Group member: yes · through its group; a fork: yes · as its source until it owns its id; no Task Group: yes · only by its own row; a jbt_ job: never a caller on any All surface (acts as its owner conversation where it acts); no identity: never');
  // CONTROLS: a model whose All row names nobody born later ⇒ the table is red
  {
    const wrSrc = read('src/window-reach.js');
    const WR_LINE = "const hit = k === 'everyone' ? callerKnown : k === 'session' ? keys.has(row.principal.id) : groups.has(row.principal.id);";
    const wrMut = wrSrc.includes(WR_LINE) ? M.load('src/window-reach.js', wrSrc.replace(WR_LINE, WR_LINE.replace("k === 'everyone' ? callerKnown", "k === 'everyone' ? false")), 'all-names-nobody') : null;
    const rec = wrMut ? wrMut.grant(wrMut.emptyRecord('w1'), ALL, { by: 'user', at: 1 }).record : null;
    ok(!!wrMut && wrMut.reachFor(rec, { sessionKeys: [`claude:${A9}`] }).level === 'hidden', 'CONTROL (7a): window-reach whose All row names nobody ⇒ the born-after cell reads hidden — RED');
    const cfSrc = read('src/channel-filter.js');
    const CF_LINE = "  if (p.kind === 'everyone') return ctx.kind === 'agent' && !!ctx.id && (!p.target || str(p.target) === str(ctx.id));";
    const cfMut = cfSrc.includes(CF_LINE) ? M.load('src/channel-filter.js', cfSrc.replace(CF_LINE, "  if (p.kind === 'everyone') return false;"), 'all-names-nobody', { esm: false }) : null;
    ok(!!cfMut && !cfMut.rowNames({ principal: ALL }, { kind: 'agent', id: A9 }), 'CONTROL (7b): channel-filter whose All row names nobody ⇒ the be-woken / act cells read false — RED');
    const aclSrc = read('src/channel-acl.js');
    const ACL_LINE = "  if (p.kind === 'everyone') return !!ctx && ctx.kind === 'agent' && !!ctx.id;";
    const aclMut = aclSrc.includes(ACL_LINE) ? M.load('src/channel-acl.js', aclSrc.replace(ACL_LINE, "  if (p.kind === 'everyone') return !!ctx && ctx.kind === 'agent' && ctx.id === 'cid-a1';"), 'all-names-the-first') : null;
    const g = aclMut ? aclMut.validateGrant({ principal: ALL, scope: { kind: 'conversation', id: 'lark-1/c1' }, level: 'visible', origin: 'user' }).grant : null;
    ok(!!aclMut && aclMut.effective({ kind: 'agent', id: A1 }, { key: 'lark-1/c1', adapterId: 'lark-1' }, [g]).level === 'visible' && aclMut.effective({ kind: 'agent', id: A9 }, { key: 'lark-1/c1', adapterId: 'lark-1' }, [g]).level === 'hidden', 'CONTROL (7c): channel-acl whose All row names only the conversations that existed ⇒ the born-after cell reads hidden — RED (that is the point of the row)');
  }
}

// ═══ ⑤ WIRING PINS ═════════════════════════════════════════════════════════
console.log('⑤ wiring: every dialog maps the All row onto its model\'s own spelling');
{
  const FE = read('src/lib/channel-filter-editor.js');
  ok(/const EVERYONE_KEY = 'everyone:\*';/.test(FE) && /out = \[\{ value: EVERYONE_KEY, label: t\('All agents'\), kind: 'everyone', id: '\*', name: null \}\]/.test(FE) && /everyone: \{ key: EVERYONE_KEY \}/.test(FE), 'Grant access…: the All row is a principal choice {kind:everyone, id:*} (the payload\'s one spelling)');
  ok(/everyone: 'roster'/.test(FE) && /kind: 'everyone', id: '\*', name: t\('All agents'\)[^\n]*t\('every running conversation gets a billed turn on each hit'\)/.test(FE) && /expectedWakesTotal\(expected, \{ running \}\)/.test(FE), 'Notify…: All is offered when it holds access, its row says the money, the total counts a budget per running conversation');
  // verify r1 T2 ①: the MULTIPLIER is on the dialog — N running now × the cap each, a later conversation its own
  ok(/allRow \? t\('In all: about \{n\} wakes a day — \{running\} conversation\(s\) running now, All agents is at most \{cap\} a day for EACH of them \(a conversation started later gets its own\); every notification has its own cap', \{ n: F\.expectedWakesTotal\(expected, \{ running \}\), running, cap: F\.digestCap\(allRow\) \}\)/.test(FE), 'Notify…: with an All row the total NAMES the multiplier (N running now, the cap for EACH, a later conversation its own)');
  // verify r1 T2 ⑥: a draft-only row beside an All row that may send is MOOT — said, re-said when a radio changes
  ok(/const syncMoot = \(\) => \{/.test(FE) && /all && all\.authority === 'send' \? rows\.filter\(\(r\) => r\.key !== EVERYONE_KEY && r\.authority === 'draft'\)/.test(FE) && /t\('All agents may reply directly here, so a draft-only row beside it changes nothing: \{names\} may reply directly too \(set All agents to draft, or remove it, to narrow\)\.'/.test(FE) && /if \(inp\.checked\) \{ r\.authority = value; syncMoot\(\); \}/.test(FE) && /watchedNote\.style\.display = gone\.length \? '' : 'none';\n    syncMoot\(\);/.test(FE), 'Grant access…: a draft-only row beside All-may-send is said to be moot (on draw and on every authority radio change)');
  const RE2 = read('src/lib/channel-reach-editor.js');
  ok(/const allVisible = entries\.some\(\(g\) => g\.principal && g\.principal\.kind === 'everyone' && g\.level === 'visible'\);/.test(RE2) && /t\('All agents is visible here, so a requestable row beside it changes nothing: \{names\} can already see it \(remove the All agents row to narrow\)\.'/.test(RE2), 'Reach & policy: a requestable row beside a visible All row is said to be moot');
  // verify r1 T2 ④: All on a machine's exit is said as strongly as it is, per grant, the run sentence following "Ask me each time"
  const XD2 = read('src/lib/exit-access-dialog.js');
  ok(/const allOn = mode === 'only' && sel\.has\(EVERYONE_KEY\);/.test(XD2) && /t\('Every conversation — the ones you start later included — can borrow the network of \{machine\}\.'/.test(XD2) && /askBox && askBox\.checked \? t\('Every conversation — the ones you start later included — can run commands on \{machine\} as you, each after your Allow\.'/.test(XD2) && /t\('Every conversation — the ones you start later included — can run commands on \{machine\} as you, without asking\.'/.test(XD2) && /if \(askBox\) askBox\.onchange = \(\) => syncCount\(\);/.test(XD2), 'exit access: with All agents picked each grant says "every conversation — the ones you start later included — …" (run: after your Allow / without asking), re-said when the ask box changes');
  const RE = read('src/lib/channel-reach-editor.js');
  ok(/const out = \[\{ kind: 'everyone', id: '\*', name: t\('All agents'\) \}\];/.test(RE) && /name: p\.kind === 'everyone' \? null : p\.name/.test(RE), 'Reach & policy: Grant reach to… All agents ⇒ {kind:everyone, id:*}');
  const WS = read('src/lib/window-share.js');
  ok(/out\.push\(\{ key: 'everyone:\*', kind: 'everyone', id: '\*', name: t\('All agents'\), checked: !!all\.checked/.test(WS) && /ref: \{ kind: 'everyone', row: \{ id: '\*'/.test(WS), 'window share: the All row comes from the model\'s `everyone` entry and toggles {kind:everyone, id:*}');
  const XD = read('src/lib/exit-access-dialog.js');
  ok(/if \(all\) g\.mode = 'everyone';/.test(XD) && /const selected = g\.mode === 'everyone' \? \[EVERYONE_KEY\] : \[\];/.test(XD) && !/value: 'everyone'|\['nobody', 'everyone', 'only'\]/.test(XD), 'exit access: the picker\'s All row IS mode everyone (the radio is gone — one spelling); the rows beside it ride along');
  const BW = read('src/lib/browser-who-dialog.js');
  ok(/everyone: \{ key: EVERYONE_KEY \}/.test(BW) && /const use = draftUse\(d\.sel, model\.wire\);/.test(BW) && !/bwho-radio|radiogroup/.test(BW), 'browser who-can-use: one picker, All first, mapped through draftUse (the radios are gone)');
  const RT = read('src/routes/browser-trace.js');
  ok(/patch\.use = sv\.mode === 'all' \? \(rows\.length \? \{ mode: 'all', who: rows \} : \{ mode: 'all' \}\)/.test(RT), 'the browser PATCH route carries the rows kept beside All (resolved like a list\'s)');
  const WT = read('src/server/window-targets-engine.js');
  ok(/if \(row\.principal\.kind === 'everyone'\) hit = true;/.test(WT), 'the window engine counts every live agent session as reached by an All row (the share view\'s "who it reaches")');
  const EN = ENGINE_SRC;
  const wakePaths = ['const eff = wakeEffOf(en);   // ALL AGENTS fanned out', 'const eff = wakeEffOf(store.index.peek(`${rec.id}/${convId}`));   // a fan-out target', 'const scopeFor = (rec, convId, pk) => { const eff = wakeEffOf(', 'const eff0 = wakeEffOf(en0);', 'const eff = wakeEffOf(en);   // a fan-out target\'s hits wait'];
  ok(wakePaths.every((p) => EN.includes(p)) && (EN.match(/wakeEffOf\(/g) || []).length >= 10, `every wake path reads the fan-out (wakeEffOf: ${(EN.match(/wakeEffOf\(/g) || []).length} sites)`);
}

// ═══ ⑥ i18n ════════════════════════════════════════════════════════════════
console.log('⑥ i18n: the new words in both dictionaries');
{
  const KEYS = ['All agents', 'all agents', 'every conversation, now and later', 'every running conversation gets a billed turn on each hit', 'Shared with: All agents', 'Shared with: All agents ({n} more rows)', 'All agents ({n} more rows)', 'Agents you pick', 'Who can use {label}: All agents', 'Pick All agents, or at least one conversation or Task Group.', 'Every running conversation will be woken right away for {what} {where} — a billed turn for each, at most {cap} times a day each.',
    // verify r1: the multiplier, the moot rows, All on a machine
    'In all: about {n} wakes a day — {running} conversation(s) running now, All agents is at most {cap} a day for EACH of them (a conversation started later gets its own); every notification has its own cap',
    'All agents may reply directly here, so a draft-only row beside it changes nothing: {names} may reply directly too (set All agents to draft, or remove it, to narrow).',
    'All agents is visible here, so a requestable row beside it changes nothing: {names} can already see it (remove the All agents row to narrow).',
    'Every conversation — the ones you start later included — can borrow the network of {machine}.',
    'Every conversation — the ones you start later included — can run commands on {machine} as you, each after your Allow.',
    'Every conversation — the ones you start later included — can run commands on {machine} as you, without asking.'];
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const miss = KEYS.filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':'));
  ok(!miss.length, `${KEYS.length} new keys in zh AND ja`, miss);
  ok(zh.includes('"All agents": "所有 agent"') && ja.includes('"All agents": "すべてのエージェント"'), 'the owner\'s words: All agents / 所有 agent / すべてのエージェント');
}

for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(x.pass, 'tree: ' + x.name, x.detail);
console.log(`\n(${Date.now() - t0} ms)`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
