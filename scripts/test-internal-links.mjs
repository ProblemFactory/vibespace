#!/usr/bin/env node
// test-internal-links — lane login-request-card piece 1 (the design's «Internal links»; 主开发 2026-11-17: ONE scheme, ONE module, ONE
// option on the renderer, ONE table of presses, ONE rule for where it renders). FAST, in-process: the PURE grammar + the press table
// (src/internal-link.js), the REAL chat renderer and For-you grammar through esbuild over a DOM shim (the option on / off, the drawing,
// the unknown chip, the vendor's conversation:// untouched, a hand-drawn span stripped), THE PRESS over a recorded page (every plan's
// act is the page's own door; a press never sends, ends, archives or grants), the words (three languages, never «sleep»), the
// agents' teaching (the manual's paragraph; nothing added to the session intro). Every law has its red control.
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info.slice(0, 900) : JSON.stringify(info).slice(0, 900)); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const L = require(path.join(REPO, 'src/internal-link.js'));
const KEY = 'claude:0e0e0e0e-1111-4222-8333-444455556666', DESK = 'desk-mh3k2-a1b', SETK = 'chat.uploadDir';
const has = (k) => k === SETK || k === 'spend.unattendedPerInstanceDay';

console.log('① THE GRAMMAR (src/internal-link.js, PURE): two new targets and the settings row, one table');
{
  const hits = (s) => L.linkHits(s, has).map((h) => `${h.kind}|${h.ref}|${s.slice(h.start, h.end)}`);
  const C = `vibespace://conversation/${KEY}`, D = `vibespace://desktop/${DESK}`;
  const ROWS = [
    [`see ${C}.`, [`conversation|${KEY}|${C}`], 'a bare conversation link — the sentence\'s full stop stays outside'],
    [`桌面：${D}。然后`, [`desktop|${DESK}|${D}`], 'a desktop link after a full-width colon, its CJK full stop outside'],
    [`Go here:${C}, then`, [`conversation|${KEY}|${C}`], 'after a half-width colon it is a door; the comma stays outside'],
    [`VIBESPACE://Conversation/${KEY}`, [`conversation|${KEY}|VIBESPACE://Conversation/${KEY}`], 'the scheme and the target word in any case'],
    [`x${C}`, [], 'glued to a word it is no door'],
    [`/home/u/${D}`, [], 'glued to a path it is no door'],
    ['vibespace://conversation/claude', [], 'a key with no colon is no door'],
    ['vibespace://conversation/claude:', [], 'a key with no id is no door'],
    ['vibespace://conversation/Claude:abc', [], 'a backend in capitals is no key (the sidebar\'s keys are lower-case)'],
    ['vibespace://desktop/-x', [], 'a desktop id that starts with a dash is no door'],
    [`${D}?name=x`, [`desktop|${DESK}|${D}`], 'NO VALUE PART — `?…` stays words outside the link'],
    ['vibespace://window/w1 vibespace://foo', [], 'no third target: a target word not in the table is no door'],
    [`vibespace://settings/${SETK}.`, [`setting|${SETK}|vibespace://settings/${SETK}`], 'the settings row: a known key (the longest, cut back at a dot)'],   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
    ['vibespace://settings/spend.nope', [], 'the settings row: an unknown key is words'],
    ['conversation://0e0e0e0e-1111-4222-8333-444455556666', [], 'the vendor\'s own conversation:// is another scheme — untouched'],
  ];
  for (const [s, want, name] of ROWS) ok(JSON.stringify(hits(s)) === JSON.stringify(want), name, hits(s));
  ok(L.linkOf('conversation', KEY) === C && L.linkOf('desktop', DESK) === D && L.linkOf('setting', SETK) === `vibespace://settings/${SETK}`, 'linkOf spells each target as the list prints it');   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  ok(verdictOf(['conversation', 'desktop'].every((k) => { const r = k === 'desktop' ? DESK : KEY; const h = L.linkHits(L.linkOf(k, r), has); return h.length === 1 && h[0].kind === k && h[0].ref === r; })), 'what linkOf writes the grammar reads back whole');
  ok(JSON.stringify(L.hrefTarget(C, has)) === JSON.stringify({ kind: 'conversation', ref: KEY }) && L.hrefTarget(C + '/', has) === null && L.hrefTarget('vibespace://settings/spend.nope', has) === null && L.hrefTarget('vibespace://window/w1', has) === null,
    'an href is a link only when it IS one, exactly (no trailing part, no unknown key, no third target)');
  ok(L.targetOfMark(L.markOf('conversation', KEY)).ref === KEY && L.targetOfMark(L.markOf('desktop', DESK)).ref === DESK && L.targetOfMark('#vs-conversation-0e0e0e0e-1111-4222-8333-444455556666') === null,
    'the marks round-trip; the vendor\'s sub-agent mark (#vs-conversation-) is not ours');
  const runs = [...'a vibespace://conversation/x, b/vibespace://desktop/d. c vibespace://foo/bar'.matchAll(L.runRe())].map((m) => m[0]);
  ok(runs.length === 3 && runs[1] === 'vibespace://desktop/d.', 'EVERY run of the scheme is claimable (glued too), whatever its target word', runs);
}

