'use strict';
// RECORD SHAPE — the schema oracle for KNOWN record types (docs/design-unknown-records.md §3,
// 2026-09-21). PURE: imports nothing; CJS so the client bundle, the daemon bundle and node tests
// carry the same table.
//
// WHY: the fall-back card (2.369.120) catches a record TYPE VibeSpace has never seen — nothing caught
// a KNOWN type growing a FIELD. The live buffers already carried three the 2.1.274 SDK schema does not
// declare (system/init.messaging_socket_path, task_started.owned_by_subagent,
// task_progress.workflow_progress) and the product silently depends on the third. Owner ruling (b):
// "除了未知事件本身，也得注意如果已知事件类型具有未知参数也得有所记录和提醒".
//
// MODEL: SHAPES[key] = { known:Set, ignored:Map<field,reason>, enums:{field:Set}, nested:{field:spec},
// blocks?:Set }, key = <harness>:<carrier>:<shape>.
//   · CARRIERS ARE SEPARATE: the claude wire is snake_case (`duration_ms`), the transcript row is
//     camelCase (`durationMs`) inside an envelope — a transcript row is never judged by the stream
//     schema. An undeclared (carrier, shape) is NOT judged at all: an unknown TYPE already has its own
//     card, and judging it against nothing would flag every field.
//   · DEPTH: the top level plus the DECLARED nested objects only (rate_limit_info, unifiedWindows,
//     compact_metadata, usage, error, info, rate_limits…). `user`/`assistant` are judged by their
//     content-block `type` only — the API message body is the vendor's, not the harness's.
//   · ENUM DRIFT is informational: the binary itself says "treat an unrecognized kind exactly like a
//     recognized one", so handlers keep running and only the card fires.
//   · A field is NEVER deleted from `known` (old transcripts replay) — only moved to `ignored` with a
//     reason, exactly like the record lists in the normalizers.
//   · ENVELOPES and the VibeSpace-own wrapper fields ("ours") are declared groups, never drift.
//
// EVERY claude stream row below is VERBATIM from the 2.1.274 binary's zod union (dumped by
// scripts/test-record-shape.mjs §4's extractor — the same walk over `u({type:R("…")…})` that produced
// the design's census; since 2.1.281 the minifier spells it `d({type:R(…)`, so the extractor reads the
// helper names off an anchor instead of spelling them); the fields 2.1.280 and 2.1.281 added sit in each
// shape's `ignored` map with a reason (a shape NEW in a later build carries that build's declaration as
// `known`), and the oracle runs STRICT against 2.1.281 (SCHEMA_CLI_VERSION); `uuid`/`session_id` ride
// the stream envelope and are omitted per row. Corpus-
// only fields (seen live, undeclared upstream) are appended in CORPUS_KNOWN with a note.

const asSet = (a) => new Set(a || []);
function sh(known, extra = {}) {
  const spec = { known: asSet(known), ignored: new Map(Object.entries(extra.ignored || {})), enums: {}, nested: {}, blocks: extra.blocks ? asSet(extra.blocks) : null };
  for (const [f, vals] of Object.entries(extra.enums || {})) spec.enums[f] = asSet(vals);
  for (const [f, sub] of Object.entries(extra.nested || {})) spec.nested[f] = sub;
  return spec;
}

// ── Envelopes + "ours" ────────────────────────────────────────────────────────────────────────────
const ENVELOPES = Object.freeze({
  // the claude JSONL row around a record (never on stdout)
  'claude:transcript': asSet(['parentUuid', 'logicalParentUuid', 'isSidechain', 'isMeta', 'timestamp', 'level', 'userType', 'entrypoint', 'cwd', 'sessionId', 'version', 'gitBranch', 'slug', 'promptId', 'requestId', 'uuid', 'agentId', 'isCompactSummary', 'isVisibleInTranscriptOnly', 'toolUseResult', 'sourceToolAssistantUUID', 'sourceToolUseID', '__line']),
  // every stream-json record carries these two (the binary puts them on every shape)
  'claude:stream': asSet(['uuid', 'session_id']),
  // the codex rollout line around a payload (+ the reader's provenance tags)
  'codex:rollout': asSet(['timestamp', 'ordinal', 'type', 'payload', '__line', '__threadId']),
});
// VibeSpace-OWN wrapper fields — stamped by chat-wrapper / codex-chat-wrapper / the server on records
// they relay. Excused at every level of every harness: they are not the harness's drift.
const OURS = asSet(['webui_peer', 'webui_queue_id', 'webui_after_commit', 'webui_origin', 'webui_origin_note', 'modelPinned', 'wrapper', 'permissionMode', 'session_name', 'agent_role', 'item_id', 'thread_id', 'turn_id', '_fromWebui', 'promptSource', 'originKind', 'originNote', 'read_via', 'vibespace_fixture_note']);
// …and by CONVENTION every `_`-prefixed key is a VibeSpace-own private marker (`_fromWebui`, the
// reader's `__line` / `__threadId`, a fixture's `_note`) — no harness writes one on a record.
// Every `webui_*` key is OURS by PREFIX, not by list: the wrappers mint new ones
// (2.369.126 r2 — `webui_msg_id` on a codex user record was flagged as drift and
// pushed a red card into every queued send; test-queue-steer caught it in the
// heavy tier). The list keeps the non-prefixed names.
const isOurs = (k) => OURS.has(k) || k.startsWith('webui_') || k.charCodeAt(0) === 95 /* '_' */;

