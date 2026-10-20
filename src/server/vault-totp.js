'use strict';
/**
 * TWO-STEP CODES — the hub's half (design q-047 L1, lane vault-totp; ORCH). The rules are PURE src/totp.js; this file is the
 * entries, the grants, the audit and the doors' judgments (the routes: src/routes/vault.js registerVaultTotpRoutes).
 *
 *   · AN ENTRY is the vault's own secret `totp:<name>` (src/server/vault-engine.js) — its value the PURE record (the seed +
 *     its settings), sealed whole. Nothing here keeps a seed: every answer opens the entry, computes, zeroes the copy.
 *   · A PERSON (cookie routes only) adds one (an otpauth:// link, or the seed + its settings — `preview` first: the code
 *     the typed seed makes, nothing stored), sees its CURRENT CODE with no 「验证是你」 (owner decision ①: a code dies in
 *     30 s, the seed is the secret) — every view a `vault-totp-view` audit line, paced 20 a minute per sign-in and 60 for
 *     the whole vault — deletes it (its grants first), and grants its CODE to a running conversation or a Task Group
 *     (用于…). THE SEED and its settings show only through the window's reveal door (src/server/vault-contents.js — the
 *     second password again, audited `vault-reveal`, ONE value: the otpauth link).
 *   · AN AGENT (GET /api/agent/vault/totp/:name — `vibespace-vault totp <name>`) gets the code + the seconds left, never the
 *     seed, when a person granted that entry to ITS conversation — in THIS RUN of it: the grant holds the session token's
 *     digest, so a conversation that ended and came back is not covered (design §5 L1 «会话结束失效») — or to one of its
 *     Task Groups. Every answer, refusals too, is ONE `vault-totp-use` audit line (names and codes of refusal — never a
 *     code); paced 20 a minute per conversation.
 *   · THE GRANTS: data/vault-grants.json (0600; tmp `wx` + fsync + rename) — { id, entry, subject, at, by, run }, never a
 *     value. An unreadable file grants nothing and is never written over.
 *   · LOCKED ⇒ every code answers 423 vault_locked (nothing is cached across a lock: each answer opens the entry).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('../totp.js');
const VI = require('../vault-inventory.js');

const GRANTS_FILE = 'vault-grants.json';
const GRANTS_MAX = 500;
const named = (code, why = null) => ({ ok: false, code, ...(why ? { why } : {}) });
const clip = (v, n = 80) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
/** node:crypto's HMAC — the one the PURE rules are handed. */
const hmacNode = (algorithm, key, msg) => crypto.createHmac(String(algorithm).toLowerCase(), key).update(msg).digest();
/** THE atomic persistence law: tmp opened `wx` 0600 (a planted file or link at its name is an error), fsync, rename. */
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj, null, 1)); try { fs.fsyncSync(fd); } catch { /* best effort */ } } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
}
/** A session token → the digest a conversation's grant holds (its run). */
const runOfToken = (token) => (token ? crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 24) : null);

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {object} o.vault  src/server/vault-engine.js (state, secretGet / secretPut / secretDrop / secretNames, audit)
 */
