import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { ScrollText, Search, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import type { AuditLog } from '@/types';

const PAGE_SIZE = 50;

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('audit_logs').select('*', { count: 'exact' });
    if (debouncedSearch) {
      query = query.or(`username.ilike.%${debouncedSearch}%,action.ilike.%${debouncedSearch}%,details.ilike.%${debouncedSearch}%`);
    }
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setLogs((data as AuditLog[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [debouncedSearch, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const exportData = logs.map((l) => ({
    username: l.username || '',
    action: l.action,
    details: l.details || '',
    created_at: new Date(l.created_at).toLocaleString('ar-EG'),
  }));

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleClearLogs = async () => {
    setClearing(true);
    setClearMsg(null);
    try {
      const { error } = await supabase.from('audit_logs').delete().neq('id', 0);
      if (error) throw error;
      setClearMsg({ type: 'success', text: 'تم محو السجل بنجاح' });
      setShowClearConfirm(false);
      setPage(1);
      loadLogs();
    } catch {
      setClearMsg({ type: 'error', text: 'حدث خطأ أثناء محو السجل' });
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ScrollText size={24} className="text-skyaccent-600" />
          <h2 className="text-lg font-bold text-slate-800">سجل العمليات</h2>
          <span className="bg-skyaccent-600 text-white text-sm font-bold rounded-full px-3 py-0.5 ltr-nums">
            {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={exportData}
            columns={[
              { header: 'المستخدم', key: 'username', width: 20 },
              { header: 'العملية', key: 'action', width: 25 },
              { header: 'التفاصيل', key: 'details', width: 40 },
              { header: 'التاريخ', key: 'created_at', width: 22 },
            ]}
            fileName="audit_logs.xlsx"
            sheetName="سجل العمليات"
            label="تصدير الصفحة الحالية"
          />
          {totalCount > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 rounded-xl bg-status-shortageBg text-status-shortage border border-status-shortage/30 px-4 py-2.5 text-sm font-medium hover:bg-status-shortage hover:text-white active:scale-95 transition-all"
            >
              <Trash2 size={18} />
              محو السجل
            </button>
          )}
        </div>
      </div>

      {clearMsg && (
        <div className={`flex items-center gap-2 rounded-xl p-3 text-sm animate-scale-in ${
          clearMsg.type === 'success'
            ? 'bg-status-matchedBg text-status-matched border border-status-matched/30'
            : 'bg-status-shortageBg text-status-shortage border border-status-shortage/30'
        }`}>
          {clearMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {clearMsg.text}
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-status-overage">
              <AlertTriangle size={24} />
              <h3 className="font-bold text-slate-800">محو السجل</h3>
            </div>
            <p className="text-sm text-slate-600">
              سيتم حذف جميع عمليات السجل ({totalCount} عملية). لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-xl bg-iceblue-100 text-slate-600 font-medium py-2.5 text-sm hover:bg-iceblue-200"
              >
                إلغاء
              </button>
              <button
                onClick={handleClearLogs}
                disabled={clearing}
                className="flex-1 rounded-xl bg-status-shortage text-white font-medium py-2.5 text-sm hover:bg-status-shortage/90 disabled:opacity-50"
              >
                {clearing ? 'جاري...' : 'تأكيد المحو'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في كل السجل..."
          className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-iceblue-200">
          <ScrollText size={48} className="mx-auto text-iceblue-300 mb-3" />
          <p className="text-slate-500 font-medium">لا توجد عمليات مسجلة</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="divide-y divide-iceblue-100">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 hover:bg-iceblue-50 transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-iceblue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <ScrollText size={14} className="text-skyaccent-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{log.username || 'غير معروف'}</span>
                    <span className="text-xs text-slate-400 ltr-nums">{formatTime(log.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{log.action}</p>
                  {log.details && (
                    <p className="text-xs text-slate-400 mt-0.5">{log.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
