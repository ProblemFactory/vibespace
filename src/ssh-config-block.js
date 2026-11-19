'use strict';
/**
 * PURE (imports nothing; CJS — the hub requires it, the page bundles it) — B-2ca0: A PASTED SSH CONFIG BLOCK, as VS Code's Remote-SSH
 * writes one into ~/.ssh/config, read into the fields of ONE ssh machine. Nothing is written to anyone's ssh config: the page fills
 * the Add machine form from it, the person reads the form, and the machine is added as the form says.
 *
 *   readSshBlock(text) → { ok: false, code: 'too-big', maxChars, maxLines }
 *                      | { ok: true, hosts: [{ name, line, fields, from, notUsed }], outside }
 *     · THE FIELD TABLE (FIELDS): Host (the machine's name — its FIRST name), HostName, User, Port, IdentityFile (one key), IdentitiesOnly,
 *       ProxyJump (ONE jump host). Keys are case-blind; `Key value`, `Key=value`, `Key = value`; a quoted word stays one word.
 *       HostName absent ⇒ the address is the Host name (ssh's own rule).
 *     · EVERY OTHER LINE IS NAMED — its number, its text, why (WHY): a setting VibeSpace does not read ('unknown'), a Match block
 *       ('match'), an Include ('include'), a Host line of patterns — * ? ! — ('pattern'), the Host line's other names ('more-names'),
 *       a key again in one block — ssh takes the first — ('repeat'), a second IdentityFile — one key is offered — ('more-keys'), a value
 *       that does not read — a port outside 1–65535, a value starting with «-», extra words — ('value'), a %-token or ${VAR} — ssh
 *       expands them, VibeSpace does not — ('token'), a ProxyJump chain ('chain'), IdentitiesOnly no ('identities-no'), a setting before
 *       any Host line — in an ssh config it applies to every host — ('before-host'), a line that is not «key value» ('syntax'). The
 *       lines of a machine's block are its `notUsed`; the rest (before any Host, a pattern or Match block) are `outside`. Comments and
 *       blank lines are skipped. Nothing is dropped silently.
 *     · THE SIZE BOUND: more than MAX_CHARS characters or MAX_LINES lines is refused whole ('too-big') — never cut.
 *   jumpVerdict(s) → { ok: true, jump } (null for none / empty) | { ok: false, code: 'chain' | 'form' } — ONE jump host,
 *     `[user@]host[:port]`, in plain host characters only: ssh's -J builds a command from it. The hub's add, its import and the page
 *     ask it.
 *   jumpParts(s) → { user, host, port } of a jump that passed jumpVerdict (the hub builds the hop's own ssh from them).
 *   formOf(host) → the Add machine form's values: { name, host, user?, port, jump, keyFile, keyChoice? } — port / jump / keyFile
 *     always (empty when the block has none); a User the block does not name is absent (the form keeps what was typed there).
 *   confirmRows(host) → the confirm step's rows, in the form's order: { field, value, from, line } — `value: null` where the block
 *     names nothing (the User: typed in the form).
 */

const MAX_CHARS = 16384;
const MAX_LINES = 400;
/** the keys read, lower-case → the field they fill */
const FIELDS = Object.freeze({ host: 'name', hostname: 'host', user: 'user', port: 'port', identityfile: 'keyFile', identitiesonly: 'identitiesOnly', proxyjump: 'jump' });
const WHY = Object.freeze(['unknown', 'match', 'include', 'pattern', 'more-names', 'repeat', 'more-keys', 'value', 'token', 'chain', 'identities-no', 'before-host', 'syntax',
  'bad-host', 'jump-none', 'identities-alone', 'jump-key', 'jump-unread']);
/** the keyword names as ssh_config(5) spells them — for the confirm step's «from» */
const SPELLED = Object.freeze({ host: 'Host', hostname: 'HostName', user: 'User', port: 'Port', identityfile: 'IdentityFile', identitiesonly: 'IdentitiesOnly', proxyjump: 'ProxyJump' });

