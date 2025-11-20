const express = require('express');
const sql = require('mssql');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const router = express.Router();
require('dotenv').config();
const dbConfig = require('../config/db');
const { sendEmail } = require('../models/mailer');

const normalizeCheckbox = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return value === 'true' || value === 'on' || value === '1';
    }
    return false;
};

const parseDateInput = (value) => {
    if (!value) return new Date();
    const candidate = new Date(value);
    if (isNaN(candidate.getTime())) return new Date();
    return candidate;
};

router.post(
    '/property-finder',
    [
        body('fullName').trim().isLength({ min: 2 }).withMessage('Full name is required'),
        body('email').optional({ checkFalsy: true }).isEmail().withMessage('Please enter a valid email').normalizeEmail(),
        body('phone').optional({ checkFalsy: true }).trim().isLength({ min: 7 }).withMessage('Enter a valid phone'),
        body('marketFocus').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Market focus is too long'),
        body('experience').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Experience description too long'),
        body('strategy').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Strategy description too long'),
        body('motivation').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Motivation is too long'),
        body('rewardGoal').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Reward goal is too long'),
        body('telegramHandle').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Telegram handle too long'),
        body('acceptedRules').custom((value) => normalizeCheckbox(value)).withMessage('Please confirm you reviewed the guide'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const payload = req.body || {};
        const userIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';

        const sanitizedData = {
            fullName: validator.trim(payload.fullName || ''),
            email: payload.email ? validator.normalizeEmail(payload.email) : '',
            phone: validator.trim(payload.phone || ''),
            telegramHandle: validator.trim(payload.telegramHandle || ''),
            marketFocus: validator.trim(payload.marketFocus || ''),
            experience: validator.trim(payload.experience || ''),
            strategy: validator.trim(payload.strategy || ''),
            motivation: validator.trim(payload.motivation || ''),
            rewardGoal: validator.trim(payload.rewardGoal || ''),
            joinTelegram: normalizeCheckbox(payload.joinTelegram),
            acceptedRules: true,
            submitDate: new Date().toISOString(),
            applicantIP: userIP,
        };

        try {
            const pool = await sql.connect(dbConfig);
            await pool
                .request()
                .input('FullName', sql.NVarChar, sanitizedData.fullName)
                .input('Email', sql.NVarChar, sanitizedData.email)
                .input('Phone', sql.NVarChar, sanitizedData.phone)
                .input('TelegramHandle', sql.NVarChar, sanitizedData.telegramHandle)
                .input('MarketFocus', sql.NVarChar, sanitizedData.marketFocus)
                .input('ExperienceLevel', sql.NVarChar, sanitizedData.experience)
                .input('DealStrategy', sql.NVarChar, sanitizedData.strategy)
                .input('Motivation', sql.NVarChar, sanitizedData.motivation)
                .input('PreferredReward', sql.NVarChar, sanitizedData.rewardGoal)
                .input('JoinTelegram', sql.Bit, sanitizedData.joinTelegram ? 1 : 0)
                .input('SubmitDate', sql.DateTime, sanitizedData.submitDate)
                .input('ApplicantIP', sql.VarChar, sanitizedData.applicantIP)
                .query(`
                    INSERT INTO dbo.birddog_leads (
                        FullName,
                        Email,
                        Phone,
                        TelegramHandle,
                        MarketFocus,
                        ExperienceLevel,
                        DealStrategy,
                        Motivation,
                        PreferredReward,
                        JoinTelegram,
                        SubmitDate,
                        ApplicantIP
                    ) VALUES (
                        @FullName,
                        @Email,
                        @Phone,
                        @TelegramHandle,
                        @MarketFocus,
                        @ExperienceLevel,
                        @DealStrategy,
                        @Motivation,
                        @PreferredReward,
                        @JoinTelegram,
                        @SubmitDate,
                        @ApplicantIP
                    )
                `);

            // Notify admin via email (best-effort)
            try {
                const adminRecipients = [{ email: process.env.RECIPIENT_EMAIL1, name: 'Admin' }].filter(r => !!r.email);
                if (adminRecipients.length) {
                    const subject = 'New Bird Dog / Property Finder Application';
                    const html = `
                        <h3>New Property Finder Lead</h3>
                        <ul>
                            <li><strong>Name:</strong> ${sanitizedData.fullName}</li>
                            <li><strong>Email:</strong> ${sanitizedData.email || 'N/A'}</li>
                            <li><strong>Phone:</strong> ${sanitizedData.phone || 'N/A'}</li>
                            <li><strong>Market Focus:</strong> ${sanitizedData.marketFocus || 'N/A'}</li>
                            <li><strong>Experience:</strong> ${sanitizedData.experience || 'N/A'}</li>
                            <li><strong>Strategy:</strong> ${sanitizedData.strategy || 'N/A'}</li>
                            <li><strong>Reward Goal:</strong> ${sanitizedData.rewardGoal || 'N/A'}</li>
                            <li><strong>Telegram Handle:</strong> ${sanitizedData.telegramHandle || 'N/A'}</li>
                            <li><strong>Motivation:</strong> ${sanitizedData.motivation || 'N/A'}</li>
                            <li><strong>Join Telegram?:</strong> ${sanitizedData.joinTelegram ? 'Yes' : 'No'}</li>
                            <li><strong>IP:</strong> ${sanitizedData.applicantIP || 'N/A'}</li>
                        </ul>
                    `;
                    await sendEmail(adminRecipients, subject, '', html);
                }
            } catch (mailErr) {
                console.error('[property-finder] Email notification failed:', mailErr.message);
            }

            return res.json({
                success: true,
                message: 'Thanks! You are on the list. Jump into the Telegram HQ to start hunting deals.',
                next: '/property-finder/agreement'
            });
        } catch (err) {
            console.error('[property-finder] Submission error:', err);
            return res.status(500).json({
                success: false,
                error: 'Unable to save your submission right now. Please try again later.',
            });
        } finally {
            try { sql.close(); } catch (e) { console.error('Error closing connection:', e.message); }
        }
    }
);

router.post(
    '/property-finder/contract',
    [
        body('fullName').trim().isLength({ min: 2 }).withMessage('Full name is required'),
        body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
        body('phone').trim().isLength({ min: 7 }).withMessage('Phone number required'),
        body('street').trim().isLength({ min: 3 }).withMessage('Street address required'),
        body('city').trim().notEmpty().withMessage('City is required'),
        body('state').trim().notEmpty().withMessage('State is required'),
        body('zip').trim().notEmpty().withMessage('ZIP/Postal code is required'),
        body('agreementDate').isISO8601().withMessage('Date must be valid'),
        body('signatureName').trim().isLength({ min: 2 }).withMessage('Signature is required'),
        body('acceptTerms').custom(value => normalizeCheckbox(value)).withMessage('You must accept the agreement'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const payload = req.body || {};
        const userIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
        const agreementDate = parseDateInput(payload.agreementDate);
        const submitDate = new Date();

        const sanitizedData = {
            fullName: validator.trim(payload.fullName || ''),
            email: payload.email ? validator.normalizeEmail(payload.email) : '',
            phone: validator.trim(payload.phone || ''),
            street: validator.trim(payload.street || ''),
            city: validator.trim(payload.city || ''),
            state: validator.trim(payload.state || ''),
            zip: validator.trim(payload.zip || ''),
            agreementDate,
            signatureName: validator.trim(payload.signatureName || ''),
            acceptTerms: true,
            applicantIP: userIP,
            submitDate,
        };

        try {
            const pool = await sql.connect(dbConfig);
            await pool
                .request()
                .input('FullName', sql.NVarChar, sanitizedData.fullName)
                .input('Email', sql.NVarChar, sanitizedData.email)
                .input('Phone', sql.NVarChar, sanitizedData.phone)
                .input('Street', sql.NVarChar, sanitizedData.street)
                .input('City', sql.NVarChar, sanitizedData.city)
                .input('State', sql.NVarChar, sanitizedData.state)
                .input('Zip', sql.NVarChar, sanitizedData.zip)
                .input('AgreementDate', sql.DateTime, sanitizedData.agreementDate)
                .input('SignatureName', sql.NVarChar, sanitizedData.signatureName)
                .input('AcceptedTerms', sql.Bit, sanitizedData.acceptTerms ? 1 : 0)
                .input('SubmitDate', sql.DateTime, sanitizedData.submitDate)
                .input('ApplicantIP', sql.VarChar, sanitizedData.applicantIP)
                .query(`
                    INSERT INTO dbo.birddog_contracts (
                        FullName,
                        Email,
                        Phone,
                        Street,
                        City,
                        State,
                        Zip,
                        AgreementDate,
                        SignatureName,
                        AcceptedTerms,
                        SubmitDate,
                        ApplicantIP
                    ) VALUES (
                        @FullName,
                        @Email,
                        @Phone,
                        @Street,
                        @City,
                        @State,
                        @Zip,
                        @AgreementDate,
                        @SignatureName,
                        @AcceptedTerms,
                        @SubmitDate,
                        @ApplicantIP
                    )
                `);

            try {
                const adminRecipients = [{ email: process.env.RECIPIENT_EMAIL1, name: 'Admin' }].filter(r => !!r.email);
                if (adminRecipients.length) {
                    const subject = 'New Independent Contractor Agreement signed';
                    const html = `
                        <h3>Independent Contractor Agreement</h3>
                        <ul>
                            <li><strong>Name:</strong> ${sanitizedData.fullName}</li>
                            <li><strong>Email:</strong> ${sanitizedData.email}</li>
                            <li><strong>Phone:</strong> ${sanitizedData.phone}</li>
                            <li><strong>Address:</strong> ${sanitizedData.street}, ${sanitizedData.city}, ${sanitizedData.state} ${sanitizedData.zip}</li>
                            <li><strong>Date:</strong> ${sanitizedData.agreementDate.toISOString()}</li>
                            <li><strong>Signature:</strong> ${sanitizedData.signatureName}</li>
                        </ul>
                    `;
                    await sendEmail(adminRecipients, subject, '', html);
                }
            } catch (mailErr) {
                console.error('[property-finder-contract] Email notification failed:', mailErr.message);
            }

            return res.json({
                success: true,
                message: 'Agreement received. We will reach out with next steps.',
            });
        } catch (err) {
            console.error('[property-finder-contract] Submission error:', err);
            return res.status(500).json({
                success: false,
                error: 'Unable to save your agreement right now. Please try again later.',
            });
        } finally {
            try { sql.close(); } catch (e) { console.error('Error closing connection:', e.message); }
        }
    }
);

module.exports = router;
