'use strict';
/**
 * HUB-SIDE VAULT LOGIN FORM INSPECTION & CDP FILL ON STANDARD CHROME — ORCH
 * (lane vault-login-chrome, R1 + R4 root fix r3 + r4).
 *
 * When a browser profile runs standard Chrome (`w.kernel === false` — no custom `VibeSpace.*` CDP domain), the hub watch
 * (`src/server/browser-dialogs.js`) uses this module over its own CDP session on the conversation's tab:
 *   1. `inspectTabLoginForm({ call, browserCall, targetId, trackedUrl, now })` — queries browser-truth frame & target URLs
 *      (`Page.getFrameTree` + `Target.getTargetInfo`, with a bounded retry for transient 302 commit skew), creates a
 *      dedicated isolated world (`Page.createIsolatedWorld`), stamps each candidate input with a stable non-positional
 *      `data-vs-login-field` token (plus an isolated-world WeakMap), and collects ONLY read-only field metadata inside
 *      that isolated world (never main world, never reading `.value`), then passes it to PURE `BL.classifyChromeForm`.
 *      All descendant frames (including `about:srcdoc` / `about:blank` / `data:` / sandboxed / same-origin frames and
 *      out-of-process cross-site `iframe` targets) are walked: cross-origin frames holding login inputs surface their
 *      own `frameOrigin` (`login_phishing`); local/embedded child frames surface `inFrame: true` (`login_in_frame`).
 *   2. `fillVaultLogin({ call, browserCall, targetId, trackedUrl, origin, loginId, mode, step, values, secret, form, submit })` —
 *      re-verifies browser-truth origin against isolated-world `location.origin` and `origin`, resolves every planned
 *      field by its stable per-element mark AND re-verifies its current DOM role/type against the plan BEFORE typing a
 *      single character (`login_form_changed` on any mismatch, nothing typed), marks all `<iframe>`/`<frame>` elements
 *      `inert` for the typing window (restored in `finally`), snapshots input character lengths before typing, and types
 *      secrets ONLY via `Input.insertText` (zero secret bytes ever enter `Runtime.evaluate` or `Debugger.getScriptSource`;
 *      any error, focus move, or cleared field wipes touched inputs, `activeElement`, and any input whose length grew
 *      since the pre-fill snapshot, and reports `attemptedInsert` so the read fence stays up).
 */
const BL = require('../browser-login.js');

const WORLD_NAME = 'vs-login-fill';
const REDIRECT_SETTLE_TRIES = 3;
const REDIRECT_SETTLE_MS = 25;
const MAX_CHILD_FRAMES = 64;
const lastContextByTarget = new Map(); // targetId|sessionId → last isolated-world contextId for snapshot-aware wipe

/** Read-only DOM inspection inside our isolated world (`window.vsLoginFields` stays private to the isolated world; `.value` is NEVER read). */
const INSPECT_EXPR = `(() => {
  const ATTR = 'data-vs-login-field';
  const str = (v) => (v == null ? '' : String(v));
  const mintId = (seq) => {
    try {
      if (typeof crypto === 'object' && crypto && typeof crypto.getRandomValues === 'function') {
        const u = new Uint32Array(2);
        crypto.getRandomValues(u);
        return 'vs-lf-' + u[0].toString(36) + u[1].toString(36);
      }
    } catch {}
    return 'vs-lf-' + Math.random().toString(36).slice(2, 10) + '-' + seq.toString(36);
  };
  const isVisible = (el) => {
    if (!el || el.hidden || (el.closest && el.closest('[hidden], [aria-hidden="true"], template'))) return false;
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
    const al = el.getAttribute && el.getAttribute('aria-label'); if (al) parts.push(al);
    const lb = el.getAttribute && el.getAttribute('aria-labelledby');
    if (lb) for (const id of lb.split(/\\s+/)) { const n = id && document.getElementById(id); if (n) parts.push(str(n.textContent).trim()); }
    return parts.filter(Boolean).join(' ').slice(0, 200);
  };
  const wm = window.vsLoginWeak || (window.vsLoginWeak = typeof WeakMap === 'function' ? new WeakMap() : null);
  const byId = window.vsLoginById || (window.vsLoginById = Object.create(null));
  const map = Object.create(null);
  window.vsLoginFields = map;
  const seenIds = new Set();
  const nodes = Array.from(document.querySelectorAll('input, [role="textbox"]'));
  const fields = [];
  let idx = 0;
  for (const el of nodes) {
    if (idx >= 32) break;
    const tag = str(el.tagName).toLowerCase();
    const attrType = tag === 'input' && el.getAttribute ? str(el.getAttribute('type') || '') : '';
    const domType = tag === 'input' ? str(el.type || attrType || 'text').toLowerCase().trim() : '';
    const type = tag === 'input' ? str(attrType || domType || 'text').toLowerCase().trim() : '';
    if (tag === 'input' && ['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color'].includes(domType || type)) continue;
    const vis = isVisible(el);
    const dis = !!el.disabled || (el.getAttribute && el.getAttribute('aria-disabled') === 'true');
    const ro = !!el.readOnly || (el.getAttribute && el.getAttribute('aria-readonly') === 'true');
    if (!vis || dis || ro) continue;
    let fid = wm && wm.has(el) ? wm.get(el) : '';
    if (!fid && el.getAttribute) {
      const existing = str(el.getAttribute(ATTR)).trim();
      if (/^vs-lf-[0-9a-z-]{4,40}$/.test(existing) && !seenIds.has(existing) && (!byId[existing] || byId[existing] === el)) fid = existing;
    }
    if (!fid || seenIds.has(fid)) fid = mintId(idx);
    seenIds.add(fid);
    idx++;
    if (wm) wm.set(el, fid);
    if (el.setAttribute && (!el.getAttribute || el.getAttribute(ATTR) !== fid)) { try { el.setAttribute(ATTR, fid); } catch {} }
    map[fid] = el;
    byId[fid] = el;
    const minL = el.minLength; const maxL = el.maxLength;
    const pat = el.getAttribute ? el.getAttribute('pattern') : null;
    fields.push({
      fieldId: fid,
      tag,
      domType: domType || type || 'text',
      type: domType || type || 'text',
      role: str(el.getAttribute && el.getAttribute('role')),
      name: str(el.getAttribute && el.getAttribute('name')).slice(0, 120),
      id: str(el.id || '').slice(0, 120),
      autocomplete: str(el.getAttribute && el.getAttribute('autocomplete')).slice(0, 120),
      inputMode: str(el.getAttribute && el.getAttribute('inputmode')).slice(0, 40),
      placeholder: str(el.getAttribute && el.getAttribute('placeholder')).slice(0, 120),
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
  let hasFrameEls = false;
  try { hasFrameEls = document.querySelectorAll('iframe, frame').length > 0; } catch {}
  return { ok: true, isoOrigin: String(location.origin || ''), isoHref: String(location.href || ''), actionOrigin, hasFrameEls, fields };
})()`;

