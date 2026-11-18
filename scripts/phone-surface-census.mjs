// THE PHONE SURFACE CENSUS (lane bl-phone-ui, 主开发 r1188 / r1198 — «at 390 px no control outgrows its surface»: three rows in a
// month — B-16ab, B-0406, B-081b — each found by a person or a hosted picture, never by a gate). ONE copy shared by the fast
// suite (test-phone-surface-fit: the list against the tables) and the browser suite (test-phone-surface-fit-chrome: every
// surface with an opener drawn at 390 × 844 on a touch phone and MEASURED).
// THE LIST IS DERIVED FROM THE TREE, so a new surface is in it the day it lands:
//   · every createModalShell call in src/ (acorn — the unsaved census's walk) — a DIALOG, keyed by its literal id
//     (`dialog:<id>`, a second call with the same id `#2`), else by its file and the functions around it
//   · every `<div class="dialog …" id=…>` of public/index.html — a DIALOG drawn by the page itself (`dialog:static:<id>`)
//   · every showContextMenu call — a MENU (`menu:<file>:<functions>`), every createPopover call — a POPOVER
//   · the Settings view's categories (src/lib/settings-schema.js SETTINGS_CATEGORIES) — a VIEW each, plus the four
//     windows the reading named (the For-you window, a Task Group's Settings, the folder field's list, the live view)
// Each surface has ONE row: an OPENER (a page expression that opens it — one call) or an EXCUSE (what opening it would
// take, in words). A surface with neither — or with both — is red; a row whose surface is gone is red; a surface excused
// by its FILE's words is one of EXCUSED_BY_FILE_WORDS by name (a new one is red by its key: the way up is a named excuse).
// THE LAWS (measured in the page, MEASURE_SOURCE): L1 the surface's box inside the screen · L2 nothing wider than its
// surface — every visible descendant inside the surface's inner box, unless a sideways clip below the surface holds it
// (that clip is judged as an element itself) · L3 no sideways scroll — no scroller in the surface (the surface too) whose
// content is wider than it, unless DECLARED with its why, and the page itself never scrolls sideways. L4 (the finger rule:
// primary controls ≥ 44 px, field text ≥ 16 px) is MEASURED AND PRINTED a surface, NOT a law (主开发 r1198 rules on it
// from the numbers). RATCHET = what is red today BY NAME, a surface × language × law; it only goes down: a new red name is
// red, and a cured one the table still lists is red until its row is lowered.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const KINDS = Object.assign(Object.create(null), { createModalShell: 'dialog', showContextMenu: 'menu', createPopover: 'popover' });
// A HAND-BUILT POPOVER (the reader's 11: a float the code builds itself and tags for the app's Escape protocol) — an assignment
// `x.dataset.popover = …` or a `setAttribute('data-popover', …)` outside the helpers that tag their own
const HAND_MARKS = ['dataset.popover =', "'data-popover'"];
const NEEDLES = [...Object.keys(KINDS).map((k) => k + '('), ...HAND_MARKS];
const HELPERS = new Set(['createPopover', 'showContextMenu', 'createModalShell', 'buildShell', 'attachPopoverClose']);
const base = (f) => path.basename(f, '.js');

/** The files of <repo>/src that name a surface helper — one fixed-string `git grep` (the tree's own index), else a walk of
 *  src/ read file by file (a copy without git). Sorted, repo-relative. */
export function srcFiles(repo) {
  try {
    const out = execFileSync('git', ['-C', repo, 'grep', '-l', '-F', ...NEEDLES.flatMap((k) => ['-e', k]), '--', 'src'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter((f) => f.endsWith('.js')).sort();
  } catch (e) {
    if (e && e.status === 1) return [];   // git ran: no file names one
    const all = [];
    (function walk(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, x.name); if (x.isDirectory()) walk(q); else if (x.name.endsWith('.js')) all.push(path.relative(repo, q)); } })(path.join(repo, 'src'));
    return all.filter((f) => { const s = fs.readFileSync(path.join(repo, f), 'utf8'); return NEEDLES.some((k) => s.includes(k)); }).sort();
  }
}

const SITES_MEMO = new Map();   // file → { text, sites }: a second walk of the same text (a planted control) parses nothing again
/** The call sites of one source text: [{ kind, line, id, chain (outermost first) }]. `parse` = acorn.parse. Only the branches
 *  that hold a helper's name are walked. */
export function sitesOf(src, parse, file = null) {
  if (file && SITES_MEMO.has(file) && SITES_MEMO.get(file).text === src) return SITES_MEMO.get(file).sites;
  const hits = [];
  for (const k of NEEDLES) for (let i = src.indexOf(k); i >= 0; i = src.indexOf(k, i + 1)) hits.push(i);
  if (!hits.length) return [];
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  const holds = (n) => hits.some((h) => h >= n.start && h < n.end);
  const nameOf = (node, parent) => {
    if (node.type === 'FunctionDeclaration') return node.id?.name || '(anon)';
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
    if (parent?.type === 'MethodDefinition' || parent?.type === 'Property') return parent.key.name || parent.key.value || '(computed)';
    if (parent?.type === 'AssignmentExpression') {   // `uploadBtn.onclick = …` keeps its object's name (round w8jjldn9f (3): two onclicks are two names, not #2)
      const l = parent.left;
      if (l.type !== 'MemberExpression') return l.name || '(assign)';
      const o = l.object, on = o.type === 'Identifier' ? o.name : (o.type === 'MemberExpression' && !o.computed ? o.property.name : null), pn = l.property.name || '(member)';
      return on ? `${on}.${pn}` : pn;
    }
    if (parent?.type === 'CallExpression') {   // a listener by its event's name: `(on contextmenu)`
      const c = parent.callee, cn = c.type === 'MemberExpression' ? (c.property.name || '') : (c.name || '');
      if (cn === 'addEventListener' && parent.arguments[0]?.type === 'Literal') return `(on ${parent.arguments[0].value})`;
      return `(cb of ${cn})`;
    }
    return '(anon)';
  };
  const out = [], chain = [];
  const visit = (node, parent) => {
    if (!holds(node)) return;
    if (node.type === 'CallExpression') {
      const c = node.callee, cn = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
      if (cn && KINDS[cn]) {
        let id = null;
        if (KINDS[cn] === 'dialog' && node.arguments[0]?.type === 'ObjectExpression') {
          const q = node.arguments[0].properties.find((x) => x.type === 'Property' && (x.key.name === 'id' || x.key.value === 'id'));
          if (q && q.value.type === 'Literal') id = String(q.value.value);
          else if (q && q.value.type === 'TemplateLiteral' && !q.value.expressions.length) id = q.value.quasis[0].value.cooked;
        }
        let line = 1; for (let i = src.indexOf('\n'); i >= 0 && i < node.start; i = src.indexOf('\n', i + 1)) line++;
        out.push({ kind: KINDS[cn], line, id, chain: chain.slice() });
      }
    }
    const hand = (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && !node.left.computed && node.left.property.name === 'popover'
        && node.left.object.type === 'MemberExpression' && !node.left.object.computed && node.left.object.property.name === 'dataset')
      || (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'setAttribute' && node.arguments[0]?.type === 'Literal' && node.arguments[0].value === 'data-popover');
    if (hand && !chain.some((c) => HELPERS.has(c))) {
      let line = 1; for (let i = src.indexOf('\n'); i >= 0 && i < node.start; i = src.indexOf('\n', i + 1)) line++;
      out.push({ kind: 'popover', line, id: null, chain: chain.slice(), hand: true });
    }
    const fn = /Function/.test(node.type);
    if (fn) chain.push(nameOf(node, parent));
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') visit(x, node); } else if (v && typeof v.type === 'string') visit(v, node);
    }
    if (fn) chain.pop();
  };
  visit(ast, null);
  if (file) SITES_MEMO.set(file, { text: src, sites: out });
  return out;
}

/** The static dialogs of the page (public/index.html): every `<div … class="dialog …" … id=…>` / `<div id=… class="dialog …">`. */
export function staticDialogs(html) {
  const out = [];
  for (const m of String(html).matchAll(/<div\b[^>]*>/g)) {
    const tag = m[0], cls = /\bclass="([^"]*)"/.exec(tag), id = /\bid="([^"]*)"/.exec(tag);
    if (cls && id && cls[1].split(/\s+/).includes('dialog')) out.push(id[1]);
  }
  return out;
}

