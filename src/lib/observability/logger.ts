/**
 * Structured Logger for Observability
 * Hardened to filter out sensitive credentials: OTP, passwords, secrets, financial/payment credentials.
 */

export interface LogEntry {
  requestId?: string;
  operation: string;
  userId?: string;
  success: boolean;
  errorCode?: string;
  details?: Record<string, any>;
  timestamp: string;
}

const SENSITIVE_KEYS = [
  'otp',
  'password',
  'secret',
  'token',
  'authorization',
  'cardnumber',
  'cvv',
  'bankaccount',
  'accountnumber',
  'pin',
  'credential',
  'privatekey',
];

export function sanitizeData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData);
  }
  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }
    return sanitized;
  }
  return obj;
}

export class Logger {
  static info(operation: string, details?: Record<string, any>, context?: { requestId?: string; userId?: string }) {
    const entry: LogEntry = {
      requestId: context?.requestId,
      operation,
      userId: context?.userId,
      success: true,
      details: details ? sanitizeData(details) : undefined,
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(entry));
    return entry;
  }

  static error(
    operation: string,
    errorCode: string,
    error: any,
    context?: { requestId?: string; userId?: string; details?: Record<string, any> }
  ) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const entry: LogEntry = {
      requestId: context?.requestId,
      operation,
      userId: context?.userId,
      success: false,
      errorCode,
      details: sanitizeData({
        message: errorMessage,
        ...(context?.details || {}),
      }),
      timestamp: new Date().toISOString(),
    };
    console.error(JSON.stringify(entry));
    return entry;
  }
}
