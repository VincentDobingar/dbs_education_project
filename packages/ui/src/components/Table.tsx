import type { ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Extra classes on this column's <th>/<td> — e.g. to widen a narrow numeric column. */
  className?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

/**
 * The `overflow-x-auto` wrapper + `border-b`/`last:border-0` row styling below was
 * copy-pasted across ~25 pages (audit design/sécu 2026-09-22) — this is that markup,
 * extracted once. Callers keep full control of cell content via `render`.
 */
export function Table<T>({ columns, rows, rowKey }: TableProps<T>): ReactNode {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {columns.map((column) => (
              <th key={column.key} className={`pb-2 pr-4 font-medium ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0">
              {columns.map((column) => (
                <td key={column.key} className={`py-2 pr-4 text-slate-700 ${column.className ?? ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
