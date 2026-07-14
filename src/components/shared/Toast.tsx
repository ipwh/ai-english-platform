// ============================================
// Toast 提示元件
// ============================================
'use client';

import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap = {
  success: 'bg-green-50 border-green-400 text-green-800 dark:bg-green-900 dark:text-green-200',
  error: 'bg-red-50 border-red-400 text-red-800 dark:bg-red-900 dark:text-red-200',
  info: 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  warning: 'bg-yellow-50 border-yellow-400 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const MAX_TOASTS = 4;

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => {
      const next = [...prev, { id, type, message }];
      // Limit to MAX_TOASTS — remove oldest
      if (next.length > MAX_TOASTS) return next.slice(next.length - MAX_TOASTS);
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" role="status" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];
          return (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={() => dismissToast(toast.id)}
              Icon={Icon}
              colorClass={colorMap[toast.type]}
              onRegisterTimer={(id, timer) => timersRef.current.set(id, timer)}
            />
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast, onDismiss, Icon, colorClass, onRegisterTimer,
}: {
  toast: Toast; onDismiss: () => void; Icon: React.ElementType; colorClass: string;
  onRegisterTimer: (id: string, timer: ReturnType<typeof setTimeout>) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(4000);


  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = setTimeout(onDismiss, remainingRef.current);
    onRegisterTimer(toast.id, timer);
    return () => { remainingRef.current -= (Date.now() - start); clearTimeout(timer); };
  }, [paused, onDismiss, toast.id, onRegisterTimer]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-slide-in ${colorClass}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="text-sm flex-1">{toast.message}</p>
      <button onClick={onDismiss} className="flex-shrink-0 hover:opacity-70">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
