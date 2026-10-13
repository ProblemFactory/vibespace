#!/usr/bin/env node
// test-voice-model — Dropline voice input P0 (design q-029 §3 / §5 / §4.1): the PURE src/voice-model.js.
//   ① dictationContext: every field's clip rule (title 200, before = tail 1 000 sentence-aligned, after 500,
//      selected 2 000), the owner's `text` override (last ≤ 6 user + agent TEXT messages, agent head 400, user 300,
//      cwd name line, ≤ 20 identifiers line, whole ≤ 1 500) and the 4 KB whole (CJK = 3 bytes)
//   ② the NEVER-list: tool calls / tool results / thinking / system cards / hook frames / credentials / env / e-mail
//      never reach a context — and the same check is RED on a mutant that lets them through (the control)
//   ③ voiceWords: every code has words, an i18n key in zh AND ja, and the closed action set
//   ④ the vendor contract: multipart part ORDER request → context → audio, locale / language mapping, the answer shape
//   ⑦ proposalCandidates (lane voice-teach-candidates, userW 2026-10-13): the screenshot's Lark conversation proposes
//      ≤ 12 words a person says (RED control = the base's proposal source termsOf, ≥ 40 incl. six ids / field names),
//      the SHAPE_EXCLUSIONS census (each row's term + a copy without that row lets it through), the preselection rule
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const VM = require(path.join(REPO, 'src/voice-model.js'));
const L = VM.VOICE_LIMITS;
const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
const msg = (role, ...blocks) => ({ role, content: blocks });
const txt = (text) => ({ type: 'text', text });

console.log('① dictationContext — the clip rules');
{
  const c = VM.dictationContext({ title: 'T'.repeat(300), before: 'x', after: 'A'.repeat(900), selected: 'S'.repeat(2500) });
  ok('app is always VibeSpace; title ≤ 200; after = head 500; selected ≤ 2 000', c.app === 'VibeSpace' && c.title.length === 200 && c.after === 'A'.repeat(500) && c.selected.length === 2000, { t: c.title.length, a: c.after.length, s: c.selected.length });
  const before = 'old words. '.repeat(150) + 'Now the last sentence here';
  const b = VM.dictationContext({ before }).before;
  ok('before = the TAIL ≤ 1 000, cut forward to a sentence start when one is near', b.length <= 1000 && b.endsWith('Now the last sentence here') && /^old words\./.test(b), b.slice(0, 40));
  ok('a short before is kept whole', VM.dictationContext({ before: 'hello' }).before === 'hello');
  ok('no url key is ever sent (§3: the hub address has no recognition value)', !('url' in VM.dictationContext({ title: 'x', before: 'y' })));
  const empty = VM.dictationContext({});
  ok('nothing known ⇒ just {app}', JSON.stringify(empty) === '{"app":"VibeSpace"}', empty);
}

console.log('① the owner\'s `text` override — last ≤ 6 user + agent TEXT messages');
{
  const msgs = [];
  for (let i = 1; i <= 9; i++) msgs.push(msg(i % 2 ? 'user' : 'assistant', txt(`message number ${i}`)));
  const t1 = VM.dictationContext({ messages: msgs, cwd: '/home/u/projects/vibespace' }).text.split('\n');
  ok('the LAST 6, in order, then the cwd name line', t1.slice(0, 6).join('|') === 'agent: message number 4|user: message number 5|agent: message number 6|user: message number 7|agent: message number 8|user: message number 9' && t1[6] === 'vibespace', t1);
  const long = VM.dictationContext({ messages: [msg('assistant', txt('a'.repeat(900))), msg('user', txt('u'.repeat(900)))] }).text.split('\n');
  ok('agent head-clipped to 400, user to 300', long[0] === 'agent: ' + 'a'.repeat(400) && long[1] === 'user: ' + 'u'.repeat(300), long.map((l) => l.length));
  const ids = VM.dictationContext({ messages: [msg('assistant', txt('Edit src/lib/chat-input.js and voice-model.js: dictationContext calls stripFrames, see VoiceWords and dropline_client'))], cwd: '/w/repo' }).text.split('\n');
  ok('③ the identifiers line: file names (no dirs), camelCase, PascalCase, snake_case', ids[2] === 'chat-input.js voice-model.js dictationContext stripFrames VoiceWords dropline_client' && ids[1] === 'repo', ids);
  const many = Array.from({ length: 40 }, (_, i) => `file${i}.js`).join(' ');
  const idl = VM.dictationContext({ messages: [msg('user', txt(many.slice(0, 290)))] }).text.split('\n').pop().split(' ');
  ok('≤ 20 identifiers', idl.length === 20, idl.length);
  const big = Array.from({ length: 6 }, (_, i) => msg('assistant', txt(`${i} `.repeat(300))));
  const tb = VM.dictationContext({ messages: big, cwd: '/x/proj' }).text;
  ok('the whole text ≤ 1 500 and the NEWEST message survives the budget', tb.length <= L.textChars && tb.includes('agent: 5 5') && tb.endsWith('proj'), tb.length);
}

