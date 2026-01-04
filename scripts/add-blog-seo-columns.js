const sql = require('mssql');
const dbConfig = require('../config/db');

const columnExists = async (pool, column) => {
  const res = await pool.request()
    .input('column', sql.NVarChar, column)
    .query(`
      SELECT 1 AS ok
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE LOWER(TABLE_SCHEMA) = 'dbo'
        AND LOWER(TABLE_NAME) = 'blogposts_tbl'
        AND LOWER(COLUMN_NAME) = LOWER(@column)
    `);
  return res.recordset && res.recordset.length > 0;
};

const addColumnIfMissing = async (pool, column, typeSql) => {
  const exists = await columnExists(pool, column);
  if (exists) {
    console.log(`[db] Column dbo.BlogPosts_tbl.${column} already exists`);
    return false;
  }
  await pool.request().query(`ALTER TABLE dbo.BlogPosts_tbl ADD ${column} ${typeSql} NULL`);
  console.log(`[db] Added column dbo.BlogPosts_tbl.${column}`);
  return true;
};

const run = async () => {
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    await addColumnIfMissing(pool, 'SeoTitle', 'NVARCHAR(255)');
    await addColumnIfMissing(pool, 'SeoDescription', 'NVARCHAR(500)');
    await addColumnIfMissing(pool, 'SeoJsonLd', 'NVARCHAR(MAX)');
  } catch (err) {
    console.error('[db] Migration error:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    if (pool) {
      try { await pool.close(); } catch (e) {}
    }
  }
};

run();
