'use client';

import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { label: 'Worklist', href: '/admin/inventory-investigation' },
  { label: 'Negatives History', href: '/admin/inventory-investigation/negatives-history' },
];

export function InvTabs() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 border-b border-border mb-4">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <button
            key={t.href}
            onClick={() => router.push(t.href)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  const map: Record<number, { label: string; cls: string }> = {
    1: { label: 'T1 Toxic', cls: 'bg-red-100 text-red-800' },
    2: { label: 'T2 Compounding', cls: 'bg-amber-100 text-amber-800' },
    3: { label: 'T3 Dormant', cls: 'bg-sky-100 text-sky-800' },
    4: { label: 'T4 Historical', cls: 'bg-slate-100 text-slate-600' },
  };
  const m = map[tier] ?? map[4];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}
