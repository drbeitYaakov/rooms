import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

const DEFAULT_JWT_EXPIRY = '8h';
const DEFAULT_BRIDGE_TOKEN_EXPIRY = '10m';
const MIN_SECRET_LENGTH = 32;

type AuthTokenPayload = {
  id: string;
  email: string;
  role: string;
};

type TokenType = 'access' | 'bridge' | 'mfa_challenge';
type TokenPayload = AuthTokenPayload & { tokenType: TokenType };

const getConfiguredAudience = () => process.env.JWT_AUDIENCE || undefined;
const getConfiguredIssuer = () => process.env.JWT_ISSUER || undefined;

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('JWT_SECRET must be defined and at least 32 characters long.');
  }

  return secret;
};

export const getBridgeSharedSecret = (): string => {
  const secret = process.env.BRIDGE_TOKEN_SHARED_SECRET
    || (process.env.NODE_ENV !== 'production' ? process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET : undefined);

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('BRIDGE_TOKEN_SHARED_SECRET must be defined and at least 32 characters long.');
  }

  return secret;
};

const buildSignOptions = (expiresIn: string): SignOptions => {
  const issuer = getConfiguredIssuer();
  const audience = getConfiguredAudience();

  return {
    expiresIn: expiresIn as SignOptions['expiresIn'],
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {})
  };
};

const signTypedToken = (payload: TokenPayload, expiresIn: string): string =>
  jwt.sign(payload, getJwtSecret(), buildSignOptions(expiresIn));

export const signAccessToken = (payload: AuthTokenPayload): string =>
  signTypedToken({ ...payload, tokenType: 'access' }, process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRY);

export const signBridgeToken = (payload: AuthTokenPayload): string =>
  signTypedToken({ ...payload, tokenType: 'bridge' }, process.env.BRIDGE_TOKEN_EXPIRES_IN || DEFAULT_BRIDGE_TOKEN_EXPIRY);

export const signMfaChallengeToken = (payload: AuthTokenPayload): string =>
  signTypedToken({ ...payload, tokenType: 'mfa_challenge' }, process.env.MFA_CHALLENGE_TOKEN_EXPIRES_IN || '10m');

const verifyTypedToken = (token: string): JwtPayload & TokenPayload => {
  const issuer = getConfiguredIssuer();
  const audience = getConfiguredAudience();

  return jwt.verify(token, getJwtSecret(), {
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {})
  }) as JwtPayload & TokenPayload;
};

export const verifyAccessToken = (token: string): JwtPayload & TokenPayload => {
  const payload = verifyTypedToken(token);

  if (payload.tokenType !== 'access' && payload.tokenType !== 'bridge') {
    throw new Error('Invalid token type for API access');
  }

  return payload;
};

export const verifyMfaChallengeToken = (token: string): JwtPayload & TokenPayload => {
  const payload = verifyTypedToken(token);

  if (payload.tokenType !== 'mfa_challenge') {
    throw new Error('Invalid token type for MFA challenge');
  }

  return payload;
};

export const validateRuntimeSecurityConfig = (): void => {
  getJwtSecret();

  if (process.env.NODE_ENV === 'production') {
    getBridgeSharedSecret();
  }
};
