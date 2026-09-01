-- Run this ONCE in Supabase SQL Editor
-- Step 1: Add current_driver column to vehicles table
ALTER TABLE public.dgc_vehicles ADD COLUMN IF NOT EXISTS current_driver text;

-- Step 2: Remove duplicate fill-up records
-- Keeps one entry per vehicle + date + cost (the first physically stored row)
DELETE FROM public.dgc_fuel_fillups
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM public.dgc_fuel_fillups
  GROUP BY vehicle_id, fill_date, ROUND(cost::numeric, 2)
);

-- Step 3: Pre-set drivers from the petrol card list (adjust names as needed)
UPDATE public.dgc_vehicles SET current_driver = 'Brad'      WHERE card_number = '4448603283';
UPDATE public.dgc_vehicles SET current_driver = 'Ste Lamb'  WHERE card_number = '4448603387';
UPDATE public.dgc_vehicles SET current_driver = 'Cossie'    WHERE card_number = '4448603388';
UPDATE public.dgc_vehicles SET current_driver = 'Lee'       WHERE card_number = '4448603391';
-- Cards 4448603384, 4448603385, 4448603386, 4448603389, 4448603390
-- have multiple or unnamed drivers — set these manually in the app after this runs
