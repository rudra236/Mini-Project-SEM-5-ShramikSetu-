import type { UserRole } from '@/types/database.types';

const SESSION_SECRET = process.env.SESSION_SECRET || 'shramiksetu-unified-session-secret-2026-secure';

export interface AuthSessionPayload {
  userId: string;
  loginId: string;
  role: UserRole;
  fullName: string;
  exp: number; // Unix timestamp ms
}

// Base64url utilities that work in Edge, Node, and Browser without Buffer
function base64urlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Edge-Compatible Async Verification via Web Crypto API ──────────────────

export async function verifySessionAsync(token: string): Promise<AuthSessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signatureStr] = parts;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64urlDecode(signatureStr);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes as unknown as BufferSource, enc.encode(payloadStr) as unknown as BufferSource);
    if (!valid) return null;

    const payloadBytes = base64urlDecode(payloadStr);
    const dec = new TextDecoder();
    const payload = JSON.parse(dec.decode(payloadBytes)) as AuthSessionPayload;

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function signSessionAsync(payload: AuthSessionPayload): Promise<string> {
  const enc = new TextEncoder();
  const payloadStr = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadStr) as unknown as BufferSource);
  const sigStr = base64urlEncode(new Uint8Array(sig));
  return `${payloadStr}.${sigStr}`;
}
