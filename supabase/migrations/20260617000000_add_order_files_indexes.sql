-- Migration: Add indexes for order_files to optimize dashboard load and preview download signed URL query performance.
CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files(order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_storage_path ON order_files(storage_path);
