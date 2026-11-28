#!/usr/bin/env node
// LANE DIGIT-ZERO (主开发 2026-11-17 — the owner's own agent typed a date into a web form's native date field: `fill` answered
// «Done» over an EMPTY field, `keyboard type` landed nothing it could use). WHAT AN AGENT TYPES ARRIVES, AND A FILL THAT CANNOT
// SET A FIELD SAYS SO. MEASURED on the pinned driver (agent-browser 0.38.2, Chrome 154 — headless, headed and through the real
// cdp-mediator): `fill` / `type` / `keyboard type` reach the page as Input.insertText, which a native date / time field takes
// none of, and the driver answers «✓ Done»; `press Digit0` (a key's code) types nothing. Fast, in-process, PURE + patched copies:
//   ① readBackPlan — which commands are read back (fill / type <sel> <text>, keyboard type | inserttext <text>; never a vault
//     fill, a batch, extra words)
//   ② keyNameVerdict — a press of a key's CODE (Digit0, KeyA, in a chord) refused with the key's name; a key's name passes
//   ③ FIELD_FORMS — each kind's own form; the forms an agent writes that a field cannot take
//   ④ the page-side JS (fieldProbeJs / fieldSetJs) evaluated over a fake DOM: what the probe answers (a password's value never
//     leaves the page), the setter through the field's OWN window's native setter + input / change
//   ⑤ readBack over a FAKE page per kind (the probe's own answer shape): the setter's success read back, the form refused by
//     name, a value the field refuses, a locked field, nothing landed, a different value said, a type that holds a line break
//     not judged, an unreadable field said under the driver's answer, the --json answer
//   ⑥ WIRING in data/bin/vibespace-browser: the key's-code refusal before anything runs; the read-back after a 0 answer and
//     BEFORE the audit, never for a vault fill / a batch / a read-fenced tab, its driver call bounded
//   r2 (主开发 23:28Z, THE MUST): the verb's TARGET is judged, never what holds the focus after it — a one-time-code box that
//   moves the focus on, a card number that jumps to the expiry, an earlier date field; an empty fill clears; each kind compared
//   in its normal form; a failed run is never the field's refusal; the answer read whole; ONE 10 s bound; the cost counted.
//   B-7108 (box, test-browser-live ⑫): Chrome's tree can give a native date field NO @ref of its own, only its parts (spinbuttons
//   «Month» / «Day» / «Year»): a fill by a part's @ref set nothing and answered exit 0 [read_back_unavailable]. Now REFUSED
//   [field_part] with the recipe — the whole field by its own selector — when the part's box lies inside the focused field's.
//   RED CONTROLS (patched copies, the tree untouched): a readBack that trusts the driver (the release's behaviour — Done over
//   an empty date field) fails ⑤; the read-back that judges the FOCUSED field (68da75fa2) fails the three scenes; a wrapper
//   without the read-back hook fails ⑥.
// The REAL road (the real keeper + mediator + a headed Chrome + the real driver) is test-browser-live ⑫, heavy.
// Zero vendor calls; no browser; no spawn.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { mutantCopies, treeLitter } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const V = require('../src/browser-verbs.js');      // which commands are read back, a key's code
const RB = require('../src/browser-read-back.js'); // the read-back itself (its own file: the device bundle never carries it)
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

console.log('① readBackPlan — which commands are read back');
{
  const rows = [
    [['fill', '#d', '2027-01-07'], { verb: 'fill', sel: '#d', asked: '2027-01-07' }],
    [['type', '@e3', '0123456789'], { verb: 'type', sel: '@e3', asked: '0123456789' }],
    [['keyboard', 'type', '01072027'], { verb: 'keyboard type', sel: null, asked: '01072027' }],
    [['keyboard', 'inserttext', '0'], { verb: 'keyboard inserttext', sel: null, asked: '0' }],
    [['--json', 'fill', '#t', '0'], { verb: 'fill', sel: '#t', asked: '0' }],
    [['fill', '#t', '0', '--json'], { verb: 'fill', sel: '#t', asked: '0' }],
    [['fill', '@e1', '--vault', 'example.com/password'], null],
    [['fill', '@e2', '--vault', 'new:example.com#a/password', '--generate'], null],
    [['fill', '#t'], null],
    [['fill', '#t', 'two', 'words'], null],
    [['keyboard', 'type'], null],
    [['press', '0'], null],
    [['batch', 'fill #t 0'], null],
    [['click', '#t'], null],
  ];
  const bad = rows.filter(([argv, want]) => JSON.stringify(V.readBackPlan(argv)) !== JSON.stringify(want)).map(([argv, want]) => `${argv.join(' ')} → ${JSON.stringify(V.readBackPlan(argv))}, want ${JSON.stringify(want)}`);
  ok(bad.length === 0, `fill / type <sel> <text> and keyboard type | inserttext <text> are read back (flags anywhere); a vault fill, a batch, a missing or extra word, any other verb is not (${rows.length} rows)`, bad);
}

console.log('② keyNameVerdict — a key\'s CODE types nothing; its NAME is asked for');
{
  const codes = [[['press', 'Digit0'], 'vibespace-browser press 0'], [['press', 'Digit7'], 'vibespace-browser press 7'], [['press', 'KeyA'], 'vibespace-browser press a'], [['press', 'Control+KeyA'], 'vibespace-browser press Control+a'], [['key', 'Digit0'], 'vibespace-browser key 0'], [['keydown', 'Shift+KeyZ'], 'vibespace-browser keydown Shift+z'], [['--json', 'press', 'Digit0'], 'vibespace-browser press 0']];
  const bad = codes.filter(([argv, remedy]) => { const v = V.keyNameVerdict(argv); return !v || v.code !== 'key_code_name' || v.remedy !== remedy || !/NAME, not its code/.test(v.error) || !/type nothing/.test(v.error); }).map(([argv]) => `${argv.join(' ')} → ${JSON.stringify(V.keyNameVerdict(argv))}`);
  ok(bad.length === 0, `a press / key / keydown of a key's code (Digit0, KeyA, in a chord) is refused [key_code_name] with the key's name as the remedy (${codes.length} rows)`, bad);
  const names = [['press', '0'], ['press', 'a'], ['press', 'Enter'], ['press', 'Tab'], ['press', 'Control+a'], ['press', 'ArrowDown'], ['press', 'Digit'], ['press', 'Keys'], ['press', 'F1'], ['click', 'Digit0'], ['fill', '#t', 'Digit0'], ['press']];
  const wrong = names.filter((argv) => V.keyNameVerdict(argv) !== null).map((argv) => argv.join(' '));
  ok(wrong.length === 0, `a key's name passes — 0, a, Enter, Tab, Control+a, ArrowDown, F1 — and so does every other verb, a text «Digit0», a press with no key (${names.length} rows)`, wrong);
}