console.log('① the 4 KB whole');
{
  const cjk = '汉'.repeat(1400);
  const c = VM.dictationContext({ title: cjk, before: cjk, after: cjk, selected: cjk + cjk, messages: [msg('assistant', txt(cjk)), msg('user', txt(cjk))] });
  ok('a CJK-heavy context is ≤ 4 096 bytes (UTF-8, JSON as sent)', bytes(c) <= L.contextBytes && VM.contextBytes(c) === bytes(c), bytes(c));
  ok('… and still carries every field (shrunk, not dropped)', ['title', 'before', 'after', 'selected', 'text'].every((k) => c[k] && c[k].length > 10), Object.keys(c));
  const hub = VM.contextFromClient(JSON.stringify({ title: 'x', before: 'b'.repeat(5000), text: 't'.repeat(9000), url: 'http://h:3456/', apiKey: 'dl_zzzzzzzzzzzz' }));
  ok('the hub re-cut: only §3 keys survive, each clipped again, ≤ 4 KB', !('url' in hub) && !('apiKey' in hub) && hub.text.length <= 1500 && hub.before.length <= 1000 && bytes(hub) <= 4096, Object.keys(hub));
  ok('the hub re-cut: an unparseable ctx is no context at all', JSON.stringify(VM.contextFromClient('{nope')) === '{"app":"VibeSpace"}');
}

