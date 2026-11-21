// B-69a7 (round wl0kkbeug's should, a person notices it): the «End them» line's words after a press — the line's own words, then
// the LATEST press's outcome only. A repeat press (already ending them, a check that did not finish, a row not readable again)
// says its outcome IN PLACE of the earlier one, never after it: the line never grows. PURE, imports nothing (the page and a suite).
export function endLineWords(base, said) {
  const b = String(base || '');
  return Array.isArray(said) && said.length ? `${b} — ${said.join(' · ')}` : b;
}
