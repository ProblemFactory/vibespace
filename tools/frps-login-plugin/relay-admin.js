#!/usr/bin/env node
'use strict';
// relay-admin — the ONE writer of the relay's instance table besides the plugin's own name claims (tools/frps-login-plugin,
// lane relay-token-per-instance, design q-051 §2). The relay admin runs it on the relay host; an instance's Relay card shows
// the exact line to run (`relay-admin add <id> <sha256> <label>` — the token's hash only, never the token).
//   init [--grace 7d]                         a new table (the shared token's grace: legacy logins accepted until then)
//   add <instance id> <sha256> <label> [--prefixes pf-,vibespace-instance]
//   rotate <instance id> <sha256>             a new token for the same id (a revoked id comes back this way)
//   revoke <instance id>                      every NEW login / proxy of that id refused at once (its names stay its own)
//   add-cluster <cluster id> <sha256> <userRe> [--prefixes …]   one token for a fleet; each pod logs in as its own name
//   revoke-cluster <cluster id>
//   release <name>                            a subdomain / custom domain no longer held by anyone
//   grace <ISO | Nd | off>                    when the shared token stops working (off = now)
//   list · owners · legacy [--audit <file>]   the rows (hash prefixes only) · who holds which name · the last legacy login
//   new-token                                 a fresh token + its sha256 (for a cluster row; store the token in the cluster's secret)
//   hash                                      the sha256 of a token read from stdin (never from argv)
// --table <file> (default /var/lib/frps-plugin/relay-instances.json, or $RELAY_TABLE). Exit 0 done · 1 refused · 2 usage.
const fs = require('fs');
const crypto = require('crypto');
const T = require('./table.js');

