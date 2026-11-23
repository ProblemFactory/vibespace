'use strict';
// THE CDP FRAME SCRUB (lane lg-vault-file, 主开发 r1915 + r2445: the browser frames' text scrub through a worker) — PURE. ONE
// implementation of what a CDP frame an agent is sent goes through: the credential scan (a request's url / headers / body against
// the profile's credential signatures) and the value walk (every string through the profile's text scrubber — src/vault-scrubber.js
// compileTextScrubber — under the walk's budget). The hub's loop runs it for a small frame (src/server/browser-dialogs.js
// scrubCdpFrame); the frame scrub's worker (src/server/browser-scrub-worker.js) loads THIS module for a large one — never a copy of
// its rules. Moved here byte for byte from src/server/browser-dialogs.js (its module-level scan block, and from its closure the
// request frame's sanitize, its four helpers and the walk); the one change: the sanitize RETURNS the request ids it found carrying a
// credential (`noted`) — the loop notes them (browser-dialogs noteCredRequestId), the module keeps no state.
const crypto = require('crypto');

const CRED_ROLL_BASE = 131;
const SCAN_LIMITS = Object.freeze({
  maxBodyBytes: 1048576,
  maxStringChars: 262144,
  maxJsonNodes: 4096,
  maxNestedJsonNodes: 2048,
  maxNestedDepth: 3,
  maxTextLines: 4096,
  maxMultipartParts: 256,
  maxB64Tokens: 64,
});

function noteScanCap(scanCtx, reason) {
  if (scanCtx && typeof scanCtx === 'object' && !scanCtx.capHit) {
    scanCtx.capHit = reason;
  }
}

function credSigOf(sv) {
  if (typeof sv !== 'string' || !sv) return null;
  const sha256 = crypto.createHash('sha256').update(sv, 'utf8').digest('hex');
  const w = sv.length;
  let rHash = 0 | 0;
  let rPow = 1 | 0;
  for (let i = 0; i < w; i++) {
    rHash = (Math.imul(rHash, CRED_ROLL_BASE) + sv.charCodeAt(i)) | 0;
    if (i > 0) rPow = Math.imul(rPow, CRED_ROLL_BASE);
  }
  return { len: w, sha256, rHash, rPow };
}

function stringCarriesSig(s, sigs, scanCtx = null) {
  if (typeof s !== 'string' || !s || !Array.isArray(sigs) || !sigs.length) return false;
  const n = s.length;
  if (n > SCAN_LIMITS.maxStringChars) {
    noteScanCap(scanCtx, 'string_too_long');
    return false;
  }
  for (const sg of sigs) {
    if (!sg || !sg.len || !sg.sha256 || n < sg.len) continue;
    const w = sg.len;
    if (n === w) {
      if (crypto.createHash('sha256').update(s, 'utf8').digest('hex') === sg.sha256) return true;
      continue;
    }
    if (w < 4) continue;
    if (typeof sg.rHash === 'number' && typeof sg.rPow === 'number') {
      let h = 0 | 0;
      for (let i = 0; i < w; i++) h = (Math.imul(h, CRED_ROLL_BASE) + s.charCodeAt(i)) | 0;
      if (h === sg.rHash && crypto.createHash('sha256').update(s.slice(0, w), 'utf8').digest('hex') === sg.sha256) return true;
      const pow = sg.rPow | 0;
      for (let i = 1, max = n - w; i <= max; i++) {
        h = (Math.imul((h - Math.imul(s.charCodeAt(i - 1), pow)) | 0, CRED_ROLL_BASE) + s.charCodeAt(i + w - 1)) | 0;
        if (h === sg.rHash && crypto.createHash('sha256').update(s.slice(i, i + w), 'utf8').digest('hex') === sg.sha256) return true;
      }
    } else if (n - w <= 8192) {
      for (let i = 0, max = n - w; i <= max; i++) {
        if (crypto.createHash('sha256').update(s.slice(i, i + w), 'utf8').digest('hex') === sg.sha256) return true;
      }
    } else {
      noteScanCap(scanCtx, 'string_too_long');
    }
  }
  return false;
}

