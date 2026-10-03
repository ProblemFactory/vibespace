'use strict';
/**
 * THE USER'S LAYER — PURE (CJS; requires only the PURE src/design-model.js). Lane design-tweaks, design 003 §2 S4
 * (/var/tmp/vibespace-lanes/design-desk/claude-design-replica.md): a design's knobs are declared by the agent in
 * design.json (`tweaks`, validated by design-model.js validateManifest); the OWNER's values live in `user.json` beside
 * it — written only by the hub on the owner's act (src/server/design-engine.js setTweaks), read by the agent, never
 * written by it. This module is what the hub and the Design window do with that layer; the published page's viewer
 * never loads it (it gets the values already baked into each artboard).
 *
 *   validateDesign(json) / tweaksOf  design.json with each knob judged (≤ 12; closed keys per kind; ONE target — a
 *                                    custom property or a root data attribute; a default of the kind's grammar)
 *   validateUserLayer(json)          user.json → {v:1, tweaks:{<id>: value}} — closed keys, bounded, refusals by name
 *   userValues(manifest, user)       every declared knob's value: the user's when it fits, else the default; what no
 *                                    longer fits is DROPPED and said, never applied
 *   applyUser(html, manifest, user)  the layer baked into one artboard (the reader → the window, the preview, publish):
 *                                    ONE `<style id="vibespace-tweaks">:root{--x:v !important;…}</style>` at the head's
 *                                    start + ONE marked attribute run right after `<html` — idempotent
 *   userLayerOf(html) / stripUser    the layer found at exactly those two places (a linear tag walk — never a search of
 *                                    the whole artboard for our words); anything else is the artboard's own
 *   tweakSwap(before, after)         a live frame whose document differs ONLY in the layer restyles in place
 *                                    (`design-tweak` messages) instead of reloading
 *   tweaksRequestText(text)          "+ Tweaks": the owner's request line (the hub's door belts it)
 *
 * Gate: scripts/test-design-model.mjs §5d (+ its work meter and patched-copy controls).
 */
const M = require('./design-model.js');

