'use strict';
// CODEX MODEL LIST — the codex descriptor's models() (moved from server.js,
// lane dc-ws-create; server.js keeps only the generic
// refreshHarnessModels over every descriptor).
// That cache is last-writer-wins AND version-gated server-side: a still-running
// OLD codex CLI re-fetches it and writes it back WITHOUT newer models (observed
// live TWICE: a 0.142.5 session erased the gpt-5.6 entries minutes after
// 0.144.0 fetched them — and once it happened right before a server restart,
// leaving the dropdown stale for the whole hourly re-read cycle). Two guards:
// (1) union every model ever seen, PERSISTED across restarts;
// (2) mtime-guarded re-read ON DEMAND from /api/available-models — the model/
//     effort dropdowns fetch per click, so they're always current, no timers.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SEEN = new Map();   // every model ever seen, PERSISTED across restarts (guard 1)
let seenFile = null;      // <data>/codex-models-seen.json — loaded once, on the first ask
let cacheMtime = 0;       // guard 2: re-read the CLI cache only when its mtime moved

/** → the dropdown list `[{id:'', label:'Default'}, ...seen]`, or null while
 *  nothing was ever seen (the caller keeps its own default row). */
function models({ dataDir } = {}) {
  if (seenFile === null && dataDir) {
    seenFile = path.join(dataDir, 'codex-models-seen.json');
    try { for (const m of JSON.parse(fs.readFileSync(seenFile, 'utf-8'))) if (m && m.id) SEEN.set(m.id, m); } catch {}
  }
  try {
    const fp = path.join(os.homedir(), '.codex', 'models_cache.json');
    const mt = fs.statSync(fp).mtimeMs;
    if (mt !== cacheMtime) {
      cacheMtime = mt;
      const codexCache = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (codexCache.models?.length) {
        const fresh = codexCache.models.map(m => {
          const ctx = m.context_window ? (m.context_window >= 1000000 ? Math.round(m.context_window / 1000000) + 'M' : Math.round(m.context_window / 1000) + 'k') : '';
          // Per-model reasoning levels ride along: GPT-5.6 made efforts
          // model-specific (sol/terra add max+ultra, luna tops out at max) —
          // clients derive dropdowns from this instead of a stale hardcoded list. Plus multiAgentEffort (2.369.62) = the level a DELEGATING effort really reasons at ('ultra' is a mode, not a level); '' = the catalog names none ⇒ the label stays a bare "ultra", never a hardcoded one (kb agent-meta.js).
          return { id: m.slug, label: (m.display_name || m.slug) + (ctx ? ` (${ctx})` : ''), efforts: (m.supported_reasoning_levels || []).map(l => l && l.effort).filter(Boolean), multiAgentEffort: m.multi_agent_reasoning_effort || '' };
        }).filter(m => m.id);
        let changed = false;
        for (const m of fresh) {
          const prev = SEEN.get(m.id);
          if (!prev || JSON.stringify(prev) !== JSON.stringify(m)) { SEEN.set(m.id, m); changed = true; }
        }
        if (changed && seenFile) {
          try {
            const tmp = seenFile + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify([...SEEN.values()]));
            fs.renameSync(tmp, seenFile);
          } catch {}
        }
      }
    }
  } catch {}
  return SEEN.size ? [{ id: '', label: 'Default' }, ...SEEN.values()] : null;
}

module.exports = { models };
