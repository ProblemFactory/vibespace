#!/usr/bin/env node
// THE SCHEMA ORACLE + DRIFT MODULE (docs/design-unknown-records.md §3, owner ruling (b) 2026-09-21:
// "除了未知事件本身，也得注意如果已知事件类型具有未知参数也得有所记录和提醒"). The fall-back card
// (2.369.120, scripts/test-unknown-records.mjs) catches a record TYPE VibeSpace has never seen; this
// suite pins the module that catches a KNOWN type that GREW a field — src/record-shape.js — and the
// hook in both normalizers that turns the verdict into ONE card per shape per session.
//   §1 census over the TRACKED fixtures (scripts/fixtures/**, never production ~/.claude / ~/.codex —
//      the 2026-09-09 fixture rule): every field on every declared shape ∈ known ∪ ignored ∪ envelope
//      ∪ ours. An optional PRINTED local leg over ~/.claude/projects + ~/.codex/sessions runs only
//      behind VIBESPACE_SHAPE_CENSUS=1 (SKIP with reason in the gate).
//   §2 synthetic drift (the card policy — lane drift-card-restore, owner 2026-10-15 「你隐藏了还怎么知道」): init +{foo,bar} →
//      ONE card naming both (the CLI build on it) AND ONE drift-ledger row (conversation + shape, CLI build, count, the redacted
//      sample); a repeat adds no card and counts, a third with +{qux} MERGES into the card (edit op) and GROWS the row, a re-read
//      record counts once, telemetry once; codex token_count.info +{baz}; an unknown TYPE is the fall-back card only.
//   §2c the policy's RED controls (patched copies): .276's field-growth hiding / no ledger write / no enum card each go red.
//   §3 enum drift: an undeclared enum value is a card (its meaning may differ) AND the handler still runs.
//   §4a the extractor on every spelling the minifier has used (2.1.280 `u(`, 2.1.281 `d(`, a future
//      rename, an unminified form) — the helper names are read off an anchor; an unknown form is an error
//      naming the anchor, never a silent 0 / 0 / 0.
//   §4 the BINARY ORACLE: the installed claude's zod union, read with the census's own extractor —
//      every system subtype / stream type on exactly ONE of HANDLED ∪ KNOWN_IGNORED ∪
//      DECLARED_UPSTREAM_UNSEEN, every declared shape's binary fields ⊆ known ∪ ignored, no dead list
//      entry. SKIP with reason when no claude binary is installed. Red locally the day the CLI updates.
//   §4e the PINNED dumps (lane cli-2-1-288-records): each build in SCHEMA_CLI_VERSIONS judged from its tracked
//      dump (scripts/fixtures/claude-cli/<v>.json) — runs with no claude installed; a version-less new row is red.
//   §5 negative control: a scratch copy with every `ignored` map emptied goes red on §1.
// Run: node scripts/test-record-shape.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
// §4d (lane S1 verify r5): THE PERMISSION-OUTCOME SENTENCE CENSUS — the binary's OWN lists of the tool_result
//   texts it writes for a permission outcome (`Gd()` and the exact is_error set) vs src/permission-outcome.js;
//   the names are read off an anchor (the interrupt marker), never spelled; a newer build's extra sentence
//   PRINTS and FAILS until classified — the same discipline as §4's field census.
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skipped = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const skip = (n, why) => { skipped++; console.log('  ○ SKIP ' + n + ' — ' + why); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const R = require(path.join(REPO, 'src/record-shape.js'));
const MM = require(path.join(REPO, 'src/message-manager.js'));
const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const driftCards = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-fields');
const unknownCards = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-record');
const ledgerOf = (conversation, MMx = MM) => MMx.driftLedgerRows().filter((r) => r.conversation === conversation); // THE drift ledger (lane record-oracle-2-1-296)

// ── the census walker (shared by §1, the local leg and §5) ──
const CODEX_RECORD_TYPES = new Set(['session_meta', 'response_item', 'event_msg', 'turn_context', 'wrapper_meta', 'token_usage_record', 'compacted', 'world_state', 'server_request', 'server_request_resolved', 'inter_agent_communication_metadata', '_stdin_ack']);
function harnessOf(rec, file) {
  if (/(^|\/)rollout-|codex/i.test(file) && rec && typeof rec.type === 'string' && (CODEX_RECORD_TYPES.has(rec.type) || 'payload' in rec)) return 'codex';
  if (rec && typeof rec.type === 'string' && CODEX_RECORD_TYPES.has(rec.type) && 'payload' in rec) return 'codex';
  return rec && typeof rec.type === 'string' ? 'claude' : null;
}
// A file above this cap is SKIPPED, named and counted (never read): the local census leg crashed
// on a 964 MB production transcript (`Cannot create a string longer than 0x1fffffe8 characters`,
// r3 2026-09-21) before printing a line — the design's own census had already noted 2 skipped > 512 MB.
const RECORD_FILE_CAP = 256 * 1024 * 1024;
function* recordsOf(file, stats = null) {
  let text;
  try {
    const size = fs.statSync(file).size;
    if (size > RECORD_FILE_CAP) { if (stats) stats.skipped.push({ file, size, why: 'size' }); return; }
    text = fs.readFileSync(file, 'utf8');
  } catch (e) { if (stats) stats.skipped.push({ file, size: null, why: e.code || e.message }); return; }
  if (file.endsWith('.jsonl')) {
    for (const line of text.split('\n')) { const t = line.trim(); if (!t.startsWith('{')) continue; try { yield JSON.parse(t); } catch { } }
  } else {
    let j; try { j = JSON.parse(text); } catch { return; }
    if (Array.isArray(j)) { for (const x of j) if (x && typeof x === 'object') yield x; }
    else if (j && typeof j === 'object') yield j;
  }
}
function* walk(dir) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules') continue; yield* walk(p); }
    else if (/\.(json|jsonl)$/.test(e.name)) yield p;
  }
}
// Exclusions BY RULE (design §3 false-positive (g)): the workflow journal rows look like claude records
// but never reach a normalizer (only /api/workflow reads subagents/workflows/*/journal.jsonl).
const EXCLUDED_PATH = /subagents\/workflows\/[^/]+\/journal\.jsonl$/;
function census(mod, roots) {
  const judged = new Map(); const drift = []; const stats = { skipped: [] }; let files = 0, records = 0;
  for (const root of roots) for (const file of walk(root)) {
    if (EXCLUDED_PATH.test(file)) continue;
    files++;
    for (const rec of recordsOf(file, stats)) {
      records++;
      const h = harnessOf(rec, file);
      if (!h) continue;
      const judge = (r, opts) => {
        const shape = mod.shapeKeyOf(h, h === 'codex' ? 'rollout' : mod.carrierOf('claude', r), r, opts);
        if (!shape || !mod.SHAPES[shape]) return;
        judged.set(shape, (judged.get(shape) || 0) + 1);
        const d = mod.unknownFields(h, h === 'codex' ? 'rollout' : mod.carrierOf('claude', r), r, opts);
        if (d) drift.push({ file: path.relative(REPO, file), ...d });
      };
      // an event_msg line: the carrier judged at the envelope level, its payload once as the event (the normalizer's split)
      judge(rec, h === 'codex' && rec.type === 'event_msg' ? { kind: 'envelope' } : undefined);
      if (h === 'codex' && rec.type === 'event_msg' && rec.payload && typeof rec.payload === 'object') {
        judge(rec.payload, { kind: 'event' });
        const it = rec.payload.type === 'item_completed' ? rec.payload.item : null;
        if (it && typeof it === 'object') judge(it, { kind: 'item' });
      }
    }
  }
  return { judged, drift, files, records, skipped: stats.skipped };
}

console.log('§1 census over the tracked fixtures — every field on every declared shape is declared');
{
  const c = census(R, [path.join(REPO, 'scripts/fixtures')]);
  const shapes = [...c.judged.keys()].sort();
  console.log(`    ${c.files} fixture files · ${c.records} records · ${shapes.length} declared shapes judged`);
  for (const s of shapes) console.log(`      ${String(c.judged.get(s)).padStart(5)}  ${s}`);
  ok('the census is NON-VACUOUS: ≥ 25 declared shapes judged across both harnesses and all three claude/codex carriers', shapes.length >= 25 && shapes.some((s) => s.startsWith('claude:stream:')) && shapes.some((s) => s.startsWith('claude:transcript:')) && shapes.some((s) => s.startsWith('codex:rollout:')), shapes);
  ok('the three live-seen undeclared fields are exercised by a fixture (init.messaging_socket_path / task_started.owned_by_subagent / task_progress.workflow_progress) and NOT flagged', ['claude:stream:system/init', 'claude:stream:system/task_started', 'claude:stream:system/task_progress'].every((s) => c.judged.has(s)) && !c.drift.some((d) => /messaging_socket_path|owned_by_subagent|workflow_progress/.test(d.fields.join(','))));
  ok('ZERO drift over the tracked fixtures (a fixture carrying a field the module does not declare is either a real field to declare or a wrong fixture)', c.drift.length === 0, c.drift.slice(0, 8));
  ok('the three live-seen fields are declared WITH a note (the ignored map carries the reason — never silently known)', ['messaging_socket_path', 'owned_by_subagent', 'workflow_progress'].every((f) => Object.values(R.CORPUS_KNOWN).some((m) => typeof m[f] === 'string' && m[f].length > 10)));
  // the optional PRINTED local leg — never in the gate, never without the env
  if (process.env.VIBESPACE_SHAPE_CENSUS === '1') {
    const roots = [path.join(os.homedir(), '.claude/projects'), path.join(os.homedir(), '.codex/sessions')].filter((p) => fs.existsSync(p));
    const lc = census(R, roots);
    console.log(`    LOCAL LEG (printed only): ${lc.files} files · ${lc.records} records · ${lc.judged.size} shapes · ${lc.drift.length} drift verdicts · ${lc.skipped.length} skipped`);
    for (const s of lc.skipped) console.log(`      skip (${s.why}${s.size != null ? ' ' + Math.round(s.size / 1048576) + ' MB' : ''}) ${s.file.replace(os.homedir(), '~')}`);
    const byShape = new Map();
    for (const d of lc.drift) { const k = d.shape + ' +{' + d.fields.join(',') + '}'; byShape.set(k, (byShape.get(k) || 0) + 1); }
    for (const [k, n] of [...byShape].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`      ${String(n).padStart(6)}  ${k}`);
  } else skip('local census over ~/.claude/projects + ~/.codex/sessions', 'set VIBESPACE_SHAPE_CENSUS=1 to print it (read-only; never in the gate)');
}