// ── claude: nested specs (the declared depth) ────────────────────────────────────────────────────
const RATE_LIMIT_INFO = sh(['status', 'resetsAt', 'rateLimitType', 'utilization', 'unifiedWindows', 'overageStatus', 'overageResetsAt', 'overageDisabledReason', 'isUsingOverage', 'surpassedThreshold', 'unifiedRateLimitFallbackPercentage'], {
  enums: { status: ['allowed', 'allowed_warning', 'rejected'], rateLimitType: ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_overage_included', 'overage'] },
  nested: { unifiedWindows: sh(['five_hour', 'seven_day', 'seven_day_overage_included', 'seven_day_opus', 'seven_day_sonnet']) },
});
const COMPACT_METADATA = sh(['trigger', 'pre_tokens', 'post_tokens', 'cumulative_dropped_tokens', 'duration_ms', 'user_context', 'messages_summarized', 'precomputed', 'pre_compact_discovered_tools', 'preserved_segment', 'preserved_messages'], { enums: { trigger: ['manual', 'auto'] } });
const TASK_USAGE = sh(['total_tokens', 'tool_uses', 'duration_ms']);
const API_ERROR_ERROR = sh(['message', 'status', 'request_id', 'formatted', 'connection', 'isNetworkDown', 'rateLimits', 'requestId']);
const SUBAGENT_RETRY = sh(['agent_id', 'attempt', 'max_retries', 'retry_delay_ms', 'error_status', 'error_category']);
// The API message content-block types VibeSpace renders (design §3): user/assistant are judged by
// these only. server_tool_use / web_search_tool_result / web_fetch_tool_result are the vendor's
// server-tool blocks the renderer already folds under search cards.
const CONTENT_BLOCK_TYPES = asSet(['text', 'thinking', 'redacted_thinking', 'tool_use', 'tool_result', 'image', 'document', 'search_result', 'fallback', 'server_tool_use', 'web_search_tool_result', 'web_fetch_tool_result', 'tool_reference']);

// The seven result latency fields 2.1.280 added. The truth, measured 2026-09-22: NOTHING in VibeSpace
// reads any latency field — not these, and not the ttft_ms / ttft_stream_ms / duration_api_ms the
// shape already knew (a grep for ttft over src/ finds only this file); the message meta popup shows
// no latency at all. (The first declaration said "the meta popup shows ttft only" — it never did.)
const LATENCY_UNREAD = 'latency telemetry (2.1.280) — nothing in VibeSpace reads it: no surface shows latency (ttft_ms / duration_api_ms are unread too); declared so the drift card stays quiet — move to known with the first consumer';
// The fields 2.1.281 added (2026-09-23 census, each read off the binary's own describe() text).
const NEW_281 = (what) => what + ' (2.1.281) — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)';

const SHAPES = {
  // ── claude STREAM (stdout / the live buffer) — generated from the 2.1.274 binary ──
  "claude:stream:system/init": sh(['agents', 'apiKeySource', 'startup_timing', 'betas', 'claude_code_version', 'cwd', 'tools', 'mcp_servers', 'model', 'permissionMode', 'slash_commands', 'terminal_slash_commands', 'output_style', 'skills', 'plugins', 'plugin_errors', 'plugin_warnings', 'mcp_server_errors', 'fast_mode_state', 'fast_mode_disabled_reason', 'footer_indicator', 'effort', 'capabilities', 'analytics_disabled', 'product_feedback_disabled', 'memory_paths', 'worker_epoch', 'powershell_path', 'cloud_session'], { ignored: { 'scratchpad_path': "the CLI's scratchpad dir (2.1.280) — 2.1.280 — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)", 'per_turn_effort_active': NEW_281('whether an effort change keeps the prompt cache for this frame\'s model (true: effort rides inside the conversation; false: a change rewrites the cached prefix; absent = unknown) — the effort picker\'s cache-cost hint candidate'), 'view_mode': NEW_281('focus|default — the /focus transcript view (the model is told the user sees only the final message per turn); on headless stream-json inits, the newest frame wins') } }),
  "claude:stream:system/compact_boundary": sh(['compact_metadata', 'logical_parent_uuid', 'historical']),
  "claude:stream:system/status": sh(['status', 'permissionMode', 'compact_result', 'compact_error']),
  "claude:stream:system/post_turn_summary": sh(['summarizes_uuid', 'status_category', 'status_detail', 'needs_action']),
  "claude:stream:system/task_summary": sh(['detail']),
  "claude:stream:system/informational": sh(['content', 'level', 'tool_use_id', 'prevent_continuation']),
  "claude:stream:system/permission_retry": sh(['content', 'commands']),
  "claude:stream:system/stop_hook_summary": sh(['hook_count', 'hook_infos', 'hook_errors', 'hook_additional_context', 'prevented_continuation', 'stop_reason', 'has_output', 'level', 'tool_use_id', 'hook_label', 'total_duration_ms']),
  "claude:stream:system/memory_saved": sh(['written_paths', 'team_count', 'verb']),
  "claude:stream:system/agents_killed": sh([]),
  "claude:stream:system/away_summary": sh(['content']),
  "claude:stream:system/thinking": sh(['content']),
  "claude:stream:system/mirror_error": sh(['error', 'key']),
  "claude:stream:system/api_retry": sh(['attempt', 'max_retries', 'retry_delay_ms', 'error_status', 'error', 'no_response']),
  "claude:stream:system/control_request_progress": sh(['request_id', 'status', 'attempt', 'max_retries', 'retry_delay_ms', 'error_status']),
  "claude:stream:system/model_refusal_fallback": sh(['trigger', 'direction', 'scope', 'original_model', 'fallback_model', 'request_id', 'api_refusal_category', 'saw_cyber_refusal', 'api_refusal_explanation', 'retracted_message_uuids', 'refused_user_message_uuid', 'content']),
  "claude:stream:system/model_refusal_no_fallback": sh(['original_model', 'request_id', 'api_refusal_category', 'api_refusal_explanation', 'refused_user_message_uuid', 'content']),
  "claude:stream:system/model_fallback": sh(['trigger', 'original_model', 'fallback_model', 'content']),
  "claude:stream:system/model_consent_fallback": sh(['choice', 'original_model', 'original_model_name', 'fallback_model', 'persisted_as_default', 'content']),
  "claude:stream:system/file_snapshot": sh(['content', 'snapshot_files']),
  "claude:stream:system/scheduled_task_fire": sh(['content']),
  "claude:stream:system/peer_message_hold": sh(['state', 'message_uuid', 'lane', 'from', 'from_name', 'cause', 'outcome']),
  "claude:stream:system/turn_duration": sh(['duration_ms', 'budget_tokens', 'budget_limit', 'budget_nudges', 'message_count', 'pending_background_agent_count', 'pending_workflow_count']),
  "claude:stream:system/api_error": sh(['error', 'retry_in_ms', 'retry_attempt', 'max_retries']),
  "claude:stream:system/local_command_output": sh(['content']),
  "claude:stream:system/hook_started": sh(['hook_id', 'hook_name', 'hook_event']),
  "claude:stream:system/hook_progress": sh(['hook_id', 'hook_name', 'hook_event', 'stdout', 'stderr', 'output']),
  "claude:stream:system/hook_response": sh(['hook_id', 'hook_name', 'hook_event', 'output', 'stdout', 'stderr', 'exit_code', 'outcome']),
  "claude:stream:system/plugin_install": sh(['status', 'name', 'error']),
  "claude:stream:system/files_persisted": sh(['files', 'failed', 'processed_at']),
  "claude:stream:system/task_notification": sh(['task_id', 'tool_use_id', 'status', 'reason', 'output_file', 'summary', 'usage', 'resource_links', 'skip_transcript', 'ambient']),
  "claude:stream:system/task_started": sh(['task_id', 'tool_use_id', 'description', 'subagent_type', 'is_backgrounded', 'spawn_depth', 'task_type', 'workflow_name', 'prompt', 'skip_transcript', 'ambient']),
  "claude:stream:system/task_updated": sh(['task_id', 'patch']),
  "claude:stream:system/background_tasks_changed": sh(['tasks']),
  "claude:stream:system/feedback_draft_queued": sh(['draft_id', 'draft_type', 'title', 'details_preview']),
  "claude:stream:system/session_state_changed": sh(['state']),
  "claude:stream:system/worker_shutting_down": sh(['reason']),
  "claude:stream:system/turn_handoff_available": sh(['v', 'tools', 'worker_epoch', 'relay_marker'], { ignored: { 'staged_files': 'handoff staging (2.1.280) — 2.1.280 — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)', 'no_query_first': 'handoff flag (2.1.280) — 2.1.280 — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)' } }),
  "claude:stream:system/commands_changed": sh(['commands']),
  "claude:stream:system/notification": sh(['key', 'text', 'priority', 'color', 'timeout_ms']),
  "claude:stream:system/task_progress": sh(['task_id', 'tool_use_id', 'description', 'subagent_type', 'usage', 'last_tool_name', 'summary']),
  "claude:stream:system/thinking_tokens": sh(['estimated_tokens', 'estimated_tokens_delta', 'user_message_uuid']),
  "claude:stream:system/memory_recall": sh(['mode', 'memories']),
  "claude:stream:system/elicitation_complete": sh(['mcp_server_name', 'elicitation_id']),
  "claude:stream:system/permission_denied": sh(['tool_name', 'tool_use_id', 'agent_id', 'decision_reason_type', 'decision_reason', 'message'], { ignored: { 'decision_reason_code': 'a coded twin of decision_reason (2.1.280); the card shows the text — 2.1.280 — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)' } }),
  "claude:stream:system/code_change_published": sh(['provider', 'url', 'repo', 'identifier', 'action', 'branch']),
  "claude:stream:system/vcs_state_changed": sh(['kind', 'cwd', 'branch']),
  "claude:stream:system/dev_intent": sh(['kind', 'trigger']),
  "claude:stream:system/turn_preempted": sh(['reason', 'preempted_by_uuid', 'preempted_message_uuids']),
  "claude:stream:system/cloud_session_delta": sh(['seq', 'changed', 'cloud_session']),
  "claude:stream:system/upgrade_relay_marker": sh(['content']),
  // NEW in 2.1.281 — `known` is that build's own declaration (there is no 2.1.274 row to diff against)
  "claude:stream:system/per_turn_effort_changed": sh(['per_turn_effort_active']),
  "claude:stream:result": sh(['duration_ms', 'duration_api_ms', 'ttft_ms', 'ttft_stream_ms', 'time_to_request_ms', 'user_message_uuid', 'user_message_uuids', 'resume_reason', 'local_command', 'request_sent_wall_ms', 'first_content_frame_ms', 'first_stream_post_ms', 'first_stream_post_ack_ms', 'first_stream_post_wall_ms', 'time_to_request_from_spawn_ms', 'warm_spare_claimed', 'time_origin_ms', 'is_error', 'api_error_status', 'api_error_code', 'num_turns', 'result', 'stop_reason', 'total_cost_usd', 'usage', 'modelUsage', 'subagent_stats', 'permission_denials', 'queued_turn_count', 'structured_output', 'deferred_tool_use', 'terminal_reason', 'result_index', 'fast_mode_state', 'fast_mode_disabled_reason', 'origin', 'errors', 'runner_exit', 'startup_failure_reason'], { ignored: { 'first_stream_post_queue_wait_ms': LATENCY_UNREAD, 'first_stream_post_queued_behind': LATENCY_UNREAD, 'frame_received_wall_ms': LATENCY_UNREAD, 'frame_enqueued_wall_ms': LATENCY_UNREAD, 'turn_started_wall_ms': LATENCY_UNREAD, 'first_text_post_ms': LATENCY_UNREAD, 'first_text_post_wall_ms': LATENCY_UNREAD } }),
  "claude:stream:user": sh(['message', 'parent_tool_use_id', 'isSynthetic', 'tool_use_result', 'priority', 'origin', 'client_platform', 'inbound_origin', 'historical', 'shouldQuery', 'timestamp', 'is_meta', 'seeded_summon', 'client_composed', 'is_visible_in_transcript_only', 'is_virtual', 'is_compact_summary', 'summarize_metadata', 'mcp_meta', 'tool_result_meta', 'source_tool_use_id', 'source_tool_assistant_uuid', 'image_paste_ids', 'plan_content', 'permission_mode', 'interrupted_message_id'], { ignored: { 'initiator': 'who started the turn (2.1.280) — 2.1.280 — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)' } }),
  "claude:stream:bash_command": sh(['command', 'cwd']),
  "claude:stream:assistant": sh(['message', 'parent_tool_use_id', 'error', 'historical', 'request_id', 'user_message_uuid', 'user_message_uuids', 'resume_reason', 'resumed_from_incomplete_thinking', 'supersedes', 'aborted', 'subagent_type', 'task_description', 'tool_use_meta', 'narration_block_indexes', 'timestamp', 'is_meta', 'context_usage', 'usage_report', 'local_command_source', 'local_command_run', 'is_virtual', 'batch_tool_uses', 'wire_tool_inputs', 'wire_ingest_context', 'is_api_error_message', 'api_error_status', 'api_error', 'api_error_params', 'api_error_code', 'error_details', 'advisor_model', 'attribution_agent', 'attribution_skill', 'attribution_plugin', 'attribution_mcp_server', 'attribution_mcp_tool'], { ignored: { 'narration_hint': 'a UI narration hint (2.1.280) — 2.1.280 — no consumer yet (declared so the drift card stays quiet; move to known with the consumer)', 'local_command_outcome': NEW_281('{kind: unavailable_headless|unknown|failed|restart_required, suggestion?} on a local slash command\'s twin row, so a host can offer a fix instead of relaying the text (the oracle\'s concern only: assistant rows are judged by content-block type at runtime)') } }),
  "claude:stream:rate_limit_event": sh(['rate_limit_info']),
  "claude:stream:stream_event": sh(['event', 'parent_tool_use_id', 'ttft_ms', 'user_message_uuid', 'user_message_uuids', 'resume_reason']),
  "claude:stream:transcript_mirror": sh(['filePath', 'entries']),
  "claude:stream:tool_progress": sh(['tool_use_id', 'tool_name', 'parent_tool_use_id', 'elapsed_time_seconds', 'task_id', 'heartbeat', 'subagent_type', 'subagent_retry']),
  "claude:stream:auth_status": sh(['isAuthenticating', 'output', 'error']),
  "claude:stream:tool_use_summary": sh(['summary', 'preceding_tool_use_ids', 'timestamp']),
  "claude:stream:prompt_suggestion": sh(['suggestion']),
  "claude:stream:attachment": sh(['attachment', 'timestamp']),
  "claude:stream:tombstone": sh(['message']),
  "claude:stream:conversation_reset": sh(['new_conversation_id'], { ignored: { 'trigger': NEW_281('clear|plan_mode_exit|fresh_session|onboarding — what discarded the conversation; informational, a consumer resets on every frame whatever it says'), 'user_message_uuid': NEW_281('with trigger clear only: the uuid of the /clear message, to wipe once whichever of the two arrives first'), 'timestamp': NEW_281('when the reset happened (ISO, the performing process\'s clock) — for a "conversation cleared" row, never for ordering') } }),
  "claude:stream:api_metrics": sh(['event']),
  "claude:stream:os_notification": sh(['message', 'notification_type']),
  "claude:stream:apply_flag_settings": sh(['settings']),
  "claude:stream:command_lifecycle": sh(['command_uuid', 'state']),
  "claude:stream:set_expanded_view": sh(['expanded_view']),
  "claude:stream:active_goal": sh(['value']),
  "claude:stream:autocompact_state": sh(['value']),
  "claude:stream:set_in_progress_tool_use_ids": sh(['op']),
  "claude:stream:hint_clears": sh(['ids', 'content_by_id']),
  "claude:stream:open_message_selector": sh([]),
  "claude:stream:compact_progress": sh(['event']),
  "claude:stream:stream_mode": sh(['mode']),
  "claude:stream:response_length": sh(['op', 'delta']),
  "claude:stream:refusal_continuation": sh(['phase', 'salvage_text']),
  "claude:stream:control_request": sh(['request_id', 'request']),
  "claude:stream:control_response": sh(['response']),
  "claude:stream:control_cancel_request": sh(['request_id']),
  "claude:stream:keep_alive": sh([]),
  "claude:stream:update_environment_variables": sh(['variables', 'request_id']),
  "claude:stream:session_notice": sh(['notice_class', 'from_session_id', 'content', 'isSynthetic', 'inbound_origin']),
  "claude:stream:queued_notification": sh(['notification']),
};

// Corpus-only fields: seen on this instance's live buffers (2026-09-20 census), NOT in the 2.1.274 zod
// object. Known WITH A NOTE — the module must never flag what the product already depends on
// (workflow_progress feeds the live Workflow card). They live in each shape's `ignored` map, the one
// field map that carries a reason, so `known` stays exactly the binary's own declaration (the oracle
// diffs the two) and the negative control (§5: empty every `ignored`) has something to flip.
const CORPUS_KNOWN = Object.freeze({
  'claude:stream:system/init': { messaging_socket_path: 'the CLI\'s cross-session inbox socket (2.1.2xx); undeclared upstream, present on every live init frame' },
  'claude:stream:system/task_started': { owned_by_subagent: 'a task launched by a sub-agent (22/83 live records); undeclared upstream' },
  'claude:stream:system/task_progress': { workflow_progress: 'the live Workflow tree (phases + agents) VibeSpace renders since 2.369.118; undeclared upstream' },
  'claude:stream:user': { isReplay: 'the CLI\'s replay marker on resumed records (1/404 live)' },
});
for (const [key, fields] of Object.entries(CORPUS_KNOWN)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);

// Depth + enums on the claude stream shapes (hand-declared: the extractor is flat).
Object.assign(SHAPES['claude:stream:rate_limit_event'].nested, { rate_limit_info: RATE_LIMIT_INFO });
Object.assign(SHAPES['claude:stream:system/compact_boundary'].nested, { compact_metadata: COMPACT_METADATA });
Object.assign(SHAPES['claude:stream:system/task_notification'].nested, { usage: TASK_USAGE });
SHAPES['claude:stream:system/task_notification'].enums.status = asSet(['completed', 'failed', 'stopped', 'killed']);
Object.assign(SHAPES['claude:stream:system/task_progress'].nested, { usage: TASK_USAGE });
Object.assign(SHAPES['claude:stream:system/api_error'].nested, { error: API_ERROR_ERROR });
Object.assign(SHAPES['claude:stream:tool_progress'].nested, { subagent_retry: SUBAGENT_RETRY });
SHAPES['claude:stream:system/notification'].enums.priority = asSet(['low', 'medium', 'high', 'immediate']);
SHAPES['claude:stream:system/vcs_state_changed'].enums.kind = asSet(['commit', 'push', 'merge', 'rebase']);
SHAPES['claude:stream:system/code_change_published'].enums.action = asSet(['created', 'edited', 'merged', 'commented', 'closed', 'reopened', 'ready', 'draft', 'auto-merge-enabled', 'auto-merge-disabled', 'pushed', 'checked-out', 'started']);
SHAPES['claude:stream:system/session_state_changed'].enums.state = asSet(['idle', 'running', 'requires_action']);
SHAPES['claude:stream:command_lifecycle'].enums.state = asSet(['queued', 'started', 'completed', 'cancelled', 'discarded', 'refused']);
SHAPES['claude:stream:system/status'].enums.compact_result = asSet(['success', 'failed']);
SHAPES['claude:stream:user'].blocks = CONTENT_BLOCK_TYPES;
SHAPES['claude:stream:assistant'].blocks = CONTENT_BLOCK_TYPES;

// ── claude TRANSCRIPT twins (camelCase rows inside the JSONL envelope) ──
Object.assign(SHAPES, {
  'claude:transcript:system/api_error': sh(['error', 'retryInMs', 'retryAttempt', 'maxRetries', 'source'], { nested: { error: API_ERROR_ERROR } }),
  'claude:transcript:system/turn_duration': sh(['durationMs', 'messageCount', 'budgetTokens', 'budgetLimit', 'budgetNudges', 'pendingBackgroundAgentCount', 'pendingWorkflowCount']),
  'claude:transcript:system/compact_boundary': sh(['content', 'compactMetadata'], { nested: { compactMetadata: sh(['trigger', 'preTokens', 'postTokens', 'cumulativeDroppedTokens', 'durationMs', 'userContext', 'messagesSummarized', 'precomputed', 'preCompactDiscoveredTools', 'preservedSegment', 'preservedMessages'], { enums: { trigger: ['manual', 'auto'] } }) } }),
  'claude:transcript:system/stop_hook_summary': sh(['hookCount', 'hookInfos', 'hookErrors', 'hookAdditionalContext', 'preventedContinuation', 'stopReason', 'hasOutput', 'toolUseID', 'hookLabel', 'totalDurationMs', 'content']),
  'claude:transcript:system/model_refusal_fallback': sh(['trigger', 'direction', 'scope', 'originalModel', 'fallbackModel', 'requestId', 'apiRefusalCategory', 'sawCyberRefusal', 'apiRefusalExplanation', 'retractedMessageUuids', 'refusedUserMessageUuid', 'content']),
  'claude:transcript:system/model_refusal_no_fallback': sh(['originalModel', 'requestId', 'apiRefusalCategory', 'apiRefusalExplanation', 'refusedUserMessageUuid', 'content']),
  'claude:transcript:system/local_command': sh(['content']),          // not in the SDK union — the REPL's own persisted slash-command row
  'claude:transcript:system/away_summary': sh(['content']),
  'claude:transcript:system/notification': sh(['key', 'text', 'priority', 'color', 'timeoutMs', 'timeout_ms'], { enums: { priority: ['low', 'medium', 'high', 'immediate'] } }),
  'claude:transcript:system/vcs_state_changed': sh(['kind', 'branch'], { enums: { kind: ['commit', 'push', 'merge', 'rebase'] } }),
  'claude:transcript:system/code_change_published': sh(['provider', 'url', 'repo', 'identifier', 'action', 'branch']),
  // corpus-verified 2026-09-22 (read-only grep over ~/.claude/projects): the /loop wakeup row (2.1.118, 1 row)
  // and the TUI's remote-control banner (2.1.81, 11 rows) — both card-less (message-manager KNOWN_IGNORED_SYSTEM_SUBTYPES)
  'claude:transcript:system/scheduled_task_fire': sh(['content']),
  'claude:transcript:system/bridge_status': sh(['content', 'url']),
  'claude:transcript:user': sh([], { blocks: CONTENT_BLOCK_TYPES }),
  'claude:transcript:assistant': sh([], { blocks: CONTENT_BLOCK_TYPES }),
  'claude:transcript:pr-link': sh(['sessionId', 'prNumber', 'prUrl', 'prRepository', 'timestamp']), // the same fact as code_change_published, persisted last-wins
});

// ── codex ROLLOUT (0.153.4 / 0.154.0 corpus; struct sizes from the binary) — payload-level ──
const CODEX_TOKEN_INFO = sh(['total_token_usage', 'last_token_usage', 'model_context_window']);
const CODEX_RATE_LIMITS = sh(['limit_id', 'limit_name', 'primary', 'secondary', 'credits', 'individual_limit', 'spend_control_reached', 'plan_type', 'rate_limit_reached_type']);
Object.assign(SHAPES, {
  'codex:rollout:session_meta': sh(['session_id', 'id', 'timestamp', 'cwd', 'originator', 'cli_version', 'source', 'model_provider', 'base_instructions', 'history_mode', 'context_window', 'parent_thread_id', 'thread_source', 'agent_nickname', 'agent_path', 'multi_agent_version', 'git', 'forked_from_id', 'forked_from_ordinal_exclusive', 'history_base', 'subagent_history_start_ordinal', 'model']),
  'codex:rollout:turn_context': sh(['turn_id', 'cwd', 'workspace_roots', 'current_date', 'timezone', 'approval_policy', 'approvals_reviewer', 'sandbox_policy', 'permission_profile', 'model', 'comp_hash', 'personality', 'collaboration_mode', 'multi_agent_version', 'realtime_active', 'effort', 'summary', 'root_turn_id']),
  'codex:rollout:token_usage_record': sh(['thread_id', 'turn_id', 'session_id', 'root_turn_id', 'response_id', 'usage', 'turn_token_usage', 'thread_token_usage']),
  'codex:rollout:event/token_count': sh(['type', 'info', 'rate_limits'], { nested: { info: CODEX_TOKEN_INFO, rate_limits: CODEX_RATE_LIMITS } }),
  'codex:rollout:event/task_started': sh(['type', 'turn_id', 'started_at', 'model_context_window', 'collaboration_mode_kind']),
  'codex:rollout:event/task_complete': sh(['type', 'turn_id', 'last_agent_message', 'started_at', 'completed_at', 'duration_ms', 'time_to_first_token_ms', 'error']),
  'codex:rollout:event/turn_aborted': sh(['type', 'turn_id', 'reason', 'started_at', 'completed_at', 'duration_ms']),
  'codex:rollout:event/thread_settings_applied': sh(['type', 'thread_id', 'thread_settings']),
  'codex:rollout:event/item_completed': sh(['type', 'thread_id', 'turn_id', 'item', 'started_at_ms', 'completed_at_ms']), // `item` is judged by item/<type> below
  'codex:rollout:event/rate_limits_updated': sh(['type', 'rateLimits', 'resetCredits', 'onDemand', 'error']),
  'codex:rollout:event/task_failed': sh(['type', 'turn_id', 'error', 'codexErrorInfo', 'resetsAt', 'rateLimits']),
  'codex:rollout:event/sub_agent_activity': sh(['type', 'event_id', 'occurred_at_ms', 'agent_thread_id', 'agent_path', 'kind', 'thread_id', 'detail']),
  'codex:rollout:event/web_search_end': sh(['type', 'call_id', 'query', 'action', 'results']),
  'codex:rollout:event/exec_command_begin': sh(['type', 'call_id', 'command', 'cwd', 'parsed_cmd', 'process_id', 'source']),
  'codex:rollout:event/exec_command_end': sh(['type', 'call_id', 'output', 'error', 'status', 'exit_code', 'stdout', 'stderr', 'aggregated_output', 'duration', 'formatted_output', 'parsed_cmd', 'process_id']),
  'codex:rollout:event/patch_apply_begin': sh(['type', 'call_id', 'reason', 'auto_approved', 'changes']),
  'codex:rollout:event/patch_apply_end': sh(['type', 'call_id', 'output', 'success', 'changes', 'error', 'status', 'stdout', 'stderr']),
  'codex:rollout:event/goal_updated': sh(['type', 'goal']),
  'codex:rollout:event/queue_changed': sh(['type', 'items', 'turn_id', 'verbs']),
  'codex:rollout:item/CommandExecution': sh(['type', 'id', 'process_id', 'command', 'cwd', 'parsed_cmd', 'source', 'status', 'stdout', 'stderr', 'aggregated_output', 'exit_code', 'duration', 'formatted_output']),
  'codex:rollout:item/FileChange': sh(['type', 'id', 'changes', 'status', 'stdout', 'stderr']),
  'codex:rollout:item/Reasoning': sh(['type', 'id', 'summary_text', 'raw_content']),
  'codex:rollout:item/AgentMessage': sh(['type', 'id', 'content', 'phase', 'delivery', 'questions']),
  'codex:rollout:item/Extension': sh(['type', 'id', 'kind', 'query', 'action', 'results', 'status', 'revisedPrompt', 'result', 'transparentBackground', 'failure', 'savedPath', 'durationMs', 'error']), // no `kind` enum: an unknown kind is routed BY NAME to the fall-back card (item_completed:Extension:<kind>) and is never also drift
  'codex:rollout:item/McpToolCall': sh(['type', 'id', 'server', 'tool', 'arguments', 'status', 'result', 'duration', 'connectorId', 'mcpAppResourceUri', 'linkId', 'appName', 'actionName', 'readOnlyHint']),
  'codex:rollout:item/SubAgentActivity': sh(['type', 'id', 'kind', 'agent_thread_id', 'agent_path', 'detail']), // same: an unknown kind is the fall-back card by name
  'codex:rollout:item/ImageView': sh(['type', 'id', 'path']),
  'codex:rollout:item/UserMessage': sh(['type', 'id', 'content', 'client_id']),
  'codex:rollout:item/CollabAgentToolCall': sh(['type', 'id', 'tool', 'status', 'sender_thread_id', 'receiver_thread_ids', 'receiver_agents', 'agents_states']),
  'codex:rollout:item/ContextCompaction': sh(['type', 'id']),
  'codex:rollout:response_item/function_call': sh(['type', 'id', 'name', 'namespace', 'arguments', 'call_id', 'internal_chat_message_metadata_passthrough']),
  'codex:rollout:response_item/function_call_output': sh(['type', 'id', 'call_id', 'output', 'is_error', 'internal_chat_message_metadata_passthrough']),
  'codex:rollout:response_item/custom_tool_call': sh(['type', 'id', 'status', 'call_id', 'name', 'input', 'internal_chat_message_metadata_passthrough']),
  'codex:rollout:response_item/custom_tool_call_output': sh(['type', 'id', 'call_id', 'output', 'internal_chat_message_metadata_passthrough']),
  'codex:rollout:response_item/reasoning': sh(['type', 'id', 'summary', 'encrypted_content', 'content', 'internal_chat_message_metadata_passthrough']),
  'codex:rollout:response_item/message': sh(['type', 'id', 'role', 'content', 'phase', 'internal_chat_message_metadata_passthrough']),
  'codex:rollout:response_item/agent_message': sh(['type', 'id', 'author', 'recipient', 'content', 'phase', 'delivery', 'msg_type', 'internal_chat_message_metadata_passthrough']),
});

// ── Declared upstream, never seen on this instance (the 2.1.281 union minus HANDLED ∪ KNOWN_IGNORED) ──
// (scheduled_task_fire LEFT this list on 2026-09-22: a transcript row exists — it is KNOWN_IGNORED now.)
// Each name carries its ONE-LINE disposition. The binary oracle (test-record-shape §4) asserts every
// subtype/type in the installed binary is on exactly one of the three lists — a CLI update that adds
// a record fails the build with the name printed, before a user ever sees a red card.
const DECLARED_UPSTREAM_UNSEEN = Object.freeze({
  system: Object.freeze({
    post_turn_summary: '@internal background classifier summary per assistant turn — a dim notice if it ever appears (needs_action flag is the interesting bit)',
    task_summary: '@internal mid-turn progress line from the debounced classifier — spinner label candidate',
    informational: 'generic text banner (hook block reasons, slash-command output) — a dim system card',
    permission_retry: '@internal "retrying with <commands>" after a permission-mode change — a dim system card',
    memory_saved: '@internal "<verb> N memories" banner — a dim system card',
    agents_killed: '@internal background agents terminated on interrupt — close every running task card',
    thinking: '@internal rendered thinking content (not the token estimate) — fold with thinking',
    mirror_error: 'SessionStore.append failure for a transcript-mirror batch (cloud sessions) — a red notice',
    control_request_progress: 'progress of a client-originated control_request (side_question) — spinner label',
    model_fallback: 'capacity/overload model fallback — the SAME notice as the `fallback` content block (noticeKind model-fallback)',
    model_consent_fallback: '@internal the pre-send consent gate swapped the model (usage-credit gate) — MONEY-relevant: a red notice + the served-model latch',
    file_snapshot: '@internal plan/todo file snapshot for rewind — card-less',
    peer_message_hold: '@internal a cross-session message HELD by receive-side policy — the sender must see it (vibespace-msg receipt)',
    local_command_output: 'output of a local slash command (/usage, /voice) — assistant-style text card',
    hook_progress: 'incremental hook stdout/stderr — extend the hook card in place',
    plugin_install: 'headless plugin install progress — a dim notice',
    files_persisted: 'cloud files persisted — card-less',
    feedback_draft_queued: '@internal SendFeedback wrote a draft — a dim notice',
    worker_shutting_down: 'graceful worker teardown with a reason — surface the reason on the exited bar',
    turn_handoff_available: '@internal cloud worker registration — card-less',
    memory_recall: 'memories recalled into context — a dim notice',
    elicitation_complete: 'an MCP URL-mode elicitation completed — resolve the elicitation card',
    permission_denied: 'a tool auto-denied without a prompt (classifier / dontAsk / deny rule) — an ATTENTION notice naming the tool',
    dev_intent: '@internal detected kind of development work — card-less',
    turn_preempted: '@internal the CLI stopped the turn to answer a rapid follow-up — a dim notice',
    cloud_session_delta: '@internal cloud-hosted session state delta — card-less',
    upgrade_relay_marker: '@internal relay marker — card-less',
    // NEW in 2.1.281 (2026-09-23). Left on this list so the fall-back Unknown-event card shows it until a
    // consumer exists — it is a COST fact the user may need: from the retried request on, an effort switch
    // rewrites the cached prefix (full-price cache writes) for every model, until a later system/init.
    per_turn_effort_changed: '@internal the CLI stopped sending effort per turn after the server refused it (sent once, before the retried request) — an effort switch now rewrites the prompt cache: a dim notice + the effort picker\'s cache-rewrite warning (not built)',
  }),
  types: Object.freeze({
    bash_command: 'INPUT direction (client → CLI one-shot shell) — never on our stdout',
    auth_status: 'authentication progress — would drive the login bar',
    tool_use_summary: 'a summary over preceding tool uses — a dim fold header candidate',
    prompt_suggestion: 'predicted next prompt (promptSuggestions flag) — composer ghost text candidate',
    conversation_reset: '/clear or plan-mode exit minted a new conversation id — the normalizer must re-key',
    api_metrics: '@internal subagent OTPS metering — card-less',
    os_notification: '@internal native OS notification request — a toast through server-notice',
    apply_flag_settings: '@internal batched flag-settings write request — card-less',
    set_expanded_view: '@internal side-panel hint — card-less',
    active_goal: 'the /goal Stop hook verdict (met / iterations) — feed the goal chip',
    autocompact_state: 'autocompact on/off state — status-bar chip candidate',
    hint_clears: '@internal context-hint clears after a retry — card-less',
    open_message_selector: '@internal /rewind opened the selector — card-less',
    stream_mode: '@internal spinner phase during compaction — card-less (the status lane owns compaction)',
    response_length: '@internal response-length op/delta — card-less',
    refusal_continuation: '@internal refusal salvage phase — a dim notice',
    update_environment_variables: 'runtime env update (control direction) — card-less',
    session_notice: 'INPUT direction (backend → CLI coordination notice) — never on our stdout',
    queued_notification: 'INPUT direction (backend → CLI queued trigger delivery) — never on our stdout',
    transcript_mirror: '@internal per-write mirror batch for the SessionStore — card-less',
  }),
});
// The build that FIRST declared a stream shape / subtype, for the rows newer than the 2.1.274 dump. An
// older installed CLI (a developer box that has not auto-updated yet) legitimately lacks them, so the
// oracle's reverse legs (dead list entry / ghost shape) excuse a row whose build is NEWER than the
// installed one — printed by name, never silent; the forward legs (unlisted subtype, undeclared field)
// stay strict on every build.
const SHAPE_SINCE = Object.freeze({
  'system/per_turn_effort_changed': '2.1.281',
});
// Names the corpus carries that are NOT in the SDK union (the REPL's own rows): the oracle's reverse
// check excuses them so a handled/ignored list entry is never called dead by mistake.
const CORPUS_ONLY_SUBTYPES = Object.freeze({
  local_command: 'the TUI user\'s slash command as persisted — history only, rendered through the command bubble',
  microcompact_boundary: 'legacy 2.1.2xx micro-compaction marker, the REPL renders nothing for it',
  success: 'legacy list entry (never observed as a system subtype)',
  bridge_status: 'the TUI\'s "/remote-control is active" banner (2.1.81 transcripts, 11 rows) — not in the SDK union; VibeSpace never runs the remote-control bridge, card-less',
});

// ── carrier + shape key ──────────────────────────────────────────────────────────────────────────
/** Which carrier wrote this record. claude: a JSONL row wears the transcript envelope
 *  (parentUuid / isSidechain / sessionId…); the wire never does. codex: one carrier — the live buffer
 *  and the rollout share the {timestamp, type, payload} line. */
function carrierOf(harness, record) {
  if (harness === 'codex') return 'rollout';
  if (!record || typeof record !== 'object') return 'stream';
  return ('parentUuid' in record || 'isSidechain' in record || 'sessionId' in record || 'userType' in record) ? 'transcript' : 'stream';
}
/** The shape a record is judged as. opts.kind: 'record' (default) | 'event' (a codex event payload)
 *  | 'item' (a codex item_completed item). null when the record names no shape. */
function shapeKeyOf(harness, carrier, record, opts = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const kind = opts.kind || 'record';
  if (harness === 'codex') {
    if (kind === 'event') return record.type ? `codex:${carrier}:event/${record.type}` : null;
    if (kind === 'item') return record.type ? `codex:${carrier}:item/${record.type}` : null;
    const t = record.type;
    if (!t) return null;
    if (t === 'event_msg') return record.payload?.type ? `codex:${carrier}:event/${record.payload.type}` : null;
    if (t === 'response_item') return record.payload?.type ? `codex:${carrier}:response_item/${record.payload.type}` : null;
    return `codex:${carrier}:${t}`;
  }
  const t = record.type;
  if (!t) return null;
  if (t === 'system') return record.subtype ? `claude:${carrier}:system/${record.subtype}` : null;
  return `claude:${carrier}:${t}`;
}

// ── the judge ────────────────────────────────────────────────────────────────────────────────────
function judgeObject(obj, spec, prefix, envelope, out) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    if (envelope && envelope.has(k)) continue;
    if (isOurs(k)) continue;
    const isKnown = spec.known.has(k);
    if (!isKnown && !spec.ignored.has(k)) { out.fields.push(prefix + k); continue; }
    const en = spec.enums[k];
    if (en && typeof v === 'string' && !en.has(v)) out.enumDrift.push({ field: prefix + k, value: v.slice(0, 80) });
    const sub = spec.nested[k];
    if (sub && v && typeof v === 'object' && !Array.isArray(v)) judgeObject(v, sub, prefix + k + '.', null, out);
  }
}
function judgeBlocks(message, spec, out) {
  const content = message && typeof message === 'object' ? message.content : null;
  if (!Array.isArray(content)) return;
  const seen = new Set();
  for (const b of content) {
    const bt = b && typeof b === 'object' ? b.type : null;
    if (typeof bt !== 'string' || seen.has(bt)) continue;
    seen.add(bt);
    if (!spec.blocks.has(bt)) out.fields.push('message.content[].type=' + bt.slice(0, 60));
  }
}
/** The verdict on ONE record: {shape, fields:[dotted paths], enumDrift:[{field,value}]} when a DECLARED
 *  shape carries something it does not declare; null when the shape is undeclared or clean. Never
 *  throws on any input shape. */
