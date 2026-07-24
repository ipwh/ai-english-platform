// ============================================
// CSRF Protection — Double Submit Cookie Pattern
// Edge Runtime safe (zero Node.js deps, uses Web Crypto API)
//
// Usage in API routes:
//   import { validateCsrf } from '@/shared/auth/csrf';
//   const csrfResult = await validateCsrf(request);
//   if (!csrfResult.valid) return csrfResult.response;
//
// Usage in client (fetch):
//   const token = await getCsrfToken();
//   fetch('/api/...', { headers: { 'X-CSRF-Token': token } });
// ============================================

import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'X-CSRF-Token';
const CSRF_TOKEN_LENGTH = 32;

// Safe HTTP methods that do NOT require CSRF validation
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Generate a cryptographically random CSRF token */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_LENGTH);
  if (typeof globalThis.crypto !== 'undefined') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback (should not happen at edge, but safe)
    const nodeCrypto = require('node:crypto');
    nodeCrypto.randomFillSync(bytes);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export interface CsrfValidationResult {
  valid: true;
}

export interface CsrfValidationError {
  valid: false;
  response: NextResponse;
}

/**
 * Validate CSRF token for mutation requests.
 * Uses Double Submit Cookie pattern:
 * 1. Server sets csrf-token cookie on first visit
 * 2. Client reads cookie and sends it as X-CSRF-Token header
 * 3. Server compares cookie value with header value
 */
export async function validateCsrf(
  request: NextRequest,
): Promise<CsrfValidationResult | CsrfValidationError> {
  // Skip CSRF for safe methods
  if (SAFE_METHODS.has(request.method)) {
    return { valid: true };
  }

  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  // In development, allow requests without CSRF token (convenience)
  if (process.env.NODE_ENV === 'development' && !cookieToken && !headerToken) {
    return { valid: true };
  }

  if (!cookieToken || !headerToken) {
    logger.warn({
      module: 'csrf',
      method: request.method,
      path: request.nextUrl.pathname,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    }, 'CSRF token missing');
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'CSRF token missing. Please refresh the page and try again.' },
        { status: 403 },
      ),
    };
  }

  // Timing-safe comparison
  if (cookieToken.length !== headerToken.length) {
    return {
      valid: false,
      response: NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    };
  }

  let mismatch = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    mismatch |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }

  if (mismatch !== 0) {
    logger.warn({ module: 'csrf', method: request.method, path: request.nextUrl.pathname }, 'CSRF token mismatch');
    return {
      valid: false,
      response: NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    };
  }

  return { valid: true };
}

/**
 * Set CSRF cookie on the response.
 * Call this in GET handlers or middleware to ensure the client has a token.
 */
export function setCsrfCookie(response: NextResponse, request?: NextRequest): NextResponse {
  // Don't overwrite existing valid token
  if (request?.cookies.get(CSRF_COOKIE)?.value) {
    return response;
  }

  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false, // Client needs to read it for the header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return response;
}

/**
 * Helper: get CSRF token for client-side use.
 * Reads from the csrf-token cookie.
 */
export function getCsrfTokenFromClient(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? match[1] : null;
}