console.log('§2 synthetic drift — a known record that GREW a field is ONE card per shape per session (the update signal, lane drift-card-restore), merged on repeat, AND ONE drift-ledger row per conversation + shape; telemetry once, the fall-back card never doubled');
{
  const prevEv = global.__vsEvent; const events = []; global.__vsEvent = (n, d) => events.push([n, d]);
  MM.MessageManager._seenShapeDrift.clear();
  const mm = createMessageManager('claude', 'test-shape-1');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  const init = (extra) => ({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 'e2e00000-0000-4000-8000-000000000001', uuid: 'u-init-' + Math.random(), tools: [], mcp_servers: [], model: 'claude-fable-5-1', permissionMode: 'default', slash_commands: [], apiKeySource: 'sk-ant-fixture-secret', claude_code_version: '2.1.274', output_style: 'default', skills: [], plugins: [], ...extra });
  mm.processLive(init({ foo: 1, bar: 'x' }));
  const SID1 = 'e2e00000-0000-4000-8000-000000000001';
  let c = driftCards(mm);
  let row = ledgerOf(SID1)[0];
  ok('init +{foo,bar} ⇒ ONE card (noticeKind unknown-fields, block unknown_fields naming the shape, both fields and the CLI build the init frame named) AND ONE drift-ledger row for the conversation (the record\'s own session id): the shape, both fields, the CLI build, count 1', c.length === 1 && c[0].content[0].type === 'unknown_fields' && c[0].content[0].shape === 'system/init' && JSON.stringify(c[0].content[0].fields) === '["foo","bar"]' && c[0].content[0].harness === 'Claude Code' && c[0].content[0].cli === '2.1.274' && ledgerOf(SID1).length === 1 && row.shape === 'system/init' && JSON.stringify(row.fields) === '["foo","bar"]' && row.harness === 'Claude Code' && row.cli === '2.1.274' && row.count === 1, { cards: c.map((m) => m.content[0]), rows: ledgerOf(SID1) });
  ok('…the card is EMITTED as a create op (an open window sees it)', ops.filter((o) => o.op === 'create' && (o.message || o.msg)?.noticeKind === 'unknown-fields').length === 1);
  ok('…the card\'s sample and the row\'s ride through the redactor: the value under apiKeySource (an api+key compound) is masked, the field names are visible', [c[0].content[0].sample, row.sample].every((s) => /«redacted»/.test(s) && !/sk-ant-fixture-secret/.test(s) && /"foo": 1/.test(s)));
  // the redactor judges key SEGMENTS, never substrings (r3 2026-09-21: the /key/ alternative masked the notification's own `key`)
  const red = R.redactRecord({ key: 'stop-hook-error', monkey: 'm', hotkey: 'h', keyboard: 'k', keys: ['a'], turnkey: 't', api_key: 'x', apiKey: 'x', ANTHROPIC_API_KEY: 'x', access_token: 'x', refreshToken: 'x', OAuthToken: 'x', authorization: 'x', password: 'x', secret_key: 'x', apiKeySource: 'x', input_tokens: 5, nested: { cookie: 'c', session_key: 's', key: 'inner-visible' } });
  ok('NEGATIVE CONTROL: `key` / `monkey` / `hotkey` / `keyboard` / `keys` / `turnkey` values stay VISIBLE (a drift card on system/notification must show the field that identifies it)', red.key === 'stop-hook-error' && red.monkey === 'm' && red.hotkey === 'h' && red.keyboard === 'k' && red.keys[0] === 'a' && red.turnkey === 't' && red.nested.key === 'inner-visible', red);
  ok('…while credential compounds and secret segments are masked at any depth: api_key / apiKey / ANTHROPIC_API_KEY / access_token / refreshToken / OAuthToken / authorization / password / secret_key / apiKeySource / nested cookie + session_key; counts (input_tokens) stay', ['api_key', 'apiKey', 'ANTHROPIC_API_KEY', 'access_token', 'refreshToken', 'OAuthToken', 'authorization', 'password', 'secret_key', 'apiKeySource'].every((k) => red[k] === '«redacted»') && red.nested.cookie === '«redacted»' && red.nested.session_key === '«redacted»' && red.input_tokens === 5, red);
  ok('isSecretKey is exported and table-true on the same rows', R.isSecretKey('apiKey') && R.isSecretKey('ACCESS_TOKEN') && !R.isSecretKey('key') && !R.isSecretKey('monkey') && !R.isSecretKey('keyboard') && !R.isSecretKey('messaging_socket_path'));
  ok('…the init card itself still rendered (handling unchanged — the drift hook runs AFTER routing)', mm.messages.some((m) => m.content?.[0]?.initData));
  mm.processLive(init({ foo: 2, bar: 'y' }));
  row = ledgerOf(SID1)[0];
  ok('a SECOND occurrence with the same fields adds NO card and no op; the row counts 2', driftCards(mm).length === 1 && ops.filter((o) => o.op === 'edit' && o.fields?.content?.[0]?.type === 'unknown_fields').length === 0 && ledgerOf(SID1).length === 1 && row.count === 2, row);
  const nEdits = ops.length;
  mm.processLive(init({ foo: 3, qux: true }));
  c = driftCards(mm);
  row = ledgerOf(SID1)[0];
  ok('a THIRD with +{qux} MERGES into the same card (fields now foo,bar,qux) through an EDIT op — never a new card; the row grows the same way (count 3)', c.length === 1 && JSON.stringify(c[0].content[0].fields) === '["foo","bar","qux"]' && ops.slice(nEdits).some((o) => o.op === 'edit' && o.id === c[0].id && o.fields.content[0].fields.length === 3) && ledgerOf(SID1).length === 1 && JSON.stringify(row.fields) === '["foo","bar","qux"]' && row.count === 3, { cards: c.map((m) => m.content[0].fields), row });
  // THE CARD'S NEW HOME (lane door-healthy-chat, 2.369.344 — the naive studies' W1/C1): the notice still exists (the census above) but the
  // chat no longer draws it; the shape is ONE row of the conversation's added kinds — the status bar's quiet chip — said by a meta op
  const kindsOps = ops.filter((o) => o.op === 'meta' && o.subtype === 'record-kinds');
  ok('…the grown shape is ONE added kind of the conversation (kind fields, name system/init, the CLI build) — the bar\'s quiet chip — and its `record-kinds` meta op went out once (the merges add none)', JSON.stringify(mm.addedKinds()) === JSON.stringify([{ kind: 'fields', name: 'system/init', cli: '2.1.274' }]) && kindsOps.length === 1, { kinds: mm.addedKinds(), kindsOps: kindsOps.length });
  const drifts = events.filter((e) => e[0] === 'harness-shape-drift');
  ok('telemetry harness-shape-drift fired ONCE per process per shape, the detail naming shape + fields + the CLI build', drifts.length === 1 && /^claude:stream:system\/init \+\{foo,bar\}/.test(drifts[0][1]) && /cli 2\.1\.274/.test(drifts[0][1]), drifts);
  // the fall-back card owns an unknown TYPE: never ALSO a drift card
  mm.processLive({ type: 'brand_new_record', anything: 1, uuid: 'u-x', session_id: 's' });
  mm.processLive({ type: 'system', subtype: 'never_seen_subtype', whatever: 2, uuid: 'u-y', session_id: 's' });
  ok('an unknown TYPE / subtype is the fall-back card ONLY (2 unknown-record cards, still 1 drift card, no ledger row for them)', unknownCards(mm).length === 2 && driftCards(mm).length === 1 && ledgerOf('s').length === 0);
  // a history rebuild renders the same ONE card; a record already counted (the same record key) is not counted again
  const SID2 = 'e2e00000-0000-4000-8000-000000000002';
  const again = [init({ foo: 1, bar: 2, session_id: SID2, uuid: 'u-h1' }), init({ foo: 1, bar: 2, session_id: SID2, uuid: 'u-h2' })];
  createMessageManager('claude', 'test-shape-2-live').convertHistory(again);
  const hist = createMessageManager('claude', 'test-shape-2');
  hist.convertHistory(again);
  ok('a HISTORY rebuild renders the same ONE card (the hook is a renderer, not an alert); the SAME row, still count 2 (a re-read record counts once, by its record key)', driftCards(hist).length === 1 && driftCards(hist)[0].content[0].fields.length === 2 && ledgerOf(SID2).length === 1 && ledgerOf(SID2)[0].count === 2 && ledgerOf(SID2)[0].fields.length === 2, { cards: driftCards(hist).map((m) => m.content[0].fields), rows: ledgerOf(SID2) });
  // a handled record with NO drift produces nothing
  const clean = createMessageManager('claude', 'test-shape-3');
  clean.processLive(init({ session_id: 'e2e00000-0000-4000-8000-000000000003' }));
  clean.processLive({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 5, estimated_tokens_delta: 5, uuid: 'u-t', session_id: 's' });
  ok('clean records ⇒ no drift card and no ledger row (negative control for the hook)', driftCards(clean).length === 0 && unknownCards(clean).length === 0 && ledgerOf('e2e00000-0000-4000-8000-000000000003').length === 0);
  // codex
  CodexMessageManager._seenShapeDrift.clear();
  const cx = new CodexMessageManager('test-shape-cx');
  const cops = []; cx.onOp((o) => cops.push(o));
  const tc = (extra) => ({ timestamp: '2026-09-13T16:39:55.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1 }, last_token_usage: { total_tokens: 1 }, model_context_window: 100, ...extra }, rate_limits: { limit_id: 'codex' } } });
  cx.processLive(tc({ baz: 1 }));
  cx.processLive(tc({ baz: 2 }));
  const cc = driftCards(cx);
  const cxr = ledgerOf('test-shape-cx');
  ok('codex token_count.info +{baz} ⇒ ONE card (shape event/token_count, field info.baz, harness Codex), the repeat adds none; AND ONE ledger row (the same shape + field), the repeat (another record) counts 2', cc.length === 1 && cc[0].content[0].shape === 'event/token_count' && JSON.stringify(cc[0].content[0].fields) === '["info.baz"]' && cc[0].content[0].harness === 'Codex' && cxr.length === 1 && cxr[0].shape === 'event/token_count' && JSON.stringify(cxr[0].fields) === '["info.baz"]' && cxr[0].harness === 'Codex' && cxr[0].count === 2, { cards: cc.map((m) => m.content[0]), cxr });
  ok('…the token_count itself was still consumed (usage meta path ran)', cops.some((o) => o.op === 'meta' && o.subtype === 'usage') || cx.messages.length >= 1);
  ok('codex telemetry once, naming the shape', events.filter((e) => e[0] === 'harness-shape-drift' && /codex:rollout:event\/token_count \+\{info\.baz\}/.test(e[1])).length === 1);
  cx.processLive({ timestamp: '2026-09-13T16:39:56.000Z', type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'x', item: { type: 'Extension', kind: 'web.sleep', id: 'exec-1', seconds: 2 } } });
  ok('an unknown codex item KIND is the fall-back card by name — never ALSO a drift card / ledger field for its fields (still the one card, the one row)', unknownCards(cx).length === 1 && driftCards(cx).length === 1 && ledgerOf('test-shape-cx').length === 1);
  // the event_msg CARRIER line is judged at the envelope level too (r3 2026-09-21: a new top-level key on an event line was
  // invisible while the same key on a response_item line was flagged) — and the payload is still judged exactly once
  const ce = new CodexMessageManager('test-shape-cx-env');
  ce.processLive({ ...tc({}), brand_new_top: 1 });
  let ced = ledgerOf('test-shape-cx-env');
  ok('codex event_msg line +{brand_new_top} at the TOP level ⇒ a drift card on event/token_count naming brand_new_top (the envelope judged) and its ledger row', driftCards(ce).length === 1 && driftCards(ce)[0].content[0].shape === 'event/token_count' && JSON.stringify(driftCards(ce)[0].content[0].fields) === '["brand_new_top"]' && ced.length === 1 && ced[0].shape === 'event/token_count' && JSON.stringify(ced[0].fields) === '["brand_new_top"]', { cards: driftCards(ce).map((m) => m.content[0]), ced });
  ce.processLive({ ...tc({ baz: 1 }), brand_new_top: 2 });
  ced = ledgerOf('test-shape-cx-env');
  ok('…a line with BOTH an envelope key and a payload field ⇒ still ONE card and ONE row per shape (the two verdicts merge: brand_new_top + info.baz), each judged exactly once (no duplicate field)', driftCards(ce).length === 1 && JSON.stringify(driftCards(ce)[0].content[0].fields) === '["brand_new_top","info.baz"]' && ced.length === 1 && JSON.stringify(ced[0].fields) === '["brand_new_top","info.baz"]', { cards: driftCards(ce).map((m) => m.content[0].fields), rows: ced.map((r) => r.fields) });
  const cr2 = new CodexMessageManager('test-shape-cx-ri');
  cr2.processLive({ timestamp: '2026-09-13T16:39:57.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] }, brand_new_top: 1 });
  ok('…the response_item twin flags the same key (parity between the two carriers)', driftCards(cr2).length === 1 && driftCards(cr2)[0].content[0].fields.includes('brand_new_top') && ledgerOf('test-shape-cx-ri').length === 1 && ledgerOf('test-shape-cx-ri')[0].fields.includes('brand_new_top'), { cards: driftCards(cr2).map((m) => m.content[0]), rows: ledgerOf('test-shape-cx-ri') });
  const cclean = new CodexMessageManager('test-shape-cx-clean');
  cclean.processLive(tc({}));
  ok('a clean event_msg line ⇒ no card, no ledger row (negative control for the envelope judgement)', driftCards(cclean).length === 0 && ledgerOf('test-shape-cx-clean').length === 0);
  ok('unknownFields kind envelope: judges ONLY the carrier keys (a payload field is not its business)', R.unknownFields('codex', 'rollout', { ...tc({ baz: 1 }), brand_new_top: 1 }, { kind: 'envelope' }).fields.join(',') === 'brand_new_top');
  global.__vsEvent = prevEv;
}

console.log('§2c the card policy\'s RED controls — a patched copy per rule (.276\'s field-growth hiding, no ledger write, no enum card) fails its leg');
{
  const M = mutantCopies('record-policy', REPO);
  const mmSrc = read('src/message-manager.js'), cxSrc = read('src/codex-message-manager.js');
  const gate = '    if (entry && !newFields.length && !newEnums.length) return;\n';
  const write = "    if (drift.fields.length) noteFieldDrift({ conversation: raw.session_id || raw.sessionId || this.sessionId,";
  const cxWrite = "    if (drift.fields.length) noteFieldDrift({ conversation: this._threadId || this.sessionId,";
  ok('the patch sites exist, once per normalizer (a control is meaningful only if its line does)', mmSrc.split(gate).length === 2 && cxSrc.split(gate).length === 2 && mmSrc.includes(write) && cxSrc.includes(cxWrite));
  const SIDC = 'e2e00000-0000-4000-8000-0000000000c1';
  const run = (MMx) => {
    const { createMessageManager: cm } = MMx === MM ? { createMessageManager } : { createMessageManager: (b, id) => new MMx.MessageManager(id) };
    const x = cm('claude', 'test-policy-ctl');
    x.processLive({ type: 'system', subtype: 'init', cwd: '/w', session_id: SIDC, uuid: 'u-pc1', model: 'm', permissionMode: 'default', claude_code_version: '2.1.296', grown_field: 1 });
    x.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'squash', cwd: '/w', uuid: 'u-pc2', session_id: SIDC });
    const cardsOf = x.messages.filter((m) => m.noticeKind === 'unknown-fields');
    return { fieldCards: cardsOf.filter((m) => m.content[0].shape === 'system/init').length, enumCards: cardsOf.filter((m) => m.content[0].shape === 'system/vcs_state_changed').length, rows: ledgerOf(SIDC, MMx).length };
  };
  const real = run(MM);
  ok('the real normalizer: field growth ⇒ 1 card + 1 ledger row; an enum drift ⇒ 1 card (lane drift-card-restore: the card is the update signal)', real.fieldCards === 1 && real.rows === 1 && real.enumCards === 1, real);
  const hidden = require(M.write('src/message-manager.js', mmSrc.replace(gate, '    if (!newEnums.length) return;\n'), 'hidden-276'));
  const hc = run(hidden);
  ok('CONTROL: a copy with .276\'s hiding restored (only an undeclared value draws a card) ⇒ the field leg goes RED (no system/init card; the enum card and the row stay)', hc.fieldCards === 0 && hc.enumCards === 1 && hc.rows === 1, hc);
  const noRow = require(M.write('src/message-manager.js', mmSrc.replace(write, '    if (false) noteFieldDrift({ conversation: raw.session_id || raw.sessionId || this.sessionId,'), 'no-ledger'));
  const nr = run(noRow);
  ok('CONTROL: a copy that never writes the ledger ⇒ the ledger leg goes RED (0 rows — ⚙ Diagnostics would list nothing; the card alone stays)', nr.rows === 0 && nr.fieldCards === 1, nr);
  const noEnum = require(M.write('src/message-manager.js', mmSrc.replace(gate, '    if (!newFields.length) return;\n'), 'no-enum-card'));
  const ne = run(noEnum);
  ok('CONTROL: a copy that drops the enum card ⇒ the enum leg goes RED (0 cards for the undeclared value)', ne.enumCards === 0, ne);
  // the codex twin, the same three-way rule
  const cxRun = (C, MMx) => { const x = new C('test-policy-cx-' + Math.random()); x.processLive({ timestamp: '2026-10-15T00:00:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1 }, last_token_usage: { total_tokens: 1 }, model_context_window: 100, grown: 1 }, rate_limits: { limit_id: 'codex' } } }); return { cards: driftCards(x).length, rows: ledgerOf(x.sessionId, MMx).length }; };
  const cr = cxRun(CodexMessageManager, MM);
  ok('codex: field growth ⇒ 1 card + 1 ledger row (the shared ledger, harness Codex)', cr.cards === 1 && cr.rows === 1, cr);
  const cxHidden = require(M.write('src/codex-message-manager.js', cxSrc.replace(gate, '    if (!newEnums.length) return;\n'), 'cx-hidden-276')).CodexMessageManager;
  const co = cxRun(cxHidden, MM);
  ok('CONTROL: the codex copy with .276\'s hiding restored ⇒ RED (0 cards, the row alone)', co.cards === 0 && co.rows === 1, co);
}

// §2b OURS BY PREFIX (2.369.126 r2): the wrappers mint webui_* keys faster than any list —
// `webui_msg_id` on every codex user record was flagged as drift and pushed a red card into
// every queued send (test-queue-steer, heavy tier). The census below is grep-derived over the
// tree's writers, so the next key cannot regress either.
console.log('§2b every webui_* key the tree writes is OURS by prefix — never drift');
{
  const { execSync } = await import('node:child_process');
  const written = [...new Set(execSync("/usr/bin/grep -rhoE 'webui_[a-z_]+' data/bin server.js src --include='*.js' 2>/dev/null || true", { cwd: REPO, encoding: 'utf8', shell: '/bin/sh' }).split('\n').map((x) => x.trim()).filter(Boolean))].sort();
  ok(`census scope is non-vacuous (${written.length} webui_* keys written by the tree: ${written.join(' ')})`, written.length >= 8, written);
  const notOurs = written.filter((k) => !R.isOurs(k));
  ok(`every written webui_* key is OURS${notOurs.length ? ' — NOT: ' + notOurs.join(', ') : ''}`, notOurs.length === 0, notOurs);
  const payload = { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'one' }] };
  for (const k of written) payload[k] = 'x';
  const codexRec = { timestamp: '2026-09-21T00:00:00.000Z', type: 'response_item', payload };
  ok('a codex user record carrying EVERY written webui_* key judges as no drift', R.unknownFields('codex', 'rollout', codexRec) === null, R.unknownFields('codex', 'rollout', codexRec));
  const claudeRec = { type: 'user', uuid: 'u1', session_id: 's1', webui_msg_id: 'm1', webui_origin_note: 'n', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } };
  ok('a claude stream user record carrying webui_* keys judges as no drift', R.unknownFields('claude', 'stream', claudeRec) === null, R.unknownFields('claude', 'stream', claudeRec));
  { const nc = R.unknownFields('codex', 'rollout', { timestamp: '2026-09-21T00:00:00.000Z', type: 'response_item', payload: { ...payload, webui_future_key: 1, zzz_new_vendor_field: 1 } }); ok('NEGATIVE CONTROL: a vendor field beside a future webui_* key is still flagged, and the webui_* key is not', !!nc && nc.fields.join(',') === 'zzz_new_vendor_field', nc); }
}

console.log('§3 enum drift — an undeclared enum value is a card, and the handler still runs');
{
  const mm = createMessageManager('claude', 'test-shape-enum');
  // a running task (launch ack + task_started), then a task_notification with an UNDECLARED status
  mm.processLive({ type: 'assistant', uuid: 'a1', session_id: 's', message: { id: 'msg_1', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: 'toolu_e1', name: 'Agent', input: { description: 'census', prompt: 'go' } }] } });
  mm.processLive({ type: 'system', subtype: 'task_started', task_id: 'ag1', tool_use_id: 'toolu_e1', description: 'census', task_type: 'local_agent', uuid: 'u-ts', session_id: 's' });
  const card = mm.messages.find((m) => m.toolCallId === 'toolu_e1');
  ok('setup: the task card is running', card?.taskInfo?.status === 'running');
  mm.processLive({ type: 'system', subtype: 'task_notification', task_id: 'ag1', tool_use_id: 'toolu_e1', status: 'paused', output_file: '/w/o', summary: 's', uuid: 'u-tn', session_id: 's' });
  const c = driftCards(mm);
  ok('task_notification status:"paused" (not in {completed,failed,stopped,killed}) ⇒ an enum-drift card naming field + value', c.length === 1 && c[0].content[0].shape === 'system/task_notification' && JSON.stringify(c[0].content[0].enumDrift) === '[{"field":"status","value":"paused"}]', c.map((m) => m.content[0]));
  ok('…and the HANDLER still ran: the task card closed exactly as for a declared value', card.taskInfo.status === 'completed');
  ok('…no unknown-event card (the subtype is handled; only the value drifted)', unknownCards(mm).length === 0);
  const v = createMessageManager('claude', 'test-shape-enum2');
  v.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'squash', cwd: '/w/proj', uuid: 'u-v', session_id: 's' });
  ok('vcs_state_changed kind:"squash" ⇒ an enum-drift card (the binary: "new kinds may be added — treat unknown like known")', driftCards(v).length === 1 && driftCards(v)[0].content[0].enumDrift[0].value === 'squash');
  const w = createMessageManager('claude', 'test-shape-enum3');
  w.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'push', branch: 'main', cwd: '/w/proj', uuid: 'u-w', session_id: 's' });
  ok('…a declared value is silent (negative control)', driftCards(w).length === 0);
  const SIDX = 'e2e00000-0000-4000-8000-0000000000e4';
  const x = createMessageManager('claude', 'test-shape-enum4');
  x.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'squash', cwd: '/w/proj', uuid: 'u-x', session_id: SIDX, also_grown: 1 });
  const xc = driftCards(x);
  ok('a record with BOTH an undeclared value and a new field ⇒ ONE card naming both (fields [also_grown], the value squash), the field also a ledger row', xc.length === 1 && xc[0].content[0].fields.join() === 'also_grown' && xc[0].content[0].enumDrift[0].value === 'squash' && ledgerOf(SIDX).length === 1 && ledgerOf(SIDX)[0].fields.join() === 'also_grown', { cards: xc.map((m) => m.content[0]), rows: ledgerOf(SIDX) });
}

