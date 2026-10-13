#!/usr/bin/env node
// THE DOC WINDOW'S SEND SAYS WHAT IT WILL DO AND WHAT IT DID (lane doc-comments-ui, B-8199 — owner 2026-10-12 with eighteen
// comments on the strip: "请问我现在该干啥"). PURE legs over src/lib/doc-window-model.js (sendAllLabel / sendWords) fed by
// the REAL packer (src/doc-model.js commentsBatches) and the REAL engine (src/server/doc-engine.js comments() over stub
// senders) + source pins on the strip (src/lib/doc-window-ui.js):
//   §1 Send all's label previews the shape: 18 rows that pack into 3 messages ⇒ "Send all (18 → 3 messages)", one message ⇒
//      "Send all (3)", in flight ⇒ "Sending 18 comments…" (one POST — no per-batch progress); a plan the packer refuses ⇒ the count.
//   §2 the words by `delivered`: sent / sent in m messages / ONE comment / STASHED (never "Sent") / part-way / clipped / no
//      owner (null — the owner line says it) / failed; each from the engine's real answer; RED CONTROL: a patched model whose
//      stash branch says "Sent" goes red.
//   §3 every word has zh + ja; the strip's wiring: a row's ➤ = send([row]) beside ✕, Send all = send(every row), ONE send
//      door painting the label, rows held still while out, the toast carries the words.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { dictEntries } from './i18n-extract.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 400) : '')); } };
const M = require('../src/doc-model.js');
const DE = require('../src/server/doc-engine.js');
const MODEL = path.join(ROOT, 'src/lib/doc-window-model.js');
const { sendAllLabel, sendWords } = await import(pathToFileURL(MODEL).href);
const used = new Set();
const t = (s, p = {}) => { used.add(s); return s.replace(/\{(\w+)\}/g, (_, k) => String(p[k])); };
const DOC = '/proj/docs/SEND.md';
const rowsOf = (n, len) => Array.from({ length: n }, (_, i) => ({ id: 'r' + (i + 1), quote: 'Step ' + (i + 1) + ' of the plan', line: i + 3, note: ('note ' + (i + 1) + ' ').padEnd(len, 'x') }));

console.log('§1 Send all previews the send\'s shape');
const R18 = rowsOf(18, 500), P18 = M.commentsBatches(DOC, R18);
ok(P18.ok && P18.batches.length === 3 && P18.batches.map((b) => b.count).join() === '7,7,4', 'fixture: 18 rows of 500-char notes pack into 3 messages (7, 7, 4) — the packer the server runs', P18.batches && P18.batches.map((b) => b.count));
ok(sendAllLabel(t, { n: 18, plan: P18 }) === 'Send all (18 → 3 messages)', '18 rows ⇒ "Send all (18 → 3 messages)"', sendAllLabel(t, { n: 18, plan: P18 }));
ok(sendAllLabel(t, { n: 3, plan: M.commentsBatches(DOC, rowsOf(3, 40)) }) === 'Send all (3)', 'three short rows (one message) ⇒ "Send all (3)" — no arrow');
ok(sendAllLabel(t, { n: 18, sending: true }) === 'Sending 18 comments…' && sendAllLabel(t, { n: 1, sending: true }) === 'Sending 1 comment…', 'in flight ⇒ "Sending 18 comments…" / "Sending 1 comment…" (one POST; no fake per-batch progress)');
ok(sendAllLabel(t, { n: 4, plan: M.commentsBatches('notes.txt', rowsOf(4, 40)) }) === 'Send all (4)' && sendAllLabel(t, { n: 2 }) === 'Send all (2)', 'a plan the packer refuses (or none) ⇒ just the count');

