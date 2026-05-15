const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore }       = require('firebase-admin/firestore');
const nodemailer             = require('nodemailer');

initializeApp();

// Configurer le transporteur SMTP (ex. Gmail via App Password)
// Définir les variables dans Firebase Secret Manager :
//   firebase functions:secrets:set SMTP_USER
//   firebase functions:secrets:set SMTP_PASS
const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.sendContactEmail = onCall(
  {
    region:  'europe-west1',
    secrets: ['SMTP_USER', 'SMTP_PASS'],
  },
  async (request) => {
    const { prenom, nom, email, societe, sujet, message } = request.data;

    // Validation basique côté serveur
    if (!prenom || !nom || !email || !sujet || !message) {
      throw new HttpsError('invalid-argument', 'Champs manquants');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Email invalide');
    }

    const mailOptions = {
      from:    `"Seemsharp Website" <${process.env.SMTP_USER}>`,
      to:      'contact@seemsharp.com',
      replyTo: email,
      subject: `[Contact] ${sujet} – ${prenom} ${nom}`,
      html: `
        <h2>Nouveau message de contact</h2>
        <table cellpadding="8" style="border-collapse:collapse;width:100%">
          <tr><td><strong>Nom</strong></td><td>${prenom} ${nom}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Société</strong></td><td>${societe || '–'}</td></tr>
          <tr><td><strong>Sujet</strong></td><td>${sujet}</td></tr>
          <tr><td><strong>Message</strong></td><td>${message.replace(/\n/g, '<br>')}</td></tr>
        </table>
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  }
);
