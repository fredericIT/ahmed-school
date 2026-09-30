'use client';
import { createContext, useCallback, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { api } from './api';
import type { Role, User } from '@/types';
import { msg } from './locale';

/** Capabilities used to hide UI the current role can't use. The API enforces the same rules. */
const PERMISSIONS = {
  // Everything except attendance and "My classes" is for administrators; teachers only see their classes.
  'admin.area': ['SUPER_ADMIN', 'ADMIN'],
  'myClasses.view': ['TEACHER'],
  // Only administrators set a teacher's password.
  'password.change': ['SUPER_ADMIN', 'ADMIN'],
  // Teachers enter marks; administrators also see whole-class results and print report cards.
  'marks.results': ['SUPER_ADMIN', 'ADMIN'],
  'users.manage': ['SUPER_ADMIN'],
  'settings.manage': ['SUPER_ADMIN'],
  'audit.view': ['SUPER_ADMIN'],
  'classes.manage': ['SUPER_ADMIN'],
  'records.hardDelete': ['SUPER_ADMIN'],
  'records.restore': ['SUPER_ADMIN'],
  'teachers.manage': ['SUPER_ADMIN', 'ADMIN'],
  'courses.manage': ['SUPER_ADMIN', 'ADMIN'],
} satisfies Record<string, Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: msg('Super admin'),
  ADMIN: msg('Admin'),
  TEACHER: msg('Teacher'),
};

interface AuthValue {
  user: User | undefined;
  isLoading: boolean;
  can: (p: Permission) => boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const {
    data: user,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/auth/me'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const can = useCallback((p: Permission) => !!user && (PERMISSIONS[p] as readonly Role[]).includes(user.role), [user]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      qc.clear();
      router.replace('/login');
    }
  }, [qc, router]);

  return <AuthContext.Provider value={{ user, isLoading, can, logout, refetch }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Pages a teacher may open; the API enforces the same limits. */
const TEACHER_PAGES = ['/my-classes', '/attendance', '/marks', '/profile'];

/** Sends teachers who land on an administrator page (e.g. /dashboard after sign-in) to their classes. */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const blocked =
    user?.role === 'TEACHER' && !TEACHER_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (blocked) router.replace('/my-classes');
  }, [blocked, router]);

  // Wait for the role before rendering, so a teacher's browser never requests administrator data.
  return blocked || isLoading ? null : <>{children}</>;
}
