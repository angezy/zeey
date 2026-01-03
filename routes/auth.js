const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const findUserByEmail = require('../models/User');
const sql = require('mssql');
const dbConfig = require('../config/db');
const { getClientIp } = require('../utils/clientIp');
require('dotenv').config();

router.post('/signin', async (req, res) => {
    const { Email, Password, rememberMe } = req.body;
    const userIP = getClientIp(req); // Retrieve the user's IP address
    const currentDateTime = new Date(); // Current datetime for lastLogin

    try {
       // Find user by email
       const user = await findUserByEmail(Email);
       if (!user) {
           return res.status(400).json({ message: 'Invalid email or password' });
       }
        // Verify the Password
        const isPasswordMatch = await bcrypt.compare(Password, user.Password);
        if (!isPasswordMatch) {
            return res.status(400).json({ message: 'Invalid  or Password' });
        }

        // Update lastLogin and lastIP fields in the database
        const pool = await sql.connect(dbConfig); // Adjust as needed for your dbConfig
        await pool
            .request()
            .input('Email', sql.NVarChar, Email)
            .input('lastLogin', sql.DateTime, currentDateTime)
            .input('lastIP', sql.NVarChar(50), userIP)
            .query(
                'UPDATE dbo.User_tbl SET lastLogin = @lastLogin, lastIP = @lastIP WHERE Email = @Email'
            );

        // Create a JWT token
        const tokenOptions = rememberMe ? { expiresIn: '3d' } : { expiresIn: '11h' };
        const token = jwt.sign({ userId: user.userID }, process.env.JWT_SECRET, tokenOptions);

        // Do not set per-user DB in session (central DB used for now)

        // Set the token in an HTTP-only cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            sameSite: 'Strict',
        });

        res.json({ message: 'Signin successful', token });
    } catch (err) {
        console.error('Error during signin:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Sign up new user (central DB only)
router.post('/signup', async (req, res) => {
    const { name, username, email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'email and password are required' });
    }

    try {
        const pool = await sql.connect(dbConfig);

        // check existing
        const existing = await pool.request().input('Email', sql.NVarChar, email).query('SELECT * FROM dbo.User_tbl WHERE Email = @Email');
        if (existing.recordset && existing.recordset.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // insert into central user table (only Email and Password to avoid schema mismatch)
        await pool.request()
            .input('Email', sql.NVarChar, email)
            .input('Password', sql.NVarChar, hashedPassword)
            .query('INSERT INTO dbo.User_tbl (Email, Password) VALUES (@Email, @Password)');

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Error during signup:', err);
        res.status(500).json({ message: 'Server error' });
    } finally {
        try { sql.close(); } catch(e){}
    }
});


router.post('/signout', (req, res) => {
    try {
        // Clear the authToken cookie
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            sameSite: 'Strict',
        });

        res.status(200).json({ message: 'Sign out successful' });
    } catch (err) {
        console.error('Error during sign out:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
