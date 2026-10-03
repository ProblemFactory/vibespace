#!/usr/bin/env node
// THE BILLING CHIP FOLLOWS THE MEMBER (lane billing-chip, 2026-09-30; fast, in-process). The owner, on a phone:
// conversations whose pool had moved them to another member at 21:56 still showed the member they started on.
// The phone has no title bars, so its billing chip is the chat STATUS BAR's (chat-status-bar.js setBilling,
// fed by app.syncSessionIdentity on every active-sessions merge) — and its re-render key was
// `${auth.source}:${auth.name}`: the POOL's name alone, while the chip prints "⣿ <pool> → <member>". A
// per-session switch, a pin or a gather changes the member and not the pool, so the key never moved and the
// chip kept the old member for the life of the page. The title-bar chip (window.js setAuthBadge) had its own,
// longer key and repainted — two keys for one identity, one of them short.
// Now ONE PURE key, `billingAuthKey(auth, t)` (src/lib/pool-priority-model.js, beside placementNote), is the
// census of what the chips print, and both keyed renderers use it.
//   §1 the PURE key: '' for no identity; the same identity ⇒ the same key (a fresh object every broadcast);
//      EVERY printed field moves it (source, name, the member by name AND by id, host, the estimated mark, an
//      API key's tail / detail, the placement note — pinned / priority #n / automatic); a field no chip prints
//      (poolDefault) does not (no repaint bought for nothing); names containing the separator never collide
//   §2 the REAL ChatStatusBar through a counting fake DOM: pooled → member A, then the SAME pool → member B ⇒
//      the chip's text names B, on the SAME node (patched in place, keyed-chip law); a pin / a priority move
//      repaints the tooltip with the placement words; the identical identity re-sent writes nothing
//   §3 the REAL WindowManager.setAuthBadge over a fake title bar: the same walk ⇒ the title chip names B; after
//      every step both renderers hold exactly billingAuthKey(auth) (the two keys cannot drift apart again)
//   §4 NEGATIVE CONTROLS (scripts/mutant-copy.mjs): ① a chat-status-bar.js copy with the pre-fix key ⇒ the chip
//      still names A after the switch (the owner's phone); ② a pool-priority-model.js copy whose key forgets the
//      member ⇒ §1's table fails
//   §5 census + wiring: no src/lib file spells a billing key of its own (both setters call the PURE key), the
//      broadcast still feeds both, the sidebar card prints no pool member (so LIVE_SESSION_FACTS' `auth` stays
//      carried-only — a card that starts printing it must gate on this key), ci.mjs carries this suite
// No browser, no server. The phone's chrome leg is test-mobile-gaps' "billing chip follows the member".
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const MUT = mutantCopies('billing-chip', repo);
const tEn = (k, p) => (p ? String(k).replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)) : String(k));

// the server's own shape (server.js sessionAuth → poolAuth), neutral names
const POOL = (o = {}) => ({ source: 'pooled', name: '全部', poolTarget: 'Alpha Max', poolTargetId: 'acct-a', placement: 'automatic', priorityRank: null, pinned: null, pinnedId: null, poolDefault: 'Alpha Max', ...o });
const TO_B = { poolTarget: 'Beta Max', poolTargetId: 'acct-b' };

