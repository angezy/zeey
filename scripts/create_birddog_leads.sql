IF OBJECT_ID('dbo.birddog_leads', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.birddog_leads (
        LeadId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        FullName NVARCHAR(150) NOT NULL,
        Email NVARCHAR(150) NULL,
        Phone NVARCHAR(60) NULL,
        TelegramHandle NVARCHAR(120) NULL,
        MarketFocus NVARCHAR(255) NULL,
        ExperienceLevel NVARCHAR(120) NULL,
        DealStrategy NVARCHAR(255) NULL,
        Motivation NVARCHAR(MAX) NULL,
        PreferredReward NVARCHAR(120) NULL,
        JoinTelegram BIT NOT NULL DEFAULT (0),
        SubmitDate DATETIME NOT NULL DEFAULT (GETUTCDATE()),
        ApplicantIP VARCHAR(64) NULL
    );

    CREATE INDEX IX_birddog_leads_SubmitDate ON dbo.birddog_leads (SubmitDate DESC);
END
GO

IF OBJECT_ID('dbo.birddog_contracts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.birddog_contracts (
        ContractId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        FullName NVARCHAR(150) NOT NULL,
        Email NVARCHAR(150) NOT NULL,
        Phone NVARCHAR(60) NOT NULL,
        Street NVARCHAR(255) NOT NULL,
        City NVARCHAR(120) NOT NULL,
        State NVARCHAR(120) NOT NULL,
        Zip NVARCHAR(30) NOT NULL,
        AgreementDate DATETIME NOT NULL,
        SignatureName NVARCHAR(150) NOT NULL,
        AcceptedTerms BIT NOT NULL DEFAULT (0),
        SubmitDate DATETIME NOT NULL DEFAULT (GETUTCDATE()),
        ApplicantIP VARCHAR(64) NULL
    );

    CREATE INDEX IX_birddog_contracts_SubmitDate ON dbo.birddog_contracts (SubmitDate DESC);
END
GO