console.log('③ FIELD_FORMS — each kind holds its value in ONE form');
{
  const F = RB.FIELD_FORMS;
  const kinds = ['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'];
  ok(gateOf(kinds.every((k) => F[k] && F[k].re.test(F[k].example) && F[k].words.length > 3)) && Object.keys(F).length === kinds.length, `the seven kinds that take no typed text (${kinds.join(', ')}): each one's example is in its own form, each says its form in words`);
  const notForms = [['date', '01072027'], ['date', '01/07/2027'], ['date', '2027-1-7'], ['date', '7 January 2027'], ['time', '0905'], ['time', '9:05'], ['time', '09:05 AM'], ['datetime-local', '2027-01-07 09:05'], ['month', '01/2027'], ['week', '2027-01'], ['color', 'red'], ['color', '#36c'], ['range', 'half']];
  const bad = notForms.filter(([k, v]) => F[k].re.test(v)).map(([k, v]) => `${k} ${v}`);
  ok(bad.length === 0, `the forms an agent writes that a field cannot take are not its form — «01072027», «01/07/2027», «0905», «09:05 AM», «red» … (${notForms.length} rows)`, bad);
  const forms = [['date', '2027-01-07'], ['date', '12345-06-07'], ['time', '09:05:30'], ['time', '23:59:59.250'], ['datetime-local', '2027-01-07T09:05'], ['month', '2027-12'], ['week', '2027-W52'], ['color', '#A0b1C2'], ['range', '-2.5']];
  const missed = forms.filter(([k, v]) => !F[k].re.test(v)).map(([k, v]) => `${k} ${v}`);
  ok(missed.length === 0, `every value in a kind's own form passes the form (seconds, milliseconds, a five-digit year, an upper-case hex) — the FIELD then judges it (${forms.length} rows)`, missed);
}

console.log('④ the page-side JS over a fake DOM');
/** A fake page of fields by id (one may hold the focus, optionally inside a same-origin frame); a field's value setter takes
 *  what it accepts in its normal form (`norm`), else '' — or keeps its old value (`keep`) — like a browser's sanitizer. */
