// ============================================
// OAuth env normalization
// Trim copied secrets to avoid invalid_client caused by trailing spaces/newlines.
// ============================================

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
