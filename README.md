# KoinX Transaction Reconciliation Engine

This is my backend take-home submission for the KoinX reconciliation assignment. The project ingests two messy crypto transaction CSV exports, stores the parsed records, reconciles transactions from both sources, and produces a structured report with matched, conflicting, and unmatched rows.

I built it with plain Node.js so the project is easy to review and run without a heavy framework setup. The persistence layer defaults to a local file database for convenience, and it also includes a MongoDB adapter for a production-style deployment path.

## What This Project Does

- Parses user and exchange CSV exports.
- Stores every parsed transaction, including rows with data quality issues.
- Flags bad rows with clear reasons instead of silently dropping them.
- Matches transactions using configurable timestamp and quantity tolerances.
- Handles asset aliases such as `BTC`, `Bitcoin`, and `XBT`.
- Handles opposite transfer perspectives such as user `TRANSFER_OUT` and exchange `TRANSFER_IN`.
- Produces a reconciliation report in CSV format.
- Exposes REST APIs to trigger reconciliation and fetch reports.
- Includes focused tests for CSV parsing, matching logic, and end-to-end reconciliation.

## Tech Stack

- Node.js
- Built-in `http` server
- Built-in `node:test` test runner
- File-based database by default
- Optional MongoDB support

I intentionally kept the dependency footprint small. For a take-home assignment, this makes the review experience smoother while still keeping the design modular enough to swap the storage layer.

## Project Structure

```text
.
|-- data/
|   |-- user_transactions.csv
|   `-- exchange_transactions.csv
|-- src/
|   |-- db/
|   |   |-- fileDatabase.js
|   |   |-- mongoDatabase.js
|   |   `-- index.js
|   |-- services/
|   |   |-- matcher.js
|   |   |-- normalizer.js
|   |   |-- reconciliationService.js
|   |   `-- reportWriter.js
|   |-- cli.js
|   |-- config.js
|   |-- csv.js
|   |-- env.js
|   `-- server.js
|-- tests/
|-- reports/
|-- logs/
|-- .env.example
|-- package.json
`-- README.md
```

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local `.env` file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Start the API server:

```bash
npm start
```

## Deployment

The project is ready to deploy on any Node.js hosting provider that supports `npm install` and `npm start`.

### Render Deployment

1. Push this repository to GitHub.
2. Open Render and create a new `Web Service`.
3. Connect your GitHub repository.
4. Use these settings:

```text
Environment: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /health
```

5. Add these environment variables if they are not auto-detected from `render.yaml`:

```text
USER_CSV_PATH=./data/user_transactions.csv
EXCHANGE_CSV_PATH=./data/exchange_transactions.csv
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.01
DB_PROVIDER=file
FILE_DB_PATH=./db/reconciliation-db.json
```

After deployment, verify the live API:

```bash
curl https://your-service-url.onrender.com/health
```

Run reconciliation on the deployed API:

```bash
curl -X POST https://your-service-url.onrender.com/reconcile \
  -H "Content-Type: application/json" \
  -d "{}"
```

This repository also includes a `Dockerfile`, so it can be deployed on Docker-based platforms if needed.

By default, the server runs on:

```text
http://localhost:3000
```

If port `3000` is already busy, run it on another port:

```powershell
$env:PORT=3001
npm start
```

## Run Reconciliation

There are two ways to run reconciliation.

### Option 1: API

Start the server first:

```bash
npm start
```

Then trigger a reconciliation run:

```bash
curl -X POST http://localhost:3000/reconcile \
  -H "Content-Type: application/json" \
  -d "{}"
```

PowerShell version:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/reconcile `
  -ContentType "application/json" `
  -Body "{}"
```

The response includes a `runId`, summary counts, and the generated CSV report path.

### Option 2: CLI

```bash
npm run reconcile
```

This runs reconciliation directly using the configured CSV paths.

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check endpoint. |
| `POST` | `/reconcile` | Triggers a reconciliation run. |
| `GET` | `/report/:runId` | Fetches the full reconciliation report. |
| `GET` | `/report/:runId/summary` | Fetches only summary counts. |
| `GET` | `/report/:runId/unmatched` | Fetches only unmatched rows with reasons. |

Full report as CSV:

```bash
curl "http://localhost:3000/report/<runId>?format=csv"
```

Unmatched rows as CSV:

```bash
curl "http://localhost:3000/report/<runId>/unmatched?format=csv"
```

## Example API Flow

Trigger reconciliation:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/reconcile `
  -ContentType "application/json" `
  -Body "{}"
