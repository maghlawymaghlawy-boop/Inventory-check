import { Delete, CheckCircle } from 'lucide-react';

interface NumpadProps {
  onInput: (digit: string) => void;
  onDelete: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

export function Numpad({ onInput, onDelete, onConfirm, confirmLabel = 'تأكيد' }: NumpadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div className="grid grid-cols-3 gap-2 select-none">
      {keys.slice(0, 9).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onInput(key)}
          className="numpad-btn flex items-center justify-center rounded-2xl bg-white border-2 border-iceblue-200 text-2xl font-bold text-slate-800 h-16 shadow-sm hover:border-skyaccent-400"
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        onClick={onDelete}
        className="numpad-btn flex items-center justify-center rounded-2xl bg-status-shortageBg border-2 border-status-shortage/30 text-xl font-bold text-status-shortage h-16 shadow-sm hover:bg-status-shortage hover:text-white"
      >
        <Delete size={24} />
      </button>
      <button
        type="button"
        onClick={() => onInput('0')}
        className="numpad-btn flex items-center justify-center rounded-2xl bg-white border-2 border-iceblue-200 text-2xl font-bold text-slate-800 h-16 shadow-sm hover:border-skyaccent-400"
      >
        0
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="numpad-btn flex items-center justify-center rounded-2xl bg-status-matchedBg border-2 border-status-matched/30 text-base font-bold text-status-matched h-16 shadow-sm hover:bg-status-matched hover:text-white"
      >
        <CheckCircle size={22} />
        <span className="mr-1 text-sm">{confirmLabel}</span>
      </button>
    </div>
  );
}
