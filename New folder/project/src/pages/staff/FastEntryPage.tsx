import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Numpad } from '@/components/Numpad';
import { VoiceInput } from '@/components/VoiceInput';
import { ConfirmBanner } from '@/components/ConfirmBanner';
import { useDebounce } from '@/hooks/useDebounce';
import { Package, Boxes, Layers, Save, Search, Mic, Hash, ArrowRight, X, Loader2 } from 'lucide-react';
import type { MasterItem, InventoryEntry } from '@/types';

type EntryStep = 'code' | 'boxes' | 'units';

export function FastEntryPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<EntryStep>('code');
  const [codeInput, setCodeInput] = useState('');
  const [boxesInput, setBoxesInput] = useState('');
  const [unitsInput, setUnitsInput] = useState('');
  const [masterItem, setMasterItem] = useState<MasterItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const searchedCodeRef = useRef('');

  const [showItemSearch, setShowItemSearch] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState<MasterItem[]>([]);
  const [itemSearching, setItemSearching] = useState(false);
  const debouncedItemSearch = useDebounce(itemSearchQuery, 350);

  useEffect(() => {
    if (!showItemSearch || !debouncedItemSearch) {
      setItemSearchResults([]);
      return;
    }
    let active = true;
    setItemSearching(true);
    supabase
      .from('master_items')
      .select('*')
      .or(`item_no.ilike.%${debouncedItemSearch}%,item_description.ilike.%${debouncedItemSearch}%`)
      .order('item_no')
      .limit(30)
      .then(({ data }) => {
        if (!active) return;
        setItemSearchResults((data as MasterItem[]) || []);
        setItemSearching(false);
      });
    return () => { active = false; };
  }, [debouncedItemSearch, showItemSearch]);

  const selectItemFromSearch = (item: MasterItem) => {
    setCodeInput(item.item_no);
    setShowItemSearch(false);
    setItemSearchQuery('');
    setItemSearchResults([]);
    searchAndAdvance(item.item_no);
  };

  const loadTotalCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('inventory_entries')
      .select('*', { count: 'exact', head: true })
      .eq('staff_id', user.id);
    setTotalCount(count || 0);
  }, [user]);

  useEffect(() => {
    loadTotalCount();
  }, [loadTotalCount]);

  const searchAndAdvance = useCallback(async (code: string) => {
    if (!code) return;
    setSearching(true);
    setNotFound(false);
    searchedCodeRef.current = code;
    const { data } = await supabase
      .from('master_items')
      .select('*')
      .eq('item_no', code)
      .maybeSingle();
    if (searchedCodeRef.current !== code) return;
    setSearching(false);
    if (data) {
      setMasterItem(data as MasterItem);
      setNotFound(false);
      setStep('boxes');
    } else {
      setMasterItem(null);
      setNotFound(true);
    }
  }, []);

  const handleCodeInput = (digit: string) => {
    const newVal = (codeInput + digit).slice(0, 20);
    setCodeInput(newVal);
    setNotFound(false);
    setMasterItem(null);
  };

  const handleCodeDelete = () => {
    const newVal = codeInput.slice(0, -1);
    setCodeInput(newVal);
    setNotFound(false);
    setMasterItem(null);
  };

  const handleCodeConfirm = () => {
    if (!codeInput) return;
    searchAndAdvance(codeInput);
  };

  const handleBoxesInput = (digit: string) => {
    setBoxesInput((boxesInput + digit).slice(0, 6));
  };

  const handleBoxesDelete = () => {
    setBoxesInput(boxesInput.slice(0, -1));
  };

  const handleBoxesConfirm = () => {
    setStep('units');
  };

  const handleUnitsInput = (digit: string) => {
    setUnitsInput((unitsInput + digit).slice(0, 6));
  };

  const handleUnitsDelete = () => {
    setUnitsInput(unitsInput.slice(0, -1));
  };

  const totalUnits =
    (parseInt(boxesInput || '0') * (masterItem?.qty_per_core || 1)) +
    parseInt(unitsInput || '0');

  const handleSave = async () => {
    if (!user || !masterItem || !codeInput) return;

    setSaving(true);
    setSaveMsg(null);

    try {
      const { data: existing } = await supabase
        .from('inventory_entries')
        .select('*')
        .eq('staff_id', user.id)
        .eq('item_no', codeInput)
        .eq('confirmed', false)
        .maybeSingle();

      if (existing) {
        const existingEntry = existing as InventoryEntry;
        const newBoxes = existingEntry.boxes + parseInt(boxesInput || '0');
        const newUnits = existingEntry.units + parseInt(unitsInput || '0');
        const newTotal = newBoxes * masterItem.qty_per_core + newUnits;

        const { error: updateErr } = await supabase
          .from('inventory_entries')
          .update({
            boxes: newBoxes,
            units: newUnits,
            total_units: newTotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEntry.id);

        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('inventory_entries')
          .insert({
            staff_id: user.id,
            item_no: codeInput,
            item_description: masterItem.item_description,
            qty_per_core: masterItem.qty_per_core,
            boxes: parseInt(boxesInput || '0'),
            units: parseInt(unitsInput || '0'),
            total_units: totalUnits,
          });

        if (insertErr) throw insertErr;
      }

      await supabase
        .from('task_assignments')
        .delete()
        .eq('staff_id', user.id)
        .eq('item_no', codeInput);

      setSaveMsg({ type: 'success', text: `تم حفظ الجرد: ${masterItem.item_description || codeInput}` });
      loadTotalCount();

      setTimeout(() => {
        setCodeInput('');
        setBoxesInput('');
        setUnitsInput('');
        setMasterItem(null);
        setNotFound(false);
        setStep('code');
        setSaveMsg(null);
      }, 1200);
    } catch {
      setSaveMsg({ type: 'error', text: 'حدث خطأ أثناء الحفظ. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setCodeInput('');
    setBoxesInput('');
    setUnitsInput('');
    setMasterItem(null);
    setNotFound(false);
    setStep('code');
    setSaveMsg(null);
  };

  const numpadProps = {
    code: { onInput: handleCodeInput, onDelete: handleCodeDelete, onConfirm: handleCodeConfirm, confirmLabel: 'بحث وتالي' },
    boxes: { onInput: handleBoxesInput, onDelete: handleBoxesDelete, onConfirm: handleBoxesConfirm, confirmLabel: 'التالي' },
    units: { onInput: handleUnitsInput, onDelete: handleUnitsDelete, onConfirm: handleSave, confirmLabel: saving ? 'حفظ...' : 'حفظ' },
  };

  return (
    <div className="flex flex-col max-w-md mx-auto" style={{ minHeight: 'calc(100vh - 140px)' }}>
      {/* Top section - scrollable content */}
      <div className="flex-1 space-y-4 pb-4">
        {/* Progress indicator */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-iceblue-200 p-3">
          <button
            onClick={() => step !== 'code' && setStep(step === 'units' ? 'boxes' : 'code')}
            className={`p-1 rounded-lg transition-all ${step !== 'code' ? 'text-skyaccent-600 hover:bg-iceblue-50' : 'text-slate-200'}`}
          >
            <ArrowRight size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step === 'code' ? 'bg-skyaccent-600 text-white' : masterItem ? 'bg-status-matched text-white' : 'bg-iceblue-100 text-slate-400'
            }`}>
              {masterItem ? '✓' : '1'}
            </div>
            <span className={`text-sm font-medium ${step === 'code' ? 'text-skyaccent-600' : 'text-slate-500'}`}>الكود</span>
          </div>
          <div className="w-6 h-0.5 bg-iceblue-200" />
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step === 'boxes' ? 'bg-skyaccent-600 text-white' : boxesInput ? 'bg-status-matched text-white' : 'bg-iceblue-100 text-slate-400'
            }`}>
              {boxesInput ? '✓' : '2'}
            </div>
            <span className={`text-sm font-medium ${step === 'boxes' ? 'text-skyaccent-600' : 'text-slate-500'}`}>العلب</span>
          </div>
          <div className="w-6 h-0.5 bg-iceblue-200" />
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step === 'units' ? 'bg-skyaccent-600 text-white' : 'bg-iceblue-100 text-slate-400'
            }`}>3</div>
            <span className={`text-sm font-medium ${step === 'units' ? 'text-skyaccent-600' : 'text-slate-500'}`}>الوحدات</span>
          </div>
          <div className="w-5" />
        </div>

        {/* Total count badge */}
        <div className="flex items-center justify-between bg-skyaccent-600 text-white rounded-2xl px-4 py-3 shadow-md">
          <div className="flex items-center gap-2">
            <Package size={20} />
            <span className="text-sm font-medium">إجمالي الأصناف المجرودة</span>
          </div>
          <span className="text-2xl font-bold ltr-nums">{totalCount}</span>
        </div>

        {/* Save message */}
        {saveMsg && (
          <div className={`rounded-2xl p-4 text-center font-medium animate-scale-in ${
            saveMsg.type === 'success'
              ? 'bg-status-matchedBg text-status-matched border-2 border-status-matched/30'
              : 'bg-status-shortageBg text-status-shortage border-2 border-status-shortage/30'
          }`}>
            {saveMsg.text}
          </div>
        )}

        {/* Step content - each has identical height structure to prevent Numpad shift */}
        {step === 'code' && (
          <div className="space-y-3 animate-fade-in">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                <Hash size={16} className="text-skyaccent-600" />
                أدخل كود الصنف (Item No)
              </label>
              <div className="flex items-center gap-2">
                <div className={`flex-1 rounded-2xl border-2 bg-white px-4 py-4 transition-all ${
                  notFound ? 'border-status-shortage/40' : masterItem ? 'border-status-matched/40' : 'border-iceblue-200'
                }`}>
                  <span className={`text-2xl font-bold ltr-nums ${codeInput ? 'text-slate-800' : 'text-slate-300'}`}>
                    {codeInput || '• • • • •'}
                  </span>
                  {searching && <span className="text-xs text-skyaccent-500 mr-2">بحث...</span>}
                </div>
                <button
                  onClick={resetAll}
                  className="rounded-2xl bg-iceblue-100 text-slate-500 p-3 hover:bg-iceblue-200 transition-all"
                  title="مسح"
                >
                  <Search size={22} />
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowItemSearch(true)}
              className="w-full flex items-center justify-center gap-2 text-sm text-skyaccent-600 hover:text-skyaccent-700 py-1.5 rounded-xl hover:bg-skyaccent-50 transition-all"
            >
              <Search size={16} />
              الكود غير مقروء؟ ابحث بالاسم
            </button>

            <div className="flex items-center justify-center gap-3 bg-iceblue-50 rounded-2xl p-2.5">
              <Mic size={18} className="text-skyaccent-600" />
              <VoiceInput onResult={(text) => {
                setCodeInput(text);
                searchAndAdvance(text);
              }} label="إدخال الكود بالصوت" />
            </div>

            {(masterItem || notFound) && (
              <ConfirmBanner item={masterItem} notFound={notFound} searchedCode={codeInput} />
            )}
          </div>
        )}

        {step === 'boxes' && masterItem && (
          <div className="space-y-3 animate-fade-in">
            <ConfirmBanner item={masterItem} notFound={false} searchedCode={codeInput} />

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                <Boxes size={16} className="text-skyaccent-600" />
                عدد العلب المغلقة (Closed Boxes)
              </label>
              <div className="rounded-2xl border-2 border-iceblue-200 bg-white px-4 py-4">
                <span className={`text-2xl font-bold ltr-nums ${boxesInput ? 'text-slate-800' : 'text-slate-300'}`}>
                  {boxesInput || '0'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 bg-iceblue-50 rounded-2xl p-2.5">
              <Mic size={18} className="text-skyaccent-600" />
              <VoiceInput onResult={(text) => {
                setBoxesInput(text);
                setStep('units');
              }} label="إدخال العلب بالصوت" />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setStep('code'); setBoxesInput(''); }}
                className="flex-1 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700 py-2.5 rounded-xl hover:bg-iceblue-50"
              >
                <ArrowRight size={16} />
                رجوع للكود
              </button>
            </div>
          </div>
        )}

        {step === 'units' && masterItem && (
          <div className="space-y-3 animate-fade-in">
            <ConfirmBanner item={masterItem} notFound={false} searchedCode={codeInput} />

            <div className="bg-iceblue-50 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">العلب المغلقة:</span>
                <span className="font-bold text-slate-800 ltr-nums">{boxesInput || '0'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">وحدات/علبة:</span>
                <span className="font-bold text-slate-800 ltr-nums">{masterItem.qty_per_core}</span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                <Layers size={16} className="text-skyaccent-600" />
                عدد الأشرطة/الوحدات (Units/Strips)
              </label>
              <div className="rounded-2xl border-2 border-iceblue-200 bg-white px-4 py-4">
                <span className={`text-2xl font-bold ltr-nums ${unitsInput ? 'text-slate-800' : 'text-slate-300'}`}>
                  {unitsInput || '0'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 bg-iceblue-50 rounded-2xl p-2.5">
              <Mic size={18} className="text-skyaccent-600" />
              <VoiceInput onResult={(text) => {
                setUnitsInput(text);
              }} label="إدخال الوحدات بالصوت" />
            </div>

            <div className="flex items-center justify-between bg-skyaccent-600 text-white rounded-2xl px-4 py-3">
              <span className="text-sm font-medium">إجمالي الوحدات الصغيرة:</span>
              <span className="text-2xl font-bold ltr-nums">{totalUnits}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep('boxes')}
                className="flex-1 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700 py-2.5 rounded-xl hover:bg-iceblue-50"
              >
                <ArrowRight size={16} />
                رجوع للعلب
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-status-matched text-white font-semibold py-3 hover:bg-status-matched/90 active:scale-95 disabled:opacity-50 transition-all"
              >
                <Save size={18} />
                {saving ? 'جاري الحفظ...' : 'حفظ والتالي'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom section - Numpad always fixed at bottom, never moves */}
      <div className="sticky bottom-0 bg-slate-50/80 backdrop-blur-sm pt-3 pb-2 -mx-4 px-4 border-t border-iceblue-200">
        <Numpad {...numpadProps[step]} />
      </div>

      {/* Item search modal */}
      {showItemSearch && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-fade-in"
          onClick={() => setShowItemSearch(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-iceblue-100">
              <div className="flex items-center gap-2">
                <Search size={20} className="text-skyaccent-600" />
                <h3 className="font-semibold text-slate-800">بحث عن صنف</h3>
              </div>
              <button
                onClick={() => setShowItemSearch(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-iceblue-100 hover:text-slate-600 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 border-b border-iceblue-100">
              <div className="relative">
                <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  placeholder="اكتب اسم الصنف أو الكود..."
                  autoFocus
                  className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {itemSearching ? (
                <div className="flex items-center justify-center py-10 text-skyaccent-600">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : itemSearchQuery && itemSearchResults.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Package size={36} className="mx-auto mb-2 text-iceblue-300" />
                  <p className="text-sm">لا توجد نتائج</p>
                </div>
              ) : !itemSearchQuery ? (
                <div className="text-center py-10 text-slate-400">
                  <Search size={36} className="mx-auto mb-2 text-iceblue-300" />
                  <p className="text-sm">اكتب للبحث في كل الأصناف</p>
                </div>
              ) : (
                <div className="divide-y divide-iceblue-50">
                  {itemSearchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => selectItemFromSearch(item)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-iceblue-50 transition-all text-right"
                    >
                      <div className="w-9 h-9 rounded-lg bg-iceblue-100 flex items-center justify-center shrink-0">
                        <Package size={16} className="text-skyaccent-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm truncate">
                          {item.item_description || 'بدون اسم'}
                        </p>
                        <p className="text-xs text-slate-500 ltr-nums font-mono mt-0.5">{item.item_no}</p>
                      </div>
                      <ArrowRight size={16} className="text-skyaccent-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
