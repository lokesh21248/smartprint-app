-- Fix missing realtime publication for orders table
-- The previous migration (20260709000001_enable_realtime_orders.sql) set publish_via_partition_root
-- but forgot to actually add the orders table to the publication.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
