const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { rowsToObjects } = require('../csv');
const { createDatabase } = require('../db');
const { buildConfig } = require('../config');
const { normalizeTransaction } = require('./normalizer');
const { reconcileTransactions } = require('./matcher');
const { entriesToCsv, toReportRow } = require('./reportWriter');

async function readTransactions(filePath, source) {
  const text = await fs.readFile(filePath, 'utf8');
  const parsed = rowsToObjects(text);
  const transactions = parsed.rows.map((row) => normalizeTransaction(row, source));
  const transactionIds = new Map();

  transactions.forEach((transaction) => {
    if (!transaction.transactionId) return;
    const key = transaction.transactionId.toLowerCase();
    if (!transactionIds.has(key)) transactionIds.set(key, []);
    transactionIds.get(key).push(transaction);
  });

  transactionIds.forEach((duplicates) => {
    if (duplicates.length < 2) return;
    duplicates.slice(1).forEach((transaction) => {
      transaction.qualityIssues.push(`Duplicate transaction_id in ${source} file: ${transaction.transactionId}`);
      transaction.validForMatching = false;
    });
  });

  transactions.forEach((transaction) => {
    transaction.validForMatching = transaction.qualityIssues.length === 0;
  });

  return transactions;
}

async function writeDataQualityLog(runId, transactions) {
  const badRows = transactions.filter((transaction) => transaction.qualityIssues.length > 0);
  if (badRows.length === 0) return null;

  await fs.mkdir(path.resolve(process.cwd(), 'logs'), { recursive: true });
  const logPath = path.resolve(process.cwd(), 'logs', `data-quality-${runId}.log`);
  const lines = badRows.map((transaction) =>
    [
      `source=${transaction.source}`,
      `row=${transaction.rowNumber}`,
      `transaction_id=${transaction.transactionId || '<missing>'}`,
      `issues=${transaction.qualityIssues.join('; ')}`
    ].join(' ')
  );
  await fs.writeFile(logPath, `${lines.join('\n')}\n`);
  return logPath;
}

async function writeCsvReport(runId, entries) {
  await fs.mkdir(path.resolve(process.cwd(), 'reports'), { recursive: true });
  const reportPath = path.resolve(process.cwd(), 'reports', `reconciliation-${runId}.csv`);
  await fs.writeFile(reportPath, entriesToCsv(entries, runId));
  return reportPath;
}

async function runReconciliation(overrides = {}) {
  const config = buildConfig(overrides);
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  const [userTransactions, exchangeTransactions] = await Promise.all([
    readTransactions(config.userCsvPath, 'user'),
    readTransactions(config.exchangeCsvPath, 'exchange')
  ]);

  const allTransactions = [...userTransactions, ...exchangeTransactions].map((transaction) => ({
    ...transaction,
    runId
  }));

  const reconciliation = reconcileTransactions(userTransactions, exchangeTransactions, config);
  const completedAt = new Date().toISOString();
  const dataQualityLogPath = await writeDataQualityLog(runId, allTransactions);
  const csvReportPath = await writeCsvReport(runId, reconciliation.entries);
  const reportRows = reconciliation.entries.map((entry) => toReportRow(entry, runId));

  const run = {
    runId,
    startedAt,
    completedAt,
    status: 'completed',
    config: {
      userCsvPath: config.userCsvPath,
      exchangeCsvPath: config.exchangeCsvPath,
      timestampToleranceSeconds: config.timestampToleranceSeconds,
      quantityTolerancePct: config.quantityTolerancePct,
      dbProvider: config.dbProvider
    },
    summary: reconciliation.summary,
    dataQualityIssueCount: allTransactions.filter((transaction) => transaction.qualityIssues.length > 0).length,
    dataQualityLogPath,
    csvReportPath
  };

  const database = createDatabase(config);
  await database.saveRun(run, allTransactions, reportRows.map((row) => ({ ...row, runId })));
  if (typeof database.close === 'function') await database.close();

  return {
    run,
    report: reportRows
  };
}

async function getStoredRun(runId, overrides = {}) {
  const config = buildConfig(overrides);
  const database = createDatabase(config);
  const run = await database.getRun(runId);
  if (typeof database.close === 'function') await database.close();
  return run;
}

async function getStoredReport(runId, overrides = {}) {
  const config = buildConfig(overrides);
  const database = createDatabase(config);
  const run = await database.getRun(runId);
  const report = (await database.getReport(runId)).map(({ index, runId: storedRunId, ...row }) => row);
  if (typeof database.close === 'function') await database.close();
  return { run, report };
}

module.exports = {
  getStoredReport,
  getStoredRun,
  readTransactions,
  runReconciliation
};