const { USER_FILE, WALK } = M;
const TWEAK_LIMITS = Object.freeze({ ...M.TWEAK_LIMITS, labelChars: 60, optionCount: 12, numAbs: 100000, userChars: 16 * 1024, blockChars: 8 * 1024, requestChars: 400 });
const TWEAK_KINDS = Object.freeze(['color', 'range', 'select', 'toggle']);
const TWEAK_UNITS = Object.freeze(['', 'px', 'rem', 'em', '%', 'vw', 'vh', 'ch', 'fr', 'deg', 'ms', 's']);
const TWEAK_KEYS = Object.freeze({ common: Object.freeze(['id', 'label', 'kind', 'var', 'attr', 'default']), color: Object.freeze([]), range: Object.freeze(['min', 'max', 'step', 'unit']), select: Object.freeze(['options']), toggle: Object.freeze([]) });
const USER_KEYS = Object.freeze(['v', 'tweaks']);
const STYLE_OPEN = '<style id="vibespace-tweaks">';
const STYLE_CLOSE = '</style>';
const MARK = ' data-vibespace-tweaks="';
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const shown = (v, n = 40) => { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** Does `v` fit tweak `t` (a validated row)? A colour #rrggbb · a number inside min–max · one of the options · true / false. */
function tweakValueOk(t, v) {
  if (!isObj(t)) return false;
  if (t.kind === 'color') return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  if (t.kind === 'range') return isNum(v) && v >= t.min && v <= t.max;
  if (t.kind === 'select') return Array.isArray(t.options) && t.options.includes(v);
  return t.kind === 'toggle' && typeof v === 'boolean';
}
/** `design.json`'s `tweaks` (design-model.js validateManifest hands its `no` and the list, its shape judged) → the rows the panel draws: at most 12; per row the closed
 *  keys of its kind, ONE target (`var` or `attr`, each driven by one knob), a default of the kind's grammar. */
function tweaksOf(v, no) {
  const out = [], ids = new Set(), targets = new Set();
  if (v === undefined) return out;
  if (!Array.isArray(v)) return out;
  v.slice(0, TWEAK_LIMITS.tweakCount).forEach((x, i) => {
    let bad = false;
    const nope = (code, k, why) => { const w = `tweaks[${i}]${k ? '.' + k : ''}`; no(code, w, `${w} ${why}`); bad = true; };
    if (!isObj(x) || !TWEAK_KINDS.includes(x.kind)) return nope('bad_value', 'kind', `must be one of ${TWEAK_KINDS.join(', ')}`);
    const keys = [...TWEAK_KEYS.common, ...TWEAK_KEYS[x.kind]];
    for (const k of Object.keys(x)) if (!keys.includes(k)) nope('unknown_key', shown(k, 40), `is not a key of a ${x.kind} knob — it takes ${keys.join(', ')}`);
    if (typeof x.id !== 'string' || !ID_RE.test(x.id)) nope('bad_value', 'id', 'must be 1–40 letters, digits, _ or -');
    else if (ids.has(x.id)) nope('duplicate', 'id', `"${x.id}" is used twice`);
    ids.add(x.id);
    const label = x.label === undefined ? '' : typeof x.label === 'string' ? M.oneLine(x.label) : null;
    if (label === null || label.length > TWEAK_LIMITS.labelChars) nope('bad_value', 'label', `must be one line of at most ${TWEAK_LIMITS.labelChars} characters`);
    const isVar = x.var !== undefined, target = isVar ? x.var : x.attr;
    if (isVar === (x.attr !== undefined) || !(isVar ? M.isTweakVar(target) : M.isTweakAttr(target))) nope('bad_value', isVar ? 'var' : 'attr', 'must be ONE of "var": "--accent" (a custom property its CSS reads) or "attr": "data-density" (an attribute on the root element)');
    else if (targets.has(target)) nope('duplicate', isVar ? 'var' : 'attr', `${target} is driven by another knob`);
    targets.add(target);
    const row = { id: x.id, label: label || x.id, kind: x.kind, [isVar ? 'var' : 'attr']: target };
    if (x.kind === 'range') {
      for (const k of ['min', 'max', 'step']) if (x[k] !== undefined && !(isNum(x[k]) && Math.abs(x[k]) <= TWEAK_LIMITS.numAbs)) nope('bad_value', k, `must be a number of at most ${TWEAK_LIMITS.numAbs} either way`);
      if (!(x.min < x.max)) nope('out_of_range', 'max', 'must be a number above min (both are required)');
      if (x.step !== undefined && !(x.step > 0)) nope('out_of_range', 'step', 'must be above 0');
      if (x.unit !== undefined && !TWEAK_UNITS.includes(x.unit)) nope('bad_value', 'unit', `must be one of ${TWEAK_UNITS.filter(Boolean).join(' ')} (or "" for a bare number)`);
      Object.assign(row, { min: x.min, max: x.max, step: x.step || (x.max - x.min > 1 ? 1 : 0.01), unit: x.unit || '' });
    } else if (x.kind === 'select') {
      const o = Array.isArray(x.options) ? x.options : [];
      if (o.length < 2 || o.length > TWEAK_LIMITS.optionCount || !o.every(M.tweakWordOk) || new Set(o).size !== o.length) nope('bad_value', 'options', `must be 2–${TWEAK_LIMITS.optionCount} different values, each one line of at most ${TWEAK_LIMITS.wordChars} characters with no < > { } ; \\ ! or comment, quotes closed`);
      row.options = o.slice();
    }
    if (!bad && !tweakValueOk(row, x.default)) nope('bad_value', 'default', `must be ${x.kind === 'color' ? 'a colour #rrggbb' : x.kind === 'range' ? 'a number from min to max' : x.kind === 'select' ? 'one of its options' : 'true or false'}`);
    if (!bad) out.push({ ...row, default: x.kind === 'color' ? x.default.toLowerCase() : x.default });
  });
  return out;
}
/** design.json with its knobs judged — THE hub's reader of the manifest (the compose, the Tweaks read). */
function validateDesign(input) { return M.validateManifest(input, { tweaks: tweaksOf }); }

/** A value as the CSS / the root attribute receives it: a range's number (4 decimals) + its unit on a custom property; a
 *  toggle as 1 / 0 on a property (`calc(var(--x) * …)`), "true" / "false" on an attribute (`[data-x="true"]`). */
function tweakText(t, v) {
  if (!isObj(t)) return '';
  if (t.kind === 'range') { const n = String(Math.round(Number(v) * 10000) / 10000); return t.var ? n + (t.unit || '') : n; }
  if (t.kind === 'toggle') return t.var ? (v ? '1' : '0') : (v ? 'true' : 'false');
  return t.kind === 'color' ? String(v).toLowerCase() : String(v);
}

/** `user.json` (a string or a parsed value) → {ok:true, user:{v:1, tweaks}} | {ok:false, code, why}. Whatever wrote it is
 *  judged like any input (closed keys, bounded); whether a value fits its knob is the manifest's question (userValues). */
function validateUserLayer(input) {
  let j = input;
  if (typeof input === 'string') {
    if (input.length > TWEAK_LIMITS.userChars) return { ok: false, code: 'too_big', why: `user.json is over ${TWEAK_LIMITS.userChars / 1024} KB — it holds the user's tweak values only` };
    try { j = JSON.parse(input); } catch (e) { return { ok: false, code: 'bad_json', why: `user.json is not valid JSON (${shown(e && e.message, 120)})` }; }
  }
  if (!isObj(j)) return { ok: false, code: 'bad_json', why: 'user.json must hold one JSON object {"v": 1, "tweaks": {…}}' };
  for (const k of Object.keys(j)) if (!USER_KEYS.includes(k)) return { ok: false, code: 'unknown_key', why: `user.json has an unknown key "${shown(k)}" — it takes ${USER_KEYS.join(', ')}` };
  if (j.v !== 1) return { ok: false, code: 'bad_value', why: 'user.json must say "v": 1' };
  const tw = j.tweaks === undefined ? {} : j.tweaks;
  if (!isObj(tw)) return { ok: false, code: 'bad_type', why: 'user.json "tweaks" must be an object {"<tweak id>": value}' };
  const keys = Object.keys(tw);
  if (keys.length > TWEAK_LIMITS.tweakCount) return { ok: false, code: 'too_many', why: `user.json sets ${keys.length} tweaks — a design declares at most ${TWEAK_LIMITS.tweakCount}` };
  const tweaks = {};
  for (const k of keys) {
    if (!ID_RE.test(k)) return { ok: false, code: 'bad_value', why: `user.json names a tweak "${shown(k)}" — an id is 1–40 letters, digits, _ or -` };
    const v = tw[k];
    if (!(typeof v === 'boolean' || isNum(v) || (typeof v === 'string' && v.length <= TWEAK_LIMITS.wordChars))) return { ok: false, code: 'bad_value', why: `user.json's value for "${k}" is not a colour, a number, an option or true / false` };
    tweaks[k] = v;
  }
  return { ok: true, user: { v: 1, tweaks } };
}
/** The values a design shows → {values: every declared knob's (the user's when it fits, else its default), set: the
 *  user's that fit, dropped: [{id, why}]} — a value that no longer fits (the agent changed the knob) is said, never applied. */
function userValues(manifest, user) {
  const decl = isObj(manifest) && Array.isArray(manifest.tweaks) ? manifest.tweaks : [];
  const u = isObj(user) && isObj(user.tweaks) ? user.tweaks : {};
  const values = {}, set = {}, dropped = [];
  for (const t of decl) {
    values[t.id] = t.default;
    if (!hasOwn(u, t.id)) continue;
    if (tweakValueOk(t, u[t.id])) { values[t.id] = u[t.id]; set[t.id] = u[t.id]; }
    else dropped.push({ id: t.id, why: `the value set for "${t.id}" no longer fits the tweak — its default shows` });
  }
  for (const k of Object.keys(u)) if (!decl.some((t) => t.id === k)) dropped.push({ id: shown(k), why: `user.json sets "${shown(k)}", which design.json does not declare as a tweak` });
  return { values, set, dropped };
}
/** The file the hub writes. */
function userLayerText(set) { return JSON.stringify({ v: 1, tweaks: isObj(set) ? set : {} }, null, 2) + '\n'; }

// ── the documents ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Does `s` hold the literal `lit` at i (exact case)? */
function litAt(s, i, lit) {
  if (i < 0 || i + lit.length > s.length) return false;
  for (let k = 0; k < lit.length; k++) if (s.charCodeAt(i + k) !== lit.charCodeAt(k)) return false;
  return true;
}
/** The index past a tag's `>` from j (quoted attribute values skipped), or the end of the text. */
function tagEnd(s, j, n) {
  let q = 0;
  for (let k = j; k < n; k++) { const c = s.charCodeAt(k); if (q) { if (c === q) q = 0; } else if (c === 34 || c === 39) q = c; else if (c === 62) return k + 1; }
  return n;
}
/** The root and head open tags by a linear tag walk (design-model.js's own walker pieces: comments, the doctype and raw
 *  text skipped) → {html: the index just past `<html` (-1: none), htmlEnd: past its `>`, head: past the head's `>`} —
 *  the first of each, before any body. */
function rootTags(s) {
  const n = s.length;
  const out = { html: -1, htmlEnd: -1, head: -1 };
  let i = 0;
  while (i < n) {
    const lt = WALK.seek(s, 60, i, n);
    if (lt >= n) break;
    const c1 = s.charCodeAt(lt + 1);
    if (c1 === 33 && s.charCodeAt(lt + 2) === 45 && s.charCodeAt(lt + 3) === 45) { i = WALK.commentEnd(s, lt); continue; }
    if (c1 === 33 || c1 === 63) { i = WALK.seek(s, 62, lt, n) + 1; continue; }
    if (!WALK.isAlpha(c1)) { i = lt + 1; continue; }
    let j = lt + 1;
    while (j < n && WALK.isNameCh(s.charCodeAt(j))) j++;
    const tag = j - lt - 1 <= 16 ? s.slice(lt + 1, j).toLowerCase() : '';
    const gt = tagEnd(s, j, n);
    if (tag === 'html') { if (out.html < 0) { out.html = j; out.htmlEnd = gt; } }
    else if (tag === 'head') { out.head = gt; break; }
    else if (tag === 'body') break;
    i = gt;
    if (WALK.RAW_TEXT.has(tag)) i = WALK.rawEnd(s, i, tag);
  }
  return out;
}
const ATTR_RUN = / (data-[a-z][a-z0-9-]{0,39})="([^"<>]*)"/y;
const unAttr = (v) => v.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** The user's layer an artboard carries, found at its two places → {doc: the artboard without it, vars: [[name, value]],
 *  attrs: [[name, value]]}. A block or run that is not exactly what applyUser writes is the artboard's own — kept. */
