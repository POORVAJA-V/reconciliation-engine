class MongoDatabase {
  constructor({ mongoUri, mongoDbName }) {
    this.mongoUri = mongoUri;
    this.mongoDbName = mongoDbName;
    this.client = null;
    this.db = null;
  }

  async ensureReady() {
    if (this.db) return;
    if (!this.mongoUri) {
      throw new Error('MONGODB_URI is required when DB_PROVIDER=mongo');
    }

    let MongoClient;
    try {
      ({ MongoClient } = require('mongodb'));
    } catch (error) {
      throw new Error('The optional "mongodb" package is not installed. Run npm install before using MongoDB mode.');
    }

    this.client = new MongoClient(this.mongoUri);
    await this.client.connect();
    this.db = this.client.db(this.mongoDbName);
    await Promise.all([
      this.db.collection('runs').createIndex({ runId: 1 }, { unique: true }),
      this.db.collection('transactions').createIndex({ runId: 1, source: 1 }),
      this.db.collection('reports').createIndex({ runId: 1, index: 1 })
    ]);
  }

  async saveRun(run, transactions, reportEntries) {
    await this.ensureReady();
    await this.db.collection('runs').insertOne(run);
    if (transactions.length > 0) await this.db.collection('transactions').insertMany(transactions);
    if (reportEntries.length > 0) {
      await this.db.collection('reports').insertMany(reportEntries.map((entry, index) => ({ ...entry, index })));
    }
    return run;
  }

  async getRun(runId) {
    await this.ensureReady();
    return this.db.collection('runs').findOne({ runId }, { projection: { _id: 0 } });
  }

  async getReport(runId) {
    await this.ensureReady();
    return this.db
      .collection('reports')
      .find({ runId }, { projection: { _id: 0 } })
      .sort({ index: 1 })
      .toArray();
  }

  async close() {
    if (this.client) await this.client.close();
  }
}

module.exports = {
  MongoDatabase
};
