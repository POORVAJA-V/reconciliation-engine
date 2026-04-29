const test = require('node:test');
const assert = require('node:assert/strict');

const { reconcileTransactions } = require('../src/services/matcher');
const { normalizeTransaction } = require('../src/services/normalizer');

const config = {
  timestampToleranceSeconds: 300,
  quantityTolerancePct: 0.01
};

function transaction(row, source, rowNumber = 2) {
  return normalizeTransaction(
    {
      rowNumber,
      raw: {
        transaction_id: row.transaction_id,
        timestamp: row.timestamp,
        type: row.type,
        asset: row.asset,
        quantity: row.quantity,
        price_usd: row.price_usd ?? '',
        fee: row.fee ?? '',
        note: row.note ?? ''
      },
      csvIssues: []
    },
    source
  );
}

test('matches asset aliases and opposite transfer directions', () => {
  const user = [
    transaction(
      {
        transaction_id: 'U1',
        timestamp: '2024-03-01T10:00:00Z',
        type: 'TRANSFER_OUT',
        asset: 'bitcoin',
        quantity: '0.5'
      },
      'user'
    )
  ];
  const exchange = [
    transaction(
      {
        transaction_id: 'E1',
        timestamp: '2024-03-01T10:02:00Z',
        type: 'TRANSFER_IN',
        asset: 'BTC',
        quantity: '0.5'
      },
      'exchange'
    )
  ];

  const result = reconcileTransactions(user, exchange, config);

  assert.equal(result.summary.matched, 1);
  assert.equal(result.entries[0].category, 'Matched');
});

test('classifies nearby quantity drift beyond tolerance as conflicting', () => {
  const user = [
    transaction(
      {
        transaction_id: 'U1',
        timestamp: '2024-03-01T10:00:00Z',
        type: 'BUY',
        asset: 'BTC',
        quantity: '0.3'
      },
      'user'
    )
  ];
  const exchange = [
    transaction(
      {
        transaction_id: 'E1',
        timestamp: '2024-03-01T10:00:00Z',
        type: 'BUY',
        asset: 'BTC',
        quantity: '0.3001'
      },
      'exchange'
    )
  ];

  const result = reconcileTransactions(user, exchange, config);

  assert.equal(result.summary.conflicting, 1);
  assert.match(result.entries[0].reason, /quantity differs/);
});

test('keeps invalid rows visible as unmatched data quality issues', () => {
  const user = [
    transaction(
      {
        transaction_id: 'U1',
        timestamp: 'not-a-date',
        type: 'BUY',
        asset: 'BTC',
        quantity: '0.3'
      },
      'user'
    )
  ];
  const exchange = [];

  const result = reconcileTransactions(user, exchange, config);

  assert.equal(result.summary.unmatchedUserOnly, 1);
  assert.match(result.entries[0].reason, /Data quality issue/);
});
