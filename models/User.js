const sql = require('mssql');
const dbConfig = require('../config/db');

// Find a user by Email
async function findUserByEmail(Email) {
    try {
        const pool = await sql.connect(dbConfig); // Ensure the connection is established
        const result = await pool
            .request()
            .input('Email', sql.NVarChar, Email)
            .query('SELECT * FROM dbo.User_tbl WHERE Email = @Email');
        return result.recordset[0]; // Return the first user found
    } catch (err) {
        console.error('Error fetching user by Email:', err);
        throw err; // Propagate error for error handling
    }
}

module.exports = findUserByEmail;
