require('dotenv').config();
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: 1433,  // Ensure port is specified
    options: {
        encrypt: true, 
        trustServerCertificate: true, 
    },
};
module.exports = dbConfig;