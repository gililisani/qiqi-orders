'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  bullets?: Array<string | { label: string; href?: string }>;
  warning?: string; // small red note at the bottom (e.g. "This action cannot be undone")
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  requireExplicitConfirm?: boolean; // if true, shows a checkbox the user must tick
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    setAcknowledged(false);
    return new Promise<boolean>(resolve => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    if (pending) pending.resolve(result);
    setPending(null);
    setAcknowledged(false);
  };

  const isDanger = pending?.variant === 'danger';
  const confirmDisabled = pending?.requireExplicitConfirm && !acknowledged;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className={`px-6 py-4 border-b ${isDanger ? 'border-red-100 bg-red-50' : 'border-gray-100'}`}>
              <h3 className={`text-lg font-semibold ${isDanger ? 'text-red-900' : 'text-gray-900'}`}>
                {pending.title}
              </h3>
            </div>

            <div className="px-6 py-4 space-y-3">
              {pending.description && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{pending.description}</p>
              )}

              {pending.bullets && pending.bullets.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {pending.bullets.map((b, i) => {
                    const isObj = typeof b === 'object';
                    const label = isObj ? b.label : b;
                    const href = isObj ? b.href : undefined;
                    return (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDanger ? 'bg-red-500' : 'bg-gray-400'}`} />
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {label} ↗
                          </a>
                        ) : (
                          <span className="text-gray-800">{label}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {pending.warning && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {pending.warning}
                </p>
              )}

              {pending.requireExplicitConfirm && (
                <label className="flex items-start gap-2 text-sm text-gray-700 mt-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={e => setAcknowledged(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I understand this action cannot be undone.</span>
                </label>
              )}
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                {pending.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                disabled={confirmDisabled}
                className={`px-4 py-2 text-sm text-white rounded disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:opacity-90'
                }`}
              >
                {pending.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