const JUMP_RE = /^(?:([A-Za-z0-9_][A-Za-z0-9._-]*)@)?(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9_][A-Za-z0-9._-]*)(?::([0-9]{1,5}))?$/;
function jumpVerdict(s) {
  const v = String(s == null ? '' : s).trim();
  if (!v || v.toLowerCase() === 'none') return { ok: true, jump: null };
  if (v.includes(',')) return { ok: false, code: 'chain' };
  const m = JUMP_RE.exec(v);
  if (!m || (m[3] !== undefined && !(Number(m[3]) >= 1 && Number(m[3]) <= 65535))) return { ok: false, code: 'form' };
  return { ok: true, jump: v };
}
/** its reads: the address of a machine BEHIND a jump host is plain host characters (an IPv6 address may start with «:») — the hop's
 *  command carries it as ssh's %h, which an ssh before 9.6 checks no character of. The hub (add, import, every road) and the page ask it. */
const JUMP_TARGET_RE = /^[A-Za-z0-9_:][A-Za-z0-9._:-]*$/;
const jumpTargetOk = (host) => JUMP_TARGET_RE.test(String(host == null ? '' : host));
/** a jump host that passed jumpVerdict → its words { user, host (an IPv6 address without its brackets), port } — the hub builds the
 *  hop's own ssh from them (src/hosts.js jumpArgsOf) */
function jumpParts(s) {
  const m = JUMP_RE.exec(String(s == null ? '' : s).trim());
  return m ? { user: m[1] || null, host: m[2].replace(/^\[|\]$/g, ''), port: m[3] || null } : null;
}

/** ssh's word rule: white space splits, "…" or '…' keeps a word together; an unclosed quote ⇒ null */
function wordsOf(rest) {
  const out = [];
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && /\s/.test(rest[i])) i++;
    if (i >= rest.length) break;
    let w = '';
    while (i < rest.length && !/\s/.test(rest[i])) {
      const c = rest[i];
      if (c === '"' || c === "'") { const j = rest.indexOf(c, i + 1); if (j < 0) return null; w += rest.slice(i + 1, j); i = j + 1; } else { w += c; i++; }
    }
    out.push(w);
  }
  return out;
}

