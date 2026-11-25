'use strict';
// THE ENTRY LABEL'S READING (主开发 r4483, the owner's word, 2026-11-25) — PURE: reads nothing. The verdict of the loopback
// measurement's entry pair (src/claude-oat-probe.js ENTRY_VARIANTS): the SAME short turn as the checkpoint pair — the mock's plan
// answers Read then Edit of a scratch note — WITHOUT the name (entry-off) and WITH CLAUDE_CODE_ENTRYPOINT=<name> (entry-on), each a
// fresh process, the vendor's program only against the loopback mock with made-up sign-in values. It RECORDS each request's
// head — the billing line's cc_entrypoint (the first system block, as the mock keeps it) and the user agent — and JUDGES three
// facts: (1) with the name, every messages request's billing line names it; (2) without it, none does (the CLI's own label);
// (3) the first stream events the CLI wrote (every event up to its first result) have the same shape both times. Every other
// difference in what the CLI sent (the checkpoint pair's comparison, src/ckpt-switch.js ckptVerdict, over the heads with the
// label masked) is RECORDED by name — read by the coordinator with the reading, never judged here. Its readers: the probe, the
// release road's script (scripts/measure-claude-cred-read.mjs --variant entry) and their suites; nothing on a device.
const { ckptVerdict } = require('./ckpt-switch.js');
const { ENTRY_VAR, OURS } = require('./claude-entry-label.js');

const ENTRY_VARIANTS = Object.freeze(['entry-off', 'entry-on']);
const ENTRY_DEFAULT_NAME = OURS;
const ENTRY_MARK_RE = /\bcc_entrypoint=([A-Za-z0-9_-]+)/;
const MASK = '<entry>';
const isRecord = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isMessages = (h) => isRecord(h) && /^\/v1\/messages(?:\?|$)/.test(String(h.path || '')) && !String(h.path || '').includes('count_tokens');

/** one request head's two marks: the billing line's cc_entrypoint (the first system block as the mock keeps it) and the user
 *  agent header → {mark: string | null, ua: string | null} */
