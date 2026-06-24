import bcrypt from 'bcryptjs';
import { asyncHandler } from '../common/asyncHandler.js';
import { sendCreated, sendResponse } from '../common/response.js';
import { env } from '../config/index.js';
import { logger } from '../common/logger.js';
import { AppError, errorCodes } from '../errors/index.js';
import { User } from '../models/User.js';
import { studentProfileRepository } from '../modules/student-profile/repository.js';
import { generateOtp } from '../utils/generateOtp.js';
import { generateToken } from '../utils/generateToken.js';
import { sendEmail } from '../utils/sendEmail.js';

const OTP_EXPIRY_MS = env.OTP_EXPIRES_IN_MINUTES * 60 * 1000;

function sanitizeUser(user) {
  if (!user) return null;
  const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete plain.password;
  delete plain.otp;
  delete plain.otpExpiresAt;
  return plain;
}

async function issueOtp(user, purpose) {
  const otp = generateOtp();
  user.otp = await bcrypt.hash(otp, 10);
  user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  await user.save();

  const subject = purpose === 'register' ? 'Verify your SGIP account' : 'Your SGIP login OTP';
  const body = purpose === 'register'
    ? `Your SGIP verification code is ${otp}. It expires in ${env.OTP_EXPIRES_IN_MINUTES} minutes.`
    : `Your SGIP login code is ${otp}. It expires in ${env.OTP_EXPIRES_IN_MINUTES} minutes.`;

  try {
    await sendEmail({
      to: user.email,
      subject,
      text: body,
      html: `<p>${body}</p>`,
    });
  } catch (error) {
    logger.warn('OTP email delivery failed', {
      userId: String(user._id),
      email: user.email,
      purpose,
      error: error?.message || 'Unknown email error',
    });

    if (env.NODE_ENV === 'production') {
      throw new AppError(
        'Unable to send OTP email right now. Please check email service configuration.',
        503,
        error?.code || 'EMAIL_DELIVERY_FAILED',
      );
    }

    return { otp, emailSent: false };
  }

  return { otp, emailSent: true };
}

async function verifyOtp(user, otp) {
  if (!user.otp || !user.otpExpiresAt) {
    throw new AppError('OTP not found or expired', 400, errorCodes.VALIDATION_ERROR);
  }

  if (user.otpExpiresAt.getTime() < Date.now()) {
    throw new AppError('OTP expired', 400, errorCodes.VALIDATION_ERROR);
  }

  const isValid = await bcrypt.compare(otp, user.otp);
  if (!isValid) {
    throw new AppError('Invalid OTP', 400, errorCodes.VALIDATION_ERROR);
  }

  user.otp = '';
  user.otpExpiresAt = null;
  await user.save();
}

async function seedStudentProfile(user) {
  const studentId = String(user._id);
  const seedProfile = {
    studentId,
    userId: studentId,
    personal: {
      fullName: user.name,
      email: user.email,
      phone: '',
      location: '',
      github: '',
      linkedin: '',
      bio: '',
      targetRole: '',
    },
    education: {},
    experience: [],
    certifications: [],
    resume: {},
    topSkills: [],
    strengths: [],
    improvementAreas: [],
    overallReadiness: 0,
  };

  const existing = (await studentProfileRepository.findByStudentId(studentId)) || (await studentProfileRepository.findByUserId(studentId));
  if (existing) {
    await studentProfileRepository.updateProfile(existing._id, seedProfile);
    return;
  }

  await studentProfileRepository.createProfile(seedProfile);
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const { name, email, password } = req.validated.body;
    const existing = await User.findOne({ email: email.toLowerCase() });

    if (existing && existing.isEmailVerified) {
      throw new AppError('Account already exists', 409, errorCodes.CONFLICT);
    }
    if (existing && existing.role && existing.role !== 'student') {
      throw new AppError('Staff accounts cannot register publicly', 403, errorCodes.VALIDATION_ERROR);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = existing || new User({ name, email: email.toLowerCase(), password: hashedPassword });
    user.name = name;
    user.email = email.toLowerCase();
    user.password = hashedPassword;
    user.role = 'student';
    user.department = '';
    user.mustChangePassword = false;
    user.createdByAdmin = false;
    user.isActive = true;
    user.isEmailVerified = false;
    const otpInfo = await issueOtp(user, 'register');
    await seedStudentProfile(user);

    return sendCreated(res, req, {
      message: 'Registration OTP sent',
      email: user.email,
      verificationRequired: true,
      expiresInMinutes: env.OTP_EXPIRES_IN_MINUTES,
      ...(env.NODE_ENV !== 'production' ? { debugOtp: otpInfo.otp, emailSent: otpInfo.emailSent } : {}),
    });
  }),

  verifyRegisterOtp: asyncHandler(async (req, res) => {
    const { email, otp } = req.validated.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new AppError('Account not found', 404, errorCodes.NOT_FOUND);
    }
    if (user.role !== 'student') {
      throw new AppError('Staff accounts cannot use public registration verification', 403, errorCodes.VALIDATION_ERROR);
    }

    if (user.isEmailVerified) {
      return sendResponse(res, req, {
        message: 'Account already verified',
        token: generateToken(String(user._id)),
        user: sanitizeUser(user),
      });
    }

    await verifyOtp(user, otp);
    user.isEmailVerified = true;
    await user.save();
    await seedStudentProfile(user);

    return sendResponse(res, req, {
      message: 'Registration verified',
      token: generateToken(String(user._id)),
      user: sanitizeUser(user),
    });
  }),

  login: asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new AppError('Invalid credentials', 401, errorCodes.VALIDATION_ERROR);
    }

    if (!user.isEmailVerified) {
      throw new AppError('Please verify your email first', 403, errorCodes.VALIDATION_ERROR);
    }
    if (user.isActive === false) {
      throw new AppError('Account is inactive. Contact your institution administrator.', 403, errorCodes.VALIDATION_ERROR);
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new AppError('Invalid credentials', 401, errorCodes.VALIDATION_ERROR);
    }

    const otpInfo = await issueOtp(user, 'login');

    return sendResponse(res, req, {
      message: 'Login OTP sent',
      email: user.email,
      verificationRequired: true,
      expiresInMinutes: env.OTP_EXPIRES_IN_MINUTES,
      ...(env.NODE_ENV !== 'production' ? { debugOtp: otpInfo.otp, emailSent: otpInfo.emailSent } : {}),
    });
  }),

  verifyLoginOtp: asyncHandler(async (req, res) => {
    const { email, otp } = req.validated.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new AppError('Account not found', 404, errorCodes.NOT_FOUND);
    }
    if (user.isActive === false) {
      throw new AppError('Account is inactive. Contact your institution administrator.', 403, errorCodes.VALIDATION_ERROR);
    }

    await verifyOtp(user, otp);

    return sendResponse(res, req, {
      message: 'Login verified',
      token: generateToken(String(user._id)),
      user: sanitizeUser(user),
    });
  }),

  profile: asyncHandler(async (req, res) => {
    return sendResponse(res, req, sanitizeUser(req.auth.user));
  }),

  logout: asyncHandler(async (req, res) => {
    return sendResponse(res, req, {
      message: 'Logged out successfully',
    });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.validated.body;
    const user = await User.findById(req.auth.userId);
    if (!user) throw new AppError('Account not found', 404, errorCodes.NOT_FOUND);

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new AppError('Current password is incorrect', 400, errorCodes.VALIDATION_ERROR);
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    await user.save();

    return sendResponse(res, req, {
      message: 'Password changed successfully',
      user: sanitizeUser(user),
    });
  }),
};
