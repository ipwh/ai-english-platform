// ============================================
// API Cache Helpers — standardized Cache-Control headers
// P2: API Response Caching
//
// Usage:
//   import { cacheFor, CACHE_SHORT, CACHE_MEDIUM, CACHE_LONG } from '@/shared/utils/api-cache';
//   return NextResponse.json(data, { headers: cacheFor(CACHE_MEDIUM) });
// ============================================

/** Cache durations in seconds */
export const CACHE_SHORT = 30;     // 30 seconds — real-time-ish data
export const CACHE_MEDIUM = 300;   // 5 minutes — semi-static lists
export const CACHE_LONG = 3600;    // 1 hour — rarely-changing reference data
export const CACHE_DAY = 86400;    // 24 hours — static reference data

/**
 * Generate Cache-Control headers for the given max-age.
 * Uses `public` for CDN caching (Cloud CDN) and `stale-while-revalidate`
 * for graceful background refresh.
 */
export function cacheFor(maxAgeSeconds: number): Record<string, string> {
  const swr = Math.floor(maxAgeSeconds * 2); // stale-while-revalidate = 2x max-age
  return {
    'Cache-Control': `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${swr}`,
  };
}

/**
 * No-cache headers — for data that must always be fresh
 */
export const NO_CACHE: Record<string, string> = {
  'Cache-Control': 'no-store, must-revalidate',
};
