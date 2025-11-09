-- Add Images column to fastsell_tbl
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.fastsell_tbl') 
    AND name = 'Images'
)
BEGIN
    ALTER TABLE dbo.fastsell_tbl
    ADD Images NVARCHAR(MAX)
END