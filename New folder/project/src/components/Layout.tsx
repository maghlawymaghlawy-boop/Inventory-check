import { type ReactNode } from 'react';
import { LogOut, Pill, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface LayoutProps {
  children: ReactNode;
  title: string;
  activeTab: string;
  tabs: { id: string; label: string; icon: ReactNode }[];
  onTabChange: (tab: string) => void;
}

export function Layout({ children, title, activeTab, tabs, onTabChange }: LayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-iceblue-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-iceblue-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-skyaccent-600 flex items-center justify-center shadow-md">
              <Pill size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">{title}</h1>
              <p className="text-xs text-slate-500">نظام جرد الصيدلية</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-slate-600 bg-iceblue-50 rounded-lg px-3 py-1.5">
              <User size={16} className="text-skyaccent-600" />
              <span className="font-medium">{user?.full_name || user?.username}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                user?.role === 'admin' ? 'bg-skyaccent-600 text-white' : 'bg-iceblue-200 text-slate-700'
              }`}>
                {user?.role === 'admin' ? 'مدير' : 'موظف'}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-slate-500 hover:bg-status-shortageBg hover:text-status-shortage transition-all"
              title="تسجيل الخروج"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <nav className="border-t border-iceblue-100">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg min-w-fit transition-all ${
                    activeTab === tab.id
                      ? 'bg-skyaccent-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-iceblue-50 hover:text-slate-700'
                  }`}
                >
                  {tab.icon}
                  <span className="text-sm font-medium whitespace-nowrap">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
