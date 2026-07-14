// ============================================
// CountdownTimer — Assignment due date countdown
// Shows remaining time with color coding:
//   >24h: blue, <24h: amber, <1h: red pulsing
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  dueDate: string | Date;
  onExpired?: () => void;
  className?: string;
}

export default function CountdownTimer({ dueDate, onExpired, className = '' }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const deadline = new Date(dueDate).getTime();

    const tick = () => {
      const now = Date.now();
      const diff = deadline - now;

      if (diff <= 0) {
        setExpired(true);
        setRemaining(null);
        onExpired?.();
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining({ hours, minutes, seconds });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [dueDate, onExpired]);

  if (expired) {
    return (
      <span className={`inline-flex items-center gap-1 text-red-600 font-medium text-sm ${className}`}>
        <AlertTriangle className="w-4 h-4" />
        已過期 Overdue
      </span>
    );
  }

  if (!remaining) return null;

  const isUrgent = remaining.hours < 1;
  const isWarning = remaining.hours < 24;

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${className} ${
      isUrgent ? 'text-red-500 animate-pulse' : isWarning ? 'text-amber-600' : 'text-blue-600'
    }`}>
      <Clock className="w-4 h-4" />
      {remaining.hours > 0 && `${remaining.hours}h `}
      {String(remaining.minutes).padStart(2, '0')}m{' '}
      {String(remaining.seconds).padStart(2, '0')}s
    </span>
  );
}
