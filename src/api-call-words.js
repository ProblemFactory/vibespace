'use strict';
/**
 * API-CALL WORDS — a raw-API proposal's title in the person's words (lanes api-call-card-words, api-call-words-from-spec;
 * docs/kb-patterns.md «Card grammar» ① ②): WHAT the agent does to WHICH named thing, never the raw path.
 *
 * PURE (no DOM, no I/O). Three layers, first hit wins: (1) ROWS — the HAND rows, only for calls whose BODY carries what
 * the words need (a count, a title, a name); a row returns null when its body lacks it. (2) The GENERATED long tail —
 * src/api-call-words.generated.js, made at build time from the vendors' own catalogues (scripts/gen-api-call-words.mjs:
 * Slack OpenAPI, Gmail discovery, the Lark Go SDK); its phrase carries zh/en/ja itself (`text`) and names the object
 * from the call's path / `channel` param. (3) An UNKNOWN call says "call the <vendor> API (<METHOD> <last segment>)".
 * The agent's own note (`--why`) is a quote on the card, never the title nor the object's name. `{object}` is drawn as
 * a link or an 8-char id chip. Census: scripts/test-api-call-words.mjs (a fixture + RED control per hand row; the
 * generated table's coverage, sample titles, missing words).
 */
const GENERATED = require('./api-call-words.generated.js');

const VENDORS = Object.freeze([
  Object.freeze({ id: 'lark', name: 'Lark', hosts: Object.freeze(['open.feishu.cn', 'open.larksuite.com']) }),
  Object.freeze({ id: 'slack', name: 'Slack', hosts: Object.freeze(['slack.com']), rpc: true }),   // RPC: GET and POST reach the same method
  Object.freeze({ id: 'google', name: 'Google', hosts: Object.freeze([]) }),   // any *.googleapis.com
]);
const OBJECT_NAME_MAX = 40;
const SHORT_ID = 8;

function vendorOf(host) {
  const h = String(host || '').toLowerCase();
  return VENDORS.find((v) => v.hosts.includes(h)) || (/\.googleapis\.com$/.test(h) ? VENDORS[2] : null);
}
/** The body as fields: JSON, else a form body (Slack takes both); multipart → its named text parts. */
function fieldsOf(body) {
  const s = body == null ? '' : String(body);
  if (!s) return {};
  try { const j = JSON.parse(s); if (j && typeof j === 'object') return j; } catch {}
  const parts = {};
  for (const m of s.matchAll(/name="([^"]+)"\r?\n(?:[^\r\n]+\r?\n)*\r?\n([^\r\n]*)/g)) parts[m[1]] = m[2];
  if (Object.keys(parts).length) return parts;
  if (/^[\w.%+-]+=[^\s]*(&[\w.%+-]+=[^\s]*)*$/.test(s)) { try { return Object.fromEntries(new URLSearchParams(s)); } catch {} }
  return {};
}
const queryOf = (p, k) => { const hit = (p.query || []).find((x) => Array.isArray(x) && x[0] === k); return hit ? String(hit[1]) : null; };
const count = (...xs) => { for (const x of xs) { if (Array.isArray(x) && x.length) return x.length; if (typeof x === 'string' && x) return x.split(',').filter(Boolean).length; } return null; };
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);

/** THE HAND TABLE — calls whose words read the BODY; `words(match, fields, p)` → {key, params, object}, or null when the
 *  body lacks it (the generated row speaks then). Order matters (first hit). */