function unknownFields(harness, carrier, record, opts = {}) {
  const shape = shapeKeyOf(harness, carrier, record, opts);
  if (!shape) return null;
  const spec = SHAPES[shape];
  if (!spec) return null;
  const out = { shape, fields: [], enumDrift: [] };
  const kind = opts.kind || 'record';
  if (harness === 'codex' && kind === 'envelope') {
    // an event_msg CARRIER line judged at the envelope level only — its payload is judged
    // exactly once, by the event hook (kind 'event'); the two verdicts share the shape key
    // so they merge into the ONE card per shape (r3 2026-09-21: a new top-level key on an
    // event line was invisible while the same key on a response_item line was flagged)
    const env = ENVELOPES['codex:rollout'];
    for (const k of Object.keys(record)) if (!env.has(k) && !isOurs(k)) out.fields.push(k);
  } else if (harness === 'codex' && kind === 'record') {
    // the rollout line: envelope keys at the top, the payload judged by the shape
    const env = ENVELOPES['codex:rollout'];
    for (const k of Object.keys(record)) if (!env.has(k) && !isOurs(k)) out.fields.push(k);
    judgeObject(record.payload, spec, '', null, out);
  } else if (harness === 'codex') {
    judgeObject(record, spec, '', null, out);
  } else if (spec.blocks && (record.type === 'user' || record.type === 'assistant')) {
    judgeBlocks(record.message, spec, out);
  } else {
    const env = carrier === 'transcript' ? ENVELOPES['claude:transcript'] : ENVELOPES['claude:stream'];
    const withType = new Set(['type', 'subtype']);
    for (const [k, v] of Object.entries(record)) {
      if (withType.has(k) || env.has(k) || isOurs(k)) continue;
      if (!spec.known.has(k) && !spec.ignored.has(k)) { out.fields.push(k); continue; }
      const en = spec.enums[k];
      if (en && typeof v === 'string' && !en.has(v)) out.enumDrift.push({ field: k, value: v.slice(0, 80) });
      const sub = spec.nested[k];
      if (sub && v && typeof v === 'object' && !Array.isArray(v)) judgeObject(v, sub, k + '.', null, out);
    }
  }
  if (!out.fields.length && !out.enumDrift.length) return null;
  out.fields = [...new Set(out.fields)].slice(0, 40);
  out.enumDrift = out.enumDrift.slice(0, 20);
  return out;
}

