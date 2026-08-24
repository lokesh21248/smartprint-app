-- ============================================================
-- Fix: Add missing FK constraint on order_files(order_id) → orders(id)
-- PostgREST uses FK constraints to resolve embedded join syntax:
--   order_files(id, scan_status, infected) inside an orders SELECT
-- Without this FK, PostgREST returns PGRST200 "no relationship found".
-- ============================================================

ALTER TABLE public.order_files
  ADD CONSTRAINT fk_order_files_order_id
  FOREIGN KEY (order_id)
  REFERENCES public.orders(id)
  ON DELETE CASCADE;
