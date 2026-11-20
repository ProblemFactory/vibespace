'use strict';
// job-secrets-door.js — THE RETIRED JOB-SECRETS NOTICE IS ANSWERABLE WHERE IT APPEARS (B-ef1b — the follow-up of lane
// job-secrets-retire, int361's seam F reading 2026-10-30; the rule: a notice that asks the owner to do something is answerable
// where it appears). The one-shot 2026-10-job-secrets-retired (src/server/migrations.js) renames a plaintext
// data/job-secrets.json to data/job-secrets.retired.json (0600, its bytes kept) and files ONE For-you notice that said, in words
// only, «put each into the vault, then delete the file». The notice now carries two buttons (src/foryou-actions.js row
// `job-secrets-retired`), each a PERSON's press over POST /api/vault/job-secrets/:answer (src/routes/vault.js person() — a
// bearer is refused human_only):
//   move   — the vault UNLOCKED: each name → value of the file is sealed as a free entry through the free entry's ONE writer
//            (src/server/vault-paste-door.js addEntry — `secret:<10 hex>`; its name = the file's name when that name is safe
//            to show (a variable's shape and no secret shape in it — the migration's own rule), else «Job secret N»); only when
//            EVERY value is sealed is the file deleted. A refusal — a value refused, a lock in between, a file that cannot be
//            deleted — seals nothing (the entries made are dropped again) and keeps the file, so a second press is the same press
//            (a drop that is REFUSED leaves its copy: recorded, named in For you, removed at the next unlock — B-ef1b below). The answer: the entries and their vault:// references (a job reads one with --vault NAME=vault://…)
//            — never a value;
//   delete — the file is deleted as it is (its values with it) — a regular file of one name only (a symlink, a directory or a
//            hard-linked name is refused: deleting the NAME would leave the values on disk while it said «deleted»).
// Either way the ONE notice is settled (done, by the person) and one audit line says what happened — a count, never a name
// or a value. A file that is no longer there answers job_secrets_gone and settles the notice too. One press at a time.
// fs.promises only (no sync call on the hub's loop); the values are parsed here and handed to the writer only — never logged,
// never answered, never in the notice.
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { redactSecrets } = require('../secret-shapes.js');   // PURE: the one secret-shape rule (a name shaped like a value is never shown)
const SR = require('../store-read.js');   // PURE (B-f276): what ONE read of a store answers — data · missing · unreadable (held) · corrupt (set aside)

