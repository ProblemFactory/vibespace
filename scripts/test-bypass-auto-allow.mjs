#!/usr/bin/env node
// test-bypass-auto-allow — lane bypass-no-prompts (owner 2026-10-10: "我都开了 bypassPermissions 了就是不要看到这个").
// A conversation run in bypassPermissions never shows a permission card: the CLI's own safety-check asks (MEASURED on
// 2.1.288: decision_reason_type safetyCheck, classifier_approvable false, suppress_always_allow_rule true, no
// suggestions — and a PreToolUse hook's "allow" does not stop them) and every other can_use_tool under bypass are
// answered ALLOW at the door (src/server/bypass-auto-allow.js) with the exact input, a quiet line in the chat, a
// console-ring audit row and a per-session count. The switch `permissions.bypassAnswersAsks` (default ON); never in
// any other mode; the mode read per ask. Every rule a leg + a RED control (patched copies of the door).
// In-process, the REAL normalizer (createMessageManager), no network.
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const DOOR_REL = 'src/server/bypass-auto-allow.js';
const D = require(path.join(REPO, DOOR_REL));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
/** The door with ONE source edit, compiled at its own path (its relative requires still resolve). */
function patchedDoor(from, to) {
  const file = path.join(REPO, DOOR_REL);
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(from)) throw new Error('mutant anchor gone: ' + from);
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src.replace(from, to), file);
  return m.exports;
}

// THE MEASURED ASK (2.1.288, this lane's scratch run: `bash -c 'f() { rm -f "$1"; }; f …'`), ids remapped
const CMD = "bash -c 'f() { rm -f \"$1\"; }; f /tmp/vs-bnp-scratch/work/g; echo e' # " + 'x'.repeat(140);
const askOf = (rid, tuid, input = { command: CMD }, extra = {}) => ({
  type: 'control_request', request_id: rid,
  request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash', description: 'bash -c …', permission_suggestions: [],
    decision_reason: 'This shell -c script runs rm and could not be checked', decision_reason_type: 'safetyCheck',
    classifier_approvable: false, tool_use_id: tuid, suppress_always_allow_rule: true, input, ...extra },
});
const callOf = (tuid, name = 'Bash', input = { command: CMD }) => ({ type: 'assistant', uuid: 'u-' + tuid, session_id: 's',
  message: { id: 'm-' + tuid, role: 'assistant', content: [{ type: 'tool_use', id: tuid, name, input }] } });
const resultOf = (tuid, text, isError = false) => ({ type: 'user', uuid: 'r-' + tuid, session_id: 's',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tuid, content: text, is_error: isError }] } });

function rig({ mode = 'bypassPermissions', setting, pty = true } = {}) {
  const mm = createMessageManager('claude', 'bnp-' + Math.random().toString(36).slice(2, 8));
  const ops = []; mm.listeners.push((e) => ops.push(e));
  const writes = [], logs = [];
  const session = { mode: 'chat', backend: 'claude', _permissionMode: mode, buffer: '', pty: pty ? { write: (s) => writes.push(s) } : null };
  const feedLive = (s, m) => mm.processLive(m);
  const opts = { feedLive, serverSetting: (k) => (k === D.SETTING ? setting : undefined), log: { log: (s) => logs.push(['log', s]), warn: (s) => logs.push(['warn', s]) } };
  const ask = (rec, door = D) => { const did = door.door(session, 'w1', rec, opts); if (!did) mm.processLive(rec); return did; };
  const card = (tuid) => mm.messages.find((m) => m.toolCallId === tuid);
  const lines = () => mm.messages.filter((m) => m.noticeKind === 'harness-informational' && m.content?.[0]?.say === 'bypass-auto-allow');
  return { mm, ops, writes, logs, session, opts, ask, card, lines };
}

