#!/usr/bin/env node
// THE DECLARED BILLING ROW (lane dc-client-billing, 2026-10-04 — rv-client F1/F5/F7, rv-harnesses M8/M13). The
// client's billing surfaces used to pick their words and fields with `=== 'codex'` (~35 sites in 8 files: the New
// Session account picker, the status bar, Session Properties, the usage meter, Manage Agents, the session card, the
// chat view, the billing switcher); the window id was re-spelled per harness 4×, the legacy claudeSessionId 8×, and
// a non-codex row was labelled 'Claude'. Now every one reads BACKEND_META[be].ui — the client mirror of the harness
// descriptor's `ui` row (test-harness-contract deep-compares) — through billingRow / uiRow / accountUsageStore /
// viewIdFor / legacyIdFor. PROOF that a third subscription-billed harness needs no core edit:
//   ① a FAKE harness row ('acme', its own words / fields / usage bucket) patched into BACKEND_META answers through
//     the helpers every surface calls; claude keeps view-<id> + its claudeSessionId, codex view-codex-<id>; an
//     unknown id gets the neutral row; labels come from META.
//   ② the REAL ChatStatusBar (test-billing-chip's counting fake DOM) on the acme backend: the billing chip names
//     acme's CLI login, on a host "<login> @ <host>"; claude / codex keep their words.
//   ③ NEGATIVE CONTROL — a scripts/mutant-copy.mjs copy of chat-status-bar.js with the pre-lane
//     `this._backend === 'codex' ? t('ChatGPT login') : t('CLI login')` restored names acme "CLI login".
//   ④ the surface census over the 10 client files: no pre-lane billing-word / label / view-id / claudeSessionId /
//     default-field / isCodex spelling left, with a patched-copy control (session-props' ternary restored ⇒ caught).
//     Per-file harness branch COUNTS are test-architecture §78's (the id-branch ratchet), not this suite's.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra) : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const MUT = mutantCopies('billing-row', repo);

// ── the fake DOM (copied from test-billing-chip: what the status bar touches, nothing more) ──
const counters = { created: 0, innerHTML: 0 };
class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this.parentElement = null; this._html = ''; this.innerSets = 0; this.dataset = {}; this.style = {}; counters.created++; const self = this;
    this.classList = {
      _set() { return new Set((self.getAttribute('class') || '').split(/\s+/).filter(Boolean)); },
      contains(c) { return this._set().has(c); },
      add(...cs) { const s = this._set(); cs.forEach((c) => s.add(c)); self.setAttribute('class', [...s].join(' ')); },
      remove(...cs) { const s = this._set(); cs.forEach((c) => s.delete(c)); self.setAttribute('class', [...s].join(' ')); },
      toggle(c, on) { const s = this._set(); const want = on === undefined ? !s.has(c) : !!on; if (want) s.add(c); else s.delete(c); self.setAttribute('class', [...s].join(' ')); return want; },
    };
  }
  get children() { return this.childNodes.filter((n) => n instanceof FakeEl); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get title() { return this.getAttribute('title') || ''; }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); this.innerSets++; counters.innerHTML++; }
  get textContent() { return this._html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<'); }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (ref && !this.childNodes.includes(ref)) throw new Error('insertBefore: reference is not a child');
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    n.parentNode = this; n.parentElement = this; return n;
  }
  insertAdjacentElement(pos, el) { if (pos !== 'afterend' || !this.parentNode) throw new Error('insertAdjacentElement: ' + pos); const p = this.parentNode; const i = p.childNodes.indexOf(this); return p.insertBefore(el, p.childNodes[i + 1] || null); }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i < 0) throw new Error('removeChild: not a child'); this.childNodes.splice(i, 1); n.parentNode = null; n.parentElement = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  // the one selector shape the title-bar chip asks: ':scope > .win-auth-badge' (and '.win-auth-badge')
  querySelector(sel) { const m = /\.([\w-]+)\s*$/.exec(sel); return m ? (this.children.find((c) => c.classList.contains(m[1])) || null) : null; }
  addEventListener() {}
  get isConnected() { return true; }
}

globalThis.document = { createElement: (t) => new FakeEl(t) };
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.getItem) Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true });
Object.assign(globalThis.document, { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: new FakeEl('body'), documentElement: new FakeEl('html'), removeEventListener() {} });
globalThis.document.addEventListener = () => {};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
// no requestAnimationFrame: _fitChipsSoon returns before measuring (the form decision is test-title-chips')

const { BACKEND_META, billingRow, uiRow, viewIdFor, legacyIdFor, accountUsageStore, getBackendMeta } = await import(pathToFileURL(path.join(repo, 'src/lib/agent-meta.js')).href);
const ACME_BILLING = { globalLogin: 'Acme plan', cliLogin: 'Acme login', pickLogin: 'Acme login (pick)', pickLoginHost: 'Acme login (on the host)', planSuffix: '', switchLogin: 'Acme switch', defaultIdField: 'defaultAcmeAccountId', apiKeys: false, longLivedToken: false, hostLogin: false, machineUsage: false, usage: 'codexAccounts', globalUsageKey: '__global_acme__', estimates: false };
BACKEND_META.acme = { ...BACKEND_META.codex, id: 'acme', label: 'Acme', shortLabel: 'ACME', iconSrc: '', ui: { billing: ACME_BILLING, effortReport: 'per-turn', effortLevels: 'model-catalog', modelLock: false, legacyIds: false, resumeResend: true } };

