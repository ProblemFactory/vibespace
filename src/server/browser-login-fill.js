'use strict';
/**
 * HUB-SIDE LOGIN FORM INSPECTION & CDP FILL ON STANDARD CHROME — ORCH (lane vault-login-chrome / vault-login-fill, R1 + R4).
 *
 * When a browser has no custom kernel `credentials` sink (standard Chrome on the `chromium`, `cloak` or `cdp` providers),
 * VibeSpace inspects the conversation's current tab over its own browser-endpoint CDP session and types the vault login's
 * secret values directly from the hub into the page's visible login fields:
 *
 *   · READ-ONLY FORM INSPECTION (`inspectTabLoginForm`): queries `<input>` elements in the tab, checks visibility
 *     (`!disabled`, `!readOnly`, `!hidden`, no `[hidden]` / `[aria-hidden="true"]` ancestor, computed `display !== 'none'`,
 *     `visibility !== 'hidden'`, bounding box ≥ 2×2), stamps `data-vs-login-field="vs-f-<i>"`, and returns ONLY attributes
 *     and labels (`type`, `autocomplete`, `name`, `id`, `aria-label`, `placeholder`, `inputmode`, `minlength`, `maxlength`,
 *     `pattern`, `required`, `<label>` text) — NEVER reading `.value`, `.defaultValue`, or `getAttribute('value')`.
 *     PURE `BL.classifyChromeForm` classifies the visible fields into the current step (`'email' | 'password' | 'totp'`).
 *   · HUB-SIDE CDP TYPING (`fillVaultLogin`, ONE writer): re-checks `window.location.origin` against the expected origin
 *     (`stale_origin` on mismatch), focuses each target field, clears via `HTMLInputElement.prototype.value` setter, types
 *     via CDP `Input.insertText` (firing trusted `input` events that both native HTML forms and React / Closure controlled
 *     value trackers accept), dispatches `change`, and on password / OTP fields installs a configurable `.value` getter mask
 *     returning `'••••••••'` so subsequent DOM `.value` reads (`get value`, `eval`) are masked just like Chrome's accessibility
 *     tree (`snapshot` → `••••`) while Blink's internal C++ form value and framework state hold the typed bytes.
 *   · SUBMIT (`--submit`): triggers `form.requestSubmit()` when inside a `<form>`, else clicks the visible submit /
 *     `[role="button"]` control in the active step container (or dispatches `Enter`).
 *   · ZERO LEAKAGE: secret values never leave this module's CDP call, never enter a return value, log line, or error string.
 */
const BL = require('../browser-login.js');

const MASK = '••••••••';
const SETTLE_SUBMIT_MS = 60;

/** Read-only DOM expression: collects visible `<input>` attributes & stamps `data-vs-login-field`. NEVER reads `.value`. */
const INSPECT_EXPR = `(() => {
  const pageOrigin = String(location.origin || '');
  if (!pageOrigin || pageOrigin === 'null') return null;
  const isVis = (el) => {
    if (!el || el.disabled || el.readOnly || el.hidden) return false;
    if (el.closest && el.closest('[hidden], [aria-hidden="true"]')) return false;
    const cs = window.getComputedStyle(el);
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  };
  const labelOf = (el) => {
    try {
      if (el.labels && el.labels.length) return String(el.labels[0].textContent || '').trim().slice(0, 80);
      const p = el.closest && el.closest('label');
      if (p) return String(p.textContent || '').trim().slice(0, 80);
    } catch {}
    return '';
  };
  const all = Array.from(document.querySelectorAll('input')).slice(0, 32);
  const fields = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!isVis(el)) continue;
    const fid = 'vs-f-' + i;
    try { el.setAttribute('data-vs-login-field', fid); } catch {}
    fields.push({
      fieldId: fid,
      type: String(el.getAttribute('type') || el.type || 'text').toLowerCase().slice(0, 32),
      autocomplete: String(el.getAttribute('autocomplete') || '').slice(0, 64),
      name: String(el.getAttribute('name') || '').slice(0, 80),
      id: String(el.id || '').slice(0, 80),
      ariaLabel: String(el.getAttribute('aria-label') || '').slice(0, 80),
      placeholder: String(el.getAttribute('placeholder') || '').slice(0, 80),
      inputMode: String(el.getAttribute('inputmode') || el.inputMode || '').slice(0, 32),
      label: labelOf(el),
      minLength: Number.isInteger(el.minLength) && el.minLength >= 0 ? el.minLength : null,
      maxLength: Number.isInteger(el.maxLength) && el.maxLength >= 0 && el.maxLength <= 4096 ? el.maxLength : null,
      pattern: typeof el.getAttribute('pattern') === 'string' && el.getAttribute('pattern') ? el.getAttribute('pattern').slice(0, 260) : null,
      required: !!el.required,
      visible: true
    });
  }
  return { pageOrigin, frameOrigin: pageOrigin, fields };
})()`;

