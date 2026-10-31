'use strict';
/**
 * HUB-SIDE VAULT LOGIN FORM INSPECTION & CDP FILL ON STANDARD CHROME — ORCH
 * (lane vault-login-chrome, R1 + R4 root fix r3).
 *
 * When a browser profile runs standard Chrome (`w.kernel === false` — no custom `VibeSpace.*` CDP domain), the hub watch
 * (`src/server/browser-dialogs.js`) uses this module over its own CDP session on the conversation's tab:
 *   1. `inspectTabLoginForm({ call, browserCall, targetId, trackedUrl, now })` — queries browser-truth frame & target URLs
 *      (`Page.getFrameTree` + `Target.getTargetInfo`), creates a dedicated isolated world (`Page.createIsolatedWorld`), and
 *      collects ONLY read-only field metadata inside that isolated world (never main world, never reading `.value`, never
 *      writing DOM attributes), then passes it to PURE `BL.classifyChromeForm`. Cross-origin child frames holding login
 *      inputs are surfaced with their own `frameOrigin` so `BL.fillVerdict` refuses them by name (`login_phishing`).
 *   2. `fillVaultLogin({ call, browserCall, targetId, trackedUrl, origin, loginId, mode, step, values, secret, form, submit })` —
 *      re-verifies browser-truth origin against isolated-world `location.origin` and `origin` BEFORE touching any field,
 *      focuses each target element in the isolated world (verifying `document.activeElement === el` before and after),
 *      clears pre-filled text via the native prototype setter, and types the vault secret ONLY via `Input.insertText`
 *      (zero secret bytes ever enter `Runtime.evaluate` or `Debugger.getScriptSource`; any error, focus move, or cleared
 *      field wipes touched inputs and fails closed). No `.value` getter mask is placed on the element so the site's own
 *      submit scripts (`pw.value`, `FormData`, password-match checks) read the real value while the hub fences/scrubs
 *      agent read roads (`login_fill_live` + value-based scrubbing).
 */
const BL = require('../browser-login.js');

const WORLD_NAME = 'vs-login-fill';

/** Read-only DOM inspection inside our isolated world (`window.__vsFields` stays private to the isolated world; `.value` is NEVER read). */
const INSPECT_EXPR = `(() => {
  const str = (v) => (v == null ? '' : String(v));
  const isVisible = (el) => {
    if (!el || el.hidden || el.closest('[hidden], [aria-hidden="true"], template')) return false;
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const cs = window.getComputedStyle(cur);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      cur = cur.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const labelOf = (el) => {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(str(l.textContent).trim());
    const al = el.getAttribute('aria-label'); if (al) parts.push(al);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) for (const id of lb.split(/\\s+/)) { const n = id && document.getElementById(id); if (n) parts.push(str(n.textContent).trim()); }
    return parts.filter(Boolean).join(' ').slice(0, 200);
  };
  const map = Object.create(null);
  window.__vsFields = map;
  const nodes = Array.from(document.querySelectorAll('input, [role="textbox"]'));
  const fields = [];
  let idx = 0;
  for (const el of nodes) {
    if (idx >= 32) break;
    const tag = str(el.tagName).toLowerCase();
    const type = tag === 'input' ? str(el.getAttribute('type') || el.type || 'text').toLowerCase().trim() : '';
    if (tag === 'input' && ['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color'].includes(type)) continue;
    const vis = isVisible(el);
    const dis = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
    const ro = !!el.readOnly || el.getAttribute('aria-readonly') === 'true';
    if (!vis || dis || ro) continue;
    const fid = 'vs-f-' + (idx++);
    map[fid] = el;
    const minL = el.minLength; const maxL = el.maxLength;
    const pat = el.getAttribute('pattern');
    fields.push({
      fieldId: fid,
      tag,
      type: type || 'text',
      role: str(el.getAttribute('role') || ''),
      name: str(el.getAttribute('name') || '').slice(0, 120),
      id: str(el.id || '').slice(0, 120),
      autocomplete: str(el.getAttribute('autocomplete') || '').slice(0, 120),
      inputMode: str(el.getAttribute('inputmode') || '').slice(0, 40),
      placeholder: str(el.getAttribute('placeholder') || '').slice(0, 120),
      label: labelOf(el),
      visible: true,
      disabled: false,
      readOnly: false,
      constraints: {
        minLength: Number.isInteger(minL) && minL > 0 ? minL : null,
        maxLength: Number.isInteger(maxL) && maxL > 0 && maxL <= 4096 ? maxL : null,
        pattern: typeof pat === 'string' && pat ? pat.slice(0, 260) : null,
        required: !!el.required,
      },
    });
  }
  let actionOrigin = null;
  const firstEl = fields.length ? map[fields[0].fieldId] : null;
  const formEl = firstEl && firstEl.form ? firstEl.form : null;
  if (formEl && formEl.action) { try { actionOrigin = new URL(String(formEl.action), location.href).origin; } catch {} }
  return { ok: true, isoOrigin: String(location.origin || ''), isoHref: String(location.href || ''), actionOrigin, fields };
})()`;

