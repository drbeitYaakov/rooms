// Bridge between NextAuth and Backend authentication

type SessionUser = {
  id?: string;
  email?: string;
  role?: string;
  backendToken?: string;
};

type SessionPayload = {
  user?: SessionUser;
};

type CachedBridgeToken = {
  token: string;
  expiresAt: number;
  userKey: string;
};

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const BACKEND_TOKEN_STORAGE_KEY = 'rooms_backend_token';
const BACKEND_TOKEN_USER_KEY_STORAGE_KEY = 'rooms_backend_token_user_key';

let inMemoryToken: CachedBridgeToken | null = null;

const buildUserKey = (session: SessionPayload | null) => {
  const id = session?.user?.id ?? '';
  const email = session?.user?.email ?? '';
  return `${id}:${email}`;
};

const isSessionValid = (session: SessionPayload | null): session is SessionPayload => {
  return Boolean(session?.user?.id && session.user?.email && session.user?.role);
};

const parseJwtExpiry = (token: string) => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const decodedPayload = atob(paddedPayload);
    const parsedPayload = JSON.parse(decodedPayload) as { exp?: number };

    return typeof parsedPayload.exp === 'number' ? parsedPayload.exp * 1000 : null;
  } catch (error) {
    console.warn('Failed to parse bridge token expiry:', error);
    return null;
  }
};

const isTokenUsable = (cachedToken: CachedBridgeToken | null, userKey: string) => {
  return Boolean(
    cachedToken &&
    cachedToken.userKey === userKey &&
    cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()
  );
};

const persistToken = (cachedToken: CachedBridgeToken | null) => {
  inMemoryToken = cachedToken;

  if (typeof window === 'undefined') {
    return;
  }

  if (!cachedToken) {
    window.localStorage.removeItem(BACKEND_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(BACKEND_TOKEN_USER_KEY_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(BACKEND_TOKEN_STORAGE_KEY, cachedToken.token);
  window.localStorage.setItem(BACKEND_TOKEN_USER_KEY_STORAGE_KEY, cachedToken.userKey);
};

export const clearBackendTokenCache = () => {
  persistToken(null);
};

export const storeBackendToken = (token: string, userKey: string) => {
  const expiresAt = parseJwtExpiry(token) ?? Date.now() + (8 * 60 * 60 * 1000);
  persistToken({
    token,
    expiresAt,
    userKey
  });
};

const getCachedToken = (userKey: string) => {
  if (isTokenUsable(inMemoryToken, userKey)) {
    return inMemoryToken;
  }

  if (typeof window !== 'undefined') {
    const storedToken = window.localStorage.getItem(BACKEND_TOKEN_STORAGE_KEY);
    const storedUserKey = window.localStorage.getItem(BACKEND_TOKEN_USER_KEY_STORAGE_KEY);

    if (storedToken && storedUserKey === userKey) {
      const expiresAt = parseJwtExpiry(storedToken) ?? Date.now() + (8 * 60 * 60 * 1000);
      const storedCachedToken = {
        token: storedToken,
        expiresAt,
        userKey
      };

      if (isTokenUsable(storedCachedToken, userKey)) {
        persistToken(storedCachedToken);
        return storedCachedToken;
      }

      window.localStorage.removeItem(BACKEND_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(BACKEND_TOKEN_USER_KEY_STORAGE_KEY);
    }
  }

  if (inMemoryToken) {
    clearBackendTokenCache();
  }

  return null;
};

// Get session from NextAuth
export const getSession = async () => {
  try {
    const response = await fetch('/api/auth/session');
    const session = await response.json();
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

// Create or reuse JWT token for backend
export const createBackendToken = async (session: SessionPayload, forceRefresh = false) => {
  if (!isSessionValid(session)) {
    return null;
  }

  const userKey = buildUserKey(session);
  const sessionBackendToken = session.user?.backendToken;

  if (!forceRefresh) {
    const cachedToken = getCachedToken(userKey);
    if (cachedToken) {
      return cachedToken.token;
    }
  } else {
    clearBackendTokenCache();
  }

  if (sessionBackendToken) {
    storeBackendToken(sessionBackendToken, userKey);
    return sessionBackendToken;
  }

  console.warn('No backend token available in session or cache for user:', userKey);
  return null;
};

const buildHeaders = (token: string, headers?: HeadersInit) => {
  const normalizedHeaders = new Headers(headers);

  if (!normalizedHeaders.has('Content-Type')) {
    normalizedHeaders.set('Content-Type', 'application/json');
  }

  normalizedHeaders.set('Authorization', `Bearer ${token}`);

  return normalizedHeaders;
};

// API wrapper with authentication
export const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const session = await getSession();

  if (!isSessionValid(session)) {
    throw new Error('No session found');
  }

  let token = await createBackendToken(session);

  if (!token) {
    throw new Error('No backend authentication token available. Please sign in again.');
  }

  const executeRequest = (authToken: string) => {
    const config: RequestInit = {
      ...options,
      headers: buildHeaders(authToken, options.headers),
    };

    return fetch(url, config);
  };

  let response = await executeRequest(token);

  if (response.status === 401) {
    clearBackendTokenCache();
    token = await createBackendToken(session, true);

    if (!token) {
      throw new Error('Failed to refresh backend authentication token. Please sign in again.');
    }

    response = await executeRequest(token);
  }

  return response;
};
