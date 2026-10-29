import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileUpload } from '@/components/FileUpload';
import { Pagination } from '@/components/Pagination';
import { useDebounce } from '@/hooks/useDebounce';
import { Database, Trash2, Search, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import type { MasterItem } from '@/types';

const PAGE_SIZE = 50;

export function MasterDataPage() {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('master_items').select('*', { count: 'exact' });
    if (debouncedSearch) {
      query = query.or(`item_no.ilike.%${debouncedSearch}%,item_description.ilike.%${debouncedSearch}%`);
    }
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query.order('item_description', { ascending: true, nullsFirst: false }).range(from, from + PAGE_SIZE - 1);
    setItems((data as MasterItem[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [debouncedSearch, page]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleParsed = async (rows: Record<string, unknown>[]) => {
    setUploading(true);
    setUploadMsg(null);

    try {
      const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
      const findKey = (patterns: string[]): string | undefined => {
        for (const pattern of patterns) {
          const normalized = pattern.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
          const match = keys.find((k) => k.toLowerCase().replace(/\s+/g, '').replace(/_/g, '') === normalized);
          if (match) return match;
        }
        return undefined;
      };

      const itemNoKey = findKey(['item no', 'item_no', 'code', 'كود', 'الكود', 'itemno', 'item number', 'barcode']);
      const descKey = findKey(['item description', 'item_description', 'description', 'name', 'اسم الصنف', 'الاسم', 'drug name', 'itemname']);
      const qtyKey = findKey(['qty per core', 'qty_per_core', 'qty', 'الكمية', 'quantity', 'qtypercore', 'units per box', 'pack size']);

      const mapped = rows.map((row) => {
        const rawQty = qtyKey ? row[qtyKey] : '';
        const parsedQty = parseFloat(String(rawQty ?? ''));
        return {
          item_no: String(itemNoKey ? row[itemNoKey] ?? '' : '').trim(),
          item_description: String(descKey ? row[descKey] ?? '' : '').trim(),
          qty_per_core: isNaN(parsedQty) ? 1 : parsedQty,
        };
      }).filter((r) => r.item_no);

      const sampleDebug = `أعمدة الملف: [${keys.join(', ')}] | عمود الكود: ${itemNoKey || 'غير موجود'} | عمود الكمية: ${qtyKey || 'غير موجود'} | أول صف: ${JSON.stringify(mapped[0] || {})}`;
      setDebugInfo(sampleDebug);

      if (mapped.length === 0) {
        setUploadMsg({ type: 'error', text: 'لم يتم العثور على بيانات صحيحة. تأكد من وجود عمود "item no"' });
        setUploading(false);
        return;
      }

      const batchSize = 500;
      let totalInserted = 0;

      for (let i = 0; i < mapped.length; i += batchSize) {
        const batch = mapped.slice(i, i + batchSize);
        const { error } = await supabase.rpc('bulk_upload_master_items', {
          p_items: JSON.parse(JSON.stringify(batch)),
        });

        if (error) throw error;
        totalInserted += batch.length;
      }

      setUploadMsg({ type: 'success', text: `تم رفع ${totalInserted} صنف بنجاح` });
      setPage(1);
      loadItems();
    } catch (err) {
      setUploadMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'فشل رفع البيانات',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('هل تريد حذف جميع الأصناف من قاعدة البيانات؟ هذا لا يمكن التراجع عنه.')) return;
    await supabase.from('master_items').delete().neq('id', 0);
    setPage(1);
    loadItems();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Database size={24} className="text-skyaccent-600" />
        <h2 className="text-lg font-bold text-slate-800">قاعدة بيانات الأصناف</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-iceblue-200 p-4">
          <p className="text-sm text-slate-500">إجمالي الأصناف</p>
          <p className="text-2xl font-bold text-skyaccent-600 ltr-nums mt-1">{totalCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-iceblue-200 p-4">
          <p className="text-sm text-slate-500">سعة النظام</p>
          <p className="text-2xl font-bold text-status-matched ltr-nums mt-1">100,000+</p>
        </div>
      </div>

      {/* Upload section */}
      <div className="bg-white rounded-2xl border border-iceblue-200 p-5 space-y-4">
        <h3 className="font-semibold text-slate-700">رفع ملف الأصناف (Excel/CSV)</h3>
        <p className="text-sm text-slate-500">
          يجب أن يحتوي الملف على الأعمدة: item no, item description, qty per core
        </p>
        <FileUpload
          onParsed={handleParsed}
          label="اضغط لاختيار ملف Excel"
          hint="يتم رفع البيانات على دفعات لدعم أكثر من 20,000 صنف"
        />

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-skyaccent-600">
            <RefreshCw size={18} className="animate-spin" />
            جاري رفع البيانات...
          </div>
        )}

        {uploadMsg && (
          <div className={`flex items-center gap-2 rounded-xl p-3 text-sm animate-scale-in ${
            uploadMsg.type === 'success'
              ? 'bg-status-matchedBg text-status-matched border border-status-matched/30'
              : 'bg-status-shortageBg text-status-shortage border border-status-shortage/30'
          }`}>
            {uploadMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            {uploadMsg.text}
          </div>
        )}

        {debugInfo && (
          <div className="rounded-xl bg-iceblue-50 border border-iceblue-200 p-3 text-xs text-slate-600 ltr-nums break-all">
            <p className="font-semibold text-slate-700 mb-1">معلومات التصحيح:</p>
            {debugInfo}
          </div>
        )}
      </div>

      {/* Search + clear */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالكود أو الاسم (يبحث في كل الأصناف)..."
            className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none transition-all"
          />
        </div>
        <button
          onClick={handleClearAll}
          className="flex items-center gap-1.5 rounded-xl bg-status-shortageBg text-status-shortage px-3 py-2.5 text-sm font-medium hover:bg-status-shortage hover:text-white transition-all"
        >
          <Trash2 size={16} />
          مسح الكل
        </button>
      </div>

      {/* Items table */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-iceblue-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-iceblue-50 text-slate-600">
                <tr>
                  <th className="text-right py-3 px-4 font-medium">كود الصنف</th>
                  <th className="text-right py-3 px-4 font-medium">اسم الصنف</th>
                  <th className="text-right py-3 px-4 font-medium">وحدات/علبة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-iceblue-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-slate-400">
                      {debouncedSearch ? 'لا توجد نتائج مطابقة' : 'لا توجد أصناف. ارفع ملف Excel للبدء.'}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-iceblue-50 transition-all">
                      <td className="py-3 px-4 ltr-nums font-mono text-slate-700">{item.item_no}</td>
                      <td className="py-3 px-4 text-slate-700">{item.item_description || '-'}</td>
                      <td className="py-3 px-4 ltr-nums text-slate-700">{item.qty_per_core}</td>
                    </tr>
                  ))
                )}
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
      )}
    </div>
  );
}
