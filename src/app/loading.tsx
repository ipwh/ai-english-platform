// ============================================
// Root Loading State — shown during page transitions
// ============================================

import { Loader2 } from 'lucide-react';

export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-teal-500 mx-auto" />
        <p className="text-sm text-gray-500 dark:text-gray-400">載入中... Loading...</p>
      </div>
    </div>
  );
}
