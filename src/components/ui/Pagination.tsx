import React, { useId } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun for the range summary, e.g. "assets". */
  itemLabel?: string;
}

const NAV_BUTTON =
  'p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  itemLabel = 'items'
}) => {
  const sizeId = useId();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 text-xs text-slate-400"
    >
      <p aria-live="polite">
        Showing <span className="font-semibold text-slate-200">{first.toLocaleString()}–{last.toLocaleString()}</span> of{' '}
        <span className="font-semibold text-slate-200">{totalItems.toLocaleString()}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <label htmlFor={sizeId}>Rows per page</label>
            <select
              id={sizeId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button type="button" className={NAV_BUTTON} onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page">
            <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" className={NAV_BUTTON} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="px-2 text-slate-300">
            Page <span className="font-semibold text-white">{page}</span> of {totalPages}
          </span>
          <button type="button" className={NAV_BUTTON} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" className={NAV_BUTTON} onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} aria-label="Last page">
            <ChevronsRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
};
