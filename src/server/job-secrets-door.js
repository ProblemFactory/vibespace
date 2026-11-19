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
//            deleted — seals nothing (the entries made are dropped again) and keeps the file, so a second press is the same press. The answer: the entries and their vault:// references (a job reads one with --vault NAME=vault://…)
//            — never a value;
//   delete — the file is deleted as it is (its values with it) — a regular file of one name only (a symlink, a directory or a
//            hard-linked name is refused: deleting the NAME would leave the values on disk while it said «deleted»).
// Either way the ONE notice is settled (done, by the person) and one audit line says what happened — a count, never a name
// or a value. A file that is no longer there answers job_secrets_gone and settles the notice too. One press at a time.
// fs.promises only (no sync call on the hub's loop); the values are parsed here and handed to the writer only — never logged,
// never answered, never in the notice.
const fsp = require('fs').promises;
const path = require('path');
const { redactSecrets } = require('../secret-shapes.js');   // PURE: the one secret-shape rule (a name shaped like a value is never shown)

const RETIRED = 'job-secrets.retired.json';   // = src/server/migrations.js JOB_SECRETS_RETIRED (scripts/test-migrations.mjs pins the two)
const ITEM = '2026-10-job-secrets-retired';   // = src/server/migrations.js JOB_SECRETS_ITEM — the notice's key (its sessionKey 'vault')
const SIZE_MAX = 1024 * 1024;                 // the migration reads no more to find the names
const ANSWERS = Object.freeze(['move', 'delete']);
const named = (code, extra = {}) => ({ ok: false, code, ...extra });
/** The file's name for its entry — shown only when it is shaped like a variable and the secret-shapes belt finds nothing in it. */
const safeName = (n) => (/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n) && redactSecrets(n, { runs: true }).redacted === 0 ? n : null);

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {object} o.vault      src/server/vault-engine.js (state, audit)
 * @param {object} o.paste      src/server/vault-paste-door.js (addEntry / dropEntry — the free entry's ONE writer)
 * @param {object|function} [o.userTodos]  the live For-you store (or a getter) — the notice is settled there
 */
function create({ dataDir, vault, paste, userTodos = null, log = () => {} } = {}) {
  if (!dataDir || !vault) throw new TypeError('job-secrets-door: dataDir and vault are required');
  if (!paste) return { answer: async () => named('job_secrets_gone') };   // no free-entry writer (a wiring without the paste door): nothing to move with — refused by name, never a throw at the wiring
  const file = path.join(dataDir, RETIRED);
  const audit = (event, line) => { try { vault.audit(event, line); } catch (e) { log(`the audit line could not be written (${e.message})`); } };
  let busy = false;
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
    let lst;
    try { lst = await fsp.lstat(file); } catch (e) { return gone(e, by) || named('job_secrets_unreadable'); }
    if (!lst.isFile() || lst.nlink > 1) return named('job_secrets_not_a_file');   // a symlink, a directory or a hard-linked name: never followed, never read (its delete would leave the bytes)
    if (lst.size > SIZE_MAX) return named('job_secrets_unreadable');
    let doc;
    try { doc = JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { return gone(e, by) || named('job_secrets_unreadable'); }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return named('job_secrets_unreadable');
    const names = Object.keys(doc), made = [];
    const undo = () => { for (const m of made) { try { paste.dropEntry(m.entry.slice(7), { by }); } catch { } } };   // nothing half-moved: the ones sealed go again (secretDrop needs no key — a lock in between too)
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
    for (const { name, value } of plan) {
      n++;
      const shown = safeName(name);
      const r = paste.addEntry({ label: shown || `Job secret ${n}`, note: `Moved from data/${RETIRED}${shown ? ` (the job secret ${shown})` : ''}.`, kind: 'secret', value, by });
      if (!r || !r.ok) {
        undo();
        return named((r && r.code) || 'store_failed', { at: n, ...(shown ? { name: shown } : {}) });
      }
      made.push({ entry: r.entry, ref: r.ref, label: r.label, ...(shown ? { name: shown } : {}) });
    }
    if (!made.length) return named('job_secrets_nothing', { skipped });   // no value to seal: the file is kept (its 「Delete the file」 deletes it)
    // THE READ (r1, nit): the file the values came from is the file deleted — one edited meanwhile (its size, its change time or
    // its inode moved) keeps every byte: nothing moved, press again
    let now0 = null;
    try { now0 = await fsp.lstat(file); } catch { now0 = null; }
    // r13 (three readers): the CHANGE time, as the words say — a write moves it whatever the size and the modification time say
    // afterwards (a same-size edit whose mtime was set back moved only the ctime; the batch compared the mtime)
    if (!now0 || !now0.isFile() || now0.size !== lst.size || now0.ctimeMs !== lst.ctimeMs || now0.ino !== lst.ino) { undo(); return named('job_secrets_changed'); }
    try { await fsp.unlink(file); } catch (e) {
      if (!(e && e.code === 'ENOENT')) { undo(); return named('job_secrets_undeletable'); }   // the file stays as it was, and so does the vault — a second press is the same press
    }
    audit('vault-job-secrets-moved', { who, ip, by: String(by).slice(0, 40), n: made.length, skipped });   // a count — never a name, never a value
    settle(by);
    return { ok: true, answer: 'move', moved: made, skipped };
  }
  async function drop(by, who, ip) {
    let lst;
    try { lst = await fsp.lstat(file); } catch (e) { return gone(e, by) || named('job_secrets_undeletable'); }
    if (!lst.isFile() || lst.nlink > 1) return named('job_secrets_not_a_file');   // THE READ (r1, nit): a symlink, a directory or a hard-linked name — deleting the name would leave the values on disk while it said «deleted»
    try { await fsp.unlink(file); } catch (e) { return gone(e, by) || named('job_secrets_undeletable'); }
    audit('vault-job-secrets-deleted', { who, ip, by: String(by).slice(0, 40) });
    settle(by);
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
  return { answer };
}

module.exports = { create, RETIRED, ITEM, ANSWERS, safeName };