console.log('② THE TABLE OF PRESSES (PURE pressPlan): a press only navigates');
{
  const P = (f) => L.pressPlan('conversation', f);
  const T = [
    [{ win: 'w1', row: { live: true } }, 'win', 'a built window (live) — its desktop, its tab, the flash'],
    [{ win: 'w1', row: { ended: true } }, 'win', 'ENDED with a window — its history; nothing starts'],
    [{ win: 'w1', row: { archived: true } }, 'win', 'a built window wins over archived (it is on the page)'],
    [{ heldDesk: 'd2', row: { live: true } }, 'desk', 'a row on a desktop not built — switch there'],
    [{ row: { live: true } }, 'attach', 'running with no window — open on the desktop on show'],
    [{ row: { ended: true } }, 'menu', 'ENDED with no window — the two-item menu'],
    [{ row: { ended: true, archived: true } }, 'archived', 'archived — a toast naming the door'],
    [{ row: { tmux: true } }, 'tmux', 'running in a tmux pane — attached as the sidebar attaches it'],
    [{ row: {} }, 'outside', 'running outside VibeSpace with nothing to attach'],
    [{}, 'unknown', 'a key the page has no row for'],
  ];
  for (const [f, want, name] of T) ok(P(f) === want, `conversation: ${name}`, P(f));
  ok(L.pressPlan('desktop', { has: true }) === 'switch' && L.pressPlan('desktop', { has: false }) === 'unknown' && L.pressPlan('setting', {}) === 'settings' && L.pressPlan('window', {}) === 'unknown', 'desktop: switch / unknown; a setting: Settings on its row; no third target');
  const src = read('src/internal-link.js');
  const mut = editAnchor(src, "  if (row.ended) return 'menu';", "  if (row.ended) return 'resume';", "src/internal-link.js");
  const M = {}; new Function('module', 'require', mut)(M, createRequire(path.join(REPO, 'src/internal-link.js')));   // the mutant reads its own imports from src/
  ok(mut !== src && M.exports.pressPlan('conversation', { row: { ended: true } }) !== 'menu', 'RED CONTROL: a table that starts an ENDED conversation on a press reads red on the leg above');
}

// ── the client, through esbuild over a DOM shim ──
const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');
const noop = () => {};
const mkEl = (tag = 'div') => { const el = { tagName: String(tag).toUpperCase(), className: '', dataset: {}, title: '', type: '', _kids: [], _ls: {}, _text: '', _html: '', childNodes: [],
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, style: { setProperty() {} },
  set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }, get outerHTML() { return `<${String(tag)}></${String(tag)}>`; },
  set textContent(v) { this._text = String(v); this._kids = []; }, get textContent() { return this._kids.length ? this._kids.map((k) => k.textContent).join('') : this._text; },
  append(...k) { this._kids.push(...k); }, appendChild(k) { this._kids.push(k); return k; }, addEventListener(t, f) { this._ls[t] = f; }, removeEventListener: noop, setAttribute(k, v) { this[k] = v; }, querySelector: () => null, querySelectorAll: () => [], closest: () => null }; return el; };
