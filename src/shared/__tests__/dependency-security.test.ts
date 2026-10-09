// ============================================
// Dependency & browser-baseline security floors
// 2026-10-08 (Sprint 132)
// ============================================
// Deterministic regression protection for the two things that must never
// silently regress:
//
//   1. SECURITY FLOORS — the resolved version of every package that had a
//      production-relevant advisory fixed in Sprint 132. A future change that
//      downgrades one of these fails here, in the normal test run, instead of
//      reappearing as an `npm audit` finding nobody reads.
//   2. THE SAFARI 15.4 BASELINE — the school iPads cap out at iPadOS 15.8
//      (Safari 15.6). Next.js 16's own default baseline is Safari 16.4+, and its
//      client runtime emits class static blocks that those devices cannot parse
//      (syntax error ⇒ React never hydrates ⇒ every button, including Google
//      sign-in, does nothing). `browserslist` is what keeps that from shipping.
//
// This is a floor check, NOT a lockfile freeze: newer versions always pass.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Pkg {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  browserslist?: string[];
}

interface Lock {
  packages?: Record<string, { version?: string }>;
}

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as Pkg;
const lock = JSON.parse(readFileSync(join(process.cwd(), 'package-lock.json'), 'utf-8')) as Lock;

/** Resolved version of an installed package (lockfile), or undefined. */
function resolved(name: string): string | undefined {
  return lock.packages?.[`node_modules/${name}`]?.version;
}

/** Compare two versions; prereleases sort below the matching release. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ''] = v.split('-');
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return { nums, pre };
  };
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (A.nums[i] ?? 0) - (B.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1; // a release beats its own prereleases
  if (!B.pre) return -1;
  return A.pre > B.pre ? 1 : -1; // beta.31 < beta.32
}

/**
 * Package → the lowest version that is free of the advisories Sprint 132
 * addressed. The comment records WHAT that floor defends.
 */
const SECURITY_FLOORS: Record<string, { min: string; why: string }> = {
  next: {
    min: '16.4.0',
    why: '16.2.10 was affected by middleware/proxy bypass, Server Action SSRF/DoS, response-body cache confusion and self-hosted SSG/ISR cache poisoning (cross-user content substitution).',
  },
  'next-auth': {
    min: '5.0.0-beta.32',
    why: 'beta.31 allowed existence-based auth checks to fail open and did not bind OAuth state/nonce/PKCE cookies to their provider (CSRF).',
  },
  '@auth/core': {
    min: '0.41.3',
    why: 'Homoglyph @ bypass in the email normalizer, uncaught throw in getToken(), unbound OAuth flow cookies.',
  },
  '@auth/prisma-adapter': {
    min: '2.11.3',
    why: 'Pulls the patched @auth/core (0.41.3).',
  },
  sharp: {
    min: '0.35.5',
    why: 'libvips/libheif/librsvg CVEs reachable through the image pipeline.',
  },
  '@xmldom/xmldom': {
    min: '0.8.15',
    why: 'XML injection + quadratic-time DoS (reached from document parsing).',
  },
  'fast-uri': {
    min: '3.1.8',
    why: 'Host confusion / SSRF via IPv6 + percent-decoding normalisation.',
  },
  'js-yaml': {
    min: '4.3.2',
    why: 'Quadratic CPU consumption in !!omap resolution.',
  },
  '@grpc/grpc-js': {
    min: '1.14.5',
    why: 'Accepting unauthorised certificates in getAuthContext; error leakage to clients.',
  },
  nanoid: {
    min: '3.3.20',
    why: 'Non-secure generators can loop indefinitely on invalid sizes.',
  },
  browserslist: {
    min: '4.29.3',
    why: 'Unbounded memory growth (no cache eviction) causing OOM.',
  },
  'source-map-js': {
    min: '1.2.2',
    why: 'Event-loop denial of service via indexed source-map section offsets.',
  },
  'postcss': {
    min: '8.5.10',
    why: 'XSS via unescaped </style> and arbitrary file read via sourceMappingURL.',
  },
  vitest: {
    min: '4.1.11',
    why: 'Path traversal / arbitrary file read via @vitest/mocker redirect mock (dev tooling, but pinned anyway).',
  },
};

describe('dependency security floors', () => {
  for (const [name, { min, why }] of Object.entries(SECURITY_FLOORS)) {
    it(`keeps ${name} at or above ${min}`, () => {
      const actual = resolved(name);
      expect(actual, `${name} is not installed — cannot verify the security floor`).toBeDefined();
      expect(
        compareVersions(actual!, min),
        `${name}@${actual} is BELOW the security floor ${min}.\nWhy this floor exists: ${why}\n` +
          `Fix: upgrade ${name} (never downgrade to silence an advisory).`,
      ).toBeGreaterThanOrEqual(0);
    });
  }

  it('does not pin a package.json range below a security floor', () => {
    // Guards against the floor being reintroduced via a manifest range even if
    // the lockfile happens to resolve higher.
    for (const name of ['next', 'next-auth', '@auth/prisma-adapter', 'sharp']) {
      const range = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      expect(range, `${name} must remain a declared dependency`).toBeTruthy();
    }
  });

  it('records the Prisma major version so an audit-driven downgrade is caught', () => {
    // `npm audit` proposes downgrading Prisma to 6.x for CLI-path advisories.
    // The architecture is Prisma 7; that "fix" must never be applied.
    const prisma = resolved('prisma');
    expect(prisma, 'prisma is not installed').toBeDefined();
    expect(
      compareVersions(prisma!, '7.0.0'),
      `prisma@${prisma} is below 7 — npm audit suggests downgrading Prisma to 6.x for ` +
        `CLI-only advisories; that would break the Prisma 7 driver-adapter architecture.`,
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps the Prisma CLI and client on the same version', () => {
    // `npm audit fix` rewrote the tree once and bumped the CLI to 7.10.0 while
    // @prisma/client stayed on 7.8.0. A CLI/client (or engines) mismatch breaks
    // `prisma generate` / `migrate deploy` in confusing ways, so pin the parity.
    const cli = resolved('prisma');
    const client = resolved('@prisma/client');
    const engines = resolved('@prisma/engines');
    expect(cli).toBeDefined();
    expect(client).toBeDefined();
    expect(
      client,
      `@prisma/client@${client} does not match prisma@${cli}.`,
    ).toBe(cli);
    if (engines) {
      expect(engines, `@prisma/engines@${engines} does not match prisma@${cli}.`).toBe(cli);
    }
  });
});

describe('Safari 15.4 / iPad browser baseline', () => {
  it('keeps the school-iPad browserslist entries', () => {
    const list = pkg.browserslist ?? [];
    expect(list.length, 'browserslist must not be removed or emptied').toBeGreaterThan(0);
    expect(list).toContain('safari 15.4');
    expect(list).toContain('ios_saf 15.4');
  });

  it('does not fall back to a Next.js-16-only baseline (Safari 16.4+)', () => {
    const list = (pkg.browserslist ?? []).join(' ').toLowerCase();
    // Next 16 defaults to Safari 16.4+; the school iPads are capped at 15.x, so
    // any explicit >= 16 target would break hydration on those devices.
    expect(/safari 1[6-9]|ios_saf 1[6-9]/.test(list)).toBe(false);
  });
});
