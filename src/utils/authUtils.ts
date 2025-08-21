export interface AuthHeaders {
  'Content-Type'?: string;
  'Authorization'?: string;
}

export const getAuthHeaders = (user?: any): AuthHeaders => {
  const headers: AuthHeaders = {};
  
  // Get token from user object
  const token = user?.token || user?.accessToken || user?.jwt;
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

export const getAuthHeadersWithJson = (user?: any): AuthHeaders => {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(user),
  };
};