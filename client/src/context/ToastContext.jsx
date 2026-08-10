import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import cn from '../utils/cn';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message, tone = 'info', ttl = 4000) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error', 6000),
      info: (m) => push(m, 'info'),
    }),
    [push]
  );

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tones = {
    success: 'border-emerald-200 bg-white text-emerald-800',
    error: 'border-red-200 bg-white text-red-800',
    info: 'border-ink-200 bg-white text-ink-800',
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.tone] || Info;
          return (
            <div
              key={t.id}
              role="status"
              className={cn('pointer-events-auto flex animate-fade-up items-start gap-2 rounded-lg border p-3 text-sm shadow-pop', tones[t.tone])}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 break-words">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-600" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}
