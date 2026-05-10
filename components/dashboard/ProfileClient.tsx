"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Check, Copy, Edit, Hash, Loader2, Mail, MapPin, Phone, Printer, QrCode, Store, User } from "lucide-react";
import { useShopStore } from "@/stores/shopStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import QRCodeCard from "@/components/QRCodeCard";

// Shop shape returned by getShopByUserId + extra fields fetched in page.tsx
export interface ProfileShop {
  id: string;
  name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  shop_code: string | null;
  slug: string | null;
  is_open: boolean | null;
}

interface Props {
  shop: ProfileShop;
  appUrl: string;
}

export function ProfileClient({ shop: initialShop, appUrl }: Props) {
  // Use the passed prop directly — no Zustand timing dependency
  const [shop, setShopState] = useState(initialShop);
  const setShopStore = useShopStore((s) => s.setShop);
  const { user, isLoaded } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isOpen = !!shop.is_open;
  const shopName = shop.name ?? "";
  const ownerEmail =
    (isLoaded ? user?.emailAddresses[0]?.emailAddress : null) ??
    shop.owner_email ??
    "";
  const fullAddress = [shop.address_line1, shop.city, shop.state, shop.pincode]
    .filter(Boolean)
    .join(", ");

  const shopCode = (shop.shop_code || "").toUpperCase();
  // QR always uses slug — the canonical, URL-safe public identifier.
  const qrUrl = shop.slug?.trim()
    ? `${appUrl}/s/${shop.slug.trim().toLowerCase()}`
    : "";

  const startEdit = () => {
    setForm({
      name: shopName,
      phone: shop.owner_phone ?? "",
      address: shop.address_line1 ?? "",
    });
    setFieldErrors({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFieldErrors({});
  };

  const copyShopCode = async () => {
    try {
      await navigator.clipboard.writeText(shopCode);
      setCopiedCode(true);
      toast.success("Shop code copied");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };


  const printPoster = async () => {
    if (!shop.slug?.trim()) {
      toast.error("Slug not ready — please refresh the page");
      return;
    }

    try {
      toast.loading("Preparing poster...", { id: "print-poster" });
      
      const svg = document.getElementById("shop-qr-svg");
      if (!svg) {
        toast.error("QR Code image not fully loaded yet.", { id: "print-poster" });
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 0, 0, 400, 400);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/png");

        const win = window.open("", "_blank", "width=800,height=900");
        if (!win) {
          toast.error("Please allow popups to print", { id: "print-poster" });
          return;
        }

        const doc = win.document;
        doc.open();
        doc.title = `SmartPrint Poster — ${shopName}`;

      const style = doc.createElement("style");
      style.textContent = `
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:40px;background:#fff}
        .poster{max-width:600px;margin:0 auto;padding:48px;border:4px solid #2E8B57;border-radius:24px;text-align:center}
        .shop-name{font-size:36px;font-weight:700;color:#2E8B57;margin-bottom:6px}
        .address{font-size:15px;color:#666}
        .options{display:flex;gap:24px;justify-content:center;align-items:center;margin:32px 0}
        .label{font-size:13px;font-weight:600;color:#2E8B57;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
        .qr{width:240px;height:240px}
        .or{font-size:18px;font-weight:600;color:#666}
        .code-box{padding:20px 28px;border:3px solid #2E8B57;border-radius:14px;background:#F0FDF4}
        .code{font-size:42px;font-weight:700;color:#2E8B57;letter-spacing:5px;font-family:monospace}
        .cta{font-size:20px;font-weight:600;color:#2E8B57;margin-top:16px}
        .footer{margin-top:28px;font-size:12px;color:#999}
        @media print{body{padding:0}}
      `;
      doc.head.appendChild(style);

      const poster = doc.createElement("div");
      poster.className = "poster";
      poster.innerHTML = `
        <div class="shop-name"></div>
        <div class="address"></div>
        <div class="options">
          <div>
            <div class="label">Scan QR</div>
            <img class="qr" alt="QR" />
          </div>
          <div class="or">OR</div>
          <div>
            <div class="label">Use Code</div>
            <div class="code-box"><div class="code"></div></div>
          </div>
        </div>
        <div class="cta">Scan or enter code to order</div>
        <div class="footer">
          Powered by SmartPrint &copy; ${new Date().getFullYear()}
        </div>
      `;
      poster.querySelector(".shop-name")!.textContent = shopName;
      poster.querySelector(".address")!.textContent = fullAddress;
      poster.querySelector(".code")!.textContent = shopCode;
      (poster.querySelector(".qr") as HTMLImageElement).src = dataUrl;
      doc.body.appendChild(poster);
      doc.close();

      setTimeout(() => {
        win.print();
        toast.success("Ready to print!", { id: "print-poster" });
        setTimeout(() => win.close(), 500);
      }, 500);
    };
    img.src = url;
  } catch (err) {
    console.error(err);
    toast.error("Failed to prepare poster", { id: "print-poster" });
  }
};

  const handleSave = async () => {
    const clientErrors: Record<string, string> = {};
    const nameVal = form.name.trim();
    const phoneVal = form.phone.trim();
    const addressVal = form.address.trim();

    if (!nameVal) {
      clientErrors.name = "Shop name is required";
    } else if (nameVal.length < 2) {
      clientErrors.name = "Shop name must be at least 2 characters";
    }
    if (phoneVal && !/^[6-9]\d{9}$/.test(phoneVal)) {
      clientErrors.phone = "Enter a valid 10-digit Indian mobile number";
    }
    if (addressVal && addressVal.length < 5) {
      clientErrors.address = "Address must be at least 5 characters";
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    const patch: Record<string, string> = {};
    if (nameVal)    patch.name    = nameVal;
    if (phoneVal)   patch.phone   = phoneVal;
    if (addressVal) patch.address = addressVal;

    if (Object.keys(patch).length === 0) {
      toast.info("No changes to save");
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      const res = await fetch("/api/shop/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const resData = await res.json().catch(() => null);

      if (!res.ok) {
        if (resData?.fieldErrors && typeof resData.fieldErrors === "object") {
          setFieldErrors(resData.fieldErrors);
          toast.error("Please fix the highlighted fields");
          return;
        }
        throw new Error(resData?.error ?? "Failed to save. Please try again.");
      }

      // Update local state and Zustand store
      const updated = {
        ...shop,
        ...(patch.name    ? { name: patch.name }            : {}),
        ...(patch.phone   ? { owner_phone: patch.phone }     : {}),
        ...(patch.address ? { address_line1: patch.address } : {}),
      };
      setShopState(updated);
      setShopStore(updated as never);
      setEditing(false);
      toast.success("✅ Profile updated successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage shop info and share your code or QR with customers
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            isOpen ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${isOpen ? "bg-emerald-500" : "bg-gray-400"}`} />
          {isOpen ? "Open" : "Closed"}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" /> Shop Information
              </CardTitle>
              <CardDescription>Basic details customers will see</CardDescription>
            </div>
            {!editing && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Edit className="mr-1 h-4 w-4" /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <Field label="Shop name *" error={fieldErrors.name}>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: "" }));
                    }}
                    placeholder="My Print Shop"
                    aria-invalid={!!fieldErrors.name}
                  />
                </Field>
                <Field label="Phone" error={fieldErrors.phone}>
                  <Input
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value });
                      if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: "" }));
                    }}
                    placeholder="9876543210"
                    inputMode="tel"
                    aria-invalid={!!fieldErrors.phone}
                  />
                </Field>
                <Field label="Address" error={fieldErrors.address}>
                  <Input
                    value={form.address}
                    onChange={(e) => {
                      setForm({ ...form, address: e.target.value });
                      if (fieldErrors.address) setFieldErrors((p) => ({ ...p, address: "" }));
                    }}
                    placeholder="Street, City"
                    aria-invalid={!!fieldErrors.address}
                  />
                </Field>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</> : "Save"}
                  </Button>
                  <Button variant="outline" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <InfoRow icon={<Store className="h-4 w-4" />} label="Shop name" value={shopName} />
                <InfoRow 
                  icon={<User className="h-4 w-4" />} 
                  label="Owner" 
                  value={!isLoaded ? "..." : ((user?.fullName ?? user?.firstName) ?? "—")} 
                />
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={ownerEmail} />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={shop.owner_phone} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={fullAddress} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" /> Shop Code
            </CardTitle>
            <CardDescription>Customers enter this short code to find you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-8 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700">Your code</p>
              <div className="break-all font-mono text-4xl font-bold tracking-[0.25em] text-emerald-700">
                {shopCode || "—"}
              </div>
              <p className="mt-3 text-sm text-emerald-600">Easy to remember, easy to share</p>
            </div>
            <Button onClick={copyShopCode} variant="outline" className="mt-4 w-full" disabled={!shopCode}>
              {copiedCode ? <><Check className="mr-2 h-4 w-4" /> Copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy code</>}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> QR Code
            </CardTitle>
            <CardDescription>Customers scan to open your shop</CardDescription>
          </CardHeader>
          <CardContent>
            <QRCodeCard slug={shop.slug || undefined} shopName={shopName} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50">
        <CardContent className="p-6">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold">
            <Printer className="h-5 w-5" /> Combined Poster
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            Print one poster with both your QR code and shop code. Display it at your counter so customers can pick whichever is easier.
          </p>
          <Button onClick={printPoster} disabled={!qrUrl} className="bg-emerald-600 hover:bg-emerald-700">
            <Printer className="mr-2 h-4 w-4" /> Print poster (QR + code)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="break-words text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}
