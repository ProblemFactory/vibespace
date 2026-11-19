'use strict';
/**
 * HUB-SIDE ISOLATED-WORLD VAULT ELEMENT FILL & WIPE — ORCH (lane browser-login, r22 pivot: «agent locates, hub fills»).
 *
 * Shared by BOTH standard Chrome and the custom browser kernel over the hub watch's own CDP session:
 *   1. `resolveSnapshotRef` — resolves ONLY the asked `@eN` ref on demand at `fill --vault` time via bounded
 *      `Accessibility.queryAXTree` over a dedicated short-lived CDP WebSocket (`maxPayload: 4 MiB`, `2.5 s` timeout,
 *      zero `Accessibility.*` calls on `snapshot`, zero page-scale frames on the watch socket).
 *   2. `fillVaultElement` — verifies browser-truth origin (`Page.getFrameTree` + `Target.getTargetInfo` + top-frame
 *      isolated-world `location.origin`), resolves `@ref` via `DOM.resolveNode({ backendNodeId, executionContextId })`
 *      or runs `document.querySelector(selector)` ONLY in the top-level frame's isolated world (refusing child frames as
 *      `login_in_frame`), enforces `<input type="password">` on password slots (`login_bad_field`), installs accidental-focus/
 *      selection/mutation guards + `inert` locks in `armAndPrepareTargetExpr` (Ruling A: guards against accidental focus steals
 *      and wrong-site phishing rather than claiming to stop an agent deliberately digging into a page it controls), types via
 *      `Input.insertText`, and verifies an ephemeral per-fill salted SHA-256 of `.value` in `finalizeTargetExpr` (zero secret
 *      bytes in `Runtime.evaluate`, zero digests on disk).
 *   3. `wipeTabTypedInputs` — clears residual secret values from inputs (syncing React `_valueTracker` via prototype
 *      setter + `input` event) when a non-navigating same-origin submit finishes before lifting the accidental-read fence.
 */
const crypto = require('crypto');
const BL = require('../browser-login.js');
let DefaultWS = null;
try { DefaultWS = require('ws').WebSocket; } catch { DefaultWS = null; }

const WORLD_NAME = 'vs-login-fill';
const AX_WORLD_NAME = '__vs_login_ax__';
const REDIRECT_SETTLE_TRIES = 3;
const REDIRECT_SETTLE_MS = 25;
const MAX_CHILD_FRAMES = 64;
const MAX_AX_CHILD_FRAMES = 16;
const DEFAULT_AX_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const DEFAULT_AX_QUERY_TIMEOUT_MS = 2500;
const DEFAULT_AX_MAX_NODES = 8192;
const DEFAULT_MAX_SCAN_POSITIONS = 524288;
const TOO_MUCH_TEXT_REASON = BL.HOLD_TOO_MUCH_TEXT || 'too much text to check';
const SUB_LEN_BUCKETS = Object.freeze([[3, 7], [8, 15], [16, 31], [32, 63], [64, 128], [129, 512], [513, 4096]]);
const WHOLE_LEN_BUCKETS = Object.freeze([[1, 7], [8, 15], [16, 31], [32, 63], [64, 128], [129, 512], [513, 4096]]);

const lastContextByTarget = new Map();    // targetId|sessionId -> {profileId, ctxId}
const filledSecretsByTarget = new Map();  // targetId|sessionId -> {profileId, ctxId, values: string[]}
const filledSecretsByCtx = new Map();     // `${targetKey}:${ctxId}` -> {profileId, targetKey, ctxId, values: string[]}
const fenceRefSources = new Set();

function ctxEntryKeyOf(targetKey, contextId) {
  const tk = String(targetKey || '');
  const normCtx = Number.isInteger(Number(contextId)) && Number(contextId) > 0 ? Number(contextId) : 0;
  return tk && normCtx > 0 ? `${tk}:${normCtx}` : '';
}

function bucketOfCharLen(charLen, whole = false) {
  const n = Math.max(1, Number(charLen) || 1);
  const table = whole ? WHOLE_LEN_BUCKETS : SUB_LEN_BUCKETS;
  for (const [lo, hi] of table) {
    if (n <= hi) return [lo, hi];
  }
  return [513, Math.max(4096, Math.ceil(n / 1024) * 1024)];
}

function rollingHashPrefix(str, w, base) {
  let h = 0 | 0;
  for (let i = 0; i < w; i++) h = (Math.imul(h, base) + str.charCodeAt(i)) | 0;
  return h | 0;
}

function rollingPow(w, base) {
  let p = 1 | 0;
  for (let i = 1; i < w; i++) p = Math.imul(p, base);
  return p | 0;
}

function rememberFilledSecrets(ctxKey, ctxId, secretVals, profileId = '') {
  const pid = String(profileId || '');
  const tk = String(ctxKey || '');
  const clean = [...new Set((Array.isArray(secretVals) ? secretVals : []).filter((s) => typeof s === 'string' && s.length > 0))];
  if (!clean.length) return;
  const normCtx = Number.isInteger(ctxId) && ctxId > 0 ? ctxId : 0;
  if (tk) {
    const prevEntry = filledSecretsByTarget.get(tk);
    const prev = prevEntry && Array.isArray(prevEntry.values) ? prevEntry.values : [];
    const merged = [...new Set([...prev, ...clean])].slice(-16);
    filledSecretsByTarget.delete(tk);
    filledSecretsByTarget.set(tk, {
      profileId: pid || (prevEntry && prevEntry.profileId) || '',
      ctxId: normCtx || (prevEntry && prevEntry.ctxId) || 0,
      values: merged,
    });
    while (filledSecretsByTarget.size > 64) filledSecretsByTarget.delete(filledSecretsByTarget.keys().next().value);
  }
  const cKey = ctxEntryKeyOf(tk, normCtx);
  if (cKey) {
    const prevEntry = filledSecretsByCtx.get(cKey);
    const prev = prevEntry && Array.isArray(prevEntry.values) ? prevEntry.values : [];
    const merged = [...new Set([...prev, ...clean])].slice(-16);
    filledSecretsByCtx.delete(cKey);
    filledSecretsByCtx.set(cKey, {
      profileId: pid || (prevEntry && prevEntry.profileId) || '',
      targetKey: tk,
      ctxId: normCtx,
      values: merged,
    });
    while (filledSecretsByCtx.size > 64) filledSecretsByCtx.delete(filledSecretsByCtx.keys().next().value);
  }
}

function supersedeTargetContext(targetId, contextId, profileId = '') {
  const ctxKey = String(targetId || '');
  const normCtx = Number.isInteger(Number(contextId)) && Number(contextId) > 0 ? Number(contextId) : 0;
  const cKey = ctxEntryKeyOf(ctxKey, normCtx);
  if (!cKey) return;
  const pid = String(profileId || '');
  const carried = [];
  for (const [ck, cv] of [...filledSecretsByCtx.entries()]) {
    if (cv && cv.targetKey === ctxKey && ck !== cKey) {
      if (Array.isArray(cv.values)) {
        for (const s of cv.values) if (typeof s === 'string' && s) carried.push(s);
        cv.values.length = 0;
      }
      filledSecretsByCtx.delete(ck);
    }
  }
  const tv = filledSecretsByTarget.get(ctxKey);
  if (tv || carried.length) {
    if (tv) {
      tv.ctxId = normCtx;
      if (pid && !tv.profileId) tv.profileId = pid;
    }
    const existingCur = filledSecretsByCtx.get(cKey);
    const merged = [...new Set([
      ...((tv && Array.isArray(tv.values)) ? tv.values : []),
      ...((existingCur && Array.isArray(existingCur.values)) ? existingCur.values : []),
      ...carried,
    ])].slice(-16);
    if (merged.length) {
      filledSecretsByCtx.delete(cKey);
      filledSecretsByCtx.set(cKey, {
        profileId: pid || (tv && tv.profileId) || (existingCur && existingCur.profileId) || '',
        targetKey: ctxKey,
        ctxId: normCtx,
        values: merged,
      });
      while (filledSecretsByCtx.size > 64) filledSecretsByCtx.delete(filledSecretsByCtx.keys().next().value);
    }
  }
}

function clearFilledSecretsForTarget(targetId, contextId = 0) {
  const ctxKey = String(targetId || '');
  let linkedCtx = Number.isInteger(Number(contextId)) && Number(contextId) > 0 ? Number(contextId) : 0;
  if (ctxKey) {
    const v = filledSecretsByTarget.get(ctxKey);
    if (v) {
      if (!linkedCtx && v.ctxId) linkedCtx = v.ctxId;
      if (Array.isArray(v.values)) v.values.length = 0;
      filledSecretsByTarget.delete(ctxKey);
    }
    const lc = lastContextByTarget.get(ctxKey);
    if (!linkedCtx && lc && typeof lc === 'object' && lc.ctxId) linkedCtx = lc.ctxId;
    lastContextByTarget.delete(ctxKey);
  }
  const cKey = ctxEntryKeyOf(ctxKey, linkedCtx);
  if (cKey) {
    const cv = filledSecretsByCtx.get(cKey);
    if (cv) {
      if (Array.isArray(cv.values)) cv.values.length = 0;
      filledSecretsByCtx.delete(cKey);
    }
  }
  if (ctxKey) {
    for (const [ck, cv] of [...filledSecretsByCtx.entries()]) {
      if (cv && cv.targetKey === ctxKey) {
        if (Array.isArray(cv.values)) cv.values.length = 0;
        filledSecretsByCtx.delete(ck);
      }
    }
  }
}

function registerFenceRefSource(fn) {
  if (typeof fn !== 'function') return () => {};
  fenceRefSources.add(fn);
  return () => { fenceRefSources.delete(fn); };
}

function normCompositeCtxKey(c) {
  const s = typeof c === 'string' ? c : '';
  return /^.+:\d+$/.test(s) ? s : '';
}

function clearUnfencedFilledSecrets({ liveTargetIds = null, liveContextIds = null } = {}) {
  const liveTgt = new Set(
    liveTargetIds instanceof Set ? [...liveTargetIds].map(String).filter(Boolean)
      : (Array.isArray(liveTargetIds) ? liveTargetIds.map(String).filter(Boolean) : [])
  );
  const liveCtx = new Set(
    liveContextIds instanceof Set ? [...liveContextIds].map(normCompositeCtxKey).filter(Boolean)
      : (Array.isArray(liveContextIds) ? liveContextIds.map(normCompositeCtxKey).filter(Boolean) : [])
  );
  const rememberedProfileIds = new Set();
  for (const v of filledSecretsByTarget.values()) if (v && v.profileId) rememberedProfileIds.add(String(v.profileId));
  for (const cv of filledSecretsByCtx.values()) if (cv && cv.profileId) rememberedProfileIds.add(String(cv.profileId));
  for (const src of fenceRefSources) {
    let refs = null;
    try { refs = src({ rememberedProfileIds }); } catch { refs = null; }
    if (!refs || typeof refs !== 'object') continue;
    if (refs.liveTargetIds && typeof refs.liveTargetIds[Symbol.iterator] === 'function') {
      for (const t of refs.liveTargetIds) if (t) liveTgt.add(String(t));
    }
    if (refs.liveContextIds && typeof refs.liveContextIds[Symbol.iterator] === 'function') {
      for (const c of refs.liveContextIds) { const ck = normCompositeCtxKey(c); if (ck) liveCtx.add(ck); }
    }
  }
  for (const [k, v] of [...filledSecretsByTarget.entries()]) {
    if (liveTgt.has(k)) continue;
    if (v && Array.isArray(v.values)) v.values.length = 0;
    filledSecretsByTarget.delete(k);
    lastContextByTarget.delete(k);
  }
  for (const [k, v] of [...filledSecretsByCtx.entries()]) {
    if (liveCtx.has(k)) continue;
    if (v && Array.isArray(v.values)) v.values.length = 0;
    filledSecretsByCtx.delete(k);
  }
}

