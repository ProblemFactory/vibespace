// «WHAT IT MAY USE» IN SESSION PROPERTIES (unit what-it-may-use — the owner, 2026-11-17: «话说现在似乎没办法根据对话看到它到底
// 有什么channel之类的权限？»). Everything ONE existing conversation may use NOW, door by door, BY WHAT (itself, a Task Group it
// is in, every agent) and where a 「除了」 takes it out — READ from GET /api/may-use (the hub judges with each door's own
// verdict; src/server/may-use.js), DRAWN with the New Session form's own rows (src/lib/may-use-rows.js) in the owner's order
// (sessions, channels, browser, vault, keys, exits, windows, the built-ins last).
//   · ANSWERABLE WHERE IT APPEARS: every row has its door — the resource's own dialog (a profile's «Who can use it», a
//     machine's exit lists, a window's share, the Vault window at the row, the Channels window at the account, the Task
//     Group). A channel account's tick is the form's own (the same access record through the same PUT — app._nsWriteAccess);
//     an account its Task Group grants is ticked and locked with its 「除了」, as there. Nothing else is changed from here.
//   · BOUNDED: a long list shows its first names and the COUNT with the door to the resource's window (no «show more»).
//   · UNKNOWN IS SAID: not running ⇒ judged by what is stored for it (one line); its Task Groups unreadable ⇒ «unknown».
//   · LIVE: the grants store's mirror (StateSync 'grants' — every landed write) and the Task Groups' updates re-ask, coalesced.
//   · ITS OWN CONTAINER decides the shape: the form's accordion below MAY_USE_NARROW_PX, its cards above (280–1440 px).
import { escHtml, fetchJson, showToast, getStateSync } from './utils.js';
import { t, resolveLang } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { sessionDisplayName } from '../session-name.js';
import { provRow, accLine, doorBtn, grantedAccountHtml, tickAccountHtml, authWords } from './may-use-rows.js';
import { groupReach } from './new-session-model.js';
import { openVaultWindow } from './vault-window.js';
import { openWhoDialog } from './browser-who-dialog.js';
import { openExitAccessDialog } from './exit-access-dialog.js';
import { openShareDialog } from './window-share.js';
import { openBrowserProfilesWindow } from './browser-trace-view.js';
import { metaChanged } from '../task-delta.js';
import { grainState } from './channel-filter-editor.js';
import { withoutCreateAccess } from '../new-session-spec.js';

export const MAY_USE_NARROW_PX = 400;
const ic = (k) => UI_ICONS[k] || '';
const quoted = (names) => names.map((n) => t('“{name}”', { name: n })).join(resolveLang() === 'en' ? ', ' : '');
// a Task Group's name: the HUB's answer first (facts.groups — the store's own title, there the moment the grant is), the sidebar's
// list only for a group the answer does not hold (the box run, 主开发 04:23Z: a group made a moment before drew by its id — the
// sidebar had not heard of it yet, while «会话» named it from the answer)
const groupNameOf = (app, id, view = null) => { const own = view && view.facts && Array.isArray(view.facts.groups) ? view.facts.groups.find((g) => g && String(g.id) === String(id)) : null; if (own && own.name) return String(own.name); const g = app.sidebar?._taskById?.(id); return g ? String(g.title || g.name || g.id) : String(id); };

/** Mount the section for one conversation → { el, refresh(), paint(), destroy() }. `getRef()` → { sessionKey, webuiId } (read
 *  again at each refresh — a conversation that just got its id); a tick writes for the id the HUB names it by (the view's cid). */
