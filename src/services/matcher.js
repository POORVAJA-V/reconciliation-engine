const { typeCompatible } = require('./normalizer');

const CATEGORY = {
  MATCHED: 'Matched',
  CONFLICTING: 'Conflicting',
  USER_ONLY: 'Unmatched (User only)',
  EXCHANGE_ONLY: 'Unmatched (Exchange only)'
};

function quantityDifferencePct(userQuantity, exchangeQuantity) {
  if (userQuantity === null || exchangeQuantity === null) return Infinity;
  const base = Math.max(Math.abs(userQuantity), Math.abs(exchangeQuantity), Number.EPSILON);
  return (Math.abs(userQuantity - exchangeQuantity) / base) * 100;
}

function comparePair(userTransaction, exchangeTransaction, config) {
  const timestampDiffSeconds =
    userTransaction.timestampMs === null || exchangeTransaction.timestampMs === null
      ? Infinity
      : Math.abs(userTransaction.timestampMs - exchangeTransaction.timestampMs) / 1000;
  const quantityDiffPct = quantityDifferencePct(userTransaction.quantity, exchangeTransaction.quantity);
  const assetMatches = userTransaction.asset !== null && userTransaction.asset === exchangeTransaction.asset;
  const typeMatches = typeCompatible(userTransaction.type, exchangeTransaction.type);
  const timestampWithinTolerance = timestampDiffSeconds <= config.timestampToleranceSeconds;
  const quantityWithinTolerance = quantityDiffPct <= config.quantityTolerancePct;

  return {
    timestampDiffSeconds,
    quantityDiffPct,
    assetMatches,
    typeMatches,
    timestampWithinTolerance,
    quantityWithinTolerance,
    isMatched: assetMatches && typeMatches && timestampWithinTolerance && quantityWithinTolerance
  };
}

function conflictReason(comparison) {
  const reasons = [];
  if (!comparison.assetMatches) reasons.push('asset differs');
  if (!comparison.typeMatches) reasons.push('type differs');
  if (!comparison.timestampWithinTolerance) {
    reasons.push(`timestamp differs by ${comparison.timestampDiffSeconds.toFixed(0)}s`);
  }
  if (!comparison.quantityWithinTolerance) {
    reasons.push(`quantity differs by ${comparison.quantityDiffPct.toFixed(6)}%`);
  }
  return reasons.join('; ');
}

function makePairEntry(userTransaction, exchangeTransaction, config, matchMethod) {
  const comparison = comparePair(userTransaction, exchangeTransaction, config);
  if (comparison.isMatched) {
    return {
      category: CATEGORY.MATCHED,
      reason: `${matchMethod} match within configured tolerances`,
      matchMethod,
      userTransaction,
      exchangeTransaction,
      comparison
    };
  }

  return {
    category: CATEGORY.CONFLICTING,
    reason: `${matchMethod} match but ${conflictReason(comparison)}`,
    matchMethod,
    userTransaction,
    exchangeTransaction,
    comparison
  };
}

function makeUnmatchedEntry(transaction, category, reason) {
  return {
    category,
    reason,
    matchMethod: 'none',
    userTransaction: category === CATEGORY.USER_ONLY ? transaction : null,
    exchangeTransaction: category === CATEGORY.EXCHANGE_ONLY ? transaction : null,
    comparison: null
  };
}

function findBestCandidate(userTransaction, exchangeTransactions, config, mode) {
  let best = null;

  exchangeTransactions.forEach((exchangeTransaction) => {
    if (!userTransaction.asset || userTransaction.asset !== exchangeTransaction.asset) return;
    if (!typeCompatible(userTransaction.type, exchangeTransaction.type)) return;

    const comparison = comparePair(userTransaction, exchangeTransaction, config);
    const conflictWindowSeconds = Math.max(config.timestampToleranceSeconds * 3, config.timestampToleranceSeconds + 600);
    const conflictQuantityPct = Math.max(config.quantityTolerancePct * 10, config.quantityTolerancePct + 0.1);

    const eligible =
      mode === 'match'
        ? comparison.timestampWithinTolerance && comparison.quantityWithinTolerance
        : comparison.timestampDiffSeconds <= conflictWindowSeconds || comparison.quantityDiffPct <= conflictQuantityPct;

    if (!eligible) return;

    const score = comparison.timestampDiffSeconds + comparison.quantityDiffPct * 1000;
    if (!best || score < best.score) {
      best = {
        exchangeTransaction,
        comparison,
        score
      };
    }
  });

  return best;
}