function entryMarkOf(head) {
  const sh = isRecord(head) && isRecord(head.body) && typeof head.body.systemHead === 'string' ? head.body.systemHead : '';
  const m = ENTRY_MARK_RE.exec(sh);
  const hs = isRecord(head) && isRecord(head.headers) ? head.headers : {};
  const uaKey = Object.keys(hs).find((k) => k.toLowerCase() === 'user-agent');
  return { mark: m ? m[1] : null, ua: uaKey ? String(hs[uaKey]) : null };
}
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** a run's summary with its label masked (the billing line's value; the label's name inside the user agent, as a whole word) */
function maskEntry(summary, label) {
  if (!isRecord(summary)) return summary;
  const word = label ? new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(label)}(?=$|[^A-Za-z0-9_-])`, 'g') : null;
  const head = (h) => {
    if (!isRecord(h)) return h;
    const headers = isRecord(h.headers) ? Object.fromEntries(Object.entries(h.headers).map(([k, v]) => [k, k.toLowerCase() === 'user-agent' && word ? String(v).replace(word, `$1${MASK}`) : v])) : h.headers;
    const body = isRecord(h.body) && typeof h.body.systemHead === 'string' ? { ...h.body, systemHead: h.body.systemHead.replace(new RegExp(ENTRY_MARK_RE.source, 'g'), `cc_entrypoint=${MASK}`) } : h.body;
    return { ...h, headers, body };
  };
  return { ...summary, heads: (summary.heads || []).map(head), countHeads: (summary.countHeads || []).map(head) };
}
/** the shape of the first stream events a run wrote: every event up to and including its first `result`, each as its type, its
 *  subtype and its sorted top-level key names (never a value) → [string] */
function eventShapeOf(events) {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    const o = isRecord(e) && isRecord(e.o) ? e.o : e;
    if (!isRecord(o)) continue;
    out.push(`${String(o.type || '?')}${o.subtype ? '/' + String(o.subtype) : ''} {${Object.keys(o).sort().join(',')}}`);
    if (o.type === 'result') break;
  }
  return out;
}

/** PURE — the pair read. `off` / `on` = one run's summary (the checkpoint pair's: heads, countHeads, calls, files, edited,
 *  turnOk — plus `events`, the shape eventShapeOf answers), `name` = the name the run with it set → {verdict: 'PASS' | 'FAIL' |
 *  'INCOMPLETE', findings: [string] (the judged facts that failed), elsewhere: [string] (every other difference, recorded),
 *  marks: {off: {labels, uas}, on: {labels, uas}}, events: {off, on}} */
function entryVerdict(off, on, name) {
  const runOk = (r) => isRecord(r) && Array.isArray(r.heads) && Array.isArray(r.calls);
  if (!runOk(off) || !runOk(on)) return { verdict: 'INCOMPLETE', findings: ['both runs are needed (entry-off, then entry-on, in one invocation)'], elsewhere: [], marks: null, events: null };
  if (typeof name !== 'string' || !name) return { verdict: 'INCOMPLETE', findings: ['the name the run set is not known'], elsewhere: [], marks: null, events: null };
  if (off.turnOk !== true || on.turnOk !== true) return { verdict: 'INCOMPLETE', findings: [`the turn did not finish (${[off.turnOk !== true ? 'without' : null, on.turnOk !== true ? 'with' : null].filter(Boolean).join(' and ')} the name) — nothing is compared`], elsewhere: [], marks: null, events: null };
  const marksOf = (r) => { const ms = r.heads.filter(isMessages).map(entryMarkOf); return { n: ms.length, labels: [...new Set(ms.map((m) => m.mark))], uas: [...new Set(ms.map((m) => m.ua))] }; };
  const mOff = marksOf(off), mOn = marksOf(on);
  const findings = [];
  if (!mOn.n) findings.push('no messages request with the name set');
  else if (!(mOn.labels.length === 1 && mOn.labels[0] === name)) findings.push(`with the name, the billing line said ${JSON.stringify(mOn.labels)} — not «${name}» on every request`);
  if (!mOff.n) findings.push('no messages request without the name');
  else if (mOff.labels.includes(name)) findings.push(`without the name, the billing line already said «${name}»`);
  const own = mOff.labels.length === 1 ? mOff.labels[0] : null;
  const ev = { off: Array.isArray(off.events) ? off.events : [], on: Array.isArray(on.events) ? on.events : [] };
  if (!ev.off.length || !ev.on.length) findings.push(`no stream events to compare (${ev.off.length} without, ${ev.on.length} with the name)`);
  else if (JSON.stringify(ev.off) !== JSON.stringify(ev.on)) {
    const n = Math.max(ev.off.length, ev.on.length), d = [];
    for (let i = 0; i < n && d.length < 6; i++) if (ev.off[i] !== ev.on[i]) d.push(`#${i + 1} ${ev.off[i] || '(none)'} | ${ev.on[i] || '(none)'}`);
    findings.push(`the first stream events differ in shape: ${d.join('; ')}`);
  }
  const masked = ckptVerdict(maskEntry({ ...off, edited: off.edited !== false }, own), maskEntry({ ...on, edited: on.edited !== false }, name));
  const elsewhere = masked.verdict === 'DIFFERENT' ? masked.findings.map((f) => f.replace(/the switch/g, 'the name')) : masked.verdict === 'INCOMPLETE' ? masked.findings : [];
  return { verdict: findings.length ? 'FAIL' : 'PASS', findings, elsewhere, marks: { off: { labels: mOff.labels, uas: mOff.uas }, on: { labels: mOn.labels, uas: mOn.uas } }, events: ev, name, var: ENTRY_VAR };
}

module.exports = { ENTRY_VARIANTS, ENTRY_DEFAULT_NAME, ENTRY_MARK_RE, entryMarkOf, maskEntry, eventShapeOf, entryVerdict };
