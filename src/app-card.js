'use strict';
/**
 * THE ONE CARD OF AN APP INSTALL — PURE, imports nothing (design 009 §2 A + §4 "the proposal view both install lanes
 * share"). The ENGINE builds the VIEW (structure, never words) from a stored proposal — or from a plan the user's own
 * install dialog shows; the CLIENT words it with its own t() (src/lib/app-card-model.js), so a card reads in the
 * device's language. `shownDigest(view)` is computed on BOTH sides: the card's Install sends the digest of the view it
 * drew, the engine compares it with the digest of the proposal as it stands — a card that is not the proposal any more
 * answers plan_changed and nothing runs ("what you approve is what runs").
 *
 *   view = {id, host, state, kind: 'package'|'deb'|'appimage'|'remove'|'source', app: {name, labels: {zh?, ja?}, icon?},
 *           by: {name} | null, why, from: {kind: 'sources'|'download'|'file', origin?, host?, recipe?} | null,
 *           bytes: {download, installed}, keeps: 'replay'|'home'|'system', firstUse?: true,
 *           details: {packages, count, commands, origins, sha256?, scripts?, fingerprints?, removes?, address?},
 *           digest (the PLAN's digest), planChanged?: true, result?: {rows?, step?, code?, error?}}
 *
 * The face of a card never carries a package-system word; Details may (scripts/test-app-card.mjs is the census).
 */
