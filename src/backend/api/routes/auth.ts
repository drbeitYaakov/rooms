import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logAuth } from '../../utils/logger';
import { UserRole } from '../../domain/types';
import { authLimiter } from '../../middleware/rateLimiter';
import { getBridgeSharedSecret, signAccessToken, signBridgeToken, signMfaChallengeToken, verifyMfaChallengeToken } from '../../utils/tokenSecurity';
import { getUserPasswordHash, normalizeEmail, validatePasswordStrength } from '../../utils/passwordPolicy';
import { recordAuditEvent } from '../../utils/auditService';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotpCode } from '../../utils/totp';

const router = Router();
const isPublicRegistrationEnabled = () => process.env.ENABLE_PUBLIC_REGISTRATION === 'true';
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5);
const ACCOUNT_LOCKOUT_MINUTES = Number(process.env.ACCOUNT_LOCKOUT_MINUTES || 30);
const PRIVILEGED_MFA_ROLES: UserRole[] = ['admin', 'grade_coordinator', 'study_groups_coordinator'];

const normalizeRole = (role: unknown): UserRole => {
  const normalized = String(role || '').toLowerCase();

  if (normalized === 'admin') return 'admin';
  if (normalized === 'grade_coordinator') return 'grade_coordinator';
  if (normalized === 'study_groups_coordinator' || normalized === 'group_coordinator') {
    return 'study_groups_coordinator';
  }

  return 'general_user';
};

const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const USER_ID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const toActorUuid = (value: unknown, fallback: unknown): string => {
  if (isUuid(value)) {
    return value as string;
  }

  const source = String(value || fallback || '').trim();
  return uuidv5(source || 'system-user', USER_ID_NAMESPACE);
};

const resolveBridgeUser = async (preferredId: unknown, email: unknown) => {
  if (isUuid(preferredId)) {
    const userById = await db('users')
      .where({ id: preferredId as string, is_active: true })
      .first();

    if (userById) {
      return userById;
    }
  }

  if (typeof email === 'string' && email.trim() !== '') {
    const userByEmail = await db('users')
      .where({ email: email.trim().toLowerCase(), is_active: true })
      .first();

    if (userByEmail) {
      return userByEmail;
    }
  }

  return null;
};

const getUserDisplayName = (user: any): string => {
  if (user.name) return user.name;
  if (user.full_name) return user.full_name;

  const firstName = user.first_name || '';
  const lastName = user.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || user.email;
};

const getUserDisplayPayload = (user: any) => ({
  id: user.id,
  email: user.email,
  name: getUserDisplayName(user),
  role: normalizeRole(user.role),
  gradeId: user.grade_id,
  mfaEnabled: Boolean(user.mfa_enabled)
});

const requiresMfa = (user: any): boolean =>
  Boolean(user?.mfa_enabled) && PRIVILEGED_MFA_ROLES.includes(normalizeRole(user?.role));

const isUserLocked = (user: any): boolean => {
  if (!user?.locked_until) {
    return false;
  }

  const lockUntil = new Date(user.locked_until);
  return !Number.isNaN(lockUntil.getTime()) && lockUntil.getTime() > Date.now();
};

const clearFailedLoginState = async (userId: string) => {
  await db('users')
    .where({ id: userId })
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login: new Date(),
      updated_at: new Date()
    });
};

const registerFailedLoginAttempt = async (user: any, req: Request) => {
  const nextFailedAttempts = Number(user.failed_login_attempts || 0) + 1;
  const shouldLock = nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + ACCOUNT_LOCKOUT_MINUTES * 60 * 1000)
    : null;

  await db('users')
    .where({ id: user.id })
    .update({
      failed_login_attempts: nextFailedAttempts,
      locked_until: lockedUntil,
      updated_at: new Date()
    });

  await recordAuditEvent({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'auth',
    entityId: user.id,
    oldValue: {
      failed_login_attempts: user.failed_login_attempts || 0,
      locked_until: user.locked_until ?? null
    },
    newValue: {
      failed_login_attempts: nextFailedAttempts,
      locked_until: lockedUntil?.toISOString() ?? null,
      login_status: shouldLock ? 'locked' : 'failed'
    },
    req
  });
};

