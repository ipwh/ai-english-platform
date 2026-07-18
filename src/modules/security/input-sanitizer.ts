// Sprint 15: Input Sanitizer — prompt injection, XSS, SQL injection prevention

// ============================================
// Prompt Injection Prevention
// ============================================

const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: string; label: string }> = [
  // System prompt override attempts
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|constraints?)/i, severity: 'critical', label: 'Ignore instructions' },
  { pattern: /you\s+are\s+now\s+(a\s+)?(different|new|another)\s+(AI|model|assistant|system)/i, severity: 'critical', label: 'Role override' },
  { pattern: /system\s*(prompt|message|instruction):\s*/i, severity: 'critical', label: 'System prompt injection' },
  { pattern: /<[|]im_start[|]>|<[|]im_end[|]>/i, severity: 'critical', label: 'ChatML injection' },
  { pattern: new RegExp('\\[INST\\]|\\[\\\\/INST\\]', 'i'), severity: 'critical' as const, label: 'Llama instruction injection' },

  // Jailbreak attempts
  { pattern: /DAN\s*(mode|prompt|jailbreak)|do\s+anything\s+now/i, severity: 'high', label: 'DAN jailbreak' },
  { pattern: /pretend\s+(to\s+be|you\s+are)\s+(a\s+)?(human|person|someone)/i, severity: 'high', label: 'Identity spoofing' },
  { pattern: /bypass\s+(filter|restriction|rule|safety|content)/i, severity: 'high', label: 'Filter bypass' },

  // Data extraction
  { pattern: /(reveal|show|display|print|output)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?|config)/i, severity: 'medium', label: 'Prompt extraction' },
  { pattern: /what\s+(is|are)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i, severity: 'medium', label: 'Prompt query' },
  { pattern: /(tell|give)\s+me\s+(your|the)\s+(secret|hidden|internal)\s+(prompt|instruction|rule)/i, severity: 'medium', label: 'Secret extraction' },
];

// ============================================
// XSS Prevention
// ============================================

const XSS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<script[\s>]/i, label: 'Script tag' },
  { pattern: /javascript\s*:/i, label: 'JavaScript URI' },
  { pattern: /on\w+\s*=\s*["']/i, label: 'Event handler' },
  { pattern: /<iframe[\s>]/i, label: 'Iframe' },
  { pattern: /<object[\s>]/i, label: 'Object tag' },
  { pattern: /<embed[\s>]/i, label: 'Embed tag' },
  { pattern: new RegExp('data\\s*:\\s*text\\/html', 'i'), label: 'Data URI HTML' },
  { pattern: /eval\s*\(/i, label: 'Eval call' },
  { pattern: /document\.(cookie|write|domain)/i, label: 'Document access' },
];

// ============================================
// Personal Data Patterns (HK-specific)
// ============================================

const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /[A-Z]\d{6,7}\([A-Z\d]\)/, label: 'HKID' },                          // HKID: A123456(7)
  { pattern: /(\+852[\s-]?)?[2-9]\d{7}/, label: 'HK Phone' },                       // HK phone
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, label: 'Email' },    // Email
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, label: 'IP Address' },       // IP
  { pattern: /\b(?:\d[ -]*?){13,16}\b/, label: 'Credit Card' },                       // Credit card
];

// ============================================
// Sanitization Functions
// ============================================

export interface SanitizeResult {
  sanitized: string;
  wasModified: boolean;
  threats: ThreatDetection[];
  /** Risk score 0-100 (higher = more threats) */
  riskScore: number;
}

export interface ThreatDetection {
  type: 'prompt-injection' | 'xss' | 'pii';
  severity: 'critical' | 'high' | 'medium' | 'low';
  label: string;
  match: string;
}

/**
 * Sanitize user input for AI prompts.
 * Detects prompt injection, XSS, and PII.
 * Returns sanitized text + threat report.
 */
