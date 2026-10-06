const { test } = require('node:test');
const assert = require('node:assert/strict');
const floor = require('../public/nft-floor');
test('USD floors outrank low, zero and unavailable values without using token spot values', () => {
  const assets = [{name:'unknown',totalValue:999999}, {name:'zero',floorPriceUsd:0}, {name:'low',floorPriceUsd:'0.5'}, {name:'high',floorPriceUsd:1000}, {name:'invalid',floorPriceUsd:Infinity}];
  assert.deepEqual(assets.sort(floor.compare).map(a=>a.name),['high','low','zero','unknown','invalid']);
  for (const value of [null,undefined,'',' ',false,{},-1,NaN]) assert.equal(floor.amount(value),null);
  assert.equal(floor.label({floorPriceUsd:1000}),'Floor $1,000.00');
  assert.equal(floor.label({totalValue:999}),'Floor unavailable');
});
