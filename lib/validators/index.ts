import { z } from "zod";

// ─── Auth ────────────────────────────────────────────────────────────────────

export const ScanStatusEnum = z.enum(["pending", "scanning", "clean", "infected", "failed"]);
export type ScanStatus = z.infer<typeof ScanStatusEnum>;

export const EmailOtpRequestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
export type EmailOtpRequestInput = z.infer<typeof EmailOtpRequestSchema>;

export const OtpVerifySchema = z.object({
  email: z.string().email(),
  token: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only digits"),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;

export const LoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// ─── Order ───────────────────────────────────────────────────────────────────

export const OrderStatusUpdateSchema = z.object({
  orderId: z.string().uuid(),
  // DRAFT is intentionally excluded — shop owners cannot revert an order to draft.
  // Draft orders are created by the customer flow only.
  newStatus: z.enum(["PLACED", "ACCEPTED", "PRINTING", "READY", "COMPLETED", "CANCELLED"]),
  rejectionReason: z.string().max(500).optional(),
});
export type OrderStatusUpdateInput = z.infer<typeof OrderStatusUpdateSchema>;

// ─── Shop Profile (full — used by ShopProfileForm / Settings tab) ─────────────

export const ShopProfileSchema = z.object({
  name: z.string().trim().min(2, "Shop name must be at least 2 characters").max(100),
  address: z.string().trim().min(5).max(300),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  owner_email: z.string().email(),
  // Minimum 0.01 — prevents free pricing that would create zero-amount orders
  price_bw_per_page: z.coerce.number().min(0.01, "B&W price must be at least ₹0.01"),
  price_color_per_page: z.coerce.number().min(0.01, "Color price must be at least ₹0.01"),
  opening_time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional(),
  closing_time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional(),
  working_days: z.array(z.string()).max(7).optional(),
  services: z.array(z.string()).max(20).optional(),
});
export type ShopProfileInput = z.infer<typeof ShopProfileSchema>;

// ─── Shop Profile Patch (partial — used by Profile page mini-form) ────────────
// Each field is optional so the caller only sends what changed.
// When present, the same business rules apply.
export const ShopProfilePatchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters")
    .max(100)
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number")
    .optional(),
  address: z
    .string()
    .trim()
    .min(5, "Address must be at least 5 characters")
    .max(300)
    .optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
  // path ensures this error is captured in the fieldErrors extraction loop
  // (issues with an empty path[] are silently dropped since path[0] is undefined)
  path: ["_root"],
});
export type ShopProfilePatchInput = z.infer<typeof ShopProfilePatchSchema>;

// ─── Staff ────────────────────────────────────────────────────────────────────

export const StaffInviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["manager", "staff"]),
});
export type StaffInviteInput = z.infer<typeof StaffInviteSchema>;

// ─── Order Create ─────────────────────────────────────────────────────────────

export const OrderCreateSchema = z.object({
  shopId: z.string().uuid("Invalid shopId"),
  // Support for multiple files
  files: z.array(z.object({
    name: z.string().min(1).max(255)
      .refine((n) => !n.includes("..") && !n.includes("/") && !n.includes("\\"), {
        message: "Invalid filename",
      }),
    size: z.coerce.number().int().min(1).max(26_214_400), // 25 MB cap per file
    pages: z.coerce.number().int().min(1).max(2000),
    url: z.string().min(1).max(1000)
      .refine((u) => !u.includes("..") && !u.includes("\0"), {
        message: "Invalid file path",
      }),
    copies: z.coerce.number().int().min(1).max(50).optional().default(1),
    color: z.boolean().optional().default(false),
    doubleSided: z.boolean().optional().default(false),
    mimeType: z.string().optional(),
    scanStatus: ScanStatusEnum.optional().default("pending"),
  })).min(1, "At least one file is required").optional(),
  // Legacy single-file fields (optional for backward compatibility)
  filePath: z.string().trim().min(1)
    .refine((p) => !p.includes("..") && !p.includes("\0"), {
      message: "Invalid file path",
    })
    .optional(),
  fileName: z.string().trim().min(1).max(255)
    .refine((n) => !n.includes("..") && !n.includes("/") && !n.includes("\\"), {
      message: "Invalid filename",
    })
    .optional(),
  pageCount: z.coerce.number().int().min(1).max(2000),
  copies: z.coerce.number().int().min(1).max(50),
  color: z.boolean().optional().default(false),
  doubleSided: z.boolean().optional().default(false),
  notes: z.string().max(500).optional(),
  customerName: z.string().trim().min(1, "Customer name is required").max(100),
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number"),
  fileSize: z.coerce.number().int().min(1).max(26_214_400).optional(),
});
export type OrderCreateInput = z.infer<typeof OrderCreateSchema>;

