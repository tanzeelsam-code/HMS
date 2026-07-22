const USER_KEY = 'aura_user';
export const AUTH_EXPIRED_EVENT = 'nexushos:auth-expired';

export interface AuthUser {
  name: string;
  role: string;
  email: string;
  mustChangePassword?: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const getStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const logout = () => {
  // Remove legacy bearer tokens left by releases before HttpOnly sessions.
  localStorage.removeItem('aura_token');
  localStorage.removeItem(USER_KEY);
};

export const login = async (email: string, password: string): Promise<AuthUser> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Login failed', res.status);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user as AuthUser;
};

export const restoreSession = async (): Promise<AuthUser | null> => {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (!res.ok) {
    logout();
    return null;
  }
  const data = await res.json() as { user: AuthUser };
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
};

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    logout();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
};

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<AuthUser> => {
  const result = await request<{ user: AuthUser; otherSessionsRevoked: number }>(
    'POST',
    '/auth/change-password',
    { currentPassword, newPassword },
  );
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  return result.user;
};
