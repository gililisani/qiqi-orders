'use client';

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../../components/qq/table';
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
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead
              key={String(c.key)}
              className={c.align === 'right' ? 'text-right' : undefined}
              style={c.width ? { width: c.width } : undefined}
            >
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {columns.map((c) => (
              <TableCell
                key={String(c.key)}
                className={
                  c.align === 'right'
                    ? 'text-right font-mono text-sm tabular-nums'
                    : undefined
                }
              >
                {c.render ? c.render(row) : String(row[c.key as keyof Row] ?? '')}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
