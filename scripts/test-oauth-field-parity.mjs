#!/usr/bin/env node
// THE OAUTH FIELD PARITY CENSUS (docs/design-integrations-per-account.zh.md
// §4 "测试" row + §8.1 #12, D1). Fast tier, pure text — no server, no DOM.
//
// The storage dialogs (src/lib/sidebar-mounts.js) and the channel account
// dialogs (src/lib/channels-panel.js) are ONE component since D1: the field
// renderer (`mountsDialog`), the cross-browser consent row (`oauthLinkRow`)
// and the in-dialog consent block (`wireOAuthConnect`) live in
// src/lib/mounts-dialog.js and both features import them. This census keeps
// it one:
//   §1 the shared module exports the component (and the fetch wrapper)
//   §2 the mounts side IMPORTS it and holds no second copy
//   §3 ONE field renderer across src/lib: the renderer's own spellings
//      (`mounts-adv-body`, the `mounts-oauth-link` row, the paste-back
//      sentence) are written in exactly one file
//   §4 the SHARED SPELLINGS table — every label / option / class / button a
//      person sees in both dialogs, with the side(s) that must carry it; a
//      spelling one side renames and the other does not follow = red
//   §5 negative controls: each rule above reddens on a patched in-memory copy
//   §6 THE CHANNEL SIDE: its account dialogs import the component
//      (mountsDialog / wireOAuthConnect / reauthDialog) and hold NO second
//      renderer (no renderer class written, no local copy, the retired
//      wizard / flow dialog gone); the consent block runs against the
//      channel routes; the account ⋯ is the storage row's order (D6)
//   §7 THE VERBS BOTH SIDES SHARE: every re-authorize is the ONE
//      `reauthDialog`; switching the OAuth client IS a re-authorization on
//      BOTH sides (the channel Edit, and the storage Edit since D2); the Edit
//      dialog's button order per side (the channel's read off the r4 mockup);
//      Remove… lives in Edit on both sides (never a storage row icon); the
//      storage auth-death sentence borrowed verbatim (D8)
//   §8 THE DESIGN'S §4 i18n KEY LIST, re-read: every key the design names
//      (shared / new / deleted — parsed out of the design doc itself, so a
//      design edit that adds a key reddens here) is drawn where it belongs
//      AS BUILT and carried by BOTH dictionaries; a key built under another
//      spelling says which and why; a deleted key is drawn by no channel file
//
// Every SHARED row is asserted on BOTH sides: a spelling the channel side
// carries by importing the module (the renderer's own classes) is asserted
// through that import, never by the channel files writing it (§6 forbids it).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const read = (rel) => { try { return fs.readFileSync(path.join(REPO, rel), 'utf-8'); } catch { return null; } };

export const MODULE = 'src/lib/mounts-dialog.js';
export const MOUNTS = 'src/lib/sidebar-mounts.js';
export const CHANNELS = 'src/lib/channels-panel.js';
// the channel side = the panel (the account card) + its dialogs (chunk 3)
export const CHANNEL_DIALOGS = 'src/lib/channel-account-dialogs.js';
export const CHANNEL_SIDE = [CHANNELS, CHANNEL_DIALOGS];