console.log('§2 the answer said by what happened — from the engine\'s real answers');
function engine(mode) {
  const stashed = [];
  let calls = 0;
  const activeSessions = new Map([['w1', { mode: 'chat', backend: 'claude', claudeSessionId: 'conv-1' }]]);
  const sendUserInput = () => { calls++; if (mode === 'sent') return { ok: true, msgId: 'm' + calls }; if (mode === 'stopped') return { ok: false, code: 'not_chat', error: 'not a live chat session' }; return calls <= 1 ? { ok: true, msgId: 'm1' } : { ok: false, code: 'input_rejected', error: 'the CLI refused' }; };
  const doc = DE.create({ activeSessions, getDeliver: () => ({ stashFor: (cid, e) => { stashed.push({ cid, ...e }); return { stored: true }; } }), sendUserInput, artifacts: null, now: () => 7 });
  return { send: (items) => doc.comments({ path: DOC, from: 'w1', items }), stashed };
}
const say = (r, n) => sendWords(t, r, n);
const sent18 = engine('sent').send(R18);
ok(sent18.ok && sent18.delivered === 'sent' && say(sent18, 18).words === 'Sent 18 comments in 3 messages' && say(sent18, 18).kind === 'sent', 'sent in 3 messages ⇒ "Sent 18 comments in 3 messages"', say(sent18, 18));
const sent1 = engine('sent').send(R18.slice(6, 7));
ok(sent1.ok && sent1.count === 1 && say(sent1, 1).words === 'Sent 1 comment', 'a row\'s ➤ (one item) ⇒ "Sent 1 comment"', say(sent1, 1));
ok(say(engine('sent').send(rowsOf(3, 40)), 3).words === 'Sent 3 comments', 'three in one message ⇒ "Sent 3 comments"');
const st = engine('stopped'), stash18 = st.send(R18);
ok(stash18.ok && stash18.delivered === 'stashed' && st.stashed.length === 3, 'fixture: a stopped owner (no typing session) ⇒ the engine stashes the 3 messages', { delivered: stash18.delivered, n: st.stashed.length });
const sw = say(stash18, 18);
ok(sw.kind === 'stashed' && sw.words === 'Stashed 18 comments — the conversation is not running; they are delivered when its next turn starts' && !/\bSent\b/.test(sw.words), 'stashed ⇒ "Stashed 18 comments — … delivered when its next turn starts", never "Sent"', sw);
ok(say(engine('stopped').send(R18.slice(0, 1)), 1).words === 'Stashed 1 comment — the conversation is not running; it is delivered when its next turn starts', 'one stashed ⇒ the singular words');
const part = engine('partial').send(R18);
ok(!part.ok && part.sent === 7 && say(part, 18).words === 'Sent 7 of 18 — the rest are still here' && say(part, 18).kind === 'partial', 'a failure after the first message ⇒ "Sent 7 of 18 — the rest are still here"', { part: { ok: part.ok, sent: part.sent }, w: say(part, 18) });
const long = R18.slice(0, 2).map((c) => ({ ...c, quote: '引'.repeat(200), note: '😀'.repeat(1000) })).concat(rowsOf(3, 40)), clip = engine('sent').send(long); // 4-byte notes: an item past one message alone
ok(clip.ok && clip.clipped > 1 && say(clip, 5).words.endsWith(` + ${clip.clipped} notes were shortened to fit`), 'clipped notes ⇒ "+ {k} notes were shortened to fit" appended', { clipped: clip.clipped, w: say(clip, 5) });
ok(say({ ok: true, delivered: 'stashed', count: 2, messages: 1, clipped: 1 }, 2).words.endsWith('they are delivered when its next turn starts + 1 note was shortened to fit'), '…one clipped ⇒ the singular, after the stash words');
ok(say({ ok: false, code: 'no_owner', error: 'x' }, 3) === null, 'no owner ⇒ null (the strip\'s owner line says it)');
ok(say({ ok: false, code: 'send_failed', error: 'the comments were not sent' }, 3).words === 'Could not send the comments: the comments were not sent' && say(null, 3).words === 'Could not send the comments: the server did not answer', 'a failure before any message / no answer ⇒ "Could not send the comments: …"');
// RED CONTROL: the stash said as a send (the pre-lane toast family) ⇒ the stash leg goes red
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcsend-'));
const src = fs.readFileSync(MODEL, 'utf8'), from = "const stashed = r.delivered === 'stashed';";
const pf = path.join(tmp, 'model.mjs'); fs.writeFileSync(pf, src.replace(from, 'const stashed = false;'));
const bad = (await import(pathToFileURL(pf).href)).sendWords(t, stash18, 18);
ok(src.includes(from) && /^Sent /.test(bad.words), 'RED CONTROL: a patched model that ignores `delivered` says "Sent 18 …" for the stash — the stash leg would be red', bad.words);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('§3 zh + ja, and the strip\'s wiring');
for (const lang of ['zh', 'ja']) {
  const keys = new Set([...dictEntries(fs.readFileSync(path.join(ROOT, `src/lib/i18n-${lang}.js`), 'utf8'))].map((e) => e.key));
  const miss = [...used].filter((k) => !keys.has(k));
  ok(used.size >= 14 && !miss.length, `every send word has a ${lang} entry (${used.size} words)`, miss);
}
const ui = fs.readFileSync(path.join(ROOT, 'src/lib/doc-window-ui.js'), 'utf8');
ok(/import \{[^}]*\bsendAllLabel, sendWords \} from '\.\/doc-window-model\.js';/.test(ui), 'the strip paints the model\'s words (sendAllLabel / sendWords imported)');
ok(ui.includes("mk('button', 'doc-cmt-send')") && ui.includes('glyph(I.send)') && ui.includes("t('Send this one')") && ui.includes('if (row) send([row]);') && ui.includes('acts.append(one, x)'), 'a row\'s ➤ (the send glyph, tooltip "Send this one") sits beside its ✕ and sends THAT row alone');
ok(ui.includes("btnSend.addEventListener('click', () => send(comments.slice()), { signal });") && (ui.match(/fetchJson\('\/api\/doc\/comments'/g) || []).length === 1, 'Send all and the ➤ share ONE send door (one POST site)');
ok(/function renderSend\(\) \{[\s\S]{0,400}sendAllLabel\(t, S\.sending \? \{ n: S\.sendingN, sending: true \} : \{ n: comments\.length, plan: comments\.length \? M\.commentsBatches\(path, comments\) : null \}\);[\s\S]{0,200}btnSend\.disabled = S\.sending;[\s\S]{0,200}\.doc-cmt-acts button'\)\) b\.disabled = S\.sending;/.test(ui) && ui.includes('btnSend.hidden = !comments.length; renderSend();'), 'the label is re-painted with every strip paint; while out the button and every row\'s glyphs are disabled');
ok(ui.includes('const w = sendWords(t, r, batch.length);') && ui.includes('showToast(w.words,') && !/Comments sent to the chat|Comments wait for the chat/.test(ui), 'the toast and the status chip carry the words (the old one-size toasts are gone)');
ok(/\.doc-phone \.doc-cmt-acts button\{min-width:36px\}/.test(ui) && /\.doc-send\{[^}]*white-space:normal/.test(ui), 'the phone: 36 px row glyphs; the button label wraps');

console.log(`\n${fail ? '✗' : '✓'} test-doc-comment-send: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
