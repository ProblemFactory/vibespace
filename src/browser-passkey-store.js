'use strict';
/**
 * THE PASSKEY STORE — PURE (imports nothing; CJS so the dialog watch, the routes, the CLI and the suites share ONE set of
 * rules). Lane passkey-store-core, 2026-10-12 (owner GO "可以做一下authn存储，放在browser机制里"; design
 * docs/design-passkey-store.zh.md = the as-built, P0's headed measurements folded in).
 *
 * One sealed table per profile in data/browser-passkeys.json (0600, ONE writer: the dialog watch). A row's private key is
 * a SEALED blob here — this module only ever sees ciphertext; `{seal, open}` come from the caller (`cipherOf` over the
 * injected node crypto + the per-instance key file today; B-4a59(b)'s keyring tomorrow — swap the pair). `publicRow` is
 * the only shape that leaves the server: never the key, the credential id shown as its first 8 characters.
 *
 * THE GATE (`gateVerdict`) is the design's §2.3 table: release-now | ask | refuse(why) — every row of it one example in
 * scripts/test-browser-passkey-store.mjs. The owner's three defaults are one line each (NEW_KEY_POLICY, AGENTS_OFF_DEFAULT,
 * TAKEOVER_ASKS).
 */

const POLICIES = Object.freeze(['yes', 'ask', 'no']);
/** owner default ①: a new key asks before an agent signs in with it (the card remembers "always" / "never" per key). */
const NEW_KEY_POLICY = 'ask';
/** owner default ②: the per-profile switch "agents never sign in with passkeys" starts OFF. */
const AGENTS_OFF_DEFAULT = false;
/** owner default ③: the person's own ceremony (a takeover, Browse yourself) raises no card — acting is the consent. */
const TAKEOVER_ASKS = false;
const GRANT_MS = 10 * 60 * 1000;   // an approved registration grant: one use, this long
const ASK_MS = 5 * 60 * 1000;      // a sign-in ask nobody answers is refused (the card says expired)
const HOLD_MS = 1500;              // P0 ④: the hook rejects in-page when no verdict arrives in this long
const ALLOW_MAX = 20;
const ROWS_MAX = 200;              // per profile
const ID_SHOWN = 8;
const REASONS = Object.freeze(['no-grant', 'policy-no', 'declined', 'expired', 'profile-switch', 'rp-mismatch', 'none', 'withdrawn',
  // lane passkey-sink (a kernel with `webauthn`, design-custom-browser-plugin §3): the request offers no ES256 key type · its rpId /
  // client data are not the page's own (VibeSpace re-checks, never trusting the kernel) · the sealed keys cannot be opened (the vault)
  'webauthn_alg_unsupported', 'webauthn_rp_mismatch', 'webauthn_key_locked']);
/** The card's choices (P2 draws them; the approve route takes one as `choice`). */
const CHOICES = Object.freeze({ register: Object.freeze(['once', 'no']), 'sign-in': Object.freeze(['once', 'always', 'no', 'never']) });
/** Public suffixes an rpId may never be (a short list — Chrome's own registrable-domain check runs first). */
const PUBLIC_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'ne.jp', 'or.jp', 'com.cn', 'net.cn', 'org.cn', 'com.br', 'co.nz', 'co.in', 'co.kr', 'com.tw', 'com.hk', 'github.io', 'gitlab.io', 'herokuapp.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'appspot.com', 'blogspot.com', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'fly.dev', 'onrender.com']);

