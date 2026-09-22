'use strict';
// PURE (imports nothing; CJS so the bundle and node share it): the NAME of a
// Workflow run as the chips show it (2.369.136/.137, owner: "这个workflow没有
// 展示正确的名称" then "这个任务名称是不是太长了"). A run launched through
// `scriptPath` has no `input.name`; its launch ack carries the run's whole
// description on a "Summary:" line. The chip gets a SHORT label, the whole
// line rides beside it as `summary` (tooltip / detail).

/** The whole name/description a launch ack + tool input can yield, or ''. */
function workflowNameFromAck(input, resultText) {
  const txt = String(resultText || '');
  return txt.match(/Workflow ["\u201c]([^"\u201d\n]+)["\u201d]/)?.[1]
    || txt.match(/^Summary:\s*(.+?)\s*$/m)?.[1]
    || (input && input.name)
    || String((input && input.script) || '').match(/export\s+const\s+meta\s*=\s*\{[^}]*?\bname\s*:\s*['"]([^'"]+)['"]/)?.[1]
    || String((input && input.scriptPath) || '').split('/').pop()?.replace(/\.[cm]?js$/, '')
    || '';
}

/** A chip-sized label: a short name stays whole; an id-like head before ':' or
 *  ' — ' wins (≤ 40 chars, no spaces); else the first clause (≤ 60 chars); else
 *  a word-boundary cut near 48 chars with an ellipsis. */
function shortWorkflowName(nm) {
  const s = String(nm || '').trim();
  if (s.length <= 48) return s;
  const head = s.split(/\s+[—–-]\s+|:\s+/)[0].trim();
  if (head && head.length <= 40 && !/\s/.test(head)) return head;
  const clause = s.split(/\s+[—–-]\s+|[:;,.]\s+/)[0].trim();
  if (clause.length <= 60) return clause;
  const cut = s.slice(0, 48);
  return cut.slice(0, Math.max(24, cut.lastIndexOf(' '))).trim() + '…';
}

module.exports = { workflowNameFromAck, shortWorkflowName };