function valuesForTarget(targetId = null, contextId = 0, sessionId = undefined) {
  const ctxKey = String(targetId || sessionId || '');
  const cKey = ctxEntryKeyOf(ctxKey, contextId);
  const byCtx = cKey ? filledSecretsByCtx.get(cKey) : null;
  const byTgt = ctxKey ? filledSecretsByTarget.get(ctxKey) : null;
  return [...new Set([
    ...((byCtx && Array.isArray(byCtx.values)) ? byCtx.values : []),
    ...((byTgt && Array.isArray(byTgt.values)) ? byTgt.values : []),
  ])];
}

function clearFilledSecretsForProfileExcept(profileId, keepTargetIds = null) {
  const pid = String(profileId || '');
  if (!pid) return;
  const keepTgt = keepTargetIds instanceof Set
    ? keepTargetIds
    : new Set(Array.isArray(keepTargetIds) ? keepTargetIds.map(String).filter(Boolean) : []);
  for (const [k, v] of [...filledSecretsByTarget.entries()]) {
    if (v && v.profileId === pid && !keepTgt.has(k)) {
      if (Array.isArray(v.values)) v.values.length = 0;
      filledSecretsByTarget.delete(k);
    }
  }
  for (const [k, v] of [...filledSecretsByCtx.entries()]) {
    if (!v || !v.profileId || v.profileId === pid) {
      if (v && Array.isArray(v.values)) v.values.length = 0;
      filledSecretsByCtx.delete(k);
    }
  }
  for (const [k, v] of [...lastContextByTarget.entries()]) {
    if (!v || typeof v !== 'object' || !v.profileId || v.profileId === pid) lastContextByTarget.delete(k);
  }
}

function clearFilledSecretsForProfile(profileId) {
  const pid = String(profileId || '');
  if (!pid) return;
  for (const [k, v] of [...filledSecretsByTarget.entries()]) {
    if (!v || !v.profileId || v.profileId === pid) {
      if (Array.isArray(v.values)) v.values.length = 0;
      filledSecretsByTarget.delete(k);
    }
  }
  for (const [k, v] of [...filledSecretsByCtx.entries()]) {
    if (!v || !v.profileId || v.profileId === pid) {
      if (v && Array.isArray(v.values)) v.values.length = 0;
      filledSecretsByCtx.delete(k);
    }
  }
  for (const [k, v] of [...lastContextByTarget.entries()]) {
    if (!v || typeof v !== 'object' || !v.profileId || v.profileId === pid) lastContextByTarget.delete(k);
  }
}

function clearAllFilledSecrets() {
  for (const v of filledSecretsByTarget.values()) if (v && Array.isArray(v.values)) v.values.length = 0;
  for (const v of filledSecretsByCtx.values()) if (v && Array.isArray(v.values)) v.values.length = 0;
  filledSecretsByTarget.clear();
  filledSecretsByCtx.clear();
  lastContextByTarget.clear();
}

// Ephemeral in-memory salted SHA-256 descriptors (NEVER persisted to disk — Ruling 5c / RULE 5′).
function buildFilledTargets(secretValues, { wholeOnlyValues = null } = {}) {
  const rawMain = [...new Set((Array.isArray(secretValues) ? secretValues : []).filter((s) => typeof s === 'string' && s.length > 0))];
  const rawWhole = [...new Set((Array.isArray(wholeOnlyValues) ? wholeOnlyValues : []).filter((s) => typeof s === 'string' && s.length > 0))];
  if (!rawMain.length && !rawWhole.length) return { salt: '', targets: [] };
  const salt = crypto.randomBytes(16).toString('hex');
  const rBase = (crypto.randomBytes(4).readUInt32LE(0) | 1) | 0;
  const subVals = [];
  const wholeVals = new Set(rawWhole);
  for (const sv of rawMain) {
    if (Buffer.byteLength(sv, 'utf8') < 8) wholeVals.add(sv);
    else subVals.push(sv);
  }
  const subSet = new Set(subVals);
  const targets = [];
  for (const sv of wholeVals) {
    if (subSet.has(sv)) continue;
    const [minLen, maxLen] = bucketOfCharLen(sv.length, true);
    targets.push({
      whole: true,
      minLen,
      maxLen,
      hash: crypto.createHash('sha256').update(`${salt}:w:${sv}`, 'utf8').digest('hex'),
    });
  }
  for (const sv of subVals) {
    const [minLen, maxLen] = bucketOfCharLen(sv.length, false);
    targets.push({
      whole: false,
      minLen,
      maxLen,
      rBase,
      rHash: rollingHashPrefix(sv, minLen, rBase),
      hash: crypto.createHash('sha256').update(`${salt}:${sv}`, 'utf8').digest('hex'),
    });
  }
  return { salt, targets };
}

function targetsForTab(targetId = null, contextId = 0, extraSecrets = null, sessionId = undefined, { wholeOnlyValues = null } = {}) {
  const ctxKey = String(targetId || sessionId || '');
  const cKey = ctxEntryKeyOf(ctxKey, contextId);
  const byCtx = cKey ? filledSecretsByCtx.get(cKey) : null;
  const byTgt = ctxKey ? filledSecretsByTarget.get(ctxKey) : null;
  const list = [
    ...(Array.isArray(extraSecrets) ? extraSecrets : []),
    ...((byCtx && Array.isArray(byCtx.values)) ? byCtx.values : []),
    ...((byTgt && Array.isArray(byTgt.values)) ? byTgt.values : []),
  ];
  return buildFilledTargets(list, { wholeOnlyValues });
}

const SHA256_HELPER_SRC = `
  const _K256 = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const _sha256Hex = (str) => {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          c = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
          i++;
          bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        } else bytes.push(0xef, 0xbf, 0xbd);
      } else if (c >= 0xdc00 && c <= 0xdfff) bytes.push(0xef, 0xbf, 0xbd);
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
    bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < bytes.length; off += 64) {
      for (let j = 0; j < 16; j++) {
        const k = off + j * 4;
        w[j] = ((bytes[k] << 24) | (bytes[k + 1] << 16) | (bytes[k + 2] << 8) | bytes[k + 3]) | 0;
      }
      for (let j = 16; j < 64; j++) {
        const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let j = 0; j < 64; j++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + _K256[j] + w[j]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const hex8 = (v) => (v >>> 0).toString(16).padStart(8, '0');
    return hex8(h0) + hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4) + hex8(h5) + hex8(h6) + hex8(h7);
  };
`;

const NODE_HELPERS_SRC = `
  const activeLeaf = (root) => {
    let a = root && root.activeElement ? root.activeElement : null;
    let guard = 0;
    while (a && a.shadowRoot && a.shadowRoot.activeElement && guard++ < 8) a = a.shadowRoot.activeElement;
    return a || null;
  };
  const isTextControl = (node) => {
    if (!node || node.nodeType !== 1) return false;
    const tag = String(node.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = String(node.type || (node.getAttribute && node.getAttribute('type')) || 'text').toLowerCase().trim();
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color'].includes(t);
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
  const attrValOfNode = (node) => {
    if (!node || node.nodeType !== 1 || !node.getAttribute) return '';
    try { const attr = node.getAttribute('value'); return typeof attr === 'string' ? attr : ''; } catch { return ''; }
  };
  const wipeAttrOfNode = (node) => {
    if (!node || node.nodeType !== 1) return false;
    let changed = false;
    try {
      if (node.hasAttribute && node.hasAttribute('value') && String(node.getAttribute('value') || '') !== '') {
        node.setAttribute('value', '');
        changed = true;
      }
    } catch {}
    try {
      if (typeof node.defaultValue === 'string' && node.defaultValue !== '') {
        node.defaultValue = '';
        changed = true;
      }
    } catch {}
    return changed;
  };
  const lenOfNode = (node) => valOfNode(node).length;
  const notifyWipedNode = (node) => {
    try { node.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    try { node.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    try {
      const root = (node.getRootNode && node.getRootNode()) || node.ownerDocument || document;
      if (root && activeLeaf(root) === node && typeof node.blur === 'function') node.blur();
    } catch {}
  };
  const wipeNode = (node) => {
    if (!node || node.nodeType !== 1) return false;
    const p = typeof HTMLTextAreaElement === 'function' && node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (typeof HTMLInputElement === 'function' && node instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    const d = p && Object.getOwnPropertyDescriptor(p, 'value');
    if (d && d.set) {
      try {
        if (!d.get || String(d.get.call(node) || '') !== '') {
          d.set.call(node, '');
          notifyWipedNode(node);
        }
        return true;
      } catch {}
    }
    if (typeof node.value === 'string' && node.value !== '') {
      try { node.value = ''; notifyWipedNode(node); return true; } catch {}
    }
    if (node.isContentEditable && node.textContent) {
      try { node.textContent = ''; notifyWipedNode(node); return true; } catch {}
    }
    return false;
  };
  const collectControls = (root, out = [], depth = 0) => {
    if (!root || depth > 8) return out;
    try {
      for (const node of root.querySelectorAll('input, textarea, select, output, [contenteditable], [role="textbox"]')) out.push(node);
      for (const host of root.querySelectorAll('*')) {
        if (host && host.shadowRoot) collectControls(host.shadowRoot, out, depth + 1);
      }
    } catch {}
    return out;
  };
`;