// ── THE EXTRACTOR (§4a, §4) — moved verbatim to scripts/claude-cli-dump.mjs (lane cli-2-1-288-records) ──
import { extractZodUnion, extractPermissionSentences, outcomeCensus, nestedOf, NESTED_FIELDS, NESTED_UNIONS } from './claude-cli-dump.mjs';
/** PURE (lane cli-2-1-307-records): a dump's / a binary's `nested` ({'<shape>.<field>': keys}) vs the nested specs of Rx — every
 *  key outside known ∪ ignored, every object with no spec or not read, NAMED. */
const nestedUndeclared = (Rx, nested) => Object.entries(nested).flatMap(([at, keys]) => {
  const cut = at.lastIndexOf('.'), sp = Rx.SHAPES['claude:stream:' + at.slice(0, cut)]?.nested?.[at.slice(cut + 1)];
  if (!sp) return ['NO SPEC ' + at];
  if (!Array.isArray(keys)) return ['UNREAD ' + at + ' (' + (keys && keys.error) + ')'];
  return keys.filter((f) => !sp.known.has(f) && !sp.ignored.has(f)).map((f) => 'UNDECLARED ' + at + '.' + f);
});

console.log('§4a the extractor on every spelling the minifier has used — a rename is FOLLOWED, a new form fails BY NAME');
{
  // Each fixture keeps the real bundle's layout (the lazy `p(()=>…)` wrapper, `.describe(…)` with braces
  // inside the string, a nested object, the envelope pair), shortened. 2.1.280 = `u(`/`R(`,
  // 2.1.281 = `d(`/`R(` + the MCP content-block `.extend(` trap copied from its bundle.
  const body = (o, l) => `Cz=p(()=>${o}({type:${l}("system"),subtype:${l}("compact_boundary"),compact_metadata:${o}({trigger:V(["manual","auto"]),pre_tokens:k().int()}).describe("a } inside a string, and ({ too"),logical_parent_uuid:_().optional(),uuid:_(),session_id:o()})),Hz=p(()=>${o}({type:${l}("system"),subtype:${l}("init"),cwd:o(),model:o(),uuid:_(),session_id:o()})),Jz=p(()=>${o}({type:${l}("tombstone"),message:C(ae()),uuid:_(),session_id:o()}))`;
  const EXPECT = { 'system/compact_boundary': 'compact_metadata,logical_parent_uuid,uuid,session_id', 'system/init': 'cwd,model,uuid,session_id', tombstone: 'message,uuid,session_id' };
  const same = (u) => Object.keys(EXPECT).every((k) => (u[k] || []).join(',') === EXPECT[k]);
  const f280 = extractZodUnion('var ' + body('u', 'R') + ';');
  ok('the 2.1.274–2.1.280 spelling `u({type:R(…)` — helpers read off the anchor, three shapes with their depth-1 keys (the string\'s braces skipped)', !f280.error && f280.helpers.map((h) => h.obj + '/' + h.lit).join() === 'u/R' && same(f280.union) && Object.keys(f280.union).length === 3, f280);
  const trap = ',gt=d({type:R("resource"),resource:Fe([G,D]),annotations:p.optional()}),St=QVt.extend({type:R("resource_link")}),w=Fe([E,L,_,St,gt])';
  const f281 = extractZodUnion('var ' + body('d', 'R') + trap + ';');
  ok('the 2.1.281 spelling `d({type:R(…)` — the same three shapes, helpers d/R', !f281.error && f281.helpers.map((h) => h.obj + '/' + h.lit).join() === 'd/R' && same(f281.union), f281);
  ok('…and `QVt.extend({type:R("resource_link")})` is NOT a shape (a method name ending in the helper\'s letter — the identifier guard)', !('resource_link' in f281.union) && 'resource' in f281.union, Object.keys(f281.union));
  const fNext = extractZodUnion('var ' + body('$q', 'Zt') + ';');
  ok('a FUTURE rename (`$q({type:Zt(…)` — `$` in a helper name escaped) is followed with no code change', !fNext.error && fNext.helpers[0].obj === '$q' && same(fNext.union), fNext);
  const fDotted = extractZodUnion('var ' + body('z.object', 'z.literal') + ';');
  ok('an unminified `z.object({type:z.literal(…)` bundle reads the same', !fDotted.error && same(fDotted.union), fDotted);
  const fNone = extractZodUnion('var Cz=p(()=>u({subtype:R("compact_boundary"),type:R("system"),uuid:_(),session_id:o()}));');
  ok('a form the extractor does not know (keys reordered) is an ERROR NAMING THE ANCHOR — never a silent 0 / 0 / 0', !!fNone.error && /NO ANCHOR/.test(fNone.error) && /compact_boundary/.test(fNone.error) && Object.keys(fNone.union).length === 0, fNone.error);
}

