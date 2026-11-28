// src/lib/ports-owed.js — B-73c4 (主开发 r5561): what a Ports row whose public address is still up SAYS. PURE (no DOM), so a fast leg
// reads the very words the panel draws: what it was (the machine and port, its service where it has one), THE ADDRESS THAT IS STILL
// UP (to open), why, and the press — each as text a person reads. An orphan (a relay file of this hub no forward names) has no
// address this hub recorded: its own file names it.
const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m));
export function owedRowText(f, { nameOf = (h) => String(h || ''), tr = fill, why = '', service = null } = {}) {
  const name = f.orphan ? tr('A relay file of this hub: {name}', { name: f.label || f.publicName || '' })
    : `${nameOf(f.hostId)}${f.targetHost ? '→' + f.targetHost : ''}:${f.remotePort}${service ? ' — ' + service : ''}`;
  const url = f.stillUpUrl || f.publicUrl || null;
  return { name, url, addressLead: url ? tr('Its address:') : tr('Its address is written in that relay file.'), why, press: tr('Try again') };
}
