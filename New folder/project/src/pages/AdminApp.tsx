import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { MasterDataPage } from '@/pages/admin/MasterDataPage';
import { StaffManagementPage } from '@/pages/admin/StaffManagementPage';
import { TaskAssignmentPage } from '@/pages/admin/TaskAssignmentPage';
import { InventoryMonitoringPage } from '@/pages/admin/InventoryMonitoringPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';
import { Database, Users, ClipboardList, Eye, ScrollText } from 'lucide-react';

const tabs = [
  { id: 'monitor', label: 'متابعة الجرد', icon: <Eye size={20} /> },
  { id: 'master', label: 'قاعدة البيانات', icon: <Database size={20} /> },
  { id: 'staff', label: 'المستخدمون', icon: <Users size={20} /> },
  { id: 'assign', label: 'التعيينات', icon: <ClipboardList size={20} /> },
  { id: 'audit', label: 'السجل', icon: <ScrollText size={20} /> },
];

export function AdminApp() {
  const [activeTab, setActiveTab] = useState('monitor');

  const titles: Record<string, string> = {
    monitor: 'متابعة الجرد',
    master: 'قاعدة بيانات الأصناف',
    staff: 'إدارة المستخدمين',
    assign: 'تعيين الأكواد',
    audit: 'سجل العمليات',
  };

  return (
    <Layout
      title={titles[activeTab]}
      activeTab={activeTab}
      tabs={tabs}
      onTabChange={setActiveTab}
    >
      {activeTab === 'monitor' && <InventoryMonitoringPage />}
      {activeTab === 'master' && <MasterDataPage />}
      {activeTab === 'staff' && <StaffManagementPage />}
      {activeTab === 'assign' && <TaskAssignmentPage />}
      {activeTab === 'audit' && <AuditLogsPage />}
    </Layout>
  );
}
