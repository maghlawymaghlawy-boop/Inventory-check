import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { CheckCircle, Search, Trash2, Pencil, Save, X, Package } from 'lucide-react';
import type { InventoryEntry, MasterItem } from '@/types';

const PAGE_SIZE = 50;

export function InventoriedItemsPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBoxes, setEditBoxes] = useState('');
  const [editUnits, setEditUnits] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editItem, setEditItem] = useState<MasterItem | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from('inventory_entries')
      .select('*', { count: 'exact' })
      .eq('staff_id', user.id)
      .eq('confirmed', false);
    if (debouncedSearch) {
      query = query.or(`item_no.ilike.%${debouncedSearch}%,item_description.ilike.%${debouncedSearch}%`);
    }
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.order('item_description', { ascending: true, nullsFirst: false }).range(from, from + PAGE_SIZE - 1);
    setEntries((data as InventoryEntry[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [user, debouncedSearch, page]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleDelete = async (entry: InventoryEntry) => {
    if (!user) return;
    if (!confirm('هل تريد حذف هذا الصنف؟ سيعود إلى قائمة الأكواد المطلوب جردها.')) return;

    await supabase.from('inventory_entries').delete().eq('id', entry.id);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    await supabase.from('task_assignments').insert({
      staff_id: user.id,
      week_start: weekStartStr,
      item_no: entry.item_no,
    });

    loadEntries();
  };

  const startEdit = (entry: InventoryEntry) => {
    setEditingId(entry.id);
    setEditBoxes(String(entry.boxes));
    setEditUnits(String(entry.units));
    setEditCode(entry.item_no);
    setEditItem({
      id: 0,
      item_no: entry.item_no,
      item_description: entry.item_description,
      qty_per_core: entry.qty_per_core,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBoxes('');
    setEditUnits('');
    setEditCode('');
    setEditItem(null);
  };

  const searchEditCode = async (code: string) => {
    if (!code) {
      setEditItem(null);
      return;
    }
    const { data } = await supabase
      .from('master_items')
      .select('*')
      .eq('item_no', code)
      .maybeSingle();
    setEditItem(data as MasterItem | null);
  };

  const saveEdit = async (entry: InventoryEntry) => {
    if (!editItem) return;

    const newBoxes = parseInt(editBoxes || '0');
    const newUnits = parseInt(editUnits || '0');
    const newTotal = newBoxes * editItem.qty_per_core + newUnits;

    await supabase
      .from('inventory_entries')
      .update({
        item_no: editCode,
        item_description: editItem.item_description,
        qty_per_core: editItem.qty_per_core,
        boxes: newBoxes,
        units: newUnits,
        total_units: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id);

    cancelEdit();
    loadEntries();
  };

  const exportData = entries.map((e) => ({
    item_no: e.item_no,
    item_description: e.item_description || '',
    qty_per_core: e.qty_per_core,
    boxes: e.boxes,
    units: e.units,
    total_units: e.total_units,
    entry_date: e.entry_date,
  }));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle size={24} className="text-status-matched" />
          <h2 className="text-lg font-bold text-slate-800">الأكواد المجرودة</h2>
          <span className="bg-status-matched text-white text-sm font-bold rounded-full px-3 py-0.5 ltr-nums">
            {totalCount}
          </span>
        </div>
        <ExportButton
          data={exportData}
          columns={[
            { header: 'كود الصنف', key: 'item_no', width: 20 },
            { header: 'اسم الصنف', key: 'item_description', width: 35 },
            { header: 'وحدات/علبة', key: 'qty_per_core', width: 12 },
            { header: 'العلب', key: 'boxes', width: 10 },
            { header: 'الوحدات', key: 'units', width: 10 },
            { header: 'الإجمالي', key: 'total_units', width: 12 },
            { header: 'التاريخ', key: 'entry_date', width: 15 },
          ]}
          fileName="inventoried_items.xlsx"
          sheetName="الأصناف المجرودة"
          label="تصدير الصفحة الحالية"
        />
      </div>

      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالكود أو الاسم في كل الأكواد..."
          className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none transition-all"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-iceblue-200">
          <Package size={48} className="mx-auto text-iceblue-300 mb-3" />
          <p className="text-slate-500 font-medium">لا توجد أصناف مجرودة بعد</p>
          <p className="text-sm text-slate-400 mt-1">ابدأ بجرد الأصناف من شاشة الإدخال السريع</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="divide-y divide-iceblue-100">
            {entries.map((entry) => (
              <div key={entry.id} className="p-3 hover:bg-iceblue-50 transition-all animate-fade-in">
                {editingId === entry.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">كود الصنف</label>
                      <input
                        type="text"
                        value={editCode}
                        onChange={(e) => {
                          setEditCode(e.target.value);
                          searchEditCode(e.target.value);
                        }}
                        className="w-full rounded-lg border-2 border-iceblue-200 px-3 py-2 text-sm ltr-nums focus:border-skyaccent-400 focus:outline-none"
                        dir="ltr"
                      />
                      {editItem && (
                        <p className="text-xs text-status-matched mt-1">{editItem.item_description}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">العلب</label>
                        <input
                          type="number"
                          value={editBoxes}
                          onChange={(e) => setEditBoxes(e.target.value)}
                          className="w-full rounded-lg border-2 border-iceblue-200 px-3 py-2 text-sm ltr-nums focus:border-skyaccent-400 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">الوحدات</label>
                        <input
                          type="number"
                          value={editUnits}
                          onChange={(e) => setEditUnits(e.target.value)}
                          className="w-full rounded-lg border-2 border-iceblue-200 px-3 py-2 text-sm ltr-nums focus:border-skyaccent-400 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-iceblue-50 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-600">الإجمالي:</span>
                      <span className="font-bold text-skyaccent-600 ltr-nums">
                        {(parseInt(editBoxes || '0') * (editItem?.qty_per_core || 1)) + parseInt(editUnits || '0')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(entry)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-status-matched text-white text-sm font-medium py-2 hover:bg-status-matched/90"
                      >
                        <Save size={16} />
                        حفظ
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-iceblue-100 text-slate-600 text-sm font-medium py-2 hover:bg-iceblue-200"
                      >
                        <X size={16} />
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-status-matchedBg flex items-center justify-center shrink-0">
                      <CheckCircle size={18} className="text-status-matched" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">
                        {entry.item_description || 'بدون اسم'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                        <span className="ltr-nums font-mono">{entry.item_no}</span>
                        <span className="ltr-nums">علب: {entry.boxes}</span>
                        <span className="ltr-nums">وحدات: {entry.units}</span>
                        <span className="ltr-nums font-bold text-skyaccent-600">الإجمالي: {entry.total_units}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(entry)}
                        className="p-2 rounded-lg text-skyaccent-600 hover:bg-skyaccent-50 transition-all"
                        title="تعديل"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(entry)}
                        className="p-2 rounded-lg text-status-shortage hover:bg-status-shortageBg transition-all"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
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
