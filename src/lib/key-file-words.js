// THE KEY-FILE LAW in the person's words (lane key-file-law-stores, .269): a store whose key file cannot open what it
// holds says so on ITS rows — restore the key file from a backup; never "enter it again", never a silent empty store.
// The codes come from src/key-file.js (server): 'key-missing' | 'key-unreadable:<errno>' | 'key-malformed'.
import { t } from './i18n.js';

const CODE_RE = /^(key-missing|key-malformed|key-unreadable)(?::([A-Za-z0-9_]+))?$/;

/** A refusal code + the key file's name → one line ('' for anything that is not a refusal). */
export function keyFileWords(code, file) {
  const m = CODE_RE.exec(String(code || ''));
  if (!m) return '';
  const f = String(file || '');
  if (m[1] === 'key-missing') return t('Key file {file} is missing — restore it from a backup', { file: f });
  if (m[1] === 'key-malformed') return t('Key file {file} is damaged — restore it from a backup; nothing was replaced', { file: f });
  return t('Key file {file} could not be read ({code}) — no new key was made', { file: f, code: m[2] || '?' });
}

/** A desktop app's `rec.secrets` ('unavailable: key-missing (.app-secrets-key)') → its words, or ''. */
export function appSecretsKeyWords(secrets) {
  const m = /^unavailable:\s*(key-[a-z]+(?::[A-Za-z0-9_]+)?)\s*\(([^()]+)\)$/.exec(String(secrets || ''));
  return m ? keyFileWords(m[1], m[2]) : '';
}
