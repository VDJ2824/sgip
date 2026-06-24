import nodemailer from 'nodemailer';
import { logger } from '../common/logger.js';
import { env } from './env.js';

const BREVO_DEFAULT_HOST = 'smtp-relay.brevo.com';

function getEmailConfig() {
  if (env.EMAIL_PROVIDER === 'brevo_api') {
    return {
      provider: 'brevo_api',
      host: '',
      port: 0,
      user: '',
      pass: env.BREVO_API_KEY,
      from: env.BREVO_FROM || env.SMTP_FROM,
      requiredLabels: {
        pass: 'BREVO_API_KEY',
        from: 'BREVO_FROM or SMTP_FROM',
      },
    };
  }

  if (env.EMAIL_PROVIDER === 'brevo') {
    return {
      provider: 'brevo',
      host: env.BREVO_SMTP_HOST || BREVO_DEFAULT_HOST,
      port: env.BREVO_SMTP_PORT,
      user: env.BREVO_SMTP_USER,
      pass: env.BREVO_SMTP_KEY,
      from: env.BREVO_FROM || env.SMTP_FROM,
      requiredLabels: {
        user: 'BREVO_SMTP_USER',
        pass: 'BREVO_SMTP_KEY',
        from: 'BREVO_FROM or SMTP_FROM',
      },
    };
  }

  return {
    provider: 'smtp',
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    requiredLabels: {
      host: 'SMTP_HOST',
      port: 'SMTP_PORT',
      user: 'SMTP_USER',
      pass: 'SMTP_PASS',
      from: 'SMTP_FROM',
    },
  };
}

function getMissingSmtpVars(config = getEmailConfig()) {
  const missing = [];

  if (config.provider !== 'brevo_api') {
    if (!config.host) missing.push(config.requiredLabels.host || 'SMTP_HOST');
    if (!config.port) missing.push(config.requiredLabels.port || 'SMTP_PORT');
    if (!config.user) missing.push(config.requiredLabels.user);
  }

  if (!config.pass) missing.push(config.requiredLabels.pass);
  if (!config.from) missing.push(config.requiredLabels.from);

  return missing;
}

export function isSmtpConfigured() {
  return getMissingSmtpVars().length === 0;
}

export function createSmtpTransport() {
  const config = getEmailConfig();
  const missingVars = getMissingSmtpVars(config);

  if (missingVars.length > 0) {
    logger.warn('Email service not configured; email-dependent routes will return a clean 503 error', {
      provider: config.provider,
      missingVars,
    });
    return null;
  }

  if (config.provider === 'brevo_api') {
    logger.info('Email API configured', {
      provider: config.provider,
    });
    return null;
  }

  try {
    logger.info('Email transport configured', {
      provider: config.provider,
      host: config.host,
      port: config.port,
    });

    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: Number(config.port) === 465,
      connectionTimeout: env.EMAIL_SEND_TIMEOUT_MS,
      greetingTimeout: env.EMAIL_SEND_TIMEOUT_MS,
      socketTimeout: env.EMAIL_SEND_TIMEOUT_MS,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  } catch (error) {
    logger.warn('Email transport could not be created; email-dependent routes will return a clean 503 error', {
      provider: config.provider,
      message: error?.message || 'Unknown SMTP configuration error',
    });
    return null;
  }
}

export async function verifySmtpTransportSafely(transport = smtpTransport) {
  if (!transport) {
    return false;
  }

  try {
    await transport.verify();
    return true;
  } catch (error) {
    logger.warn('SMTP verification failed; email service remains disabled for this run', {
      message: error?.message || 'Unknown SMTP verification error',
    });
    return false;
  }
}

export function getEmailServiceStatus() {
  const config = getEmailConfig();
  if (config.provider === 'brevo_api') {
    return getMissingSmtpVars(config).length === 0 ? 'brevo_api_configured' : 'not_configured';
  }

  return smtpTransport ? `${config.provider}_configured` : 'not_configured';
}

export function getEmailFromAddress() {
  return getEmailConfig().from;
}

export function getEmailProvider() {
  return getEmailConfig().provider;
}

export const smtpTransport = createSmtpTransport();