/** Shared isolated-world helper snippet to resolve a stamped element uniquely by `data-vs-login-field` (with WeakMap/byId cross-check). */
const RESOLVE_EL_SRC = `
  const ATTR = 'data-vs-login-field';
  const resolveEl = (fid) => {
    const byId = window.vsLoginById;
    const map = window.vsLoginFields;
    let matches = [];
    try {
      matches = Array.from(document.querySelectorAll('[' + ATTR + ']')).filter((n) => n && n.getAttribute && n.getAttribute(ATTR) === fid);
    } catch {}
    if (matches.length > 1) return { el: null, duplicate: true };
    if (matches.length === 1) {
      const found = matches[0];
      if (byId && byId[fid] && byId[fid] !== found) return { el: null, moved: true };
      return { el: found };
    }
    const mem = (byId && byId[fid]) || (map && map[fid]) || null;
    if (mem && (!mem.getAttribute || mem.getAttribute(ATTR) === fid || mem.getAttribute(ATTR) == null)) return { el: mem };
    return { el: null };
  };
  const NON_TEXT_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color']);
  const isTextControl = (node) => {
    if (!node || node.nodeType !== 1) return false;
    const tag = String(node.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = String(node.type || (node.getAttribute && node.getAttribute('type')) || 'text').toLowerCase().trim();
      return !NON_TEXT_INPUT_TYPES.has(t);
    }
    if (node.isContentEditable) return true;
    const role = node.getAttribute ? String(node.getAttribute('role') || '').toLowerCase().trim() : '';
    return role === 'textbox';
  };
  const valOfNode = (node) => {
    if (!node || node.nodeType !== 1) return '';
    const p = typeof HTMLTextAreaElement === 'function' && node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (typeof HTMLInputElement === 'function' && node instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    const d = p && Object.getOwnPropertyDescriptor(p, 'value');
    if (d && d.get) { try { return String(d.get.call(node) || ''); } catch {} }
    if (typeof node.value === 'string') return node.value;
    if (node.isContentEditable) return String(node.textContent || '');
    return '';
  };
  const defValOfNode = (node) => {
    if (!node || node.nodeType !== 1) return '';
    const p = typeof HTMLTextAreaElement === 'function' && node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (typeof HTMLInputElement === 'function' && node instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    const d = p && Object.getOwnPropertyDescriptor(p, 'defaultValue');
    if (d && d.get) { try { return String(d.get.call(node) || ''); } catch {} }
    if (typeof node.defaultValue === 'string') return node.defaultValue;
    if (node.getAttribute) {
      const attr = node.getAttribute('value');
      if (typeof attr === 'string') return attr;
    }
    return '';
  };
  const lenOfNode = (node) => valOfNode(node).length;
  const wipeNode = (node) => {
    if (!node || node.nodeType !== 1) return false;
    const p = typeof HTMLTextAreaElement === 'function' && node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (typeof HTMLInputElement === 'function' && node instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    const d = p && Object.getOwnPropertyDescriptor(p, 'value');
    if (d && d.set) {
      try {
        if (!d.get || String(d.get.call(node) || '') !== '') {
          d.set.call(node, '');
          node.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      } catch {}
    }
    if (typeof node.value === 'string' && node.value !== '') {
      try { node.value = ''; node.dispatchEvent(new Event('input', { bubbles: true })); return true; } catch {}
    }
    if (node.isContentEditable && node.textContent) {
      try { node.textContent = ''; return true; } catch {}
    }
    return false;
  };
  const collectControls = (root, out = [], depth = 0) => {
    if (!root || depth > 8) return out;
    try {
      for (const node of root.querySelectorAll('input, textarea, [contenteditable], [role="textbox"]')) {
        out.push(node);
      }
      for (const host of root.querySelectorAll('*')) {
        if (host && host.shadowRoot) collectControls(host.shadowRoot, out, depth + 1);
      }
    } catch {}
    return out;
  };
`;

/** Before typing the FIRST character: verify every planned field still exists with its current DOM descriptor, snapshot
 *  the `.value.length` of every editable element on the page (for focus-theft residue wipe), and mark all `<iframe>`/`<frame>`
 *  elements `inert` for the typing window so cross-origin timer focus thieves cannot steal `Input.insertText`. */
