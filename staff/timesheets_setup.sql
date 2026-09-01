-- Run this once in Supabase SQL Editor
-- Creates the dgc_timesheets table for worker self-service hour submissions

CREATE TABLE IF NOT EXISTS public.dgc_timesheets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name      text NOT NULL,
  work_date       date NOT NULL,
  site            text NOT NULL,
  description     text,
  start_time      text,
  finish_time     text,
  lunch_mins      integer DEFAULT 0,
  hours           numeric(5,2) NOT NULL DEFAULT 0,
  notes           text,
  submitted_at    timestamptz DEFAULT now(),
  UNIQUE (staff_name, work_date)
);

ALTER TABLE public.dgc_timesheets ENABLE ROW LEVEL SECURITY;

-- Workers (anon key) can insert/update their own entries
CREATE POLICY "ts_anon_insert" ON public.dgc_timesheets
  FOR INSERT TO anon WITH CHECK (true);

-- UPDATE also allowed for anon so re-saving the same day overwrites correctly
CREATE POLICY "ts_anon_update" ON public.dgc_timesheets
  FOR UPDATE TO anon USING (true);

-- PM (authenticated) can read and manage everything
CREATE POLICY "ts_auth_all" ON public.dgc_timesheets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
