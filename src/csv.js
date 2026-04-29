function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ''));
}

function rowsToObjects(text) {
  const parsedRows = parseCsv(text);
  if (parsedRows.length === 0) return { headers: [], rows: [] };

  const headers = parsedRows[0].map((header, index) => {
    const normalized = header.replace(/^\uFEFF/, '').trim();
    return normalized || `column_${index + 1}`;
  });

  const rows = parsedRows.slice(1).map((cells, index) => {
    const raw = {};
    const issues = [];

    if (cells.length !== headers.length) {
      issues.push(`Column count mismatch: expected ${headers.length}, found ${cells.length}`);
    }

    headers.forEach((header, headerIndex) => {
      raw[header] = cells[headerIndex] ?? '';
    });

    if (cells.length > headers.length) {
      raw.__extraFields = cells.slice(headers.length);
    }

    return {
      rowNumber: index + 2,
      raw,
      csvIssues: issues
    };
  });

  return { headers, rows };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function objectsToCsv(rows, headers) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  });
  return `${lines.join('\n')}\n`;
}

module.exports = {
  csvEscape,
  objectsToCsv,
  parseCsv,
  rowsToObjects
};
