const express = require('express');
const sql = require('mssql');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const router = express.Router();
require('dotenv').config();
const dbConfig = require('../config/db');

// POST route for listing form submission
router.post('/listing', async (req, res) => {
    const formData = req.body;
    const referrer = req.get('Referer');

    // Validate the incoming data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: ersrrors.array() });
    }

    try {
        // Sanitize input data
        const sanitizedFormData = {
            FullName: validator.escape(formData.FullName || ''),
            Email: validator.normalizeEmail(formData.Email || ''),
            Phone: validator.escape(formData.Phone || ''),
            PropertyAddress: validator.escape(formData.PropertyAddress || ''),
            PropertyType: validator.escape(formData.PropertyType || ''),
            Bedrooms: validator.isInt(formData.Bedrooms || '') ? formData.Bedrooms : null,
            Bathrooms: validator.isInt(formData.Bathrooms || '') ? formData.Bathrooms : null,
            SquareFootage: validator.isInt(formData.SquareFootage || '') ? formData.SquareFootage : null,
            AskingPrice: validator.isFloat(formData.AskingPrice || '') ? formData.AskingPrice : null,
            Description: validator.escape(formData.Description || ''),
            ReasonForSelling: validator.escape(formData.ReasonForSelling || ''),
            SubmitDate: new Date().toISOString()
        };

        // Connect to MSSQL
        const pool = await sql.connect(dbConfig);

        // Insert Data into Listings_tbl
        const query = `
            INSERT INTO dbo.listings_tbl (
                FullName, Email, Phone, PropertyAddress, PropertyType,
                Bedrooms, Bathrooms, SquareFootage, AskingPrice,
                Description, ReasonForSelling, SubmitDate
            ) VALUES (
                @FullName, @Email, @Phone, @PropertyAddress, @PropertyType,
                @Bedrooms, @Bathrooms, @SquareFootage, @AskingPrice,
                @Description, @ReasonForSelling, @SubmitDate
            )
        `;

        const result = await pool.request()
            .input('FullName', sql.NVarChar, sanitizedFormData.FullName)
            .input('Email', sql.NVarChar, sanitizedFormData.Email)
            .input('Phone', sql.NVarChar, sanitizedFormData.Phone)
            .input('PropertyAddress', sql.NVarChar, sanitizedFormData.PropertyAddress)
            .input('PropertyType', sql.NVarChar, sanitizedFormData.PropertyType)
            .input('Bedrooms', sql.Int, sanitizedFormData.Bedrooms)
            .input('Bathrooms', sql.Int, sanitizedFormData.Bathrooms)
            .input('SquareFootage', sql.Int, sanitizedFormData.SquareFootage)
            .input('AskingPrice', sql.Money, sanitizedFormData.AskingPrice)
            .input('Description', sql.NVarChar, sanitizedFormData.Description)
            .input('ReasonForSelling', sql.NVarChar, sanitizedFormData.ReasonForSelling)
            .input('SubmitDate', sql.DateTime, sanitizedFormData.SubmitDate)
            .query(query);

        const { sendEmail, sendEmailWithTemplate } = require('../models/mailer');

        // Send email notifications
        const sendEmails = async () => {
            try {
                // Send email to admin
                const adminRecipients = [{ email: process.env.RECIPIENT_EMAIL1, name: 'Admin' }];
                const adminSubject = 'New Property Listing Submission';
                const adminHtml = `
                    <strong>New listing received from ${sanitizedFormData.FullName}:</strong><br>
                    <p>${JSON.stringify(sanitizedFormData, null, 2)}</p>`;
                await sendEmail(adminRecipients, adminSubject, '', adminHtml);

                // Send thank-you email to client
                const clientRecipient = { email: sanitizedFormData.Email, name: sanitizedFormData.FullName };
                const clientTemplateId = 'listing-confirmation-template';
                const clientTemplateData = {
                    name: sanitizedFormData.FullName,
                    message: 'Thank you for submitting your property listing. Our team will review it shortly!'
                };
                await sendEmailWithTemplate([clientRecipient], clientTemplateId, clientTemplateData);
            } catch (error) {
                console.error('Email sending error:', error);
            }
        };

        await sendEmails();

        const successMessage = encodeURIComponent("Listing submitted successfully!");
        res.redirect(`${referrer}?success=true&message=${successMessage}`);
    } catch (err) {
        console.error(err);
        const errorMessage = encodeURIComponent("Error saving listing data");
        res.redirect(`${referrer}?error=${errorMessage}`);
    } finally {
        sql.close();
    }
});

// GET route for displaying the lister dashboard
router.get('/lister', async (req, res) => {
    try {
        // Connect to MSSQL
        const pool = await sql.connect(dbConfig);

        // Query to fetch listings
        const result = await pool.request().query('SELECT * FROM dbo.listings_tbl');

        // Render the lister view with the fetched listings
        res.render('dashboard/lister', { listings: result.recordset });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving listings');
    } finally {
        sql.close();
    }
});

// POST route for listing form submission validation
router.post('/listing/validate', [

], validateAndSanitize, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    res.status(200).json({ message: 'Validation successful' });
});

module.exports = router;