function readSshBlock(text) {
  const src = String(text == null ? '' : text);
  const big = { ok: false, code: 'too-big', maxChars: MAX_CHARS, maxLines: MAX_LINES };
  if (src.length > MAX_CHARS) return big;   // asked BEFORE the split: a page reads the block at every keystroke
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > MAX_LINES) return big;
  const hosts = [], outside = [];
  let cur = null;   // where a setting goes: { kind: 'host', h } | { kind: 'pattern' | 'match' | 'bad-host' } | null (before any Host)
  const note = (n, t, why, part) => { const e = { line: n, text: t, why, ...(part ? { part } : {}) }; (cur && cur.kind === 'host' ? cur.h.notUsed : outside).push(e); };
  const textAt = (n) => String(lines[n - 1] || '').trim();
  let last = 0;   // the last line read (blank and comment lines skipped) — a block ends at the line before the Host / Match that ends it
  const endBlock = (at) => { if (cur && cur.kind === 'host') cur.h.end = at; };
  lines.forEach((raw, i) => {
    const n = i + 1, t = raw.trim();
    if (!t || t.startsWith('#')) return;
    const before = last; last = n;
    const m = /^([A-Za-z][A-Za-z0-9]*)(?:\s*=\s*|\s+)(.*)$/.exec(t);
    const key = m ? m[1].toLowerCase() : '';
    const words = m ? wordsOf(m[2].trim()) : null;
    if (!m || !words || !words.length) return note(n, t, 'syntax');
    if (key === 'host') {
      endBlock(before);
      if (words.some((w) => /[*?!]/.test(w))) { cur = { kind: 'pattern' }; outside.push({ line: n, text: t, why: 'pattern' }); return; }
      if (words[0].startsWith('-')) { cur = { kind: 'bad-host' }; outside.push({ line: n, text: t, why: 'bad-host' }); return; }   // never an ssh option as a machine
      const h = { name: words[0], names: words.slice(), line: n, end: n, fields: {}, from: {}, seen: {}, notUsed: [] };
      hosts.push(h);
      cur = { kind: 'host', h };
      if (words.length > 1) h.notUsed.push({ line: n, text: t, why: 'more-names', part: words.slice(1).join(' ') });
      return;
    }
    if (key === 'match') { endBlock(before); cur = { kind: 'match' }; outside.push({ line: n, text: t, why: 'match' }); return; }
    if (key === 'include') return note(n, t, 'include');
    if (!cur) return note(n, t, 'before-host');
    if (cur.kind !== 'host') return note(n, t, cur.kind);
    const h = cur.h;
    if (key === 'proxycommand') h.proxied = true;   // its fourth read: an entry reached by its own command is no address to dial directly
    if (!FIELDS[key]) return note(n, t, 'unknown');
    if (h.seen[key]) return note(n, t, key === 'identityfile' ? 'more-keys' : 'repeat');   // ssh takes the first value (a key list: one key here)
    h.seen[key] = n;
    if (words.length > 1) return note(n, t, 'value');
    const v = words[0];
    if (/%|\$\{/.test(v)) return note(n, t, 'token');
    if (v.startsWith('-')) return note(n, t, 'value');   // never an ssh option
    if (key === 'port') {
      const p = /^[0-9]{1,5}$/.test(v) ? Number(v) : 0;
      if (!(p >= 1 && p <= 65535)) return note(n, t, 'value');
      h.fields.port = p;
    } else if (key === 'identitiesonly') {
      const y = v.toLowerCase();
      if (y === 'no') return note(n, t, 'identities-no');
      if (y !== 'yes') return note(n, t, 'value');
      h.fields.identitiesOnly = true;
    } else if (key === 'proxyjump') {
      const j = jumpVerdict(v);
      if (!j.ok) return note(n, t, j.code === 'chain' ? 'chain' : 'value');
      if (!j.jump) { h.jumpNone = true; return note(n, t, 'jump-none'); }   // `ProxyJump none`: no jump host — said, nothing to fill
      h.fields.jump = j.jump;
    } else {
      h.fields[FIELDS[key]] = v;
    }
    h.from[key] = n;
  });
  endBlock(last);
  for (const h of hosts) {
    // IdentitiesOnly yes with no IdentityFile names no key: nothing to do (the hub offers only a key it is given) — said, not shown as used
    if (h.fields.identitiesOnly && !h.fields.keyFile) { h.notUsed.push({ line: h.from.identitiesonly, text: textAt(h.from.identitiesonly), why: 'identities-alone' }); delete h.fields.identitiesOnly; delete h.from.identitiesonly; }
  }
  // A JUMP THAT NAMES ANOTHER HOST OF THIS PASTE (the usual VS Code layout: `Host bastion` + `Host gpu-01 … ProxyJump bastion`): read
  // as that entry's address, user and port — ssh -J on the hub would resolve the bare name by the HUB's config / DNS instead. The
  // entry's own key file is not the jump's (the jump connects with this server's own keys) — said; a jump of the jump is a chain.
  const byName = new Map();
  for (const h of hosts) for (const nm of h.names) if (!byName.has(nm.toLowerCase())) byName.set(nm.toLowerCase(), h);   // its fourth read: every name of a Host line
  for (const h of hosts) {
    const m = h.fields.jump && /^(?:([^@]+)@)?([^:@]+)(?::([0-9]+))?$/.exec(h.fields.jump);
    const e = m && byName.get(m[2].toLowerCase());
    if (!e || e === h) continue;
    const user = m[1] || e.fields.user || '', port = m[3] || (e.fields.port ? String(e.fields.port) : '');
    // its third read: an entry whose own HostName / Port / User line was REFUSED (a %-token, a «-», two words…) is not that entry's
    // address — never fall back to its bare name (the hub would resolve it by its own config)
    const refusedOwn = (e.seen.hostname && !e.fields.host) || (!m[3] && e.seen.port && !e.fields.port) || (!m[1] && e.seen.user && !e.fields.user);
    // its fourth read: an entry that is itself reached THROUGH something (its own jump — read, refused or a chain — or a ProxyCommand)
    // cannot be dialled directly as the jump: a chain, said (one jump host only)
    const routed = !!e.fields.jump || (e.seen.proxyjump && !e.jumpNone) || !!e.proxied;
    if (routed) { h.notUsed.push({ line: h.from.proxyjump, text: textAt(h.from.proxyjump), why: 'chain' }); delete h.fields.jump; delete h.from.proxyjump; continue; }
    const host = e.fields.host || e.name, addr = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;   // a bare IPv6 address, bracketed
    const v = jumpVerdict(`${user ? user + '@' : ''}${addr}${port ? ':' + port : ''}`);
    if (refusedOwn || !v.ok || !v.jump) {
      // its delta read: the paste's own entry whose address cannot be ONE jump host — said, and the jump cleared (never the bare name,
      // which the hub would resolve by its own config / DNS)
      h.notUsed.push({ line: h.from.proxyjump, text: textAt(h.from.proxyjump), why: 'jump-unread' });
      delete h.fields.jump; delete h.from.proxyjump;
      continue;
    }
    h.fields.jump = v.jump;
    h.jumpVia = { name: e.name, line: e.line };
    if (e.fields.keyFile) h.notUsed.push({ line: e.from.identityfile, text: textAt(e.from.identityfile), why: 'jump-key' });
  }
  return {
    ok: true,
    hosts: hosts.map((h) => ({ name: h.name, line: h.line, end: h.end, fields: { ...h.fields, host: h.fields.host || h.name }, from: { host: h.line, ...h.from }, notUsed: h.notUsed.sort((a, b) => a.line - b.line), ...(h.jumpVia ? { jumpVia: h.jumpVia } : {}) })),
    outside,
  };
}

