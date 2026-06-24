import { logger } from '../common/logger.js';
import { env } from './env.js';

function getMissingBrevoVars() {
  const missing = [];

  if (!env.BREVO_API_KEY) missing.push('BREVO_API_KEY');
  if (!env.BREVO_FROM) missing.push('BREVO_FROM');

  return missing;
}

export function isSmtpConfigured() {
  return getMissingBrevoVars().length === 0;
}

export function createSmtpTransport() {
  const missingVars = getMissingBrevoVars();

  if (missingVars.length > 0) {
    logger.warn('Brevo email API not configured; email-dependent routes will return a clean 503 error', {
      provider: env.EMAIL_PROVIDER,
      missingVars,
    });
    return null;
  }

  logger.info('Brevo email API configured', {
    provider: env.EMAIL_PROVIDER,
  });

  return null;
}

export async function verifySmtpTransportSafely() {
  return isSmtpConfigured();
}

export function getEmailServiceStatus() {
  return isSmtpConfigured() ? 'brevo_api_configured' : 'not_configured';
}

export function getEmailFromAddress() {
  return env.BREVO_FROM;
}

export function getEmailProvider() {
  return env.EMAIL_PROVIDER;
}

export const smtpTransport = createSmtpTransport();
