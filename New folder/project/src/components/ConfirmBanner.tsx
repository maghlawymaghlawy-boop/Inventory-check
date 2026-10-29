import { CheckCircle, AlertTriangle, Package } from 'lucide-react';
import type { MasterItem } from '@/types';

interface ConfirmBannerProps {
  item: MasterItem | null;
  notFound: boolean;
  searchedCode: string;
}

export function ConfirmBanner({ item, notFound, searchedCode }: ConfirmBannerProps) {
  if (notFound) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-status-shortageBg border-2 border-status-shortage/30 p-4 animate-scale-in">
        <AlertTriangle size={32} className="text-status-shortage shrink-0" />
        <div>
          <p className="font-bold text-status-shortage">الكود غير موجود</p>
          <p className="text-sm text-status-shortage/80 ltr-nums">
            لم يتم العثور على الكود: {searchedCode}
          </p>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-status-matchedBg border-2 border-status-matched/30 p-4 animate-scale-in">
      <CheckCircle size={32} className="text-status-matched shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-status-matched truncate">{item.item_description || 'بدون اسم'}</p>
        <div className="flex items-center gap-3 text-sm text-slate-600 mt-0.5">
          <span className="ltr-nums">كود: {item.item_no}</span>
          <span className="flex items-center gap-1">
            <Package size={14} />
            <span className="ltr-nums">وحدات/علبة: {item.qty_per_core}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