// ── the sample redactor ──────────────────────────────────────────────────────────────────────────
// A key is secret-looking by its SEGMENTS (camelCase / snake_case / kebab split), never by a
// substring: the old /key/ alternative masked the notification's own `key` — the one field a
// drift card on system/notification exists to show — and `monkey` / `hotkey` / `keyboard` with it.
// A whole segment in SECRET_SEGMENTS qualifies; `key` qualifies only as the second half of a
// credential compound (api_key / apiKey / access_key / private_key / secret_key / auth_key /
// signing_key / session_key / apiKeySource). Numbers are never masked (counts such as input_tokens).
const SECRET_SEGMENTS = new Set(['token', 'tokens', 'secret', 'secrets', 'password', 'passwd', 'pwd', 'authorization', 'bearer', 'credential', 'credentials', 'apikey', 'cookie']);
const KEY_COMPOUND_HEADS = new Set(['api', 'access', 'private', 'secret', 'auth', 'signing', 'session', 'encryption', 'license']);
function keySegments(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function isSecretKey(name) {
  if (!name) return false;
  const segs = keySegments(name);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (SECRET_SEGMENTS.has(s)) return true;
    if ((s === 'key' || s === 'keys') && i > 0 && KEY_COMPOUND_HEADS.has(segs[i - 1])) return true;
  }
  return false;
}
/** A deep copy with every STRING value under a secret-looking key masked (numbers such as
 *  input_tokens are counts, not secrets, and stay). Depth-bounded; arrays walked. */
