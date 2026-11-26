'use strict';
/**
 * WEB LOGINS — the hub's half (lane browser-login, r22 pivot: «agent locates, hub fills»; ORCH).
 *
 * The rules are PURE `src/browser-login.js`; this file is THE ONE WRITER of `web-login:<origin>#<user>` entries
 * (`writeEntry` -> `vault.secretPut`), the `browser-login` door's grant rows, paired two-step codes (`totpCode`),
 * `vault-use` receipts (`vault.noteUse`), and For-you pending/takeover cards & cross-origin notices.
 *
 *   · `resolveFill` — validates `--vault <entry>/<field>` (`user | password | previous | pending | otp` or
 *     `new:<site>[#<user>]/password --generate`), enforces frame/origin/grant/lock gates before opening any ciphertext,
 *     seals generated `pending` slots BEFORE any character is typed into Chrome, files ONE deduplicated Confirm/Discard
 *     For-you card in `afterCommit`, and issues a `vr-...` receipt (`outcome: "filled" | "generated-and-filled"`) once
 *     the CDP fill succeeds.
 *   · `confirmOwn` / `discardPending` — human-only promotion («只有人能转正»): Confirm promotes `pending -> current` and
 *     rotates old `current -> previous` (discarding any older `previous`, `rev++`); Discard drops an unconfirmed
 *     `register` entry or clears `pending` on a `change` while keeping `current` and `previous` intact (`rev++`).
 *   · `maybeRemindPending` — reminds ONCE after 7 days, recorded outside the login entry (`browser-login-reminders.json`
 *     holding opaque episode digests only) so unlock, `list`, and `resolveFill` perform 0 vault writes; clocks never promote or delete.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BL = require('../browser-login.js');
const GM = require('../grant-model.js');
const { writeJsonAtomic } = require('../channel-store.js');
const SR = require('../store-read.js');   // B-f276 (lane hub-loop-stalls, r4719): browser-login-reminders.json under the store-read law…
const HOLD = require('../store-read-hold.js');   // …and its hold: a ledger that could not be read is HELD, never «nobody reminded yet»

const CARDS_MAX = 4;
const CARD_MS = 10 * 60e3;
const REMINDERS_FILE = 'browser-login-reminders.json';
const REMINDERS_MAX = 2048;
const named = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const str = (v) => (v === undefined || v === null ? '' : String(v));

function create({ vault, dataDir = null, grants = null, totpCode = null, forYou = null, now = () => Date.now(), randomBytes = crypto.randomBytes, log = () => {}, cardMs = CARD_MS } = {}) {
  if (!vault) throw new TypeError('browser-logins: a vault is required');
  const store = () => { const g = typeof grants === 'function' ? grants() : grants; return g || require('./grants-store.js').store(); };
  const cards = new Map();        // id -> {id, name, origin, username, password, existing, shown, at, item, timer} (human takeover save-login card)
  const pendingCards = new Map(); // id -> {id, name, rev, kind, shown, items: Set<string>, profileId} (sealed pending Confirm/Discard card; zero secrets)
  const crossOriginNoted = new Set(); // `${profileId}\0${name}\0${targetOrigin}` dedupe
  const takeoverDroppedNoted = new Set(); // `${profileId}\0${origin}\0${code}` dedupe
  const remindDir = typeof dataDir === 'string' && dataDir ? dataDir : (vault && typeof vault.dataDir === 'string' && vault.dataDir ? vault.dataDir : null);
  const remindFile = remindDir ? path.join(remindDir, REMINDERS_FILE) : null;
  const remindedDigests = new Set(); // 32-hex DEK-derived HMAC marks (`vault.macOf('browser-login-remind', rk)`) — zero secrets, zero unsalted digests, outside vault.json
  const openListeners = [];
  const lockListeners = [];

  const vstate = () => { try { return vault.state(); } catch { return 'locked'; } };
  const say = (m) => { try { log(m); } catch { /* journal failure */ } };
  const batchWrite = (fn) => (typeof vault.batchRecordWrite === 'function' ? vault.batchRecordWrite(fn) : fn((cb) => { if (typeof cb === 'function') cb(); }));

  function nextFloorRev(name) {
    const floor = typeof vault.loginRevFloor === 'function' ? Number(vault.loginRevFloor(name)) || 0 : 0;
    return Math.max(1, floor + 1);
  }

  /** The vault's web-login NAMES → [{name, origin, user, at, source, actor, owner, pending, rev}] (no entry is opened). */
  function names() {
    let list = [];
    try { list = typeof vault.secretNames === 'function' ? vault.secretNames() || [] : []; } catch { list = []; }
    const out = [];
    for (const s of list) {
      const p = s && BL.parseName(s.name);
      if (!p) continue;
      out.push({
        name: s.name,
        origin: p.origin,
        user: p.user,
        at: Number(s.at) || null,
        source: BL.SOURCES.includes(s.kind) ? s.kind : 'owner',
        actor: s.actor || null,
        owner: s.owner || null,
        pending: s.pending === 'register' || s.pending === 'change' ? s.pending : null,
        rev: Number.isInteger(s.rev) && s.rev >= 1 ? s.rev : 1,
      });
    }
    return out;
  }

  /** ONE entry opened → {ok, rec, meta} | {ok:true, rec:null} | named refusal. Ciphertext plaintext Buffer is zeroed at once. */
  function open(name) {
    let g;
    try { g = vault.secretGet(name); } catch (e) { return named('unreadable', e && e.message); }
    if (!g || !g.ok) {
      const c = str(g && g.code);
      return named(/vault_locked/.test(c) ? 'vault_locked' : c === 'vault_not_set_up' ? 'vault_locked' : 'unreadable', c || 'unreadable');
    }
    if (!g.value) return { ok: true, rec: null };
    let text;
    try { text = g.value.toString('utf8'); } finally { try { g.value.fill(0); } catch { /* */ } }
    const rec = BL.recordOf(text);
    return rec ? { ok: true, rec } : named('unreadable', 'the entry is not a web-login record');
  }

  function metaOf(name) {
    return names().find((e) => e.name === name) || null;
  }
  /** ONE LOGIN, SEVERAL SITES: the names, each with the sites its sealed record keeps (`origins`, `siteUsers`) — the vault's clear
   *  names hold only the first site and user, so each login is opened (unlocked only; a record that cannot be read keeps its first
   *  site alone). Used by the fill and by the writes' one-pair-one-login rule. */
  function namesWithSites() {
    const list = names();
    if (vstate() !== 'unlocked') return list;
    return list.map((e) => {
      const o = open(e.name);
      if (!o.ok || !o.rec) return e;
      return { ...e, ...(o.rec.origins ? { origins: o.rec.origins.slice() } : {}), ...(o.rec.siteUsers ? { siteUsers: { ...o.rec.siteUsers } } : {}) };
    });
  }
  /** ONE PAIR, ONE LOGIN AT EVERY DOOR THAT MAKES A LOGIN (主开发 23:01Z, must 1): the OTHER login that already holds (site, user) —
   *  its first site or one added to it — or null. The person's add, an agent's add and the save card's new login each refuse
   *  login_exists naming it: a second login for a held pair would fill the older one's secret and share its grant row. */
  function pairHolder(name, origin, user) {
    if (vstate() !== 'unlocked') return null;
    return namesWithSites().find((e) => e && e.name !== name && BL.holdsPair(e, origin, user)) || null;
  }
  const heldPair = (h, origin, user) => named('login_exists', `${BL.userOf(user)} on ${origin} is already a site of the login ${h.name} — change its password at that login's row in the Vault window (or remove the site there first); nothing was saved`, { other: h.name });

  /** THE ONE WRITER of a web-login entry (`vault.secretPut`). */
  function writeEntry(name, rec, { actor = undefined, owner = undefined } = {}) {
    if (!BL.isEntryName(name)) return named('bad-name', 'not a web-login entry');
    const norm = BL.recordOf(rec);
    if (!norm) return named('bad-record', 'not a web-login record');
    const prevMeta = (actor === undefined || owner === undefined) ? metaOf(name) : null;
    const effActor = actor !== undefined ? actor : (prevMeta ? prevMeta.actor : null);
    const effOwner = owner !== undefined ? owner : (prevMeta ? prevMeta.owner : null);
    let text;
    try { text = BL.textOf(norm); } catch (e) { return named('bad-record', e && e.message); }
    const r = vault.secretPut(name, text, {
      kind: norm.source,
      actor: effActor ? str(effActor).slice(0, 128) : null,
      owner: effOwner ? str(effOwner).slice(0, 128) : null,
      pending: norm.pending ? norm.pending.kind : null,
      rev: norm.rev,
    });
    if (!r || !r.ok) {
      const c = str(r && r.code);
      return named(/vault_locked|vault_not_set_up/.test(c) ? 'vault_locked' : 'not_written', c || 'not written');
    }
    return { ok: true };
  }

  const rowsOf = (resource) => { const g = store(); return g ? g.rowsFor(BL.DOOR, resource) : []; };
  const blocked = (actor, origin) => { try { vault.blocked?.(str(actor) || 'An agent', `a website login (${BL.hostOf(origin) || origin || 'web-login'})`); } catch { /* */ } };
  const use = (name, { conv = null, actor = null, outcome = 'filled', purpose = '' } = {}) => {
    try { return vault.noteUse(name, { by: 'agent', door: BL.DOOR, conv }, { outcome, purpose, actor }) || { receipt: null }; }
    catch (e) { say(`[browser-login] the use was not noted — ${e && e.message}`); return { receipt: null }; }
  };
  const purposeOf = (field, origin, profileId = null) => `fill ${field} on ${origin}${profileId ? ` (profile ${profileId})` : ''}`;

  function notice(state, { origin, username, conversation = '', targetOrigin = '', why = '', profileId = null }) {
    const w = BL.noticeWords(state, { origin, username, conversation, targetOrigin, why });
    if (!w || !forYou || typeof forYou.add !== 'function') return null;
    try {
      return forYou.add(profileId, { origin: 'browser', kind: 'notice', urgency: 'normal', text: w.text, detail: w.detail, i18n: w.i18n });
    } catch (e) {
      say(`[browser-login] the notice was not filed — ${e && e.message}`);
      return null;
    }
  }

  function noticeCrossOriginBlocked({ name = '', origin = '', username = '', targetOrigin = '', profileId = null } = {}) {
    const key = `${str(profileId)}\u0000${str(name || origin)}\u0000${str(targetOrigin)}`;
    if (crossOriginNoted.has(key)) return null;
    crossOriginNoted.add(key);
    if (crossOriginNoted.size > 256) crossOriginNoted.delete(crossOriginNoted.keys().next().value);
    const parsed = BL.parseName(name);
    return notice('cross-origin-blocked', {
      origin: origin || (parsed && parsed.origin) || '',
      username: username || (parsed && parsed.user) || '',
      targetOrigin,
      profileId,
    });
  }

  function noticeTakeoverSaveDropped({ origin = '', code = 'bad_request', why = '', profileId = null } = {}) {
    const o = BL.originOf(origin) || str(origin).slice(0, 120) || 'unknown-origin';
    const whyMsg = str(why || code || 'bad_request').slice(0, 120);
    say(`[browser-login] takeover save-login card not offered on ${o} (${str(code)}: ${whyMsg})`);
    const key = `${str(profileId)}\u0000${o}\u0000${str(code)}`;
    if (takeoverDroppedNoted.has(key)) return null;
    takeoverDroppedNoted.add(key);
    if (takeoverDroppedNoted.size > 256) takeoverDroppedNoted.delete(takeoverDroppedNoted.keys().next().value);
    return notice('takeover-save-dropped', { origin: o, why: whyMsg, profileId });
  }

  // ── PENDING CONFIRM / DISCARD FOR-YOU CARDS (zero secrets in memory or action) ──
  const pendingCardIdOf = (name, rev) => 'sl-' + crypto.createHash('sha256').update(`pending\u0000${name}\u0000${rev}`).digest('hex').slice(0, 8);
  const pendingShownOf = (id, name, rev, kind) => crypto.createHash('sha256').update(`${id}\u0000${name}\u0000${rev}\u0000${kind}`).digest('hex').slice(0, 16);
  const pendingRemindDigest = (name, rec) => {
    const rk = BL.pendingRemindKey(name, rec);
    if (!rk) return null;
    if (typeof vault.macOf === 'function') {
      const mac = vault.macOf('browser-login-remind', rk);
      return typeof mac === 'string' && mac.length >= 32 ? mac.slice(0, 32) : null;
    }
    return `mem:${rk}`;
  };
  // B-f276 (lane hub-loop-stalls, r4719) — THE STORE-READ LAW. The release read a failed read or torn bytes as «nobody reminded yet»:
  // every pending sign-in was reminded AGAIN in For you, and the next pass wrote the ledger over with only the new marks. Now through
  // store-read's answer to the hold (code `pending_reminders_unread`). HELD: the pass reminds nothing (said once a hold) and writes
  // nothing; LIFTED: the marks loaded, then the pass runs (a reminder the hold delayed goes now). TORN: kept aside once, then empty
  // (the hold's own law)
  const isLedger = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const addDigests = (parsed) => {
    for (const d of (parsed && Array.isArray(parsed.reminded)) ? parsed.reminded : []) {
      if (typeof d === 'string' && /^[0-9a-f]{32}$/.test(d)) remindedDigests.add(d);
    }
  };
  let remindHeldSaid = false;
  const remindHold = remindFile ? HOLD.create({ file: remindFile, valid: isLedger, code: 'pending_reminders_unread', aside: (m) => remindFile + '.corrupt-' + m,
    words: (h) => `the record of the sign-in reminders already filed could not be read (${h && h.code}) — VibeSpace reads it again by itself; nothing is written over it, and a reminder waits until it reads`,
    log: (l) => say(`[browser-login] ${l}`),
    onLift: (v) => { addDigests(v); remindHeldSaid = false; try { maybeRemindPending(); } catch (e) { say(`[browser-login] the reminder pass at the lift failed — ${e && e.message}`); } } }) : null;
  function loadRemindedDigests() {
    if (!remindFile) return;
    let read; try { read = { text: fs.readFileSync(remindFile, 'utf8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: isLedger });   // the sign-in reminders' ledger: THE ANCHOR (test-data-store-census)
    if (remindHold.start(a) === 'data') addDigests(a.value);
  }
  function saveRemindedDigests() {
    if (!remindFile || typeof vault.macOf !== 'function') return;
    if (!remindHold.writable('a write of the sign-in reminders record')) return;   // HELD: never over a file that could not be read
    while (remindedDigests.size > REMINDERS_MAX) remindedDigests.delete(remindedDigests.keys().next().value);
    try {
      fs.mkdirSync(path.dirname(remindFile), { recursive: true });
      writeJsonAtomic(remindFile, { v: 1, reminded: [...remindedDigests] }, { mode: 0o600 });
    } catch (e) {
      say(`[browser-login] pending reminder ledger not written — ${e && e.message}`);
    }
  }
  loadRemindedDigests();

  function resolvePendingItemsForName(name, extraItemId = null) {
    const ids = new Set();
    const cardIds = new Set();
    if (extraItemId) ids.add(str(extraItemId));
    for (const [cid, pc] of [...pendingCards.entries()]) {
      if (pc.entry === name) {
        cardIds.add(cid);
        for (const it of pc.items) ids.add(it);
        pendingCards.delete(cid);
      }
    }
    if (forYou && typeof forYou.list === 'function') {
      try {
        for (const it of forYou.list({ status: 'open' }) || []) {
          const aid = it && it.action ? str(it.action.id) : '';
          if (aid && cardIds.has(aid)) ids.add(str(it.id));
        }
      } catch { /* */ }
    }
    if (forYou && typeof forYou.resolve === 'function') {
      for (const itemId of ids) {
        try { forYou.resolve(itemId); } catch { /* */ }
      }
    }
  }

  function registerPendingMeta(name, rec, profileId = null, itemId = null) {
    if (!rec || !rec.pending) return null;
    const id = pendingCardIdOf(name, rec.rev);
    const kind = rec.pending.kind;
    const shown = pendingShownOf(id, name, rec.rev, kind);
    let pc = pendingCards.get(id);
    if (!pc) {
      for (const [oldId, oldPc] of [...pendingCards.entries()]) {
        if (oldPc.entry === name && oldId !== id) pendingCards.delete(oldId);
      }
      pc = { id, entry: name, rev: rec.rev, kind, shown, items: new Set(), profileId: profileId || null };
      pendingCards.set(id, pc);
    }
    if (rec.pending.itemId) pc.items.add(rec.pending.itemId);
    if (itemId) pc.items.add(str(itemId));
    if (profileId) pc.profileId = profileId;
    return pc;
  }

  function filePendingCard({ name, rec, profileId = null, conversation = '', reminder = false, onOutcome = null }) {
    if (!rec || !rec.pending) return null;
    const kind = rec.pending.kind;
    const cardId = pendingCardIdOf(name, rec.rev);
    const shown = pendingShownOf(cardId, name, rec.rev, kind);
    const state = reminder ? 'pending-remind' : (kind === 'register' ? 'pending-register' : 'pending-change');
    const w = BL.noticeWords(state, { origin: rec.origin, username: rec.username, conversation });
    let itemId = null;
    let filed = false;
    if (w && forYou && typeof forYou.add === 'function') {
      if (reminder) resolvePendingItemsForName(name, rec.pending.itemId);
      try {
        itemId = forYou.add(profileId, {
          origin: 'browser',
          kind: 'action',
          urgency: 'normal',
          text: w.text,
          detail: w.detail,
          i18n: w.i18n,
          action: { type: 'save-login', id: cardId, shown, update: kind === 'change', pending: kind },
        });
        filed = true;
      } catch (e) {
        say(`[browser-login] pending card not filed — ${e && e.message}`);
      }
    } else if (w) {
      filed = true;
    }
    registerPendingMeta(name, rec, profileId, itemId);
    if (typeof onOutcome === 'function') onOutcome({ itemId, filed });
    return itemId;
  }

  /** Remind ONCE after 7 days (`BL.PENDING_REMIND_MS`) for any unconfirmed `pending` login, recorded outside `vault.json` (0 vault writes). */
  function maybeRemindPending(profileId = null) {
    if (vstate() !== 'unlocked') return 0;
    // B-f276: HELD — nothing reminded and nothing written; the pending cards are still REGISTERED (below), so a Confirm, a Discard
    // or a fill later resolves the card an earlier run filed (the adversarial read's should: an early return left it open for good)
    const held = !!(remindHold && remindHold.held());
    if (held && !remindHeldSaid) { remindHeldSaid = true; say(`[browser-login] the pending sign-in reminders wait — ${remindHold.words()}`); }
    const t = now();
    let reminded = 0;
    let dirty = false;
    let unrevSet = null;
    try {
      const raw = typeof vault.secretNames === 'function' ? vault.secretNames() || [] : [];
      unrevSet = new Set(raw.filter((s) => s && !Number.isInteger(s.rev)).map((s) => s.name));
    } catch { unrevSet = new Set(); }
    const pendingEntries = names().filter((e) => e.pending === 'register' || e.pending === 'change' || (unrevSet && unrevSet.has(e.name)));
    if (!pendingEntries.length) return 0;
    for (const e of pendingEntries) {
      const o = open(e.name);
      if (!o.ok || !o.rec || !o.rec.pending) continue;
      const pc = registerPendingMeta(e.name, o.rec, profileId);
      if (held) continue;
      const digest = pendingRemindDigest(e.name, o.rec);
      if (!digest || !BL.shouldRemindPending(o.rec, t, { alreadyReminded: remindedDigests.has(digest) })) continue;
      let filed = false;
      filePendingCard({
        name: e.name,
        rec: o.rec,
        profileId: profileId || (pc && pc.profileId) || null,
        reminder: true,
        onOutcome: (r) => { filed = Boolean(r && r.filed); },
      });
      if (filed) {
        remindedDigests.add(digest);
        dirty = true;
        reminded++;
      }
    }
    if (dirty) saveRemindedDigests();
    return reminded;
  }

  // ── `fill --vault` PRIMITIVE RESOLUTION ──
  function resolveFill({
    tabOrigin = null,
    inFrame = false,
    skipOrigin = false,
    spec: rawSpec = '',
    generate = false,
    user = null,
    facts = {},
    conv = null,
    actor = null,
    owners = [],
    profileId = null,
    checkOnly = false,
  } = {}) {
    const vs = vstate();
    let parsed = BL.parseVaultFillSpec(rawSpec, { user, generate: !!generate, tabOrigin });
    if (!parsed.ok) return parsed;
    if (vs !== 'unlocked') {
      blocked(actor, parsed.origin || tabOrigin || '');
      return named('vault_locked', BL.LOCKED);
    }
    const allEntries = namesWithSites();   // one login, several sites: each login with the sites it keeps
    if (skipOrigin && !tabOrigin && typeof parsed.origin === 'string' && parsed.origin.startsWith('https://')) {
      const specBody = str(rawSpec).trim().replace(/^new:/i, '');
      if (!BL.hasExplicitScheme(specBody)) {
        const httpLocal = parsed.origin.replace(/^https:/, 'http:');
        if (BL.secureOrigin(httpLocal)) {
          const hasHttps = allEntries.some((e) => e.origin === parsed.origin || (Array.isArray(e.origins) && e.origins.includes(parsed.origin)));
          const localHost = BL.hostOf(httpLocal);
          const ownSetLocal = owners instanceof Set ? owners : new Set(Array.isArray(owners) ? owners.filter(Boolean) : []);
          const isAdmittedLocal = (e) => {
            if (!e) return false;
            if (e.owner && ownSetLocal.has(e.owner)) return true;
            // the login's FOUR rows on the local site it would be filled on (one login, several sites) — never the first site's three
            const there = e.origin === httpLocal || (Array.isArray(e.origins) && e.origins.includes(httpLocal)) ? httpLocal : e.origin;
            const rs = BL.loginResources(e, there).flatMap((r) => rowsOf(r) || []);
            return GM.admits(rs, facts).ok;
          };
          const httpMatches = allEntries.filter((e) => (e.origin === httpLocal || (Array.isArray(e.origins) && e.origins.includes(httpLocal)) || (localHost && BL.hostOf(e.origin) === localHost && String(e.origin || '').startsWith('http://'))) && isAdmittedLocal(e));
          if (!parsed.isNew && !hasHttps && httpMatches.length > 0) {
            // the local site itself when a login holds it (its first site or an added one — one login, several sites), else the match's own
            const targetLocal = httpMatches.some((e) => e.origin === httpLocal || (Array.isArray(e.origins) && e.origins.includes(httpLocal))) ? httpLocal : httpMatches[0].origin;
            parsed = BL.parseVaultFillSpec(rawSpec, { user, generate: !!generate, tabOrigin: targetLocal });
          } else if (parsed.isNew) {
            const httpsRows = BL.grantResources(parsed.origin, parsed.user).flatMap((r) => rowsOf(r) || []);
            const httpRows = BL.grantResources(httpLocal, parsed.user).flatMap((r) => rowsOf(r) || []);
            if (!GM.admits(httpsRows, facts).ok && GM.admits(httpRows, facts).ok) {
              parsed = BL.parseVaultFillSpec(rawSpec, { user, generate: !!generate, tabOrigin: httpLocal });
            }
          }
        }
      }
    }

    const v = BL.fillVerdict({
      tabOrigin,
      inFrame: !!inFrame,
      skipOrigin: !!skipOrigin,
      spec: parsed,
      entries: allEntries,
      grantRows: rowsOf,
      facts,
      owners,
      vaultState: vs,
    });
    if (!v.ok) {
      if (v.code === 'vault_locked') blocked(actor, parsed.origin || tabOrigin || '');
      if (v.code === 'login_not_granted') {
        const siteOrigin = v.origin || parsed.origin;
        if (siteOrigin) {
          use(`${BL.PREFIX}${siteOrigin}`, { conv, actor, outcome: 'not_granted', purpose: purposeOf(parsed.field, siteOrigin, profileId) });
        }
      }
      return v;
    }

    maybeRemindPending(profileId);

    if (v.generate) {
      if (v.isNew) {
        if (checkOnly) {
          return { ok: true, checkOnly: true, isNew: true, name: v.name, origin: v.origin, user: v.user, field: 'password', slot: 'pending', generated: true, pending: 'register' };
        }
        const g = BL.generatePassword(randomBytes);
        const rev = nextFloorRev(v.name);
        const entryGen = BL.mintEntryGen(randomBytes);
        const cardId = pendingCardIdOf(v.name, rev);
        let sealedRec = null;
        try {
          batchWrite((afterCommit) => {
            const rec = BL.newRecord({
              origin: v.origin,
              username: v.user,
              password: g.password,
              source: 'vault-minted',
              now: now(),
              conversation: actor || conv,
              pending: 'register',
              itemId: cardId,
              rev,
              entryGen,
            });
            const w = writeEntry(v.name, rec, { actor: actor || conv, owner: null });
            if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
            sealedRec = rec;
            afterCommit(() => {
              const itemId = filePendingCard({ name: v.name, rec, profileId, conversation: actor || '', reminder: false });
              if (itemId) registerPendingMeta(v.name, rec, profileId, itemId);
            });
          });
        } catch (err) {
          const c = str(err && err.code);
          if (c === 'vault_locked') { blocked(actor, v.origin); return named('vault_locked', 'the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page; no account was registered (do not ask them to)'); }
          return named('not_written', `the new login could not be saved (${(err && err.message) || c || 'not_written'}) — nothing was filled`);
        }
        return {
          ok: true,
          name: v.name,
          origin: v.origin,
          user: v.user,
          field: 'password',
          slot: 'pending',
          secret: true,
          value: g.password,
          generated: true,
          pending: 'register',
          rev: sealedRec.rev,
          entryGen: sealedRec.entryGen,
          scrubSecrets: BL.scrubSecretsOf(sealedRec, { minBytes: 1, includePrevious: true }),
          noteFillUse: () => use(v.name, { conv, actor, outcome: 'generated-and-filled', purpose: purposeOf('password', v.origin, profileId) }),
          rollbackGenerate: () => rollbackGeneratedPending(v.name, sealedRec.rev),
        };
      }

      // Change password (`<entry>/password --generate`) on an existing entry.
      const o = open(v.name);
      if (!o.ok || !o.rec) {
        if (o.code === 'vault_locked') { blocked(actor, v.origin); return named('vault_locked', BL.LOCKED); }
        return named('login_no_entry', `the login for ${v.user} on ${v.origin} could not be read — nothing was changed`);
      }
      if (o.rec.pending) {
        return BL.mintChangeRecord(o.rec, 'check');
      }
      if (checkOnly) {
        return { ok: true, checkOnly: true, isNew: false, name: v.name, origin: v.origin, user: v.user, field: 'password', slot: 'pending', generated: true, pending: 'change' };
      }
      const g = BL.generatePassword(randomBytes);
      const baseRec = o.rec.entryGen ? o.rec : { ...o.rec, entryGen: BL.mintEntryGen(randomBytes) };
      const cardId = pendingCardIdOf(v.name, baseRec.rev + 1);
      const mc = BL.mintChangeRecord(baseRec, g.password, { now: now(), conversation: actor || conv, itemId: cardId });
      if (!mc.ok) return mc;
      try {
        batchWrite((afterCommit) => {
          const w = writeEntry(v.name, mc.record, {
            actor: actor || (v.entry && v.entry.actor) || conv,
            owner: (v.entry && v.entry.owner) || null,
          });
          if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
          afterCommit(() => {
            const itemId = filePendingCard({ name: v.name, rec: mc.record, profileId, conversation: actor || '', reminder: false });
            if (itemId) registerPendingMeta(v.name, mc.record, profileId, itemId);
          });
        });
      } catch (err) {
        const c = str(err && err.code);
        if (c === 'vault_locked') { blocked(actor, v.origin); return named('vault_locked', BL.LOCKED); }
        return named('not_written', `the new pending password could not be saved (${(err && err.message) || c || 'not_written'}) — nothing was filled`);
      }
      return {
        ok: true,
        name: v.name,
        origin: v.origin,
        user: v.user,
        field: 'password',
        slot: 'pending',
        secret: true,
        value: g.password,
        generated: true,
        pending: 'change',
        rev: mc.record.rev,
        entryGen: mc.record.entryGen || null,
        scrubSecrets: BL.scrubSecretsOf(mc.record, { minBytes: 1, includePrevious: true }),
        noteFillUse: () => use(v.name, { conv, actor, outcome: 'generated-and-filled', purpose: purposeOf('password', v.origin, profileId) }),
        rollbackGenerate: () => rollbackGeneratedPending(v.name, mc.record.rev),
      };
    }

    // Existing entry slot fill (`user | password | previous | pending | otp`).
    const o = open(v.name);
    if (!o.ok || !o.rec) {
      if (o.code === 'vault_locked') { blocked(actor, v.origin); return named('vault_locked', BL.LOCKED); }
      return named('login_no_entry', `the login for ${v.user} on ${v.origin} could not be read — nothing was filled`);
    }

    if (v.field === 'otp') {
      if (!o.rec.totpName || typeof totpCode !== 'function') {
        return named('login_no_otp', `no two-step code is paired with ${v.user} on ${v.origin} — ask the owner to pair one in the Vault window or provide the code via vibespace-ask`);
      }
      const ownSet = owners instanceof Set ? owners : new Set(Array.isArray(owners) ? owners.filter(Boolean) : []);
      const isOwn = !!(v.entry && v.entry.owner && ownSet.has(v.entry.owner));
      if (checkOnly) {
        let tl = [];
        try { tl = vault.secretNames() || []; } catch { tl = []; }
        const totpEntry = tl.find((s) => s && s.name === `totp:${str(o.rec.totpName)}`);
        if (!totpEntry || (isOwn && (!totpEntry.owner || !ownSet.has(totpEntry.owner)))) {
          return named('login_no_otp', `the paired two-step code (${o.rec.totpName}) could not be opened — ask the owner in the Vault window`);
        }
        return { ok: true, checkOnly: true, name: v.name, origin: v.origin, user: v.user, field: 'otp', slot: 'otp', generated: false, pending: o.rec.pending ? o.rec.pending.kind : null };
      }
      let c = null;
      try { c = totpCode(o.rec.totpName, { conv, ...(isOwn ? { owners: [...ownSet] } : {}) }); } catch { c = null; }
      if (!c || !c.ok || !c.code) {
        if (c && (c.code === 'paced' || c.code === 'code_paced')) {
          const retryInMs = Math.max(1, Number(c.retryInMs) || 1000);
          const secondsLeft = Math.max(1, Number(c.secondsLeft) || Math.ceil(retryInMs / 1000));
          return {
            ok: false,
            code: 'code_paced',
            retryInMs,
            secondsLeft,
            error: c.error || c.why || `too many two-step codes requested in the last minute — wait ${secondsLeft} seconds, then try again`,
          };
        }
        return named('login_no_otp', `the paired two-step code (${o.rec.totpName}) could not be opened — ask the owner in the Vault window`);
      }
      const otpStr = String(c.code);
      return {
        ok: true,
        name: v.name,
        origin: v.origin,
        user: v.user,
        field: 'otp',
        slot: 'otp',
        secret: true,
        value: otpStr,
        generated: false,
        pending: o.rec.pending ? o.rec.pending.kind : null,
        rev: null,
        entryGen: o.rec.entryGen || null,
        scrubSecrets: [...BL.scrubSecretsOf(o.rec, { minBytes: 1, includePrevious: true }), otpStr],
        noteFillUse: () => use(v.name, { conv, actor, outcome: 'filled', purpose: purposeOf('otp', v.origin, profileId) }),
      };
    }

    const sv = BL.resolveSlotValue(o.rec, v.field, { origin: v.origin });   // the user name THIS site signs in under
    if (!sv.ok) return sv;
    if (checkOnly) {
      return { ok: true, checkOnly: true, name: v.name, origin: v.origin, user: v.user, field: v.field, slot: sv.slot, generated: false, pending: o.rec.pending ? o.rec.pending.kind : null };
    }

    // A4: Reading / filling a legacy (`schema: 1`) record NEVER rewrites or mutates it in the vault (`0` `secretPut` calls);
    // only genuine write operations (`addOwn`, `addAgent`, `--generate`, `confirmOwn`, `discardPending`) upgrade the record.
    const recActive = o.rec;

    return {
      ok: true,
      name: v.name,
      origin: v.origin,
      user: v.user,
      field: v.field,
      slot: sv.slot,
      secret: sv.secret,
      value: sv.value,
      generated: false,
      pending: recActive.pending ? recActive.pending.kind : null,
      rev: sv.secret ? recActive.rev : null,
      entryGen: recActive.entryGen || null,
      scrubSecrets: BL.scrubSecretsOf(recActive, { minBytes: 1, includePrevious: true }),
      noteFillUse: () => use(v.name, { conv, actor, outcome: 'filled', purpose: purposeOf(v.field, v.origin, profileId) }),
    };
  }

  // ── OWNER CONFIRM & DISCARD DOORS («只有人能转正») ──
  function confirmOwn(name, { rev = undefined, who = null } = {}) {
    const p = BL.parseName(name);
    if (!p) return named('not_found', 'no such web login');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then confirm');
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    if (rev !== undefined && rev !== null && Number(rev) !== o.rec.rev) {
      return named('card_changed', 'that login changed after it was shown — nothing was promoted; read it again');
    }
    const cf = BL.confirmPendingRecord(o.rec, { now: now() });
    if (!cf.ok) return cf;
    try {
      batchWrite((afterCommit) => {
        const w = writeEntry(name, cf.record);
        if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
        afterCommit(() => {
          resolvePendingItemsForName(name, cf.itemId);
          try { vault.audit?.('vault-web-login-confirmed', { why: name, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
        });
      });
    } catch (err) {
      const c = str(err && err.code) || 'not_written';
      return named(c === 'vault_locked' ? 'vault_locked' : 'not_written', (err && err.message) || c);
    }
    return { ok: true, name, confirmed: true, kind: cf.kind, updated: cf.kind === 'change' };
  }

  function discardPending(name, { rev = undefined, who = null } = {}) {
    const p = BL.parseName(name);
    if (!p) return named('not_found', 'no such web login');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then discard');
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    if (rev !== undefined && rev !== null && Number(rev) !== o.rec.rev) {
      return named('card_changed', 'that login changed after it was shown — nothing was discarded; read it again');
    }
    const dc = BL.discardPendingRecord(o.rec);
    if (!dc.ok) return dc;
    try {
      batchWrite((afterCommit) => {
        if (dc.dropEntry) {
          const r = vault.secretDrop(name);
          if (r && r.ok === false) throw Object.assign(new Error(r.error || r.code || 'not_written'), { code: r.code || 'not_written' });
        } else {
          const w = writeEntry(name, dc.record);
          if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
        }
        afterCommit(() => {
          resolvePendingItemsForName(name, dc.itemId);
          if (dc.dropEntry) {
            try {
              const g = store();
              if (g && g.rowsFor(BL.DOOR, `${p.origin}#${p.user}`).length) g.remove(BL.DOOR, `${p.origin}#${p.user}`, 'user');
            } catch (e) { say(`[browser-login] ${name}: its grant row was not removed — ${e && e.message}`); }
          }
          try { vault.audit?.('vault-web-login-discarded', { why: name, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
        });
      });
    } catch (err) {
      const c = str(err && err.code) || 'not_written';
      return named(c === 'vault_locked' ? 'vault_locked' : 'not_written', (err && err.message) || c);
    }
      return { ok: true, name, discarded: true, dropped: dc.dropEntry, kind: dc.kind };
    }

  function rollbackGeneratedPending(name, expectedRev) {
    if (!BL.isEntryName(name) || vstate() !== 'unlocked') return { ok: false };
    const o = open(name);
    if (!o.ok || !o.rec || !o.rec.pending || Number(o.rec.rev) !== Number(expectedRev)) return { ok: false };
    const dc = BL.discardPendingRecord(o.rec);
    if (!dc.ok) return { ok: false };
    try {
      batchWrite((afterCommit) => {
        if (dc.dropEntry) {
          const r = vault.secretDrop(name);
          if (r && r.ok === false) throw Object.assign(new Error(r.error || r.code || 'not_written'), { code: r.code || 'not_written' });
        } else {
          const w = writeEntry(name, dc.record);
          if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
        }
        afterCommit(() => {
          resolvePendingItemsForName(name, dc.itemId);
        });
      });
    } catch {
      return { ok: false };
    }
    return { ok: true, dropped: dc.dropEntry, kind: dc.kind };
  }

  // ── THE OWNER'S SAVE-LOGIN CARD (human takeover submission + pending Confirm/Discard card) ──
  const shownOf = (c) => crypto.createHash('sha256').update(`${c.id}\u0000${c.name}\u0000${c.existing ? 'update' : 'new'}`).digest('hex').slice(0, 16);
  function offerOwnerSaveCard({ origin, username, password, profileId = null } = {}) {
    const o = BL.originOf(origin);
    if (!o || !BL.secureOrigin(o)) {
      say(`[browser-login] save-login card refused on ${str(origin).slice(0, 120) || 'none'} (login_bad_origin: not an https site)`);
      return named('login_bad_origin', 'not an https site');
    }
    let n = BL.entryName(o, username);
    if (!n || typeof password !== 'string' || !password) {
      const why = !n ? 'missing or invalid username' : 'missing password';
      say(`[browser-login] save-login card refused on ${o} (bad_request: ${why})`);
      return named('bad_request', 'missing username or password');
    }
    let ex = vstate() === 'unlocked' ? open(n) : { ok: false };
    // one pair, one login: a hand sign-in on a site another login HOLDS (an added site) is that login's — the card offers its UPDATE
    // (or nothing when the password is the same), never a new login the save would refuse
    const holder = ex.ok && !ex.rec ? pairHolder(n, o, username) : null;
    if (holder) { const hx = open(holder.name); if (hx.ok && hx.rec) { n = holder.name; ex = hx; } }
    const existing = !!(ex.ok && ex.rec);
    if (existing && ex.rec.current && ex.rec.current.password === password) return { ok: true, same: true };
    for (const c of cards.values()) if (c.name === n) dropCard(c.id);
    while (cards.size >= CARDS_MAX) dropCard(cards.keys().next().value);
    const id = 'sl-' + crypto.randomBytes(4).toString('hex');
    const c = { id, name: n, origin: o, username: str(username).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120), password, existing, at: now(), item: null, timer: null };
    c.shown = shownOf(c);
    const site = BL.hostOf(o) || o;
    const text = existing ? 'Update the saved login {user} on {site}?' : 'Save the login {user} on {site} to the vault?';
    const others = holder && existing ? BL.sitesOf(ex.rec).map((x) => BL.hostOf(x.origin) || x.origin) : null;   // one login, several sites: the update reaches each
    const detail = others && others.length > 1 ? 'You signed in on {site} with a different password. {site} is one of this login\'s sites ({sites}) — Update changes its one password for every one of them and keeps the old one for one revision.'
      : existing ? 'You signed in with a different password in the agent browser. Update keeps the old one in the entry for one revision.' : 'You signed in by hand in the agent browser. Saved logins can be filled on that site for conversations you allow — VibeSpace never hands them the password, and its fence guards against accidental reads and wrong sites.';
    if (forYou && typeof forYou.add === 'function') {
      try { c.item = forYou.add(profileId, { origin: 'browser', kind: 'action', urgency: 'normal', text: text.replace('{user}', c.username).replace('{site}', site), detail: others && others.length > 1 ? detail.split('{site}').join(site).replace('{sites}', others.join(', ')) : detail, i18n: { text: { key: text, params: { user: c.username, site } }, detail: [others && others.length > 1 ? { key: detail, params: { site, sites: others.join(', ') } } : { key: detail }] }, action: { type: 'save-login', id, shown: c.shown, update: !!existing } }); } catch (e) { say(`[browser-login] the save card was not filed — ${e && e.message}`); }
    }
    c.timer = setTimeout(() => dropCard(id), cardMs);
    if (c.timer.unref) c.timer.unref();
    cards.set(id, c);
    return { ok: true, id, shown: c.shown, update: !!existing };
  }

  function dropCard(id) {
    const c = cards.get(id);
    if (!c) return false;
    cards.delete(id);
    clearTimeout(c.timer);
    c.password = null;
    if (c.item && forYou && typeof forYou.resolve === 'function') { try { forYou.resolve(c.item); } catch { /* */ } }
    return true;
  }

  function findPendingCard(cardId) {
    const id = str(cardId);
    if (pendingCards.has(id)) return pendingCards.get(id);
    for (const e of names()) {
      const rev = Number.isInteger(e.rev) && e.rev > 0 ? e.rev : 1;
      if (!e.pending && pendingCardIdOf(e.name, rev) !== id) continue;
      if (pendingCardIdOf(e.name, rev) === id) {
        if (vstate() === 'unlocked') {
          const o = open(e.name);
          if (o.ok && o.rec && o.rec.pending) return registerPendingMeta(e.name, o.rec);
          return null;
        }
        if (e.pending) {
          return { id, entry: e.name, rev, kind: e.pending, shown: pendingShownOf(id, e.name, rev, e.pending), items: new Set(), profileId: null };
        }
      }
    }
    return null;
  }

  function answerCard(id, { approve = false, shown = null, who = null } = {}) {
    const c = cards.get(str(id));
    if (c) {
      if (str(shown) !== c.shown) return named('card_changed', 'that card changed after it was shown — nothing was saved; read it again');
      if (!approve) { dropCard(c.id); return { ok: true, saved: false }; }
      if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then save');
      const ex = open(c.name);
      if (!ex.ok) return named(ex.code, ex.error);
      const holder = ex.rec ? null : pairHolder(c.name, c.origin, c.username);
      if (holder) return heldPair(holder, c.origin, c.username);
      const rec = ex.rec
        ? BL.ownerUpdatedRecord(ex.rec, c.password, { now: now() })
        : BL.newRecord({ origin: c.origin, username: c.username, password: c.password, source: 'owner', now: now(), rev: nextFloorRev(c.name), entryGen: BL.mintEntryGen(randomBytes) });
      const w = writeEntry(c.name, rec);
      if (!w.ok) return w;
      dropCard(c.id);
      return { ok: true, saved: true, name: c.name, updated: !!ex.rec };
    }

    const pc = findPendingCard(id);
    if (!pc) {
      if (vstate() !== 'unlocked' && /^sl-[0-9a-f]{8}$/.test(str(id))) {
        return named('vault_locked', 'the vault is locked — unlock it, then confirm or discard');
      }
      return named('card_gone', 'that card is no longer open — nothing was changed');
    }
    if (str(shown) !== pc.shown) return named('card_changed', 'that card changed after it was shown — nothing was saved; read it again');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then confirm or discard');
    if (approve) {
      const r = confirmOwn(pc.entry, { who });
      return r.ok ? { ok: true, saved: true, confirmed: true, name: pc.entry, updated: !!r.updated } : r;
    }
    const r = discardPending(pc.entry, { who });
    return r.ok ? { ok: true, saved: false, discarded: true, dropped: !!r.dropped, name: pc.entry } : r;
  }

  function cardOf(id) {
    const c = cards.get(str(id));
    if (c) return { id: c.id, name: c.name, shown: c.shown, update: c.existing };
    const pc = findPendingCard(id);
    return pc ? { id: pc.id, name: pc.entry, shown: pc.shown, update: pc.kind === 'change', pending: pc.kind } : null;
  }

  // ── THE OWNER'S DOORS (the Vault window) ──
  function list({ subjects = null } = {}) {
    const st = vstate();
    const g = store();
    // «by what» (the owner 2026-11-17): each login answers which scope admits each subject, by the fill's own rule (src/browser-login.js
    // byWhatOf over the same rows the fill reads) — the dialogs draw it, never a second test
    const byWhatSubjects = subjects ? BL.byWhatSubjects(subjects) : null;
    const rawAt = (r) => (g ? g.rowsFor(BL.DOOR, r) : []);
    if (st === 'unlocked') maybeRemindPending();
    const rowsAt = (r, site = null) => {
      const rows = g ? g.rowsFor(BL.DOOR, r) : [];
      return rows.map((x) => ({ resource: r, scope: BL.scopeOf(r), site, ...GM.publicRow(x) }));
    };
    const wild = rowsAt('*');
    return {
      ok: true,
      state: st,
      entries: st === 'locked'
        ? []
        : names().map((e) => {
          const o = st === 'unlocked' ? open(e.name) : null;
          const pub = o && o.ok && o.rec ? BL.publicOf(o.rec) : null;
          return {
            ...e,
            ...(pub ? {
              hasCurrent: pub.hasCurrent,
              hasPrevious: pub.hasPrevious,
              pending: pub.pending,
              ...(pub.pendingCreatedAt != null ? { pendingCreatedAt: pub.pendingCreatedAt } : {}),
              ...(pub.previousReplacedAt != null ? { previousReplacedAt: pub.previousReplacedAt } : {}),
              ...(pub.totpName ? { totpName: pub.totpName } : {}),
              ...(BL.sitesOf(o.rec).length > 1 ? { sites: BL.sitesOf(o.rec).slice(1) } : {}),   // one login, several sites: its added sites, each with the name it signs in under
            } : {}),
            // one login, several sites: the rows for EVERY site of it, each with the site it belongs to (after a merge the kept rows are seen and removable)
            grants: [...rowsAt(`${e.origin}#${e.user}`, e.origin), ...rowsAt(`${e.origin}#*`, e.origin),
              ...(o && o.ok && o.rec ? BL.sitesOf(o.rec).slice(1).flatMap((x) => [...rowsAt(`${x.origin}#${BL.userOf(x.user)}`, x.origin), ...rowsAt(`${x.origin}#*`, x.origin)]) : []), ...wild],
            ...(byWhatSubjects ? { byWhat: BL.byWhatOf({ rows: { thisAccount: rawAt(`${e.origin}#${e.user}`), anyAccount: rawAt(`${e.origin}#*`), anySite: rawAt('*') }, subjects: byWhatSubjects }) } : {}),
          };
        }),
    };
  }

  // B-ab6c (the owner 2026-11-26, lane login-request-card): `expect` — what the PERSON's form means. 'new' (the Add dialog, the new-login
  // card): a site and user name that name a login already here is NOT saved over in silence: refused login_would_update with the
  // site and user, nothing written, so the form says it before the save. 'update' (Change password…, the update card): saved only
  // over the login that is there (the old password kept as previous), never a new one: refused login_gone. Absent: the release's road.
  function addOwn({ origin, username, password, totpName = null, notes = '', expect = null } = {}, { who = null } = {}) {
    const o = BL.originOf(origin);
    if (!o) return named('login_bad_origin', 'a website address (https://host[:port])');
    if (!BL.secureOrigin(o)) return named('login_bad_origin', 'a login is kept for an https site (plain http on this machine\'s localhost only)');
    const n = BL.entryName(o, username);
    if (!n) return named('login_bad_user', 'a user name (no spaces, no #)');
    if (typeof password !== 'string' || !password || password.length > 4096) return named('value_required', 'the password');
    if (totpName && !/^[\w.-]{1,120}$/.test(str(totpName))) return named('bad_totp', 'a two-step entry name from the Vault (letters, digits, . _ -)');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then save');
    if (totpName) {
      let tl = [];
      try { tl = typeof vault.secretNames === 'function' ? vault.secretNames() || [] : []; } catch { tl = []; }
      if (!tl.some((s) => s && s.name === `totp:${str(totpName)}`)) {
        return named('bad_totp', `no two-step entry "${str(totpName).slice(0, 120)}" in the Vault — add it first under Two-step codes`);
      }
    }
    const ex = open(n);
    if (!ex.ok) return ex;
    if (expect === 'new' && ex.rec) return named('login_would_update', 'a login for this site and user name is already in the vault — saving changes its password (the current one is kept as previous); to keep a separate login, change the user name', { site: o, user: str(username).trim(), name: n });
    if (expect === 'update' && !ex.rec) return named('login_gone', 'that login is no longer in the vault — nothing was saved', { name: n });
    const holder = ex.rec ? null : pairHolder(n, o, username);
    if (holder) return heldPair(holder, o, username);
    const baseEx = ex.rec && !ex.rec.entryGen ? { ...ex.rec, entryGen: BL.mintEntryGen(randomBytes) } : ex.rec;
    const rec = baseEx
      ? BL.ownerUpdatedRecord({ ...baseEx, username: str(username).trim(), ...(notes ? { notes } : {}) }, password, { ...(totpName ? { totpName } : {}), now: now() })
      : BL.newRecord({ origin: o, username, password, totpName, notes, source: 'owner', now: now(), rev: nextFloorRev(n), entryGen: BL.mintEntryGen(randomBytes) });
    const prevPendingItemId = ex.rec && ex.rec.pending ? ex.rec.pending.itemId : null;
    const w = writeEntry(n, rec, { actor: null, owner: null });
    if (!w.ok) return w;
    resolvePendingItemsForName(n, prevPendingItemId);
    try { vault.audit?.('vault-web-login-saved', { why: n, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name: n, updated: !!ex.rec };
  }

  /** B-ab6c: «Use the previous password» — the PERSON's swap (the row's door, a press): `current` ⇄ `previous`, rev+1, ONE audit line
   *  (the entry, never a value). `rev` (the row's) guards a login that changed after it was shown. */
  function usePrevious(name, { rev = undefined, who = null } = {}) {
    if (!BL.parseName(name)) return named('not_found', 'no such web login');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then press again');
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    if (rev !== undefined && rev !== null && Number(rev) !== o.rec.rev) return named('card_changed', 'that login changed after it was shown — nothing was swapped; read it again');
    const rec = BL.previousSwappedRecord(o.rec, { now: now() });
    if (!rec) return named('login_no_previous', 'this login keeps no previous password');
    const w = writeEntry(name, rec, { actor: null, owner: null });
    if (!w.ok) return w;
    try { vault.audit?.('vault-web-login-previous-used', { why: name, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name, rev: rec.rev };
  }

  /** A login's two-step code BOUND or UNBOUND by the PERSON (the Vault window's row and the top of its 用于… dialog — the owner
   *  2026-11-17: «比如绑定了哪个两步验证码»): a name this vault holds, or none (null / ''). The password, its slots and `rev` stay as
   *  they are (BL.totpBoundRecord); ONE audit line, the entry and the name — never a code. */
  function bindTotp(name, totpName = null, { who = null } = {}) {
    if (!BL.parseName(name)) return named('not_found', 'no such web login');
    const want = totpName == null ? '' : str(totpName).trim();
    if (want && !/^[\w.-]{1,120}$/.test(want)) return named('bad_totp', 'a two-step entry name from the Vault (letters, digits, . _ -)');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then save');
    if (want) {
      let tl = [];
      try { tl = typeof vault.secretNames === 'function' ? vault.secretNames() || [] : []; } catch { tl = []; }
      if (!tl.some((s) => s && s.name === `totp:${want}`)) return named('bad_totp', `no two-step entry "${want.slice(0, 120)}" in the Vault — add it first under Two-step codes`);
    }
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    if (str(o.rec.totpName) === want) return { ok: true, name, totpName: want || null, changed: false };
    const rec = BL.totpBoundRecord(o.rec, want || null);
    if (!rec) return named('bad-record', 'not a web-login record');
    const w = writeEntry(name, rec);
    if (!w.ok) return w;
    try { vault.audit?.('vault-web-login-totp', { why: name, by: 'human', who: who ? str(who).slice(0, 40) : null, totp: want || null }); } catch { /* */ }
    return { ok: true, name, totpName: want || null, changed: true };
  }

  function addAgent({ origin, username, password, totpName = null } = {}, { owner = null, actor = null } = {}) {
    const o = BL.originOf(origin);
    if (!o) return named('login_bad_origin', 'a website address (https://host[:port])');
    if (!BL.secureOrigin(o)) return named('login_bad_origin', 'a login is kept for an https site (plain http on this machine\'s localhost only)');
    const n = BL.entryName(o, username);
    if (!n) return named('login_bad_user', 'a user name (no spaces, no #)');
    if (typeof password !== 'string' || !password || password.length > 4096) return named('value_required', 'the password (a 0600 file or stdin)');
    if (totpName && !/^[\w.-]{1,120}$/.test(str(totpName))) return named('bad_totp', 'a two-step entry name from the Vault (letters, digits, . _ -)');
    if (!owner) return named('unauthorized', 'the calling conversation has no id yet — send it one message first');
    if (vstate() !== 'unlocked') { blocked(actor, o); return named('vault_locked', BL.LOCKED); }
    if (totpName) {
      let tl = [];
      try { tl = vault.secretNames() || []; } catch { tl = []; }
      const t = tl.find((s) => s && s.name === `totp:${str(totpName)}`);
      if (!t || !t.owner || t.owner !== str(owner)) {
        return named('bad_totp', `pair only a two-step entry this conversation added itself (vibespace-vault totp add ${str(totpName).slice(0, 120)}) — another one stays the user's`);
      }
    }
    const ex = open(n);
    if (!ex.ok) return ex;
    const user = BL.parseName(n).user;
    if (ex.rec) {
      return named('login_exists', `a login for ${user} on ${o} is already in the vault — fill it with vibespace-browser fill @ref --vault ${o}#${user}/password`);
    }
    const holder = pairHolder(n, o, user);
    if (holder) return named('login_exists', `a login for ${user} on ${o} is already in the vault (a site of another login) — fill it with vibespace-browser fill @ref --vault ${o}#${user}/password`, { other: holder.name });
    const rec = BL.newRecord({
      origin: o,
      username: str(username).trim(),
      password,
      source: 'agent-typed',
      now: now(),
      conversation: actor || owner,
      rev: nextFloorRev(n),
      entryGen: BL.mintEntryGen(randomBytes),
      ...(totpName ? { totpName: str(totpName) } : {}),
    });
    const w = writeEntry(n, rec, { actor: actor || owner, owner });
    if (!w.ok) return w;
    try { vault.audit?.('vault-web-login-saved', { why: n, by: 'agent', who: actor ? str(actor).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name: n, origin: o, user };
  }

  function drop(name, { who = null } = {}) {
    const p = BL.parseName(name);
    if (!p) return named('not_found', 'no such web login');
    // one login, several sites: a locked vault cannot read which sites the login holds, so their own grant rows could not go with it —
    // refused by name (a later login for one of those pairs must never inherit a row)
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then remove the login (its sites\' own grant rows go with it)');
    const ex = open(name);
    const prevPendingItemId = ex && ex.ok && ex.rec && ex.rec.pending ? ex.rec.pending.itemId : null;
    // THE ROWS FIRST, each answer read (the store never throws on a failed write): a stop between loses a grant, never leaves one behind
    const own = [`${p.origin}#${p.user}`, ...(ex && ex.ok && ex.rec ? BL.sitesOf(ex.rec).slice(1).map((x) => `${x.origin}#${BL.userOf(x.user)}`) : [])];   // + its added sites' own rows (one login, several sites)
    const gone = [];   // the rows already removed — a refusal after them says so (lost permissions are named)
    const goneWords = () => (gone.length ? `; its grant row${gone.length === 1 ? '' : 's'} ${gone.join(', ')} ${gone.length === 1 ? 'was' : 'were'} removed already` : '');
    for (const res of own) {
      let rr = null;
      try { const g = store(); if (g && g.rowsFor(BL.DOOR, res).length) rr = g.remove(BL.DOOR, res, 'user'); } catch (e) { rr = { ok: false, error: e && e.message }; }
      if (rr && rr.ok === false) return named(rr.code || 'not_written', `the login's grant row ${res} could not be removed (${rr.error || 'not written'}) — the login was not removed${goneWords()}`);
      if (rr && rr.ok) gone.push(res);
    }
    const r = vault.secretDrop(name);
    if (r && r.ok === false) return named(r.code || 'not_written', `${r.error || 'not removed'} — the login was not removed${goneWords()}`);
    resolvePendingItemsForName(name, prevPendingItemId);
    try { vault.audit?.('vault-web-login-removed', { why: name, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name };
  }

  // ── ONE LOGIN, SEVERAL SITES (lane login-request-card, the owner 2026-11-17; 主开发 20:05Z): the person's add and remove at the
  //    login's row, the merge of two logins that are one account — THIS store's writes (writeEntry), each audited, never a secret
  //    shown, logged or compared. THE GRANT FOLLOWS THE LOGIN: `siteWordsFor` says BY NAME, before the press, who may then have it
  //    filled on the new site (the login's own row, and by their own rows «any account on that site» / «any site»).
  const principalsAt = (resource) => { const [row] = rowsOf(resource); const pub = row ? GM.publicRow(row) : null; return pub && !pub.unknown ? (pub.to || []) : []; };
  // the same public row's EXCEPTIONS (主开发 13:02Z: «Release crew, except X» — the owner asked for exceptions by name)
  const exceptAt = (resource) => { const [row] = rowsOf(resource); const pub = row ? GM.publicRow(row) : null; return pub && !pub.unknown ? (pub.except || []) : []; };
  /** The grant pickers' subjects (the Vault window's chips: `{sessions:[{subject:'session:<cid>', name}], groups:[{subject:'group:<id>', name}]}`)
   *  → the roster GM.namesNow reads — so the words before the press name each principal as the person's chips do (主开发 12:17Z, the
   *  use door's must: a stored principal carries no name — a group's none at all). */
  const rosterOf = (subjects) => {
    const sj = subjects && typeof subjects === 'object' ? subjects : {};
    const tail = (x, head) => { const v = str(x && x.subject); return v.startsWith(head) ? v.slice(head.length) : ''; };
    return {
      // id = its PAGE id when the subject carries it: a grant written under `webui:<id>` names a running conversation too (13:02Z (2))
      sessions: (Array.isArray(sj.sessions) ? sj.sessions : []).map((x) => { const cid = tail(x, 'session:'); return cid ? { id: str(x.webuiId) || cid, name: str(x.name), backendSessionId: cid } : null; }).filter(Boolean),
      groups: (Array.isArray(sj.groups) ? sj.groups : []).map((x) => { const id = tail(x, 'group:'); return id ? { id, name: str(x.name) } : null; }).filter(Boolean),
    };
  };
  function siteWordsFor(name, site, { user = '', subjects = null } = {}) {
    const p = BL.parseName(name);
    if (!p) return named('not_found', 'no such web login');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then add the site');
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    const w = BL.siteWords(o.rec, site, { decode: (h) => { try { return require('node:url').domainToUnicode(h); } catch { return null; } } });
    if (!w) return named('login_bad_origin', 'a website address (https://host[:port]) — exactly the site');
    // every principal NAMED by the roster (a live conversation's / a listed group's current name; an absent one keeps its id and is
    // marked absent — never dropped); the owner too. `there` = the name the login already signs in under on that site (null: not one
    // of its sites yet) — the card says it, and the answer refuses a different typed name by name
    const roster = rosterOf(subjects), named2 = (list) => GM.namesNow(list, roster);
    const owner = (metaOf(name) || {}).owner;
    const ownerName = owner ? (named2([{ kind: 'conversation', key: str(owner) }])[0] || {}).name || null : null;
    return { ok: true, name, ...w, user: str(user).trim() || o.rec.username, there: BL.userOnSite(o.rec, w.site),
      widens: { login: named2(principalsAt(`${p.origin}#${p.user}`)), anyAccount: named2(principalsAt(`${w.site}#*`)), anySite: named2(principalsAt('*')),
        except: { login: named2(exceptAt(`${p.origin}#${p.user}`)), anyAccount: named2(exceptAt(`${w.site}#*`)), anySite: named2(exceptAt('*')) },   // each row's exceptions, named the same way
        ...(owner ? { owner, ...(ownerName ? { ownerName } : {}) } : {}) } };   // its owner fills with no grant at all
  }
  function addSite(name, { site, user = '' } = {}, { who = null } = {}) {
    if (!BL.parseName(name)) return named('not_found', 'no such web login');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then add the site');
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    const v = BL.addSiteVerdict({ rec: o.rec, name, site, user, entries: namesWithSites() });
    if (!v.ok) return v;
    const w = writeEntry(name, { ...v.record, rev: v.record.rev + 1 });
    if (!w.ok) return w;
    try { vault.audit?.('vault-web-login-site-added', { why: name, site: v.origin, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name, site: v.origin, user: v.user };
  }
  function removeSite(name, site, { who = null } = {}) {
    if (!BL.parseName(name)) return named('not_found', 'no such web login');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then remove the site');
    const o = open(name);
    if (!o.ok) return o;
    if (!o.rec) return named('not_found', 'no such web login');
    const there = BL.userOnSite(o.rec, BL.originOf(site));
    const v = BL.removeSiteVerdict(o.rec, site);
    if (!v.ok) return v;
    // the site's own row (a merged login's grants named it) goes with the site — a later login holding that pair must not inherit it.
    // The ROW FIRST (主开发 23:01Z (b)): a stop between the two writes then leaves a site without its own row (a grant lost, said),
    // never a row a later login inherits
    const res = `${v.origin}#${BL.userOf(there)}`;
    let rowGone = false;
    try {
      const g = store();
      if (g && g.rowsFor(BL.DOOR, res).length) {
        // the grants store answers a failed write as {ok:false} (the row put back) — it never throws: read its answer
        const rr = g.remove(BL.DOOR, res, 'user');
        if (!rr || rr.ok === false) return named((rr && rr.code) || 'not_written', `the site's own grant row ${res} could not be removed (${(rr && rr.error) || 'not written'}) — nothing was changed`);
        rowGone = true;
      }
    } catch (e) { return named('not_written', `the site's own grant row ${res} could not be removed (${e && e.message}) — nothing was changed`); }
    const w = writeEntry(name, { ...v.record, rev: v.record.rev + 1 });
    if (!w.ok) return rowGone ? { ...w, error: `${w.error || w.code} — the site's own grant row ${res} was removed already; the site stays on the login` } : w;
    try { vault.audit?.('vault-web-login-site-removed', { why: name, site: v.origin, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name, site: v.origin, ...(rowGone ? { grantRemoved: res } : {}) };
  }
  /** THE MERGE'S PLAN (主开发 23:01Z, must 2): the verdict, and what it CHANGES — said before the press (mergeWordsFor) and in its answer:
   *  the sites that join, the other's two-step code dropped when both have one (by name), the other login's own conversation that loses
   *  its no-grant fill there (an agent stored it), and BY NAME who may then have the kept login filled on the joined sites (its own
   *  row). A MERGE NEVER DESTROYS THE ONLY COPY OF A SECRET: the other login holding a pending value (a change nobody confirmed —
   *  maybe the only live copy of that site's password) is refused by name, nothing changed. */
  function mergePlan(keepName, otherName) {
    if (!BL.parseName(keepName) || !BL.parseName(otherName)) return named('not_found', 'two web logins by name');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then merge');
    const k = open(keepName), x = open(otherName);
    if (!k.ok) return k;
    if (!x.ok) return x;
    if (!k.rec || !x.rec) return named('not_found', 'no such web login');
    if (x.rec.pending) return named('login_pending_exists', `${otherName} has a password waiting for your confirmation — confirm or discard it at its row first, then merge; nothing was changed`);
    // the KEPT login must hold a confirmed password: a registration waiting for confirmation would drop the other's confirmed secret
    if (!k.rec.current) return named('login_pending_exists', `${keepName} has no confirmed password yet (a registration waiting for your confirmation) — confirm it at its row first, then merge; nothing was changed`);
    const v = BL.mergeVerdict({ keep: k.rec, keepName, other: x.rec, otherName, entries: namesWithSites() });
    if (!v.ok) return v;
    const km = metaOf(keepName), xm = metaOf(otherName);
    const dropsTotp = k.rec.totpName && x.rec.totpName && x.rec.totpName !== k.rec.totpName ? x.rec.totpName : null;
    const ownerLoses = xm && xm.owner && xm.owner !== (km && km.owner) ? xm.owner : null;
    const kp = BL.parseName(keepName);
    // (主开发 10:54Z, as if a must) the other login's password is NOT kept — said before the press and in the answer, with which of
    // the two was set later: DATES only, no byte compared or shown (a person who keeps the older login loses the newer password)
    const kAt = Number(k.rec.current && k.rec.current.setAt) || 0, xAt = Number(x.rec.current && x.rec.current.setAt) || 0;
    const otherPassword = { kept: false, setAt: xAt || null, keptSetAt: kAt || null, later: kAt && xAt ? (xAt > kAt ? 'other' : xAt < kAt ? 'kept' : 'same') : null };
    return { ok: true, v, k, x, joined: v.joined.map((s) => ({ origin: s.origin, user: s.user })), ...(dropsTotp ? { dropsTotp } : {}), ...(ownerLoses ? { ownerLoses } : {}), otherPassword,
      widens: { login: principalsAt(`${kp.origin}#${kp.user}`), ...(km && km.owner ? { owner: km.owner } : {}) } };   // its owner fills with no grant at all
  }
  function mergeWordsFor(keepName, otherName) {
    const m = mergePlan(keepName, otherName);
    if (!m.ok) return m;
    return { ok: true, keep: keepName, other: otherName, joined: m.joined, ...(m.dropsTotp ? { dropsTotp: m.dropsTotp } : {}), ...(m.ownerLoses ? { ownerLoses: m.ownerLoses } : {}), otherPassword: m.otherPassword, widens: m.widens };
  }
  function merge(keepName, otherName, { who = null } = {}) {
    const m = mergePlan(keepName, otherName);
    if (!m.ok) return m;
    const { v, x } = m;
    const xPending = x.rec.pending ? x.rec.pending.itemId : null;
    let out = null;
    try {
      batchWrite(() => {
        const w = writeEntry(keepName, { ...v.record, rev: v.record.rev + 1 });
        if (!w.ok) throw Object.assign(new Error(w.error || w.code), { code: w.code });
        const d = vault.secretDrop(otherName);
        if (d && d.ok === false) throw Object.assign(new Error(d.error || d.code), { code: d.code || 'not_written' });
        out = { ok: true, name: keepName, merged: otherName, joined: m.joined, ...(m.dropsTotp ? { dropsTotp: m.dropsTotp } : {}), ...(m.ownerLoses ? { ownerLoses: m.ownerLoses } : {}), otherPassword: m.otherPassword, widens: m.widens };
      });
    } catch (e) { return named(str(e && e.code) === 'vault_locked' ? 'vault_locked' : 'not_written', `the merge was not written (${(e && e.message) || 'not written'}) — both logins are as they were`); }
    resolvePendingItemsForName(otherName, xPending);
    // its grant rows STAY: each names <site>#<user> of a site now on the kept login, admitted there (and only there) by the fill's
    // second row — none lost, none widened
    try { vault.audit?.('vault-web-login-merged', { why: keepName, merged: otherName, sites: v.joined.map((s) => s.origin), by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return out;
  }

  function resourceFor(name, scope) { const p = BL.parseName(name); if (scope === 'any-site') return '*'; if (!p) return null; return scope === 'any-account' ? `${p.origin}#*` : `${p.origin}#${p.user}`; }
  function grant(name, scope, subject, { by = 'user', except = undefined } = {}) {
    const resource = resourceFor(name, scope);
    if (!resource || !BL.resourceOk(resource)) return named('bad_resource', 'a login and a scope: this-account, any-account or any-site');
    const p = subject === 'everyone' ? { kind: 'everyone' } : GM.fromSubject(subject);
    if (!p) return named('bad_principal', 'a running conversation, a Task Group, or everyone');
    // «除了» (the owner 2026-11-17, 主开发's Q2): a Task Group's or Everyone's grant carries its exceptions — the conversations left out
    // (the row model's own `except`); a conversation's grant takes none
    let exceptList = null;
    if (except !== undefined && except !== null) {
      if (!Array.isArray(except)) return named('bad_except', 'the exceptions are a list of conversations');
      if (p.kind !== 'group' && p.kind !== 'everyone') return named('bad_except', 'exceptions belong to a Task Group or Everyone');
      exceptList = [];
      for (const x of except) { const q = GM.fromSubject(String(x || '')); if (!q || q.kind !== 'conversation') return named('bad_except', 'an exception is a running conversation'); if (!exceptList.some((e) => GM.principalKey(e) === GM.principalKey(q))) exceptList.push(q); }
    }
    const g = store();
    const [row] = g.rowsFor(BL.DOOR, resource);
    const cur = row ? GM.publicRow(row) : { to: [], except: [] };
    if (cur.unknown) return named('unknown_shape', cur.why || 'that grant row could not be read');
    const key = GM.principalKey(p);
    const has = (cur.to || []).some((e) => GM.principalKey(e) === key);
    if (has && !exceptList) return { ok: true, resource, already: true };
    const nextExcept = exceptList ? exceptList.filter((e) => GM.principalKey(e) !== key) : (cur.except || []).filter((e) => GM.principalKey(e) !== key);
    // the store MERGES `except` on a write: what leaves the list is named (`removeExcept`) — the new principal itself, and every exception
    // the person took out of «除了»
    const nextKeys = new Set(nextExcept.map((e) => GM.principalKey(e)));
    const removeExcept = [...new Set([...(has ? [] : [key]), ...(cur.except || []).map((e) => GM.principalKey(e)).filter((k) => !nextKeys.has(k))])];
    const w = g.set(BL.DOOR, resource, { to: has ? (cur.to || []) : [...(cur.to || []), p], except: nextExcept, ...(removeExcept.length ? { removeExcept } : {}) }, by);
    return w && w.ok ? { ok: true, resource } : named((w && w.code) || 'not_written', (w && w.error) || 'not written');
  }
  function ungrant(resource, principalKey, { by = 'user' } = {}) {
    if (!BL.resourceOk(resource)) return named('bad_resource', 'not a web-login grant');
    const g = store();
    const [row] = g.rowsFor(BL.DOOR, resource);
    if (!row) return { ok: true, removed: false };
    const cur = GM.publicRow(row);
    if (cur.unknown) return named('unknown_shape', cur.why || 'that grant row could not be read');
    const to = (cur.to || []).filter((e) => GM.principalKey(e) !== str(principalKey));
    const w = to.length || (cur.except || []).length ? g.set(BL.DOOR, resource, { to, except: cur.except || [] }, by) : g.remove(BL.DOOR, resource, by);
    return w && w.ok ? { ok: true, removed: true } : named((w && w.code) || 'not_written', (w && w.error) || 'not written');
  }

  // ── SCRUBBER HELPERS (`RULE 5″/5‴`; the locked-boot fence recovery of `A1` left with round 32's shape S: a restart holds, it asks the vault nothing) ──
  /** A1: THE ONE answer for «is the logins vault locked?» (boolean, never inferred from an absent error code). */
  function isLocked() {
    return vstate() !== 'unlocked';
  }

  function scrubSecretsOf(name, { minBytes = 8, includePrevious = true } = {}) {
    if (!BL.isEntryName(name) || isLocked()) return [];
    const o = open(name);
    return o.ok && o.rec ? BL.scrubSecretsOf(o.rec, { minBytes, includePrevious }) : [];
  }

  function onVaultOpen(fn) { if (typeof fn === 'function') openListeners.push(fn); }
  function onVaultLock(fn) { if (typeof fn === 'function') lockListeners.push(fn); }

  try {
    if (typeof vault.onOpen === 'function') {
      vault.onOpen(() => {
        try { maybeRemindPending(); } catch (e) { say(`[browser-login] open reminder scan failed — ${e && e.message}`); }
        for (const fn of openListeners) { try { fn(); } catch (e) { say(`[browser-login] open listener failed — ${e && e.message}`); } }
      });
    }
    if (typeof vault.onLock === 'function') {
      vault.onLock((why) => {
        for (const fn of lockListeners) { try { fn(why); } catch { /* */ } }
      });
    }
  } catch { /* engine without hooks */ }

  /** «WHAT IT MAY USE» (Session Properties, unit what-it-may-use): every saved web login ONE conversation may have filled —
   *  the fill verdict's own admission (a login it saved itself, else THE model's `admits` over the grant rows of its origin
   *  and user: the one account, «any account on this site», «any site» — rows ADD) — as may-use-model answer rows: the site
   *  and the user name, never a value (`names()` opens no entry). */
  function mayUseFor(facts = {}) {
    const keys = new Set((facts.conversationKeys || []).map(String));
    const out = [];
    for (const e of names()) {
      if (e.pending) continue;   // a login waiting for its owner's card is nobody's to fill yet
      const base = { door: BL.DOOR, resource: e.name, name: `${BL.hostOf(e.origin) || e.origin} · ${e.user}`, detail: { origin: e.origin, user: e.user } };
      if (e.owner && keys.has(String(e.owner))) { out.push({ ...base, ok: true, via: 'own' }); continue; }
      const v = GM.admits(BL.grantResources(e.origin, e.user).flatMap((r) => rowsOf(r) || []), facts);
      if (v.ok) out.push({ ...base, ok: true, via: v.via, ...(v.via === 'group' && v.entry ? { groupId: String(v.entry.id) } : {}) });
      else if (v.code === 'excepted') out.push({ ...base, ok: false, code: 'excepted', ...(v.entry ? { except: GM.bareOf(v.entry) } : {}) });
      else if (v.code === 'groups_unreadable' || v.code === 'unknown_shape') out.push({ ...base, ok: false, code: v.code });
    }
    return out;
  }
  return {
    names,
    mayUseFor,
    resolveFill,
    confirmOwn,
    discardPending,
    maybeRemindPending,
    offerOwnerSaveCard,
    answerCard,
    cardOf,
    noticeCrossOriginBlocked,
    noticeTakeoverSaveDropped,
    list,
    addOwn,
    usePrevious,   // B-ab6c
    bindTotp,
    addAgent,
    drop,
    siteWordsFor,
    mergeWordsFor,
    addSite,
    removeSite,
    merge,
    grant,
    ungrant,
    scrubSecretsOf,
    isLocked,
    onVaultOpen,
    onVaultLock,
    vaultState: vstate,
    _cards: cards,
    _pendingCards: pendingCards,
  };
}

module.exports = { create, CARDS_MAX, CARD_MS };
