'use strict';
// THE CLI'S OWN ROUTE AND CREDENTIAL NAMES — PURE, imports nothing (B-e7c0 cure, 主开发 2026-11-19 07:55Z: ONE list both readers
// import). Moved here word for word from src/managed-claude-settings.js, which refuses a MANAGED env naming one, and read by
// src/billing-pick.js ownSettingsOf, which drops every one of them from a person's settings file merged under a subscription pick.
// THE ENV RULE (主开发 00:42Z «only credentials and routes»; 01:46Z «against the bundle's own, whole»): a managed env name refuses when
// it decides WHERE the CLI's requests go, WHO can read them, or WHAT credential they carry. The list is the CLI 2.1.322's OWN: the set
// of connection names it strips from a settings source it cannot verify (`lu` in its bundle — its proxy and TLS-trust names, its cloud
// switches and addresses, its credentials and credential files, the config and home folders it reads a login from), WHOLE and in its
// order, its spreads written out; and four it keeps in its other lists (its proxy set's two CLAUDE_CODE_ proxies, the sessions
// token, the Google Cloud auth). TRUST names count by themselves: a managed CA (or the TLS check off) lets whoever holds that CA read
// every request, the provider's key in it — an organisation's inspecting proxy named in the managed env, in the hub's own
// environment (the CLI inherits it), or on the network with no proxy name at all. Matched as the CLI matches them: in ANY case. A
// counted name refuses WHATEVER its value — an EMPTY value is copied over the spawn's own too (a blanked provider token or address
// lets the CLI fall back to another login or to Anthropic's address) — except the seven cloud switches, a route only when ON.
const CLI_CONNECTION_NAMES = Object.freeze([
  // ...us (its network names: proxies, TLS trust, the client certificate)
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'ALL_PROXY', 'NPM_CONFIG_HTTPS_PROXY', 'NPM_CONFIG_HTTP_PROXY', 'NPM_CONFIG_PROXY',
  'NODE_EXTRA_CA_CERTS', 'CLAUDE_CODE_CERT_STORE', 'CLAUDE_CODE_DISABLE_LOOPED_CROSS_CERT_DROP', 'CLAUDE_CODE_DISABLE_SELF_NAMED_CERT_DROP', 'CLAUDE_CODE_CLIENT_CERT',
  'CLAUDE_CODE_CLIENT_KEY', 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE', 'NODE_TLS_REJECT_UNAUTHORIZED', 'BUN_TLS_REFUSE_DISTRUSTED_KEYS',
  'CLAUDE_CODE_PROXY_RESOLVES_HOSTS', 'CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER', 'CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS', 'API_FORCE_IDLE_TIMEOUT', 'ANTHROPIC_UNIX_SOCKET',
  'CLAUDE_CODE_DISABLE_HTTPS_AGENT_KEEPING', 'NODE_OPTIONS',
  // ...UM (the cloud switches and their resources)
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_MANTLE',
  'CLAUDE_CODE_USE_GATEWAY', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_AWS_WORKSPACE_ID', 'ANTHROPIC_GOOGLE_CLOUD_PROJECT',
  'ANTHROPIC_GOOGLE_CLOUD_LOCATION', 'ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID', 'CLOUD_ML_REGION',
  // ...MV (the addresses, with ...oc and ...ls: the artifacts' and the memory service's)
  'ANTHROPIC_BASE_URL', '_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL', 'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_BASE_URL', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_AWS_BASE_URL',
  'ANTHROPIC_GOOGLE_CLOUD_BASE_URL', 'ANTHROPIC_BEDROCK_MANTLE_BASE_URL', 'CLAUDE_CODE_ARTIFACTS_API_BASE_URL', 'CLAUDE_CODE_ARTIFACTS_API_TOKEN', 'CLAUDE_CODE_ARTIFACT_ASSET_BASE_URL',
  'CLAUDE_CODE_ARTIFACT_LIVE_BASE_URL', 'CLAUDE_CODE_ARTIFACT_SYNC_BASE_URL', 'CLAUDE_CODE_ARTIFACT_VIEWER_BASE_URL', 'CLAUDE_CODE_MEMORY_API_BASE_URL', 'CLAUDE_CODE_MEMORY_API_TOKEN',
  'AWS_ENDPOINT_URL_STS', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_SSO', 'AWS_ENDPOINT_URL_SSO_OIDC', 'AWS_ENDPOINT_URL_BEDROCK', 'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
  // ...Iun, ...hn, ...IUr (the cloud SDKs' credentials, credential files and metadata addresses)
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI', 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI', 'AWS_CONTAINER_AUTHORIZATION_TOKEN', 'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT', 'AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE', 'AWS_WEB_IDENTITY_TOKEN_FILE', 'AWS_ROLE_ARN', 'GCE_METADATA_HOST', 'GCE_METADATA_ROOT', 'GCE_METADATA_IP',
  'METADATA_SERVER_DETECTION', 'CLOUDSDK_CONFIG', 'GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES', 'GCLOUD_PROJECT', 'CLAUDE_CODE_CUSTOM_OAUTH_URL',
  // ...aO (the Anthropic and cloud keys and tokens)
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_AUTH_TOKEN', 'ANTHROPIC_AWS_API_KEY',
  // the logins, the federation profile and the folders a login is read from
  'CLAUDE_CODE_API_BASE_URL', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES', 'CLAUDE_CODE_OAUTH_CLIENT_ID', 'CLAUDE_CODE_SESSION_ACCESS_TOKEN', 'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
  'CLAUDE_CODE_ENVIRONMENT_KIND', 'CLAUDE_CODE_REMOTE_SESSION_ID', 'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_WORKSPACE_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID',
  'ANTHROPIC_IDENTITY_TOKEN', 'ANTHROPIC_IDENTITY_TOKEN_FILE', 'ANTHROPIC_SCOPE', 'ANTHROPIC_PROFILE', 'ANTHROPIC_CONFIG_DIR', 'CLAUDE_CODE_FEDERATION_CACHE_DIR', 'HOME', 'XDG_CONFIG_HOME',
  'APPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'PROGRAMDATA', 'ALLUSERSPROFILE', 'ANTHROPIC_CUSTOM_HEADERS', 'CLAUDE_CODE_HOST_CREDS_FILE', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
  'CLAUDE_CODE_HOST_AUTH_ENV_VAR', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CLAUDE_CODE_REMOTE_SETTINGS_PATH', 'CLAUDE_CODE_MANAGED_SETTINGS_PATH',
  'CLAUDE_CODE_DISABLE_ADMIN_ENV_UNION', 'CLAUDE_CODE_MOCK_REMOTE_SETTINGS', 'USE_LOCAL_OAUTH', 'USE_STAGING_OAUTH', 'CLAUDE_LOCAL_OAUTH_API_BASE', 'CLAUDE_LOCAL_OAUTH_APPS_BASE',
  'CLAUDE_LOCAL_OAUTH_CONSOLE_BASE', 'CLAUDE_BRIDGE_BASE_URL', 'CLAUDE_BRIDGE_OAUTH_TOKEN', 'CLAUDE_BRIDGE_SESSION_INGRESS_URL', 'CLAUDE_REMOTE_TOOLS_BRIDGE_URL', 'CLAUDE_CODE_GB_BASE_URL']);