/** Focus + clear in the isolated world BEFORE `Input.insertText`; verifies `document.activeElement === el` before & after clear. */
function prepareFieldExpr(fieldId) {
  return `(() => {
    const map = window.__vsFields;
    const el = map && map[${JSON.stringify(String(fieldId))}];
    if (!el || !el.isConnected) return { ok: false, code: 'field_gone' };
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const cs = window.getComputedStyle(cur);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return { ok: false, code: 'field_hidden' };
      cur = cur.parentElement;
    }
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || el.disabled || el.readOnly) return { ok: false, code: 'field_hidden' };
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
    el.focus();
    if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set && desc.get) {
      if (desc.get.call(el) !== '') {
        desc.set.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
      if (desc.get.call(el) !== '') return { ok: false, code: 'clear_blocked' };
    } else if (el.isContentEditable) {
      el.textContent = '';
      if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
    }
    return { ok: true };
  })()`;
}

/** Verify in the isolated world AFTER `Input.insertText` that focus stayed on `el` and exact character length landed; never carries a secret. */
function finalizeFieldExpr(fieldId, expectedLen) {
  const wantLen = Number(expectedLen) || 0;
  return `(() => {
    const wipe = (node) => {
      if (!node || node.nodeType !== 1) return;
      const p = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (node instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
      const d = p && Object.getOwnPropertyDescriptor(p, 'value');
      if (d && d.set) { try { d.set.call(node, ''); node.dispatchEvent(new Event('input', { bubbles: true })); } catch {} }
      else if (node.isContentEditable) { try { node.textContent = ''; } catch {} }
    };
    const map = window.__vsFields;
    const el = map && map[${JSON.stringify(String(fieldId))}];
    if (!el || !el.isConnected) { wipe(document.activeElement); return { ok: false, code: 'field_gone' }; }
    const activeOk = document.activeElement === el;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const lenBefore = desc && desc.get ? String(desc.get.call(el) || '').length : String(el.textContent || '').length;
    if (!activeOk || lenBefore !== ${wantLen}) {
      wipe(el);
      if (document.activeElement && document.activeElement !== el) wipe(document.activeElement);
      return { ok: false, code: !activeOk ? 'focus_moved' : 'field_cleared' };
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const lenAfter = desc && desc.get ? String(desc.get.call(el) || '').length : String(el.textContent || '').length;
    if (lenAfter !== ${wantLen}) {
      wipe(el);
      return { ok: false, code: 'field_cleared' };
    }
    return { ok: true };
  })()`;
}

/** Wipe any already-typed fields in this isolated world when a multi-field fill aborts mid-way. */
function wipeFieldsExpr(fieldIds) {
  const ids = Array.isArray(fieldIds) ? fieldIds.map(String) : [];
  return `(() => {
    const map = window.__vsFields;
    if (!map) return true;
    for (const id of ${JSON.stringify(ids)}) {
      const el = map[id];
      if (!el) continue;
      const p = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const d = Object.getOwnPropertyDescriptor(p, 'value');
      if (d && d.set) { try { d.set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); } catch {} }
    }
    return true;
  })()`;
}