/** The Settings view's categories as the source names them: t('…') literals of SETTINGS_CATEGORIES. */
export function settingsCategories(schemaSrc) {
  const m = /const SETTINGS_CATEGORIES = \[([\s\S]*?)\];/.exec(String(schemaSrc));
  return m ? [...m[1].matchAll(/t\('([^']+)'\)/g)].map((x) => x[1]) : [];
}

/** THE DERIVED LIST: [{ key, family, kind, file, line, id, chain }] — dialogs, menus, popovers from src/; static dialogs; views. */
export function deriveSurfaces(repo, { files = null, read = (f) => fs.readFileSync(path.join(repo, f), 'utf8') } = {}) {
  const require = createRequire(path.join(repo, 'package.json'));
  const acorn = require('acorn');
  const list = [], seen = new Map();
  const add = (s) => { const n = (seen.get(s.key) || 0) + 1; seen.set(s.key, n); list.push(n === 1 ? s : { ...s, key: `${s.key}#${n}` }); };
  for (const f of files || srcFiles(repo)) {
    for (const s of sitesOf(read(f), acorn.parse.bind(acorn), f)) {
      const where = `${base(f)}:${s.chain.join('>') || '(top)'}`;
      // ONE DIALOG A LITERAL ID (the reader's 5: two calls of one id — a raise and its builder — are one dialog on the screen)
      if (s.kind === 'dialog' && s.id && list.some((x) => x.key === `dialog:${s.id}`)) { list.find((x) => x.key === `dialog:${s.id}`).more.push(`${f}:${s.line}`); continue; }
      const key = s.kind === 'dialog' && s.id ? `dialog:${s.id}` : s.hand ? `popover:hand:${where}` : `${s.kind}:${where}`;
      add({ key, family: s.kind === 'dialog' ? 'dialogs' : 'menus', kind: s.kind, file: f, line: s.line, id: s.id, chain: s.chain, more: [] });
    }
  }
  for (const id of staticDialogs(read('public/index.html'))) add({ key: `dialog:static:${id}`, family: 'dialogs', kind: 'dialog', file: 'public/index.html', id, chain: [] });
  for (const c of settingsCategories(read('src/lib/settings-schema.js'))) add({ key: `view:settings:${c}`, family: 'views', kind: 'view', file: 'src/lib/settings-ui.js', chain: ['open'], category: c });
  for (const v of VIEWS) add({ key: `view:${v}`, family: 'views', kind: 'view', file: null, chain: [] });
  return list;
}

/** The four windows the reading named (r1188 (2)) and the two hand-built floats the round named — declared, not derived:
 *  each is a window, a field or a float with no call site of a helper. */
export const VIEWS = ['foryou-window', 'task-group-settings', 'folder-field-list', 'live-view', 'window-switcher', 'usage-popup'];
// THE BLIND SHAPES (round w8jjldn9f (4) — what the derivation cannot see, named so nobody reads the list as whole): a float a
// file builds by hand and tags with no popover mark (two the phone opens most are declared above: the title's window switcher
// .mobile-win-switcher and the usage popup .usage-popup — mobile-nav.js PHONE_SURFACES); a plugin's own panel (plugin-client.js
// draws what a plugin asks); anything inside a frame (a document or a design window's iframe); a surface reached through ONE
// wrapper (showWindowContextMenu, a row-menu helper) counts as that wrapper's one key, however many menus it draws.
// KEYS are the call's functions, outermost first — `obj.onclick` and `(on contextmenu)` name a handler — and only a second call
// inside the very same functions takes `#2` by its order in the file (round (3): an insertion above it renames it).

// ── THE OPENERS ── a page expression run as `(async () => { … })()` with `app` (window.app), `M` (every module this table
// names, by file name: M['utils'] = src/lib/utils.js), `FX` (the suite's fixture: accounts A / B / L, pool P, Task Group
// task) and `anchor()` (a 24 px button at x 205 y 160 of the screen — where B-16ab's picture had the Agents dialog's
// «+ 添加账号…»). `root` = the surface's element when the family's own finder is not enough (views; a dialog drawn by the page).
// `mods` = the modules the expression names (the browser suite bundles them beside the client).
const SETTINGS_OPEN = (c) => ({ open: `app._settingsUI.open({ category: M['i18n'].t(${JSON.stringify(c)}) })`, root: '.settings-window', mods: ['src/lib/i18n.js'] });
export const OPENERS = {
  // dialogs — one call, the data the seeded hub holds or plain words
  'dialog:account-models-dialog': { open: `M['account-models'].openAccountModelsDialog({ accountId: FX.A, name: 'Work Max' })`, mods: ['src/lib/account-models.js'] },
  'dialog:browser-new-profile:openNewProfileDialog': { open: `M['browser-new-profile'].openNewProfileDialog(app, {})`, mods: ['src/lib/browser-new-profile.js'] },
  'dialog:resume-stopped-dialog': { open: `M['bulk-resume'].openResumeStoppedDialog(app, {})`, mods: ['src/lib/bulk-resume.js'] },
  'dialog:chan-group-new-dialog': { open: `M['channel-group-dialogs'].showGroupMembersDialog(app, {})`, mods: ['src/lib/channel-group-dialogs.js'] },
  'dialog:chan-wh-new': { open: `M['channel-webhook'].showNewPathDialog(app)`, mods: ['src/lib/channel-webhook.js'] },
  'dialog:chan-wh-token': { open: `M['channel-webhook'].showTokenOnce({ caller: 'A caller with a long name of its own', token: 'tok_' + 'x'.repeat(44) })`, mods: ['src/lib/channel-webhook.js'] },
  'dialog:chan-wh-paircode': { open: `M['channel-webhook'].showPairCodeOnce({ code: '482193', expiresAt: performance.timeOrigin + performance.now() + 600000, path: 'a-path-of-the-web-hook' })`, mods: ['src/lib/channel-webhook.js'] },
  'dialog:chan-wh-join': { open: `M['channel-webhook'].showJoinDialog(app)`, mods: ['src/lib/channel-webhook.js'] },
  'dialog:cli-missing-dialog': { open: `M['cli-missing-dialog'].openCliMissingDialog(app, { backend: 'codex' })`, mods: ['src/lib/cli-missing-dialog.js'] },
  'dialog:design-publish-dialog': { open: `M['design-window'].openDesignPublishDialog(app, { host: '', dir: '/srv/designs/a-design-with-a-long-folder-name', title: 'A design' })`, mods: ['src/lib/design-window.js'] },
  'dialog:desktop-launch-dialog': { open: `M['desktop-app-launcher'].showLaunchDialog(app, {})`, mods: ['src/lib/desktop-app-launcher.js'] },
  'dialog:agents-dialog-overlay': { open: `app._showAgentsDialog({})` },
  'dialog:oat-shape-dialog': { open: `M['oat-shape-dialog'].openOatShapeDialog({ id: FX.A, name: 'Work Max' })`, mods: ['src/lib/oat-shape-dialog.js'] },
  'dialog:perm-rules-dialog': { open: `M['permission-rules-view'].openPermissionRulesDialog({ backend: 'claude', accountId: FX.A, accountName: 'Work Max' })`, mods: ['src/lib/permission-rules-view.js'] },
  'dialog:plugins-dialog': { open: `app.openPluginsDialog({})` },
  'dialog:provider-wizard': { open: `M['provider-wizard'].openProviderWizard({ backend: 'claude' })`, mods: ['src/lib/provider-wizard.js'] },
  'dialog:layout-history-dialog': { open: `app._showLayoutHistory()` },
  'dialog:rclone-import-dialog': { open: `app.sidebar._showRcloneConfDialog()` },
  // the shared input / confirm shell (utils.js _modalShell — ONE call site for showInputDialog and showConfirmDialog): both drawn
  'dialog:utils:_modalShell': { open: `M['utils'].showInputDialog({ title: 'Rename', label: 'A name', value: 'A conversation with a name long enough to wrap' })`, mods: ['src/lib/utils.js'],
    also: [{ label: 'confirm', open: `M['utils'].showConfirmDialog({ title: 'Delete this Task Group?', message: 'Its conversations stay in the list; its folders, grants and rules go with it. This cannot be undone.', confirmText: 'Delete', danger: true })` }] },
  'dialog:vault-ak-mint': { open: `M['vault-automation'].showMintDialog({ refresh: () => {} })`, mods: ['src/lib/vault-automation.js'] },
  'dialog:vault-login-add': { open: `M['vault-login-row'].showLoginAddDialog({})`, mods: ['src/lib/vault-login-row.js'] },
  'dialog:vault-secret-add': { open: `M['vault-paste-box'].showSecretAddDialog({})`, mods: ['src/lib/vault-paste-box.js'] },
  'dialog:vault-file-add': { open: `M['vault-file-row'].showFileAddDialog({})`, mods: ['src/lib/vault-file-row.js'] },   // lane lg-vault-file (B-0830 U1b): 添加… › 文件…
  'dialog:vault-totp-add': { open: `M['vault-totp-row'].showTotpAddDialog({})`, mods: ['src/lib/vault-totp-row.js'] },
  'dialog:vault-unlock-dialog': { open: `M['vault-unlock'].showUnlock({})`, mods: ['src/lib/vault-unlock.js'] },
  'dialog:vault-setup-dialog': { open: `M['vault-unlock'].showSetup({})`, mods: ['src/lib/vault-unlock.js'] },
  'dialog:vault-change-dialog': { open: `M['vault-unlock'].showChange()`, mods: ['src/lib/vault-unlock.js'] },
  'dialog:static:dialog-new-session': { open: `app.showNewSessionDialog({})`, root: '#dialog-new-session', close: `document.querySelector('#dialog-new-session .dialog-close').click()` },
  'dialog:path-picker': { open: `app.showNewSessionDialog({}); await new Promise((r) => setTimeout(r, 300)); document.querySelector('#dialog-new-session .pf-pick').click()`, close: `document.querySelector('#dialog-new-session .dialog-close').click()` },
  // UNIT 2 (主开发 r1349): THE CONVERSATION'S SURFACES — `chat()` opens the seeded conversation (the tree's stand-in agent) on the
  // phone and waits for its first answer; `FX.todo` is the For-you item its turn filed
  'menu:chat-input:constructor>plusBtn.onclick': { open: `await chat(); document.querySelector('.window[class~="window-active"] .chat-plus-btn').click()` },
  // the status strip's dropdowns: ONE hand-built float (chat-status-bar.js showDropdown) — the model's, then the effort's, the ⚙
  // door's list and the output style's as its draws
  'popover:hand:chat-status-bar:_onClick>showDropdown': { open: `await chat(); document.querySelector('.window[class~="window-active"] .chat-status-model').click()`,
    // SINCE THE STRIP's STEP TWO (79feb059d) NOTHING FOLDS on a phone (the model sheet's fold rows are gone): the thinking level
    // is a part of the model chip with a press of its own, the output style a row of the ⚙ door's list (strip-table.js: effort
    // in:model, style in:settings) — the draws press them as a finger does; a mark that is not there fails the draw by name
    also: [{ label: 'effort', open: `await chat(); const e = document.querySelector('.window[class~="window-active"] .chat-status-model .chat-status-effort'); if (!e) throw new Error('no effort part in the model chip'); e.click()` },
      { label: 'settings', open: `await chat(); const g = document.querySelector('.window[class~="window-active"] .chat-status-settings'); if (!g) throw new Error('no settings door on the strip'); g.click()` },
      { label: 'style', open: `await chat(); const g = document.querySelector('.window[class~="window-active"] .chat-status-settings'); if (!g) throw new Error('no settings door on the strip'); g.click(); let r = null; for (let i = 0; i < 40 && !(r = document.querySelector('.chat-status-settings-row[data-row="style"]')); i++) await new Promise((q) => setTimeout(q, 100)); if (!r) throw new Error('no output style row in the settings door list'); r.click()` }] },
  'menu:session-card:renderSessionCard>(on contextmenu)': { open: `await chat(); const c = [...document.querySelectorAll('.session-item-card')].find((x) => x.getClientRects().length) || document.querySelector('.session-item-card'); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 300 }))` },
  'menu:chat-view:_showMsgMenu': { open: `await chat(); const cv = [...app.sessions.values()].find((v) => v && v.sessionId === FX.sid); const m = [...document.querySelectorAll('.window[class~="window-active"] .chat-msg')].find((x) => x._rawMsg && x._rawMsg.role === 'assistant'); cv._showMsgMenu(m._rawMsg, 120, 300)` },
  'menu:taskbar:showWindowContextMenu': { open: `await chat(); M['taskbar'].showWindowContextMenu(app, app.wm.activeWindowId, 120, 120)`, mods: ['src/lib/taskbar.js'] },
  // menus and popovers — one call, an anchor of the suite's own
  // the phone's own sheets (mobile-nav.js _sheet — ONE call site, three doors): «+», then ⋯ as a second draw of the same surface
  'menu:mobile-nav:_sheet': { open: `document.getElementById('mobile-nav-new').click()`, also: [{ label: 'more', open: `app._mobileNav._openMore()` }] },
  'menu:desktop-switch-sheet:openDesktopSheet': { open: `M['desktop-switch-sheet'].openDesktopSheet(app, anchor(), { onSwitch: () => {} })`, mods: ['src/lib/desktop-switch-sheet.js'] },
  'popover:app:_showGlobalSettings': { open: `app._showGlobalSettings(anchor())` },
  'popover:sidebar:_showStatusFilterMenu': { open: `app.sidebar._showStatusFilterMenu(anchor())` },
  'popover:sidebar:_showBackendFilterMenu': { open: `app.sidebar._showBackendFilterMenu(anchor())` },
  // views — the Settings view a category at a time (on a phone the view shows the category alone); the named windows
  'view:foryou-window': { open: `M['inbox-window'].openInboxWindow(app, {})`, root: '.window[class~="window-active"]', mods: ['src/lib/inbox-window.js'] },
  'view:window-switcher': { open: `await chat(); document.getElementById('mobile-nav-title').click()`, root: '.mobile-win-switcher' },
  'view:task-group-settings': { open: `M['task-detail'].openTaskDetail(app, FX.task, { tab: 'settings' })`, root: '.window[class~="window-active"]', mods: ['src/lib/task-detail.js'] },
  // ON A PHONE the list stays in the field's own wrap (path-field.js: isPhone() — never floated): the new-conversation dialog is
  // measured with the list open, opened as a finger opens it (a press in the field, then its focus); its open list the fact
  'view:folder-field-list': { open: `app.showNewSessionDialog({}); await new Promise((r) => setTimeout(r, 300)); const i = document.getElementById('input-cwd'); i.focus(); i.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); i.dispatchEvent(new Event('input', { bubbles: true }))`, root: '#dialog-new-session', ready: `!!document.querySelector('#dialog-new-session .pf-list:not([hidden])')`, close: `document.querySelector('#dialog-new-session .dialog-close').click()` },
};
export const settingsOpener = SETTINGS_OPEN;

// ── THE EXCUSES ── what opening the surface would take, by its file (a key's own words where one says more). A key with
// no opener and no excuse of its own takes its FILE's words (EXCUSE_BY_FILE) — the words then name the record it needs.
export const EXCUSE_BY_FILE = {
  'app-install-dialog': 'needs a desktop-apps machine record (an apps host, local or paired) — the seeded hub has none',
  'app': 'the desk\'s own chrome menus (a right press on its toolbar or taskbar) — the phone draws neither',
  'browser-build-dialog': 'needs an agent-browser profile — the seeded hub has none (the keeper is never started)',
  'browser-exit-dialog': 'needs an agent-browser profile record',
  'browser-proxy-dialog': 'needs an agent-browser profile record',
  'browser-switcher': 'needs an agent-browser profile',
  'browser-trace-view': 'needs a recorded agent-browser action',
  'browser-who-dialog': 'needs an agent-browser profile',
  'browser-live-window': 'needs a live agent browser (a running keeper and its view)',
  'browser-passkeys-view': 'needs an agent-browser profile with a stored passkey',
  'browser-profile-picker': 'needs agent-browser profiles to pick from',
  'channel-account-dialogs': 'needs a channel account and what refuses its removal',
  'channel-api-dialog': 'needs a channel API credential',
  'channel-filter-editor': 'needs a channel conversation or account to edit',
  'channel-group-dialogs': 'needs a channel group',
  'channel-reach-editor': 'needs a channel adapter or conversation',
  'channel-webhook': 'needs a web-hook path (its slug) with callers',
  'channels-panel': 'inside the Channels window (unexported) — needs the window open with a channel account',
  'channel-msg-bar': 'needs a channel message', 'channel-outbox': 'needs a channel draft or proposal', 'channel-window': 'needs a channel conversation window',
  'design-window': 'needs a design window open on a design folder', 'design-home': 'needs the design home window',
  'desktop-app-launcher': 'needs a desktop-apps machine or a registered app row',
  'desktop-app-window': 'needs a running desktop app window (xpra)',
  'desktop-manager': 'a desk door (the desktops switcher of the desk\'s toolbar)',
  'desktop-switch-sheet': 'a row of the desktop sheet — needs the sheet open with two desktops',
  'device-acts-dialog': 'needs a paired machine (a device link)', 'exit-access-dialog': 'needs a paired machine (a device link)', 'exit-runs-dialog': 'needs a paired machine (a device link)',
  'doc-window-ui': 'needs a document window open',
  'feedback-sheet': 'reached through the feedback door only (unexported openFeedbackSheet)',
  'ffmpeg-door': 'needs a media file whose player asks for ffmpeg',
  'file-explorer-ops': 'needs a file explorer window and a file in it', 'file-explorer': 'needs a file explorer window', 'file-explorer-uploads': 'needs a file explorer window',
  'incident-recorder': 'the incident recorder\'s capture (a panic ring) — not a door a person presses on a phone',
  'jobs-panel': 'inside the Background Work window (unexported) — needs the window open, and a job for a card\'s menu',
  'machine-app': 'needs a paired machine with apps', 'machine-desktop-handover': 'needs a machine desktop being handed over', 'machine-desktop': 'needs a paired machine desktop',
  'manage-agents': 'needs the Agents dialog open on the account or the machine row the dialog belongs to',
  'mounts-dialog': 'the remote-mount builder — opened by each caller with its own fields',
  'permission-rules-view': 'runs a local check of the rules (an oracle) — needs an account with rules',
  'plugin-client': 'a plugin\'s own dialog — needs an installed plugin that opens one',
  'plugins-ui': 'needs a plugin record (a manifest, a service, a relay or a voice plugin)',
  'provider-roster': 'needs a third-party provider row',
  'record-clear-ui': 'needs a record to clear (opened from its row)',
  'refresh-live': 'needs a live reading to refresh',
  'remoteapp-card': 'needs a remote-app machine record',
  'reset-credit-dialog': 'needs an account whose limit reset can be bought (a fetched offer)',
  'setup-flows': 'a setup flow\'s own modal — opened by the flow with its body',
  'sidebar-mounts': 'needs a remote host or a mount row of the Remote tab',
  'vault-automation': 'needs the vault unlocked with an automation key',
  'vault-login-grants': 'needs the vault unlocked with a website login',
  'vault-paste-box': 'needs the vault unlocked with a secret',
  'vault-reveal': 'needs the vault unlocked with a secret to reveal',
  'vault-totp-row': 'needs the vault unlocked with a one-time-code entry',
  'vault-use-row': 'needs the vault unlocked with a use row',
  'vault-window': 'needs the vault window open, unlocked',
  'window-share': 'needs a window (a conversation) to share',
  'artifact-card': 'needs a deliverable card in a conversation', 'artifacts-window': 'needs the Artifacts window with a deliverable',
  'chat-input': 'needs a conversation\'s composer', 'chat-renderers': 'needs a conversation with a message, a link or a peer message',
  'chat-view': 'needs a conversation with a message', 'chat-minimap': 'needs a conversation long enough for its outline',
  'inbox-window': 'needs a For-you item with actions', 'mobile-nav': 'needs the window switcher with windows',
  'open-with': 'needs an office file in the file explorer', 'principal-picker': 'needs a grant row with principals',
  'reaction-picker': 'needs a channel message to react to', 'reply-pictures': 'needs a reply with pictures',
  'rail-row': 'a desk rail row (the phone has no rail)', 'session-card': 'needs a conversation card in the list',
  'session-lifecycle': 'needs a conversation whose billing can switch', 'session-props': 'needs a conversation\'s properties with history',
  'sidebar-render-mobile': 'needs the list\'s folder view with folders', 'sidebar-render': 'needs the list grouped with conversations',
  'sidebar-rail': 'a desk rail door (the phone reaches Ports through ⚙)', 'sidebar-tasks': 'needs a Task Group row in the list',
  'sidebar': 'a press on the list header\'s buttons with the drawer open', 'stream-pill': 'needs a live stream', 'stream-stats': 'needs a live stream',
  'tab-group': 'needs a tab group of two windows', 'task-detail': 'needs a Task Group window on its Settings with folders',
  'task-log': 'needs a Task Group\'s log with an item', 'taskbar': 'a desk taskbar door (the phone has no taskbar)',
  'toolbar-fold': 'a desk toolbar fold (the phone has no toolbar)', 'usage-dashboard': 'needs the usage dashboard panel',
  'usage-window': 'needs the usage window', 'user-todos-panel': 'needs a For-you row',
  'gear-menu': 'a submenu of the ⚙ popover — needs a press on its row',
  'terminal': 'needs a terminal window', 'desktop-picker': 'needs the desktop picker (a desktop machine to pick from)',
  'new-session-form': 'the new-conversation dialog\'s Task Group picker — needs a press on its button with Task Groups to pick',
};
/** Keys whose words are their own (more precise than their file's). */
export const EXCUSES = {
  'dialog:browser-env-dialog': 'needs an agent-browser profile record — the seeded hub has none (the keeper is never started)',   // B-9584 U3: «Environment…»
  'dialog:static:dialog-fork': 'needs a conversation to fork (the page\'s own fork dialog)',
  'dialog:static:dialog-grid': 'no phone door: the desk\'s «add a grid» (src/phone-doors.js PHONE_TWINS btn-add-grid: none)',
  'dialog:static:dialog-presets': 'no phone door: the desk\'s arrangements (src/phone-doors.js PHONE_TWINS btn-presets: none)',
  'dialog:self-update-dialog': 'runs the hub\'s self-update — never opened by a census',
  'dialog:update-confirm-dialog': 'needs an update on offer from the hub',
  'view:live-view': 'needs a live agent browser (a running keeper and its view) — the seeded hub starts none',
  'menu:chat-input:constructor>uploadBtn.onclick': 'the desk composer\'s upload menu — on a phone the composer\'s row is rebuilt around its «+» sheet and this button leaves the page',
  'menu:inbox-window:openInboxWindow>act': 'the For-you card\'s ⋯ — drawn only for an app-install card (inbox-window-layout.js cardActs); the seeded ask has none',
  'dialog:window-share-dialog': 'needs a desktop app window — its reach is asked of the desktop apps engine, which the scratch hub does not run',
  'dialog:window-ask-dialog': 'needs a desktop app window — its reach is asked of the desktop apps engine, which the scratch hub does not run',
  'view:usage-popup': 'needs a usage reading — the bar hides its usage door while there is none, as in the scratch hub',
  'dialog:pool-members-dialog': 'needs a pool — accounts.js createPool refuses with no logged-in subscription, and a scratch hub has none: its member rows (the long names it is for) cannot be drawn',
  'popover:hand:utils:showImageOverlay': 'needs a picture to show full screen (a picture in a conversation or a file)',
};
/** The words that excuse a key, or null when it has none: its own, else its file's. */
export function excuseOf(s) {
  if (EXCUSES[s.key]) return EXCUSES[s.key];
  if (!s.file) return null;
  return EXCUSE_BY_FILE[base(s.file)] || null;
}
/** The opener of a key (the Settings categories share one form), or null. */
export function openerOf(s) {
  const o = OPENERS[s.key] || (s.key.startsWith('view:settings:') ? SETTINGS_OPEN(s.category) : null);
  if (!o) return null;
  // a dialog with a literal id is found BY that id (the reader's 5: a dialog already on screen — the new-conversation dialog
  // under the folder picker — is never the one measured); the page's own dialogs and the views name theirs
  if (!o.root && s.kind === 'dialog' && s.id && !s.key.startsWith('dialog:static:')) return { ...o, root: `[id="${s.id}"] > .dialog` };
  return o;
}
/** The draws of a surface: its opener, then each `also` variant (`<key>~<label>`, its own row in a run and in the ratchet). */
export function drawsOf(s) {
  const o = openerOf(s);
  if (!o) return [];
  return [{ key: s.key, ...o }, ...(o.also || []).map((v) => ({ key: `${s.key}~${v.label}`, ...o, ...v, also: undefined }))];
}
/** THE SURFACES EXCUSED BY THEIR FILE'S WORDS, BY NAME (round w8jjldn9f (2) — a number could be edited up; a list cannot grow
 *  without a name): every key below takes its file's words; a key no longer excused that way (opened, given its own words,
 *  gone) must leave the list; a NEW key excused only by its file's words is red. The way up is a named excuse in EXCUSES. */
/** ITS LENGTH MAY ONLY FALL (unit 2's read: appending a key to the list cleared its red with no words): a longer list is red,
 *  a shorter one asks this number down to it. The way up is a named excuse in EXCUSES. */
export const EXCUSED_BY_FILE_WORDS_MAX = 218;
export const EXCUSED_BY_FILE_WORDS = Object.freeze([
  "dialog:app-deb-dialog",
  "dialog:app-help-dialog",
  "dialog:app-search-dialog",
  "dialog:app-source-dialog",
  "dialog:browser-build-dialog:openBuildDialog",
  "dialog:browser-exit-dialog",
  "dialog:browser-proxy-dialog",
  "dialog:browser-switcher-dialog",
  "dialog:browser-trace-entry-dialog",
  "dialog:browser-who-dialog:openWhoDialog",
  "dialog:cfg-dialog-overlay",
  "dialog:chan-access-dialog",
  "dialog:chan-account-reach-dialog",
  "dialog:chan-api-dialog",
  "dialog:chan-around-sheet",
  "dialog:chan-attn-sheet",
  "dialog:chan-group-dialog",
  "dialog:chan-notify-dialog",
  "dialog:chan-options-dialog",
  "dialog:chan-push-dialog",
  "dialog:chan-reach-dialog",
  "dialog:chan-remove-refused",
  "dialog:chan-search-dialog",
  "dialog:chan-wh-callers",
  "dialog:chan-wh-send",
  "dialog:design-boards-sheet",
  "dialog:design-comment-sheet",
  "dialog:design-published-dialog",
  "dialog:desktop-adopt-dialog",
  "dialog:desktop-install-dialog",
  "dialog:desktop-remove-failed",
  "dialog:device-acts-dialog",
  "dialog:device-elevate-dialog",
  "dialog:device-pair-dialog",
  "dialog:dialout-dialog",
  "dialog:doc-comment-sheet",
  "dialog:doc-link-dialog",
  "dialog:exit-access-dialog",
  "dialog:exit-runs-dialog",
  "dialog:feedback-sheet",
  "dialog:ffmpeg-get-sheet",
  "dialog:file-props-dialog",
  "dialog:guided-cli-dialog",
  "dialog:harness-service-dialog",
  "dialog:host-key-dialog",
  "dialog:host-setup-dialog",
  "dialog:incident-report-dialog",
  "dialog:job-new-dialog",
  "dialog:local-oracle-dialog",
  "dialog:machine-desktop-confirm",
  "dialog:machine-desktop-dialog",
  "dialog:machine-desktop-handover",
  "dialog:machine-desktop-signin",
  "dialog:machine-window-picker",
  "dialog:mount-edit-dialog",
  "dialog:mounts-dialog:mountsDialog",
  "dialog:mounts-dialog:reauthDialog",
  "dialog:oat-dialog",
  "dialog:page-published-dialog",
  "dialog:plugin-client:_hostApi>createModalShell",
  "dialog:plugin-consent-dialog",
  "dialog:plugin-install-dialog",
  "dialog:ports-dialog",
  "dialog:provider-new-key",
  "dialog:publish-page-dialog",
  "dialog:record-clear-dialog",
  "dialog:refresh-live-dialog",
  "dialog:relay-identity",
  "dialog:remoteapp-settings",
  "dialog:reset-credit-dialog",
  "dialog:signin-dialog",
  "dialog:tailscale-login",
  "dialog:vault-ak-audit",
  "dialog:vault-ak-edit",
  "dialog:vault-ak-grant",
  "dialog:vault-ak-reach",
  "dialog:vault-filter-dialog",
  "dialog:vault-login-grants:grantDialog",
  "dialog:vault-login-site-pick",
  "dialog:vault-login-totp",
  "dialog:vault-paste-dialog",
  "dialog:vault-reveal-dialog",
  "dialog:vault-totp-grant",
  "dialog:vault-use-grant",
  "dialog:vault-words-edit",
  "dialog:voice-sheet",
  "menu:app-install-dialog:renderAppsSection>bSrc.onclick",
  "menu:app:_setupChromeContextMenus>(on contextmenu)",
  "menu:app:_setupChromeContextMenus>(on contextmenu)#2",
  "menu:artifact-card:pickMenu",
  "menu:artifact-card:renderArtifactList>(on click)",
  "menu:artifact-card:rowMenuAt",
  "menu:artifact-card:serviceMenu",
  "menu:artifacts-window:mountArtifactsWindow>rowEl>(on click)",
  "menu:browser-live-window:createLiveView>fitChip.onclick",
  "menu:browser-live-window:createLiveView>moreBtn.onclick",
  "menu:browser-live-window:createLiveView>stripMenu",
  "menu:browser-live-window:createLiveView>stripMoreBtn.onclick",
  "menu:browser-live-window:createLiveView>tabRowMore.onclick",
  "menu:browser-passkeys-view:pkRowPatch>more.onclick",
  "menu:browser-profile-picker:installBrowserProfilePicker>prototype.showBrowserProfilePicker",
  "menu:browser-trace-view:openBrowserProfilesWindow>openRowMenu",
  "menu:channel-filter-editor:showGrainMenu",
  "menu:channel-msg-bar:msgActionMenu",
  "menu:channel-outbox:drafterMenu",
  "menu:channel-outbox:renderProposalCard>chevron>(cb of armedOnly)",
  "menu:channel-window:openChannelWindow>onAuthor",
  "menu:channel-window:openChannelWindow>renderBar>more.onclick",
  "menu:channel-window:openGroupWindow>drawBar>more.onclick",
  "menu:channel-window:openGroupWindow>msgMenu",
  "menu:channels-panel:renderChannelsPanel>accountCard>openMenu",
  "menu:channels-panel:renderChannelsPanel>groupRowBuild>el.oncontextmenu",
  "menu:channels-panel:renderChannelsPanel>groupRowBuild>el.oncontextmenu#2",
  "menu:channels-panel:renderChannelsPanel>rowBuild>el.oncontextmenu",
  "menu:channels-panel:renderChannelsPanel>section>openMenu",
  "menu:chat-renderers:_openRelTarget",
  "menu:chat-renderers:_renderPeerMsg>oncontextmenu",
  "menu:chat-renderers:_renderPeerMsg>oncontextmenu#2",
  "menu:chat-renderers:_searchByName",
  "menu:chat-renderers:setupLinkHandler>(on click)",
  "menu:chat-renderers:setupLinkHandler>(on contextmenu)",
  "menu:design-home:openDesignHome>menu",
  "menu:design-window:openDesign>(on click)",
  "menu:desktop-app-launcher:showLaunchDialog>cardMenuControl>c.onclick",
  "menu:desktop-app-launcher:showLaunchDialog>cardScaleControl>c.onclick",
  "menu:desktop-app-window:openDesktopApp>moreBtn.onclick",
  "menu:desktop-app-window:openDesktopApp>openPinMenu",
  "menu:desktop-app-window:openDesktopApp>openScaleMenu",
  "menu:desktop-manager:_openDesktopList",
  "menu:desktop-manager:_renderSwitcher>(on contextmenu)",
  "menu:desktop-manager:_rowDoors>open",
  "menu:desktop-switch-sheet:openDesktopSheet>(cb of forEach)>(on contextmenu)",
  "menu:doc-window-ui:mountDocWindow>(on click)",
  "menu:doc-window-ui:mountDocWindow>styleMenu",
  "menu:doc-window-ui:mountDocWindow>tableMenu",
  "menu:file-explorer:_renderBookmarks>(cb of forEach)>(on contextmenu)",
  "menu:file-explorer:_showColumnMenu",
  "menu:file-explorer:constructor>btnMore.onclick",
  "menu:inbox-window:openInboxWindow>(on contextmenu)",
  "menu:jobs-panel:renderCard>el.oncontextmenu",
  "menu:machine-desktop:openMachineDesktop>(cb of btn)",
  "menu:machine-desktop:openMachineDesktop>drawStreamSeg>(cb of btn)",
  "menu:manage-agents:foldRowByTier>layout>more.onclick",
  "menu:manage-agents:installManageAgents>_poolMembersDialog>wire>b.onclick",
  "menu:manage-agents:installManageAgents>_renderClaudeAccounts>addAcctBtn.onclick",
  "menu:manage-agents:installManageAgents>_renderClaudeAccounts>left.onclick",
  "menu:manage-agents:installManageAgents>_renderClaudeAccounts>left.onclick#2",
  "menu:manage-agents:installManageAgents>_renderCodexAccounts>left.onclick",
  "menu:manage-agents:installManageAgents>_renderCodexAccounts>left.onclick#2",
  "menu:manage-agents:installManageAgents>_renderHomeAccounts>left.onclick",
  "menu:manage-agents:installManageAgents>_showAgentsDialog>renderMachine>chkBtn.onclick",
  "menu:mobile-nav:_showWindowSwitcher>renderContent>(on contextmenu)",
  "menu:plugins-ui:installPluginsUI>openPluginsDialog>renderManifestPlugins>onChip",
  "menu:provider-roster:renderProviderRows>onclick",
  "menu:rail-row:railRow>more.onclick",
  "menu:reply-pictures:replyPictures>btn.onclick",
  "menu:session-lifecycle:installSessionLifecycle>showBillingSwitcher",
  "menu:session-lifecycle:installSessionLifecycle>showBillingSwitcher#2",
  "menu:session-props:openSessionProps>fillHistory>(cb of then)>histMenu",
  "menu:sidebar-mounts:installSidebarMounts>_showEditMountDialog>pick.onclick",
  "menu:sidebar-mounts:installSidebarMounts>_wireGmailLabelsPicker>btn.onclick",
  "menu:sidebar-mounts:installSidebarMounts>_wireSharedDrivePicker>btn.onclick",
  "menu:sidebar-rail:installSidebarRail>_portProtoMenu",
  "menu:sidebar-render-mobile:installSidebarRenderMobile>proto._renderMobileFolderList>(on contextmenu)",
  "menu:sidebar-render:installSidebarRender>proto._renderGrouped>(on contextmenu)",
  "menu:sidebar-tasks:installSidebarTasks>proto._renderTaskViewFlat>addCard.onclick",
  "menu:sidebar-tasks:installSidebarTasks>proto._showTaskContextMenu",
  "menu:sidebar:constructor>listMenuBtn.onclick",
  "menu:sidebar:constructor>sortBtn.onclick",
  "menu:sidebar:constructor>sortBtn.onclick#2",
  "menu:tab-group:_showSplitMenu",
  "menu:task-detail:openTaskDetail>renderSettings>addPar.onclick",
  "menu:task-detail:openTaskDetail>renderSettings>refBtn.onclick",
  "menu:task-log:mountTaskLog>activityMenu",
  "menu:task-log:mountTaskLog>renderBacklog>addItemRow>(on contextmenu)",
  "menu:toolbar-fold:installToolbarFold>(on click)",
  "menu:toolbar-fold:openTerminalFrom",
  "menu:usage-dashboard:renderPanel>menu.onclick",
  "menu:usage-window:renderControls>dashBtn.onclick",
  "menu:user-todos-panel:installUserTodos>rowClick",
  "menu:user-todos-panel:installUserTodos>rowMenu",
  "menu:vault-window:openVaultWindow>addB.onclick",
  "popover:browser-live-window:createLiveView>openCapPopover",
  "popover:channels-panel:openAttentionDoor",
  "popover:chat-minimap:_showToc",
  "popover:doc-window-ui:mountDocWindow>(cb of )>open",
  "popover:doc-window-ui:mountDocWindow>noteBox",
  "popover:doc-window-ui:mountDocWindow>offerComment",
  "popover:file-explorer-uploads:installExplorerUploads>_triggerUpload",
  "popover:file-explorer:_showViewMenu",
  "popover:hand:app:_initMaintenanceBanner>render>(on click)",
  "popover:hand:browser-trace-view:openBrowserProfilesWindow>info.onclick",
  "popover:hand:chat-input:_updateTodoDisplay>_todoDisplay.onclick",
  "popover:hand:chat-renderers:addWrapToggles>langBtn.onclick",
  "popover:hand:chat-view:_showMsgMeta",
  "popover:hand:desktop-picker:openDesktopPicker",
  "popover:hand:feedback-sheet:openFeedbackSheet",
  "popover:hand:file-explorer-ops:installExplorerOps>_buildMenu",
  "popover:hand:gear-menu:buildGearMenu>renderHead",
  "popover:hand:new-session-form:installNewSessionForm>prototype._nsGroupMenu",
  "popover:hand:terminal:_showSettings",
  "popover:open-with:officeOfferAt",
  "popover:principal-picker:principalPicker>trigger.onclick",
  "popover:reaction-picker:openReactionPicker",
  "popover:reaction-picker:showWho",
  "popover:session-card:renderSessionCard>_showConfigPopover",
  "popover:sidebar-tasks:installSidebarTasks>proto._showSessionStatusPopover",
  "popover:sidebar-tasks:installSidebarTasks>proto._showTaskBindPopover",
  "popover:sidebar-tasks:installSidebarTasks>proto._showTaskFoldersPopover",
  "popover:stream-pill:createStreamPill>openMenu",
  "popover:stream-stats:createStreamStats>open",
  "popover:taskbar:showHiddenTiles",
  "popover:taskbar:showTabGroupList",
  "popover:taskbar:showWindowList",
  "popover:usage-dashboard:openPanelEditor",
  "popover:user-todos-panel:installUserTodos>openMiniInbox",
  "popover:vault-automation:showVerbs",
  "popover:window-share:mountLaunchShareRow>btn.onclick",
]);

/** A sideways scroller a surface may hold, each with its why (L3 lets it scroll; L2 does not judge what it clips). */
export const DECLARED_SCROLLERS = [
  { sel: 'pre', why: 'a code block keeps its lines whole and scrolls sideways' },
  { sel: '.pf-chipline', why: 'the folder field\'s chip line scrolls sideways by design (one line of chips)' },
];

/** THE RATCHET — what is red today, BY NAME (round w8jjldn9f (1): a count let one cut element be traded for another and read
 *  «held»): { [key]: { [lang]: { L1?|L2?|L3?: { [element name]: count } } } } — the name is the element's structural one (tag,
 *  #id or two classes — never its words, which move with the language and the fixture). Filled from the first counted run;
 *  it only falls. */
export const RATCHET = {
  // (empty since r1514's cure: its one row, view:settings:Claude L3 — the effort box held a sentence's width, the address
  // r1693 — fell with public/style.css B-0406's combobox line)
};

const lawNames = (r, law) => (r.names && r.names[law]) || {};
/** The verdict of a run against the ratchet: results = [{ key, lang, L1, L2, L3, names: { L1: {name: n}, … } }] →
 *  [{ key, lang, law, now, was, verdict, added, gone }] — verdict: 'new' (a name more than the table holds) · 'cured' (a name the
 *  table holds is fewer or gone — lower the table) · 'held' (the same names, > 0) · 'clean' (none). */
export function judge(results, ratchet = RATCHET) {
  const out = [];
  for (const r of results) for (const law of ['L1', 'L2', 'L3']) {
    const now = lawNames(r, law), was = ratchet[r.key]?.[r.lang]?.[law] || {};
    const added = Object.keys(now).filter((n) => now[n] > (was[n] || 0)), gone = Object.keys(was).filter((n) => (now[n] || 0) < was[n]);
    const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
    out.push({ key: r.key, lang: r.lang, law, now: sum(now), was: sum(was), added, gone, verdict: added.length ? 'new' : gone.length ? 'cured' : sum(now) ? 'held' : 'clean' });
  }
  return out;
}

/** The ratchet a run would write: the reds of `results` by name (a surface with none has no row), keys sorted. */
export function ratchetOf(results) {
  const t = {};
  for (const r of [...results].sort((a, b) => (a.key + a.lang).localeCompare(b.key + b.lang))) {
    const laws = {};
    for (const l of ['L1', 'L2', 'L3']) { const m = lawNames(r, l); if (Object.keys(m).length) laws[l] = Object.fromEntries(Object.keys(m).sort().map((n) => [n, m[n]])); }
    if (Object.keys(laws).length) (t[r.key] = t[r.key] || {})[r.lang] = laws;
  }
  return t;
}

/** The names of one measure's reds, law by law: { L1: { name: count }, … } (MEASURE_SOURCE's entries carry `k`). */
export function namesOf(m) {
  const o = {};
  for (const l of ['L1', 'L2', 'L3']) { const c = {}; for (const x of m[l] || []) c[x.k] = (c[x.k] || 0) + 1; o[l] = c; }
  return o;
}

/** THE MEASURE, run IN THE PAGE: (root, declared selectors) → { box, vw, vh, L1: [...], L2: [...], L3: [...], L4 }. Each entry
 *  names the element (tag#id.class «words») and its box. L2 counts the TOPMOST element past the surface's inner box (its
 *  children are its own overflow) and a block whose own words run past the surface though its box is inside; a descendant
 *  under a sideways clip below the surface is judged through that clip (its scroller by L3, its cut by nothing here); a
 *  fixed descendant is its own layer — neither it nor anything inside it is judged here. */
export const MEASURE_SOURCE = `(root, declared) => {
  const vw = innerWidth, vh = innerHeight;
  const R = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  // a STRUCTURAL name (round w8jjldn9f (1), its read's 6 / 7): the tag, its #id (never one with a digit — ids minted at run time
  // carry counters and hashes) or its first two classes (an svg's too); a bare tag goes under its parent's name; siblings that
  // share a name are told apart by their place among them
  const own = (el) => { const tag = el.tagName.toLowerCase(); if (el.id && !/\\d/.test(el.id)) return tag + '#' + el.id; const c = ((el.getAttribute && el.getAttribute('class')) || '').trim(); return c ? tag + '.' + c.split(/\\s+/).slice(0, 2).join('.') : tag; };
  const kOf = (el) => { let s = own(el); if (s === el.tagName.toLowerCase() && el !== root && el.parentElement) s = kOf(el.parentElement) + '>' + s;
    const p = el.parentElement; if (p && el !== root) { const same = [...p.children].filter((x) => own(x) === own(el)); if (same.length > 1) s += ':nth(' + same.indexOf(el) + ')'; } return s; };
  const name = (el) => { const s = kOf(el), tx = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24); return tx ? s + ' «' + tx + '»' : s; };
  const cs = (el) => getComputedStyle(el);
  const vis = (el) => { if (!el.getClientRects().length) return false; const c = cs(el); return c.visibility !== 'hidden' && c.display !== 'none'; };
  const isDecl = (el) => declared.some((d) => { try { return el.matches(d); } catch { return false; } });
  const rb = root.getBoundingClientRect(), c0 = cs(root);
  const L1 = [];
  if (rb.left < -0.5 || rb.top < -0.5 || rb.right > vw + 0.5 || rb.bottom > vh + 0.5) L1.push({ el: name(root), k: kOf(root), at: R(rb), vw, vh });
  const inL = rb.left + (parseFloat(c0.borderLeftWidth) || 0), inR = rb.right - (parseFloat(c0.borderRightWidth) || 0);
  const L2 = [], L3 = [], past = new Set();
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    if (el !== root && !vis(el)) continue;
    const c = cs(el);
    if ((c.overflowX === 'auto' || c.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1 && !isDecl(el)) {
      // BY WHAT: the descendant reaching furthest right past the scroller's box (the cure's address, said on the red's line)
      const er = el.getBoundingClientRect(); let by = null, far = er.right;
      for (const d of el.querySelectorAll('*')) { if (!vis(d)) continue; const dr = d.getBoundingClientRect(); if (dr.right > far + 0.5) { far = dr.right; by = d; } }
      L3.push({ el: name(el), k: kOf(el), sw: el.scrollWidth, cw: el.clientWidth, by: by ? name(by) + ' → ' + Math.round(far) : null });
    }
    if (el === root || c.position === 'fixed') continue;
    let a = el.parentElement, under = false, inPast = false;
    while (a && a !== root) { if (past.has(a)) { inPast = true; break; } const ca = cs(a); if (ca.overflowX !== 'visible' || ca.position === 'fixed') { under = true; break; } a = a.parentElement; }
    if (under || inPast) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.left < inL - 0.5 || r.right > inR + 0.5) { past.add(el); L2.push({ el: name(el), k: kOf(el), at: R(r), box: [Math.round(inL), Math.round(inR)] }); continue; }
    // WORDS PAST A BOX THAT FITS (the reader's 6): a block holding its own text whose words run out of it (nowrap, a long
    // unbroken path) and past the surface — its box is inside, what a person reads is not
    if (c.overflowX === 'visible' && el.clientWidth > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && r.left + el.scrollWidth > inR + 0.5) {
      past.add(el); L2.push({ el: name(el), k: kOf(el) + ':words', at: R(r), words: Math.round(r.left + el.scrollWidth), box: [Math.round(inL), Math.round(inR)] });
    }
  }
  const se = document.scrollingElement;
  if (se && se.scrollWidth > vw + 1) L3.push({ el: 'the page', k: 'page', sw: se.scrollWidth, cw: vw });
  const PRIMARY = 'button, [role="button"], select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="menuitem"]';
  const ctl = [...(root.matches(PRIMARY) ? [root] : []), ...root.querySelectorAll(PRIMARY)].filter(vis);
  const small = [], font = [];
  for (const el of ctl) {
    const r = el.getBoundingClientRect(), icon = (el.textContent || '').trim().length <= 2 && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    if (r.height < 43.5 || (icon && r.width < 43.5)) small.push(name(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && parseFloat(cs(el).fontSize) < 15.5) font.push(name(el) + ' ' + cs(el).fontSize);
  }
  return { box: R(rb), vw, vh, L1, L2, L3, L4: { n: ctl.length, small: small.length, font: font.length, ex: small.slice(0, 4).concat(font.slice(0, 2)) } };
}`;

/** THE TABLES AGAINST THE LIST → problems [{ kind, key, words }] (empty = whole). kind: 'no-row' (neither an opener nor an
 *  excuse) · 'both' (an opener AND words of its own) · 'gone' (a row of OPENERS / EXCUSES names no surface) · 'stale-file'
 *  (EXCUSE_BY_FILE words no surface takes) · 'new-by-file' (a surface excused by its file's words and not listed by name) ·
 *  'stale-excuse' (a listed name no longer excused that way) · 'list-grew' / 'list-max' (the list's length against its max,
 *  which only falls) · 'ratchet' (a ratchet row for a surface with no opener, a language other than zh / en, a law other than
 *  L1–L3, a name table that is not names with whole counts > 0). */
export function checkTables(list, t = { OPENERS, EXCUSES, EXCUSE_BY_FILE, RATCHET, EXCUSED_BY_FILE_WORDS }) {
  const P = [], keys = new Set(list.map((s) => s.key));
  const opener = (s) => t.OPENERS[s.key] || (s.key.startsWith('view:settings:') ? SETTINGS_OPEN(s.category) : null);
  const words = (s) => t.EXCUSES[s.key] || (s.file ? t.EXCUSE_BY_FILE[base(s.file)] : null) || null;
  let excused = 0;
  const filesUsed = new Set(), listed = new Set(t.EXCUSED_BY_FILE_WORDS), byFile = new Set();
  for (const s of list) {
    const o = opener(s), own = t.EXCUSES[s.key], w = words(s);
    if (o && own) P.push({ kind: 'both', key: s.key, words: 'an opener and words of its own' });
    else if (!o && !w) P.push({ kind: 'no-row', key: s.key, words: `${s.file}:${s.line || ''} (${s.chain.join('>') || 'top'}) — no opener, no excuse` });
    if (!o && w) {
      excused++;
      if (!own && s.file) {
        filesUsed.add(base(s.file)); byFile.add(s.key);
        // round w8jjldn9f (2): a NEW surface in a file whose words excuse others is red BY NAME — its file's words cover only
        // the keys listed today; a new one takes an opener, or words of its own (a named excuse is the only way up)
        if (!listed.has(s.key)) P.push({ kind: 'new-by-file', key: s.key, words: `${s.file}:${s.line || ''} — a new surface in ${base(s.file)}.js: give it an opener, or words of its own in EXCUSES` });
      }
    }
  }
  for (const k of listed) if (!byFile.has(k)) P.push({ kind: 'stale-excuse', key: k, words: 'listed as excused by its file\'s words, but it is opened now, has words of its own, or is gone — take it out of EXCUSED_BY_FILE_WORDS' });
  const max = t.EXCUSED_BY_FILE_WORDS_MAX ?? EXCUSED_BY_FILE_WORDS_MAX;
  if (listed.size > max) P.push({ kind: 'list-grew', key: 'EXCUSED_BY_FILE_WORDS', words: `${listed.size} names, the most it may hold is ${max} — a new surface takes an opener or words of its own in EXCUSES` });
  if (listed.size < max) P.push({ kind: 'list-max', key: 'EXCUSED_BY_FILE_WORDS_MAX', words: `the list holds ${listed.size} names: lower EXCUSED_BY_FILE_WORDS_MAX to ${listed.size} (it only falls)` });
  for (const k of Object.keys(t.OPENERS)) if (!keys.has(k)) P.push({ kind: 'gone', key: k, words: 'an opener for a surface the tree no longer holds' });
  for (const k of Object.keys(t.EXCUSES)) if (!keys.has(k)) P.push({ kind: 'gone', key: k, words: 'words for a surface the tree no longer holds' });
  for (const f of Object.keys(t.EXCUSE_BY_FILE)) if (!filesUsed.has(f)) P.push({ kind: 'stale-file', key: f, words: 'file words no excused surface takes' });
  for (const [k, by] of Object.entries(t.RATCHET)) {
    const [k0, variant] = k.split('~'), s = list.find((x) => x.key === k0), o = s && opener(s);
    if (!o || (variant && !(o.also || []).some((v) => v.label === variant))) { P.push({ kind: 'ratchet', key: k, words: 'a ratchet row for a surface (or a draw) with no opener' }); continue; }
    for (const [lang, laws] of Object.entries(by)) {
      if (lang !== 'zh' && lang !== 'en') P.push({ kind: 'ratchet', key: k, words: `language ${lang}` });
      for (const [law, names] of Object.entries(laws)) {
        if (!/^L[123]$/.test(law) || !names || typeof names !== 'object' || !Object.keys(names).length) { P.push({ kind: 'ratchet', key: k, words: `${lang} ${law}: not a table of names` }); continue; }
        for (const [n, c] of Object.entries(names)) if (!n || !Number.isInteger(c) || c <= 0) P.push({ kind: 'ratchet', key: k, words: `${lang} ${law} «${n}»: ${c}` });
      }
    }
  }
  return { problems: P, excused, opened: list.filter((s) => opener(s)).length };
}

/** THE OPENERS' TARGETS EXIST (the reader's 12): every `M['file'].name(` is an export of src/lib/<file>.js, every
 *  `app.name(` / `app.sidebar.name(` / `app._settingsUI.name(` / `app._mobileNav.name(` a method some src/lib file defines —
 *  read in-process: the files that name a surface helper first (the app, its list, its nav and the dialogs' modules are
 *  among them), every src/lib file only when a name is still not found. AND EVERY CLASS AND ID A DRAW PRESSES (主开发 r1693 —
 *  the strip's step two, 79feb059d, took the model sheet's fold rows away: the effort / style draws pressed
 *  `.chat-status-fold-row` and threw only at the heavy run, this check green): each must be spelled, as a whole word, by a
 *  src/lib script or a public page (pageNamesOf) — so a mark whose name the tree's code no longer spells is red HERE, by its
 *  name, at the renaming unit's own fast gate. A FLOOR, not the browser's read: a stylesheet's rule draws no mark and does not
 *  count, but a word left in a comment or in dead code does; a selector is read only as a draw's root or in single quotes
 *  inside a querySelector / closest / getElementById call (a template's or a matches() selector is not).
 *  → [{ key, target }] missing (empty = whole). */
export function openerTargetProblems(list, repo) {
  const want = [];
  for (const s of list) for (const d of drawsOf(s)) {
    for (const x of [d.open, d.close].filter(Boolean)) {
      for (const m of x.matchAll(/M\['([\w-]+)'\]\.(\w+)\(/g)) want.push({ key: d.key, file: `src/lib/${m[1]}.js`, name: m[2], kind: 'export' });
      for (const m of x.matchAll(/\bapp\.(?:(?:sidebar|_settingsUI|_mobileNav)\.)?(\w+)\(/g)) want.push({ key: d.key, name: m[1], kind: 'method' });
    }
    for (const n of pageNamesOf([d.open, d.close, d.ready].filter((x) => typeof x === 'string').join('\n'), d.root)) want.push({ key: d.key, name: n, kind: 'page' });
  }
  const text = new Map();
  const readF = (f) => { if (!text.has(f)) { try { text.set(f, fs.readFileSync(path.join(repo, f), 'utf8')); } catch { text.set(f, ''); } } return text.get(f); };
  const names = [...new Set(want.filter((w) => w.kind === 'method').map((w) => w.name))], found = new Set();
  const re = names.length ? new RegExp(`^[ \\t]+(?:async[ \\t]+)?(${names.join('|')})[ \\t]*\\(`, 'gm') : null;
  const scan = (files) => { for (const f of files) for (const m of readF(f).matchAll(re)) found.add(m[1]); };
  if (re) {
    scan(srcFiles(repo).filter((f) => f.startsWith('src/lib/')));
    if (names.some((n) => !found.has(n))) scan(fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => `src/lib/${f}`));
  }
  // the page names: the scripts already read first (a mark is mostly in its own surface's file), then public/'s pages, then
  // every src/lib script — only while a name is still not found; a whole word, never a part of a longer name; never a sheet
  const pages = [...new Set(want.filter((w) => w.kind === 'page').map((w) => w.name.slice(1)))], seen = new Set();
  if (pages.length) {
    const pub = fs.readdirSync(path.join(repo, 'public')).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`);
    const lib = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => `src/lib/${f}`);
    for (const f of [...new Set([...[...text.keys()].filter((f) => f.endsWith('.js')), ...pub, ...lib])]) {
      const left = pages.filter((n) => !seen.has(n));
      if (!left.length) break;
      const s = readF(f);
      for (const n of left) if (s.includes(n) && new RegExp(`(?<![\\w-])${n}(?![\\w-])`).test(s)) seen.add(n);
    }
  }
  const has = (w) => (w.kind === 'export' ? new RegExp(`^export (async )?(function|const) ${w.name}\\b`, 'm').test(readF(w.file)) : w.kind === 'page' ? seen.has(w.name.slice(1)) : found.has(w.name));
  return want.filter((w) => !has(w)).map((w) => ({ key: w.key, target: w.kind === 'export' ? `${w.file} export ${w.name}` : w.kind === 'page' ? `the page name ${w.name} (no src/lib script or public page spells it)` : `a method ${w.name}` }));
}

/** The classes and ids a draw presses: the selectors of its querySelector(All) / closest calls (single-quoted, as the openers
 *  write them), the ids of its getElementById calls, and its `root` — `[class~="x"]` read as the class x, any other attribute
 *  test dropped. → ['.class', '#id', …] */
export function pageNamesOf(code, root = null) {
  const src = String(code || ''), out = new Set();
  const sels = [...src.matchAll(/(?:querySelector(?:All)?|closest)\('([^']+)'\)/g)].map((m) => m[1]);
  if (typeof root === 'string') sels.push(root);
  for (const sel of sels) for (const m of sel.replace(/\[class~="([\w-]+)"\]/g, '.$1').replace(/\[[^\]]*\]/g, '').matchAll(/[.#][A-Za-z][\w-]*/g)) out.add(m[0]);
  for (const m of src.matchAll(/getElementById\('([\w-]+)'\)/g)) out.add('#' + m[1]);
  return [...out];
}

/** The modules the openers name (the browser suite's probe bundle imports each beside src/client.js). */
export function openerModules(list) {
  const mods = new Set();
  for (const s of list) for (const d of drawsOf(s)) for (const m of d.mods || []) mods.add(m);
  return [...mods].sort();
}
