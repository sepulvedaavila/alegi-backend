// services/email.service.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Use environment variables for email configuration
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Fallback to console logging in development
      console.warn('Email service not configured - emails will be logged to console');
    }
  }

  async sendCaseProcessedNotification(caseId, caseData) {
    try {
      const emailContent = {
        from: process.env.FROM_EMAIL || 'noreply@alegi.io',
        to: caseData.user_email || 'admin@alegi.io',
        subject: `Case Processing Complete - ${caseData.case_name}`,
        html: `
          <h2>Case Processing Complete</h2>
          <p>Your case has been successfully processed by our AI system.</p>
          <p><strong>Case ID:</strong> ${caseId}</p>
          <p><strong>Case Name:</strong> ${caseData.case_name}</p>
          <p><strong>Status:</strong> Processing Complete</p>
          <p>You can now view the AI analysis and predictions in your dashboard.</p>
          <p>Visit <a href="${process.env.FRONTEND_URL || 'https://app.alegi.io'}">Alegi Dashboard</a> to see the results.</p>
        `
      };

      if (this.transporter) {
        await this.transporter.sendMail(emailContent);
        console.log(`Email sent for case ${caseId}`);
      } else {
        console.log('Email would be sent:', emailContent);
      }
    } catch (error) {
      console.error('Email sending failed:', error);
      // Don't throw error to prevent queue failure
    }
  }

  async sendDocumentProcessedNotification(caseId, documentName) {
    try {
      const emailContent = {
        from: process.env.FROM_EMAIL || 'noreply@alegi.io',
        subject: `Document Processed - ${documentName}`,
        html: `
          <h2>Document Processing Complete</h2>
          <p>Your document has been successfully processed.</p>
          <p><strong>Document:</strong> ${documentName}</p>
          <p><strong>Case ID:</strong> ${caseId}</p>
          <p>The document has been analyzed and added to your case.</p>
        `
      };

      if (this.transporter) {
        await this.transporter.sendMail(emailContent);
        console.log(`Document notification sent for case ${caseId}`);
      } else {
        console.log('Document email would be sent:', emailContent);
      }
    } catch (error) {
      console.error('Document email sending failed:', error);
    }
  }
}

module.exports = new EmailService();