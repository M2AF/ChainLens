(function () {
  'use strict';

  const engine = window.chainlensThemes;
  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const base = [
    { id: 'light', name: 'Light', colors: { bg: '#f8fafc', accent: '#3b82f6', text: '#0f172a' } },
    { id: 'dark', name: 'Dark', colors: { bg: '#020617', accent: '#3b82f6', text: '#f8fafc' } },
  ];
  const themeVars = ['--bg', '--panel', '--panel-strong', '--line', '--text', '--muted', '--soft', '--cyan', '--blue', '--code', '--shadow'];
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private browsing */ } };
  let themeId = read('cl_theme') || (read('darkMode') === 'true' ? 'dark' : 'light');
  let token = read('cl_token');
  let eligible = false;
  let entries = {};
  let editing = null;
  let busy = false;
  let confirmDelete = false;

  const swatch = (element, colors) => {
    const [bg, accent] = engine.swatchOf(colors);
    element.style.background = `linear-gradient(135deg, ${bg} 0 50%, ${accent} 50% 100%)`;
  };
  const customs = () => eligible ? engine.liveThemes(entries) : [];
  const builtins = () => engine.BUILTIN_THEMES.map(theme => {
    const override = engine.sanitizeEntries(entries)[`custom-builtin-${theme.id}`];
    return override && override.d !== 1 ? { ...theme, colors: override.c, edited: true } : theme;
  });
  const findTheme = id => base.find(theme => theme.id === id)
    || (eligible ? [...builtins(), ...customs()].find(theme => theme.id === id) : null);

  function paint() {
    const theme = findTheme(themeId);
    const fallback = base[read('darkMode') === 'true' ? 1 : 0];
    const active = theme || fallback;
    let tone = active.id;
    if (active.id === 'light' || active.id === 'dark') {
      engine.applyMode(active.id);
      themeVars.forEach(name => root.style.removeProperty(name));
    } else {
      const palette = engine.paletteFor(active.colors);
      const rgb = name => `rgb(${palette.vars[name]})`;
      tone = engine.applyTheme(active.colors);
      const dark = tone === 'dark';
      root.style.setProperty('--bg', rgb('--cl-page'));
      root.style.setProperty('--panel', rgb(dark ? '--cl-slate-900' : '--cl-slate-100'));
      root.style.setProperty('--panel-strong', rgb(dark ? '--cl-slate-900' : '--cl-slate-50'));
      root.style.setProperty('--text', rgb(dark ? '--cl-slate-50' : '--cl-slate-950'));
      root.style.setProperty('--soft', rgb(dark ? '--cl-slate-300' : '--cl-slate-700'));
      root.style.setProperty('--muted', rgb(dark ? '--cl-slate-400' : '--cl-slate-600'));
      root.style.setProperty('--cyan', rgb(dark ? '--cl-cyan-400' : '--cl-blue-700'));
      root.style.setProperty('--blue', rgb('--cl-blue-500'));
      root.style.setProperty('--line', `color-mix(in srgb, var(--text) 18%, transparent)`);
      root.style.setProperty('--code', rgb('--cl-slate-950'));
      root.style.setProperty('--shadow', '0 24px 70px rgba(0, 0, 0, .2)');
    }
    root.dataset.theme = tone;
    $('sidebarLogo').src = tone === 'dark' ? '/ChainLens (dark).png' : '/ChainLens (light).png';
    $('themeLabel').textContent = active.name;
    swatch($('themeSwatch'), active.colors);
    write('darkMode', String(tone === 'dark'));
  }

  function choose(id) {
    themeId = id;
    write('cl_theme', id);
    paint();
    renderMenu();
    closeMenu();
  }

  const menu = $('themeMenu');
  function closeMenu() { menu.hidden = true; $('themePickerButton').setAttribute('aria-expanded', 'false'); }
  function addHeading(label) {
    const p = document.createElement('p');
    p.className = 'theme-heading'; p.textContent = label; menu.append(p);
  }
  function addRow(theme, editable) {
    const row = document.createElement('div'); row.className = 'theme-row';
    if (theme.id === themeId) row.classList.add('selected');
    const choice = document.createElement('button');
    choice.type = 'button'; choice.className = 'theme-choice'; choice.setAttribute('role', 'menuitem');
    choice.setAttribute('aria-current', theme.id === themeId ? 'true' : 'false');
    const dot = document.createElement('span'); dot.className = 'theme-swatch'; swatch(dot, theme.colors);
    const name = document.createElement('span'); name.textContent = theme.name;
    choice.append(dot, name);
    if (theme.id === themeId) {
      const check = document.createElement('span'); check.textContent = '✓'; check.style.color = 'var(--cyan)'; choice.append(check);
    }
    choice.addEventListener('click', () => choose(theme.id)); row.append(choice);
    if (editable) {
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'theme-edit'; edit.textContent = '✎';
      edit.setAttribute('aria-label', `Edit ${theme.name}`);
      edit.addEventListener('click', () => { closeMenu(); openEditor(theme); }); row.append(edit);
    }
    menu.append(row);
  }
  function renderMenu() {
    menu.replaceChildren();
    addHeading('Mode'); base.forEach(theme => addRow(theme, false));
    addHeading('MagicMoney');
    if (eligible) builtins().forEach(theme => addRow(theme, true));
    else {
      const hint = document.createElement('p'); hint.className = 'theme-hint';
      hint.textContent = 'Sign in on ChainLens with a verified wallet and Google or Discord to use synced themes.';
      menu.append(hint);
    }
    addHeading('Your themes');
    if (eligible) {
      customs().forEach(theme => addRow(theme, true));
      if (customs().length < engine.MAX_SYNCED_THEMES) {
        const create = document.createElement('button');
        create.type = 'button'; create.className = 'theme-create';
        const plus = document.createElement('span'); plus.className = 'plus'; plus.textContent = '+';
        const label = document.createElement('span'); label.textContent = 'Create New';
        create.append(plus, label);
        create.addEventListener('click', () => { closeMenu(); openEditor(null); });
        menu.append(create);
      }
    } else {
      const hint = document.createElement('p'); hint.className = 'theme-hint';
      hint.textContent = 'Your themes sync with Magic Money Wallet through your ChainLens account.';
      menu.append(hint);
    }
  }

  function openEditor(theme) {
    editing = theme;
    confirmDelete = false;
    $('themeDialogTitle').textContent = theme ? (engine.builtinById(theme.id) ? `Recolour ${theme.name}` : 'Edit theme') : 'Create theme';
    $('themeName').value = theme?.name || 'My theme';
    $('themeName').closest('label').hidden = Boolean(theme && engine.builtinById(theme.id));
    for (const key of ['Bg', 'Accent', 'Text']) {
      const value = theme?.colors[key.toLowerCase()] || { Bg: '#0a0f1e', Accent: '#00aaff', Text: '#e8f4ff' }[key];
      $('theme' + key).value = value;
      $('theme' + key + 'Hex').value = value;
    }
    refreshPreview();
    $('themeError').textContent = '';
    $('themeDelete').hidden = !theme || (Boolean(engine.builtinById(theme.id)) && !theme.edited);
    $('themeDelete').textContent = engine.builtinById(theme?.id) ? 'Revert to default' : 'Delete theme';
    $('themeDialog').hidden = false;
    (engine.builtinById(theme?.id) ? $('themeBgHex') : $('themeName')).focus();
  }
  function closeEditor() { $('themeDialog').hidden = true; editing = null; }

  const validHex = value => /^#[0-9a-f]{6}$/i.test(value);
  const editorColors = () => ({ bg: $('themeBgHex').value, accent: $('themeAccentHex').value, text: $('themeTextHex').value });
  function refreshPreview() {
    const colors = editorColors();
    const valid = Object.values(colors).every(validHex);
    $('themeSave').disabled = busy || !valid;
    $('themeContrast').textContent = valid
      ? `Text contrast: ${engine.contrastRatio(engine.parseHex(colors.text), engine.parseHex(colors.bg)).toFixed(1)}:1`
      : 'Enter a six-digit hex colour for each field.';
    if (!valid) return;
    const preview = $('themePreview');
    preview.style.background = colors.bg;
    preview.style.color = colors.text;
    preview.style.borderColor = colors.accent;
    $('themePreviewAccent').style.background = colors.accent;
    $('themePreviewAccent').style.color = colors.bg;
  }
  for (const key of ['Bg', 'Accent', 'Text']) {
    $('theme' + key).addEventListener('input', event => {
      $('theme' + key + 'Hex').value = event.target.value;
      refreshPreview();
    });
    $('theme' + key + 'Hex').addEventListener('input', event => {
      if (validHex(event.target.value)) $('theme' + key).value = event.target.value;
      refreshPreview();
    });
  }

  async function saveTheme(deleting) {
    if (busy || !eligible || !token) return;
    const builtin = Boolean(editing && engine.builtinById(editing.id));
    if (!editing && customs().length >= engine.MAX_SYNCED_THEMES) return;
    const colors = editorColors();
    if (!Object.values(colors).every(validHex)) return;
    const id = builtin ? `custom-builtin-${editing.id}` : editing?.id || `custom-${crypto.randomUUID()}`;
    const previous = entries[id];
    const t = Math.max(Date.now(), (previous?.t || 0) + 1);
    const original = builtin ? engine.builtinById(editing.id) : null;
    const revert = builtin && !deleting && ['bg', 'accent', 'text'].every(key => colors[key].toLowerCase() === original.colors[key]);
    const entry = deleting || revert
      ? { n: '', c: { bg: '', accent: '', text: '' }, t, d: 1 }
      : { n: builtin ? original.name : $('themeName').value.trim().slice(0, 24) || 'Custom', c: colors, t };
    busy = true; $('themeSave').disabled = true; $('themeError').textContent = '';
    try {
      const response = await fetch('/api/profile/themes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entries: { [id]: entry } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.entries) throw new Error(body.error || 'Could not save theme');
      entries = engine.sanitizeEntries(body.entries);
      if (deleting && !builtin && themeId === editing.id) themeId = 'dark';
      else if (!deleting) themeId = builtin ? editing.id : id;
      write('cl_theme', themeId);
      closeEditor(); paint(); renderMenu();
    } catch (error) { $('themeError').textContent = error.message || 'Could not save theme'; }
    finally { busy = false; refreshPreview(); }
  }

  $('themePickerButton').addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    $('themePickerButton').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('mousedown', event => {
    if (!$('themePicker').contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeMenu(); closeEditor(); closeSidebar(); }
  });
  $('themeForm').addEventListener('submit', event => { event.preventDefault(); void saveTheme(false); });
  $('themeCancel').addEventListener('click', closeEditor);
  $('themeDelete').addEventListener('click', () => {
    if (!editing || busy) return;
    if (!engine.builtinById(editing.id) && !confirmDelete) {
      confirmDelete = true; $('themeDelete').textContent = 'Click again to delete'; return;
    }
    void saveTheme(true);
  });
  $('themeDialog').addEventListener('mousedown', event => { if (event.target === $('themeDialog')) closeEditor(); });

  function closeSidebar() {
    $('siteSidebar').classList.remove('open'); $('menuBackdrop').classList.remove('open');
    $('menuButton').setAttribute('aria-expanded', 'false');
  }
  $('menuButton').addEventListener('click', () => {
    const open = $('siteSidebar').classList.toggle('open');
    $('menuBackdrop').classList.toggle('open', open);
    $('menuButton').setAttribute('aria-expanded', String(open));
  });
  $('menuBackdrop').addEventListener('click', closeSidebar);
  $('sidebarClose').addEventListener('click', closeSidebar);

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const target = $(button.dataset.copy);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent);
        const old = button.textContent; button.textContent = 'Copied';
        setTimeout(() => { button.textContent = old; }, 1200);
      } catch { /* Clipboard permissions vary by browser. */ }
    });
  });

  paint(); renderMenu();
  if (token) {
    fetch('/api/profile/themes', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : null)
      .then(body => {
        if (!body) return;
        eligible = Boolean(body.eligible);
        entries = engine.sanitizeEntries(body.entries);
        paint(); renderMenu();
      }).catch(() => {});
  }
  window.addEventListener('storage', event => {
    if (!['cl_theme', 'darkMode', 'cl_token'].includes(event.key)) return;
    if (event.key === 'cl_token') { window.location.reload(); return; }
    themeId = read('cl_theme') || (read('darkMode') === 'true' ? 'dark' : 'light');
    paint(); renderMenu();
  });
}());
