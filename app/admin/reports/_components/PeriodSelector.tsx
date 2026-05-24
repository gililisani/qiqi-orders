'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const PRESETS: Array<{ key: '30d' | '90d' | 'ytd'; label: string }> = [
  { key: '30d', label: 'Last 30d' },
  { key: '90d', label: 'Last 90d' },
  { key: 'ytd', label: 'YTD' },
];

export default function PeriodSelector({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  const pick = useCallback(
    (key: string) => {
      const params = new URLSearchParams(sp.toString());
      params.set('window', key);
      params.delete('from');
      params.delete('to');
      router.push(`/admin/reports?${params.toString()}`);
    },
    [router, sp],
  );

  return (
    <div className="inline-flex rounded-lg border border-[#e5e5e5] bg-white p-1">
      {PRESETS.map((p) => {
        const active = current === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => pick(p.key)}
            className={[
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              active
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100',
            ].join(' ')}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
