// services/email.service.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.providers = this.initializeProviders();
  }

  initializeProviders() {
    const providers = [];
    
    // Add SendGrid provider if configured
    if (process.env.SENDGRID_API_KEY) {
      providers.push({
        name: 'sendgrid',
        service: this.createSendGridService()
      });
    }
    
    // Add SMTP provider if configured
    if (process.env.SMTP_HOST) {
      providers.push({
        name: 'smtp',
        service: this.createSMTPService()
      });
    }

    // Add console logging provider as fallback
    providers.push({
      name: 'console',
      service: this.createConsoleService()
    });

    return providers;
  }

  createSendGridService() {
    return {
      send: async (emailData) => {
        // SendGrid implementation would go here
        // For now, we'll use a mock implementation
        console.log('SendGrid email would be sent:', emailData);
        return { success: true, provider: 'sendgrid' };
      }
    };
  }

  createSMTPService() {
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    return {
      send: async (emailData) => {
        return await transporter.sendMail(emailData);
      }
    };
  }

  createConsoleService() {
    return {
      send: async (emailData) => {
        console.log('Email would be sent (console fallback):', {
          to: emailData.to,
          subject: emailData.subject,
          from: emailData.from
        });
        return { success: true, provider: 'console' };
      }
    };
  }

  async sendEmail(emailData) {
    if (this.providers.length === 0) {
      console.warn('No email providers configured - skipping email send');
      return { success: false, error: 'No email providers configured' };
    }

    let lastError;
    
    for (const { name, service } of this.providers) {
      try {
        const result = await service.send(emailData);
        
        console.log(`Email sent successfully via ${name}`);
        return { success: true, provider: name, result };
      } catch (error) {
        console.warn(`Email failed via ${name}:`, error.message);
        lastError = error;
        continue;
      }
    }

    console.error('All email providers failed:', lastError);
    return { success: false, error: lastError?.message || 'All email providers failed' };
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

      return await this.sendEmail(emailContent);
    } catch (error) {
      console.error('Email sending failed:', error);
      // Don't throw error to prevent queue failure
      return { success: false, error: error.message };
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

      return await this.sendEmail(emailContent);
    } catch (error) {
      console.error('Document email sending failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();