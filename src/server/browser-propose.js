'use strict';
/**
 * THE PROPOSAL RUNNER — ORCH (lane browser-propose step 3; the owner, 2026-09-30: the agent PROPOSES the backend
 * switch and the user only presses Approve — D31 stands: nothing switches by itself, a failure is a SUGGESTION and the
 * switch is the user's announced act).
 *
 * A tier-2 `vibespace-browser blocked` claim files ONE proposal on the keeper's claim record (browser-keeper `blocked`);
 * PURE src/browser-switch.js decides its plan, its digest, its words and every transition. THIS module acts:
 *   · SHOWS it — ONE chat card at the claim's position (normalizers.feedProposalCard: a VibeSpace notice keyed by the
 *     claim id, PATCHED IN PLACE on every change, never re-created; a rebuild places it by time from the keeper's record)
 *     and ONE For-you item (origin `browser`) carrying the card's words line for line and the same Approve;
 *   · RUNS APPROVE — exactly the proposal's FROZEN fields, by id + digest (never re-derived from text):
 *       (a) the install when CloakBrowser does not answer — the keeper's pinned, signature- and SHA-checked runner; the
 *           card's words ARE the download's confirm (no second dialog); its progress streams onto the card;
 *       (b) the claim's host added to `browser.cloak.egressAllowlist` — ONLY that host and, for a known vendor's sign-in
 *           host, the sites its page loads from (SW.SIGNIN_DEPENDENCIES, frozen on the proposal — the card named them);
 *       (c) the plan: the §7.4 in-place switch of THIS conversation's profile (`switchBackend`, the user's act — its
 *           gate still runs and refuses by name), or a NEW CloakBrowser profile this conversation is pinned + attached to
 *           with the claim's page opened in its own tab;
 *       (d) the agent TOLD through the handback's ONE ladder site — free: joining a running turn where that costs
 *           nothing, else the next-turn stash (a switch is not a wake; no billed turn is opened for it);
 *     a failure is a state with its step + error ON THE CARD (and a `browser-proposal-updated` broadcast the pressing
 *     client toasts), Approve again runs the same frozen fields;
 *   · RUNS REJECT — the card says so; the agent hears it ONCE, at its next navigation to that host (the audit route).
 * Owner-only: the routes refuse an agent's bearer (agent_forbidden) and the PURE step refuses any actor but `user`.
 *
 * LANE SITE-RESET (2026-09-30): the SAME record, card, For-you item and routes carry a second kind — `site-reset` (`sr-…`,
 * the keeper's `proposeSiteReset`): the agent asked to clear ONE site's stored login in a SHARED profile. Its Approve
 * runs exactly the frozen (profile, host) — the profile's browser started if it does not run, the cookies that reach the
 * host and the stored data of its origins cleared through the dialog watch's own socket (`clearSite`), the holders' live
 * views told in one line (`browser-site-reset`), the agent told for free — and nothing else.
 */
const SW = require('../browser-switch.js');

