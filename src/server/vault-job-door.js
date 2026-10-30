'use strict';
/**
 * THE DOOR OF A BACKGROUND JOB'S VAULT VALUES — ORCH (lane vault-job-road, design-vault-service-secret L1a). Every RULE is PURE
 * src/vault-job.js (the grammar, the families, the verdict, the fd plan, the frame); this file is the I/O around it, asked by
 * src/jobs.js at EVERY spawn of a job that declared `--vault` (a first start, a crash restart, a manual start, a boot replay,
 * each cron fire):
 *
 *   · `gate(job)` — the verdict over the vault's live facts: its state, the entry (does the vault hold it, did the HUB mint it —
 *     the engine's `secretNames`, names and provenance only) and the entry's `vault-job` rows (the grants store, READ only —
 *     lane vault-job-approval writes them). Locked ⇒ `{wait:'vault'}`; no approval ⇒ `{wait:'approval'}`.
 *   · `payload(v)` — the values read NOW (unlocked: `secretGet`, each a Buffer, the caller's copy) into ONE frame; every value
 *     buffer is zeroed once framed, and the frame is the spawner's to zero once the wrapper has it. A value under the scrubber's
 *     floor (MIN_MASK_BYTES) is refused: the wrapper could not mask it in the job's log.
 *   · `noteUses(job, v, actor)` — ONE `vault-use` line per value per start (door `service`, by `job`, the owner conversation,
 *     ONE receipt per start) through the engine's ONE writer (`noteUse`). The hub hands the value; whether the program reads it
 *     is the program's — the line says it was given, its outcome `ok`.
 *   · `blocked(actor)` — the lock's ONE helper (`vault.blocked`): the lock's one For-you item names the job (never a new item).
 *   · `onChange(fn)` — fn(why) after an unlock (`vault-unlocked`) and after a `vault-job` row changed (`vault-approved`): the
 *     engine re-judges every waiting job (src/jobs.js vaultChanged).
 * Nothing here returns a value to a caller but the frame to the spawner; nothing is logged but codes and ids.
 */
const crypto = require('crypto');
const VJ = require('../vault-job.js');
const VR = require('../vault-run.js');

/**
 * @param {object} o
 * @param {object} o.vault    src/server/vault-engine.js (state, secretNames, secretGet, noteUse, blocked, onUnlock)
 * @param {() => object} [o.grants]  the grants store (src/server/grants-store.js — rowsFor, onChange), read at call time
 */
function create({ vault, grants = () => null, log = () => { } } = {}) {
  const stateOf = () => { try { return vault.state(); } catch { return 'locked'; } };
  const store = () => { try { return grants(); } catch { return null; } };
  /** a stored secret of the vault (the secrets store: a free entry, an agent's) → { prov } | null */
  function entryOf(ref) {
    if (!ref || ref.store !== 'secrets' || ref.field !== 'secret') return null;
    let list = [];
    try { list = vault.secretNames() || []; } catch { list = []; }
    const s = list.find((x) => x && x.name === ref.entry);
    return s ? { prov: s.prov || null } : null;
  }
  function rowsFor(id) {
    const g = store();
    try { return g && typeof g.rowsFor === 'function' ? g.rowsFor(VJ.DOOR, id) : []; } catch { return []; }   // an unreadable store approves nothing
  }
  const refusal = (code, key) => ({ ok: false, code, words: VJ.WORDS[code] || code, ...(key ? { key } : {}) });   // key = the --vault NAME

  function gate(job) { return VJ.verdictOf(job, { state: stateOf(), entryOf, rowsFor }); }

  function payload(v) {
    if (stateOf() !== 'unlocked') return { wait: 'vault' };
    const entries = [];
    const zero = () => { for (const e of entries) e.value.fill(0); };
    try {
      for (const r of v.refs) {
        let got;
        try { got = vault.secretGet(r.entry); } catch { got = null; }
        if (!got || !got.ok) return String((got && got.code) || '').includes('vault_locked') ? { wait: 'vault' } : refusal('entry_unreadable', r.name);
        if (!got.value) return refusal('entry_unknown', r.name);
        entries.push({ name: r.name, value: got.value });
        if (got.value.length < VR.MIN_MASK_BYTES) return refusal('entry_too_short_to_mask', r.name);
      }
      try { return { ok: true, frame: VJ.encodeFrame(entries) }; } catch (e) { return refusal((e && e.code) || 'payload_too_large'); }
    } finally { zero(); }
  }

  function noteUses(job, v, actor) {
    if (typeof vault.noteUse !== 'function') return null;
    const receipt = `vr-${crypto.randomBytes(8).toString('hex')}`;
    const o = VJ.ownerOf(job);
    for (const r of v.refs) {
      try { vault.noteUse(r.entry, { by: 'job', door: VJ.USE_DOOR, conv: o.conv || o.scope || null }, { outcome: 'ok', used: true, purpose: `Background job ${job.id}`, actor, receipt, store: 'secrets' }); }
      catch (e) { log(`[vault-job] the use line of ${job.id} could not be written (${(e && e.code) || 'error'})`); }
    }
    return receipt;
  }

  function blocked(actor) { try { return vault.blocked(actor, 'start'); } catch { return false; } }

  function onChange(fn) {
    try { vault.onUnlock(() => fn('vault-unlocked')); } catch { }
    const g = store();
    try { if (g && typeof g.onChange === 'function') g.onChange((c) => { if (c && c.door === VJ.DOOR) fn('vault-approved'); }); } catch { }
  }

  return { gate, payload, noteUses, blocked, onChange };
}

module.exports = { create };
