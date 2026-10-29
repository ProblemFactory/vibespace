#!/usr/bin/env node
// test-vault-words — THE `vault_locked` SENTENCE CENSUS (lane vault-manual-and-lock — design q-043 D3 ⑤ / D4; the brief's item
// 4: every place the product words a LOCKED vault to a PERSON or an AGENT says the same two facts — THE OWNER HAS BEEN TOLD
// (For you names what waits on it; an agent: the user has already been told) and WHERE TO UNLOCK (a person: Unlock… / the
// second password; an agent: on this instance's page) — the refusal-notice lane's agent words, extended to every person's).
// Fast tier, pure text (acorn over the tracked tree — nothing runs):
//   ① THE SITES — every string / template literal and regex of src/ + data/bin/ + server.js (git ls-files; the i18n tables
//      and the generated agentd bundle aside) that words a locked vault is GREP-DERIVED; each is a ROW (file, a needle of its
//      words, its class, why) — a NEW site with no row ⇒ RED, a row whose site is gone ⇒ RED
//   ② THE TWO FACTS — a `person` row says TOLD + WHERE in a person's words, an `agent` row in an agent's, `both` either way,
//      a `foryou` row (the vault's own For-you item IS the telling) says WHERE; a `carried` row (a store's own error — the
//      refusal-notice lane kept them neutral) names the row that re-words it for its reader (it must be one that says
//      both); `label` / `match` / `log` rows name nothing a reader must act on (why ≥ 40 characters). A person row's
//      zh / ja translation carries the two facts too (待你处理 / 解锁 · あなた宛て / 解除)
//   ③ THE SEVEN PLACES the r1 verify named (the strip, the For-you item, the CLI exit text, the pty-wrapper wait, the device
//      card, the relay card, the channels card) are rows that SAY both — never exempt
//   ④ THE AGENT'S WORDS — every `agentWords(<what>)` names where (the TOLD clause is the function's own, src/vault-blocked.js)
//   ⑤ MUTANTS (the census over a patched copy of the text, in memory): a new hand-written locked sentence; the channels card
//      without its TOLD; the pty-wrapper wait without its facts; an agentWords without where; a dead row ⇒ each RED
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const acorn = require(path.join(REPO, 'node_modules/acorn'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : '')); } };

// ── THE TWO FACTS, by reader ──
const P_TOLD = /For you names|already been told|the owner has been told/;          // a person: For you names what waits on it
const P_WHERE = /Unlock…|the second password|click to unlock/;                      // a person: the door (the strip's / the dialog's Unlock…)
const A_TOLD = /(?<!not )already (?:been )?told|the owner has (?:been told|the unlock item)/;     // an agent: the user knows — never ask them
const A_WHERE = /on this instance's page|from the page/;                            // an agent: where a PERSON unlocks it
const PHRASE = /vault (?:is|was) (?:locked|sealed)|vault locked|locked vault|unlocks? the vault|waiting for the vault|waits for the vault|保险库(?:已?锁|未解锁)|保管庫.{0,3}ロック/i;
const STATE_KEYS = new Set(['vault_locked', 'vault-locked']);   // a word map's key / a switch case on the state: its words are a site whatever they say (the review: a reworded sentence slips a phrase)
const CLASSES = ['person', 'agent', 'both', 'foryou', 'carried', 'label', 'match', 'log'];

