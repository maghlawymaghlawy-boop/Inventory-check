import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { exportToExcel } from '@/lib/excel';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Eye, Search, Play, AlertTriangle, CheckCircle, Users, Package, ClipboardList, TrendingUp, TrendingDown, Equal, X } from 'lucide-react';
import type { InventoryEntry, AppUser, SystemStock, MasterItem } from '@/types';

const PAGE_SIZE = 50;

interface MonitorRow {
  entry: InventoryEntry;
  system_qty: number;
  difference: number;
  status: 'matched' | 'shortage' | 'overage' | 'no_system';
}

export function InventoryMonitoringPage() {
  const { user: currentUser } = useAuth();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [systemStock, setSystemStock] = useState<SystemStock[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [staffProgress, setStaffProgress] = useState<{ staffId: string; assigned: number; inventoried: number }[]>([]);
  const [showProgressPopover, setShowProgressPopover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStaff, setFilterStaff] = useState('all');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [startMsg, setStartMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch, filterStaff]);

  const loadData = useCallback(async () => {
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
      .eq('confirmed', true);

    if (filterStaff !== 'all') {
      query = query.eq('staff_id', filterStaff);
    }

    if (debouncedSearch) {
      if (itemNoFilter && itemNoFilter.length > 0) {
        query = query.in('item_no', itemNoFilter);
      } else {
        query = query.ilike('item_no', `%${debouncedSearch}%`);
      }
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data: entryData, count } = await query
      .order('item_description', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    setEntries((entryData as InventoryEntry[]) || []);
    setTotalCount(count || 0);

    const { data: stockData } = await supabase
      .from('system_stock')
      .select('*')
      .order('item_no');
    setSystemStock((stockData as SystemStock[]) || []);

    const { data: staffData } = await supabase
      .from('app_users')
      .select('*')
      .eq('role', 'staff')
      .order('username');
    setStaff((staffData as AppUser[]) || []);

    const { count: assignedCount } = await supabase
      .from('task_assignments')
      .select('*', { count: 'exact', head: true });
    setTotalAssigned(assignedCount || 0);

    const { data: assignmentsByStaff } = await supabase
      .from('task_assignments')
      .select('staff_id');
    const assignedMap = new Map<string, number>();
    (assignmentsByStaff as { staff_id: string }[] | null)?.forEach((row) => {
      assignedMap.set(row.staff_id, (assignedMap.get(row.staff_id) || 0) + 1);
    });

    const { data: inventoriedByStaff } = await supabase
      .from('inventory_entries')
      .select('staff_id');
    const inventoriedMap = new Map<string, number>();
    (inventoriedByStaff as { staff_id: string | null }[] | null)?.forEach((row) => {
      if (row.staff_id) {
        inventoriedMap.set(row.staff_id, (inventoriedMap.get(row.staff_id) || 0) + 1);
      }
    });

    const progress = ((staffData as AppUser[]) || []).map((s) => ({
      staffId: s.id,
      assigned: assignedMap.get(s.id) || 0,
      inventoried: inventoriedMap.get(s.id) || 0,
    }));
    setStaffProgress(progress);

    setLoading(false);
  }, [debouncedSearch, filterStaff, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const staffMap = new Map<string, AppUser>();
  staff.forEach((s) => staffMap.set(s.id, s));

  const stockMap = new Map<string, SystemStock>();
  systemStock.forEach((s) => stockMap.set(s.item_no, s));

  const monitorRows: MonitorRow[] = entries.map((e) => {
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

  const matchedCount = monitorRows.filter((r) => r.status === 'matched').length;
  const shortageCount = monitorRows.filter((r) => r.status === 'shortage').length;
  const overageCount = monitorRows.filter((r) => r.status === 'overage').length;

  const inventoriedCount = totalCount;
  const progressPercent = totalAssigned > 0 ? Math.round((inventoriedCount / (totalAssigned + inventoriedCount)) * 100) : (inventoriedCount > 0 ? 100 : 0);

  const exportData = monitorRows.map((r) => ({
    staff: staffMap.get(r.entry.staff_id || '')?.full_name || staffMap.get(r.entry.staff_id || '')?.username || '',
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

  const handleStartNewInventory = async () => {
    setStartingNew(true);
    setStartMsg(null);

    try {
      const { data: allEntries } = await supabase
        .from('inventory_entries')
        .select('*')
        .eq('confirmed', true);

      if (allEntries && allEntries.length > 0) {
        const exportRows = allEntries.map((e: InventoryEntry) => {
          const stock = stockMap.get(e.item_no);
          const sysQty = stock?.system_qty || 0;
          const diff = e.total_units - sysQty;
          const status = stock ? (diff === 0 ? 'مطابق' : diff < 0 ? 'عجز' : 'زيادة') : 'لا يوجد';
          return {
            'الموظف': staffMap.get(e.staff_id || '')?.full_name || staffMap.get(e.staff_id || '')?.username || '',
            'كود الصنف': e.item_no,
            'اسم الصنف': e.item_description || '',
            'وحدات/علبة': e.qty_per_core,
            'علب': e.boxes,
            'وحدات': e.units,
            'الإجمالي': e.total_units,
            'رصيد النظام': sysQty,
            'الفرق': diff,
            'الحالة': status,
            'تاريخ الجرد': e.entry_date,
            'تاريخ التأكيد': e.confirmed_at ? new Date(e.confirmed_at).toLocaleString('ar-EG') : '',
          };
        });
        exportToExcel(
          exportRows,
          [
            { header: 'الموظف', key: 'الموظف', width: 20 },
            { header: 'كود الصنف', key: 'كود الصنف', width: 20 },
            { header: 'اسم الصنف', key: 'اسم الصنف', width: 30 },
            { header: 'وحدات/علبة', key: 'وحدات/علبة', width: 12 },
            { header: 'علب', key: 'علب', width: 10 },
            { header: 'وحدات', key: 'وحدات', width: 10 },
            { header: 'الإجمالي', key: 'الإجمالي', width: 12 },
            { header: 'رصيد النظام', key: 'رصيد النظام', width: 14 },
            { header: 'الفرق', key: 'الفرق', width: 10 },
            { header: 'الحالة', key: 'الحالة', width: 15 },
            { header: 'تاريخ الجرد', key: 'تاريخ الجرد', width: 15 },
            { header: 'تاريخ التأكيد', key: 'تاريخ التأكيد', width: 20 },
          ],
          `inventory_log_${new Date().toISOString().split('T')[0]}.xlsx`,
          'سجل الجرد'
        );
      }

      await supabase.from('inventory_entries').delete().neq('id', 0);
      await supabase.from('system_stock').delete().neq('id', 0);
      await supabase.from('task_assignments').delete().neq('id', 0);

      if (currentUser) {
        await supabase.rpc('log_audit', {
          p_user_id: currentUser.id,
          p_username: currentUser.username,
          p_action: 'بدء جرد جديد',
          p_details: `تم تصدير السجل ومسح جميع البيانات (${allEntries?.length || 0} صنف)`,
        });
      }

      setStartMsg({ type: 'success', text: `تم تصدير السجل ومسح جميع البيانات بنجاح. جاهز لبدء جرد جديد.` });
      setShowStartConfirm(false);
      setPage(1);
      loadData();
    } catch {
      setStartMsg({ type: 'error', text: 'حدث خطأ أثناء بدء جرد جديد' });
    } finally {
      setStartingNew(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Eye size={24} className="text-skyaccent-600" />
          <h2 className="text-lg font-bold text-slate-800">متابعة الجرد</h2>
        </div>
        <button
          onClick={() => setShowStartConfirm(true)}
          className="flex items-center gap-2 rounded-xl bg-skyaccent-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-skyaccent-700 active:scale-95 transition-all shadow-sm"
        >
          <Play size={18} />
          بدء جرد جديد
        </button>
      </div>

      {startMsg && (
        <div className={`flex items-center gap-2 rounded-xl p-3 text-sm animate-scale-in ${
          startMsg.type === 'success'
            ? 'bg-status-matchedBg text-status-matched border border-status-matched/30'
            : 'bg-status-shortageBg text-status-shortage border border-status-shortage/30'
        }`}>
          {startMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {startMsg.text}
        </div>
      )}

      {showStartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setShowStartConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-status-overage">
              <AlertTriangle size={24} />
              <h3 className="font-bold text-slate-800">بدء جرد جديد</h3>
            </div>
            <p className="text-sm text-slate-600">
              سيتم تصدير سجل الجرد الحالي ({totalCount} صنف) إلى ملف Excel، ثم مسح جميع البيانات (الجرد، المخزون النظامي، التعيينات) استعداداً لجرد جديد.
            </p>
            <p className="text-sm font-medium text-status-shortage">هذا الإجراء لا يمكن التراجع عنه!</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowStartConfirm(false)}
                className="flex-1 rounded-xl bg-iceblue-100 text-slate-600 font-medium py-2.5 text-sm hover:bg-iceblue-200"
              >
                إلغاء
              </button>
              <button
                onClick={handleStartNewInventory}
                disabled={startingNew}
                className="flex-1 rounded-xl bg-status-shortage text-white font-medium py-2.5 text-sm hover:bg-status-shortage/90 disabled:opacity-50"
              >
                {startingNew ? 'جاري...' : 'تأكيد وبدء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress tracking */}
      <div className="bg-white rounded-2xl border border-iceblue-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={20} className="text-skyaccent-600" />
          <h3 className="font-semibold text-slate-700 text-sm">تقدم الجرد</h3>
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <ClipboardList size={16} className="text-slate-400" />
              <span className="text-slate-500">المطلوب: </span>
              <span className="font-bold text-slate-700 ltr-nums">{totalAssigned + inventoriedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle size={16} className="text-status-matched" />
              <span className="text-slate-500">تم جرده: </span>
              <span className="font-bold text-status-matched ltr-nums">{inventoriedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Package size={16} className="text-skyaccent-600" />
              <span className="text-slate-500">المتبقي: </span>
              <button
                onClick={() => setShowProgressPopover(true)}
                className="font-bold text-skyaccent-600 ltr-nums hover:underline cursor-pointer"
              >
                {totalAssigned}
              </button>
            </div>
          </div>
          <span className="text-2xl font-bold text-skyaccent-600 ltr-nums">{progressPercent}%</span>
        </div>
        <div className="w-full h-3 bg-iceblue-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-skyaccent-400 to-skyaccent-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Per-staff progress popover */}
      {showProgressPopover && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
          onClick={() => setShowProgressPopover(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-skyaccent-600" />
                <h3 className="font-bold text-slate-800 text-sm">تقدم الموظفين</h3>
              </div>
              <button
                onClick={() => setShowProgressPopover(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-iceblue-100 hover:text-slate-600 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {staffProgress.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">لا توجد بيانات</p>
              ) : staffProgress.map((sp) => {
                const s = staffMap.get(sp.staffId);
                const name = s?.full_name || s?.username || 'غير معروف';
                const total = sp.assigned + sp.inventoried;
                const pct = total > 0 ? Math.round((sp.inventoried / total) * 100) : 0;
                return (
                  <div key={sp.staffId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 truncate">{name}</span>
                      <span className="text-xs text-slate-500 ltr-nums shrink-0">
                        {sp.inventoried} / {total} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-iceblue-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-skyaccent-400 to-skyaccent-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-iceblue-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package size={18} className="text-skyaccent-600" />
            <p className="text-xs text-slate-500">مؤكدة</p>
          </div>
          <p className="text-2xl font-bold text-skyaccent-600 ltr-nums">{totalCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-iceblue-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={18} className="text-skyaccent-600" />
            <p className="text-xs text-slate-500">موظفون</p>
          </div>
          <p className="text-2xl font-bold text-skyaccent-600 ltr-nums">{staff.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-status-matched/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Equal size={18} className="text-status-matched" />
            <p className="text-xs text-slate-500">مطابق</p>
          </div>
          <p className="text-2xl font-bold text-status-matched ltr-nums">{matchedCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-status-shortage/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={18} className="text-status-shortage" />
            <p className="text-xs text-slate-500">عجز / زيادة</p>
          </div>
          <p className="text-2xl font-bold text-status-shortage ltr-nums">{shortageCount + overageCount}</p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في كل الأكواد..."
            className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
          />
        </div>
        <select
          value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value)}
          className="rounded-xl border-2 border-iceblue-200 bg-white px-3 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
        >
          <option value="all">جميع الموظفين</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name || s.username}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-600">
          عرض: <span className="font-bold text-skyaccent-600 ltr-nums">{totalCount}</span> صنف
        </p>
        <ExportButton
          data={exportData}
          columns={[
            { header: 'الموظف', key: 'staff', width: 20 },
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
          fileName={`monitoring_${new Date().toISOString().split('T')[0]}.xlsx`}
          sheetName="متابعة الجرد"
          label="تصدير الصفحة الحالية"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : monitorRows.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-iceblue-200">
          <Eye size={40} className="mx-auto text-iceblue-300 mb-2" />
          <p className="text-slate-500 font-medium text-sm">لا توجد أصناف مؤكدة بعد</p>
          <p className="text-xs text-slate-400 mt-1">سيظهر هنا ما قام جميع الموظفين بجرده وتأكيده</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="divide-y divide-iceblue-100">
            {monitorRows.map((row) => (
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
                <div className="text-xs text-slate-500 text-left shrink-0">
                  <p className="font-medium">{staffMap.get(row.entry.staff_id || '')?.full_name || staffMap.get(row.entry.staff_id || '')?.username || '—'}</p>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
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
