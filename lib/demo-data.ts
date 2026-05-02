import type {
  Shop,
  Order,
  DashboardStats,
  ShopStaff,
} from "@/types";

// Helper to generate relative timestamps for demo data
const mins = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

// Demo Shop
export const DEMO_SHOP: Shop = {
  id: "demo-shop-001",
  owner_id: "demo-user-001",
  shop_name: "Ravi Xerox & Print",
  slug: "ravi-xerox",
  address: "12, MG Road, Near Bus Stand",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500001",
  phone: "9876543210",
  email: "ravi.xerox@gmail.com",
  pricing: { bw: 200, color: 1000 },
  timings: { mon: "9-21", tue: "9-21", wed: "9-21", thu: "9-21", fri: "9-21", sat: "9-21", sun: "closed" },
  services: [],
  is_approved: true,
  is_open: true,
  is_active: true,
  created_at: "2025-01-15T09:00:00Z",
  updated_at: new Date().toISOString(),
};

// Demo Orders
export const DEMO_ORDERS: Order[] = [
  {
    id: "ord-001",
    short_token: "XYZ98765",
    shop_id: DEMO_SHOP.id,
    customer_name: "Priya Sharma",
    customer_phone: "9876501234",
    customer_phone_verified: false,
    file_s3_key: "demo/Resume_2026.pdf",
    file_name: "Resume_2026.pdf",
    page_count: 3,
    copies: 5,
    color: true,
    double_sided: false,
    total_amount: 750,
    order_status: "PLACED",
    status_history: [{ status: "PLACED", at: mins(8), actor: "customer" }],
    created_at: mins(8),
    updated_at: mins(8),
  },
  {
    id: "ord-003",
    short_token: "ROH45678",
    shop_id: DEMO_SHOP.id,
    customer_name: "Rohan Mehta",
    customer_phone: "9988776655",
    customer_phone_verified: true,
    file_s3_key: "demo/Project_Report.pdf",
    file_name: "Project_Report.pdf",
    page_count: 52,
    copies: 1,
    color: false,
    double_sided: true,
    total_amount: 102,
    order_status: "ACCEPTED",
    status_history: [
      { status: "PLACED", at: mins(45), actor: "customer" },
      { status: "ACCEPTED", at: mins(40), actor: "system" },
    ],
    created_at: mins(45),
    updated_at: mins(40),
  },
  {
    id: "ord-004",
    short_token: "ANA32109",
    shop_id: DEMO_SHOP.id,
    customer_name: "Ananya Singh",
    customer_phone: "9654321987",
    customer_phone_verified: true,
    file_s3_key: "demo/Slides_Presentation.pdf",
    file_name: "Slides_Presentation.pdf",
    page_count: 30,
    copies: 3,
    color: true,
    double_sided: false,
    notes: "Urgent: Needed by 2 PM",
    total_amount: 900,
    order_status: "PRINTING",
    status_history: [
      { status: "PLACED", at: mins(90), actor: "customer" },
      { status: "ACCEPTED", at: mins(85), actor: "system" },
      { status: "PRINTING", at: mins(20), actor: "system" },
    ],
    created_at: mins(90),
    updated_at: mins(20),
  },
  {
    id: "ord-005",
    short_token: "NXW4Z1",
    shop_id: DEMO_SHOP.id,
    customer_name: "Srinivas Rao",
    customer_phone: "9700000001",
    customer_phone_verified: true,
    file_s3_key: "demo/Notice_Board.pdf",
    file_name: "Notice_Board.pdf",
    page_count: 4,
    copies: 10,
    color: false,
    double_sided: false,
    total_amount: 160,
    order_status: "READY",
    status_history: [
      { status: "PLACED", at: mins(180), actor: "customer" },
      { status: "ACCEPTED", at: mins(170), actor: "system" },
      { status: "PRINTING", at: mins(100), actor: "system" },
      { status: "READY", at: mins(30), actor: "system" },
    ],
    created_at: mins(180),
    updated_at: mins(30),
  },
];

// Demo Stats
export const DEMO_STATS: DashboardStats = {
  pendingOrders: 2,
  ordersToday: 14,
  revenueToday: 3840,
  avgCompletionMins: 28,
  activeCustomers: 9,
  completedToday: 11,
};

// Demo Staff
export const DEMO_STAFF: ShopStaff[] = [
  {
    id: "staff-001",
    shop_id: "demo-shop-001",
    user_id: "demo-user-001",
    role: "owner",
    permissions: { all: true },
    created_at: "2025-01-15T09:00:00Z",
    user: { email: "owner@demo.com", user_metadata: { name: "Ravi Kumar" } },
  },
  {
    id: "staff-002",
    shop_id: "demo-shop-001",
    user_id: "demo-user-002",
    role: "manager",
    permissions: { manage_orders: true, view_analytics: true },
    created_at: "2025-03-01T10:00:00Z",
    user: { email: "manager@demo.com", user_metadata: { name: "Suresh Babu" } },
  },
  {
    id: "staff-003",
    shop_id: "demo-shop-001",
    user_id: "demo-user-003",
    role: "staff",
    permissions: { manage_orders: true },
    created_at: "2025-04-01T10:00:00Z",
    user: { email: "staff@demo.com", user_metadata: { name: "Lakshmi Devi" } },
  },
];

// Analytics Demo Data
export const DEMO_ANALYTICS = {
  revenue: [
    { date: "Apr 19", revenue: 2100, orders: 8 },
    { date: "Apr 20", revenue: 3400, orders: 14 },
    { date: "Apr 21", revenue: 1800, orders: 7 },
    { date: "Apr 22", revenue: 4200, orders: 18 },
    { date: "Apr 23", revenue: 2900, orders: 11 },
    { date: "Apr 24", revenue: 3800, orders: 15 },
    { date: "Apr 25", revenue: 3840, orders: 14 },
  ],
  statusBreakdown: [
    { name: "Completed", value: 78, color: "#10B981" },
    { name: "Cancelled", value: 8, color: "#EF4444" },
    { name: "Rejected", value: 4, color: "#F59E0B" },
    { name: "Active", value: 10, color: "#2E8B57" },
  ],
  peakHours: [
    { hour: "9 AM", orders: 3 }, { hour: "10 AM", orders: 7 },
    { hour: "11 AM", orders: 12 }, { hour: "12 PM", orders: 9 },
    { hour: "1 PM", orders: 5 }, { hour: "2 PM", orders: 11 },
    { hour: "3 PM", orders: 14 }, { hour: "4 PM", orders: 10 },
    { hour: "5 PM", orders: 8 }, { hour: "6 PM", orders: 6 },
    { hour: "7 PM", orders: 4 }, { hour: "8 PM", orders: 2 },
  ],
  services: [
    { name: "B&W A4", count: 124 }, { name: "Color A4", count: 87 },
    { name: "B&W A3", count: 34 }, { name: "Color A3", count: 22 },
    { name: "Binding", count: 45 }, { name: "Scanning", count: 18 },
  ],
};