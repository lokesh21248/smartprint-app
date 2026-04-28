import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import type { OrderStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatTimeAgo(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function formatDateTime(dateStr: string): string {
  return format(new Date(dateStr), "dd MMM yyyy, hh:mm a");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    DRAFT: "Order Draft",
    PLACED: "New Order",
    ACCEPTED: "Accepted",
    PRINTING: "Printing",
    READY: "Ready for Pickup",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return labels[status] || status;
}

export function getStatusColor(status: OrderStatus): string {
  const colors: Record<OrderStatus, string> = {
    DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
    PLACED: "bg-blue-100 text-blue-700 border-blue-200",
    ACCEPTED: "bg-blue-100 text-blue-700 border-blue-200",
    PRINTING: "bg-orange-100 text-orange-700 border-orange-200",
    READY: "bg-green-100 text-green-700 border-green-200",
    COMPLETED: "bg-gray-100 text-gray-700 border-gray-200",
    CANCELLED: "bg-red-100 text-red-700 border-red-200",
  };
  return colors[status] || "bg-gray-100 text-gray-700 border-gray-200";
}

export function getNextStatus(status: OrderStatus): OrderStatus | null {
  const flow: Partial<Record<OrderStatus, OrderStatus>> = {
    DRAFT: "PLACED",
    PLACED: "ACCEPTED",
    ACCEPTED: "PRINTING",
    PRINTING: "READY",
    READY: "COMPLETED",
  };
  return flow[status] ?? null;
}

export function getNextStatusLabel(status: OrderStatus): string {
  const labels: Partial<Record<OrderStatus, string>> = {
    PLACED: "Accept Order",
    ACCEPTED: "Start Printing",
    PRINTING: "Mark Ready",
    READY: "Mark Completed",
  };
  return labels[status] ?? "";
}

export function getPrintConfigLabel(
  printConfig?: {
    color?: string;
    size?: string;
    copies?: number;
    duplex?: boolean;
    binding?: string;
  } | null
): string {
  if (!printConfig) return "Standard print";

  const color = printConfig.color === "color" ? "Color" : "B/W";
  const size = printConfig.size ?? "A4";
  const copies = printConfig.copies ?? 1;
  const sides = printConfig.duplex ? "Duplex" : "Single-side";
  const binding =
    printConfig.binding && printConfig.binding !== "none"
      ? `${printConfig.binding} binding`
      : "No binding";

  return `${color} · ${size} · ${copies} ${copies > 1 ? "copies" : "copy"} · ${sides} · ${binding}`;
}

export function generateShortToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O, 0, I, 1 to avoid confusion
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function calculateTotal(params: {
  pageCount: number;
  copies: number;
  color: boolean;
  pricePerPageBW: number;
  pricePerPageColor: number;
}): number {
  const { pageCount, copies, color, pricePerPageBW, pricePerPageColor } = params;
  const rate = color ? pricePerPageColor : pricePerPageBW;
  const total = pageCount * copies * rate;
  return Math.round(total * 100) / 100;
}
