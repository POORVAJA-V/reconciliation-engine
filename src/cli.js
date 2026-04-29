const { loadEnv } = require('./env');
const { runReconciliation } = require('./services/reconciliationService');

loadEnv();

function parseArgs(argv) {
  const overrides = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--user') {
      overrides.userCsvPath = next;
      index += 1;
    } else if (arg === '--exchange') {
      overrides.exchangeCsvPath = next;
      index += 1;
    } else if (arg === '--timestamp-tolerance-seconds') {
      overrides.timestampToleranceSeconds = Number(next);
      index += 1;
    } else if (arg === '--quantity-tolerance-pct') {
      overrides.quantityTolerancePct = Number(next);
      index += 1;
    }
  }
  return overrides;
}

runReconciliation(parseArgs(process.argv.slice(2)))
  .then(({ run }) => {
    console.log(JSON.stringify(run, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