const ROWS = Object.freeze([
  { id: 'lark-docx-blocks-delete', vendor: 'lark', methods: ['DELETE'], re: /^\/open-apis\/docx\/v1\/documents\/([^/]+)\/blocks\/[^/]+\/children\/batch_delete$/,
    words: (m, b) => {
      const s = Number(b.start_index), e = Number(b.end_index);
      return Number.isInteger(s) && Number.isInteger(e) && e > s
        ? { key: 'delete {n} blocks ({start}–{end}) from the document “{object}”', params: { n: e - s, start: s + 1, end: e }, object: { kind: 'doc', id: m[1] } }
        : null;
    } },
  { id: 'lark-docx-blocks-create', vendor: 'lark', methods: ['POST'], re: /^\/open-apis\/docx\/v1\/documents\/([^/]+)\/blocks\/[^/]+\/(?:children|descendant)$/,
    words: (m, b, p, n = count(b.children, b.children_id)) => (n ? { key: 'insert {n} blocks into the document “{object}”', params: { n }, object: { kind: 'doc', id: m[1] } } : null) },
  { id: 'lark-docx-blocks-update', vendor: 'lark', methods: ['PATCH'], re: /^\/open-apis\/docx\/v1\/documents\/([^/]+)\/blocks\/[^/]+$/,
    words: (m, b, p, n = count(b.requests)) => (n ? { key: 'change {n} blocks in the document “{object}”', params: { n }, object: { kind: 'doc', id: m[1] } } : null) },
  { id: 'lark-docx-create', vendor: 'lark', methods: ['POST'], re: /^\/open-apis\/docx\/v1\/documents$/,
    words: (m, b) => (str(b.title) ? { key: 'create the document “{object}”', params: {}, object: { kind: 'doc', name: str(b.title) } } : null) },
  { id: 'lark-im-send', vendor: 'lark', methods: ['POST'], re: /^\/open-apis\/im\/v1\/messages$/,
    words: (m, b, p) => {
      const type = queryOf(p, 'receive_id_type') || 'chat_id';
      if (!str(b.receive_id)) return null;
      return type === 'chat_id'
        ? { key: 'send a message in {object}', params: {}, object: { kind: 'chat', id: str(b.receive_id) } }
        : { key: 'send a message to {object}', params: {}, object: { kind: 'person', id: str(b.receive_id) } };
    } },
  { id: 'lark-drive-upload', vendor: 'lark', methods: ['POST'], re: /^\/open-apis\/drive\/v1\/(?:files|medias)\/upload_all$/,
    words: (m, b) => (str(b.parent_node) ? { key: 'upload a file to the folder “{object}”', params: {}, object: { kind: 'folder', id: str(b.parent_node) } } : null) },
  { id: 'lark-bitable-records', vendor: 'lark', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], re: /^\/open-apis\/bitable\/v1\/apps\/([^/]+)\/tables\/[^/]+\/records(?:\/[^/]+)?$/,
    words: (m, b, p, n = count(b.records, b.records_ids, b.record_ids)) => (n ? { key: 'change {n} rows in the table “{object}”', params: { n }, object: { kind: 'table', id: m[1] } } : null) },
  { id: 'slack-conversations-create', vendor: 'slack', methods: ['POST'], re: /^\/api\/conversations\.create$/,
    words: (m, b) => (str(b.name) ? { key: 'create the channel {object}', params: {}, object: { kind: 'chat', name: `#${str(b.name)}` } } : null) },
  { id: 'slack-conversations-invite', vendor: 'slack', methods: ['POST'], re: /^\/api\/conversations\.invite$/,
    words: (m, b, p, n = count(b.users)) => (n ? { key: 'invite {n} people to {object}', params: { n }, object: str(b.channel) ? { kind: 'chat', id: str(b.channel) } : null } : null) },
  { id: 'slack-conversations-rename', vendor: 'slack', methods: ['POST'], re: /^\/api\/conversations\.rename$/,
    words: (m, b) => (str(b.name) ? { key: 'rename {object} to {name}', params: { name: str(b.name) }, object: str(b.channel) ? { kind: 'chat', id: str(b.channel) } : null } : null) },
].map((r) => Object.freeze(r)));

/** THE GENERATED LONG TAIL, compiled once per table: [{row, re, names}] — `{param}` slots → groups; Gmail also takes
 *  its media-upload path (/upload/gmail/…). */
