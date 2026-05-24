'use client';

import { formatCurrency, formatNumber } from '../../../../lib/formatters';

export interface TopColumn<Row> {
  header: string;
  key: keyof Row | string;
  align?: 'left' | 'right';
  render?: (row: Row) => React.ReactNode;
  width?: string;
}

export default function TopTable<Row extends Record<string, any>>({
  rows,
  columns,
  emptyMessage = 'No data',
}: {
  rows: Row[];
  columns: TopColumn<Row>[];
  emptyMessage?: string;
}) {
  if (!rows || rows.length === 0) {
    return <div className="py-8 text-sm text-gray-500 text-center">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-[#e5e5e5]">
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className={[
                  'py-2 pr-3 font-medium',
                  c.align === 'right' ? 'text-right' : 'text-left',
                ].join(' ')}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#f1f5f9] last:border-0">
              {columns.map((c) => (
                <td
                  key={String(c.key)}
                  className={[
                    'py-2 pr-3',
                    c.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                  ].join(' ')}
                >
                  {c.render ? c.render(row) : String(row[c.key as keyof Row] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { formatCurrency, formatNumber };
