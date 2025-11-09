require('dotenv').config();
const axios = require('axios');

const sendPulseConfig = {
  apiUrl: 'https://api.sendpulse.com',
  clientId: process.env.API_ID,
  clientSecret: process.env.API_SECRET,
  senderEmail: process.env.SENDER_EMAIL,
  senderName: process.env.SENDER_NAME ,
};

let accessToken = null;
let tokenExpiry = null;


const getAccessToken = async () => {
  try {
    if (!accessToken || new Date() >= tokenExpiry) {
      const response = await axios.post(`${sendPulseConfig.apiUrl}/oauth/access_token`, {
        grant_type: 'client_credentials',
        client_id: sendPulseConfig.clientId,
        client_secret: sendPulseConfig.clientSecret,
      });

      accessToken = response.data.access_token;
      tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000); // Token expiry time
    }
    return accessToken;
  } catch (error) {
    console.error('Error fetching access token:', error.response?.data || error.message);
    throw new Error('Failed to get access token.');
  }
};

/**
 * Sends an email using SendPulse API.
 */
const sendEmail = async (recipients, subject, text, html, fromName = sendPulseConfig.senderName, fromEmail = sendPulseConfig.senderEmail) => {
  try {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients list is empty or invalid.');
    }

    const toRecipients = recipients.map(({ email, name }) => ({ email, name: name || 'Recipient' }));
    const token = await getAccessToken();

    const response = await axios.post(
      `${sendPulseConfig.apiUrl}/smtp/emails`,
      {
        email: {
          from: { name: fromName|| "info@nickhousebuyer.online", email: fromEmail || process.env.SENDER_EMAIL },
          to: toRecipients,
          subject,
          text,
          html,
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log('Email sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending email:', error.response?.data || error.message);
    throw new Error('Failed to send email.');
  }
};

/**
 * Sends an email using a SendPulse template.
 */
const sendEmailWithTemplate = async (recipients, templateName, variables = {}) => {
  try {
    const token = await getAccessToken();
    const toRecipients = recipients.map(({ email, name }) => ({ email, name }));

    // Some SendPulse setups require a subject even when using a template.
    // Use variables.subject if provided, otherwise fall back to a sensible default.
    const subject = variables.subject || `Message from ${sendPulseConfig.senderName}`;

    const templateField = {};
    // If templateName looks like a numeric id, send as template.id (required by some SendPulse setups)
    if (/^\d+$/.test(String(templateName))) {
      templateField.id = Number(templateName);
    } else {
      templateField.name = templateName;
    }

    const payload = {
      email: {
        from: {
          name: sendPulseConfig.senderName,
          email: sendPulseConfig.senderEmail,
        },
        to: toRecipients,
        subject,
        template: Object.assign({}, templateField, { variables }),
      },
    };

    const response = await axios.post(`${sendPulseConfig.apiUrl}/smtp/emails`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log('Template email sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending template email:', error.response?.data || error.message);
    throw new Error('Failed to send email with template.');
  }
};

module.exports = { sendEmail, sendEmailWithTemplate };
