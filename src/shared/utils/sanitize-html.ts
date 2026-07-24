// Sprint 102: HTML Sanitizer — prevent XSS in user-generated content
// Lightweight: strips dangerous tags/attributes without external dependencies.
// For production use, consider DOMPurify (isomorphic) or sanitize-html.

const DANGEROUS_TAGS = /<\/?(script|iframe|object|embed|link|style|meta|form|input|button|svg|math)[^>]*>/gi;
const DANGEROUS_ATTRS = /\s(on\w+|href\s*=\s*["']javascript:|style\s*=\s*["'][^"']*expression\s*\(|style\s*=\s*["'][^"']*behavior\s*:)/gi;

/**
 * Sanitize user-generated HTML content for safe rendering.
 * Strips dangerous tags (script, iframe, etc.) and event handler attributes.
 * Safe tags like <b>, <i>, <p>, <br>, <ul>, <li> are preserved.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_ATTRS, ' data-sanitized="$1"')
    .trim();
}

/**
 * Sanitize plain text for safe rendering in HTML context.
 * Escapes HTML entities to prevent injection.
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Safe render: sanitizes HTML and escapes if needed.
 * Use this for any user-generated content displayed in JSX.
 */
export function safeRender(content: string | null | undefined): string {
  if (!content) return '';
  // If content looks like it contains HTML tags, sanitize
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return sanitizeHtml(content);
  }
  // Otherwise, escape for safety
  return escapeHtml(content);
}
