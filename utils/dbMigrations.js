const sql = require('mssql');

const columnExists = async (pool, { schema = 'dbo', table, column }) => {
  const res = await pool.request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .input('column', sql.NVarChar, column)
    .query(`
      SELECT 1 AS ok
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE LOWER(TABLE_SCHEMA) = LOWER(@schema)
        AND LOWER(TABLE_NAME) = LOWER(@table)
        AND LOWER(COLUMN_NAME) = LOWER(@column)
    `);
  return !!(res.recordset && res.recordset.length);
};

const ensureListingsArvColumn = async (pool) => {
  const exists = await columnExists(pool, { schema: 'dbo', table: 'listings_tbl', column: 'ARV' });
  if (exists) return { changed: false };

  await pool.request().query(`ALTER TABLE dbo.listings_tbl ADD ARV MONEY NULL`);
  return { changed: true };
};

module.exports = {
  ensureListingsArvColumn,
};