function filledTargetSrc(salt, targets, { maxScanPositions = DEFAULT_MAX_SCAN_POSITIONS } = {}) {
  const raw = Array.isArray(targets) ? targets : [];
  const clean = [];
  for (const t of raw) {
    if (!t || typeof t.hash !== 'string' || !t.hash) continue;
    if (t.whole === true) {
      const minLen = Math.max(1, Number(t.minLen || t.len) || 1);
      const maxLen = Math.max(minLen, Number(t.maxLen || t.len) || minLen);
      clean.push({ whole: true, minLen, maxLen, hash: t.hash });
    } else {
      const minLen = Math.max(1, Number(t.minLen || t.len) || 0);
      const maxLen = Math.max(minLen, Number(t.maxLen || t.len) || minLen);
      if (minLen <= 0) continue;
      const rBase = Number.isInteger(t.rBase) ? (t.rBase | 0) : 0;
      const rHash = Number.isInteger(t.rHash) ? (t.rHash | 0) : 0;
      const rPow = rBase ? rollingPow(minLen, rBase) : 0;
      clean.push({ whole: false, minLen, maxLen, rBase, rHash, rPow, hash: t.hash });
    }
  }
  if (!clean.length || typeof salt !== 'string' || !salt) {
    return 'const scanFilledTarget = () => false; const hasFilledTarget = () => false;';
  }
  const maxPos = Math.max(256, Number(maxScanPositions) || DEFAULT_MAX_SCAN_POSITIONS);
  return `${SHA256_HELPER_SRC}
  const _vsSalt = ${JSON.stringify(salt)};
  const _vsTargets = ${JSON.stringify(clean)};
  const _vsMaxPos = ${maxPos};
  let _vsPosUsed = 0;
  let _vsCut = false;
  const _vsWhole = [];
  const _vsGroups = [];
  {
    const gMap = Object.create(null);
    for (let ti = 0; ti < _vsTargets.length; ti++) {
      const t = _vsTargets[ti];
      if (t.whole) { _vsWhole.push(t); continue; }
      const gk = t.minLen + ':' + t.rBase;
      let g = gMap[gk];
      if (!g) {
        g = { w: t.minLen, base: t.rBase | 0, pow: t.rPow | 0, items: [] };
        gMap[gk] = g;
        _vsGroups.push(g);
      }
      g.items.push(t);
    }
  }
  const scanFilledTarget = (s) => {
    if (typeof s !== 'string' || !s) return false;
    const n = s.length;
    for (let wi = 0; wi < _vsWhole.length; wi++) {
      const wt = _vsWhole[wi];
      if (n < wt.minLen || n > wt.maxLen) continue;
      if (_vsCut || _vsPosUsed + 64 > _vsMaxPos) { _vsCut = true; return 'cut'; }
      _vsPosUsed += 64;
      if (_sha256Hex(_vsSalt + ':w:' + s) === wt.hash) return 'match';
    }
    let sawCut = _vsCut;
    for (let gi = 0; gi < _vsGroups.length; gi++) {
      const g = _vsGroups[gi];
      const w = g.w;
      if (n < w) continue;
      if (_vsCut) { sawCut = true; continue; }
      const lim = n - w;
      const items = g.items;
      if (!g.base) {
        for (let i = 0; i <= lim; i++) {
          for (let ii = 0; ii < items.length; ii++) {
            const it = items[ii];
            const hi = Math.min(it.maxLen, n - i);
            for (let L = it.minLen; L <= hi; L++) {
              if (_vsPosUsed + 64 > _vsMaxPos) { _vsCut = true; return 'cut'; }
              _vsPosUsed += 64;
              if (_sha256Hex(_vsSalt + ':' + s.slice(i, i + L)) === it.hash) return 'match';
            }
          }
        }
        continue;
      }
      const base = g.base;
      const pow = g.pow;
      if (_vsPosUsed + w > _vsMaxPos) { _vsCut = true; sawCut = true; continue; }
      let h = 0 | 0;
      for (let k = 0; k < w; k++) h = (Math.imul(h, base) + s.charCodeAt(k)) | 0;
      _vsPosUsed += 1;
      for (let i = 0; i <= lim; i++) {
        for (let ii = 0; ii < items.length; ii++) {
          const it = items[ii];
          if (h === it.rHash) {
            const hi = Math.min(it.maxLen, n - i);
            for (let L = w; L <= hi; L++) {
              if (_vsPosUsed + 64 > _vsMaxPos) { _vsCut = true; return 'cut'; }
              _vsPosUsed += 64;
              if (_sha256Hex(_vsSalt + ':' + s.slice(i, i + L)) === it.hash) return 'match';
            }
          }
        }
        if (i < lim) {
          if (_vsPosUsed + 1 > _vsMaxPos) { _vsCut = true; sawCut = true; break; }
          _vsPosUsed += 1;
          const rem = (h - Math.imul(s.charCodeAt(i), pow)) | 0;
          h = (Math.imul(rem, base) + s.charCodeAt(i + w)) | 0;
        }
      }
    }
    return sawCut || _vsCut ? 'cut' : false;
  };
  const hasFilledTarget = (s) => scanFilledTarget(s) === 'match';`;
}

const ORIGIN_CHECK_EXPR = `(() => {
  try {
    return {
      ok: true,
      isoOrigin: String(window.location.origin || ''),
      isoHref: String(window.location.href || ''),
      readyState: String((document && document.readyState) || 'complete'),
    };
  } catch {
    return { ok: false };
  }
})()`;

