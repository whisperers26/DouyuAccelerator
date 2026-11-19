const test = require('node:test');
const assert = require('node:assert/strict');
const { readConfig, DEFAULTS } = require('../douyu-accelerator.user.js');

test('uses the defaults when nothing is stored', () => {
  assert.deepEqual(readConfig(null), DEFAULTS);
  assert.deepEqual(readConfig(''), DEFAULTS);
});

test('ignores stored text that is not JSON', () => {
  assert.deepEqual(readConfig('{oops'), DEFAULTS);
  assert.deepEqual(readConfig('[1,2]'), DEFAULTS);
});

test('takes valid overrides and clamps them', () => {
  assert.deepEqual(readConfig('{"aheadSec":120,"concurrency":4}'), { ...DEFAULTS, aheadSec: 120, concurrency: 4 });
  assert.equal(readConfig('{"concurrency":100}').concurrency, 16);
  assert.equal(readConfig('{"concurrency":0}').concurrency, 1);
  assert.equal(readConfig('{"aheadSec":1}').aheadSec, 10);
  assert.equal(readConfig('{"aheadSec":"lots"}').aheadSec, DEFAULTS.aheadSec);
});

test('can be switched off', () => {
  assert.equal(readConfig('{"enabled":false}').enabled, false);
  assert.equal(readConfig('{"enabled":"no"}').enabled, true);
});