const str = (v) => (v == null ? '' : String(v));
const B64URL = /^[A-Za-z0-9_-]{1,1400}$/;
const SEALED = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{8,4000}$/;
const PROFILE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const nat = (v, max = Number.MAX_SAFE_INTEGER) => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : 0; };
const words = (v, n = 64) => str(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
/** A host name or '' (an rpId, never page text). */
function hostWord(v) {
  const s = str(v).toLowerCase();
  return s.length <= 253 && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(s) ? s : '';
}
const isIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

/** A stored row in / out (null = not a row). The private key is `keySealed` — ciphertext only. */
function normalizeRow(o) {
  if (!o || typeof o !== 'object') return null;
  const credentialId = str(o.credentialId), rpId = hostWord(o.rpId), keySealed = str(o.keySealed);
  if (!B64URL.test(credentialId) || !rpId || !SEALED.test(keySealed)) return null;
  return {
    credentialId, rpId,
    userHandle: B64URL.test(str(o.userHandle)) && str(o.userHandle).length <= 128 ? str(o.userHandle) : '',
    userName: words(o.userName), displayName: words(o.displayName),
    keySealed, signCount: nat(o.signCount, 0xffffffff),
    createdBy: o.createdBy === 'human' ? 'human' : 'agent',
    bySession: o.bySession ? words(o.bySession, 80) : null,
    createdAt: nat(o.createdAt), lastUsedAt: nat(o.lastUsedAt), uses: nat(o.uses),
    policy: POLICIES.includes(o.policy) ? o.policy : NEW_KEY_POLICY,
  };
}
function emptyProfile() { return { agentsOff: AGENTS_OFF_DEFAULT, rows: [] }; }
/** The whole file in / out: `{v: 1, profiles: {<profileId>: {agentsOff, rows}}}` — one row per credential id. */
function normalizeStore(o) {
  const out = { v: 1, profiles: {} };
  const src = o && typeof o === 'object' && o.profiles && typeof o.profiles === 'object' ? o.profiles : {};
  for (const [pid, p] of Object.entries(src)) {
    if (!PROFILE_ID.test(pid) || !p || typeof p !== 'object') continue;
    const seen = new Set(), rows = [];
    for (const r0 of Array.isArray(p.rows) ? p.rows : []) { const r = normalizeRow(r0); if (r && !seen.has(r.credentialId)) { seen.add(r.credentialId); rows.push(r); } }
    out.profiles[pid] = { agentsOff: typeof p.agentsOff === 'boolean' ? p.agentsOff : AGENTS_OFF_DEFAULT, rows: rows.slice(-ROWS_MAX) };
  }
  return out;
}
const profileOf = (store, pid) => (store && store.profiles && store.profiles[pid]) || emptyProfile();
/** A copy of `store` with `pid`'s part replaced by `fn(part)`. */
function withProfile(store, pid, fn) {
  const s = normalizeStore(store);
  const next = fn({ agentsOff: profileOf(s, pid).agentsOff, rows: profileOf(s, pid).rows.slice() });
  s.profiles[pid] = { agentsOff: !!next.agentsOff, rows: next.rows.map(normalizeRow).filter(Boolean).slice(-ROWS_MAX) };
  if (!s.profiles[pid].rows.length && s.profiles[pid].agentsOff === AGENTS_OFF_DEFAULT) delete s.profiles[pid];
  return s;
}
const withRow = (store, pid, row) => withProfile(store, pid, (p) => ({ ...p, rows: [...p.rows.filter((r) => r.credentialId !== row.credentialId), row] }));
/** The rows a person / an agent names: an rpId, or a credential id (its first 8 characters or more). */
function findRows(rows, ref) {
  const r = str(ref).trim();
  if (!r) return [];
  const h = hostWord(r);
  const byRp = h ? (rows || []).filter((x) => x.rpId === h) : [];
  if (byRp.length) return byRp;
  return r.length >= ID_SHOWN && B64URL.test(r) ? (rows || []).filter((x) => x.credentialId.startsWith(r)) : [];
}
function dropRows(store, pid, pred) {
  const before = profileOf(normalizeStore(store), pid).rows;
  const gone = before.filter(pred);
  return { store: withProfile(store, pid, (p) => ({ ...p, rows: p.rows.filter((r) => !pred(r)) })), removed: gone.length, rows: gone };
}
/** `removeProfile`: the profile's keys go with it (the directory stays; the keys are ours, not Chrome's). */
function dropProfile(store, pid) {
  const s = normalizeStore(store);
  const n = profileOf(s, pid).rows.length;
  delete s.profiles[pid];
  return { store: s, removed: n };
}
const setPolicy = (store, pid, credentialId, policy) => withProfile(store, pid, (p) => ({ ...p, rows: p.rows.map((r) => (r.credentialId === credentialId && POLICIES.includes(policy) ? { ...r, policy } : r)) }));
const setAgentsOff = (store, pid, on) => withProfile(store, pid, (p) => ({ ...p, agentsOff: !!on }));

/** THE ONLY SHAPE THAT LEAVES THE SERVER (routes, CLI, digest, trace, panel): never the key, never the whole id. */
function publicRow(r) {
  if (!r) return null;
  return { id: str(r.credentialId).slice(0, ID_SHOWN), rpId: r.rpId, userName: r.userName, displayName: r.displayName, source: r.createdBy === 'human' ? 'you' : 'agent', createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, uses: r.uses, signCount: r.signCount, policy: r.policy };
}

/** aes-256-gcm over an injected node crypto + a 32-byte key → `{seal(text) → 'v1.<iv>.<tag>.<ct>', open(sealed) → text | null}`. */
function cipherOf(crypto, key) {
  if (!crypto || !key || key.length !== 32) throw new Error('passkey store: a 32-byte key is required');
  const b64u = (b) => Buffer.from(b).toString('base64url');
  return {
    seal(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(Buffer.from(str(text), 'utf8')), c.final()]);
      return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
    },
    open(sealed) {
      const m = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]+)$/.exec(str(sealed));
      if (!m) return null;
      try {
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(m[1], 'base64url'));
        d.setAuthTag(Buffer.from(m[2], 'base64url'));
        return Buffer.concat([d.update(Buffer.from(m[3], 'base64url')), d.final()]).toString('utf8');
      } catch { return null; }
    },
  };
}
const seal = (cipher, pkcs8B64) => cipher.seal(str(pkcs8B64));
const open = (cipher, row) => (row ? cipher.open(row.keySealed) : null);
/** key-file-law-fix (verify r1 F1): THE KEY REFUSAL is a VALUE — the caller's `seal` / `open` answer `{ ok: false, code, file, words }`
 *  when the key file cannot open what is stored (src/key-file.js: key-missing | key-unreadable:<errno> | key-malformed); an
 *  Error carrying such a code (a cipher that throws) reads the same. → `{ code, file, words }` | null (a sealed blob, text, null). */