const KIND_OF = Object.freeze({ apt: 'package', deb: 'deb', appimage: 'appimage', remove: 'remove', source: 'source' });
const CARD_KINDS = Object.freeze(['package', 'deb', 'appimage', 'remove', 'source']);
const KEEPS = Object.freeze(['replay', 'home', 'system']);
/** where a run stopped, by its code: before the package slot ran anything, inside it, or at the record after it */
const RUN_STEP_CODES = Object.freeze(['install_failed', 'install_timeout', 'install_link_lost', 'install_unrecorded']);
const stepOf = (code, { recorded = false } = {}) => (recorded ? 'record' : RUN_STEP_CODES.includes(code) ? 'install' : 'prepare');

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
const strs = (a, n, max) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => str(x, max)).filter(Boolean);
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
const hostOf = (u) => { const m = /^https?:\/\/([^/:?#@]+)/i.exec(String(u || '')); return m ? m[1].toLowerCase().slice(0, 120) : ''; };

/** What a plan says, kept on a proposal (bounded) — the card is drawn from THIS, never from a live plan. */
function planSummary(pl) {
  const p = pl || {};
  const deb = p.deb && typeof p.deb === 'object' ? p.deb : null;
  const closure = (Array.isArray(p.closure) ? p.closure : []).map((c) => c && c.package).filter(Boolean);
  return {
    newCount: p.newCount || 0, upgradeCount: p.upgradeCount || 0, downloadBytes: p.downloadBytes || 0, installedBytes: p.installedBytes || 0,
    origins: (p.origins || []).slice(0, 8), packages: (p.packages || []).slice(0, 32), replaySeconds: p.replaySeconds || null,
    fingerprints: p.sourceSpec ? p.sourceSpec.fingerprints : null,
    count: closure.length, closure: strs(closure, 64, 80), commands: strs(p.commands, 12, 600), removes: strs(p.removes, 32, 80),
    deb: deb ? { sha256: str(deb.sha256, 64), scripts: strs(deb.scripts, 5, 20), name: str(deb.name, 200), size: num(deb.size) } : null,
    address: p.sourceSpec ? strs(p.sourceSpec.uris, 4, 300) : null,
  };
}

/** A stored proposal (or `{host, request, label, summary, digest, state: 'plan'}` for the user's own dialog) → its view. */
function cardView(p) {
  const x = p || {};
  const rq = x.request || {};
  const sm = x.summary || {};
  const kind = KIND_OF[rq.kind] || 'package';
  const app = x.app && typeof x.app === 'object' ? x.app : {};
  const labels = {};
  for (const l of ['zh', 'ja']) if (app.labels && app.labels[l]) labels[l] = str(app.labels[l], 120);
  // a download's own facts (lane apps-install-core: `fetch = {host, recipe?}` on the proposal) — else the machine's sources
  // (apps-joint) `fetch = {file}`: an installer that was a FILE on that machine — the face says so, its name is Details'
  const fetched = x.fetch && typeof x.fetch === 'object' && (x.fetch.host || x.fetch.file) ? x.fetch : null;
  const from = kind === 'remove' ? null
    : kind === 'source' ? { kind: 'download', host: hostOf(((sm.address && sm.address.length ? sm.address : (rq.source && rq.source.uris)) || [])[0]) }
      : fetched ? (fetched.host ? { kind: 'download', host: str(fetched.host, 120), ...(fetched.recipe ? { recipe: str(fetched.recipe, 80) } : {}) } : { kind: 'file' })
        : { kind: 'sources', origin: str((sm.origins || [])[0], 120) };
  const keeps = KEEPS.includes(x.keeps) ? x.keeps : kind === 'appimage' ? 'home' : kind === 'source' ? 'system' : 'replay';
  const deb = sm.deb || null;
  const details = {
    packages: sm.closure && sm.closure.length ? sm.closure.slice(0, 64) : strs(sm.packages, 32, 80), count: num(sm.count),
    commands: strs(sm.commands, 12, 600), origins: strs(sm.origins, 8, 120),
    ...(deb && deb.sha256 ? { sha256: str(deb.sha256, 64) } : rq.sha256 && /^[0-9a-f]{64}$/.test(String(rq.sha256)) ? { sha256: String(rq.sha256) } : {}),
    ...(fetched && !fetched.host ? { file: str(fetched.file, 200) } : {}), ...(deb && deb.scripts && deb.scripts.length ? { scripts: strs(deb.scripts, 5, 20) } : {}),
    ...(sm.fingerprints && sm.fingerprints.length ? { fingerprints: strs(sm.fingerprints, 4, 64) } : {}),
    ...(sm.removes && sm.removes.length ? { removes: strs(sm.removes, 32, 80) } : {}), ...(sm.address && sm.address.length ? { address: strs(sm.address, 4, 300) } : {}),
  };
  const r = x.result && typeof x.result === 'object' ? x.result : null;
  const result = !r ? null : x.state === 'done' ? { rows: (Array.isArray(r.rows) ? r.rows : []).slice(0, 8).map((w) => ({ id: str(w && w.id, 80), label: str(w && w.label, 120) })) }
    : x.state === 'failed' ? { step: ['prepare', 'install', 'record'].includes(r.step) ? r.step : 'install', code: str(r.code, 40), error: str(r.error, 300) } : null;
  return {
    id: x.id ? str(x.id, 40) : null, host: str(x.host || 'local', 80), state: str(x.state || 'plan', 20), kind,
    app: { name: str(app.name || x.label || (rq.packages || []).join(' ') || rq.entryId || (rq.source && rq.source.id) || '', 120), labels, ...(app.icon ? { icon: str(app.icon, 300) } : {}) },
    by: x.by && x.by.name ? { name: str(x.by.name, 80) } : null, why: str(x.why, 500), from,
    bytes: { download: num(sm.downloadBytes), installed: num(sm.installedBytes) }, keeps, ...(x.firstUse ? { firstUse: true } : {}),
    details, digest: str(x.digest, 64), ...(x.planChanged ? { planChanged: true } : {}), ...(result ? { result } : {}),
  };
}

/** WHAT THE CARD SHOWED, as one ordered list — everything a person reads on its face or in its Details, and the plan's
 *  own digest; never the state / progress / result (those move while the one click runs). */
function shownFields(v) {
  const x = v || {};
  const a = x.app || {}, f = x.from || {}, b = x.bytes || {}, d = x.details || {};
  const list = (l) => (Array.isArray(l) ? l.map(String).join('\u0001') : '');
  return [x.id || '', x.host || '', x.kind || '', a.name || '', (a.labels && a.labels.zh) || '', (a.labels && a.labels.ja) || '', (x.by && x.by.name) || '', x.why || '',
    f.kind || '', f.origin || '', f.host || '', f.recipe || '', num(b.download), num(b.installed), x.keeps || '', x.firstUse ? 1 : 0,
    list(d.packages), num(d.count), list(d.commands), list(d.origins), d.sha256 || '', list(d.scripts), list(d.fingerprints), list(d.removes), list(d.address), d.file || '', x.digest || ''];
}
function fnv32(s, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** The digest of a card's view (the same on the server and in the browser — no crypto API needed). */
function shownDigest(v) {
  const canon = JSON.stringify(shownFields(v));
  return `a1:${fnv32(canon, 0x811c9dc5)}${fnv32(canon.split('').reverse().join(''), 0x9747b28c)}:${canon.length}`;
}

module.exports = { KIND_OF, CARD_KINDS, KEEPS, RUN_STEP_CODES, stepOf, planSummary, cardView, shownFields, shownDigest };