function create({ keeper, feedCard = null, userTodos = null, sessionKeyFor = null, activeSessions = null,
  patchSettings = null, serverSetting = () => undefined, tell = null, pinConversation = null, broadcast = null,
  // lane site-reset: clear ONE site's stored login in a profile's browser (the wiring: the dialog watch's clearSite, the
  // browser started first when it does not run — `onStart` is said on the card) → {ok, cookies, cookieDomains, origins}
  clearSite = null,
  // the install half — production: the keeper's own runner; a suite hands a FAKE one (start / progress / exeOk)
  install = null,
  log = console, now = () => Date.now(), pollMs = 500, installTimeoutMs = 20 * 60 * 1000, progressEveryMs = 1000, stallMs = 60 * 1000,
  sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t && t.unref) t.unref(); }) } = {}) {
  if (!keeper) throw new Error('browser-propose: keeper is required');
  const inst = install || {
    start: () => keeper.installCloak(),
    progress: () => keeper.installProgress(),
    exeOk: () => !!keeper.cloakExecutable().ok,
  };
  const setting = (k, d) => { try { const v = serverSetting(k); return v === undefined || v === null ? d : v; } catch { return d; } };
  /** The live session carrying this claim (its webui id first, else its conversation key). */
  function sessionFor(entry) {
    if (!activeSessions || !entry) return null;
    const sid = entry.sessionId ? String(entry.sessionId) : null;
    if (sid && activeSessions.get(sid)) return { id: sid, s: activeSessions.get(sid) };
    const k = String(entry.browserKey || '').replace(/\.\d+$/, '');
    if (k) for (const [id, s] of activeSessions) if (s && s._browserKey === k) return { id, s };
    return null;
  }
  // ── the card + the For-you item follow every change ──
  function show(entry) {
    // verify r1: a proposal the full claim store had to drop — its For-you item stops offering an Approve that can no
    // longer run (dismissed, said in the journal); the chat card keeps its last words until the next rebuild
    if (entry && entry.dropped) { try { const it = entry.proposal && entry.proposal.itemId && userTodos && typeof userTodos.get === 'function' ? userTodos.get(entry.proposal.itemId) : null; if (it && it.status === 'open') userTodos.setStatus(it.id, 'dismissed', 'browser'); } catch (e) { log.warn?.(`[browser-propose] a dropped proposal's item was not closed — ${e && e.message}`); } return; }
    const block = SW.proposalCardBlock(entry);
    if (!block) return;
    const sess = sessionFor(entry);
    if (sess && typeof feedCard === 'function') { try { feedCard(sess.s, block); } catch (e) { log.warn?.(`[browser-propose] card not shown — ${e && e.message}`); } }
    followItem(entry, sess);
    if (typeof broadcast === 'function') { try { broadcast({ type: 'browser-proposal-updated', id: entry.id, state: block.state, outcome: block.outcome, site: block.site }); } catch { /* optional */ } }
  }
  function followItem(entry, sess) {
    const p = entry.proposal;
    if (!userTodos) return;
    try {
      if (!p.itemId) {
        if (!['open', 'unavailable'].includes(p.state)) return;
        const item = SW.proposalInboxItem(entry);
        const key = sess && typeof sessionKeyFor === 'function' ? sessionKeyFor(sess.s, sess.id) : null;
        if (!item || !key) return;
        const r = userTodos.add(key, { ...item, origin: 'browser', by: 'agent', sessionName: sess.s.name || sess.s.webuiName || null });
        if (r && r.id) keeper.noteProposal(entry.id, { itemId: r.id });
        return;
      }
      const it = typeof userTodos.get === 'function' ? userTodos.get(p.itemId) : null;
      if (!it) return;
      // decided ⇒ the item is answered (by the user — the press was theirs); a FAILED run re-opens it (Approve again)
      if ((p.state === 'approved' || p.state === 'rejected' || p.state === 'done') && it.status === 'open') userTodos.setStatus(p.itemId, 'done', 'user');
      else if (p.state === 'failed' && it.status !== 'open') userTodos.setStatus(p.itemId, 'open', 'user');
    } catch (e) { log.warn?.(`[browser-propose] For-you item not kept in step — ${e && e.message}`); }
  }
  const unsub = typeof keeper.onProposal === 'function' ? keeper.onProposal((entry) => show(entry)) : null;

  // ── the runner ──
  const running = new Map(); // proposal id → the run in flight (ONE per proposal)
  /** THE USER's Approve: the PURE step (actor, state, the digest of the card that was pressed), then the run. */
  function approve(id, { shown = null, by = 'user' } = {}) {
    if (running.has(String(id))) return { ok: false, code: 'proposal_state', error: 'this proposal is already running' };
    const st = keeper.stepProposal(id, { event: 'approve', by, shown });
    if (!st.ok) return st;
    const job = run(st.entry).catch((e) => log.warn?.(`[browser-propose] ${id}: the run threw — ${e && e.message}`)).finally(() => running.delete(String(id)));
    running.set(String(id), job);
    return { ok: true, started: true, proposal: SW.proposalCardBlock(st.entry) };
  }
  function reject(id, { by = 'user' } = {}) {
    const st = keeper.stepProposal(id, { event: 'reject', by });
    if (!st.ok) return st;
    log.log?.(`[browser-propose] ${id}: rejected by the user — the agent is told at its next navigation to ${st.entry.proposal.site}`);
    return { ok: true, proposal: SW.proposalCardBlock(st.entry) };
  }
  async function run(entry) {
    if (entry && entry.proposal && entry.proposal.kind === 'site-reset') return runSiteReset(entry); // lane site-reset
    const id = entry.id;
    const p = entry.proposal;
    let step = 'starting';
    const progress = (s, percent = null, stalledSec = null) => { step = s; keeper.stepProposal(id, { event: 'progress', progress: { step: s, percent, ...(stalledSec !== null ? { stalledSec } : {}) } }); };
    const fail = (error, code = 'failed') => {
      log.warn?.(`[browser-propose] ${id}: failed while ${step} — ${error}`);
      return keeper.stepProposal(id, { event: 'fail', outcome: { code, step, error: String(error || 'failed').slice(0, 400) } });
    };
    // verify r1 V2: the card is THIS conversation's proposal — its conversation must still be running when anything runs
    // (before the install, and again before the switch: an install takes minutes). Gone ⇒ refused by name, nothing ran —
    // never the 217 MB, never a site, never a switch of a profile ANOTHER conversation may now be using
    const gone = (what) => fail(`the conversation that proposed this is not running any more — ${what}; resume it, then press Approve again`, 'session-gone');
    // verify r1 V2: a switch card names how many OTHER conversations use the profile (their tabs reopen on CloakBrowser,
    // their pages then limited to its site list) — more of them now than the card said ⇒ nothing runs (asked before
    // anything runs, and again before the switch); the agent's next claim makes a new card with the count as it stands
    // (SW.claimVerdict: a stale failure is not the same card)
    const staleOthers = () => {
      if (!p.plan || p.plan.kind !== 'switch' || typeof keeper.proposalOthers !== 'function') return null;
      const n = keeper.proposalOthers(p.plan.profileId, entry.browserKey);
      const said = Number(p.plan.others) || 0;
      return Number.isInteger(n) && n > said ? fail(`${n} other conversation${n === 1 ? ' uses' : 's use'} "${p.plan.profileLabel || p.plan.profileId}" now — this card said ${said}; nothing was switched. Ask the agent to claim again for a card that says so, or switch it yourself in the live view`, 'proposal_stale') : null;
    };
    try {
      if (!sessionFor(entry)) return gone('nothing was installed, added or switched');
      { const st0 = staleOthers(); if (st0) return st0; }
      // (a) THE INSTALL — only when CloakBrowser does not answer; the card's words were its confirm
      if (!inst.exeOk()) {
        // verify r1 V2: a card that said CloakBrowser IS installed carried no download line — its Approve never fetches the
        // 217 MB (it went away after the card was drawn: refused by name, the one way back named)
        if (p.install !== 'needed') return fail('CloakBrowser is not installed any more, and this card did not include its download — nothing was downloaded. Install it from Manage agents (CloakBrowser), then press Approve again', 'install_gone');
        progress('install');
        const pr0 = inst.progress() || {};
        if (!pr0.running) {
          try { await inst.start(); } catch (e) { return fail(e && e.message ? e.message : String(e), (e && e.code) || 'install_failed'); }
        }
        const t0 = now();
        let lastPct = null, lastAt = 0;
        // verify r1 V3: a download that shows NO sign of life (neither its percent nor a byte of its output) for stallMs is
        // SAID on the card — a frozen "downloading 34 %" read as progress for the 15 min the step waits before giving up
        let sign = null, signAt = now(), saidStall = null;
        for (;;) {
          const pr = inst.progress() || {};
          if (!pr.running) break;
          const pct = Number.isFinite(pr.percent) ? pr.percent : null;
          const sign1 = `${pct}|${Number.isFinite(pr.logBytes) ? pr.logBytes : ''}`;
          if (sign1 !== sign) { sign = sign1; signAt = now(); if (saidStall !== null) { saidStall = null; progress('install', pct); lastPct = pct; lastAt = now(); } }
          const still = now() - signAt;
          if (still >= stallMs) {
            const sec = Math.floor(still / 1000);
            if (saidStall === null || sec - saidStall >= 30) { progress('install', pct, sec); saidStall = sec; }
          } else if (pct !== lastPct && now() - lastAt >= progressEveryMs) { progress('install', pct); lastPct = pct; lastAt = now(); }
          if (now() - t0 > installTimeoutMs) return fail(`the install did not finish in ${Math.round(installTimeoutMs / 60000)} min`, 'install_timeout');
          await sleep(pollMs);
        }
        const end = inst.progress() || {};
        if (end.failed) return fail(end.error || 'the install failed', 'install_failed');
        if (!inst.exeOk()) return fail('the install finished but CloakBrowser does not answer', 'install_failed');
      }
      if (!sessionFor(entry)) return gone('CloakBrowser is installed, nothing else was added or switched');
      // (b) THE SITE — only the claim's host (+ the frozen sites its sign-in page loads from), added to the list CloakBrowser may open
      progress('site');
      const aw = SW.allowlistWith(setting('browser.cloak.egressAllowlist', ''), [p.site, ...(Array.isArray(p.alsoSites) ? p.alsoSites : [])]);
      if (aw.added) {
        if (typeof patchSettings !== 'function') return fail('the settings store is not wired here — nothing was switched', 'site_unwritable');
        try { patchSettings({ 'browser.cloak.egressAllowlist': aw.list }); } catch (e) { return fail(`the site could not be added: ${e && e.message}`, 'site_unwritable'); }
      }
      // (c) THE PLAN — exactly the frozen one
      let outcome;
      if (p.plan.kind === 'switch') {
        const st1 = staleOthers(); if (st1) return st1;
        progress('switch');
        let r;
        try { r = await keeper.switchBackend({ profileId: p.plan.profileId, target: 'cloak', by: { kind: 'user' }, browserKey: entry.browserKey, sessionId: entry.sessionId, confirmDowngrade: !!p.plan.confirm }); }
        catch (e) { return fail(e && e.message ? e.message : String(e), (e && e.code) || 'switch_failed'); }
        if (!r || r.mode !== 'switch') return fail(r && r.reason ? r.reason : 'the switch did not run', 'switch_refused');
        outcome = { code: 'switched', label: p.plan.profileLabel || null, profileId: p.plan.profileId, newProfile: false, reopened: (r.reopened || []).filter((x) => x && x.ok).length, siteAdded: aw.added };
      } else if (p.plan.kind === 'new-profile') {
        progress('profile');
        const sess = sessionFor(entry);
        if (!sess) return fail('the conversation is not running any more — nothing was created', 'session-gone');
        let prof;
        try { prof = keeper.createProfile({ label: p.plan.label, provider: 'cloak' }, { owner: { kind: 'instance', id: null }, createdBy: entry.browserKey || null }); }
        catch (e) { return fail(e && e.message ? e.message : String(e), (e && e.code) || 'profile_failed'); }
        try { if (typeof pinConversation === 'function') await pinConversation({ sessionId: sess.id, session: sess.s, browserKey: entry.browserKey, profileId: prof.id }); }
        catch (e) { return fail(`the new profile "${prof.label}" was made but this conversation could not be pointed at it: ${e && e.message}`, (e && e.code) || 'pin_failed'); }
        progress('open');
        try { await keeper.attach({ profileId: prof.id, browserKey: entry.browserKey, sessionId: sess.id, by: 'user' }); }
        catch (e) { return fail(`CloakBrowser did not start for "${prof.label}": ${e && e.message}`, (e && e.code) || 'launch_failed'); }
        progress('reopen');
        const o = await keeper.openInLease({ profileId: prof.id, browserKey: entry.browserKey, url: p.url });
        outcome = { code: 'new-profile', label: prof.label, profileId: prof.id, newProfile: true, reopened: o.ok ? 1 : 0, siteAdded: aw.added, ...(o.ok ? {} : { reopenError: o.error }) };
      } else if (p.plan.kind === 'site') {
        // verify r1 V1: the browser already IS CloakBrowser — the site list was the whole of it (added above)
        outcome = { code: 'site-added', label: p.plan.profileLabel || null, profileId: p.plan.profileId || null, newProfile: false, reopened: 0, siteAdded: aw.added };
      } else {
        return fail('this proposal offers nothing to run', 'proposal_unavailable');
      }
      // (d) THE AGENT IS TOLD — free (the running turn where joining it costs nothing, else the next-turn stash)
      progress('tell');
      let told = 'failed';
      const text = SW.approvedText({ ...p, outcome });
      if (typeof tell === 'function') { try { const r = await tell({ sessionId: entry.sessionId, browserKey: entry.browserKey, text }); told = (r && r.told) || 'failed'; } catch (e) { log.warn?.(`[browser-propose] ${id}: the agent was not told — ${e && e.message}`); } }
      try { if (typeof keeper.tell === 'function' && entry.browserKey) keeper.tell(entry.browserKey); } catch { /* the set's fingerprint: our message IS the telling */ }
      const done = keeper.stepProposal(id, { event: 'done', outcome: { ...outcome, told } });
      log.log?.(`[browser-propose] ${id}: done — ${outcome.code} (profile ${outcome.profileId || '?'}), ${outcome.siteAdded ? p.site + ' added to the cloak sites' : p.site + ' already on the cloak sites'}, the agent ${told}`);
      return done;
    } catch (e) { return fail(e && e.message ? e.message : String(e)); }
  }
  /** lane site-reset: THE USER's Approve of a site-reset proposal — exactly the frozen (profile, host), nothing else. */
  async function runSiteReset(entry) {
    const id = entry.id;
    const p = entry.proposal;
    let step = 'starting';
    const progress = (s) => { step = s; keeper.stepProposal(id, { event: 'progress', progress: { step: s, percent: null } }); };
    const fail = (error, code = 'failed') => {
      log.warn?.(`[browser-propose] ${id}: failed while ${step} — ${error}`);
      return keeper.stepProposal(id, { event: 'fail', outcome: { code, step, error: String(error || 'failed').slice(0, 400) } });
    };
    const label = p.profileLabel || p.profileId;
    try {
      let prof = null; try { prof = typeof keeper.profile === 'function' ? keeper.profile(p.profileId) : null; } catch { prof = null; }
      if (!prof) return fail(`the profile "${label}" is gone — nothing was cleared`, 'profile_gone');
      // the card named how many conversations use the profile — more of them now ⇒ nothing runs (they were not on the card)
      const who = typeof keeper.siteResetHolders === 'function' ? keeper.siteResetHolders(p.profileId) : { holders: p.holders };
      if (Number(who.holders) > Number(p.holders)) return fail(`${who.holders} conversations use "${label}" now — this card said ${p.holders}; nothing was cleared. Ask the agent to ask again for a card that says so, or clear it yourself in the live view`, 'proposal_stale');
      if (typeof clearSite !== 'function') return fail('clearing a site is not wired on this server — nothing was cleared', 'unavailable');
      progress('clear');
      let r;
      try { r = await clearSite(p.profileId, p.site, { onStart: () => progress('start') }); } catch (e) { return fail(e && e.message ? e.message : String(e), (e && e.code) || 'clear_failed'); }
      if (!r || !r.ok) return fail(r && r.error ? r.error : 'the browser did not clear it', (r && r.code) || 'clear_failed');
      // the holders' live views: ONE notice line each (the user's own tab, every conversation's view of this profile)
      if (typeof broadcast === 'function') { try { broadcast({ type: 'browser-site-reset', profileId: p.profileId, host: p.site, cookies: r.cookies || 0, at: now() }); } catch { /* optional */ } }
      progress('tell');
      const outcome = { code: 'cleared', cookies: Number(r.cookies) || 0 };
      let told = 'failed';
      const text = SW.approvedText({ ...p, outcome });
      if (typeof tell === 'function' && sessionFor(entry)) { try { const t = await tell({ sessionId: entry.sessionId, browserKey: entry.browserKey, text }); told = (t && t.told) || 'failed'; } catch (e) { log.warn?.(`[browser-propose] ${id}: the agent was not told — ${e && e.message}`); } }
      const done = keeper.stepProposal(id, { event: 'done', outcome: { ...outcome, told } });
      log.log?.(`[browser-propose] ${id}: done — ${p.site}'s stored login cleared in ${p.profileId} (${outcome.cookies} cookie(s), storage of ${(r.origins || []).join(', ') || 'no origin'}), the agent ${told}`);
      return done;
    } catch (e) { return fail(e && e.message ? e.message : String(e)); }
  }
  /** The agent's navigation to `host`: a proposal of ITS conversation the user REJECTED and it was not told yet ⇒ the one
   *  sentence, and it is told (never again). */
  function rejectionFor({ browserKey, host }) {
    const h = SW.normalizeHost(host);
    if (!h || !browserKey || typeof keeper.proposalsFor !== 'function') return null;
    const hit = keeper.proposalsFor(browserKey).reverse().find((e) => e.proposal.state === 'rejected' && !e.proposal.told && e.proposal.site === h);
    if (!hit) return null;
    const st = keeper.stepProposal(hit.id, { event: 'told' });
    return st.ok ? { id: hit.id, site: h, text: SW.rejectionText(hit.proposal) } : null;
  }
  /** The chat's card source: the conversation's proposals as card blocks. */
  function cardsFor(browserKey) { return typeof keeper.proposalsFor === 'function' ? keeper.proposalsFor(browserKey).map(SW.proposalCardBlock).filter(Boolean) : []; }
  /** A just-filed / repeated claim: its card + For-you item now (the keeper's listener shows a CHANGE; a `same` claim
   *  changed nothing, so it is shown here — the card stays the one card). */
  function filed(result) { if (result && result.proposal && result.claim) { const e = keeper.proposalEntry(result.claim.id); if (e) show(e); } }
  /** lane site-reset step 3: the agent's `site-reset <host>` on a SHARED profile — ONE proposal filed through the keeper
   *  (its card + For-you item follow its change; a duplicate ask shows the same card again). → the agent's answer. */
  function fileSiteReset({ profileId, host, url = '', browserKey = null, sessionId = null } = {}) {
    if (typeof keeper.proposeSiteReset !== 'function') return { ok: false, code: 'shared_profile', error: 'this profile is shared — its site data is cleared only by the user\'s Approve, and no proposal can be filed on this server' };
    const r = keeper.proposeSiteReset({ profileId, host, url, browserKey, sessionId });
    if (!r.ok) return r;
    if (r.duplicate) { const e = keeper.proposalEntry(r.entry.id); if (e) show(e); }
    const p = r.entry.proposal;
    return { ok: true, proposal: { id: r.entry.id, state: p.state, site: p.site, profile: p.profileLabel || p.profileId, holders: p.holders, human: p.human }, duplicate: !!r.duplicate, rejected: !!r.rejected, text: SW.siteResetProposalNext(r) };
  }
  function shutdown() { try { unsub?.(); } catch { /* */ } }
  return { approve, reject, run, rejectionFor, cardsFor, filed, show, fileSiteReset, running: () => [...running.keys()], shutdown };
}

/** lane site-reset: THE clearer a site-reset Approve runs (the wiring and the suites share it): the dialog watch's own socket
 *  on the profile's browser — started first when it does not run (a profile's cookies live in its running Chrome's store;
 *  `onStart` puts that step on the card). → the watch's `clearSite` answer. */
function siteResetClearer({ dialogs, keeper }) {
  return async (profileId, host, { onStart = null } = {}) => {
    if (!dialogs) return { ok: false, code: 'unavailable', error: 'the page watch is not running on this server' };
    let a = await dialogs.arm(profileId, { budgetMs: 3000 });
    if (!a.ok) {
      try { onStart?.(); } catch { /* the card's step only */ }
      await keeper.start(profileId, { why: 'site reset (the user approved)' });
      a = await dialogs.arm(profileId, { budgetMs: 5000 });
      if (!a.ok) return { ok: false, code: 'not_watched', error: `the browser started but VibeSpace could not attach to it (${a.error || 'no CDP endpoint'}) — nothing was cleared` };
    }
    return dialogs.clearSite(profileId, { host });
  };
}

module.exports = { create, siteResetClearer };
