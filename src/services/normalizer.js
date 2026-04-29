const REQUIRED_COLUMNS = ['transaction_id', 'timestamp', 'type', 'asset', 'quantity', 'price_usd', 'fee', 'note'];

const ASSET_ALIASES = new Map(
  Object.entries({
    BITCOIN: 'BTC',
    XBT: 'BTC',
    BTC: 'BTC',
    ETHEREUM: 'ETH',
    ETHER: 'ETH',
    ETH: 'ETH',
    TETHER: 'USDT',
    USDT: 'USDT',
    USD_TETHER: 'USDT',
    SOLANA: 'SOL',
    SOL: 'SOL',
    POLYGON: 'MATIC',
    MATIC: 'MATIC',
    POL: 'MATIC'
  })
);

const TYPE_ALIASES = new Map(
  Object.entries({
    BUY: 'BUY',
    PURCHASE: 'BUY',
    SELL: 'SELL',
    SALE: 'SELL',
    TRANSFER_IN: 'TRANSFER_IN',
    DEPOSIT: 'TRANSFER_IN',
    RECEIVE: 'TRANSFER_IN',
    RECEIVED: 'TRANSFER_IN',
    TRANSFER_OUT: 'TRANSFER_OUT',
    WITHDRAW: 'TRANSFER_OUT',
    WITHDRAWAL: 'TRANSFER_OUT',
    SEND: 'TRANSFER_OUT',
    SENT: 'TRANSFER_OUT'
  })
);

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function parseDecimal(value, fieldName, issues, { required = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) {
    if (required) issues.push(`Missing ${fieldName}`);
    return null;
  }

  const parsed = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(parsed)) {
    issues.push(`Invalid ${fieldName}: "${text}"`);
    return null;
  }

  return parsed;
}

function normalizeAsset(asset, issues) {
  const key = normalizeKey(asset);
  if (!key) {
    issues.push('Missing asset');
    return null;
  }
  return ASSET_ALIASES.get(key) ?? key;
}

function normalizeType(type, issues) {
  const key = normalizeKey(type);
  if (!key) {
    issues.push('Missing type');
    return null;
  }
  const normalized = TYPE_ALIASES.get(key);
  if (!normalized) {
    issues.push(`Unknown type: "${type}"`);
    return key;
  }
  return normalized;
}

function normalizeTransaction(parsedRow, source) {
  const raw = parsedRow.raw;
  const issues = [...parsedRow.csvIssues];

  REQUIRED_COLUMNS.forEach((column) => {
    if (!Object.prototype.hasOwnProperty.call(raw, column)) {
      issues.push(`Missing column: ${column}`);
    }
  });

  const transactionId = String(raw.transaction_id ?? '').trim();
  if (!transactionId) issues.push('Missing transaction_id');

  const timestampText = String(raw.timestamp ?? '').trim();
  const timestampMs = Date.parse(timestampText);
  if (!timestampText) {
    issues.push('Missing timestamp');
  } else if (!Number.isFinite(timestampMs)) {
    issues.push(`Invalid timestamp: "${timestampText}"`);
  }

  const quantity = parseDecimal(raw.quantity, 'quantity', issues, { required: true });
  if (quantity !== null && quantity < 0) {
    issues.push(`Invalid quantity: must be non-negative, found ${quantity}`);
  }
  const priceUsd = parseDecimal(raw.price_usd, 'price_usd', issues);
  const fee = parseDecimal(raw.fee, 'fee', issues);

  return {
    id: `${source}:${parsedRow.rowNumber}:${transactionId || 'missing-id'}`,
    source,
    rowNumber: parsedRow.rowNumber,
    raw,
    transactionId,
    timestampText,
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    type: normalizeType(raw.type, issues),
    asset: normalizeAsset(raw.asset, issues),
    quantity,
    priceUsd,
    fee,
    note: raw.note ?? '',
    qualityIssues: issues,
    validForMatching: issues.length === 0
  };
}

function typeCompatible(userType, exchangeType) {
  if (!userType || !exchangeType) return false;
  if (userType === exchangeType) return true;
  const oppositeTransfer =
    (userType === 'TRANSFER_OUT' && exchangeType === 'TRANSFER_IN') ||
    (userType === 'TRANSFER_IN' && exchangeType === 'TRANSFER_OUT');
  return oppositeTransfer;
}

module.exports = {
  ASSET_ALIASES,
  REQUIRED_COLUMNS,
  TYPE_ALIASES,
  normalizeTransaction,
  typeCompatible
};