function verifyPlanAndArmExpr(fieldIds) {
  const ids = Array.isArray(fieldIds) ? fieldIds.map(String) : [];
  return `(() => {
    ${RESOLVE_EL_SRC}
    const str = (v) => (v == null ? '' : String(v));
    const isVisible = (el) => {
      if (!el || el.hidden || (el.closest && el.closest('[hidden], [aria-hidden="true"], template'))) return false;
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
      const al = el.getAttribute && el.getAttribute('aria-label'); if (al) parts.push(al);
      const lb = el.getAttribute && el.getAttribute('aria-labelledby');
      if (lb) for (const id of lb.split(/\\s+/)) { const n = id && document.getElementById(id); if (n) parts.push(str(n.textContent).trim()); }
      return parts.filter(Boolean).join(' ').slice(0, 200);
    };
    const resolved = [];
    for (const fid of ${JSON.stringify(ids)}) {
      const got = resolveEl(fid);
      const el = got && got.el;
      if (!el || !el.isConnected) return { ok: false, code: 'login_form_changed', why: got && (got.duplicate || got.moved) ? 'field_moved' : 'field_missing' };
      const dis = !!el.disabled || (el.getAttribute && el.getAttribute('aria-disabled') === 'true');
      const ro = !!el.readOnly || (el.getAttribute && el.getAttribute('aria-readonly') === 'true');
      if (!isVisible(el) || dis || ro) return { ok: false, code: 'login_form_changed', why: 'field_hidden' };
      const tag = str(el.tagName).toLowerCase();
      const attrType = tag === 'input' && el.getAttribute ? str(el.getAttribute('type') || '') : '';
      const domType = tag === 'input' ? str(el.type || attrType || 'text').toLowerCase().trim() : '';
      resolved.push({
        fieldId: fid,
        tag,
        domType: domType || 'text',
        type: domType || str(attrType || 'text').toLowerCase().trim() || 'text',
        role: str(el.getAttribute && el.getAttribute('role')),
        name: str(el.getAttribute && el.getAttribute('name')).slice(0, 120),
        id: str(el.id || '').slice(0, 120),
        autocomplete: str(el.getAttribute && el.getAttribute('autocomplete')).slice(0, 120),
        inputMode: str(el.getAttribute && el.getAttribute('inputmode')).slice(0, 40),
        placeholder: str(el.getAttribute && el.getAttribute('placeholder')).slice(0, 120),
        label: labelOf(el),
        visible: true,
        disabled: false,
        readOnly: false,
      });
    }
    const prevSnap = window.vsLoginSnap;
    const snap = typeof WeakMap === 'function' ? new WeakMap() : null;
    const snapList = [];
    try {
      for (const node of collectControls(document)) {
        if (!isTextControl(node)) continue;
        let len = lenOfNode(node);
        if (prevSnap && prevSnap.wm && prevSnap.wm.has(node)) len = prevSnap.wm.get(node) || 0;
        else if (prevSnap && Array.isArray(prevSnap.list)) {
          const hit = prevSnap.list.find((x) => x && x.node === node);
          if (hit) len = hit.len || 0;
        }
        if (snap) snap.set(node, len);
        snapList.push({ node, len });
      }
    } catch {}
    window.vsLoginSnap = { wm: snap, list: snapList };
    const touchedSet = window.vsLoginTouched instanceof Set ? window.vsLoginTouched : new Set();
    for (const fid of ${JSON.stringify(ids)}) {
      const got = resolveEl(fid);
      if (got && got.el) touchedSet.add(got.el);
    }
    window.vsLoginTouched = touchedSet;
    const savedFrames = [];
    try {
      for (const fr of document.querySelectorAll('iframe, frame')) {
        const hadStyleAttr = !!(fr.hasAttribute && fr.hasAttribute('style'));
        const prevDisplay = fr.style && typeof fr.style.getPropertyValue === 'function' ? fr.style.getPropertyValue('display') : '';
        const prevPriority = fr.style && typeof fr.style.getPropertyPriority === 'function' ? fr.style.getPropertyPriority('display') : '';
        savedFrames.push({
          el: fr,
          hadAttr: !!(fr.hasAttribute && fr.hasAttribute('inert')),
          prop: !!fr.inert,
          hadStyleAttr,
          prevDisplay,
          prevPriority,
        });
        try { fr.inert = true; } catch {}
        try { if (fr.setAttribute) fr.setAttribute('inert', ''); } catch {}
        try { if (fr.style && fr.style.setProperty) fr.style.setProperty('display', 'none', 'important'); } catch {}
        if (document.activeElement === fr && typeof fr.blur === 'function') { try { fr.blur(); } catch {} }
      }
      if (savedFrames.length && document.documentElement) {
        try { void document.documentElement.offsetHeight; } catch {}
      }
    } catch {}
    window.vsLoginFrames = savedFrames;
    return { ok: true, fields: resolved, framesArmed: savedFrames.length };
  })()`;
}

/** Restore every `<iframe>`/`<frame>` element's `inert` and inline `display` state after the typing window finishes. */
const RESTORE_FRAMES_EXPR = `(() => {
  const list = window.vsLoginFrames;
  window.vsLoginFrames = null;
  if (!Array.isArray(list)) return true;
  for (const it of list) {
    if (!it || !it.el) continue;
    try { it.el.inert = !!it.prop; } catch {}
    try {
      if (!it.hadAttr && it.el.removeAttribute) it.el.removeAttribute('inert');
      else if (it.hadAttr && it.el.setAttribute) it.el.setAttribute('inert', '');
    } catch {}
    try {
      if (it.el.style) {
        if (it.prevDisplay) it.el.style.setProperty('display', it.prevDisplay, it.prevPriority || '');
        else if (it.el.style.removeProperty) it.el.style.removeProperty('display');
        if (!it.hadStyleAttr && it.el.getAttribute && it.el.getAttribute('style') === '' && it.el.removeAttribute) {
          it.el.removeAttribute('style');
        }
      }
    } catch {}
  }
  return true;
})()`;

