// Bridge between NextAuth and Backend authentication

type SessionUser = {
  id?: string;
  email?: string;
  role?: string;
};

type SessionPayload = {
  user?: SessionUser;
};

type CachedBridgeToken = {
  token: string;
  expiresAt: number;
  userKey: string;
};

const BRIDGE_TOKEN_STORAGE_KEY = 'backend_bridge_token';
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

let inMemoryToken: CachedBridgeToken | null = null;
let tokenRequestPromise: Promise<string | null> | null = null;

const isBrowser = () => typeof window !== 'undefined';

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

const readStoredToken = () => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const rawToken = window.sessionStorage.getItem(BRIDGE_TOKEN_STORAGE_KEY);
    if (!rawToken) {
      return null;
    }

    const parsedToken = JSON.parse(rawToken) as CachedBridgeToken;
    if (!parsedToken?.token || !parsedToken?.expiresAt || !parsedToken?.userKey) {
      window.sessionStorage.removeItem(BRIDGE_TOKEN_STORAGE_KEY);
      return null;
    }

    return parsedToken;
  } catch (error) {
    console.warn('Failed to read stored bridge token:', error);
    window.sessionStorage.removeItem(BRIDGE_TOKEN_STORAGE_KEY);
    return null;
  }
};

const persistToken = (cachedToken: CachedBridgeToken | null) => {
  inMemoryToken = cachedToken;

  if (!isBrowser()) {
    return;
  }

  try {
    if (!cachedToken) {
      window.sessionStorage.removeItem(BRIDGE_TOKEN_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(BRIDGE_TOKEN_STORAGE_KEY, JSON.stringify(cachedToken));
  } catch (error) {
    console.warn('Failed to persist bridge token:', error);
  }
};

const clearCachedToken = () => {
  persistToken(null);
};

const getCachedToken = (userKey: string) => {
  if (isTokenUsable(inMemoryToken, userKey)) {
    return inMemoryToken;
  }

  const storedToken = readStoredToken();
  if (isTokenUsable(storedToken, userKey)) {
    inMemoryToken = storedToken;
    return storedToken;
  }

  if (storedToken || inMemoryToken) {
    clearCachedToken();
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

  if (!forceRefresh) {
    const cachedToken = getCachedToken(userKey);
    if (cachedToken) {
      return cachedToken.token;
    }
  } else {
    clearCachedToken();
  }

  if (tokenRequestPromise) {
    return tokenRequestPromise;
  }

  tokenRequestPromise = (async () => {
    try {
      console.log('Creating backend token for session:', session);

      const response = await fetch('/api/auth/bridge-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: session.user?.id,
          email: session.user?.email,
          role: session.user?.role
        }),
      });

      console.log('Bridge token response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Bridge token error response:', errorText);
        throw new Error(`Failed to create backend token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const expiresAt = parseJwtExpiry(data.token) ?? Date.now() + (23 * 60 * 60 * 1000);

      persistToken({
        token: data.token,
        expiresAt,
        userKey
      });

      console.log('Bridge token created successfully');
      return data.token as string;
    } catch (error) {
      clearCachedToken();
      console.error('Error creating token:', error);
      return null;
    } finally {
      tokenRequestPromise = null;
    }
  })();

  return tokenRequestPromise;
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
    throw new Error('Failed to create authentication token');
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
    clearCachedToken();
    token = await createBackendToken(session, true);

    if (!token) {
      throw new Error('Failed to refresh authentication token');
    }

    response = await executeRequest(token);
  }

  return response;
};
