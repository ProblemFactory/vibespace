#!/usr/bin/env node
// THE WAKE / APPROVE CARD — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-wake-approve-card.mjs (its loopback routes, the store, the PURE registry legs and every RED CONTROL stay there): the For-you
// window's registry ask (src/lib/inbox-window.js), the press road's words (src/lib/user-todos-actions.js), the hub-act ask's asker
// (src/server/hub-act-ask.js), the paste box's note (src/lib/vault-paste-box.js), the door's grantedFor (src/server/vault-run-door.js), the
// access toast (src/lib/channel-filter-editor.js), the card's one-block promise (src/server/channels-access.js), ⑲ (e)'s source half
// (src/foryou-actions.js, docs/kb-features.md) and their zh / ja words (src/lib/i18n-zh.js, src/lib/i18n-ja.js). Each file is read BY NAME,
// so ci.mjs's affected rule selects this suite on a change of any of them. Also ⑥ the card-store census (src/lib/chat-needs-card.js) with its RED
// copies and the tray row's decidedStamp pin (src/lib/user-todos-row.js).
// Run: node scripts/test-wake-approve-card-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'src');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof m !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const J = (x) => JSON.stringify(x);
const DICT8 = { zh: (await import(pathToFileURL(path.join(SRC, 'lib', 'i18n-zh.js')).href)).default };
const Z = (x, p) => String(DICT8.zh[x] || x).replace(/\{(\w+)\}/g, (m0, k) => (p && p[k] != null ? String(p[k]) : m0));
const JA9 = (await import(pathToFileURL(path.join(SRC, 'lib', 'i18n-ja.js')).href)).default;

