const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Get address from the form data and sanitize it for folder name
        const address = req.body.PropertyAddress || 'unknown';
        const sanitizedAddress = address
            .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric chars with underscore
            .toLowerCase();
        
        // Create base upload directory if it doesn't exist
        const baseDir = path.join(__dirname, '../public/uploads/properties');
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        
        // Create property-specific directory
        const propertyDir = path.join(baseDir, sanitizedAddress);
        if (!fs.existsSync(propertyDir)) {
            fs.mkdirSync(propertyDir, { recursive: true });
        }
        
        cb(null, propertyDir);
    },
    filename: function (req, file, cb) {
        // Create unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        // Increase per-file size to 50 MB; combined with 10 files this keeps total under nginx/app limits
        fileSize: 50 * 1024 * 1024,
        files: 10 // Maximum 10 files
    }
});

module.exports = upload;
