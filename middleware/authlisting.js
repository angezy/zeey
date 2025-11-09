const { body, validationResult } = require('express-validator');

const listingauth = [
  // Basic Information
  body('FullName').trim().isLength({ min: 1, max: 255 }).withMessage('FullName is required and must be between 1 and 255 characters'),
  body('Email').trim().isEmail().withMessage('Email is invalid'),
  body('Phone').trim().isLength({ min: 1, max: 20 }).withMessage('Phone is required and must be between 1 and 20 characters'),
  body('PropertyAddress').trim().isLength({ min: 1, max: 255 }).withMessage('PropertyAddress is required and must be between 1 and 255 characters'),
  body('PropertyType').trim().isLength({ min: 1, max: 255 }).withMessage('PropertyType is required and must be between 1 and 255 characters'),
  body('Bedrooms').trim().isInt().withMessage('Bedrooms must be an integer'),
  body('Bathrooms').trim().isInt().withMessage('Bathrooms must be an integer'),
  body('AskingPrice').trim().isFloat().withMessage('AskingPrice must be a float'),
  body('Description').trim().isLength({ min: 1, max: 255 }).withMessage('Description is required and must be between 1 and 255 characters'),
  body('ReasonForSelling').trim().isLength({ min: 1, max: 255 }).withMessage('ReasonForSelling is required and must be between 1 and 255 characters'),
  // Middleware to handle validation errors
  (req, res, next) => {
    const referrer = req.get('Referer');
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      const errorMessages = errors.array().map(error => error.msg);
      const formData = req.body;
      const query = new URLSearchParams({
        errors: JSON.stringify(errorMessages),
        ...formData,
      }).toString();

      return res.redirect(`${referrer}?${query}`);
    }

    next();
  },
];

module.exports = listingauth;