const RESTORE_FRAMES_EXPR = `(() => {
  if (typeof window.vsFocusGuardCleanup === 'function') {
    try { window.vsFocusGuardCleanup(); } catch {}
  }
  window.vsFocusGuardCleanup = null;
  const ctrls = window.vsLoginInertControls;
  window.vsLoginInertControls = null;
  if (Array.isArray(ctrls)) {
    for (const it of ctrls) {
      if (!it || !it.el) continue;
      try { it.el.inert = !!it.prop; } catch {}
      try {
        if (!it.hadAttr && it.el.removeAttribute) it.el.removeAttribute('inert');
        else if (it.hadAttr && it.el.setAttribute) it.el.setAttribute('inert', '');
      } catch {}
    }
  }
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

function queryTopSelectorExpr(selector) {
  return `(() => {
    let el = null;
    try {
      el = document.querySelector(${JSON.stringify(String(selector || ''))});
    } catch {
      return { ok: false, code: 'bad_request', error: 'invalid CSS selector' };
    }
    if (!el) return { ok: false, code: 'not_found' };
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'iframe' || tag === 'frame') {
      return { ok: false, code: 'login_in_frame', error: 'the target element is a frame — Vault fill only targets top-level inputs' };
    }
    window.vsFillTarget = el;
    return { ok: true };
  })()`;
}

function childFrameHasSelectorExpr(selector) {
  return `(() => {
    try { return Boolean(document.querySelector(${JSON.stringify(String(selector || ''))})); }
    catch { return false; }
  })()`;
}

function targetEligibilitySrc(wantSecretPw, wantOtp) {
  return `
    const el = window.vsFillTarget;
    if (!el || el.nodeType !== 1 || !el.isConnected) {
      return { ok: false, code: 'target_not_found', error: 'target element is detached from the document' };
    }
    if (el.ownerDocument !== document) {
      return { ok: false, code: 'login_in_frame', error: 'target element belongs to a child frame' };
    }
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'iframe' || tag === 'frame') {
      return { ok: false, code: 'login_in_frame', error: 'target element is a frame' };
    }
    const attrType = tag === 'input' && el.getAttribute ? String(el.getAttribute('type') || '') : '';
    const domType = tag === 'input' ? String(el.type || attrType || 'text').toLowerCase().trim() : '';
    if (${JSON.stringify(wantSecretPw)}) {
      if (tag !== 'input' || domType !== 'password') {
        return {
          ok: false,
          code: 'login_bad_field',
          error: domType === 'text'
            ? 'refused to fill a vault password into a plain-text input (type="text")'
            : 'vault password slots can only be filled into <input type="password">',
        };
      }
    } else if (${JSON.stringify(wantOtp)}) {
      if (tag !== 'input' || !['text', 'tel', 'number', 'password', ''].includes(domType)) {
        return { ok: false, code: 'login_bad_field', error: 'vault otp slot requires an <input> field (text, tel, number, or password)' };
      }
    } else {
      if (!isTextControl(el)) {
        return { ok: false, code: 'login_bad_field', error: 'vault user slot requires an editable text input' };
      }
    }
    const dis = !!el.disabled || (el.getAttribute && el.getAttribute('aria-disabled') === 'true');
    const ro = !!el.readOnly || (el.getAttribute && el.getAttribute('aria-readonly') === 'true');
    if (el.hidden || dis || ro || (el.closest && el.closest('[hidden], [aria-hidden="true"], template'))) {
      return { ok: false, code: 'login_form_changed', error: 'target input is hidden, disabled, or read-only — nothing was typed' };
    }
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const cs = window.getComputedStyle ? window.getComputedStyle(cur) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)) {
        return { ok: false, code: 'login_form_changed', error: 'target input is not visible — nothing was typed' };
      }
      cur = cur.parentElement;
    }
    if (typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) {
        return { ok: false, code: 'login_form_changed', error: 'target input has zero layout bounds — nothing was typed' };
      }
    }`;
}

function verifyTargetNodeExpr(slot, secret) {
  const wantSecretPw = Boolean(secret && slot !== 'otp');
  const wantOtp = slot === 'otp';
  return `(() => {
    ${NODE_HELPERS_SRC}
    ${targetEligibilitySrc(wantSecretPw, wantOtp)}
    return { ok: true };
  })()`;
}

function armAndPrepareTargetExpr(slot, secret) {
  const wantSecretPw = Boolean(secret && slot !== 'otp');
  const wantOtp = slot === 'otp';
  return `(async () => {
    ${NODE_HELPERS_SRC}
    ${targetEligibilitySrc(wantSecretPw, wantOtp)}

    // Snapshot pre-fill control lengths (for focus-theft wipe) and mark all frames inert for the typing window.
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
    } catch {}
    window.vsLoginFrames = savedFrames;

    if (window.vsLoginTouched instanceof Set) window.vsLoginTouched.add(el);
    else window.vsLoginTouched = new Set([el]);

    window.vsFocusHijacked = false;
    let stealDuringSettle = false;
    const onSettleSteal = (ev) => {
      const t = ev && ev.target;
      if (t && t !== el && t !== window && t !== document) stealDuringSettle = true;
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('focusin', onSettleSteal, true);
      window.addEventListener('focus', onSettleSteal, true);
    }

    try { if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
    if (typeof el.focus === 'function') el.focus();
    if (stealDuringSettle || activeLeaf(document) !== el) {
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('focusin', onSettleSteal, true);
        window.removeEventListener('focus', onSettleSteal, true);
      }
      return { ok: false, code: 'login_form_changed', why: 'focus_stolen', error: 'focus moved away from the target node before typing — nothing was typed' };
    }

    const proto = typeof HTMLTextAreaElement === 'function' && el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : (typeof HTMLInputElement === 'function' && el instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set && desc.get) {
      if (desc.get.call(el) !== '') {
        desc.set.call(el, '');
        if (el.dispatchEvent) el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (stealDuringSettle || activeLeaf(document) !== el) {
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('focusin', onSettleSteal, true);
          window.removeEventListener('focus', onSettleSteal, true);
        }
        return { ok: false, code: 'login_form_changed', why: 'focus_stolen', error: 'focus moved away from the target node on clear — nothing was typed' };
      }
      if (desc.get.call(el) !== '') {
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('focusin', onSettleSteal, true);
          window.removeEventListener('focus', onSettleSteal, true);
        }
        return { ok: false, code: 'login_form_changed', why: 'clear_blocked', error: 'target input blocked clearing before typing — nothing was typed' };
      }
    } else if (typeof el.value === 'string') {
      if (el.value !== '') {
        el.value = '';
        if (el.dispatchEvent) el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (stealDuringSettle || activeLeaf(document) !== el) {
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('focusin', onSettleSteal, true);
          window.removeEventListener('focus', onSettleSteal, true);
        }
        return { ok: false, code: 'login_form_changed', why: 'focus_stolen', error: 'focus moved away from the target node on clear — nothing was typed' };
      }
      if (el.value !== '') {
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('focusin', onSettleSteal, true);
          window.removeEventListener('focus', onSettleSteal, true);
        }
        return { ok: false, code: 'login_form_changed', why: 'clear_blocked', error: 'target input blocked clearing before typing — nothing was typed' };
      }
    } else if (el.isContentEditable) {
      el.textContent = '';
      if (stealDuringSettle || activeLeaf(document) !== el) {
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('focusin', onSettleSteal, true);
          window.removeEventListener('focus', onSettleSteal, true);
        }
        return { ok: false, code: 'login_form_changed', why: 'focus_stolen', error: 'focus moved away from the target node on clear — nothing was typed' };
      }
    }

    // L5: Drain microtasks (queueMicrotask / Promise) AND macrotask timers (setTimeout(..., 0)) BEFORE any secret is sent over CDP.
    await Promise.resolve();
    if (typeof setTimeout === 'function') {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.resolve();
    if (typeof window.removeEventListener === 'function') {
      window.removeEventListener('focusin', onSettleSteal, true);
      window.removeEventListener('focus', onSettleSteal, true);
    }

    const curTag = String(el.tagName || '').toLowerCase();
    const curType = curTag === 'input' ? String(el.type || (el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase().trim() : '';
    if (stealDuringSettle || !el.isConnected || activeLeaf(document) !== el || (${JSON.stringify(wantSecretPw)} && (curTag !== 'input' || curType !== 'password'))) {
      return { ok: false, code: 'login_form_changed', why: 'focus_stolen', error: 'focus moved away from the target node before typing — nothing was typed' };
    }

    // Install capturing focus/selection/mutation guards BEFORE setting inert so any MutationObserver reaction to inert
    // or any post-prepare macrotask (focus(), click(), select(), stripping inert, moving/replacing el) is caught
    // and blurs all controls before Input.insertText can land anywhere outside el (N5).
    const parentAtArm = el.parentNode || null;
    let typeMo = null;
    let treeMo = null;
    const tripHijack = (badNode) => {
      window.vsFocusHijacked = true;
      if (badNode && badNode !== el && badNode !== window && badNode !== document && badNode !== document.body && badNode !== document.documentElement) {
        try { badNode.inert = true; } catch {}
        try { if (badNode.setAttribute) badNode.setAttribute('inert', ''); } catch {}
        try { if (typeof badNode.blur === 'function') badNode.blur(); } catch {}
      }
      const act = activeLeaf(document);
      if (act && act !== el && act !== document.body && act !== document.documentElement) {
        try { act.inert = true; } catch {}
        try { if (act.setAttribute) act.setAttribute('inert', ''); } catch {}
        try { if (typeof act.blur === 'function') act.blur(); } catch {}
      }
      try { if (typeof el.blur === 'function') el.blur(); } catch {}
      try { if (window.getSelection) { const sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); } } catch {}
    };
    if (typeof MutationObserver === 'function') {
      if (${JSON.stringify(wantSecretPw)}) {
        try {
          typeMo = new MutationObserver(() => {
            const tTag = String(el.tagName || '').toLowerCase();
            const tType = tTag === 'input' ? String(el.type || (el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase().trim() : '';
            if (tTag !== 'input' || tType !== 'password') {
              try { el.inert = true; } catch {}
              tripHijack(null);
            }
          });
          typeMo.observe(el, { attributes: true, attributeFilter: ['type'] });
        } catch { typeMo = null; }
      }
      if (parentAtArm) {
        try {
          treeMo = new MutationObserver(() => {
            if (!el.isConnected || el.parentNode !== parentAtArm || activeLeaf(document) !== el) {
              tripHijack(activeLeaf(document));
            }
          });
          treeMo.observe(parentAtArm, { childList: true });
        } catch { treeMo = null; }
      }
    }
    const onTypingFocusGuard = (ev) => {
      const t = ev && ev.target;
      if (t && t !== el && t !== window && t !== document) tripHijack(t);
    };
    const onTargetBlurGuard = () => {
      if (activeLeaf(document) !== el) tripHijack(activeLeaf(document));
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('focusin', onTypingFocusGuard, true);
      window.addEventListener('focus', onTypingFocusGuard, true);
      window.addEventListener('select', onTypingFocusGuard, true);
      window.addEventListener('selectstart', onTypingFocusGuard, true);
    }
    if (typeof el.addEventListener === 'function') {
      el.addEventListener('blur', onTargetBlurGuard, true);
    }
    window.vsFocusGuardCleanup = () => {
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('focusin', onTypingFocusGuard, true);
        window.removeEventListener('focus', onTypingFocusGuard, true);
        window.removeEventListener('select', onTypingFocusGuard, true);
        window.removeEventListener('selectstart', onTypingFocusGuard, true);
      }
      if (typeof el.removeEventListener === 'function') {
        try { el.removeEventListener('blur', onTargetBlurGuard, true); } catch {}
      }
      if (typeMo) { try { typeMo.disconnect(); } catch {} }
      if (treeMo) { try { treeMo.disconnect(); } catch {} }
    };

    const savedControls = [];
    try {
      for (const node of collectControls(document)) {
        if (!node || node === el || (typeof node.contains === 'function' && node.contains(el))) continue;
        savedControls.push({
          el: node,
          hadAttr: !!(node.hasAttribute && node.hasAttribute('inert')),
          prop: !!node.inert,
        });
        try { node.inert = true; } catch {}
        try { if (node.setAttribute) node.setAttribute('inert', ''); } catch {}
      }
    } catch {}
    window.vsLoginInertControls = savedControls;

    // Flush any MutationObserver reacting to inert attribute writes before returning { ok: true }.
    await Promise.resolve();
    const postTag = String(el.tagName || '').toLowerCase();
    const postType = postTag === 'input' ? String(el.type || (el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase().trim() : '';
    if (window.vsFocusHijacked || !el.isConnected || el.parentNode !== parentAtArm || activeLeaf(document) !== el || (${JSON.stringify(wantSecretPw)} && (postTag !== 'input' || postType !== 'password'))) {
      if (typeof window.vsFocusGuardCleanup === 'function') { try { window.vsFocusGuardCleanup(); } catch {} window.vsFocusGuardCleanup = null; }
      return { ok: false, code: 'login_form_changed', why: 'focus_stolen', error: 'focus moved away from the target node before typing — nothing was typed' };
    }

    return { ok: true, framesArmed: savedFrames.length };
  })()`;
}

function finalizeTargetExpr(slot, secret, fSalt, wantHash, wantUserLen = null) {
  const wantSecretPw = Boolean(secret && slot !== 'otp');
  const isSecret = Boolean(secret);
  const checkExpr = isSecret
    ? `_sha256Hex(_vsFinSalt + ':' + valOfNode(el)) === _vsWantHash`
    : `lenOfNode(el) === ${Number.isInteger(wantUserLen) && wantUserLen >= 0 ? wantUserLen : 0}`;
  return `(() => {
    ${NODE_HELPERS_SRC}
    ${isSecret ? `${SHA256_HELPER_SRC}
    const _vsFinSalt = ${JSON.stringify(String(fSalt || ''))};
    const _vsWantHash = ${JSON.stringify(String(wantHash || ''))};` : ''}
    const el = window.vsFillTarget;
    window.vsFillTarget = null;
    if (!el || !el.isConnected || el.ownerDocument !== document) {
      wipeNode(activeLeaf(document));
      return { ok: false, code: 'field_gone' };
    }
    const tag = String(el.tagName || '').toLowerCase();
    const domType = tag === 'input' ? String(el.type || (el.getAttribute && el.getAttribute('type')) || 'text').toLowerCase().trim() : '';
    if (${JSON.stringify(wantSecretPw)} && (tag !== 'input' || domType !== 'password')) {
      wipeNode(el);
      const act = activeLeaf(document);
      if (act && act !== el) wipeNode(act);
      return { ok: false, code: 'role_changed' };
    }
    const activeOk = !window.vsFocusHijacked && activeLeaf(document) === el;
    const matchBefore = ${checkExpr};
    if (!activeOk || !matchBefore) {
      wipeNode(el);
      const act = activeLeaf(document);
      if (act && act !== el) wipeNode(act);
      return { ok: false, code: !activeOk ? 'focus_moved' : 'field_cleared' };
    }
    if (el.dispatchEvent) el.dispatchEvent(new Event('change', { bubbles: true }));
    const matchAfter = ${checkExpr};
    if (!matchAfter) {
      wipeNode(el);
      return { ok: false, code: 'field_cleared' };
    }
    return { ok: true };
  })()`;
}

const WIPE_FAILED_FILL_EXPR = `(() => {
  ${NODE_HELPERS_SRC}
  const el = window.vsFillTarget;
  window.vsFillTarget = null;
  if (el) wipeNode(el);
  if (window.vsLoginTouched instanceof Set) {
    for (const n of window.vsLoginTouched) wipeNode(n);
  }
  const act = activeLeaf(document);
  if (act) wipeNode(act);
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

function wipeTypedExpr(salt = '', targets = [], { allowTypedHeuristic = true, maxScanPositions = DEFAULT_MAX_SCAN_POSITIONS } = {}) {
  const allowHeuristic = Boolean(allowTypedHeuristic);
  return `(() => {
    ${NODE_HELPERS_SRC}
    ${filledTargetSrc(salt, targets, { maxScanPositions })}
    const _vsAllowHeuristic = ${JSON.stringify(allowHeuristic)};
    let wiped = 0;
    let remaining = 0;
    let hasFrames = false;
    let tooMuchText = false;
    try {
      hasFrames = Boolean(document.querySelector('iframe, frame'));
      const typedNodes = new Set();
      const filledHolders = new Set();
      const cutNodes = new Set();
      if (_vsAllowHeuristic && window.vsLoginTouched instanceof Set) {
        for (const n of window.vsLoginTouched) if (n && n.nodeType === 1) typedNodes.add(n);
      }
      const snap = _vsAllowHeuristic ? window.vsLoginSnap : null;
      const preVals = typeof WeakMap === 'function' ? new WeakMap() : null;
      const scanNodeTarget = (v1, v2) => {
        const s1 = scanFilledTarget(v1);
        const s2 = v2 && v2 !== v1 ? scanFilledTarget(v2) : false;
        if (s1 === 'match' || s2 === 'match') return 'match';
        if (s1 === 'cut' || s2 === 'cut') return 'cut';
        return false;
      };
      for (const node of collectControls(document)) {
        const v = valOfNode(node);
        const av = attrValOfNode(node);
        if (preVals) preVals.set(node, [v, av]);
        const st = scanNodeTarget(v, av);
        if (st === 'match') {
          typedNodes.add(node);
          filledHolders.add(node);
          continue;
        }
        if (st === 'cut') {
          tooMuchText = true;
          cutNodes.add(node);
          continue;
        }
        if (!_vsAllowHeuristic || !isTextControl(node)) continue;
        const curLen = v.length;
        if (curLen <= 0) continue;
        const tag = String(node.tagName || '').toLowerCase();
        const domType = tag === 'input' ? String(node.type || (node.getAttribute && node.getAttribute('type')) || 'text').toLowerCase().trim() : '';
        if (snap) {
          let baseLen = null;
          if (snap.wm && snap.wm.has(node)) baseLen = snap.wm.get(node) || 0;
          else if (Array.isArray(snap.list)) {
            const hit = snap.list.find((x) => x && x.node === node);
            if (hit) baseLen = hit.len || 0;
          }
          if (baseLen === null) baseLen = domType === 'password' ? 0 : defValOfNode(node).length;
          if (curLen > baseLen) typedNodes.add(node);
        } else if (domType === 'password' || node.isContentEditable || v !== defValOfNode(node)) {
          typedNodes.add(node);
        }
      }
      for (const node of typedNodes) {
        const hadVal = Boolean(node && lenOfNode(node) > 0);
        if (node && lenOfNode(node) > 0 && wipeNode(node)) wiped++;
        if (node && filledHolders.has(node)) {
          const clearedAttr = wipeAttrOfNode(node);
          if (!hadVal && clearedAttr) wiped++;
        }
      }
      for (const node of typedNodes) {
        if (node && node.isConnected && lenOfNode(node) > 0) remaining++;
      }
      for (const node of cutNodes) {
        if (node && node.isConnected) remaining++;
      }
      for (const node of filledHolders) {
        if (node && node.isConnected && !(typedNodes.has(node) && lenOfNode(node) > 0)) {
          const st2 = scanNodeTarget(valOfNode(node), attrValOfNode(node));
          if (st2 === 'match' || st2 === 'cut') {
            if (st2 === 'cut') tooMuchText = true;
            remaining++;
          }
        }
      }
      if (typedNodes.size > 0 && preVals) {
        for (const node of collectControls(document)) {
          if (!node || !node.isConnected || filledHolders.has(node) || cutNodes.has(node)) continue;
          const v2 = valOfNode(node);
          const av2 = attrValOfNode(node);
          const prev = preVals.get(node);
          if (prev && prev[0] === v2 && prev[1] === av2) continue;
          const st3 = scanNodeTarget(v2, av2);
          if (st3 === 'match' || st3 === 'cut') {
            if (st3 === 'cut') tooMuchText = true;
            if (!(typedNodes.has(node) && lenOfNode(node) > 0)) remaining++;
          }
        }
      }
    } catch {
      return { ok: false, wiped, remaining: 1 };
    }
    return {
      ok: true,
      wiped,
      remaining,
      ...(hasFrames ? { hasFrames: true } : {}),
      ...(tooMuchText ? { tooMuchText: true, reason: 'too much text to check' } : {}),
    };
  })()`;
}

const valOf = (r) => (r && !r.timeout && !r.error && r.result && r.result.result ? r.result.result.value : null);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSend(call, browserCall, sessionId) {
  return (method, params) => (method === 'Target.getTargetInfo' && typeof browserCall === 'function'
    ? browserCall(method, params)
    : call(method, params, sessionId));
}

async function evalInWorld(send, contextId, expression, { awaitPromise = false } = {}) {
  const r = await send('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: !!awaitPromise });
  return valOf(r);
}

/** B-5f2e (line 2): the `iframe` target infos whose parent chain reaches `treeIds` (the tab's frame tree) — PURE, through
 *  browser-stuck's tabFrameTargets (the watch's own rule); a frame of the tree itself is not one (it is walked in-process). */
function ownFrameTargetInfos(infos, treeIds) {
  const list = (Array.isArray(infos) ? infos : []).filter((t) => t && t.type === 'iframe' && t.targetId && !(treeIds && treeIds.has(String(t.targetId))));
  const byId = new Map(list.map((t) => [String(t.targetId), t]));
  return require('../browser-stuck.js').tabFrameTargets(list.map((t) => [String(t.targetId), { url: t.url, parent: t.parentFrameId }]), treeIds || new Set()).map((x) => byId.get(x.targetId)).filter(Boolean);
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

/** Query browser-truth target/frame URLs + open a fresh isolated world on the top-level frame (never main world). */
async function openIsolatedOrigin({ call, browserCall = null, sessionId = undefined, targetId = null, trackedUrl = null } = {}) {
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
    if (!ti || typeof ti.url !== 'string' || !ti.url) return { ok: false, code: 'no_target_info' };
    resolvedTargetId = String(targetId || (ti && ti.targetId) || frameId);
    targetUrl = ti && typeof ti.url === 'string' ? ti.url : '';
    const trkRaw = typeof trackedUrl === 'function' ? trackedUrl() : trackedUrl;
    trackedOrigin = trkRaw ? BL.originOf(trkRaw) : null;
    targetOrigin = targetUrl ? BL.originOf(targetUrl) : (trackedOrigin || frameOrigin);

    const iwRes = await send('Page.createIsolatedWorld', { frameId, worldName: WORLD_NAME, grantUniveralAccess: false });
    contextId = iwRes && !iwRes.timeout && !iwRes.error && iwRes.result ? Number(iwRes.result.executionContextId) : 0;
    if (!Number.isInteger(contextId) || contextId <= 0) return { ok: false, code: 'no_isolated_world' };

    raw = await evalInWorld(send, contextId, ORIGIN_CHECK_EXPR);
    if (!raw || !raw.ok) return { ok: false, code: 'inspect_failed' };
    isoOrigin = BL.originOf(raw.isoOrigin || raw.isoHref);

    const allAgree = !!(frameOrigin && secOrigin && targetOrigin && isoOrigin
      && frameOrigin === secOrigin && frameOrigin === targetOrigin && frameOrigin === isoOrigin
      && (!trackedOrigin || trackedOrigin === frameOrigin));
    if (allAgree) break;
    const transientRedirectSkew = attempt < REDIRECT_SETTLE_TRIES && frameOrigin && secOrigin && isoOrigin && frameOrigin === secOrigin && frameOrigin === isoOrigin;
    if (!transientRedirectSkew) {
      return { ok: false, code: 'origin_mismatch', mismatch: true, browserOrigin: trackedOrigin || targetOrigin || frameOrigin, isoOrigin, targetId: resolvedTargetId };
    }
    await sleepMs(REDIRECT_SETTLE_MS);
  }

  if (!frameOrigin || !secOrigin || !targetOrigin || !isoOrigin
    || frameOrigin !== secOrigin || frameOrigin !== targetOrigin || frameOrigin !== isoOrigin
    || (trackedOrigin && trackedOrigin !== frameOrigin)) {
    return { ok: false, code: 'origin_mismatch', mismatch: true, browserOrigin: trackedOrigin || targetOrigin || frameOrigin, isoOrigin, targetId: resolvedTargetId };
  }

  return {
    ok: true,
    frameTree: ft,
    topFrameId: frameId,
    contextId,
    origin: frameOrigin,
    url: targetUrl || frameUrl,
    targetId: resolvedTargetId,
  };
}

function normSpace(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function rolesMatch(wantRole, axRole) {
  const w = String(wantRole || '').toLowerCase();
  const a = String(axRole || '').toLowerCase();
  if (!w || !a) return false;
  if (w === a) return true;
  if ((w === 'textbox' && a === 'password') || (w === 'password' && a === 'textbox')) return true;
  if ((w === 'textbox' && a === 'searchbox') || (w === 'searchbox' && a === 'textbox')) return true;
  return false;
}

function axRoleAliasesOf(wantRole) {
  const w = String(wantRole || '').toLowerCase().trim();
  if (!w) return [];
  if (w === 'textbox') return ['textbox', 'password', 'searchbox'];
  if (w === 'password' || w === 'searchbox') return [w, 'textbox'];
  return [w];
}

function openShortCdpSession({
  wsUrl,
  WebSocketImpl = null,
  targetId,
  maxPayloadBytes = DEFAULT_AX_MAX_PAYLOAD_BYTES,
  timeoutMs = DEFAULT_AX_QUERY_TIMEOUT_MS,
} = {}) {
  const WSClass = WebSocketImpl || DefaultWS;
  if (!wsUrl || !WSClass || !targetId) return Promise.resolve({ ok: false, error: 'missing short CDP socket endpoint or targetId' });
  return new Promise((resolve) => {
    let ws = null;
    let settled = false;
    let closed = false;
    let tooLarge = false;
    let timedOut = false;
    let idSeq = 0;
    const pending = new Map();
    const attachedSids = new Set();

    const terminateSocket = () => {
      if (!ws) return;
      try { if (ws._req && typeof ws._req.destroy === 'function') ws._req.destroy(); } catch { /* */ }
      try { if (ws._socket && typeof ws._socket.destroy === 'function') ws._socket.destroy(); } catch { /* */ }
      try {
        if (typeof ws.terminate === 'function') ws.terminate();
        else ws.close(1000);
      } catch {
        try { ws.close(); } catch { /* */ }
      }
    };
    const failPending = (why) => {
      for (const [, fn] of pending) {
        try { fn(why); } catch { /* */ }
      }
      pending.clear();
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      failPending({ timeout: true });
      terminateSocket();
      if (!settled) { settled = true; resolve({ ok: false, timedOut: true, tooLarge: false, error: 'short CDP socket timed out' }); }
    }, Math.max(250, Number(timeoutMs) || DEFAULT_AX_QUERY_TIMEOUT_MS));
    if (deadline.unref) deadline.unref();

    try {
      ws = new WSClass(wsUrl, {
        perMessageDeflate: false,
        handshakeTimeout: Math.min(1500, Math.max(250, Number(timeoutMs) || DEFAULT_AX_QUERY_TIMEOUT_MS)),
        maxPayload: Math.max(4096, Number(maxPayloadBytes) || DEFAULT_AX_MAX_PAYLOAD_BYTES),
      });
    } catch (err) {
      clearTimeout(deadline);
      settled = true;
      resolve({ ok: false, error: String((err && err.message) || err) });
      return;
    }

    const rawCall = (method, params = {}, sid = null, perCallMs = timeoutMs) => new Promise((res) => {
      if (closed || !ws || ws.readyState !== 1) {
        res(tooLarge ? { tooLarge: true, error: { message: 'Max payload size exceeded' } } : (timedOut ? { timeout: true } : { error: { message: 'cdp socket closed' } }));
        return;
      }
      const id = ++idSeq;
      const t = setTimeout(() => {
        if (pending.delete(id)) res({ timeout: true });
      }, Math.max(100, Number(perCallMs) || DEFAULT_AX_QUERY_TIMEOUT_MS));
      if (t.unref) t.unref();
      pending.set(id, (msg) => { clearTimeout(t); res(msg); });
      try {
        ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
      } catch (err) {
        pending.delete(id);
        clearTimeout(t);
        res({ error: { message: String((err && err.message) || err) } });
      }
    });

    ws.on('message', (data) => {
      if (tooLarge) return;
      const byteLen = typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : (data ? data.length : 0);
      if (byteLen > (Number(maxPayloadBytes) || DEFAULT_AX_MAX_PAYLOAD_BYTES)) {
        tooLarge = true;
        failPending({ tooLarge: true, error: { message: 'Max payload size exceeded' } });
        try { ws.close(1009); } catch { terminateSocket(); }
        return;
      }
      let m = null;
      try { m = JSON.parse(typeof data === 'string' ? data : data.toString('utf8')); } catch { return; }
      if (m && m.id && pending.has(m.id)) {
        const fn = pending.get(m.id);
        pending.delete(m.id);
        fn(m);
      }
    });
    ws.on('error', (err) => {
      const msg = String((err && err.message) || '');
      if ((err && err.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') || /Max payload size exceeded/i.test(msg)) {
        tooLarge = true;
      }
      if ((err && err.code === 'ETIMEDOUT') || /handshake has timed out/i.test(msg)) {
        timedOut = true;
      }
      terminateSocket();
      failPending(tooLarge ? { tooLarge: true, error: { message: msg || 'Max payload size exceeded' } } : { error: { message: msg || 'ws error' } });
      if (!settled) {
        clearTimeout(deadline);
        settled = true;
        resolve({ ok: false, tooLarge, timedOut, error: msg || 'short CDP socket error' });
      }
    });
    ws.on('close', (code) => {
      closed = true;
      if (code === 1009) tooLarge = true;
      failPending(tooLarge ? { tooLarge: true, error: { message: 'Max payload size exceeded' } } : { error: { message: 'ws closed' } });
      if (!settled) {
        clearTimeout(deadline);
        settled = true;
        resolve({ ok: false, tooLarge, timedOut, error: 'ws closed before open' });
      }
    });
    ws.once('open', async () => {
      const att = await rawCall('Target.attachToTarget', { targetId: String(targetId), flatten: true }, null, Math.min(1500, timeoutMs));
      const sid = att && !att.timeout && !att.error && att.result && att.result.sessionId ? String(att.result.sessionId) : '';
      if (!sid) {
        clearTimeout(deadline);
        const attErr = att && att.error && att.error.message ? `attach failed: ${String(att.error.message).slice(0, 160)}` : 'attach failed';
        terminateSocket();
        if (!settled) { settled = true; resolve({ ok: false, tooLarge, timedOut: Boolean(att && att.timeout) || timedOut, error: attErr }); }
        return;
      }
      attachedSids.add(sid);
      const close = async () => {
        clearTimeout(deadline);
        if (!closed && ws && ws.readyState === 1) {
          for (const s of [...attachedSids]) {
            try { await rawCall('Target.detachFromTarget', { sessionId: s }, null, 250); } catch { /* */ }
          }
          try { ws.close(1000); } catch { terminateSocket(); }
        } else if (!closed) {
          terminateSocket();
        }
      };
      if (!settled) {
        settled = true;
        resolve({
          ok: true,
          sid,
          send: (m, p) => rawCall(m, p, sid, timeoutMs),
          browserSend: (m, p) => rawCall(m, p, null, timeoutMs),
          attachTarget: async (tid) => {
            const a = await rawCall('Target.attachToTarget', { targetId: String(tid), flatten: true }, null, Math.min(1000, timeoutMs));
            const s2 = a && !a.timeout && !a.error && a.result && a.result.sessionId ? String(a.result.sessionId) : '';
            if (!s2) return null;
            attachedSids.add(s2);
            return { sid: s2, send: (m, p) => rawCall(m, p, s2, timeoutMs) };
          },
          isTooLarge: () => tooLarge,
          isTimedOut: () => timedOut,
          close,
        });
      }
    });
  });
}

async function queryFrameMatchesForRef(s, fid, inFrame, wantRole, wantName, {
  isTooLarge = () => false,
  isTimedOut = () => false,
  maxNodes = DEFAULT_AX_MAX_NODES,
} = {}) {
  const iw = await s('Page.createIsolatedWorld', { frameId: String(fid), worldName: AX_WORLD_NAME, grantUniveralAccess: false });
  if (isTooLarge()) return { ok: false, timedOut: false };
  if (isTimedOut() || (iw && iw.timeout)) return { ok: false, timedOut: true };
  const ctxId = iw && !iw.error && iw.result ? Number(iw.result.executionContextId) : 0;
  if (!Number.isInteger(ctxId) || ctxId <= 0) return { ok: true, matches: [] };

  const rootEv = await s('Runtime.evaluate', {
    contextId: ctxId,
    expression: 'document.documentElement || document.body || document',
    objectGroup: AX_WORLD_NAME,
    returnByValue: false,
  });
  if (isTooLarge()) return { ok: false, timedOut: false };
  if (isTimedOut() || (rootEv && rootEv.timeout)) return { ok: false, timedOut: true };
  const objectId = rootEv && !rootEv.error && rootEv.result && rootEv.result.result && rootEv.result.result.objectId
    ? String(rootEv.result.result.objectId)
    : '';
  if (!objectId) return { ok: true, matches: [] };

  const seenBids = new Set();
  const matches = [];
  const aliases = axRoleAliasesOf(wantRole);

  const collectFromNodes = (nodes) => {
    for (const n of nodes) {
      if (!n || n.ignored === true) continue;
      const bid = Number(n.backendDOMNodeId);
      if (!Number.isInteger(bid) || bid <= 0 || seenBids.has(bid)) continue;
      const role = n.role && typeof n.role.value === 'string' ? n.role.value.toLowerCase().trim() : '';
      if (!role || !rolesMatch(wantRole, role)) continue;
      const rawName = n.name && typeof n.name.value === 'string' ? n.name.value : '';
      if (normSpace(rawName) !== wantName) continue;
      seenBids.add(bid);
      matches.push({ backendNodeId: bid, frameId: String(fid), inFrame: !!inFrame, role, name: rawName });
    }
  };

  try {
    // 1. Exact `(role, accessibleName)` query first when `wantName` is non-empty (~1.3 KiB on a 3,000-row page).
    if (wantName) {
      for (const qRole of aliases) {
        const r = await s('Accessibility.queryAXTree', { objectId, role: qRole, accessibleName: wantName });
        if (isTooLarge() || (r && r.tooLarge)) return { ok: false, timedOut: false };
        if (isTimedOut() || (r && r.timeout)) return { ok: false, timedOut: true };
        if (r && r.error) return { ok: false, timedOut: false, cdpError: true };
        const nodes = r && !r.error && r.result && Array.isArray(r.result.nodes) ? r.result.nodes : [];
        if (nodes.length > maxNodes) return { ok: false, timedOut: false, nodesExceeded: true };
        collectFromNodes(nodes);
        if (matches.length > 0 && qRole === aliases[0]) break;
      }
    }
    // 2. Role-only bounded query when `wantName` is empty or whitespace normalization differed from exact `accessibleName`.
    if (matches.length === 0) {
      for (const qRole of aliases) {
        const r = await s('Accessibility.queryAXTree', { objectId, role: qRole });
        if (isTooLarge() || (r && r.tooLarge)) return { ok: false, timedOut: false };
        if (isTimedOut() || (r && r.timeout)) return { ok: false, timedOut: true };
        if (r && r.error) return { ok: false, timedOut: false, cdpError: true };
        const nodes = r && !r.error && r.result && Array.isArray(r.result.nodes) ? r.result.nodes : [];
        if (nodes.length > maxNodes) return { ok: false, timedOut: false, nodesExceeded: true };
        collectFromNodes(nodes);
        if (matches.length > 0 && qRole === aliases[0]) break;
      }
    }
  } finally {
    try { await s('Runtime.releaseObjectGroup', { objectGroup: AX_WORLD_NAME }); } catch { /* */ }
  }
  return { ok: true, matches };
}

/**
 * Resolve ONE `@ref` descriptor (`{ ref, role, name, nth }`) on demand at `fill --vault` time (N2 + A3 + Ruling 5a).
 * Uses ONLY the dedicated short-lived CDP WebSocket (`maxPayloadBytes`, `timeoutMs`, `maxNodes`) — NEVER falls back to
 * the standing watch socket. Any short-socket failure refuses by name (`target_not_found`) naming the cause.
 */
async function resolveSnapshotRef({
  wsUrl = '',
  WebSocketImpl = null,
  targetId = null,
  frameTree: preFrameTree = null,
  parsedRef = null,
  maxPayloadBytes = DEFAULT_AX_MAX_PAYLOAD_BYTES,
  timeoutMs = DEFAULT_AX_QUERY_TIMEOUT_MS,
  maxNodes = DEFAULT_AX_MAX_NODES,
} = {}) {
  if (!parsedRef || typeof parsedRef !== 'object' || !parsedRef.ref) {
    return { ok: false, code: 'target_not_found', reason: 'not_found', error: 'missing snapshot ref descriptor' };
  }
  const key = String(parsedRef.ref).startsWith('@') ? String(parsedRef.ref) : `@${parsedRef.ref}`;
  const wantRole = String(parsedRef.role || '').toLowerCase().trim();
  const wantName = normSpace(parsedRef.name || '');
  const wantNth = Number.isInteger(parsedRef.nth) && parsedRef.nth >= 0 ? parsedRef.nth : 0;
  if (!wantRole) {
    return { ok: false, code: 'target_not_found', reason: 'not_found', error: `element ${key} has no accessibility role in the latest snapshot` };
  }
  if (!wsUrl || !targetId) {
    return {
      ok: false,
      code: 'target_not_found',
      reason: 'ax_connect_failed',
      error: `element ${key} could not be resolved because the short accessibility connection is unavailable — pass a CSS selector to fill --vault instead`,
    };
  }

  const shortSess = await openShortCdpSession({ wsUrl, WebSocketImpl, targetId, maxPayloadBytes, timeoutMs });
  if (!shortSess || !shortSess.ok) {
    if (shortSess && shortSess.tooLarge) {
      return {
        ok: false,
        code: 'target_not_found',
        reason: 'ax_reply_too_large',
        error: `element ${key} could not be resolved because the page's accessibility reply exceeded ${Math.round(maxPayloadBytes / 1048576) || 1} MiB — pass a CSS selector to fill --vault instead`,
      };
    }
    if (shortSess && shortSess.timedOut) {
      return {
        ok: false,
        code: 'target_not_found',
        reason: 'ax_timeout',
        error: `element ${key} could not be resolved within ${timeoutMs} ms on the short accessibility connection — pass a CSS selector to fill --vault instead`,
      };
    }
    const cause = String((shortSess && shortSess.error) || 'connection failed').slice(0, 160);
    return {
      ok: false,
      code: 'target_not_found',
      reason: 'ax_connect_failed',
      error: `element ${key} could not be resolved because the short accessibility connection failed (${cause}) — pass a CSS selector to fill --vault instead`,
    };
  }

  const send = shortSess.send;
  const isTooLarge = shortSess.isTooLarge;
  const isTimedOut = shortSess.isTimedOut;
  const capError = (wasTimeout, nodesExceeded = false, cdpError = false) => ({
    ok: false,
    code: 'target_not_found',
    reason: wasTimeout ? 'ax_timeout' : (nodesExceeded ? 'ax_nodes_exceeded' : (cdpError ? 'ax_cdp_error' : 'ax_reply_too_large')),
    error: wasTimeout
      ? `element ${key} could not be resolved within ${timeoutMs} ms on this page — pass a CSS selector to fill --vault instead`
      : nodesExceeded
        ? `element ${key} could not be resolved because the page returned more than ${maxNodes} accessibility nodes — pass a CSS selector to fill --vault instead`
        : cdpError
          ? `element ${key} was not found because the accessibility query failed on the current snapshot — pass a CSS selector to fill --vault instead, or run \`vibespace-browser snapshot -i\` and retry`
          : `element ${key} could not be resolved because the page's accessibility reply exceeded ${Math.round(maxPayloadBytes / 1048576) || 1} MiB — pass a CSS selector to fill --vault instead`,
  });

  try {
    let ft = preFrameTree;
    if (!ft || !ft.frame || !ft.frame.id) {
      const ftRes = await send('Page.getFrameTree', {});
      if (isTooLarge()) return capError(false);
      if (isTimedOut() || (ftRes && ftRes.timeout)) return capError(true);
      ft = ftRes && !ftRes.error && ftRes.result ? ftRes.result.frameTree : null;
    }
    const topFrameId = ft && ft.frame && ft.frame.id ? String(ft.frame.id) : '';
    if (!topFrameId) return { ok: false, code: 'target_not_found', reason: 'not_found', error: 'no top-level document is available on the current tab' };

    try { await send('DOM.enable', {}); } catch { /* optional */ }

    const qTop = await queryFrameMatchesForRef(send, topFrameId, false, wantRole, wantName, { isTooLarge, isTimedOut, maxNodes });
    if (!qTop.ok) return capError(Boolean(qTop.timedOut), Boolean(qTop.nodesExceeded), Boolean(qTop.cdpError));
    if (qTop.matches.length > wantNth) {
      return { ok: true, entry: qTop.matches[wantNth] };
    }

    let rem = wantNth - qTop.matches.length;
    const { list: descendants, ids: treeFrameIds } = flattenDescendantFrames(ft);
    for (const sub of descendants.slice(0, MAX_AX_CHILD_FRAMES)) {
      if (!sub || !sub.id) continue;
      const qSub = await queryFrameMatchesForRef(send, String(sub.id), true, wantRole, wantName, { isTooLarge, isTimedOut, maxNodes });
      if (!qSub.ok) return capError(Boolean(qSub.timedOut), Boolean(qSub.nodesExceeded), Boolean(qSub.cdpError));
      if (qSub.matches.length > rem) {
        return { ok: true, entry: qSub.matches[rem] };
      }
      rem -= qSub.matches.length;
    }

    const tgts = await shortSess.browserSend('Target.getTargets', {});
    const infos = tgts && !tgts.error && tgts.result && Array.isArray(tgts.result.targetInfos) ? tgts.result.targetInfos : [];
    // B-5f2e (line 2): only THIS tab's out-of-process frames — Target.getTargets lists the whole browser's; a frame is the tab's
    // when its parent chain reaches the tab's frame tree (as inspectOopIframes filters), never another tab's frame
    const oopInfos = ownFrameTargetInfos(infos, treeFrameIds).slice(0, MAX_AX_CHILD_FRAMES);
    for (const inf of oopInfos) {
      const oop = await shortSess.attachTarget(inf.targetId);
      if (!oop) continue;
      try { await oop.send('DOM.enable', {}); } catch { /* optional */ }
      const oopFt = await oop.send('Page.getFrameTree', {});
      const oopFid = (oopFt && !oopFt.error && oopFt.result && oopFt.result.frameTree && oopFt.result.frameTree.frame && oopFt.result.frameTree.frame.id) || String(inf.targetId);
      const qOop = await queryFrameMatchesForRef(oop.send, oopFid, true, wantRole, wantName, { isTooLarge, isTimedOut, maxNodes });
      if (!qOop.ok) return capError(Boolean(qOop.timedOut), Boolean(qOop.nodesExceeded), Boolean(qOop.cdpError));
      if (qOop.matches.length > rem) {
        return { ok: true, entry: qOop.matches[rem] };
      }
      rem -= qOop.matches.length;
    }

    return {
      ok: false,
      code: 'target_not_found',
      reason: 'not_found',
      error: `element ${key} is no longer present in the current tab — run \`vibespace-browser snapshot -i\` and retry`,
    };
  } finally {
    await shortSess.close();
  }
}

/** Fill ONE vault slot (`user | current | pending | previous | otp`) into `@ref` (`backendNodeId`) or top-frame CSS selector. */
async function fillVaultElement({
  call,
  browserCall = null,
  oopFrames = null,
  sessionId = undefined,
  targetId = null,
  trackedUrl = null,
  iso: preOpenedIso = null,
  profileId = '',
  origin,
  target,
  refEntry = null,
  slot = 'current',
  value = '',
  resolveValue = null,
  secret = true,
  extraSecrets = null,
  preArmIntercept = null,
  guardBeforeInsert = null,
  onBeforeInsert = null,
} = {}) {
  if (typeof call !== 'function') {
    return { ok: false, code: 'browser_unavailable', error: 'no CDP session is open on the target tab' };
  }
  const wantOrigin = BL.originOf(origin);
  if (!wantOrigin || !BL.secureOrigin(wantOrigin)) {
    return { ok: false, code: 'login_phishing', error: 'refused to fill credentials without a verified secure origin' };
  }
  const targetStr = String(target || '').trim();
  if (!targetStr) {
    return { ok: false, code: 'bad_request', error: 'missing target (@ref or CSS selector)' };
  }

  // 1. Browser-truth origin gate (`Page.getFrameTree` + `Target.getTargetInfo` + top-frame isolated-world `location.origin`).
  const iso = preOpenedIso && preOpenedIso.ok ? preOpenedIso : await openIsolatedOrigin({ call, browserCall, sessionId, targetId, trackedUrl });
  if (!iso.ok) {
    if (iso.mismatch) {
      return { ok: false, code: 'login_phishing', error: `the browser target URL (${iso.browserOrigin || 'none'}) and the page origin disagree — nothing was filled` };
    }
    return { ok: false, code: 'target_not_found', error: 'no top-level document is available on the current tab' };
  }
  if (iso.origin !== wantOrigin) {
    return { ok: false, code: 'login_phishing', error: `the tab is on ${iso.origin}, not ${wantOrigin} — nothing was filled` };
  }

  const send = makeSend(call, browserCall, sessionId);
  const ctxId = iso.contextId;
  const ctxKey = String(iso.targetId || targetId || sessionId || '');
  const pidStr = String(profileId || '');
  const isRef = /^@[A-Za-z0-9_-]+$/.test(targetStr);

  // 2. Resolve target node identity into `window.vsFillTarget` inside the top-level isolated world.
  if (isRef) {
    if (!refEntry || !Number.isInteger(refEntry.backendNodeId) || refEntry.backendNodeId <= 0) {
      return { ok: false, code: 'target_not_found', error: `unknown or stale ref ${targetStr} — run vibespace-browser snapshot -i on the current tab first` };
    }
    if (refEntry.inFrame || (refEntry.frameId && String(refEntry.frameId) !== iso.topFrameId)) {
      return { ok: false, code: 'login_in_frame', error: `target ${targetStr} sits inside a frame — Vault fill only fills the top page's fields; ask the user to sign in there in the live view` };
    }
    const descRes = await send('DOM.describeNode', { backendNodeId: refEntry.backendNodeId });
    const descNode = descRes && !descRes.timeout && !descRes.error && descRes.result ? descRes.result.node : null;
    if (!descNode) {
      return { ok: false, code: 'target_not_found', error: `target ${targetStr} could not be described in the current tab — run snapshot -i again` };
    }
    if (descNode.frameId && String(descNode.frameId) !== iso.topFrameId) {
      return { ok: false, code: 'login_in_frame', error: `target ${targetStr} belongs to a child frame — nothing was filled` };
    }
    if (/^(iframe|frame)$/i.test(String(descNode.nodeName || ''))) {
      return { ok: false, code: 'login_in_frame', error: `target ${targetStr} is a frame element — nothing was filled` };
    }
    const rnRes = await send('DOM.resolveNode', { backendNodeId: refEntry.backendNodeId, executionContextId: ctxId });
    const objectId = rnRes && !rnRes.timeout && !rnRes.error && rnRes.result && rnRes.result.object ? rnRes.result.object.objectId : '';
    if (!objectId) {
      return { ok: false, code: 'target_not_found', error: `target ${targetStr} is no longer attached to the top-level document — run snapshot -i again` };
    }
    const bindRes = await send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: 'function() { window.vsFillTarget = this; return Boolean(this && this.nodeType === 1); }',
      returnByValue: true,
    });
    try { await send('Runtime.releaseObject', { objectId }); } catch { /* */ }
    if (!valOf(bindRes)) {
      return { ok: false, code: 'target_not_found', error: `target ${targetStr} did not resolve to an element node` };
    }
  } else {
    // Ruling 5b: CSS selector queries ONLY the top-level frame's isolated world; child-frame matches refuse `login_in_frame`.
    const qTop = await evalInWorld(send, ctxId, queryTopSelectorExpr(targetStr));
    if (!qTop || !qTop.ok) {
      if (qTop && qTop.code && qTop.code !== 'not_found') {
        return { ok: false, code: qTop.code, error: qTop.error || qTop.code };
      }
      const { list: descendants, ids: treeFrameIds } = flattenDescendantFrames(iso.frameTree);
      for (const sub of descendants) {
        const subId = sub && sub.id ? String(sub.id) : '';
        if (!subId) continue;
        const subIw = await send('Page.createIsolatedWorld', { frameId: subId, worldName: WORLD_NAME, grantUniveralAccess: false });
        const subCtx = subIw && !subIw.timeout && !subIw.error && subIw.result ? Number(subIw.result.executionContextId) : 0;
        if (Number.isInteger(subCtx) && subCtx > 0 && await evalInWorld(send, subCtx, childFrameHasSelectorExpr(targetStr))) {
          return { ok: false, code: 'login_in_frame', error: `selector ${targetStr} matched inside a child frame — Vault fill only targets top-level document elements` };
        }
      }
      let hitOopFrame = false;
      if (typeof oopFrames === 'function') {
        await oopFrames(treeFrameIds, async (oop) => {
          if (hitOopFrame || !oop || typeof oop.call !== 'function') return;
          const oopSend = (m, p) => oop.call(m, p);
          const oopFt = await oopSend('Page.getFrameTree', {});
          const oopFid = (oopFt && !oopFt.timeout && !oopFt.error && oopFt.result && oopFt.result.frameTree && oopFt.result.frameTree.frame && oopFt.result.frameTree.frame.id) || '';
          if (!oopFid) return;
          const oopIw = await oopSend('Page.createIsolatedWorld', { frameId: String(oopFid), worldName: WORLD_NAME, grantUniveralAccess: false });
          const oopCtx = oopIw && !oopIw.timeout && !oopIw.error && oopIw.result ? Number(oopIw.result.executionContextId) : 0;
          if (Number.isInteger(oopCtx) && oopCtx > 0 && await evalInWorld(oopSend, oopCtx, childFrameHasSelectorExpr(targetStr))) {
            hitOopFrame = true;
          }
        });
      }
      if (hitOopFrame) {
        return { ok: false, code: 'login_in_frame', error: `selector ${targetStr} matched inside a cross-origin frame — Vault fill only targets top-level document elements` };
      }
      return { ok: false, code: 'target_not_found', error: `no element matched ${targetStr} in the top-level document` };
    }
  }

  // 3. Verify node type/visibility BEFORE resolving secret or focusing; then resolve & arm Hub intercept BEFORE focusing;
  //    finally focus + drain microtask/setTimeout(0) traps + lock non-target controls `inert` and type IMMEDIATELY (L5 zero seam).
  let attemptedInsert = false;
  let val = String(value == null ? '' : value);
  value = '';

  try {
    const elig = await evalInWorld(send, ctxId, verifyTargetNodeExpr(slot, secret));
    if (!elig || !elig.ok) {
      val = '';
      const code = (elig && elig.code) || 'login_form_changed';
      return { ok: false, code, error: (elig && elig.error) || `could not prepare target ${targetStr} (${code})`, attemptedInsert: false, contextId: ctxId };
    }

    if (secret && typeof preArmIntercept === 'function') {
      const arm = await preArmIntercept({ targetId: iso.targetId, origin: iso.origin, url: iso.url, contextId: ctxId });
      if (arm && arm.ok === false) {
        val = '';
        return {
          ok: false,
          code: arm.code || 'login_fence_unavailable',
          error: arm.error || `refused to fill without active browser request interception (${arm.fenceErr || 'interception not confirmed'}) — nothing was filled`,
          attemptedInsert: false,
          contextId: ctxId,
        };
      }
    }

    const prep = await evalInWorld(send, ctxId, armAndPrepareTargetExpr(slot, secret), { awaitPromise: true });
    if (!prep || !prep.ok) {
      val = '';
      await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
      const code = (prep && prep.code) || 'login_form_changed';
      return { ok: false, code, error: (prep && prep.error) || `could not prepare target ${targetStr} (${code})`, attemptedInsert: false, contextId: ctxId };
    }

    // L5: Zero `await`s between `prep` returning `{ ok: true }` and sending `Input.insertText` on the CDP socket when callbacks are sync.
    if (typeof guardBeforeInsert === 'function') {
      const g1 = guardBeforeInsert({ targetId: iso.targetId, origin: iso.origin, url: iso.url, contextId: ctxId, stage: 'after-prep' });
      if (g1 && !g1.ok) {
        val = '';
        await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
        return { code: 'login_phishing', error: 'the tab navigated away before typing — nothing was filled', ...g1, attemptedInsert: false, contextId: ctxId };
      }
    }

    let extraList = Array.isArray(extraSecrets) ? extraSecrets : [];
    if (typeof resolveValue === 'function') {
      const rvRaw = resolveValue({ targetId: iso.targetId, origin: iso.origin, url: iso.url, contextId: ctxId });
      const rv = rvRaw && typeof rvRaw.then === 'function' ? await rvRaw : rvRaw;
      if (!rv || !rv.ok) {
        val = '';
        await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
        return { ...(rv && typeof rv === 'object' ? rv : { ok: false, code: 'not_written', error: 'could not resolve vault value' }), attemptedInsert: false, contextId: ctxId };
      }
      val = String(rv.value == null ? '' : rv.value);
      if (Array.isArray(rv.extraSecrets)) extraList = rv.extraSecrets;
    }

    if (ctxKey && Number.isInteger(ctxId) && ctxId > 0 && secret) {
      lastContextByTarget.delete(ctxKey);
      lastContextByTarget.set(ctxKey, { profileId: pidStr, ctxId });
      while (lastContextByTarget.size > 64) lastContextByTarget.delete(lastContextByTarget.keys().next().value);
      supersedeTargetContext(ctxKey, ctxId, pidStr);
      if (slot !== 'otp') {
        rememberFilledSecrets(ctxKey, ctxId, [val, ...extraList], pidStr);
      }
    }

    if (secret && typeof onBeforeInsert === 'function') {
      const biRaw = onBeforeInsert({ targetId: iso.targetId, origin: iso.origin, url: iso.url, contextId: ctxId });
      const bi = biRaw && typeof biRaw.then === 'function' ? await biRaw : biRaw;
      // lane lg-store-writes (the moved2 cure 2's hunt (5)): the hook may REFUSE — its crash-guard record (the tab's fence) is not on
      // disk inside its bound: nothing is typed
      if (bi && bi.ok === false) {
        val = '';
        await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
        return { code: bi.code || 'fill_refused', error: bi.error || 'nothing was typed', attemptedInsert: false, contextId: ctxId };
      }
    }

    if (typeof guardBeforeInsert === 'function') {
      const g2 = guardBeforeInsert({ targetId: iso.targetId, origin: iso.origin, url: iso.url, contextId: ctxId, stage: 'before-insert' });
      if (g2 && !g2.ok) {
        val = '';
        await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
        return { code: 'login_phishing', error: 'the tab navigated away before typing — nothing was filled', ...g2, attemptedInsert: false, contextId: ctxId };
      }
    }

    const fSalt = secret ? crypto.randomBytes(12).toString('hex') : '';
    const wantHash = secret ? crypto.createHash('sha256').update(`${fSalt}:${val}`, 'utf8').digest('hex') : '';
    const wantUserLen = secret ? null : val.length;
    if (secret) attemptedInsert = true;

    const ins = await send('Input.insertText', { text: val });
    val = '';
    if (!ins || ins.timeout || ins.error) {
      await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
      return { ok: false, code: 'login_form_changed', error: 'browser rejected typing into the target element', attemptedInsert, insUncertain: Boolean(!ins || ins.timeout), contextId: ctxId };
    }

    const fin = await evalInWorld(send, ctxId, finalizeTargetExpr(slot, secret, fSalt, wantHash, wantUserLen));
    if (!fin || !fin.ok) {
      await evalInWorld(send, ctxId, WIPE_FAILED_FILL_EXPR);
      const why = (fin && fin.code) || 'field_cleared';
      return {
        ok: false,
        code: 'login_form_changed',
        error: why === 'focus_moved'
          ? 'focus moved away from the target element during typing — wiped and refused'
          : `target element modified or cleared typed input (${why}) — wiped and refused`,
        attemptedInsert,
        contextId: ctxId,
      };
    }

    return { ok: true, targetId: iso.targetId, origin: iso.origin, url: iso.url, contextId: ctxId };
  } finally {
    val = '';
    try { await evalInWorld(send, ctxId, RESTORE_FRAMES_EXPR); } catch { /* */ }
  }
}

/** Wipe every control that received typed text OR holds a filled value on a tab inside our isolated world (all frames, hidden included). */
// lane chrome-157 (主开发's L4, 2026-11-15): DOES THE FILLED BOX STILL HOLD THE SECRET? Detect-only — never wipes. In the fill's OWN
// isolated world (where the fill kept the boxes it typed into, window.vsLoginTouched — the set the wipe reads), each such box is
// asked whether it is still in the page and still holds a value matching the fill, by the wipe's salted hash matcher (no value goes
// into the page). → { ok, holding, touched } | { ok:false } (no such world, no such set, nothing touched: cannot tell)
function filledBoxHoldsExpr(salt, targets) {
  return `(() => {
    ${NODE_HELPERS_SRC}
    ${filledTargetSrc(salt, targets, { maxScanPositions: DEFAULT_MAX_SCAN_POSITIONS })}
    try {
      if (!(window.vsLoginTouched instanceof Set)) return { ok: false };
      let holding = 0, touched = 0;
      for (const n of window.vsLoginTouched) {
        if (!n || n.nodeType !== 1) continue;
        touched++;
        if (!n.isConnected) continue;
        const s1 = scanFilledTarget(valOfNode(n));
        const s2 = scanFilledTarget(attrValOfNode(n));
        if (s1 === 'match' || s2 === 'match' || s1 === 'cut' || s2 === 'cut') holding++;
      }
      return { ok: true, holding, touched };
    } catch { return { ok: false }; }
  })()`;
}
async function filledBoxHolds({ call, sessionId = undefined, contextId = 0, secretValues = null, wholeOnlyValues = null } = {}) {
  if (typeof call !== 'function' || !(Number(contextId) > 0)) return { ok: false };
  const { salt, targets } = buildFilledTargets(secretValues, { wholeOnlyValues });
  if (!targets.length) return { ok: false };
  const send = makeSend(call, null, sessionId);
  const v = valOf(await send('Runtime.evaluate', { expression: filledBoxHoldsExpr(salt, targets), contextId: Number(contextId), returnByValue: true, awaitPromise: false }));
  if (!v || v.ok !== true || !Number.isFinite(v.holding) || !(Number(v.touched) > 0)) return { ok: false };
  return { ok: true, holding: Number(v.holding), touched: Number(v.touched) };
}

async function wipeTabTypedInputs({ call, oopFrames = null, sessionId = undefined, targetId = null, contextId = 0, secretValues = null, wholeOnlyValues = null, prebuiltTargets = null, allowTypedHeuristic = true, maxScanPositions = DEFAULT_MAX_SCAN_POSITIONS } = {}) {
  if (typeof call !== 'function') return { ok: false, wiped: 0, verifiedEmpty: false };
  const send = makeSend(call, null, sessionId);
  const ctxKey = String(targetId || sessionId || '');
  const savedEntry = ctxKey ? lastContextByTarget.get(ctxKey) : null;
  const savedCtx = Number(contextId) > 0 ? Number(contextId) : ((savedEntry && typeof savedEntry === 'object' ? Number(savedEntry.ctxId) : Number(savedEntry)) || 0);
  const hasPrebuilt = Boolean(prebuiltTargets && typeof prebuiltTargets === 'object' && Array.isArray(prebuiltTargets.targets) && prebuiltTargets.targets.length > 0 && typeof prebuiltTargets.salt === 'string' && prebuiltTargets.salt);
  const { salt, targets } = hasPrebuilt
    ? prebuiltTargets
    : targetsForTab(targetId, savedCtx, secretValues, sessionId, { wholeOnlyValues });
  const expr = wipeTypedExpr(salt, targets, { allowTypedHeuristic: Boolean(allowTypedHeuristic), maxScanPositions });
  const validWipeRes = (r) => Boolean(r && r.ok === true && Number.isFinite(r.remaining) && r.remaining >= 0);
  let res = null;
  let timedOut = false;
  let ft = null;
  if (Number.isInteger(savedCtx) && savedCtx > 0) {
    const rawRes = await send('Runtime.evaluate', { expression: expr, contextId: savedCtx, returnByValue: true, awaitPromise: false });
    timedOut = Boolean(rawRes && rawRes.timeout);
    res = valOf(rawRes);
  }
  if (!validWipeRes(res) && !timedOut) {
    const ftRes = await send('Page.getFrameTree', {});
    ft = ftRes && !ftRes.timeout && !ftRes.error && ftRes.result ? ftRes.result.frameTree : null;
    const fid = (ft && ft.frame && ft.frame.id) || '';
    if (!fid) return { ok: false, wiped: 0, verifiedEmpty: false };
    const iwRes = await send('Page.createIsolatedWorld', { frameId: String(fid), worldName: WORLD_NAME, grantUniveralAccess: false });
    const ctxId = iwRes && !iwRes.timeout && !iwRes.error && iwRes.result ? Number(iwRes.result.executionContextId) : 0;
    if (!Number.isInteger(ctxId) || contextId < 0 || ctxId <= 0) return { ok: false, wiped: 0, verifiedEmpty: false };
    res = await evalInWorld(send, ctxId, expr);
  }
  if (!validWipeRes(res)) return { ok: false, wiped: 0, verifiedEmpty: false };
  let totalWiped = Number(res.wiped) || 0;
  let totalRem = Number(res.remaining);
  let anyTooMuch = Boolean(res.tooMuchText);
  if (res.hasFrames && targets.length > 0) {
    if (!ft) {
      const ftRes = await send('Page.getFrameTree', {});
      ft = ftRes && !ftRes.timeout && !ftRes.error && ftRes.result ? ftRes.result.frameTree : null;
    }
    if (!ft) {
      totalRem++;
    } else {
      const subExpr = wipeTypedExpr(salt, targets, { allowTypedHeuristic: false, maxScanPositions });
      const { list: descendants, ids: treeFrameIds } = flattenDescendantFrames(ft);
      for (const sub of descendants) {
        const subId = sub && sub.id ? String(sub.id) : '';
        if (!subId) continue;
        const subIw = await send('Page.createIsolatedWorld', { frameId: subId, worldName: WORLD_NAME, grantUniveralAccess: false });
        const subCtx = subIw && !subIw.timeout && !subIw.error && subIw.result ? Number(subIw.result.executionContextId) : 0;
        if (!Number.isInteger(subCtx) || subCtx <= 0) { totalRem++; continue; }
        const subRes = await evalInWorld(send, subCtx, subExpr);
        if (validWipeRes(subRes)) {
          totalWiped += Number(subRes.wiped) || 0;
          totalRem += Number(subRes.remaining);
          if (subRes.tooMuchText) anyTooMuch = true;
        } else {
          totalRem++;
        }
      }
      if (typeof oopFrames === 'function') {
        await oopFrames(treeFrameIds, async (oop) => {
          if (!oop || typeof oop.call !== 'function') return;
          const oopSend = (m, p) => oop.call(m, p);
          const oopFt = await oopSend('Page.getFrameTree', {});
          const oopFid = (oopFt && !oopFt.timeout && !oopFt.error && oopFt.result && oopFt.result.frameTree && oopFt.result.frameTree.frame && oopFt.result.frameTree.frame.id) || String(oop.targetId || '');
          if (!oopFid) { totalRem++; return; }
          const oopIw = await oopSend('Page.createIsolatedWorld', { frameId: String(oopFid), worldName: WORLD_NAME, grantUniveralAccess: false });
          const oopCtx = oopIw && !oopIw.timeout && !oopIw.error && oopIw.result ? Number(oopIw.result.executionContextId) : 0;
          if (!Number.isInteger(oopCtx) || oopCtx <= 0) { totalRem++; return; }
          const oopRes = await evalInWorld(oopSend, oopCtx, subExpr);
          if (validWipeRes(oopRes)) {
            totalWiped += Number(oopRes.wiped) || 0;
            totalRem += Number(oopRes.remaining);
            if (oopRes.tooMuchText) anyTooMuch = true;
          } else {
            totalRem++;
          }
        });
      }
    }
  }
  const verifiedEmpty = totalRem === 0 && !anyTooMuch;
  if (verifiedEmpty && targets.length > 0 && !hasPrebuilt) {
    clearFilledSecretsForTarget(ctxKey, savedCtx);
  }
  return {
    ok: true,
    wiped: totalWiped,
    verifiedEmpty,
    ...(anyTooMuch ? { tooMuchText: true, reason: TOO_MUCH_TEXT_REASON } : {}),
  };
}

module.exports = {
  openIsolatedOrigin,
  resolveSnapshotRef,
  ownFrameTargetInfos, // B-5f2e (line 2)
  fillVaultElement,
  wipeTabTypedInputs,
  filledBoxHolds,
  buildFilledTargets,
  filledTargetSrc,
  targetsForTab,
  rememberFilledSecrets,
  valuesForTarget,
  clearFilledSecretsForTarget,
  clearFilledSecretsForProfileExcept,
  registerFenceRefSource,
  clearUnfencedFilledSecrets,
  clearFilledSecretsForProfile,
  clearAllFilledSecrets,
  DEFAULT_MAX_SCAN_POSITIONS,
  DEFAULT_AX_MAX_PAYLOAD_BYTES,
  DEFAULT_AX_QUERY_TIMEOUT_MS,
  DEFAULT_AX_MAX_NODES,
};
