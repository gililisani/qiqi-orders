'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, formatNumber } from '../../../../lib/formatters';

export interface FunnelRow {
  status: string;
  count: number;
  value: number;
}

const STATUS_COLOR: Record<string, string> = {
  Draft: '#9ca3af',
  Open: '#3b82f6',
  'In Process': '#f59e0b',
  Ready: '#8b5cf6',
  Done: '#10b981',
  Cancelled: '#ef4444',
};

export default function StatusFunnelChart({ data }: { data: FunnelRow[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        No orders in this period.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis
            type="category"
            dataKey="status"
            tick={{ fontSize: 12, fill: '#374151' }}
            width={90}
          />
          <Tooltip
            formatter={((_v: number, _n: string, item: any) => [
              `${formatNumber(item.payload.count)} orders · ${formatCurrency(item.payload.value)}`,
              item.payload.status,
            ]) as any}
            labelFormatter={(() => '') as any}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((row) => (
              <Cell key={row.status} fill={STATUS_COLOR[row.status] ?? '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