export function sanitizeInput(input: string, options?: {
  maxLength?: number;
  stripPii?: boolean;
  detectInjection?: boolean;
}): SanitizeResult {
  const maxLength = options?.maxLength ?? 15000;
  const stripPii = options?.stripPii ?? true;
  const detectInjection = options?.detectInjection ?? true;

  let text = input.slice(0, maxLength);
  const threats: ThreatDetection[] = [];
  let wasModified = false;

  // 1. Prompt injection detection
  if (detectInjection) {
    for (const { pattern, severity, label } of PROMPT_INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        threats.push({ type: 'prompt-injection', severity: severity as ThreatDetection['severity'], label, match: match[0] });
        if (severity === 'critical') {
          // Redact critical injection patterns
          text = text.replace(pattern, '[REDACTED]');
          wasModified = true;
        }
      }
    }
  }

  // 2. XSS detection
  for (const { pattern, label } of XSS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      threats.push({ type: 'xss', severity: 'high', label, match: match[0] });
      text = text.replace(pattern, '');
      wasModified = true;
    }
  }

  // 3. PII detection + redaction
  if (stripPii) {
    for (const { pattern, label } of PII_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        threats.push({ type: 'pii', severity: 'high', label, match: match[0] });
        text = text.replace(pattern, '[PII REDACTED]');
        wasModified = true;
      }
    }
  }

  // 4. Null byte injection
  if (text.includes('\0')) {
    threats.push({ type: 'prompt-injection', severity: 'critical', label: 'Null byte injection', match: '\\0' });
    text = text.replace(/\0/g, '');
    wasModified = true;
  }

  // Calculate risk score
  const riskScore = calculateRiskScore(threats);

  return { sanitized: text.trim(), wasModified, threats, riskScore };
}

function calculateRiskScore(threats: ThreatDetection[]): number {
  if (threats.length === 0) return 0;
  let score = 0;
  for (const t of threats) {
    switch (t.severity) {
      case 'critical': score += 30; break;
      case 'high': score += 15; break;
      case 'medium': score += 5; break;
      case 'low': score += 1; break;
    }
  }
  return Math.min(100, score);
}

// ============================================
// SQL Injection Check (defense-in-depth)
// ============================================

const SQL_INJECTION_PATTERNS = [
  /(\bUNION\b.*\bSELECT\b)/i,
  /(\bDROP\s+TABLE\b)/i,
  /(\bALTER\s+TABLE\b)/i,
  /(\bINSERT\s+INTO\b.*\bVALUES\b)/i,
  /(\bDELETE\s+FROM\b)/i,
  /(';\s*(DROP|ALTER|INSERT|DELETE|UPDATE|SELECT))/i,
  /(\bEXEC\b.*\bxp_\w+)/i,
  /(\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/i,
];

/** Check if a string contains SQL injection patterns (defense-in-depth — Prisma handles this) */
export function detectSqlInjection(input: string): ThreatDetection[] {
  const threats: ThreatDetection[] = [];
  for (const pattern of SQL_INJECTION_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      threats.push({ type: 'prompt-injection', severity: 'critical', label: 'SQL Injection', match: match[0] });
    }
  }
  return threats;
}

// ============================================
// Content Security Policy
// ============================================

/** Validate Content-Security-Policy header value */
export function validateCsp(csp: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!csp) { issues.push('CSP header is empty'); return { valid: false, issues }; }
  if (csp.includes('unsafe-inline') && csp.includes('script-src')) {
    issues.push("'unsafe-inline' in script-src — consider using nonces or hashes");
  }
  if (csp.includes('unsafe-eval')) {
    issues.push("'unsafe-eval' allows eval() — restrict if not needed");
  }
  if (!csp.includes('frame-ancestors')) {
    issues.push("Missing 'frame-ancestors' — vulnerable to clickjacking");
  }
  if (!csp.includes('object-src')) {
    issues.push("Missing 'object-src' — consider 'object-src: none'");
  }
  return { valid: issues.length === 0, issues };
}