// Register user
router.post('/register', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, role = 'general_user', gradeId } = req.body;

  if (!isPublicRegistrationEnabled()) {
    return res.status(403).json({
      success: false,
      error: 'הרשמה ציבורית אינה זמינה'
    });
  }

  // Validate input
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      error: 'חובה למלא אימייל, סיסמה ושם'
    });
  }

  const passwordValidationError = validatePasswordStrength(password);
  if (passwordValidationError) {
    return res.status(400).json({
      success: false,
      error: passwordValidationError
    });
  }

  const normalizedEmail = normalizeEmail(email);

  // Check if user exists
  const existingUser = await db('users').where({ email: normalizedEmail }).first();
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'המשתמש כבר קיים'
    });
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);
  const normalizedRole = normalizeRole(role);

  // Create user
  const [user] = await db('users').insert({
    id: randomUUID(),
    email: normalizedEmail,
    password_hash: hashedPassword,
    full_name: name,
    role: normalizedRole === 'general_user' ? normalizedRole : 'general_user',
    grade_id: gradeId ?? null,
    assigned_grade_id: gradeId ?? null,
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    password_changed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  }).returning(['id', 'email', 'full_name', 'role', 'grade_id']);

  // Generate JWT
  const token = signAccessToken({
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role)
  });

  logAuth(`User registered: ${normalizedEmail} (${normalizeRole(user.role)})`);
  await recordAuditEvent({
    userId: user.id,
    action: 'CREATE',
    entityType: 'user',
    entityId: user.id,
    newValue: getUserDisplayPayload(user),
    req
  });

  res.status(201).json({
    success: true,
    data: {
      user: getUserDisplayPayload(user),
      token
    }
  });
}));

// Login
router.post('/login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, mfaCode, mfaToken } = req.body;
  console.log('[AUTH LOGIN] Login attempt received', {
    email: typeof email === 'string' ? normalizeEmail(email) : null,
    hasPassword: Boolean(password),
    hasMfaCode: Boolean(mfaCode),
    hasMfaToken: Boolean(mfaToken)
  });

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'חובה למלא אימייל וסיסמה'
    });
  }

  const normalizedEmail = normalizeEmail(email);
  console.log('[AUTH LOGIN] Normalized email', { normalizedEmail });

  // Find user
  const user = await db('users')
    .where({ email: normalizedEmail, is_active: true })
    .first();

  console.log('[AUTH LOGIN] User lookup completed', {
    normalizedEmail,
    foundUser: Boolean(user),
    userId: user?.id ?? null
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'פרטי ההתחברות שגויים'
    });
  }

  if (isUserLocked(user)) {
    return res.status(423).json({
      success: false,
      error: 'החשבון נחסם זמנית בעקבות ניסיונות התחברות כושלים'
    });
  }

  // Check password
  const passwordHash = getUserPasswordHash(user);
  console.log('[AUTH LOGIN] Password hash presence', {
    userId: user.id,
    hasPasswordHash: Boolean(passwordHash)
  });
  if (!passwordHash) {
    return res.status(401).json({
      success: false,
      error: 'פרטי ההתחברות שגויים'
    });
  }

  const isPasswordValid = await bcrypt.compare(password, passwordHash);
  console.log('[AUTH LOGIN] Password validation result', {
    userId: user.id,
    isPasswordValid
  });
  if (!isPasswordValid) {
    await registerFailedLoginAttempt(user, req);
    return res.status(401).json({
      success: false,
      error: 'פרטי ההתחברות שגויים'
    });
  }

  if (requiresMfa(user)) {
    if (!mfaCode) {
      const challengeToken = signMfaChallengeToken({
        id: user.id,
        email: user.email,
        role: normalizeRole(user.role)
      });

      return res.status(200).json({
        success: true,
        data: {
          mfaRequired: true,
          mfaToken: challengeToken,
          user: {
            email: user.email,
            role: normalizeRole(user.role)
          }
        }
      });
    }

    if (!mfaToken) {
      return res.status(401).json({
        success: false,
        error: 'נדרש טוקן אתגר של MFA'
      });
    }

    let challengePayload;
    try {
      challengePayload = verifyMfaChallengeToken(mfaToken);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'אתגר ה-MFA אינו תקין'
      });
    }

    if (challengePayload.id !== user.id || normalizeEmail(challengePayload.email) !== user.email) {
      return res.status(401).json({
        success: false,
        error: 'אתגר ה-MFA אינו תקין'
      });
    }

    if (!user.mfa_secret || !verifyTotpCode(user.mfa_secret, String(mfaCode))) {
      await recordAuditEvent({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'auth',
        entityId: user.id,
        newValue: { login_status: 'mfa_failed' },
        req
      });

      return res.status(401).json({
        success: false,
        error: 'קוד ה-MFA שגוי'
      });
    }
  }

  // Generate JWT
  const token = signAccessToken({
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role)
  });

  console.log('[AUTH LOGIN] Access token created', {
    userId: user.id
  });

  await clearFailedLoginState(user.id);
  console.log('[AUTH LOGIN] Cleared failed login state', {
    userId: user.id
  });

  logAuth(`User logged in: ${normalizedEmail} (${normalizeRole(user.role)})`);
  await recordAuditEvent({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'auth',
    entityId: user.id,
    newValue: {
      login_status: 'success',
      last_login: new Date().toISOString()
    },
    req
  });
  console.log('[AUTH LOGIN] Audit event recorded', {
    userId: user.id
  });

  res.json({
    success: true,
    data: {
      user: getUserDisplayPayload(user),
      token
    }
  });
}));