/** Focus + clear in the isolated world BEFORE `Input.insertText`; re-checks element identity, DOM type/role, and `document.activeElement === el`. */
function prepareFieldExpr(fieldId, expectedRole) {
  const role = String(expectedRole || '');
  return `(() => {
    ${RESOLVE_EL_SRC}
    const got = resolveEl(${JSON.stringify(String(fieldId))});
    const el = got && got.el;
    if (!el || !el.isConnected) return { ok: false, code: got && (got.duplicate || got.moved) ? 'role_changed' : 'field_gone' };
    const tag = String(el.tagName || '').toLowerCase();
    const domType = tag === 'input' ? String(el.type || (el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase().trim() : '';
    const wantRole = ${JSON.stringify(role)};
    if (wantRole === 'password' || wantRole === 'new-password') {
      if (tag !== 'input' || domType !== 'password') return { ok: false, code: 'role_changed' };
    } else if (wantRole === 'username') {
      if (tag === 'input' && !['text', 'email', 'tel', ''].includes(domType)) return { ok: false, code: 'role_changed' };
    } else if (wantRole === 'otp') {
      if (tag === 'input' && !['text', 'tel', 'number', 'password', ''].includes(domType)) return { ok: false, code: 'role_changed' };
    }
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const cs = window.getComputedStyle(cur);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return { ok: false, code: 'field_hidden' };
      cur = cur.parentElement;
    }
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || el.disabled || el.readOnly) return { ok: false, code: 'field_hidden' };
    try { if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
    if (window.vsLoginTouched instanceof Set) window.vsLoginTouched.add(el);
    else window.vsLoginTouched = new Set([el]);
    el.focus();
    if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
    const proto = typeof HTMLTextAreaElement === 'function' && el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (typeof HTMLInputElement === 'function' && el instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set && desc.get) {
      if (desc.get.call(el) !== '') {
        desc.set.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
      if (desc.get.call(el) !== '') return { ok: false, code: 'clear_blocked' };
    } else if (typeof el.value === 'string') {
      if (el.value !== '') {
        el.value = '';
        if (el.dispatchEvent) el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
      if (el.value !== '') return { ok: false, code: 'clear_blocked' };
    } else if (el.isContentEditable) {
      el.textContent = '';
      if (document.activeElement !== el) return { ok: false, code: 'focus_stolen' };
    }
    return { ok: true };
  })()`;
}

/** Verify in the isolated world AFTER `Input.insertText` that focus stayed on `el`, its type did not flip, and exact character length landed; never carries a secret. */
function finalizeFieldExpr(fieldId, expectedLen, expectedRole) {
  const wantLen = Number(expectedLen) || 0;
  const role = String(expectedRole || '');
  return `(() => {
    ${RESOLVE_EL_SRC}
    const got = resolveEl(${JSON.stringify(String(fieldId))});
    const el = got && got.el;
    if (!el || !el.isConnected) { wipeNode(document.activeElement); return { ok: false, code: 'field_gone' }; }
    const tag = String(el.tagName || '').toLowerCase();
    const domType = tag === 'input' ? String(el.type || (el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase().trim() : '';
    const wantRole = ${JSON.stringify(role)};
    if ((wantRole === 'password' || wantRole === 'new-password') && (tag !== 'input' || domType !== 'password')) {
      wipeNode(el);
      if (document.activeElement && document.activeElement !== el) wipeNode(document.activeElement);
      return { ok: false, code: 'role_changed' };
    }
    const activeOk = document.activeElement === el;
    const lenBefore = lenOfNode(el);
    if (!activeOk || lenBefore !== ${wantLen}) {
      wipeNode(el);
      if (document.activeElement && document.activeElement !== el) wipeNode(document.activeElement);
      return { ok: false, code: !activeOk ? 'focus_moved' : 'field_cleared' };
    }
    if (el.dispatchEvent) el.dispatchEvent(new Event('change', { bubbles: true }));
    const lenAfter = lenOfNode(el);
    if (lenAfter !== ${wantLen}) {
      wipeNode(el);
      return { ok: false, code: 'field_cleared' };
    }
    return { ok: true };
  })()`;
}

/** Wipe touched fields, `document.activeElement`, AND every editable node whose length GREW since the pre-fill snapshot (focus-theft hand-back defence). */
function wipeFailedFillExpr(fieldIds) {
  const ids = Array.isArray(fieldIds) ? fieldIds.map(String) : [];
  return `(() => {
    ${RESOLVE_EL_SRC}
    for (const id of ${JSON.stringify(ids)}) {
      const got = resolveEl(id);
      if (got && got.el) wipeNode(got.el);
    }
    if (document.activeElement) wipeNode(document.activeElement);
    const snap = window.vsLoginSnap;
    try {
      for (const node of collectControls(document)) {
        if (!isTextControl(node)) continue;
        const curLen = lenOfNode(node);
        if (curLen <= 0) continue;
        let baseLen = 0;
        if (snap && snap.wm && snap.wm.has(node)) baseLen = snap.wm.get(node) || 0;
        else if (snap && Array.isArray(snap.list)) {
          const hit = snap.list.find((x) => x && x.node === node);
          baseLen = hit ? (hit.len || 0) : 0;
        }
        if (curLen > baseLen) wipeNode(node);
      }
    } catch {}
    return true;
  })()`;
}

/** Isolated-world sweep that clears every text-capable control that received typed text (including disabled inputs, open shadow roots,
 *  and focus-stolen controls whose length grew since `vsLoginSnap`), while ignoring range/color/default-valued controls (`MAJOR B'`). */
function wipeTypedExpr(fieldIds) {
  const ids = Array.isArray(fieldIds) ? fieldIds.map(String).filter(Boolean) : [];
  return `(() => {
    ${RESOLVE_EL_SRC}
    let wiped = 0;
    let remaining = 0;
    try {
      const typedNodes = new Set();
      for (const fid of ${JSON.stringify(ids)}) {
        const got = resolveEl(fid);
        if (got && got.el) typedNodes.add(got.el);
      }
      if (window.vsLoginTouched instanceof Set) {
        for (const el of window.vsLoginTouched) if (el) typedNodes.add(el);
      }
      const snap = window.vsLoginSnap || null;
      for (const node of collectControls(document)) {
        if (!isTextControl(node)) continue;
        const curLen = lenOfNode(node);
        if (curLen <= 0) continue;
        const domType = String(node.type || (node.getAttribute && node.getAttribute('type')) || '').toLowerCase().trim();
        if (snap) {
          let baseLen = null;
          if (snap.wm && snap.wm.has(node)) baseLen = snap.wm.get(node) || 0;
          else if (Array.isArray(snap.list)) {
            const hit = snap.list.find((x) => x && x.node === node);
            if (hit) baseLen = hit.len || 0;
          }
          if (baseLen === null) baseLen = domType === 'password' ? 0 : defValOfNode(node).length;
          if (curLen > baseLen) typedNodes.add(node);
        } else if (domType === 'password' || node.isContentEditable || valOfNode(node) !== defValOfNode(node)) {
          typedNodes.add(node);
        }
      }
      for (const node of typedNodes) {
        if (node && lenOfNode(node) > 0 && wipeNode(node)) wiped++;
      }
      for (const node of typedNodes) {
        if (node && node.isConnected && lenOfNode(node) > 0) remaining++;
      }
    } catch {
      return { ok: false, wiped, remaining: 1 };
    }
    return { ok: true, wiped, remaining };
  })()`;
}