console.log('② the never-list (and its RED control)');
const NEVER = [
  msg('assistant', { type: 'thinking', text: 'THINKING_2 private' }, { type: 'tool_use', name: 'Bash', input: { command: 'cat TOOLCALL_3' }, text: 'TOOLCALL_3' }),
  msg('user', { type: 'tool_result', content: 'TOOLRESULT_4 output', text: 'TOOLRESULT_4' }),
  msg('system', txt('SYSTEMCARD_5 permission card')),
  msg('assistant', txt('your key is dl_abcdefghijklmnop and ANTHROPIC_API_KEY=sk-ant-xyz123456789012 mail me at owner@example.com, token: hunter2secret')),
  msg('user', txt('<vibespace-task-context>FRAME_6 group state</vibespace-task-context>real words')),
  msg('user', txt('please read <system-reminder>SECRET_FRAME_1 hook text</system-reminder> the notes')),
];
const NEEDLES = ['SECRET_FRAME_1', 'THINKING_2', 'TOOLCALL_3', 'TOOLRESULT_4', 'SYSTEMCARD_5', 'dl_abcdefghijklmnop', 'sk-ant', 'owner@example.com', 'hunter2secret', 'FRAME_6', 'ANTHROPIC_API_KEY'];
const neverLeaks = (M) => { const c = M.dictationContext({ messages: NEVER, cwd: '/a/b', before: 'see owner@example.com', title: 'x' }); const s = JSON.stringify(c); return { leaked: NEEDLES.filter((n) => s.includes(n)), c }; };
{
  const r = neverLeaks(VM);
  ok('no tool call / tool result / thinking / system card / hook frame / key / env / e-mail reaches the context', r.leaked.length === 0, r.leaked);
  ok('… while the real words around them do', /please read\s+the notes/.test(r.c.text) && r.c.text.includes('real words'), r.c.text);
  // the RED control: a mutant that keeps every block (no text-only filter, no frame strip, no scrub) leaks — the check above can fail
  const src = fs.readFileSync(path.join(REPO, 'src/voice-model.js'), 'utf8');
  const cuts = [
    ["blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string')", 'blocks.filter((b) => b && typeof b.text === \'string\')'],
    ["if (!m || (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'agent')) continue;", 'if (!m) continue;'],
    ['  for (const re of SECRET_RES) s = s.replace(re, \'\');\n', ''],
    ['  do { prev = s; s = s.replace(FRAME_RE, \'\'); } while (s !== prev);\n', '  prev = s;\n'],
  ];
  let mut = src; const applied = cuts.map(([a, b]) => { const n = mut.split(a).length - 1; mut = mut.replace(a, b); return n; });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-model-'));
  fs.copyFileSync(path.join(REPO, 'src/assistant-note.js'), path.join(dir, 'assistant-note.js')); // voice-model requires it (PURE → PURE)
  try {
    fs.writeFileSync(path.join(dir, 'voice-model.js'), mut);
    const MM = require(path.join(dir, 'voice-model.js'));
    const m = neverLeaks(MM);
    ok('CONTROL: each never-list cut applies exactly once', applied.every((n) => n === 1), applied);
    ok('CONTROL: the mutant (tool blocks kept, frames kept, nothing scrubbed) LEAKS every needle ⇒ the check is RED on it', NEEDLES.every((n) => m.leaked.includes(n)), m.leaked);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// voice-verify F1: a compaction SUMMARY is a user TEXT block the chat draws as a system card — the never-list drops it by
// THE chat's own rule (src/assistant-note.js isCompactSummaryText, re-exported by chat-renderers), never a copy
{
  const SUMMARY = 'This session is being continued from a previous conversation that ran out of context. Summary: 1. Primary Request: COMPACTSUMMARY_9 secretPlanName';
  const MSUM = [msg('user', txt(SUMMARY)), msg('assistant', txt('Picked up: `parseConfig` next.')), msg('user', txt('now fix the loader'))];
  const sumLeaks = (M) => {
    const d = JSON.stringify(M.dictationContext({ messages: MSUM, cwd: '/w/vs', title: 'x' })), t = M.teachContextOf({ title: 'x', messages: MSUM, cwd: '/w/vs' }).text, terms = M.termsOf({ messages: MSUM });
    return { d, t, terms, leaked: d.includes('COMPACTSUMMARY_9') || t.includes('COMPACTSUMMARY_9') || terms.includes('secretPlanName') };
  };
  const r = sumLeaks(VM);
  ok('a compaction SUMMARY never enters a dictation context, the teach context or the terms (voice-verify F1)', !r.leaked && r.d.includes('now fix the loader') && r.t.includes('parseConfig'), r);
  const AN = require(path.join(REPO, 'src/assistant-note.js'));
  const vmSrc = fs.readFileSync(path.join(REPO, 'src/voice-model.js'), 'utf8'), crSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
  ok('… by ONE rule: voice-model requires assistant-note\'s isCompactSummaryText, chat-renderers re-exports that same one, neither spells the summary\'s head', AN.isCompactSummaryText(SUMMARY) && /require\('\.\/assistant-note\.js'\)/.test(vmSrc) && /export \{ isCompactSummaryText \} from '\.\.\/assistant-note\.js'/.test(crSrc) && ![vmSrc, crSrc].some((s) => s.includes('continued from a previous conversation')));
  const anchor = "    if (m.role === 'user' && isCompactSummaryText(raw)) continue;\n";
  const src = fs.readFileSync(path.join(REPO, 'src/voice-model.js'), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-model-'));
  try {
    fs.copyFileSync(path.join(REPO, 'src/assistant-note.js'), path.join(dir, 'assistant-note.js'));
    fs.writeFileSync(path.join(dir, 'vm-sum.js'), src.replace(anchor, ''));
    ok('CONTROL: a copy without the summary skip lets the summary into all three ⇒ the check above is RED on it', src.split(anchor).length === 2 && sumLeaks(require(path.join(dir, 'vm-sum.js'))).leaked);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // voice-verify F8 (low): a JWT and a fine-grained GitHub token are secret shapes too
  // the shapes are joined at run time so the repo's own secret scan never reads a token-shaped literal (int260)
  const JWT8 = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N'].join('.'), PAT8 = ['github', 'pat', '11ABCDEFG0123456789', 'abcdefghijklmnop'].join('_');
  const s8 = JSON.stringify(VM.dictationContext({ messages: [msg('user', txt(`use ${JWT8} and ${PAT8} please`))] }));
  ok('a JWT and a github_pat_ token are scrubbed (voice-verify F8)', !/eyJhbGci|github_pat_11/.test(s8) && s8.includes('please'), s8);
}

console.log('③ voiceWords — every code');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const need = ['insecure', 'denied', 'not-connected', 'reconnect', 'rate-limited', 'too-long', 'audio-invalid', 'failed', 'raw-inserted', 'offline', 'inserted', 'listening'];
  ok('§5 rows all present (insecure, denied, not-connected / reconnect, 429, 413/170 s, 422, 5xx, rewrite skipped, offline) + the chip + the placeholder', need.every((c) => VM.VOICE_CODES.includes(c)), need.filter((c) => !VM.VOICE_CODES.includes(c)));
  for (const code of VM.VOICE_CODES) {
    const w = VM.voiceWords(code, { n: 7, url: 'http://localhost:<port>' });
    const key = '  ' + JSON.stringify(w.words) + ':';
    ok(`${code}: words + zh + ja + a known action`, w.code === code && w.words.length > 5 && zh.includes(key) && ja.includes(key) && [null, 'copy-url', 'open-plugin', 'undo', 'resend'].includes(w.action), { code, zh: zh.includes(key), ja: ja.includes(key) });
  }
  ok('insecure offers the localhost address to copy; rate-limited names {n}; the not-connected rows open the plugin card', VM.voiceWords('insecure').action === 'copy-url' && VM.voiceWords('insecure').words.includes('{url}') && VM.voiceWords('rate-limited').words.includes('{n}') && VM.voiceWords('not-connected').action === 'open-plugin' && VM.voiceWords('reconnect').action === 'open-plugin');
  ok('an unknown code says the generic failure (never silence)', VM.voiceWords('zzz').code === 'failed');
  ok('failureCodeOf: 401/403 ⇒ reconnect, 413 ⇒ too-long, 422 audio_invalid ⇒ audio-invalid, 429 ⇒ rate-limited, 5xx ⇒ failed', VM.failureCodeOf(401) === 'reconnect' && VM.failureCodeOf(403) === 'reconnect' && VM.failureCodeOf(413) === 'too-long' && VM.failureCodeOf(422, 'audio_invalid') === 'audio-invalid' && VM.failureCodeOf(422, 'bad_request') === 'failed' && VM.failureCodeOf(429) === 'rate-limited' && VM.failureCodeOf(503) === 'failed');
}

console.log('④ the vendor contract');
{
  ok('multipart parts in the documented order: request → context → audio', VM.DICTATE_PART_ORDER.join() === 'request,context,audio');
  ok('locale from the UI language (zh-CN / ja-JP / en-US)', VM.localeOf('zh') === 'zh-CN' && VM.localeOf('ja') === 'ja-JP' && VM.localeOf('en') === 'en-US' && VM.localeOf('') === 'en-US');
  ok('language from the plugin preference (auto | zh | en; anything else ⇒ auto)', VM.languageOf('zh') === 'zh' && VM.languageOf('en') === 'en' && VM.languageOf('ja') === 'auto' && VM.languageOf(undefined) === 'auto');
  const rq = VM.dictateRequestOf({ language: 'en', uiLang: 'ja' });
  ok('request = dictate, single_line:false (the chat box is multi-line), locale + language', JSON.stringify(rq) === '{"mode":"dictate","language":"en","locale":"ja-JP","single_line":false}', rq);
  const a = VM.dictateAnswerOf({ request_id: 'dct_1', final_text: 'Hello.', transcript: { text: 'hello', language: 'en' }, rewrite: { status: 'skipped', reason: 'x' }, timings_ms: { total: 9 } });
  ok('the answer = {text: final_text, rewrite, language: transcript.language, request_id}', a.text === 'Hello.' && a.rewrite.status === 'skipped' && a.language === 'en' && a.request_id === 'dct_1' && Object.keys(a).join() === 'text,rewrite,language,request_id', a);
  ok('the recorder numbers: opus webm 32 kbps, auto-stop 170 s < 180 s, 170 s ≈ 680 KB ≪ 8 MB', VM.RECORDER_MIME === 'audio/webm;codecs=opus' && L.bitsPerSecond === 32000 && L.autoStopSeconds === 170 && L.maxSeconds === 180 && (L.bitsPerSecond / 8) * L.autoStopSeconds < L.maxBytes / 10);
}

// ── P1 (lane voice-p1-oauth-teach): termsOf / termKind / teachContextOf + the never-list (RED control on a copy) ──
{
  const KIND = [['commentsBatches', 'ident'], ['DocWindowUi', 'ident'], ['dictation_context', 'ident'], ['doc-window-ui.js', 'file'], ['README.md', 'file'], ['github.com', 'name'], ['Zephyr Team', 'name'], ['kickoff', 'name']];
  const bad = KIND.filter(([w, k]) => VM.termKind(w) !== k);
  ok('termKind table: camel / Pascal / snake = ident, name.ext = file (a host name is not), the rest = name', !bad.length, bad);
  const MS = [
    { role: 'user', content: [{ type: 'text', text: 'open doc-window-ui.js, fix commentsBatches; key dl_abcdefghijklmnop1234 and API_TOKEN=s3cr3tValue, mail ana@example.test, see https://github.com/x?y=1 <system-reminder>hiddenCamelWord</system-reminder>' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Edited src/doc-model.js and dictation_context; VibeSpace keeps it.' }, { type: 'tool_use', name: 'Bash', input: { command: 'cat toolOnlyName.js' } }] },
    { role: 'system', content: [{ type: 'text', text: 'systemOnlyWord' }] },
  ];
  const terms = VM.termsOf({ messages: MS, files: ['/w/vs/src/lib/chat-input.js'], groupName: 'Voice Lane', known: ['vibespace', 'README.md'] });
  ok('termsOf: file names (given + named) + identifiers + the Task Group name, minus the dictionary (case-insensitive)', ['chat-input.js', 'doc-window-ui.js', 'commentsBatches', 'doc-model.js', 'dictation_context', 'Voice Lane'].every((t) => terms.includes(t)) && !terms.includes('VibeSpace'), terms);
  const leak = (xs) => xs.filter((t) => /dl_abc|s3cr3t|API_TOKEN|ana@|example\.test|github|hiddenCamelWord|toolOnlyName|systemOnlyWord/.test(t));
  ok('termsOf never-list: no key, env assignment, e-mail, URL host, harness frame, tool argument or system row', !leak(terms).length, leak(terms));
  ok('termsOf ≤ max, distinct', VM.termsOf({ messages: [{ role: 'user', text: Array.from({ length: 80 }, (_, i) => `wordName${i}`).join(' ') }], max: 50 }).length === 50);
  const c = VM.teachContextOf({ title: 'Doc comments', messages: MS, cwd: '/w/vibespace' });
  const LEAK_RE = /dl_abc|s3cr3t|ana@example|hiddenCamelWord|toolOnlyName|systemOnlyWord/;
  ok('teachContextOf: title, source VibeSpace, the person\'s + the agent\'s text, the working directory, Files: — ≤ 6 000', c.title === 'Doc comments' && c.source === 'VibeSpace' && c.text.includes('commentsBatches') && c.text.includes('Working directory: vibespace') && /Files: .*doc-window-ui\.js/.test(c.text) && c.text.length <= 6000, c);
  ok('teachContextOf never-list: no key, env value, e-mail, frame, tool row or system row', !LEAK_RE.test(c.text), c.text);
  ok('teachContextOf cuts at 6 000', VM.teachContextOf({ messages: [{ role: 'assistant', text: 'x'.repeat(9000) }, { role: 'user', text: 'y '.repeat(5000) }] }).text.length <= 6000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-model-'));
  fs.copyFileSync(path.join(REPO, 'src/assistant-note.js'), path.join(dir, 'assistant-note.js')); // voice-model requires it (PURE → PURE)
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/voice-model.js'), 'utf8');
    const anchor = '  for (const re of SECRET_RES) s = s.replace(re, \'\');';
    fs.writeFileSync(path.join(dir, 'vm.js'), src.replace(anchor, '  // (mutant: the never-list scrub removed)'));
    const MM = require(path.join(dir, 'vm.js'));
    ok('CONTROL: a copy with the never-list scrub removed leaks the key into the context AND the terms ⇒ the two checks above are RED on it', src.split(anchor).length === 2 && LEAK_RE.test(MM.teachContextOf({ title: 't', messages: MS }).text));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('⑦ proposalCandidates — words a person SAYS (lane voice-teach-candidates)');
{
  const VM = require(path.join(REPO, 'src/voice-model.js'));
  const B = '`', F = '```';
  const user = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
  const agent = (text) => ({ role: 'assistant', content: [{ type: 'text', text }, { type: 'tool_use', name: 'Bash', input: { command: 'python3 lark_tool.py --chat oc_xxx' } }] });
  // the screenshot's card (userW: ~70 ticked terms) — the same words, in the shapes a Lark tool-heavy conversation has them
  const LARK = [
    user('用 lark_tool.py 查一下 Lark 群里昨天的消息，LarkClient 那个类要不要改？'),
    agent(`I read lark_tool.py: it builds a LarkClient from load_config and asks for a tenant_access_token (or a user_access_token with offline_access). Messages come back with ${B}om_id${B}, ${B}chat_id${B}, ${B}open_id${B}, ${B}union_id${B} and ${B}sender_type${B}; P2P chats use ${B}receive_id_type${B}=open_id.`),
    agent(`The thread walk: thread_id → thread_replies → threads_found; sorting is ${B}ByActiveTimeDesc${B}. The doc side lives in lark_bot.py and lark_docx_media.py: docx_token, obj_type, sheetId, blockInfo, blockToken, base_app_token, table_id, get_node.\n${F}\npython3 lark_tool.py send --as user send_as_user ou_7565 message_id cli_aa97b369e938ded2\n${F}`),
    user('Lark 的图片上传也顺便看看，lark_tool.py 里 replace_image 那段'),
    agent('Uploads: image_key from upload_prepare → upload_part → upload_finish (upload_all wraps them); a docx_image needs parent_type + parent_node, block_type 27, then update_text_elements; replace_image / replace_file swap a docx_file; drive_route_token for the drive route. Placeholders in the doc: oc_xxx, ou_xxx, om_xxx. batch_get_id resolves ids. LarkClient keeps the token; cli_aa97b369e938ded2 is the app id.'),
  ];
  const BAD6 = ['cli_aa97b369e938ded2', 'user_access_token', 'tenant_access_token', 'ou_7565', 'oc_xxx', 'receive_id_type'];
  const c = VM.proposalCandidates({ messages: LARK, cwd: '/w/lark' });
  const terms = c.map((x) => x.term);
  console.log(`    proposed (${terms.length}): ${c.map((x) => `${x.term} [${x.why} ${x.seen}/${x.byPerson}${x.pick ? ' ✓' : ''}]`).join(', ')}`);
  ok('the screenshot\'s conversation ⇒ ≤ 12 candidates, none of the six ids / field names', terms.length > 0 && terms.length <= 12 && !BAD6.some((b) => terms.includes(b)), terms);
  ok('…lark_tool.py and LarkClient rank in the top 3 (file / class names first), "Lark" (the person wrote it) is there too', terms.slice(0, 3).includes('lark_tool.py') && terms.slice(0, 3).includes('LarkClient') && terms.includes('Lark'), terms);
  ok('…no field name, code-span word or placeholder of the list survives', !terms.some((t) => /_(?:id|token|type|key)$|^(?:sheetId|blockInfo|blockToken|ByActiveTimeDesc|P2P|thread_replies|upload_part|om_xxx)$/.test(t)), terms);
  const base = VM.termsOf({ messages: LARK, cwd: '/w/lark' });
  ok(`RED CONTROL: the base's proposal source (termsOf — now the per-project tier's input only) on the same conversation ⇒ ${base.length} terms incl. all six`, base.length >= 40 && BAD6.every((b) => base.includes(b)), base.length);
  // the census: every row with a term only it rejects; a copy of voice-model.js without that row lets the term through
  const ROWS = { 'id-prefix': 'ou_abcdef', placeholder: 'oc_xxx', 'field-tail': 'chat_id', 'two-underscores': 'update_text_elements', 'digit-tail': 'item_42',
    'short-caps': 'P2P', host: 'feishu.cn', secret: 'dl_dummyfghijklmnopq', 'code-only': 'thread_replies' };
  ok('census: one row per SHAPE_EXCLUSIONS entry, no row without a term', VM.SHAPE_EXCLUSIONS.map(([r]) => r).join() === Object.keys(ROWS).join(), VM.SHAPE_EXCLUSIONS.map(([r]) => r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-cands-'));
  try {
    fs.copyFileSync(path.join(REPO, 'src/assistant-note.js'), path.join(dir, 'assistant-note.js')); // voice-model requires it (PURE → PURE)
    const src = fs.readFileSync(path.join(REPO, 'src/voice-model.js'), 'utf8');
    const said = (w) => w === 'thread_replies' ? { messages: [agent(`we walk ${w} first, then ${w} again`)] }       // the agent's prose twice
      : w.startsWith('dl_') ? { messages: [], groupName: w } : { messages: [user(`look at ${w} please`), agent(`yes, ${w} it is`)] };
    for (const [row, w] of Object.entries(ROWS)) {
      const anchor = `['${row}', (w`;
      const f = path.join(dir, `m-${row}.js`);
      fs.writeFileSync(f, src.replace(anchor, `['${row}', () => false, (w`));
      const M = require(f);
      const has = (V) => V.proposalCandidates(said(w)).some((x) => x.term === w);
      ok(`census ${row}: rejects ${w} (first row to match) — RED on a copy without the row`, src.split(anchor).length === 2 && VM.exclusionOf(w, { byPerson: w === 'thread_replies' ? 0 : 1 }) === row && !has(VM) && has(M));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // preselection: the person's words, and files / PascalCase names seen twice; a Capitalized word only the agent used waits unticked
  const P = VM.proposalCandidates({ messages: [user('ask jane.doe about the plan'), agent('Open Settings → Plugins; then Settings again. TeachEngine reads voice-model.js; voice-model.js and TeachEngine stay.')] });
  const pk = Object.fromEntries(P.map((x) => [x.term, x.pick]));
  ok('preselection: byPerson (jane.doe) and seen ≥ 2 file / PascalCase (voice-model.js, TeachEngine) start selected; an agent-only Capitalized word (Settings) does not', pk['jane.doe'] === true && pk['voice-model.js'] === true && pk.TeachEngine === true && pk.Settings === false, P);
  ok('…a word seen once and not by the person is no candidate at all (Plugins); the dictionary drops a known word', !('Plugins' in pk) && !VM.proposalCandidates({ messages: [user('ask jane.doe')], known: ['JANE.DOE'] }).length);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
