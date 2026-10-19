'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Icons } from './icons';

export const NotificationBell: React.FC = () => {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const [notifsRes, countsRes] = await Promise.allSettled([
        api.notifications.list({ unread: true, limit: 10 }),
        api.counts.get({ scope: 'user' }),
      ]);
      if (notifsRes.status === 'fulfilled' && notifsRes.value.success && notifsRes.value.notifications) {
        setNotifications(notifsRes.value.notifications);
      }
      if (countsRes.status === 'fulfilled' && countsRes.value.success && typeof countsRes.value.unreadNotifications === 'number') {
        setUnreadCount(countsRes.value.unreadNotifications);
      } else if (notifsRes.status === 'fulfilled' && notifsRes.value?.notifications) {
        setUnreadCount(notifsRes.value.notifications.length);
      }
    } catch {
      // User might not be logged in or network error
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 15 seconds per requirement
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore
    }
  };

  const handleNotificationClick = async (notif: any) => {
    await handleMarkRead(notif.id);
    setIsOpen(false);

    // Route to relevant page
    if (notif.type === 'ASSIGNMENT_INVITE' || notif.payload?.contractId) {
      router.push('/worker/contracts');
    } else if (
      notif.type === 'ASSIGNMENT_ACCEPTED' ||
      notif.type === 'ASSIGNMENT_REJECTED' ||
      notif.type === 'WORKER_ACCEPTANCE'
    ) {
      if (notif.payload?.projectId) {
        router.push(`/contractor/projects/${notif.payload.projectId}`);
      } else {
        router.push('/contractor/projects');
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        aria-label="Notifications"
        className="relative p-2 text-[var(--ink)] hover:bg-[var(--ink-10)] rounded-[2px] transition-none flex items-center justify-center min-w-[44px] min-h-[44px]"
      >
        <Icons.Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-[var(--site-orange)] text-white font-data text-[10px] font-bold rounded-full flex items-center justify-center px-1 border border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-80 sm:w-96 bg-white border-2 border-[var(--ink)] shadow-lg z-50 text-[var(--ink)]">
          <div className="flex items-center justify-between p-3 border-b border-[var(--ink-20)] bg-[var(--paper-dark)]">
            <span className="text-xs font-bold uppercase tracking-wider">
              NOTIFICATIONS · सूचनाएं ({unreadCount})
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[var(--ink-60)] hover:text-[var(--ink)]"
            >
              <Icons.X size={16} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--ink-10)]">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--ink-60)]">
                No unread notices
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className="p-3 text-xs hover:bg-[var(--paper)] cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold uppercase text-[11px] text-[var(--register-blue)]">
                      {notif.type?.replace(/_/g, ' ') || 'NOTICE'}
                    </span>
                    <span className="font-data text-[10px] text-[var(--ink-40)]">
                      {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--ink)] font-medium">{notif.message || notif.title}</p>
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-[var(--ink-10)]">
                    <span className="text-[10px] text-[var(--register-blue)] font-bold uppercase flex items-center gap-1">
                      OPEN REQUEST ↗
                    </span>
                    <button
                      onClick={(e) => handleMarkRead(notif.id, e)}
                      className="text-[10px] font-bold text-[var(--ink-60)] hover:text-[var(--ink)] underline uppercase"
                    >
                      MARK READ
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
