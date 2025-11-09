const sql = require('mssql');
const baseConfig = require('./db');

/**
 * Return a connected ConnectionPool for the database associated with the request.
 * If req.session.userDB is set it will override the base database name.
 * Caller should call pool.close() when finished.
 */
async function getPoolForReq(req) {
  const dbName = (req && req.session && req.session.userDB) ? req.session.userDB : baseConfig.database;
  const cfg = Object.assign({}, baseConfig, { database: dbName });
  const pool = new sql.ConnectionPool(cfg);
  await pool.connect();
  return pool;
}

module.exports = { getPoolForReq };
