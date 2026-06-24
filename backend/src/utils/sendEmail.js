import { AppError } from '../errors/index.js';
import { logger } from '../common/logger.js';
import { env } from '../config/index.js';
import { getEmailFromAddress, getEmailProvider, smtpTransport } from '../config/smtp.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function withTimeout(promise, timeoutMs) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AppError('Email delivery timed out', 503, 'EMAIL_SEND_TIMEOUT', { timeoutMs }));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function parseSender(fromAddress) {
  const match = String(fromAddress || '').match(/^(.*?)<([^>]+)>$/);
  if (!match) {
    return { email: String(fromAddress || '').trim() };
  }

  return {
    name: match[1].trim().replace(/^"|"$/g, ''),
    email: match[2].trim(),
  };
}

async function sendWithBrevoApi({ to, subject, text, html }) {
  if (!env.BREVO_API_KEY || !getEmailFromAddress()) {
    throw new AppError('Email service is not configured', 503, 'EMAIL_SERVICE_NOT_CONFIGURED');
  }

  const response = await withTimeout(
    fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: parseSender(getEmailFromAddress()),
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html || `<p>${text}</p>`,
      }),
    }),
    env.EMAIL_SEND_TIMEOUT_MS,
  );

  if (!response.ok) {
    let providerError = {};
    try {
      providerError = await response.json();
    } catch {
      providerError = { message: await response.text() };
    }

    throw new AppError('Brevo API could not deliver the message', 503, 'EMAIL_DELIVERY_FAILED', {
      providerStatus: response.status,
      providerCode: providerError?.code || null,
      providerMessage: providerError?.message || null,
    });
  }

  return response.json();
}

async function sendWithSmtp({ to, subject, text, html }) {
  if (!smtpTransport) {
    throw new AppError('Email service is not configured', 503, 'EMAIL_SERVICE_NOT_CONFIGURED');
  }

  try {
    return await withTimeout(
      smtpTransport.sendMail({
        from: getEmailFromAddress(),
        to,
        subject,
        text,
        html,
      }),
      env.EMAIL_SEND_TIMEOUT_MS,
    );
  } catch (error) {
    logger.warn('SMTP sendMail failed', {
      to,
      subject,
      code: error?.code || 'EMAIL_SEND_FAILED',
      message: error?.message || 'Unknown SMTP send error',
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('Email service could not deliver the message', 503, 'EMAIL_DELIVERY_FAILED', {
      providerCode: error?.code || null,
      providerResponseCode: error?.responseCode || null,
      providerCommand: error?.command || null,
    });
  }
}

export async function sendEmail({ to, subject, text, html }) {
  if (getEmailProvider() === 'brevo_api') {
    try {
      return await sendWithBrevoApi({ to, subject, text, html });
    } catch (error) {
      logger.warn('Brevo API email delivery failed', {
        to,
        subject,
        code: error?.code || 'BREVO_API_SEND_FAILED',
        details: error?.details || null,
        message: error?.message || 'Unknown Brevo API error',
      });
      throw error;
    }
  }

  return sendWithSmtp({ to, subject, text, html });
}
