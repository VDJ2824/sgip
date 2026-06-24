import { AppError } from '../errors/index.js';
import { logger } from '../common/logger.js';
import { env } from '../config/index.js';
import { getEmailFromAddress, smtpTransport } from '../config/smtp.js';

function withTimeout(promise, timeoutMs) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AppError('Email delivery timed out', 503, 'EMAIL_SEND_TIMEOUT'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function sendEmail({ to, subject, text, html }) {
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

    throw new AppError('Email service could not deliver the message', 503, 'EMAIL_DELIVERY_FAILED');
  }
}
