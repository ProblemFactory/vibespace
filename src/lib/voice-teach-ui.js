// Dropline voice input P1 (lane voice-p1-oauth-teach): the plugin card's ACCOUNT row (Connect with Fish Audio in a new
// tab / 已连接 / Disconnect) and its TEACH section (owner 2026-10-12: nothing leaves without the person's press) — the
// switches (teach, context; both default off) with the privacy sentence, the proposal cards (≤ 12 word chips, 加入所选 (n) /
// 忽略这批, the per-project tier), the per-project list, the journal + the dropline.fish.audio/app link; and the context
// PREVIEW dialog the microphone opens after the first dictation of a conversation (发送 / 不发).
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';

const MEMORY_URL = 'https://dropline.fish.audio/app';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const voiceApi = (url, body) => fetchJson(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw Object.assign(new Error(x.message || x.error), { code: x.error }); return x; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** the account row: who is connected by OAuth, or the Connect button (never dead: without https it says why) */
export function renderAccountRow(box, st, rerender) {
  const a = (st && st.account) || {};
  const row = el('div', 'plugin-cfg-row voice-account');
  const words = el('div', 'plugin-detail voice-account-words');
  if (a.tier === 'oauth' && a.state === 'connected') {
    words.classList.add('voice-ok');
    words.textContent = t('Connected: {account}', { account: `${a.name || ''}${a.team ? ' · ' + a.team : ''}` });
    const off = el('button', 'mounts-btn voice-disconnect', t('Disconnect'));
    off.onclick = async () => {
      off.disabled = true;
      try { await voiceApi('/api/voice/oauth/disconnect', {}); showToast(t('Disconnected here — Fish Audio keeps the permission until you remove it at fish.audio')); rerender(); } catch (e) { showToast(e.message, { type: 'error' }); off.disabled = false; }
    };
    row.append(words, off);
    box.appendChild(row);
    return;
  }
  if (a.tier === 'key') return; // the person's own key outranks the OAuth tier — the key row says it
  const go = el('button', 'mounts-btn mounts-btn-primary voice-connect', t('Connect with Fish Audio'));
  if (a.state === 'reconnect') { words.classList.add('plugin-cfg-warn'); words.textContent = t('Your Dropline sign-in has expired — connect again'); }
  const needs = t('Connecting needs an https address: turn on Tailscale HTTPS, or paste a Dropline key');
  if (!st.connectVia) { words.classList.add('plugin-cfg-warn'); words.textContent = needs; }
  go.onclick = async () => {
    const tab = window.open('about:blank', '_blank');  // opened in the press itself (a later open is a blocked pop-up)
    go.disabled = true;
    try {
      const r = await voiceApi('/api/voice/oauth/start', { origin: location.origin });
      if (tab) tab.location.href = r.url; else window.open(r.url, '_blank');
      words.className = 'plugin-detail voice-account-words'; words.textContent = t('Finish the sign-in in the new tab (Fish Audio mails you a code)…');
      for (let i = 0; i < 400; i++) {
        await sleep(1500);
        const f = await voiceApi(`/api/voice/oauth/flow/${encodeURIComponent(r.flowId)}`);
        if (f.done) { if (!f.ok) throw new Error(f.error || t('Failed')); showToast(t('Dropline connected')); break; }
      }
      rerender();
    } catch (e) {
      try { if (tab) tab.close(); } catch { }
      words.className = 'plugin-detail plugin-cfg-warn voice-account-words';
      words.textContent = e.code === 'needs-https' ? needs : e.message;
      go.disabled = false;
    }
  };
  row.append(go);
  box.append(row, words);
}

const fmtTime = (at) => { const d = new Date(at); return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };
// a chip's title: why this word is here (proposalCandidates' why + counts)
const whyWords = (w) => (!w ? '' : w.byPerson > 1 ? t('You wrote this {n} times', { n: w.byPerson }) : w.byPerson === 1 ? t('You wrote this once')
  : w.why === 'file' ? t('A file name') : t('Seen {n} times here', { n: w.seen }));
const projectName = (cwd) => String(cwd || '').replace(/\/+$/, '').split('/').pop() || cwd;

/** the teach section (shown once connected): switches + sentence, proposals, projects, journal */
export async function renderTeachSection(box, rerender) {
  const sec = el('div', 'voice-teach');
  box.appendChild(sec);
  let v;
  try { v = await voiceApi('/api/voice/teach'); } catch (e) { sec.appendChild(el('div', 'plugin-detail plugin-cfg-warn', e.message)); return; }
  // the teach / context switches are settings rows (All Settings › Plugins › Voice input · Dropline — lane plugin-settings-p0)
  sec.append(
    el('div', 'voice-teach-head', t('Teach Dropline')),
    el('div', 'plugin-detail voice-teach-why', t('Sends the names, terms and file names in the current conversation to Dropline (Fish Audio) — only what you confirm. Credentials, attachments and other conversations are never sent.')),
  );
  if (!v.settings.teach) sec.appendChild(el('div', 'plugin-detail plugin-cfg-hint voice-teach-off', t('Suggesting words is off — turn it on in All Settings › Plugins › Voice input · Dropline.')));
  for (const p of v.proposals) {
    const card = el('div', 'voice-proposal');
    card.dataset.id = p.id;
    card.appendChild(el('div', 'voice-proposal-title', t('Dropline suggests adding to your dictionary') + (p.title ? ` — ${p.title}` : '')));
    card.appendChild(el('div', 'plugin-detail voice-proposal-why', t("Names and identifiers this conversation used twice or more (the words dictation gets wrong most) — secrets and placeholders are not here")));
    // ≤ 12 chips (lane voice-teach-candidates): a press toggles one; only the plausible words start selected; the count is live
    const picked = new Set(Array.isArray(p.pick) ? p.pick : []);
    const terms = el('div', 'voice-proposal-terms');
    const add = el('button', 'mounts-btn mounts-btn-primary voice-proposal-add');
    const chosen = () => [...terms.querySelectorAll('.voice-term[aria-pressed="true"]')].map((x) => x.dataset.term);
    const count = () => { const n = chosen().length; add.textContent = t('Add selected ({n})', { n }); add.disabled = !n; };
    for (const term of p.terms) {
      const chip = el('button', 'voice-term', term);
      chip.type = 'button'; chip.dataset.term = term; chip.title = whyWords((p.why || {})[term]);
      chip.setAttribute('aria-pressed', String(picked.has(term)));
      chip.onclick = () => { chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')); count(); };
      terms.appendChild(chip);
    }
    count();
    const skip = el('button', 'mounts-btn voice-proposal-ignore', t('Ignore this batch'));
    add.onclick = async () => {
      const pick = chosen();
      if (!pick.length) return;
      add.disabled = skip.disabled = true;
      try { const r = await voiceApi(`/api/voice/teach/proposal/${encodeURIComponent(p.id)}`, { verb: 'add', terms: pick }); showToast(t('Added {n} · skipped {m}', { n: r.added.length, m: r.skipped.length })); rerender(); } catch (e) { showToast(e.message, { type: 'error' }); add.disabled = skip.disabled = false; }
    };
    skip.onclick = async () => {
      add.disabled = skip.disabled = true;
      try { await voiceApi(`/api/voice/teach/proposal/${encodeURIComponent(p.id)}`, { verb: 'ignore' }); rerender(); } catch (e) { showToast(e.message, { type: 'error' }); add.disabled = skip.disabled = false; }
    };
    const acts = el('div', 'voice-proposal-actions');
    acts.append(add, skip);
    card.append(terms, acts);
    if (p.cwd && !v.settings.autoProjects.includes(p.cwd)) {
      const l = el('label', 'voice-switch voice-project-auto');
      const cb = el('input'); cb.type = 'checkbox';
      cb.onchange = () => voiceApi('/api/voice/teach/settings', { autoProject: { cwd: p.cwd, on: cb.checked } }).then(() => rerender()).catch((e) => showToast(e.message, { type: 'error' }));
      l.append(cb, document.createTextNode(' ' + t("Add this project's file names and identifiers automatically — don't ask again ({project})", { project: projectName(p.cwd) })));
      card.appendChild(l);
    }
    sec.appendChild(card);
  }
  if (v.settings.autoProjects.length) {
    const list = el('div', 'voice-projects');
    list.appendChild(el('div', 'plugin-detail', t('Projects whose file names and identifiers go without asking (≤ 50 an hour, journaled):')));
    for (const cwd of v.settings.autoProjects) {
      const r = el('div', 'voice-project-row');
      const x = el('button', 'mounts-btn voice-project-off', '✕');
      x.title = t('Ask again for this project');
      x.onclick = () => voiceApi('/api/voice/teach/settings', { autoProject: { cwd, on: false } }).then(() => rerender()).catch((e) => showToast(e.message, { type: 'error' }));
      r.append(el('span', 'voice-project-name', projectName(cwd)), x);
      r.title = cwd;
      list.appendChild(r);
    }
    sec.appendChild(list);
  }
  const j = el('div', 'voice-journal');
  j.appendChild(el('div', 'voice-teach-head', t('Sent to Dropline')));
  if (!v.journal.length) j.appendChild(el('div', 'plugin-detail', t('Nothing sent yet.')));
  for (const e of v.journal.slice(0, 12)) {
    const kind = e.kind === 'context' ? t('memory') : e.auto ? t('words (this project)') : t('words');
    const counts = e.kind === 'terms' ? ` · ${t('Added {n} · skipped {m}', { n: e.added, m: e.skipped })}` : '';
    j.appendChild(el('div', 'voice-journal-row', `${fmtTime(e.at)} · ${kind} · ${e.title || ''} · ${t('{n} chars', { n: e.chars })}${counts}`));
  }
  const link = el('a', 'voice-memory-link', t('See or clear your Dropline memory at dropline.fish.audio/app'));
  link.href = MEMORY_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
  j.appendChild(link);
  sec.appendChild(j);
}

/** the FIRST context send of a conversation: the exact text, 发送 / 不发 — resolves true when sent */
export function showContextPreview(preview) {
  return new Promise((resolve) => {
    const back = el('div', 'voice-preview-back');
    const dlg = el('div', 'voice-preview');
    dlg.setAttribute('role', 'dialog');
    const title = el('div', 'voice-preview-head', t("Send this to Dropline's memory?"));
    const meta = el('div', 'plugin-detail voice-preview-meta', `${preview.title} · ${t('source')}: ${preview.source} · ${t('{n} chars', { n: preview.text.length })}`);
    const body = el('pre', 'voice-preview-text', preview.text);
    const note = el('div', 'plugin-detail', t('Dropline keeps it for two weeks to spell your words right. Later updates of this conversation go without asking while the switch is on.'));
    const send = el('button', 'mounts-btn mounts-btn-primary voice-preview-send', t('Send'));
    const no = el('button', 'mounts-btn voice-preview-skip', t("Don't send"));
    const acts = el('div', 'voice-proposal-actions');
    acts.append(send, no);
    dlg.append(title, meta, body, note, acts);
    back.appendChild(dlg);
    document.body.appendChild(back);
    const done = async (yes) => {
      send.disabled = no.disabled = true;
      let ok = false;
      try { const r = await voiceApi(`/api/voice/teach/preview/${encodeURIComponent(preview.id)}`, { send: yes }); ok = !!r.sent; if (ok) showToast(t('Sent to Dropline')); } catch (e) { showToast(e.message, { type: 'error' }); }
      back.remove();
      resolve(ok);
    };
    send.onclick = () => done(true);
    no.onclick = () => done(false);
  });
}

/** after a dictation landed: tell the hub what this conversation said (teach / context on) — never with both off */
export async function teachAfterDictation(st, facts) {
  if (!st || (!st.teach && !st.context) || !facts || !facts.conv) return null;
  const r = await voiceApi('/api/voice/teach/seen', facts).catch(() => null);
  if (r && r.preview) await showContextPreview(r.preview);
  return r;
}