// ── §1 the PURE key ──────────────────────────────────────────────────────
/** The table, run against any billingAuthKey (the real one, or a control's). → the failing rows. */
function keyTable(key) {
  const bad = [];
  const same = (a, b, why) => { if (key(a, tEn) !== key(b, tEn)) bad.push('should be SAME: ' + why); };
  const diff = (a, b, why) => { if (key(a, tEn) === key(b, tEn)) bad.push('should DIFFER: ' + why); };
  if (key(null, tEn) !== '' || key(undefined, tEn) !== '') bad.push('no identity ⇒ \'\'');
  if (key(POOL(), tEn) === '') bad.push('an identity ⇒ a non-empty key');
  same(POOL(), POOL(), 'a fresh object with the same fields (every broadcast builds one)');
  diff(POOL(), POOL(TO_B), 'the member the conversation runs on (a per-session switch)');
  diff(POOL(), POOL({ poolTargetId: 'acct-a2' }), 'the member by id (two members may share a name)');
  diff(POOL(), POOL({ poolTarget: null, poolTargetId: null }), 'a member → no target');
  diff(POOL(), POOL({ name: 'Team' }), 'the pool');
  diff(POOL(), POOL({ placement: 'pinned', pinned: 'Alpha Max', pinnedId: 'acct-a' }), 'pinned here');
  diff(POOL({ placement: 'pinned', pinned: 'Alpha Max', pinnedId: 'acct-a' }), POOL({ placement: 'pinned', pinned: 'Gamma Max', pinnedId: 'acct-g' }), 'pinned elsewhere, running here for now');
  diff(POOL({ placement: 'priority', priorityRank: 1 }), POOL({ placement: 'priority', priorityRank: 2 }), 'the priority place');
  diff(POOL(), POOL({ placement: 'priority', priorityRank: 1 }), 'automatic → priority');
  diff(POOL(), POOL({ hostName: 'build-box' }), 'the machine');
  diff({ source: 'subscription' }, { source: 'subscription', guessed: true }, 'the estimated mark');
  diff({ source: 'subscription' }, { source: 'api-console' }, 'the kind');
  diff({ source: 'unknown' }, { source: 'subscription' }, 'unknown → known (the init frame)');
  diff({ source: 'api-key', name: 'k', tail: '1234' }, { source: 'api-key', name: 'k', tail: '9876' }, 'an API key\'s tail');
  diff({ source: 'api-other', detail: 'apiKeyHelper' }, { source: 'api-other', detail: 'x' }, 'an API detail');
  diff({ source: 'subscription', name: 'a:b', poolTarget: '' }, { source: 'subscription', name: 'a', poolTarget: 'b' }, 'a name holding the separator never collides');
  same(POOL(), POOL({ poolDefault: 'Beta Max' }), 'the pool DEFAULT moved (no chip prints it — no repaint bought)');
  return bad;
}
console.log('§1 the PURE key');
const PPM = await import(pathToFileURL(path.join(repo, 'src/lib/pool-priority-model.js')).href);
{
  const bad = keyTable(PPM.billingAuthKey);
  ok(bad.length === 0, `billingAuthKey: '' for none, stable per identity, moved by every printed field (member name + id, pool, pin / priority place, host, estimated, kind, tail, detail), not by the pool default, collision-free (${bad.length} bad)`, bad);
  ok(PPM.billingAuthKey(POOL({ placement: 'pinned', pinned: 'Alpha Max', pinnedId: 'acct-a' }), tEn).includes('"pinned"'), 'the placement note is IN the key (the words the chips print, via placementNote)');
}

// ── the fake DOM (what the two renderers touch, nothing more) ─────────────
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

// import FIRST (the module tree has no DOM access at import — test-status-bar-chips' order)
const { ChatStatusBar } = await import(pathToFileURL(path.join(repo, 'src/lib/chat-status-bar.js')).href);
const { t: tApp } = await import(pathToFileURL(path.join(repo, 'src/lib/i18n.js')).href); // the t the renderers use
const mkBar = (Klass) => new Klass({ send() {} }, 'sid-billing', { backend: 'claude', getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {} });
const billingEl = (bar) => bar.element.children.find((el) => el.getAttribute('data-chip') === 'billing') || null;
globalThis.document = { createElement: (t) => new FakeEl(t) };

// ── §2 the phone's chip ──────────────────────────────────────────────────
console.log('§2 the REAL ChatStatusBar: a per-session switch repaints the chip in place');
/** The pill's WHOLE form (lane phone-chip, composed at the 2.369.202 integration: the chip holds the whole form, the short
 *  form and the icon side by side — CSS shows the one that fits; the member is named in the whole one). */