function summarize(entries) {
  return entries.reduce(
    (summary, entry) => {
      if (entry.category === CATEGORY.MATCHED) summary.matched += 1;
      if (entry.category === CATEGORY.CONFLICTING) summary.conflicting += 1;
      if (entry.category === CATEGORY.USER_ONLY) summary.unmatchedUserOnly += 1;
      if (entry.category === CATEGORY.EXCHANGE_ONLY) summary.unmatchedExchangeOnly += 1;
      return summary;
    },
    {
      matched: 0,
      conflicting: 0,
      unmatchedUserOnly: 0,
      unmatchedExchangeOnly: 0
    }
  );
}

function reconcileTransactions(userTransactions, exchangeTransactions, config) {
  const entries = [];
  const unmatchedUser = new Map();
  const unmatchedExchange = new Map();

  userTransactions.forEach((transaction) => {
    if (transaction.validForMatching) {
      unmatchedUser.set(transaction.id, transaction);
    } else {
      entries.push(
        makeUnmatchedEntry(transaction, CATEGORY.USER_ONLY, `Data quality issue: ${transaction.qualityIssues.join('; ')}`)
      );
    }
  });

  exchangeTransactions.forEach((transaction) => {
    if (transaction.validForMatching) {
      unmatchedExchange.set(transaction.id, transaction);
    } else {
      entries.push(
        makeUnmatchedEntry(
          transaction,
          CATEGORY.EXCHANGE_ONLY,
          `Data quality issue: ${transaction.qualityIssues.join('; ')}`
        )
      );
    }
  });

  const exchangeByTransactionId = new Map();
  unmatchedExchange.forEach((transaction) => {
    if (!transaction.transactionId) return;
    const key = transaction.transactionId.toLowerCase();
    if (!exchangeByTransactionId.has(key)) exchangeByTransactionId.set(key, []);
    exchangeByTransactionId.get(key).push(transaction);
  });

  unmatchedUser.forEach((userTransaction) => {
    if (!userTransaction.transactionId) return;
    const candidates = exchangeByTransactionId.get(userTransaction.transactionId.toLowerCase()) ?? [];
    const exchangeTransaction = candidates.find((candidate) => unmatchedExchange.has(candidate.id));
    if (!exchangeTransaction) return;

    entries.push(makePairEntry(userTransaction, exchangeTransaction, config, 'transaction_id'));
    unmatchedUser.delete(userTransaction.id);
    unmatchedExchange.delete(exchangeTransaction.id);
  });

  for (const userTransaction of Array.from(unmatchedUser.values())) {
    const candidate = findBestCandidate(userTransaction, Array.from(unmatchedExchange.values()), config, 'match');
    if (!candidate) continue;

    entries.push(makePairEntry(userTransaction, candidate.exchangeTransaction, config, 'proximity'));
    unmatchedUser.delete(userTransaction.id);
    unmatchedExchange.delete(candidate.exchangeTransaction.id);
  }

  for (const userTransaction of Array.from(unmatchedUser.values())) {
    const candidate = findBestCandidate(userTransaction, Array.from(unmatchedExchange.values()), config, 'conflict');
    if (!candidate) continue;

    entries.push(makePairEntry(userTransaction, candidate.exchangeTransaction, config, 'proximity'));
    unmatchedUser.delete(userTransaction.id);
    unmatchedExchange.delete(candidate.exchangeTransaction.id);
  }

  unmatchedUser.forEach((transaction) => {
    entries.push(makeUnmatchedEntry(transaction, CATEGORY.USER_ONLY, 'No exchange transaction found within match rules'));
  });

  unmatchedExchange.forEach((transaction) => {
    entries.push(
      makeUnmatchedEntry(transaction, CATEGORY.EXCHANGE_ONLY, 'No user transaction found within match rules')
    );
  });

  return {
    entries,
    summary: summarize(entries)
  };
}

module.exports = {
  CATEGORY,
  comparePair,
  quantityDifferencePct,
  reconcileTransactions,
  summarize
};
