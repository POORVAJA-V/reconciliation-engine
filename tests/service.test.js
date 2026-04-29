const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { runReconciliation } = require('../src/services/reconciliationService');

test('runs reconciliation end to end and persists report rows', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'koinx-reconcile-'));
  const userCsvPath = path.join(tempDir, 'user.csv');
  const exchangeCsvPath = path.join(tempDir, 'exchange.csv');
  const fileDbPath = path.join(tempDir, 'db.json');

  await fs.writeFile(
    userCsvPath,
    [
      'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note',
      'U1,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000,0.0005,',
      'U2,2024-03-01T10:00:00Z,BUY,BTC,-1,62000,0.0005,bad quantity'
    ].join('\n')
  );
  await fs.writeFile(
    exchangeCsvPath,
    [
      'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note',
      'E1,2024-03-01T09:00:20Z,BUY,Bitcoin,0.5,62000,0.0005,',
      'E2,2024-03-02T09:00:00Z,SELL,ETH,1,3500,0.001,'
    ].join('\n')
  );

  const { run, report } = await runReconciliation({
    userCsvPath,
    exchangeCsvPath,
    fileDbPath
  });

  assert.equal(run.summary.matched, 1);
  assert.equal(run.summary.unmatchedUserOnly, 1);
  assert.equal(run.summary.unmatchedExchangeOnly, 1);
  assert.equal(report.length, 3);

  const dbText = await fs.readFile(fileDbPath, 'utf8');
  const db = JSON.parse(dbText);
  assert.equal(db.runs[0].runId, run.runId);
  assert.equal(db.reports.length, 3);
});
