-- Make week_start optional in bulk_assign_tasks and default to today
-- Also remove week_start from the unique constraint so tasks persist regardless of week

-- Drop old function signature
DROP FUNCTION IF EXISTS bulk_assign_tasks(uuid, date, text[]);

-- Recreate with p_week_start defaulting to today
CREATE OR REPLACE FUNCTION bulk_assign_tasks(
  p_staff_id uuid,
  p_item_codes text[],
  p_week_start date DEFAULT CURRENT_DATE
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
  ON CONFLICT (staff_id, item_no) DO NOTHING;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  
  RETURN QUERY SELECT true, 'تم تعيين الأكواد بنجاح'::text, inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION bulk_assign_tasks(uuid, text[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bulk_assign_tasks(uuid, text[], date) TO anon, authenticated;

-- Drop the old unique constraint that includes week_start
ALTER TABLE task_assignments DROP CONSTRAINT IF EXISTS task_assignments_staff_id_week_start_item_no_key;

-- Add new unique constraint without week_start
ALTER TABLE task_assignments ADD CONSTRAINT task_assignments_staff_id_item_no_key UNIQUE (staff_id, item_no);
