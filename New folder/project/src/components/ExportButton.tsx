import { Download } from 'lucide-react';
import { exportToExcel, type ExportColumn } from '@/lib/excel';

interface ExportButtonProps {
  data: Record<string, unknown>[];
  columns: ExportColumn[];
  fileName: string;
  sheetName?: string;
  label?: string;
  disabled?: boolean;
}

export function ExportButton({
  data,
  columns,
  fileName,
  sheetName,
  label = 'تصدير Excel',
  disabled,
}: ExportButtonProps) {
  const handleExport = () => {
    if (!data || data.length === 0) return;
    exportToExcel(data, columns, fileName, sheetName);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || !data || data.length === 0}
      className="flex items-center gap-2 rounded-xl bg-status-matched text-white px-4 py-2.5 text-sm font-medium hover:bg-status-matched/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
    >
      <Download size={18} />
      {label}
    </button>
  );
}