/** Resolve a `(method, params) => Promise<cdpReply>` caller from `{ tab, call, sessionId }`. */
function callerOf({ tab = null, call = null, sessionId = null } = {}) {
  const sid = sessionId || (tab && (tab.sid || tab.sessionId)) || null;
  if (typeof call === 'function') return (m, p = {}) => call(m, p, sid);
  if (typeof tab === 'function') return (m, p = {}) => tab(m, p, sid);
  if (tab && typeof tab.call === 'function') return (m, p = {}) => tab.call(m, p, sid);
  if (tab && typeof tab.send === 'function') return (m, p = {}) => tab.send(m, p, sid);
  return null;
}

function evalValue(r) {
  if (!r || r.timeout || r.error) return { ok: false, code: r && r.timeout ? 'timeout' : 'eval_failed' };
  const res = r.result && r.result.result ? r.result.result : (r.result || null);
  if (!res || (r.result && r.result.exceptionDetails)) return { ok: false, code: 'eval_failed' };
  return { ok: true, value: res.value };
}

/**
 * Inspect a standard Chrome tab's current DOM for visible login fields (without ever reading `.value`).
 * → a `BL.formOf` record with `.step` (`'email' | 'password' | 'totp'`), or `null` when no login form is present.
 */
async function inspectTabLoginForm({ tab = null, call = null, sessionId = null, targetId = null, now = Date.now() } = {}) {
  const send = callerOf({ tab, call, sessionId });
  if (!send) return null;
  const tid = targetId || (tab && tab.targetId) || 'tab';
  const r = await send('Runtime.evaluate', { expression: INSPECT_EXPR, returnByValue: true });
  const ev = evalValue(r);
  if (!ev.ok || !ev.value || typeof ev.value !== 'object') return null;
  return BL.classifyChromeForm({ ...ev.value, targetId: tid }, { now });
}

/** Build the focus + clear expression for one stamped `fieldId` (contains no secret value). */
function prepareFieldExpr(fieldId, expectOrigin) {
  return `(() => {
    const curOrigin = String(location.origin || '');
    const want = ${JSON.stringify(expectOrigin || '')};
    if (want && curOrigin !== want) return { ok: false, code: 'stale_origin', origin: curOrigin };
    const el = document.querySelector('[data-vs-login-field=' + ${JSON.stringify(JSON.stringify(String(fieldId)))} + ']');
    if (!el || el.disabled || el.readOnly || el.hidden) return { ok: false, code: 'no_such_surface' };
    if (el.closest && el.closest('[hidden], [aria-hidden="true"]')) return { ok: false, code: 'no_such_surface' };
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || r.width < 2 || r.height < 2) return { ok: false, code: 'no_such_surface' };
    try { delete el.value; } catch {}
    el.focus();
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (d && d.set) d.set.call(el, '');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    const it = String(el.getAttribute('type') || el.type || '').toLowerCase();
    const ac = String(el.getAttribute('autocomplete') || '').toLowerCase();
    return { ok: true, secret: it === 'password' || ac === 'one-time-code' };
  })()`;
}

/** Verify that `Input.insertText` populated the field, dispatch `change`, and install the `.value` getter mask on secret fields.
 *  Contains NO secret value in the expression. */
