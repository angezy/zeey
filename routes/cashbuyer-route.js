const express = require('express');
const sql = require('mssql');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const validateAndSanitize = require('../middleware/validateAndSanitize');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { getClientIp } = require('../utils/clientIp');
const router = express.Router();
require('dotenv').config();
const dbConfig = require('../config/db');

// Configure multer storage for uploaded files (store in public/uploaded with safe short names)
const uploadDir = path.join(process.cwd(), 'public', 'uploaded');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        try {
            const ext = path.extname(file.originalname) || '';
            const newName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
            cb(null, newName);
        } catch (e) {
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${path.extname(file.originalname)}`);
        }
    }
});
const upload = multer({ storage });

// One-time restore endpoint used by client to fetch saved form values and errors from session
router.get('/cbForm/restore', (req, res) => {
    try {
        if (req.session && req.session.cbForm) {
            const payload = req.session.cbForm;
            // clear it so it's one-time
            try { delete req.session.cbForm; } catch (e) {}
            return res.json(payload);
        }
        return res.json({});
    } catch (e) {
        console.error('Error in cbForm/restore:', e.message);
        return res.status(500).json({});
    }
});


// POST route for form submission
// multer's upload middleware must run before validation so req.file is available
router.post('/cbForm', upload.single('ProofOfFundsFile'), validateAndSanitize, async (req, res) => {
    const formData = req.body;
    const referrer = req.get('Referer');
    const userIP = getClientIp(req);

    // Validate the incoming data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Save submitted values and errors in session so the form can be repopulated
        try {
            if (req.session) {
                req.session.cbForm = { values: formData, errors: errors.array() };
            }
        } catch (e) {
            console.error('Could not save form data to session:', e.message);
        }

        // Redirect back to the referring form page and include a lightweight errors query for client-side alerts
        const ref = referrer || '/forms/Cash-Buyer';
        const errMsgs = errors.array().map(e => e.msg || (e.param + ': ' + e.msg));
        const encoded = encodeURIComponent(JSON.stringify(errMsgs));
        return res.redirect(`${ref}?errors=${encoded}`);
    }

    try {
        // Sanitize input data to prevent SQL injection or other malicious inputs
        // Prefer file info from multer (req.file) when available. multer is configured
        // below to store uploaded files into public/uploaded with a short safe filename.
        const sanitizedFormData = {
            FullName: validator.escape(formData.FullName || ''),
            CompanyName: validator.escape(formData.CompanyName || ''),
            Website: validator.isURL(formData.Website || '') ? formData.Website : '',
            CellPhone: validator.escape(formData.CellPhone || ''),
            Email: validator.normalizeEmail(formData.Email || ''),
            Address: validator.escape(formData.Address || ''),
            YearsInBusiness: validator.isInt(formData.YearsInBusiness || '') ? formData.YearsInBusiness : null,
            CompletedProjects: validator.isInt(formData.CompletedProjects || '') ? formData.CompletedProjects : null,
            CurrentProjects: validator.escape(formData.CurrentProjects || ''),
            PropertiesNext6Months: validator.isInt(formData.PropertiesNext6Months || '') ? formData.PropertiesNext6Months : null,
            PropertiesPerYear: validator.isInt(formData.PropertiesPerYear || '') ? formData.PropertiesPerYear : null,
            SourceFinancing: Array.isArray(formData.SourceFinancing) ? formData.SourceFinancing.join(', ') : validator.escape(formData.SourceFinancing || ''),
            FundingInPlace: validator.escape(formData.FundingInPlace || ''),
            ProofOfFunds: validator.escape(formData.ProofOfFunds || ''),
            ProofOfFundsFile: (() => {
                try {
                    if (req.file && req.file.filename) {
                        return path.join('public', 'uploaded', req.file.filename).replace(/\\/g, '/');
                    }

                    // Fallback: sanitize any provided path/string from the form
                    const raw = (formData.ProofOfFundsFile || '').toString();
                    if (!raw) return '';
                    const incomingBase = path.basename(raw);
                    const safe = validator.escape(incomingBase).slice(0, 200);
                    return safe ? path.join('public', 'uploaded', safe).replace(/\\/g, '/') : '';
                } catch (e) {
                    console.error('ProofOfFundsFile processing error:', e.message);
                    return '';
                }
            })(),
            TripleDeals: validator.escape(formData.TripleDeals || ''),
            Quickly: validator.escape(formData.Quickly || ''),
            PriceRanges: validator.escape(formData.PriceRanges || ''),
            MinimumProfit: validator.escape(formData.MinimumProfit || ''),
            GoodDealCriteria: validator.escape(formData.GoodDealCriteria || ''),
            PreferredAreas: validator.escape(formData.PreferredAreas || ''),
            AvoidedAreas: validator.escape(formData.AvoidedAreas || ''),
            PropertyType: Array.isArray(formData.PropertyType) ? formData.PropertyType.join(', ') : validator.escape(formData.PropertyType || ''),
            WorkType: Array.isArray(formData.WorkType) ? formData.WorkType.join(', ') : validator.escape(formData.WorkType || ''),
            MaxPropertyAge: validator.isInt(formData.MaxPropertyAge || '') ? formData.MaxPropertyAge : null,
            Mins: validator.escape(formData.Mins || ''),
            IdealProperty: validator.escape(formData.IdealProperty || ''),
            InvestmentStrategy: validator.escape(formData.InvestmentStrategy || ''),
            PurchaseReadiness: validator.isInt(formData.PurchaseReadiness || '') ? formData.PurchaseReadiness : null,
            AdditionalComments: validator.escape(formData.AdditionalComments || ''),
            SubmitDate: new Date().toISOString(),
            CashBuyerIP: userIP
        };

    // Connect to MSSQL
    const pool = await sql.connect(dbConfig);

        // Insert Data into CashBuyerForm_tbl
        const query = `
            INSERT INTO dbo.cashbuyers_tbl (
                FullName, CompanyName, Website, CellPhone, Email, Address, YearsInBusiness,
                CompletedProjects, CurrentProjects, PropertiesNext6Months, PropertiesPerYear, SourceFinancing, FundingInPlace,
                ProofOfFunds, ProofOfFundsFile, TripleDeals, Quickly, PriceRanges, MinimumProfit, GoodDealCriteria,
                PreferredAreas, AvoidedAreas, PropertyType, WorkType, MaxPropertyAge, Mins, IdealProperty,
                InvestmentStrategy, PurchaseReadiness, AdditionalComments, SubmitDate, CashBuyerIP
            ) VALUES (
                @FullName, @CompanyName, @Website, @CellPhone, @Email, @Address, @YearsInBusiness,
                @CompletedProjects, @CurrentProjects, @PropertiesNext6Months, @PropertiesPerYear, @SourceFinancing, @FundingInPlace,
                @ProofOfFunds, @ProofOfFundsFile, @TripleDeals, @Quickly, @PriceRanges, @MinimumProfit, @GoodDealCriteria,
                @PreferredAreas, @AvoidedAreas, @PropertyType, @WorkType, @MaxPropertyAge, @Mins, @IdealProperty,
                @InvestmentStrategy, @PurchaseReadiness, @AdditionalComments, @SubmitDate, @CashBuyerIP
            )
        `;

        const result = await pool.request()
            .input('FullName', sql.NVarChar, sanitizedFormData.FullName)
            .input('CompanyName', sql.NVarChar, sanitizedFormData.CompanyName)
            .input('Website', sql.NVarChar, sanitizedFormData.Website)
            .input('CellPhone', sql.NVarChar, sanitizedFormData.CellPhone)
            .input('Email', sql.NVarChar, sanitizedFormData.Email)
            .input('Address', sql.NVarChar, sanitizedFormData.Address)
            .input('YearsInBusiness', sql.Int, sanitizedFormData.YearsInBusiness)
            .input('CompletedProjects', sql.Int, sanitizedFormData.CompletedProjects)
            .input('CurrentProjects', sql.NVarChar, sanitizedFormData.CurrentProjects)
            .input('PropertiesNext6Months', sql.Int, sanitizedFormData.PropertiesNext6Months)
            .input('PropertiesPerYear', sql.Int, sanitizedFormData.PropertiesPerYear)
            .input('SourceFinancing', sql.NVarChar, sanitizedFormData.SourceFinancing)
            .input('FundingInPlace', sql.NVarChar, sanitizedFormData.FundingInPlace)
            .input('ProofOfFunds', sql.NVarChar, sanitizedFormData.ProofOfFunds)
            .input('ProofOfFundsFile', sql.NVarChar, sanitizedFormData.ProofOfFundsFile)
            .input('TripleDeals', sql.NVarChar, sanitizedFormData.TripleDeals)
            .input('Quickly', sql.NVarChar, sanitizedFormData.Quickly)
            .input('PriceRanges', sql.NVarChar, sanitizedFormData.PriceRanges)
            .input('MinimumProfit', sql.NVarChar, sanitizedFormData.MinimumProfit)
            .input('GoodDealCriteria', sql.NVarChar, sanitizedFormData.GoodDealCriteria)
            .input('PreferredAreas', sql.NVarChar, sanitizedFormData.PreferredAreas)
            .input('AvoidedAreas', sql.NVarChar, sanitizedFormData.AvoidedAreas)
            .input('PropertyType', sql.NVarChar, sanitizedFormData.PropertyType)
            .input('WorkType', sql.NVarChar, sanitizedFormData.WorkType)
            .input('MaxPropertyAge', sql.Int, sanitizedFormData.MaxPropertyAge)
            .input('Mins', sql.NVarChar, sanitizedFormData.Mins)
            .input('IdealProperty', sql.NVarChar, sanitizedFormData.IdealProperty)
            .input('InvestmentStrategy', sql.NVarChar, sanitizedFormData.InvestmentStrategy)
            .input('PurchaseReadiness', sql.Int, sanitizedFormData.PurchaseReadiness)
            .input('AdditionalComments', sql.NVarChar, sanitizedFormData.AdditionalComments)
            .input('SubmitDate', sql.DateTime, sanitizedFormData.SubmitDate)
            .input('CashBuyerIP', sql.NVarChar, sanitizedFormData.CashBuyerIP)
            .query(query);


        const { sendEmail, sendEmailWithTemplate } = require('../models/mailer');
        
        const sendEmails = async () => {

            
            // Send email to admin
            try {
                const adminRecipients = [{ email: process.env.RECIPIENT_EMAIL1, name: 'Admin' }];
                const adminSubject = 'New Cash Buyer Form Submission';
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
                const clientRecipient = { email: sanitizedFormData.Email, name: sanitizedFormData.FullName };
                const clientTemplateId = '52393';

                // Provide template variables and a subject so SendPulse accepts the request.
                const templateVars = {
                    fullName: sanitizedFormData.FullName,
                    // You can add more template variables here if your template expects them
                    subject: `Thanks from ${process.env.SENDER_NAME || 'Our Team'}`
                };

                await sendEmailWithTemplate([clientRecipient], clientTemplateId, templateVars);
                console.log('Client email sent successfully.');
            } catch (error) {
                console.error('Failed to send client email:', error.message);
            }

        };

        sendEmails();

    // Clear any saved form values on successful submit
    try { if (req.session) delete req.session.cbForm; } catch (e) { console.error('Could not clear session cbForm after success:', e.message); }
    const successMessage = encodeURIComponent("Form submitted successfully!");
    res.redirect(`${referrer}?success=true&message=${successMessage}`);
    } catch (err) {
        console.error(err);
        // Save form values so user doesn't lose input
        try {
            if (req.session) {
                req.session.cbForm = { values: formData, errors: [{ msg: 'Error saving data to database' }] };
            }
        } catch (e) {
            console.error('Could not save form data to session after DB error:', e.message);
        }
        const errorMessage = encodeURIComponent(JSON.stringify(["Error saving data to database"]));
        const ref = referrer || '/forms/Cash-Buyer';
        res.redirect(`${ref}?errors=${errorMessage}`);
    } finally {
        try { sql.close(); } catch (e) { console.error('Error closing connection:', e.message); }
    }
});

module.exports = router;