router.get('/mfa/status', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await db('users')
    .where({ id: req.user!.id, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  res.json({
    success: true,
    data: {
      mfaEnabled: Boolean(user.mfa_enabled),
      roleRequiresMfa: PRIVILEGED_MFA_ROLES.includes(normalizeRole(user.role))
    }
  });
}));

router.post('/mfa/setup', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword } = req.body;
  const user = await db('users')
    .where({ id: req.user!.id, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  if (!currentPassword) {
    return res.status(400).json({
      success: false,
      error: 'חובה להזין את הסיסמה הנוכחית'
    });
  }

  const passwordHash = getUserPasswordHash(user);
  if (!passwordHash || !(await bcrypt.compare(currentPassword, passwordHash))) {
    return res.status(400).json({
      success: false,
      error: 'הסיסמה הנוכחית שגויה'
    });
  }

  const secret = generateTotpSecret();
  await db('users')
    .where({ id: user.id })
    .update({
      mfa_secret: secret,
      mfa_enabled: false,
      updated_at: new Date()
    });

  await recordAuditEvent({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: user.id,
    newValue: { mfa_setup_started: true },
    req
  });

  res.json({
    success: true,
    data: {
      secret,
      otpAuthUrl: buildOtpAuthUrl(user.email, secret),
      mfaEnabled: false
    }
  });
}));

router.post('/mfa/enable', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.body;
  const user = await db('users')
    .where({ id: req.user!.id, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  if (!user.mfa_secret) {
    return res.status(400).json({
      success: false,
      error: 'תהליך הגדרת MFA עדיין לא אותחל'
    });
  }

  if (!verifyTotpCode(user.mfa_secret, String(code || ''))) {
    return res.status(400).json({
      success: false,
      error: 'קוד ה-MFA שגוי'
    });
  }

  await db('users')
    .where({ id: user.id })
    .update({
      mfa_enabled: true,
      updated_at: new Date()
    });

  await recordAuditEvent({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: user.id,
    newValue: { mfa_enabled: true },
    req
  });

  res.json({
    success: true,
    data: {
      mfaEnabled: true
    }
  });
}));