console.log('① the helpers every billing surface calls answer from the declared row');
ok(billingRow('acme') === ACME_BILLING && uiRow('acme').modelLock === false && uiRow('acme').resumeResend === true, 'billingRow / uiRow hand back the fake harness\'s own row');
ok(viewIdFor('acme', 'x1') === 'view-acme-x1' && viewIdFor('codex', 'x1') === 'view-codex-x1' && viewIdFor('claude', 'x1') === 'view-x1', 'ONE view-id rule: the legacy view-<id> form only on the legacyIds row');
ok(legacyIdFor('acme', 'x1') === null && legacyIdFor('claude', 'x1') === 'x1' && legacyIdFor(undefined, 'x1') === null, 'the legacy claudeSessionId only on the legacyIds row (exact backend, no default — layout\'s old null for a missing backend)');
const app = { _accountUsage: { a: 'accounts-map' }, _codexAccountUsage: { a: 'codex-map' } };
ok(accountUsageStore(app, 'acme').a === 'codex-map' && accountUsageStore(app, 'claude').a === 'accounts-map' && accountUsageStore(app, 'opencode').a === 'accounts-map', 'the usage bucket comes from the row (a harness without billing reads the accounts map, as the old non-codex arm did)');
ok(getBackendMeta('acme').label === 'Acme' && getBackendMeta('opencode').label === 'OpenCode', 'backend labels come from META (an OpenCode row no longer says Claude)');
ok(uiRow('nope').billing === null && billingRow('nope').cliLogin === 'CLI login' && uiRow('nope').modelLock === false, 'an unknown backend gets the neutral row');
ok(billingRow(undefined) === BACKEND_META.claude.ui.billing, 'billingRow defaults to claude (settingsPrefixFor\'s rule)');

console.log('② the REAL ChatStatusBar on the fake harness');
const { ChatStatusBar } = await import(pathToFileURL(path.join(repo, 'src/lib/chat-status-bar.js')).href);
const mkBar = (K, backend) => new K({ send() {} }, 'sid-row', { backend, getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {} });
const chipText = (K, backend, auth) => {
  const bar = mkBar(K, backend);
  bar.applyStatus({ model: 'm-1', permissionMode: 'default' });
  bar.setBilling(auth, () => {});
  const el = bar.element.children.find((e) => e.getAttribute('data-chip') === 'billing');
  return el ? el.textContent : '';
};
const local = chipText(ChatStatusBar, 'acme', { source: 'subscription' }), onHost = chipText(ChatStatusBar, 'acme', { source: 'subscription', hostName: 'box' });
ok(local.includes('Acme login') && !local.includes('CLI login'), 'the billing chip names the fake harness\'s CLI login', local);
ok(onHost.includes('Acme login @ box'), 'on a host it names the machine after the row\'s word', onHost);
ok(chipText(ChatStatusBar, 'claude', { source: 'subscription' }).includes('CLI login') && chipText(ChatStatusBar, 'codex', { source: 'subscription' }).includes('ChatGPT login'), 'claude / codex keep their words (behaviour identical)');

console.log('③ NEGATIVE CONTROL — the pre-lane id ternary restored');
const sbSrc = read('src/lib/chat-status-bar.js'), line = 'const glogin = t(billingRow(this._backend).cliLogin);';
ok(sbSrc.includes(line), 'the row read sits where the control expects it');
const { ChatStatusBar: Old } = await import(pathToFileURL(MUT.write('src/lib/chat-status-bar.js', sbSrc.replace(line, "const glogin = this._backend === 'codex' ? t('ChatGPT login') : t('CLI login'); // CONTROL: the pre-lane id ternary"))).href);
const oldText = chipText(Old, 'acme', { source: 'subscription' });
ok(!oldText.includes('Acme login') && oldText.includes('CLI login'), 'the patched copy names the fake harness "CLI login" — ② is red on it', oldText);

console.log('④ the surface census (pre-lane spellings) + its control');
const FILES = ['app', 'chat-status-bar', 'session-props', 'usage-meter', 'usage-window', 'manage-agents', 'session-card', 'chat-view', 'session-lifecycle', 'layout'].map((f) => `src/lib/${f}.js`);
const OLD = [
  [/[!=]==?\s*'(?:claude|codex)'\s*\?\s*(?:t|tr)\(\s*'(?:ChatGPT login|CLI login|Subscription)/, 'a billing word picked by a harness id'],
  [/[!=]==?\s*'(?:claude|codex)'\s*\?\s*'(?:Claude|Codex)'/, 'a backend label picked by a harness id'],
  [/`view-\$\{[\w.]+\}-\$\{/, 'a re-spelled view-id rule'],
  [/claude(?:Session)?Id\s*[:=]\s*[\w.]+\s*===\s*'claude'/, 'a re-spelled legacy claudeSessionId'],
  [/defaultCodexAccountId\s*:\s*this\._accounts/, 'the default-account field picked by an id'],
  [/\bisCodex\b/, 'an isCodex partition'],
];
const census = (text) => OLD.filter(([re]) => re.test(text)).map(([, why]) => why);
for (const f of FILES) { const hits = census(read(f)); ok(hits.length === 0, `${f}: no pre-lane billing / label / view-id spelling`, hits); }
const sp = read('src/lib/session-props.js'), want = 'const globalLabel = t(bill.globalLogin);';
ok(sp.includes(want) && census(sp.replace(want, "const globalLabel = sbe === 'codex' ? t('ChatGPT login') : t('Subscription');")).length === 1, 'census control: session-props with the pre-lane ternary restored is caught');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
