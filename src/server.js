const http = require('node:http');
const { URL } = require('node:url');

const { buildConfig } = require('./config');
const { loadEnv } = require('./env');
const { objectsToCsv } = require('./csv');
const { REPORT_HEADERS } = require('./services/reportWriter');
const { getStoredReport, runReconciliation } = require('./services/reconciliationService');

loadEnv();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload, null, 2));
}

function sendCsv(response, statusCode, filename, rows) {
  response.writeHead(statusCode, {
    'content-type': 'text/csv',
    'content-disposition': `attachment; filename="${filename}"`
  });
  response.end(objectsToCsv(rows, REPORT_HEADERS));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function wantsCsv(requestUrl, request) {
  return requestUrl.searchParams.get('format') === 'csv' || String(request.headers.accept ?? '').includes('text/csv');
}

async function handleReportRequest(request, response, requestUrl, runId, suffix) {
  const { run, report } = await getStoredReport(runId);
  if (!run) {
    sendJson(response, 404, { error: `Run not found: ${runId}` });
    return;
  }

  if (suffix === '/summary') {
    sendJson(response, 200, { runId, summary: run.summary });
    return;
  }

  if (suffix === '/unmatched') {
    const unmatched = report.filter((row) => row.category.startsWith('Unmatched'));
    if (wantsCsv(requestUrl, request)) {
      sendCsv(response, 200, `unmatched-${runId}.csv`, unmatched);
      return;
    }
    sendJson(response, 200, { runId, count: unmatched.length, rows: unmatched });
    return;
  }

  if (wantsCsv(requestUrl, request)) {
    sendCsv(response, 200, `reconciliation-${runId}.csv`, report);
    return;
  }

  sendJson(response, 200, { run, rows: report });
}

async function route(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/reconcile') {
    const body = await readJsonBody(request);
    const result = await runReconciliation(body);
    sendJson(response, 201, {
      runId: result.run.runId,
      status: result.run.status,
      summary: result.run.summary,
      csvReportPath: result.run.csvReportPath,
      dataQualityLogPath: result.run.dataQualityLogPath
    });
    return;
  }

  const reportMatch = requestUrl.pathname.match(/^\/report\/([^/]+)(\/summary|\/unmatched)?$/);
  if (request.method === 'GET' && reportMatch) {
    await handleReportRequest(request, response, requestUrl, reportMatch[1], reportMatch[2] ?? '');
    return;
  }

  sendJson(response, 404, {
    error: 'Not found',
    endpoints: ['POST /reconcile', 'GET /report/:runId', 'GET /report/:runId/summary', 'GET /report/:runId/unmatched']
  });
}

function startServer() {
  const config = buildConfig();
  const server = http.createServer((request, response) => {
    route(request, response).catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
  });

  server.listen(config.port, () => {
    console.log(`Reconciliation API listening on http://localhost:${config.port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};
