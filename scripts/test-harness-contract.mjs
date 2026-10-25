#!/usr/bin/env node
// HARNESS CONFORMANCE (S1 of docs/design-harness-plugins.md §2, 2.369.18):
// every registered harness runs the SAME assertions — descriptor shape,
// adapter interface (base methods + buildSessionArgs), normalizer duck
// contract, wrapper file + capability advert, store/locator, client META
// row + settings keys. This is the "twin-sets = 0 is a metric" law made
// mechanical: a third harness that misses a member fails HERE, not in a
// fleet incident. Unknown ids must fail loudly (never a claude fallback).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
// The mutation control's copy of src/ws-create.js is written OUTSIDE the tree
// (scripts/mutant-copy.mjs, `require` re-bound on line 1 to the real module's
// path). It used to be an un-ignored sibling (src/.ws-create-negctl-<pid>.js).
const MUTH = mutantCopies('harness-contract', REPO);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const { HARNESSES, harnessOf, harnessIds, chatHarnessIds, REQUIRED_DESCRIPTOR_KEYS } = require(path.join(REPO, 'src/harnesses/index.js'));
const { CREATE_RULES } = require(path.join(REPO, 'src/harness-config.js')); // the create rule's closed set (false | 'dir-exists' — lane hooks-create)
const { BackendAdapter } = require(path.join(REPO, 'src/adapters/base.js'));
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const { NORMALIZERS, createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const { capsOf, BACKEND_CAPS, worktreeCaps, worktreeRefusal, worktreeSpawnArgs, worktreePick, worktreeLatchWrite, NO_WORKTREE } = require(path.join(REPO, 'src/backend-caps.js'));
const { hasConsumer, PROTOCOLS } = require(path.join(REPO, 'src/server/stdout/index.js')); // S5: protocol → stdout consumer registry
const { BACKEND_META, backendFeatureCaps, worktreeCapsFor, worktreePick: clientWorktreePick, worktreeLatchWrite: clientWorktreeLatchWrite } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
const { HARNESS_SETTINGS, rowOf, rowsOfKind, checkTable } = require(path.join(REPO, 'src/harness-settings.js')); // PURE: the declared tables (design-harness-settings §8)

ok(harnessIds().length >= 3 && ['claude', 'codex', 'shell'].every((id) => HARNESSES[id]), `registry carries the three built-in harnesses (${harnessIds().join(', ')})`);
let threw = false; try { harnessOf('gemini'); } catch { threw = true; }
ok(threw, 'an unknown harness id THROWS (never a claude fallback)');
ok(createMessageManager('claude', 'x') && (() => { try { createMessageManager('gemini', 'x'); return false; } catch { return true; } })(), 'normalizer registry: known id works, unknown id throws');

const BASE_METHODS = ['formatChatInput', 'formatInterrupt', 'formatPermissionResponse', 'formatSetPermissionMode', 'formatSetModel', 'formatSetEffort', 'postInterrupt'];
const NORM_METHODS = ['onOp', 'processLive', 'convertHistory', 'convertHistoryAsync', 'tail', 'tailWindow', 'slice', 'turnMap']; // tailWindow = the attach slab (src/text-window.js, perf lane A)
const registry = createAdapterRegistry({ claudeCmd: 'claude', codexCmd: 'codex', codexSandboxSupported: true, chatWrapper: '/w/chat', codexChatWrapper: '/w/codex', acpWrapper: '/w/acp', acpCommands: { opencode: '/usr/bin/opencode' }, ptyWrapper: '/w/pty', buffersDir: '/b' });

for (const id of harnessIds()) {
  const h = HARNESSES[id];
  console.log(`— ${id}`);
  ok(REQUIRED_DESCRIPTOR_KEYS.every((k) => k in h), `${id}: descriptor declares ${REQUIRED_DESCRIPTOR_KEYS.join('/')}`);
  ok(h.caps === capsOf(id) && h.caps === BACKEND_CAPS[id], `${id}: caps ARE the backend-caps row (one source)`);
  // lane artifacts-model: THE DELIVERABLE HOOK — a reader (record → [{path, op, bytes, id}]) or null (= never produces);
  // a reader answers every record shape with an array (a foreign / empty record → []), never a throw
  {
    const of = h.artifactsOf;
    const FOREIGN = [null, {}, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: {} }] } }, { type: 'response_item', payload: { name: 'apply_patch', type: 'function_call', arguments: '{' } }, { kind: 'update', update: { sessionUpdate: 'tool_call', content: [{ type: 'diff' }] } }];
    ok('artifactsOf' in h && (of === null || (typeof of === 'function' && FOREIGN.every((r) => { try { const o = of(r); return Array.isArray(o) && o.length === 0; } catch { return false; } }))), `${id}: declares artifactsOf (${of === null ? 'null — never produces' : 'a reader: [] on a foreign record, never a throw'})`);
    if (of === null) { const reg = require(path.join(REPO, "src/server/artifact-registry.js")); const N2 = require(path.join(REPO, "src/normalizers.js")); const s = { backend: id, _historyLoaded: true }; ok(reg.observe(s, { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Write', input: { file_path: '/x.md' } }] } }) === 0 && !s._artifacts && N2.artifactDeriveOpts({ backend: id }) === null, `${id}: a null hook is PROVEN never to produce (the live consumer and the rebuild both skip it)`); }
  }
  const ad = registry.get(id);
  ok(ad instanceof BackendAdapter && ad instanceof h.Adapter, `${id}: adapter registry instantiates the descriptor's Adapter`);
  if (h.kind === 'chat') {
    for (const m of BASE_METHODS) ok(typeof ad[m] === 'function', `${id}: adapter implements ${m}`);
    ok(typeof ad.buildSessionArgs === 'function', `${id}: adapter implements buildSessionArgs (required by ws-create, undeclared in base.js)`);
    const spec = ad.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: 'default' });
    ok(spec && typeof spec.cmd === 'string' && Array.isArray(spec.args) && typeof spec.wrapper === 'string' && spec.mode === 'chat' && spec.env && typeof spec.env === 'object', `${id}: buildSessionArgs({mode:'chat'}) → {cmd,args,wrapper,cwd,mode,env}`);
    const mm = new h.Normalizer('contract');
    for (const m of NORM_METHODS) ok(typeof mm[m] === 'function', `${id}: normalizer implements ${m}`);
    ok(Array.isArray(mm.listeners) && typeof mm.total === 'number' && Array.isArray(mm.messages), `${id}: normalizer exposes listeners/total/messages`);
    ok(typeof mm.injectPeerCard === 'function', `${id}: normalizer renders peer/notification cards (injectPeerCard)`);
    ok(NORMALIZERS[id] === h.Normalizer, `${id}: normalizer registry row is the descriptor's Normalizer`);
    ok(fs.existsSync(path.join(REPO, h.wrapper)), `${id}: wrapper file exists (${h.wrapper})`);
    const w = fs.readFileSync(path.join(REPO, h.wrapper), 'utf8');
    ok(/caps\s*[:=]\s*\{/.test(w), `${id}: wrapper adverts a caps object in its sidecar meta`);
    ok(h.store && typeof h.store.locate === 'function', `${id}: store declares locate (where the conversation lives; transcript-service / incident read it)`);
    // SETTINGS TABLE (design-harness-settings §8): the descriptor's `settings` IS
    // the PURE table by identity (like caps), and the two knobs every chat
    // harness needs are ROWS of it — the schema DERIVES its section from this
    // object, so a source-text grep (the old pin) would have let a register()ed
    // harness through with no rows at all.
    ok(typeof h.settingsPrefix === 'string' && h.settings === HARNESS_SETTINGS[h.settingsPrefix], `${id}: settings ARE the PURE table HARNESS_SETTINGS.${h.settingsPrefix} (identity)`);
    ok(!!rowOf(h.settings, 'defaultModel') && !!rowOf(h.settings, 'defaultPermissionMode'), `${id}: table declares defaultModel + defaultPermissionMode rows`);
    ok(h.inject && ['hooks', 'wrapper', 'acp'].includes(h.inject.kind) && typeof h.inject.sessionStartHonoured === 'boolean' && Array.isArray(h.inject.hookEvents), `${id}: declares its context-injection strategy (${h.inject?.kind}, sessionStartHonoured=${h.inject?.sessionStartHonoured})`);
    if (h.inject?.hookFile) ok(typeof h.inject.hookFile.file === 'function' && typeof h.inject.hookFile.file() === 'string' && CREATE_RULES.includes(h.inject.hookFile.createIfMissing), `${id}: hook file declaration is well-formed (${h.inject.hookFile.file()}, create rule ${JSON.stringify(h.inject.hookFile.createIfMissing)})`);
    ok(typeof h.caps.streamProtocol === 'string', `${id}: caps name a stream protocol (${h.caps.streamProtocol})`);
    ok(hasConsumer(h.caps.streamProtocol), `${id}: its stream protocol has a registered stdout consumer (src/server/stdout/index.js: ${h.caps.streamProtocol}) — the descriptor NAMES it, the registry RESOLVES it (S5)`);
    ok(!('stdout' in h) && !('stream' in h), `${id}: no stdout/stream twin on the descriptor — caps.streamProtocol is the ONE source of truth`);
  }
  const meta = BACKEND_META[id];
  ok(meta && meta.id === id && meta.label && meta.badgeClass, `${id}: client BACKEND_META row exists`);
  if (h.kind === 'chat') ok(Array.isArray(meta.fallbackModels) && (meta.fallbackModels.length > 0 || meta.modelsFromAgent === true) && meta.caps, `${id}: client META carries fallbackModels (or modelsFromAgent) + feature caps`);
}
ok(Object.keys(BACKEND_META).every((id) => HARNESSES[id]), 'every client META row has a server harness (no client-only backend)');
// lane antigravity-harness (its RED row): a descriptor that drops ONE required row is refused — by the registry's own
// validate() (what loading a built-in runs) AND by this suite's per-harness check above.
{
  const { validate } = require(path.join(REPO, 'src/harnesses/index.js'));
  const g = HARNESSES.antigravity;
  for (const k of REQUIRED_DESCRIPTOR_KEYS) {
    const copy = { ...g }; delete copy[k];
    let msg = ''; try { validate(copy); } catch (e) { msg = e.message; }
    ok(!REQUIRED_DESCRIPTOR_KEYS.every((r) => r in copy) && /is missing|lowercase slug/.test(msg), `RED control: antigravity without its "${k}" row is refused (${msg.slice(0, 90)})`);
  }
  let whole = ''; try { validate({ ...g }); } catch (e) { whole = e.message; }
  ok(!whole, 'POSITIVE control: the whole antigravity descriptor validates', whole);
}
// ── the caps MIRROR (design-harness-features §6 landing discipline): a caps row
// the client also carries must be BYTE-IDENTICAL to the server's, and a row the
// client carries ALONE is how §2.13's `review` drifted (client had it, server
// never did, so nothing could disagree). Deep-compared per row, per backend.
{
  const MIRRORED = ['permissionRules', 'responseStyle', 'inputModes'];  // rows both tiers carry
  const norm = (v) => JSON.stringify(v, Object.keys(v || {}).sort());
  // A caps-LESS client row is deliberate for a backend with no agent (`shell`
  // carries no caps object at all, so every chrome gate reads the all-false
  // fallback). Those are asserted through the fallback below, not row by row.
  const mirroredIds = Object.keys(BACKEND_META).filter((id) => BACKEND_META[id].caps);
  for (const row of MIRRORED) {
    for (const id of mirroredIds) {
      const server = capsOf(id)[row], client = BACKEND_META[id].caps[row];
      ok(server !== undefined && client !== undefined && norm(server) === norm(client),
        `${id}: client META caps.${row} mirrors the server backend-caps row exactly`,
        `server=${JSON.stringify(server)} client=${JSON.stringify(client)}`);
    }
    // …and the row cannot be a client-only invention (the §2.13 drift shape)
    ok(Object.keys(BACKEND_CAPS).every((id) => BACKEND_CAPS[id][row] !== undefined),
      `every SERVER harness row declares ${row} (a client-only caps row is how \`review\` drifted)`);
  }
  const { backendFeatureCaps } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  // shell / an unknown id: both tiers must land on the SAME all-false row, or a
  // surface would offer a no-agent session something no server rung can answer.
  for (const id of ['shell', 'nope-not-a-backend']) {
    ok(norm(backendFeatureCaps(id).permissionRules) === norm(capsOf(id).permissionRules) && capsOf(id).permissionRules.source === null,
      `${id}: the all-false permissionRules row reads identically on both tiers (chrome shows nothing it cannot do)`,
      `server=${JSON.stringify(capsOf(id).permissionRules)} client=${JSON.stringify(backendFeatureCaps(id).permissionRules)}`);
  }
  ok(!BACKEND_META.shell.caps, 'shell carries NO client caps object on purpose — its chrome resolves through the all-false fallback');
}
// ── THE QUEUE IS A CLAIM, SO IT MUST BE RE-STATABLE (2026-09-09) ───────────
// A queue publication is a stdout record and every wrapper that owns a queue
// keeps its stdout in a RING (MAX_BUFFER, head-dropped), so a server that
// restarts rebuilds a normalizer that has never seen one: its `queue: []` is a
// GUESS, byte-identical whether the wrapper's queue is empty or holds 25 items.
// Every harness that declares a queue therefore owes THREE things — the ask
// (adapter), the answer (wrapper verb) and the per-PROCESS advert the server
// gates the ask on. This is the conformance row, so a FOURTH harness that
// declares queueVerbs and forgets one fails HERE, not in a fleet report.
for (const id of chatHarnessIds()) {
  const verbs = capsOf(id).inputModes?.queueVerbs || [];
  const ad = registry.get(id);
  const w = fs.readFileSync(path.join(REPO, HARNESSES[id].wrapper), 'utf8');
  if (!verbs.length) {
    // a harness with no queue of its own publishes nothing, so there is
    // nothing to re-state — and the adapter must REFUSE rather than format a
    // frame its wrapper would drop (the accept-and-ignore failure of 2.361.4).
    let threw = '';
    try { ad.formatQueueResync(); } catch (e) { threw = e.message; }
    ok(!!threw, `${id}: declares NO queue verbs ⇒ formatQueueResync REFUSES with a reason (${threw})`);
    continue;
  }
  let frame = null, err = '';
  try { frame = JSON.parse(ad.formatQueueResync()); } catch (e) { err = e.message; }
  ok(frame && frame.type === 'queue-resync' && Object.keys(frame).length === 1,
    `${id}: adapter formats the resync ASK as a bare {type:'queue-resync'} frame (no id, no text ⇒ no size gate to get wrong)`, err || JSON.stringify(frame));
  ok(/(?:msg|parsed)\.type === 'queue-resync'|case 'queue-resync'/.test(w),
    `${id}: its wrapper SERVES the verb (${path.basename(HARNESSES[id].wrapper)})`);
  ok(/queueResync:\s*true/.test(w),
    `${id}: …and ADVERTS it in the sidecar it writes — the per-PROCESS gate, because a wrapper spawned before the verb either drops the frame silently (codex) or answers it with a VISIBLE error card (ACP)`);
  // STOP PUTS THE DROPPED QUEUE BACK (owner 2026-10-24, lane stop-refills-composer): a harness that owns a queue drops it
  // on Stop — so its wrapper owes the ONE `queue_dropped` record (the person's rows, through the byte-identical twin)
  // the server's door writes back into the composer. Claude too since 2.369.354 (lane claude-wrapper-queue): MEASURED on
  // 2.1.308 the CLI's own queue RAN a queued frame right after the interrupt, so its wrapper now holds the frame itself.
  ok(/function droppedRecordFor\(rows, \{ dropId, turnId \} = \{\}\) \{/.test(w) && /(record|emitTaskEvent)\('queue_dropped', droppedRecordFor\(/.test(w),
    `${id}: a queue harness's wrapper emits ONE queue_dropped record on Stop (the put-back) through its droppedRecordFor twin (${path.basename(HARNESSES[id].wrapper)})`);
}
// …and the server READS that advert (wrapperCaps is the ONE reader of a
// wrapper's own file; a caps flag nothing surfaces is a fix that never landed).
{
  const { wrapperCaps } = require(path.join(REPO, 'src/server/wrapper-files.js'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hc-qr-'));
  fs.writeFileSync(path.join(d, 'sess-new.json'), JSON.stringify({ caps: { inputQueue: true, queueResync: true } }));
  fs.writeFileSync(path.join(d, 'sess-old.json'), JSON.stringify({ caps: { inputQueue: true } }));
  ok(wrapperCaps(d, 'sess-new', '/x').queueResync === true, 'wrapperCaps surfaces queueResync from a REAL sidecar file');
  ok(wrapperCaps(d, 'sess-old', '/x').queueResync === false, '…and a wrapper predating the verb reads FALSE (never inherited from inputQueue)');
  ok(wrapperCaps(d, 'sess-missing', '/x').queueResync === false, '…and an unreadable sidecar (a REMOTE wrapper: its file is on ITS machine) is FALSE — unknown is never "yes"');
  fs.rmSync(d, { recursive: true, force: true });
}
ok(chatHarnessIds().join(',') === 'claude,codex,opencode,antigravity', `chat-capable harnesses: ${chatHarnessIds().join(',')}`);

// ── HARNESS SETTINGS TABLES (docs/design-harness-settings.zh.md §8, 2026-09-20) ──
// The table is DATA joined to the descriptor by identity; what makes it TRUE
// is (a) the validator passing WITH the descriptor's context, (b) the file
// objects being one spelling (inject.hookFile ∈ configFiles by identity, and
// every configFiles.<id>.rel being the table's own array), and (c) SPAWN
// CONFORMANCE: every `apply.kind==='spawn'` row, driven into the adapter with
// a non-default value, must CHANGE the spawn (args/env — inline --settings
// JSON rides args). A declared row nobody consumes is red here, and the
// synthetic negative control proves the checker can say no.
console.log('— settings tables');
{
  const probeValue = (row) => {
    if (row.type === 'boolean') return !row.default;
    if (row.type === 'number') return (row.default || 0) + 1;
    if (row.type === 'enum') { const o = (row.options || []).find((x) => x.value !== row.default && x.value !== ''); return o ? o.value : 'probe-value'; }
    return 'probe-value';
  };
  const viaProbe = (row) => (row.apply.via === 'extraArgs' ? ['--vs-probe-flag'] : row.apply.via === 'model' && probeValue(row) === 'probe-value' ? 'probe-model' : probeValue(row));
  const spawnOf = (ad, opts) => { const s = ad.buildSessionArgs(opts); return JSON.stringify({ args: s.args, env: s.env || {} }); };
  const spawnRowConsumed = (ad, row) => {
    const modes = row.apply.mode ? [row.apply.mode] : ['chat', 'terminal'];
    return modes.some((mode) => {
      const base = { cwd: '/tmp', mode, permissionMode: 'default', settings: {} };
      const probe = row.apply.via ? { ...base, [row.apply.via]: viaProbe(row) } : { ...base, settings: { [row.key]: probeValue(row) } };
      return spawnOf(ad, base) !== spawnOf(ad, probe);
    });
  };
  for (const id of harnessIds()) {
    const h = HARNESSES[id];
    if (!h.settingsPrefix) { ok(h.settings === null && h.configFiles && Object.keys(h.configFiles).length === 0, `${id}: no settings prefix ⇒ settings null, no config files`); continue; }
    const adapterHas = (verb) => typeof h.Adapter.prototype[verb] === 'function';
    const errs = checkTable(h.settings, { settingsPrefix: h.settingsPrefix, configFiles: h.configFiles, adapterHas });
    ok(errs.length === 0, `${id}: checkTable passes with the descriptor's context`, errs.join('; '));
    for (const [fid, spec] of Object.entries(h.configFiles || {})) ok(spec.rel === h.settings.files[fid].rel && typeof spec.file === 'function' && CREATE_RULES.includes(spec.createIfMissing), `${id}: configFiles.${fid}.rel IS the table's rel array (one spelling) + file()/createIfMissing ∈ ${JSON.stringify(CREATE_RULES)}`);
    if (h.inject && h.inject.hookFile) ok(Object.values(h.configFiles).includes(h.inject.hookFile), `${id}: inject.hookFile IS one of configFiles (identity — the hook entries and the managed keys share the file object)`);
    for (const row of rowsOfKind(h.settings, 'cli-config')) ok(!!h.configFiles[row.apply.file] && h.configFiles[row.apply.file].writable !== false, `${id}: cli-config row ${row.key} targets a declared writable file (${row.apply.file})`);
    const ad = registry.get(id);
    for (const row of rowsOfKind(h.settings, 'spawn')) ok(spawnRowConsumed(ad, row), `${id}: spawn row ${row.key} CHANGES the spawn when set (${row.apply.how})`);
    for (const row of rowsOfKind(h.settings, 'spawn').filter((r) => r.apply.live)) ok(typeof ad[row.apply.live] === 'function', `${id}: live verb ${row.apply.live} (row ${row.key}) is an adapter method`);
  }
  ok(!spawnRowConsumed(registry.get('claude'), { key: 'nobodyReadsMe', type: 'boolean', default: false, apply: { kind: 'spawn', how: 'nothing' } }), 'NEGATIVE CONTROL: a synthetic spawn row nobody consumes is caught (the checker can say no)');
  ok(spawnRowConsumed(registry.get('claude'), rowOf(HARNESS_SETTINGS.claude, 'brief')), 'POSITIVE CONTROL: claude.brief flips --brief');
  ok(HARNESS_SETTINGS.codex.rows.some((r) => r.key === 'historyPersistence' && r.apply.kind === 'cli-config' && r.apply.path.join('.') === 'history.persistence' && r.default === 'save-all'), 'codex declares ONE managed config.toml row: historyPersistence → [history] persistence (default save-all, 0.154.0 evidence in the row comment)');
  ok(!rowOf(HARNESS_SETTINGS.claude, 'autoResumeOnLimit'), 'autoResumeOnLimit is NOT a claude row (generic feature; legacy key spelling lives in GENERIC_LEGACY_KEYS)');
}
// S5 pins: the stdout registry covers exactly the declared protocols; an unknown one has no consumer (never a stream-json fallback)
ok(PROTOCOLS.every((p) => chatHarnessIds().some((id) => HARNESSES[id].caps.streamProtocol === p)), `no dead stdout consumer row: every registered protocol is declared by a chat harness (${PROTOCOLS.join(',')})`);
ok(!hasConsumer('gemini-events') && !hasConsumer(null) && !hasConsumer(capsOf('shell').streamProtocol), 'an unregistered / null protocol has NO stdout consumer (session-stdout reports it loudly; nothing defaults to stream-json)');
ok(BACKEND_META.codex.fallbackModels[0] === 'gpt-6-astra', 'codex fallback model list leads with gpt-6-astra (0.153.4 catalog default)');
// S7 pins: client settings-prefix / account-surface collapses are gone
const libSrc = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8')).join('\n');
ok(!/=== 'codex' \? 'codex' : 'claude'/.test(libSrc) && !/codex \? 'codex' : 'claude'/.test(libSrc), "no `codex ? 'codex' : 'claude'` collapse left in src/lib (a third backend would inherit claude's settings)");
ok(!/backend !== 'claude' && backend !== 'codex'/.test(libSrc) && !/\(backend === 'claude' \|\| backend === 'codex'\) && acctList/.test(libSrc), 'account surfaces gate on META caps.accounts, not an id list');
for (const id of chatHarnessIds()) ok(BACKEND_META[id].settingsPrefix === HARNESSES[id].settingsPrefix, `${id}: client settingsPrefix matches the server descriptor (${HARNESSES[id].settingsPrefix})`);
// lane dc-client-billing (2026-10-04): the descriptor's `ui` row (billing words / account fields / usage bucket / effort+lock facts / legacy ids) is mirrored into the client META key for key, and its billing half agrees with the creds descriptor
for (const id of chatHarnessIds()) ok(!!HARNESSES[id].ui && JSON.stringify(BACKEND_META[id].ui ?? null) === JSON.stringify(HARNESSES[id].ui), `${id}: client META ui row deep-equals the descriptor's ui row (no drift)`, JSON.stringify({ client: BACKEND_META[id].ui, server: HARNESSES[id].ui }));
for (const id of chatHarnessIds()) { const b = HARNESSES[id].ui?.billing, c = HARNESSES[id].creds; ok(!b === !c && (!b || (b.defaultIdField === c.defaultIdField && b.longLivedToken === c.longLivedToken && b.apiKeys === c.supportsApiKeys)), `${id}: ui.billing ${b ? 'agrees with the creds descriptor (defaultIdField / longLivedToken / apiKeys)' : 'absent exactly where creds are (no account roster)'}`); }
// S2 pins: credential mechanics live on the descriptor; accounts.js reads them
for (const id of chatHarnessIds()) {
  const c = HARNESSES[id].creds;
  if (!c) { ok(BACKEND_META[id].caps?.accounts === false && HARNESSES[id].caps.pool === false, `${id}: no credential mechanics ⇒ client META caps.accounts false + no pool (the agent holds its own login)`); continue; }
  // the spawn form: ONE env var pointed at the account dir (codex CODEX_HOME), or a spawnEnv(dir) answer (antigravity:
  // HOME = the account's root + the bus disabled — a name no *EnvVar field may carry, see THE EVERY-PROCESS CENSUS)
  ok(c && typeof c.subsDirName === 'string' && typeof c.authFile === 'string' && (typeof c.spawnEnvVar === 'string' || typeof c.spawnEnv === 'function') && typeof c.loginLabel === 'string' && typeof c.defaultIdField === 'string' && typeof c.keychainSensitive === 'boolean' && typeof c.parseAuth === 'function', `${id}: creds descriptor complete (${c?.subsDirName}, ${c?.spawnEnvVar || (typeof c?.spawnEnv === 'function' ? 'spawnEnv()' : undefined)})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-creds-'));
  ok(c.parseAuth(tmp).loggedIn === false, `${id}: parseAuth on an empty dir = not logged in (never throws)`);
  if (id === 'claude') { fs.writeFileSync(path.join(tmp, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', subscriptionType: 'max', expiresAt: Date.now() + 3600000 } })); fs.writeFileSync(path.join(tmp, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', organizationName: 'Org' } })); const r = c.parseAuth(tmp); ok(r.loggedIn && r.subscriptionType === 'max' && r.email === 'a@b.c' && r.org === 'Org' && r.accessToken === 'tok', 'claude parseAuth reads creds + identity from the dir'); }
  if (id === 'antigravity') {
    // the login is a SECRET AT REST we never read: "signed in" is a STAT — an unreadable file still answers
    const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
    const f = path.join(tmp, H8.TOKEN_REL); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'opaque'); fs.chmodSync(f, 0o000);
    ok(c.parseAuth(tmp).loggedIn === true && c.parseAuth(tmp).email === null, `${id}: parseAuth = a stat of ${H8.TOKEN_REL} (mode 000 — never opened), no identity claimed`);
    const env = c.spawnEnv(tmp);
    ok(env.HOME === tmp && env.DBUS_SESSION_BUS_ADDRESS === 'disabled:' && Object.keys(env).length === 2, `${id}: spawnEnv = HOME the account root + the bus disabled (agy dials any findable bus — measured)`, env);
    fs.chmodSync(f, 0o600);
  }
  if (id === 'codex') { const claims = Buffer.from(JSON.stringify({ email: 'x@y.z', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } })).toString('base64url'); fs.writeFileSync(path.join(tmp, 'auth.json'), JSON.stringify({ tokens: { access_token: 'a', id_token: `h.${claims}.s` } })); const r = c.parseAuth(tmp); ok(r.loggedIn && r.email === 'x@y.z' && r.plan === 'pro' && r.subscriptionType === 'pro' && r.authMode === 'chatgpt', 'codex parseAuth reads identity from the id_token (subscriptionType mirrors plan)'); }
  fs.rmSync(tmp, { recursive: true, force: true });
}
const acc = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
// S2 remainder (2.369.27): ship files / seeders / remote-creds shape / host-facts key / swap bump ride the descriptor too
for (const id of chatHarnessIds()) {
  const c = HARNESSES[id].creds;
  if (!c) continue;
  // a shipped login lists its file + the remote probe; a localOnly row (antigravity) ships NOTHING and probes nothing
  const ships = c.localOnly === true ? (c.files.length === 0 && c.probe == null) : (c.files.includes(c.authFile) && c.probe && typeof c.probe.file === 'string' && typeof c.probe.marker === 'string');
  ok(Array.isArray(c.files) && ships && typeof c.hostFactsKey === 'string' && typeof c.longLivedToken === 'boolean' && typeof c.supportsApiKeys === 'boolean' && typeof c.seedDir === 'function' && ('bumpFile' in c) && typeof c.remoteSymlinks === 'object' && Array.isArray(c.ensureTargets), `${id}: creds remainder complete (files ${c.files?.join('+')}, hostFactsKey ${c.hostFactsKey}, bumpFile ${c.bumpFile})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-seed-'));
  const prevHome = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(tmp, 'shared'); // keep the codex seeder off the real ~/.codex
  const prevH = process.env.HOME; process.env.HOME = path.join(tmp, 'machine-home'); fs.mkdirSync(process.env.HOME); // …and the antigravity farm off the real HOME
  const acctDir = path.join(tmp, 'acct'); fs.mkdirSync(acctDir);
  try { c.seedDir(acctDir); ok(fs.readdirSync(acctDir).length >= 1, `${id}: seedDir populates a fresh account dir (${fs.readdirSync(acctDir).join(',')})`); } finally { if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome; process.env.HOME = prevH; }
  fs.rmSync(tmp, { recursive: true, force: true });
}
ok((acc.match(/this\._remoteCreds\(/g) || []).length >= 2 && !/CODEX_SUB_FILES|CLAUDE_SUB_FILES/.test(acc) && !/hostFacts\.codex\?\.email/.test(acc) && !/const isCodex = rec\.backend === 'codex'/.test(acc) && !/_seedCodexDir\(dir\) \{\n    const shared/.test(acc) && !/localEnv: \{ CODEX_HOME:/.test(acc) && !/localEnv: \{ CLAUDE_SECURESTORAGE_CONFIG_DIR:/.test(acc), 'accounts.js export/import/delete/verdict/spawn-env/remote-creds read the descriptor (S2 remainder)');
ok((acc.match(/this\._readAuthFor\(/g) || []).length >= 4 && (acc.match(/this\._acctDir\(/g) || []).length >= 3 && !/codexSubDir\(a\.id\) : this\.subDir\(a\.id\)/.test(acc) && !/\? this\.readCodexSubAuth\(/.test(acc), 'accounts.js reads dirs/auth/labels/default-field through the descriptor (mechanical codex-or-claude ternaries gone)');
// S6 wiring pins: injection topology decided by the strategy, never a backend id
const ar = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
ok(!/s\.backend !== 'codex'/.test(ar) && (ar.match(/honoursSessionStart\(s\)/g) || []).length === 5 && /if \(!honoursSessionStart\(s\)\) return res\.json\(\{ success: true, context: '' \}\);/.test(ar) && /getHarness\(b\)\.inject\?\.kind === 'wrapper'/.test(ar), 'agent-routes: the four SessionStart seen-gates + the r7 door (a harness that ignores SessionStart output gets an empty task-context — nothing drained) consult inject.sessionStartHonoured, and the hook-call door reads inject.kind (no backend-id gate left)');
const atg = fs.readFileSync(path.join(REPO, 'src/server/agent-tool-generators.js'), 'utf8');
ok(/stripHookEntries\(root, ALL_HOOK_EVENTS\)/.test(atg) && /ALL_HOOK_EVENTS = \[\.\.\.new Set\(listHarnesses\(\)/.test(atg) && !/\[\.\.\.HOOK_EVENTS, 'Stop'\]/.test(atg), 'the hook REMOVAL path strips every event any harness registers (union from the registry, through the SHARED mutator the remote helper embeds; the old literal was a lost binding after S6)');
ok(/HOOK_FILES = Object\.fromEntries\(listHarnesses\(\)/.test(atg) && /HOOK_EVENTS_FOR = \(harness\) => \{ const h = listHarnesses\(\)/.test(atg) && !/harness === 'claude' \? \[/.test(atg), 'agent-tool-generators: hook files + events come from the registry (no per-harness literals)');
ok(HARNESSES.claude.inject.hookEvents.includes('Stop') && !HARNESSES.codex.inject.hookEvents.includes('Stop') && HARNESSES.codex.inject.sessionStartHonoured === false, 'claude registers Stop, codex does not and ignores SessionStart (zero behaviour change)');

// ── turnState / inProgressTools (design-harness-features §2.5 + §3.5) ──
// Where "is a turn running" comes from, declared per harness and MIRRORED on
// the client. §6's landing rule: a caps row the server does not have must not
// exist on the client either — that is exactly how `review` drifted.
console.log('— turnState');
{
  for (const id of Object.keys(BACKEND_CAPS)) {
    const row = BACKEND_CAPS[id];
    ok([null, 'authoritative', 'derived'].includes(row.turnState) && typeof row.inProgressTools === 'boolean',
      `${id}: declares turnState + inProgressTools (${row.turnState} / ${row.inProgressTools})`);
  }
  ok(capsOf('claude').turnState === 'authoritative' && capsOf('claude').inProgressTools === false,
    "claude publishes system/session_state_changed (idle|running|requires_action) — VERIFIED on our stdout; inProgressTools stays FALSE because set_in_progress_tool_use_ids never leaves the CLI's own host callback (test-stdout-registry re-measures the wire)");
  // NO harness may claim a tool-granular run set today. This is the assert that
  // FAILS if someone flips a row back on the strength of a record existing in a
  // schema — the wire leg in test-stdout-registry is the only thing that may
  // justify flipping it, and it says so in its own failure message.
  ok(Object.values(BACKEND_CAPS).every((r) => r.inProgressTools === false),
    'no harness claims inProgressTools — a cap is a promise to a surface, and no surface can currently draw an "executing" dot from any harness',
    JSON.stringify(Object.fromEntries(Object.entries(BACKEND_CAPS).map(([k, v]) => [k, v.inProgressTools]))));
  ok(capsOf('codex').turnState === 'authoritative' && capsOf('codex').inProgressTools === false,
    'codex: turn/started + turn/completed are its own turn boundaries; no run-set record exists');
  ok(capsOf('opencode').turnState === 'authoritative' && capsOf('opencode').inProgressTools === false,
    "opencode (ACP v1): prompt_end's stop reason is the agent's own statement that the prompt is over");
  ok(capsOf('shell').turnState === null && capsOf('shell').inProgressTools === false, 'shell declares no turn concept at all (terminal-only)');
  ok(capsOf('gemini').turnState === null && capsOf('gemini').inProgressTools === false, "an unknown backend gets the no-turn row (never claude's by accident)");
  // The declaration must be TRUE of the consumer: each authoritative harness's
  // stdout consumer flips _isStreaming from its own protocol records.
  const consumers = { claude: 'claude-stream-json', codex: 'codex-events', opencode: 'acp-events', antigravity: 'acp-events' };
  for (const [id, mod] of Object.entries(consumers)) {
    const src = fs.readFileSync(path.join(REPO, `src/server/stdout/${mod}.js`), 'utf8');
    ok(capsOf(id).turnState !== 'authoritative' || /session\._isStreaming = /.test(src),
      `${id}: the 'authoritative' claim is backed by its consumer actually driving _isStreaming (${mod}.js)`);
  }
  // …and the CLIENT mirror deep-equals it, key by key, in both directions.
  for (const id of Object.keys(BACKEND_META)) {
    const caps = BACKEND_META[id].caps;
    if (!caps) continue; // shell carries no caps object
    ok(caps.turnState === capsOf(id).turnState && caps.inProgressTools === capsOf(id).inProgressTools,
      `${id}: client META mirrors turnState/inProgressTools exactly (no drift)`, JSON.stringify({ client: [caps.turnState, caps.inProgressTools], server: [capsOf(id).turnState, capsOf(id).inProgressTools] }));
    for (const k of ['turnState', 'inProgressTools']) {
      ok(k in capsOf(id), `${id}: the client's ${k} row EXISTS on the server (a client-only caps row is forbidden — the 'review' drift)`);
    }
  }
  // The client gates on the ROW, never on a backend id.
  const sb = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  ok(!/_backend === 'claude'[^\n]*turnState|turnState[^\n]*_backend === 'claude'/.test(sb),
    'the status bar never asks "is this claude?" to decide whether to draw the turn state');
}

// ── §2.13 caps收口: server↔client DEEP COMPARE + no backend-id gate left ──
// The drift this exists to stop is REAL: the client carried `caps.review` for
// releases while src/backend-caps.js had no such row at all, so the mirror had
// nothing to be checked against and four call sites kept gating on a backend
// id instead. Two assertions: (a) every client caps key is either the server
// row's value (deep) or a named chrome-only flag, (b) the four call sites read
// caps — proven by a checker that is itself proven on a planted gate.
console.log('— caps mirror (§2.13)');
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Client-only FEATURE flags: pure chrome with no server behaviour behind them.
// A NEW client-only key fails here — that is the law ("a client-only row is
// forbidden"), with today's four grandfathered BY NAME.
// 2026-09-08: 'autoResume' LEFT this list — it is a real server row now
// (deriveAutoResume, written by the registry from the descriptor), so the deep
// compare below enforces the mirror instead of grandfathering it. That is the
// law working: a client-only flag is allowed only while nothing on the server
// answers for it.
const CLIENT_ONLY_OK = new Set(['accounts', 'quotaRefresh']); // 'effort' LEFT (lane effort-menu-per-harness): the declared ui.effortLevels answers it (hasEffortMenu) — one fact, not a chrome flag
for (const id of chatHarnessIds()) {
  const srv = capsOf(id), cli = BACKEND_META[id].caps || {};
  const drift = Object.keys(cli).filter((k) => (k in srv ? !deepEq(srv[k], cli[k]) : !CLIENT_ONLY_OK.has(k)));
  ok(drift.length === 0, `${id}: client caps mirror the server row (or are named chrome-only flags)`, drift.map((k) => `${k}: server=${JSON.stringify(srv[k])} client=${JSON.stringify(cli[k])}`).join(' | '));
  ok(['review', 'renameWriteback', 'forkAtMessage'].every((k) => typeof srv[k] === 'boolean' && typeof cli[k] === 'boolean'),
    `${id}: review / renameWriteback / forkAtMessage exist on BOTH sides (review=${srv.review} renameWriteback=${srv.renameWriteback} forkAtMessage=${srv.forkAtMessage})`);
}
ok(capsOf('claude').forkAtMessage === true && capsOf('claude').fork === true && capsOf('codex').forkAtMessage === false && capsOf('codex').fork === true,
  'forkAtMessage is NOT fork: claude can fork at a message (--resume-session-at <uuid> --fork-session), codex forks the whole thread only');
ok(capsOf('codex').review === true && capsOf('claude').review === false && capsOf('codex').renameWriteback === true && capsOf('claude').renameWriteback === false,
  'review + renameWriteback are codex-side today (the values the four call sites used to hardcode)');

// The checker: a backend-id gate anywhere in a named block. Proven on a
// PLANTED gate before it is trusted to report a clean tree (a grep pin that
// can only ever pass is not a pin).
// Both spellings of the literal id test: the bare `backend === 'codex'` and
// the DEFAULTED `(s.backend || 'claude') === 'codex'` (the codex ⟳ trigger's
// spelling — the bare-only regex read it as clean).
const hasBackendIdGate = (text) => /backend(?:\s*(?:\|\||\?\?)\s*'[a-z-]+'\s*\))?\s*[!=]==\s*'(?:codex|claude|opencode|antigravity|shell)'/.test(text);
const blockOf = (src, marker, lines) => {
  const i = src.indexOf(marker);
  return i < 0 ? null : src.slice(i).split('\n').slice(0, lines).join('\n');
};
const SITES = [
  ['src/ws-handler.js', "case 'review-start': {", 12, 'ws review-start'],
  ['src/server/conversation-ops.js', 'if (trimmedName) session.name = trimmedName;', 8, 'ws rename writeback'], // design q-046: the ws case's body moved whole to the conversations' ops (the automation door renames through it too)
  ['src/lib/chat-view.js', '_syncReviewAvailability() {', 8, 'client review availability'],
  ['src/lib/chat-view.js', '_startReadOnlyPolling() {', 8, 'client detached-review poll'],
  ['src/lib/chat-renderers.js', 'addForkBtn(el, msg) {', 8, 'per-message fork button'],
  // The ACTION half of the same capability. Round 1 gated only the button, so
  // the first harness whose row said forkAtMessage:true would have shown a
  // control whose click returned silently on a `backend !== 'claude'` branch.
  ['src/lib/chat-view.js', '_forkFromMessage(uuid, msg) {', 8, 'per-message fork handler'],
  // The TRIGGER half of renameWriteback (round 3). The pin above covers the ws
  // case that DOES the writeback; this is the only site that decides whether
  // the `rename-session` frame is produced at all, and it read
  // `sessionOrKey?.backend === 'codex'`. Same latent shape as the fork defect
  // with the halves swapped: the first harness whose row flips to true would
  // have had a server ready to write and a client that never asks.
  ['src/lib/sidebar-state.js', 'proto.renameSession = async function', 28, 'client rename-writeback trigger'],
  // The manual codex quota verbs (2.369.151): the ws case read
  // `session.backend === 'codex'`; it now reads quotaProbe. (The reset-credit
  // verb left the ws switch in design-reset-credits r2 — it bypassed the
  // engine's ONE writer; test-reset-credit-ui §4 censuses every writer.)
  ['src/ws-handler.js', "case 'codex-read-limits':", 10, 'ws codex quota verb (read limits)'],
  // …and its CLIENT half (the rename lesson: a server ready to serve and a
  // client that never asks). The ⟳ picked its session by the literal id; it
  // now picks through the client mirror row `quotaRefresh === 'session-rpc'`.
  ['src/lib/usage-meter.js', '_refreshCodexQuota(btn) {', 6, 'client codex ⟳ trigger'],
];
ok(hasBackendIdGate("const live = all.find((s) => (s.backend || 'claude') === 'codex' && s.status === 'live');"), 'NEGATIVE CONTROL: the checker catches the DEFAULTED spelling `(s.backend || \'claude\') === \'codex\'` (the pre-fix codex ⟳ trigger)');
ok(!hasBackendIdGate("const live = all.find((s) => backendFeatureCaps(s.backend || 'claude').quotaRefresh === 'session-rpc');"), '…and reads a caps read with a defaulted id as clean');
for (const [file, marker, lines, label] of SITES) {
  const block = blockOf(fs.readFileSync(path.join(REPO, file), 'utf8'), marker, lines);
  ok(block !== null, `${label}: the call site is still where the pin looks (${file} :: ${marker})`);
  ok(block !== null && !hasBackendIdGate(block), `${label}: gated on caps, no backend-id branch left`, block ? block.split('\n').filter((l) => hasBackendIdGate(l)).join(' / ') : 'marker gone');
  ok(hasBackendIdGate(`${block}\n  if (backend !== 'claude') return;`), `${label}: NEGATIVE CONTROL — the checker DOES catch a planted backend-id gate`);
}

// The quota verbs are pinned POSITIVELY too (deleting the gate would write a
// codex stdin verb into a claude wrapper): each verb reads ITS capability.
{
  const qBlock = blockOf(fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8'), "case 'codex-read-limits':", 10) || '';
  const READS_QUOTA_CAPS = /capsOf\(session\?\.backend\)[\s\S]*quotaProbe === 'rpc-rate-limits'[\s\S]*&& served\)/;
  ok(READS_QUOTA_CAPS.test(qBlock), 'ws codex quota verb: read limits reads caps.quotaProbe === rpc-rate-limits, and the write is gated on that verdict');
  ok(!READS_QUOTA_CAPS.test("if (session?.pty && session.mode === 'chat' && session.backend === 'codex') {"), '…NEGATIVE CONTROL: that checker reads FALSE on the pre-fix backend-id line');
  ok(capsOf('codex').resetCredit === true && capsOf('codex').quotaProbe === 'rpc-rate-limits' && capsOf('claude').resetCredit === false && capsOf('claude').quotaProbe !== 'rpc-rate-limits' && capsOf('shell').resetCredit === false && capsOf('shell').quotaProbe === null && capsOf('gemini-unknown').resetCredit === false && capsOf('gemini-unknown').quotaProbe === null,
    '…and the verdict is unchanged: codex is served both verbs, claude / shell / an unknown id refuse both');
}

// The client ⟳ trigger is pinned POSITIVELY as well (deleting the filter
// would send the verb to a claude session the server then refuses).
{
  const READS_QUOTA_MIRROR = /backendFeatureCaps\(s\.backend \|\| 'claude'\)\.quotaRefresh === 'session-rpc'/;
  const cBlock = blockOf(fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8'), '_refreshCodexQuota(btn) {', 6) || '';
  ok(READS_QUOTA_MIRROR.test(cBlock), 'client codex ⟳ trigger: picks its session by the mirror row quotaRefresh === session-rpc');
  ok(!READS_QUOTA_MIRROR.test("const live = (this.sidebar?._allSessions || []).find((s) => (s.backend || 'claude') === 'codex' && s.status === 'live' && s.webuiId && !s.host);"), '…NEGATIVE CONTROL: that checker reads FALSE on the pre-fix id line');
  ok(backendFeatureCaps('codex').quotaRefresh === 'session-rpc' && backendFeatureCaps('claude').quotaRefresh === undefined && backendFeatureCaps('shell').quotaRefresh === undefined && backendFeatureCaps('nope').quotaRefresh === undefined,
    '…and the pick is unchanged: codex sessions qualify, claude / shell / an unknown id never do');
}

// "No backend-id branch left" is an ABSENCE test, and deleting the gate
// outright also passes it — which for the rename trigger is a real behaviour
// change (the ws case writes session.name + session-meta and broadcasts, so
// sending the frame for claude is not a no-op). So the trigger is ALSO pinned
// positively: it must read the capability row.
const READS_RENAME_CAP = /backendFeatureCaps\(sessionOrKey\?\.backend\)\.renameWriteback/;
const renameTrigger = blockOf(fs.readFileSync(path.join(REPO, 'src/lib/sidebar-state.js'), 'utf8'), 'proto.renameSession = async function', 28);
ok(READS_RENAME_CAP.test(renameTrigger || ''), 'client rename-writeback trigger: reads caps.renameWriteback (the mirror row test-harness-contract deep-compares), so it cannot be silently DELETED either');
ok(!READS_RENAME_CAP.test("if (sessionOrKey?.backend === 'codex' && name.trim()) this.app.renameBackendSession?.(sessionOrKey, name.trim());"),
  '…NEGATIVE CONTROL: that checker reads FALSE on the pre-fix backend-id line');
ok(/import \{ getSessionKey, backendFeatureCaps \} from '\.\/agent-meta\.js';/.test(fs.readFileSync(path.join(REPO, 'src/lib/sidebar-state.js'), 'utf8')),
  '…and the predicate is the SHARED one (agent-meta), not a local caps twin');
// ZERO BEHAVIOUR CHANGE TODAY (the reason this is a drift fix, not a feature):
// the predicate the trigger now reads answers exactly what the deleted id test
// answered, for every backend that ships — and for the two falsy shapes the
// call site really passes (a bare string session key, and an unknown backend),
// where `sessionOrKey?.backend` is undefined.
for (const id of [...Object.keys(BACKEND_META), 'gemini', undefined])
  ok(backendFeatureCaps(id).renameWriteback === (id === 'codex'), `renameWriteback(${String(id)}) === (id==='codex') — the trigger's verdict is unchanged for every shipped backend`);
ok(backendFeatureCaps(undefined).renameWriteback === false && backendFeatureCaps('gemini').renameWriteback === false,
  '…and an unknown/absent backend gets the all-false row (chrome never asks for something the harness cannot do)');


// ── PER-SESSION GIT WORKTREE (owner ruling 9) ──
// The caps row is the ONE gate every surface reads, so the client mirror is
// deep-compared here: a drifted mirror would offer a checkbox for a flag the
// spawn refuses (exactly the §2.13 `review` drift this suite exists to stop).
console.log('— worktree caps (owner ruling 9)');
{
  for (const id of Object.keys(BACKEND_META)) {
    const server = capsOf(id).worktree, client = BACKEND_META[id].caps?.worktree;
    ok(!!server && typeof server.supported === 'boolean', `${id}: server backend-caps declares a worktree row`);
    // A META row that declares `caps` at all MUST carry the mirror; a row with
    // no caps object (shell — terminal-only, no feature chrome) reads the
    // all-false NO_WORKTREE default, which is what the server row says too.
    // Both spellings are asserted, so neither side can drift alone.
    if (BACKEND_META[id].caps) ok(JSON.stringify(client) === JSON.stringify(server), `${id}: client META caps.worktree deep-equals the server row (no drift)`, JSON.stringify({ client, server }));
    else ok(client === undefined && server.supported === false, `${id}: no client caps row at all ⇒ the server row must be the all-false one`, JSON.stringify(server));
    ok(JSON.stringify(worktreeCapsFor(id)) === JSON.stringify(worktreeCaps(id)), `${id}: the two readers (client worktreeCapsFor / server worktreeCaps) agree`);
  }
  // The FACTS, dumped from `claude --help` on 2.1.257 and measured on a real
  // repo (see the caps-row comment): only claude has the flag, it is spelled
  // --worktree, and it needs a git repository.
  ok(capsOf('claude').worktree.supported && capsOf('claude').worktree.flag === '--worktree' && capsOf('claude').worktree.requiresGitRepo === true
    && ['codex', 'shell', 'opencode', 'antigravity'].every((id) => capsOf(id).worktree.supported === false),
    'claude is the only harness with the flag, spelled exactly --worktree, needing a git repo');
  ok(worktreeCaps('gemini') === NO_WORKTREE, "an unknown backend gets the all-false NO_WORKTREE row (never claude's by accident)");
  // NEVER --tmux (its own help: "Create a tmux session for the worktree
  // (requires --worktree)") — dtach is the persistence layer.
  const capsSrc = fs.readFileSync(path.join(REPO, 'src/backend-caps.js'), 'utf8');
  const adapterSrc = fs.readFileSync(path.join(REPO, 'src/adapters/claude-code.js'), 'utf8');
  ok(!/flag:\s*'--tmux'/.test(capsSrc) && !/args\.push\('--tmux'/.test(adapterSrc) && /--tmux must never be spawned/.test(adapterSrc),
    'no harness declares --tmux and the claude adapter never pushes it');
  // REFUSAL is a tri-state read: only a DEFINITIVE "not a repo" refuses.
  ok(!worktreeRefusal({ backend: 'claude', want: false, isGitRepo: false }), 'worktreeRefusal: not asked ⇒ no refusal, whatever the probe said');
  ok(worktreeRefusal({ backend: 'codex', want: true, isGitRepo: true })?.reason === 'unsupported', 'worktreeRefusal: a harness without the flag refuses with `unsupported`');
  ok(worktreeRefusal({ backend: 'claude', want: true, isGitRepo: false })?.reason === 'not-a-git-repo', 'worktreeRefusal: a definitive non-repo refuses with `not-a-git-repo`');
  ok(worktreeRefusal({ backend: 'claude', want: true, isGitRepo: null }) === null, 'worktreeRefusal: an UNANSWERABLE probe (null) is NOT a refusal — the CLI speaks for itself');
  // THE HOOK ESCAPE — the CLI's gate is `WorktreeCreate hook OR git repo`
  // (2.1.257: `if(!pX() && !await rh())`, pX = fB("WorktreeCreate").length>0).
  // Mirroring only the repo half is a FALSE REFUSAL of exactly the setup the
  // CLI's own error text recommends ("Configure a WorktreeCreate hook in
  // settings.json to use --worktree with other VCS systems").
  ok(capsOf('claude').worktree.hookEscape === 'WorktreeCreate', 'the caps row NAMES the hook event that makes a non-repo legal');
  ok(worktreeRefusal({ backend: 'claude', want: true, isGitRepo: false, hasWorktreeHook: true }) === null,
    'worktreeRefusal: a definite WorktreeCreate hook RESCUES a definite non-repo (the CLI would have accepted it)');
  ok(worktreeRefusal({ backend: 'claude', want: true, isGitRepo: false, hasWorktreeHook: null })?.reason === 'not-a-git-repo',
    'worktreeRefusal: an UNKNOWN hook still refuses a KNOWN non-repo (the alternative is the instantly-dead window)');
  ok(worktreeRefusal({ backend: 'claude', want: true, isGitRepo: false, hasWorktreeHook: false })?.hookEscape === 'WorktreeCreate',
    'worktreeRefusal: the refusal CARRIES the escape hatch so the message can name it (no dead end for a non-git VCS)');
  // NEGATIVE CONTROL: the hook may only ever RESCUE — it can never itself
  // cause, or suppress, an `unsupported` refusal on a harness without the flag.
  ok(worktreeRefusal({ backend: 'codex', want: true, isGitRepo: true, hasWorktreeHook: true })?.reason === 'unsupported'
    && worktreeRefusal({ backend: 'claude', want: true, isGitRepo: true, hasWorktreeHook: false }) === null,
    'NEGATIVE CONTROL: the hook never creates a refusal and never overrides `unsupported`');
  // WIRING PIN (2.355.0's law: a pure fix with no staged call site is a fix
  // that ships dead) — ws-create must actually probe the hook and hand it to
  // the rule, on BOTH transports.
  const wsCreateSrc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(/claudeWorktreeHookConfigured/.test(wsCreateSrc) && /hooks\.WorktreeCreate/.test(wsCreateSrc)
    && /worktreeRefusal\(\{[^}]*hasWorktreeHook\b/.test(wsCreateSrc) && /__VS_WTHOOK_YES__/.test(wsCreateSrc),
    'WIRING: ws-create probes the hook locally AND over the host shell, and passes it to worktreeRefusal');
  ok(/refusal\.hookEscape/.test(wsCreateSrc), 'WIRING: the refusal message names the hook escape hatch from the caps row');
  // WHICH SPAWNS PASS THE FLAG (2.1.257 decompiled): a resume RE-ENTERS the
  // recorded worktree by itself (y6(host, se.worktreeSession)), a fork STRIPS
  // the binding (Une(se,{stripWorktreeSession:true})).
  const wt = (o) => worktreeSpawnArgs({ backend: 'claude', ...o });
  ok(JSON.stringify(wt({ want: true }).args) === '["--worktree"]' && wt({ want: true }).why === 'new', 'worktreeSpawnArgs: a NEW session passes --worktree with NO name (the CLI mints a unique one)');
  ok(wt({ want: true, resume: true }).pass === false && wt({ want: true, resume: true }).why === 'resume-rebinds', 'worktreeSpawnArgs: a plain RESUME passes NOTHING (the CLI re-enters its own recorded worktree; a second flag = a SECOND worktree)');
  ok(JSON.stringify(wt({ want: true, resume: true, fork: true }).args) === '["--worktree"]' && wt({ want: true, resume: true, fork: true }).why === 'fork', 'worktreeSpawnArgs: a FORK passes it again (--fork-session strips the binding)');
  ok(wt({ want: false }).args.length === 0 && worktreeSpawnArgs({ backend: 'codex', want: true }).args.length === 0, 'worktreeSpawnArgs: not asked / unsupported harness ⇒ no args');
  // The client surfaces gate on the CAPS ROW, never on a backend id.
  const appSrc = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
  const propsSrc = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  ok(/worktreeCapsFor\(backend\)\.supported/.test(appSrc) && /worktreeCapsFor\(s\.backend \|\| 'claude'\)/.test(propsSrc)
    && !/backend === 'claude'[^\n]*worktree/.test(appSrc) && !/worktree[^\n]*backend === 'claude'/.test(propsSrc),
    'the New Session row + the Session Properties row gate on worktreeCapsFor(backend).supported (no backend-id branch)');
  // BOTH surfaces are a real CHECKBOX writing the same per-session key, so the
  // pick a user makes in the dialog and the one they change later are ONE
  // fact (`cfg.worktree`), which resumeSession/fork read back.
  const lifeSrc = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  const sideSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-state.js'), 'utf8');
  ok(/id="input-worktree"/.test(fs.readFileSync(path.join(REPO, 'public/index.html'), 'utf8'))
    && /getElementById\('input-worktree'\)\?\.checked/.test(appSrc)
    && /setSessionConfig\?\.\(s, \{ \.\.\.\(sidebar\.getSessionConfig\?\.\(s\) \|\| \{\}\), worktree: cb\.checked \}\)/.test(propsSrc),
    'the tick is a CHECKBOX in both places, writing the one per-session key (dialog → create, properties → cfg.worktree)');
  ok(/if \(config\?\.worktree === true \|\| config\?\.worktree === false\) clean\.worktree = config\.worktree;/.test(sideSrc)
    && !/'outputStyle', 'worktree'\]/.test(sideSrc)
    && /worktree: worktree !== undefined \? worktree : savedCfg\.worktree/.test(lifeSrc),
    "…and the saved pick SURVIVES as a TRI-STATE (sidebar-state persists an explicit false like autoResume — the truthy list would erase an untick; resumeSession reads it back)");
}

// ── THE 「可用工具」 ROW (lane new-session-form): `toolAllowlist` = the harness's OWN per-session tool switch — a flag
// on its command line, never a VibeSpace rule. Re-derived per descriptor: the row's shape, the descriptor's caps IS the
// row, the client mirror deep-equals it, and the adapter CONSUMES a pick exactly when the row exists (driven, never
// grepped); then the PURE rule (closed vocabularies; a ✗ Bash never reaches argv) and each adapter's spelling.
console.log('— toolAllowlist caps (the New Session form\'s 可用工具 row)');
{
  const { toolAllowlistCaps, toolAllowlistArgs } = require(path.join(REPO, 'src/backend-caps.js'));
  const { toolAllowlistFor, toolAllowlistArgs: clientToolArgs } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  const NSM = await import(path.join(REPO, 'src/lib/new-session-model.js'));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const shapeOk = (r) => r === null || (!!r && (r.kind === 'tools'
    ? Array.isArray(r.tools) && r.tools.length > 0 && Array.isArray(r.keep) && r.keep.every((k) => r.tools.includes(k)) && /^--/.test(r.allow) && /^--/.test(r.deny)
    : r.kind === 'sandbox' && Array.isArray(r.sandbox) && r.sandbox.length > 0 && Array.isArray(r.approval) && r.approval.length > 0 && /^--/.test(r.sandboxFlag) && /^--/.test(r.approvalFlag)));
  const pickFor = (r) => (!r ? { allow: ['Read'] } : r.kind === 'tools' ? { allow: [r.tools[0]], deny: [r.tools.find((x) => !r.keep.includes(x) && x !== r.tools[0])] } : { sandbox: r.sandbox[0], approval: r.approval[0] });
  for (const id of harnessIds()) {
    const h = harnessOf(id); const row = capsOf(id).toolAllowlist;
    ok(Object.prototype.hasOwnProperty.call(capsOf(id), 'toolAllowlist') && shapeOk(row), `${id}: caps declares a toolAllowlist row of a known shape (${row ? row.kind : 'none'})`, JSON.stringify(row));
    ok(same(h.caps?.toolAllowlist ?? null, row ?? null), `${id}: the descriptor's caps row IS the row capsOf answers`);
    if (BACKEND_META[id]?.caps) ok(same(BACKEND_META[id].caps.toolAllowlist ?? null, row ?? null), `${id}: the client META mirror deep-equals the server row (no drift)`, JSON.stringify({ client: BACKEND_META[id].caps.toolAllowlist, server: row }));
    ok(same(toolAllowlistFor(id), toolAllowlistCaps(id)), `${id}: the two readers agree (client toolAllowlistFor / server toolAllowlistCaps)`);
    if (h.kind !== 'chat') continue;
    const ad = registry.get(id);
    const spawnOf = (o) => { const s = ad.buildSessionArgs(o); return JSON.stringify({ args: s.args, env: s.env || {} }); };
    const consumed = ['chat', 'terminal'].some((mode) => { const base = { cwd: '/tmp', mode, permissionMode: 'default', settings: {} }; try { return spawnOf(base) !== spawnOf({ ...base, tools: pickFor(row) }); } catch { return false; } });
    ok(consumed === !!row, `${id}: the adapter ${row ? 'CONSUMES a pick of its row' : 'never forwards a pick (it declares no row)'} — driven through buildSessionArgs`);
  }
  const TOOL_ROW_KIND = { claude: 'tools', codex: 'sandbox', shell: null, opencode: null, antigravity: null };   // every harness: its row's kind (null = no row)
  ok(harnessIds().every((id) => id in TOOL_ROW_KIND && (capsOf(id).toolAllowlist?.kind ?? null) === TOOL_ROW_KIND[id]),
    'claude: --allowedTools / --disallowedTools · codex: sandbox + approval · a plain shell, opencode, antigravity: no row', JSON.stringify(Object.fromEntries(harnessIds().map((id) => [id, capsOf(id).toolAllowlist?.kind ?? null]))));
  ok(toolAllowlistCaps('gemini') === null && toolAllowlistFor('gemini') === null, 'an unknown backend has no row (never claude\'s by accident)');
  ok(capsOf('claude').toolAllowlist.keep.includes('Bash'), 'the claude row KEEPS Bash: its ✗ is refused');
  const A = (pick) => toolAllowlistArgs({ backend: 'claude', pick });
  ok(same(A({ allow: ['Edit', 'Read'], deny: ['WebFetch'] }).args, ['--allowedTools', 'Read,Edit', '--disallowedTools', 'WebFetch']), 'claude: one comma list per flag, in the row\'s order');
  const bash = A({ deny: ['Bash'] });
  ok(bash.args.length === 0 && bash.dropped.includes('Bash') && bash.dirty === false && bash.pick === null, 'a ✗ Bash NEVER reaches argv — deny beats allow, it would block the Bash(vibespace-…:*) allow rules the reporting CLIs ride (named in `dropped`)');
  ok(same(A({ allow: ['Bash'] }).args, ['--allowedTools', 'Bash']), 'a ✓ Bash is passed (it narrows nothing)');
  const forged = A({ allow: ['Read', 'Bash(rm:*)', '--dangerously-skip-permissions'], deny: ['Read', 'Write'] });
  ok(same(forged.allow, ['Read']) && same(forged.deny, ['Write']) && forged.dropped.includes('Bash(rm:*)') && forged.dropped.includes('--dangerously-skip-permissions') && forged.dropped.includes('Read'),
    'outside the closed list ⇒ DROPPED (never a flag, never a rule pattern on argv); a tool both ✓ and ✗ stays ✓');
  const C = (pick) => toolAllowlistArgs({ backend: 'codex', pick });
  ok(same(C({ sandbox: 'read-only', approval: 'never' }).args, ['--ask-for-approval', 'never', '--sandbox', 'read-only']) && same(C({ sandbox: 'nope', approval: '' }).dropped, ['nope']) && C({}).dirty === false,
    'codex: the closed words only (an empty half is no pick)');
  ok(toolAllowlistArgs({ backend: 'shell', pick: { allow: ['Read'] } }).args.length === 0 && toolAllowlistArgs({ backend: 'shell', pick: { allow: ['Read'] } }).dropped[0] === 'unsupported', 'a harness without the row: nothing, said `unsupported`');
  ok(clientToolArgs === toolAllowlistArgs, 'the form\'s command-line preview IS the function the spawn runs (re-exported through agent-meta)');
  // the claude adapter's spelling — chat AND terminal; the flags sit before every later flag (a dash ends the variadic list)
  const claude = registry.get('claude');
  for (const mode of ['chat', 'terminal']) {
    const a = claude.buildSessionArgs({ cwd: '/tmp', mode, permissionMode: 'bypassPermissions', effort: 'high', settings: {}, tools: { allow: ['Read'], deny: ['WebFetch', 'Bash'] } }).args;
    const i = a.indexOf('--allowedTools'), j = a.indexOf('--disallowedTools');
    ok(i > a.indexOf('--permission-mode') && a[i + 1] === 'Read' && j === i + 2 && a[j + 1] === 'WebFetch' && a.indexOf('--effort') === j + 2, `claude ${mode}: --allowedTools Read --disallowedTools WebFetch, right after the mode and before --effort (the ✗ Bash dropped)`, a.join(' '));
  }
  ok(!claude.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: 'default', settings: {} }).args.some((x) => /Tools$/.test(x)), 'claude: no pick ⇒ neither flag (the harness\'s own settings stand)');
  const allowRules = (() => { const s = claude.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: 'default', settings: {}, tools: { deny: ['Bash', 'WebFetch'] } }).args; const k = s.indexOf('--settings'); try { return JSON.parse(s[k + 1]).permissions.allow; } catch { return []; } })();
  ok(allowRules.some((r) => /^Bash\(vibespace-/.test(r)), 'with a ✗ attempted on Bash the spawn still carries the Bash(vibespace-…) allow rules');
  // the codex adapter: terminal argv, chat env (the wrapper's withToolsPick), the degraded machine keeps its forced sandbox
  const codex = registry.get('codex');
  const ct = codex.buildSessionArgs({ cwd: '/tmp', mode: 'terminal', permissionMode: 'safe-yolo', settings: {}, tools: { sandbox: 'read-only' } });
  ok(ct.args[ct.args.indexOf('--sandbox') + 1] === 'read-only' && ct.args[ct.args.indexOf('--ask-for-approval') + 1] === 'on-failure', 'codex terminal: the sandbox pick replaces the mode\'s, the approval half stays the mode\'s', ct.args.join(' '));
  const cc = codex.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: '', settings: {}, tools: { approval: 'never' } });
  ok(cc.env.CODEX_WEBUI_APPROVAL_POLICY === 'never' && cc.env.CODEX_WEBUI_SANDBOX === 'workspace-write' && same(JSON.parse(cc.env.CODEX_WEBUI_TOOLS_PICK || 'null'), { approval: 'never' }), 'codex chat: the pick rides CODEX_WEBUI_TOOLS_PICK (one JSON row) beside the resolved policy');
  ok(codex.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: '', settings: {} }).env.CODEX_WEBUI_TOOLS_PICK === '', 'codex chat: no pick ⇒ the env is empty (the wrapper keeps the mode\'s own answer)');
  const { CodexAdapter } = require(path.join(REPO, 'src/adapters/codex.js'));
  const degraded = new CodexAdapter({ codexCmd: 'codex', codexSandboxSupported: false, ptyWrapper: '/w/pty', chatWrapper: '/w/codex' }).buildSessionArgs({ cwd: '/tmp', mode: 'terminal', permissionMode: '', settings: {}, tools: { sandbox: 'read-only', approval: 'never' } });
  ok(degraded.args[degraded.args.indexOf('--sandbox') + 1] === 'danger-full-access' && degraded.args[degraded.args.indexOf('--ask-for-approval') + 1] === 'never', 'a machine without codex-linux-sandbox keeps its forced danger-full-access (a sandbox pick there would promise what it cannot enforce); the approval half still applies');
  const wrap = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
  ok(/let currentPermission = withToolsPick\(resolvePermissionMode\(permissionMode\), process\.env\.CODEX_WEBUI_TOOLS_PICK \|\| ''\);/.test(wrap)
    && /const PICK_APPROVALS = \['untrusted', 'on-request', 'on-failure', 'never'\];/.test(wrap) && same(capsOf('codex').toolAllowlist.approval, ['untrusted', 'on-request', 'on-failure', 'never']),
    'the codex chat wrapper applies the pick at start, re-checked against the row\'s own approval words');
  // the form's preset mirror = what the adapter really resolves for every mode the dialog offers
  for (const mode of ['', 'read-only', 'safe-yolo', 'yolo']) {
    const p = codex.buildSessionArgs({ cwd: '/tmp', mode: 'terminal', permissionMode: mode, settings: {} }).permission;
    ok(same(NSM.codexPreset(mode), { sandbox: p.sandbox, approval: p.approvalPolicy }), `the form's codex default for mode «${mode || 'default'}» is resolveCodexPermissionMode's (${p.sandbox} · ${p.approvalPolicy})`);
  }
  // the client row gates on the CAPS ROW, never an id
  const formSrc = fs.readFileSync(path.join(REPO, 'src/lib/new-session-form.js'), 'utf8');
  ok(/const row = terminalOnly\(be\) \? null : toolAllowlistFor\(be\);/.test(formSrc) && !/backend === 'claude'|be === 'claude'|be === 'codex'/.test(formSrc), 'the 可用工具 row exists exactly when toolAllowlistFor(backend) answers a row (no backend-id branch)');
}

const wsCreateSrc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');

// ── THE PICK vs THE LIVE FACT (round-2 verifier, MAJOR + the untick it exposed)
// Two different things, and every surface that asks "would the NEXT run of this
// conversation be isolated?" must answer with ONE function.
{
  const pick = (saved, live) => worktreePick({ saved, live });
  ok(pick(true, false) === true && pick(true, true) === true, 'worktreePick: an explicit tick wins, whatever this run turned out to be');
  ok(pick(false, true) === false && pick(false, false) === false,
    'worktreePick: an explicit UNTICK is a DECISION — a live isolated run never resurrects it (the accept-and-ignore the truthy-only key used to produce)');
  ok(pick(undefined, true) === true && pick(undefined, false) === false,
    'worktreePick: no pick on record ⇒ this RUN answers (the normal state right after a New Session tick — the conversation has no id yet)');
  // NEGATIVE CONTROL: the rule is not "any falsy saved value defers to live" —
  // that is precisely the shape that made the untick unrepresentable.
  ok(pick(false, true) !== pick(undefined, true),
    'NEGATIVE CONTROL: `false` and `undefined` are DIFFERENT answers under the same live fact (a truthy test collapses them and the untick disappears)');
  ok(worktreeLatchWrite({ saved: undefined, live: true }) === true, 'worktreeLatchWrite: an ABSENT pick records what this run turned out to be');
  ok(worktreeLatchWrite({ saved: undefined, live: false }) === null
    && worktreeLatchWrite({ saved: true, live: false }) === null
    && worktreeLatchWrite({ saved: true, live: true }) === null,
    'worktreeLatchWrite: ONE-WAY — it never writes OFF, and never rewrites a pick that already exists');
  ok(worktreeLatchWrite({ saved: false, live: true }) === null,
    'NEGATIVE CONTROL: an explicit `false` is never overruled by a live isolated run (a fact we were wrong about is not a preference the user changed — and neither is one they revoked)');
  ok(clientWorktreePick === worktreePick && clientWorktreeLatchWrite === worktreeLatchWrite,
    'the CLIENT surfaces import the SAME function objects through agent-meta (no paraphrase — the fork lost the pick entirely by having none)');
}

// ── WIRING: who actually PRODUCES each branch of worktreeSpawnArgs ──────────
{
  const propsSrc2 = fs.readFileSync(path.join(REPO, 'src/lib/session-props.js'), 'utf8');
  const lifeSrc2 = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  const viewSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  ok(/cb\.checked = worktreePick\(\{ saved: cfg\.worktree, live \}\);/.test(propsSrc2)
    && /worktree: cb\.checked \}\)/.test(propsSrc2) && !/worktree: cb\.checked \|\| undefined/.test(propsSrc2),
    'WIRING: the Session Properties checkbox READS worktreePick and WRITES a boolean (so unticking sticks)');
  // The fork call site — the round-2 MAJOR. `fork ⇒ pass` had no producer at
  // all: `_doForkSession`'s createSession carried no `worktree` key, so the
  // branch was pinned by a call no site could make.
  const forkBlock = lifeSrc2.slice(lifeSrc2.indexOf('async _doForkSession('), lifeSrc2.indexOf('// Open a stopped session as view-only'));
  ok(forkBlock.length > 200 && /worktreePick\(\{ saved: forkCfg\.worktree, live: sessionInfo\.worktree \}\)/.test(forkBlock)
    && /worktree: forkWorktree \|\| undefined,/.test(forkBlock),
    'WIRING: _doForkSession RESOLVES the pick and passes it on the create (a fork is the other spawn that emits --worktree)');
  ok(/const wtWillPass = worktreeSpawnArgs\(\{/.test(wsCreateSrc) && /if \(wtWillPass\) \{/.test(wsCreateSrc)
    && /resume: !!\(data\.resume && data\.resumeId\)/.test(wsCreateSrc) && /fork: !!data\.fork/.test(wsCreateSrc),
    'WIRING: the ws-create repo preflight gates on the EMITTED decision, not on the tick (a resume never sends the flag)');
  // BOTH entry points reach the one latch, and BOTH bodies are prototype
  // methods — scripts/test-worktree-userchan-ui.mjs drives them for real. The
  // ws branch is now a one-line delegation precisely because a body that lives
  // only inside the live-view constructor closure can be pinned by grep and by
  // nothing else (which is how the pre-fix dead write stayed green).
  ok(/msg\.type === 'worktree-path'[\s\S]{0,2000}this\._onWorktreePath\(msg\);/.test(viewSrc)
    && /_onWorktreePath\(msg\) \{[\s\S]{0,240}this\._latchWorktreePick\(\);/.test(viewSrc)
    && /if \('worktree' in meta\) \{[\s\S]{0,80}this\._latchWorktreePick\(\);/.test(viewSrc)
    && /worktreeLatchWrite\(\{ saved: cfg\.worktree, live: this\._worktree \}\) === true/.test(viewSrc),
    'WIRING: BOTH chat-view entry points run the one latch, and both bodies are drivable prototype methods (the worktree-path branch used to write a field nobody read)');
  // The swap bookkeeping (round-2 verifier, MAJOR): five sites, one helper (the
  // 4th since 2.369.118: a live Workflow card re-rendered on its taskInfo edit; the 5th
  // since 2.369.209: a pending Bash call re-drawn as its machine card on the live exitCard edit).
  ok((viewSrc.match(/this\._swapMessageEl\(/g) || []).length === 5
    && /_swapMessageEl\(oldEl, newEl, id\) \{/.test(viewSrc)
    && !/if \(next\) el\.replaceWith\(next\);/.test(viewSrc),
    'WIRING: every in-place message re-render goes through _swapMessageEl (the tool-card swap was a bare replaceWith)');
}

// ── THE PREFLIGHT, DRIVEN THROUGH THE REAL ws-create HANDLER ────────────────
// Not a grep: the handler is constructed with stub deps and a `buildSessionArgs`
// that THROWS a sentinel, so execution stops exactly where the spawn would
// start — every refusal above it is real, and nothing is ever spawned.
{
  const SENTINEL = Symbol('spawn');
  const drive = async (mod, data) => {
    const sent = [], built = [];
    const adapter = { installed: true, buildSessionArgs(o) { built.push(o); const e = new Error('probe'); e[SENTINEL] = true; throw e; } };
    const handler = mod.createWsCreateHandler({
      ctx: {
        activeSessions: new Map(), WS_OPEN: 1, adapterRegistry: { get: () => adapter },
        sessionCounterRef: { value: 0 }, hosts: null, accounts: null, os, fs, path,
        serverSetting: () => '', SOCKETS_DIR: scratch('wtprobe-sockets'), BUFFERS_DIR: scratch('wtprobe-buffers'),
        broadcastActiveSessions() { }, broadcastToSession() { },
      },
      agentEnv: () => ({}), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
      execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
      getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
    });
    try { await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, data, new Set()); }
    catch (e) { if (!e[SENTINEL]) throw e; }
    return { codes: sent.map((m) => m.code || m.type), built };
  };
  const NOREPO = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-notarepo-'));
  const RID = '11111111-2222-3333-4444-555555555555';
  const base = { backend: 'claude', mode: 'chat', cwd: NOREPO, worktree: true, reqId: 'r' };
  const wsCreate = require(path.join(REPO, 'src/ws-create.js'));

  const newSess = await drive(wsCreate, { ...base });
  ok(newSess.codes.join() === 'worktree-not-a-git-repo' && newSess.built.length === 0,
    'PREFLIGHT: a NEW session in a non-repo is refused BEFORE the spawn (the instantly-dead window this exists to prevent)', JSON.stringify(newSess.codes));
  const resumed = await drive(wsCreate, { ...base, resume: true, resumeId: RID, ignoreNoConvo: true });
  ok(resumed.codes.length === 0 && resumed.built.length === 1 && resumed.built[0].worktree === true && resumed.built[0].fork === false,
    'PREFLIGHT: a plain RESUME of the same conversation in the same non-repo folder is NOT refused — the spawn would not send the flag at all (round-2 verifier)', JSON.stringify(resumed.codes));
  ok(worktreeSpawnArgs({ backend: 'claude', want: true, resume: true, fork: false }).args.length === 0,
    '…and the adapter proves it: the same options emit no --worktree (the refusal would have been for a flag nobody sends)');
  const forked = await drive(wsCreate, { ...base, resume: true, fork: true, resumeId: RID, ignoreNoConvo: true });
  ok(forked.codes.join() === 'worktree-not-a-git-repo' && forked.built.length === 0,
    'NEGATIVE CONTROL: a FORK in that same non-repo IS still refused — it really does emit --worktree, so the gate is the decision and not a blanket skip', JSON.stringify(forked.codes));
  const codexResume = await drive(wsCreate, { ...base, backend: 'codex', resume: true, resumeId: 'th_x', ignoreNoConvo: true });
  ok(codexResume.codes.join() === 'worktree-unsupported' && codexResume.built.length === 0,
    'NEGATIVE CONTROL: `unsupported` stays UNCONDITIONAL — a harness with no such flag refuses on a resume too (accept-and-ignore is the 2.361.4 failure)', JSON.stringify(codexResume.codes));

  // MUTATION CONTROL: the pre-fix gate, reproduced from the product source. The
  // copy's `require` is re-bound to the real path (MUTH), so its relative
  // requires resolve exactly as the original's.
  const mutSrc = wsCreateSrc.replace('if (wtWillPass) {', 'if (data.worktree) {');
  ok(mutSrc !== wsCreateSrc, 'MUTATION CONTROL: the gate is one identifiable line');
  const mutPath = MUTH.write('src/ws-create.js', mutSrc, 'negctl');
  try {
    const mutResume = await drive(require(mutPath), { ...base, resume: true, resumeId: RID, ignoreNoConvo: true });
    ok(mutResume.codes.join() === 'worktree-not-a-git-repo' && mutResume.built.length === 0,
      '…and with it the RESUME is refused again — the pre-fix behaviour, reproduced from the product source (so the leg above measures the fix)', JSON.stringify(mutResume.codes));
  } finally { /* MUTH's scratch dir is removed at exit */ }
  try { fs.rmSync(NOREPO, { recursive: true, force: true }); } catch { }
}


// ── AUTO-RESUME CONFORMANCE (owner ruling 2026-09-08: "auto resume 应该是通用的,
// 只要支持 hook/注入的 harness 都支持, 形式可以不一样") ──────────────────────
// The feature is VibeSpace's own and harness-neutral; only TWO facts differ per
// harness and both are on the descriptor — quota.signalFromStream (how a LIMIT
// shows up) and resume {form, deliver} (how a TURN is restarted). So every
// registered harness gets the SAME conformance run: the caps row is re-derived
// from the descriptor in both directions, a harness that can be continued
// proves it CAN be (arm → fire, delivered through its OWN verb into a stub of
// its own channel), and a harness that cannot is never armed and never offered.
console.log('— auto-resume conformance (owner ruling 2026-09-08)');
{
  const { deriveAutoResume, AUTO_RESUME_FORMS, NO_AUTO_RESUME } = require(path.join(REPO, 'src/backend-caps.js'));
  const reg = require(path.join(REPO, 'src/harnesses'));
  const { NULL_QUOTA } = require(path.join(REPO, 'src/harnesses/null-quota.js'));
  const arMod = require(path.join(REPO, 'src/server/auto-resume.js'));

  // (a) THE ROW IS DERIVED, NOT DECLARED — recompute it from the descriptor and
  // compare, so a hand-edited caps literal (or a stale placeholder the registry
  // failed to overwrite) is red rather than a silent capability claim.
  for (const id of reg.ids()) {
    const h = reg.get(id);
    const want = deriveAutoResume({
      hasLimitSignal: !!h.quota && h.quota !== NULL_QUOTA && h.quota.signalFromStream !== NULL_QUOTA.signalFromStream,
      resumeForm: h.resume ? h.resume.form : null,
    });
    ok(JSON.stringify(capsOf(id).autoResume) === JSON.stringify(want),
      `${id}: caps.autoResume is DERIVED from the descriptor (${JSON.stringify(want)})`, JSON.stringify(capsOf(id).autoResume));
    ok(want.resume === null || AUTO_RESUME_FORMS.includes(want.resume), `${id}: its resume form is in the closed set`);
    ok(want.supported === (want.signal && want.resume !== null), `${id}: 'supported' is exactly signal AND a verb — never hand-set`);
  }
  ok(JSON.stringify(capsOf('gemini').autoResume) === JSON.stringify(NO_AUTO_RESUME), 'an UNREGISTERED backend answers the honest nothing (no fallthrough to claude)');
  // the four measured rows, named, so a silent flip is visible in the diff
  ok(capsOf('claude').autoResume.resume === 'message' && capsOf('codex').autoResume.resume === 'turn-start'
    && capsOf('opencode').autoResume.resume === 'prompt' && capsOf('shell').autoResume.resume === null,
    'the four harnesses each declare their OWN verb form (message / turn-start / prompt / none)');
  ok(capsOf('opencode').autoResume.supported === false && capsOf('opencode').autoResume.resume === 'prompt',
    'opencode CAN be continued but has no limit signal (ACP v1 exposes no subscription window) ⇒ not offered, honestly');

  // (b) A DECLARED VERB REALLY WORKS: arm → fire, delivered through the
  // harness's OWN deliver() into a stub of its OWN channel. Driven through the
  // real module (its breaker, its gate, its persistence), never a paraphrase.
  const mkAr = (backend, extra = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-arconf-'));
    const sent = [];
    const sessions = new Map();
    const ar = arMod.create({
      dataDir: dir, activeSessions: sessions, serverSetting: () => true, log: () => { },
      // THE STUB CHANNEL: whatever the harness's verb decides to do, it reaches
      // the wire through exactly this one ORCH function (claude's chat stdin,
      // the codex wrapper's rpc lane, the ACP wrapper's prompt) — so a verb
      // that forgot to use it, or used something else, cannot pass.
      sendToSession: (id, s, text) => { sent.push({ id, text, backend: s.backend }); return true; },
      ...extra,
    });
    const s = { mode: 'chat', backend, pty: {}, _isStreaming: false, _autoResume: true };
    sessions.set('s1', s);
    return { ar, s, sent, dir, sessions };
  };
  for (const id of reg.ids()) {
    const verb = reg.resumeVerb(id);
    const w = mkAr(id);
    const rec = w.ar.armIfEnabled('s1', w.s, Date.now() + 60000, 'usage limit', { lane: null, bucket: 'fiveHour' });
    if (!verb) {
      ok(rec === null && w.ar.statusFor('s1').armed === false, `${id}: declares NO resume verb ⇒ never armed (a promise nobody can keep is not made)`);
      ok(w.ar.tick(Date.now() + 3600e3) === 0 && w.sent.length === 0, `${id}: …and nothing is ever fired at it`);
      ok(w.ar.statusFor('s1').resume === null, `${id}: …and the status says so, so no surface offers the toggle`);
    } else {
      ok(!!rec, `${id}: declares the '${verb.form}' verb ⇒ the wait is armed`);
      const fired = w.ar.tick(Date.now() + 60000 + 60000);
      ok(fired === 1 && w.sent.length === 1 && w.sent[0].text === arMod.CONTINUE_PROMPT && w.sent[0].backend === id,
        `${id}: …and the continue is DELIVERED through its own '${verb.form}' verb into that harness's channel`, JSON.stringify(w.sent));
      ok(w.ar.statusFor('s1').armed === false, `${id}: …exactly once (the wait is spent)`);
      ok(w.ar.statusFor('s1').resume === verb.form, `${id}: …and the status names the form the surfaces gate on`);
    }
    try { fs.rmSync(w.dir, { recursive: true, force: true }); } catch { }
  }

  // (c) A VERB THAT REFUSES IS NOT A DELIVERY. The fire path must believe the
  // harness, not its own optimism: a deliver() that returns false leaves the
  // wait armed for the next tick rather than reporting a continue nobody sent.
  {
    const w = mkAr('claude', { sendToSession: () => false });
    w.ar.armIfEnabled('s1', w.s, Date.now() + 1000, 'usage limit', { bucket: 'fiveHour' });
    ok(w.ar.tick(Date.now() + 60000) === 0 && w.ar.statusFor('s1').armed === true, 'a verb that could not deliver leaves the promise standing (never a phantom continue)');
    try { fs.rmSync(w.dir, { recursive: true, force: true }); } catch { }
  }

  // (d) NO SURFACE MAY BRANCH ON A BACKEND ID around auto-resume. The census is
  // derived from the source, not from a list somebody remembered to update, and
  // it is proven on a PLANTED gate before it is trusted to report a clean tree.
  {
    // THE FILE SET IS DERIVED, NOT ENUMERATED (the cli-identity r7 law: a
    // standing sweep is worth exactly the set it walked, and a hand-written
    // list only ever polices the files its author already read — it missed 47
    // real ones there). Every .js/.mjs under src/, server.js and data/bin/ that
    // MENTIONS auto-resume is censused; the set is printed so the scope is
    // visible, and it is pinned to still cover the four sites that carry the
    // decision.
    const MARK = /autoResume|auto-resume|armIfEnabled|noteQuotaReading|windowOpened|resumeVerb|autoResumeCapsFor/;
    const ID_GATE = /backend\s*[!=]==\s*'(?:codex|claude|opencode|antigravity|shell)'/;
    const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(f)) walk(f, out); } else if (/\.(js|mjs)$/.test(e.name)) out.push(f); } return out; };
    // BUILD OUTPUTS ARE NOT SOURCES: data/bin/vibespace-agentd*.js is esbuild's
    // bundle of the very src/ files censused below (gitignored since 2.369.75),
    // so censusing it would police the same code twice and make the verdict
    // depend on whether this tree has been built.
    const GENERATED = /^data\/bin\/vibespace-agentd(-attach)?\.js$/;
    const allFiles = [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js'), ...walk(path.join(REPO, 'data/bin'))];
    const SITES = allFiles.map((f) => path.relative(REPO, f)).filter((f) => !GENERATED.test(f) && MARK.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
    // A gate that is NEAR an auto-resume mention but is not ABOUT it needs a
    // reason, and a reason that stops matching is itself a failure (the dead
    // allowlist rule from test-architecture).
    // (2026-09-20: the one allowed entry — session-lifecycle's `backend === 'claude'`
    // tuiRenderer read beside the autoResume field — is GONE: the instance default
    // now rides the server's harnessSpawnSettings bag, so the list is empty.)
    const ALLOW = [];
    const offenders = [], allowHit = new Set();
    for (const f of SITES) {
      const txt = fs.readFileSync(path.join(REPO, f), 'utf8');
      for (const m of txt.matchAll(new RegExp(MARK.source, 'g'))) {
        const win = txt.slice(Math.max(0, m.index - 600), m.index + 600);
        const g = ID_GATE.exec(win);
        if (!g) continue;
        const a = ALLOW.find((x) => x.file === f && x.gate === g[0]);
        if (a) { allowHit.add(a.why); continue; }
        offenders.push(`${f} :: ${g[0]}`);
      }
    }
    console.log(`  · census scope: ${SITES.length} files mention auto-resume (${SITES.slice(0, 6).join(', ')}${SITES.length > 6 ? ', …' : ''})`);
    ok(offenders.length === 0, 'CENSUS: no auto-resume site gates on a backend id (every one reads the caps row / the descriptor)', [...new Set(offenders)].join(' ; '));
    for (const f of ['src/server/auto-resume.js', 'src/server/usage-pool-engine.js', 'src/lib/chat-status-bar.js', 'src/auto-resume-signal.js'])
      ok(SITES.includes(f), `CENSUS scope covers ${f} (a sweep that can miss the deciding file is not a sweep)`);
    ok(SITES.length >= 10, `CENSUS scope is non-vacuous (${SITES.length} files)`);
    for (const a of ALLOW) ok(allowHit.has(a.why), `CENSUS allowlist entry still matches something (dead reason = red): ${a.file} — ${a.why}`);
    ok(ID_GATE.test("if (session.backend === 'codex') return null;"), '…and the census can go red (proven on a planted gate, never a check that only ever passes)');
    // WIRING PINS (2.355.0 law: a fix nobody calls is not a fix). Each names the
    // ONE reader, so a surface that grows a private copy of the question — or
    // reads the row back as a boolean, which it was until this release — is red.
    const sb = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
    ok(/autoResumeCapsFor\(this\._backend\)\.supported/.test(sb), 'WIRING: the status-bar chip is drawn from the DERIVED caps row, through the shared reader');
    const arSrc = fs.readFileSync(path.join(REPO, 'src/server/auto-resume.js'), 'utf8');
    ok(/if \(!verbFor\(session\)\) \{ log\(/.test(arSrc), 'WIRING: armIfEnabled refuses a harness with no resume verb (never a promise nobody can keep)');
    ok(/const verb = verbFor\(session\);[\s\S]{0,1200}verb\.deliver\(session, CONTINUE_PROMPT, \{ sendChatInput/.test(arSrc), 'WIRING: the ONE fire choke point runs the DESCRIPTOR\'s verb, handing it the ORCH channel');
    ok((arSrc.match(/verb\.deliver\(/g) || []).length === 1, 'WIRING: …and there is exactly ONE of them (a second fire path is how the loop breaker — and the spend authorizer — get bypassed)');
    const engSrc2 = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
    ok((engSrc2.match(/noteQuotaReadingForResume\(/g) || []).length === 3, 'WIRING: ONE shared reading edge with exactly its two producers (claude + codex), never a per-harness answer', String((engSrc2.match(/noteQuotaReadingForResume\(/g) || []).length));
  }
}


// ── store: EVERY declared store field has a reader; a fake harness drives the
// resume hooks through the generic code (dc-harness-store, 2.369.213) ──
// The census is DERIVED from the descriptors (every key any harness's `store`
// declares) and the code outside src/harnesses (tracked + untracked, comments
// stripped): a field nobody reads is RED — the S3 fields forkAncestry /
// conversationIdField / transcriptDirs / locateTranscript / Reader /
// listThreads were declared with zero production readers for months.
console.log('\nstore: every declared field is read outside src/harnesses; a fake harness rides the generic resume hooks');
{
  const { execFileSync } = require('node:child_process');
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', 'src', 'server.js', 'data/bin'], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter((f) => f && !f.startsWith('src/harnesses/') && /(\.c?js|\.mjs|^server\.js|^data\/bin\/[^.]+)$/.test(f));
  const code = files.map((f) => { let t = ''; try { t = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { }
    return [f, t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')]; });
  const fields = new Set(); for (const h of Object.values(HARNESSES)) for (const k of Object.keys(h.store || {})) fields.add(k);
  ok(fields.size >= 10, `store census covers every declared field (${fields.size})`);
  for (const k of [...fields].sort()) {
    const re = new RegExp(`\\.${k}\\b|\\[['"]${k}['"]\\]`);
    const readers = code.filter(([, t]) => re.test(t)).map(([f]) => f);
    ok(readers.length > 0, `store.${k}: read outside src/harnesses (${readers.slice(0, 3).join(', ') || 'NONE — wire a consumer or delete the field'})`);
  }
  for (const k of ['forkAncestry', 'conversationIdField', 'transcriptDirs', 'locateTranscript', 'Reader', 'listThreads']) ok(!fields.has(k), `store.${k} stays deleted (declared, never read)`);

  // THE FAKE HARNESS: its own store hooks, registered through the one line; the
  // generic resume code (src/resume-store.js → writer-sweep.js sweepWriters)
  // reaches them with no id branch anywhere.
  const harnesses = require(path.join(REPO, 'src/harnesses/index.js'));
  const { writerSweepOpts, forkChainEnv, hasWriterSweep } = require(path.join(REPO, 'src/resume-store.js'));
  const { sweepWriters } = require(path.join(REPO, 'src/writer-sweep.js'));
  const calls = [];
  const acmeSweep = (rid, shq, o) => { calls.push({ rid, protectSids: o.protectSids }); return `echo SWEPT:4242 # ${shq(rid)}`; };
  harnesses.register({ id: 'acme-store', label: 'Acme', quota: harnesses.NULL_QUOTA,
    store: { writerSweep: acmeSweep, forkChain: (id) => (id === 'r2' ? ['r0', 'r1'] : []), forkChainEnv: 'ACME_FORKED_FROM', locate: (id) => `/acme/${id}.log` } }, { replace: true });
  try {
    const live = new Map([['s-acme', { backend: 'acme-store', host: null }], ['s-acme-remote', { backend: 'acme-store', host: 'h1' }], ['s-claude', { backend: 'claude', host: null }]]);
    const so = writerSweepOpts('acme-store', live, null);
    ok(hasWriterSweep('acme-store') && so.sweep === acmeSweep && JSON.stringify(so.protectSids) === '["s-acme"]',
      'fake harness: writerSweepOpts hands ITS store.writerSweep + the protect list of ITS live sessions on the TARGET machine', JSON.stringify(so.protectSids));
    const ran = [];
    const hosts = { deviceBounded: async () => ({ runCmd: async (cmd, args) => { ran.push(args[1]); return { stdout: 'SWEPT:4242\n' }; } }) };
    const r = await sweepWriters(hosts, null, 'rid-acme', { shq: (s) => `'${s}'`, ...so });
    ok(r.swept.join() === '4242' && ran[0] === "echo SWEPT:4242 # 'rid-acme'" && calls[0].rid === 'rid-acme',
      'fake harness: sweepWriters runs the hook\'s script on the device and parses its SWEPT lines', JSON.stringify(r));
    ok(JSON.stringify(forkChainEnv('acme-store', 'r2')) === '{"ACME_FORKED_FROM":"r0,r1,r2"}' && JSON.stringify(forkChainEnv('claude', 'r2')) === '{}',
      'fake harness: forkChainEnv = its chain + the resumed id under ITS declared env name; a harness with no chain gets nothing');
    ok(harnesses.get('acme-store').store.locate('x') === '/acme/x.log' && !hasWriterSweep('shell'), 'fake harness: locate is its own; a harness with no sweep is not gated in');
    // PATCHED-COPY CONTROL: the old id branch back in resume-store ⇒ the fake
    // harness's hook is never reached (this proof measures the generic path).
    const rsSrc = fs.readFileSync(path.join(REPO, 'src/resume-store.js'), 'utf8');
    const mut = rsSrc.replace('const sweep = storeOf(backend).writerSweep;', "const sweep = storeOf(backend === 'codex' ? 'codex' : 'claude').writerSweep;");
    ok(mut !== rsSrc, 'PATCHED-COPY CONTROL: the sweep lookup is one identifiable line');
    const mutSo = require(MUTH.write('src/resume-store.js', mut, 'idbranch')).writerSweepOpts('acme-store', live, null);
    ok(mutSo.sweep !== acmeSweep, '…and with the id branch back the fake harness gets claude\'s legs, not its own — RED for the proof above');
  } finally { harnesses.unregister('acme-store'); }
  // the claude home-rename hook + chat transport args: harness-owned, read generically
  const claude = harnessOf('claude');
  ok(typeof claude.store.homeRename?.staleUsers === 'function' && typeof claude.store.homeRename?.moveUser === 'function' && typeof claude.store.homeRename?.relinkLegacy === 'function',
    'claude: store.homeRename (staleUsers / moveUser / relinkLegacy) is the ONE ~/.claude/projects re-encoding (server.js + boot-restore call it)');
  const reg = createAdapterRegistry({ claudeCmd: 'claude', chatWrapper: '/x', ptyWrapper: '/y', codexCmd: 'codex', acpCommands: {} });
  const ca = reg.get('claude');
  ok(ca && JSON.stringify(ca.chatTransportArgs()) === JSON.stringify([['--output-format', 'stream-json'], ['--input-format', 'stream-json'], ['--verbose'], ['--permission-prompt-tool', 'stdio']]),
    'claude adapter: chatTransportArgs() = the ONE stream-json spelling (data/bin/chat-wrapper.js requires the same module)');
  const wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8'), wrap = fs.readFileSync(path.join(REPO, 'data/bin/chat-wrapper.js'), 'utf8');
  ok(!/'--output-format'/.test(wsc) && !/'--output-format'/.test(wrap) && /claude-transport\.js/.test(wrap), 'the stream-json flags are spelled in neither ws-create nor chat-wrapper');
}

// ── THE LONG TAIL'S DECLARED ROWS (lane dc-harness-tail, 2026-10-05) ──
// terminalOnly / oauthUsage / globalUsageKey replaced 21 `=== 'shell'` / `=== 'claude'` / `=== 'codex'` spellings in the
// window reach, the browser pickers, the New Session path, the usage ledger and the account roster. Conformance: every
// descriptor re-derives its row (a row missing or drifted ⇒ red). Proof: a FAKE harness added through register() alone
// drives the real consumers; two patched copies with the old branch restored cannot tell the fake apart.
console.log('\n— the long tail\'s declared rows (terminalOnly / oauthUsage / globalUsageKey)');
{
  const ROWS = ['terminalOnly', 'oauthUsage', 'globalUsageKey'];
  for (const id of Object.keys(BACKEND_CAPS)) ok(ROWS.every((r) => r in BACKEND_CAPS[id]), `${id}: the shipped caps row declares ${ROWS.join(' / ')}`);
  for (const id of harnessIds()) {
    const h = harnessOf(id), c = capsOf(id), b = h.ui?.billing || null;
    ok(c.terminalOnly === (h.kind === 'terminal'), `${id}: caps.terminalOnly === (kind === 'terminal') (${c.terminalOnly})`);
    ok(c.globalUsageKey === (b ? b.globalUsageKey : null), `${id}: caps.globalUsageKey is the descriptor's ui.billing.globalUsageKey (${c.globalUsageKey})`);
    ok(c.oauthUsage === (!!b && b.usage === 'accounts' && !!h.creds), `${id}: caps.oauthUsage === (its named accounts' quota lands in the 'accounts' usage map) (${c.oauthUsage})`);
  }
  const { globalUsageKeyOf, oauthUsageAccount } = require(path.join(REPO, 'src/backend-caps.js'));
  const { terminalOnly } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  ok(Object.keys(BACKEND_META).every((id) => terminalOnly(id) === capsOf(id).terminalOnly) && terminalOnly(undefined) === false && terminalOnly('nope') === false,
    'client terminalOnly() reads the SAME caps row (every META id; absent = claude = false; unknown = false)');
  ok(globalUsageKeyOf(undefined) === '__global__' && globalUsageKeyOf('codex') === '__global_codex__' && globalUsageKeyOf('opencode') === '__global__' && globalUsageKeyOf('nope') === '__global__',
    'globalUsageKeyOf: legacy / claude / codex / opencode / unknown answer what the old ternary did');
  ok(oauthUsageAccount({ type: 'subscription' }) && oauthUsageAccount({ type: 'subscription', backend: 'claude' }) && !oauthUsageAccount({ type: 'subscription', backend: 'codex' }) && !oauthUsageAccount({ type: 'api', backend: 'claude' }) && !oauthUsageAccount(null),
    'oauthUsageAccount: a legacy / claude subscription yes; codex, an API key, nothing — no');

  // THE PROOF: two fakes through register() alone (zero consumer edits)
  const H = require(path.join(REPO, 'src/harnesses/index.js'));
  H.register({ id: 'acme-term', label: 'Acme Term', kind: 'terminal', quota: H.NULL_QUOTA });
  H.register({ id: 'acme-chat', label: 'Acme', kind: 'chat', quota: H.NULL_QUOTA, ui: { billing: { globalUsageKey: '__global_acme__', usage: 'accounts' } }, caps: { oauthUsage: true } });
  try {
    const WR = require(path.join(REPO, 'src/window-reach.js'));
    const sessions = [{ id: 'sess-acme-term-1', backend: 'acme-term', name: 'acme' }, { id: 'sess-claude-1', backend: 'claude', name: 'cl' }];
    const seen = (M) => JSON.stringify(M.pickerModel({ sessions }));
    const real = seen(WR);
    ok(!real.includes('sess-acme-term-1') && real.includes('sess-claude-1'), 'PROOF: window reach drops a register()ed TERMINAL harness\'s session (its kind alone) and keeps a chat one', real.slice(0, 300));
    const UIM = require(path.join(REPO, 'src/usage-index-model.js'));
    ok(UIM.keysOf({ be: 'acme-chat' }).account === '__global_acme__' && UIM.keysOf({ be: 'codex' }).account === '__global_codex__' && UIM.keysOf({}).account === '__global__',
      'PROOF: the usage index books a register()ed harness\'s machine login under ITS declared key (claude / codex unchanged)');
    ok(oauthUsageAccount({ type: 'subscription', backend: 'acme-chat' }), 'PROOF: a register()ed harness that declares oauthUsage joins the OAuth usage-poll accounts');
    // CONTROLS: the old branch restored in a patched copy cannot see the fakes
    const wrSrc = fs.readFileSync(path.join(REPO, 'src/window-reach.js'), 'utf8');
    const wrMut = wrSrc.split('capsOf(s.backend).terminalOnly').join("s.backend === 'shell'");
    ok(wrMut !== wrSrc && seen(MUTH.load('src/window-reach.js', wrMut, 'tail-shell')).includes('sess-acme-term-1'),
      'CONTROL: window-reach with `s.backend === \'shell\'` restored offers the fake terminal session (the declared row is what drops it)');
    const uimSrc = fs.readFileSync(path.join(REPO, 'src/usage-index-model.js'), 'utf8');
    const uimMut = uimSrc.replace('r.acct || globalUsageKeyOf(r.be)', "r.acct || (r.be === 'codex' ? '__global_codex__' : '__global__')");
    ok(uimMut !== uimSrc && MUTH.load('src/usage-index-model.js', uimMut, 'tail-key').keysOf({ be: 'acme-chat' }).account === '__global__',
      'CONTROL: usage-index-model with the codex ternary restored books the fake under __global__ (the declared key is what routes it)');
  } finally { H.unregister('acme-term'); H.unregister('acme-chat'); }
  ok(!H.has('acme-term') && capsOf('acme-term').terminalOnly === false, 'the fakes are gone after the proof (unregister drops the contributed row)');
}

// ── THE SUBAGENT ROW (lane agy-subagent-cards, 2026-10-21 — the owner: «子代理细节不在你设计的harness框架里吗？») ──
// What a harness can SHOW of the subagents its agent starts is a DECLARED row: the descriptor's ui.subagents ('virtual' a
// live virtual session · 'threads' the sub's own conversation · 'cards' a card from the agent's store opening its timeline ·
// 'none' the row says so), mirrored as caps.subagents, read by both tiers through subagentView. Conformance: every row
// re-derived from its descriptor; a chat descriptor or a caps row WITHOUT it is red; a register()ed harness gets it from
// its descriptor alone.
console.log('\n— the subagent row (ui.subagents ⇄ caps.subagents)');
{
  const { SUBAGENT_VIEWS, subagentView } = require(path.join(REPO, 'src/backend-caps.js'));
  const conforms = (h, row) => !!row && SUBAGENT_VIEWS.includes(row.subagents) && row.subagents === (h.ui?.subagents || 'none') && (h.kind !== 'chat' || !!(h.ui && SUBAGENT_VIEWS.includes(h.ui.subagents)));
  for (const id of Object.keys(BACKEND_CAPS)) ok(SUBAGENT_VIEWS.includes(BACKEND_CAPS[id].subagents), `${id}: the shipped caps row declares subagents (${BACKEND_CAPS[id].subagents})`);
  for (const id of harnessIds()) ok(conforms(harnessOf(id), capsOf(id)), `${id}: caps.subagents is the descriptor's ui.subagents (${capsOf(id).subagents}); a chat harness declares it`, { ui: harnessOf(id).ui?.subagents, caps: capsOf(id).subagents });
  ok(capsOf('antigravity').subagents === 'cards' && capsOf('claude').subagents === 'virtual' && capsOf('codex').subagents === 'threads' && capsOf('opencode').subagents === 'none' && capsOf('shell').subagents === 'none',
    'the shipped values: claude virtual (its sidechain), codex threads (the child thread), antigravity cards (agy\'s store, this lane), opencode / shell none');
  ok(subagentView(undefined) === 'virtual' && subagentView('nope') === 'none' && Object.keys(BACKEND_CAPS).every((id) => subagentView(id) === BACKEND_CAPS[id].subagents), 'subagentView: the row (absent = claude; an unknown harness = none)');
  const agy = harnessOf('antigravity');
  const noUi = { ...agy, ui: { ...agy.ui } }; delete noUi.ui.subagents;
  const noCaps = { ...BACKEND_CAPS.antigravity }; delete noCaps.subagents;
  ok(!conforms(noUi, BACKEND_CAPS.antigravity) && !conforms(agy, noCaps) && !conforms({ ...agy, ui: { ...agy.ui, subagents: 'cards-ish' } }, { ...noCaps, subagents: 'cards-ish' }),
    'RED: a chat descriptor without ui.subagents, a caps row without subagents, an unknown value — each fails the conformance row');
  const H = require(path.join(REPO, 'src/harnesses/index.js'));
  H.register({ id: 'acme-subs', label: 'Acme Subs', kind: 'chat', quota: H.NULL_QUOTA, ui: { subagents: 'cards' } });
  H.register({ id: 'acme-nosubs', label: 'Acme', kind: 'chat', quota: H.NULL_QUOTA });
  try {
    ok(capsOf('acme-subs').subagents === 'cards' && subagentView('acme-subs') === 'cards' && capsOf('acme-nosubs').subagents === 'none',
      'PROOF: a register()ed harness gets its row from its descriptor alone (declared ⇒ that view; none declared ⇒ none, never another harness\'s)');
  } finally { H.unregister('acme-subs'); H.unregister('acme-nosubs'); }
  const { subagentView: clientView } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  ok(Object.keys(BACKEND_META).every((id) => clientView(id) === subagentView(id)), 'the client reads the SAME row (agent-meta subagentView over the bundled backend-caps)');
  const rend = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
  ok(/subagentView\(this\.backend\) === 'none' && isSubagentToolRow\(block, msg\)/.test(rend) && /This harness shows no subagent details/.test(rend), 'a \'none\' harness\'s subagent row SAYS it shows no details (the renderer gates on the row, never the name)');
}

// ── lane artifacts-prompt-hint: THE ARTIFACTS SENTENCE names the descriptor's own file tools ──
// Files written through a shell are not Artifacts (only the harness's own write tools are witnessed), so the tools intro +
// the task context's tools section say so ONCE per session, naming the tools the session's descriptor declares
// (`artifactTools`) — never a spelled harness id; a harness with no `artifactsOf` reader is promised nothing.
console.log('\n— the Artifacts sentence (lane artifacts-prompt-hint)');
{
  const H = require(path.join(REPO, 'src/harnesses/index.js'));
  const AO = require(path.join(REPO, 'src/harnesses/artifacts-of.js'));
  const AR = require(path.join(REPO, 'src/agent-routes.js'));
  const T = { status: true, ask: true, task: true, jobs: true };
  const MARK = 'for files the user should see — they become this conversation\'s Artifacts';
  for (const id of harnessIds()) {
    const h = harnessOf(id);
    const ft = AR.fileToolsOf({ backend: id });
    const line = AO.artifactsIntroLine(ft);
    if (typeof h.artifactsOf === 'function') {
      ok(Array.isArray(h.artifactTools) && h.artifactTools.every((n) => typeof n === 'string' && n) && line.includes(MARK) && Buffer.byteLength(line) <= 300,
        `${id}: declares artifactTools [${(h.artifactTools || []).join(', ')}] → one sentence of ${Buffer.byteLength(line)} B (≤ 300)`);
      ok(h.artifactTools.every((n) => line.includes(n)) && !line.includes(`'${id}'`), `${id}: the sentence names exactly the declared tools, no harness id`);
    } else ok(ft === null && line === '', `${id}: no artifactsOf reader ⇒ no Artifacts sentence (never promise a collection)`);
  }
  // the claude row IS the reader's own table: a record per declared name yields a row (the names cannot drift from what is witnessed)
  const rec = (name) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't-' + name, name, input: { file_path: '/w/a.md', notebook_path: '/w/a.ipynb', content: 'x' } }] } });
  const cl = harnessIds().map(harnessOf).find((h) => h.artifactsOf === AO.claude);
  ok(cl && cl.artifactTools.length === 4 && cl.artifactTools.every((n) => AO.claude(rec(n)).length === 1) && AO.claude(rec('Bash')).length === 0,
    'the declared names are exactly the tools the reader witnesses (each yields a row; Bash yields none)');
  // THE PROOF: a register()ed fake declaring X / Y renders "X / Y" with zero core edits; a fake without a reader renders nothing
  H.register({ id: 'acme-files', label: 'Acme Files', kind: 'chat', quota: H.NULL_QUOTA, artifactsOf: () => [], artifactTools: ['X', 'Y'] });
  H.register({ id: 'acme-noart', label: 'Acme NoArt', kind: 'chat', quota: H.NULL_QUOTA, artifactsOf: null, artifactTools: ['Z'] });
  try {
    const intro = AR.sessionToolsIntro(T, { fileTools: AR.fileToolsOf({ backend: 'acme-files' }) });
    ok(intro.includes('Use your file tools (X / Y) for files') && intro.split(MARK).length === 2, 'PROOF: a register()ed harness declaring X / Y is taught "(X / Y)" — once in the intro');
    const none = AR.sessionToolsIntro(T, { fileTools: AR.fileToolsOf({ backend: 'acme-noart' }) });
    ok(!none.includes(MARK) && !none.includes('(Z)'), 'CONTROL: a register()ed harness with no reader gets no sentence (its declared names are ignored)');
    ok(AR.sessionToolsIntro(T, { fileTools: AR.fileToolsOf({}) }).includes('Use your file tools for files'), 'a session with no backend gets the unnamed sentence (never a guessed harness)');
  } finally { H.unregister('acme-files'); H.unregister('acme-noart'); }
  const fn = AR.fileToolsOf.toString();
  ok(!/['"](?:claude|codex|opencode|antigravity|shell)['"]/.test(fn) && /artifactTools/.test(fn), 'fileToolsOf reads the descriptor and spells no harness id (§46 spirit)');
  // the task context's tools section carries it too, after the absolute-paths line, once (single + multi)
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  const proto = TaskGroupManager.prototype;
  const one = proto._toolsSectionParts.call({}, '', false, null, ['X', 'Y']).join('\n');
  const multi = proto._toolsSectionParts.call({}, '--group <id> ', true, null, ['X', 'Y']).join('\n');
  ok(one.split(MARK).length === 2 && multi.split(MARK).length === 2 && one.indexOf(MARK) > one.indexOf('ABSOLUTE file paths'), 'the task context\'s tools section carries the sentence once, after the absolute-paths line');
  ok(!proto._toolsSectionParts.call({}, '', false, null, null).join('\n').includes(MARK), '…and none for a reader-less harness (fileTools null)');
  // THE ROUTE: a no-task claude-descriptor session gets the sentence ONCE (the tools intro), never in the per-turn reminder
  const { SessionStatusManager } = require(path.join(REPO, 'src/session-status.js'));
  const ROOT = scratch('harness-contract-art');
  fs.mkdirSync(path.join(ROOT, 'st'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'work'), { recursive: true });
  const tasks = new TaskGroupManager({ dataDir: ROOT, onChange: () => { } });
  const sessionStatus = new SessionStatusManager({ dataDir: path.join(ROOT, 'st'), onChange: () => { } });
  const routes = {};
  const backend = harnessIds().find((id) => harnessOf(id) === cl);
  const session = { agentToken: 'vsst_art', backend, cwd: path.join(ROOT, 'work'), name: 'art' };
  AR.setupAgentRoutes({
    app: { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } }, activeSessions: new Map([['sessA', session]]), tasks, sessionStatus, SessionStatusManager,
    userTodos: { rekey: () => { }, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `${s.backend}:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null,
  });
  const call = (r) => { let out; const req = { headers: { authorization: 'Bearer vsst_art' }, query: {}, body: {} }; const res = { json: (o) => { out = o; }, status: () => res }; routes[`GET /api/agent/${r}`](req, res); return (out && out.context) || ''; };
  const start = call('task-context');
  const turns = [call('prompt-context'), call('prompt-context'), call('prompt-context')];
  const all = [start, ...turns].join('\n');
  ok(start.includes('Use your file tools (' + cl.artifactTools.join(' / ') + ') for files') && all.split(MARK).length === 2,
    `the REAL routes: SessionStart's tools intro carries the sentence and a whole session sees it exactly once (${all.split(MARK).length - 1})`);
  ok(turns.filter(Boolean).length >= 1 && turns.every((t) => !t.includes(MARK)), `…and the per-turn reminder never carries it (${turns.filter(Boolean).length} non-empty turn contexts read)`);
}

// ── credential env: ONE derived list, TWO doors (B-6be2, lane jobenv-strip-census, 2.369.270) ──
// A Background Work job inherited codex's CODEX_HOME because src/jobs.js typed its strip by hand
// (ANTHROPIC_API_KEY + CLAUDE_SECURESTORAGE_CONFIG_DIR). src/harness-env.js derives the list from
// the descriptors: the job door strips it whole; the agent door strips every declared name but a
// harness's homeEnvVar (the machine login a no-account spawn rides). Each judge runs on the live
// door AND on the base's shape (the hand list / the drop-less filter), which must be RED.
console.log('\ncredential env: one derived list (src/harness-env.js), two doors');
{
  const HE = require(path.join(REPO, 'src/harness-env.js'));
  const { list: harnessList } = require(path.join(REPO, 'src/harnesses/index.js'));
  const { jobEnv } = require(path.join(REPO, 'src/jobs.js'));
  const { agentEnv } = require(path.join(REPO, 'src/ws-handler.js'));
  const AE = require(path.join(REPO, 'src/agent-env.js'));
  const live = () => harnessList();
  const all = () => HE.credentialEnvNames(live());
  const agentNames = () => HE.agentCredentialEnvNames(live());
  const homes = () => new Set(live().flatMap((d) => HE.declaredEnvOf(d).filter((x) => x.field === 'homeEnvVar').map((x) => x.name)));
  // 1. the descriptor contract: every harness with an account roster says its home and its keys
  for (const id of chatHarnessIds()) {
    const c = HARNESSES[id].creds;
    if (!c) continue;
    // a spawnEnv row's home is HOME itself — everyone's — so it declares no homeEnvVar (THE EVERY-PROCESS CENSUS below)
    ok((typeof c.homeEnvVar === 'string' || (typeof c.spawnEnv === 'function' && c.homeEnvVar === undefined)) && Array.isArray(c.keyEnvVars) && c.keyEnvVars.every((k) => typeof k === 'string'), `${id}: creds declares homeEnvVar + keyEnvVars (${c.homeEnvVar ?? (typeof c.spawnEnv === 'function' ? 'HOME via spawnEnv' : undefined)}; [${(c.keyEnvVars || []).join(', ')}])`);
    const declared = [...new Set(HE.declaredEnvOf(HARNESSES[id]).map((x) => x.name))];
    const missing = declared.filter((n) => !all().includes(n));
    ok(declared.length >= 1 && !missing.length, `${id}: every creds.*EnvVar(s) is in the one list (${declared.join(', ')})`, missing.join(','));
  }
  // THE EVERY-PROCESS CENSUS (lane antigravity-harness): a creds.*EnvVar(s) name joins BOTH strip lists, so a name
  // every process needs there would strip it from every agent and every job — antigravity's HOME root therefore rides
  // creds.spawnEnv, never spawnEnvVar. RED control: a planted spawnEnvVar 'HOME' reaches both lists.
  const EVERY_PROCESS = ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'TERM', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'];
  ok(!all().some((n) => EVERY_PROCESS.includes(n)), `no creds.*EnvVar(s) names an env every process needs (${EVERY_PROCESS.length} names) — the strip lists never take one`, all().filter((n) => EVERY_PROCESS.includes(n)));
  { const planted = live().map((d) => (d.id === 'antigravity' ? { ...d, creds: { ...d.creds, spawnEnvVar: 'HOME' } } : d));
    ok(HE.credentialEnvNames(planted).includes('HOME') && HE.agentCredentialEnvNames(planted).includes('HOME'), 'RED control: a planted creds.spawnEnvVar HOME lands in BOTH strip lists (every agent and job would lose HOME) — the census above can go red'); }
  ok(HE.VENDOR_CREDENTIAL_ENV.every((n) => all().includes(n)) && ['CODEX_HOME', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_CONFIG_DIR'].every((n) => all().includes(n)), `the one list = vendor names ∪ descriptor names (${all().length}: ${all().join(' ')})`);
  // 2. the judges — a door over a base env holding every name of the list + bystanders
  const baseOf = (names) => ({ PATH: '/usr/bin', HOME: '/home/u', SOME_FUTURE_TOOL_TOKEN: 'ft', ...Object.fromEntries(names.map((n) => [n, 'ambient-' + n])) });
  const judgeJob = (door, names = all()) => {
    const out = door({}, baseOf(names));
    const leaked = names.filter((n) => n in out);
    return { pass: !leaked.length && out.PATH === '/usr/bin' && out.SOME_FUTURE_TOOL_TOKEN === 'ft', leaked };
  };
  const judgeAgent = (door, names = all()) => {
    const out = door(baseOf(names));
    const leaked = agentNames().filter((n) => n in out);
    const lostHome = [...homes()].filter((n) => names.includes(n) && out[n] !== 'ambient-' + n);
    return { pass: !leaked.length && !lostHome.length && out.SOME_FUTURE_TOOL_TOKEN === 'ft', leaked, lostHome };
  };
  const trio = ['CODEX_HOME', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'ANTHROPIC_API_KEY'];
  const j3 = jobEnv({}, baseOf(trio));
  ok(trio.every((n) => !(n in j3)) && j3.PATH === '/usr/bin', 'job door: CODEX_HOME / CLAUDE_SECURESTORAGE_CONFIG_DIR / ANTHROPIC_API_KEY — none survive (B-6be2)', JSON.stringify(j3));
  const jl = judgeJob(jobEnv);
  ok(jl.pass, `job door: every name of the one list stripped (${all().length}), bystanders pass`, jl.leaked.join(','));
  ok(jobEnv({ OPENAI_API_KEY: 'the-jobs-own' }, baseOf(all())).OPENAI_API_KEY === 'the-jobs-own', "job door: a job's OWN env / secret is laid on after the strip and wins");
  const al = judgeAgent(agentEnv);
  ok(al.pass, `agent door (ws-handler agentEnv): strips ${agentNames().join(' ')}; keeps every homeEnvVar (${[...homes()].join(' ')})`, JSON.stringify(al));
  ok(agentEnv(baseOf(all())).OPENAI_API_KEY === 'ambient-OPENAI_API_KEY', 'agent door: a vendor name no descriptor writes (OPENAI_API_KEY) stays — an OpenCode/ACP agent may hold its own login that way');
  const dl = judgeAgent((b) => AE.daemonEnv(b, { drop: agentNames() }));
  ok(dl.pass, 'daemon door (daemonEnv + the derived drop): the same agent rule', JSON.stringify(dl));
  // 3. RED controls — the base's shapes
  const jobsSrc = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
  const derivedLine = "['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS'].includes(k) || credentials.has(k)";
  const handLine = "['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS', 'ANTHROPIC_API_KEY', 'CLAUDE_SECURESTORAGE_CONFIG_DIR'].includes(k)";
  const handJobs = jobsSrc.includes(derivedLine) ? MUTH.load('src/jobs.js', jobsSrc.replace(derivedLine, handLine), 'hand-list').jobEnv : null;
  const jh = handJobs ? judgeJob(handJobs) : { pass: true, leaked: [] };
  ok(handJobs && !jh.pass && jh.leaked.includes('CODEX_HOME'), `RED control: the base's hand list fails the job judge (leaks ${jh.leaked.join(' ')})`);
  const ab = judgeAgent((b) => AE.agentEnv(b));
  ok(!ab.pass && ab.leaked.includes('CLAUDE_SECURESTORAGE_CONFIG_DIR'), `RED control: the base's drop-less agentEnv fails the agent judge (leaks ${ab.leaked.join(' ')})`);
  // 4. the plant: a descriptor GAINING a creds.*EnvVar joins both doors with no edit anywhere else
  const pc = HARNESSES.codex.creds;
  pc.plantEnvVar = 'VS_PLANT_CRED'; pc.plantEnvVars = ['VS_PLANT_LIST'];
  try {
    const plants = ['VS_PLANT_CRED', 'VS_PLANT_LIST'];
    ok(plants.every((n) => all().includes(n) && agentNames().includes(n)), 'plant: creds.plantEnvVar + creds.plantEnvVars auto-join the one list and the agent share');
    const jp = judgeJob(jobEnv, plants), ap = judgeAgent(agentEnv, plants);
    ok(jp.pass && ap.pass, 'plant: the live job door and agent door both drop the planted names', JSON.stringify({ jp, ap }));
    const hp = handJobs ? judgeJob(handJobs, plants) : { pass: true };
    ok(handJobs && !hp.pass, 'plant RED control: the hand list lets the planted names through');
  } finally { delete pc.plantEnvVar; delete pc.plantEnvVars; }
  ok(!all().includes('VS_PLANT_CRED'), 'plant removed: the registry answers without it again');
  // 5. the account resolver writes nothing the agent door does not know (localEnv / secret.var literals)
  const accSrc = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const written = [...new Set([...accSrc.matchAll(/localEnv: \{ ([A-Z][A-Z0-9_]+):/g), ...accSrc.matchAll(/\bvar: '([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]))];
  const unknownWrites = written.filter((n) => !agentNames().includes(n));
  ok(written.length >= 2 && !unknownWrites.length, `accounts.js: every literal localEnv / secret.var name is an agent-door name (${written.join(', ')})`, unknownWrites.join(','));
  // 6. no hand list regrows in jobEnv
  const jobBody = (/function jobEnv\([\s\S]*?\n\}/.exec(jobsSrc) || [''])[0];
  const typed = all().filter((n) => jobBody.includes(n));
  ok(jobBody && /credentialEnvNames\(harnessList\(\)\)/.test(jobBody) && !typed.length, 'jobEnv derives its credential strip (credentialEnvNames over the registry) and types no credential name', typed.join(','));
  // 7. wiring census: every src/ module that requires agent-env.js hands the derived drop to every call
  //    (a new importer is RED until it does or is classified here with its reason)
  const EXEMPT = {
    'src/agentd/agentd.js': 'the daemon bundle: no registry inside; it is BORN without the names (src/agentd/client.js), and its children merge over that env',
    'src/server/oat-mint.js': 'MINT_ENV_ALLOW is an allowlist laid over it (checked below: no credential name in it)',
    'src/server/claude-signin.js': 'the SAME mintEnvOf allowlist (MINT_ENV_ALLOW) laid over it (lane door-signin-card — the subscription sign-in is the oat mint\'s sibling; the allowlist check below covers it)',
  };
  const srcFiles = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) srcFiles.push(p); } };
  walk(path.join(REPO, 'src'));
  const callsOf = (s) => {
    const m = /const \{([^}]*)\} = require\('[./]*agent-env\.js'\)/.exec(s);
    if (!m) return null;
    const aliases = m[1].split(',').map((x) => x.trim()).filter((x) => /^(agentEnv|daemonEnv)\b/.test(x)).map((x) => (x.split(':')[1] || x).trim());
    if (!aliases.length) return null;   // serviceEnv alone (lane spawn-env-census): an ALLOWLIST — no credential name can pass, no drop to hand
    const calls = [];
    for (const a of aliases) {
      const re = new RegExp('(?<![\\w$])' + a + '\\(', 'g');
      let c;
      while ((c = re.exec(s))) {
        const before = s.slice(Math.max(0, c.index - 9), c.index);
        if (/function\s+$/.test(before) || /(^|[^.])\.$/.test(before)) continue; // a definition / a method `x.name(` — a spread `...name(` is a call
        let i = c.index + a.length, depth = 0;
        for (; i < s.length; i++) { if (s[i] === '(') depth++; else if (s[i] === ')' && --depth === 0) break; }
        calls.push(s.slice(c.index, i + 1));
      }
    }
    return calls;
  };
  const bareOf = (calls) => calls.filter((c) => !/\bdrop:\s*agentCredentialEnvNames\(/.test(c) && !/\bdrop:\s*require\('\.\.\/harness-env\.js'\)\.agentCredentialEnvNames\(/.test(c));
  const importers = [];
  for (const f of srcFiles) {
    const calls = callsOf(fs.readFileSync(f, 'utf8'));
    if (calls) importers.push({ rel: path.relative(REPO, f), calls });
  }
  ok(importers.length >= 5, `wiring: agent-env.js importers found (${importers.map((x) => x.rel).join(', ')})`);
  for (const { rel, calls } of importers) {
    if (EXEMPT[rel]) { ok(true, `wiring: ${rel} — exempt: ${EXEMPT[rel]}`); continue; }
    const bare = bareOf(calls);
    ok(calls.length >= 1 && !bare.length, `wiring: ${rel} — every agentEnv/daemonEnv call hands the derived drop (${calls.length})`, bare.join(' | ').slice(0, 300));
  }
  const baseShape = "const { agentEnv: sanitizedSpawnEnv } = require('../agent-env.js');\n  const env = { ...sanitizedSpawnEnv(process.env), [h.envVar]: h.home };";
  ok(bareOf(callsOf(baseShape)).length === 1, "wiring RED control: the base's usage-pool helper call (no drop) is caught");
  const { MINT_ENV_ALLOW } = require(path.join(REPO, 'src/oat-mint-model.js'));
  ok(Array.isArray(MINT_ENV_ALLOW) && !MINT_ENV_ALLOW.some((n) => all().includes(n)), 'wiring: oat-mint allowlist holds no credential name');
}

// ── statusBar: THE STATUS-BAR FACTS ROW (lane agy-status-bar-facts, 2026-10-21) ──
// The owner, on an Antigravity conversation: «agy 的 chatview 缺少很多信息啊 什么 context 啊，cache rate，产物啊啥的下面都没有了».
// What a chat harness's status bar shows is its DESCRIPTOR ROW ui.statusBar (src/status-bar-facts.js): every chat harness
// declares one with every key (a missing one is RED here), the client META carries the same row, a harness without one
// (a shell, a register()ed harness that declares none) reports nothing — and the bar says so, never a blank.
console.log('\nstatusBar: every harness declares what its status bar shows');
{
  const SB = require(path.join(REPO, 'src/status-bar-facts.js'));
  const { statusBarRow } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  // the rows each harness's stream really feeds (its normalizer's usage meta): claude = the last message's usage + the
  // window its result names; codex = token_count last + total + model_context_window; opencode = ACP usage_update
  // used/size only (no cache field); antigravity = agy-wrapper's `usage` record + the descriptor's window table
  const EXPECT = {
    claude: { context: 'reported', cache: true, odometer: false, model: true, duration: false },
    codex: { context: 'reported', cache: true, odometer: true, model: true, duration: false },
    opencode: { context: 'reported', cache: false, odometer: false, model: true, duration: false },
    antigravity: { context: 'table', cache: true, odometer: true, model: true, duration: true },
    shell: { context: null, cache: false, odometer: false, model: false, duration: false }, // terminal-only: no row, nothing reported
  };
  for (const id of chatHarnessIds()) {
    const row = HARNESSES[id].ui && HARNESSES[id].ui.statusBar;
    ok(!!row && SB.statusBarErrors(row).length === 0, `${id}: declares ui.statusBar with every key (${SB.STATUS_BAR_ROWS.join(' / ')} / windows)`, JSON.stringify(SB.statusBarErrors(row)));
    ok(!!EXPECT[id] && SB.STATUS_BAR_ROWS.every((k) => row && row[k] === EXPECT[id][k]), `${id}: the row is what its stream feeds the bar (${JSON.stringify(EXPECT[id])})`, JSON.stringify(row));
    ok(JSON.stringify(statusBarRow(id)) === JSON.stringify(row), `${id}: the client's statusBarRow() is the descriptor's row`);
  }
  ok(JSON.stringify(SB.statusBarOf(harnessOf('shell').ui)) === JSON.stringify(SB.NO_STATUS_BAR) && SB.STATUS_BAR_ROWS.every((k) => statusBarRow('shell')[k] === EXPECT.shell[k]) && SB.unreportedRows(statusBarRow('shell')).length === 5,
    'shell (terminal-only, no chat): no row ⇒ nothing reported — every fact says «not reported», server and client alike');
  ok(JSON.stringify(SB.unreportedRows(statusBarRow('claude'))) === '["odometer","duration"]' && JSON.stringify(SB.unreportedRows(statusBarRow('opencode'))) === '["cache","odometer","duration"]' && SB.unreportedRows(statusBarRow('antigravity')).length === 0,
    'what each lacks is what its bar says «not reported» for: claude the token total + the turn time, opencode also the cache rate, antigravity nothing');
  // RED rows: the checker can say no
  const good = { context: 'reported', cache: true, odometer: false, model: true, duration: false, windows: null };
  const bad = [[{ ...good, cache: undefined }, 'a non-boolean cache'], [(() => { const r = { ...good }; delete r.duration; return r; })(), 'a missing key'], [{ ...good, context: 'guessed' }, 'an unknown context source'],
    [{ ...good, context: 'table' }, "context 'table' without a window table"], [{ ...good, windows: [{ prefix: 'm', tokens: 1 }] }, "a window table without context 'table'"], [{ ...good, context: 'table', windows: [{ prefix: 'm', tokens: 0 }] }, 'a window of 0 tokens'], [null, 'no row at all']];
  for (const [row, why] of bad) ok(SB.statusBarErrors(row).length > 0, `RED row: ${why} is refused`, JSON.stringify(row));
  // a contributed harness that declares no row reports nothing (the bar says so); one that declares a row gets it
  const H = require(path.join(REPO, 'src/harnesses/index.js'));
  H.register({ id: 'acme-facts', label: 'Acme Facts', kind: 'chat', quota: H.NULL_QUOTA, ui: { billing: null } });
  H.register({ id: 'acme-facts2', label: 'Acme Facts 2', kind: 'chat', quota: H.NULL_QUOTA, ui: { billing: null, statusBar: { ...good } } });
  try {
    ok(SB.unreportedRows(SB.statusBarOf(H.harnessOf('acme-facts').ui)).length === 5 && SB.unreportedRows(SB.statusBarOf(H.harnessOf('acme-facts2').ui)).join() === 'odometer,duration',
      'a register()ed harness: no ui.statusBar ⇒ every fact «not reported»; a declared row ⇒ exactly its own gaps');
  } finally { H.unregister('acme-facts'); H.unregister('acme-facts2'); }
  // the antigravity window table: every model the descriptor offers resolves (the docs' windows), an unknown slug does not
  const ag = HARNESSES.antigravity, agRow = ag.ui.statusBar;
  ok(ag.models().filter((m) => m.id).every((m) => SB.windowOf(agRow, m.id) === 1048576) && SB.windowOf(agRow, 'claude-opus-5-5-max') === 0 && SB.windowOf(agRow, 'gemini-4-argonaut') === 0 && agRow.windows === ag.AGY_CONTEXT_WINDOWS,
    "antigravity: every slug it offers has a documented window (1,048,576 — Google's model pages, named in the descriptor); an unknown slug ⇒ 0 = «window unknown», never a guess");
  // gated on the row, never the name: the bar reads the facts row for every fact chip
  const bar = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  ok(/const facts = statusBarRow\(this\._backend\);/.test(bar) && ['facts.context && !ctxWindow', 'facts.context && ctxWindow', 'facts.cache &&', 'facts.odometer &&', 'facts.duration &&'].every((n) => bar.includes(n)) && /unreportedRows\(facts\)/.test(bar),
    'the bar draws context / cache / odometer / turn time from the facts row and says what it lacks (unreportedRows) — no harness id');
}

// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTH.files, MUTH.dir, REPO, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