// ── THE ROWS: [needle (a substring of the site's words), class, why, { via, with }] per file ──
const K1 = 'The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)';
const K1N = 'The vault is locked — unlock it first';   // the rows' needle: a site that drops a fact stays ITS row's, judged without it
const TAIL = 'Unlock… at the top of the page; For you names what is waiting on it';
const ROWS = {
  // lane human-cli: `vibespace chat` opened read-only on a session the hub last said waits for the vault (its row's inputHeld) — the person at the machine
  'data/bin/vibespace': [['the hub\'s vault is locked and the session waits for it', 'person', 'lane human-cli: the person\'s CLI says why a chat is read-only (inputHeld vault-locked, the hub\'s last word with its age)']],
  // lane passkey-sink: the kernel road's refusal when the passkeys' sealed key cannot be opened (refusedText 'webauthn_key_locked') —
  // toward the AGENT: the user already knows, a person unlocks it on this instance's page, never ask them
  'src/browser-passkey.js': [['VibeSpace\'s saved passkeys cannot be opened right now', 'agent', 'lane passkey-sink: a kernel ceremony refused webauthn_key_locked — said to the agent\'s next verbs (PK.refusedText)']],
  // lane browser-login: a web login the custom kernel would fill — the agent's `vibespace-browser login` refused vault_locked (the fill, a
  // signup the vault would mint for); the person's own save doors (the Vault window's 网站登录…, the save-login card) say it as a field verdict
  'src/browser-login.js': [['the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page, and nothing is filled until then', 'agent', 'lane browser-login: LOCKED — `vibespace-browser login` refused vault_locked (BL.LOCKED, the fill verdict\'s words)']],
  'src/server/browser-logins.js': [['the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page; no account was registered', 'agent', 'lane browser-login: a signup the vault could not seal before the fill (vault_locked) — nothing filled, no account made'],
    ['the vault is locked — unlock it, then save', 'label', 'the owner\'s own save doors (网站登录… in the Vault window, the save-login card\'s Save) answer it as a field verdict while the person is at the door — not a background refusal', { count: 2 }]],
  'src/lib/vault-login-row.js': [['The vault is locked (vault_locked) — unlock it, then save', 'label', 'the 网站登录… dialog\'s save-time verdict line (the same words as the paste box\'s) — a field verdict while the person is in the dialog, not a background refusal']],
  'src/lib/vault-totp-row.js': [['The vault is locked — unlock it first, then preview again', 'label', '添加… ▸ 两步验证…\'s preview-time verdict line (lane vault-totp-add) — 「解锁…」 beside the words is the door; a field verdict while the person is in the dialog, not a background refusal']],
  'src/lib/vault-use-row.js': [['Unverified until you unlock the vault — not in use until then', 'label', 'the «谁可以用…» row\'s locked-read note (lane vault-use-grants r6) — while the vault is locked the chips are greyed and the members listed «unverified», shown as a field-side note while the person is at the Vault window (the run door still refuses with vault_locked and its own words); not a background refusal the two-facts rule governs']],
  'src/lib/user-todos-row.js': [['closed when the vault locked — run it again after the unlock', 'label', 'the resolvedByText word on a run card the lock SETTLED (lane vault-use-grants r7) — a past-tense resolution label on a CLOSED For-you item, telling the owner the card closed and to re-run after the unlock; the live unlock door is the vault strip / the lock\'s own For-you item, and the agent re-running draws the normal vault_locked notice — not a background refusal the two-facts rule governs']],
  // int331 seam — sites from lanes that landed after this census's base (.326): relay status words, the provider-config save verdict,
  // and the 使用失败 For-you card's count/hint detail — all LABELS/status, not the tool-refusal sentences the two-facts rule (decision 5) targets
  // lane wake-approve-card r8: a DECIDED card's end in words — a vault ask the lock settled (resolvedBy 'vault_locked') reads its
  // outcome on its record; the lock itself is told by the vault's own For-you item and strip (their rows), so this is a LABEL
  'src/foryou-actions.js': [
    ['the vault locked before it was answered', 'label', 'a settled card\'s outcome words (settledWords — resolvedBy vault_locked): the record of an ask the lock ended, never a refusal sentence; the lock\'s own For-you item says who was told and where to unlock'],
  ],
  'src/lib/user-todos-row.js': [
    ['the vault locked before it was answered', 'label', 'the same outcome words on the tray row / the For-you window (resolvedByText) — a record\'s end, the lock told by its own item'],
  ],
  'src/model-providers.js': [
    ['Unlock the vault first', 'label', 'the provider-config dialog\'s own save-time verdict shown while the person is in the dialog (lane provider-record) — a field verdict, not a background tool refusal (the two-facts rule is for refusals)'],
  ],
  'src/vault-inventory.js': [
    // lane conversations-archive-verb → lane vault-key-row-compact: the 使用失败 notice's HEAD says who · the key · the verb; its CAUSE line
    // (one per cause) says the reason + the door — the locked cause says WHERE in a person's words (Unlock…), ONE line shared by the
    // named card and the nameless one (a use refused before any key was picked)
    ['The vault is locked — Unlock… at the top of the page', 'foryou', 'THE 使用失败 For-you card\'s locked CAUSE line (useFailCard, lanes conversations-archive-verb / vault-key-row-compact): under the head «<who> used “<key>” for “<verb>” — refused» — the vault is locked, and the door'],
  ],
  'src/lib/vault-unlock.js': [
    ['The vault is locked — {n} waiting on it', 'person', 'THE STRIP (place 1) — how many the lock stopped; its Unlock… button beside the words'],
    ['device links, the relay and account switching are waiting', 'person', 'THE STRIP before anything was stopped (place 1)'],
    ['Vault locked — click to unlock', 'person', 'the lock chip\'s title (taskbar + phone nav) + the ⚙ button\'s title (lane vault-locked-loud, int332) — each is the door', { count: 2 }],
    ['Vault locked', 'label', 'the lock chip\'s own two words and the toast confirming a person\'s own lock act — the chip\'s title says the facts', { count: 2 }],
    ['Unlock the vault', 'label', 'the unlock dialog\'s own title — the dialog IS where a person unlocks it'],
  ],
  // lane vault-paste-request: the paste box's own state line INSIDE its For-you item (and the ⑥ dialog's verdict) — a field verdict
  // while the person is at the box, its 解锁… button beside it (the box IS the For-you item: the telling and the door in one place)
  'src/lib/vault-paste-box.js': [['The vault is locked (vault_locked) — unlock it, then save', 'label', 'the paste box\'s state line inside its For-you item (its 解锁… button beside the words — the door), the refusal said in the same line, and 「其他密钥或密码…」\'s save-time verdict — a field verdict while the person is in the box, not a background refusal', { count: 3 }]],
  'src/server/vault-hooks.js': [
    ['The vault locked after a restart', 'foryou', 'THE FOR-YOU ITEM after a restart (place 2) — the item IS the telling'],
    ['The vault is locked — agents that need a credential will be refused until you unlock it', 'foryou', 'THE FOR-YOU ITEM the moment it locks (lane vault-locked-loud, int332) — the item IS the telling; the door sentence follows'],
    ['The vault is locked — enter the second password to unlock.', 'foryou', 'THE FOR-YOU ITEM\'s stable text (place 2)'],
    ['The vault is locked — waiting on it: {who}', 'foryou', 'THE FOR-YOU ITEM naming who the lock stopped (place 2)'],
    ['signed out: the vault was locked', 'label', 'a WebSocket close reason — the page goes to its sign-in, a person never reads it'],
  ],
  'data/bin/vibespace-vault': [['LOCKED — every stored credential stays sealed', 'agent', 'THE CLI EXIT TEXT (place 3): `vibespace-vault status` while locked']],
  'data/bin/vibespace-api': [['the vault locked ⇒ every call answers vault_locked', 'agent', 'THE CLI EXIT TEXT (place 3): vibespace-api\'s usage on exit 3']],
  'data/bin/pty-wrapper.js': [['waiting for the vault to be unlocked — retrying in', 'both', 'THE PTY-WRAPPER WAIT (place 4): a remote conversation\'s terminal while its link waits for the vault']],
  'src/lib/chat-status-bar.js': [
    ['This session waits for the vault', 'person', 'THE DEVICE CARD (place 5): a remote session\'s status chip tip'],
    ['waiting for the vault to be unlocked', 'label', 'the device card\'s chip words — its tip (the row above) says the facts'],
    ['the vault is locked', 'match', 'recognises a link error that is the vault (the chip above words it)'],
  ],
  'src/lib/session-card.js': [
    ['This session waits for the vault', 'person', 'THE DEVICE CARD in the sidebar (place 5): the remote session card\'s chip tip'],
    ['waiting for the vault to be unlocked', 'label', 'the sidebar card\'s chip words — its tip (the row above) says the facts'],
  ],
  'src/lib/plugins-ui.js': [[K1N, 'person', 'THE RELAY CARD (place 6) and the voice plugin\'s chip', { count: 2 }], ['the shared token waits for the vault', 'label', 'the relay-identity line\'s own status — the shared relay token waits for the vault to unlock before it knocks (lane relay-token-per-instance); a status word, not a tool refusal'], ['waits for the vault (sent once it is unlocked)', 'label', 'the Relay identity dialog\'s knock-status word for the locked state (lane relay-token-per-instance) — a status, never an instruction to unlock']],
  'src/lib/sidebar-rail.js': [[K1N, 'person', 'THE RELAY CARD on the rail (place 6): Public URLs while the relay\'s token is sealed', { count: 2 }]],
  'src/lib/channels-panel.js': [[K1N, 'person', 'THE CHANNELS CARD (place 7): an account whose sign-in the locked vault keeps closed (its Unlock button beside it)', { count: 2 }]],
  'src/channel-caps.js': [
    [K1N, 'person', 'the channels card\'s reply line and its health words (place 7)', { count: 2 }],
    ['vault locked', 'label', 'the account header\'s two-word state chip — its card line (the row above) says the facts'],
  ],
  'src/lib/channel-words.js': [[K1N, 'person', 'a channel account\'s health words (the panel)']],
  'src/integration-registry.js': [[K1N, 'person', 'an integration row whose sign-in is sealed']],
  'src/lib/key-file-words.js': [[K1N, 'person', 'a store whose key the locked vault keeps closed (the key-file law\'s words)']],
  // lane kernel-asset-credential: a kernel that is a release asset of the plugin's own repository needs the Plugin Git credential —
  // the vault locked refuses its download by name (vault_locked): the engine card's kernel line, the refusal itself
  'src/lib/browser-build-model.js': [[K1N, 'person', 'the engine card\'s kernel line (Change build… / Settings) when the kernel\'s download was refused vault_locked']],
  'src/server/engine-distribution.js': [['the Plugin Git credential is sealed in the locked vault', 'person', 'the kernel download\'s refusal after its anonymous try was refused (round 2: the credential is optional — the engine record\'s failure, the card, a first use\'s / the fleet\'s For-you detail)']],
  'src/lib/manage-agents.js': [[K1N, 'person', 'the accounts window\'s key-unreadable reason']],
  'src/lib/oauth-connect-row.js': [[K1N, 'person', 'an OAuth plugin row whose sign-in is sealed']],
  'src/lib/vault-reveal.js': [[K1N, 'person', 'the Vault window\'s reveal refused while locked']],
  'src/voice-model.js': [[K1N, 'person', 'voice input while the Dropline sign-in is sealed']],
  'src/lib/vault-window.js': [['The vault is locked — Unlock… above shows what it holds', 'person', 'the Vault window\'s own note (its header\'s Unlock… is the door)']],
  'src/lib/machine-desktop.js': [['The vault is locked — unlock it to sign in automatically', 'person', 'the machine desktop\'s sign-in form and toast — the owner\'s own words (test-desktop-signin pins them) WITH the two facts beside them', { count: 2, with: TAIL }]],
  'src/accounts.js': [['the stored keys open after the owner unlocks it', 'both', 'an account key the locked vault keeps closed — a person\'s dialog and an agent\'s CLI read it']],
  'src/server/channels-engine.js': [
    ['this account\'s sign-in opens after the owner unlocks it on this instance', 'both', 'a refresh of an account the locked vault keeps closed'],
    ['this account\'s sign-in opens after the owner unlocks the vault on this instance', 'both', 'an account\'s health «how to fix» (the agent\'s CLI and the panel)'],
    ['the vault is locked', 'match', 'recognises a sign-in read the vault refused (its state becomes vault-locked)'],
  ],
  'src/server/dropline-client.js': [
    ['the Dropline sign-in opens after the owner unlocks it', 'both', 'the voice pair\'s sign-in sealed'],
    ['the vault is locked', 'match', 'recognises the sealed pair\'s refusal (its own error, the row above, says both)'],
  ],
  'src/server/desktop-access.js': [['the vault is locked — unlock it first', 'both', 'a person\'s remember-sign-in door refused (the page words it with machine-desktop\'s sentence)']],
  'src/job-notice.js': [
    ['waiting for the vault — it is locked; the owner has the unlock item', 'agent', 'a service\'s publish notice to its agent (the agent is told the owner already has it)'],
    ['vault is locked', 'match', 'recognises a publish that failed on the vault'],
  ],
  'src/agent-tool-rules.js': [
    ['a LOCKED vault has already told the user what waits on it', 'agent', 'the vibespace-vault tool rule\'s why'],
    ['Check whether the vault is locked', 'label', 'the name of the `vibespace-vault status` verb in the tool list — no state, no refusal'],
  ],
  'src/vault-blocked.js': [['the vault is locked — ', 'agent', 'THE words toward an agent (AGENT_WORDS / agentWords — every agent door\'s vault_locked): judged with its own TOLD clause and a caller\'s where (④ checks every caller)', { count: 2, expand: { '${TOLD}': 'TOLD', '${what}': 'a person unlocks it on this instance\'s page' } }]],
  'src/channels/index.js': [['the vault is locked', 'match', 'recognises a sign-in the vault keeps closed (its words are agentWords below)']],
  'src/routes/vault.js': [['unlock the vault', 'label', 'the PURPOSE word of a bearer\'s refused knock on the unlock door (its vault-use line) — no reader acts on it']],
  'src/server/integration-store.js': [['a person unlocks the vault on the page', 'log', 'the integrations journal line for a row the locked vault keeps closed (once per transition)']],
  'src/plugins/frp.js': [['the relay token opens after the owner unlocks it', 'carried', 'the relay\'s refusal in its own error and journal', { via: 'src/lib/plugins-ui.js' }]],
  'src/key-file.js': [['the vault is locked — ', 'carried', 'the key-file law\'s refusal in a store\'s own error (key-unreadable:vault_locked)', { via: 'src/lib/key-file-words.js' }]],
  'src/secret-box.js': [['the vault is locked — ', 'carried', 'the at-rest cipher\'s refusal (key-unreadable:vault_locked)', { via: 'src/lib/key-file-words.js' }]],
  'src/server/sealed-json.js': [['the vault is locked — ', 'carried', 'a sealed JSON file (the voice pair) read while locked', { via: 'src/voice-model.js' }]],
  'src/server/host-tokens.js': [['the vault is locked — the link token of ', 'carried', 'a device link token read while locked — the link\'s session error', { via: 'src/lib/chat-status-bar.js' }]],
  'src/dial-session-bridge.js': [['the vault is locked', 'carried', 'the dial bridge\'s session-error fallback (the status bar recognises it)', { via: 'src/lib/chat-status-bar.js' }]],
  'src/session-schema.js': [['WAITS for the vault', 'label', 'a session field\'s note for engineers (the schema census) — nobody reads it in the product']],
  'src/server/vault-run-door.js': [['the vault locked (', 'log', 'the run door\'s journal line when a lock stops a run — the agent\'s answer is vault_locked\'s words']],
  'src/server/vault-use-grants.js': [['the vault is locked — unlock it (验证是你) to change who may use a stored value', 'label', 'the Vault window\'s «谁可以用…» picker save (POST /api/vault/use-grants) answered while the person is at the door — a field verdict (round 4 item 4: a locked vault refuses the write by name, never a mac:null row), not a background refusal']],
};
const SEVEN = [
  ['the strip', 'src/lib/vault-unlock.js', 'The vault is locked — {n} waiting on it'],
  ['the For-you item', 'src/server/vault-hooks.js', 'The vault is locked — waiting on it: {who}'],
  ['the CLI exit text', 'data/bin/vibespace-vault', 'LOCKED — every stored credential stays sealed'],
  ['the pty-wrapper wait', 'data/bin/pty-wrapper.js', 'waiting for the vault to be unlocked — retrying in'],
  ['the device card', 'src/lib/chat-status-bar.js', 'This session waits for the vault'],
  ['the relay card', 'src/lib/plugins-ui.js', K1N],
  ['the channels card', 'src/lib/channels-panel.js', K1N],
];
const EXTRA = { 'data/bin/vibespace-vault': ['LOCKED — every stored credential stays sealed'] };   // a site the phrase does not catch (the CLI's own state word)

