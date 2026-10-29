import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileUpload } from '@/components/FileUpload';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { ClipboardList, Upload, CheckCircle, AlertCircle, Users, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import type { AppUser, TaskAssignment } from '@/types';

const PAGE_SIZE = 50;

interface AssignmentRow {
  staff_id: string;
  staff_name: string;
  item_codes: string[];
}

export function TaskAssignmentPage() {
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [assignments, setAssignments] = useState<(TaskAssignment & { staff_name?: string })[]>([]);
  const [staffCounts, setStaffCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[] | null>(null);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadStaff = useCallback(async () => {
    const { data: staffData } = await supabase
      .from('app_users')
      .select('*')
      .eq('role', 'staff')
      .eq('is_active', true)
      .order('username');
    setStaff((staffData as AppUser[]) || []);

    const { data: countsData } = await supabase
      .from('task_assignments')
      .select('staff_id');
    const counts = new Map<string, number>();
    (countsData as { staff_id: string }[] | null)?.forEach((row) => {
      counts.set(row.staff_id, (counts.get(row.staff_id) || 0) + 1);
    });
    setStaffCounts(counts);
  }, []);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('task_assignments').select('*', { count: 'exact' });
    if (debouncedSearch) {
      query = query.ilike('item_no', `%${debouncedSearch}%`);
    }
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.order('assigned_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setAssignments((data as TaskAssignment[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [debouncedSearch, page]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleParsed = (rows: Record<string, unknown>[]) => {
    setParsedRows(rows);
    setMsg(null);
  };

  const handleUploadAssignments = async () => {
    if (!parsedRows || parsedRows.length === 0) {
      setMsg({ type: 'error', text: 'يرجى اختيار ملف Excel أولاً' });
      return;
    }

    setUploading(true);
    setMsg(null);

    try {
      const staffMap = new Map<string, AppUser>();
      staff.forEach((s) => {
        staffMap.set(s.username.toLowerCase(), s);
        if (s.full_name) staffMap.set(s.full_name, s);
      });

      const grouped = new Map<string, AssignmentRow>();

      for (const row of parsedRows) {
        const username = String(
          row['username'] || row['Username'] || row['user'] || row['User'] || row['موظف'] || row['الموظف'] || row['staff'] || row['Staff'] || ''
        ).trim();
        const itemNo = String(
          row['item no'] || row['item_no'] || row['Item No'] || row['code'] || row['Code'] || row['كود'] || row['الكود'] || ''
        ).trim();

        if (!username || !itemNo) continue;

        const matchedStaff = staffMap.get(username.toLowerCase()) || staffMap.get(username);
        if (!matchedStaff) continue;

        const key = matchedStaff.id;
        if (!grouped.has(key)) {
          grouped.set(key, {
            staff_id: matchedStaff.id,
            staff_name: matchedStaff.full_name || matchedStaff.username,
            item_codes: [],
          });
        }
        grouped.get(key)!.item_codes.push(itemNo);
      }

      if (grouped.size === 0) {
        setMsg({ type: 'error', text: 'لم يتم العثور على بيانات صحيحة. تأكد من أعمدة username و item no' });
        setUploading(false);
        return;
      }

      let totalAssigned = 0;
      for (const [, row] of grouped) {
        const { data, error } = await supabase.rpc('bulk_assign_tasks', {
          p_staff_id: row.staff_id,
          p_item_codes: row.item_codes,
        }) as { data: { success: boolean; rows_inserted: number }[] | null; error: { message: string } | null };

        if (error) throw error;
        if (data && data[0]) {
          totalAssigned += data[0].rows_inserted;
        }
      }

      setMsg({ type: 'success', text: `تم تعيين ${totalAssigned} كود لـ ${grouped.size} موظف` });
      setParsedRows(null);
      setPage(1);
      loadAssignments();
      loadStaff();
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'فشل تعيين الأكواد',
      });
    } finally {
      setUploading(false);
    }
  };

  const staffMap = new Map<string, AppUser>();
  staff.forEach((s) => staffMap.set(s.id, s));

  const exportData = assignments.map((a) => ({
    username: staffMap.get(a.staff_id)?.username || '',
    full_name: staffMap.get(a.staff_id)?.full_name || '',
    item_no: a.item_no,
  }));

  const summaryMap = staffCounts;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardList size={24} className="text-skyaccent-600" />
        <h2 className="text-lg font-bold text-slate-800">تعيين الأكواد للموظفين</h2>
      </div>

      {/* Upload Excel for assignment */}
      <div className="bg-white rounded-2xl border border-iceblue-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={20} className="text-skyaccent-600" />
          <h3 className="font-semibold text-slate-700">تعيين أكواد عبر ملف Excel</h3>
        </div>
        <p className="text-sm text-slate-500">
          يجب أن يحتوي الملف على عمودين: <strong>username</strong> (اسم المستخدم) و <strong>item no</strong> (كود الصنف).
          يمكن تكرار اسم المستخدم لعدة أكواد.
        </p>
        <FileUpload
          onParsed={handleParsed}
          label="اضغط لاختيار ملف التعيينات"
          hint="ملف Excel يحتوي على اسم المستخدم وكود الصنف"
        />

        {parsedRows && (
          <div className="text-sm text-skyaccent-600 bg-iceblue-50 rounded-xl p-3">
            تم قراءة {parsedRows.length} صف - اضغط "تعيين الأكواد" للتأكيد
          </div>
        )}

        <button
          onClick={handleUploadAssignments}
          disabled={!parsedRows || uploading}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-skyaccent-600 text-white font-medium py-3 hover:bg-skyaccent-700 active:scale-95 disabled:opacity-50 transition-all"
        >
          {uploading ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
          {uploading ? 'جاري التعيين...' : 'تعيين الأكواد'}
        </button>

        {msg && (
          <div className={`flex items-center gap-2 rounded-xl p-3 text-sm animate-scale-in ${
            msg.type === 'success'
              ? 'bg-status-matchedBg text-status-matched border border-status-matched/30'
              : 'bg-status-shortageBg text-status-shortage border border-status-shortage/30'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            {msg.text}
          </div>
        )}
      </div>

      {/* Staff summary */}
      <div className="bg-white rounded-2xl border border-iceblue-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={20} className="text-skyaccent-600" />
          <h3 className="font-semibold text-slate-700">ملخص التعيينات</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-iceblue-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{s.full_name || s.username}</span>
              </div>
              <span className="bg-skyaccent-600 text-white text-sm font-bold rounded-full px-3 py-0.5 ltr-nums">
                {summaryMap.get(s.id) || 0}
              </span>
            </div>
          ))}
          {staff.length === 0 && (
            <p className="text-sm text-slate-400 col-span-2 text-center py-4">
              لا يوجد موظفون. أضف موظفين من صفحة إدارة المستخدمين.
            </p>
          )}
        </div>
      </div>

      {/* Export current assignments */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-slate-600">
            إجمالي التعيينات: <span className="font-bold text-skyaccent-600 ltr-nums">{totalCount}</span>
          </p>
        </div>
        <ExportButton
          data={exportData}
          columns={[
            { header: 'اسم المستخدم', key: 'username', width: 20 },
            { header: 'الاسم الكامل', key: 'full_name', width: 25 },
            { header: 'كود الصنف', key: 'item_no', width: 20 },
          ]}
          fileName={`task_assignments.xlsx`}
          sheetName="التعيينات"
          label="تصدير الصفحة الحالية"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بكود الصنف في كل التعيينات..."
          className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
        />
      </div>

      {/* Assignments list */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : assignments.length > 0 ? (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-iceblue-50 text-slate-600">
                <tr>
                  <th className="text-right py-3 px-4 font-medium">الموظف</th>
                  <th className="text-right py-3 px-4 font-medium">كود الصنف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iceblue-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-iceblue-50">
                    <td className="py-3 px-4 text-slate-700">
                      {staffMap.get(a.staff_id)?.full_name || staffMap.get(a.staff_id)?.username || 'غير معروف'}
                    </td>
                    <td className="py-3 px-4 ltr-nums font-mono text-slate-700">{a.item_no}</td>
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
          <ClipboardList size={40} className="mx-auto text-iceblue-300 mb-2" />
          <p className="text-slate-500 font-medium text-sm">لا توجد تعيينات</p>
        </div>
      )}
    </div>
  );
}
