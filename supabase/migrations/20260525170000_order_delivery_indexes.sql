-- Migration: Add indexes for instant order delivery pipeline
CREATE INDEX IF NOT EXISTS idx_orders_created_at_flat ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id_flat ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_flat ON public.orders(status);
