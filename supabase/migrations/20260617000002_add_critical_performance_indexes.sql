-- Migration: Add critical performance indexes for orders, notifications, shop_staff, and shop_settings
-- Created: 2026-06-17

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_staff_user_id ON shop_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_settings_shop_id ON shop_settings(shop_id);