// ── THE SITES: acorn over every tracked source file ──
const tracked = execFileSync('git', ['ls-files', 'src', 'data/bin', 'server.js'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => !/\/i18n-(zh|ja)\.js$/.test(f) && !/vibespace-agentd\.js$/.test(f));
const isJs = (f, text) => /\.(c|m)?js$/.test(f) || /^#!.*\bnode\b/.test(text);
function sitesOf(text, rel) {
  const out = [];
  let ast;
  const esm = /^\s*(import|export)\b/m.test(text);
  try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: esm ? 'module' : 'script', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true }); }
  catch (e) { return { error: `${rel}: ${e.message}` }; }
  const lines = text.split('\n');
  const seen = new Set(), skip = new Set();
  const push = (n, site) => { if (seen.has(n.start)) return; seen.add(n.start); out.push(site); };
  const T_CALLS = new Set(['t', 'tr', 'tc', 'i18nKey']);
  const isWords = (s) => typeof s === 'string' && /\s/.test(s.trim());   // a sentence, not a code ('vault_locked' mapped to itself)
  const wordsOf = (v) => {   // 'words' or t('words') — agentWords(...) is judged by ④
    const w = v && v.type === 'Literal' ? v : v && v.type === 'CallExpression' && v.callee.type === 'Identifier' && T_CALLS.has(v.callee.name) && v.arguments[0] && v.arguments[0].type === 'Literal' ? v.arguments[0] : null;
    return w && isWords(w.value) ? w : null;
  };
  const visit = (n) => {
    if (!n || typeof n.type !== 'string' || skip.has(n)) return;
    // STRUCTURE: the words a `vault_locked:` / `'vault-locked':` key or a `case 'vault-locked':` hold are a site, phrase or not
    if (n.type === 'Property' && STATE_KEYS.has(n.key && (n.key.name || n.key.value))) { const w = wordsOf(n.value); if (w) push(w, { kind: 'string', words: w.value, line: w.loc.start.line, lineText: lines[w.loc.start.line - 1] }); }
    if (n.type === 'SwitchCase' && n.test && STATE_KEYS.has(n.test.value)) for (const c of n.consequent) { const w = c.type === 'ReturnStatement' ? wordsOf(c.argument) : null; if (w) push(w, { kind: 'string', words: w.value, line: w.loc.start.line, lineText: lines[w.loc.start.line - 1] }); }
    if (n.type === 'Literal' && typeof n.value === 'string' && PHRASE.test(n.value)) push(n, { kind: 'string', words: n.value, line: n.loc.start.line, lineText: lines[n.loc.start.line - 1] });
    else if (n.type === 'Literal' && n.regex && PHRASE.test(n.regex.pattern)) push(n, { kind: 'regex', words: n.regex.pattern, line: n.loc.start.line, lineText: lines[n.loc.start.line - 1] });
    else if (n.type === 'TemplateLiteral') {   // the template's OWN words decide (a literal inside one of its expressions is its own site); judged with its expressions' source
      const own = n.quasis.map((q) => q.value.cooked).join('${…}');
      const w = n.quasis.map((q, i) => q.value.cooked + (i < n.expressions.length ? '${' + text.slice(n.expressions[i].start, n.expressions[i].end) + '}' : '')).join('');
      if (PHRASE.test(own)) push(n, { kind: 'template', words: w, line: n.loc.start.line, lineText: lines[n.loc.start.line - 1] });
    }
    else if (n.type === 'CallExpression') { const c = n.callee; const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null; if (name === 'agentWords') { push(n, { kind: 'agentWords', words: n.arguments[0] && n.arguments[0].type === 'Literal' ? String(n.arguments[0].value) : n.arguments.length ? null : '', line: n.loc.start.line, lineText: lines[n.loc.start.line - 1] }); if (n.arguments[0]) skip.add(n.arguments[0]); } }   // its WHAT is judged by ④, never a site of its own
    for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(ast);
  return { sites: out };
}
/** THE CENSUS over `files` (rel → text) and the dictionaries → { red: [...], sites, rows } */
function census(files, dicts) {
  const red = [], sites = [], judged = new Map();
  for (const [rel, text] of files) {
    if (!isJs(rel, text) || !(PHRASE.test(text) || /agentWords\(/.test(text) || EXTRA[rel])) continue;
    const r = sitesOf(text, rel);
    if (r.error) { red.push('UNPARSED ' + r.error); continue; }
    for (const s of r.sites) sites.push({ rel, ...s });
    for (const needle of EXTRA[rel] || []) { const i = text.indexOf(needle); if (i < 0) red.push(`${rel}: the named site «${needle}» is gone`); else { const line = text.slice(0, i).split('\n').length; const lt = text.split('\n')[line - 1]; sites.push({ rel, kind: 'extra', words: lt, line, lineText: lt }); } }
  }
  const says = (cls, w) => {
    const told = cls === 'person' ? P_TOLD.test(w) : cls === 'agent' ? A_TOLD.test(w) : cls === 'both' ? P_TOLD.test(w) || A_TOLD.test(w) : true;
    const where = cls === 'person' || cls === 'foryou' ? P_WHERE.test(w) : cls === 'agent' ? A_WHERE.test(w) : cls === 'both' ? P_WHERE.test(w) || A_WHERE.test(w) : true;
    return { told, where };
  };
  for (const s of sites) {
    if (s.kind === 'agentWords') {   // ④ the agent's words: the WHAT names where (the TOLD clause is the function's)
      if (s.rel === 'src/vault-blocked.js') continue;   // its own definition / default
      if (s.words == null || (s.words && !A_WHERE.test(s.words))) red.push(`${s.rel}:${s.line}: agentWords(${JSON.stringify(s.words)}) does not say WHERE a person unlocks it (${A_WHERE})`);
      continue;
    }
    const rows = (ROWS[s.rel] || []).filter(([needle]) => s.words.includes(needle));
    if (!rows.length) { red.push(`${s.rel}:${s.line}: a ${s.kind} wording a locked vault has no row — «${s.words.slice(0, 120)}» (classify it: person / agent / both / foryou, or carried / label / match / log with why)`); continue; }
    const row = rows.sort((a, b) => b[0].length - a[0].length)[0];
    const [needle, cls, why, o = {}] = row;
    judged.set(row, (judged.get(row) || 0) + 1);
    if (!CLASSES.includes(cls)) { red.push(`${s.rel}: «${needle}» has no class (${cls})`); continue; }
    if (['label', 'match', 'log', 'carried'].includes(cls) && String(why).length < 40) red.push(`${s.rel}: «${needle}» is ${cls} without a 40-character why`);
    if (cls === 'match' && s.kind !== 'regex' && !/\.test\(|\.includes\(|===|match\(/.test(s.lineText)) red.push(`${s.rel}:${s.line}: «${needle}» is a match row but the site is words, not a test`);
    if (cls === 'carried') { const via = ROWS[o.via] || []; if (!via.some(([, c]) => ['person', 'agent', 'both'].includes(c))) red.push(`${s.rel}: «${needle}» is carried via ${o.via}, which says no sentence of its own`); }
    if (!['person', 'agent', 'both', 'foryou'].includes(cls)) continue;
    if (o.with && !s.lineText.includes(o.with)) { red.push(`${s.rel}:${s.line}: «${needle}» must stand WITH «${o.with}» on its line`); continue; }
    let w = s.kind === 'extra' ? s.lineText : s.words + (o.with ? ' ' + o.with : '');
    for (const [k, v] of Object.entries(o.expand || {})) w = w.split(k).join(v === 'TOLD' ? VB.TOLD : v);   // a template's own parts, as they run
    const f = says(cls, w);
    if (!f.told || !f.where) red.push(`${s.rel}:${s.line}: a ${cls} sentence must say ${!f.told ? 'that the owner has been told' : ''}${!f.told && !f.where ? ' and ' : ''}${!f.where ? 'where to unlock' : ''} — «${w.slice(0, 160)}»`);
    // a person's words in the other languages: the same two facts
    if ((cls === 'person' || cls === 'both' || cls === 'foryou') && dicts) for (const [lang, d, told, where] of [['zh', dicts.zh, /待你处理/, /解锁|第二密码/], ['ja', dicts.ja, /あなた宛て/, /解除|第二パスワード/]]) {
      if (!Object.prototype.hasOwnProperty.call(d, s.words)) continue;
      const tw = d[s.words] + (o.with ? ' ' + (d[o.with] || '') : '');   // a sentence WITH its tail is judged whole
      if ((cls !== 'foryou' && !told.test(tw)) || !where.test(tw)) red.push(`${s.rel}: the ${lang} words of «${s.words.slice(0, 60)}» lose a fact — «${tw.slice(0, 80)}»`);
    }
  }
  for (const [rel, rows] of Object.entries(ROWS)) for (const row of rows) { const n = judged.get(row) || 0, want = (row[3] && row[3].count) || 1; if (n !== want) red.push(`${rel}: the row «${row[0].slice(0, 60)}» judges ${n} site(s), declared ${want} — ${n ? 'move the count' : 'a dead row: retire it'}`); }
  for (const [name, rel, needle] of SEVEN) { const row = (ROWS[rel] || []).find(([n]) => n === needle); if (!row || !['person', 'agent', 'both', 'foryou'].includes(row[1])) red.push(`${name} (${rel}) is not a row that SAYS the two facts`); }
  return { red, sites };
}

const VB = require(path.join(REPO, 'src/vault-blocked.js'));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const FILES = new Map(tracked.map((f) => [f, read(f)]));
const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const DICTS = { zh, ja };

console.log('① ② ③ ④ THE CENSUS — every site wording a locked vault, its row, its two facts');
const C = census(FILES, DICTS);
const byCls = {}; for (const s of C.sites) { const row = (ROWS[s.rel] || []).find(([n]) => s.words && s.words.includes(n)); const c = s.kind === 'agentWords' ? 'agentWords' : row ? row[1] : '?'; byCls[c] = (byCls[c] || 0) + 1; }
ok(C.sites.length >= 50 && !C.red.length, `${C.sites.length} sites in ${new Set(C.sites.map((s) => s.rel)).size} files, every one a row — ${Object.entries(byCls).map(([k, v]) => `${k} ${v}`).join(' · ')} — every person / agent sentence says the owner has been told AND where to unlock (zh / ja too)`, C.red);
ok(SEVEN.every(([, rel, needle]) => (ROWS[rel] || []).some(([n, c]) => n === needle && c !== 'label')), `the seven places r1 named (${SEVEN.map(([n]) => n).join(' · ')}) are rows that say both — none exempt`);
ok(A_TOLD.test(VB.AGENT_WORDS) && A_WHERE.test(VB.AGENT_WORDS) && A_TOLD.test(VB.agentWords('x')) && /do not ask them to unlock it/.test(VB.TOLD), 'the agent\'s words (src/vault-blocked.js): AGENT_WORDS says both; agentWords(what) appends the TOLD clause — every caller names where (④ above)');

console.log('⑤ MUTANTS — the census over a patched copy of the text (in memory), each RED');
const patched = (rel, from, to) => { const t = FILES.get(rel); const n = t.split(from).length - 1; const m = new Map(FILES); m.set(rel, t.replace(from, to)); return { n, files: m }; };
const muts = [
  ['a NEW hand-written locked sentence (a card that just says it is locked)', patched('src/lib/channels-panel.js', "const vaultLine = (a) =>", "const lockedNote = () => 'the vault is locked — try again later';\nconst vaultLine = (a) =>"), /has no row/],
  ['the channels card without its TOLD (For you)', patched('src/channel-caps.js', `case 'vault-locked': return t('${K1}');`, "case 'vault-locked': return t('The vault is locked — unlock it first (Unlock… at the top of the page)');"), /channel-caps\.js.*owner has been told/],
  ['the pty-wrapper wait without its two facts', patched('data/bin/pty-wrapper.js', " (the owner has been told: For you names what is waiting on it; Unlock… at the top of this instance's page)", ''), /pty-wrapper\.js.*must say/],
  ['an agentWords that does not say where', patched('src/routes/vault.js', "VB.agentWords('a person unlocks it on this instance\\'s page')", "VB.agentWords('wait for it')"), /agentWords\("wait for it"\)/],
  ['the strip\'s row retired (a dead row / an unclassified site)', patched('src/lib/vault-unlock.js', 'waiting on it (For you names them)', 'held by it (For you names them)'), /dead row|has no row/],
  ['a vault_locked word map reworded without the phrase (found by its key)', patched('src/routes/automation.js', "vault_locked: VB.agentWords('every automation waits until a person unlocks it on this instance\\'s page'),", "vault_locked: 'sealed — try later',"), /automation\.js.*has no row/],
  ['the For-you item without where', patched('src/server/vault-hooks.js', "const BLOCKED_TEXT = i18nKey('The vault is locked — waiting on it: {who}. Enter the second password to unlock.');", "const BLOCKED_TEXT = i18nKey('The vault is locked — waiting on it: {who}.');"), /vault-hooks\.js.*where to unlock/],
];
for (const [name, m, want] of muts) { const r = m.n === 1 ? census(m.files, DICTS) : null; ok(m.n === 1 && r && r.red.some((l) => want.test(l)), `MUTANT «${name}»: the patch hits once and the census goes RED${r && r.red[0] ? ' — ' + r.red.find((l) => want.test(l))?.slice(0, 140) : ''}`, r ? r.red : `the patch hit ${m.n} times`); }
const zh2 = { ...zh, [K1]: '保险库已锁定——先解锁' };
const rz = census(FILES, { zh: zh2, ja });
ok(rz.red.some((l) => /the zh words/.test(l)), 'MUTANT «the zh words of the channels card lose For you»: RED (a person reads it in Chinese too)', rz.red.slice(0, 2));

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
