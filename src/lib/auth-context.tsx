'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { Locale, translations } from '@/locales';
import { clearOfflineCache } from '@/lib/offline-cache';

export type UserRole =
  | 'WORKER'
  | 'CONTRACTOR'
  | 'SUPERVISOR'
  | 'INSTITUTIONAL_USER'
  | 'ADMIN';

export interface UserProfile {
  id: string;
  login_id?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: UserRole | null;
  locale?: Locale | null;
  created_at?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole | null;
  profiles: {
    worker?: any;
    contractor?: any;
    supervisor?: any;
    institutionalUser?: any;
  };
  locale: Locale;
  setLocale: (loc: Locale) => void;
  t: typeof translations['en'];
  isLoading: boolean;
  error: string | null;
  signin: (id: string, password: string, role: 'WORKER' | 'CONTRACTOR') => Promise<boolean>;
  setPassword: (token: string, newPassword: string) => Promise<boolean>;
  loginWorkerWithPassword: (workerId: string, password: string) => Promise<boolean>;
  register: (payload: any) => Promise<{ success: boolean; id: string; redirect: string }>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profiles, setProfiles] = useState<{
    worker?: any;
    contractor?: any;
    supervisor?: any;
    institutionalUser?: any;
  }>({});
  const [locale, setLocaleState] = useState<Locale>('en');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setLocale = (loc: Locale) => {
    setLocaleState(loc);
    if (typeof window !== 'undefined') {
      localStorage.setItem('shramiksetu_locale', loc);
      document.cookie = `shramiksetu_locale=${loc}; path=/; max-age=31536000; SameSite=Lax`;
      if (user) {
        fetch('/api/users/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: loc }),
        }).catch(() => {});
      }
    }
  };

  const refreshProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.auth.me();
      if (res.success && res.user) {
        setUser(res.user);
        setRole((res.role || res.user.role) as UserRole);
        setProfiles(res.profiles || (res.role === 'WORKER' ? { worker: res.profile } : res.role === 'CONTRACTOR' ? { contractor: res.profile } : {}));
        if (res.user.locale && (res.user.locale === 'en' || res.user.locale === 'hi' || res.user.locale === 'mr')) {
          setLocaleState(res.user.locale as Locale);
        }
        return;
      }
      setUser(null);
      setRole(null);
      setProfiles({});
    } catch {
      // 401 or no active session is normal when logged out
      setUser(null);
      setRole(null);
      setProfiles({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLocale = localStorage.getItem('shramiksetu_locale') as Locale;
      if (savedLocale && ['en', 'hi', 'mr'].includes(savedLocale)) {
        setLocaleState(savedLocale);
      }

      const handleExpired = () => {
        const currentPath = window.location.pathname;
        const isProtectedPath =
          currentPath.startsWith('/worker') ||
          currentPath.startsWith('/contractor') ||
          currentPath.startsWith('/disputes') ||
          currentPath.startsWith('/supervisor') ||
          currentPath.startsWith('/institutional');

        const currentRole =
          role?.toLowerCase() ||
          (currentPath.startsWith('/contractor') ? 'contractor' : 'worker');

        setUser(null);
        setRole(null);
        setProfiles({});
        clearOfflineCache();

        if (isProtectedPath && !currentPath.startsWith('/signin') && !currentPath.startsWith('/login')) {
          window.location.href = `/signin?reason=expired&role=${currentRole}&redirect=${encodeURIComponent(currentPath)}`;
        }
      };

      window.addEventListener('shramiksetu:session-expired', handleExpired);
      refreshProfile();

      return () => {
        window.removeEventListener('shramiksetu:session-expired', handleExpired);
      };
    } else {
      refreshProfile();
    }
  }, [refreshProfile]);

  const signin = async (id: string, password: string, roleInput: 'WORKER' | 'CONTRACTOR'): Promise<boolean> => {
    setError(null);
    try {
      const res = await api.auth.signin({ id, password, role: roleInput });
      if (res.success && res.user) {
        setUser(res.user);
        setRole(res.role as UserRole);
        if (res.role === 'WORKER') {
          setProfiles({ worker: res.profile });
        } else if (res.role === 'CONTRACTOR') {
          setProfiles({ contractor: res.profile });
        }
        refreshProfile().catch(() => {});
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err.message || 'Invalid ID or password');
      throw err;
    }
  };

  const setPassword = async (token: string, newPassword: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await api.auth.setPassword({ token, newPassword });
      return res.success;
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
      throw err;
    }
  };

  const loginWorkerWithPassword = async (workerId: string, password: string): Promise<boolean> => {
    return signin(workerId, password, 'WORKER');
  };

  const register = async (payload: any): Promise<{ success: boolean; id: string; redirect: string }> => {
    setError(null);
    try {
      const res = await api.auth.register(payload);
      if (res.success) {
        setUser(res.user);
        setRole(res.role as UserRole);
        if (res.role === 'WORKER') {
          setProfiles({ worker: res.profile });
        } else if (res.role === 'CONTRACTOR') {
          setProfiles({ contractor: res.profile });
        }
        await refreshProfile();
        return { success: true, id: res.id, redirect: res.redirect };
      }
      throw new Error('Registration failed');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      throw err;
    }
  };

  const logout = async () => {
    const priorRole = role?.toLowerCase() || (typeof window !== 'undefined' && window.location.pathname.startsWith('/contractor') ? 'contractor' : 'worker');
    try {
      await api.auth.signout();
    } catch {
      // ignore
    }
    setUser(null);
    setRole(null);
    setProfiles({});
    clearOfflineCache();
    if (typeof window !== 'undefined') {
      window.location.href = `/signin?role=${priorRole}`;
    }
  };

  const t = translations[locale] || translations.en;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        profiles,
        locale,
        setLocale,
        t,
        isLoading,
        error,
        signin,
        setPassword,
        loginWorkerWithPassword,
        register,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
