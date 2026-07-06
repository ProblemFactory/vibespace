// opts.endpoint: () => url — swap the completion source at query time (used
// to point at a remote host's ssh-backed completion when one is chosen).
// opts.priorityPaths: () => string[] — paths to surface at the TOP of the
// dropdown, highlighted (used to float a task's linked folders when creating a
// session "in" a task). Shown even when the input is empty (on focus).
export function setupDirAutocomplete(input, dropdown, { onNavigate, endpoint, priorityPaths } = {}) {
  let timer = null, abortCtrl = null, activeIdx = -1, items = [];

  const hide = () => { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; items = []; activeIdx = -1; };

  // Task folders that match the current input (or all of them when empty).
  const getPriority = () => {
    if (!priorityPaths) return [];
    const all = (priorityPaths() || []).filter(Boolean);
    const val = input.value.trim();
    if (!val) return all.slice(0, 8);
    const low = val.toLowerCase();
    return all.filter((p) => p.toLowerCase().includes(low)).slice(0, 8);
  };

  const pick = (text) => { input.value = text + '/'; hide(); if (onNavigate) onNavigate(input.value); else fetchAC(input.value); };

  const show = (suggestions) => {
    const priority = getPriority();
    const pset = new Set(priority);
    const rest = (suggestions || []).filter((s) => !pset.has(s));
    items = [...priority, ...rest];
    dropdown.innerHTML = ''; activeIdx = -1;
    if (!items.length) { hide(); return; }
    dropdown.classList.remove('hidden');
    const addItem = (text, isTask) => {
      const el = document.createElement('div');
      el.className = 'autocomplete-item' + (isTask ? ' autocomplete-item-task' : '');
      if (isTask) el.title = 'Linked to this task — starts the session here';
      el.appendChild(document.createTextNode(text));
      el.onmousedown = (e) => { e.preventDefault(); pick(text); };
      dropdown.appendChild(el);
    };
    for (const p of priority) addItem(p, true);
    for (const r of rest) addItem(r, false);
  };

  const highlight = (idx) => {
    dropdown.querySelectorAll('.autocomplete-item').forEach((el, i) => el.classList.toggle('active', i === idx));
    activeIdx = idx;
  };

  const fetchAC = (val) => {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const url = (endpoint && endpoint()) || `/api/dir-complete?path=${encodeURIComponent(val)}`;
    const withPath = url.includes('path=') ? url : `${url}${url.includes('?') ? '&' : '?'}path=${encodeURIComponent(val)}`;
    fetch(withPath, { signal: abortCtrl.signal })
      .then(r => r.json()).then(d => show(d.suggestions || [])).catch(() => {});
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (!input.value) { if (getPriority().length) show([]); else hide(); return; }
    timer = setTimeout(() => fetchAC(input.value), 150);
  });

  // Focusing an empty field reveals the task's linked folders immediately.
  input.addEventListener('focus', () => { if (!input.value && getPriority().length) show([]); });

  input.addEventListener('keydown', (e) => {
    if (dropdown.classList.contains('hidden') || !items.length) {
      if (e.key === 'Tab' && input.value) { e.preventDefault(); fetchAC(input.value); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(activeIdx + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(activeIdx - 1, 0)); }
    else if (e.key === 'Tab' || e.key === 'Enter') {
      if (activeIdx >= 0) { e.preventDefault(); pick(items[activeIdx]); }
      else if (e.key === 'Tab' && items.length === 1) { e.preventDefault(); pick(items[0]); }
    } else if (e.key === 'Escape') { hide(); }
  });

  input.addEventListener('blur', () => setTimeout(hide, 200));

  return { hide };
}
