/*
# Fix gen_salt/crypt "function doesn't exist" error

The pgcrypto extension installs crypt() and gen_salt() in the "extensions" schema,
not "public". The SECURITY DEFINER functions had `SET search_path = public` which
excluded extensions, causing "function gen_salt doesn't exist" at runtime.

This migration recreates all SECURITY DEFINER functions with `search_path = public, extensions`
so crypt() and gen_salt() resolve correctly. It also re-seeds the admin user with
the corrected password hash.
*/

-- Drop and recreate all functions with corrected search_path

DROP FUNCTION IF EXISTS login_user(text, text);
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
SET search_path = public, extensions
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

-- create_staff_user
DROP FUNCTION IF EXISTS create_staff_user(text, text, text, text);
CREATE OR REPLACE FUNCTION create_staff_user(
  p_username text,
  p_password text,
  p_full_name text DEFAULT NULL,
  p_role text DEFAULT 'staff'
)
RETURNS TABLE (success boolean, message text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  existing_count int;
  new_id uuid;
BEGIN
  SELECT count(*) INTO existing_count FROM app_users WHERE username = p_username;
  IF existing_count > 0 THEN
    RETURN QUERY SELECT false, 'اسم المستخدم موجود بالفعل'::text, NULL::uuid;
    RETURN;
  END IF;
  
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

-- update_user_password
DROP FUNCTION IF EXISTS update_user_password(uuid, text);
CREATE OR REPLACE FUNCTION update_user_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- delete_staff_user
DROP FUNCTION IF EXISTS delete_staff_user(uuid);
CREATE OR REPLACE FUNCTION delete_staff_user(p_user_id uuid)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- bulk_upload_master_items (no crypto needed but keep consistent)
DROP FUNCTION IF EXISTS bulk_upload_master_items(jsonb);
CREATE OR REPLACE FUNCTION bulk_upload_master_items(
  p_items jsonb
)
RETURNS TABLE (success boolean, message text, rows_affected bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  
  RETURN QUERY SELECT true, 'تم رفع البيانات بنجاح'::text, jsonb_array_length(p_items)::bigint;
END;
$$;

REVOKE EXECUTE ON FUNCTION bulk_upload_master_items(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bulk_upload_master_items(jsonb) TO anon, authenticated;

-- bulk_assign_tasks (no crypto needed but keep consistent)
DROP FUNCTION IF EXISTS bulk_assign_tasks(uuid, date, text[]);
CREATE OR REPLACE FUNCTION bulk_assign_tasks(
  p_staff_id uuid,
  p_week_start date,
  p_item_codes text[]
)
RETURNS TABLE (success boolean, message text, rows_inserted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- log_audit
DROP FUNCTION IF EXISTS log_audit(uuid, text, text, text);
CREATE OR REPLACE FUNCTION log_audit(
  p_user_id uuid,
  p_username text,
  p_action text,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, username, action, details)
  VALUES (p_user_id, p_username, p_action, p_details);
END;
$$;

REVOKE EXECUTE ON FUNCTION log_audit(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION log_audit(uuid, text, text, text) TO anon, authenticated;

-- Re-seed admin user with correct password hash (in case the original seed failed)
UPDATE app_users
SET password_hash = crypt('admin123', gen_salt('bf'))
WHERE username = 'admin';

-- If admin doesn't exist yet, create it
INSERT INTO app_users (username, password_hash, full_name, role)
SELECT 'admin', crypt('admin123', gen_salt('bf')), 'مدير النظام', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE username = 'admin');