// ⑥'s census reads two files of the heavy's SRC_FILES (a walk of src/): the same texts, named here
const SRC_FILES = { 'src/lib/chat-needs-card.js': read('src/lib/chat-needs-card.js'), 'src/lib/user-todos-row.js': read('src/lib/user-todos-row.js') };
// ── ⑥ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ ONE RENDERER, NEVER STORED TWICE — the card is derived from the For-you item on every pass');
function cardStoreProblems(src) {
  const out = [];
  for (const [re, what] of [[/\blocalStorage\b|\bsessionStorage\b|indexedDB/, 'browser storage'], [/\bfetch(Json)?\(/, 'a route of its own'], [/userState|user-state/, 'the user state'], [/method:\s*'(POST|PUT|PATCH|DELETE)'/, 'a write']]) if (re.test(src)) out.push(`chat-needs-card.js: ${what}`);
  if (!/this\.app\.foryouRows\?\.wire\(card/.test(src)) out.push('chat-needs-card.js: the verbs are no longer the panel\'s rows (foryouRows.wire)');
  return out;
}
{
  const src = SRC_FILES['src/lib/chat-needs-card.js'];
  ok(cardStoreProblems(src).length === 0, 'src/lib/chat-needs-card.js keeps no copy (no storage, no user state) and calls no route of its own — its Approve / Deny are the tray row\'s (foryouRows.wire → the panel\'s one route)', cardStoreProblems(src));
  ok(cardStoreProblems(src + "\nlocalStorage.setItem('cn-cards', JSON.stringify([]));\n").some((x) => /browser storage/.test(x)), 'RED COPY: a card stored in the browser is named');
  ok(cardStoreProblems(src + "\nfetchJson('/api/channels/reach-requests/x/approve', { method: 'POST' });\n").some((x) => /a route of its own/.test(x)), 'RED COPY: a second decision road from the card is named');
  // the stamp is ONE spelling on both doors: the tray row words a resolved item through decidedStamp, as the card does
  const row = SRC_FILES['src/lib/user-todos-row.js'];
  ok(/const stamp = item \? decidedStamp\(item, \{ t \}\) : null;\s*if \(stamp\) return stamp\.text;/.test(row) && /const stamp = decidedStamp\(e\.item, \{ t \}\);/.test(src), 'the tray row (resolvedByText — the tray, the mini inbox, the For-you window) and the chat card both say decidedStamp\'s words');
}

console.log('the For-you window asks THE registry (source pin)');
try {
  const IW = read('src/lib/inbox-window.js');
  ok(/'proposal-reject': \(it\) => \(isDecisionRow\(it\) \? actBtn\('proposal-reject', UI_ICONS\.close, t\('Deny'\)/.test(IW) && /closers: closersOf\(it, /.test(IW), 'the window asks THE registry: its second verb says «Deny» on a decision row (Approve / Deny on every door), and its closers are closersOf\'s (r3)');
} catch (e) { ok(false, 'the For-you window asks THE registry threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑩ «Hide» — the press road (source pin)');
try {
  const UA = read('src/lib/user-todos-actions.js');
  ok(/const hide = isPointer\(byId\(id\)\);/.test(UA) && /if \(ok && hide\) \{ showToast\(t\('Hidden — nothing was decided; it comes back while it is still open'\), \{ duration: 6000 \}\); return ok; \}/.test(UA), 'the press says it — «Hidden — nothing was decided; it comes back while it is still open» — with NO Undo (it comes back by itself)');
} catch (e) { ok(false, '⑩ «Hide» — the press road threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑪ the hub-act ask files under its asker (source pin)');
try {
  const HA = read('src/server/hub-act-ask.js');
  ok(/let about = null; try \{ about = P\.byKindOf\(by\) === 'agent' \? aboutOf\(by\) : null; \} catch \{ \}/.test(HA) && /\.\.\.\(about \? \{ about \} : \{\}\),/.test(HA) && /aboutOf: \(by\) => \{/.test(HA), 'src/server/hub-act-ask.js files an AGENT\'s act `about` the conversation that asked (wire()\'s aboutOf — test-hub-act-ask drives it on the real asker)');
} catch (e) { ok(false, '⑪ the hub-act ask files under its asker threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑪ the paste box\'s note (source pin)');
try {
  const VBX = read('src/lib/vault-paste-box.js');
  ok(/const note = mk\('div', 'ut-secret-note', t\('Wrong name or kind\? Refuse — the agent can ask again with the right one\.'\)\);/.test(VBX) && /box\.append\(row, note, state\);/.test(VBX), 'the paste box (the tray row and the chat card — one box) says «Wrong name or kind? Refuse — the agent can ask again with the right one.»');
} catch (e) { ok(false, '⑪ the paste box\'s note threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑫ (b) the expired words and the new zh / ja words (source pins)');
try {
  // (b) the page words it in the owner's language, from its end
  const ACT = read('src/lib/user-todos-actions.js');
  ok(/\(r && r\.code === 'expired'\) \? t\('This request expired on \{date\} — the agent can ask again', \{ date: clockWords\(r\.expiredAt\) \}\)/.test(ACT), 'the page (the chat card and the tray — one press road) toasts «This request expired on {date} — the agent can ask again», its date from `expiredAt` (THE registry\'s clockWords)');
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
  const KEYS = ['This request expired on {date} — the agent can ask again', 'allowed once by you', 'allowed by you for 8 h', 'allowed for 8 hours', 'allowed once'];
  const missing = KEYS.filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':'));
  ok(!missing.length, `the new words are in zh and ja (${KEYS.length} keys)`, missing);
} catch (e) { ok(false, '⑫ threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑭ «allowed» in zh and the door\'s grantedFor (source pins)');
try {
  const ZH14 = read('src/lib/i18n-zh.js');
  ok(/\n {2}"allowed": "已允许",/.test(ZH14), 'zh: «allowed» = «已允许»');
  const DOOR = read('src/server/vault-run-door.js');
  ok(/const grantedFor = a === 'once' \? 'once' : '8h';\n {4}settleRequest\(q, 'granted', 'answered', \{ \.\.\.\(mark\(\) \|\| \{\}\), grantedFor, until \}\);\n {4}return \{ ok: true, outcome: a === 'once' \? 'granted-once' : 'granted', grantedFor, until \};/.test(DOOR) && !/'granted-8h'/.test(DOOR), 'r6: the door writes `granted` (the value every reader names) + `grantedFor` / `until` on the record, and answers the outcome the production client toasts (`granted-once` / `granted`) + the same `grantedFor` — never `granted-8h`');
} catch (e) { ok(false, '⑭ «allowed» in zh and the door\'s grantedFor threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑯ (d) a LATE Allow is never toasted «denied» (source pin)');
try {
  const ACT8 = read('src/lib/user-todos-actions.js');
  ok(/r\.outcome === 'late-allowed' \? t\('let through once · waiting for it to run again'\) : r\.outcome === 'denied' \? t\('denied'\) : `\$\{t\('outcome unknown'\)\} · \$\{String\(r\.outcome \|\| ''\)\}`/.test(ACT8), 'the vault-run press reads a late Allow\'s outcome («已放行 1 次 · 等它重跑»), a Deny as «已拒绝», anything else as «结果未知 · <outcome>» (2a5e9ce8: everything not allowed/always toasted «已拒绝»)');
} catch (e) { ok(false, '⑯ threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑰ (c) DEFECT 2 — the access toast reads wakes.reactivated (source pin)');
try {
  const FE = read('src/lib/channel-filter-editor.js');
  const ZH9 = DICT8.zh;
  ok(/const woke = r\.wakes && Array\.isArray\(r\.wakes\.reactivated\) \? r\.wakes\.reactivated\.length : 0;/.test(FE) && /woke \? t\('Access saved: \{list\} — this re-activated \{n\} wake\(s\) \(a billed turn each time one fires\)', \{ list: names, n: woke \}\)/.test(FE) && !!ZH9['Access saved: {list} — this re-activated {n} wake(s) (a billed turn each time one fires)'] && !!JA9['Access saved: {list} — this re-activated {n} wake(s) (a billed turn each time one fires)'],
    '(c) DEFECT 2: the page\'s access toast reads the write\'s own `wakes.reactivated` — «访问权限已保存：… — 这次重新启用了 2 个唤醒…» when it woke rows (the answer\'s words belted: test-channel-agent-watch ⑦ (a)), «…不会唤醒任何人» only when it woke none');
} catch (e) { ok(false, '⑰ threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑲ (e) r12 — NO cmdLen (source half)');
try {
  const code = read('src/foryou-actions.js').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
  ok(!/cmdLen/.test(code)
    && !/cut at \{k\}/.test(read('src/foryou-actions.js')) && !/cut at 3000/.test(read('docs/kb-features.md')) && !('The command is {n} characters long — cut at {k}, so the whole command was not kept: see its run record in the Vault window. The card shows its first {m}.' in DICT8.zh),
    '(e) r12 — NO cmdLen (source half): no code line of src/foryou-actions.js reads cmdLen, no «cut at» key in it, no «cut at 3000» kb example (docs/kb-features.md), no «cut at {k}» zh word (1ad060a82: «3500 characters long — cut at 3000»)');
} catch (e) { ok(false, '⑲ threw on this tree: ' + ((e && e.message) || e)); }

console.log('㉑ (d) ONE PRESS, ONE TURN, SAID (source pins)');
try {
  // (d) ONE PRESS, ONE TURN, SAID (M2 + the minor; r15 restated): the press road's toast says what stays held on the card after the
  // one block (r13 said «still wait for its next delivery» for rows r15 keeps in the request) and, on a not-in-effect answer, the part
  // the same press dropped — each key with zh + ja
  const UA = read('src/lib/user-todos-actions.js');
  const KEY = '{n} held messages stay on the card — Deliver again, or Discard them';
  const stillToast = /const stillWords = still > 0 && r\.delivered \? ' · ' \+ t\('\{n\} held messages stay on the card — Deliver again, or Discard them', \{ n: still \}\) : '';/.test(UA) && /\+ droppedWords \+ stillWords \+ skippedWords/.test(UA) && !/r\.pending/.test(UA);
  const notInEffect = /Deliver once it is, or Discard them', \{ agent: r\.agent \|\| '', n: Number\(r\.n\) \|\| 0 \}\)\) \+ droppedWords, \{ type: 'error' \}\)/.test(UA);
  const CARD = read('src/server/channels-access.js');
  ok(stillToast && notInEffect && (KEY in DICT8.zh) && (KEY in JA9) && Z(KEY, { n: 30 }) === '还有 30 条搁置的消息留在卡片上 — 再次投递，或丢弃它们' && /Deliver sends them to \$\{who\} now, as one block \(a billed turn\)/.test(CARD),
    `(d) the press road says what stays held on the card after the ONE block («${Z(KEY, { n: 30 })}») and, when its watcher is not woken now, the part the press dropped; the card still promises ONE block (true since r13)`, J({ stillToast, notInEffect }));
} catch (e) { ok(false, '㉑ threw on this tree: ' + ((e && e.message) || e)); }

// the engine's functions (the heavy's fnsOf, COPIED — its writer census keeps it)
function fnsOf(text) {
  const heads = [...text.matchAll(/(?:async )?function (\w+)\(/g)];
  return heads.map((h, k) => ({ name: h[1], at: h.index, body: text.slice(h.index + h[0].length, k + 1 < heads.length ? heads[k + 1].index : text.length) }));
}

console.log('⑭ (b) THE ONE-READER CENSUS over the engine\'s source');
try {
  // (b) THE ONE-READER CENSUS over the engine's source: every road that asks «held», writes a grain or draws its lists reads it
  // through readGrainHolder (→ F.grainAsFired); none reads a holder through the narrower F.grainOf; «held» counts the STORED rows
  // r6: + the rows BELOW a grain (wakesBelow), a write's before / after (wakeRowsNow), the agent's watch list (agentWatchesFor)
  // and the engine's three boot censuses (orphanWatchers, capZeroDigests, deprecatedReceiptWakes — through eachRowInEffect)
  const ROADS = ['convGrainOf', 'readGrainHolder', 'grainReadAt', 'ownWakes', 'wakesBelow', 'wakeRowsNow', 'wakeNamesFilter', 'setGrain', 'grainView', 'storedWatcherFor', 'removePattern', 'setScopeAssignment', 'agentWatchesFor', 'orphanWatchers', 'eachRowInEffect', 'capZeroDigests', 'deprecatedReceiptWakes'];
  const oneReader = (E, FS, G = read('src/server/channels-engine.js')) => {
    const fns = fnsOf(E + '\n' + G), byName = Object.fromEntries(fns.map((f) => [f.name, f.body]));
    const bad = [];
    for (const n of ROADS) {
      const b = byName[n];
      if (b === undefined) { bad.push(`${n}: missing`); continue; }
      if (/\bF\.grainOf\(/.test(b)) bad.push(`${n}: reads a grain through F.grainOf (a narrower view)`);
      if (n !== 'readGrainHolder' && !/(?<![\w.])(readGrainHolder|grainReadAt|heldRead|eachRowInEffect)\(/.test(b)) bad.push(`${n}: never reaches the one reader`);
    }
    if (!/F\.grainAsFired\(/.test(byName.readGrainHolder || '')) bad.push('readGrainHolder: does not read through F.grainAsFired');
    if (!/wakesIn\(g\.stored\)/.test(byName.ownWakes || '')) bad.push('ownWakes: does not count every STORED wake row');
    if (!/(?<![\w.])ownWakes\(/.test(byName.wakeHeldAt || '') || !/(?<![\w.])wakesBelow\(/.test(byName.wakeHeldAt || '')) bad.push('wakeHeldAt: does not ask its own rows AND the rows below it');
    const eff = (/function effectiveGrants\([\s\S]*?\n\}\n/.exec(FS) || [''])[0];
    if ((eff.match(/grainAsFired\('(account|pattern|conversation)'/g) || []).length !== 3 || /\bgrainOf\(/.test(eff)) bad.push('effectiveGrants: its three grains are not read through grainAsFired');
    return bad;
  };
  const E14 = read('src/server/channels-access.js'), FS14 = read('src/channel-filter.js');
  const b14 = oneReader(E14, FS14);
  ok(!b14.length, `THE ONE-READER CENSUS: ${ROADS.length} roads of the engine (${ROADS.join(', ')}) read a grain through readGrainHolder → F.grainAsFired — the reader effectiveGrants fires with; «held» counts every stored wake row`, b14);
  const narrowSet = oneReader(E14.replace('    const rd = readGrainHolder(adapterId, kind, site.holder);\n', '    const rd = site.holder ? { ...F.grainOf(site.holder), inert: [] } : null;\n'), FS14);
  const activeOnly = oneReader(E14.replace('const own = wakesIn(g.stored);', 'const own = wakesIn(g.watchers);'), FS14);
  ok(narrowSet.some((x) => /^setGrain: reads a grain through F\.grainOf/.test(x)) && activeOnly.some((x) => /^ownWakes: does not count every STORED/.test(x)), 'RED COPIES: a writer reading the holder through F.grainOf (round 4\'s setGrain), a «held» counting only the rows in effect (round 4\'s — an inert wake read «not held») — each named', { narrowSet, activeOnly });
} catch (e) { ok(false, '⑭ (b) threw on this tree: ' + ((e && e.message) || e)); }

console.log('⑱ (c) the press road toasts both refusals (source pins)');
try {
  // (c) THE PAGE: the press road (the chat card and the tray) toasts both refusals in the owner's language — who, how many, why
  const UA = read('src/lib/user-todos-actions.js');
  const KEYS10 = ['{agent} is not running — the {n} messages stay held: Deliver once it runs, or Discard them', '{agent} is not woken by this rule now (not in its group, or left out of it) — the {n} messages stay held: Deliver once it is, or Discard them', 'the access they were held under was removed — {n} messages discarded', 'the rule they were held for was removed — {n} messages discarded'];
  // r15: r13 put the not-in-effect ternary in parentheses (+ droppedWords) — the pin had gone stale on 3928de8bd. r16 (the r15
  // acceptance, skep-pin18c.cjs): r15 wrote that note MID-LINE, so the rule-gone half after it was comment text — a pin that could
  // not fall. Both halves are code again, and each is shown able to fall: its branch deleted from a copy ⇒ the pin is false
  const branchOf = (src) => /if \(held && r && r\.code === 'not-in-effect'\) \{ showToast\(\(?r\.why === 'not-running' \? t\('\{agent\} is not running/.test(src)
    && /if \(held && r && r\.code === 'rule-gone'\) \{ showToast\(r\.why === 'access-removed' \? t\('the access they were held under was removed/.test(src);
  const branch = branchOf(UA);
  const cutRG = UA.replace("if (held && r && r.code === 'rule-gone') {", 'if (false) {'), cutNE = UA.replace("if (held && r && r.code === 'not-in-effect') {", 'if (false) {');
  const falls = { ruleGone: cutRG !== UA && !branchOf(cutRG), notInEffect: cutNE !== UA && !branchOf(cutNE) };
  const missing = KEYS10.filter((k) => !UA.includes(`t('${k}'`) || !(k in DICT8.zh) || !(k in JA9));
  ok(branch && falls.ruleGone && falls.notInEffect && !missing.length, `(c) the press road toasts \`not-in-effect\` («${Z(KEYS10[0], { agent: 'Worker', n: 30 })}») and \`rule-gone\` in the owner's language — ${KEYS10.length} keys, each with zh + ja; the pin FALLS with either branch deleted (beb0cc795: the rule-gone half sat in a comment)`, J({ branch, falls, missing }));
} catch (e) { ok(false, '⑱ (c) threw on this tree: ' + ((e && e.stack) || e)); }

console.log('⑲ (f) the not-covered toast (source half)');
try {
  const UA = read('src/lib/user-todos-actions.js');
  const toast = /r\.why === 'not-covered' \? \(Number\(r\.convs\) > 1 \? t\('the rule no longer covers its \{m\} conversations — \{n\} messages discarded'[^\n]*: t\('the rule no longer covers this conversation — \{n\} messages discarded'/.test(UA);   // r12: a digest's every conversation
  ok(toast, '(f) the press road toasts a held decision out of its rule\'s reach (src/lib/user-todos-actions.js)');
} catch (e) { ok(false, '⑲ (f) threw on this tree: ' + ((e && e.stack) || e)); }

console.log('⑳ (d) per conversation, said (source half)');
try {
  const KEYS12 = ['{n} messages for {agent} held since {date} — deliver or discard · the rule no longer covers {k} of {m} conversations — {d} held messages dropped',
    '{n} messages for {agent} held since {date} — deliver or discard · {k} of {m} conversations no longer wake {agent} — {d} held messages dropped',
    'the rule no longer covers {k} of {m} conversations — {d} held messages dropped', '{k} of {m} conversations no longer wake {agent} — {d} held messages dropped',
    'the rule no longer covers its {m} conversations — {n} messages discarded'];
  const SRVK = read('src/server/channels-access.js'), UA = read('src/lib/user-todos-actions.js');
  const keyed = KEYS12.filter((k) => !(k in DICT8.zh) || !(k in JA9) || !(SRVK.includes(`i18nKey('${k}')`) || UA.includes(`t('${k}'`) || read('src/foryou-actions.js').includes(`t('${k}'`)));
  const toast = /const droppedWords = dd \? ' · ' \+ \(r\.dropped\.why === 'not-covered' \? t\('the rule no longer covers \{k\} of \{m\} conversations — \{d\} held messages dropped', dd\) : t\('\{k\} of \{m\} conversations no longer wake \{agent\} — \{d\} held messages dropped', dd\)\)/.test(UA) && /\+ droppedWords \+ (?:pendingWords|stillWords) \+ skippedWords/.test(UA);   // r13: computed once for both toasts; r15: the still-held words in pendingWords' place (the not-in-effect one says it too)
  const head = Z(KEYS12[0], { n: 30, agent: 'Worker', date: '2026-10-26 17:01 PT', k: 1, m: 2, d: 30 });
  ok(head === '30 条给 Worker 的消息自 2026-10-26 17:01 PT 起被搁置 — 投递还是丢弃 · 规则已不再覆盖 2 个会话中的 1 个 — 已丢弃 30 条搁置的消息' && !keyed.length && toast, `(d) PER CONVERSATION, SAID: the open card «${head}»; every key with zh + ja and its t() / i18nKey() site; the press road\'s dropped-words toast`, J({ keyed }));
} catch (e) { ok(false, '⑳ (d) threw on this tree: ' + ((e && e.stack) || e)); }

console.log('㉒ (a) the press road\'s two r15 sentences (source pins)');
try {
  // (a) THE PRESS ROAD'S TWO r15 SENTENCES: a delivered press with a part left on the card, and a refused block whose rows came
  // back to the card (never «they go with its next delivery» for rows the request holds again) — each with zh + ja
  const UA = read('src/lib/user-todos-actions.js');
  const K1 = '{n} held messages stay on the card — Deliver again, or Discard them', K2 = 'Not delivered now ({why}) — the {n} messages stay held: Deliver again, or Discard them';
  const refusedBack = /still > 0 && !r\.stashed \? t\('Not delivered now \(\{why\}\) — the \{n\} messages stay held: Deliver again, or Discard them', \{ why: r\.why \|\| t\('refused'\), n: still \}\)/.test(UA);
  const words = [K1, K2].every((k) => UA.includes(`t('${k}'`) && (k in DICT8.zh) && (k in JA9));
  const gone = !('{n} held messages still wait for its next delivery' in DICT8.zh) && !('{n} held messages still wait for its next delivery' in JA9);
  ok(refusedBack && words && gone && Z(K2, { why: 'x', n: 60 }) === '现在没有投递（x）— 这 60 条消息继续保留：再次投递，或丢弃它们' && JA9[K1] === '保留中のメッセージ {n} 件はカードに残っています — もう一度届けるか、破棄してください',
    `(a) the press road: «${Z(K1, { n: 30 })}» beside a delivered part, «${Z(K2, { why: '…', n: 60 })}» for a refused block whose rows came back; r13's «still wait for its next delivery» is gone from the dictionaries`, J({ refusedBack, words, gone }));
} catch (e) { ok(false, '㉒ (a) threw on this tree: ' + ((e && e.stack) || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
