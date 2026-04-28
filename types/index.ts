export type OrderStatus = "DRAFT" | "PLACED" | "ACCEPTED" | "PRINTING" | "READY" | "COMPLETED" | "CANCELLED";

export type UserRole = "owner" | "manager" | "staff";

export interface Shop {
  id: string;
  name: string;
  slug: string;
  owner_id: string;                 // Clerk User ID (TEXT)
  owner_email: string;
  phone: string;
  address: string;
  lat?: number;
  lng?: number;
  price_bw_per_page: number;
  price_color_per_page: number;
  opening_time?: string;
  closing_time?: string;
  working_days?: string[];
  services?: string[];
  is_approved: boolean;
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  short_token: string;
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  customer_phone_verified: boolean;
  file_s3_key: string;
  file_name?: string;
  page_count: number;
  copies: number;
  color: boolean;
  double_sided: boolean;
  notes?: string;
  total_amount: number;
  order_status: OrderStatus;
  status_history: Array<{
    status: OrderStatus;
    at: string;
    actor?: string;
  }>;
  created_at: string;
  updated_at: string;
  shops?: Shop;                      // Relation
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