const ENV_OTHER_NAMES = Object.freeze(['CLAUDE_CODE_HTTPS_PROXY', 'CLAUDE_CODE_HTTP_PROXY', 'CLAUDE_CODE_SESSIONS_OAUTH_TOKEN', 'ANTHROPIC_GOOGLE_CLOUD_AUTH']);
// NOT COUNTED, each for its reason (the rest of the CLI's list counts): it neither sends a request elsewhere, nor lets another read it,
// nor carries a credential. (npm's three proxy names COUNT — 主开发 02:49Z: when ALL_PROXY is set without the four names the CLI's
// request proxy reads, it hands its axios client back to that client's own env resolution — `Mt.defaults.proxy=n?void 0:!1` — and
// such resolvers read the npm names.)
const ENV_NOT_COUNTED = Object.freeze({
  NO_PROXY: 'narrows where a proxy is used',
  API_FORCE_IDLE_TIMEOUT: 'a connection timing', CLAUDE_CODE_DISABLE_HTTPS_AGENT_KEEPING: 'a connection timing', CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS: 'a connection timing',
});
const ENV_SWITCHES = Object.freeze(new Set(['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD',
  'CLAUDE_CODE_USE_MANTLE', 'CLAUDE_CODE_USE_GATEWAY']));   // a route only when ON
const ENV_NAMES = Object.freeze(new Set([...CLI_CONNECTION_NAMES, ...ENV_OTHER_NAMES].filter((n) => !Object.prototype.hasOwnProperty.call(ENV_NOT_COUNTED, n) && !ENV_SWITCHES.has(n))));
const switchedOff = (v) => v === false || v === 0 || /^(?:|0|false|no|off)$/i.test(String(v == null ? '' : v).trim());
/** B-e7c0 cure: does an env name decide where a request goes, who reads it, or what credential it carries? — in ANY case; a switch
 *  counts when PRESENT (whatever its value: under a pick nothing of it may ride) */
const routeNameAny = (name) => { const n = String(name).toUpperCase(); return ENV_SWITCHES.has(n) || ENV_NAMES.has(n); };

module.exports = { CLI_CONNECTION_NAMES, ENV_OTHER_NAMES, ENV_NOT_COUNTED, ENV_SWITCHES, ENV_NAMES, switchedOff, routeNameAny };