function decodeBase64Token(tok, scanCtx = null) {
  if (typeof tok !== 'string' || tok.length < 6) return '';
  if (tok.length > SCAN_LIMITS.maxStringChars) {
    noteScanCap(scanCtx, 'string_too_long');
    return '';
  }
  let norm = tok.replace(/-/g, '+').replace(/_/g, '/');
  const rem = norm.length % 4;
  if (rem === 1) return '';
  if (rem === 2) norm += '==';
  else if (rem === 3) norm += '=';
  try {
    const buf = Buffer.from(norm, 'base64');
    if (!buf.length || buf.includes(0)) return '';
    const str = buf.toString('utf8');
    if (!str || str.includes('\ufffd')) return '';
    return str;
  } catch { return ''; }
}

function decodeQuotedPrintable(s) {
  if (typeof s !== 'string' || !s) return '';
  const soft = s.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === '=' && i + 2 < soft.length && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const chunk = Buffer.from(soft[i], 'utf8');
      for (let j = 0; j < chunk.length; j++) bytes.push(chunk[j]);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function valueCarriesCredential(val, sigs, depth = 0, scanCtx = null) {
  if (typeof val !== 'string' || !val || !Array.isArray(sigs) || !sigs.length) return false;
  if (val.length > SCAN_LIMITS.maxStringChars) {
    noteScanCap(scanCtx, 'string_too_long');
    return false;
  }
  if (stringCarriesSig(val, sigs, scanCtx)) return true;

  const candidates = [val];
  if (val.includes('%') || val.includes('+')) {
    try {
      const u1 = decodeURIComponent(val.replace(/\+/g, ' '));
      if (u1 && u1 !== val) {
        if (stringCarriesSig(u1, sigs, scanCtx)) return true;
        candidates.push(u1);
      }
    } catch { /* */ }
    if (val.includes('%')) {
      try {
        const u2 = decodeURIComponent(val);
        if (u2 && !candidates.includes(u2)) {
          if (stringCarriesSig(u2, sigs, scanCtx)) return true;
          candidates.push(u2);
        }
      } catch { /* */ }
    }
  }

  for (const cand of candidates) {
    if (/^basic\s+/i.test(cand)) {
      const decBasic = decodeBase64Token(cand.replace(/^basic\s+/i, '').trim(), scanCtx);
      if (decBasic && stringCarriesSig(decBasic, sigs, scanCtx)) return true;
    }
    const b64Re = /[A-Za-z0-9+/=_-]{6,}/g;
    let m, seenB64 = 0;
    while ((m = b64Re.exec(cand)) !== null) {
      if (seenB64 >= SCAN_LIMITS.maxB64Tokens) {
        noteScanCap(scanCtx, 'too_many_base64_tokens');
        break;
      }
      seenB64++;
      const dec = decodeBase64Token(m[0], scanCtx);
      if (!dec) continue;
      if (stringCarriesSig(dec, sigs, scanCtx)) return true;
      const dt = dec.trimStart();
      if (dt[0] === '{' || dt[0] === '[' || dt[0] === '"') {
        if (depth < 2) {
          if (valueCarriesCredential(dec, sigs, depth + 1, scanCtx)) return true;
        } else {
          try { JSON.parse(dt); noteScanCap(scanCtx, 'nested_json_too_deep'); } catch { /* not JSON */ }
        }
      }
    }
    const trimmed = cand.trimStart();
    if (trimmed[0] === '{' || trimmed[0] === '[' || trimmed[0] === '"') {
      try {
        const parsed = JSON.parse(trimmed);
        if (depth >= SCAN_LIMITS.maxNestedDepth) {
          if (typeof parsed === 'object' && parsed !== null) noteScanCap(scanCtx, 'nested_json_too_deep');
          else if (typeof parsed === 'string' && parsed !== cand) {
            if (stringCarriesSig(parsed, sigs, scanCtx)) return true;
            noteScanCap(scanCtx, 'nested_json_too_deep');
          }
        } else {
          const stack = [parsed];
          let seen = 0;
          while (stack.length) {
            if (seen >= SCAN_LIMITS.maxNestedJsonNodes) {
              noteScanCap(scanCtx, 'nested_json_too_many_nodes');
              break;
            }
            seen++;
            const cur = stack.pop();
            if (typeof cur === 'string') {
              if (cur !== cand && valueCarriesCredential(cur, sigs, depth + 1, scanCtx)) return true;
            } else if (Array.isArray(cur)) {
              for (let i = 0; i < cur.length; i++) stack.push(cur[i]);
            } else if (cur && typeof cur === 'object') {
              for (const k of Object.keys(cur)) {
                if (valueCarriesCredential(k, sigs, depth + 1, scanCtx)) return true;
                stack.push(cur[k]);
              }
            }
          }
        }
      } catch { /* not JSON */ }
    }
  }
  return false;
}

function parseMultipartParts(bodyText, contentType = '') {
  let boundary = '';
  const bm = /boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(String(contentType || ''));
  if (bm) boundary = String(bm[1] || bm[2] || '').trim();
  if (!boundary) {
    const first = /^--([^\r\n]{1,128})\r?\n/.exec(bodyText);
    if (first) boundary = first[1];
  }
  if (!boundary) return { ok: false, parts: [] };
  const delim = '--' + boundary;
  const chunks = bodyText.split(delim);
  if (chunks.length < 2) return { ok: false, parts: [] };
  const parts = [];
  for (let i = 1; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (chunk.startsWith('--')) break;
    if (parts.length >= SCAN_LIMITS.maxMultipartParts) {
      return { ok: false, parts, capHit: 'multipart_too_many_parts' };
    }
    if (chunk.startsWith('\r\n')) chunk = chunk.slice(2);
    else if (chunk.startsWith('\n')) chunk = chunk.slice(1);
    else continue;
    let sepIdx = chunk.indexOf('\r\n\r\n');
    let sepLen = 4;
    if (sepIdx < 0) {
      sepIdx = chunk.indexOf('\n\n');
      sepLen = 2;
    }
    if (sepIdx < 0) continue;
    const headers = chunk.slice(0, sepIdx);
    let rawBody = chunk.slice(sepIdx + sepLen);
    if (rawBody.endsWith('\r\n')) rawBody = rawBody.slice(0, -2);
    else if (rawBody.endsWith('\n')) rawBody = rawBody.slice(0, -1);
    let body = rawBody;
    const cte = /content-transfer-encoding\s*:\s*([^\r\n;]+)/i.exec(headers);
    const enc = cte ? cte[1].trim().toLowerCase() : '';
    if (enc === 'base64') {
      const dec = decodeBase64Token(rawBody.replace(/\s+/g, ''));
      if (dec) body = dec;
    } else if (enc === 'quoted-printable') {
      body = decodeQuotedPrintable(rawBody);
    }
    parts.push({ headers, rawBody, body });
  }
  return { ok: parts.length > 0, parts };
}

function inspectRequestBody(bodyText, sigs, contentType = '', { hasPostData = false, contentEncoding = '', scanCtx: outerCtx = null } = {}) {
  if (!Array.isArray(sigs) || !sigs.length) return { carries: false, undecodable: false, format: 'none' };
  if (typeof bodyText !== 'string' || !bodyText) {
    return hasPostData
      ? { carries: false, undecodable: true, reason: 'missing_post_data' }
      : { carries: false, undecodable: false, format: 'empty' };
  }
  if (Buffer.byteLength(bodyText, 'utf8') > SCAN_LIMITS.maxBodyBytes) {
    return { carries: false, undecodable: true, reason: 'body_too_large' };
  }
  if (contentEncoding && !/^identity$/i.test(String(contentEncoding).trim())) {
    return { carries: false, undecodable: true, reason: 'compressed_body' };
  }
  if (bodyText.includes('\u0000') || bodyText.includes('\ufffd')) {
    return { carries: false, undecodable: true, reason: 'binary_body' };
  }

  const scanCtx = outerCtx && typeof outerCtx === 'object' ? outerCtx : { capHit: null };
  const finishClean = (format) => (scanCtx.capHit
    ? { carries: false, undecodable: true, reason: scanCtx.capHit }
    : { carries: false, undecodable: false, format });

  const ctRaw = String(contentType || '').trim();
  const media = ctRaw.split(';')[0].trim().toLowerCase();
  const trimmed = bodyText.trimStart();

  // 1. Multipart form-data (`multipart/*` or `--boundary\r\nContent-Disposition:`)
  if (media.startsWith('multipart/') || (!media && /^--[^\r\n]{1,128}\r?\ncontent-disposition:/i.test(bodyText))) {
    const mp = parseMultipartParts(bodyText, ctRaw);
    if (mp.capHit) return { carries: false, undecodable: true, reason: mp.capHit };
    if (!mp.ok) return { carries: false, undecodable: true, reason: 'malformed_multipart' };
    for (const part of mp.parts) {
      if (valueCarriesCredential(part.body, sigs, 0, scanCtx) || (part.rawBody !== part.body && valueCarriesCredential(part.rawBody, sigs, 0, scanCtx)) || valueCarriesCredential(part.headers, sigs, 0, scanCtx)) {
        return { carries: true, undecodable: false, format: 'multipart' };
      }
    }
    return finishClean('multipart');
  }

  // 2. JSON (`application/json`, `*+json`, `text/json`, or JSON literal when Content-Type is omitted)
  const declaredJson = media === 'application/json' || media.endsWith('+json') || media === 'text/json';
  if (declaredJson || (!media && (trimmed[0] === '{' || trimmed[0] === '[' || trimmed[0] === '"'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const stack = [parsed];
      let seen = 0;
      while (stack.length) {
        if (seen >= SCAN_LIMITS.maxJsonNodes) {
          return { carries: false, undecodable: true, reason: 'json_too_many_nodes' };
        }
        seen++;
        const cur = stack.pop();
        if (typeof cur === 'string') {
          if (valueCarriesCredential(cur, sigs, 1, scanCtx)) return { carries: true, undecodable: false, format: 'json' };
        } else if (Array.isArray(cur)) {
          for (let i = 0; i < cur.length; i++) stack.push(cur[i]);
        } else if (cur && typeof cur === 'object') {
          for (const k of Object.keys(cur)) {
            if (valueCarriesCredential(k, sigs, 1, scanCtx)) return { carries: true, undecodable: false, format: 'json' };
            stack.push(cur[k]);
          }
        }
      }
      return finishClean('json');
    } catch {
      if (declaredJson) return { carries: false, undecodable: true, reason: 'malformed_json' };
    }
  }

  // 3. URL-encoded form (`application/x-www-form-urlencoded` or single-line `k=v` when Content-Type is omitted)
  if (media === 'application/x-www-form-urlencoded' || (!media && !bodyText.includes('\n') && bodyText.includes('='))) {
    try {
      for (const [k, v] of new URLSearchParams(bodyText)) {
        if (valueCarriesCredential(k, sigs, 0, scanCtx) || valueCarriesCredential(v, sigs, 0, scanCtx)) {
          return { carries: true, undecodable: false, format: 'urlencoded' };
        }
      }
      if (!bodyText.includes('=') && valueCarriesCredential(bodyText, sigs, 0, scanCtx)) {
        return { carries: true, undecodable: false, format: 'urlencoded' };
      }
      if (media === 'application/x-www-form-urlencoded') {
        return finishClean('urlencoded');
      }
    } catch {
      if (media === 'application/x-www-form-urlencoded') return { carries: false, undecodable: true, reason: 'malformed_urlencoded' };
    }
  }

  // 4. Plain text (`text/plain` or omitted Content-Type: `<form enctype="text/plain">` `k=v` lines, raw text, base64, Basic/Bearer)
  if (media === 'text/plain' || !media) {
    const lines = bodyText.split(/\r?\n/);
    const maxLines = Math.min(lines.length, SCAN_LIMITS.maxTextLines);
    for (let i = 0; i < maxLines; i++) {
      const line = lines[i];
      if (!line) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx >= 0) {
        if (valueCarriesCredential(line.slice(eqIdx + 1), sigs, 0, scanCtx) || valueCarriesCredential(line.slice(0, eqIdx), sigs, 0, scanCtx)) {
          return { carries: true, undecodable: false, format: 'text/plain' };
        }
      }
      if (valueCarriesCredential(line, sigs, 0, scanCtx)) {
        return { carries: true, undecodable: false, format: 'text/plain' };
      }
    }
    if (lines.length > SCAN_LIMITS.maxTextLines) {
      return { carries: false, undecodable: true, reason: 'text_too_many_lines' };
    }
    return finishClean('text/plain');
  }

  // 5. Unrecognized / binary Content-Type -> fail closed on cross-origin (`undecodable: true`).
  return { carries: false, undecodable: true, reason: `unsupported_content_type:${media || 'unknown'}` };
}

function bodyCarriesCredential(bodyText, sigs, contentType = '', opts = {}) {
  return Boolean(inspectRequestBody(bodyText, sigs, contentType, opts).carries);
}

function urlCarriesCredential(reqUrl, sigs, scanCtx = null) {
  if (typeof reqUrl !== 'string' || !reqUrl || !Array.isArray(sigs) || !sigs.length) return false;
  if (reqUrl.length > SCAN_LIMITS.maxStringChars) {
    noteScanCap(scanCtx, 'string_too_long');
    return false;
  }
  try {
    const uo = new URL(reqUrl);
    if (uo.username && valueCarriesCredential(uo.username, sigs, 0, scanCtx)) return true;
    if (uo.password && valueCarriesCredential(uo.password, sigs, 0, scanCtx)) return true;
    if (uo.search) {
      for (const [k, v] of uo.searchParams) {
        if (valueCarriesCredential(k, sigs, 0, scanCtx) || valueCarriesCredential(v, sigs, 0, scanCtx)) return true;
      }
      if (valueCarriesCredential(uo.search.slice(1), sigs, 0, scanCtx)) return true;
    }
    if (uo.hash && valueCarriesCredential(uo.hash.slice(1), sigs, 0, scanCtx)) return true;
    for (const seg of uo.pathname.split('/')) {
      if (seg.length >= 4 && valueCarriesCredential(seg, sigs, 0, scanCtx)) return true;
    }
  } catch {
    const qIdx = reqUrl.indexOf('?');
    const hIdx = reqUrl.indexOf('#');
    const cut = qIdx >= 0 ? qIdx : hIdx;
    if (cut >= 0 && valueCarriesCredential(reqUrl.slice(cut + 1), sigs, 0, scanCtx)) return true;
  }
  return false;
}

function headersCarryCredential(headers, sigs, scanCtx = null) {
  if (!headers || typeof headers !== 'object' || !Array.isArray(sigs) || !sigs.length) return false;
  for (const k of Object.keys(headers)) {
    const lower = String(k).toLowerCase();
    const v = headers[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (lower === 'referer' || lower === 'referrer') {
      if (urlCarriesCredential(v, sigs, scanCtx)) return true;
      continue;
    }
    if (valueCarriesCredential(v.trim(), sigs, 0, scanCtx)) return true;
  }
  return false;
}

// ── the request frame's sanitize (moved from browser-dialogs.js create()) ──
const CDP_ENVELOPE_KEYS = new Set(['id', 'method', 'params', 'sessionId', 'result', 'error']);
const CDP_ENVELOPE_SCALARS = new Set(['id', 'method', 'sessionId']);
function extractInlinePostData(req) {
  if (!req || typeof req !== 'object') return { text: '', hasData: false, binary: false };
  if (Array.isArray(req.postDataEntries) && req.postDataEntries.length) {
    try {
      const bufs = [];
      for (const x of req.postDataEntries) {
        if (x && typeof x.bytes === 'string') bufs.push(Buffer.from(x.bytes, 'base64'));
      }
      const joined = Buffer.concat(bufs);
      if (joined.includes(0)) return { text: '', hasData: true, binary: true };
      const str = joined.toString('utf8');
      if (str.includes('\ufffd') || !Buffer.from(str, 'utf8').equals(joined)) return { text: '', hasData: true, binary: true };
      return { text: str, hasData: str.length > 0, binary: false };
    } catch { return { text: '', hasData: false, binary: true }; }
  }
  if (typeof req.postData === 'string' && req.postData.length > 0) {
    if (req.postData.includes('\u0000') || req.postData.includes('\ufffd')) return { text: '', hasData: true, binary: true };
    return { text: req.postData, hasData: true, binary: false };
  }
  return { text: '', hasData: false, binary: false };
}
function headerValueOf(headers, wantLower) {
  if (!headers || typeof headers !== 'object') return '';
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && String(h.name || '').toLowerCase() === wantLower && typeof h.value === 'string' && h.value.trim()) return h.value.trim();
    }
    return '';
  }
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === wantLower && typeof headers[k] === 'string' && headers[k].trim()) return headers[k].trim();
  }
  return '';
}
function sanitizeRequestHeadersInPlace(headers, sigs) {
  if (!headers || typeof headers !== 'object' || !Array.isArray(sigs) || !sigs.length) return false;
  let did = false;
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (!h || typeof h.value !== 'string' || !h.value.trim()) continue;
      const lower = String(h.name || '').toLowerCase();
      const hit = (lower === 'referer' || lower === 'referrer')
        ? urlCarriesCredential(h.value, sigs)
        : valueCarriesCredential(h.value.trim(), sigs);
      if (hit) { h.value = '[vault:redacted]'; did = true; }
    }
    return did;
  }
  for (const k of Object.keys(headers)) {
    const v = headers[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    const lower = String(k).toLowerCase();
    const hit = (lower === 'referer' || lower === 'referrer')
      ? urlCarriesCredential(v, sigs)
      : valueCarriesCredential(v.trim(), sigs);
    if (hit) { headers[k] = '[vault:redacted]'; did = true; }
  }
  return did;
}
function redactCredentialUrl(rawUrl) {
  try {
    const uo = new URL(rawUrl);
    uo.username = '';
    uo.password = '';
    if (uo.search) uo.search = '?[vault:redacted]';
    if (uo.hash) uo.hash = '#[vault:redacted]';
    return uo.href;
  } catch {
    return '[vault:redacted]';
  }
}
const noteId = (noted, id) => { if (Array.isArray(noted)) noted.push(id); };   // the loop notes them (noteCredRequestId)
function sanitizeFrame(noted, parsed, sigs) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(sigs) || !sigs.length) return false;
  let sanitized = false;
  if (typeof parsed.method === 'string' && parsed.params && typeof parsed.params === 'object') {
    const p = parsed.params;
    if (parsed.method === 'Network.requestWillBeSent' || parsed.method === 'Fetch.requestPaused') {
      const req = p.request;
      if (req && typeof req === 'object') {
        const reqUrl = String(req.url || '');
        const urlCarries = reqUrl ? urlCarriesCredential(reqUrl, sigs) : false;
        const hdrCarries = headersCarryCredential(req.headers, sigs);
        const contentType = headerValueOf(req.headers, 'content-type');
        const contentEncoding = headerValueOf(req.headers, 'content-encoding');
        const inline = extractInlinePostData(req);
        const bodyRes = (inline.hasData && !inline.binary)
          ? inspectRequestBody(inline.text, sigs, contentType, { hasPostData: true, contentEncoding })
          : { carries: false, undecodable: inline.binary };
        const rawPostCarries = !bodyRes.carries && typeof req.postData === 'string' && req.postData
          ? valueCarriesCredential(req.postData, sigs)
          : false;
        const carries = urlCarries || hdrCarries || Boolean(bodyRes.carries) || rawPostCarries;
        if (carries) {
          if (p.requestId) noteId(noted, p.requestId);
          if (p.networkId) noteId(noted, p.networkId);
          if (bodyRes.carries || rawPostCarries) {
            if (typeof req.postData === 'string') { req.postData = '[vault:redacted]'; sanitized = true; }
            if (Array.isArray(req.postDataEntries) && req.postDataEntries.length) {
              req.postDataEntries = [];
              if (typeof req.postData !== 'string') req.postData = '[vault:redacted]';
              sanitized = true;
            }
          }
          if (urlCarries) {
            req.url = redactCredentialUrl(reqUrl);
            sanitized = true;
            if (typeof p.documentURL === 'string' && urlCarriesCredential(p.documentURL, sigs)) {
              p.documentURL = redactCredentialUrl(p.documentURL);
            }
          }
          if (hdrCarries && sanitizeRequestHeadersInPlace(req.headers, sigs)) sanitized = true;
        }
      }
    } else if (parsed.method === 'Network.requestWillBeSentExtraInfo') {
      if (p.headers && sanitizeRequestHeadersInPlace(p.headers, sigs)) {
        if (p.requestId) noteId(noted, p.requestId);
        sanitized = true;
      }
    }
  }
  if (parsed.result && typeof parsed.result === 'object' && typeof parsed.result.postData === 'string' && parsed.result.postData) {
    if (valueCarriesCredential(parsed.result.postData, sigs) || Boolean(inspectRequestBody(parsed.result.postData, sigs, '', { hasPostData: true }).carries)) {
      parsed.result.postData = '[vault:redacted]';
      sanitized = true;
    }
  }
  return sanitized;
}

