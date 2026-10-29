import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { parseExcelFile } from '@/lib/excel';

interface FileUploadProps {
  onParsed: (rows: Record<string, unknown>[]) => void;
  accept?: string;
  label?: string;
  hint?: string;
  children?: ReactNode;
}

export function FileUpload({ onParsed, accept = '.xlsx,.xls,.csv', label, hint, children }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'success' | 'error'>('idle');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [rowCount, setRowCount] = useState(0);

  const handleFile = async (file: File) => {
    setStatus('reading');
    setFileName(file.name);
    setError('');
    try {
      const rows = await parseExcelFile(file);
      setRowCount(rows.length);
      setStatus('success');
      onParsed(rows);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'فشل قراءة الملف');
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-2xl border-2 border-dashed border-iceblue-300 bg-iceblue-50 hover:bg-iceblue-100 hover:border-skyaccent-400 transition-all p-6 text-center"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {children || (
          <>
            <FileSpreadsheet size={40} className="mx-auto text-skyaccent-600 mb-2" />
            <p className="font-semibold text-slate-700">{label || 'اضغط لاختيار ملف Excel'}</p>
            {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
          </>
        )}
      </div>

      {status === 'reading' && (
        <div className="flex items-center gap-2 text-sm text-skyaccent-600 animate-fade-in">
          <Upload size={18} className="animate-spin" />
          جاري قراءة الملف: {fileName}
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm text-status-matched animate-fade-in">
          <CheckCircle size={18} />
          تم قراءة {rowCount} صف من {fileName}
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-status-shortage animate-fade-in">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
    </div>
  );
}
