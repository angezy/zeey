const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.cookies.authToken; // Retrieve token from cookie

    if (!token) {
        return res.redirect('/signin');
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET); // Verify token
        req.user = user; // Attach user info to the request
        next(); // Proceed to the next middleware/route
    } catch (err) {
        console.error('Token verification error:', err);
        res.redirect('/signin');
    }
};

module.exports = authMiddleware;