function redactRecord(v, depth = 0, keyName = '') {
  if (depth > 12) return '«…»';
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => redactRecord(x, depth + 1, keyName));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = redactRecord(x, depth + 1, k);
    return o;
  }
  if (typeof v === 'string' && keyName && isSecretKey(keyName)) return v ? '«redacted»' : v;
  return v;
}
/** The redacted record, pretty-printed and bounded at 64 KB (the same bound as the unknown-event card). */
function unknownFieldsSample(record) {
  try {
    const s = JSON.stringify(redactRecord(record), null, 2);
    if (typeof s !== 'string') return '';
    return s.length > 65536 ? s.slice(0, 65536) + '\n… (truncated at 64 KB)' : s;
  } catch { return ''; }
}

/** Every declared field of a shape (known ∪ ignored), for the census legs. */
function declaredFields(shapeKey) {
  const s = SHAPES[shapeKey];
  return s ? new Set([...s.known, ...s.ignored.keys()]) : null;
}

// The claude build the STREAM shapes are verified against (2.1.274 dump + the 2.1.280 additions declared
// 2026-09-22 + the 2.1.281 additions declared 2026-09-23 — one new subtype, six fields on three shapes).
// test-record-shape's binary oracle is STRICT against this exact build and on any developer
// box; on the Actions mirror (which installs whatever npm serves today) a NEWER build's drift is printed
// and skipped, never a red gate nobody reads.
const SCHEMA_CLI_VERSION = '2.1.281';

module.exports = { SCHEMA_CLI_VERSION, SHAPE_SINCE, SHAPES, ENVELOPES, OURS, isOurs, CONTENT_BLOCK_TYPES, CORPUS_KNOWN, DECLARED_UPSTREAM_UNSEEN, CORPUS_ONLY_SUBTYPES, carrierOf, shapeKeyOf, unknownFields, redactRecord, unknownFieldsSample, declaredFields, isSecretKey, keySegments };