export function mountMayUse(app, getRef, { onPainted = null } = {}) {   // onPainted: after each answer is drawn (Properties lands its asked scroll then)
  const el = document.createElement('div');
  el.className = 'mu-section';
  el.innerHTML = `<div class="ns-pv-via dim">${escHtml(t('Reading what it may use…'))}</div>`;
  const st = { data: null, error: null, open: {}, seq: 0, narrow: null, timer: null, alive: true };

  async function refresh() {
    const ref = getRef(); if (!ref || !ref.sessionKey) return;
    const seq = ++st.seq;
    const q = new URLSearchParams({ key: ref.sessionKey, ...(ref.webuiId ? { webuiId: ref.webuiId } : {}) });
    const r = await fetchJson(`/api/may-use?${q}`);
    if (!st.alive || seq !== st.seq) return;
    if (r && r.ok && r.view) { st.data = r.view; st.error = null; } else st.error = (r && (r.error || r.code)) || t('server unreachable');
    paint();
    try { if (typeof onPainted === 'function') onPainted(); } catch { }
    try { window.__vsOp?.('may-use-painted', { key: ref.sessionKey }); } catch { }
  }
  const later = () => { clearTimeout(st.timer); st.timer = setTimeout(() => { st.timer = null; if (st.alive && el.isConnected) refresh(); }, 300); };

  // ── how a row admits, in words ──
  function how(r) {
    if (r.state === 'ok') return r.via === 'self' ? t('itself') : r.via === 'group' ? t('through Task Group {name}', { name: quoted([groupNameOf(app, r.groupId, st.data)]) }) : t('all agents');
    if (r.state === 'request') return t('may ask for it — the request comes to you');   // a reach row at «may request»: never «may see»
    if (r.state === 'excepted') return t('left out — Except: {name}', { name: r.except ? exceptName(r.except) : t('this conversation') });
    if (r.state === 'closed') return t('not open to this conversation');   // B-e630: its door («Who can use it») is on the row
    return r.code === 'groups_unreadable' ? t('unknown — its Task Groups could not be read') : r.code === 'automation_unread' ? t('unknown — the automation keys could not be read (nothing is lost)') : r.code === 'window_reach_unread' ? t('unknown — the windows’ share modes could not be read (nothing is lost)') : r.code === 'vault_use_marks_unread' ? t('unknown — the vault-use marks could not be read (nothing is lost; they are read again by itself)') : r.code === 'marks_undecided' ? t('unknown — this entry\'s vault-use marks were damaged; save «Who may use it» on it to decide (nothing is lost)') : t('cannot be read by this release');   // r3104 (a)
  }
  function exceptName(p) {
    if (p.kind === 'group') return groupNameOf(app, p.id, st.data);
    const k = String(p.key || p.id || ''); const bare = k.slice(k.indexOf(':') + 1);
    const s = (app.sidebar?._allSessions || []).find((x) => x.backendSessionId === bare || x.sessionId === bare || x.backendSessionId === k);
    return (s && sessionDisplayName(s)) || t('a conversation not live now');
  }
  const line = (r, door = '', extra = '') => `<div class="ns-pv-via mu-line${r.state === 'ok' ? '' : ' dim'}" data-mu-row="${escHtml(r.door + '|' + r.resource)}"><b>${escHtml(r.name)}</b> · ${escHtml(how(r))}${extra ? ' · ' + escHtml(extra) : ''}${door ? ' ' + door : ''}</div>`;
  const more = (n, door) => (n > 0 ? `<div class="ns-pv-via dim mu-more">${escHtml(t('{n} more', { n }))} ${door}</div>` : '');
  // the rest of each standing, counted with the same door: what it may ask for, what is left out or unknown (a 「除了」 is SAID)
  const moreOf = (x, door) => [more(x.more || 0, door), (x.moreRequest || 0) > 0 ? `<div class="ns-pv-via dim mu-more">${escHtml(t('{n} more it may ask for', { n: x.moreRequest }))} ${door}</div>` : '', (x.moreOut || 0) > 0 ? `<div class="ns-pv-via dim mu-more">${escHtml(t('{n} more left out or unknown', { n: x.moreOut }))} ${door}</div>` : '',
    (x.moreClosed || 0) > 0 ? `<div class="ns-pv-via dim mu-more">${escHtml(t('{n} more not open to it', { n: x.moreClosed }))} ${door}</div>` : ''].join('');   // B-e630: never counted as unknown
  const granted = (rows) => rows.filter((r) => r.state === 'ok').length;
  const none = (words) => `<div class="ns-pv-via dim mu-none">${escHtml(words)}</div>`;

  function paint() {
    const w = el.getBoundingClientRect().width || el.parentElement?.getBoundingClientRect().width || 440;
    st.narrow = w < MAY_USE_NARROW_PX;
    if (st.error) { el.innerHTML = `<div class="ns-pv-via dim">${escHtml(t('Could not read what it may use: {why}', { why: st.error }))}</div>`; return; }
    const v = st.data; if (!v) return;
    const f = v.facts;
    const kinds = Object.fromEntries(v.kinds.map((k) => [k.kind, k]));
    const on = `<span class="ns-on">${escHtml(t('On'))}</span>`;
    const head = `<div class="ns-col-h"><span>${escHtml(t('VibeSpace’s own records — grants by resource; what its Task Groups grant is already ticked'))}</span></div>`
      + (f.live ? '' : `<div class="ns-pv-via dim mu-stored">${escHtml(t('Not running now — judged by what is stored for it'))}</div>`);
    // 会话 — its Task Groups (the form's words) and the sessions it reaches through them
    const groups = f.groups;
    const all = app.sidebar?._allSessions || [];
    const reach = groupReach(groups.map((g) => { const obj = app.sidebar?._taskById?.(g.id); try { return { keys: obj ? [...(app.sidebar?._getTaskSessionKeys?.(obj, all) || [])] : [] }; } catch { return { keys: [] }; } }));
    const names = quoted(groups.map((g) => g.name));
    const reachWords = f.groupsUnknown ? t('Its Task Groups could not be read — what comes through a group is unknown')
      : groups.length === 1 ? t('Joined {names} — can see and message the {n} session(s) in this group; groups it did not join only reach the sessions it starts itself', { names, n: reach.sessions })
        : groups.length ? t('Joined {names} — can see and message the {n} session(s) in these {g} groups; groups it did not join only reach the sessions it starts itself', { names, n: reach.sessions, g: reach.groups })
          : t('No Task Group — it only reaches the sessions it starts itself');
    const sessions = { key: 'sessions', cls: 'locked', data: 'data-row="sessions"', icon: ic('lock'), name: t('Sessions'), what: t('Read, message, start new ones'), end: on, badge: on,
      sub: `<div class="ns-pv-via${groups.length ? '' : ' dim'}" data-reach>${escHtml(reachWords)}</div>`,
      sum: f.groupsUnknown ? t('unknown') : groups.length ? t('Joined {names} · {n} session(s)', { names, n: reach.sessions }) : t('No Task Group — only the sessions it starts') };
    const BUILTIN = [['artifacts', t('Artifacts it makes'), t('The files it writes, shown in this conversation’s Artifacts')], ['feedback', t('Feedback'), t('Tells the maintainers where a tool felt wrong')], ['pages', t('Page publishing'), t('Publishes a page on this VibeSpace')]];
    const builtinRows = BUILTIN.map(([k, n, wds]) => provRow({ cls: 'locked', data: `data-builtin="${k}"`, icon: ic('lock'), name: n, what: wds, end: on })).join('');
    const builtin = { key: 'builtin', cls: 'locked', icon: ic('lock'), name: t('{n} built-ins', { n: BUILTIN.length }), sum: t('Artifacts · Feedback · Page publishing — always on'), badge: on, body: `<div class="ns-card ns-builtin">${builtinRows}</div>` };
    if (f.noAgent) {
      const plain = `<div class="ns-plain">${escHtml(t('A Terminal has no agent: channels, browser profiles and the vault need an agent, so they are not listed. In this shell you sign in and open browsers yourself.'))}</div>`;
      el.innerHTML = head + (st.narrow ? `<div class="ns-res-list">${accLine(sessions, !!st.open.sessions)}</div>` : `<div class="ns-card" data-card="vibespace">${provRow(sessions)}</div>`) + plain;
      return;
    }
    const res = [sessions];
    // 频道 — the form's tick rows, each account's grains under it
    const ch = kinds.channels || { accounts: [], orphans: { rows: [], more: 0 } };
    const accRows = ch.accounts.map((x) => {
      const a = x.account;
      let top;
      if (a.state === 'granted') top = grantedAccountHtml(a, { groupNameOf: (id) => groupNameOf(app, id, st.data), exceptName, quoted });
      else if (a.state === 'own' || a.state === 'none') top = tickAccountHtml(a, { ticked: a.state === 'own', words: [t('Given to this conversation itself · {authority} — untick to take it back', { authority: authWords(a.authority) }), t('Not given — tick to let this conversation see it (draft only)')] });
      else top = `<div class="ns-acc" data-acc-row="${escHtml(a.id)}"><span class="ns-acc-n"><span class="ns-chan-k">${escHtml(a.vendor || a.kind)}</span>${escHtml(a.label)}</span><span class="ns-pv-via dim">${escHtml(a.state === 'excepted' ? t('left out — Except: {name}', { name: a.exceptedBy ? exceptName(a.exceptedBy) : t('this conversation') }) : t('unknown — its Task Groups could not be read'))}</span><span class="ns-acc-end">${doorBtn('chan', t('Channels window'), `data-acc="${escHtml(a.id)}"`)}</span></div>`;
      const chanDoor = doorBtn('chan', t('Channels window'), `data-acc="${escHtml(a.id)}"`);
      const kids = [
        ...x.rules.map((r) => line(r, '', r.detail && r.detail.authority ? authWords(r.detail.authority) : '')), moreOf({ more: x.rulesMore, moreRequest: x.rulesMoreRequest, moreOut: x.rulesMoreOut, moreClosed: x.rulesMoreClosed }, chanDoor),
        ...x.chats.map((r) => line(r, '', r.detail && r.detail.authority ? authWords(r.detail.authority) : '')), moreOf({ more: x.chatsMore, moreRequest: x.chatsMoreRequest, moreOut: x.chatsMoreOut, moreClosed: x.chatsMoreClosed }, chanDoor),
        ...x.watch.map((r) => line({ ...r, name: t('Its notifications wake it — {name}', { name: r.name }) })),
        ...x.api.map((r) => line({ ...r, name: t('Raw API: {tier}', { tier: r.detail.tier }) }, '', r.detail.perDay ? t('{n} a day', { n: r.detail.perDay }) : '')),
      ].join('');
      return top + (kids ? `<div class="mu-kids">${kids}</div>` : '');
    }).join('') + ch.orphans.rows.map((r) => line(r)).join('') + moreOf(ch.orphans, doorBtn('chan', t('Channels window')));   // the rows of an account no longer listed: the same three-way count as every kind
    const chanCount = ch.accounts.filter((x) => x.account.state === 'granted' || x.account.state === 'own').length;
    res.push({ key: 'chan', data: 'data-row="chan"', icon: ic('chat'), name: t('Channels'), what: t('Inbox: read, search, draft — one tick per account'), end: doorBtn('chan', t('Channels window')),
      sub: accRows || none(t('No account connected yet')), sum: t('{n} of {m} account(s)', { n: chanCount, m: ch.accounts.length }) });
    // 浏览器 — profiles (their «Who can use it») and saved web logins (the Vault)
    const br = kinds.browser;
    if (br) {
      const lines = br.remote ? none(t('Sessions on {host} cannot use this machine’s browser profiles', { host: f.host || '' }))
        : [...br.profiles.map((r) => line(r, doorBtn('bprof', t('Who can use it'), `data-id="${escHtml(r.resource)}" data-label="${escHtml(r.name)}"`))), moreOf({ more: br.profilesMore, moreOut: br.profilesMoreOut, moreClosed: br.profilesMoreClosed }, doorBtn('bprofs', t('Agent browser')))].join('') || none(t('No browser profile is open to it'));
      const logins = [...br.logins.map((r) => line(r, doorBtn('vault', t('Vault'), `data-focus="${escHtml(r.resource)}"`))), moreOf({ more: br.loginsMore, moreOut: br.loginsMoreOut, moreClosed: br.loginsMoreClosed }, doorBtn('vault', t('Vault')))].join('');
      res.push({ key: 'browser', data: 'data-row="bprof"', icon: ic('globe'), name: t('Browser'), what: t('Opens a browser with a profile'), sub: lines + (logins ? `<div class="mu-kids">${logins}</div>` : ''),
        sum: br.remote ? t('not on this machine') : t('{n} profile(s) · {m} saved login(s)', { n: granted(br.profiles) + br.profilesMore, m: granted(br.logins) + br.loginsMore }) });   // SHOULD e: the GRANTED ones only
    }
    // 保险库 — entries it may use with no card, and what its jobs are approved to use at each start
    const va = kinds.vault;
    if (va) {
      const hostsOf = (r) => (r.detail && Array.isArray(r.detail.hosts) && r.detail.hosts.length ? t('hosts {list}', { list: r.detail.hosts.slice(0, 3).join(', ') + (r.detail.hosts.length > 3 ? ' …' : '') }) : '');
      const lines = va.locked ? `<div class="ns-pv-via dim mu-none">${escHtml(t('The vault is locked — unlock it in the Vault window to see what it may use there'))} ${doorBtn('vault', t('Vault'))}</div>`
        : [...va.use.map((r) => line(r, doorBtn('vault', t('Vault'), `data-focus="${escHtml(r.resource)}"`), hostsOf(r))), moreOf({ more: va.useMore, moreOut: va.useMoreOut, moreClosed: va.useMoreClosed }, doorBtn('vault', t('Vault'))),
          ...va.jobs.map((r) => line({ ...r, name: t('Job {job} uses {entry} at every start', { job: r.detail.job, entry: r.name.split(' · ')[0] }) }, doorBtn('vault', t('Vault'), `data-focus="${escHtml(r.resource.split('|')[0])}"`))), moreOf({ more: va.jobsMore, moreOut: va.jobsMoreOut, moreClosed: va.jobsMoreClosed }, doorBtn('vault', t('Vault')))].join('')
          || none(t('No vault entry is open to it'));
      res.push({ key: 'vault', data: 'data-fact="vault"', icon: ic('lock'), name: t('Vault'), what: t('By purpose — the agent gets the purpose, never the value'), end: doorBtn('vault', t('Vault')), sub: lines,
        sum: va.locked ? t('locked') : t('{n} entr(ies)', { n: granted(va.use) + va.useMore + granted(va.jobs) + va.jobsMore }) });   // SHOULD e: the GRANTED ones only
    }
    const simple = (kind, key, icon, name, what, door, emptyWords, doorOf) => {
      const k = kinds[kind]; if (!k) return;
      // exits and windows are UNCUT (no window lists them whole — MUST 3): every row is drawn, no count without a door
      const lines = [...k.rows.map((r) => line(r, doorOf(r), r.extra || '')), k.uncut ? '' : moreOf(k, door)].join('') || none(emptyWords);
      res.push({ key, data: `data-row="${key}"`, icon, name, what, end: door, sub: lines, sum: t('{n} granted', { n: granted(k.rows) + (k.more || 0) }) });
    };
    simple('keys', 'keys', ic('link'), t('Automation keys'), t('Keys an outside party uses on its behalf — names only'), doorBtn('keys', t('Automation keys')), t('No automation key is granted to it'),
      (r) => doorBtn('keys', t('Automation keys'), r.detail && r.detail.keyId ? `data-focus="${escHtml('apikey:' + r.detail.keyId)}"` : ''));
    for (const r of (kinds.exits && kinds.exits.rows) || []) r.extra = r.detail && r.detail.grant === 'run' ? t('run commands on it') : t('use its network');
    simple('exits', 'exits', ic('connect'), t('Machines’ exits'), t('Machines that lend it their network, or run commands for it'), '', t('No machine lends it its exit'),
      (r) => doorBtn('exit', t('Who may use it'), `data-host="${escHtml(r.resource.replace(/:(use|run)$/, ''))}" data-label="${escHtml(r.name)}"`));
    simple('windows', 'windows', ic('monitor'), t('Shared windows'), t('Desktop app windows shared with it'), '', t('No desktop window is shared with it'),
      (r) => doorBtn('window', t('Share…'), `data-id="${escHtml(r.resource)}" data-label="${escHtml(r.name)}"`));
    if (st.narrow) el.innerHTML = head + `<div class="ns-res-list" data-card="vibespace">${[...res, builtin].map((r) => accLine(r, !!st.open[r.key])).join('')}</div>`;
    else el.innerHTML = head + `<div class="ns-card" data-card="vibespace">${res.map(provRow).join('')}</div>` + `<div class="ns-card-h"><i class="ns-dot"></i>${escHtml(t('Built in · always on'))}</div><div class="ns-card ns-builtin">${builtinRows}</div>`;
  }

  // ── the doors, the tick, the accordion ──
  el.addEventListener('click', (e) => {
    const tog = e.target.closest('[data-res-tog]');
    if (tog) { const k = tog.dataset.resTog; st.open[k] = !st.open[k]; paint(); return; }
    const d = e.target.closest('[data-door]'); if (!d) return;
    e.preventDefault();
    const ds = d.dataset;
    if (ds.door === 'chan') app.openChannel?.(ds.acc || undefined);
    else if (ds.door === 'vault' || ds.door === 'keys') openVaultWindow(app, ds.focus ? { focus: ds.focus } : {});
    else if (ds.door === 'bprof') openWhoDialog(app, ds.id, { label: ds.label || '' });
    else if (ds.door === 'bprofs') openBrowserProfilesWindow(app);
    else if (ds.door === 'exit') openExitAccessDialog(app, { hostId: ds.host, name: ds.label || '' });
    else if (ds.door === 'window') openShareDialog(app, ds.id, { label: ds.label || '' });
  });
  el.addEventListener('change', async (e) => {
    const box = e.target.closest('input[data-acc]'); if (!box || !st.data) return;
    const cid = st.data.facts && st.data.facts.cid;   // the HUB's id for it (addressableId — never a sidebar row's early webui id)
    const a = ((st.data.kinds.find((k) => k.kind === 'channels') || {}).accounts || []).map((x) => x.account).find((x) => x.id === box.dataset.acc);
    if (!a || !cid) { box.checked = !box.checked; showToast(t('This conversation has no id of its own yet — try again in a moment'), { type: 'error' }); return; }
    box.disabled = true;
    if (box.checked) await app._nsWriteAccess({ id: a.id, label: a.label }, cid);   // THE form's tick writer: the same record, the same PUT
    else await removeAccess(a, cid);
    refresh();
  });
  /** The tick taken back: the account's access list without this conversation's own row, through the same PUT (the list's
   *  stamp; read again once when it moved). */
  async function removeAccess(a, cid, again = true) {
    const g = await grainState({ kind: 'account', adapter: { id: a.id } });
    // SHOULD b: an untick that does nothing SAYS why — never a silent return
    if (!g) { showToast(t('Could not take “{name}” back from this conversation: {why}', { name: a.label || a.id, why: t('its access list could not be read') }), { type: 'error', duration: 9000 }); return; }
    const access = withoutCreateAccess(g.access, cid);
    if (!access) { showToast(t('“{name}” has no tick of this conversation’s own to take back — it comes through a Task Group or every agent (the Channels window)', { name: a.label || a.id }), { duration: 9000 }); return; }
    const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(a.id)}/access`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access, base: g.stamp }) });
    if (r && r.ok) return;
    if (r && r.code === 'grain-changed' && again) return removeAccess(a, cid, false);
    showToast(t('Could not take “{name}” back from this conversation: {why}', { name: a.label || a.id, why: (r && (r.error || r.code)) || t('server unreachable') }), { type: 'error', duration: 9000 });
  }

  // ── live: the grants mirror, the Task Groups, its own width ──
  const sync = getStateSync();
  const onGrant = () => later();
  if (sync) { try { sync.init('grants'); sync.on('grants', '*', onGrant); } catch { } }
  const onMsg = (msg) => { if (msg && msg.type === 'tasks-updated' && metaChanged(msg)) later(); };   // a delta that moves only an Activity line repaints nothing (session-props' rule)
  app.ws?.onGlobal?.(onMsg);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const n = (el.getBoundingClientRect().width || 0) < MAY_USE_NARROW_PX; if (st.data && n !== st.narrow) paint(); }) : null;
  ro?.observe(el);
  refresh();
  return {
    el, refresh, paint,
    painted: () => !!(st.data || st.error),   // an answer (or its refusal) is drawn — the rows stand where a scroll can reach them
    destroy() { st.alive = false; clearTimeout(st.timer); try { sync?.off('grants', '*', onGrant); } catch { } app.ws?.offGlobal?.(onMsg); ro?.disconnect(); },
  };
}
