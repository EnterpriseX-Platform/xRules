'use client';
// Reusable entity list — table view used by flows, test-suites, simulations, etc.
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusPill, Pill } from './ui/Pill';

export interface Column<T> {
  header: string;
  cell: (row: T, i: number) => React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

export function EntityTable<T extends { id: string }>({
  rows, columns, isLoading, emptyText, emptyIcon: EmptyIcon, hrefFor,
}: {
  rows: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyText?: string;
  emptyIcon?: any;
  hrefFor?: (row: T) => string | undefined;
}) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/30 border-b border-border">
          <tr className="text-left">
            <th className="py-3 px-4 label-section w-12">#</th>
            {columns.map((c, i) => (
              <th key={i} className={`py-3 px-4 label-section ${c.align === 'right' ? 'text-right' : ''}`} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
            {hrefFor && <th className="py-3 px-4 label-section w-12"></th>}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={columns.length + 2} className="text-center py-12 text-subtle font-mono text-sm">Loading…</td></tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={columns.length + 2} className="text-center py-16">
              {EmptyIcon && <EmptyIcon className="h-10 w-10 mx-auto text-subtle/40 mb-2" />}
              <div className="text-sm text-subtle">{emptyText || 'No items'}</div>
            </td></tr>
          )}
          {rows.map((row, i) => {
            const href = hrefFor?.(row);
            const Cells = (
              <>
                <td className="py-3 px-4 row-index">{String(i + 1).padStart(2, '0')}</td>
                {columns.map((c, ci) => (
                  <td key={ci} className={`py-3 px-4 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.cell(row, i)}
                  </td>
                ))}
                {href && <td className="py-3 px-4 text-right"><ChevronRight className="h-4 w-4 text-subtle inline" /></td>}
              </>
            );
            if (href) {
              return (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => (window.location.href = href)}>
                  {Cells}
                </tr>
              );
            }
            return <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">{Cells}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export { StatusPill, Pill };