router.post('/mfa/disable', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, code } = req.body;
  const user = await db('users')
    .where({ id: req.user!.id, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  const passwordHash = getUserPasswordHash(user);
  if (!currentPassword || !passwordHash || !(await bcrypt.compare(currentPassword, passwordHash))) {
    return res.status(400).json({
      success: false,
      error: 'הסיסמה הנוכחית שגויה'
    });
  }

  if (user.mfa_enabled && (!user.mfa_secret || !verifyTotpCode(user.mfa_secret, String(code || '')))) {
    return res.status(400).json({
      success: false,
      error: 'נדרש קוד MFA תקין כדי לכבות MFA'
    });
  }

  await db('users')
    .where({ id: user.id })
    .update({
      mfa_enabled: false,
      mfa_secret: null,
      updated_at: new Date()
    });

  await recordAuditEvent({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: user.id,
    newValue: { mfa_enabled: false },
    req
  });

  res.json({
    success: true,
    data: {
      mfaEnabled: false
    }
  });
}));

// Get current user
router.get('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await db('users')
    .where({ id: req.user!.id, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  res.json({
    success: true,
    data: {
      user: getUserDisplayPayload(user)
    }
  });
}));

// Update user profile
router.put('/profile', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, currentPassword, newPassword } = req.body;
  const userId = req.user!.id;

  // Get current user
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  const updates: any = {
    updated_at: new Date()
  };

  // Update name if provided
  if (name) {
    updates.full_name = name;
  }

  // Update password if provided
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'חובה להזין את הסיסמה הנוכחית כדי לשנות סיסמה'
      });
    }

    const currentPasswordHash = getUserPasswordHash(user);
    if (!currentPasswordHash) {
      return res.status(400).json({
        success: false,
        error: 'הסיסמה הנוכחית שגויה'
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentPasswordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'הסיסמה הנוכחית שגויה'
      });
    }

    const passwordValidationError = validatePasswordStrength(newPassword);
    if (passwordValidationError) {
      return res.status(400).json({
        success: false,
        error: passwordValidationError
      });
    }

    const salt = await bcrypt.genSalt(12);
    updates.password_hash = await bcrypt.hash(newPassword, salt);
    updates.password_changed_at = new Date();
  }

  const oldValue = getUserDisplayPayload(user);
  await db('users').where({ id: userId }).update(updates);

  // Get updated user
  const updatedUser = await db('users').where({ id: userId }).first();

  logAuth(`User profile updated: ${user.email}`);
  await recordAuditEvent({
    userId,
    action: 'UPDATE',
    entityType: 'user',
    entityId: userId,
    oldValue,
    newValue: getUserDisplayPayload(updatedUser),
    req
  });

  res.json({
    success: true,
    data: {
      user: getUserDisplayPayload(updatedUser)
    }
  });
}));

// Create bridge token for NextAuth integration
router.post('/bridge-token', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { id, email, role } = req.body;
  const normalizedRole = normalizeRole(role);
  const sharedSecret = req.header('X-Bridge-Token-Secret');

  // Validate input
  if (!id || !email || !role) {
    return res.status(400).json({
      success: false,
      error: 'חובה לשלוח מזהה, אימייל ותפקיד'
    });
  }

  if (!sharedSecret || sharedSecret !== getBridgeSharedSecret()) {
    return res.status(403).json({
      success: false,
      error: 'הגישה ליצירת Bridge token נדחתה'
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const resolvedUser = await resolveBridgeUser(id, normalizedEmail);
  const user = resolvedUser;

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'המשתמש לא נמצא'
    });
  }

  if (normalizeRole(user.role) !== normalizedRole) {
    return res.status(403).json({
      success: false,
      error: 'התפקיד של Bridge token אינו תואם למשתמש'
    });
  }

  // Generate JWT token
  const token = signBridgeToken({
    id: isUuid(user.id) ? user.id : toActorUuid(user.id, user.email),
    email: user.email,
    role: normalizeRole(user.role)
  });

  logAuth(`Bridge token created for: ${normalizedEmail} (${normalizeRole(user.role)})`);
  await recordAuditEvent({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'auth',
    entityId: user.id,
    newValue: { bridge_token_issued: true },
    req
  });

  res.json({
    success: true,
    token
  });
}));

// Logout (client-side token removal)
router.post('/logout', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  logAuth(`User logged out: ${req.user!.email}`);
  await recordAuditEvent({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'auth',
    entityId: req.user!.id,
    newValue: { logout: true },
    req
  });
  
  res.json({
    success: true,
    message: 'ההתנתקות בוצעה בהצלחה'
  });
}));

export default router;