console.log('§4 the BINARY ORACLE — the installed claude\'s zod union vs the three lists + the declared shapes');
{
  const HANDLED = MM.HANDLED_SYSTEM_SUBTYPES, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, IGNT = MM.KNOWN_IGNORED_RECORD_TYPES;
  const UNSEEN = R.DECLARED_UPSTREAM_UNSEEN;
  // list hygiene needs no binary
  const both = [...HANDLED].filter((s) => IGN.has(s) || s in UNSEEN.system).concat([...IGN].filter((s) => s in UNSEEN.system));
  ok('no system subtype sits on two lists at once (HANDLED / KNOWN_IGNORED / DECLARED_UPSTREAM_UNSEEN are disjoint)', both.length === 0, both);
  ok('every DECLARED_UPSTREAM_UNSEEN entry carries a one-line disposition', Object.values(UNSEEN.system).concat(Object.values(UNSEEN.types)).every((d) => typeof d === 'string' && d.length > 12));
  const routeSrc = read('src/message-manager.js');
  const routeBody = routeSrc.slice(routeSrc.indexOf('_routeMessage(raw, emit) {'), routeSrc.indexOf('_processTombstone(raw, emit) {'));
  const cases = new Set([...routeBody.matchAll(/case '([a-z_-]+)':/g)].map((m) => m[1]));
  ok('the routed top-level types were read off _routeMessage (non-vacuous)', cases.has('system') && cases.has('user') && cases.has('result') && cases.size >= 8, [...cases]);
  const both2 = [...IGNT].filter((t) => cases.has(t) || t in UNSEEN.types).concat([...cases].filter((t) => t in UNSEEN.types));
  ok('no top-level type is both routed and ignored/unseen', both2.length === 0, both2);

  const findBinary = () => {
    // VIBESPACE_ORACLE_BINARY pins the file the oracle reads (an older build under
    // ~/.local/share/claude/versions/, or a scratch dump with a planted field — the drift-alarm proof).
    const cands = process.env.VIBESPACE_ORACLE_BINARY ? [process.env.VIBESPACE_ORACLE_BINARY] : [];
    for (const d of String(process.env.PATH || '').split(':')) if (d) cands.push(path.join(d, 'claude'));
    cands.push(path.join(os.homedir(), '.local/bin/claude'), path.join(os.homedir(), '.claude/local/claude'));
    for (const c of cands) { try { const real = fs.realpathSync(c); if (fs.statSync(real).isFile()) return real; } catch { } }
    return null;
  };
  const bin = findBinary();
  const size = bin ? fs.statSync(bin).size : 0;
  // the installed BUILD vs the build the shapes were dumped from (src/record-shape.js SCHEMA_CLI_VERSION):
  // strict on this developer box and whenever the two match; on the Actions mirror — which installs whatever
  // npm serves today (2.1.278 on 2026-09-21 vs the pinned 2.1.274) — a newer build's drift is PRINTED and
  // skipped, so the mirror stays readable and the developer box stays the place that goes red on a CLI update.
  const pinned = process.env.VIBESPACE_ORACLE_PINNED || R.SCHEMA_CLI_VERSION;
  const installed = (() => { if (!bin) return null; const m = path.basename(bin).match(/^\d+\.\d+\.\d+$/); if (m) return m[0]; try { return (execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).match(/\d+\.\d+\.\d+/) || [null])[0]; } catch { return null; } })();
  // pinned PER CLI VERSION (lane cli-2-1-288-records): any build in R.SCHEMA_CLI_VERSIONS is strict everywhere
  const lenient = !!process.env.GITHUB_ACTIONS && installed !== pinned && !R.SCHEMA_CLI_VERSIONS.includes(installed);
  console.log(`  installed claude ${installed || '(unknown)'} vs pinned schema ${pinned} — ${lenient ? 'INFORMATIONAL (mirror, newer build): drift is printed, not red' : 'STRICT'}`);
  const oracleOk = lenient ? (n, c, e) => { if (c) ok(n, c, e); else skip(n, 'informational on the mirror (installed ' + installed + ' ≠ pinned ' + pinned + '): ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600)); } : ok;
  if (!bin || size < 4 * 1024 * 1024) {
    skip('binary oracle', bin ? `${bin} is ${size} bytes — a launcher/shim, not the CLI binary (install the native build to run this leg)` : 'no claude binary on PATH / ~/.local/bin / ~/.claude/local');
  } else {
    // THE EXTRACTOR (§4a): the helper names read off the anchor, never spelled. `strings` keeps memory
    // sane on a 230 MB ELF; the raw latin1 read is the fallback.
    let text = '';
    try { text = execFileSync('strings', ['-n', '8', bin], { maxBuffer: 1024 * 1024 * 1024, encoding: 'latin1' }); } catch { try { text = fs.readFileSync(bin, 'latin1'); } catch { } }
    const { union, helpers, error: exErr } = extractZodUnion(text);
    // §4d THE PERMISSION-OUTCOME SENTENCE CENSUS (lane S1 verify r5) — while the dump is still in memory
    {
      const PO = require(path.join(REPO, 'src/permission-outcome.js'));
      const cen = extractPermissionSentences(text);
      oracleOk('§4d the sentence extractor found its anchor (the interrupt marker), the tool_result list and the exact is_error set in the installed bundle (a moved list fails HERE, by name)', !cen.error, cen.error);
      if (!cen.error) {
        console.log(`    §4d permission sentences: anchor ${cen.anchor} · list ${cen.list}() · set ${cen.set} · ${cen.sentences.length} resolved (${cen.sentences.map((x) => x.name).join(',')}) · suffixes ${cen.suffixes.join(',') || '(none)'} · unresolved ${cen.unresolved.join('; ') || '(none)'}`);
        oracleOk(`§4d every member of both lists resolves to ONE sentence (${cen.sentences.length} — the 2.1.281 census is 13 + the user-message marker the set adds)`, cen.unresolved.length === 0 && cen.sentences.length >= 14, cen.unresolved);
        const { unclassified, ghosts } = outcomeCensus(cen.sentences, PO.PERMISSION_OUTCOME_ROWS, text);
        oracleOk(`§4d every sentence the binary writes for a permission outcome is a ROW of src/permission-outcome.js (${cen.sentences.length} checked) — a newer build's extra sentence FAILS HERE, named, until classified`, unclassified.length === 0, 'UNCLASSIFIED: ' + unclassified.join(' · '));
        oracleOk('§4d no GHOST row: every list-backed row is in the binary\'s lists and every literal row is spelled in the bundle (the WebFetch deadline, the conversation-ended and streaming-fallback results)', ghosts.length === 0, 'GHOST: ' + ghosts.join(', '));
        oracleOk('§4d the census names the installed build it was read from (PERMISSION_OUTCOME_CLI_VERSION = SCHEMA_CLI_VERSION)', PO.PERMISSION_OUTCOME_CLI_VERSION === R.SCHEMA_CLI_VERSION, PO.PERMISSION_OUTCOME_CLI_VERSION);
        // NEGATIVE CONTROLS on the real census: one planted sentence is named; one row removed is named
        // the .320 mirror: on a DRIFTED build (newer than every pinned dump) the base census is not clean (new sentences, moved
        // names), so a control that adds or removes ONE row has no clean arithmetic to stand on — it proves nothing. The two
        // negative controls run only on a clean base; elsewhere they SKIP with the drift as the evidence (and on the mirror
        // they are informational like the census itself)
        const cleanBase = unclassified.length === 0 && ghosts.length === 0;
        const ctl = cleanBase ? oracleOk : (n, c, e) => skip(n, 'the base census is not clean on this build — a control over a drifted census proves nothing: ' + JSON.stringify({ unclassified, ghosts }).slice(0, 300));
        const planted = cen.sentences.concat([{ name: 'zz9', from: 'Gd', text: '[Tool call refused: the safety classifier declined it after your approval — a sentence a future build invented]' }]);
        const pv = outcomeCensus(planted, PO.PERMISSION_OUTCOME_ROWS, text);
        ctl('…NEGATIVE CONTROL: the real lists plus ONE planted sentence fail the classification leg naming exactly it', pv.unclassified.length === unclassified.length + 1 && pv.unclassified.some((x) => /^zz9 = .*safety classifier declined it/.test(x)) && pv.ghosts.length === ghosts.length, pv);
        const fewer = PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.id !== 'hL');
        const fv = outcomeCensus(cen.sentences, fewer, text);
        ctl('…NEGATIVE CONTROL: the table without the SUBAGENT\'s denial row (the r5 finding) fails the same leg naming that sentence', fv.unclassified.length === unclassified.length + 1 && fv.unclassified.some((x) => /Permission for this tool use was denied/.test(x)), fv);
        // the extractor's own controls: a synthetic bundle in the 2.1.281 spelling, a reused name elsewhere, a missing anchor / list
        const mini = 'var Jw="[Request interrupted by user]",Ud="[Request interrupted by user for tool use]",ok="[Tool call did not complete: the turn was ended.]",pb="The user doesn\'t want to take this action right now.",u4e=`\nNote: a suffix`;\nvar ok="tengu_worker_owner_rows_killswitch_reused_name";\nvar ww="The user doesn\'t want to proceed with this tool use. Rejected.",Dx=`The user doesn\'t want to proceed with this tool use. The user said:\nfeedback`;\nvar If=new Set([Jw,Ud]);function Gd(){return[ww,Dx,pb,Ud,ok]}function Hd(e){return Gd().some((r)=>n.startsWith(r))}\nvar IS=new Set([Jw,Ud,ok,pb,pb+u4e,ww,ww+u4e]);';
        const mc = extractPermissionSentences(mini);
        ok('§4d the extractor on a synthetic 2.1.281-shaped bundle: names read off the anchor, the LARGEST marker set taken (a two-member If is not the census), the reused `ok` elsewhere ignored (its line declares no other member), a template literal ends at its line, the suffix named, from = Gd | IS | both', !mc.error && mc.list === 'Gd' && mc.set === 'IS' && mc.suffixes.join() === 'u4e' && mc.sentences.length === 6 && mc.sentences.find((x) => x.name === 'ok').text.startsWith('[Tool call did not complete') && mc.sentences.find((x) => x.name === 'Dx').text === "The user doesn't want to proceed with this tool use. The user said:" && mc.sentences.find((x) => x.name === 'Jw').from === 'IS' && mc.sentences.find((x) => x.name === 'Dx').from === 'Gd' && mc.sentences.find((x) => x.name === 'Ud').from === 'both', mc);
        ok('§4d …and a bundle without the anchor / without the list fails BY NAME', /NO ANCHOR/.test(extractPermissionSentences('var x="nothing here";').error) && /NO LIST/.test(extractPermissionSentences('var Ud="[Request interrupted by user for tool use]";').error));
      }
    }
    const nb = nestedOf(text, helpers); // the nested objects, read while the dump is still in memory (lane cli-2-1-307-records)
    // THE REMOTE-TRANSPORT GATE (lane claude-steer-inject r3): inherited_asks_settled is DECLARED_UPSTREAM_UNSEEN because 2.1.312 writes
    // it only behind `reportKept`, and every `reportKept:` the bundle computes is `…isRemoteTransport()&&…` (the stdio transport's
    // isRemoteTransport() is `return!1`) — read off the installed bundle, so a build that drops the gate fails HERE, by name
    {
      const writer = text.includes('subtype:"inherited_asks_settled",kept_request_ids:');
      // every site that COMPUTES reportKept (a bare identifier is the writer's own destructured parameter, `{…,reportKept:y}`)
      const gates = [...text.matchAll(/reportKept:([^,}]{0,160})/g)].map((m) => m[1]).filter((g) => !/^[A-Za-z_$][\w$]*$/.test(g));
      const words = /subtype:[A-Za-z_$][\w$]*\("inherited_asks_settled"\)[^]{0,400}?\.describe\("@internal A cloud worker's report, before its first turn, of which asks it inherited and keeps\. Any ask stored before this event that it does not name is over\."\)/.test(text);
      if (!writer && !/inherited_asks_settled/.test(text)) console.log('    inherited_asks_settled: not in this build (SHAPE_SINCE ' + R.SHAPE_SINCE['system/inherited_asks_settled'] + ')');
      else oracleOk(`inherited_asks_settled is written only behind reportKept, and every reportKept the bundle computes is gated on isRemoteTransport() (${gates.length} site${gates.length === 1 ? '' : 's'}: ${gates.map((g) => g.slice(0, 70)).join(' · ')}) — the stdio stream-json the wrapper speaks never carries it; the record's own words: «A cloud worker's report, before its first turn, of which asks it inherited and keeps»`, writer && words && gates.length >= 1 && gates.every((g) => /\.isRemoteTransport\(\)&&/.test(g)) && /isRemoteTransport\(\)\{return!1\}/.test(text), { writer, words, gates });
    }
    text = '';
    oracleOk('the extractor found the union\'s anchor in the installed bundle (a new spelling fails HERE, by name)', !exErr, exErr);
    const keys = Object.keys(union);
    const sys = keys.filter((k) => k.startsWith('system/')).map((k) => k.slice(7));
    const EXPLICIT = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const recs = keys.filter((k) => !k.startsWith('system/') && ((union[k].includes('uuid') && union[k].includes('session_id')) || EXPLICIT.has(k)));
    const types = [...new Set(recs.map((k) => k.replace(/\/.*$/, '')))];
    let ver = '?'; try { ver = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 }).trim().slice(0, 40); } catch { }
    console.log(`    binary ${bin} (${(size / 1048576).toFixed(0)} MB, ${ver}) · helpers ${helpers.map((h) => h.obj + '/' + h.lit + ' @' + h.anchor).join(', ') || '(none)'} · union ${keys.length} shapes · ${sys.length} system subtypes · ${types.length} stream record types`);
    oracleOk('the extractor read a plausible union (≥ 40 system subtypes, ≥ 25 stream types — the design\'s 2.1.274 census said 51 / 34; this extractor reads 51 / 35 on 2.1.274 and 2.1.280, 52 / 35 on 2.1.281)', sys.length >= 40 && types.length >= 25, { sys: sys.length, types: types.length });
    const missSys = sys.filter((s) => !HANDLED.has(s) && !IGN.has(s) && !(s in UNSEEN.system));
    oracleOk(`every binary system subtype is on exactly one list (${sys.length} checked) — a new one FAILS HERE, named`, missSys.length === 0, 'UNLISTED: ' + missSys.join(', '));
    const missT = types.filter((t) => !cases.has(t) && !IGNT.has(t) && !(t in UNSEEN.types));
    oracleOk(`every binary stream record type is routed, declared-ignored or declared-unseen (${types.length} checked)`, missT.length === 0, 'UNLISTED: ' + missT.join(', '));
    // declared shapes: binary fields − envelope ⊆ known ∪ ignored
    const env = R.ENVELOPES['claude:stream'];
    const undeclared = (u) => {
      const out = [];
      let n = 0;
      for (const k of Object.keys(u)) {
        const shape = 'claude:stream:' + (k === 'result/success' ? 'result' : k);
        const spec = R.SHAPES[shape];
        if (!spec) continue;
        n++;
        for (const f of u[k]) if (!env.has(f) && !spec.known.has(f) && !spec.ignored.has(f) && !R.isOurs(f)) out.push(shape + '.' + f);
      }
      return { viol: out, checked: n };
    };
    const { viol, checked } = undeclared(union);
    oracleOk(`every declared claude stream shape's binary field set ⊆ known ∪ ignored (${checked} shapes, incl. the result union)`, viol.length === 0 && checked >= 60, viol.length ? 'UNDECLARED: ' + viol.join(', ') : { checked });
    // …NEGATIVE CONTROL on the real union: one planted field on one declared shape is named by the same leg
    const planted = { ...union, 'system/init': [...(union['system/init'] || []), 'planted_drift_field'] };
    const pv = undeclared(planted).viol;
    ok('…NEGATIVE CONTROL: the real union with ONE planted field on system/init fails that leg, naming exactly it', pv.length === viol.length + 1 && pv.includes('claude:stream:system/init.planted_drift_field'), pv);
    // …and ONE LEVEL DOWN (lane cli-2-1-307-records): each nested object record-shape judges, read off this binary (nestedOf)
    const nviol = nestedUndeclared(R, nb);
    oracleOk(`every NESTED object's binary field set ⊆ known ∪ ignored (${Object.keys(nb).length} objects: ${Object.keys(nb).join(', ')})`, nviol.length === 0 && Object.keys(nb).length === NESTED_FIELDS.length, nviol.length ? nviol.join(', ') : { objects: Object.keys(nb).length });
    // reverse: no dead list entry, no declared stream shape the binary does not have. A row a NEWER build
    // declared (R.SHAPE_SINCE) is excused on an older installed build — printed, never silent.
    const verCmp = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; };
    const newer = (k) => !!(installed && R.SHAPE_SINCE[k] && verCmp(R.SHAPE_SINCE[k], installed) > 0);
    const excused = Object.keys(R.SHAPE_SINCE).filter(newer);
    if (excused.length) console.log(`    excused as newer than the installed ${installed}: ${excused.map((k) => k + ' (' + R.SHAPE_SINCE[k] + ')').join(', ')}`);
    const bsys = new Set(sys);
    const dead = [...HANDLED, ...IGN, ...Object.keys(UNSEEN.system)].filter((s) => !bsys.has(s) && !(s in R.CORPUS_ONLY_SUBTYPES) && !newer('system/' + s));
    oracleOk('no DEAD system-subtype entry (every list name is in the binary or on CORPUS_ONLY_SUBTYPES with a note)', dead.length === 0, 'DEAD: ' + dead.join(', '));
    const bt = new Set(types);
    const deadT = Object.keys(UNSEEN.types).filter((t) => !bt.has(t) && !newer(t));
    oracleOk('no DEAD declared-unseen top-level type', deadT.length === 0, 'DEAD: ' + deadT.join(', '));
    const bkeys = new Set(keys.map((k) => (k === 'result/success' ? 'result' : k)));
    const ghost = Object.keys(R.SHAPES).filter((s) => s.startsWith('claude:stream:')).map((s) => s.slice(14)).filter((k) => !bkeys.has(k) && !newer(k));
    oracleOk('every declared claude STREAM shape exists in the binary union (no ghost shape)', ghost.length === 0, 'GHOST: ' + ghost.join(', '));
  }
}

console.log('§4b the CLI 2.1.280 pass (2026-09-22): the latency reason told true, the lists moved by corpus evidence');
{
  ok('the 2.1.280 additions keep their notes after the 2.1.281 pass (scratchpad_path / staged_files / no_query_first / decision_reason_code / initiator / narration_hint)', [['system/init', 'scratchpad_path'], ['system/turn_handoff_available', 'staged_files'], ['system/turn_handoff_available', 'no_query_first'], ['system/permission_denied', 'decision_reason_code'], ['user', 'initiator'], ['assistant', 'narration_hint']].every(([k, f]) => /2\.1\.280/.test(R.SHAPES['claude:stream:' + k].ignored.get(f) || '')));
  const res = R.SHAPES['claude:stream:result'];
  const LAT = ['first_stream_post_queue_wait_ms', 'first_stream_post_queued_behind', 'frame_received_wall_ms', 'frame_enqueued_wall_ms', 'turn_started_wall_ms', 'first_text_post_ms', 'first_text_post_wall_ms'];
  ok('the seven 2.1.280 result latency fields are declared ignored, each with a reason that no longer claims a surface shows ttft', LAT.every((f) => res.ignored.has(f) && !/shows ttft/.test(res.ignored.get(f)) && /nothing in VibeSpace reads it/.test(res.ignored.get(f))), LAT.map((f) => res.ignored.get(f)));
  // …and the reason STAYS true: the day a src/ file reads a latency field, this goes red and says to move it to known
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, out); else if (/\.js$/.test(e.name)) out.push(f); } return out; };
  const LAT_RE = new RegExp('\\b(?:ttft_ms|ttft_stream_ms|duration_api_ms|' + LAT.join('|') + ')\\b');
  const readers = walk(path.join(REPO, 'src')).map((f) => path.relative(REPO, f)).filter((f) => f !== 'src/record-shape.js' && LAT_RE.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok('no src/ file reads a latency field (the reason "nothing reads it" is a census, not a claim) — a consumer ⇒ move the field to known', readers.length === 0, readers);
  ok('…NEGATIVE CONTROL: the census regex does catch a reader', LAT_RE.test('const t = raw.first_text_post_ms;') && LAT_RE.test('meta.ttft_ms = r.ttft_ms'));
  const U = R.DECLARED_UPSTREAM_UNSEEN.system, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, IGNT = MM.KNOWN_IGNORED_RECORD_TYPES;
  ok('scheduled_task_fire LEFT declared-upstream-unseen (a transcript row exists) and is KNOWN_IGNORED (card-less)', !('scheduled_task_fire' in U) && IGN.has('scheduled_task_fire'));
  ok('bridge_status is KNOWN_IGNORED and excused on CORPUS_ONLY_SUBTYPES (not in the SDK union — the dead-entry check would otherwise call it dead)', IGN.has('bridge_status') && typeof R.CORPUS_ONLY_SUBTYPES.bridge_status === 'string' && R.CORPUS_ONLY_SUBTYPES.bridge_status.length > 12);
  ok('the /design canvas bookkeeping rows are KNOWN_IGNORED top-level types', ['artifact-autoreact-ledger', 'frame-link', 'artifact-comment-monitor'].every((t) => IGNT.has(t)));
  // the transcript twins the corpus proves: a clean row judges clean, a grown row is drift (the shape is live, not decoration)
  const envT = { parentUuid: 'p', isSidechain: false, isMeta: false, timestamp: '2026-01-01T00:00:00.000Z', uuid: 'u1', userType: 'external', entrypoint: 'cli', cwd: '/w/proj', sessionId: 's', version: '2.1.118', gitBranch: 'main', slug: 'x' };
  ok('transcript system/scheduled_task_fire {content} + the envelope ⇒ no drift', R.unknownFields('claude', 'transcript', { ...envT, type: 'system', subtype: 'scheduled_task_fire', content: 'wakeup' }) === null);
  const grown = R.unknownFields('claude', 'transcript', { ...envT, type: 'system', subtype: 'scheduled_task_fire', content: 'wakeup', cron_id: 'c1' });
  ok('…a scheduled_task_fire row that GREW a field is drift, naming it (negative control)', grown && grown.shape === 'claude:transcript:system/scheduled_task_fire' && grown.fields.join(',') === 'cron_id', grown);
  ok('transcript system/bridge_status {content, url} + the envelope (incl. agentId) ⇒ no drift', R.unknownFields('claude', 'transcript', { ...envT, agentId: 'a1', type: 'system', subtype: 'bridge_status', content: 'banner', url: 'https://example.invalid/x' }) === null);
  const mm = createMessageManager('claude', 'test-shape-280');
  mm.convertHistory([
    { ...envT, uuid: 'st', type: 'system', subtype: 'scheduled_task_fire', content: 'wakeup' },
    { ...envT, uuid: 'bs', agentId: 'a1', type: 'system', subtype: 'bridge_status', content: 'banner', url: 'https://example.invalid/x' },
    { type: 'artifact-autoreact-ledger', v: 1, sessionId: 's', accountUuid: 'acct', artifacts: { a1: {} } },
    { type: 'frame-link', sessionId: 's', path: '/p', frameUrl: 'https://example.invalid/f', title: 't', artifactCount: 2, timestamp: 't' },
    { type: 'artifact-comment-monitor', v: 1, sessionId: 's', artifacts: { a1: {} } },
  ]);
  ok('a history carrying all five renders NO card of any kind (neither unknown-event nor drift)', unknownCards(mm).length === 0 && driftCards(mm).length === 0, mm.messages.map((m) => m.noticeKind));
}

