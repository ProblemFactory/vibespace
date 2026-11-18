'use strict';
/**
 * THE READ-BACK OF A FILL (lane digit-zero, 2026-11-17 — the owner's own agent: a native date field answered «Done» and stayed
 * EMPTY). PURE: imports nothing. The browser CLI (data/bin/vibespace-browser) loads it — the source in a checkout, the
 * boot-time copy `vibespace-browser-read-back.js` beside the CLI on a host (in AGENT_TOOLS, gitignored, like
 * vibespace-browser-passkey.js). Its own file so the DEVICE bundle never carries it (test-architecture §107: the device agent
 * bundles src/browser-verbs.js through the browser modules it uses, and never runs a read-back).
 * WHAT AN AGENT TYPES ARRIVES; A FILL THAT CANNOT SET A FIELD SAYS SO: fill / type / keyboard type are read back — the verb's
 * TARGET, never the focus after it; a date / time / datetime-local / month / week field (and a colour / range control) takes
 * no inserted text, so its own setter in its kind's form, read back. Which commands: browser-verbs.js readBackPlan. The
 * measurement and the rules: kb-file-structure «src/browser-read-back.js». Gate: test-browser-read-back + test-browser-live ⑫.
 */
const normTime = (v) => { const m = /^(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(String(v)); if (!m) return String(v); const ms = m[3] ? m[3].replace(/0+$/, '') : ''; return m[1] + (m[2] && (m[2] !== '00' || ms) ? ':' + m[2] + (ms ? '.' + ms : '') : ''); };
const FIELD_FORMS = Object.freeze({
  date: Object.freeze({ re: /^\d{4,}-\d{2}-\d{2}$/, example: '2027-01-07', words: 'year-month-day', norm: (v) => String(v) }), // ui-words: agent-facing CLI words
  time: Object.freeze({ re: /^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/, example: '09:05', words: 'hours:minutes, 24-hour clock', norm: normTime }), // ui-words: agent-facing CLI words
  'datetime-local': Object.freeze({ re: /^\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/, example: '2027-01-07T09:05', words: 'year-month-dayThours:minutes', norm: (v) => { const [d, t] = String(v).split('T'); return t === undefined ? String(v) : d + 'T' + normTime(t); } }), // ui-words: agent-facing CLI words
  month: Object.freeze({ re: /^\d{4,}-\d{2}$/, example: '2027-01', words: 'year-month', norm: (v) => String(v) }), // ui-words: agent-facing CLI words
  week: Object.freeze({ re: /^\d{4,}-W\d{2}$/, example: '2027-W01', words: 'year-Wweek', norm: (v) => String(v) }), // ui-words: agent-facing CLI words
  color: Object.freeze({ re: /^#[0-9a-fA-F]{6}$/, example: '#3366cc', words: 'a # and six hex digits', norm: (v) => String(v).toLowerCase() }), // ui-words: agent-facing CLI words
  range: Object.freeze({ re: /^-?(?:\d+\.?\d*|\.\d+)$/, example: '50', words: 'a number inside the control\'s range', norm: (v) => (String(v) !== '' && Number.isFinite(Number(v)) ? String(Number(v)) : String(v)) }), // ui-words: agent-facing CLI words
});
const READ_BACK_TEXT_MAX = 120;
// the field: by its CSS selector ({ css }), else the deepest focused element; each probe answers a JSON string (one printed line)
const FOCUSED_JS = 'let el=document.activeElement;try{while(el&&el.contentDocument&&el.contentDocument.activeElement)el=el.contentDocument.activeElement}catch(e){}';
function findJs(target) {
  if (target && typeof target.css === 'string') return `let el=null;try{el=document.querySelector(${JSON.stringify(target.css)})}catch(e){return JSON.stringify({tag:null,why:'selector'})}if(!el)return JSON.stringify({tag:null,why:'missing'});`;
  return FOCUSED_JS;
}
/** The probe (for the driver's eval): `asked` compared IN the page; a password's value never leaves it. */
function fieldProbeJs(asked, target = null) {
  return `(()=>{${findJs(target)}if(!el||!el.tagName)return JSON.stringify({tag:null});const tag=el.tagName.toLowerCase();const kind=tag==='input'?String(el.type||'text').toLowerCase():tag;const v=typeof el.value==='string'&&(tag==='input'||tag==='textarea')?el.value:null;const a=${JSON.stringify(String(asked))};const secret=kind==='password';return JSON.stringify({tag,kind,has:v!==null,equal:v===a,includes:v!==null&&v.includes(a),len:v===null?null:v.length,locked:!!(el.readOnly||el.disabled),value:secret||v===null?null:v.slice(0,${READ_BACK_TEXT_MAX + 1})})})()`;
}
/** The field's own native setter + input / change; `expect` {kind, value}: the focused field must BE the target, else not-target. */
function fieldSetJs(value, target = null, expect = null) {
  const check = expect ? `if(String(el.type||'').toLowerCase()!==${JSON.stringify(String(expect.kind))}||el.value!==${JSON.stringify(String(expect.value))})return JSON.stringify({set:false,why:'not-target'});` : '';
  return `(()=>{${findJs(target)}if(!el||!el.tagName||el.tagName.toLowerCase()!=='input')return JSON.stringify({set:false,why:'not-input'});${check}if(el.readOnly||el.disabled)return JSON.stringify({set:false,locked:true});const before=el.value;const w=(el.ownerDocument&&el.ownerDocument.defaultView)||window;const d=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value');d.set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));return JSON.stringify({set:true,kind:String(el.type||'').toLowerCase(),value:el.value,before})})()`;
}
const shown = (v) => { const s = String(v ?? ''); return JSON.stringify(s.length > READ_BACK_TEXT_MAX ? s.slice(0, READ_BACK_TEXT_MAX) + '…' : s); };
const jsonReadings = (r) => { const whole = String((r && r.out) || '').trim(); const lines = whole.split('\n').filter(Boolean); return [whole, lines[lines.length - 1] || '']; };
/** The driver's eval answer → its object (the whole answer first, then its last line; a JSON string read once more). */
function evalAnswer(r) {
  if (!r || r.code !== 0) return null;
  for (const text of jsonReadings(r)) {
    try { let v = JSON.parse(text); if (typeof v === 'string') v = JSON.parse(v); if (v && typeof v === 'object') return v; } catch { /* the next reading */ }
  }
  return null;
}
/** The driver's `get … --json` answer → its string, else null (never an empty field); absentIsEmpty: an absent attribute is ''. */
function driverRead(r, { absentIsEmpty = false } = {}) {
  if (!r || r.code !== 0) return null;
  for (const text of jsonReadings(r)) {
    let j = null; try { j = JSON.parse(text); } catch { continue; }
    if (!j || typeof j !== 'object' || j.success !== true) continue;
    const d = j.data;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object') for (const k of ['value', 'text', 'result', 'attribute', 'attr']) if (typeof d[k] === 'string') return d[k];
    if (absentIsEmpty && (d == null || (typeof d === 'object' && Object.values(d).every((x) => x == null)))) return '';
  }
  return null;
}
const READ_BACK_BUDGET_MS = 10000;
/** THE READ-BACK after a 0 answer; run(args, { ms }) runs the driver, ONE budget for all runs → null | { note } | { code, out, err, as }. */
async function readBack({ plan, run, json = false, now = Date.now, budgetMs = READ_BACK_BUDGET_MS }) {
  if (!plan || typeof run !== 'function') return null;
  const deadline = now() + budgetMs;
  let runs = 0;
  const call = async (args) => { const left = deadline - now(); if (left <= 0) return null; runs++; try { return await run(args, { ms: left }); } catch { return null; } };
  const what = plan.verb === 'fill' ? 'fill' : plan.verb === 'type' ? 'type' : plan.verb;
  const target = plan.sel ? plan.sel : "<the field's @ref>";
  // ui-words: agent-facing CLI note
  const unavailable = (why) => ({ runs, note: `note: your ${what} ran, but ${why} — check it (vibespace-browser get value ${target}) before you go on [read_back_unavailable]` });
  const answer = (code, as, text, data = null) => (json
    ? { code, as, runs, out: JSON.stringify(code === 0 ? { success: true, data: { ...(data || {}), readBack: as }, error: null } : { success: false, data, code: as, error: text }) + '\n', err: code === 0 ? `note: ${text} [${as}]\n` : `[${as}]\n` }
    : { code, as, runs, out: text + '\n', err: `[${as}]\n` });
  const matches = (v) => (plan.verb === 'fill' ? v === plan.asked : v.includes(plan.asked));
  let f = null, setVia = null;
  if (plan.sel == null) {
    f = evalAnswer(await call(['eval', fieldProbeJs(plan.asked)]));
    if (!f) return unavailable('the focused field could not be read back afterwards');
    setVia = { target: null, expect: null };
  } else {
    if (!plan.sel.startsWith('@')) {
      f = evalAnswer(await call(['eval', fieldProbeJs(plan.asked, { css: plan.sel })]));
      if (f && f.tag) setVia = { target: { css: plan.sel }, expect: null };
      else if (!f) return unavailable('its target could not be read back afterwards');
      else f = null; // a selector the page cannot read or find (the driver's own form, another frame): read it through the driver
    }
    if (!f) {
      const v = driverRead(await call(['get', 'value', plan.sel, '--json']));
      if (v === null) return unavailable('its target could not be read back through the browser');
      if (matches(v)) return null;
      if (plan.verb !== 'fill' && /[\n\r\t]/.test(plan.asked)) return null;
      const kind = driverRead(await call(['get', 'attr', plan.sel, 'type', '--json']), { absentIsEmpty: true }); // get attr <selector> <name>
      // a kind the browser could not read is never judged as a field: «could not confirm», the value never shown
      if (kind === null) return unavailable('its kind could not be read through the browser, so what it holds could not be confirmed');
      const k = String(kind).toLowerCase() || 'text';
      if (FIELD_FORMS[k]) {
        f = { tag: 'input', kind: k, has: true, equal: false, includes: false, len: v.length, locked: false, value: v };
        setVia = { target: null, expect: { kind: k, value: v }, focus: plan.sel };
      } else {
        f = { tag: 'input', kind: k, has: true, equal: v === plan.asked, includes: v.includes(plan.asked), len: v.length, locked: false, value: k === 'password' ? null : v.slice(0, READ_BACK_TEXT_MAX + 1) };
      }
    }
  }
  if (!f.tag) return null; // nothing focused that holds a value (a page, a rich editor): not judged
  const strict = plan.sel != null; // the TARGET was read: a finding may refuse; a bare keyboard type's finding is said
  const fail = (as, text, data) => (strict ? answer(1, as, text, data) : answer(0, as, `note: ${what} ran, but ${text.replace(/^nothing (was set|landed): /, '')}`, data));
  const form = f.tag === 'input' ? FIELD_FORMS[f.kind] : null;
  if (form) {
    if (f.locked) return fail('field_locked', `nothing was set: the ${f.kind} field is read-only or disabled`);
    if (f.equal) return null; // it already holds what was asked
    const clearing = plan.verb === 'fill' && plan.asked === '';
    if (!clearing && !form.re.test(plan.asked)) {
      return fail('field_form', `nothing was set: a ${f.kind} field takes no typed text and holds its value as ${form.example} (${form.words}) — your ${what} of ${shown(plan.asked)} is not in that form. Run: vibespace-browser fill ${target} ${form.example} (your value in that form)${f.kind === 'color' || f.kind === 'range' ? '' : ', or click the field and press each digit in the order it shows'}`, { kind: f.kind, form: form.example });
    }
    if (setVia.focus) { const fr = await call(['focus', setVia.focus]); if (!fr || fr.code !== 0) return unavailable(`the ${f.kind} field could not be focused for its own setter`); }
    const g = evalAnswer(await call(['eval', fieldSetJs(plan.asked, setVia.target, setVia.expect)]));
    if (g && g.locked) return fail('field_locked', `nothing was set: the ${f.kind} field is read-only or disabled`);
    if (!g || !g.set) return unavailable(g && g.why === 'not-target' ? `the focused field is not its target, so the ${f.kind} field's own setter was not run` : `the ${f.kind} field's own setter could not be run`);
    const got = String(g.value ?? ''), before = typeof g.before === 'string' ? g.before : f.value;
    if (clearing) return got === '' ? answer(0, 'field_cleared', `✓ Done — the ${f.kind} field is cleared, through the field's own setter, and read back`, { kind: f.kind, value: '', via: 'setter' })
      : fail('field_refused', `nothing was cleared: the ${f.kind} field still holds ${shown(got)} after an empty fill`, { kind: f.kind, value: got });
    if (form.norm(got) === form.norm(plan.asked)) return answer(0, 'field_setter', `✓ Done — the ${f.kind} field holds ${got}, set through the field's own setter (a ${f.kind} field takes no typed text) and read back`, { kind: f.kind, value: got, via: 'setter' });
    if (got === '' || (before !== null && before !== undefined && got === before)) return fail('field_refused', `nothing was set: the ${f.kind} field did not take ${shown(plan.asked)} (it holds ${shown(got)}) — a value outside its range or not a real ${f.kind === 'datetime-local' ? 'date and time' : f.kind} is refused by the field itself`, { kind: f.kind, value: got });
    return answer(0, 'field_differs', `set — but the ${f.kind} field holds ${shown(got)}, not ${shown(plan.asked)} (the field adjusted it to its own range or step)`, { kind: f.kind, value: got, via: 'setter' });
  }
  if (!f.has) return null;
  const secret = f.kind === 'password';
  if (plan.verb === 'fill' ? f.equal : f.includes) return null;
  if (plan.verb !== 'fill' && /[\n\r\t]/.test(plan.asked)) return null; // a line break or a tab may submit the form or move the focus: not judged
  if (f.len === 0 && plan.asked.length > 0) return strict ? answer(1, 'nothing_landed', `nothing landed: the ${f.kind} field is empty after your ${what} of ${secret ? `${plan.asked.length} characters` : shown(plan.asked)} — the page refused or cleared it`, { kind: f.kind, value: '' })
    : answer(0, 'nothing_landed', `note: ${what} ran, and the field focused afterwards (${f.kind}) is empty`, { kind: f.kind, value: '' });
  const holds = secret ? `${f.len} characters` : shown(f.value);
  return answer(0, 'field_differs', `${strict ? '' : 'note: '}${what === 'fill' ? 'filled' : 'typed'} — but the ${strict ? '' : 'focused '}${f.kind} field holds ${holds}, not ${plan.verb === 'fill' ? 'exactly ' : 'a text containing '}${secret ? `the ${plan.asked.length} characters you gave` : shown(plan.asked)} (the page reformatted, cut or moved it)`, { kind: f.kind, value: secret ? null : f.value });
}

module.exports = { FIELD_FORMS, READ_BACK_TEXT_MAX, fieldProbeJs, fieldSetJs, evalAnswer, driverRead, readBack };
