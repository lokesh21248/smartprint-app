export type OrderStatus = "DRAFT" | "PLACED" | "ACCEPTED" | "PRINTING" | "READY" | "COMPLETED" | "CANCELLED";

export type UserRole = "owner" | "manager" | "staff";

export interface Shop {
  id: string;
  owner_id: string;
  shop_name: string;
  slug: string;
  shop_code?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
  pricing: {
    bw: number;
    color: number;
    bw_a4?: number;
    color_a4?: number;
    binding_spiral?: number;
    binding_soft?: number;
  };
  timings: Record<string, string>;
  services: string[];
  qr_code_url?: string;
  qr_scan_count?: number;
  code_use_count?: number;
  rating_avg?: number;
  total_reviews?: number;
  total_orders?: number;
  is_approved: boolean;
  is_open: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  updated_by?: string;
  notes?: string;
}

export interface Order {
  id: string;
  short_token: string;
  order_number?: string;
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  customer_phone_verified: boolean;
  file_s3_key: string;
  file_name: string;
  file_size_bytes?: number;
  page_count: number;
  copies: number;
  color: boolean;
  double_sided: boolean;
  notes?: string;
  total_amount: number;
  order_status: OrderStatus;
  status_history: StatusHistoryEntry[];
  placed_at?: string;
  accepted_at?: string;
  printing_at?: string;
  ready_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
  shops?: Shop;
}

export interface PrintConfig {
  color: "bw" | "color";
  size: string;
  copies: number;
  binding: "none" | "spiral" | "soft";
  duplex: boolean;
}

export interface OrderFile {
  name: string;
  size: number;
  pages: number;
  url: string;
}

export interface ShopStaff {
  id: string;
  shop_id: string;
  user_id: string;
  role: UserRole;
  permissions: Record<string, boolean>;
  created_at: string;
  user?: {
    email: string;
    user_metadata: { name?: string };
  };
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_order_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  customer_id: string;
  shop_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface DashboardStats {
  pendingOrders: number;
  ordersToday: number;
  revenueToday: number;
  avgCompletionMins: number;
  activeCustomers: number;
  completedToday: number;
}
