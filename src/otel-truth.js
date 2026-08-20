// PURE OTLP-logs parser → per-request billing-TRUTH records (B-345b 终案,
// 2.361.0). The Claude CLI's built-in OpenTelemetry export is the ONLY
// channel that NAMES the billing org per request (transcripts, statusline and
// rate_limit_event all carry quota VALUES but no identity — verified by field
// inventory on 2.1.235). Each `claude_code.api_request` log record carries
// organization.id + request_id (the ledger's rid primary key) + session.id +
// model + all four token classes + cost_usd — a complete truth record that
// joins the usage ledger exactly. The CLI pushes these to OUR loopback
// receiver: zero vendor calls, §ban-safety compatible by construction.
//
// Shape captured from a REAL 2.1.235 payload (2026-08-19, one haiku turn →
// /tmp OTLP sink; scripts/test-otel-truth.mjs pins the sanitized copy):
// { resourceLogs: [ { resource: { attributes: [{key,value}] },
//     scopeLogs: [ { scope: {name}, logRecords: [ { timeUnixNano: "…",
//       body: {stringValue:"claude_code.api_request"},
//       attributes: [ {key:"organization.id", value:{stringValue:"…"}},
//                     {key:"input_tokens", value:{intValue:10}}, … ] } ] } ] } ] }
// Identity attrs ride on EVERY record (not only the resource); intValue may
// be a number OR a protobuf-JSON string; timestamps prefer the ISO
// event.timestamp attr with timeUnixNano as fallback.

// One OTLP attribute value → plain JS value (tolerant across encodings).
function attrVal(v) {
  if (v == null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) { const n = Number(v.intValue); return Number.isFinite(n) ? n : v.intValue; }
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('boolValue' in v) return !!v.boolValue;
  return undefined;
}

function attrMap(list) {
  const out = {};
  for (const a of list || []) { if (a && a.key !== undefined) out[a.key] = attrVal(a.value); }
  return out;
}

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// OTLP /v1/logs JSON payload → truth records. Default keep-set is the
// api_request event (the billing record); unknown event names are counted so
// the caller can surface new upstream record types instead of silently
// dropping them (the api_retry lesson).
function parseOtlpLogs(payload, { keep = ['api_request'] } = {}) {
  const keepSet = new Set(keep);
  const records = [];
  const seen = {}; // event.name → count (observability honesty)
  for (const rl of payload?.resourceLogs || []) {
    const res = attrMap(rl.resource?.attributes);
    for (const sl of rl.scopeLogs || []) {
      for (const lr of sl.logRecords || []) {
        const at = { ...res, ...attrMap(lr.attributes) };
        const name = at['event.name'] || String(attrVal(lr.body) || '').replace(/^claude_code\./, '');
        if (!name) continue;
        seen[name] = (seen[name] || 0) + 1;
        if (!keepSet.has(name)) continue;
        const iso = at['event.timestamp'];
        const ts = iso ? Date.parse(iso) : (lr.timeUnixNano ? Math.round(Number(lr.timeUnixNano) / 1e6) : 0);
        records.push({
          event: name,
          ts: Number.isFinite(ts) ? ts : 0,
          rid: at.request_id || null,
          sid: at['session.id'] || null,
          orgUuid: at['organization.id'] ? String(at['organization.id']).toLowerCase() : null,
          accountUuid: at['user.account_uuid'] || null,
          email: at['user.email'] ? String(at['user.email']).toLowerCase() : null,
          model: at.model || null,
          i: num(at.input_tokens),
          o: num(at.output_tokens),
          cr: num(at.cache_read_tokens),
          cw: num(at.cache_creation_tokens),
          costUsd: num(at.cost_usd),
          cliVersion: res['service.version'] || null,
        });
      }
    }
  }
  return { records, seen };
}

module.exports = { parseOtlpLogs, attrVal, attrMap };