// §1 what the shared module exports
export const EXPORTS = [
  ['mountsDialog', /export function mountsDialog\(title, fields, submitLabel, onSubmit, opts = \{\}\)/],
  ['oauthLinkRow', /export function oauthLinkRow\(url\)/],
  ['wireOAuthConnect', /export function wireOAuthConnect\(ctx, \{/],
  ['api', /export async function api\(url, opts = \{\}\)/],
  // chunk 3: the field loop as its own export, and the storage re-authorize dialog's shape
  ['renderFields', /export function renderFields\(body, fields\)/],
  ['reauthDialog', /export function reauthDialog\(\{/],
];

// §3 spellings only the ONE renderer may write (a second file writing one of
// these IS a second renderer — a copy that will drift)
export const RENDERER_ONLY = [
  ["the advanced-fields body", "'mounts-adv-body'"],
  ["the cross-browser link row", "'mounts-oauth-link'"],
  // (spelled with its tr( call: the zh/ja dictionaries carry the key as data)
  ["the cross-browser hint sentence", "tr('Account signed in on ANOTHER browser? Copy this link and open it there:')"],
  // chunk 3: the re-authorize dialog's saving line moved with its shape
  ["the re-authorize saving line", "tr('Saving token & reconnecting…')"],
];

// §4 THE SHARED SPELLINGS. `mounts` / `module` = where the storage side
// carries it (the module = drawn FOR it by the shared component);
// `channels: true` = a channel file writes it, `'module'` = the channel side
// carries it through the module it imports (asserted via that import). Keys
// are the ENGLISH i18n keys (the zh/ja dictionaries follow the key) or the
// exact class names.
export const SHARED = [
  { spelling: "tr('OAuth client')", mounts: true, channels: true },
  { spelling: "tr('Preset: {name}'", mounts: true, channels: true },
  { spelling: "tr('Custom (own client id/secret)')", mounts: true, channels: true },
  { spelling: "tr('Custom OAuth client ID')", mounts: true, channels: true },
  { spelling: "tr('Custom OAuth client secret')", mounts: true, channels: true },
  { spelling: "tr('Re-authorize {provider}…'", mounts: true, channels: true },
  { spelling: "tr('Re-authorize \"{name}\"'", mounts: true, channels: true },
  { spelling: "tr('Sign in with {provider}'", mounts: true, channels: true },
  { spelling: "tr('Remove…')", mounts: true, channels: true },
  { spelling: "tr('Remove \"{name}\"?'", mounts: true, channels: true },
  { spelling: "tr('Create & connect')", mounts: true, channels: true },
  { spelling: "tr('Connect')", mounts: true, channels: true },
  { spelling: "tr('Couldn’t connect:')", mounts: true, channels: true },
  { spelling: "tr('Edit')", mounts: true, channels: true },
  { spelling: "tr('Name')", mounts: true, channels: true },
  { spelling: "tr('Save')", mounts: true, channels: true },
  // the storage ROW's classes the account card draws with (§8.1 #1 / #3 / #7 / #10: the same CSS on a phone)
  { spelling: 'mounts-errline', mounts: true, channels: true },
  { spelling: 'mounts-btn mounts-btn-primary mounts-reauth-btn', mounts: true, channels: true },
  { spelling: 'mounts-typetag', mounts: true, channels: true },
  { spelling: 'mounts-icon-btn', mounts: true, channels: true },
  { spelling: 'mounts-child-arrow', mounts: true, channels: true },
  // drawn BY THE MODULE for both sides — the channel side carries them by importing it (§6), never by writing them
  { spelling: "'mounts-field-hint'", module: true, mounts: true, channels: 'module' },
  { spelling: "'mounts-drive-connect'", module: true, mounts: true, channels: 'module' },
  // the submit button and the inline error line: the module draws them for every mountsDialog caller;
  // the storage Edit dialog (its own form) spells them too
  { spelling: 'btn-create', module: true, mounts: true, channels: 'module' },
  { spelling: 'cfg-err', module: true, mounts: true, channels: 'module' },
];

// §6 the channel side's rules
// what a SECOND RENDERER would have to write — the channel files may not
export const CHANNEL_FORBIDDEN = [
  ["the renderer's hint class", "'mounts-field-hint'"],
  ["the consent block's class", "'mounts-drive-connect'"],
  ["the cross-browser row's class", "'mounts-oauth-link'"],
  ["the advanced-fields body", "'mounts-adv-body'"],
  ["the renderer's error line", "'cfg-err'"],
  ["a local field renderer", "function renderFields("],
  ["a local mountsDialog", "function mountsDialog("],
  ["a local consent block", "function wireOAuthConnect("],
  ["a local re-authorize dialog", "function reauthDialog("],
  // the retired pre-r4 wizard: its own flow dialog, the stepper, the credential step
  ["the retired flow dialog", "chan-flow-dialog"],
  ["the retired stepper", "chan-steps"],
  ["the retired credential step", "chan-cred-list"],
  ["the retired flow renderer", "showFlowDialog"],
  ["the retired row default pick", "credentialDefault"],
];
// §6 STRUCTURAL (integrations r1, verifier finding 3): the list above is a
// SPELLING census — a second renderer that writes none of those spellings
// (a createElement('select') loop over a fields array) passed it. The claim
// is structural, so the rule is too: the account dialogs hand the component
// field SPECS and never build a form control themselves; the panel builds
// form controls ONLY in the functions named here, none of them an account
// field (each with the reason it is not). A form control = createElement of
// input/select/textarea/option/label/optgroup/datalist, a createElement
// whose tag is not a literal (a generic renderer), `new Option(`, or markup
// with one of those tags written through innerHTML/outerHTML/
// insertAdjacentHTML.
export const PANEL_CONTROL_OWNERS = {
  trackList: 'the Track… checklist — one box per discovered conversation, not an account field',
  showOptionsDialog: 'the adapter-declared options editor (after connect) — not the OAuth client or the sign-in',
  showPushDialog: 'the push-lane claim — its own dialog, not an account field',
};
export function formControls(text) {
  const out = [];
  let fn = null;
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const d = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/.exec(l) || /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=/.exec(l);
    if (d) fn = d[1];
    const hit = /createElement\(\s*(['"`])(input|select|textarea|option|label|optgroup|datalist)\1/i.test(l)
      || /createElement\(\s*(?!['"`])[^\s)]/.test(l)
      || /\bnew Option\(/.test(l)
      || /(?:innerHTML|outerHTML|insertAdjacentHTML)[^\n]*<(?:input|select|textarea|option|label|optgroup|datalist)\b/i.test(l);
    if (hit) out.push({ line: i + 1, fn });
  }
  return out;
}
// D6: the account ⋯ in the storage row's action order (group, order → label key)
export const D6_ORDER = ['Open conversation window', 'Track…', 'Options', 'Push…', 'Connect|Re-authorize', 'Duplicate…', 'Disconnect', 'Remove…', 'Disable|Enable'];
/** The `channel-adapter` items an ACCOUNT sees, in menu order (group, order),
 *  read off the registrations (the label's key(s); a source-only item is skipped). */
export function accountMenuOrder(panel) {
  const out = [];
  const re = /registerMenuItem\(\{\s*menu: M, group: '([^']+)', order: (\d+),([\s\S]*?)\}\);/g;
  for (const m of String(panel || '').matchAll(re)) {
    const body = m[3];
    if (/separator: true/.test(body) && !/label:/.test(body)) continue;
    if (/when: sender\b|sender\(c\)/.test(body)) continue;   // a SOURCE's sender-line rows (an account's lives in Edit)
    const keys = [...body.matchAll(/\bt\('([^']+)'\)/g)].map((x) => x[1]).filter((k) => !/^(on|off|\(instance default\)|Sender line: \{v\})$/.test(k));
    const labelPart = (body.match(/label: ([^\n]*?)(?:, run:|, tooltip:|, labelHtml:|$)/) || [])[1] || '';
    const labels = [...labelPart.matchAll(/\bt\('([^']+)'\)/g)].map((x) => x[1]);
    if (!labels.length) continue;
    out.push({ group: m[1], order: Number(m[2]), label: [...new Set(labels)].sort().join('|'), keys });
  }
  out.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.order - b.order));
  return out.map((x) => x.label);
}

const libFiles = (texts) => Object.keys(texts).filter((f) => f.startsWith('src/lib/') && f.endsWith('.js'));
const importsComponent = (text, names) => !!text && names.every((n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from\\s*'\\./mounts-dialog\\.js'`).test(text));

export const DESIGN = 'docs/design-integrations-per-account.zh.md';
export const EDIT_MOCKUP = 'docs/mockups/integrations-per-account/edit-dialog.html';
export const MOUNTS_SERVER = 'src/mounts.js';
// the files a channel-side KEY may be spelled in: the panel, the dialogs, their words, and the adapters'
// declared option labels (i18nKey — the Settings / Options / Edit dialogs draw them)
export const CHANNEL_KEY_FILES = [...CHANNEL_SIDE, 'src/lib/channel-words.js', 'src/channels/gmail.js', 'src/channels/lark.js'];

// §7 the Edit dialog's actions, left → right, per side (Save = the submit, always last)
export const EDIT_ORDER = {
  mounts: ['Remove…', 'Re-authorize {provider}…', 'Save'],
  channels: ['Re-authorize {provider}…', 'Duplicate…', 'Remove…', 'Save'],
};
// the r4 mockup's button ids → keys (the channel order is READ OFF the mockup, not restated)
export const MOCKUP_IDS = { reauth: 'Re-authorize {provider}…', duplicate: 'Duplicate…', remove: 'Remove…', save: 'Save' };

/** The storage Edit dialog's action order: its buttons are PREPENDED into
 *  `.dialog-actions` one by one (each prepend lands first), Save is the form's
 *  own submit. Read off `_showEditMountDialog`'s body. */
export function mountsEditOrder(mounts) {
  const i = String(mounts || '').indexOf('async _showEditMountDialog(m) {');
  if (i < 0) return null;
  const body = mounts.slice(i, mounts.indexOf('\n    _showMintShareDialog(', i));
  const labelOf = {};
  for (const m of body.matchAll(/\b(\w+)\.textContent = tr\('([^']+)'/g)) labelOf[m[1]] = m[2];
  const prepends = [...body.matchAll(/\.dialog-actions'\)\.prepend\((\w+)\)/g)].map((m) => labelOf[m[1]] || `?${m[1]}`);
  const save = /<div class="dialog-actions"><button type="submit" class="btn-create">\$\{tr\('Save'\)\}<\/button><\/div>/.test(body);
  return [...prepends.reverse(), ...(save ? ['Save'] : [])];
}
/** The channel Edit dialog's action order: ONE `acts.prepend(a, b, c)` (in
 *  order) before mountsDialog's own submit (the Save label it is handed). */
export function channelsEditOrder(dlg) {
  const i = String(dlg || '').indexOf('export async function showEditAccountDialog(');
  if (i < 0) return null;
  const body = dlg.slice(i, dlg.indexOf('\nexport ', i + 10));
  const labelOf = {};
  for (const m of body.matchAll(/const (\w+) = btn\(tr\('([^']+)'/g)) labelOf[m[1]] = m[2];
  const pm = /acts\.prepend\(([^)]*)\)/.exec(body);
  const save = /mountsDialog\([^\n]*, fields, tr\('Save'\),/.test(body);
  return [...(pm ? pm[1].split(',').map((v) => labelOf[v.trim()] || `?${v.trim()}`) : []), ...(save ? ['Save'] : [])];
}
/** The mockup's order: the button ids inside its `.dialog-actions`, mapped to keys. */
export function mockupEditOrder(html) {
  const m = /<div class="dialog-actions">([\s\S]*?)<\/div>/.exec(String(html || ''));
  return m ? [...m[1].matchAll(/id="([\w-]+)"/g)].map((x) => MOCKUP_IDS[x[1]] || `?${x[1]}`) : null;
}

// §8 THE DESIGN'S §4 i18n KEY LIST, as built. `where`: 'both' = the storage
// side (sidebar-mounts / the module) AND the channel side; 'channels' / 'mounts'
// = that side only (`why` says so when the design listed it as shared);
// `built` = the spelling the code carries when it is not the design's (an
// array = drawn as parts); `built: null` = not drawn, with the reason.
export const DESIGN_I18N = [
  // 共用键 (keys the dictionaries already had)
  { key: 'OAuth client', where: 'both' },
  { key: 'Preset: {name}', where: 'both' },
  { key: 'Custom (own client id/secret)', where: 'both' },
  { key: 'Re-authorize {provider}…', where: 'both' },
  { key: 'Re-authorize "{name}"', where: 'both' },
  { key: 'Sign in with {provider}', where: 'both' },
  { key: 'Couldn’t connect:', where: 'both' },
  { key: 'Remove…', where: 'both' },
  { key: 'Edit', where: 'both' },
  { key: 'Duplicate', built: 'Duplicate…', where: 'channels', why: 'a verb that opens a dialog carries the ellipsis; the storage row\'s ⧉ Duplicate was retired for submounts (design §1)' },
  { key: 'Create & connect', where: 'both' },
  { key: 'List labels', where: 'mounts', why: 'the channel Gmail account filters by its include query (src/channels/gmail.js), not by a label list — the picker stays a storage verb' },
  { key: 'Track…', where: 'channels' },
  { key: 'Options', where: 'channels' },
  { key: 'Push…', where: 'channels' },
  { key: 'Enable', where: 'channels' },
  { key: 'Disable', where: 'channels' },
  { key: 'Nothing is fetched for a conversation until you track it.', where: 'channels' },
  // 新键
  { key: 'Connect an account', where: 'channels' },
  { key: 'Type', where: 'channels' },
  { key: 'Connected · {filter} · last poll {ago} · push: {claim}', built: ['Connected', 'last poll {ago}', 'push: {claim}'], where: 'channels', why: 'drawn as parts joined by " · " — the storage detail line\'s grammar; the filter is the account\'s own option value' },
  { key: 'connected but the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix', where: 'channels' },
  { key: 'Login only — no conversation tracked yet; nothing is fetched until you track one. Use Track… to pick conversations under this account.', where: 'channels' },
  { key: 'Duplicate "{name}"', where: 'channels' },
  { key: '{name} (copy)', where: 'channels' },
  { key: 'Copied from the original; you can change it.', where: 'channels' },
  { key: 'Copied: the type, the OAuth client, the query, the push claim, the sender line. NOT copied: the token (a login is one person\'s consent), tracked conversations, assignments, reach grants, the message log — the copy signs in on its own.',
    built: 'Copied: the type, the OAuth client, the query, the push claim, the sender line. NOT copied: the token (a login is one person’s consent), tracked conversations, assignments, reach grants, the message log — the copy signs in on its own.',
    where: 'channels', why: 'the typographic apostrophe — the house spelling of UI text' },
  { key: 'This copy needs its own sign-in — another account, or the same one authorized again.', where: 'channels' },
  { key: 'Cannot remove "{name}"', where: 'channels' },
  { key: 'This account is still referenced — release these first:', where: 'channels' },
  { key: 'assignment: {conv} → {who}', where: 'channels' },
  { key: 'reach: {who} may see the whole account', where: 'channels' },
  { key: 'outbox: {n} proposal(s) awaiting approval', where: 'channels' },
  { key: 'Disconnect only drops the token and keeps these; Remove needs them released first — the same rule as a credential with submounts.', where: 'channels' },
  { key: 'Open conversation window', where: 'channels' },
  { key: 'Custom App ID', where: 'channels' },
  { key: 'Custom App Secret', where: 'channels' },
  { key: 'Included groups (optional)', built: null, where: 'channels', why: 'Lark declares no include-groups option in r4 (src/channels/lark.js: brand only) — nothing draws it' },
  { key: 'Include query (Gmail search syntax)', built: 'Include query', where: 'channels', why: 'the adapter\'s declared option label (src/channels/gmail.js i18nKey); the syntax is in its help line' },
];
// 删除键: drawn by NO channel file (manage-agents keeps its own "Add account…" for AI accounts)
export const DESIGN_I18N_DELETED = ['Add account…'];

/** The backticked keys of the design's §4 i18n row, by list. */
export function designI18nKeys(doc) {
  const line = String(doc || '').split('\n').find((l) => l.startsWith('| **i18n (zh + ja)** |'));
  if (!line) return null;
  const part = (a, b) => { const i = line.indexOf(a); const j = b ? line.indexOf(b, i + 1) : line.length; return i < 0 ? '' : line.slice(i, j < 0 ? line.length : j); };
  const keys = (t) => [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  return { shared: keys(part('共用键:', '新键:')), added: keys(part('新键:', '删除键:')), deleted: keys(part('删除键:', null)).filter((k) => k !== 'Connect an account') };
}


// The census as a PURE function over {relPath: text} so the controls below
// can feed it a patched copy without touching the tree.
export function census(texts) {
  const out = []; // {rule, ok, why}
  const mod = texts[MODULE];
  const mounts = texts[MOUNTS];
  out.push({ rule: `§1 ${MODULE} exists`, ok: typeof mod === 'string', why: 'missing' });
  for (const [name, re] of EXPORTS) out.push({ rule: `§1 the module exports ${name}`, ok: !!mod && re.test(mod), why: `no ${re}` });
  out.push({ rule: '§2 sidebar-mounts imports the component from ./mounts-dialog.js',
    ok: !!mounts && ['mountsDialog', 'oauthLinkRow', 'wireOAuthConnect'].every((n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from\\s*'\\./mounts-dialog\\.js'`).test(mounts)),
    why: 'the import line is missing or incomplete' });
  out.push({ rule: '§2 sidebar-mounts holds no local oauthLinkRow', ok: !!mounts && !/\bfunction oauthLinkRow\(/.test(mounts), why: 'a local `function oauthLinkRow(` is back' });
  out.push({ rule: '§2 sidebar-mounts holds no local fetch wrapper', ok: !!mounts && !/\basync function api\(/.test(mounts), why: 'a local `async function api(` is back' });
  out.push({ rule: '§2 _mountsDialog delegates to the shared renderer', ok: !!mounts && /_mountsDialog\([^)]*\)\s*\{\s*const ctx = mountsDialog\(/.test(mounts), why: 'the method no longer calls mountsDialog(' });
  out.push({ rule: '§2 _wireOAuthConnect delegates to the shared block', ok: !!mounts && /_wireOAuthConnect\([^)]*\)\s*\{\s*return wireOAuthConnect\(/.test(mounts), why: 'the method no longer calls wireOAuthConnect(' });
  for (const [what, lit] of RENDERER_ONLY) {
    const writers = libFiles(texts).filter((f) => texts[f] && texts[f].includes(lit));
    out.push({ rule: `§3 ONE renderer writes ${what} (${writers.join(', ') || 'nobody'})`, ok: writers.length === 1 && writers[0] === MODULE, why: `written by ${JSON.stringify(writers)}` });
  }
  out.push({ rule: '§2 _showDriveReauthDialog delegates to the shared dialog', ok: !!mounts && /_showDriveReauthDialog\(m\) \{[\s\S]{0,400}?return reauthDialog\(\{/.test(mounts), why: 'the method no longer calls reauthDialog(' });
  // the channel side = both files; a spelling carried with the panel's `t(` alias counts (the panel imports `t`, the dialogs `t as tr`)
  const side = CHANNEL_SIDE.map((f) => texts[f] || '').join('\n');
  const carries = (sp) => side.includes(sp) || (sp.startsWith('tr(') && side.includes(sp.replace(/^tr\(/, 't(')));
  for (const row of SHARED) {
    if (row.module) out.push({ rule: `§4 ${row.spelling} — the shared module`, ok: !!mod && mod.includes(row.spelling), why: 'the module lost it' });
    if (row.mounts) out.push({ rule: `§4 ${row.spelling} — the mounts side`, ok: !!mounts && mounts.includes(row.spelling), why: 'sidebar-mounts lost it' });
    if (row.channels === true) out.push({ rule: `§4 ${row.spelling} — the channel side`, ok: carries(row.spelling), why: `neither ${CHANNEL_SIDE.join(' nor ')} carries it` });
    if (row.channels === 'module') out.push({ rule: `§4 ${row.spelling} — the channel side, through the module`,
      ok: !!mod && mod.includes(row.spelling) && importsComponent(texts[CHANNEL_DIALOGS], ['mountsDialog']) && /\bmountsDialog\(/.test(texts[CHANNEL_DIALOGS] || ''),
      why: 'the module lost it, or the channel dialogs no longer draw through mountsDialog' });
  }
  // §6 the channel side
  const dlg = texts[CHANNEL_DIALOGS];
  const panel = texts[CHANNELS];
  out.push({ rule: `§6 ${CHANNEL_DIALOGS} exists`, ok: typeof dlg === 'string', why: 'missing' });
  out.push({ rule: '§6 the channel dialogs import mountsDialog / wireOAuthConnect / reauthDialog from ./mounts-dialog.js',
    ok: !!dlg && ['mountsDialog', 'wireOAuthConnect', 'reauthDialog'].every((n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from\\s*'\\./mounts-dialog\\.js'`).test(dlg)),
    why: 'the import line is missing or incomplete' });
  out.push({ rule: '§6 the channel dialogs CALL the component (mountsDialog( / wireOAuthConnect( / reauthDialog()',
    ok: !!dlg && /\bmountsDialog\(/.test(dlg) && /\bwireOAuthConnect\(/.test(dlg) && /\breauthDialog\(/.test(dlg), why: 'a component call is missing' });
  out.push({ rule: '§6 the panel draws its dialogs through channel-account-dialogs.js',
    ok: !!panel && /import\s*\{[^}]*\bshowConnectAccountDialog\b[^}]*\}\s*from\s*'\.\/channel-account-dialogs\.js'/.test(panel), why: 'the panel no longer imports the account dialogs' });
  out.push({ rule: '§6 the channel consent block runs against /api/channels/oauth/{start,status,callback}',
    ok: !!dlg && ['start', 'status', 'callback'].every((v) => dlg.includes(`'/api/channels/oauth/${v}'`)) && /endpoints: \{/.test(dlg), why: 'the channel endpoints are not what the block is handed' });
  for (const [what, lit] of CHANNEL_FORBIDDEN) {
    const writers = CHANNEL_SIDE.filter((f) => texts[f] && texts[f].includes(lit));
    out.push({ rule: `§6 no second renderer on the channel side: ${what}`, ok: writers.length === 0, why: `written by ${JSON.stringify(writers)}` });
  }
  const dlgControls = formControls(dlg);
  out.push({ rule: `§6 structural: ${CHANNEL_DIALOGS} builds NO form control (its contract is field specs for mountsDialog)`, ok: typeof dlg === 'string' && dlgControls.length === 0,
    why: `form controls built at ${JSON.stringify(dlgControls)}` });
  const strays = formControls(panel).filter((h) => !Object.prototype.hasOwnProperty.call(PANEL_CONTROL_OWNERS, h.fn));
  out.push({ rule: `§6 structural: ${CHANNELS} builds form controls only in ${Object.keys(PANEL_CONTROL_OWNERS).join(' / ')} (none an account field)`, ok: typeof panel === 'string' && strays.length === 0,
    why: `form controls built outside them at ${JSON.stringify(strays)}` });
  const order = accountMenuOrder(panel);
  out.push({ rule: `§6 D6: the account ⋯ is the storage row's order (${D6_ORDER.join(' → ')})`, ok: JSON.stringify(order) === JSON.stringify(D6_ORDER), why: `the registrations read ${JSON.stringify(order)}` });

  // §7 the verbs both sides share
  const method = (text, head) => { const t = String(text || ''); const i = t.indexOf(head); if (i < 0) return ''; const j = t.indexOf('\n    },\n', i); return t.slice(i, j < 0 ? undefined : j); };
  const plainReauth = method(mounts, '_showDriveReauthDialog(m) {');
  const switchReauth = method(mounts, '_showClientSwitchReauthDialog(m, cfg, sw, presets = []) {');
  const chanReauth = (() => { const t = dlg || ''; const i = t.indexOf('export async function showReauthAccountDialog('); return i < 0 ? '' : t.slice(i, t.indexOf('\nexport ', i + 10)); })();
  out.push({ rule: '§7 re-authorize: the storage plain re-authorize, the storage client-switch re-authorize (D2) and the channel Re-authorize are ALL the shared reauthDialog',
    ok: /return reauthDialog\(\{/.test(plainReauth) && /return reauthDialog\(\{/.test(switchReauth) && /reauthDialog\(\{/.test(chanReauth),
    why: JSON.stringify({ storagePlain: /reauthDialog\(/.test(plainReauth), storageSwitch: /reauthDialog\(/.test(switchReauth), channel: /reauthDialog\(/.test(chanReauth) }) });
  const writers = libFiles(texts).filter((f) => f !== MODULE && texts[f] && texts[f].includes("'mount-reauth-dialog'"));
  out.push({ rule: '§7 re-authorize: no file but the module builds the storage re-authorize dialog itself', ok: writers.length === 0, why: `written by ${JSON.stringify(writers)}` });
  out.push({ rule: '§7 re-authorize: both sides spell the dialog alike (title "Re-authorize \\"{name}\\"", the button "Sign in with {provider}")',
    ok: [plainReauth, switchReauth, chanReauth].every((b) => b.includes("tr('Re-authorize \"{name}\"'") && b.includes("tr('Sign in with {provider}'")), why: 'a re-authorize dialog spells its title or its button differently' });
  const editM = method(mounts, 'async _showEditMountDialog(m) {');
  const editC = (() => { const t = dlg || ''; const i = t.indexOf('export async function showEditAccountDialog('); return i < 0 ? '' : t.slice(i, t.indexOf('\nexport ', i + 10)); })();
  out.push({ rule: '§7 switching the OAuth client IS a re-authorization — the storage Edit (D2): Save asks _mountClientSwitch and opens the client-switch re-authorize',
    ok: /this\._mountClientSwitch\(cfg, cur, editPresets\)/.test(editM) && /this\._showClientSwitchReauthDialog\(/.test(editM)
      // …and the Save that precedes it carries NO client field (the verifier's plant 5: the strip neutered still passed this rule)
      && /if \(sw\) \{[\s\S]{0,300}for \(const k of \['clientPreset', 'clientId', 'clientSecret'\]\) delete patch\[k\];[\s\S]{0,200}method: 'PATCH'/.test(editM),
    why: 'the storage Save no longer routes a client switch to re-authorize, or its PATCH keeps the client fields' });
  out.push({ rule: '§7 …and the channel Edit: Save asks switchesClient and opens Re-authorize with the new client preselected',
    ok: /switchesClient\(/.test(editC) && /showReauthAccountDialog\(app, a, \{ kinds, preselect:/.test(editC), why: 'the channel Save no longer routes a client switch to re-authorize' });
  out.push({ rule: '§7 …and on both sides the token lands WITH the new client (storage: drive-token {token, client} / Gmail PATCH {clientPreset, token}; channel: the reauthorize choice body)',
    ok: /drive-token`, \{ method: 'POST', body: JSON\.stringify\(\{ token, client: sw\.client \}\)/.test(switchReauth) && /JSON\.stringify\(\{ clientPreset: sw\.client\.clientPreset, token \}\)/.test(switchReauth)
      && /\/reauthorize`, choiceBody\(vals\)/.test(chanReauth), why: 'a side writes the token without its client' });
  const mo = mountsEditOrder(mounts), co = channelsEditOrder(dlg), mk = mockupEditOrder(texts[EDIT_MOCKUP]);
  out.push({ rule: `§7 Edit's buttons, storage: ${EDIT_ORDER.mounts.join(' · ')}`, ok: JSON.stringify(mo) === JSON.stringify(EDIT_ORDER.mounts), why: `read ${JSON.stringify(mo)}` });
  out.push({ rule: `§7 Edit's buttons, channel: ${EDIT_ORDER.channels.join(' · ')}`, ok: JSON.stringify(co) === JSON.stringify(EDIT_ORDER.channels), why: `read ${JSON.stringify(co)}` });
  out.push({ rule: '§7 …the channel order IS the r4 mockup\'s (edit-dialog.html)', ok: JSON.stringify(mk) === JSON.stringify(EDIT_ORDER.channels), why: `the mockup reads ${JSON.stringify(mk)}` });
  out.push({ rule: '§7 …and on both sides Save is last, Remove… is the one danger button, Re-authorize precedes Save',
    ok: [EDIT_ORDER.mounts, EDIT_ORDER.channels].every((o) => o[o.length - 1] === 'Save' && o.includes('Remove…') && o.indexOf('Re-authorize {provider}…') < o.indexOf('Save'))
      && /del\.className = 'mounts-btn mounts-btn-danger'/.test(editM) && /btn\(tr\('Remove…'\)[^\n]*'mounts-btn-danger'\)/.test(editC), why: 'the shared shape of the two orders broke' });
  const rowM = method(mounts, '    _buildMountRow(m) {');
  out.push({ rule: '§7 Remove… lives in the Edit dialog on both sides — the storage row carries no remove icon; the channel ⋯ carries it too (D6)',
    ok: !!editM && editM.includes("tr('Remove…')") && !!rowM && !/ibtn\([^)]*'Remove/.test(rowM) && !/tr\('Remove/.test(rowM) && editC.includes("tr('Remove…')") && D6_ORDER.includes('Remove…'),
    why: JSON.stringify({ storageEdit: editM.includes("tr('Remove…')"), storageRowIcon: /tr\('Remove/.test(rowM), channelEdit: editC.includes("tr('Remove…')") }) });
  out.push({ rule: '§7 Remove refused by reference names the storage rule (a credential with submounts)',
    ok: /export function showRemoveRefusedDialog\(/.test(dlg || '') && (dlg || '').includes('the same rule as a credential with submounts'), why: 'the refusal dialog or its sentence is gone' });
  const srv = texts[MOUNTS_SERVER] || '';
  const mDeath = (/'(connected but the sign-in has expired or been revoked — [^']*; re-authorize to fix)'/.exec(srv) || [])[1] || '';
  const cDeath = (/t\('(connected but the sign-in has expired or been revoked — [^']*; re-authorize to fix)'\)/.exec(panel || '') || [])[1] || '';
  out.push({ rule: '§7 D8: the channel auth-death sentence borrows the storage one verbatim (same head, same "; re-authorize to fix" tail, the object swapped)',
    ok: !!mDeath && !!cDeath && mDeath.split(' — ')[0] === cDeath.split(' — ')[0] && mDeath.endsWith('; re-authorize to fix') && cDeath.endsWith('; re-authorize to fix'),
    why: JSON.stringify({ storage: mDeath, channel: cDeath }) });

  // §8 the design's §4 i18n key list, as built
  const dk = designI18nKeys(texts[DESIGN]);
  out.push({ rule: `§8 the design's §4 i18n row parses (${DESIGN})`, ok: !!dk && dk.shared.length > 0 && dk.added.length > 0, why: 'the row is gone or reshaped' });
  if (dk) {
    const listed = new Set(DESIGN_I18N.map((r) => r.key));
    const missing = [...dk.shared, ...dk.added].filter((k) => !listed.has(k));
    const extra = DESIGN_I18N.filter((r) => ![...dk.shared, ...dk.added].includes(r.key)).map((r) => r.key);
    out.push({ rule: `§8 every key the design names has its row here (${dk.shared.length} shared + ${dk.added.length} new), and no row the design does not name`, ok: !missing.length && !extra.length, why: JSON.stringify({ missing, extra }) });
    out.push({ rule: '§8 the deleted keys are the design\'s', ok: JSON.stringify(dk.deleted) === JSON.stringify(DESIGN_I18N_DELETED), why: JSON.stringify(dk.deleted) });
  }
  const zh = texts['src/lib/i18n-zh.js'] || '', ja = texts['src/lib/i18n-ja.js'] || '';
  const inDict = (k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':');
  const drawnIn = (files, k) => files.some((f) => (texts[f] || '').includes(`'${k}'`));
  const mountsFiles = [MOUNTS, MODULE];
  for (const r of DESIGN_I18N) {
    if (r.built === null) { out.push({ rule: `§8 "${r.key.slice(0, 60)}" — not drawn (${r.why})`, ok: !drawnIn(CHANNEL_KEY_FILES, r.key), why: 'it IS drawn now — give the row its sides' }); continue; }
    const spellings = Array.isArray(r.built) ? r.built : [r.built || r.key];
    for (const sp of spellings) {
      const sides = r.where === 'both' ? [['the storage side', mountsFiles], ['the channel side', CHANNEL_KEY_FILES]] : r.where === 'mounts' ? [['the storage side', mountsFiles]] : [['the channel side', CHANNEL_KEY_FILES]];
      for (const [label, files] of sides) out.push({ rule: `§8 "${sp.slice(0, 60)}${sp.length > 60 ? '…' : ''}" — ${label}${sp !== r.key ? ` (built for "${r.key.slice(0, 40)}${r.key.length > 40 ? '…' : ''}": ${r.why})` : r.why ? ` (${r.why})` : ''}`, ok: drawnIn(files, sp), why: `not in ${files.join(', ')}` });
      out.push({ rule: `§8 "${sp.slice(0, 60)}${sp.length > 60 ? '…' : ''}" — zh + ja`, ok: inDict(sp), why: 'a dictionary lacks it' });
    }
  }
  for (const k of DESIGN_I18N_DELETED) out.push({ rule: `§8 deleted: "${k}" is drawn by no channel file`, ok: !CHANNEL_SIDE.some((f) => (texts[f] || '').includes(`t('${k}')`) || (texts[f] || '').includes(`tr('${k}')`)), why: 'a channel file draws it again' });
  return out;
}

function loadTexts() {
  const texts = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) texts[rel] = read(rel);
    }
  };
  walk('src/lib');
  for (const rel of ['src/channels/gmail.js', 'src/channels/lark.js', DESIGN, EDIT_MOCKUP, MOUNTS_SERVER]) texts[rel] = read(rel);
  return texts;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const texts = loadTexts();
  console.log('§1–§4 the census over the tree');
  for (const r of census(texts)) ok(r.ok, r.rule, r.why);

  console.log(`\n  (the channel side = ${CHANNEL_SIDE.join(' + ')}; ${SHARED.filter((r) => r.channels === true).length} shared spellings written by it, ${SHARED.filter((r) => r.channels === 'module').length} drawn for it by the module — all ${SHARED.length} asserted on both sides; the design's §4 list: ${DESIGN_I18N.length} keys + ${DESIGN_I18N_DELETED.length} deleted, ${DESIGN_I18N.filter((r) => r.built !== undefined).length} built under another spelling or not drawn, each with its reason)`);

  console.log('\n§5 negative controls (patched in-memory copies — each must redden)');
  // a control is meaningful only against a rule that is GREEN on the tree and
  // turns RED on the patched copy — "something is red" would pass on a red tree
  const before = new Map(census(texts).map((r) => [r.rule, r.ok]));
  const reddens = (label, rulePart, patch) => {
    const t = { ...texts }; patch(t);
    const hit = census(t).filter((r) => r.rule.includes(rulePart) && !r.ok && (before.get(r.rule) === true || !before.has(r.rule)));
    ok(hit.length > 0, `control: ${label} ⇒ red on "${rulePart}"`, 'the rule stayed green (or was never green on the tree)');
  };
  const M = (t) => t[MODULE] || '';
  reddens('a local oauthLinkRow copied back into sidebar-mounts', 'no local oauthLinkRow', (t) => { t[MOUNTS] += '\nfunction oauthLinkRow(url) { return url; }\n'; });
  reddens('a local fetch wrapper copied back into sidebar-mounts', 'no local fetch wrapper', (t) => { t[MOUNTS] += '\nasync function api(url, opts = {}) { return url; }\n'; });
  reddens('a second renderer (the channel panel writes mounts-adv-body)', 'writes the advanced-fields body', (t) => { t[CHANNELS] = (t[CHANNELS] || '') + "\nconst x = 'mounts-adv-body';\n"; });
  reddens('a second cross-browser row (another file writes mounts-oauth-link)', 'writes the cross-browser link row', (t) => { t['src/lib/zz-control.js'] = "el.className = 'mounts-oauth-link';"; });
  reddens('the module stops exporting wireOAuthConnect', 'exports wireOAuthConnect', (t) => { t[MODULE] = M(t).replace('export function wireOAuthConnect(', 'function wireOAuthConnect('); });
  reddens('the mounts side drops the import', 'imports the component', (t) => { t[MOUNTS] = t[MOUNTS].replace("from './mounts-dialog.js'", "from './mounts-dialog-copy.js'"); });
  reddens('the mounts side renames "OAuth client"', "tr('OAuth client') — the mounts side", (t) => { t[MOUNTS] = t[MOUNTS].split("tr('OAuth client')").join("tr('OAuth app')"); });
  reddens('the module renames the hint class', "'mounts-field-hint' — the shared module", (t) => { t[MODULE] = M(t).split("'mounts-field-hint'").join("'mounts-hint'"); });
  reddens('_mountsDialog renders its own fields again', 'delegates to the shared renderer', (t) => { t[MOUNTS] = t[MOUNTS].replace(/const ctx = mountsDialog\(/, 'const ctx = localRender('); });
  // chunk 3: the channel side
  const D = (t) => t[CHANNEL_DIALOGS] || '';
  reddens('the storage re-authorize dialog is inlined again', 'delegates to the shared dialog', (t) => { t[MOUNTS] = t[MOUNTS].replace('return reauthDialog({', 'return localReauth({'); });
  reddens('the channel side renames "OAuth client"', "tr('OAuth client') — the channel side", (t) => { t[CHANNEL_DIALOGS] = D(t).split("tr('OAuth client')").join("tr('OAuth app')"); });
  reddens('the card drops the storage error line class', 'mounts-errline — the channel side', (t) => { for (const f of CHANNEL_SIDE) t[f] = (t[f] || '').split('mounts-errline').join('chan-errline'); });
  reddens('the channel dialogs stop importing reauthDialog', 'import mountsDialog / wireOAuthConnect / reauthDialog', (t) => { t[CHANNEL_DIALOGS] = D(t).replace('wireOAuthConnect, reauthDialog,', 'wireOAuthConnect,'); });
  reddens('a second renderer on the channel side (it writes the hint class itself)', "the renderer's hint class", (t) => { t[CHANNELS] += "\nh.className = 'mounts-field-hint';\n"; });
  // integrations r1 (verifier finding 3): a second renderer that writes NONE of the pinned spellings — the verifier's plant, verbatim
  const PLANTED_RENDERER = `function __secondRenderer(fields) { const frag = document.createDocumentFragment(); for (const f of fields) { const label = document.createElement('label'); label.textContent = f.label; const el = document.createElement('select'); for (const [v, l] of f.options || []) { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); } frag.appendChild(label); frag.appendChild(el); } return frag; }`;
  reddens('a spelling-free second renderer in the account dialogs (createElement select/option loop over fields)', `${CHANNEL_DIALOGS} builds NO form control`, (t) => { t[CHANNEL_DIALOGS] = D(t) + '\n' + PLANTED_RENDERER + '\n'; });
  reddens('…the same renderer in the panel, in a function of its own', 'builds form controls only in', (t) => { t[CHANNELS] = (t[CHANNELS] || '') + '\n' + PLANTED_RENDERER + '\n'; });
  reddens('…a generic renderer whose tag is not a literal', `${CHANNEL_DIALOGS} builds NO form control`, (t) => { t[CHANNEL_DIALOGS] = D(t) + "\nconst __gen = (fields) => fields.map((f) => document.createElement(f.tag));\n"; });
  reddens('…a renderer written as markup through innerHTML', 'builds form controls only in', (t) => { t[CHANNELS] = (t[CHANNELS] || '') + "\nfunction __markup(fields, el) { el.innerHTML = fields.map((f) => '<label>' + f.label + '</label><select name=\"' + f.key + '\"></select>').join(''); }\n"; });
  reddens('…an arrow-function renderer declared at module level', 'builds form controls only in', (t) => { t[CHANNELS] = (t[CHANNELS] || '') + "\nconst __arrow = (fields) => { for (const f of fields) body.appendChild(document.createElement('input')); };\n"; });
  reddens('the retired flow dialog comes back', 'the retired flow renderer', (t) => { t[CHANNELS] += '\nfunction showFlowDialog() {}\n'; });
  reddens('the consent block is pointed at the storage routes', 'runs against /api/channels/oauth', (t) => { t[CHANNEL_DIALOGS] = D(t).split("'/api/channels/oauth/status'").join("'/api/mounts/gdrive-auth/status'"); });
  reddens('Duplicate… moved after Disconnect in the ⋯', "D6: the account ⋯", (t) => { t[CHANNELS] = t[CHANNELS].replace("group: '3_auth', order: 15, when: acct, label: () => t('Duplicate…')", "group: '3_auth', order: 25, when: acct, label: () => t('Duplicate…')"); });
  // chunk 4: §7 / §8
  reddens('the channel dialogs stop drawing through mountsDialog (a module-drawn spelling loses its channel side)', "btn-create — the channel side, through the module", (t) => { t[CHANNEL_DIALOGS] = D(t).split('mountsDialog(').join('localDialog('); });
  reddens('the D2 client-switch re-authorize is inlined', 'are ALL the shared reauthDialog', (t) => { t[MOUNTS] = t[MOUNTS].replace(/(_showClientSwitchReauthDialog\(m, cfg, sw, presets = \[\]\) \{[\s\S]*?)return reauthDialog\(\{/, '$1return localReauth({'); });
  reddens('another file builds the storage re-authorize dialog', 'no file but the module builds', (t) => { t['src/lib/zz-control.js'] = "createModalShell({ id: 'mount-reauth-dialog' });"; });
  reddens('the storage Save goes back to the silent client save (D2 neutered)', 'the storage Edit (D2)', (t) => { t[MOUNTS] = t[MOUNTS].replace('this._mountClientSwitch(cfg, cur, editPresets)', 'null'); });
  reddens('the storage Save keeps the client fields in its PATCH on a switch (the strip neutered — verifier plant 5)', 'the storage Edit (D2)', (t) => { t[MOUNTS] = t[MOUNTS].replace("for (const k of ['clientPreset', 'clientId', 'clientSecret']) delete patch[k];", '/* neutered */'); });
  reddens('the channel Save stops opening Re-authorize on a switch', 'and the channel Edit', (t) => { t[CHANNEL_DIALOGS] = D(t).replace('showReauthAccountDialog(app, a, { kinds, preselect:', 'noop(app, a, { kinds, preselect:'); });
  reddens('the storage switch writes the token without its client', 'the token lands WITH the new client', (t) => { t[MOUNTS] = t[MOUNTS].replace('JSON.stringify({ token, client: sw.client })', 'JSON.stringify({ token })'); });
  reddens('the storage Edit prepends Remove… before Re-authorize (order flips)', "Edit's buttons, storage", (t) => {
    const m = t[MOUNTS]; const a = "form.querySelector('.dialog-actions').prepend(rb);"; const b = "form.querySelector('.dialog-actions').prepend(del);";
    t[MOUNTS] = m.replace(a, '@@A@@').replace(b, a).replace('@@A@@', b); });
  reddens('the channel Edit reorders Duplicate… after Remove…', "Edit's buttons, channel", (t) => { t[CHANNEL_DIALOGS] = D(t).replace('acts.prepend(reauthB, dupB, delB)', 'acts.prepend(reauthB, delB, dupB)'); });
  reddens('the mockup and the build disagree on the channel order', "the r4 mockup's", (t) => { t[EDIT_MOCKUP] = (t[EDIT_MOCKUP] || '').replace('id="reauth"', 'id="tmp-x"').replace('id="duplicate"', 'id="reauth"').replace('id="tmp-x"', 'id="duplicate"'); });
  reddens('a Remove icon comes back on the storage row', 'Remove… lives in the Edit dialog', (t) => { t[MOUNTS] = t[MOUNTS].replace("actions.append(ibtn(MI.pencil, 'Edit connection (path, credentials, name)'", "actions.append(ibtn(MI.x, tr('Remove…'), () => {})); actions.append(ibtn(MI.pencil, 'Edit connection (path, credentials, name)'"); });
  reddens('the channel auth-death sentence loses the storage tail', 'D8: the channel auth-death sentence', (t) => { t[CHANNELS] = t[CHANNELS].replace('every fetch fails; re-authorize to fix', 'every fetch fails'); });
  reddens('the design adds a key the census does not know', 'every key the design names', (t) => { t[DESIGN] = (t[DESIGN] || '').replace('`Custom App Secret`', '`Custom App Secret` · `Brand new key`'); });
  reddens('a design key loses its ja translation', '"Connect an account" — zh + ja', (t) => { t['src/lib/i18n-ja.js'] = t['src/lib/i18n-ja.js'].replace('"Connect an account":', '"Connect an account (x)":'); });
  reddens('a design key is renamed on the channel side only', '"Cannot remove "{name}"" — the channel side', (t) => { t[CHANNEL_DIALOGS] = D(t).split(`'Cannot remove "{name}"'`).join(`'Can not remove "{name}"'`); });
  reddens('the deleted "Add account…" is drawn by the panel again', 'deleted: "Add account…"', (t) => { t[CHANNELS] += "\nconst x = t('Add account…');\n"; });

  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
