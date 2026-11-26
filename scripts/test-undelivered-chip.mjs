#!/usr/bin/env node
// B-5a4d ROOT UNIT 3's cure (the coordinator's r4682 M2 / M3): A «NOT DELIVERED» CHIP AS THE REAL RENDERER DRAWS IT, in the three states
// of r4664 law 2 — the REAL src/lib/chat-renderers.js (esbuild-bundled for node, a small DOM stand-in) built the way the view builds it:
// its constructor's `undeliveredActsOf` is the view's answer, asked of the PURE rule src/lib/undelivered-acts.js with the view's facts.
//   ① LIVE, the running agent advertised the acts — «Send again» and «Dismiss» beside the chip, the words that name them; a press reaches
//      the view's act; a picture-only message offers Dismiss alone (never a button the hub must refuse); «Not confirmed»: Dismiss alone
//   ② LIVE, an agent started before the update — no act, the words of before
//   ③ A STOPPED view — no act, the words that teach the road (resume, then …); a press on the chip itself is enabled (a phone has no hover)
//   RED: a copy of the renderer whose constructor drops the field — every render draws no act and the old words (the round's must)
//   ④ the view's wiring (source pins) and the words in both tables (zh / ja)
// Run: node scripts/test-undelivered-chip.mjs
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let passed = 0, failed = 0;
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean — «${name}»`); if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 700)}`); } }
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// ── a small DOM stand-in: what applyQueueChip and the user bubble touch (children, class lookups, the chip's title and press)
function mkEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(), className: '', dataset: {}, style: {}, title: '', type: '', textContent: '', disabled: false, children: [], parentElement: null, attrs: {}, _html: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    set innerHTML(v) { this._html = String(v); this.children = []; }, get innerHTML() { return this._html; },
    appendChild(c) { if (c && typeof c === 'object') { c.parentElement = this; this.children.push(c); } return c; },
    remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null; } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, removeEventListener() {}, closest() { return null; }, insertAdjacentHTML() {}, insertAdjacentElement() {},
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const direct = String(sel).startsWith(':scope > '), cls = String(sel).replace(':scope > ', '').trim().replace(/^\./, '');
      const out = [], walk = (n) => { for (const c of n.children) { if ((' ' + c.className + ' ').includes(' ' + cls + ' ')) out.push(c); if (!direct) walk(c); } };
      walk(this); return out;
    },
  };
  return el;
}
const noop = () => {};
for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1024, innerHeight: 768, location: { origin: 'http://test', href: 'http://test/', hostname: 'test', protocol: 'http:' }, scrollTo: noop })) {
  try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch {}
}
class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { try { Object.defineProperty(globalThis, k, { value: NoopObserver, configurable: true, writable: true }); } catch {} }
globalThis.window = globalThis;
globalThis.document = { createElement: mkEl, getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector() { return null; }, querySelectorAll() { return []; }, createTextNode: (t) => ({ textContent: t }) };
try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch {}
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// ── the REAL renderer, bundled (and a RED copy: the constructor drops the field) — the copy is bundled from stdin beside the real file
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uchip-'));
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
const bundle = async (name, contents) => {
  const outfile = path.join(dir, name + '.mjs');
  await esbuild.build({ stdin: { contents, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'chat-renderers.js', loader: 'js' }, bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stubBuildVersion] });
  return (await import(pathToFileURL(outfile).href)).ChatRenderers;
};
const CR_SRC = read('src/lib/chat-renderers.js');
const FIELD = "    this._undeliveredActsOf = undeliveredActsOf || null;";
const Real = await bundle('real', CR_SRC);
const Red = await bundle('red', anchored(CR_SRC, FIELD, '    /* MUTANT: the field dropped */', 'the renderer RED no-field'));
const { undeliveredActsFor } = await import(pathToFileURL(path.join(REPO, 'src/lib/undelivered-acts.js')).href);
// RED of the words rule (r4746): a copy of the PURE rule whose hasWords says yes to anything — a picture alone would offer Send again
const UA_SRC = read('src/lib/undelivered-acts.js'), uaRed = path.join(dir, 'undelivered-acts-red.mjs');
fs.writeFileSync(uaRed, anchored(UA_SRC, "  return blocks.some((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '');", '  return true;   /* MUTANT: any message has words */', 'the words rule RED'));
const { undeliveredActsFor: actsRed } = await import(pathToFileURL(uaRed).href);

