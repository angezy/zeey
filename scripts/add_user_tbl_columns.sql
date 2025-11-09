-- add_user_tbl_columns.sql
-- Script to add missing columns to dbo.User_tbl: Username, Name, CreatedAt
-- Run this in the correct database (the one that contains dbo.User_tbl)
-- Requires permission to ALTER TABLE and create constraints.

-- Optional: uncomment and set your database
-- USE [YourDatabase];
GO

-- Add Username column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.user_tbl') AND name = 'Username'
)
BEGIN
    PRINT 'Adding column Username to dbo.user_tbl';
    ALTER TABLE dbo.user_tbl ADD Username NVARCHAR(255) NULL;
END
ELSE
BEGIN
    PRINT 'Column Username already exists in dbo.user_tbl';
END
GO

-- Add Name column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.user_tbl') AND name = 'Name'
)
BEGIN
    PRINT 'Adding column Name to dbo.user_tbl';
    ALTER TABLE dbo.user_tbl ADD Name NVARCHAR(255) NULL;
END
ELSE
BEGIN
    PRINT 'Column Name already exists in dbo.user_tbl';
END
GO

-- Add CreatedAt column with default GETDATE() if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.user_tbl') AND name = 'CreatedAt'
)
BEGIN
    PRINT 'Adding column CreatedAt to dbo.user_tbl with default GETDATE()';
    ALTER TABLE dbo.user_tbl ADD CreatedAt DATETIME NULL CONSTRAINT DF_user_tbl_CreatedAt DEFAULT (GETDATE());
END
ELSE
BEGIN
    PRINT 'Column CreatedAt already exists in dbo.user_tbl';
END
GO

-- Verify columns
PRINT 'Current columns in dbo.user_tbl:';
SELECT name, system_type_name = TYPE_NAME(user_type_id)
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.user_tbl');
GO