console.log('§4c the CLI 2.1.281 pass (2026-09-23): the pinned build, six fields on three shapes, one new subtype routed to the fall-back card');
{
  ok('2.1.281 stays a PINNED build beside 2.1.288, 2.1.296, 2.1.306, 2.1.307, 2.1.308 and 2.1.312 (SCHEMA_CLI_VERSIONS; SCHEMA_CLI_VERSION = the newest)', R.SCHEMA_CLI_VERSIONS.join() === '2.1.281,2.1.288,2.1.296,2.1.306,2.1.307,2.1.308,2.1.312' && R.SCHEMA_CLI_VERSION === '2.1.312', R.SCHEMA_CLI_VERSIONS);
  const ADDED = [['system/init', 'per_turn_effort_active'], ['system/init', 'view_mode'], ['assistant', 'local_command_outcome'], ['conversation_reset', 'trigger'], ['conversation_reset', 'user_message_uuid'], ['conversation_reset', 'timestamp']];
  ok('the six fields 2.1.281 added are declared IGNORED (never known — known is the 2.1.274 dump), each with a reason naming the build', ADDED.every(([k, f]) => { const sp = R.SHAPES['claude:stream:' + k]; return !sp.known.has(f) && /2\.1\.281/.test(sp.ignored.get(f) || '') && sp.ignored.get(f).length > 60; }), ADDED.map(([k, f]) => k + '.' + f + ' = ' + R.SHAPES['claude:stream:' + k].ignored.get(f)));
  const pte = R.SHAPES['claude:stream:system/per_turn_effort_changed'];
  ok('system/per_turn_effort_changed has a shape row (its own 2.1.281 declaration) and SHAPE_SINCE names the build', pte && [...pte.known].join() === 'per_turn_effort_active' && R.SHAPE_SINCE['system/per_turn_effort_changed'] === '2.1.281');
  // lane session-title-record (B-fbef): 2.1.288 names the session itself — both carriers pinned, the build named, card-less
  const stc = R.SHAPES['claude:stream:system/session_title_changed'], stt = R.SHAPES['claude:transcript:system/session_title_changed'];
  ok(stc && stt && [...stc.known].join() === 'title' && [...stt.known].join() === 'title' && R.SHAPE_SINCE['system/session_title_changed'] === '2.1.288' && MM.KNOWN_IGNORED_SYSTEM_SUBTYPES.has('session_title_changed') && !MM.HANDLED_SYSTEM_SUBTYPES.has('session_title_changed'),
    'system/session_title_changed: stream + transcript rows ({title}), SHAPE_SINCE 2.1.288, KNOWN_IGNORED (session-brain owns it: the name ladder\'s CLI-title rung)');
  const recLive = { type: 'system', subtype: 'session_title_changed', title: 'Fix the login', uuid: 'u1', session_id: 's1' };
  const recJsonl = { parentUuid: 'p', isSidechain: false, userType: 'external', cwd: '/w', sessionId: 's1', version: '2.1.288', gitBranch: 'main', type: 'system', subtype: 'session_title_changed', title: 'Fix the login', uuid: 'u2', timestamp: '2026-10-05T00:00:00Z' };
  ok(R.shapeKeyOf('claude', 'stream', recLive) === 'claude:stream:system/session_title_changed' && R.shapeKeyOf('claude', 'transcript', recJsonl) === 'claude:transcript:system/session_title_changed' && R.unknownFields('claude', 'stream', recLive) === null && R.unknownFields('claude', R.carrierOf('claude', recJsonl), recJsonl) === null && R.unknownFields('claude', 'stream', { ...recLive, emoji: 'x' })?.fields.join() === 'emoji', 'the measured 2.1.288 record (live + JSONL envelope) is clean; a field it grows is still named (the pin is strict)');
  const U = R.DECLARED_UPSTREAM_UNSEEN.system, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, H = MM.HANDLED_SYSTEM_SUBTYPES;
  ok('…and sits on DECLARED_UPSTREAM_UNSEEN with a disposition that names the COST (neither handled nor ignored — a user may need to see it)', 'per_turn_effort_changed' in U && /cache/.test(U.per_turn_effort_changed) && !IGN.has('per_turn_effort_changed') && !H.has('per_turn_effort_changed'));
  const mm = createMessageManager('claude', 'test-shape-281');
  mm.processLive({ type: 'system', subtype: 'per_turn_effort_changed', per_turn_effort_active: false, uuid: 'u-pte', session_id: 's' });
  ok('a live per_turn_effort_changed renders the fall-back Unknown-event card — and no drift card on top of it', unknownCards(mm).length === 1 && driftCards(mm).length === 0, mm.messages.map((m) => m.noticeKind));
  const mi = createMessageManager('claude', 'test-shape-281-init');
  mi.processLive({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 's', uuid: 'u-i', tools: [], mcp_servers: [], model: 'claude-fable-5-1', permissionMode: 'default', slash_commands: [], apiKeySource: 'none', claude_code_version: '2.1.281', output_style: 'default', skills: [], plugins: [], per_turn_effort_active: true, view_mode: 'default' });
  ok('a 2.1.281 init carrying per_turn_effort_active + view_mode is clean (no drift card)', driftCards(mi).length === 0 && unknownCards(mi).length === 0, mi.messages.map((m) => m.noticeKind));
  const mj = createMessageManager('claude', 'test-shape-281-init2');
  mj.processLive({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 's-281-near', uuid: 'u-j', model: 'claude-fable-5-1', view_mode: 'focus', per_turn_effort_mode: 'x' });
  ok('…NEGATIVE CONTROL: a near-miss name (per_turn_effort_mode) is still drift, named (a card AND a ledger row)', driftCards(mj).length === 1 && driftCards(mj)[0].content[0].fields.join() === 'per_turn_effort_mode' && ledgerOf('s-281-near').length === 1 && ledgerOf('s-281-near')[0].fields.join() === 'per_turn_effort_mode', { cards: driftCards(mj).map((m) => m.content[0].fields), rows: ledgerOf('s-281-near') });
}

