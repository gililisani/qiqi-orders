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
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-card rounded-md shadow-xl max-w-md w-full overflow-hidden border border-border"
            onClick={e => e.stopPropagation()}
          >
            <div className={`px-6 py-4 border-b ${isDanger ? 'border-brand-magenta/30 bg-brand-magenta/8' : 'border-border'}`}>
              <h3 className={`text-base font-semibold tracking-tight ${isDanger ? 'text-brand-magenta' : 'text-foreground'}`}>
                {pending.title}
              </h3>
            </div>

            <div className="px-6 py-4 space-y-3">
              {pending.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{pending.description}</p>
              )}

              {pending.bullets && pending.bullets.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {pending.bullets.map((b, i) => {
                    const isObj = typeof b === 'object';
                    const label = isObj ? b.label : b;
                    const href = isObj ? b.href : undefined;
                    return (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDanger ? 'bg-brand-magenta' : 'bg-muted-foreground'}`} />
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-periwinkle hover:underline"
                          >
                            {label} ↗
                          </a>
                        ) : (
                          <span className="text-foreground">{label}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {pending.warning && (
                <p className="text-xs text-brand-magenta bg-brand-magenta/8 border border-brand-magenta/30 rounded-md px-3 py-2">
                  {pending.warning}
                </p>
              )}

              {pending.requireExplicitConfirm && (
                <label className="flex items-start gap-2 text-sm text-foreground mt-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={e => setAcknowledged(e.target.checked)}
                    className="mt-0.5 accent-foreground"
                  />
                  <span>I understand this action cannot be undone.</span>
                </label>
              )}
            </div>

            <div className="px-6 py-3 bg-secondary/50 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="h-10 px-4 text-sm font-medium text-foreground bg-background border border-border rounded-md hover:bg-secondary transition-colors"
              >
                {pending.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                disabled={confirmDisabled}
                className={`h-10 px-4 text-sm font-medium text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                  isDanger ? 'bg-brand-magenta hover:bg-brand-magenta/90' : 'bg-primary hover:bg-primary/90'
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
