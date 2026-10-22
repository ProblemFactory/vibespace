// THE UNREGISTERED CLAUDE BUILD, WORDED (lane cli-2-1-308-records — the treadmill, built). The hub says ONCE in its journal
// when it sees a claude build this release has no record table for (src/server/cli-registration.js: the hub's CLI, or a
// conversation's drift card); ⚙ Diagnostics and Manage agents' claude row say it from GET /api/cli-registration with THESE
// words, and the row offers the build's record draft (「生成记录草稿」: its static dump — the binary is never run).
// PURE — imports nothing, touches no DOM (node-imported by scripts/test-cli-registration.mjs); the caller passes t / esc.

/** «claude <v> is not registered — records may show as new fields until the next release» */
export function unregisteredLine(version, t) {
  return t('claude {v} is not registered — records may show as new fields until the next release', { v: version });
}

/** a draft taken ({file, changes, against}) in words */
export function draftLine(d, t) {
  if (!d || !d.file) return '';
  return Number.isFinite(d.changes) && d.against
    ? t('Record draft taken: {file} — {n} changes against claude {against}', { file: d.file, n: d.changes, against: d.against })
    : t('Record draft taken: {file}', { file: d.file });
}

/** Manage agents' claude row: null while the hub's claude is registered (or not read yet); else the line, the draft's
 *  words once taken, and the ONE button until then */
export function hubRegistrationRow(status, { t }) {
  const hub = status && status.hub;
  if (!hub || !hub.version || hub.registered) return null;
  const u = (Array.isArray(status.unregistered) ? status.unregistered : []).find((x) => x && x.version === hub.version);
  const d = u && u.draft;
  return {
    line: unregisteredLine(hub.version, t),
    draft: d ? draftLine(d, t) : null,
    button: d ? null : { label: t('Draft the record table'), title: t('Reads the installed claude\'s strings (it is never run) and writes data/claude-cli-dumps/{v}.json — the dump the next release registers it from', { v: hub.version }) },
  };
}

/** ⚙ Diagnostics: '' while every claude build seen is registered; else ONE section, a row per unregistered build */
export function diagnosticsSection(status, { t, esc, when = (ms) => new Date(ms).toLocaleString() }) {
  const rows = status && Array.isArray(status.unregistered) ? status.unregistered.filter((u) => u && u.version) : [];
  if (!rows.length) return '';
  const where = (s) => (Array.isArray(s) ? s : []).map((x) => (x === 'hub' ? t('the hub\'s claude') : t('a conversation\'s records'))).join(' · ');
  const isHub = (u) => !!(status.hub && status.hub.version === u.version);
  const next = (u) => (u.draft ? draftLine(u.draft, t)
    : isHub(u) ? t('No draft yet — Manage agents ▸ claude ▸ Draft the record table, or node scripts/claude-cli-dump.mjs --auto')
      : t('No draft — run node scripts/claude-cli-dump.mjs --auto on the machine whose claude this is'));
  const tr = rows.map((u) => `<tr><td><b>${esc(unregisteredLine(u.version, t))}</b><div class="dim">${esc(t('seen as {where} · first {when}', { where: where(u.sources), when: u.firstSeen ? when(u.firstSeen) : '?' }))}</div><div>${esc(next(u))}</div></td></tr>`).join('');
  return `<h2>${esc(t('Claude builds without a record table'))}</h2>
      <p class="dim">${esc(t('Builds of claude this server saw that this release has no record table for (it knows {newest} and older). Until a release registers one, its conversations may show red cards for the records it added. The draft is the build\'s static dump — its strings, never run — for the release that registers it.', { newest: status.newest || '?' }))}</p>
      <table class="cli-registration">${tr}</table>`;
}
