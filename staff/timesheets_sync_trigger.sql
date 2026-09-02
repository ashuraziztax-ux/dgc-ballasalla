-- Run once in Supabase SQL Editor
-- When a worker submits hours via the timesheet app, this trigger
-- automatically populates the PM's Hours grid (dgc_staff_hours)
-- by matching staff_name to the name column in dgc_staff.

CREATE OR REPLACE FUNCTION sync_timesheet_to_hours()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  -- Look up staff_id by name (case-insensitive)
  SELECT id INTO v_staff_id
  FROM public.dgc_staff
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.staff_name))
  LIMIT 1;

  IF v_staff_id IS NOT NULL THEN
    INSERT INTO public.dgc_staff_hours (staff_id, work_date, hours)
    VALUES (v_staff_id, NEW.work_date, NEW.hours)
    ON CONFLICT (staff_id, work_date)
    DO UPDATE SET hours = EXCLUDED.hours;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timesheet_sync ON public.dgc_timesheets;

CREATE TRIGGER trg_timesheet_sync
AFTER INSERT OR UPDATE ON public.dgc_timesheets
FOR EACH ROW EXECUTE FUNCTION sync_timesheet_to_hours();
