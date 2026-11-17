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
//   RED CONTROLS (patched copies, the tree untouched): a readBack that trusts the driver (the release's behaviour — Done over
//   an empty date field) fails ⑤; a wrapper without the read-back hook fails ⑥.
// The REAL road (the real keeper + mediator + a headed Chrome + the real driver) is test-browser-live ⑫, heavy.
// Zero vendor calls; no browser; no spawn.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { mutantCopies, treeLitter } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const V = require('../src/browser-verbs.js');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } return !!c; };

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
  const F = V.FIELD_FORMS;
  const kinds = ['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'];
  ok(kinds.every((k) => F[k] && F[k].re.test(F[k].example) && F[k].words.length > 3) && Object.keys(F).length === kinds.length, `the seven kinds that take no typed text (${kinds.join(', ')}): each one's example is in its own form, each says its form in words`);
  const notForms = [['date', '01072027'], ['date', '01/07/2027'], ['date', '2027-1-7'], ['date', '7 January 2027'], ['time', '0905'], ['time', '9:05'], ['time', '09:05 AM'], ['datetime-local', '2027-01-07 09:05'], ['month', '01/2027'], ['week', '2027-01'], ['color', 'red'], ['color', '#36c'], ['range', 'half']];
  const bad = notForms.filter(([k, v]) => F[k].re.test(v)).map(([k, v]) => `${k} ${v}`);
  ok(bad.length === 0, `the forms an agent writes that a field cannot take are not its form — «01072027», «01/07/2027», «0905», «09:05 AM», «red» … (${notForms.length} rows)`, bad);
  const forms = [['date', '2027-01-07'], ['date', '12345-06-07'], ['time', '09:05:30'], ['time', '23:59:59.250'], ['datetime-local', '2027-01-07T09:05'], ['month', '2027-12'], ['week', '2027-W52'], ['color', '#A0b1C2'], ['range', '-2.5']];
  const missed = forms.filter(([k, v]) => !F[k].re.test(v)).map(([k, v]) => `${k} ${v}`);
  ok(missed.length === 0, `every value in a kind's own form passes the form (seconds, milliseconds, a five-digit year, an upper-case hex) — the FIELD then judges it (${forms.length} rows)`, missed);
}

console.log('④ the page-side JS over a fake DOM');
/** A fake page: one focused element (optionally inside a same-origin frame); the setter goes through the element's OWN window. */
function fakePage(el, { inFrame = false } = {}) {
  const events = [];
  const mkWin = () => {
    const proto = {};
    Object.defineProperty(proto, 'value', { get() { return this._v; }, set(v) { this._v = this._accept(String(v)) ? String(v) : ''; }, configurable: true });
    function Event(type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); }
    return { HTMLInputElement: { prototype: proto }, Event };
  };
  const win = mkWin(), frameWin = mkWin();
  const node = { tagName: el.tag.toUpperCase(), type: el.kind, readOnly: !!el.readOnly, disabled: !!el.disabled, _v: el.value, _accept: el.accept || (() => true), ownerDocument: { defaultView: inFrame ? frameWin : win }, dispatchEvent(e) { events.push(e.type); return true; } };
  Object.setPrototypeOf(node, (inFrame ? frameWin : win).HTMLInputElement.prototype);
  const top = inFrame ? { tagName: 'IFRAME', contentDocument: { activeElement: node } } : node;
  const ctx = vm.createContext({ document: { activeElement: top }, window: win, JSON });
  return { run: (js) => vm.runInContext(js, ctx), node, events };
}
{
  const p = fakePage({ tag: 'input', kind: 'date', value: '' });
  const a = p.run(V.fieldProbeJs('01072027'));
  ok(a.tag === 'input' && a.kind === 'date' && a.has === true && a.equal === false && a.len === 0 && a.locked === false && a.value === '', 'the probe answers the focused field\'s tag, kind, value and length, compared IN the page with what was asked', a);
  const pw = fakePage({ tag: 'input', kind: 'password', value: 'hunter2-secret' });
  const b = pw.run(V.fieldProbeJs('hunter2-secret'));
  ok(b.kind === 'password' && b.value === null && b.equal === true && b.len === 14 && !JSON.stringify(b).includes('hunter2'), 'a password field\'s value never leaves the page — only equal / includes / its length', b);
  const fr = fakePage({ tag: 'input', kind: 'time', value: '' }, { inFrame: true });
  const c = fr.run(V.fieldProbeJs('09:05'));
  ok(c.kind === 'time' && c.tag === 'input', 'the probe reaches the field focused inside a same-origin frame', c);
  const s = fr.run(V.fieldSetJs('09:05'));
  ok(s.set === true && s.value === '09:05' && fr.node._v === '09:05' && fr.events.join() === 'input,change', 'the setter goes through the field\'s OWN window\'s native value setter, then fires input and change (a person\'s edit)', { s, events: fr.events });
  const rej = fakePage({ tag: 'input', kind: 'date', value: '', accept: (v) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) });
  const r2 = rej.run(V.fieldSetJs('2027-13-40'));
  ok(r2.set === true && r2.value === '', 'a value the field refuses is read back as what it holds (empty) — the field is the judge', r2);
  const none = vm.runInContext(V.fieldProbeJs('x'), vm.createContext({ document: { activeElement: null }, JSON }));
  ok(none.tag === null, 'nothing focused ⇒ the probe says so (tag null)', none);
  const area = fakePage({ tag: 'textarea', kind: 'textarea', value: 'ab0' }).run(V.fieldProbeJs('0'));
  ok(area.kind === 'textarea' && area.includes === true, 'a textarea is a field too', area);
}

