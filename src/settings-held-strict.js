'use strict';
// B-225b — WHILE THE SETTINGS ARE HELD, THE STRICT SIDE (主开发's round wyzvr7567, MUST 2, by rule R3: «never a default acted
// on»). A settings.json the start could not read hands the hub's readers a FROZEN view (src/routes/persistence.js heldSettingsView),
// and a row nobody can read runs on what this table says — never on a default that LOOSENS what a person may have set. Every row
// that guards MONEY, a SAFETY ask, a VENDOR CALL or a WRITE TO A PERSON'S OWN FILE takes its STRICT side, whatever its default.
// PURE. The census (test-store-write-census ⑪ j) reads every row of the settings schema and the harness tables: a row whose key
// names one of these kinds (NET) is in STRICT_WHILE_HELD, in NO_WRITE_WHILE_HELD, an owner row, or in NOT_OF_THESE_KINDS with its
// reason — a new row of that kind without a strict side is red.
const row = (kind, strict, why) => Object.freeze({ kind, strict, why });
const STRICT_WHILE_HELD = Object.freeze({
  // SAFETY ASKS: nothing is allowed for the person that they may have kept asking
  'permissions.bypassAnswersAsks': row('safety', false, "the CLI's own safety asks show their card — never answered allow"),
  'claude.allowAgentTools': row('safety', false, "the agent asks before VibeSpace's own tools"),
  'claude.defaultPermissionMode': row('safety', '', "the CLI's own mode: its asks are shown"),
  'codex.defaultPermissionMode': row('safety', '', "the CLI's own mode: its asks are shown"),
  'opencode.defaultPermissionMode': row('safety', '', "the CLI's own mode: its asks are shown"),
  'antigravity.defaultPermissionMode': row('safety', '', "the CLI's own mode: its asks are shown"),
  'agents.allowGroupManagement': row('safety', false, 'agents do not manage Task Groups'),
  'vault.policyJudge': row('safety', false, 'every vault use the grants do not cover asks the person (no judge, no decision-API spend)'),
  'webhook.allowPrivateReplyUrl': row('safety', false, 'no reply to a private address'),
  'webhook.trustProxyHops': row('safety', 0, 'no proxy header is trusted'),
  // MONEY
  'pool.avoidOverageMembers': row('money', true, 'a move onto an account billing paid overage is named as one (such an account is always used last, whatever this says)'),
  'spend.allowOverageTurns': row('money', false, 'no turn bills paid overage (an owner row: also refused by name)'),
  // VENDOR CALLS
  'accounts.activeUsagePolling': row('vendor', false, 'no usage is polled'),
  'accounts.onDemandQuotaRefresh': row('vendor', 'manual', "no automatic read; a person's own press still reads"),
  'antigravity.autoUsageReads': row('vendor', 'off', "no automatic read; a person's own press still reads"),
  // A WRITE TO A PERSON'S OWN FILE OR MACHINE (or a conversation's environment)
  'agents.vibespaceIntegration': row('person-file', false, "no NEW spawn gets VibeSpace's context delivery or its agent tools (they are written into a conversation's environment), and the running conversations' context deliveries answer as with the switch off (ONE reading of the switch, src/agent-routes.js integrationOnMaster) — a person who turned it off is never overridden by the default; its hooks are neither written nor stripped (NO_WRITE_WHILE_HELD)"),
  'accounts.shipSubscriptionToRemote': row('person-file', false, 'no sign-in is shipped to another machine'),
  'agentd.autoGraduate': row('person-file', false, 'no machine is moved to another link by itself'),
});
// rows of these kinds whose strict side is NO WRITE AT ALL — no value is forced: their writers write nothing while the settings
// are held, and replay at the lift by the person's own value
const NO_WRITE_WHILE_HELD = Object.freeze({
  'agents.vibespaceIntegration': 'the hooks are neither registered nor stripped (src/server/agent-tool-generators.js); replayed at the lift',
  'cli-config': "every harness row written into a CLI's own config (apply.kind cli-config — claude.transcriptRetentionDays …): syncCliConfig writes nothing (src/server/harness-config-sync.js); the lift's settings change runs it",
});
// the OWNER'S rows: refused BY NAME while held (settings_unread) — what they gate does not start (cut 4, R3): the spending rows and
// the judge's daily dollar cap (persistence.js SPEND_OWNER_ROWS)
const OWNER_ROW = /^(?:spend\.|plugin\.llm\.dailyBudgetUsd$)/;
// rows the net catches that are of none of the four kinds
const NOT_OF_THESE_KINDS = Object.freeze({
  'layout.shakeBypassSnap': "a window's drag (no money, ask, vendor or file)",
  'layout.shakeBypassSeconds': "a window's drag",
  'chat.showHookCards': 'a view row',
  'chat.showStopHookErrorNotice': 'a view row',
  'chat.hideEmptyHooks': 'a view row',
  'channels.agentBudgetSharePct': "a share of a channel's own API rate (no money billed)",
  'channels.attachmentBudgetMB': 'a disk bound for attachments',
  'pool.reserveFloorPct': "the share of a pool kept free (its default is the shipped floor; no account is billed by it)",
});
// rows of the same no-kind, BY THEIR SHAPE (a row per connected channel vendor, derived from its table)
const NOT_OF_THESE_KINDS_SHAPES = Object.freeze([
  [/^channels\.budget[A-Z][A-Za-z]*PerMin$/, "a connected channel's own API rate per minute (its vendor's safe default; no money billed, nothing read the person did not connect)"],
]);
const NET = /spend|budget|overage|pool|bypass|permission|allow|usage(Reads|Polling)|quota|hook|integration|ship|graduate|policyJudge|retention/i;
function strictValues() { const o = {}; for (const [k, r] of Object.entries(STRICT_WHILE_HELD)) o[k] = r.strict; return o; }
/** the census's verdict over a list of rows [{ key, cliConfig }] → { caught, unnamed } (a caught row with no strict side, by key) */
function census(rows) {
  const caught = [], unnamed = [];
  // a key listed twice (the schema registers a harness row under its own path too): one row, a cli-config row if any listing says so
  const byKey = new Map();
  for (const r of rows || []) if (r && r.key) byKey.set(r.key, (byKey.get(r.key) || false) || !!r.cliConfig);
  for (const [key, cliConfig] of byKey) {
    if (!NET.test(key)) continue;
    caught.push(key);
    const named = STRICT_WHILE_HELD[key] || NO_WRITE_WHILE_HELD[key] || (cliConfig && NO_WRITE_WHILE_HELD['cli-config']) || OWNER_ROW.test(key) || NOT_OF_THESE_KINDS[key] || NOT_OF_THESE_KINDS_SHAPES.some(([re]) => re.test(key));
    if (!named) unnamed.push(key);
  }
  return { caught, unnamed };
}
module.exports = { STRICT_WHILE_HELD, NO_WRITE_WHILE_HELD, NOT_OF_THESE_KINDS, NOT_OF_THESE_KINDS_SHAPES, OWNER_ROW, NET, strictValues, census };