function formOf(h) {
  const f = (h && h.fields) || {};
  return {
    name: String(h.name), host: String(f.host || h.name),
    ...(f.user ? { user: f.user } : {}),
    port: f.port ? String(f.port) : '',   // its read: a block with no Port means 22 — an earlier fill's port is not left behind
    jump: f.jump || '',                   // …nor an earlier fill's jump host
    keyFile: f.keyFile || '',
    ...(f.keyFile ? { keyChoice: 'file' } : {}),
  };
}

function confirmRows(h) {
  const f = (h && h.fields) || {}, from = (h && h.from) || {};
  const row = (field, key, value) => ({ field, value: value == null ? null : value, from: SPELLED[key], line: value == null ? null : from[key] || null });
  return [
    row('name', 'host', h.name),
    row('host', from.hostname ? 'hostname' : 'host', f.host || h.name),
    row('user', 'user', f.user),
    ...(f.port ? [row('port', 'port', f.port)] : []),
    ...(f.keyFile ? [row('keyFile', 'identityfile', f.keyFile)] : []),
    ...(f.identitiesOnly ? [row('identitiesOnly', 'identitiesonly', true)] : []),
    ...(f.jump ? [{ ...row('jump', 'proxyjump', f.jump), ...(h.jumpVia ? { via: h.jumpVia } : {}) }] : []),
  ];
}

module.exports = { MAX_CHARS, MAX_LINES, FIELDS, WHY, SPELLED, jumpVerdict, jumpParts, jumpTargetOk, readSshBlock, formOf, confirmRows };