```

Fetch summary:

```powershell
Invoke-RestMethod http://localhost:3000/report/<runId>/summary
```

Fetch unmatched rows:

```powershell
Invoke-RestMethod http://localhost:3000/report/<runId>/unmatched
```

Generated CSV reports are written to:

```text
reports/reconciliation-<runId>.csv
```

Data quality logs are written to:

```text
logs/data-quality-<runId>.log
```

## Configuration

Configuration can be provided through environment variables or request body overrides on `/reconcile`.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | API server port. |
| `USER_CSV_PATH` | `./data/user_transactions.csv` | Path to the user CSV file. |
| `EXCHANGE_CSV_PATH` | `./data/exchange_transactions.csv` | Path to the exchange CSV file. |
| `TIMESTAMP_TOLERANCE_SECONDS` | `300` | Allowed timestamp difference in seconds. |
| `QUANTITY_TOLERANCE_PCT` | `0.01` | Allowed quantity difference percentage. |
| `DB_PROVIDER` | `file` | Storage provider. Supports `file` and `mongo`. |
| `FILE_DB_PATH` | `./db/reconciliation-db.json` | Local file database path. |
| `MONGODB_URI` | unset | MongoDB connection string when using MongoDB mode. |
| `MONGODB_DB_NAME` | `koinx_reconciliation` | MongoDB database name. |

Example `/reconcile` body with custom tolerances:

```json
{
  "timestampToleranceSeconds": 600,
  "quantityTolerancePct": 0.05
}
```

Example with custom file paths:

```json
{
  "userCsvPath": "./data/user_transactions.csv",
  "exchangeCsvPath": "./data/exchange_transactions.csv",
  "timestampToleranceSeconds": 300,
  "quantityTolerancePct": 0.01
}
```

## Matching Logic

The reconciliation engine uses a deterministic one-to-one matching approach.

1. Parse and normalize both CSV files.
2. Validate rows and flag data quality issues.
3. Attempt exact `transaction_id` matches first.
4. Attempt proximity matches using asset, type, timestamp, and quantity.
5. Classify near matches that exceed tolerance as `Conflicting`.
6. Mark remaining records as `Unmatched (User only)` or `Unmatched (Exchange only)`.

### Matching Criteria

- Asset must match after normalization.
- Type must match, except supported transfer perspective mappings.
- Timestamp must be within the configured tolerance.
- Quantity must be within the configured tolerance.

Supported transfer perspective mapping:

```text
User TRANSFER_OUT <-> Exchange TRANSFER_IN
User TRANSFER_IN  <-> Exchange TRANSFER_OUT
```

## Report Categories

| Category | Meaning |
| --- | --- |
| `Matched` | A user transaction and exchange transaction matched within tolerance. |
| `Conflicting` | A likely pair was found, but timestamp or quantity differs beyond tolerance. |
| `Unmatched (User only)` | The transaction exists only in the user file, or the user row has data quality issues. |
| `Unmatched (Exchange only)` | The transaction exists only in the exchange file, or the exchange row has data quality issues. |

Each report row includes the original fields from both sides where available, the category, match method, timestamp difference, quantity difference, and reason.

## Data Quality Handling

The input files are intentionally messy, so ingestion is defensive. The engine flags:

- Missing required columns.
- Incorrect CSV column counts.
- Missing transaction IDs.
- Invalid timestamps.
- Missing or unknown transaction types.
- Missing assets.
- Invalid or negative quantities.
- Duplicate transaction IDs within the same file.

Bad rows are still persisted and included in the report. I made this choice because reconciliation systems should preserve evidence. Dropping bad records can hide the exact issue a user or support team needs to fix.

## Database Design

The storage layer is split behind a small repository-style interface.

### `runs`

Stores run metadata:

- `runId`
- start and completion timestamps
- config used for the run
- summary counts
- report path
- data quality log path

### `transactions`

Stores normalized transaction records:

- source: `user` or `exchange`
- row number
- original raw row
- normalized asset and type
- parsed numeric fields
- quality issues

### `reports`

Stores flattened report rows so API reads do not need to recompute reconciliation.

## MongoDB Mode

The project works out of the box with file storage. To use MongoDB instead:

```bash
npm install
```

Set these values in `.env`:

```text
DB_PROVIDER=mongo
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=koinx_reconciliation
```

Then start the server:

```bash
npm start
```

The MongoDB dependency is listed as optional so the project remains easy to run even without a local database.

## Tests

Run:

```bash
npm test
```

The tests cover:

- CSV parsing and escaping.
- Asset alias matching.
- Opposite transfer direction matching.
- Conflict classification when quantity is outside tolerance.
- End-to-end reconciliation with persisted report rows.

## Sample Output On Provided CSVs

With default tolerances:

```json
{
  "matched": 21,
  "conflicting": 1,
  "unmatchedUserOnly": 4,
  "unmatchedExchangeOnly": 3
}
```

One clear conflicting case is a BTC buy where the user file has quantity `0.3` and the exchange file has `0.3001`. That exceeds the default `0.01%` quantity tolerance, so the engine classifies it as `Conflicting` instead of forcing a clean match.

## Key Decisions And Assumptions

- Fees and prices are preserved in the report but are not used as primary matching keys because the assignment specifically calls out timestamp, quantity, type, and asset.
- Duplicate transaction IDs are treated carefully: the first occurrence remains eligible, while later duplicates are flagged as data quality issues.
- File storage is the default to keep local setup simple for reviewers. MongoDB support is included for the database-backed requirement and can be enabled through configuration.
- Report rows are flattened intentionally. This makes CSV export and API responses easier to inspect.
- The matching algorithm is deterministic. Given the same inputs and tolerances, it will produce the same report.

## Final Notes

This project is designed to be practical rather than over-engineered. The core reconciliation logic is isolated from HTTP and storage code, so the matching engine can be tested independently and extended later with more advanced rules, scoring, or manual review workflows.
