import { supabase, supabaseFunctionUrl, supabasePublicHeaders } from './supabase';

const USER_KEY = 'aura_user';
export const AUTH_EXPIRED_EVENT = 'nexushos:auth-expired';

export interface AuthUser {
  name: string;
  role: string;
  email: string;
  mustChangePassword?: boolean;
  propertyId?: string;
  allowedPropertyIds?: string[];
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

const clearStoredUser = () => {
  localStorage.removeItem('aura_token');
  localStorage.removeItem(USER_KEY);
};

export const logout = () => {
  clearStoredUser();
  void supabase.auth.signOut();
};

export const login = async (email: string, password: string): Promise<AuthUser> => {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    throw new ApiError(error.message || 'Login failed', error.status || 401);
  }
  const user = await restoreSession();
  if (!user) throw new ApiError('This account is not authorized for NexusHOS.', 403);
  return user;
};

export const restoreSession = async (): Promise<AuthUser | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    clearStoredUser();
    return null;
  }
  try {
    const data = await request<{ user: AuthUser }>('GET', '/auth/session');
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  } catch {
    logout();
    return null;
  }
};

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const propertyId = getStoredUser()?.propertyId;
    const res = await fetch(`${supabaseFunctionUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...supabasePublicHeaders,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(propertyId ? { 'X-NexusHOS-Property-ID': propertyId } : {}),
      },
      signal: controller.signal,
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
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('The Supabase request timed out. Please try again.', 504);
    }
    if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
      throw new ApiError('Unable to connect to Supabase. Check your connection and try again.', 503);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
  const { data: current } = await supabase.auth.getUser();
  if (!current.user?.email) throw new ApiError('Authentication required', 401);
  const reauthenticated = await supabase.auth.signInWithPassword({
    email: current.user.email,
    password: currentPassword,
  });
  if (reauthenticated.error) throw new ApiError('Current password is incorrect', 401);
  const updated = await supabase.auth.updateUser({ password: newPassword });
  if (updated.error) throw new ApiError(updated.error.message, updated.error.status || 400);
  await request<{ success: boolean }>('POST', '/auth/password-changed');
  const user = await restoreSession();
  if (!user) throw new ApiError('Unable to restore your session after changing password', 401);
  return user;
};
