'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth, UserRole } from '@/lib/auth-context';
import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, isLoading, logout, t } = useAuth();
  const wp = t.workerPortal;

  useEffect(() => {
    if (!isLoading && !user) {
      const redirectUrl = `/signin?redirect=${encodeURIComponent(pathname)}`;
      router.push(redirectUrl);
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-black border-t-[#F59E0B] rounded-full animate-spin mb-4" />
        <div className="font-mono text-xs font-black uppercase tracking-wider text-[#0F172A]">
          {t.common.loading || 'Verifying Official Authorization...'}
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isRoleAllowed = role ? allowedRoles.includes(role) : false;

  if (!isRoleAllowed) {
    const userRole = role || 'USER';
    const targetDesk = userRole === 'WORKER' ? '/worker' : userRole === 'CONTRACTOR' ? '/contractor' : '/';
    const currentRoleName = t.roles[userRole as keyof typeof t.roles] || userRole;
    const requiredRoleNames = allowedRoles
      .map((r) => t.roles[r as keyof typeof t.roles] || r)
      .join(' / ');

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border-2 border-black p-6 sm:p-8 shadow-brutal-lg">
          <div className="flex items-center gap-3 border-b-2 border-black pb-4 mb-5">
            <div className="w-12 h-12 bg-[#FEF2F2] border-2 border-[#DC2626] text-[#DC2626] flex items-center justify-center shadow-brutal-sm shrink-0">
              <Icons.AlertTriangle size={28} />
            </div>
            <div>
              <span className="text-[10px] font-mono font-black uppercase text-[#DC2626] tracking-wider">
                AUTHORIZATION MISMATCH · 403
              </span>
              <h1 className="text-xl font-black uppercase text-[#0F172A]">
                {wp.accessDeniedTitle || 'Access Not Permitted'}
              </h1>
            </div>
          </div>

          <div className="space-y-4 mb-6 text-xs sm:text-sm">
            <p className="text-slate-700 leading-relaxed font-medium">
              {(wp.accessDeniedDesc || 'You are signed in with the {currentRole} role. This section requires {requiredRole} authorization.')
                .replace('{currentRole}', currentRoleName)
                .replace('{requiredRole}', requiredRoleNames)}
            </p>

            <div className="p-3.5 border-2 border-black bg-[#FFFDF5] font-mono text-xs space-y-1.5 shadow-brutal-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 uppercase font-bold">Your Account:</span>
                <span className="font-black text-[#0F172A]">{user.login_id || user.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 uppercase font-bold">Your Role:</span>
                <span className="font-black text-[#B45309]">{currentRoleName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 uppercase font-bold">Required Role:</span>
                <span className="font-black text-[#15803D]">{requiredRoleNames}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => router.push(targetDesk)}
              className="font-black text-xs uppercase min-h-[46px]"
            >
              {(wp.goToMyHome || 'Go to your Desk ↗').replace('{role}', currentRoleName)}
            </Button>

            <Button
              type="button"
              variant="secondary"
              fullWidth
              size="md"
              onClick={logout}
              className="font-mono font-bold text-xs uppercase min-h-[44px] text-slate-700"
            >
              {wp.switchAccount || 'Switch Account / Sign Out'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