/** ONE frame → { out, changed, cut, unparseable, noted, withheld }: `fn` = the profile's text scrubber (null: none), `sigs` = its
 *  credential signatures (none: null / []), `budgetMs` = the walk's bound, `minB` = the mask floor (a string the cut reaches, at or
 *  past it, is withheld whole as [vault:scrub-cut]), `clock` = ms (performance.now). `noted` = the request ids found carrying a
 *  credential. `withheld` (主开发 r1915 (c), r2445 law 3): a frame whose scrub ran ONE call of the text scrubber past its figure (the
 *  text budget, src/vault-scrubber.js — the scrubber's `overs`) is withheld WHOLE: `out` null, the why said — nothing of it leaves. */
function scrubFrame(frameStr, opts = {}) {
  const fn = opts.fn || null;
  const o0 = fn && typeof fn.overs === 'number' ? fn.overs : 0;
  const r = scrubFrameOnce(frameStr, opts);
  if (fn && typeof fn.overs === 'number' && fn.overs > o0) return { ...r, out: null, changed: true, withheld: 'a text of it ran past the scrub\'s figure' };
  return r;
}
function scrubFrameOnce(frameStr, { fn = null, sigs = null, budgetMs = 250, minB = 8, clock = () => performance.now() } = {}) {
  const noted = [];
  const res = (out, more = {}) => ({ out, changed: out !== frameStr, cut: false, unparseable: false, noted, withheld: null, ...more });
  if (typeof frameStr !== 'string' || !frameStr) return res(frameStr);
  const hasSigs = Boolean(sigs && sigs.length > 0);
  if (!fn && !hasSigs) return res(frameStr);
  if (!fn) {
    if (!frameStr.includes('requestWillBeSent') && !frameStr.includes('requestPaused') && !frameStr.includes('"postData"')) {
      return res(frameStr);
    }
    let parsedOnly;
    try { parsedOnly = JSON.parse(frameStr); } catch { return res(frameStr); }
    return res(sanitizeFrame(noted, parsedOnly, sigs) ? JSON.stringify(parsedOnly) : frameStr);
  }
  let parsed;
  try { parsed = JSON.parse(frameStr); } catch { return res(fn.spelled(frameStr), { unparseable: true }); }
  let changed = hasSigs ? sanitizeFrame(noted, parsed, sigs) : false;
  const deadline = clock() + budgetMs;
  let visited = 0, cut = false;
    const walk = (node, isTop = false) => {
      if (!cut && (++visited & 511) === 0 && clock() > deadline) cut = true;
      if (typeof node === 'string') {
        if (cut) {
          if (node.length >= minB || (node.length >= 3 && Buffer.byteLength(node, 'utf8') >= minB)) { changed = true; return '[vault:scrub-cut]'; }
          return node;
        }
        const s = fn(node);
        if (s !== node) changed = true;
        return s;
      }
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          const v = node[i];
          const next = walk(v, false);
          if (next !== v) node[i] = next;
        }
        return node;
      }
      if (node && typeof node === 'object') {
        const keys = Object.keys(node);
        let keyChanged = false;
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const nk = (isTop && CDP_ENVELOPE_KEYS.has(k)) ? k : fn(k);
          if (nk !== k) { keyChanged = true; changed = true; }
          const v = node[k];
          if (isTop && CDP_ENVELOPE_SCALARS.has(k)) {
            if (typeof v === 'string') {
              const sv = fn(v);
              if (sv !== v) { changed = true; node[k] = sv; }
            }
            continue;
          }
          const next = walk(v, false);
          if (next !== v) node[k] = next;
        }
        if (keyChanged) {
          const rebuilt = {};
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const nk = (isTop && CDP_ENVELOPE_KEYS.has(k)) ? k : fn(k);
            rebuilt[nk] = node[k];
          }
          return rebuilt;
        }
        return node;
      }
      return node;
    };
  const next = walk(parsed, true);
  return res(changed ? JSON.stringify(next) : frameStr, { cut });
}

module.exports = {
  SCAN_LIMITS, credSigOf, valueCarriesCredential, inspectRequestBody, bodyCarriesCredential, urlCarriesCredential, headersCarryCredential,
  extractInlinePostData, headerValueOf, sanitizeRequestHeadersInPlace, redactCredentialUrl, sanitizeFrame, scrubFrame,
  CDP_ENVELOPE_KEYS, CDP_ENVELOPE_SCALARS,
};