console.log('§4e the PINNED dumps (lane cli-2-1-288-records, B-e05e): every build in SCHEMA_CLI_VERSIONS judged from its tracked dump — no binary needed');
{
  const HANDLED = MM.HANDLED_SYSTEM_SUBTYPES, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, IGNT = MM.KNOWN_IGNORED_RECORD_TYPES;
  const routeSrc = read('src/message-manager.js');
  const routeBody = routeSrc.slice(routeSrc.indexOf('_routeMessage(raw, emit) {'), routeSrc.indexOf('_processTombstone(raw, emit) {'));
  const cases = new Set([...routeBody.matchAll(/case '([a-z_-]+)':/g)].map((m) => m[1]));
  const vcmp = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; };
  const dumpOf = (v) => { try { return JSON.parse(read('scripts/fixtures/claude-cli/' + v + '.json')); } catch { return null; } };
  /** PURE: one pinned build's dump vs the declarations (R-shaped) — the §4 legs, expecting the rows of THAT build. */
  const judgeDump = (Rx, dump) => {
    const v = dump.version, union = dump.union, UNSEEN = Rx.DECLARED_UPSTREAM_UNSEEN;
    const keys = Object.keys(union);
    const sys = keys.filter((k) => k.startsWith('system/')).map((k) => k.slice(7));
    const EXPLICIT = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const types = [...new Set(keys.filter((k) => !k.startsWith('system/') && ((union[k].includes('uuid') && union[k].includes('session_id')) || EXPLICIT.has(k))).map((k) => k.replace(/\/.*$/, '')))];
    const newer = (k) => !!(Rx.SHAPE_SINCE[k] && vcmp(Rx.SHAPE_SINCE[k], v) > 0);
    const out = [];
    for (const s of sys) if (!HANDLED.has(s) && !IGN.has(s) && !(s in UNSEEN.system)) out.push('UNLISTED system/' + s);
    for (const t of types) if (!cases.has(t) && !IGNT.has(t) && !(t in UNSEEN.types)) out.push('UNLISTED ' + t);
    const env = Rx.ENVELOPES['claude:stream'];
    for (const k of keys) { const spec = Rx.SHAPES['claude:stream:' + (k === 'result/success' ? 'result' : k)]; if (spec) for (const f of union[k]) if (!env.has(f) && !spec.known.has(f) && !spec.ignored.has(f) && !Rx.isOurs(f)) out.push('UNDECLARED ' + k + '.' + f); }
    const bsys = new Set(sys);
    for (const s of [...HANDLED, ...IGN, ...Object.keys(UNSEEN.system)]) if (!bsys.has(s) && !(s in Rx.CORPUS_ONLY_SUBTYPES) && !newer('system/' + s)) out.push('DEAD system/' + s);
    const bkeys = new Set(keys.map((k) => (k === 'result/success' ? 'result' : k)));
    for (const s of Object.keys(Rx.SHAPES).filter((x) => x.startsWith('claude:stream:')).map((x) => x.slice(14))) if (!bkeys.has(s) && !newer(s)) out.push('GHOST ' + s);
    for (const [k, since] of Object.entries(Rx.SHAPE_SINCE)) if (vcmp(since, v) <= 0 && !bkeys.has(k)) out.push('SINCE-WRONG ' + k + ' (' + since + ' but not in ' + v + ')');
    return out;
  };
  /** PURE: a row a pinned build ADDED (absent from the oldest pinned dump) must name its build — SHAPE_SINCE, a pinned version whose dump has it. */
  const versionless = (Rx, dumps) => {
    const oldest = new Set(Object.keys(dumps[0].union).map((k) => (k === 'result/success' ? 'result' : k)));
    const bad = [];
    const rows = new Set(Object.keys(Rx.SHAPES).filter((x) => x.startsWith('claude:stream:')).map((x) => x.slice(14)));
    for (const s of [...HANDLED, ...IGN, ...Object.keys(Rx.DECLARED_UPSTREAM_UNSEEN.system)]) if (!(s in Rx.CORPUS_ONLY_SUBTYPES)) rows.add('system/' + s);
    for (const k of rows) {
      if (oldest.has(k)) continue;
      const since = Rx.SHAPE_SINCE[k];
      const d = since && dumps.find((x) => x.version === since);
      if (!since || !Rx.SCHEMA_CLI_VERSIONS.includes(since) || !d || !(k in d.union)) bad.push(k + (since ? ' (since ' + since + ' — not a pinned dump that has it)' : ' (no SHAPE_SINCE)'));
    }
    return bad;
  };
  const dumps = R.SCHEMA_CLI_VERSIONS.map(dumpOf);
  ok('every pinned build has its TRACKED dump (scripts/fixtures/claude-cli/<version>.json), taken by the oracle\'s own method', dumps.every((d, i) => d && d.version === R.SCHEMA_CLI_VERSIONS[i] && /^strings -n 8 .*extractZodUnion/.test(d.method) && Object.keys(d.union).length >= 150), dumps.map((d) => d && [d.version, Object.keys(d.union).length]));
  if (dumps.every(Boolean)) {
    for (const d of dumps) { const v = judgeDump(R, d); ok(`${d.version}: every subtype / stream type listed, every field declared, no dead entry, no ghost shape (the rows of THAT build; SHAPE_SINCE excuses the newer ones)`, v.length === 0, v); }
    const vl = versionless(R, dumps);
    ok('every row newer than the oldest pinned build names its build (SHAPE_SINCE ∈ SCHEMA_CLI_VERSIONS, in that build\'s dump)', vl.length === 0, vl);
    // CONTROLS on in-memory patched copies
    const noSince = { ...R, SHAPE_SINCE: Object.fromEntries(Object.entries(R.SHAPE_SINCE).filter(([k]) => k !== 'system/ui_toast')) };
    const ns = versionless(noSince, dumps), ns281 = judgeDump(noSince, dumps[0]);
    ok('CONTROL: a copy declaring ui_toast WITHOUT a version goes red, naming it (version-less row, and DEAD + GHOST on the 2.1.281 dump)', ns.length === 1 && /^system\/ui_toast \(no SHAPE_SINCE\)/.test(ns[0]) && ns281.join() === 'DEAD system/ui_toast,GHOST system/ui_toast', { ns, ns281 });
    const no288 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_288[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_288[k]))) } : sp])) };
    const n288 = judgeDump(no288, dumps[1]);
    ok('CONTROL: a copy without FIELDS_288 is red on the 2.1.288 dump (23 fields named) and still green on 2.1.281', n288.length === 23 && n288.every((x) => x.startsWith('UNDECLARED ')) && judgeDump(no288, dumps[0]).length === 0, n288.length);
    // the §4d sentences of each pinned build: all resolved, each a row of the table
    const PO = require(path.join(REPO, 'src/permission-outcome.js'));
    for (const d of dumps) { const c = outcomeCensus(d.sentences.rows || [], PO.PERMISSION_OUTCOME_ROWS, ''); ok(`${d.version}: §4d ${(d.sentences.rows || []).length} permission sentences, none unresolved, each a row of src/permission-outcome.js`, (d.sentences.rows || []).length === 14 && d.sentences.unresolved.length === 0 && c.unclassified.length === 0, { unresolved: d.sentences.unresolved, c: c.unclassified }); }
    const texts = (d) => JSON.stringify(d.sentences.rows.map((x) => x.text).sort());
    ok('§4d 2.1.281 → 2.1.288 → 2.1.296 → 2.1.306 → 2.1.307 → 2.1.308 → 2.1.312: the same sentences (none added, none vanished — no row needs `until`), PERMISSION_OUTCOME_CLI_VERSION 2.1.312 (the newest pinned)', dumps.every((d) => texts(d) === texts(dumps[0])) && PO.PERMISSION_OUTCOME_CLI_VERSION === '2.1.312' && PO.PERMISSION_OUTCOME_CLI_VERSION === R.SCHEMA_CLI_VERSION);
    // THE EIGHT DECISIONS, each on its evidence (the dump's zod literal)
    const z = dumps[1].zod || {};
    const EIGHT = ['session_metadata', 'instruction_size_warning', 'ui_invalidate', 'ui_log', 'ui_toast', 'ui_status', 'ui_scroll', 'ui_focus'];
    ok('the eight 2.1.288 subtypes: a zod literal in the dump, a stream shape row, SHAPE_SINCE 2.1.288', EIGHT.every((s) => typeof z['system/' + s] === 'string' && z['system/' + s].includes('subtype:R("' + s + '")') && R.SHAPES['claude:stream:system/' + s] && R.SHAPE_SINCE['system/' + s] === '2.1.288'), EIGHT.filter((s) => !z['system/' + s]));
    ok('instruction_size_warning is HANDLED (the dim notice); the other seven are KNOWN_IGNORED (card-less) — none left for the red card', HANDLED.has('instruction_size_warning') && !IGN.has('instruction_size_warning') && EIGHT.filter((s) => s !== 'instruction_size_warning').every((s) => IGN.has(s) && !HANDLED.has(s)));
    ok('ui_toast evidence: its zod object is {plugin, text, timeout_ms} only — no level / severity, so no error-class toast exists to surface', (dumps[1].union['system/ui_toast'] || []).filter((f) => f !== 'uuid' && f !== 'session_id').join() === 'plugin,text,timeout_ms' && !/level|severity|error/.test(z['system/ui_toast'].replace(/describe\("[^"]*"\)/g, '')));
    ok('session_metadata evidence: metadata carries artifacts only (no model / cwd / version for the status bar)', /metadata:u\(\{artifacts:/.test(z['system/session_metadata'] || '') && !/model|cwd|version/.test(z['system/session_metadata'] || ''));
    // THE 2.1.296 PIN (lane record-oracle-2-1-296) — each decision on the dump's zod literal
    const d296 = dumps.find((d) => d.version === '2.1.296'), d288 = dumps.find((d) => d.version === '2.1.288');
    const z6 = d296.zod || {};
    const no296 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_296[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_296[k]))) } : sp])) };
    const n296 = judgeDump(no296, d296);
    ok('CONTROL: a copy without FIELDS_296 is red on the 2.1.296 dump (18 fields named, result/success\'s twin included) and still green on 2.1.288', n296.filter((x) => x.startsWith('UNDECLARED ')).length === n296.length && new Set(n296.map((x) => x.replace('result/success.', 'result.'))).size === 18 && judgeDump(no296, d288).length === 0, n296);
    const f296 = Object.entries(R.FIELDS_296).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_296: 18 fields on ten shapes, each IGNORED with a one-line reason naming 2.1.296 (no reader in the tree), never known', f296.length === 18 && new Set(f296.map(([k]) => k)).size === 10 && f296.every(([k, f, note]) => typeof note === 'string' && /2\.1\.296/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f296.filter(([k, f, n]) => !/2\.1\.296/.test(n || '')));
    const lit = (st) => z6['system/' + st] || '';
    ok('the two 2.1.296 subtypes: a zod literal in the dump (helpers read off the anchor), a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.296', ['permission_check_status', 'file_attachments_missing'].every((st) => lit(st).includes('subtype:A("' + st + '")') && R.SHAPE_SINCE['system/' + st] === '2.1.296' && [...R.SHAPES['claude:stream:system/' + st].known].join() === d296.union['system/' + st].filter((f) => f !== 'uuid' && f !== 'session_id').join()));
    ok('permission_check_status is KNOWN_IGNORED (card-less): its literal is {tool_use_id, agent_id?, status: checking|done} — a pulse with no words for any card', IGN.has('permission_check_status') && !HANDLED.has('permission_check_status') && /status:U\(\["checking","done"\]\)/.test(lit('permission_check_status')) && !/text:|message:|content:/.test(lit('permission_check_status').replace(/describe\("[^"]*"\)/g, '')) && [...R.SHAPES['claude:stream:system/permission_check_status'].enums.status].join() === 'checking,done');
    ok('file_attachments_missing is HANDLED (a plain dim line): its literal names the files that did not arrive — missing[{file_uuid, reason}] + sent_count', HANDLED.has('file_attachments_missing') && !IGN.has('file_attachments_missing') && /missing:T\(u\(\{file_uuid:/.test(lit('file_attachments_missing')) && /reason:o\(\)/.test(lit('file_attachments_missing')) && /sent_count:E\(\)/.test(lit('file_attachments_missing')));
    // the three hook ATTACHMENT payloads (no uuid / session_id — never a stream record type): each classified on its literal
    const nonRec = Object.keys(z6).filter((k) => !k.startsWith('system/'));
    ok('every non-system zod key of the 2.1.296 dump is an attachment payload on ATTACHMENT_PAYLOADS (async_hook_response, hook_additional_context, hook_success) — none is a stream record (no uuid / session_id)', nonRec.sort().join() === 'async_hook_response,hook_additional_context,hook_success' && nonRec.every((k) => k in R.ATTACHMENT_PAYLOADS && z6[k].includes('type:A("' + k + '")') && !(d296.union[k] || []).includes('uuid')), nonRec);
    const mmSrc6 = read('src/message-manager.js');
    const attBody = mmSrc6.slice(mmSrc6.indexOf('_processAttachment(raw, emit) {'), mmSrc6.indexOf('_processUser(raw, emit) {'));
    ok('…the two KNOWN ones name a reader that exists (_processAttachment branches on hook_success / hook_additional_context); async_hook_response is IGNORED and no branch reads it', /^known — message-manager _processAttachment/.test(R.ATTACHMENT_PAYLOADS.hook_success) && /^known — message-manager _processAttachment/.test(R.ATTACHMENT_PAYLOADS.hook_additional_context) && attBody.includes("a.type === 'hook_success'") && attBody.includes("a.type === 'hook_additional_context'") && /^ignored — /.test(R.ATTACHMENT_PAYLOADS.async_hook_response) && !attBody.includes('async_hook_response'));
    // THE 2.1.306 PIN (lane cli-2-1-306-records, B-42ed) — the zod diff 2.1.296 → 2.1.306 (the npm package's linux-x64 binary in a scratch
    // prefix, dumped STATIC), each decision on the dump
    const d306 = dumps.find((d) => d.version === '2.1.306');
    const z306 = d306.zod || {};
    const shapeOf = (k) => 'claude:stream:' + (k === 'result/success' ? 'result' : k);
    const no306 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_306[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_306[k]))) } : sp])) };
    const n306 = judgeDump(no306, d306);
    ok('CONTROL: a copy without FIELDS_306 is red on the 2.1.306 dump (21 fields named, result/success\'s twins included) and still green on 2.1.296', n306.length > 0 && n306.every((x) => x.startsWith('UNDECLARED ')) && new Set(n306.map((x) => x.replace('result/success.', 'result.'))).size === 21 && judgeDump(no306, d296).length === 0, n306);
    const f306 = Object.entries(R.FIELDS_306).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_306: 21 fields on eight shapes, each IGNORED with a one-line reason naming 2.1.306 (no reader in the tree), never known', f306.length === 21 && new Set(f306.map(([k]) => k)).size === 8 && f306.every(([k, f, note]) => typeof note === 'string' && /2\.1\.306/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f306.filter(([k, f, n]) => !/2\.1\.306/.test(n || '')));
    const grown = [...new Set(Object.keys(d306.union).filter((k) => k in d296.union && R.SHAPES[shapeOf(k)]).flatMap((k) => d306.union[k].filter((f) => !d296.union[k].includes(f)).map((f) => shapeOf(k) + '.' + f)))].sort();
    ok('…and they ARE the dump diff, computed: every field 2.1.306 added to a declared stream shape (its dump minus the 2.1.296 dump) is a FIELDS_306 row, and no row lies outside it', JSON.stringify(grown) === JSON.stringify(f306.map(([k, f]) => k + '.' + f).sort()), { grown, rows: f306.map(([k, f]) => k + '.' + f).sort() });
    const EXPLICIT6 = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const sysOf = (d) => Object.keys(d.union).filter((k) => k.startsWith('system/')).sort().join();
    const recsOf = (d) => [...new Set(Object.keys(d.union).filter((k) => !k.startsWith('system/') && ((d.union[k].includes('uuid') && d.union[k].includes('session_id')) || EXPLICIT6.has(k))).map((k) => k.replace(/\/.*$/, '')))].sort().join();
    ok('2.1.306 adds no system subtype and no stream record type (the 2.1.296 sets exactly) — no SHAPE_SINCE row, no list decision; nothing is left red', sysOf(d306) === sysOf(d296) && recsOf(d306) === recsOf(d296) && !Object.values(R.SHAPE_SINCE).includes('2.1.306'), { sys: sysOf(d306).split(',').length, recs: recsOf(d306).split(',').length });
    // the two new zod keys: the items of task_progress.workflow_progress (CORPUS_KNOWN — the live Workflow card), now with a schema
    const nonRec6 = Object.keys(z306).filter((k) => !k.startsWith('system/')).sort();
    ok('every non-system zod key of the 2.1.306 dump is a workflow_progress ITEM on WORKFLOW_PROGRESS_ITEMS (workflow_agent, workflow_phase) — none is a stream record (no uuid / session_id), neither a 2.1.296 key', nonRec6.join() === 'workflow_agent,workflow_phase' && nonRec6.every((k) => /^known — /.test(R.WORKFLOW_PROGRESS_ITEMS[k] || '') && z306[k].includes('type:A("' + k + '")') && !(d306.union[k] || []).includes('uuid') && !(k in d296.union)), nonRec6);
    const readsOf = (seg) => [...new Set([...seg.matchAll(/\be\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).filter((f) => f !== 'type'))];
    const cut = (s, a, b) => { const i = s.indexOf(a), j = b ? s.indexOf(b, i + 1) : s.length; return i < 0 || j < 0 ? '' : s.slice(i, j); };
    const mmW = read('src/message-manager.js'), ssW = read('src/routes/sessions.js');
    const nwp = cut(mmW, 'function normalizeWorkflowProgress(list) {', 'function unknownRecordJson(raw) {'), nws = cut(ssW, 'function normalizeWorkflowSnapshot(o, runId) {', 'const phases = ordered');
    const READ = {
      workflow_phase: [...new Set([...readsOf(cut(nwp, "e.type === 'workflow_phase'", "e.type === 'workflow_agent'")), ...readsOf(cut(nws, "e.type === 'workflow_phase'", "e.type !== 'workflow_agent'"))])],
      workflow_agent: [...new Set([...readsOf(cut(nwp, "e.type === 'workflow_agent'", 'if (!phases.length')), ...readsOf(cut(nws, "e.type !== 'workflow_agent'", null))])],
    };
    const undeclaredReads = (reads) => Object.entries(reads).flatMap(([k, fs]) => fs.filter((f) => !(d306.union[k] || []).includes(f)).map((f) => k + '.' + f));
    ok(`the Workflow card's two readers (message-manager normalizeWorkflowProgress, routes/sessions normalizeWorkflowSnapshot) read ONLY fields the 2.1.306 literal declares — phase {${READ.workflow_phase.join(', ')}}, agent {${READ.workflow_agent.join(', ')}}`, READ.workflow_phase.length >= 2 && READ.workflow_agent.length >= 10 && undeclaredReads(READ).length === 0, undeclaredReads(READ));
    const plantedRead = undeclaredReads({ ...READ, workflow_agent: READ.workflow_agent.concat(['progressPct']) });
    ok('…CONTROL: a reader taking an invented field (workflow_agent.progressPct) is named by the same leg', plantedRead.join() === 'workflow_agent.progressPct', plantedRead);
    const wfState = /state:F\(\[([^\]]*)\]\)/.exec(z306.workflow_agent || ''), wfWorking = /const WF_WORKING_STATES = new Set\(\[([^\]]*)\]\)/.exec(read('src/lib/chat-renderers.js'));
    ok('workflow_agent.state is the literal\'s start | progress | done | error, and the card\'s working words (chat-renderers WF_WORKING_STATES) hold both working values — start and progress draw as running', !!wfState && wfState[1] === '"start","progress","done","error"' && !!wfWorking && /'start'/.test(wfWorking[1]) && /'progress'/.test(wfWorking[1]), { state: wfState && wfState[1], working: wfWorking && wfWorking[1] });
    // §4d THE MOVED NAME — the B-42ed mirror's «GHOST: Dx (Gd)»: the feedback sentence still sits on the tool_result list (2.1.296 vD,
    // 2.1.306 D0) but its template literal now OPENS its line; the extractor reads the whole declaration and resolves it
    const dxRow = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'Dx');
    const s296 = d296.sentences.rows.find((x) => x.text === dxRow.text), s306 = d306.sentences.rows.find((x) => x.text === dxRow.text);
    ok('§4d the MOVED name: the Dx row\'s sentence (2.1.296 vD) is 2.1.306\'s D0, on the tool_result list, resolved — 14 sentences, none unresolved, the row unchanged, no GHOST', !!s296 && s296.name === 'vD' && !!s306 && s306.name === 'D0' && s306.from === 'Gd' && d306.sentences.rows.length === 14 && d306.sentences.unresolved.length === 0 && outcomeCensus(d306.sentences.rows, PO.PERMISSION_OUTCOME_ROWS, '').unclassified.length === 0, { s296, s306 });
    const mini306 = 'var x9n="Tool loaded.";function t2(e){if(_f())return e+Gbt;return e}var D0=`The user doesn\'t want to proceed with this tool use. The user said:\n`,n2="Permission for this tool use was denied. Try a different approach.",ep="[Request interrupted by user for tool use]",bT="The user doesn\'t want to take this action right now.",_T="[Request interrupted by user]";\nvar D0=p(()=>u({hookEventName:A("SubagentStart")}));function wp(){return[D0,n2,ep,bT]}\nvar Ur=new Set([_T,ep,bT,bT+Gbt,D0]);';
    const m6 = extractPermissionSentences(mini306), d0 = m6.sentences && m6.sentences.find((x) => x.name === 'D0');
    ok('the extractor on a synthetic 2.1.306-shaped chunk: D0\'s template ends its line (no other member there), the next member follows its closing backtick ⇒ resolved, its value ending at the line ("…The user said:"); the reused D0=p(…) ignored', !m6.error && m6.list === 'wp' && m6.set === 'Ur' && m6.unresolved.length === 0 && m6.sentences.length === 5 && !!d0 && d0.text === "The user doesn't want to proceed with this tool use. The user said:" && d0.from === 'both', m6);
    const dumpSrc = read('scripts/claude-cli-dump.mjs');
    const DECL = dumpSrc.split('\n').filter((l) => l.startsWith('  const declOf = (at) => {'));
    const Mx = mutantCopies('record-extractor', REPO);
    const lineOnly = DECL.length === 1 ? await import(pathToFileURL(Mx.write('scripts/claude-cli-dump.mjs', dumpSrc.replace(DECL[0], '  const declOf = (at) => { const [a, b] = lineOf(at); return text.slice(a, b); };'), 'line-only')).href) : null;
    const lo = lineOnly && lineOnly.extractPermissionSentences(mini306);
    const loGhost = lo && outcomeCensus(lo.sentences, [{ id: 'Dx', binary: 'Gd', text: d0 ? d0.text : '?' }], '').ghosts;
    ok('RED CONTROL: a copy of the extractor judging the LINE alone (the pre-lane rule) leaves D0 unresolved and the row a GHOST — «GHOST: Dx (Gd)», the mirror\'s red', DECL.length === 1 && !!lo && lo.unresolved.length === 1 && /^D0 \(0 candidate/.test(lo.unresolved[0]) && loGhost.join() === 'Dx (Gd)', { decl: DECL.length, unresolved: lo && lo.unresolved, loGhost });
    // THE 2.1.307 PIN (lane cli-2-1-307-records) — the hub's claude AUTO-UPDATED to 2.1.307 (2026-10-21): its dump (strings over a 0644
    // copy, never run as a session) minus the 2.1.306 dump, each decision on the dump
    const d307 = dumps.find((d) => d.version === '2.1.307');
    const z307 = d307.zod || {};
    const [, lit7] = (/^([^/]+)\/([^ ]+) @/.exec(d307.helpers[0] || '') || []).slice(1);
    const no307 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_307[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_307[k]))) } : sp])) };
    const n307 = judgeDump(no307, d307);
    ok('CONTROL: a copy without FIELDS_307 is red on the 2.1.307 dump (3 fields named) and still green on 2.1.306', n307.length === 3 && n307.every((x) => x.startsWith('UNDECLARED ')) && judgeDump(no307, d306).length === 0, n307);
    const f307 = Object.entries(R.FIELDS_307).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_307: 3 fields on two shapes (user, command_lifecycle), each IGNORED with a one-line reason naming 2.1.307 (no reader in the tree), never known', f307.length === 3 && new Set(f307.map(([k]) => k)).size === 2 && f307.every(([k, f, note]) => typeof note === 'string' && /2\.1\.307/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f307.filter(([k, f, n]) => !/2\.1\.307/.test(n || '')));
    const grown7 = [...new Set(Object.keys(d307.union).filter((k) => k in d306.union && R.SHAPES[shapeOf(k)]).flatMap((k) => d307.union[k].filter((f) => !d306.union[k].includes(f)).map((f) => shapeOf(k) + '.' + f)))].sort();
    ok('…and they ARE the dump diff, computed: every field 2.1.307 added to a declared stream shape (its dump minus the 2.1.306 dump) is a FIELDS_307 row, and no row lies outside it', JSON.stringify(grown7) === JSON.stringify(f307.map(([k, f]) => k + '.' + f).sort()), { grown7, rows: f307.map(([k, f]) => k + '.' + f).sort() });
    ok('2.1.307 adds no system subtype and no stream record type (the 2.1.306 sets exactly) — no SHAPE_SINCE row, no KNOWN_IGNORED decision; nothing is left red', sysOf(d307) === sysOf(d306) && recsOf(d307) === recsOf(d306) && !Object.values(R.SHAPE_SINCE).includes('2.1.307'), { sys: sysOf(d307).split(',').length, recs: recsOf(d307).split(',').length });
    // the one new zod key: a transcript ATTACHMENT payload (no uuid / session_id — never a stream record type), classified on its literal
    const nonRec7 = Object.keys(z307).filter((k) => !k.startsWith('system/')).sort();
    ok('the one non-system zod key of the 2.1.307 dump is an attachment payload on ATTACHMENT_PAYLOADS — projects_thread_ask {call, after, deliveredAt, messageId}, IGNORED: no uuid / session_id (not a stream record), not a 2.1.306 key, and no _processAttachment branch reads it', !!lit7 && nonRec7.join() === 'projects_thread_ask' && z307.projects_thread_ask.includes('type:' + lit7 + '("projects_thread_ask")') && (d307.union.projects_thread_ask || []).join() === 'call,after,deliveredAt,messageId' && !('projects_thread_ask' in d306.union) && /^ignored — \(2\.1\.307\)/.test(R.ATTACHMENT_PAYLOADS.projects_thread_ask || '') && !attBody.includes('projects_thread_ask'), { nonRec7, lit7 });
    const same14 = d306.sentences.rows.every((r) => d307.sentences.rows.some((x) => x.text === r.text && x.from === r.from));
    ok('§4d 2.1.307: the same 14 sentences on the same lists, only RENAMED (anchor ' + d306.sentences.anchor + ' → ' + d307.sentences.anchor + ', list ' + d306.sentences.list + ' → ' + d307.sentences.list + ', set ' + d306.sentences.set + ' → ' + d307.sentences.set + ') — no row moves list, none needs `until`', same14 && d307.sentences.rows.length === 14 && d307.sentences.unresolved.length === 0 && d307.sentences.anchor !== d306.sentences.anchor, d307.sentences.rows.map((x) => x.name + ':' + x.from));
    // the frames 2.1.307 writes, through the REAL normalizer — and the drift card they drew before this pin (a copy without FIELDS_307)
    const SID7 = 'e2e00000-0000-4000-8000-0000000003a7';
    const live7 = (MMx, conv) => {
      const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv);
      x.processLive({ type: 'command_lifecycle', command_uuid: 'c-307-1', state: 'started', wakeup_source: 'loop_wakeup', scheduled_for: 1792636800000, uuid: 'u-307-1', session_id: conv });
      x.processLive({ type: 'command_lifecycle', command_uuid: 'c-307-2', state: 'started', wakeup_source: 'schedule_wakeup', uuid: 'u-307-2', session_id: conv });
      const before = x.messages.length;
      x.processLive({ type: 'attachment', attachment: { type: 'projects_thread_ask', call: { name: 'ask', id: 'toolu_307', input: {} }, after: 'u-307-2', deliveredAt: 1792636800000, messageId: 'msg_307' }, uuid: 'u-307-3', session_id: conv });
      const cards = driftCards(x);
      return { cards: cards.length, fields: cards.flatMap((m) => m.content[0].fields).sort().join(), rows: ledgerOf(conv, MMx).length, attachmentMsgs: x.messages.length - before, all: x.messages.length };
    };
    const real7 = live7(MM, SID7);
    ok('the REAL normalizer on 2.1.307\'s frames: a scheduler fire\'s command_lifecycle (wakeup_source loop_wakeup + scheduled_for, schedule_wakeup) and a projects_thread_ask attachment ⇒ no drift card, no ledger row, no message at all', real7.cards === 0 && real7.rows === 0 && real7.all === 0 && real7.attachmentMsgs === 0, real7);
    const M7 = mutantCopies('record-307', REPO);
    const FILL7 = 'for (const [key, fields] of Object.entries(FIELDS_307)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);';
    const rsSrc7 = read('src/record-shape.js'), mmSrc7 = read('src/message-manager.js'), REQ7 = "require('./record-shape.js')";
    const MM7 = rsSrc7.split(FILL7).length === 2 && mmSrc7.split(REQ7).length === 2 ? require(M7.write('src/message-manager.js', mmSrc7.replace(REQ7, 'require(' + JSON.stringify(M7.write('src/record-shape.js', rsSrc7.replace(FILL7, '/* FIELDS_307 not filled (control) */'), 'no-307')) + ')'), 'mm-no-307')) : null;
    const ctl7 = MM7 && live7(MM7, SID7.replace(/a7$/, 'a8'));
    ok('RED CONTROL: the same frames on a copy without FIELDS_307 (the .340 tree on 2.1.307) ⇒ the red card is back — ONE drift card on command_lifecycle naming scheduled_for + wakeup_source, and its ledger row; the attachment still draws nothing', !!ctl7 && ctl7.cards === 1 && ctl7.fields === 'scheduled_for,wakeup_source' && ctl7.rows === 1 && ctl7.attachmentMsgs === 0, ctl7);
    // THE NESTED OBJECTS (lane cli-2-1-307-records) — the union is depth-1, so a field a build added INSIDE rate_limit_info never
    // reached a leg: 2.1.296's rate_limit_info.overageEnabled drew a live red card on every rate-limited conversation (the owner's
    // telemetry: harness-shape-drift «rate_limit_event +{rate_limit_info.overageEnabled} · cli 2.1.296»). From 2.1.307 on the dump
    // carries `nested` (scripts/claude-cli-dump.mjs nestedOf), judged here with no binary.
    const declaredNested = Object.entries(R.SHAPES).filter(([k]) => k.startsWith('claude:stream:')).flatMap(([k, sp]) => Object.keys(sp.nested).map((f) => k.slice(14) + '.' + f)).sort();
    ok(`census: the nested objects src/record-shape.js judges on a claude stream shape are exactly the ones nestedOf reads off a binary (NESTED_FIELDS, ${NESTED_FIELDS.length}) plus the one named union (NESTED_UNIONS: ${Object.keys(NESTED_UNIONS).join(', ')}) — a new nested spec without a dump row goes red here`, JSON.stringify(declaredNested) === JSON.stringify([...NESTED_FIELDS.map(([k, f]) => k + '.' + f), ...Object.keys(NESTED_UNIONS)].sort()) && Object.values(NESTED_UNIONS).every((why) => why.length > 60), { declaredNested });
    const nestedDumps = dumps.filter((d) => vcmp(d.version, '2.1.307') >= 0);
    ok(`every pinned dump from 2.1.307 on carries \`nested\` and reads all ${NESTED_FIELDS.length} objects (none unresolved)`, nestedDumps.length >= 1 && nestedDumps.every((d) => d.nested && Object.keys(d.nested).length === NESTED_FIELDS.length && Object.values(d.nested).every(Array.isArray)), nestedDumps.map((d) => [d.version, d.nested]));
    for (const d of nestedDumps) { const v = nestedUndeclared(R, d.nested); ok(`${d.version}: every NESTED object's field set ⊆ known ∪ ignored (${Object.keys(d.nested).length} objects)`, v.length === 0, v); }
    const nestedRows = NESTED_FIELDS.flatMap(([k, f]) => [...R.SHAPES['claude:stream:' + k].nested[f].ignored].map(([x, note]) => [k + '.' + f, x, note]));
    const uniqRows = [...new Map(nestedRows.map((r) => [r[0].replace(/^system\/task_(?:notification|progress)/, 'task') + '.' + r[1], r])).values()];
    ok('the nested IGNORED rows: 13 — rate_limit_info 10 (overageEnabled 2.1.296, usageCreditOffer 2.1.306, adminRequestOffer 2.1.307, seven ≤2.1.287), compact_metadata 1, api_error.error 2 — each naming its first build, none known; overageInUse is KNOWN (src/rate-limit-capture.js reads it)', uniqRows.length === 13 && uniqRows.every(([, x, note]) => /\((≤2\.1\.287|2\.1\.296|2\.1\.306|2\.1\.307)\)/.test(note) && note.length > 60) && /\(2\.1\.296\)/.test(R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.ignored.get('overageEnabled')) && /\(2\.1\.306\)/.test(R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.ignored.get('usageCreditOffer')) && /\(2\.1\.307\)/.test(R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.ignored.get('adminRequestOffer')) && R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.known.has('overageInUse') && read('src/rate-limit-capture.js').includes('info.overageInUse'), uniqRows.map(([at, x]) => at + '.' + x));
    const pre307 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, { ...sp, nested: Object.fromEntries(Object.entries(sp.nested).map(([f, ns]) => [f, { ...ns, known: new Set([...ns.known].filter((x) => x !== 'overageInUse')), ignored: new Map() }])) }])) };
    const n340 = nestedUndeclared(pre307, d307.nested);
    ok('RED CONTROL: the .340 tree\'s nested declarations (no ignored rows, overageInUse unknown) on the 2.1.307 dump ⇒ 14 named, the live card of 2.1.296 (rate_limit_info.overageEnabled), 2.1.306\'s usageCreditOffer and 2.1.307\'s adminRequestOffer among them', n340.length === 14 && ['overageEnabled', 'usageCreditOffer', 'adminRequestOffer', 'overageInUse'].every((f) => n340.includes('UNDECLARED rate_limit_event.rate_limit_info.' + f)), n340);
    // the live frame, through the REAL normalizer — and the card it drew before this lane (a copy with the .340 nested declaration)
    const rlFrame = (conv) => ({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1792650000, rateLimitType: 'seven_day', overageStatus: 'rejected', isUsingOverage: false, overageInUse: false, overageEnabled: true, usageCreditOffer: { kind: 'extra_credit', headlinePct: 20, daysLeft: 3, label: 'x' }, adminRequestOffer: { state: 'can_ask', label: 'x', doneLabel: 'y', confirm: false, confirmPrompt: 'z' } }, uuid: 'u-rl-' + conv.slice(-2), session_id: conv });
    const liveRl = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); x.processLive(rlFrame(conv)); const c = driftCards(x); return { cards: c.length, fields: c.flatMap((m) => m.content[0].fields).sort().join(), rows: ledgerOf(conv, MMx).length }; };
    const realRl = liveRl(MM, 'e2e00000-0000-4000-8000-0000000003b1');
    ok('the REAL normalizer on a 2.1.307 rejected rate_limit_event (overageEnabled, overageInUse, usageCreditOffer, adminRequestOffer) ⇒ no drift card, no ledger row', realRl.cards === 0 && realRl.rows === 0, realRl);
    const EXPORTS7 = 'module.exports = { SCHEMA_CLI_VERSION,';
    const MMn = rsSrc7.split(EXPORTS7).length === 2 ? require(M7.write('src/message-manager.js', mmSrc7.replace(REQ7, 'require(' + JSON.stringify(M7.write('src/record-shape.js', rsSrc7.replace(EXPORTS7, "for (const sp of [RATE_LIMIT_INFO, COMPACT_METADATA, API_ERROR_ERROR]) sp.ignored.clear(); RATE_LIMIT_INFO.known.delete('overageInUse'); /* the .340 nested declaration (control) */\n" + EXPORTS7), 'nested-340')) + ')'), 'mm-nested-340')) : null;
    const ctlRl = MMn && liveRl(MMn, 'e2e00000-0000-4000-8000-0000000003b2');
    ok('RED CONTROL: the same frame on a copy with the .340 nested declaration ⇒ the red card is back — ONE drift card on rate_limit_event naming rate_limit_info.adminRequestOffer / .overageEnabled / .overageInUse / .usageCreditOffer, and its ledger row', !!ctlRl && ctlRl.cards === 1 && ctlRl.fields === 'rate_limit_info.adminRequestOffer,rate_limit_info.overageEnabled,rate_limit_info.overageInUse,rate_limit_info.usageCreditOffer' && ctlRl.rows === 1, ctlRl);
    // THE 2.1.308 PIN (lane cli-2-1-308-records) — the hub's claude AUTO-UPDATED again (2026-10-21 22:48 PT): its dump (strings over a
    // 0644 copy) EQUALS the 2.1.307 dump — the same union keys and fields, the same nested objects, the same 14 sentences under the
    // same minified names; the strings diff is the version / build stamps, the chunk hashes and the Bun runtime. Nothing to declare.
    const d308 = dumps.find((d) => d.version === '2.1.308');
    const sameAs = (a, b, k) => JSON.stringify(a[k]) === JSON.stringify(b[k]);
    ok('2.1.308: its tracked dump EQUALS 2.1.307\'s — the same ' + Object.keys(d307.union).length + ' union keys with the same fields, the same nested objects, the same 14 sentences under the same names (' + d307.sentences.anchor + '/' + d307.sentences.list + '/' + d307.sentences.set + '), no new zod key — so no FIELDS_308, no SHAPE_SINCE row, no KNOWN_IGNORED decision, nothing left red', !!d308 && ['union', 'nested', 'sentences', 'helpers'].every((k) => sameAs(d308, d307, k)) && Object.keys(d308.zod || {}).length === 0 && !('FIELDS_308' in R) && !Object.values(R.SHAPE_SINCE).includes('2.1.308') && judgeDump(R, d308).length === 0 && nestedUndeclared(R, d308.nested).length === 0, d308 && ['union', 'nested', 'sentences', 'helpers'].filter((k) => !sameAs(d308, d307, k)));
    // CONTROL: the leg above can fail — the same dump with one field more on a declared shape and one more inside rate_limit_info is named twice
    const d308x = d308 && { ...d308, union: { ...d308.union, command_lifecycle: [...d308.union.command_lifecycle, 'x_308_probe'] }, nested: { ...d308.nested, 'rate_limit_event.rate_limit_info': [...d308.nested['rate_limit_event.rate_limit_info'], 'x308Probe'] } };
    const n308x = d308x ? [...judgeDump(R, d308x), ...nestedUndeclared(R, d308x.nested)] : null;
    ok('CONTROL: the 2.1.308 dump with one undeclared field on command_lifecycle and one inside rate_limit_info ⇒ both NAMED (the equality above is a judgement, not a skip)', !!n308x && n308x.length === 2 && n308x.some((x) => /^UNDECLARED .*command_lifecycle\.x_308_probe/.test(x)) && n308x.includes('UNDECLARED rate_limit_event.rate_limit_info.x308Probe'), n308x);
    // THE 2.1.312 PIN (lane claude-steer-inject r3) — the box's claude SELF-UPDATED to 2.1.312 (2026-10-27 18:44 PT): its dump (strings
    // over a 0644 copy) minus the 2.1.308 dump, each decision on the dump — and the real 2.1.312 RUN against a loopback mock for what a
    // CLI VibeSpace runs WRITES (scripts/fixtures/claude-cli/2.1.312-frames.jsonl: its stdout records, ids and paths replaced)
    const d312 = dumps.find((d) => d.version === '2.1.312');
    const z312 = (d312 && d312.zod) || {};
    const [, lit12] = (/^([^/]+)\/([^ ]+) @/.exec((d312 && d312.helpers[0]) || '') || []).slice(1);
    const no312 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_312[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_312[k]))) } : sp])) };
    const n312 = d312 ? judgeDump(no312, d312) : null;
    ok('CONTROL: a copy without FIELDS_312 is red on the 2.1.312 dump (13 fields named, result/success\'s twins included — the shell_* set the brief named among them) and still green on 2.1.308', !!n312 && n312.every((x) => x.startsWith('UNDECLARED ')) && new Set(n312.map((x) => x.replace('result/success.', 'result.'))).size === 13 && n312.includes('UNDECLARED result/success.shell_cpu_ms_turn') && judgeDump(no312, d308).length === 0, n312);
    const f312 = Object.entries(R.FIELDS_312).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_312: 13 fields on two shapes (result 12, turn_handoff_available 1), each IGNORED with a one-line reason naming 2.1.312 (no reader in the tree), never known', f312.length === 13 && new Set(f312.map(([k]) => k)).size === 2 && f312.filter(([k]) => k === 'claude:stream:result').length === 12 && f312.every(([k, f, note]) => typeof note === 'string' && /2\.1\.312/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f312.filter(([k, f, n]) => !/2\.1\.312/.test(n || '')));
    const grown12 = d312 ? [...new Set(Object.keys(d312.union).filter((k) => k in d308.union && R.SHAPES[shapeOf(k)]).flatMap((k) => d312.union[k].filter((f) => !d308.union[k].includes(f)).map((f) => shapeOf(k) + '.' + f)))].sort() : null;
    ok('…and they ARE the dump diff, computed: every field 2.1.312 added to a declared stream shape (its dump minus the 2.1.308 dump) is a FIELDS_312 row, and no row lies outside it (sdk.connectorId grew on an MCP server CONFIG, not a stream shape)', JSON.stringify(grown12) === JSON.stringify(f312.map(([k, f]) => k + '.' + f).sort()) && !R.SHAPES['claude:stream:sdk'] && (d312.union.sdk || []).includes('connectorId'), { grown12, rows: f312.map(([k, f]) => k + '.' + f).sort() });
    const sys308 = Object.keys(d308.union).filter((k) => k.startsWith('system/'));
    const ias = R.SHAPES['claude:stream:system/inherited_asks_settled'];
    ok('2.1.312 adds ONE system subtype and no stream record type: inherited_asks_settled — its zod literal in the dump (kept_request_ids: «The request ids of the earlier worker\'s asks that this worker keeps answerable.» — the record\'s own words are read off the binary in §4), a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.312', !!d312 && sysOf(d312) === [...sys308, 'system/inherited_asks_settled'].sort().join() && recsOf(d312) === recsOf(d308) && (z312['system/inherited_asks_settled'] || '').includes('subtype:' + lit12 + '("inherited_asks_settled")') && /kept_request_ids:[^]{0,40}\.describe\("The request ids of the earlier worker's asks that this worker keeps answerable\."\)/.test(z312['system/inherited_asks_settled'] || '') && !!ias && [...ias.known].join() === d312.union['system/inherited_asks_settled'].filter((f) => f !== 'uuid' && f !== 'session_id').join() && R.SHAPE_SINCE['system/inherited_asks_settled'] === '2.1.312', { lit12, ias: ias && [...ias.known] });
    const iasWhy = R.DECLARED_UPSTREAM_UNSEEN.system.inherited_asks_settled || '';
    ok('…it is DECLARED_UPSTREAM_UNSEEN — neither HANDLED nor KNOWN_IGNORED — and its disposition names the gate (the remote transport: reportKept = isRemoteTransport() && …), the measurement (a 2.1.312 killed with an ask unanswered and resumed said nothing of it) and what a card would do (close the permission cards it does not name); the §4 oracle reads the gate off the installed bundle', !HANDLED.has('inherited_asks_settled') && !IGN.has('inherited_asks_settled') && /isRemoteTransport\(\)/.test(iasWhy) && /MEASURED/.test(iasWhy) && /close the permission cards it does not name/.test(iasWhy), iasWhy);
    const nonRec12 = Object.keys(z312).filter((k) => !k.startsWith('system/')).sort();
    ok('every non-system zod key of the 2.1.312 dump is a ZOD_NON_RECORDS row, each on its literal — active / inactive (an API refusal body\'s cyber_verification), search_result_location (a web-search citation inside a text block), source_revision_not_on_remote_error / source_revision_stale_on_remote_error (a remote-session start\'s answer): none a stream record (no uuid / session_id), none a 2.1.308 key, and no row outside the dump', !!lit12 && nonRec12.join() === Object.keys(R.ZOD_NON_RECORDS).sort().join() && nonRec12.length === 5 && nonRec12.every((k) => /^ignored — \(2\.1\.312\)/.test(R.ZOD_NON_RECORDS[k]) && R.ZOD_NON_RECORDS[k].length > 60 && z312[k].includes('type:' + lit12 + '("' + k + '")') && !(d312.union[k] || []).includes('uuid') && !(d312.union[k] || []).includes('session_id') && !(k in d308.union)), nonRec12);
    const same14c = !!d312 && d308.sentences.rows.every((r) => d312.sentences.rows.some((x) => x.text === r.text && x.from === r.from));
    ok('§4d 2.1.312: the same 14 sentences on the same lists, only RENAMED (anchor ' + d308.sentences.anchor + ' → ' + (d312 && d312.sentences.anchor) + ', list ' + d308.sentences.list + ' → ' + (d312 && d312.sentences.list) + ', set ' + d308.sentences.set + ' → ' + (d312 && d312.sentences.set) + ') — no row moves list, none needs `until`; the nested objects equal 2.1.308\'s', same14c && d312.sentences.rows.length === 14 && d312.sentences.unresolved.length === 0 && d312.sentences.anchor !== d308.sentences.anchor && JSON.stringify(d312.nested) === JSON.stringify(d308.nested), d312 && d312.sentences.rows.map((x) => x.name + ':' + x.from));
    // what the REAL 2.1.312 writes (a loopback mock — a tool turn that took a frame in, a turn with a subagent, a Stop answered by the
    // second interrupt on its follow-up init): the one new field it carries, through the REAL normalizer — and the card it drew before this pin
    const FR12 = read('scripts/fixtures/claude-cli/2.1.312-frames.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const res12 = FR12.filter((r) => r.type === 'result');
    ok('the real 2.1.312\'s stdout (scripts/fixtures/claude-cli/2.1.312-frames.jsonl, ' + FR12.length + ' records): every init names 2.1.312, EVERY result carries model_usage_since_last_result (' + res12.length + ' results, the interrupted ones too), NONE a shell_* / process_* / main_stream_* field (sent only by a worker Anthropic hosts), no inherited_asks_settled', FR12.filter((r) => r.subtype === 'init').length >= 3 && FR12.filter((r) => r.subtype === 'init').every((r) => r.claude_code_version === '2.1.312') && res12.length >= 5 && res12.some((r) => r.subtype === 'error_during_execution') && res12.every((r) => r.model_usage_since_last_result && typeof r.model_usage_since_last_result === 'object') && res12.every((r) => !Object.keys(r).some((k) => /^(shell_|process_|main_stream_)/.test(k))) && !FR12.some((r) => r.subtype === 'inherited_asks_settled'), res12.map((r) => Object.keys(r).filter((k) => /since_last|^shell_|^process_|^main_stream_/.test(k))));
    const SIDS12 = [...new Set(FR12.map((r) => r.session_id).filter(Boolean))];
    const live12 = (MMx) => SIDS12.map((conv) => {
      const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv);
      for (const r of FR12.filter((y) => y.session_id === conv)) x.processLive(JSON.parse(JSON.stringify(r)));
      const cards = driftCards(x);
      return { cards: cards.length, fields: cards.flatMap((m) => m.content[0].fields).sort().join(), shapes: cards.map((m) => m.content[0].shape).join(), cli: cards.map((m) => m.content[0].cli).join(), rows: ledgerOf(conv, MMx).length };
    });
    const real12 = live12(MM);
    ok('the REAL normalizer on the real 2.1.312 stdout, conversation by conversation (' + SIDS12.length + ') ⇒ no drift card, no ledger row', SIDS12.length >= 3 && real12.every((c) => c.cards === 0 && c.rows === 0), real12);
    const M12 = mutantCopies('record-312', REPO);
    const FILL12 = 'for (const [key, fields] of Object.entries(FIELDS_312)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);';
    const rsSrc12 = read('src/record-shape.js'), mmSrc12 = read('src/message-manager.js');
    const MM12 = rsSrc12.split(FILL12).length === 2 && mmSrc12.split(REQ7).length === 2 ? require(M12.write('src/message-manager.js', mmSrc12.replace(REQ7, 'require(' + JSON.stringify(M12.write('src/record-shape.js', rsSrc12.replace(FILL12, '/* FIELDS_312 not filled (control) */'), 'no-312')) + ')'), 'mm-no-312')) : null;
    const ctl12 = MM12 && live12(MM12);
    ok('RED CONTROL: the same stdout on a copy without FIELDS_312 (the 7df30f96 tree on 2.1.312) ⇒ the card is back in EVERY conversation — ONE drift card on result naming model_usage_since_last_result alone, CLI 2.1.312, and its ledger row', !!ctl12 && ctl12.every((c) => c.cards === 1 && c.shapes === 'result' && c.fields === 'model_usage_since_last_result' && c.cli === '2.1.312' && c.rows === 1), ctl12);
    // THE STAND-IN (scripts/fixtures/claude-stand-in-cli.cjs's shape, version-keyed by $STAND_IN_CLI_VERSION): a 2.1.312 stand-in writes
    // the measured 2.1.312 result (model_usage_since_last_result on every result), a 2.1.308 one the 2.1.308 result — both clean
    const standIn = (ver) => new Promise((resolve) => {
      const c = spawn(process.execPath, [path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs')], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, ...(ver ? { STAND_IN_CLI_VERSION: ver } : {}) } });
      let buf = '';
      const recs = [];
      const done = () => { clearTimeout(t); try { c.kill(); } catch { } resolve({ init: (recs.find((x) => x.subtype === 'init') || {}).claude_code_version, results: recs.filter((x) => x.type === 'result'), drift: recs.map((x) => R.unknownFields('claude', 'stream', x)).filter(Boolean) }); };
      const t = setTimeout(done, 5000);
      c.stdout.setEncoding('utf8');
      c.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { recs.push(JSON.parse(l)); } catch { } if (recs.some((x) => x.type === 'result')) return done(); } });
      c.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } }) + '\n');
    });
    const [si12, si08] = await Promise.all([standIn(null), standIn('2.1.308')]);
    ok('the stand-in CLI is version-keyed: by default it IS 2.1.312 (init claude_code_version 2.1.312, every result carries model_usage_since_last_result); STAND_IN_CLI_VERSION=2.1.308 writes the 2.1.308 result (no such field); both clean under the declarations', si12.init === '2.1.312' && si12.results.length >= 1 && si12.results.every((x) => x.model_usage_since_last_result && typeof x.model_usage_since_last_result === 'object') && si08.init === '2.1.308' && si08.results.length >= 1 && si08.results.every((x) => !('model_usage_since_last_result' in x)) && si12.drift.length === 0 && si08.drift.length === 0, { si12: { init: si12.init, results: si12.results.length, drift: si12.drift }, si08: { init: si08.init, results: si08.results.length } });
  }
}

