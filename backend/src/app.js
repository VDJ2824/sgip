import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/index.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendResponse } from './common/response.js';
import { getEmailServiceStatus } from './config/smtp.js';

import studentProfileRoutes from './modules/student-profile/routes.js';
import skillRoutes from './modules/skill/routes.js';
import skillEvidenceRoutes from './modules/skill-evidence/routes.js';
import careerRoleRoutes from './modules/career-role/routes.js';
import gapAnalysisRoutes from './modules/gap-analysis/routes.js';
import roadmapRoutes from './modules/roadmap/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import notificationsRoutes from './modules/notifications/routes.js';
import placementAnalyticsRoutes from './modules/placement-analytics/routes.js';
import sgipRoutes from './modules/sgip/routes.js';
import resumeRoutes from './modules/resume/resume.routes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import mentorRoutes from './modules/mentor/mentor.routes.js';

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function getAllowedOrigins() {
  const configuredOrigins = [
    env.FRONTEND_URL,
    ...String(env.FRONTEND_URLS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  return new Set(
    [...configuredOrigins, 'http://localhost:5173', 'http://127.0.0.1:5173']
      .map(normalizeOrigin)
      .filter(Boolean),
  );
}

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  app.get(['/health', '/api/health'], (_req, res) =>
    res.status(200).json({
      success: true,
      message: 'Backend is running',
      environment: env.NODE_ENV,
      emailService: getEmailServiceStatus(),
    }),
  );
  app.get('/api/v1', (req, res) =>
    sendResponse(res, req, {
      service: 'SGIP Backend',
      version: 'v1',
      modules: [
        'student-profile',
        'skills',
        'skill-evidence',
        'career-roles',
        'gap-analysis',
        'roadmap',
        'reports',
        'notifications',
        'placement-analytics',
        'sgip',
        'resumes',
        'auth',
      ],
    }),
  );

  app.use('/api/v1/student-profile', studentProfileRoutes);
  app.use('/api/v1/skills', skillRoutes);
  app.use('/api/v1/skill-evidence', skillEvidenceRoutes);
  app.use('/api/career-roles', careerRoleRoutes);
  app.use('/api/v1/career-roles', careerRoleRoutes);
  app.use('/api/v1/career-role-catalog', careerRoleRoutes);
  app.use('/api/gap-analysis', gapAnalysisRoutes);
  app.use('/api/v1/gap-analysis', gapAnalysisRoutes);
  app.use('/api/roadmap', roadmapRoutes);
  app.use('/api/v1/roadmap', roadmapRoutes);
  app.use('/api/v1/reports', reportsRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/placement-analytics', placementAnalyticsRoutes);
  app.use('/api/v1/sgip', sgipRoutes);
  app.use('/api/resumes', resumeRoutes);
  app.use('/api/v1/resumes', resumeRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/mentor', mentorRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
