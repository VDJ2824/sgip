import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().optional().or(z.literal('')),
  MONGODB_URI: z.string().optional().or(z.literal('')),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  FRONTEND_URLS: z.string().optional().or(z.literal('')),
  CLOUDINARY_CLOUD_NAME: z.string().optional().or(z.literal('')),
  CLOUDINARY_API_KEY: z.string().optional().or(z.literal('')),
  CLOUDINARY_API_SECRET: z.string().optional().or(z.literal('')),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  OTP_EXPIRES_IN_MINUTES: z.coerce.number().int().positive().default(10),
  EMAIL_PROVIDER: z.preprocess(() => 'brevo_api', z.literal('brevo_api').default('brevo_api')),
  BREVO_API_KEY: z.string().optional().or(z.literal('')),
  BREVO_FROM: z.string().optional().or(z.literal('')),
  EMAIL_SEND_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_PROVIDER: z.preprocess((value) => (value === '' || value === undefined ? 'gemini' : value), z.enum(['fallback', 'openai', 'gemini']).default('gemini')),
  AI_MODEL: z.string().optional().or(z.literal('')),
  AI_API_KEY: z.string().optional().or(z.literal('')),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(20000),
  AI_OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AI_GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  OPENAI_API_KEY: z.string().optional().or(z.literal('')),
  GEMINI_API_KEY: z.string().optional().or(z.literal('')),
  RESUME_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(5),
}).transform((parsed) => {
  const mongoUri = parsed.MONGO_URI || parsed.MONGODB_URI || '';

  return {
    ...parsed,
    MONGO_URI: mongoUri,
    MONGODB_URI: mongoUri,
  };
});

export const env = envSchema.parse(process.env);
