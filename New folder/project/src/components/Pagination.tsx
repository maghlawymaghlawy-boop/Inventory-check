import { ChevronRight, ChevronLeft } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalItems === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-iceblue-100">
      <p className="text-xs text-slate-500 ltr-nums">
        {from} - {to} من {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-iceblue-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
        >
          <ChevronRight size={18} />
        </button>
        {renderPageButtons(page, totalPages, onPageChange)}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-iceblue-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
        >
          <ChevronLeft size={18} />
        </button>
      </div>
    </div>
  );
}

function renderPageButtons(current: number, total: number, onPageChange: (p: number) => void) {
  const buttons: (number | string)[] = [];
  const maxVisible = 5;

  if (total <= maxVisible + 2) {
    for (let i = 1; i <= total; i++) buttons.push(i);
  } else {
    buttons.push(1);
    if (current > 3) buttons.push('…');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) buttons.push(i);
    if (current < total - 2) buttons.push('…');
    buttons.push(total);
  }

  return buttons.map((b, idx) =>
    typeof b === 'string' ? (
      <span key={`e${idx}`} className="px-2 text-slate-400 text-sm">…</span>
    ) : (
      <button
        key={b}
        onClick={() => onPageChange(b)}
        className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
          b === current
            ? 'bg-skyaccent-600 text-white'
            : 'text-slate-600 hover:bg-iceblue-100'
        }`}
      >
        {b}
      </button>
    )
  );
}