function finalizeFieldExpr(fieldId, maskSecret) {
  return `(() => {
    const el = document.querySelector('[data-vs-login-field=' + ${JSON.stringify(JSON.stringify(String(fieldId)))} + ']');
    if (!el) return { ok: false, code: 'no_such_surface' };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const cur = d && d.get ? String(d.get.call(el) || '') : '';
    if (!cur.length) return { ok: false, code: 'empty_after_insert' };
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (${maskSecret ? 'true' : 'false'}) {
      try {
        Object.defineProperty(el, 'value', {
          configurable: true,
          get() { return ${JSON.stringify(MASK)}; },
          set(v) { try { delete el.value; } catch {} if (d && d.set) d.set.call(this, v); }
        });
      } catch {}
    }
    return { ok: true };
  })()`;
}

/** Fallback when `Input.insertText` did not land (e.g. focus was stolen by page script): set via prototype setter + `input`/`change` + mask. */
function fallbackSetExpr(fieldId, fallbackVal, maskSecret) {
  return `(() => {
    const el = document.querySelector('[data-vs-login-field=' + ${JSON.stringify(JSON.stringify(String(fieldId)))} + ']');
    if (!el) return { ok: false, code: 'no_such_surface' };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (d && d.set) d.set.call(el, ${JSON.stringify(String(fallbackVal))});
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (${maskSecret ? 'true' : 'false'}) {
      try {
        Object.defineProperty(el, 'value', {
          configurable: true,
          get() { return ${JSON.stringify(MASK)}; },
          set(v) { try { delete el.value; } catch {} if (d && d.set) d.set.call(this, v); }
        });
      } catch {}
    }
    return { ok: true };
  })()`;
}

/** Trigger form submission on the last filled field (`requestSubmit()` inside a `<form>`, else the visible action button, else Enter). */
function submitFieldExpr(fieldId) {
  return `(() => {
    const el = document.querySelector('[data-vs-login-field=' + ${JSON.stringify(JSON.stringify(String(fieldId)))} + ']');
    if (!el) return { ok: false, code: 'no_such_surface' };
    const isVis = (x) => {
      if (!x || x.disabled || x.hidden) return false;
      if (x.closest && x.closest('[hidden], [aria-hidden="true"]')) return false;
      const cs = window.getComputedStyle(x);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = x.getBoundingClientRect();
      return r.width >= 2 && r.height >= 2;
    };
    if (el.form) {
      if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
      else el.form.submit();
      return { ok: true, how: 'form' };
    }
    const scopes = [el.closest && el.closest('form, [id], section, main, div'), document.body].filter(Boolean);
    for (const sc of scopes) {
      const btn = Array.from(sc.querySelectorAll('button, input[type="submit"], [role="button"]')).find(isVis);
      if (btn) { btn.click(); return { ok: true, how: 'button' }; }
    }
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return { ok: true, how: 'enter' };
  })()`;
}

/**
 * Contract function: fill a vault login's value(s) into the current step's form on a standard Chrome tab over CDP.
 *
 * @param {object} o
 * @param {object|function} o.tab        Tab descriptor `{ call, sid/sessionId, targetId }` or CDP caller function
 * @param {function} [o.call]            Optional CDP caller `(method, params, sessionId) => Promise`
 * @param {string} [o.sessionId]         Optional CDP target sessionId
 * @param {string} [o.origin]            Expected page origin (`https://host[:port]` or loopback `http://127.0.0.1:port`)
 * @param {string} [o.expectedOrigin]    Alias of `origin`
 * @param {string} [o.loginId]           Login identifier / name for the receipt (`filled`)
 * @param {string} [o.step]              Step override (`'email' | 'password' | 'totp'`); auto-detected when omitted
 * @param {object} [o.values]            Pre-planned `{ [fieldId]: string }` map from `logins.planFill`
 * @param {object} [o.secret]            Optional `{ username, password, newPassword, otp }` when `values` is not pre-planned
 * @param {object} [o.form]              Optional pre-inspected form from `inspectTabLoginForm`
 * @param {boolean} [o.submit=false]     Whether to submit the form / step after filling
 */