console.log('§1 an ask under bypass + switch on ⇒ allowed at once with the exact input, no card, no For-you, the quiet line, the audit row');
{
  const r = rig();
  r.mm.processLive(callOf('T1'));
  const did = r.ask(askOf('R1', 'T1'));
  ok('the door answered it', did === true);
  const frame = r.writes.length === 1 ? JSON.parse(r.writes[0]) : null;
  ok('ONE control_response on stdin: allow, the SAME request id, updatedInput = the exact input the CLI asked about',
    frame && JSON.stringify(frame) === JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'R1', response: { behavior: 'allow', updatedInput: { command: CMD } } } }), frame);
  ok('no permission card: the tool card carries no permission', r.card('T1') && !r.card('T1').permission, r.card('T1')?.permission);
  ok('nothing pending ⇒ main-ask / the parked-turn machinery have nothing to file', r.mm.pendingAsks().length === 0);
  ok('no op ever carried a permission for the card', !r.ops.some((o) => o.op === 'edit' && o.fields && o.fields.permission));
  const L = r.lines();
  ok('ONE quiet line (role system, the dim harness notice — never counted as a message)', L.length === 1 && L[0].role === 'system' && L[0].content[0].level === 'notice', L.length);
  const p = L[0]?.content[0]?.params || {};
  ok('the line says the tool + the command head (its first 120 chars) + the CLI\'s reason type', p.tool === 'Bash' && p.head === CMD.slice(0, 120) && p.head.length === 120 && p.reasonType === 'safetyCheck' && /could not be checked/.test(p.reason), p);
  ok('the line is EMITTED live (a create op an open window paints)', r.ops.some((o) => o.op === 'create' && (o.message || o.msg)?.content?.[0]?.say === 'bypass-auto-allow'));
  const audit = r.logs.find(([k, s]) => k === 'log' && s.startsWith('[bypass] auto-allow '));
  const row = audit ? JSON.parse(audit[1].slice('[bypass] auto-allow '.length)) : null;
  ok('the audit row (server console ring → the incident bundle): {op:auto-allow, tool, reasonType, head}', row && row.op === 'auto-allow' && row.tool === 'Bash' && row.reasonType === 'safetyCheck' && row.head === CMD.slice(0, 120), row);
  ok('the per-session count (Session Properties) = 1', r.session._autoAllowed === 1);
  const recs = r.session.buffer.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok('the buffer holds the allow AND our own record after it (the rebuild draws the same line)', recs.length === 2 && recs[0].type === 'control_response' && recs[1].type === 'system' && recs[1].subtype === 'vs_auto_allow' && recs[1].request_id === 'R1' && JSON.parse(recs[1].input).command === CMD, recs.map((x) => x.type));
  // the rebuild: the CLI stdout (call + ask) and our two records ⇒ the same chat — the replayed ask comes off its card
  const mm2 = createMessageManager('claude', 'bnp-rebuild');
  mm2.convertHistory([callOf('T1'), askOf('R1', 'T1'), ...recs]);
  const c2 = mm2.messages.find((m) => m.toolCallId === 'T1');
  ok('REBUILD: no permission on the card, nothing pending, ONE quiet line', c2 && !c2.permission && mm2.pendingAsks().length === 0 && mm2.messages.filter((m) => m.content?.[0]?.say === 'bypass-auto-allow').length === 1, c2?.permission);
  r.mm.processLive(resultOf('T1', 'e'));
  ok('the tool ran: its result stays a plain notice line', r.lines()[0].content[0].level === 'notice' && !r.lines()[0].content[0].params.refused);
}

console.log('§2 no silent failure: an auto-allowed call the CLI then refuses is SAID; an answer that cannot be written leaves the card');
{
  const r = rig();
  r.mm.processLive(callOf('T2'));
  r.ask(askOf('R2', 'T2'));
  r.mm.processLive(resultOf('T2', 'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). Try a different approach or report the limitation to complete your task.', true));
  const b = r.lines()[0]?.content[0];
  ok('a denial result turns the quiet line into a warning that names it', b && b.level === 'warning' && /Permission for this tool use was denied/.test(b.params.refused), b);
  ok('…and the change is EMITTED (an edit op on the line)', r.ops.some((o) => o.op === 'edit' && o.id === r.lines()[0].id && o.fields?.content));
  const n = rig({ pty: false });
  n.mm.processLive(callOf('T3'));
  ok('no live process ⇒ the door steps aside (the card forms) and says why', n.ask(askOf('R3', 'T3')) === false && n.card('T3')?.permission?.requestId === 'R3' && n.logs.some(([k, s]) => k === 'warn' && /could not answer/.test(s)));
}