function fakePage(fields, { focused = null, inFrame = false, scroll = null, cssEscape = null, lies = false } = {}) {
  const events = [];
  const mkWin = () => {
    const proto = {};
    Object.defineProperty(proto, 'value', { get() { return this._v; }, set(v) { const s = String(v); if (s === '' || this._accept(s)) this._v = s === '' ? '' : this._norm(s); else if (!this._keep) this._v = ''; }, configurable: true });
    function Event(type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); }
    return { HTMLInputElement: { prototype: proto }, Event, CSS: { escape: cssEscape || ((x) => String(x).replace(/[^\w-]/g, (c) => '\\' + c)) }, scrollX: scroll ? scroll.x : 0, scrollY: scroll ? scroll.y : 0 };
  };
  const win = mkWin();
  const nodes = {};
  for (const [id, f] of Object.entries(fields)) {
    const r = f.rect || { x: 0, y: 0, width: 0, height: 0 };
    const node = { id: f.noId ? '' : (f.id ?? id), name: f.name || '', _rect: r, getBoundingClientRect: () => ({ left: r.x, top: r.y, width: r.width, height: r.height }), tagName: (f.tag || 'input').toUpperCase(), type: f.kind, readOnly: !!f.readOnly, disabled: !!f.disabled, _v: f.noValue ? undefined : (f.value ?? ''), _accept: f.accept || (() => true), _norm: f.norm || ((x) => x), _keep: !!f.keep, ownerDocument: { defaultView: win }, dispatchEvent(e) { events.push(`${id}:${e.type}`); return true; } };
    Object.setPrototypeOf(node, win.HTMLInputElement.prototype);
    nodes[id] = node;
  }
  // B-7108's probe asks #id, input[name="…"] and input[type="…"] (a field without an id keeps its key in `nodes` only)
  const inputs = () => Object.values(nodes).filter((n) => n.tagName === 'INPUT');
  const all = (sel) => { let m; if (sel[0] === '#') { const raw = sel.slice(1).replace(/\\3([0-9]) /g, '$1').replace(/\\([^])/g, '$1'); return Object.values(nodes).filter((n) => n.id === raw); } if ((m = /^input\[(name|type)="([\w.:-]+)"\]$/.exec(sel))) return inputs().filter((n) => (m[1] === 'name' ? n.name : n.type) === m[2]); return null; };
  const doc = { activeElement: null, querySelectorAll(sel) { if (lies) return [doc.activeElement]; const a = all(sel); if (!a) throw new Error('not a selector: ' + sel); return a; }, querySelector(sel) { if (lies) return doc.activeElement; if (/^#[\w-]+$/.test(sel)) return nodes[sel.slice(1)] || null; if (/^[a-z]+$/i.test(sel)) return null; const a = all(sel); if (a) return a[0] || null; throw new Error('not a selector: ' + sel); } };
  const focus = (id) => { const n = nodes[id] || null; doc.activeElement = inFrame && n ? { tagName: 'IFRAME', contentDocument: { activeElement: n } } : n; };
  if (focused) focus(focused);
  const ctx = vm.createContext({ document: doc, window: win, JSON });
  return { run: (js) => vm.runInContext(js, ctx), nodes, doc, events, focus };
}
const probe = (p, asked, target) => JSON.parse(p.run(RB.fieldProbeJs(asked, target)));
{
  const p = fakePage({ d: { kind: 'date' } }, { focused: 'd' });
  const a = probe(p, '01072027');
  ok(a.tag === 'input' && a.kind === 'date' && a.has === true && a.equal === false && a.len === 0 && a.locked === false && a.value === '', 'the probe answers the field\'s tag, kind, value and length as a JSON string (the driver prints a string on one line), compared IN the page', a);
  const pw = fakePage({ p: { kind: 'password', value: 'hunter2-secret' } }, { focused: 'p' });
  const b = probe(pw, 'hunter2-secret');
  ok(b.kind === 'password' && b.value === null && b.equal === true && b.len === 14 && !JSON.stringify(b).includes('hunter2'), 'a password field\'s value never leaves the page — only equal / includes / its length', b);
  const two = fakePage({ otp1: { kind: 'text', value: '4' }, otp2: { kind: 'text', value: '' } }, { focused: 'otp2' });
  const t = probe(two, '4', { css: '#otp1' });
  ok(t.equal === true && t.value === '4', 'with a CSS target the probe reads THAT field (#otp1 holds the 4), not the focused one (#otp2, empty)', t);
  const bad = probe(two, '4', { css: 'text=Email' }), gone = probe(two, '4', { css: '#nope' });
  ok(bad.tag === null && bad.why === 'selector' && gone.tag === null && gone.why === 'missing', 'a selector the page cannot read answers why «selector», one it cannot find «missing» — never another field', { bad, gone });
  const fr = fakePage({ tm: { kind: 'time' } }, { focused: 'tm', inFrame: true });
  ok(probe(fr, '09:05').kind === 'time', 'the focused probe reaches a field focused inside a same-origin frame');
  const s = JSON.parse(fr.run(RB.fieldSetJs('09:05')));
  ok(s.set === true && s.value === '09:05' && s.before === '' && fr.nodes.tm._v === '09:05' && fr.events.join() === 'tm:input,tm:change', 'the setter goes through the field\'s OWN window\'s native value setter, fires input and change, answers before and after', { s, events: fr.events });
  const ex = fakePage({ d1: { kind: 'date', value: '2026-01-01' } }, { focused: 'd1' });
  const n = JSON.parse(ex.run(RB.fieldSetJs('2027-01-07', null, { kind: 'date', value: '' })));
  ok(n.set === false && n.why === 'not-target' && ex.nodes.d1._v === '2026-01-01', 'a setter told which field it must be (kind + value) sets nothing in another field — not-target', n);
  const lk = fakePage({ d: { kind: 'date', readOnly: true } }, { focused: 'd' });
  const l = JSON.parse(lk.run(RB.fieldSetJs('2027-01-07')));
  ok(l.set === false && l.locked === true && lk.nodes.d._v === '', 'a read-only field: the setter sets nothing and says locked', l);
  const none = JSON.parse(vm.runInContext(RB.fieldProbeJs('x'), vm.createContext({ document: { activeElement: null }, JSON })));
  ok(none.tag === null, 'nothing focused ⇒ the probe says so (tag null)', none);
  ok(RB.evalAnswer({ code: 0, out: JSON.stringify({ a: 1 }, null, 2) + '\n' }).a === 1 && RB.evalAnswer({ code: 0, out: 'noise\n' + JSON.stringify(JSON.stringify({ a: 2 })) + '\n' }).a === 2 && RB.evalAnswer({ code: 1, out: '{}' }) === null,
    'evalAnswer parses the WHOLE answer first (an object printed over several lines), then its last line; a failed run answers null');
  ok(RB.driverRead({ code: 0, out: '{"success":true,"data":{"value":"4"}}' }) === '4' && RB.driverRead({ code: 0, out: '{"success":true,"data":"4"}' }) === '4' && RB.driverRead({ code: 0, out: '✓ 4' }) === null && RB.driverRead({ code: 0, out: '{"success":true,"data":{"value":null}}' }) === null && RB.driverRead({ code: 0, out: '{"success":true,"data":{"value":null}}' }, { absentIsEmpty: true }) === '', RB.driverRead({ code: 0, out: '{"success":true,"data":{"name":"type","value":null}}' }, { absentIsEmpty: true }) === '' && RB.driverRead({ code: 0, out: '{"success":true,"data":{"name":"type","value":null}}' }) === null &&
    'driverRead takes only the driver\'s JSON answer — any other shape is UNREADABLE (null), never an empty field; an absent attribute is empty only when asked');
}

console.log('⑤ readBack over a fake page — the TARGET judged, kind by kind');
const realDate = (v) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
/** THE DRIVER'S OWN GRAMMAR, read from the help text the tree pins (scripts/fixtures/agent-browser-0.38.1 — the 0.38.1
 *  capture; 0.38.2 adds lines, removes no verb or flag): `get <sub> <places…>` from get.txt's Subcommands, `focus` / `eval`
 *  from their Usage lines. The stand-in below reads every argument BY THIS GRAMMAR and refuses a call it does not allow —
 *  so it cannot drift from the driver (the first cure's stand-in read `get attr` reversed, as the read-back sent it). */
const HELP = path.join(REPO, 'scripts/fixtures/agent-browser-0.38.1');
const GRAMMAR = (() => {
  const help = (v) => fs.readFileSync(path.join(HELP, v + '.txt'), 'utf8');
  const places = (s) => [...s.matchAll(/<([a-z-]+)>/g)].map((m) => m[1]);
  const get = {}; for (const m of help('get').matchAll(/^ {2}([a-z][\w-]*)((?: <[a-z-]+>)*) {2,}\S/gm)) get[m[1]] = places(m[2]);
  const usage = (v) => { const m = new RegExp(`^Usage: agent-browser ${v} (.*)$`, 'm').exec(help(v)); return m ? places(m[1]) : null; };
  return { get, focus: usage('focus'), eval: usage('eval') };
})();
const GLOBALS = new Set(['--json']);
/** → { verb, sub, named } when the help allows the call, else { refused: why } (a selector looks like one; a name is a name). */
function byGrammar(args) {
  const pos = args.filter((a) => !GLOBALS.has(a));
  const [verb, ...rest] = pos;
  let sub = null, want = null;
  if (verb === 'get') { sub = rest.shift(); want = GRAMMAR.get[sub]; if (!want) return { refused: `get has no subcommand «${sub}»` }; }
  else if (verb === 'focus' || verb === 'eval') want = GRAMMAR[verb];
  else return { refused: `the read-back has no business with «${verb}»` };
  if (!want || rest.length !== want.length) return { refused: `«${pos.join(' ')}» — the help says ${verb}${sub ? ' ' + sub : ''} ${(want || []).map((w) => `<${w}>`).join(' ')}` };
  const named = Object.fromEntries(want.map((w, i) => [w, rest[i]]));
  if ('name' in named && !/^[A-Za-z_][\w:.-]*$/.test(named.name)) return { refused: `«${pos.join(' ')}» — <name> «${named.name}» is no attribute name (the help: get attr <selector> <name>)` };
  return { verb, sub, named };
}
/** The driver over a fake page, every call read BY THE HELP'S GRAMMAR (a call it does not allow is refused and recorded):
 *  `eval` runs the page-side JS for real (④'s fake DOM) and prints its string; `focus` / `get value` / `get attr <selector>
 *  <name>` resolve a CSS id or an @ref (`refs`); `redirect` moves a focus elsewhere; `fail` = the run numbers that fail;
 *  `attrFails` = the attribute read fails; `pretty` prints an eval's object over several lines; `clock` + `cost` advance a
 *  fake clock per run. */
const REFUSED_CALLS = [];
function fakeDriver(page, { refs = {}, redirect = {}, fail = [], attrFails = false, pretty = false, clock = null, cost = 0, boxes = {}, boxFails = false } = {}) {
  const calls = [];
  const idOf = (sel) => refs[sel] || (/^#[\w-]+$/.test(sel) ? sel.slice(1) : null);
  const run = async (args, o) => {
    calls.push({ args, ms: o && o.ms });
    if (clock) clock.t += cost;
    const g = byGrammar(args);
    if (g.refused) { REFUSED_CALLS.push(g.refused); return { code: 1, out: '', err: '✗ ' + g.refused }; }
    if (fail.includes(calls.length)) return { code: 1, out: '', err: '✗ CDP command timed out' };
    if (g.verb === 'eval') { const v = page.run(g.named.script); return { code: 0, out: (pretty ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v)) + '\n', err: '' }; }
    const id = idOf(g.named.selector);
    if (!id || !page.nodes[id]) return { code: 1, out: '', err: '✗ element not found' };
    if (g.verb === 'focus') { page.focus(redirect[id] || id); return { code: 0, out: '✓ Done\n', err: '' }; }
    if (g.sub === 'value') return { code: 0, out: JSON.stringify({ success: true, data: { value: page.nodes[id]._v } }) + '\n', err: '' };
    if (g.sub === 'box') { const b = boxes[id] || page.nodes[id]._rect; if (boxFails || !b || !(b.width > 0)) return { code: 1, out: '', err: '✗ element has no box' }; return { code: 0, out: JSON.stringify({ success: true, data: b }) + '\n', err: '' }; }
    if (g.sub === 'attr') { if (attrFails) return { code: 1, out: '', err: '✗ CDP command timed out' }; return { code: 0, out: JSON.stringify({ success: true, data: { value: g.named.name === 'type' ? (page.nodes[id].type || null) : null } }) + '\n', err: '' }; }
    return { code: 9, out: '', err: 'not faked: ' + args.join(' ') };
  };
  return { run, calls };
}
async function judge(readBack, plan, page, opts = {}) { const d = fakeDriver(page, opts); const r = await readBack({ plan, run: d.run, json: !!opts.json, ...(opts.clock ? { now: () => opts.clock.t } : {}) }); return { r, d, page }; }
const DATE = (extra = {}) => ({ kind: 'date', accept: realDate, ...extra });
async function readBackCensus(readBack) {
  const bad = []; const cost = {};
  const say = (n, c, x) => { if (!c) bad.push(`${n}: ${JSON.stringify(x).slice(0, 360)}`); };
  let t;
  // ── the must: the TARGET, never what holds the focus after the verb ──
  t = await judge(readBack, { verb: 'fill', sel: '#otp1', asked: '4' }, fakePage({ otp1: { kind: 'text', value: '4' }, otp2: { kind: 'text' } }, { focused: 'otp2' }));
  say('scene 1: a one-time-code box that moved the focus to the empty next box — the fill LANDED: the driver\'s answer stands', t.r === null, t.r); cost['a CSS text fill'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '@e1', asked: '4' }, fakePage({ otp1: { kind: 'text', value: '4' }, otp2: { kind: 'text' } }, { focused: 'otp2' }), { refs: { '@e1': 'otp1' } });
  say('scene 1 by @ref: the driver\'s own value read of the target (4) — the answer stands', t.r === null && t.d.calls[0].args.join(' ') === 'get value @e1 --json', t.r); cost['an @ref text fill'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '#cc', asked: '4242424242424242' }, fakePage({ cc: { kind: 'text', value: '4242424242424242' }, exp: { kind: 'month' } }, { focused: 'exp' }));
  say('scene 2: a card number that jumped to the expiry (a month field) — never «a month field takes no typed text»', t.r === null, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d2', asked: '2027-03-04' }, fakePage({ d1: DATE({ value: '2026-01-01' }), d2: DATE() }, { focused: 'd1' }));
  say('scene 3: the focus on an EARLIER date field — the setter writes the field the agent NAMED, the other is untouched', t.r && t.r.code === 0 && t.r.as === 'field_setter' && t.page.nodes.d2._v === '2027-03-04' && t.page.nodes.d1._v === '2026-01-01', t.r);
  // ── the date road ──
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, fakePage({ d: DATE() }, { focused: 'd' }));
  say('a date fill ISO ⇒ the setter, read back, Done', t.r && t.r.code === 0 && t.r.as === 'field_setter' && /^✓ Done — the date field holds 2027-01-07, set through the field's own setter/.test(t.r.out) && t.page.nodes.d._v === '2027-01-07' && t.page.events.join() === 'd:input,d:change', t.r); cost['a CSS date fill'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '@e5', asked: '2027-01-07' }, fakePage({ d: DATE() }), { refs: { '@e5': 'd' } });
  say('a date fill by @ref ⇒ read through the driver (value, then its kind), focused, the setter checks it IS the target, Done', t.r && t.r.code === 0 && t.r.as === 'field_setter' && t.page.nodes.d._v === '2027-01-07' && t.d.calls.map((c) => c.args[0] + (c.args[1] && c.args[0] === 'get' ? ' ' + c.args[1] : '')).join(',') === 'get value,get attr,focus,eval', t.r); cost['an @ref date fill'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '@e5', asked: '2027-01-07' }, fakePage({ d: DATE(), d1: DATE({ value: '2026-01-01' }) }), { refs: { '@e5': 'd' }, redirect: { d: 'd1' } });
  say('a page that REDIRECTS the focus to another date field ⇒ the setter sees it is not the target: a note, nothing set anywhere', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note) && /not its target/.test(t.r.note) && t.page.nodes.d1._v === '2026-01-01' && t.page.nodes.d._v === '', t.r);
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '01072027' }, fakePage({ d: DATE() }, { focused: 'd' }));
  say('the owner\'s act: keyboard type 01072027 into the focused date field ⇒ SAID (exit 0, never «Done»): its form and the press recipe', t.r && t.r.code === 0 && t.r.as === 'field_form' && /^note: keyboard type ran, but a date field takes no typed text and holds its value as 2027-01-07/.test(t.r.out) && t.r.out.includes('press each digit') && !/Done/.test(t.r.out) && t.page.nodes.d._v === '', t.r); cost['a keyboard type into a date field (wrong form)'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '2027-01-07' }, fakePage({ d: DATE() }, { focused: 'd' }));
  say('keyboard type 2027-01-07 into the focused date field ⇒ the setter, Done', t.r && t.r.code === 0 && t.r.as === 'field_setter' && t.page.nodes.d._v === '2027-01-07', t.r); cost['a keyboard type into a date field (its form)'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '01/07/2027' }, fakePage({ d: DATE() }));
  say('a date fill of 01/07/2027 (the target read) ⇒ refused field_form naming fill \'#d\' 2027-01-07 (one shell word: an unquoted #d is a comment)', t.r && t.r.code === 1 && t.r.as === 'field_form' && t.r.out.includes("vibespace-browser fill '#d' 2027-01-07"), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-02-31' }, fakePage({ d: DATE() }));
  say('a date the field refuses (2027-02-31) ⇒ field_refused, what it holds said', t.r && t.r.code === 1 && t.r.as === 'field_refused' && t.r.out.includes('did not take "2027-02-31" (it holds "")'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-02-31' }, fakePage({ d: DATE({ value: '2027-01-01', keep: true }) }));
  say('a field that KEPT its old value ⇒ field_refused', t.r && t.r.code === 1 && t.r.as === 'field_refused' && t.r.out.includes('it holds "2027-01-01"'), t.r);
  // (a) an empty fill clears
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '' }, fakePage({ d: DATE({ value: '2027-01-07' }) }));
  say('(a) an EMPTY fill of a date field CLEARS it ⇒ Done, said cleared', t.r && t.r.code === 0 && t.r.as === 'field_cleared' && /is cleared/.test(t.r.out) && t.page.nodes.d._v === '', t.r);
  // (b) the kind's own normal form
  for (const [kind, asked, norm, accept] of [['time', '09:05:00', (v) => v.replace(/:00$/, ''), () => true], ['datetime-local', '2027-01-07T09:05:00', (v) => v.replace(/:00$/, ''), () => true], ['color', '#A0B1C2', (v) => v.toLowerCase(), () => true], ['range', '50.0', (v) => String(Number(v)), () => true]]) {
    t = await judge(readBack, { verb: 'fill', sel: '#x', asked }, fakePage({ x: { kind, norm, accept, value: kind === 'range' ? '20' : '' } }));
    say(`(b) ${kind} ${asked} stored as ${norm(asked)} ⇒ the same value in the kind's normal form: Done`, t.r && t.r.code === 0 && t.r.as === 'field_setter' && t.page.nodes.x._v === norm(asked), t.r);
  }
  t = await judge(readBack, { verb: 'fill', sel: '#r', asked: '55' }, fakePage({ r: { kind: 'range', value: '20', norm: () => '50' } }));
  say('(b) a range the control adjusted (55 → 50, not its old 20) ⇒ field_differs SAID, exit 0', t.r && t.r.code === 0 && t.r.as === 'field_differs' && t.r.out.includes('holds "50"'), t.r);
  for (const [kind, v] of [['month', '2027-01'], ['week', '2027-W01']]) { t = await judge(readBack, { verb: 'fill', sel: '#x', asked: v }, fakePage({ x: { kind } })); say(`${kind} fill ${v} ⇒ the setter`, t.r && t.r.as === 'field_setter' && t.page.nodes.x._v === v, t.r); }
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, fakePage({ d: DATE({ readOnly: true }) }));
  say('a read-only date field ⇒ field_locked, the setter never runs', t.r && t.r.code === 1 && t.r.as === 'field_locked' && t.d.calls.length === 1, t.r);
  // (c) a run that fails is never the field's refusal
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, fakePage({ d: DATE() }), { fail: [2] });
  say('(c) the setter\'s OWN run fails ⇒ read_back_unavailable (exit 0, the check to run) — never «refused by the field»', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note) && /own setter could not be run/.test(t.r.note) && !t.r.code, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0' }, fakePage({ t: { kind: 'text' } }), { fail: [1] });
  say('(c) the probe fails ⇒ a note under the driver\'s answer', t.r && t.r.note && t.r.note.includes("vibespace-browser get value '#t'"), t.r);
  // (d) the whole answer
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, fakePage({ d: DATE() }), { pretty: true });
  say('(d) an eval answer printed over several lines is read whole ⇒ Done', t.r && t.r.as === 'field_setter', t.r);
  // (e) one bound for all the runs together
  { const clock = { t: 0 };
    t = await judge(readBack, { verb: 'fill', sel: '@e5', asked: '2027-01-07' }, fakePage({ d: DATE() }), { refs: { '@e5': 'd' }, clock, cost: 6000 });
    const ms = t.d.calls.map((c) => c.ms);
    say('(e) ONE 10 s bound over all the runs: each run is handed what is left (10 s, then 4 s), none starts past it, the answer is the note', t.r && t.r.note && ms[0] === 10000 && ms[1] === 4000 && t.d.calls.length === 2, { r: t.r, ms }); }
  // ── another field ──
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0123456789' }, fakePage({ t: { kind: 'text', value: '0123456789' } }));
  say('a text fill that landed ⇒ null', t.r === null, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0123456789' }, fakePage({ t: { kind: 'text' } }));
  say('a text fill that landed NOTHING in its target ⇒ nothing_landed, exit 1', t.r && t.r.code === 1 && t.r.as === 'nothing_landed', t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e2', asked: '0123' }, fakePage({ t: { kind: 'text' } }), { refs: { '@e2': 't' } });
  say('an @ref text fill that landed nothing (the driver read it empty, its kind text) ⇒ nothing_landed, exit 1', t.r && t.r.code === 1 && t.r.as === 'nothing_landed' && t.d.calls.length === 2, t.r); cost['an @ref text fill that missed'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0123456789' }, fakePage({ t: { kind: 'text', value: '01234' } }));
  say('a text fill the page cut ⇒ field_differs said, exit 0, never Done', t.r && t.r.code === 0 && t.r.as === 'field_differs' && !/Done/.test(t.r.out), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#p', asked: 'correct-horse-0' }, fakePage({ p: { kind: 'password', value: 'correct-horse' } }));
  say('a password the page cut ⇒ said by its LENGTHS, never its characters', t.r && t.r.as === 'field_differs' && t.r.out.includes('13 characters') && !t.r.out.includes('correct-horse'), t.r);
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '0123' }, fakePage({ n: { kind: 'number' } }, { focused: 'n' }));
  say('a keyboard type that left the FOCUSED field empty ⇒ SAID (exit 0), never refused — what the focused field holds, no cause claimed', t.r && t.r.code === 0 && t.r.as === 'nothing_landed' && /^note: keyboard type ran, and the field focused afterwards \(number\) is empty/.test(t.r.out) && !/refused or cleared/.test(t.r.out), t.r); cost['a keyboard type'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '4' }, fakePage({ a1: { kind: 'text', value: '4' }, a2: { kind: 'text' } }, { focused: 'a2' }));
  say('a bare keyboard type into a code box that moved the focus to the empty next one ⇒ SAID (exit 0) as the focused field afterwards — never «the page refused or cleared it»', t.r && t.r.code === 0 && /the field focused afterwards \(text\) is empty/.test(t.r.out) && !/refused or cleared/.test(t.r.out), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e2', asked: '0123' }, fakePage({ t: { kind: 'text', value: '01' } }), { refs: { '@e2': 't' }, attrFails: true });
  say('the MUST: an @ref whose KIND the browser could not read and whose value does not match ⇒ «could not be confirmed» (exit 0, a note), never «nothing landed», the value never shown', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note) && /could not be confirmed/.test(t.r.note) && !t.r.code && !/"01"/.test(t.r.note), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: 'notes' }, fakePage({ ta: { tag: 'textarea' } }), { refs: { '@e7': 'ta' } });
  say('an @ref with NO type attribute that reads empty (a textarea, a list, a rich editor) ⇒ «could not be confirmed» (exit 0, a note) — never the strict «nothing landed»', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note) && /no type attribute/.test(t.r.note) && !t.r.code, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, fakePage({ d: DATE({ value: '2027-01-07' }) }));
  say('a date field that already holds the asked value ⇒ the driver\'s answer stands, no setter (no extra input / change)', t.r === null && t.d.calls.length === 1 && t.page.events.length === 0, t.r);
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: 'hello\n' }, fakePage({ t: { kind: 'text' } }, { focused: 't' }));
  say('a keyboard type holding a line break (it may submit the form) ⇒ not judged', t.r === null, t.r);
  t = await judge(readBack, { verb: 'fill', sel: 'text=Email', asked: 'a@b.c' }, fakePage({ e: { kind: 'email', value: 'a@b.c' } }), { refs: { 'text=Email': 'e' } });
  say('a selector the page cannot read (the driver\'s own form) ⇒ read through the driver — the answer stands', t.r === null && t.d.calls.some((c) => c.args[0] === 'get'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, fakePage({ d: DATE() }), { json: true });
  { let j = null; try { j = JSON.parse(t.r.out); } catch { /* */ } say('--json ⇒ ONE JSON object: success, the value, via the setter', t.r && t.r.code === 0 && j && j.success === true && j.data.value === '2027-01-07' && j.data.via === 'setter' && t.r.out.trim().split('\n').length === 1, t.r); }
  // ── B-7108: a fill by the @ref of a PART of a native date field (the box's Chrome gives the field no ref of its own) ──
  const DUE = { x: 100, y: 200, width: 160, height: 24 }, MON = { x: 104, y: 202, width: 24, height: 20 };
  const parts = (due = {}, { part = {}, more = {}, focused = 'due', scroll = null, page = {} } = {}) => fakePage({ due: DATE({ rect: DUE, ...due }), mon: { tag: 'div', noValue: true, rect: MON, ...part }, ...more }, { focused, scroll, ...page });
  const PART = { refs: { '@e7': 'mon' } };
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts(), PART);
  say('B-7108 a fill by the Month part\'s @ref (no value the driver reads; the focus on its date field, the part\'s box inside it) ⇒ REFUSED field_part, exit 1, with the recipe: the whole field by its own selector', t.r && t.r.code === 1 && t.r.as === 'field_part' && t.r.out.startsWith('nothing was set: @e7 is one part of a date field') && t.r.out.includes("vibespace-browser fill '#due' 2027-01-07") && t.r.err === '[field_part]\n' && t.page.nodes.due._v === '' && t.d.calls.map((c) => (c.args[0] === 'get' ? c.args.slice(0, 2).join(' ') : c.args[0])).join(' · ') === 'get value · eval · get box', { r: t.r, calls: t.d.calls.map((c) => (c.args[0] === 'get' ? c.args.join(' ') : c.args[0])) });
  cost['B-7108 a fill by a date part\'s @ref (refused)'] = t.d.calls.length;
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({}, { part: { noValue: false, value: '' } }), PART);
  say('B-7108 …and when the driver reads the part EMPTY with no type attribute ⇒ the same refusal (never «could not be confirmed»)', t.r && t.r.code === 1 && t.r.as === 'field_part' && t.d.calls.some((c) => c.args[1] === 'attr'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts(), { ...PART, json: true });
  { let j = null; try { j = JSON.parse(t.r.out); } catch { /* */ } say('B-7108 --json ⇒ ONE JSON object: success false, code field_part, the field\'s selector and kind', t.r && t.r.code === 1 && j && j.success === false && j.code === 'field_part' && j.data.field === '#due' && j.data.kind === 'date' && j.data.value === '', t.r); }
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '01/07/2027' }, parts(), PART);
  say('B-7108 a value not in the field\'s form ⇒ the recipe carries the form\'s example and says it', t.r && t.r.as === 'field_part' && t.r.out.includes("vibespace-browser fill '#due' 2027-01-07") && t.r.out.includes('your "01/07/2027" is not in that form'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ noId: true, name: 'dueDate' }, { more: { other: DATE({ rect: { x: 0, y: 400, width: 160, height: 24 } }) } }), PART);
  say('B-7108 a field with no id ⇒ named by its name, checked in the page to name it alone', t.r && t.r.as === 'field_part' && t.r.out.includes("vibespace-browser fill 'input[name=\"dueDate\"]' 2027-01-07"), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ noId: true }), PART);
  say('B-7108 no id, no name, the only date field ⇒ named by its kind', t.r && t.r.as === 'field_part' && t.r.out.includes("vibespace-browser fill 'input[type=\"date\"]' 2027-01-07"), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ noId: true }, { more: { other: DATE({ noId: true, rect: { x: 0, y: 400, width: 160, height: 24 } }) } }), PART);
  say('B-7108 no selector names it alone ⇒ the recipe asks for the field\'s CSS selector, never a wrong one', t.r && t.r.as === 'field_part' && t.r.out.includes("vibespace-browser fill '<the field selector>' 2027-01-07") && t.r.out.includes('an @ref of one of its parts never reaches it'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ value: '2027-01-07' }), PART);
  say('B-7108 the field already holds the asked date ⇒ the driver\'s answer stands', t.r === null, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({}, { scroll: { x: 0, y: 500 } }), { ...PART, boxes: { mon: { x: 104, y: 702, width: 24, height: 20 } } });
  say('B-7108 a scrolled page whose driver box is in PAGE coordinates ⇒ the part is still found inside its field', t.r && t.r.as === 'field_part', t.r);
  // the r2 must kept: the TARGET, never the focus — a part is refused only when its own box lies inside the focused field
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({}, { focused: 'd1', more: { d1: DATE({ value: '2026-01-01', rect: { x: 0, y: 600, width: 160, height: 24 } }) } }), PART);
  say('B-7108 the focus on ANOTHER date field (the part\'s box outside it) ⇒ never «a part of that field»: the note as before, nothing set anywhere', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note) && t.page.nodes.d1._v === '2026-01-01' && t.page.nodes.due._v === '', t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({}, { focused: 'tx', more: { tx: { kind: 'text', rect: DUE } } }), PART);
  say('B-7108 the focus on a TEXT field ⇒ the note as before', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts(), { ...PART, boxFails: true });
  say('B-7108 the part\'s box cannot be read ⇒ not shown to be a part: the note as before', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note), t.r);
  t = await judge(readBack, { verb: 'type', sel: '@e7', asked: '01072027' }, parts(), PART);
  say('B-7108 a `type` by a part\'s @ref (its keys may set the part) ⇒ not refused: the note as before', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note), t.r);
  // B-7108 cure (主开发 03:47Z, the must): the PAGE chooses its ids — one holding a quote, a semicolon and a newline would end
  // the recipe's quoting and put the page's words in the agent's shell. The id road takes the name road's alphabet; else not used
  const HOSTILE = "x';touch pwned;'\nb";
  const clean = (r) => !!r && !/pwned/.test(String(r.out) + String(r.err));
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ id: HOSTILE, name: 'dueDate' }), PART);
  say('B-7108 cure: a HOSTILE id (a quote, a semicolon, a newline) is never put in the recipe — the field is named by its name', t.r && t.r.as === 'field_part' && t.r.out.includes("vibespace-browser fill 'input[name=\"dueDate\"]' 2027-01-07") && clean(t.r), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ id: HOSTILE }), PART);
  say('B-7108 cure: a hostile id with no name, the only date field ⇒ named by its kind', t.r && t.r.as === 'field_part' && t.r.out.includes("vibespace-browser fill 'input[type=\"date\"]' 2027-01-07") && clean(t.r), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({ id: HOSTILE }, { more: { other: DATE({ noId: true, rect: { x: 0, y: 400, width: 160, height: 24 } }) } }), PART);
  say('B-7108 cure: a hostile id, no name, not the only one ⇒ the generic words, nothing of the page in the command', t.r && t.r.as === 'field_part' && t.r.out.includes("'<the field selector>'") && clean(t.r) && t.r.err === '[field_part]\n', t.r);
  t = await judge(readBack, { verb: 'fill', sel: '@e7', asked: '2027-01-07' }, parts({}, { page: { cssEscape: () => "due';touch pwned;'", lies: true } }), PART);
  say('B-7108 cure: a page that LIES (its CSS.escape and querySelectorAll replaced) answers a hostile selector ⇒ refused by the second bound here, the generic words', t.r && t.r.as === 'field_part' && t.r.out.includes("'<the field selector>'") && clean(t.r), t.r);
  return { bad, cost };
}
ok(JSON.stringify(GRAMMAR.get.attr) === '["selector","name"]' && JSON.stringify(GRAMMAR.get.value) === '["selector"]' && JSON.stringify(GRAMMAR.focus) === '["selector"]' && JSON.stringify(GRAMMAR.eval) === '["script"]',
  `the stand-in's grammar is the driver's own help, read from the pinned fixture: get attr <selector> <name>, get value <selector>, focus <selector>, eval <script> (${Object.keys(GRAMMAR.get).length} get subcommands)`, GRAMMAR);
