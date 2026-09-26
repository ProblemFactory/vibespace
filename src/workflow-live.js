'use strict';
// PURE (imports nothing): ONE live view of a Workflow run for BOTH surfaces
// (2.369.119, owner: "怎么这个内外实现还不一样？" — the chat card showed phases
// and labels live from the CLI's task_progress tree while the View Workflow
// window showed "(agent)" placeholders until the run finished).
//
// Two sources describe a LIVE run:
//   • the DISK view (src/workflow-disk.js parseRunDir, 2026-09-26): agent ids,
//     the journal's started/done/superseded attempts, and — since CLI 2.1.267 —
//     each agent's label + phase from the journal and its meta file, plus the
//     run's liveness from the files' mtimes; the only thing a window can see
//     after a restart or from another client, and the only thing that knows
//     about retries;
//   • the STREAM tree (message-manager normalizeWorkflowProgress, kept
//     field-wise on taskInfo.workflow): phases, labels, states, last tool,
//     model — what the chat card renders, live, from the harness's own records.
// mergeLiveWorkflow lays the tree over the skeleton by agentId so the window
// says exactly what the card says, keeps the journal's retry verdicts (a
// superseded attempt stays superseded), and lists disk-only agents (a
// transcript the tree has not named yet) under their DISK phase (or a
// trailing "Agents" phase when the files name none).

/** Tree state → the window's STATE_META vocabulary. */
function windowState(treeState, journalState) {
  if (journalState === 'superseded') return 'superseded';
  if (journalState === 'done' && treeState !== 'error') return 'done';
  switch (treeState) {
    case 'done': return 'done';
    case 'error': return 'error';
    case 'running': return 'progress';
    case 'queued': return 'queued';
    case 'skipped': return 'skipped';
    default: return journalState || 'progress';
  }
}

/**
 * @param {object} skeleton  a live view from the disk (status 'running', live true, phases[0].agents = disk agents)
 * @param {{phases?:Array<{index:number,title:string}>, agents?:Array<object>}|null} tree  taskInfo.workflow (or null)
 * @param {{totalTokens?:number|null, toolUses?:number|null, durationMs?:number|null}|null} usage  taskInfo.usage (or null)
 * @returns {object} the skeleton when there is no tree; otherwise the merged view with liveTree: true
 */
function mergeLiveWorkflow(skeleton, tree, usage) {
  if (!skeleton || !tree || !Array.isArray(tree.agents) || !tree.agents.length) return skeleton;
  const disk = new Map();
  for (const ph of skeleton.phases || []) for (const ag of ph.agents || []) if (ag && ag.agentId) disk.set(String(ag.agentId), ag);
  const seen = new Set();
  const byPhase = new Map();
  const put = (k, ag) => (byPhase.get(k) || byPhase.set(k, []).get(k)).push(ag);
  const titleOf = new Map((tree.phases || []).filter((p) => p && Number.isFinite(p.index)).map((p) => [p.index, p.title || '']));
  // a phase the DISK names (journal/meta, src/workflow-disk.js) and the tree does
  // not: the tree's phase of the same title when there is one, else a trailing
  // phase of its own after the tree's (2026-09-26 — disk wins for label/phase
  // wherever the tree lacks them)
  let synth = 1e6;
  const synthByTitle = new Map();
  const keyForTitle = (title) => {
    for (const [k, v] of titleOf) if (v === title) return k;
    if (!synthByTitle.has(title)) { const k = synth++; synthByTitle.set(title, k); titleOf.set(k, title); }
    return synthByTitle.get(title);
  };
  for (const a of tree.agents) {
    if (!a || typeof a !== 'object') continue;
    const id = a.agentId ? String(a.agentId) : '';
    const onDisk = id ? disk.get(id) : null;
    if (id) seen.add(id);
    let k = Number.isFinite(a.phaseIndex) ? a.phaseIndex : -1;
    if (!titleOf.has(k) && a.phaseTitle) titleOf.set(k, a.phaseTitle);
    if (k === -1 && !a.phaseTitle && onDisk && onDisk.phaseTitle) k = keyForTitle(onDisk.phaseTitle);
    put(k, {
      index: Number.isFinite(a.index) ? a.index : 0,
      label: a.label || (onDisk && onDisk.label) || '',
      model: a.model || (onDisk && onDisk.model) || '',
      state: windowState(a.state, onDisk ? onDisk.state : null),
      agentId: id || null,
      onDisk: !!onDisk && onDisk.onDisk !== false,
      lastToolName: a.lastToolName || null,
      lastToolSummary: a.lastToolSummary || null,
      attempt: Number.isFinite(a.attempt) ? a.attempt : null,
    });
  }
  for (const k of byPhase.keys()) byPhase.get(k).sort((x, y) => x.index - y.index);
  // disk-only agents (a transcript the tree has not named yet) after the tree's,
  // under their disk phase; the ones with none under a trailing "Agents"
  const loose = [];
  for (const ag of disk.values()) {
    if (seen.has(String(ag.agentId))) continue;
    const row = { ...ag, onDisk: ag.onDisk !== false };
    if (ag.phaseTitle) put(keyForTitle(ag.phaseTitle), row); else loose.push(row);
  }
  const phases = [...byPhase.keys()].sort((x, y) => x - y).map((k) => ({ index: k, title: titleOf.get(k) || 'Agents', ...(titleOf.get(k) ? {} : { untitled: true }), agents: byPhase.get(k) }));
  if (loose.length) phases.push({ index: phases.length ? phases[phases.length - 1].index + 1 : 0, title: 'Agents', untitled: true, agents: loose });
  const all = phases.flatMap((p) => p.agents);
  return {
    ...skeleton,
    phases,
    liveTree: true,
    agentCount: all.length,
    doneCount: all.filter((a) => a.state === 'done').length,
    totalTokens: usage && Number.isFinite(usage.totalTokens) ? usage.totalTokens : (skeleton.totalTokens || 0),
    totalToolCalls: usage && Number.isFinite(usage.toolUses) ? usage.toolUses : (skeleton.totalToolCalls || 0),
    durationMs: usage && Number.isFinite(usage.durationMs) ? usage.durationMs : (skeleton.durationMs || 0),
  };
}

module.exports = { mergeLiveWorkflow, windowState };
