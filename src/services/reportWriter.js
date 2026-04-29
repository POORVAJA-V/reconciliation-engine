const { objectsToCsv } = require('../csv');

const REPORT_HEADERS = [
  'run_id',
  'category',
  'reason',
  'match_method',
  'user_row_number',
  'user_transaction_id',
  'user_timestamp',
  'user_type',
  'user_asset',
  'user_quantity',
  'user_price_usd',
  'user_fee',
  'user_note',
  'exchange_row_number',
  'exchange_transaction_id',
  'exchange_timestamp',
  'exchange_type',
  'exchange_asset',
  'exchange_quantity',
  'exchange_price_usd',
  'exchange_fee',
  'exchange_note',
  'timestamp_diff_seconds',
  'quantity_diff_pct',
  'user_quality_issues',
  'exchange_quality_issues',
  'user_original_row',
  'exchange_original_row'
];

function value(transaction, field) {
  return transaction ? transaction.raw[field] ?? '' : '';
}

function toReportRow(entry, runId) {
  const user = entry.userTransaction;
  const exchange = entry.exchangeTransaction;

  return {
    run_id: runId,
    category: entry.category,
    reason: entry.reason,
    match_method: entry.matchMethod,
    user_row_number: user?.rowNumber ?? '',
    user_transaction_id: value(user, 'transaction_id'),
    user_timestamp: value(user, 'timestamp'),
    user_type: value(user, 'type'),
    user_asset: value(user, 'asset'),
    user_quantity: value(user, 'quantity'),
    user_price_usd: value(user, 'price_usd'),
    user_fee: value(user, 'fee'),
    user_note: value(user, 'note'),
    exchange_row_number: exchange?.rowNumber ?? '',
    exchange_transaction_id: value(exchange, 'transaction_id'),
    exchange_timestamp: value(exchange, 'timestamp'),
    exchange_type: value(exchange, 'type'),
    exchange_asset: value(exchange, 'asset'),
    exchange_quantity: value(exchange, 'quantity'),
    exchange_price_usd: value(exchange, 'price_usd'),
    exchange_fee: value(exchange, 'fee'),
    exchange_note: value(exchange, 'note'),
    timestamp_diff_seconds:
      entry.comparison && Number.isFinite(entry.comparison.timestampDiffSeconds)
        ? entry.comparison.timestampDiffSeconds.toFixed(0)
        : '',
    quantity_diff_pct:
      entry.comparison && Number.isFinite(entry.comparison.quantityDiffPct)
        ? entry.comparison.quantityDiffPct.toFixed(6)
        : '',
    user_quality_issues: user?.qualityIssues.join('; ') ?? '',
    exchange_quality_issues: exchange?.qualityIssues.join('; ') ?? '',
    user_original_row: user ? JSON.stringify(user.raw) : '',
    exchange_original_row: exchange ? JSON.stringify(exchange.raw) : ''
  };
}

function entriesToCsv(entries, runId) {
  return objectsToCsv(
    entries.map((entry) => toReportRow(entry, runId)),
    REPORT_HEADERS
  );
}

module.exports = {
  REPORT_HEADERS,
  entriesToCsv,
  toReportRow
};