console.log('§5 negative control — a scratch copy with every `ignored` map emptied goes red on §1');
{
  const src = read('src/record-shape.js');
  const line = "for (const [key, fields] of Object.entries(CORPUS_KNOWN)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);";
  ok('the scratch mutation targets the ONE line that fills the ignored maps (the control is meaningful only if that line exists)', src.includes(line));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-record-shape-neg-'));
  try {
    const mutated = src.replace(line, "for (const [key] of Object.entries(CORPUS_KNOWN)) SHAPES[key].ignored.clear(); for (const s of Object.values(SHAPES)) s.ignored.clear(); // NEGATIVE CONTROL");
    fs.writeFileSync(path.join(dir, 'record-shape.js'), mutated);
    const neg = require(path.join(dir, 'record-shape.js'));
    const emptied = Object.values(neg.SHAPES).every((s) => s.ignored.size === 0);
    const c = census(neg, [path.join(REPO, 'scripts/fixtures')]);
    ok('the scratch copy has no ignored entries and §1 goes RED on it (the fixtures carry the live-seen fields — proof the census can fail)', emptied && c.drift.length >= 3 && c.drift.some((d) => /messaging_socket_path/.test(d.fields.join(','))) && c.drift.some((d) => /workflow_progress/.test(d.fields.join(','))), { emptied, drift: c.drift.slice(0, 4) });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
