const fs = require('fs');
const csv = require('csv-parser');
const sql = require('mssql');
const dbConfig = require('./config/db'); // Adjust the path if necessary

async function insertCashBuyers() {
    const results = [];
    const csvFilePath = "d:/zey/Nick's Cash buyer form.csv"; // Adjust the path as necessary

    // Read the CSV file
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                // Connect to the database
                const pool = await sql.connect(dbConfig);

                // Loop through each row and insert into the database
                for (const row of results) {

                    await pool.request()
                        .input('FullName', sql.VarChar, row['First & Last Name'])
                        .input('CompanyName', sql.VarChar, row['Company Name'])
.input('Website', sql.VarChar, row['website'])
.input('CellPhone', sql.VarChar, row['Cell Phone'])
                        .input('Email', sql.VarChar, row['Direct Email'])
                        .input('Address', sql.VarChar, row['Address'])
.input('YearsInBusiness', sql.VarChar, row['Years in Business'])
                        .input('CompletedProjects', sql.VarChar, row['How many projects have you completed so far'])
.input('CurrentProjects', sql.VarChar, row['How many projects are you currently working on at the moment?'] || 'N/A')
.input('PropertiesNext6Months', sql.NVarChar, row['How many properties are you looking to purchase in the next 6 months?'] || 'N/A')
.input('PropertiesPerYear', sql.NVarChar, row['How many houses do you buy a year?'] || 'N/A')
.input('SourceFinancing', sql.VarChar, row['Do you use financing for your projects or pay cash?'] || 'N/A')
.input('FundingInPlace', sql.VarChar, row['Do you already have the financing/funding in place?'] || 'N/A')
                        .input('ProofOfFunds', sql.VarChar, 'N/A')
                        .input('ProofOfFundsFile', sql.NVarChar, 'N/A')
.input('TripleDeals', sql.VarChar, row['If I bring you 3 great deals in the next month, will you be able to purchase them all?'] || 'N/A')
.input('Quickly', sql.VarChar, row['How quickly can you close on a great deal that I bring you that fits your buying criteria?'] || 'N/A')
.input('PriceRanges', sql.VarChar, row['What price ranges do you like to buy property in?'] || 'N/A')
.input('MinimumProfit', sql.NVarChar, row['What’s your minimum profit or ROI you need on a deal?'] || 'N/A')
.input('GoodDealCriteria', sql.VarChar, row['What constitutes a good deal for you? (% of value, minimum profit, min. cash flow)'] || 'N/A')
.input('PreferredAreas', sql.VarChar, row['What areas do you like to buy property in? (Zip Codes, Neighborhoods, Cities, etc.)'] || 'N/A')
.input('AvoidedAreas', sql.VarChar, row['Are there any types of properties or areas that you do not like to purchase property in?'] || 'N/A')
.input('PropertyType', sql.NVarChar, row['What types of properties are you looking to purchase?'] || 'N/A')
.input('WorkType', sql.VarChar, row['What type of work are you looking to do to the properties?'] || 'N/A')
.input('MaxPropertyAge', sql.VarChar, row['Maximum Age of the Properties?'] || 'N/A')
.input('Mins', sql.VarChar, row['Are there a minimum number of bedrooms and/or bathrooms that you require, or a minimum amount of square footage?'] || 'N/A')
.input('IdealProperty', sql.VarChar, row['what does your Ideal investment property look like (the one you would buy all day every day). Describe it to me, help me envision it…'] || 'N/A')
.input('InvestmentStrategy', sql.VarChar, row['Are you looking for properties to rehab and resell, or do you plan to buy and hold?'] || 'N/A')
                        .input('PurchaseReadiness', sql.VarChar, row['How quickly can you close on a great deal that I bring you that fits your buying criteria?'])
                        .input('AdditionalComments', sql.NVarChar, row['Please provide any additional comments or questions you may have regarding your property buying criteria.'])
                        .input('SubmitDate', sql.DateTime, new Date(row['Timestamp']))
                        .query(`INSERT INTO dbo.cashbuyers_tbl 
                                (FullName, CompanyName, Website, CellPhone, Email, Address, YearsInBusiness, CompletedProjects, 
                                 CurrentProjects, PropertiesNext6Months, PropertiesPerYear, SourceFinancing, FundingInPlace, ProofOfFunds, 
                                 ProofOfFundsFile, GoodDealCriteria, PreferredAreas, AvoidedAreas, PropertyType, WorkType, MaxPropertyAge, 
                                 IdealProperty, InvestmentStrategy, PurchaseReadiness, AdditionalComments, SubmitDate, TripleDeals,
                                 Quickly, PriceRanges, Mins, MinimumProfit) 
                                VALUES (@FullName, @CompanyName, @Website, @CellPhone, @Email, @Address, @YearsInBusiness, 
                                        @CompletedProjects, @CurrentProjects, @PropertiesNext6Months, @PropertiesPerYear, @SourceFinancing, 
                                        @FundingInPlace, @ProofOfFunds, @ProofOfFundsFile, @GoodDealCriteria, @PreferredAreas, @AvoidedAreas, 
                                        @PropertyType, @WorkType, @MaxPropertyAge, @IdealProperty, @InvestmentStrategy, 
                                        @PurchaseReadiness, @AdditionalComments, @SubmitDate, @TripleDeals, @Quickly, @PriceRanges, @Mins, @MinimumProfit)`); 
                }

                console.log('Data inserted successfully');
            } catch (err) {
                console.error('Error inserting data: ', err);
            } finally {
                await sql.close();
            }
        });
}

insertCashBuyers();
