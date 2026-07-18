// Sprint 15: Security Report Generator

export interface SecurityAudit {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: SecurityCheck[];
  summary: string;
}

export interface SecurityCheck {
  category: string;
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Generate a security audit report based on codebase checks.
 */
export function generateSecurityAudit(params: {
  hasZodValidation: boolean;
  zodRouteCount: number;
  totalRouteCount: number;
  hasRateLimiting: boolean;
  hasCsp: boolean;
  cspValue?: string;
  hasPromptInjectionDefense: boolean;
  usesPrisma: boolean;
  authMethod: string;
  hasApiAuth: boolean;
}): SecurityAudit {
  const checks: SecurityCheck[] = [];

  // Input validation
  const zodCoverage = params.totalRouteCount > 0
    ? Math.round((params.zodRouteCount / params.totalRouteCount) * 100)
    : 0;
  checks.push({
    category: 'Input Validation',
    name: 'Zod schema coverage',
    passed: zodCoverage >= 50,
    detail: `${params.zodRouteCount}/${params.totalRouteCount} routes (${zodCoverage}%)`,
  });

  // Rate limiting
  checks.push({
    category: 'Rate Limiting',
    name: 'Rate limiting enabled',
    passed: params.hasRateLimiting,
    detail: params.hasRateLimiting ? 'Rate limiter active on AI routes' : 'Rate limiter not detected',
  });

  // CSP
  checks.push({
    category: 'Content Security',
    name: 'Content-Security-Policy',
    passed: params.hasCsp,
    detail: params.hasCsp ? 'CSP header configured' : 'CSP header missing',
  });

  // Prompt injection
  checks.push({
    category: 'AI Security',
    name: 'Prompt injection defense',
    passed: params.hasPromptInjectionDefense,
    detail: params.hasPromptInjectionDefense ? 'Prompt injection patterns detected and redacted' : 'No prompt injection defense',
  });

  // SQL injection
  checks.push({
    category: 'Database Security',
    name: 'SQL injection prevention',
    passed: params.usesPrisma,
    detail: params.usesPrisma ? 'Prisma ORM — parameterized queries by default' : 'Raw SQL — risk of injection',
  });

  // Auth
  const hasStrongAuth = params.authMethod !== 'none' && params.hasApiAuth;
  checks.push({
    category: 'Authentication',
    name: 'Authentication strength',
    passed: hasStrongAuth,
    detail: `${params.authMethod}${params.hasApiAuth ? ' + API auth verification' : ''}`,
  });

  const passed = checks.filter(c => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);
  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';

  return {
    score,
    grade,
    checks,
    summary: `Security Score: ${score}/100 (Grade ${grade}). ${passed}/${checks.length} checks passed.`,
  };
}

/** Generate a human-readable security report */
export function formatSecurityReport(audit: SecurityAudit): string {
  const lines: string[] = [
    '═══════════════════════════════════════',
    `  Security Audit Report — Grade: ${audit.grade} (${audit.score}/100)`,
    '═══════════════════════════════════════',
    '',
  ];

  for (const check of audit.checks) {
    const icon = check.passed ? '✅' : '❌';
    lines.push(`  ${icon} [${check.category}] ${check.name}: ${check.detail}`);
  }

  lines.push('', audit.summary, '', '═══════════════════════════════════════');
  return lines.join('\n');
}