ok(!byGrammar(['get', 'attr', '@e5', 'type', '--json']).refused && gateOf(byGrammar(['get', 'attr', 'type', '@e5', '--json']).refused) && gateOf(byGrammar(['get', 'valu', '@e5']).refused) && verdictOf(byGrammar(['focus']).refused),
  'the grammar takes get attr <selector> <name> and REFUSES the reversed order (get attr type @e5), an unknown subcommand and a missing selector');
REFUSED_CALLS.length = 0;
{
  const { bad, cost } = await readBackCensus(RB.readBack);
  ok(REFUSED_CALLS.length === 0, `every driver call the read-back made in ⑤ is one the driver's help allows (${REFUSED_CALLS.length} refused)`, REFUSED_CALLS);
  ok(bad.length === 0, `readBack judges the verb's TARGET (a CSS selector in the page, an @ref through the driver), sets a date / time / … field through its own setter in the kind's normal form, clears on an empty fill, never blames the field for a failed run, reads the answer whole, keeps ONE 10 s bound — a bare keyboard type's findings said, never refused`, bad);
  ok(Object.keys(cost).length >= 7, `(e) THE COST, measured on the fake — driver runs per read-back: ${Object.entries(cost).map(([k, n]) => `${k} ${n}`).join(' · ')}`, cost);
}

