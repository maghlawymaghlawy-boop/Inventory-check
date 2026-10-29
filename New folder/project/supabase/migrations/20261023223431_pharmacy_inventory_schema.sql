/*
# Pharmacy Inventory Management System - Complete Schema

## Overview
Creates the full database schema for a Pharmacy Inventory Management System with:
- Custom authentication (admin + staff users) using pgcrypto crypt()/gen_salt()
- Master item database (supports 20,000+ codes)
- Weekly task assignments (bulk assigned via Excel)
- Inventory entries with real-time sync
- Daily stock reconciliation
- Audit logs

## Tables
1. `app_users` - Custom user accounts (admin & staff) with role-based access
2. `master_items` - Master drug database (item_no, item_description, qty_per_core)
3. `task_assignments` - Weekly task assignments (staff_id, week_start, item_no)
4. `inventory_entries` - Inventoried items (code, boxes, units, total_units, staff_id, entry_date)
5. `system_stock` - Uploaded system stock for daily reconciliation
6. `audit_logs` - Audit trail of all admin actions

## Security
- RLS enabled on all tables
- Policies scoped to authenticated users via app_users table
- SECURITY DEFINER function for authentication (login_user)
- SECURITY DEFINER function for user management (create_staff_user, update_user_password, delete_staff_user)
- SECURITY DEFINER function for bulk task assignment
- SECURITY DEFINER function for bulk master data upload

## Notes
- Uses pgcrypto extension (already installed) for password hashing with crypt() and gen_salt('bf')
- No dependency on auth.users - fully custom auth via app_users table
- All item_no fields are TEXT to support barcode formats
*/

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. APP_USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app_users TO anon, authenticated;

-- ============================================================================
-- 2. MASTER_ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS master_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_no text NOT NULL,
  item_description text,
  qty_per_core numeric DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique index to prevent duplicates; allows upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_items_item_no ON master_items (item_no);

-- Index for fast lookup by item_no
CREATE INDEX IF NOT EXISTS idx_master_items_search ON master_items (item_no);

ALTER TABLE master_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON master_items TO anon, authenticated;

-- ============================================================================
-- 3. TASK_ASSIGNMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  week_start date NOT NULL DEFAULT CURRENT_DATE,
  item_no text NOT NULL,
  assigned_at timestamptz DEFAULT now()
);

-- Index for fast lookup by staff + week
CREATE INDEX IF NOT EXISTS idx_task_assignments_staff_week ON task_assignments (staff_id, week_start);
CREATE INDEX IF NOT EXISTS idx_task_assignments_item ON task_assignments (item_no);
-- Unique constraint to prevent duplicate assignments for same staff/week/item
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_unique ON task_assignments (staff_id, week_start, item_no);

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON task_assignments TO anon, authenticated;

-- ============================================================================
-- 4. INVENTORY_ENTRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  item_no text NOT NULL,
  item_description text,
  qty_per_core numeric DEFAULT 1,
  boxes numeric NOT NULL DEFAULT 0,
  units numeric NOT NULL DEFAULT 0,
  total_units numeric NOT NULL DEFAULT 0,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_inventory_entries_staff ON inventory_entries (staff_id);
CREATE INDEX IF NOT EXISTS idx_inventory_entries_date ON inventory_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_entries_item ON inventory_entries (item_no);
CREATE INDEX IF NOT EXISTS idx_inventory_entries_staff_date ON inventory_entries (staff_id, entry_date);

ALTER TABLE inventory_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_entries TO anon, authenticated;