const pillFull = (el) => { if (!el) return ''; const m = /<span class="pill-full">([\s\S]*?)<\/span>/.exec(el._html || ''); return m ? m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<') : el.textContent; };
/** The owner's walk on a bar class: member A, then the same pool on member B. → what the chip showed. */
function walkBar(Klass) {
  const bar = mkBar(Klass);
  bar.applyStatus({ model: 'claude-fable-5-1', permissionMode: 'default' });
  bar.setBilling(POOL(), () => {});
  const el0 = billingEl(bar), text0 = pillFull(el0);
  bar.setBilling(POOL(TO_B), () => {}); // the next active-sessions broadcast: the SAME pool, another member
  const el1 = billingEl(bar);
  const r = { bar, el0, text0, el1, text1: pillFull(el1), sameNode: !!el0 && el0 === el1 };
  return r;
}
{
  const w = walkBar(ChatStatusBar);
  ok(w.text0 === '⣿ 全部 → Alpha Max', `the phone chip first names the member the conversation runs on (${JSON.stringify(w.text0)})`);
  ok(w.text1 === '⣿ 全部 → Beta Max', `after a per-session switch (same pool, member B) the chip names B (${JSON.stringify(w.text1)}) — the owner's phone kept A`);
  ok(w.sameNode, 'the chip is patched IN PLACE (the same <span data-chip="billing"> node — the keyed-chip law)');
  ok(/currently billing Beta Max \(automatic\)/.test(w.el1.getAttribute('title')), `its tooltip names B and how it was placed (${w.el1.getAttribute('title')})`);
  const bar = w.bar, el = w.el1;
  bar.setBilling(POOL({ ...TO_B, placement: 'pinned', pinned: 'Beta Max', pinnedId: 'acct-b' }));
  ok(billingEl(bar) === el && /currently billing Beta Max \(pinned\)/.test(el.getAttribute('title')), `a pin repaints the tooltip with the placement words (${el.getAttribute('title')})`);
  bar.setBilling(POOL({ ...TO_B, placement: 'priority', priorityRank: 2 }));
  ok(/\(priority #2\)/.test(el.getAttribute('title')), `a priority place repaints it too (${el.getAttribute('title')})`);
  bar.setBilling(POOL({ ...TO_B, placement: 'priority', priorityRank: 2, hostName: 'build-box' }));
  ok(/on "build-box"/.test(el.getAttribute('title')), 'a host repaints it');
  const w0 = counters.innerHTML, a0 = el.getAttribute('title');
  let renders = 0; const orig = bar.render.bind(bar); bar.render = () => { renders++; return orig(); };
  for (let i = 0; i < 5; i++) bar.setBilling(POOL({ ...TO_B, placement: 'priority', priorityRank: 2, hostName: 'build-box', poolDefault: 'Other Max' }));
  ok(renders === 0 && counters.innerHTML === w0 && el.getAttribute('title') === a0, `the same identity re-sent five times (each a fresh object, a moved pool DEFAULT) renders nothing (${renders} renders, ${counters.innerHTML - w0} writes) — no churn per broadcast`);
  bar.render = orig;
  bar.setBilling(null);
  ok(!billingEl(bar), 'no identity ⇒ no chip');
  bar.dispose();
}

// ── §3 the title-bar chip, and the two keys agree ───────────────────────────
console.log('§3 the REAL WindowManager.setAuthBadge: the same walk, and both keys are the PURE one');
// the globals window.js's import graph reads (test-title-chips' set)
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
const { WindowManager } = await import(pathToFileURL(path.join(repo, 'src/lib/window.js')).href);
{
  const wm = Object.create(WindowManager.prototype); wm.windows = new Map();
  const titleBar = new FakeEl('div'); const titleSpan = new FakeEl('span'); titleBar.appendChild(titleSpan);
  const win = { id: 'w1', titleBar, titleSpan, _tabChain: null };
  wm.windows.set('w1', win);
  const bar = mkBar(ChatStatusBar);
  bar.applyStatus({ model: 'claude-fable-5-1', permissionMode: 'default' });
  const STEPS = [
    ['member A', POOL()],
    ['member B (a per-session switch)', POOL(TO_B)],
    ['pinned to B', POOL({ ...TO_B, placement: 'pinned', pinned: 'Beta Max', pinnedId: 'acct-b' })],
    ['pinned to G, running on B for now', POOL({ ...TO_B, placement: 'pinned', pinned: 'Gamma Max', pinnedId: 'acct-g' })],
    ['priority #1', POOL({ ...TO_B, placement: 'priority', priorityRank: 1 })],
    ['a remote machine', POOL({ ...TO_B, placement: 'priority', priorityRank: 1, hostName: 'build-box' })],
    ['an API key', { source: 'api-key', name: 'Team key', tail: '1234' }],
    ['the same API key, another tail', { source: 'api-key', name: 'Team key', tail: '9876' }],
    ['no identity', null],
  ];
  const drift = []; let prevBadge = null;
  for (const [what, auth] of STEPS) {
    wm.setAuthBadge('w1', auth); bar.setBilling(auth);
    const want = PPM.billingAuthKey(auth, tApp);
    if (win._authBadgeKey !== want) drift.push({ what, renderer: 'title bar', have: win._authBadgeKey, want });
    if ((bar._billingKey ?? '') !== want) drift.push({ what, renderer: 'status bar', have: bar._billingKey, want });
    const badge = titleBar.querySelector(':scope > .win-auth-badge');
    if (what === 'member A') { ok(!!badge && /wab-pool-tgt"> → Alpha Max</.test(badge.innerHTML), 'the title chip first names member A'); prevBadge = badge; }
    if (what.startsWith('member B')) ok(badge === prevBadge && /wab-pool-tgt"> → Beta Max</.test(badge.innerHTML), `after the switch the title chip names B, on the same node (${badge?.textContent})`);
    if (what === 'pinned to G, running on B for now') ok(/pinned to Gamma Max, running here for now/.test(badge?.dataset.tip || ''), 'the title chip\'s tooltip says the pin elsewhere (placement note)');
    if (what === 'the same API key, another tail') ok(/…9876/.test(badge?.dataset.tip || ''), `an API key's tail it prints repaints it (${badge?.dataset.tip})`);
    if (what === 'no identity') ok(!badge, 'no identity ⇒ the title chip leaves');
  }
  ok(drift.length === 0, `after each of ${STEPS.length} steps BOTH renderers hold exactly billingAuthKey(auth) — one key, no drift (${drift.length} drifts)`, drift);
  bar.dispose();
}

// ── §4 negative controls ───────────────────────────────────────────────────
console.log('§4 negative controls (scripts/mutant-copy.mjs)');
{
  const src = read('src/lib/chat-status-bar.js');
  const line = '    const key = billingAuthKey(auth, t);';
  ok(src.split(line).length === 2, 'setBilling spells its key once (the control patches exactly it)');
  const { ChatStatusBar: Old } = await import(pathToFileURL(MUT.write('src/lib/chat-status-bar.js', src.replace(line, "    const key = auth ? `${auth.source}:${auth.name || ''}` : ''; // CONTROL: the pre-fix key (the pool's name alone)"), 'old-key')).href);
  const w = walkBar(Old);
  ok(w.text0 === '⣿ 全部 → Alpha Max' && w.text1 === '⣿ 全部 → Alpha Max', `CONTROL ① — the pre-fix key keeps the chip on member A after the switch (${JSON.stringify(w.text1)}): the owner's phone, and §2 can fail`);
  w.bar.dispose();
  const psrc = read('src/lib/pool-priority-model.js');
  const pline = "  return JSON.stringify([auth.source || '', auth.name || '', auth.poolTarget || '', auth.poolTargetId || '',";
  ok(psrc.split(pline).length === 2, 'the PURE key spells its field list once (the control patches exactly it)');
  const M2 = await import(pathToFileURL(MUT.write('src/lib/pool-priority-model.js', psrc.replace(pline, "  return JSON.stringify([auth.source || '', auth.name || '', '', '', // CONTROL: the member forgotten"), 'no-member')).href);
  const bad = keyTable(M2.billingAuthKey);
  ok(bad.some((b) => /member the conversation runs on/.test(b)) && bad.some((b) => /member by id/.test(b)), `CONTROL ② — a PURE key that forgets the member fails §1's table (${bad.length} rows)`, bad);
}

// ── §5 census + wiring ────────────────────────────────────────────────────
console.log('§5 census + wiring');
{
  const fnBody = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j < 0 ? undefined : j); };
  const wj = read('src/lib/window.js'), sb = read('src/lib/chat-status-bar.js'), app = read('src/lib/app.js'), cv = read('src/lib/chat-view.js');
  ok(/const key = billingAuthKey\(auth, t\);/.test(fnBody(wj, '  setAuthBadge(id, auth) {')) && /import \{[^}]*\bbillingAuthKey\b[^}]*\} from '\.\/pool-priority-model\.js';/.test(wj), 'window.js setAuthBadge keys on the PURE billingAuthKey');
  ok(/const key = billingAuthKey\(auth, t\);/.test(fnBody(sb, '  setBilling(auth, onSwitch) {')) && /import \{[^}]*\bbillingAuthKey\b[^}]*\} from '\.\/pool-priority-model\.js';/.test(sb), 'chat-status-bar.js setBilling keys on the PURE billingAuthKey');
  // the census: no file under src/lib spells a billing identity key of its own (a template over auth fields, or a
  // key assignment beside a billing store) — the two renderers are the only keyed ones and both call the PURE key
  const libDir = path.join(repo, 'src/lib');
  const ownKeys = (f, s) => {
    const out = [];
    s.split('\n').forEach((l, i) => {
      if (/\$\{\s*(?:auth|a|match\.auth)\.(?:source|poolTarget|poolTargetId)\b[^}]*\}\s*:/.test(l)) out.push(`${f}:${i + 1}: ${l.trim().slice(0, 120)}`);
      if (/\b_(?:authBadgeKey|billingKey)\s*=(?!=)/.test(l) && !/=\s*key;/.test(l)) out.push(`${f}:${i + 1}: ${l.trim().slice(0, 120)}`);
    });
    return out;
  };
  const own = [];
  for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith('.js') && !/^i18n-/.test(x))) own.push(...ownKeys(f, fs.readFileSync(path.join(libDir, f), 'utf-8')));
  ok(own.length === 0, `no src/lib file spells its own billing key (${own.length} found)`, own);
  // the census's own control: the two pre-fix key lines, verbatim, are both caught
  const preFix = ["    const key = auth ? `${auth.source}:${auth.name || ''}` : '';",
    "    const key = auth ? `${auth.source}:${auth.name || ''}:${auth.poolTarget || ''}:${auth.hostName || ''}:${auth.guessed ? 1 : 0}:${placementNote(auth, t)}` : '';"];
  ok(preFix.every((l) => ownKeys('pre-fix', l).length === 1), 'CONTROL — the census catches both pre-fix key lines (the phone chip\'s and the title chip\'s), verbatim');
  const defs = fs.readdirSync(libDir).filter((x) => x.endsWith('.js') && /export function billingAuthKey\(/.test(fs.readFileSync(path.join(libDir, x), 'utf-8')));
  ok(defs.length === 1 && defs[0] === 'pool-priority-model.js', `billingAuthKey is defined once, in the PURE pool-priority-model.js (${defs.join(', ')})`);
  ok(/this\.wm\.setAuthBadge\?\.\(winId, match\.auth \|\| null\);/.test(app) && /session\.setBillingIdentity\?\.\(match\.auth \|\| null, /.test(app), 'the active-sessions merge still feeds BOTH renderers the same auth (app.syncSessionIdentity)');
  ok(/setBillingIdentity\(auth, onSwitch\) \{\n    this\._statusBar\?\.setBilling\?\.\(auth, onSwitch\);/.test(cv), 'ChatView hands it to the status bar unchanged');
  // the sidebar card: it prints a subscription's name / an API key badge, but NO pool member — so `auth` stays
  // carried-only in LIVE_SESSION_FACTS (a pool switch buys no list re-render). A card that starts printing the
  // member must gate the digest on this key.
  const card = read('src/lib/session-card.js'), side = read('src/lib/sidebar.js');
  ok(!/poolTarget/.test(card) && /auth: \{ digest: null \}/.test(side), 'the sidebar card prints no pool member, and LIVE_SESSION_FACTS keeps `auth` carried-only (if the card ever prints it: gate `auth` on billingAuthKey)');
  ok(/\{ name: 'test-billing-chip', tier: 'fast'(?:,| \})/.test(read('scripts/ci.mjs')), 'ci.mjs carries test-billing-chip in the fast tier');
}

console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 2 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
