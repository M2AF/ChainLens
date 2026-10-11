const test = require('node:test');
const assert = require('node:assert/strict');
const create = require('../public/texture-engine');

test('material eligibility, art suspension, persistence and external changes are independent of palettes', () => {
  const values = new Map(), attributes = new Map(), listeners = new Map();
  let observe;
  const win = {
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
    document: { documentElement: {
      setAttribute: (k, v) => attributes.set(k, v), hasAttribute: k => attributes.has(k),
      toggleAttribute: (k, yes) => yes ? attributes.set(k, '') : attributes.delete(k)
    } },
    addEventListener: (k, cb) => listeners.set(k, cb), dispatchEvent() {}, Event: class {},
    MutationObserver: class { constructor(cb) { observe = cb; } observe() {} }
  };
  const materials = create(win);
  assert.equal(materials.get(), 'glass');
  assert.equal(materials.getTwoTone(), true);
  materials.set('grain');
  assert.equal(attributes.has('data-material-active'), false);
  materials.enable(true);
  materials.setTwoTone(false);
  assert.equal(attributes.get('data-surface-tone'), 'matching');
  assert.equal(attributes.has('data-surface-active'), true);
  assert.equal(attributes.has('data-material-active'), true);
  attributes.set('data-cl-art-theme', 'sealuminati'); observe();
  assert.equal(attributes.has('data-surface-active'), false);
  assert.equal(attributes.has('data-material-active'), false);
  attributes.delete('data-cl-art-theme'); observe();
  assert.equal(attributes.has('data-material-active'), true);
  assert.equal(materials.get(), 'grain');
  values.set('cl_texture.v1', 'fade'); listeners.get('storage')({ key: 'cl_texture.v1' });
  assert.equal(materials.get(), 'fade');
  values.set('cl_texture.v1', 'unknown'); listeners.get('storage')({ key: 'cl_texture.v1' });
  assert.equal(materials.get(), 'glass');
  assert.equal(attributes.has('data-material-active'), false);
  values.set('cl_surfaces_two_tone.v1', '1'); listeners.get('storage')({ key: 'cl_surfaces_two_tone.v1' });
  assert.equal(attributes.get('data-surface-tone'), 'layered');
  values.set('cl_surfaces_two_tone.v1', 'bad'); listeners.get('storage')({ key: 'cl_surfaces_two_tone.v1' });
  assert.equal(materials.getTwoTone(), true);
  materials.set('flat'); materials.enable(false);
  assert.equal(attributes.has('data-surface-active'), false);
  assert.equal(attributes.has('data-material-active'), false);
  assert.equal(materials.get(), 'flat');
});
