-- Adds After Repair Value (ARV) column to listings table (safe to run multiple times)

IF COL_LENGTH('dbo.listings_tbl', 'ARV') IS NULL
BEGIN
    ALTER TABLE dbo.listings_tbl
    ADD ARV MONEY NULL;
END
GO

