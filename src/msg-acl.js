// PURE reachability ACL for agent-to-agent messaging — the Communication
// Channels v1 policy core (2.362.0, owner-designed model). Endpoints are
// conversations today; external sources (Gmail/Lark/Slack connectors) later
// reuse the same two-level model. NO I/O — the routes feed it plain data.
//
// Model (owner spec 2026-08-20):
//   default        — same-group sessions see AND message each other; a group
//                    is opaque from outside (list shows nothing, send refuses)
//   group setting  — externalVisibility: 'none' | 'visible' | 'messageable'
//                    opens the WHOLE group to outsiders (messageable ⊃ visible)
//   session-level  — reachability: 'inherit' | 'visible' | 'messageable'
//                    opens ONE session to outsiders; WIDENING ONLY (an
//                    explicit override never narrows what the group grants)
//   ungrouped      — a session with no groups is a singleton scope: reachable
//                    from outside only via its own override; it can still
//                    QUERY whatever is externally visible.
// Levels are ordered none < visible < messageable; the effective level is the
// MAX of every applicable grant. This ACL is a COORDINATION model, not a
// security boundary (same-OS-user agents can read transcripts regardless).
//
// ONE GRANT MODEL (lane grants-unify, 2026-10-23): a Task Group's outside visibility is a ROW of the ONE grants store
// (door `group-visibility`, the group id as the resource: `to` = [that group at its level], `except` = the members it
// leaves OUT — src/server/grants-store.js); `groupSettingFor(gid)` answers that group's rows and THE ONE ADMISSION
// (src/grant-model.js admits) decides whether the TARGET is exposed through it — a member left out is not. A caller still
// answering the pre-unify level string (the migration's / a suite's shape) is read through the model's mapper. The
// «same group ⇒ full mutual reach» default is the model's `sharesGroup` (no membership test lives here).
const GM = require('./grant-model.js');   // PURE → PURE

const RANK = { none: 0, visible: 1, messageable: 2 };
const LEVELS = ['none', 'visible', 'messageable'];

function normLevel(v, dflt = 'none') {
  return RANK[v] !== undefined ? v : dflt;
}

/**
 * Effective level of `target` as seen by a sender.
 * @param target {{ cid, groups: string[], reachability?: string }}
 * @param senderGroups string[] — the sender's group ids ([] = ungrouped)
 * @param groupSettingFor (gid) => 'none'|'visible'|'messageable' (group's externalVisibility)
 * @returns 'none'|'visible'|'messageable'
 */
function levelFor(target, senderGroups, groupSettingFor) {
  // the target as the caller its groups' visibility rows judge (THE ONE ADMISSION — src/grant-model.js admits)
  const facts = { conversationKeys: target.cid ? [String(target.cid)] : [], groupIds: (target.groups || []).filter(Boolean) };
  // same group ⇒ full mutual reach (the default the whole model hangs off)
  if (GM.sharesGroup(facts.groupIds, senderGroups)) return 'messageable';
  let best = 'none';
  const bump = (lv) => { if (RANK[lv] > RANK[best]) best = lv; };
  for (const g of facts.groupIds) {
    const got = groupSettingFor ? groupSettingFor(g) : [];
    // the group's rows (the store), or a pre-unify level string mapped as the migration maps it
    const rows = Array.isArray(got) ? got : (() => { const m = GM.fromGroupVisibility(normLevel(got), g); return m ? [{ door: 'group-visibility', resource: String(g), to: m.to, except: [] }] : []; })();
    // only THIS group's rows expose a target through it (a row of another group answers nothing here)
    const v = GM.admits(rows.filter((r) => r && String(r.resource) === String(g)), facts);
    if (v.ok) for (const h of v.hits) if (h.entry && h.entry.kind === 'group' && String(h.entry.id) === String(g)) bump(normLevel(h.entry.level));
  }
  // session override widens only ('inherit'/absent adds nothing)
  if (target.reachability === 'visible' || target.reachability === 'messageable') bump(target.reachability);
  return best;
}

const canSee = (lv) => RANK[lv] >= RANK.visible;
const canMessage = (lv) => RANK[lv] >= RANK.messageable;

/** Validate a stored level value (group setting / session override). */

module.exports = { levelFor, canSee, canMessage, RANK, LEVELS };