function keyRefusal(x) {
  if (!x || typeof x !== 'object') return null;
  const code = str(x.code);
  if (!/^key-(missing|malformed|unreadable(:[A-Za-z0-9_]+)?)$/.test(code) || !(x.ok === false || x instanceof Error)) return null;
  return { code, file: str(x.file), words: str(x.words || x.message) };
}

/** THE SIGN COUNT: the store is bumped BEFORE the release (written to disk), the authenticator loaded with the old value
 *  (it produces old + 1) — a crash between the release and the harvest never moves the count backwards. */
function bumpSignCount(row) { return { row: { ...row, signCount: nat(row.signCount, 0xffffffff) + 1 }, loadAs: nat(row.signCount, 0xffffffff) }; }
/** The harvested assertion: the authenticator's count (never lower than the store's), the use stamped. */
function reconcile(row, eventCount, now = 0) { return { ...row, signCount: Math.max(nat(row.signCount, 0xffffffff), nat(eventCount, 0xffffffff)), lastUsedAt: nat(now), uses: nat(row.uses) + 1 }; }

/** May a page of `origin` use a key of `rpId`? The origin's host IS the rpId or ends in `.rpId`; https (or http on
 *  localhost); never an IP, a single label (but localhost) or a known public suffix. */
function rpMatches(origin, rpId) {
  const rp = hostWord(rpId);
  const m = /^(https?):\/\/(?:[^@/?#]*@)?([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(str(origin));
  if (!rp || !m) return false;
  const scheme = m[1].toLowerCase(), host = hostWord(m[2]);
  if (!host || isIp(rp) || isIp(host)) return false;
  const local = host === 'localhost' || host.endsWith('.localhost');
  if (scheme !== 'https' && !local) return false;
  if (!rp.includes('.') && rp !== 'localhost') return false;
  if (PUBLIC_SUFFIXES.has(rp)) return false;
  return host === rp || host.endsWith('.' + rp);
}
/** The rows one ceremony may see: its rpId, its allow list (empty = the discoverable rows), a policy filter. */
function rowsFor(rows, { rpId, allow = [], policyFilter = null } = {}) {
  const rp = hostWord(rpId);
  const list = (Array.isArray(allow) ? allow : []).map(str).slice(0, ALLOW_MAX);
  return (rows || []).filter((r) => r && r.rpId === rp && (!list.length || list.includes(r.credentialId)) && (!policyFilter || policyFilter(r.policy)));
}

const refuse = (why) => ({ verdict: 'refuse', why });
/** THE GATE — §2.3's table. `kind` get | create | conditional (a get with mediation:'conditional'); `takeover` = the person
 *  operated the tab when the ceremony STARTED (a takeover later never lifts an agent's ceremony); `grant` = the agent's
 *  approved registration for (profile, rpId, conversation) or null; `answer` = the card's answer for THIS ceremony
 *  (once | always | no | never | expired) or null; `profileSwitch` = the profile's "agents never" switch.
 *  → {verdict:'release', uv, load:[credentialId], createdBy?, consumeGrant?} | {verdict:'ask', rows:[credentialId]} | {verdict:'refuse', why}. */
function gateVerdict({ kind = 'get', rpId = '', origin = '', rows = [], grant = null, input = {}, answer = null, profileSwitch = false, takeover = false, now = 0 } = {}) {
  const rp = hostWord(rpId);
  if (!rpMatches(origin, rp)) return refuse('rp-mismatch');
  const conditional = kind === 'conditional' || (input && input.mediation === 'conditional');
  if (kind === 'create') {
    if (takeover) return TAKEOVER_ASKS ? { verdict: 'ask', rows: [] } : { verdict: 'release', uv: true, load: [], createdBy: 'human' };
    if (profileSwitch) return refuse('profile-switch');
    if (!grant || grant.rpId !== rp || grant.used) return refuse('no-grant');
    if (nat(now) > nat(grant.expiresAt)) return refuse('expired');
    return { verdict: 'release', uv: true, load: [], createdBy: 'agent', consumeGrant: true };
  }
  const hits = rowsFor(rows, { rpId: rp, allow: input && input.allow });
  if (takeover) return hits.length ? { verdict: 'release', uv: true, load: hits.map((r) => r.credentialId) } : (conditional ? refuse('none') : { verdict: 'release', uv: false, load: [] });
  if (profileSwitch) return refuse('profile-switch');
  // no key here: a modal get meets the EMPTY authenticator (Chrome refuses it in ~1 ms, the page shows its other ways in);
  // an autofill (conditional) get is refused in-page — it would wait forever for a pick
  if (!hits.length) return conditional ? refuse('none') : { verdict: 'release', uv: false, load: [] };
  const usable = hits.filter((r) => r.policy !== 'no');
  if (!usable.length) return refuse('policy-no');
  if (answer === 'once' || answer === 'always') return { verdict: 'release', uv: true, load: usable.map((r) => r.credentialId) };
  if (answer === 'never') return refuse('policy-no');
  if (answer === 'no') return refuse('declined');
  if (answer === 'expired') return refuse('expired');
  const yes = usable.filter((r) => r.policy === 'yes');
  if (yes.length) return { verdict: 'release', uv: true, load: yes.map((r) => r.credentialId) };
  return { verdict: 'ask', rows: usable.map((r) => r.credentialId) };
}

/** lane passkey-sink (design-custom-browser-plugin §3): THE FLAGS VibeSpace signs with on a kernel with `webauthn` — VibeSpace IS
 *  the authenticator there, so UV says what VibeSpace verified: set ONLY when the owner decided THIS ceremony — the card answered
 *  once / always, the registration card's one-use grant, or the person's own ceremony (a takeover: their hands on the page); a
 *  policy-`yes` release is automatic ⇒ uv false. A page that REQUIRES UV on such an automatic release is asked (the card) rather
 *  than signed without it. UP always (the release is the presence); BE / BS never (the key lives in this VibeSpace only).
 *  `v` = gateVerdict's release. → {ask: true} | {up: true, uv, be: false, bs: false}. */
function kernelFlags(v, { kind = 'get', answer = null, takeover = false, userVerification = 'preferred' } = {}) {
  const owner = !!takeover || answer === 'once' || answer === 'always' || (kind === 'create' && !!(v && v.consumeGrant));
  const uv = !!(v && v.verdict === 'release' && v.uv && owner);
  if (!uv && userVerification === 'required' && v && Array.isArray(v.load) && v.load.length) return { ask: true };
  return { up: true, uv, be: false, bs: false };
}
/** lane passkey-sink: the ONE row a kernel sign-in signs with, of the rows the gate released — the page's allow list in its
 *  order, else the most recently used (then the newest). → the rows in that order (the first that unseals signs). */
function signOrder(rows, load = [], allow = []) {
  const ids = (Array.isArray(load) ? load : []).map(str), want = (Array.isArray(allow) ? allow : []).map(str);
  const hit = (rows || []).filter((r) => r && ids.includes(r.credentialId));
  if (want.length) return want.map((id) => hit.find((r) => r.credentialId === id)).filter(Boolean);
  return hit.slice().sort((a, b) => nat(b.lastUsedAt) - nat(a.lastUsedAt) || nat(b.createdAt) - nat(a.createdAt));
}

/** An approved registration grant (the card's "allow once"): for (rpId, conversation), one use, GRANT_MS. */
function grantOf({ rpId, browserKey, user = '', now = 0, by = 'user' }) { return { rpId: hostWord(rpId), browserKey: str(browserKey), user: words(user), at: nat(now), expiresAt: nat(now) + GRANT_MS, used: false, by }; }
const grantKey = (rpId, browserKey) => `${hostWord(rpId)} ${str(browserKey).replace(/\.\d+$/, '')}`;

/** FNV-1a over the card's frozen words — the `shown` digest an Approve names (another card ⇒ proposal_changed). */
function digest(s) { let h = 0x811c9dc5; for (const ch of str(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
/** THE CARD'S DATA (P2 draws it; the For-you item + the chat card carry it): kind register | sign-in. */
function proposalCard({ id, kind, profileId, profileLabel = '', rpId, user = null, rows = [], expiresAt = 0, state = 'open', answer = null }) {
  const k = kind === 'register' ? 'register' : 'sign-in';
  const u = user ? { name: words(user.name), displayName: words(user.displayName) } : { name: '', displayName: '' };
  const card = { id: str(id), type: 'passkey', kind: k, profileId: str(profileId), profile: words(profileLabel, 80) || str(profileId), rpId: hostWord(rpId), user: u, keys: (rows || []).map(publicRow).filter(Boolean), choices: CHOICES[k].slice(), expiresAt: nat(expiresAt), state, answer };
  card.shown = digest(JSON.stringify([card.id, card.kind, card.profileId, card.rpId, card.user, card.keys.map((r) => r.id)]));
  return card;
}
/** int258: the chat's ONE passkey card block (normalizers' `browser_proposal`, keyed by the card id) — the live feed and the
 *  rebuild's source both build it here, so a rebuilt card is the card the live view drew. */
const cardBlock = (card, at) => ({ type: 'browser_proposal', id: str(card && card.id), kind: 'passkey', state: card && card.state, passkey: card, at: Number(at) || 0 });
/** The For-you item of a card (origin browser; Approve = "allow once", Reject = "no"; P2 adds the other choices). */
// lane passkey-ui: the item's words = the card's (browser-passkey passkeyCardWords) — literal keys the tray translates
const ITEM_WORDS = Object.freeze({
  register: '{profile} wants to register a passkey on {rp} for {user}', registerNoUser: '{profile} wants to register a passkey on {rp}',
  signIn: '{profile} wants to sign in to {rp} with {user}\'s passkey', signInNoUser: '{profile} wants to sign in to {rp} with a passkey',
  registerAfter: 'After this the agent can create ONE passkey on {rp} in the next 10 minutes; it stays sealed in this VibeSpace and each sign-in with it asks you first.',
  signInAfter: 'After this the agent can sign in to {rp} as {user} until you change the policy.', signInAfterNoUser: 'After this the agent can sign in to {rp} with this passkey until you change the policy.',
});
const fillWords = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));
function proposalItem(card) {
  const who = card.user.name || (card.keys[0] && card.keys[0].userName) || '';
  const reg = card.kind === 'register';
  const key = reg ? (who ? ITEM_WORDS.register : ITEM_WORDS.registerNoUser) : (who ? ITEM_WORDS.signIn : ITEM_WORDS.signInNoUser);
  const dkey = reg ? ITEM_WORDS.registerAfter : (who ? ITEM_WORDS.signInAfter : ITEM_WORDS.signInAfterNoUser);
  const params = { profile: card.profile, rp: card.rpId, user: who };
  return { text: fillWords(key, params), detail: fillWords(dkey, params), i18n: { text: { key, params }, detail: [{ key: dkey, params }] }, kind: 'action', urgency: 'high', origin: 'browser', action: { type: 'browser-proposal', id: card.id, shown: card.shown, choices: card.choices.join(' ') }, passkey: card }; // lane passkey-ui: choices as ONE string — user-todos normalizeAction refuses an array (the card was never filed)
}

/** `passkey status`'s store line for one rpId. */
function countLine(rows, rpId) {
  const rp = hostWord(rpId);
  const hits = (rows || []).filter((r) => r.rpId === rp);
  if (!rp) return '';
  if (!hits.length) return `This profile holds no passkey for ${rp}.`;
  return `This profile holds ${hits.length} passkey${hits.length === 1 ? '' : 's'} for ${rp}: ${hits.slice(0, 5).map((r) => `${r.userName || r.displayName || r.credentialId.slice(0, ID_SHOWN)} (policy ${r.policy})`).join(', ')}.`;
}

module.exports = {
  POLICIES, NEW_KEY_POLICY, AGENTS_OFF_DEFAULT, TAKEOVER_ASKS, GRANT_MS, ASK_MS, HOLD_MS, ALLOW_MAX, ROWS_MAX, ID_SHOWN, REASONS, CHOICES, PUBLIC_SUFFIXES,
  hostWord, normalizeRow, normalizeStore, profileOf, withProfile, withRow, findRows, dropRows, dropProfile, setPolicy, setAgentsOff, publicRow,
  ITEM_WORDS, // lane passkey-ui
  cipherOf, seal, open, keyRefusal, bumpSignCount, reconcile, rpMatches, rowsFor, gateVerdict, grantOf, grantKey, digest, proposalCard, proposalItem, countLine,
  cardBlock, // int258: the chat card's block (live + rebuild)
  kernelFlags, signOrder, // lane passkey-sink: the UV rule + the row a kernel sign-in signs with
};
