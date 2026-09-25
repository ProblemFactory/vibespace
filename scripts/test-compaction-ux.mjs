#!/usr/bin/env node
// Compaction UX (2.365.0, the userN "Prompt is too long" → "Compaction
// canceled." incident): ① the normalizer CLASSIFIES a prompt_too_long result
// error so the client can act on it (behavioral, real MessageManager);
// ② wiring pins — the /compact turn is labeled kind=compacting server-side,
// the attach meta carries it, the client guards Stop with a two-step confirm
// during it, and the error renders as a guidance card with a Compact-now
// button that sends through the live input.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── 1. normalizer classification (behavioral) ──
{
  const { MessageManager, classifyResultError } = require(REPO + '/src/message-manager.js');
  const fresh = () => { const mm = new MessageManager('t1'); const ops = []; mm.onOp((op) => ops.push(op)); return { mm, ops }; };
  const result = (text, extra = {}) => ({ type: 'result', subtype: 'error', is_error: true, result: text, session_id: 'c1', total_cost_usd: 1, ...extra });
  let { mm, ops } = fresh();
  mm.processLive(result('Prompt is too long'));
  let sys = ops.filter((o) => o.op === 'create' && o.message.role === 'system').map((o) => o.message);
  ok(sys.length === 1 && sys[0].status === 'error' && sys[0].errorKind === 'prompt-too-long', 'CLI "Prompt is too long" result → system error tagged errorKind=prompt-too-long', JSON.stringify(sys[0]));
  ok(/Error: Prompt is too long/.test(sys[0].content[0].text), 'the visible text is unchanged (card decorates, never rewrites)');
  ({ mm, ops } = fresh());
  mm.processLive(result('Input is too long for requested model'));
  sys = ops.filter((o) => o.op === 'create' && o.message.role === 'system').map((o) => o.message);
  ok(sys[0]?.errorKind === 'prompt-too-long', 'the API\'s other phrasing ("Input is too long for requested model") classifies the same');
  // NEGATIVE CONTROLS: other errors must not grow a Compact-now button
  ({ mm, ops } = fresh());
  mm.processLive(result('API Error: 500 Internal server error'));
  mm.processLive(result('Max turns reached', { subtype: 'error_max_turns' }));
  mm.processLive({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '', session_id: 'c1' });
  sys = ops.filter((o) => o.op === 'create' && o.message.role === 'system').map((o) => o.message);
  ok(sys.length === 3 && sys.every((m) => !m.errorKind), 'API 500 / max-turns / interrupted carry NO errorKind (negative control)');
  ok(classifyResultError(null) === null && classifyResultError('') === null, 'empty result text classifies as nothing');
  // a SUCCESS result never produces the tag (the regex is only consulted on error)
  ({ mm, ops } = fresh());
  mm.processLive({ type: 'result', subtype: 'success', is_error: false, result: 'the prompt is too long to fit on one slide, so I split it', session_id: 'c1' });
  ok(!ops.some((o) => o.op === 'create' && o.message.errorKind), 'a successful reply MENTIONING the phrase is not an error card');
}

