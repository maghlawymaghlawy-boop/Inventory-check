import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { FileUpload } from '@/components/FileUpload';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Scale, Upload, CheckCircle, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Equal, Check, Search } from 'lucide-react';
import type { InventoryEntry, SystemStock, MasterItem } from '@/types';

const PAGE_SIZE = 50;

interface ReconciliationRow {
  entry_id: number;
  item_no: string;
  item_description: string;
  qty_per_core: number;
  boxes: number;
  units: number;
  inventoried_total: number;
  system_qty: number;
  difference: number;
  status: 'matched' | 'shortage' | 'overage' | 'no_system';
}

export function StaffReconciliationPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [systemStock, setSystemStock] = useState<SystemStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let itemNoFilter: string[] | null = null;
    if (debouncedSearch) {
      const { data: matchedItems } = await supabase
        .from('master_items')
        .select('item_no')
        .or(`item_no.ilike.%${debouncedSearch}%,item_description.ilike.%${debouncedSearch}%`);
      itemNoFilter = (matchedItems as MasterItem[] | null)?.map((m) => m.item_no) || [];
    }

    let query = supabase
      .from('inventory_entries')
      .select('*', { count: 'exact' })
      .eq('staff_id', user.id)
      .eq('confirmed', false);

    if (debouncedSearch) {
      if (itemNoFilter && itemNoFilter.length > 0) {
        query = query.in('item_no', itemNoFilter);
      } else {
        query = query.ilike('item_no', `%${debouncedSearch}%`);
      }
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data: entryData, count } = await query.order('item_description', { ascending: true, nullsFirst: false }).range(from, from + PAGE_SIZE - 1);
    setEntries((entryData as InventoryEntry[]) || []);
    setTotalCount(count || 0);

    const { data: stockData } = await supabase
      .from('system_stock')
      .select('*')
      .order('item_no');
    setSystemStock((stockData as SystemStock[]) || []);

    setLoading(false);
  }, [user, debouncedSearch, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stockMap = new Map<string, SystemStock>();
  systemStock.forEach((s) => stockMap.set(s.item_no, s));

  const reconData: ReconciliationRow[] = entries.map((e) => {
    const stock = stockMap.get(e.item_no);
    const sysQty = stock?.system_qty || 0;
    const diff = e.total_units - sysQty;
    return {
      entry_id: e.id,
      item_no: e.item_no,
      item_description: e.item_description || '',
      qty_per_core: e.qty_per_core,
      boxes: e.boxes,
      units: e.units,
      inventoried_total: e.total_units,
      system_qty: sysQty,
      difference: diff,
      status: stock ? (diff === 0 ? 'matched' : diff < 0 ? 'shortage' : 'overage') : 'no_system',
    };
  });

  const handleParsed = async (rows: Record<string, unknown>[]) => {
    setUploading(true);
    setMsg(null);

    try {
      const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
      const findKey = (patterns: string[]): string | undefined => {
        for (const p of patterns) {
          const norm = p.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
          const match = keys.find((k) => k.toLowerCase().replace(/\s+/g, '').replace(/_/g, '') === norm);
          if (match) return match;
        }
        return undefined;
      };
      const codeKey = findKey(['item no', 'item_no', 'code', 'كود', 'الكود', 'barcode']);
      const qtyKey = findKey(['inventory', 'system qty', 'system_qty', 'qty', 'quantity', 'الكمية', 'الرصيد']);

      const mapped = rows.map((row) => ({
        item_no: String(codeKey ? row[codeKey] ?? '' : '').trim(),
        item_description: '',
        system_qty: parseFloat(String(qtyKey ? row[qtyKey] ?? '0' : '0')) || 0,
      })).filter((r) => r.item_no);

      if (mapped.length === 0) {
        setMsg({ type: 'error', text: 'لم يتم العثور على بيانات صحيحة' });
        setUploading(false);
        return;
      }

      await supabase.from('system_stock').delete().neq('id', 0);

      const batchSize = 500;
      for (let i = 0; i < mapped.length; i += batchSize) {
        const batch = mapped.slice(i, i + batchSize);
        const { error } = await supabase.from('system_stock').insert(batch);
        if (error) throw error;
      }

      setMsg({ type: 'success', text: `تم رفع ${mapped.length} صنف من المخزون النظامي` });
      loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'فشل رفع البيانات' });
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmAll = async () => {
    if (!user || totalCount === 0) return;
    if (!confirm('سيتم نقل جميع الأكواد المجرودة إلى السجل. هل أنت متأكد؟')) return;

    setConfirming(true);
    try {
      const { data: allEntries } = await supabase
        .from('inventory_entries')
        .select('id, item_no, total_units')
        .eq('staff_id', user.id)
        .eq('confirmed', false);

      const entryIds = (allEntries || []).map((e: { id: number }) => e.id);
      if (entryIds.length === 0) {
        setMsg({ type: 'error', text: 'لا توجد أصناف للتأكيد' });
        return;
      }

      const { data: stockData } = await supabase
        .from('system_stock')
        .select('item_no, system_qty');
      const stockMap = new Map<string, number>();
      (stockData || []).forEach((s: { item_no: string; system_qty: number }) => {
        stockMap.set(s.item_no, s.system_qty);
      });

      for (const entry of (allEntries || []) as { id: number; item_no: string; total_units: number }[]) {
        const sysQty = stockMap.get(entry.item_no) || 0;
        const diff = entry.total_units - sysQty;
        await supabase
          .from('inventory_entries')
          .update({
            confirmed: true,
            confirmed_at: new Date().toISOString(),
            confirmed_system_qty: sysQty,
            confirmed_difference: diff,
          })
          .eq('id', entry.id);
      }

      setMsg({ type: 'success', text: 'تم نقل جميع الأكواد إلى السجل' });
      setPage(1);
      loadData();
    } catch {
      setMsg({ type: 'error', text: 'حدث خطأ أثناء التأكيد' });
    } finally {
      setConfirming(false);
    }
  };

  const matchedCount = reconData.filter((r) => r.status === 'matched').length;
  const shortageCount = reconData.filter((r) => r.status === 'shortage').length;
  const overageCount = reconData.filter((r) => r.status === 'overage').length;

  const exportData = reconData.map((r) => ({
    item_no: r.item_no,
    item_description: r.item_description,
    qty_per_core: r.qty_per_core,
    boxes: r.boxes,
    units: r.units,
    inventoried_total: r.inventoried_total,
    system_qty: r.system_qty,
    difference: r.difference,
    status: r.status === 'matched' ? 'مطابق' : r.status === 'shortage' ? 'عجز' : r.status === 'overage' ? 'زيادة' : 'لا يوجد مخزون نظامي',
  }));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Scale size={24} className="text-skyaccent-600" />
          <h2 className="text-lg font-bold text-slate-800">مطابقة الأرصدة</h2>
        </div>
        {totalCount > 0 && (
          <button
            onClick={handleConfirmAll}
            disabled={confirming}
            className="flex items-center gap-2 rounded-xl bg-status-matched text-white px-4 py-2.5 text-sm font-medium hover:bg-status-matched/90 active:scale-95 disabled:opacity-50 transition-all"
          >
            <Check size={18} />
            {confirming ? 'جاري النقل...' : 'تم - نقل للسجل'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-status-matched/20 p-3 text-center">
          <div className="w-9 h-9 rounded-full bg-status-matchedBg flex items-center justify-center mx-auto mb-1.5">
            <Equal size={18} className="text-status-matched" />
          </div>
          <p className="text-xs text-slate-500">مطابق</p>
          <p className="text-lg font-bold text-status-matched ltr-nums">{matchedCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-status-shortage/20 p-3 text-center">
          <div className="w-9 h-9 rounded-full bg-status-shortageBg flex items-center justify-center mx-auto mb-1.5">
            <TrendingDown size={18} className="text-status-shortage" />
          </div>
          <p className="text-xs text-slate-500">عجز</p>
          <p className="text-lg font-bold text-status-shortage ltr-nums">{shortageCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-status-overage/20 p-3 text-center">
          <div className="w-9 h-9 rounded-full bg-status-overageBg flex items-center justify-center mx-auto mb-1.5">
            <TrendingUp size={18} className="text-status-overage" />
          </div>
          <p className="text-xs text-slate-500">زيادة</p>
          <p className="text-lg font-bold text-status-overage ltr-nums">{overageCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-iceblue-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Upload size={18} className="text-skyaccent-600" />
          <h3 className="font-semibold text-slate-700 text-sm">رفع مخزون النظام (Excel/CSV)</h3>
        </div>
        <p className="text-xs text-slate-500">الأعمدة المطلوبة: item no, inventory</p>
        <FileUpload onParsed={handleParsed} label="اختيار ملف المخزون النظامي" />

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-skyaccent-600">
            <RefreshCw size={16} className="animate-spin" />
            جاري الرفع...
          </div>
        )}

        {msg && (
          <div className={`flex items-center gap-2 rounded-xl p-3 text-sm animate-scale-in ${
            msg.type === 'success'
              ? 'bg-status-matchedBg text-status-matched border border-status-matched/30'
              : 'bg-status-shortageBg text-status-shortage border border-status-shortage/30'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {msg.text}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-600">
          الأصناف: <span className="font-bold text-skyaccent-600 ltr-nums">{totalCount}</span>
        </p>
        <ExportButton
          data={exportData}
          columns={[
            { header: 'كود الصنف', key: 'item_no', width: 20 },
            { header: 'اسم الصنف', key: 'item_description', width: 30 },
            { header: 'علب', key: 'boxes', width: 10 },
            { header: 'وحدات', key: 'units', width: 10 },
            { header: 'إجمالي مجرود', key: 'inventoried_total', width: 14 },
            { header: 'رصيد النظام', key: 'system_qty', width: 14 },
            { header: 'الفرق', key: 'difference', width: 10 },
            { header: 'الحالة', key: 'status', width: 15 },
          ]}
          fileName={`staff_reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`}
          sheetName="المطابقة"
          label="تصدير الصفحة الحالية"
        />
      </div>

      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في كل الأصناف..."
          className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : reconData.length > 0 ? (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-iceblue-50 text-slate-600 sticky top-0 z-10">
                <tr>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">الكود</th>
                  <th className="text-right py-2.5 px-3 font-medium">الاسم</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">مجرود</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">النظام</th>
                  <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">الفرق</th>
                  <th className="text-right py-2.5 px-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iceblue-100">
                {reconData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-iceblue-50">
                    <td className="py-2 px-3 ltr-nums font-mono text-xs text-slate-700">{row.item_no}</td>
                    <td className="py-2 px-3 text-slate-700 text-xs max-w-[150px] truncate">{row.item_description}</td>
                    <td className="py-2 px-3 ltr-nums text-slate-700">{row.inventoried_total}</td>
                    <td className="py-2 px-3 ltr-nums text-slate-700">{row.system_qty}</td>
                    <td className={`py-2 px-3 ltr-nums font-bold ${
                      row.difference === 0 ? 'text-slate-600' :
                      row.difference < 0 ? 'text-status-shortage' : 'text-status-overage'
                    }`}>
                      {row.difference > 0 ? '+' : ''}{row.difference}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        row.status === 'matched' ? 'bg-status-matchedBg text-status-matched' :
                        row.status === 'shortage' ? 'bg-status-shortageBg text-status-shortage' :
                        row.status === 'overage' ? 'bg-status-overageBg text-status-overage' :
                        'bg-iceblue-100 text-slate-500'
                      }`}>
                        {row.status === 'matched' ? 'مطابق' : row.status === 'shortage' ? 'عجز' : row.status === 'overage' ? 'زيادة' : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <div className="text-center py-10 bg-white rounded-2xl border border-iceblue-200">
          <Scale size={40} className="mx-auto text-iceblue-300 mb-2" />
          <p className="text-slate-500 font-medium text-sm">لا توجد أصناف للمطابقة</p>
          <p className="text-xs text-slate-400 mt-1">قم بجرد الأصناف أولاً ثم ارفع مخزون النظام</p>
        </div>
      )}
    </div>
  );
}
