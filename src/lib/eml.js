/**
 * RFC-822/MIME email (.eml) parser — dependency-free and browser-safe
 * (no Node APIs, no Buffer; Uint8Array + TextDecoder only).
 *
 * The parser works on a "binary string" (one char per byte, codes 0-255) so
 * multipart boundaries and header sections can be located with plain string
 * ops while attachment bytes survive exactly. Conversion back to bytes is
 * lossless because it never goes through TextDecoder (whose 'iso-8859-1'
 * label is actually windows-1252 and would corrupt bytes 0x80-0x9F).
 */

const B64_LUT = (() => {
  const lut = new Int8Array(128).fill(-1);
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alpha.length; i++) lut[alpha.charCodeAt(i)] = i;
  return lut;
})();

function bytesToBinary(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return s;
}

function binaryToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function toBinaryString(input) {
  if (typeof input === 'string') {
    // A string containing chars > U+00FF was already text-decoded upstream —
    // re-encode as UTF-8 bytes. An 8-bit-clean string is byte-faithful as-is.
    if (/[^\u0000-\u00ff]/.test(input)) {
      return bytesToBinary(new TextEncoder().encode(input));
    }
    return input;
  }
  return bytesToBinary(input instanceof Uint8Array ? input : new Uint8Array(input));
}

