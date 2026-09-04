-- DGC Payroll Approval table
-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.dgc_payroll_approval (
  id           uuid      DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start date      NOT NULL UNIQUE,  -- the Saturday that starts the fortnight
  approved_at  timestamptz DEFAULT now(),
  approved_by  text
);

ALTER TABLE public.dgc_payroll_approval ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approval: auth read"   ON public.dgc_payroll_approval FOR SELECT TO authenticated USING (true);
CREATE POLICY "Approval: auth insert" ON public.dgc_payroll_approval FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Approval: auth delete" ON public.dgc_payroll_approval FOR DELETE TO authenticated USING (true);

-- Confirm
SELECT 'dgc_payroll_approval created' AS status;
