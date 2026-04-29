const path = require('node:path');

const DEFAULTS = {
  port: 3000,
  userCsvPath: './data/user_transactions.csv',
  exchangeCsvPath: './data/exchange_transactions.csv',
  timestampToleranceSeconds: 300,
  quantityTolerancePct: 0.01,
  dbProvider: 'file',
  fileDbPath: './db/reconciliation-db.json',
  mongoDbName: 'koinx_reconciliation'
};

function numberFrom(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFromCwd(filePath) {
  if (!filePath) return filePath;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function buildConfig(overrides = {}) {
  const env = process.env;
  const timestampToleranceSeconds = numberFrom(
    overrides.timestampToleranceSeconds ?? overrides.TIMESTAMP_TOLERANCE_SECONDS ?? env.TIMESTAMP_TOLERANCE_SECONDS,
    DEFAULTS.timestampToleranceSeconds
  );
  const quantityTolerancePct = numberFrom(
    overrides.quantityTolerancePct ?? overrides.QUANTITY_TOLERANCE_PCT ?? env.QUANTITY_TOLERANCE_PCT,
    DEFAULTS.quantityTolerancePct
  );

  return {
    port: numberFrom(overrides.port ?? env.PORT, DEFAULTS.port),
    userCsvPath: resolveFromCwd(overrides.userCsvPath ?? overrides.userFile ?? env.USER_CSV_PATH ?? DEFAULTS.userCsvPath),
    exchangeCsvPath: resolveFromCwd(
      overrides.exchangeCsvPath ?? overrides.exchangeFile ?? env.EXCHANGE_CSV_PATH ?? DEFAULTS.exchangeCsvPath
    ),
    timestampToleranceSeconds,
    quantityTolerancePct,
    dbProvider: (overrides.dbProvider ?? env.DB_PROVIDER ?? DEFAULTS.dbProvider).toLowerCase(),
    fileDbPath: resolveFromCwd(overrides.fileDbPath ?? env.FILE_DB_PATH ?? DEFAULTS.fileDbPath),
    mongoUri: overrides.mongoUri ?? env.MONGODB_URI,
    mongoDbName: overrides.mongoDbName ?? env.MONGODB_DB_NAME ?? DEFAULTS.mongoDbName
  };
}

module.exports = {
  DEFAULTS,
  buildConfig
};
