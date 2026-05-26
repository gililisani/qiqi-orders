'use client';

import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '../../../lib/permissions';

/**
 * Compact, checkbox-grid editor for a user's permission set.
 *
 * Used by the admin edit form for both clients and admins. The list of
 * permissions to display is configurable via the `available` prop —
 * client edit pages typically show only `dam`, `orders`, `reports`;
 * admin edit pages show the full catalog including `*:manage` and
 * `netsuite` / `settings`.
 *
 * The component itself is uncontrolled-input style: it renders against
 * the `value` array passed in and calls `onChange` with the new array
 * whenever a box is toggled.
 */

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  available?: Permission[];
  disabled?: boolean;
  helper?: string;
}

export function PermissionsField({
  value,
  onChange,
  available = ALL_PERMISSIONS,
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
                {PERMISSIONS[p]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function labelFor(p: Permission): string {
  // Take whatever comes before the colon (if any), capitalize first letter.
  const head = p.split(':')[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}
