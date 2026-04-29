const fs = require('node:fs/promises');
const path = require('node:path');

class FileDatabase {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async ensureReady() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({ runs: [], transactions: [], reports: [] }, null, 2));
    }
  }

  async read() {
    await this.ensureReady();
    const text = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(text);
  }

  async write(data) {
    await this.ensureReady();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async saveRun(run, transactions, reportEntries) {
    const data = await this.read();
    data.runs.push(run);
    data.transactions.push(...transactions);
    data.reports.push(...reportEntries.map((entry, index) => ({ ...entry, index })));
    await this.write(data);
    return run;
  }

  async getRun(runId) {
    const data = await this.read();
    return data.runs.find((run) => run.runId === runId) ?? null;
  }

  async getReport(runId) {
    const data = await this.read();
    return data.reports.filter((entry) => entry.runId === runId).sort((a, b) => a.index - b.index);
  }
}

module.exports = {
  FileDatabase
};
