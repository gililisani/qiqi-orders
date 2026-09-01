'use client';

import {
  ADMIN_PERMISSION_GROUPS,
  CLIENT_PERMISSIONS,
  type Permission,
} from '../../../lib/permissions';

/**
 * Permission editors.
 *
 * `AdminPermissionsField` — the category grid for admins (2026-09 model):
 * one row per sidebar category with View / Edit checkboxes (or a single
 * "Enabled" box for the enable-only areas). Checking Edit auto-checks View;
 * unchecking View also drops Edit — Edit without View is meaningless.
 *
 * `PermissionsField` — the flat checkbox list, still used for CLIENTS
 * (their `orders` / `dam` / `reports` vocabulary is unchanged).
 *
 * Both are controlled: they render against `value` and call `onChange`
 * with the new array on every toggle.
 */

interface AdminProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  helper?: string;
}

export function AdminPermissionsField({ value, onChange, disabled = false, helper }: AdminProps) {
  const has = (p: string) => value.includes(p);

  const setKeys = (add: string[], remove: string[]) => {
    if (disabled) return;
    const next = value.filter((x) => !remove.includes(x));
    for (const k of add) if (!next.includes(k)) next.push(k);
    onChange(next);
  };

  return (
    <div>
      {helper && <p className="text-xs text-muted-foreground mb-2">{helper}</p>}
      <div className="rounded-md border border-border divide-y divide-border">
        <div className="grid grid-cols-[1fr_4rem_4rem] gap-2 px-3 py-2 bg-secondary/40 text-xs font-medium text-muted-foreground">
          <span>Category</span>
          <span className="text-center">View</span>
          <span className="text-center">Edit</span>
        </div>
        {ADMIN_PERMISSION_GROUPS.map((g) => (
          <div
            key={g.category}
            className="grid grid-cols-[1fr_4rem_4rem] gap-2 px-3 py-2 items-center"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{g.category}</span>
              <span className="block text-xs text-muted-foreground">{g.description}</span>
            </span>
            {g.single ? (
              <label className="col-span-2 flex justify-center">
                <input
                  type="checkbox"
                  checked={has(g.single)}
                  onChange={() => setKeys(has(g.single!) ? [] : [g.single!], has(g.single!) ? [g.single!] : [])}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-border"
                  aria-label={`${g.category} enabled`}
                />
              </label>
            ) : (
              <>
                <label className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={has(g.view!)}
                    onChange={() =>
                      has(g.view!)
                        ? setKeys([], [g.view!, g.edit!]) // dropping View drops Edit too
                        : setKeys([g.view!], [])
                    }
                    disabled={disabled}
                    className="h-4 w-4 rounded border-border"
                    aria-label={`${g.category} view`}
                  />
                </label>
                <label className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={has(g.edit!)}
                    onChange={() =>
                      has(g.edit!)
                        ? setKeys([], [g.edit!])
                        : setKeys([g.view!, g.edit!], []) // Edit implies View
                    }
                    disabled={disabled}
                    className="h-4 w-4 rounded border-border"
                    aria-label={`${g.category} edit`}
                  />
                </label>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  available?: Permission[];
  disabled?: boolean;
  helper?: string;
}

const CLIENT_KEYS = Object.keys(CLIENT_PERMISSIONS) as Array<keyof typeof CLIENT_PERMISSIONS>;

export function PermissionsField({
  value,
  onChange,
  available = CLIENT_KEYS,
  disabled = false,
  helper,
}: Props) {
  const has = (p: string) => value.includes(p);

  const toggle = (p: Permission) => {
    if (disabled) return;
    const next = has(p) ? value.filter((x) => x !== p) : [...value, p];
    onChange(next);
  };

  return (
    <div>
      {helper && (
        <p className="text-xs text-muted-foreground mb-2">{helper}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {available.map((p) => (
          <label
            key={p}
            className={[
              'flex items-start gap-2 rounded-md border border-border px-3 py-2 cursor-pointer transition-colors',
              has(p)
                ? 'bg-secondary/50 border-foreground/30'
                : 'bg-card hover:bg-secondary/30',
              disabled ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={has(p)}
              onChange={() => toggle(p)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {labelFor(p)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {(CLIENT_PERMISSIONS as Record<string, string>)[p] ?? p}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function labelFor(p: string): string {
  // Take whatever comes before the colon (if any), capitalize first letter.
  const head = p.split(':')[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}
