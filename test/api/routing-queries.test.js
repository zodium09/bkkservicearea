const test = require('node:test');
const assert = require('node:assert/strict');
const { getCostColumns, edgeSql } = require('../../backend/db/routing.queries');

test('selects mode-specific time cost columns', () => {
  assert.deepEqual(getCostColumns('walk', 'time'), ['walk_cost_s', 'reverse_walk_cost_s']);
  assert.deepEqual(getCostColumns('bike', 'time'), ['bike_cost_s', 'reverse_bike_cost_s']);
  assert.deepEqual(getCostColumns('drive', 'time'), ['drive_cost_s', 'reverse_drive_cost_s']);
});

test('drive edge SQL includes blocked edge filter and directed reverse cost', () => {
  const sql = edgeSql('drive', 'time');

  assert.match(sql, /drive_cost_s/);
  assert.match(sql, /reverse_drive_cost_s/);
  assert.match(sql, /blocked_edges/);
});
