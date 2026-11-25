// THE PERSON'S GRANT ROWS (the manager design's piece 7, 主开发 2026-11-17 05:02Z): a conversation ended ON PURPOSE is resumed by
// a delivery ONLY when the delivering job or schedule carries the person's grant «may wake its conversation when that
// conversation was ended on purpose» — one field on the job row (src/delivery-wake.js GRANT_FIELD), default no, said ONCE per
// job and it holds. This is the ONE small render helper the person's doors share: the Terminate confirm (src/lib/session-card.js)
// and the proposal card (another lane) — one row per registered job or schedule the conversation owns: its name, its kind,
// its next fire and a tick showing the STORED grant. The rows come from the hub (GET /api/jobs-wake-grants — the PURE
// wakeChoiceRows over the jobs engine's records), and a changed tick is written through the person's own door (POST
// /api/jobs/:id/wake-grant — a press on this page; an agent's token is refused by name).
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { stampAt } from './page-time.js';

/** the conversation's rows → [{id, name, kind, nextAt, grant}] | [] (none owned, or the jobs engine is not up) */
export async function loadWakeGrantRows(conversationId) {
  if (!conversationId) return [];
  const r = await fetchJson(`/api/jobs-wake-grants?conversation=${encodeURIComponent(conversationId)}`);
  if (r && r.code === 'records-unread') return Object.assign([], { held: true });   // B-f276 (r3230's table): the records are unread — never «none owned»
  return r && Array.isArray(r.rows) ? r.rows : [];
}
/** the line a door shows instead of the rows while Background Work cannot read its records (rows.held) */
export function wakeGrantHeldNode() {
  const box = document.createElement('div');
  box.className = 'wake-grant-rows wake-grant-held';
  box.textContent = t('This conversation’s jobs cannot be listed right now: Background Work cannot read its records. They keep the wake choices they have — change them in Background Work once its records read again.');
  return box;
}

/** the rows as a node + what the person changed. `rows` = loadWakeGrantRows's. → {node, changes(): [{id, grant}]}
 *  `head` = the line above the rows (lane login-request-card's proposal card says its own: which conversation each job wakes, and
 *  that a wake is a billed turn — the cure's laws 1 and 7); a row that carries `owner` {name, key} names the conversation it wakes. */
export function wakeGrantRowsNode(rows, { now = Date.now(), head: headWords = null } = {}) {
  const box = document.createElement('div');
  box.className = 'wake-grant-rows';
  const head = document.createElement('p');
  head.className = 'dialog-hint wake-grant-head';
  head.textContent = headWords || t('Jobs and schedules it owns — a ticked one may resume it later to deliver its result:');
  box.appendChild(head);
  const ticks = [];
  for (const r of rows || []) {
    const row = document.createElement('label');
    row.className = 'wake-grant-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = r.grant === true;
    cb.dataset.id = r.id;
    const name = document.createElement('span');
    name.className = 'wake-grant-name';
    name.textContent = r.name;   // a job's name is the agent's words: text, never markup
    const fact = document.createElement('span');
    fact.className = 'wake-grant-fact';
    const bits = [r.kind === 'schedule' ? t('Scheduled') : t('Task')];
    if (Number(r.nextAt) > now) bits.push(t('next run {when}', { when: stampAt(Number(r.nextAt), { words: true }) }));
    fact.textContent = bits.join(' · ');
    row.append(cb, name, fact);
    if (r.owner && (r.owner.name || r.owner.key)) { const o = document.createElement('span'); o.className = 'wake-grant-owner'; o.textContent = t('wakes «{name}»', { name: String(r.owner.name || r.owner.key) }); row.appendChild(o); }   // the conversation THIS job would resume (a conversation's name: text, never markup)
    const who = grantByWords(r.by);   // WHO allowed it, and when (the stored grant's own record)
    if (who) { const w = document.createElement('span'); w.className = 'wake-grant-by'; w.textContent = who; row.appendChild(w); }
    box.appendChild(row);
    ticks.push({ cb, was: r.grant === true, id: r.id });
  }
  return { node: box, changes: () => ticks.filter((x) => x.cb.checked !== x.was).map((x) => ({ id: x.id, grant: x.cb.checked })) };
}