const WORDS = [{ type: 'text', text: 'the words that never reached the agent' }], PICTURE = [{ type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' }];
const msgOf = (state, content = WORDS) => ({ id: 'm-' + state, role: 'user', status: 'complete', content, queueState: state, webuiMsgId: 'w-' + state });
const pressed = [];
const LIVE = { readOnly: false, live: true, advertised: true, act: (k) => pressed.push(k) }, OLD = { readOnly: false, live: true, advertised: false, act: (k) => pressed.push(k) }, STOPPED = { readOnly: true, live: false, advertised: false, act: null };
const draw = (CR, facts, msg) => {
  const r = new CR({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: mkEl(), undeliveredActsOf: (m) => undeliveredActsFor(m, facts) });
  const el = r.renderUserMsg(msg);
  const chip = el && el.querySelector(':scope > .chat-queue-chip'), buttons = el ? el.querySelectorAll('.chat-undelivered-act') : [];
  return { title: chip ? chip.title : null, enabled: !!chip && !chip.disabled && typeof chip.onclick === 'function', acts: buttons.map((b) => b.dataset.act), press: (k) => { const b = buttons.find((x) => x.dataset.act === k); if (b) b.onclick({ stopPropagation() {} }); } };
};
const T = {
  live: 'The conversation ended before the agent read this message — send it again or dismiss it',
  old: 'The conversation ended before the agent read this message — send it again',
  stopped: 'The conversation ended before the agent read this message — resume the conversation, then send it again or dismiss it',
  picture: 'The conversation ended before the agent read this message — it has no words to send again: dismiss it, and attach what it carried to a new message',
  uLive: 'The conversation ended while this message was being handed to the agent — it may not have reached it; dismiss it to take it off here',
};

console.log('① LIVE, the running agent advertised the acts');
const a = draw(Real, LIVE, msgOf('undelivered'));
a.press('resend'); a.press('dismiss');
ok(a.acts.join() === 'resend,dismiss' && a.title === T.live && a.enabled && pressed.join() === 'resend,dismiss', `«Not delivered»: «Send again» and «Dismiss» beside the chip, the words «${a.title}», each press reaches the view's act`, a);
const p = draw(Real, LIVE, msgOf('undelivered', PICTURE)), u = draw(Real, LIVE, msgOf('unconfirmed'));
ok(p.acts.join() === 'dismiss' && p.title === T.picture && u.acts.join() === 'dismiss' && u.title === T.uLive,
  'a picture alone: Dismiss alone (no button the hub must refuse) and words that say so; «Not confirmed»: Dismiss alone', { p, u });
const pr = (() => { const r = new Real({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: mkEl(), undeliveredActsOf: (m) => actsRed(m, LIVE) }); const el = r.renderUserMsg(msgOf('undelivered', PICTURE)); return el.querySelectorAll('.chat-undelivered-act').map((b) => b.dataset.act); })();
ok(pr.join() === 'resend,dismiss', 'RED: the words rule with a copy that finds words in anything offers Send again on a picture alone — a button the hub must refuse', pr);
console.log('② LIVE, an agent started before the update');
const o = draw(Real, OLD, msgOf('undelivered'));
ok(o.acts.length === 0 && o.title === T.old && o.enabled, `no act; the words of before («${o.title}»); the chip still shows its words on a press`, o);
console.log('③ A STOPPED view');
const s = draw(Real, STOPPED, msgOf('undelivered'));
ok(s.acts.length === 0 && s.title === T.stopped && s.enabled, `no act; the chip TEACHES the road («${s.title}») and shows it on a press (a phone)`, s);
const r = draw(Red, LIVE, msgOf('undelivered')), rs = draw(Red, STOPPED, msgOf('undelivered'));
ok(r.acts.length === 0 && r.title === T.old && rs.title === T.old, 'RED: a renderer whose constructor drops the field draws no act and the old words — in a live view and a stopped one alike', { r, rs });

console.log('④ the view\'s wiring and the words in both tables');
const CV = read('src/lib/chat-view.js');
const ctor = CV.slice(CV.indexOf('this._renderers = new ChatRenderers({'), CV.indexOf('this._renderers = new ChatRenderers({') + 4000);
ok(ctor.includes('undeliveredActsOf: (m) => this._undeliveredActsOf(m),') && /\n  _undeliveredActsOf\(msg\) \{\n    return undeliveredActsFor\(msg, \{ readOnly: !!this\._readOnly, live: !this\._disconnected, advertised: this\._undeliveredActsLive === true, act:/.test(CV)
  && /_setReadOnly\(\) \{[\s\S]*?this\._refreshQueueChips\?\.\(\);[^\n]*\n  \}/.test(CV),
  'the view builds its renderer WITH its answer, asks the PURE rule with its own facts, and repaints the chips when it turns read-only');
const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
const keys = [...Object.values(T), 'Send again', 'undelivered::Dismiss', 'Sent again', 'Removed, not delivered'];
const missing = keys.filter((k) => !ZH.includes(JSON.stringify(k) + ':') || !JA.includes(JSON.stringify(k) + ':'));
ok(missing.length === 0, `every word of the three states is in both tables (zh / ja): ${keys.length} keys`, missing);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