function run(argv, { out = (s) => process.stdout.write(s + '\n'), err = (s) => process.stderr.write(s + '\n'), now = () => Date.now(), stdin = () => fs.readFileSync(0, 'utf8') } = {}) {
  const opt = (k, d = null) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v === undefined ? d : v; };
  const table = opt('--table', process.env.RELAY_TABLE || '/var/lib/frps-plugin/relay-instances.json');
  const auditFile = opt('--audit', '/var/log/frps-plugin/audit.jsonl');
  const prefixesArg = opt('--prefixes', null);
  const graceArg = opt('--grace', '7d');
  const [cmd, ...a] = argv;
  const iso = () => new Date(now()).toISOString();
  const refuse = (s) => { err('relay-admin: ' + s); return 1; };
  const usage = (s) => { err('relay-admin: ' + s + ' — run with no arguments for the usage'); return 2; };
  const prefixes = () => {
    if (!prefixesArg) return [...T.DEFAULT_PREFIXES];
    const p = prefixesArg.split(',').map((x) => x.trim()).filter(Boolean);
    if (!p.length || p.some((x) => !T.PREFIX_RE.test(x))) throw new Error('--prefixes: lowercase words (a-z, 0-9, -)');
    return p;
  };
  const untilOf = (s) => {
    if (s === 'off') return iso();
    const m = /^(\d{1,3})d$/.exec(String(s));
    if (m) return new Date(now() + Number(m[1]) * 86400e3).toISOString();
    if (Number.isFinite(Date.parse(s))) return new Date(Date.parse(s)).toISOString();
    throw new Error('grace: an ISO time, Nd (days from now) or off');
  };
  try {
    switch (cmd) {
      case 'init': {
        if (fs.existsSync(table)) return refuse(`${table} exists — nothing was changed`);
        const until = untilOf(graceArg);
        T.update(table, (t) => { t.grace.legacyUntil = until; });
        out(`table ${table} created — the shared token works until ${until}`); return 0;
      }
      case 'add': {
        const [id, hash, label] = a;
        if (!T.ID_RE.test(id || '')) return usage('add: the instance id is vi-<12 hex>');
        if (!T.HASH_RE.test(hash || '')) return usage('add: the token hash is 64 hex (the line on the instance\'s Relay card)');
        if (!T.LABEL_RE.test(label || '')) return usage('add: the label is a word (A-Z a-z 0-9 . _ -, ≤ 60)');
        const p = prefixes();
        const r = T.update(table, (t) => { if (t.instances[id]) return 'exists'; t.instances[id] = { tokenHash: hash, label, prefixes: p, addedAt: iso(), rotatedAt: null, revokedAt: null }; return 'added'; });
        if (r === 'exists') return refuse(`${id} is registered already — a new token for it is \`rotate ${id} <sha256>\``);
        out(`added ${id} (${label}) — names ${p.join(' ')}`); return 0;
      }
      case 'rotate': {
        const [id, hash] = a;
        if (!T.ID_RE.test(id || '') || !T.HASH_RE.test(hash || '')) return usage('rotate <instance id> <sha256>');
        const r = T.update(table, (t) => { const x = t.instances[id]; if (!x) return 'missing'; x.tokenHash = hash; x.rotatedAt = iso(); x.revokedAt = null; return 'ok'; });
        if (r === 'missing') return refuse(`${id} is not registered — \`add\` it first`);
        out(`rotated ${id} — the old token is refused from now on`); return 0;
      }
      case 'revoke': case 'revoke-cluster': {
        const [id] = a;
        const key = cmd === 'revoke' ? 'instances' : 'clusters';
        const r = T.update(table, (t) => { const x = t[key][id]; if (!x) return 'missing'; x.revokedAt = x.revokedAt || iso(); return 'ok'; });
        if (r === 'missing') return refuse(`${id || '(none)'} is not a registered ${cmd === 'revoke' ? 'instance' : 'cluster'}`);
        out(`revoked ${id} — every new login and proxy is refused (a live login ends at its next reconnect; \`systemctl restart frps\` ends it now)`); return 0;
      }
      case 'add-cluster': {
        const [id, hash, userRe] = a;
        if (!T.CLUSTER_ID_RE.test(id || '') || !T.HASH_RE.test(hash || '') || !userRe) return usage('add-cluster <cluster id> <sha256> <userRe>');
        const p = prefixes();
        const r = T.update(table, (t) => { if (t.clusters[id]) return 'exists'; t.clusters[id] = { tokenHash: hash, userRe, prefixes: p, addedAt: iso(), revokedAt: null }; return 'ok'; });
        if (r === 'exists') return refuse(`cluster ${id} exists`);
        out(`added cluster ${id} — pods matching ${userRe}`); return 0;
      }
      case 'release': {
        const [name] = a;
        const r = T.update(table, (t) => { if (!t.names[name]) return 'missing'; const o = t.names[name].owner; delete t.names[name]; return o; });
        if (r === 'missing') return refuse(`nobody holds ${name}`);
        out(`released ${name} (was ${r})`); return 0;
      }
      case 'grace': {
        const until = untilOf(a[0] || '');
        T.update(table, (t) => { t.grace.legacyUntil = until; });
        out(`the shared token works until ${until}${a[0] === 'off' ? ' (now: legacy logins are refused `legacy_token_retired`)' : ''}`); return 0;
      }
      case 'list': case 'owners': {
        const r = T.load(table);
        if (!r.table) return refuse(`${table}: ${r.error}`);
        const t = r.table;
        if (cmd === 'owners') { for (const [n, x] of Object.entries(t.names)) out(`${n}\t${x.owner}\t${x.at || ''}`); return 0; }
        out(`grace: legacy until ${t.grace.legacyUntil || '(never — closed)'}`);
        for (const [id, x] of Object.entries(t.instances)) out(`${id}\t${x.label}\t${x.tokenHash.slice(0, 8)}…\t${x.revokedAt ? 'REVOKED ' + x.revokedAt : 'active'}\t${x.prefixes.join(',')}`);
        for (const [id, x] of Object.entries(t.clusters)) out(`cluster ${id}\t${x.userRe}\t${x.tokenHash.slice(0, 8)}…\t${x.revokedAt ? 'REVOKED' : 'active'}`);
        return 0;
      }
      case 'legacy': {
        let text = '';
        try { text = fs.readFileSync(auditFile, 'utf8'); } catch (e) { return refuse(`${auditFile}: ${e.code || e.message}`); }
        const rows = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.verdict === 'legacy');
        const day = rows.filter((x) => now() - Date.parse(x.at) < 86400e3).length;
        out(rows.length ? `last legacy use ${rows[rows.length - 1].at} (${rows[rows.length - 1].addr || rows[rows.length - 1].user || '?'}) · ${day} in the last 24 h · ${rows.length} in this audit` : 'no legacy use in this audit');
        return 0;
      }
      case 'new-token': { const tok = 'vsrt_' + crypto.randomBytes(32).toString('base64url'); out(tok); out(T.sha256(tok)); return 0; }
      case 'hash': { const tok = String(stdin()).trim(); if (!tok) return usage('hash: the token on stdin'); out(T.sha256(tok)); return 0; }
      default:
        err(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
        return 2;
    }
  } catch (e) { return refuse(e.message); }
}

module.exports = { run };
if (require.main === module) process.exit(run(process.argv.slice(2)));