/** write the changed grants (each through the person's door); a refusal is said, never swallowed. → how many were written */
export async function saveWakeGrants(changes) {
  let n = 0;
  for (const c of changes || []) {
    const r = await fetchJson(`/api/jobs/${encodeURIComponent(c.id)}/wake-grant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant: c.grant === true }) });
    if (!r || r.error) showToast((r && r.error) || t('Save failed'), { type: 'error' });
    else n++;
  }
  return n;
}

/** THE TERMINATE DOOR's use: null when the conversation owns no registered job or schedule (today's confirm, unchanged), else
 *  {node, save} — the node goes into the confirm, `save` runs after the person confirms and BEFORE the end. */
export async function wakeGrantDoor(session) {
  const cid = session && (session.backendSessionId || session.claudeSessionId);
  let rows = [];
  try { rows = await loadWakeGrantRows(cid); } catch { rows = []; }
  if (!rows.length) return rows.held ? { node: wakeGrantHeldNode(), save: async () => 0 } : null;   // held: said, and nothing is changed
  const v = wakeGrantRowsNode(rows);
  return { node: v.node, save: () => saveWakeGrants(v.changes()) };
}

/** THE ENDED ROW'S WAITING LINE (piece 7 — the row, the bar and the sidebar card): the hub's `waiting` fact {n, code, until} on a
 *  STOPPED row → «{n} notices are waiting for it», after a refused wake «— not resumed: {why}» (a limit says until when, in
 *  the viewer's zone). '' when nothing waits. `fmt` = the page's one time formatter (page-time stampAt). */
export function waitingWords(w, fmt) {
  const n = w && Number(w.n);
  // r3299 row 7: the stash HELD — said on every stopped row (what waits is not known: never «nothing waiting»), beside a count it has
  if (w && w.stashUnread) { const held = t('the list of messages waiting could not be read just now — VibeSpace reads it again by itself'); return n > 0 ? `${t('{n} notices are waiting for it', { n })} · ${held}` : held; }
  if (!n || n < 1) return '';
  const code = w.code || null;
  if (!code) return t('{n} notices are waiting for it', { n });
  if (code === 'limit' && w.until && typeof fmt === 'function') return t('{n} notices are waiting — not resumed: its account is at its limit until {when}', { n, when: fmt(w.until) });
  if (code === 'readopt-pending') return t('{n} notices are waiting — they go by themselves once VibeSpace has re-adopted the conversations left running on its paired machines', { n });
  if (code === 'spend-held') return t('{n} notices are waiting — not woken yet: VibeSpace could not judge its spending limits just now; it asks again once that clears', { n });   // B-ef83 unit 1: the gate could not judge (its record held) — the wake is OWED to that hold's lift, asked once   // the stores chain's two roads: a wake that WAITS (it goes by itself), never «not resumed»
  return t('{n} notices are waiting — not resumed: {why}', { n, why: refusalWords(code) });
}
/** a refusal's code in the person's words (the ended row's «— not resumed: {why}», the resumed window's «— but …») */
export function refusalWords(code) {
  return code === 'ended_on_purpose' ? t('it was ended on purpose, and none of them may resume it')
    : code === 'ended_unknown' ? t('how it ended is not known')
      : code === 'spend' ? t('the spend ceiling refused')
        : code === 'identity' ? t('the account it would bill cannot be named')
          : code === 'limit_unread' ? t('its account\u2019s limit could not be read')
            : code === 'goal_active' ? t('its goal would carry on by itself — resume it yourself')
              : code === 'timer_marked' ? t('it set a timer that would carry on by itself — resume it yourself')
                : code === 'goal_unknown' ? t('it may carry on a goal by itself — resume it yourself')
              : code === 'queue_unknown' || code === 'queue_kept' ? t('it may run prompts still queued for it by itself — resume it yourself')
                : code === 'harness_unread' ? t('what its resume starts by itself is not known — resume it yourself')
                  : code === 'needs_a_page' || code === 'cannot_resume' ? t('it resumes only in a window')
                    : code === 'archived' ? t('it is archived')
                      : code === 'unpaired' ? t('its machine is no longer paired — open the conversation to read what waits')   // B-2566's remainder (r1397 (7))
                      : code === 'no_link' ? t('whether it runs cannot be asked of its machine — the words wait for its next turn')   // r1397 (1)
                      : code === 'agent_older' ? t('its device agent is older: update it — the words wait for its next turn')   // B-95fc U1: a paired machine whose agent cannot say whether the conversation ended there
                      : code === 'no_mid_session' ? t('its agent takes no message mid-session — the words wait for its next turn')
                      : code === 'inbox_gone' ? t('it ended again before its agent opened its inbox')
                      : code === 'inbox_not_open' ? t('its agent did not open its inbox in time — the words wait for its next turn')   // place-8: resumed, its CLI never answered to its inbox
                      : code === 'handover_failed' ? t('the hand-over did not land')
                        : t('the resume failed');
}
/** who allowed a grant, and when (the job row's wakeGrantBy) → '' when none */
export function grantByWords(by) {
  if (!by) return '';
  const when = by.at ? stampAt(Number(by.at), { words: true }) : '';
  if (by.kind === 'key') return when ? t('allowed by the key «{name}», {when}', { name: String(by.name || '—'), when }) : t('allowed by the key «{name}»', { name: String(by.name || '—') });
  return when ? t('allowed by you, {when}', { when }) : t('allowed by you');
}
/** the same line for an ended WINDOW: its conversation's stopped row in the sidebar's list (the rows the window's read-only bar reads) */
export function endedWaitLine(backend, id, rows, fmt) {
  if (!id || !Array.isArray(rows)) return '';
  const r = rows.find((x) => x && (x.backendSessionId === id || x.sessionId === id) && (x.backend || 'claude') === (backend || 'claude'));
  return r && r.status === 'stopped' && r.waiting ? waitingWords(r.waiting, fmt) : '';
}