for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), getComputedStyle: () => ({}) })) { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { } }
class NoopObserver { observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } }
for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { try { Object.defineProperty(globalThis, k, { value: NoopObserver, configurable: true, writable: true }); } catch { } }
globalThis.window = globalThis;
globalThis.document = { createElement: mkEl, createTextNode: (t) => ({ textContent: String(t) }), createDocumentFragment: () => mkEl('frag'), getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] };
try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch { }
globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ilinks-'));
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
const URI_RULE = String.raw`^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))`;
const STUB = `const OK = new RegExp(${JSON.stringify(URI_RULE)}, 'i');\nexport const sanitizeHtml = (h) => h.replace(/(<a\\b[^>]*?)\\shref="([^"]*)"/gi, (m, pre, v) => (OK.test(v.replace(/[\\u0000-\\u0020]/g, '')) ? m : pre));\nexport const sanitizeDiagramSvg = () => '';`;
let nb = 0;
/** ONE build of several entries (code splitting: the door module is ONE instance for the renderer and the suite). */
const bundle = async (entries, patch = null, patchFile = /chat-renderers\.js$/) => {
  const out = path.join(SCR, `b${nb++}`);
  const plug = { name: 'il', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'il-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'il-stub' }, (a) => ({ contents: a.path === 'safe-html.js' ? STUB : "export const BUILD_VERSION = 'test';", loader: 'js' }));
    if (patch) b.onLoad({ filter: patchFile }, (a) => ({ contents: patch(fs.readFileSync(a.path, 'utf8')), loader: 'js', resolveDir: path.dirname(a.path) }));
  } };
  await esbuild.build({ entryPoints: entries.map((e) => path.join(REPO, e)), bundle: true, splitting: true, format: 'esm', platform: 'node', target: 'es2022', outdir: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
  return Promise.all(entries.map((e) => import(path.join(out, path.basename(e, '.js') + '.js'))));
};
const NAMES = { [KEY]: 'Research', [DESK]: 'Desktop 2' };
const doorOf = (calls) => ({
  targetOf: (kind, ref) => (NAMES[ref] ? { state: 'known', name: NAMES[ref] } : ref === 'claude:unsure' ? { state: 'unsure', name: '' } : { state: 'unknown', name: '' }),
  press: (kind, ref, at) => { calls.push(['press', kind, ref, at.x]); return 'win'; },
  menu: (kind, ref, at) => { calls.push(['menu', kind, ref, at.x]); },
});
const mkR = (CR) => new CR.ChatRenderers({ ws: null, sessionId: 's', app: { openSettingAt() { } }, backend: 'claude', compact: false, messageList: mkEl() });
const vsDoors = (h) => (String(h).match(/class="chat-link chat-vs-link"/g) || []).length;
const pathy = (h) => /chat-link-path|data-path=/.test(String(h));
const C = `vibespace://conversation/${KEY}`, D = `vibespace://desktop/${DESK}`;
const TXT = `the report: [the report](${C}) — or bare ${D}. Gone: vibespace://conversation/claude:gone`;

console.log('③ THE CHAT: the renderer\'s option — on at the conversation\'s own words, off everywhere else; THE drawing');
const [CR, DOOR] = await bundle(['src/lib/chat-renderers.js', 'src/lib/internal-link-door.js']);
{
  const calls = [];
  DOOR.registerInternalLinks(doorOf(calls));
  const r = mkR(CR);
  const on = r.renderMarkdown(TXT, { vsLinks: true }), off = r.renderMarkdown(TXT);
  ok(vsDoors(on) === 2 && gateOf(/data-vs-kind="conversation" data-vs-ref="claude:0e0e0e0e-1111-4222-8333-444455556666" title="Go to this conversation">/.test(on)) && verdictOf(/data-vs-kind="desktop" data-vs-ref="desk-mh3k2-a1b"/.test(on)),
    'ON: a markdown link and a bare link each become ONE .chat-vs-link (kind + key, no href)', on);
  ok((on.match(/<span class="vs-link-icon" aria-hidden="true"><svg/g) || []).length === 3, 'each drawn link (and the chip) carries an SVG icon — never an emoji', on);
  const showsAddress = (h) => /chat-vs-link"[^>]*><span class="vs-link-icon" aria-hidden="true"><svg\/><\/span>vibespace:/.test(String(h).replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>'));   // a drawn link whose words are an address
  ok(verdictOf(/the report<span class="vs-link-name">Research<\/span><\/span>/.test(on)), 'a LABELLED link: the real name follows in muted text when the label lacks it', on);
  ok(gateOf(/data-vs-kind="desktop" data-vs-ref="desk-mh3k2-a1b" title="Go to this desktop"><span class="vs-link-icon" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span>Desktop 2<\/span>\./.test(on)) && !showsAddress(on),
    'A PERSON NEVER READS AN ADDRESS: a BARE link is drawn as the target\'s real name with its icon (the full stop outside); no drawn link shows an address', on.slice(Math.max(0, on.indexOf('data-vs-kind="desktop"') - 10)).replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>'));
  // THE STREAMING FRAME (主开发 12:21Z a): a bare door still being written stays words until a character follows it
  const half = r.renderMarkdown(`still writing ${D}`, { vsLinks: true, streaming: true }), done = r.renderMarkdown(`still writing ${D} `, { vsLinks: true, streaming: true }), dot = r.renderMarkdown(`still writing ${D}.`, { vsLinks: true, streaming: true });
  ok(vsDoors(half) === 0 && !/vs-link-unknown/.test(half) && gateOf(/<span class="chat-link-words">vibespace:\/\/desktop\/desk-mh3k2-a1b<\/span>/.test(half)) && vsDoors(done) === 1 && vsDoors(dot) === 1 && vsDoors(r.renderMarkdown(`still writing ${D}`, { vsLinks: true })) === 1,
    'STREAMING: a bare door at the very end stays words (no half-written address beside an «unknown» chip); a space or a full stop after it ⇒ drawn; the final render draws it', { half, done });
  const [SM, SD] = await bundle(['src/lib/chat-renderers.js', 'src/lib/internal-link-door.js'], (src) => src.replace('      if (vsLinks && streaming) html = streamTailWords(html, text);', ''));
  SD.registerInternalLinks(doorOf([]));
  const halfMut = mkR(SM).renderMarkdown(`still writing vibespace://conversation/claude:0e0e`, { vsLinks: true, streaming: true });
  ok(gateOf(/vs-link-unknown/.test(halfMut)) && verdictOf(/vibespace:\/\/conversation\/claude:0e0e/.test(halfMut)), 'RED CONTROL: without the tail rule a half-written key shows its address beside «unknown conversation»', halfMut);
  const unsure = r.renderMarkdown('see vibespace://conversation/claude:unsure now', { vsLinks: true });
  ok(gateOf(/data-vs-ref="claude:unsure"[^>]*><span class="vs-link-icon"[\s\S]*?<\/span>conversation<\/span> now/.test(unsure)) && !/>vibespace:/.test(unsure), 'a bare link to a target the page has not read yet: what it is («conversation»), never its address', unsure);
  ok(gateOf(/<span class="vs-link-unknown">.*?vibespace:\/\/conversation\/claude:gone <span class="vs-link-chip">unknown conversation<\/span><\/span>/.test(on)) && !/data-vs-ref="claude:gone"/.test(on),
    'a target this page does not have: the chip «unknown conversation» — no .chat-link, no key: nothing to press', on);
  const named = r.renderMarkdown(`[Open Research](${C})`, { vsLinks: true });
  ok(vsDoors(named) === 1 && !/vs-link-name/.test(named), 'a label that holds the real name gets no second copy of it', named);
  ok(vsDoors(off) === 0 && !/vs-link|data-vs-/.test(off) && !pathy(off) && gateOf(/<span class="chat-link-words">vibespace:\/\/desktop\/desk-mh3k2-a1b<\/span>/.test(off)) && verdictOf(/the report: the report — or bare/.test(off)),
    'OFF (the default): a bare run is words (never a path), a labelled link is its label — no door, no chip', off);
  const hand = r.renderMarkdown(`[y](#vs-to-conversation-${KEY})`);
  ok(!/vs-link|data-vs-/.test(hand) && verdictOf(/<p>y<\/p>/.test(hand)), 'OFF: a hand-written mark is its label', hand);
  const auto = r.renderMarkdown(`<${C}>`, { vsLinks: true }), code = r.renderMarkdown('`' + D + '`', { vsLinks: true });
  ok(vsDoors(auto) === 1 && vsDoors(code) === 1 && gateOf(/<code>/.test(code)) && gateOf(/<\/span>Research<\/span>/.test(auto)) && verdictOf(/<\/span>Desktop 2<\/span>/.test(code)), 'an autolink and a code span are doors too (as the settings row) — each drawn as its real name', { auto, code });
  const [BARE_MUT] = await bundle(['src/lib/internal-link-door.js'], (src) => src.replace("  if (textOf(innerHtml).trim().toLowerCase() === linkOf(kind, ref).toLowerCase()) return", "  if (false) return"), /internal-link-door\.js$/);
  BARE_MUT.registerInternalLinks(doorOf([]));
  const mutBare = BARE_MUT.vsLinkHtml('desktop', DESK, D, { cls: 'chat-link chat-vs-link' });
  ok(gateOf(showsAddress(mutBare)) && verdictOf(/<span class="vs-link-name">Desktop 2/.test(mutBare)), 'RED CONTROL: a drawing without the bare rule shows the address (the leg above reads it)', mutBare);
  const sub = r.renderMarkdown('[`0e0e0e0e-1111-4222-8333-444455556666`](conversation://0e0e0e0e-1111-4222-8333-444455556666)', { vsLinks: true });
  ok(gateOf(/chat-sub-link/.test(sub)) && !/chat-vs-link/.test(sub), 'the vendor\'s conversation:// stays the sub-agent link (not this scheme)', sub);
  ok(verdictOf([on, off, auto, code].every((h) => !pathy(h))), 'the leading-slash path rule never links a run\'s //… tail');
  const peer = r._peerBodyHtml({ id: 'p' }, TXT, 'a peer').html, job = r._renderVibespaceNotice({ id: 'j', peerFrom: 'VibeSpace' }, `Background work finished.\n${TXT}`).innerHTML, tool = r.linkifyText(TXT);
  const own = r.renderAssistantMsg({ id: 'a', role: 'assistant', status: 'complete', content: [{ type: 'text', text: TXT }] }).innerHTML;
  ok(vsDoors(peer) === 0 && vsDoors(job) === 0 && vsDoors(tool) === 0 && ![peer, job, tool].some(pathy), 'a PEER\'s body, a JOB\'s record and a TOOL\'s words draw none (and no path)', { peer, job, tool });
  ok(vsDoors(own) === 2, 'the REAL assistant-text block draws them (the option on there)', own);
  // the press: the chat's delegation — a click GOES, a right-click offers the menu; neither copies
  const span = { dataset: { vsKind: 'conversation', vsRef: KEY }, classList: { contains: (c) => c === 'chat-link' || c === 'chat-vs-link' } };
  const tgt = { closest: (sel) => (/^\.chat-vs-link\[data-vs-ref\]$/.test(sel) || sel === '.chat-link' ? span : null) };
  r.setupLinkHandler();
  const list = r._messageList;
  const ev = { target: tgt, clientX: 7, clientY: 8, preventDefault() { this.dp = 1; }, stopPropagation() { } };
  list._ls.click(ev); list._ls.contextmenu({ ...ev });
  ok(JSON.stringify(calls) === JSON.stringify([['press', 'conversation', KEY, 7], ['menu', 'conversation', KEY, 7]]) && ev.dp === 1, 'the chat: a press GOES through the page\'s door, a right-click / long-press opens Go · Copy link', calls);
}

console.log('④ THE ONE RULE, red: the option flipped on where a peer, a job or a tool wrote');
{
  const MUT = (src) => src.replace("demoteHeadings(this.renderMarkdown(String(text || '').trim()))", "demoteHeadings(this.renderMarkdown(String(text || '').trim(), { vsLinks: true }))")
    .replace('  linkifyText(text, opts = {}) {', '  linkifyText(text, opts = { vsLinks: true }) {');
  const src = read('src/lib/chat-renderers.js');
  ok(MUT(src) !== src && MUT(src).split('vsLinks: true').length - src.split('vsLinks: true').length === 2, 'the mutants\' needles are in this tree');
  const [MR, MD] = await bundle(['src/lib/chat-renderers.js', 'src/lib/internal-link-door.js'], MUT);
  MD.registerInternalLinks(doorOf([]));
  const r = mkR(MR);
  const peer = r._peerBodyHtml({ id: 'p' }, TXT, 'a peer').html, job = r._renderVibespaceNotice({ id: 'j', peerFrom: 'VibeSpace' }, `Background work finished.\n${TXT}`).innerHTML, tool = r.linkifyText(TXT);
  ok(vsDoors(peer) > 0 && vsDoors(job) > 0 && vsDoors(tool) > 0, 'RED CONTROL: on at the peer body ⇒ a peer\'s words and a job\'s record draw doors; on at linkifyText ⇒ a tool\'s output does', { peer: vsDoors(peer), job: vsDoors(job), tool: vsDoors(tool), jobHtml: job.slice(0, 300), toolHtml: tool.slice(0, 300) });
  // a HAND-DRAWN span: the sanitizer keeps no product class and no data attribute on what somebody else wrote
  const SH = await import(path.join(REPO, 'src/lib/safe-html.js')).catch(() => null);
  const kept = SH ? SH.keptClass('span', 'chat-link chat-vs-link') : 'n/a';
  ok(gateOf(SH) && kept === '' && gateOf(SH.SAFE_HTML_CONFIG) && SH.SAFE_HTML_CONFIG.ALLOW_DATA_ATTR === false, 'a hand-drawn `<span class="chat-link chat-vs-link" data-vs-ref=…>` keeps neither its class nor its data attribute (safe-html, untouched)', { kept });
  const shSrc = read('src/lib/safe-html.js');
  const loose = shSrc.replace("const CLASS_TAGS = new Set(['code', 'pre']);", "const CLASS_TAGS = new Set(['code', 'pre', 'span']);").replace('const CLASS_TOKEN = /^language-[A-Za-z0-9_+#.-]{1,40}$/;', 'const CLASS_TOKEN = /^[\\w-]+$/;');
  const LM = loose !== shSrc ? await import('data:text/javascript,' + encodeURIComponent(loose.replace(/^import .*$/gm, ''))).catch((e) => ({ err: String(e) })) : null;
  ok(gateOf(LM) && typeof LM.keptClass === 'function' && LM.keptClass('span', 'chat-link chat-vs-link') !== '', 'RED CONTROL: a sanitizer that kept a span\'s class lets the hand-drawn span through (the leg above reads it)', LM && LM.err);
  const cr = read('src/lib/chat-renderers.js');
  ok(gateOf(cr.includes("      let html = sanitizeHtml(this._fileHrefs(marked.parse(text || '')));\n")) && !/vs-link|vibespace|internal-link/.test(shSrc), 'THE SANITIZE LINE is byte-identical and safe-html.js names no part of this scheme (its config untouched)');
}

console.log('⑤ FOR YOU: the same grammar — its option (`has`), its drawing, its press');
{
  const [FY, DOOR, ROW] = await bundle(['src/lib/foryou-links.js', 'src/lib/internal-link-door.js', 'src/lib/user-todos-row.js']);
  const calls = [];
  DOOR.registerInternalLinks(doorOf(calls));
  const segs = FY.segmentText(TXT.replace('[the report](' + C + ')', C), { has }).filter((g) => g.t === 'link');
  ok(segs.length === 3 && segs[0].kind === 'conversation' && segs[0].ref === KEY && segs[1].kind === 'desktop' && segs[1].ref === DESK && segs[2].ref === 'claude:gone', 'the For-you segmenter has the kinds `conversation` and `desktop` (its option on; a well-shaped key the page lacks is drawn as the chip)', segs);
  ok(FY.segmentText(C).filter((g) => g.t === 'link').length === 0, 'its option off (no `has` — the vault plan): no door, and no path of its tail', FY.segmentText(C));
  const words = ROW.wordsHtml(`go ${C} or ${D}`);
  ok(gateOf(/<span class="fy-link" role="link" tabindex="0" data-fy="conversation" data-ref="claude:0e0e0e0e-1111-4222-8333-444455556666" title="Go to this conversation"><span class="vs-link-icon"[\s\S]*?<\/span>Research<\/span>/.test(words)) && gateOf(/<\/span>Desktop 2<\/span>/.test(words)) && !/>vibespace:/.test(words),
    'an item\'s words (wordsHtml): THE drawing — a keyboard-reachable .fy-link with its icon, a bare link as the real name (never an address)', words);
  const evil = DOOR.vsLinkHtml('conversation', KEY, 'x', { cls: 'fy-link', target: { state: 'known', name: '<img src=x onerror=alert(1)>' } });
  ok(!/<img/.test(evil) && verdictOf(/&lt;img/.test(evil)), 'the drawing escapes the real name (a name is somebody\'s words)', evil);
  ok(JSON.stringify(FY.linkTarget('conversation', KEY)) === JSON.stringify({ open: 'conversation', key: KEY }) && JSON.stringify(FY.linkTarget('desktop', DESK)) === JSON.stringify({ open: 'desktop', id: DESK }) && FY.linkTarget('conversation', 'nope') === null,
    'its target: the key / the id (a misshapen one is no target)');
  const act = read('src/lib/user-todos-actions.js');
  ok(gateOf(/if \(tg\.open === 'conversation' \|\| tg\.open === 'desktop'\) \{ pressInternalLink\(tg\.open, tg\.key \|\| tg\.id, at\); return true; \}/.test(act)) && verdictOf(/model\.openLink\(it, fy\.dataset\.fy, fy\.dataset\.ref, \{ x: e\.clientX, y: e\.clientY, el: fy \}\)/.test(read('src/lib/user-todos-panel.js'))),
    'a press in the tray goes through the SAME door (the point of the press rides along for the menu)');
  const fyEl = { dataset: { fy: 'desktop', ref: DESK } };
  const handled = DOOR.fyLinkMenu({ target: { closest: () => fyEl }, clientX: 3, clientY: 4, preventDefault() { }, stopPropagation() { } });
  ok(handled === true && JSON.stringify(calls.at(-1)) === JSON.stringify(['menu', 'desktop', DESK, 3]), 'a right-click / long-press on an item\'s link: Go · Copy link', calls);
}

console.log('⑥ THE PRESS (src/lib/internal-link-ui.js) over a recorded page — every act is the page\'s own door; nothing sends, ends, archives or grants');
{
  const [UI] = await bundle(['src/lib/internal-link-ui.js']);
  const LOGS = [];
  const page = ({ rows = [], wins = {}, held = null, desks = [{ id: 'd1', name: 'Desktop 1' }, { id: DESK, name: 'Desktop 2' }] } = {}) => {
    const log = [];
    const rec = (name) => (...a) => { log.push([name, ...a]); };
    const sessions = new Map(Object.entries(wins).map(([w, v]) => [w, { sessionId: v.serverId || null }]));
    const windows = new Map(Object.entries(wins).map(([w, v]) => [w, { _openSpec: { backend: 'claude', backendSessionId: v.cid } }]));
    const app = {
      sessions, wm: { windows },
      sidebar: { _allSessions: rows, _getSessionStateKey: (s) => `${s.backend || 'claude'}:${s.sessionId}`, getCustomName: () => '', isArchived: (s) => !!s.archived },
      desktopManager: { desktops: desks, activeDesktopId: 'd1', heldRowOf: () => held, switchTo: (id) => { log.push(['switchTo', id]); return Promise.resolve(); } },
      goToWinId: rec('goToWinId'), attachSession: rec('attachSession'), attachTmuxSession: rec('attachTmuxSession'), resumeSession: rec('resumeSession'), viewSession: rec('viewSession'), openSettingAt: rec('openSettingAt'),
    };
    const trap = new Proxy(app, { get: (o, k) => { if (!(k in o)) log.push(['UNEXPECTED', String(k)]); return o[k]; } });
    const io = { toast: (w) => log.push(['toast', w]), menu: (x, y, items) => { log.push(['menu', items.map((i) => i.label)]); io.items = items; io.at = [x, y]; }, copy: (s) => { log.push(['copy', s]); return Promise.resolve(); } };
    LOGS.push(log);
    return { app: trap, log, io };
  };
  const CID = KEY.slice('claude:'.length);
  const row = (o) => ({ backend: 'claude', sessionId: CID, cwd: '/w/p', name: 'Research', ...o });
  const go = (p, kind = 'conversation', ref = KEY) => { UI.pressLink(p.app, kind, ref, { x: 1, y: 2 }, p.io); return p.log; };
  let p = page({ rows: [row({ webuiId: 'srv1', status: 'live' })], wins: { w1: { serverId: 'srv1', cid: CID } } });
  ok(JSON.stringify(go(p)) === JSON.stringify([['goToWinId', 'w1']]), 'a built window ⇒ goToWinId (its desktop, its tab, the flash) and nothing else', p.log);
  p = page({ rows: [row({ status: 'stopped' })], wins: { w2: { cid: CID } } });
  ok(JSON.stringify(go(p)) === JSON.stringify([['goToWinId', 'w2']]), 'ENDED with a window ⇒ its history; nothing starts', p.log);
  p = page({ rows: [row({ status: 'stopped' })], held: { desk: DESK, id: 'w9' } });
  go(p); await new Promise((r) => setTimeout(r, 5));
  ok(JSON.stringify(p.log[0]) === JSON.stringify(['switchTo', DESK]) && !p.log.some((e) => /resume|attach/i.test(e[0])), 'its row on a desktop not built ⇒ switch there', p.log);
  p = page({ rows: [row({ webuiId: 'srv3', status: 'live', webuiName: 'Research' })] });
  go(p);
  ok(p.log[0][0] === 'attachSession' && p.log[0][1] === 'srv3' && JSON.stringify(p.log[1]) === JSON.stringify(['toast', 'Opened on Desktop 1 — it had no window.']), 'running with no window ⇒ it opens on the desktop on show, and a toast says which', p.log);
  p = page({ rows: [row({ status: 'stopped' })] });
  go(p);
  ok(JSON.stringify(p.log) === JSON.stringify([['menu', ['Resume here', 'Read its history']]]), 'ENDED with no window ⇒ the two-item menu at the link — nothing starts on the press itself', p.log);
  p.io.items[0].action(); p.io.items[1].action();
  const rs = p.log.find((e) => e[0] === 'resumeSession'), vs = p.log.find((e) => e[0] === 'viewSession');
  ok(gateOf(rs) && rs[1] === CID && rs[2] === '/w/p' && gateOf(rs[4]) && rs[4].backend === 'claude' && !('initialMessage' in rs[4]) && rs.length === 5 && gateOf(vs) && vs[1] === CID,
    '«Resume here» = the page\'s own resume with the row\'s options and NO first message; «Read its history» = the read-only view', p.log);
  p = page({ rows: [row({ status: 'stopped', archived: true })] });
  ok(JSON.stringify(go(p)) === JSON.stringify([['toast', 'This conversation is archived — open it from the archived list in the sidebar.']]), 'archived ⇒ a toast naming the door', p.log);
  p = page({ rows: [row({ status: 'tmux', tmuxTarget: 'main:2' })] });
  ok(JSON.stringify(go(p)) === JSON.stringify([['attachTmuxSession', 'main:2', 'Research', '/w/p']]), 'running in a tmux pane ⇒ attached the sidebar\'s way (主开发 12:21Z h — never an error toast while the sidebar attaches it)', p.log);
  p = page({ rows: [row({ status: 'external' })] });
  ok(JSON.stringify(go(p)) === JSON.stringify([['toast', 'This session is running outside VibeSpace']]), 'running outside VibeSpace with nothing to attach ⇒ the page\'s own sentence', p.log);
  p = page({ rows: [row({ status: 'stopped' })] });
  UI.pressLink(p.app, 'conversation', KEY, { x: 0, y: 0, el: { getBoundingClientRect: () => ({ left: 40, bottom: 60 }) } }, p.io);
  ok(JSON.stringify(p.io.at) === '[40,60]', 'Enter on an ENDED conversation\'s link (a click with no point) opens the menu AT THE LINK, never the page\'s corner (主开发 12:21Z e)', p.io.at);
  p = page({ rows: [] });
  ok(JSON.stringify(go(p)) === JSON.stringify([['toast', 'unknown conversation']]), 'a key the page has no row for ⇒ «unknown conversation»', p.log);
  p = page(); ok(JSON.stringify(go(p, 'desktop', DESK)) === JSON.stringify([['switchTo', DESK]]), 'a desktop ⇒ switch to it', p.log);
  p = page(); ok(JSON.stringify(go(p, 'desktop', 'desk-gone')) === JSON.stringify([['toast', 'unknown desktop']]), 'a desktop the page lacks ⇒ «unknown desktop»', p.log);
  p = page(); ok(JSON.stringify(go(p, 'setting', SETK)) === JSON.stringify([['openSettingAt', SETK]]), 'a setting ⇒ Settings on its row', p.log);
  p = page();
  UI.linkMenu(p.app, 'desktop', DESK, { x: 1, y: 2 }, null, p.io);
  await p.io.items[1].action();
  ok(JSON.stringify(p.log) === JSON.stringify([['menu', ['Go', 'Copy link']], ['copy', `vibespace://desktop/${DESK}`]]), 'right-click / long-press: «Go» · «Copy link» — the copy is the link as the list prints it', p.log);
  const unexpected = () => LOGS.flat().filter((e) => e[0] === 'UNEXPECTED');
  ok(LOGS.length >= 12 && unexpected().length === 0, `every press above (${LOGS.length} pages) touched only the doors the table names — the page is a trap that logs any other member as UNEXPECTED`, unexpected());
  const q = page(); void q.app.ws;   // RED CONTROL: a press that reached for the socket
  ok(unexpected().length === 1 && unexpected()[0][1] === 'ws', 'RED CONTROL: a reach for any other member (the socket) is logged and turns the leg above red', unexpected());
  const uiSrc = read('src/lib/internal-link-ui.js');
  ok(!/\bws\.send\(|fetch\(|fetchJson\(|endConversation|toggleArchive|\.archive\(|grant|sendMessage|initialMessage/.test(uiSrc.replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '')),
    'A PRESS NEVER SENDS, ENDS, ARCHIVES OR GRANTS: the press module calls no socket, no route, no end, no archive, no grant, no first message');
  const MUT = uiSrc.replace("    app.attachSession(s.webuiId,", "    app.ws.send({ type: 'input', sessionId: s.webuiId, data: 'x' }); app.attachSession(s.webuiId,");
  ok(MUT !== uiSrc && verdictOf(/\bws\.send\(/.test(MUT.replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, ''))), 'RED CONTROL: a press that typed into the conversation is caught by the leg above');
}

console.log('⑦ THE WORDS: three languages, and never «sleep»');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const KEYS = ['Go', 'Go to this desktop', 'unknown conversation', 'unknown desktop', 'link::Resume here', 'Read its history', 'Opened on {desktop} — it had no window.', 'This conversation is archived — open it from the archived list in the sidebar.', 'Go to this conversation', 'Copy link'];
  const val = (src, k) => { const m = new RegExp(`\\n\\s*["']${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']: ["']([^"']*)["']`).exec(src); return m ? m[1] : null; };
  const missing = KEYS.filter((k) => !val(zh, k) || !val(ja, k));
  ok(missing.length === 0, 'every word a person reads on a link has a zh AND a ja row (the link\'s «Resume here» under its own context — the desktop app\'s is another word)', missing);
  ok(val(zh, 'link::Resume here') === '在这里恢复' && val(ja, 'link::Resume here') === 'ここで再開' && val(zh, 'unknown desktop') === '未知桌面', 'the design\'s own renderings');
  const SLEEP = /sleep|asleep|hibernat|suspend|pause|睡眠|休眠|挂起|暂停|スリープ|休止/i;
  const said = KEYS.flatMap((k) => [k, val(zh, k), val(ja, k)]).join('\n') + '\n' + manualPara();
  ok(!SLEEP.test(said), 'NONE of this piece\'s words says sleep (en / zh / ja, and the manual\'s paragraph)', said.match(SLEEP));
  ok(gateOf(SLEEP.test(said + '\nOpened on {desktop} — it was asleep.')) && verdictOf(SLEEP.test('它已休眠')), 'RED CONTROL: a planted «asleep» / «休眠» is caught by the same grep');
}
// the paragraph of the LINK FORM (the manager stack's resume section names the bare address earlier in the manual)
function manualPara() { const m = read('docs/agent/automation-manual.md'); const i = m.indexOf('](vibespace://conversation/'); return i < 0 ? '' : m.slice(Math.max(0, m.lastIndexOf('\n\n', i)), m.indexOf('\n\n', i) < 0 ? m.length : m.indexOf('\n\n', i)); }

console.log('⑧ HOW AGENTS LEARN IT: one paragraph in the manual; NOTHING added to the session intro (it is at its byte cap)');
{
  const para = manualPara();
  ok(gateOf(/\[[^\]]+\]\(vibespace:\/\/conversation\/<key>\)/.test(para)) && gateOf(/vibespace:\/\/desktop\/<id>/.test(para)) && verdictOf(/takes the person there/.test(para)), 'docs/agent/automation-manual.md: the one paragraph — put the row\'s link in the reply; the chat makes it a button that takes the person there', para);
  const routes = read('src/agent-routes.js');
  const intro = routes.slice(routes.indexOf('sessionToolsIntro'), routes.indexOf('sessionToolsIntro') + 20000);
  ok(gateOf(routes.includes('sessionToolsIntro')) && !/vibespace:\/\/(conversation|desktop)/.test(routes), 'the session intro (agent-routes) names neither link form');
  ok(verdictOf(/vibespace:\/\/conversation/.test(intro + '\nput vibespace://conversation/<key> in your reply')), 'RED CONTROL: an intro that carried the form is caught');
}

console.log(fail ? `✗ test-internal-links: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