/** Collect visible submit control candidates in the isolated world so `BL.isSubmitControl` classifies them in one place. */
function collectSubmitExpr(fieldId) {
  return `(() => {
    const map = window.__vsFields;
    const el = map && map[${JSON.stringify(String(fieldId))}];
    if (!el || !el.isConnected) return { ok: false, candidates: [] };
    const isVis = (b) => {
      if (!b || b.hidden || b.disabled || b.getAttribute('aria-disabled') === 'true' || b.closest('[hidden], [aria-hidden="true"], template')) return false;
      let cur = b;
      while (cur && cur.nodeType === 1) {
        const cs = window.getComputedStyle(cur);
        if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        cur = cur.parentElement;
      }
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const btnMap = Object.create(null);
    window.__vsBtns = btnMap;
    const seen = new Set();
    const candidates = [];
    let seq = 0;
    const addFrom = (root, inForm, depth) => {
      for (const b of root.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')) {
        if (seen.has(b) || !isVis(b)) continue;
        seen.add(b);
        const btnId = 'vs-b-' + (seq++);
        btnMap[btnId] = b;
        const tag = String(b.tagName || '').toLowerCase();
        candidates.push({
          btnId,
          inForm,
          depth,
          after: Boolean(el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
          visible: true,
          disabled: false,
          hidden: false,
          tag,
          type: String(b.getAttribute('type') || '').toLowerCase().trim(),
          role: String(b.getAttribute('role') || '').toLowerCase().trim(),
          text: String(b.textContent || '').slice(0, 120),
          value: tag === 'input' ? String(b.value || '').slice(0, 120) : '',
          ariaLabel: String(b.getAttribute('aria-label') || '').slice(0, 120),
          title: String(b.getAttribute('title') || '').slice(0, 120),
          name: String(b.getAttribute('name') || '').slice(0, 120),
          id: String(b.id || '').slice(0, 120),
          ariaPressed: b.getAttribute('aria-pressed'),
          ariaExpanded: b.getAttribute('aria-expanded'),
        });
      }
    };
    if (el.form) {
      addFrom(el.form, true, 0);
    } else {
      let scope = el.parentElement;
      let depth = 0;
      while (scope && scope !== document.documentElement) {
        addFrom(scope, false, depth++);
        scope = scope.parentElement;
      }
    }
    return { ok: true, hasForm: Boolean(el.form), candidates };
  })()`;
}

function triggerSubmitExpr(fieldId, btnId) {
  return `(() => {
    const map = window.__vsFields;
    const el = map && map[${JSON.stringify(String(fieldId))}];
    const btnMap = window.__vsBtns;
    window.__vsBtns = null;
    if (!el || !el.isConnected) return { ok: false, submitted: false };
    const btn = ${btnId ? `btnMap && btnMap[${JSON.stringify(String(btnId))}]` : 'null'};
    if (el.form) {
      if (btn && (btn.tagName === 'BUTTON' || btn.tagName === 'INPUT') && btn.type === 'submit') {
        if (typeof el.form.requestSubmit === 'function') {
          try { el.form.requestSubmit(btn); return { ok: true, submitted: true, via: 'form' }; } catch {}
        }
        btn.click();
        return { ok: true, submitted: true, via: 'button' };
      }
      if (btn) { btn.click(); return { ok: true, submitted: true, via: 'button' }; }
      if (typeof el.form.requestSubmit === 'function') {
        try { el.form.requestSubmit(); return { ok: true, submitted: true, via: 'form' }; } catch {}
      }
    }
    if (btn && btn.isConnected) {
      btn.click();
      return { ok: true, submitted: true, via: 'button' };
    }
    el.focus();
    return { ok: true, submitted: false, needEnter: true };
  })()`;
}

const valOf = (r) => (r && !r.timeout && !r.error && r.result && r.result.result ? r.result.result.value : null);

