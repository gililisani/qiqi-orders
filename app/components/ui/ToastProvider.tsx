'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
  href?: { url: string; label: string };
  durationMs: number;
}

interface ToastAPI {
  success: (message: string, opts?: { href?: { url: string; label: string }; durationMs?: number }) => void;
  error: (message: string, opts?: { durationMs?: number }) => void;
  info: (message: string, opts?: { durationMs?: number }) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

let nextId = 1;

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((variant: ToastVariant, message: string, opts?: { href?: Toast['href']; durationMs?: number }) => {
    const id = nextId++;
    const duration = opts?.durationMs ?? (variant === 'error' ? 7000 : 4500);
    setToasts(prev => [...prev, { id, variant, message, href: opts?.href, durationMs: duration }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const api: ToastAPI = {
    success: (m, o) => add('success', m, o),
    error: (m, o) => add('error', m, o),
    info: (m, o) => add('info', m, o),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[2000] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.durationMs]);

  const styles = {
    success: 'bg-white border-l-4 border-green-500 text-gray-900',
    error: 'bg-white border-l-4 border-red-500 text-gray-900',
    info: 'bg-white border-l-4 border-blue-500 text-gray-900',
  }[toast.variant];

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ⓘ',
  }[toast.variant];

  const iconColor = {
    success: 'text-green-600',
    error: 'text-red-600',
    info: 'text-blue-600',
  }[toast.variant];

  return (
    <div
      className={`${styles} shadow-lg rounded px-4 py-3 flex items-start gap-3 pointer-events-auto animate-in slide-in-from-right`}
      role="status"
    >
      <span className={`${iconColor} font-bold text-lg leading-none mt-0.5`}>{icon}</span>
      <div className="flex-1 text-sm">
        <p>{toast.message}</p>
        {toast.href && (
          <a
            href={toast.href.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-xs mt-1 inline-block"
          >
            {toast.href.label} ↗
          </a>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-700 text-xs leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