/** Collect visible submit control candidates in the isolated world so `BL.isSubmitControl` classifies them in one place. */
function collectSubmitExpr(fieldId) {
  return `(() => {
    ${RESOLVE_EL_SRC}
    const got = resolveEl(${JSON.stringify(String(fieldId))});
    const el = got && got.el;
    if (!el || !el.isConnected) return { ok: false, candidates: [] };
    const isVis = (b) => {
      if (!b || b.hidden || b.disabled || (b.getAttribute && b.getAttribute('aria-disabled') === 'true') || (b.closest && b.closest('[hidden], [aria-hidden="true"], template'))) return false;
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
    window.vsLoginBtns = btnMap;
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
          after: typeof Node === 'object' && el.compareDocumentPosition ? Boolean(el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : true,
          visible: true,
          disabled: false,
          hidden: false,
          tag,
          type: String((b.getAttribute && b.getAttribute('type')) || '').toLowerCase().trim(),
          role: String((b.getAttribute && b.getAttribute('role')) || '').toLowerCase().trim(),
          text: String(b.textContent || '').slice(0, 120),
          value: tag === 'input' ? String(b.value || '').slice(0, 120) : '',
          ariaLabel: String((b.getAttribute && b.getAttribute('aria-label')) || '').slice(0, 120),
          title: String((b.getAttribute && b.getAttribute('title')) || '').slice(0, 120),
          name: String((b.getAttribute && b.getAttribute('name')) || '').slice(0, 120),
          id: String(b.id || '').slice(0, 120),
          ariaPressed: b.getAttribute ? b.getAttribute('aria-pressed') : null,
          ariaExpanded: b.getAttribute ? b.getAttribute('aria-expanded') : null,
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
    ${RESOLVE_EL_SRC}
    const got = resolveEl(${JSON.stringify(String(fieldId))});
    const el = got && got.el;
    const btnMap = window.vsLoginBtns;
    window.vsLoginBtns = null;
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
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSend(call, browserCall, sessionId) {
  return (method, params) => (method === 'Target.getTargetInfo' && typeof browserCall === 'function' ? browserCall(method, params) : call(method, params, sessionId));
}

async function evalInWorld(send, contextId, expression) {
  const r = await send('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: false });
  return valOf(r);
}

function flattenDescendantFrames(tree, out = [], ids = new Set()) {
  if (!tree || typeof tree !== 'object') return { list: out, ids };
  if (tree.frame && tree.frame.id) ids.add(String(tree.frame.id));
  const kids = Array.isArray(tree.childFrames) ? tree.childFrames : [];
  for (const cf of kids) {
    if (!cf || typeof cf !== 'object') continue;
    if (cf.frame && cf.frame.id) {
      ids.add(String(cf.frame.id));
      if (out.length < MAX_CHILD_FRAMES) out.push(cf.frame);
    }
    if (Array.isArray(cf.childFrames) && cf.childFrames.length) flattenDescendantFrames(cf, out, ids);
  }
  return { list: out, ids };
}

function roleMatchesPlan(plannedRole, desc, { hasPassword = false } = {}) {
  if (!plannedRole || !desc || typeof desc !== 'object') return false;
  const tag = String(desc.tag || '').toLowerCase().trim();
  const domType = String(desc.domType || desc.type || '').toLowerCase().trim();
  const cls = BL.classifyLoginField(desc, { hasPassword });
  if (!cls) return false;
  if (plannedRole === 'password' || plannedRole === 'new-password') {
    if (tag !== 'input' || domType !== 'password') return false;
    return cls.type === plannedRole || (plannedRole === 'new-password' && cls.type === 'password');
  }
  if (plannedRole === 'otp') {
    if (tag === 'input' && !['text', 'tel', 'number', 'password', ''].includes(domType)) return false;
    return cls.type === 'otp';
  }
  if (plannedRole === 'username') {
    if (tag === 'input' && !['text', 'email', 'tel', ''].includes(domType)) return false;
    return cls.type === 'username';
  }
  return false;
}

/** Query browser-truth target/frame URLs + open a fresh isolated world on the main frame (never main world). */
async function openIsolatedFrame({ call, browserCall = null, oopFrames = null, sessionId = undefined, targetId = null, trackedUrl = null, now = Date.now() } = {}) {
  const send = makeSend(call, browserCall, sessionId);
  let ft = null, main = null, frameId = '', frameUrl = '', frameOrigin = null, secOrigin = null;
  let resolvedTargetId = '', targetUrl = '', trackedOrigin = null, targetOrigin = null, contextId = 0, raw = null, isoOrigin = null;

  for (let attempt = 0; attempt <= REDIRECT_SETTLE_TRIES; attempt++) {
    const ftRes = await send('Page.getFrameTree', {});
    ft = ftRes && !ftRes.timeout && !ftRes.error && ftRes.result ? ftRes.result.frameTree : null;
    main = ft && ft.frame ? ft.frame : null;
    frameId = main && main.id ? String(main.id) : '';
    if (!frameId) return { ok: false, code: 'no_frame' };
    frameUrl = String(main.url || '');
    frameOrigin = BL.originOf(frameUrl);
    const secRaw = typeof main.securityOrigin === 'string' && main.securityOrigin && main.securityOrigin !== 'null' ? main.securityOrigin : '';
    secOrigin = secRaw ? BL.originOf(secRaw) : (main.securityOrigin === 'null' ? null : frameOrigin);

    const tiRes = await send('Target.getTargetInfo', targetId ? { targetId: String(targetId) } : {});
    const ti = tiRes && !tiRes.timeout && !tiRes.error && tiRes.result ? tiRes.result.targetInfo : null;
    resolvedTargetId = String(targetId || (ti && ti.targetId) || frameId);
    targetUrl = ti && typeof ti.url === 'string' ? ti.url : '';
    const trkRaw = typeof trackedUrl === 'function' ? trackedUrl() : trackedUrl;
    trackedOrigin = trkRaw ? BL.originOf(trkRaw) : null;
    targetOrigin = targetUrl ? BL.originOf(targetUrl) : (trackedOrigin || frameOrigin);

    const iwRes = await send('Page.createIsolatedWorld', { frameId, worldName: WORLD_NAME, grantUniveralAccess: false });
    contextId = iwRes && !iwRes.timeout && !iwRes.error && iwRes.result ? Number(iwRes.result.executionContextId) : 0;
    if (!Number.isInteger(contextId) || contextId <= 0) return { ok: false, code: 'no_isolated_world' };

    raw = await evalInWorld(send, contextId, INSPECT_EXPR);
    if (!raw || !raw.ok) return { ok: false, code: 'inspect_failed' };
    isoOrigin = BL.originOf(raw.isoOrigin || raw.isoHref);

    const allAgree = !!(frameOrigin && secOrigin && targetOrigin && isoOrigin && frameOrigin === secOrigin && frameOrigin === targetOrigin && frameOrigin === isoOrigin && (!trackedOrigin || trackedOrigin === frameOrigin));
    if (allAgree) break;
    // Measured in headless Chrome: during a legitimate 302 redirect, Page.getFrameTree commits the destination ~5 ms before
    // Target.getTargetInfo and the watch's Page.frameNavigated catch up. Retry briefly before failing closed.
    const transientRedirectSkew = attempt < REDIRECT_SETTLE_TRIES && frameOrigin && secOrigin && isoOrigin && frameOrigin === secOrigin && frameOrigin === isoOrigin;
    if (!transientRedirectSkew) {
      return { ok: false, code: 'origin_mismatch', mismatch: true, browserOrigin: trackedOrigin || targetOrigin || frameOrigin, isoOrigin, targetId: resolvedTargetId };
    }
    await sleepMs(REDIRECT_SETTLE_MS);
  }

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

  // If the top document holds no sign-in fields, walk ALL descendant frames (and out-of-process cross-site iframe targets)
  // in their own isolated worlds: cross-origin frames ⇒ `login_phishing`; same-origin / srcdoc / blank / data / sandboxed local frames ⇒ `login_in_frame`.
  if (!form && ft) {
    const { list: descendants, ids: treeFrameIds } = flattenDescendantFrames(ft);
    let inFrameForm = null;
    for (const sub of descendants) {
      const subId = sub && sub.id ? String(sub.id) : '';
      if (!subId) continue;
      const subUrl = String(sub.url || '');
      const subOrigin = subUrl ? BL.originOf(subUrl) : null;
      const subSecRaw = typeof sub.securityOrigin === 'string' && sub.securityOrigin ? sub.securityOrigin : '';
      const subSecOrigin = subSecRaw && subSecRaw !== 'null' ? BL.originOf(subSecRaw) : null;
      const subIw = await send('Page.createIsolatedWorld', { frameId: subId, worldName: WORLD_NAME, grantUniveralAccess: false });
      const subCtx = subIw && !subIw.timeout && !subIw.error && subIw.result ? Number(subIw.result.executionContextId) : 0;
      if (!Number.isInteger(subCtx) || subCtx <= 0) continue;
      const subRaw = await evalInWorld(send, subCtx, INSPECT_EXPR);
      if (!subRaw || !subRaw.ok) continue;
      const isCrossOrigin = Boolean((subOrigin && subOrigin !== frameOrigin) || (subSecOrigin && subSecOrigin !== frameOrigin));
      const effFrameOrigin = isCrossOrigin ? (subOrigin && subOrigin !== frameOrigin ? subOrigin : subSecOrigin) : frameOrigin;
      const subForm = BL.classifyChromeForm({
        targetId: resolvedTargetId,
        pageOrigin: frameOrigin,
        frameOrigin: effFrameOrigin,
        actionOrigin: subRaw.actionOrigin,
        fields: subRaw.fields,
        inFrame: !isCrossOrigin,
      }, { now });
      if (!subForm) continue;
      if (isCrossOrigin) { form = subForm; break; }
      if (!inFrameForm) inFrameForm = subForm;
    }

    // Site-Isolated out-of-process cross-site iframes are separate CDP targets (`type === 'iframe'`, `parentFrameId` in `treeFrameIds`),
    // omitted from the parent session's `Page.getFrameTree.childFrames` (measured on Chrome). Inspect them briefly if `<iframe/frame>` elements exist.
    if (!form && raw.hasFrameEls && typeof oopFrames === 'function') {
      await oopFrames(treeFrameIds, async (oop) => {
        if (form || !oop || typeof oop.call !== 'function') return;
        const send = (m, p) => oop.call(m, p);
        const oopFt = await send('Page.getFrameTree', {});
        const oopFid = (oopFt && !oopFt.timeout && !oopFt.error && oopFt.result && oopFt.result.frameTree && oopFt.result.frameTree.frame && oopFt.result.frameTree.frame.id) || String(oop.targetId || '');
        if (!oopFid) return;
        const oopIw = await send('Page.createIsolatedWorld', { frameId: String(oopFid), worldName: WORLD_NAME, grantUniveralAccess: false });
        const oopCtx = oopIw && !oopIw.timeout && !oopIw.error && oopIw.result ? Number(oopIw.result.executionContextId) : 0;
        if (!Number.isInteger(oopCtx) || oopCtx <= 0) return;
        const oopRaw = await evalInWorld(send, oopCtx, INSPECT_EXPR);
        if (!oopRaw || !oopRaw.ok) return;
        const oopOrigin = oop.url ? BL.originOf(oop.url) : null;
        const isCross = !oopOrigin || oopOrigin !== frameOrigin;
        const oopForm = BL.classifyChromeForm({
          targetId: resolvedTargetId,
          pageOrigin: frameOrigin,
          frameOrigin: isCross ? (oopOrigin || 'https://cross-origin-frame.invalid') : frameOrigin,
          actionOrigin: oopRaw.actionOrigin,
          fields: oopRaw.fields,
          inFrame: !isCross,
        }, { now });
        if (!oopForm) return;
        if (isCross) form = oopForm;
        else if (!inFrameForm) inFrameForm = oopForm;
      });
    }

    if (!form && inFrameForm) form = inFrameForm;
  }

  return { ok: true, contextId, origin: frameOrigin, url: targetUrl || frameUrl, targetId: resolvedTargetId, form };
}

/** Inspect a standard Chrome tab's current document in an isolated world and return a `BL.classifyChromeForm` record (or `null`). */
async function inspectTabLoginForm({ call, browserCall = null, oopFrames = null, sessionId = undefined, targetId = null, trackedUrl = null, now = Date.now() } = {}) {
  if (typeof call !== 'function') return null;
  const iso = await openIsolatedFrame({ call, browserCall, oopFrames, sessionId, targetId, trackedUrl, now });
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

/** Wipe every control that received typed text on a tab inside our isolated world (including disabled inputs; ignoring range/color/default-valued inputs). */
async function wipeTabTypedInputs({ call, sessionId = undefined, targetId = null, contextId = 0, fieldIds = [] } = {}) {
  if (typeof call !== 'function') return { ok: false, wiped: 0, verifiedEmpty: false };
  const send = makeSend(call, null, sessionId);
  const expr = wipeTypedExpr(fieldIds);
  const ctxKey = String(targetId || sessionId || '');
  const savedCtx = Number(contextId) > 0 ? Number(contextId) : (ctxKey && lastContextByTarget.get(ctxKey)) || 0;
  let res = null;
  let timedOut = false;
  if (Number.isInteger(savedCtx) && savedCtx > 0) {
    const rawRes = await send('Runtime.evaluate', { expression: expr, contextId: savedCtx, returnByValue: true, awaitPromise: false });
    timedOut = Boolean(rawRes && rawRes.timeout);
    res = valOf(rawRes);
  }
  if ((!res || !res.ok) && !timedOut) {
    const ftRes = await send('Page.getFrameTree', {});
    const fid = (ftRes && !ftRes.timeout && !ftRes.error && ftRes.result && ftRes.result.frameTree && ftRes.result.frameTree.frame && ftRes.result.frameTree.frame.id) || '';
    if (!fid) return { ok: false, wiped: 0, verifiedEmpty: false };
    const iwRes = await send('Page.createIsolatedWorld', { frameId: String(fid), worldName: WORLD_NAME, grantUniveralAccess: false });
    const ctxId = iwRes && !iwRes.timeout && !iwRes.error && iwRes.result ? Number(iwRes.result.executionContextId) : 0;
    if (!Number.isInteger(ctxId) || ctxId <= 0) return { ok: false, wiped: 0, verifiedEmpty: false };
    res = await evalInWorld(send, ctxId, expr);
  }
  if (!res || !res.ok) return { ok: false, wiped: 0, verifiedEmpty: false };
  return { ok: true, wiped: Number(res.wiped) || 0, verifiedEmpty: Number(res.remaining) === 0 };
}

/**
 * Fill the vault's secret values into a standard Chrome tab over CDP (`Input.insertText` ONLY; isolated-world DOM focus/check;
 * zero secret bytes in `Runtime.evaluate`; no `.value` getter mask so site submit scripts read the real value).
 * Returns `{ ok: true, filled: loginId, step, submitted, contextId }` or `{ ok: false, code, error, attemptedInsert?, contextId? }` — NEVER a secret value.
 */
async function fillVaultLogin({ call, browserCall = null, oopFrames = null, sessionId = undefined, targetId = null, trackedUrl = null, origin = null, loginId = null, mode = 'login', step = null, values = null, secret = null, form = null, submit = false, onBeforeSubmit = null } = {}) {
  if (typeof call !== 'function') return { ok: false, code: 'not_attached', error: 'no CDP session for this tab' };
  const wantOrigin = BL.originOf(origin || (form && form.pageOrigin));
  if (!wantOrigin || !BL.secureOrigin(wantOrigin)) {
    return { ok: false, code: 'login_phishing', error: 'refused to fill credentials without a verified secure origin' };
  }

  // Re-verify browser-truth origin + isolated-world origin right before touching any field.
  const iso = await openIsolatedFrame({ call, browserCall, oopFrames, sessionId, targetId: targetId || (form && form.targetId) || null, trackedUrl });
  if (!iso.ok) {
    if (iso.mismatch) return { ok: false, code: 'login_phishing', error: `the browser target URL (${iso.browserOrigin || 'none'}) and the page origin disagree — nothing was filled` };
    return { ok: false, code: 'login_no_form', error: 'no sign-in form is visible on the current tab' };
  }
  if (iso.origin !== wantOrigin) {
    return { ok: false, code: 'login_phishing', error: `the tab is on ${iso.origin}, not ${wantOrigin} — nothing was filled` };
  }
  const curForm = iso.form;
  if (!curForm || !curForm.fields || !curForm.fields.length) {
    if (form && Array.isArray(form.fields) && form.fields.length) {
      return { ok: false, code: 'login_form_changed', error: 'the sign-in form changed before filling — nothing was typed' };
    }
    return { ok: false, code: 'login_no_form', error: 'no sign-in form is visible on the current tab' };
  }
  if (curForm.frameOrigin !== wantOrigin || curForm.pageOrigin !== wantOrigin) {
    return { ok: false, code: 'login_phishing', error: `the form sits in a frame of ${curForm.frameOrigin || 'another origin'} inside ${wantOrigin} — nothing was filled` };
  }
  if (curForm.inFrame) {
    return { ok: false, code: 'login_in_frame', error: `the sign-in form is inside a frame on ${wantOrigin} — open that frame's address directly or sign in in the live view` };
  }

  const effectiveMode = mode === 'signup' || mode === 'change' ? mode : (secret && secret.newPassword && !secret.password ? 'signup' : secret && secret.newPassword && secret.password ? 'change' : curForm.kind === 'signup' ? 'signup' : curForm.kind === 'change-password' ? 'change' : 'login');

  // Map either pre-planned `{[fieldId]: value}` or `{username, password, newPassword, otp}` onto isolated-world fieldIds,
  // and build the planned role table so every resolved element is re-verified against its planned role BEFORE typing.
  const plannedRoles = Object.create(null);
  const roleSource = form && Array.isArray(form.fields) && form.fields.length ? form.fields : curForm.fields;
  for (const f of roleSource || []) {
    if (f && typeof f.fieldId === 'string' && typeof f.type === 'string') plannedRoles[f.fieldId] = f.type;
  }

  let fieldValues = values && typeof values === 'object' ? { ...values } : null;
  if (!fieldValues && secret && typeof secret === 'object') {
    const plan = BL.planOf(curForm, effectiveMode);
    fieldValues = BL.valuesOf({ plan }, secret).values;
  }
  const entries = fieldValues ? Object.entries(fieldValues).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.length > 0) : [];
  if (!entries.length) {
    return { ok: false, code: 'login_no_form', error: 'no matching visible fields on this sign-in step' };
  }
  for (const [fid] of entries) {
    if (!plannedRoles[fid]) {
      return { ok: false, code: 'login_form_changed', error: 'the sign-in form changed before filling — nothing was typed' };
    }
  }

  const send = makeSend(call, browserCall, sessionId);
  const ctxId = iso.contextId;
  const ctxKey = String(iso.targetId || targetId || sessionId || '');
  if (ctxKey && Number.isInteger(ctxId) && ctxId > 0) {
    lastContextByTarget.delete(ctxKey);
    lastContextByTarget.set(ctxKey, ctxId);
    while (lastContextByTarget.size > 64) lastContextByTarget.delete(lastContextByTarget.keys().next().value);
  }
  const touched = [];
  let attemptedInsert = false;
  let lastFieldId = null;

  try {
    const ver = await evalInWorld(send, ctxId, verifyPlanAndArmExpr(entries.map(([k]) => k)));
    if (!ver || !ver.ok || !Array.isArray(ver.fields) || ver.fields.length !== entries.length) {
      return { ok: false, code: 'login_form_changed', error: 'the sign-in form changed before filling — nothing was typed' };
    }
    const pwPlan = Object.values(plannedRoles).some((t) => t === 'password' || t === 'new-password')
      || ver.fields.some((d) => d && String(d.domType || d.type || '').toLowerCase() === 'password');
    for (const desc of ver.fields) {
      const wantRole = desc && plannedRoles[desc.fieldId];
      if (!roleMatchesPlan(wantRole, desc, { hasPassword: pwPlan })) {
        const plainPw = (wantRole === 'password' || wantRole === 'new-password') && desc && String(desc.domType || desc.type || '').toLowerCase() === 'text';
        return {
          ok: false,
          code: 'login_form_changed',
          error: plainPw
            ? 'the password field is revealed as plain text (type="text") — hide the password on the page or reload it, then run login again'
            : 'a sign-in field changed its role or type before filling — nothing was typed',
        };
      }
    }
    if (ver.framesArmed > 0) await sleepMs(15);

    for (let i = 0; i < entries.length; i++) {
      const fieldId = entries[i][0];
      const expectedRole = plannedRoles[fieldId];
      let val = entries[i][1];
      entries[i][1] = null; // drop reference as soon as read
      const prep = await evalInWorld(send, ctxId, prepareFieldExpr(fieldId, expectedRole));
      if (!prep || !prep.ok) {
        val = '';
        await evalInWorld(send, ctxId, wipeFailedFillExpr(touched));
        const why = (prep && prep.code) || 'field_gone';
        if (why === 'role_changed' && !attemptedInsert) {
          return { ok: false, code: 'login_form_changed', error: 'a sign-in field changed its role or type before filling — nothing was typed' };
        }
        return { ok: false, code: why === 'role_changed' ? 'login_form_changed' : 'login_failed', error: `could not prepare sign-in field (${why}) — nothing was submitted`, attemptedInsert, contextId: ctxId };
      }
      touched.push(fieldId);
      if (expectedRole !== 'username') attemptedInsert = true;
      const ins = await send('Input.insertText', { text: val });
      const expectedLen = val.length;
      val = '';
      if (!ins || ins.timeout || ins.error) {
        await evalInWorld(send, ctxId, wipeFailedFillExpr(touched));
        return { ok: false, code: 'login_failed', error: 'Chrome rejected typing into the sign-in field — nothing was submitted', attemptedInsert, contextId: ctxId };
      }
      const fin = await evalInWorld(send, ctxId, finalizeFieldExpr(fieldId, expectedLen, expectedRole));
      if (!fin || !fin.ok) {
        await evalInWorld(send, ctxId, wipeFailedFillExpr(touched));
        const why = (fin && fin.code) || 'field_cleared';
        return { ok: false, code: why === 'role_changed' ? 'login_form_changed' : 'login_failed', error: `sign-in field rejected typed input (${why}) — nothing was submitted`, attemptedInsert, contextId: ctxId };
      }
      lastFieldId = fieldId;
    }

    let submitted = false;
    if (submit && lastFieldId) {
      if (typeof onBeforeSubmit === 'function') { try { onBeforeSubmit(); } catch {} }
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
    return { ok: true, filled: loginId || (curForm && curForm.id) || 'login', step: resolvedStep, submitted, contextId: ctxId };
  } finally {
    try { await evalInWorld(send, ctxId, RESTORE_FRAMES_EXPR); } catch {}
  }
}

module.exports = { inspectTabLoginForm, fillVaultLogin, wipeTabTypedInputs };
