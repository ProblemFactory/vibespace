// THE SUBAGENT CARD + THE conversation:// LINK — PURE, no DOM (lane agy-subagent-cards, 2026-10-21; the owner, in an
// Antigravity conversation: «使用子代理的时候怎么没有子代理卡片查看细节»). The ACP normalizer turns the agy wrapper's
// `subagent` record into a tool message whose taskInfo names the sub (src/acp-message-manager.js _processSubagent):
// {subId, agentRole, typeName, status, startedAt, endedAt, elapsedMs, steps, files, taskTitle} + the block's input.prompt
// (the task the parent gave) and output (the sub's answer). Every one of those strings is AGENT-WRITTEN (the parent
// wrote the task and the role, the sub the answer): escaped here, the answer through the one markdown sanitizer.
// The card opens the sub's timeline (the virtual session sub-<subId>); its button carries data-sub-id.
// The agent's text links its subagents as [`<id>`](conversation://<id>) — DOMPurify keeps no unknown scheme, so the
// target is MARKED in the markdown (a fragment the sanitizer keeps) and turned into our `.chat-link` span with data-sub after
// it; a sub this conversation's cards do not know gets the chip that says so (`file:` links are another lane's).

const SUB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARK = '#vs-conversation-';
const esc0 = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A duration as h:mm:ss / m:ss (the sleep countdown's spelling — no unit words to translate). */
export function fmtElapsed(ms) {
  const left = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The MARKDOWN → every link target `](conversation://<id>)` replaced by a fragment mark the sanitizer keeps (the
 *  renderer's one sanitize line stays as it is — test-approval-census pins it). */
export function markConversationLinks(md) {
  if (typeof md !== 'string' || !md.includes('conversation://')) return md;
  return md.replace(/\]\(conversation:\/\/([0-9A-Fa-f-]{36})\/?\)/g, (m, id) => (SUB_ID.test(id) ? `](${MARK}${id.toLowerCase()})` : m));
}
/** The SANITIZED HTML → each marked link becomes `<span class="chat-link chat-sub-link" data-sub="<id>">`; `known(id)`
 *  false ⇒ the span also carries the chip «unknown subagent». The inner HTML is the sanitizer's own output. */
export function conversationLinksHtml(html, { known = () => true, t = (s) => s, escHtml = esc0 } = {}) {
  return String(html || '').replace(/<a href="#vs-conversation-([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/a>/g, (m, id, inner) => {
    if (!SUB_ID.test(id)) return m;
    if (known(id)) return `<span class="chat-link chat-sub-link" data-sub="${id}" title="${escHtml(t('Open this subagent'))}">${inner}</span>`;
    return `<span class="chat-link chat-sub-link chat-sub-unknown" data-sub="${id}" title="${escHtml(t('This conversation started no subagent with this id that VibeSpace could read'))}">${inner} <span class="chat-sub-chip">${escHtml(t('unknown subagent'))}</span></span>`;
  });
}

/** Does a tool row START a subagent? By what it carries: claude's Task / Agent, agy's invoke_subagent, opencode's `task`
 *  tool (its ACP title, input {description, prompt, subagent_type} — read from opencode's source, not measured here). */
export function isSubagentToolRow(block, msg) {
  const title = String((msg && msg.backendMeta && msg.backendMeta.title) || (block && block.toolName) || '').toLowerCase();
  const inp = block && block.input;
  return /^(task|agent|invoke_subagent|spawn_agent)$/.test(title) || !!(inp && typeof inp === 'object' && 'subagent_type' in inp);
}

/** The card's HTML. `h` = {t, escHtml, linkifyText(raw), renderMarkdown(raw), clickablePath(p), statusChip, icon, now}. */
export function subagentCardHtml(msg, h = {}) {
  const t = h.t || ((s) => s), esc = h.escHtml || esc0;
  const ti = (msg && msg.taskInfo) || {};
  const block = (msg && Array.isArray(msg.content) && msg.content[0]) || {};
  const id = SUB_ID.test(String(ti.subId || '')) ? String(ti.subId) : '';
  const role = String(ti.agentRole || ti.description || (block.input && block.input.description) || '');
  const type = String(ti.typeName || '');
  const running = ti.status === 'running';
  const now = Number(h.now) || 0;
  const since = Number(ti.startedAt) || 0;
  const elapsed = running ? (since && now ? fmtElapsed(now - since) : '') : (ti.elapsedMs != null ? fmtElapsed(ti.elapsedMs) : '');
  const elapsedHtml = elapsed ? ` <span class="chat-sub-elapsed"${running && since ? ` data-sub-since="${since}"` : ''} title="${esc(running ? t('running for') : t('ran for'))}">${esc(elapsed)}</span>` : '';
  const typeHtml = type && type !== role ? ` <span class="chat-agent-model">${esc(type)}</span>` : '';
  const btn = id ? ` <button class="chat-agent-view-btn" data-sub-id="${id}" data-parent-tool-id="${esc(msg.toolCallId || '')}" data-desc="${esc(role)}">${esc(t('Open timeline'))}</button>` : '';
  const task = String((block.input && block.input.prompt) || '');
  const title = String(ti.taskTitle || '');
  const taskHtml = task ? `<details class="chat-diff"><summary class="chat-diff-summary">${esc(t('Task'))}${title ? ` <span class="chat-sub-task-title">${esc(title)}</span>` : ''}</summary><pre>${h.linkifyText ? h.linkifyText(task) : esc(task)}</pre></details>` : '';
  const result = String(block.output || '');
  const first = (ti.summary ? String(ti.summary) : result).split('\n').find((l) => l.trim()) || '';
  let outHtml;
  if (running) outHtml = `<div class="chat-tool-output-pending"><span class="chat-spinner" aria-hidden="true"></span> ${esc(t('working…'))}</div>`;
  else if (result) outHtml = `<details class="chat-diff"><summary class="chat-diff-summary">${ti.status === 'completed' ? '✓ ' : ''}${esc(first.slice(0, 160))}</summary><div class="chat-text">${h.renderMarkdown ? h.renderMarkdown(result) : esc(result)}</div></details>`;
  else outHtml = `<div class="chat-sub-noanswer">${esc(t('It sent no answer'))}</div>`;
  const files = (Array.isArray(ti.files) ? ti.files : []).filter((f) => typeof f === 'string' && f);
  const filesHtml = files.length ? `<div class="chat-sub-files">${esc(t('Files it wrote'))}: ${files.map((f) => (h.clickablePath ? h.clickablePath(f) : esc(f))).join(' · ')}</div>` : '';
  return `<div class="chat-tool-use chat-sub-card"${id ? ` data-sub-id="${id}"` : ''}><span class="chat-tool-label">${h.icon || ''} ${esc(t('Subagent'))}: ${esc(role || t('Subagent'))}${typeHtml}${h.statusChip || ''}${elapsedHtml}${btn}</span>${taskHtml}${outHtml}${filesHtml}</div>`;
}