function userLayerOf(html) {
  const s = String(html == null ? '' : html);
  const r = rootTags(s);
  let doc = s, vars = [], attrs = [];
  const at = r.head >= 0 ? r.head : r.htmlEnd;
  if (at >= 0 && litAt(s, at, STYLE_OPEN)) {
    const from = at + STYLE_OPEN.length, stop = Math.min(s.length, from + TWEAK_LIMITS.blockChars);
    let e = -1;
    for (let k = from; k < stop; k++) { if (s.charCodeAt(k) === 60) { if (litAt(s, k, STYLE_CLOSE)) e = k; break; } }
    const body = e > 0 ? s.slice(from, e) : '';
    if (body.startsWith(':root{') && body.endsWith('}')) {
      const got = [];
      for (const decl of body.slice(6, -1).split(';')) {
        const c = decl.indexOf(':');
        const name = c > 0 ? decl.slice(0, c) : '', val = decl.endsWith(' !important') ? decl.slice(c + 1, -11) : '';
        if (!M.isTweakVar(name) || !M.tweakWordOk(val)) { got.length = 0; break; }
        got.push([name, val]);
      }
      if (got.length) { vars = got; doc = s.slice(0, at) + s.slice(e + STYLE_CLOSE.length); }
    }
  }
  if (r.html >= 0 && litAt(doc, r.html, MARK)) {
    let p = r.html + MARK.length, cnt = 0, digits = 0;
    while (digits < 3 && p < doc.length) { const c = doc.charCodeAt(p); if (c < 48 || c > 57) break; cnt = cnt * 10 + c - 48; p++; digits++; }
    if (digits && cnt > 0 && cnt <= TWEAK_LIMITS.tweakCount && doc.charCodeAt(p) === 34) {
      p++;
      const got = [];
      for (let k = 0; k < cnt; k++) {
        ATTR_RUN.lastIndex = p;
        const m = ATTR_RUN.exec(doc);
        if (!m || !M.isTweakAttr(m[1]) || !M.tweakWordOk(unAttr(m[2]))) break;
        got.push([m[1], unAttr(m[2])]);
        p = ATTR_RUN.lastIndex;
      }
      if (got.length === cnt) { attrs = got; doc = doc.slice(0, r.html) + doc.slice(p); }
    }
  }
  return { doc, vars, attrs };
}
/** The artboard without the layer applyUser baked in (what the agent wrote). */
function stripUser(html) { return userLayerOf(html).doc; }
/** THE USER'S LAYER baked into one artboard: every declared knob at its value (the user's, else the default) — custom
 *  properties as ONE style block at the head's start (`!important`: the artboard's own :root rule cannot win over the
 *  user's choice), root attributes as ONE marked run right after `<html` (the parser keeps the FIRST of a repeated
 *  attribute, so the user's value wins over the one the agent wrote). Idempotent (the old layer comes out first); every
 *  word re-judged here — a value that could close the block is never written. No knobs = the document as written. */
