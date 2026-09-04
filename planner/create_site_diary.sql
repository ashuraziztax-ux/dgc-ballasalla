-- DGC Site Diary table
-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.dgc_site_diary (
  id          uuid      DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  diary_date  date      NOT NULL DEFAULT CURRENT_DATE,
  site        text      NOT NULL,
  author      text,
  weather     text,
  plant       text,
  workers     text,
  work_done   text      NOT NULL,
  issues      text,
  visitors    text,
  notes       text
);

ALTER TABLE public.dgc_site_diary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Diary: auth read"   ON public.dgc_site_diary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Diary: auth insert" ON public.dgc_site_diary FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Diary: auth update" ON public.dgc_site_diary FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Diary: auth delete" ON public.dgc_site_diary FOR DELETE TO authenticated USING (true);

-- Confirm
SELECT 'dgc_site_diary created' AS status, count(*) FROM public.dgc_site_diary;