console.log('⑤ readBack over a fake page, kind by kind');
const realDate = (v) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
/** The driver's `eval` over a fake page: the probe and the setter run for real (④'s fake DOM); `fails` = the eval refuses. */
function fakeDriver(el, { fails = false } = {}) {
  const page = fakePage(el); const calls = [];
  const run = async (args) => { calls.push(args); if (fails) return { code: 1, out: '', err: '✗ CDP command timed out' }; if (args[0] !== 'eval') return { code: 9, out: '', err: 'not an eval' }; return { code: 0, out: JSON.stringify(page.run(args[1])) + '\n', err: '' }; };
  return { run, calls, page };
}
async function judge(readBack, plan, el, opts = {}) { const d = fakeDriver(el, opts); const r = await readBack({ plan, run: d.run, json: !!opts.json }); return { r, d }; }
async function readBackCensus(readBack) {
  const bad = [];
  const say = (n, c, x) => { if (!c) bad.push(`${n}: ${JSON.stringify(x).slice(0, 300)}`); };
  let t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, { tag: 'input', kind: 'date', value: '', accept: realDate });
  say('date fill ISO ⇒ the setter, read back, Done', t.r && t.r.code === 0 && t.r.as === 'field_setter' && /^✓ Done — the date field holds 2027-01-07, set through the field's own setter/.test(t.r.out) && t.d.page.node._v === '2027-01-07' && t.d.page.events.join() === 'input,change', t.r);
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '01072027' }, { tag: 'input', kind: 'date', value: '', accept: realDate });
  say('the owner\'s act: keyboard type 01072027 into a date field ⇒ refused by name with the form, nothing set', t.r && t.r.code === 1 && t.r.as === 'field_form' && t.r.out.includes('a date field takes no typed text and holds its value as 2027-01-07 (year-month-day)') && t.r.out.includes('press each digit') && t.d.calls.length === 1 && t.d.page.node._v === '', t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '01/07/2027' }, { tag: 'input', kind: 'date', value: '', accept: realDate });
  say('date fill 01/07/2027 ⇒ field_form naming `fill #d 2027-01-07`', t.r && t.r.code === 1 && t.r.as === 'field_form' && t.r.out.includes('vibespace-browser fill #d 2027-01-07'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-02-31' }, { tag: 'input', kind: 'date', value: '', accept: realDate });
  say('date fill 2027-02-31 ⇒ the field refuses it: field_refused, what it holds said', t.r && t.r.code === 1 && t.r.as === 'field_refused' && t.r.out.includes('did not take "2027-02-31" (it holds "")'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#tm', asked: '09:05' }, { tag: 'input', kind: 'time', value: '' });
  say('time fill 09:05 ⇒ the setter, Done', t.r && t.r.code === 0 && t.r.as === 'field_setter' && t.d.page.node._v === '09:05', t.r);
  t = await judge(readBack, { verb: 'type', sel: '#tm', asked: '0905' }, { tag: 'input', kind: 'time', value: '' });
  say('time type 0905 ⇒ field_form with 09:05', t.r && t.r.code === 1 && t.r.as === 'field_form' && t.r.out.includes('09:05 (hours:minutes, 24-hour clock)'), t.r);
  for (const [kind, v] of [['datetime-local', '2027-01-07T09:05'], ['month', '2027-01'], ['week', '2027-W01'], ['color', '#3366cc'], ['range', '50']]) {
    t = await judge(readBack, { verb: 'fill', sel: '#x', asked: v }, { tag: 'input', kind, value: '' });
    say(`${kind} fill ${v} ⇒ the setter`, t.r && t.r.code === 0 && t.r.as === 'field_setter' && t.d.page.node._v === v, t.r);
  }
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, { tag: 'input', kind: 'date', value: '', readOnly: true });
  say('a read-only date field ⇒ field_locked, the setter never runs', t.r && t.r.code === 1 && t.r.as === 'field_locked' && t.d.calls.length === 1, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0123456789' }, { tag: 'input', kind: 'text', value: '0123456789' });
  say('a text fill that landed ⇒ null (the driver\'s own answer stands)', t.r === null, t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0123456789' }, { tag: 'input', kind: 'text', value: '' });
  say('a text fill that landed NOTHING ⇒ nothing_landed, exit 1', t.r && t.r.code === 1 && t.r.as === 'nothing_landed' && t.r.out.includes('empty after your fill of "0123456789"'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0123456789' }, { tag: 'input', kind: 'text', value: '01234' });
  say('a text fill the page cut ⇒ field_differs said (exit 0), never Done', t.r && t.r.code === 0 && t.r.as === 'field_differs' && /^filled — but the text field holds "01234", not exactly "0123456789"/.test(t.r.out) && !/Done/.test(t.r.out), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#p', asked: 'correct-horse-0' }, { tag: 'input', kind: 'password', value: 'correct-horse' });
  say('a password the page cut ⇒ said by its LENGTHS, never its characters', t.r && t.r.as === 'field_differs' && t.r.out.includes('13 characters') && !t.r.out.includes('correct-horse'), t.r);
  t = await judge(readBack, { verb: 'type', sel: '#t', asked: '07' }, { tag: 'input', kind: 'text', value: 'x07y' });
  say('a type whose text the field contains ⇒ null', t.r === null, t.r);
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: 'hello\n' }, { tag: 'input', kind: 'text', value: '' });
  say('a keyboard type holding a line break (it may submit the form) ⇒ not judged', t.r === null, t.r);
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '0123' }, { tag: 'input', kind: 'number', value: '' });
  say('a keyboard type that landed nothing in a number field ⇒ nothing_landed', t.r && t.r.code === 1 && t.r.as === 'nothing_landed', t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#t', asked: '0' }, { tag: 'input', kind: 'text', value: '' }, { fails: true });
  say('a field that cannot be read back ⇒ a note under the driver\'s answer (read_back_unavailable)', t.r && t.r.note && /\[read_back_unavailable\]$/.test(t.r.note) && t.r.note.includes('vibespace-browser get value #t'), t.r);
  t = await judge(readBack, { verb: 'fill', sel: '#d', asked: '2027-01-07' }, { tag: 'input', kind: 'date', value: '', accept: realDate }, { json: true });
  { let j = null; try { j = JSON.parse(t.r.out); } catch { /* */ } say('--json ⇒ ONE JSON object: success, the value, via the setter', t.r && t.r.code === 0 && j && j.success === true && j.data.value === '2027-01-07' && j.data.via === 'setter' && t.r.out.trim().split('\n').length === 1, t.r); }
  t = await judge(readBack, { verb: 'keyboard type', sel: null, asked: '01072027' }, { tag: 'input', kind: 'date', value: '' }, { json: true });
  { let j = null; try { j = JSON.parse(t.r.out); } catch { /* */ } say('--json refusal ⇒ success false, code field_form', t.r && t.r.code === 1 && j && j.success === false && j.code === 'field_form', t.r); }
  return bad;
}
{
  const bad = await readBackCensus(V.readBack);
  ok(bad.length === 0, 'readBack: a date / time / datetime-local / month / week / colour / range field gets its value through its own setter, read back; the wrong form refused by name; nothing landed refused; a difference said (a password by length); unreadable said', bad);
}

console.log('⑥ WIRING in the shipped CLI');
const CLI_SRC = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
function wiringFindings(src) {
  const bad = [];
  const kn = src.indexOf('V.keyNameVerdict(cls.argv)'), cwd = src.indexOf('const runCwd = startsNothing ? { ok: true, dir: null } : daemonCwd();'), resolve1 = src.indexOf("call('POST', '/api/agent/browser/resolve'");
  if (!(kn > 0 && kn < cwd && kn < resolve1)) bad.push('the key\'s-code refusal is not judged before the daemon directory / the binary / the resolve');
  if (!/const readPlan = typeof V\.readBackPlan === 'function' && !isVaultFill && !r\.scrubOutput && cls\.verb !== 'batch' \? V\.readBackPlan\(cls\.argv\) : null;/.test(src)) bad.push('the read-back plan does not exclude a vault fill, a read-fenced tab and a batch');
  const exitAt = src.indexOf("child.on('exit', async (code) => {");
  const rbAt = src.indexOf('await V.readBack({ plan: readPlan', exitAt), auditAt = src.indexOf("call('POST', '/api/agent/browser/audit'", exitAt);
  if (!(exitAt > 0 && rbAt > exitAt && auditAt > rbAt)) bad.push('the read-back does not run in the exit handler before the audit');
  if (!/if \(code === 0 && readPlan && !dialogHit && !loopHit && !shotCut && !passkeyHit && !promptHit\)/.test(src)) bad.push('the read-back is not limited to a 0 answer with no dialog / loop / passkey / prompt');
  if (!/else if \(rb\) \{ outText = rb\.out; errText = rb\.err; code = rb\.code; \}/.test(src)) bad.push('the read-back\'s answer does not replace the driver\'s');
  if (!/function runBinQuiet\(bin, args, \{ env, cwd, ms = 10000 \}\)/.test(src) || !/setTimeout\(\(\) => \{ try \{ c\.kill\('SIGKILL'\); \} catch \{ \/\* ended \*\/ \} resolve\(\{ code: 124/.test(src)) bad.push('the read-back\'s driver call is not bounded');
  return bad;
}
{ const bad = wiringFindings(CLI_SRC); ok(bad.length === 0, 'the CLI: the key\'s code refused before anything runs; the read-back after a 0 answer, before the audit, never a vault fill / batch / fenced tab; its eval bounded (10 s)', bad); }

console.log('⑦ RED CONTROLS (patched copies, the tree untouched)');
const MUT = mutantCopies('read-back', REPO);
{
  // the release's behaviour: the driver's answer is trusted — a date field filled «Done» stays empty
  const SRC = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
  const from = '  const form = f.tag === \'input\' ? FIELD_FORMS[f.kind] : null;\n';
  const f = MUT.write('src/browser-verbs.js', SRC.replace(from, '  const form = null; // CONTROL: the driver is trusted\n'), 'trust');
  const VM = require(f);
  const bad = await readBackCensus(VM.readBack);
  ok(SRC.includes(from) && bad.some((b) => b.startsWith('date fill ISO ⇒ the setter')) && bad.some((b) => b.startsWith('the owner\'s act')), 'CONTROL: a readBack that trusts the driver (the release\'s «Done» over an empty date field) FAILS ⑤', bad.slice(0, 3));
}
{
  const from = "    if (code === 0 && readPlan && !dialogHit && !loopHit && !shotCut && !passkeyHit && !promptHit) {";
  const bad = wiringFindings(CLI_SRC.replace(from, '    if (false) {'));
  ok(CLI_SRC.includes(from) && bad.length > 0, 'CONTROL: the CLI without its read-back hook FAILS ⑥', bad);
}
{ const lit = treeLitter(REPO); ok(!lit.err && lit.entries.length === 0, 'the tree holds no copy this run wrote (git status under src/)', lit); }

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
