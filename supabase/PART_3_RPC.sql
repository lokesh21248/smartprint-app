-- ============================================================
-- PART 3: RPC FUNCTIONS, MATERIALIZED VIEWS, CLEANUP JOBS
-- ============================================================

-- 3.1 SUBMIT ORDER (atomic OTP verify + place)
CREATE OR REPLACE FUNCTION submit_order(
  p_order_id UUID,
  p_otp_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_otp RECORD;
  v_active_count INT;
BEGIN
  SELECT * INTO v_otp FROM otp_verifications WHERE id = p_otp_id;
  IF v_otp IS NULL OR NOT v_otp.verified OR v_otp.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired OTP');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF v_order.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not in DRAFT state');
  END IF;
  IF v_order.draft_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order draft expired');
  END IF;
  IF v_order.customer_phone != v_otp.phone THEN
    RETURN jsonb_build_object('success', false, 'error', 'Phone mismatch');
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM orders
  WHERE customer_phone = v_order.customer_phone
    AND status NOT IN ('COMPLETED','CANCELLED');

  IF v_active_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max 3 active orders per phone');
  END IF;

  UPDATE orders
  SET status = 'PLACED', customer_phone_verified = true
  WHERE id = p_order_id;

  INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, payload)
  VALUES ('customer', v_order.customer_phone, 'submit_order', 'order', p_order_id::TEXT,
          jsonb_build_object('order_number', v_order.order_number, 'shop_id', v_order.shop_id));

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'short_token', v_order.short_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.2 UPDATE ORDER STATUS (shop owner action)
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF NOT (owns_shop(v_order.shop_id) OR is_super_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE orders
  SET status = p_new_status,
      cancellation_reason = CASE WHEN p_new_status = 'CANCELLED' THEN p_reason ELSE NULL END
  WHERE id = p_order_id;

  INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, payload)
  VALUES ('shop', clerk_user_id(), 'update_status', 'order', p_order_id::TEXT,
          jsonb_build_object('from', v_order.status, 'to', p_new_status, 'reason', p_reason));

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.3 PUBLIC ORDER LOOKUP BY TOKEN
CREATE OR REPLACE FUNCTION get_order_by_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_shop RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE short_token = p_token;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT name, address_line1, city, owner_phone INTO v_shop FROM shops WHERE id = v_order.shop_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'customer_name', v_order.customer_name,
    'page_count', v_order.page_count,
    'copies', v_order.copies,
    'total_amount', v_order.total_amount,
    'is_color', v_order.is_color,
    'is_double_sided', v_order.is_double_sided,
    'shop_name', v_shop.name,
    'shop_address', v_shop.address_line1 || ', ' || v_shop.city,
    'shop_phone', v_shop.owner_phone,
    'placed_at', v_order.placed_at,
    'ready_at', v_order.ready_at,
    'completed_at', v_order.completed_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.4 FIND SHOP BY CODE
CREATE OR REPLACE FUNCTION find_shop_by_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_shop RECORD;
BEGIN
  SELECT id, name, slug, address_line1, city, is_active, is_open
  INTO v_shop
  FROM shops
  WHERE shop_code = UPPER(p_code) AND is_approved = true;

  IF v_shop IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shop not found');
  END IF;

  IF NOT v_shop.is_active OR NOT v_shop.is_open THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shop unavailable');
  END IF;

  UPDATE shops SET qr_scan_count = qr_scan_count + 1 WHERE id = v_shop.id;

  RETURN jsonb_build_object(
    'success', true,
    'shop_id', v_shop.id,
    'slug', v_shop.slug,
    'name', v_shop.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.5 AUTO-CLEANUP FUNCTIONS
CREATE OR REPLACE FUNCTION auto_expire_drafts()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    DELETE FROM orders
    WHERE status = 'DRAFT' AND draft_expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  IF v_count > 0 THEN
    INSERT INTO audit_log (actor_type, action, target_type, target_id, payload)
    VALUES ('system', 'auto_expire_drafts', 'orders', 'batch',
            jsonb_build_object('count', v_count));
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_cancel_stale_ready()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH cancelled AS (
    UPDATE orders
    SET status = 'CANCELLED', cancellation_reason = 'Customer no-show after 48h'
    WHERE status = 'READY' AND pickup_deadline < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM cancelled;

  IF v_count > 0 THEN
    INSERT INTO audit_log (actor_type, action, target_type, target_id, payload)
    VALUES ('system', 'auto_cancel_stale', 'orders', 'batch',
            jsonb_build_object('count', v_count));
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH deleted AS (
    DELETE FROM otp_verifications WHERE expires_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH deleted AS (
    DELETE FROM rate_limits WHERE window_end < NOW() - INTERVAL '1 hour'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.6 PARTITION MAINTENANCE
CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS VOID AS $$
DECLARE
  next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '6 months');
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := next_month;
  end_date := start_date + INTERVAL '1 month';
  partition_name := 'orders_' || TO_CHAR(start_date, 'YYYY_MM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

-- 3.7 DAILY SUMMARIES (Materialized View)
DROP MATERIALIZED VIEW IF EXISTS daily_summaries;
CREATE MATERIALIZED VIEW daily_summaries AS
SELECT
  shop_id,
  DATE(created_at) AS date,
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders,
  COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders,
  SUM(page_count * copies) FILTER (WHERE status = 'COMPLETED') AS total_pages_printed,
  SUM(total_amount) FILTER (WHERE status = 'COMPLETED') AS total_revenue_paise,
  AVG(EXTRACT(EPOCH FROM (accepted_at - placed_at))/60) FILTER (WHERE accepted_at IS NOT NULL) AS avg_accept_mins,
  AVG(EXTRACT(EPOCH FROM (ready_at - accepted_at))/60) FILTER (WHERE ready_at IS NOT NULL) AS avg_print_mins
FROM orders
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY shop_id, DATE(created_at);

CREATE UNIQUE INDEX idx_daily_summaries ON daily_summaries(shop_id, date);

CREATE OR REPLACE FUNCTION refresh_daily_summaries()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_summaries;
END;
$$ LANGUAGE plpgsql;

-- 3.8 PERFORMANCE TUNING
ALTER DATABASE postgres SET statement_timeout = '30s';
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';

-- 3.9 ENABLE REALTIME (for shop admin live order alerts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- 3.10 ANALYZE TABLES (for query planner)
ANALYZE shops;
ANALYZE orders;
ANALYZE otp_verifications;
ANALYZE shop_admins;
ANALYZE audit_log;
ANALYZE rate_limits;

-- ✅ PART 3 COMPLETE
SELECT 'Part 3 SUCCESS — functions and views created. SETUP DONE!' AS result;