console.log('§3 the switch: OFF ⇒ the card as today; RED control — a door that ignores the switch answers anyway');
{
  const r = rig({ setting: false });
  r.mm.processLive(callOf('T4'));
  ok('switch OFF ⇒ nothing written, the card asks (pending, the request on it)', r.ask(askOf('R4', 'T4')) === false && r.writes.length === 0 && r.card('T4')?.permission?.requestId === 'R4' && !r.card('T4').permission.resolved && r.mm.pendingAsks().length === 1);
  ok('switch OFF ⇒ no quiet line, no count', r.lines().length === 0 && !r.session._autoAllowed);
  const on = rig({ setting: true });
  on.mm.processLive(callOf('T4b'));
  ok('switch explicitly ON ⇒ answered', on.ask(askOf('R4b', 'T4b')) === true);
  const mut = patchedDoor('serverSetting(SETTING) !== false', 'true');
  const c = rig({ setting: false });
  c.mm.processLive(callOf('T5'));
  ok('CONTROL (the switch ignored): the same OFF rig is answered ⇒ the leg above would be red', c.ask(askOf('R5', 'T5'), mut) === true && c.writes.length === 1);
}

console.log('§4 never outside bypass; the mode is read per ask (a switch away stops it at the next ask); RED control');
{
  for (const mode of ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', null]) {
    const r = rig({ mode, setting: true });
    r.mm.processLive(callOf('T6'));
    ok(`mode ${mode} + switch ON ⇒ the card`, r.ask(askOf('R6', 'T6')) === false && r.writes.length === 0 && r.card('T6')?.permission?.requestId === 'R6');
  }
  const mut = patchedDoor("if (session._permissionMode !== 'bypassPermissions') return null;", '');
  const c = rig({ mode: 'default' });
  c.mm.processLive(callOf('T7'));
  ok('CONTROL (the mode check removed): a default-mode ask is auto-allowed ⇒ the legs above would be red', c.ask(askOf('R7', 'T7'), mut) === true && c.writes.length === 1);
  const r = rig();
  r.mm.processLive(callOf('T8'));
  ok('bypass: the first ask is answered', r.ask(askOf('R8', 'T8')) === true);
  r.session._permissionMode = 'acceptEdits'; // the CLI's set_permission_mode ack / init adopted mid-session
  r.mm.processLive(callOf('T9'));
  ok('mid-session switch away ⇒ the NEXT ask is a card', r.ask(askOf('R9', 'T9')) === false && r.card('T9')?.permission?.requestId === 'R9' && r.writes.length === 1);
  r.session._permissionMode = 'bypassPermissions';
  r.mm.processLive(callOf('T10'));
  ok('…and back to bypass ⇒ answered again (never cached)', r.ask(askOf('R10', 'T10')) === true && r.session._autoAllowed === 2);
  const t = rig(); t.session.mode = 'terminal';
  ok('a terminal session is never answered here', D.door(t.session, 'w', askOf('R11', 'T11'), t.opts) === false && t.writes.length === 0);
}

