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

const ensureBlogSeoColumns = async (pool) => {
  let changed = false;
  const table = 'BlogPosts_tbl';

  const seoTitleExists = await columnExists(pool, { schema: 'dbo', table, column: 'SeoTitle' });
  if (!seoTitleExists) {
    await pool.request().query(`ALTER TABLE dbo.${table} ADD SeoTitle NVARCHAR(255) NULL`);
    changed = true;
  }

  const seoDescriptionExists = await columnExists(pool, { schema: 'dbo', table, column: 'SeoDescription' });
  if (!seoDescriptionExists) {
    await pool.request().query(`ALTER TABLE dbo.${table} ADD SeoDescription NVARCHAR(500) NULL`);
    changed = true;
  }

  const seoJsonLdExists = await columnExists(pool, { schema: 'dbo', table, column: 'SeoJsonLd' });
  if (!seoJsonLdExists) {
    await pool.request().query(`ALTER TABLE dbo.${table} ADD SeoJsonLd NVARCHAR(MAX) NULL`);
    changed = true;
  }

  return { changed };
};

module.exports = {
  ensureListingsArvColumn,
  ensureBlogSeoColumns,
};
