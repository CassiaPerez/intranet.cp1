export interface AuthHeaders {
  'Content-Type'?: string;
  'Authorization'?: string;
  'Cookie'?: string;
}

export const getAuthHeaders = (user?: any): AuthHeaders => {
  const headers: AuthHeaders = {};
  
  // Get token from user object
  const token = user?.token || user?.accessToken || user?.jwt;
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Include cookies for session-based auth
  if (typeof document !== 'undefined' && document.cookie) {
    headers['Cookie'] = document.cookie;
  }
  
  return headers;
};

export const makeAuthenticatedRequest = async (url: string, options: RequestInit = {}) => {
  const defaultOptions: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };
  
  try {
    const response = await fetch(url, defaultOptions);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        // If not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }
    
    return response;
  } catch (error) {
    console.error(`[AUTH-UTILS] Request failed for ${url}:`, error);
    throw error;
  }
};
export const getAuthHeadersWithJson = (user?: any): AuthHeaders => {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(user),
  };
};