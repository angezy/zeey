const express = require('express');
const router = express.Router();
const { sendEmail } = require('../models/mailer');
const bodyParser = require('body-parser');

// Middleware to parse form data
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

// Handle POST request for contact form submission
router.post('/contactus', async (req, res) => {
  console.log('Incoming request body:', req.body); // Log the incoming request body
  try {
    const { FullName, Email, subject, message } = req.body;

    // Validate required fields
    if (!FullName || !Email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Prepare email content
    const recipients = [{ name: 'Recipient', email: process.env.RECIPIENT_EMAIL1}];
    const emailSubject = `New Contact Form Submission from ${FullName}`;
    const emailText = `Name: ${FullName}\nEmail: ${Email}\nMessage: ${message}`;
    const emailHtml = `
      <p><strong>Name:</strong> ${FullName}</p>
      <p><strong>Email:</strong> ${Email}</p>
      <p><strong>subject:</strong> ${subject}</p>
      <p><strong>Message:</strong> ${message}</p>
    `;

    // Send email using the mailer.js module
    await sendEmail(recipients, emailSubject, emailText, emailHtml);

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