const compiled = new WeakMap();
function genIndex(gen) {
  let ix = compiled.get(gen);
  if (ix) return ix;
  ix = (gen.ROWS || []).map((row) => {
    const names = [];
    const src = row[3].split(/\{(\w+)\}/).map((s, i) => (i % 2 ? (names.push(s), '([^/]+)') : s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))).join('');
    return { row, names, re: new RegExp(`^${row[1] === 'google' ? '(?:/upload)?' : ''}${src}$`) };
  });
  compiled.set(gen, ix);
  return ix;
}
/** A generated row's words — its own zh/en/ja phrase (`text`); the object from the path slot or (Slack) the `channel`
 *  field; no object ⇒ the phrase without its 「（{object}）」 / “{object}”. An `rpc` vendor (Slack) matches by path whatever the method. */
function generatedOf(v, method, path, b, p, gen) {
  for (const g of genIndex(gen)) {
    const [id, vendor, gm, , ph, param, kind, sens] = g.row;
    if (vendor !== v.id || (gm !== method && !v.rpc)) continue;
    const m = g.re.exec(path);
    if (!m) continue;
    const at = param ? g.names.indexOf(param) : -1;
    const val = !param ? null : at >= 0 ? m[at + 1] : str(b[param]) || queryOf(p, param);
    const text = {};
    for (const [i, lang] of ['en', 'zh', 'ja'].entries()) text[lang] = val ? gen.PHRASES[ph][i] : gen.PHRASES[ph][i].replace(/\s*(?:（\{object\}）|“\{object\}”)$/, '');
    return { row: `gen:${id}`, key: text.en, text, params: {}, object: val ? { kind, id: val } : null, sensitive: !!sens };
  }
  return null;
}

/** An id-like segment (no "." and a digit or ≥ 16 chars) — channel-api.js shapeOf's test, plus length; a method name is never one. */
const idLike = (seg) => { const head = seg.split(':')[0]; return !head || (!head.includes('.') && (head.length >= 16 || /\d/.test(head))); };
/** The last MEANINGFUL path segment (ids skipped) — what an unknown call is called; never the whole path. */
function lastSegment(path) {
  const segs = String(path || '').split('?')[0].split('/').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) if (!idLike(segs[i])) return segs[i].slice(0, 40);
  return '/';
}
const shortId = (id) => { const s = String(id || ''); return s.length > SHORT_ID ? `${s.slice(0, SHORT_ID)}…` : s; };
const capName = (s) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > OBJECT_NAME_MAX ? `${x.slice(0, OBJECT_NAME_MAX - 1)}…` : x; };

/** THE WORDS of one proposal record: {row, key, params, object, text?} — a hand row, else `gen:<id>` (its `text` =
 *  {en, zh, ja}), else `row` null = unknown (the vendor + last segment). */
function wordsOf(p, { rows = ROWS, generated = GENERATED } = {}) {
  const v = vendorOf(p && p.host);
  const method = String((p && p.method) || '').toUpperCase(), path = String((p && p.path) || '');
  const b = fieldsOf(p && p.body);
  for (const r of rows) {
    if (!v || r.vendor !== v.id || !r.methods.includes(method)) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const w = r.words(m, b, p) || null;
    if (w) return { row: r.id, key: w.key, params: w.params || {}, object: w.object || null };
  }
  const g = v ? generatedOf(v, method, path, b, p, generated) : null;
  if (g) return g;
  return { row: null, key: 'call the {vendor} API ({call})', params: { vendor: v ? v.name : String((p && (p.credLabel || p.cred)) || ''), call: `${method} ${lastSegment(path)}` }, object: null };
}

/** The object as drawn: its NAME (the store's, or the request's own) or the id shortened in a chip — never a name the
 *  agent's note claims (the note is a quote). */
function objectView(obj, { name = null, conv = null } = {}) {
  if (!obj) return null;
  const known = name || obj.name || null;
  return { kind: obj.kind, id: obj.id || null, name: known ? capName(known) : null, short: known ? null : shortId(obj.id), conv: known && conv ? conv : null };
}

module.exports = { VENDORS, ROWS, GENERATED, OBJECT_NAME_MAX, SHORT_ID, vendorOf, fieldsOf, lastSegment, shortId, wordsOf, objectView };
