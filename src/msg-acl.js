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
  const tGroups = (target.groups || []).filter(Boolean);
  const sGroups = new Set((senderGroups || []).filter(Boolean));
  // same group ⇒ full mutual reach (the default the whole model hangs off)
  if (tGroups.some((g) => sGroups.has(g))) return 'messageable';
  let best = 'none';
  const bump = (lv) => { if (RANK[lv] > RANK[best]) best = lv; };
  for (const g of tGroups) bump(normLevel(groupSettingFor ? groupSettingFor(g) : 'none'));
  // session override widens only ('inherit'/absent adds nothing)
  if (target.reachability === 'visible' || target.reachability === 'messageable') bump(target.reachability);
  return best;
}

const canSee = (lv) => RANK[lv] >= RANK.visible;
const canMessage = (lv) => RANK[lv] >= RANK.messageable;

/** Validate a stored level value (group setting / session override). */
function validLevel(v, { allowInherit = false } = {}) {
  return LEVELS.includes(v) || (allowInherit && v === 'inherit');
}

module.exports = { levelFor, canSee, canMessage, validLevel, RANK, LEVELS };