console.log('§5 the other asks under bypass: a helper\'s ask, the WebFetch provenance re-ask — allowed and counted; AskUserQuestion is a question, never answered');
{
  const r = rig();
  const helper = askOf('R12', 'HT1', { command: 'rm -rf build' }, { agent_id: 'agent-1' });
  ok('a helper\'s ask (agent_id) under a bypass parent ⇒ allowed with its input', r.ask(helper) === true && JSON.parse(r.writes[0]).response.response.updatedInput.command === 'rm -rf build');
  ok('…counted and its line says helper', r.session._autoAllowed === 1 && r.lines()[0]?.content[0]?.params?.helper === true);
  ok('…nothing pending on any card (no helper ask hangs)', r.mm.pendingAsks().length === 0);
  const url = 'https://example.com/a';
  r.mm.processLive(callOf('WF1', 'WebFetch', { url, prompt: 'p' }));
  const reask = { type: 'control_request', request_id: 'R13', request: { subtype: 'can_use_tool', tool_name: 'WebFetch', input: { url, prompt: 'p' }, tool_use_id: '7d1c2a9e-provenance' } };
  ok('the WebFetch provenance re-ask (a tool_use_id naming no call) ⇒ allowed, the line names the url', r.ask(reask) === true && r.lines()[1]?.content[0]?.params?.head === url && !r.card('WF1').permission);
  const q = { type: 'control_request', request_id: 'R14', request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions: [{ question: 'Which?' }] }, tool_use_id: 'Q1' } };
  r.mm.processLive(callOf('Q1', 'AskUserQuestion', q.request.input));
  ok('AskUserQuestion ⇒ never auto-answered (the person answers it)', r.ask(q) === false && r.card('Q1')?.permission?.kind === 'user_input' && r.session._autoAllowed === 2);
  ok('headOf: Edit names its path, an unknown tool its input', D.headOf('Edit', { file_path: '/a/b.js', old_string: 'x' }) === '/a/b.js' && D.headOf('mcp__x__y', { a: 1 }) === '{"a":1}');
}

console.log('§6 wiring + words: the door sits on the claude stdout path before the normalizer; the setting row; the client line; zh/ja');
{
  const cs = read('src/server/stdout/claude-stream-json.js');
  const door = cs.indexOf("if (bypassAutoAllow.door(session, id, msg, { feedLive })) continue;");
  ok('claude-stream-json: the door runs right before the live feed (the last feedLive of the line loop)', door > 0 && door < cs.lastIndexOf('feedLive(session, msg);') && cs.lastIndexOf('feedLive(session, msg);') - door < 400);
  ok('the door answers through THE one answer path (helper-asks.answerUnasked → permission-answer.js)', /answerUnasked\(session, \{ requestId: v\.requestId, approved: true, toolInput: v\.input \}/.test(read(DOOR_REL)) && /answerUnasked\(session, data, \{ adapterRegistry, feedLive \} = \{\}\) \{ return answerPermission\(/.test(read('src/server/helper-asks.js')));
  const S = require(path.join(REPO, 'src/lib/settings-schema.js'));
  const schema = S.SETTINGS_SCHEMA || S.SCHEMA || S.default || S;
  const row = schema && schema[D.SETTING];
  ok('settings row permissions.bypassAnswersAsks: boolean, default ON, liveApply, the plain words', row && row.type === 'boolean' && row.default === true && row.liveApply === true && /safety-check prompts/.test(String(row.description)) && /every auto-allow is logged in the chat/.test(String(row.description)), row && { type: row.type, default: row.default });
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  for (const k of ['Auto-allowed (bypass): {tool} — {head}', 'Auto-allowed (bypass), but the CLI did not run it: {tool} — {why}', 'Answer Claude Code’s own safety prompts in bypass mode', 'Auto-allowed under bypass', '{n} this run']) {
    ok(`zh + ja carry "${k.slice(0, 44)}"`, zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'));
  }
  ok('zh says 自动放行（bypass）', zh.includes('"自动放行（bypass）：{tool} — {head}"'));
  const cr = read('src/lib/chat-renderers.js');
  ok('the client draws the line from `say` (the card\'s words, a refused one in its own sentence)', /b\.say === 'bypass-auto-allow' \? bypassLineWords\(p\)/.test(cr) && /p\.refused\s*\? t\('Auto-allowed \(bypass\), but the CLI did not run it/.test(cr));
  ok('Session Properties shows the count; the session list carries it', /t\('Auto-allowed under bypass'\)/.test(read('src/lib/session-props.js')) && /autoAllowed: s\._autoAllowed \|\| 0/.test(read('server.js')));
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
