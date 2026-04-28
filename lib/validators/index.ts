import { z } from "zod";

// ─── Auth ────────────────────────────────────────────────────────────────────

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
  newStatus: z.enum([
    "DRAFT",
    "PLACED",
    "ACCEPTED",
    "PRINTING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ]),
  rejectionReason: z.string().optional(),
});
export type OrderStatusUpdateInput = z.infer<typeof OrderStatusUpdateSchema>;

// ─── Shop Profile ─────────────────────────────────────────────────────────────

export const ShopProfileSchema = z.object({
  name: z.string().min(2, "Shop name must be at least 2 characters"),
  address: z.string().min(5),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  owner_email: z.string().email(),
  price_bw_per_page: z.coerce.number().min(0),
  price_color_per_page: z.coerce.number().min(0),
  opening_time: z.string().optional(),
  closing_time: z.string().optional(),
  working_days: z.array(z.string()).optional(),
  services: z.array(z.string()).optional(),
});
export type ShopProfileInput = z.infer<typeof ShopProfileSchema>;

// ─── Staff ────────────────────────────────────────────────────────────────────

export const StaffInviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["manager", "staff"]),
});
export type StaffInviteInput = z.infer<typeof StaffInviteSchema>;
