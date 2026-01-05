const sql = require('mssql');

const tableExists = async (pool, { schema = 'dbo', table }) => {
  const res = await pool.request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT 1 AS ok
      FROM INFORMATION_SCHEMA.TABLES
      WHERE LOWER(TABLE_SCHEMA) = LOWER(@schema)
        AND LOWER(TABLE_NAME) = LOWER(@table)
    `);
  return !!(res.recordset && res.recordset.length);
};

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

const ensureBirdDogTables = async (pool) => {
  let changed = false;

  const leadsExists = await tableExists(pool, { schema: 'dbo', table: 'birddog_leads' });
  if (!leadsExists) {
    await pool.request().query(`
      CREATE TABLE dbo.birddog_leads (
        LeadId INT IDENTITY(1,1) PRIMARY KEY,
        FullName NVARCHAR(255) NOT NULL,
        Email NVARCHAR(255) NULL,
        Phone NVARCHAR(60) NULL,
        TelegramHandle NVARCHAR(120) NULL,
        MarketFocus NVARCHAR(255) NULL,
        ExperienceLevel NVARCHAR(120) NULL,
        DealStrategy NVARCHAR(255) NULL,
        Motivation NVARCHAR(2000) NULL,
        PreferredReward NVARCHAR(120) NULL,
        JoinTelegram BIT NOT NULL DEFAULT 0,
        SubmitDate DATETIME NOT NULL DEFAULT GETDATE(),
        ApplicantIP VARCHAR(64) NULL
      )
    `);
    changed = true;
  }

  const contractsExists = await tableExists(pool, { schema: 'dbo', table: 'birddog_contracts' });
  if (!contractsExists) {
    await pool.request().query(`
      CREATE TABLE dbo.birddog_contracts (
        ContractId INT IDENTITY(1,1) PRIMARY KEY,
        FullName NVARCHAR(255) NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        Phone NVARCHAR(60) NOT NULL,
        Street NVARCHAR(255) NOT NULL,
        City NVARCHAR(120) NOT NULL,
        State NVARCHAR(60) NOT NULL,
        Zip NVARCHAR(20) NOT NULL,
        AgreementDate DATETIME NOT NULL,
        SignatureName NVARCHAR(255) NOT NULL,
        AcceptedTerms BIT NOT NULL DEFAULT 0,
        SubmitDate DATETIME NOT NULL DEFAULT GETDATE(),
        ApplicantIP VARCHAR(64) NULL
      )
    `);
    changed = true;
  }

  return { changed };
};

module.exports = {
  ensureBirdDogTables,
  ensureListingsArvColumn,
  ensureBlogSeoColumns,
};