function decodeCharset(bytes, charset) {
  const label = String(charset || 'utf-8').trim().toLowerCase() || 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch (e) {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function decodeBase64(str) {
  const out = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const v = c < 128 ? B64_LUT[c] : -1;
    if (v < 0) continue; // whitespace, '=' padding, stray characters
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function decodeQuotedPrintable(str) {
  const s = str.replace(/=\r?\n/g, ''); // soft line breaks
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(s.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function decodeBody(binStr, cte) {
  switch (cte) {
    case 'base64': return decodeBase64(binStr);
    case 'quoted-printable': return decodeQuotedPrintable(binStr);
    default: return binaryToBytes(binStr); // 7bit / 8bit / binary / absent
  }
}

// ---- RFC 2047 encoded-words -----------------------------------------------

function decodeWords(str) {
  if (!str || str.indexOf('=?') === -1) return str;
  // Whitespace between two adjacent encoded-words is deleted (RFC 2047 §6.2).
  const joined = str.replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)[ \t]+(?==\?)/g, '$1');
  return joined.replace(/=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g, (all, charset, enc, data) => {
    try {
      const bytes = enc.toLowerCase() === 'b'
        ? decodeBase64(data)
        : decodeQuotedPrintable(data.replace(/_/g, ' ')); // Q: '_' means space
      return decodeCharset(bytes, charset.split('*')[0]); // strip RFC 2231 language tag
    } catch (e) {
      return all;
    }
  });
}

// Raw 8-bit header text (non-standard but common): try strict UTF-8, else
// keep the byte-for-byte (latin1) view. Encoded-words are ASCII, unaffected.
function decodeHeaderText(raw) {
  if (/[\u0080-\u00ff]/.test(raw)) {
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(binaryToBytes(raw));
    } catch (e) { /* not UTF-8 */ }
  }
  return decodeWords(raw);
}

// ---- Headers ----------------------------------------------------------------

function parseHeaders(text) {
  const list = [];
  if (!text) return list;
  const unfolded = [];
  for (const line of text.split(/\r?\n/)) {
    if ((line[0] === ' ' || line[0] === '\t') && unfolded.length) {
      unfolded[unfolded.length - 1] += ' ' + line.replace(/^[ \t]+/, '');
    } else if (line) {
      unfolded.push(line);
    }
  }
  for (const line of unfolded) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    list.push({ name: line.slice(0, i).trim(), raw: line.slice(i + 1).trim() });
  }
  return list;
}

function getHeader(headers, lowerName) {
  for (const h of headers) {
    if (h.name.toLowerCase() === lowerName) return h.raw;
  }
  return '';
}

// ---- Parameterized headers (Content-Type / Content-Disposition) -------------

function splitOnSemicolons(s) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted && ch === '\\' && i + 1 < s.length) {
      cur += ch + s[++i];
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function unquote(v) {
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    return v.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return v;
}

function pctDecodeToBytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '%' && /^[0-9a-fA-F]{2}$/.test(str.slice(i + 1, i + 3))) {
      out.push(parseInt(str.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(str.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Parses 'value; attr=v; attr*=…' headers, resolving RFC 2231 extended
 * parameters — both the single-segment form (name*=charset''pct-encoded)
 * and continuations (name*0*=, name*1=, …). Plain values additionally get
 * RFC 2047 decoding (non-standard filename="=?…?=" is ubiquitous).
 */
function parseStructuredHeader(raw) {
  const parts = splitOnSemicolons(raw || '');
  const value = (parts.shift() || '').trim().toLowerCase();
  const params = {};
  const extended = {}; // base name -> [{ idx, isExt, val }]
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const rawName = part.slice(0, eq).trim().toLowerCase();
    const rawVal = part.slice(eq + 1).trim();
    const m = /^([^*]+)(?:\*(\d+))?(\*)?$/.exec(rawName);
    if (!m) continue;
    if (m[2] === undefined && !m[3]) {
      params[m[1]] = decodeWords(unquote(rawVal));
    } else {
      (extended[m[1]] = extended[m[1]] || []).push({
        idx: m[2] === undefined ? 0 : parseInt(m[2], 10),
        isExt: !!m[3],
        val: unquote(rawVal),
      });
    }
  }
  for (const base of Object.keys(extended)) {
    const segs = extended[base].sort((a, b) => a.idx - b.idx);
    let charset = '';
    const chunks = [];
    for (let i = 0; i < segs.length; i++) {
      let v = segs[i].val;
      if (segs[i].isExt) {
        if (i === 0) {
          // Only the first segment carries the charset'language' prefix.
          const q1 = v.indexOf('\'');
          const q2 = q1 >= 0 ? v.indexOf('\'', q1 + 1) : -1;
          if (q2 >= 0) {
            charset = v.slice(0, q1);
            v = v.slice(q2 + 1);
          }
        }
        chunks.push(pctDecodeToBytes(v));
      } else {
        chunks.push(binaryToBytes(v));
      }
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    params[base] = decodeCharset(bytes, charset || 'utf-8'); // extended wins over plain
  }
  return { value, params };
}

// ---- MIME entity tree --------------------------------------------------------

function parseEntity(bin) {
  let headText = '';
  let body = '';
  const lead = /^\r?\n/.exec(bin);
  if (lead) {
    body = bin.slice(lead[0].length); // part starting with a blank line = no headers
  } else {
    const sep = /\r?\n\r?\n/.exec(bin);
    if (sep) {
      headText = bin.slice(0, sep.index);
      body = bin.slice(sep.index + sep[0].length);
    } else {
      headText = bin; // headers only — message with no body
    }
  }
  const headers = parseHeaders(headText);
  const ct = parseStructuredHeader(getHeader(headers, 'content-type'));
  const cd = parseStructuredHeader(getHeader(headers, 'content-disposition'));
  const node = {
    headers,
    type: ct.value || 'text/plain',
    typeParams: ct.params,
    disposition: cd.value,
    dispParams: cd.params,
    cte: getHeader(headers, 'content-transfer-encoding').trim().toLowerCase(),
    body,
    children: null,
  };
  if (node.type.indexOf('multipart/') === 0 && ct.params.boundary) {
    node.children = splitMultipart(body, ct.params.boundary).map(parseEntity);
  }
  return node;
}

function splitMultipart(body, boundary) {
  const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The trailing newline is a lookahead (not consumed) so back-to-back
  // delimiter lines still match; the part-start skip below handles it.
  const re = new RegExp('(?:^|\\r?\\n)--' + esc + '(--)?[ \\t]*(?=\\r?\\n|$)', 'g');
  const parts = [];
  let start = -1;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (start >= 0) parts.push(body.slice(start, m.index));
    if (m[1]) {
      start = -1; // closing delimiter; epilogue ignored
      break;
    }
    start = m.index + m[0].length;
    if (body[start] === '\r') start++;
    if (body[start] === '\n') start++;
    re.lastIndex = start;
  }
  if (start >= 0) parts.push(body.slice(start)); // tolerate a missing final delimiter
  return parts.filter((p) => p.trim() !== '');
}

function textOf(node) {
  return decodeCharset(decodeBody(node.body, node.cte), node.typeParams.charset);
}

function collect(node, out) {
  if (node.children) {
    for (const child of node.children) collect(child, out);
    return;
  }
  const isAttachment = node.disposition === 'attachment';
  if (!isAttachment && node.type === 'text/plain' && out.textBody === null) {
    out.textBody = textOf(node);
    return;
  }
  if (!isAttachment && node.type === 'text/html' && out.htmlBody === null) {
    out.htmlBody = textOf(node);
    return;
  }
  const filename = node.dispParams.filename || node.typeParams.name || '';
  if (isAttachment || filename) {
    const content = decodeBody(node.body, node.cte);
    out.attachments.push({
      filename: filename || 'part-' + (out.attachments.length + 1) + '.bin',
      mime: node.type,
      size: content.length,
      content,
    });
  }
}

/**
 * Parse an RFC-822/MIME message.
 * @param {Uint8Array|ArrayBuffer|string} input
 * @returns {{
 *   headers: {from, to, cc, subject, date, messageId},
 *   allHeaders: Array<[string, string]>,
 *   textBody: string|null,
 *   htmlBody: string|null,
 *   attachments: Array<{filename, mime, size, content: Uint8Array}>,
 * }}
 */
export function parseEml(input) {
  const root = parseEntity(toBinaryString(input));
  const pick = (name) => decodeHeaderText(getHeader(root.headers, name));
  const out = {
    headers: {
      from: pick('from'),
      to: pick('to'),
      cc: pick('cc'),
      subject: pick('subject'),
      date: pick('date'),
      messageId: pick('message-id'),
    },
    allHeaders: root.headers.map((h) => [h.name, decodeHeaderText(h.raw)]),
    textBody: null,
    htmlBody: null,
    attachments: [],
  };
  collect(root, out);
  return out;
}
