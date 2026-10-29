import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { FastEntryPage } from '@/pages/staff/FastEntryPage';
import { AssignedTasksPage } from '@/pages/staff/AssignedTasksPage';
import { InventoriedItemsPage } from '@/pages/staff/InventoriedItemsPage';
import { StaffReconciliationPage } from '@/pages/staff/StaffReconciliationPage';
import { StaffLogPage } from '@/pages/staff/StaffLogPage';
import { Zap, ClipboardList, CheckCircle, Scale, ScrollText } from 'lucide-react';

const tabs = [
  { id: 'entry', label: 'إدخال سريع', icon: <Zap size={20} /> },
  { id: 'tasks', label: 'المطلوبة', icon: <ClipboardList size={20} /> },
  { id: 'inventoried', label: 'المجرودة', icon: <CheckCircle size={20} /> },
  { id: 'recon', label: 'المطابقة', icon: <Scale size={20} /> },
  { id: 'log', label: 'السجل', icon: <ScrollText size={20} /> },
];

export function StaffApp() {
  const [activeTab, setActiveTab] = useState('entry');

  const titles: Record<string, string> = {
    entry: 'الإدخال السريع',
    tasks: 'الأكواد المطلوب جردها',
    inventoried: 'الأكواد المجرودة',
    recon: 'مطابقة الأرصدة',
    log: 'السجل',
  };

  return (
    <Layout
      title={titles[activeTab]}
      activeTab={activeTab}
      tabs={tabs}
      onTabChange={setActiveTab}
    >
      {activeTab === 'entry' && <FastEntryPage />}
      {activeTab === 'tasks' && <AssignedTasksPage />}
      {activeTab === 'inventoried' && <InventoriedItemsPage />}
      {activeTab === 'recon' && <StaffReconciliationPage />}
      {activeTab === 'log' && <StaffLogPage />}
    </Layout>
  );
}
