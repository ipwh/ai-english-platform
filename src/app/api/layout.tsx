// ============================================
// API Routes Layout — 強制所有 API routes 為 dynamic
// 防止 next build 時預渲染 API routes（它們永遠是 runtime-only）
// Cloud Run 需要這個設定，因為 build 環境沒有真正的 DB/環境變數
// ============================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
