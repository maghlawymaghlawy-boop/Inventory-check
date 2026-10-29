import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Users, UserPlus, KeyRound, Trash2, Search, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import type { AppUser } from '@/types';

export function StaffManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers((data as AppUser[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAddUser = async () => {
    setMsg(null);
    if (!newUsername.trim() || !newPassword.trim()) {
      setMsg({ type: 'error', text: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
      return;
    }

    const { data, error } = await supabase.rpc('create_staff_user', {
      p_username: newUsername.trim(),
      p_password: newPassword,
      p_full_name: newFullName.trim() || null,
      p_role: newRole,
    }) as { data: { success: boolean; message: string }[] | null; error: { message: string } | null };

    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }

    if (data && data[0]) {
      if (data[0].success) {
        setMsg({ type: 'success', text: data[0].message });
        setNewUsername('');
        setNewPassword('');
        setNewFullName('');
        setNewRole('staff');
        setShowAddForm(false);
        loadUsers();
      } else {
        setMsg({ type: 'error', text: data[0].message });
      }
    }
  };

  const handleUpdatePassword = async (userId: string) => {
    if (!passwordInput.trim()) {
      setMsg({ type: 'error', text: 'يرجى إدخال كلمة المرور الجديدة' });
      return;
    }

    const { data, error } = await supabase.rpc('update_user_password', {
      p_user_id: userId,
      p_new_password: passwordInput,
    }) as { data: { success: boolean; message: string }[] | null; error: { message: string } | null };

    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }

    if (data && data[0]) {
      setMsg({ type: data[0].success ? 'success' : 'error', text: data[0].message });
      if (data[0].success) {
        setEditingPassword(null);
        setPasswordInput('');
      }
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`هل تريد حذف المستخدم "${username}"؟`)) return;

    const { data, error } = await supabase.rpc('delete_staff_user', {
      p_user_id: userId,
    }) as { data: { success: boolean; message: string }[] | null; error: { message: string } | null };

    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }

    if (data && data[0]) {
      setMsg({ type: data[0].success ? 'success' : 'error', text: data[0].message });
      if (data[0].success) loadUsers();
    }
  };

  const filtered = users.filter(
    (u) => u.username.includes(search) || (u.full_name && u.full_name.includes(search))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users size={24} className="text-skyaccent-600" />
          <h2 className="text-lg font-bold text-slate-800">إدارة المستخدمين</h2>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 rounded-xl bg-skyaccent-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-skyaccent-700 active:scale-95 transition-all"
        >
          <UserPlus size={18} />
          إضافة مستخدم
        </button>
      </div>

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

      {showAddForm && (
        <div className="bg-white rounded-2xl border border-iceblue-200 p-5 space-y-4 animate-slide-down">
          <h3 className="font-semibold text-slate-700">إضافة مستخدم جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">اسم المستخدم</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full rounded-xl border-2 border-iceblue-200 px-3 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">الاسم الكامل</label>
              <input
                type="text"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="w-full rounded-xl border-2 border-iceblue-200 px-3 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">كلمة المرور</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border-2 border-iceblue-200 px-3 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">الصلاحية</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'admin' | 'staff')}
                className="w-full rounded-xl border-2 border-iceblue-200 px-3 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none bg-white"
              >
                <option value="staff">موظف</option>
                <option value="admin">مدير</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddUser}
              className="flex-1 rounded-xl bg-status-matched text-white font-medium py-2.5 text-sm hover:bg-status-matched/90"
            >
              حفظ
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 rounded-xl bg-iceblue-100 text-slate-600 font-medium py-2.5 text-sm hover:bg-iceblue-200"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن مستخدم..."
          className="w-full rounded-xl border-2 border-iceblue-200 bg-white pr-10 pl-4 py-2.5 text-sm focus:border-skyaccent-400 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <div className="animate-spin w-8 h-8 border-3 border-skyaccent-200 border-t-skyaccent-600 rounded-full mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="bg-white rounded-xl border border-iceblue-200 p-3 hover:border-skyaccent-300 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  u.role === 'admin' ? 'bg-skyaccent-600' : 'bg-iceblue-100'
                }`}>
                  {u.role === 'admin' ? (
                    <Shield size={18} className="text-white" />
                  ) : (
                    <Users size={18} className="text-skyaccent-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">
                    {u.full_name || u.username}
                    {u.id === currentUser?.id && (
                      <span className="text-xs text-skyaccent-600 mr-2">(أنت)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="ltr-nums">@{u.username}</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                      u.role === 'admin' ? 'bg-skyaccent-600 text-white' : 'bg-iceblue-200 text-slate-700'
                    }`}>
                      {u.role === 'admin' ? 'مدير' : 'موظف'}
                    </span>
                    {!u.is_active && (
                      <span className="px-1.5 py-0.5 rounded-full bg-status-shortageBg text-status-shortage font-medium">
                        معطّل
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingPassword(editingPassword === u.id ? null : u.id);
                      setPasswordInput('');
                    }}
                    className="p-2 rounded-lg text-skyaccent-600 hover:bg-skyaccent-50 transition-all"
                    title="تغيير كلمة المرور"
                  >
                    <KeyRound size={16} />
                  </button>
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      className="p-2 rounded-lg text-status-shortage hover:bg-status-shortageBg transition-all"
                      title="حذف"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {editingPassword === u.id && (
                <div className="mt-3 pt-3 border-t border-iceblue-100 flex gap-2 animate-slide-down">
                  <input
                    type="text"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="كلمة المرور الجديدة"
                    className="flex-1 rounded-lg border-2 border-iceblue-200 px-3 py-2 text-sm focus:border-skyaccent-400 focus:outline-none"
                    dir="ltr"
                  />
                  <button
                    onClick={() => handleUpdatePassword(u.id)}
                    className="rounded-lg bg-status-matched text-white text-sm font-medium px-4 py-2 hover:bg-status-matched/90"
                  >
                    حفظ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