ok(gateOf(['#due', '#a\\.b', '#\\31 23', 'input[name="dueDate"]', 'input[type="date"]'].every((x) => RB.recipeSelector(x) === x)) && verdictOf(["#x';touch pwned;'", '#a b', '#a\nb', 'input[name="x";y"]', '#$(id)', '#`id`', 'x'.repeat(201)].every((x) => RB.recipeSelector(x) === null)),
  'B-7108 cure: the recipe takes a page\'s selector only from the bounded alphabet (CSS.escape\'s own output for letters, digits, _ . : -) — a quote, a space, a newline, $( ) or a backquote is refused');
ok(RB.shellArg('@e7') === '@e7' && RB.shellArg('#d') === "'#d'" && RB.shellArg("a'b") === "'a'\\''b'" && RB.shellArg('input[name="x"]') === `'input[name="x"]'`,
  'one shell word: plain words as they are, `#d` quoted (unquoted it is a comment), a quote inside closed, escaped and reopened');
console.log('⑥ WIRING in the shipped CLI');
const CLI_SRC = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
function wiringFindings(src) {
  const bad = [];
  const kn = src.indexOf('V.keyNameVerdict(cls.argv)'), cwd = src.indexOf('const runCwd = startsNothing ? { ok: true, dir: null } : daemonCwd();'), resolve1 = src.indexOf("call('POST', '/api/agent/browser/resolve'");
  if (!(kn > 0 && kn < cwd && kn < resolve1)) bad.push('the key\'s-code refusal is not judged before the daemon directory / the binary / the resolve');
  if (!/const readPlan = RB && typeof RB\.readBack === 'function' && typeof V\.readBackPlan === 'function' && !isVaultFill && !r\.scrubOutput && cls\.verb !== 'batch' \? V\.readBackPlan\(cls\.argv\) : null;/.test(src)) bad.push('the read-back plan does not exclude a vault fill, a read-fenced tab and a batch');
  if (!/function loadReadBack\(\)[\s\S]{0,600}'src', 'browser-read-back\.js'[\s\S]{0,300}'vibespace-browser-read-back\.js'/.test(src) || !/^const RB = loadReadBack\(\);$/m.test(src)) bad.push('the CLI does not load the read-back from the source in a checkout, else its copy beside it');
  const exitAt = src.indexOf("child.on('exit', async (code) => {");
  const rbAt = src.indexOf('await RB.readBack({ plan: readPlan', exitAt), auditAt = src.indexOf("call('POST', '/api/agent/browser/audit'", exitAt);
  if (!(exitAt > 0 && rbAt > exitAt && auditAt > rbAt)) bad.push('the read-back does not run in the exit handler before the audit');
  if (!/if \(code === 0 && readPlan && !dialogHit && !loopHit && !shotCut && !passkeyHit && !promptHit\)/.test(src)) bad.push('the read-back is not limited to a 0 answer with no dialog / loop / passkey / prompt');
  if (!/else if \(rb\) \{ outText = rb\.out; errText = rb\.err; code = rb\.code; \}/.test(src)) bad.push('the read-back\'s answer does not replace the driver\'s');
  if (!/function runBinQuiet\(bin, args, \{ env, cwd, ms = 10000 \}\)/.test(src) || !/setTimeout\(\(\) => \{ try \{ c\.kill\('SIGKILL'\); \} catch \{ \/\* ended \*\/ \} resolve\(\{ code: 124/.test(src)) bad.push('the read-back\'s driver call is not bounded');
  if (!/run: \(args, o\) => runBinQuiet\(bin\.path, .*?, \{ env, cwd: runCwd\.dir, ms: o && o\.ms > 0 \? Math\.min\(o\.ms, 10000\) : 10000 \}\)/.test(src)) bad.push('each read-back run is not handed what is left of the ONE bound');
  return bad;
}
{
  const hosts = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8'), gen = fs.readFileSync(path.join(REPO, 'src/server/agent-tool-generators.js'), 'utf8'), gi = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  const tools = (/static AGENT_TOOLS = \[([^\]]+)\]/.exec(hosts) || [, ''])[1];
  ok(gateOf(/'vibespace-browser-read-back\.js'/.test(tools)) && gateOf(/function createBrowserReadBackCopy\(\)[\s\S]{0,400}'src', 'browser-read-back\.js'[\s\S]{0,200}fs\.promises\.rename\(tmp, dst\)/.test(gen)) && gateOf(/^createBrowserReadBackCopy\(\);$/m.test(gen)) && verdictOf(/^data\/bin\/vibespace-browser-read-back\.js$/m.test(gi)),
    'the read-back SHIPS beside the CLI: copied at every boot (off the loop) as vibespace-browser-read-back.js, in AGENT_TOOLS (a host gets it), gitignored');
  const devBundled = ['src/browser-verbs.js', 'src/browser-facts.js', 'src/browser-serve.js', 'src/exit-proxy.js'].filter((f) => /require\([^)]*browser-read-back/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(devBundled.length === 0, 'no module the device bundle carries requires the read-back (test-architecture §107: it is the CLI\'s alone)', devBundled);
}
{ const bad = wiringFindings(CLI_SRC); ok(bad.length === 0, 'the CLI: the key\'s code refused before anything runs; the read-back after a 0 answer, before the audit, never a vault fill / batch / fenced tab; every run handed what is left of ONE 10 s bound', bad); }

console.log('⑦ RED CONTROLS (patched copies, the tree untouched)');
const MUT = mutantCopies('read-back', REPO);
{
  // the release's behaviour: the driver's answer is trusted — a date field filled «Done» stays empty
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-read-back.js'), 'utf8');
  const from = '  const form = f.tag === \'input\' ? FIELD_FORMS[f.kind] : null;\n';
  const f = MUT.write('src/browser-read-back.js', editAnchor(SRC, from, '  const form = null; // CONTROL: the driver is trusted\n', "src/browser-read-back.js"), 'trust');
  const VM = require(f);
  const { bad } = await readBackCensus(VM.readBack);
  ok(gateOf(SRC.includes(from)) && gateOf(bad.some((b) => b.startsWith('a date fill ISO ⇒ the setter'))) && verdictOf(bad.some((b) => b.startsWith('the owner\'s act'))), 'CONTROL: a readBack that trusts the driver (the release\'s «Done» over an empty date field) FAILS ⑤', bad.slice(0, 3));
}
{
  // 080d37c23's read-back (the second verdict's must): the attribute asked in the REVERSED order — get attr type <selector>
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-read-back.js'), 'utf8');
  const from = "call(['get', 'attr', plan.sel, 'type', '--json'])";
  const f = MUT.write('src/browser-read-back.js', editAnchor(SRC, from, "call(['get', 'attr', 'type', plan.sel, '--json'])", "src/browser-read-back.js"), 'reversed'); // stale-pins: kept — the reversed order IS the control's planted mutation
  REFUSED_CALLS.length = 0;
  const { bad } = await readBackCensus(require(f).readBack);
  ok(gateOf(SRC.includes(from)) && gateOf(bad.some((b) => b.startsWith('a date fill by @ref'))) && verdictOf(REFUSED_CALLS.some((r) => /is no attribute name/.test(r))), 'CONTROL: the read-back that asks get attr type <selector> (080d37c23) FAILS — its @ref date fill is not set, and the stand-in refuses the call by the help\'s grammar', { bad: bad.filter((b) => b.startsWith('a date fill by @ref')).map((b) => b.slice(0, 160)), refused: REFUSED_CALLS.slice(0, 2) });
  REFUSED_CALLS.length = 0;
}
{
  // 68da75fa2's read-back (the must): whatever holds the FOCUS after the verb is judged, the target named only in the words
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-read-back.js'), 'utf8');
  const from = '  if (plan.sel == null) {\n    f = evalAnswer(await call([\'eval\', fieldProbeJs(plan.asked)]));';
  const f = MUT.write('src/browser-read-back.js', editAnchor(SRC, from, '  if (true) { // CONTROL: the focused field, whatever the verb named\n    f = evalAnswer(await call([\'eval\', fieldProbeJs(plan.asked)]));', "src/browser-read-back.js"), 'focused');
  const VM = require(f);
  const { bad } = await readBackCensus(VM.readBack);
  ok(gateOf(SRC.includes(from)) && gateOf(bad.some((b) => b.startsWith('scene 1:'))) && gateOf(bad.some((b) => b.startsWith('scene 2:'))) && verdictOf(bad.some((b) => b.startsWith('scene 3:'))), 'CONTROL: the read-back that judges the FOCUSED field (68da75fa2) FAILS the three scenes — a one-time-code box, a card number, an earlier date field', bad.filter((b) => b.startsWith('scene')).map((b) => b.slice(0, 120)));
}
{
  // B-7108, the release's road: a fill by a date part's @ref is never shown to be a part — exit 0 [read_back_unavailable]
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-read-back.js'), 'utf8');
  const f = MUT.write('src/browser-read-back.js', anchored(SRC, ' const pt = await partOf(); if (pt) return pt.landed ? null : pt;', '', 'B-7108 the release: no part check', { count: 2 }), 'no-part');
  const { bad } = await readBackCensus(require(f).readBack);
  ok(gateOf(bad.some((b) => b.startsWith('B-7108 a fill by the Month part'))) && verdictOf(bad.some((b) => b.startsWith('B-7108 …and when the driver reads the part EMPTY'))), 'CONTROL (the release\'s read-back): a fill by the Month part\'s @ref answers exit 0 [read_back_unavailable] over the EMPTY date field — the box\'s finding — FAILS ⑤', bad.filter((b) => b.startsWith('B-7108')).slice(0, 2));
}
{
  // B-7108 without its box check: whatever date field holds the focus is taken for the part's — the r2 must broken
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-read-back.js'), 'utf8');
  const f = MUT.write('src/browser-read-back.js', anchored(SRC, "    if (!boxInside(driverBox(await call(['get', 'box', plan.sel, '--json'])), o.box, o.scroll)) return null;\n", '', 'B-7108 no box check'), 'no-box');
  const { bad } = await readBackCensus(require(f).readBack);
  ok(verdictOf(bad.some((b) => b.startsWith('B-7108 the focus on ANOTHER date field'))), 'CONTROL (a part judged by the FOCUS alone): the focus on another date field is refused as «a part of it» — FAILS ⑤', bad.filter((b) => b.startsWith('B-7108')).slice(0, 2));
}
{
  // B-7108 cure's CONTROL: 449554175's id road — the page's id through CSS.escape alone, the recipe trusting the page's answer
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-read-back.js'), 'utf8');
  const rel = anchored(anchored(SRC, "if(el.id&&/^[A-Za-z0-9_.:-]+$/.test(el.id)&&", 'if(el.id&&', 'B-7108 the release: an id of any characters'), '    const sel = recipeSelector(o.sel);\n', '    const sel = o.sel || null;\n', 'B-7108 the release: the page trusted');
  const { bad } = await readBackCensus(require(MUT.write('src/browser-read-back.js', rel, 'id-unbounded')).readBack);
  ok(gateOf(bad.some((b) => b.startsWith('B-7108 cure: a HOSTILE id'))) && verdictOf(bad.some((b) => b.startsWith('B-7108 cure: a page that LIES'))), 'CONTROL (449554175\'s id road, both bounds gone): the hostile id and a lying page\'s selector travel into the agent\'s command: FAILS ⑤', bad.filter((b) => b.startsWith('B-7108 cure')).slice(0, 2));
  const half = anchored(SRC, '    const sel = recipeSelector(o.sel);\n', '    const sel = o.sel || null;\n', 'B-7108 the page trusted');
  const { bad: bad2 } = await readBackCensus(require(MUT.write('src/browser-read-back.js', half, 'page-trusted')).readBack);
  ok(gateOf(bad2.some((b) => b.startsWith('B-7108 cure: a page that LIES'))) && !bad2.some((b) => b.startsWith('B-7108 cure: a HOSTILE id')), 'CONTROL (the bound in the page alone): a page that replaces its own CSS.escape and querySelectorAll puts its words in the command — the second bound is load-bearing: FAILS ⑤', bad2.filter((b) => b.startsWith('B-7108')).slice(0, 2));
}
{
  const from = "    if (code === 0 && readPlan && !dialogHit && !loopHit && !shotCut && !passkeyHit && !promptHit) {";
  const bad = wiringFindings(CLI_SRC.replace(from, '    if (false) {'));
  ok(gateOf(CLI_SRC.includes(from)) && bad.length > 0, 'CONTROL: the CLI without its read-back hook FAILS ⑥', bad);
}
{ const lit = treeLitter(REPO); ok(!lit.err && lit.entries.length === 0, 'the tree holds no copy this run wrote (git status under src/)', lit); }

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
