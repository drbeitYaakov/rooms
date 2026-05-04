// Bridge between NextAuth and Backend authentication

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

// Create JWT token for backend
export const createBackendToken = async (session: any) => {
  try {
    console.log('Creating backend token for session:', session);
    
    // Call backend API to create a proper JWT token
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/bridge-token`, {
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
    console.log('Bridge token created successfully');
    return data.token;
  } catch (error) {
    console.error('Error creating token:', error);
    return null;
  }
};

// API wrapper with authentication
export const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  // Get current session
  const session = await getSession();
  
  if (!session) {
    throw new Error('No session found');
  }

  // Create backend token
  const token = await createBackendToken(session);
  
  if (!token) {
    throw new Error('Failed to create authentication token');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  return fetch(url, config);
};
