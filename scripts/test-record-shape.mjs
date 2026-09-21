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
//   §2 synthetic drift: init +{foo,bar} → one card naming both, a repeat adds no card, a third with
//      +{qux} MERGES into the same card (edit op), telemetry once; codex token_count.info +{baz}; an
//      unknown TYPE is the fall-back card only (never double-reported as drift); the redactor.
//   §3 enum drift: an undeclared enum value is a card AND the handler still runs.
//   §4 the BINARY ORACLE: the installed claude's zod union, read with the census's own extractor —
//      every system subtype / stream type on exactly ONE of HANDLED ∪ KNOWN_IGNORED ∪
//      DECLARED_UPSTREAM_UNSEEN, every declared shape's binary fields ⊆ known ∪ ignored, no dead list
//      entry. SKIP with reason when no claude binary is installed. Red locally the day the CLI updates.
//   §5 negative control: a scratch copy with every `ignored` map emptied goes red on §1.
// Run: node scripts/test-record-shape.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

console.log('§2 synthetic drift — one card per shape per session, merged on repeat, telemetry once, the fall-back card never doubled');
{
  const prevEv = global.__vsEvent; const events = []; global.__vsEvent = (n, d) => events.push([n, d]);
  MM.MessageManager._seenShapeDrift.clear();
  const mm = createMessageManager('claude', 'test-shape-1');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  const init = (extra) => ({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 'e2e00000-0000-4000-8000-000000000001', uuid: 'u-init-' + Math.random(), tools: [], mcp_servers: [], model: 'claude-fable-5-1', permissionMode: 'default', slash_commands: [], apiKeySource: 'sk-ant-fixture-secret', claude_code_version: '2.1.274', output_style: 'default', skills: [], plugins: [], ...extra });
  mm.processLive(init({ foo: 1, bar: 'x' }));
  let c = driftCards(mm);
  ok('init +{foo,bar} ⇒ ONE card, noticeKind unknown-fields, block type unknown_fields naming the shape and both fields', c.length === 1 && c[0].content[0].type === 'unknown_fields' && c[0].content[0].shape === 'system/init' && JSON.stringify(c[0].content[0].fields) === '["foo","bar"]' && c[0].content[0].harness === 'Claude Code', c.map((m) => m.content[0]));
  ok('…the card is EMITTED as a create op (an open window sees it)', ops.filter((o) => o.op === 'create' && (o.message || o.msg)?.noticeKind === 'unknown-fields').length === 1);
  ok('…the sample rides through the redactor: the value under apiKeySource (an api+key compound) is masked, the field names are visible', /«redacted»/.test(c[0].content[0].sample) && !/sk-ant-fixture-secret/.test(c[0].content[0].sample) && /"foo": 1/.test(c[0].content[0].sample));
  // the redactor judges key SEGMENTS, never substrings (r3 2026-09-21: the /key/ alternative masked the notification's own `key`)
  const red = R.redactRecord({ key: 'stop-hook-error', monkey: 'm', hotkey: 'h', keyboard: 'k', keys: ['a'], turnkey: 't', api_key: 'x', apiKey: 'x', ANTHROPIC_API_KEY: 'x', access_token: 'x', refreshToken: 'x', OAuthToken: 'x', authorization: 'x', password: 'x', secret_key: 'x', apiKeySource: 'x', input_tokens: 5, nested: { cookie: 'c', session_key: 's', key: 'inner-visible' } });
  ok('NEGATIVE CONTROL: `key` / `monkey` / `hotkey` / `keyboard` / `keys` / `turnkey` values stay VISIBLE (a drift card on system/notification must show the field that identifies it)', red.key === 'stop-hook-error' && red.monkey === 'm' && red.hotkey === 'h' && red.keyboard === 'k' && red.keys[0] === 'a' && red.turnkey === 't' && red.nested.key === 'inner-visible', red);
  ok('…while credential compounds and secret segments are masked at any depth: api_key / apiKey / ANTHROPIC_API_KEY / access_token / refreshToken / OAuthToken / authorization / password / secret_key / apiKeySource / nested cookie + session_key; counts (input_tokens) stay', ['api_key', 'apiKey', 'ANTHROPIC_API_KEY', 'access_token', 'refreshToken', 'OAuthToken', 'authorization', 'password', 'secret_key', 'apiKeySource'].every((k) => red[k] === '«redacted»') && red.nested.cookie === '«redacted»' && red.nested.session_key === '«redacted»' && red.input_tokens === 5, red);
  ok('isSecretKey is exported and table-true on the same rows', R.isSecretKey('apiKey') && R.isSecretKey('ACCESS_TOKEN') && !R.isSecretKey('key') && !R.isSecretKey('monkey') && !R.isSecretKey('keyboard') && !R.isSecretKey('messaging_socket_path'));
  ok('…the init card itself still rendered (handling unchanged — the drift hook runs AFTER routing)', mm.messages.some((m) => m.content?.[0]?.initData));
  mm.processLive(init({ foo: 2, bar: 'y' }));
  ok('a SECOND occurrence with the same fields adds NO card and no op', driftCards(mm).length === 1 && ops.filter((o) => o.op === 'edit' && o.fields?.content?.[0]?.type === 'unknown_fields').length === 0);
  const nEdits = ops.length;
  mm.processLive(init({ foo: 3, qux: true }));
  c = driftCards(mm);
  ok('a THIRD with +{qux} MERGES into the same card (fields now foo,bar,qux) through an EDIT op — never a new card', c.length === 1 && JSON.stringify(c[0].content[0].fields) === '["foo","bar","qux"]' && ops.slice(nEdits).some((o) => o.op === 'edit' && o.id === c[0].id && o.fields.content[0].fields.length === 3), c.map((m) => m.content[0].fields));
  const drifts = events.filter((e) => e[0] === 'harness-shape-drift');
  ok('telemetry harness-shape-drift fired ONCE per process per shape, the detail naming shape + fields + the CLI build', drifts.length === 1 && /^claude:stream:system\/init \+\{foo,bar\}/.test(drifts[0][1]) && /cli 2\.1\.274/.test(drifts[0][1]), drifts);
  // the fall-back card owns an unknown TYPE: never ALSO a drift card
  mm.processLive({ type: 'brand_new_record', anything: 1, uuid: 'u-x', session_id: 's' });
  mm.processLive({ type: 'system', subtype: 'never_seen_subtype', whatever: 2, uuid: 'u-y', session_id: 's' });
  ok('an unknown TYPE / subtype is the fall-back card ONLY (2 unknown-record cards, still 1 drift card)', unknownCards(mm).length === 2 && driftCards(mm).length === 1);
  // history renders the same one card
  const hist = createMessageManager('claude', 'test-shape-2');
  hist.convertHistory([init({ foo: 1, bar: 2 }), init({ foo: 1, bar: 2 })]);
  ok('a HISTORY rebuild renders the same ONE card (the hook is a renderer, not an alert)', driftCards(hist).length === 1 && driftCards(hist)[0].content[0].fields.length === 2);
  // a handled record with NO drift produces nothing
  const clean = createMessageManager('claude', 'test-shape-3');
  clean.processLive(init({}));
  clean.processLive({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 5, estimated_tokens_delta: 5, uuid: 'u-t', session_id: 's' });
  ok('clean records ⇒ no drift card (negative control for the hook)', driftCards(clean).length === 0 && unknownCards(clean).length === 0);
  // codex
  CodexMessageManager._seenShapeDrift.clear();
  const cx = new CodexMessageManager('test-shape-cx');
  const cops = []; cx.onOp((o) => cops.push(o));
  const tc = (extra) => ({ timestamp: '2026-09-13T16:39:55.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1 }, last_token_usage: { total_tokens: 1 }, model_context_window: 100, ...extra }, rate_limits: { limit_id: 'codex' } } });
  cx.processLive(tc({ baz: 1 }));
  cx.processLive(tc({ baz: 2 }));
  const cc = driftCards(cx);
  ok('codex token_count.info +{baz} ⇒ ONE card (shape event/token_count, field info.baz, harness Codex), the repeat adds none', cc.length === 1 && cc[0].content[0].shape === 'event/token_count' && JSON.stringify(cc[0].content[0].fields) === '["info.baz"]' && cc[0].content[0].harness === 'Codex', cc.map((m) => m.content[0]));
  ok('…the token_count itself was still consumed (usage meta path ran)', cops.some((o) => o.op === 'meta' && o.subtype === 'usage') || cx.messages.length >= 1);
  ok('codex telemetry once, naming the shape', events.filter((e) => e[0] === 'harness-shape-drift' && /codex:rollout:event\/token_count \+\{info\.baz\}/.test(e[1])).length === 1);
  cx.processLive({ timestamp: '2026-09-13T16:39:56.000Z', type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'x', item: { type: 'Extension', kind: 'web.sleep', id: 'exec-1', seconds: 2 } } });
  ok('an unknown codex item KIND is the fall-back card by name — never ALSO a drift card for its fields', unknownCards(cx).length === 1 && driftCards(cx).length === 1);
  // the event_msg CARRIER line is judged at the envelope level too (r3 2026-09-21: a new top-level key on an event line was
  // invisible while the same key on a response_item line was flagged) — and the payload is still judged exactly once
  const ce = new CodexMessageManager('test-shape-cx-env');
  ce.processLive({ ...tc({}), brand_new_top: 1 });
  let ced = driftCards(ce);
  ok('codex event_msg line +{brand_new_top} at the TOP level ⇒ a drift card on event/token_count naming brand_new_top (the envelope judged)', ced.length === 1 && ced[0].content[0].shape === 'event/token_count' && JSON.stringify(ced[0].content[0].fields) === '["brand_new_top"]', ced.map((m) => m.content[0]));
  ce.processLive({ ...tc({ baz: 1 }), brand_new_top: 2 });
  ced = driftCards(ce);
  ok('…a line with BOTH an envelope key and a payload field ⇒ still ONE card per shape (the two verdicts merge: brand_new_top + info.baz), each judged exactly once (no duplicate field)', ced.length === 1 && JSON.stringify(ced[0].content[0].fields) === '["brand_new_top","info.baz"]', ced.map((m) => m.content[0].fields));
  const cr2 = new CodexMessageManager('test-shape-cx-ri');
  cr2.processLive({ timestamp: '2026-09-13T16:39:57.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] }, brand_new_top: 1 });
  ok('…the response_item twin flags the same key (parity between the two carriers)', driftCards(cr2).length === 1 && driftCards(cr2)[0].content[0].fields.includes('brand_new_top'), driftCards(cr2).map((m) => m.content[0]));
  const cclean = new CodexMessageManager('test-shape-cx-clean');
  cclean.processLive(tc({}));
  ok('a clean event_msg line ⇒ no card (negative control for the envelope judgement)', driftCards(cclean).length === 0);
  ok('unknownFields kind envelope: judges ONLY the carrier keys (a payload field is not its business)', R.unknownFields('codex', 'rollout', { ...tc({ baz: 1 }), brand_new_top: 1 }, { kind: 'envelope' }).fields.join(',') === 'brand_new_top');
  global.__vsEvent = prevEv;
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
    const cands = [];
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
  const lenient = !!process.env.GITHUB_ACTIONS && installed !== pinned;
  console.log(`  installed claude ${installed || '(unknown)'} vs pinned schema ${pinned} — ${lenient ? 'INFORMATIONAL (mirror, newer build): drift is printed, not red' : 'STRICT'}`);
  const oracleOk = lenient ? (n, c, e) => { if (c) ok(n, c, e); else skip(n, 'informational on the mirror (installed ' + installed + ' ≠ pinned ' + pinned + '): ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600)); } : ok;
  if (!bin || size < 4 * 1024 * 1024) {
    skip('binary oracle', bin ? `${bin} is ${size} bytes — a launcher/shim, not the CLI binary (install the native build to run this leg)` : 'no claude binary on PATH / ~/.local/bin / ~/.claude/local');
  } else {
    // THE EXTRACTOR (ported verbatim from the census: walk every `u({type:R("…")[,subtype:R("…")]…})`
    // object literal, skipping string literals, collecting the depth-1 keys). `strings` keeps memory
    // sane on a 230 MB ELF; the raw latin1 read is the fallback.
    let text = '';
    try { text = execFileSync('strings', ['-n', '8', bin], { maxBuffer: 1024 * 1024 * 1024, encoding: 'latin1' }); } catch { try { text = fs.readFileSync(bin, 'latin1'); } catch { } }
    const union = {};
    const re = /u\(\{type:R\("([a-z_]+)"\)(?:,subtype:R\("([a-z_]+)"\))?/g;
    const walkTo = (i) => { let depth = 0; for (let j = i; j < text.length && j < i + 40000; j++) { const c = text[j]; if (c === '"' || c === "'" || c === '`') { const q = c; j++; while (j < text.length && text[j] !== q) { if (text[j] === '\\') j++; j++; } continue; } if (c === '(' || c === '{' || c === '[') depth++; else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) return j; } } return -1; };
    let m;
    while ((m = re.exec(text))) {
      const key = m[1] + (m[2] ? '/' + m[2] : '');
      if (union[key]) continue;
      const i = m.index + 2; const j = walkTo(i); if (j < 0) continue;
      const body = text.slice(i, j + 1);
      let d = 0, cur = ''; const fields = [];
      for (let k = 0; k < body.length; k++) {
        const c = body[k];
        if (c === '"' || c === "'" || c === '`') { const q = c; k++; while (k < body.length && body[k] !== q) { if (body[k] === '\\') k++; k++; } cur = ''; continue; }
        if (c === '(' || c === '{' || c === '[') d++; else if (c === ')' || c === '}' || c === ']') d--;
        if (d === 1) { if (/[A-Za-z0-9_$]/.test(c)) cur += c; else { if (c === ':' && cur) fields.push(cur); cur = ''; } } else cur = '';
      }
      union[key] = fields.filter((f) => f !== 'type' && f !== 'subtype');
    }
    const keys = Object.keys(union);
    const sys = keys.filter((k) => k.startsWith('system/')).map((k) => k.slice(7));
    const EXPLICIT = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const recs = keys.filter((k) => !k.startsWith('system/') && ((union[k].includes('uuid') && union[k].includes('session_id')) || EXPLICIT.has(k)));
    const types = [...new Set(recs.map((k) => k.replace(/\/.*$/, '')))];
    let ver = '?'; try { ver = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 }).trim().slice(0, 40); } catch { }
    console.log(`    binary ${bin} (${(size / 1048576).toFixed(0)} MB, ${ver}) · union ${keys.length} shapes · ${sys.length} system subtypes · ${types.length} stream record types`);
    oracleOk('the extractor read a plausible union (≥ 40 system subtypes, ≥ 25 stream types — the 2.1.274 census had 51 / 34)', sys.length >= 40 && types.length >= 25, { sys: sys.length, types: types.length });
    const missSys = sys.filter((s) => !HANDLED.has(s) && !IGN.has(s) && !(s in UNSEEN.system));
    oracleOk(`every binary system subtype is on exactly one list (${sys.length} checked) — a new one FAILS HERE, named`, missSys.length === 0, 'UNLISTED: ' + missSys.join(', '));
    const missT = types.filter((t) => !cases.has(t) && !IGNT.has(t) && !(t in UNSEEN.types));
    oracleOk(`every binary stream record type is routed, declared-ignored or declared-unseen (${types.length} checked)`, missT.length === 0, 'UNLISTED: ' + missT.join(', '));
    // declared shapes: binary fields − envelope ⊆ known ∪ ignored
    const env = R.ENVELOPES['claude:stream'];
    const viol = [];
    let checked = 0;
    for (const k of keys) {
      const shape = 'claude:stream:' + (k === 'result/success' ? 'result' : k);
      const spec = R.SHAPES[shape];
      if (!spec) continue;
      checked++;
      for (const f of union[k]) if (!env.has(f) && !spec.known.has(f) && !spec.ignored.has(f) && !R.isOurs(f)) viol.push(shape + '.' + f);
    }
    oracleOk(`every declared claude stream shape's binary field set ⊆ known ∪ ignored (${checked} shapes, incl. the result union)`, viol.length === 0 && checked >= 60, viol.length ? 'UNDECLARED: ' + viol.join(', ') : { checked });
    // reverse: no dead list entry, no declared stream shape the binary does not have
    const bsys = new Set(sys);
    const dead = [...HANDLED, ...IGN, ...Object.keys(UNSEEN.system)].filter((s) => !bsys.has(s) && !(s in R.CORPUS_ONLY_SUBTYPES));
    oracleOk('no DEAD system-subtype entry (every list name is in the binary or on CORPUS_ONLY_SUBTYPES with a note)', dead.length === 0, 'DEAD: ' + dead.join(', '));
    const bt = new Set(types);
    const deadT = Object.keys(UNSEEN.types).filter((t) => !bt.has(t));
    oracleOk('no DEAD declared-unseen top-level type', deadT.length === 0, 'DEAD: ' + deadT.join(', '));
    const bkeys = new Set(keys.map((k) => (k === 'result/success' ? 'result' : k)));
    const ghost = Object.keys(R.SHAPES).filter((s) => s.startsWith('claude:stream:')).map((s) => s.slice(14)).filter((k) => !bkeys.has(k));
    oracleOk('every declared claude STREAM shape exists in the binary union (no ghost shape)', ghost.length === 0, 'GHOST: ' + ghost.join(', '));
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