function makeSend(call, browserCall, sessionId) {
  return (method, params) => (method === 'Target.getTargetInfo' && typeof browserCall === 'function' ? browserCall(method, params) : call(method, params, sessionId));
}

async function evalInWorld(send, contextId, expression) {
  const r = await send('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: false });
  return valOf(r);
}

/** Query browser-truth target/frame URLs + open a fresh isolated world on the main frame (never main world). */
async function openIsolatedFrame({ call, browserCall = null, sessionId = undefined, targetId = null, trackedUrl = null, now = Date.now() } = {}) {
  const send = makeSend(call, browserCall, sessionId);
  const ftRes = await send('Page.getFrameTree', {});
  const ft = ftRes && !ftRes.timeout && !ftRes.error && ftRes.result ? ftRes.result.frameTree : null;
  const main = ft && ft.frame ? ft.frame : null;
  const frameId = main && main.id ? String(main.id) : '';
  if (!frameId) return { ok: false, code: 'no_frame' };
  const frameUrl = String(main.url || '');
  const frameOrigin = BL.originOf(frameUrl);
  const secRaw = typeof main.securityOrigin === 'string' && main.securityOrigin && main.securityOrigin !== 'null' ? main.securityOrigin : '';
  const secOrigin = secRaw ? BL.originOf(secRaw) : frameOrigin;

  const tiRes = await send('Target.getTargetInfo', targetId ? { targetId: String(targetId) } : {});
  const ti = tiRes && !tiRes.timeout && !tiRes.error && tiRes.result ? tiRes.result.targetInfo : null;
  const resolvedTargetId = String(targetId || (ti && ti.targetId) || frameId);
  const targetUrl = ti && typeof ti.url === 'string' ? ti.url : '';
  const trkRaw = typeof trackedUrl === 'function' ? trackedUrl() : trackedUrl;
  const trackedOrigin = trkRaw ? BL.originOf(trkRaw) : null;
  const targetOrigin = targetUrl ? BL.originOf(targetUrl) : (trackedOrigin || frameOrigin);

  const iwRes = await send('Page.createIsolatedWorld', { frameId, worldName: WORLD_NAME, grantUniveralAccess: false });
  const contextId = iwRes && !iwRes.timeout && !iwRes.error && iwRes.result ? Number(iwRes.result.executionContextId) : 0;
  if (!Number.isInteger(contextId) || contextId <= 0) return { ok: false, code: 'no_isolated_world' };

  const raw = await evalInWorld(send, contextId, INSPECT_EXPR);
  if (!raw || !raw.ok) return { ok: false, code: 'inspect_failed' };
  const isoOrigin = BL.originOf(raw.isoOrigin || raw.isoHref);

  // Every browser-truth origin witness must be HTTP(S) and agree with the isolated world's location.origin.
  if (!frameOrigin || !secOrigin || !targetOrigin || !isoOrigin || frameOrigin !== secOrigin || frameOrigin !== targetOrigin || frameOrigin !== isoOrigin || (trackedOrigin && trackedOrigin !== frameOrigin)) {
    return { ok: false, code: 'origin_mismatch', mismatch: true, browserOrigin: trackedOrigin || targetOrigin || frameOrigin, isoOrigin, targetId: resolvedTargetId };
  }

  let form = BL.classifyChromeForm({
    targetId: resolvedTargetId,
    pageOrigin: frameOrigin,
    frameOrigin,
    actionOrigin: raw.actionOrigin,
    fields: raw.fields,
  }, { now });

  // If the top document holds no sign-in fields, inspect cross-origin child frames in their own isolated worlds so embedded phishing forms are named `login_phishing`.
  if (!form && Array.isArray(ft.childFrames)) {
    for (const cf of ft.childFrames.slice(0, 8)) {
      const sub = cf && cf.frame;
      const subId = sub && sub.id ? String(sub.id) : '';
      const subOrigin = sub && sub.url ? BL.originOf(sub.url) : null;
      if (!subId || !subOrigin || subOrigin === frameOrigin) continue;
      const subIw = await send('Page.createIsolatedWorld', { frameId: subId, worldName: WORLD_NAME, grantUniveralAccess: false });
      const subCtx = subIw && !subIw.timeout && !subIw.error && subIw.result ? Number(subIw.result.executionContextId) : 0;
      if (!Number.isInteger(subCtx) || subCtx <= 0) continue;
      const subRaw = await evalInWorld(send, subCtx, INSPECT_EXPR);
      if (!subRaw || !subRaw.ok) continue;
      const subForm = BL.classifyChromeForm({
        targetId: resolvedTargetId,
        pageOrigin: frameOrigin,
        frameOrigin: subOrigin,
        actionOrigin: subRaw.actionOrigin,
        fields: subRaw.fields,
      }, { now });
      if (subForm) { form = subForm; break; }
    }
  }

  return { ok: true, contextId, origin: frameOrigin, url: targetUrl || frameUrl, targetId: resolvedTargetId, form };
}

/** Inspect a standard Chrome tab's current document in an isolated world and return a `BL.classifyChromeForm` record (or `null`). */
async function inspectTabLoginForm({ call, browserCall = null, sessionId = undefined, targetId = null, trackedUrl = null, now = Date.now() } = {}) {
  if (typeof call !== 'function') return null;
  const iso = await openIsolatedFrame({ call, browserCall, sessionId, targetId, trackedUrl, now });
  if (!iso.ok) {
    if (iso.mismatch && iso.browserOrigin) {
      return BL.formOf({
        surfaceId: `chrome-mismatch-${String(iso.targetId || 'tab').slice(0, 24)}`,
        targetId: iso.targetId,
        pageOrigin: iso.browserOrigin,
        frameOrigin: iso.isoOrigin && iso.isoOrigin !== iso.browserOrigin ? iso.isoOrigin : 'https://origin-mismatch.invalid',
        fields: [{ fieldId: 'vs-f-0', type: 'password' }],
      }, { now });
    }
    return null;
  }
  return iso.form || null;
}

/**
 * Fill the vault's secret values into a standard Chrome tab over CDP (`Input.insertText` ONLY; isolated-world DOM focus/check;
 * zero secret bytes in `Runtime.evaluate`; no `.value` getter mask so site submit scripts read the real value).
 * Returns `{ ok: true, filled: loginId, step, submitted }` or `{ ok: false, code, error }` — NEVER a secret value.
 */
async function fillVaultLogin({ call, browserCall = null, sessionId = undefined, targetId = null, trackedUrl = null, origin = null, loginId = null, mode = 'login', step = null, values = null, secret = null, form = null, submit = false } = {}) {
  if (typeof call !== 'function') return { ok: false, code: 'not_attached', error: 'no CDP session for this tab' };
  const wantOrigin = BL.originOf(origin || (form && form.pageOrigin));
  if (!wantOrigin || !BL.secureOrigin(wantOrigin)) {
    return { ok: false, code: 'login_phishing', error: 'refused to fill credentials without a verified secure origin' };
  }

  // Re-verify browser-truth origin + isolated-world origin right before touching any field.
  const iso = await openIsolatedFrame({ call, browserCall, sessionId, targetId: targetId || (form && form.targetId) || null, trackedUrl });
  if (!iso.ok) {
    if (iso.mismatch) return { ok: false, code: 'login_phishing', error: `the browser target URL (${iso.browserOrigin || 'none'}) and the page origin disagree — nothing was filled` };
    return { ok: false, code: 'login_no_form', error: 'no sign-in form is visible on the current tab' };
  }
  if (iso.origin !== wantOrigin) {
    return { ok: false, code: 'login_phishing', error: `the tab is on ${iso.origin}, not ${wantOrigin} — nothing was filled` };
  }
  const curForm = iso.form;
  if (!curForm || !curForm.fields || !curForm.fields.length) {
    return { ok: false, code: 'login_no_form', error: 'no sign-in form is visible on the current tab' };
  }
  if (curForm.frameOrigin !== wantOrigin || curForm.pageOrigin !== wantOrigin) {
    return { ok: false, code: 'login_phishing', error: `the form sits in a frame of ${curForm.frameOrigin || 'another origin'} inside ${wantOrigin} — nothing was filled` };
  }

  const effectiveMode = mode === 'signup' || mode === 'change' ? mode : (secret && secret.newPassword && !secret.password ? 'signup' : secret && secret.newPassword && secret.password ? 'change' : curForm.kind === 'signup' ? 'signup' : curForm.kind === 'change-password' ? 'change' : 'login');

  // Map either pre-planned `{[fieldId]: value}` or `{username, password, newPassword, otp}` onto current isolated-world fieldIds.
  let fieldValues = values && typeof values === 'object' ? { ...values } : null;
  if (!fieldValues && secret && typeof secret === 'object') {
    const plan = BL.planOf(curForm, effectiveMode);
    fieldValues = BL.valuesOf({ plan }, secret).values;
  }
  const entries = fieldValues ? Object.entries(fieldValues).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.length > 0) : [];
  if (!entries.length) {
    return { ok: false, code: 'login_no_form', error: 'no matching visible fields on this sign-in step' };
  }

  const send = makeSend(call, browserCall, sessionId);
  const ctxId = iso.contextId;
  const touched = [];
  let lastFieldId = null;
  for (let i = 0; i < entries.length; i++) {
    const fieldId = entries[i][0];
    let val = entries[i][1];
    entries[i][1] = null; // drop reference as soon as read
    const prep = await evalInWorld(send, ctxId, prepareFieldExpr(fieldId));
    if (!prep || !prep.ok) {
      val = '';
      if (touched.length) await evalInWorld(send, ctxId, wipeFieldsExpr(touched));
      const why = (prep && prep.code) || 'field_gone';
      return { ok: false, code: 'login_failed', error: `could not prepare sign-in field (${why}) — nothing was submitted` };
    }
    touched.push(fieldId);
    const ins = await send('Input.insertText', { text: val });
    const expectedLen = val.length;
    val = '';
    if (!ins || ins.timeout || ins.error) {
      await evalInWorld(send, ctxId, wipeFieldsExpr(touched));
      return { ok: false, code: 'login_failed', error: 'Chrome rejected typing into the sign-in field — nothing was submitted' };
    }
    const fin = await evalInWorld(send, ctxId, finalizeFieldExpr(fieldId, expectedLen));
    if (!fin || !fin.ok) {
      await evalInWorld(send, ctxId, wipeFieldsExpr(touched));
      const why = (fin && fin.code) || 'field_cleared';
      return { ok: false, code: 'login_failed', error: `sign-in field rejected typed input (${why}) — nothing was submitted` };
    }
    lastFieldId = fieldId;
  }

  let submitted = false;
  if (submit && lastFieldId) {
    const subInfo = await evalInWorld(send, ctxId, collectSubmitExpr(lastFieldId));
    const matching = (subInfo && Array.isArray(subInfo.candidates) ? subInfo.candidates : []).filter((c) => BL.isSubmitControl(c, { mode: effectiveMode, inForm: Boolean(c.inForm) }));
    let chosen = null;
    if (matching.length) {
      const minDepth = Math.min(...matching.map((c) => Number(c.depth) || 0));
      const nearest = matching.filter((c) => (Number(c.depth) || 0) === minDepth);
      chosen = nearest.find((c) => c.after) || nearest[0] || null;
    }
    const sr = await evalInWorld(send, ctxId, triggerSubmitExpr(lastFieldId, chosen ? chosen.btnId : null));
    if (sr && sr.submitted) {
      submitted = true;
    } else if (sr && sr.needEnter) {
      const kd = await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      const ku = await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      submitted = !!(kd && !kd.timeout && !kd.error && ku && !ku.timeout && !ku.error);
    }
  }

  const resolvedStep = step && BL.STEPS.includes(step) ? step : (curForm.step || BL.stepOfForm(curForm) || 'password');
  return { ok: true, filled: loginId || (curForm && curForm.id) || 'login', step: resolvedStep, submitted };
}

module.exports = { inspectTabLoginForm, fillVaultLogin };
