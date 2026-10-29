import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { ClipboardList, Search, Inbox } from 'lucide-react';
import type { TaskAssignment, MasterItem } from '@/types';

const PAGE_SIZE = 50;

interface TaskWithItem extends TaskAssignment {
  item_description: string | null;
  qty_per_core: number | null;
}

export function AssignedTasksPage() {
  const { user } = useAuth();
  const [allTasks, setAllTasks] = useState<TaskWithItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: tasksData } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('staff_id', user.id);

    if (!tasksData || tasksData.length === 0) {
      setAllTasks([]);
      setLoading(false);
      return;
    }

    const itemNos = tasksData.map((t: TaskAssignment) => t.item_no);
    const { data: itemsData } = await supabase
      .from('master_items')
      .select('item_no, item_description, qty_per_core')
      .in('item_no', itemNos);

    const itemMap = new Map<string, MasterItem>();
    (itemsData || []).forEach((item: MasterItem) => {
      itemMap.set(item.item_no, item);
    });

    const combined: TaskWithItem[] = tasksData.map((t: TaskAssignment) => {
      const item = itemMap.get(t.item_no);
      return {
        ...t,
        item_description: item?.item_description || null,
        qty_per_core: item?.qty_per_core || null,
      };
    }).sort((a, b) => {
      const descA = (a.item_description || '').trim().toLowerCase();
      const descB = (b.item_description || '').trim().toLowerCase();
      if (descA < descB) return -1;
      if (descA > descB) return 1;
      return 0;
    });

    setAllTasks(combined);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = debouncedSearch
    ? allTasks.filter((t) => {
        const q = debouncedSearch.toLowerCase();
        return (
          t.item_no.toLowerCase().includes(q) ||
          (t.item_description || '').toLowerCase().includes(q)
        );
      })
    : allTasks;

  const totalCount = filteredTasks.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const from = (page - 1) * PAGE_SIZE;
  const tasks = filteredTasks.slice(from, from + PAGE_SIZE);

  const exportData = tasks.map((t) => ({
    item_no: t.item_no,
    item_description: t.item_description || '',
    qty_per_core: t.qty_per_core || '',
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={24} className="text-skyaccent-600" />
          <h2 className="text-lg font-bold text-slate-800">الأكواد المطلوب جردها</h2>
          <span className="bg-skyaccent-600 text-white text-sm font-bold rounded-full px-3 py-0.5 ltr-nums">
            {totalCount}
          </span>
        </div>
        <ExportButton
          data={exportData}
          columns={[
            { header: 'كود الصنف', key: 'item_no', width: 20 },
            { header: 'اسم الصنف', key: 'item_description', width: 35 },
            { header: 'وحدات/علبة', key: 'qty_per_core', width: 12 },
          ]}
          fileName="assigned_tasks.xlsx"
          sheetName="الأكواد المطلوبة"
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
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-iceblue-200">
          <Inbox size={48} className="mx-auto text-iceblue-300 mb-3" />
          <p className="text-slate-500 font-medium">لا توجد أكواد مطلوب جردها</p>
          <p className="text-sm text-slate-400 mt-1">تم جرد جميع الأصناف المعينة أو لم يتم تعيين أكواد بعد</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="divide-y divide-iceblue-100">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 hover:bg-iceblue-50 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-iceblue-100 flex items-center justify-center shrink-0">
                  <ClipboardList size={18} className="text-skyaccent-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">
                    {task.item_description || 'بدون اسم'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    <span className="ltr-nums font-mono">{task.item_no}</span>
                    {task.qty_per_core != null && (
                      <span className="ltr-nums">وحدة/علبة: {task.qty_per_core}</span>
                    )}
                  </div>
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
