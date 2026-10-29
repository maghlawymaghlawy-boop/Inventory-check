import { useState } from 'react';
import { Pill, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function LoginPage() {
  const { login, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    const result = await login(username.trim(), password);
    if (!result.success) {
      setError(result.error || 'فشل تسجيل الدخول');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-iceblue-50 via-white to-iceblue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-skyaccent-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Pill size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">نظام جرد الصيدلية</h1>
          <p className="text-sm text-slate-500 mt-1">Pharmacy Inventory Management</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-xl border border-iceblue-200 p-6 space-y-5 animate-slide-up"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border-2 border-iceblue-200 bg-iceblue-50 px-4 py-3 text-slate-800 focus:border-skyaccent-400 focus:bg-white focus:outline-none transition-all"
              placeholder="أدخل اسم المستخدم"
              autoComplete="username"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border-2 border-iceblue-200 bg-iceblue-50 px-4 py-3 pl-12 text-slate-800 focus:border-skyaccent-400 focus:bg-white focus:outline-none transition-all"
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-status-shortageBg border border-status-shortage/30 px-4 py-3 text-sm text-status-shortage animate-scale-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-skyaccent-600 text-white font-semibold py-3.5 hover:bg-skyaccent-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-md"
          >
            <LogIn size={20} />
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>

          <div className="text-center text-xs text-slate-400 pt-2 border-t border-iceblue-100">
            <p>المستخدم الافتراضي: admin / admin123</p>
          </div>
        </form>
      </div>
    </div>
  );
}
