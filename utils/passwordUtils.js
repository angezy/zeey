const bcrypt = require('bcryptjs');

// Function to hash a password
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10); // Generate a salt with 10 rounds
    return await bcrypt.hash(password, salt); // Hash the password
}

// Function to verify a password
async function verifyPassword(inputPassword, hashedPassword) {
    return await bcrypt.compare(inputPassword, hashedPassword);
}

module.exports = {
    hashPassword,
    verifyPassword
};
