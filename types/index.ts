export type OrderStatus = "DRAFT" | "PLACED" | "ACCEPTED" | "PRINTING" | "READY" | "COMPLETED" | "CANCELLED";

export type UserRole = "owner" | "manager" | "staff";

export interface Shop {
  id: string;
  clerk_owner_id: string;
  name: string;
  slug?: string;
  shop_code?: string;
  owner_name?: string;
  owner_email: string;
  owner_phone: string;
  alternate_phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  price_bw_per_page?: number;
  price_color_per_page?: number;
  price_double_sided_discount_pct?: number;
  shop_photo_url?: string;
  qr_code_url?: string;
  business_hours?: Record<string, unknown>;
  is_approved: boolean;
  is_open?: boolean;
  is_active?: boolean;
  total_orders?: number;
  qr_scan_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp?: string;
  at?: string;
  updated_by?: string;
  actor?: string;
  notes?: string;
}

export interface Order {
  id: string;
  short_token: string;
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
  files?: Array<{
    name: string;
    size: number;
    pages: number;
    url: string;
    copies?: number;
    color?: boolean;
    doubleSided?: boolean;
  }>;
  order_files?: OrderFileRecord[];
  shops?: Shop;
  file_status?: "active" | "expired";
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
  copies?: number;
  color?: boolean;
  doubleSided?: boolean;
}

export interface OrderFileRecord {
  id: string;
  order_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  page_count: number;
  mime_type: string;
  created_at?: string;
  file_status?: "active" | "expired";
}

export type UploadStatus =
  | "idle"
  | "queued"
  | "preparing"
  | "uploading"
  | "paused"
  | "retrying"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type FileSecurityStatus = "pending" | "clean" | "infected" | "failed";

export interface UploadedFile {
  id: string;
  file?: File;
  name: string;
  size: number;
  pages: number | null;
  pdfParseFailed: boolean;
  progress: number;
  status: UploadStatus;
  storagePath?: string;
  uploadedUrl?: string;
  error?: string;
  copies: number;
  color: boolean;
  doubleSided: boolean;
  mimeType?: string;
  retryAttempt?: number;
  retryCount: number;
  securityStatus?: FileSecurityStatus;
  scanStatus?: FileSecurityStatus;
  /** Current upload speed in bytes/sec — populated during "uploading" phase */
  uploadSpeed?: number;
  /** Estimated seconds remaining — populated during "uploading" phase */
  etaSeconds?: number;
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
