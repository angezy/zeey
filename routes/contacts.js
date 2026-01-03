const express = require('express');
const sql = require('mssql');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const router = express.Router();
const { getClientIp } = require('../utils/clientIp');
require('dotenv').config();
const dbConfig = require('../config/db');

// POST route for /contacts
router.post(
    '/contacts',
    [
      // Existing validations
      body('FacebookName').isString().withMessage('FacebookName must be a string').trim().escape(),
      body('chatResult').isString().withMessage('ChatResult must be a string').trim().escape(),
      body('Email').optional().isEmail().withMessage('Invalid email address').normalizeEmail(),
      body('PhoneNumber').optional().isString().withMessage('PhoneNumber must be a string').trim().escape(),
      body('Role').isString().withMessage('Role is required').trim().escape(),
      body('SpecificRole').optional().isString().trim().escape(),
    ],
    async (req, res) => {
      const formData = req.body;
      const referrer = req.get('Referer');
      const userIP = getClientIp(req);
      try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          console.error("Validation Errors:", errors.array());
          return res.status(400).json({ errors: errors.array() });
        }
  
        // Sanitize input data
        const sanitizedData = {
          FacebookName: validator.escape(formData.FacebookName),
          ChatResult: validator.escape(formData.chatResult),
          Email: validator.isEmail(formData.Email || "") ? validator.normalizeEmail(formData.Email) : "",
          PhoneNumber: validator.escape(formData.PhoneNumber),
          Role: validator.escape(formData.Role),
          SpecificRole: validator.escape(formData.SpecificRole),
          ContactIP: userIP 
        };
  
  // Connect to MSSQL
  const pool = await sql.connect(dbConfig);
        const query = `
          INSERT INTO dbo.contacts_tbl (FacebookName, ChatResult, Email, PhoneNumber, Role, SpecificRole, ContactIP)
          VALUES (@FacebookName, @ChatResult, @Email, @PhoneNumber, @Role, @SpecificRole, @ContactIP)
        `;
        await pool.request()
          .input('FacebookName', sql.NVarChar, sanitizedData.FacebookName)
          .input('ChatResult', sql.NVarChar, sanitizedData.ChatResult)
          .input('Email', sql.NVarChar, sanitizedData.Email)
          .input('PhoneNumber', sql.NVarChar, sanitizedData.PhoneNumber)
          .input('Role', sql.NVarChar, sanitizedData.Role)
          .input('SpecificRole', sql.NVarChar, sanitizedData.SpecificRole)
          .input('ContactIP', sql.VarChar, sanitizedData.ContactIP) 
          .query(query);
  
        const successMessage = encodeURIComponent("Form submitted successfully!");
        res.redirect(`${referrer}?success=${successMessage}`);
      } catch (err) {
        console.error("Database Error:", err);
        const errorMessage = encodeURIComponent("Error saving data to database");
        res.redirect(`${referrer}?error=${errorMessage}`);
      } finally {
        try { sql.close(); } catch(e) { console.error('Error closing connection:', e.message); }
      }
    }
);

module.exports = router;
