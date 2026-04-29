const test = require('node:test');
const assert = require('node:assert/strict');

const { objectsToCsv, rowsToObjects } = require('../src/csv');

test('parses quoted CSV fields and flags column mismatches', () => {
  const csv = 'transaction_id,note\nA-1,"hello, ""world"""\nA-2,ok,extra\n';
  const parsed = rowsToObjects(csv);

  assert.equal(parsed.rows[0].raw.note, 'hello, "world"');
  assert.deepEqual(parsed.rows[1].csvIssues, ['Column count mismatch: expected 2, found 3']);
});

test('stringifies CSV with escaping', () => {
  const csv = objectsToCsv([{ id: '1', note: 'hello, "world"' }], ['id', 'note']);
  assert.equal(csv, 'id,note\n1,"hello, ""world"""\n');
});
