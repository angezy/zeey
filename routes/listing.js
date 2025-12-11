const express = require('express');
const sql = require('mssql');
// use central DB connection
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
require('dotenv').config();
const dbConfig = require('../config/db');

// Configure multer for multiple file uploads
const uploadDir = path.join(__dirname, '..', 'public', 'images', 'uploads');
// Ensure upload directory exists even when PM2 runs the app from a different CWD
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Use absolute path so PM2/daemonized runs work reliably
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
// Increase limits to avoid 413 rejections for larger photos
const MAX_PHOTOS = 60; // allow up to 60 photos (was 30)
const uploadLimits = {
    files: MAX_PHOTOS,
    fileSize: 15 * 1024 * 1024 // 15 MB per file to stay within common proxy/CDN caps
};
const upload = multer({ storage, limits: uploadLimits }).array('PhotoFiles', MAX_PHOTOS); // Allow up to 30 photos
const uploadEdit = multer({ storage, limits: uploadLimits }).array('PhotoFiles', MAX_PHOTOS); // For edit/update

const normalizeStoredPhotoPath = (input) => {
    if (!input && input !== 0) return '';
    let str = String(input).trim().replace(/\\/g, '/');
    if (!str) return '';
    if (/^https?:\/\//i.test(str)) return str;
    return str.replace(/^\/+/, '');
};

// Multer wrapper to capture upload errors and attach requestId early
const handleListingUpload = (req, res, next) => {
    req.requestId = req.requestId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    upload(req, res, (err) => {
        if (err) {
            console.error(`[listing][${req.requestId}] Multer/upload error:`, err);
            const wantsJson = !(req.headers.accept || '').includes('text/html') || (req.headers.accept || '').includes('application/json');
            const message = err.message || 'Upload error';
            if (wantsJson) return res.status(400).json({ success: false, error: message, requestId: req.requestId });
            const errorMessage = encodeURIComponent(message);
            return res.redirect(`${req.get('Referer') || '/'}?errors=${errorMessage}&requestId=${encodeURIComponent(req.requestId)}`);
        }
        next();
    });
};

// POST route for listing form submission
router.post('/listing', handleListingUpload, async (req, res) => {
    const requestId = req.requestId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const formData = (req.session && req.session.formData) || req.body;
    const referrer = req.get('Referer') || '/';
    const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Handle multiple files
    const imageFiles = req.files ? req.files.map(file => `public/images/uploads/${file.filename}`).join(',') : null;
    console.log(`[listing][${requestId}] Incoming submission from IP ${userIP}`);
    console.log(`[listing][${requestId}] Body keys:`, Object.keys(formData || {}));
    console.log(`[listing][${requestId}] Uploaded files:`, (req.files || []).map(f => ({
        fieldname: f.fieldname,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        path: f.path
    })));

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
        console.log(`[listing][${requestId}] normalizedPhotoUrl=`, normalizedPhotoUrl);
        console.log(`[listing][${requestId}] decodedImageFiles=`, decodedImageFiles);

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
        console.log(`[listing][${requestId}] sanitizedFormData preview:`, {
            Title: sanitizedFormData.Title,
            FullName: sanitizedFormData.FullName,
            Email: sanitizedFormData.Email,
            PhotoFile: sanitizedFormData.PhotoFile,
            PhotoURL: sanitizedFormData.PhotoURL,
            LotArea: sanitizedFormData.LotArea,
            FloorArea: sanitizedFormData.FloorArea
        });

        // Optional photos: warn if missing but do not block submission
        if (!sanitizedFormData.PhotoFile && !sanitizedFormData.PhotoURL) {
            console.warn(`[listing][${requestId}] No photo file or URL provided; continuing without images.`);
        }

    // Connect to MSSQL
    console.log(`[listing][${requestId}] Connecting to SQL...`);
    const pool = await sql.connect(dbConfig);
    console.log(`[listing][${requestId}] SQL connected.`);

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
            .input('PhotoFile', sql.NVarChar, sanitizedFormData.PhotoFile)
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
        console.log(`[listing][${requestId}] Insert OK, new record id (if available):`, result.recordset && result.recordset[0]);

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
        console.error(`[listing][${requestId}] Error during submission:`, err && err.stack ? err.stack : err);
        // Surface a bit more detail to clients for debugging (still generic for HTML flow)
        if (wantsJson) {
            return res.status(500).json({
                success: false,
                error: err && err.message ? err.message : 'Error saving data to database',
                requestId
            });
        }
        const errorMessage = encodeURIComponent("Error saving data to database");
        return res.redirect(`${referrer}?errors=${errorMessage}&requestId=${encodeURIComponent(requestId)}`);
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

const handleListingDelete = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) {
        return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool
            .request()
            .input("listingId", sql.Int, id)
            .query("DELETE FROM listings_tbl WHERE listingId = @listingId");

        const rows = result.rowsAffected && result.rowsAffected[0] ? result.rowsAffected[0] : 0;
        if (rows === 0) {
            return res.status(404).json({ success: false, message: "Listing not found" });
        }
        return res.json({ success: true, message: "Listing deleted" });
    } catch (error) {
        console.error("Delete listing error:", error);
        return res.status(500).json({ success: false, message: "Database error" });
    } finally {
        try { sql.close(); } catch(e) { console.error('Error closing connection:', e.message); }
    }
};

// DELETE endpoints (both DELETE verb and POST fallback for hosts that block DELETE)
router.delete("/listing/:id", handleListingDelete);
router.post("/listing/:id/delete", handleListingDelete);

const handleListingUpdate = (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, message: "Invalid listing ID" });

    // allow multipart with optional file
    uploadEdit(req, res, async (err) => {
        if (err) {
            console.error("Update listing upload error:", err);
            return res.status(400).json({ success: false, message: err.message || "Upload error" });
        }

        const body = req.body || {};
        const uploadedPhotos = (req.files || []).map(file => normalizeStoredPhotoPath(path.join('public', 'images', 'uploads', file.filename))).filter(Boolean);

        try {
            const pool = await sql.connect(dbConfig);
            // fetch existing to preserve missing fields
            const existingResult = await pool.request()
                .input("listingId", sql.Int, id)
                .query("SELECT * FROM listings_tbl WHERE listingId = @listingId");
            const existing = (existingResult.recordset || [])[0];
            if (!existing) return res.status(404).json({ success: false, message: "Listing not found" });

            const existingPhotos = existing.PhotoFile
                ? existing.PhotoFile.split(',').map(normalizeStoredPhotoPath).filter(Boolean)
                : [];
            const submittedPhotos = body.PhotoFile !== undefined
                ? String(body.PhotoFile).split(',').map(normalizeStoredPhotoPath).filter(Boolean)
                : existingPhotos.slice();
            const combinedPhotos = uploadedPhotos.length
                ? submittedPhotos.concat(uploadedPhotos)
                : submittedPhotos;
            const uniquePhotos = [];
            const seen = new Set();
            combinedPhotos.forEach(photo => {
                if (!photo) return;
                if (seen.has(photo)) return;
                seen.add(photo);
                uniquePhotos.push(photo);
            });
            const photoFileValue = uniquePhotos.length ? uniquePhotos.join(',') : null;

            const upd = {
                Title: body.Title !== undefined ? body.Title : existing.Title,
                PropertyAddress: body.PropertyAddress !== undefined ? body.PropertyAddress : existing.PropertyAddress,
                AskingPrice: body.AskingPrice !== undefined && body.AskingPrice !== '' ? Number(body.AskingPrice) : existing.AskingPrice,
                Bedrooms: body.Bedrooms !== undefined && body.Bedrooms !== '' ? Number(body.Bedrooms) : existing.Bedrooms,
                Bathrooms: body.Bathrooms !== undefined && body.Bathrooms !== '' ? Number(body.Bathrooms) : existing.Bathrooms,
                SquareFootage: body.SquareFootage !== undefined && body.SquareFootage !== '' ? Number(body.SquareFootage) : existing.SquareFootage,
                PhotoURL: body.PhotoURL !== undefined ? body.PhotoURL : existing.PhotoURL,
                PhotoFile: photoFileValue,
                Available: body.Available !== undefined ? Number(body.Available) : existing.Available,
                Description: body.Description !== undefined ? body.Description : existing.Description
            };

            const result = await pool.request()
                .input("listingId", sql.Int, id)
                .input("Title", sql.NVarChar, upd.Title)
                .input("PropertyAddress", sql.NVarChar, upd.PropertyAddress)
                .input("AskingPrice", sql.Money, upd.AskingPrice)
                .input("Bedrooms", sql.Int, upd.Bedrooms)
                .input("Bathrooms", sql.Int, upd.Bathrooms)
                .input("SquareFootage", sql.Int, upd.SquareFootage)
                .input("PhotoURL", sql.NVarChar, upd.PhotoURL)
                .input("PhotoFile", sql.NVarChar, upd.PhotoFile)
                .input("Available", sql.Bit, upd.Available)
                .input("Description", sql.NVarChar, upd.Description)
                .query(`
                    UPDATE listings_tbl
                    SET Title=@Title,
                        PropertyAddress=@PropertyAddress,
                        AskingPrice=@AskingPrice,
                        Bedrooms=@Bedrooms,
                        Bathrooms=@Bathrooms,
                        SquareFootage=@SquareFootage,
                        PhotoURL=@PhotoURL,
                        PhotoFile=@PhotoFile,
                        Available=@Available,
                        Description=@Description
                    WHERE listingId=@listingId
                `);

            const rows = result.rowsAffected && result.rowsAffected[0] ? result.rowsAffected[0] : 0;
            if (rows === 0) return res.status(404).json({ success: false, message: "Listing not found" });

            return res.json({ success: true, message: "Listing updated", listing: { listingId: id, ...upd } });
        } catch (error) {
            console.error("Update listing error:", error);
            return res.status(500).json({ success: false, message: "Database error" });
        } finally {
            try { sql.close(); } catch(e) { console.error('Error closing connection:', e.message); }
        }
    });
};

// PUT endpoint plus POST fallback for environments that block PUT
router.put("/listing/:id", handleListingUpdate);
router.post("/listing/:id/update", handleListingUpdate);

module.exports = router;