const RETIRED = 'job-secrets.retired.json';   // = src/server/migrations.js JOB_SECRETS_RETIRED (scripts/test-migrations.mjs pins the two)
// B-ef1b (主开发 r191, THE LAW): nothing sealed for a job outlives the act that sealed it without a record a person can see. A move
// that is undone drops what it sealed — and a drop that is REFUSED (a vault-use grant row on the new entry while the vault is
// locked, a record that cannot be written) leaves that copy: it is RECORDED here (entry ids and their labels, never a value),
// NAMED in ONE For-you notice, and removed at the next unlock or the next move (each tries again; a move refuses while an earlier
// try's copies cannot be removed — never a second copy beside them) — never kept silently. The record is a plain file under data/:
// what it names is dropped ONLY when the vault holds it as an entry a move sealed (a free entry with the move's note — a record
// naming any other entry drops nothing; a hand that can write data/ can write the vault's own file too), its label read from the
// vault, and only while the vault is unlocked (then the vault's own listing is the truth: a locked start over an unreadable vault
// record lists nothing, so it drops and settles nothing)
const LEFTOVER = 'job-secrets.leftover.json';
const LEFTOVER_ITEM = 'job-secrets-leftover';   // the notice's key (its sessionKey 'vault')
const ITEM = '2026-10-job-secrets-retired';   // = src/server/migrations.js JOB_SECRETS_ITEM — the notice's key (its sessionKey 'vault')
const SIZE_MAX = 1024 * 1024;                 // the migration reads no more to find the names
const ANSWERS = Object.freeze(['move', 'delete']);
const named = (code, extra = {}) => ({ ok: false, code, ...extra });
/** The file's name for its entry — shown only when it is shaped like a variable and the secret-shapes belt finds nothing in it. */
const safeName = (n) => (/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n) && redactSecrets(n, { runs: true }).redacted === 0 ? n : null);
/** The note this door seals each copy with (move() below) — the mark of its own copy in the vault's listing. */
const MOVED_NOTE = new RegExp(`^Moved from data/${RETIRED.replace(/\./g, '\\.')}(?: \\(the job secret [A-Za-z_][A-Za-z0-9_]{0,63}\\))?\\.$`);

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {object} o.vault      src/server/vault-engine.js (state, audit)
 * @param {object} o.paste      src/server/vault-paste-door.js (addEntry / dropEntry — the free entry's ONE writer)
 * @param {object|function} [o.userTodos]  the live For-you store (or a getter) — the notice is settled there
 * @param {object} [o.writer]  the store writer (src/store-writer.js — the process's own when none is handed in)
 */
function create({ dataDir, vault, paste, userTodos = null, log = () => {}, writer = null } = {}) {
  if (!dataDir || !vault) throw new TypeError('job-secrets-door: dataDir and vault are required');
  if (!paste) return { answer: async () => named('job_secrets_gone') };   // no free-entry writer (a wiring without the paste door): nothing to move with — refused by name, never a throw at the wiring
  const file = path.join(dataDir, RETIRED);
  const audit = (event, line) => { try { vault.audit(event, line); } catch (e) { log(`the audit line could not be written (${e.message})`); } };
  let busy = false;
  const leftFile = path.join(dataDir, LEFTOVER);
  const liveTodos = () => (typeof userTodos === 'function' ? userTodos() : userTodos);
  const W = () => writer || require('../store-writer.js').storeWriter();   // THE store writer (its own thread, its exit flush), the file's mode kept
  const okEntry = (e) => e && /^secret:[\w.-]{1,160}$/.test(String(e.entry || ''));
  const idOf = (st) => (st ? { ino: st.ino, size: st.size, ...(st.birthtimeMs ? { birthtimeMs: st.birthtimeMs } : {}) } : null);   // what sameFile compares — nothing else (a change time moves with a chmod)
  const sameFile = (a, st) => !!(a && st && st.isFile() && a.ino === st.ino && a.size === st.size && (!a.birthtimeMs || !st.birthtimeMs || a.birthtimeMs === st.birthtimeMs));   // the file a commit named: its inode, size and birth (a chmod or an xattr moves only the change time; a reused inode is born again)
  /** A record that cannot be read is NOT an empty record (主开发 r333; THE STORE READ, src/store-read.js — B-f276's law): bytes that
   *  were READ and do not parse are set aside beside it under a dated name (never written over) and the move refuses by name
   *  until a person has looked (→ `aside`); a READ that fails (EIO, EACCES, EISDIR, …) is HELD — nothing is set aside, nothing
   *  written over it, the move refuses by name and the next sweep reads again (→ `held`). */
  const REC_VALID = (d) => !!d && typeof d === 'object' && Array.isArray(d.entries) && d.entries.every(okEntry);
  async function setAside() {
    const to = `${LEFTOVER}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    try { await fsp.rename(leftFile, path.join(dataDir, to)); log(`data/${LEFTOVER} did not parse — set aside as data/${to} (its bytes kept, never overwritten)`); return to; }
    catch (e) { if (e && e.code === 'ENOENT') return ''; log(`data/${LEFTOVER} did not parse and could NOT be set aside (${(e && e.code) || (e && e.message)}) — held: the move refuses until it is fixed or moved by hand`); return null; }   // ENOENT: another sweep set it aside first (its listing names it)
  }
  async function readRec() {
    let read;
    try { read = { text: await fsp.readFile(leftFile, 'utf8') }; } catch (e) { read = { error: e }; }
    let a = SR.storeAnswer(read, { valid: REC_VALID });
    if (a.state === 'corrupt') { const to = await setAside(); a = to === '' ? { state: 'missing', writable: true } : SR.afterSetAside(a, to); }
    if (a.state === 'data') return { at: Number(a.value.at) || 0, entries: a.value.entries.map((e) => ({ entry: String(e.entry), label: String(e.label || '').slice(0, 80), ...(e.committed && typeof e.committed === 'object' ? { committed: { ino: Number(e.committed.ino), size: Number(e.committed.size), ...(Number(e.committed.birthtimeMs) ? { birthtimeMs: Number(e.committed.birthtimeMs) } : {}) } } : {}) })) };
    if (a.state === 'missing') return { at: 0, entries: [], ...(a.setAside ? { bad: a.why, aside: a.setAside } : {}) };
    // unreadable: NO answer — never «empty», never written over; bytes that did not parse and could NOT be set aside are «stuck»
    // (a person must fix or move the file — the move names it), a read that failed is held (the next press reads again)
    return { at: 0, entries: [], bad: a.why, held: true, ...(a.code === 'not set aside' ? { stuck: true } : {}) };
  }
  /** the dated copies of an unreadable record still kept beside it (a person removes one once looked at) */
  async function asidesNow() {
    try { return (await fsp.readdir(dataDir)).filter((n) => n.startsWith(`${LEFTOVER}.corrupt-`)).sort(); } catch { return []; }
  }
  /** the record → on disk through the store writer, 0600 (an empty list is a record too: «nothing left») → true once it landed */
  async function writeRec(entries) {
    try {
      const w = W(), bytes = JSON.stringify({ entries, at: Date.now() }, null, 2);
      w.dirty(leftFile, { name: 'job-secrets-leftover.write', produce: () => bytes, mode: 0o600, urgent: true });
      return !!(await w.durable(leftFile));
    } catch (e) { log(`the leftover record could not be handed to the writer (${e.message})`); return false; }
  }
  /** The ids the vault HOLDS as an entry a move sealed (a free entry with the move's note) — each with the vault's label. */
  function vaultCopies(list) {
    if (!list.length) return [];
    let names = [];
    try { names = (typeof vault.secretNames === 'function' && vault.secretNames()) || []; } catch { names = []; }
    const by = new Map(names.map((x) => [x && x.name, x]));
    const out = [];
    for (const e of list) { const b = by.get(e.entry); if (b && MOVED_NOTE.test(String(b.note || ''))) out.push({ entry: e.entry, label: String(b.label || e.entry).slice(0, 80) }); }
    return out;
  }
  // one record writer at a time: a move's record writes and every sweep (the unlock's, the start's, a move's) never interleave
  let chain = Promise.resolve();
  const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => { }); return run; };
  let inflight = null;   // the ids of the move running now (recorded before its first seal): no sweep drops them
  let heldN = 0;   // held reads in a row (a read that answers resets it): the first is «a moment», from the second the record's path is named (w2toukjw3)
  /** The leftover's ONE notice — filed for what is still left, or for a record set aside (a re-file of its key renews its words);
   *  a sweep's re-say of a notice a PERSON closed is not opened again while what it says has not changed (a FRESH leftover — an
   *  undo's — is always said); settled by a sweep that found nothing left and nothing set aside (`settle`). For you held unread:
   *  at the read (B-44f3). */
  function sayLeft(entries, { settle: settleIt = false, aside = null, fresh = false, unsure = false, since = 0 } = {}) {
    try {
      const live = liveTodos();
      if (!live) { if (entries.length || aside) log(`the leftover could not be named: no For-you store (${entries.length} copies${aside ? `, the record set aside as ${aside}` : ''})`); return; }
      if (typeof live.isHeldUnread === 'function' && live.isHeldUnread()) { live.whenRead(() => sayLeft(entries, { settle: settleIt, aside, fresh, unsure, since }), 'the job-secrets leftover notice'); return; }
      let it = null;
      const when = (i) => Number(i.resolvedAt || i.createdAt) || 0;
      const open = (typeof live.idsWhere === 'function' && live.idsWhere((i) => { const m = i.sessionKey === 'vault' && i.itemKey === LEFTOVER_ITEM && !i.clearedAt; if (m && (!it || (it.status !== 'open' && (i.status === 'open' || when(i) > when(it))))) it = i; return m && i.status === 'open'; })) || [];
      if (!entries.length && !aside) { if (settleIt) for (const x of open) live.setStatus(x, 'done', 'system'); return; }
      const n = entries.length, names = entries.map((e) => String(e.label || e.entry).slice(0, 80)).slice(0, 8).join(', ') + (entries.length > 8 ? ', …' : '');
      const file = `data/${RETIRED}`;
      const detail = aside
        ? `The record of the copies a move left in the vault could not be read; it is kept as ${aside}. Entries noted «Moved from ${file}» in the Vault window may be such copies: delete the ones you do not want, then delete that file — Move waits until then.`
        : unsure
        ? `Entries a move of the job secrets sealed are still in the vault (${n}: ${names}), and the file ${file} could not be looked at, so VibeSpace cannot tell whether that move finished: do not delete them. VibeSpace looks again at each unlock and at the next move.`
        : `Copies a move of the job secrets sealed are still in the vault and could not be removed (${n} left: ${names}). VibeSpace tries again at each unlock and at the next move, and closes this notice when they are gone; if it stays open, delete them in the Vault window. These are copies: the file ${file} keeps every value until a move completes.`;
      if (!fresh && it && it.status !== 'open' && it.resolvedBy !== 'system' && Number(it.resolvedAt) > Number(since) && it.detail === detail) return;   // r333: a sweep's re-say of a notice a PERSON closed after the record's last write, its words the same — not opened again
      live.add('vault', {
        origin: 'vault', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Vault', itemKey: LEFTOVER_ITEM, openCap: 21,   // ONE keyed item: a Vault key already at its 20 open never keeps it out
        text: 'Moving the job secrets stopped and left copies in the vault',
        detail,
        i18n: { text: { key: 'Moving the job secrets stopped and left copies in the vault' }, detail: [aside
          ? { key: 'The record of the copies a move left in the vault could not be read; it is kept as {aside}. Entries noted «Moved from {file}» in the Vault window may be such copies: delete the ones you do not want, then delete that file — Move waits until then.', params: { aside, file } }
          : unsure
          ? { key: 'Entries a move of the job secrets sealed are still in the vault ({n}: {names}), and the file {file} could not be looked at, so VibeSpace cannot tell whether that move finished: do not delete them. VibeSpace looks again at each unlock and at the next move.', params: { n, names, file } }
          : { key: 'Copies a move of the job secrets sealed are still in the vault and could not be removed ({n} left: {names}). VibeSpace tries again at each unlock and at the next move, and closes this notice when they are gone; if it stays open, delete them in the Vault window. These are copies: the file {file} keeps every value until a move completes.', params: { n, names, file } }] },
      });
    } catch (e) { log(`the leftover notice could not be said (${e.message})`); }
  }
  /** THE SWEEP (an unlock, the start, a move's start). The record's ids: a copy a move left (pending — the move never committed —,
   *  or committed while ITS file still stands as it was: the delete never ran, the file holds every value) is dropped while the
   *  vault is unlocked; a committed id whose file is GONE (ENOENT) or another belongs to a move that completed — the person's entry,
   *  never touched, its row cleared; a committed id whose file cannot be looked at (any other lstat answer) is kept and counted as
   *  left — never dropped, never cleared. Only what the vault holds as a move's copy is dropped; the running move's own ids never.
   *  A record held unread changes nothing. Locked: nothing is dropped, what is left is said (and an empty record settles the
   *  notice — every start is locked). → { left, aside, held, locked } */
  const sweepLeft = () => serial(async () => {
    const rd = await readRec();
    const asides = await asidesNow(), aside = rd.stuck ? `data/${LEFTOVER}` : asides.length ? `data/${asides[asides.length - 1]}` : rd.aside ? `data/${rd.aside}` : null;
    const locked = vault.state() !== 'unlocked';
    if (rd.held && !rd.stuck) {
      heldN++;
      if (heldN === 1) { log(`data/${LEFTOVER} could not be read (${rd.bad}) — held: the move refuses until a read answers`); return { left: 0, aside, held: true, locked }; }
      // a LASTING held read (no permission, a folder at its path): no more «a moment» — the record's path is named, here and in For you
      sayLeft([], { aside: `data/${LEFTOVER}` });
      return { left: 0, aside: `data/${LEFTOVER}`, held: false, locked };
    }
    heldN = 0;
    if (rd.stuck) { sayLeft([], { aside }); return { left: 0, aside, held: false, locked }; }
    const mine = (e) => !!(inflight && inflight.has(e.entry));
    let fileNow = null, fileUnsure = false;
    if (rd.entries.some((e) => e.committed && !mine(e))) { try { fileNow = await fsp.lstat(file); } catch (e) { fileNow = null; fileUnsure = !(e && e.code === 'ENOENT'); } }
    const done = (e) => !!e.committed && !fileUnsure && !sameFile(e.committed, fileNow);   // its move completed: the person's entry
    const unsure = (e) => !!e.committed && fileUnsure;
    const kept = rd.entries.filter((e) => !mine(e) && unsure(e));
    const was = vaultCopies(rd.entries.filter((e) => !mine(e) && !done(e) && !unsure(e)));
    const held = vaultCopies(kept);
    if (vault.state() !== 'unlocked') {
      if (was.length || held.length || aside) sayLeft([...was, ...held], { aside, unsure: held.length > 0, since: rd.at });
      else if (!rd.entries.length) sayLeft([], { settle: true });   // r333 (the round's own read): a start with nothing left settles the notice — every start is locked
      return { left: was.length + held.length, aside, held: false, locked: true };
    }
    const still = [];
    for (const e of was) { let r = null; try { r = paste.dropEntry(String(e.entry).slice(7), { by: 'system' }); } catch { r = null; } if (!(r && (r.ok || r.code === 'entry_unknown_id'))) still.push(e); }
    const next = [...rd.entries.filter((e) => mine(e) || (unsure(e) && held.some((h) => h.entry === e.entry))), ...still];
    if (next.length !== rd.entries.length || next.some((e, k) => e.entry !== rd.entries[k].entry || !!e.committed !== !!rd.entries[k].committed)) { if (!(await writeRec(next))) log('the leftover record did not reach the disk (the writer retries it)'); }
    if (still.length !== was.length) audit('vault-job-secrets-leftover-removed', { n: was.length - still.length, left: still.length + held.length });   // a count — never a name
    sayLeft([...still, ...held], { settle: true, aside, unsure: held.length > 0, since: rd.at });
    return { left: still.length + held.length, aside, held: false, locked: false };
  });
  if (typeof vault.onUnlock === 'function') vault.onUnlock(() => { sweepLeft().catch((e) => log(`the leftover sweep failed (${e.message})`)); });
  sweepLeft().catch(() => { });   // the start: what a stopped hub left is said again (dropped at the next unlock — or now, when the vault is already open)
  /** The ONE notice → done (by the person): every open copy of the key (there is one). */
  function settle(by) {
    try {
      const live = typeof userTodos === 'function' ? userTodos() : userTodos;
      if (live && typeof live.isHeldUnread === 'function' && live.isHeldUnread()) { live.whenRead(() => settle(by), 'the job-secrets notice'); return 0; }   // B-44f3: For you held unread — settled at the read (never «none open» over an unread list)
      const ids = (live && typeof live.idsWhere === 'function' && live.idsWhere((i) => i.sessionKey === 'vault' && i.itemKey === ITEM && i.status === 'open')) || [];
      for (const x of ids) live.setStatus(x, 'done', by);
      return ids.length;
    } catch (e) { log(`the notice could not be settled (${e.message})`); return 0; }
  }
  function gone(e, by) { if (e && e.code === 'ENOENT') { settle(by); return named('job_secrets_gone'); } return null; }
  async function move(by, who, ip) {
    const st = vault.state();
    if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
    let sw;
    try { sw = await sweepLeft(); } catch (e) { log(`the leftover sweep failed (${e.message})`); return named('store_failed'); }   // a press again removes an earlier try's copies FIRST… (a sweep that failed moves nothing)
    if (sw.held) return named('job_secrets_record_held');   // the record's READ failed: held — nothing moves until a read answers (the next press reads again)
    if (sw.aside) return named('job_secrets_record_unreadable', { file: sw.aside });   // r333: a record that did not parse is not an empty one — nothing moves until a person looked
    if (sw.locked) return named('vault_locked', sw.left ? { leftover: sw.left } : {});   // the vault locked while the sweep ran: the locked word, never «copies left» — with their count (the page says it)
    if (sw.left) return named('job_secrets_leftover', { leftover: sw.left });   // …and while they cannot be removed it moves nothing: never a second copy of a value beside them (For you names them)
    let lst;
    try { lst = await fsp.lstat(file); } catch (e) { return gone(e, by) || named('job_secrets_unreadable'); }
    if (!lst.isFile() || lst.nlink > 1) return named('job_secrets_not_a_file');   // a symlink, a directory or a hard-linked name: never followed, never read (its delete would leave the bytes)
    if (lst.size > SIZE_MAX) return named('job_secrets_unreadable');
    let doc;
    try { doc = JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { return gone(e, by) || named('job_secrets_unreadable'); }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return named('job_secrets_unreadable');
    const names = Object.keys(doc), made = [];
    let skipped = 0, n = 0;
    // THE READ (r1, must): every value the old engine handed a job (`String(store[k])`) is moved — a number or true / false as its
    // text; an EMPTY one (null, '') holds nothing and is skipped (said in the answer); a list, an object, or text with spaces
    // around it (the free entry's writer trims — the bytes would change) refuses the whole move BY NAME: nothing is lost unsaid
    const plan = [];
    for (const name of names) {
      const raw = doc[name];
      if (raw === null || raw === '') { skipped++; continue; }
      const value = typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : raw;
      const shown0 = safeName(name);
      if (typeof value !== 'string' || value !== value.trim()) return named('job_secrets_value_shape', { at: plan.length + 1, ...(shown0 ? { name: shown0 } : {}) });
      plan.push({ name, value });
    }
    if (!plan.length) return named('job_secrets_nothing', { skipped });   // no value to seal: the file is kept (its 「Delete the file」 deletes it)
    // THE RECORD COMES FIRST (主开发 r333): the ids this move is about to seal are on disk before the first seal — a hub that ends
    // anywhere in the move leaves a record the next sweep reads (and the For-you notice it says), never a silent copy
    let holds0 = new Set();
    try { holds0 = new Set((vault.secretNames() || []).map((x) => x && x.name)); } catch { holds0 = new Set(); }
    const ids = [];
    for (let k = 0; k < plan.length; k++) { let id; do { id = `secret:${crypto.randomBytes(5).toString('hex')}`; } while (holds0.has(id) || ids.includes(id)); ids.push(id); }   // never an id the vault already holds (a record naming one would let a sweep drop it)
    const labelOf = (k) => safeName(plan[k].name) || `Job secret ${k + 1}`;
    inflight = new Set(ids);
    try {
      const first = await serial(async () => {
        const rd = await readRec();
        if (rd.stuck) return { aside: `data/${LEFTOVER}` };
        if (rd.held) return { held: true };
        if (rd.aside) return { aside: `data/${rd.aside}` };
        return { ok: await writeRec([...rd.entries, ...ids.map((entry, k) => ({ entry, label: labelOf(k) }))]) };
      });
      if (first.held) return named('job_secrets_record_held');
      if (first.aside) return named('job_secrets_record_unreadable', { file: first.aside });
      if (!first.ok) return named('job_secrets_record_unwritable');   // nothing is sealed without its record (the writer keeps the unlanded version owed: ids never sealed, swept as nothing)
      // nothing half-moved: the ones sealed go again (secretDrop needs no key — a lock in between too); each drop's ANSWER is read —
      // one that is refused (a grant row on the new entry while locked, a store that cannot be written) stays in the record, named in
      // For you and tried again at each unlock and the next move (THE LAW above), never left silently
      const undo = async () => {
        const left = [];
        for (const m of made) { let r = null; try { r = paste.dropEntry(m.entry.slice(7), { by }); } catch { r = null; } if (!(r && (r.ok || r.code === 'entry_unknown_id'))) left.push({ entry: m.entry, label: m.label }); }
        await serial(async () => {
          const rd = await readRec();
          if (rd.held || rd.aside) return;   // held / set aside: the move refuses next time; the copies are named below
          const keepIds = new Set(left.map((e) => e.entry));
          const next = [...rd.entries.filter((e) => !inflight.has(e.entry)), ...left.filter((e) => keepIds.has(e.entry)).map((e) => ({ entry: e.entry, label: e.label }))];   // this move's ids: what is left stays (a copy to drop — whatever the record held meanwhile), the rest go
          if (!(await writeRec(next))) log('the leftover record did not reach the disk (the writer retries it; its ids are still in the last one written)');
        });
        if (!left.length) return 0;
        sayLeft(left, { fresh: true });
        audit('vault-job-secrets-leftover', { who, ip, by: String(by).slice(0, 40), n: left.length });   // a count — never a name, never a value
        return left.length;
      };
      for (let k = 0; k < plan.length; k++) {
        const { name, value } = plan[k];
        n++;
        const shown = safeName(name);
        let r = null, threw = false;
        try { r = paste.addEntry({ label: shown || `Job secret ${n}`, note: `Moved from data/${RETIRED}${shown ? ` (the job secret ${shown})` : ''}.`, kind: 'secret', value, by, entry: ids[k] }); } catch (e) { log(`a seal threw (${e.message})`); r = null; threw = true; }
        if (!r || !r.ok) {
          if (threw) made.push({ entry: ids[k], label: labelOf(k) });   // its outcome unknown: the undo tries its drop too
          const leftover = await undo();
          return named((r && r.code) || 'store_failed', { at: n, ...(shown ? { name: shown } : {}), ...(leftover ? { leftover } : {}) });
        }
        made.push({ entry: r.entry, ref: r.ref, label: r.label, ...(shown ? { name: shown } : {}) });
      }
      // THE READ (r1, nit): the file the values came from is the file deleted — one edited meanwhile (its size, its change time or
      // its inode moved) keeps every byte: nothing moved, press again
      let now0 = null;
      try { now0 = await fsp.lstat(file); } catch { now0 = null; }
      // r13 (three readers): the CHANGE time, as the words say — a write moves it whatever the size and the modification time say
      // afterwards (a same-size edit whose mtime was set back moved only the ctime; the batch compared the mtime)
      if (!now0 || !now0.isFile() || now0.size !== lst.size || now0.ctimeMs !== lst.ctimeMs || now0.ino !== lst.ino) { const leftover = await undo(); return named('job_secrets_changed', leftover ? { leftover } : {}); }
      // COMMITTED before the delete: these ids are this file's values now — a hub that ends after the delete leaves entries the
      // sweep keeps (their file is gone: the move completed); one that ends before it leaves copies it drops (the file holds them)
      const committed = await serial(async () => {
        const rd = await readRec();
        if (rd.stuck) return { aside: `data/${LEFTOVER}` };
        if (rd.aside) return { aside: `data/${rd.aside}` };
        if (rd.held) return { held: true };
        return { ok: await writeRec([...rd.entries.filter((e) => !inflight.has(e.entry)), ...made.map((m) => ({ entry: m.entry, label: m.label, committed: idOf(now0) }))]) };
      });
      if (!committed.ok) {
        const leftover = await undo(), left = leftover ? { leftover } : {};
        if (committed.aside) return named('job_secrets_record_unreadable', { file: committed.aside, ...left });   // the record was found unparseable at the commit (a hand edit mid-move): «cannot be read», the truth
        if (committed.held) return named('job_secrets_record_held', left);
        return named('job_secrets_record_unwritable', left);
      }
      // …and the vault still holds every value this move sealed (a hand or another door that dropped one meanwhile: the file is kept)
      { let names = []; try { names = vault.secretNames() || []; } catch { names = []; } const holds = new Set(names.map((x) => x && x.name)); if (!made.every((m) => holds.has(m.entry))) { const leftover = await undo(); return named('store_failed', leftover ? { leftover } : {}); } }
      try { await fsp.unlink(file); } catch (e) {
        if (!(e && e.code === 'ENOENT')) { const leftover = await undo(); return named('job_secrets_undeletable', leftover ? { leftover } : {}); }   // the file stays as it was, and so does the vault — a second press is the same press
      }
      await serial(async () => { const rd = await readRec(); if (!rd.bad && !(await writeRec(rd.entries.filter((e) => !inflight.has(e.entry))))) log('the moved entries\' rows did not leave the record yet (committed, their file gone: the next sweep clears them, never drops them)'); });
      audit('vault-job-secrets-moved', { who, ip, by: String(by).slice(0, 40), n: made.length, skipped });   // a count — never a name, never a value
      settle(by);
      return { ok: true, answer: 'move', moved: made, skipped };
    } finally { inflight = null; }
  }
  async function drop(by, who, ip) {
    let lst;
    try { lst = await fsp.lstat(file); } catch (e) { return gone(e, by) || named('job_secrets_undeletable'); }
    if (!lst.isFile() || lst.nlink > 1) return named('job_secrets_not_a_file');   // THE READ (r1, nit): a symlink, a directory or a hard-linked name — deleting the name would leave the values on disk while it said «deleted»
    // a move that committed for THIS file but never deleted it (a hub that ended between the two): its entries are copies of what
    // is being deleted — written back as copies to drop, so the next sweep removes them (the person deletes the values)
    const back = await serial(async () => { const rd = await readRec(); if (rd.stuck) return 'stuck'; if (rd.held) return 'held'; if (!rd.entries.some((e) => sameFile(e.committed, lst))) return 'ok'; return (await writeRec(rd.entries.map((e) => (sameFile(e.committed, lst) ? { entry: e.entry, label: e.label } : e)))) ? 'ok' : 'unwritten'; }).catch(() => 'unwritten');
    if (back === 'stuck') return named('job_secrets_record_unreadable', { file: `data/${LEFTOVER}` });
    if (back === 'held') return named('job_secrets_record_held');
    if (back !== 'ok') return named('job_secrets_record_unwritable');   // the copies of a committed move must be on record as copies BEFORE their file goes
    try { await fsp.unlink(file); } catch (e) { return gone(e, by) || named('job_secrets_undeletable'); }
    audit('vault-job-secrets-deleted', { who, ip, by: String(by).slice(0, 40) });
    settle(by);
    sweepLeft().catch(() => { });   // the copies go now when the vault is open (else at its unlock)
    return { ok: true, answer: 'delete' };
  }
  /** A person's press: 'move' | 'delete' → its answer (see the head). One at a time. */
  async function answer(a, { by = 'user', who = null, ip = null } = {}) {
    if (!ANSWERS.includes(a)) return named('job_secrets_answer');
    if (busy) return named('job_secrets_busy');
    busy = true;
    const w = who ? String(who).slice(0, 80) : null;
    try { return a === 'move' ? await move(by, w, ip) : await drop(by, w, ip); } finally { busy = false; }
  }
  return { answer, sweepLeft, idle: () => chain };   // idle: the record's chain as it stands (a wait for what is queued — it sweeps nothing)
}

module.exports = { create, RETIRED, ITEM, ANSWERS, safeName, LEFTOVER, LEFTOVER_ITEM };
