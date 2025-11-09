const express = require('express');
const sql = require('mssql');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const router = express.Router();
const axios = require('axios'); // Add axios for making HTTP requests
const upload = require('../utils/fileUpload');
require('dotenv').config();
const dbConfig = require('../config/db');

// POST route for fast sell form submission
router.post('/fastSell', upload.array('propertyImages', 10), async (req, res) => {
    const formData = req.body;
    const referrer = req.get('Referer');
    const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log("formData", formData);

    // Validate the incoming data
    const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Save submitted values and errors in session so the form can be repopulated
  try {
      if (req.session) {
        req.session.fastSellForm = { values: formData, errors: errors.array() };
      }
    } catch (e) {
      console.error('Could not save fastSell form data to session:', e.message);
    }

    const ref = referrer || '/forms/fastSell';
    const errMsgs = errors.array().map(e => e.msg || e.param || 'Validation error');
    const encoded = encodeURIComponent(JSON.stringify(errMsgs));
    return res.redirect(`${ref}?errors=${encoded}`);
  }
    try {
        // Process input data with minimal sanitization
        const sanitizedFormData = {
            FullName: formData.FullName || '',
            PropertyAddress: formData.PropertyAddress || '',
            City: formData.City || '',
            State: formData.State || '',
            ZipCode: formData.ZipCode || '',
            PropertyType: formData.PropertyType || '',
            Bedrooms: validator.isInt(formData.Bedrooms || '') ? formData.Bedrooms : null,
            Bathrooms: validator.isInt(formData.Bathrooms || '') ? formData.Bathrooms : null,
            SquareFootage: validator.isInt(formData.SquareFootage || '') ? formData.SquareFootage : null,
            LotSize: formData.LotSize || '',
            YearBuilt: validator.isInt(formData.YearBuilt || '') ? formData.YearBuilt : null,
            PropertyCondition: formData.PropertyCondition || '',
            AskingPrice: validator.isFloat(formData.AskingPrice || '') ? formData.AskingPrice : null,
            ReasonForSelling: formData.ReasonForSelling || '',
            Timeframe: formData.Timeframe || '',
            ContactPhone: formData.ContactPhone || '',
            ContactEmail: formData.ContactEmail || '',
            AdditionalComments: Array.isArray(formData.AdditionalComments)
                ? formData.AdditionalComments.join(', ')
                : (formData.AdditionalComments || ''),
            SubmitDate: new Date().toISOString(),
            SellerIP: userIP,
            Images: req.files ? JSON.stringify(req.files.map(file => file.path)) : null
        };

  // Connect to MSSQL
  const pool = await sql.connect(dbConfig);

        // Insert Data into FastSellForm_tbl
        const query = `
            INSERT INTO dbo.fastsell_tbl (
                FullName, PropertyAddress, City, State, ZipCode, PropertyType,
                Bedrooms, Bathrooms, SquareFootage, LotSize, YearBuilt,
                PropertyCondition, AskingPrice, ReasonForSelling, Timeframe,
                ContactPhone, ContactEmail, AdditionalComments, SubmitDate, SellerIP
            ) VALUES (
                @FullName, @PropertyAddress, @City, @State, @ZipCode, @PropertyType,
                @Bedrooms, @Bathrooms, @SquareFootage, @LotSize, @YearBuilt,
                @PropertyCondition, @AskingPrice, @ReasonForSelling, @Timeframe,
                @ContactPhone, @ContactEmail, @AdditionalComments, @SubmitDate, @SellerIP
            )
        `;

        const result = await pool.request()
            .input('FullName', sql.NVarChar, sanitizedFormData.FullName)
            .input('PropertyAddress', sql.NVarChar, sanitizedFormData.PropertyAddress)
            .input('City', sql.NVarChar, sanitizedFormData.City)
            .input('State', sql.NVarChar, sanitizedFormData.State)
            .input('ZipCode', sql.NVarChar, sanitizedFormData.ZipCode)
            .input('PropertyType', sql.NVarChar, sanitizedFormData.PropertyType)
            .input('Bedrooms', sql.Int, sanitizedFormData.Bedrooms)
            .input('Bathrooms', sql.Int, sanitizedFormData.Bathrooms)
            .input('SquareFootage', sql.Int, sanitizedFormData.SquareFootage)
            .input('LotSize', sql.NVarChar, sanitizedFormData.LotSize)
            .input('YearBuilt', sql.Int, sanitizedFormData.YearBuilt)
            .input('PropertyCondition', sql.NVarChar, sanitizedFormData.PropertyCondition)
            .input('AskingPrice', sql.Float, sanitizedFormData.AskingPrice)
            .input('ReasonForSelling', sql.NVarChar, sanitizedFormData.ReasonForSelling)
            .input('Timeframe', sql.NVarChar, sanitizedFormData.Timeframe)
            .input('ContactPhone', sql.NVarChar, sanitizedFormData.ContactPhone)
            .input('ContactEmail', sql.NVarChar, sanitizedFormData.ContactEmail)
            .input('AdditionalComments', sql.NVarChar, sanitizedFormData.AdditionalComments)
            .input('SubmitDate', sql.DateTime, sanitizedFormData.SubmitDate)
            .input('SellerIP', sql.VarChar, sanitizedFormData.SellerIP)
            .query(query);

        const { sendEmail, sendEmailWithTemplate } = require('../models/mailer');

        const sendEmails = async () => {
            // Send email to admin
            try {
                const adminRecipients = [{ email: process.env.RECIPIENT_EMAIL1, name: 'Admin' }];
                const adminSubject = 'New Fast Sell Form Submission';
                const adminHtml = `
                    <strong>New submission received from ${sanitizedFormData.FullName}:</strong><br>
                    <p>${JSON.stringify(sanitizedFormData, null, 2)}</p>`;
                const adminText = `New submission from ${sanitizedFormData.FullName}`;

                await sendEmail(adminRecipients, adminSubject, adminText, adminHtml);
                console.log('Admin email sent successfully.');
            } catch (error) {
                console.error('Failed to send admin email:', error.message);
            }

            // Send thank-you email to client
            try {
                const clientRecipient = { email: sanitizedFormData.ContactEmail, name: sanitizedFormData.FullName };
                const clientTemplateId = 'your-template-id'; // Replace with your actual template ID
                const clientTemplateData = {
                    name: sanitizedFormData.FullName,
                    message: 'Thank you for submitting the Fast Sell Form. Our team will get back to you shortly!',
                };

                await sendEmailWithTemplate([clientRecipient], clientTemplateId, clientTemplateData);
                console.log('Client email sent successfully.');
            } catch (error) {
                console.error('Failed to send client email:', error.message);
            }
        };

        sendEmails();

        const successMessage = encodeURIComponent("Form submitted successfully!");
        res.redirect(`${referrer}?success=${successMessage}`);
  } catch (err) {
        console.error(err);
        const errorMessage = encodeURIComponent("Error saving data to database");
        res.redirect(`${referrer}?error=${errorMessage}`);
  } finally {
    try { sql.close(); } catch(e) { console.error('Error closing connection:', e.message); }
  }
});