function applyUser(html, manifest, user) {
  const s = stripUser(html);
  const decl = isObj(manifest) && Array.isArray(manifest.tweaks) ? manifest.tweaks.slice(0, TWEAK_LIMITS.tweakCount) : [];
  if (!decl.length) return s;
  const { values } = userValues({ tweaks: decl }, user);
  const vars = [], attrs = [];
  for (const t of decl) {
    if (!tweakValueOk(t, values[t.id])) continue;
    const w = tweakText(t, values[t.id]);
    if (!M.tweakWordOk(w)) continue;
    if (M.isTweakVar(t.var)) vars.push(`${t.var}:${w} !important`);
    else if (M.isTweakAttr(t.attr)) attrs.push(` ${t.attr}="${w.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
  }
  const r = rootTags(s);
  const at = r.head >= 0 ? r.head : r.htmlEnd;
  let out = s;
  if (vars.length && at >= 0) out = out.slice(0, at) + `${STYLE_OPEN}:root{${vars.join(';')}}${STYLE_CLOSE}` + out.slice(at);
  if (attrs.length && r.html >= 0) out = out.slice(0, r.html) + `${MARK}${attrs.length}"${attrs.join('')}` + out.slice(r.html);
  return out;
}
/** A frame shows `before` and the read now says `after`: when ONLY the user's layer moved (the same artboard, the same
 *  knobs) → the `design-tweak` messages that restyle it in place (no reload — its scroll and state stay); else null. */
function tweakSwap(before, after) {
  const a = String(before == null ? '' : before), b = String(after == null ? '' : after);
  if (a === b) return [];
  const la = userLayerOf(a), lb = userLayerOf(b);
  const same = (x, y) => x.length === y.length && x.every((p, i) => y[i][0] === p[0]);
  if (la.doc !== lb.doc || !same(la.vars, lb.vars) || !same(la.attrs, lb.attrs)) return null;
  const out = [];
  lb.vars.forEach(([n, v], i) => { if (la.vars[i][1] !== v) out.push({ kind: 'design-tweak', var: n, value: v }); });
  lb.attrs.forEach(([n, v], i) => { if (la.attrs[i][1] !== v) out.push({ kind: 'design-tweak', attr: n, value: v }); });
  return out;
}
/** "+ Tweaks" on a design that declares none: the owner's request, as their own message. COMPOSES only — the hub's one
 *  door belts the whole line (the comment's). */
function tweaksRequestText(text) {
  const t = M.cutText(M.oneLine(text), TWEAK_LIMITS.requestChars).replace(/\[(design [a-z]+)\]/gi, '($1)');
  return `[Design tweaks] Add Tweaks to this design: declare 3–8 knobs in design.json for what I would want to try${t ? ` — ${t}` : ' (accent colour, corner radius, density, type, dark / light)'}`;
}

module.exports = {
  USER_FILE, STYLE_OPEN, MARK, TWEAK_LIMITS, TWEAK_KINDS, TWEAK_UNITS, tweaksOf, validateDesign, tweakValueOk, tweakText, validateUserLayer, userValues, userLayerText,
  rootTags, userLayerOf, stripUser, applyUser, tweakSwap, tweaksRequestText,
};
