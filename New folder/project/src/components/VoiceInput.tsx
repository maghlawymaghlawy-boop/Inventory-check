import { useRef, useState, useEffect, type ReactNode } from 'react';
import { Mic, X, Check } from 'lucide-react';

const arabicNumberWords: Record<string, string> = {
  'صفر': '0', 'واحد': '1', 'اثنين': '2', 'اثنان': '2', 'ثنين': '2',
  'ثلاثة': '3', 'ثلاث': '3', 'اربعة': '4', 'أربعة': '4', 'اربع': '4', 'أربع': '4',
  'خمسة': '5', 'خمس': '5', 'ستة': '6', 'ست': '6',
  'سبعة': '7', 'سبع': '7', 'ثمانية': '8', 'ثماني': '8', 'ثمان': '8',
  'تسعة': '9', 'تسع': '9', 'عشرة': '10', 'عشر': '10',
  'مئة': '100', 'مائة': '100', 'الف': '1000', 'ألف': '1000',
};

function arabicSpeechToNumber(raw: string): string {
  let text = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

  const words = text.split(/\s+/).filter(Boolean);
  const digits: string[] = [];

  for (const word of words) {
    const cleanWord = word.replace(/[^\u0621-\u064A\u0660-\u0669]/g, '');
    if (/^\d+$/.test(cleanWord)) {
      digits.push(cleanWord);
    } else if (arabicNumberWords[cleanWord]) {
      digits.push(arabicNumberWords[cleanWord]);
    }
  }

  if (digits.length === 0) {
    return text.replace(/\s+/g, '').replace(/[^\d]/g, '');
  }

  if (digits.length === 1) return digits[0];

  let total = 0;
  let current = 0;
  for (const d of digits) {
    const n = parseInt(d, 10);
    if (n === 100) {
      current = (current || 1) * 100;
    } else if (n === 1000) {
      total += (current || 1) * 1000;
      current = 0;
    } else {
      current += n;
    }
  }
  return String(total + current);
}

interface VoiceInputProps {
  onResult: (text: string) => void;
  label?: string;
}

const Recognition =
  (typeof window !== 'undefined' &&
    ((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)) ||
  undefined;

export function VoiceInput({ onResult, label }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current && typeof (recognitionRef.current as { stop?: () => void }).stop === 'function') {
        (recognitionRef.current as { stop: () => void }).stop();
      }
    };
  }, []);

  const startListening = () => {
    if (!Recognition) {
      setError('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }

    if (recognitionRef.current && typeof (recognitionRef.current as { stop?: () => void }).stop === 'function') {
      try {
        (recognitionRef.current as { stop: () => void }).stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    setError('');
    setTranscript('');

    setTimeout(() => {
      const recognition = new (Recognition as { new (): {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: (event: { results: { 0: { 0: { transcript: string } } } }) => void;
        onerror: (event: { error: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      } })();
      recognition.lang = 'ar-SA';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const raw = event.results[0][0].transcript;
        const result = arabicSpeechToNumber(raw);
        setTranscript(result);
        onResult(result);
      };

      recognition.onerror = (event) => {
        setError('خطأ في الإدخال الصوتي: ' + event.error);
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        setError('تعذر بدء الإدخال الصوتي. حاول مرة أخرى.');
        setListening(false);
      }
    }, 200);
  };

  const stopListening = () => {
    if (recognitionRef.current && typeof (recognitionRef.current as { stop?: () => void }).stop === 'function') {
      (recognitionRef.current as { stop: () => void }).stop();
    }
    setListening(false);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={listening ? stopListening : startListening}
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
          listening
            ? 'bg-status-shortage text-white animate-pulse-soft'
            : 'bg-skyaccent-600 text-white hover:bg-skyaccent-700 active:scale-95'
        }`}
      >
        {listening ? (
          <>
            <X size={18} />
            إيقاف
          </>
        ) : (
          <>
            <Mic size={18} />
            {label || 'إدخال صوتي'}
          </>
        )}
      </button>
      {transcript && (
        <div className="flex items-center gap-1.5 text-sm text-status-matched animate-fade-in">
          <Check size={16} />
          <span className="ltr-nums font-semibold">{transcript}</span>
        </div>
      )}
      {error && <p className="text-xs text-status-shortage animate-fade-in">{error}</p>}
    </div>
  );
}

export function VoiceInputSupports(): boolean {
  return !!Recognition;
}

export function VoiceInputWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
