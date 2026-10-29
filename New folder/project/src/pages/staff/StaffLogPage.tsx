import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { ScrollText, Search, CheckCircle, TrendingUp, TrendingDown, Equal } from 'lucide-react';
import type { InventoryEntry, SystemStock, MasterItem } from '@/types';

const PAGE_SIZE = 50;

interface LogRow {
  entry: InventoryEntry;
  system_qty: number;
  difference: number;
  status: 'matched' | 'shortage' | 'overage' | 'no_system';
}

export function StaffLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [systemStock, setSystemStock] = useState<SystemStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadEntries = useCallback(async () => {
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
      .eq('confirmed', true);

    if (debouncedSearch) {
      if (itemNoFilter && itemNoFilter.length > 0) {
        query = query.in('item_no', itemNoFilter);
      } else {
        query = query.ilike('item_no', `%${debouncedSearch}%`);
      }
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.order('confirmed_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setEntries((data as InventoryEntry[]) || []);
    setTotalCount(count || 0);

    const { data: stockData } = await supabase
      .from('system_stock')
      .select('*')
      .order('item_no');
    setSystemStock((stockData as SystemStock[]) || []);

    setLoading(false);
  }, [user, debouncedSearch, page]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const stockMap = new Map<string, SystemStock>();
  systemStock.forEach((s) => stockMap.set(s.item_no, s));

  const logRows: LogRow[] = entries.map((e) => {
    const sysQty = e.confirmed_system_qty != null ? e.confirmed_system_qty : (stockMap.get(e.item_no)?.system_qty || 0);
    const diff = e.confirmed_difference != null ? e.confirmed_difference : (e.total_units - sysQty);
    return {
      entry: e,
      system_qty: sysQty,
      difference: diff,
      status: e.confirmed_difference != null
        ? (diff === 0 ? 'matched' : diff < 0 ? 'shortage' : 'overage')
        : (stockMap.has(e.item_no) ? (diff === 0 ? 'matched' : diff < 0 ? 'shortage' : 'overage') : 'no_system'),
    };
  });

  const matchedCount = logRows.filter((r) => r.status === 'matched').length;
  const shortageCount = logRows.filter((r) => r.status === 'shortage').length;
  const overageCount = logRows.filter((r) => r.status === 'overage').length;

  const exportData = logRows.map((r) => ({
    item_no: r.entry.item_no,
    item_description: r.entry.item_description || '',
    qty_per_core: r.entry.qty_per_core,
    boxes: r.entry.boxes,
    units: r.entry.units,
    total_units: r.entry.total_units,
    system_qty: r.system_qty,
    difference: r.difference,
    status: r.status === 'matched' ? 'مطابق' : r.status === 'shortage' ? 'عجز' : r.status === 'overage' ? 'زيادة' : 'لا يوجد',
    entry_date: r.entry.entry_date,
    confirmed_at: r.entry.confirmed_at ? new Date(r.entry.confirmed_at).toLocaleString('ar-EG') : '',
  }));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ScrollText size={24} className="text-skyaccent-600" />
          <h2 className="text-lg font-bold text-slate-800">السجل</h2>
          <span className="bg-skyaccent-600 text-white text-sm font-bold rounded-full px-3 py-0.5 ltr-nums">
            {totalCount}
          </span>
        </div>
        <ExportButton
          data={exportData}
          columns={[
            { header: 'كود الصنف', key: 'item_no', width: 20 },
            { header: 'اسم الصنف', key: 'item_description', width: 30 },
            { header: 'وحدات/علبة', key: 'qty_per_core', width: 12 },
            { header: 'علب', key: 'boxes', width: 10 },
            { header: 'وحدات', key: 'units', width: 10 },
            { header: 'الإجمالي', key: 'total_units', width: 12 },
            { header: 'رصيد النظام', key: 'system_qty', width: 14 },
            { header: 'الفرق', key: 'difference', width: 10 },
            { header: 'الحالة', key: 'status', width: 15 },
            { header: 'تاريخ الجرد', key: 'entry_date', width: 15 },
            { header: 'تاريخ التأكيد', key: 'confirmed_at', width: 20 },
          ]}
          fileName={`staff_log_${new Date().toISOString().split('T')[0]}.xlsx`}
          sheetName="السجل"
          label="تصدير الصفحة الحالية"
        />
      </div>

      {/* Summary cards */}
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
      ) : logRows.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-iceblue-200">
          <ScrollText size={40} className="mx-auto text-iceblue-300 mb-2" />
          <p className="text-slate-500 font-medium text-sm">لا توجد أصناف مؤكدة في السجل</p>
          <p className="text-xs text-slate-400 mt-1">قم بالمطابقة ونقل الأصناف من شاشة المطابقة</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="divide-y divide-iceblue-100">
            {logRows.map((row) => (
              <div
                key={row.entry.id}
                className="flex items-center gap-3 p-3 hover:bg-iceblue-50 transition-all"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  row.status === 'matched' ? 'bg-status-matchedBg' :
                  row.status === 'shortage' ? 'bg-status-shortageBg' :
                  row.status === 'overage' ? 'bg-status-overageBg' :
                  'bg-iceblue-100'
                }`}>
                  {row.status === 'matched' ? <CheckCircle size={16} className="text-status-matched" /> :
                   row.status === 'shortage' ? <TrendingDown size={16} className="text-status-shortage" /> :
                   row.status === 'overage' ? <TrendingUp size={16} className="text-status-overage" /> :
                   <Equal size={16} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">
                    {row.entry.item_description || 'بدون اسم'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                    <span className="ltr-nums font-mono">{row.entry.item_no}</span>
                    <span className="ltr-nums">علب: {row.entry.boxes}</span>
                    <span className="ltr-nums">وحدات: {row.entry.units}</span>
                    <span className="ltr-nums font-bold text-skyaccent-600">إجمالي: {row.entry.total_units}</span>
                    <span className="ltr-nums">النظام: {row.system_qty}</span>
                    <span className={`ltr-nums font-bold ${
                      row.difference === 0 ? 'text-slate-600' :
                      row.difference < 0 ? 'text-status-shortage' : 'text-status-overage'
                    }`}>
                      الفرق: {row.difference > 0 ? '+' : ''}{row.difference}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    row.status === 'matched' ? 'bg-status-matchedBg text-status-matched' :
                    row.status === 'shortage' ? 'bg-status-shortageBg text-status-shortage' :
                    row.status === 'overage' ? 'bg-status-overageBg text-status-overage' :
                    'bg-iceblue-100 text-slate-500'
                  }`}>
                    {row.status === 'matched' ? 'مطابق' : row.status === 'shortage' ? 'عجز' : row.status === 'overage' ? 'زيادة' : '—'}
                  </span>
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
