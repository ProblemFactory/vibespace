// src/mount-providers/s3.js — S3-compatible object storage (the default row: a record without a type is S3).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

module.exports = {
  id: 's3',
  default: true,          // `m.type || <this id>` — a record saved before types existed, and a child's own record
  oauth: null,            // no OAuth client of its own to lend
  s3Backend: () => true,  // rclone's s3 backend (the --s3-use-accept-encoding-gzip=false proxy fix)
  s3Share: true,          // a full-credential record mints S3 shares (canShareFromMount)
  label: (m) => `${m.bucket}${m.prefix ? '/' + m.prefix : ''} @ ${m.endpoint}`,
  config(m, out, dec, x) {
    Object.assign(out, { endpoint: m.endpoint, bucket: m.bucket, prefix: m.prefix, accessKey: m.accessKey, secretKey: dec(m.secretKeyEnc), sessionToken: dec(m.sessionTokenEnc) });
  },
  create(m, cfg, x) {
    for (const k of ['endpoint', 'bucket', 'accessKey', 'secretKey']) if (!cfg[k]) throw new Error(`${k} required`);
    Object.assign(m, {
      endpoint: String(cfg.endpoint), bucket: String(cfg.bucket),
      prefix: String(cfg.prefix || '').replace(/^\/+|\/+$/g, ''),
      accessKey: String(cfg.accessKey), secretKeyEnc: x._enc(cfg.secretKey),
      sessionTokenEnc: cfg.sessionToken ? x._enc(cfg.sessionToken) : null,
    });
  },
  child(m, cfg, p, x) {
    if (!cfg.bucket) throw new Error('bucket required');
    m.bucket = String(cfg.bucket);
    m.prefix = String(cfg.prefix || '').replace(/^\/+|\/+$/g, '');
  },
  updateChild(m, patch, setIf, x) {
    setIf('bucket');
    if (patch.prefix !== undefined) m.prefix = String(patch.prefix || '').replace(/^\/+|\/+$/g, '');
  },
  update(m, patch, setIf, x) {
    setIf('endpoint'); setIf('bucket');
    if (patch.prefix !== undefined) m.prefix = String(patch.prefix || '').replace(/^\/+|\/+$/g, '');
    setIf('accessKey');
    if (patch.secretKey) m.secretKeyEnc = x._enc(String(patch.secretKey));
    if (patch.sessionToken) m.sessionTokenEnc = x._enc(String(patch.sessionToken));
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = 's3';
    env[P('PROVIDER')] = 'Other';
    env[P('ENDPOINT')] = m.endpoint;
    env[P('ACCESS_KEY_ID')] = m.accessKey;
    env[P('SECRET_ACCESS_KEY')] = x._dec(m.secretKeyEnc);
    env[P('FORCE_PATH_STYLE')] = 'true';
    env[P('NO_CHECK_BUCKET')] = 'true';
    if (m.sessionTokenEnc) env[P('SESSION_TOKEN')] = x._dec(m.sessionTokenEnc);
    return `${R}:${m.bucket}${m.prefix ? '/' + m.prefix : ''}`;
  },
};
