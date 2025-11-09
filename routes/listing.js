const express = require('express');
const sql = require('mssql');
// use central DB connection
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const multer = require('multer');
const router = express.Router();
require('dotenv').config();
const dbConfig = require('../config/db');

// Configure multer for multiple file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/uploads'); // Specify the folder for image uploads
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({ storage }).array('PhotoFiles', 10); // Allow up to 10 photos

// POST route for listing form submission
router.post('/listing', upload, async (req, res) => {
    const formData = (req.session && req.session.formData) || req.body;
    const referrer = req.get('Referer');
    const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Handle multiple files
    const imageFiles = req.files ? req.files.map(file => `public/images/uploads/${file.filename}`).join(',') : null;

    // helper: detect whether client prefers JSON (AJAX/fetch) or HTML (legacy form)
    const accept = (req.headers.accept || '');
    const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');
    const wantsJson = !wantsHtml;

    // helper: convert Google Drive share links to embeddable/viewable URL
    const convertDriveUrl = (raw) => {
        if (!raw) return '';
        const t = validator.trim(raw);
        // Try to extract file ID from common Drive URL patterns
        const m1 = t.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
        if (m1 && m1[1]) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;
        const m2 = t.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
        if (m2 && m2[1]) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
        // If it's a drive viewer url that ends with /view or /preview, leave as is but replace /view with /preview if needed
        if (/drive\.google\.com/.test(t)) return t.replace(/\/view(.*)$/, '/preview');
        return t;
    };

    // helper: decode common HTML entities (so stored values keep normal characters)
    const decodeHtmlEntities = (str) => {
        if(!str || typeof str !== 'string') return str;
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x2F;|&#x2f;|&#47;/g, '/')
            .replace(/&#39;|&apos;/g, "'");
    };

    // Validate the incoming data (if validators applied elsewhere)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        const errorMessages = errors.array().map(error => error.msg);
        if (req.session) {
            req.session.formData = req.body;
        }
        if (wantsJson) {
            return res.status(400).json({ success: false, errors: errorMessages });
        }
        const query = new URLSearchParams({
            errors: JSON.stringify(errorMessages),
            ...req.body,
        }).toString();

        return res.redirect(`${referrer}?${query}`);
    }

    try {
        // Sanitize input data
        // Sanitize inputs - keep address and photo URL trimmed (not HTML-escaped) to preserve formatting/links
        const rawPhotoUrl = formData.PhotoURL || '';
        var normalizedPhotoUrl = rawPhotoUrl ? convertDriveUrl(rawPhotoUrl) : '';
        // decode any HTML entities that may have been introduced earlier
        normalizedPhotoUrl = decodeHtmlEntities(normalizedPhotoUrl);

        // ensure uploaded imagePaths are decoded as well
        var decodedImageFiles = imageFiles ? decodeHtmlEntities(imageFiles) : imageFiles;

        // Store raw/trimmed values for fields that must preserve slashes and punctuation
        // We'll rely on template-side escaping when rendering to avoid XSS while keeping original input intact.
        const sanitizedFormData = {
            Title: validator.trim(formData.Title || ''),
            FullName: validator.trim(formData.FullName || ''),
            Email: validator.normalizeEmail(formData.Email || ''),
            Phone: validator.trim(formData.Phone || ''),
            PropertyAddress: validator.trim(formData.PropertyAddress || ''),
            PropertyType: validator.trim(formData.PropertyType || ''),
            Bedrooms: validator.isInt(String(formData.Bedrooms || '')) ? formData.Bedrooms : null,
            Bathrooms: validator.isInt(String(formData.Bathrooms || '')) ? formData.Bathrooms : null,
            SquareFootage: validator.isInt(String(formData.SquareFootage || '')) ? formData.SquareFootage : null,
            AskingPrice: validator.isFloat(String(formData.AskingPrice || '')) ? formData.AskingPrice : null,
            // Keep description raw (trimmed) so we don't mangle slashes; escape when rendering in templates
            Description: validator.trim(formData.Description || ''),
            ReasonForSelling: validator.trim(formData.ReasonForSelling || ''),
            SubmitDate: new Date().toISOString(),
            ListerIP: userIP,
            // already decoded above
            PhotoFile: decodedImageFiles,
            PhotoURL: normalizedPhotoUrl || '',
            LotArea: validator.isInt(String(formData.LotArea || '')) ? formData.LotArea : null,
            FloorArea: validator.isInt(String(formData.FloorArea || '')) ? formData.FloorArea : null,
            YearBuilt: validator.isInt(String(formData.YearBuilt || '')) ? formData.YearBuilt : null,
            Garage: validator.isInt(String(formData.Garage || '')) ? formData.Garage : null,
            Stories: validator.isInt(String(formData.Stories || '')) ? formData.Stories : null,
            Roofing: validator.trim(formData.Roofing || ''),
            Available: false, // Set default value for Available
            Comps1: validator.trim(formData.Comps1 || ''),
            Comps2: validator.trim(formData.Comps2 || ''),
            Comps3: validator.trim(formData.Comps3 || '')
        };

        // Require either uploaded image or a valid external URL
        if (!sanitizedFormData.PhotoFile && !(sanitizedFormData.PhotoURL && validator.isURL(sanitizedFormData.PhotoURL, { require_protocol: true }))) {
            const msg = 'Please upload a photo or provide a valid Photo URL (example: https://drive.google.com/...).';
            if (wantsJson) return res.status(400).json({ success: false, error: msg });
            const errorMessage = encodeURIComponent(msg);
            return res.redirect(`${referrer}?errors=${errorMessage}`);
        }

    // Connect to MSSQL
    const pool = await sql.connect(dbConfig);

        // Insert Data into Listings_tbl
        const query = `
            INSERT INTO dbo.listings_tbl (
                Title, FullName, Email, Phone, PropertyAddress, PropertyType,
                Bedrooms, Bathrooms, SquareFootage, AskingPrice,
                Description, ReasonForSelling, SubmitDate, ListerIP, PhotoFile, PhotoURL,
                LotArea, FloorArea, YearBuilt, Garage, Stories, Roofing, Available, Comps1, Comps2, Comps3
            ) VALUES (
                @Title, @FullName, @Email, @Phone, @PropertyAddress, @PropertyType,
                @Bedrooms, @Bathrooms, @SquareFootage, @AskingPrice,
                @Description, @ReasonForSelling, @SubmitDate, @ListerIP, @PhotoFile, @PhotoURL,
                @LotArea, @FloorArea, @YearBuilt, @Garage, @Stories, @Roofing, @Available, @Comps1, @Comps2, @Comps3
            )
        `;

        const result = await pool.request()
            .input('Title', sql.NVarChar, sanitizedFormData.Title)
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
            .input('ListerIP', sql.VarChar, sanitizedFormData.ListerIP)
            .input('PhotoFile', sql.NVarChar, imageFiles)
            .input('PhotoURL', sql.NVarChar, sanitizedFormData.PhotoURL)
            .input('LotArea', sql.Int, sanitizedFormData.LotArea)
            .input('FloorArea', sql.Int, sanitizedFormData.FloorArea)
            .input('YearBuilt', sql.Int, sanitizedFormData.YearBuilt)
            .input('Garage', sql.Int, sanitizedFormData.Garage)
            .input('Stories', sql.Int, sanitizedFormData.Stories)
            .input('Roofing', sql.NVarChar, sanitizedFormData.Roofing)
            .input('Available', sql.Bit, sanitizedFormData.Available)
            .input('Comps1', sql.NVarChar, sanitizedFormData.Comps1)
            .input('Comps2', sql.NVarChar, sanitizedFormData.Comps2)
            .input('Comps3', sql.NVarChar, sanitizedFormData.Comps3)
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

            } catch (error) {
                console.error('Email sending error:', error);
            }
        };

        await sendEmails();

        // Respond with JSON for AJAX clients, otherwise redirect as legacy behavior
        if (wantsJson) {
            return res.json({ success: true, message: 'Listing submitted successfully!' });
        } else {
            const successMessage = encodeURIComponent("Listing submitted successfully!");
            return res.redirect(`${referrer}?success=${successMessage}`);
        }
    } catch (err) {
        console.error(err);
        if (wantsJson) {
            return res.status(500).json({ success: false, error: 'Error saving data to database' });
        }
        const errorMessage = encodeURIComponent("Error saving data to database");
        return res.redirect(`${referrer}?errors=${errorMessage}`);
    } finally {
        try { sql.close(); } catch(e) { console.error('Error closing connection:', e.message); }
    }
});

router.post("/update-availability", async (req, res) => {
    const { listingId, Available } = req.body;

    if (!listingId) {
        return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    try {
        const pool = await sql.connect(dbConfig);
        await pool
            .request()
            .input("listingId", sql.Int, listingId)
            .input("Available", sql.Bit, Available)
            .query("UPDATE listings_tbl SET Available = @Available WHERE listingId = @listingId");

        res.json({ success: true, message: "Availability updated successfully" });
    } catch (error) {
        console.error("Database update error:", error);
        res.status(500).json({ success: false, message: "Database error" });
    } finally {
        try { sql.close(); } catch(e) { console.error('Error closing connection:', e.message); }
    }
});

module.exports = router;
