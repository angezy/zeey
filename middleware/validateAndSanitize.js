const { body, validationResult } = require('express-validator');
const path = require('path');

const validateAndSanitize = [
  // Basic Information
  body('FullName').trim().notEmpty().withMessage('Full name is required.'),
  body('CellPhone').trim().isMobilePhone().withMessage('Valid phone number is required.'),
  body('Email').isEmail().withMessage('Valid email address is required.'),
  body('Address').trim().notEmpty().withMessage('Address is required.'),

  // Business Information
  body('CompanyName').optional({ checkFalsy: true }).trim().escape(),
  body('Website').optional({ checkFalsy: true }).isURL().withMessage('Invalid website URL.'),

  // Business Metrics
  body('YearsInBusiness').isInt({ min: 0 }).withMessage('Years in business is required and must be a non-negative number.'),
  body('CompletedProjects').isInt({ min: 0 }).withMessage('Completed projects is required and must be a non-negative number.'),
  body('CurrentProjects').trim().escape().notEmpty().withMessage('Current projects is required.'),

  // Future Planning
  body('PropertiesNext6Months').isInt({ min: 0 }).withMessage('Properties in the next 6 months is required and must be a non-negative number.'),
  body('PropertiesPerYear').isInt({ min: 0 }).withMessage('Properties per year is required and must be a non-negative number.'),

  // Financial Details
  body('SourceFinancing')
    .toArray()
    .custom((vals) => {
      const allowed = ['Cash on Hand', 'Hard Money', 'Private Money', 'Traditional', 'JV Partner', 'Seller Financing', 'Subject To', 'Other'];
      if (!Array.isArray(vals) || vals.length === 0) return false;
      return vals.every(v => allowed.includes(v));
    })
    .withMessage('Valid financing source is required.'),
  body('FundingInPlace').isIn(['Yes', 'No']).withMessage('Funding in place status is required.'),
  body('ProofOfFunds').isIn(['Yes', 'No']).withMessage('Proof of funds status is required.'),
  body('ProofOfFundsFile').optional().trim().escape(),

  // Investment Preferences
  body('TripleDeals').isIn(['Yes', 'No', 'Maybe']).withMessage('Triple deals preference is required.'),
  body('Quickly').isIn(['One Day', 'Within a Week','Within Two Weeks' ,'Within a Month' ,'Over a Month' ,'Other Timeline']).withMessage('Quick sale preference is required.'),
  body('PriceRanges').trim().escape().notEmpty().withMessage('Price ranges are required.'),
  body('MinimumProfit').trim().escape().notEmpty().withMessage('Minimum profit is required.'),

  // Area and Property Preferences
  body('GoodDealCriteria').trim().escape().notEmpty().withMessage('Good deal criteria are required.'),
  body('PreferredAreas').trim().escape().notEmpty().withMessage('Preferred areas are required.'),
  body('AvoidedAreas').trim().escape().notEmpty().withMessage('Avoided areas are required.'),
  body('PropertyType').toArray().isArray().withMessage('Property type is required.'),
  body('WorkType').toArray().isArray().withMessage('Work type is required.'),
  body('MaxPropertyAge').isInt({ min: 0 }).withMessage('Maximum property age is required and must be a non-negative number.'),
  body('Mins').optional().trim().escape(),
  body('IdealProperty').trim().escape().notEmpty().withMessage('Ideal property details are required.'),

  // Strategy and Readiness
  body('InvestmentStrategy').isIn(['Rehab and Resell', 'Buy and Hold']).withMessage('Valid investment strategy is required.'),
  body('PurchaseReadiness').optional().isInt({ min: 1, max: 10 }).withMessage('Purchase readiness must be between 1 and 10.'),

  // Additional Comments
  body('AdditionalComments').optional().trim().escape(),

  // Middleware to handle validation errors
  (req, res, next) => {
    const referrer = req.get('Referer');
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      const errorMessages = errors.array().map(error => error.msg);
      const formData = req.body || {};

      // If multer has placed a file on req.file, include its stored relative path so the client
      // can show a preview or link. Note: browsers do not allow setting input[type=file] values,
      // so we include a separate indicator for previously uploaded files.
      try {
        if (req.file && req.file.filename) {
          formData.ProofOfFundsFile = path.join('public', 'uploaded', req.file.filename).replace(/\\/g, '/');
        }
      } catch (e) {
        // ignore
      }

      // Normalize / derive price range pieces so client can restore sliders reliably
      try {
        // If a PriceRanges string exists, try to parse numbers
        if (formData.PriceRanges && typeof formData.PriceRanges === 'string') {
          const nums = (formData.PriceRanges.match(/\d+/g) || []).map(n => parseInt(n, 10));
          if (nums.length >= 2) {
            formData.PriceRangesMin = nums[0];
            formData.PriceRangesMax = nums[1];
            formData.PriceRanges = `${formData.PriceRangesMin} - ${formData.PriceRangesMax}`;
          }
        } else {
          // If client separately posted min/max fields, normalize them into PriceRanges
          const minRaw = formData.PriceRangesMin || formData.priceMin || '';
          const maxRaw = formData.PriceRangesMax || formData.priceMax || '';
          const min = parseInt(String(minRaw).replace(/[^0-9]/g, ''), 10);
          const max = parseInt(String(maxRaw).replace(/[^0-9]/g, ''), 10);
          if (!isNaN(min) && !isNaN(max)) {
            formData.PriceRangesMin = min;
            formData.PriceRangesMax = max;
            formData.PriceRanges = `${min} - ${max}`;
          }
        }
      } catch (e) {
        // don't block saving session if parsing fails
      }

      // Save form values and detailed errors in session so client can restore them via the restore endpoint
      try {
        if (req.session) {
          req.session.cbForm = { values: formData, errors: errors.array() };
          // (debug logs removed)
        }
      } catch (e) {
        console.error('Could not save validation data to session:', e.message);
      }

      // Redirect back to referrer with minimal errors indicator (client will fetch full details from session)
      const ref = referrer || '/forms/Cash-Buyer';
      const encoded = encodeURIComponent(JSON.stringify(errorMessages));
      return res.redirect(`${ref}?errors=${encoded}`);
    }

    next();
  },
];

module.exports = validateAndSanitize;