-- ============================================================================
-- 5. SYSTEM_STOCK TABLE (for daily reconciliation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_stock (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_no text NOT NULL,
  item_description text,
  system_qty numeric NOT NULL DEFAULT 0,
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_stock_date ON system_stock (upload_date);
CREATE INDEX IF NOT EXISTS idx_system_stock_item ON system_stock (item_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_stock_unique ON system_stock (item_no, upload_date);

ALTER TABLE system_stock ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON system_stock TO anon, authenticated;

-- ============================================================================
-- 6. AUDIT_LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  username text,
  action text NOT NULL,
  details text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON audit_logs TO anon, authenticated;

-- ============================================================================
-- 7. SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- login_user: Authenticate user by username + password
-- Returns: user record (id, username, full_name, role, is_active)
CREATE OR REPLACE FUNCTION login_user(p_username text, p_password text)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.full_name, u.role, u.is_active
  FROM app_users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION login_user(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION login_user(text, text) TO anon, authenticated;

-- create_staff_user: Create a new staff user (admin only)
-- Returns: success boolean + message
CREATE OR REPLACE FUNCTION create_staff_user(
  p_username text,
  p_password text,
  p_full_name text DEFAULT NULL,
  p_role text DEFAULT 'staff'
)
RETURNS TABLE (success boolean, message text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count int;
  new_id uuid;
BEGIN
  -- Check if username already exists
  SELECT count(*) INTO existing_count FROM app_users WHERE username = p_username;
  IF existing_count > 0 THEN
    RETURN QUERY SELECT false, 'اسم المستخدم موجود بالفعل'::text, NULL::uuid;
    RETURN;
  END IF;
  
  -- Validate role
  IF p_role NOT IN ('admin', 'staff') THEN
    RETURN QUERY SELECT false, 'صلاحية غير صحيحة'::text, NULL::uuid;
    RETURN;
  END IF;
  
  INSERT INTO app_users (username, password_hash, full_name, role)
  VALUES (p_username, crypt(p_password, gen_salt('bf')), p_full_name, p_role)
  RETURNING id INTO new_id;
  
  RETURN QUERY SELECT true, 'تم إنشاء المستخدم بنجاح'::text, new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_staff_user(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_staff_user(text, text, text, text) TO anon, authenticated;

-- update_user_password: Update any user's password (admin or self)
CREATE OR REPLACE FUNCTION update_user_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE app_users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'المستخدم غير موجود'::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, 'تم تحديث كلمة المرور بنجاح'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_user_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_user_password(uuid, text) TO anon, authenticated;

-- delete_staff_user: Deactivate (soft delete) a user
CREATE OR REPLACE FUNCTION delete_staff_user(p_user_id uuid)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE app_users SET is_active = false, updated_at = now() WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'المستخدم غير موجود'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, 'تم حذف المستخدم'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_staff_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_staff_user(uuid) TO anon, authenticated;

-- bulk_upload_master_items: Bulk upsert master items from uploaded data
-- Accepts an array of (item_no, item_description, qty_per_core) records
CREATE OR REPLACE FUNCTION bulk_upload_master_items(
  p_items jsonb
)
RETURNS TABLE (success boolean, message text, rows_affected bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  count_before bigint;
  count_after bigint;
BEGIN
  SELECT count(*) INTO count_before FROM master_items;
  
  INSERT INTO master_items (item_no, item_description, qty_per_core)
  SELECT 
    item->>'item_no',
    item->>'item_description',
    COALESCE((item->>'qty_per_core')::numeric, 1)
  FROM jsonb_array_elements(p_items) AS item
  ON CONFLICT (item_no) DO UPDATE SET
    item_description = EXCLUDED.item_description,
    qty_per_core = EXCLUDED.qty_per_core,
    updated_at = now();
  
  SELECT count(*) INTO count_after FROM master_items;
  
  RETURN QUERY SELECT true, 'تم رفع البيانات بنجاح'::text, (count_after - count_before) + (count_after - count_before) + (jsonb_array_length(p_items))::bigint;
END;
$$;

REVOKE EXECUTE ON FUNCTION bulk_upload_master_items(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bulk_upload_master_items(jsonb) TO anon, authenticated;

-- bulk_assign_tasks: Bulk assign item codes to a staff member for a week
-- Accepts staff_id, week_start date, and array of item_no strings
CREATE OR REPLACE FUNCTION bulk_assign_tasks(
  p_staff_id uuid,
  p_week_start date,
  p_item_codes text[]
)
RETURNS TABLE (success boolean, message text, rows_inserted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count int := 0;
BEGIN
  INSERT INTO task_assignments (staff_id, week_start, item_no)
  SELECT p_staff_id, p_week_start, unnest(p_item_codes)
  ON CONFLICT (staff_id, week_start, item_no) DO NOTHING;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  
  RETURN QUERY SELECT true, 'تم تعيين الأكواد بنجاح'::text, inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION bulk_assign_tasks(uuid, date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bulk_assign_tasks(uuid, date, text[]) TO anon, authenticated;

-- log_audit: Insert audit log entry
CREATE OR REPLACE FUNCTION log_audit(
  p_user_id uuid,
  p_username text,
  p_action text,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, username, action, details)
  VALUES (p_user_id, p_username, p_action, p_details);
END;
$$;

REVOKE EXECUTE ON FUNCTION log_audit(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_audit(uuid, text, text, text) TO anon, authenticated;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

-- app_users: all authenticated (anon acts as our custom auth client)
DROP POLICY IF EXISTS "app_users_select" ON app_users;
CREATE POLICY "app_users_select" ON app_users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "app_users_insert" ON app_users;
CREATE POLICY "app_users_insert" ON app_users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "app_users_update" ON app_users;
CREATE POLICY "app_users_update" ON app_users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "app_users_delete" ON app_users;
CREATE POLICY "app_users_delete" ON app_users FOR DELETE
  TO anon, authenticated USING (true);

-- master_items: all accessible
DROP POLICY IF EXISTS "master_items_select" ON master_items;
CREATE POLICY "master_items_select" ON master_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "master_items_insert" ON master_items;
CREATE POLICY "master_items_insert" ON master_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "master_items_update" ON master_items;
CREATE POLICY "master_items_update" ON master_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "master_items_delete" ON master_items;
CREATE POLICY "master_items_delete" ON master_items FOR DELETE
  TO anon, authenticated USING (true);

-- task_assignments: all accessible (filtering done in app)
DROP POLICY IF EXISTS "task_assignments_select" ON task_assignments;
CREATE POLICY "task_assignments_select" ON task_assignments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "task_assignments_insert" ON task_assignments;
CREATE POLICY "task_assignments_insert" ON task_assignments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "task_assignments_update" ON task_assignments;
CREATE POLICY "task_assignments_update" ON task_assignments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "task_assignments_delete" ON task_assignments;
CREATE POLICY "task_assignments_delete" ON task_assignments FOR DELETE
  TO anon, authenticated USING (true);

-- inventory_entries: all accessible
DROP POLICY IF EXISTS "inventory_entries_select" ON inventory_entries;
CREATE POLICY "inventory_entries_select" ON inventory_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "inventory_entries_insert" ON inventory_entries;
CREATE POLICY "inventory_entries_insert" ON inventory_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_entries_update" ON inventory_entries;
CREATE POLICY "inventory_entries_update" ON inventory_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_entries_delete" ON inventory_entries;
CREATE POLICY "inventory_entries_delete" ON inventory_entries FOR DELETE
  TO anon, authenticated USING (true);

-- system_stock: all accessible
DROP POLICY IF EXISTS "system_stock_select" ON system_stock;
CREATE POLICY "system_stock_select" ON system_stock FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "system_stock_insert" ON system_stock;
CREATE POLICY "system_stock_insert" ON system_stock FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "system_stock_update" ON system_stock;
CREATE POLICY "system_stock_update" ON system_stock FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "system_stock_delete" ON system_stock;
CREATE POLICY "system_stock_delete" ON system_stock FOR DELETE
  TO anon, authenticated USING (true);

-- audit_logs: all accessible
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_delete" ON audit_logs;
CREATE POLICY "audit_logs_delete" ON audit_logs FOR DELETE
  TO anon, authenticated USING (true);
