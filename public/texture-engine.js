/* Local surface preference, separate from palette/profile identity. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.chainlensTextures = factory(root);
}(typeof window !== 'undefined' ? window : this, function (win) {
  var textures = [
    { id: 'glass', name: 'Glass' }, { id: 'flat', name: 'Flat' },
    { id: 'grain', name: 'Fine Grain' }, { id: 'fade', name: 'Soft Fade' }
  ];
  var key = 'cl_texture.v1', toneKey = 'cl_surfaces_two_tone.v1', selected = null, twoTone = null, enabled = false;
  function clean(id) { return textures.some(function (t) { return t.id === id; }) ? id : 'glass'; }
  function get() {
    if (selected !== null) return selected;
    try { selected = clean(win.localStorage.getItem(key)); } catch (_) { selected = 'glass'; }
    return selected;
  }
  function suspended() { return win.document.documentElement.hasAttribute('data-cl-art-theme'); }
  function getTwoTone() {
    if (twoTone !== null) return twoTone;
    try { twoTone = win.localStorage.getItem(toneKey) !== '0'; } catch (_) { twoTone = true; }
    return twoTone;
  }
  function setTwoTone(value) {
    twoTone = Boolean(value);
    try { win.localStorage.setItem(toneKey, twoTone ? '1' : '0'); } catch (_) { /* Session fallback. */ }
    apply();
  }
  function apply() {
    var id = get(), html = win.document.documentElement;
    html.setAttribute('data-texture', id);
    var available = enabled && !suspended();
    html.setAttribute('data-surface-tone', getTwoTone() ? 'layered' : 'matching');
    html.toggleAttribute('data-surface-active', available);
    html.toggleAttribute('data-material-active', available && id !== 'glass');
    win.dispatchEvent(new win.Event('cl-texture-change'));
  }
  function set(id) {
    selected = clean(id);
    try { win.localStorage.setItem(key, selected); } catch (_) { /* Session fallback. */ }
    apply();
  }
  win.addEventListener('storage', function (e) {
    if (e.key === key || e.key === toneKey || e.key === null) { selected = null; twoTone = null; apply(); }
  });
  new win.MutationObserver(apply).observe(win.document.documentElement, { attributes: true, attributeFilter: ['data-cl-art-theme'] });
  apply();
  return { textures: textures, get: get, set: set, suspended: suspended,
    getTwoTone: getTwoTone, setTwoTone: setTwoTone,
    enable: function (value) { enabled = Boolean(value); apply(); } };
}));