function create({ dataDir, vault, now = () => Date.now(), hmac = hmacNode, randomBytes = crypto.randomBytes, log = () => {} } = {}) {
  if (!dataDir || !vault) throw new TypeError('vault-totp: dataDir and vault are required');
  const FILE = path.join(dataDir, GRANTS_FILE);
  const viewPace = new Map();   // who → the instants of its views answered in the last minute
  const usePace = new Map();    // conversation → the instants of its answers in the last minute
  let viewAll = [];
  const vaultState = () => { try { return vault.state(); } catch { return 'locked'; } };
  const lockedCode = () => (vaultState() === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
  const names = () => (typeof vault.secretNames === 'function' ? vault.secretNames() : []).filter((s) => T.nameOfEntry(s.name));
  const has = (entry) => names().some((s) => s.name === entry);
  const whoOf = (who) => String(who || 'sign-in-off').slice(0, 40);

  // ── the grants ──
  function readGrants() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch (e) { if (e && e.code === 'ENOENT') return { grants: [], bad: false }; log(`${GRANTS_FILE} could not be read (${e.code || e.message}) — no code is granted until it is fixed`); return { grants: [], bad: true }; }
    return { grants: (raw && Array.isArray(raw.grants) ? raw.grants : []).map(T.grantOf).filter(Boolean), bad: false };
  }
  const writeGrants = (grants) => writeJsonAtomic(FILE, { v: 1, grants });
  const publicGrant = (g, live) => ({ id: g.id, subject: g.subject, at: g.at, by: g.by, ...(live ? { live: !!live(g) } : {}) });
  /** Every grant of `entry` gone (a delete, an add over a stale name). → true | false (could not be written). */
  function dropGrantsOf(entry) {
    const { grants, bad } = readGrants();
    if (bad) return false;
    const left = grants.filter((g) => g.entry !== entry);
    if (left.length === grants.length) return true;
    try { writeGrants(left); return true; } catch (e) { log(`${GRANTS_FILE} could not be written (${e.code || e.message})`); return false; }
  }

  // ── the entry ──
  /** Open the entry, hand its record to `fn`, zero the copy. */
  function withRecord(entry, fn) {
    const g = vault.secretGet(entry);
    if (!g || !g.ok) { const c = String((g && g.code) || ''); return named(/vault_locked/.test(c) ? 'vault_locked' : c === 'vault_not_set_up' ? 'vault_not_set_up' : 'unreadable', c || null); }
    if (!g.value) return named('not_found');
    let text;
    try { text = g.value.toString('utf8'); } finally { g.value.fill(0); }
    const rec = T.recordOf(text);
    return rec ? fn(rec) : named('unreadable', 'the entry is not a two-step record');
  }
  function codeOf(rec) {
    const k = T.base32Decode(rec.seed);
    if (!k.ok) return named('unreadable', k.code);
    try { const c = T.totp(k.bytes, { now: now(), period: rec.period, digits: rec.digits, algorithm: rec.algorithm, hmac }); return { ok: true, code: c.code, secondsLeft: c.secondsLeft, period: c.period, digits: rec.digits }; }
    finally { k.bytes.fill(0); }
  }
  /** The typed / pasted input → { ok, value, name } | a named refusal (never stored here). */
  function planOf(input) {
    const b = input && typeof input === 'object' ? input : {};
    const v = typeof b.uri === 'string' && b.uri.trim()
      ? T.parseOtpauth(b.uri, { now: now(), source: 'paste' })
      : T.valueOf({ seed: b.seed, digits: b.digits, period: b.period, algorithm: b.algorithm, issuer: b.issuer, account: b.account }, { now: now(), source: 'manual' });
    if (!v.ok) return v;
    const name = b.name != null && String(b.name).trim() !== '' ? String(b.name).trim() : T.nameOf(v.value.issuer, v.value.account);
    if (!T.entryOf(name)) return named('bad_name', 'a name is 1–120 letters, digits, ".", "_" or "-"');
    return { ok: true, value: v.value, name };
  }

  // ── A PERSON's doors (the cookie routes) ──
  /** 添加: the link or the seed sealed as `totp:<name>`. `preview` = the code it makes and the name it would take — nothing
   *  stored, nothing read from the vault. The answer never carries the seed. */
  function addEntry(input, { who = null, ip = null, preview = false } = {}) {
    if (vaultState() !== 'unlocked') return named(lockedCode());
    const p = planOf(input);
    if (!p.ok) return p;
    const entry = T.entryOf(p.name);
    const exists = has(entry);
    if (preview) {
      const c = codeOf(p.value);
      if (!c.ok) return c;
      return { ok: true, preview: true, name: p.name, exists, issuer: p.value.issuer, account: p.value.account, digits: p.value.digits, period: p.value.period, algorithm: p.value.algorithm, code: c.code, secondsLeft: c.secondsLeft };
    }
    if (exists) return named('exists', 'a two-step code of that name is in the vault already — delete it first, or pick another name');
    if (!dropGrantsOf(entry)) return named('failed', `${GRANTS_FILE} could not be read or written — nothing is stored`);   // a stale grant never covers a new seed
    const put = vault.secretPut(entry, JSON.stringify(p.value));
    p.value.seed = null;
    if (!put || !put.ok) return named(/vault_locked/.test(String(put && put.code)) ? 'vault_locked' : 'failed', put && put.code);
    vault.audit('vault-totp-add', { who: whoOf(who), ip, by: 'human', entry, source: p.value.source });
    return { ok: true, name: p.name, entry };
  }
  /** 看码: the CURRENT code — no 「验证是你」, paced, ONE audit line per answer. */
  function view(who, name, { ip = null } = {}) {
    const entry = T.entryOf(String(name == null ? '' : name));
    if (!entry) return named('not_found');
    if (vaultState() !== 'unlocked') return named(lockedCode());
    if (!has(entry)) return named('not_found');
    const t = now(), w = whoOf(who);
    const mine = (viewPace.get(w) || []).filter((x) => t - x < VI.REVEAL_PACE_MS && t >= x);
    viewAll = viewAll.filter((x) => t - x < VI.REVEAL_PACE_MS && t >= x);
    const p = VI.paceVerdict(mine, t, T.VIEW_PACE_MAX);
    const c = p.ok ? VI.paceVerdict(viewAll, t, T.VIEW_PACE_CEILING) : p;
    if (!c.ok) { viewPace.set(w, mine); vault.audit('vault-totp-paced', { who: w, ip, entry }); return c; }
    const r = withRecord(entry, codeOf);
    if (!r.ok) return r;
    mine.push(t); viewAll.push(t); viewPace.set(w, mine);
    vault.audit('vault-totp-view', { who: w, ip, by: 'human', entry });
    return { ok: true, name: String(name), code: r.code, secondsLeft: r.secondsLeft, period: r.period, digits: r.digits };
  }
  /** 删除: its grants first (an unwritable grants file refuses — a stale grant must never outlive its entry), then the entry
   *  (forgetting needs no key: a locked vault forgets too). */
  function drop(name, { who = null, ip = null } = {}) {
    const entry = T.entryOf(String(name == null ? '' : name));
    if (!entry || !has(entry)) return named('not_found');
    if (!dropGrantsOf(entry)) return named('failed', `${GRANTS_FILE} could not be read or written — nothing was deleted`);
    const d = vault.secretDrop(entry);
    if (!d || !d.ok) return named('failed', d && d.code);
    vault.audit('vault-totp-delete', { who: whoOf(who), ip, by: 'human', entry });
    return { ok: true, name: String(name) };
  }
  /** 用于…: the entry's CODE to conversations (`session:<id>` — the running one: `runOf(id)` = its token's digest, null = not
   *  running ⇒ refused) and Task Groups (`group:<id>`). A conversation's grant from an earlier run is replaced. */
  function grant(name, subjects, { who = null, ip = null, by = 'user', runOf = () => null } = {}) {
    const entry = T.entryOf(String(name == null ? '' : name));
    if (!entry || !has(entry)) return named('not_found');
    const list = (Array.isArray(subjects) ? subjects : [subjects]).filter((s) => s != null).map(String);
    if (!list.length) return named('bad_args', 'name at least one conversation or task group');
    const badOne = list.find((s) => !T.SUBJECT_RE.test(s));
    if (badOne) return named('bad_args', `not a conversation or task group: "${clip(badOne)}"`);
    const { grants, bad } = readGrants();
    if (bad) return named('failed', `${GRANTS_FILE} could not be read — nothing is written over it`);
    const t = now(), next = grants.slice(), added = [];
    for (const s of list) {
      let run = null;
      if (s.startsWith('session:')) { try { run = runOf(s.slice(8)) || null; } catch { run = null; } if (!run) return named('not_running', `the conversation ${clip(s.slice(8), 40)} is not running — a code is granted to a running conversation`); }
      if (next.some((g) => g.entry === entry && g.subject === s && g.run === run)) continue;
      for (let i = next.length - 1; i >= 0; i--) if (next[i].entry === entry && next[i].subject === s) next.splice(i, 1);
      const g = { id: `tg-${randomBytes(6).toString('hex')}`, entry, subject: s, at: t, by: clip(by, 60) || 'user', run };
      next.push(g); added.push(g);
    }
    if (!added.length) return { ok: true, added: [], already: true };
    if (next.length > GRANTS_MAX) return named('bad_args', `at most ${GRANTS_MAX} grants — take some back first`);
    try { writeGrants(next); } catch (e) { return named('failed', `${GRANTS_FILE} could not be written (${e.code || e.message})`); }
    for (const g of added) vault.audit('vault-totp-grant', { who: whoOf(who), ip, by: 'human', entry, subject: g.subject });
    return { ok: true, added: added.map((g) => publicGrant(g)) };
  }
  /** The ✕ on a grant chip. */
  function ungrant(id, { who = null, ip = null } = {}) {
    const { grants, bad } = readGrants();
    if (bad) return named('failed', `${GRANTS_FILE} could not be read — nothing is written over it`);
    const g = grants.find((x) => x.id === String(id || ''));
    if (!g) return named('not_found');
    try { writeGrants(grants.filter((x) => x.id !== g.id)); } catch (e) { return named('failed', `${GRANTS_FILE} could not be written (${e.code || e.message})`); }
    vault.audit('vault-totp-ungrant', { who: whoOf(who), ip, by: 'human', entry: g.entry, subject: g.subject });
    return { ok: true };
  }
  /** The window's list: every two-step entry's name, when it was sealed, its grants (`live` = a conversation's grant whose run
   *  still runs — `live(grant)` from the wiring). Names only — never a value, never a run digest. */
  function list({ live = () => true } = {}) {
    const { grants } = readGrants();
    return { ok: true, state: vaultState(), entries: names().map((s) => ({ name: T.nameOfEntry(s.name), at: s.at || null, grants: grants.filter((g) => g.entry === s.name).map((g) => publicGrant(g, live)) })) };
  }

  // ── AN AGENT's door ──
  /** The code for `caller` = { conversationId, groups, run } (the vsst_'s conversation — the wiring's). ONE audit line per
   *  answer, refusals too: who, the entry, ok / the refusal's code — never a code. */
  function use(caller, name, { ip = null } = {}) {
    const entry = T.entryOf(String(name == null ? '' : name));
    const subject = caller && caller.conversationId ? `session:${clip(caller.conversationId, 200)}` : 'unknown';
    const done = (r, via = null) => { vault.audit('vault-totp-use', { by: 'agent', subject, entry: entry || clip(name, 130), ip, ok: !!r.ok, ...(r.ok ? { via } : { code: r.code }) }); return r; };
    if (!entry) return done(named('not_granted'));
    const { grants } = readGrants();
    const v = T.useVerdict({ grants, entry, caller, vaultState: vaultState() });
    if (!v.ok) return done(v);
    const t = now(), k = subject;
    const mine = (usePace.get(k) || []).filter((x) => t - x < VI.REVEAL_PACE_MS && t >= x);
    const p = VI.paceVerdict(mine, t, T.USE_PACE_MAX);
    if (!p.ok) { usePace.set(k, mine); return done(p); }
    const r = withRecord(entry, codeOf);
    if (!r.ok) return done(r);
    mine.push(t); usePace.set(k, mine);
    if (usePace.size > 512) usePace.delete(usePace.keys().next().value);
    done({ ok: true }, v.grant.subject);
    return { ok: true, name: String(name), code: r.code, secondsLeft: r.secondsLeft, period: r.period };
  }

  return { addEntry, view, drop, grant, ungrant, list, use, GRANTS_FILE };   // addEntry, never `add(`: a For-you add site's name (test-user-todos-layout's census)
}

module.exports = { create, runOfToken, GRANTS_FILE };
