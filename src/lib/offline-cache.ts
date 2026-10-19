/**
 * Offline Cache Manager for Worker Balance, Passport, and Shifts.
 * Enables instant loading and full offline capability when network is down or on throttled 3G.
 */

const BALANCE_CACHE_KEY = 'shramiksetu_pwa_balance';
const PASSPORT_CACHE_KEY = 'shramiksetu_pwa_passport';
const ATTENDANCE_CACHE_KEY = 'shramiksetu_pwa_attendance';
const CONTRACTS_CACHE_KEY = 'shramiksetu_pwa_contracts';

export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  timestamp: number;
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function saveCachedBalance(data: any): void {
  if (!hasStorage()) return;
  try {
    const entry: CacheEntry<any> = {
      data,
      cachedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
    };
    localStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota limits
  }
}

export function getCachedBalance(): CacheEntry<any> | null {
  if (!hasStorage()) return null;
  try {
    const item = localStorage.getItem(BALANCE_CACHE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function saveCachedPassport(data: any): void {
  if (!hasStorage()) return;
  try {
    const entry: CacheEntry<any> = {
      data,
      cachedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
    };
    localStorage.setItem(PASSPORT_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota limits
  }
}

export function getCachedPassport(): CacheEntry<any> | null {
  if (!hasStorage()) return null;
  try {
    const item = localStorage.getItem(PASSPORT_CACHE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function saveCachedAttendance(data: any): void {
  if (!hasStorage()) return;
  try {
    const entry: CacheEntry<any> = {
      data,
      cachedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
    };
    localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota limits
  }
}

export function getCachedAttendance(): CacheEntry<any> | null {
  if (!hasStorage()) return null;
  try {
    const item = localStorage.getItem(ATTENDANCE_CACHE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function saveCachedContracts(data: any): void {
  if (!hasStorage()) return;
  try {
    const entry: CacheEntry<any> = {
      data,
      cachedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
    };
    localStorage.setItem(CONTRACTS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota limits
  }
}

export function getCachedContracts(): CacheEntry<any> | null {
  if (!hasStorage()) return null;
  try {
    const item = localStorage.getItem(CONTRACTS_CACHE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function clearOfflineCache(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(BALANCE_CACHE_KEY);
    localStorage.removeItem(PASSPORT_CACHE_KEY);
    localStorage.removeItem(ATTENDANCE_CACHE_KEY);
    localStorage.removeItem(CONTRACTS_CACHE_KEY);
    localStorage.removeItem('shramiksetu_offline_attendance_queue');
    sessionStorage.clear();
  } catch {
    // Ignore storage errors
  }
}

