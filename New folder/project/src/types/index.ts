export type UserRole = 'admin' | 'staff';

export interface AppUser {
  id: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface MasterItem {
  id: number;
  item_no: string;
  item_description: string | null;
  qty_per_core: number;
}

export interface TaskAssignment {
  id: number;
  staff_id: string;
  week_start: string;
  item_no: string;
  assigned_at: string;
}

export interface InventoryEntry {
  id: number;
  staff_id: string | null;
  item_no: string;
  item_description: string | null;
  qty_per_core: number;
  boxes: number;
  units: number;
  total_units: number;
  entry_date: string;
  confirmed: boolean;
  confirmed_at: string | null;
  confirmed_system_qty: number | null;
  confirmed_difference: number | null;
  created_at: string;
  updated_at: string;
}

export interface SystemStock {
  id: number;
  item_no: string;
  item_description: string | null;
  system_qty: number;
  upload_date: string;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  username: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export interface AuthResult {
  id: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}