async function fillVaultLogin({ tab = null, call = null, sessionId = null, origin = null, expectedOrigin = null, loginId = null, step = null, values = null, secret = null, form = null, submit = false } = {}) {
  const send = callerOf({ tab, call, sessionId });
  if (!send) return { ok: false, code: 'not_attached', error: 'VibeSpace is not attached to that tab — nothing was filled' };
  const wantOrigin = BL.originOf(expectedOrigin || origin);
  if ((expectedOrigin || origin) && !wantOrigin) return { ok: false, code: 'login_bad_origin', error: 'not a valid origin' };
  let curForm = form;
  if (!curForm || !values) {
    curForm = await inspectTabLoginForm({ tab, call, sessionId });
    if (!curForm) return { ok: false, code: 'login_no_form', error: 'no login form is on your tab — open the site\'s sign-in page first' };
  }
  if (wantOrigin && curForm.pageOrigin !== wantOrigin) return { ok: false, code: 'stale_origin', error: `the page is no longer ${wantOrigin}` };
  let fieldMap = values && typeof values === 'object' ? { ...values } : null;
  if (!fieldMap && secret && typeof secret === 'object') {
    const plan = BL.planOf(curForm, secret.newPassword ? (curForm.kind === 'change-password' ? 'change' : 'signup') : 'login');
    fieldMap = BL.valuesOf({ plan }, secret).values;
  }
  const secretFieldIds = new Set(
    ((curForm && curForm.fields) || [])
      .filter((f) => f && (f.type === 'password' || f.type === 'new-password' || f.type === 'otp'))
      .map((f) => f.fieldId)
  );
  const entries = Object.entries(fieldMap || {}).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.length > 0);
  fieldMap = null;
  secret = null;
  values = null;

  let lastFieldId = null;
  for (let i = 0; i < entries.length; i++) {
    const [fieldId, val] = entries[i];
    entries[i][1] = null; // drop reference as soon as read
    const prep = evalValue(await send('Runtime.evaluate', { expression: prepareFieldExpr(fieldId, wantOrigin || curForm.pageOrigin), returnByValue: true }));
    if (!prep.ok || !prep.value || !prep.value.ok) {
      const code = (prep.value && prep.value.code) || prep.code || 'eval_failed';
      return { ok: false, code, error: code === 'stale_origin' ? `the page is no longer ${wantOrigin || curForm.pageOrigin}` : `the browser did not fill the form (${code})` };
    }
    const isSecret = !!(prep.value.secret || secretFieldIds.has(fieldId));
    const ins = await send('Input.insertText', { text: val });
    const needFallback = !ins || ins.timeout || !!ins.error;
    const fin = !needFallback ? evalValue(await send('Runtime.evaluate', { expression: finalizeFieldExpr(fieldId, isSecret), returnByValue: true })) : null;
    if (!fin || !fin.ok || !fin.value || !fin.value.ok) {
      const fb = evalValue(await send('Runtime.evaluate', { expression: fallbackSetExpr(fieldId, val, isSecret), returnByValue: true }));
      if (!fb.ok || !fb.value || !fb.value.ok) return { ok: false, code: (fb.value && fb.value.code) || 'eval_failed', error: 'the browser did not finalize the field' };
    }
    lastFieldId = fieldId;
  }

  let submitted = false;
  if (submit && lastFieldId) {
    const sub = evalValue(await send('Runtime.evaluate', { expression: submitFieldExpr(lastFieldId), returnByValue: true }));
    if (!sub.ok || !sub.value || !sub.value.ok) return { ok: false, code: (sub.value && sub.value.code) || 'eval_failed', error: 'the browser could not submit the form' };
    submitted = true;
    await new Promise((r) => setTimeout(r, SETTLE_SUBMIT_MS));
  }

  const resolvedStep = (step && BL.STEPS.includes(step) ? step : null) || (curForm && curForm.step) || BL.stepOfForm(curForm) || 'password';
  return { ok: true, filled: loginId || (curForm && curForm.id) || 'login', step: resolvedStep, submitted };
}

module.exports = { inspectTabLoginForm, fillVaultLogin, MASK };
