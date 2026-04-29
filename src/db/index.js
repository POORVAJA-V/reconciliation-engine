const { FileDatabase } = require('./fileDatabase');
const { MongoDatabase } = require('./mongoDatabase');

function createDatabase(config) {
  if (config.dbProvider === 'mongo') {
    return new MongoDatabase(config);
  }

  return new FileDatabase(config.fileDbPath);
}

module.exports = {
  createDatabase
};
