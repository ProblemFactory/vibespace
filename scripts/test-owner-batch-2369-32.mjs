#!/usr/bin/env node
// Owner batch 2.369.32 (six reports): codex resume keeps the LAST-run model,
// the wrapper pins a chosen model, sub-agent threads hidden by default, the
// codex ⟳ refreshes codex, auto-resume's continue prompt is labelled, a 0%
// bucket says "not started". Functional where the code is a module; pins for
// the client + wrapper text.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 300) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── codex model continuity: lastCodexTurnModel reads the rollout tail ──
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ob32-'));
process.env.HOME = home; process.env.CODEX_HOME = path.join(home, '.codex');
const dir = path.join(home, '.codex', 'sessions', '2026', '09', '05'); fs.mkdirSync(dir, { recursive: true });
const TID = '01a072a3-0d70-78c3-9a90-a69a61e14465';
const rec = (o) => JSON.stringify(o) + '\n';
fs.writeFileSync(path.join(dir, `rollout-2026-09-05T10-34-43-${TID}.jsonl`), [
  rec({ timestamp: '2026-09-05T17:34:43.568Z', type: 'session_meta', payload: { id: TID, cwd: '/w', originator: 'claude-code-webui', model_provider: 'openai' } }),
  rec({ timestamp: '2026-09-05T17:49:40.476Z', type: 'turn_context', payload: { cwd: '/w', model: 'gpt-5.6-sol' } }),
  rec({ timestamp: '2026-09-05T18:10:00.000Z', type: 'turn_context', payload: { cwd: '/w', model: 'gpt-5.6-sol' } }),
  rec({ timestamp: '2026-09-05T19:50:26.447Z', type: 'turn_context', payload: { cwd: '/w', model: 'gpt-6-astra' } }),
  rec({ timestamp: '2026-09-05T19:51:00.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok "model":"gpt-5.6-sol" mentioned in prose' }] } }),
].join(''));
const CX = require(path.join(REPO, 'src/adapters/codex.js'));
ok(CX.lastCodexTurnModel(TID) === 'gpt-6-astra', 'lastCodexTurnModel = the LAST turn_context model (prose mentions of other models are ignored)');
ok(CX.lastCodexTurnModel('00000000-0000-4000-8000-000000000000') === null, 'unknown thread → null (resume falls back to the default)');
const wc = read('src/ws-create.js');
ok(/if \(!sessionSpec\.env\.CODEX_WEBUI_MODEL\) \{ try \{ const lm = lastCodexTurnModel\(data\.resumeId\); if \(lm\) sessionSpec\.env\.CODEX_WEBUI_MODEL = lm; \} catch \{ \} \}/.test(wc) && /findCodexSessionJsonlPath, lastCodexTurnModel/.test(wc), 'ws-create: a codex resume without an explicit model carries the last-run model (client choice still wins when sent)');
const w = read('data/bin/codex-chat-wrapper.js');
ok(/meta\.model = meta\.modelPinned \? \(meta\.model \|\| resp\?\.model \|\| thread\.model \|\| ''\) : \(resp\?\.model \|\| thread\.model \|\| meta\.model\);/.test(w) && /meta\.modelPinned = !!msg\.model;/.test(w) && /modelPinned: !!model,/.test(w), 'wrapper: a chosen model is pinned — thread/resume or thread/name/set responses never revert it to the thread START model');

// ── auto-resume continue prompt labelled (claude + codex normalizers) ──
const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
const mm = new MessageManager('s1'); const ops = []; mm.onOp((o) => ops.push(o));
mm.processLive({ type: 'user', _fromWebui: true, originKind: 'auto-resume', message: { role: 'user', content: [{ type: 'text', text: 'You can continue now. Continue the task you were working on when the usage limit was reached; do not repeat work that is already complete.' }] } });
const um = mm.messages.find((m) => m.role === 'user');
ok(um && um.originKind === 'auto-resume' && um.typed !== true, 'claude normalizer: the server-tagged continue record carries originKind auto-resume (not "typed")');
mm.processLive({ type: 'user', _fromWebui: true, message: { role: 'user', content: [{ type: 'text', text: 'real prompt' }] } });
ok(mm.messages.filter((m) => m.role === 'user')[1].typed === true && !mm.messages.filter((m) => m.role === 'user')[1].originKind, 'negative control: a typed prompt stays typed');
const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
const cm = new CodexMessageManager('c1');
cm.processLive({ timestamp: new Date().toISOString(), type: 'response_item', _fromWebui: true, payload: { type: 'message', role: 'user', webui_msg_id: '1-auto', webui_origin: 'auto-resume', content: [{ type: 'input_text', text: 'You can continue now.' }] } });
ok(cm.messages.find((m) => m.role === 'user')?.originKind === 'auto-resume', 'codex normalizer: webui_origin auto-resume → originKind auto-resume');
ok(/userMsg\.originKind = 'auto-resume'; if \(userMsg\.payload\) userMsg\.payload\.webui_origin = 'auto-resume';/.test(read('server.js')), 'server.js sendToSession tags the continue record for BOTH harness shapes');
const cr = read('src/lib/chat-renderers.js');
ok(/if \(msg\.originKind === 'auto-resume'\) \{[\s\S]{0,600}chat-msg-auto-resume[\s\S]{0,400}VibeSpace auto-resume — sent automatically after the usage limit cleared/.test(cr), 'chat-renderers renders the auto-resume prompt as a labelled VibeSpace card');
ok(['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].every((f) => read(f).includes('"VibeSpace auto-resume — sent automatically after the usage limit cleared":') && read(f).includes('"not started":')), 'zh/ja carry the new strings');

// ── sidebar: primary-only default ──
const sb = read('src/lib/sidebar.js');
ok(/this\._agentKindFilter = storedKind == null \? 'primary' : \(storedKind === 'all' \? '' : storedKind\);/.test(sb) && /localStorage\.setItem\('agentKindFilter', 'all'\)/.test(sb), 'sidebar: no stored choice ⇒ PRIMARY only; ALL persists explicitly');

// ── usage popup: codex ⟳ dispatch + not-started reset ──
const um2 = read('src/lib/usage-meter.js');
const iCodex = um2.indexOf("e.target.closest('.usage-refresh-codex-btn')"), iGeneric = um2.indexOf("e.target.closest('.usage-refresh-btn')");
ok(iCodex > 0 && iGeneric > 0 && iCodex < iGeneric, 'usage-meter: the codex ⟳ (both classes) is dispatched BEFORE the generic claude ⟳');
ok(/const fmtReset = \(ts, util\) => \{/.test(um2) && (um2.match(/fmtReset\([^)]*, [^)]*utilization\)/g) || []).length === 5 && /t\('not started'\)/.test(um2), "usage-meter: every reset cell passes utilization; 0% with no reset time renders 'not started' (tooltip explains)");

fs.rmSync(home, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