// ── 2. wiring pins (the unstaged-wiring class) ──
{
  const ws = read('src/ws-handler.js');
  const ui = read('src/server/user-input.js'); // THE typing path (design-user-inbox-reply D1.1) — the ws chat-input case calls it
  ok(/\^\\\/compact\\b/.test(ui) && ui.includes("_streamingKind = 'compacting'") && ui.includes("kind: 'compacting'") && /sendUserInput\(data\.sessionId, data\.text/.test(ws), 'the typing path labels a /compact send kind=compacting and broadcasts it (the ws chat-input case sends through it)');
  ok(ws.includes('streamingKind: isStreaming ? (session._streamingKind || null) : null'), 'attach meta carries streamingKind (reconnect mid-compaction keeps the guard)');
  // S5: the parse pipelines live in src/server/stdout/<protocol>.js
  const so = ['claude-stream-json', 'codex-events', 'acp-events'].map((m) => read(`src/server/stdout/${m}.js`)).join('\n');
  // ROUND 7: the turn-end exits no longer write the field — they call the ONE
  // named retirement, which clears it AND broadcasts (a clear that does not
  // speak left the client stuck on "running <hook> hooks…"). This pin is the
  // twin of test-stdout-registry's CENSUS: that suite counts the writes, this
  // one checks the exits still go through the function. Both, or a refactor
  // moves the guarantee out from under one of them.
  ok(/retireCompaction\(session, id\); \/\/ says so if one was in flight/.test(so)
    && /if \(!eff\.streaming\) \{ session\._fallbackStopFired = false; retireCompaction\(session, id\); \}/.test(so)
    && /const endCompaction = \(sess, sid/.test(so),
    'turn end resets the kind THROUGH the named retirement (which also broadcasts) — both lifecycle exits, one writer');
  // AUTO compaction (round 4): the /compact SEND SITE above can only label a
  // compaction the user typed. The one that actually happens to a long session
  // — trigger:"auto" in the real production capture — is announced only by the
  // CLI's own `system/status`, so the Stop two-step guard now has a second,
  // send-site-independent source. Behavioural coverage + negative controls live
  // in test-stdout-registry leg ⓓ; this is the wiring pin.
  const csj = read('src/server/stdout/claude-stream-json.js');
  ok(/msg\.subtype === 'status'/.test(csj) && /st === 'compacting'/.test(csj) && /session\._streamingKind = 'compacting';/.test(csj),
    "the AUTO compaction the user never typed /compact for also arms the guard (system/status 'compacting')");
  ok((so.match(/kind: session\._streamingKind \|\| null/g) || []).length >= 2, 'every streaming-label broadcast carries the kind (API-retry relabels do not drop the guard)');
  ok(read('src/session-schema.js').includes('_streamingKind:'), '_streamingKind registered in the session schema');
  const ci = read('src/lib/chat-input.js');
  ok(ci.includes("kind === 'compacting'") && ci.includes('btn.dataset.armed') && ci.includes("t('Cancel compaction?')"), 'chat-input: Stop is a two-step confirm while compacting');
  ok(ci.includes('sendText(text, { carriesUserText = false } = {})') && /\^\\\/compact\\b/.test(ci), 'chat-input: programmatic sendText + immediate compacting label on a /compact send');
  const cv = read('src/lib/chat-view.js');
  // (2026-09-07) the three call sites now go through _onServerStreamLabel — the
  // ONE place that remembers the server's label so the live sub-agent counter
  // can yield back to it; the KIND must still ride every one of them.
  ok(cv.includes('this._onServerStreamLabel(msg.label, msg.kind || null)') && cv.includes('meta?.streamingKind || null') && cv.includes('msg.streamingKind || null')
    && /_onServerStreamLabel\(label, kind\) \{[\s\S]{0,420}this\._showTyping\(label, kind \|\| null\);/.test(cv),
  'chat-view passes the kind through live label, attach meta and chat-status paths (all via the ONE _onServerStreamLabel)');
  // Compact now is PRODUCT-authored text: it owns neither the pending-send slot
  // nor the draft store, so it passes `carriesUserText: false` explicitly (the
  // design request, whose payload is the user's own brief, passes true —
  // round-8; pinned end-to-end in test-queue-steer).
  ok(cv.includes("onSendText: (txt) => this._chatInput?.sendText(txt, { carriesUserText: false })"), 'chat-view hands renderers a null-safe onSendText with the ACTION semantics');
  const cr = read('src/lib/chat-renderers.js');
  ok(cr.includes("msg.errorKind === 'prompt-too-long'") && cr.includes('appendContextFullCard') && cr.includes("this._onSendText('/compact')"), 'renderer: prompt-too-long → guidance card whose Compact-now sends /compact');
  ok(cr.includes('else btn.remove();'), 'view-only windows get the explanation without a dead button');
  const css = read('public/chat.css');
  ok(css.includes('.chat-interrupt-armed') && css.includes('.chat-ctx-compact-btn'), 'styles present (theme vars only)');
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf('.chat-interrupt-armed'), css.indexOf('.chat-ctx-compact-btn:disabled'))), 'no literal colors in the new rules');
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
    const d = read(f);
    ok(d.includes("'Compact now'") && d.includes("'Cancel compaction?'") && d.includes('Click again to cancel the running compaction'), `${path.basename(f)} carries the new keys`);
  }
}
// ── 3. A COMPACTION RESOLVES THE CARDS BEFORE IT (inc-mu6btbfr-uaxg, owner:
// "我compact之后还提示compact now，容易误会"): the live compact_end/success frame
// only rewrote the hint while the button and the red title stayed, and a
// rebuild / page-in rendered the card on the fallback guidance again. Pure
// rule (which cards) + the renderer/view wiring that applies it on both
// carriers (the live frame, the CLI's summary user record).
{
  const { ctxFullCardsToResolve, isCompactSummaryText } = await import(path.join(REPO, 'src/lib/chat-renderers.js'));
  const T0 = Date.parse('2026-09-18T02:00:00Z');
  const cards = [{ ts: T0 }, { ts: T0 + 60000, resolved: true }, { ts: T0 + 120000 }, { ts: null }, { ts: String(T0 + 300000) }];
  ok(JSON.stringify(ctxFullCardsToResolve(cards)) === '[0,2,3,4]', 'no bound (the live compact_end/success frame): every unresolved card on screen, incl. a ts-less legacy element', JSON.stringify(ctxFullCardsToResolve(cards)));
  ok(JSON.stringify(ctxFullCardsToResolve(cards, { upToTs: T0 + 200000 })) === '[0,2]', 'time-bounded (a summary record at +200s): only the cards whose record precedes it — the later card is about the context being full AGAIN and keeps its button', JSON.stringify(ctxFullCardsToResolve(cards, { upToTs: T0 + 200000 })));
  ok(JSON.stringify(ctxFullCardsToResolve(cards, { upToTs: new Date(T0 + 200000).toISOString() })) === '[0,2]', 'the bound accepts an ISO string (the message ts shape)');
  ok(JSON.stringify(ctxFullCardsToResolve(cards, { upToTs: T0 + 200000 })).indexOf('3') < 0, 'a ts-less card is NOT resolved by a bounded summary (its time is unknown — a guess either way)');
  ok(ctxFullCardsToResolve([], { upToTs: T0 }).length === 0 && ctxFullCardsToResolve(null).length === 0, 'empty / null input → nothing');
  ok(isCompactSummaryText('This session is being continued from a previous conversation that ran out of context. The summary…') && isCompactSummaryText('  This session is being continued from a previous conversation'), 'the summary predicate matches the CLI\'s first sentence (the same one turn preview keys on)');
  ok(!isCompactSummaryText('Please continue from where you left off') && !isCompactSummaryText(''), 'ordinary prompts are not summaries (negative control)');
  const cr = read('src/lib/chat-renderers.js'), cv = read('src/lib/chat-view.js'), css = read('public/chat.css');
  ok(/if \(stage && stage\.event === 'compact_end' && stage\.result === 'success'\) this\.resolveContextFullCards\(\);/.test(cr), 'renderer: the live compact_end WITH the CLI\'s own success resolves every card on screen ("ended" is not "succeeded")');
  ok(/for \(const el of this\._messageList\?\.querySelectorAll\?\.\('\.chat-ctx-full-hint'\) \|\| \[\]\) el\.textContent = hint;/.test(cr), 'renderer: the stage rewrite still reaches every card — a resolved card keeps reporting the CLI\'s outcome line (round-4 preserved, test-turn-truth-ui)');
  ok(/resolveContextFullCards\(\{ upToTs = null, hint = null \} = \{\}\) \{/.test(cr) && /ctxFullCardsToResolve\(facts, \{ upToTs \}\)/.test(cr) && /c\.querySelector\('\.chat-ctx-compact-btn'\)\?\.remove\(\);/.test(cr), 'renderer: resolution goes through the PURE rule and removes the button');
  ok(/isCompactSummaryText\(\(msg\.content \|\| \[\]\)\.map\(\(b\) => b\.text \|\| ''\)\.join\(''\)\)\) \{\s*\n\s*this\._renderers\.resolveContextFullCards\(\{ upToTs: msg\.ts, hint: t\('Compacted — the conversation fits the context window again\.'\) \}\);/.test(cv), 'view: the summary user record resolves the cards before it with the plain-words outcome — in _applyElementMarks, the ONE hook every element-creation path runs (rebuild, page-in, gap)');
  ok(css.includes('.chat-ctx-full-resolved') && !/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf('.chat-ctx-full-resolved'), css.indexOf('.chat-ctx-full-resolved') + 400)), 'resolved style present, theme vars only');
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(read(f).includes("'Compacted — the conversation fits the context window again.'"), `${path.basename(f)} carries the outcome line`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
