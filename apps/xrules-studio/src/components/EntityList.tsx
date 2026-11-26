'use client';
// Reusable entity list — table view used by flows, test-suites, simulations, etc.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { StatusPill, Pill } from './ui/Pill';

export interface Column<T> {
  header: string;
  cell: (row: T, i: number) => React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

export function EntityTable<T extends { id: string }>({
  rows, columns, isLoading, emptyText, emptyIcon: EmptyIcon, emptyBody, emptyCta, hrefFor, rowProps,
}: {
  rows: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyText?: string;
  emptyIcon?: any;
  emptyBody?: string;
  emptyCta?: React.ReactNode;
  hrefFor?: (row: T) => string | undefined;
  rowProps?: (row: T) => React.HTMLAttributes<HTMLTableRowElement> & { draggable?: boolean };
}) {
  const router = useRouter();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="bg-[#e0e0e0]">
          <tr className="text-left">
            {columns.map((c, i) => (
              <th key={i} className={`h-12 px-4 text-[14px] font-semibold text-[#161616] ${c.align === 'right' ? 'text-right' : ''}`} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
            {hrefFor && <th className="w-12"></th>}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={columns.length + 1} className="h-12" /></tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="py-12">
              <div className="max-w-md mx-auto text-center">
                <div className="text-[16px] text-[#161616] mb-4">{emptyText || 'Nothing here yet'}</div>
                {/* no explanation under an empty list; the button says what to do */}
                {emptyCta && <div className="flex justify-center">{emptyCta}</div>}
              </div>
            </td></tr>
          )}
          {rows.map((row, i) => {
            const href = hrefFor?.(row);
            const Cells = (
              <>
                {columns.map((c, ci) => (
                  <td key={ci} className={`h-12 px-4 text-[14px] ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.cell(row, i)}
                  </td>
                ))}
                {href && <td className="py-3 px-4 text-right"><ChevronRight className="h-4 w-4 text-[#525252] inline" /></td>}
              </>
            );
            if (href) {
              return (
                <tr key={row.id} className="border-t border-[#e0e0e0] hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(href)} {...rowProps?.(row)}>
                  {Cells}
                </tr>
              );
            }
            return <tr key={row.id} className="border-t border-[#e0e0e0] hover:bg-[#f4f4f4]" {...rowProps?.(row)}>{Cells}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export { StatusPill, Pill };