router.post(
  "/fastSell3",
  [
    body("FullName").notEmpty().trim().escape(),
    body("PhoneNumber").notEmpty().trim().escape(),
    body("PropertyAddress").notEmpty().trim().escape(),
    body("SpecificRequests").optional().trim().escape(),
  ],
  async (req, res) => {
    console.log("📥 Received POST /fastSell3 request");

    const errors = validationResult(req);
    console.log("🔍 Validation errors:", errors.array());

    if (!errors.isEmpty()) {
      console.warn("⚠️ Validation failed for request body:", req.body);
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const formData = req.body;
    console.log("🧾 Raw formData:", formData);

    const userIP =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const referrer = req.get("Referer") || "";
    console.log("🌐 User IP:", userIP);
    console.log("📄 Referrer:", referrer);

    try {
      // ✅ Sanitize inputs
      const sanitized = {
        FullName: validator.escape(formData.FullName || ""),
        PhoneNumber: validator.escape(formData.PhoneNumber || ""),
        PropertyAddress: validator.escape(formData.PropertyAddress || ""),
        SpecificRequests: validator.escape(formData.SpecificRequests || ""),
        SubmitDate: new Date().toISOString(),
        SellerIP: userIP,
      };
      console.log("🧹 Sanitized data:", sanitized);

      // ✅ Connect to MSSQL
  console.log("🛠️ Connecting to MSSQL...");
  pool = await sql.connect(dbConfig);
  console.log("✅ MSSQL connected successfully");

      const query = `
        INSERT INTO dbo.fastsel_tbl 
          (FullName, PhoneNumber, PropertyAddress, SpecificRequests, SubmitDate, SellerIP)
        VALUES 
          (@FullName, @PhoneNumber, @PropertyAddress, @SpecificRequests, @SubmitDate, @SellerIP)
      `;

      console.log("💾 Running INSERT query...");
      await pool
        .request()
        .input("FullName", sql.NVarChar, sanitized.FullName)
        .input("PhoneNumber", sql.NVarChar, sanitized.PhoneNumber)
        .input("PropertyAddress", sql.NVarChar, sanitized.PropertyAddress)
        .input("SpecificRequests", sql.NVarChar, sanitized.SpecificRequests)
        .input("SubmitDate", sql.DateTime, sanitized.SubmitDate)
        .input("SellerIP", sql.VarChar, sanitized.SellerIP)
        .query(query);
      console.log("✅ Data inserted successfully into fastsel_tbl");

      // ✅ Send Emails
              const { sendEmail, sendEmailWithTemplate } = require('../models/mailer');

      const sendEmails = async () => {
        try {
          console.log("📨 Sending admin email...");
          const adminRecipients = [
            { email: process.env.RECIPIENT_EMAIL1, name: "Admin" },
          ];
          const adminSubject = "New Fast Sell Form Submission";
          const adminHtml = `
            <h3>New Submission from ${sanitized.FullName}</h3>
            <p><strong>Phone:</strong> ${sanitized.PhoneNumber}</p>
            <p><strong>Address:</strong> ${sanitized.PropertyAddress}</p>
            <p><strong>Specific Requests:</strong> ${sanitized.SpecificRequests}</p>
            <p><strong>IP:</strong> ${sanitized.SellerIP}</p>
          `;
          await sendEmail(adminRecipients, adminSubject, "", adminHtml);
          console.log("✅ Admin email sent.");
        } catch (err) {
          console.error("⚠️ Failed to send admin email:", err.message);
        }

        try {
          console.log("📨 Sending client email...");
          const clientRecipient = {
            email: sanitized.ContactEmail || "noreply@example.com",
            name: sanitized.FullName,
          };
          const clientTemplateId = process.env.CLIENT_TEMPLATE_ID;
          const clientTemplateData = {
            name: sanitized.FullName,
            message:
              "Thank you for submitting your property! We’ll contact you shortly.",
          };

          await sendEmailWithTemplate(
            [clientRecipient],
            clientTemplateId,
            clientTemplateData
          );
          console.log("✅ Client email sent.");
        } catch (err) {
          console.error("⚠️ Failed to send client email:", err.message);
        }
      };

      sendEmails();

      // ✅ Respond to frontend
      res.json({
        success: true,
        message: "Form submitted successfully! Our team will contact you soon.",
      });
      console.log("✅ Response sent to frontend");
    } catch (err) {
      console.error("❌ Database error:", err.message);
      res.status(500).json({
        success: false,
        message: "Error saving data to database. Please try again later.",
      });
    } finally {
  console.log("🔒 Closing MSSQL connection");
  try { if (pool) await pool.close(); } catch (e) { console.error('Error closing pool:', e.message); }
    }
  }
);








router.get('/autocomplete', async (req, res) => {
  const MIN_QUERY_BYTES = 3;
  const MAX_QUERY_BYTES = 127;
  const query = (req.query.query || '').trim(); // Trim whitespace and guard undefined
  const queryBytes = Buffer.byteLength(query, 'utf8'); // Measure byte size

  if (!query || queryBytes < MIN_QUERY_BYTES || queryBytes > MAX_QUERY_BYTES) {
    return res.status(400).json({ error: `Query must be between ${MIN_QUERY_BYTES} and ${MAX_QUERY_BYTES} bytes.` });
  }

  try {
    const response = await axios.get('https://us-autocomplete-pro.api.smarty.com/lookup', {
      params: {
        // support multiple env var names just in case
        'auth-id': process.env.SMARTY_AUTH_ID || process.env.authID,
        'search': query, // Use the input query
        'auth-token': process.env.SMARTY_AUTH_TOKEN || process.env.authToken
      },
    });

    // Prefer response.data.suggestions (Smarty API), but be defensive
    const suggestionsSource = Array.isArray(response.data && response.data.suggestions)
      ? response.data.suggestions
      : Array.isArray(response.data)
        ? response.data
        : null;

    if (Array.isArray(suggestionsSource)) {
      const suggestions = suggestionsSource.map(item => ({
        display_name: `${item.street_line || item.display_name || item.name || ''}, ${item.city || ''} ${item.state || ''} ${item.zipcode || ''}`.replace(/(^[\s,]+|[\s,]+$)/g, '')
      }));
      return res.json(suggestions);
    } else {
      console.error('Autocomplete: unexpected API response', response.data);
      return res.status(500).json({ error: 'Unexpected API response structure.' });
    }
  } catch (error) {
    console.error('Autocomplete error:', error && error.message ? error.message : error);
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});
// Endpoint to return saved fastSell form values/errors (if any) and clear them from session.
router.get('/fastSell/restore', (req, res) => {
  try {
    const data = (req.session && req.session.fastSellForm) ? req.session.fastSellForm : { values: {}, errors: null };
    const payload = { values: data.values || {}, errors: data.errors || null };
    if (req.session && req.session.fastSellForm) delete req.session.fastSellForm;
    return res.json(payload);
  } catch (e) {
    console.error('fastSell/restore error:', e.message);
    return res.status(500).json({ values: {}, errors: null });
  }
});

module.exports = router;
